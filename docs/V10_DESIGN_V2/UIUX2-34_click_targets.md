# UIUX2-34 — Click-Target Sizing + Tap Accessibility Audit
**v10.13 Design Ralph V2 | 2026-05-10**

Reference files examined:
- `modtools-ext/popup.css` (2331 lines — the Bloomberg override layer is the cascade winner)
- `modtools-ext/popup.html` (850 lines — all interactive elements inventoried)
- `modtools-ext/modtools.js` (21 000 + lines — content-script injected CSS audited via grep)

WCAG thresholds used:
- **AA-tight (32 px)** — practical floor for mouse-primary desktop extension UI
- **WCAG 2.5.5 AA (24 px)** — absolute legal minimum for non-essential targets
- **WCAG 2.5.5 AAA (44 px)** — full touch-safe / motor-impaired safe

---

## A. Sub-32 px Elements Inventory

### A.1 Content-script status bar — `.gam-bar-icon`

**The most critical failure in the codebase.**

```css
/* modtools.js line 20408 */
.gam-bar-icon {
  width: 22px;
  height: 22px;   /* VIOLATION: 10px below 32px AA-tight floor */
  ...
}
```

- Base size: **22 × 22 px** — 45 % below the 32 px minimum.
- Every interactive button in the floating status bar uses this class:
  session-health pill, firehose toggle, filter `<select>`, Death Row count,
  siren, siren-clear, modmail trigger, C5 button, gear/settings, ticker icons,
  mod-log, help, debug snapshot, bug report, clean-UI broom, post-lock,
  sticky-chip, tard-suggest, senior-chip, chat badge — **~20 interactive targets
  all at 22 px**.
- A separate `::after`-based hit-area extension is **not present** for any of these.
- The `gam-bar-filter` `<select>` was partially fixed in v10.6.2:
  `min-height:32px!important;min-width:32px!important` (modtools.js line 20416),
  but the base `.gam-bar-icon` rule it overrides still declares 22px and the
  `min-height` fix only applies to `select.gam-bar-icon`, leaving all `<button>`
  bar icons at 22 px.
- The gated "ux-polish" block (modtools.js lines 4610-4619) sets
  `min-width:44px;min-height:44px;padding:11px` on `.gam-bar-icon` — but
  this only fires when `body.gam-ux-polish-on` is present. That class is never
  observed to be set in production flows based on the codebase. The AAA fix
  exists but is dead code.

**Verdict: VIOLATION — highest priority.**

---

### A.2 Popup — `.pop-btn-ghost` base

```css
/* popup.css line 207-218 */
.pop-btn-ghost {
  padding: 4px 8px;   /* rendered height ~22-23 px at 11px font */
  ...
}
```

The Bloomberg layer overrides all buttons with `min-height: 28px` (line 881),
so in production the computed height is **28 px** — below the 32 px AA-tight floor.

Affected elements in `popup.html`:
- Debug snapshot + Dashboard (`.gam-card-grid2 .pop-btn` gets `min-height:36px !important` — PASS)
- Crawl pills: `.gam-crawl-pill` → `min-height:28px !important` (line 1689) — **BORDERLINE**
- Macro tabs, macro add/AI-seed buttons, save/cancel — `min-height: 28px` — **BORDERLINE**
- Token Save, rotateBtn, claimRotateBtn, all `.pop-btn pop-btn-ghost` in tool rows — **28 px BORDERLINE**
- All maintenance probe/action buttons inside `.pop-maint-action-row`:
  `min-height: 32px !important` (line 1738) — PASS
- `firstRunPathLink / Code / Token` buttons: inline `padding:10px 12px` → ~36 px rendered — PASS
- `firstRunGo` button: amber fill, `padding:8px 12px` → ~30 px — **BORDERLINE**

---

### A.3 Popup footer — `.pop-link`

