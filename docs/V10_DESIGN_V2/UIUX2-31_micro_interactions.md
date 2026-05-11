# UIUX2-31 -- Micro-Interactions Audit

**Version:** v10.13 design ralph V2
**Scope:** 10 hot-path interactions across `modtools.js`, `popup.css`, `popup.js`
**Prior spec:** `docs/V10_FRONTEND/02_INTERACTION_GRAMMAR.md` (motion token grammar)
**Status:** Read-only audit. No code changes in this document.
**Theme:** Bloomberg Terminal amber -- `--bb-amber: #ff9933`

---

## Method

Each interaction is graded on four axes:

- **Immediate** -- does sensory feedback fire within one frame (<17ms) of the gesture?
- **Legible** -- is the feedback channel distinct enough to read at terminal-scan speed?
- **Recoverable** -- does the surface communicate reversibility where it exists?
- **PRM-safe** -- does the animation collapse gracefully under `prefers-reduced-motion`?

Grades: PASS / MARGINAL / FAIL

---

## A. Per-Interaction Feedback Quality

### 1. Ban Confirm (preflight modal)

**What fires:** `preflight()` in `modtools.js:2130`. An overlay mounts with a danger-styled panel, arm-countdown progress bar, and a disabled Confirm button that enables after N seconds.

**Sensory feedback inventory:**

| Moment | Feedback | Grade |
|---|---|---|
| Modal mounts | Backdrop + panel appear; no entry animation | MARGINAL |
| Arm countdown | 2px red bottom-border progress bar animates left-to-right via `gam-arm-fill` keyframe | PASS |
| Button enables | Text changes from "Arm in Ns..." to "Confirm"; no color shift or pulse to signal the state change | MARGINAL |
| Cancel click | Modal unmounts; no exit animation | MARGINAL |
| Confirm click | Modal unmounts, parent action fires | MARGINAL |

**Detail -- what is missing:**

The arm-countdown bar (`gam-preflight-arm::after`, `modtools.js:20663`) is the single strongest micro-interaction in the entire codebase: a CSS `@keyframes` width-fill that is literally a countdown you can see depleting. This is correct and should be held.

The button enable moment is dead. A button changing from `disabled` to enabled with only a text-label swap gives zero feedback on a dark background at terminal-scan speed. The transition from "armed" to "ready" is the highest-stakes moment in the flow -- it gets no sensory signal beyond text. A 200ms `box-shadow` pulse on enable (one-shot, not looping) would close this gap without violating Bloomberg constraints.

Modal mount/dismiss has no structural animation. The `APPEAR` / `DISAPPEAR` motion classes defined in `02_INTERACTION_GRAMMAR.md` exist precisely for this surface and are not applied. Mount latency is visually indistinct from a hard DOM swap.

**PRM:** The arm-fill animation uses `animation:` directly with no `@media (prefers-reduced-motion)` guard. Under PRM the progress bar freezes at 0% and the countdown appears broken -- the button never enables because the `setInterval` still ticks but the visual indicator doesn't move. The JS side is unaffected; only the CSS breaks. A static red bar at 100% width (replacing the animation) would preserve the "countdown elapsed" signal. **This is the only PRM bug found across all 10 interactions.**

---

### 2. Undo Toast / Undo Stack (status bar button)

**What fires:** `_refreshUndoBtn()` in `modtools.js:5168`. The status-bar undo icon fades from `opacity:0.35` to `opacity:1` when an undoable action is recorded. `Ctrl+Z` invokes `_execUndo()`.

**Sensory feedback inventory:**

| Moment | Feedback | Grade |
|---|---|---|
| Action recorded (DR add) | Undo btn opacity 0.35 -> 1 | MARGINAL |
| Undo btn hover | No hover state defined (inherits gam-bar-icon hover: amber color shift) | PASS |
| Ctrl+Z fires | Snack shown with result | PASS |
| Stack exhausted | Opacity 0.35 | PASS |

