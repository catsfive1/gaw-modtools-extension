# UIUX2-09 -- Status Bar Design Review (V2)

**Version:** v10.13 design ralph V2
**Scope:** `buildStatusBar()` (~L18863-L19400) + Bloomberg CSS blocks (iter 1-8 in GAM_CSS, ~L21026-21140, ~L21756-21855)
**Prior spec:** `docs/V10_DESIGN/UIUX-16_status_bar.md`
**Status:** Read-only critique. No code changes in this document.
**Theme:** Bloomberg Terminal amber -- `--bb-amber: #ff9933`

---

## Critique Method

The bar is read against three lenses simultaneously:

1. **Bloomberg aesthetic fidelity** -- does it look and behave like a real data terminal?
2. **v1 spec delta** -- what did UIUX-16 propose that shipped, what shipped but diverged, what was skipped?
3. **ui-ux-pro-max priority stack** -- Touch & Interaction (P2), Typography & Color (P6), Animation (P7), Navigation Patterns (P9).

---

## A. What Is Already Correct (Hold the Line)

These are confirmed strong in v10.12.3. Do not regress them.

| Element | What Works | Source |
|---|---|---|
| Pill geometry | `height:26px`, `border-radius:14px`, `backdrop-filter:none` (iter 5 anti-pattern correctly removed), centered float -- genuine terminal HUD feel | L21026-21037 |
| Amber hover triple-signal | `:hover` writes color + background + border-color simultaneously in 100ms ease-out -- zero ambiguity, three distinct channels | L21068-21071 |
| Hit-area extension | `.gam-bar-icon::after { inset:-10px }` yields ~42px effective touch target on a 22px visual target -- correct Bloomberg density trade-off | L21063-21066 |
| Focus-visible ring | `outline:1px solid var(--bb-amber); outline-offset:1px; border-color:var(--bb-amber)` -- keyboard accessible, on-theme | L21076-21079 |
| Ticker hover-pause | `__tickerPaused` gate on the 4s rotation interval -- hover correctly freezes the cycle | L19107-19108 |
| Ticker click-to-popover | All 6 `kind` states (`modmail`, `sus`, `dr`, `queue`, `opdel`, `auto`) dispatch to in-page popovers -- no page navigation on click | L19114-19122 |
| Severity weight tiers | `_tickerWeightMap` + `_tickerLetterMap` shipped in v10.12 H.4 -- font-weight 400-700 and letter-spacing 0-0.10em keyed by kind | L19101-19104 |
| Ticker tabular-nums | `font-variant-numeric:tabular-nums` on ticker inline style -- numbers don't jitter on update | L19057 |
| Inbox badge pattern | `data-count` pseudo-element badge + `gam-inbox-arrived` scale/color animation on arrival -- clean, consistent | L21817-21839 |
| Aria coverage | Every interactive element carries `aria-label` (M11 sweep complete) | Throughout L18872-19215 |
| Brand button semantics | Shield (`U+1F6E1`) is a `<button>`, not a `<span>` -- click routes to site-health popover, not navigation | L19017-19037 |
| Tier badge | Red `L` chip at `bottom:1px; right:1px` of shield button, `aria-hidden:true`, parent carries title `Lead mod` -- purely decorative, correctly hidden from SR | L19025-19031 |
| Session dot | Null/green/red color states, click fires live CSRF + whoami probe and snacks result -- dot is meaningful, not passive decoration | L18872-18906 |
| `gam-bar-sep` | 1px vertical rule, 14px tall, token-colored (`--bb-line`) -- correct terminal divider, not a pipe character | L21041-21047 |
| Siren color tier | `isHot` check (recentDr >= 5 OR comment_count_24h > 8) flips color from `--bb-amber` to `--bb-red` -- urgency coded at the source | L18978-19979 |
| Popover architecture | All seven popovers (site-health, SUS, DR, queue, modmail, auto-unsticky, active-mods) anchor to their bar icon -- Commander praised this pattern; it is complete and stable | Throughout |

---

## B. Open Issues -- The Remaining 10%

### B1. Ticker CSS Conflict: Hardcoded `font:600` on `.gam-bar-ticker` Overrides the JS Weight Map

**Status in v10.12.3: Partially broken.**

The CSS at L21779 sets:

```css
font: 600 var(--bb-t-xs)/1 var(--bb-font) !important;
```

The JS weight map at L19103 writes:

```js
tickerEl.style.fontWeight = (_tickerWeightMap[cur.kind] || 500) + '';
```

