# UIUX-08 -- Lead Dashboard Card Redesign
**Auditor:** DESIGN-08-LEAD-CARD
**Generated:** 2026-05-10
**Scope (read-only):** popup.html L399-614 (`#card-lead`, `#leadSection`, `#leadOnlyTools`, `#leadKpiRow`, `#leadQuickActions`, `#lapsedModsCard`); popup.css (`--bb-*` token system, `#leadSection`, `#leadOnlyTools`, `.gam-kpi-tile`)

---

## A. Critique — Current State

### A.1 KPI Row is stub-heavy and visually undifferentiated

The four-tile `#leadKpiRow` (popup.html L559-584) has one real data source (Active Now via `/presence/online`). CLR-RATE, MM p50, and INCIDENTS all render `&mdash;` because the worker endpoints do not exist yet (`/metrics/queue-pressure`, `/metrics/modmail-sla`, `mod_incidents` table). The dash is visually identical to an error state -- a lead opening the popup cannot tell whether the dash means "endpoint not built yet", "RPC failed", or "genuinely zero".

Additional problems:
- All four tiles share `color:#f0a040` (amber) for the value regardless of meaning. A healthy active-mod count looks identical to an incident count of 5.
- No delta/trend indicator. A lead cannot see if Active Now is up or down from 5 minutes ago.
- Tiles are separated only by `border-right:1px solid #2a2d33` with no label hierarchy or semantic color coding. Bloomberg terminal density is achieved through information richness, not visual thinness.
- 22px value text with no unit label. `3` for Active Now is unambiguous; `42%` for CLR-RATE requires the unit to be inline.
- The KPI row sits *outside* `#card-lead` at popup.html L557-584, and `#leadQuickActions` is similarly outside the card (L587-597). These orphan elements are controlled by `__applyLeadGate` setting `display` directly on them. They are structurally disconnected from the card they belong to.

### A.2 Quick Actions row is a flat, unsegregated strip

`#leadQuickActions` has four buttons (Invite, Rotate all, Bugs, Chat) plus the separately-located `#inviteBtn` and `#rotateRosterBtn` inside `#leadOnlyTools`. This creates **two different places that do the same thing**: `qaInviteBtn` calls `adminInviteCreate` directly; `inviteBtn` inside `leadOnlyTools` does the same. The quick-actions row was added as a "ship tonight" addition without rationalizing the pre-existing buttons.

Problems:
- No visual grouping that distinguishes "one-shot immediate actions" (Invite, Rotate all) from "open a deep-dive panel" (Bugs, Chat).
- Bugs badge (`#qaBugsBadge`) syncs via MutationObserver from `#bugListBadge`, which means two DOM nodes carry identical state.
- Chat button opens `greatawakening.win/mod/chat` in a new tab -- an `<a>` styled as a button inside a flex row of actual buttons. Different element type, different accessibility semantics, same visual appearance. Screen readers see a link in a button toolbar.

### A.3 Panels are not visually grouped as deep-dive vs settings

Inside `#leadSettingsAccordion` (a `<details>` element collapsed by default) live:
- Team settings (flag TTL)
- Bug reports triage + visibility config
- Maintenance (lead): four diagnostic buttons (Audit chain verify, Full health report, Roster staleness audit, Migration debt scanner)
- Autonomous maintenance Llama toggle + report list + severity filter + run-now button

These are four conceptually distinct panels crammed inside a single "Settings & Maintenance (advanced)" accordion with no internal section separation beyond `pop-section-label` divs. The Llama section (AI-driven weekly analysis) and the manual diagnostic tools are especially mismatched -- one is a passive result viewer, one is an active button panel. Both are hidden until the user expands an accordion they may not know exists.

### A.4 Lapsed mods card (`#lapsedModsCard`) placement

The lapsed mods card (popup.html L600-612) sits below the quick-actions row, outside the main card, with no header that contextually links it to the KPI row. A lead cannot see from the KPI row that there are lapsed mods -- there is no count chip on the KPI row pointing to this panel.

### A.5 Visibility inconsistencies and structural orphaning

- `#leadKpiRow`, `#leadQuickActions`, `#lapsedModsCard` are outside `#card-lead`. They are shown/hidden by `__applyLeadGate` in popup.js (L1311-1316). This works but creates hidden coupling: moving the card requires updating three separate CSS display overrides in JS rather than one card container.
- `#leadSection` inside `#card-lead` has `display:none` gating on `#leadOnlyTools` only. The token input (`leadInput`, `leadSave`) is always visible -- intentional for the chicken-and-egg token paste problem (per v9.6.1 comment). But this means the card has a non-lead-only top section and a lead-only bottom section with no visual transition between them.
- The `srLeadEmptyHint` loading shimmer (L421-424) is a `div` with `display:none` -- it shows "Loading elevated tools..." but has no animation. It is a static text string that happens to appear briefly, not a shimmer.

### A.6 Color semantics absent on KPI tiles

All four KPI values are rendered amber (`#f0a040`). In a Bloomberg-style dense layout, value color must carry status:
- Active Now: green (>= threshold), amber (low), red (0 or error)
- CLR-RATE: green (>= 80%), amber (50-79%), red (< 50%)
- MM p50: green (<= 2h), amber (2-6h), red (> 6h or stub)
- INCIDENTS: green (0), amber (1-2), red (3+)

The current implementation applies only `count < 2 ? '#f0a040' : '#f0a040'` (popup.js L5324) -- the conditional is broken (both branches return the same value). No semantic coloring exists for the other three tiles.

