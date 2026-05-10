# UIUX-20 — Accessibility Audit (v10.x)

**Status:** Read-only audit. Remediation estimates included per section.
**WCAG target:** 2.2 AA.
**Surfaces covered:** popup (popup.html / popup.css / popup.js), content script
status bar and all popovers/drawers/modals (modtools.js), inline CSS injected
via GAM\_CSS.

---

## A. ARIA Inventory

### What has correct labels

| Element | File | Attribute | Notes |
|---|---|---|---|
| Tab nav `<nav>` | popup.html:36 | `role="tablist" aria-label="ModTools navigation"` | Correct. |
| Tab buttons x5 | popup.html:37-42 | `role="tab" aria-selected="true/false"` | `aria-selected` is also updated dynamically in popup.js:2867 on tab switch. |
| Chevron decorations | popup.html:141,165,300,339,402,642 | `aria-hidden="true"` | Correct. |
| `<label for="tokenInput">` | popup.html:346 | Explicit `for` | Correct. |
| `<label for="leadInput">` | popup.html:413 | Explicit `for` | Correct. |
| `<label for="flagTtlInput">` | popup.html:450 | Explicit `for` | Correct. |
| `<label for="bugVisInput">` | popup.html:471 | Explicit `for` | Correct. |
| Status bar buttons (M11) | modtools.js:17772-17938 | `aria-label=` on all 16 gam-bar-icon buttons | Added in v10.8.0 M11. Covers: sessDot, fbBtn, drBtn, sirenBtn, sirenClearBtn, mmBtn, c5Btn, brandBtn, gearBtn, tickerEl, and further buttons injected by the same pass. |
| Intel drawer | modtools.js:5385 | `role="dialog" aria-modal="true"` on `<aside id="gam-intel-drawer">` | Correct. |
| Mod Console panel | modtools.js:15896 | `role="dialog" aria-label="Mod Chat"` | Present. |
| Ban button (per row) | modtools.js:12276 | `aria-label="Ban {username}"` | Correct. |
| Unban button (per row) | modtools.js:12220 | `aria-label="Unban {username} and archive thread"` | Correct. |
| Search combobox | modtools.js:5029-5042 | `aria-haspopup="listbox" aria-expanded aria-controls aria-autocomplete aria-label aria-activedescendant` | Full pattern. |
| Live regions (polite + assertive) | modtools.js:3992-4009 | `aria-live aria-atomic` | Mounted on boot when ux flag on. |
| Ticker element | modtools.js:17954 | `aria-live="polite"` | Present, but see gap below. |
| Bug report modal body | modtools.js:1288 | `role="region" aria-label="Bug report form"` | Flag-gated on `__uxOn()`. |
| Bug char counter | modtools.js:1311 | `role="status" aria-live="polite"` | Flag-gated. |
| askTextModal (modtools) | modtools.js:2665 | `role="dialog" aria-modal="true"` | Flag-gated. |
| Park modal (modtools) | modtools.js:3523 | `role="dialog" aria-modal="true" aria-label="Park for senior review"` | Flag-gated. |
| Context menu separator | modtools.js:10574 | `role="separator"` | Correct. |
| Safe Mode toggle | popup.html:185 | `<label>` wraps `<input type="checkbox">` | Implicit label association. Missing explicit `for`/`id` pair -- see gap below. |
| Skeleton loader | modtools.js:4150 | `aria-busy="true" aria-live="off"` | Correct. |

### Gaps — missing or wrong ARIA

