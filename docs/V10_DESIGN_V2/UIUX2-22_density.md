# UIUX2-22 -- Information Density Audit
## GAW ModTools v10.13 -- Bloomberg Terminal Popup (380px)

**Status:** Design Spec (read-only amber canonical)
**Agent:** UIUX2-22-DENSITY
**Date:** 2026-05-10
**Scope:** Five primary surfaces -- Stats grid, SUS/drill popover rows, DR popover bands, Maintenance 4-card split, Intel Drawer
**Canonical popup width:** 380px. Usable: 356px (12px pad each side).
**Bloomberg density reference:** Ledger-style -- every pixel earns its place through information yield, not decoration. Rest comes from structure (lines, borders, zebra) not from whitespace inflation.

---

## Bloomberg Terminal Density Principles Applied Here

Before the per-surface audit, the framework used to score each surface:

**Tabular alignment.** Columns must be hard-aligned, not soft-wrapped. Numeric
columns right-aligned, label columns left-aligned. Mixed-direction rows in the
same column break scannability.

**Monospace numerics.** All numeric data must be rendered with `font-variant-numeric:
tabular-nums`. Variable-width digits (system-ui, sans-serif) create column drift
that the eye reads as noise, not data.

**No wasted whitespace, but visual rest via structure.** Padding should not exceed
what is required for touch target compliance (28px minimum in dense contexts,
36px preferred, 44px ideal). Visual separation comes from 1px rule lines, zebra-
stripe alternation on rows, and category borders -- not from vertical margins.

**Glyph economy.** One glyph does multiple jobs. A colored status chip simultaneously
signals category AND severity AND clickability. An amber delta arrow signals both
direction AND magnitude class. An icon must not merely decorate -- it must carry
information that would otherwise require a text label.

**Fitts's Law balance.** Dense targets become usable through two mechanisms: (a) the
target group is always in the same location (muscle memory replaces acquisition
scanning), and (b) secondary affordance (keyboard shortcuts, tooltips, color coding)
compensates for small target size. Dense does not mean "untappable."

**4/8/12/16 spacing rhythm.** Every vertical dimension is a multiple of 4px. Spacing
violations create a visual "churn" that the eye interprets as untrustworthy data.

---

## A. Density Audit Per Surface

---

### A.1 Stats Grid (`.pop-stats` / `.pop-stat`)

**Structure:** 3-column CSS grid (8 tiles, wrapping to 3rd row of 2). Each tile:
label row (9px uppercase) + value (20px bold tabular) + delta chip + sparkline slot.
Grid gap: 0. Cell padding: `var(--bb-s4) var(--bb-s5)` = 8px vertical / 12px horizontal.

**Density verdict: CORRECT -- densified correctly in v9.7.0 Bloomberg pass.**

The stats grid is the strongest surface in the popup. The Bloomberg override layer
at `popup.css:912` eliminates inter-cell gaps (gap: 0), uses 1px rule dividers
between cells, and makes the outer border a single ledger boundary. Values are
monospace tabular-nums at 20px with -0.01em tracking. Labels are 9px uppercase
10% letter-spaced dim ink. The information hierarchy (label -> value -> delta) is
correct and reads in under 200ms on a single glance.

**Specific measurements:**
- Cell pad: 8px top/bottom, 12px left/right. On a 380px popup the 3-col layout
  gives each tile ~(380 / 3) - 24px = ~103px usable. The 20px numeral reads at 5:1
  hierarchy over the 9px label. Correct.
- Delta chip: 10px tabular-nums, color-coded. 2px margin-top from value. On-grid.
- Sparkline slot (`.pop-stat-spark`): present in HTML, CSS not confirmed defined
  in this audit pass. If sparklines are not yet wired they are silent DOM noise.
- The 8th tile (Auto-UNS) shares the 3rd-row with the 7th (AI today). This leaves
  the bottom row with only 2 of 3 columns filled. The empty third cell is a gap
  at the bottom right. This is acceptable if a 9th metric is planned; if not,
  consider a 2-column bottom row or a promoted metric to fill the slot.

**Scoring: 9/10.** (-1: empty 3rd cell in bottom row is a visible asymmetry.)

---

### A.2 Drill Popover Rows (`.pop-drill-row`)

**Structure:** Full-width overlay panel (380px minus 12px each side = 356px).
Each row is a 3-column CSS grid: `90px | 1fr | auto`. Columns: timestamp (mono
10px), username (600 weight, color link), status pill. Optional 4th sub-row for
snippet text spanning full width.

