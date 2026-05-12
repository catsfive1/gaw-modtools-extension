# QA-A4 -- Focus-Trap Verification for v10.15.1 + v10.15.3 (read-only)

**Repo HEAD:** `8b1a239` (current; after v10.15.4 commit, but v10.15.4 added no new focus-trap code -- traps under audit shipped in `3d79e22` v10.15.1 + `551bdaa` v10.15.3, both ancestors of HEAD)
**Commits under audit:** `3d79e22` v10.15.1 (Mod Chat + Hot-Now traps), `551bdaa` v10.15.3 (Preflight + Modmail panel traps)
**Date:** 2026-05-12
**Scope:** Read-only verification of the 4 focus traps named in the QA-A4 brief. No code modified.

---

## Summary -- Coverage Matrix

| # | Surface | install line | aria | cleanup stored | cleanup invoked on close | Verdict |
|---|---------|--------------|------|----------------|--------------------------|---------|
| 1 | Mod Chat panel | 17431 | role=dialog + aria-label (no aria-modal in spec) | `STATE._focusTrapCleanup` | **NEVER** -- not called on `closePanel()` | **PARTIAL-PASS** (trap installs but cleanup is dead code) |
| 2 | Hot-Now panel | 11457 | role=dialog + aria-modal + aria-label | `hnPanel._gamHnFocusTrapCleanup` | **NEVER** -- not called in `_closeHotNowPanel()` | **PARTIAL-PASS** (DOM removed at L11565 severs listener; focus-restore lost) |
| 3 | Preflight modal | 2183 | role=dialog + aria-modal + dynamic aria-label | local `_preflightTrapCleanup` | **ALWAYS** -- `finish()` runs cleanup BEFORE `wrap.remove()`; all 4 close paths (Yes, No, ESC, backdrop, ctrl-enter-auto) route through `finish()` | **FULL PASS** |
| 4 | Modmail full panel | 17718 | role=dialog + aria-modal + aria-label | `panel._gamMmpFocusTrapCleanup` | **PARTIAL** -- runs on `[data-close]` click only; **ESC handler at L17732-37 and toggle-already-open path at L17654-55 both call `panel.remove()` without invoking cleanup** | **PARTIAL-PASS** (close button works; ESC and re-toggle skip cleanup) |

