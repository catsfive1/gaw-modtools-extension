# UIUX2-06 -- Lead Card v2 Design Spec
**Auditor / Designer:** UIUX2-06-LEAD-CARD
**Generated:** 2026-05-10
**Scope:** popup.html (#card-lead / #leadKpiRow / #leadQuickActions / #lapsedModsChip / #gam-lead-deepdive), popup.css, popup.js (loadLead, _setKpiTile, _updateKpiDelta)
**Baseline:** v10.12.3 current codebase — UIUX-08 already shipped, so this spec is a V2 critique and forward-look, not a from-scratch redesign.
**Prior v1 spec:** docs/V10_DESIGN/UIUX-08_lead_card.md

---

## A. Current-State Audit (v10.12.3) — What UIUX-08 Delivered and What It Missed

### A.1 What UIUX-08 shipped correctly

The v10.12 implementation landed the following items from UIUX-08 intact:

- Structural consolidation: all orphan divs (`#leadKpiRow`, `#leadQuickActions`, `#lapsedModsChip`) moved inside `#card-lead > .gam-card-body > #leadSection > #leadOnlyTools`. The three-separate-element gate is gone. Lead gate now controls one subtree.
- KPI strip: four tiles with label / value-row / delta spans, grid layout, semantic color thresholds in `__loadLeadKpi`, `_setKpiTile`, `_updateKpiDelta`.
- Active Now: live data from `modPresencePing`, correct three-tier color (red/amber/green), panel toggle on click showing mod list.
- CLR-RATE + MM p50: hooked to `modStats` RPC, conditional `--` fallback when field is null, correct color thresholds.
- INCIDENTS: hardcoded `0` / green (stub for V11 mod_incidents, honest zero beats dash).
- Delta system: `sessionStorage`-based, `data-dir` attribute, `+N` / `-N` rendering.
- Quick Actions bar: Group A (Invite, Rotate) / Group B (Bugs, Maint, Chat) with `gam-qa-sep` divider, correct `scrollIntoView` wiring.
- `qaInviteBtn` v10.12.1 fix: correct RPC param (`mod:`), correct response field (`data.url`), prompt for target username.
- Lapsed chip: replaces always-rendered card; only appears when `lapsed_count > 0`; chip with Ping All + Expand toggle.
- Deep-dive accordion: five sub-panels (Rotation, Bug Reports, Maintenance Reports, Diagnostics, Settings), nested `<details>`.
- CSS: `gam-kpi-*`, `gam-qa-*`, `#lapsedModsChip`, `gam-lead-deepdive`, `gam-lead-sub` fully defined, `prefers-reduced-motion` respected.
- `inviteBtn` duplication from the original UIUX-08 G.11 risk flag: `inviteBtn` still present inside `lead-sub-rotation` div (line 635 in popup.html). This is a **real remaining issue** (see B.3 below).

### A.2 KPI delta color -- partial miss

`_updateKpiDelta` sets `data-dir="up"` or `data-dir="down"` correctly but **no CSS rule targets `.gam-kpi-delta[data-dir]`**. The only `data-dir` CSS rules in popup.css target `.pop-stat-delta[data-dir]` and `.pop-stat-trend[data-dir]` -- different class names. Result: the delta text renders in its default opacity-0.85 color regardless of direction. A `+3` on Active Now and a `+3` on Incidents look identical. The directional semantic is dead on arrival.

### A.3 KPI tiles have no loading state wired

`data-loading="true"` triggers a pulse animation in CSS, but no JS code sets that attribute before the async RPC calls in `__loadLeadKpi` and clears it after. The pulse is designed and spec'd but never fires. Tile values show static `&mdash;` (dash) during load -- visually identical to the permanent null/stub dash.

### A.4 INCIDENTS tile shows `0` not `--` for a genuinely unknown value

The INCIDENTS tile always renders `0` / green, including during the brief period after popup open when no RPC has resolved. A hardcoded `0` implies the system has checked and found zero incidents. That is false -- it means "V11 mod_incidents not built yet, we assume zero." The correct signal for a stub is `--` with faint color plus a tooltip explaining why. When V11 ships, it becomes `0` / green only when the endpoint confirms zero.

### A.5 Deep-dive summary header is not informative enough

The outer accordion summary reads "Deep Dive" with `[+]` / `[-]` toggle only. A lead scanning the card does not know what is inside without opening it. Bloomberg principle: every row carries a status signal. The outer summary should show a compressed status strip (e.g., "4 bugs | ok | 3h ago") derived from the sub-panel statuses already loaded. This requires no new RPC -- the data already flows through the sub-panels.

### A.6 Sub-panel `sub-status` spans are mostly empty

Four of five sub-panels have a `<span class="sub-status">` in their summary. Only Bug Reports populates it (badge from `bugListBadge`). Rotation status (`lead-sub-rotation-status`), Maintenance Reports status (`lead-sub-maintreports-status`), and Diagnostics status (`lead-sub-diag-status`) are never written by any JS. They render as empty spans -- wasted real estate that was spec'd but not wired.

### A.7 `#kpi-active-panel` uses hardcoded hex colors, not `--bb-*` tokens

The `__renderActiveModsPanel` function (popup.js ~5908-5943) builds DOM with inline `style.cssText` containing hardcoded hex (`#11131a`, `#2a2d33`, `#e4e4e4`, `#888`). This bypasses the token system and will break if the color scheme shifts. Minor but a clear token-hygiene miss.

### A.8 `lapsedModsList` vs `lapsedModsPanel` structure

`#lapsedModsPanel` contains `#lapsedModsList` as a child div. `__loadLapsedMods` checks `if (!list) return` where `list = $('lapsedModsList')` -- the inner div. The outer `#lapsedModsPanel` is what the aria-controls on `#lapsedExpandBtn` toggles. This two-level nesting is unnecessary and creates a fragile dependency on the inner div existing. If the inner div is ever removed (e.g., if the panel renders a table instead of a div), the function silently bails.

### A.9 Lapsed chip shows "21d" hardcoded in the chip-label text

The chip-label HTML (`LAPSED&nbsp;<strong>N</strong>&nbsp;mods >21d`) hardcodes "21d" regardless of the `#lapsedThresholdInput` value. When a lead changes the threshold input to 30, the chip correctly re-queries with `days=30` but still reads ">21d". The label must reflect the current threshold value dynamically.

### A.10 Quick Actions bar alignment issues

`#leadQuickActions` has `margin: 4px 0` in CSS. The KPI strip has `margin: 8px 0 0`. This creates asymmetric spacing: 8px gap above KPI, then only 4px between KPI and QA bar, then 4px below QA before the lapsed chip. Bloomberg requires consistent spacing rhythm. All three segments should share the same inter-element gap.

---

## B. Gap Analysis: UIUX-08 G-items vs. v10.12.3 Reality

| Item | UIUX-08 Spec | v10.12.3 Status | Gap |
|------|-------------|-----------------|-----|
| G.1 CSS: KPI strip | New rules for `.gam-kpi-*` | SHIPPED | -- |
| G.2 CSS: QA bar | New rules for `.gam-qa-btn/sep/badge` | SHIPPED | -- |
| G.3 CSS: Lapsed chip | New rules for `#lapsedModsChip` | SHIPPED | -- |
| G.4 CSS: Deep-dive accordion | New rules for `.gam-lead-deepdive`, `.gam-lead-sub` | SHIPPED | -- |
| G.5 HTML: Restructure | Orphans into card, chip, deep-dive | SHIPPED | `inviteBtn` duplicate remains (B.3) |
| G.6 popup.js: Active Now color bug | 3-line fix, semantic colors | SHIPPED | -- |
| G.7 popup.js: CLR-RATE + MM p50 | Hook to `/mod/stats` | SHIPPED | -- |
| G.8 popup.js: Delta tracking | `_updateKpiDelta()` + 4 call sites | SHIPPED, partial | CSS rule for `.gam-kpi-delta[data-dir]` missing (A.2) |
| G.9 popup.js: Lapsed chip | Chip show/hide, expand toggle | SHIPPED, partial | Label hardcodes "21d" (A.9) |
| G.10 popup.js: Deep-dive wiring | QA buttons open panels | SHIPPED | Sub-status spans not wired (A.6) |
| G.11 popup.js: Remove `inviteBtn` duplicate | Shared handler | NOT DONE | `inviteBtn` still in HTML, separate handler |
| G.12 TAB_MAP update | `lead` selector for new containers | N/A per comment | `data-tab="lead"` on `#card-lead` covers it |

### B.3 `inviteBtn` duplicate -- detail

`popup.html:635` has `<button id="inviteBtn">Generate invite link</button>` inside `lead-sub-rotation`. A separate JS handler at popup.js ~1761 wires this to `adminInviteCreate`. The `qaInviteBtn` in Quick Actions is also wired (with the v10.12.1 bug fixes applied). Two buttons, two handlers, same RPC. Risk: if `adminInviteCreate` RPC parameters change again, both handlers need updating and one will be missed. The canonical entry point is `qaInviteBtn`. `inviteBtn` inside Rotation sub-panel should either be removed or renamed "Generate another invite" with a shared named handler function -- not two independent anonymous closures calling the same RPC with different parameter paths.

---

## C. Data Honesty: KPI Tile Truth-Telling Rules for V2

Each tile must signal three distinct states clearly, with no visual ambiguity between them:

| State | Visual |
|-------|--------|
| **Live value, healthy** | Colored value (green/amber/red per threshold), numeric content, delta arrow |
| **Live value, awaiting first load** | `data-loading="true"` pulse on dash, distinct from settled dash |
| **Stub / endpoint not yet built** | Dash + faint color + distinct tooltip explaining the stub |

Current problem: "loading" and "permanent stub" render identically -- both show `--` in default ink-faint color. A lead cannot tell whether the endpoint is pending or the RPC is in flight.

### C.1 Loading state wire-up (fix required before V2)

```js
// In __loadLeadKpi, before any async calls:
['kpi-clearrate', 'kpi-mmp50', 'kpi-incidents'].forEach(id => {
  const tile = document.getElementById(id);
  if (tile) tile.setAttribute('data-loading', 'true');
});

// After each tile settles (inside _setKpiTile, or after each RPC):
const tile = document.getElementById(tileId);
if (tile) tile.removeAttribute('data-loading');
```

### C.2 INCIDENTS stub treatment (fix required before V2)

Replace:
```js
_setKpiTile('kpi-incidents', 0, 'var(--bb-green)');
```

With:
```js
// Until mod_incidents V11 ships, render as stub with tooltip explaining why
_setKpiTile('kpi-incidents', null, null);  // null -> shows '--' in faint
const incTile = document.getElementById('kpi-incidents');
if (incTile) incTile.title = 'Incidents -- stub (V11 mod_incidents table not yet built). Will show real count when V11 ships.';
```

When V11 ships, this tile will be wired to the real endpoint and `null` becomes a real `0` or a nonzero value.

### C.3 Delta color CSS (fix required before V2)

Add to popup.css immediately after the `.gam-kpi-delta` block:

```css
/* KPI delta directional color -- lead card */
.gam-kpi-delta[data-dir="up"]   { color: var(--bb-green); opacity: 1; }
.gam-kpi-delta[data-dir="down"] { color: var(--bb-red);   opacity: 1; }
.gam-kpi-delta[data-dir="flat"] { color: var(--bb-ink-faint); opacity: 0.7; }
.gam-kpi-delta[data-dir="none"] { display: none; }
```

Note: "up" means green for Active Now and CLR-RATE, but red for Incidents. The data-dir convention tracks the numeric direction, and the CSS colors the direction -- this means Incidents "up" shows green, which is **wrong**. V2 must invert the delta color for tiles where higher is worse. Options:

**Option A (simple, recommended):** Add a `data-invert` attribute to the tile, and CSS:
```css
.gam-kpi-tile[data-invert="true"] .gam-kpi-delta[data-dir="up"]   { color: var(--bb-red); }
.gam-kpi-tile[data-invert="true"] .gam-kpi-delta[data-dir="down"] { color: var(--bb-green); }
```

Set `data-invert="true"` on `#kpi-incidents` and `#kpi-mmp50` in HTML. Active Now and CLR-RATE keep the default (up = green). Zero JS change required.

**Option B:** Pass a `direction` param to `_updateKpiDelta` specifying whether up is good or bad. More flexible but adds complexity.

Recommendation: Option A. Two HTML attributes, four CSS rules.

---

## D. Visual Spec: Bloomberg Dense, 520px Viewport

### D.1 Spacing Rhythm Fix

All three primary segments (KPI strip, QA bar, lapsed chip) should share a uniform `6px` vertical gap between them. Current state: 8px above KPI, 4px between KPI and QA, 4px between QA and lapsed. Fix:

```css
#leadKpiRow    { margin: 6px 0 0; }
#leadQuickActions { margin: 6px 0 0; }
#lapsedModsChip   { margin: 6px 0 4px; }
```

### D.2 Deep-Dive Summary -- Status Strip

The outer `<details class="gam-lead-deepdive">` summary currently shows only "Deep Dive [+]". V2 adds a compact status strip in the summary right-side, populated by JS after sub-panels load:

```
DEEP DIVE           bugs:4  maint:ok  last:3h  [+]
```

This requires a `<span id="lead-deepdive-status">` inside the summary:

```html
<summary>Deep Dive <span id="lead-deepdive-status" class="lead-deepdive-status-strip"></span></summary>
```

CSS:
```css
.lead-deepdive-status-strip {
  margin-left: auto;
  font: 500 9px/1 var(--bb-font);
  color: var(--bb-ink-faint);
  letter-spacing: 0.04em;
  margin-right: 6px;
}
```

JS populates this after `__loadLeadKpi` completes, reading from already-resolved data (bug count from `bugListBadge`, maintenance status from whatever `__maintLoadAutoToggle` knows, rotation last-run from localStorage if tracked).

### D.3 Sub-Panel Status Wiring

The five sub-panel `sub-status` spans need population. Recommended wiring:

| Sub-panel | Status source | Format |
|-----------|--------------|--------|
| Rotation | `localStorage['gam_last_rotation_ts']` if it exists | `last: Nh ago` |
| Bug Reports | `bugListBadge` textContent | `N open` or `ok` |
| Maintenance Reports | Last report severity from `__maintLoadAutoToggle` | `ok` / `warn` / `crit` |
| Diagnostics | `maintAuditVerifyStatus` last result text, truncated | `verified: Nd ago` |
| Settings | Static -- not applicable | empty |

None of these require new RPCs. They read state already fetched by existing flows.

### D.4 `kpi-active-panel` Token Hygiene

`__renderActiveModsPanel` rebuilds all inline styles from hardcoded hex. V2 moves these to CSS classes:

```css
/* Active mods panel (lazy-mounted under kpi-active tile) */
#kpi-active-panel {
  background: var(--bb-sunken);
  border: 1px solid var(--bb-line-hot);
  border-top: none;
  padding: 6px 8px;
  margin: -8px 0 8px 0;
  max-height: 180px;
  overflow: auto;
}
#kpi-active-panel .panel-header {
  font: 600 9px/1.2 ui-monospace, monospace;
  color: var(--bb-ink-faint);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 4px;
}
#kpi-active-panel .panel-row {
  font: 11px/1.4 ui-monospace, monospace;
  color: var(--bb-ink);
  padding: 1px 0;
}
```

`__renderActiveModsPanel` then sets `header.className = 'panel-header'` and `row.className = 'panel-row'` instead of inline style strings.

---

## E. Updated ASCII Mockup (v2, 520px viewport)

KPI strip -- loading state (before RPCs resolve):
```
+----------------------------------------------------------+
| ACTIVE NOW  | CLR-RATE    | MM p50      | INCIDENTS     |
|   [pulse]   |  [pulse]    |  [pulse]    |  [pulse]      |
+----------------------------------------------------------+
```

KPI strip -- settled, mixed state (Active Now live, others stub):
```
+----------------------------------------------------------+
| ACTIVE NOW  | CLR-RATE    | MM p50      | INCIDENTS     |
| [GRN]  4+1  |  [FAINT]-- ?|  [FAINT]-- ?| [FAINT]--    |
+----------------------------------------------------------+
```
Note: `?` delta is current behavior for null tiles (data-dir="none" hides the delta span in V2).

KPI strip -- fully live (V11+):
```
+----------------------------------------------------------+
| ACTIVE NOW  | CLR-RATE    | MM p50      | INCIDENTS     |
| [GRN] 4 +1  | [GRN] 87% +5| [GRN] 1.4h  | [GRN] 0      |
+----------------------------------------------------------+
```

Quick Actions bar (no change from UIUX-08):
```
+--[+INVITE]--[ROTATE]--||--[BUGS 4]--[MAINT]--[CHAT ->]--+
```

Lapsed chip (when lapsed_count > 0, threshold=30):
```
+----------------------------------------------------------+
|  LAPSED  3 mods >30d    [Ping all]  [Expand]  [30]      |
+----------------------------------------------------------+
```
Note: "30d" reads from `lapsedThresholdInput.value` dynamically, not hardcoded.

Deep-Dive outer summary (collapsed, with status strip):
```
+----------------------------------------------------------+
|  DEEP DIVE          bugs:4  maint:ok  last:3h ago   [+]  |
+----------------------------------------------------------+
```

Deep-Dive outer summary (open):
```
+----------------------------------------------------------+
|  DEEP DIVE          bugs:4  maint:ok  last:3h ago   [-]  |
|  > Discord DM Rotation                     last:3h  [>] |
|  > Bug Reports                             4 open   [>] |
|  > Maintenance Reports                     ok       [>] |
|  > Diagnostics & Audit                 verified:2d  [>] |
|  > Settings                                         [>] |
+----------------------------------------------------------+
```

---

## F. Code Changes Required for V2

These are surgical, not structural -- the UIUX-08 structure is sound. Each item is independent and can ship as a standalone patch.

### F.1 CSS: KPI delta directional color + invert support

**File:** popup.css, after `.gam-kpi-delta { ... }` block

Add:
```css
.gam-kpi-delta[data-dir="up"]   { color: var(--bb-green); opacity: 1; }
.gam-kpi-delta[data-dir="down"] { color: var(--bb-red);   opacity: 1; }
.gam-kpi-delta[data-dir="flat"] { color: var(--bb-ink-faint); opacity: 0.7; }
.gam-kpi-delta[data-dir="none"] { display: none; }

/* Invert: tiles where higher is worse (incidents, mmp50) */
.gam-kpi-tile[data-invert="true"] .gam-kpi-delta[data-dir="up"]   { color: var(--bb-red); }
.gam-kpi-tile[data-invert="true"] .gam-kpi-delta[data-dir="down"] { color: var(--bb-green); }
```

**File:** popup.html, `#kpi-incidents` and `#kpi-mmp50` tile divs:
```html
<div class="gam-kpi-tile" id="kpi-incidents" data-kpi="incidents" data-invert="true" ...>
<div class="gam-kpi-tile" id="kpi-mmp50" data-kpi="mmp50" data-invert="true" ...>
```

### F.2 CSS: Spacing rhythm fix

**File:** popup.css

Change:
```css
/* Current: #leadKpiRow margin: 8px 0 0  -- leave as is */
#leadQuickActions { margin: 4px 0; ... }
#lapsedModsChip   { margin: 0 0 4px; ... }
```

To:
```css
#leadKpiRow       { margin: 6px 0 0; ... }
#leadQuickActions { margin: 6px 0 0; ... }
#lapsedModsChip   { margin: 6px 0 4px; ... }
```

### F.3 CSS: kpi-active-panel token classes

**File:** popup.css, add after `#lapsedModsPanel` block:
```css
#kpi-active-panel {
  background: var(--bb-sunken);
  border: 1px solid var(--bb-line-hot);
  border-top: none;
  padding: 6px 8px;
  margin: -8px 0 8px 0;
  max-height: 180px;
  overflow: auto;
}
#kpi-active-panel .panel-header {
  font: 600 9px/1.2 ui-monospace, monospace;
  color: var(--bb-ink-faint);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 4px;
}
#kpi-active-panel .panel-row {
  font: 11px/1.4 ui-monospace, monospace;
  color: var(--bb-ink);
  padding: 1px 0;
}
```

### F.4 CSS: Deep-dive status strip

**File:** popup.css, add after `.gam-lead-deepdive[open] > summary::after` rule:
```css
.lead-deepdive-status-strip {
  margin-left: auto;
  font: 500 9px/1 var(--bb-font);
  color: var(--bb-ink-faint);
  letter-spacing: 0.04em;
  margin-right: 6px;
}
```

### F.5 HTML: data-invert attributes

**File:** popup.html -- two attribute additions (lines ~562, ~571)

```html
<!-- kpi-mmp50 tile: -->
<div class="gam-kpi-tile" id="kpi-mmp50" data-kpi="mmp50" data-invert="true" ...>

<!-- kpi-incidents tile: -->
<div class="gam-kpi-tile" id="kpi-incidents" data-kpi="incidents" data-invert="true" ...>
```

### F.6 HTML: Deep-dive status strip span

**File:** popup.html -- inside `.gam-lead-deepdive > summary`:
```html
<summary>Deep Dive <span id="lead-deepdive-status" class="lead-deepdive-status-strip"></span></summary>
```

### F.7 JS: Loading state wire-up in __loadLeadKpi

**File:** popup.js, in `__loadLeadKpi` (around line 5946)

Add at top of function, before any `await`:
```js
// Set loading state on stubs (active is set by its own RPC path)
['kpi-clearrate', 'kpi-mmp50', 'kpi-incidents'].forEach(function(id) {
  var tile = document.getElementById(id);
  if (tile) tile.setAttribute('data-loading', 'true');
});
```

After `_setKpiTile('kpi-clearrate', ...)` and `_setKpiTile('kpi-mmp50', ...)`:
```js
['kpi-clearrate', 'kpi-mmp50'].forEach(function(id) {
  var tile = document.getElementById(id);
  if (tile) tile.removeAttribute('data-loading');
});
```

After incidents tile:
```js
var incTile = document.getElementById('kpi-incidents');
if (incTile) {
  incTile.removeAttribute('data-loading');
  incTile.title = 'Incidents -- V11 mod_incidents table not yet built. Will show real count when V11 ships.';
}
```

### F.8 JS: INCIDENTS tile -- null stub instead of hardcoded 0

**File:** popup.js, replace line 5982:

```js
// BEFORE:
_setKpiTile('kpi-incidents', 0, 'var(--bb-green)');

// AFTER:
_setKpiTile('kpi-incidents', null, null);
```

### F.9 JS: Lapsed chip label -- dynamic threshold

**File:** popup.js, in `__loadLapsedMods` where the chip-label text is set.

Locate the section after `mods.length` is known and the chip is about to show. Currently the chip-label HTML is static in `popup.html`. Replace the `chip-label` update to include the live threshold:

```js
// After: const days = Math.max(7, Math.min(60, parseInt(...)));
// Add:
const countEl = $('lapsedModsCount');
if (countEl) countEl.textContent = mods.length;
// Update the ">21d" text to reflect actual threshold
const chipLabel = chip && chip.querySelector('.chip-label');
if (chipLabel) {
  chipLabel.innerHTML = 'LAPSED&nbsp;<strong>' + mods.length + '</strong>&nbsp;mods &gt;' + days + 'd';
}
```

### F.10 JS: inviteBtn handler -- unify with qaInviteBtn

**File:** popup.js -- the `inviteBtn` handler (around line 1761).

Remove the anonymous listener on `inviteBtn` and replace with:
```js
// Named shared handler (defined once, used by both entry points)
function _handleInviteCreate(btn) { /* ... existing qaInviteBtn logic ... */ }

const qaInvite = $('qaInviteBtn');
if (qaInvite) qaInvite.addEventListener('click', function() { _handleInviteCreate(this); });
const deepInvite = $('inviteBtn');
if (deepInvite) deepInvite.addEventListener('click', function() { _handleInviteCreate(this); });
```

This makes the two buttons share one code path. If `inviteBtn` is later removed from HTML, the JS degrades silently.

### F.11 JS: __renderActiveModsPanel -- use CSS classes

**File:** popup.js, `__renderActiveModsPanel` function (~line 5908).

Replace inline `style.cssText` assignments with `className` assignments:
```js
panel.id = 'kpi-active-panel';
// Remove: panel.style.cssText = '...'
// Add: (CSS handles it via #kpi-active-panel)

header.className = 'panel-header';
// Remove: header.style.cssText = '...'

row.className = 'panel-row';
// Remove: row.style.cssText = '...'
```

### F.12 JS: Sub-panel status span wiring

**File:** popup.js, at end of `__loadLeadKpi` after all RPCs resolve.

```js
// Wire sub-panel status spans (no new RPCs -- reads already-resolved data)
function _setSubStatus(spanId, text, color) {
  var el = document.getElementById(spanId);
  if (!el) return;
  el.textContent = text;
  if (color) el.style.color = color;
}

// Rotation: check localStorage for last rotation ts
(function() {
  var ts = localStorage.getItem('gam_last_rotation_ts');
  if (!ts) return;
  var age = Math.round((Date.now() - Number(ts)) / 3600000);
  _setSubStatus('lead-sub-rotation-status', 'last: ' + age + 'h ago');
})();

// Bug reports: already populated by bugListBadge -- copy its state
(function() {
  var badge = document.getElementById('bugListBadge');
  if (!badge) return;
  var n = badge.textContent;
  _setSubStatus('lead-sub-bugs-status', n ? n + ' open' : 'ok',
    n ? 'var(--bb-warn)' : 'var(--bb-green)');
})();
// Deep-dive outer status strip
(function() {
  var bugBadge = document.getElementById('bugListBadge');
  var bugN = bugBadge && bugBadge.textContent ? bugBadge.textContent : '0';
  var strip = document.getElementById('lead-deepdive-status');
  if (strip) strip.textContent = 'bugs:' + bugN;
})();
```

Maintenance Reports and Diagnostics status spans require the relevant async calls to resolve first and are left for their respective load functions to populate.

---

## G. Effort Estimate

| Item | File(s) | Lines touched | Effort |
|------|---------|---------------|--------|
| F.1 CSS: delta color + invert rules | popup.css | +10 lines | 10 min |
| F.2 CSS: spacing rhythm | popup.css | 3 changes | 5 min |
| F.3 CSS: kpi-active-panel classes | popup.css | +12 lines | 10 min |
| F.4 CSS: deepdive status strip style | popup.css | +6 lines | 5 min |
| F.5 HTML: data-invert attrs | popup.html | 2 attrs | 2 min |
| F.6 HTML: deepdive status span | popup.html | 1 line | 2 min |
| F.7 JS: loading state wire-up | popup.js | +12 lines | 15 min |
| F.8 JS: INCIDENTS null stub | popup.js | 3 lines | 5 min |
| F.9 JS: lapsed chip dynamic label | popup.js | +5 lines | 10 min |
| F.10 JS: inviteBtn unify | popup.js | refactor ~30 lines | 20 min |
| F.11 JS: kpi-active-panel CSS classes | popup.js | remove ~10 inline style lines | 15 min |
| F.12 JS: sub-panel status wiring | popup.js | +30 lines | 20 min |
| **Total** | | | **~2h** |

All twelve items are independent. Any can ship individually without blocking the others.

---

## H. V2 Design Principles: What Must Not Change vs. What Must Improve

### What must not change (load-bearing UIUX-08 decisions)

- Structural consolidation: KPI / QA / Lapsed inside `#card-lead > #leadSection > #leadOnlyTools`. Do not re-orphan these elements.
- `--bb-*` token system: no raw hex in new code.
- `gam-kpi-tile`, `gam-qa-btn`, `gam-lead-deepdive`, `gam-lead-sub` class names: stable, referenced by JS and CSS.
- Five sub-panel structure inside `#gam-lead-deepdive`. The information architecture is correct; only the status spans are unwired.
- Tab visibility gate via `data-tab="lead"` on `#card-lead`. TAB_MAP implicit coverage is correct.
- `sessionStorage` delta tracking: correct approach, only needs the CSS fix to surface.

### What must improve in V2

1. **Delta color must be semantic** -- F.1 is a one-session fix. Zero tolerance for monochrome deltas.
2. **Loading state must be visible** -- F.7/F.8: `data-loading` pulse must fire on every popup open before RPCs resolve.
3. **Stub signal must be honest** -- INCIDENTS showing `0` green when no endpoint exists is false precision. F.8 corrects this.
4. **Sub-panel status spans must carry signal** -- an empty `sub-status` span is wasted real estate. F.12 wires the low-hanging fruit.
5. **`inviteBtn` handler duplication must be resolved** -- two handlers on the same RPC is a maintenance trap. F.10.
6. **Lapsed chip label must reflect actual threshold** -- F.9: one-line dynamic label update.

### Authority color spec (unchanged from UIUX-08)

| Semantic | Token | Use |
|----------|-------|-----|
| Lead authority accent | `var(--bb-amber)` | Deep-dive summary header, lapsed chip accent |
| Healthy / confirmed | `var(--bb-green)` | Active Now >= 3, CLR-RATE >= 80%, Incidents = 0, delta down on bad-high tiles |
| Caution | `var(--bb-warn)` | Active Now 1-2, CLR-RATE 50-79%, MM p50 2-6h, Incidents 1-2 |
| Action required | `var(--bb-red)` | Active Now = 0, CLR-RATE < 50%, MM p50 > 6h, Incidents >= 3 |
| Stub / unavailable | `var(--bb-ink-faint)` | Null tile values, delta "none" state |
| Informational | `var(--bb-ink-dim)` | Sub-panel labels, QA button default state |
