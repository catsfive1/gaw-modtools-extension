# UIUX-15 -- Gear Panel (Settings) Redesign
**Auditor:** DESIGN-15-GEAR-PANEL
**Skill:** impeccable (product register, Bloomberg Terminal aesthetic)
**Generated:** 2026-05-10
**Source surface:** `openSettings()` in `modtools.js` lines 10660-10970
**Modal width:** 520px fixed

---

## A. Critique

### A.1 The core problem: one undifferentiated column of ~30 rows

The current panel is a single `display:flex; flex-direction:column; gap:2px` container. Every setting -- a toggle, a select, a number input pair, a status line -- renders as a `.gam-settings-row` in the same visual register. Section dividers (`addSection()`) are 9px uppercase labels with a `::after` line, which is better than nothing but creates only a hairline of visual separation in a panel that scrolls 800px+ when all sections are open.

**Result at 11pm on a tired mod's 1080p monitor:** a wall of text. Finding "Possible Tards Threshold" requires scrolling past Display toggles, Moderation selects, AI selects, and two Auto-unsticky sections. No spatial memory is possible because every row looks the same.

### A.2 Inventory of current sections (what is actually in the panel)

| # | Section label | Items | Lead-only? |
|---|---|---|---|
| 1 | Display | 4 toggles (Hide Sidebar, Sus Marker, Theme Harmony, Mail Hover Highlight) | No |
| 2 | Moderation | 3 selects (Console Position, Default DR Hours, Tards Threshold) | No |
| 3 | AI & Cloud | 2 (AI Engine select, Deep Analysis toggle) | No |
| 4 | Auto-sticky management (lead) | 1 toggle + threshold row (2 number inputs) + AI scan toggle | Label says "(lead)" but not gated by `isLeadMod()` |
| 5 | Features | 6 feature toggles (Drawer, SuperMod, Audible Alerts, Mod Chat, Daily AI Scan, Passive Crawler) with Promote/Demote for leads | Promote/Demote is lead-only |
| 6 | Auto-Unsticky Monitoring | 1 toggle + threshold row + status/poll line | `isLeadMod()` gated |
| 7 | Auto-Actions | 1 toggle (Auto-Remove SUS/DR) | No |
| 8 | Fun | 1 toggle (Easter Eggs) | No |

Total: 8 sections, ~22 primary rows, ~30+ with lead-only sections visible.

### A.3 Specific failure modes

**A.3.1 Section grouping is incoherent.** "Auto-sticky management (lead)" and "Auto-Unsticky Monitoring" are two separate sections for the same feature domain -- the worker-driven unsticky loop. They differ only in mechanism (client-side vs. worker cron), but appear as distinct sections 3 scroll-lengths apart. A mod cannot form a mental model of which one controls what. Adding the "(lead)" parenthetical to a section label that is NOT fully gated by `isLeadMod()` is outright confusing.

**A.3.2 The Features section has no visual identity for its Promote/Demote affordance.** Six feature toggles render as standard `.gam-settings-row` elements. The Promote/Demote button appears in `.gam-settings-feature-ctls` right-of-toggle -- visually buried. A lead opening this panel for the first time has no way to know these are team-propagation controls without reading every description. The "TEAM=..." flag indicator (`.gam-team-flag-line`) is 10px italic -- invisible.

**A.3.3 Number inputs are inline HTML strings with hardcoded colors.** The threshold rows (lines 10840-10861 and 10893-10918) use `style="background:#050507;color:#e8e6e1;border:1px solid #3d3a35"` directly on `<input>` elements. These are orphaned from the DESIGN.md token system and will survive any token migration unmodified. There are also two almost-identical threshold rows for the same conceptual feature (client-side auto-unsticky vs. worker auto-unsticky) with overlapping key names (`autoUnstickyMaxHours` vs. `auto_unsticky_max_hours`).

**A.3.4 Lead visibility is inconsistent and undocumented.** Section 4 ("Auto-sticky management (lead)") is visible to all mods. Sections 6 ("Auto-Unsticky Monitoring") and the Promote/Demote buttons are lead-gated. There is no visual language that communicates "this section requires lead role." A non-lead mod sees section 4 and can toggle the client-side unsticky on -- without any indication that the team-coordinated version (section 6) exists or that their toggle does something fundamentally different.

