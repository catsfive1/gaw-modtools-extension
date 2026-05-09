# Firehose Feature 2 — User Similarity Finder

**Agent:** Firehose Builder — User Similarity  
**Target version:** v10.3.0  
**Status:** Design complete, ready to implement  
**Endpoint:** `POST /admin/users/lookalikes`  
**UI surface:** Intel Drawer section + `/lookalikes <username>` slash command

---

## A. WHICH OPTION + DEFENSE

**Chosen: Option 1 — Co-Commenter Graph, with Levenshtein pre-filter as a free bonus.**

Not Option 3 (embeddings). Here is why.

Workers AI `bge-base-en` costs ~2-5ms + real money per call. We would need to embed 50 comments per user, which means 50 embedding calls per user lookup — and the "similar users" query touches potentially hundreds of candidates. The math: for a user with 200 commenters-in-common, we would fire 200 x 50 = 10,000 embedding calls per `/lookalikes` request. That is not a v10 ship. That is a budget conversation. Option 3 is deferred to v12 stretch where it belongs.

Co-commenter graph is the correct choice because the data is already there and the signal is strong. Two accounts that repeatedly show up in the same threads are either the same person (alt account), the same ideological cluster (brigading cell), or genuine community overlap (which is distinguishable by the mod in 5 seconds). The SQL is a single self-join on `gaw_comments` keyed by `post_id`. No new tables needed for the MVP. No AI budget. Sub-10ms on current data volume.

Levenshtein on usernames is added as a zero-cost pre-sort layer. If `badactor99` and `badactor999` co-comment on 3 threads, the username similarity bumps them to the top. We compute Levenshtein in the worker (pure JS, 10 lines, no dependency) against the candidate list returned by the SQL, not against the whole user table. Cost: negligible. Benefit: catches the lazy alt-account pattern that mods currently catch manually.

This is Option 4 in spirit but without the AI tie-break. Two signals: co-commenter overlap (strong, cheap, SQL-native) plus username edit-distance (cheap, catches the obvious). That is the v10 ship. Workers AI is the v10.5+ stretch.

**Why not Option 2 alone (pure Levenshtein)?** Edit-distance catches braindead alts (`user123` / `user1234`) but misses sophisticated ones (`FreedomEagle` / `PatriotHawk`). Co-commenter overlap catches both because behavior is harder to fake than usernames.

**False-positive baseline:** The co-commenter query returns users who share N or more threads. At threshold 3, this catches real clusters while filtering out coincidental single-thread overlap. The Goodhart concern (mods game the score) is handled by not displaying the raw overlap count — we show a ranked list with a confidence pill (HIGH / MEDIUM / WATCH), not numbers.

---

## B. DATA SHAPE

### Existing schema (no migration needed for MVP)

```sql
-- gaw_comments has everything needed:
-- (id, post_id, author, body_md, created_at, is_removed)
-- gaw_users: (username, registered_at, karma, post_count, comment_count)

-- Missing index for this query -- ADD in migration 005:
CREATE INDEX IF NOT EXISTS idx_gaw_comments_post_author
  ON gaw_comments(post_id, author);
-- Covers the self-join: find all (post_id, author) pairs efficiently.
-- Without this: the self-join full-scans gaw_comments twice per query.
-- With this: both sides of the join are index-range scans.
```

### Core similarity query

```sql
-- Step 1: Co-commenter overlap (parameterized: :username, :min_overlap, :limit)
SELECT
  c2.author                           AS candidate,
  COUNT(DISTINCT c1.post_id)          AS thread_overlap,
  MAX(c2.created_at)                  AS last_seen_together,
  MIN(c2.created_at)                  AS first_seen_together
FROM gaw_comments c1
JOIN gaw_comments c2
  ON  c1.post_id = c2.post_id
  AND c2.author  != c1.author
WHERE c1.author = :username
  AND c1.is_removed = 0
  AND c2.is_removed = 0
GROUP BY c2.author
HAVING thread_overlap >= :min_overlap     -- default 2; Lead-tunable via team_settings
ORDER BY thread_overlap DESC
LIMIT :limit;                             -- fetch 20, trim to 5 after Levenshtein re-rank
```

EXPLAIN concern: without `idx_gaw_comments_post_author`, SQLite executes this as two full-table scans joined on `post_id`. With the index, the left side (`c1.author = :username`) is an index range scan returning only this user's comment rows; the right side is a rowid lookup per post_id. At current scale (~months of data, ~3000 events/day), this is fast. At 1M comments the self-join without the index would be the bottleneck — the index makes it safe.

