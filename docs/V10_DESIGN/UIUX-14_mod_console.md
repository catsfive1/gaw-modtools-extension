# UIUX-14: Mod Console Redesign

**Component:** `#gam-mc-panel` — the primary moderation action surface, opened via Ctrl+Shift+M or clicking any username.
**Trigger version:** v10.9.0 (adds OP DELETES tab, bringing tab count to 6).
**Aesthetic target:** Bloomberg Terminal — dense, monospaced data display, keyboard-first, zero chrome waste.
**Status:** Design spec only. Read-only.

---

## A. Critique

### A.1 Tab Navigation — functional but visually flat

Current state: `.gam-mc-tabs` renders 6 tab buttons horizontally with emoji + label. Active tab gets `.gam-mc-tab-active` class. No keyboard shortcut to switch tabs. No visual indication of which tab is "dangerous" (BAN) vs. informational (INTEL). On a 680px modal width with 6 tabs, the "OP Deletes" tab is likely clipped on small viewports.

**Problems:**
- No kbd shortcuts for tab switching (1-6 or Alt+1-6 is standard in terminal UIs).
- Tab labels mix emoji + text without consistent hierarchy — emoji adds noise without semantic value at this density.
- No active-tab underline or left-border treatment; the active state is only a background fill, easy to miss at a glance.
- "OP Deletes" is an outlier label — longer than all others, breaks the visual rhythm.
- No per-tab "danger level" visual signal. BAN tab should feel visually distinct from INTEL.

### A.2 INTEL Tab — too much vertical scroll

Current state: async-loading sections stack vertically: account summary chip row, score, reported comment, local history, AI section, mods-only note. On a typical 680×600 modal this requires 2-3 full scrolls to consume.

**Problems:**
- Account summary + score are on separate async loading dots — two separate spinners causes sequential flash.
- "Reported comment" section sits between account summary and local history, breaking the information hierarchy (context should precede history, not interrupt it).
- AI Conformity Check section is below the fold. Mods who need it fastest are least likely to find it.
- Mods-only note field is at the very bottom. It is frequently the first thing a mod updates on a re-visit.
- No visual separation between "read" data (summary, history) and "write" data (note field).

### A.3 BAN Tab — form is long; duration picker is the right idea but poorly executed

Current state: violation select, custom history picker, subject input, team macros dropdown, message textarea (7 rows), duration button row, modmail checkbox, AI block, action buttons, status, AI summary preview. Full form height is ~600px+ requiring scroll.

**Problems:**
- Duration picker (`.gam-mc-dur` buttons) is correct paradigm but relies on click only. No keyboard shortcut to arm a duration (e.g. `p` = perma, `7` = 7d, `0` = warning).
- Subject input is rarely used but sits between violation and message, breaking the primary flow.
- AI Generate + Use This Reply is a two-click flow that could be one (auto-apply on generation if setting is on).
- Repeat offender banner (`.gam-mc-banner-warn`) is positioned correctly but its color is identical to other warn banners — should be visually distinct for a repeat-ban scenario.
- UNBAN button sits in the same action row as BAN — the two are equal weight in size and proximity to one another. This is a preflight hazard. UNBAN should be demoted visually.
- The ban-summary-preview block only shows after ban, which is appropriate, but its label is uppercase-tiny and easy to miss as confirmation feedback.

### A.4 NOTE Tab — two-section layout is good; submit position is confusing

Current state: history section (top), template picker, then textarea + submit buttons inside a second section header.

**Problems:**
- Cancel and Append buttons are inside the section header `<div>` of "Add new note" — discoverable but awkward; they look like header controls, not submit controls.
- Template picker (Quick template) is between history and the write section. It logically belongs inside the write section, adjacent to the textarea.
- Note history is rendered newest-first (`.slice().reverse()`) but has no explicit sort indicator — mods may not know whether they're reading oldest or newest first.
- No character counter visible while typing (max is 500 per the textarea `maxLength`).

