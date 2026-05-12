# QA-A3 — Mod Console v10.15.1 + v10.15.2 Verification

**Repo:** `D:\AI\_PROJECTS\modtools-ext\`
**HEAD:** `8b1a239` (`feat(v10.15.4): modmail AI rate-limit + token migration partial (4 brand sites)`)
**Scope commits:**
- `3d79e22` — `feat(v10.15.1): backlog sweep — j/k nav + 2 focus traps + install accordion`
- `ae40b43` — `feat(v10.15.2): QUICK category grouping + ESC draft protection + aria-live`
**Mode:** Read-only verification. No code changed.
**Parse-check:** `node --check modtools.js` → PARSE OK at HEAD.

---

## Summary

Three features ship in this pair. **Two work as advertised** (j/k navigation, QUICK category grouping). **One is dead code** as currently wired (ESC 3-step draft protection — the `showModal`-installed ESC handler always closes the modal first and de-registers `_mcKbHandler` before the draft-protection logic can fire).

| Feature | Verdict | Severity |
|---|---|---|
| F1. j/k navigation in QUICK tab | **PASS** | — |
| F2. QUICK tab category grouping (4 groups, 11 buttons) | **PASS** | — |
| F3. ESC 3-step draft protection | **FAIL — DEAD CODE** | P0 |

---

## Verification Table

All references are absolute and point to HEAD `8b1a239`.

| # | Verify item | Result | Evidence |
|---|---|---|---|
| 1 | j/k handler installed inside `_mcKbHandler` | PASS | `D:\AI\_PROJECTS\modtools-ext\modtools.js:8462-8480` |
| 2 | j/k tab-scoped to `mc._gamTab === 'quick'` | PASS | `modtools.js:8462` — explicit `_gamTab === 'quick'` guard before key-match |
| 3 | j = next, k = prev (wrap-around) | PASS | `modtools.js:8473-8475` — `next = idx ± 1`; wraps via `if (next >= length) next = 0; if (next < 0) next = length-1` |
| 4 | Skips disabled buttons | PASS | `modtools.js:8463` — selector `.gam-mc-quick:not([disabled])` |
| 5 | Input-focus guard (typing in textarea doesn't fire j/k) | PASS | `modtools.js:8442` (`inField = INPUT \|\| TEXTAREA \|\| SELECT`), gate `!inField` at `:8445` precedes the j/k block |
| 6 | `.gam-mc-dur` button guard (BAN duration keys don't conflict with j/k) | PASS | `modtools.js:8443, 8445` — `inDurBtn` excluded |
| 7 | Wrap-around from no-selection state | PASS | `modtools.js:8472` — `if (idx === -1) idx = goingDown ? -1 : quickBtns.length` so j → idx 0, k → last |
| 8 | `e.preventDefault()` fires (no page-default `j` action) | PASS | `modtools.js:8476` |
| 9 | Selector matches buttons across new wrapper groups | PASS | `modtools.js:8463` — `mc.querySelectorAll('.gam-mc-quick:not([disabled])')` — buttons retain the class regardless of `.gam-mc-quick-group` wrapper at `modtools.js:10677-10751` |
| 10 | QUICK tab renders 4 groups | PASS | `modtools.js:10677, 10692, 10717, 10732` — four `<div class="gam-mc-quick-group">` wrappers |
| 11 | Group subheaders rendered with `.gam-mc-quick-header` | PASS | `modtools.js:10678, 10693, 10718, 10733` — Surveillance / Death Row / Immediate punish / Reference·rewards |
| 12 | 11 buttons total preserved | PASS | `grep -c 'class="gam-mc-quick"' modtools.js` → 11 |
| 13 | Group assignments correct per spec | PASS | Surveillance: watch, flag (2). Death Row: dr72, dr96, dr7d, sniper (4). Immediate: perma, remove (2). Reference: permalink, profile, title (3). Total 11. |
| 14 | Disabled buttons render in correct groups | PASS | `modtools.js:10695, 10700, 10705` — dr72/96/7d carry `${onDR?'disabled':''}`. `:10725` — remove carries `${canRemove?'':'disabled'}` |
| 15 | CSS for `.gam-mc-quick-group` and header | PASS | `modtools.js:21837-21839` — `margin-bottom:12px`, last-of-type 0, header `font:600 10px ui-monospace`, border-bottom on header |
| 16 | Group Unicode subheaders parse and render | PASS | All emojis use `\u{...}` escapes (`\u{1F441}` 👁, `\u{1F480}` 💀, `⚠` ⚠, `\u{1F4CE}` 📎) — no raw multi-byte in strings; bulletproof at parse time and at JS string runtime |
| 17 | ESC draft check uses `.trim()` (whitespace-only ignored) | PASS-as-coded | `modtools.js:8515` — `(banDraft.trim() + noteDraft.trim() + msgDraft.trim()).length > 0` |
| 18 | ESC draft logic builds confirm row with role=alert | PASS-as-coded | `modtools.js:8528-8537` |
| 19 | ESC draft confirm row [Discard] wires `closeAllPanels` | PASS-as-coded | `modtools.js:8538-8540` |
| 20 | ESC draft confirm row [Keep typing] restores focus | PASS-as-coded | `modtools.js:8541-8549` |
| 21 | ESC draft logic actually fires under real usage | **FAIL** | The `showModal`-installed ESC handler at `modtools.js:7844-7854` runs FIRST at capture phase and unconditionally calls `closeAllPanels()`. See F3 below. |
| 22 | ESC re-fire on confirm row dismisses without closing | **FAIL (consequence)** | Same root cause as item 21. The "ESC dismisses confirm row" branch at `modtools.js:8518-8523` is unreachable. |
| 23 | `head.parentNode.insertBefore(confirmRow, head.nextSibling)` placement (if it ever runs) | PASS-as-coded | `modtools.js:8536` — handles `nextSibling === null` correctly (becomes `appendChild`); fallback at `:8537` covers `head.parentNode === null` |

23 items checked. **20 pass.** **3 fail** (one root-cause issue + 2 consequences).

---

## Findings

### F1. j/k navigation — works correctly

**Verdict:** PASS. The implementation at `modtools.js:8462-8480` is tight.

- **Tab scoping:** `_gamTab === 'quick'` guards the entire j/k block. On BAN/INTEL/NOTE/MESSAGE/OP-DELETES tabs, `j` falls through to the BAN-tab durMap check (which doesn't contain `'j'`), then to the ESC/Ctrl+Enter blocks (no match) — no-op. Confirmed by tracing: BAN tab + plain `j` with no focused input → `_gamTab === 'quick'` false → skip → durMap miss → fall through → exit handler. ✓
- **Wrap-around:** From idx 0, k → idx -1 → wrap → last (line 8475). From last idx, j → idx+1 → wrap → 0 (line 8474). From no-selection, j → start at idx 0 (line 8472 sets idx=-1, then 8473 makes next=0). From no-selection, k → start at last (line 8472 sets idx=length, then 8473 makes next=length-1). ✓
- **Disabled skip:** The CSS selector `:not([disabled])` filters disabled buttons from the cycle list — DR buttons disabled when user is on death row, remove button disabled when no content context. j/k skip past them naturally. ✓
- **Input-focus guard:** Lines 8442 + 8445. Typing `j` in `#mc-ban-msg` textarea on BAN tab → `tn === 'TEXTAREA'` → `inField` true → entire block at 8445 skipped → `j` typed normally. ✓
- **`.gam-mc-dur` button guard:** Lines 8443 + 8445. If focused on a BAN duration button and j is pressed, the block at 8445 is skipped. Edge case is moot since j/k is quick-tab-scoped anyway. ✓