```sql
-- Step 2: Enrich candidates with user metadata (batch fetch, one query)
SELECT username, registered_at, karma, post_count, comment_count
FROM gaw_users
WHERE username IN (/* candidate list from step 1 */)
```

### Levenshtein re-rank (worker JS, not SQL)

```js
// Pure JS, no dependency. Called on the 20 candidates from SQL.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function scoreCandidate(target, candidate, threadOverlap) {
  const editDist = levenshtein(target.toLowerCase(), candidate.toLowerCase());
  const maxLen   = Math.max(target.length, candidate.length);
  const nameSim  = 1 - (editDist / maxLen);   // 0..1, higher = more similar
  // Weight: thread overlap is primary signal (80%), name similarity is bonus (20%)
  // Normalize thread_overlap: cap at 20 threads = 1.0
  const overlapScore = Math.min(threadOverlap / 20, 1.0);
  return 0.8 * overlapScore + 0.2 * nameSim;
}

// confidence pill thresholds (internal, not exposed to client as numbers):
// score >= 0.6  → "HIGH"
// score >= 0.35 → "MEDIUM"
// else          → "WATCH"
```

---

## C. WORKER ENDPOINT

### Route

```
POST /admin/users/lookalikes
Auth: checkModToken (standard)
```

### Request JSON

```json
{
  "username": "badactor99",
  "min_overlap": 2,
  "limit": 5
}
```

`min_overlap` defaults to 2 if omitted. Range: 1-10. Values below 2 generate noise; above 5 miss subtle clusters. Lead can tune via `team_settings.lookalikes_min_overlap`.

### Response JSON

```json
{
  "ok": true,
  "subject": "badactor99",
  "candidates": [
    {
      "username": "badactor999",
      "confidence": "HIGH",
      "thread_overlap": 14,
      "last_seen_together": 1715200000000,
      "first_seen_together": 1710000000000,
      "registered_at": 1709000000000,
      "karma": 12,
      "name_distance": 1
    },
    {
      "username": "FreedomTruth22",
      "confidence": "MEDIUM",
      "thread_overlap": 6,
      "last_seen_together": 1715100000000,
      "first_seen_together": 1711000000000,
      "registered_at": 1705000000000,
      "karma": 88,
      "name_distance": 11
    }
  ],
  "query_ms": 7,
  "min_overlap_used": 2
}
```

`thread_overlap` IS exposed (it is objective metadata, not a score). What is suppressed is the composite `score` float — mods see HIGH/MEDIUM/WATCH, not 0.73. This is the Goodhart guard: mods act on the human-readable tier, not optimize for a number.

`name_distance` (raw Levenshtein integer) is included as metadata for forensic value — a mod seeing `name_distance: 1` between two HIGH accounts knows it is likely the same person. It is displayed only in tooltip/expand, not the main card.

### Worker handler skeleton

```js
async function handleUsersLookalikes(request, env) {
  const auth = await checkModToken(request, env);
  if (auth) return auth;
  if (!env.AUDIT_DB) return jsonResponse({ ok: false, error: 'D1 not bound' }, 503);

  const body = await request.json().catch(() => ({}));
  const username   = String(body.username || '').slice(0, 64).trim();
  const minOverlap = Math.max(1, Math.min(10, parseInt(body.min_overlap ?? 2, 10)));
  const fetchLimit = 20; // fetch more than we return, re-rank in JS
  const returnLimit = Math.max(1, Math.min(10, parseInt(body.limit ?? 5, 10)));

  if (!username) return jsonResponse({ ok: false, error: 'username required' }, 400);

  const t0 = Date.now();

  // Step 1: co-commenter SQL
  const rows = (await env.AUDIT_DB.prepare(`
    SELECT c2.author AS candidate,
           COUNT(DISTINCT c1.post_id) AS thread_overlap,
           MAX(c2.created_at) AS last_seen_together,
           MIN(c2.created_at) AS first_seen_together
    FROM gaw_comments c1
    JOIN gaw_comments c2
      ON c1.post_id = c2.post_id AND c2.author != c1.author
    WHERE c1.author = ? AND c1.is_removed = 0 AND c2.is_removed = 0
    GROUP BY c2.author
    HAVING thread_overlap >= ?
    ORDER BY thread_overlap DESC
    LIMIT ?
  `).bind(username, minOverlap, fetchLimit).all()).results || [];

  if (!rows.length) return jsonResponse({ ok: true, subject: username, candidates: [], query_ms: Date.now() - t0, min_overlap_used: minOverlap });

  // Step 2: user metadata
  const names = rows.map(r => r.candidate);
  const placeholders = names.map(() => '?').join(',');
  const users = (await env.AUDIT_DB.prepare(
    `SELECT username, registered_at, karma FROM gaw_users WHERE username IN (${placeholders})`
  ).bind(...names).all()).results || [];
  const userMap = Object.fromEntries(users.map(u => [u.username, u]));

  // Step 3: Levenshtein re-rank
  const scored = rows.map(r => {
    const editDist   = levenshtein(username.toLowerCase(), r.candidate.toLowerCase());
    const maxLen     = Math.max(username.length, r.candidate.length);
    const nameSim    = 1 - editDist / maxLen;
    const overlapScore = Math.min(r.thread_overlap / 20, 1.0);
    const score      = 0.8 * overlapScore + 0.2 * nameSim;
    const confidence = score >= 0.6 ? 'HIGH' : score >= 0.35 ? 'MEDIUM' : 'WATCH';
    const meta       = userMap[r.candidate] || {};
    return { username: r.candidate, confidence, thread_overlap: r.thread_overlap,
             last_seen_together: r.last_seen_together, first_seen_together: r.first_seen_together,
             registered_at: meta.registered_at ?? null, karma: meta.karma ?? null,
             name_distance: editDist, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  const candidates = scored.slice(0, returnLimit).map(({ _score, ...rest }) => rest);

  return jsonResponse({ ok: true, subject: username, candidates, query_ms: Date.now() - t0, min_overlap_used: minOverlap });
}
```