### A.5 MESSAGE Tab — mirrors BAN tab pattern with similar issues

Pattern match to BAN: template picker, subject, macros, textarea, AI section, action buttons. The structural duplication is correct (consistent with BAN) but carries forward all BAN's ergonomic problems: no keyboard send (Ctrl+Enter), subject is high in the form despite being rarely changed from the macro default.

### A.6 QUICK Tab — grid is the right direction; no keyboard navigation

Current state: 11 buttons in a `.gam-mc-grid` CSS grid. Each button is icon + label + subtitle. This is the strongest tab in terms of density — it's correct Bloomberg-style chunked action tiles.

**Problems:**
- No keyboard navigation. j/k to move focus between tiles, Enter to activate, is the expected idiom for this kind of grid.
- No multi-select batch mode. If a mod has 5 users queued, they cannot open Quick on each and execute the same action without reopening the console 5 times.
- DR Sniper is last, but "Death Row" variants (72h, 96h, 7d) are scattered in slots 2-4 with Sniper at slot 11. Grouping by category (Watch / DR variants / Ban / Content / Info) would reduce scan time.
- Perma-ban tile has a red icon but the tile background is unchanged — for a destructive action, the tile itself should carry the red styling until hover, not just the emoji.
- The 3-column grid width is likely computed from `gam-mc-grid` CSS (not shown in the searched range). If this is `grid-template-columns: repeat(3, 1fr)` on a 680px modal, tiles are fine; but on dock=sm (320px) they collapse to 2 columns and the labels wrap.

### A.7 OP DELETES Tab — functional stub, no actions

Current state: fetches `/modOpDeletes` for last 24h, renders a list of deleted-post rows (title, author, subreddit, timestamp, queue-flag chip). Read-only list.

**Problems:**
- No action affordance per row. A mod reading this tab almost certainly wants to act on a deletion (open post, open user console, remove from queue). There are no row-level buttons.
- 24h window is hardcoded. No filter control.
- "was in queue" flag is an emoji in a string (`⚠️ was in queue`) — loses styling context and isn't interactive.
- Loading state is inline HTML assignment, not the standard `.gam-mc-loading` class — inconsistent with other tabs.

### A.8 Global Panel Issues

- **No pin-while-typing protection.** If a mod starts typing a ban message and accidentally clicks off the modal, the panel closes and the draft is lost (SuperMod draft persistence exists but is not surfaced in the UI).
- **Modal width is hard-set to 680px.** On a 1440px monitor the modal sits centered with 380px dead space on each side. Dock mode (right/left panel) exists but is not the default. Bloomberg-style UIs pin to a side and use the full height.
- **No focus ring on active tab.** Keyboard users navigating via Tab key get no visual indication of which tab is focused vs. active.
- **No escape-to-tab behavior.** Pressing Escape closes the entire panel instead of returning focus to the tab nav. For a keyboard-first workflow, Escape should minimize or step back, not destroy.

---

## B. Redesign

### B.1 Core Aesthetic Direction

**Bloomberg Terminal** for a moderation context: charcoal background (`#0a0e12`), amber-white text hierarchy, monospace type for data, proportional type for labels, horizontal rule separators in place of cards, no border-radius on primary containers.

