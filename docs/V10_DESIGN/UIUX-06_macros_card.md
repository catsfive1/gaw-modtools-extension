# UIUX-06 — Macros Card Redesign
**Card:** `#card-macros` / `#macrosSection`
**Author:** DESIGN-06-MACROS-CARD (ralph agent)
**Date:** 2026-05-10
**Status:** Design spec — read-only, no code touched

---

## A. Critique of Current State

### A1. Layout / Information Density

| Issue | Severity | Evidence |
|---|---|---|
| Emoji header (`📝 Team Macros`) violates Bloomberg no-emoji-icons rule | HIGH | `.gam-card-title` uses `&#x1F4DD;` |
| Redundant double-label: card summary says "Team Macros" AND body label says "📝 Team Macros — shared canned messages" | MEDIUM | L309 popup.html |
| Edit/Delete buttons are always-visible inside every row, consuming ~40px of vertical height per row | HIGH | `editBtn` / `delBtn` appended unconditionally in `loadMacros()` |
| No truncation of body text in list — long macros explode row height | HIGH | Row uses `flex-direction:column;gap:2px` with no max-height on body div |
| Mask-image fade on `.gam-macro-row > div:nth-child(2)` is applied globally via CSS but the JS still injects rows with inline style overrides, creating style collision | MEDIUM | popup.css L244 vs popup.js L3320 |
| Filter/sort bar absent — no way to search by keyword or sort by use count / name | MEDIUM | No filter UI |
| "Add custom" and "Generate with AI" sit in a `pop-tools` flex row below the list but above the edit form — edit form pushes list up when opened | MEDIUM | L318-330 popup.html |
| Tab buttons use inline `style="flex:1"` instead of class | LOW | L312-313 |
| `window.confirm()` for delete confirmation is a blocking OS dialog, breaks Bloomberg terminal aesthetic | HIGH | `__macroDelete()` L3398 |
| Use-count badge is added inline via JS but has no CSS class — unstyled | LOW | L3341 popup.js |
| `macroAiSeedBtn` uses `✨` emoji | MEDIUM | L320 popup.html |

### A2. Interaction Design

- **Always-visible action buttons** waste vertical space. Bloomberg terminals use hover-revealed or right-click contextual actions — the data stays primary, affordances appear on demand.
- **Edit form teleports below the list** (show/hide `#macroEditWrap`). This causes a layout jump and the user loses list context while editing. An inline-expand or side-panel approach preserves orientation.
- **No keyboard navigation** — Tab from list to buttons cycles through every row's Edit/Delete before reaching Add. With hover-reveal, Tab stays on the list rows and Enter/Space opens the context actions.
- **`window.confirm()` for delete** — blocking, styled by OS, inconsistent with the rest of the BB terminal aesthetic. Should be an inline destructive confirmation pattern (two-step: click Delete → row turns red + shows "Confirm?" with 3s undo window).
- **No preview on hover** — body text is truncated with a mask but there is no tooltip/flyout showing the full text without opening the edit form.
- **AI seed uses `window.confirm()` with a newline-joined string** — same OS dialog problem, and the string preview is unreadable at 5 lines.

### A3. Visual / Bloomberg Aesthetic

- Current rows use a mix of inline `style=` (in JS) and CSS classes. The inline styles override the BB token variables, preventing theme-level changes from propagating.
- The two-tab row (Ban messages / Modmail replies) is correctly structured but uses `pop-btn pop-btn-ghost` with an `!important` chain in CSS — fragile.
- No column alignment — label and use-count are in the same flex row but have no consistent right-edge alignment.
- Row height is not grid-aligned: `padding:6px 8px` sits off the `--bb-s3 / --bb-s4` grid.

---

## B. Redesign — Row Architecture

### B1. Row Anatomy (dense, 28px base height)

```
[TYPE-BADGE] LABEL NAME ................................................ [use-ct]
             Body preview text truncated to one line, fades at edge...
             ────────────────────────────────────────────────────────
             On hover: [EDIT] [DUPE] [DEL]  revealed at right edge
```

**Column breakdown (pixel-accurate at 360px popup width):**

```
|4px| [KIND] |8px| LABEL (flex-grow, truncated) |auto| USE-CT |8px| ACTIONS(hover) |4px|
```

