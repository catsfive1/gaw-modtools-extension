# UIUX-18 — Motion Design Tokens & Animation System
**Bloomberg Terminal Chrome Extension — v10.x**
Status: DESIGN-SPEC | Read-only audit + proposal
Author: DESIGN-18-MOTION agent | 2026-05-10

---

## A. Inventory of All Current Motion

### A.1 Keyframe Animations

All `@keyframes` found across `popup.css` (popup UI) and the inline CSS strings
injected by `GAM_CSS` inside `modtools.js`.

| ID | Name | Location | Duration | Easing | Intent |
|----|------|----------|----------|--------|--------|
| KF-01 | `gam-skeleton-shimmer` | modtools.js L4181 | 2s linear infinite | linear | Loading skeleton shimmer (wide gradient sweep) |
| KF-02 | `gam-spin` | modtools.js L18990 | 1s linear infinite | linear | Loading spinner (border rotate) |
| KF-03 | `gam-shimmer` | modtools.js L19177, L20899 | 1.2s / 1.5s infinite | ease (implicit) | Skeleton shimmer v2 (translateX) — **duplicate of KF-01** |
| KF-04 | `gam-brigade-pulse` | modtools.js L18223 | 1s ease-in-out infinite alternate | ease-in-out | High-severity brigade chip box-shadow heartbeat |
| KF-05 | `gam-chip-pulse` | modtools.js L19145 | 2s infinite | ease (implicit) | Risk-critical chip opacity throb (0%→50%→100%) |
| KF-06 | `gam-halo-pulse` | modtools.js L19195 | 600ms ease-out 1 (play once) | ease-out | Repeat-offender halo ring burst |
| KF-07 | `gam-arm-fill` | modtools.js L19554 | CSS var `--arm-seconds` (default 3s) linear | linear | Pre-flight countdown bar fill |
| KF-08 | `gam-ticker-pulse-kf` | popup.css L20693–20698 | 1.5s ease-in-out infinite | ease-in-out | Ticker icon ambient pulse |
| KF-09 | `gam-inbox-arrived-kf` | popup.css L20720–20727 | 0.7s ease-in-out, plays 3x | ease-in-out | Inbox item arrival bounce (scale+color) |
| KF-10 | `gam-mm-hints-in` | modtools.js L19266 | 0.35s ease-out, plays once | ease-out | Hints panel slide-in from right |
| KF-11 | `gam-ee-fade` | modtools.js L19803 | 4s ease forwards | ease | Easter-egg overlay fade in/hold/out |
| KF-12 | `gam-ee-rain` | modtools.js L19804 | (child el, duration set per element) | ease (implicit) | Easter-egg particle rain |
| KF-13 | `gam-ee-gold` | modtools.js L19805 | (child el, duration set per element) | ease (implicit) | Easter-egg gold box-shadow glow |

### A.2 CSS Transitions (by surface)

#### popup.css — Popup UI transitions

| Surface / selector | Properties | Duration | Easing |
|--------------------|-----------|----------|--------|
| Checkbox, toggle-like inputs | `border-color`, `background` | 0.12s / .12s | none specified |
| Buttons (general) | `background`, `border-color`, `color` | 0.1s / 100ms | none / `ease-out` |
| Nav / tab links | `color` | 0.12s | none |
| Token field borders | `border-color` | 0.12s | none |
| Status bar icon hover | `background`, `color`, `transform` | 0.1s | none |
| Status bar icon hover scale | `transform:scale(1.12)` | 0.1s | none |
| Sidebar caret rotate | `transform:rotate(-90deg)` | 0.15s | none |
| Tooltip | `opacity` | 0.15s | none |
| Row hover (queue table) | `background`, `border-color` | 0.12s | none |
| Reduced-motion nuke (popup) | all | `* { transition: none !important; animation: none !important }` | — |
| `--gam-dur-*` tokens defined | see A.3 | — | — |

