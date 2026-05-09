# UIUX-02 — Intel Drawer Audit
**Auditor:** UIUX-02-INTEL-DRAWER
**Generated:** 2026-05-09
**Scope:** modtools.js Intel Drawer subsystem (mount, position, close, ESC, backdrop, hover-vs-click modes, orphan sweep)

---

## A. P0 — Drawer chases cursor (Commander reported: "can't close")

### Root cause: hover tooltip fires on page elements BEHIND the open drawer

**What Commander sees:**
When the Intel Drawer is open, moving the mouse toward the X close button (top-right of the drawer) crosses over `.details a[href^="/u/"]` author links in the page content visible through the semi-transparent backdrop. The tooltip (`#gam-tooltip`) re-anchors to each of those links via `positionTooltip()`, jumping to new positions on screen. The tooltip itself appears in the left portion of the viewport (since the drawer occupies the right side) and is what Commander is tracking as "the panel chasing him."

**The drawer itself is `position:fixed; top:0; right:0` and never moves.** The _tooltip_ moves, and because it has `pointer-events:auto`, it intercepts attempts to click through the page area toward the drawer.

**Exact file:line of the missing guard:**

```
modtools.js:11013  document.addEventListener('mouseover', e=>{
modtools.js:11014    const al = e.target.closest(SELECTORS.authorLink);
modtools.js:11015    if (!al) return;
```

There is NO `IntelDrawer.isOpen()` check before line 11015. Every author link in the page — including those visible through the semi-transparent backdrop while the drawer is open — triggers `renderTooltipBasic()` and `positionTooltip(al)`, making the tooltip jump to that link's viewport position.

Compare: the right-click context menu handler (line 10306) and the click-to-open-drawer handler (line 6542) both have explicit `#gam-intel-drawer` guards. The hover tooltip handler does not.

**Secondary amplifier:** the `mouseout` handler (line 11049) also has no guard. When the mouse leaves an author link while the drawer is open, `_scheduleDismiss(200)` fires. The tooltip briefly disappears, then the next author link hover re-shows it. This creates the "bouncing" chase effect.

**Tertiary amplifier:** `IntelDrawer.open()` (lines 5423-5487) does NOT call `hideTooltip()` or `unpinTooltip()`. If a tooltip is pinned when the drawer opens, it remains pinned and visible (though behind the backdrop z-index-wise). Its `pointer-events:auto` still intercepts mouse events in the non-drawer area.

**Fix (one line, two locations):**

```javascript
// modtools.js:11013 — mouseover tooltip handler
document.addEventListener('mouseover', e=>{
+   if (typeof IntelDrawer !== 'undefined' && IntelDrawer.isOpen()) return; // UIUX-02 fix
    const al = e.target.closest(SELECTORS.authorLink);
    if (!al) return;
```

```javascript
// modtools.js:11049 — mouseout dismiss handler
document.addEventListener('mouseout', e=>{
+   if (typeof IntelDrawer !== 'undefined' && IntelDrawer.isOpen()) return; // UIUX-02 fix
    if (tooltipPinned) return;
```

Additionally, `IntelDrawer.open()` should hide/unpin any active tooltip immediately:

```javascript
// modtools.js:5437 — inside open(), after _mount() call
    _mount();
+   try { if (typeof hideTooltip === 'function') { unpinTooltip(); hideTooltip(); } } catch(_){} // UIUX-02
```

---

## B. P0 — Orphan sweep incorrectly kills the backdrop (and ESC handler) while the drawer is open

### Root cause: class-name mismatch in `_gamOrphanBackdropSweep`

**File:line:** `modtools.js:6929`

```javascript
const liveModal = document.querySelector(
  '.gam-modal, #gam-mc-panel.gam-modal-open, #gam-intel-drawer.gam-intel-open'
//                                                               ^^^^^^^^^^^^^^^^
//                                  WRONG: actual open class is 'gam-intel-drawer--open'
);
```

The class added when the drawer opens (line 5472) is `gam-intel-drawer--open`. The orphan sweep checks for `gam-intel-open` (missing the `drawer--` infix). Result: `liveModal` is `null` whenever the drawer is open, so the sweep treats the `#gam-intel-backdrop` as orphaned and removes it.