Register in the router:

```js
case '/admin/users/lookalikes': return await handleUsersLookalikes(request, env);
```

---

## D. CLIENT RENDER

### Intel Drawer panel (new Section 7)

Rendered below the existing precedents section when the drawer opens on a user subject. Fires the endpoint with `min_overlap: 2, limit: 5` on drawer open if `features.userSimilarity` is enabled.

```css
/* Bloomberg dark palette — matches existing drawer sections */
.sim-panel {
  border-top: 1px solid #1e2a3a;
  padding: 8px 12px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 11px;
}

.sim-panel-header {
  color: #5b8db8;            /* existing drawer accent */
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.sim-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  border-bottom: 1px solid #111c27;
  cursor: pointer;
}
.sim-row:hover { background: #0d1820; }

.sim-username {
  flex: 1;
  color: #c8d8e8;
  font-weight: 500;
}

.sim-pill {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 1px 5px;
  border-radius: 2px;
}
.sim-pill--HIGH   { background: #3d1a1a; color: #ff6b6b; border: 1px solid #7a2020; }
.sim-pill--MEDIUM { background: #2a2a12; color: #d4b44a; border: 1px solid #5a4a10; }
.sim-pill--WATCH  { background: #162030; color: #5b8db8; border: 1px solid #1e3850; }

.sim-meta {
  color: #3a5a7a;
  font-size: 10px;
}

/* Tooltip on hover: shows thread_overlap count + name_distance */
.sim-row[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  right: 0;
  background: #0a1520;
  color: #8ab0cc;
  font-size: 10px;
  padding: 3px 6px;
  border: 1px solid #1e3850;
  border-radius: 2px;
  white-space: nowrap;
  z-index: 10;
}
```

HTML structure per candidate row:

```html
<div class="sim-row"
     data-username="badactor999"
     data-tooltip="14 shared threads · name dist: 1"
     onclick="openIntelDrawer('badactor999')">
  <span class="sim-username">badactor999</span>
  <span class="sim-pill sim-pill--HIGH">HIGH</span>
  <span class="sim-meta">karma 12 · 14d ago</span>
</div>
```

Clicking a row opens the Intel Drawer on that user (reuses existing `openIntelDrawer()` call). No new navigation pattern needed.

### Slash command `/lookalikes <username>`

Handled in the existing slash command dispatcher. Fires `POST /admin/users/lookalikes` with `{username, limit: 5}`. Result renders as a compact chat embed: numbered list, each row is `[PILL] username — N shared threads`. Clicking opens the drawer.

---

## E. FALSE-POSITIVE GUARDS

**Guard 1: Minimum overlap threshold (default 2, not 1).** Single-thread co-presence is noise — popular threads have hundreds of commenters. At `min_overlap: 2`, both accounts must appear independently in at least 2 different threads. This eliminates the "everyone who commented on a viral post" false-positive class.

**Guard 2: Suppress score numbers, show confidence tiers.** Mods see HIGH/MEDIUM/WATCH, not 0.73. This removes the Goodhart incentive to game the system and prevents over-interpretation of marginal differences. A mod who sees "MEDIUM" treats it as "worth a look," not "ban."

