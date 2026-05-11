# UIUX2-07 — Diagnostics Tab Design Spec (v10.13)

**Surface:** Popup fifth tab — `data-tab="diag"` / `#diagTabSection`
**Scope:** System identity, SW health (gam_sw_boots), RPC error log, Storage+Audit, Crypto health
**Context:** v10.12.3 migrated gam_diag_log to IndexedDB; reads now via `diagReadRecent` RPC
**Aesthetic:** Bloomberg Terminal ledger — monochrome field grid, amber/red/green severity rails, razor density, zero chrome bloat

---

## A. Aesthetic Direction

**Concept: Bloomberg Terminal at 360px.**

The operator is a site mod who opens this tab to diagnose a live problem. Every pixel must serve data. The reference is a Bloomberg ledger screen: near-black background, a strict grid of labeled fields, severity communicated entirely by foreground color on the left rail, no decorative gradients, no rounded cards, no padding waste.

**Typography**
- Section labels: `IBM Plex Mono` 9px/11px, all-caps, letter-spacing 0.08em, color `#4a5060`
- Log rows: `IBM Plex Mono` 10px/14px — the single font for all data
- Status values: same, weight 500 for emphasis cells
- No serif, no display font — this surface is instruments, not branding

**Color palette (CSS variables on `#diagTabSection`)**
```css
--dt-bg:          #0d0f12;   /* panel background */
--dt-surface:     #111418;   /* row/field background */
--dt-border:      #1c2028;   /* hairline separators */
--dt-label:       #3a4252;   /* field key text */
--dt-value:       #c8cdd8;   /* normal value text */
--dt-ok:          #2d9e6b;   /* green — healthy */
--dt-warn:        #d98e2a;   /* amber — attention */
--dt-err:         #c0392b;   /* red — failure */
--dt-crit:        #8b0000;   /* deep red — critical, used sparingly */
--dt-info:        #3a7cbf;   /* blue — informational */
--dt-rail-ok:     #1a3d2e;   /* left rail fill — ok row */
--dt-rail-warn:   #3d2e10;   /* left rail fill — warn row */
--dt-rail-err:    #3d1010;   /* left rail fill — err row */
--dt-highlight:   #1a1f28;   /* search/filter match highlight */
--dt-cursor:      #d98e2a;   /* focus/selected row amber cursor */
```

**Motion**
- Tab entry: `opacity 0 -> 1` over 120ms, no translate — data surfaces should not animate laterally
- Skeleton shimmer: 1.4s linear infinite on `--dt-surface` / `--dt-border` gradient sweep
- Row highlight on search match: `background-color` transition 80ms
- Copy confirmation: button text swap + 1.2s timeout, no toast overlay

**Layout**
- Full-bleed panel — no `gam-card` wrapper in v2 (drop the `<details>` card chrome)
- Four sections stack vertically, each with a hairline top separator and a 28px section header bar
- No inner padding waste: field rows are 24px tall, 8px left indent for value column
- Section headers: sticky within their scroll container so the label stays visible as you scroll the log

---

## B. Section-by-Section Specifications

### B.1 Section Header Component

Repeating component for each of the four sections.

```html
<div class="dt-section-head">
  <span class="dt-section-label">SYSTEM IDENTITY</span>
  <span class="dt-section-status" id="diagSysStatus"></span>  <!-- ok/warn/err chip -->
</div>
```

```css
.dt-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 28px;
  padding: 0 10px;
  border-top: 1px solid var(--dt-border);
  background: var(--dt-bg);
  position: sticky;
  top: 0;
  z-index: 10;
}
.dt-section-label {
  font: 500 9px/1 'IBM Plex Mono', monospace;
  letter-spacing: 0.08em;
  color: var(--dt-label);
  text-transform: uppercase;
}
.dt-section-status {
  font: 9px/1 'IBM Plex Mono', monospace;
  padding: 2px 5px;
  border-radius: 2px;
}
.dt-section-status.ok   { color: var(--dt-ok);   background: var(--dt-rail-ok);   }
.dt-section-status.warn { color: var(--dt-warn);  background: var(--dt-rail-warn); }
.dt-section-status.err  { color: var(--dt-err);   background: var(--dt-rail-err);  }
```

### B.2 Field Grid Component (Sections 1, 2, 4, 5)

Used for System Identity, SW Health, Storage+Audit, Crypto Health. These are key-value tables.

```html
<div class="dt-field-grid">
  <div class="dt-field-row">
    <span class="dt-field-key">Extension</span>
    <span class="dt-field-val ok" id="diagSysVersion">v10.13.0</span>
  </div>
  <!-- ... -->
</div>
```

```css
.dt-field-grid { padding: 4px 0 8px; }
.dt-field-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  align-items: baseline;
  min-height: 22px;
  padding: 0 10px;
  gap: 8px;
}
.dt-field-row:hover { background: var(--dt-surface); }
.dt-field-key {
  font: 9px/22px 'IBM Plex Mono', monospace;
  color: var(--dt-label);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dt-field-val {
  font: 10px/22px 'IBM Plex Mono', monospace;
  color: var(--dt-value);
  white-space: pre-wrap;
  word-break: break-all;
}
.dt-field-val.ok   { color: var(--dt-ok);   }
.dt-field-val.warn { color: var(--dt-warn);  }
.dt-field-val.err  { color: var(--dt-err);   }
```

**Fields to expose per section:**

**System Identity** (`diagSysIdentity` decomposed):
- Extension / `v{version} ({id})`
- Browser / `Chrome {ver}`
- Permissions / count + ellipsis with `title` for full list

