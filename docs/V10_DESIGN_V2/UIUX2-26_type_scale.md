# UIUX2-26 — Type Scale Audit: v10.13

**Sources audited:** `popup.css` (2285 lines), `modtools.js` (GAM_CSS blocks + inline style strings)
**Date:** 2026-05-10
**Target scale:** 7 steps (9 / 10 / 11 / 12 / 13 / 14 / 16px) + uppercase letter-spacing ladder
**Target font stacks:** `--bb-font` (mono) for dense surfaces; `system-ui / -apple-system` (sans) for prose/UI chrome

---

## A. Distinct font-size values (vs target ≤7)

### popup.css — hardcoded px declarations (lines 1–2285)

| Value | Count | On-grid? |
|-------|-------|---------|
| 9px   | 7     | YES — micro |
| 10px  | 20+   | YES — label |
| 11px  | 12+   | YES — body |
| 12px  | 10+   | YES — primary |
| 13px  | 2     | YES — h-tertiary |
| 16px  | 2     | YES — h-primary |
| 20px  | 1     | OFF-GRID |

**Token-referenced (`var(--bb-t-xs)`):** 3 occurrences — correctly resolves to 10px.

**Token definitions (popup.css line 705):**
```
--bb-t-xs: 10px;  --bb-t-sm: 11px;  --bb-t-base: 12px;
--bb-t-md: 13px;  --bb-t-lg: 15px;  --bb-t-xl: 18px;  --bb-t-xxl: 22px;
```

**Popup.css assessment:** 7 distinct hardcoded px values. The grid is mostly respected here. One off-grid rogue: `20px` (line 70 — clock/metric display, line 1852 — numeric KPI). The token set itself has two values not in the target grid: `15px` (--bb-t-lg) and `18px` (--bb-t-xl) — both exist in token definitions only, not as direct `font-size:` declarations in static CSS. **Net hardcoded distinct values: 7 + 1 off-grid = 8 total.**

---

### modtools.js — JS-injected CSS + inline style strings

Values found across all injected style blocks and `el(...style...)` patterns:

| Value | On-grid? | Surface context |
|-------|---------|----------------|
| 8px   | OFF-GRID | `.gam-dr-band-hdr`, `.gam-queue-btn`, cancel-all btn |
| 9px   | YES — micro | badges, status pills, tags, queue rows, SUS drill |
| 10px  | YES — label | labels, metadata, most secondary text |
| 10.5px | OFF-GRID | macro editor subtitle (lines 15450, 15455) |
| 11px  | YES — body | primary content rows, modmail body |
| 12px  | YES — primary | modmail title, composer inputs, MC modal |
| 12.5px | OFF-GRID | `.gam-mc-msg-body` (line 15851) |
| 13px  | YES — h-tertiary | toast, empty state desc, modal title area |
| 14px  | YES — h-secondary | park btn, precedent header, MC title, drawer title, brand bar, update btn |
| 15px  | OFF-GRID | `gam-empty-headline` (ux-polish block, line 4443) |
| 16px  | YES — h-primary (via popup.css token path) — but appears directly in JS as close button etc. | modal close × button, close buttons |
| 18px  | OFF-GRID | `.gam-mc-close` (line 15826), `.gam-modal-close` (line 20039) |
| 20px  | OFF-GRID | `.gam-sh2-tile-val--text` (20px), `gam-modal-close` font-size (line 4613 ux-polish) |
| 28px  | OFF-GRID | `.gam-sh2-tile-val` — large metric stat |

**JS-injected distinct values: 14 (target: 7). Off-grid count: 7 (8px, 10.5px, 12.5px, 15px, 18px, 20px, 28px).**

### Combined total across both files
- **Target:** 7 distinct values
- **Actual hardcoded distinct values:** 14 (popup.css 8 incl. rogue 20px; modtools.js adds 8px, 10.5px, 12.5px, 15px, 18px, 28px on top)
- **Drift since v10.12:** 7 off-grid values identified in JS (8px, 10.5px, 12.5px, 15px, 18px, 20px, 28px). Popup.css held better discipline — only one off-grid px value (20px/line 70).

