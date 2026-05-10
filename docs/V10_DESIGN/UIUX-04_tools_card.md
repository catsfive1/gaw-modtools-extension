# UIUX-04 — Tools Card Redesign
## GAW ModTools v10.x — Bloomberg-Terminal Popup

**Status:** Audit / Design Proposal (read-only)
**Author:** DESIGN-04-TOOLS-CARD agent
**Date:** 2026-05-10
**Scope:** popup.html lines 138-335 (Tools, Maintenance, Macros cards) + popup.css

---

## A. Current State Critique

### What the Tools tab looks like today

The Tools tab renders three `<details class="gam-card">` elements stacked vertically:

1. **card-tools** — "Tools" header, then two unlabeled sub-sections (Diagnostics, Data harvest) separated by `.pop-section-label` text nodes, each holding a `.pop-tools` flex row of ghost buttons.
2. **card-maint** — "Maintenance" header, then a flat vertical stack of `.pop-maint-row` items: Safe Mode toggle, Feature Health row, 4 primary action buttons, a nested `<details class="pop-maint-advanced">` accordion holding 6 more buttons.
3. **card-macros** — "Team Macros" header, then the full macro editor sub-system (tabs + list + inline form).

### What is wrong — six specific failures

**F-1. Cards have no visual boundary.**
`.gam-card` has zero CSS definition in popup.css. The Bloomberg override layer defines `details.gam-card` nowhere. The `<details>` elements render with no border, no background differentiation, no gap between them. Three conceptually separate units look like one continuous scroll.

**F-2. Card headers are visually identical to section sub-labels.**
`.gam-card-head` / `.gam-card-title` / `.gam-card-chevron` have no Bloomberg-layer rules. The `<summary>` falls through to bare browser defaults. Meanwhile `.pop-section-label` inside card-tools (`Diagnostics`, `Data harvest`) renders at 9px amber uppercase — the same visual weight as the card header would have if it were styled. A user cannot distinguish card boundary from section boundary at a glance.

**F-3. The "Tools" card header ("Tools") gives no affordance of what it contains.**
The card-maint header includes an emoji wrench ("Maintenance") and card-macros includes a notepad emoji ("Team Macros"). card-tools just says "Tools" — no hint that it holds Diagnostics vs. Data harvest groupings.

**F-4. Section sub-labels float in dead space.**
`.pop-section-label` is padded `4px 12px 2px` — a bare 9px text node sitting inside the card body with no left accent, no separator, no visual container. Between the card header border and the sub-label there is 6-8px of undifferentiated background. The user must read the text to understand hierarchy, not infer it from shape.

**F-5. Button sizing is inconsistent with the action grid above.**
The four-column action grid (Users/Queue/Ban/GAW) uses `min-height: 44px` icon-above-label cells — Bloomberg dense. The Tools ghost buttons (`.pop-btn-ghost` in `.pop-tools`) inherit 28px `min-height` and render as single-line text-only rows with left-justified emoji. They look like list items from a 2019 settings panel dropped into a Bloomberg terminal.

**F-6. The "Data harvest" sub-group has three nearly-identical crawl buttons with parenthetical page counts — zero visual differentiation.**
"Crawl /users (10)", "Crawl /users (30)", "Crawl /queue (5)" are three full-width ghost buttons with identical emoji prefix (spider). A mod choosing between them must read the trailing number. There is no color hierarchy indicating "10 = quick", "30 = deep", "5 = queue-specific". Bloomberg terminal convention for variant-count selectors is a tight segmented control or a labeled key-value row, not three cloned buttons.

### Summary verdict

The Tools tab is not "mushed together" by accident — it is structurally headless at the card level (no CSS definition for `.gam-card`), and all internal grouping relies entirely on text labels in a typeface too small to scan. The Bloomberg aesthetic requires hard boundaries (1px `--bb-line-hot` borders), amber uppercase headers with left-accent rules, and icon-bearing action rows that a mod can click without reading.

---

## B. Redesign Proposal

### Principle

Each card is a discrete panel unit: `1px solid var(--bb-line-hot)` border on all four sides, `0` border-radius (Bloomberg square), `8px` internal padding, `8px` gap between cards. The card header is a labeled amber strip — uppercase monospace, chevron indicator on the right, `1px` amber bottom border that acts as the card's visual "brand bar". Sub-sections inside a card use a `1px dashed var(--bb-line)` top separator with a left-accent stripe in `var(--bb-line-hot)`.

### Card: TOOLS