**Density verdict: SPARSE -- two wasted dimensions.**

**Problem 1 -- Timestamp column is 90px wide but only uses ~55px of content.**
`90px | 1fr | auto` -- the timestamp is displayed as `HH:MM:SS` or `YYYY-MM-DD HH:MM`
in 10px monospace. At 10px JetBrains Mono, 8 characters = ~55px. The 90px allocation
leaves ~35px of dead whitespace to the right of the timestamp before the username
starts. This causes the username column to start significantly right of where it
could, losing ~35px of label real estate per row. Fix: reduce timestamp column to
`minmax(48px, max-content)` or `72px` (fits ISO date HH:MM:SS comfortably).

**Problem 2 -- Row padding is 6px / 12px.**
`padding: 6px 12px` at `popup.css:502`. At 6px top/bottom each row is 22px tall
minimum (6 + 10px line + 6). Bloomberg terminal rows are 24-28px. This is slightly
tight but acceptable given the snippet sub-row option adds height contextually.
Not a problem on its own.

**Problem 3 -- Status pill column `auto` right-aligns correctly, but pill
padding (1px 6px) makes narrow pills like "OK" appear as 3-char label with
oversized horizontal pad.** The pill is `9px` font at `padding: 1px 6px`. Total
pill width for a 2-char label: 6+6+~14px = ~26px. For a 6-char label (BANNED):
6+6+~36px = ~48px. The variable width causes the meta column to shift left/right
per row -- breaking fixed-column alignment. Fix: give the status pill a `min-width:
48px; text-align: center` so all pills occupy the same horizontal budget.

**Problem 4 -- The `col-snippet` sub-row is always rendered in DOM as a separate
div, even when empty.** An empty snippet div consumes 2px of height (margin-top:
2px with zero content). Since snippet spans `grid-column: 1 / -1` it creates a
visual stagger when some rows have it and some do not -- column baseline alignment
breaks across rows. Fix: render snippet div only when content exists (JS-side).

**Scoring: 5/10.** (-2: wasted timestamp column, -2: pill width variance breaks
column alignment, -1: always-rendered empty snippet.)

---

### A.3 DR (Death Row) Popover Bands

**Structure:** Accessed via the Death Row stat tile drill. The drill drawer
(`.pop-drill`) renders these rows in the same `.pop-drill-row` template as A.2,
but Death Row rows typically carry an additional band: a colored status accent
indicating execution imminence (READY / SCHEDULED / HELD).

The existing pill classes handle this: `.pop-drill-pill.dr` (purple tint),
`.pop-drill-pill.ready` (red). The band is a pill, not a row-background stripe.

**Density verdict: ACCEPTABLY DENSE but misses one Bloomberg pattern.**

Bloomberg terminal uses row-background banding for state categories (e.g., all
READY rows get a 10% red background, all SCHEDULED rows get neutral background).
Currently DR rows are distinguished only by the pill color in the status column.
This means the eye must travel to the right side of each row to read the status
before the row semantics are clear. A Bloomberg-correct design would apply a
`background: var(--bb-red-bg)` stripe to READY rows so the state is visible from
the leftmost pixel.

**Problem 1 -- No row-level background banding by DR status.**
All DR drill rows share the same transparent background. The status difference is
only readable in the pill column (rightmost). This requires per-row eye travel
instead of gestalt pre-attentive scanning. Fix: in the drill render JS, add a
`data-dr-status` attribute to ready rows and apply:
```css
.pop-drill-row[data-dr-status="ready"] { background: var(--bb-red-bg); }
.pop-drill-row[data-dr-status="ready"]:hover { background: rgba(255,59,59,0.18); }
```

**Problem 2 -- The execution countdown (time remaining) is in the meta column
at 10px dim ink.** For Death Row the countdown IS the primary data point, not a
secondary meta. It should be in the value column (1fr) at the same weight as the
username, or replace the meta column with a prominent countdown display.

**Scoring: 6/10.** (-2: no banding by state, -2: countdown demoted to secondary
meta column instead of primary data.)

---

### A.4 Maintenance 4-Card Split (`#card-maint-status`, `#card-maint-probes`,
`#card-maint-detect`, `#card-maint-integrity`)

**Structure:** Four distinct `<div class="gam-card">` panels in the Tools tab.
Each has a `gam-card-header` (amber title) and a body with `.pop-maint-action-row`
elements. Each action row: flex row, button (flex: 1, text-left) + status label
(max-width: 120px, right-aligned).