**Consequences (within 30 seconds of opening the drawer):**
1. Backdrop DOM element removed from page
2. Backdrop click-to-close no longer works
3. The AF-27 ESC handler removal code at lines 6893-6906 fires: `_ids._escHandler` is set to null and `_ids._escBound = false`. ESC no longer closes the drawer.
4. The `state.open` flag remains `true` but `state.backdropEl` now references a detached node. A second `IntelDrawer.open()` call cannot re-mount (since `state.mounted` is still `true`) but `close()` calls `state.backdropEl.classList.remove(...)` on the detached node — silent but the visual backdrop never reappears.

**Fix:**

```javascript
// modtools.js:6929
const liveModal = document.querySelector(
- '.gam-modal, #gam-mc-panel.gam-modal-open, #gam-intel-drawer.gam-intel-open'
+ '.gam-modal, #gam-mc-panel.gam-modal-open, #gam-intel-drawer.gam-intel-drawer--open'
);
```

---

## C. P0 — Other close paths

### C.1 X close button — works correctly
- `state.closeBtnEl` is created at line 5362 with `addEventListener('click', () => close())`.
- It is inside `#gam-intel-drawer` which has z-index 2147483600, above all other elements.
- The button itself is clickable; pointer events are not blocked.
- **BUT**: the orphan sweep (Bug B) removing the ESC handler does not affect the X button — the X button's click handler is wired directly to the DOM element and survives. So the X IS clickable even after the sweep, as long as the mouse can reach it without being intercepted by the jumping tooltip (Bug A).

**Interaction of A+B:** Bug A makes the tooltip bounce around as the mouse moves toward X. The tooltip is at z-index 9999998, the drawer at 2147483600 (higher). The tooltip is visually behind the drawer/backdrop so it cannot cover the X button. However, the tooltip has `pointer-events:auto` and appears in the non-drawer area (left side of screen), potentially intercepting clicks on the backdrop that would close the drawer while it's still working (before Bug B removes it).

### C.2 ESC — broken after orphan sweep (Bug B)
The ESC handler installed at line 5407 works correctly on initial open. After the orphan sweep fires (within 30s), the handler is removed. Post-sweep, ESC does not close the drawer.

The AF-27 fix (line 5387-5409) correctly uses `state._escBound` to prevent double-installation on re-mount. However, the orphan sweep sets `_ids._escBound = false` after removing the handler. If `_mount()` were called again, it would re-install the handler. But `state.mounted` is still `true` so `_mount()` returns early on line 5353. Net result: ESC broken, handler not recoverable without a page reload.

### C.3 Backdrop click — broken after orphan sweep (Bug B)
`state.backdropEl.addEventListener('click', () => close())` is wired at line 5356. After the sweep removes the backdrop from DOM, there is no element to click. Clicking the non-drawer area after the sweep has no effect — the backdrop click-to-close is gone.

### C.4 Backspace stack navigation — correct
Lines 5396-5404: Backspace pops the subject stack when `state._stack.length > 1`. Guard for input elements is present. Not broken.

### C.5 Focus restoration on close — correct
Line 5505: `state._lastTrigger.focus()` restores focus to the triggering element on close. Correct.

---

## D. P1 — Friction items

### D.1 IntelDrawer tabs vs Mod Console tabs — architecture clarification
The brief references "INTEL / BAN / NOTE / MESSAGE / QUICK" tabs. These tabs are in the **Mod Console** (`#gam-mc-panel`, line 7611+), NOT in the IntelDrawer. The IntelDrawer uses 6 numbered section blocks rendered as `<section data-section="N">` with `<h3>` titles: "What this is", "Why it matters", "What changed", "What the team knows", "What ModTools recommends", "What happened last time." A 7th Activity section and 8th Lookalikes section are also rendered for User kind.

No tab leakage bug exists in the IntelDrawer because it has no tabs. The UIUX-01 tab leakage bug (likely about Mod Console popup tabs) is a separate issue in `gam-mc-tab` logic.

