# V11 Build Prompt — AI Mod-Assist → Audit-Log Viewer → Cross-Page Bulk Actions

> **You are picking up a coding task on GAW ModTools with zero prior context.**
> This brief is fully self-contained. Read it start to finish before touching
> any code — it contains a correction to the original plan that changes where
> you should actually start. Commander Cats is the lead moderator; he is a
> non-programmer vibe-coder — carry the entire technical load, verify
> everything from your own side before telling him to look at anything, never
> use him as your test mule.

---

## 0. Project facts (memorize before touching anything)

- **Repo:** `D:\AI\_PROJECTS\modtools-ext` — a Chrome **MV3** extension moderating
  `greatawakening.win` (a political forum). Run `git log --oneline -10` and
  check `manifest.json`'s version FIRST — this repo is sometimes worked by more
  than one session concurrently; do not trust a version number from an older
  doc without reverifying live.
- **Files (NEVER full-read the big ones — grep + offset/limit Read only):**
  `modtools.js` (~1.85 MB, the whole in-page UI), `background.js` (~215 KB,
  the MV3 service-worker / RPC router — `RPC_HANDLERS`-style object literal,
  each entry has `allowed_callers` + an async `handler()` that calls
  `_rpcWorkerCall('METHOD', '/path', body)`), `modtools-aux.js` (~190 KB).
- **Worker is a SEPARATE, GATED deploy** (`gaw-mod-proxy-v2.js`, not in this
  repo). You cannot deploy it on demand. Any RPC name you find **already
  registered** in `background.js`'s handler map is safe to build against —
  it's live. Anything NOT registered there is a dead client-side call
  (STORM #1 taught this codebase the hard way: several client calls
  reference RPC names the worker never implemented, silently resolving
  `{ok:false}` instead of throwing — always `grep` `background.js` for the
  exact RPC name before assuming it works).
