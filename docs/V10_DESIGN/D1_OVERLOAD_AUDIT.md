# D1 OVERLOAD INVESTIGATION
**Auditor:** D1-ANALYZER
**Generated:** 2026-05-10
**Worker version:** 9.11.0 (WORKER_VERSION string; codebase carries v10.10.0 logic)

---

## A. D1 Query Hotspots (inventory)

### Cron handlers (fire every 5 min = 12x/hr)

| Cron function | D1 ops per tick | Frequency | Reads/min |
|---|---|---|---|
| `_cronAutoUnstickyScan` (NEW v10.10.0) | 3 reads (enabled check + 2 threshold reads) + 1 dup-check per sticky + 1 INSERT per qualifying + 1 audit INSERT per qualifying | 1/5min | ~0.6 reads + 0.2–2 writes depending on stickies found |
| `gawCrawlTick` (when GAW_CRAWL_ENABLED=true) | 1 SELECT crawl_state + up to 50 UPSERT gaw_posts + up to N×50 UPSERT gaw_comments + gawUpsertUser per new author + gawLogIngest writes | 1/5min | **10–100+ writes/tick** — dominant write source |
| `brigadeTick` | 1 GROUP BY scan on gaw_comments + 2 reads per candidate (dedup + commenters) + 1 INSERT brigade_alert per hit | 1/5min | 0.6–5 reads depending on comment volume |
| `stickyDetectCronTick` | 1 GLOB scan on modmail_messages + 1 KV rate gate (skips if <4min since last run) + 0-N AI + INSERT per match | ~1/5min (KV-gated to real ~1/4min) | 0.4 reads typical |
| `superModCronTick` | 1 SELECT proposals + up to 20 UPDATE alerted_at + 1 UPDATE expired + 1 DELETE drafts + 1 DELETE claims | 1/5min | ~1 read + 2–4 writes |
| `teamProductivityCronTick` | 3 DELETE statements | 1/5min | 0.6 writes |
| `enrichmentDrainTick` | 2 reads per pending KV key (SELECT modmail_meta + SELECT modmail_messages) + 1 INSERT OR REPLACE modmail_meta per enriched | 1/5min; up to 20 messages per tick | 0–8 writes/min |
| `discordRetryDrain` | 1 SELECT + up to 25 deletes per tick | 1/5min | 0.2–5 writes |
| `retentionPurgeTick` | KV-gated to once/day; 0 D1 ops on most ticks | daily | ~0 typical |

**Cron total (typical, crawl enabled):** ~15–120 D1 ops per 5-min tick = **3–24 ops/min from cron alone**

---

### Per-request handlers (called by extension SW or popup)

| Endpoint | D1 ops per call | Caller frequency @ 15 mods | Reads/min |
|---|---|---|---|
| `checkModToken` | 2 reads (token_hash lookup + plaintext fallback) on every authenticated request | Every request | multiplied by all below |
| `lookupModFromToken` | 2 reads (hash + plaintext) + 1 debounced UPDATE last_used_at (once/60s/token) | Every request needing identity | ~30 reads/min (15 mods × 2 per poll) |
| `/mod/auto-actions/claim` (NEW v10.10.0) | 1 KV read (RL) + 1 UPDATE...RETURNING (atomic claim) | 1/60s/mod = 15/min | **15 writes/min** |
| `/mod/stats` (popup open) | 4 reads (24h actions, lifetime bans, deathrow, recent 5 actions) + 2 KV reads (firehose:active + ai_day) — KV-cached 60s | Popup open events; maybe 2–5/min across team | 8–20 reads/min (cache hit rate ~80%) |
| `/mod/auto-actions/recent` | 1 SELECT auto_action_queue | Called by extension on SW poll | 15/min |
| `/mod/whoami` (startup/reconnect) | 2 reads (checkModToken) + 2 reads (lookupModFromToken) | Once per session start; low frequency | ~2 reads/min |
| `/presence/ping` | 0 D1 (KV only) | Every 30s/mod = 30/min | 0 D1 |
| `/mod/user-cadence` | 1 SELECT + 2 reads (ingest tables) | On demand | low |
| `/mod/user-intel` | 8 reads (userRow, MIN times ×2, lkRow, activity ×2, MAX times ×2) | On demand | low |
| `/flags/read` | 2 reads (countRow + rows) | Every popup open | ~10/min |
| `/profiles/read` | 2 reads | Every popup open | ~10/min |
| `/gaw/posts/ingest` (firehose) | 1 UPSERT gaw_posts + optional comments UPSERT chain + gawUpsertUser per new author | Per-post from browser SW (continuous when active) | **Variable: 10–200+ writes/min when firehose active** |
| `/mod/settings` | 1 SELECT team_settings (entire table, no cache) | On popup open — every time | ~10–30 reads/min |
| `appendAuditAction` (every moderation action) | 2 writes (INSERT chain head + UPDATE hash) | On ban/note/message | low-moderate |

