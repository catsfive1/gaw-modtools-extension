# UIUX2-13 — Site Health Popover V2 Design Critique + Spec

**Surface:** `_showSiteHealthPopover` (modtools.js L18605–L18812)
**Trigger:** Shield brand button click in status bar
**Namespace:** `gam-sh2-*` (already in production as of v10.12.0)
**Baseline read:** Live dist/modtools.js L18605–L18812 + UIUX-12_health_popover.md
**Date:** 2026-05-10
**Author:** UIUX2-13-HEALTH-POPOVER (ralph V2)

---

## A. What v10.12.x Shipped (State of Implementation)

UIUX-12 was fully implemented. The `gam-sh2-*` CSS block is injected at L18623–18658 as an idempotent `<style>` tag. The HTML skeleton matches the UIUX-12 spec exactly: header rail, 4-tile KPI row, shimmer feed, footer. The two-phase async (local fallback immediate, modStats/modWhoami in-place patch) is correctly wired with no layout shift.

**What UIUX-12 fixed from the old implementation:**
- No more two-phase DOM jump (height change). The popover renders at its final height immediately, shimmers fill the feed slot.
- KPI tiles give the eye a landing point — numerical hierarchy over a flat row list.
- Bloomberg aesthetic is landed: monospace, sharp corners, dark field, LED pills, colored type badges.
- Positioning clamp (`Math.max(8, Math.min(...))`) prevents right-side overflow.
- Feed rows animate in with staggered `opacity` fade (`gam-sh2-fi` keyframe).
- Executor column omits `[?]` when no executor field — correct.

---

## B. Critique of v10.12.x — What Still Needs Work

### B.1 Entry feels tentative, not decisive

The `scale(0.96) translateY(6px) → identity` entry is correct in concept but `140ms ease-out` is sluggish for a toolbar popover. Comparable terminal overlays (VS Code command palette, Raycast) land in 80–110ms. The extra 30–60ms makes the popover feel it's loading rather than appearing. At the same time, there is no exit animation — the popover just snaps off on dismiss. The asymmetry (animated in, instant out) reads as incomplete.

**Fix:** Entry at 100ms. Add a 80ms `scale(1) → scale(0.97) + opacity 1→0` exit before `remove()`.

### B.2 Firehose pill initial state is misleading

L18678 sets the firehose pill to `gam-sh2-pill--warn` (blinking amber LED) unconditionally as the initial render, regardless of `fhActive`. Then L18726 immediately calls `_setFhTile(fhActive)` which corrects it. But there is a 0–1 frame window where the correct local state is known (we have `fhActive` from `getSetting` synchronously) but the pill shows amber. At 140ms entry animation the user can perceive this as a flicker if `fhActive` is `true` (they see green flash from amber through the animation). Since `fhActive` is available before the DOM is appended, the initial pill class should be set correctly at construction time, not corrected post-facto.

**Fix:** Inline the correct pill class in the HTML template string using `fhActive`:

```js
// In the pop.innerHTML template string:
'<span class="gam-sh2-pill ' + (fhActive ? 'gam-sh2-pill--ok' : 'gam-sh2-pill--err') + '" id="gam-sh2-fh-pill">' +
'<span class="gam-sh2-led"></span>' +
'<span class="gam-sh2-pill-label">' + (fhActive ? 'LIVE' : 'STANDBY') + '</span></span>'
```

After this, `_setFhTile(fhActive)` at L18728 becomes redundant for the pill — it only needs to update the tile val/bar, which it already does correctly. One DOM touch instead of two.

### B.3 KPI tiles: 24H ACT uses local sum, not D1 count, during probe

L18726 correctly renders `localTotal` (sum of `bans24+dr24+approves24+removes24` from localStorage) as the immediate value. The modStats patch at L18784 overwrites with `d.actions_24h` (D1 count). These two values regularly diverge: localStorage only captures actions from this browser/session; D1 captures all mods. A moderator who hasn't acted yet today sees `0` flash to `147` — a jarring jump that looks like a data glitch, not a probe result.

**Fix:** While the RPC is in flight, render the 24H ACT tile with a visual "provisional" signal — a faint italic `(local)` sub-label below the value, or a pulsing bar color. Remove it when D1 value lands. This makes the patch look intentional, not like a correction.

CSS addition (new rule in the `gam-sh2-css` block):
```css
.gam-sh2-tile-sublbl{font-size:8px;color:#3a3f48;letter-spacing:0.08em;margin-top:1px;height:9px;transition:opacity 400ms}
```

