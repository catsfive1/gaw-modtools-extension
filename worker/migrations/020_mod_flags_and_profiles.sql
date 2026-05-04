-- ============================================================================
-- GAW ModTools Worker -- Migration 020: mod_flags and mod_profiles tables
-- ============================================================================
-- Apply with:
--   npx wrangler d1 execute gaw-audit --remote --file=migrations/020_mod_flags_and_profiles.sql
-- ============================================================================

-- Replaces flags.json GitHub backing store.
-- Each flag row is one mod's flag on one user.
CREATE TABLE IF NOT EXISTS mod_flags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL,
  flagged_by  TEXT NOT NULL,
  severity    TEXT NOT NULL,
  reason      TEXT,
  ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mod_flags_username ON mod_flags(username);
CREATE INDEX IF NOT EXISTS idx_mod_flags_ts       ON mod_flags(ts);
CREATE INDEX IF NOT EXISTS idx_mod_flags_by       ON mod_flags(flagged_by);

-- Replaces profiles.json GitHub backing store.
-- One row per user; data_json holds arbitrary profile JSON.
CREATE TABLE IF NOT EXISTS mod_profiles (
  username    TEXT PRIMARY KEY,
  data_json   TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  updated_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_mod_profiles_updated ON mod_profiles(updated_at);