#### modtools.js inline CSS — Content-script surfaces

| Surface | Properties | Duration | Easing |
|---------|-----------|----------|--------|
| Modal open/close | `opacity`, `transform` | 0.15s / 0.18s | none / none |
| Modal close btn | `color`, `background` | 0.1s | none |
| Backdrop | `opacity` | 0.2s | none |
| SUS / Intel drawer open | `transform:translateX(100%→0)` | 0.18s | `ease-out` |
| Intel backdrop | `opacity` | 0.18s | none |
| Hot-Now panel open | `transform:translateX` | 160ms | `cubic-bezier(0,0,0.2,1)` |
| MC (Mod Chat) panel open | `transform`, `width` | 0.2s | `ease-out` |
| Modmail panel open | `transform:translateX(100%)` | 0.2s | `ease-out` |
| Toast show | `opacity`, `transform` | 180ms | `ease` |
| Snack show | `opacity`, `transform` | 0.14s / 0.18s | none |
| Snack bar (progress) | `width` | dynamic (ttlMs/1000)s | `linear` |
| Toggle track | `background`, `border-color`, `box-shadow` | 0.18s | none |
| Toggle thumb | `transform`, `background`, `box-shadow` | 0.18s | none |
| Chip "brigade-saved" fade-in | `opacity` | 0.2s | none |
| Orphaned-chips opacity | `opacity` | 0.3s | none |
| Hover on action buttons | `opacity` | 0.15s | none |
| Hover on quick-scan buttons | `all` | 0.15s | none |
| Help summary arrow | `transform:rotate(90deg)` | 0.15s | none |
| Thread-watch pulse | `animation:gam-pulse 1.2s infinite` | — | — |
| Row hover (modmail list) | `background-color` | 80ms | none |
| Row hover (at-risk list) | `background` | 0.08s | none |
| Context menu item | `background-color` | 80ms | `linear` |
| QSK hover outline | `outline-color` | 0.12s | `ease` |
| NBA gen button | `opacity` | 0.15s | none |
| Low-resource nuke | all | `animation:none; transition:none` (JS-injected) | — |

### A.3 Existing Token Variables (popup.css :root, v10.5)

```css
--gam-dur-micro:      80ms
--gam-dur-appear:     160ms
--gam-dur-disappear:  120ms
--gam-dur-decision:   200ms
--gam-ease-decelerate: cubic-bezier(0,0,0.2,1)
--gam-ease-accelerate: cubic-bezier(0.4,0,1,1)
--gam-ease-spring:     cubic-bezier(0.34,1.56,0.64,1)
```

These tokens exist in popup.css but are **not yet consumed** by any rule in either
`popup.css` or the `GAM_CSS` strings. They are declared but orphaned — zero
`var(--gam-dur-*)` callsites found in either file.

---

## B. Inconsistencies

### B.1 Duration fragmentation — same intent, different numbers

| Intent | Values found | Correct token |
|--------|-------------|---------------|
| Button hover (bg/border/color) | 0.1s, 100ms, .12s, 0.15s, .15s, `all .15s` | should be one value |
| Drawer/panel slide open | 0.2s, 0.18s, 160ms | 3 different durations for the same gesture |
| Opacity fade (tooltip, toast, snack) | 0.14s, 0.15s, 0.18s, 180ms, 200ms | 5 values |
| Row background hover | 80ms, .08s, .1s, .12s, .15s | 5 values |
| Transform on hover (scale buttons) | 0.1s, 0.12s, 0.15s | 3 values |
| Toggle animation | 0.18s | only one instance — consistent with itself at least |

### B.2 Easing omissions

Most `transition:` declarations have no easing function specified, defaulting to
`ease` — which is a slow-in, fast-out curve, wrong for UI feedback. Bloomberg
Terminal aesthetic demands **decelerate** (ease-out / Material decel) for
elements entering the screen, **accelerate** (ease-in) for elements leaving, and
**linear** for state changes that aren't spatial.

