# QA-B1 -- v10.15.5 RALPH HOTFIX 1 verification (iteration 2)

**Repo HEAD:** `9eaec32` (v10.15.5 RALPH HOTFIX 1)
**Commit under audit:** `9eaec32` "fix(v10.15.5): RALPH HOTFIX 1 -- close 8 defects from QA ralph iteration 1"
**Baseline:** QA-A4 (iteration 1) identified 1 P0 + 3 P1 focus-trap defects
**Date:** 2026-05-12
**Scope:** Read-only verification of the 4 focus-trap fixes claimed in v10.15.5 + side-effect hunt. No code modified.

---

## Summary -- Per-Fix Verdict Matrix

| # | QA-A4 Finding | Severity | v10.15.5 fix site | Verdict |
|---|---------------|----------|-------------------|---------|
| 1 | `installFocusTrap` __uxOn() gate silently no-op'd 5+ ships | **P0** | modtools.js:4185-4195 | **PASS** |
| 2 | Mod Chat closePanel never invoked cleanup | **P1** | modtools.js:17536-17546 | **PARTIAL** -- works on first close; breaks on second open onward (see Side-Effect H2) |
| 3 | Modmail full panel ESC handler skipped cleanup | **P1** | modtools.js:17771-17779 | **PASS** |
| 4 | Modmail toggle-already-open path skipped cleanup | **P1** | modtools.js:17684-17694 | **PASS** |

**Net verdict:** 3 of 4 fixes are correctly applied. Fix #2 (Mod Chat) is a partial fix that closes one defect path but leaves a regression on re-open. **NEW regression introduced** by Fix #1: HotNow panel close path was previously a silent no-op under uxOn-gating; with the gate removed, HotNow now installs a focus trap but `_closeHotNowPanel` never invokes its cleanup -- same defect class as the Mod Chat / Modmail bugs that QA-A4 P1 named, missed in the hotfix scan.

---

## A. Per-Fix Verification

### Fix #1 (P0) -- `installFocusTrap` __uxOn() gate removed

**Location:** `modtools.js:4185-4195`

**Before (v10.15.4):**
```js
function installFocusTrap(rootEl){
  if (!__uxOn() || !rootEl) return function(){};
```

**After (v10.15.5):**
```js
function installFocusTrap(rootEl){
  // v10.15.5 QA-A4 P0: removed __uxOn() gate. A11y focus containment is
  // a baseline accessibility feature, not opt-in visual polish. Previous
  // __uxOn-gated behavior silently no-op'd 5+ focus-trap ships (Help/
  // Settings/ModLog/BugReport modals from v10.14.1 F1, snack action UNDO
  // from v10.13.5 P0-D, Mod Chat + Hot-Now from v10.15.1, Preflight +
  // Modmail full panel from v10.15.3) for any operator who hadn't toggled
  // features.uxPolish=true. Default flag is FALSE per modtools.js:1740, so
  // the vast majority of mods got aria attrs without actual Tab containment.
  // Trap now installs unconditionally when rootEl is provided.
  if (!rootEl) return function(){};
```

**Verdict:** PASS.

- `__uxOn()` gate removed.
- Only `!rootEl` defensive gate remains.
- Comment explaining rationale is comprehensive (names 5 prior ships, cites the false-flag default).
- Minor doc nit: the comment includes "snack action UNDO from v10.13.5 P0-D" in the list of affected ships, but `installFocusTrap` is NOT called from the snack code (L7669-7803 -- only `.focus()` on action button + scoped ESC handler). The snack's a11y mechanism is independent of `installFocusTrap`. Not a bug; just an inaccurate enumeration. Recommend correcting on next pass.

### Fix #2 (P1) -- Mod Chat closePanel invokes cleanup

**Location:** `modtools.js:17536-17546`

**After (v10.15.5):**
```js
function closePanel(){
  if (!STATE.panelEl) return;
  // v10.15.5 QA-A4 P1: invoke focus-trap cleanup so focus restores to the
  // element that opened the panel. Pre-fix STATE._focusTrapCleanup was
  // stored at panel build but never called -- focus stayed inside the
  // (now-hidden via CSS class) panel.
  try { if (typeof STATE._focusTrapCleanup === 'function') STATE._focusTrapCleanup(); STATE._focusTrapCleanup = null; } catch (_) {}
  STATE.panelEl.classList.remove('gam-mc-open');
  stopAllPolling();
  startClosedPolling();
}
```

**Verdict:** PARTIAL.

The fix correctly invokes cleanup BEFORE removing the CSS class, with proper try/catch + typeof guard + null-out after invocation. **This works correctly for the FIRST close-after-open cycle.**

**Regression on subsequent opens:** `buildPanel()` at L17249-17250 has the caching guard:
```js
function buildPanel(){
  if (STATE.panelEl) return STATE.panelEl;
```