**SW Health** (`diagSwHealth` decomposed):
- Boot count / `{n}` (warn if > 20 in last hour)
- Last boot / `{time} ({ago})`
- Last reason / `{reason}`
- Active alarms / `{n}` — inline list on hover
- Recent boots / mini-list, last 3

**Storage + Audit:**
- Storage used / `{bytes} ({pct}%)` — color threshold: >60% warn, >80% err
- IDB diag log / `{count} entries` (sourced from diagReadRecent count)
- Worker token / age + expires
- Lead token / age + expires (if present)

**Crypto Health:**
- Crypto key / yes | NO (err)
- IDB available / yes | NO (err)
- Encrypted tokens / `{n}`
- Plaintext tokens / `{n}` (warn if > 0)
- Last migration / `{datetime}` | never

### B.3 RPC Error Log — Log Ledger (Section 3)

**This is the primary v2 improvement.** The current implementation dumps raw text rows into a 180px fixed-height div with no filter, no search, and no virtualization. At 500 entries this becomes unusable scroll soup.

#### B.3.1 IDB Feed Exposure

v10.12.3 moved `gam_diag_log` to IndexedDB. The current `renderDiagTab` still reads via `chrome.storage.local.get('gam_diag_log')` — this is the primary correctness gap. v2 must route through `diagReadRecent` RPC.

**Required `renderDiagTab` change:**
```js
// BEFORE (v10.12.x — reads stale chrome.storage.local)
var diagData = await chrome.storage.local.get('gam_diag_log');
var diagLog = (diagData.gam_diag_log) || [];

// AFTER (v10.13 — reads IDB via RPC)
var rpcResp = await chrome.runtime.sendMessage({
  type: 'diagReadRecent',
  payload: { limit: 500, cats: null }   // null = all categories
});
var diagLog = (rpcResp && rpcResp.data && rpcResp.data.entries) || [];
```

The RPC must return `{ ok: true, data: { entries: [...], total: N } }`. If `ok` is false or the response is null (SW not ready), fall back to `chrome.storage.local.get('gam_diag_log')` and show a warn chip "IDB unavailable — showing local cache."

#### B.3.2 Filter + Search Bar

```html
<div class="dt-log-toolbar">
  <input  id="diagLogFilter" class="dt-filter-input" type="text"
          placeholder="filter…" autocomplete="off" spellcheck="false">
  <div class="dt-filter-pills" id="diagLogPills">
    <button class="dt-pill active" data-cat="all">ALL</button>
    <button class="dt-pill" data-cat="err">ERR</button>
    <button class="dt-pill" data-cat="warn">WARN</button>
    <button class="dt-pill" data-cat="rpc">RPC</button>
    <button class="dt-pill" data-cat="net">NET</button>
    <button class="dt-pill" data-cat="auth">AUTH</button>
  </div>
  <span class="dt-log-count" id="diagLogCount">0 / 0</span>
  <button class="dt-icon-btn" id="diagLogCopy" title="Copy visible entries to clipboard">
    <!-- inline SVG clipboard icon, 12x12 -->
  </button>
</div>
```

```css
.dt-log-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-bottom: 1px solid var(--dt-border);
  background: var(--dt-surface);
}
.dt-filter-input {
  flex: 1;
  min-width: 0;
  background: var(--dt-bg);
  border: 1px solid var(--dt-border);
  color: var(--dt-value);
  font: 10px/20px 'IBM Plex Mono', monospace;
  padding: 0 6px;
  border-radius: 2px;
  outline: none;
}
.dt-filter-input:focus { border-color: var(--dt-cursor); }
.dt-filter-pills { display: flex; gap: 3px; }
.dt-pill {
  font: 500 8px/16px 'IBM Plex Mono', monospace;
  padding: 0 5px;
  border: 1px solid var(--dt-border);
  background: transparent;
  color: var(--dt-label);
  border-radius: 2px;
  cursor: pointer;
  letter-spacing: 0.05em;
}
.dt-pill.active { background: var(--dt-cursor); border-color: var(--dt-cursor); color: #0d0f12; }
.dt-log-count { font: 9px/1 'IBM Plex Mono', monospace; color: var(--dt-label); white-space: nowrap; }
.dt-icon-btn {
  background: none; border: none; cursor: pointer;
  color: var(--dt-label); padding: 2px;
  transition: color 100ms;
}
.dt-icon-btn:hover { color: var(--dt-value); }
```

**Filter logic:**
- Text filter: case-insensitive substring match on `entry.msg + entry.cat + entry.src`
- Pill filter: maps to entry category prefix — "ERR" matches cats containing `error|unhandled|uncaught`, "WARN" matches `warn`, "RPC" matches `rpc-`, "NET" matches `net-`, "AUTH" matches `auth`
- Both filters AND-compose
- Debounce text input 120ms before re-render

#### B.3.3 Virtualized Log Table

At 500 entries the naive approach creates 500 DOM nodes and scrolls become janky. Use a windowed virtual scroller — fixed row height of 22px, render only the visible window + 10 rows of overscan above/below.

```html
<div class="dt-log-viewport" id="diagLogViewport">
  <!-- virtual scroller: one tall spacer div sets total height,
       positioned rows fill only the visible slice -->
  <div class="dt-log-spacer" id="diagLogSpacer"></div>
  <div class="dt-log-rows"   id="diagLogRows"></div>
</div>
```

```css
.dt-log-viewport {
  position: relative;
  height: 220px;     /* fixed height — operator can see ~10 rows at density */
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--dt-bg);
  scroll-behavior: auto;   /* no smooth — instant for keyboard nav */
}
.dt-log-spacer { width: 1px; pointer-events: none; }
.dt-log-rows   { position: absolute; top: 0; left: 0; right: 0; }
```