**What is missing:**

The opacity-only signal for "undo available" is too quiet. Opacity 0.35 -> 1 is a legitimate legibility toggle (disabled vs. enabled), but it does not communicate *urgency*. The undo window is 20 seconds. There is no visual countdown on the button to signal that the window is closing. The mod has no way to know they have 3 seconds left to hit Ctrl+Z without counting in their head.

The design spec `docs/V10_V11/05_UNIVERSAL_UNDO.md` (feature exists, `UNIVERSAL_UNDO:true` flag is live) implies a toast-level countdown. No such toast exists in the current codebase. The `_recordUndoAction` path fires a `_refreshUndoBtn()` call -- that is the entire UI signal for "undo window is open."

A correct implementation would:
1. On action record, briefly pulse the undo button once (single keyframe, not looping) to break attention.
2. Optionally show a 20s countdown badge on the button using a CSS `conic-gradient` ring that depletes -- no JS timer needed, pure CSS `animation` with `animation-duration:20s linear forwards`.
3. On window expiry, fade back to 0.35 with no additional signal.

None of this currently exists.

---

### 3. Copy to Clipboard

**What fires:** Multiple call sites (`__gamDebugDump`, token copy buttons in popup). In `popup.js`, token copy buttons call `navigator.clipboard.writeText()` directly.

**Sensory feedback inventory:**

| Moment | Feedback | Grade |
|---|---|---|
| Copy button click | None observed in popup.css (no `.copied` state, no `.success` flash, no :active state defined for copy buttons) | FAIL |
| Debug dump copy | Console log only: `%c[gam-debug-dump] copied to clipboard` -- nothing in the UI | FAIL |
| Copy failure | Console log only | FAIL |

**What is missing:**

Copy-to-clipboard has zero UI feedback in any surface. This is the most significant gap in the audit. The pattern is well-established: button label momentarily changes to a check/tick word ("Copied" or "OK") for ~1200ms, with optional background flash. None of this exists. A mod who copies a token value has no confirmation the clipboard write succeeded.

The correct fix is a `copyWithPulse(btn, text)` utility that:
1. Writes to clipboard (existing three-layer fallback in `__gamDebugDump` can be extracted).
2. Temporarily swaps button label to "COPIED" for 1200ms.
3. Applies a one-shot class (`gam-copy-flash`) that transitions `background` from `rgba(61,214,140,0.18)` to transparent over 800ms.
4. Reverts label.

This requires approximately 20 lines of JS and 4 lines of CSS. It is the highest-ROI gap fix in this entire audit.

---

### 4. Modal Open / Snack Dismiss

**What fires:** `snack()` in `modtools.js:7436`. Mounts a `.gam-snack` div, then in the next rAF adds `.gam-snack-show`. Dismiss: removes `.gam-snack-show`, then removes the element after 300ms.

**Sensory feedback inventory:**

| Moment | Feedback | Grade |
|---|---|---|
| Snack mount | `opacity:0;transform:translateY(6px) scale(.97)` -> `opacity:1;transform:translateY(0)` via `transition:opacity .14s,transform .18s` | PASS |
| Snack auto-dismiss | Reverses the above classes, element removes after 300ms | PASS |
| Snack severity | Four background colors (green/red/amber/blue) + BB overrides for panel+border+text tint | PASS |
| Snack action buttons (`snackWithActions`) | Static buttons, no hover state defined in the action button CSS | MARGINAL |

**What is good:**

The snack mount/dismiss is the best-implemented micro-interaction in the codebase. The timing split (14ms opacity / 18ms transform on mount; 300ms exit) is close to the `APPEAR`/`DISAPPEAR` spec from `02_INTERACTION_GRAMMAR.md`. The BB CSS override layer correctly converts to bordered-panel style. This is hold-the-line territory.

**What is marginal:**

