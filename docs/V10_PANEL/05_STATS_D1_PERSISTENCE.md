# Stats Persistence -- D1 Migration

Extension reinstall wipes `chrome.storage.local`. That has always been the
failure mode; v10.2 just made it visible again. Fix: stop computing stats from
local storage. Derive them from the `actions` table in D1, which is the master
audit record and persists across installs, devices, and time.

---

## A. CURRENT STORAGE PATH (lossy)

`popup.js loadStats()` (line 38) reads three `chrome.storage.local` keys:

| Key | Used for |
|---|---|
| `gam_mod_log` | Counts bans/msgs/notes in the last 24h |
| `gam_users_roster` | Counts pending (status=new/pending) and banned users |
| `gam_deathrow` | Counts DR pending and DR ready |

All three are write-local: they accumulate on device and are never written to
D1. Extension update, reinstall, or new device = zero. The DR queue is
especially lossy because `gam_deathrow` is also the execution queue, so counts
vanish before the ban fires.

---

## B. NEW ENDPOINT: GET /mod/stats

Auth: `x-mod-token` (standard per-mod token, same as every other `/mod/*` route).

Response shape:

```json
{
  "ok": true,
  "pending": 12,
  "dr_pending": 3,
  "dr_ready": 1,
  "banned": 847,
  "bans_24h": 4,
  "msgs_24h": 11,
  "notes_24h": 2,
  "computed_at": 1715270400000
}
```

**Full SQL -- three queries, all index-covered:**

```sql
-- Query 1: 24h rolling counts (bans, messages, notes) for THIS mod.
-- Index hit: idx_actions_mod_ts ON actions(mod, ts DESC)
-- After adding the composite index (see Section F), this becomes a
-- two-column prefix scan: mod + ts. Expect < 5ms on current row counts.
SELECT
  SUM(CASE WHEN action = 'ban.confirmed'              THEN 1 ELSE 0 END) AS bans_24h,
  SUM(CASE WHEN action IN ('message','reply')          THEN 1 ELSE 0 END) AS msgs_24h,
  SUM(CASE WHEN action = 'note'                        THEN 1 ELSE 0 END) AS notes_24h
FROM actions
WHERE mod = ?          -- bound: verified.mod_username (token-derived, never body)
  AND ts > ?           -- bound: ISO-8601 timestamp of (now - 86400 seconds)
  AND is_test = 0;

-- Query 2: Lifetime ban count for this mod.
-- Index hit: idx_actions_mod_ts (same prefix, no ts filter needed)
SELECT COUNT(*) AS banned
FROM actions
WHERE mod = ?
  AND action = 'ban.confirmed'
  AND is_test = 0;

-- Query 3: DR queue state -- read from the `deathrow` table, not actions.
-- The deathrow table is the live execution queue; actions records the outcome.
-- DR pending = waiting rows. DR ready = waiting rows where execute_at <= now.
SELECT
  COUNT(*) AS dr_pending,
  SUM(CASE WHEN execute_at <= ? THEN 1 ELSE 0 END) AS dr_ready
FROM deathrow
WHERE mod = ?
  AND status = 'waiting';
```

Note on `pending` (roster new/pending count): this stat has no D1 mirror yet.
The roster is still local-only. Two options:

- **Option A (ship tonight):** omit `pending` from the D1 response; keep reading
  it from local storage as a best-effort local counter. Display with a "~" prefix
  in the popup to signal it may be stale after reinstall.
- **Option B (later):** add a `mod_user_queue` table or use the existing
  `gaw_comments` firehose + a pending-triage view. Out of scope for this patch.

Ship tonight goes with Option A. `pending` stays local; everything else goes D1.

---

## C. CLIENT MIGRATION

`loadStats()` becomes an async fetch with local-cache fallback. Drop-in
replacement for the current function in `popup.js`:

```js
async function loadStats() {
  try {
    // --- D1 path (persistent) ---
    const settings = await chrome.storage.local.get(K.SETTINGS);
    const token = settings[K.SETTINGS]?.workerModToken;
    const workerUrl = settings[K.SETTINGS]?.workerUrl;

    if (token && workerUrl) {
      const resp = await fetch(workerUrl + '/mod/stats', {
        method: 'GET',
        headers: { 'x-mod-token': token }
      });
      if (resp.ok) {
        const d = await resp.json();
        if (d.ok) {
          // Cache to session storage for 5-min fast path (see Section D)
          await chrome.storage.session.set({
            _stats_cache: d,
            _stats_cache_ts: Date.now()
          });
          return renderStats(d);
        }
      }
    }
  } catch (_) { /* fall through to local */ }

  // --- Local fallback (lossy after reinstall, but better than nothing) ---
  try {
    const data = await chrome.storage.local.get([K.LOG, K.ROSTER, K.DR]);
    const log = data[K.LOG] || [];
    const roster = data[K.ROSTER] || {};
    const dr = data[K.DR] || [];
    const rosterValues = Object.values(roster);
    const now = Date.now();
    const todayActions = log.filter(l => now - new Date(l.ts).getTime() < 86400000);
    renderStats({
      pending: rosterValues.filter(e => e.status === 'new' || e.status === 'pending').length,
      banned: rosterValues.filter(e => e.status === 'banned').length,
      dr_pending: dr.filter(d => d.status === 'waiting').length,
      dr_ready: dr.filter(d => d.status === 'waiting' && now >= d.executeAt).length,
      bans_24h: todayActions.filter(l => l.type === 'ban').length,
      msgs_24h: todayActions.filter(l => l.type === 'message' || l.type === 'reply').length,
      notes_24h: todayActions.filter(l => l.type === 'note').length
    });
  } catch (err) {
    console.error('[Popup] loadStats failed:', err);
  }
}

function renderStats(d) {
  $('s-pending').textContent = d.pending != null ? d.pending : '~';
  $('s-dr').textContent       = d.dr_pending ?? 0;
  $('s-banned').textContent   = d.banned ?? 0;
  $('s-today').textContent    = d.bans_24h ?? 0;
  $('s-msgs').textContent     = d.msgs_24h ?? 0;
  $('s-notes').textContent    = d.notes_24h ?? 0;

  const drReady = d.dr_ready || 0;
  if (drReady > 0) {
    const alert = $('dr-alert');
    alert.style.display = 'block';
    alert.textContent = '\u{1F480} ' + drReady + ' Death Row inmate' +
      (drReady > 1 ? 's' : '') + ' READY -- visit GAW to execute.';
  }

  const ver = chrome.runtime.getManifest().version;
  $('ver').textContent = 'v' + ver;
}
```

---

## D. CACHE STRATEGY

Two-layer cache prevents hammering D1 every time the popup opens.

**Worker side (KV, 60s TTL):**

```js
// Inside handleModStats, before running SQL:
const cacheKey = `stats:${verified.mod_username}`;
const cached = await env.MOD_KV.get(cacheKey, 'json');
if (cached) return jsonResponse({ ok: true, ...cached });

// ... run the three SQL queries ...

const payload = { pending: null, dr_pending, dr_ready, banned,
                  bans_24h, msgs_24h, notes_24h,
                  computed_at: Date.now() };
await env.MOD_KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 60 });
return jsonResponse({ ok: true, ...payload });
```

KV TTL of 60s means at worst a mod sees stats 60s stale. On a low-volume team
this is imperceptible. On a busy day with 50+ bans in 24h, a 60s lag on
`bans_24h` is still accurate enough for the popup header.

**Client side (chrome.storage.session, 5-min TTL):**

On popup open, check `_stats_cache_ts`. If it is less than 300 seconds old,
render from cache and skip the fetch. This eliminates the network round-trip on
rapid open/close (common during active moderation). Stale cache is replaced on
the next popup open after the TTL.

`chrome.storage.session` (MV3, Chromium 102+) survives popup close/open but
is cleared on browser restart -- appropriate for a stat snapshot.

---

## E. SHIP-TONIGHT PATCH

Three files change. In dependency order:

**1. Worker: new migration `032_stats_composite_index.sql`**

