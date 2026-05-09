# Firehose Feature 8 -- Sticky-Detection Live Feed

**Version target:** v10.0  
**Owner discipline:** Live-feed / status-bar ambient surfaces  
**Status:** Design spec -- not yet shipped

---

## A. CURRENT (popup-triggered) vs LIVE FEED

### Current: popup-triggered on-demand scan

`maintStickyScan` (`popup.js:3919`) is a one-shot function wired to a
Maintenance tab button. Flow:

1. Mod clicks "AI Sticky Scan" in popup.
2. `chrome.runtime.sendMessage({ type:'rpc', name:'aiStickyDetect' })` fires.
3. Worker `handleAiStickyDetect` (`gaw-mod-proxy-v2.js:5134`) runs a D1
   GLOB query on `modmail_messages` for the literal substring `sticky` in the
   last 7 days, then calls Llama 3.3-70b to filter intent.
4. Results render in `#maintStickyScanPanel` inside the popup -- visible only
   while the popup is open.

**Gaps:**
- Zero-latency guarantee is zero: a request arrives, sits for hours until a
  mod happens to click the button.
- The GLOB `GLOB '*sticky*'` misses at least 3 common phrasings (UAT C.6).
- Results die when the popup closes.
- No persistence: if two mods have the popup open, neither sees a shared list.
- No click-to-thread link in the status bar -- the mod has to navigate manually
  after reading the panel.

### Target: ambient live feed

A cron-driven background scan deposits confirmed sticky-requests into a D1
queue table. The status bar polls the queue endpoint every 60 seconds and
surfaces a compact chip above the SIREN zone. Clicking a flagged item opens
the modmail thread directly. No popup required.

---

## B. KEYWORD DICTIONARY EXPANSION

### Root cause of C.6 false-negative

`handleAiStickyDetect` (`gaw-mod-proxy-v2.js:5155`) pre-filters with:

```sql
AND lower(m.body_text) GLOB '*sticky*'
```

This is a hard gate -- Llama never sees messages that don't contain the
literal string "sticky". Members who write differently never reach the AI.

### Expanded keyword set

Replace the single-keyword GLOB with an OR across all variants:

```sql
AND (
  lower(m.body_text) GLOB '*sticky*'
  OR lower(m.body_text) GLOB '*pin this*'
  OR lower(m.body_text) GLOB '*pin post*'
  OR lower(m.body_text) GLOB '*make this a banner*'
  OR lower(m.body_text) GLOB '*feature this*'
  OR lower(m.body_text) GLOB '*feature this post*'
  OR lower(m.body_text) GLOB '*keep this at the top*'
  OR lower(m.body_text) GLOB '*put this at the top*'
  OR lower(m.body_text) GLOB '*highlight this*'
  OR lower(m.body_text) GLOB '*can you pin*'
  OR lower(m.body_text) GLOB '*please pin*'
  OR lower(m.body_text) GLOB '*could you sticky*'
  OR lower(m.body_text) GLOB '*make it sticky*'
)
```

**False-positive risk is low:** Llama still acts as the second-pass intent
filter. All keywords above were chosen because they are unlikely to appear in
non-request modmail contexts. "highlight this" is the softest; the Llama
system prompt already rejects negatives and ambiguous mentions.

The system prompt addition needed to cover new phrasings:

```
- "pin this", "please pin", "can you pin" = sticky request. Flag it.
- "make this a banner", "feature this post" = sticky request. Flag it.
- "keep this at the top", "put this at the top" = sticky request. Flag it.
```

---

## C. CRON HOOK

### Where it lives

`gaw-mod-proxy-v2.js` already has a `scheduled` handler at line 11992 that
fires every 5 minutes via Cloudflare Cron Triggers. Adding one more
`ctx.waitUntil` call is the integration point -- no new infrastructure.

### New cron task: `stickyDetectCronTick`

```js
// gaw-mod-proxy-v2.js -- add to scheduled() handler
ctx.waitUntil(stickyDetectCronTick(env).catch(cronCatch('stickyDetectCronTick')));
```

Function outline:

```js
async function stickyDetectCronTick(env) {
  if (!env.AUDIT_DB) return;
  // Rate-limit: skip if we ran within the last 4 minutes (KV flag).
  // This prevents double-execution when the 5-min cron fires slightly
  // early and catches up. Allows 12-15 ticks/hour real execution.
  const flagKey = 'sticky_cron_last';
  const last = await env.MOD_KV.get(flagKey);
  if (last && (Date.now() - Number(last)) < 4 * 60 * 1000) return;
  await env.MOD_KV.put(flagKey, String(Date.now()), { expirationTtl: 600 });

  // Query last 60 minutes of incoming modmail with expanded keyword set
  const since = Date.now() - 60 * 60 * 1000;
  const rs = await env.AUDIT_DB.prepare(`
    SELECT m.thread_id, m.from_user AS sender, m.body_text AS body,
           m.sent_at AS timestamp, t.subject
      FROM modmail_messages m
      LEFT JOIN modmail_threads t ON t.thread_id = m.thread_id
     WHERE m.body_text IS NOT NULL
       AND length(m.body_text) > 8
       AND m.sent_at > ?
       AND m.direction = 'incoming'
       AND (
         lower(m.body_text) GLOB '*sticky*'
         OR lower(m.body_text) GLOB '*pin this*'
         OR lower(m.body_text) GLOB '*pin post*'
         OR lower(m.body_text) GLOB '*make this a banner*'
         OR lower(m.body_text) GLOB '*feature this post*'
         OR lower(m.body_text) GLOB '*keep this at the top*'
         OR lower(m.body_text) GLOB '*put this at the top*'
         OR lower(m.body_text) GLOB '*can you pin*'
         OR lower(m.body_text) GLOB '*please pin*'
         OR lower(m.body_text) GLOB '*could you sticky*'
         OR lower(m.body_text) GLOB '*make it sticky*'
       )
     ORDER BY m.sent_at DESC LIMIT 20
  `).bind(since).all();

  const candidates = (rs && rs.results) || [];
  if (!candidates.length) return;

  // Run Llama intent filter (same prompt as handleAiStickyDetect)
  const requests = await _runStickyLlamaFilter(env, candidates);
  if (!requests.length) return;

  // Upsert confirmed requests into sticky_queue, skip already-seen thread_ids
  const now = Math.floor(Date.now() / 1000);
  for (const req of requests) {
    await env.AUDIT_DB.prepare(`
      INSERT INTO sticky_queue (thread_id, sender, reason, confidence, detected_at, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
      ON CONFLICT(thread_id) DO NOTHING
    `).bind(req.thread_id, req.sender, req.reason, req.confidence, now).run();
  }
}
```

**AI budget:** Each cron tick that finds candidates costs one Llama call
(same as the on-demand scan). The 4-minute KV guard + the 60-min lookback
window mean the model runs at most once per 5-minute tick only when new
modmail arrived. Quiet periods cost zero AI tokens.

---

## D. STORAGE -- `sticky_queue` D1 table

### New migration: `032_sticky_queue.sql`

```sql
-- migration 032: sticky_queue
-- Stores cron-confirmed sticky-request threads pending mod review.

CREATE TABLE IF NOT EXISTS sticky_queue (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id    TEXT    NOT NULL UNIQUE,   -- modmail thread identifier
  sender       TEXT    NOT NULL,
  reason       TEXT,                      -- Llama short-reason (<=200 chars)
  confidence   TEXT    NOT NULL DEFAULT 'med', -- high|med|low
  detected_at  INTEGER NOT NULL,          -- unix seconds
  status       TEXT    NOT NULL DEFAULT 'pending', -- pending|acknowledged|dismissed
  ack_by       TEXT,                      -- mod username who cleared it
  ack_at       INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sticky_queue_status_det
  ON sticky_queue (status, detected_at DESC);
```

**Why a dedicated table over `ai_hold_queue`?**

`ai_hold_queue` does not exist yet in the schema (no migration references it).
A purpose-built `sticky_queue` is simpler to query, simpler to index, and
adds no risk of clobbering a shared queue table's schema when that table
eventually lands for a different feature. If a unified queue is desired later,
`sticky_queue` rows migrate forward trivially.

**Deduplication:** `UNIQUE` on `thread_id` means the cron can re-run safely
every 5 minutes -- already-queued threads are silently skipped. No double-
alerts for the same request.

### New worker endpoint: `GET /admin/queue/sticky`

```
GET /admin/queue/sticky?status=pending
Authorization: mod token (standard checkModToken)

Response:
{
  "ok": true,
  "items": [
    {
      "id": 42,
      "thread_id": "t_abc123",
      "sender": "u/somedude",
      "reason": "Asks to sticky the daily Q&A post",
      "confidence": "high",
      "detected_at": 1746800000
    }
  ],
  "count": 1
}
```

PATCH endpoint for acknowledgement:
```
PATCH /admin/queue/sticky/<thread_id>
Body: { "status": "acknowledged" }  -- or "dismissed"
```

Both endpoints require mod auth. The GET endpoint is the 60-second client poll.

---

## E. STATUS-BAR ACCORDION UI

### Component: `gam-sticky-chip`

Mounts inside `buildStatusBar()` (`modtools.js:15076`), placed immediately
above `sirenBtn` in the bar construction at line 15380. Follows the same
pattern as the park chip (`gam-v80-park-chip`, `modtools.js:3494`).

**Chip appearance:**

- Hidden when queue count is 0.
- When count > 0: amber pill reading "PIN N" (N = pending count). Color
  `#ff9933` (matches existing sticky panel orange). Font: `600 9px
  ui-monospace`. No animation; no pulse (SIREN already owns the alert
  register).
- Click toggles an accordion panel that drops down from the bar (renders
  above bar to avoid clipping, using `bottom: calc(100% + 4px)` on the
  absolute-positioned dropdown).

**Accordion panel structure:**

```
+--------------------------------------------------+
|  PIN REQUESTS  (2 pending)               [x]     |
+--------------------------------------------------+
| HIGH  u/somedude     "pin the Q&A post"  [Open]  |
| MED   u/another      "make this banner"  [Open]  |
+--------------------------------------------------+
|  [Dismiss all]                                   |
+--------------------------------------------------+
```

"Open" button: `window.open('https://greatawakening.win/modmail/thread/'
+ encodeURIComponent(thread_id), '_blank')` then fires PATCH acknowledged.

"Dismiss all": PATCH dismissed for all visible pending rows, chip disappears.

**Poll logic (modtools.js, in `buildStatusBar` after bar is appended):**

```js
async function _pollStickyQueue() {
  const tok = getModToken();
  if (!tok) return;
  try {
    const r = await rpcFetch('/admin/queue/sticky?status=pending', { token: tok });
    const data = r && r.ok && r.json ? await r.json() : null;
    const count = (data && data.items && data.items.length) || 0;
    _renderStickyChip(count, data && data.items || []);
  } catch (_) {}
}
// Initial poll 8s after bar mount (avoids cold-start pile-on)
setTimeout(_pollStickyQueue, 8000);
// Then every 60s
setInterval(_pollStickyQueue, 60 * 1000);
```

This is the same deferred-start pattern used by `updateDeathRowCounter`
(`modtools.js:15393-15394`).

---

## F. SHIP-TONIGHT PATCH

Minimum viable change to deliver value without the full live-feed:

**Step 1 -- keyword dictionary** (worker only, zero schema change):
Apply the expanded GLOB OR block to `handleAiStickyDetect`. Fixes C.6
immediately. On-demand scan now catches "pin this", "make this a banner", etc.
All existing popup UI and button wiring unchanged.

Diff: `gaw-mod-proxy-v2.js:5151-5156` -- replace single GLOB line with
OR block from section B.

**Step 2 -- migration 032** (D1, apply via wrangler):
Creates `sticky_queue` table. No code changes required before the table exists;
the cron task can be guarded with `try/catch` to swallow table-missing errors
(consistent with how migrations 013, 017 were handled).

**Step 3 -- cron hook** (worker):
Add `stickyDetectCronTick` function and wire it into `scheduled()`. Deploy
worker. First run fires within 5 minutes of deploy.

**Step 4 -- GET /admin/queue/sticky endpoint** (worker):
Add route to the router switch at line 11965. Required before the client poll
in step 5.

**Step 5 -- status-bar chip + poll** (modtools.js):
Add `_pollStickyQueue`, `_renderStickyChip`, and the `gam-sticky-chip` button
construction into `buildStatusBar`. This is the only modtools.js touch.

Steps 1-4 are deployable as a single worker deploy. Step 5 requires an
extension bump. Ship 1-4 first; the chip (step 5) can follow in the next
extension release without blocking the backend.

---

## G. STRETCH -- Llama JSON-mode confidence calibration

### Problem

The current Llama call returns `confidence: "high"|"med"|"low"` with no
numeric grounding. Empirically: Llama 3.3-70b with temperature 0.3 and this
prompt overweights "high" for any plausibly-polite request. The chip would
fire "HIGH" for messages like "it would be nice if this was sticky" --
borderline requests that don't warrant interrupting a mod immediately.

### Solution: two-pass calibration

**Pass 1** (existing): intent filter. Produces candidate list.

**Pass 2** (new, cron-only -- not on-demand scan): urgency scorer.

```js
// Second Llama call, max_tokens: 200, temperature: 0.1
// System prompt:
"Rate each sticky request 1-5 on URGENCY from the mod team's perspective.
1=vague wish, 5=post is time-sensitive and community clearly needs it pinned now.
Return JSON: [{'thread_id':'...','urgency':N}]"
```

Map urgency to confidence:
- 4-5 -> `high`
- 2-3 -> `med`
- 1   -> `low` (suppress from chip, store as dismissed)

**Benefit:** Chip fires only for genuinely urgent requests. Low-urgency
requests still reach `sticky_queue` with `status='dismissed'` so mods can
audit the decision in the popup scan panel if desired.

**Cost:** ~1 extra Llama call per cron tick that produces candidates. At the
5-minute cadence with quiet periods, this is negligible. The KV rate-limit
guard from section C still applies to both passes together.

**JSON-mode note:** Llama 3.3-70b-instruct-fp8-fast does not expose a
`response_format: { type: 'json_object' }` parameter via the Workers AI
binding. The existing regex-extract pattern (`text.match(/\{[\s\S]*\}/)`)
remains correct. The second pass uses an array response; extract with
`text.match(/\[[\s\S]*\]/)` instead.

---

*Spec complete. Steps 1-4 are the ship-tonight patch. Step 5 follows in the
next extension release. Section G is a v10.1 stretch.*
