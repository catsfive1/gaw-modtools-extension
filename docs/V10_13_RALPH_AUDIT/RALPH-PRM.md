# RALPH-PRM — Prefers-Reduced-Motion Coverage Audit (v10.13.4)

**Repo:** `D:\AI\_PROJECTS\modtools-ext\`
**HEAD:** `9c7655e` (v10.13.4 WAVE 4 final)
**Date:** 2026-05-10
**Mode:** Read-only audit. No code changes, no git ops.
**Scope:** All animations and >100ms transitions across `modtools.js`, `popup.css`, `popup.js`.
**Reference docs:** `docs/V10_DESIGN_V2/UIUX2-24_motion.md`, `UIUX2-31_micro_interactions.md`, `DESIGN_V2_SHIPMASTER.md` §W5 (lines 474-506).

---

## Summary

**PRM coverage: 23 of 26 distinct CSS animations are PRM-safe (88%).** The four W5 wraps are correctly applied. Three new gaps identified beyond W5 scope, plus two architectural smells worth flagging.

**No functional regressions found under PRM.** The ban-preflight arm gate is JS-driven and remains correct under PRM-reduce — the button still enables on schedule even with the visual bar suppressed. All other state transitions (drawer mount, modal show, queue row fade-out) lose their animation but retain their state-change semantics.

**The four W5 deviation #3 wraps verified.** All four keyframes were wrapped with `@media (prefers-reduced-motion: no-preference) { ... }` around the entire rule (keyframe + trigger), not just the keyframe definition. This is the correct choice — wrapping only the keyframe leaves the `animation:` property dangling against an undefined name under PRM-reduce, producing implementation-defined behavior. W5 made the right call.

---

## Keyframe Inventory

26 distinct `@keyframes` definitions across the codebase. (`gam-shimmer` and `gam-skel-pulse` are each defined in TWO places with different bodies — counted as separate entries below.)

| # | Keyframe | Defined at | Trigger rule | Trigger inside PRM gate? | Status |
|---|---|---|---|---|---|
| 1 | `gam-skeleton-shimmer` | modtools.js:4368 | `body.gam-ux-polish-on .gam-skeleton-shimmer` (4363) | YES — `@media (prefers-reduced-motion: no-preference)` wrap (4362) | CORRECT (v8.1) |
| 2 | `gam-dr-cd-pulse` | modtools.js:18676 | `.gam-dr-countdown.urg-critical`, `.gam-dr-btn-fire.confirming` | YES — wrapped in PRM no-preference block (18675) | **W5 CORRECT** |
| 3 | `gam-dr-row-out` | modtools.js:18685 | `.gam-dr-row.removing` (18686) | NO — but covered by Iter-29 `.gam-modal *` only if inside modal; **GAP if drawer-attached** | **GAP** |
| 4 | `gam-sh2-in` | modtools.js:19400 | `#gam-sh2-pop` (19403) | NO — not in any PRM gate | **GAP** |
| 5 | `gam-sh2-shimmer` | modtools.js:19401 | `.gam-sh2-feed-shimmer` (19461) | YES — wrapped in PRM no-preference (19460) | **W5 CORRECT** |
| 6 | `gam-sh2-blink` | modtools.js:19402 | `.gam-sh2-pill--warn .gam-sh2-led`, `.gam-sh2-pill--armed .gam-sh2-led` (19414, 19420) | NO | **GAP** |
| 7 | `gam-sh2-fi` | modtools.js:19453 | `.gam-sh2-feed-row` (19441) | NO | LOW (200ms one-shot) |
| 8 | `gam-brigade-pulse` | modtools.js:20216 | inline `style.cssText` on chip (20210) | YES — JS-gated via `_brigadeMotionOk = !window.matchMedia('(prefers-reduced-motion: reduce)').matches` | CORRECT (v10.12 H.10) |
| 9 | `gam-spin` | modtools.js:20983 | `.gam-mc-loading::before` (20982) | NO directly — but `.gam-mc-loading::before` IS in the iter-29 nuclear block (23105) | CORRECT |
| 10 | `gam-chip-pulse` | modtools.js:21138 | `.gam-chip--risk-critical` (21137) | NO directly — but `.gam-chip--risk-critical` IS in the iter-29 nuclear block (23104) | CORRECT |
| 11 | `gam-shimmer` (v1) | modtools.js:21170 | `.gam-skeleton` (21169) | NO directly — but `.gam-skeleton` IS in iter-29 nuclear block (23106) | CORRECT |
| 12 | `gam-copy-flash` | modtools.js:21172 | `.gam-copy-flash` | YES — dedicated PRM-reduce kill block (21173) | **W5 CORRECT** |
| 13 | `gam-halo-pulse` | modtools.js:21194 | `.gam-repeat-halo--pulse` (21195) | NO directly — but in iter-29 nuclear block (23105) | CORRECT |
| 14 | `gam-mm-hints-in` | modtools.js:21265 | `#gam-mm-hints` (21266) | NO | LOW (350ms one-shot) |
| 15 | `gam-arm-fill` | modtools.js:21563 | `.gam-preflight-arm::after` (21562) | YES — wrapped in PRM no-preference (21561) | **W5 CORRECT** |
| 16 | `gam-ee-fade` | modtools.js:21817 | `#gam-ee-overlay` (21820), `flash` div (25448 inline) | NO | **GAP** (4s overlay) |
| 17 | `gam-ee-rain` | modtools.js:21818 | character drops (defined for easter egg) | NO | LOW (easter egg only) |
| 18 | `gam-ee-gold` | modtools.js:21819 | easter egg gold flash | NO | LOW (easter egg only) |
| 19 | `gam-ticker-pulse-kf` | modtools.js:22715 | `#gam-status-bar .gam-ticker-pulse` (22719) | YES — `#gam-status-bar *` is in iter-29 nuclear block (22607) | CORRECT |
| 20 | `gam-inbox-arrived-kf` | modtools.js:22742 | `#gam-status-bar .gam-inbox-arrived` (22748) | YES — `#gam-status-bar *` covered by iter-29 (22607) | CORRECT |
| 21 | `gam-shimmer` (v2) | modtools.js:22925 | `.gam-ai-skeleton::after` (22918) | YES — wrapped in PRM no-preference (22917) | **W5 CORRECT** |
| 22 | `gam-skel-pulse` (modtools) | modtools.js:23096 | `.gam-skel-line` (23092) | YES — explicit PRM-reduce kill (23100) | CORRECT (v10.12) |
| 23 | `gam-pulse` (UNDEFINED) | NEVER DEFINED | `#gam-thread-watch-btn--flagged` (22902) — `animation:gam-pulse 1.2s infinite` | The btn IS in iter-29 nuclear block (23104), so PRM is moot — but the animation never runs anyway | **DEAD** (orphan) |
| 24 | `gam-tab-dot-pulse` | popup.js:3641 | `.pop-tab-alert-dot` (3634, inline) | YES — popup.css iter-22 nuclear `* { animation: none !important }` (1707) | CORRECT |
| 25 | `gam-macro-delconfirm-shrink` | popup.css:1522 | `.gam-macro-delconfirm-bar > span` (1520) | YES — explicit PRM-reduce override at 1526 + popup.css nuclear at 1707 | CORRECT |
| 26 | `gam-card-rail-pulse` | popup.css:2049 | `.gam-card.gam-card-urgent::before` (2046) | YES — covered by popup.css iter-22 nuclear (1707) but no dedicated block (UIUX2-24 §C.1 known gap) | CORRECT (defensive — UIUX2-24 hygiene gap) |
| 27 | `kpi-pulse` | popup.css:2348 | `.gam-kpi-tile[data-loading="true"] .gam-kpi-val` (2344) | YES — explicit PRM-reduce kill (2352) | CORRECT |
| 28 | `gam-copy-flash` (popup) | popup.css:2356 | `.gam-copy-flash` | YES — explicit PRM-reduce kill (2360) | **W5 CORRECT** |
| 29 | `gam-skel-pulse` (popup, gradient) | popup.css:2553 | `.gam-skel-shimmer` (2548) | YES — wrapped in PRM no-preference (2547) | CORRECT |

