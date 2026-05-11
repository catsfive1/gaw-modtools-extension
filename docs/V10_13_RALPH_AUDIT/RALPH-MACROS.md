# RALPH-MACROS -- v10.13.4 W4 Macros Card Audit

**Auditor:** RALPH-MACROS (read-only, no code or git ops)
**Date:** 2026-05-10
**Repo:** `D:\AI\_PROJECTS\modtools-ext\` HEAD `9c7655e`
**Specs:** `docs/V10_DESIGN_V2/UIUX2-04_macros_card.md`, `docs/V10_DESIGN_V2/DESIGN_V2_SHIPMASTER.md` Section 5 W4 + Section 7 R-07/R-08/R-09
**Files inspected:** `popup.html` L405-446, `popup.css` L206-208 / L1370-1610, `popup.js` L4040-4515, `modtools.js` (ruled out -- no macro DOM there).

---

## Summary

W4 shipped a credible v2 of the Macros card -- but it's NOT the spec. The implementation is a pragmatic ~80% retrofit onto the existing v10.12 HTML scaffold, NOT the drop-in replacement that UIUX2-04 §H specifies. The four named acceptance criteria are met functionally:

| W4 Acceptance Criterion | Status |
|---|---|
| `window.confirm()` x2 replaced with inline UI | PASS (both delete + AI seed) |
| Duplicate `.gam-macro-tab-active` block at popup.css:231-234 removed | PASS (replaced with comment marker, single source of truth at L1387) |
| Filter bar (search + sort name/use/date) above list | PASS (live-mounted by `__macroEnsureFilterBar()`) |
| Inline edit form ABOVE list via hoist | PASS (`__macroEnsureEditAbove()` at L4061 hoists `#macroEditWrap`) |
| Hover-revealed action trio (edit/dup/delete) | PASS (text buttons, not SVG icons) |
| `.gam-macro-row` -> `.gam-macro-item-*` migration | PASS (R-07 closed -- JS now uses `.gam-macro-item`/`-label`/`-body`/`-meta`/`-actions`/`-action`) |

But six secondary spec requirements are silently dropped or regress on UX, and three of them are direct violations of CLAUDE.md UX principles. **Net assessment:** ship-as-is is acceptable for v10.13.4 (the criticals are cleared) but the leftover gap below is ~3.5h of v10.14 follow-up, NOT "v2 complete."

---

## Verification

### V1. `window.confirm()` x2 removed -- PASS

- **Delete path** (`__macroBeginDelconfirm` popup.js L4280-4335): inline state machine. Row gets `.delconfirm` class, original innerHTML stashed in `dataset.gamOrig`, banner with `Confirm` / `Cancel` buttons + `.gam-macro-delconfirm-bar` countdown injected. 4s `setTimeout` auto-cancels. No `window.confirm`.
- **AI seed path** (`__macroAiSeed` -> `__macroShowAiReview` popup.js L4373-4494): builds `#macroAiReview` panel inline, mounted between filter bar and list. Checkbox per suggestion, default checked. `Save selected (N)` button updates count via `_refreshCount` listener. No `window.confirm`.
- Repo-wide grep for `window.confirm` against macro paths: zero matches in `popup.js` macro section. Spec requirement R-09 closed.

### V2. Duplicate `.gam-macro-tab-active` block removed -- PASS

- popup.css L206-208 contains a marker comment confirming the legacy block was removed: *"v10.13.4 W4 (P0-29 / R-08): duplicate .gam-macro-tab-active block removed. The Bloomberg-amber active state at L1403 is now the single source of truth (was being overridden by an old blue !important block here)."*
- Repo-wide grep for `.gam-macro-tab-active` selectors in `*.css`: only one definition remains, at `popup.css:1387` -- and it is correctly union-selected with the modern `.gam-macro-tab.active`.
- The blue `#4A9EFF` value is gone from the file.

### V3. Filter bar mounted above list -- PASS (functional, sub-spec)

