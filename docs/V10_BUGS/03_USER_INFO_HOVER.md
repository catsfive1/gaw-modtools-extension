# Bug 3 — User Info Hover: Bounds Clipping + Redesign

---

## A. ROOT CAUSE: viewport clipping

**File:** `modtools.js`

Two bugs, not one:

### Bug A1 — Intel-load re-render doesn't re-position (primary clip source)

`positionTooltip(anchor)` is called once at show-time (lines 9584, 9693), but
`renderTooltipIntel` (line 9422) fires asynchronously when server intel arrives
and calls `renderTooltip` which rewrites `tooltipEl.innerHTML` — making the
card taller — without calling `positionTooltip` again. The tooltip was sized
when it contained only the cached stub; after intel loads it can grow 80-120px
taller and overflow the bottom edge. This is the most common clip seen in
practice (user hovers near bottom of feed, card starts small, intel arrives,
bottom clips off).

### Bug A2 — Side-shift branch skips the left clamp (secondary, corner case)

In the "no good fit vertically" branch (line 9484-9491):
```js
const shifted = a.right + GAP;
if (shifted + tw + MARGIN <= vw) left = shifted;
```
`left` is reassigned to `shifted` but the `Math.max/Math.min` clamp at line
9473 already ran and does NOT run again after this reassignment. If `shifted`
itself would push the right edge past the viewport (the guard prevents this),
but the guard condition uses `<= vw` not `<= vw - MARGIN`, so a 1-MARGIN-wide
strip at the far right is reachable without the MARGIN buffer.

### Bug A3 — The `max-width` CSS override conflict (cosmetic, causes measured width mismatch)

`#gam-tooltip` is defined twice in the CSS: line 15913 sets `max-width:320px`
and line 16361 (the v5.1.2 ergonomics pass) overrides it to `max-width:340px`.
At measurement time `getBoundingClientRect()` returns the actual rendered width
(340px cap), so the clamp math is correct — but the dual definition is a
maintenance hazard and should be consolidated.

---

## B. CLAMP FIX (exact diff)

### Fix 1 — Re-position after intel render (line ~9424)

```js
// BEFORE:
function renderTooltipIntel(username, intel){
  if (currentHoverUsername !== username && !tooltipPinned) return;
  renderTooltip(username, intel);
}

// AFTER:
function renderTooltipIntel(username, intel){
  if (currentHoverUsername !== username && !tooltipPinned) return;
  renderTooltip(username, intel);
  // Re-position: intel may have made the card taller; re-clamp to viewport.
  const anchor = document.querySelector(`[data-author="${CSS.escape(username)}"]`)
               || currentHoverAnchor;  // see Fix 2 below
  if (anchor) positionTooltip(anchor);
}
```

### Fix 2 — Persist anchor reference (needed by Fix 1)

Add one variable alongside the other hover-state vars (line ~9254):
```js
let currentHoverAnchor = null;
```

Set it in the hover handler where the tooltip is first shown (lines 9579-9584
and 9688-9693):
```js
currentHoverAnchor = al;   // add this line before positionTooltip(al)
```

Clear it in `hideTooltip`:
```js
currentHoverAnchor = null;  // add alongside currentHoverUsername = null
```

### Fix 3 — MARGIN buffer on the side-shift guard (line ~9489)

```js
// BEFORE:
if (shifted + tw + MARGIN <= vw) left = shifted;

// AFTER:
if (shifted + tw + MARGIN <= vw){
  left = Math.min(shifted, vw - tw - MARGIN);  // re-apply clamp after shift
}
```

### Fix 4 — CSS consolidation (remove duplicate rule)

Delete the first `#gam-tooltip` block at line 15913 (the shorter one from the
initial CSS block). The v5.1.2 ergonomics block at line 16361 is the
authoritative one (`min-width:260px; max-width:340px`) and should be the single
source of truth.

### Net result

After Fixes 1-3: tooltip stays fully on-screen regardless of when intel arrives
or where on the page the anchor lives. No CSS changes needed to fix the clip —
it's purely a re-position-on-content-update gap.

---

## C. CURRENT CONTENT INVENTORY

What `renderTooltip` puts in the card today (in render order):

| Section | Source | Notes |
|---|---|---|
| Name + badge chips | local history + intel | watched, verified-ban, death-row, banned, team-flag count |
| Counts row | server + local | server bans/removes, local bans/removes/notes/messages |
| Comment score block | `intel.score` | score value, count, avg-len, flagged words |
| Stats row chips | `intel.stats` | effort score, avg-words, days-since-comment/post, upvotes/post |
| Mod notes block | `intel.noteInfo` | up to 5 entries with mod + timestamp |
| Cloud flags block | `intel.cloudFlags` | last 3 flags from team, severity + reason |
| Last local action row | local history | type + time-ago |
| Account age row | `intel.about` | created date or age string |