- **KIND badge**: 2-char abbreviation — `BM` (ban_msg, amber) / `MM` (mm_reply, cyan). 10px mono, 1px border, no fill — matches BB chip pattern.
- **LABEL**: `--bb-ink`, 11px, 600 weight, uppercase. `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`. Max ~38 chars before truncation at 360px.
- **USE-CT**: right-aligned, `--bb-ink-faint`, 10px tabular-nums. Shows `0` if never used. Label "uses" suppressed when 0 to reduce noise.
- **BODY PREVIEW**: second line, `--bb-ink-dim`, 10px, single-line clamp (`-webkit-line-clamp:1`). On hover, this row expands to 2 lines (with CSS transition) so the mod sees more context without opening the editor.
- **ACTION TRIO**: `opacity:0; pointer-events:none` at rest. On row hover: `opacity:1; pointer-events:auto`. Three icon-buttons:
  - Edit (pencil SVG, `--bb-amber`)
  - Duplicate (copy SVG, `--bb-cyan`)
  - Delete (trash SVG, `--bb-red`)

### B2. Sort/Filter Bar

Sits between the tab row and the macro list. Single bar with:

```
[SEARCH INPUT (flex-grow)] [SORT: NAME | USE | DATE (toggle)]
```

- Search input: live filter (keyup, debounced 150ms) against label + body. Placeholder: `FILTER MACROS...`. 10px mono, `--bb-sunken` background, `--bb-line` border, no border-radius (Bloomberg).
- Sort toggle: three text chips (`NAME` / `USE` / `DATE`), one active at a time (amber underline), no border. Clicking cycles direction (asc/desc) with a tiny `^` / `v` suffix.
- No results state: full-height empty state inside the list with `NO MATCH — CLEAR FILTER` action link.

### B3. Hover-Revealed Action Icons

Icons are inline SVGs (16x16 viewBox, 1.5px stroke). No emoji. No text labels in rest state. On hover, a 2px wide right-border appears on the row in `--bb-amber` (visual selection cue) simultaneously with action icon reveal.

Action icon widths: 20x20px touch target each, 4px gap between, group right-aligned with `margin-right: 4px`.

Keyboard: row is `tabindex="0"`. Focus shows amber focus ring. `Enter` opens inline edit. `d` key triggers delete confirmation inline. `c` duplicates.

---

## C. New-Macro Flow

### Decision: Inline Expand (not modal)

**Modal rejected** because:
1. Popup viewport is 400px wide — a modal adds an overlay with no more space than inline.
2. Loss of list context is disorienting. Mod should see the list while typing.
3. Modal animation budget (150-300ms enter + backdrop) is expensive in an already dense popup.

**Inline expand chosen:**

Clicking "NEW MACRO" or the Edit icon on a row expands a form panel **between the sort bar and the list** (the list scrolls down, stays visible). The form is:

```
┌─ EDITING: BAN MESSAGE ─────────────────────────────────────────────┐
│  LABEL  [________________________________] 0/80                     │
│  BODY   [                                                          ]│
│         [                                                          ]│
│         [                                                          ]│ 4 rows
│         [                                3,847 chars remaining    ]│
│  [CANCEL]                               [SAVE MACRO]               │
└────────────────────────────────────────────────────────────────────┘
```

- Form slides in with `max-height` transition (BB motion grammar: `--gam-dur-fast`, ease-out).
- `LABEL` input: 100% width, 10px mono, `--bb-sunken` bg, amber focus ring. Character counter right-aligned, turns red at >70 chars.
- `BODY` textarea: 4 rows, same styling. Counter shows remaining (not used).
- `[CANCEL]` is ghost; `[SAVE MACRO]` is primary (amber bg, black text) — only one primary CTA per surface.
- While saving: button text becomes `SAVING...`, disabled, no spinner (too much motion for 300ms op).
- On save success: form collapses, list refreshes, saved row briefly highlights amber (150ms flash).
- On error: error text appears below BODY in `--bb-red`, form stays open.

### Delete Confirmation (inline, no `window.confirm`)

Click trash icon → row background transitions to `--bb-red-bg`, label color shifts to `--bb-red`, action trio replaced by:
```
[CONFIRM DELETE] [CANCEL]  — auto-cancels in 4 seconds
```
A 4-second countdown bar (thin, red, shrinking) under the row gives the mod an undo window without freezing the UI.

### AI Seed Flow

