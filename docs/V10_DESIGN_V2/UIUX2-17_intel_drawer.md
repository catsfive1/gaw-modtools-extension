# UIUX2-17 -- Intel Drawer V2 Redesign
**Auditor:** UIUX2-17-INTEL-DRAWER
**Skill invoked:** ui-ux-pro-max (section-as-card, sticky action strip, scannable hierarchy, AI demotion)
**Source read:** `modtools.js` IntelDrawer IIFE (lines 5592-6089) + `buildUserSections` (lines 6303-6718)
**Prior v1 doc:** `docs/V10_DESIGN/UIUX-13_intel_drawer.md`
**Generated:** 2026-05-10
**Surface:** `#gam-intel-drawer` -- right-side panel, `min(480px, 40vw)`, fixed overlay
**Theme:** Bloomberg Terminal -- amber / near-black / ui-monospace
**Scope:** Design critique and full V2 specification. No code changes; V2 is the design brief ralph works from.

---

## A. Current State Audit -- v10.12.3

### A.1 What is actually rendered today

`buildUserSections` returns 10 async section promises: sec1..sec10. The `_renderSections` scaffold mounts those 10 `<section class="gam-drawer-section">` elements with identical `h3` headers and skeleton placeholders. The drawer body is a single scroll column. Each section is separated by a `1px solid border` with identical `padding: 10px 14px`. Visual result: a wall.

The 10 sections and their data:

| # | Label in h3 | Data source | Async cost | Frequency of use |
|---|---|---|---|---|
| sec1 | What this is | `modProfilesRead` + `modUserCadence` | 1 RPC + 1 RPC | Every open |
| sec2 | Why it matters | `modAuditQuery` (shared with sec5) | 0 extra | Every open |
| sec3 | What changed | `modIntelDelta` | 1 RPC | Every open |
| sec4 | What the team knows | `modProfilesRead` (shared) + note form | 0 extra | Every open |
| sec5 | What ModTools recommends | Click-to-generate, then `modAiNextBestAction` | On click only | ~40% of opens |
| sec6 | What happened last time | `modPrecedentFind` | 1 RPC | Every open |
| sec7 | Activity | `modGawTimeline` | 1 RPC (heavy) | Every open, rarely scrolled to |
| sec8 | Lookalikes | `/admin/users/lookalikes` (direct fetch) | 1 RPC | Every open, often zero results |
| sec9 | OP Deletes | `modOpDeletes` | 1 RPC | Every open, usually 1 line |
| sec10 | Lookalike confirmed | `modUserLookalikeConfirmed` | 1 RPC | Every open, usually "no record" |

**RPCs fired per open (User kind):** 7 unconditional + 1 click-triggered. Every open: `modProfilesRead`, `modUserCadence`, `modIntelDelta`, `modPrecedentFind`, `modAuditQuery`, `modGawTimeline`, `/admin/users/lookalikes`, `modOpDeletes`, `modUserLookalikeConfirmed`. That is 9 parallel fetches for a surface opened on every username hover.

### A.2 Wall-of-sections problem (CRITICAL)

All 10 sections have identical visual treatment: same `h3` font (11px uppercase, `C.TEXT2`), same body font (12px, `C.TEXT`), same `1px` divider, same padding. There is no tonal differentiation between:
- The identity summary (sec1, high-frequency scan target)
- The AI recommendation (sec5, advisory only)
- The note textarea (sec4, action-capable)
- The precedents (sec6, low-frequency reference)

A mod opening the drawer for the first time has no at-a-glance landing zone. They must read all 10 `h3` labels linearly. After sec1 and sec2 (which sit above the fold), sec7 (Activity sparkline) and sec8 (Lookalikes) require scrolling past 4 full sections. The sparkline in sec7 is the most visually rich element in the whole drawer but it is buried at position 7.

`content-priority` (Layout priority 5): core content first on small surfaces, fold or hide secondary content. Violated. `visual-hierarchy` (same): hierarchy via size, spacing, contrast -- not just labels. Violated.

### A.3 AI section is the visual primary (HIGH)

`_drawerRenderNba` renders a full-width, filled `gam-nba-gen` button in blue. When a result loads, the action buttons (`gam-nba-action-primary` in green, `gam-nba-action-alt` in dark) are the largest interactive elements in the drawer. The AI section's color weight -- blue button, green "Do it" CTA -- visually outranks the amber stat numbers in sec1 and the red ban count in the repeat-offender halo.