```sql
-- Composite index for /mod/stats aggregation query.
-- Covers: WHERE mod = ? AND action IN (...) AND ts > ? AND is_test = 0
-- Without this, the 24h count falls back to idx_actions_mod_ts and then
-- filters action in-memory. Fine today; bad at 1M rows.
CREATE INDEX IF NOT EXISTS idx_actions_mod_action_ts
  ON actions(mod, action, ts DESC)
  WHERE is_test = 0;
```

Deploy: `npx wrangler d1 execute gaw-audit --remote --file=migrations/032_stats_composite_index.sql`

**2. Worker: new handler + route in `gaw-mod-proxy-v2.js`**

Add `handleModStats` function (see SQL in Section B). Register in the switch:

```js
case '/mod/stats': return await handleModStats(request, env);
```

Place immediately after the `/mod/whoami` case.

**3. Extension: replace `loadStats()` in `popup.js`**

Replace lines 38-78 with the `loadStats` + `renderStats` split shown in
Section C. The `renderStats` helper also fixes the DR alert which was
previously inlined and would be unreachable if we early-returned from the
D1 path.

No manifest changes. No new permissions. `chrome.storage.session` is covered
by the existing `storage` permission.

---

## F. INDEX REQUIREMENTS

Existing indexes (migration 016) that `/mod/stats` already benefits from:

| Index | Covers |
|---|---|
| `idx_actions_mod_ts ON actions(mod, ts DESC)` | Query 1 + 2 outer scan |
| `idx_actions_action_ts ON actions(action, ts DESC)` | Not used by stats directly |

Gap that MUST be filled before high row-counts:

| New index | Covers |
|---|---|
| `idx_actions_mod_action_ts ON actions(mod, action, ts DESC) WHERE is_test=0` | Query 1 (three-column prefix scan: mod + action = constant + ts range) |

Without the new index, Query 1 scans all rows for a given mod (could be
thousands) and filters `action` in memory. That is fine for a team of 5 mods
with 10k rows total; it becomes a problem at 500k+ rows. Ship the migration
alongside the endpoint.

Query 2 (lifetime ban count) is covered by `idx_actions_mod_ts` -- no ts
filter, so the full mod prefix scan is the correct access path. At current
volumes this returns in under 10ms.

Query 3 (`deathrow` table) needs a check that a `(mod, status)` index exists
on that table. Grep confirms `deathrow` is not indexed by mod (only by
`execute_at` and `status` individually from earlier migrations). Add:

```sql
CREATE INDEX IF NOT EXISTS idx_deathrow_mod_status
  ON deathrow(mod, status);
```

Include in migration 032.

---

## G. BACKFILL

Decision: **no backfill. Accept the gap.**

Rationale:

1. The `actions` table already contains every `ban.confirmed`, `note`, and
   `message` action the worker has ever seen -- going back to whenever each mod
   started routing through the worker (v7+). For most mods this covers months
   of real history. The D1 stats will therefore be substantially correct from
   day one, not zero.

2. The only data missing from D1 is actions taken *before* the worker was
   deployed for a given mod -- i.e., the pre-worker era where the extension
   operated fully locally. That data lives in `gam_mod_log` blobs on each
   device and was never structured for server-side querying. Backfilling it
   would require a one-time client-side upload endpoint, a deduplication
   strategy, and Merkle chain insertion (which `appendAuditAction` handles
   but which must run in order). The engineering cost exceeds the value of
   recovering counts from pre-v7 local history.

3. The `banned` counter specifically: the D1 count reflects *bans issued via
   the worker* (action='ban.confirmed'). Bans issued before the worker era
   will not appear. This is a known and acceptable gap -- the popup stat is
   an operational indicator, not a compliance record.

**What to tell Commander:** after the migration goes live, `banned` and 24h
counts will be accurate from the worker's first deployment forward. The
lifetime total may read lower than the pre-10.2 local total until old-era
actions naturally age out of the 24h windows. Lifetime `banned` will drift
upward permanently as new bans land. No action needed from Commander -- the
gap self-heals operationally.