"GENERATE WITH AI" button (now a proper icon-button with `--bb-purple` accent, no emoji) triggers the existing `__macroAiSeed()` but replaces `window.confirm()` with an inline review panel:

```
┌─ AI SUGGESTIONS (5) ──────────────────────────────────────────────┐
│  [x] SPAM FARM                  "Your post was removed for..."    │
│  [x] NO POLITICS                "This sub is for Q research..."   │
│  [ ] CIVILITY                   "Please keep discussion civil..." │
│  [x] LINK SPAM                  "We don't allow..."               │
│  [x] OFFTOPIC                   "Post removed: off-topic..."      │
│  [SAVE SELECTED (4)]                              [DISCARD ALL]   │
└────────────────────────────────────────────────────────────────────┘
```

Checkboxes (BB style: square, amber check, no border-radius). Individual selection before bulk save. This replaces the unreadable newline-joined `window.confirm` string.

---

## D. Visual Mockup (ASCII, Bloomberg Terminal)

### D1. Card — Collapsed state

```
[ v ] TEAM MACROS                                        [12]
```
Badge shows macro count.

### D2. Card — Expanded, list view

```
v  TEAM MACROS                                           [12]
───────────────────────────────────────────────────────────────
  BAN MESSAGES              MODMAIL REPLIES
  ──────────────────────────────────────────────────────
  [FILTER MACROS...                    ] [NAME] [USE] [DATE]
  ──────────────────────────────────────────────────────
  BM  SPAM FARM                                          7 uses
      Your account was removed for promoting...
  ──────────────────────────────────────────────────────
  BM  NO POLITICS                                        3 uses
      This community focuses on Q research...
  ──────────────────────────────────────────────────────
  MM  WELCOME                                            0
      Thanks for writing in. Our modmail hours are...
  ──────────────────────────────────────────────────────
  BM  CIVILITY                                          12 uses
      We expect civil discussion. Your comment...
  ──────────────────────────────────────────────────────
                                [+ NEW MACRO] [AI GENERATE]
```

### D3. Row — Hover state

```
  BM  SPAM FARM                              [PEN] [CPY] [TRH]  7 uses
      Your account was removed for promoting external...         ◄ 2 lines
```
Left edge: 2px amber border. Actions visible at right. Body expands to 2 lines.

### D4. Inline edit form open

```
  ─────────── EDITING: BAN MESSAGE ─────────────────────────
  LABEL  SPAM FARM                                      9/80
  BODY   Your account was removed for promoting external
         links to monetized content. This violates our
         community standards for off-platform commerce.
                                              3,893 remaining
  [CANCEL]                                 [SAVE MACRO]
  ──────────────────────────────────────────────────────────
  BM  NO POLITICS ...
```

### D5. Delete confirmation state

```
  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░      <- red countdown bar
  BM  SPAM FARM  [DELETE — CONFIRM]  [CANCEL]
```

---

## E. CSS Spec

All classes use the `gam-macro-` prefix. All values use BB token variables — zero inline styles in the HTML or JS-rendered output.