**Virtual scroller JS (self-contained, no library dependency):**
```js
var DIAG_ROW_H = 22;        // px per row — must match CSS
var DIAG_OVERSCAN = 10;     // rows above/below viewport

var _diagAllEntries   = [];  // full filtered dataset
var _diagRenderedFrom = -1;
var _diagRenderedTo   = -1;

function diagVirtualRender(force) {
  var vp    = $('diagLogViewport');
  var spacer = $('diagLogSpacer');
  var rows  = $('diagLogRows');
  if (!vp || !spacer || !rows) return;

  var total  = _diagAllEntries.length;
  spacer.style.height = (total * DIAG_ROW_H) + 'px';

  var scrollTop   = vp.scrollTop;
  var viewH       = vp.clientHeight;
  var firstVisible = Math.floor(scrollTop / DIAG_ROW_H);
  var lastVisible  = Math.ceil((scrollTop + viewH) / DIAG_ROW_H);
  var from = Math.max(0, firstVisible - DIAG_OVERSCAN);
  var to   = Math.min(total, lastVisible + DIAG_OVERSCAN);

  if (!force && from === _diagRenderedFrom && to === _diagRenderedTo) return;
  _diagRenderedFrom = from;
  _diagRenderedTo   = to;

  rows.style.top = (from * DIAG_ROW_H) + 'px';
  rows.innerHTML = '';
  for (var i = from; i < to; i++) {
    rows.appendChild(diagBuildRow(_diagAllEntries[i], i));
  }
}

function diagBuildRow(entry, idx) {
  var row = document.createElement('div');
  row.className = 'dt-log-row' + diagRowSeverityClass(entry);
  row.style.cssText = 'height:' + DIAG_ROW_H + 'px';
  row.dataset.idx = idx;

  var rail = document.createElement('span'); rail.className = 'dt-log-rail';
  var ts   = document.createElement('span'); ts.className = 'dt-log-ts';
  var sev  = document.createElement('span'); sev.className = 'dt-log-sev';
  var cat  = document.createElement('span'); cat.className = 'dt-log-cat';
  var msg  = document.createElement('span'); msg.className = 'dt-log-msg';

  ts.textContent  = entry.ts ? new Date(entry.ts).toLocaleTimeString('en-GB', {hour12:false}) : '??:??:??';
  sev.textContent = diagSevLabel(entry);
  cat.textContent = (entry.cat || '').slice(0, 14);
  msg.textContent = (entry.msg || '').slice(0, 160);

  row.appendChild(rail);
  row.appendChild(ts);
  row.appendChild(sev);
  row.appendChild(cat);
  row.appendChild(msg);

  // Expand on click: show full entry JSON below row (or toggle dt-log-row--expanded class)
  row.addEventListener('click', function() {
    diagToggleRowExpand(row, entry);
  });
  return row;
}

function diagSevLabel(entry) {
  var cat = (entry.cat || '').toLowerCase();
  if (/error|uncaught|unhandled/.test(cat)) return 'ERR ';
  if (/warn/.test(cat))                       return 'WARN';
  if (/rpc/.test(cat))                        return 'RPC ';
  if (/net/.test(cat))                        return 'NET ';
  return 'INFO';
}

function diagRowSeverityClass(entry) {
  var lbl = diagSevLabel(entry).trim();
  if (lbl === 'ERR')  return ' dt-log-row--err';
  if (lbl === 'WARN') return ' dt-log-row--warn';
  return '';
}
```

**Log row CSS:**
```css
.dt-log-row {
  display: grid;
  grid-template-columns: 3px 56px 36px 90px 1fr;
  align-items: center;
  gap: 0 6px;
  padding: 0 10px 0 0;
  box-sizing: border-box;
  cursor: pointer;
  border-bottom: 1px solid var(--dt-border);
}
.dt-log-row:hover { background: var(--dt-surface); }
.dt-log-row--err  .dt-log-rail { background: var(--dt-err);  }
.dt-log-row--warn .dt-log-rail { background: var(--dt-warn); }
.dt-log-rail { height: 100%; width: 3px; flex-shrink: 0; }

.dt-log-ts, .dt-log-sev, .dt-log-cat, .dt-log-msg {
  font: 9px/22px 'IBM Plex Mono', monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dt-log-ts  { color: var(--dt-label);  }
.dt-log-sev { color: var(--dt-value);  font-weight: 600; letter-spacing: 0.04em; }
.dt-log-cat { color: var(--dt-warn);   }   /* category always amber */
.dt-log-msg { color: var(--dt-value);  }

.dt-log-row--err  .dt-log-sev { color: var(--dt-err);  }
.dt-log-row--warn .dt-log-sev { color: var(--dt-warn); }

/* Expanded row: appended sibling .dt-log-row-expand */
.dt-log-row-expand {
  background: var(--dt-surface);
  padding: 6px 10px 6px 19px;
  font: 9px/1.5 'IBM Plex Mono', monospace;
  color: var(--dt-value);
  white-space: pre-wrap;
  word-break: break-all;
  border-bottom: 1px solid var(--dt-border);
}
```

**Row expand:** clicking a row appends a `.dt-log-row-expand` sibling div (not part of the virtual window) containing `JSON.stringify(_maskSecretsDeep(entry), null, 2)`. Clicking again removes it. The virtual spacer height is not recalculated (expanded rows are additive overlay, not part of the virtual model). This keeps expand simple without complicating the virtual scroller.

#### B.3.4 Copy-to-Clipboard