The `primary-action` rule (Style priority 4): each screen should have one primary CTA; secondary actions visually subordinate. The AI recommendation is advisory. Mods are closing the drawer after "Do it: BAN" without reading the note from three days ago that says "do not ban -- escalating to lead." The visual weight is driving the wrong behavior.

### A.4 No action strip (HIGH)

The four highest-frequency mod decisions -- Death Row, SUS flag, add Note, Ban -- require leaving the Intel Drawer. The drawer is read-only for all primary actions. Mods read context in the drawer, close it, navigate to the mod console or right-click menu, and then act. This is a guaranteed two-surface flow for the most common mod operation.

`gesture-alternative` (Touch priority 2): always provide visible controls for critical actions. `hover-vs-tap` (same): primary interactions must be directly reachable. The current drawer provides zero primary action reachability.

### A.5 Inline color chaos -- 9 distinct hardcoded hex values in sec1 alone

Every signal chip in sec1 is an independent inline `style=` definition:
- Cadence BURSTING: `#ff3b3b`
- Cadence HEAVY: `#ff9933`
- Cadence NEW: `#a78bfa`
- Cadence normal: `#9b9892`
- NEW account badge: `border: 1px solid #a78bfa; color: #a78bfa`
- Repeat halo (CSS class, fine)
- OP-delete chip: `border: 1px solid #ff3b3b; color: #ff3b3b`
- Lookalike confirmed: `border: 1px solid #ff3b3b; color: #ff3b3b`
- Lookalike loading: `color: #3a5a7a`

Nine inline color strings. `color-semantic` (Typography priority 6): define semantic color tokens; no raw hex in components. Any future color audit requires touching 9+ call sites.

### A.6 sec9 and sec10 are dead weight at scroll position 9-10

`sec9` (OP Deletes) renders either a single chip or "No OP self-deletions in last 30d." -- one line. `sec10` (Lookalike confirmed) renders either a red alert box or "No confirmed lookalike on record." -- one line. Both sections are shown as full `<section>` elements with dedicated `h3` headers at positions 9 and 10 of a 10-section scroll column. A mod that scrolls to sec9 finds 11px of text. The visual real estate cost is 5-8x the information value.

Both of these signals belong in the IDENTITY card (see Section B). They are identity-characterizing signals, not separate sections.

### A.7 sec7 Activity is an unconditional heavy fetch at wrong position

`modGawTimeline` is fired for every User drawer open regardless of whether the mod ever scrolls to sec7. The fetch pulls 30 days of posts and comments, merges and sorts up to 50 items, renders a 24-bucket sparkline. This is the most expensive section both in data transfer and DOM creation. It sits at position 7, meaning approximately 60% of opens pay for it and never see it.

`performance / lazy-loading` (Performance priority 3): lazy load non-hero components. sec7 is the canonical candidate for lazy-load-on-click.

### A.8 The mods-only note (sec4) note form is missing keyboard exit

The `<textarea>` in sec4 has no `Tab` key handling. A mod who tabs into the textarea is trapped until they Shift-Tab or use the mouse to exit. `keyboard-nav` (Accessibility priority 1): Tab order matches visual order, full keyboard support. The note form breaks this.

### A.9 Header is minimal; no section landmarks visible at rest

The drawer header is: `[state chip] [title: "User: username"] [star] [X]`. No section jump links, no tab strip, no "jump to activity" affordance. With 10 sections in a 100vh panel, the only navigation is vertical scroll with no landmarks.

---

## B. V2 Architecture -- Four Cards + Action Strip

### B.1 The decision: collapse 10 flat sections into 4 semantic cards

The wall disappears by introducing card anatomy: distinct `border-top-color` rail per card, card-level header with label + badge, card body with slightly different background from the drawer body. Information stays the same; structure becomes legible at a glance.

**Card map:**

| Card | Rail color | Absorbs sections | Sticky? |
|---|---|---|---|
| IDENTITY | Amber `#f5a623` | sec1 + sec2 + sec9 + sec10 | No |
| HISTORY | Blue `#4a9eff` | sec3 + sec6 + sec7 | No |
| AI RECOMMENDATION | Purple `#8b5cf6` | sec5 | No |
| TEAM NOTES | Green `#3dd68c` | sec4 | No |
| ACTION STRIP | N/A | New -- DR/SUS/NOTE/BAN | Yes (sticky bottom) |

**sec8 (Lookalikes similar-account list):** absorbed into IDENTITY card as a horizontal pill strip. It is identity characterization data, not a separate card.