Surfaces missing explicit easing:
- All button hover transitions in popup.css
- All backdrop/modal opacity transitions
- Most row hover transitions
- Toggle transitions

### B.3 Duplicate keyframes

`gam-skeleton-shimmer` (KF-01, gradient sweep, 2s) and `gam-shimmer` (KF-03,
translateX, 1.2s and 1.5s) both implement the loading skeleton pattern. KF-03
appears twice with different durations (1.2s in Intel drawer, 1.5s elsewhere).
One canonical keyframe + one duration token needed.

### B.4 Scale hover inconsistency — UIUX-03 bleed risk

`transform:scale(1.12)` on `.gam-bar-icon-brand:hover` (popup.css L19260) and
`transform:scale(1.12)` on `.gam-bar-icon:hover` (popup.css L19299). The
UIUX-03 note flags scale bleed in Bloomberg theme — this is the exact pair.
Scale hover on `position:fixed` elements stacks a new stacking context and can
clip against parent overflow. Resolution: cap at `scale(1.08)` and add
`will-change: transform` to avoid compositing surprises.

### B.5 Orphaned token system

The `--gam-dur-*` / `--gam-ease-*` variables defined at line 708–714 of
`popup.css` are never referenced. Every transition rule uses hard-coded ms
values. The token system is defined but not adopted.

### B.6 Inconsistent `all` shorthand

Several rules use `transition: all .15s` (notably `.gam-mc-quick`, `.gam-mc-dur`,
`.gam-strip-btn`). `transition: all` includes `width`, `height`, `font-size`,
`padding` — which triggers layout reflow on any state change. These should be
explicit property lists.

### B.7 Dual reduced-motion strategies

Two separate kill-switch patterns exist:
1. `popup.css` line 716–723: media-query zeros `--gam-dur-*` tokens via `:root`
   override (correct approach, but tokens are unused).
2. `popup.css` line 1237–1239: `* { transition: none !important; animation: none
   !important }` — blunt nuclear rule.
3. `modtools.js` L23396: `.gam-low-resource * { animation: none !important;
   transition: none !important }` — LOW_RESOURCE_MODE JS injection.

All three are needed for different contexts but are inconsistently applied. The
`popup.css` nuclear rule (2) fires on any reduced-motion OS preference, which
correctly kills everything in the popup — but the inline `GAM_CSS` strings
injected by `modtools.js` are not governed by `popup.css` at all (different
document). The content-script surfaces have no `prefers-reduced-motion` media
query.

---

## C. Token System

### C.1 Proposed token set — `--bb-motion-*`

Naming follows the `--bb-*` convention already established for color, spacing,
and typography in `popup.css`. The existing `--gam-dur-*` tokens remain as
aliases pointing to these values for backward compat once callsites are migrated.

```css
/* ===================================================================
   BB MOTION TOKENS — UIUX-18 canonical set
   Source of truth for all duration and easing in both popup.css
   and the GAM_CSS inline strings in modtools.js.
   =================================================================== */
:root {
  /* Duration scale */
  --bb-motion-instant:  50ms;   /* state confirm (checkbox tick, toggle snap)  */
  --bb-motion-fast:    120ms;   /* hover feedback, button active press          */
  --bb-motion-base:    200ms;   /* entry/exit of overlays, drawers, panels      */
  --bb-motion-slow:    400ms;   /* ambient pulses, skeleton shimmer cycle tick  */

  /* Easing — Material Motion vocabulary applied to BB aesthetic */
  --bb-ease-decel:   cubic-bezier(0, 0, 0.2, 1);      /* entering screen — fast start, soft land */
  --bb-ease-accel:   cubic-bezier(0.4, 0, 1, 1);      /* leaving screen  — ease in, fast exit    */
  --bb-ease-standard: cubic-bezier(0.4, 0, 0.2, 1);   /* general purpose state changes           */
  --bb-ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1); /* playful micro-interactions (hover scale) */
  --bb-ease-linear:  linear;                           /* progress bars, shimmer sweeps           */

  /* Backward-compat aliases for existing --gam-dur-* callsites (none yet) */
  --gam-dur-micro:      var(--bb-motion-fast);         /* 120ms (was 80ms — aligning up)          */
  --gam-dur-appear:     var(--bb-motion-base);         /* 200ms (was 160ms)                       */
  --gam-dur-disappear:  var(--bb-motion-fast);         /* 120ms — unchanged                       */
  --gam-dur-decision:   var(--bb-motion-base);         /* 200ms — unchanged                       */
}
```