```css
/* ================================================================
   GAM Macros Card — Redesign (UIUX-06)
   Target file: popup.css, after existing /* Iter 14 */ block
   ================================================================ */

/* --- Filter/Sort Bar --- */
.gam-macro-filter-bar {
  display: flex;
  gap: var(--bb-s2);
  align-items: center;
  padding: var(--bb-s2) var(--bb-s3);
  border-bottom: 1px solid var(--bb-line);
  background: var(--bb-bg);
}
.gam-macro-search {
  flex: 1;
  background: var(--bb-sunken);
  border: 1px solid var(--bb-line);
  border-radius: 0;
  color: var(--bb-ink);
  font: var(--bb-t-xs)/1 var(--bb-font);
  padding: var(--bb-s2) var(--bb-s3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.gam-macro-search::placeholder { color: var(--bb-ink-faint); }
.gam-macro-search:focus {
  outline: 2px solid var(--bb-amber);
  outline-offset: -1px;
}
.gam-macro-sort-group {
  display: flex;
  gap: 0;
}
.gam-macro-sort-btn {
  background: transparent;
  border: none;
  color: var(--bb-ink-faint);
  cursor: pointer;
  font: 500 var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.08em;
  padding: var(--bb-s2) var(--bb-s3);
  text-transform: uppercase;
  border-bottom: 2px solid transparent;
  transition: color var(--gam-dur-micro) ease-out,
              border-color var(--gam-dur-micro) ease-out;
}
.gam-macro-sort-btn.active {
  color: var(--bb-amber);
  border-bottom-color: var(--bb-amber);
}
.gam-macro-sort-btn:hover:not(.active) { color: var(--bb-ink); }

/* --- List Container --- */
.gam-macro-list-v2 {
  background: var(--bb-panel);
  border: 1px solid var(--bb-line);
  border-radius: 0;
  max-height: 264px;   /* 6 rows comfortable at 44px/row */
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--bb-line-hot) var(--bb-sunken);
}

/* --- Macro Row --- */
.gam-macro-row-v2 {
  display: grid;
  grid-template-columns: 20px 1fr auto 0px; /* badge | content | use-ct | actions-gutter */
  grid-template-rows: auto auto;
  align-items: center;
  gap: 0 var(--bb-s3);
  padding: var(--bb-s3) var(--bb-s2) var(--bb-s3) var(--bb-s3);
  border-bottom: 1px solid var(--bb-line);
  cursor: default;
  position: relative;
  border-left: 2px solid transparent;
  transition:
    background var(--gam-dur-micro) ease-out,
    border-left-color var(--gam-dur-micro) ease-out;
}
.gam-macro-row-v2:hover {
  background: var(--bb-hover);
  border-left-color: var(--bb-amber);
  grid-template-columns: 20px 1fr auto 72px; /* expand actions gutter */
}
.gam-macro-row-v2:last-child { border-bottom: none; }

/* Row: kind badge (col 1, rows 1-2) */
.gam-macro-kind {
  grid-column: 1;
  grid-row: 1 / 3;
  align-self: center;
  font: 600 9px/1 var(--bb-font);
  letter-spacing: 0.04em;
  padding: 1px 2px;
  border: 1px solid;
  text-align: center;
}
.gam-macro-kind[data-kind="ban_msg"] {
  color: var(--bb-amber);
  border-color: var(--bb-amber-dim);
  background: var(--bb-amber-bg);
}
.gam-macro-kind[data-kind="mm_reply"] {
  color: var(--bb-cyan);
  border-color: rgba(102,204,255,.30);
  background: var(--bb-cyan-bg);
}

/* Row: label (col 2, row 1) */
.gam-macro-label-v2 {
  grid-column: 2;
  grid-row: 1;
  color: var(--bb-ink);
  font: 600 var(--bb-t-sm)/1.2 var(--bb-font);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Row: body preview (col 2, row 2) */
.gam-macro-preview {
  grid-column: 2;
  grid-row: 2;
  color: var(--bb-ink-dim);
  font: var(--bb-t-xs)/1.3 var(--bb-font);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: -webkit-line-clamp var(--gam-dur-micro);
}
.gam-macro-row-v2:hover .gam-macro-preview {
  -webkit-line-clamp: 2;
}

/* Row: use count (col 3, row 1) */
.gam-macro-usecount {
  grid-column: 3;
  grid-row: 1;
  color: var(--bb-ink-faint);
  font: var(--bb-t-xs)/1 var(--bb-font);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

/* Row: actions (col 4, rows 1-2) — hidden until hover */
.gam-macro-actions {
  grid-column: 4;
  grid-row: 1 / 3;
  align-self: center;
  display: flex;
  gap: var(--bb-s1);
  justify-content: flex-end;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--gam-dur-micro) ease-out;
}
.gam-macro-row-v2:hover .gam-macro-actions {
  opacity: 1;
  pointer-events: auto;
}
.gam-macro-row-v2:focus-within .gam-macro-actions {
  opacity: 1;
  pointer-events: auto;
}
.gam-macro-action-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: var(--bb-s1);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 0;
  opacity: 0.7;
  transition: opacity var(--gam-dur-micro);
}
.gam-macro-action-btn:hover { opacity: 1; }
.gam-macro-action-btn:focus-visible {
  outline: 2px solid var(--bb-amber);
  outline-offset: 1px;
}
.gam-macro-action-edit  svg { stroke: var(--bb-amber); }
.gam-macro-action-dupe  svg { stroke: var(--bb-cyan); }
.gam-macro-action-del   svg { stroke: var(--bb-red); }

/* --- Delete confirmation overlay on row --- */
.gam-macro-row-v2.gam-macro-delconfirm {
  background: var(--bb-red-bg);
  border-left-color: var(--bb-red);
}
.gam-macro-delbar {
  position: absolute;
  bottom: 0; left: 0;
  height: 2px;
  background: var(--bb-red);
  animation: gam-macro-delcountdown 4s linear forwards;
}
@keyframes gam-macro-delcountdown {
  from { width: 100%; }
  to   { width: 0%; }
}
.gam-macro-delconfirm-btns {
  display: flex;
  gap: var(--bb-s2);
}
.gam-macro-confirm-del-btn {
  background: var(--bb-red-bg);
  border: 1px solid var(--bb-red);
  color: var(--bb-red);
  font: 600 var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.06em;
  padding: var(--bb-s2) var(--bb-s3);
  text-transform: uppercase;
  cursor: pointer;
  border-radius: 0;
}
.gam-macro-confirm-cancel-btn {
  background: transparent;
  border: 1px solid var(--bb-line-hot);
  color: var(--bb-ink-dim);
  font: var(--bb-t-xs)/1 var(--bb-font);
  padding: var(--bb-s2) var(--bb-s3);
  cursor: pointer;
  border-radius: 0;
}

/* --- Inline Edit Form --- */
.gam-macro-edit-form {
  background: var(--bb-sunken);
  border: 1px solid var(--bb-amber-dim);
  border-left: 3px solid var(--bb-amber);
  padding: var(--bb-s4);
  overflow: hidden;
  max-height: 0;
  transition: max-height var(--gam-dur-fast) ease-out,
              padding var(--gam-dur-fast) ease-out;
}
.gam-macro-edit-form.open {
  max-height: 220px;
}
.gam-macro-edit-heading {
  color: var(--bb-amber);
  font: 600 var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: var(--bb-s3);
}
.gam-macro-field-row {
  display: flex;
  align-items: baseline;
  gap: var(--bb-s3);
  margin-bottom: var(--bb-s3);
}
.gam-macro-field-label {
  color: var(--bb-ink-faint);
  font: var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex: 0 0 36px;
  text-align: right;
}
.gam-macro-field-wrap {
  flex: 1;
  position: relative;
}
.gam-macro-field-input,
.gam-macro-field-textarea {
  width: 100%;
  background: var(--bb-panel);
  border: 1px solid var(--bb-line-hot);
  border-radius: 0;
  color: var(--bb-ink);
  font: var(--bb-t-sm)/1.4 var(--bb-font);
  padding: var(--bb-s2) var(--bb-s3);
  box-sizing: border-box;
}
.gam-macro-field-input:focus,
.gam-macro-field-textarea:focus {
  outline: 2px solid var(--bb-amber);
  outline-offset: -1px;
  border-color: var(--bb-amber-dim);
}
.gam-macro-field-textarea { resize: vertical; min-height: 72px; }
.gam-macro-char-counter {
  position: absolute;
  right: var(--bb-s2);
  bottom: var(--bb-s2);
  color: var(--bb-ink-faint);
  font: var(--bb-t-xs)/1 var(--bb-font);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
.gam-macro-char-counter.warn { color: var(--bb-warn); }
.gam-macro-char-counter.err  { color: var(--bb-red); }
.gam-macro-edit-actions {
  display: flex;
  justify-content: space-between;
  margin-top: var(--bb-s3);
}
.gam-macro-save-btn {
  background: var(--bb-amber);
  border: 1px solid var(--bb-amber);
  border-radius: 0;
  color: #0a0a0b;
  cursor: pointer;
  font: 700 var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.08em;
  padding: var(--bb-s3) var(--bb-s5);
  text-transform: uppercase;
}
.gam-macro-save-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.gam-macro-cancel-btn {
  background: transparent;
  border: 1px solid var(--bb-line-hot);
  border-radius: 0;
  color: var(--bb-ink-dim);
  cursor: pointer;
  font: var(--bb-t-xs)/1 var(--bb-font);
  padding: var(--bb-s3) var(--bb-s5);
  text-transform: uppercase;
}
.gam-macro-edit-error {
  color: var(--bb-red);
  font: var(--bb-t-xs)/1.3 var(--bb-font);
  margin-top: var(--bb-s2);
  display: none;
}
.gam-macro-edit-error:not(:empty) { display: block; }

/* --- Footer action bar --- */
.gam-macro-footer {
  display: flex;
  gap: var(--bb-s2);
  padding: var(--bb-s2) var(--bb-s3);
  border-top: 1px solid var(--bb-line);
  background: var(--bb-bg);
}
.gam-macro-new-btn {
  flex: 1;
  background: transparent;
  border: 1px solid var(--bb-line-hot);
  border-radius: 0;
  color: var(--bb-amber);
  cursor: pointer;
  font: 600 var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.08em;
  padding: var(--bb-s3) 0;
  text-transform: uppercase;
  transition: background var(--gam-dur-micro) ease-out;
}
.gam-macro-new-btn:hover { background: var(--bb-amber-bg); }
.gam-macro-ai-btn {
  background: transparent;
  border: 1px solid rgba(167,139,250,.30);
  border-radius: 0;
  color: var(--bb-purple);
  cursor: pointer;
  font: var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.06em;
  padding: var(--bb-s3) var(--bb-s4);
  text-transform: uppercase;
  transition: background var(--gam-dur-micro) ease-out;
}
.gam-macro-ai-btn:hover { background: var(--bb-purple-bg); }

/* --- Empty / zero-state --- */
.gam-macro-empty {
  padding: var(--bb-s7) var(--bb-s5);
  text-align: center;
  color: var(--bb-ink-faint);
  font: var(--bb-t-xs)/1.6 var(--bb-font);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.gam-macro-empty-action {
  display: inline-block;
  margin-top: var(--bb-s3);
  color: var(--bb-amber);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* --- AI suggestion review panel --- */
.gam-macro-ai-review {
  background: var(--bb-sunken);
  border: 1px solid rgba(167,139,250,.35);
  border-left: 3px solid var(--bb-purple);
  padding: var(--bb-s4);
  max-height: 0;
  overflow: hidden;
  transition: max-height var(--gam-dur-fast) ease-out;
}
.gam-macro-ai-review.open { max-height: 320px; overflow-y: auto; }
.gam-macro-ai-suggestion {
  display: flex;
  align-items: flex-start;
  gap: var(--bb-s3);
  padding: var(--bb-s3) 0;
  border-bottom: 1px solid var(--bb-line);
}
.gam-macro-ai-suggestion:last-of-type { border-bottom: none; }
.gam-macro-ai-check {
  flex: 0 0 14px;
  height: 14px;
  border: 1px solid var(--bb-amber);
  background: transparent;
  appearance: none;
  cursor: pointer;
  position: relative;
  margin-top: 2px;
}
.gam-macro-ai-check:checked {
  background: var(--bb-amber-bg);
}
.gam-macro-ai-check:checked::after {
  content: '';
  position: absolute;
  inset: 2px;
  background: var(--bb-amber);
}
.gam-macro-ai-sugg-label {
  color: var(--bb-ink);
  font: 600 var(--bb-t-xs)/1.2 var(--bb-font);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.gam-macro-ai-sugg-body {
  color: var(--bb-ink-dim);
  font: var(--bb-t-xs)/1.4 var(--bb-font);
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.gam-macro-ai-review-actions {
  display: flex;
  gap: var(--bb-s2);
  margin-top: var(--bb-s3);
  justify-content: space-between;
}
```