### B.2 Card anatomy (canonical, shared across all four)

```
.gam-dc                       -- outer card container
  .gam-dc-header              -- top bar: left rail + label + badge + optional actions
  .gam-dc-body                -- content area
  [.gam-dc-footer]            -- optional: note form, load-more, etc.
```

CSS tokens (new `--dc-*` namespace; does not conflict with existing `--bb-*` tokens):

```css
--dc-rail-identity : #f5a623;
--dc-rail-history  : #4a9eff;
--dc-rail-ai       : #8b5cf6;
--dc-rail-note     : #3dd68c;
--dc-bg-body       : #14171c;   /* one step above BG2 */
--dc-bg-header     : #0f1216;   /* deepest */
--dc-border        : rgba(255,255,255,0.08);
--dc-gap           : 10px;      /* vertical gap between cards */
```

Card header structure:
```
.gam-dc-header
  ::before { width: 3px; background: var(--dc-rail-X); height: 100%; }  /* left accent rail */
  .gam-dc-label   { 9px uppercase monospace, letter-spacing: 0.08em, color: C.TEXT3 }
  .gam-dc-badge   { count pill right-aligned, color matched to rail }
  .gam-dc-haction { optional small ghost button or sub-tab strip }
```

Card outer: `border: 1px solid var(--dc-border); border-radius: 3px; margin-bottom: var(--dc-gap)`.

### B.3 Shared chip class: `.gam-dc-chip`

Replaces every inline-styled chip across the drawer. Usage:

```css
.gam-dc-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(var(--chip-rgb), 0.12);
  border: 1px solid rgba(var(--chip-rgb), 0.6);
  color: rgb(var(--chip-rgb));
  font: 700 9px ui-monospace, monospace;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 1px 6px;
  white-space: nowrap;
}
/* Variant: --chip-rgb set by modifier class */
.gam-dc-chip--amber  { --chip-rgb: 245, 166, 35; }
.gam-dc-chip--red    { --chip-rgb: 255, 59, 59; }
.gam-dc-chip--purple { --chip-rgb: 167, 139, 250; }
.gam-dc-chip--blue   { --chip-rgb: 74, 158, 255; }
.gam-dc-chip--green  { --chip-rgb: 61, 214, 140; }
.gam-dc-chip--gray   { --chip-rgb: 155, 152, 146; }
```

Cadence BURSTING -> `gam-dc-chip--red`, HEAVY -> `gam-dc-chip--amber`, NEW -> `gam-dc-chip--purple`, normal -> `gam-dc-chip--gray`. OP-delete -> `gam-dc-chip--red`. NEW account -> `gam-dc-chip--purple`. Lookalike confirmed -> `gam-dc-chip--red` (inline inside the identity card alert row, not a separate section). Nine inline style strings become six modifier classes.

---

## C. Card Specifications

### C.1 IDENTITY Card (amber rail)

**Header:**
- Rail: amber
- Label: "IDENTITY"
- Badge right: primary state chip (`ACTIVE` / `BANNED` / `WATCHING` / `ESCALATED`) using existing `stateChip()` -- color stays, just repositioned to badge slot
- No sub-tabs

**Body layout (vertical stack):**

```
USERNAME_LINE
  [usernameLink] [repeat-badge if applicable] [NEW chip if is_new] [OP-DEL chip if > 0]

META_LINE
  joined Nd ago . karma NNN . account Nd

CHIPS_ROW
  [BURSTING N.N/day] or [HEAVY] or [normal] depending on cadence

STATS_GRID (CSS grid 3 columns)
  Approved  Removed  Banned
    NN        NN       NN
  Quality   Reports  Score
    NN        NN      -NN

LOOKALIKE_ALERT (only if sec10 confirms lookalike)
  [! LOOKALIKE: matches BannedUser88 (91%)]  [View ->]

SIMILAR_STRIP (from sec8, only if candidates > 0)
  horizontal flex-scroll row of sim-chips: [MrPat77 CONFIRMED] [ePatriot WATCH] ...
```

**Stats grid design:**
- CSS grid: `grid-template-columns: repeat(3, 1fr)`
- Each cell: label row (9px, `C.TEXT3`) + value row (16px bold, `C.TEXT`)
- Approved column value: `color: var(--dc-rail-note)` (green)
- Removed column value: `color: var(--dc-rail-identity)` (amber)
- Banned column value: `color: #ff3b3b` (red -- severity is high enough to warrant its own token `--dc-danger: #ff3b3b`)
- Negative Score value: `color: #ff3b3b`, positive: `color: var(--dc-rail-note)`
- All values use tabular figures: `font-variant-numeric: tabular-nums`