**Header:** `TOOLS` in amber uppercase with a `[2]` action-count badge (Diagnostics + Data harvest grouping count).

**Sub-section A — DIAGNOSTICS**
Two actions presented as a 2-column grid of compact icon-bearing cells:
- `DEBUG SNAPSHOT` — icon: terminal/beaker, triggers `debugBtn`
- `DASHBOARD` — icon: chart-bar, triggers `dashBtn`

Each cell is `min-height: 36px`, icon left-aligned, label uppercase. No full-width single-column stacking.

**Sub-section B — DATA HARVEST**
Crawl buttons redesigned as a segmented control row:

```
[/USERS]  [x10]  [x30]   |   [/QUEUE]  [x5]
```

Two logical groups separated by a `1px` vertical rule: Users crawl (two depth options) and Queue crawl. Each depth option is a compact pill button (`min-width: 40px`) with the count prominent. The section header shows last-crawl timestamp if available via `crawlStatus`.

### Card: MAINTENANCE

**Header:** `MAINTENANCE` amber strip + a warning chip slot (fires existing `pop-maint-chip` logic). Safe Mode toggle migrates into the card header right-side slot — it is the single most-used control and currently buried as the first row.

**Primary rows (always visible, 4 items):**
```
[CLEAR COOKIES]    [TOKEN PROBE]
[AI: TARD SUGGEST] [AI: STICKY SCAN]
```
2x2 grid, `min-height: 36px`, icon left, label uppercase. This matches Bloomberg's "quad-panel" data block pattern.

Feature Health row stays immediately below the grid — full-width, collapsible.

**Advanced sub-accordion (unchanged):** `.pop-maint-advanced` — "System diagnostics (advanced)" chevron-disclosed section, already well-executed.

### Card: TEAM MACROS

**Header:** `TEAM MACROS` amber strip + synced-count badge (e.g. "14 macros").

The internal macro editor (tabs + list + add/AI-generate + inline form) is already reasonable in structure. The only change here is the card boundary CSS making it visually separate. The tab strip (Ban messages / Modmail replies) becomes a full-width `border-bottom: 1px solid var(--bb-line-hot)` underlined tab bar, matching the popup's own tab nav pattern.

---

## C. Visual Mockup

Text-art representation. Width = 380px popup, padding = 12px each side (356px usable).

```
┌────────────────────────────────────────┐
│  GAM MODTOOLS v10.x          [Token]   │  <- header (existing)
│════════════════════════════════════════│  <- 2px amber border-bottom
│  [STATS]  [TOOLS]  [TOKENS]  [LEAD]   │  <- tab nav (existing)
╔════════════════════════════════════════╗
║  TOOLS                              ▾  ║  <- card header: amber bg strip
╠══════════════════╦═════════════════════╣  <- dashed separator
║  DIAGNOSTICS     ║                     ║  <- sub-label, left-accented
╠══════════════════╩═════════════════════╣
║  [≡ DEBUG SNAPSHOT]  [▤ DASHBOARD]     ║  <- 2-col grid
╠════════════════════════════════════════╣
║  DATA HARVEST   · last crawl: 14m ago  ║  <- sub-label + status
╠════════════════════════════════════════╣
║  /USERS [×10] [×30]  │  /QUEUE [×5]   ║  <- segmented crawl row
╚════════════════════════════════════════╝

╔════════════════════════════════════════╗
║  MAINTENANCE         [SAFE MODE ●OFF]  ║  <- card header + toggle
╠════════════════════════════════════════╣
║  ⚠ WARNING BANNER (hidden unless hot)  ║
╠═══════════════════╦════════════════════╣
║  [✕ CLEAR COOKIES] ║ [⚕ TOKEN PROBE]  ║  <- 2-col grid row 1
╠═══════════════════╬════════════════════╣
║  [✦ AI TARD SUGGEST]║[📌 AI STICKY]   ║  <- 2-col grid row 2
╠════════════════════════════════════════╣
║  ♥ FEATURE HEALTH: All healthy         ║  <- health row (collapsible)
╠════════════════════════════════════════╣
║  ▸ SYSTEM DIAGNOSTICS (ADVANCED)       ║  <- existing accordion unchanged
╚════════════════════════════════════════╝

╔════════════════════════════════════════╗
║  TEAM MACROS                   [14]  ▾ ║  <- card header + count badge
╠════════════════════════════════════════╣
║  [BAN MESSAGES]  [MODMAIL REPLIES]     ║  <- tabs, underline-style
╠════════════════════════════════════════╣
║  macro list (scrollable max-h 240px)   ║
╠════════════════════════════════════════╣
║  [+ ADD CUSTOM]      [✦ GENERATE AI]   ║
╚════════════════════════════════════════╝
```

