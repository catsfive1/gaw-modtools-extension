# UIUX-16 — Status Bar Design Review

**Scope:** `buildStatusBar()` (~L17763–L18194) + Bloomberg-theme CSS overrides
(L19252–19306, L19914–19996, L20640–20750).
**Status:** Read-only critique. No code changes in this document.
**Theme:** Bloomberg Terminal amber — `--bb-amber #ff9933`.

---

## A. Critique — What Is Already Good (90%)

The bar is genuinely strong. These are the parts that don't need touching:

| Area | What Works |
|---|---|
| Pill geometry | `border-radius:14px`, `height:26–28px`, centered float — looks like a proper floating HUD, not a browser toolbar chrome |
| Hover affordance | Amber fill + amber border + amber text on `:hover` — three simultaneous signals, zero ambiguity |
| Hit-target engineering | `::after { inset: -10px }` gives ~42px touch surface on a 22px visual target — correct Bloomberg Terminal density |
| Focus-visible ring | `outline: 1px solid var(--bb-amber); outline-offset: 1px` — keyboard accessible, no ugly browser default |
| Ticker hover-pause | `__tickerPaused` gate on the 4-second interval — shipped and working |
| Siren severity tier | `isHot` test (recentDr >= 5 OR comment_count_24h > 8) drives RED vs WARN color — already weight-coded |
| Inbox badge | `data-count` pseudo-element badge + `gam-inbox-arrived` scale animation on new mail — clean pattern |
| Aria labels | Every interactive element has `aria-label` (M11 sweep) — screen-reader accessible |
| Delegated custom tooltip | `gam-bar-custom-tip` positioned ABOVE bar at z:99999998 — avoids native tooltip rendering below cursor |
| Ticker tabular-nums | `font-variant-numeric:tabular-nums` on the ticker container — numbers don't jitter width on update |
| Session dot semantics | Null/green/red color states, clickable live health probe — dot is meaningful, not decoration |
| Fallback lock/unlock | FallbackMode drives lock emoji color (WARN vs TEXT2) — state is readable at a glance |

**Commander praised the STATUS popover.** The popover pattern (site-health, SUS, DR, Queue, Modmail, AutoUnsticky) is solid — consistent anchor-to-icon, no page navigation required. That architecture is done; don't touch it.

---

## B. The Next 10% — Polish Proposals

### B1. Weight Categories: Severity = Font-Weight + Color (not color alone)

**Problem identified in code:**

The ticker uses `color` as the sole severity signal. Current states:

```
'site quiet'   --bb-ink-faint   (barely visible)
'X SUS'        --bb-red         (hot)
'Y DR PENDING' --bb-yellow
'Z POSTS Q'    --bb-cyan
'N MODMAIL'    --bb-amber       (pulse=true)
'N AUTO Q'     --bb-purple
'N OP DEL'     #ff3b3b (hardcoded, not a token)
```

Color alone violates WCAG SC 1.4.1. More practically: at arm's length on a dark monitor, `--bb-cyan` (low-urgency queue) and `--bb-red` (SUS emergency) look equally saturated — the only difference is hue. A moderator scanning peripherally may not catch that 18 SUS is more urgent than 4 posts queued.

**Proposal: severity weight tiers.**

Map each ticker `kind` to a weight tier. No new colors needed — just `font-weight` + a very subtle `letter-spacing` bump:

| Kind | Severity | font-weight | letter-spacing |
|---|---|---|---|
| `quiet` | 0 — passive | 400 | 0.04em (current) |
| `queue` | 1 — informational | 500 | 0.05em |
| `dr` | 2 — elevated | 600 | 0.06em |
| `auto` | 2 — elevated | 600 | 0.06em |
| `modmail` | 3 — urgent | 700 | 0.07em |
| `sus` | 3 — urgent | 700 | 0.07em |
| `opdel` | 3 — urgent | 700 | 0.07em |

Implementation: add a `weight` field to each state object in `__updateTicker()`, then write it to `tickerEl.style.fontWeight` and `tickerEl.style.letterSpacing`. ~12 lines of JS. Zero new CSS classes.

This also fixes the `OP DEL` hardcoded hex (`#ff3b3b`) — that should be `var(--bb-red)`.

