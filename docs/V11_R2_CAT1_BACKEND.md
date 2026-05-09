# V11 R2 Cat 1 — BACKEND / EDGE COMPUTE
**Generated:** 2026-05-08 by Cat 1 (R2 backend round)
**Lens:** The worker is the skeleton everything else hangs off. My job is to stress-test gaw-mod-proxy-v2.js as an edge runtime: its request lifecycle, KV write pressure, D1 query latency, AI call costs, cron fan-out, circuit-breaker semantics, body-size contracts, observability gaps, and failure modes under partial-outage conditions. When this worker degrades — D1 sluggish, KV throttled, Llama over capacity, Grok daily budget blown — what does a mod see? What breaks silently? What recovers? I find the gaps V11_PLAN missed because it was thinking about features, not the skeleton those features run on.

---

## A. THE TOP 25-30 (ranked by backend leverage)

### 1. Deploy-correlation ID baked into every response header
- **Why through backend lens:** `WORKER_VERSION` is hardcoded at line 51. `/version` reads from GitHub KV cache. But there is no trace of WHICH DEPLOY is serving a given request. If a bad deploy goes out and mods report weirdness, there's no header to match "which build caused this." CF deploy IDs are available via `env.CF_VERSION_METADATA.id` (Cloudflare injects this). The fix is one line and zero latency cost.
- **Implementation sketch:** In `export default { async fetch }`, first thing: stamp `x-worker-deploy: ${WORKER_VERSION}/${env.CF_VERSION_METADATA?.id ?? 'unknown'}` on every response. Health endpoint surfaces the full metadata. Also: make `handleVersion` return the live `WORKER_VERSION` constant (currently it fetches GitHub — but line 51 IS the authoritative value for THIS deploy). GitHub-fetched version.json is what the extension uses for auto-update detection; separate concern from deploy identity.
- **Effort:** S (2 hours)
- **Risk:** Lo — read-only, additive header
- **Dependency:** none
- **Success metric:** every response carries `x-worker-deploy`; incident post-mortem can identify the offending deploy from a raw network capture within 60s
- **Stretch ambition:** structured telemetry emitting deploy ID as a dimension on every Analytics Engine data point

### 2. KV write pressure audit + namespace segmentation
- **Why through backend lens:** KV has a free-tier write limit of 1,000/day, paid tier is 1M/month (~33k/day). Current usage: ai_minute buckets (~20 KV writes per mod per AI request at peak), ai_day buckets (1 write per AI call), cb_state buckets (1-2 writes per AI call on failure), presence pings (1 write/30s per online mod at TTL 90s). With 15 mods all hammering AI endpoints at 20 calls/minute cap: 15 x 20 = 300 KV writes/minute on minute-rate buckets alone. That's 432,000 writes/day — well into paid territory and approaching the KV consistency cliff where eventually-consistent writes start bleeding into each other. We also have cache:* keys (generic cache), cb_state_* (circuit breakers), audit_pre_028_boundary_id, and VERSION_CACHE_KEY all sharing the same namespace. No segmentation. One runaway pattern can evict keys from another namespace region.
- **Implementation sketch:** (1) Audit KV write rate via Analytics Engine — emit one data point per KV.put call with key-prefix label. (2) Separate AI rate-limit keys into a dedicated namespace if KV write budget becomes binding. (3) Consider replacing minute-rate KV writes with a in-isolate Map + atomic compare-and-swap pattern for the hot path (the comment in `aiMinuteCheck` already acknowledges this: "a sustained burst can over-count slightly across regions"). (4) Cap minute-rate window TTL at 61s not 120s — current 120s doubles the key lifetime for no reason.
- **Effort:** M (1 day for audit + namespace split)
- **Risk:** Md — namespace split requires wrangler config change + migration of existing keys
- **Dependency:** Analytics Engine binding (already in wrangler.jsonc as MOD_METRICS)
- **Success metric:** KV write count/day tracked in Analytics Engine; alert threshold at 25k/day (75% of paid headroom)
- **Stretch ambition:** replace ai_minute KV writes with Durable Objects counter (single-instance, atomic increment, zero KV pressure for rate limiting)

### 3. Cron task isolation + per-task wall-clock budget
- **Why through backend lens:** The `scheduled()` handler fires 7 tasks via `ctx.waitUntil()` in parallel: sniperTick, botCronTick, enrichmentDrainTick, gawCrawlTick, retentionPurgeTick, superModCronTick, teamProductivityCronTick, discordRetryDrain. Workers cron has a 15-minute CPU wall-clock limit but individual `waitUntil` tasks share the same isolate. If `gawCrawlTick` hangs (GAW backend slow, network stall), it doesn't block the other 6 tasks — they're fire-and-forget via waitUntil. BUT: if ANY of them panics and throws an uncaught promise rejection, that rejection is silently swallowed. The `cronCatch` wrapper catches it and logs + Sentry, BUT only for the 4 tasks explicitly wrapped. `retentionPurgeTick`, `superModCronTick`, `teamProductivityCronTick` use anonymous arrow functions that also catch, but with a simpler `console.error` — no Sentry. The Discord drain has zero timeout bounding. If GAW returns 200ms responses on one cron tick and 8s on another, we never know.
- **Implementation sketch:** Wrap each cron task in a `withTimeout(fn, ms)` helper: `Promise.race([fn(), sleep(ms).then(() => { throw new Error('task timeout') })])`. Budget: gawCrawlTick 120s, enrichmentDrainTick 60s, sniperTick 30s, discordRetryDrain 45s, all others 20s. Log per-task wall-clock duration to Analytics Engine. Add Sentry capture to ALL task catches (uniform the pattern, not just the 4 covered today).
- **Effort:** S (half day)
- **Risk:** Lo — protective wrapper, tasks that beat the budget unchanged
- **Dependency:** none
- **Success metric:** cron task durations tracked per-task in Analytics Engine; P99 gawCrawlTick < 30s; alerts if any task exceeds budget 3x in 24h
- **Stretch ambition:** Cloudflare Queues consumer replacing enrichmentDrainTick and discordRetryDrain (move async work off the cron band, free up cron for discovery-only)