- **Font pair:** `IBM Plex Mono` for data/values, `IBM Plex Sans Condensed` for labels and tab nav. Both available from Google Fonts as `@import` — but since this is a Chrome extension content script injection, the fonts must be inlined or loaded via `chrome-extension://` URL. Fallback stack: `ui-monospace, SFMono-Regular, Consolas, monospace` (already in use).
- **Color palette update:**
  ```
  --mc-bg:         #080c10;   /* deeper than current C.BG (#0a0a0b) */
  --mc-bg2:        #0f141a;
  --mc-border:     #1e2630;
  --mc-border2:    #2a3340;
  --mc-accent:     #f0a040;   /* amber — primary interactive */
  --mc-accent2:    #4a9eff;   /* blue — secondary/informational */
  --mc-danger:     #e03030;   /* ban/destructive */
  --mc-warn:       #c8922a;   /* repeat offender */
  --mc-success:    #2da85a;
  --mc-text:       #d8dce4;
  --mc-text2:      #8892a0;
  --mc-text3:      #505a66;
  --mc-mono:       'IBM Plex Mono', ui-monospace, Consolas, monospace;
  --mc-sans:       'IBM Plex Sans Condensed', system-ui, sans-serif;
  ```

### B.2 Panel Shell — Dock-Right by Default

Change `getSetting('modConsoleDock', 'modal')` default to `'right'`. The side-dock mode already exists in the codebase (`#gam-mc-panel[data-dock="right"]`). It provides permanent viewport context (the page stays visible), uses full screen height, and is more ergonomic for repeated use.

- Width: `sm` = 360px, `md` = 480px (new default), `lg` = 680px (current modal width).
- The width toggle button (`gam-mc-headctl`) should cycle sm→md→lg→sm with a keyboard shortcut `]`/`[`.

### B.3 Tab Navigation — Keyboard-Indexed

Replace emoji-label tab buttons with uppercase abbreviated labels + 1-6 number keys for tab switching.

**Tab strip design:**
```
[1·INTEL] [2·BAN] [3·NOTE] [4·MSG] [5·QUICK] [6·OPDEL]
```

- Active tab: amber bottom border, 2px solid `--mc-accent`, text color `--mc-accent`.
- Dangerous tabs (BAN): subtle red tint on the tab label (`--mc-danger` at 70% opacity) when inactive, full red when active.
- Number keys 1-6 switch tabs directly. This is the biggest single ergonomic win.
- Alt+number as an alternative chord for mods who use number keys for other purposes.
- Tab nav height: 28px total (currently ~38px with emoji). Recover 10px of panel height.

### B.4 j/k Row Navigation in QUICK Tab

