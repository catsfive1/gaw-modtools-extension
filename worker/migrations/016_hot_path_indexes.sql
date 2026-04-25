-- ============================================================================
-- GAW ModTools Worker -- Migration 016: Hot-path indexes (v8.3.0)
-- ============================================================================
-- Pure index additions. CREATE INDEX IF NOT EXISTS is idempotent on D1, so
-- this migration is safe to re-run. No data is touched, no schema is reshaped.
--
-- Why now (April 2026):
--   /audit/query (dashboard + per-mod productivity) currently full-scans the
--   `actions` table when filtered by target_user, action, or mod alone. With
--   the table now ~hundreds of thousands of rows and growing, the dashboard
--   queries are starting to drag (50-200ms+ per request). These indexes
--   match the actual WHERE patterns in the worker code as of v8.2.7.
--
--   Verified by grepping handleAuditQuery, handleDashboardAuditActors,
--   handleDashboardAuditActionTypes, and the productivity sub-queries.
--
-- Apply with:
--   npx wrangler d1 execute gaw-audit --remote \
--       --file=migrations/016_hot_path_indexes.sql
--
-- Verify with (each should return 1 row):
--   SELECT name FROM sqlite_master WHERE type='index'
--     AND name IN (
--       'idx_actions_target_ts',
--       'idx_actions_action_ts',
--       'idx_actions_mod_ts',
--       'idx_actions_ts',
--       'idx_precedents_action_marked',
--       'idx_bot_feature_requests_status'
--     );
-- ============================================================================

-- /audit/query filtered by user: WHERE target_user = ? AND ts > ? ORDER BY ts DESC
CREATE INDEX IF NOT EXISTS idx_actions_target_ts
  ON actions(target_user, ts DESC);

-- /audit/query filtered by action: WHERE action = ? AND ts > ? ORDER BY ts DESC
CREATE INDEX IF NOT EXISTS idx_actions_action_ts
  ON actions(action, ts DESC);

-- /audit/query + productivity: WHERE mod = ? AND ts > ? ORDER BY ts DESC
CREATE INDEX IF NOT EXISTS idx_actions_mod_ts
  ON actions(mod, ts DESC);

-- /audit/query unfiltered: WHERE ts > ? ORDER BY ts DESC LIMIT N
CREATE INDEX IF NOT EXISTS idx_actions_ts
  ON actions(ts DESC);

-- v8.0 precedent count uses (kind, signature, action, marked_at).
-- (kind, signature) already covered by idx_precedents_kind_sig from 007.
-- Add the (action, marked_at) leg so the AND ... AND ... narrows efficiently.
CREATE INDEX IF NOT EXISTS idx_precedents_action_marked
  ON precedents(action, marked_at DESC);

-- bot_feature_requests is queried by status often (commander review, polling).
-- (Table created in 003_bot.sql; index added late after observing query plans.)
CREATE INDEX IF NOT EXISTS idx_bot_feature_requests_status
  ON bot_feature_requests(status);
