# UIUX2-01 -- Stats Tab Redesign V2
**Skill:** ui-ux-pro-max (Bloomberg Terminal aesthetic / ledger density / drillable KPIs / delta chips / sparklines)
**Audit basis:** v10.12.3 actual state -- popup.html:64-173, popup.css (multiple rule blocks), popup.js:480-806 + 4197-4290
**Stance:** Commander said "still dogfood" -- be ruthless

---

## A. Current State Critique (Fresh Eyes)

### A.1 -- Sparkline containers are ghost DOM (popup.html:75,84,93,102,111,120,130,141)
Every tile has `<div class="pop-stat-spark" id="spark-pending" aria-hidden="true"></div>`. CSS allocates space for them (popup.css ~L2222-2237: `display:flex; align-items:flex-end; margin-top:4px`). Zero JS ever writes a single bar into any of them. `grep spark-pending popup.js` returns nothing. The spark containers sit there eating vertical real estate (roughly 10-14px per tile) while rendering nothing. This is the single most dishonest element on the surface: it *looks* like sparklines are coming but they are structurally dead. Commander sees empty whitespace at the bottom of every card. That is dogfood evidence #1.

### A.2 -- Delta chips: HTML markup exists, JS never writes to them (popup.js:756-761)
`d-pending`, `d-dr`, `d-banned`, `d-today`, `d-msgs`, `d-notes`, `d-ai`, `d-unsticky` are all present in the DOM with `data-dir="none"` at initial render. `loadStats()` (popup.js:756-761) writes values to `s-*` elements only. Not one line touches the delta spans. `_updateKpiDelta()` exists (popup.js:5876) but is wired only to the Lead KPI dashboard, not the Stats tab. Result: every delta chip renders as a faint ghost box with empty content and `data-dir="none"` styling -- a border-only rectangle next to every label. Visible. Purposeless. Dogfood evidence #2.

### A.3 -- CSS specificity war with 475 !important declarations (popup.css)
The stats grid has at minimum FOUR separate rule blocks fighting each other:
- Block 1 (L54-66): `.pop-stats { grid-template-columns: repeat(3,1fr); gap:4px }` -- original 3-col
- Block 2 (L913-934): `.pop-stats { grid-template-columns: repeat(3,1fr) !important; gap:0 !important }` -- Iter 9 Bloomberg restyle
- Block 3 (L2292-2298): `.pop-stats { grid-template-columns: repeat(4,1fr) !important }` -- UIUX-09 4-col override
- Plus the L1449 specificity-war hotfix for `.pop-stats.pop-tab-hidden`
The `nth-child` border rules are also patched twice (L933 vs L2296-2298) with the first set fighting the second. A maintainer reading this file cannot determine ground truth layout without running the browser. The CSS is archaeology, not design. 475 `!important` occurrences in one file is a structural defect, not a style choice.

### A.4 -- Inline color overrides contradict the token system (popup.html:83,92,101,110,119,129,140)
Six of eight tiles hardcode `style="color:var(--bb-purple)"`, `color:var(--bb-red)"`, `color:var(--bb-cyan)"`, `color:var(--bb-green)"`, `color:var(--bb-warn)"`, and `color:#c084fc` directly on `s-*` elements in HTML. The Iter 9 Bloomberg CSS block (L944-950) declares `.pop-stat .value { color: var(--bb-amber) !important }` with a `[data-state]` override pattern. These two systems are in direct conflict: the HTML inline style wins over the token-driven CSS for most tiles (inline style specificity beats class+attribute selectors). The `data-state` semantic pattern (L951-953) is the right architecture; it is never used by loadStats(). The inline colors are cargo code from a pre-token era that was never cleaned up.

### A.5 -- "AI today" tile drill-down is a shipped placeholder (popup.js:4229-4248)
The 7th tile (`data-drill="ai24"`) renders a drill drawer that says verbatim: *"Per-call log (timestamp, action type, token cost) coming v10.11 -- requires /mod/stats ai_calls_today array from worker."* v10.12.3 is shipping. That comment was written for v10.11. The feature never landed. Every user who clicks the AI tile gets a drawer that openly admits the feature is unbuilt. This is not a draft state -- it is a shipped excuse. Dogfood evidence #3.