### D.2 Drawer-vs-hover-card mode confusion
The IntelDrawer is a distinct component from the hover tooltip (`#gam-tooltip`). They share the same data source (profile intel) but are separate DOM elements with separate lifecycles. There is no "drawer mode" vs "hover-card mode" in the same component — no shared render function, no mode switch. The hover tooltip uses `renderTooltip()` / `renderTooltipBasic()`. The IntelDrawer uses `buildUserSections()` via the adapter registry.

This is good architecture, but Bug A (tooltip not suppressed when drawer opens) makes them appear to conflict.

### D.3 Note textarea — no auto-save on blur
`sec4()` (lines 6127-6151) mounts a textarea with a "Save note" button. There is no `blur` event handler on the textarea — save is manual only. If the mod types a note and clicks away (e.g. clicks a section button) without clicking Save, the note is lost. This is friction.

Proposed: add `ta.addEventListener('blur', () => { if ((ta.value||'').trim()) saveBtn.click(); })`.

The save button correctly disables during save, shows "Saving…", snacks success/failure. Save feedback is present and correct.

### D.4 AI "Generate recommendation" — no explicit no-token hint
Section 5 button ("Generate recommendation") calls `rpcCall('modAiNextBestAction', ...)`. If there is no mod token, `rpcCall` will 401 or return `{ok:false}`. The error path at line 5913 renders `el('em', {cls:'gam-muted'}, 'AI unavailable')` — same message as a real AI failure. There is no "no token" vs "AI down" distinction. Low friction issue but adds diagnostic confusion.

### D.5 "Hovering hint" — in Mod Console INTEL tab, not IntelDrawer
The `💡 Hovering any username anywhere on GAW now shows this same intel instantly.` hint at line 7696 is in the Mod Console INTEL tab (`renderIntelTab`), not the IntelDrawer. It is static HTML, always visible when the tab is open, not dismissable. It is technically accurate (the hover tooltip does work site-wide). No action needed in IntelDrawer scope; this is a Mod Console P2 cleanup.

### D.6 Backdrop coverage — gap after orphan sweep
When the drawer first opens: backdrop covers full screen (`inset:0`), `pointer-events:auto`. Clicking outside the drawer closes it. Correct.
After orphan sweep (~30s): backdrop removed, no coverage. Clicking outside the drawer does nothing. Already covered in B above.

### D.7 Width on narrow viewports
`width:min(480px, 40vw)` — on a 1000px viewport, drawer is 400px (40% of screen). On a 800px viewport, 320px. No `@media` breakpoints. At very narrow viewports (< 600px), the drawer at `min(480px, 40vw)` = 240px, covering 40% of a 600px screen. The `95vw` cap on Mod Console panel is absent for the IntelDrawer. On mobile-width viewports the drawer is usable but cramped with no `max-width:95vw` safety.

Proposed: change to `width:min(480px, max(280px, 40vw))` or add `max-width:95vw` after `width`.

---

## E. P2 — Polish items

### E.1 Scrollbar styling gap in drawer body
`.gam-drawer-body { flex:1; overflow-y:auto; }` at line 17899 has no custom scrollbar. Other panels use `scrollbar-width:thin; scrollbar-color:${C.BORDER2} transparent` (e.g. `.gam-hn-body` at line 17946). Drawer body scrollbar will render in OS default style (white/grey on dark background).

Proposed:
```css
.gam-drawer-body { flex:1; overflow-y:auto; scrollbar-width:thin; scrollbar-color:${C.BORDER2} transparent; }
```

### E.2 Animation on open/close
Drawer uses `transition:transform .18s ease-out` (line 17890). The backdrop uses `transition:opacity .18s` (line 17892). Both use the same duration and easing. No jank observed in CSS; animation is appropriate.

One minor issue: drawer transition fires on initial page load (`transform:translateX(100%)` is the default hidden state). If the drawer was previously open and the page reloads (SPA nav), the `.gam-intel-drawer--open` class could persist in DOM briefly during SPA nav before `closeAllPanels` runs — not confirmed but worth auditing on SPA nav paths.

### E.3 LOCAL MOD HISTORY empty state
In the Mod Console INTEL tab (line 7676-7678), the history container `#gam-mc-intel-hist` is populated dynamically. If empty: the empty state message is set by the caller (not shown in this scope — P2 flag for separate audit). In the IntelDrawer `sec4()` (line 6119), empty notes show `el('em', {cls:'gam-muted'}, 'No team notes yet.')` — correct and clear.