---

## B. Redesign -- Lead Dashboard as Composed Cards

### Design Philosophy

The Lead tab is an operator dashboard, not a settings screen. The mental model is: **scan -> act -> dig**. A lead opens the popup wanting to know the team health state in under 3 seconds, trigger a one-shot action if needed, and close. Deep operations (maintenance, audit) are the exception, not the session.

The redesign applies Bloomberg terminal principles to the 520px popup viewport:
- Information density is maximized by making every pixel carry meaning.
- Color is semantic, not decorative. Amber means caution, red means action required, green means healthy, cyan means informational.
- Structure is hierarchical: KPI strip (always visible, live) > Quick Actions row (always visible, zero-friction one-shots) > Deep-Dive accordion (collapsed by default, opened on demand).

### B.1 Structural layout (top to bottom inside Lead tab)

```
[LEAD CARD HEADER]  -- existing gam-card-head summary, no change

[LEAD TOKEN SECTION]  -- existing leadSection token input, no change
  [leadOnlyTools divider]
  (token input always visible per v9.6.1 rule)

[KPI STRIP]  -- 4 tiles, live data, semantic color, delta arrows
  ACTIVE NOW | CLR-RATE | MM p50 | INCIDENTS

[QUICK ACTIONS BAR]  -- two groups, separated by divider
  [IMMEDIATE]  Invite   Rotate
  [PANELS]     Bugs[N]  Maint  Chat

[LAPSED MODS INLINE CHIP]  -- appears only when lapsed_count > 0
  "3 mods lapsed > 21d  [Ping all]"

[DEEP-DIVE ACCORDION]  -- collapsed by default, single <details>
  > Discord DM Rotation
  > Bug Reports [N open]
  > Maintenance Reports (14d)
  > Diagnostics (Audit / Health / Roster / Debt)
  > Settings (Flag TTL, Bug visibility, Llama toggle)
```

### B.2 KPI Strip redesign

Each tile carries: label (9px monospace uppercase) + value (20px tabular bold) + unit suffix + status color + optional delta arrow.

**Data source mapping (what is live vs what is still stub):**

| Tile | Label | Data source | Live? | Unit |
|------|-------|-------------|-------|------|
| ACTIVE NOW | Active Now | `/presence/online` via `modPresencePing` RPC | YES | mods |
| CLR-RATE | Clr Rate | `/mod/stats` `queue_clear_rate_24h` field (WAVE-C) | STUB | % |
| MM p50 | MM p50 | `/mod/stats` `modmail_p50_hours` field (WAVE-C) | STUB | h |
| INCIDENTS | Incidents | hardcoded 0 (mod_incidents V11) | STUB | -- |

The `/mod/stats` endpoint already exists (`background.js:1802`). The redesign hooks CLR-RATE and MM p50 to whatever fields `/mod/stats` returns today, with graceful fallback to `--` when the field is null. This is not a stub -- it is a conditional display. If the field lands later, the tile lights up automatically with no HTML change.

**Semantic color per tile:**

| Tile | Green | Amber | Red |
|------|-------|-------|-----|
| ACTIVE NOW | >= 3 | 1-2 | 0 |
| CLR-RATE | >= 80% | 50-79% | < 50% or null |
| MM p50 | <= 2h | 2h-6h | > 6h or null |
| INCIDENTS | 0 | 1-2 | >= 3 |

**Delta indicator:** A tiny up/down arrow (`+2` / `-1`) stored in `localStorage` keyed by tile ID, comparing last-seen value to current. Reset on popup close. Renders as 9px text next to the value, color-matched to direction (green up = good for active mods, red up = bad for incidents). This requires no new RPC -- it is purely client state.

### B.3 Quick Actions Bar redesign

Two visual groups separated by a 1px vertical divider:

**Group A -- Immediate one-shots (no panel opened):**
- `[+ Invite]` -- calls `adminInviteCreate`, copies to clipboard, shows toast. Eliminates `inviteBtn` in `leadOnlyTools` (duplicate).
- `[Rotate]` -- opens `rotateRosterPanel` inline. Eliminates `rotateRosterBtn` duplicate.

**Group B -- Panel openers:**
- `[Bugs N]` -- opens bug reports panel (badge shows open count). N badge is the source of truth; `qaBugsBadge` is removed and `bugListBadge` is the single badge.
- `[Maint]` -- opens maintenance accordion (replaces the discoverable-only accordion).
- `[Chat]` -- navigates to mod chat. This is the only `<a>` element; it gets `role="button"` and `aria-label` so it reads as a button in the toolbar.

Group A and B are separated by a `::after` pseudo-element vertical rule (`1px solid var(--bb-line-hot)`) so the split is visual, not a DOM element.

### B.4 Lapsed Mods Inline Chip

Replace the current always-rendered `#lapsedModsCard` (which shows even when empty, burning vertical space) with an inline chip that appears only when `lapsed_count > 0`:

```
LAPSED  3 mods >21d   [Ping all]   [Expand v]
```

Expand reveals the existing `#lapsedModsList` scroll panel inline. Zero vertical space when clean.

### B.5 Deep-Dive Accordion (single collapsed `<details>`)

All panel openers inside one `<details class="gam-lead-deepdive">`:

Each sub-panel is its own nested `<details>` with a summary row that shows the panel title + status chip:

```
> Discord DM Rotation          [last: 3h ago]
> Bug Reports                  [4 open]
> Maintenance Reports          [ok]
> Diagnostics & Audit          [last verified: 2d ago]
> Settings                     --
```

Collapsed by default. The Quick Actions bar `[Maint]` button toggles `#gam-lead-deepdive` open and scrolls to the maintenance sub-panel.

This eliminates the `leadSettingsAccordion` `<details>` and replaces it with a structured deep-dive container that separates concerns.

---

## C. Live Data -- KPI Tiles Must Show Actual Numbers

### C.1 Active Now (already live, bug fix required)

`popup.js:5324` has a broken conditional:
```js
// CURRENT (broken -- both branches return #f0a040):
el.style.color = count === 0 ? '#f04040' : count < 2 ? '#f0a040' : '#f0a040';
```

Correct logic using semantic tokens:
```js
el.style.color = count === 0
  ? 'var(--bb-red)'
  : count < 3
    ? 'var(--bb-warn)'
    : 'var(--bb-green)';
```

### C.2 CLR-RATE and MM p50 -- hook to /mod/stats

`modStats` RPC already exists. The redesign adds two lines to `__loadLeadKpi`:
```js
const stats = await popupRpc('modStats', {});
if (stats && stats.ok && stats.data) {
  const clr = stats.data.queue_clear_rate_24h;  // number 0-100 or null
  const p50 = stats.data.modmail_p50_hours;      // number or null
  setKpiTile('kpi-clearrate', clr != null ? Math.round(clr) + '%' : null, clrColor(clr));
  setKpiTile('kpi-mmp50',     p50 != null ? p50.toFixed(1) + 'h' : null, p50Color(p50));
}
```

If the field is null today (WAVE-C not yet deployed), `setKpiTile` shows `--` with `color:var(--bb-ink-faint)` -- visually distinct from an amber stub value. When WAVE-C ships, the tiles light up automatically.

### C.3 INCIDENTS -- derive from /mod/stats until mod_incidents ships

`/mod/stats` likely returns a pending_flags count or similar aggregate. Until `mod_incidents` lands, map the closest available proxy field to INCIDENTS, labeled as "(approx)" in the tooltip. Tooltip text: `"Open incidents -- approximate from flag queue until V11 mod_incidents table ships."` Zero is shown as `0` in green, not `--`.

### C.4 Delta tracking (client-side, no RPC)

```js
function updateKpiDelta(tileId, newVal) {
  const key = 'gam_kpi_prev_' + tileId;
  const prev = sessionStorage.getItem(key);
  sessionStorage.setItem(key, String(newVal));
  if (prev === null) return '';
  const diff = newVal - Number(prev);
  if (diff === 0) return '';
  return (diff > 0 ? '+' : '') + diff;
}
```

Delta rendered as `<span class="gam-kpi-delta">+2</span>` adjacent to value. Color: green delta for Active Now increasing, red delta for Incidents increasing. Inverted for CLR-RATE and MM p50.

---

## D. Visual Mockup (ASCII, 520px viewport)

```
+----------------------------------------------------------+
| [LEAD CARD HEADER]  Crown Lead                  [v]      |
+----------------------------------------------------------+
| Lead Mod Token  [••••••••••••••••••••••••]  [Save]       |
| -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- |
| LEAD TOOLS                                               |
+--LIVE KPI STRIP-----------------------------------------+
|  ACTIVE NOW   | CLR-RATE   | MM p50     | INCIDENTS     |
|  [GREEN]  4   |  [AMB] --  | [AMB] --   | [GRN]   0    |
|        +1     |            |            |               |
+--QUICK ACTIONS------------------------------------------+
|  [+Invite]  [Rotate]  |  [Bugs 4]  [Maint]  [Chat ->]  |
+--LAPSED (only if > 0)----------------------------------+
|  LAPSED  3 mods >21d                    [Ping all] [v]  |
+--DEEP-DIVE (collapsed)----------------------------------+
|  > Discord DM Rotation           [last: 3h ago]   [>]  |
|  > Bug Reports                   [4 open]          [>]  |
|  > Maintenance Reports           [ok]              [>]  |
|  > Diagnostics & Audit           [verified: 2d]    [>]  |
|  > Settings                                        [>]  |
+----------------------------------------------------------+
```

KPI strip detail zoom:
```
+------------------+
| ACTIVE NOW       |  <- 9px mono uppercase, color: var(--bb-ink-faint)
|   4           +1 |  <- 20px bold tabular, color: var(--bb-green)
|                  |     delta: 9px, color: var(--bb-green)
+------------------+

+------------------+
| CLR-RATE         |
|   --             |  <- value: var(--bb-ink-faint) when null (no endpoint)
+------------------+

+------------------+
| INCIDENTS        |
|   0              |  <- color: var(--bb-green) when 0
+------------------+
```

Quick Actions bar detail:
```
+--[+Invite]--[Rotate]--+--[Bugs 4]--[Maint]--[Chat ->]--+
                        ^
                  1px solid var(--bb-line-hot) divider
```