---

## F. HTML Structure

Drop-in replacement for the `#macrosSection` `<div>` interior (L308-331 popup.html).
The `<div id="macrosSection" class="pop-token">` wrapper stays. Interior replaces.

```html
<!-- v11: Macros card interior — UIUX-06 redesign -->

<!-- Tab row (unchanged in structure, class names updated) -->
<div class="gam-macro-tabs" role="tablist">
  <button class="gam-macro-tab gam-macro-tab-active" role="tab"
          aria-selected="true" data-kind="ban_msg">
    BAN MESSAGES
  </button>
  <button class="gam-macro-tab" role="tab"
          aria-selected="false" data-kind="mm_reply">
    MODMAIL REPLIES
  </button>
</div>

<!-- Inline edit form (hidden at rest, slide-in on open) -->
<div class="gam-macro-edit-form" id="macroEditForm" aria-hidden="true">
  <div class="gam-macro-edit-heading" id="macroEditHeading">NEW BAN MESSAGE</div>
  <div class="gam-macro-field-row">
    <label class="gam-macro-field-label" for="macroEditLabel">LABEL</label>
    <div class="gam-macro-field-wrap">
      <input class="gam-macro-field-input" id="macroEditLabel"
             type="text" maxlength="80" autocomplete="off"
             aria-label="Macro label" aria-describedby="macroLabelCounter">
      <span class="gam-macro-char-counter" id="macroLabelCounter">0/80</span>
    </div>
  </div>
  <div class="gam-macro-field-row">
    <label class="gam-macro-field-label" for="macroEditBody">BODY</label>
    <div class="gam-macro-field-wrap">
      <textarea class="gam-macro-field-textarea" id="macroEditBody"
                rows="4" maxlength="4000"
                aria-label="Macro body text" aria-describedby="macroBodyCounter"></textarea>
      <span class="gam-macro-char-counter" id="macroBodyCounter">4000 remaining</span>
    </div>
  </div>
  <div id="macroEditError" class="gam-macro-edit-error" role="alert"></div>
  <div class="gam-macro-edit-actions">
    <button class="gam-macro-cancel-btn" id="macroCancelBtn" type="button">CANCEL</button>
    <button class="gam-macro-save-btn"   id="macroSaveBtn"   type="button">SAVE MACRO</button>
  </div>
  <input type="hidden" id="macroEditId">
</div>

<!-- AI suggestion review panel (hidden at rest) -->
<div class="gam-macro-ai-review" id="macroAiReview" aria-hidden="true">
  <div class="gam-macro-edit-heading" style="color:var(--bb-purple)">AI SUGGESTIONS</div>
  <div id="macroAiSuggList"><!-- populated by JS --></div>
  <div class="gam-macro-ai-review-actions">
    <button class="gam-macro-cancel-btn" id="macroAiDiscardBtn" type="button">DISCARD ALL</button>
    <button class="gam-macro-save-btn"   id="macroAiSaveBtn"   type="button"
            style="background:var(--bb-purple);border-color:var(--bb-purple)">
      SAVE SELECTED
    </button>
  </div>
</div>

<!-- Filter/sort bar -->
<div class="gam-macro-filter-bar">
  <input class="gam-macro-search" id="macroSearch"
         type="search" autocomplete="off" spellcheck="false"
         placeholder="FILTER MACROS..."
         aria-label="Filter macros by name or content">
  <div class="gam-macro-sort-group" role="group" aria-label="Sort macros">
    <button class="gam-macro-sort-btn active" data-sort="name" type="button">NAME</button>
    <button class="gam-macro-sort-btn"        data-sort="use"  type="button">USE</button>
    <button class="gam-macro-sort-btn"        data-sort="date" type="button">DATE</button>
  </div>
</div>

<!-- Macro list -->
<div class="gam-macro-list-v2" id="macrosList" role="list">
  <!-- Skeleton / loading state -->
  <div class="gam-macro-empty" id="macrosLoading">LOADING...</div>
  <!-- Rows injected by JS: .gam-macro-row-v2 elements -->
  <!-- Empty state (shown by JS when 0 results) -->
  <div class="gam-macro-empty" id="macrosEmpty" style="display:none">
    NO MACROS YET
    <span class="gam-macro-empty-action" id="macrosEmptyAddLink">+ ADD FIRST MACRO</span>
  </div>
  <div class="gam-macro-empty" id="macrosNoMatch" style="display:none">
    NO MATCH
    <span class="gam-macro-empty-action" id="macrosClearFilter">CLEAR FILTER</span>
  </div>
</div>

<!-- Footer action bar -->
<div class="gam-macro-footer">
  <button class="gam-macro-new-btn" id="macroAddBtn" type="button">+ NEW MACRO</button>
  <button class="gam-macro-ai-btn"  id="macroAiSeedBtn" type="button"
          title="Generate starter macros with AI (uses daily AI budget)">
    AI GENERATE
  </button>
</div>

<!-- Status line (unchanged ID, unchanged usage) -->
<div id="macrosStatus" class="pop-token-status"></div>
```