### 4. Structured request telemetry via Analytics Engine (end-to-end)
- **Why through backend lens:** `MOD_METRICS` Analytics Engine binding exists in wrangler.jsonc but `handleMetricsWrite` (line 5549) still checks `env.ANALYTICS_ENGINE` (wrong binding name — it's `MOD_METRICS`) and returns 503 if not found. That means the binding has been wired in wrangler for unknown time but is silently 503ing every `/metrics/write` call. This is a live bug. Beyond the bug: NO automatic per-endpoint telemetry exists. We have ~120 endpoints; none emit timing or error rate data automatically. We are flying blind. V11 ships significant new endpoints (ai_hold_queue, mod-profile audit, bulk-action, slash commands). Without per-endpoint P99 we cannot know which ones are slow or failing.
- **Implementation sketch:** (1) Fix the binding name bug: `env.ANALYTICS_ENGINE` -> `env.MOD_METRICS`. (2) Add a thin middleware wrapper in the router: measure `Date.now()` pre-dispatch, post-response; emit one Analytics Engine data point per request with fields: `pathname`, `method`, `status`, `duration_ms`, `mod_hash` (caller key, already computed by aiCallerKey), `is_ai` (boolean). The emit is fire-and-forget via `ctx.waitUntil`. Zero latency added to request path. (3) CF Analytics Engine is SQL-queryable via Cloudflare dashboard or Workers Trace Events — gives us real P50/P99 per endpoint.
- **Effort:** M (1-2 days for fix + middleware + dashboard query setup)
- **Risk:** Lo — additive telemetry, Analytics Engine writes are non-blocking
- **Dependency:** wrangler.jsonc binding name fix (trivial)
- **Success metric:** 100% of requests emit a data point; P99 latency queryable per endpoint in Analytics Engine within 24h of deploy
- **Stretch ambition:** OpenTelemetry export via Workers Trace Events (CF native, zero SDK needed) to an external OTLP sink

### 5. AI prompt caching for repeated modmail / ban-suggest prompts
- **Why through backend lens:** Every AI call in `aiPreflight` builds a fresh prompt from scratch, sends it to Llama/Grok/Claude, waits for the full response, and charges against the daily cap. For modmail AI replies, the system prompt is 400-600 chars of fixed instructions that are IDENTICAL across every call. For ban-suggest, the same "you are a GAW moderator" preamble repeats on every call. Claude API supports explicit prompt caching with `cache_control: { type: "ephemeral" }` that caches the static prefix for up to 5 minutes. Workers AI (Llama) does not support this natively, but we can implement KV-backed semantic deduplication: if the same username has been scored in the last 10 minutes with the same post content hash, return the cached verdict instead of burning a cap unit. This is especially valuable for the ai_hold_queue where the same high-volume user might generate 3 consecutive AI evaluations within one shift.
- **Implementation sketch:** (1) For `/ai/ban-suggest` and `/ai/score`: compute `SHA-256(prompt_text)[:16]`; check KV for `ai_cache:<hash>` with 10-min TTL. On miss, run AI, store result. On hit, return cached + tag `_cached: true` in response. (2) For Claude path (anthropic): add `cache_control` headers on system prompt prefix when using Anthropic SDK. (3) Daily cap should NOT decrement on cache hit. Add `pre.cached` boolean to aiPreflight return value; callers skip the KV cap write when `cached: true`.
- **Effort:** M (1-2 days — cache key derivation + integration into all AI call sites)
- **Risk:** Md — stale cache on cache hit if user behavior changes within TTL window; mitigated by 10-min TTL and content-hash keying
- **Dependency:** none new; uses existing MOD_KV
- **Success metric:** AI cache hit rate > 15% within first week of brigade or raid events (when same users get re-evaluated); daily cap consumption drops proportionally
- **Stretch ambition:** semantic embedding cache — use Workers AI embedding model to compare prompt vectors; cache hits on semantically similar (not byte-identical) prompts

### 6. D1 idempotency keys on all mutating endpoints
- **Why through backend lens:** Today's B3 fix made firehose INSERTs idempotent via `ON CONFLICT DO UPDATE`. But `appendAuditAction` (the hard-fail invariant on every mutating endpoint) does a plain INSERT with no idempotency mechanism. If a mod client retries a failed ban (network timeout, extension retry logic), the audit chain gets a duplicate row. The chain's Merkle integrity is preserved (each row hashes off prev_hash), but the action is executed twice: two ban rows for one ban. Similarly, the token rotation endpoint has a race window acknowledged in comments around line 3684 ("KV is eventually consistent across colos"). The firehose got atomic UPSERT this session. The rest of the mutation surface hasn't.
- **Implementation sketch:** (1) Add `client_idempotency_key` (UUID, optional) to every mutating request body schema. Worker stores `idem:<key>` in KV with TTL 300s and the response payload. On duplicate key within TTL: return the stored response, skip execution. (2) Extension generates idempotency key per-action attempt; on retry (caught network error), resubmits the same key. (3) Audit `appendAuditAction` to accept `idempotencyKey` and bail early if KV already has `idem:<key>`. This also gives us the client_op_id the V11_PLAN bulk-undo system needs (same primitive, dual purpose).
- **Effort:** M (1-2 days — pervasive but mechanical change)
- **Risk:** Md — requires extension-side key generation; a bug in key derivation causes silently dropped actions (if key is stable across distinct actions, not retries)
- **Dependency:** V11 bulk-action undo (item #5 in V11_PLAN shares this primitive)
- **Success metric:** duplicate audit rows zero after deploy; bulk-undo endpoint reuses idempotency key for inverse-action lookup
- **Stretch ambition:** idempotency key doubled as the Merkle chain correlation key — one UUID links the original action + its undo + any corrections in the `correlated_action` column

### 7. Request amplification backoff contract
- **Why through backend lens:** 15 mods x ~120 endpoints x Chrome's default retry-on-network-error = potential amplification storms. Extension `background.js` makes RPC calls to the worker; if the worker returns a transient 5xx, Chrome's `fetch()` does NOT automatically retry — but many extension callers implement their own retry loops. If the worker goes briefly unhealthy (D1 outage, new deploy cold-start), all 15 mods' retry loops fire simultaneously. That's amplification. The worker currently has no `Retry-After` header on 5xx responses, no jitter guidance, no overload detection. The `aiMinuteCheck` function DOES return `retry_after_seconds` on 429 — but only for AI endpoints. Non-AI endpoints return bare 503 with no retry guidance.
- **Implementation sketch:** (1) Add `Retry-After` header to ALL 503/502 responses. Value: `Math.floor(Math.random() * 20) + 10` seconds (10-30s jitter). (2) Add a lightweight overload detector: if a 5xx response fires, KV-increment `overload:<minute>` with TTL 120s. If count > 30 in the same minute, add `X-Overload: 1` header — extension clients that see this header should back off 60s, not retry immediately. (3) Extension-side: enforce exponential backoff with jitter (2s, 4s, 8s, max 60s) on any 5xx. Currently the RPC dispatcher in background.js has no backoff that's visible in the code.
- **Effort:** S (4 hours worker-side) + S (extension background.js backoff — separate ticket)
- **Risk:** Lo — additive headers; overload detector adds 1 KV write per 5xx, bounded by TTL
- **Dependency:** background.js RPC contract (Cat 3/4 territory for UX impact; worker side is purely backend)
- **Success metric:** no amplification storm observed on next cold-start deploy; Retry-After headers in network trace; overload counter visible in Analytics Engine
- **Stretch ambition:** Cloudflare Rate Limiting rule at the edge (zero-latency, before the worker even cold-starts) set to 100 req/min per IP

### 8. ANALYTICS_ENGINE binding name bug fix (live P0)
- **Why through backend lens:** This is a live bug right now. `handleMetricsWrite` at line 5549 checks `env.ANALYTICS_ENGINE` — but the wrangler.jsonc binding is named `MOD_METRICS`. Every call to `/metrics/write` returns 503. This has been silently failing since the Analytics Engine binding was added. The client almost certainly calls this endpoint; the worker silently 503s it. The fix is one string change.
- **Implementation sketch:** Line 5549: `if (!env.ANALYTICS_ENGINE)` -> `if (!env.MOD_METRICS)`. Line 5552: `env.ANALYTICS_ENGINE.writeDataPoint` -> `env.MOD_METRICS.writeDataPoint`. Parse-verify. Deploy.
- **Effort:** S (30 minutes)
- **Risk:** Lo — pure bug fix; cannot make things worse than the current silent 503
- **Dependency:** none
- **Success metric:** `/metrics/write` returns 200; Analytics Engine receives data points
- **Stretch ambition:** n/a — this should have shipped today

### 9. Action-diff compute moved to worker (not client)
- **Why through backend lens:** V11_PLAN item #16 adds `diff_json` to the audit chain. The plan notes "every mutating handler in the worker needs to compute the diff." This is correct placement — the worker is the only party that sees BOTH the pre-state (from D1 SELECT) and the post-state (from D1's RETURNING clause). Today's B3 fix gave us `RETURNING` on 4 firehose paths. The pattern should be generalized: every mutating endpoint already does a SELECT to validate the target exists (e.g., `lookupModFromToken`), and the UPSERT returns the post-state. The diff is trivially computable in the worker at zero extra round-trips. Storing it client-side and POSTing it back would be a security anti-pattern (client controls the diff).
- **Implementation sketch:** Helper `computeDiff(before, after, fields)` returns `{ changed: [{field, from, to}] }` for a specified field list. Each endpoint specifies which fields are audit-worthy (e.g., ban endpoint diffs `banned/not-banned`, duration, reason). Result stored as `JSON.stringify(diff)` in `actions.diff_json` (new column, migration 032). Average 200 bytes/row per V11_PLAN estimate. `appendAuditAction` takes optional `diff` parameter.
- **Effort:** M (1-2 days — migration + per-endpoint integration)
- **Risk:** Md — new column on hot table; D1 handles it fine but migration must be safe (ADD COLUMN with DEFAULT NULL is zero-downtime)
- **Dependency:** migration 032 must land before any handler writes diff_json
- **Success metric:** 100% of mutating endpoints write diff_json; forensic query "show me what mod X changed on target Y" works in < 200ms via D1 query on `actions` table
- **Stretch ambition:** diff_json indexed by changed field names for fast "who changed ban.duration from 7d to perma" queries

### 10. ai_hold_queue as unified AI verdict surface (the architectural simplifier)
- **Why through backend lens:** Today AI outputs are scattered across 4 separate surfaces: `ai_suspect_queue`, shadow-triage verdicts in the `proposals` table, ban-suggest responses (ephemeral, never stored), and tar-suggestions in KV. V11_PLAN correctly identifies `ai_hold_queue` as the single table that consolidates all AI suggestions. From the backend lens: this also means one index to optimize, one D1 table to back up, one write path to make idempotent, one retention policy to tune. The scatter today means 4 different query patterns, 4 different API surfaces, and 4 different failure modes when Llama is at capacity. Consolidating them into one table with `kind` discriminator + `confidence` score + `suggested_action` is a net reduction in worker code surface, not an increase.
- **Implementation sketch:** Migration 032 (or 033): `CREATE TABLE ai_hold_queue (id INTEGER PRIMARY KEY, kind TEXT, target_kind TEXT, target_id TEXT, confidence REAL, reason_json TEXT, suggested_action TEXT, created_at INTEGER, claimed_by TEXT, resolved_action TEXT, resolved_at INTEGER, source_endpoint TEXT)`. Worker: every AI endpoint that currently returns a verdict also writes to this table as a side effect. New endpoint: `GET /admin/queue/ai-flagged?status=pending&kind=ban` for the j/k queue UI. Claim/resolve endpoint: `POST /admin/queue/ai-flagged/:id/resolve`.
- **Effort:** M (1-2 days — migration + write-side integration at 4 AI call sites + 2 new endpoints)
- **Risk:** Md — D1 write on every AI call adds ~5ms latency; mitigated by making the write non-blocking (`ctx.waitUntil(writeToHoldQueue(...))`)
- **Dependency:** none; schema is additive
- **Success metric:** all AI suggestions visible in one query; j/k queue endpoint P99 < 100ms; claim/resolve roundtrip < 200ms
- **Stretch ambition:** hold queue as a training signal — `resolved_action != suggested_action` rows feed a Llama fine-tune dataset stored in R2

### 11. Workers Smart Placement for the worker
- **Why through backend lens:** CF Smart Placement routes incoming requests to the datacenter geographically closest to the UPSTREAM dependencies (D1, KV) rather than closest to the client. Our upstream is CF's own infra (D1 in US region, KV global). For a US-centric moderation team (greatawakening.win is US-audience), Smart Placement likely puts the worker in a US data center, reducing D1 round-trips from 50-80ms (cross-Atlantic) to 10-20ms (intra-US). Enabling it is one flag in wrangler.jsonc: `"smart_placement": { "mode": "off" }` -> `"mode": "on"`. Zero code changes.
- **Implementation sketch:** Add `"smart_placement": { "mode": "on" }` to wrangler.jsonc. Observe D1 query latency in Analytics Engine before/after. If D1 P99 drops more than 20ms, keep it.
- **Effort:** S (30 minutes — config change + deploy + observe)
- **Risk:** Lo — can be reverted with a config change; no code path changes
- **Dependency:** Analytics Engine telemetry (item #4) to measure impact
- **Success metric:** D1 query P99 drops >= 15ms as measured in Analytics Engine telemetry
- **Stretch ambition:** Tiered caching (CF Cache API) for read-heavy endpoints like `/version`, `/flags/read`, `/mod/dr-rules` — cache at the edge for 60s

### 12. R2 lifecycle policy + evidence retention tiers
- **Why through backend lens:** `gaw-mod-evidence` R2 bucket has no lifecycle policy. Every screenshot, log dump, and evidence upload lives indefinitely. R2 has no storage costs for existing data (unlike S3), but egress costs and LIST operation costs scale with bucket size. More importantly: if a mod uploads evidence for a case that resolves, that data never expires. At 15 mods producing ~10MB/week of evidence, that's 500MB/year with zero cleanup. R2 lifecycle rules (CF recently GA'd them) can auto-delete or transition objects after N days. We should separate evidence into: active cases (no expiry), resolved bans (90-day retention), and temporary uploads (7-day cleanup).
- **Implementation sketch:** (1) `handleEvidenceUpload` already enforces key prefix `evidence/<mod_username>/<sha256>/<basename>`. Add a prefix tier: `evidence/active/`, `evidence/resolved/`, `evidence/temp/` — caller specifies tier. (2) R2 lifecycle rule via wrangler (or Cloudflare dashboard): objects with prefix `evidence/resolved/` expire after 90 days; `evidence/temp/` expire after 7 days. (3) When a ban is resolved (unban action), a worker side-effect moves the evidence key from `active/` to `resolved/` via R2.copyObject + delete original.
- **Effort:** M (1 day — key tier refactor + lifecycle rule config + copy-on-resolve hook)
- **Risk:** Lo — additive; existing keys remain unaffected; new keys get tiered
- **Dependency:** none
- **Success metric:** R2 bucket size stops growing unboundedly; temp/ keys auto-expire within 7 days; zero manual cleanup needed
- **Stretch ambition:** R2 event notification (CF R2 supports S3-compatible event notification) triggers a Discord webhook when large evidence uploads arrive, alerting lead

### 13. EXTENSION_ID_ALLOWLIST rotation protocol for CWS publish
- **Why through backend lens:** `EXTENSION_ID_ALLOWLIST` currently contains only the dev/unpacked ID (`pfkfimhoefhodeoklmlacdehgmlngmgc`). When the extension hits Chrome Web Store, it will get a new ID. The allowlist is in `wrangler.jsonc` vars, not a wrangler secret. Updating it requires a wrangler deploy. The transition window between "old ID removed" and "new ID deployed" would break all origin-gated endpoints (`/admin/*`, `/bot/*`) for ALL 15 mods simultaneously. There is no hot-swap path today.
- **Implementation sketch:** (1) Change `EXTENSION_ID_ALLOWLIST` from a single string to a comma-separated list (`"pfkfimhoefhodeoklmlacdehgmlngmgc,<CWS_ID>"`). `isAllowedExtensionOrigin` already splits on comma? Verify — if not, fix to split. (2) During CWS rollout: add new ID to the list BEFORE removing the old ID (blue-green on the allowlist). Keep both IDs live for 72h after all mods confirm CWS install works. (3) Document this as a runbook: allowlist is ALWAYS additive first, subtractive second.
- **Effort:** S (2 hours — code verification + runbook)
- **Risk:** Hi without this change; Lo with it
- **Dependency:** CWS submission (trigger event)
- **Success metric:** zero /admin/* 403s during CWS rollout; new extension ID functional within 5 minutes of wrangler deploy (no mod action required)
- **Stretch ambition:** move EXTENSION_ID_ALLOWLIST to a KV key that can be updated without a deploy; hot-swap in under 60s

### 14. D1 transient-failure retry with exponential backoff
- **Why through backend lens:** D1 is an HTTP-over-SQLite service. Cloudflare's own status page has had D1 degradation events. Current worker code does `env.AUDIT_DB.prepare(...).run()` with zero retry logic on transient failures. If D1 returns a 503 (which it does during regional degradation), every endpoint that touches D1 hard-fails the request. The `appendAuditAction` invariant (hard-fail if audit fails) means a D1 blip could take down EVERY mutating action for all mods simultaneously. The firehose now uses atomic UPSERT (B3) but still has no retry. The audit chain itself has no retry — if audit fails, the action fails.
- **Implementation sketch:** Helper `withD1Retry(fn, maxAttempts=3, baseDelayMs=100)`: on D1 error with message matching `/D1.*503|Too many.*requests|Database.*busy/i`, wait `baseDelayMs * 2^attempt` ms and retry. Max 3 attempts. If all fail, throw with structured error `{ d1_retries_exhausted: true }`. Apply to: `appendAuditAction`, `gawUpsertPostRow`, `gawUpsertCommentRow`, and the 5 most critical read paths (`lookupModFromToken`, `handleModBanConfirm`). Non-critical reads (firehose history, dashboard queries) can fail-open without retry.
- **Effort:** M (1 day — helper + integration at critical sites)
- **Risk:** Lo — retry logic is additive; worst case adds delay before a legitimate failure
- **Dependency:** none
- **Success metric:** zero hard-fail mod actions during next D1 degradation event; D1 retry count tracked in Analytics Engine
- **Stretch ambition:** D1 read replicas (CF has beta read replicas for D1) — route read-heavy endpoints to replicas, writes to primary

### 15. Structured error taxonomy with error codes
- **Why through backend lens:** Today's error responses are `{ ok: false, error: 'some string' }`. The string is human-readable but not machine-parseable by the extension. Extension error handling (`background.js`) inspects `result.error` as a string and displays it verbatim. TS-5 in BACKLOG already calls out 4 remaining `String(e)` sites. But the deeper issue is: the extension can't distinguish "rate-limited" (retry after 60s) from "D1 unavailable" (retry after 5s) from "token invalid" (no retry, show auth error). These require fundamentally different UX responses.
- **Implementation sketch:** Introduce `error_code` field in all error responses: `{ ok: false, error_code: 'AI_RATE_LIMIT', error: 'per-mod AI minute limit reached', retry_after_seconds: 45 }`. Error codes: `AUTH_TOKEN_INVALID`, `AUTH_LEAD_REQUIRED`, `RATE_LIMIT_AI_MINUTE`, `RATE_LIMIT_AI_DAILY`, `D1_UNAVAILABLE`, `AI_PROVIDER_DOWN`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT_DUPLICATE`. Extension maps `error_code` to UX treatment. Zero breakage of existing string-based handling (both fields coexist).
- **Effort:** S (4 hours — error code constants + per-site integration)
- **Risk:** Lo — additive field; existing clients ignore unknown fields
- **Dependency:** none
- **Success metric:** extension shows "rate limited — retry in 45s" not "per-mod AI minute limit reached"; error_code present in 100% of error responses after deploy
- **Stretch ambition:** error_code as an Analytics Engine dimension — P99 error rate by code type queryable in real time

### 16. `/admin/queue/ai-flagged` endpoint for V11 hold queue
- **Why through backend lens:** V11 item #3 (AI Hold Queue) is listed as a client-side feature but needs a new backend endpoint. Today there is no `GET /admin/queue/ai-flagged` endpoint. Shadow triage results are stored in `proposals` table; they're not easily queryable for the j/k queue pattern. This is the most direct new backend deliverable for Wave 1 of V11 that has zero coverage in V11_PLAN's backend dependency analysis.
- **Implementation sketch:** `GET /admin/queue/ai-flagged?kind=ban,tard,sticky&status=pending&limit=20&offset=0`. Returns paginated list from the new `ai_hold_queue` table (item #10). Requires lead token. Also: `POST /admin/queue/ai-flagged/:id/claim` (marks `claimed_by = mod`) for two-mod-collision prevention; `POST /admin/queue/ai-flagged/:id/resolve` (sets `resolved_action`, `resolved_at`). These 3 endpoints + the new table are the complete backend for the j/k hold queue.
- **Effort:** S (4 hours — 3 lean endpoints on one new table)
- **Risk:** Lo — new endpoints, no mutation of existing paths
- **Dependency:** migration 032 (ai_hold_queue table, item #10)
- **Success metric:** j/k hold queue UI can display pending items within 200ms; claim/resolve roundtrip < 100ms; no two mods can claim the same item simultaneously
- **Stretch ambition:** SSE (Server-Sent Events) push from worker to extension when new high-confidence items enter the queue — skip the polling loop

### 17. Mod-profile audit endpoint (`/admin/audit/mod-profile`)
- **Why through backend lens:** V11 item #4 in V11_PLAN is listed as a "new endpoint reading existing `actions` table." True — but the implementation detail matters. The actions table at 100k+ rows needs a proper index for `WHERE mod = ? AND ts > ?` aggregation. Migration 016 added `hot_path_indexes` — check whether `mod` is indexed. If not, this query cold-scans the full actions table per mod per 30-day window. At 100k rows and growing, that's a D1 full-table scan: 500ms+ at P50.
- **Implementation sketch:** (1) Verify `CREATE INDEX IF NOT EXISTS idx_actions_mod_ts ON actions(mod, ts)` exists in migration 016. If not, add it in migration 032 (no downtime, D1 supports concurrent index builds). (2) Endpoint: `GET /admin/audit/mod-profile?mod=X&days=30`. SQL: `SELECT action, COUNT(*) as cnt, AVG(CAST(ts as INTEGER)) as avg_ts FROM actions WHERE mod = ? AND ts > ? GROUP BY action`. (3) AI summary: pipe aggregated stats to Llama 3.3-70B with structured output schema `{ behavior_flags: [], top_patterns: [], concern_level: 'low|medium|high' }`. Cache result in KV for 10 minutes (moderator audits don't need real-time freshness).
- **Effort:** M (1 day — index verification + endpoint + AI summary + KV cache)
- **Risk:** Lo if index exists; Md if index is missing (migration required before endpoint ships)
- **Dependency:** migration 016 index check
- **Success metric:** mod-profile query P99 < 150ms with index; AI summary generated in < 3s; lead can audit any mod's 30-day behavior in under 5s total
- **Stretch ambition:** Llama-flagged anomaly patterns automatically write to a `mod_behavior_alerts` table, triggering Discord webhook to lead

### 18. Cloudflare Queues for async work offload
- **Why through backend lens:** `enrichmentDrainTick` and `discordRetryDrain` are cron-driven drains. They poll D1 tables every 5 minutes looking for work. The pattern is: (1) slow time-to-process (up to 5 minutes between enqueue and execute), (2) wasted cron cycles when queue is empty, (3) no back-pressure mechanism (if drain falls behind, D1 backlog grows unboundedly). Cloudflare Queues provides a proper producer-consumer primitive with guaranteed delivery, configurable concurrency, dead-letter queuing, and exactly-once semantics (with deduplication keys). Replacing enrichmentDrainTick and discordRetryDrain with Queue consumers would: reduce enrichment latency from up to 5 minutes to under 30 seconds, and eliminate the cron-cycle waste.
- **Implementation sketch:** (1) Add `queues` binding to wrangler.jsonc: `{ "binding": "ENRICHMENT_QUEUE", "queue": "gaw-enrichment" }`. (2) `handleModmailSync`: instead of setting KV flag for cron pickup, call `env.ENRICHMENT_QUEUE.send({ messageId, threadId })`. (3) New `queue` handler in `export default`: `async queue(batch, env, ctx)` processes enrichment messages. (4) Similarly for Discord retry: `DISCORD_RETRY_QUEUE` producer in webhook failure path, consumer replaces discordRetryDrain drain loop. (5) Keep cron as a backstop only.
- **Effort:** L (3+ days — new CF binding, wrangler setup, handler migration, testing)
- **Risk:** Md — new CF primitive, need to verify Queues are available on the current plan; fallback is the existing cron pattern
- **Dependency:** Cloudflare plan must include Queues (Workers Paid plan: yes, it's included)
- **Success metric:** modmail enrichment latency from <5min to <60s; Discord retry latency from <5min to <30s; cron tick duration drops by 40% (two heavy tasks moved off)
- **Stretch ambition:** brigade detector (V11 item #25) as a Queue consumer — firehose ingest produces to `BRIGADE_ANALYSIS_QUEUE`, consumer runs velocity + reply-graph analysis async, posts results to ai_hold_queue

### 19. Durable Objects for presence (replace KV polling pattern)
- **Why through backend lens:** Presence is currently KV-backed: mods ping `/presence/ping` which writes `presence:<username>` with 90s TTL, and `/presence/online` reads all presence keys (KV list operation). KV list is expensive and eventually consistent — a mod who just pinged might not appear in the list for another second or two. With 15 mods, a KV list scan on every presence poll (every 30s from the extension) generates 15 LIST operations per 30s = 30 LIST operations/minute. KV LIST is billed separately and is slower than GET. Durable Objects provides a single-instance stateful object that holds the presence map in memory with `this.state.storage` and broadcasts to all connected WebSocket sessions. Latency: sub-millisecond (in-memory). No LIST operations. True real-time.
- **Implementation sketch:** `PresenceTracker` Durable Object with a WebSocket hibernation handler. Each mod client connects via WebSocket (or falls back to polling). `ping()` method updates in-memory Map and broadcasts to all connected clients. `online()` returns the map snapshot. Worker routes `/presence/ws` to the DO; `/presence/ping` and `/presence/online` remain for backward-compat clients. Requires `durable_objects` binding in wrangler.jsonc.
- **Effort:** L (3+ days — DO is a non-trivial new primitive; WebSocket client in extension)
- **Risk:** Hi — Durable Objects pricing is per-request plus GB-hour storage; for 15 mods the cost is minimal but the operational complexity is significant
- **Dependency:** extension WebSocket client (background.js change); DO binding in wrangler
- **Success metric:** presence update latency drops from 30s (poll interval) to < 500ms (push); zero KV LIST operations for presence
- **Stretch ambition:** DO hosts the live queue cursor state (V11 item #20) — who is viewing which queue item — which requires shared real-time state across isolates (exactly what DOs are for)

### 20. Bulk-action server-side undo with `pending_undo` table
- **Why through backend lens:** V11_PLAN item #19 (toast-undo) and item #5 (bulk queue actions) both require server-side undo. V11_PLAN mentions "server-side, every bulk endpoint accepts a `client_op_id` and stores an inverse action in a `pending_undo` D1 table with 30s TTL." This is the right call but the implementation detail is load-bearing. The inverse action generator must handle: (1) ban undo = unban (already exists); (2) remove-post undo = approve (this requires GAW API cooperation we don't have — can only be a "mark as removed/pending review" in our DB); (3) sticky undo = unsticky (the broken auto-unsticky regression from B13 must be fixed first). The undo table must be append-only (no UPDATE) to preserve audit integrity.
- **Implementation sketch:** Migration 032: `CREATE TABLE pending_undo (id INTEGER PRIMARY KEY, client_op_id TEXT UNIQUE, action_type TEXT, target_json TEXT, inverse_payload TEXT, expires_at INTEGER)`. Bulk-action endpoints write one row per op. `POST /mod/op/undo` accepts `client_op_id`, verifies within TTL (30s), executes inverse, appends audit row with `correlated_action = original_action_id`. Cron TTL cleanup: `DELETE FROM pending_undo WHERE expires_at < ?` in retentionPurgeTick.
- **Effort:** M (1 day — migration + undo endpoint + cron cleanup + integration with 2 bulk endpoints)
- **Risk:** Md — inverse action must be correct per action type; wrong inverse is worse than no undo
- **Dependency:** bulk-action endpoints (V11 item #5); auto-unsticky fix (V11 item #28)
- **Success metric:** undo endpoint P99 < 200ms; zero failed undo attempts in first 48h; audit chain correctly shows undo row correlated to original
- **Stretch ambition:** extend undo TTL to 60s for bulk actions (higher stakes, more time needed); store undo state in Durable Object for real-time TTL countdown visible in UI

### 21. Structured AI output schema enforcement (JSON mode)
- **Why through backend lens:** Current Llama calls use freeform text prompts with regex/string parsing on the response. The `quality guards` in modmail AI (line 4761) include escape-pollution detection and foreign-script filtering — these exist because Llama sometimes returns malformed JSON or wraps the JSON in markdown fences. For ban-suggest, the worker does `JSON.parse(raw)` with a try/catch fallback. Workers AI supports `response_format: { type: "json_object" }` for models that support it (Llama 3.3-70B does via the `@cf/meta/llama-3.3-70b-instruct-fp8-fast` endpoint). Enforcing structured output eliminates the parsing brittle-ness and removes the need for post-processing quality guards.
- **Implementation sketch:** For every AI call that expects JSON output, add `response_format: { type: "json_object" }` to the Workers AI request. Also define a JSON Schema for each endpoint's expected output and validate the response against it before returning to client. On schema mismatch: retry once (the model might have hallucinated a field name). After 2 failures: return `{ ok: false, error_code: 'AI_MALFORMED_OUTPUT' }` so the client can show a meaningful error instead of a silent null.
- **Effort:** M (1 day — per-endpoint schema definitions + validation + retry logic)
- **Risk:** Lo — response_format is additive; schema validation catches errors that currently slip through silently
- **Dependency:** none; Workers AI already supports response_format
- **Success metric:** zero JSON parse errors in AI response handling post-deploy; quality-guard rejection rate drops to < 1% (from current ~5% estimated)
- **Stretch ambition:** use Workers AI's function-calling mode (tool use) for the Intel Drawer next-best-action endpoint — structured action selection instead of free-form text

### 22. Workers AI streaming for ban-suggest and shift-digest
- **Why through backend lens:** Long AI responses (shift digest, behavior summary) block the response until Llama finishes. For a 500-word shift digest at Llama 3.3-70B, that's 3-5 seconds of latency before the client sees anything. Workers AI supports streaming via `stream: true` in the request and returns an `EventSource`-compatible stream. The extension could begin rendering the digest as tokens arrive, improving perceived performance dramatically. The worker must proxy the stream to the client without buffering the full response first.
- **Implementation sketch:** For `/ai/shift-digest` (new endpoint in V11) and `/ai/health-summarize`: pass `stream: true` to Workers AI; return `new Response(aiResponse.body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })`. Extension client uses `EventSource` or `ReadableStream` to consume tokens incrementally. Non-streaming callers (ban-suggest, short AI calls) remain unchanged.
- **Effort:** M (1 day — streaming path in 2 endpoints + extension EventSource client)
- **Risk:** Md — streaming responses bypass the safeJson body-size cap; need to enforce a token budget on the streaming side separately
- **Dependency:** shift-digest endpoint (new in V11); extension EventSource client
- **Success metric:** first token of shift digest rendered in < 500ms instead of 3-5s; user-perceived latency for long AI outputs drops 80%
- **Stretch ambition:** stream the Intel Drawer next-best-action response — mods see AI reasoning appear token by token in the drawer, reducing perceived wait time

### 23. `/version` endpoint deploy correlation (the hardcoded string problem)
- **Why through backend lens:** `WORKER_VERSION = '9.4.6'` at line 51 is the source of truth for THIS deploy. `/version` handler (line 1871) IGNORES this constant — it fetches `version.json` from GitHub via KV cache. The result: `/version` can return a DIFFERENT version than the worker actually running if the KV cache is stale or if GitHub version.json hasn't been updated. This creates a false sense of version parity. The fix: `/version` must return `WORKER_VERSION` as `deployed_version`, and separately return the GitHub version.json content as `available_version`. These are different concepts: what's running vs what's available for update.
- **Implementation sketch:** `handleVersion` response: `{ deployed_version: WORKER_VERSION, available_version: payload?.version, deploy_id: env.CF_VERSION_METADATA?.id, _cache: 'hit|miss' }`. Extension compares `deployed_version` (what's running) against its own compiled version for compatibility checks. `available_version` is what the update-check flow uses. These are properly separated concerns.
- **Effort:** S (2 hours)
- **Risk:** Lo — extension must handle the new response shape; backward-compat: keep `version` field as alias for `deployed_version`
- **Dependency:** none
- **Success metric:** `/version` always returns the running worker's actual version; version-mismatch detection works correctly during a partial rollout
- **Stretch ambition:** extension sends its own version in `x-ext-version` header; worker logs version skew to Analytics Engine; lead gets alerted if 3+ mods are running > 1 minor version behind

### 24. Security: remove `'unsafe-inline'` style-src (TS-2 + worker-side CSP)
- **Why through backend lens:** TS-2 in BACKLOG calls out `unsafe-inline` in popup CSP. The worker-side concern is different: the worker's CORS `access-control-allow-headers` currently includes `content-type,x-mod-token,x-lead-token,x-discord-id`. The `x-discord-id` header was explicitly removed from `aiCallerKey` in v9.4.1 (PR2-C-4) because it allowed bypass. But it's still in the allowed CORS headers — any client can send it, the worker just ignores it. Removing it from the CORS allowed-headers list closes a footgun: a future developer might re-wire `x-discord-id` thinking it's safe because it's in the allowed-headers.
- **Implementation sketch:** Remove `x-discord-id` from `access-control-allow-headers` string in the OPTIONS handler (line 1732). Grep for any remaining handler that reads `x-discord-id` — there should be none after v9.4.1. If found, remove those reads too. Also: audit `CORS_STRICT_ORIGINS` — `https://www.greatawakening.win` (with www) is in the set, but does the site serve with www? If not, it's a dead entry that adds confusion.
- **Effort:** S (2 hours)
- **Risk:** Lo — if any client legitimately sends x-discord-id for non-auth purposes, it will be preflight-blocked. Audit confirms no such callers after v9.4.1.
- **Dependency:** none
- **Success metric:** CORS preflight no longer advertises x-discord-id; security review clean
- **Stretch ambition:** Content-Security-Policy header on all worker responses (workers can emit CSP for API responses to restrict what browsers do with the JSON)

### 25. R2 immutable evidence anchoring (partial implementation now, full in v12)
- **Why through backend lens:** BACKLOG item "forensic-grade chain integrity" defers R2 immutable anchor to v12. But the V11 action-diff audit (item #9) and the ai_hold_queue (item #10) create significantly more audit-critical data. The partial step we can take NOW without the full v12 investment: for every resolved ban (the highest-stakes audit event), write a SHA-256 fingerprint of the `actions` row + the `diff_json` + the Merkle chain head to R2 under `audit-anchors/<action_id>.json`. R2 objects are write-once-readable (no overwrite by default if the worker enforces the key pattern). This is not true immutability (the worker could still delete the R2 key), but it creates a separately stored copy that would need to be separately compromised.
- **Implementation sketch:** In `appendAuditAction`: after successful D1 write, for actions with `action LIKE 'ban.%' OR action LIKE 'unban.%'`: compute fingerprint = `{ action_id, action_type, mod, target, ts, hmac, chain_head_hash }`, write to R2 key `audit-anchors/<action_id>.json`. Fire-and-forget via `ctx.waitUntil`. Zero latency impact on the ban action itself.
- **Effort:** S (4 hours — R2 write in appendAuditAction for ban actions only)
- **Risk:** Lo — additive write, existing paths unaffected; R2 EVIDENCE binding already exists
- **Dependency:** none
- **Success metric:** every ban action has a corresponding R2 anchor object within 5s of the action; anchor count matches ban action count in D1 after 24h
- **Stretch ambition:** R2 bucket with Object Lock enabled (CF R2 now supports WORM — Write Once Read Many) for true immutability; external verifier can independently confirm chain integrity without access to D1

---

## B. WHAT V11_PLAN MISSED (in backend lens)

**1. The Analytics Engine binding name bug is a live P0 nobody has named.** `handleMetricsWrite` checks `env.ANALYTICS_ENGINE` but the binding is `MOD_METRICS`. Every `/metrics/write` call is silently 503ing RIGHT NOW. V11_PLAN talks about adding a worker health metrics widget (item #18) and assumes the Analytics Engine path works. It doesn't. Fix this before building anything on top of it.

**2. No cron task isolation or wall-clock budgeting.** V11_PLAN adds the AI shift digest and the mod-profile aggregation as cron-driven features. The existing cron already runs 7 tasks in parallel with no timeout bounds. Adding more unbounded tasks to a 5-minute cron window with no per-task budget is how you get silent cron failures at scale. The morning plan treats cron as free capacity; it isn't.

**3. KV write amplification at AI scale.** V11_PLAN ships the AI hold queue, the j/k approve-reject flow, the shift digest, and the mod-profile AI summary — all going through `aiPreflight` which does 3-4 KV writes per call (minute check, day check, global check, circuit breaker check). At 15 mods using AI endpoints simultaneously, the KV write rate approaches the eventually-consistent threshold where rate-limiting KV buckets become unreliable — exactly the failure mode they're designed to prevent.

**4. EXTENSION_ID_ALLOWLIST rotation has no runbook and no hot-swap path.** V11_PLAN mentions CWS publish as a Wave 1 dependency but doesn't address the two-ID transition window. If the old dev ID is decommissioned when the CWS ID goes live, every `/admin/*` call from every mod fails until the next wrangler deploy. This is a 30-second deploy to fix but a 5-minute outage window without a runbook.

**5. No idempotency on bulk actions creates a correctness risk for the flagship Wave 1 feature.** V11_PLAN lists bulk-action undo as the #1 correctness risk (correctly) but doesn't name the idempotency gap on the worker side. If a mod clicks "Remove 12" and the network times out, does the extension retry? If yes, 12 items get removed twice. There's no `client_op_id` deduplication mechanism in the current worker. The toast-undo flow (item #19) and the bulk-action flow (item #5) both need idempotency keys before they're safe to ship.

---

## C. ARCHITECTURE BETS (structural calls)

**Bet 1: Introduce Cloudflare Queues for async work.** The cron-drain pattern (enrichment, Discord retry) is a polling anti-pattern dressed up as async. CF Queues is the right primitive for event-driven async work. This is a prerequisite for the brigade detector (V11 item #25), which needs sub-minute latency between "new post ingested" and "brigade verdict." Cron at 5-minute intervals can't deliver that. Queues can.

**Bet 2: Analytics Engine as the observability substrate for all of V11.** We have the binding wired. Fix the naming bug and emit a data point on every request. V11 ships ~6 new endpoints, 2 new cron tasks, and the AI hold queue — none of which have any telemetry today. Without per-endpoint P99 in Analytics Engine, we're shipping V11 blind. This is a structural call to make AE the single pane of observability before the first V11 endpoint goes out.

**Bet 3: Unify AI output into ai_hold_queue as the single AI substrate.** Today: 4 separate AI output surfaces (proposals, ai_suspect_queue, ephemeral ban-suggest, KV tard-suggestions). V11 adds more AI surfaces. The right structural call is one table with a `kind` discriminator — not because it's cleaner, but because it's the only way to give the j/k hold queue meaningful coverage across ALL AI suggestions, not just one category. Make the architectural bet now before V11 adds a 5th and 6th AI output surface.

**Bet 4: Structured error taxonomy before V11 ships.** The 15-mod team will be the test audience for every new V11 feature. If a new endpoint fails, they see a raw error string. With error codes, the extension can show "AI rate limited — try again in 45s" vs "service unavailable — contact lead". This is a structural call to treat error handling as a first-class API contract, not an afterthought.

**Bet 5: Idempotency keys as a standard primitive.** The bulk-action + toast-undo flow in V11 Wave 1 requires idempotency. Rather than implementing it ad-hoc for bulk actions, make `client_op_id` a standard field accepted by ALL mutating endpoints. The cost is a KV lookup per mutating request (2ms); the benefit is a correctness guarantee across the entire mutation surface, including future features. This is the structural call that prevents the "mod clicked twice, got two bans" bug class permanently.

---

## D. RISKS (top 5 backend risks v11 ships into)

**Risk 1: KV write amplification breaks AI rate-limiting at peak.** V11 ships the AI hold queue, shift digest, mod-profile AI, and the j/k approve-reject flow — all going through `aiPreflight`. If 15 mods hit AI endpoints in a coordinated burst (e.g., during a raid when everyone is in the hold queue), KV write pressure exceeds the eventually-consistent safety margin. The circuit breaker and rate-limit state stored in KV become unreliable. Mods over-consume AI budget because the cap isn't enforcing. Provider bill spikes. This risk is currently unnamed and unmitigated.

**Risk 2: Bulk-action undo has no idempotency and no inverse-action correctness guarantee.** "Remove 12" is the Wave 1 flagship interaction. The inverse for "remove post" in our context is ambiguous — we cannot un-remove a post on GAW's backend (we don't control it). The undo can only be a worker-side state change ("mark as approved in OUR system") that doesn't actually restore the post on the site. Mods who expect undo to be true reversal will be confused. This needs clear UX communication AND a precise inverse-action contract on the backend before ship.

**Risk 3: D1 cold start during a raid event.** V11 depends on D1 for: ai_hold_queue reads/writes, bulk-action logging, mod-profile aggregation, pending_undo table, action-diff storage. If D1 experiences regional degradation during a raid (exactly when the tool is needed most), all these surfaces fail simultaneously. Current retry logic: zero. This is the single-point-of-failure risk that V11 makes worse by adding more D1-dependent surfaces.

**Risk 4: EXTENSION_ID_ALLOWLIST single-string format blocks CWS rollout.** The allowlist is one string in wrangler.jsonc. Adding the CWS ID requires a wrangler deploy. During the deploy window (30-60 seconds), new extension installs from CWS will 403 on all `/admin/*` calls. For a 15-mod team onboarding from a CWS link simultaneously, this creates a confusing first impression. The fix is trivial (comma-separated list + code change to split) but must ship BEFORE CWS rollout begins.

**Risk 5: The monolithic switch-statement router scales to ~125+ cases in V11.** Today: ~120 cases. V11 adds: `/admin/queue/ai-flagged` (3 endpoints), `/mod/op/undo` (1), `/admin/audit/mod-profile` (1), `/ai/shift-digest` (1), `/ai/mod-summary` (1), `/admin/audit/diff` (1) = ~8 new cases. The router is a single switch statement at line 11808. Each new endpoint increases the cognitive load of the file. Not a runtime performance issue (JS switch is O(1) with JIT), but a maintenance risk: it becomes harder to audit which endpoints exist, which require lead vs mod auth, which are strict-path vs open. The V11_PLAN explicitly rules out a worker rewrite — correct — but a lightweight router middleware (function dispatch table) could replace the switch without a rewrite.

---

## E. CTO SYNTHESIS NOTES

If the CTO can ship only 5 backend things from this list, ship these:

**1. Fix the Analytics Engine binding name bug (item #8)** — P0, live bug, 30 minutes. Nothing in V11 observability works until this is fixed. Do it today.

**2. Deploy-correlation ID in every response header (item #1)** — 2 hours. V11 ships 6+ new endpoints; we need deploy identity in every trace to correlate issues to builds. Zero latency cost.

**3. Idempotency keys as a standard primitive (item #6)** — before Wave 1 ships. The bulk-action flow and toast-undo flow are the Wave 1 flagship and they break without server-side idempotency. This is the correctness gate for the most important V11 feature.

**4. EXTENSION_ID_ALLOWLIST hot-swap path (item #13)** — before CWS publish. Not shipping this before CWS rollout means a guaranteed 403 incident for all 15 mods on day 1 of the public launch. 2-hour fix, infinite frustration avoided.

**5. ai_hold_queue table + `/admin/queue/ai-flagged` endpoint (items #10, #16)** — Wave 1 dependency. The j/k hold queue (V11 item #3) is listed as a top-3 V11 feature. It has zero backend today. These two items together are the complete backend for it. M effort (2 days), unlocks Wave 1's most strategically important new feature.
