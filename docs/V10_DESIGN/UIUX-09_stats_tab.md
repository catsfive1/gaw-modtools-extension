# UIUX-09 — Stats Tab Redesign
**GAW ModTools v10.11 — Bloomberg Ledger KPI Tiles**
**Date:** 2026-05-10 | **Status:** Design Spec (Read-Only) | **Author:** DESIGN-09-STATS-TAB

---

## A. Critique — Current State

### A.1 Tile anatomy deficiencies

| Problem | Impact | Root cause |
|---|---|---|
| Single number, no historical context | Operator cannot tell if 42 Pending is normal or a spike | No sparkline data stored; worker only returns point-in-time counts |
| No delta-vs-yesterday chip | "Bans/24h: 7" means nothing without "yesterday was 2" | API response has no prior-period field |
| Inline `style="color:#..."` on each `pop-stat-val` | Inconsistent with Bloomberg token system; 7 different hardcoded colors | Pre-token code never refactored |
| 3-column grid creates an orphan 7th tile | Bottom row: col-1, col-2, (gap). Asymmetric and visually broken | 7 is not divisible by 3 |
| Tiles give no affordance for "clicking leads somewhere useful" | Cursor pointer only on hover; no visual cue when idle | No secondary label or arrow indicator |
| AI tile has no `data-drill` | Cannot drill into AI usage detail | Missing; the other 6 all have drill handlers |
| Tile height is fixed-low: no room for sparkline | Current `padding: var(--bb-s4) var(--bb-s5)` leaves ~36px per tile | Layout was designed for number-only |

### A.2 Drill drawer deficiencies

| Problem | Impact |
|---|---|
| CSV export button lives in the footer, small and far from the column headers | Operator has to hunt for it; not immediately visible when drawer opens |
| No filter or sort controls in drawer | For large Pending lists (50+ users), operator must scroll linearly |
| Drawer title is plain text — no count badge | "Pending users (awaiting triage)" gives no fast count; operator must read the rows |
| `pop-drill-foot` is always rendered even when no data | Footer with "0 rows" + an export button looks broken |
| No keyboard shortcut to close | Esc is wired in JS but not surfaced in the UI at all |

### A.3 Summary verdict

The tile grid is functional but blind — it tells the operator *what the number is right now* without any sense of direction, trend, or alarm threshold. Bloomberg terminal tiles are never blind: every KPI includes a tick (last change), a delta (vs prior period), and a signal line. The drill drawer is correctly modal-in-panel but loses the operator the moment it opens — no filter, no quick-sort, no count, no keyboard escape label.

---

## B. Redesign — Tile System v2

### B.1 Tile anatomy (each KPI tile)

```
+------------------------------------------+
| LABEL              [delta chip]           |  row-1: label + delta
|                                           |
| BIG NUMBER                                |  row-2: main value (tabular-nums)
|                                           |
| [sparkline — 7 bars, last 7 days]         |  row-3: mini spark
+------------------------------------------+
```

**Label row:** uppercase monospace label (existing `pop-stat-label` style), right-aligned delta chip showing `+N` / `-N` vs yesterday. Chip is colored green/red per direction. Neutral (0 change) uses `var(--bb-ink-dim)` and no sign.

**Big number row:** existing `pop-stat-val` / `.value` class — `font-size: 18px`, `font-weight: 600`, `font-variant-numeric: tabular-nums`. Color remains semantic per tile (see tile table below). The number itself is unchanged; we're adding context below it.

**Sparkline row:** 7 vertical bars (SVG inline or CSS), one per day D-6 through D-0 (today). Bar height scaled relative to the 7-day max for that metric. Today's bar gets a subtle amber tint. Width: fills the tile interior minus 4px gutters. Height: 18px total. No axes, no labels — pure visual signal. Bars are `3px wide`, `2px gap`, `border-radius: 1px` top only.

### B.2 Delta chip spec

```
[+12]   green, up direction
[-3]    red, down direction
[=]     ink-dim, no change
[?]     ink-faint, no prior data (first day)
```

- Font: `9px / var(--bb-font)` monospace
- Padding: `1px 4px`
- Border: `1px solid currentColor` at 40% opacity
- `border-radius: 2px`
- No background fill (transparent); color is the signal
- Position: right-aligned on the label row via flexbox `justify-content: space-between`

