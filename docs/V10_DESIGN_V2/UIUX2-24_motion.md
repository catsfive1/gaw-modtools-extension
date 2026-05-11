# UIUX2-24 — Motion Design System Audit (v10.13 Design Ralph V2)

**Scope:** `popup.css` (sole shipped CSS surface) + `modtools.js` GAM_CSS inline block.
**Token baseline:** `--bb-motion-*` (4-tier, added v10.12 UIUX-18 §C.1).
**Date:** 2026-05-10

---

## A. Token-Usage Audit — `--bb-motion-*` vs Hardcoded ms

### Token definitions confirmed in both surfaces

```css
/* popup.css line 2320-2330 */
:root {
  --bb-motion-instant: 50ms;
  --bb-motion-fast:    120ms;
  --bb-motion-base:    200ms;
  --bb-motion-slow:    400ms;
  --bb-ease-decel:     cubic-bezier(0,0,0.2,1);
  --bb-ease-accel:     cubic-bezier(0.4,0,1,1);
  --bb-ease-standard:  cubic-bezier(0.2,0,0,1);
  --bb-ease-spring:    cubic-bezier(0.34,1.56,0.64,1);
  --bb-ease-linear:    linear;
}
```

Tokens are defined (additive-only per UIUX-18 §C.1 note). **Zero callsite migration has occurred.**

### All transition call sites in popup.css

| Line | Rule context | Duration used | Token? | Notes |
|---|---|---|---|---|
| 66 | `.pop-stat` hover | `.12s` | No | 120ms — should be `--bb-motion-fast` |
| 141 | button base | `.1s` | No | 100ms — between instant (50) and fast (120); should align to fast |
| 179 | link color | `.12s` | No | 120ms — should be `--bb-motion-fast` |
| 217 | input/select | `.1s` | No | 100ms — should align to fast |
| 288 | border-color | `.12s` | No | 120ms — should be `--bb-motion-fast` |
| 476 | nav tab | `.12s` | No | 120ms — should be `--bb-motion-fast` |
| 506 | table row bg | `.1s` | No | 100ms — should align to fast |
| 772 | `.gam-btn` | `100ms ease-out` | No | Close to fast; easing also hardcoded |
| 882 | mod button | `100ms` | No | Hardcoded; no easing |
| 930 | secondary btn | `100ms` | No | Hardcoded |
| 1312 | chip/badge | `100ms ease-out` | No | Hardcoded |
| 1320 | transform (accordion?) | `120ms ease-out` | No | 120ms = fast; easing hardcoded |
| 1394 | list row bg | `.1s` | No | 100ms hardcoded |
| 1485 | progress bar width | `120ms ease` | No | 120ms = fast; generic `ease` not a system curve |
| 1555 | panel transform | `160ms ease` | No | 160ms = **not a token value**; between fast (120) and base (200) |
| 1740 | sidebar row bg | `80ms ease-out` | No | 80ms = **not a token value**; below instant (50) threshold for hover |
| 1760 | sidebar row color | `80ms ease-out` | No | Same issue |
| 1827 | nav item bg | `80ms var(--gam-ease-decelerate)` | Partial | Uses legacy `--gam-ease-decelerate`; duration hardcoded |
| 1899 | nav item bg+color | `80ms var(--gam-ease-decelerate)` | Partial | Same as above |
| 2103 | skeleton fallback bg | `0.12s` | No | 120ms — should be `--bb-motion-fast` |
| 2153 | queue row bg | `0.12s` | No | 120ms hardcoded |
| 2234 | spark bar | `200ms` | No | 200ms = base; should be `var(--bb-motion-base)` |

### Summary

| Category | Count |
|---|---|
| Total `transition:` rules | 22 |
| Using `--bb-motion-*` token | **0** |
| Using legacy `--gam-dur-*` / `--gam-ease-*` | 2 (partial — easing only, duration still hardcoded) |
| Fully hardcoded | **20** |
| Off-token durations (160ms, 80ms, 100ms not in tier set) | **6** |

