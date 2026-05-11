# UIUX2-14 -- Active Mods Popover Design Critique & V2 Spec
**Surface:** `_showActiveModsPopover` (modtools.js ~L17311)
**Version reviewed:** v10.12.3
**Date:** 2026-05-10
**Skill applied:** ui-ux-pro-max -- Bloomberg dense, team-presence popover

---

## A. What the current implementation does

The popover is triggered by clicking the people/presence button (`👥`) in the mod toolbar.
It queries `/presence/online` with a `since` cutoff based on the selected window (4h / 8h / 24h),
then renders a flat list of rows: `name | page-path | time-ago`.

Structure:
- Header bar: "ACTIVE MODS" title + 4H / 8H / 24H toggle buttons + `x` close
- Body: one `<div>` row per mod -- name (cyan) / page-path (muted gray / right) / time-ago (right)
- Window preference persisted to `activeModsWindow` setting

Dimensions: `min-width:280px`, `max-width:360px`, `max-height:320px`, scrollable body.

---

## B. What works well

1. **Toggle persistence.** `getSetting('activeModsWindow', 4)` on open means the operator's last
   window is pre-selected. Zero friction on re-open.

2. **Active state highlight on window buttons.** Orange border + background + text on selected
   button (L17337-17339). Readable and on-brand for the existing palette.

3. **Anchor-relative positioning (v10.6.2 fix).** `bottom = innerHeight - r.top + 6` places the
   popover above the mod bar, not below the viewport. Correct for a fixed-bottom toolbar.

4. **Single RPC, low latency.** One `presenceOnline` call per window change. No polling inside
   the popover, no duplicate requests.

5. **Tabular-nums on time-ago.** `font-variant-numeric:tabular-nums` on the `agoText` span
   keeps column width stable as values change. Good data-dense instinct.

6. **escapeHtml on all rendered data.** Name, page-path, and ago-text all pass through
   `escapeHtml`. XSS clean.

---

## C. Critical problems (blocking for V2)

### C1. No idle vs active visual hierarchy -- the #1 gap
All mod rows render identically: cyan name, muted gray page, mono gray time-ago.
A mod who was last seen 23h 58m ago looks identical to one seen 4 minutes ago.
This is a team-presence surface. The operator's first question is "who is live *right now*?"
and the current design forces them to parse every time-ago value mentally to answer it.

**Fix required:** Two-tier visual hierarchy.
- **Active** (last seen < 30m): full-brightness name + green accent indicator, bold time-ago.
- **Idle** (30m - threshold): dimmed name (opacity ~0.6), amber/yellow accent, lighter time-ago.
Optionally a third tier for "long ago" (> 4h in an 8h or 24h window): further dimmed, gray accent.

### C2. No avatar / presence indicator
The row is text-only. For a "who's online" popover, the absence of a presence dot or
avatar initial makes scanning significantly slower. Bloomberg terminal uses color-coded
status dots on trader presence lists precisely because the eye resolves color before it
reads text.