- `__macroEnsureFilterBar()` popup.js L4073-4110 builds `#macroFilterBar.gam-macro-filter` lazily on first `loadMacros()` call.
- Search `<input type="search">` with placeholder `Filter macros...`, live `input` listener calls `__macroRender()`. NOT debounced. Filters against `m.label` and `m.body` lower-case substring. **MATCHES SPEC.**
- Sort is a `<select>` with options Name / Most used / Recent. **DEVIATES FROM SPEC** -- see Findings F2.

### V4. Inline edit form ABOVE list -- PASS (with caveat)

- `__macroEnsureEditAbove()` popup.js L4061-4070 hoists `#macroEditWrap` from below the list to immediately before it on first call.
- Idempotent via `dataset.gamHoisted === '1'` guard.
- The hoist is a clever workaround because the surrounding `popup.html` was NOT touched. **CAVEAT:** the form is shown via `style.display = ''` -- there is no `max-height` slide animation as §E1 specifies. It snaps in and out. Spec violation -- see Findings F1.

### V5. Hover-revealed action trio -- PASS (caveat: text not icons)

- `.gam-macro-item-actions` popup.css L1431-1440 sets `opacity:0` at rest, `opacity:1` on `:hover` or `:focus-within`.
- `.gam-macro-item-action` (popup.css L1441-1459) renders `Edit` / `Duplicate` / `Delete` as text buttons with bordered chip styling and amber/red hover colors.
- PRM gate at L1460-1462 forces `opacity:1` and disables the transition under `prefers-reduced-motion: reduce`. **PRM HANDLED CORRECTLY.**
- **DEVIATES FROM SPEC** -- §C2 calls for 20x20 SVG pencil/copy/trash icons with `--bb-amber` / `--bb-cyan` / `--bb-red` strokes. W4 ships text labels. Functionally equivalent for screen readers but loses the dense visual language. See Findings F3.

### V6. `.gam-macro-row` -> `.gam-macro-item-*` migration -- PASS

- `popup.js` L4154 onward: row class is `.gam-macro-item`. Children use `.gam-macro-item-label`, `.gam-macro-item-body`, `.gam-macro-item-meta`, `.gam-macro-item-actions`, `.gam-macro-item-action`.
- Repo-wide grep for `gam-macro-row` (any file extension): zero matches in `popup.js`, zero in `popup.css`, zero in `popup.html`, zero in `modtools.js`. Only matches are in the spec docs themselves.
- The orphan CSS classes flagged in UIUX2-04 §A2-D are now WIRED. R-07 closed.

### V7. 4s countdown bar -- PASS, PRM correctly gated

- `.gam-macro-delconfirm-bar > span` popup.css L1512-1521 animates `transform: scaleX(1) -> scaleX(0)` over `4s linear forwards`. Same 4s as spec §B2.4.
- PRM block popup.css L1526-1528: `animation: none; transform: scaleX(0.5)` -- bar **DOES NOT progress** under PRM. **Hunt-list item BAD.** See Findings F4.

### V8. AI review panel selection count -- PARTIAL

- Live count via `_refreshCount()` popup.js L4458-4462: reads `checkboxes.filter(c => c.checked).length`, sets `saveBtn.textContent = 'Save selected (' + n + ')'`, sets `saveBtn.disabled = (n === 0)`. **Empty selection IS disabled. Hunt-list item PASS.**
- Default state: all checkboxes start `checked`. Cancel removes the panel without RPC.
- Save flow iterates picks sequentially (`for...of`), one `macroUpsert` RPC per pick. `saveBtn.textContent = 'saving...'`. Counts saved/failed and shows aggregate via `__macroSetStatus`.
- **DEVIATES FROM SPEC** -- the AI panel uses amber styling (`--bb-amber`, `--bb-amber-dim`), NOT the purple `--bb-purple` accent UIUX2-04 §B2.5 explicitly required to differentiate AI-content from human-authored. See Findings F5.

---

## Findings

### F1. Edit form does NOT slide -- snaps via `display:''` (UX regression vs spec)

**Severity:** MEDIUM
**Location:** popup.js L4245 (`document.getElementById('macroEditWrap').style.display = ''`), L4251 (`= 'none'`), and `popup.html` L431 (`style="display:none;..."`)