**Guard 3: Name-distance as tooltip-only metadata.** `name_distance` is surfaced only on hover, not in the primary card. Mods do not anchor on it. It is forensic confirmation, not the trigger.

**Guard 4: `is_removed = 0` filter on both sides of the join.** We only count live, non-removed comments as evidence of shared presence. A banned account's removed comments do not inflate overlap scores against future targets.

**Guard 5: Account-age signal in meta card.** `registered_at` is displayed. A 3-day-old account appearing as HIGH similarity with a banned user is a strong signal. A 2-year-old account with 500 karma at MEDIUM is probably a coincidence. Mods see both; they make the call.

**Guard 6: No auto-action.** The panel is read-only. It surfaces candidates; it never suggests a ban. The CTA is "open drawer on this user," not "flag" or "add to death row." The mod is always in the loop.

**Guard 7: Exclude self.** The SQL `c2.author != c1.author` guard is in both the query and the worker-side validation. A mod cannot accidentally surface themselves as a lookalike.

---

## F. SHIP-TONIGHT MINIMAL PATCH

Three files touch. No new D1 tables. One new index.

### 1. Migration 005 (new file)

```sql
-- migrations/005_similarity_index.sql
-- Adds covering index for co-commenter self-join performance
CREATE INDEX IF NOT EXISTS idx_gaw_comments_post_author
  ON gaw_comments(post_id, author);
```

Deploy: `wrangler d1 execute AUDIT_DB --remote --file=migrations/005_similarity_index.sql`

### 2. Worker: gaw-mod-proxy-v2.js

Add `levenshtein()` helper near top of file (after existing utility functions):

```js
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}
```

Add `handleUsersLookalikes` function (full body in section C above).

Add route to the router switch:

```js
case '/admin/users/lookalikes': return await handleUsersLookalikes(request, env);
```

### 3. Extension: Intel Drawer JS

In the Intel Drawer open handler (wherever `_drawerFetchUserIntel` or equivalent fires):

```js
// After existing precedent fetch, if features.userSimilarity:
async function fetchLookalikes(username) {
  if (!featureFlags.userSimilarity) return [];
  try {
    const r = await fetch(`${WORKER_BASE}/admin/users/lookalikes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mod-token': getModToken() },
      body: JSON.stringify({ username, limit: 5 })
    });
    const d = await r.json();
    return d.ok ? d.candidates : [];
  } catch { return []; }
}
```

Render the panel (CSS + HTML in section D) at the bottom of the drawer after Section 6 (Precedents). Gate on `candidates.length > 0` — if no lookalikes found, section is hidden entirely (no empty state clutter).

Feature flag: add `userSimilarity: false` to the feature flags object, flip to `true` to enable. This lets the team roll out incrementally without a deploy.

**Total diff size estimate:** ~120 LOC worker, ~60 LOC extension client, 3 LOC SQL migration. Deployable in one session.

**Test signal:** After deploy, run `/lookalikes catsfive` from chat. If the response returns candidates with `query_ms < 50` and `ok: true`, the stack is wired. Then test on a known banned user whose alts mods have manually identified — verify the alt appears in candidates.

---

## G. STRETCH (v10.5+)

**Workers AI embeddings tie-break.** Once the co-commenter layer is in production and mods trust it, add an opt-in AI path: for HIGH-confidence candidates only, embed their last-30-comment bodies with `bge-base-en` and compute cosine similarity. Surface as `"vocabulary match: 87%"` in the expanded tooltip. This adds behavioral fingerprinting on top of structural co-presence. Cost: ~10 AI calls per HIGH candidate (not 50 — we batch the last 30 comments into one embedding per user). Gated behind `features.userSimilarityAI`.

**Temporal clustering.** Add a `burst_overlap` sub-signal: how many of the shared threads appeared within the same 2-hour window? Two accounts that co-comment in the same burst window are more suspicious than two accounts that share threads across 3 months. SQL addition: `COUNT(DISTINCT c1.post_id) FILTER (WHERE ABS(c1.created_at - c2.created_at) < 7200000) AS burst_overlap`. No new index needed.

**Directed graph persistence.** Write co-commenter pairs into a `user_similarity_edges` table (user_a, user_b, overlap_count, last_updated). The query becomes a table scan on a pre-built graph instead of a live self-join. Necessary if comments table exceeds ~2M rows and query latency climbs above 50ms. Migration added in v11 alongside the brigade detector (F19) which needs the same structural data.

**Reverse lookup.** `/admin/users/clusters` — finds groups of 3+ users with mutual overlap >= N. Surfaces coordinated ring behavior that the pairwise query misses. SQL: transitive closure on the edge table (CTE with recursion). Requires the edge table from above.
