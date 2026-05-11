# UIUX2-20 -- Gear Panel (Settings) Redesign v2
**Auditor:** UIUX2-20-GEAR-PANEL
**Skill:** frontend-design (Bloomberg dense, 2-column nav rail, search-as-you-type, dirty-state)
**Generated:** 2026-05-10
**Source surface:** `openSettings()` in `modtools.js` lines 10993-11300
**Builds on:** `docs/V10_DESIGN/UIUX-15_gear_panel.md`
**Target version:** v10.13

---

## A. Critique of v10.12.3

### A.1 What v1 (UIUX-15) got right

The v1 critique correctly identified the architectural failure: a flat 800px+ scroll of 30 identical `.gam-settings-row` elements with only hairline section dividers to separate eight thematic groups. It diagnosed the incoherent section grouping (two "auto-unsticky" sections three scroll-lengths apart), the invisible lead-gating language, the hardcoded hex on number inputs, and the absence of search. The B-section two-column nav rail proposal was structurally correct.

What v1 did NOT deliver:

- **No CSS spec at the component level.** The B-section token table described palette values but never specified the layout CSS for the nav rail or pane container, the interaction model for pane transitions, the search DOM structure, or the dirty-state indicator mechanics.
- **No visual mockup beyond ASCII tables.** Section C's ASCII art described intent but not implementation: no pixel measurements, no interaction states, no empty state, no mobile-width fallback.
- **No critique of the addToggle / addFeatureToggle / addSelect builder pattern.** These functions append directly to `c` (the flat container). A nav-rail redesign must replace the builder-append model with a builder-to-category-bucket model. UIUX-15 identified the problem but said nothing about how to adapt the existing builders.
- **No critique of the re-render-on-promote bug.** `closeAllPanels(); openSettings()` after Promote/Demote loses nav state -- the panel reopens to the default first pane regardless of which pane the lead was in. UIUX-15 noted the risk but filed it as a "15-minute fix" without specifying the fix.
- **The effort estimate assumed v1 shape.** The T2 ("openSettings() refactor") estimate of 3h underestimated the DOM surgery required to convert builder-append to bucket-append while keeping all existing event listeners intact.

### A.2 Fresh eyes: new findings in the source code (10993-11300)

Reading the live code against the UIUX-15 spec reveals five issues that v1 missed:

**A.2.1 The "Auto-sticky management (lead)" section label is deceptive.** At line 11160, `addSection('\u{1F4CC} Auto-sticky management (lead)')` adds a section visible to ALL mods. The `isLeadMod()` guard wraps only the second unsticky section (11216). A non-lead sees the first section, can toggle "Auto-unsticky old/popular posts" on, and gets no signal that the worker-side counterpart (the system that actually coordinates team execution) exists and is lead-controlled. The visual separation between client-side and worker-side unsticky is a _comment in the source code_, invisible to any mod.