```css
/* popup.css line 170-182 */
.pop-link {
  padding: 2px 4px;   /* rendered height: ~19-21 px */
  font-size: 11px;
  /* No min-height set. Bloomberg layer min-height:28px applies via 'button' selector */
}
```

Bloomberg `button { min-height: 28px }` (line 881) should rescue these to
28 px computed — but the `pop-link` rule does not have `!important` on any
sizing property and the Bloomberg rule does not use `!important` either.
Source-order cascade means 28 px should apply. **Still 28 px — BORDERLINE.**

Export log / Import / Factory reset are small footer text-style buttons that
a mouse user will have to aim at carefully. Touch usage would be painful.

---

### A.4 Popup — `.pop-drill-close` (drill panel X button)

```css
/* popup.css line 467-477 */
.pop-drill-close {
  padding: 0 4px;
  font-size: 16px;
  /* No min-height / min-width. Bloomberg 28px applies. */
}
```

Computed: **28 px height, ~24 px wide** (4px padding each side on a 16px char) — **VIOLATION** on width.

---

### A.5 Popup — `.gam-qa-btn` (Quick Actions bar — Lead tab)

```css
/* popup.css line 1889-1909 */
.gam-qa-btn {
  padding: 4px 6px !important;
  font: 600 11px/1.2 ...;   /* rendered height: ~21 px at 11px line-height 1.2 + 8px padding */
}
```

The Bloomberg `min-height:28px` on `button` applies here: **28 px — BORDERLINE.**

---

### A.6 Popup — lapsed chip `.chip-expand`

```css
#lapsedModsChip .chip-expand {
  padding: 1px 6px !important;
  min-height: 0 !important;  /* OVERRIDE kills the 28px Bloomberg floor */
}
```

`min-height:0 !important` — this explicitly removes the Bloomberg 28 px
safety net. Rendered height is approximately **15-17 px** — **VIOLATION.**

---

### A.7 Popup — drill toolbar (filter input + sort select + export button)

```css
.pop-drill-filter  { min-height: 0 !important; padding: 3px 6px; }
.pop-drill-sort    { min-height: 0 !important; padding: 3px 6px; }
.pop-drill-export  { min-height: 0 !important; padding: 3px 8px; }
```

All three use `min-height:0 !important`. Rendered at ~22-24 px — **VIOLATION** (all three).

---

### A.8 Popup — `.gam-stale-refresh` inline button

```css
.gam-stale-refresh {
  padding: 0 !important;
  min-height: 0 !important;
}
```

A text-underline button with zero padding and zero min-height.
Rendered at approximately **12-14 px** — **VIOLATION.**

---

### A.9 Content-script — `.gam-t-act` (triage console row action buttons)

```css
/* modtools.js line 20606 */
.gam-t-act {
  width: 22px;
  height: 22px;   /* VIOLATION */
  border-radius: 3px;
  ...
}
```

These are the Watch / Death Row / Ban / Pattern buttons in every triage
console row. Fixed 22 × 22 px, no `::after` extension. **VIOLATION.**

---

### A.10 Content-script — `.gam-ctx-item` (context menu items)

```css
/* modtools.js line 20781 */
.gam-ctx-item {
  height: 28px;
  padding: 0 12px;
}
```

Fixed 28 px row height — **BORDERLINE** for mouse; **VIOLATION** for touch.
The ux-polish block sets `min-height:44px` on `.gam-ctx-item` when the class
is active, but again that class is dead in production.

---

### A.11 Content-script — `.gam-tip-ctrl-x` (tooltip close button)

```css
/* modtools.js line 20703 */
.gam-tip-ctrl-x {
  width: 22px;
  height: 22px;
}
```

22 × 22 px — **VIOLATION.**

---

### A.12 Content-script — `.gam-bar-icon-brand` (brand logo button)

```css
/* modtools.js line 20369 */
.gam-bar-icon-brand {
  width: 22px;
  height: 22px;
}
```

22 × 22 px — same as regular bar icons — **VIOLATION.**

---

### A.13 Content-script — `.gam-mc-head` (Mod Chat panel header)

