-- ============================================================================
-- GAW ModTools Worker -- Migration 017: Discord webhook retry queue (v8.3.0)
-- ============================================================================
-- Backs the v8.3 webhook hardening drop. Until v8.3, every Discord webhook
-- POST was a fire-and-forget through ctx.waitUntil(fetch(...)) with no retry
-- and no observability. When Discord rate-limited us (HTTP 429) or had a
-- transient 5xx, the message was lost forever.
--
-- v8.3 introduces discordWebhookSend() in the worker which inserts a row
-- here on any non-2xx response (or fetch throw). The cron tick then drains
-- the queue with bounded concurrency, exponential backoff, and an abandon
-- threshold (max_attempts).
--
-- Columns:
--   webhook_url    the env binding key NAME (not the URL itself; we look up
--                  env[webhook_url] at drain time so rotated webhook URLs
--                  flush automatically). Examples: 'DISCORD_WEBHOOK',
--                  'BUG_REPORT_DISCORD_WEBHOOK'.
--   payload_json   JSON-encoded body that was passed to fetch().
--   attempts       number of POST attempts so far (0 on insert, ++ on each
--                  drain attempt regardless of outcome).
--   max_attempts   abandon threshold; default 6 (~ ~5 hr with 5-min cron +
--                  exponential backoff). Lead can override via /discord/post.
--   next_attempt_at  unix ms; drain skips rows where now < next_attempt_at.
--   last_error     last failure status code or 'fetch-throw: <msg>' (<=200 ch).
--   created_at     unix ms enqueue time.
--   abandoned_at   unix ms when attempts >= max_attempts; NULL = active.
--   delivered_at   unix ms when a 2xx finally landed; NULL = pending.
--
-- Apply with:
--   npx wrangler d1 execute gaw-audit --remote \
--       --file=migrations/017_discord_retry_queue.sql
--
-- Verify with:
--   SELECT name FROM sqlite_master WHERE type='table'
--     AND name='discord_retry_queue';
-- ============================================================================

CREATE TABLE IF NOT EXISTS discord_retry_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_url     TEXT    NOT NULL,             -- env binding key name
  payload_json    TEXT    NOT NULL,             -- JSON.stringify(body)
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 6,
  next_attempt_at INTEGER NOT NULL,             -- unix ms
  last_error      TEXT,                          -- 'http 429', 'http 503',
                                                 -- 'fetch-throw: ECONNRESET'
  created_at      INTEGER NOT NULL,
  abandoned_at    INTEGER,                       -- NULL while active
  delivered_at    INTEGER                        -- NULL while pending
);

-- Drain query: pending rows whose retry window has elapsed, oldest first.
CREATE INDEX IF NOT EXISTS idx_discord_retry_pending
  ON discord_retry_queue(next_attempt_at)
  WHERE delivered_at IS NULL AND abandoned_at IS NULL;

-- Operator inspection: "what's stuck right now".
CREATE INDEX IF NOT EXISTS idx_discord_retry_created
  ON discord_retry_queue(created_at DESC);