### B.3 Tile semantic color table

| Tile | ID | Primary color | State overrides |
|---|---|---|---|
| Pending | `s-pending` | `--bb-amber` | >20: `--bb-red` (alarm) |
| Death Row | `s-dr` | `--bb-purple` | >0: always purple (it's always notable) |
| Banned | `s-banned` | `--bb-red` | none |
| Bans/24h | `s-today` | `--bb-cyan` | >10/day: `--bb-red` |
| Msgs/24h | `s-msgs` | `--bb-green` | none |
| Notes/24h | `s-notes` | `--bb-warn` | none |
| AI today | `s-ai-today` | `--bb-purple` | >80% cap: `--bb-red` |
| Auto-Unsticky | `s-unsticky` | `--bb-cyan` | none (informational) |

Colors are applied via `data-state` attribute on `.pop-stat`, not inline styles. This makes the Bloomberg CSS iter-9 overrides work correctly.

### B.4 Grid layout — 4 columns (8 tiles, 2 rows)

Current: 3-col, 7 tiles, orphan last tile.
Redesign: **4-col, 8 tiles, 2 clean rows**.

```
[ Pending ] [ Death Row ] [ Banned   ] [ Bans/24h ]
[ Msgs/24h ] [ Notes/24h ] [ AI today ] [ Auto-UNS ]
```

The 4-col layout also allows narrower tiles which makes room for the sparkline row without making the popup taller. Each tile shrinks from ~160px to ~120px wide in the 520px popup (accounting for padding and gap).

If the 8th tile (Auto-Unsticky) is deferred, keep 7 tiles with `grid-template-columns: repeat(4, 1fr)` and `grid-column: span 2` on the last tile so it fills the orphan slot gracefully.

### B.5 Drill drawer — v2

**Header:** title + inline count badge + ESC label (right side, next to the X button)

```
[ Pending users (awaiting triage)  (42) ]           [ESC ×]
```

**Toolbar row (new — top of body, above table):**
```
[ Filter: [__________] ] [ Sort: [ Time v ] ] [  Export CSV  ]
```

- Filter: `<input type="search">` inline, placeholder "filter by username...", live-filters rows in JS
- Sort: `<select>` with options matching the column set for that drill type (Time, Username, Status)
- Export CSV: moved from the footer into the toolbar row, right-aligned. Same `.pop-link` class, now visually discoverable on open.

**Table:** unchanged structure (timestamp, user, meta columns). `pop-drill-head` border remains amber.

**Footer:** reduced to just the meta count string ("`42 rows — last updated 14:23`"), no export button here.

**Keyboard hint:** permanent tiny label at bottom right: `ESC to close` in `var(--bb-ink-faint)` 9px.

---

## C. 8th Tile: AUTO-UNSTICKY

### C.1 Rationale

v10.10 introduced auto-unsticky behavior: posts that match certain patterns are automatically stripped of sticky status by the extension. This is an automated mod action that has no current visibility in the Stats tab. Operators using v10.10+ have no quick way to answer "how many times did the auto-unsticky fire today?"

This is exactly the class of metric that belongs in the Stats tab:
- It's a count of automated actions (same category as Bans/24h)
- It's time-windowed (24h)
- It's drillable (which posts, what time, what triggered it)
- It gives operators confidence the automation is working

### C.2 Tile spec

```
Label:   AUTO-UNS
Value:   count of auto-unsticky events in last 24h
Color:   --bb-cyan (informational, not alarm-level)
Delta:   vs yesterday's count
Spark:   7-day bar chart (same pattern as other tiles)
Drill:   list of post IDs/titles + timestamp + trigger reason
data-drill: "unsticky24"
```

### C.3 Data source

Requires a new log entry type in the mod action log (same store that drives Bans/24h and Msgs/24h). The auto-unsticky handler in `modtools.js` needs to write a log entry with `type: "auto_unsticky"`, `postId`, `timestamp` when it fires. The worker `/mod/stats` endpoint already aggregates 24h counts — adding one more type is a filter change, not a schema change.

Worker work is acknowledged as separate from this design spec (see Section G).

---

## D. Visual Mockup

```
+=========================================================+
| SHIELD ModTools                          v10.11  [LEAD] |  <- amber bottom border
+=========================================================+
| [Stats]  Tokens   Tools   Lead   Diag                   |  <- tab nav, amber underline on active
+=========================================================+

STATS GRID (4 x 2, no gap between cells, outer border only):

+-------------+-------------+-------------+-------------+
| PENDING     +3            | DEATH ROW   +1            |
|             42            |              7             |
| [||||  | |] (spark)       | [||| | || |] (purple bars) |
+-------------+-------------+-------------+-------------+
| BANS/24H    -2            | MSGS/24H    +11           |
|              9            |             47             |
| [|    | | |] (cyan bars)  | [| ||| ||||] (green bars) |
+-------------+             +-------------+             |

-- wait, the mockup above has wrong row count. Let me render all 8: --

ROW 1:
+-------------+-------------+-------------+-------------+
| PENDING     |  DEATH ROW  |   BANNED    | BANS / 24H  |
|  [+3] chip  |  [+1] chip  |   [=] chip  |  [-2] chip  |
|             |             |             |             |
|     42      |      7      |    1,204    |      9      |
|             |             |             |             |
| ||||  | |   | ||| | || |  | || |  | ||  | |    | | |  |  <- 7-bar sparklines
+-------------+-------------+-------------+-------------+

ROW 2:
+-------------+-------------+-------------+-------------+
| MSGS / 24H  | NOTES / 24H |  AI TODAY   |  AUTO-UNS   |
|  [+11] chip |   [=] chip  |  [-5] chip  |  [+2] chip  |
|             |             |             |             |
|     47      |     12      |  47 / 500   |      3      |
|             |             |             |             |
| | ||| ||||  | || | |  |   | || ||||  |  | |  |  |  |  |
+-------------+-------------+-------------+-------------+

AI TODAY shows "47/500" format (used/cap) with the bar representing utilization %.
```

**Drill drawer (Pending example):**
```
+=========================================================+
| Pending users (awaiting triage)  (42)       [ESC] [x]  |  <- amber bottom border on title
+---------------------------------------------------------+
| Filter: [__________________]  Sort:[Time v] [Export CSV]|  <- new toolbar row
+---------------------------------------------------------+
| TIME       | USERNAME         | STATUS   | JOINED       |
|------------+------------------+----------+--------------|
| 14:23:01   | badactor_user    | [PENDING]| 2 days ago   |
| 14:21:44   | spambot_99       | [PENDING]| 1 hour ago   |
| ...                                                     |
+---------------------------------------------------------+
| 42 rows -- last refreshed 14:24                  ESC to close |
+=========================================================+
```

---

## E. CSS Spec

### E.1 New CSS variables (add to the Bloomberg block at line ~672)

```css
/* v10.11: sparkline tokens */
--bb-spark-h:     18px;   /* total sparkline row height */
--bb-spark-bar-w: 3px;    /* bar width */
--bb-spark-gap:   2px;    /* gap between bars */
--bb-spark-today: rgba(255,153,51,0.40);  /* today's bar tint over base color */
--bb-delta-font:  9px;    /* delta chip font size */
```

### E.2 Grid changes

```css
/* Iter 9 override — 4-col layout for 8 tiles */
.pop-stats {
  display: grid !important;
  grid-template-columns: repeat(4, 1fr) !important;  /* was repeat(3,1fr) */
  gap: 0 !important;
  border: 1px solid var(--bb-line) !important;
  border-radius: 0 !important;
  background: var(--bb-panel) !important;
  margin: var(--bb-s3) 0 !important;
}
/* Fix nth-child border rules for 4-col */
.pop-stat:nth-child(3n) { border-right: 1px solid var(--bb-line) !important; }  /* undo old 3-col rule */
.pop-stat:nth-child(4n) { border-right: none !important; }
.pop-stat:nth-last-child(-n+4) { border-bottom: none !important; }  /* was -n+3 */
```

### E.3 Tile inner layout

```css
/* Tile inner — flexbox column to stack label-row / value / sparkline */
.pop-stat {
  /* ...existing... */
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: var(--bb-s3) var(--bb-s4) !important;  /* slightly tighter than s4/s5 */
  min-height: 64px;  /* enough for 3 rows + sparkline */
}

/* Label row: label left, delta chip right */
.pop-stat-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--bb-s2);
}

/* Delta chip */
.pop-stat-delta {
  font: 400 var(--bb-delta-font)/1 var(--bb-font);
  font-variant-numeric: tabular-nums;
  padding: 1px 4px;
  border-radius: 2px;
  border: 1px solid currentColor;
  opacity: 0.9;
}
.pop-stat-delta[data-dir="up"]   { color: var(--bb-green); }
.pop-stat-delta[data-dir="down"] { color: var(--bb-red); }
.pop-stat-delta[data-dir="flat"] { color: var(--bb-ink-dim); border-color: var(--bb-line); }
.pop-stat-delta[data-dir="none"] { color: var(--bb-ink-faint); border-color: var(--bb-line); }

/* Big value */
.pop-stat-val {
  font: 600 var(--bb-t-xl)/1.1 var(--bb-font) !important;
  font-variant-numeric: tabular-nums slashed-zero;
  letter-spacing: -0.01em;
  flex: 0 0 auto;
  margin-bottom: var(--bb-s2);
}

/* Sparkline container */
.pop-stat-spark {
  display: flex;
  align-items: flex-end;
  gap: var(--bb-spark-gap);
  height: var(--bb-spark-h);
  margin-top: auto;  /* pushes sparkline to bottom of tile */
}

/* Individual spark bar */
.pop-stat-spark-bar {
  flex: 1 1 0;
  min-width: var(--bb-spark-bar-w);
  max-width: 8px;
  border-radius: 1px 1px 0 0;
  background: currentColor;
  opacity: 0.45;
  transition: opacity 100ms;
}
.pop-stat-spark-bar.today {
  opacity: 0.85;
}
.pop-stat-spark-bar.zero {
  height: 2px !important;  /* render zero as a baseline stub, not invisible */
  opacity: 0.20;
}

/* Tile hover: bars brighten */
.pop-stat:hover .pop-stat-spark-bar { opacity: 0.65; }
.pop-stat:hover .pop-stat-spark-bar.today { opacity: 1.0; }
```

### E.4 Drill drawer toolbar

```css
/* v10.11: drill toolbar — filter + sort + export in one row */
.pop-drill-toolbar {
  display: flex;
  align-items: center;
  gap: var(--bb-s4);
  padding: var(--bb-s3) var(--bb-s5);
  border-bottom: 1px solid var(--bb-line);
  background: var(--bb-sunken);
}
.pop-drill-filter {
  flex: 1 1 auto;
  /* inherits input styles from Iter 6 */
}
.pop-drill-sort {
  flex: 0 0 auto;
  min-width: 80px;
  /* inherits select styles from Iter 6 */
}
.pop-drill-export {
  flex: 0 0 auto;
  /* inherits .pop-link styles */
  white-space: nowrap;
}

/* Drill header count badge */
.pop-drill-count {
  display: inline-block;
  margin-left: var(--bb-s3);
  padding: 1px 5px;
  background: var(--bb-amber-bg);
  border: 1px solid var(--bb-amber-dim);
  color: var(--bb-amber);
  font: 400 var(--bb-t-xs)/1.2 var(--bb-font);
  font-variant-numeric: tabular-nums;
  border-radius: 2px;
}

/* ESC hint — bottom of drawer */
.pop-drill-esc-hint {
  font: 400 9px/1 var(--bb-font);
  color: var(--bb-ink-faint);
  padding: 0 var(--bb-s5) var(--bb-s3);
  text-align: right;
}
```

---

## F. HTML Structure

### F.1 Single KPI tile (repeated pattern)

```html
<!-- Example: Pending tile -->
<div class="pop-stat" data-drill="pending"
     title="Users awaiting first-decision triage. Click to list.">

  <div class="pop-stat-head">
    <span class="pop-stat-label">Pending</span>
    <!-- data-dir: "up" | "down" | "flat" | "none" -->
    <!-- JS sets innerText to "+3", "-2", "=", "?" -->
    <span class="pop-stat-delta" data-dir="none" id="d-pending">?</span>
  </div>

  <div class="pop-stat-val" id="s-pending">&mdash;</div>

  <!-- 7 bars, D-6 to D-0 (today = last bar). Heights set by JS as inline style.
       Each bar inherits color from the tile's CSS color (via currentColor on parent).
       class="today" added to the 7th bar always. class="zero" added when value=0. -->
  <div class="pop-stat-spark" id="spark-pending" aria-hidden="true">
    <div class="pop-stat-spark-bar" style="height:60%"></div>
    <div class="pop-stat-spark-bar" style="height:80%"></div>
    <div class="pop-stat-spark-bar" style="height:40%"></div>
    <div class="pop-stat-spark-bar" style="height:100%"></div>
    <div class="pop-stat-spark-bar" style="height:70%"></div>
    <div class="pop-stat-spark-bar" style="height:50%"></div>
    <div class="pop-stat-spark-bar today" style="height:90%"></div>
  </div>

</div>
```

### F.2 Full stats grid (all 8 tiles)

```html
<div class="pop-stats" data-tab="stats">

  <div class="pop-stat" data-drill="pending" title="Users awaiting triage. Click to list.">
    <div class="pop-stat-head">
      <span class="pop-stat-label">Pending</span>
      <span class="pop-stat-delta" data-dir="none" id="d-pending">?</span>
    </div>
    <div class="pop-stat-val" id="s-pending">&mdash;</div>
    <div class="pop-stat-spark" id="spark-pending" aria-hidden="true"></div>
  </div>

  <div class="pop-stat" data-drill="dr" title="Death Row queue: scheduled bans pending execution.">
    <div class="pop-stat-head">
      <span class="pop-stat-label">Death Row</span>
      <span class="pop-stat-delta" data-dir="none" id="d-dr">?</span>
    </div>
    <div class="pop-stat-val" id="s-dr">&mdash;</div>
    <div class="pop-stat-spark" id="spark-dr" aria-hidden="true"></div>
  </div>

  <div class="pop-stat" data-drill="banned" title="Users in roster with status=banned.">
    <div class="pop-stat-head">
      <span class="pop-stat-label">Banned</span>
      <span class="pop-stat-delta" data-dir="none" id="d-banned">?</span>
    </div>
    <div class="pop-stat-val" id="s-banned">&mdash;</div>
    <div class="pop-stat-spark" id="spark-banned" aria-hidden="true"></div>
  </div>

  <div class="pop-stat" data-drill="bans24" title="Mod actions tagged 'ban' in the last 24h.">
    <div class="pop-stat-head">
      <span class="pop-stat-label">Bans&nbsp;/&nbsp;24h</span>
      <span class="pop-stat-delta" data-dir="none" id="d-bans24">?</span>
    </div>
    <div class="pop-stat-val" id="s-today">&mdash;</div>
    <div class="pop-stat-spark" id="spark-bans24" aria-hidden="true"></div>
  </div>

  <div class="pop-stat" data-drill="msgs24" title="Messages and replies sent in the last 24h.">
    <div class="pop-stat-head">
      <span class="pop-stat-label">Msgs&nbsp;/&nbsp;24h</span>
      <span class="pop-stat-delta" data-dir="none" id="d-msgs24">?</span>
    </div>
    <div class="pop-stat-val" id="s-msgs">&mdash;</div>
    <div class="pop-stat-spark" id="spark-msgs24" aria-hidden="true"></div>
  </div>

  <div class="pop-stat" data-drill="notes24" title="Mod notes written in the last 24h.">
    <div class="pop-stat-head">
      <span class="pop-stat-label">Notes&nbsp;/&nbsp;24h</span>
      <span class="pop-stat-delta" data-dir="none" id="d-notes24">?</span>
    </div>
    <div class="pop-stat-val" id="s-notes">&mdash;</div>
    <div class="pop-stat-spark" id="spark-notes24" aria-hidden="true"></div>
  </div>

  <!-- AI today — now has data-drill; drill shows per-call log for today -->
  <div class="pop-stat" data-drill="ai24" title="AI calls used today vs daily cap. Click for per-call log.">
    <div class="pop-stat-head">
      <span class="pop-stat-label">AI&nbsp;Today</span>
      <span class="pop-stat-delta" data-dir="none" id="d-ai24">?</span>
    </div>
    <div class="pop-stat-val" id="s-ai-today">&mdash;</div>
    <div class="pop-stat-spark" id="spark-ai24" aria-hidden="true"></div>
  </div>

  <!-- 8th tile: Auto-Unsticky (v10.10+) -->
  <div class="pop-stat" data-drill="unsticky24"
       title="Posts auto-unstickied by extension rules in the last 24h. Click for detail.">
    <div class="pop-stat-head">
      <span class="pop-stat-label">Auto-UNS</span>
      <span class="pop-stat-delta" data-dir="none" id="d-unsticky24">?</span>
    </div>
    <div class="pop-stat-val" id="s-unsticky">&mdash;</div>
    <div class="pop-stat-spark" id="spark-unsticky24" aria-hidden="true"></div>
  </div>

</div><!-- .pop-stats -->
```

### F.3 Drill drawer (updated)

```html
<div id="pop-drill" class="pop-drill" style="display:none">

  <div class="pop-drill-head">
    <span class="pop-drill-title" id="pop-drill-title"></span>
    <span class="pop-drill-count" id="pop-drill-count" style="display:none"></span>
    <span style="flex:1"></span>
    <span class="pop-drill-esc-key" style="font:400 9px/1 var(--bb-font);color:var(--bb-ink-faint);margin-right:8px">ESC</span>
    <button class="pop-drill-close" id="pop-drill-close" title="Close (Esc)">&times;</button>
  </div>

  <!-- NEW: toolbar row with filter + sort + export -->
  <div class="pop-drill-toolbar">
    <input  type="search" class="pop-drill-filter" id="pop-drill-filter"
            placeholder="filter..." autocomplete="off">
    <select class="pop-drill-sort" id="pop-drill-sort">
      <option value="time">Time</option>
      <option value="user">Username</option>
      <option value="status">Status</option>
    </select>
    <button class="pop-link pop-drill-export" id="pop-drill-csv"
            title="Export rows as CSV">Export CSV</button>
  </div>

  <div class="pop-drill-body" id="pop-drill-body"></div>

  <div class="pop-drill-foot">
    <span class="pop-drill-meta" id="pop-drill-meta"></span>
    <span class="pop-drill-esc-hint">ESC to close</span>
  </div>

</div><!-- #pop-drill -->
```

### F.4 JS integration notes (popup.js — not implementation, just contract)

The `loadStats()` function needs to:

1. Call `renderSparkline(id, data7, color)` — a new helper that accepts the stat's `spark-*` container ID, a 7-element array of daily counts `[d-6, d-5, ..., d-0]`, and the tile's CSS color variable name. The helper sets bar heights as percentages relative to `Math.max(...data7)`. If max is 0, all bars get `class="zero"`.

2. Call `renderDelta(id, today, yesterday)` — sets the `d-*` span: text = delta value with sign, `data-dir` = "up"/"down"/"flat"/"none". "none" when yesterday is null (no history yet).

3. `renderDrillDown()` must:
   - Populate `#pop-drill-count` with the row count and show it.
   - Wire `#pop-drill-filter` `input` event to live-filter `.pop-drill-row` elements by `data-user` or row text content.
   - Wire `#pop-drill-sort` `change` event to re-sort visible rows by the selected column.
   - Move the CSV export from the footer click handler to `#pop-drill-csv` in the toolbar.

4. The `"ai24"` drill key needs a new `__DRILL_TITLES` entry and a corresponding `renderDrillDown` branch (currently the AI tile has no drill).

---

## G. Worker-Side Fields Needed for Sparklines

The following fields must be added to the `/mod/stats` worker endpoint response. This section is a design-time flag — worker implementation is separate work.

### G.1 Current response shape (inferred from popup.js usage)

```json
{
  "pending": 42,
  "dr": 7,
  "banned": 1204,
  "bans24": 9,
  "msgs24": 47,
  "notes24": 12,
  "aiToday": 47,
  "aiCap": 500
}
```

### G.2 Required additions

```json
{
  "pending":   42,
  "dr":         7,
  "banned":  1204,
  "bans24":     9,
  "msgs24":    47,
  "notes24":   12,
  "aiToday":   47,
  "aiCap":    500,
  "unsticky24": 3,       /* NEW: auto-unsticky count today */

  "spark": {             /* NEW: 7-day history arrays, index 0 = D-6, index 6 = today */
    "pending":   [38, 41, 44, 39, 42, 40, 42],
    "dr":        [ 5,  6,  8,  7,  6,  6,  7],
    "banned":    [1190,1194,1196,1199,1201,1202,1204],
    "bans24":    [11, 8, 7, 12, 10, 11, 9],
    "msgs24":    [31, 38, 44, 51, 47, 36, 47],
    "notes24":   [9, 11, 10, 14, 12, 13, 12],
    "aiToday":   [60, 55, 72, 48, 61, 52, 47],
    "unsticky24":[1,  0,  2,  1,  3,  2,  3]
  },

  "yesterday": {         /* NEW: prior-day values for delta chips */
    "pending":   40,
    "dr":         6,
    "banned":  1202,
    "bans24":    11,
    "msgs24":    36,
    "notes24":   13,
    "aiToday":   52,
    "unsticky24": 2
  }
}
```

### G.3 Worker implementation strategy

- `spark` arrays are derived from a time-series table or a rolling aggregate in D1. The simplest approach: a `mod_stats_daily` table keyed on `(date, metric_name, value)` with a row written once per UTC day. The `/mod/stats` endpoint queries the last 7 rows per metric.
- `yesterday` values are `spark[metric][5]` (second-to-last element) — the worker can omit the `yesterday` object entirely and let the popup compute `spark[metric][5]` as the prior-day value. Simpler.
- `unsticky24` requires the extension to write an event log entry when auto-unsticky fires. The worker aggregates count by UTC day. If the extension writes to a `mod_actions` table with `type="auto_unsticky"`, no new table is needed — the existing 24h count query just adds a `type` filter.

**The popup can degrade gracefully if `spark` is absent:** render bars as empty/zero stubs. The delta chips show "?" (`data-dir="none"`). Zero worker changes are required to ship the HTML+CSS redesign — the JS populates what it has.

---

## H. Effort Estimate

| Work item | Owner | Estimate | Notes |
|---|---|---|---|
| **H.1** CSS changes (grid 3->4 col, tile flex layout, delta chip, sparkline bars, drill toolbar) | Frontend | 1.5h | All additive; existing Bloomberg iter-9/10 rules are untouched except the nth-child border fix |
| **H.2** HTML changes (popup.html L47-95 — tile structure + drill drawer toolbar) | Frontend | 0.5h | Mechanical; follows spec in Section F |
| **H.3** JS: `renderSparkline()` + `renderDelta()` helpers in popup.js | Frontend | 1.5h | New helpers; `loadStats()` call sites need 2 new calls per tile (8 tiles = 16 calls) |
| **H.4** JS: drill drawer filter/sort wiring + count badge + ai24 drill branch | Frontend | 1.5h | Filter is live DOM search; sort is array re-render |
| **H.5** Worker: `spark` + `yesterday` fields in `/mod/stats` response | Worker | 2h | D1 query for 7-day rollup; new `mod_stats_daily` table or derive from existing `mod_actions` |
| **H.6** Extension: auto-unsticky event log write + `unsticky24` tile | Extension | 1h | Write one log entry in the auto-unsticky handler; tile is pure HTML/CSS copy of existing tiles |
| **H.7** QA: visual regression in 520px popup at 100% and 125% zoom | QA | 0.5h | Snapshot the stats grid at both zoom levels; confirm sparkline bars render |

**Total frontend-only (H.1–H.4):** ~5h — shippable independently of worker/extension work.
**Total including worker + extension (H.5–H.6):** ~8.5h end-to-end.
**Total with QA:** ~9h.

### H.8 Sequencing recommendation

1. Ship H.1 + H.2 (CSS + HTML) first — purely structural. No JS changes required. Stats tab renders identically functionally but has the 4-col grid and correct tile DOM shape.
2. Ship H.3 + H.4 (JS helpers) with stub data so sparklines render from localStorage history if available.
3. Ship H.5 (worker) to feed real 7-day history.
4. Ship H.6 (auto-unsticky tile) once the event log write is in place in the extension.

This sequence means operators see an improved grid immediately (step 1) and sparklines fill in progressively (steps 2-4) without ever seeing a broken state.

---

*End of UIUX-09_stats_tab.md*