| Element | Location | Gap | Severity |
|---|---|---|---|
| Stat cards (7x `.pop-stat[data-drill]`) | popup.html:48-76 | Interactive `<div>` elements with click handlers. No `role`, no `aria-label`, no `tabindex`. Keyboard and screen reader unreachable. | **High** |
| KPI tiles (4x `.gam-kpi-tile`) | popup.html:560-583 | Same as stat cards. `cursor:pointer` set but no semantic role. | **High** |
| Drill-down drawer `#pop-drill` | popup.html:85-95 | No `role="dialog"`, no `aria-modal`, no `aria-label`, no focus management on open/close. | **High** |
| Drill-down close button `#pop-drill-close` | popup.html:88 | Has `title="Close (Esc)"` but no `aria-label`. `&times;` glyph is screen-reader noisy. | **Medium** |
| Popup modals (`__popupAskText`, `__popupConfirm`) | popup.js:786-911 | Panel `div` has no `role="dialog"`, no `aria-modal`, no `aria-labelledby`. Focus IS moved to input/okBtn but the container has no semantic dialog role. | **High** |
| Tab panel content areas (`data-tab="stats"` etc.) | popup.html, popup.js | No `role="tabpanel"`, no `aria-labelledby` pointing to the controlling tab button. The ARIA tab widget is incomplete without tabpanel wiring. | **High** |
| Arrow-key navigation on tabs | popup.js:2872-2873 | Only click events on tabs. ARIA authoring practices require `ArrowLeft`/`ArrowRight` to move focus between tabs (roving tabindex). Current: each tab is independently focusable with Tab key -- acceptable fallback but non-conformant. | **Medium** |
| Macro edit form inputs | popup.html:324-325 | `#macroEditLabel` and `#macroEditBody` have placeholder text but no `<label>` element. Placeholder is not a label substitute. | **High** |
| `maintAutoToggle` select | popup.html:523-526 | `<label for="maintAutoToggle">` is present (popup.html:520) but the `id="maintAutoToggle"` is on the `<select>` -- linking is correct. However the label text ("Auto-run weekly + LLM analysis") is not explicitly connected via `for=` in code -- the label wraps the select in a flex row but does NOT have `for=` set. | **Medium** |
| `lapsedThresholdInput` | popup.html:609 | `<label>` is a sibling `<label>` element but has no `for` attribute. | **Medium** |
| `filterSel` (status bar) | modtools.js:17808 | `<select>` has `title=` but no `aria-label`. Screen readers may read the option text only. | **Medium** |
| `gam-bar-tier-badge` | modtools.js:17927 | `<span>` "L" badge on brand button is purely visual with `pointer-events:none` but no `aria-hidden`. It will be read by SR as "shield L" or similar. | **Low** |
| `safeModeToggle` | popup.html:186 | `id="safeModeToggle"` on the checkbox but the label (`id="safeModeToggleLabel"`) does not have `for="safeModeToggle"`. The wrapping `<label>` click-activates correctly but the explicit link is missing, which can confuse some SR+browser combos. | **Low** |
| `maintWarningChip` | popup.html:30 | Has `title=` for tooltip but no `aria-label`. The chip is rendered as a `<span>` with no role, making it invisible to screen readers as an alert. | **Low** |
| `lapsedModsCard` LAPSED heading | popup.html:603 | Heading-like text ("LAPSED N") in a `<span>` with no heading role or landmark. | **Low** |
| `firstRunWizard` | popup.html:365-396 | No `role="dialog"`, no `aria-modal`, no step announce. The step headings use inline `<div>` not `<h2>`. | **Medium** |

---

## B. Keyboard Navigation Matrix

Every interactive element in the popup. "Reachable" = can receive focus via Tab key. "Operable" = action can be triggered by keyboard alone.