Deep-dive accordion (expanded):
```
+--DISCORD DM ROTATION------------------------------------+
|  last rotation:  3h ago      [Run rotation now]        |
|  [roster panel inline]                                  |
+--BUG REPORTS--------------------------------------------+
|  [4 open] filter:[all v]  [Open bug reports]           |
|  [bugListPanel inline]                                  |
+--MAINTENANCE REPORTS (14d)------------------------------+
|  severity:[all v]  [List reports]  [Run now]           |
|  [maintReportsPanel inline]                             |
+--DIAGNOSTICS & AUDIT------------------------------------+
|  [Audit chain verify]     [status...]                  |
|  [Full health report]     [status...]                  |
|  [Roster staleness audit] [status...]                  |
|  [Migration debt scanner] [status...]                  |
+--SETTINGS-----------------------------------------------+
|  Flag expiry (days): [30]  [Save]                      |
|  Bug report visibility: [leads]  [Save]                |
|  Auto-run weekly + LLM: [enabled v]  [Save]            |
+----------------------------------------------------------+
```

---

## E. CSS Specification

All rules use existing `--bb-*` token system. No new tokens required except `--gam-kpi-h` (tile height).

### E.1 KPI Strip

```css
/* E.1.1 -- KPI strip container */
#leadKpiRow {
  display: none;           /* JS sets to grid when isFullLead */
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border: 1px solid var(--bb-line-hot);
  border-radius: 0;
  margin: var(--bb-s4) 0 0;
  background: var(--bb-sunken);
}

/* E.1.2 -- Individual KPI tile */
.gam-kpi-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: var(--bb-s3) var(--bb-s2);
  min-height: 52px;
  background: var(--bb-sunken);
  border-right: 1px solid var(--bb-line-hot);
  cursor: pointer;
  transition: background var(--gam-dur-micro) var(--gam-ease-decelerate);
  position: relative;
}
.gam-kpi-tile:last-child { border-right: none; }
.gam-kpi-tile:hover { background: var(--bb-hover); }
.gam-kpi-tile:active { background: var(--bb-active); }

/* E.1.3 -- KPI label row */
.gam-kpi-label {
  font: 600 var(--bb-t-xs)/1.2 var(--bb-font);
  color: var(--bb-ink-faint);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: var(--bb-s1);
}

/* E.1.4 -- KPI value */
.gam-kpi-val {
  font: 700 var(--bb-t-xxl)/1 var(--bb-font);
  color: var(--bb-ink);           /* JS overrides with semantic color */
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

/* E.1.5 -- KPI delta chip */
.gam-kpi-delta {
  font: 500 var(--bb-t-xs)/1 var(--bb-font);
  margin-left: var(--bb-s1);
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
}

/* E.1.6 -- Loading state: pulse on --bb-ink-faint value */
.gam-kpi-tile[data-loading="true"] .gam-kpi-val {
  animation: kpi-pulse 1.2s ease-in-out infinite;
  color: var(--bb-ink-faint) !important;
}
@keyframes kpi-pulse {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 0.9; }
}
@media (prefers-reduced-motion: reduce) {
  .gam-kpi-tile[data-loading="true"] .gam-kpi-val { animation: none; }
}
```

### E.2 Quick Actions Bar

```css
/* E.2.1 -- QA bar container */
#leadQuickActions {
  display: none;                /* JS: flex when isFullLead */
  align-items: stretch;
  gap: 0;
  margin: var(--bb-s2) 0 var(--bb-s2);
  border: 1px solid var(--bb-line-hot);
  background: var(--bb-sunken);
}

/* E.2.2 -- QA button (base) */
.gam-qa-btn {
  flex: 1;
  padding: var(--bb-s2) var(--bb-s3);
  font: 600 var(--bb-t-sm)/1.2 var(--bb-font);
  color: var(--bb-ink-dim);
  background: transparent;
  border: none;
  border-right: 1px solid var(--bb-line);
  cursor: pointer;
  text-align: center;
  transition: background var(--gam-dur-micro) var(--gam-ease-decelerate),
              color var(--gam-dur-micro) var(--gam-ease-decelerate);
  text-decoration: none;        /* covers <a> role=button */
}
.gam-qa-btn:hover {
  background: var(--bb-hover);
  color: var(--bb-ink);
}
.gam-qa-btn:active { background: var(--bb-active); }
.gam-qa-btn:last-child { border-right: none; }

/* E.2.3 -- Group separator (between Rotate and Bugs) */
.gam-qa-sep {
  width: 1px;
  background: var(--bb-line-hot);
  flex-shrink: 0;
}

/* E.2.4 -- Badge inside QA button */
.gam-qa-badge {
  display: inline-block;
  background: var(--bb-red);
  color: #fff;
  font: 600 var(--bb-t-xs)/1.2 var(--bb-font);
  padding: 0 var(--bb-s2);
  margin-left: var(--bb-s1);
  border-radius: 0;
  min-width: 16px;
  text-align: center;
}
```

### E.3 Lapsed Mods Chip (replaces #lapsedModsCard always-rendered card)

```css
/* E.3.1 -- Lapsed chip -- hidden until JS sets display:flex */
#lapsedModsChip {
  display: none;               /* JS: flex when lapsed_count > 0 */
  align-items: center;
  gap: var(--bb-s3);
  padding: var(--bb-s2) var(--bb-s4);
  background: var(--bb-amber-bg);
  border: 1px solid var(--bb-amber-dim);
  border-left: 3px solid var(--bb-amber);
  margin: 0 0 var(--bb-s2);
  font: var(--bb-t-sm)/1.3 var(--bb-font);
  color: var(--bb-warn);
}
#lapsedModsChip .chip-label { flex: 1; }
#lapsedModsChip .chip-expand {
  background: transparent;
  border: 1px solid var(--bb-amber-dim);
  color: var(--bb-warn);
  padding: 1px var(--bb-s3);
  cursor: pointer;
  font: inherit;
}
#lapsedModsChip .chip-expand:hover { background: var(--bb-hover); }

/* E.3.2 -- Lapsed detail panel (revealed by expand toggle) */
#lapsedModsPanel {
  display: none;
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--bb-line-hot);
  border-top: none;
  background: var(--bb-sunken);
  margin-bottom: var(--bb-s2);
}
```

