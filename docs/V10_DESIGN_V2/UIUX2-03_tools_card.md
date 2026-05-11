# UIUX2-03 -- Tools Card V2 Design Spec
## GAW ModTools v10.13 -- Bloomberg Terminal Popup (380px)

**Status:** Design Proposal (read-only amber canonical)
**Agent:** UIUX2-03-TOOLS-CARD
**Date:** 2026-05-10
**Scope:** `popup.html` card-tools section + `popup.css` Bloomberg override layer
**Canonical width:** 380px popup, 12px horizontal padding = 356px usable
**Prior v1:** `docs/V10_DESIGN/UIUX-04_tools_card.md`

---

## A. What v10.12.0 Shipped (State As-Implemented)

v10.12.0 executed the structural skeleton of UIUX-04 faithfully. These changes
landed in production code:

**A.1 Card boundary CSS -- `popup.css:1461`**
`.gam-card` got `border: 1px solid var(--bb-line-hot)`, a 2px amber left rail
via `::before`, `margin: 0 0 8px 0`. Cards are now visually separated panels.
The hover-thicken (rail 2px -> 4px at `popup.css:1489`) is present.

**A.2 Non-details header variant -- `popup.css:1596`**
v10.12 converted `<details>` cards to permanent `<div>` panels (UIUX-01 §D).
A new `.gam-card-header` rule (`display:flex; padding:8px 12px 8px 14px;
border-bottom:1px solid var(--bb-line-hot)`) serves the div-header case.
This coexists with the older `.gam-card-head` summary rule at `popup.css:1502`.
Two classes, same visual output -- not yet consolidated.

**A.3 Diagnostics 2-col grid -- `popup.html:230`, `popup.css:1642`**
`.gam-card-grid2` is a 2-col CSS grid. Buttons are `min-height:36px`,
left-aligned, `font-size:10px`, `gap:5px`. Both Diagnostics buttons land here.
Emoji prefixes (`&#x1F9EA;` beaker, `&#x1F4CA;` bar chart) retained from v10.11.

**A.4 Segmented crawl row -- `popup.html:241`, `popup.css:1659`**
`.gam-crawl-row` is a flex row. Two `.gam-crawl-group` blocks separated by
`.gam-crawl-sep` (1px vertical rule, height:20px). Crawl pills are
`min-height:28px`, `min-width:36px`, `text-align:center`. Depth differentiation
via `[data-depth="quick"]` (muted) and `[data-depth="deep"]` (amber accent).

**A.5 Sub-section structure -- `popup.html:228`, `popup.css:1611`**
`.gam-card-subsection` separators are live: dashed top border, `padding:6px 8px
4px`, first-child override strips the border.

**A.6 Sub-label meta span -- `popup.html:239`**
`crawlStatusLabel` span is in the DOM inside `.gam-card-sub-label`. JS
population of last-crawl timestamp is a pending wire-up (not confirmed landed).

---

## B. What Is Still Rough -- Six Remaining Failures

This section audits v10.12.3 state against Bloomberg-density requirements,
accessibility minimums, and UIUX-04 intent.

**B-1. Diagnostics buttons carry emoji instead of Bloomberg terminal glyphs.**
`popup.html:231-232`: `&#x1F9EA; Debug snapshot` and `&#x1F4CA; Dashboard`.
Emoji are font-rasterized at popup DPI, inconsistent across OS emoji sets, and
do not respond to `color` CSS. Bloomberg convention is ASCII or Unicode symbol
characters (e.g., `[=]`, `[#]`, or dedicated SVG icon span). At 10px cell
height the emoji bloats the left gutter and misaligns with the label baseline.
Rule violation: `no-emoji-icons` (ui-ux-pro-max Priority 4).

**B-2. Crawl pill tap targets are below minimum at 28px min-height.**
`popup.css:1689`: `.gam-crawl-pill { min-height:28px }`. WCAG 2.5.8 and
ui-ux-pro-max Priority 2 (`touch-target-size`) require 44x44px minimum for
primary interactive elements. A 28px-tall pill in a 380px popup is
finger-unfriendly. Even with `hitSlop` unavailable in HTML extensions, the
tap target must be at least 36px tall (acceptable minimum for a secondary
segmented-control variant inside a dense terminal UI) and explicitly tracked
as a known accessibility compromise.

