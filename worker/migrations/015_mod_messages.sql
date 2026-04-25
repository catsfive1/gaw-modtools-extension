-- ============================================================================
-- GAW ModTools Worker -- Migration 015: Mod-to-mod direct messaging
-- ============================================================================
-- Backs the v8.2 Mod Chat panel (status-bar icon + right-docked panel).
-- Every authenticated mod can send direct messages to another mod, or
-- broadcast to the whole team via the sentinel recipient 'ALL'.
--
-- Columns:
--   from_mod    sender's mod_username (from token-verified identity)
--   to_mod      recipient mod_username, or literal 'ALL' for broadcast
--   content     message body (1-2000 chars, validated at endpoint)
--   created_at  unix ms of send time
--   read_at     unix ms when recipient first marked it read; NULL = unread
--
-- v1 read-state simplification: read_at is per-row, applies to direct messages
-- (to_mod = recipient). For broadcast 'ALL' messages we mark the row read on
-- the FIRST inbox fetch that returns it to any recipient; this is a deliberate
-- trade-off to avoid a separate mod_message_reads table in v1. If this turns
-- out to be wrong (e.g. two mods both need per-user unread state for ALL),
-- a later migration can introduce a proper reads join table.
--
-- Apply with:
--   npx wrangler d1 execute gaw-audit --remote \
--       --file=migrations/015_mod_messages.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS mod_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_mod   TEXT    NOT NULL,
  to_mod     TEXT    NOT NULL,   -- mod_username, or 'ALL' for broadcast
  content    TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  read_at    INTEGER              -- NULL = unread; unix ms when recipient opened
);

-- Inbox fetch: "messages for me, newest first, unread first scan".
CREATE INDEX IF NOT EXISTS idx_mod_messages_to_read
  ON mod_messages(to_mod, read_at, created_at DESC);

-- Sent-history lookup: "what did I send, newest first".
CREATE INDEX IF NOT EXISTS idx_mod_messages_from
  ON mod_messages(from_mod, created_at DESC);

-- Retention / purge index (future cron may trim old broadcasts).
CREATE INDEX IF NOT EXISTS idx_mod_messages_created
  ON mod_messages(created_at);