**Verdict: 0% callsite adoption.** The tokens are defined but orphaned. All motion is driven by hardcoded literals, several of which use values (80ms, 100ms, 160ms) that fall between token tiers and will silently diverge from any future token change.

Also notable: a parallel legacy token set (`--gam-dur-*`, `--gam-ease-*`) added in v10.5 also has 0% callsite adoption except 2 easing-only uses. There are now **two** motion token systems in `:root` with no consumers.

---

## B. Decorative-vs-Purposeful Motion Classification

### Purposeful — state change

| Surface | Implementation | Classification |
|---|---|---|
| Button hover (bg, border, color) | `transition: ... 100ms` across ~8 rules | PURPOSEFUL — state feedback |
| Nav tab active | `transition: color .12s, background .12s` | PURPOSEFUL — state change |
| Sidebar row hover | `transition: background 80ms, border-left-color 80ms` | PURPOSEFUL — location feedback |
| Input focus border | `transition: border-color .12s` | PURPOSEFUL — focus state |
| Progress bar fill | `transition: width 120ms ease` | PURPOSEFUL — data change indicator |
| Spark bar color | `transition: background 200ms` | PURPOSEFUL — data state change |

### Purposeful — entrance/exit

| Surface | Implementation | Classification |
|---|---|---|
| Panel/accordion open | `transition: transform 160ms ease` | PURPOSEFUL — spatial navigation |

### Ambient (informational, not decorative)

| Surface | Implementation | Classification |
|---|---|---|
| KPI loading pulse (`kpi-pulse`) | `1.2s ease-in-out infinite` — opacity 0.4 -> 0.9 | INFORMATIONAL — signals data loading state. Borderline: duration (1.2s) is very long but conveys "waiting" semantically. |
| Urgent card rail pulse (`gam-card-rail-pulse`) | `1.8s ease-in-out infinite` — opacity 1 -> 0.35 | INFORMATIONAL — signals alert state. Acceptable as long as PRM kills it. |
| Skeleton shimmer (`gam-skel-pulse`) | `2s linear infinite` — bg position sweep | INFORMATIONAL — loading state indicator. Already correctly gated behind `no-preference`. |

### Decorative — none identified

No purely cosmetic animations (entrances that add delight with no state meaning, hover sparkle, background parallax, etc.) exist in the codebase. Motion discipline is good at the classification level — every animation maps to a real state.

**Finding:** All existing motion is purposeful or informational. No decorative motion to remove.

---

## C. Prefers-Reduced-Motion Coverage Gaps

### Coverage map

| Surface | PRM handling | Status |
|---|---|---|
| **Skeleton shimmer** (`gam-skel-pulse`) | Correctly inside `@media (prefers-reduced-motion: no-preference)` — opt-in | CORRECT |
| **KPI loading pulse** (`kpi-pulse`) | `@media (prefers-reduced-motion: reduce) { animation: none !important }` at line 1874 | CORRECT |
| **Iter 22 nuclear rule** | `@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }` at line 1237 | CORRECT — catches all transitions in popup |
| **Urgent card rail pulse** (`gam-card-rail-pulse`) | NOT covered by a dedicated PRM block | GAP — relies solely on the iter-22 `*` rule |
| **GAM_CSS in modtools.js** — brigade pulse | JS-gated at runtime: `!window.matchMedia('(prefers-reduced-motion: reduce)').matches` (line 19326) | CORRECT |
| **GAM_CSS in modtools.js** — shimmer | `@media (prefers-reduced-motion: no-preference)` guard | CORRECT |
| **GAM_CSS in modtools.js** — general CSS transitions | `@media (prefers-reduced-motion: reduce)` blocks at lines 21008, 21704, 22185, 22203 | CORRECT |

### Gap analysis

1. **`gam-card-rail-pulse` has no dedicated PRM block** (popup.css line 1579). It is covered by the iter-22 nuclear rule (`* { animation: none !important }`), but that rule is a blunt instrument that disables ALL animation simultaneously. If the iter-22 rule is ever scoped or removed, the urgent card pulse becomes an unguarded infinite animation for motion-sensitive users. Add a dedicated block.