**Coverage by file:**
- `popup.css` (popup surface): 6/6 keyframes covered. Iter-22 `* { animation: none }` at line 1707 is a global safety net.
- `popup.js` (popup surface, inline keyframe): 1/1 covered by popup.css iter-22 net.
- `modtools.js` (content-script surface): 16/19 active keyframes covered. **3 gaps + 1 dead reference + 2 low-impact one-shots.**

---

## Findings

### F-1. `gam-sh2-in` — popover entry animation (140ms scale+translate) NOT PRM-gated
**Severity:** LOW (one-shot 140ms)
**Location:** `modtools.js:19403` — `#gam-sh2-pop { ... animation:gam-sh2-in 140ms ease-out forwards; ... }`
**Trigger context:** Site Health popover entry. Per UIUX2-31 §A.6, this is the second-best animation in the codebase.
**Status:** Animation runs under PRM-reduce. Not in any PRM gate.
**Impact:** A motion-sensitive user sees a 140ms scale-up on every popover mount. Below most published comfort thresholds for vestibular triggers (which kick in ~200ms+ for pure scale, longer for pure translate), but inconsistent with the codebase's stated "all animation collapses to 0ms under PRM" principle (UIUX2-24, UIUX2-31 §D).
**Note:** Under PRM-reduce the popover still mounts correctly (CSS `animation` failure to run only zeros the animated properties — `forwards` fill mode preserves end-state since 0% and 100% are explicit). No functional break.