**Pinned state adds** (injected by `pinTooltip`): Open Intel button, Mark/Clear
SUS button, Copy name button, X close button.

---

## D. PROPOSED ADDITIONS (ranked by mod-impact)

### D1. Quick-action row — 1-click ban / watch / note (HIGHEST IMPACT)

The hover is the point of decision. Right now a mod must open Mod Console,
find the user, then act. A 3-button row in the hover that fires the same RPC
calls as the console cuts the workflow from ~6 clicks to 1. Buttons: Ban (with
the last-used violation pre-selected), Watch/Unwatch (toggle), Add Note.

On hover: buttons visible but slightly dimmed. On hover-over the button: full
opacity. Fires immediately on click; shows a snack confirmation. Does NOT
require pinning — these should work on the ephemeral hover. If the action
requires a reason (ban), the button click pins the tooltip and expands an
inline reason field rather than launching the full console.

### D2. Activity timeline — last 5 mod actions on this user (HIGH IMPACT)

Currently "last local action" shows one row. Expand it to a compact 5-entry
timeline: `[icon] [type] [time-ago] by [mod]`. Use the same `getUserHistory`
data already in scope; no new fetch needed. This alone answers "has this
person been warned / banned / noted recently?" without opening Intel.

Format (terminal-list style):
```
[BAN] 7d ago  by catsfive     R5: Spam
[REMOVE] 22d ago  by modname  no reason
[NOTE] 30d ago  by catsfive   recidivist pattern
```

### D3. Team-ban summary ("3 prior bans by this team")

Aggregate `intel.cloudFlags` and local history into a single line:
`3 prior team bans — most recent: 7d R5 by catsfive`. This surfaces the
**collective team knowledge** at a glance; a new mod sees the pattern
immediately. Data is already present in `cloudFlags`; just needs a
summariser renderer.

### D4. SUS confidence display with reasons

Currently SUS status is a badge chip (watch/danger/critical). Add a one-line
reason excerpt: `SUS: ban evasion (flagged by catsfive 3d ago)`. Reads from
`_susState` which is already in scope. Zero new fetches.

### D5. Brigade alert membership

If the user is in any active brigade alert, show: `In 2 active brigade alerts`.
Tap to see which ones (pins the tooltip and expands the list). Requires the
brigade alert state to be queryable by username — add a lookup to the existing
brigade-alert data structure. New data path but low code cost.

### D6. Post-velocity sparkline (STRETCH)

Tiny SVG sparkline (40x12px) of post-frequency over the last 30 days. Signals
account waking up after dormancy (ban evasion pattern) or sudden volume spike
(brigading). Requires a new data point from the intel endpoint. Worth adding to
the endpoint spec now even if the UI comes later.

---

## E. INTERACTION MODEL

### Hover-only (current)

- 300ms dwell timer fires the show.
- Mouse entering the tooltip keeps it open (pointer-events:auto + 200ms grace
  timer already in place).
- Mouse leaving both anchor and tooltip hides it after 200ms.

**Gap:** tooltip dismisses before the mod can read notes if they move the mouse
to a second monitor or slow-scroll past. The 200ms grace is too short for
dense-note cards. Recommendation: extend grace timer from 200ms to 400ms when
`noteBlock` is non-empty (card has notes to read). The timer is cleared on
re-entry anyway, so this is zero-risk.

### Keyboard path (currently absent — add this)

Mods using keyboard-nav (Tab through usernames) get no tooltip. Add:
- `focusin` on a `.gam-username` element: trigger the same dwell sequence as
  mouseenter. Works with existing hover machinery if the anchor is passed
  correctly.
- `Escape`: calls `unpinTooltip()` / `hideTooltip()` (already in the outside-
  click handler, just extend to keydown).

---

## F. PIN-ON-CLICK FEATURE (already shipping, gaps to fix)

The pin mechanism exists (`tooltipPinned`, `pinTooltip`, `unpinTooltip`). What
it does today: click a username -> tooltip pins -> gains Open Intel, Mark SUS,
Copy name, X close buttons -> X or outside click unpins.

**Two gaps to fix:**

1. **No visual indicator that the card is pinned.** The class `gam-tip-pinned`
   is toggled but has no CSS rules differentiating it from the unpinned state.
   Add: `border-left-color` change to a bright accent, a small "pinned" pill in
   the top-right corner, and `box-shadow` intensity increase.

2. **Pinned card still clips after intel loads** (the same Bug A1 applies in
   pinned state). Fix 1 above handles this because `renderTooltipIntel` checks
   `tooltipPinned` already and keeps the card alive.

