# BUILDER_WORKER_REPORT — v9.5.0 Ship

**Date:** 2026-05-09  
**Worker:** `gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev`  
**Deploy ID:** `28479fcd-cc04-44d9-8686-e8985053a5c8`  
**WORKER_VERSION:** `9.4.8` → `9.5.0`

---

## Migrations Applied

| Migration | File | Status | Rows Written |
|---|---|---|---|
| 032 | `032_ai_hold_queue.sql` | OK | 7 rows (DDL + 5 indexes) |
| 033 | `033_mod_tier.sql` | OK | 32 rows (ALTER + backfill + index) |
| 034 | `034_stats_indexes.sql` | OK | 1088 rows (composite index on 2201 rows) |

**Note on 033:** Backfill confirmed — catsfive row updated to `tier='lead'`, 15 other mod rows set to `tier='mod'` (255 rows read, 32 written covers the index build).

**Note on 034:** `deathrow` table does not exist in live D1. Design doc referenced it but it was never migrated to D1 (DR queue is local-only). The `idx_deathrow_mod_status` index was dropped from migration 034. Worker `handleModStats` Query 3 wraps in try/catch and returns `dr_pending: 0, dr_ready: 0` gracefully.

---

## Patches Applied

### Patch 1: Activity Timeline param honoring (V10_FIREHOSE/01)

**File:** `gaw-mod-proxy-v2.js` line 8670 — `handleGawUserTimeline`

Replaced hardcoded `LIMIT 100` posts / `LIMIT 200` comments with:
- `limit = Math.min(50, Math.max(5, parseInt(url.searchParams.get('limit')) || 30))`
- `since = parseInt(url.searchParams.get('since')) || (now - 30 days)`
- Both queries now bind 3 params: `(author, since, limit)`
- `substr(body_md, 1, 400)` trimmed to `200` per spec

**Probe result:** `GET /gaw/user/catsfive/timeline?since=1745000000&limit=5` → 5 posts, 5 comments, correct shapes.

---

### Patch 2: Mod Audit View endpoint (V10_V11/04)

**File:** `gaw-mod-proxy-v2.js` — new `handleAdminModAuditProfile` inserted before line ~2862 (pre-hmac-backfill comment block)  
**Route:** `case '/admin/audit/mod-profile'` added to switch  
**Auth:** `requireLeadAuth` (lead-only, unchanged from spec)