Row measurements: `padding: 4px 8px`, `min-height: 32px`, `border-bottom: 1px
solid var(--bb-line)`. Button: `padding: 5px 8px`, `min-height: 28px`, 11px font.

**Density verdict: GOOD STRUCTURE, 3 wasted dimensions.**

**Problem 1 -- Card header padding `8px 12px 8px 14px` + card body `8px 12px
8px 14px` = double 8px vertical for header + body top.** Every card has 8px header
padding-bottom + 1px border + 8px body padding-top = 17px of unproductive vertical
span at every card boundary. Four cards = 68px of dead space on a 380px popup.
Bloomberg headers should be 24-28px total height. Current `.gam-card-header` is:
8px top pad + 10px font (actual render height ~14px) + 8px bottom pad = ~30px.
Acceptable. But the inter-card gap (`margin: 0 0 8px 0` on `.gam-card`) adds
another 8px between cards = 32px of inter-card air for 4 cards. Fix: reduce
inter-card gap from 8px to 4px.

**Problem 2 -- `.pop-maint-action-row` min-height is 32px but button inside is
min-height 28px.** The 4px delta means the button has 2px padding on each side
from the row container -- this is invisible dead space. If the button fills the
row it should be `min-height: 32px` matching its container, or the row padding
should absorb the difference. Current state creates a phantom vertical gap within
each row that breaks the ledger feel.

**Problem 3 -- The status label has `max-width: 120px`.** For a 380px popup with
the button occupying `flex: 1` (roughly 356 - 8 - 8 padding - 8 gap - 120 status
= 212px for button), 120px for status is appropriate. No issue here.

**Problem 4 -- `#card-maint-status` has a Safe Mode toggle row that uses a custom
inline toggle widget.** The toggle track is `width: 32px; height: 16px` with a
`12px` thumb. This is below the Bloomberg-density acceptable minimum for a binary
control (24px minimum track). The toggle reads as "decorative CSS" rather than
a real control. Fix: expand toggle track to `width: 40px; height: 20px` with
a `16px` thumb, matching standard Bloomberg-terminal binary switch proportions.

**Problem 5 -- Feature Health row (`#featureHealthRow`) is `display:none`
by default.** When shown it uses `flex-direction: column; align-items: flex-start`
with a label and a status list. The status list (`#featureHealthList`) is plain
`font-size: 11px` colored text. There is no visual separation between the feature
items. Fix: render feature items as mini-rows with a 1px bottom border between
items, matching the `.pop-maint-action-row` pattern used elsewhere.

**Scoring: 7/10.** (-1: inter-card gap 8px -> 4px, -1: button height mismatch
in action row, -1: toggle undersized.)

---

### A.5 Intel Drawer (`.gam-intel-drawer` / `#gam-intel-drawer`)

**Structure:** Right-side overlay panel, `width: min(480px, 40vw)`. Six numbered
section blocks rendered as `<section data-section="N">` with `<h3>` titles.
Additional Activity (sec7) and Lookalikes (sec8) sections for User kind. The
drawer body is `flex: 1; overflow-y: auto`.

Note: the UIUX-02 audit (2026-05-09) identified 2 P0 bugs (tooltip chasing cursor,
orphan sweep killing backdrop/ESC) and multiple P1/P2 items. This density audit
evaluates the visual layout independent of those functional bugs.

**Density verdict: SPARSE -- the most under-densified surface in the system.**

**Problem 1 -- Section h3 headers have excessive vertical padding.**
Each section block renders an `<h3>` section title (e.g., "WHAT THIS IS",
"WHY IT MATTERS"). The `gam-drawer-section` likely inherits the popup body font
and padding from the Bloomberg override layer. In the popup CSS `popup.css:738`
the body is `font: var(--bb-t-base)/1.4 var(--bb-font)` -- a 1.4 line-height.
For a 13px heading with 1.4 line-height the rendered height is 18px, plus typical
padding of 8-12px above = 26-30px per section title before content even begins.
Six section titles = 156-180px of header air. On a viewport-height drawer this
consumes 15-20% of available height on labels alone.

Bloomberg terminal convention: section labels are 8-10px uppercase with 4px padding
above, not 12-13px with 8px padding. Each title should be a monospace bar line
(`-- WHAT THIS IS --` style), not a traditional heading. Fix: enforce 8px font,
4px top pad, 2px bottom pad on all drawer section headers.