**A.3.5 No search or filter.** With 30 rows, finding a specific setting requires scrolling. There is no keyboard shortcut, no filter input, no jump-to-section navigation.

**A.3.6 No dirty state or "settings changed" indicator.** Changes take effect immediately on toggle (live effects where wired) or on page reload (Theme Harmony). There is no visual confirmation that anything changed, no list of pending changes, no save/cancel affordance for settings that require reload. The panel closes after Promote/Demote, which is the only feedback the user gets.

**A.3.7 The autoDeathRowRules and autoTardRules editors are not in this panel.** They live in a separate surface (the Mod Log / Triage Console). A mod who wants to manage auto-action rules has to leave Settings and find the rules editor elsewhere. The panel's "Auto-Actions" section shows only the master on/off toggle, not the rules that govern the actions.

**A.3.8 System font stack on selects and number inputs.** `.gam-settings-select` uses `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`. The DESIGN.md spec is Geist Mono for data/numeric and Geist Sans for UI text. This is a font system fragmentation point.

**A.3.9 Toggle accent uses `rgba(74,158,255,.2)` glow instead of DESIGN.md OKLCH tokens.** The checked toggle's box-shadow is hardcoded hex. The "accent-amber" token from DESIGN.md (`oklch(74% 0.165 65)`) is the correct single accent for this tool, but the toggle uses blue (`C.ACCENT` which resolves to `#4A9EFF`). There is a token mismatch between the OKLCH system defined in DESIGN.md and the `C.*` constants used in the CSS template strings.

**Critique summary score (Bloomberg UX bar):**
- Information architecture: 3/10 (flat list, no spatial hierarchy)
- Lead/mod role clarity: 2/10 (inconsistent gating, no visual language)
- Scannability: 4/10 (section labels help, but not enough separation)
- Token compliance: 4/10 (hardcoded colors on inputs, wrong font on selects)
- Settings discoverability: 3/10 (no search, no navigation, no dirty state)

---

## B. Redesign

### B.1 Architecture: two-column panel with categorical nav

The 520px modal width accommodates a left nav rail (140px) + right content area (340px with 40px internal padding), matching Bloomberg Terminal's "ticker category rail + detail pane" pattern. This eliminates scrolling for mods who know which category they want while keeping the full setting detail visible on the right.

**Categories (left nav rail):**

```
DISPLAY         (4 settings)
DETECTION       (3 settings -- renamed from "Moderation" for clarity)
AI / CLOUD      (2 settings)
AUTO-ACTIONS    (3 settings + rules link)
FEATURES        (6 feature flags)
TEAM            (lead: Promote/Demote, sync status)
ADVANCED        (Fun, developer flags)
```

Non-leads see 6 categories (TEAM is hidden entirely for non-leads). Leads see 7.

**Key architecture decisions:**

1. **Single active pane, not a scroll.** Clicking a category swaps the right pane. The left rail shows which category is active with the amber accent, mirroring the status bar's semantic clustering.

2. **TEAM category is the promoted surface for lead-only controls.** All lead gates that are currently scattered (Promote/Demote buttons, Auto-Unsticky Monitoring, team sync status) consolidate into one TEAM pane. Non-leads never encounter a gate or a "(lead)" label.

3. **AUTO-ACTIONS consolidates the two auto-unsticky sections.** Client-side and worker-side unsticky controls render in a single pane, side-by-side with clear mode labels ("LOCAL" vs. "WORKER CRON"), eliminating the duplicate threshold rows. The rules editor (autoDeathRowRules, autoTardRules) gets a deep-link entry point in this pane rather than forcing the mod to leave settings.

4. **Search is a first-class affordance.** A filter input at the top of the right pane narrows the visible rows within the current category. A global search (type from anywhere in the panel, no click required) highlights matching settings across all categories with a badge count on the left nav.

5. **Settings-changed indicator.** A small amber dot on the modal title bar appears when any setting has been modified in this session. Settings that require page reload carry a "reload required" tag that batches into a single "Reload now" CTA at the bottom of the right pane.

6. **Role visibility language.** Lead-only rows within a shared category (if any remain after the TEAM consolidation) use a `[LEAD]` monospace badge in amber, not a parenthetical in the section label. The badge is a structural cue, not prose.

### B.2 Pane-by-pane spec