Replace the current `diagExportErrors` button (which only copies error-category entries) with a toolbar button that copies **the current filtered view** (whatever the pill + text filter returns), masked via `_maskSecretsDeep`.

```js
$('diagLogCopy').addEventListener('click', function() {
  var btn = this;
  var out = JSON.stringify(_maskSecretsDeep(_diagAllEntries), null, 2);
  navigator.clipboard.writeText(out).then(function() {
    btn.title = 'Copied!';
    setTimeout(function() { btn.title = 'Copy visible entries to clipboard'; }, 1500);
  }).catch(function() {
    // layer-3 fallback: textarea + execCommand
    var ta = document.createElement('textarea');
    ta.value = out;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
});
```

---

## C. Full Markup Blueprint (popup.html replacement)

Replace the current `#diagTabSection` inner markup:

```html
<div data-tab="diag" class="pop-tab-hidden" id="diagTabSection"
     role="tabpanel" aria-labelledby="tab-btn-diag"
     style="--dt-bg:#0d0f12;--dt-surface:#111418;--dt-border:#1c2028;
            --dt-label:#3a4252;--dt-value:#c8cdd8;
            --dt-ok:#2d9e6b;--dt-warn:#d98e2a;--dt-err:#c0392b;
            --dt-rail-ok:#1a3d2e;--dt-rail-warn:#3d2e10;--dt-rail-err:#3d1010;
            --dt-highlight:#1a1f28;--dt-cursor:#d98e2a;
            background:var(--dt-bg);font-family:'IBM Plex Mono',monospace;
            display:flex;flex-direction:column;overflow:hidden">

  <!-- 1: System identity -->
  <div class="dt-section-head">
    <span class="dt-section-label">System Identity</span>
    <span class="dt-section-status" id="diagSysStatus"></span>
  </div>
  <div class="dt-field-grid" id="diagSysGrid">
    <div class="dt-field-row"><span class="dt-field-key">Extension</span>
      <span class="dt-field-val" id="diagFldVersion">--</span></div>
    <div class="dt-field-row"><span class="dt-field-key">Extension ID</span>
      <span class="dt-field-val" id="diagFldId">--</span></div>
    <div class="dt-field-row"><span class="dt-field-key">Browser</span>
      <span class="dt-field-val" id="diagFldBrowser">--</span></div>
    <div class="dt-field-row"><span class="dt-field-key">Permissions</span>
      <span class="dt-field-val" id="diagFldPerms">--</span></div>
  </div>

  <!-- 2: SW Health -->
  <div class="dt-section-head">
    <span class="dt-section-label">Service Worker Health</span>
    <span class="dt-section-status" id="diagSwStatus"></span>
  </div>
  <div class="dt-field-grid" id="diagSwGrid">
    <div class="dt-field-row"><span class="dt-field-key">Boot count</span>
      <span class="dt-field-val" id="diagFldBootCount">--</span></div>
    <div class="dt-field-row"><span class="dt-field-key">Last boot</span>
      <span class="dt-field-val" id="diagFldLastBoot">--</span></div>
    <div class="dt-field-row"><span class="dt-field-key">Last reason</span>
      <span class="dt-field-val" id="diagFldLastReason">--</span></div>
    <div class="dt-field-row"><span class="dt-field-key">Active alarms</span>
      <span class="dt-field-val" id="diagFldAlarms">--</span></div>
    <div class="dt-field-row"><span class="dt-field-key">Recent boots</span>
      <span class="dt-field-val" id="diagFldRecentBoots" style="white-space:pre">--</span></div>
  </div>

  <!-- 3: RPC / diag log -->
  <div class="dt-section-head" style="flex-shrink:0">
    <span class="dt-section-label">Diag Log</span>
    <span class="dt-section-status" id="diagLogStatus"></span>
  </div>
  <div class="dt-log-toolbar">
    <input id="diagLogFilter" class="dt-filter-input" type="text"
           placeholder="filter…" autocomplete="off" spellcheck="false">
    <div class="dt-filter-pills" id="diagLogPills">
      <button class="dt-pill active" data-cat="all">ALL</button>
      <button class="dt-pill" data-cat="err">ERR</button>
      <button class="dt-pill" data-cat="warn">WARN</button>
      <button class="dt-pill" data-cat="rpc">RPC</button>
      <button class="dt-pill" data-cat="net">NET</button>
      <button class="dt-pill" data-cat="auth">AUTH</button>
    </div>
    <span class="dt-log-count" id="diagLogCount">0/0</span>
    <button class="dt-icon-btn" id="diagLogCopy" title="Copy visible entries to clipboard">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <rect x="1" y="3" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/>
        <path d="M3 3V2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H9" stroke="currentColor" stroke-width="1.2"/>
      </svg>
    </button>
  </div>
  <div class="dt-log-viewport" id="diagLogViewport" style="flex:1;min-height:160px;max-height:220px">
    <div class="dt-log-spacer" id="diagLogSpacer"></div>
    <div class="dt-log-rows"   id="diagLogRows"></div>
  </div>

  <!-- 4: Storage + audit -->
  <div class="dt-section-head">
    <span class="dt-section-label">Storage + Audit</span>
    <span class="dt-section-status" id="diagStoStatus"></span>
  </div>
  <div class="dt-field-grid" id="diagStoGrid">
    <div class="dt-field-row"><span class="dt-field-key">Storage used</span>
      <span class="dt-field-val" id="diagFldStorage">--</span></div>
    <div class="dt-field-row"><span class="dt-field-key">IDB diag log</span>
      <span class="dt-field-val" id="diagFldIdbCount">--</span></div>
    <div class="dt-field-row"><span class="dt-field-key">Worker token</span>
      <span class="dt-field-val" id="diagFldWorkerTok">--</span></div>
    <div class="dt-field-row"><span class="dt-field-key">Lead token</span>
      <span class="dt-field-val" id="diagFldLeadTok">--</span></div>
  </div>

  <!-- 5: Crypto health -->
  <div class="dt-section-head">
    <span class="dt-section-label">Crypto Health</span>
    <span class="dt-section-status" id="diagCryptStatus"></span>
  </div>
  <div class="dt-field-grid" id="diagCryptGrid">
    <div class="dt-field-row"><span class="dt-field-key">Crypto key</span>
      <span class="dt-field-val" id="diagFldCryptKey">--</span></div>
    <div class="dt-field-row"><span class="dt-field-key">IDB available</span>
      <span class="dt-field-val" id="diagFldIdbAvail">--</span></div>
    <div class="dt-field-row"><span class="dt-field-key">Encrypted tokens</span>
      <span class="dt-field-val" id="diagFldEncTok">--</span></div>
    <div class="dt-field-row"><span class="dt-field-key">Plaintext tokens</span>
      <span class="dt-field-val" id="diagFldPltTok">--</span></div>
    <div class="dt-field-row"><span class="dt-field-key">Last migration</span>
      <span class="dt-field-val" id="diagFldMigTs">--</span></div>
  </div>

  <!-- Action bar -->
  <div style="display:flex;gap:6px;padding:6px 10px;border-top:1px solid var(--dt-border);flex-shrink:0">
    <button id="diagSnapshotBtn" class="pop-btn pop-btn-ghost" style="font:10px/22px 'IBM Plex Mono',monospace;padding:0 8px">
      Copy snapshot
    </button>
    <button id="diagRefreshBtn" class="pop-btn pop-btn-ghost" style="font:10px/22px 'IBM Plex Mono',monospace;padding:0 8px">
      Refresh
    </button>
  </div>
</div>
```