**Banned count cell: click affordance.**
Hover: `cursor: pointer`, underline on value. Click: expands inline `histDiv` immediately below stats grid (existing expand behavior, triggered from stat cell instead of just the halo). The halo on username remains as a second trigger for the same expand.

**Removed count cell: no action.** (Removed content query would require a separate API surface not yet available. Placeholder for V3.)

**Lookalike alert row** (replaces sec10 standalone section):
- Only rendered when `modUserLookalikeConfirmed` returns `is_confirmed_lookalike: true`
- Same red-alert box from current sec10 but inline inside IDENTITY body, not a standalone section
- "View matched user" button behavior unchanged

**Similar accounts strip** (replaces sec8 standalone section):
- Only rendered when `/admin/users/lookalikes` returns `candidates.length > 0`
- Horizontal `overflow-x: auto` flex row of `.gam-dc-sim-chip` pills
- Each pill: `[username] [confidence-chip]`
- Confidence chip uses `.gam-dc-chip` modifier: CONFIRMED -> red, WATCH -> amber, LOW -> gray
- Click: existing push-stack + open that user's drawer behavior unchanged
- Zero-candidates state: strip is not rendered at all (no "No lookalikes found" placeholder in the identity card; that information is low-value silence)

**OP-delete chip** (replaces sec9 standalone section):
- Only rendered when `modOpDeletes` returns `userDels.length > 0`
- Inline chip on USERNAME_LINE: `gam-dc-chip gam-dc-chip--red` with text "OP-DEL x3"
- Zero-delete state: chip is omitted entirely

**Lazy data:** sec8 (`/admin/users/lookalikes`) and sec10 (`modUserLookalikeConfirmed`) still fire in parallel with the other RPCs. Their results populate slots inside the IDENTITY card body asynchronously. The card body has named placeholder elements (`#dc-ident-lookalike-alert`, `#dc-ident-sim-strip`, `#dc-ident-opdel`) that are initially hidden and revealed on data arrival.

### C.2 HISTORY Card (blue rail)

**Header:**
- Rail: blue
- Label: "HISTORY"
- Badge right: count of new delta events since last view ("3 NEW") or "UP TO DATE"
- Sub-tab strip in header right area: three ghost buttons `[MOD LOG]` `[ACTIVITY]` `[PRECEDENTS N]`
  - Active tab: `background: var(--dc-rail-history); color: #fff`
  - Inactive: `background: transparent; color: C.TEXT3`
  - PRECEDENTS tab is hidden entirely when precedent count is 0

**MOD LOG sub-tab (default active):**
- Delta events from sec3, compact timeline rows
- Each row: `[timestamp] [action-chip] [mod name]`
- Row left border (3px) color by action: approve -> green, ban/remove -> red, watch/note -> amber
- "No new events since last view" state: single muted line, no empty container
- Below delta events: `<details>` collapsed section labeled "PRECEDENTS (N)" -- this moves precedent content to a secondary collapse inside the MOD LOG tab for cases where precedents exist but are infrequently needed

**ACTIVITY sub-tab (lazy-loaded):**
- `modGawTimeline` RPC is NOT fired at drawer open
- RPC fires on first click of the ACTIVITY tab
- A `_activityLoaded` flag on the card's local state prevents double-fetch
- Existing sparkline header + item rows (sec7 content) render inside this sub-tab unchanged
- Skeleton shown in the tab body until data arrives

**PRECEDENTS sub-tab:**
- Only visible when `modPrecedentFind` returns `rows.length > 0`
- Tab badge shows count
- Precedent rows from sec6 rendered inside this tab
- "Apply same" button behavior unchanged

**Design rationale for lazy Activity:** `modGawTimeline` is the heaviest single RPC in the drawer. Mods looking up a user to decide on a ban rarely need the 30-day activity sparkline -- they need the mod log and identity stats. Moving the sparkline behind a tab click eliminates 1 unconditional heavy fetch per hover, while keeping the data fully accessible one click away.

### C.3 AI RECOMMENDATION Card (purple rail)

**Header:**
- Rail: purple
- Label: "AI RECOMMENDATION"
- Badge right: "LLAMA 3" (static model label, muted)