#### DISPLAY pane
Four toggles. No changes to their semantics. Layout: standard `.gs-row` with label + description left, toggle right. "Theme Harmony" gets a `[RELOAD]` tag inline with its label.

#### DETECTION pane
Renamed from "Moderation" because the settings govern detection behavior, not moderation actions. Three selects (Console Position, Default DR Hours, Tards Threshold). Selects use the tokenized `.gs-select` (Geist Mono, OKLCH borders). Tards Threshold adds a live-preview line: "Currently showing X users in Possible Tards."

#### AI / CLOUD pane
Two settings. Adds a status line below the AI Engine select: "Last AI scan: N minutes ago / N items scored today" populated via the same RPC pattern as the Auto-Unsticky status line. This replaces the current invisible feedback vacuum.

#### AUTO-ACTIONS pane
This is the most restructured pane. Three-part layout:

**Part 1: Master switch**
- Auto-Remove SUS/DR Queue Items toggle (the current lone item in section 7)

**Part 2: Auto-Unsticky (two-column sub-panel)**

```
LOCAL (client-side)              |  WORKER CRON (team)
─────────────────────────────────┼────────────────────────────────
Auto-unsticky old/popular   [  ] |  [LEAD] Auto-unsticky enabled [ ]
Max age (hrs)   [  12]           |  Max age (hrs)   [  10]
Min upvotes     [ 110]           |  Min upvotes     [ 110]
AI scan modmail [  ]             |  Last poll: --  |  0 queued  |  0 ex.
                                 |  [View recent actions]
```

The two threshold rows are separate sub-panels within the same pane. The "WORKER CRON" column is visually muted (`--ink-tertiary`) for non-leads with a "Lead-only" overlay replacing the inputs. Leads see the full column with editable inputs.

**Part 3: Rules entry point**
A row with a description and a `[Open rules editor]` button that navigates to the Death Row / Tards rules editor in the main UI without closing the settings modal (or offers to open it in the Mod Log panel). This closes the current gap where the Auto-Actions master switch is in Settings but the rules that govern the actions are elsewhere.

#### FEATURES pane
Six feature flag toggles. For non-leads: standard toggle + label + description. For leads: the Promote/Demote button is elevated from a right-sidebar control to a visible row action, now labeled as "Push to team" / "Pull from team" in full words instead of the current arrow-emoji abbreviations. Team-overridden flags render with a distinct background: `--bg-sunken` + amber left border (1px only, not the banned side-stripe -- here it is a functional state indicator, not decoration). The flag line (`TEAM=true by username`) moves to a full-width info row below the toggle row, in monospace, amber tint.

#### TEAM pane (lead-only -- not rendered for non-leads)
Consolidates:
- All Promote/Demote cross-references (links to which features are currently team-overridden)
- Pattern sync status (last push/pull times for autoDeathRowRules and autoTardRules)
- A manual "Sync now" trigger
- team_settings read-out (key-value table of current team settings from the worker)

The pattern sync status currently has no Settings presence at all -- it operates silently via the SW. Surfacing it here gives leads visibility into whether the sync is working.

#### ADVANCED pane
Easter Eggs toggle. Any future developer/debug flags. Kept last in the nav to avoid mods stumbling on it.

### B.3 Search behavior

A `<input type="search" placeholder="Filter settings..." class="gs-search">` appears at the top of the right pane. It is auto-focused when the panel opens (no extra click required).

Filtering behavior:
- Within-pane: hides non-matching rows, shows matching rows with the search term highlighted in the label
- Cross-pane: shows badge counts on left nav items ("DISPLAY (2)")
- Empty state: "No settings match [term]" with a reset link

Global shortcut: `Ctrl+Shift+S` already opens the panel. Once open, typing immediately routes to the search input (no separate `Ctrl+F`).

### B.4 Dirty state and reload indicator

A `data-dirty` attribute on the modal element tracks whether any setting has been changed. When set, a small amber dot appears in the modal title bar to the right of "Settings". Settings that require page reload are tagged `[RELOAD REQUIRED]` in amber monospace next to the label. If any reload-required setting was changed, a fixed footer appears at the bottom of the right pane: `[2 settings require reload] [Reload page]`.

---

## C. Visual Mockup

