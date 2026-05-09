# Frontend 1 — Visual Consistency Audit

> Scope: `dist/mod-tools dist/popup.css`, `popup.js`, `popup.html`, `modtools.js`
> Baseline: V11_R2_CAT3_UX_UI items B.2, B.3, item #19 (no-gradient rule)

---

## A. AMBER DEDUP

Three distinct amber hex values are in active use. `#f5a623` does **not** appear anywhere in the codebase — the V11_R2_CAT3 item B.3 claim is stale or mis-recorded.

### Values found

| Value | Meaning as used | File:line samples |
|---|---|---|
| `#ff9933` | Primary amber — borders, labels, CTA backgrounds, status text | popup.css:657 (`--bb-amber`), popup.html:281/290/299, popup.js:498/543/583/1858/1898/3552/3554/3848–3873/3932–3935, modtools.js:6014/6019/7368/7406/7422/8138/8152/8168/13125–13136/14064–14065/14425/14463/14506/14534/14539/14544/14565/14641/14647/16600 |
| `#f0a040` | Warn amber — WARN status color, note pills, age indicators, console highlights | popup.css:8/532/575/585/598/600/633, popup.js:1050/3606, modtools.js:86/5986/5993/9659/11058 |
| `#cc7722` | Amber-dim — dimmed borders, hover states, scrollbar | popup.css:658 (`--bb-amber-dim`), modtools.js:16601 |

### The real problem

`#ff9933` and `#f0a040` are treated as interchangeable in JS-generated inline styles and the legacy pre-Bloomberg CSS block (popup.css lines 1–648). Bloomberg-block CSS (popup.css:649+) already canonicalizes both via `--bb-amber: #ff9933` and its WARN color `#f0a040` is explicitly in the palette comment (popup.css:8). The issue is **JS inline styles hard-code `#ff9933` instead of referencing the CSS variable**, meaning a future token swap won't propagate.

### Canonical variable mapping

```
--bb-amber:     #ff9933   /* primary: borders, CTA, hot labels */
--bb-amber-dim: #cc7722   /* dimmed: hover borders, scrollbar thumb */
--bb-amber-bg:  rgba(255,153,51,0.10)  /* tinted region backgrounds */
--bb-warn:      #f0a040   /* secondary: WARN status, note pills, non-CTA text */
```

`--bb-warn` is the missing variable. It exists as a named constant `C.WARN = '#f0a040'` in modtools.js:86 and as a palette comment in popup.css:8 but has no CSS custom property in either Bloomberg-block `:root`. Every hard-coded `#f0a040` in CSS should reference `--bb-warn`; every JS inline style using either hex should use the closest semantic variable.

### Affected files for `#f0a040` CSS occurrences (no variable reference)

- `popup.css:532` `.pop-drill-pill.note { color: #f0a040; }` — 6 occurrences lines 532–633
- `popup.css:575` `.pop-maint-status.warn`
- `popup.css:585/598/600` `.pop-maint-banner` and its border
- `popup.css:633` `.pop-maint-roster-row .age.yellow`

---

## B. GRADIENT VIOLATION (popup header)