`closePanel` does NOT null `STATE.panelEl` or remove it from the DOM (only toggles the `gam-mc-open` class -- the panel is still in DOM, just CSS-hidden). On the NEXT open-via-togglePanel cycle:

1. `togglePanel()` -> `openPanel()` -> `buildPanel()`
2. `buildPanel` early-returns cached `STATE.panelEl` (panel exists, was never DOM-removed)
3. **The install code at L17455-17459 never re-runs**
4. `STATE._focusTrapCleanup` stays at the `null` set by the previous close
5. The re-opened panel has no Tab containment (the original keydown listener was removed by the previous cleanup invocation at L4221)
6. On the next close, `typeof STATE._focusTrapCleanup === 'function'` is false (null) -> cleanup branch skipped -> focus NOT restored, no listeners to clean

**Impact:** A user who opens-closes Mod Chat twice in the same page session loses Tab containment AND focus-restore on the second open onward. Fix #2 closes the iteration-1 defect path but introduces a new one for repeated opens.

**Recommended remediation paths (pick one):**
- **Option A (smallest diff):** in `closePanel`, after invoking cleanup, also remove the panel from DOM and null `STATE.panelEl`. This forces a fresh `buildPanel` on next open. Side effect: re-renders the chat thread/composer state -- check whether that's acceptable for in-memory draft preservation.
- **Option B (preferred -- keeps caching):** in `openPanel` (before buildPanel returns), detect the cached-rebuild case and re-install the trap. Concrete: after `const panel = _step('buildPanel', buildPanel);` at L17502, if `STATE._focusTrapCleanup == null && panel`, call `STATE._focusTrapCleanup = installFocusTrap(panel) || null;`.
- **Option C:** invoke cleanup but DON'T null `STATE._focusTrapCleanup` (cleanup is idempotent enough -- a second listener-removeEventListener call is a no-op, and re-focusing prevActive is harmless). This is the cheapest fix but does not address the missing Tab-containment on the second open -- the keydown listener IS gone after first cleanup. Not viable on its own.

The defect class is identical to the iteration-1 P1: focus-trap install lifecycle does not match the panel's open/close lifecycle.

### Fix #3 (P1) -- Modmail full panel ESC handler invokes cleanup

**Location:** `modtools.js:17771-17779`

**After (v10.15.5):**
```js
document.addEventListener('keydown', function escHandler(ev) {
  if (ev.key === 'Escape') {
    document.removeEventListener('keydown', escHandler);
    // v10.15.5 QA-A4 P1: invoke focus-trap cleanup before removing the
    // panel. ESC is the dominant close path (advertised in title=
    // "Close (ESC)") -- this was the loudest focus-restore miss.
    try { if (typeof panel._gamMmpFocusTrapCleanup === 'function') panel._gamMmpFocusTrapCleanup(); } catch (_) {}
    if (panel.parentNode) panel.remove();
  }
});
```

**Verdict:** PASS.

- Cleanup invoked BEFORE `panel.remove()` (correct ordering -- DOM still present when `prevActive.focus()` fires inside cleanup).
- typeof guard prevents calling non-function.
- try/catch wraps the invocation.
- Comment correctly notes ESC is the advertised dominant close path.

### Fix #4 (P1) -- Modmail toggle-already-open path invokes cleanup

**Location:** `modtools.js:17684-17694`

**After (v10.15.5):**
```js
function _showModmailPanel() {
  const existing = document.getElementById('gam-modmail-panel');
  if (existing) {
    // v10.15.5 QA-A4 P1: invoke focus-trap cleanup on toggle-already-open
    // dismissal path. Pre-fix this path skipped the cleanup that the
    // [data-close] click handler does, so the trap listener leaked until
    // GC. Now symmetric with the click-close path.
    try { if (typeof existing._gamMmpFocusTrapCleanup === 'function') existing._gamMmpFocusTrapCleanup(); } catch (_) {}
    existing.remove();
    return;
  }
```

**Verdict:** PASS.

- Cleanup invoked BEFORE `existing.remove()` -- symmetric with click-close path at L17761-17767.
- typeof guard + try/catch.
- Comment correctly identifies the listener-leak-until-GC pre-fix behavior.

---

## B. Side-Effect Hunt

### H1 (CRITICAL) -- HotNow panel: identical defect class to QA-A4 P1 #1/#2, NOT fixed in v10.15.5

**Location:** `modtools.js:11460-11593`

QA-A4 iteration 1 explicitly named HotNow as one of the 4 P1 defects (B.3 in QA-A4.md). The v10.15.5 hotfix fixed 3 of 4 (Modmail two paths + Mod Chat closePanel) but **the HotNow `_closeHotNowPanel` was not touched**.