The form has no `max-height` transition. UIUX2-04 §E1 calls for `max-height:0 -> 260px` with `transition: max-height var(--gam-dur-decision) ease-out`. Current implementation toggles display, which produces an instant layout pop. The `__macroEnsureEditAbove()` hoist puts it in the right *position*, but does not give it the right *motion shape*. Mods see the list snap downward when the form opens, which is the precise UX gripe the v2 spec was meant to fix.

### F2. Sort is `<select>` dropdown, NOT three text-buttons (a11y + spec deviation)

**Severity:** MEDIUM
**Location:** popup.js L4090-4106 (the `<select>` build), spec §D1 (three text-buttons NAME/USE/DATE)

Spec called for three text-buttons with amber bottom-border on active state, click-active-to-flip-direction (asc/desc with `^`/`v` indicator). W4 ships a native `<select>` with three `<option>` rows. Consequences:

- **No direction toggle** -- sort is one-way only (`name` ascending; `use`/`date` descending hardcoded in `__macroRender` L4126-4131). Spec said active button reverses direction on re-click.
- **Tab order is one stop, not three** -- the `<select>` is one tabbable element; spec's three-button pattern is three tab stops with explicit ARIA. Net a11y is a wash but the shape differs.
- **Bloomberg visual language broken** -- the rest of the UI uses border-bottom buttons for tab/sort affordances (see `.pop-tab`, `.gam-macro-tab.active`). The `<select>` is a native control with OS chrome and looks foreign.
- **No persistence** -- `__macroSort` is module-level state; popup close/reopen resets to `'name'`. Spec did not require persistence but Hunt-list flagged this question. Confirmed: NOT persisted.

### F3. Action trio is TEXT not SVG, and `tabindex` is the default (keyboard a11y partial)

**Severity:** MEDIUM (a11y) / LOW (visual)
**Location:** popup.js L4170-4188

- Buttons render `Edit` / `Duplicate` / `Delete` text labels. Spec §C2 calls for 20x20 SVG pencil/copy/trash with `--bb-amber` / `--bb-cyan` / `--bb-red` strokes.
- **Keyboard a11y question (Hunt-list item):** the row itself does NOT have `tabindex="0"` -- it's a plain `<div>`. Buttons inside are normal `<button>` elements with no `tabindex` override, so they ARE in tab order by default. They become *visible* when focused via `:focus-within` on `.gam-macro-item` (popup.css L1438), so keyboard users CAN reach and see them. **A11y baseline is satisfied.**
- BUT: the spec §C2 actually called for `tabindex="-1"` at rest and `tabindex="0"` only when row receives focus -- a more nuanced pattern. W4 doesn't implement that nuance, but its simpler approach is functionally fine and arguably better (no extra tabindex juggling).
- **Verdict:** keyboard accessible YES, spec-compliant NO. Not a blocker for ship.

### F4. PRM disables countdown bar progress -- bug, not feature

**Severity:** HIGH (UX correctness under PRM)
**Location:** popup.css L1526-1528

```css
@media (prefers-reduced-motion: reduce) {
  .gam-macro-delconfirm-bar > span { animation: none; transform: scaleX(0.5); }
}
```

Under PRM, the visual bar is FROZEN at 50% width for the full 4s. The `setTimeout` in JS (popup.js L4315) still fires at 4s, so functional auto-cancel still works. But the user sees a static bar that gives ZERO countdown signal. Spec hunt-list specifically flagged this: *"under PRM-reduce, does it still progress (it should) or freeze (bad)?"* -- **W4 ships the bad behavior.**

The PRM-respectful pattern is a *non-animated* progress indicator that updates discretely (e.g., text countdown `Auto-cancel in 4...3...2...1`) rather than freezing the visual bar. Users with vestibular sensitivity still need to know the timer is running. **Recommendation R3 below.**

### F5. AI review panel is AMBER, not PURPLE (visual semantics broken)

**Severity:** MEDIUM
**Location:** popup.css L1545-1610

