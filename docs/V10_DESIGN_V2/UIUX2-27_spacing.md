# UIUX2-27 — Spacing Rhythm Audit (4-base scale)

**Scope:** `popup.css` (2,330 lines) + `GAM_CSS` inline block in `modtools.js` (lines 19,963–20,462)
**Declared contract:** `popup.css` line 10 — _"SPACING: 4 / 8 / 12 / 16 grid. No 5/6/7/9/10/11 pixel values."_
**Audit date:** 2026-05-10
**Auditor:** UIUX2-27-SPACING

---

## A. Off-Grid Spacing Inventory

### Definition

The declared grid is **4 / 8 / 12 / 16 / 24 / 32 / 48**. Allowed exceptions:
- `0` (reset), `1px` (hairlines/borders), `2px` (micro-inset, border-width), `4px` (base unit)
- `20px`, `28px`, `36px`, `44px` — multiples of 4 used for component heights/tap targets

The following values are **off-grid** as declared: **3, 5, 6, 7, 9, 10, 11, 13, 14, 15, 17, 18, 22, 30**.

---

### A.1 — popup.css Off-Grid Violations

| Line | Value | Declaration | Context |
|------|-------|-------------|---------|
| 49 | 6px | `padding: 1px 6px` | `.pop-ver` version badge — pill padding |
| 88 | 6px, 10px | `padding: 6px 10px` | `.pop-alert` alert banner |
| 115 | 6px | `padding: 6px 4px` | `.pop-actions .pop-btn` action icon button |
| 132 | 6px | `padding: 6px 12px` | `.pop-btn` base button |
| 331 | 14px | `padding: 12px 14px` | `.gam-pop-modal-panel` modal panel |
| 354 | 6px | `padding: 6px 8px` | `.gam-pop-modal-input` input field |
| 367 | 6px | `gap: 6px` | `.gam-pop-modal-btnrow` button row |
| 402 | 6px | `padding: 6px 8px` | `.gam-roster-invite-result` invite result |
| 502 | 6px | `padding: 6px 12px` | `.pop-drill-row` drill table row |
| 544 | 6px | `padding: 1px 6px` | `.pop-drill-pill` status pill |
| 606 | 6px | `padding: 1px 6px` | `.pop-maint-chip` maintenance chip |
| 662 | 2, 8 | `padding: 2px 8px` | `.pop-maint-roster-row button` — ok (2 is micro) |
| 1345 | 10px | `gap: 10px` | `.gam-empty-card` empty state |
| 1362 | 6px, 14px | `padding: 6px 14px` | `.gam-empty-cta` empty state CTA |
| 1422 | 6px | `padding: 6px 12px` | (af-16 popup banner) |
| 1434 | 6px | `padding: 6px 12px` | (af-12 restart notice bar) |
| 1506 | 6px | `gap: 6px` | `.gam-card-head` card head gap |
| 1507 | 14px | `padding: 8px 12px 8px 14px` | `.gam-card-head` left-inset for amber rail |
| 1564 | 14px | `padding: 8px 12px 8px 14px` | `.gam-card-body` left-inset for amber rail |
| 1599 | 6px | `gap: 6px` | `.gam-card-header` (non-details variant) |
| 1600 | 14px | `padding: 8px 12px 8px 14px` | `.gam-card-header` left-inset |
| 1614 | 6px | `padding: 6px 8px 4px` | `.gam-card-subsection` |
| 1631 | 6px | `gap: 6px` | `.gam-card-sub-label` sub-label gap |
| **1655** | **5px** | **`gap: 5px`** | **`.gam-card-grid2 .pop-btn` — HARDEST violation** |
| 1691 | 3px, 6px | `padding: 3px 6px` | `.gam-crawl-pill` segmented control |
| 1721 | 6px | `padding: 6px 8px 4px` | `.pop-maint-cat-head` |
| **1753** | **5px** | **`padding: 5px 8px`** | **`.pop-maint-action-row .pop-btn` — HARDEST violation** |
| 1822 | 6px | `padding: 6px 4px` | `.gam-kpi-tile` KPI tile |
| 1847 | 3px | `gap: 3px` | `.gam-kpi-value-row` delta + value row |
| 1891 | 6px | `padding: 4px 6px` | `.gam-qa-btn` quick actions button |
| 1934 | 6px | `gap: 6px` | `#lapsedModsChip` lapsed mods chip |
| 1948 | 6px | `padding: 1px 6px` | `.chip-expand` chip expand button |
| 1975 | 6px | `gap: 6px` | `.gam-lead-deepdive summary` |
| 2005 | 6px | `gap: 6px` | `.gam-lead-sub summary` |
| 2021 | 6px | `padding: 6px 8px` | `.gam-lead-sub .sub-body` |
| **2095** | **5px** | **`padding: 5px 12px`** | **`.gam-empty-state .gam-empty-cta` — HARDEST violation** |
| 2111 | 6px | `gap: 6px` | `.gam-error-state` error state |
| 2112 | 10px | `padding: 10px 12px` | `.gam-error-state` |
| 2118 | 6px | `padding: 2px 6px` | `.gam-error-chip` |
| 2144 | 10px | `padding: 4px 10px` | `.gam-error-retry` |
| 2166 | 6px | `gap: 6px` | `.gam-stale-chip` |
| 2167 | 6px | `padding: 2px 6px` | `.gam-stale-chip` |
| 2243 | 6px | `gap: 6px` | `.pop-drill-toolbar` |
| 2244 | 6px | `padding: 6px 8px` | `.pop-drill-toolbar` |
| 2250 | 3px, 6px | `padding: 3px 6px` | `.pop-drill-filter` |
| 2258 | 3px, 6px | `padding: 3px 6px` | `.pop-drill-sort` |
| 2270 | 3px | `padding: 3px 8px` | `.pop-drill-export` |