**Net verdict:** All 4 traps install correctly and set proper aria semantics. Only **Preflight (#3) is fully wired** for focus-restore-on-close. The other 3 store the cleanup but never (or only sometimes) invoke it, so the operator's pre-modal focus is not restored when the dialog dismisses. The leaks are not severe -- panel detach severs the trap's `keydown` listener on the panel element itself -- but the `prevActive.focus()` step inside `cleanup()` never fires for #1, #2, and 2 of 3 close paths on #4. **Net keyboard a11y improvement vs pre-v10.15.1 baseline (where 0 of these 4 had traps) is real and substantial.** The cleanup gaps are P2 polish, not P0/P1.

**Critical gating finding:** `installFocusTrap()` (modtools.js:4185-4217) returns `function(){}` (no-op) when `!__uxOn() || !rootEl`. `__uxOn()` requires `features.uxPolish === true` AND `features.platformHardening === true`. **`features.uxPolish` defaults to FALSE** (modtools.js:1740). Fresh installs and users who never opted into the v8.1 ux polish flag get **NO focus trap on any of the 4 surfaces** -- the aria-modal/role=dialog attributes are still set (they live outside the trap install try block), but Tab leaks to page DOM and focus is never moved into or restored from the dialog. This is the single largest hidden gap.

---

## A. Surface Table -- Authoritative

| # | Surface | el() construction | aria attrs set at | installFocusTrap call | Cleanup storage | Close paths -> cleanup? |
|---|---------|--------------------|---------------------|------------------------|------------------|--------------------------|
| 1 | **Mod Chat panel** | `buildPanel()` modtools.js:17223; root at 17225 | 17225 (`el()` first arg) | 17431 | `STATE._focusTrapCleanup` (L17431) | `closePanel()` 17510-15: removes `.gam-mc-open` class only, no `.remove()`, no cleanup. **No invocation site for `STATE._focusTrapCleanup` anywhere in the file** (grep confirmed, single hit at install line). |
| 2 | **Hot-Now panel** | `_showHotNowPanel()` 11434; root at 11440 | 11445-47 (3 `setAttribute` calls) | 11456-58 | `hnPanel._gamHnFocusTrapCleanup` (L11457) | `_closeHotNowPanel()` 11561-67: removes `.gam-hn-open` class, then `setTimeout(remove, 180)`. **Cleanup never invoked**; DOM detach at +180ms severs the panel `keydown` listener but `prevActive.focus()` is dead code. |
| 3 | **Preflight modal** | `preflight()` 2150; wrap at 2153 | 2177-79 (3 `setAttribute`, label dynamic) | 2182-85 | local `_preflightTrapCleanup` (L2180/2183) | `finish(v)` 2189-94 invokes `_preflightTrapCleanup()` BEFORE `wrap.remove()`. Close paths: (a) Yes 2224/2226, (b) No 2195, (c) ESC 2188+2197, (d) backdrop 2196, (e) Ctrl+Enter auto-confirm 2203-07 -- **all route through `finish()`**. |
| 4 | **Modmail full panel** | `_showModmailPanel()` 17653; panel at 17656 | 17713-15 (3 `setAttribute`) | 17717-19 | `panel._gamMmpFocusTrapCleanup` (L17718) | Close paths: (a) `[data-close]` click 17722-28 INVOKES cleanup BEFORE `panel.remove()` (L17725 -> L17726); (b) ESC handler 17732-37 calls `panel.remove()` directly WITHOUT cleanup; (c) toggle-already-open 17654-55 calls `existing.remove()` WITHOUT cleanup. |

---

## B. Findings

### B.1 `installFocusTrap` itself silently no-ops when uxPolish flag is off (CRITICAL HIDDEN GAP)

```js
// modtools.js:4185-4217
function installFocusTrap(rootEl){
  if (!__uxOn() || !rootEl) return function(){};   // <-- silent no-op
  ...
  return cleanup;
}
```

`__uxOn()` (L4155-57) is `__uxPolishOn() && __hardeningOn()`. Both flags must be `true`. Defaults (L1719, L1740):

- `features.platformHardening: true` (default-on since v7.2)
- `features.uxPolish: false` (default-off as of v8.1)

So in a fresh install, all 4 traps return the no-op closure. Aria attributes are set (those happen before the `try { installFocusTrap(...) }` block in every site), but **Tab cycle, focus-into-dialog-on-open, and focus-restore-to-opener-on-close** are all dead. The audit ACs claim "focus trap installed"; the literal truth is **"focus trap install code present; runs only if operator has uxPolish flag on."**

This is not a regression -- previous traps in the codebase share the same gating (Mod Console, Intel Drawer, askText, Park, Bug Report all install via this helper). But the v10.15.1+v10.15.3 acceptance criteria did not call out the flag dependency, and the QA brief implicitly assumed the install was unconditional.

**Verdict:** WORKS-WHEN-FLAGGED-ON. Not a code bug; an unstated dependency.

### B.2 Mod Chat panel: cleanup is dead code (PARTIAL-PASS)

L17431 stores `STATE._focusTrapCleanup = installFocusTrap(panel) || null`. The cleanup function returned by `installFocusTrap` performs two things on call (L4211-14):

1. `rootEl.removeEventListener('keydown', onKey)` -- removes the trap's Tab handler
2. `prevActive.focus()` -- restores focus to whatever element had focus when the trap was installed (typically the Mod Chat status-bar button)

`closePanel()` (L17510-15) only toggles the `gam-mc-open` CSS class and stops polling. **It does not remove the panel from the DOM, and it does not invoke `STATE._focusTrapCleanup`.** Grep confirms `_focusTrapCleanup` has exactly one occurrence in the file -- the install line. The cleanup closure exists in memory but is never called.

Consequences:

- The Tab-cycle handler stays bound for the lifetime of `STATE.panelEl` (which is reused across open/close cycles per L17223-24's early return). No listener stack-up.
- **Focus is never restored** to the Mod Chat status-bar button when the panel closes. A keyboard user who Enter'd on the button to open the panel, then Esc'd to close it, finds focus on `<body>` (or wherever the focused element drifted to during the panel's lifetime).
- Trap's `keydown` listener stays bound on the panel, which is still in the DOM (just visually hidden). Subsequent reopens find the listener already attached and `buildPanel()` short-circuits at the `STATE.panelEl` guard, so no duplication.

**Trigger anchor restoration is the lost feature; Tab-cycle while open works correctly.**

### B.3 Hot-Now panel: cleanup is dead code but DOM detach masks it (PARTIAL-PASS)

L11457 stores `hnPanel._gamHnFocusTrapCleanup = installFocusTrap(hnPanel) || null`. `_closeHotNowPanel()` (L11561-67):

```js
function _closeHotNowPanel() {
  const hnPanel = document.getElementById('gam-hot-now-panel');
  if (!hnPanel) return;
  hnPanel.classList.remove('gam-hn-open');
  setTimeout(function() { if (hnPanel.parentNode) hnPanel.remove(); }, 180);
  panelOpen = null;
}
```

The cleanup is never invoked. After 180ms, the panel is detached -- which severs the `keydown` listener naturally. So:

- No listener leak.
- **No focus restoration to the Hot-Now status-bar button.**
- Subsequent opens: `document.getElementById('gam-hot-now-panel')` returns null because the panel was removed -> `if (!hnPanel)` branch fires -> new panel, new trap. No double-trap, no stale state. The hunt-list concern about listener stacking is therefore **NOT a real issue** here, because the panel is fully removed on close.

### B.4 Preflight modal: clean wiring across all close paths (FULL PASS)

`finish(v)` (L2189-94) is the single funnel:

```js
function finish(v){
  document.removeEventListener('keydown', escHandler);
  try { if (typeof _preflightTrapCleanup === 'function') _preflightTrapCleanup(); } catch(_){}
  wrap.remove();
  resolve(v);
}
```

Cleanup runs at L2191, BEFORE `wrap.remove()` at L2192. All 5 close paths route through `finish()`:

| Path | Trigger | Site |
|------|---------|------|
| Cancel button | `no.click` -> `finish(false)` | L2195 |
| Confirm button (immediate) | `yes.click` -> `finish(true)` | L2226 |
| Confirm button (armed) | `yes.click` clears interval -> `finish(true)` | L2224 |
| Backdrop click | `.gam-preflight-backdrop click` -> `finish(false)` | L2196 |
| ESC key | document `keydown` -> `escHandler` -> `finish(false)` | L2188 + L2197 |
| Ctrl+Enter auto-confirm | armSeconds=0 fast-path -> `finish(true)` | L2203-07 |

The `_preflightTrapCleanup` local variable is correctly scoped to the closure -- each `preflight()` invocation gets its own. No state leakage between preflights.

**This is the cleanest of the four traps. Reference implementation.**

### B.5 Modmail full panel: TWO of three close paths skip cleanup (PARTIAL-PASS, real gap)

Three close paths exist:

```js
// L17654-55 (toggle-when-already-open)
const existing = document.getElementById('gam-modmail-panel');
if (existing) { existing.remove(); return; }     // <-- cleanup NOT invoked

// L17722-28 (close button)
panel.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) {
    e.stopPropagation();
    try { if (typeof panel._gamMmpFocusTrapCleanup === 'function') panel._gamMmpFocusTrapCleanup(); } catch(_){}
    panel.remove();
    return;
  }
  ...
});

// L17732-37 (ESC)
document.addEventListener('keydown', function escHandler(ev) {
  if (ev.key === 'Escape') {
    document.removeEventListener('keydown', escHandler);
    if (panel.parentNode) panel.remove();         // <-- cleanup NOT invoked
  }
});
```

Only the `[data-close]` click path invokes the cleanup. ESC and re-toggle both call `panel.remove()` directly. Consequences:

- DOM detach severs the trap's `keydown` listener on the panel (no leak).
- **Focus restoration to the modmail status-bar button does not happen** when the operator dismisses via ESC or by clicking the modmail button a second time. Only clicking the in-panel close `[x]` button restores focus.
- Most operators will hit ESC (advertised in the close button title: `title="Close (ESC)"` on L17678). So the **dominant close path is the one that skips cleanup**. The cleanup is wired only for the less-likely path.

This is a 2-line fix per path (call cleanup before remove). Not shipped in v10.15.3.

### B.6 `installFocusTrap` return contract verified

```js
// L4185-4217
function installFocusTrap(rootEl){
  if (!__uxOn() || !rootEl) return function(){};   // path A
  ...
  return cleanup;                                  // path B
}
```

The function always returns a callable. Callers use `installFocusTrap(x) || null` defensively, which is harmless -- `function(){}` is truthy, so `|| null` never fires; cleanup-call sites in #3 only run if `typeof X === 'function'`, which is true for both path A and path B. **Storing `function(){}` and never calling it is also fine** (Mod Chat, Hot-Now), but calling it is a no-op then anyway -- so the gap in #1/#2/#4 only matters when uxPolish IS on (the real cleanup is returned). When uxPolish is OFF, missing the invocation is harmless because the cleanup is a no-op closure.

This means **the cleanup-invocation gap is only operative when uxPolish=true**. The audit risk is bounded to that operator population.

### B.7 Mod Chat panel reuse vs. new-on-each-open

`buildPanel()` at L17223 early-returns when `STATE.panelEl` is set:

```js
function buildPanel(){
  if (STATE.panelEl) return STATE.panelEl;
  ...
  document.body.appendChild(panel);
  STATE.panelEl = panel;
  try {
    if (typeof installFocusTrap === 'function') {
      STATE._focusTrapCleanup = installFocusTrap(panel) || null;
    }
  } catch (_) {}
  ...
}
```

`closePanel()` does NOT clear `STATE.panelEl` -- the panel is reused across open/close cycles. `installFocusTrap` runs ONCE per session (the first `buildPanel`). No listener stacking; the cleanup closure stored at first open remains valid and unused for the rest of the session.

**Audit hunt-list concern resolved:** Mod Chat panel does NOT accumulate listeners. The risk noted in the brief is unfounded for this surface.

### B.8 Hot-Now panel reuse vs. new-on-each-open

Brief said: "Hot-Now panel is reused (`document.getElementById('gam-hot-now-panel')` lookup before creation). Subsequent opens get the same panel -- does the listener stack up?"

Verified: **NO stack-up**. The panel IS removed from the DOM at L11565 (180ms after close). Subsequent `document.getElementById('gam-hot-now-panel')` returns null -- the `if (!hnPanel)` branch fires -> new panel, new trap. So:

- First open: panel created, ESC handler bound, trap installed.
- Close: 180ms later panel.remove() detaches all listeners.
- Re-open: brand new panel, brand new trap, brand new ESC handler. No accumulation.

The lookup at L11438 (`let hnPanel = document.getElementById('gam-hot-now-panel');`) only matches between L11454 (`document.body.appendChild(hnPanel);`) and L11565 (`hnPanel.remove();`). Outside that window the lookup returns null. **No listener-stack bug here.**

### B.9 Modmail full panel: focus-during-animation nuance (NOT a regression)

Brief raised: "panel.style.transform animation -- does focus trap conflict with the requestAnimationFrame? Initial focus might land before the panel is visible."

Verified flow:

1. L17704: `document.body.appendChild(panel)` -- panel in DOM, off-screen via `transform:translateX(100%)`.
2. L17705: `requestAnimationFrame(() => { panel.style.transform = 'translateX(0)'; });` -- queues the slide-in for the next paint.
3. L17717-19: `installFocusTrap(panel)` runs synchronously, returning cleanup.
4. Inside `installFocusTrap` (L4206-10): `queueMicrotask` queues a focus shift to `items[0]`.
5. CSS transition (200ms-ish per spec) animates the panel from off-screen to on-screen.

Microtask runs at the end of the current macrotask, BEFORE the next animation frame. Focus shifts to `items[0]` before the panel finishes its slide-in. The focused element is in the DOM, focusable, and AT-announcable -- it's just not yet visible on screen. **Not an a11y regression** (focus shifting before visual paint is standard SPA behavior). Sighted-keyboard users see the focus ring on the offscreen element briefly, then the panel slides in over it. Mild UX flicker, no functional issue.

### B.10 Mod Chat panel aria-modal NOT set (matches spec)

Brief required `role="dialog"` + `aria-label="Mod Chat"` for Mod Chat -- did NOT require `aria-modal`. Verified L17225 sets exactly those two attributes via `el()`. The other 3 traps DO set `aria-modal="true"` (Hot-Now L11446, Preflight L2178, Modmail L17714) but Mod Chat does not. Consistent with the brief; SR users navigating into Mod Chat will hear "dialog" but not "modal dialog" -- the panel is a side-docked surface that doesn't fully cover the page, so this is defensible UX. Flag for review only if accessibility audit demands consistency.

---

## C. ARIA & Trigger Affordances (this audit's surfaces only)

| # | role=dialog | aria-modal | aria-label |
|---|--------------|-------------|-------------|
| 1 Mod Chat | YES (L17225) | NO (intentional per spec) | "Mod Chat" (L17225) |
| 2 Hot-Now | YES (L11445) | YES (L11446) | "Hot Now triage panel" (L11447) |
| 3 Preflight | YES (L2177) | YES (L2178) | "Destructive action confirmation" or "Action confirmation" (L2179, dynamic on `danger` flag) |
| 4 Modmail | YES (L17713) | YES (L17714) | "Modmail full panel" (L17715) |

All aria attributes are set BEFORE the `installFocusTrap` try block, so they apply regardless of the uxPolish flag state. **Aria semantics survive uxPolish=false; trap behavior does not.** This is a sensible degradation (SR users still get dialog context; keyboard-only users lose Tab containment).

Triggers (status-bar buttons that open these surfaces):

- **Mod Chat button**: `gam-mc-badge` button at L17542. No `aria-haspopup`, no `aria-expanded`. Tooltip via `title="Mod Chat"`. Same level of trigger advertising as pre-v10.15.1.
- **Hot-Now button**: not directly inspected here (out of QA-A4 scope), but `_showHotNowPanel` is reached via the SIREN click path per the v10.13 audit (V10_13_RALPH_AUDIT/RALPH-FOCUS-TRAPS.md §A row 11).
- **Preflight**: no fixed trigger -- modal launched programmatically by perma-ban, DR cancel-all, etc.
- **Modmail full panel**: launched from `[EXPAND]` button in the modmail popover (v9.17.0 promotion). Trigger advertising not audited here.

No aria-haspopup or aria-expanded improvements shipped in v10.15.1 or v10.15.3. Out of scope for this audit.

---

## D. Recommendations (read-only audit; no code changes)

### D.1 P1 -- Wire cleanup invocation for Mod Chat panel close

Add cleanup invocation in `closePanel()`:

```js
function closePanel(){
  if (!STATE.panelEl) return;
  STATE.panelEl.classList.remove('gam-mc-open');
  try { if (typeof STATE._focusTrapCleanup === 'function') STATE._focusTrapCleanup(); } catch(_){}
  // Note: STATE._focusTrapCleanup is a one-shot closure. Setting to null prevents
  // double-invocation if closePanel is called again before next openPanel.
  STATE._focusTrapCleanup = null;
  stopAllPolling();
  startClosedPolling();
}
```

Caveat: panel reuse (L17223-24) means re-opening after close will NOT re-install the trap (`STATE.panelEl` guard short-circuits buildPanel). To make this clean: either (a) install the trap in `openPanel` after `requestAnimationFrame(()=> panel.classList.add('gam-mc-open'))`, OR (b) move trap install out of `buildPanel` entirely. Net effort: ~5 lines.

**Cost/value:** P1 -- focus-restore-to-opener is the standard a11y deliverable; without it, keyboard mods lose orientation after Esc.

### D.2 P1 -- Wire cleanup invocation for Hot-Now close

Add cleanup invocation in `_closeHotNowPanel()`:

```js
function _closeHotNowPanel() {
  const hnPanel = document.getElementById('gam-hot-now-panel');
  if (!hnPanel) return;
  try { if (typeof hnPanel._gamHnFocusTrapCleanup === 'function') hnPanel._gamHnFocusTrapCleanup(); } catch(_){}
  hnPanel.classList.remove('gam-hn-open');
  setTimeout(function() { if (hnPanel.parentNode) hnPanel.remove(); }, 180);
  panelOpen = null;
}
```

`cleanup()` should run BEFORE the 180ms setTimeout to avoid a window where focus has restored but the panel is visually still sliding out. ~2 lines.

### D.3 P1 -- Wire cleanup invocation for Modmail ESC and toggle-already-open paths

Three close paths exist; two skip cleanup:

```js
// Toggle-when-already-open path L17654-55
const existing = document.getElementById('gam-modmail-panel');
if (existing) {
  try { if (typeof existing._gamMmpFocusTrapCleanup === 'function') existing._gamMmpFocusTrapCleanup(); } catch(_){}
  existing.remove();
  return;
}

// ESC handler L17732-37
document.addEventListener('keydown', function escHandler(ev) {
  if (ev.key === 'Escape') {
    document.removeEventListener('keydown', escHandler);
    if (panel.parentNode) {
      try { if (typeof panel._gamMmpFocusTrapCleanup === 'function') panel._gamMmpFocusTrapCleanup(); } catch(_){}
      panel.remove();
    }
  }
});
```

ESC is the dominant close path (advertised in the close button title). Without this fix, the most-used dismiss path is the one that fails to restore focus. ~4 lines total.

### D.4 P2 -- Document the uxPolish flag dependency in CHANGELOG or release notes

v10.15.1 and v10.15.3 acceptance criteria claim "focus trap installed" without disclosing that the trap is gated on `features.uxPolish === true`. Two paths forward:

1. **Document the dependency.** Add a line to v10.15.x CHANGELOG entries: "Focus traps active only when `features.uxPolish` is enabled in Settings."
2. **Remove the gating.** Have `installFocusTrap` install regardless of uxPolish (rationale: focus trap is a baseline a11y feature, not 'polish'). The v8.1 gating was for visual polish; trap was bundled by coincidence. Decoupling is ~2 lines (remove `!__uxOn() ||` from L4186).

**Cost/value:** option 2 is the right move per "lead don't accommodate" -- focus traps SHOULD be default-on. The gating made sense pre-v10.15.1 when only Mod Console / Intel Drawer / askText / Park had traps and those surfaces were also part of the polish bundle. Now that 4 more critical surfaces have traps, the gating is a hidden a11y regression for default-config operators.

### D.5 P2 -- Modmail panel toggle path should `togglePanel` properly

L17654-55 conflates "open" and "close" -- if the panel is already open, the function removes it and returns. This is a hidden toggle semantic. A keyboard user who hits Enter on the modmail trigger button while the panel is already open will close it but won't see any animated dismiss (just an abrupt `.remove()`). Consider routing the close path through a proper close function that also runs cleanup + animation. Out of scope for QA but worth flagging.

---

## E. Hunt-List Resolution

The brief enumerated 6 concerns. Verdicts:

1. "Does `installFocusTrap` actually return a disposer? If undefined and we store undefined -> cleanup is a no-op (acceptable but verify intent)."
   **VERIFIED:** Always returns a callable. `function(){}` when gated off; real `cleanup` when on. Storing the result is safe; calling it is a no-op when gated off and a real cleanup when on.

2. "Mod Chat panel: does panel ever close via path OTHER than the close button? If so, cleanup might not run, listener leaks."
   **VERIFIED:** Cleanup never runs from ANY close path. Panel is reused (not removed), so listener doesn't leak via DOM detach -- but stays bound across open/close cycles. Single listener, no stack-up. Focus-restore lost. See B.2 + B.7.

3. "Hot-Now: panel is reused (`document.getElementById('gam-hot-now-panel')` lookup before creation). Subsequent opens get the same panel -- does the listener stack up?"
   **VERIFIED FALSE PREMISE:** Panel IS removed on close (L11565 `setTimeout(..., 180)`). Re-open finds no existing element -> new panel -> new trap. No stack-up. See B.3 + B.8.

4. "Preflight: backdrop click also calls `finish(false)` -- does cleanup run? Verify by reading the backdrop click handler."
   **VERIFIED:** Backdrop click at L2196 calls `finish(false)`. `finish()` invokes cleanup at L2191 before `wrap.remove()` at L2192. **All 5 close paths (Yes/No/ESC/backdrop/ctrl-enter-auto) correctly invoke cleanup.** See B.4.

5. "Modmail panel: panel.style.transform animation -- does focus trap conflict with the requestAnimationFrame? Initial focus might land before the panel is visible."
   **VERIFIED:** Microtask-queued focus shift runs BEFORE next paint. Focus lands on an in-DOM, focusable but visually-not-yet-translated element. **Not a regression** -- standard SPA behavior. Mild visual flicker possible (focus ring on offscreen element for one frame). See B.9.

6. "`installFocusTrap` helper itself (modtools.js:4169): does it gate on `__uxOn()`? If __uxOn returns false in some scenarios, all 4 traps no-op."
   **VERIFIED, MAJOR FINDING:** Yes, gated. `features.uxPolish` defaults to FALSE. All 4 traps no-op for default-config users. Aria attrs survive (set outside the try block); Tab cycle + focus-into + focus-restore are dead. See B.1 + D.4.

---

## F. Net Verdict

v10.15.1 and v10.15.3 ship correctly-wired aria semantics on all 4 surfaces and install code on all 4 traps. **Three of the four (Mod Chat, Hot-Now, Modmail ESC/toggle paths) silently leak the focus-restore-to-opener** because the stored cleanup closure is never invoked on close. **One (Preflight) is exemplary -- single funnel `finish()` runs cleanup before remove on every close path.**

The hidden gating on `features.uxPolish=true` makes the trap behavior conditional in a way the acceptance criteria did not call out -- this is the largest unstated assumption. Default-config operators get aria semantics but no Tab containment.

**Net keyboard a11y improvement vs pre-v10.15.1 baseline (4 surfaces with zero traps each):** real, substantial, and worth shipping. **Outstanding polish:** 3 P1 cleanup-invocation fixes (~10 lines total) and 1 P2 gating decision (~2 lines + CHANGELOG note).

No code modified in this audit.