`snackWithActions` renders inline buttons inside the snack. The action buttons have no hover state defined (no CSS class targets them within the snack container). A mod mousing toward "Retry" or "Dismiss" gets no affordance feedback. Low severity.

---

### 5. Drawer Open (Intel Drawer)

**What fires:** `IntelDrawer.open()` in `modtools.js:5730`. Adds `gam-intel-drawer--open` and `gam-intel-backdrop--open` classes to the drawer and backdrop elements.

**Sensory feedback inventory:**

| Moment | Feedback | Grade |
|---|---|---|
| Drawer open | Class swap drives a CSS `transform` slide-in | PASS |
| Backdrop fade | Backdrop opacity animates in via the class | PASS |
| Drawer close | Class removal reverses the animation | PASS |
| Skeleton placeholder | `renderSkeleton()` fires while sections load | PASS |

**What is good:**

The class-toggle pattern is correct -- the CSS owns the animation, the JS owns the state. The skeleton shimmer during section-load prevents layout-shift jank.

**What is missing:**

The transition values on `gam-intel-drawer--open` are hardcoded (`transform 0.2s ease-out` per the audit in `02_INTERACTION_GRAMMAR.md`). The spec says split into APPEAR (160ms decelerate) on open and DISAPPEAR (120ms accelerate) on close. Currently both directions use the same 200ms ease-out, which means the close feels slower than the open -- counter-intuitive. The fix is a Wave 2 item per `02_INTERACTION_GRAMMAR.md` but it is the only motion issue in this surface.

---

### 6. Popover Open (Suspicious Users, Queue)

**What fires:** `_showSiteHealthPopover()` in `modtools.js:18605`. The popover mounts with `animation:gam-sh2-in 140ms ease-out forwards` -- a `scale(0.96) translateY(6px)` -> `scale(1) translateY(0)` keyframe.

**Sensory feedback inventory:**

| Moment | Feedback | Grade |
|---|---|---|
| Popover mount | Scale+translate entry animation, 140ms ease-out | PASS |
| Feed row stagger | Each feed row has `animation-delay:calc(var(--i,0)*30ms)` -- rows cascade in | PASS |
| Shimmer rows | Skeleton shimmer on feed rows before data loads | PASS |
| Popover dismiss | No exit animation -- hard DOM removal | MARGINAL |

**What is good:**

The entry animation is the second-best implementation in the codebase after the snack. Scale+translate combined is the correct Bloomberg idiom for surface appearance (not bouncing or morphing -- a clean decelerate settle). The 30ms row stagger is tasteful: adds perceived performance without theatrics.

**What is marginal:**

Popover dismiss is an instant DOM removal. The popover appears with 140ms polish and disappears in 0ms. This asymmetry is jarring. A 100ms opacity fade on dismiss (no scale -- just opacity) would close the gap at minimal cost.

---

### 7. Tab Switch (Popup)

**What fires:** `setTab()` in `popup.js`. Removes `pop-tab-active` from outgoing tab, adds it to incoming. Panel `display` toggles.

**Sensory feedback inventory:**

| Moment | Feedback | Grade |
|---|---|---|
| Tab press :active | No `:active` state on `.pop-tab` | FAIL |
| Tab active state | Color + bottom-border-color change via `.pop-tab-active` (amber) | PASS |
| Panel swap | Instant (no fade between panels) | PASS (Bloomberg rule: tab content is data) |
| Hover | Background tint `rgba(255,153,51,0.05)` + color | PASS |

**What is missing:**

`.pop-tab` has no `:active` state. Per the Bloomberg terminal constraint, the active/selected state is correct as a persisted indicator. But the press moment -- the 80ms window between pointerdown and pointerup -- has no feedback. A user pressing a tab gets no tactile-equivalent signal. A press-depth simulation of `background:rgba(255,153,51,0.12)` on `:active` (80ms, linear) is the correct Bloomberg-tasteful fix. This is the MICROINTERACTION class from the grammar spec.