**Fix required:** A 6-8px colored dot (`border-radius:50%`) left-anchored per row:
- Green (#3dd68c) for active
- Amber (#ff9933) for idle
- Gray (#5a5752) for long-ago

This gives the operator a scannable column of status before any text is read.

### C3. Page-context is truncated to 32 chars with no ellipsis indicator
```js
const page = (m.pagePath || m.currentPage || '').slice(0, 32);
```
The rendered span has no `text-overflow:ellipsis` and no `overflow:hidden`. At 32 chars,
paths like `/politics/topic/great-awakening/comment/thread/12345` become
`/politics/topic/great-awakening/` -- plausible-looking but silently cut. The operator
has no visual cue that the path was truncated.

**Fix required:** Apply `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` to the
page span. Change the slice to 48 chars (the column has room at 360px wide). On hover,
show full path via `title` attribute (no JS needed).

### C4. Time-ago granularity is minutes-only, not seconds for recent activity
```js
const ago = seen ? Math.max(0, Math.floor((Date.now() - seen) / 60000)) : null;
const agoText = ago == null ? '?' : (ago < 60 ? ago + 'm' : Math.floor(ago/60) + 'h');
```
A mod seen 45 seconds ago shows `0m`. That reads as "just now" in numeric form but
is semantically confusing -- 0m could mean anything from 1 second to 59 seconds.
In the active tier this matters: "0m" should read "now" or "< 1m".

**Fix required:**
```js
function fmtAgo(ms) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60)  return 'now';
  const m = Math.floor(s / 60);
  if (m < 60)  return m + 'm';
  return Math.floor(m / 60) + 'h';
}
```

### C5. No count in header
The header reads "ACTIVE MODS" with no mod count. After a 24h window query the body
might list 14 mods. The operator has no immediate sense of team density without
scrolling through the list.

**Fix required:** Append count to header title: `ACTIVE MODS (n)` or a badge pill,
updated after the RPC resolves.

---

## D. Secondary problems (should fix for V2)

### D1. No sort order specified
The `mods` array is rendered in the order returned by `presenceOnline`. If the server
returns alphabetically, the most-recently-active mod might be buried. For a presence
list, the obvious sort is recency descending (most recent first).

**Fix:** `mods.sort((a, b) => (b.last_seen_at || 0) - (a.last_seen_at || 0))` before mapping rows.

### D2. Window buttons are not keyboard-accessible
The `4H / 8H / 24H` buttons are plain `<button>` elements with only `data-w` attributes.
They have no `aria-label` and no `aria-pressed` state. A mod using keyboard navigation
can tab to them but gets no screen-reader feedback on which window is selected.

**Fix:** Add `aria-pressed="true/false"` toggled by `highlightWindow()`. Add
`aria-label="4 hour window"` etc. to each button.

### D3. Close button has no aria-label
The `×` button is a bare Unicode multiply sign with no accessible label. Screen readers
announce it as "times" or "multiplication sign".

**Fix:** Add `aria-label="Close active mods"`.

### D4. Body max-height 320px with no scroll indicator
With 14+ mods (24h window), the body scrolls. There is no visual affordance that
content continues below. A subtle gradient fade at the bottom edge (a `::after` pseudo
or an inlined gradient div) resolves this.

**Fix:** Add `box-shadow: inset 0 -12px 8px -8px rgba(0,0,0,0.6)` on `#gam-active-mods-body`
when `scrollHeight > clientHeight` (detectable post-render with one JS check).

### D5. "loading..." and "querying..." are lowercase plain text
Both loading states use plain muted text with no visual affordance of activity.
The SUS and Auto-Unsticky popovers use shimmer or spinner-adjacent patterns.
Consistency within the family requires the same loading treatment.

**Fix:** Use a pulsing opacity animation on the loading text, or a horizontal shimmer
bar matching the row height. Duration 800ms, ease-in-out, prefers-reduced-motion off by default.

### D6. popover width min 280px may be too narrow on some paths
At 280px min-width with a 48-char page path, a 100px name, and a 20px time-ago,
the three columns will wrap or truncate on longer usernames. The SUS popover uses
`min-width:380px`. Active Mods should be `min-width:320px; max-width:400px` to match
the family density while giving the page-path column breathing room.

---

## E. Page-context column -- the missed opportunity

The current design treats the page-path column as a secondary detail, rendered in
`#5a5752` (the faintest muted gray in the palette). This is arguably the most
operationally useful column: it tells the operator *what each mod is actively doing*,
not just that they exist.

A mod on `/politics/topic/great-awakening` is working a different fire than one on
`/qresearch/thread/12345`. Two mods on the same thread is coordination signal.

**V2 recommendation:**
- Elevate page-path color to `#9b9892` (the "secondary" gray) so it reads without strain.
- Truncate to 40 chars with ellipsis.
- Make the page-path a clickable link (`<a href="..." target="_blank">`) so the operator
  can jump directly to what that mod is watching. Low-effort, high-value.
- Consider a shortened display: strip the site root and show only the meaningful suffix
  (`/t/great-awakening/...` not the full URL).

---

## F. Time-window selector -- micro-UX gaps

### F1. No visual grouping
The three buttons `4H 8H 24H` sit inline in the header with no border/group treatment.
They read as three independent actions, not a mutually exclusive selector.
Bloomberg groups range selectors with a tight border that emphasizes the option set.

**Fix:** Wrap in a `<div style="display:flex;border:1px solid #2a2825">` and remove
individual button borders, so they read as a segmented control.

### F2. Button hit area is too small
Each button is `padding:2px 6px` at 10px font. The effective tap/click area is approximately
18x22px -- below the 44x44pt minimum for touch. Even on desktop this is cramped.

**Fix:** `padding:3px 10px` lifts the click area and improves legibility without
meaningfully widening the header.

### F3. Loading latency not communicated
When switching from 4H to 24H the RPC may take 300-800ms. The body switches to
`color:#5a5752` "querying..." text, but the selected button highlight updates
*immediately* via `highlightWindow(hours)` before data arrives. This creates a
brief mismatch: the 24H button looks selected but data shown is still from the 4H query
if the operator clicks fast.

**Fix:** Update button highlight only on RPC success, or show a small spinner
inline in the selected button during the load.

---

## G. Idle vs active visual hierarchy -- full V2 spec

This section defines the complete visual treatment replacing the current flat rows.

### Color tokens (existing palette)

| State | Dot color | Name color | Time-ago color | Row bg on hover |
|-------|-----------|------------|----------------|-----------------|
| Active (< 30m) | `#3dd68c` (green) | `#e8e6e1` (primary) | `#3dd68c` bold | `rgba(61,214,140,0.04)` |
| Idle (30m-4h) | `#ff9933` (amber) | `#9b9892` (secondary, opacity 0.85) | `#9b9892` normal | `rgba(255,153,51,0.03)` |
| Long ago (>4h) | `#5a5752` (muted) | `#5a5752` (muted, opacity 0.7) | `#5a5752` small | transparent |

### Row DOM structure (V2)

```
<div class="gam-am-row" data-state="active|idle|stale">
  <span class="gam-am-dot"></span>           <!-- 7px circle, colored by state -->
  <span class="gam-am-name">username</span>  <!-- bold 11px, color by state -->
  <a class="gam-am-page" href="..." target="_blank" title="full path">
    /short/path...                            <!-- 40 chars, ellipsis, clickable -->
  </a>
  <span class="gam-am-ago">4m</span>         <!-- tabular-nums, right-aligned -->
</div>
```

### Section dividers (optional, high value)

If >= 1 active AND >= 1 idle mod in the current window, insert a thin divider between
tiers with a label:

```
-- ACTIVE (n) --    [full-width rule, muted]
[active rows]
-- IDLE (n) --      [full-width rule, muted]
[idle rows]
```

This immediately answers "who can I ping right now" without any scanning.

### CSS (inline on injection, idempotent)

```css
.gam-am-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 0;
  border-bottom: 1px solid #1e1c1a;
  cursor: default;
}
.gam-am-row:hover { background: var(--gam-am-hover-bg, transparent); }
.gam-am-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--gam-am-dot-color, #5a5752);
}
.gam-am-name {
  font-weight: 600;
  color: var(--gam-am-name-color, #9b9892);
  flex-shrink: 0;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gam-am-page {
  flex: 1;
  color: #9b9892;
  font-size: 10px;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}
.gam-am-page:hover { color: #e8e6e1; text-decoration: underline; }
.gam-am-ago {
  font-variant-numeric: tabular-nums;
  color: var(--gam-am-ago-color, #9b9892);
  flex-shrink: 0;
  min-width: 28px;
  text-align: right;
  font-size: 10px;
}
[data-state="active"] { --gam-am-dot-color: #3dd68c; --gam-am-name-color: #e8e6e1; --gam-am-ago-color: #3dd68c; --gam-am-hover-bg: rgba(61,214,140,0.04); }
[data-state="idle"]   { --gam-am-dot-color: #ff9933; --gam-am-name-color: #9b9892; --gam-am-ago-color: #9b9892; --gam-am-hover-bg: rgba(255,153,51,0.03); }
[data-state="stale"]  { --gam-am-dot-color: #5a5752; --gam-am-name-color: #5a5752; --gam-am-ago-color: #5a5752; --gam-am-hover-bg: transparent; }
```

---

## H. V2 implementation spec (surgical diff from current)

The following changes replace the `loadWindow` row-map and associated HTML in
`_showActiveModsPopover`. No other popover is touched.

### H1. Inject CSS once (idempotent guard)

Add the `.gam-am-*` CSS block (from section G above) via the same `document.getElementById`
idempotency guard used by the SUS popover. Inject into `document.head` on first open.

### H2. `fmtAgo` helper

Replace inline `agoText` calculation with:

```js
function fmtAgo(ms) {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60)  return 'now';
  const m = Math.floor(s / 60);
  if (m < 60)  return m + 'm';
  return Math.floor(m / 60) + 'h';
}
```

### H3. State classifier

```js
function modState(seenAt) {
  const age = Date.now() - seenAt;
  if (age < 30 * 60_000) return 'active';
  if (age < 4 * 3600_000) return 'idle';
  return 'stale';
}
```

### H4. Replace row-map in `loadWindow`

```js
// Sort recency descending
mods.sort((a, b) => ((b.last_seen_at || b.ts || 0) - (a.last_seen_at || a.ts || 0)));

// Build with state tiers
let html = '';
let lastState = null;
const counts = { active: 0, idle: 0, stale: 0 };
mods.forEach(m => counts[modState(m.last_seen_at || m.ts || 0)]++);

mods.forEach(m => {
  const name    = m.mod || m.username || m.mod_username || '?';
  const seenMs  = m.last_seen_at || m.ts || m.at || 0;
  const state   = modState(seenMs);
  const agoTxt  = seenMs ? fmtAgo(seenMs) : '?';
  const rawPage = m.pagePath || m.currentPage || '';
  const shortPage = rawPage.length > 40 ? rawPage.slice(0, 40) + '...' : (rawPage || '--');
  const fullPage  = rawPage || '';

  // Tier divider
  if (state !== lastState) {
    const label = state === 'active' ? 'ACTIVE (' + counts.active + ')'
                : state === 'idle'   ? 'IDLE ('   + counts.idle   + ')'
                : 'EARLIER';
    html += '<div style="padding:5px 0 2px;color:#5a5752;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;border-bottom:1px solid #1e1c1a">' + label + '</div>';
    lastState = state;
  }

  html += '<div class="gam-am-row" data-state="' + state + '">' +
    '<span class="gam-am-dot"></span>' +
    '<span class="gam-am-name">' + escapeHtml(name) + '</span>' +
    (fullPage
      ? '<a class="gam-am-page" href="' + escapeHtml(fullPage) + '" target="_blank" rel="noopener" title="' + escapeHtml(fullPage) + '">' + escapeHtml(shortPage) + '</a>'
      : '<span class="gam-am-page" style="color:#3a3835">--</span>'
    ) +
    '<span class="gam-am-ago">' + agoTxt + '</span>' +
  '</div>';
});
body.innerHTML = html;
```

### H5. Update header count after RPC resolves

```js
const countEl = pop.querySelector('#gam-am-count');
if (countEl) countEl.textContent = '(' + mods.length + ')';
```

Add `<span id="gam-am-count"></span>` next to the "ACTIVE MODS" title span in the header HTML.

### H6. Segmented control for time-window buttons

Replace individual button HTML in the header with:

```html
<div style="display:flex;border:1px solid #2a2825;border-radius:2px;overflow:hidden">
  <button data-w="4"  style="...padding:3px 10px;border:none;border-right:1px solid #2a2825">4H</button>
  <button data-w="8"  style="...padding:3px 10px;border:none;border-right:1px solid #2a2825">8H</button>
  <button data-w="24" style="...padding:3px 10px;border:none">24H</button>
</div>
```

`highlightWindow` logic unchanged -- it already sets bg/color/border via inline style.
The outer wrapper border creates the segmented-control visual grouping.

### H7. aria-label additions

- Window buttons: `aria-label="4 hour window"` / `"8 hour window"` / `"24 hour window"`
  + `aria-pressed="false"` toggled by `highlightWindow`.
- Close button: `aria-label="Close active mods popover"`.

---

## Summary of V2 delta

| Item | Current | V2 |
|------|---------|-----|
| Idle vs active hierarchy | None -- flat list | Dot indicator + color tiers (active/idle/stale) |
| Sort order | Server order | Recency descending |
| Section dividers | None | ACTIVE (n) / IDLE (n) / EARLIER labels |
| Mod count in header | Not shown | `(n)` appended, updated post-RPC |
| Page-path treatment | 32 chars, muted gray, not clickable | 40 chars, ellipsis, link, hover = full path |
| Time-ago at < 1m | "0m" | "now" |
| Window selector UX | Three separate buttons | Segmented control (outer border group) |
| Button hit area | ~18x22px | ~24x28px (padding increase) |
| Accessibility | No aria-pressed, no aria-labels | aria-pressed on window buttons, aria-label on close |
| Page-context page-path column | Present but hard to read | Elevated contrast, clickable link |

All changes are contained within `_showActiveModsPopover`. No other popovers or functions are modified.
File size impact: +~80 lines (CSS injection block + fmtAgo + modState + revised row-map).