### A.6 -- Skeleton detection logic is string-matching brittle (popup.js:490)
`wireStatSkeletons()` (L490) detects initial state by checking `el.textContent === '--' || el.textContent === '—' || el.textContent === '&mdash;'`. The HTML for the 8th tile (popup.html:140) uses `--` (double dash, not em-dash entity). The other seven use `&mdash;` rendered as the em-dash character. When the browser renders `&mdash;`, `textContent` returns `"—"` (the character), which does match. But the string literal in the condition is `'—'` (the character), which only works if the source file encoding is correct at parse time. The `--` check on L490 is for the 8th tile's `"--"` textContent. This is fine -- but it means tile 8 never shows skeleton shimmer if its textContent has already been normalized differently. Minor, but indicative of no systematic state management.

### A.7 -- Death Row alert uses skull emoji as semantic signal (popup.js:785)
`'\u{1F480} ' + drReady + ' Death Row inmate...'` -- an emoji is the primary visual indicator for a critical moderation queue alert. Skill rule `no-emoji-icons` is explicit: SVG icons, not emojis. In a Bloomberg Terminal aesthetic, a skull emoji next to an amber number is a category error. It also cannot be themed, sized, or styled. It renders as a colored platform glyph that clashes with the monospace ledger aesthetic.

### A.8 -- Tile vertical rhythm is undefined without sparklines (popup.css:L922-960)
The `.pop-stat` tile has: label (10px) + value (18px) + delta (10px) + spark container (10-14px empty). With sparklines ghosted, the bottom ~14px of each tile is dead space. The tile proportions were designed for a 4-row internal layout but are running 3-row. The value is not vertically centered -- it sits in the upper two-thirds with empty dead space below. This is visible misalignment that a Bloomberg Terminal would never ship.

---

## B. Redesign Proposal (Skill-Driven)

**Principle:** Ledger density over card chrome. Every pixel of a 380px popup is precious. The Bloomberg aesthetic demands data, not decoration. Applied recommendations from ui-ux-pro-max:

### B.1 -- Kill the sparklines or wire them (decision: kill for v10.13, gate on real data)
Skill rule `loading-chart` states: "Use skeleton or shimmer placeholder while chart data loads; don't show an empty axis frame." The opposite is worse: show no frame at all. Decision: remove `.pop-stat-spark` containers entirely from HTML and CSS for tiles where no historical data exists in storage (Pending, Banned, Death Row -- these are point-in-time counts, not time series). For the three 24h activity tiles (Bans/24h, Msgs/24h, Notes/24h), the log array IS a 7-day time series -- sparklines are viable and should be wired. Gate the spark container render on JS: only inject the DOM when data exists.

### B.2 -- Wire delta chips from sessionStorage (same pattern as Lead KPI)
`_updateKpiDelta()` at popup.js:5876 already implements the correct pattern: sessionStorage per-tile, diff on each load, `data-dir` + text written. Copy the pattern verbatim into `loadStats()` for all 6 local-data tiles. For AI today (remote) and Auto-UNS (RPC), write delta only when the async fetch resolves. Result: on second open, every tile shows a live `+2 ^` or `-1 v` chip. On first open, chips are invisible (not ghost boxes).

### B.3 -- Replace inline color overrides with data-state attribute pattern
The CSS already has the right tokens: `[data-state="danger"]`, `[data-state="good"]`, `[data-state="info"]`. loadStats() should set `tile.dataset.state` based on thresholds (e.g., Death Row > 0 = danger; Pending > 20 = danger; everything else defaults to amber). Remove all `style="color:..."` from HTML. The value color derives from state, not from hardcoded hex.

### B.4 -- Replace AI tile drill-down placeholder with honest empty state
Skill rule `empty-data-state`: "Show meaningful empty state when no data exists ('No data yet' + guidance), not a blank chart." Current state is worse than empty -- it is a broken promise. Replace with: value from tile + "Per-call log unavailable -- worker API not yet publishing ai_calls_today." No version numbers in UI copy. When the worker starts returning the array, wire the real log. Until then, honest empty state.