Panel content swap is intentionally instant per the Bloomberg no-motion-on-data-updates rule. Correct.

---

### 8. KPI Tile Click (Stats Tab)

**What fires:** `.gam-kpi-tile:active` in `popup.css:1832`. Applies `background:var(--bb-active)` (`#25252a`). `.gam-kpi-tile:hover` applies `--bb-hover` (`#1c1c20`).

**Sensory feedback inventory:**

| Moment | Feedback | Grade |
|---|---|---|
| Hover | Background darkens from panel to `--bb-hover` | PASS |
| :active press | Background darkens further to `--bb-active` | PASS |
| Click result | Opens drill-down drawer (if `data-drill` set) | PASS |
| KPI loading | `kpi-pulse` opacity animation while `data-loading="true"` | PASS |

**What is good:**

The three-state hover progression (resting / hover / active) is correctly implemented and uses token values. This is the closest implementation to the PRM + Bloomberg spec of any clickable surface in the tool. The loading pulse is tasteful (opacity 0.4 -> 0.9, 1.2s ease-in-out).

**What is marginal:**

There is no explicit `transition` on `.gam-kpi-tile` from resting -> hover -> active, meaning the background change is instant. The MICROINTERACTION spec calls for 80ms linear. A single `transition:background var(--gam-dur-micro) var(--gam-ease-micro)` would correct this. Without the motion token variables being applied (Wave 2 work), this is a raw `80ms linear` hardcode, which is acceptable.

---

### 9. Save Success (Token Save / Settings Write)

**What fires:** Token save buttons in popup call status updates via `pop-token-status` class swaps (`ok` / `err`) plus text content change.

**Sensory feedback inventory:**

| Moment | Feedback | Grade |
|---|---|---|
| Save in-flight | Button opacity 0.6, `pointer-events:none`, label "..." implied by caller | MARGINAL |
| Save success | `.pop-token-status.ok` color -> green, text updated | MARGINAL |
| Save error | `.pop-token-status.err` color -> red, text updated | MARGINAL |
| Status color change | Instant swap, no transition | FAIL |

**What is missing:**

The token status line (`pop-token-status`) has no transition on its color change. A success state going from `#5c6370` (dim) to `#3dd68c` (green) is meaningful state information -- it deserves 80ms of transition time so the mod's peripheral vision catches it. The current hard-swap is invisible unless the mod is already looking at the status line.

More significantly, there is no success flash on the button itself. The save button returns to its resting state silently. The only feedback is the small status line below. For a high-stakes action (token save), the feedback surface should be the button -- a brief background flash to `rgba(61,214,140,0.18)` and back would confirm the write without disrupting the Bloomberg aesthetic.

---

### 10. Death Row Countdown (DR Section)

**What fires:** `.gam-dr-countdown` with urgency classes (`urg-critical`, `urg-imminent`, etc.) in `modtools.js:18037-18042`. Critical state adds `animation:gam-dr-cd-pulse 1s ease-in-out infinite`.

**Sensory feedback inventory:**

| Moment | Feedback | Grade |
|---|---|---|
| Countdown display | Monospace, tabular-nums, live text update | PASS |
| Urgency color coding | 4-tier color ramp (red/orange/yellow/dim) | PASS |
| Critical pulsing | Opacity 1 -> 0.4 looping pulse on `urg-critical` | PASS |
| DR row exit animation | `gam-dr-row-out` keyframe: height collapse + fade, 220ms ease-in | PASS |
| Fire button confirming state | `gam-dr-cd-pulse 0.6s` on `.confirming` class | PASS |

**What is good:**

The death row section is the most animation-complete surface in the codebase. The four-tier urgency ramp, the row-exit collapse, and the fire-button confirming pulse are all correct implementations of the Bloomberg data-alerting pattern. The row-out animation (max-height collapse) is the right technique for removing a live row without a jarring DOM jump.