---

## B. Off-grid sizes by surface

| Off-grid size | Location | Surface | Remediation |
|--------------|----------|---------|-------------|
| 8px | `modtools.js:18025` `.gam-dr-band-hdr` | Deferred Rules band header | Promote to 9px micro |
| 8px | `modtools.js:18089` cancel-all btn | DR panel sort bar btn | Promote to 9px micro |
| 8px | `modtools.js:18349` `.gam-queue-btn` | Queue action buttons | Promote to 9px micro |
| 8px | `modtools.js:19027` tier badge | Mod tier badge absolute | Promote to 9px micro |
| 10.5px | `modtools.js:15450,15455` | Macro editor subtitle/error | Snap to 10px label |
| 12.5px | `modtools.js:15851` `.gam-mc-msg-body` | Modmail message body | Snap to 12px primary |
| 15px | `modtools.js:4443` `.gam-empty-headline` (ux-polish) | Empty state headline | Snap to 16px h-primary or 14px h-secondary |
| 18px | `modtools.js:15826` `.gam-mc-close` | Modmail modal close × | Use 16px or abstract to `--bb-icon-size` |
| 18px | `modtools.js:20039` `.gam-modal-close` | Generic modal close × | Same: 16px or icon token |
| 20px | `popup.css:70` | Header metric/clock | Promote to `--bb-t-xxl` (22px) or use stat-specific token |
| 20px | `modtools.js:4613` `.gam-modal-close` (ux-polish) | Close button large | 16px or icon token |
| 20px | `modtools.js:18643` `.gam-sh2-tile-val--text` | Stats tile text variant | Token: `--bb-t-stat-md` |
| 28px | `modtools.js:18642` `.gam-sh2-tile-val` | Stats tile primary number | Token: `--bb-t-stat-lg` — exempt from ladder, add explicitly |

**Note on 28px and 20px stat tiles:** These are legitimate data-display sizes for KPI surfaces (Bloomberg-style numeric readouts). They should NOT be snapped to the body text ladder. Instead, add two dedicated stat tokens:
```css
--bb-t-stat-md: 20px;  /* stat tile text variant */
--bb-t-stat-lg: 28px;  /* stat tile primary KPI */
```
This keeps the body text ladder clean at 7 steps while allowing metric displays their own semantic tokens.

---

## C. Letter-spacing rationalization

### Current state — popup.css

Mixed px and em units in the same file. Full set found:

**em values (uppercase-ladder direction — correct):**
`-0.02em, -0.01em, 0, 0.02em, 0.04em, 0.05em, 0.06em, 0.08em, 0.1em, 0.12em`

**px values (raw — wrong unit, defeats scalability):**
`-0.4px, 0.1px, 0.2px, 0.3px, 0.4px, 0.6px, 0.7px`

Distinct raw values: **17 across popup.css** (10 em + 7 px). Target: 7 defined.

### Current state — modtools.js

**em values found:** `-0.02em, -0.01em, 0, 0.02em, 0.03em, 0.04em, 0.05em, 0.06em, 0.07em, 0.08em, 0.1em, 0.12em, 0.15em, 0.25em`

**px values in JS:** `0.2px, 0.3px, 0.5px, 1px, 1.5px, 2px` (CSS template literals and inline style strings)

Distinct values in JS: **20** (14 em + 6 px).

### Combined across both files

- **Distinct em values:** 15 (target: ~7 on the uppercase ladder)
- **Distinct px values:** 11 (should be 0 — all px letter-spacing is off-spec)
- **Total distinct letter-spacing values:** ~26 across both files (v1 audit counted 18; drift has widened)

### Target uppercase letter-spacing ladder (7 steps)