**Estimated effort:** 1 hour. JS only, no CSS refactor.

---

### B2. State-Change Transition Animation on Ticker Rotation

**Problem identified in code:**

When `__tickerIdx` advances every 4 seconds, the ticker's `textContent` is replaced instantly:

```js
tickerEl.textContent = cur.msg;
tickerEl.style.color = cur.color;
```

No crossfade, no slide. The text just blinks to the new state. On a dark terminal aesthetic, an instantaneous text swap reads as a glitch, not an update.

**Proposal: 150ms opacity crossfade on rotation.**

```js
// In __updateTicker(), wrap the DOM write:
tickerEl.style.opacity = '0';
requestAnimationFrame(() => {
  tickerEl.textContent = cur.msg;
  tickerEl.style.color = cur.color;
  tickerEl.style.fontWeight = cur.weight || '600';
  tickerEl.style.opacity = '1';
});
```

Add to CSS:

```css
#gam-status-bar .gam-bar-ticker {
  transition: opacity 150ms ease-out, color 150ms ease-out;
}
```

The existing `transition: opacity 200ms` is already on `.gam-bar-custom-tip` — same pattern, consistent with established motion vocabulary. Respects `prefers-reduced-motion` automatically if we add:

```css
@media (prefers-reduced-motion: reduce) {
  #gam-status-bar .gam-bar-ticker { transition: none; }
}
```

**Estimated effort:** 2 hours (JS + CSS + reduced-motion guard).

---

### B3. Siren Button — Animate the Count on Increment

**Problem identified in code:**

`_updateSirenChip()` runs every 30 seconds. When `total` increases, the count in `sirenBtn.innerHTML` is replaced silently. There is no visual feedback that the number just changed — the moderator has to notice the number itself changed.

The inbox already does this correctly with `gam-inbox-arrived` (scale 1 → 1.15 → 1.05 → 1, 0.7s, 3 repetitions). The siren has no equivalent.

**Proposal: reuse the `gam-inbox-arrived` animation pattern for the siren count span.**

When `total > previousTotal`, add a class like `gam-siren-bumped` that fires a 0.5s scale+color flash. The flash is on the `<span>` inside `sirenBtn.innerHTML` (the number), not the whole button — surgical, not noisy.

```css
@keyframes gam-siren-bumped-kf {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.25); }
  100% { transform: scale(1); }
}
.gam-siren-bumped { animation: gam-siren-bumped-kf 0.5s ease-out 1; }
```

Track `previousTotal` in a closure var inside `_updateSirenChip`. When bumped, set class on the span and `setTimeout` to remove it after 600ms.

**Estimated effort:** 1.5 hours.

---

### B4. Mini-Sparkline Next to the Ticker

**Proposal assessment: ship a simplified version, not a real sparkline.**

A canvas/SVG sparkline next to the ticker would require:
- Storing a rolling window of numeric state (30 samples at 30s intervals = 15 minutes of history).
- Rendering into a `<canvas>` or inline `<svg>` inside the ticker's fixed `max-width:200px`.
- Handling the 6 different ticker `kind` values (each has a different numeric meaning).

The honest problems:

1. **Mixed units.** The ticker cycles through SUS count, DR count, posts queued, modmail count — all different scales. A single sparkline conflates them. A multi-series sparkline doesn't fit in 200px next to a text label.

2. **The bar height is 26px.** A sparkline that's visible at 26px height requires 12–16px of sparkline height, leaving 10–14px for everything else. That's tight.

3. **Better alternative already exists:** the ticker click opens a full popover (SUS popover, DR popover, etc.) with full data. The sparkline's job — showing trend — is redundant with the popover.

**Verdict:** skip the sparkline. The ROI is negative given the popover architecture already in place.

**What to do instead:** Add a subtle trend indicator — a single Unicode arrow (`▲` / `▼` / `=`) that appears when the current state's count is higher/lower than the previous sample. Costs 20 lines of JS, zero CSS, and gives the "is this getting worse" signal without a sparkline.