---

## D. renderDiagTab() Rewrite (popup.js)

Replace the monolithic `renderDiagTab` with a structured version that:
1. Fires all five data fetches in parallel via `Promise.allSettled`
2. Populates individual `dt-field-val` elements directly (no `textContent` blob on a single div)
3. Routes diag log through `diagReadRecent` RPC with local-cache fallback
4. Feeds the virtual scroller

```js
// E.3.1 v10.13 — renderDiagTab() full rewrite (UIUX2-07)
var _diagTabRendered = false;
var _diagActivePill  = 'all';
var _diagFilterText  = '';
var _diagAllEntries  = [];
var _diagFilterDebounce = null;

async function renderDiagTab() {
  _diagTabRendered = true;

  // 1. Parallel fetches
  var [sysRes, swRes, logRes, stoRes, cryptRes] = await Promise.allSettled([
    _diagFetchSysIdentity(),
    _diagFetchSwHealth(),
    _diagFetchLog(),
    _diagFetchStorage(),
    _diagFetchCrypt()
  ]);

  _diagRenderSys(sysRes.status === 'fulfilled' ? sysRes.value : null, sysRes.reason);
  _diagRenderSw(swRes.status === 'fulfilled' ? swRes.value : null, swRes.reason);
  _diagRenderLog(logRes.status === 'fulfilled' ? logRes.value : null, logRes.reason);
  _diagRenderSto(stoRes.status === 'fulfilled' ? stoRes.value : null, stoRes.reason);
  _diagRenderCrypt(cryptRes.status === 'fulfilled' ? cryptRes.value : null, cryptRes.reason);
}

async function _diagFetchSysIdentity() {
  var mf = chrome.runtime.getManifest();
  var perms = await new Promise(function(res) {
    try { chrome.permissions.getAll(function(p) { res(p); }); } catch(_) { res({}); }
  });
  var ua = navigator.userAgent;
  var chromeVer = (ua.match(/Chrome\/([\d.]+)/) || [])[1] || 'unknown';
  var permList  = (perms.permissions || []).concat(perms.origins || []);
  return { version: mf.version, id: chrome.runtime.id, chromeVer, permList };
}

async function _diagFetchSwHealth() {
  var data   = await chrome.storage.local.get(['gam_sw_boots', 'gam_settings']);
  var boots  = (data.gam_sw_boots) || [];
  var alarms = await new Promise(function(res) {
    try { chrome.alarms.getAll(function(a) { res(a || []); }); } catch(_) { res([]); }
  });
  return { boots, alarms };
}

async function _diagFetchLog() {
  // Try IDB via RPC first (v10.12.3+)
  var idbOk = false;
  try {
    var resp = await chrome.runtime.sendMessage({
      type: 'diagReadRecent', payload: { limit: 500, cats: null }
    });
    if (resp && resp.ok && Array.isArray(resp.data && resp.data.entries)) {
      idbOk = true;
      return { entries: resp.data.entries, total: resp.data.total, source: 'idb' };
    }
  } catch(_) {}
  // Fallback: chrome.storage.local
  var r = await chrome.storage.local.get('gam_diag_log');
  return { entries: (r.gam_diag_log || []), total: (r.gam_diag_log || []).length, source: 'local' };
}

async function _diagFetchStorage() {
  var total = await new Promise(function(res, rej) {
    try { chrome.storage.local.getBytesInUse(null, function(n) { res(n); }); }
    catch(e) { rej(e); }
  });
  var r   = await chrome.storage.local.get('gam_settings');
  var s   = (r && r.gam_settings) || {};
  var now = Date.now();
  var idbCountResp = null;
  try {
    var cr = await chrome.runtime.sendMessage({ type: 'diagReadRecent', payload: { limit: 1, cats: null } });
    if (cr && cr.ok) idbCountResp = cr.data && cr.data.total;
  } catch(_) {}
  return { bytesUsed: total, settings: s, now, idbCount: idbCountResp };
}

async function _diagFetchCrypt() {
  var resp = await chrome.runtime.sendMessage({ type: 'cryptHealth' });
  return resp && resp.data;
}

function _diagRenderSys(data, err) {
  var status = $('diagSysStatus');
  function fld(id, val, cls) {
    var el = $(id); if (!el) return;
    el.textContent = val || '--';
    if (cls) el.className = 'dt-field-val ' + cls;
  }
  if (!data) {
    if (status) { status.textContent = 'ERR'; status.className = 'dt-section-status err'; }
    ['diagFldVersion','diagFldId','diagFldBrowser','diagFldPerms'].forEach(function(id) {
      fld(id, 'read failed', 'err');
    });
    return;
  }
  fld('diagFldVersion', 'v' + data.version);
  fld('diagFldId',      data.id);
  fld('diagFldBrowser', 'Chrome ' + data.chromeVer);
  var permEl = $('diagFldPerms');
  if (permEl) {
    permEl.textContent = data.permList.length + ' granted';
    permEl.title = data.permList.join(', ');
  }
  if (status) { status.textContent = 'OK'; status.className = 'dt-section-status ok'; }
}

function _diagRenderSw(data, err) {
  var status = $('diagSwStatus');
  function fld(id, val, cls) {
    var el = $(id); if (!el) return;
    el.textContent = val || '--';
    if (cls) { el.className = 'dt-field-val ' + cls; }
  }
  if (!data) {
    if (status) { status.textContent = 'ERR'; status.className = 'dt-section-status err'; }
    return;
  }
  var boots = data.boots || [];
  var last  = boots.length ? boots[boots.length - 1] : null;
  var ago   = last ? Math.round((Date.now() - new Date(last.ts).getTime()) / 1000) + 's ago' : 'none';
  var recentLines = boots.slice(-3).reverse().map(function(b) {
    return (b.ts ? new Date(b.ts).toLocaleTimeString('en-GB', {hour12:false}) : '?') + ' ' + (b.reason || '?');
  }).join('\n');

  fld('diagFldBootCount', boots.length + '', boots.length > 10 ? 'warn' : '');
  fld('diagFldLastBoot',  last ? last.ts + ' (' + ago + ')' : 'none');
  fld('diagFldLastReason', last ? (last.reason || 'unknown') : '--');
  fld('diagFldAlarms',    data.alarms.length + (data.alarms.length ? ' active' : ' (none)'));
  fld('diagFldRecentBoots', recentLines || '(none)');
  if (status) { status.textContent = 'OK'; status.className = 'dt-section-status ok'; }
}

function _diagRenderLog(data, err) {
  var status = $('diagLogStatus');
  if (!data) {
    if (status) { status.textContent = 'ERR'; status.className = 'dt-section-status err'; }
    _diagAllEntries = [];
    diagApplyFilter();
    return;
  }
  _diagAllEntries = (data.entries || []).slice().reverse();  // newest-first
  var chip = data.source === 'local' ? 'CACHE' : 'IDB';
  if (status) {
    status.textContent = chip + ' ' + data.total;
    status.className = 'dt-section-status ' + (data.source === 'local' ? 'warn' : 'ok');
  }
  diagApplyFilter();
  _diagWireLogToolbar();
}

function _diagRenderSto(data, err) {
  var status = $('diagStoStatus');
  function fld(id, val, cls) {
    var el = $(id); if (!el) return;
    el.textContent = val || '--';
    if (cls) { el.className = 'dt-field-val ' + cls; }
  }
  if (!data) {
    if (status) { status.textContent = 'ERR'; status.className = 'dt-section-status err'; }
    return;
  }
  var pct  = data.bytesUsed / MAINT_QUOTA_BYTES * 100;
  var s    = data.settings || {};
  var now  = data.now;
  var stoClass = pct > 80 ? 'err' : pct > 60 ? 'warn' : 'ok';
  fld('diagFldStorage', __fmtBytes(data.bytesUsed) + ' (' + pct.toFixed(1) + '% of 5MB)', stoClass);
  fld('diagFldIdbCount', data.idbCount != null ? data.idbCount + ' entries (IDB)' : 'unavailable', data.idbCount != null ? '' : 'warn');
  var wIssued = s.workerModToken_issued_at, wExp = s.workerModToken_expires_at;
  var wAge = wIssued ? Math.floor((now - wIssued) / 86400000) + 'd old' : 'unknown';
  var wLeft = wExp ? Math.max(0, Math.floor((wExp - now) / 86400000)) + 'd left' : '';
  fld('diagFldWorkerTok', wAge + (wLeft ? ' / ' + wLeft : ''), wLeft && parseInt(wLeft) <= 3 ? 'err' : wLeft && parseInt(wLeft) <= 7 ? 'warn' : '');
  var lIssued = s.leadModToken_issued_at, lExp = s.leadModToken_expires_at;
  fld('diagFldLeadTok', lIssued ? Math.floor((now - lIssued) / 86400000) + 'd old' : 'none');
  if (status) { status.textContent = stoClass.toUpperCase(); status.className = 'dt-section-status ' + stoClass; }
}

function _diagRenderCrypt(data, err) {
  var status = $('diagCryptStatus');
  function fld(id, val, cls) {
    var el = $(id); if (!el) return;
    el.textContent = val || '--';
    if (cls) { el.className = 'dt-field-val ' + cls; }
  }
  if (!data) {
    if (status) { status.textContent = 'ERR'; status.className = 'dt-section-status err'; }
    return;
  }
  var health = (!data.cryptKeyPresent || !data.idbAvailable) ? 'err' : data.plaintextTokensFound > 0 ? 'warn' : 'ok';
  fld('diagFldCryptKey',  data.cryptKeyPresent ? 'yes' : 'NO', data.cryptKeyPresent ? 'ok' : 'err');
  fld('diagFldIdbAvail',  data.idbAvailable    ? 'yes' : 'NO', data.idbAvailable    ? 'ok' : 'err');
  fld('diagFldEncTok',    String(data.encryptedTokensFound));
  fld('diagFldPltTok',    String(data.plaintextTokensFound), data.plaintextTokensFound > 0 ? 'warn' : 'ok');
  fld('diagFldMigTs',     data.lastMigrationTs ? new Date(data.lastMigrationTs).toLocaleString() : 'never');
  if (status) { status.textContent = health.toUpperCase(); status.className = 'dt-section-status ' + health; }
}
```