```
+----------------------------------------------------------+
|  [X]  Settings                               [*]  [SAVE] |
|       ^^^^^^^^                               ^ dirty dot  |
+----------------+-----------------------------------------+
|                |  [ Filter settings...           ] [x]   |
|  DISPLAY       |                                         |
|                |  DETECTION SETTINGS                     |
|  DETECTION  <-- |  ─────────────────────────────         |
|                |                                         |
|  AI / CLOUD    |  Console position                       |
|                |  Where the Mod Console opens     [   v] |
|  AUTO-ACTIONS  |  CENTER MODAL                          |
|                |                                         |
|  FEATURES      |  Default DR hours                       |
|                |  1-click Death Row queue delay   [   v] |
|  [LEAD] TEAM   |  72 H                                   |
|                |                                         |
|  ADVANCED      |  Possible Tards threshold               |
|                |  Risk signals required for triage [   v] |
|                |  2 SIGNALS (BALANCED)                   |
|                |  Currently showing: 4 users             |
|                |                                         |
+----------------+-----------------------------------------+
```

```
AUTO-ACTIONS pane -- full layout:
+----------------------------------------------------------+
|  AUTO-ACTIONS SETTINGS                                   |
|  ─────────────────────────────────────────────           |
|                                                          |
|  Auto-remove SUS / DR queue items                 [   ] |
|  Remove posts from flagged users after 1.5s undo         |
|                                                          |
|  AUTO-UNSTICKY                                           |
|  ┌──────────────────────┬──────────────────────────┐    |
|  │ LOCAL (this mod)     │ WORKER CRON (team)  [LEAD]│    |
|  │─────────────────────│──────────────────────────│    |
|  │ Auto-unsticky  [  ] │ Enabled           [  ]   │    |
|  │ Max age hrs  [  12] │ Max age hrs     [  10]   │    |
|  │ Min upvotes  [ 110] │ Min upvotes     [ 110]   │    |
|  │ AI scan mail [  ]   │ Last poll: 3m ago        │    |
|  │                     │ 0 queued | 2 exec 24h    │    |
|  │                     │ [View recent actions]    │    |
|  └──────────────────────┴──────────────────────────┘    |
|                                                          |
|  PATTERN RULES                                           |
|  Death Row: 12 rules active  [Open rules editor ->]     |
|  Tard Queue:  8 rules active  [Open rules editor ->]    |
|                                                          |
+----------------------------------------------------------+
```

```
FEATURES pane -- lead view:
+----------------------------------------------------------+
|  FEATURES                                                |
|  Team-overridden: 2 features                            |
|  ─────────────────────────────────────────────          |
|                                                          |
|  Intel Drawer                                     [  ] |
|  v7.0 keyboard-first subject overlay.                   |
|  [Push to team]                                          |
|                                                          |
| ┌─── TEAM OVERRIDE ──────────────────────────────────┐ |
| │ Mod Chat                                      [ON] │ |
| │ v8.2 mod-to-mod messaging.                        │ |
| │ TEAM=true  set by moderator_x  3 days ago         │ |
| │ [Pull from team]                                   │ |
| └─────────────────────────────────────────────────────┘ |
|                                                          |
|  Super-Mod Foundation                             [  ] |
|  v7.1 claim/draft/propose/veto coordination.            |
|  [Push to team]                                          |
|                                                          |
+----------------------------------------------------------+
```

```
Left nav rail detail:
+----------------+
|                |
|  DISPLAY       |  -- 11px caps, ink-tertiary, 8px left pad
|                |
|  DETECTION  <  |  -- active: amber left bar (2px), ink-primary, bg-raised
|                |
|  AI / CLOUD    |
|                |
|  AUTO-ACTIONS  |  -- badge "!" if master switch is on and rules = 0
|                |
|  FEATURES      |  -- badge "2" = team-overridden count (leads only)
|                |
|  [LEAD] TEAM   |  -- amber [LEAD] badge left of label, lead-only row
|                |
|  ADVANCED      |
|                |
+----------------+
```

### C.1 Token mapping for new components