**Selector cross-check across groups:** `mc.querySelectorAll('.gam-mc-quick:not([disabled])')` is a flat selector — the wrapper `.gam-mc-quick-group` and `.gam-mc-grid` divs don't interfere. The 11 buttons (or fewer when some disabled) are returned in DOM order: watch, flag, dr72, dr96, dr7d, sniper, perma, remove, permalink, profile, title. ✓

### F2. QUICK tab category grouping — works correctly

**Verdict:** PASS. Renders 4 groups with semantic structure.

- **Structure:** 4 `<div class="gam-mc-quick-group">` wrappers at `modtools.js:10677, 10692, 10717, 10732`. Each contains a `<div class="gam-mc-quick-header">` subheader and a `<div class="gam-mc-grid">` with its buttons.
- **Button count:** `grep -c` confirms exactly 11 `.gam-mc-quick` buttons. Matches spec.
- **Group assignments match spec:** Surveillance(2) + Death Row(4) + Immediate(2) + Reference(3) = 11. ✓
- **CSS at `:21837-21839`:** `.gam-mc-quick-group{margin-bottom:12px}` with `:last-of-type{margin-bottom:0}` for clean visual break. Header is 10px uppercase monospace, dimmed `#9b9892`, with bottom border `#3d3a35` — minimal sub-sectioning that won't compete with the buttons.
- **Unicode subheaders:** All emojis emitted via `\u{...}` escape syntax in the JS source string literal (line 10678: `\u{1F441} Surveillance`, 10693: `\u{1F480} Death Row · delayed bans`, 10718: `⚠ Immediate punish`, 10733: `\u{1F4CE} Reference · rewards`). Confirmed by `node -e` test that the string literal evaluates to the intended UTF-8 chars (`👁`, `💀`, `⚠`, `📎`) with `·` middot separator. No raw multi-byte bytes in the source file → parser-safe.
- **Disabled buttons in groups:** dr72/96/7d each carry `${onDR?'disabled':''}` (lines 10695, 10700, 10705) — when user is on death row, these render with the `[disabled]` attribute and are correctly skipped by the j/k cycle and by the click handler. The `remove` button at `:10725` similarly carries `${canRemove?'':'disabled'}`.