The CSS `font:` shorthand with `!important` resets `font-weight` to `600` on every repaint where the CSS cascade wins. Inline `style.fontWeight` set via JS has higher specificity than a stylesheet rule -- BUT the `!important` on the `font` shorthand in the Bloomberg CSS block (L21779) **re-fires on the next repaint cycle** and wins because `!important` in a stylesheet beats an inline style only when the inline style is also `!important`. In this case the JS does NOT write `!important` -- so the cascade resolves:

- Stylesheet `font: 600 ... !important` beats inline `style.fontWeight = '400'`

**Practical consequence:** the `quiet` state (weight 400) and `queue` state (weight 500) never actually render at their designated weights. Everything collapses to 600. The `sus` and `opdel` states (weight 700) are also suppressed to 600. The severity distinction by font-weight that shipped in v10.12 H.4 is inert.

**Fix:** Remove `!important` from the `font:` shorthand in the `.gam-bar-ticker` CSS rule. Keep the weight as a CSS default (`font-weight: 600`) without `!important` so JS inline assignment wins at runtime.

```css
/* Change L21779 from: */
font: 600 var(--bb-t-xs)/1 var(--bb-font) !important;

/* To: */
font-size: var(--bb-t-xs) !important;
line-height: 1 !important;
font-family: var(--bb-font) !important;
font-weight: 600; /* no !important -- JS severity map overrides this */
```

**Effort:** 10 minutes CSS. This is the highest-ROI fix in the document -- it un-silences a feature that already has complete JS logic.

---

### B2. Ticker Rotation: Instant Text Swap, No Crossfade

**Status in v10.12.3: Not shipped (v1 B2 proposal still open).**

The CSS at L21785 already has `transition: opacity 200ms` on `.gam-bar-ticker`. The JS does NOT use it -- `__updateTicker()` writes `textContent` and `style.color` synchronously. The transition is dead infrastructure.

The instant swap reads as a glitch on a dark terminal display, not as a state update.

**Proposed pattern** (uses the existing transition, costs ~8 lines of JS):

```js
// In __updateTicker(), replace the direct write block:
tickerEl.style.opacity = '0';
requestAnimationFrame(() => {
  tickerEl.textContent = cur.msg;
  tickerEl.style.color = cur.color;
  tickerEl.style.fontWeight = (_tickerWeightMap[cur.kind] || 500) + '';
  tickerEl.style.letterSpacing = _tickerLetterMap[cur.kind] || '0.04em';
  tickerEl.style.opacity = '1';
});
```

The 200ms fade is already in CSS. The reduced-motion guard is already there in v10.12 (confirmed by `_brigadeMotionOk` pattern at L19326). Add the same guard to the ticker:

```css
@media (prefers-reduced-motion: reduce) {
  #gam-status-bar .gam-bar-ticker { transition: none !important; }
}
```

**Effort:** 2h (JS + CSS guard). **Priority: P2** -- motion polish, not accessibility-blocking.

---

### B3. Siren Count Bump: No Animation on Increment

**Status in v10.12.3: Not shipped (v1 B3 proposal still open).**

`_updateSirenChip()` replaces `sirenBtn.innerHTML` silently when `total` increases. The moderator has no ambient signal that the count just changed -- they must notice the number itself.

The inbox correctly animates this event via `gam-inbox-arrived` (L21838-21839). The siren has no equivalent.

**Proposed addition:**

Add a `_sirenPrevTotal` closure variable. When `total > _sirenPrevTotal`, add a class `gam-siren-bumped` to the count `<span>` inside `sirenBtn.innerHTML`:

```css
@keyframes gam-siren-bumped-kf {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.30); }
  100% { transform: scale(1); }
}
.gam-siren-bumped {
  display: inline-block; /* scale needs block context */
  animation: gam-siren-bumped-kf 0.5s ease-out 1;
}
```

Remove the class after 600ms. The animation fires only on the count `<span>`, not the full button -- surgical, not noisy.

**Effort:** 1.5h. **Priority: P2.**

---

### B4. Trend Arrow: Up/Down/Eq Glyph on Ticker States

**Status in v10.12.3: Not shipped (v1 B4 simplified proposal still open).**

The v1 spec correctly rejected a sparkline (mixed units, 26px height constraint, popover architecture makes it redundant). The trend arrow replacement was also not shipped.

**Implementation is straightforward.** Add per-kind `_prev` trackers:

```js
// Above __updateTicker:
const _tickerPrev = {};

// Inside state construction in __updateTicker:
const _prevSus = _tickerPrev.sus || 0;
const susCount = ...;
const susTrend = susCount > _prevSus ? ' ▲' : (susCount < _prevSus ? ' ▼' : '');
_tickerPrev.sus = susCount;
// Same pattern for drCount, mmCount, etc.

// In msg construction:
states.push({ msg: susCount + ' SUS' + susTrend, ... });
```

Unicode glyphs `U+25B2` (solid up-triangle) and `U+25BC` (solid down-triangle) render in all monospaced fonts. They add ~3px width at 11px font-size -- within the `max-width:200px` ticker budget.

**Effort:** 1h JS. **Priority: P2.**

---

### B5. Filter Select Hit-Target Still 32px (Below 44px Floor)

**Status in v10.12.3: Acknowledged regression, not fixed (v1 B5 open).**

```css
/* L20416 */
select.gam-bar-icon {
  min-height: 32px !important;
}
```

The comment in the source confirms the limitation: "select can't use ::after hit-extension, enforce 32px min tap target." 32px is below the 44px floor defined in ui-ux-pro-max P2 (`touch-target-size`).

The filter select (`gam-bar-filter`) has only 4 options: `off / 4h / 8h / 12h`. This is trivially replaceable with a `<button>` that cycles the value on click (4-state toggle) or opens a 4-item popover matching the existing popover vocabulary.

**Recommended approach: 4-state cycle button.** Single click cycles `off -> 4h -> 8h -> 12h -> off`. Label shows current state (`FILTER: OFF` / `FILTER: 4H` etc.). This:
- Meets the 44px hit-target via `::after { inset:-10px }` like all other bar icons
- Eliminates the native `<select>` which cannot be styled to match the Bloomberg theme
- Reduces the visual footprint (the `<select>` dropdown arrow and OS-rendered options break the terminal aesthetic)

**Effort:** 3h (replace `<select>` with cycle button, match BB styling, preserve `getSetting`/`setSetting` integration).

**Priority: P3** -- accessibility gap but low-frequency interaction.

---

### B6. Tooltip: No Arrow Caret Grounding the Tooltip to Its Icon

**Status in v10.12.3: Not shipped (v1 B6 open).**

The CSS tooltip (`::before` on `#gam-status-bar .gam-bar-icon[title]:hover`, L21124-21138) floats at `bottom: calc(100% + 14px)` with no caret. On a bar with 15+ icons, the tooltip appears centered above its icon but is not visually anchored to it.

**Note:** The `.gam-bar-custom-tip` (JavaScript delegated tooltip, L21846-21855) is used for the right-side icons; the CSS `::before` tooltip is the fallback for icons without a custom tooltip handler. Both lack carets.

**Proposed CSS-only fix for the `::before` tooltip:**

```css
#gam-status-bar .gam-bar-icon[title]:hover::after {
  content: "";
  position: absolute;
  bottom: calc(100% + 6px);   /* between icon top and tooltip bottom */
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: var(--bb-line-hot);
  pointer-events: none;
  z-index: 99999998;
}
```

**Conflict to manage:** `.gam-bar-icon::after` is the hit-area extension rule (`inset:-10px`). The tooltip caret `::after` on `:hover` state will override it. This is acceptable: you cannot click while reading the tooltip, so the hit-area pseudo-element being temporarily replaced by the caret is a non-issue.

**Effort:** 1.5h CSS (specificity management, test across 15 icons).

**Priority: P3** -- visual polish only.

---

### B7. Emoji Icons: `fbBtn`, `gearBtn`, `inboxBtn`, `peopleBtn`, `tardBtn` Use Emoji Glyphs

**NEW finding in v10.13 review, not in v1.**

The following bar icons render emoji:

| Icon | Emoji | Element |
|---|---|---|
| Fallback toggle | `U+1F513` (open lock) / `U+1F512` (lock) | `fbBtn` L18893 |
| Settings gear | `U+2699 U+FE0F` (gear + variation selector) | `gearBtn` L19039 |
| Modmail inbox | `U+1F4E5` (inbox tray) | `inboxBtn` L19166 |
| Active mods | `U+1F465` (busts in silhouette) | `peopleBtn` L19215 |
| AI tard-suggest | `U+2728` (sparkles) | `tardBtn` L19273 |

Per ui-ux-pro-max rule `no-emoji-icons` (P4): emoji are font-dependent, render inconsistently across OS/browser versions (color vs monochrome vs resized), and cannot be controlled via CSS `color` or design tokens. On the Bloomberg amber theme, colored emoji break the monochrome terminal palette entirely -- the amber `:hover` cannot recolor an emoji glyph.