```css
/* Gear panel specific -- extend DESIGN.md tokens */
:root {
  --gs-nav-width:     140px;
  --gs-content-pad:   20px;
  --gs-row-gap:       6px;
  --gs-nav-active-bg: var(--bg-raised);      /* oklch(19% 0.014 280) */
  --gs-nav-active-bar: var(--accent-amber);   /* oklch(74% 0.165 65)  */
  --gs-team-bg:       oklch(17% 0.020 65 / 0.15); /* amber-tinted sunken */
  --gs-team-border:   oklch(74% 0.165 65 / 0.3);
  --gs-badge-bg:      var(--accent-amber);
  --gs-badge-ink:     oklch(12% 0.010 280);  /* near-black */
  --gs-dirty-dot:     var(--accent-amber);
  --gs-reload-tag:    var(--accent-amber);
  --gs-lead-badge-bg: oklch(74% 0.165 65 / 0.15);
  --gs-lead-badge-ink: var(--accent-amber);
}
```

### C.2 Typography rules for this panel

- Nav labels: 10px, `--w-bold` (700), uppercase, `--ink-tertiary` inactive / `--ink-primary` active
- Setting labels: 13px, `--w-semi` (600), `--ink-primary`, Geist Sans
- Setting descriptions: 11px, `--w-regular`, `--ink-secondary`, line-height 1.5
- Select/input values: 11px, Geist Mono, `--ink-primary`, `font-variant-numeric: tabular-nums`
- Tags ([LEAD], [RELOAD], [TEAM=...]): 9px, Geist Mono, `--w-bold`, respective badge colors
- Team override flag line: 10px, Geist Mono, `--ink-tertiary`, italic

---

## D. Effort Estimate

### Scope boundaries

This is a **renderer + CSS change only**. The `getSetting` / `setSetting` / `rpcCall` / `isLeadMod()` APIs are untouched. No new settings keys are added. The threshold rows that currently use hardcoded inline styles get refactored to use CSS classes. The autoDeathRowRules / autoTardRules editors remain in their current location; this panel adds a deep-link entry point only.

### Task breakdown

| Task | Complexity | Hours |
|---|---|---|
| T1: CSS new tokens + nav rail layout | Low | 1.5h |
| T2: `openSettings()` refactor to two-column nav + pane swapping | Medium | 3h |
| T3: DETECTION pane + live tards preview line | Low | 1h |
| T4: AUTO-ACTIONS pane two-column unsticky sub-panel | High | 4h |
| T5: FEATURES pane team-override UX (full-width flag row, "Push/Pull to team" labels) | Medium | 2h |
| T6: TEAM pane (lead-only: sync status, team_settings read-out) | Medium | 2.5h |
| T7: Search / filter input + cross-pane badge counts | Medium | 2.5h |
| T8: Dirty state tracker + reload-required footer | Low | 1.5h |
| T9: AI / CLOUD pane status line (last scan RPC) | Low | 1h |
| T10: Token migration for hardcoded inputs | Low | 1h |
| T11: QA: non-lead view, lead view, search, dirty state, all 8 categories | Low | 2h |
| **Total** | | **22h** |

### Recommended ship sequence

**Phase 1 (can ship independently, ~8h):**
T1 + T2 + T3 + T10 + T11 (partial). Two-column layout with all existing settings in categorized panes, no new behavior. Gets the spatial architecture in place. Ship as v10.x.0.

**Phase 2 (~8h):**
T4 + T5 + T7 + T8. AUTO-ACTIONS pane restructure, Features team UX, search, dirty state. Ship as v10.x.1.

**Phase 3 (~6h):**
T6 + T9 + T11 (full). TEAM pane, AI status line, full QA pass. Ship as v10.x.2.

### Risk flags

- **Promote/Demote refactor (T5):** the current `re-render by close+open` pattern (`closeAllPanels(); openSettings()`) will need to target the specific pane rather than re-opening the full panel. This is a 15-minute fix but must be done or the UX regression (panel jumps back to first nav item on promote) is worse than the current behavior.
- **Two-column layout in 520px modal:** the nav rail + content split at 140+340 leaves only 40px for padding. If any setting description is verbose it will word-wrap aggressively at 340px. Description text should be audited and trimmed during T2.
- **The `autoUnstickyMaxHours` vs `auto_unsticky_max_hours` key duality (T4):** two different camelCase vs snake_case keys control superficially similar thresholds for two different mechanisms. The consolidation into one pane will make this visually obvious and should trigger a conversation about whether the keys should be unified or whether the distinction is load-bearing. Do not rename keys in this ticket -- just surface the duplication in the UI with clear "LOCAL" vs. "WORKER" labels.