### E.4 Deep-Dive Accordion

```css
/* E.4.1 -- Deep-dive outer <details> */
.gam-lead-deepdive {
  border: 1px solid var(--bb-line-hot);
  margin-top: var(--bb-s2);
}
.gam-lead-deepdive > summary {
  list-style: none;
  display: flex;
  align-items: center;
  gap: var(--bb-s3);
  padding: var(--bb-s2) var(--bb-s4);
  background: var(--bb-panel);
  cursor: pointer;
  font: 600 var(--bb-t-sm)/1.2 var(--bb-font);
  color: var(--bb-amber);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--bb-line);
  user-select: none;
}
.gam-lead-deepdive > summary:hover { background: var(--bb-hover); }
.gam-lead-deepdive > summary::after {
  content: "[+]";
  margin-left: auto;
  font-size: var(--bb-t-xs);
  color: var(--bb-ink-faint);
}
.gam-lead-deepdive[open] > summary::after { content: "[-]"; }

/* E.4.2 -- Sub-panel <details> inside deepdive */
.gam-lead-sub {
  border-bottom: 1px solid var(--bb-line);
}
.gam-lead-sub:last-child { border-bottom: none; }
.gam-lead-sub > summary {
  list-style: none;
  display: flex;
  align-items: center;
  gap: var(--bb-s3);
  padding: var(--bb-s2) var(--bb-s4);
  cursor: pointer;
  font: 500 var(--bb-t-sm)/1.2 var(--bb-font);
  color: var(--bb-ink-dim);
  background: var(--bb-bg);
  user-select: none;
}
.gam-lead-sub > summary:hover { background: var(--bb-hover); color: var(--bb-ink); }
.gam-lead-sub > summary .sub-status {
  margin-left: auto;
  font: var(--bb-t-xs)/1 var(--bb-font);
  color: var(--bb-ink-faint);
}
.gam-lead-sub > .sub-body {
  padding: var(--bb-s3) var(--bb-s4);
  background: var(--bb-sunken);
  border-top: 1px solid var(--bb-line);
}
```

---

## F. HTML Structure (full redesigned Lead section)

This is the target HTML. The existing `#leadSection` / `#leadOnlyTools` remain intact (needed for the token input flow). What changes:

1. `#leadKpiRow` moves inside `#card-lead` under `#leadOnlyTools`
2. `#leadQuickActions` moves inside `#card-lead` under the KPI row
3. `#lapsedModsCard` is replaced by `#lapsedModsChip` + `#lapsedModsPanel`
4. `#leadSettingsAccordion` is promoted to `#gam-lead-deepdive` with structured sub-panels