Two gradient violations in `popup.css`. The no-gradient rule (Cat 3 item #19) requires flat backgrounds with a 2px amber bottom border.

### Violation 1 — `.pop-header` (line 35, the primary violation)

```css
/* popup.css:30-37 — CURRENT (VIOLATES no-gradient rule) */
.pop-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: linear-gradient(180deg, #181b20 0%, #0c0e12 100%);
  border-bottom: 1px solid #2a2f38;
}
```

The Bloomberg-block override at popup.css:731-741 partially corrects this — it resets `.pop-header` to `background: var(--bb-bg)` and `border-bottom: 1px solid var(--bb-line-hot)`. However the bottom border is only 1px (var(--bb-line-hot) = `#3d3a35`), not the 2px amber border called for by item #19.

**Fix — replace the legacy block AND tighten the Bloomberg override:**

```css
/* popup.css:30-37 — REPLACE WITH */
.pop-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #0c0e12;
  border-bottom: 2px solid #ff9933;
}
```

And at popup.css:731-741 Bloomberg override block:

```css
/* popup.css:731-741 — REPLACE the border-bottom line */
.pop-header,
.pop-brand,
header.pop-header {
  background: var(--bb-bg) !important;
  border-bottom: 2px solid var(--bb-amber) !important;  /* was: 1px solid var(--bb-line-hot) */
  border-radius: 0 !important;
  padding: var(--bb-s4) var(--bb-s5) !important;
  font: 600 var(--bb-t-sm)/1.2 var(--bb-font) !important;
  color: var(--bb-amber) !important;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
```

### Violation 2 — `.pop-drill-head` (line 434, secondary)

```css
/* popup.css:428-435 — CURRENT */
.pop-drill-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #2a2f38;
  background: linear-gradient(180deg, #1c2028 0%, #181b20 100%);
}
```

**Fix:**

```css
/* popup.css:428-435 — REPLACE WITH */
.pop-drill-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #181b20;
  border-bottom: 2px solid var(--bb-amber);
}
```

### Gradient uses that are EXEMPT

- `popup.css:222-223` — CSS mask-image for macro row fade-out. Masks are not visual backgrounds; this is a UX affordance, not a decorative gradient. Keep.
- `modtools.js:15729` — `.gam-modal-header` gradient injected into page CSS. Separate surface from popup, warrants its own audit pass. Flag for Frontend 2/3.
- `modtools.js:16432` — `.gam-update-banner` red gradient. Update banners are alert state, not standard UI. Acceptable.
- `modtools.js:3924` — skeleton shimmer. Functional animation, not decorative. Exempt.
- `modtools.js:19733` — toast badge gradient. One-off toast, not a recurring surface. Flag as low priority.

---

## C. SANS/MONO SPLIT

### Current state

The popup has **two simultaneous font stacks** due to layered CSS blocks:

**Legacy block (popup.css:26):**
```css
html, body {
  font: 12px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}
```

**Bloomberg override block (popup.css:678-685):**
```css
body {
  font: var(--bb-t-base)/1.4 var(--bb-font) !important;
  /* --bb-font = ui-monospace, "JetBrains Mono", ... monospace */
}
```

The `!important` in the Bloomberg block wins for `body`, but any element that sets `font-family: inherit` gets the resolved monospace stack. Elements that specify their own sans-serif stack explicitly (popup.css:189 `.pop-btn-ghost`, popup.css:310 `.gam-pop-modal-panel`) revert to sans-serif selectively.

**Specific split surfaces:**
1. `popup.css:189` — `.pop-btn-ghost` sets `font: 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` — **sans-serif island** in the middle of a monospace popup. These are the ghost tool buttons in the tool rows.
2. `popup.css:310` — `.gam-pop-modal-panel` sets `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` — **sans-serif island** in modals.
3. The in-page modtools.js UI uses monospace throughout via `C` color constants and the `GAM_CSS` block.

### Decision

**Go full monospace across popup.** The Bloomberg aesthetic is explicitly terminal/data-terminal. Mixed sans-serif on the ghost buttons and modal panel is inconsistency without payoff — readability at 10-12px is not meaningfully better in sans-serif, and the mismatch is visually jarring in context. The in-page modtools.js surface is already 100% monospace; popup should match.

**Surfaces to fix:**
- `popup.css:189` — remove explicit `font:` from `.pop-btn-ghost`, let it inherit via `font-family: inherit` or delete and let Bloomberg block cascade.
- `popup.css:310` — remove `font-family: -apple-system...` from `.gam-pop-modal-panel`.

**The legacy block at popup.css:26** (`html, body` sans-serif) is fully overridden by the Bloomberg `body` block with `!important`. It is dead code for body text but may affect elements that skip `body` specificity. Safe to delete entirely in the next cleanup pass; not ship-blocking tonight since the Bloomberg block overrides it.

---

## D. SPACING GRID

Declared grid: 4 / 8 / 12 / 16 / 24 / 32px (popup.css:10: `SPACING: 4 / 8 / 12 / 16 grid`). The Bloomberg token block at popup.css:670 also defines `--bb-s1:2px --bb-s2:4px --bb-s3:6px --bb-s4:8px --bb-s5:12px --bb-s6:16px --bb-s7:24px` — note `6px` is included as `--bb-s3`, so 6px is semi-sanctioned via token only, not as a raw pixel literal.

### Off-grid offenders in popup.css

| Line | Selector | Property | Value | Fix |
|---|---|---|---|---|
| 88 | `.pop-alert` | `padding: 6px 10px` | 10px horiz | `padding: 8px 12px` or `6px 8px` (grid + `--bb-s3`) |
| 108 | `.pop-btn` | `padding: 6px 12px` | 6px fine via `--bb-s3`; 12px on grid | Accept as-is |
| 129 | `.pop-btn-primary` | `padding: 7px 12px` | **7px is fully off-grid** | `padding: 8px 12px` |
| 184 | `.pop-btn-ghost` | `padding: 5px 8px` | **5px is off-grid** | `padding: 4px 8px` |
| 262 | `.pop-token input` | `padding: 5px 8px` | **5px is off-grid** | `padding: 4px 8px` |
| 306 | `.gam-pop-modal-panel` | `border-radius: 6px` | 6px via `--bb-s3` — acceptable | Accept |
| 315 | `.gam-pop-modal-title` | `margin-bottom: 6px` | 6px via `--bb-s3` — acceptable | Accept |
| 330 | `.gam-pop-modal-input` | `padding: 6px 8px` | 6px via `--bb-s3` | Accept |
| 343 | `.gam-pop-modal-btnrow` | `gap: 6px` | 6px via `--bb-s3` | Accept |
| 359/368 | `.gam-pop-modal-btn-cancel/ok` | `padding: 4px 10px` | **10px is off-grid** | `padding: 4px 8px` or `4px 12px` |
| 519 | `.pop-drill-pill` | `padding: 1px 6px` | 1px off-grid, 6px via `--bb-s3` | `padding: 2px 6px` (use `--bb-s1`) |
| 566 | `.pop-maint-row .pop-btn-ghost` | `padding: 5px 10px` | **both values off-grid** | `padding: 4px 8px` |
| 583 | `.pop-maint-chip` | `margin-left: 6px` | 6px via `--bb-s3` | Accept |

**Ship-tonight priority offenders** (raw pixel values not in any token, not 6px):
1. `popup.css:129` — `padding: 7px 12px` on `.pop-btn-primary`
2. `popup.css:184` — `padding: 5px 8px` on `.pop-btn-ghost`
3. `popup.css:262` — `padding: 5px 8px` on `.pop-token input`
4. `popup.css:359/368` — `padding: 4px 10px` on modal buttons
5. `popup.css:566` — `padding: 5px 10px` on maint row ghost buttons

---

## E. CHIP CONSISTENCY

Two distinct chip systems are in production simultaneously, serving different surfaces.

### System 1 — `.pop-drill-pill` (popup.css:516-534)

Used in the popup drill panel (user detail rows). Simple semantic approach:

- Shape: `border-radius: 3px` (square-ish)
- Size: `padding: 1px 6px`, `font-size: 9px`
- Colors: hard-coded `rgba(...)` backgrounds + hex foregrounds, no CSS variable references
- Variants: `banned`, `pending`, `dr`, `ready`, `note`, `msg`, `ban`

### System 2 — `.gam-chip` (modtools.js:15933+)

Used in the in-page drawer header (intel drawer, `gam-drawer-chips`). Semantic token approach:

- Shape: `border-radius: 10px` (pill/rounded)
- Size: `padding: 2px 8px`, `font-size: 11px`
- Colors: CSS variable references (`--chip-bg-*`, `--chip-fg-*`)
- Variants: primary state (NEW/OPEN/CLAIMED/etc.), risk, verification, ai_conf

### Divergences

| Property | `.pop-drill-pill` (popup) | `.gam-chip` (page) |
|---|---|---|
| Border radius | 3px (square) | 10px (pill) |
| Font size | 9px | 11px |
| Padding | 1px 6px | 2px 8px |
| Color refs | raw hex `#f0a040` etc. | CSS vars `--chip-fg-amber` |
| Amber value | `#f0a040` | `--chip-fg-amber: #faf089` (different!) |

The amber used inside `.gam-chip--primary.gam-chip--waiting` and `.gam-chip--risk-medium` is `--chip-fg-amber: #faf089` (modtools.js:15929) — a **yellow-amber**, not `#ff9933` or `#f0a040`. This is a third amber variant that exists only in the chip token system and is semantically different (it renders on a dark amber background `#744210`).

### Verdict

The two systems serve genuinely different surfaces and have different visual weight requirements — the popup drill pills are inline metadata labels at 9px, the drawer chips are 11px state badges at the top of a full-height panel. **Unifying border-radius and font-size is the minimum fix:** popup pills should move to `border-radius: 10px` and `font-size: 10px` (still compact but consistent pill shape). Color refs in `.pop-drill-pill.note` should reference `--bb-warn` once that variable is added.

---

## F. SHIP-TONIGHT PATCH

The canonical amber variable substitution — the highest-leverage single change.

### Step 1: Add `--bb-warn` to the Bloomberg `:root` block in popup.css (line 657 area)

```css
/* popup.css — insert after line 659 */
--bb-warn:      #f0a040;
--bb-warn-dim:  #b86f20;
--bb-warn-bg:   rgba(240,160,64,0.10);
```

### Step 2: Replace all hard-coded `#f0a040` in popup.css with `var(--bb-warn)`

Affected lines: 532, 575, 585, 598, 600, 633. Six surgical replacements.

```css
/* Line 532 */
.pop-drill-pill.note { background: rgba(240,160,64,.14); color: var(--bb-warn); }
/* Line 575 */
.pop-maint-status.warn { color: var(--bb-warn); }
/* Lines 584-600 — .pop-maint-chip and .pop-maint-banner */
background: rgba(240,160,64,.16);
color: var(--bb-warn);
border-color: rgba(240,160,64,.4);
/* Line 598 */
border-left: 3px solid var(--bb-warn);
/* Line 633 */
.pop-maint-roster-row .age.yellow { color: var(--bb-warn); }
```

### Step 3: Fix the two gradient violations (Section B above)

Both are single-line background swaps. Combined diff:

```
popup.css:35   background: linear-gradient(180deg, #181b20 0%, #0c0e12 100%);
           -->  background: #0c0e12;
popup.css:36   border-bottom: 1px solid #2a2f38;
           -->  border-bottom: 2px solid #ff9933;

popup.css:434  background: linear-gradient(180deg, #1c2028 0%, #181b20 100%);
           -->  background: #181b20;
popup.css:435  border-bottom: 1px solid #2a2f38;   (already there, upgrade to amber)
           -->  border-bottom: 2px solid var(--bb-amber);

popup.css:735  border-bottom: 1px solid var(--bb-line-hot) !important;
           -->  border-bottom: 2px solid var(--bb-amber) !important;
```

### Step 4: Fix the five off-grid spacing violations (Section D)

```
popup.css:129   padding: 7px 12px  -->  padding: 8px 12px
popup.css:184   padding: 5px 8px   -->  padding: 4px 8px
popup.css:262   padding: 5px 8px   -->  padding: 4px 8px
popup.css:359   padding: 4px 10px  -->  padding: 4px 8px
popup.css:368   padding: 4px 10px  -->  padding: 4px 8px
popup.css:566   padding: 5px 10px  -->  padding: 4px 8px
```

### Step 5: Kill the sans-serif islands (Section C)

```
popup.css:189   font: 10px -apple-system, ... sans-serif;
           -->  font: 10px/1.2 var(--bb-font);

popup.css:310   font-family: -apple-system, ... sans-serif;
           -->  (delete the font-family declaration entirely)
```

### Summary: total lines touched

| Section | Lines changed | Risk |
|---|---|---|
| A — `--bb-warn` variable + 6 replacements | 9 | Zero — additive |
| B — 3 gradient removals + 2 border upgrades | 5 | Low — visual only |
| C — 2 font-family fixes | 2 | Low — visual only |
| D — 6 spacing fixes | 6 | Low — sub-4px shift on buttons |
| **Total** | **22** | Ship tonight |