```js
// In state object construction:
states.push({
  msg: susCount + ' SUS',
  trend: susCount > _prevSusCount ? 'up' : (susCount < _prevSusCount ? 'down' : 'eq'),
  ...
});

// In render:
const trendGlyph = { up: ' ▲', down: ' ▼', eq: '' }[cur.trend || 'eq'];
tickerEl.textContent = cur.msg + trendGlyph;
```

**Estimated effort:** 1 hour (trend arrow). Skip sparkline entirely.

---

### B5. Hit-Target Gap: `select.gam-bar-icon` Is Still Undersized on Some States

**Problem identified in code (L19306):**

```css
select.gam-bar-icon {
  min-height: 32px !important;
  min-width: 32px !important;
}
```

The `::after { inset: -10px }` hit-area extension that works for `<button>` elements does NOT work on `<select>` — pseudo-elements are not rendered on replaced elements in most browsers. The comment at L19306 acknowledges this: "select can't use ::after hit-extension, enforce 32px min tap target."

32px is below the 44px minimum. The filter select (`gam-bar-filter`) is the only `<select>` in the bar. This is a low-frequency interaction but worth noting.

**Proposal:** Wrap the `<select>` in a `<label>` with `position:relative; padding:6px 0` that acts as the expanded hit surface, or replace with a `<button>` that opens a custom dropdown popover (3 options: off / 4h / 8h / 12h — trivial to custom-render). The custom approach also allows styling the options to match BB theme, which native `<select>` cannot do.

**Estimated effort:** 3 hours (custom dropdown button + popover, matching existing popover patterns).

---

### B6. Tooltip Arrow (Visual Grounding)

**Problem identified in code (L20012–20026):**

The CSS `::before` tooltip on `:hover` renders above the icon but has no arrow/caret pointing down to the icon it describes. It floats disconnected.

**Proposal:** Add a pseudo-element triangle below the tooltip box:

```css
#gam-status-bar .gam-bar-icon[title]:hover::before {
  /* existing rules unchanged ... */
}
#gam-status-bar .gam-bar-icon[title]:hover::after {
  content: "";
  position: absolute;
  bottom: calc(100% + 8px);   /* between icon top and tooltip bottom */
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: var(--bb-line-hot);
  pointer-events: none;
  z-index: 99999998;
}
```

Note: This conflicts with the `::after { inset:-10px }` hit-area rule on `.gam-bar-icon`. The tooltip `::after` would need to be scoped to a `:hover::after` state, which overrides the hit-area pseudo on hover (acceptable — you can't click while reading a tooltip).

**Estimated effort:** 1.5 hours (CSS only, careful specificity management to not break hit-area).

---

## C. Effort Summary

| Proposal | Impact | Effort | Recommended Priority |
|---|---|---|---|
| B1 — Severity weight tiers (font-weight + letter-spacing per kind) | High — accessibility + glanceability | 1h JS | P1 — ship next |
| B2 — Ticker rotation crossfade (150ms opacity) + reduced-motion guard | Medium — motion polish | 2h JS+CSS | P2 |
| B3 — Siren count bump animation on increment | Medium — attention signal | 1.5h JS+CSS | P2 |
| B4 — Trend arrow (up/down/eq glyph) instead of sparkline | Medium — trend visibility, low cost | 1h JS | P2 (sparkline: skip) |
| B5 — Filter select hit-target: custom dropdown button | Low–Medium — accessibility | 3h JS+CSS | P3 |
| B6 — Tooltip arrow caret | Low — visual polish | 1.5h CSS | P3 |

**Total P1+P2:** ~5.5 hours.
**Total all:** ~10 hours.

---

## D. Things NOT to Change

- The pill geometry (`border-radius:14px`, `height:26px`) — correct Bloomberg density.
- The `::after { inset:-10px }` hit-area pattern for buttons — already best-practice.
- The amber hover triple-signal (color + background + border) — do not simplify.
- The tier badge on `brandBtn` (red "L" chip at bottom-right of shield) — correct; consistent with M8.
- The `gam-inbox-arrived` animation — already the reference implementation for B3.
- The popover architecture — STATUS popover is praised; nothing to fix there.
- The `__tickerPaused` hover-pause gate — already shipped, correct.
- Bar `min-width: 720px` — deliberate for ticker readability; do not remove.

---

*Generated: 2026-05-10. Read-only. Implementation in separate tickets.*