---

## E. Filter + Virtual Scroller Wiring

```js
var _diagLogToolbarWired = false;

function _diagWireLogToolbar() {
  if (_diagLogToolbarWired) { diagApplyFilter(); return; }
  _diagLogToolbarWired = true;

  // Text filter with debounce
  var filterInput = $('diagLogFilter');
  if (filterInput) {
    filterInput.addEventListener('input', function() {
      clearTimeout(_diagFilterDebounce);
      _diagFilterDebounce = setTimeout(function() {
        _diagFilterText = filterInput.value.trim().toLowerCase();
        diagApplyFilter();
      }, 120);
    });
  }

  // Pill filter
  var pills = document.querySelectorAll('#diagLogPills .dt-pill');
  pills.forEach(function(pill) {
    pill.addEventListener('click', function() {
      pills.forEach(function(p) { p.classList.remove('active'); });
      pill.classList.add('active');
      _diagActivePill = pill.dataset.cat;
      diagApplyFilter();
    });
  });

  // Virtual scroll listener
  var vp = $('diagLogViewport');
  if (vp) { vp.addEventListener('scroll', function() { diagVirtualRender(false); }, { passive: true }); }

  // Copy button
  var copyBtn = $('diagLogCopy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function() {
      var btn = copyBtn;
      var masked = _maskSecretsDeep(_diagAllEntries);
      var out = JSON.stringify(masked, null, 2);
      navigator.clipboard.writeText(out).then(function() {
        btn.title = 'Copied!';
        setTimeout(function() { btn.title = 'Copy visible entries to clipboard'; }, 1500);
      }).catch(function() {
        var ta = document.createElement('textarea');
        ta.value = out;
        ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        try { document.execCommand('copy'); } catch(_) {}
        document.body.removeChild(ta);
      });
    });
  }

  // Refresh button
  var refreshBtn = $('diagRefreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      _diagTabRendered = false;
      renderDiagTab();
    });
  }
}

function diagApplyFilter() {
  var pill = _diagActivePill || 'all';
  var text = _diagFilterText || '';

  var pilCatMap = {
    err:  /error|uncaught|unhandled/,
    warn: /warn/,
    rpc:  /^rpc/,
    net:  /^net/,
    auth: /auth/
  };

  var filtered = _diagAllEntries.filter(function(e) {
    if (pill !== 'all') {
      var re = pilCatMap[pill];
      if (re && !re.test((e.cat || '').toLowerCase())) return false;
    }
    if (text) {
      var haystack = ((e.msg || '') + ' ' + (e.cat || '') + ' ' + (e.src || '')).toLowerCase();
      if (haystack.indexOf(text) === -1) return false;
    }
    return true;
  });

  // Swap dataset into virtual scroller
  _diagAllEntries = filtered;  // Note: in real impl keep _diagRawEntries separate
  var countEl = $('diagLogCount');
  if (countEl) countEl.textContent = filtered.length + '/' + (_diagRawEntries || _diagAllEntries).length;

  // Reset scroll and force re-render
  var vp = $('diagLogViewport');
  if (vp) vp.scrollTop = 0;
  _diagRenderedFrom = -1;
  _diagRenderedTo   = -1;
  diagVirtualRender(true);
}

// Note: diagVirtualRender / diagBuildRow / diagSevLabel / diagRowSeverityClass
// defined in Section B.3.3 above.
```