- **Load model:** unpacked-loaded in Brave. No auto-update. Reload is a
  **Commander-only manual action** (`brave://extensions` → reload icon →
  F5 the tab) — this cannot be automated even with live browser tool access
  (confirmed: the Claude-in-Chrome `navigate` tool mangles both `brave://`
  and `chrome://` URLs by force-prepending `https://`). Ship loop, every
  version: bump `manifest.json` → CHANGELOG entry above the previous top
  entry → `node --check modtools.js` (+ any other touched file) → run the
  FULL `scripts/_*.mjs` suite → run the boot-crash probe (rebuild it if
  gone — see §7) → commit (standing authorization, don't ask) → push →
  `pwsh -File scripts/build-zip.ps1 -NoPause` (rebuilds the loaded unpacked
  dir — **commit ≠ shipped**, this step is mandatory) → re-probe the built
  file → `pwsh -File scripts/mirror-to-drive.ps1 -Version X.Y.Z -NoPause`.

### HARD CONSTRAINT — HI-1 (never violate)
Real bans propagate browser-side via Cloudflare Bot Fight Mode. **Every
user-facing ban MUST route through the single choke-point
`addToDeathRow(username, delayMs, reason, opts)`** (modtools.js, currently
~line 5345 — grep `function addToDeathRow` to confirm, line numbers shift
every session) — 72h delayed by default, idempotent, undoable via a 20s
grace window when `opts.fromUserAction === true`. `executeBan()` (the
terminal `apiBan` wrapper, currently ~line 8658) may ONLY be reached by the
Death-Row reaper (`processDeathRow`), never by a live user click. This was
already enforced for the two known violation points
(`instantPermaBan`/`batchBanUsers`) in v10.36.3 — do not reopen that.
**Nothing in this build touches ban logic directly** (see §1-3 below), but
if you find yourself writing a new path that calls `apiBan`/`executeBan`
outside the reaper, stop and reconsider.

---

## 1. CRITICAL CORRECTION — read this before writing any "AI mod-assist" code

The original planning session assumed Theme A (AI mod-assist) needed to be
built from a blank slate: *"MVP is a LOCAL rule engine, NO ML classifier...
populates the currently-empty `autoTardRules` array."* **That premise is
wrong — verify it yourself before building anything:**

```
grep -n "modAiScore\|aiTardsSuggest" background.js
```

You will find **both already registered**:
- **`modAiScore`** (background.js, ~line 3484) → POSTs to `/ai/score`.
  Consumed by `runDailyAiScanIfDue()` in modtools.js (~line 16951): once per
  UTC day (or on-demand via a "Force AI scan" button), scores up to 50
  roster users with `status==='new'`, routes anyone scoring `risk>=70` into
  the watchlist (or `ai_suspect_queue` if a v8.0 flag is on). Gated on the
  `features.ai` consent toggle in Settings.
- **`aiTardsSuggest`** (background.js, ~line 2976) → POSTs to
  `/ai/tards/suggest`. Consumed by the Tard-suggester accordion (the ✨
  button, now living inside the QUEUE category menu since v10.36.9 —
  `_openTardAccordion`/`_fetchAndRenderTards`, modtools.js ~line 24286+):
  scans the last 80 firehose usernames, returns pattern suggestions with a
  severity tier, mod reviews via checkboxes and clicks "Add N selected as
  DR rules" to actually populate `autoTardRules`. This is a deliberate
  human-in-the-loop gate, not a missing mechanism — `autoTardRules` staying
  empty by default is BY DESIGN until a mod approves suggestions.
- **Also already live:** `firstPostScreenTick` (modtools.js, ~line 31687,
  setting `firstPostScreen` default-on) — a cheap LOCAL slop-title heuristic
  that runs on every new firehose post, escalating to a `modUserCadence`
  account-age check and a `modSusMark` SUS-write only for genuinely new
  accounts. This IS the "local-first, minimal worker touch" pattern the
  original Theme A envisioned — it already exists.

**What this means for you:** do not duplicate any of the above. Before
writing a single line of new AI-assist code, do these two things, in order:

1. **Verify these three mechanisms actually work end-to-end in practice**,
   not just that the client code calls a registered RPC name. This needs
   Commander's live browser (Claude-in-Chrome — see §6) or Commander's own
   report: is `features.ai` consent even turned on in his Settings? Does
   the daily scan actually flag anyone useful? Does the Tard-suggester
   accordion return real suggestions when clicked, or an empty/error state?
   A registered RPC handler proves the CLIENT↔ROUTER wiring is sound; it
   does NOT prove the WORKER endpoint behind `_rpcWorkerCall` is behaving
   well in production. If you have live browser access, click the "AI scan
   now" button and the ✨ Tard-suggester button on a real `/users` page and
   read the actual result.
2. **Ask Commander directly (plain language, not a code question) what's
   still missing from his daily workflow**, now that he knows this
   infrastructure exists. Do not assume the original "no AI-assist exists"
   framing is still accurate — it wasn't. Likely candidates for a real gap,
   in rough order of how much scaffolding already exists:
   - The 50-user/day cap on `modAiScore` — could it run more often, or
     on-demand per page-load instead of once daily?
   - The Tard-suggester only scans "last 80 usernames via firehose" — is
     that window too narrow?
   - Genuinely new: surfacing WHY an account was auto-flagged (any of the
     three above) more visibly in the Triage Console UI, rather than just
     silently landing in the watchlist/Tards section.

**Do not skip this verification step and just start writing new code.**

---

## 2. Theme F — Audit-Log Viewer (confirmed still a real, well-scoped gap)

Unlike Theme A, this one checks out as genuinely missing. Verify yourself:

```
grep -n "modAuditQuery" modtools.js
```

You'll find exactly 3 narrow, already-scoped consumers — none of them a
general-purpose viewer:
- `buildUserSections()` (~line 6935, the IntelDrawer's per-user panel) —
  `{limit:20}`, scoped to whatever that drawer already filters to.
- `c5RefreshPopover()` (~line 24660, the lead-only C5 Command Center) —
  `{sinceHours:1, limit:10}`, a tiny "last hour" widget.

**The RPC itself** (background.js, `modAuditQuery`, ~line 3553 → `/audit/query`)
is live and already deployed — confirm its exact request/response schema by
reading the handler and, if you have live access, calling it directly via
the extension's own `rpcCall` from a DevTools console on a GAW page.

**Build:** a proper, dedicated Audit Log panel — filterable by mod, action
type, and time window, paginated or infinite-scroll, reusing the Bloomberg
terminal visual theme (`GAM_TOK`/`C.*` color tokens, monospace font, dense
spacing — look at any existing popover like `_showActiveModsPopover` or the
Mod Console panel for the established look) and the `openCategoryMenu()` /
existing modal patterns for positioning. Entry point: add it as a new item
inside the **COORD** category menu (alongside Mod Log / Active Mods /
Modmail actions / C5) in `buildStatusBar()` (~line 23463) — it belongs there
semantically (coordination/oversight tooling), and that menu already has
the `openCategoryMenu()` wiring pattern to copy.

**Explicitly OUT of scope for this pass** (per the original plan, still
valid): rendering a before/after action-diff JSON (needs a schema
migration you can't deploy) and gating on the 459 legacy NULL-HMAC rows'
backfill (ship the viewer over what exists now; unverified rows should just
render as "unverified," not block the panel).

**Acceptance criteria:**
- A mod can open the panel from COORD, see recent audit entries with
  mod/action/timestamp, and filter by at least mod-name and a time window
  (last hour / last 24h / last 7d / all).
- Read-only. No new write paths. No worker changes.
- Verified from your side: `node --check` clean, boot-crash probe clean, a
  new `scripts/_pN_audit_log_viewer_smoke_test.mjs` (following this
  project's slice-and-stub convention — see §7) exercising the panel's
  render/filter logic against a stubbed `modAuditQuery` response, full
  existing suite re-run clean.

---

## 3. Theme E — Bulk actions across pages (do this LAST, has a real prerequisite)

"DR all N" already shipped (v10.36.0, `batchDeathRow()`, HI-1-clean via
`addToDeathRow`). The gap: bulk-select only works inside the Triage Console
(`/users` page). Lifting it to search results and profile pages needs an
abstraction over the existing cluster-select handler.

**Real prerequisite, confirmed still open:** there is no hook that
re-evaluates the status bar's page-conditional children (LOCK, the
modmail-page trigger, C5, the users/ban page indicators — all currently
inside the SYS/ACT/COORD category menus as of v10.36.9) on SPA navigation.
The bar is built once per full page load; if bulk-select needs a
page-aware control to appear/disappear as the mod navigates via GAW's own
SPA router (not a full reload), you need to solve that first, or scope the
bulk-select entry point to only render inside a full-page context where the
bar already rebuilds correctly (safer, smaller v1).

**Constraint, restated:** bulk actions must route 100% through
`addToDeathRow`/`batchDeathRow`, **never** through `instantPermaBan`/
`batchBanUsers`'s old direct-`executeBan` pattern (already fixed to route
through `addToDeathRow` in v10.36.3 — don't reintroduce a parallel path
that bypasses it).

**Acceptance criteria:**
- Same verification standard as above: `node --check`, boot-crash probe,
  a new sliced smoke test, full suite re-run.
- Confirm via test (not assumption) that every new bulk-action code path
  calls `addToDeathRow`/`batchDeathRow` and never `apiBan`/`executeBan`
  directly — mirror the static-guard pattern used in
  `scripts/_p1_hi1_instant_ban_smoke_test.mjs` and
  `scripts/_p4_pickup_where_left_off_smoke_test.mjs` (grep the sliced
  source for the forbidden call names, assert absence).

---

## 4. Two flagged items — NOT part of this build, don't touch speculatively

1. **DR-Sniper auto-fire** (`sniperPickupTick`, RPCs `modSniperArm`/
   `modSniperList`/`modSniperRemove`) — arms a trap on a user, then a
   periodic tick auto-executes `apiBan()` with zero fresh human click once
   the server reports the target ready. Open question: is unattended
   auto-fire the point of "sniper," or should it require a fresh confirm?
   Only resolve this if Commander raises it — don't build a fix speculatively.
2. **Mod-chat proposal "Execute"** (RPC `modProposalsVote`) — human click on
   a consensus ban proposal, calls `apiBan()` directly, zero preflight/
   audit/undo. Undocumented subsystem, unknown real-world usage. Verify it's
   actually used before touching it.

---

## 5. Build order

**F (Audit-Log Viewer) first**, not A — Theme A's real next-step is a
verification-and-conversation task (§1), not a code build, and Theme F is
the only one of the three that's unambiguously greenfield and well-scoped
right now. Sequence:

1. Do the §1 verification pass (check the 3 existing AI-assist mechanisms
   live, ask Commander what's actually still missing). This may turn into
   a small, precisely-scoped Theme A addition once you know the real gap —
   or it may turn out nothing further is needed there right now.
2. Build Theme F (Audit-Log Viewer) — clearly scoped, ship it.
3. Build Theme E (cross-page bulk actions) — has the SPA-rebuild prerequisite,
   do it last.

This reorders the original A→F→E approval given what's now known — that's a
correction based on new information (the discovery that A's premise was
partly wrong), not a reversal of Commander's judgment. State this plainly
to him when you report in; don't silently re-order without saying why.

---

## 6. Live browser verification (Claude-in-Chrome)

If you have live browser tool access, two Chrome-extension-connected
browsers may show up with generic names ("Browser 1"/"Browser 2") — the
tool requires an `AskUserQuestion` before any browser action when 2+ are
connected (a hard tool policy, not optional). Use the "confirm in-browser"
/ `switch_browser` option and let Commander click Connect in the browser
he means. Once connected: `tabs_context_mcp` to get a tab, `navigate` to
`https://greatawakening.win/users` (or wherever), `javascript_tool`/
`read_page`/`computer` to inspect. Useful for exactly the kind of
verification §1 and §2 need — don't skip it if it's available; a live
check beats a static-analysis guess every time this session already proved
that pattern out (the chronological-sort bug and the bar-overflow finding
were both confirmed live, not just inferred from source).

**Do not attempt to navigate to `brave://` or `chrome://` URLs** — confirmed
broken via the `navigate` tool (it force-prepends `https://` regardless of
existing scheme). Extension reload stays Commander's manual step.

---

## 7. Testing convention (this project has ZERO npm dependencies, no jsdom)

Every fix/feature gets a new file: `scripts/_pN_<short-name>_smoke_test.mjs`
(current count: 19 files, 271 passing assertions — check `ls scripts/_*.mjs`
for the next available number). Pattern:

```js
import { readFileSync } from 'node:fs';
const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');
// Slice the real function via two ASCII-only markers. ALWAYS pass a
// fromIndex to the second indexOf — this file has repeated comment text
// and CRLF line endings that have caused false-marker matches before.
const start = SRC.indexOf('function theRealFunctionName(');
const end = SRC.indexOf('SOME_STABLE_CLOSING_MARKER', start);
const fnSrc = SRC.slice(start, end);
// new Function(...) it with minimal hand-rolled stubs (no real DOM), assert
// real behavior with a pass/fail counter, process.exit(fail>0?1:0) at the end.
```

**Also recreate the boot-crash probe if `scratchpad/tdz_probe.mjs` is gone**
(scratchpad is session-scoped, likely wiped) — it's a Node script that
stubs `document`/`window`/`chrome`/etc. and `eval()`s the full `modtools.js`
source to catch any synchronous top-level throw (the class of bug that has
hit this codebase repeatedly: v10.6.1 `FEATURE_FLAGS`, v10.36.1
`MSG_QUEUE_KEY`, v10.36.6 `mc is not defined`). `node --check` only catches
syntax errors, not these runtime reference errors — run the probe after
every edit to `modtools.js`, on both the repo file and the built
`dist\mod-tools dist\modtools.js`.

---

## 8. Reporting format

When you report progress to Commander: **plain language, no code, no CLI
commands as a call-to-action** — he is not a programmer and cannot read or
run either. Describe what changed and why in terms of what he'll see and
do (e.g., "the Death Row queue now has a real audit-history viewer — open
it from the COORD menu"), not implementation details. If a manual step is
needed (extension reload), state it as a plain instruction, not a script.
End every version with the ship loop from §0 — verify from your own side
before ever telling him to try something.
