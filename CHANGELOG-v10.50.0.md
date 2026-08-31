# v10.50.0 — D1 FREE-TIER RESCUE + 11-PERSONA SIMULATION FIX WAVE (2026-08-31)

Cloudflare enforces D1 free-tier daily limits (5M rows read / 100K written) on
2026-09-01. This account was burning ~21M reads/day and ~1.75M writes/day.
Both numbers now project comfortably under the caps.

## The D1 rescue (worker v10.50.0 → v10.50.2)

Root cause: a self-inflicted churn loop — ingest accepted every post, the
quality janitor purged the low-value ones every 5 minutes (full-scanning the
118K-row table 288x/day = 93% of all reads), and ingest re-inserted them.

- **Janitor made index-driven**: migration 050 adds partial indexes for every
  purge predicate + a captured_at index for retention. Full scans gone
  (verified via EXPLAIN QUERY PLAN locally against the live schema).
- **No-op upsert guards**: `gaw_posts`/`gaw_comments` DO UPDATE now carries a
  WHERE clause — unchanged re-captures write 0 rows (was: version++ = ~4 rows
  written every re-crawl; 980K writes/day).
- **Quality bar at ingest** (mirror of the janitor keep-bar: sticky OR >=6
  comments AND (no score OR score>=21)) in the shared crawler path AND the
  firehose client path — low-value posts are never inserted, so the janitor
  has nothing to purge. Removed/deleted captures DELETE directly.
- **gaw_users debounce**: last_seen churn (692K writes/day) → isolate Map +
  SQL WHERE guard; ~1 write/user/10min.
- **Audit-log sampling** (1-in-10 successes, errors always) + 7-day retention
  (purged 791K stale rows; was 850K and growing).
- **Token-auth 60s positive cache** (16.5K SELECTs/day → near zero; bounded
  revocation lag, invalidated on rotate).
- **Keyword crawler 5 → 15 min cadence** (score-drift upserts alone could
  crowd the write cap; 673 keywords still rotate ~daily).
- **sus-list partial index** (marked_by) — the "my marks" poll was reading 50
  rows a hit.

## Simulation-driven fixes (11 personas: 10 mods + security auditor)

Every P0 fixed; suite went from 3 red suites to **850 passed / 0 failed**.

**Correctness / safety**
- Ctrl+Z after an executed instant ban no longer lies ("restored" while the
  ban stood) — it unbans for real or says so.
- Death Row batches now have a Stop button (abort keeps remaining queued).
- FLUSH routes through the reaper: real progress, Stop button, honest counts.
- Modmail "pre-fill" no longer marks a thread replied before anyone sends
  (tracking fires on the real send; found 2 extra sites the audit missed).
- Invite claim: a username typo no longer burns the invite (match moved into
  the atomic claim; response stays generic 404).
- Sticky-queue acks are race-guarded; /audit/query no longer leaks seeded
  test rows; /flags/write identity comes from the token, not the request body.
- Firehose Pause→Start no longer spawns a second crawler (loop owns its state
  + abort-checked sleep). Cancel on "Custom SUS reason" aborts cleanly.
- Prompt-based Custom reason paths: null (Cancel) aborts, blank marks gone.

**New capabilities**
- Lead can REMOVE a departed mod's access from the roster (new lead-only
  /admin/mod/revoke; token nulls + revoked_at + audit; migration 051).
- Lead can onboard a new mod entirely from the popup: "Add new mod" →
  provision + invite in one step (no more PowerShell + terminal token).
- Raid Acknowledge route (/raid/ack) — handled raids stop re-pinging Discord
  hourly.
- Popup: worker-outage no longer disguises itself as "you're a new mod";
  plain-English claim errors (incl. new 429 "wait a minute" + "safe to
  retry"); "Update ready" chip.
- Modmail list shows WHO answered (claimed_by) on pill + detail.
- SUS reason menus fully keyboard-operable (trap, arrows, ARIA, Escape).

**Operators**
- Installer: default path now %LOCALAPPDATA%\GAWModTools (no D: dependency),
  zero clipboard writes, fresh-vs-update next-steps split.
- invite-mod.ps1 copies the DM text (not the debug log); portable log roots.
- Firehose panel: "Skipped: N (low-value/unchanged)" counter, contrast-fixed.

Deferred items live in docs/SIM-ITERATION-LEDGER.md (v.next list).