### C.2 Duration mapping rationale

| Token | ms | Use |
|-------|-----|-----|
| `--bb-motion-instant` | 50 | Checkbox check/uncheck, toggle flip thumb, button active press transform — changes that must feel immediate |
| `--bb-motion-fast` | 120 | Hover state on any interactive element (border-color, background, color), tooltip appear, snack show |
| `--bb-motion-base` | 200 | Overlay enter/exit (modal, drawer, panel), toast slide, backdrop fade, menu open — anything that crosses >40px of screen |
| `--bb-motion-slow` | 400 | Ambient animations that must not distract — ticker pulse period multiplier, badge glow, one cycle of a shimmer sweep |

Bloomberg Terminal rule: **data surfaces move faster than chrome**. A row flash
(data change) should complete in `--bb-motion-fast`. A panel opening (chrome
navigation) uses `--bb-motion-base`. This separation keeps the terminal feeling
responsive without sacrificing visual legibility.

### C.3 Easing selection guide

| Scenario | Easing token | Why |
|----------|-------------|-----|
| Panel/drawer slides in | `--bb-ease-decel` | Content arriving, decelerates to rest |
| Panel/drawer slides out | `--bb-ease-accel` | Content leaving, accelerates away |
| Modal fade in | `--bb-ease-decel` | Same entering principle |
| Button hover color | `--bb-ease-standard` | Symmetric — hover in, hover out |
| Scale hover (`.gam-bar-icon`) | `--bb-ease-spring` | Slight overshoot gives energy, not softness |
| Pulse / glow animations | `ease-in-out` (hard-coded OK) | Infinite loops, not spatial |
| Progress bar fill | `--bb-ease-linear` | Time-linear = visually honest about elapsed time |
| Skeleton shimmer | `--bb-ease-linear` | Constant sweep speed avoids "bounce" artifact |

### C.4 Transition shorthand template

Avoid `transition: all`. Always specify properties explicitly:

```css
/* Correct pattern */
transition:
  background-color var(--bb-motion-fast) var(--bb-ease-standard),
  border-color     var(--bb-motion-fast) var(--bb-ease-standard),
  color            var(--bb-motion-fast) var(--bb-ease-standard);

/* Correct pattern for spatial entries */
transition:
  opacity   var(--bb-motion-base) var(--bb-ease-decel),
  transform var(--bb-motion-base) var(--bb-ease-decel);
```

---

## D. prefers-reduced-motion Support

### D.1 Current state

- **popup.css popup UI:** partial — token override zeroes durations, but the token
  vars are unused, so the override has zero effect. Nuclear rule at line 1237 does
  work but nukes 100% of motion including `transform:none` resets.
- **Content-script (GAM_CSS in modtools.js):** no `prefers-reduced-motion` media
  query at all. Motion in content-script is only killed by LOW_RESOURCE_MODE
  (user-toggled, not OS-preference-driven).

### D.2 Correct approach