**B-3. The `.gam-card-body` padding creates a double-indent trap for
`.gam-card-subsection` inner content.**
`popup.css:1564`: `.gam-card-body { padding: 8px 12px 8px 14px }`.
Inside, `.gam-card-subsection { padding: 6px 8px 4px }`. This means
horizontal content within a subsection is indented 14px (body) + 8px (subsection)
= 22px from card edge, while the card itself already sits inside the
`tab-panel` with 0px outer margin. Combined with the 2px amber rail, effective
left offset from popup edge = 2px rail + 14px body pad + 8px subsection pad =
24px. The `.gam-card-grid2` buttons then receive another `padding:4px 8px`
from `popup.css:1650`. Total left text offset from popup edge = 32px.
Bloomberg terminal cells are typically 12px inset -- this is nearly 3x.
The grid buttons look pulled away from their card rail.

**B-4. `.gam-crawl-row` padding is `4px 0` (subsection owns the horizontal),
but the vertical separator height (20px) is shorter than the tallest pill.**
`popup.css:1663-1682`: crawl-row has no padding-top compensation.
`gam-crawl-sep` is 20px height, `.gam-crawl-pill` is `min-height:28px`.
The separator is 8px shorter than the pills it divides, breaking the visual
alignment: the 1px rule ends mid-pill instead of spanning the full row height.
This is a cosmetic regression from the v1 mockup which showed the separator
spanning the full crawl row.

**B-5. `card-badge-tools` is `style="display:none"` with no population logic
confirmed in JS.**
`popup.html:224`: `<span class="gam-card-badge" id="card-badge-tools"
style="display:none">`. The badge was designed (v1 §B) to show a
`[2]` action-count. In practice it is permanently hidden with no JS wiring
observed in the scope of this audit. A permanently hidden badge slot wastes
DOM, confuses future devs, and fails the intent of the "ambient orientation"
goal. Either wire it or remove it.

**B-6. Sub-label type hierarchy is ambiguous: card title and sub-label both
use the same font-weight (700 vs 600) at adjacent sizes (10px vs 9px) with
the same amber color family.**
`popup.css:1521`: `.gam-card-title { font: 700 10px ... color: var(--bb-amber) }`.
`popup.css:1624`: `.gam-card-sub-label { font: 600 9px ... color: var(--bb-amber-dim) }`.
`--bb-amber` and `--bb-amber-dim` are similar amber tones. At 380px popup
scale, 10px vs 9px with weight 700 vs 600 is a 1px and 1-step-weight
difference. On a dark background at extension popup DPI these two levels
are visually indistinguishable without close reading. Bloomberg terminal
practice is to separate hierarchy tiers by at least 2px or by color
category (amber vs white vs dimmed), not by fractional size + weight
within the same amber family.

---

## C. Visual Mockup (v2 Target State)

Width = 380px. Usable = 356px (12px pad each side). All measurements in px.
Left amber rail = 2px. Content starts at 14px from card edge.

```
╔════════════════════════════════════════╗  <- 1px bb-line-hot border
||  TOOLS                          [2]   ||  <- .gam-card-header: amber title
╠════════════════════════════════════════╣  <- 1px bb-line-hot border-bottom
||                                       ||
||  DIAGNOSTICS                          ||  <- sub-label: amber-dim 9px 600
||  ┌──────────────────┬───────────────┐ ||
||  │ [=] DEBUG SNAP   │ [#] DASHBOARD │ ||  <- 2-col grid, min-h 36px
||  └──────────────────┴───────────────┘ ||
||  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌  ||  <- dashed subsection separator
||  DATA HARVEST  · last: 14m ago        ||  <- sub-label + meta span
||  /USERS [x10] [x30]  |  /QUEUE [x5]  ||  <- crawl row, sep spans full height
||  [crawl status text if active]        ||  <- crawlStatus pop-token-status
||                                       ||
╚════════════════════════════════════════╝
```

Action grid (above card-tools, in Stats tab panel -- unchanged):
```
 ┌────────┬────────┬────────┬────────┐
 │  [U]   │  [Q]   │  [B]   │  [G]   │
 │ USERS  │ QUEUE  │  BAN   │  GAW   │  <- .pop-actions 4-col grid (existing)
 └────────┴────────┴────────┴────────┘
```