**Assessment:**
- `U+2699` (gear) + `U+FE0F` (text variation selector) is borderline -- it forces text rendering, but still renders as a colored emoji on most platforms.
- `U+1F465`, `U+1F4E5`, `U+1F513`/`U+1F512` are fully colored emoji in all major browsers.
- `U+2728` (sparkles) is fully colored.

**Recommendation:** Replace with SVG icons from the existing icon vocabulary OR use Unicode dingbats that render as text glyphs (not emoji) without variation selectors:
- Gear: `U+2699` alone (no `FE0F`) renders as text glyph in monospace contexts; OR use a CSS-drawn gear via SVG background.
- Lock/unlock: `U+1F512`/`U+1F513` are Emoji_Presentation by default -- no text fallback. Replace with `U+1F5FF` is not better. Best path: SVG inline or a CSS-drawn padlock via border tricks.
- Inbox: `U+1F4E5` -- replace with `U+2709` (envelope, already used for `mmBtn` at L18989) or similar text-rendering glyph.
- People: `U+1F465` -- replace with `U+1F464` (bust in silhouette, still emoji) or custom SVG.
- Sparkles: `U+2728` -- text label `AI` or a non-emoji Unicode star (`U+2605`).

**Effort:** 2-4h depending on whether SVG icons are introduced or Unicode substitution is used.

**Priority: P2** -- directly breaks the Bloomberg monochrome terminal aesthetic; the amber `:hover` color recolor is broken for any emoji icon.

---

### B8. `OP DEL` Hardcoded Hex Still Present

**Status in v10.12.3: Not fixed (flagged in v1 B1).**

```js
// L19082
states.push({ msg: _opDelCount24h + ' OP DEL', color: '#ff3b3b', target: null, kind: 'opdel' });
```

`'#ff3b3b'` is a hardcoded hex rather than `var(--bb-red)`. Every other state uses a CSS custom property. This creates a token consistency gap: if `--bb-red` is ever adjusted (e.g., for contrast tuning), `opdel` will not update.

**Fix:** `color: 'var(--bb-red, #ff3b3b)'`

**Effort:** 5 minutes. Ship this with any other JS-only change.

---

## C. Severity Weight Tier Status -- Did v10.12 Actually Land?

The v1 spec proposed severity tiers in B1. v10.12 H.4 shipped code for them (`_tickerWeightMap`, `_tickerLetterMap`). The table below shows what the spec proposed vs what shipped vs what the CSS conflict (B1 above) actually delivers:

| Kind | Spec weight | Shipped weight (JS map) | Delivered weight (CSS wins) |
|---|---|---|---|
| `quiet` | 400 | 400 | **600** (CSS !important overrides) |
| `queue` | 500 | 500 | **600** (CSS !important overrides) |
| `auto` | 500 | 500 | **600** (CSS !important overrides) |
| `modmail` | 600 | 600 | 600 (matches CSS default -- coincidence) |
| `dr` | 600 | 600 | 600 (matches CSS default -- coincidence) |
| `sus` | 700 | 700 | **600** (CSS !important overrides) |
| `opdel` | 700 | 700 | **600** (CSS !important overrides) |

**Net: only the two states that happen to match the CSS default (modmail, dr) render correctly. The feature is effectively broken for 5 of 7 states.** Fix is entirely in CSS (B1 above).

Letter-spacing map is unaffected by the `font:` shorthand (letter-spacing is a separate property, not part of the `font:` shorthand). That part works correctly.

---

## D. Items Confirmed NOT to Change

These are explicitly locked. Any review that proposes touching them is wrong.

- Pill geometry: `height:26px`, `border-radius:14px`, `bottom:14px` positioning.
- Amber triple-signal on hover -- do not simplify to single channel.
- `::after { inset:-10px }` hit-area pattern for buttons -- already best-practice.
- `__tickerPaused` hover-pause gate -- confirmed shipped and working.
- Ticker popover routing -- all 6 kinds dispatch correctly to popovers.
- `gam-inbox-arrived` animation -- the reference implementation for B3.
- Popover architecture -- STATUS popover is praised; do not touch.
- `min-width: 720px` on bar -- deliberate for ticker readability.
- `backdrop-filter:none` on bar (iter 5 anti-pattern correctly removed).
- `aria-label` coverage (M11 sweep complete).
- Brand button as `<button>` routing to popover -- correct.
- Tier badge `aria-hidden:true` + parent title -- correct SR pattern.

---

## E. Priority Order for v10.13