```js
function _closeHotNowPanel() {
  const hnPanel = document.getElementById('gam-hot-now-panel');
  if (!hnPanel) return;
  hnPanel.classList.remove('gam-hn-open');
  setTimeout(function() { if (hnPanel.parentNode) hnPanel.remove(); }, 180);
  panelOpen = null;
}
```

`hnPanel._gamHnFocusTrapCleanup` is stored at L11483 but **never invoked**. Furthermore:
- Pre-v10.15.5 with __uxOn() gate, `installFocusTrap` returned a no-op closure -- this defect was invisible (no listener to leak, no prevActive to restore).
- Post-v10.15.5 with the gate removed, `installFocusTrap` installs the real trap. The close path now has a real focus-restore-to-opener bug.

`closeAllPanels` selector at L7497-7505 does NOT include `#gam-hot-now-panel`, so the central sweep also misses it.

**Impact:** A keyboard user who triggers HotNow (SIREN button on status bar) and then dismisses it (ESC or close button) finds focus on `<body>` instead of restored to the SIREN button. Equivalent severity to QA-A4 #1 (Mod Chat) and #2 (HotNow itself in iteration 1 was P1).

**Verdict:** NEW P1 regression introduced by Fix #1 because the hotfix scan did not enumerate all `installFocusTrap` call sites against their close paths.

**Recommended fix:**
```js
function _closeHotNowPanel() {
  const hnPanel = document.getElementById('gam-hot-now-panel');
  if (!hnPanel) return;
  try { if (typeof hnPanel._gamHnFocusTrapCleanup === 'function') hnPanel._gamHnFocusTrapCleanup(); } catch (_) {}
  hnPanel.classList.remove('gam-hn-open');
  setTimeout(function() { if (hnPanel.parentNode) hnPanel.remove(); }, 180);
  panelOpen = null;
}
```

### H2 (HIGH) -- Mod Chat re-open lifecycle defect (Fix #2 PARTIAL)

Detailed above in Fix #2 verdict. Restating the impact pattern for clarity:

| Open | Close | Tab containment? | Focus restore? |
|------|-------|------------------|----------------|
| 1st | 1st | YES (trap installed at first buildPanel) | YES (v10.15.5 fix) |
| 2nd | 2nd | **NO** (buildPanel cached, install code bypassed) | **NO** (STATE._focusTrapCleanup is null) |
| Nth | Nth | NO | NO |

**Impact:** v10.15.5 fixes the failure mode QA-A4 named (first close) but introduces a regression for repeated open-close cycles. In practice, mods open Mod Chat multiple times per session, so this is high-frequency.

### H3 (LOW) -- IntelDrawer double-trap coexistence

`installFocusTrap` at L5895 is called in IntelDrawer's open(). IntelDrawer ALSO has a sentinel-based focus trap (top+bottom sentinels at L5775-5789).

**Pre-fix:** `installFocusTrap` was a no-op (uxPolish=false); only sentinels ran.
**Post-fix:** Both run together.

Analysis of interaction:
- `installFocusTrap`'s `getItems()` selector includes `[tabindex]:not([tabindex="-1"])` -- which includes IntelDrawer's `tabindex="0"` sentinels.
- `installFocusTrap.first` = topSentinel, `last` = bottomSentinel.
- `installFocusTrap`'s microtask auto-focus moves focus to `items[0]` = topSentinel -> sentinel's focus listener bounces focus to LAST real button (via `_getFocusables` which excludes `[data-boundary]`).
- 30ms later, IntelDrawer's `setTimeout` at L5889 explicitly focuses `f[0]` = FIRST real button. Corrects the microtask-induced bad-state.

**Impact:** Brief (~30ms) window where focus is on the wrong button. Visually imperceptible. Not a bug, but a fragile composition -- future changes to either trap may surface the race. Not actionable now but flag for QA-A4 retrospective.

### H4 (none) -- showModal-managed modals (Help/Settings/Mod Log/Bug Report/Park/Mod Console/askText)

Verified all use `_gamFocusCleanup` storage convention (set inside `installFocusTrap` at L4224). The central sweep at `closeAllPanels` L7506-7508 invokes `_gamFocusCleanup` for every panel matching `.gam-modal, #gam-backdrop, .gam-modal-backdrop, #gam-intel-backdrop, #gam-token-onboard-backdrop, .gam-preflight-wrap, [data-gam-orphan-backdrop]`. Cleanup is nulled after invocation so re-sweep is a no-op.

Verified individual close paths:
- askTextModal (L2989 install, L2958 cleanup): correctly invokes
- Park modal (L3840 install, L3792 cleanup): correctly invokes
- Bug Report (L1553 install, sweep by closeAllPanels): correctly handled
- Mod Console (L8442 install, sweep by closeAllPanels): correctly handled
- showModal generic (L7875 install, sweep + per-panel ESC): correctly handled
- Preflight (L2183 install, L2191 cleanup): correctly invokes
- IntelDrawer (L5895 install, L5901 cleanup): correctly invokes