**popup.css summary:** 3 values of `5px`, ~30+ instances of `6px`, 10+ instances of `10px`, 7+ instances of `14px`, isolated `3px`.

---

### A.2 — GAM_CSS (modtools.js) Off-Grid Violations

The GAM_CSS block predates the Bloomberg Terminal redesign and was authored at a different rhythm. It has a **higher density** of off-grid values.

**Most frequent pattern-clusters (grouped by component family):**

| Component family | Off-grid values found | Example declaration |
|------------------|-----------------------|---------------------|
| Modal system (`.gam-modal-*`) | 6, 10, 14 | `padding:10px 14px`, `padding:12px 14px` |
| Buttons (`.gam-btn`, `.gam-nba-*`) | 5, 6, 10, 14 | `padding:6px 14px`, `padding:5px 12px` |
| Mod Console (`.gam-mc-*`) | 5, 6, 10 | `padding:5px 12px`, `gap:10px`, `padding:10px 12px` |
| Intel Drawer (`.gam-drawer-*`) | 6, 10, 14 | `padding:10px 14px` |
| Action Strip (`.gam-strip-*`) | 5, 6, 10 | `padding:6px 10px` |
| Status Bar (`#gam-status-bar`) | 6, 10, 14 | `padding:0 10px`, `gap:6px` |
| Tooltip (`#gam-tooltip`) | 6, 10 | `padding:10px 12px` |
| Hot Now panel (`.gam-hn-*`) | 5, 7, 10, 14 | `padding:5px 14px`, `padding:7px 14px` |
| Mod Mail popovers (`#gam-mm-popover`) | 6, 10, 30 | `padding:10px 12px` |
| C5 popover (`#gam-c5-popover`) | 3, 5, 6, 10, 14 | `padding:10px 12px`, `gap:8px` |
| Snack/toast (`.gam-snack`) | 6 | `padding:6px 12px` |
| Chip system (`.gam-chip`) | 3, 10 | `padding:2px 8px; margin-right:4px` — wait, margin |
| Mod Log (`.gam-log-*`) | 6, 10 | `padding:6px 0`, `gap:10px` |
| Help panel (`.gam-help-*`) | 3, 6, 10 | `padding:3px 0`, `gap:6px` |
| Activity timeline (`.gam-at-*`) | 3, 6, 10, 14 | `padding:3px 0`, `gap:6px` |

**Unique off-grid values in GAM_CSS:** `3, 5, 6, 7, 10, 11, 13, 14, 15, 22, 30`