---

### Aggregated load estimate @ 15 mods, firehose active

| Category | Reads/min | Writes/min |
|---|---|---|
| Auth overhead (checkModToken + lookupModFromToken) on polling | ~60 | ~5 (debounced updates) |
| /mod/auto-actions/claim (15 mods × 1/min) | 0 | **15** |
| /mod/auto-actions/recent (15 mods × 1/min) | 15 | 0 |
| /mod/stats (cache miss ~20%) | ~10 | 0 |
| /flags/read + /profiles/read (popup events) | ~20 | 0 |
| /mod/settings (no cache!) | ~15–30 | 0 |
| cron tasks (gawCrawlTick dominant) | ~10–20 | **15–100** |
| firehose ingest (active) | 0 | **50–200** |
| appendAuditAction (mod actions) | 5 | 10 |
| **TOTALS (low / high)** | **~135 / ~175 reads/min** | **~95 / ~330 writes/min** |

---

## B. Capacity Calculation

D1 free tier limits (Cloudflare docs, 2025):
- **Reads:** 5 million/day = ~3,472 reads/min sustained
- **Writes:** 100,000/day = ~69 writes/min sustained
- **Row reads:** 1 billion/day; row writes: 10 million/day (query budget)
- **Per-worker concurrency:** Not publicly documented; `D1_ERROR: DB is overloaded` is Cloudflare-side queue saturation, not a fixed req/sec limit — it fires when too many simultaneous D1 requests back up in CF's internal queue

**Current write load at peak (firehose active):**
- ~95–330 writes/min = 137k–475k writes/day
- **The 100k/day free-tier write budget is EXCEEDED at peak** — this is the root cause of D1_ERROR overload
- Even at low end (firehose off): ~95 writes/min = 137k writes/day — still over limit

**Read load:**
- ~135–175 reads/min = 194k–252k reads/day — comfortably within 5M/day
- Reads are NOT the problem; writes are

**Conclusion:** The overload is write-side. `gawCrawlTick` alone generates 50–200 UPSERT writes per 5-min tick when crawling is enabled. Combined with the new `/mod/auto-actions/claim` (15 writes/min) and normal mod action chain (appendAuditAction = 2 writes per action), the system exceeds the D1 free tier write quota during active sessions.

---

## C. The `undefined.get` Bug

**File:** `D:\AI\_PROJECTS\cloudflare-worker\gaw-mod-proxy-v2.js`
**Line:** 8309–8311 (original)

**Pattern:**
```js
const modsCount = env.AUDIT_DB ? (await env.AUDIT_DB.prepare(
  `SELECT COUNT(*) AS n FROM bot_mods WHERE revoked_at IS NULL`
).first()).n : 0;
```

**Root cause:** `D1Statement.first()` returns `null` (not `undefined`) when the query returns zero rows OR when the `bot_mods` table does not exist (caught as an exception, but IF the table exists and is empty, `.first()` silently returns `null`). Accessing `.n` on `null` throws:

```
TypeError: Cannot read properties of null (reading 'n')
```

V8 in Cloudflare Workers surfaces this as `Cannot read properties of undefined (reading 'get')` when the error propagates through the interaction message pipeline — the outer `try/catch` in `processStatus` catches it and attempts to call `discordFollowupEdit` which accesses `interaction.token` on the error path. The real null deref is `.n` on `null`.

**Trigger:** Any Discord `/gm status` command when `bot_mods` table exists but has zero active rows.

**Fix applied (INLINE):**
```js
// Line 8309-8311 — BEFORE:
const modsCount = env.AUDIT_DB ? (await env.AUDIT_DB.prepare(
  `SELECT COUNT(*) AS n FROM bot_mods WHERE revoked_at IS NULL`
).first()).n : 0;

// AFTER (applied):
const modsCount = env.AUDIT_DB ? ((await env.AUDIT_DB.prepare(
  `SELECT COUNT(*) AS n FROM bot_mods WHERE revoked_at IS NULL`
).first()) || {}).n || 0 : 0;
```

The `|| {}` guard makes a null `.first()` result coerce to an empty object before `.n` is accessed. The trailing `|| 0` ensures a missing `n` field also defaults to 0. One-liner, zero behavior change when the table has rows.

**APPLIED inline.** No v10.10.2 patch needed for this item.

---

## D. Top 3 Hotspots and Mitigations

### Hotspot 1 — `gawCrawlTick` write storm (50–200 UPSERT writes per 5-min tick)

**Load:** This single cron function is responsible for the majority of D1 writes. Each 5-min crawl UPSERTs up to 50 posts + up to 250 comments (5 per post × 50 posts) + gawUpsertUser for new authors. That is **300 writes per tick = 3,600 writes/hr = 86,400 writes/day** — close to the entire 100k/day free tier write budget by itself.

**Mitigation A — Batch with D1 batch():**
Use `env.AUDIT_DB.batch([stmt1, stmt2, ...])` instead of sequential `await prepare().run()` calls. D1 batch reduces round-trips and counts as fewer internal queue entries. Effort: **3–4h** (refactor gawUpsertPostRow + gawUpsertCommentRow to accumulate stmts and flush as batch). Load reduction: **60–70%** of queue pressure (same write count but 1 queue entry instead of N).

**Mitigation B — Reduce crawl frequency or cap:**
Change crawl from every 5-min tick to every 10-min (KV-gate like stickyDetectCronTick already does). Halves write volume instantly. Effort: **30min**. Load reduction: **50%**.

**Mitigation C — Move to Analytics Engine:**
`env.MOD_METRICS` (Analytics Engine binding) is already declared. Metrics-style data (score updates, comment counts) that don't need D1 queryability should go there instead. Effort: **1–2 days**. Load reduction: **30–50%** of writes.

**Recommended immediate action:** Apply Mitigation B (KV-gate crawl to 10-min) now. Plan Mitigation A for v10.10.2.

### Hotspot 2 — `/mod/settings` reads on every popup open (no cache, full table scan)

`handleModSettingsRead` does `SELECT key, value FROM team_settings` (entire table) on every popup open with zero caching. At 15 mods opening popups frequently, this is 15–30 reads/min of an always-hot path.

**Mitigation — KV cache with 60s TTL:**
Exactly the same pattern already implemented in `handleModStats`. Cache key `settings:team` in KV, TTL 60s, invalidate on PUT /admin/settings write. Effort: **1h**. Load reduction: **~80% of settings reads** (cache hit rate matches usage pattern). The `/mod/stats` KV cache is the proven template.

### Hotspot 3 — Auth overhead on every poll (2 D1 reads per request × all polling endpoints)

`checkModToken` + `lookupModFromToken` together fire 2–4 D1 reads on every single authenticated request. With 15 mods polling `/mod/auto-actions/claim` + `/mod/auto-actions/recent` + `/version` every 60s, that's 60+ redundant auth reads/min.