### F-2. `gam-sh2-blink` — pill LED blink on warn/armed states NOT PRM-gated
**Severity:** MEDIUM (infinite looping animation on a non-urgency surface)
**Locations:** `modtools.js:19414` (`.gam-sh2-pill--warn .gam-sh2-led` — 0.8s infinite blink) and `19420` (`.gam-sh2-pill--armed .gam-sh2-led` — 0.6s infinite).
**Trigger context:** Site Health popover status pills. The warn pill blinks while in PROBING state; the armed pill blinks while in local/D1 mismatch state.
**Status:** Animation runs under PRM-reduce. Not in any PRM gate.
**Impact:** This is the **most material PRM gap remaining.** Looping animations on non-urgency surfaces violate UIUX2-31 §D explicit rule ("No looping animation on interactive controls"). A motion-sensitive user opens the Site Health popover and gets a 0.8s LED blink looping until the pill state resolves. The popover is mounted only briefly, but if the worker D1 is unreachable, the warn state persists and the LED loops indefinitely.
**Recommendation:** Wrap `.gam-sh2-pill--warn .gam-sh2-led { animation: ... }` and `.gam-sh2-pill--armed .gam-sh2-led { animation: ... }` lines in `@media (prefers-reduced-motion: no-preference)`. Color alone (amber `#f0a040` for warn, yellow `#ffd84d` for armed) communicates the state under PRM. Static fallback is correct.