```css
/* modtools.js line 15824 */
.gam-mc-head { min-height: 44px; }
```

PASS — explicitly set to 44 px. This is the only content-script interactive
region that already meets AAA.

---

## B. Hit-Area Extension Audit (::after pseudo)

**No `::after` hit-area extension patterns exist anywhere in the codebase.**

Search confirmed zero instances of `position:absolute` on `::after` attached
to any interactive element for the purpose of enlarging tap area. The `*, *::before, *::after { border-radius: 0 !important }` rule in the Bloomberg
layer (popup.css line 1212) would not interfere with `::after` extensions if they
were added (it only removes border-radius, not position or sizing).

The ux-polish block adds `padding:11px` to `.gam-bar-icon` to mechanically
expand the hit area, but this bloats the rendered visual box — it does not
use the invisible-overlay pattern that WCAG 2.5.5 recommends for dense layouts.

**Verdict: ::after hit-area extension pattern is completely absent. All
undersized targets rely solely on visual box size.**

---

## C. Dense-Row Reachability

### C.1 Triage console rows (`.gam-t-row`)

```css
.gam-t-row {
  min-height: 34px;
  padding: 2px 8px;
  gap: 6px;
  grid-template-columns: 22px 1fr 80px 130px 120px;
}
```

Row height is 34 px — acceptable for the row itself — but the action cell
contains four `.gam-t-act` buttons at **22 × 22 px each with `gap:6px`** between
them. The clickable area is 22 px tall within a 34 px row — the 12 px of dead
space above/below does not help because it belongs to the row container, not
the button. A misclick on the gap hits the row (likely triggering row-level
click which opens the console) rather than the intended button.

**::after extension on `.gam-t-act` would solve this without expanding
the rendered button or the row height.**

### C.2 Maintenance probe rows (`.pop-maint-action-row`)

```css
.pop-maint-action-row {
  min-height: 32px !important;
  padding: 4px 8px !important;
  gap: 8px !important;
}
```

The button inside gets `min-height:28px` — the row container is 32 px but
button is 28 px. Row clicks route to button click because the button is
`flex:1` and spans almost the full row width. **PASS for reachability
despite the 28 px button — the hot zone is effectively the row width.**

### C.3 Drill toolbar (filter + sort + export)

Three controls side-by-side, all at `min-height:0`. On a 380 px popup at
default zoom they render as approximately 22-24 px tall controls separated
by 6 px gaps. The export button is 3px vertical padding on 10px text = ~16 px
of visual height. A missed click on the export button hits the drill body below
it, triggering nothing (benign) but frustrating. **Reachability: POOR.**

### C.4 Status bar (content-script) — The Densest Surface

The status bar is 28 px tall (`height:28px` on `#gam-status-bar`). It contains
~12-20 `.gam-bar-icon` elements at 22 × 22 px with `gap:6px`. The icons are
effectively 22 px clickable inside a 28 px container — the 3 px top/bottom
padding on the bar is decoration, not hit area. Horizontal spacing of 6 px
between 22 px icons means a 28 px-wide target for each slot (22 px icon +
partial gaps), but vertically the user must land inside 22 px of a 28 px bar.

On a standard 1920 × 1080 desktop monitor at 100 % zoom this is workable with
a mouse. On a high-DPI laptop at 125 % zoom the physical pixel size drops
further. On touch it is unusable.

---

## D. AA vs AAA Target Choice Per Surface