**Body -- at rest (before Generate clicked):**
- Single ghost button: `border: 1px solid var(--dc-rail-ai); color: var(--dc-rail-ai); background: transparent; padding: 6px 12px`
- Label: "Generate recommendation"
- No filled color. No size competition with the action strip.

**Body -- after Generate, loading:**
- Ghost button disabled: `opacity: 0.5`
- `renderSkeleton('card')` placeholder in result area (existing __uxOn behavior preserved)

**Body -- after Generate, result:**
```
[CONFIDENCE_CHIP]  RECOMMENDED_ACTION_LABEL     [why? (i)]
Reason text line 1.
Reason text line 2.
```
- Confidence chip: `gam-dc-chip` with modifier -- HIGH -> green, MED -> amber, LOW -> gray, NO_MODEL -> red
- Recommended action label: 14px bold, `C.TEXT` -- NOT a button
- "why? (i)" is an info-circle icon button (`aria-label="Why am I seeing this?"`) 16px, muted, right of action label
- **No inline "Do it" or alternate action buttons.** Action execution moves entirely to the Action Strip.
- When a result is present, the corresponding Action Strip button gets a purple pulse indicator (see D.4)
- A "Dismiss recommendation" ghost button (small, muted) appears bottom-right of result: clears the result, re-shows the Generate button, removes pulse from Action Strip

**Critical decoupling rationale:** In v10.12.3, mods click "Do it: BAN" inside the AI card without reading the context sections above. The green filled button is the largest CTA in the drawer. Moving action execution to the Action Strip forces the action zone and the recommendation zone to be spatially separate. Mods see the recommendation, then look at the action strip to execute -- a two-step interaction that inserts a visual pause between reading and acting.

### C.4 TEAM NOTES Card (green rail)

**Header:**
- Rail: green
- Label: "TEAM NOTES"
- Badge right: note count ("3") or "+" if zero notes

**Body:**
- Existing note rows: `[author] [timestamp]` + note text
- Each row: hover shows Quote icon button `["]` right-aligned -- click copies `> [author, ts]: note text` to clipboard with a snack confirmation
- Notes render newest-first (existing behavior preserved)
- Empty state: "No team notes yet. Add the first below."

**Footer (always visible, not collapsible):**
- Textarea: `rows="2"` at rest, expands to `rows="4"` on focus via CSS `textarea:focus { rows }` resize
- Actually: `min-height: 40px; max-height: 88px; resize: none` + `textarea:focus { min-height: 72px }`
- Tab key in textarea -> moves to Save Note button (explicit `tabIndex` management, no tab trap)
- Save Note button: `gam-nba-action-alt` style, right-aligned in footer
- Keyboard: Enter does NOT submit (mods write multi-line notes). Ctrl+Enter submits.
- Save behavior: existing `rpcCall('modProfilesWritePatch')` + `IntelDrawer.refresh(4)` unchanged

---

## D. Action Strip

### D.1 Structure

A new mounted-once element `.gam-dc-action-strip` anchored to the bottom of the drawer. It is part of the drawer's flex column but uses `position: sticky; bottom: 0` so it stays visible regardless of scroll position within the body.

```
position: sticky;
bottom: 0;
z-index: 10;
background: rgba(14, 17, 22, 0.94);
backdrop-filter: blur(4px);
border-top: 1px solid var(--dc-border);
padding: 7px 14px;
display: flex;
align-items: center;
gap: 6px;
```

### D.2 Buttons (left to right)

| Button | CSS class | Color | Min-width | Action |
|---|---|---|---|---|
| DR | `gam-dc-act gam-dc-act--dr` | `#ff3b3b` bg, white text | 44px | `openDeathRow(currentId)` then `IntelDrawer.close()` |
| SUS | `gam-dc-act gam-dc-act--sus` | `#f5a623` bg, black text | 44px | existing `addToSus(currentId)` then close |
| NOTE | `gam-dc-act gam-dc-act--note` | `var(--dc-rail-note)` bg, black text | 44px | scrolls drawer body to TEAM NOTES card + focuses textarea |
| BAN | `gam-dc-act gam-dc-act--ban` | `#991b1b` bg, white text | 44px | `openModConsole(currentId, null, 'ban')` then close |
| WATCH | `gam-dc-act gam-dc-act--watch` | outline only (`var(--dc-rail-identity)` border+text, transparent bg) | 44px | `rosterSetStatus(id, 'watching')` + snack, no close |
| MSG | `gam-dc-act gam-dc-act--msg` | outline only (blue border+text) | 44px | `openModConsole(currentId, null, 'note')` then close |