Note: `11` appears frequently as a **font-size value embedded in padding shorthand strings** (e.g. `font:11px`), not as actual padding. The grep captures it because it scans the full line. True 11px spacing is limited to font-size context. `22px` is `width/height` of icon button hit-targets (not padding). These are **contextually acceptable** but technically off-grid.

---

## B. Per-Surface Rhythm Map

| Surface | Padding | Gap | Rhythm assessment |
|---------|---------|-----|-------------------|
| **Header** (`.pop-header`) | `8px 12px` via `--bb-s4 --bb-s5` | — | GRID-COMPLIANT (8/12) |
| **Tab nav** (`.pop-tabnav`) | `8px 4px` per tab | `0` | COMPLIANT |
| **Stats grid** (`.pop-stats`, `.pop-stat`) | `8px 12px` via tokens | `0` | COMPLIANT |
| **Action buttons** (`.pop-actions`) | `0 12px 8px` outer; `6px 4px` inner | `4px` | VIOLATED — inner btn 6px |
| **Tool rows** (`.pop-tools`) | `4px 12px` | `4px` (token `--bb-s2`) | COMPLIANT |
| **Alert banner** (`.pop-alert`) | `6px 10px` | — | VIOLATED — 6/10 both off-grid |
| **Token panel** (`.pop-token`) | `8px 12px` | `8px` | COMPLIANT |
| **Token input** (`.pop-token input`) | `4px 8px` via `--bb-s3 --bb-s4` | — | COMPLIANT (tokens) |
| **Section labels** (`.pop-section-label`) | `4px 12px 2px` | — | SEMI-COMPLIANT — 2px bottom is micro |
| **Modal panel** (`.gam-pop-modal-panel`) | `12px 14px` | — | VIOLATED — 14px off-grid |
| **Modal btn row** | `4px 8px` | `6px` | VIOLATED — gap 6px |
| **Invite result** | `6px 8px` | `4px` | VIOLATED — 6px vertical |
| **Drill panel** (`.pop-drill`) | `8px 12px` (head/foot) | `8px` | COMPLIANT in head/foot |
| **Drill rows** | `6px 12px` | `8px` | VIOLATED — 6px vertical |
| **Drill pills** | `1px 6px` | — | VIOLATED — 6px horizontal |
| **Maintenance rows** | `4px 8px` via `--bb-s3 --bb-s4` | `--bb-s4` | COMPLIANT (tokens) |
| **Card head** (`.gam-card-head`) | `8px 12px 8px 14px` | `6px` | VIOLATED — 14px left-inset, 6px gap |
| **Card body** (`.gam-card-body`) | `8px 12px 8px 14px` | — | VIOLATED — 14px left-inset |
| **Card subsection** | `6px 8px 4px` | — | VIOLATED — 6px vertical |
| **Card 2-col grid** | `4px 8px` | `4px` / `5px` | VIOLATED — `5px` gap |
| **Crawl control** | `3px 6px` | `2px`/`4px` | VIOLATED — 3/6px |
| **Maint action row** | `4px 8px` outer; `5px 8px` inner btn | `8px` | VIOLATED — 5px btn |
| **KPI tile** | `6px 4px` | `0` | VIOLATED — 6px vertical |
| **KPI value row** | — | `3px` | VIOLATED — 3px gap |
| **Quick Actions btn** | `4px 6px` | — | VIOLATED — 6px horizontal |
| **Lapsed chip** | `4px 8px` | `6px` | VIOLATED — 6px gap |
| **Empty state card** | `24px 16px` | `10px` | VIOLATED — 10px gap |
| **Empty state CTA** | `5px 12px` / `6px 14px` | — | VIOLATED — 5/6/14px |
| **Error state** | `10px 12px` | `6px` | VIOLATED — 10/6px |
| **Error chip** | `2px 6px` | `4px` | VIOLATED — 6px horizontal |
| **Error retry btn** | `4px 10px` | — | VIOLATED — 10px horizontal |
| **Stale chip** | `2px 6px` | `6px` | VIOLATED — 6px |
| **Drill toolbar** | `6px 8px` | `6px` | VIOLATED — 6px vertical + gap |
| **Drill filter/sort** | `3px 6px` | — | VIOLATED — 3/6px |
| **Drill export btn** | `3px 8px` | — | VIOLATED — 3px vertical |
| **Footer** (`.pop-footer`) | `8px 12px` | `8px` | COMPLIANT |
| **gam-modal header** | `10px 14px` | — | VIOLATED — 10/14px |
| **gam-modal body** | `12px 14px` | — | VIOLATED — 14px |
| **gam-btn base** | `6px 14px` | — | VIOLATED — 6/14px |
| **Intel drawer header** | `10px 14px` | `8px` | VIOLATED — 10/14px |
| **Intel drawer section** | `10px 14px` | — | VIOLATED — 10/14px |
| **Status bar** | `0 10px` | `6px` | VIOLATED — 10/6px |
| **Mod console tabs** | `5px 12px` | `4px` | VIOLATED — 5px |
| **Hot Now header** | `10px 14px 8px` | — | VIOLATED — 10/14px |
| **Hot Now rows** | `5px 14px 5px 11px` | `8px` | VIOLATED — 5/14/11px |
| **Hot Now footer** | `7px 14px` | — | VIOLATED — 7/14px |
| **Tooltip** | `10px 12px` | — | VIOLATED — 10px |
| **MM popover** | `10px 12px` | — | VIOLATED — 10px |