UIUX2-04 §B2.5 explicitly required `--bb-purple` left-border + heading accent on the AI review panel to communicate *"this is AI-generated content, not human-authored."* W4 ships:

- Border: `var(--bb-amber-dim, var(--bb-line))` -- amber.
- Head: `color: var(--bb-amber)` -- amber.
- Save button: `border: 1px solid var(--bb-amber); color: var(--bb-amber)` -- amber.
- Each AI row's `.label` is `color: var(--bb-amber)` -- amber.

Spec deviation. Loses the human/AI visual distinction. The text `'✨ AI proposed N <kind> macros'` carries the AI signal in copy but the chrome reads as standard amber, same as the edit form.

### F6. HTML scaffold is v10.12 -- `popup.html` macros section was NOT touched (R-07 partial)

**Severity:** LOW (works, but spec compliance is not "v2 complete")
**Location:** `popup.html` L413-444

Spec §H called for a drop-in HTML replacement: `gam-macro-tabs[role="tablist"]`, `gam-macro-edit-form`, `gam-macro-ai-review`, `gam-macro-filter-bar`, `gam-macro-list-v2`, `gam-macro-footer`, `gam-macro-empty-v2` / `gam-macro-no-match` empty states.

What v10.13.4 actually ships in `popup.html`:

- Original `pop-tools` div with two `pop-btn pop-btn-ghost gam-macro-tab` buttons (still has `style="flex:1"` inline, still has emoji `🔨`/`📬` in labels).
- `<label>📝 Team Macros — shared canned messages</label>` and `<div class="pop-token-hint">...</div>` -- the duplicate-label issue UIUX2-04 §A1 #9 flagged is **STILL PRESENT.**
- Card title `<span class="gam-card-title">📝 Team Macros</span>` at L406 -- emoji STILL PRESENT (UIUX2-04 §A1 #7).
- AI Generate button still has `✨ Generate with AI` (UIUX2-04 §A1 #8). 
- `#macroEditWrap` still has heavy inline `style="..."` blocks for label/body inputs (spec §G called for zero inline styles).
- Old `#macrosList` skeleton uses `.gam-skel-line` with inline `style="width:80%;margin:0 auto"` etc.
- No `#macrosEmpty`, no `#macrosNoMatch` containers -- empty-state copy is built ad hoc in `__macroRender()` L4137-4140 with raw `innerHTML` interpolation (does sanitize via `replace(/[<>&"]/g, '')`, but the no-match path is not the spec's `.gam-macro-empty-v2` shape).
- No `KIND` toggle inside the edit form. `D-34` was claimed *included in W4* in SHIPMASTER §6 but is NOT in the actual code. Either D-34 needs to move to v10.14 in SHIPMASTER, or it needs a follow-up commit. **Discrepancy with SHIPMASTER.**
- `LABEL` and `BODY` char counters are NOT present (spec §E2: `0/80` on label, `4000 remaining` on body, with `.warn`/`.err` color states).

The spec's `.gam-macro-row-v2` / `.gam-macro-list-v2` / etc. classes are NOT used. CSS retrofits the old `.gam-macro-item-*` classes with v2-shaped behavior, which is fine for ship -- the spec deviation is documentational, not functional. But anyone reading the spec and the CSS together will be confused: the spec calls for `.gam-macro-row-v2` but the file ships `.gam-macro-item`. Either update the spec to reflect the chosen names, or rename the classes. **Recommendation R6.**

### F7. AI panel does NOT close the edit form (mutex violation)

**Severity:** LOW
**Location:** popup.js L4407-4413 (`__macroShowAiReview`)

UIUX2-04 §F2 + §J risk-flag: *"AI panel and edit form mutual exclusion: both panels use the same DOM zone. Open logic must close the other before opening."* W4's `__macroShowAiReview` removes any prior `#macroAiReview` panel via `old.remove()` (L4409-4410), but does NOT close `#macroEditWrap`. If a mod opens the edit form, then clicks AI Generate, both panels are open simultaneously. They don't visually overlap (form is between filter bar and list; AI panel is also between filter bar and list -- DOM order: form first, then AI panel) but it's spec-non-compliant and creates layout shift. Conversely, `__macroStartEdit` (L4240-4247) does NOT remove `#macroAiReview`. Both directions of the mutex are missing.

### F8. AI panel `Cancel` button label not `DISCARD ALL` (spec deviation, copy)

**Severity:** LOW (cosmetic)
**Location:** popup.js L4453

Spec §F2 calls for `[DISCARD ALL]` text on the discard button. W4 ships `Cancel`. Trivial; flagging for completeness.

### F9. `__macroEndDelconfirm` re-renders the entire list -- delete-cancel UX reflow

**Severity:** LOW
**Location:** popup.js L4337-4347

When the user cancels a delete confirm (or the 4s timer fires), `__macroEndDelconfirm` calls `__macroRender()` -- the *whole list* re-renders. This is the easy fix the comment describes (*"innerHTML restore drops listeners. Easiest: re-render the whole list from cache."*). But it means cancel produces a full repaint and any open hover state on adjacent rows is lost. Cleaner pattern: re-build the row's children using the same `__macroRow(m)` factory and `replaceChildren()`. Not a blocker.

### F10. Filter "no match" path renders unsanitized user query into innerHTML

**Severity:** LOW (the `replace(/[<>&"]/g, '')` mitigates XSS, but it's a fragile pattern)
**Location:** popup.js L4137

```js
list.innerHTML = '<div ...>No macros match "' + (__macroFilter.replace(/[<>&"]/g, '')) + '"</div>';
```

The strip-list misses `'` (apostrophe) and any other meta-chars. A user typing `O'Brien` into the filter renders `No macros match "O'Brien"` -- harmless but inelegant. A user typing `</div><script>x</script>` strips the `<>&"` chars to `/divscriptx/script` which is safe but ugly. The clean pattern is `textContent` on a built-up DOM tree, matching how `gamMakeEmpty()` works elsewhere. Minor.

---

## What v1+v2 spec compliance is left for v10.14

| Item | Spec ref | Effort | Severity to defer |
|---|---|---|---|
| 1. Edit form `max-height` slide animation | UIUX2-04 §E1 | 0.5h | MEDIUM |
| 2. Sort: `<select>` -> three text-buttons with direction toggle | UIUX2-04 §D1 | 1h | MEDIUM |
| 3. PRM countdown: text-based progress instead of frozen bar | F4 above | 0.5h | HIGH (a11y) |
| 4. AI panel: amber -> purple chrome | UIUX2-04 §B2.5 | 0.25h | MEDIUM |
| 5. KIND toggle inside edit form (D-34 still owed) | UIUX2-04 §B2.8 | 1h | MEDIUM |
| 6. LABEL/BODY char counters with warn/err color states | UIUX2-04 §E2 | 0.5h | LOW |
| 7. Action trio: text labels -> SVG icons | UIUX2-04 §C2 | 0.75h | LOW (visual) |
| 8. AI review/edit form mutex (close one before opening other) | UIUX2-04 §J risk | 0.25h | LOW |
| 9. Empty/no-match state classes (`.gam-macro-empty-v2`) | UIUX2-04 §H | 0.25h | LOW |
| 10. `popup.html` scaffold rewrite (drop emoji, drop duplicate label, drop inline styles) | UIUX2-04 §H | 1.5h | MEDIUM |
| 11. AI panel `Cancel` -> `DISCARD ALL` copy | UIUX2-04 §F2 | 5min | LOW |
| 12. `__macroEndDelconfirm` surgical row rebuild instead of full re-render | F9 | 0.25h | LOW |
| 13. No-match path `innerHTML` -> `textContent` builder | F10 | 10min | LOW |
| **Total v10.14 follow-up** | | **~7h** | |

The 7h estimate is suspicious because UIUX2-04 §J originally budgeted 6.75h *total* for the v2 design, and W4 already shipped much of that. Realistic re-estimate: the bulk of the remaining work is the HTML scaffold rewrite (item 10) which unlocks items 4, 5, 6, 9, 11 simultaneously. Doing them all together in one HTML+CSS+JS pass: **~3.5h**.

---

## Recommendations

### R1. Promote PRM countdown to a v10.14 follow-up ticket NOW (HIGH)

The current PRM behavior -- bar frozen at 50% for 4s while the timer runs invisibly -- is an a11y bug, not a polish item. Users with vestibular sensitivity still need a countdown signal. Cheapest fix: under PRM, swap the bar for a text counter that ticks `Auto-cancel in 4s -> 3s -> 2s -> 1s` via `setInterval`. Estimate 0.5h.

### R2. Either implement D-34 (KIND toggle in edit form) or move it out of "W4 included" in SHIPMASTER (MEDIUM)

`docs/V10_DESIGN_V2/DESIGN_V2_SHIPMASTER.md` Section 6 D-34 says *"included in W4"* but the W4 code does NOT have a KIND toggle inside `#macroEditWrap`. The mod still has to close the form, switch tabs, and re-open. Either ship the toggle (1h) or fix the SHIPMASTER claim. Trust calibration matters -- a deferred-backlog table that lies about scope is worse than a longer one that's accurate.

### R3. Re-skin AI review panel purple in v10.14 (MEDIUM)

One CSS pass: `gam-macro-ai-review-head` color, border colors, save button border/color all become `var(--bb-purple)` and `var(--bb-purple-bg)`. The `--bb-purple` token already exists in the design system (UIUX2-04 §B2.5 confirms). 0.25h.

### R4. Sort buttons + persistence in v10.14 (MEDIUM)

Replace the `<select>` with three text-buttons matching `.gam-macro-tab` styling. Add asc/desc direction toggle. Persist `__macroSort` and `__macroSortAsc` to `chrome.storage.local` under key `gam_macro_sort_pref` and rehydrate on `loadMacros()` first call. 1.25h.

### R5. Edit form slide animation (MEDIUM)

Add `.open` class with `max-height:260px` on `#macroEditWrap`, default `max-height:0; overflow:hidden`. Toggle `.open` instead of `style.display`. Wrap in `@media (prefers-reduced-motion: no-preference)`. 0.5h.

### R6. Reconcile spec class names with shipped class names (LOW)

UIUX2-04 §G uses `.gam-macro-row-v2`, `.gam-macro-list-v2`, `.gam-macro-actions-v2`. W4 shipped `.gam-macro-item`, `.gam-macro-list`, `.gam-macro-item-actions` (the orphan classes the spec called out as broken in §A2-D). Two paths:

- (a) Update UIUX2-04 §G in-place to reflect the shipped names. Cheaper, preserves history.
- (b) Rename the CSS classes in v10.14 to match `-v2` shape. More disruption, no functional gain.

Recommend (a). The spec is a design doc, not an immutable contract; update it to match shipped reality.

### R7. Add a one-shot v10.14 macros consolidation ticket (MEDIUM)

Bundle items 1-13 above (excluding item 7 SVG icons and item 5 KIND toggle which are individual decisions) into a single `MACROS-v2-FINISH` v10.14 ship targeting ~3.5h. The HTML scaffold rewrite is the unlock; everything else cascades from it. Doing them piecemeal will cost more in cumulative file-load and context overhead.

---

## Closing assessment

**W4 cleared the criticals.** R-07, R-08, R-09 are closed. The card is no longer a `window.confirm()` UX failure, the duplicate `.gam-macro-tab-active` block is gone, and the orphan `.gam-macro-item-*` CSS classes are now wired. Mods can use the card without OS-blocking dialogs. Filter and sort work. Hover trio works. Auto-cancel countdown works (in non-PRM contexts).

**The card is NOT v2-complete.** Visual identity (purple AI panel), motion (form slide), interaction completeness (KIND toggle, char counters, sort direction, sort persistence), and PRM correctness all have meaningful gaps. The spec compliance percentage is roughly 65% -- enough to ship v10.13.4, not enough to call UIUX2-04 closed.

**Single biggest risk:** the PRM frozen-bar bug (F4). Promote that to a v10.14 P1.

**No code modified, no git ops performed during this audit.**