**A.2.2 The status line for Auto-Unsticky Monitoring uses blue (#4A9EFF) for the [view recent] link.** Line 11258 and 11283 hardcode `color:#4A9EFF` -- DESIGN.md's `C.ACCENT` constant, not the `--accent-amber` OKLCH token. The [view recent] affordance is the only clickable element in the status row, and it uses the wrong accent color. It also has no hover state.

**A.2.3 The `addSelect` function at line 11103 appends to `c` directly.** When the nav-rail redesign wraps each category into its own pane container, these appends will fire into the wrong bucket unless the builder target is parameterized. The fix is to thread a `target` parameter through every builder (`addToggle(label, key, desc, live, target)`) or replace `c.appendChild` with a closure-captured variable.

**A.2.4 `addFeatureToggle` re-opens the entire modal on Promote/Demote (line 11094).** The sequence `closeAllPanels(); openSettings()` reopens the panel at the default nav item (first category). A lead who promotes a feature from the FEATURES pane lands back on DISPLAY. This is a regression that did not exist in v1's flat scroll because there was no "current pane" state to lose. UIUX-15 flagged it; this doc specifies the exact fix (see G.3).

**A.2.5 `showModal` is called with a fixed 520px width (line 11298).** The two-column layout requires either a wider modal (600px) or a narrower nav rail (120px) to avoid aggressive word-wrapping in the 340px content pane. The right answer is 600px: the existing modal CSS should accommodate it without layout changes to other panels since each `showModal` call specifies its own width.

### A.3 Score delta (UIUX-15 baseline vs. v10.12.3 live)

| Dimension | UIUX-15 score | v10.12.3 actual | Gap |
|---|---|---|---|
| Information architecture | 3/10 | 3/10 | No change since v1 |
| Lead/mod role clarity | 2/10 | 2/10 | No change -- the "(lead)" label misdirection remains |
| Scannability | 4/10 | 4/10 | No change |
| Token compliance | 4/10 | 3/10 | Regressed: #4A9EFF on [view recent] link added since v1 |
| Settings discoverability | 3/10 | 3/10 | No change |
| Builder architecture | (not scored in v1) | 4/10 | Builders append to flat container; nav refactor requires surgery |

---

## B. Design Direction

### B.1 Aesthetic: Bloomberg Terminal Operations Panel

The gear panel serves a power user (lead mod or experienced mod) managing 30+ configuration levers on a dark background. The aesthetic precedent is the Bloomberg Terminal function menu: **maximum information density, monospace labels, single amber accent, zero decoration, mechanical precision in spacing.**

This is not a settings page for a consumer app. It is a tactical operations interface. Every design decision should ask: "Does this make a setting faster to find and understand, or does it add visual weight without functional return?"

Commitments:
- **Dark field, near-black** (`--bg-base` = `oklch(15% 0.012 280)`) for the panel body
- **Raised tone** (`--bg-raised` = `oklch(19% 0.014 280)`) for the nav rail -- a 4-point luminance step that reads as a physical rail without a border
- **Single amber accent** (`--accent-amber` = `oklch(74% 0.165 65)`) for: active nav item indicator, [LEAD] badge, dirty-state dot, [RELOAD] tag, search highlight, team-override border
- **Geist Mono** for all values, keys, tags, status numbers, and monospace badges
- **No gradients, no rounded corners beyond 2px, no shadows within the panel** (the modal itself carries `--el-3`)
- **Grid-rigorous spacing**: 8px base unit, 4px half-unit for dense rows

### B.2 Layout: 600px modal, 140px nav + 420px content

The 520px modal from v10.12.3 is too narrow for the two-column layout: 140px nav + 20px pad + 340px content + 20px pad = 520px with zero tolerance for word-wrap. Widening to 600px gives 140 + 20 + 400 + 20 + 20 (modal border/pad) = 600px -- comfortable content pane at 400px.

```
+--- 600px modal ---------------------------------------------------+
|  [gear] Settings              [dirty dot]         [x close]       |
+--------------------------------------------------------------------+
| +-- 140px nav --+ +--- 400px content area (20px inner pad) ----+ |
| |               | |                                             | |
| |  DISPLAY      | |  [ Search settings...              ] [x]   | |
| |               | |                                             | |
| |  DETECTION <  | |  DETECTION SETTINGS                        | |
| |               | |  ----------------------------------------  | |
| |  AI / CLOUD   | |  Console Position  [v dropdown ........] | |
| |               | |  Where the Mod Console opens.              | |
| |  AUTO-ACTIONS | |                                             | |
| |               | |  Default DR Hours  [v dropdown ........] | |
| |  FEATURES     | |  1-click Death Row queue delay.            | |
| |               | |                                             | |
| |  [LEAD] TEAM  | |  Possible Tards Threshold                  | |
| |               | |  [v dropdown ........]                     | |
| |  ADVANCED     | |  Risk signals required for triage.         | |
| |               | |  Currently showing: 4 users in triage      | |
| +---------------+ +--------------------------------------------+ |
|                   [1 setting requires reload]  [Reload page]       |
+--------------------------------------------------------------------+
```

### B.3 Nav rail behavior

- **7 items** for leads, **6 items** for non-leads (TEAM hidden)
- Active item: 2px left amber bar + `--bg-raised` background + `--ink-primary` text
- Inactive item: no background + `--ink-tertiary` text + hover raises to `--bg-raised` at 50% opacity with 80ms transition
- Badges: amber pill (14px height, Geist Mono 9px bold) right-aligned -- count for FEATURES (team-override count), alert `!` for AUTO-ACTIONS when master switch is ON but rules = 0
- `[LEAD]` item (TEAM): amber badge left of the label, full item hidden for non-leads (no greyed-out disabled state -- non-leads should not know a TEAM pane exists)
- Width fixed at 140px, no horizontal scroll

### B.4 Search design

```
[ Filter settings...  🔍 ]
```
- Auto-focused on panel open (no click required to begin typing)
- Filters within the current pane: non-matching rows get `display:none`, matching rows get the search term wrapped in `<mark class="gs-match">` (amber background, dark text, no border-radius)
- Cross-pane badge counts appear on nav items when the search string matches settings outside the current pane: "DISPLAY (2)" -- only visible during an active search
- Empty state: a full-pane placeholder -- "No settings match 'foo'" with a `[clear]` link in amber
- Clearing search restores all rows and removes cross-pane badges
- `Escape` key clears search and returns focus to the panel body

### B.5 Dirty-state indicator and reload footer

**Dirty dot:** a 6px amber filled circle in the modal title bar, right of "Settings", visible when any setting was changed in the current panel session. Implemented via a `MutationObserver` on setting change events or by wrapping `setSetting` calls in a dirty-flag setter.

**Reload footer:** a fixed 32px strip at the bottom of the content pane, hidden by default. Becomes visible when any `[RELOAD]`-tagged setting is changed. Content: `"N setting(s) require page reload"` left-aligned in `--ink-secondary` + `[Reload page]` button right-aligned in amber. Clicking `[Reload page]` calls `location.reload()`. This strip is INSIDE the 600px modal (not a separate overlay) so it does not affect scroll position.

---

## C. Category-by-Category Pane Spec

### C.1 DISPLAY (4 settings)

Four toggles. Identical visual treatment: `.gs-row` label-description-toggle layout.

| Key | Label | Description | Tag |
|---|---|---|---|
| `hideSidebar` | Hide Sidebar | Remove GAW's right sidebar -- more room for content. | -- |
| `susMarkerEnabled` | Sus Marker | Paint X next to watchlisted / cloud-flagged usernames sitewide. | -- |
| `harmonizeTheme` | Theme Harmony | Derive ModTools accent from GAW's own color wheel (180 deg complement). | `[RELOAD]` |
| `mailHoverHighlight` | Mail Hover Highlight | Highlight modmail senders throughout the page when hovering a modmail message. | -- |

"Theme Harmony" gets the `[RELOAD]` tag inline with its label (amber, 9px Geist Mono, right of label text). The pane header reads "DISPLAY SETTINGS".

### C.2 DETECTION (3 settings)

Renamed from "Moderation" -- these settings govern detection and triage behavior, not moderation actions. The rename removes the ambiguity with the actual moderation workflow buttons.

| Key | Label | Type | Options / Range |
|---|---|---|---|
| `modConsoleDock` | Console Position | Select | Center modal / Right panel / Left panel |
| `defaultDeathRowHours` | Default DR Hours | Select | 24h / 48h / 72h (default) / 120h / 168h (7d) |
| `tardsThreshold` | Possible Tards Threshold | Select | 1 signal (broad) / 2 signals (balanced) / 3 signals (strict) |

"Possible Tards Threshold" gets a live preview line below the select, rendered by a JS callback wired to the select's `change` event: `Currently showing: N users in Possible Tards`. Populated immediately on pane open by reading the current triage list length (same hook as the existing `refreshTriageConsole` live effect).

### C.3 AI / CLOUD (2 settings + status)

| Key | Label | Type |
|---|---|---|
| `aiEngine` | Default AI Engine | Select: Llama 3 / Grok |
| `deepAnalysisEnabled` | Deep Analysis on Load | Toggle |

Below these two rows, a read-only status line: `Last AI scan: N min ago  |  N items scored today`. Populated via `rpcCall('modAutoActionRecent', ...)` (same RPC used by the Auto-Unsticky status row, filtered to AI action type). Renders in `--ink-tertiary`, 10px Geist Mono. Displays `--` placeholders until the RPC resolves. No click affordance -- it is informational only.

### C.4 AUTO-ACTIONS (master toggle + unsticky dual-column + rules entry)

This is the most restructured pane. Three visual groups:

**Group 1: Master switch**

Standard toggle row: `autoRemoveSusDr` / "Auto-Remove SUS/DR Queue Items" / "When the queue page is open, automatically remove posts/comments from SUS-marked or Death Row users after a 1.5s undo window. OFF by default."

**Group 2: Auto-Unsticky (two-column sub-panel)**

A `.gs-unsticky-grid` element with `display:grid; grid-template-columns:1fr 1fr; gap:0; border:1px solid var(--border-subtle)`. Each column has a 28px header row (background `--bg-sunken`, border-bottom `1px solid --border-subtle`) containing the column label in 9px Geist Mono bold uppercase.

```
+------------------------+------------------------+
|  LOCAL (this session)  |  WORKER CRON [LEAD]    |
+------------------------+------------------------+
|  Auto-unsticky    [ ]  |  Enabled          [ ]  |
|  Max age hrs   [  12]  |  Max age hrs   [  10]  |
|  Min upvotes   [ 110]  |  Min upvotes   [ 110]  |
|  AI scan mail  [ ]     |  Last poll: 3m ago     |
|                        |  0 queued | 2 exec 24h |
|                        |  [view recent actions] |
+------------------------+------------------------+
```

- The LOCAL column is visible to all mods. Keys: `autoUnstickyEnabled`, `autoUnstickyMaxHours`, `autoUnstickyUpvoteThreshold`, `aiStickyDetectorEnabled`
- The WORKER CRON column header carries a `[LEAD]` badge in amber. **For non-leads:** the column renders but inputs are replaced with `--` placeholder text and a "Lead-only" legend in `--ink-tertiary`. No disabled inputs (which are confusing) -- just static display. **For leads:** full editable inputs with identical clamping logic as the current standalone rows.
- Number inputs in both columns use `.gs-num` class (NOT inline styles): `background: var(--bg-sunken); color: var(--ink-primary); border: 1px solid var(--border-subtle); font: 11px/1 'Geist Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; padding: 3px 6px; width: 60px` (80px for upvote fields). This replaces ALL inline `style="background:#050507..."` occurrences.
- The status line ([view recent actions]) is the same RPC-populated element from the current code, now inside the WORKER CRON column rather than a free-floating row.

**Group 3: Pattern Rules entry**

Two read-only rows, one for Death Row rules and one for Tard Queue rules:

```
PATTERN RULES
Death Row     12 rules active     [Open rules editor ->]
Tard Queue     8 rules active     [Open rules editor ->]
```

Rule counts read from `getSetting('autoDeathRowRules', []).length` and `getSetting('autoTardRules', []).length`. The `[Open rules editor ->]` button fires the existing rules editor open function without closing the settings modal (or, if that function closes settings as a side effect, it re-opens to AUTO-ACTIONS after the editor closes). This closes the current UX gap where the master switch lives in Settings but the rules live elsewhere.

### C.5 FEATURES (6 feature flags)

Layout: standard toggle rows. For leads, each row has an additional action button below the description.

**Non-lead view:** Six toggle rows. Toggle fires `setSetting`. No Promote/Demote visible.

**Lead view:** Each toggle row gains a third sub-row for team controls:

```
Intel Drawer                                    [ON ]
v7.0 keyboard-first subject overlay.
[Push to team]
```

For team-overridden features:

```
+--- TEAM OVERRIDE -----------------------------------------------+
|  Mod Chat                                               [ON ]  |
|  v8.2 mod-to-mod messaging.                                    |
|  TEAM=true  set_by moderator_x  3 days ago                     |
|  [Pull from team]                                              |
+----------------------------------------------------------------+
```

The team-override container (`.gs-team-row`) has: `background: oklch(17% 0.020 65 / 0.15); border: 1px solid oklch(74% 0.165 65 / 0.30); border-radius: 2px; padding: 8px 10px; margin: 4px 0`.

The TEAM=... flag line uses 10px Geist Mono, `--ink-tertiary`, and is NOT italic (italic at 10px monospace is unreadable in the Bloomberg aesthetic). Format: `TEAM=true  set_by username  N days ago`.

The Promote/Demote buttons are relabeled: `[Push to team]` and `[Pull from team]`. No emoji arrows. Full English words because the action has team-wide consequences that demand clarity.

**Lead badge on nav item:** the FEATURES nav item shows a count of currently team-overridden features (amber badge, right-aligned). If zero, no badge.

**Re-render fix (see G.3):** On Promote/Demote completion, instead of `closeAllPanels(); openSettings()`, the handler calls `_refreshSettingsPane('features')` which re-renders only the FEATURES pane content in place, preserving nav state and scroll position.

### C.6 TEAM (lead-only -- not rendered for non-leads)

This pane does not exist in v10.12.3. It consolidates all lead-specific operational visibility that currently has no settings surface.

**Sub-section 1: Feature overrides summary**
A compact table of all features with `TEAM=` entries: feature name, value, set_by, set_at (relative time). Clicking a row switches to the FEATURES pane and scrolls to that feature. This is a read-only cross-reference -- actions happen in the FEATURES pane.

**Sub-section 2: Pattern sync status**
Two rows showing last push/pull timestamps for `autoDeathRowRules` and `autoTardRules` as stored in `team_settings`. Format: `Death Row rules  Last push: 3h ago  Last pull: 47m ago`. A `[Sync now]` button triggers the same RPC as the SW's periodic sync. On completion, timestamps refresh in place.

**Sub-section 3: team_settings dump**
A collapsible `<details>` element (closed by default, label: "Raw team_settings [show]") containing a monospace key-value table of the full `team_settings` object from the last worker fetch. This is a diagnostic tool, not a configuration surface. Each key renders in `--accent-amber`, value in `--ink-secondary`.

### C.7 ADVANCED (1 setting)

One toggle: `easterEggsEnabled` / "Easter Eggs" / "Enable Q-themed easter eggs in the mod interface." Kept last in the nav. Any future developer/debug flags go here to prevent mods stumbling on them.

---

## D. Component CSS Specification

### D.1 New token additions (extend DESIGN.md)

```css
/* Gear Settings Panel tokens -- append to existing :root block */
:root {
  /* Layout */
  --gs-modal-w:        600px;
  --gs-nav-w:          140px;
  --gs-content-pad:    20px;
  --gs-row-gap:         6px;
  --gs-row-pad:         8px 0;

  /* Nav rail */
  --gs-nav-bg:         var(--bg-base);
  --gs-nav-active-bg:  var(--bg-raised);
  --gs-nav-active-bar: var(--accent-amber);
  --gs-nav-item-h:     30px;

  /* Badges */
  --gs-badge-bg:       var(--accent-amber);
  --gs-badge-ink:      oklch(12% 0.010 280);

  /* Lead badge */
  --gs-lead-bg:        oklch(74% 0.165 65 / 0.15);
  --gs-lead-ink:       var(--accent-amber);

  /* Team override container */
  --gs-team-bg:        oklch(17% 0.020 65 / 0.15);
  --gs-team-border:    oklch(74% 0.165 65 / 0.30);

  /* Dirty state */
  --gs-dirty-color:    var(--accent-amber);

  /* Search highlight */
  --gs-match-bg:       oklch(74% 0.165 65 / 0.30);
  --gs-match-ink:      var(--ink-primary);

  /* Reload footer */
  --gs-footer-h:       32px;
}
```

### D.2 Panel skeleton CSS

```css
.gam-settings-panel-v2 {
  display: grid;
  grid-template-columns: var(--gs-nav-w) 1fr;
  grid-template-rows: auto 1fr var(--gs-footer-h);
  height: 520px;       /* fixed height; content area scrolls */
  overflow: hidden;
  background: var(--bg-base);
  border-radius: 2px;
}

/* Nav rail */
.gs-nav {
  grid-row: 1 / -1;
  background: var(--gs-nav-bg);
  border-right: 1px solid var(--border-subtle);
  padding: 8px 0;
  overflow: hidden;
}

.gs-nav-item {
  display: flex;
  align-items: center;
  height: var(--gs-nav-item-h);
  padding: 0 12px;
  font: 700 10px/1 'Geist Mono', ui-monospace, monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-tertiary);
  cursor: pointer;
  position: relative;
  transition: background 80ms, color 80ms;
  user-select: none;
}

.gs-nav-item:hover {
  background: oklch(19% 0.014 280 / 0.5);
  color: var(--ink-secondary);
}

.gs-nav-item.gs-active {
  background: var(--gs-nav-active-bg);
  color: var(--ink-primary);
}

.gs-nav-item.gs-active::before {
  content: '';
  position: absolute;
  left: 0; top: 4px; bottom: 4px;
  width: 2px;
  background: var(--gs-nav-active-bar);
}

.gs-nav-badge {
  margin-left: auto;
  background: var(--gs-badge-bg);
  color: var(--gs-badge-ink);
  font: 700 9px/14px 'Geist Mono', ui-monospace, monospace;
  padding: 0 4px;
  border-radius: 2px;
  min-width: 14px;
  text-align: center;
}

.gs-nav-lead-badge {
  display: inline-block;
  background: var(--gs-lead-bg);
  color: var(--gs-lead-ink);
  font: 700 8px/12px 'Geist Mono', ui-monospace, monospace;
  padding: 0 3px;
  border-radius: 1px;
  margin-right: 5px;
  letter-spacing: 0.05em;
}

/* Content area */
.gs-content {
  grid-column: 2;
  grid-row: 1 / 3;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.gs-search-wrap {
  padding: 10px var(--gs-content-pad) 8px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.gs-search {
  width: 100%;
  box-sizing: border-box;
  background: var(--bg-sunken);
  border: 1px solid var(--border-subtle);
  color: var(--ink-primary);
  font: 11px/1.4 'Geist Mono', ui-monospace, monospace;
  padding: 5px 8px;
  border-radius: 1px;
  outline: none;
}

.gs-search:focus {
  border-color: var(--border-strong);
}

.gs-pane {
  flex: 1;
  overflow-y: auto;
  padding: 12px var(--gs-content-pad);
  display: none;
}

.gs-pane.gs-pane-active {
  display: block;
}

/* Pane header */
.gs-pane-header {
  font: 700 10px/1 'Geist Mono', ui-monospace, monospace;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-tertiary);
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-subtle);
}

/* Setting row */
.gs-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: var(--gs-row-pad);
  border-bottom: 1px solid oklch(28% 0.010 280 / 0.4);
}

.gs-row:last-child {
  border-bottom: none;
}

.gs-row-info {
  flex: 1;
  min-width: 0;
}

.gs-lbl {
  display: block;
  font: 600 12px/1.3 'Geist Sans', system-ui, sans-serif;
  color: var(--ink-primary);
  margin-bottom: 2px;
}

.gs-desc {
  font: 400 11px/1.5 'Geist Sans', system-ui, sans-serif;
  color: var(--ink-secondary);
}

.gs-preview {
  font: 400 10px/1.4 'Geist Mono', ui-monospace, monospace;
  color: var(--ink-tertiary);
  margin-top: 3px;
}

/* Tags */
.gs-tag {
  display: inline-block;
  font: 700 9px/12px 'Geist Mono', ui-monospace, monospace;
  padding: 0 3px;
  border-radius: 1px;
  margin-left: 5px;
  vertical-align: middle;
}

.gs-tag-reload {
  background: oklch(74% 0.165 65 / 0.15);
  color: var(--accent-amber);
  border: 1px solid oklch(74% 0.165 65 / 0.30);
}

.gs-tag-lead {
  background: var(--gs-lead-bg);
  color: var(--gs-lead-ink);
}

/* Number inputs (replaces inline styles) */
.gs-num {
  width: 60px;
  padding: 3px 6px;
  background: var(--bg-sunken);
  color: var(--ink-primary);
  border: 1px solid var(--border-subtle);
  font: 11px/1 'Geist Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  border-radius: 1px;
  text-align: right;
}

.gs-num-wide {
  width: 80px;
}

.gs-num:focus {
  outline: none;
  border-color: var(--border-strong);
}

/* Select */
.gs-select {
  background: var(--bg-sunken);
  color: var(--ink-primary);
  border: 1px solid var(--border-subtle);
  font: 11px/1.4 'Geist Mono', ui-monospace, monospace;
  padding: 4px 6px;
  border-radius: 1px;
  cursor: pointer;
  flex-shrink: 0;
}

.gs-select:focus {
  outline: none;
  border-color: var(--border-strong);
}

/* Unsticky two-column grid */
.gs-unsticky-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--border-subtle);
  border-radius: 2px;
  overflow: hidden;
  margin: 8px 0 12px;
}

.gs-unsticky-col-header {
  font: 700 9px/28px 'Geist Mono', ui-monospace, monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-tertiary);
  background: var(--bg-sunken);
  border-bottom: 1px solid var(--border-subtle);
  padding: 0 10px;
}

.gs-unsticky-col-header:first-child {
  border-right: 1px solid var(--border-subtle);
}

.gs-unsticky-col {
  padding: 8px 10px;
}

.gs-unsticky-col:first-child {
  border-right: 1px solid var(--border-subtle);
}

.gs-unsticky-status {
  font: 400 10px/1.5 'Geist Mono', ui-monospace, monospace;
  color: var(--ink-tertiary);
  margin-top: 6px;
}

.gs-unsticky-link {
  color: var(--accent-amber);
  text-decoration: underline;
  cursor: pointer;
}

/* Team override row */
.gs-team-row {
  background: var(--gs-team-bg);
  border: 1px solid var(--gs-team-border);
  border-radius: 2px;
  padding: 8px 10px;
  margin: 4px 0 8px;
}

.gs-team-flag {
  font: 400 10px/1.4 'Geist Mono', ui-monospace, monospace;
  color: var(--ink-tertiary);
  margin-top: 4px;
}

/* Action buttons */
.gs-action-btn {
  font: 600 11px/1 'Geist Mono', ui-monospace, monospace;
  color: var(--ink-secondary);
  background: var(--bg-raised);
  border: 1px solid var(--border-subtle);
  padding: 4px 8px;
  border-radius: 1px;
  cursor: pointer;
  margin-top: 6px;
}

.gs-action-btn:hover {
  border-color: var(--border-strong);
  color: var(--ink-primary);
}

.gs-action-btn-amber {
  color: var(--accent-amber);
  border-color: oklch(74% 0.165 65 / 0.40);
}

/* Search match highlight */
mark.gs-match {
  background: var(--gs-match-bg);
  color: var(--gs-match-ink);
  border-radius: 0;
  padding: 0 1px;
}

/* Dirty dot in modal title */
.gs-dirty-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--gs-dirty-color);
  margin-left: 6px;
  vertical-align: middle;
}

/* Reload footer */
.gs-footer {
  grid-column: 2;
  grid-row: 3;
  display: none;   /* shown via JS when dirty reload-required settings exist */
  align-items: center;
  padding: 0 var(--gs-content-pad);
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-base);
}

.gs-footer.gs-footer-visible {
  display: flex;
}

.gs-footer-msg {
  flex: 1;
  font: 400 11px/1 'Geist Mono', ui-monospace, monospace;
  color: var(--ink-secondary);
}

.gs-footer-reload {
  font: 700 11px/1 'Geist Mono', ui-monospace, monospace;
  color: var(--accent-amber);
  background: oklch(74% 0.165 65 / 0.12);
  border: 1px solid oklch(74% 0.165 65 / 0.30);
  padding: 4px 10px;
  border-radius: 1px;
  cursor: pointer;
}

/* Pattern rules rows */
.gs-rules-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid oklch(28% 0.010 280 / 0.4);
  font: 400 11px/1.4 'Geist Mono', ui-monospace, monospace;
  color: var(--ink-secondary);
}

.gs-rules-label {
  width: 90px;
  color: var(--ink-tertiary);
}

.gs-rules-count {
  flex: 1;
  color: var(--ink-primary);
}

/* Empty search state */
.gs-empty {
  padding: 32px 0;
  text-align: center;
  font: 400 12px/1.5 'Geist Mono', ui-monospace, monospace;
  color: var(--ink-tertiary);
}

.gs-empty-reset {
  color: var(--accent-amber);
  text-decoration: underline;
  cursor: pointer;
}

/* team_settings dump */
.gs-raw-details summary {
  font: 700 10px/1.4 'Geist Mono', ui-monospace, monospace;
  color: var(--ink-tertiary);
  cursor: pointer;
  list-style: none;
  padding: 6px 0;
}

.gs-raw-table {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  font: 400 10px/1.5 'Geist Mono', ui-monospace, monospace;
  padding: 6px 0;
}

.gs-raw-key {
  color: var(--accent-amber);
  white-space: nowrap;
}

.gs-raw-val {
  color: var(--ink-secondary);
  word-break: break-all;
}
```

---

## E. DOM Structure Reference

```
.gam-modal (600px)
  .gam-modal-header
    [gear icon] Settings
    .gs-dirty-dot  (hidden until dirty)
    [x close]
  .gam-settings-panel-v2
    .gs-nav
      .gs-nav-item [DISPLAY]
      .gs-nav-item gs-active [DETECTION]  (active state example)
      .gs-nav-item [AI / CLOUD]
      .gs-nav-item [AUTO-ACTIONS]  .gs-nav-badge (conditional)
      .gs-nav-item [FEATURES]      .gs-nav-badge (lead: override count)
      .gs-nav-item (lead only)     [LEAD] badge + [TEAM]
      .gs-nav-item [ADVANCED]
    .gs-content
      .gs-search-wrap
        input.gs-search [placeholder="Filter settings..."]
      .gs-pane#gs-pane-display
      .gs-pane#gs-pane-detection gs-pane-active
        .gs-pane-header "DETECTION SETTINGS"
        .gs-row
          .gs-row-info
            .gs-lbl "Console Position"
            .gs-desc "Where the Mod Console opens."
          select.gs-select
        .gs-row  (Default DR Hours)
        .gs-row  (Possible Tards Threshold)
          .gs-row-info
            .gs-lbl "Possible Tards Threshold"
            .gs-desc "..."
            .gs-preview "Currently showing: N users"  (JS-populated)
          select.gs-select
      .gs-pane#gs-pane-ai
      .gs-pane#gs-pane-auto-actions
        .gs-pane-header
        .gs-row (master toggle)
        .gs-pane-subheader "AUTO-UNSTICKY"
        .gs-unsticky-grid
          .gs-unsticky-col-header "LOCAL (THIS SESSION)"
          .gs-unsticky-col-header "WORKER CRON [LEAD]"
          .gs-unsticky-col (left column rows)
          .gs-unsticky-col (right column rows, muted for non-leads)
        .gs-pane-subheader "PATTERN RULES"
        .gs-rules-row (Death Row)
        .gs-rules-row (Tard Queue)
      .gs-pane#gs-pane-features
      .gs-pane#gs-pane-team  (lead-only -- not created for non-leads)
      .gs-pane#gs-pane-advanced
    .gs-footer
      .gs-footer-msg "N setting(s) require page reload"
      button.gs-footer-reload "Reload page"
```

---

## F. Interaction Specification

### F.1 Panel open sequence
1. `showModal('gam-settings-panel-v2', '⚙️ Settings', c, '600px')` -- 80px wider than current
2. `gs-search` receives `focus()` after a single `requestAnimationFrame` to avoid the modal open animation eating the focus
3. Default active pane: DISPLAY (or last-visited pane if stored in sessionStorage under `gam.settings.lastPane`)
4. AI / CLOUD pane status RPC fires immediately if that pane is active; fires lazily on first nav to that pane otherwise
5. Auto-Unsticky Monitoring status RPC fires immediately if AUTO-ACTIONS pane is active; lazy otherwise

### F.2 Nav click
1. Remove `.gs-active` from current nav item
2. Add `.gs-active` to clicked nav item
3. Hide current `.gs-pane-active`, remove `.gs-pane-active`
4. Show target pane, add `.gs-pane-active`
5. Clear search input and restore all rows in new pane
6. Store new pane ID in `sessionStorage['gam.settings.lastPane']`
7. Fire any lazy RPC for the newly visible pane if not already fired

### F.3 Search mechanics
```javascript
// Pseudocode -- actual implementation in openSettings() JS body
searchInput.addEventListener('input', () => {
  const term = searchInput.value.trim().toLowerCase();
  if (!term) { clearSearch(); return; }

  // Within current pane
  activePaneRows.forEach(row => {
    const labelText = row.querySelector('.gs-lbl').textContent.toLowerCase();
    const descText = row.querySelector('.gs-desc').textContent.toLowerCase();
    const match = labelText.includes(term) || descText.includes(term);
    row.style.display = match ? '' : 'none';
    if (match) highlightMatches(row, term);  // wrap in <mark class="gs-match">
  });

  // Cross-pane badges
  allPanes.forEach(pane => {
    const count = countMatchesInPane(pane, term);
    updateNavBadge(pane.id, count > 0 ? count : null, 'search');
  });

  // Empty state
  const anyVisible = activePaneRows.some(r => r.style.display !== 'none');
  emptyState.style.display = anyVisible ? 'none' : 'block';
});
```

### F.4 Dirty state tracking
```javascript
// Wrap setSetting calls within openSettings() scope:
let _dirtyCount = 0;
let _reloadDirty = 0;

function _markDirty(requiresReload) {
  _dirtyCount++;
  dirtyDot.style.display = 'inline-block';
  if (requiresReload) {
    _reloadDirty++;
    footer.classList.add('gs-footer-visible');
    footerMsg.textContent = _reloadDirty + ' setting' +
      (_reloadDirty !== 1 ? 's' : '') + ' require page reload';
  }
}
// Passed as a callback to each addToggle/addSelect that has a reload requirement.
```

### F.5 Promote/Demote re-render (the G.3 fix -- see section G)
Instead of `closeAllPanels(); openSettings()`, the Promote/Demote handler calls:
```javascript
function _refreshFeaturesPane() {
  const pane = document.getElementById('gs-pane-features');
  if (!pane) return;
  // Remove all children
  while (pane.firstChild) pane.removeChild(pane.firstChild);
  // Re-append pane header
  pane.appendChild(makeElement('div', { cls:'gs-pane-header' }, 'FEATURES'));
  // Re-render all feature toggles into pane directly
  _renderFeaturesToggles(pane);
  // Re-run nav badge update
  _updateFeaturesNavBadge();
}
```
This preserves the active pane state, the search state, and the dirty-state indicator. No modal close/reopen.

---

## G. Delta from UIUX-15 (What Changed)

### G.1 Modal width: 520px -> 600px
UIUX-15 assumed 520px would work with 140px nav + 340px content. At 520px, a typical description like "Derive ModTools accent from GAW's own color wheel (180 deg complement)" wraps at 340px into 3 lines, creating uneven row heights. 600px (400px content) fits these descriptions in 2 lines comfortably. `showModal` call signature accepts the width argument; no other modal is affected.

### G.2 Section rename: "Moderation" -> "DETECTION"
v1 spec proposed this rename. This doc confirms it is correct and adds the rationale: the three settings in this section all govern detection/triage thresholds and console placement, not moderation actions. The word "Moderation" implies action, which conflicts with the "Possible Tards Threshold" live preview (which is pure detection output).

### G.3 Promote/Demote re-render: full modal reopen -> pane-local re-render
v1 flagged this as a "15-minute fix". This doc specifies it fully (see F.5). The key insight is that `_teamFeatures` is mutated in-place by the Promote/Demote handlers (lines 11079, 11062), so re-reading it to re-render the FEATURES pane is already correct -- there is no need to re-initialize the entire settings modal.

### G.4 [view recent] link color: #4A9EFF -> --accent-amber
This regression post-dates UIUX-15 and is not mentioned in v1. This doc specifies it. The link must use `var(--accent-amber)` and have a `:hover` state that removes the underline (Bloomberg terminal interaction pattern: hover = bold, not underline shift).

### G.5 Inline styles on number inputs -> .gs-num class
v1 identified this as T10 "token migration". This doc specifies the full `.gs-num` class (see D.2). All five inline-styled `<input type="number">` elements (two in the LOCAL unsticky block, two in the WORKER CRON block, plus any future additions) use `.gs-num` and `.gs-num-wide`.

### G.6 Builder target parameter threading
v1 said nothing about the builder-append pattern. This doc requires that `addToggle`, `addSelect`, `addFeatureToggle` accept an optional `target` element parameter (defaulting to the flat container `c` for backward compatibility during the migration). Each category pane is a `<div id="gs-pane-X">` and is passed as the `target` when building that category's settings. This is the minimum-invasive change that enables the two-column layout without rewriting the entire settings builder.

---

## H. Effort Estimate (v2)

### H.1 Revised task breakdown

| Task | Complexity | Hours | Notes |
|---|---|---|---|
| H1: CSS -- new tokens + nav rail + component classes | Low | 2h | Includes .gs-num replacing all inline styles |
| H2: openSettings() skeleton -- two-column layout, pane containers, nav click | Medium | 3h | Builder target threading included |
| H3: DETECTION pane + live tards preview line | Low | 0.5h | Already wired; just needs target param |
| H4: AUTO-ACTIONS pane -- two-column unsticky grid | High | 4h | Most DOM surgery; WORKER column lead-gating |
| H5: FEATURES pane -- team-override UX, Push/Pull labels, team container | Medium | 2.5h | Includes _refreshFeaturesPane() |
| H6: TEAM pane (lead-only) -- overrides table, sync status, raw dump | Medium | 2.5h | New pane, no existing code |
| H7: Search / filter -- within-pane hide/highlight, cross-pane badges | Medium | 2.5h | |
| H8: Dirty state -- dot, reload footer, _markDirty() wrapper | Low | 1.5h | |
| H9: AI / CLOUD status line + lazy RPC on pane activate | Low | 1h | Same RPC as existing status line |
| H10: [view recent] link color fix + hover state | Low | 0.25h | One-liner fix in existing code |
| H11: Modal width 520 -> 600px | Low | 0.25h | One-argument change in showModal call |
| H12: sessionStorage last-pane persistence | Low | 0.5h | |
| H13: QA -- non-lead, lead, search, dirty, all panes, promote/demote | Low | 2h | |
| **Total** | | **22.5h** | Matches UIUX-15 estimate within rounding |

### H.2 Ship sequence (unchanged from UIUX-15, tasks updated)

**Phase 1 (~8.5h): Structural layout, zero behavior change**
H1 + H2 + H3 + H10 + H11 + H12 + H13 (partial)
Output: two-column panel with all existing settings in categorized panes, correct token colors, correct modal width. Ship as v10.13.0.

**Phase 2 (~8.5h): AUTO-ACTIONS restructure + search + dirty state**
H4 + H5 + H7 + H8 + H13 (partial)
Output: consolidated unsticky pane, team-override UX on FEATURES, search functional, dirty state visible. Ship as v10.13.1.

**Phase 3 (~5.5h): TEAM pane + AI status + full QA**
H6 + H9 + H13 (full)
Output: TEAM pane for leads, AI status line, full regression pass. Ship as v10.13.2.

### H.3 Risk flags

**H.4 (unsticky two-column) -- highest risk.** The current code uses `var _auRow` declared with `var` (not `const`/`let`) inside an `if (isLeadMod())` block, making it function-scoped. The refactor converts these to pane-local builders. The event listeners must be re-attached after the DOM replacement; verify that no listener is lost in the restructure.

**H.5 (Promote/Demote re-render) -- medium risk.** `_teamFeatures` is a closure-captured variable. Confirm that `_refreshFeaturesPane()` is defined in the same scope as `_teamFeatures` so it can read the updated value after mutation. The current `closeAllPanels(); openSettings()` re-initializes the closure; the new approach must not re-initialize it (to preserve the mutation).

**H.11 (modal width) -- low risk, verify one edge case.** The status bar layout and any other panel that uses `showModal` with an explicit width argument is unaffected. The only check needed is that the 600px modal does not overflow on 1280px-wide monitors where the GAW sidebar is visible (should be fine: 1280 - sidebar ~200 = 1080px available > 600px modal).

**Key duality (autoUnstickyMaxHours vs. auto_unsticky_max_hours) -- out of scope for this ticket.** The two-column layout makes the duplication visible and labeled ("LOCAL" vs. "WORKER CRON"), which is the correct outcome for v10.13. Key unification is a separate decision requiring worker-side coordination. Do not rename keys in this ticket.