3 SQL queries:
1. Action histogram with `(action, hour_bucket)` GROUP BY → pivoted to totals + ratio stats
2. Aggressive bans JOIN `gaw_users` on `registered_at` (design doc referenced `ban_count`/`account_age_days` columns which don't exist; substituted with epoch-math `account_age_days` from `registered_at`)
3. Bans with prior modmail context via EXISTS subquery

Llama `@cf/meta/llama-3.3-70b-instruct-fp8-fast` summary call via `env.AI.run()` with `response_format: { type: 'json_object' }`.

**Probe result:** `GET /admin/audit/mod-profile?mod=catsfive&days=30` → HTTP 200, `{"mod":"catsfive","period_days":30,"totals":{"ban":81,...},"ratios":{"ban_note_ratio":81,"ban_per_day":2.7,...},"histogram":{...},"aggressive_bans":[...],"ai_summary":...}` (AI summary populated).

**Schema adaptation:** `gaw_users` has `registered_at` (unix epoch) not `ban_count`/`account_age_days`. Query 2 derives age as `(a.ts/1000 - u.registered_at) / 86400`. Filter: bans where target account age < 7 days at time of ban.

---

### Patch 3: AI Hold Queue migration 032 + 3 endpoints (V10_V11/02)

**Migration:** `032_ai_hold_queue.sql` — full DDL with state machine + 5 partial/expression indexes. Applied clean.

**New handlers:**
- `handleAiHoldQueue` — `GET /admin/queue/ai-flagged` (paginated + atomic claim via UPDATE...WHERE claimed_by IS NULL RETURNING)
- `handleAiHoldQueueResolve` — `POST /admin/queue/ai-flagged/:id/resolve` (atomic with `WHERE resolved_at IS NULL` guard; writes audit row via `appendAuditAction`)
- `handleAiHoldQueueStats` — `GET /admin/queue/ai-flagged/stats` (aggregate FILTER counts)

**Routing:** Stats and list via switch case; resolve via regex pre-switch `ahqResolveMatch`.

**Parallel-write shim:** Inserted immediately after the `ai_suspect_queue` INSERT in `handleAiSuspectEnqueue` (~line 10945). `.catch()` so any error never kills the primary write. 7-day TTL for `daily-score` kind.

**Cron expiry purge:** Added `DELETE FROM ai_hold_queue WHERE expires_at < ? AND resolved_at IS NULL` to `teamProductivityCronTick`, with `.catch()` guard (inert until first entry exists).

**Probe results:**
- `GET /admin/queue/ai-flagged?limit=5` → `{"ok":true,"queue":[],"meta":{"fetched":0,...}}` (empty on day 1, correct)
- `GET /admin/queue/ai-flagged/stats` → `{"ok":true,"stats":{"pending":0,"claimed":0,"resolved_24h":0,"approved_24h":0,"rejected_24h":0}}`

---

### Patch 4: Multi-lead schema (V10_MULTILEAD/01)

**Migration:** `033_mod_tier.sql` — `ALTER TABLE mod_tokens ADD COLUMN tier TEXT NOT NULL DEFAULT 'mod' CHECK(...)` + backfill UPDATE + `idx_mod_tokens_tier` index. Applied clean. Backfill: catsfive → `lead`, all others → `mod`.

**Worker changes:**

1. `TIER` constant map + `requireTier(request, env, minTier)` helper added after `requireLeadAuth` (~line 607). `requireLeadAuth` kept unchanged as the lead-only alias (all existing call sites untouched).

2. `lookupModFromToken` SELECTs now include `tier` column (both hash and plaintext paths). Return value extended: `{ mod_username, is_lead, tier }`.

3. `handleModWhoami` extended response: `{ username, is_lead, tier }`. `is_lead` backward-compat field preserved.

4. `handleAdminModPromote` added (lead-only, `POST /admin/mod/promote`). Guards: can't demote last lead (COUNT check). Updates `is_lead` in sync with `tier`. Writes `tier.promote`/`tier.demote` audit rows.

5. `handleAdminRotationInvite` gate changed from `requireLeadAuth` to `requireTier('senior_lead')`. Added target-tier check: `senior_lead` cannot rotate another lead or senior_lead's token.

**Probe result:** `GET /mod/whoami` → `{"username":"catsfive","is_lead":true,"tier":"lead"}` — tier field live.

---

### Patch 5: Stats D1 persistence endpoint (V10_PANEL/05)

**Migration:** `034_stats_indexes.sql` — `idx_actions_mod_action_ts ON actions(mod, action, ts DESC) WHERE is_test=0`. Applied clean (2201 rows read, 1088 written for index build).

**New handler:** `handleModStats` added immediately after `handleModWhoami` (~line 1102).  
**Route:** `case '/mod/stats'` added to switch.  
**Auth:** `checkModToken` + `lookupModFromToken` (standard per-mod token).  
**KV cache:** 60s TTL keyed `stats:<mod_username>` via `env.MOD_KV`.  
**DR query:** Wrapped in try/catch returning zeros when `deathrow` table absent.

**Probe result:** `GET /mod/stats?window=24h` → `{"ok":true,"pending":null,"dr_pending":0,"dr_ready":0,"banned":1,"bans_24h":0,"msgs_24h":0,"notes_24h":0,"computed_at":1778311293427}`

---

## Full Probe Results Summary

| Endpoint | Status | Notes |
|---|---|---|
| `GET /version` | 200, `"version":"9.5.0"` | Version bump confirmed |
| `GET /mod/whoami` | 200, `tier:"lead"` | Tier field live |
| `GET /mod/stats?window=24h` | 200, data present | D1-backed stats |
| `GET /admin/audit/mod-profile?mod=catsfive&days=30` | 200, full payload | SQL + Llama summary |
| `GET /admin/queue/ai-flagged?limit=5` | 200, `queue:[]` | Empty day-1, correct |
| `GET /admin/queue/ai-flagged/stats` | 200, all zeros | Empty day-1, correct |
| `GET /gaw/user/catsfive/timeline?since=1745000000&limit=5` | 200, 5+5 items | Params honored |

---

## Errors Encountered + Resolutions

1. **Migration 034 — `no such table: main.deathrow`**  
   Design doc specified `idx_deathrow_mod_status ON deathrow(mod, status)` but `deathrow` table was never created in D1 (DR queue is local/extension-side only). Removed the deathrow index from migration 034. Worker `handleModStats` Query 3 try/catch'd to return zeros gracefully.

2. **mod-profile — `no such column: u.ban_count`**  
   Design doc referenced `gaw_users.ban_count` and `gaw_users.account_age_days` which don't exist in the live schema (gaw_users has `registered_at` epoch). Fixed: Query 2 now derives account age from `(a.ts/1000 - u.registered_at) / 86400` inline in SQL. Aggressive-ban filter adjusted to `account_age_days < 7` (new accounts). Required a second deploy.

**Final deploy ID:** `28479fcd-cc04-44d9-8686-e8985053a5c8`

---

## File:Line Citations (Major Changes)

| Change | File | Approx Line |
|---|---|---|
| `WORKER_VERSION = '9.5.0'` | `gaw-mod-proxy-v2.js` | 54 |
| `lookupModFromToken` tier SELECT | `gaw-mod-proxy-v2.js` | 1013, 1018 |
| `lookupModFromToken` tier return | `gaw-mod-proxy-v2.js` | 1048 |
| `requireTier` + `TIER` constant | `gaw-mod-proxy-v2.js` | ~608 |
| `handleModWhoami` tier field | `gaw-mod-proxy-v2.js` | ~1092 |
| `handleModStats` (new) | `gaw-mod-proxy-v2.js` | ~1104 |
| `handleAdminModAuditProfile` (new) | `gaw-mod-proxy-v2.js` | ~2862 |
| `handleAdminModPromote` (new) | `gaw-mod-proxy-v2.js` | ~3762 |
| `handleAdminRotationInvite` tier gate | `gaw-mod-proxy-v2.js` | ~3692 |
| `handleGawUserTimeline` since+limit | `gaw-mod-proxy-v2.js` | 8670 |
| `handleAiHoldQueue` (new) | `gaw-mod-proxy-v2.js` | ~11015 |
| `handleAiHoldQueueResolve` (new) | `gaw-mod-proxy-v2.js` | ~11075 |
| `handleAiHoldQueueStats` (new) | `gaw-mod-proxy-v2.js` | ~11125 |
| ai_hold_queue parallel-write shim | `gaw-mod-proxy-v2.js` | ~10945 |
| teamProductivityCronTick ahq purge | `gaw-mod-proxy-v2.js` | ~11175 |
| Routing: new cases in switch | `gaw-mod-proxy-v2.js` | ~12110 |
| Routing: ahqResolveMatch pre-switch | `gaw-mod-proxy-v2.js` | ~12000 |
| `032_ai_hold_queue.sql` | `migrations/` | new file |
| `033_mod_tier.sql` | `migrations/` | new file |
| `034_stats_indexes.sql` | `migrations/` | new file |