No double-cleanup risk because each cleanup nulls its handle after first invocation.

### H5 (none) -- Status-bar popovers (Queue/Health/ActiveMods/AutoUnsticky/DR/SUS)

Use the SEPARATE `_installPopoverTrap` helper at L4236-4272, not `installFocusTrap`. The uxOn-gate change does not affect them. No regression here.

### H6 (none) -- Modmail full panel: other close paths

Searched all references to `gam-modmail-panel` (grep yields only the 2 lines at L17685 + L17696). The 3 close paths verified are exhaustive:
- `[data-close]` click handler (L17761-17767) -- pre-existing cleanup, still works
- ESC handler (L17771-17779) -- v10.15.5 Fix #3
- Toggle-already-open (L17684-17694) -- v10.15.5 Fix #4

`closeAllPanels` does not match the modmail panel (no relevant class/ID in SEL list). No programmatic remove call sites elsewhere. All paths covered.

### H7 (none) -- prevActive detachment edge case

`installFocusTrap.cleanup` does `prevActive.focus()` (L4222) inside try/catch. If the opener element was destroyed (e.g. a row that was re-rendered between trap-install and cleanup), `.focus()` on the detached element silently no-ops (browser moves focus to `<body>`). No exception thrown. Acceptable degraded behavior.

### H8 (none) -- Snack action UNDO

`installFocusTrap` is NOT called from snack code. The QA-A4 fix #1 comment lists "snack action UNDO from v10.13.5 P0-D" among the "5+ focus-trap ships" affected, but the actual snack code at L7700-7803 implements its own a11y (focus action button + scoped ESC). The uxOn-gate removal does not affect snacks. Minor inaccuracy in the comment; functionally a no-op finding.

---

## C. Recommendations

### Must-fix before declaring v10.15 line stable (P1)

1. **HotNow panel close-path cleanup** (H1) -- mirrors the Modmail/Mod Chat fixes. Add cleanup invocation to `_closeHotNowPanel` at L11587. Equivalent diff to Fix #4. **Severity: P1**, same class as the iteration-1 P1 defects that v10.15.5 was meant to close.

2. **Mod Chat re-open lifecycle** (H2) -- pick Option B from Fix #2 verdict (re-install trap on cached re-open). Without this, second-open-onward loses Tab containment. **Severity: P1**.

### Nice-to-have / next pass (P2)

3. Correct comment at L4189 -- remove "snack action UNDO from v10.13.5 P0-D" from the affected-ships enumeration since snack doesn't use `installFocusTrap`. (Or rephrase to "and related a11y features that ALSO benefited from uxOn removal".)

4. Audit IntelDrawer for the double-trap microtask race (H3). Future-proofing only; no current user-visible bug.

5. Consider adding `#gam-hot-now-panel` to `closeAllPanels` SEL list as a belt-and-suspenders safety net for any future close paths that go through the central sweep.

---

## D. Methodology

- `git log --oneline -5` -> confirmed HEAD `9eaec32` is the v10.15.5 commit.
- `git show 9eaec32 -- modtools.js` -> verified all 4 named fix sites match the diff.
- Read each fix site in context (~30 lines around) to verify integration correctness.
- Grep `installFocusTrap` -> 12 call sites enumerated, each call site + corresponding close path verified for cleanup invocation.
- Grep `_gamFocusCleanup` / `_gamHnFocusTrapCleanup` / `_gamMmpFocusTrapCleanup` / `STATE._focusTrapCleanup` -> verified storage and invocation symmetry per site.
- Read closeAllPanels SEL list -> verified which surfaces are/aren't central-swept.
- Read `_installPopoverTrap` -> confirmed status-bar popovers use a separate helper unaffected by the uxOn-gate change.
- No code modified, no scripts run.

---

## E. Net assessment

v10.15.5 RALPH HOTFIX 1 closes the iteration-1 P0 (uxOn gate) cleanly. Of the 3 iteration-1 P1 defects named in QA-A4, 2 are fully fixed (Modmail ESC + Modmail toggle-already-open) and 1 is partially fixed (Mod Chat closePanel works on first close, regresses on second open). The hotfix also missed extending the same defect-class fix to the HotNow close path -- a regression introduced specifically because removing the uxOn gate woke up a previously-silent bug.

**Recommend: a v10.15.6 fast-follow** that (a) re-installs the Mod Chat trap on cached re-open and (b) wires HotNow `_closeHotNowPanel` cleanup. ~20 lines of diff. Identical defect class to the 4 already addressed; same author intent, just missed during the iteration-1 -> iteration-2 scan.