---

## D. CSS Specification (delta from v10.12.3)

All rules append to the Bloomberg override layer after the existing
`v10.12 UIUX-04 §D` block at `popup.css:1607`. No existing rules deleted.

### D.1 Fix double-indent: subsection horizontal padding override

The problem (B-3): body pad 14px + subsection pad 8px = 22px horizontal offset.
Fix: `.gam-card-subsection` gets `padding-left: 0; padding-right: 0` and
the sub-label / grid / crawl-row own their 4px inner margin.

```css
/* UIUX2-03 D.1 -- collapse double-indent on subsections inside card-tools */
#card-tools .gam-card-subsection {
  padding-left: 0 !important;
  padding-right: 0 !important;
}
/* Sub-label keeps 4px right buffer, no left (body owns 14px) */
#card-tools .gam-card-sub-label {
  padding-right: 4px;
}
```

### D.2 Fix crawl separator height to span full pill row

```css
/* UIUX2-03 D.2 -- sep spans full pill height (was 20px, pills are 28px+) */
.gam-crawl-sep {
  height: 28px !important;
  align-self: center;
}
```

### D.3 Raise crawl pill tap target to accessible minimum (36px)

28px -> 36px. Still below 44px WCAG ideal but the maximum achievable without
breaking Bloomberg density. Document as known compromise with `title` tooltip
confirmation providing label backup.

```css
/* UIUX2-03 D.3 -- raise pill tap target; comment documents a11y tradeoff */
/* NOTE: 36px is a Bloomberg-density compromise. Ideal WCAG min is 44px.   */
/* Mitigated by: tooltip on all pills, keyboard reachable, label visible.  */
.gam-crawl-pill {
  min-height: 36px !important;
  padding: 4px 8px !important;   /* was 3px 6px */
}
```

### D.4 Diagnostics button: replace emoji with terminal-safe ASCII symbols

This is a CSS-targeted fix using the `content` trick on `::before` to override
emoji rendering. The emoji chars in HTML remain for fallback but are hidden;
a `::before` pseudo-element injects the terminal glyph.

Alternatively (preferred): update HTML directly in E.1 below.
The CSS-only approach is noted here as the zero-HTML-change fallback.

```css
/* UIUX2-03 D.4 -- Diagnostics buttons: terminal glyphs replace emoji.
   Applied only if HTML is NOT updated per E.1. Remove these rules when
   E.1 HTML update is shipped. */
#debugBtn { font-size: 10px !important; }
#dashBtn  { font-size: 10px !important; }
/* The emoji strings below are from popup.html:231-232 */
/* Override approach: wrap label in a <span> in E.1 instead of CSS hack */
```

### D.5 Sub-label hierarchy: differentiate Tools sub-label from card title

Use white (ink-bright) for card title and amber-dim for sub-label to create a
color-category break (not just size/weight).

```css
/* UIUX2-03 D.5 -- card-tools sub-label uses ink color, not amber family,
   to create unmistakable hierarchy separation from the amber card title.
   Applies only to card-tools to avoid cascade on other cards. */
#card-tools .gam-card-sub-label {
  color: var(--bb-ink-dim) !important;
  font-weight: 700 !important;
  letter-spacing: 0.12em !important;
}
```

### D.6 Wire the badge slot or remove it

If badge is confirmed unwired, remove the DOM node in E.1.
If wired: the existing `.gam-card-badge` CSS at `popup.css:1534` is correct.
No new CSS needed -- just remove `style="display:none"` in HTML.

---

## E. HTML Specification (delta from v10.12.3)

Reference: `popup.html:219-256`

### E.1 Full card-tools replacement

Changes from current:
- Emoji on Diagnostics buttons replaced with ASCII terminal prefix spans
- `card-badge-tools` badge slot: set to show a static `[2]` (Diagnostics + Data Harvest count) OR removed if JS wiring is not planned this sprint
- Button `title` attributes extended with actionable context
- Crawl pills: `&times;` replaced with literal `x` for monospace clarity
- Crawl pill `title` attributes standardized to SCREAMING_CAPS terminal style