```css
--bb-ls-tight:    -0.02em;   /* large numerics, stat tiles */
--bb-ls-0:         0;         /* reset / inherit */
--bb-ls-body:      0.02em;   /* body text, prose */
--bb-ls-meta:      0.04em;   /* metadata, secondary */
--bb-ls-label:     0.06em;   /* labels, pills (monospace) */
--bb-ls-cap:       0.08em;   /* all-caps labels (uppercase text-transform) */
--bb-ls-wide:      0.12em;   /* section headers, band headers */
```

Eliminate: `0.03em, 0.05em, 0.07em, 0.10em, 0.15em, 0.25em, all px values`.

Snap map for px values:
| Raw | Snap to |
|-----|---------|
| 0.1px, 0.2px, 0.3px | `--bb-ls-body` (0.02em at 12px ≈ 0.24px) |
| 0.4px, 0.5px | `--bb-ls-meta` (0.04em at 12px ≈ 0.48px) |
| 0.6px, 0.7px | `--bb-ls-label` (0.06em at 12px ≈ 0.72px) |
| 1px, 1.5px | `--bb-ls-cap` (0.08em at 12px ≈ 0.96px) |
| 2px | `--bb-ls-wide` (0.12em at 12px ≈ 1.44px) |
| -0.4px | `--bb-ls-tight` (-0.02em at 20px ≈ -0.4px) — stat tiles |

---

## D. Mono-vs-sans usage map

### Defined stacks

**`--bb-font` (monospace — popup.css line 704):**
```
ui-monospace, "JetBrains Mono", "IBM Plex Mono", "Cascadia Code", "Consolas", "Menlo", monospace
```

**`sans` (popup.css line 26, base body):**
```
-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif
```

**Secondary mono (modtools.js, GAM_CSS):**
```
'SF Mono', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace
'ui-monospace', 'JetBrains Mono', Consolas, monospace
ui-monospace, monospace  (abbreviated — missing JetBrains Mono as named fallback)
```

### Surfaces by stack

| Stack | Surfaces using it | Correct? |
|-------|------------------|---------|
| `--bb-font` (full mono) | popup.css BB-skin block (lines 700+): tabs, action rows, status pills, token status, all Bloomberg-skinned elements | YES |
| `'SF Mono'...'JetBrains Mono'...` (popup.css lines 47, 285, 406, 411, 511) | IP cells, note editor, user link, monospace data rows | YES — equivalent stack |
| `ui-monospace,monospace` (abbreviated, modtools.js inline styles) | Deferred-rules buttons, modmail buttons, SUS drill buttons, macro save/cancel, dock toast, queue undo toast | PARTIAL — missing `JetBrains Mono` as named fallback; on Windows `ui-monospace` resolves to Cascadia Code which is acceptable, but explicit naming is cleaner |
| `-apple-system, BlinkMacSystemFont, system-ui, sans-serif` (popup.css line 26, `.gam-snack`, `.gam-btn`, `.gam-ban-unban`, `.gam-update-banner`, `.gam-t-flush-btn`, `.gam-mc-textarea`, `.gam-t-filter`) | Snack bars, primary action buttons, modal close, update banner | YES — correct for large-touch UI chrome |
| `-apple-system, system-ui, sans-serif` (modtools.js — bulk action btn line 14012, divider line 14068) | Bulk action button, section divider label | YES — UI chrome |
| `'SF Mono','Cascadia Code','JetBrains Mono',Consolas,monospace` (modtools.js line 7416) | Orphaned-extension banner | YES — terminal/diagnostic surface |

### Discipline violations

1. **`font-family:inherit` (popup.css line 176):** Applied to `.pop-btn` which inherits from a mono parent. Correct conceptually but creates an invisible coupling — if the parent changes to sans, buttons silently change stack. Should be explicit.

2. **Sans-on-mono mixup in modmail mini panel:** `font-size:10px;color:#9b9892` labels inside the modmail compact panel use no `font-family` at all — falls through to whatever Chrome's default is (sans on most platforms). These are Bloomberg label surfaces and should inherit `--bb-font`.

3. **`font:inherit;font-size:10px` pattern (modtools.js line 4713):** This doubly inherits then re-applies size only. On pages where the host page uses a sans font, the inherited stack will be sans regardless of the extension's mono intent. Use `font: 10px var(--bb-font, ui-monospace, monospace)` instead.