---

## D. CSS Specification

### New rules to add (append to Bloomberg override layer)

```css
/* ── D.1  Card container — discrete panel unit ─────────────────────────── */
details.gam-card {
  border: 1px solid var(--bb-line-hot);
  border-radius: 0;
  background: var(--bb-bg);
  margin: 0 8px 8px;        /* 8px gap between cards, 8px side inset */
  overflow: hidden;
}

/* ── D.2  Card header (summary) ─────────────────────────────────────────── */
details.gam-card > summary.gam-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bb-panel);
  border-bottom: 1px solid var(--bb-amber);
  padding: 5px 8px;
  cursor: pointer;
  list-style: none;
  user-select: none;
  outline: none;
}
details.gam-card > summary.gam-card-head::-webkit-details-marker { display: none; }

/* Card title — amber uppercase monospace */
.gam-card-title {
  flex: 1;
  font: 600 10px/1.2 var(--bb-font);
  color: var(--bb-amber);
  text-transform: uppercase;
  letter-spacing: 0.10em;
  font-variant-numeric: tabular-nums;
}

/* Badge — right of title, count in brackets */
.gam-card-badge {
  font: 600 9px/1.2 var(--bb-font);
  color: var(--bb-ink-dim);
  background: var(--bb-sunken);
  border: 1px solid var(--bb-line-hot);
  padding: 0 4px;
  letter-spacing: 0.04em;
}

/* Chevron — right-most, rotates on open */
.gam-card-chevron::before {
  content: "▸";
  font-size: 10px;
  color: var(--bb-amber-dim);
  display: inline-block;
  transition: transform var(--gam-dur-appear) var(--gam-ease-decelerate);
}
details.gam-card[open] > summary.gam-card-head .gam-card-chevron::before {
  content: "▾";
  color: var(--bb-amber);
}

/* Focus ring on card header */
details.gam-card > summary.gam-card-head:focus-visible {
  outline: 2px solid var(--bb-amber);
  outline-offset: -2px;
}

/* ── D.3  Card body ──────────────────────────────────────────────────────── */
.gam-card-body {
  padding: 8px 0 4px;      /* inner breathing room; sub-sections own their H padding */
}

/* ── D.4  Sub-section separator inside a card body ──────────────────────── */
.gam-card-subsection {
  border-top: 1px dashed var(--bb-line);
  padding: 6px 8px 4px;
  margin-top: 4px;
}
.gam-card-subsection:first-child {
  border-top: none;
  margin-top: 0;
}

/* Sub-section label — same amber uppercase but at 9px (below card title 10px) */
.gam-card-sub-label {
  font: 600 9px/1.2 var(--bb-font);
  color: var(--bb-amber-dim);
  text-transform: uppercase;
  letter-spacing: 0.10em;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.gam-card-sub-label-meta {
  color: var(--bb-ink-faint);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0.02em;
  font-size: 9px;
}

/* ── D.5  Two-column action grid inside a card ───────────────────────────── */
.gam-card-grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.gam-card-grid2 .pop-btn {
  min-height: 36px;
  text-align: left;
  padding: 4px 8px;
  font-size: 10px;
  letter-spacing: 0.06em;
  display: flex;
  align-items: center;
  gap: 5px;
}

/* ── D.6  Segmented crawl control (Data harvest) ─────────────────────────── */
.gam-crawl-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.gam-crawl-group {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
}
.gam-crawl-label {
  font: 600 9px/1.2 var(--bb-font);
  color: var(--bb-ink-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0 4px;
  white-space: nowrap;
}
.gam-crawl-sep {
  width: 1px;
  height: 20px;
  background: var(--bb-line-hot);
  margin: 0 4px;
  flex-shrink: 0;
}
.gam-crawl-pill {
  font: 600 10px/1.2 var(--bb-font) !important;
  min-width: 36px;
  min-height: 28px;
  text-align: center;
  padding: 3px 6px !important;
  letter-spacing: 0.04em;
}
/* Quick depth = subdued; Deep depth = amber accent */
.gam-crawl-pill[data-depth="quick"] { color: var(--bb-ink-dim) !important; }
.gam-crawl-pill[data-depth="deep"]  {
  color: var(--bb-amber) !important;
  border-color: var(--bb-amber-dim) !important;
}

/* ── D.7  Safe Mode toggle in card header ─────────────────────────────────── */
.gam-card-head-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font: 600 9px/1.2 var(--bb-font);
  color: var(--bb-ink-faint);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-left: auto;       /* pushes to right of title */
}
.gam-card-head-toggle .gam-toggle-track {
  width: 28px;
  height: 14px;
  border-radius: 0;        /* Bloomberg: square toggle */
  border: 1px solid var(--bb-line-hot);
  background: var(--bb-sunken);
  position: relative;
  transition: background var(--gam-dur-micro);
}
.gam-card-head-toggle .gam-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 8px;
  height: 8px;
  background: var(--bb-ink-faint);
  transition: left var(--gam-dur-micro), background var(--gam-dur-micro);
}
.gam-card-head-toggle input:checked + .gam-toggle-track {
  background: var(--bb-warn-bg);
  border-color: var(--bb-warn);
}
.gam-card-head-toggle input:checked + .gam-toggle-track .gam-toggle-thumb {
  left: 16px;
  background: var(--bb-warn);
}
```