**No regression on j/k cycle across groups:** Verified at hunt-list item — the flat selector `.gam-mc-quick:not([disabled])` returns buttons in document order regardless of wrapper div nesting. j cycles watch → flag → (dr72 if !onDR) → ... → title → watch. ✓

### F3. ESC 3-step draft protection — **DEAD CODE under current handler ordering**

**Verdict: FAIL.** P0 severity. The ESC draft protection logic at `modtools.js:8499-8552` is **unreachable** in production because the `showModal`-installed ESC handler at `modtools.js:7844-7854` always intercepts ESC first and closes the modal unconditionally.

#### Trace

1. **Mod Console open:** `openModConsole()` calls `showModal('gam-mc-panel', ...)` at `modtools.js:8420`.
2. **`showModal` registers ESC handler:** at `modtools.js:7854` — `document.addEventListener('keydown', escHandler, true)` — capture phase. This handler unconditionally calls `closeAllPanels()` on every ESC (except when `.gam-v72-asktext` is open — irrelevant here).
3. **`_mcKbHandler` registered AFTER:** at `modtools.js:8571` — also `document.addEventListener('keydown', _mcKbHandler, true)` — also capture phase. Registered AFTER `showModal`'s handler.
4. **User presses ESC with draft text:**
   - Per DOM spec, listeners on the same target+phase fire in **registration order**. `showModal`'s escHandler fires first.
   - It hits `e.preventDefault(); e.stopPropagation(); closeAllPanels();`.
   - `closeAllPanels()` calls `e.remove()` on the modal at `modtools.js:7514`.
   - `mc.remove` is monkey-patched at `modtools.js:8573-8577` to call `document.removeEventListener('keydown', _mcKbHandler, true)` before `_origRemove()`.
   - Per DOM spec, **removing a listener during event dispatch prevents that listener from firing for the current event** (HTML spec — "removed listeners are not invoked").
   - Even if it did fire next (e.g., on a different code path where the listener wasn't removed in time): `mc.isConnected === false` at `modtools.js:8439` → early return.
5. **Net effect:** The draft-protection block at `:8510-8552` is **never executed** in any real ESC scenario.

#### Why `stopPropagation()` isn't the issue

Worth noting: `e.stopPropagation()` at `modtools.js:7850` only stops the event from reaching deeper or bubbling-phase listeners. It does **NOT** stop other listeners on the SAME target at the SAME phase (that would be `stopImmediatePropagation()`). So in principle both capture-phase listeners on `document` could fire. The reason the draft logic still doesn't run is the **synchronous side effect** of `closeAllPanels()` + the **monkey-patched `mc.remove`** that detaches `_mcKbHandler` before it gets its turn.

#### Repro

1. Open Mod Console on any user
2. Tab to BAN. Type "test message" into `#mc-ban-msg`
3. Press ESC
4. **Observed:** Mod Console closes silently, draft text discarded
5. **Expected per v10.15.2 commit message:** Inline confirm row appears in the head with `[Discard]` + `[Keep typing]` buttons; draft preserved until operator explicitly clicks Discard

The commit ships the logic. The handler ordering kills it.

#### Fix options (NOT implemented — read-only QA)

There are three reasonable patches; surfacing them for the parent agent / next ship to decide:

**Option A (simplest, smallest diff):** Make `showModal`'s escHandler aware of the Mod Console specifically. At `modtools.js:7844-7852`, add a check that skips `closeAllPanels()` if `(p.id === 'gam-mc-panel') && p.querySelector('#mc-esc-confirm, [data-mc-has-draft]')` — i.e., let `_mcKbHandler` handle ESC for the Mod Console when there's a draft or confirm row. ~3 lines.

**Option B (cleaner separation):** Skip installing the generic ESC handler in `showModal` when `id === 'gam-mc-panel'`, since the Mod Console has its own `_mcKbHandler`. The Mod Console handler then becomes responsible for both ESC-close-no-draft AND ESC-draft-protect. ~5 lines.

**Option C (use stopImmediatePropagation in _mcKbHandler):** Register `_mcKbHandler` BEFORE `showModal`'s escHandler — not currently possible because `_mcKbHandler` is set up after `showModal` returns. Would require reordering openModConsole. More invasive.

Recommended: **Option B**. It eliminates the duplicate ESC-handler-on-document for the Mod Console case, removing the entire ordering dependency.

### F4. Minor — `inDurBtn` semantic check uses classList.contains, not data-tab

**Verdict:** Cosmetic note. Not a bug.

`inDurBtn = t.classList && t.classList.contains('gam-mc-dur')` at `modtools.js:8443`. This correctly excludes focus-on-duration-button presses, but the comment at `:8458-8461` says "the global guard above already excludes ... .gam-mc-dur duration buttons" implying the BAN duration shortcut (p/7/3/1/w/0) and j/k are both gated by `inDurBtn`. That's true. ✓

### F5. Hunt-list — head-as-last-child insertBefore behavior

**Verdict:** Safe (if the code path were reachable, which it isn't — see F3).

At `modtools.js:8536`: `head.parentNode.insertBefore(confirmRow, head.nextSibling)`.

- If `head` is `.gam-mc-tabs` (the most likely case — `showModal`'s body has `.gam-mc-tabs` then `.gam-mc-panels`), `nextSibling` is `.gam-mc-panels`. The confirmRow is inserted between them. Visually OK.
- If `head` were the last child (impossible given `showModal` structure, but defensively): `head.nextSibling === null` → `insertBefore(confirmRow, null)` is **equivalent to `appendChild(confirmRow)`** per DOM spec. Safe.
- If `head.parentNode === null` (impossible since `head` was queried from `mc`): fallback at `:8537` does `mc.insertBefore(confirmRow, mc.firstChild)` — prepends. Safe.

Note: `mc.querySelector('.gam-mc-head, .gam-mc-tabs')` — `.gam-mc-head` is the **Mod Chat** panel's head class (`modtools.js:17231`), not the Mod Console's. On the Mod Console, only `.gam-mc-tabs` matches. The dual selector is harmless but vestigial.

### F6. Hunt-list — Unicode in subheaders

**Verdict:** No issue.

All emoji in subheaders use `\u{...}` JS escape syntax. Parser sees ASCII escape sequences, runtime materializes the correct code points. No risk of UTF-8 BOM issues, no PS-style mojibake, no parser confusion. Verified via `node -e` test.

### F7. Hunt-list — ESC with whitespace-only textarea

**Verdict:** Safe (if reachable — but per F3 it isn't).

`anyDraft = (banDraft.trim() + noteDraft.trim() + msgDraft.trim()).length > 0` at `modtools.js:8515`. Whitespace-only textareas → all three `.trim()` calls return `""` → concatenated length is 0 → `anyDraft` false → return early (line 8516), let other ESC handlers run. Correct behavior — accidental whitespace isn't a real draft. ✓

---

## Recommendation

**Ship-blocker for v10.15.2 narrative:** F3 is a P0. The release notes claim ESC draft protection works; in production it does not. Two paths:

1. **Patch in v10.15.5** (Option B above — skip the generic ESC handler when `id === 'gam-mc-panel'` and route ESC entirely through `_mcKbHandler`). Adds ~5 lines, removes a duplicate listener. Self-contained.
2. **Update v10.15.2 changelog** to mark ESC draft protection as "shipped but gated" or "implementation pending integration" — only acceptable if patch is committed for next release.

j/k navigation (F1) and QUICK grouping (F2) are clean and can be considered shipped per spec.