---

## C. Padding-vs-Gap Consistency

### C.1 — Asymmetric rhythms

The popup layer and the GAM_CSS content-script layer use **different base rhythms**:

| Layer | Dominant inner padding | Dominant gap | Rhythm |
|-------|------------------------|--------------|--------|
| popup.css (Bloomberg layer, L665+) | `--bb-s3/s4/s5` = 6/8/12 | `--bb-s2/s4` = 4/8 | Token-based, partially grid-aligned |
| popup.css (legacy layer, L1–664) | Mixed: 4, 6, 8, 12 | 4, 6, 8 | Partially compliant |
| GAM_CSS (modtools.js) | 6, 10, 12, 14 | 4, 6, 8, 10 | Pre-Bloomberg, not aligned |

### C.2 — The 6px problem

`6px` is the single most pervasive violation. It appears in **both layers** because it was the natural "between 4 and 8" compromise. The fix is a **forced binary choice**: dense surfaces use `4px`, breathing surfaces use `8px`. There is no `6px` allowed.

Affected pattern — pill/badge padding: `1px 6px` → `1px 4px` (dense) or `2px 8px` (roomy).

### C.3 — The 14px left-inset problem

`.gam-card-head`, `.gam-card-body`, `.gam-card-header` all use `padding: 8px 12px 8px 14px` to clear the 2px amber rail. The 14px is deliberate — rail (2px) + standard gutter (12px) = 14px. This is a **structural offset, not freehand spacing**, and should be encoded as:

```css
padding-left: calc(var(--bb-s5) + 2px); /* 12px + 2px rail = 14px */
```

This makes the intent legible and immune to the audit filter.

### C.4 — The 10px problem

`10px` appears in modal/drawer paddings (`10px 14px`), hot-now headers, popover padding. These are GAM_CSS legacy values. The fix: `12px` (round up) for breathing surfaces, `8px` for dense modals.

### C.5 — Gap vs padding mismatch

Multiple surfaces have **padding rhythm that does not match inter-element gap rhythm**:

- `.gam-card-head`: outer padding `8px 12px 8px 14px`, inner gap `6px` — gap should be `8px`
- `.pop-drill-toolbar`: padding `6px 8px`, gap `6px` — both should be `8px`
- `.gam-error-state`: padding `10px 12px`, gap `6px` — should be `12px`/`8px`
- `.gam-empty-card`: padding `24px 16px`, gap `10px` — gap should be `8px` or `12px`
- `.gam-kpi-value-row`: gap `3px` — should be `4px`

---

## D. Migration Plan

### Priority tiers

**P0 — Three hardest violations (5px values — explicitly banned in the charter):**