```html
<!-- CARD: Lead --------------------------------------------------------- -->
<details class="gam-card" id="card-lead" open>
  <summary class="gam-card-head">
    <span class="gam-card-chevron" aria-hidden="true"></span>
    <span class="gam-card-title">&#x1F451; Lead</span>
    <span class="gam-card-badge" id="card-badge-lead" style="display:none"></span>
  </summary>
  <div class="gam-card-body">

    <!-- Lead token input (always visible for token-paste flow) -->
    <div class="pop-token" id="leadSection">
      <label for="leadInput">&#x1F451; Lead Mod Token</label>
      <div class="pop-token-hint">Lead-only: rotation roster, invite generation, mod HUD</div>
      <input id="leadInput" type="password" placeholder="lead-mod token -- enables HUD + invites">
      <button id="leadSave" class="pop-btn pop-btn-ghost">Save</button>
      <div id="leadStatus" class="pop-token-status"></div>

      <!-- Lead-only tools (gated by __applyLeadGate) -->
      <div id="leadOnlyTools" style="display:none">
        <div id="srLeadEmptyHint" style="display:none" class="gam-shimmer-hint">
          Loading elevated tools...
        </div>

        <!-- [1] KPI Strip (moved inside card, inside leadOnlyTools) -->
        <div id="leadKpiRow" style="display:none"
             role="list" aria-label="Lead KPI metrics">

          <div class="gam-kpi-tile" id="kpi-active" data-kpi="active"
               role="listitem" tabindex="0"
               title="Active mods (presence ping last 5m). Click to list.">
            <div class="gam-kpi-label">ACTIVE NOW</div>
            <div class="gam-kpi-value-row">
              <span id="kpi-active-val" class="gam-kpi-val">&mdash;</span>
              <span id="kpi-active-delta" class="gam-kpi-delta"></span>
            </div>
          </div>

          <div class="gam-kpi-tile" id="kpi-clearrate" data-kpi="clearrate"
               role="listitem" tabindex="0"
               title="Queue clear-rate 24h. From /mod/stats queue_clear_rate_24h.">
            <div class="gam-kpi-label">CLR-RATE</div>
            <div class="gam-kpi-value-row">
              <span id="kpi-clearrate-val" class="gam-kpi-val">&mdash;</span>
              <span id="kpi-clearrate-delta" class="gam-kpi-delta"></span>
            </div>
          </div>

          <div class="gam-kpi-tile" id="kpi-mmp50" data-kpi="mmp50"
               role="listitem" tabindex="0"
               title="Modmail p50 response latency. From /mod/stats modmail_p50_hours.">
            <div class="gam-kpi-label">MM p50</div>
            <div class="gam-kpi-value-row">
              <span id="kpi-mmp50-val" class="gam-kpi-val">&mdash;</span>
              <span id="kpi-mmp50-delta" class="gam-kpi-delta"></span>
            </div>
          </div>

          <div class="gam-kpi-tile" id="kpi-incidents" data-kpi="incidents"
               role="listitem" tabindex="0"
               title="Open incidents (approx from flag queue until V11 mod_incidents).">
            <div class="gam-kpi-label">INCIDENTS</div>
            <div class="gam-kpi-value-row">
              <span id="kpi-incidents-val" class="gam-kpi-val">0</span>
              <span id="kpi-incidents-delta" class="gam-kpi-delta"></span>
            </div>
          </div>

        </div><!-- /#leadKpiRow -->

        <!-- [2] Quick Actions Bar -->
        <div id="leadQuickActions" style="display:none"
             role="toolbar" aria-label="Lead quick actions">

          <!-- Group A: Immediate one-shots -->
          <button id="qaInviteBtn" class="gam-qa-btn"
                  title="Generate invite link and copy to clipboard.">
            + Invite
          </button>
          <button id="qaRotateAllBtn" class="gam-qa-btn"
                  title="Open mod rotation roster.">
            Rotate
          </button>

          <!-- Group separator -->
          <div class="gam-qa-sep" role="separator" aria-orientation="vertical"></div>

          <!-- Group B: Panel openers -->
          <button id="qaBugsBtn" class="gam-qa-btn"
                  title="Open bug reports panel."
                  aria-haspopup="true">
            Bugs
            <span id="qaBugsBadge" class="gam-qa-badge" style="display:none"
                  aria-label="open bug reports"></span>
          </button>

          <button id="qaMaintBtn" class="gam-qa-btn"
                  title="Open maintenance & diagnostics."
                  aria-haspopup="true">
            Maint
          </button>

          <a id="qaChatBtn" class="gam-qa-btn"
             href="https://greatawakening.win/mod/chat" target="_blank"
             rel="noopener noreferrer"
             role="button"
             aria-label="Open ModChat in new tab"
             title="ModChat (new tab)">
            Chat &#x2197;
          </a>

        </div><!-- /#leadQuickActions -->

        <!-- [3] Lapsed Mods Chip (replaces #lapsedModsCard) -->
        <div id="lapsedModsChip" style="display:none"
             aria-live="polite" aria-label="Lapsed mods alert">
          <span class="chip-label">
            LAPSED&nbsp;
            <strong id="lapsedModsCount"></strong>
            &nbsp;mods &gt;21d
          </span>
          <button id="lapsedPingAllBtn" class="pop-btn pop-btn-ghost"
                  style="font-size:10px;padding:2px 6px">Ping all</button>
          <button id="lapsedExpandBtn" class="chip-expand"
                  aria-expanded="false"
                  aria-controls="lapsedModsPanel">Expand</button>
          <label for="lapsedThresholdInput"
                 style="font-size:10px;color:var(--bb-ink-faint)">Threshold:</label>
          <input id="lapsedThresholdInput" type="number" min="7" max="60" value="21"
                 style="width:40px;padding:2px 4px;background:var(--bb-sunken);
                        color:var(--bb-ink);border:1px solid var(--bb-line-hot);
                        font:inherit;font-size:10px">
        </div>
        <div id="lapsedModsPanel" style="display:none"
             aria-label="Lapsed mods list"></div>
        <div id="lapsedModsStatus" class="pop-token-status"></div>

        <!-- [4] Deep-Dive Accordion -->
        <details class="gam-lead-deepdive" id="gam-lead-deepdive">
          <summary>Deep Dive</summary>

          <!-- 4a. Discord DM Rotation -->
          <details class="gam-lead-sub" id="lead-sub-rotation">
            <summary>
              Discord DM Rotation
              <span class="sub-status" id="lead-sub-rotation-status"></span>
            </summary>
            <div class="sub-body">
              <div class="pop-tools" style="margin-top:0">
                <button id="rotateRosterBtn" class="pop-btn pop-btn-ghost">
                  &#x1F465; Mod rotation roster
                </button>
              </div>
              <div id="rotateInviteResult" class="pop-token-status"></div>
              <div id="rotateRosterPanel" style="display:none"></div>
            </div>
          </details>

          <!-- 4b. Bug Reports -->
          <details class="gam-lead-sub" id="lead-sub-bugs">
            <summary>
              Bug Reports
              <span class="sub-status" id="lead-sub-bugs-status">
                <span id="bugListBadge"
                      style="display:none;background:var(--bb-red);color:#fff;
                             padding:0 var(--bb-s2);font-size:10px"></span>
              </span>
            </summary>
            <div class="sub-body">
              <div class="pop-tools" style="margin-top:0;flex-wrap:wrap;gap:var(--bb-s2)">
                <button id="bugListBtn" class="pop-btn pop-btn-ghost" style="font-size:11px">
                  &#x1F41B; Open bug reports
                </button>
              </div>
              <div id="bugListStatus" class="pop-token-status"></div>
              <div id="bugListPanel"
                   style="display:none;max-height:400px;overflow:auto;
                          background:var(--bb-sunken);border:1px solid var(--bb-line-hot);
                          padding:6px;margin:4px 0;font-size:11px"></div>
              <div class="pop-tools" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">
                <label for="bugVisInput"
                       style="font-size:11px;color:var(--bb-ink-dim);flex:1 1 100%">
                  Who can read bug reports? (<code>leads</code> | <code>all</code> | <code>user1,user2</code>)
                </label>
                <input id="bugVisInput" type="text" placeholder="leads"
                       style="flex:1 1 auto;padding:4px 8px;
                              background:var(--bb-sunken);color:var(--bb-ink);
                              border:1px solid var(--bb-line-hot);font:inherit;min-width:140px">
                <button id="bugVisSave" class="pop-btn pop-btn-ghost"
                        style="font-size:11px;padding:4px 8px">Save</button>
              </div>
              <div id="bugVisStatus" class="pop-token-status"></div>
            </div>
          </details>

          <!-- 4c. Maintenance Reports -->
          <details class="gam-lead-sub" id="lead-sub-maintreports">
            <summary>
              Maintenance Reports (14d)
              <span class="sub-status" id="lead-sub-maintreports-status"></span>
            </summary>
            <div class="sub-body">
              <div class="pop-tools" style="margin-top:0;align-items:center;gap:8px;flex-wrap:wrap">
                <button id="maintReportsList" class="pop-btn pop-btn-ghost"
                        title="Last 14 days of weekly maintenance reports. Click row to expand.">
                  &#x1F4CA; List reports
                </button>
                <select id="maintReportsSeverity"
                        style="padding:4px 8px;background:var(--bb-sunken);
                               color:var(--bb-ink);border:1px solid var(--bb-line-hot);
                               font:inherit;font-size:11px">
                  <option value="">all severities</option>
                  <option value="ok">ok</option>
                  <option value="info">info</option>
                  <option value="warning">warning</option>
                  <option value="critical">critical</option>
                </select>
                <button id="maintRunNow" class="pop-btn pop-btn-ghost"
                        style="font-size:11px;padding:4px 8px"
                        title="Force a weekly run now (dev/smoke test).">
                  &#x26A1; Run now
                </button>
              </div>
              <div id="maintReportsStatus" class="pop-token-status"></div>
              <div id="maintReportsPanel"
                   style="display:none;max-height:360px;overflow:auto;
                          background:var(--bb-sunken);border:1px solid var(--bb-line-hot);
                          padding:6px;margin:4px 0;font-size:11px"></div>
            </div>
          </details>

          <!-- 4d. Diagnostics & Audit -->
          <details class="gam-lead-sub" id="lead-sub-diag">
            <summary>
              Diagnostics &amp; Audit
              <span class="sub-status" id="lead-sub-diag-status"></span>
            </summary>
            <div class="sub-body">
              <div class="pop-maint">
                <div class="pop-maint-row">
                  <button id="maintAuditVerify" class="pop-btn pop-btn-ghost"
                          title="Calls /admin/audit/verify.">
                    &#x1F50D; Audit chain verify
                  </button>
                  <div id="maintAuditVerifyStatus" class="pop-token-status pop-maint-status"></div>
                </div>
                <div class="pop-maint-row">
                  <button id="maintFullReport" class="pop-btn pop-btn-ghost"
                          title="All routines + audit verify. ~5s. JSON to clipboard.">
                    &#x1F6E1; Full health report
                  </button>
                  <div id="maintFullReportStatus" class="pop-token-status pop-maint-status"></div>
                </div>
                <div class="pop-maint-row">
                  <button id="maintRosterStaleness" class="pop-btn pop-btn-ghost"
                          title="/admin/mod/list color-coded by days_since_rotated.">
                    &#x1F4CB; Roster staleness
                  </button>
                  <div id="maintRosterStalenessStatus" class="pop-token-status pop-maint-status"></div>
                </div>
                <div id="maintRosterStalenessPanel" style="display:none"></div>
                <div class="pop-maint-row">
                  <button id="maintMigrationDebt" class="pop-btn pop-btn-ghost"
                          title="Scans legacy claim path, env vars, NULL hmac rows.">
                    &#x1F4E6; Migration debt scan
                  </button>
                  <div id="maintMigrationDebtStatus" class="pop-token-status pop-maint-status"></div>
                </div>
              </div>
            </div>
          </details>

          <!-- 4e. Settings -->
          <details class="gam-lead-sub" id="lead-sub-settings">
            <summary>
              Settings
              <span class="sub-status"></span>
            </summary>
            <div class="sub-body">
              <!-- Team settings: flag TTL -->
              <div class="pop-section-label">Team settings</div>
              <div class="pop-tools" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:0">
                <label for="flagTtlInput"
                       style="font-size:11px;color:var(--bb-ink-dim);flex:1 1 auto">
                  Flag expiry (days)
                </label>
                <input id="flagTtlInput" type="number" min="1" max="365" step="1"
                       placeholder="30"
                       style="width:64px;padding:4px 8px;background:var(--bb-sunken);
                              color:var(--bb-ink);border:1px solid var(--bb-line-hot);font:inherit">
                <button id="flagTtlSave" class="pop-btn pop-btn-ghost"
                        style="font-size:11px;padding:4px 8px">Save</button>
              </div>
              <div id="flagTtlStatus" class="pop-token-status"></div>

              <!-- Llama autonomous maintenance -->
              <div class="pop-section-label" style="margin-top:8px">
                &#x1F916; Autonomous maintenance (Llama)
              </div>
              <div class="pop-tools"
                   style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:0">
                <label for="maintAutoToggle"
                       style="font-size:11px;color:var(--bb-ink-dim);flex:1 1 auto">
                  Auto-run weekly + LLM analysis
                </label>
                <select id="maintAutoToggle"
                        style="padding:4px 8px;background:var(--bb-sunken);
                               color:var(--bb-ink);border:1px solid var(--bb-line-hot);
                               font:inherit;font-size:11px">
                  <option value="1">enabled</option>
                  <option value="0">disabled</option>
                </select>
                <button id="maintAutoSave" class="pop-btn pop-btn-ghost"
                        style="font-size:11px;padding:4px 8px">Save</button>
              </div>
              <div id="maintAutoStatus" class="pop-token-status"></div>
            </div>
          </details>

        </details><!-- /#gam-lead-deepdive -->

      </div><!-- /#leadOnlyTools -->
    </div><!-- /#leadSection -->

  </div><!-- /.gam-card-body -->
</details><!-- /#card-lead -->
```