### B.5 -- Replace skull emoji alert with inline status row
Death Row ready-to-execute alert should use a CSS-styled status chip with an SVG warning icon (no emoji). The `.pop-alert` div (popup.html:145) already exists -- give it a proper icon slot via `::before` or an injected SVG, not a Unicode glyph.

### B.6 -- Consolidate CSS into a single authoritative block
The four competing `.pop-stats` rule blocks, 475 `!important` lines, and the `nth-child` patch-on-patch should collapse into one canonical block. The `!important` was needed to beat specificity from earlier blocks that no longer exist. With a single block, none are needed for the stats rules.

---

## C. Visual Mockup (ASCII)

**380px popup, 4-col stats grid, 2-row tile layout (label+delta / value):**

```
+-------------------------------------------+
| PENDING      | DEATH ROW    | BANNED       | BANS/24H     |
| 12           | 3            | 847          | 7            |
|         +2 ^ |       +1 ^  |        = 0  |        -1 v  |
+--------------+--------------+--------------+--------------+
| MSGS/24H     | NOTES/24H    | AI TODAY     | AUTO-UNS     |
| 31           | 4            | 47/500       | 2            |
|        +8 ^  |        = 0  |  9% of cap  |        = 0  |
+--------------+--------------+--------------+--------------+

  [sparkline bars only on 24h tiles, 5-bar 7d history]
  ||||  |||  ||||  ||||  ||||   (only Bans/Msgs/Notes get sparks)
```

**Tile internal layout (per tile, left-aligned not centered):**

```
+------------------------+
| LABEL          +N ^    |   <- row 1: 9px label, delta chip right-aligned
| 000                    |   <- row 2: 18px amber tabular value
| ||| ||| |||            |   <- row 3: sparkline (24h tiles only) OR absent
+------------------------+
```

**Drill drawer (overlaid, full popup width):**

```
+-------------------------------------------+
| PENDING (12)                          [X]  |
| [filter...         ] [Sort: Time v] [CSV] |
+-------------------------------------------+
| 09:14:23  alice_q          new             |
| 09:08:11  bobross44        new             |
| 08:55:02  qanon_karen      pending         |
| ...                                        |
+-------------------------------------------+
| 12 items  Last updated: 09:14:31   [ESC]  |
+-------------------------------------------+
```

---

## D. CSS Spec (Token-Based, Bloomberg Amber Preserved)

All tokens from existing `--bb-*` system. No new tokens introduced.