### E.4 "No recent comments" messaging in Mod Console INTEL tab
Not visible in IntelDrawer scope. The IntelDrawer activity section (sec7) at line 6259 shows `'No activity in last 30 days.'` when empty — clear and accurate.

### E.5 "Analyze Comments" button label
`🧠 Analyze comments` (line 7686, Mod Console INTEL tab). After intel loads, it updates to `🧠 Analyze comments (N)` with comment count (line 7958). This is in the Mod Console, not the IntelDrawer. The IntelDrawer NBA button is `Generate recommendation` (line 5879) — generic but acceptable.

### E.6 Color/contrast on disabled states
NBA gen button `genBtn.disabled = true` (line 5886) shows browser-native disabled styling. No custom disabled appearance defined in CSS. Could add `.gam-nba-gen:disabled { opacity:.4; cursor:not-allowed; }`.

### E.7 Tab order inside drawer
Per v8.1 audit comments (lines 5285-5290), tab order is: Close (X) → Section action buttons. The `_getFocusables()` function (line 5416) uses a standard tabbable-elements query. Tab order follows DOM order within the drawer. The close button being in the header (first in DOM) means Tab from outside the drawer → close button first. This is correct for a modal dialog.

---

## F. Proposed v10.7 patches (consolidated)

### Patch 1 — CRITICAL: Suppress hover tooltip when drawer is open (P0-A)
**Files:** modtools.js, lines 11013 and 11049 and 5437

```javascript
// Line 11013 — add guard at top of mouseover handler
document.addEventListener('mouseover', e=>{
+   if (typeof IntelDrawer !== 'undefined' && IntelDrawer.isOpen()) return;
    const al = e.target.closest(SELECTORS.authorLink);
```

```javascript
// Line 11049 — add guard at top of mouseout handler
document.addEventListener('mouseout', e=>{
+   if (typeof IntelDrawer !== 'undefined' && IntelDrawer.isOpen()) return;
    if (tooltipPinned) return;
```

```javascript
// Line 5437 (inside IntelDrawer.open(), after _mount()) — clear any live tooltip
    _mount();
+   try { if (typeof unpinTooltip === 'function') unpinTooltip(); else if (typeof hideTooltip === 'function') hideTooltip(); } catch(_){}
```

### Patch 2 — CRITICAL: Fix orphan sweep class-name mismatch (P0-B)
**File:** modtools.js, line 6929

```javascript
// Before:
  const liveModal = document.querySelector('.gam-modal, #gam-mc-panel.gam-modal-open, #gam-intel-drawer.gam-intel-open');
// After:
  const liveModal = document.querySelector('.gam-modal, #gam-mc-panel.gam-modal-open, #gam-intel-drawer.gam-intel-drawer--open');
```

### Patch 3 — HIGH: Add note textarea auto-save on blur (P1-D.3)
**File:** modtools.js, near line 6129

```javascript
  const ta = el('textarea', {placeholder: 'Add a team note…'});
  const saveBtn = el('button', {cls: 'gam-nba-action-alt'}, 'Save note');
+ ta.addEventListener('blur', () => { if ((ta.value||'').trim()) saveBtn.click(); });
```

### Patch 4 — MEDIUM: Add scrollbar styling to drawer body (P2-E.1)
**File:** modtools.js, line 17899

```css
/* Before: */
.gam-drawer-body { flex:1; overflow-y:auto; }
/* After: */
.gam-drawer-body { flex:1; overflow-y:auto; scrollbar-width:thin; scrollbar-color:${C.BORDER2} transparent; }
```

### Patch 5 — LOW: Add narrow-viewport safety to drawer width (P1-D.7)
**File:** modtools.js, line 17890

```css
/* Before: */
#gam-intel-drawer { ... width:min(480px, 40vw); ... }
/* After: */
#gam-intel-drawer { ... width:min(480px, max(280px, 40vw)); max-width:95vw; ... }
```

### Patch 6 — LOW: Disabled button style for NBA gen button (P2-E.6)
**File:** modtools.js, near line 17908

