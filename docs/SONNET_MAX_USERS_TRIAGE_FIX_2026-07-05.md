# SONNET MAX BUILD PROMPT — Fix the USERS / Triage Console (banner trust-break + rules control + new-user emphasis)

> **You are picking up a coding task on GAW ModTools with ZERO prior context.**
> This brief is fully self-contained and supersedes `docs/V11_BUILD_PROMPT_2026-07-04.md`
> **for this session only** — Commander redirected: the USERS-page trust-break is now P0,
> ahead of the Audit-Log Viewer. Read this start to finish before touching any code.
> Commander Cats is the lead moderator and a NON-PROGRAMMER vibe-coder — carry the entire
> technical load, verify everything from your own side, never use him as a test mule, and
> report to him in plain language (no code, no CLI as a call-to-action).
>
> This plan was produced by a 10-specialist audit + adversarial critic. The critic caught
> four factual errors in the first-draft spec; **those corrections are already folded in
> below** and flagged `[CRITIC-CORRECTED]`. Trust this document over any older doc's line
> numbers — line numbers drift every session; **grep to confirm every anchor before editing.**

---

## 0. PROJECT FACTS — memorize before touching anything

- **Canonical repo (USE THIS EXACT PATH):** `D:\AI\_PROJECTS\gaw-modtools-extension`
  - origin = `https://github.com/catsfive1/gaw-modtools-extension.git`, branch `master`.
  - **DO NOT use `D:\AI\_PROJECTS\modtools-ext`** — that folder is a STALE v8.0.0 copy with
    no git. The V11 doc's reference to `modtools-ext` is wrong; ignore it.
  - **First commands:** `git -C "D:\AI\_PROJECTS\gaw-modtools-extension" log --oneline -6`
    and read `manifest.json`'s `version`. This repo is worked by TWO concurrent sessions —
    do not trust a version number from a doc; reverify live. Baseline at authoring: **v10.36.11**, HEAD `bdf7079`.
- **Files (NEVER full-read the big ones — grep + offset/limit Read only):**
  `modtools.js` (~1.85 MB, the whole in-page UI, ONE IIFE, CRLF), `background.js` (~215 KB,
  MV3 service-worker / RPC router), `modtools-aux.js` (~190 KB).
- **Load model:** unpacked-loaded in Brave. **Extension reload is a Commander-only manual
  step** (`brave://extensions` → reload icon → F5 the tab) — cannot be automated (the
  Claude-in-Chrome `navigate` tool mangles `brave://`/`chrome://` by force-prepending `https://`).