JS: After setting the local value, append a sub-label el to the tile; clear it in the modStats `.then()` handler.

### B.4 Verify tile shows `—` with neutral (green) bar while loading

L18643: `.gam-sh2-tile-val{color:#3dd68c}` is the default — so the `—` placeholder in the LAST VERIFY tile renders green, implying "all good." A moderator glancing at the KPI row during the probe window sees four tiles that all read green, then the verify tile pops to amber/red when the real age comes in. Green `—` is false confidence.

**Fix:** Render the verify tile bar and value in the neutral dim color (`#5c6370`) while value is `—`. A simple approach: set `data-loading="1"` on the tile at construction; remove it when patched; add:
```css
.gam-sh2-tile[data-loading] .gam-sh2-tile-val{color:#3a3f48}
.gam-sh2-tile[data-loading] .gam-sh2-tile-bar{background:#2a2f38}
```
No new elements — just a data attribute added to the two tiles that have no local fallback (verify and, to a lesser degree, firehose when local state matches D1).

### B.5 Activity feed: empty feed when modStats has no `recent_actions`

If `modStats` resolves but `d.recent_actions` is absent or empty (`[]`), `_renderFeed([])` runs, clears the shimmer, and leaves the feed `<ul>` completely empty — no height, no indication. The popover silently collapses the feed region. This is worse than the shimmer staying.

**Fix:** If `d.recent_actions` is missing or length 0, render an empty-state row:
```js
if (!Array.isArray(d.recent_actions) || d.recent_actions.length === 0) {
  var feed = pop.querySelector('#gam-sh2-feed');
  if (feed) {
    feed.innerHTML = '<li class="gam-sh2-feed-empty">No recent actions recorded</li>';
  }
  return;
}
```
CSS:
```css
.gam-sh2-feed-empty{padding:12px;text-align:center;color:#3a3f48;font-size:10px;font-style:italic}
```

### B.6 Dismiss handler leaks if popover is removed by third-party code

L18797–18811: the click-outside and keydown listeners are registered on `document` and removed via closures over `pop`. If `pop` is removed from the DOM by something other than the dismiss handler (e.g. a page navigation, another extension), the listeners persist forever. Low probability but measurable in a SPA like GAW where the mod extension lives across soft navigations.

**Fix:** Add a `MutationObserver` on `pop`'s parent that fires `pop.remove()` + listener cleanup when `pop` is no longer in the DOM. Or simpler: use `AbortController` to tie both listeners to a single signal, and abort the signal inside `pop.remove()`:

```js
var _ac = new AbortController();
var _sig = _ac.signal;
setTimeout(function() {
  document.addEventListener('click', dismiss, { capture:true, signal:_sig });
}, 0);
document.addEventListener('keydown', _escD, { signal:_sig });
// In dismiss and _escD: replace explicit removeEventListener calls with _ac.abort()
```

AbortController is available in all Chromium versions that run this extension.

### B.7 Feed scrollbar: WebKit browsers ignore `scrollbar-width: thin`

L18647: `.gam-sh2-feed{scrollbar-width:thin;scrollbar-color:#4A9EFF #2a2f38}` — these are Firefox-only properties. Chrome (which runs this extension) uses `::-webkit-scrollbar` pseudo-elements. Without them, Chrome renders the default scrollbar, which is 17px wide and visually blows the tabular column grid (the feed rows use `grid-template-columns: 58px 62px 1fr 64px` but the 64px exec column gets compressed by the fat scrollbar).

**Fix:** Add to the CSS block:
```css
.gam-sh2-feed::-webkit-scrollbar{width:4px}
.gam-sh2-feed::-webkit-scrollbar-track{background:#1e2228}
.gam-sh2-feed::-webkit-scrollbar-thumb{background:#4a9eff;border-radius:2px}
```

### B.8 No hover state on feed rows

The feed rows have no `:hover` treatment. In a Bloomberg-style dense list, even a subtle row highlight on hover is a critical scanability cue — the eye locks the hovered row. Currently the rows are visually identical at rest and on hover, making it hard to track which row you are reading.

**Fix:**
```css
.gam-sh2-feed-row:hover{background:#1e2228}
```
One rule. Instantaneous. Zero motion. Pure density aid.

---

## C. Visual Fidelity Assessment — Bloomberg Aesthetic