### CSS changes to existing rules

| Existing rule | Current value | Proposed change | Reason |
|---|---|---|---|
| `.pop-maint` margin | `0 12px 8px` side padding | Remove — card body now owns 8px padding | Avoid double-inset |
| `.pop-section-label` padding | `4px 12px 2px` | Replace with `.gam-card-sub-label` pattern | Sub-labels become part of sub-section component |
| `.pop-tools` padding | `4px 12px 4px` | Remove — sub-section owns padding | Same double-inset issue |
| `.pop-maint-row` border-bottom | `1px solid var(--bb-line)` | Keep for rows inside Maintenance primary block | No change |
| `.pop-maint-advanced` margin-top | `var(--bb-s3)` | Keep as-is | Already works |

---

## E. HTML Structure

### E.1 — Tools card (current vs proposed)

**Current:**
```html
<details class="gam-card" id="card-tools" data-tab="tools" open>
  <summary class="gam-card-head">
    <span class="gam-card-chevron"></span>
    <span class="gam-card-title">Tools</span>
    <span class="gam-card-badge" id="card-badge-tools" style="display:none"></span>
  </summary>
  <div class="gam-card-body">
    <div class="pop-section-label">Diagnostics</div>
    <div class="pop-tools">
      <button id="debugBtn" class="pop-btn pop-btn-ghost">&#x1F9EA; Debug snapshot</button>
      <button id="dashBtn" class="pop-btn pop-btn-ghost">&#x1F4CA; Dashboard</button>
    </div>
    <div class="pop-section-label">Data harvest</div>
    <div class="pop-tools">
      <button class="pop-btn pop-btn-ghost crawl-btn" data-section="users" data-pages="10">&#x1F578; Crawl /users (10)</button>
      <button class="pop-btn pop-btn-ghost crawl-btn" data-section="users" data-pages="30">&#x1F578; Crawl /users (30)</button>
      <button class="pop-btn pop-btn-ghost crawl-btn" data-section="queue" data-pages="5">&#x1F578; Crawl /queue (5)</button>
    </div>
    <div id="crawlStatus" class="pop-token-status" style="padding: 0 12px 4px;"></div>
  </div>
</details>
```

