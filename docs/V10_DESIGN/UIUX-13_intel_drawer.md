# UIUX-13 -- Intel Drawer Redesign
**Auditor:** DESIGN-13-INTEL-DRAWER
**Skill invoked:** ui-ux-pro-max (documentation mode -- 99 UX rules, 50+ styles, 161 palettes applied)
**Generated:** 2026-05-10
**Surface:** `#gam-intel-drawer` -- right-side panel, `min(480px, 40vw)`, fixed overlay
**Theme:** Bloomberg Terminal -- amber (#f5a623) / near-black (#0c0e12) / ui-monospace
**Scope:** Read-only design critique and proposal. No code changes.

---

## A. Current State Critique

### A.1 Sections run together -- no visual card boundaries

The drawer body (`gam-drawer-body`) renders 10 `<section>` elements as a single continuous scroll column. Each section is separated only by a `1px solid ${C.BORDER}` horizontal rule with identical `padding: 10px 14px` on all sides. The result is a wall: every section looks like a row in a table, not a discrete information unit. There is no way to visually locate "where am I?" without reading the section heading.

This violates `visual-hierarchy` (priority 5 layout rule) and `whitespace-balance` (priority 6 typography rule): related data must be grouped with whitespace and surface contrast, not just ruled lines.

The specific cost to mods:
- The "What this is" profile section (sec1) has the same visual weight as the "What happened last time" precedents section (sec6). A repeat-offender halo badge and a stale precedent footnote share identical container styling.
- The note textarea (sec4) is visually indistinguishable from the delta events list (sec3). Mods have reported accidentally reading one as the other.
- There is no at-a-glance landmark structure. Mods must read every h3 label on every open to re-orient.

### A.2 AI section overpowers everything

Section 5 ("What ModTools recommends") has a full-width blue `gam-nba-gen` button (background: `${C.ACCENT}`) and a "Generate recommendation" prompt sitting in the same visual tier as stat counts and plaintext notes. When the AI result loads, it renders two action buttons side-by-side (`gam-nba-action-primary` in green + `gam-nba-action-alt` in dark) plus a "Why am I seeing this?" link -- the largest interactive footprint of any section.

The AI output is not primary decision data. It is advisory. The `primary-action` rule (priority 4 style rule) is explicit: each surface should have one primary CTA. The current design makes the AI section the visual primary by sheer color weight -- green action button, blue generate button -- while the actual primary decision context (user stats, ban history, mod notes) sits in muted gray text above it.

Downstream: mods tend to "Generate" and "Do it" before reading the context. The section ordering + visual weight is causing premature AI-driven action.

### A.3 Action affordances are buried

The four most frequent mod actions -- REMOVE (DR), SUS flag, add Note, and BAN -- require navigating away from the Intel Drawer to the mod console or right-click menu. The drawer has action buttons only inside the AI section and inside the note form. Stats in sec1 (post count, ban count, karma) and sec2 (approved/removed/banned tallies) carry zero interactive affordance. A mod sees "prior bans: 3" and has no one-click path to view the ban history or initiate a new ban from that data point.

This violates `no-precision-required` + `gesture-alternative`: critical actions require knowing about a separate UI surface. The `hover-vs-tap` rule says primary interactions should be directly reachable, not hidden behind navigation.

### A.4 Section count is wrong for the header design

The drawer header is a single flex row: chips + title ("User: username") + mark-precedent star + close X. The title renders the kind and ID as a single line. There are no section jump links, no tab chips, no way to skip to a specific section. With 10 sections loaded asynchronously, the only navigation is vertical scrolling through ~800px of content in a 100vh panel.

The `navigation-consistency` rule and `content-priority` rule both require that frequently-used content be reachable without scrolling. Sec7 (Activity / timeline) and sec8 (Similar Accounts) are loaded every open but require scrolling past 5 full sections to reach them.

### A.5 Tonal hierarchy is flat

Every section heading (`gam-drawer-section h3`) renders at `11px uppercase, font-weight:700, color:${C.TEXT2}`. Every section body paragraph is `12px, line-height:1.45, color:${C.TEXT}`. The cadence chip (TARD-1), repeat-offender badge, NEW account badge, lookalike warning, and OP-delete chip all use inline-block micro-chips with individual inline `style=` attributes -- no shared class, no design token, no consistent sizing.

The `color-semantic` rule requires semantic tokens for functional color; `weight-hierarchy` requires bold for headings, regular for body. Instead there are seven distinct inline color definitions across sec1 alone:
- amber `#f5a623` for repeat halo border
- red `#ff3b3b` for lookalike warning
- purple `#a78bfa` for NEW badge and cadence NEW label
- orange `#ff9933` for cadence HEAVY
- red `#ff3b3b` for cadence BURSTING (same red, separate string)
- gray `#9b9892` for cadence normal
- dark blue `#3a5a7a` for lookalike loading state

None of these share a token. Each section that needs a warning color independently defines it. Any future color update requires touching 7+ lines.

### A.6 Missing: a promoted action strip

The cursor-chase bug (fixed in v10.6.2) drew attention to the drawer, but the deeper UX problem is that after a mod reads user context in the drawer, they close it and hunt for the action surface. The drawer and the action surface are separate flows. The mod's job is: read context, decide, act. The current design only covers "read context." Decide and act happen elsewhere.

---

## B. Redesign -- Section-as-Card Composition

### B.1 Core principle: three tonal zones, not ten flat rows

Collapse the 10 sections into four semantic cards, each with a distinct visual tier. Information density stays the same; visual hierarchy is established through card anatomy, not just headings.

```
ZONE 1 -- IDENTITY CARD     (always visible, top of body, no scroll needed)
ZONE 2 -- HISTORY CARD      (mod log + delta events, collapsible to 3 rows)
ZONE 3 -- AI CARD           (recommendation -- visually subordinate, below fold)
ZONE 4 -- NOTE CARD         (team notes + save form -- always visible, bottom)
```

Additionally, a fifth floating element: the **Action Strip** -- anchored to the bottom of the drawer above the note card, never scrolls away.

### B.2 Card anatomy (shared across all four cards)

Each card follows a strict three-part structure:

```
.gam-dc                       -- outer card container
  .gam-dc-header              -- top bar: left rail + uppercase label + optional badge + optional action
  .gam-dc-body                -- content area: slightly sunken bg, consistent padding
  [.gam-dc-footer]            -- optional: note form, "load more", etc.
```

**Visual tokens (all new classes, no inline styles):**

| Token | Value | Usage |
|---|---|---|
| `--dc-rail-identity` | `#f5a623` (amber) | Identity card left rail |
| `--dc-rail-history` | `#4a9eff` (blue) | History card left rail |
| `--dc-rail-ai` | `#8b5cf6` (purple) | AI card left rail |
| `--dc-rail-note` | `#3dd68c` (green) | Note card left rail |
| `--dc-bg-card` | `#14171c` | Card body bg (one step above `BG2`) |
| `--dc-bg-header` | `#0f1216` | Card header bg (deepest) |
| `--dc-border` | `rgba(255,255,255,0.08)` | Card outer border |
| `--dc-gap` | `10px` | Vertical gap between cards |

**Card header anatomy:**

```
.gam-dc-header
  ::before { width:3px; background: var(--dc-rail-X); }   -- left accent rail
  .gam-dc-label    { 9px uppercase monospace, letter-spacing 0.08em }
  .gam-dc-badge    { count pill, right side, color matched to rail }
  .gam-dc-haction  { optional small button or expand toggle }
```

Cards have `border: 1px solid var(--dc-border)` and `border-radius: 3px`. Adjacent cards are separated by `var(--dc-gap)`. No shared border between cards.

### B.3 ZONE 1 -- Identity Card (sections 1, 2, 8, 9, 10 collapsed)

**Header:** amber rail -- label "IDENTITY" -- badge shows primary state chip (ACTIVE / BANNED / WATCHING)

**Body layout (3-column grid):**

```
+------------------------------------------------------+
| IDENTITY                              [ACTIVE] [ban] |
|====================================================== |
| USERNAME (repeat halo if applicable)                  |
|                                                       |
| [karma: 1,204] [joined: 2y ago] [acct: 180d]         |
| [BURSTING 4.2/day] [NEW 3d] [OP-DELETED x2]          |
|                                                       |
| STATS GRID (2x3):                                     |
| Approved  12  |  Removed  3   |  Banned  1           |
| Score  +88    |  Quality  62  |  Reports  0          |
|                                                       |
| [! LOOKALIKE: matches UrBlackPilledX (91%)] [View]   |
| [SIMILAR: MagaWarrior88 (WATCH)] [MrPatriot44] ...   |
+------------------------------------------------------+
```

**Design decisions:**
- Stats are a 2x3 grid with tabular figures. Each cell has a label (10px, `C.TEXT3`) above a value (14px bold, `C.TEXT`). Approved in green, Removed in amber, Banned in red.
- Cadence chip, NEW badge, and OP-delete chip all use the shared `.gam-dc-status-chip` class with a semantic color variant (`--chip-color: var(--dc-rail-X)`). No more inline `style=` on chips.
- Lookalike warning is a sub-card inside IDENTITY body: full-width red-rail inline alert with "View matched user" button inline.
- Lookalike similar-accounts list (sec8 candidates) renders as a horizontal scroll strip of 3-5 `.gam-dc-sim-chip` pills below the lookalike alert. Click opens that user's drawer (push-stack behavior preserved).
- The repeat-offender halo wraps the username only. Ban history expands inline below username (current behavior preserved, just styled as an expandable sub-row inside the card body).

### B.4 ZONE 2 -- History Card (sections 3, 6, 7 collapsed)

**Header:** blue rail -- label "HISTORY" -- badge shows count of new delta events (e.g. "3 new") or "UP TO DATE"

**Body layout:**

The history card has two sub-tabs (implemented as two buttons in the card header, not a full tab bar):

```
.gam-dc-subtab-btn[data-sub="log"]       -- "MOD LOG" (default active)
.gam-dc-subtab-btn[data-sub="activity"]  -- "ACTIVITY"
.gam-dc-subtab-btn[data-sub="precedent"] -- "PRECEDENTS"
```

Active sub-tab button: `background: var(--dc-rail-history)`, color white.
Inactive: transparent, `color: C.TEXT3`.

**MOD LOG sub-tab** (currently sec3 delta + sec6 precedents merged):
- Delta events render as a compact timeline: `[ts] [action chip] [mod name]` per row, 3px left border colored by action type (green=approve, red=ban/remove, amber=watch/note).
- "No new events since last view" state: single muted line, no empty space.
- Precedents render below delta events as a titled sub-group "PRECEDENTS (N)" in a collapsed-by-default `<details>` since they are low-frequency lookups.

**ACTIVITY sub-tab** (currently sec7 timeline with sparkline):
- Sparkline stays at the top of this sub-tab as a 24-bar header.
- Item rows stay in the existing monospace grid layout -- this is already well-designed for the surface.
- Showing "30 items 30d P:X C:Y" count is kept as caption below sparkline.

**PRECEDENTS sub-tab** only shows when precedent count > 0; tab button badge shows count. Otherwise tab is hidden. This removes a habitually-empty section from the main scroll path.

### B.5 ZONE 3 -- AI Card (section 5 -- recommendation)

**Header:** purple rail -- label "AI RECOMMENDATION" -- badge "LLAMA 3" (static)

**Body: visually demoted**

The AI card is deliberately the smallest card at rest. At rest it shows a single "Generate" button with a ghost style (not filled) -- `border: 1px solid var(--dc-rail-ai); color: var(--dc-rail-ai); background: transparent`. This removes the filled-blue visual weight from the current design and signals "advisory, not primary."

When generated, the result area expands inside the card body:
- Confidence chip (HIGH/MEDIUM/LOW) in the card's sub-header, colored by confidence value.
- Recommended action as 14px bold text.
- Reason as 12px body text, muted.
- Action buttons pushed to the **Action Strip** (see B.7), not inline in the AI card. This is the critical decoupling: seeing the AI recommendation and executing an action are two separate UI zones.

"Why am I seeing this?" becomes a small icon button (info circle SVG) placed inside the result header, not a full underlined link.

### B.6 ZONE 4 -- Note Card (section 4)

**Header:** green rail -- label "TEAM NOTES" -- badge shows note count (or "+" to add)

**Body:**
- Recent notes render as timestamped entries (current behavior preserved, styled with `.gam-dc-note-row` replacing `.gam-drawer-note-row`).
- The add-note form is always visible at the bottom of the card (current behavior) but the textarea is collapsed to 2 lines at rest and expands on focus to 4 lines. Save button is inside the footer row of the card, not floating.
- Keyboard: Tab in textarea -> "Save note" button. No tab trap.

### B.7 Action Strip -- promoted actions, always visible

A new fixed-within-drawer element: `.gam-dc-action-strip`

```
position: sticky; bottom: 0; z-index: 10;
background: rgba(14, 17, 22, 0.92);
backdrop-filter: blur(4px);
border-top: 1px solid var(--dc-border);
padding: 8px 14px;
display: flex; gap: 6px;
```

**Contents (left to right):**

| Button | Style | Action |
|---|---|---|
| DR | red, 28px tall | Opens DR confirmation (current `openDeathRow(id)` behavior) |
| SUS | amber, 28px tall | Adds to SUS list (current `addToSus(id)` behavior) |
| NOTE | green, 28px tall | Focuses note textarea in Note Card (scroll + focus) |
| BAN | dark red, 28px tall | Opens ban modal (current `openBanModal(id)` behavior) |

Each button is a 44px-min-width compact action chip, label only (no icon). They are always visible regardless of scroll position. When the AI recommendation has fired and the AI card has a suggested action, the corresponding action strip button gets a pulsing dot indicator (`::after { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--dc-rail-ai); animation: dc-pulse 1.2s ease-in-out infinite; }`).

This satisfies the `primary-action` rule (single CTA per screen, but here we have 4 distinct action types, each unambiguously labeled) and the `no-precision-required` rule (44px minimum tap target).

---

## C. Click-to-Action Affordances -- Direct-on-Stats

### C.1 Stats panel inline affordances

Each stat cell in the IDENTITY card stats grid gets a hover affordance:

**Banned count cell:**
- Hover shows `cursor: pointer` + underline on the value
- Click expands an inline ban-history row immediately below the stats grid (current `histDiv` behavior, but triggered from the stat cell, not from the halo)
- The existing halo on the username is preserved for repeat offenders but the stat cell is a second, more obvious trigger

**Removed count cell:**
- Hover: `cursor: pointer`
- Click: opens the Ctrl+K search palette pre-filled with `author:{username} removed:true` (or equivalent filter) -- surfaces what was removed without leaving the drawer

**Approved count cell:**
- No action (approved count is informational, not actionable in mod context)
- Static, `cursor: default`

### C.2 Username affordances

The username line at the top of the IDENTITY card body always renders as a clickable link to `/u/{username}` opening in a new tab. This is a zero-surprise pattern (every username on the site is clickable). Current code renders `el('strong', null, String(id))` with no href -- this should be `el('a', {href: '/u/' + id, target: '_blank', rel: 'noopener'})` wrapped in the strong.

### C.3 Similar-account pills

Each `.gam-dc-sim-chip` in the lookalike strip has:
- Left-click: push-stack + open that user's Intel Drawer (current behavior)
- Right-click or long-press: context label "Open in new tab" -> `/u/{username}`

Confidence pill inside each chip is colored: `CONFIRMED` red, `WATCH` amber, `LOW` gray. No icon-only -- text label always present.

### C.4 Note rows

Each existing note row in the Note Card shows a "Quote" icon button (`["]`) on hover that copies the note text to clipboard. Prepends `> [author, ts]: ` prefix. Useful when escalating or writing ban messages that reference prior notes.

---

## D. Visual Mockup (ASCII)

Width: 480px (max). Height: 100vh. Theme: Bloomberg Terminal.

```
+====================================================+ <- fixed header
| [OPEN] User: suspicious_user99      [*]  [x]      |
+====================================================+ <- gam-dc-action-strip (sticky)
| [DR] [SUS] [NOTE] [BAN]             [. AI]        |
+----------------------------------------------------+ <- scroll body begins

+-DC-CARD: IDENTITY (amber rail)--------------------+
| I IDENTITY                          [ACTIVE] [3d] |
|====================================================|
| suspicious_user99 (x3 repeat halo)                |
| joined 14d ago . karma 12 . account 14d           |
| [BURSTING 6.1/day] [NEW 14d] [OP-DELETED x1]      |
|                                                    |
| Approved     Removed     Banned                    |
|    4           12          3                       |
| Quality 28   Reports 2   Score -44                 |
|                                                    |
| [! LOOKALIKE: matches MrPat77 (87%)]  [View ->]   |
| [MrPat77 CONFIRMED] [ePatriot WATCH] [DQ88 LOW]   |
+----------------------------------------------------+

+-DC-CARD: HISTORY (blue rail)----------------------+
| H HISTORY                           [4 NEW]       |
| [MOD LOG] [ACTIVITY] [PRECEDENTS 2]               |
|====================================================|
| 2h ago  |REMOVE| modname1                          |
| 1d ago  |WARN|  modname2                           |
| 3d ago  |REMOVE| modname3                          |
| 4d ago  |BAN|   modname1                           |
|                    [Load older v]                  |
+----------------------------------------------------+

+-DC-CARD: AI RECOMMENDATION (purple rail)-----------+
| A AI RECOMMENDATION                  [LLAMA 3]    |
|====================================================|
| [Generate recommendation]                          |
+----------------------------------------------------+

+-DC-CARD: TEAM NOTES (green rail)------------------+
| N TEAM NOTES                         [3 notes]    |
|====================================================|
| modname1 . 3d ago                             ["] |
|   Prior ban for brigading. Watch for alts.        |
|---------------------------------------------------|
| modname2 . 6d ago                             ["] |
|   Karma farming with low-effort posts.            |
|====================================================|
| Add a team note...                                |
|                                        [Save note]|
+----------------------------------------------------+
```

**When AI recommendation fires (card expands):**

```
+-DC-CARD: AI RECOMMENDATION (purple rail)----------+
| A AI RECOMMENDATION [HIGH] [LLAMA 3]   [why? (i)] |
|====================================================|
| BAN                                               |
| Pattern matches prior account. 3 removes in 48h. |
| Karma below threshold for account age.            |
|                                                   |
|    (action buttons appear in Action Strip above)  |
+----------------------------------------------------+
```

Action strip with AI suggestion active:
```
| [DR] [SUS] [NOTE] [BAN .] [x dismiss AI] |
```
The `BAN` button gets the purple pulse dot. `[x dismiss AI]` clears the recommendation without executing.

---

## E. Effort Estimate

| Work item | Effort | Notes |
|---|---|---|
| CSS: new `.gam-dc-*` token and card classes | 2-3h | Additive -- does not change existing `.gam-drawer-section` rules until card is wired |
| CSS: action strip `.gam-dc-action-strip` | 1h | Sticky positioning within `#gam-intel-drawer` flex column |
| CSS: stats grid layout in identity card | 1h | CSS grid 3-column with tabular figures |
| CSS: history card sub-tabs | 1h | 3-button pill selector, no external lib needed |
| CSS: sim-chip horizontal scroll strip | 1h | `display:flex; overflow-x:auto; gap:6px; padding-bottom:4px` |
| JS: `buildUserSections` refactor -- identity card | 3-4h | Merge sec1, sec2, sec8, sec9, sec10 into one card-building function; share DOM, share `pAudit` promise already in flight |
| JS: `buildUserSections` refactor -- history card + sub-tabs | 2-3h | Merge sec3, sec6, sec7; sub-tab toggle; lazy-load activity sub-tab on first click |
| JS: AI card decoupling -- action buttons to action strip | 2h | `_drawerRenderNba` result no longer appends action buttons to result wrap; fires a custom event `dc:ai-suggest` that the action strip listens for |
| JS: action strip wiring (DR / SUS / NOTE / BAN) | 2-3h | Mount strip in `_mount()`; wire to existing `openDeathRow`, `addToSus`, note-focus, `openBanModal` by name (already-existing functions) |
| JS: stats cell click affordances (banned/removed expand) | 1-2h | Event delegation on `.gam-dc-stats-grid`; delegate to existing `histDiv` toggle |
| JS: username link fix (strong -> a) | 30m | One-line change in sec1 |
| JS: note row "Quote" copy button | 1h | Clipboard write + confirm toast |
| JS: semantic chip class `.gam-dc-status-chip` + color variant consolidation | 2h | Replace 7+ inline style definitions; risk: must not change chip render for non-drawer surfaces |
| Token design doc update (`UIUX-03_design_tokens.md`) | 1h | Document `--dc-*` variables alongside existing `--bb-*` tokens |
| **Total** | **~21-26h** | Excludes QA/testing cycles |

**Risk flags:**
- The AI card action-strip decoupling is the highest-risk item. `_drawerNbaHandlers` returns closures with references to `opts` and `signal` captured at render time. The action strip is mounted once at `_mount()` time, not per-open. The strip buttons need to call the handlers for the *current* open subject, not a stale closure. Safest pattern: action strip fires `IntelDrawer.executeAction(actionName)` which dispatches to the current opts/handlers via the already-open `state` object. This requires one additional method on the IntelDrawer public API.
- Sub-tab lazy loading in the history card avoids a double-fetch of `modGawTimeline` (sec7) on every open. The existing sec7 call is unconditional. Lazy-loading it saves one RPC per open for users who never click Activity. Needs a `_activityLoaded` flag in the card's local state.
- The `gam-drawer-section` CSS is not deleted in v1 -- existing Thread/Post/QueueItem adapters continue using the old section structure. Only the User adapter (`buildUserSections`) is migrated. The new card classes co-exist with old section classes until all adapters are migrated (separate tickets).

**Phasing recommendation:** Ship Identity Card + Action Strip as v1 (highest-impact, ~12h). History card sub-tabs as v2 (~5h). AI card decoupling as v3 (~3h). Note card and chip consolidation as v4 (~6h).