```css
/* ── Stats grid (single authoritative block -- replaces L54, L913, L2292) ── */
.pop-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  padding: var(--bb-s4) var(--bb-s4) 0;
  background: var(--bb-panel);
  margin: var(--bb-s3) 0;
}

/* ── Tile base ── */
.pop-stat {
  background: transparent;
  border-right: 1px solid var(--bb-line);
  border-bottom: 1px solid var(--bb-line);
  padding: var(--bb-s3) var(--bb-s3) var(--bb-s3) var(--bb-s4);
  cursor: pointer;
  transition: background-color 100ms;
  position: relative;
  text-align: left;               /* LEFT-align: ledger not card */
}
.pop-stat:nth-child(4n)      { border-right: none; }
.pop-stat:nth-last-child(-n+4) { border-bottom: none; }
.pop-stat:hover              { background: var(--bb-amber-bg); }
.pop-stat:active             { background: var(--bb-active); }

/* ── Label row ── */
.pop-stat-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--bb-s2);
}
.pop-stat-label {
  font: 400 var(--bb-t-xs)/1 var(--bb-font);
  color: var(--bb-ink-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ── Delta chip ── */
.pop-stat-delta {
  font: 500 8px/1 var(--bb-font);  /* smaller than label -- subordinate */
  font-variant-numeric: tabular-nums;
  padding: 1px 3px;
  border-radius: 2px;
  /* hidden when no data; JS sets textContent + data-dir */
}
.pop-stat-delta:empty { display: none; }  /* KEY: no ghost box on first load */
.pop-stat-delta[data-dir="up"]   { color: var(--bb-green); background: rgba(60,180,100,.12); }
.pop-stat-delta[data-dir="down"] { color: var(--bb-red);   background: rgba(255,59,59,.10); }
.pop-stat-delta[data-dir="flat"] { color: var(--bb-ink-dim); }
/* data-dir="none" (default) renders nothing -- chip is invisible until wired */

/* ── Value ── */
.pop-stat-val {
  font: 600 var(--bb-t-xl)/1 var(--bb-font);
  color: var(--bb-amber);           /* default: amber */
  font-variant-numeric: tabular-nums slashed-zero;
  letter-spacing: -0.01em;
  display: block;
}
/* Semantic state overrides -- set via JS tile.dataset.state */
.pop-stat[data-state="danger"] .pop-stat-val { color: var(--bb-red); }
.pop-stat[data-state="good"]   .pop-stat-val { color: var(--bb-green); }
.pop-stat[data-state="info"]   .pop-stat-val { color: var(--bb-cyan); }
/* No inline style="color:..." in HTML -- ever */

/* ── Sparkline (24h tiles only -- injected by JS when data exists) ── */
.pop-stat-spark {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 10px;
  width: 100%;
  margin-top: var(--bb-s2);
}
.pop-stat-spark-bar {
  flex: 1;
  min-width: 2px;
  background: var(--bb-line-hot);
  border-radius: 1px 1px 0 0;
  transition: background 200ms;
}
.pop-stat-spark-bar.today { background: var(--bb-amber-dim); }
.pop-stat-spark-bar.zero  { background: var(--bb-line); height: 2px; }
/* Tiles WITHOUT spark have no .pop-stat-spark in DOM -- no dead space */

/* ── Death Row alert ── */
.pop-alert {
  margin: var(--bb-s3) var(--bb-s4);
  padding: var(--bb-s2) var(--bb-s4);
  background: rgba(255,59,59,.08);
  border-left: 3px solid var(--bb-red);
  font: 500 var(--bb-t-xs)/1.4 var(--bb-font);
  color: var(--bb-red);
  /* No emoji -- JS injects SVG warning icon as first child */
}
```

---

## E. HTML Structure Spec

**Tile template (left-aligned, no sparkline for point-in-time tiles):**

```html
<!-- Point-in-time tile (Pending, Death Row, Banned) -- NO spark container -->
<div class="pop-stat" data-drill="pending"
     role="button" tabindex="0"
     aria-label="Pending: loading">
  <div class="pop-stat-head">
    <span class="pop-stat-label">Pending</span>
    <span class="pop-stat-delta" id="d-pending"></span>
  </div>
  <div class="pop-stat-val" id="s-pending">--</div>
</div>

<!-- Activity tile (Bans/24h, Msgs/24h, Notes/24h) -- spark injected by JS -->
<div class="pop-stat" data-drill="bans24"
     role="button" tabindex="0"
     aria-label="Bans last 24h: loading">
  <div class="pop-stat-head">
    <span class="pop-stat-label">Bans/24h</span>
    <span class="pop-stat-delta" id="d-today"></span>
  </div>
  <div class="pop-stat-val" id="s-today">--</div>
  <!-- .pop-stat-spark injected here by JS ONLY when 7d data > 0 -->
</div>
```