- **Ship loop, EVERY version (per-version commit is mandatory — see §6):**
  bump `manifest.json` → add a `CHANGELOG.md` entry above the previous top entry →
  `node --check modtools.js` (+ any other touched file) → run the FULL `scripts/_*.mjs`
  suite → run the slice-eval safety check on your new code (see §0.1) → `git add` the
  specific changed files (never `-A`) → commit (standing authorization, don't ask) → push →
  **only at the very end** `pwsh -File scripts\build-zip.ps1 -NoPause` (rebuilds the loaded
  unpacked dir `D:\AI\_PROJECTS\dist\mod-tools dist\` — **commit ≠ shipped**, this is
  mandatory) → then `pwsh -File scripts\mirror-to-drive.ps1 -Version X.Y.Z -NoPause`.

### 0.1 — BOOT-PROBE REALITY `[CRITIC-CORRECTED]`
Older docs tell you to "run the boot-crash probe that eval's the whole IIFE." **That probe
does NOT exist in this repo and never has.** Every `scripts/_*.mjs` test uses
`new Function(sliceOfSource)` on ONE function body or static string-greps the source — none
eval the full 1.85 MB IIFE. Building a full-IIFE harness (hundreds of DOM/chrome/crypto
globals to stub) is its own session — **do not do it.** Your realistic safety net is:
1. `node --check modtools.js` (catches syntax), PLUS
2. a **slice-eval smoke test of each NEW function/statement** in minimal stubbed globals —
   the established idiom (see `scripts/_p0_triage_mount_smoke_test.mjs`,
   `scripts/_lockout_l1_smoke_test.mjs`). This catches the TDZ/ReferenceError class that
   `node --check` misses (this codebase has shipped `mc is not defined`, `MSG_QUEUE_KEY`,
   `FEATURE_FLAGS` boot crashes — always from a new top-level ref, which a slice-eval of the
   new code exercises).
3. For any new top-level `function`/`const`, **declare it as `function foo(){}` (hoisted),
   not `const foo = …`** where it must be visible to an earlier-running caller in the same
   closure — dodges TDZ.

### 0.2 — HI-1 (NEVER VIOLATE)
Every user-facing ban MUST route through the single choke-point
`addToDeathRow(username, delayMs, reason, opts)` (72h delayed, idempotent, undoable). The
terminal ban `executeBan()` may ONLY be reached by the Death-Row reaper / the existing
`preflight()`-gated flush loop — **never from a live user click without a confirmed
`preflight()` arm-timer first.** Only WS-7 (SHOULD, likely deferred) goes near this; if you
attempt it, a code-reviewer must grep the diff to prove no ban path reaches `executeBan`
without a preceding `await preflight() === true`.

---

## 1. THE COMPLAINT AND THE CONFIRMED ROOT CAUSE

Commander sees this banner on `/users`, unchanged, **for weeks**:

> ⚠️ Burst detected: 29 users from IP range `<hash>`.x.x — Filter this cluster · ☑ Select all 29 · 💀 Death Row all 29

He pressed **"Death Row all 29"** and got no feedback, no confirmation, no result, no way to
force it, no way to make it go away. His verdict: *"lazy, bad design, plain pure and simple."*

**Root cause (all confirmed in code):**

1. **The banner is immortal by construction.** `getIPClusters(users)` (grep
   `function getIPClusters` — was ~15722) clusters EVERY user with a public `ipHash` and
   **never excludes users already on Death Row / banned / cleared / reviewed**.
   `renderTriageAlerts` (grep `function renderTriageAlerts` — was ~16189) rebuilds the
   identical burst banner from that unfiltered map on every render, gated only by
   `names.length >= 3`. Actioning the 29 sets their status but keeps their `ipHash`, so the
   cluster re-forms identically forever. **There is no code path for the banner to ever
   shrink or disappear, and no dismiss control.**

2. **"Death Row all" is a silent no-op after the first click.** The handler calls
   `batchDeathRow(names)` (grep `function batchDeathRow` — was ~16430) → `addToDeathRow`,
   which is **idempotent** (72h delayed ban, not immediate). Once the 29 are queued, every
   later click returns `added=false` for all → `ok=0` → `snack('0 user(s) added to Death Row
   (72h)', 'warn')`, and a `warn` toast **auto-dismisses in ~4s**. A zero-valued,
   yellow-alarm, self-erasing toast **IS** the "no feedback / nothing happened." It never
   distinguishes newly-queued from already-queued, never states the outcome or the "when."

3. **No durable per-cluster receipt.** The single most consequential action on the page
   (queue 29 humans for delayed ban) leaves no lasting on-screen trace — only the transient
   snack. A non-programmer who judges by feel reads "no lasting trace" as "it didn't happen."

---

## 2. WHAT IS ALREADY BUILT — DO NOT REBUILD `[CRITIC-VERIFIED]`

Two of Commander's four named asks are ~80% already there and just invisible/unsurfaced:

- **Newest-first SORT already ships (v10.36.7).** `buildTriageData` sorts `joinedAt`-desc
  (grep the comparator, was ~15628-15639), with deterministic tiebreakers. **Sort stability
  on `joinedAt` ties is already handled — confirm, do not build.** Only the **BOLD** half is
  missing (WS-5).
- **The rules engine already auto-runs on load** — `applyAutoDeathRowRules` fires on SIX
  automatic ingest paths (see WS-3 for the exact six). It just has no on/off toggle and only
  snacks when `queued > 0`, so a quiet load is invisible. There is also **already a working
  "run all rules now" sweep button + full rules editor** — buried in a collapsible sidebar
  the operator never opens (grep the sweep handler, was ~15993-16035). **It already handles
  the zero-match case correctly** (`'⚡ Sweep clean -- no new matches'`) — WS-4 is a
  placement/discoverability move, NOT a silence fix.

So: "auto-run toggle," "run rules now," and "sort" collapse from *features* into
*surface/finish/control* tasks. Only **bolding new usernames** is genuinely unbuilt.

---

## 3. THE MUST SET — WS-1 … WS-5 (this is the one-session deliverable)

Order and commit boundaries matter; follow §6. For every WS: grep to confirm anchors,
anchor Edit `old_string` on the **smallest unique ASCII substring** (never an emoji glyph or
a `\uXXXX` escape — see §7), keep replacements all-single-quoted ASCII with `\u` escapes.

### WS-1 — Kill banner immortality (exclude actioned users from the ALERT, not from `getIPClusters`)
**Why:** the P0 that unblocks the credibility of every other fix.
- Add a hoisted helper **`function getUnresolvedIPClusters(users){…}`** directly below
  `getIPClusters`: iterate the already-classified `users[]` (they carry `.status` and
  `.reviewed`), skip any `u` where `status` ∈ {`deathrow`,`banned`,`cleared`} OR `u.reviewed`
  OR `!u.ipHash` OR `isPrivateIP(u.ipHash)`; cluster survivors by 2-octet prefix. **Do NOT
  modify `getIPClusters` itself** — it has 3 callers that legitimately need full membership.
- In `renderTriageAlerts`, compute the burst set via `getUnresolvedIPClusters(users)`; keep
  the `>= 3` raid threshold **on the unresolved count** so a half-actioned cluster retires.
- **`[CRITIC-CORRECTED]` — update BOTH in-handler recomputes in the SAME commit:** the
  select-all handler (grep `data-cluster-select`, was ~16231) and the bulk-DR handler (grep
  `data-cluster-dr`, was ~16245) currently call `getIPClusters(users)`. Switch both to
  `getUnresolvedIPClusters(users)`, else "Select all N" re-selects already-banned users and
  the count mismatch returns.
- **LEAVE** `getFilteredUsers` cluster filter and `buildTriageData` `hotPrefixes` on the
  unfiltered `getIPClusters` path — the cluster VIEW and `inCluster` risk-flagging
  legitimately show full history.
- **Edge case to document (don't "fix"):** `batchDeathRow` sets `rosterSetStatus('deathrow')`
  immediately, so the banner shrinks instantly (good) while the rows still linger 20s in
  Unreviewed via the `_drGraceMap` grace window (good, intended). Note it in the CHANGELOG so
  a later reviewer doesn't "reconcile" the two.
- **Test:** `scripts/_p7_banner_excludes_actioned_smoke_test.mjs` — slice
  `getUnresolvedIPClusters`; assert (a) cluster of 4 with 2 deathrow → 2 survivors → below
  threshold → not rendered; (b) cluster of 5 all-new → rendered, count 5; (c) `getIPClusters`
  unchanged (still returns full set).
- **Dismiss persistence decision (conservative, chosen):** rely on status-exclusion so the
  banner retires automatically — **no new persistence key this session.** A manual per-prefix
  Dismiss + grow-detection is DEFERRED to v.next.

### WS-2 — Truthful `batchDeathRow` feedback (never a bare "0 added") — **SAME COMMIT AS WS-1**
**Why:** the literal line where trust broke. Honest copy under a still-immortal banner still
reads as broken, so these two ship together.
- In `batchDeathRow` (anchor Edit on `let ok=0;`): compute `added`,
  `already = usernames.length - added`, `total`. Branch the snack:
  - `added>0 && already===0` → **success** `'💀 N queued for Death Row — auto-bans in 72h unless undone'`
  - `added>0 && already>0` → **success** `'💀 N newly queued, M already on Death Row — all queued (72h)'`
  - `added===0 && total>0` → **info** (NOT warn) `'✓ All M already on Death Row — nothing to do. Use "Flush Death Row now" to execute immediately.'`
  - **never** a bare `'0 user(s) …'`.
- Return `{added, already, total}` (additive; the batch-bar caller ignores the return today).
- Standardize DR vocabulary (`queued` + `auto-bans in 72h unless undone`, success-toned)
  across the batch snack, the auto-rules snack (retone from `warn` → `success`), and the
  DR-pending banner copy.
- **`[CRITIC-CORRECTED]` — the Tards bulk-bar (grep, was ~16538) is ALREADY success-toned and
  ALREADY passes `{fromUserAction:true}`.** Do NOT blindly reapply the warn→success retone or
  the arg there. Its only weakness is the newly-added-only count — a light touch or leave it.
  Re-read its actual `snack(...)` before editing so you don't "fix" a non-bug.
- **`[CRITIC-CORRECTED]` — batch undo cap:** `_UNDO_MAX = 10` (grep). Adding
  `{fromUserAction:true}` to 29 individual DR calls would evict all but the last 10 →
  half the batch non-undoable, AND 29 near-simultaneous 20s grace `setTimeout`s each fire a
  full `refreshTriageConsole` rebuild (UI thrash). **Decision (conservative): do NOT enable
  per-row `fromUserAction` on bulk cluster DR this session.** Keep bulk DR as-is (no per-row
  undo) and rely on the existing "Flush"/status flow; a single `dr-batch` undo primitive is a
  real feature but is DEFERRED (it needs a new undo action type + Ctrl+Z handler, more than an
  S). If you disagree after reading the undo code, the fallback is "accept the 10-entry partial
  undo and document it" — but do NOT silently ship 29 grace timers.
- **Test:** `scripts/_p8_batchdeathrow_truthful_counts_smoke_test.mjs` — stub `addToDeathRow`
  (true for fresh, false for preloaded). Assert: 29 fresh → `added=29`; re-run same 29 →
  `added=0, already=29` and the snack string contains `'already on Death Row'` and NOT a bare
  `'0 user(s) added'`; mixed 10 fresh + 19 already → `added=10, already=19`.

### WS-3 — Auto-run-rules master toggle (default **TRUE**) surfaced in toolbar + Settings
**Why:** delivers the named "tick-box auto-run rules on load" and a real off-switch for a
runaway pattern. Default TRUE preserves today's behavior — the toggle only lets him turn it OFF.
- Add `DEFAULT_SETTINGS` boolean **`autoRunRulesOnLoad: true`** (grep `autoDeathRowRules:`,
  add adjacent, was ~1710) AND register it as `'boolean'` in the `validateSettingsShape` map
  (grep `autoDeathRowRules:   'array'`, was ~5117) so the popup Repair button restores it.
  `getSetting` falls back to `DEFAULT_SETTINGS[key]`, so a `true` default is safe on every
  existing install.
- **`[CRITIC-CORRECTED]` — guard SIX automatic invoke sites, not five.** Wrap each with
  `if (getSetting('autoRunRulesOnLoad', true)) applyAutoDeathRowRules(...)`. Grep
  `applyAutoDeathRowRules` and guard the **six AUTOMATIC** call sites (approx lines, reconfirm):
  **15291** (the DOM-scrape/`rosterAdd` ingest path — the one the first-draft spec MISSED),
  15760, 15851, 16016, 16072, 17093. **Do NOT** guard the definition (`function
  applyAutoDeathRowRules` ~15516) and **do NOT** guard the user-initiated sweep button.
  Missing 15291 = un-ticking the box silently leaves auto-DR running = the exact "control does
  nothing" trust-break repeated. After editing, `grep -n applyAutoDeathRowRules modtools.js`
  and eyeball that every automatic site is guarded.
- Render a checkbox **"Auto-run Death Row rules on page load"** in `renderTriageToolbar` near
  the AI-scan button (grep `Run AI tard scan now`, was ~16356-16368), bound to
  `getSetting`/`setSetting`. **Create + bind it INSIDE the render function** (handlers rebind
  every render — see §7). Mirror it in the Daily Moderation settings card via the existing
  `addToggle` helper (grep `addToggle(`).
- Add a persistent, non-alarming status line near the toolbar (reuse `gam-t-alert-info`
  style): `'Auto-rules ON · last run <time> · N flagged'`. Set a module-scoped
  `_lastRulesRunQueued` (default 0) and a timestamp inside `applyAutoDeathRowRules` so a clean
  run is VISIBLE proof the engine is alive (0 flagged is a valid, reassuring result).
- **Test:** `scripts/_p9_autorun_rules_toggle_smoke_test.mjs` — assert
  `DEFAULT_SETTINGS.autoRunRulesOnLoad === true` and regex-assert each of the six sites is
  wrapped in a `getSetting('autoRunRulesOnLoad', true)` guard.
- **RISK — default MUST be true.** A false default silently disables auto-DR for every mod =
  moderation regression.

### WS-4 — "Run rules now" button on the triage toolbar with always-on result feedback
**Why:** delivers the named "run rules on demand" ask. Placement/discoverability — the engine
and a zero-safe sweep already exist, just buried.
- Extract the buried sweep handler **body** into a named `function runRuleSweep(){…}` near
  `applyAutoDeathRowRules` so both the buried sidebar button and the new toolbar button share
  it. **`[CRITIC-CORRECTED]` — the sweep is DOM/state-coupled** (reads `.gam-t-row [data-user]`,
  `getRoster()`, `getDeathRow()` twice for a delta). Extract the body verbatim, keep the buried
  button pointed at it, and **verify the buried button still works** before adding the clone.
- Add a **"⚡ Run rules now"** button in `renderTriageToolbar` beside the AI-scan button (clone
  the `aiBtn` idiom exactly: create in-render, bind in-render, `disabled` + `'Running…'`, then
  re-enable). Keep it visually distinct from the AI-scan button so the two engines aren't
  conflated.
- The buried sweep already snacks on zero-match; make sure the new button surfaces that same
  result (it will, via the shared `runRuleSweep`). Distinguish "no rules configured" from "no
  matches."
- **Test:** `scripts/_p10_run_rules_now_smoke_test.mjs` — slice `runRuleSweep` with stubbed
  `getRoster`/`getDeathRow`/DOM/engine; assert it produces a result signal on BOTH the
  queued>0 and queued===0 paths (no silent no-op).

### WS-5 — Bold genuinely-new (recent AND unreviewed) usernames
**Why:** the BOLD half of the sort-and-bold ask. Pure CSS + one class; cannot boot-crash or
touch HI-1; lowest blast radius; the safe last MUST.
- In `buildUserRow` (grep `function buildUserRow`, was ~16672): add class
  `gam-t-row-fresh` to the row when `u.status==='new' && !u.reviewed &&` the user is within the
  24h window. **`[CRITIC-CORRECTED]` — you cannot read the section's `cutoff` var here** (it
  lives in the render-section closure, not in `buildUserRow`). Recompute locally:
  `const isFresh = u.status==='new' && !u.reviewed && u.joinedAt && (Date.now() - Date.parse(u.joinedAt)) < 24*3600*1000;`
  Treat missing/unparseable `joinedAt` as NOT fresh (don't bold the whole list on a parse miss).
  Append `+(isFresh?' gam-t-row-fresh':'')` to `row.className`.
- Add CSS near the existing name-text rules (grep `.gam-t-user-name-text`):
  `.gam-t-row-fresh .gam-t-user-name-text{font-weight:700}` plus a subtle 2–3px accent
  left-keyline. **Order this rule ABOVE the existing tard danger rule** (grep
  `.gam-t-row-tard`, uses `font-weight:700!important`) so tard-red still wins; the banned
  line-through composes fine. **Verify precedence in the BUILT file** after build-zip.
- Preserve the existing "New" text badge (do not rely on weight alone — WCAG 1.4.1).
- **Verify the actual username element's class** in `buildUserRow` before wiring the selector.
- **Test:** `scripts/_p11_new_user_bold_flag_smoke_test.mjs` — slice the row renderer; assert a
  recent unreviewed user gets `gam-t-row-fresh` while an old OR reviewed user does not.

---

## 4. THE SHOULD SET — do only if budget remains after WS-5

### WS-6 — Ungate the aria-live announcer (SHOULD; ~5-line guard removal, high a11y leverage)
`snack()` already pipes every toast to `__announce()`, but `__announce`/`__mountAriaLive`
early-return unless `__uxOn()` (two default-false flags), so on a stock install the SR live
regions are never mounted — the accessibility face of "no feedback."
- Drop the `__uxOn()` guard from `__mountAriaLive` and `__announce` (grep them) so they run
  unconditionally; **leave all VISUAL `uxPolish` gating intact** (regions are `gam-sr-only`,
  zero visual change).
- Give the alerts container `role='region' aria-label='Triage alerts'`; announce burst
  **deltas** keyed by cluster prefix — do NOT mark the full-`innerHTML`-rebuild container
  `aria-live` (it would re-announce identical text every render).
- Add `role='alert'` to the `preflight` arm-warning and `__announce` when the arm hits 0.
- Depends on WS-2 (so the announced string isn't a bare "0").

### WS-7 — Per-cluster "Ban these N NOW" via `preflight()` arm-timer (SHOULD → **DEFAULT DEFER**)
**`[CRITIC-CORRECTED]` — this is the explicit cut line and the SOLE HI-1 tripwire.** The trust
break is FULLY closed by WS-1+WS-2 without it. **Do NOT attempt unless context is genuinely
under ~50% after WS-5.** If you do:
- Add a `⛔ Ban these N now` control to the burst banner (`data-cluster-ban=prefix`), visually
  subordinate to the softer "Death Row all."
- Handler collects the cluster's **unresolved** names (`getUnresolvedIPClusters`) and routes
  through `preflight({title, danger:true, armSeconds:3, rows:[…]})`; **on confirm, reuse the
  EXISTING flush loop VERBATIM** (grep the flush handler ~16270-16311:
  `markDrInFlight`/`acquireDrLock`/`executeBan`/`verifyBan`/audit/1500ms stagger) filtered to
  cluster names. Never hand-roll an `executeBan` call. Reuse the cross-tab locks or two tabs
  double-ban.
- A code-reviewer must grep the diff to prove no ban path reaches `executeBan` without a
  preceding `await preflight() === true`.

---

## 5. DEFER (name as v.next, do NOT build this session)
- WS-8: focus preservation across `refreshTriageConsole` rebuilds + 24×24 tap targets +
  keyboard-operable username span (dedicated a11y session).
- WS-9: all-clear empty-state line, bulk-DR "Queuing…" loading affordance, `escapeHtml` on the
  cluster prefix (defense-in-depth), drReady "Execute now" button.
- Rules-management CRUD on the main surface (editor already exists in the sidebar).
- Slow-drip sub-threshold cluster re-alerting (inherent to the `>=3` heuristic).
- The `dr-batch` single-undo primitive (from WS-2's undo-cap discussion).

---

## 6. BUILD ORDER + COMMIT CADENCE (per-version commit is mandatory)
1. **WS-1 + WS-2 together in ONE commit/version** (ordering hazard: honest copy under an
   immortal banner still reads broken). Land `getUnresolvedIPClusters` (hoisted `function`)
   BEFORE its callers; update both in-handler recomputes; add both `_p7`/`_p8` tests.
2. **WS-3** (six-site guard + toggle + status line) — its own version.
3. **WS-4** (extract `runRuleSweep` + toolbar button) — depends on WS-3's plumbing; own version.
4. **WS-5** (bold new users, CSS/class) — safe last MUST; own version.
5. **WS-6** (announcer ungate) if budget remains — own version.
6. **WS-7** ONLY if context under ~50% after WS-5 — otherwise ship WS-1..6 and name WS-7 v.next.

Each WS: bump `manifest.json` → `CHANGELOG.md` entry → `node --check` → run `scripts/_*.mjs`
→ slice-eval your new code (§0.1) → `git add` specific files → commit → push. **`build-zip.ps1`
+ `mirror-to-drive.ps1` once at the very end.** Before each commit, `git status` (concurrent
session) — never force-push.

---

## 7. LANDMINES (this exact file has bitten prior sessions)
- **CRLF + `\uXXXX` escape-text:** `modtools.js` is CRLF and stores glyphs as literal
  `\u{1F480}` / raw `⚠` escape TEXT inside template strings — inconsistently (some `title`
  attrs on the same line use the rendered char). Edit `old_string` MUST anchor on the smallest
  unique **ASCII** substring (`let ok=0;`, `data-cluster-dr=`, `function getIPClusters`).
  NEVER put an emoji glyph or `\u` escape in the match target. Keep `new_string`
  all-single-quoted ASCII with `\u` escapes. For multi-line inserts, prefer a Node
  `indexOf`-two-ASCII-anchors + `writeFileSync` splice over Edit.
- **Handlers rebind every render:** `renderTriageAlerts`/`renderTriageToolbar` do
  `innerHTML=''` then `addEventListener` on every `refreshTriageConsole`. Any new
  button/checkbox (WS-3, WS-4) must be created AND bound INSIDE the render function, or it
  vanishes on first refresh. Clone the `aiBtn` idiom.
- **Idempotent `addToDeathRow`** is the root of the whole complaint — `batchDeathRow` counting
  only `added` is the bug. Fix per WS-2.
- **Six guard sites, default TRUE** — see WS-3; missing 15291 or defaulting false = regression.
- **`node --check` is not enough** — slice-eval new code (§0.1). No full-IIFE probe exists.
- **HI-1** — WS-7 only; reuse the flush loop, never bypass `preflight()`.
- **Concurrent sessions** — `git status` before each commit; per-WS commits limit blast radius.

---

## 8. TEST CONVENTION (zero npm deps, no jsdom)
Every fix/feature gets a new `scripts/_pN_<short-name>_smoke_test.mjs` (next free number: **p7**;
`ls scripts/_*.mjs` to confirm — 19+ files, 271+ passing assertions today). Pattern: `readFileSync`
the source → `SRC.indexOf('function theName(')` → `SRC.indexOf('STABLE_ASCII_CLOSER', start)`
(**always pass the second `fromIndex`** — CRLF + repeated comment text cause false matches) →
`new Function(...)` with minimal hand-rolled stubs → assert real behavior with a pass/fail
counter → `process.exit(fail>0?1:0)`. Mirror the HI-1 static-guard idiom from
`scripts/_p1_hi1_instant_ban_smoke_test.mjs` if you touch WS-7. Re-run the FULL suite green
before every commit.

---

## 9. REPORTING TO COMMANDER
Plain language, no code, no CLI as a call-to-action — he is not a programmer and cannot read
or run either. Describe what changed in terms of what he'll SEE and DO, e.g.: *"The burst
banner now disappears once you've actioned everyone in it, and pressing Death Row all tells you
exactly what happened — '29 queued, auto-bans in 72h' or 'all 29 already handled', not a
vanishing '0'. There's now a tick-box to turn the auto-rules on/off and a 'Run rules now'
button, and brand-new users show up bold at the top."* The only manual step you may ask of him
is the extension reload (state it plainly, not as a script). Verify from your own side first —
never "try it and tell me."