| Element | Reachable | Operable | Method | Gap |
|---|---|---|---|---|
| Tab nav buttons (Stats / Tokens / Tools / Lead / Diag) | Yes | Yes | Tab to focus, Enter/Space activate | Arrow keys not wired (ARIA authoring gap) |
| Stat cards (7x, `.pop-stat[data-drill]`) | **No** | **No** | None | `tabindex` and `role="button"` missing |
| 4x quick-action links (Users, Queue, Ban, GAW) | Yes | Yes | Tab, Enter | -- |
| Debug snapshot btn, Dashboard btn | Yes | Yes | Tab, Enter | -- |
| Crawl buttons (3x) | Yes | Yes | Tab, Enter | -- |
| Safe Mode toggle | Yes | Yes | Tab, Space | Implicit label association; works |
| Feature Health row | Yes (when visible) | Yes | Tab, Enter on Re-enable buttons | -- |
| All Maintenance buttons (11x) | Yes | Yes | Tab, Enter | -- |
| Macro tab buttons (Ban messages / Modmail replies) | Yes | Yes | Tab, Enter | No role="tab" on these subtabs |
| Macro list rows | Yes (if rendered with tabindex) | Partial | Depends on runtime DOM | No audit of rendered macro row tabindex |
| Macro edit inputs | Yes | Yes | Tab to input, type | Missing `<label>` |
| Add custom / Generate with AI btns | Yes | Yes | Tab, Enter | -- |
| Token inputs (teamToken, leadToken) | Yes | Yes | Tab to input, Enter submits | Enter wired on popup.js:1148,1546 |
| Token Save buttons | Yes | Yes | Tab, Enter | -- |
| Rotate / ClaimRotate btns | Yes | Yes | Tab, Enter | -- |
| First-run wizard step buttons | Yes | Yes | Tab, Enter | No dialog role; no aria-live step announce |
| First-run "Done" button | Yes | Yes | Tab, Enter | -- |
| Lead KPI tiles (4x) | **No** | **No** | None | Same gap as stat cards |
| Lead quick-action buttons (Invite, Rotate all, Bugs, Chat) | Yes | Yes | Tab, Enter | -- |
| flagTtlInput + flagTtlSave | Yes | Yes | Tab, Enter wired | -- |
| bugListBtn | Yes | Yes | Tab, Enter | -- |
| bugVisInput + bugVisSave | Yes | Yes | Tab, Enter | -- |
| Lead maintenance buttons (4x) | Yes | Yes | Tab, Enter | -- |
| maintAutoToggle select + maintAutoSave | Yes | Yes | Tab, Enter | Label `for` gap |
| claimInviteBtn, restartSetupBtn | Yes | Yes | Tab, Enter | -- |
| Drill-down drawer: title, body | **No** | **No** | None | No focus management on open |
| Drill-down close X | Yes | Yes | Tab (in document order after drawer shows), Enter | Focus not moved to drawer on open |
| Drill-down CSV export btn | Yes | Yes | Tab, Enter | -- |
| Diag tab: all buttons | Yes | Yes | Tab, Enter | -- |
| Footer: Export log, Import, Factory reset | Yes | Yes | Tab, Enter | -- |
| Status bar buttons (16x gam-bar-icon) | Yes | Yes | Tab, Enter | -- |
| filterSel (status bar select) | Yes | Yes | Tab, arrow keys | No aria-label |
| Popups (__popupAskText, __popupConfirm) | Yes (tab reaches input/buttons) | Yes | Tab, Esc, Enter | No role="dialog"; no aria-labelledby |
| Intel drawer close btn | Yes | Yes | Tab (trapped), Enter | Focus trap present |
| Ban/Unban buttons in rows | Yes | Yes | Tab, Enter | -- |
| Search combobox | Yes | Yes | Full arrow + Enter pattern | Well-implemented |

**Summary of keyboard-unreachable interactive elements:**
- 7 stat cards
- 4 KPI tiles
- Drill-down drawer (receives no focus on open, user must manually Tab to the close button)

---

## C. Focus Management in Popovers and Drawers

### What is correctly implemented

**modtools.js `installFocusTrap` (v8.1, lines 3948-3985):**
A reusable focus trap helper exists. It:
- Queries all focusable descendants filtering `aria-hidden` and `hidden`.
- Wraps Tab/Shift-Tab at the first/last item.
- Stashes `prevActive` and restores focus on `cleanup()` call.
- Auto-focuses the first item via `queueMicrotask`.

This is applied to: askTextModal (modtools), Park modal, Bug report modal -- all gated on `__uxOn()`.

**Popup modals (`__popupAskText`, `__popupConfirm`):**
Both move focus (`input.focus()` / `okBtn.focus()`) on open. Both restore nothing on close (backdrop.remove() called; prevActive never captured).

**Intel drawer (`gam-intel-drawer`):** Focus trap installed. Restore on close is handled.

### Gaps