4. **Inconsistent `--bb-font` fallback syntax:** Some JS-injected blocks write `var(--bb-font, ui-monospace, monospace)` (correct — has fallback for contexts where popup.css tokens aren't loaded) while most write `var(--bb-font)` with no fallback. In content-script panels that inject into the host page without the popup's `:root` token block, `var(--bb-font)` resolves to empty string, causing the browser default. All JS-injected mono uses should use `var(--bb-font, ui-monospace, "JetBrains Mono", monospace)`.

---

## E. Effort estimate

| Work item | Files | LOC estimate | Risk |
|-----------|-------|-------------|------|
| Snap 8px → 9px (4 occurrences) | modtools.js | ~4 | Low |
| Snap 10.5px → 10px (2 occurrences) | modtools.js | ~2 | Low |
| Snap 12.5px → 12px (1 occurrence) | modtools.js | ~1 | Low |
| Snap 15px → 16px empty state headline | modtools.js | ~1 | Low |
| Snap 18px/20px close × buttons → 16px or icon token | modtools.js | ~4 | Low |
| Add `--bb-t-stat-md: 20px` and `--bb-t-stat-lg: 28px` to popup.css token block | popup.css | ~2 | Low |
| Migrate popup.css px letter-spacing values → em tokens (7 distinct px values) | popup.css | ~10 | Medium |
| Migrate modtools.js px letter-spacing → em tokens (6 distinct px values, scattered across CSS template literals) | modtools.js | ~20 | Medium |
| Consolidate em letter-spacing outliers (0.03, 0.05, 0.07, 0.10, 0.15, 0.25em) → 7-step ladder | popup.css + modtools.js | ~30 | Medium |
| Fix abbreviated `ui-monospace,monospace` stacks → full `var(--bb-font, ui-monospace, "JetBrains Mono", monospace)` | modtools.js | ~25 | Low-Medium |
| Fix `var(--bb-font)` without fallback in all JS-injected blocks | modtools.js | ~30 | Low |
| Fix `.pop-btn font-family:inherit` → explicit mono | popup.css | ~1 | Low |
| Fix modmail mini panel label stacks (no font-family) | modtools.js | ~5 | Low |
| Fix `font:inherit;font-size:Npx` pattern → explicit stack | modtools.js | ~3 | Low |

**Total estimated LOC:** ~140 lines of CSS changes across 2 files
**Total effort:** 2-3 hours (most items are mechanical search-replace; letter-spacing consolidation requires judgment for uppercase-context decisions)
**Suggested shipping order:** Stat tokens → off-grid snaps → font-stack fixes → px-to-em letter-spacing → em ladder consolidation

---

## Summary

| Metric | v10.12 baseline (v1 audit) | v10.13 current | Target |
|--------|---------------------------|----------------|--------|
| Distinct font-size values | 16 | 14 distinct px values total (8 popup.css incl. 1 rogue; 14 in JS total) | 7 + 2 stat tokens |
| Distinct letter-spacing values | 18 | ~26 (15 em + 11 px across both files) | 7 em only |
| Off-grid font sizes | — | 7 (8px, 10.5px, 12.5px, 15px, 18px, 20px, 28px — stat tiles exempt) | 0 |
| Px letter-spacing occurrences | — | ~11 distinct values across both files | 0 |
| Font stack discipline | — | 4 violation classes identified | Clean mono/sans split |

**Popup.css is the better-behaved file** — it holds close to the 7-step grid with only one off-grid rogue (20px). The token system at line 704-706 is sound but not yet fully utilized (many direct px values could be token references).

**Modtools.js is the drift source.** 14 distinct font sizes, fragmented letter-spacing, abbreviated mono stacks, and missing `--bb-font` fallbacks in all JS-injected CSS. The fix is primarily mechanical but needs a careful pass because inline style strings are scattered across 26,000+ lines of JavaScript.