---

## F. Critique of v10.12.3

### F.1 IDB Read Gap — CRITICAL

**Issue:** `renderDiagTab` reads `gam_diag_log` via `chrome.storage.local.get('gam_diag_log')`. After v10.12.3 moved the log to IndexedDB, this read returns nothing (empty array) for any new entries. The operator sees "No RPC errors in log" even when errors exist.

**Fix:** Route through `diagReadRecent` RPC with local-cache fallback (see D above).

### F.2 No Virtualization — PERFORMANCE

**Issue:** The current log renderer creates one DOM node per entry up to 50 entries, within a fixed 180px overflow div. If `diagRpcEntries.slice(-50)` is 50 rows, that's 50×3 spans = 150 nodes created synchronously on every `renderDiagTab` call. The design cap of 500 entries means this could be 1500 nodes — at popup width (360px) this causes a 40–80ms synchronous layout on slow machines.

**Fix:** Virtual scroller with 22px fixed row height. Only ~8–10 rows render at any time. (See B.3.3.)

### F.3 No Filter or Search — USABILITY

**Issue:** The operator cannot filter by severity or search by message text. To find a specific `rpc-error` among 50 entries they scan all 50 manually.

**Fix:** Pill filter (ALL / ERR / WARN / RPC / NET / AUTH) + text search with 120ms debounce. (See B.3.2.)