### Per-Macro Row Template (JS-generated)

```html
<div class="gam-macro-row-v2" role="listitem" tabindex="0"
     data-id="{{m.id}}" data-kind="{{m.kind}}"
     aria-label="{{m.label}} — {{m.kind === 'ban_msg' ? 'ban message' : 'modmail reply'}}">

  <span class="gam-macro-kind" data-kind="{{m.kind}}">
    {{m.kind === 'ban_msg' ? 'BM' : 'MM'}}
  </span>

  <span class="gam-macro-label-v2">{{m.label}}</span>

  <span class="gam-macro-preview">{{m.body}}</span>

  <span class="gam-macro-usecount"
        {{m.use_count > 0 ? '' : 'style="opacity:0.3"'}}>
    {{m.use_count > 0 ? m.use_count + ' use' + (m.use_count !== 1 ? 's' : '') : '0'}}
  </span>

  <div class="gam-macro-actions" aria-label="Actions">
    <button class="gam-macro-action-btn gam-macro-action-edit"
            type="button" title="Edit" aria-label="Edit macro">
      <!-- SVG: pencil, 16x16, stroke currentColor, 1.5px -->
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
           stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M11 2l3 3-8 8H3v-3l8-8z"/>
      </svg>
    </button>
    <button class="gam-macro-action-btn gam-macro-action-dupe"
            type="button" title="Duplicate" aria-label="Duplicate macro">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
           stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <rect x="5" y="5" width="8" height="10" rx="0"/>
        <path d="M3 11V3h8"/>
      </svg>
    </button>
    <button class="gam-macro-action-btn gam-macro-action-del"
            type="button" title="Delete" aria-label="Delete macro">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
           stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
      </svg>
    </button>
  </div>
</div>
```

