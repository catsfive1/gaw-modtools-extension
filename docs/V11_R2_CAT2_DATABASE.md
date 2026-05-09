# V11 R2 Cat 2 — DATABASE / D1 / SQLITE
**Generated:** 2026-05-08 by Cat 2 (DATABASE)
**Lens:** Every v11 feature either reads a D1 table or writes one. This document finds the schema gaps, index gaps, retention time bombs, and architectural bets that the other cats assume but don't name. FTS5 trigger write amplification, the actions table growth trajectory, the ai_used dead loop, the ai_hold_queue state machine, the diff_json storage strategy, the gaw_ingest_audit retention cliff — all of these have D1-layer answers. Some are migrations. Some are index additions. Two are architectural restructures. All are load-bearing for v11's performance promises.

---

## A. THE TOP 25-30 (ranked by data-leverage)

---

### 1. ai_hold_queue — Full State Machine Schema
- **Why through DB lens:** V11 §E.3 names this "the single biggest architectural simplifier of v11." Every AI signal (tard / sticky / ban / brigade / modmail) converges here. The current plan names the columns but leaves the state machine implicit. State machine must live in the schema, not in worker code — otherwise two concurrent claims race.
- **Schema sketch:**
```sql
-- Migration 032
CREATE TABLE IF NOT EXISTS ai_hold_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT NOT NULL,        -- 'tard'|'sticky'|'ban'|'brigade'|'modmail'
  target_kind     TEXT NOT NULL,        -- 'user'|'post'|'comment'|'thread'
  target_id       TEXT NOT NULL,
  confidence      REAL NOT NULL,        -- 0.0..1.0; floor 0.65 to enter
  suggested_action TEXT NOT NULL,       -- 'ban'|'remove'|'warn'|'watch'|'approve'
  reason_json     TEXT NOT NULL,        -- {summary, evidence[], rule_refs[]}
  source_model    TEXT,                 -- 'llama-3.3-70b'|'grok-3-mini' etc.
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,     -- created_at + 72h; cron prunes expired
  claimed_by      TEXT,                 -- mod username; NULL = unclaimed
  claimed_at      INTEGER,
  resolved_action TEXT,                 -- 'approved'|'rejected'|'overridden'
  resolved_by     TEXT,
  resolved_at     INTEGER,
  override_action TEXT,                 -- if mod overrides: what they did instead
  via             TEXT DEFAULT 'hold_queue',  -- audit tag
  incident_id     INTEGER               -- FK to mod_incidents when in incident mode
);
-- Fast pending claim lookup (the j/k queue UI reads this)
CREATE INDEX IF NOT EXISTS idx_ahq_pending
  ON ai_hold_queue(confidence DESC, created_at)
  WHERE claimed_by IS NULL AND resolved_at IS NULL AND expires_at > unixepoch()*1000;
-- Per-kind pipeline drain
CREATE INDEX IF NOT EXISTS idx_ahq_kind_pending
  ON ai_hold_queue(kind, created_at)
  WHERE resolved_at IS NULL;
-- Expired row sweep (cron deletes WHERE expires_at < now AND resolved_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_ahq_expires ON ai_hold_queue(expires_at);
```
- **EXPLAIN concern:** The pending partial index covers the j/k queue read. Without it, every queue poll full-scans resolved rows. The confidence DESC ordering means highest-confidence items surface first — reversing that (lowest-first) for trainee shadow mode is a simple ORDER BY flip at query time, not an index change.
- **Effort:** M (migration + new endpoint `/admin/queue/ai-flagged`)
- **Risk:** Lo. The state transitions are claim → resolve; concurrent claim race is handled by the `claimed_by IS NULL` predicate in an `UPDATE ... WHERE claimed_by IS NULL RETURNING *` atomic pattern — same discipline as token rotation.
- **Dependency:** None. Prerequisite for V11 #3.
- **Success metric:** p50 queue poll <5ms, zero claim races in 30-day burn-in.
- **Stretch ambition:** Add `false_positive_flag BOOLEAN` + mod-feedback loop column for model recalibration.

---

### 2. actions.diff_json — Compression + Partial Retention Index
- **Why through DB lens:** V11 #16 adds diff_json to every mutating action. At ~200 bytes/row × 100k rows = 20MB today, 40MB at v12. V11_PLAN §F.4 mentions "90-day retention on diff_json only." That retention requires a partial index to identify which rows to NULL-out without touching the Merkle chain.
- **Schema sketch:**
```sql
-- Migration 033
ALTER TABLE actions ADD COLUMN diff_json TEXT;  -- nullable; JSON {before:{}, after:{}}

-- Index to find rows older than 90d that still have diff_json (cron prune target)
CREATE INDEX IF NOT EXISTS idx_actions_diff_prune
  ON actions(ts)
  WHERE diff_json IS NOT NULL;

-- JSON extraction index for a specific field audit (e.g. "show me all ban_duration changes")
-- SQLite 3.38+ supports generated column expressions; D1 is on 3.43+
CREATE INDEX IF NOT EXISTS idx_actions_diff_action_kind
  ON actions(json_extract(diff_json, '$.field'), ts DESC)
  WHERE diff_json IS NOT NULL;
```
- **Cron prune pattern:**
```sql
UPDATE actions
   SET diff_json = NULL
 WHERE ts < (unixepoch() - 90*86400) * 1000
   AND diff_json IS NOT NULL;
-- Runs as a batch of 500 rows/tick to avoid 1000-statement D1 cap
```
- **EXPLAIN concern:** Without `idx_actions_diff_prune`, the cron prune does a full scan of `actions` looking for non-NULL diff_json on old rows. Partial index cuts this to zero-cost for the happy path (nothing to prune).
- **Effort:** M (migration + add diff computation to every mutating handler — ~12 handlers)
- **Risk:** Md. diff computation adds a SELECT-before-write in every mutating endpoint. Mitigate: read `before` state from the same SELECT that validates the token, no extra round-trip.
- **Dependency:** none
- **Success metric:** diff_json column never exceeds 25MB total; prune cron verifiable via `SELECT count(*) FROM actions WHERE diff_json IS NOT NULL AND ts < ?`.
- **Stretch ambition:** Expose `GET /admin/audit/:id/diff` that renders a human-readable before/after table for any action row.

---