| Surface | Recommended floor | Rationale |
|---|---|---|
| Status bar `.gam-bar-icon` | **32 px** (AA-tight) | Fixed-position, mouse-primary, extremely dense. Going to 44 px would require a taller bar or overflow layout. 32 px is the pragmatic target — implement via `::after` extension, not box growth. |
| Status bar `select.gam-bar-filter` | **32 px** | Already has the `min-width/height:32px!important` hotfix from v10.6.2. Keep as-is, confirm it is not being overridden. |
| `.gam-t-act` (triage row buttons) | **32 px via ::after** | Rows are 34 px; buttons must stay 22 px visual to fit the grid. `::after` with `position:absolute; inset:-6px` provides a 34 px hit zone without layout change. |
| `.gam-ctx-item` (context menu) | **32 px** | Menu is pointer-only; increase to `min-height:32px`. 44 px would make a 6-item menu 264 px tall — acceptable but generous. |
| Popup `.pop-btn-ghost` | **32 px** | Change Bloomberg base `min-height:28px` → `min-height:32px`. Low risk — buttons only get 4 px taller. |
| Popup `.pop-btn-primary`, `.pop-btn` | **44 px** (AAA) | Primary action buttons. Already at 44 px in `.pop-actions`; standardize across all primary surfaces. |
| Popup footer `.pop-link` | **32 px** | Low-frequency destructive actions (Factory reset). Should be reachable without pixel-hunting. |
| Popup `.pop-drill-close` | **32 × 32 px** | Modal close is a high-stress target; needs explicit `min-width:32px;min-height:32px`. |
| Popup drill toolbar (filter/sort/export) | **28 px** acceptable | These are utility controls in a scrollable panel, not primary actions. 28 px is acceptable here — but `min-height:0!important` must be removed to let the 28px floor apply. |
| Popup `.chip-expand` (lapsed chip) | **28 px** | Low frequency; restore the Bloomberg 28 px floor by removing `min-height:0!important`. |
| Popup `.gam-stale-refresh` | **28 px** | Restore Bloomberg floor. |
| `.gam-tip-ctrl-x` | **32 × 32 px** | Tooltip close must be reachable under time pressure. |
| `.gam-kpi-tile` | **52 px** (current) | Already at `min-height:52px`. PASS. |
| `.gam-mc-head` | **44 px** (current) | PASS. |
| First-run wizard buttons | **44 px** | Already ~36-44 px due to generous padding. PASS. |

---

## E. Effort

### E.1 Quick wins — remove the `min-height:0!important` overrides (1-2h)

These 5 rules actively sabotage the Bloomberg 28 px safety net. Remove them:

- `popup.css:1951` — `.chip-expand`
- `popup.css:2181` — `.gam-stale-refresh`
- `popup.css:2255` — `.pop-drill-filter`
- `popup.css:2263` — `.pop-drill-sort`
- `popup.css:2274` — `.pop-drill-export`

After removal, all five elements will inherit the Bloomberg `button { min-height:28px }`.
That still leaves them borderline, but removes the active violations.

### E.2 Bloomberg base button bump: 28 px → 32 px (30min)

Change one line in `popup.css`:

```css
/* popup.css line 881 — currently: */
min-height: 28px;
/* change to: */
min-height: 32px;
```

This raises every non-overridden popup button to 32 px in one shot. Watch for
any layout overflow in the dense maintenance rows — the `pop-maint-action-row`
min-height is 32 px and buttons inside are flex:1, so no conflict expected.

### E.3 `.pop-drill-close` explicit sizing (15min)

Add to the Bloomberg block:

```css
.pop-drill-close {
  min-width: 32px;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

### E.4 `.gam-bar-icon` fix in modtools.js — ::after pattern (2-3h)

This is the highest-impact fix. Two approaches:

**Option A (visual box expansion — simpler, bigger visual change):**
```css
.gam-bar-icon {
  width: 28px;   /* was 22px */
  height: 28px;  /* was 22px */
}
```
The status bar container is already 28 px tall so this fills it wall-to-wall.
Gap between icons compresses from 6 px to 0 px unless `gap` is adjusted.
The bar will need `gap:2px` to breathe. Visual change is noticeable.

**Option B (::after invisible extension — preferred, zero visual change):**
```css
.gam-bar-icon {
  position: relative;  /* add */
  /* keep width/height:22px */
}
.gam-bar-icon::after {
  content: '';
  position: absolute;
  inset: -5px;   /* expands hit area 5px in each direction → 32px tap zone */
}
```
Zero visual difference. The 28 px bar container clips the extension at 3 px
top/bottom, so the true hit extension is `inset:-3px -5px` to stay within
the bar. Requires `overflow:visible` on `#gam-status-bar` or setting
`position:relative; overflow:visible` on the bar (currently `overflow` is
not set, so it defaults to `visible` — this should work).