### Delete Confirmation Overlay (injected by JS into the row)

```html
<!-- Replaces .gam-macro-actions content during delete confirmation -->
<div class="gam-macro-delbar" aria-hidden="true"></div>
<div class="gam-macro-delconfirm-btns">
  <button class="gam-macro-confirm-del-btn" type="button">CONFIRM DELETE</button>
  <button class="gam-macro-confirm-cancel-btn" type="button">CANCEL</button>
</div>
```

---

## G. Effort Estimate

### Scope boundary

This estimate covers the **macros card UI only** — popup.html + popup.css + the macro CRUD section of popup.js (~L3288-3490). No changes to background.js, worker endpoints, or modtools.js.

| Task | Lines changed | Complexity | Hours |
|---|---|---|---|
| CSS — add redesign classes (section E) | ~220 new lines, popup.css | Low — additive, no existing classes removed until old ones purged | 1.0h |
| HTML — swap macrosSection interior (section F) | ~60 lines replaced in popup.html L308-331 | Low — structural swap | 0.5h |
| JS — `loadMacros()` rewrite to emit `.gam-macro-row-v2` grid rows with SVG icons | ~80 lines replaced | Medium — grid column layout, icon injection, keyboard handling | 1.5h |
| JS — `__macroStartEdit()` → inline form animation (max-height toggle, char counters) | ~40 lines | Low-Medium | 0.75h |
| JS — `__macroDelete()` → inline confirm + countdown bar (replace `window.confirm`) | ~50 lines | Medium — timeout management, bar animation | 1.0h |
| JS — filter bar (live search + sort) | ~80 new lines | Medium — debounce, sort comparators, no-match state | 1.5h |
| JS — AI seed flow (`__macroAiSeed()`) → inline review panel (replace `window.confirm`) | ~60 lines replaced | Medium — checkbox state, partial save loop | 1.0h |
| QA — cross-browser (Chrome, popup dimensions 360-400px wide) | — | Low | 0.5h |
| **Total** | | | **7.75h** |

### Risk flags

- **`-webkit-line-clamp` body expand on hover**: CSS `transition` on `line-clamp` is not animated in current Chrome — the expand snaps. Acceptable for this context; alternative is a `max-height` transition on the preview element (slightly more JS).
- **`grid-template-columns` expansion on hover**: Expanding the actions column from `0px` to `72px` via CSS hover selector causes a reflow on the row. At 28px height this is negligible, but if the list is scrolled to 100+ rows, it may flicker on low-end machines. Mitigation: pre-allocate the actions column width and use `opacity`/`pointer-events` only (simpler, zero reflow).
- **Inline edit form `max-height` animation**: works reliably for fixed-height content. The textarea is resizable — if the mod drags it taller, `max-height` will clip. Fix: set `max-height` large enough (e.g. 400px) and accept the animation isn't pixel-perfect on the initial open.
- **Old `.gam-macro-row` CSS** (popup.css L230-246, L1116-1141): leave in place until the new JS is confirmed working. Both class sets can coexist during transition. Remove old block in a separate CSS cleanup pass.