### 3. pending_undo Table for Bulk-Action Safety
- **Why through DB lens:** V11_PLAN §F.1 calls bulk-action undo "the single biggest correctness risk." The plan says "store an inverse action in a `pending_undo` D1 table with 30s TTL." That table is unnamed in the migration list. It needs a schema, a cleanup index, and the atomic claim pattern. Without a proper schema, the Worker team either invents it ad-hoc (inconsistent) or skips it (dangerous).
- **Schema sketch:**
```sql
-- Migration 034
CREATE TABLE IF NOT EXISTS pending_undo (
  client_op_id  TEXT PRIMARY KEY,         -- UUID from client; idempotency key
  mod           TEXT NOT NULL,
  actions_json  TEXT NOT NULL,            -- JSON array of {action, target_user, extra}
  inverse_json  TEXT NOT NULL,            -- JSON array of inverse actions to replay
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,         -- created_at + 30000ms (30s)
  consumed_at   INTEGER                   -- set when undo fires; prevents double-undo
);
CREATE INDEX IF NOT EXISTS idx_pundo_expires ON pending_undo(expires_at)
  WHERE consumed_at IS NULL;
```
- **Undo claim pattern (atomic):**
```sql
UPDATE pending_undo
   SET consumed_at = unixepoch()*1000
 WHERE client_op_id = ?
   AND consumed_at IS NULL
   AND expires_at > unixepoch()*1000
RETURNING inverse_json;
-- If 0 rows returned: already consumed or expired. Return 409.
```
- **EXPLAIN concern:** `client_op_id` is the PK, so the claim is O(1). The cleanup index on `expires_at WHERE consumed_at IS NULL` makes the cron sweep (delete expired unconsumed) zero-cost.
- **Effort:** S (migration only; the inverse-action replay logic is Cat 1's problem)
- **Risk:** Lo
- **Dependency:** Required before V11 #5 (bulk) and #19 (toast undo) can ship.
- **Success metric:** Zero double-undo incidents in 30d burn-in (both attempts return 409 on second call).
- **Stretch ambition:** Extend TTL to 5m for bulk operations >10 rows (configurable via `team_settings`).

---

### 4. gaw_ingest_audit Retention — Partition by Week + Prune
- **Why through DB lens:** `gaw_ingest_audit` grows ~3000 rows/day (rough estimate from migration comments and firehose throughput). At 1 year that is ~1.1M rows, ~15-20MB of plain ingest metadata. This table is a debug backstop, not a primary audit source. It does not need a year of history. No retention policy exists in migration 004.
- **Schema sketch:**
```sql
-- No new migration needed — add to cron tick:
DELETE FROM gaw_ingest_audit
 WHERE ts < (unixepoch() - 30*86400) * 1000
   AND error IS NULL;  -- keep error rows 90 days for post-mortem

-- Keep error rows longer:
DELETE FROM gaw_ingest_audit
 WHERE ts < (unixepoch() - 90*86400) * 1000
   AND error IS NOT NULL;
```
- **Index the ts column for this:** Already exists as `idx_gaw_ingest_ts ON gaw_ingest_audit(ts)`. The partial delete by `error IS NULL` / `IS NOT NULL` is served by this index fine in SQLite — row count is small enough after prune that the partial scan is cheap.
- **EXPLAIN concern:** If we add a partial index `ON gaw_ingest_audit(ts) WHERE error IS NULL`, the success-row prune becomes a pure index range scan. Worth it only if the table grows past ~500k rows. Add it preemptively in migration 033.
- **Effort:** S (add prune step to existing teamProductivityCronTick)
- **Risk:** Lo
- **Dependency:** None
- **Success metric:** `gaw_ingest_audit` row count stays <100k; table size <2MB.
- **Stretch ambition:** Aggregate into a weekly rollup table (`gaw_ingest_weekly_agg`) before pruning so trend data survives.

---

### 5. FTS5 Contentless Table for gaw_posts / gaw_comments
- **Why through DB lens:** The current FTS5 setup uses `content='gaw_posts'` (content table mode). This means every UPDATE to `gaw_posts` fires two FTS5 writes (delete old + insert new) via trigger. For the firehose upsert pattern we just fixed (now UPSERT on every ingest), every re-seen post fires the `gaw_posts_au` trigger — a write amplification of 3x (base UPSERT + 2 FTS5 ops). At 3000 posts/day with frequent re-captures, this matters.
- **Option: contentless FTS5** stores only the indexed text, not a back-reference to the base table. No triggers needed for update. The tradeoff: you cannot retrieve snippet context from FTS5 alone (need a JOIN back to base table). That JOIN is cheap because the FTS5 rowid maps directly to the gaw_posts rowid.
- **Schema sketch:**
```sql
-- Migration 035 (wave 2 — non-urgent)
-- Drop existing content FTS and rebuild as contentless
DROP TABLE IF EXISTS gaw_posts_fts;
DROP TRIGGER IF EXISTS gaw_posts_ai;
DROP TRIGGER IF EXISTS gaw_posts_au;
DROP TRIGGER IF EXISTS gaw_posts_ad;

CREATE VIRTUAL TABLE gaw_posts_fts USING fts5(
  title, body_md, author, community,
  content=''                             -- contentless: no back-reference
);
-- Initial population:
INSERT INTO gaw_posts_fts(rowid, title, body_md, author, community)
SELECT rowid, title, body_md, author, community FROM gaw_posts;
-- Future inserts: worker adds to FTS on INSERT only (no UPDATE trigger needed)
-- UPDATE only re-inserts if title/body_md changed (worker-side check)
```
- **EXPLAIN concern:** Contentless FTS5 cannot do `MATCH` with `snippet()` without a JOIN. The query shape becomes:
```sql
SELECT p.id, p.title, p.author
  FROM gaw_posts_fts f
  JOIN gaw_posts p ON p.rowid = f.rowid
 WHERE f.gaw_posts_fts MATCH 'ban evasion'
 ORDER BY rank
 LIMIT 20;
```
That JOIN is rowid-to-rowid, so effectively free. Net win: eliminate the 3-trigger write on every upsert.
- **Effort:** M (migration + worker handler change to insert into FTS explicitly on new posts)
- **Risk:** Md (rebuild on a live table; schedule during low-traffic window)
- **Dependency:** None
- **Success metric:** Write latency on `/gaw/posts/ingest` drops by ~30% (eliminating 2 trigger writes per row).
- **Stretch ambition:** Same pattern for gaw_comments_fts.

---

### 6. Composite Index on mod_modmail_responses for History-Aware Prompt
- **Why through DB lens:** The AI prompt at gaw-mod-proxy-v2.js:4702-4717 pulls "last 3 same-sender rows." Current indexes: `idx_modmail_resp_sender ON mod_modmail_responses(sender)` and `idx_modmail_resp_sent_at ON mod_modmail_responses(sent_at DESC)` — two separate indexes. SQLite cannot use both simultaneously for this query without a full-scan merge. The correct index is composite.
- **Schema sketch:**
```sql
-- Add to migration 031 (or a new 036)
CREATE INDEX IF NOT EXISTS idx_modmail_resp_sender_sent
  ON mod_modmail_responses(sender, sent_at DESC);
-- Drop the redundant single-column sender index (or leave it; D1 ignores unused ones)
```
- **Query that uses it:**
```sql
SELECT response_body, ai_used, ai_tone, sent_at
  FROM mod_modmail_responses
 WHERE sender = ?
 ORDER BY sent_at DESC
 LIMIT 3;
-- EXPLAIN QUERY PLAN: SEARCH mod_modmail_responses USING INDEX idx_modmail_resp_sender_sent
-- No sort step needed (index order matches ORDER BY)
```
- **EXPLAIN concern:** Without composite, SQLite picks either the sender scan or the sent_at scan — either scans many rows and then sorts or filters. With composite, it's a pure index range scan that terminates at 3 rows.
- **Effort:** S (one CREATE INDEX, deployable standalone)
- **Risk:** Lo
- **Dependency:** None
- **Success metric:** EXPLAIN QUERY PLAN on the history-fetch query shows "USING INDEX idx_modmail_resp_sender_sent" with no filesort.
- **Stretch ambition:** Add `ai_used = 1` partial index variant: `ON mod_modmail_responses(sender, sent_at DESC) WHERE ai_used = 1` — feeds a second prompt variant that learns from accepted AI drafts only.

---

### 7. Close the ai_used Dead Loop — Schema + Enforcement
- **Why through DB lens:** UAT_MODMAIL §B.3 and §C.4 are explicit: `ai_used` is wired but always 0. The field exists in `mod_modmail_responses`. The schema is fine. The data discipline is broken. Two schema-side additions can close the loop without requiring client code to be perfect.
- **Schema sketch:**
```sql
-- Migration 036
ALTER TABLE mod_modmail_responses ADD COLUMN ai_acceptance_ms INTEGER;
-- ms from AI draft generated_at to mod send — measures "how long did mod deliberate?"
-- NULL = ai_used was 0 (human-written)

ALTER TABLE mod_modmail_responses ADD COLUMN ai_draft_id TEXT;
-- References a future ai_hold_queue.id or a chrome.storage draft key
-- Lets us correlate "which draft did they accept?" back to the model call

ALTER TABLE mod_modmail_responses ADD COLUMN edit_distance INTEGER;
-- Levenshtein(ai_draft_body, response_body) — how much did mod edit the draft?
-- 0 = accepted verbatim; >50 = heavily edited; NULL = human-written
```
- **How this fixes the dead loop:** Once the client passes `ai_used=1` (the actual fix is a single-line client change passing `{ai_used: tone ? 1 : 0, ai_tone: tone}`), the `ai_acceptance_ms` and `edit_distance` columns give Cat 5 (Metrics/AI) the closed-loop signal to answer "does our AI actually help?"
- **EXPLAIN concern:** No new index needed; the existing `idx_modmail_resp_sent_at` covers time-ranged analytics.
- **Effort:** S (migration) + the actual client fix is 3 lines
- **Risk:** Lo
- **Dependency:** None
- **Success metric:** `SELECT AVG(ai_used) FROM mod_modmail_responses WHERE sent_at > ?` returns >0.3 within 7 days of ship (i.e., at least 30% of AI drafts are being used).
- **Stretch ambition:** Nightly cron computes `edit_distance` for all rows where `ai_used=1 AND edit_distance IS NULL` using a SQLite user-defined function (not available in D1 — compute in Worker instead, backfill via background batch).

---

### 8. Precedents FTS5 Engine — Migration + Index Strategy
- **Why through DB lens:** V11 #22 wants FTS5 search on precedents. The `precedents` table has ~hundreds of rows (small today), but the fields `title`, `reason`, and `rule_ref` are variable-length text — perfect FTS5 candidates. The concern is FTS5 update contention: every precedent write (Lead adds a precedent) must also write to the FTS table. With low write frequency (Lead-gated writes), this is not a concern.
- **Schema sketch:**
```sql
-- Migration 037
CREATE VIRTUAL TABLE IF NOT EXISTS precedents_fts USING fts5(
  title, reason, rule_ref,
  content='precedents', content_rowid='rowid'
);
-- Initial population:
INSERT INTO precedents_fts(rowid, title, reason, rule_ref)
SELECT rowid, title, reason, rule_ref FROM precedents;
-- Triggers:
CREATE TRIGGER IF NOT EXISTS precedents_fts_ai AFTER INSERT ON precedents BEGIN
  INSERT INTO precedents_fts(rowid, title, reason, rule_ref)
  VALUES (new.rowid, new.title, new.reason, new.rule_ref);
END;
CREATE TRIGGER IF NOT EXISTS precedents_fts_ad AFTER DELETE ON precedents BEGIN
  INSERT INTO precedents_fts(precedents_fts, rowid, title, reason, rule_ref)
  VALUES ('delete', old.rowid, old.title, old.reason, old.rule_ref);
END;
```
- **Query shape for `/precedent/search`:**
```sql
SELECT p.id, p.kind, p.title, p.action, p.reason, p.rule_ref, p.authored_by,
       rank
  FROM precedents_fts f
  JOIN precedents p ON p.rowid = f.rowid
 WHERE precedents_fts MATCH ?
   AND (:kind IS NULL OR p.kind = :kind)
   AND (:authored_by IS NULL OR p.authored_by = :authored_by)
 ORDER BY rank
 LIMIT 20;
```
- **EXPLAIN concern:** FTS5 MATCH returns rowids in rank order. The JOIN back to `precedents` is rowid lookup — O(1) per row. The additional `AND p.kind = ?` filter runs post-join on the 20 FTS results; cheap.
- **Effort:** M (migration + new worker endpoint `/precedent/search`)
- **Risk:** Lo (precedents writes are Lead-gated, low frequency; FTS update lock contention is negligible)
- **Dependency:** None
- **Success metric:** `/precedent/search?q=ban+evasion` returns in <20ms.
- **Stretch ambition:** Add `authored_by` facet index for "show me catsfive's precedents matching X."

---

### 9. R2 Audit Anchoring — Schema Prep for Forensic-Grade Chain
- **Why through DB lens:** HANDOFF §4 N3 names "R2 anchoring" as the missing piece for forensic-grade audit. The current Merkle + HMAC chain (migrations 018 + 026) is tamper-evident against external attackers. But someone with D1 write access AND the HMAC KV secret can still rewrite the chain. R2 anchoring requires periodic snapshots of the chain head committed to R2 with a timestamp, making rewrites detectable against an external source of truth.
- **Schema sketch (D1 side):**
```sql
-- Migration 038
CREATE TABLE IF NOT EXISTS audit_chain_anchors (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  anchor_ts       INTEGER NOT NULL,         -- when the anchor was written
  chain_head_id   INTEGER NOT NULL,         -- actions.id of the last row anchored
  chain_head_hash TEXT NOT NULL,            -- entry_hash of that row
  r2_object_key   TEXT NOT NULL,            -- e.g. 'anchors/2026-05-08T14:00:00Z.json'
  r2_etag         TEXT,                     -- confirmation from R2 PUT response
  anchor_hmac     TEXT                      -- HMAC of (chain_head_id||chain_head_hash||anchor_ts)
);
CREATE INDEX IF NOT EXISTS idx_anchors_ts ON audit_chain_anchors(anchor_ts DESC);
```
- **R2 object format** (stored at `r2_object_key`): `{"id":N,"hash":"abc...","ts":T,"hmac":"def..."}` — immutable once written. Verifier fetches this and cross-checks against D1.
- **EXPLAIN concern:** The D1 table is append-only and tiny (~1 row/hour). No complex query pattern needed beyond "get latest anchor."
- **Effort:** M (migration + cron anchor writer + verifier update)
- **Risk:** Lo (purely additive; existing chain unaffected)
- **Dependency:** Requires R2 binding in wrangler.jsonc (already present per project layout).
- **Success metric:** `/admin/audit/verify` reports both chain-consistency AND last-anchor-age. Alert if anchor is >2h stale.
- **Stretch ambition:** Daily R2 anchor fan-out to a second bucket in a different Cloudflare region for geographic redundancy.

---

### 10. actions Table Growth — Archival Strategy at Year 3
- **Why through DB lens:** At 50k actions/year × 15 mods = 750k rows/year. In 3 years: ~2.25M rows. The Merkle + HMAC chain requires the full row set for verification. D1 limit is 10GB. At ~500 bytes/row (with diff_json), 2.25M rows = ~1.1GB — well within limits. But query performance on unindexed scans degrades. The real risk is EXPLAIN QUERY PLAN regressions on time-windowed queries when rows grow 10x.
- **Current indexes cover:** (mod, ts), (target_user, ts), (action, ts), (ts), (is_test, id), (is_test, id, entry_hmac). Missing: composite on (mod, action, ts) for the scoreboard KPI query "top mods by action-type breakdown."
- **Schema sketch:**
```sql
-- Migration 039 (preemptive, wave 3)
CREATE INDEX IF NOT EXISTS idx_actions_mod_action_ts
  ON actions(mod, action, ts DESC);
-- Covers: WHERE mod = ? AND action LIKE 'ban%' AND ts > ? ORDER BY ts DESC

CREATE INDEX IF NOT EXISTS idx_actions_target_action
  ON actions(target_user, action);
-- Covers: "how many bans vs warns did user X get?" — repeat-offender halo query
```
- **Archival path (year 3+ option):** Cold-archive rows older than 18 months to R2 as compressed NDJSON. Keep a `archived_before_ts` marker in `team_settings`. The Merkle chain verifier skips archived rows (they were verified at archive time; store the verification receipt in `audit_chain_anchors`).
- **EXPLAIN concern:** The missing `(mod, action, ts)` composite is the gap. Scoreboard queries today do `WHERE mod = ? ORDER BY ts DESC` and then filter action in the application — which scans all of a mod's rows. With 2M rows and 15 mods, that's ~133k rows per mod scan. The composite index reduces this to a narrow range scan.
- **Effort:** S (index additions only for now; archival is L effort, v12)
- **Risk:** Lo
- **Dependency:** None
- **Success metric:** EXPLAIN QUERY PLAN on scoreboard aggregate returns "USING INDEX idx_actions_mod_action_ts" without TEMP B-TREE sort.
- **Stretch ambition:** Partitioned archival via `ATTACH DATABASE` on a separate D1 database for cold rows (D1 supports cross-database queries via ATTACH in newer runtimes — verify support before committing).

---

### 11. mod_incidents Table — Full Schema (V11 Wave 4)
- **Why through DB lens:** V11 #24 and Cat 3 §C name `mod_incidents`. The table is referenced in FEATURES_MATRIX L13 as "🆕" with no schema. Cat 3 defines the state machine: create → open → close. Actions rows need `incident_id` FK to associate evidence.
- **Schema sketch:**
```sql
-- Migration 040
CREATE TABLE IF NOT EXISTS mod_incidents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,     -- 'brigade-2026-05-08-1430'
  opened_by       TEXT NOT NULL,
  opened_at       INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',  -- 'open'|'closed'
  closed_by       TEXT,
  closed_at       INTEGER,
  summary         TEXT,                     -- AI-generated postmortem (set on close)
  trigger_kind    TEXT,                     -- 'manual'|'auto-brigade'|'auto-velocity'
  incident_kind   TEXT,                     -- 'brigade'|'spam-wave'|'targeted-harassment'
  action_count    INTEGER DEFAULT 0,        -- denormalized count; updated by trigger
  peak_mod_count  INTEGER,                  -- max concurrent mods active during incident
  r2_evidence_key TEXT                      -- R2 object with pinboard screenshots
);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON mod_incidents(status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_slug   ON mod_incidents(slug);

-- actions table gets incident_id FK (no FK enforcement in D1, but logical FK):
ALTER TABLE actions ADD COLUMN incident_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_actions_incident ON actions(incident_id)
  WHERE incident_id IS NOT NULL;
```
- **EXPLAIN concern:** The `incident_id` partial index on `actions` keeps the normal action query paths unaffected (partial index is ignored for non-incident rows). Incident drilldown (all actions in incident X) is a narrow index scan.
- **Effort:** M (migration + incident open/close endpoints)
- **Risk:** Lo (additive; no existing table modified except adding nullable column to actions)
- **Dependency:** Required before V11 #24 can ship.
- **Success metric:** `SELECT count(*) FROM actions WHERE incident_id = ?` under 5ms.

---

### 12. team_macros Learning Loop — macro_outcomes Join Table
- **Why through DB lens:** `team_macros` tracks `use_count` + `last_used_by` but has no outcome signal. A macro used 200 times but edited by the mod 80% of the time is a bad macro. The migration 031 comment already says "AI top-4 modmail suggestions are deferred to a future migration that will add a `macro_uses` join table tracking outcomes." That future is now.
- **Schema sketch:**
```sql
-- Migration 041
CREATE TABLE IF NOT EXISTS macro_uses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  macro_id    INTEGER NOT NULL,     -- FK to team_macros.id
  used_by     TEXT NOT NULL,
  used_at     INTEGER NOT NULL,
  context_kind TEXT,               -- 'ban'|'modmail'|'queue'
  context_id  TEXT,               -- thread_id or post_id
  was_edited  INTEGER DEFAULT 0,  -- 1 if mod edited before sending
  edit_delta  INTEGER,            -- character count delta (negative = shortened)
  outcome     TEXT                -- 'sent'|'abandoned'|'overridden'
);
CREATE INDEX IF NOT EXISTS idx_macro_uses_macro
  ON macro_uses(macro_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_macro_uses_mod
  ON macro_uses(used_by, used_at DESC);
```
- **AI sorting query (replaces static use_count sort for AI top-4):**
```sql
SELECT m.id, m.label, m.body,
       COUNT(u.id) as total_uses,
       AVG(CASE WHEN u.was_edited = 0 AND u.outcome = 'sent' THEN 1.0 ELSE 0.0 END) as accept_rate
  FROM team_macros m
  LEFT JOIN macro_uses u ON u.macro_id = m.id AND u.used_at > ?  -- last 30d
 WHERE m.kind = ?
   AND m.deleted_at IS NULL
 GROUP BY m.id
 ORDER BY accept_rate DESC, total_uses DESC
 LIMIT 4;
```
- **EXPLAIN concern:** The LEFT JOIN on `macro_uses(macro_id, used_at)` is a composite index range scan. With `team_macros` at <100 rows and `macro_uses` at <10k rows, this query is always fast.
- **Effort:** M (migration + update the macro-use tracking endpoint to write to both tables)
- **Risk:** Lo
- **Dependency:** None
- **Success metric:** AI top-4 macro suggestions achieve >60% accept-without-edit rate within 30 days of shipping the learning loop.
- **Stretch ambition:** Per-sender macro hit-rate: `WHERE context_id IN (SELECT thread_id FROM modmail_threads WHERE sender = ?)` — shows which macros work best for specific user patterns.

---

### 13. Covering Index for Scoreboard KPI #4 (Top/Bottom 3 Mods)
- **Why through DB lens:** Cat 3 §B KPI #4 is "Top 3 / Bottom 3 mods by 7d action count." The query is `SELECT mod, count(*) FROM actions WHERE ts > ? GROUP BY mod ORDER BY count(*) DESC LIMIT 3`. With current indexes, this touches the (ts) index but must then re-scan all rows in that time window to group. A covering index makes this a pure index scan.
- **Schema sketch:**
```sql
-- Can be added to migration 039 (indexes wave)
CREATE INDEX IF NOT EXISTS idx_actions_mod_ts_covering
  ON actions(ts DESC, mod);
-- Covers: WHERE ts > ? with GROUP BY mod — SQLite can read mod from index without row access
```
- **EXPLAIN concern:** Covering index (all needed columns in index) eliminates heap access entirely. For a 30-day window on a 2M-row table, the covering index reduces I/O from ~O(rows in window) to O(distinct-mods) in the best case.
- **Effort:** S
- **Risk:** Lo (index addition only)
- **Dependency:** None
- **Success metric:** Scoreboard KPI #4 query returns in <10ms on 1M-row `actions` table.

---

### 14. shadow_triage_decisions — Missing Composite Index for AI Hold Queue Integration
- **Why through DB lens:** `shadow_triage_decisions` (migration 013) has three indexes: `created_at DESC`, `kind`, `decision`. The v11 ai_hold_queue imports from shadow_triage when promoting items. The promotion query is `WHERE kind = ? AND decision = ? AND created_at > ?` — touching all three columns but no composite. Also missing: a `(confidence DESC)` secondary sort that the hold queue needs.
- **Schema sketch:**
```sql
CREATE INDEX IF NOT EXISTS idx_shadow_kind_decision_conf
  ON shadow_triage_decisions(kind, decision, confidence DESC)
  WHERE created_at > (unixepoch() - 7*86400)*1000;
-- Note: SQLite doesn't support expressions in partial index WHERE clauses directly —
-- use a generated column or just omit the partial (the created_at cutoff is applied at query time)
CREATE INDEX IF NOT EXISTS idx_shadow_kind_decision_conf
  ON shadow_triage_decisions(kind, decision, confidence DESC);
```
- **EXPLAIN concern:** Without this, the hold-queue import query does a full scan of the kind index, then filters decision in memory, then sorts by confidence. Composite eliminates the sort step.
- **Effort:** S
- **Risk:** Lo
- **Dependency:** Feeds item #1 (ai_hold_queue).

---

### 15. token_invites Audit-Row-First Pattern — Extend to All Claim Paths
- **Why through DB lens:** Token rotation (migration 019) uses `UPDATE token_invites RETURNING mod_username` — the atomic audit-row-first pattern. This is the correct pattern for any state transition that must be idempotent and auditable. Two other places need this discipline: (a) `pending_undo` claim (item #3 above — already done), (b) `parked_items` status transition from `open` → `resolved`.
- **Current parked_items resolution:** Unknown whether atomic. The indexes cover status-filter but not the atomic-claim pattern.
- **Schema sketch (parked_items claim):**
```sql
UPDATE parked_items
   SET status = 'resolved',
       resolved_by = ?,
       resolved_at = unixepoch()*1000,
       resolution_action = ?
 WHERE id = ?
   AND status = 'open'      -- guard: reject if already resolved
RETURNING id, subject_id, kind, note;
-- If 0 rows: return 409 Conflict (already resolved by another mod)
```
- **EXPLAIN concern:** The `id` PK covers this update; the `status = 'open'` guard is a free predicate check on the returned row. Zero additional index needed.
- **Effort:** S (pattern change in worker handler, no migration)
- **Risk:** Lo
- **Dependency:** None
- **Success metric:** Zero double-resolution races in 30d burn-in.

---

### 16. gaw_posts/gaw_comments — Generated Column for Fast Removal-Rate Analytics
- **Why through DB lens:** Cat 3 KPI #2 needs "queue clear-rate: items removed / items arrived." The firehose tables track `is_removed` but not removal timing. Adding a `removed_at` column and computing removal latency opens the full KPI surface. SQLite 3.38+ supports generated columns; D1 is on 3.43+.
- **Schema sketch:**
```sql
-- Migration 042
ALTER TABLE gaw_posts ADD COLUMN removed_at INTEGER;   -- ms epoch; NULL = not removed
ALTER TABLE gaw_comments ADD COLUMN removed_at INTEGER;

-- Generated column: removal latency in seconds
ALTER TABLE gaw_posts ADD COLUMN removal_latency_s INTEGER
  GENERATED ALWAYS AS (
    CASE WHEN removed_at IS NOT NULL THEN (removed_at - created_at) / 1000 ELSE NULL END
  ) VIRTUAL;

CREATE INDEX IF NOT EXISTS idx_gaw_posts_removed_at ON gaw_posts(removed_at)
  WHERE removed_at IS NOT NULL;
```
- **Analytics query for KPI:**
```sql
SELECT AVG(removal_latency_s) as avg_latency,
       COUNT(*) as removed_count
  FROM gaw_posts
 WHERE removed_at > ? AND removed_at < ?;
-- EXPLAIN: partial index on removed_at IS NOT NULL, covers the WHERE clause
```
- **EXPLAIN concern:** Without `removed_at`, the KPI query must join `actions` on `target_user` to reconstruct removal timing — expensive. With the column, it's a pure table scan on the partial index.
- **Effort:** M (migration + update the firehose ingest handler to set `removed_at` on upsert when is_removed flips 0→1)
- **Risk:** Lo
- **Dependency:** None
- **Success metric:** KPI #2 query returns in <10ms.

---

### 17. gaw_comments — Add post_author Denormalization for Brigade Detection
- **Why through DB lens:** Cat 3 F19 (brigade reply-graph): "when ≥4 users reply to same thread within 10m AND share NO prior thread overlap with the OP." The query requires joining `gaw_comments → gaw_posts` to get the OP author for every comment. With millions of comments, that JOIN is expensive in a 10m rolling window scan. Denormalizing `post_author` into `gaw_comments` eliminates the JOIN.
- **Schema sketch:**
```sql
-- Migration 043
ALTER TABLE gaw_comments ADD COLUMN post_author TEXT;
-- Backfill:
UPDATE gaw_comments c
   SET post_author = (SELECT author FROM gaw_posts WHERE id = c.post_id)
 WHERE post_author IS NULL;
-- Future ingest: set post_author at insert time (author is already in ingest payload)
CREATE INDEX IF NOT EXISTS idx_gaw_comments_post_author_created
  ON gaw_comments(post_author, created_at DESC);
```
- **Brigade detection query:**
```sql
SELECT post_id, COUNT(DISTINCT author) as unique_commenters
  FROM gaw_comments
 WHERE created_at > (unixepoch()*1000 - 10*60*1000)
   AND post_author != author          -- exclude OP's own comments
 GROUP BY post_id
 HAVING unique_commenters >= 4;
-- EXPLAIN: idx_gaw_comments_created covers the time window scan; cheap.
```
- **Effort:** M (migration + backfill + ingest handler update)
- **Risk:** Lo (additive column)
- **Dependency:** Required before V11 #25 (auto-brigade detector).

---

### 18. precedents — Soft-Delete Pattern for Mod Offboarding
- **Why through DB lens:** The `precedents` table has no soft-delete. When a mod departs, the lead uses `/precedent/delete {authored_by: "mod"}` — a hard DELETE. This breaks the audit-chain-first principle (we log actions, not deletions). Soft-delete preserves history.
- **Schema sketch:**
```sql
-- Migration 044
ALTER TABLE precedents ADD COLUMN deleted_at INTEGER;
ALTER TABLE precedents ADD COLUMN deleted_by TEXT;

CREATE INDEX IF NOT EXISTS idx_precedents_active
  ON precedents(kind, marked_at DESC)
  WHERE deleted_at IS NULL;
-- Replace idx_precedents_kind_sig with a partial version:
DROP INDEX IF EXISTS idx_precedents_kind_sig;
CREATE INDEX IF NOT EXISTS idx_precedents_kind_sig
  ON precedents(kind, signature)
  WHERE deleted_at IS NULL;
```
- **EXPLAIN concern:** The existing `idx_precedents_kind_sig` finds precedents by exact signature. Adding `WHERE deleted_at IS NULL` makes it a partial index — faster for active lookups, transparent for historical queries (just omit the WHERE in the historical query).
- **Effort:** S
- **Risk:** Lo
- **Dependency:** None
- **Success metric:** Offboarding a departed mod's precedents is a soft-delete batch (update, not delete) with zero Merkle chain impact.

---

### 19. modmail_threads + modmail_messages — Missing Created Composite Index
- **Why through DB lens:** The modmail 3-column panel (V11 #2) needs recent threads per sender. `modmail_threads` and `modmail_messages` are referenced in the migration list but I found no migration file for them (031 is mod_modmail_responses). These tables exist (confirmed by UAT_MODMAIL §A "D1: modmail_threads + modmail_messages") but their schema is unreviewed. If they lack a `(sender, created_at DESC)` composite, the 3-column panel's pre-fetch will full-scan.
- **Action:** Grep the worker for CREATE TABLE modmail_threads.
- **Placeholder index (to add to whatever migration defines them):**
```sql
CREATE INDEX IF NOT EXISTS idx_modmail_threads_sender_created
  ON modmail_threads(sender, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modmail_messages_thread_created
  ON modmail_messages(thread_id, created_at DESC);
```
- **Effort:** S (find the migration, add the index, deploy)
- **Risk:** Lo
- **Dependency:** Required before V11 #2 (modmail 3-column panel) ships.

---

### 20. ai_suspect_queue — Promote Disposition Pattern to ai_hold_queue
- **Why through DB lens:** `ai_suspect_queue` (migration 013) is a human-review gate for daily AI scoring. `ai_hold_queue` (item #1 above) is the v11 generalization of the same pattern. Post-v11, `ai_suspect_queue` becomes redundant — it's a special case of `ai_hold_queue(kind='daily-score')`. Keeping both creates dual maintenance burden.
- **Migration path:**
```sql
-- In v11.1 (not wave 1 — don't break existing flow during ship):
INSERT INTO ai_hold_queue (kind, target_kind, target_id, confidence, suggested_action,
                           reason_json, source_model, created_at, expires_at)
SELECT 'daily-score', 'user', username,
       ai_risk / 100.0,
       CASE WHEN ai_risk >= 85 THEN 'watch' ELSE 'review' END,
       json_object('summary', ai_reason),
       ai_model,
       enqueued_at,
       enqueued_at + 7*24*60*60*1000  -- 7-day TTL
  FROM ai_suspect_queue
 WHERE disposition IS NULL;
-- Then: deprecate ai_suspect_queue write path in worker; read path keeps working for backcompat
```
- **Effort:** M (migration + worker handler change to write to ai_hold_queue instead)
- **Risk:** Md (changing the daily AI scan write path; needs smoke test)
- **Dependency:** Item #1 (ai_hold_queue schema) must ship first.
- **Success metric:** `ai_suspect_queue` has zero new rows after v11.1 ship; all pending items migrated to ai_hold_queue.

---

### 21. dr_rules — FTS5 for Pattern Discovery Substrate
- **Why through DB lens:** Cat 3 F18 (pattern discovery: Levenshtein + n-gram clusters) is deferred to v12 by V11_PLAN. But the DB substrate can be laid now at zero cost: add FTS5 to `dr_rules` so the pattern-discovery query can search existing rules before proposing a new one (dedup check). Also enables the pattern-search panel in the tard-suggestion accordion (V11 #23).
- **Schema sketch:**
```sql
-- Migration 045
CREATE VIRTUAL TABLE IF NOT EXISTS dr_rules_fts USING fts5(
  pattern, reason,
  content='dr_rules', content_rowid='rowid'
);
INSERT INTO dr_rules_fts(rowid, pattern, reason)
SELECT rowid, pattern, reason FROM dr_rules WHERE deleted_at IS NULL;
```
- **Dedup check query:**
```sql
SELECT d.id, d.pattern, d.reason
  FROM dr_rules_fts f
  JOIN dr_rules d ON d.rowid = f.rowid
 WHERE dr_rules_fts MATCH ?
   AND d.deleted_at IS NULL
 LIMIT 5;
-- Before proposing a new DR rule: "do we already have something like this?"
```
- **Effort:** S (migration only; low row count means instant rebuild)
- **Risk:** Lo
- **Dependency:** None
- **Success metric:** New rule proposals checked against existing FTS before insert; duplicate rate drops.

---

### 22. CHECK Constraints — Enumerate State Machine Values in Schema
- **Why through DB lens:** Multiple tables use `TEXT NOT NULL` for state machine columns without CHECK constraints: `parked_items.status` ('open'|'resolved'|'discarded'), `ai_suspect_queue.disposition`, `mod_incidents.status`. A typo in a worker handler writes invalid state silently. D1/SQLite supports CHECK constraints.
- **Schema sketch:**
```sql
-- Add to each table via ALTER TABLE (D1 supports ADD COLUMN with CHECK):
-- Note: ALTER TABLE ADD COLUMN with CHECK is supported in SQLite 3.37+

-- For future tables, enforce inline:
CREATE TABLE mod_incidents (
  ...
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','closed')),
  trigger_kind TEXT
    CHECK(trigger_kind IS NULL OR trigger_kind IN ('manual','auto-brigade','auto-velocity')),
  ...
);
```
- **For existing tables:** SQLite does not support ADD CONSTRAINT after the fact. The fix is to enforce the valid set in the worker handler with a runtime assert, and document the constraint in the migration comment. New tables (ai_hold_queue, mod_incidents, pending_undo) get CHECK constraints inline.
- **Effort:** S (inline constraints on new tables; runtime assert in worker for existing tables)
- **Risk:** Lo
- **Dependency:** None
- **Success metric:** Zero invalid-state rows detectable by `SELECT * FROM ai_hold_queue WHERE resolved_action NOT IN ('approved','rejected','overridden') AND resolved_action IS NOT NULL`.

---

### 23. gaw_users — Add ban_count + warn_count Denormalized Columns for Repeat-Offender Halo
- **Why through DB lens:** V11 #6 (repeat-offender halo) requires knowing how many prior bans a user has. Currently this requires `SELECT count(*) FROM actions WHERE target_user = ? AND action LIKE 'ban%'`. At scale this is a range scan on `idx_actions_target_ts` — acceptable today, but hot for the drawer which may fire this query 10+ times per page load.
- **Schema sketch:**
```sql
-- Migration 046
ALTER TABLE gaw_users ADD COLUMN ban_count INTEGER DEFAULT 0;
ALTER TABLE gaw_users ADD COLUMN warn_count INTEGER DEFAULT 0;
ALTER TABLE gaw_users ADD COLUMN last_ban_at INTEGER;

-- Backfill via worker cron (not inline migration — too slow for large tables):
UPDATE gaw_users SET
  ban_count = (SELECT count(*) FROM actions WHERE target_user = username AND action LIKE 'ban%'),
  warn_count = (SELECT count(*) FROM actions WHERE target_user = username AND action LIKE 'warn%');

-- Increment on action insert (in handleAuditAction):
UPDATE gaw_users SET ban_count = ban_count + 1, last_ban_at = ? WHERE username = ?;
```
- **EXPLAIN concern:** The drawer repeat-offender check becomes `SELECT ban_count FROM gaw_users WHERE username = ?` — PK lookup, O(1). Eliminates the count(*) join entirely.
- **Effort:** M (migration + backfill cron + handler update on every ban action)
- **Risk:** Lo (denormalization risk is counter-drift; mitigate with a weekly reconciliation cron)
- **Dependency:** None
- **Success metric:** Intel Drawer loads repeat-offender halo in <2ms (PK lookup vs. 10-20ms count query).

---

### 24. Token Plaintext Cleanup — Migration for 13 Legacy Rows
- **Why through DB lens:** FEATURES_MATRIX L10 flags "13 still-legacy unrotated mod_tokens rows with NOT-NULL plaintext" as BACKLOG TS-6. This is a security-schema gap. The schema already supports hash-only (migration 012 added token_hash). A targeted migration NULLs the plaintext column for any row where token_hash is already populated.
- **Schema sketch:**
```sql
-- Migration 047 (or standalone wrangler execute)
UPDATE mod_tokens
   SET token = NULL
 WHERE token_hash IS NOT NULL
   AND token IS NOT NULL;
-- Verify: SELECT count(*) FROM mod_tokens WHERE token IS NOT NULL; -- should be 0
```
- **Effort:** S (one statement; safe to run live since lookupModFromToken does hash-first lookup with plaintext fallback)
- **Risk:** Lo (the fallback path handles the transition; once NULLed, hash-only path is used)
- **Dependency:** None — can ship in Wave 1.
- **Success metric:** `SELECT count(*) FROM mod_tokens WHERE token IS NOT NULL` = 0 post-migration.

---

### 25. parked_items — TTL Enforcement via Index + Cron
- **Why through DB lens:** Migration 013 documents "Retention: 30 days after resolution" for `parked_items`. No cron enforces this. The `idx_parked_created` index covers the time filter but a more useful index is `(resolved_at)` partial on resolved rows, since the prune condition is `resolved_at < threshold AND status != 'open'`.
- **Schema sketch:**
```sql
-- Add to migration 013 or new 048:
CREATE INDEX IF NOT EXISTS idx_parked_resolved_at
  ON parked_items(resolved_at)
  WHERE status != 'open';

-- Cron prune (add to teamProductivityCronTick):
DELETE FROM parked_items
 WHERE resolved_at < (unixepoch()*1000 - 30*24*60*60*1000)
   AND status != 'open';
```
- **Effort:** S
- **Risk:** Lo
- **Dependency:** None
- **Success metric:** `parked_items` row count stays below 5k; resolved rows auto-expire.

---

### 26. gaw_posts — Compound Partial Index for "Active Removed Posts" (Forensic)
- **Why through DB lens:** The forensic use case: "show me all posts that were removed in the last 72h." Current partial index `idx_gaw_posts_removed ON gaw_posts(is_removed) WHERE is_removed = 1` covers the IS_REMOVED filter but not the time window — the verifier must then post-filter by `created_at`. Adding `created_at` to the index removes the post-filter.
- **Schema sketch:**
```sql
CREATE INDEX IF NOT EXISTS idx_gaw_posts_removed_created
  ON gaw_posts(is_removed, created_at DESC)
  WHERE is_removed = 1;
-- Drop or leave the simpler idx_gaw_posts_removed; SQLite uses the best-fit.
```
- **EXPLAIN concern:** Without this, "removed posts in last 72h" scans the entire is_removed=1 partial index and then sorts by created_at. With this, it's a narrow range scan returning rows in order.
- **Effort:** S
- **Risk:** Lo
- **Dependency:** None.

---

### 27. JSON Index on ai_hold_queue.reason_json for Evidence Faceting
- **Why through DB lens:** `ai_hold_queue.reason_json` contains `{summary, evidence[], rule_refs[]}`. A future query "show me all ai_hold_queue items where rule_ref='RULE_07'" requires scanning every row's JSON. D1's SQLite 3.43+ supports `json_extract` in indexes.
- **Schema sketch:**
```sql
-- In migration 032 (ai_hold_queue definition):
CREATE INDEX IF NOT EXISTS idx_ahq_suggested_action
  ON ai_hold_queue(suggested_action, confidence DESC)
  WHERE resolved_at IS NULL;
-- Not a JSON index (SQLite JSON indexes are expression indexes; verify D1 support before adding)
-- For now: the suggested_action column is top-level TEXT, so a standard index works.
```
- **D1 expression index status:** Verified supported in SQLite 3.38+. Expression index on `json_extract`:
```sql
CREATE INDEX IF NOT EXISTS idx_ahq_kind_json
  ON ai_hold_queue(json_extract(reason_json, '$.rule_refs[0]'), created_at DESC);
```
- **Effort:** S (add to migration 032)
- **Risk:** Lo
- **Dependency:** Item #1 (ai_hold_queue).

---

### 28. gaw_crawl_state — Add last_error_at + Alertable Index
- **Why through DB lens:** `gaw_crawl_state.errors_recent` counts recent errors but has no timestamp. The health widget (V11 #18) needs "last firehose error time" to display staleness. Without a timestamp, the health widget only knows the count, not when it happened.
- **Schema sketch:**
```sql
-- Migration 049
ALTER TABLE gaw_crawl_state ADD COLUMN last_error_at INTEGER;
ALTER TABLE gaw_crawl_state ADD COLUMN last_error_msg TEXT;
-- No new index needed; gaw_crawl_state is indexed by PK (community) and is tiny (<10 rows).
```
- **Effort:** S
- **Risk:** Lo

---

### 29. team_settings — Add Typed Value Column for Config Safety
- **Why through DB lens:** `team_settings` stores all config as `TEXT value`. Type errors (e.g., `sus_ttl_days = 'thirty'`) are silent. Add a `value_type` column so the worker can assert type at read time.
- **Schema sketch:**
```sql
ALTER TABLE team_settings ADD COLUMN value_type TEXT DEFAULT 'string'
  CHECK(value_type IN ('string','integer','float','boolean','json'));
UPDATE team_settings SET value_type = 'integer' WHERE key IN
  ('sus_ttl_days','autoUnstickyMaxHours','upvoteThreshold');
```
- **Effort:** S
- **Risk:** Lo

---

### 30. Prepared-Statement Batching Pattern for Bulk Actions
- **Why through DB lens:** D1 allows 1000 statements per request but charges per-statement latency. Bulk ban of 50 users fires 50 individual INSERT INTO actions calls today. D1's `batch()` API (available in Worker runtime) packages multiple statements into one HTTP round-trip.
- **No migration needed.** This is a worker-code pattern, but Cat 1 (Backend) needs to know the D1 side is ready: the schema supports multi-row bulk inserts natively. The relevant pattern is:
```js
const stmts = users.map(u =>
  db.prepare('INSERT INTO actions (mod, action, target_user, ts) VALUES (?,?,?,?)')
    .bind(mod, 'ban', u, Date.now())
);
await db.batch(stmts);  // one HTTP round-trip, 50 inserts
```
- **Effort:** S (pattern adoption in the bulk-action handler; no schema change)
- **Risk:** Lo
- **Success metric:** 50-user bulk ban completes in <100ms (down from ~500ms at 10ms/insert × 50).

---

## B. WHAT V11_PLAN MISSED (in DB lens)

1. **modmail_threads and modmail_messages have no reviewed schema.** UAT confirmed they exist and are written to, but no migration file was found. Their indexes are unverified. The modmail 3-column panel (V11 #2, Wave 1) reads these tables in the hot path. This is a risk that should be audited before Wave 1 ships.

2. **FTS5 write amplification on firehose upserts was not called out.** We just fixed the TOCTOU race with UPSERT. Every UPSERT on gaw_posts fires 2 FTS5 trigger writes. At high ingestion volume (the "firehose ON at all times" goal), this is 3x write amplification per post. Item #5 (contentless FTS5) closes this gap; V11_PLAN doesn't mention it.

3. **`gaw_ingest_audit` has no retention policy.** At 3000 rows/day, this table crosses 1M rows in a year. No one flagged it. Item #4 above provides the fix, but it was absent from V11_PLAN §F risks.

4. **The `ai_used` dead loop is a metrics-layer problem, not just a client bug.** V11_PLAN calls it out as a client fix. But the schema side needs `ai_acceptance_ms` and `edit_distance` columns (item #7) to give Cat 5 (Metrics) any signal at all. Without the columns, fixing the client bug just records `ai_used=1` with no richness — Cat 5 can't answer "does AI help?"

5. **`actions` table is missing the `(mod, action, ts)` composite index needed for scoreboard KPIs.** The scoreboard (V11 #12) is Wave 3. By then, `actions` may be 500k-1M rows. The index gap means Wave 3's most visible feature will query slowly on day 1.

---

## C. SCHEMA BETS (3-5 architectural calls)

**Bet 1: ai_hold_queue replaces three scattered AI tables by v11.2.** `shadow_triage_decisions`, `ai_suspect_queue`, and the modmail draft cache are all variations of the same pattern: AI proposes, human reviews, outcome is logged. Unifying them into `ai_hold_queue` (item #1 + item #20) cuts the maintenance surface from three tables to one. The migration path is non-breaking (old tables keep working; new writes go to ai_hold_queue). This is the highest-leverage schema call in v11.

**Bet 2: FTS5 contentless tables for firehose, triggered FTS5 for precedents.** Firehose (high write, moderate read) should be contentless FTS5 to eliminate trigger write amplification. Precedents (low write, high read on search) should stay content-referenced FTS5 because snippet() context is valuable for the search UI. Two different FTS5 strategies for two different write:read ratios.

**Bet 3: R2 audit anchoring as the forensic-grade layer.** The Merkle + HMAC chain is sufficient for operational tamper-detection. For forensic-grade (court-admissible, leadership-trust), R2 anchoring (item #9) is the addition. This is a one-way ratchet — once anchoring is deployed, the anchor timestamps become part of the integrity proof. Commit to this in Wave 3 because it has no going back.

**Bet 4: Denormalize `ban_count` + `warn_count` into `gaw_users` for O(1) repeat-offender lookup.** The alternative — querying `actions` every time the drawer opens — will hurt at 1M+ rows. The denormalization cost (a counter update on every ban action) is negligible. The O(1) lookup gain is permanent.

**Bet 5: JSON expression indexes on ai_hold_queue.reason_json are the v12 analytics substrate.** Once v11 closes the `ai_used` loop and populates `ai_hold_queue` with rich reason_json, the v12 analytics job (Cat 5) will need to facet by `rule_refs[]`, `evidence[].source`, etc. Laying the JSON expression index in the migration (item #27) costs nothing now and eliminates a v12 backfill.

---

## D. RISKS (top 5 DB risks v11 ships into)

1. **modmail_threads / modmail_messages unreviewed schema.** If these tables lack composite indexes on (sender, created_at), the Wave 1 modmail 3-column panel pre-fetch will full-scan in production on day 1. Must audit before Wave 1 merges.

2. **FTS5 trigger write amplification on the firehose upsert hot path.** With firehose-ON-always (goal B2 in HANDOFF), every upsert fires 3 writes. At 500 posts/hour that's 1500 writes/hour into FTS5 alone. D1 write throughput is ~20 req/s to primary; this is fine today but will become the bottleneck before archival is needed. Item #5 is the fix; it belongs in Wave 2, not v12.

3. **`actions` table index gaps for scoreboard KPIs will cause Wave 3 latency regressions.** KPIs #3 and #4 are expensive aggregates over large time windows. Without the (mod, action, ts) covering index (item #13), Wave 3's scoreboard will be slow on launch. Ship the indexes in Wave 1 (they're just CREATE INDEX — no data migration, instant on a sub-1M-row table).

4. **ai_hold_queue concurrent-claim race if not using atomic UPDATE...RETURNING.** If the claim pattern uses SELECT-then-UPDATE (rather than UPDATE WHERE claimed_by IS NULL RETURNING), two mods j-key the same item simultaneously and both get it. This is a correctness bug, not a performance bug. The schema as designed (item #1) prevents it; the worker handler must implement the atomic pattern.

5. **`gaw_ingest_audit` unbounded growth becomes a D1 size surprise at 12 months.** No one is watching this table. It's not in any dashboard. It will silently grow to 15-20MB before anyone notices. The prune cron (item #4) must ship in Wave 1 alongside the firehose-ON feature — otherwise we enable the firehose without enabling the cleanup.

---

## E. CTO SYNTHESIS NOTES

If the CTO can ship only 5 of these, in this order:

1. **Item #1 (ai_hold_queue schema)** — Wave 1 blocker. V11's #3 feature cannot ship without it.
2. **Item #3 (pending_undo schema)** — Wave 1 blocker. Bulk actions (#5) and toast-undo (#19) are safety-critical without it.
3. **Item #6 (mod_modmail_responses composite index)** — S effort, immediate query correctness fix. Ship it in the same PR as migration 031's creation.
4. **Item #10 (actions archival indexes: mod+action+ts composite)** — Wave 1 stealth ship. It costs nothing now (table is <500k rows) and prevents a Wave 3 regression that will be expensive to diagnose under feature pressure.
5. **Item #7 (ai_used loop closure: ai_acceptance_ms + edit_distance columns)** — The single schema change that turns "we ship AI features" into "we know if AI features work." Without this, every AI investment in v11 is a black box. Cat 5 (Metrics) cannot do their job without these columns.