**Proposed pin UX for D1 quick-actions:** quick-action buttons (D1) work in
both pinned and unpinned state. If a quick-action needs a text field (ban
reason), clicking it auto-pins and expands the field inline. This keeps the
common path (watch/unwatch, 1-click ban with last-used reason) friction-free
while supporting the deliberate flow (new violation with typed reason).

---

## G. SHIP-TONIGHT PATCH (clamp fix + 1 high-impact addition)

**Target diff: ~40 lines.**

```js
// 1. Add anchor tracker (line ~9254, alongside existing let declarations)
let currentHoverAnchor = null;

// 2. Persist anchor on show (both show-paths, lines ~9582-9584 and ~9691-9693)
// Before: positionTooltip(al);
// After:
currentHoverAnchor = al;
positionTooltip(al);

// 3. Clear on hide (hideTooltip, line ~9434)
// Before: currentHoverUsername = null;
// After:
currentHoverUsername = null;
currentHoverAnchor = null;

// 4. Re-position after intel render (renderTooltipIntel, line ~9422-9425)
function renderTooltipIntel(username, intel){
  if (currentHoverUsername !== username && !tooltipPinned) return;
  renderTooltip(username, intel);
  if (currentHoverAnchor) positionTooltip(currentHoverAnchor);
}

// 5. Fix side-shift left clamp (positionTooltip, line ~9489)
// Before: if (shifted + tw + MARGIN <= vw) left = shifted;
// After:
if (shifted + tw + MARGIN <= vw){
  left = Math.min(shifted, vw - tw - MARGIN);
}
```

**High-impact addition to bundle tonight: Activity Timeline (D2).**

Replace the single `lastRow` in `renderTooltip` with a compact 5-entry list.
All data is in `getUserHistory(username)` already — no new fetch, no new
latency. Diff is ~25 lines of template HTML. Highest information-density gain
for the lowest cost.

```js
// Replace lastRow block (lines ~9365-9369) with:
let timelineBlock = '';
if (h.length){
  const recent = h.slice(-5).reverse();
  const rows = recent.map(a => {
    const v = a.violation ? VIOLATIONS.find(x=>x.id===a.violation) : null;
    const label = v ? v.label : a.type;
    const icon = a.type==='ban'?'[BAN]':a.type==='remove'?'[RMV]':a.type==='note'?'[NTE]':'[ACT]';
    const who = a.mod ? ` by ${escapeHtml(a.mod)}` : '';
    return `<div class="gam-tip-tl-row"><span class="gam-tip-tl-icon">${icon}</span> ${escapeHtml(timeAgo(a.ts))}${escapeHtml(who)} &middot; ${escapeHtml(label)}</div>`;
  }).join('');
  timelineBlock = `<div class="gam-tip-timeline">${rows}</div>`;
}
```

CSS to add alongside the existing `.gam-tip-*` rules:
```css
.gam-tip-timeline{margin-top:6px;padding-top:6px;border-top:1px solid ${C.BORDER};font-size:10px;line-height:1.5}
.gam-tip-tl-row{color:${C.TEXT3};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gam-tip-tl-icon{font-weight:700;color:${C.TEXT2};margin-right:3px;font-size:9px;letter-spacing:.5px}
```

---

## H. STRETCH — Full panel mode + embedded mini Activity Timeline

**Full panel mode:** on pin, the tooltip transitions to a 480px-wide panel
anchored to the right edge of the viewport (slide in from right, 20px from top,
full viewport height minus 40px top/bottom margin). Content expands to show:
full action history (paginated, 20 per page), brigade memberships, ban-detail
cards (each ban: reason, violation, mod, duration, any appeals). Close button
or Escape dismisses. This is essentially a right-drawer scoped to one user —
reuses the IntelDrawer infrastructure but filtered to a single username.

**Implementation path:** `pinTooltip` detects viewport width; if `>= 1200px`,
applies the panel class instead of the card class. The existing `IntelDrawer`
already does the heavy lifting for user detail — `pinTooltip` would call
`IntelDrawer.open({ kind:'User', username, inline:true })` with an `inline`
flag that renders inside the pinned card element rather than as a separate
drawer. This keeps the code path unified.

**Embedded mini Activity Timeline in hover (ship with H):** the G-tonight
timeline (5 entries, local only) becomes the "preview" strip. In full panel
mode, a "Show full history" link at the bottom of the timeline expands to the
full paginated list. No duplication — same data, two display modes.

**Priority gate:** ship G tonight, prototype D1 (quick-action buttons) in
parallel as a feature branch, defer H (full panel) to next sprint after D1
validates that mods use the hover for action — not just information.
