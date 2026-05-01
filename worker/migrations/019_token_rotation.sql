-- ============================================================================
-- GAW ModTools Worker -- Migration 019: per-mod token sovereignty
-- ============================================================================
-- The lead provisions every mod's initial token, so the lead has held every
-- plaintext token at provisioning time. This migration adds two mechanisms:
--
-- 1. **Self-rotation**: a mod can swap their token for a fresh random one
--    that ONLY they know. Old token instantly invalid. Lead loses ability to
--    impersonate that mod from this point forward.
--
-- 2. **Lead-issued one-time-use rotation invite**: when a mod loses their
--    token, the lead generates an invite code. The mod claims the invite
--    and the worker generates a fresh random token that the lead never sees.
--
-- mod_tokens schema additions:
--   token_hash       SHA-256 hex of the live token. Lookups now hash the
--                    incoming header and match this column. Existing rows
--                    keep their plaintext `token` for backward compat;
--                    lookupModFromToken lazy-migrates them on first hit.
--   rotated_at       unix-ms of last rotation event
--   rotation_count   monotonic counter
--   rotated_by       'self' | 'invite' | 'provisioned'  (where the latest
--                    token came from)
--
-- New table token_invites:
--   code_hash        SHA-256 hex of the invite code (lead delivers plaintext
--                    OOB; only the hash lives in D1)
--   mod_username     the mod the invite is bound to
--   created_at       unix-ms
--   expires_at       unix-ms (default: now + 24h)
--   used_at          unix-ms when claimed; NULL while unclaimed
--   created_by       'lead' (audit context only)
--
-- Apply with:
--   npx wrangler d1 execute gaw-audit --remote \
--       --file=migrations/019_token_rotation.sql
-- ============================================================================

-- mod_tokens columns. SQLite ALTER TABLE ADD COLUMN is not idempotent;
-- the runner is expected to tolerate "duplicate column name" on re-run.
ALTER TABLE mod_tokens ADD COLUMN token_hash TEXT;
ALTER TABLE mod_tokens ADD COLUMN rotated_at INTEGER;
ALTER TABLE mod_tokens ADD COLUMN rotation_count INTEGER DEFAULT 0;
ALTER TABLE mod_tokens ADD COLUMN rotated_by TEXT;

-- Index for hash-based lookup (the new hot path).
CREATE INDEX IF NOT EXISTS idx_mod_tokens_hash ON mod_tokens(token_hash);

-- Token rotation invites.
CREATE TABLE IF NOT EXISTS token_invites (
  code_hash    TEXT PRIMARY KEY,
  mod_username TEXT    NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  used_at      INTEGER,
  created_by   TEXT    NOT NULL DEFAULT 'lead'
);

-- Lookup by username (rare, mostly for admin queries).
CREATE INDEX IF NOT EXISTS idx_token_invites_username ON token_invites(mod_username);

-- Expiry sweep index (for periodic cleanup of stale unclaimed invites).
CREATE INDEX IF NOT EXISTS idx_token_invites_expires ON token_invites(expires_at);