The UIUX-12 Bloomberg direction is well-executed in the current implementation. Specific assessments:

**Strong:**
- `#0f1114` background field. Correct charcoal-black, not the washed-out `#1a1b1e` that other components default to.
- LED squares (`7x7px, border-radius:1px`) are more hardware-terminal than rounded pill indicators — correct choice.
- `letter-spacing:0.12em` on the header title lands the all-caps aesthetic without going full-shout. Good calibration.
- Type badge pill sizing (`font-size:9px, padding:2px 4px`) is tight without being unreadable.
- The `gam-sh2-shimmer` keyframe (200% sweep, 1.2s infinite) is visibly smooth — correct duration.
- `box-shadow: 0 16px 48px rgba(0,0,0,.75)` gives the popover enough depth to read as floating above a dense page without a harsh border glare.

**Needs calibration:**
- **KPI value size at 28px** is bold but will truncate at 3 digits with tight tile widths (380px / 4 tiles = 95px each). A value like `1,247` won't fit. Cap display at `999+` for values >= 1000, or drop to `24px` when content length > 3 chars. No design change needed — just a JS guard in `_setTile`:
  ```js
  var display = (typeof value === 'number' && value >= 1000) ? '999+' : String(value);
  valEl.textContent = display;
  ```
- **`LAST VERIFY` label** is 11 characters — the longest tile label. At `font-size:9px; letter-spacing:0.1em` it will overflow the 95px tile on smaller screens. Shorten to `VERIFY` (6 chars) — the header context already establishes the domain.
- **`gam-sh2-pill-label` class** is referenced in JS at L18764, 18769, 18774, 18776, but the CSS block (L18626–18656) has no `.gam-sh2-pill-label` rule. The label inherits from `.gam-sh2-pill` correctly (font-size:9px, letter-spacing, font-weight), but the absence of an explicit rule is a maintenance smell — the next dev won't know the label inherits its type treatment from the pill container. Add a comment or explicit rule:
  ```css
  .gam-sh2-pill-label{} /* inherits from .gam-sh2-pill; explicit for devtools clarity */
  ```

---

## D. Scanability of the Activity Feed

The current feed grid (`58px 62px 1fr 64px`) is well-proportioned for the 380px container. Assessment by column:

**Timestamp (58px):** `HH:MM:SS` in `10px #5c6370` — correct. The dim color correctly de-emphasizes the timestamp as secondary scan data. At 10px it's readable in a dense terminal context.

**Type badge (62px):** The fixed-width column with background-colored badge is the strongest scanability feature. At a glance, the color column creates a vertical ribbon that lets the eye pattern-match ban/approve/remove sequences without reading text. This is exactly right.

**Target (1fr, flex):** Correct use of `text-overflow: ellipsis` for long usernames. The `u/` prefix is preserved in the data; `a.user || a.target || '—'` is correct precedence. One gap: Reddit usernames can be up to 20 chars (`u/` + 20 = 22 chars). At `10px` this reads fine. Post IDs (`post/abc123`) are typically shorter than usernames — no overflow expected.

**Executor (64px):** Fixed right-aligned, bracket-wrapped — correct. The `overflow:hidden; text-overflow:ellipsis` at 64px will clip usernames > ~9 chars. Acceptable for a right-edge label. The `exec ? <span>[exec]</span> : <span></span>` empty-span pattern correctly maintains grid alignment when executor is absent.