---

## G. Effort Estimate

| Item | Scope | Effort |
|------|-------|--------|
| G.1 CSS: KPI strip rules (E.1) | New rules for `.gam-kpi-*` replacing inline styles | 30 min |
| G.2 CSS: Quick actions bar (E.2) | New rules for `.gam-qa-btn`, `.gam-qa-sep`, `.gam-qa-badge` | 20 min |
| G.3 CSS: Lapsed chip (E.3) | New rules for `#lapsedModsChip`, `#lapsedModsPanel` | 15 min |
| G.4 CSS: Deep-dive accordion (E.4) | New rules for `.gam-lead-deepdive`, `.gam-lead-sub` | 25 min |
| G.5 HTML: Restructure lead card | Move orphan divs into `#card-lead`, replace `#lapsedModsCard` with chip, replace `#leadSettingsAccordion` with `#gam-lead-deepdive` | 45 min |
| G.6 popup.js: KPI bug fix (Active Now color) | 3-line fix in `__loadLeadKpi` | 5 min |
| G.7 popup.js: Hook CLR-RATE + MM p50 to `/mod/stats` | ~20 lines added to `__loadLeadKpi`, two helper fns | 30 min |
| G.8 popup.js: Delta tracking | `updateKpiDelta()` + 4 call sites | 20 min |
| G.9 popup.js: Lapsed chip vs card swap | Replace `lapsedModsCard` show/hide with chip show/hide; wire expand toggle | 20 min |
| G.10 popup.js: Deep-dive wiring | `qaMaintBtn` opens `#gam-lead-deepdive`, scrolls to sub-panel; sync `bugListBadge` -> `qaBugsBadge` removed (single badge now) | 25 min |
| G.11 popup.js: Remove duplicate `inviteBtn`/`rotateRosterBtn` from `#leadOnlyTools` or proxy them | Remove HTML duplicates; ensure existing JS handlers still point to canonical IDs | 20 min |
| G.12 TAB_MAP update: `lead` selector includes new deepdive container | 1-line update to `popup.js TAB_MAP.lead` array | 5 min |
| **Total** | | **~4h** |