When the QUICK tab is active:
- `j` / `k` keys move focus between action tiles (like vim navigation in Bloomberg's action grids).
- `Enter` fires the focused tile's click handler.
- Visual focus ring: amber `2px solid --mc-accent` box-shadow on the focused tile.
- Home/End jump to first/last tile.

Implementation sketch:
```js
// Inside renderQuickTab, after attaching click handlers:
const tiles = [...root.querySelectorAll('.gam-mc-quick:not([disabled])')];
let focusIdx = 0;
function moveFocus(delta) {
  focusIdx = Math.max(0, Math.min(tiles.length - 1, focusIdx + delta));
  tiles[focusIdx].focus();
}
root.addEventListener('keydown', e => {
  if (e.key === 'j') { e.preventDefault(); moveFocus(1); }
  if (e.key === 'k') { e.preventDefault(); moveFocus(-1); }
  if (e.key === 'Enter') tiles[focusIdx]?.click();
});
```

Scope this keydown listener to the panel container only (not document) so it does not bleed when other tabs are active.

### B.5 Batch Action Bar — Multi-Select in QUICK Tab

For mods triaging a queue, a batch mode eliminates reopening the console per user.

- Add a "Batch mode" toggle in the QUICK tab header (keyboard: `b`).
- When batch mode is active, the panel persists after each action instead of closing.
- A batch action bar appears at the bottom of the tab with a counter: `3 users — [Watch] [DR 72h] [Perma-ban] [Clear]`.
- Usernames accumulate in session memory; each action fires for all queued users with a single preflight confirm listing all targets.
- Batch bar shows live progress: `Banning user 2 of 3...`.

This is a net-new feature that does not exist today. Effort is tracked separately in Section D.

### B.6 Tab Visual States — Clearer Active/Inactive/Loading

- **Inactive:** monochrome label, `--mc-text3` color.
- **Active:** `--mc-accent` label color + `2px solid --mc-accent` bottom border.
- **Loading:** amber pulsing dot to the right of the active tab label (`@keyframes pulse`). Replaces per-tab "loading..." text.
- **Error state:** red dot replaces loading dot if async fetch fails.
- **BAN tab specifically:** when active, border-bottom uses `--mc-danger` not `--mc-accent`. Label is `--mc-danger`. This single change signals danger without adding any new UI chrome.

### B.7 Escape Key Behavior

Change ESC from "close panel" to:
1. If a textarea has unsaved text: ESC shows an inline "Discard changes? [Discard] [Keep editing]" bar inside the panel — does not close.
2. If no unsaved text but a tab is active: ESC returns focus to the tab nav (does not close).
3. If focus is already on tab nav: ESC closes the panel.

This three-step ESC progression eliminates accidental draft loss with zero modal interruption.

### B.8 Ctrl+Enter to Submit

All write tabs (BAN, NOTE, MESSAGE) support `Ctrl+Enter` to fire the primary submit button. This is the single most requested keyboard shortcut class for power users. Implementation: add one `keydown` listener on each tab's root element.

---

## C. Per-Tab Redesign Notes

### C.1 INTEL Tab

**Goal:** get the full user picture without scrolling.

**Layout: 3-zone above-the-fold stack**

```
┌─ ACCOUNT ROW (single line) ─────────────────────────────────────┐
│ u/username  [BANNED] [WATCHED] [18 posts] [joined 2y ago] [score]│
└──────────────────────────────────────────────────────────────────┘
┌─ EVIDENCE (if item context) ────────────────────────────────────┐
│ "Reported comment text truncated at 260 chars..."  [open post]  │
└──────────────────────────────────────────────────────────────────┘
┌─ LEFT: Mod history (scrollable) │ RIGHT: Mods-only note ────────┐
│ [entry rows, newest first]      │ [textarea, auto-save on blur] │
│                                 │ [save indicator]              │
└─────────────────────────────────┴──────────────────────────────┘
┌─ AI ANALYSIS (collapsed by default, click to expand) ───────────┐
│ > AI Conformity Check  [Llama 3 ▼]  [Analyze]                  │
└──────────────────────────────────────────────────────────────────┘
```

Key changes:
- Account summary chips and score combined into one async-loaded line. Single loading state.
- Mods-only note moves from bottom to a right-column alongside history. This is the most-used field on re-visits.
- AI section is a `<details>` collapsed by default — still accessible but not in the primary visual path.
- Reported comment moves above history (correct narrative order: evidence → history → action).
- History shows newest-first with an explicit label: "Note history (newest first)".

### C.2 BAN Tab

**Goal:** reduce clicks from violation-select to BAN-fired from 5+ to 3.

**Collapsed form layout:**

```
[Violation type ▼]                      [Duration: W 1d 3d 7d 14d 30d PERMA]
[Subject: auto-filled from violation]
[Team macro ▼]
[Message textarea — 5 rows]
                              [Cancel] [UNBAN ↘] [BAN ▶]
```

Key changes:
- Duration picker moves to the **same row** as violation. The two are always chosen together. This eliminates one visual scan zone.
- Subject auto-fills from violation selection (already has the logic) — remove the label "Subject" and replace with a subtle inline edit hint. Mods rarely change it.
- Team macro moves below subject (correct order: violation → subject → customization → message).
- UNBAN is repositioned as a secondary link-button below the main action row (not same-weight sibling of BAN). Style it as a ghost button `color: --mc-success`.
- AI Generate: add a setting `auto-apply AI` — when on, Generate immediately replaces textarea content. When off, the current "Use this reply" button flow applies. Default: off.
- Keyboard shortcuts for duration: after violation is chosen, pressing `p` arms Perma, `7` = 7d, `3` = 3d, `1` = 1d, `w` = Warning, `0` = Warning (alias). These are scoped to the BAN tab only.
- Repeat-offender banner: change background to `rgba(200, 60, 30, 0.15)` + `border-left: 3px solid --mc-danger`. Visually distinct from generic warn banners.
- `Ctrl+Enter` fires BAN after duration is armed.

### C.3 NOTE Tab

**Goal:** fastest possible note append with history visible.

**Layout:**

```
┌─ Note history (newest first) ────────────────────────────────────┐
│ [moderator] [time ago]                                           │
│ Note text                                                        │
│ [moderator] [time ago]                                           │
│ Note text                                                        │
│ ... (max-height: 200px, scrollable)          [Clear all (link)] │
└──────────────────────────────────────────────────────────────────┘
┌─ Add note ────────────────────────────────────────────────────────┐
│ [Template ▼]    [0/500]                          [Cancel] [Save] │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ textarea (4 rows, grows to 8)                               │  │
│ └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

Key changes:
- Template picker is in the "Add note" section header row (same line as action buttons). Selecting a template populates the textarea. Compact: label + select + char count + buttons all in one 28px row.
- Character counter (`0/500`) updates on input. Turns amber at 400, red at 480.
- "Clear all" is a text-link in the history header, not a full button. Demotes it from primary to secondary affordance.
- Action buttons are inside the write section header — not inside a separate `gam-mc-actions` block. This eliminates the visual disconnect between where you type and where you submit.
- `Ctrl+Enter` saves.
- Sort label "newest first" added to history header.

### C.4 MESSAGE Tab

**Goal:** consistency with NOTE tab pattern; add Ctrl+Enter.

Structural changes mirror NOTE tab. The specific MESSAGE additions:
- Subject field collapses into an "Edit subject" chevron. Default subject is auto-derived from the selected template (already done in logic, just not surfaced as collapsed). This removes a form field from the primary eye path.
- `Ctrl+Enter` sends.
- Template and Macro dropdowns can be unified: one dropdown labeled "Template / Macro" that sources from both `NOTE_TEMPLATES` and team macros. The two are currently side-by-side competing dropdowns.

### C.5 QUICK Tab

**Goal:** zero-scan action execution; keyboard-first grid; grouped by category.

**Tile grouping (left-to-right, top-to-bottom in a 3-column grid):**

```
Row 1 — Info/non-destructive:
  [Watch / Unwatch]  [Copy permalink]  [Open profile]

Row 2 — Death Row:
  [DR 72h]  [DR 96h]  [DR 7d]  [DR Sniper 125h]  [-- empty --]

Row 3 — Content:
  [Remove content]  [Flag user]  [Grant title]

Row 4 — Nuclear (full-width):
  [PERMA-BAN (no msg)]
```

Key changes:
- Categories are visually separated by a 1px horizontal rule with a micro-label (`// DEATH ROW`, `// CONTENT`, `// NUCLEAR`). Rule width matches grid, label is monospace `--mc-text3`.
- Perma-ban moves to its own full-width row at the bottom. Background is `rgba(224, 48, 48, 0.08)` (subtle red wash). This is the Bloomberg idiom for a destructive terminal row.
- j/k navigation as per B.4.
- Batch mode toggle `[b]` as per B.5.
- Disabled tiles (`disabled` attr) render at 30% opacity with a `not-allowed` cursor.

### C.6 OP DELETES Tab

**Goal:** actionable list, not a read-only log.

**Per-row design:**
```
[POST TITLE (truncated 80 chars)]                    [author]  [2h ago]
[subreddit]  [snippet truncated 100 chars]           [WAS IN QUEUE ⚠]
                               [Open post ↗] [Open user console →]
```

Key changes:
- Per-row action buttons: "Open post" (opens link in new tab) and "Open user console" (calls `openModConsole(author, null, 'intel')`). The console button is the key addition — it closes the loop from "I see a suspicious deletion" to "I'm acting on it" in one click.
- "Was in queue" is a styled chip (`background: rgba(224,48,48,0.15); border: 1px solid --mc-danger; color: --mc-danger`) not a raw emoji string.
- Time window selector: `[24h ▼]` dropdown at the tab header level. Options: 6h, 24h, 48h, 7d. Changing re-fires the RPC.
- Loading state uses the standard `.gam-mc-loading` class (align with other tabs).
- Empty state: "No OP self-deletions in this window" with the selected window label.

---

## D. Effort Estimate

All estimates assume a single senior developer familiar with the `modtools.js` codebase. The codebase renders HTML as template strings and attaches event handlers imperatively — no framework overhead.

| Item | Complexity | Est. hrs |
|---|---|---|
| Tab strip redesign (number keys 1-6, visual states, BAN danger-color) | Low | 2 |
| Escape key 3-step behavior | Low | 1.5 |
| Ctrl+Enter on BAN / NOTE / MESSAGE | Low | 1 |
| Duration keyboard shortcuts (p/7/3/1/w) on BAN tab | Low | 1.5 |
| INTEL tab layout (2-column history+note, section reorder, combined loading) | Medium | 4 |
| BAN tab form compaction (duration row merge, UNBAN demotion, repeat-offender banner) | Medium | 3 |
| NOTE tab compaction (template in header, char counter, sort label) | Low | 2 |
| MESSAGE tab alignment with NOTE (subject collapse, unified dropdown) | Low | 2 |
| QUICK tab grouping (category rows, perma-ban full-width, disabled tile styling) | Low | 2 |
| j/k keyboard navigation in QUICK tab | Low | 1.5 |
| OP DELETES tab (per-row action buttons, chip styling, time filter, loading state fix) | Medium | 3 |
| Batch action bar (multi-select QUICK, session queue, batch preflight) | High | 8 |
| Dock-right default + md width default | Low | 0.5 |
| Color token update (--mc-* variables in CSS injection block) | Low | 1 |
| **Total (excluding batch)** | | **~25 hrs** |
| **Batch action bar only** | High | **8 hrs** |
| **Grand total** | | **~33 hrs** |

### Priority stack (recommended ship order)

1. **P0 — Keyboard tab switching (1-6), Ctrl+Enter submit, Escape 3-step** — ~4.5h. Highest return on time. Zero visual risk.
2. **P1 — BAN tab compaction + UNBAN demotion** — 3h. Highest safety impact.
3. **P1 — OP DELETES per-row action buttons** — 3h. Currently a dead-end tab; one change makes it useful.
4. **P2 — INTEL tab 2-column layout** — 4h. Biggest visual change; needs QA on multiple viewport widths.
5. **P2 — QUICK tab grouping + j/k nav** — 3.5h. No behavior change for mouse users; additive for keyboard users.
6. **P3 — NOTE/MESSAGE tab compaction** — 4h. Polish; no behavior regression risk.
7. **P3 — Color token update** — 1h. Can batch with any of the above.
8. **P4 — Batch action bar** — 8h. Net-new feature; requires UX confirmation before building.

### Risk flags

- **IBM Plex fonts:** loading external fonts from a content script requires either inlining the font as a data URI or hosting on the extension's own origin. The current system font stack is safe and should remain as fallback. Introducing web fonts adds ~20KB and a potential CSP touch. **Recommendation:** ship the layout and color changes with the existing font stack; add IBM Plex as an enhancement only if Commander approves the CSP change.
- **Dock-right default:** changing `modConsoleDock` default from `'modal'` to `'right'` will affect every mod on their first post-update open. Existing saved preference is respected. Flag this in release notes.
- **j/k nav and page-level j/k keys:** GAW's native interface uses j/k for post navigation. The QUICK tab's scoped keydown listener must not propagate to document level. Verify with `e.stopPropagation()` inside the panel's listener.