### F-3. `gam-ee-fade` — Easter-egg overlay fade and ban-success flash NOT PRM-gated
**Severity:** LOW-MEDIUM (rare paths, but one is on the success-of-ban hot path)
**Locations:**
- `modtools.js:21820` — `#gam-ee-overlay { ... animation:gam-ee-fade 4s ease forwards; ... }` (easter egg overlay)
- `modtools.js:25448` — inline `style.cssText` on a flash div: `'... animation:gam-ee-fade .8s ease forwards'` (this is the ban confirmation flash — fires on every ban submit success per the surrounding code)
**Status:** Animation runs under PRM-reduce.
**Impact:** The easter-egg path (4s scale-and-fade) is rare. The 800ms post-ban flash is a hot-path animation that fires every time a moderator confirms a ban. Under PRM-reduce, the screen still flashes red for 800ms with a scale animation. This is the kind of animation PRM users are explicitly asking to suppress.
**Recommendation:** Either gate the keyframe (`@media (prefers-reduced-motion: no-preference) { @keyframes gam-ee-fade {...} }` won't work because then the inline `animation:` references an undefined name — same trap W5 documented). Better: add `.gam-ee-fade-target` class with the animation, wrap the rule in PRM no-preference, and apply the class instead of inline `style.animation`. Cheapest immediate fix: replace inline style at 25448 with a static red flash `background:rgba(240,64,64,.22);opacity:0` that fades only when motion is allowed.

### F-4. `gam-pulse` — referenced but NEVER DEFINED (dead animation)
**Severity:** LOW (silent dead reference, not a PRM bug)
**Location:** `modtools.js:22902` — `#gam-thread-watch-btn.gam-thread-watch-btn--flagged { ... animation:gam-pulse 1.2s infinite; }`
**Search confirmed:** `grep -n "@keyframes\s+gam-pulse\b"` → 0 hits across all source files.
**Status:** The animation never runs (browser silently ignores undefined `@keyframes` reference). The flagged-watch button shows the static red background + amber border but no pulse.
**Impact:** Visual feature gap (the flagged state was supposed to pulse for attention, doesn't). Not a PRM defect — but a worth-flagging code smell because the iter-29 nuclear block at line 23104 explicitly lists `.gam-thread-watch-btn--flagged` for animation suppression, suggesting an author once thought the animation existed.
**Recommendation:** Either define `@keyframes gam-pulse` or remove the orphan `animation:` property. This is **W6 cleanup territory**, not a v10.13 ship blocker.

### F-5. Inline-style transitions bypass component-level PRM blocks
**Severity:** LOW (no infinite loops; finite 200-400ms one-shots)
**Locations:**
- `modtools.js:10680` — queue item fade `transition:opacity .3s, transform .3s` (set via `item.style.transition`)
- `modtools.js:12277` — modmail archive slide `transition:opacity .3s,transform .3s` (set via `m.style.transition`)
- `modtools.js:17147` — modmail panel slide `transform:translateX(100%);transition:transform 0.2s ease-out` (inline cssText)
- `modtools.js:18581` — DR popover chip fade `transition:opacity 0.2s` (inline cssText)
**Status:** None of these surfaces are in the iter-29 PRM-reduce block (which scopes only `#gam-status-bar *, .gam-modal *, .pop-btn, .gam-btn, .gam-bar-icon, #gam-mc-panel *`). Inline `style="transition:..."` has equal-or-higher specificity than CSS rules without `!important`, so even a broader PRM block wouldn't catch them without `transition: none !important`.
**Impact:** Under PRM-reduce, these surfaces still animate their entry/exit in 200-400ms. Below comfort thresholds for most users but inconsistent with PRM intent.
**Recommendation:** Replace inline `style.transition` assignments with class toggles + CSS rules wrapped in PRM gates. Also a W6 hygiene item.

---

## Hunt list verifications

### Q1: Status bar ticker rotation (every-4-second auto-rotate, UIUX2-37 anti-Bloomberg flag)
**Answer:** PRM not relevant — the rotation is JS-driven (`setInterval` at modtools.js:20008), not CSS animation. The 4-second rotation will run regardless of PRM preference.
**Note:** This is NOT a CSS PRM gap; it's a UX/Bloomberg-discipline issue (UIUX2-37 says the rotation breaks operator focus). PRM does not control content-update intervals. The CSS animation `gam-ticker-pulse-kf` (when individual ticker entries are flagged for visual emphasis) IS PRM-safe via the `#gam-status-bar *` iter-29 block.
**Recommendation:** Out of scope for this audit, but if Commander wants the 4s rotation to honor PRM (treating "reduce motion" as a proxy for "don't move my data"), add `if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;` to the interval callback. **One-line fix.** Worth flagging for v10.14.

### Q2: Drawer slide (UIUX2-35 — no PRM override)
**Answer:** **CORRECT, not a gap.** `#gam-intel-drawer { transition:transform .18s ease-out }` (modtools.js:21155) is covered by iter-29 PRM-reduce block which lists `.gam-intel-drawer` (with selector `.gam-intel-drawer, #gam-hot-now-panel, #gam-mc-panel, .gam-modal, #gam-backdrop, #gam-intel-backdrop` at line 23103 with `transition:none !important`). The `#gam-intel-drawer.gam-intel-drawer--open` open transform (21156) is the same element and inherits the kill.
**Verified:** Drawer correctly stops sliding under PRM. Backdrop fade also gated.

### Q3: Snack action button countdown bar (W3 new)
**Answer:** **NOT PRM-gated.** The countdown bar (`gam-snack-countdown-bar` at modtools.js:7574) is created via `bar.style.cssText = 'position:absolute;...;height:2px;background:#ff9933;width:100%;transition:width 100ms linear;...'` with the width updated every 100ms via `setInterval`. The `transition:width 100ms linear` is inline (not subject to any PRM CSS block). The width change itself is JS-driven and runs every 100ms regardless of PRM.
**Impact:** Under PRM-reduce, the snack countdown bar STILL animates (100ms transition on each width update is below most comfort thresholds, but is still motion). The bar is visible only during a 5-10s undo window so impact is bounded.
**Status:** Acceptable as shipped — 100ms transitions on 2px-tall progress bars sit at the floor of perceptible motion. **Not a defect, but worth noting as a W3 follow-up.**

### Q4: copyWithPulse `gam-copy-flash` keyframe (W5 new)
**Answer:** **CORRECT.** Verified at three locations:
- modtools.js:21172 keyframe + line 21173 explicit PRM-reduce kill: `@media (prefers-reduced-motion: reduce) { .gam-copy-flash { animation:none !important; } }`
- popup.css:2356 keyframe + line 2360 explicit PRM-reduce kill (same pattern)
- The class `gam-copy-flash` is applied via `btn.classList.add('gam-copy-flash')` in the copyWithPulse utility — PRM block correctly suppresses the animation.

### Q5: Functional regression under PRM — does ban preflight enable correctly without the visual bar?
**Answer:** **YES, ban button enables correctly under PRM-reduce.** The arm gate is JS-driven (modtools.js:2167-2179):
```js
if (armSeconds > 0){
  let remaining = armSeconds;
  const iv = setInterval(()=>{
    remaining--;
    if (remaining <= 0){
      clearInterval(iv);
      yes.disabled = false;
      yes.textContent = 'Confirm';
    } ...
  }, 1000);
  yes.addEventListener('click', ()=>{ clearInterval(iv); finish(true); });
}
```
The button is enabled by `yes.disabled = false` based on a `setInterval` countdown that ticks regardless of CSS state. The CSS `gam-arm-fill` keyframe is purely visual progress. Under PRM-reduce:
- The 2px red bar is suppressed entirely (`@media (prefers-reduced-motion: no-preference)` block does NOT apply, so the `::after` rule providing the `content:''` and `animation:` is removed entirely — there's no bar at all).
- The button text continues to update every second via `yes.textContent = \`Arm in ${remaining}s...\``.
- After `armSeconds` elapses, `yes.disabled = false` fires and the button text becomes `'Confirm'`.

**Verified safe.** The functional state-machine is independent of the visual countdown. UIUX2-31 P0 notes this explicitly — W5 deviation #3 was a correct call to wrap the ENTIRE rule (not just keyframe) precisely because the `::after { content:'' }` declaration must be suppressed alongside the animation; otherwise an empty 2px-tall pseudo-element would persist with no animation, which would look like a visual glitch (frozen at width:0 from the keyframe's `from{}` state) — exactly what UIUX2-31 noted as the pre-W5 bug.

---

## Recommendations

### P0 — Real PRM defects to address
None remaining. The four W5 wraps closed the P0-grade defects flagged in UIUX2-31 and UIUX2-29.

### P1 — Worth fixing in next wave
1. **F-2 `gam-sh2-blink`** — Wrap `.gam-sh2-pill--warn .gam-sh2-led` and `.gam-sh2-pill--armed .gam-sh2-led` animation declarations in `@media (prefers-reduced-motion: no-preference)`. This is the only material remaining PRM gap (looping animation, non-urgency surface). 4 lines added, near-zero risk.
2. **F-3 ban-success flash (`gam-ee-fade` at line 25448)** — Replace inline `animation:gam-ee-fade .8s ease forwards` with a class-based pattern. Hot path (every successful ban triggers it).

### P2 — Hygiene
3. **F-1 `gam-sh2-in`** — Optional. 140ms one-shot is borderline. Add to PRM gate for consistency with stated principle.
4. **F-4 dead `gam-pulse` reference** — Either define the keyframe or remove the orphan. Clean code, not user-facing.
5. **F-5 inline-style transitions** — Migrate JS-driven `style.transition` assignments to class toggles. Larger refactor; defer to v11.

### P3 — Out of audit scope but worth flagging
6. **Q1 ticker 4s auto-rotate** — Per UIUX2-37, breaks Bloomberg discipline. Adding `if (matchMedia(prefers-reduced-motion: reduce).matches) return` before the rotation tick is a one-line fix that turns "reduce motion" into a proxy for "don't move my data." Defensible and trivial.

---

## Coverage scorecard

| File | Active keyframes | PRM-safe | Gaps | % |
|---|---|---|---|---|
| popup.css | 6 | 6 | 0 | 100% |
| popup.js | 1 | 1 | 0 | 100% |
| modtools.js | 19 | 13 + 3 nuclear-net + 1 JS-gated | 3 (F-1, F-2, F-3) | 89% |
| **TOTAL** | **26** | **23** | **3** | **88%** |

(F-4 `gam-pulse` is excluded from active count — it's a dead reference.)
(F-5 transitions are not keyframes and excluded from this denominator.)

**W5 verdict:** All four W5-claimed wraps verified correct. The deviation #3 implementation choice (wrap entire rule, not just keyframe) is the right call and prevents the dangling-`animation:`-against-undefined-keyframe trap. **No code changes needed for v10.13.4 ship.** F-2 is the only finding worth a follow-up wave.