**Recommendation: Option B.** The status bar is visually correct at 22 px
icons. The problem is purely hit area. `::after` solves it without
touching the visual design.

### E.5 `.gam-t-act` ::after extension in triage rows (1h)

```css
.gam-t-act {
  position: relative;
}
.gam-t-act::after {
  content: '';
  position: absolute;
  inset: -6px;   /* row is 34px; button is 22px; (34-22)/2 = 6px each side */
}
```

The `gam-t-actions` cell has `overflow: visible` (default) so the extension
into the row's top/bottom padding is safe.

### E.6 `.gam-ctx-item` height bump (15min)

```css
.gam-ctx-item { min-height: 32px; }  /* was height:28px fixed */
```

### E.7 Activate or remove the dead `gam-ux-polish-on` block (1h)

The ux-polish block at modtools.js lines 4610-4619 and 4445 already sets all
these elements to 44 px. If that class is ever wired to a real condition,
those targets get AAA in one shot. Two options:

- **Wire it**: add `document.body.classList.add('gam-ux-polish-on')` unconditionally
  on bar build. The 44 px sizing would then apply everywhere. Risk: bar icons
  at 44 px + `padding:11px` + `box-sizing:content-box` would make each icon
  66 px wide — the bar would overflow at ~12 icons. The `box-sizing:content-box`
  is the bug. Fix to `content-box → border-box` and the padding is internal.
- **Delete it** if never intended to be wired: dead code in a 21 000 line file.

The cleanest path is the `::after` approach in E.4 + E.5, which does not
require the ux-polish infrastructure at all.

---

## Summary Table

| ID | Element | Current | Target | Approach | Effort |
|---|---|---|---|---|---|
| A.1 | `.gam-bar-icon` (all ~20 bar buttons) | 22 px | 32 px | `::after inset:-5px` | 2-3 h |
| A.2 | `.pop-btn-ghost` + all Bloomberg buttons | 28 px | 32 px | Change line 881: 28→32 | 30 min |
| A.3 | `.pop-link` footer buttons | 28 px | 32 px | Covered by E.2 | 0 additional |
| A.4 | `.pop-drill-close` | 28 × ~24 px | 32 × 32 px | Explicit `min-width/height:32px` | 15 min |
| A.5 | `.gam-qa-btn` | 28 px | 32 px | Covered by E.2 | 0 additional |
| A.6 | `.chip-expand` | ~15 px | 28 px | Remove `min-height:0!important` | 5 min |
| A.7 | Drill toolbar 3 controls | ~16-22 px | 28 px | Remove 3× `min-height:0!important` | 5 min |
| A.8 | `.gam-stale-refresh` | ~12 px | 28 px | Remove `min-height:0!important` | 5 min |
| A.9 | `.gam-t-act` (triage row buttons) | 22 px | 32 px | `::after inset:-6px` | 1 h |
| A.10 | `.gam-ctx-item` (context menu) | 28 px | 32 px | `min-height:32px` | 15 min |
| A.11 | `.gam-tip-ctrl-x` | 22 px | 32 px | `min-width/height:32px` | 10 min |
| A.12 | `.gam-bar-icon-brand` | 22 px | 32 px | Covered by E.4 | 0 additional |
| B | `::after` hit-area pattern | absent | standard | Implement in E.4+E.5 | in E.4+E.5 |

**Total estimated effort: 5-7 hours for full AA-tight compliance.**
**Quick-win subset (E.1 + E.2 + E.3 + E.6): removes most active violations in ~1 hour.**