| Surface | Gap | Severity |
|---|---|---|
| Drill-down drawer (`#pop-drill`) | `drawer.style.display = 'flex'` set in `renderDrillDown` but zero focus management. No focus move to drawer on open. No focus restore on `__closeDrillDown`. The Escape handler at popup.js:3827 calls `__closeDrillDown` but returns focus to no-one. | **High** |
| `__popupAskText` / `__popupConfirm` (popup.js) | Focus correctly moves INTO the modal. On close (`backdrop.remove()`), `document.activeElement` goes to `<body>`. Previously focused element never captured, never restored. | **Medium** |
| First-run wizard | No focus trap. Wizard is inline (not an overlay) so tab can escape to the rest of the popup. Not strictly an error but screen reader users lose spatial context. | **Low** |
| Macro edit form (`#macroEditWrap`) | `macroEditLabel.focus()` called on open (popup.js:3365). On cancel/close (popup.js:3370), focus goes to nowhere -- no restore to the button that triggered the edit. | **Low** |
| `__popupAskText` / `__popupConfirm` | No `role="dialog"`, no `aria-modal="true"`, no `aria-labelledby` pointing at the title div. Screen reader will not announce "dialog" context on entry. | **High** |
| Modals in modtools.js (flag-gated) | `installFocusTrap` only fires when `__uxOn()`. If the feature flag is off (default in some installs), full keyboard users lose the trap. The default value of `features.uxPolish` is not audited here but this is a configuration risk. | **Medium** |

### Required pattern (for any new surface)

```js
// On open:
const prevFocus = document.activeElement;
panel.setAttribute('role', 'dialog');
panel.setAttribute('aria-modal', 'true');
panel.setAttribute('aria-labelledby', titleEl.id);
installFocusTrap(panel); // or equivalent
firstFocusableChild.focus();

// On close:
panel.remove();
prevFocus?.focus();
```

---

## D. Contrast Ratios — Bloomberg Amber Palette

All values computed against WCAG 2.2 relative luminance formula. AA Normal requires >= 4.5:1. AA Large (18px+ or 14px bold) requires >= 3.0:1. AAA requires >= 7.0:1.