2. **The iter-22 nuclear rule is a coverage smell.** It works, but it means individual components never need their own PRM handling, making it impossible to tell at a glance whether each animation is intentionally guarded. Future components added to popup.css can skip PRM discipline entirely and still "pass" because of the nuclear fallback. Preferred pattern: each animation block has its own `@media (prefers-reduced-motion: reduce)` sibling (like kpi-pulse does), and the nuclear rule becomes a safety net rather than the primary mechanism.

3. **Token PRM integration planned but not shipped.** UIUX-18 §D specifies setting `--bb-motion-*` to `0ms` inside a PRM override block. That block does not exist in popup.css as shipped. The nuclear rule's `transition: none` achieves the same effect for existing rules, but once token-based rules are added the PRM token zeroing will be needed for correctness.

---

## D. Easing Curve Consistency

### Token inventory

**`--bb-*` easing tokens (v10.12, popup.css line 2325):**

| Token | Curve | Semantic intent |
|---|---|---|
| `--bb-ease-decel` | `cubic-bezier(0,0,0.2,1)` | Entrance — element enters fast, settles |
| `--bb-ease-accel` | `cubic-bezier(0.4,0,1,1)` | Exit — element starts slow, leaves fast |
| `--bb-ease-standard` | `cubic-bezier(0.2,0,0,1)` | State change — controlled, slightly fast start |
| `--bb-ease-spring` | `cubic-bezier(0.34,1.56,0.64,1)` | Micro confirmation — overshoot signals success |
| `--bb-ease-linear` | `linear` | Ambient loops — no acceleration meaning |

**`--gam-ease-*` tokens (v10.5, popup.css line 712 — legacy parallel set):**

| Token | Curve | Overlap with `--bb-*`? |
|---|---|---|
| `--gam-ease-decelerate` | `cubic-bezier(0,0,0.2,1)` | Identical to `--bb-ease-decel` |
| `--gam-ease-accelerate` | `cubic-bezier(0.4,0,1,1)` | Identical to `--bb-ease-accel` |
| `--gam-ease-spring` | `cubic-bezier(0.34,1.56,0.64,1)` | Identical to `--bb-ease-spring` |

**Two token sets defining the same curves under different names. No consumer is using either `--bb-ease-*` or `--gam-ease-*` tokens at call sites.**

### Actual easing in use at call sites

| Easing string used | Occurrences | Correct token equivalent |
|---|---|---|
| `ease-out` (keyword) | 6 | Closest: `--bb-ease-standard` (not exact — `ease-out` = `cubic-bezier(0,0,0.58,1)`) |
| `ease-in-out` (keyword) | 2 (on infinite animations) | `--bb-ease-linear` would be more appropriate for ambient pulses |
| `ease` (keyword) | 2 | Generic — no system equivalent, closest to standard |
| `var(--gam-ease-decelerate)` | 2 | Partially correct easing token; duration still hardcoded |
| No easing specified | ~10 | Defaults to `ease` keyword |
| System token (`--bb-ease-*`) | **0** | — |

### Easing issues

1. **`ease-out` vs `cubic-bezier(0,0,0.58,1)` vs `--bb-ease-standard`**: The keyword `ease-out` is close to but not identical to any system token. Six call sites use it, creating subtle inconsistency in how state changes feel versus how system tokens will behave once adopted.

2. **Infinite pulse animations use `ease-in-out`**: The `kpi-pulse` and `gam-card-rail-pulse` animations use `ease-in-out`. For looping ambient animations, `linear` or a symmetric cubic-bezier creates a more natural repeat. `ease-in-out` creates perceptible "clunk" at loop seam. Should use `--bb-ease-linear`.

3. **Duplicate token sets must be collapsed.** The `--gam-ease-*` set is identical to `--bb-ease-*`. Before token migration, deprecate `--gam-ease-*` in favor of `--bb-ease-*` and update the 2 partial consumers. Keeping both is maintenance debt with no benefit.