**One missing feature:** No visual distinction between "this session's actions" (entries that came from this browser's local log) vs "other mods' actions" (entries from D1 via `recent_actions`). The feed currently shows only D1 data (post-modStats), so all rows are D1-sourced. If a future version merges local + D1, an indicator column or row tint (e.g., faint `C.ACCENT` left border on own-session rows) would be worth adding. Flag for v10.14.

---

## E. In-Place Data Patching — No Layout Shift Assessment

The UIUX-12 no-layout-shift architecture is correctly implemented. Line-by-line:

**L18660–18694 (initial render):** Full-height skeleton rendered before `appendChild`. Tiles render with local values immediately. Shimmer rows pre-fill the feed `max-height:200px` slot. No dimensions change after initial paint.

**L18701–18710 (`_setTile`):** Pure `textContent` and `style.color/background` swaps. No `classList` changes that could affect layout. No `display` toggle. Correct.

**L18712–18723 (`_setFhTile`):** `className` swap on the pill (changes only paint, not layout because `.gam-sh2-pill` dimensions are fixed by `padding: 2px 7px; border-radius:3px` which all states share). `textContent` swap on the label — `LIVE` vs `STANDBY` are different lengths, but the pill has no `width` constraint so it stretches. This **could** shift the header rail if the pill grows. Fix: set `min-width: 68px` on `.gam-sh2-pill` so `STANDBY` (longer) is the stable max-width that both states fit in:
```css
.gam-sh2-pill{...min-width:68px;justify-content:center}
```

**L18738–18756 (`_renderFeed`):** Clears shimmer innerHTML, appends new `<li>` elements. The feed `<ul>` is `max-height:200px; overflow-y:auto` — regardless of how many rows are appended, the feed region stays 200px. No external reflow. Correct.

**L18781–18794 (modStats `.then()`):** All four patch calls are in-place swaps. Feed render is bounded. Worker pill update (L18759–18778) is a `className` swap with the same fix needed as `_setFhTile` above (`min-width` guard).

**Verdict:** No layout shift as designed. The pill min-width fix (above) closes the one edge case.

---

## F. Bloomberg Pill State Machines — Full Spec

Three state machines run simultaneously in the popover. Documenting the full transition graph for implementers.

### F.1 Firehose Pill (`#gam-sh2-fh-pill`)

```
States: ok | err | warn

ok:    class=gam-sh2-pill--ok    LED=#3dd68c (solid)   label=LIVE
err:   class=gam-sh2-pill--err   LED=#f04040 (solid)   label=STANDBY
warn:  class=gam-sh2-pill--warn  LED=#f0a040 (blink)   label=ARMED

Transitions:
  Initial render:    local fhActive==true  -> ok
                     local fhActive==false -> err
  modStats patch:    d.firehose_active matches local -> no change
                     d.firehose_active differs from local -> warn (signal mismatch)
  No modStats:       stays at initial state (acceptable)
```

The `warn/ARMED` state for firehose mismatch (local vs D1) is specified in UIUX-12 §B but **not implemented** in the current code. `_setFhTile` at L18712 uses only `ok` and `err`. This is a gap. Implementation:

```js
function _setFhTileWithMismatch(localActive, d1Active) {
  var mismatch = (localActive !== d1Active);
  var fhPill = pop.querySelector('#gam-sh2-fh-pill');
  if (fhPill) {
    fhPill.className = 'gam-sh2-pill ' +
      (mismatch ? 'gam-sh2-pill--warn' : d1Active ? 'gam-sh2-pill--ok' : 'gam-sh2-pill--err');
    var lbl = fhPill.querySelector('.gam-sh2-pill-label');
    if (lbl) lbl.textContent = mismatch ? 'ARMED' : d1Active ? 'LIVE' : 'STANDBY';
  }
  // tile update (existing logic)
  _setFhTile(d1Active);
}
```

Call at L18786 in the modStats handler:
```js
if (d.firehose_active != null) _setFhTileWithMismatch(fhActive, !!d.firehose_active);
```

### F.2 Worker Pill (`#gam-sh2-worker-pill`)

```
States: probing | ok | err | unreachable

probing:     class=gam-sh2-pill--warn  LED=#f0a040 (blink)  label=PROBING
ok:          class=gam-sh2-pill--ok    LED=#3dd68c (solid)  label=WORKER OK
err:         class=gam-sh2-pill--err   LED=#f04040 (solid)  label=WORKER FAIL
unreachable: class=gam-sh2-pill--err   LED=#f04040 (solid)  label=UNREACHABLE

Transitions:
  Initial:                -> probing (correct in current impl)
  modWhoami resolves ok:  -> ok (L18762–18766, correct)
  modWhoami resolves bad: -> err (L18767–18770, correct)
  modWhoami rejects:      -> unreachable (L18771–18778, correct)
```

Worker pill is fully implemented and state-correct. The only fix needed is `min-width:68px` on the pill class (see §E above) to prevent `UNREACHABLE` (11 chars) from reflowing the header.

### F.3 KPI Tile Threshold State (per tile)

```
Each tile has a 3-state color machine driven by _setTile():
  green:  value < warn threshold   -> #3dd68c
  amber:  warn <= value < danger   -> #f0a040
  red:    value >= danger          -> #f04040

  Thresholds:
    actions: warn=50, danger=100
    queue:   warn=20, danger=50
    verify:  warn=10m, danger=30m   (numeric minutes, not raw string)
    fh:      binary (no threshold machine -- ok/err from _setFhTile)
```

One correctness note: `_setTile` at L18705 does `parseFloat(value)` for the threshold compare, then `String(value)` for display. When `_setTile('verify', mins + 'm', 10, 30)` is called with value `'4m'`, `parseFloat('4m')` returns `4` correctly (parseFloat stops at the 'm'). This is a JS quirk that works — but it's fragile. If the value format ever changes to `'4 min'`, `parseFloat('4 min')` still returns `4`. If it changes to `'<4m'`, `parseFloat('<4m')` returns `NaN`. Add a comment:

```js
// parseFloat handles '4m', '10m' correctly (stops at non-numeric suffix).
// If verify display format changes, revisit this.
var n = typeof value === 'number' ? value : parseFloat(value);
```

---

## G. Proposed Changes — Priority Order

All changes are in-place edits to `_showSiteHealthPopover` and the injected CSS block. No new RPCs. No schema changes. No new DOM structure beyond §B.5 (empty-state row).

| Priority | Section | Change | Lines affected | Effort |
|---|---|---|---|---|
| P0 | B.7 | Add WebKit scrollbar CSS | CSS block L18626 | 5 min |
| P0 | B.4 | Neutral loading color for `—` tiles (data-loading attr) | L18683–18686 + CSS | 15 min |
| P0 | B.2 | Fix firehose pill initial class (inline in template) | L18678 | 5 min |
| P0 | E | Pill min-width guard (prevent STANDBY/UNREACHABLE reflow) | CSS block | 3 min |
| P1 | B.8 | Feed row hover state | CSS block | 2 min |
| P1 | B.5 | Empty-state row when `recent_actions` is `[]` | L18791 handler | 10 min |
| P1 | C | KPI 999+ cap for values >= 1000 | `_setTile` L18707 | 5 min |
| P1 | C | `LAST VERIFY` -> `VERIFY` label | L18686 | 1 min |
| P1 | F.1 | Implement firehose mismatch warn state (`ARMED`) | L18712, L18786 | 20 min |
| P2 | B.1 | Entry 140ms -> 100ms; add 80ms exit animation before remove() | CSS + dismiss fns | 20 min |
| P2 | B.3 | `(local)` sub-label on 24H ACT tile during probe | New sub-lbl el | 15 min |
| P2 | B.6 | AbortController-based listener cleanup | L18797–18811 | 15 min |

**Total P0:** ~28 min. Ship as a single commit, zero behavior change for the user.
**Total P1:** ~38 min. Improves scanability and data confidence signaling.
**Total P2:** ~50 min. Polish and robustness.

---

## H. Implementation Notes for Coder

All edits live inside the single `_showSiteHealthPopover` function (L18605–L18812 in `modtools.js`) plus the CSS string array at L18626–18656.

**CSS edits** — append to the existing `ss.textContent = [...].join('')` array. Do not restructure the array; add new entries at the end before the closing `]`. This keeps git diffs minimal and the idempotency check (`if (!document.getElementById('gam-sh2-css'))`) intact.

**HTML template edits** — the `pop.innerHTML` block is a single concatenated string (L18675–18694). It is not templated. Edit the literal string directly. Test with a `console.log(pop.innerHTML)` sanity check in dev.

**`_setTile` edits** — the function is defined inside `_showSiteHealthPopover` as a closure, not exported. Any changes are function-local. Safe to edit without affecting other functions.

**`_setFhTileWithMismatch`** — add as a new closure adjacent to `_setFhTile` at L18712. Update the call at L18786 only.

**Test matrix** (run these paths manually before ship):
1. Open popover with `firehose.active=true` locally, modStats returns `firehose_active:false` -> expect ARMED amber blinking pill.
2. Open popover, modStats never resolves (simulate with `Promise.race` timeout) -> shimmer stays, tiles show local values, verify stays `—` in dim color (not green).
3. modStats returns `recent_actions:[]` -> expect empty-state row, not empty `<ul>`.
4. `actions_24h=1500` -> expect `999+` in the tile.
5. Dismiss via ESC, click-outside, re-click shield — all three close correctly with exit animation (P2).
6. Width at 1024px viewport: all 4 KPI tiles visible, no overflow.
7. All 4 type badges render (`ban`, `deathrow`, `approve`, `remove`) with correct colors.
