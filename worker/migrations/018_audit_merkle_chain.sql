-- ============================================================================
-- GAW ModTools Worker -- Migration 018: tamper-evident audit log (Merkle chain)
-- ============================================================================
-- Adds two columns to the `actions` table that turn every audit row into a
-- link in a hash chain:
--
--   prev_hash   SHA-256 hex of the previous row's `entry_hash` (or '' for
--               the first row in the chain). Set by the worker BEFORE the
--               INSERT, by reading the most recent non-test row.
--
--   entry_hash  SHA-256 hex of a canonical serialization of the row itself
--               (id || ts || mod || action || target_user || details ||
--               page_url || is_test || dr_scheduled_at || prev_hash).
--               Computed by the worker AFTER the INSERT (we need the
--               auto-incremented id) and written back via UPDATE.
--
-- The verifier (/admin/audit/verify) walks the chain in id order and reports
-- the first row whose computed entry_hash disagrees with the stored value,
-- OR whose prev_hash doesn't match the previous row's entry_hash. Either
-- failure means the audit log was edited or rows were deleted.
--
-- This is NOT blockchain. There is no consensus, no proof-of-work, no fees.
-- It's a Merkle hash chain -- tamper-EVIDENT, not tamper-PROOF. That is the
-- correct trade-off for a 14-mod team on a centrally-trusted worker.
--
-- Test rows (is_test = 1) are NOT included in the chain because seed data
-- comes and goes during dev. The verifier filters them out.
--
-- Existing rows have NULL prev_hash and NULL entry_hash -- the chain starts
-- at the first INSERT after this migration is applied.
--
-- Apply with:
--   npx wrangler d1 execute gaw-audit --remote \
--       --file=migrations/018_audit_merkle_chain.sql
-- ============================================================================

ALTER TABLE actions ADD COLUMN prev_hash TEXT;
ALTER TABLE actions ADD COLUMN entry_hash TEXT;

-- Verifier hot path: walking the chain in id order, restricted to non-test rows.
-- The existing PRIMARY KEY index on id covers the ORDER BY; this partial-style
-- composite makes the WHERE is_test = 0 filter cheaper.
CREATE INDEX IF NOT EXISTS idx_actions_chain_walk
  ON actions(is_test, id);