```css
.gam-nba-gen:disabled { opacity:.4; cursor:not-allowed; }
```

---

## G. Drawer state machine map

```
                       [User clicks/hovers username]
                                 |
                     feature flag: features.drawer?
                    /                             \
                 OFF                              ON
                  |                               |
          opts.fallback()                    _mount() [once]
          (open Mod Console)                      |
                                         state.mounted = true
                                    backdropEl, rootEl in DOM
                                    _escHandler installed once
                                         state._escBound = true
                                                 |
                                         open(opts) called
                                                 |
                          +----- drawer already open? ------+
                          |YES                              |NO
                  push current to _stack           _lastTrigger = activeElement
                          |                                 |
                          +----------> state.open = true ---+
                                       add class: gam-intel-drawer--open
                                       add class: gam-intel-backdrop--open
                                       _renderSections(opts)
                                       focus first focusable (30ms delay)
                                                 |
                                    [DRAWER IS OPEN - stable state]
                                   /              |              \
                          Click X button    Press ESC       Click backdrop
                             |               |   (if _escBound)    |
                           close()         close()             close()
                             |               |                    |
                    remove: gam-intel-drawer--open
                    remove: gam-intel-backdrop--open
                    state.open = false
                    _stack = []
                    restore focus to _lastTrigger
                             |
                    [DRAWER CLOSED - stable state]

 --- BUG B CORRUPTION PATH (fires within 30s of open) ---

                    [DRAWER IS OPEN]
                           |
                   _gamOrphanBackdropSweep() fires (every 30s)
                           |
                   liveModal check: queries '#gam-intel-drawer.gam-intel-open'
                           |
                   MISS (class is gam-intel-drawer--open, not gam-intel-open)
                           |
                   liveModal = null -> treats backdrop as orphaned
                           |
                   #gam-intel-backdrop.remove()    <- backdrop gone
                   _ids._escHandler removed         <- ESC broken
                   _ids._escBound = false
                           |
                    [CORRUPTED STATE: drawer visible, state.open=true,
                     no backdrop, no ESC, only X button works]

 --- BUG A CORRUPTION PATH (fires on any mouse movement over page links) ---

                    [DRAWER IS OPEN]
                           |
                   user moves mouse toward X button
                           |
                   mouse crosses .details a[href^="/u/"] in page content
                           |
                   document mouseover fires (line 11013)
                   NO IntelDrawer.isOpen() guard
                           |
                   positionTooltip(al) called
                   #gam-tooltip repositions to that link's location
                           |
                   tooltip jumps around visible page area (left of drawer)
                           |
                   [VISUAL CHAOS: tooltip appears to chase cursor]
```

---

## H. Summary table

| ID | Priority | Description | File:Line | Status |
|----|----------|-------------|-----------|--------|
| P0-A | CRITICAL | Hover tooltip has no `IntelDrawer.isOpen()` guard — fires on page links visible through backdrop, causes tooltip to chase cursor | 11013, 11049, 5437 | NOT FIXED |
| P0-B | CRITICAL | Orphan sweep uses wrong class `gam-intel-open` (actual: `gam-intel-drawer--open`) — removes backdrop and ESC handler within 30s of drawer opening | 6929 | NOT FIXED |
| P1-C.2 | HIGH | ESC broken after orphan sweep removes handler | 5407, 6898-6902 | Fixed by P0-B patch |
| P1-C.3 | HIGH | Backdrop click-to-close broken after orphan sweep | 5356, 6907 | Fixed by P0-B patch |
| P1-D.3 | MEDIUM | Note textarea has no blur auto-save — note lost if mod clicks away | 6129 | NOT FIXED |
| P1-D.4 | LOW | AI "Generate recommendation" shows generic "AI unavailable" for both no-token and real failures | 5913 | NOT FIXED |
| P1-D.7 | LOW | No `max-width:95vw` safety on narrow viewports | 17890 | NOT FIXED |
| P2-E.1 | LOW | Drawer body missing custom scrollbar styling | 17899 | NOT FIXED |
| P2-E.6 | LOW | NBA gen button has no custom disabled style | ~17908 | NOT FIXED |