---

## E. Effort Estimate

### E.1 — Wire `--bb-motion-*` tokens into all popup.css `transition:` rules

Mechanical find/replace of 22 call sites. Requires judgment on the 6 off-token values (80ms, 100ms, 160ms) — each needs a decision: round up to `--bb-motion-fast` (120ms) or `--bb-motion-instant` (50ms).

- 100ms sites (8 occurrences): round to `--bb-motion-fast` (120ms). The 20ms difference is imperceptible; consistency wins.
- 80ms sites (3 occurrences): round to `--bb-motion-fast` (120ms). Hover feedback at 80ms vs 120ms is within JND; again consistency wins.
- 160ms panel transform (1 occurrence): round to `--bb-motion-base` (200ms). Panel opens feel slightly more deliberate — acceptable.

**Effort: 1.5h. Risk: Low — mechanical. Verify no visual regression on button hover and panel open.**

### E.2 — Add PRM token-zeroing block to popup.css

Add the planned UIUX-18 §D block setting all `--bb-motion-*` to `0ms` inside `prefers-reduced-motion: reduce`. This makes the system future-proof once token adoption is complete.

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --bb-motion-instant: 0ms;
    --bb-motion-fast:    0ms;
    --bb-motion-base:    0ms;
    --bb-motion-slow:    0ms;
  }
}
```

**Effort: 15m. Risk: None — additive.**

### E.3 — Add dedicated PRM block for `gam-card-rail-pulse`

```css
@media (prefers-reduced-motion: reduce) {
  .gam-card.gam-card-urgent::before { animation: none; opacity: 1; }
}
```

**Effort: 10m. Risk: None.**

### E.4 — Fix infinite animation easing (`ease-in-out` -> `linear`)

Update `kpi-pulse` and `gam-card-rail-pulse` animation declarations to use `linear` (or `--bb-ease-linear` once tokens are wired).

**Effort: 15m. Risk: Low — visual-only, minor aesthetic improvement.**

### E.5 — Collapse duplicate easing token sets

Deprecate `--gam-ease-decelerate`, `--gam-ease-accelerate`, `--gam-ease-spring`. Update the 2 partial consumers at lines 1827 and 1899 to use `--bb-ease-decel`. Remove the old tokens from `:root` (or leave as aliases pointing to `--bb-*` for one version cycle).

**Effort: 30m. Risk: Low — verify the 2 nav item consumers visually.**

### E.6 — Wire easing tokens into all call sites

After E.1 (duration tokens wired), replace hardcoded easing keywords with system tokens. Assign by intent:
- State-change `transition` (color, bg, border) -> `--bb-ease-standard`
- Entrance transform -> `--bb-ease-decel`
- Exit transform -> `--bb-ease-accel`

**Effort: 1h. Risk: Low — easing changes are subtle; review button hover and panel animations.**

### E.7 — Elevate iter-22 nuclear PRM rule to component-level guards

Long-term: add sibling `@media (prefers-reduced-motion: reduce)` blocks for each animation-capable component. Iter-22 nuclear rule becomes explicit safety net with a comment. This is hygiene, not functional.

**Effort: 2h. Risk: None.**

---

## Prioritized Execution Order

| # | Task | Effort | Blocks |
|---|---|---|---|
| 1 | E.2 — PRM token-zeroing block | 15m | Nothing — additive |
| 2 | E.3 — Dedicated PRM for card rail pulse | 10m | Nothing — additive |
| 3 | E.5 — Collapse duplicate easing tokens | 30m | E.6 |
| 4 | E.4 — Fix pulse animation easing | 15m | Nothing |
| 5 | E.1 — Wire duration tokens | 1.5h | E.6 |
| 6 | E.6 — Wire easing tokens | 1h | E.1 |
| 7 | E.7 — Component-level PRM guards | 2h | E.1, E.6 |

**Total: ~5.5h to full token adoption and consistent motion system.**
Tasks 1-4 are zero-risk additive work that can ship immediately. Tasks 5-7 are the main migration.