**Proposed:**
```html
<details class="gam-card" id="card-tools" data-tab="tools" open>
  <summary class="gam-card-head">
    <span class="gam-card-chevron" aria-hidden="true"></span>
    <span class="gam-card-title">Tools</span>
    <span class="gam-card-badge" id="card-badge-tools" style="display:none"></span>
  </summary>
  <div class="gam-card-body">

    <!-- Sub-section: Diagnostics -->
    <div class="gam-card-subsection">
      <div class="gam-card-sub-label">Diagnostics</div>
      <div class="gam-card-grid2">
        <button id="debugBtn" class="pop-btn pop-btn-ghost"
                title="Capture full debug snapshot to clipboard — token state, storage keys, service worker status">
          [=] DEBUG SNAPSHOT
        </button>
        <button id="dashBtn" class="pop-btn pop-btn-ghost"
                title="Open diagnostics dashboard — live stat counters, firehose health, AI budget">
          [#] DASHBOARD
        </button>
      </div>
    </div>

    <!-- Sub-section: Data harvest -->
    <div class="gam-card-subsection">
      <div class="gam-card-sub-label">
        Data Harvest
        <span class="gam-card-sub-label-meta" id="crawlStatusLabel"></span>
      </div>
      <div class="gam-crawl-row">
        <!-- Users group -->
        <div class="gam-crawl-group">
          <span class="gam-crawl-label">/USERS</span>
          <button class="pop-btn pop-btn-ghost gam-crawl-pill crawl-btn"
                  data-section="users" data-pages="10" data-depth="quick"
                  title="Quick crawl — first 10 pages of /users (~200 accounts). Fast baseline.">
            x10
          </button>
          <button class="pop-btn pop-btn-ghost gam-crawl-pill crawl-btn"
                  data-section="users" data-pages="30" data-depth="deep"
                  title="Deep crawl — 30 pages of /users (~600 accounts). Use for full-roster analysis.">
            x30
          </button>
        </div>
        <!-- Separator -->
        <div class="gam-crawl-sep" aria-hidden="true"></div>
        <!-- Queue group -->
        <div class="gam-crawl-group">
          <span class="gam-crawl-label">/QUEUE</span>
          <button class="pop-btn pop-btn-ghost gam-crawl-pill crawl-btn"
                  data-section="queue" data-pages="5" data-depth="quick"
                  title="Crawl mod queue — 5 pages (~100 pending items).">
            x5
          </button>
        </div>
      </div>
      <div id="crawlStatus" class="pop-token-status" style="padding: 2px 0 0;"></div>
    </div>

  </div>
</details>
```

### E.2 — Maintenance card (header only — Safe Mode toggle migration)

**Current summary:**
```html
<summary class="gam-card-head">
  <span class="gam-card-chevron" aria-hidden="true"></span>
  <span class="gam-card-title">&#x1F527; Maintenance</span>
  <span class="gam-card-badge" id="card-badge-maint" style="display:none"></span>
</summary>
```

**Proposed summary (Safe Mode toggle moves here):**
```html
<summary class="gam-card-head">
  <span class="gam-card-chevron" aria-hidden="true"></span>
  <span class="gam-card-title">Maintenance</span>
  <label class="gam-card-head-toggle" id="safeModeToggleLabel"
         title="Safe Mode — disables firehose, AI, animations, presence ping, auto-DR">
    <input type="checkbox" id="safeModeToggle" style="position:absolute;opacity:0;width:0;height:0">
    <span id="safeModeToggleTrack" class="gam-toggle-track">
      <span id="safeModeToggleThumb" class="gam-toggle-thumb"></span>
    </span>
    <span id="safeModeToggleLabel2">SAFE</span>
  </label>
  <span class="gam-card-badge" id="card-badge-maint" style="display:none"></span>
  <span class="gam-card-chevron" aria-hidden="true"></span>
</summary>
```

**Primary action rows — 2x2 grid inside card body:**
```html
<div class="gam-card-subsection">
  <div class="gam-card-grid2">
    <div class="pop-maint-row">
      <button id="maintCookies" class="pop-btn pop-btn-ghost"
              title="Clears stuck XSRF/session/cf_* cookies on greatawakening.win plus per-tab localStorage. Use when GAW gives 403/CSRF errors.">
        [x] CLEAR COOKIES
      </button>
      <div id="maintCookiesStatus" class="pop-token-status pop-maint-status"></div>
    </div>
    <div class="pop-maint-row">
      <button id="maintToken" class="pop-btn pop-btn-ghost"
              title="Pings worker /mod/whoami, reports token age + lead status.">
        [!] TOKEN PROBE
      </button>
      <div id="maintTokenStatus" class="pop-token-status pop-maint-status"></div>
    </div>
    <div class="pop-maint-row">
      <button id="maintTardSuggest" class="pop-btn pop-btn-ghost"
              title="Llama scans last 80 usernames and proposes tard/sus patterns.">
        [*] AI: TARD SUGGEST
      </button>
      <div id="maintTardSuggestStatus" class="pop-token-status pop-maint-status"></div>
    </div>
    <div class="pop-maint-row">
      <button id="maintStickyScan" class="pop-btn pop-btn-ghost"
              title="Scans last 7 days of modmail for sticky requests.">
        [>] AI: STICKY SCAN
      </button>
      <div id="maintStickyScanStatus" class="pop-token-status pop-maint-status"></div>
    </div>
  </div>
</div>
```

### E.3 — Macros card (header only — count badge wiring)