Strip button base style:
```css
.gam-dc-act {
  padding: 4px 10px;
  min-width: 44px;
  height: 28px;
  font: 700 10px ui-monospace, monospace;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid transparent;
  border-radius: 2px;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 150ms ease;
}
.gam-dc-act:hover { opacity: 0.85; }
.gam-dc-act:active { opacity: 0.7; }
```

NOTE button behavior detail: clicking NOTE does NOT close the drawer. It scrolls `state.bodyEl` so the TEAM NOTES card is in view, then calls `.focus()` on the textarea. This is the only in-drawer action that does not close.

WATCH and MSG are lower-frequency actions shown as outline (ghost) style to avoid visual competition with the filled DR/SUS/NOTE/BAN buttons. They sit right of the primary four, separated by a `1px solid rgba(255,255,255,0.1)` vertical divider.

### D.3 Confirmation on DR and BAN

DR and BAN are destructive. Before executing, the Action Strip button becomes a two-stage confirm:

**Stage 1 (immediate click):** Button label changes to "CONFIRM DR" or "CONFIRM BAN", color shifts to pulse state, a 3-second auto-cancel timer starts.

**Stage 2 (second click within 3s):** Executes the action. If 3s elapses without second click, button label reverts and timer clears.

Implementation: simple local `_confirmTimer` variable on the action strip mount closure. No modal, no dialog. The two-stage confirm adds one deliberate step without opening a separate surface.

This satisfies `confirmation-dialogs` (Forms priority 8) and `destructive-emphasis` (same section) without breaking the "one click to act" principle -- the confirm is on the same button, same location.

### D.4 AI pulse indicator

When `_drawerRenderNba` resolves with a result, it dispatches a custom event:
```js
state.rootEl.dispatchEvent(new CustomEvent('dc:ai-suggest', {
  bubbles: true,
  detail: { action: payload.action, confidence: payload.confidence }
}));
```

The action strip listens for `dc:ai-suggest` and applies `.gam-dc-act--ai-pulse` to the button matching `payload.action` (DR, BAN, WATCH, NOTE, or MSG). Pulse style:
```css
.gam-dc-act--ai-pulse::after {
  content: '';
  position: absolute;
  top: 3px; right: 3px;
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--dc-rail-ai);
  animation: dc-pulse 1.2s ease-in-out infinite;
}
@keyframes dc-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.7); }
}
```

When the mod dismisses the AI recommendation (clicks "Dismiss recommendation" in the AI card), a `dc:ai-clear` event removes the pulse class.

The strip also shows a right-aligned `[x dismiss AI]` text button when a pulse is active, providing a second dismiss path without scrolling to the AI card.

### D.5 Strip wiring -- avoiding stale closure problem

The strip is mounted once in `_mount()`. Its button handlers must reference the *currently open* subject, not a closure-captured value from mount time.

Each button handler reads `state.currentId` and `state.currentOpts` at click time through the existing `state` object (already exposed via `IntelDrawer._state`). No stale closure possible because `state.currentId` is always the live value.

Pattern for each handler:
```js
drBtn.addEventListener('click', function() {
  const id = state.currentId;
  if (!id) return;
  // two-stage confirm logic here
  // on confirm:
  try { openDeathRow(id); } catch(e) { snack('DR failed', 'error'); }
  IntelDrawer.close();
});
```

---

## E. Drawer Layout Structure (Full)

The drawer root `#gam-intel-drawer` becomes a flex column:

```
#gam-intel-drawer  (flex-direction: column; height: 100vh; overflow: hidden)
  .gam-drawer-header                -- fixed top (existing, no change)
  .gam-dc-action-strip              -- NEW, sticky below header
  .gam-drawer-body                  -- flex: 1; overflow-y: auto; padding: 10px 12px
    .gam-dc (IDENTITY, amber rail)
    .gam-dc (HISTORY, blue rail)
    .gam-dc (AI RECOMMENDATION, purple rail)
    .gam-dc (TEAM NOTES, green rail)
  (no bottom padding needed -- action strip handles the bottom anchor)
```

The existing `topSentinel` and `bottomSentinel` focus-trap elements remain. The action strip sits between header and body in the DOM order, which keeps the strip focusable in Tab order before the scrollable body (correct: mods should be able to Tab from the header to the action buttons without entering the scroll body first).

---

## F. ASCII Mockup

Width: 480px. Theme: Bloomberg Terminal. Cards shown at rest.