| ID | Selector | Current | Fix |
|----|----------|---------|-----|
| D-01 | `.gam-card-grid2 .pop-btn` (popup.css:1655) | `gap: 5px` | `gap: 4px` |
| D-02 | `.pop-maint-action-row .pop-btn` (popup.css:1753) | `padding: 5px 8px` | `padding: 4px 8px` |
| D-03 | `.gam-empty-state .gam-empty-cta` (popup.css:2095) | `padding: 5px 12px` | `padding: 4px 12px` |

**P1 — High-volume 6px eradication (popup.css, 30+ instances):**

Global find-replace strategy:
- `padding: 6px` → `padding: 8px` (breathing), or `padding: 4px` (dense chips/pills)
- `gap: 6px` → `gap: 8px` (most gaps), or `gap: 4px` (dense strip gaps)
- `padding: 1px 6px` (pills/chips) → `padding: 1px 4px` (tighter) or `padding: 2px 8px` (looser)
- `padding: 6px 8px` → `padding: 8px` (uniform) or `padding: 4px 8px` (dense)

Specific callsites:

| Selector | Current | Fix |
|----------|---------|-----|
| `.pop-alert` | `6px 10px` | `8px 12px` |
| `.pop-actions .pop-btn` | `6px 4px` | `4px 4px` |
| `.pop-btn` base | `6px 12px` | `8px 12px` |
| `.gam-pop-modal-btnrow` gap | `6px` | `8px` |
| `.gam-roster-invite-result` | `6px 8px` | `8px` |
| `.pop-drill-row` | `6px 12px` | `8px 12px` |
| `.pop-drill-pill` | `1px 6px` | `1px 4px` |
| `.pop-maint-chip` | `1px 6px` | `1px 4px` |
| `.gam-card-head` gap | `6px` | `8px` |
| `.gam-card-subsection` | `6px 8px 4px` | `8px 8px 4px` |
| `.gam-card-sub-label` gap | `6px` | `8px` |
| `.gam-crawl-pill` | `3px 6px` | `4px 8px` (or `2px 6px` → `2px 8px`) |
| `.gam-kpi-tile` | `6px 4px` | `8px 4px` |
| `.gam-kpi-value-row` | `gap: 3px` | `gap: 4px` |
| `.gam-qa-btn` | `4px 6px` | `4px 8px` |
| `#lapsedModsChip` gap | `6px` | `8px` |
| `.gam-lead-deepdive summary` gap | `6px` | `8px` |
| `.gam-lead-sub summary` gap | `6px` | `8px` |
| `.gam-lead-sub .sub-body` | `6px 8px` | `8px` |
| `.gam-error-state` | `10px 12px` / gap `6px` | `12px` / gap `8px` |
| `.gam-error-chip` | `2px 6px` | `2px 8px` |
| `.gam-error-retry` | `4px 10px` | `4px 12px` |
| `.gam-stale-chip` | `2px 6px` / gap `6px` | `2px 8px` / gap `4px` |
| `.pop-drill-toolbar` | `6px 8px` / gap `6px` | `8px` / gap `8px` |
| `.pop-drill-filter/.sort` | `3px 6px` | `4px 8px` (or keep `3px 8px` → `4px 8px`) |
| `.pop-drill-export` | `3px 8px` | `4px 8px` |
| empty state card gap | `10px` | `8px` |

**P2 — 14px left-inset formalization (card rail pattern):**

Replace `padding: 8px 12px 8px 14px` in `.gam-card-head`, `.gam-card-body`, `.gam-card-header` with:
```css
padding: 8px 12px 8px calc(var(--bb-s5) + 2px);
```
No pixel change — makes intent visible and auditable.

**P3 — GAM_CSS (modtools.js) alignment (high effort):**

GAM_CSS is a pre-Bloomberg block and has no token coverage. Two options:
- **Option A (surgical):** Replace the most visible off-grid values: `10px → 12px`, `6px → 8px`, `14px → 12px` for modals/drawers. Targeted grep-replace.
- **Option B (additive):** Add a GAM_CSS Bloomberg override block (mirrors what popup.css L665+ does for popup) that re-declares spacing via `--bb-s*` tokens for major surfaces. Non-destructive.

Option B is safer — it does not disturb minified one-liner CSS rules and keeps GAM_CSS audit-frozen while adding compliance at the override layer.

