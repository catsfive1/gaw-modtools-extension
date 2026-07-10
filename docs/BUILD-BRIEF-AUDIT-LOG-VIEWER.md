# BUILD BRIEF — Audit-Log Viewer Panel (next feature after v10.42.0 SUS)

Self-contained brief for a build agent. Ship as the next minor after the SUS
completion lands. Single writer on modtools.js — do NOT dispatch while another
agent holds it.

## GOAL
A queryable Audit-Log Viewer panel so a mod can review their own moderation
history — filter by action type, date range, target user, and outcome —
instead of the ~7 inline rows the Intel Drawer surfaces today.

## WHY / PAIN
A curator currently cannot answer "did my ban hold? did the lead reverse it?
when did I last action this user?" without asking the lead or piping to CLI.
The audit data already exists server-side; only the viewer is missing.

## INFRASTRUCTURE (already exists — reuse, no deploy)
- RPC `modAuditQuery` — registered in background.js, backs the worker
  `/audit/query` endpoint. Today it's consumed ONLY inline in the Intel Drawer
  (grep `modAuditQuery` in modtools.js for the existing call shape + response
  fields — mirror them exactly; do not invent fields).
- Existing modal/panel builders: `showModal`, the category-menu + picker-modal
  shells shipped recently (grep `_gamPickerModalShell`, `openCategoryMenu`).
- Snack + focus-trap + `:focus-visible` systems all exist.

## SCOPE
1. Add an "Audit Log" entry point in the status bar SYS category menu (grep the
   SYS `openCategoryMenu` items) — NOT a new always-visible bar button.
2. Panel = a gam-modal (role=dialog, focus trap, ESC close, focus return —
   reuse the existing dialog pattern; the Intel Drawer at ~3527 is the
   reference implementation) containing:
   - Filter row: action-type (all / ban / removal / sus / undo / note),
     date range (today / 7d / 30d), and a free-text username filter.
   - A results table (sortable by time desc default): time (relative + exact
     on hover), action, target user (shift-clickable to profile per v10.41.0),
     outcome/status, reason/detail.
   - Empty state (dim one-liner) and loading state (reuse existing skeleton).
   - Row count + "showing N of M".
3. Wire filters to `modAuditQuery` params IF the RPC supports them; if it only
   returns a flat recent list, filter client-side over what it returns and say
   so in a comment (do NOT add worker params — that would be deploy-gated).
4. Keyboard: panel fully operable — Tab through filters, Enter on a row opens
   that user's Intel Drawer, ESC closes.

## HI-1 (SACRED)
Intel-only. The viewer READS the audit log. It must NEVER expose a ban/DR/undo
ACTION control that executes from the log rows (opening the Intel Drawer for a
user is fine; a one-click re-ban from a log row is NOT in scope). Assert in the
test that the viewer module references no executeBan/addToDeathRow/apiBan.

## HOUSE WORKFLOW
1. node --check modtools.js after each edit batch.
2. New smoke test scripts/_p21_audit_log_viewer_smoke_test.mjs (house pattern,
   no npm deps): assert the panel builder exists + is a role=dialog with focus
   trap; assert it calls modAuditQuery; assert client-side filter logic
   (feed it a stub result set, prove action-type + date + username filters
   narrow correctly + default sort is time-desc); assert HI-1 (no ban-exec
   RPC references in the module).
3. Full suite green (all scripts/_*smoke_test.mjs).
4. manifest minor bump; CHANGELOG house-style entry.
5. Commit + push; build-zip.ps1 -NoPause; confirm the new version in the dist.
6. If a live browser is connected, verify the panel opens on greatawakening.win
   and modAuditQuery returns real rows for the operator.

## REPORT
Per-scope-item what changed (file:line), whether modAuditQuery supported
server-side filters or you filtered client-side (+why), node --check, test
count, suite count, commit hash + push ref, build version + sha256, and the
live-verify result if a browser was reachable.