```
+====================================================+ <- gam-drawer-header (fixed)
| [OPEN] User: suspicious_user99         [*]   [x]  |
+----------------------------------------------------+ <- gam-dc-action-strip (sticky)
| [DR] [SUS] [NOTE] [BAN]  | [WATCH] [MSG]          |
+====================================================+ <- gam-drawer-body (scroll)

+--- IDENTITY (amber left rail) --------------------+
| I IDENTITY                              [OPEN]    |
+====================================================+
| suspicious_user99 (x3)  [NEW 14d]  [OP-DEL x1]  |
| joined 14d . karma 12 . account 14d               |
| [BURSTING 6.1/day]                                |
|                                                    |
|   Approved    Removed     Banned                  |
|      4    |    12     |     3                     |
|   Quality    Reports    Score                     |
|     28    |     2     |   -44                    |
|                                                    |
| [! LOOKALIKE: matches MrPat77 (91%)]  [View ->]  |
| [MrPat77 CONFIRMED] [ePatriot WATCH] [DQ88 LOW]  |
+----------------------------------------------------+

+--- HISTORY (blue left rail) ----------------------+
| H HISTORY                              [4 NEW]    |
| [MOD LOG*] [ACTIVITY] [PRECEDENTS 2]             |
+====================================================+
| 2h ago  | REMOVE | modname1                       |
| 1d ago  | WARN   | modname2                       |
| 3d ago  | REMOVE | modname3                       |
| 4d ago  | BAN    | modname1                       |
|                              [Load older v]       |
+----------------------------------------------------+

+--- AI RECOMMENDATION (purple left rail) ----------+
| A AI RECOMMENDATION                   [LLAMA 3]  |
+====================================================+
| [ Generate recommendation ]                       |
+----------------------------------------------------+

+--- TEAM NOTES (green left rail) ------------------+
| N TEAM NOTES                           [3 notes] |
+====================================================+
| modname1 . 3d ago                            ["] |
|   Prior ban for brigading. Watch for alts.       |
+--------------------------------------------------+
| modname2 . 6d ago                            ["] |
|   Karma farming.                                 |
+==================================================+
| Add a team note...                               |
|                                     [Save note]  |
+--------------------------------------------------+
```

When AI result fires:
```
+--- AI RECOMMENDATION (purple left rail) ----------+
| A AI RECOMMENDATION [HIGH]            [LLAMA 3]  |
+====================================================+
| BAN                                    [why? (i)] |
| Pattern matches prior account. 3 removes in 48h.  |
| Karma below threshold for account age.            |
|                        [ Dismiss recommendation ] |
+----------------------------------------------------+

Action strip with AI pulse:
| [DR] [SUS] [NOTE] [BAN .] | [WATCH] [MSG]  [x dismiss AI] |
```

When DR/BAN confirm stage:
```
| [DR] [SUS] [NOTE] [CONFIRM BAN] | [WATCH] [MSG] |
```
BAN button changes label, no size change, auto-reverts in 3s if no second click.

---

## G. Effort Estimate and Phasing

| Work item | Phase | Effort | Risk |
|---|---|---|---|
| CSS: `--dc-*` tokens + `.gam-dc-*` card anatomy | P1 | 2h | Low -- additive |
| CSS: `.gam-dc-chip` + six variant modifiers | P1 | 1h | Low |
| CSS: `.gam-dc-action-strip` + `.gam-dc-act` buttons | P1 | 1h | Low |
| CSS: stats grid (3-col, tabular figures) | P1 | 45m | Low |
| CSS: sim-chip horizontal strip | P1 | 45m | Low |
| CSS: history card sub-tab buttons | P1 | 1h | Low |
| JS: IDENTITY card builder (merge sec1+sec2+sec9+sec10+sec8) | P1 | 3-4h | Medium -- must handle all async slot reveals correctly |
| JS: sec9 + sec10 async slot inject into IDENTITY card | P1 | 1h | Low |
| JS: sec8 sim-strip inject into IDENTITY card | P1 | 1h | Low |
| JS: Action Strip mount in `_mount()` | P1 | 1h | Low |
| JS: Action strip button wiring (DR/SUS/BAN/WATCH/MSG) | P1 | 2h | Low -- existing functions |
| JS: NOTE button scroll+focus behavior | P1 | 30m | Low |
| JS: Two-stage confirm for DR + BAN | P1 | 1h | Low |
| JS: `IntelDrawer.executeAction()` public method | P1 | 30m | Low |
| JS: HISTORY card builder (merge sec3+sec6, sub-tabs) | P2 | 2-3h | Medium -- sub-tab toggle + lazy Activity |
| JS: ACTIVITY sub-tab lazy-load on first click | P2 | 1-2h | Medium -- `_activityLoaded` flag, abort handling |
| JS: PRECEDENTS sub-tab visibility gated on count | P2 | 30m | Low |
| JS: AI card ghost button + result layout without action buttons | P3 | 1-2h | High -- decouples `_drawerRenderNba` from action wiring |
| JS: `dc:ai-suggest` / `dc:ai-clear` custom events | P3 | 30m | Low |
| JS: Action strip pulse indicator + `[x dismiss AI]` | P3 | 1h | Low |
| JS: TEAM NOTES card -- Quote button + Ctrl+Enter submit | P4 | 1-2h | Low |
| JS: Textarea keyboard Tab -> Save Note focus management | P4 | 30m | Low |
| Token doc: `UIUX-03_design_tokens.md` update with `--dc-*` | P4 | 1h | Low |
| **Phase 1 total** | | **~16h** | Identity + Action Strip |
| **Phase 2 total** | | **~4h** | History card |
| **Phase 3 total** | | **~3h** | AI decoupling |
| **Phase 4 total** | | **~3h** | Notes + cleanup |
| **Grand total** | | **~26h** | |