The extension uses two background layers: the BB iter (--bb-bg #0a0a0b, --bb-panel #131316) and the legacy layer (#0c0e12 / #181b20) which persists in pre-iter CSS blocks and some inline styles.

### Passing pairs (no action needed)

| Foreground | Background | Ratio | AA Normal | Notes |
|---|---|---|---|---|
| `--bb-amber` #ff9933 | `--bb-bg` #0a0a0b | 9.29 | PASS | Active tab indicator, stat values, KPI values |
| `--bb-amber` #ff9933 | `--bb-panel` #131316 | 8.70 | PASS | |
| `--bb-amber` #ff9933 | `--bb-sunken` #050507 | 9.56 | PASS | |
| `--bb-ink` #e8e6e1 | `--bb-bg` #0a0a0b | 15.87 | PASS | Primary body text |
| `--bb-ink` #e8e6e1 | `--bb-panel` #131316 | 14.87 | PASS | |
| `--bb-ink-dim` #9b9892 | `--bb-bg` #0a0a0b | 6.88 | PASS | Secondary text |
| `--bb-ink-dim` #9b9892 | `--bb-panel` #131316 | 6.45 | PASS | |
| `--bb-amber-dim` #cc7722 | `--bb-bg` #0a0a0b | 5.87 | PASS | Hover states |
| `--bb-green` #44dd66 | `--bb-bg` #0a0a0b | 11.10 | PASS | OK status |
| `--bb-red` #ff3b3b | `--bb-bg` #0a0a0b | 5.60 | PASS | Error status |
| `--bb-red` #ff3b3b | `--bb-panel` #131316 | 5.25 | PASS | |
| `--bb-cyan` #66ccff | `--bb-bg` #0a0a0b | 10.97 | PASS | |
| `--bb-yellow` #ffd84d | `--bb-bg` #0a0a0b | 14.31 | PASS | |
| `--bb-purple` #a78bfa | `--bb-bg` #0a0a0b | 7.27 | PASS | Death Row stat, lead section |
| `--bb-warn` #f0a040 | `--bb-bg` #0a0a0b | 9.24 | PASS | Warning state |
| `#c084fc` (AI today stat) | `--bb-bg` #0a0a0b | 7.49 | PASS | Unlisted token; consider adding to token set |
| `#4A9EFF` (blue stat) | `--bb-bg` #0a0a0b | 7.19 | PASS | Bans/24h stat value |
| ghost-btn text #8b929e | `--bb-bg` #0a0a0b | 6.32 | PASS | |

### Failing pairs (action required)

| Foreground | Background | Ratio | AA Normal | Used Where | Fix |
|---|---|---|---|---|---|
| `--bb-ink-faint` #5a5752 | `--bb-bg` #0a0a0b | **2.75** | **FAIL** | Placeholder text, section-label faint accents, `pop-ver` version chip text, dim UI elements | Raise to >= #7a7672 (est. 4.6:1 on #0a0a0b) or shift bg lighter |
| `--bb-ink-faint` #5a5752 | `--bb-panel` #131316 | **2.58** | **FAIL** | Same elements on panel background | Same fix |
| `--bb-ink-faint` #5a5752 | `--bb-sunken` #050507 | **2.83** | **FAIL** | Sunken input text if placeholder uses faint | Same fix |
| `#5c6370` (legacy TEXT3) | `#0c0e12` (legacy BG) | **3.20** | **FAIL** | `.pop-section-label` in pre-iter CSS; some inline color:#5c6370 | Replace legacy TEXT3 with `--bb-ink-dim` #9b9892 or consolidate to BB tokens |
| `#5c6370` (legacy TEXT3) | `#181b20` (legacy BG2) | **2.86** | **FAIL** | Same | Same |
| `--bb-ink-faint` #5a5752 | `#050507` | **2.83** | **FAIL** | Version badge bg-tinted text | Fix token |
| White #fff on blue btn | `#4A9EFF` | **2.75** | **FAIL** | `.pop-btn-primary` in legacy block (popup.css:151) -- "color:#fff" on blue background | This is the pre-BB-iter primary button. The BB iter overrides to `color: var(--bb-bg)` (#0a0a0b on amber), which passes at 9.29:1. Verify the legacy block is fully overridden; dead code if so |
| Lapse threshold label #888 | panel bg | ~3.1 (est) | **FAIL** | `popup.html:607 color:#888` inline | Replace with `var(--bb-ink-dim)` |
| SafeMode span label `#aaa` | panel bg | ~3.2 (est) | **FAIL** | `popup.html:184 color:#aaa` inline | Replace with `var(--bb-ink-dim)` |

**Key finding:** The `--bb-ink-faint` / `#5a5752` token is the systemic failure. It is the third text level and sits below the 4.5:1 threshold against all dark backgrounds. It should only appear as non-text decoration (borders, separators) -- never as readable text. The old `#5c6370` (TEXT3) and inline `#aaa` / `#888` values share the same failure mode and should be consolidated into the BB token set at a higher luminance.

**Semi-transparent surfaces (cannot be calculated without compositing):**
- `--bb-amber-bg: rgba(255,153,51,0.10)` -- used as hover background, not text background. No text sits on this alone.
- `--bb-red-bg`, `--bb-green-bg`, etc. -- same usage pattern. Not text backgrounds.

---

## E. `prefers-reduced-motion` Implementation

### What is correctly implemented

Three separate motion reduction layers exist:

**Layer 1 -- popup.css:716-723 (CSS custom properties):**
```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --gam-dur-micro: 0ms; --gam-dur-appear: 0ms;
    --gam-dur-disappear: 0ms; --gam-dur-decision: 0ms;
  }
}
```
All transitions using these variables collapse to 0ms. Covers: snack entrance, modal appearance, chevron rotation, tab indicator slide.

**Layer 2 -- popup.css:1237-1239 (nuclear kill):**
```css
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
```
Blunt but comprehensive. Kills everything that Layer 1 misses in the popup.

**Layer 3 -- modtools.js:20592-20599 (content script):**
Covers `#gam-status-bar *`, `.gam-modal *`, `.pop-btn`, `.gam-btn`, `.gam-bar-icon`, `#gam-mc-panel *`. Kills transitions.

**Layer 4 -- modtools.js:20992-20998 (injected CSS):**
Covers `.gam-snack`, `.gam-mc-panel`, `.gam-tooltip`, `.gam-preflight`, `.gam-title-pill`.

**Layer 5 -- skeleton shimmer (modtools.js:4174-4179):**
Shimmer is only applied inside `@media (prefers-reduced-motion: no-preference)` -- correctly opt-in, not opt-out.

### Gaps

| Animation | Where | Gap |
|---|---|---|
| `gam-brigade-pulse` | modtools.js:18217 | Brigade alert chip animation applied via inline `style.cssText` with hardcoded `animation:`. Inline style beats the `@media` rule in Layer 3-4. Missing a runtime JS check: `if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches)`. | **Medium** |
| `gam-chip-pulse` on `.gam-chip--risk-critical` | modtools.js:19144 | Defined in GAM\_CSS string, no PRM guard in the `@keyframes` or class definition. Layer 4 covers `.gam-modal *` but `.gam-chip--risk-critical` may appear outside modals. | **Low** |
| `gam-halo-pulse` on `.gam-repeat-halo--pulse` | modtools.js:19196 | Defined in GAM\_CSS, no guard. Layer 3/4 covers status bar elements but this class is applied inside user rows. | **Low** |
| `gam-arm-fill` on `.gam-preflight-arm::after` | modtools.js:19553 | Layer 4 covers `.gam-preflight` so this should be caught, but `::after` pseudo-elements may not inherit. Verify. | **Low** |
| `gam-mm-hints-in` on `#gam-mm-hints` | modtools.js:19267 | Animation applied via class in GAM\_CSS. Not covered by any PRM layer targeting this id or class. | **Medium** |
| `animation:gam-spin` on `.gam-mc-loading::before` | modtools.js:18989 | Spinner inside loading state. Layer 3 covers `#gam-mc-panel *` which should capture this, but only when inside the MC panel. If `.gam-mc-loading` appears elsewhere (e.g. mod console rows), it's uncovered. | **Low** |
| Tab alert dot pulse `gam-tab-dot-pulse` | popup.js:2892 | Inline style `animation:gam-tab-dot-pulse 1.5s...` on the dot. popup.css Layer 2 kills it in the popup context, so this is covered in the popup window. | **Covered** |

**Fix pattern for uncovered inline animations:**
```js
const motionOk = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (motionOk) {
  chip.style.animation = 'gam-brigade-pulse 1s ease-in-out infinite alternate';
}
```

---

## F. Skip Links and Landmark Roles in Popup

### Current state

The popup has no skip links and sparse landmark structure:

```
<body>
  <div class="pop-header">         <!-- no role="banner" -->
  <nav role="tablist">             <!-- correct nav, but role=tablist overrides nav landmark -->
  <div class="pop-stats">          <!-- no role -->
  <div class="pop-alert">          -- no role -->
  <div id="pop-drill">             -- no role="dialog" -->
  <div class="pop-actions">        -- no role -->
  <details class="gam-card">       -- native interactive, OK -->
  ...
  <div class="pop-footer">         -- no role="contentinfo" -->
```

The `<nav>` element has `role="tablist"` which overrides its implicit `navigation` landmark role. Screen reader users therefore have only one landmark to navigate to: the `<nav>` element (which is now a tablist, not a navigation landmark). The rest of the popup is a flat, landmark-free zone.

### What is missing

| Element | Needed | Priority |
|---|---|---|
| Skip link | `<a href="#pop-main-content" class="skip-link">Skip to content</a>` at top of body | Low -- popup is small enough that one Tab gets to the tablist |
| Main landmark | `<main id="pop-main-content">` wrapping the tab content areas | Medium |
| Banner landmark | `role="banner"` or `<header>` on `.pop-header` | Low |
| Contentinfo landmark | `role="contentinfo"` or `<footer>` on `.pop-footer` | Low |
| Tab panel wiring | Each tab content section needs `role="tabpanel"` + `aria-labelledby="[tab-button-id]"` | **High** (completes the ARIA tab widget) |
| Nav landmark | The `<nav>` with `role="tablist"` loses its nav landmark. Either keep the tablist inside a separate `<nav>` or accept the override. Current markup is: `<nav ... role="tablist">` -- the tablist role wins; the nav landmark is suppressed. Acceptable tradeoff in a compact extension popup. | Low |

### Minimal landmark structure to add

```html
<body>
  <header class="pop-header" role="banner">...</header>
  <nav class="pop-tabnav" role="tablist" aria-label="ModTools navigation">
    <button id="tab-stats" ...>Stats</button>
    ...
  </nav>
  <main id="pop-main-content" role="main">
    <div role="tabpanel" aria-labelledby="tab-stats" data-tab="stats">
      <!-- stat grid, alert, drill drawer -->
    </div>
    <div role="tabpanel" aria-labelledby="tab-tokens" data-tab="tokens" hidden>
      <!-- token card -->
    </div>
    ...
  </main>
  <footer class="pop-footer" role="contentinfo">...</footer>
</body>
```

Tab panel visibility must be `hidden` (not just display:none via CSS class) to properly suppress inactive panels from the accessibility tree.

---

## G. Effort Estimate

This is sweep work touching many files but making small, targeted changes. All fixes are additive (ARIA attributes, CSS, minimal JS). No architecture changes required.

| Fix | File(s) | LOC estimate | Priority |
|---|---|---|---|
| Stat cards: add `role="button" tabindex="0" aria-label="{label}: {val}"` | popup.html | ~14 | P0 |
| KPI tiles: same pattern | popup.html | ~8 | P0 |
| Drill-down drawer: `role="dialog" aria-modal aria-label`, focus in/out | popup.html + popup.js | ~12 | P0 |
| Tab panel roles (`role="tabpanel" aria-labelledby`) + `hidden` attr wiring | popup.html + popup.js | ~20 | P0 |
| Popup modals (`__popupAskText`, `__popupConfirm`): add role + aria-labelledby + focus restore | popup.js | ~10 | P1 |
| Macro edit form: add `<label for="macroEditLabel">` and `<label for="macroEditBody">` | popup.html | ~4 | P1 |
| `--bb-ink-faint` contrast fix: raise token or restrict to non-text use | popup.css | ~2 | P1 |
| `#5c6370` / `#aaa` / `#888` legacy inline colors: replace with `var(--bb-ink-dim)` | popup.html (5 instances) | ~8 | P1 |
| `filterSel`: add `aria-label="Upvote age filter"` | modtools.js | ~1 | P1 |
| `gam-bar-tier-badge`: add `aria-hidden="true"` | modtools.js | ~1 | P1 |
| Brigade pulse: JS-gate animation on `prefers-reduced-motion` | modtools.js | ~3 | P2 |
| `gam-mm-hints-in`: add PRM guard to keyframe declaration | modtools.js | ~3 | P2 |
| `safeModeToggle`: add explicit `for="safeModeToggle"` to label | popup.html | ~1 | P2 |
| `lapsedThresholdInput`: add `for=` to label | popup.html | ~1 | P2 |
| `maintAutoToggle`: verify `for=` on label | popup.html | ~1 | P2 |
| `firstRunWizard`: add `role="dialog"` + step aria-live announce | popup.html + popup.js | ~8 | P2 |
| Landmark structure: `<header>`, `<main>`, `<footer>` roles | popup.html | ~6 | P3 |
| Arrow key nav on tabs (roving tabindex) | popup.js | ~15 | P3 |
| Macro sub-tabs: add `role="tab"` pattern | popup.html + popup.js | ~8 | P3 |
| Focus restore on `__popupAskText`/`__popupConfirm` close | popup.js | ~4 | P3 |
| Focus restore on macro edit cancel | popup.js | ~2 | P3 |

**Total estimated LOC: ~131** across popup.html (~64 LOC), popup.js (~39 LOC), popup.css (~2 LOC), modtools.js (~26 LOC).

This is a multi-file sweep but each individual change is 1-20 lines. Parallelizes well. P0 items (stat cards, drill drawer, tabpanel wiring) are the highest-impact, lowest-risk fixes and should ship first.

---

## Screen Reader Compatibility Notes

- **VoiceOver (macOS/iOS) + Chrome:** The ARIA tab widget is partially announced due to missing `role="tabpanel"`. Focus management in popup modals will cause VoiceOver to lose context.
- **NVDA + Chrome (Windows):** Same tabpanel gap. The `__popupConfirm` backdrop click-to-dismiss works but NVDA will not announce the dialog context on entry without `role="dialog"`.
- **JAWS:** Will silently skip the stat card `<div>` elements since they have no role. Users will Tab past them with no announcement.
- **The `gam-sr-only` class** (defined in modtools.js:3994 via `SR_ONLY_CSS`) is the correct visually-hidden pattern and is used for the aria-live regions. This is already correct.