**P4 — `--bb-s*` token alignment audit:**

The Bloomberg token scale is:
```css
--bb-s1: 2px; --bb-s2: 4px; --bb-s3: 6px; --bb-s4: 8px;
--bb-s5: 12px; --bb-s6: 16px; --bb-s7: 24px;
```

**`--bb-s3` is `6px` — this is the root cause.** Every `var(--bb-s3)` usage in the Bloomberg override layer emits an off-grid value. The token must be corrected:

```css
/* BEFORE */
--bb-s3: 6px;
/* AFTER */
--bb-s3: 4px;  /* dense step — was 6, brought on-grid */
```

Impact: any `var(--bb-s3)` callsite shifts from `6px → 4px`. This is a **one-line token fix** that automatically migrates all `6px` gaps/paddings that came through the token. Audit token callsites before committing.

Current `--bb-s3` usages in popup.css (confirmed):
- `padding: var(--bb-s3) var(--bb-s4)` — inputs, maint rows → becomes `4px 8px`
- `margin: 0 0 var(--bb-s3) 0` — section labels → becomes `0 0 4px 0`
- `margin: var(--bb-s3) 0` — stats grid → becomes `4px 0`
- `gap: var(--bb-s3)` — macro list → becomes `4px`

All these become tighter. Visually reasonable at dense Bloomberg density — the 4px step is the **base dense gap**, appropriate for all these contexts.

---

## E. Effort Estimate

| Tier | Items | Type | Effort |
|------|-------|------|--------|
| P0 — 3x `5px` hardcoded | 3 lines | Surgical 1-line edits | 15 min |
| P4 — Fix `--bb-s3: 6px → 4px` token | 1 line, ~8 callsites propagate | Token edit + visual spot-check | 30 min |
| P1 — popup.css hardcoded `6px` remaining after P4 | ~20 lines post-token-fix | Grep-replace by selector | 45 min |
| P1 — popup.css `10px`, `14px` (non-rail) | ~8 lines | Manual per-selector judgment | 30 min |
| P2 — Rail left-inset `calc()` formalization | 3 rules | Cosmetic, no pixel change | 10 min |
| P3 — GAM_CSS override block (Option B) | New ~40-line block in modtools.js | New additive block | 60 min |
| **Total** | | | **~3 hrs** |

### Confidence classification

| Violation class | Count | Auto-fixable | Needs judgment |
|----------------|-------|-------------|----------------|
| `5px` explicit (charter banned) | 3 | Yes | No |
| `6px` via `--bb-s3` token | ~8 (propagated) | Yes (token fix) | No |
| `6px` hardcoded post-token | ~20 | Mostly yes | Check visual density |
| `10px` in padding | ~12 | Round to 12 | Yes — some may go to 8 |
| `14px` rail pattern | 7 | No (calc refactor) | No visual change |
| `3px` micro gaps | 5 | Round to 4 | No |
| GAM_CSS legacy block | 80+ instances | Option B override | Partial |

---

## Summary

The declared `4/8/12/16` grid is **not held**. The gap between the stated contract and the actual CSS is significant:

1. **`--bb-s3: 6px`** is the single most impactful root cause — it is a token that emits an off-grid value and is called in 8+ places in the Bloomberg override layer.
2. **`6px` hardcoded** appears ~30+ times in popup.css across pills, gaps, button paddings, and component separators — a pre-Bloomberg rhythm that was never reconciled.
3. **`14px` left-inset** is a legitimate structural value (rail offset) but is undocumented and triggers false positives in any spacing audit. The `calc()` formalization closes this.
4. **GAM_CSS** (the content-script CSS in `modtools.js`) was authored at a different rhythm entirely and has never been grid-audited. It is largely isolated from the popup layer but shares components (modal, drawer, tooltip) with visible spacing inconsistency.
5. **Three explicit `5px` values** violate the charter's own "no 5/6/7/9/10/11 pixel values" statement — these are the highest-priority fixes.

The fix path is ordered: P0 (3 lines) → P4 (1 token, 8 propagated fixes) → P1 (20 surgical edits) → P2 (cosmetic) → P3 (additive GAM_CSS override block, deferrable).