```html
<div id="tab-panel-tools" role="tabpanel" aria-labelledby="tab-btn-tools">
<!-- v10.13 UIUX2-03: double-indent fix, emoji->ASCII, sep height, badge wire/remove -->
<div class="gam-card" id="card-tools" data-tab="tools">
  <div class="gam-card-header">
    <span class="gam-card-title">Tools</span>
    <!-- Remove badge if unwired; or remove style="display:none" if wired to JS -->
    <!-- OPTION A (remove): delete the next line entirely -->
    <!-- OPTION B (wire): remove style="display:none" and populate via JS -->
    <span class="gam-card-badge" id="card-badge-tools" style="display:none"></span>
  </div>
  <div class="gam-card-body">

    <!-- Diagnostics sub-section -->
    <div class="gam-card-subsection">
      <div class="gam-card-sub-label">Diagnostics</div>
      <div class="gam-card-grid2">
        <button id="debugBtn" class="pop-btn pop-btn-ghost"
                title="DEBUG SNAPSHOT -- Capture full token state, storage keys, SW status to clipboard">
          <span class="pop-btn-icon" aria-hidden="true">[=]</span>
          <span>Debug snapshot</span>
        </button>
        <button id="dashBtn" class="pop-btn pop-btn-ghost"
                title="DASHBOARD -- Live stat counters, firehose health, AI budget overlay">
          <span class="pop-btn-icon" aria-hidden="true">[#]</span>
          <span>Dashboard</span>
        </button>
      </div>
    </div>

    <!-- Data harvest sub-section -->
    <div class="gam-card-subsection">
      <div class="gam-card-sub-label">
        Data Harvest
        <span class="gam-card-sub-label-meta" id="crawlStatusLabel"></span>
      </div>
      <div class="gam-crawl-row">
        <div class="gam-crawl-group">
          <span class="gam-crawl-label">/USERS</span>
          <button class="pop-btn pop-btn-ghost gam-crawl-pill crawl-btn"
                  data-section="users" data-pages="10" data-depth="quick"
                  title="USERS QUICK -- 10 pages (~200 accounts). Fast baseline scan.">
            x10
          </button>
          <button class="pop-btn pop-btn-ghost gam-crawl-pill crawl-btn"
                  data-section="users" data-pages="30" data-depth="deep"
                  title="USERS DEEP -- 30 pages (~600 accounts). Full roster analysis.">
            x30
          </button>
        </div>
        <div class="gam-crawl-sep" aria-hidden="true"></div>
        <div class="gam-crawl-group">
          <span class="gam-crawl-label">/QUEUE</span>
          <button class="pop-btn pop-btn-ghost gam-crawl-pill crawl-btn"
                  data-section="queue" data-pages="5" data-depth="quick"
                  title="QUEUE CRAWL -- 5 pages (~100 pending items).">
            x5
          </button>
        </div>
      </div>
      <div id="crawlStatus" class="pop-token-status"
           style="margin-top:4px;font-size:10px"></div>
    </div>

  </div><!-- /.gam-card-body tools -->
</div><!-- /#card-tools -->
```

### E.2 Pop-actions grid (`.pop-actions`) -- no structural change

The 4-col action grid (Users/Queue/Ban/GAW) at `popup.html:180-205` is
correctly implemented per UIUX-04 §B and current CSS at `popup.css:103`.
`min-height:44px` tap targets confirmed. No change required in v2.

One cosmetic note: the `pop-btn-primary` modifier on Users button
(`popup.html:182`) signals primary action visually -- correct per
`primary-action` guideline (one primary CTA per section). Preserved as-is.

---

## F. Accessibility Audit

Applying ui-ux-pro-max Priority 1-2 rules to card-tools at 380px.

| Check | Current state | v2 target | Rule |
|---|---|---|---|
| Crawl pill tap target | 28px min-height | 36px (D.3) | touch-target-size |
| Diagnostic button tap target | 36px min-height | 36px (unchanged) | touch-target-size |
| Pop-actions tap target | 44px min-height | 44px (unchanged -- correct) | touch-target-size |
| Crawl pill `title` attributes | Present, sentence-case mixed | Screaming-caps terminal style (E.1) | aria-labels |
| Diagnostic button `title` attrs | Absent (popup.html:231-232) | Added (E.1) | aria-labels |
| `.gam-crawl-sep` aria-hidden | Absent | Added `aria-hidden="true"` (E.1) | keyboard-nav |
| Emoji in button text | `&#x1F9EA;` `&#x1F4CA;` (html:231-232) | `[=]` `[#]` ASCII spans (E.1) | no-emoji-icons |
| Focus ring on buttons | Inherited from `.pop-btn-ghost` | Confirm `outline:2px solid var(--bb-amber)` on `:focus-visible` | focus-states |
| Color-only depth signaling on crawl pills | `[data-depth="deep"]` amber vs muted | Amber + `x30` text prominence -- two cues | color-not-only |