**Popup (`popup.css`):** when `--bb-motion-*` tokens are adopted by all rules, the
existing `:root` override in the `prefers-reduced-motion` media query becomes
sufficient:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --bb-motion-instant: 0ms;
    --bb-motion-fast:    0ms;
    --bb-motion-base:    0ms;
    --bb-motion-slow:    0ms;
    /* Aliases auto-zero because they point to the above */
  }
}
```

Remove the nuclear `* { transition: none !important }` rule at line 1237 once
tokens are wired — it is redundant and prevents any future override (the
`!important` chain kills specificity).

**Content-script (modtools.js GAM_CSS):** add a `prefers-reduced-motion` media
query block to the injected CSS. Pattern:

```css
@media (prefers-reduced-motion: reduce) {
  .gam-intel-drawer,
  #gam-hot-now-panel,
  #gam-mc-panel,
  .gam-modal,
  #gam-backdrop,
  #gam-intel-backdrop { transition: none !important; }
  .gam-chip--risk-critical,
  #gam-thread-watch-btn.gam-thread-watch-btn--flagged,
  .gam-repeat-halo--pulse,
  .gam-mc-loading::before,
  .gam-skeleton,
  .gam-at-row,
  .gam-snack { animation: none !important; transition: none !important; }
}
```

**LOW_RESOURCE_MODE (AF-30 pattern):** already fires `animation:none;
transition:none` for `.gam-low-resource *`. This covers the user-controlled
performance path. `prefers-reduced-motion` covers the OS accessibility path.
These are independent concerns — both are needed, neither replaces the other.

### D.3 Ambient pulse exception

Pulse animations (`gam-brigade-pulse`, `gam-chip-pulse`, `gam-ticker-pulse-kf`)
serve a **semantic function** — they signal active alert state. Under
`prefers-reduced-motion`, pure opacity/scale pulses should be replaced with a
static color change rather than eliminated entirely:

```css
@media (prefers-reduced-motion: reduce) {
  .gam-chip--risk-critical {
    animation: none;
    opacity: 1; /* hold max opacity — no flicker */
  }
  #gam-thread-watch-btn.gam-thread-watch-btn--flagged {
    animation: none;
    box-shadow: 0 0 0 2px #ff9933; /* static ring instead of pulse */
  }
}
```

---

## E. New Motion Proposals

### E.1 SUS Popover Drill-Down Row Expand

**Context:** The SUS (Suspicious User Score) popover currently shows a flat list.
UIUX-03 / future work notes a drill-down for per-signal detail. When a row
expands to show the signal breakdown, it currently snaps open (no animation).

**Proposal:** `gam-row-expand` keyframe — height reveal with opacity fade,
direction: down.

```css
@keyframes gam-row-expand {
  from {
    opacity: 0;
    max-height: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    max-height: 240px; /* cap at reasonable max; overflow:hidden on parent */
    transform: translateY(0);
  }
}

.gam-sus-drill-body {
  animation: gam-row-expand var(--bb-motion-base) var(--bb-ease-decel) forwards;
  overflow: hidden;
}
```

Duration: `var(--bb-motion-base)` (200ms). Easing: `--bb-ease-decel` — content
arriving downward decelerates to rest. Collapse (reverse): `--bb-ease-accel`,
75% of open duration (150ms) — content leaving accelerates away, feels snappy.

**Reduced-motion alternative:** remove max-height transition, keep opacity only at
0ms with instantaneous show/hide — the state change is still visible, just instant.

### E.2 Status-Change Pulse on Ticker

**Context:** The modtools ticker (status bar, `#gam-status-bar`) rotates through
states. When a new alert arrives, the relevant ticker segment should flash once to
draw the eye without ambient distraction.

**Proposal:** `gam-ticker-status-flash` — single-fire, 3-flash sequence, amber to
white to amber resolving to neutral.

```css
@keyframes gam-ticker-status-flash {
  0%   { color: var(--bb-amber); background: rgba(255,153,51,0.18); }
  20%  { color: #fff;            background: rgba(255,255,255,0.12); }
  40%  { color: var(--bb-amber); background: rgba(255,153,51,0.14); }
  60%  { color: #fff;            background: rgba(255,255,255,0.08); }
  80%  { color: var(--bb-amber); background: rgba(255,153,51,0.10); }
  100% { color: inherit;         background: transparent; }
}

.gam-ticker-segment--changed {
  animation: gam-ticker-status-flash 600ms var(--bb-ease-standard) forwards;
}
```