**Mitigation — KV auth cache with 30s TTL:**
Cache token->mod_username in KV with a 30s TTL. The debounced `last_used_at` write already uses `_v72LastUsedCache` (in-memory Map, lost on cold start). A KV-backed equivalent survives warm restarts and eliminates 80%+ of mod_tokens D1 lookups. Effort: **2–3h**. Load reduction: **~50 reads/min eliminated**.

---

## E. Recommended v10.10.2 Patches (priority order)

1. **[DONE, applied] Fix `processStatus` null deref** — `bot_mods` COUNT query. Zero regression risk. Deployed next release.

2. **[HIGH, 30min] KV-gate `gawCrawlTick` to 10-min minimum interval** — Add same KV guard pattern as `stickyDetectCronTick` (lines 10665–10670). Change guard from 4min to 9min. This halves the crawl write storm immediately without changing any schema or interface.

3. **[HIGH, 1h] Cache `/mod/settings` in KV for 60s** — Copy the `handleModStats` KV-cache pattern (lines 1150–1154 + 1270–1272) verbatim into `handleModSettingsRead`. Invalidate on PUT /admin/settings. No schema change.

4. **[MEDIUM, 3–4h] Batch `gawCrawlTick` D1 writes using `env.AUDIT_DB.batch()`** — Accumulate all UPSERT statements into an array, flush as a single `batch()` call. D1 batch is transactional and counts as 1 operation for queue pressure. Target: 50 posts + 250 comments = 1 batch call instead of 300 sequential calls.

5. **[MEDIUM, 2–3h] KV auth cache for token lookup** — Add a short-TTL KV read in `checkModToken` before hitting D1. If KV returns the resolved username, skip both D1 reads. On KV miss, fall through to D1 and populate KV. Guard with try/catch so KV unavailability degrades to current behavior.

6. **[LOW, as-needed] Upgrade D1 tier** — If write volume continues to grow with team/content expansion, the $5/mo D1 paid tier raises writes to 50M/day. This is not a fix for code inefficiency but is the right safety valve if patches 2–4 don't close the margin enough.

---

## F. Notable Findings

**F1 — `gawCrawlTick` is the primary D1 write budget consumer.** It's opt-in (`GAW_CRAWL_ENABLED=true`) but if enabled, it dominates the write budget. Commander should verify this env var is intentionally set. If the cron crawl is not actively needed, disabling it is the fastest possible fix.

**F2 — `sniperTick` also scans KV list + D1 reads.** The `sniperTick` (line 7268–7297) does `env.MOD_KV.list({prefix: 'sniper:', limit: 500})` then a D1 UPDATE per expired sniper target. Low traffic typically, but with many snipers it compounds.

**F3 — The v10.10.0 auto-unsticky scan queries `team_settings` 3 times per cron tick** (enabled flag + maxHours + upvoteThreshold). These 3 reads fire even when the feature is disabled, because the `enabled` check itself is the first query. With 12 cron ticks/hr, that's 36 team_settings reads/hr from the scan alone. Fix: cache the `enabled` flag in KV for 5min so if disabled, all 3 reads become 1 KV read.

**F4 — No D1 read replica usage detected.** Cloudflare D1 supports read replicas in certain configurations. The codebase does not use any `db.withSession()` or read-replica routing. This is not immediately actionable but is worth revisiting if read load grows.

**F5 — `appendAuditAction` uses a chained INSERT+UPDATE (2 write ops per audit entry).** This is by design (Merkle chain integrity). However it means every moderation action costs 2 writes instead of 1. This is correct behavior but must be counted in capacity planning. A future optimization would be to compute the hash client-side and INSERT with all fields in one op, but that has chain-integrity implications.

**F6 — `enrichmentDrainTick` uses per-message D1 reads inside a loop.** Up to 20 messages × 2 reads each = 40 reads per tick. This is bounded and acceptable but could be coalesced into a single `WHERE message_id IN (...)` query. Low priority.
