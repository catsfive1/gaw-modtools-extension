# UIUX2-04 -- Macros Card Redesign v2
**Card:** `#card-macros` / `#macrosSection`
**Author:** UIUX2-04-MACROS-CARD (ralph agent, v10.13)
**Date:** 2026-05-10
**Status:** Design spec -- read-only, no code touched
**Supersedes:** `docs/V10_DESIGN/UIUX-06_macros_card.md`

---

## A. Baseline Audit -- What v10.12.3 Actually Ships

This section audits the *current dist build* (`D:\AI\_PROJECTS\dist\mod-tools dist\`),
not the v1 spec. The v1 spec (UIUX-06) correctly identified every issue listed there.
This audit records what has or has not been resolved since that doc was written, and
surfaces net-new issues visible in the actual source.

### A1. Issues from UIUX-06 still OPEN in v10.12.3

| # | Issue | Location | Severity |
|---|---|---|---|
| 1 | `window.confirm()` in `__macroDelete()` -- blocking OS dialog | popup.js L3836 | CRITICAL |
| 2 | `window.confirm()` in `__macroAiSeed()` -- blocking OS dialog with newline-joined string | popup.js L3879 | CRITICAL |
| 3 | Action buttons (Edit / Delete) always-visible per row -- ~40px height waste per macro | popup.js L3767-3776 | HIGH |
| 4 | JS-built rows use heavy inline `style=` overrides -- shadow BB token variables, prevent theme propagation | popup.js L3758-3786 | HIGH |
| 5 | Body text has no single-line clamp -- long macros explode row height | popup.js L3782 | HIGH |
| 6 | Edit form appended below list, causes layout jump and list context loss | popup.html L434-445 | HIGH |
| 7 | Emoji in card title (`&#x1F4DD;`) | popup.html L409 | MEDIUM |
| 8 | Emoji in AI button (`&#x2728;`) | popup.html L432 | MEDIUM |
| 9 | Duplicate label: card header says "Team Macros", section `<label>` repeats "Team Macros -- shared canned messages" | popup.html L416-418 | MEDIUM |
| 10 | No filter/search bar | popup.html | MEDIUM |
| 11 | No sort controls | popup.html | MEDIUM |
| 12 | Use-count badge (`useCount`) has no CSS class -- raw inline style | popup.js L3764-3766 | LOW |
| 13 | Tab buttons use inline `style="flex:1"` | popup.html L420-421 | LOW |

### A2. Issues from UIUX-06 that ARE addressed in v10.12.3

| # | Issue | Resolution |
|---|---|---|
| A | Skeleton loading state (not "Loading..." text) | gamMakeSkel() call in loadMacros() -- DONE |
| B | Badge count on card header | `card-badge-macros` wired -- DONE |
| C | `.gam-macro-tab-active` amber underline tab styling | popup.css L1107-1110 -- DONE |
| D | `.gam-macro-item-*` class set for row components | popup.css L1116-1141 -- present but unused by current JS |

Note on D: The CSS classes `.gam-macro-item`, `.gam-macro-item-label`, `.gam-macro-item-body`,
`.gam-macro-item-meta` exist in popup.css (L1116-1141) but the JS row builder (L3754-3791)
does NOT use them -- it builds rows with inline styles against the old `.gam-macro-row` class.
This is a dead CSS block AND a broken style contract simultaneously.

### A3. Net-New Issues (not in UIUX-06)

| # | Issue | Location | Severity |
|---|---|---|---|
| N1 | `--gam-dur-fast` referenced in UIUX-06 CSS spec does NOT exist in popup.css token block -- the token block only defines `--gam-dur-micro` (80ms), `--gam-dur-appear` (160ms), `--gam-dur-disappear` (120ms), `--gam-dur-decision` (200ms) | popup.css L708-711 | MEDIUM (would break animation on implementation) |
| N2 | `.gam-macro-list` CSS class (popup.css L1111) is unused -- the actual list container uses `id="macrosList"` with no class | popup.html L423 | LOW |
| N3 | Duplicate `.gam-macro-tab-active` definition: one at L231 (old, uses `#4A9EFF` blue), one at L1107 (new, uses `--bb-amber`). The old one fires first because it has `!important` and uses `background`/`border-color`/`color` triplet, conflicting with the new underscore-tab style | popup.css L231-234 vs L1107-1110 | HIGH |
| N4 | `__macroDelete()` guard `if (!m || !m.id) return` is correct but then immediately hits `window.confirm` -- zero latency to accidentally trigger OS block | popup.js L3835-3836 | CRITICAL (same as #1, amplified) |
| N5 | AI seed `macroAiSeedBtn` button lacks `type="button"` -- inside a non-form context so not dangerous, but inconsistent with form hygiene | popup.html L432 | LOW |
| N6 | `withLoading()` wrapper on save (popup.js L3915) but no equivalent on AI seed button -- AI seed button manually sets `btn.disabled=true` and restores in `finally`, creating drift from the established pattern | popup.js L3913-3914 vs L3856-3897 | LOW |

---

## B. Design Decisions v2

### B1. What v1 (UIUX-06) got right -- carry forward unchanged

The UIUX-06 spec is architecturally sound. These decisions are confirmed and unchanged:

- **Row layout**: 4-column grid (`KIND-BADGE | LABEL | USE-CT | ACTIONS-GUTTER`), 28px base height
- **Hover-revealed action trio**: Edit (pencil), Duplicate (copy), Delete (trash) SVG icons -- `opacity:0` at rest, `opacity:1` on hover/focus-within
- **Inline delete confirmation**: row goes red, countdown bar, `CONFIRM DELETE` / `CANCEL` -- no `window.confirm`
- **Inline edit form**: `max-height` slide above the list, not below
- **AI review panel**: checkbox list of suggestions, not `window.confirm`
- **Filter + sort bar**: between tabs and list
- **No emoji anywhere**: card title, buttons, status messages
- **BB token variables only**: zero inline styles in JS-built DOM

### B2. Revisions to UIUX-06 spec

**B2.1 Animation token correction**

UIUX-06 used `--gam-dur-fast` in CSS transitions. This token does not exist.
Correct mapping:

| UIUX-06 used | Actual token | Value | Use here |
|---|---|---|---|
| `--gam-dur-fast` (form slide) | `--gam-dur-decision` | 200ms | Edit form / AI panel open/close |
| `--gam-dur-fast` (row hover) | `--gam-dur-micro` | 80ms | Row background, border, action opacity |

All CSS in this spec uses only defined tokens.

**B2.2 Duplicate tab class conflict resolution**

The old `.gam-macro-tab-active` block (popup.css L231-234) uses `!important` triplet and
`#4A9EFF` blue. It must be removed or overridden with higher specificity before the new
amber-underline tab style can render correctly. Implementation note: remove L231-234 when
the new class block is deployed. Do not attempt to overpower it with another `!important`.

**B2.3 Edit form position**

UIUX-06 placed the inline edit form between the sort bar and the list (form above, list scrolls
down). v2 confirms this. Rationale: the mod is editing a macro that exists in the list; seeing
the list context while editing prevents duplicate-label errors and enables copy-reference.
The form must slide in above the list, not append below it.

**B2.4 Delete countdown: 4s stays**

UIUX-06 specced 4s countdown. This is correct. The macro is team-shared; 4s gives enough time
to reconsider without feeling like a forced pause.

**B2.5 AI panel: purple accent, not amber**

The AI suggestion review panel uses `--bb-purple` (a7 8bfa / #a78bfa) as its left-border and
heading accent. This differentiates it visually from the amber edit form and communicates "this
is AI-generated content, not human-authored." Confirmed from UIUX-06.

**B2.6 Row body preview: clamp strategy**

`-webkit-line-clamp: 1` at rest, `2` on hover. Chrome does not animate this property -- it
snaps. This is acceptable for this use case. The snap is a crisp reveal, not a bug.
Alternative (`max-height` transition) is not recommended because it requires explicit
pixel budgeting per macro which varies by font size and viewport zoom.

**B2.7 Duplicate action**

UIUX-06 included a Duplicate (copy) action. This is confirmed for v2. Duplicate creates
a new macro pre-filled with the source macro's label (`COPY: <original label>`) and body,
opens the edit form in "new" mode. No RPC call happens until the mod saves.
The kind badge matches the source macro's kind and is not editable from the row --
only from inside the edit form where a `KIND` toggle can be surfaced.

**B2.8 Kind toggle in edit form (new in v2)**

The edit form in UIUX-06 had no kind selector -- the kind was inherited from the active tab.
v2 adds a `KIND` toggle inside the form:

```
KIND  [BAN MESSAGE]  [MODMAIL REPLY]
```

Two text-buttons, Bloomberg-style (amber underline active, `--bb-ink-faint` inactive).
This allows editing a macro's kind without closing the form and switching tabs, which
matters when duplicating a macro across kinds.

---

## C. Row Architecture (confirmed v2)

### C1. Row Anatomy (28px base, dense, Bloomberg grid)

```
| 22px | flex-1 | auto | 0->72px |
|------|--------|------|---------|
|  BM  |  SPAM FARM         | 7  |        <- row 1: badge | label | use-ct | actions-gutter
|      |  Your account...   |    |        <- row 2: (blank) | preview | (blank) | (blank)
```

Column definitions:

- **Col 1 (22px)**: `KIND` badge -- 2-char mono chip. `BM` (ban_msg, amber) / `MM` (mm_reply, cyan). Spans both rows via `grid-row: 1 / 3`.
- **Col 2 (flex-1)**: Row 1 = LABEL (uppercase, 600wt, truncated). Row 2 = BODY PREVIEW (clamp-1, dim).
- **Col 3 (auto)**: USE-CT (tabular-nums, faint). Hidden at `opacity:0.3` if `use_count === 0`.
- **Col 4 (0px -> 72px)**: ACTIONS-GUTTER. Zero width at rest (no layout shift). Transitions to 72px on hover via `grid-template-columns` change. Contains the 3 action icon-buttons.

**Note on col-4 reflow**: UIUX-06 flagged this as a risk. v2 calls it accepted. At 28px row
height and max ~20 rows visible, the reflow is visually instant. Pre-allocating the gutter
at 72px always would waste 72px from LABEL on every row -- not acceptable in a 380px popup.

### C2. Action Icons (hover-revealed)

Three 20x20px touch-target icon-buttons, 4px gap:

| Button | Icon | Stroke color | Action |
|---|---|---|---|
| Edit | Pencil SVG | `--bb-amber` | Opens inline edit form pre-filled with this macro |
| Duplicate | Copy SVG | `--bb-cyan` | Clones macro into edit form as new, pre-labeled "COPY: ..." |
| Delete | Trash SVG | `--bb-red` | Triggers inline delete confirmation overlay |

All three are `tabindex="-1"` at rest (not in Tab order). When the row receives focus
(tabindex="0"), the actions gutter becomes visible and the buttons become `tabindex="0"`.

### C3. Delete Confirmation (inline, no window.confirm)

Sequence:
1. Mod clicks trash icon
2. Row immediately adds class `gam-macro-delconfirm`: background -> `--bb-red-bg`, left border -> `--bb-red`
3. Label truncates to fit; action trio replaced by `[CONFIRM DELETE] [CANCEL]` buttons
4. Thin red bar (2px) appears at row bottom, animates from 100% width to 0% over 4s (`gam-macro-delcountdown`)
5. Bar reaching 0% auto-cancels (calls cancel handler, removes `gam-macro-delconfirm`)
6. Mod clicking CONFIRM triggers `macroDelete` RPC; row fades out on success
7. Mod clicking CANCEL removes `gam-macro-delconfirm`, restores normal row state

No `window.confirm`. No blocking. No OS dialog.

---

## D. Filter + Sort Bar

### D1. Layout

```
[FILTER MACROS...                   ] [NAME^] [USE] [DATE]
```

Single flex row. Search input `flex:1`. Sort group `flex:0`. Total height: `var(--bb-s7)` (24px).

- **Search input**: `type="search"`, `autocomplete="off"`, `spellcheck="false"`. Placeholder: `FILTER MACROS...` (uppercased, faint). Live filter on `input` event, debounced 150ms. Filters against both `m.label` and `m.body` (case-insensitive). No submit button.
- **Sort group**: Three text-buttons. Active has amber bottom border. Clicking active button reverses direction (asc/desc), appending `^` or `v` to the label. Clicking inactive sets it active ascending.
  - `NAME` -- alphabetical by label
  - `USE` -- descending by use_count (descending by default, highest-used first)
  - `DATE` -- descending by updated_at / created_at

### D2. Filter state wiring

Filter and sort are client-side only -- the full macro list is loaded once per tab-switch,
stored in a module-level array (`__macroData`), and the rendered DOM is rebuilt from the
filtered+sorted subset on any filter/sort change. No additional RPCs.

No-match state: the list shows a single centered row:

```
NO MATCH -- CLEAR FILTER
```

"CLEAR FILTER" is an inline `<button>` styled as an amber text link.

---

## E. Edit Form (inline slide, above list)

### E1. Position

The form is a sibling element inserted between the filter bar and the list container.
At rest: `max-height:0; padding-top:0; padding-bottom:0; overflow:hidden`.
When open: `max-height:260px` (enough for label + 4-row textarea + counters + actions),
transition using `--gam-dur-decision` (200ms ease-out).

### E2. Structure

```
EDITING: BAN MESSAGE                  [x close]
KIND     [BAN MESSAGE]  [MODMAIL REPLY]
LABEL    [__________________________________] 0/80
BODY     [                                  ]
         [                                  ]
         [                                  ]
         [                    4000 remaining ]
[CANCEL]                         [SAVE MACRO]
```

- Heading: `EDITING: BAN MESSAGE` or `NEW BAN MESSAGE` depending on whether `__macroEditing.id` is set. Updated dynamically if kind toggle changes.
- KIND toggle: two buttons, amber-underline active, `--bb-ink-faint` inactive. Updates `__macroKind` for this session's form (does NOT switch the tab; the list underneath stays on the current tab filter).
- LABEL input: maxlength=80. Char counter at top-right of input: `0/80`, turns `--bb-warn` at 60+, `--bb-red` at 76+.
- BODY textarea: 4 rows, `resize:vertical`. Counter at bottom-right: `4000 remaining`, turns `--bb-warn` at <400 remaining, `--bb-red` at <100.
- Error display: `role="alert"` div below BODY, hidden until non-empty, `--bb-red`.
- Actions: CANCEL (ghost) left, SAVE MACRO (amber primary) right.

### E3. Keyboard handling

- `Escape` inside any form field: calls cancel, collapses form, returns focus to the row that opened it (if edit) or the NEW MACRO button (if new).
- `Tab` cycles through KIND toggle buttons -> LABEL -> BODY -> CANCEL -> SAVE.
- SAVE button is the only primary CTA; pressing Enter in LABEL moves focus to BODY (not submit).

---

## F. AI Seed Flow (inline review panel, no window.confirm)

### F1. Trigger

`AI GENERATE` button in the footer bar. Calls existing `__macroAiSeed()` RPC flow.
No `window.confirm` at any point.

### F2. Review Panel

The panel is a sibling of the edit form, inserted in the same zone (between filter bar and list).
Edit form and AI review panel are mutually exclusive -- opening one closes the other.
At rest: `max-height:0; overflow:hidden`. When open: `max-height:340px; overflow-y:auto`.
Transition: `--gam-dur-decision`.

```
AI SUGGESTIONS (5)                        [x close]
[x] SPAM FARM       Your account was removed for promoting...
[x] NO POLITICS     This community focuses on Q research...
[ ] CIVILITY        Please keep discussion civil. Your...
[x] LINK SPAM       We don't allow external links to...
[x] OFFTOPIC        Post removed: does not relate to Q...

[DISCARD ALL]                     [SAVE SELECTED (4)]
```

- Purple left-border, purple heading accent (`--bb-purple`).
- Each suggestion row: checkbox (BB square, amber check) + label (uppercase, 600wt) + body preview (clamp-2, dim). 
- Checkboxes default to checked. Mod unchecks items to exclude.
- `SAVE SELECTED (N)` button updates its count as checkboxes toggle.
- `SAVE SELECTED` is a purple-primary button (same shape as amber SAVE MACRO, but `background: var(--bb-purple)`).
- Save flow: iterates checked items, calls `macroUpsert` RPC for each. Progress shown in `#macrosStatus`. On completion, panel closes, list reloads.
- `DISCARD ALL` closes panel with no RPC calls.

### F3. During generation (loading state)

While `macroAiSuggest` RPC is in flight:
- AI GENERATE button text: `AI GENERATING...`, disabled.
- `#macrosStatus` shows: `ASKING AI FOR {KIND} SUGGESTIONS...`
- No spinner (too busy; status line is sufficient signal).

---

## G. CSS Spec v2

All classes use the `gam-macro-` prefix. All values use BB token variables.
Zero inline styles in HTML or JS-rendered DOM.
Token corrections vs UIUX-06: `--gam-dur-fast` replaced with `--gam-dur-decision`.

```css
/* ================================================================
   GAM Macros Card v2 -- UIUX2-04
   Target: popup.css, replacing /* Iter 14 */ block (L1089-1141)
   Remove legacy: L231-234 (old .gam-macro-tab-active with blue)
   ================================================================ */

/* --- Tab row (replaces Iter 14 .gam-macro-tabs / .gam-macro-tab) --- */
.gam-macro-tabs {
  display: flex;
  border-bottom: 1px solid var(--bb-line-hot);
}
.gam-macro-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--bb-ink-dim);
  cursor: pointer;
  flex: 1;
  font: 500 var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.08em;
  padding: var(--bb-s3) var(--bb-s5);
  text-transform: uppercase;
  transition: color var(--gam-dur-micro) ease-out,
              border-bottom-color var(--gam-dur-micro) ease-out;
}
.gam-macro-tab:hover:not(.active) { color: var(--bb-ink); }
.gam-macro-tab.active {
  color: var(--bb-amber);
  border-bottom-color: var(--bb-amber);
}
.gam-macro-tab:focus-visible {
  outline: 2px solid var(--bb-amber);
  outline-offset: -2px;
}

/* --- Filter/Sort bar --- */
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
  min-width: 0;
}
.gam-macro-search::placeholder { color: var(--bb-ink-faint); }
.gam-macro-search:focus {
  outline: 2px solid var(--bb-amber);
  outline-offset: -1px;
}
.gam-macro-sort-group { display: flex; gap: 0; }
.gam-macro-sort-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--bb-ink-faint);
  cursor: pointer;
  font: 500 var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.08em;
  padding: var(--bb-s2) var(--bb-s3);
  text-transform: uppercase;
  transition: color var(--gam-dur-micro) ease-out,
              border-bottom-color var(--gam-dur-micro) ease-out;
  white-space: nowrap;
}
.gam-macro-sort-btn.active { color: var(--bb-amber); border-bottom-color: var(--bb-amber); }
.gam-macro-sort-btn:hover:not(.active) { color: var(--bb-ink); }

/* --- Inline Edit Form + AI Review Panel (shared expansion pattern) --- */
.gam-macro-edit-form,
.gam-macro-ai-review {
  overflow: hidden;
  max-height: 0;
  padding: 0 var(--bb-s4);
  transition: max-height var(--gam-dur-decision) ease-out,
              padding var(--gam-dur-decision) ease-out;
}
.gam-macro-edit-form { border-left: 3px solid var(--bb-amber); background: var(--bb-sunken); }
.gam-macro-ai-review  { border-left: 3px solid var(--bb-purple); background: var(--bb-sunken); }
.gam-macro-edit-form.open  { max-height: 260px; padding: var(--bb-s4); }
.gam-macro-ai-review.open  { max-height: 340px; padding: var(--bb-s4); overflow-y: auto; }

.gam-macro-form-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--bb-s3);
}
.gam-macro-form-title {
  font: 600 var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.gam-macro-edit-form  .gam-macro-form-title { color: var(--bb-amber); }
.gam-macro-ai-review  .gam-macro-form-title { color: var(--bb-purple); }
.gam-macro-form-close {
  background: transparent;
  border: none;
  color: var(--bb-ink-faint);
  cursor: pointer;
  font: var(--bb-t-base)/1 var(--bb-font);
  padding: 0 var(--bb-s1);
}
.gam-macro-form-close:hover { color: var(--bb-ink); }

/* Kind toggle (inside edit form) */
.gam-macro-kind-row {
  display: flex;
  align-items: center;
  gap: var(--bb-s3);
  margin-bottom: var(--bb-s3);
}
.gam-macro-kind-label {
  color: var(--bb-ink-faint);
  font: var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex: 0 0 36px;
  text-align: right;
}
.gam-macro-kind-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--bb-ink-faint);
  cursor: pointer;
  font: 500 var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.06em;
  padding: var(--bb-s1) var(--bb-s2);
  text-transform: uppercase;
  transition: color var(--gam-dur-micro), border-bottom-color var(--gam-dur-micro);
}
.gam-macro-kind-btn.active { color: var(--bb-amber); border-bottom-color: var(--bb-amber); }

/* Field rows */
.gam-macro-field-row {
  display: flex;
  align-items: flex-start;
  gap: var(--bb-s3);
  margin-bottom: var(--bb-s3);
}
.gam-macro-field-label {
  color: var(--bb-ink-faint);
  font: var(--bb-t-xs)/1.6 var(--bb-font);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex: 0 0 36px;
  text-align: right;
  padding-top: var(--bb-s2);
}
.gam-macro-field-wrap { flex: 1; position: relative; min-width: 0; }
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
.gam-macro-field-textarea { resize: vertical; min-height: 68px; }
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
.gam-macro-form-error {
  color: var(--bb-red);
  font: var(--bb-t-xs)/1.3 var(--bb-font);
  margin-bottom: var(--bb-s2);
  display: none;
}
.gam-macro-form-error:not(:empty) { display: block; }
.gam-macro-form-actions {
  display: flex;
  justify-content: space-between;
  gap: var(--bb-s2);
}

/* Shared button primitives */
.gam-macro-btn-primary {
  border-radius: 0;
  cursor: pointer;
  font: 700 var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.08em;
  padding: var(--bb-s3) var(--bb-s5);
  text-transform: uppercase;
  border: 1px solid;
}
.gam-macro-btn-primary.amber {
  background: var(--bb-amber);
  border-color: var(--bb-amber);
  color: #0a0a0b;
}
.gam-macro-btn-primary.purple {
  background: var(--bb-purple);
  border-color: var(--bb-purple);
  color: #0a0a0b;
}
.gam-macro-btn-primary:disabled { opacity: 0.4; cursor: default; }
.gam-macro-btn-ghost {
  background: transparent;
  border: 1px solid var(--bb-line-hot);
  border-radius: 0;
  color: var(--bb-ink-dim);
  cursor: pointer;
  font: var(--bb-t-xs)/1 var(--bb-font);
  padding: var(--bb-s3) var(--bb-s5);
  text-transform: uppercase;
}
.gam-macro-btn-ghost:hover { color: var(--bb-ink); border-color: var(--bb-ink-dim); }

/* --- List container --- */
.gam-macro-list-v2 {
  background: var(--bb-panel);
  border: 1px solid var(--bb-line);
  border-radius: 0;
  max-height: 264px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--bb-line-hot) var(--bb-sunken);
}

/* --- Macro row (grid) --- */
.gam-macro-row-v2 {
  display: grid;
  grid-template-columns: 22px 1fr auto 0px;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: var(--bb-s3);
  padding: var(--bb-s2) var(--bb-s3);
  border-bottom: 1px solid var(--bb-line);
  border-left: 2px solid transparent;
  cursor: default;
  position: relative;
  transition: background var(--gam-dur-micro) ease-out,
              border-left-color var(--gam-dur-micro) ease-out,
              grid-template-columns var(--gam-dur-micro) ease-out;
}
.gam-macro-row-v2:last-child { border-bottom: none; }
.gam-macro-row-v2:hover,
.gam-macro-row-v2:focus-within {
  background: var(--bb-hover);
  border-left-color: var(--bb-amber);
  grid-template-columns: 22px 1fr auto 72px;
}

/* Badge: col 1, rows 1-2 */
.gam-macro-kind-badge {
  grid-column: 1;
  grid-row: 1 / 3;
  align-self: center;
  font: 600 8px/1 var(--bb-font);
  letter-spacing: 0.04em;
  padding: 1px 2px;
  border: 1px solid;
  text-align: center;
}
.gam-macro-kind-badge[data-kind="ban_msg"] {
  color: var(--bb-amber);
  border-color: var(--bb-amber-dim);
  background: var(--bb-amber-bg);
}
.gam-macro-kind-badge[data-kind="mm_reply"] {
  color: var(--bb-cyan);
  border-color: rgba(102,204,255,.30);
  background: var(--bb-cyan-bg);
}

/* Label: col 2, row 1 */
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
  min-width: 0;
}

/* Body preview: col 2, row 2 */
.gam-macro-preview-v2 {
  grid-column: 2;
  grid-row: 2;
  color: var(--bb-ink-dim);
  font: var(--bb-t-xs)/1.3 var(--bb-font);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-width: 0;
}
.gam-macro-row-v2:hover .gam-macro-preview-v2,
.gam-macro-row-v2:focus-within .gam-macro-preview-v2 {
  -webkit-line-clamp: 2;
}

/* Use count: col 3, row 1 */
.gam-macro-usecount-v2 {
  grid-column: 3;
  grid-row: 1;
  color: var(--bb-ink-faint);
  font: var(--bb-t-xs)/1 var(--bb-font);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
  transition: opacity var(--gam-dur-micro);
}

/* Actions: col 4, rows 1-2 */
.gam-macro-actions-v2 {
  grid-column: 4;
  grid-row: 1 / 3;
  align-self: center;
  display: flex;
  gap: var(--bb-s1);
  justify-content: flex-end;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--gam-dur-micro) ease-out;
}
.gam-macro-row-v2:hover .gam-macro-actions-v2,
.gam-macro-row-v2:focus-within .gam-macro-actions-v2 {
  opacity: 1;
  pointer-events: auto;
}
.gam-macro-action-btn-v2 {
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 0;
  opacity: 0.7;
  padding: 0;
  transition: opacity var(--gam-dur-micro);
  flex-shrink: 0;
}
.gam-macro-action-btn-v2:hover { opacity: 1; }
.gam-macro-action-btn-v2:focus-visible {
  outline: 2px solid var(--bb-amber);
  outline-offset: 1px;
}
.gam-macro-act-edit  svg { stroke: var(--bb-amber); }
.gam-macro-act-dupe  svg { stroke: var(--bb-cyan); }
.gam-macro-act-del   svg { stroke: var(--bb-red); }

/* Delete confirmation state */
.gam-macro-row-v2.delconfirm {
  background: var(--bb-red-bg);
  border-left-color: var(--bb-red);
  grid-template-columns: 22px 1fr auto 72px; /* keep gutter open during confirm */
}
.gam-macro-delbar {
  position: absolute;
  bottom: 0; left: 0;
  height: 2px;
  background: var(--bb-red);
  animation: gam-mac-countdown 4s linear forwards;
}
@keyframes gam-mac-countdown { from { width: 100%; } to { width: 0%; } }
.gam-macro-delconfirm-btns {
  grid-column: 2 / 5;
  grid-row: 1;
  display: flex;
  gap: var(--bb-s2);
  align-items: center;
}
.gam-macro-confirm-del {
  background: var(--bb-red-bg);
  border: 1px solid var(--bb-red);
  border-radius: 0;
  color: var(--bb-red);
  cursor: pointer;
  font: 600 var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.06em;
  padding: var(--bb-s2) var(--bb-s3);
  text-transform: uppercase;
}
.gam-macro-confirm-cancel {
  background: transparent;
  border: 1px solid var(--bb-line-hot);
  border-radius: 0;
  color: var(--bb-ink-dim);
  cursor: pointer;
  font: var(--bb-t-xs)/1 var(--bb-font);
  padding: var(--bb-s2) var(--bb-s3);
  text-transform: uppercase;
}

/* --- AI suggestion rows --- */
.gam-macro-ai-row {
  display: flex;
  align-items: flex-start;
  gap: var(--bb-s3);
  padding: var(--bb-s2) 0;
  border-bottom: 1px solid var(--bb-line);
}
.gam-macro-ai-row:last-of-type { border-bottom: none; }
.gam-macro-ai-check {
  flex: 0 0 14px;
  height: 14px;
  border: 1px solid var(--bb-amber);
  background: transparent;
  appearance: none;
  cursor: pointer;
  position: relative;
  margin-top: 2px;
  border-radius: 0;
}
.gam-macro-ai-check:checked { background: var(--bb-amber-bg); }
.gam-macro-ai-check:checked::after {
  content: '';
  position: absolute;
  inset: 2px;
  background: var(--bb-amber);
}
.gam-macro-ai-check:focus-visible {
  outline: 2px solid var(--bb-amber);
  outline-offset: 1px;
}
.gam-macro-ai-text { flex: 1; min-width: 0; }
.gam-macro-ai-label {
  color: var(--bb-ink);
  font: 600 var(--bb-t-xs)/1.2 var(--bb-font);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.gam-macro-ai-body {
  color: var(--bb-ink-dim);
  font: var(--bb-t-xs)/1.4 var(--bb-font);
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

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
  white-space: nowrap;
}
.gam-macro-ai-btn:hover { background: var(--bb-purple-bg); }
.gam-macro-ai-btn:disabled { opacity: 0.4; cursor: default; }

/* --- Empty / no-match states --- */
.gam-macro-empty-v2 {
  padding: var(--bb-s7) var(--bb-s5);
  text-align: center;
  color: var(--bb-ink-faint);
  font: var(--bb-t-xs)/1.6 var(--bb-font);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.gam-macro-empty-action-v2 {
  display: block;
  margin-top: var(--bb-s3);
  background: transparent;
  border: none;
  color: var(--bb-amber);
  cursor: pointer;
  font: var(--bb-t-xs)/1 var(--bb-font);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-decoration: underline;
  text-underline-offset: 3px;
}
```

---

## H. HTML Structure v2

Drop-in replacement for the interior of `<div id="macrosSection" class="pop-token">`.
The outer wrapper stays. The `<label>` and `<div class="pop-token-hint">` above the tabs
are removed -- redundant with the card header.

```html
<!-- v10.13: Macros card interior -- UIUX2-04 -->

<!-- Tab row -->
<div class="gam-macro-tabs" role="tablist">
  <button class="gam-macro-tab active" role="tab"
          aria-selected="true" data-kind="ban_msg" type="button">
    BAN MESSAGES
  </button>
  <button class="gam-macro-tab" role="tab"
          aria-selected="false" data-kind="mm_reply" type="button">
    MODMAIL REPLIES
  </button>
</div>

<!-- Inline edit form (collapsed at rest) -->
<div class="gam-macro-edit-form" id="macroEditForm"
     aria-hidden="true" aria-live="polite">
  <div class="gam-macro-form-heading">
    <span class="gam-macro-form-title" id="macroEditHeading">NEW BAN MESSAGE</span>
    <button class="gam-macro-form-close" id="macroCancelBtn" type="button"
            aria-label="Close edit form">X</button>
  </div>
  <!-- Kind toggle -->
  <div class="gam-macro-kind-row">
    <span class="gam-macro-kind-label">KIND</span>
    <button class="gam-macro-kind-btn active" data-kind="ban_msg" type="button">BAN MESSAGE</button>
    <button class="gam-macro-kind-btn" data-kind="mm_reply" type="button">MODMAIL REPLY</button>
  </div>
  <!-- Label field -->
  <div class="gam-macro-field-row">
    <label class="gam-macro-field-label" for="macroEditLabel">LABEL</label>
    <div class="gam-macro-field-wrap">
      <input class="gam-macro-field-input" id="macroEditLabel" type="text"
             maxlength="80" autocomplete="off"
             aria-describedby="macroLabelCounter">
      <span class="gam-macro-char-counter" id="macroLabelCounter"
            aria-live="polite">0/80</span>
    </div>
  </div>
  <!-- Body field -->
  <div class="gam-macro-field-row">
    <label class="gam-macro-field-label" for="macroEditBody">BODY</label>
    <div class="gam-macro-field-wrap">
      <textarea class="gam-macro-field-textarea" id="macroEditBody"
                rows="4" maxlength="4000"
                aria-describedby="macroBodyCounter"></textarea>
      <span class="gam-macro-char-counter" id="macroBodyCounter"
            aria-live="polite">4000 remaining</span>
    </div>
  </div>
  <div id="macroEditError" class="gam-macro-form-error" role="alert"></div>
  <div class="gam-macro-form-actions">
    <button class="gam-macro-btn-ghost" id="macroGhostCancelBtn" type="button">CANCEL</button>
    <button class="gam-macro-btn-primary amber" id="macroSaveBtn" type="button">SAVE MACRO</button>
  </div>
  <input type="hidden" id="macroEditId">
</div>

<!-- AI suggestion review panel (collapsed at rest) -->
<div class="gam-macro-ai-review" id="macroAiReview"
     aria-hidden="true" aria-live="polite">
  <div class="gam-macro-form-heading">
    <span class="gam-macro-form-title">AI SUGGESTIONS (<span id="macroAiCount">0</span>)</span>
    <button class="gam-macro-form-close" id="macroAiDiscardBtn" type="button"
            aria-label="Discard AI suggestions">X</button>
  </div>
  <div id="macroAiSuggList" role="list">
    <!-- Rows injected by JS: .gam-macro-ai-row per suggestion -->
  </div>
  <div class="gam-macro-form-actions" style="margin-top:var(--bb-s3)">
    <button class="gam-macro-btn-ghost" id="macroAiDiscardBtnFooter" type="button">DISCARD ALL</button>
    <button class="gam-macro-btn-primary purple" id="macroAiSaveBtn" type="button">
      SAVE SELECTED (<span id="macroAiSelectedCount">0</span>)
    </button>
  </div>
</div>

<!-- Filter/sort bar -->
<div class="gam-macro-filter-bar">
  <input class="gam-macro-search" id="macroSearch"
         type="search" autocomplete="off" spellcheck="false"
         placeholder="FILTER MACROS..."
         aria-label="Filter macros by name or body text">
  <div class="gam-macro-sort-group" role="group" aria-label="Sort macros by">
    <button class="gam-macro-sort-btn active" data-sort="name" type="button">NAME^</button>
    <button class="gam-macro-sort-btn" data-sort="use"  type="button">USE</button>
    <button class="gam-macro-sort-btn" data-sort="date" type="button">DATE</button>
  </div>
</div>

<!-- Macro list -->
<div class="gam-macro-list-v2" id="macrosList" role="list"
     aria-live="polite" aria-busy="false">
  <!-- Skeleton injected by loadMacros() -- gamMakeSkel('paragraph') -->
  <!-- Rows injected by JS -->
  <!-- Empty / no-match states (shown/hidden by JS) -->
  <div class="gam-macro-empty-v2" id="macrosEmpty" style="display:none">
    NO MACROS YET
    <button class="gam-macro-empty-action-v2" id="macrosEmptyAdd" type="button">
      + ADD FIRST MACRO
    </button>
  </div>
  <div class="gam-macro-empty-v2" id="macrosNoMatch" style="display:none">
    NO MATCH
    <button class="gam-macro-empty-action-v2" id="macrosClearFilter" type="button">
      CLEAR FILTER
    </button>
  </div>
</div>

<!-- Footer: new macro + AI generate -->
<div class="gam-macro-footer">
  <button class="gam-macro-new-btn" id="macroAddBtn" type="button">+ NEW MACRO</button>
  <button class="gam-macro-ai-btn" id="macroAiSeedBtn" type="button"
          title="Generate starter macros with AI (uses daily AI budget)">
    AI GENERATE
  </button>
</div>

<!-- Status (unchanged ID -- wired to __macroSetStatus) -->
<div id="macrosStatus" class="pop-token-status" aria-live="polite"></div>
```

### Per-Macro Row Template (JS-generated, no inline styles)

```html
<div class="gam-macro-row-v2" role="listitem" tabindex="0"
     data-id="{{m.id}}" data-kind="{{m.kind}}"
     aria-label="{{m.label}}">

  <span class="gam-macro-kind-badge" data-kind="{{m.kind}}">
    {{m.kind === 'ban_msg' ? 'BM' : 'MM'}}
  </span>

  <span class="gam-macro-label-v2">{{m.label}}</span>

  <span class="gam-macro-preview-v2">{{m.body}}</span>

  <span class="gam-macro-usecount-v2"
        {{m.use_count === 0 ? 'style="opacity:0.3"' : ''}}>
    {{m.use_count > 0 ? m.use_count + (m.use_count === 1 ? ' use' : ' uses') : '0'}}
  </span>

  <div class="gam-macro-actions-v2" aria-label="Row actions">
    <button class="gam-macro-action-btn-v2 gam-macro-act-edit"
            type="button" title="Edit" tabindex="-1" aria-label="Edit macro">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
           stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 2l3 3-8 8H3v-3l8-8z"/>
      </svg>
    </button>
    <button class="gam-macro-action-btn-v2 gam-macro-act-dupe"
            type="button" title="Duplicate" tabindex="-1" aria-label="Duplicate macro">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
           stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="5" width="8" height="9"/>
        <path d="M3 11V3h8"/>
      </svg>
    </button>
    <button class="gam-macro-action-btn-v2 gam-macro-act-del"
            type="button" title="Delete" tabindex="-1" aria-label="Delete macro">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
           stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/>
      </svg>
    </button>
  </div>
</div>
```

### Delete Confirmation Overlay (JS swaps col 2-4 content)

```html
<!-- Injected inside .gam-macro-row-v2 when delconfirm state entered -->
<!-- The .gam-macro-actions-v2 is hidden; .gam-macro-delconfirm-btns takes col 2-4 -->
<div class="gam-macro-delbar" aria-hidden="true"></div>
<div class="gam-macro-delconfirm-btns">
  <button class="gam-macro-confirm-del" type="button">CONFIRM DELETE</button>
  <button class="gam-macro-confirm-cancel" type="button">CANCEL</button>
</div>
```

### AI Suggestion Row (JS-generated inside #macroAiSuggList)

```html
<div class="gam-macro-ai-row" role="listitem">
  <input class="gam-macro-ai-check" type="checkbox" checked
         id="aisugg-{{i}}" aria-label="Include {{s.label}}">
  <div class="gam-macro-ai-text">
    <div class="gam-macro-ai-label">
      <label for="aisugg-{{i}}">{{s.label}}</label>
    </div>
    <div class="gam-macro-ai-body">{{s.body}}</div>
  </div>
</div>
```

---

## I. JS Delta Summary

This section describes changes to popup.js required to implement the above.
Not a full rewrite -- surgical replacements to existing functions.

### I1. Remove / Replace

| Existing | Replacement | Notes |
|---|---|---|
| `window.confirm()` in `__macroDelete()` (L3836) | Inline delconfirm state machine | Row-level, countdown bar, auto-cancel |
| `window.confirm()` in `__macroAiSeed()` (L3879) | `__macroOpenAiReview()` function | Opens `#macroAiReview` panel |
| `loadMacros()` row builder (L3754-3791) with inline styles | Rebuilt with `.gam-macro-row-v2` grid classes | No inline styles; all classes |
| `__macroStartEdit()` -- shows `#macroEditWrap` (L3797-3804) | Opens `#macroEditForm` with `max-height` animation | Updates heading + kind toggle |
| `__macroCancelEdit()` -- hides `#macroEditWrap` (L3806-3809) | Closes `#macroEditForm` with reverse animation | |
| Tab buttons wired via `.gam-macro-tab` + `gam-macro-tab-active` class toggle | Updated to use `.active` class (not `gam-macro-tab-active`) | Removes the legacy conflicting class |

### I2. Add

| New function | Purpose |
|---|---|
| `__macroOpenDelConfirm(row, m)` | Enters delconfirm state on the row; manages countdown timer |
| `__macroCancelDelConfirm(row)` | Restores row to normal state; clears countdown timer |
| `__macroOpenAiReview(suggestions)` | Populates and opens `#macroAiReview` panel |
| `__macroCloseAiReview()` | Collapses `#macroAiReview` |
| `__macroAiSaveSelected()` | Reads checked checkboxes, calls macroUpsert for each |
| `__macroUpdateAiCount()` | Updates `#macroAiSelectedCount` on checkbox change |
| `__macroFilter()` | Applies search + sort to `__macroData`, re-renders list |
| `__macroSetSort(field)` | Cycles sort direction, calls `__macroFilter()` |

### I3. Module-level state additions

```js
let __macroData = [];          // full unfiltered array from last RPC load
let __macroSortField = 'name'; // 'name' | 'use' | 'date'
let __macroSortAsc  = true;
let __macroFilter   = '';      // live filter string (lowercase)
let __macroAiSuggs  = [];      // suggestions from last AI call
let __macroDelTimer = null;    // countdown timer ref for active delete confirm
```

### I4. `loadMacros()` new contract

1. Calls `gamMakeSkel('paragraph')` on `#macrosList` while loading.
2. On success: stores result in `__macroData`, calls `__macroRender()`.
3. `__macroRender()` applies `__macroFilter` + `__macroSortField` / `__macroSortAsc` to produce `displayMacros`.
4. Renders `displayMacros` as `.gam-macro-row-v2` elements. Zero inline styles.
5. Updates badge `#card-badge-macros`.
6. Shows `#macrosEmpty` if `__macroData.length === 0`, `#macrosNoMatch` if `displayMacros.length === 0 && __macroData.length > 0`.

---

## J. Effort Estimate v2

Scope: popup.html + popup.css + popup.js macro CRUD section (~L3717-3919). No other files.

| Task | Est. hours |
|---|---|
| CSS: add redesign classes (section G), remove legacy conflict blocks (L231-234, L1089-1141) | 1.0h |
| HTML: swap `#macrosSection` interior (section H) | 0.5h |
| JS: `loadMacros()` + `__macroRender()` rewrite with filter/sort | 1.5h |
| JS: edit form slide animation + kind toggle + char counters + Escape key | 1.0h |
| JS: inline delete confirm state machine (no window.confirm) | 1.0h |
| JS: AI review panel (no window.confirm) + checkbox count | 1.0h |
| JS: module-level state additions + tab class rename | 0.25h |
| QA: 380px popup, filter edge cases, delete timer cleanup, form Escape | 0.5h |
| **Total** | **6.75h** |

### Risk flags (v2-specific)

- **Legacy CSS conflict (N3)**: `.gam-macro-tab-active` at L231-234 uses `!important` with `#4A9EFF` (blue). The implementation pass MUST remove this block before deploying the new `.active` pattern -- otherwise tab styling will be a CSS specificity battle. This is a one-line removal but must not be forgotten.
- **`grid-template-columns` hover transition**: Chrome animates this in some versions but not others. Confirmed to work in Chrome 120+ on grid layouts with explicit column count (same number of columns). If it doesn't animate, the action gutter still appears correctly -- it just snaps instead of slides. Acceptable.
- **Delete countdown timer on list refresh**: if `loadMacros()` is called while a delete countdown is active (e.g., the user clicks AI generate during a confirm), `__macroDelTimer` must be cleared. Guard: always clear `__macroDelTimer` at the top of `__macroRender()`.
- **AI panel and edit form mutual exclusion**: both panels use the same DOM zone. Open logic must close the other before opening. Order: close AI review -> open edit form. Close edit form -> open AI review. Do not animate both simultaneously (layout shift).