Duration: 600ms total (3 flashes × ~200ms). Class applied by JS when the ticker
segment value changes, removed on `animationend` listener. Does not fire on first
load — only on transitions from a previous state.

**Reduced-motion:** suppress animation entirely. The text value change is itself
a visible state change — no additional flash needed.

### E.3 Proposal: Canonicalize Skeleton Shimmer

Consolidate `gam-skeleton-shimmer` (KF-01) and `gam-shimmer` (KF-03) into one:

```css
@keyframes bb-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.gam-skeleton,
.gam-mc-loading-skel {
  background: linear-gradient(
    90deg,
    var(--bb-bg-2) 0%,
    var(--bb-border-2) 50%,
    var(--bb-bg-2) 100%
  );
  background-size: 200% 100%;
  animation: bb-shimmer var(--bb-motion-slow) var(--bb-ease-linear) infinite;
  /* --bb-motion-slow = 400ms; shimmer completes once per 400ms */
}
```

This replaces three inconsistent definitions with one, driven by the slow token.

---

## F. Effort Estimate

| Item | Scope | Effort | Risk |
|------|-------|--------|------|
| F.1 Wire `--bb-motion-*` tokens into all popup.css rules | popup.css only | 2h | Low — mechanical find/replace of duration values |
| F.2 Add `--bb-motion-*` token definitions to popup.css :root | popup.css only | 30m | None — additive |
| F.3 Remove nuclear `* { transition: none !important }` at line 1237 once tokens wired | popup.css only | 5m | Low — depends on F.1 complete first |
| F.4 Inject `prefers-reduced-motion` block into GAM_CSS | modtools.js | 1h | Low — additive CSS string |
| F.5 Fix `transition: all` → explicit properties on 5 selectors | modtools.js | 1h | Low |
| F.6 Cap scale hover at 1.08, add `will-change: transform` | popup.css / modtools.js | 30m | Low — UIUX-03 fix |
| F.7 Consolidate skeleton shimmer keyframes | modtools.js | 45m | Low |
| F.8 Implement gam-row-expand (SUS drill-down) | modtools.js | 2h | Medium — requires SUS popover refactor hook |
| F.9 Implement gam-ticker-status-flash | modtools.js | 1.5h | Low — JS class toggle + keyframe |
| F.10 Add explicit easing to all `transition:` without one | both files | 3h | Low but tedious — ~80 callsites |

**Total estimated effort:** ~12h across two files.
**Recommended sequencing:** F.2 → F.1 → F.3 → F.4 → F.6 → F.7 → F.10 → F.5 → F.9 → F.8

Foundation tokens must land before callsite migration (F.2 before F.1).
Content-script reduced-motion (F.4) is independent and can ship in parallel.
The new animations (F.8, F.9) are additive and block on nothing.

---

## Appendix: Motion Intent Map

```
INSTANT (50ms)  — feels like hardware, not software
  checkbox tick, toggle thumb snap, button :active scale

FAST (120ms)    — acknowledges the gesture without delay
  hover state (bg/border/color), tooltip appear, row highlight

BASE (200ms)    — clear but not slow; the primary motion unit
  panel/drawer open, modal fade, toast entry, backdrop

SLOW (400ms)    — ambient background rhythm
  pulse cycle anchors, shimmer sweep, ticker beat period

INFINITE LOOPS  — semantic state indicators, not transitions
  brigade-pulse (threat active), chip-pulse (risk-critical),
  ticker-pulse (live data), skeleton-shimmer (loading),
  gam-spin (API in flight)
  All must respect prefers-reduced-motion via static fallback.
```
