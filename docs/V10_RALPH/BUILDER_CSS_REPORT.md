# BUILDER_CSS_REPORT — Visual Polish Patches
**Agent:** BUILDER-CSS
**Date:** 2026-05-09
**Parse check:** `node --check modtools.js` → PARSE OK (confirmed after all patches)

---

## Patch 1: Amber dedup — `#f0a040` → `var(--bb-warn)` (popup.css)

`--bb-warn: #f0a040` was already added to the Bloomberg `:root` block in popup.css at line 697 (v10.4). The 6 hard-coded `#f0a040` CSS rule sites were still not referencing it.

**Replacements made in popup.css:**

| Line (pre-patch) | Selector | Property swapped |
|---|---|---|
| 557 | `.pop-drill-pill.note` | `color: #f0a040` → `color: var(--bb-warn)` |
| 600 | `.pop-maint-status.warn` | `color: #f0a040` → `color: var(--bb-warn)` |
| 610 | `.pop-maint-chip` | `color: #f0a040` → `color: var(--bb-warn)` |
| 623 | `.pop-maint-banner` | `border-left: 3px solid #f0a040` → `var(--bb-warn)` |
| 625 | `.pop-maint-banner` | `color: #f0a040` → `color: var(--bb-warn)` |
| 658 | `.pop-maint-roster-row .age.yellow` | `color: #f0a040` → `color: var(--bb-warn)` |

Post-patch: only the comment block (line 8) and the variable definition itself (line 697) contain the literal `#f0a040`. All active rule sites use `var(--bb-warn)`.

---

## Patch 2: Spacing grid fixes (popup.css)

Snapped 6 off-grid values to the 4/8/12/16/24/32px grid. 10px → 8px, 7px → 8px, 5px → 4px.

| Line | Selector | Before | After |
|---|---|---|---|
| 129 | `.pop-btn-primary` | `padding: 7px 12px` | `padding: 8px 12px` |
| 184 | `.pop-btn-ghost` | `padding: 5px 8px` | `padding: 4px 8px` |
| 262 | `.pop-token input` | `padding: 5px 8px` | `padding: 4px 8px` |
| 359 | `.gam-pop-modal-btn-cancel` | `padding: 4px 10px` | `padding: 4px 8px` |
| 368 | `.gam-pop-modal-btn-ok` | `padding: 4px 10px` | `padding: 4px 8px` |
| 566 | `.pop-maint-row .pop-btn-ghost` | `padding: 5px 10px` | `padding: 4px 8px` |

---

## Patch 3: Motion CSS variables (popup.css + modtools.js GAM_CSS)

Added 7 custom properties to the Bloomberg `:root` block in both files, plus a `prefers-reduced-motion` block that collapses all durations to 0ms.

**Variables added:**
```css
--gam-dur-micro:      80ms;
--gam-dur-appear:     160ms;
--gam-dur-disappear:  120ms;
--gam-dur-decision:   200ms;
--gam-ease-decelerate: cubic-bezier(0,0,0.2,1);
--gam-ease-accelerate: cubic-bezier(0.4,0,1,1);
--gam-ease-spring:     cubic-bezier(0.34,1.56,0.64,1);
```

**Locations:**
- `popup.css` — appended inside the `--bb-*` `:root` block (after line 706), plus `@media (prefers-reduced-motion: reduce)` block following.
- `modtools.js` GAM_CSS — appended inside the Bloomberg `:root` block (after the `font-feature-settings` line at ~16680), plus `@media (prefers-reduced-motion: reduce)` block following.

No existing `transition:` values were touched — variables co-exist. Wave 2 work will wire them up.

---

## Patch 4: Focus ring upgrade (popup.css + modtools.js GAM_CSS)

**Universal `:focus-visible` rule added to popup.css** (before "Iter 1-2: body"):
```css
:focus-visible {
  outline: 3px solid var(--bb-amber);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px rgba(255, 176, 0, 0.25);
}
```

**Universal `:focus-visible` rule added to modtools.js GAM_CSS** (after the reduced-motion block, before Iter 2 status bar).

**Popup tab focus ring fixed** (`popup.css` line ~781 post-shift):
- Before: `outline: 1px solid var(--bb-amber) !important; outline-offset: -1px !important;`
- After: `outline: 3px solid var(--bb-amber); outline-offset: 2px; box-shadow: 0 0 0 5px rgba(255, 176, 0, 0.25);`
- `!important` removed — universal rule provides same value; specificity war eliminated.

Negative `outline-offset` was clipping the ring inside the tab button boundary. Fixed to +2px, ring now renders outside.

---

## Patch 5: Empty state shared CSS (popup.css + modtools.js GAM_CSS)

Added `.gam-empty-card` component CSS with 4 semantic category modifiers to both files.

**Classes added:**
- `.gam-empty-card` — flex column, center-aligned, transparent background
- `.gam-empty-icon` — base icon color (`--bb-ink-faint`)
- `.gam-empty-headline` — 13px/600 monospace, `--bb-ink`
- `.gam-empty-desc` — 11px/400 monospace, `--bb-ink-dim`, max-width 280px
- `.gam-empty-cta` — amber ghost button (border+color only, transparent bg)
- Category modifiers: `.gam-empty-calm` (gray icon), `.gam-empty-notice` (amber icon), `.gam-empty-onboarding` (cyan icon), `.gam-empty-error` (red icon + red CTA)

**Locations:**
- `popup.css` — appended at end of file (after `.pop-maint-advanced[open]`)
- `modtools.js` GAM_CSS — appended just before the closing backtick at line 17649

Note: The existing `gam-empty-card` class in modtools.js at line 4006 is inside the flag-gated `renderEmptyState()` CSS injection (`.gam-ux-polish-on` scoped). The new Bloomberg-layer class is unscoped and overrides via cascade. No conflict — the `renderEmptyState()` version uses `background:#1f1f24` which is a different scope.

---

## Patch 6: Tooltip `::before` residual (modtools.js)

**Verified:** `.gam-tip::before` does not exist. The actual rule is `.gam-bar-icon[title]:hover::before` (bar icon hover tooltips).

**No `gam-tip-arrow` class exists** — confirmed via grep. The tooltip positioning uses only `::before` pseudo on bar icons.

**Change made** at `modtools.js:16785` (pre-patch line number; ~16876 post-shift):
- Before: `bottom: calc(100% + 6px);`
- After: `bottom: calc(100% + 14px);`

This matches the v10.1 JS-layer bump cited in the agent task. The tooltip now renders 14px above the icon top edge instead of 6px, matching the arrow/gap height used by the JS positioning logic.

---

## Parse verification

```
node --check D:\AI\_PROJECTS\modtools-ext\modtools.js
→ PARSE OK
```

popup.css has no JS parser to run; confirmed Edit tool accepted all changes without error.

---

## Summary

| Patch | Files | Lines changed | Status |
|---|---|---|---|
| 1: Amber dedup | popup.css | 6 replacements | DONE |
| 2: Spacing grid | popup.css | 6 values | DONE |
| 3: Motion vars | popup.css + modtools.js GAM_CSS | +17 lines each | DONE |
| 4: Focus ring | popup.css + modtools.js GAM_CSS | +7 lines each + 1 fix | DONE |
| 5: Empty state CSS | popup.css + modtools.js GAM_CSS | +45 lines each | DONE |
| 6: Tooltip ::before | modtools.js GAM_CSS | 1 value | DONE |

**Total: 0 parse errors. All patches applied. No JS code touched.**