| # | Issue | Effort | Impact | Priority |
|---|---|---|---|---|
| E1 | B1: Fix CSS `!important` on ticker font -- un-silences severity weight tiers | 10 min CSS | Critical -- restores feature that already has JS logic | **P0 -- ship immediately** |
| E2 | B8: Fix `opdel` hardcoded hex to `var(--bb-red)` | 5 min JS | Low -- token hygiene | **P0 -- bundle with E1** |
| E3 | B7: Replace emoji icons with text-rendering glyphs / SVG | 2-4h | High -- amber hover recolor is broken for emoji icons | **P1** |
| E4 | B2: Ticker rotation crossfade (use existing `transition:opacity 200ms`) | 2h | Medium -- motion polish | **P2** |
| E5 | B3: Siren count bump animation on increment | 1.5h | Medium -- attention signal | **P2** |
| E6 | B4: Trend arrow (up/down/eq glyph) on ticker states | 1h | Medium -- trend visibility | **P2** |
| E7 | B5: Replace `<select>` filter with 4-state cycle button | 3h | Low-Medium -- accessibility gap | **P3** |
| E8 | B6: Tooltip caret arrow CSS | 1.5h | Low -- visual polish | **P3** |

**P0 total:** 15 minutes. Do it now, in the same commit as the next JS touch.
**P1 total:** 2-4h. Next dedicated UI pass.
**P2 total:** 4.5h.
**P3 total:** 4.5h.

---

## F. The Bar vs. The STATUS Popover

Commander praised the STATUS popover. The critique above is specifically about the BAR (the persistent bottom strip), not the popover chain that emanates from it.

The popover chain (site-health, SUS, DR, queue, modmail, active-mods, auto-unsticky) is architecturally complete. The bar's job is to be the anchor and signal layer for that chain. The current issues (B1-B8) are all in the anchor/signal layer -- none of them require touching the popovers.

Do not conflate the two when scoping tickets.

---

## G. Bloomberg Aesthetic Fidelity Assessment

A real Bloomberg terminal has these properties that the bar approximates well:

| Bloomberg property | Bar implementation | Fidelity |
|---|---|---|
| Monochrome base, amber accent | `--bb-ink-dim` base, `--bb-amber` on hover/active | Strong |
| Dense information, small text | 11px font, 26px height, 22px icons | Strong |
| Tabular-nums for data | `font-variant-numeric:tabular-nums` on ticker | Strong |
| No decorative blur | `backdrop-filter:none` | Strong |
| Letter-spacing on labels | 0.04em base, tier-keyed on ticker | Strong |
| Uppercase data labels | `text-transform:uppercase` on ticker, brand | Strong |
| Square corners | `--bb-r` (CSS token) | Strong -- depends on token value |
| Monochrome icons | BROKEN for emoji icons (B7) | Weak |
| Color as urgency signal only | Mostly -- siren uses amber/red tiers | Mostly strong |
| Weight as urgency signal | BROKEN by CSS `!important` conflict (B1/E1) | Weak until E1 ships |

**Summary:** 8 of 10 Bloomberg fidelity properties are strong. The two weak ones (monochrome icons, weight tiers) are both fixable. E1 is a 10-minute CSS edit. E3 (emoji replacement) is the only non-trivial fidelity repair.

---

## H. v1 Spec Delta Summary

| v1 Section | Disposition in v10.12.3 |
|---|---|
| B1 -- Severity weight tiers | JS code shipped but broken by CSS conflict. Net: not functional. |
| B2 -- Ticker crossfade | Not shipped. CSS transition infrastructure exists but unused. |
| B3 -- Siren bump animation | Not shipped. |
| B4 -- Trend arrow (sparkline rejected) | Not shipped. |
| B5 -- Filter select hit-target | Not shipped. 32px persists. |
| B6 -- Tooltip caret | Not shipped. |
| NEW B7 -- Emoji icon audit | New finding. Not in v1. |
| NEW B8 -- `opdel` hardcoded hex | Not fixed since v1 flagged it. |

**v1 closed items (confirmed shipped and working):**
- Ticker hover-pause (`__tickerPaused`) -- v10.8.0 M1, shipped
- Ticker click-to-popover routing (TP.1-TP.5) -- shipped
- `aria-label` sweep (M11) -- shipped
- Session dot live probe -- shipped
- Brand button -> site-health popover -- shipped
- Inbox `gam-inbox-arrived` animation -- shipped

---

*Generated: 2026-05-10. UIUX2-09-STATUS-BAR. Read-only critique for v10.13 implementation. No code changes in this document.*