**Changes from current HTML:**
- Remove all `style="color:..."` from every `s-*` element (popup.html:83,92,101,110,119,129,140)
- Remove `<div class="pop-stat-spark" id="spark-*">` from point-in-time tiles (popup.html:75,84,93)
- Change `<div class="pop-stat-label">` to `<span class="pop-stat-label">` (semantics: it's inline content)
- Change `<div class="pop-stat-val">` to `<div class="pop-stat-val">` (keep div -- block display correct)
- `aria-label` updated by JS on data load: `"Pending: 12 -- click to list"`

---

## F. JS Wiring Spec

### F.1 -- Delta chip wiring (inline with loadStats())

```js
// Add to loadStats() immediately after computing each value:
function _setStatTile(valId, deltaId, tileSelector, value, stateThresholds) {
  const el = document.getElementById(valId);
  if (!el) return;
  el.textContent = value;

  // State: thresholds = { danger: n, good: n } -- set data-state on tile
  const tile = document.querySelector(tileSelector);
  if (tile && stateThresholds) {
    if (value >= stateThresholds.danger) tile.dataset.state = 'danger';
    else if (value === 0 && stateThresholds.zeroIsGood) tile.dataset.state = 'good';
    else delete tile.dataset.state;
  }

  // Delta chip: sessionStorage diff
  const key = 'gam_stat_prev_' + valId;
  const prev = sessionStorage.getItem(key);
  sessionStorage.setItem(key, String(value));
  const dEl = document.getElementById(deltaId);
  if (!dEl) return;
  if (prev === null) { dEl.textContent = ''; dEl.removeAttribute('data-dir'); return; }
  const diff = value - Number(prev);
  if (diff === 0) { dEl.textContent = '='; dEl.setAttribute('data-dir', 'flat'); return; }
  dEl.textContent = (diff > 0 ? '+' : '') + diff;
  dEl.setAttribute('data-dir', diff > 0 ? 'up' : 'down');
}
```

**Calls in loadStats():**
```js
_setStatTile('s-pending', 'd-pending', '[data-drill="pending"]', pending,
             { danger: 20, zeroIsGood: true });
_setStatTile('s-dr',      'd-dr',     '[data-drill="dr"]',      drPending,
             { danger: 1 });
_setStatTile('s-banned',  'd-banned', '[data-drill="banned"]',  banned,    null);
_setStatTile('s-today',   'd-today',  '[data-drill="bans24"]',  todayBans, null);
_setStatTile('s-msgs',    'd-msgs',   '[data-drill="msgs24"]',  todayMsgs, null);
_setStatTile('s-notes',   'd-notes',  '[data-drill="notes24"]', todayNotes, null);
```

### F.2 -- Sparkline rendering (24h tiles only, injected not pre-declared)

```js
function _renderSpark(containerId, valEl, logEntries, type) {
  // Build 7-day bucket array from log
  const buckets = Array.from({length: 7}, (_, i) => {
    const dayStart = Date.now() - (6 - i) * 86400000;
    const dayEnd = dayStart + 86400000;
    return logEntries.filter(l => {
      const t = new Date(l.ts).getTime();
      return t >= dayStart && t < dayEnd && l.type === type;
    }).length;
  });
  if (buckets.every(b => b === 0)) return; // no data -- no spark container
  const max = Math.max(...buckets, 1);
  const spark = document.createElement('div');
  spark.className = 'pop-stat-spark';
  buckets.forEach((v, i) => {
    const bar = document.createElement('div');
    bar.className = 'pop-stat-spark-bar' + (i === 6 ? ' today' : '') + (v === 0 ? ' zero' : '');
    bar.style.height = v === 0 ? '2px' : Math.max(2, Math.round((v / max) * 10)) + 'px';
    spark.appendChild(bar);
  });
  // Inject after val element, not pre-declared in HTML
  valEl.insertAdjacentElement('afterend', spark);
}

// In loadStats(), after writing today values:
_renderSpark('spark-today', $('s-today'), log, 'ban');
_renderSpark('spark-msgs',  $('s-msgs'),  log, 'message');
_renderSpark('spark-notes', $('s-notes'), log, 'note');
```

### F.3 -- AI tile drill-down: honest empty state (replace __renderAi24)

```js
function __renderAi24(body) {
  const aiVal = ($('s-ai-today') || {}).textContent || '--';
  const wrap = document.createElement('div');
  wrap.className = 'pop-drill-empty';
  wrap.innerHTML = `
    <div style="font:600 22px/1 var(--bb-font);color:var(--bb-amber);
                font-variant-numeric:tabular-nums;margin-bottom:6px">${aiVal}</div>
    <div style="font:400 10px/1.4 var(--bb-font);color:var(--bb-ink-dim);
                text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">AI calls today</div>
    <div style="font:400 10px/1.5 var(--bb-font);color:var(--bb-ink-faint)">
      Per-call log unavailable -- worker API not yet publishing call detail.
    </div>`;
  body.appendChild(wrap);
  __setDrillMeta('AI budget -- detail pending');
  __lastDrill = { key: 'ai24', rows: [], cols: [] };
}
```

### F.4 -- Death Row alert: SVG icon, no emoji (replace popup.js:785)

```js
if (drReady > 0) {
  const alert = $('dr-alert');
  alert.style.display = 'block';
  const svgWarn = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round"
    style="vertical-align:-2px;margin-right:4px">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>`;
  alert.innerHTML = svgWarn + drReady + ' Death Row' + (drReady > 1 ? ' inmates' : ' inmate')
    + ' ready -- visit GAW to execute.';
}
```

### F.5 -- aria-label update on data load

```js
// After each _setStatTile call, update aria-label for AT:
const tile = document.querySelector('[data-drill="pending"]');
if (tile) tile.setAttribute('aria-label', `Pending: ${pending} -- click to list`);
```

---

## G. Effort Estimate

| Task | Hours |
|---|---|
| CSS consolidation: collapse 4 stat blocks into 1, kill !important for stats rules | 1.5h |
| Remove inline color overrides from HTML (8 elements), wire data-state in loadStats | 0.5h |
| Wire delta chips via _setStatTile() helper | 1.0h |
| Kill ghost spark containers in HTML, implement _renderSpark() for 3 activity tiles | 1.5h |
| Replace AI tile drill-down placeholder with honest empty state | 0.5h |
| Replace skull emoji alert with inline SVG | 0.25h |
| Update aria-labels on data load | 0.25h |
| **Total** | **5.5h** |

No new dependencies. No new tokens. All changes are in the three existing files.

---

## H. Conflicts with v10.12.3 State

### H.1 -- popup.html: 9 edits
Remove `style="color:..."` from popup.html:83,92,101,110,119,129,140 (6 edits).
Remove `<div class="pop-stat-spark">` from tiles 1-3 (Pending, DR, Banned) at popup.html:75,84,93 (3 edits).
The 3 activity spark containers at popup.html:102,111,120 move from static HTML to JS-injected (remove from HTML).
Tiles 7-8 spark containers at popup.html:130,141 -- remove (AI and Auto-UNS have no time-series source).

### H.2 -- popup.css: consolidation breaks the patch chain
The 4-col grid at L2292-2298 is the current active rule. The 3-col rules at L54-59 and L913-934 are dead overridden code. After consolidation into one block, the L1449 `pop-stats.pop-tab-hidden` hotfix at L1449 remains valid and must be kept. The `nth-child(3n)` rules at L933 are overridden by L2296 -- both can be removed after consolidation.

### H.3 -- popup.js: loadStats() and __renderAi24() are modified
`loadStats()` at L732-806: replace the 6 direct `$('s-*').textContent = value` writes with `_setStatTile()` calls. Add `_renderSpark()` calls after the 24h values are written.
`__renderAi24()` at L4229-4248: full replacement (the current function can be dropped in-place).
`wireStatSkeletons()` at L484-500: survives unchanged -- skeleton detection works before _setStatTile fires.
Death Row alert at L782-786: the `if (drReady > 0)` block is replaced (innerHTML swap for SVG).

### H.4 -- No changes to drill drawer HTML or renderDrillDown() dispatch logic
The drawer structure (popup.html:152-173) and `renderDrillDown()` dispatch (popup.js:4197-4224) are correct. Only `__renderAi24()` changes. The toolbar, filter, sort, and CSV export survive as-is.

### H.5 -- Auto-UNS tile (8th): no change to data source
The 8th tile (`data-drill="unsticky24"`) dispatches to the default branch in `renderDrillDown()` (`__renderDrillEmpty(key)`) because there is no `else if (key === 'unsticky24')` case. This pre-existing gap is out of scope for this audit -- log as a separate defect. The delta chip and state wiring for this tile are low-priority until the data source is confirmed.