**Phase 1 is highest-impact and lowest-risk.** The IDENTITY card consolidation and Action Strip together address A.2 (wall), A.4 (no actions), A.5 (inline colors), A.6 (dead sections), A.8 (keyboard) -- five of the nine audit findings. Ship Phase 1 first and measure before committing Phase 2-4.

---

## H. Design Decisions Log

| Decision | Rationale | Alternative rejected |
|---|---|---|
| 4 cards not 10 sections | 10 identically-styled sections have no scannable hierarchy. 4 semantic cards with distinct rail colors give instant at-a-glance orientation. | Keeping 10 sections but adding color-coded h3 headers -- rejected because the visual weight problem remains; a 10px colored h3 does not create card-level separation. |
| sec8 + sec9 + sec10 absorbed into IDENTITY | They are identity characterization signals. Rendering them as standalone sections at positions 8-10 behind a scroll wall means mods almost never see them. Inline in IDENTITY they appear immediately, contextually. | Keeping them as separate sections but moving them to positions 2-4 -- rejected because it makes the section count 10 and the wall problem worse, not better. |
| Activity lazy-load on tab click | `modGawTimeline` is the heaviest RPC. Mods making ban decisions do not need 30d sparklines on every hover. | Eager-load but collapse sec7 by default -- rejected because the RPC still fires; the performance problem is the fetch, not the DOM. |
| Action strip sticky bottom, not sidebar | Mods work in a 480px-wide panel. A sidebar would reduce content width. Sticky bottom bar is the standard pattern for this width (mobile-first principle: bottom nav for primary actions). | Floating action button (FAB) cluster -- rejected because FAB with 6 actions is not a real pattern; it would require a menu, adding a step. |
| Two-stage confirm on DR/BAN, no modal | Modals break focus, add a step, feel heavy for an action the mod has already committed to. Two-stage on the same button is a single extra click with zero navigation cost. | Separate confirm modal -- rejected because it opens a third surface on top of the drawer, which already sits on top of the page. |
| AI action buttons removed from AI card | The green "Do it: BAN" button in the AI card is driving premature execution. Spatial separation of recommendation and action is the only reliable way to break that habit. The action strip provides the execution surface; the AI card provides only the recommendation. | Keep AI action buttons but make them ghost-styled -- rejected because ghost buttons are still buttons; the problem is presence, not weight. |
| HISTORY sub-tabs in card header, not a full tab bar | 3 sub-tabs serving related data types (log, activity, precedents) within one card. A full tab bar implies top-level navigation. Header-embedded sub-tab buttons signal secondary navigation within a card. | Separate the 3 into 3 cards -- rejected because it increases card count to 6 and dilutes the card-as-landmark concept. |
| Chip consolidation via `--chip-rgb` CSS variable | 9 inline hex strings -> 6 modifier classes. Future color changes are a CSS variable edit, not a JS search-and-replace across 9 sites. | Design-token object in JS (e.g., `CHIP_COLORS.BURSTING`) -- rejected because it requires a JS change AND a CSS change to update a chip color; CSS-only is the tighter coupling. |