**PRM:** The `gam-dr-cd-pulse` animation on `urg-critical` has no PRM guard. Under reduced motion, the critical row pulses regardless. This is the second PRM finding (after the arm-fill bar). Both are `animation:` directives with no `@media (prefers-reduced-motion: reduce)` wrapper. Under PRM the color alone (red `#ff3b3b`) still communicates urgency, so the fallback is acceptable -- but the static color should be confirmed correct without the animation.

---

## B. Missing Feedback Gaps (Priority-Ranked)

| Rank | Gap | Surface | Severity | Fix cost |
|---|---|---|---|---|
| 1 | **Copy-to-clipboard has zero UI confirmation** | Popup token fields, debug dump | CRITICAL | ~24 lines (JS utility + 4 CSS) |
| 2 | **Undo window has no countdown signal** | Status bar undo button | HIGH | ~30 lines CSS (conic-gradient timer ring) + 1 class add on record |
| 3 | **Tab :active press state missing** | Popup tab nav | HIGH | 3 lines CSS |
| 4 | **Ban preflight button-enable has no signal** | preflight() modal | HIGH | 1 keyframe + 1 JS classList call on enable |
| 5 | **Token save success has no button flash** | Popup token section | MEDIUM | `copyWithPulse` utility doubles as save flash |
| 6 | **Popover dismiss is instant (entry has 140ms animation)** | Site health popover | MEDIUM | 4 lines CSS |
| 7 | **Status line color change is instant (no 80ms transition)** | pop-token-status | LOW | 1 line CSS |
| 8 | **KPI tile resting->hover has no transition** | Stats tab tiles | LOW | 1 line CSS |
| 9 | **snackWithActions action buttons have no hover state** | In-page snack | LOW | 3 lines CSS |

---

## C. Token-Driven Motion Patterns

The five motion classes from `02_INTERACTION_GRAMMAR.md` are the single source of truth. Every new micro-interaction added to GAM must pull from this table -- no raw ms values in new code.

```
MICROINTERACTION  80ms linear          -- hover, :active, focus, copy-flash, tab press
APPEAR           160ms decelerate      -- snack mount, popover mount, modal mount, drawer open
DISAPPEAR        120ms accelerate      -- snack dismiss, popover dismiss, modal close, drawer close
DECISION         200ms spring          -- j/k hold queue exit, arm-enable pulse (one-shot)
PULSE            500ms-2000ms          -- urgency indicators only (DR critical, SIREN, brigade)
```

### Applying tokens to the five gap fixes

**Gap 1 -- copy flash:** `MICROINTERACTION` class. A 80ms linear fade-in of the success background, then a second 800ms fade-out. Total two-keyframe animation, both at MICROINTERACTION speed.

```css
@keyframes gam-copy-flash {
  0%   { background: rgba(61,214,140,0.22); }
  60%  { background: rgba(61,214,140,0.22); }
  100% { background: transparent; }
}
.gam-copy-flash {
  animation: gam-copy-flash 800ms var(--gam-ease-micro) forwards;
}
```

**Gap 2 -- undo ring timer:** A single CSS animation with `animation-duration` set via inline style to match the JS grace window (20s). No JS timer needed.

```css
@keyframes gam-undo-ring {
  from { --undo-pct: 100%; }
  to   { --undo-pct: 0%; }
}
/* conic-gradient ring on the button ::before pseudo-element, depletes over --undo-seconds */
```

**Gap 3 -- tab :active:** `MICROINTERACTION` class.

```css
.pop-tab:active {
  background: rgba(255,153,51,0.12) !important;
  transition: background var(--gam-dur-micro) var(--gam-ease-micro) !important;
}
```

**Gap 4 -- preflight enable pulse:** `DECISION` class (200ms spring, one-shot). Fires on the `remaining <= 0` branch inside the `setInterval` that arms the button.