**Known accessibility compromise:**
Crawl pills at 36px height remain below the 44px WCAG 2.5.8 target.
Justification: Bloomberg terminal constraint at 380px popup. Mitigation:
keyboard-reachable (Tab order), `title` tooltip on each pill, label text
(`/USERS x10`) is visually distinct (two cues: position + count).
This tradeoff must be documented in the card-tools HTML comment.

---

## G. Effort Estimate

| Work item | Complexity | Files touched | Time |
|---|---|---|---|
| D.1 Double-indent fix (2 CSS rules, scoped to #card-tools) | Low | popup.css | 10 min |
| D.2 Sep height fix (1 override rule) | Low | popup.css | 5 min |
| D.3 Pill tap-target raise (min-height + padding override) | Low | popup.css | 5 min |
| D.5 Sub-label color-category fix | Low | popup.css | 5 min |
| E.1 HTML card-tools replacement (emoji -> ASCII, title attrs, badge decision) | Low | popup.html | 20 min |
| Badge decision (wire vs remove -- requires popup.js check) | Low | popup.js + popup.html | 15 min |
| Regression: crawl buttons still fire correct JS handlers | Low | manual verify | 10 min |
| **Total** | | | **~70 min** |

### Risk flags

**R-1 (LOW):** D.1 scopes to `#card-tools` selector, preventing cascade to
other cards' subsections. Verify no other card uses `.gam-card-subsection`
with content that relied on the 8px inner padding for its own grid alignment.
Check: `card-maint-*` cards use `.pop-maint-action-row` not `.gam-card-grid2`
-- safe.

**R-2 (LOW):** D.3 raises pill min-height from 28px to 36px. The crawl row
flex container uses `align-items:center` (`popup.css:1661`) -- pills will
grow taller and center-align. Separator at 28px (D.2 raises to 28px first,
then D.3 raises pills to 36px, requiring D.2 to match 36px). Adjust D.2
to `height: 36px` to track D.3.

**R-3 (NONE):** E.1 preserves all button IDs (`debugBtn`, `dashBtn`,
`crawl-btn` class, `data-section`, `data-pages`, `data-depth` attributes).
No JS handler changes needed.

**R-4 (WATCH):** The `[=]` and `[#]` ASCII icon spans will render in the
`var(--bb-font)` monospace family -- they read as Bloomberg terminal markers.
At 10px `font-size` (grid button size) they will be small but legible on
Retina/HiDPI. Verify on 1x display (non-retina) that `[=]` does not look
like a broken HTML entity.

---

## H. What Is Not Changing (Scope Boundary)

The following are confirmed out of scope for UIUX2-03 and explicitly preserved:

- **`.pop-actions` 4-col grid** (Users/Queue/Ban/GAW): correct as-is.
  Tap targets 44px, icon-above-label, Bloomberg dense. No change.
- **`gam-card-grid2` base rules** (`popup.css:1642`): correct. D.1 scopes
  the fix to `#card-tools` only.
- **`.gam-crawl-pill[data-depth]` color rules** (`popup.css:1694`): correct.
  Depth signaling via color is good; preserved. D.3 adds height only.
- **Maintenance cards** (`#card-maint-*`): UIUX2-05 scope.
- **Macros card** (`#card-macros`): UIUX2-06 scope.
- **Tokens card, Lead card**: separate agent scopes.
- **JS logic** for `crawlStatusLabel` population, macro count badge,
  `crawlStatus` display: existing behavior unchanged. Only the badge visibility
  decision (wire vs remove) touches JS minimally and is flagged as a decision
  gate in E.1.

---

*End of UIUX2-03 -- Tools Card V2. Read-only amber canonical. No production files modified.*
