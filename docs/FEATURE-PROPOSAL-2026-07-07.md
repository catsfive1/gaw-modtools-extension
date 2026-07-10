# MODTOOLS Feature Proposal — triaged 2026-07-07 (post-v10.41.0)

Analyst pass ranked 15 gaps; triaged here against what actually shipped this
session (the analyst had stale build knowledge). This doc is the build queue.

## ALREADY SHIPPED TODAY — do NOT rebuild (analyst listed these as "build now")

| Analyst pick | Shipped in |
|---|---|
| Visible keyboard targets (`gam-kb-target` outline on hoveredItem) | v10.37.2 |
| NBA failure snacks (r.ok checks + withUndo error branch) | v10.37.2 |
| Consent modal honesty (checkboxes default unchecked) | v10.37.2 |
| Intel Drawer keyboard-open from triage rows | v10.37.2 |
| Stack-of-3 undo | v10.40.0 |
| Quick-ban-from-queue / batch progress + failure roster | v10.39.0 |
| Shift-click username → new tab | v10.41.0 |

## BUILD QUEUE — genuinely unbuilt, ranked by (curator value × buildability)

### 1. Audit-Log Viewer Panel  [SIGNAL: also #1 in v11 handoff doc]
- **Pitch:** a real queryable audit-log panel — filter by action type / date / user / outcome — instead of the 7 inline rows the Intel Drawer shows today.
- **Pain:** a curator can't review their own action history (did my ban hold? did the lead reverse it? when did I last touch this user?) without asking the lead or clipboard-piping to CLI.
- **Infra:** `modAuditQuery` RPC already registered + working (background.js `/audit/query`, currently only consumed inline in the Intel Drawer). No new worker/D1/deploy.
- **Size:** M (~300 lines client). **HI-1:** intel-only (reads audit log; no write, no ban path).
- **Why now:** two independent analyses converge on it; closes the curator self-audit gap; pure reuse of a proven RPC.

### 2. Repeat-Offender / SUS-history badge on triage rows
- **Pitch:** 🔄 badge on any /users triage row (and Intel Drawer) when that username was ever SUS-flagged or banned in the last 90d, with hover showing who/when/why.
- **Pain:** same actor returns on a fresh account weeks later — zero signal it's a comeback. Curator pattern-matches usernames in their head.
- **Infra:** `modSusList` RPC already registered (background.js). Cross-check triage usernames against the SUS list at row render. No deploy.
- **Size:** M (~200 lines client). **HI-1:** intel-only.
- **Why now:** closes repeat-actor blindness; reuses the SUS system just completed in v10.42.0; pure display.

### 3. Mod Shift Scorecard
- **Pitch:** compact status-bar chip — "TODAY: 12 bans · 1 overturned · 91% held".
- **Pain:** curator has no read on their own volume or error rate; no calibration signal.
- **Infra:** `modAuditQuery` filtered to today. No deploy. **Size:** M (~150 lines). **HI-1:** intel-only.
- **Why now:** builds directly on the Audit-Log Viewer's query layer; ship as a follow-on.

## DEFERRED — deploy-gated (needs new worker RPC + D1 + Commander "deploy")

### 4. Cross-Reference / Ban-Evasion (alt-account) Detector
- **Pitch:** when a user is SUS-flagged, list other accounts from the same IP / email domain.
- **Blocker:** needs a NEW worker endpoint `modGetAltsForUser` + D1 junction query + deploy. Highest raid-response value but slowest path; hold for a worker-deploy session.

## BUILD ORDER
1 (Audit-Log Viewer) → 2 (Repeat-Offender badge) → 3 (Scorecard), each as its
own version, single-writer on modtools.js, house test+build gate per cut.
Then the deferred popup CSS demolition + P2 polish. #4 batched for the next
worker-deploy session.