### Risk flags

- **ID stability:** The redesign renames no existing IDs. `bugListBtn`, `bugListBadge`, `bugListPanel`, `bugListStatus`, `maintReportsList`, `maintReportsPanel`, `maintReportsStatus`, `maintRunNow`, `maintReportsSeverity`, `rotateRosterBtn`, `rotateRosterPanel`, `rotateInviteResult`, `flagTtlInput`, `flagTtlSave`, `flagTtlStatus`, `maintAutoToggle`, `maintAutoSave`, `maintAutoStatus`, `maintAuditVerify`, `maintAuditVerifyStatus`, `maintFullReport`, `maintFullReportStatus`, `maintRosterStaleness`, `maintRosterStalenessStatus`, `maintRosterStalenessPanel`, `maintMigrationDebt`, `maintMigrationDebtStatus` are all preserved verbatim. All popup.js handlers that reference these IDs continue to work without modification.

- **TAB_MAP:** `popup.js TAB_MAP.lead` is currently `[]` (empty). The redesign requires adding `'#gam-lead-deepdive'`, `'#lapsedModsChip'`, `'#lapsedModsPanel'` to the lead array so the tab visibility gate hides them correctly when not on the Lead tab.

- **`inviteBtn` / `rotateRosterBtn` duplication:** The original `leadOnlyTools` contained `inviteBtn` (Generate invite link) and `rotateRosterBtn` (Mod rotation roster) as standalone buttons. In the redesign these move into `#lead-sub-rotation`. The `qaInviteBtn` in the Quick Actions bar is the primary entry point for invite. The `inviteBtn` in the deep-dive rotation sub-panel should be removed to avoid duplicate RPCs; JS must be verified to only wire `qaInviteBtn`, not also `inviteBtn`. Alternatively, keep both but ensure they share one handler via a named function, not two anonymous listeners.

- **`/mod/stats` field names:** The redesign assumes `queue_clear_rate_24h` and `modmail_p50_hours` as field names on the stats response. These must be confirmed against the worker's actual `/mod/stats` response shape before wiring the tile renders. If the fields are absent, the graceful `null` path renders `--` with faint color -- safe to ship before WAVE-C.