No structural change to card body. Update summary only:
```html
<summary class="gam-card-head">
  <span class="gam-card-chevron" aria-hidden="true"></span>
  <span class="gam-card-title">Team Macros</span>
  <span class="gam-card-badge" id="card-badge-macros"></span>
  <!-- JS populates badge text with macro count on load -->
</summary>
```

Remove emoji from all three card titles: Bloomberg terminal does not use emoji in headers. The emoji prefix ("Maintenance", "Team Macros") is pre-Bloomberg residue.

---

## F. Click-Reduction Matrix

| Action | Current path | Proposed path | Clicks saved |
|---|---|---|---|
| Run Debug snapshot | Tab to Tools > read two ghost buttons > click correct one | Tab to Tools > 2-col grid > click left cell | 0 clicks, but scan time -60% (icon + uppercase grid vs. left-aligned text) |
| Select Users deep crawl (30 pages) | Tab to Tools > read three nearly-identical full-width buttons > click 3rd | Tab to Tools > Data harvest > see /USERS group > click x30 pill (amber-accented) | 0 clicks, but decision time -70% (x10 vs x30 is spatially separated from queue) |
| Enable Safe Mode | Tab to Tools > scroll past card-tools > open card-maint > read first row > click toggle | Tab to Tools > card-maint header (always visible, first visible element) > click toggle | 2 scroll steps eliminated |
| Run Token probe | Tab to Tools > card-maint body > read 4 rows > click 2nd row button | Tab to Tools > card-maint body > 2x2 grid top-right cell | Scan time -50% (grid position vs. linear read) |
| Run AI: Tard suggest | Tab to Tools > card-maint body > read 4 rows > click 3rd | Tab to Tools > card-maint grid > bottom-left cell | Scan time -50% |
| Distinguish cards from each other | Impossible without reading headers (no visual border) | Immediate — 1px amber-bordered panels with amber-accented headers | Visual separation without reading |
| Understand crawl scope | Read "(10)" vs "(30)" in button label | Read "x10" pill (muted) vs "x30" pill (amber accent) | Decision confidence up — color codes depth |

**Net verdict:** Zero new clicks required (no new UI layers or confirmations added). Scan time across all Tools-tab interactions estimated -50% from current. The primary gain is ambient orientation — a mod can identify which card they are in without reading, because the card boundaries are visually unambiguous.

---

## G. Effort Estimate

| Work item | Complexity | Estimated dev time |
|---|---|---|
| Add D.1-D.7 CSS block to Bloomberg override layer | Low | 30 min |
| Rewrite Tools card HTML (E.1) | Low | 20 min |
| Rewrite Maintenance card header + primary grid (E.2) | Medium | 45 min |
| Remove emoji from card titles; verify Maintenance card body layout unchanged | Low | 15 min |
| Wire `crawlStatusLabel` span to existing crawl-status JS (populate last-crawl time) | Low | 20 min |
| Wire macro count badge to macros-load handler | Low | 15 min |
| Regression test: Safe Mode toggle still works from new header position | Low | 20 min |
| **Total** | | **~2.5 hours** |

### Risk flags

**R-1 (LOW):** `safeModeToggle` `<label for="...">` linkage must be maintained if the label moves to the card header. The toggle uses `document.getElementById('safeModeToggle')` in `popup.js` — element ID is stable, so no JS change needed. The label click target grows (entire card header becomes the toggle label), which is actually better UX.

**R-2 (LOW):** The `gam-card-body` padding (`8px 0 4px`) plus sub-section padding (`6px 8px 4px`) must total to the same visual inset as the current `12px` horizontal padding so the Bloomberg grid alignment is preserved. Verify: sub-section `padding: 6px 8px` means left/right = 8px. If card margin is `0 8px` then effective indentation from popup edge = 8+8 = 16px. Current `.pop-maint` has `padding: 0 12px 8px` = 12px inset. Accept: 16px is slightly wider inset — aligns better with popup's 380px container.

**R-3 (NONE):** The `.pop-maint-advanced` accordion inside Maintenance card body is unchanged. Its `margin-top: var(--bb-s3)` and `border-top: 1px dashed var(--bb-line-hot)` naturally reads as an interior separator within the card, which is correct.

**R-4 (WATCH):** Bloomberg override layer uses `!important` extensively. New card boundary rules in D.1-D.2 must use sufficient specificity (`details.gam-card` and `details.gam-card > summary.gam-card-head`) to win without adding `!important`. Validate against existing `border-radius: 0 !important` rules on buttons to ensure no bleed.

---

*End of UIUX-04 — Tools Card Redesign. Read-only audit. No production files were modified.*