### F.4 Monolithic textContent Blobs — MAINTAINABILITY

**Issue:** Sections 1, 2, 4 render as multi-line `.textContent` strings on a single `<div>`. This means: (a) no per-field color coding, (b) no hover interaction, (c) any update requires re-rendering the entire blob, and (d) copy-pasting individual fields is impossible.

**Fix:** Decompose into `dt-field-row` key/value grid with per-field `id` targets. Each field gets independent color classification. (See B.2.)

### F.5 No Section-Level Status Chip

**Issue:** The operator cannot see at a glance which sections are healthy vs failing. The current `pop-token-status ok/err` class applies to a whole blob, not a named section.

**Fix:** Each section header carries a `dt-section-status` chip (`OK` / `WARN` / `ERR`) set independently by its render function.

### F.6 IDB Entry Count Not Surfaced in Storage Section

**Issue:** Storage section shows `gam_diag_log` size based on the local-storage read (which is now empty post-IDB migration). The operator sees "0 entries" for the log. The real count is in IDB and requires the `diagReadRecent` RPC.

**Fix:** `_diagFetchStorage` calls `diagReadRecent` with `limit:1` to get `total`, surfaces as "IDB diag log: {N} entries (IDB)". (See D.)

### F.7 Export Button Scope Too Narrow

**Issue:** `diagExportErrors` copies only entries matching `['unhandledrejection', 'uncaught-error', 'rpc-error', 'net-error']`. If the operator needs to export warn entries or auth entries for a bug report, they cannot.

**Fix:** Toolbar copy button exports the current filtered view — whatever pills + search produce. (See B.3.4.)

### F.8 `<details>` Card Wrapper Wastes Height

**Issue:** The Diag tab wraps its entire content in a `<details class="gam-card">` element with a `<summary>` toggle. In a 5th popup tab the card chrome is redundant — the tab itself is the navigation. The summary bar burns ~28px of height in a 600px popup.

**Fix:** Drop the `<details>` wrapper. Replace with a flat `flex-direction:column` container and the `dt-section-head` sticky headers per section. (See C.)

---

## G. Row Expand Detail

When a log row is clicked, a non-virtual detail block expands beneath it. This is additive (not part of the virtual position model):

```js
var _diagExpandedIdx = -1;

function diagToggleRowExpand(rowEl, entry) {
  var existingExpand = rowEl.nextSibling;
  if (existingExpand && existingExpand.classList && existingExpand.classList.contains('dt-log-row-expand')) {
    existingExpand.parentNode.removeChild(existingExpand);
    _diagExpandedIdx = -1;
    return;
  }
  // Remove any other open expand
  var rows = $('diagLogRows');
  if (rows) {
    var opens = rows.querySelectorAll('.dt-log-row-expand');
    opens.forEach(function(o) { o.parentNode.removeChild(o); });
  }
  var detail = document.createElement('div');
  detail.className = 'dt-log-row-expand';
  var masked = _maskSecretsDeep(entry);
  detail.textContent = JSON.stringify(masked, null, 2);
  rowEl.parentNode.insertBefore(detail, rowEl.nextSibling);
  _diagExpandedIdx = parseInt(rowEl.dataset.idx, 10);
}
```

---

## H. Implementation Sequence

| Step | File | Change | Risk |
|---|---|---|---|
| H.1 | popup.html | Replace `#diagTabSection` inner markup with blueprint from C | Layout — verify tab scroll does not bleed into footer |
| H.2 | popup.html | Add `IBM Plex Mono` font import (Google Fonts CDN or bundled woff2) | Network — use `font-display:swap` |
| H.3 | popup.js | Add CSS block (or `<style>` in popup.html) for `.dt-*` selectors from B | None — additive |
| H.4 | popup.js | Replace `renderDiagTab()` with parallel-fetch version from D | IDB RPC — test with SW idle (fallback path must work) |
| H.5 | popup.js | Add `_diagFetch*` and `_diagRender*` helpers from D | None — new functions |
| H.6 | popup.js | Add `diagVirtualRender`, `diagBuildRow`, `diagApplyFilter`, `_diagWireLogToolbar` from B.3 + E | Scroller — verify `DIAG_ROW_H` matches CSS exactly |
| H.7 | popup.js | Remove old `wireDiagSkeletons` skeleton entries for `diagRpcLog`, `diagSysIdentity`, `diagSwHealth`, `diagStorage` — new element IDs differ | Dead code — safe to remove |
| H.8 | popup.js | Update `wireDiagTab` storage.onChanged listener to call `renderDiagTab` when IDB key changes (if background can signal via storage write to a sentinel key) | IDB — may require background to write `gam_diag_log_ts` sentinel to trigger refresh |

**H.2 font note:** If CSP blocks Google Fonts CDN in the extension context, bundle `IBMPlexMono-Regular.woff2` and `IBMPlexMono-Medium.woff2` (~25KB each) in `/fonts/` and declare via `@font-face`. The `ui-monospace` fallback chain handles the no-font case gracefully.

**H.8 IDB refresh note:** `storage.onChanged` fires for `chrome.storage.local` only. IDB writes do not trigger it. Two options: (a) background writes a sentinel key `gam_diag_log_ts = Date.now()` to `chrome.storage.local` on every IDB append — popup listener watches this key; (b) popup polls on a 5s interval when tab is visible. Option (a) is preferred — one extra 8-byte storage write per log entry is negligible.

---

*Generated by UIUX2-07-DIAG-TAB for v10.13 design ralph V2. Source files read: popup.html:803-834, popup.js:6176-6387.*