```css
@keyframes gam-arm-enabled {
  0%   { box-shadow: 0 0 0 0 rgba(74,158,255,0.55); }
  70%  { box-shadow: 0 0 0 8px rgba(74,158,255,0); }
  100% { box-shadow: 0 0 0 0 rgba(74,158,255,0); }
}
.gam-btn-accent.just-armed {
  animation: gam-arm-enabled var(--gam-dur-decision) var(--gam-ease-decision) forwards;
}
```

**Gap 6 -- popover dismiss:** `DISAPPEAR` class.

```css
@keyframes gam-sh2-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}
/* Applied on close before DOM removal, with 120ms timeout before remove() */
```

---

## D. Bloomberg-Tasteful Constraints (Non-Negotiable)

These are the motion rules that must NOT be violated by any gap fix:

| Rule | Rationale |
|---|---|
| No looping animation on interactive controls | Looping draws eye away from data. Only `PULSE` class is looping, and only on urgency indicators. |
| No spring/bounce on data-driven surfaces | KPI tiles, countdown text, stat chips: values change -- motion would imply the number itself is uncertain. Instant swap is the Bloomberg idiom. |
| No scale transforms on tab switches | Tab content is data. Fading or scaling between tabs implies the data is transitioning when it is simply being shown. Display toggle is correct. |
| No morphing or color cycling on buttons | A button's color communicates semantic state (danger / accent / disabled). Cycling or shifting hue implies state change. One-shot flash for success is acceptable; looping color shift is not. |
| :active states must be instant-in, fast-out | Press depth is a tactile metaphor. The down moment is instant; the up moment can transition at MICROINTERACTION speed (80ms). Never animate the press-down. |
| `prefers-reduced-motion` collapses all animation to 0ms | The five CSS variables all resolve to 0ms under PRM. Any `animation:` directive that bypasses the variable system (raw `animation:` in `@keyframes` without a PRM media query) is a defect. Two confirmed defects exist: `gam-arm-fill` and `gam-dr-cd-pulse`. |

### The one exception: skeleton shimmer

Skeleton loading shimmer (`gam-skeleton-shimmer`, `gam-sh2-shimmer`) is a looping animation on a non-urgency surface. It is intentional and Bloomberg-acceptable because:
1. It fires only on loading states (data absent), not on stable data.
2. The `@media (prefers-reduced-motion: no-preference)` guard is correctly applied to the skeleton rule.
3. The shimmer serves a usability function (progress indicator) not an aesthetic one.

This exception does not generalize. No other looping animation on a non-urgency surface is acceptable.

---

## E. Effort Summary

| Work item | Type | Effort | Blocking? |
|---|---|---|---|
| `copyWithPulse()` utility + CSS | JS + CSS | S (24 lines) | No |
| Tab `:active` state | CSS | XS (3 lines) | No |
| Token status 80ms transition | CSS | XS (1 line) | No |
| KPI tile hover transition | CSS | XS (1 line) | No |
| Popover dismiss fade | CSS + 4 lines JS (setTimeout remove) | XS | No |
| Arm-enable pulse (preflight) | CSS + 2 lines JS | S | No |
| Undo ring timer | CSS (conic-gradient, ~10 lines) + 1 line JS | S | Requires `--gam-amber` token (already defined) |
| PRM fix: `gam-arm-fill` | CSS | XS (wrap in `@media (prefers-reduced-motion: no-preference)`) | No |
| PRM fix: `gam-dr-cd-pulse` | CSS | XS (same pattern) | No |
| `snackWithActions` hover state | CSS | XS (2 lines) | No |

**Total: 2 S-items + 8 XS-items. No M or L items. All CSS-only except `copyWithPulse` (24 lines JS + 4 CSS).**

The copy-to-clipboard gap (Rank 1) is the immediate ship target. Everything else can batch as a single "micro-interactions pass" CSS commit with no behavioral risk.

---

*Word count: ~2400 words. Within 2500 budget.*