**Problem 2 -- Section content is paragraph-style prose with 1.5+ line-height.**
The six section body blocks render narrative prose (e.g., "This account was
registered 47 days ago and has 23 posts..."). Prose in a terminal drawer is
categorically wrong. Bloomberg renders data in labeled ledger rows, not paragraphs.
Example target format for "What this is":
```
REG         47d ago    (2025-03-24)
POSTS            23    [normal: 18.4 avg]
BANS              0
ROSTER        Mod A    2026-04-01
```
This is 4 data rows at 24px each = 96px. The equivalent prose is typically
80-120px of unparseable narrative. The data format is denser AND faster to parse.

**Problem 3 -- The Lookalikes section (sec8) likely renders a list of usernames
with no columnar alignment.** Without seeing the runtime render, the section
contract (`buildUserSections` via adapter registry) produces HTML elements.
If lookalikes are rendered as `<li>` items with sentence-style text they will
be un-scannable. Bloomberg convention: lookalike table should be at minimum
`username | similarity% | join-date | status` in a fixed-column ledger.

**Problem 4 -- The drawer width (`min(480px, 40vw)`) on a 1080p monitor is 432px.**
This is wider than the popup itself (380px). The extra width is used for prose
sections that do not benefit from the extra 52px. In a ledger layout the extra
width would allow an additional data column. The current width wastes the space.

**Problem 5 -- Custom scrollbar is absent from drawer body.**
`.gam-drawer-body` has `flex: 1; overflow-y: auto` with no `scrollbar-width: thin`.
UIUX-02 flagged this as P2-E.1. In a dense drawer the scrollbar competes with
content for horizontal space if it is OS-default width (15-17px on Windows).

**Scoring: 4/10.** (-2: prose layout instead of ledger rows, -2: section header
over-sizing, -1: scrollbar width competition, -1: width underutilized.)

---

## B. Spacing Rhythm (4/8/12/16 Grid Validation)

The CSS declares the 4/8/12/16 grid in the file header comment at `popup.css:10`.
Validation against actual values in the Bloomberg override layer:

| Token | Value | Grid-compliant? | Notes |
|---|---|---|---|
| `--bb-s1` | 2px | NO -- off-grid | Used for minor spacing (delta margin-top). Acceptable as a half-grid step but creates perceptible misalignment when mixed with 4px values nearby. |
| `--bb-s2` | 4px | YES | |
| `--bb-s3` | 6px | NO -- off-grid | Used frequently in padding rules. 6px is the most-violated off-grid value. |
| `--bb-s4` | 8px | YES | |
| `--bb-s5` | 12px | YES | |
| `--bb-s6` | 16px | YES | |
| `--bb-s7` | 24px | YES | |
| Crawl sep height | 20px | NO | |
| Crawl pill min-height | 28px | NO | |
| Drill row padding | 6px / 12px | 6px off-grid | |
| KPI tile padding | 6px / 4px | 6px off-grid | |
| Maint action row pad | 4px / 8px | YES | |
| Card header pad | 8px / 12px 8px / 14px | 14px off-grid | |
| Maint cat-head pad | 6px / 8px / 4px | 6px off-grid | |
| QA button pad | 4px / 6px | 6px off-grid | |

**6px is the primary off-grid offender.** It appears in 7 distinct rules. The
design intent is "between 4px (tight) and 8px (standard)" -- but 6px is not a
grid step. Every use of 6px should be either 4px (tight) or 8px (standard).

**14px is a secondary offender.** Used for left-padding on card headers and card
bodies to clear the 2px amber rail. The intent is 12px body + 2px rail = 14px
effective offset. This is correct conceptually but off the literal grid. Alternative:
use `padding-left: 12px; margin-left: 2px` to keep padding on-grid.

**Off-grid counts:**
- On-grid values: `--bb-s2` through `--bb-s7` are all multiples of 4. 10 rules.
- Off-grid values: 2px, 6px, 14px, 20px, 28px. 15+ rule instances.
- Verdict: the spacing grid is 40% off-grid across the codebase.

**Recommended action:** Replace all `6px` instances with `8px` (expand) or `4px`
(compress) depending on context. Replace `14px` card body left-pad with
`padding-left: 12px` + `margin-left: 2px` pattern. Raise `28px` crawl pill
min-height to `32px` (next grid step). Lower `20px` sep height to either `16px`
or raise to `24px` matching the pill height.

---

## C. Density-vs-Clarity Score Per Surface

Scoring: 1-10. 10 = optimal Bloomberg ledger density (maximum information per pixel
without readability cost). 1 = placeholder/empty. 5 = neutral (SaaS-default, neither
dense nor sparse). Scores above 7 are "ship-ready." Below 5 requires redesign.

| Surface | Density Score | Clarity Score | Overall | Verdict |
|---|---|---|---|---|
| Stats grid | 9 | 9 | 9.0 | Ship-ready. Minor: empty 8th slot asymmetry. |
| Drill rows (SUS) | 5 | 7 | 6.0 | Acceptable but fixable: timestamp column wastes 35px, pill width varies. |
| DR popover bands | 6 | 6 | 6.0 | Missing row-banding; countdown demoted. |
| Maintenance 4-card | 7 | 8 | 7.5 | Good structure, 3 fixable dimension issues. |
| Intel Drawer | 4 | 5 | 4.5 | Requires rework: prose -> ledger, section header shrink, scrollbar. |

---

## D. Specific Densification or Spacing-Out Recommendations

Ordered by impact (most impactful first).

---

### D.1 Intel Drawer: Convert prose sections to ledger rows [HIGH IMPACT]

Replace all narrative text blocks in drawer sections with labeled data rows.
Each row: `[LABEL 12-char fixed] [VALUE right-aligned] [UNIT/META 8px dim]`.

Target per-row height: 24px (4px top + 16px line-height + 4px bottom).
Six sections, average 4 data rows each = 24 * 24px = 576px of dense data in the
same space as 6 prose paragraphs of 80-120px each.

This is the highest-yield density change in the entire system.

**Effort:** HIGH. Requires modifying `buildUserSections()` in `modtools.js` to
render structured rows instead of prose. Each section's data contract must be
confirmed. Estimate: 4-6 hours.

---

### D.2 Intel Drawer: Shrink section headers [HIGH IMPACT]

Current estimated: ~30px per section header. Target: 18px (4px top + 10px text +
4px bottom). Savings: 12px x 6 sections = 72px recovered for data.

```css
/* In modtools.js GAM_CSS block */
.gam-drawer-section > h3 {
  font: 600 9px/1 var(--bb-font) !important;
  text-transform: uppercase !important;
  letter-spacing: 0.1em !important;
  color: var(--bb-ink-faint) !important;
  padding: 4px 12px 2px !important;
  border-bottom: 1px solid var(--bb-line) !important;
  margin: 0 !important;
}
```

**Effort:** LOW. Pure CSS. 15 minutes.

---

### D.3 Drill rows: Fix timestamp column and pill min-width [MEDIUM IMPACT]

Two CSS changes, no HTML changes:

```css
/* Fix 1: Timestamp column from 90px to 72px */
.pop-drill-row {
  grid-template-columns: 72px 1fr auto;
}

/* Fix 2: Status pill min-width to prevent column drift */
.pop-drill-pill {
  min-width: 48px;
  text-align: center;
}
```

Recovers ~18px of label width per row. Eliminates pill-column horizontal jitter.

**Effort:** LOW. 10 minutes.

---

### D.4 DR drill: Add row-background banding by state [MEDIUM IMPACT]

In the drill render JS (`renderDrillDown()` or equivalent), add `data-dr-status`
attribute to rows based on their death-row state. Then in CSS:

```css
.pop-drill-row[data-dr-status="ready"] {
  background: var(--bb-red-bg) !important;
}
.pop-drill-row[data-dr-status="ready"]:hover {
  background: rgba(255,59,59,0.18) !important;
}
.pop-drill-row[data-dr-status="scheduled"] {
  background: var(--bb-purple-bg) !important;
}
```

This makes DR state pre-attentively scannable (eye does not need to travel to
pill column to determine urgency).

**Effort:** LOW-MEDIUM. CSS is trivial. JS requires identifying the right data
field in the DR drill render path. 30-45 minutes.

---

### D.5 Spacing: Replace all 6px values with 4px or 8px [MEDIUM IMPACT]

Audit every `var(--bb-s3)` usage and every literal `6px` value in `popup.css`.
Decide per-context:
- If the surrounding elements use 4px, replace with 4px (tighten).
- If the surrounding elements use 8px, replace with 8px (standardize).
- Never use 6px as a deliberate mid-step.

Affected rules confirmed: drill row padding top/bottom, KPI tile padding top,
maintenance cat-head padding, QA button padding.

**Effort:** LOW. Mechanical find-replace with context judgment. 30 minutes.

---

### D.6 Maintenance: Reduce inter-card gap from 8px to 4px [LOW IMPACT]

```css
/* popup.css: .gam-card margin */
.gam-card {
  margin: 0 0 4px 0 !important; /* was 8px */
}
```

On 4 maintenance cards this recovers 16px. The amber left rail already provides
hard visual separation between cards; the 8px gap is redundant air.

**Effort:** LOW. 1 line change. 5 minutes.

---

### D.7 Maintenance: Match button height to action row height [LOW IMPACT]

```css
/* popup.css: button inside action row */
.pop-maint-action-row .pop-btn {
  min-height: 32px !important; /* was 28px -- matches row min-height */
}
```

Removes phantom 2px vertical gap between button and row container.

**Effort:** LOW. 1 line change. 5 minutes.

---

### D.8 Safe Mode toggle: Expand to Bloomberg binary switch proportions [LOW IMPACT]

The inline `width:32px; height:16px` toggle is below minimal perceptibility for
a binary control in a dense terminal. Expand to `40x20` with `16px` thumb.

This requires updating the inline `style` on `#safeModeToggleTrack` and
`#safeModeToggleThumb` in `popup.html`. No CSS class change (the toggle uses
inline styles exclusively).

**Effort:** LOW. HTML-only, 2 attribute changes. 10 minutes.

---

### D.9 Stats grid: Fill or rationalize the empty 8th-slot asymmetry [LOW IMPACT]

The 3x3 grid (8 tiles) leaves the bottom-right cell empty. Two options:
- **Option A:** Promote a useful 9th metric (e.g., "Token Age" in days) to fill
  the slot. This creates a symmetric 3x3 grid.
- **Option B:** Change the grid to `repeat(4, 1fr)` for the top row and
  `repeat(4, 1fr)` for the bottom row, giving 4-column layout with 8 tiles
  perfectly filling 2 rows. This is denser and eliminates the asymmetry.

Option B is preferred (Bloomberg terminals use 4-column ledger layouts for stats).

**Effort:** LOW-MEDIUM. CSS grid change + confirm 4-col layout fits 380px. 30 min.

---

### D.10 Drill rows: Eliminate always-rendered empty snippet divs [LOW IMPACT]

In the JS that renders `.pop-drill-row` elements, add a guard:
```js
// Only append snippet row if content exists
if (snippetText && snippetText.trim()) {
  const snippet = document.createElement('div');
  snippet.className = 'col-snippet';
  snippet.textContent = snippetText;
  row.appendChild(snippet);
}
```

This eliminates 2px phantom height on empty snippet rows, making row heights
consistent across the drill table.

**Effort:** LOW. JS-only, 4-5 lines. 15 minutes.

---

## E. Effort Summary

| Ref | Description | Effort | Impact | Priority |
|---|---|---|---|---|
| D.1 | Intel Drawer: prose -> ledger rows | HIGH (4-6h) | HIGH | P1 |
| D.2 | Intel Drawer: shrink section headers | LOW (15min) | HIGH | P1 |
| D.3 | Drill rows: timestamp col + pill min-width | LOW (10min) | MEDIUM | P2 |
| D.4 | DR drill: row banding by state | LOW-MED (45min) | MEDIUM | P2 |
| D.5 | Replace all 6px spacing with 4/8px | LOW (30min) | MEDIUM | P2 |
| D.6 | Maintenance: inter-card gap 8->4px | LOW (5min) | LOW | P3 |
| D.7 | Maintenance: button height = row height | LOW (5min) | LOW | P3 |
| D.8 | Safe Mode toggle: expand to 40x20 | LOW (10min) | LOW | P3 |
| D.9 | Stats grid: fill empty 8th slot | LOW-MED (30min) | LOW | P3 |
| D.10 | Drill: remove empty snippet divs | LOW (15min) | LOW | P3 |

**Total P1:** 4.5-6.5 hours (Intel Drawer is the heavy lift)
**Total P2:** 1.5 hours
**Total P3:** 1 hour

**Recommended sprint sequence:**
1. D.2 (15 min, free density win before the full D.1 rework)
2. D.3 + D.10 (25 min, drill table fixes are self-contained)
3. D.5 (30 min, grid hygiene)
4. D.4 (45 min, DR banding)
5. D.6 + D.7 + D.8 (20 min, maintenance polish)
6. D.1 (4-6h, Intel Drawer ledger rework -- own session)
7. D.9 (30 min, stats grid 4-col layout -- own session)

---

*End of UIUX2-22 -- Density Audit. Read-only amber canonical. No production files modified.*
