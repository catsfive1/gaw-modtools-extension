# UIUX2-33 — Keyboard-First Moderation: Design Audit

**Scope:** `modtools.js`, `popup.js`, `popup.html`
**Date:** 2026-05-10
**Status:** Audit complete. Implementation gaps and effort estimates follow.

---

## A. Keyboard-Only Completability — 10 Hot-Path Actions

Tested against source code paths, not live browser. "Completable" = reachable
and operable without a mouse if the user already has keyboard focus inside the
tool.

| # | Action | Keyboard path | Completable? | Notes |
|---|--------|---------------|:---:|-------|
| 1 | Open Mod Console on hovered post | `Ctrl+Shift+B/R/X/P` | YES | All four tab-open shortcuts wired in global `keydown` handler (modtools.js:11897-11901). Requires `hoveredItem` set via mouse — no hover-free keyboard trigger exists. |
| 2 | Submit ban from Ban tab | Tab to confirm btn + Enter, or keyboard-arm preflight | PARTIAL | Preflight arm countdown uses 3-second timer; keyboard path reaches `Confirm` button via Tab. `Ctrl+Enter` is not wired to the ban submit; only the native modmail reply textarea has `Ctrl+Enter`. |
| 3 | Send modmail reply | `Ctrl+Enter` in reply textarea | YES | Wired at modtools.js:15477 and 16518, also popup.js textarea equivalent. Works on Cmd (metaKey) too. |
| 4 | Archive modmail (thread) | `Ctrl+Shift+A` | YES | Full path: capture-phase, works even while reply box focused (modtools.js:11871). |
| 5 | Archive modmail (list, hovered row) | `Ctrl+Shift+A` or bare `A` | PARTIAL | `hoveredMail` must be set via mouse before pressing key. A keyboard user who tabbed to a row can't trigger the shortcut — bare `A` at modtools.js:11934 checks `hoveredMail`, not focus position. |
| 6 | Navigate popup tabs (Stats/Tokens/Tools/etc.) | `ArrowLeft` / `ArrowRight` | YES | WAI-ARIA roving-tabindex tab pattern implemented in popup.js:3277-3288. |
| 7 | Close any open panel | `Escape` | YES | Global `keydown` at modtools.js:11860 calls `closeAllPanels()`. `showModal` also attaches a capture-phase ESC handler per panel (modtools.js:7516-7527). |
| 8 | Navigate Intel Drawer history back | `Backspace` | YES | Wired in IntelDrawer ESC handler (modtools.js:5696-5704). Blocked correctly when focus is in an input/textarea. |
| 9 | Navigate drill-down list in popup | Tab only | PARTIAL | Pop-drill drawer has Tab/Shift-Tab focus trap (popup.js:432-441) but no `j/k` or `ArrowUp/Down` row navigation. Keyboard users must tab through every row. |
| 10 | Dismiss user intel tooltip | No keyboard path | NO | `unpinTooltip()` is only triggered by outside click (modtools.js:11848). `Esc` in the global handler calls `closeAllPanels()` but not `unpinTooltip()`. A pinned tooltip persists until mouse click. |

**Summary:** 5 fully completable, 3 partial (mouse-state dependency or missing
`j/k`), 2 not completable without a mouse.

---

## B. Focus-Trap Coverage Gaps

### What is implemented well

- `installFocusTrap()` (modtools.js:4135) is a solid, reusable Tab/Shift-Tab
  cycler. It captures `prevActive` at install time and restores focus on
  cleanup — the pattern is correct.
- It is applied to: IntelDrawer (5788), the Park modal (3790), the Ban
  preflight panel (2939), the bug-report modal (1550), and the Mod Chat panel
  (8069).
- `showModal()` does NOT call `installFocusTrap()` — it relies on the
  per-modal-type calls above, so coverage is conditional on each caller
  remembering to invoke it.

### Confirmed gaps

1. **`showModal()` itself has no focus trap.** `showModal` is the generic
   modal host for Help, Settings, Mod Log, Mod Console, and Hot-Now. None of
   these call `installFocusTrap()` after `showModal` returns (modtools.js:10986,
   11298, 10719, 8063, 10720). Tab leaks to the page behind the backdrop.

2. **popup.js drawers roll their own trap inline** (popup.js:434-441,
   1197-1205, 1278-1286, 2577-2585) rather than using a shared utility. Each
   uses a slightly different focusable selector string — they are not in sync
   with the `FOCUSABLE` constant in `installFocusTrap`. If the canonical
   selector is ever updated, the popup copies will drift.

3. **Token-onboard modal** — backdrop is tracked in `closeAllPanels` (SEL
   includes `#gam-token-onboard-backdrop`) but no `installFocusTrap` call is
   visible in the token-onboard flow. If the onboard modal is a multi-step
   wizard, focus may escape between steps.

4. **Context menu (`.gam-ctx-item`)** — items have `role="menuitem"` and
   `tabindex="-1"` (modtools.js:10875-10894), which is correct for a menu, but
   there is no roving tabindex or ArrowUp/Down handler wired to cycle through
   menu items. A keyboard user who opens the context menu has no way to
   navigate it without a mouse.

5. **Focus restoration on `showModal` close** — `closeAllPanels` calls
   `_gamFocusCleanup()` on elements that have it (modtools.js:7306), but
   `showModal`-created panels only get `_gamFocusCleanup` if the caller
   separately invoked `installFocusTrap`. For Help, Settings, and Mod Log,
   `closeAllPanels` removes the DOM node and `_gamEscHandler`, but focus
   returns to `document.body` (browser default), not the element that opened
   the modal. A keyboard user loses their place.

---

## C. Shortcut Discovery

### Current state

- Keyboard shortcuts exist in `openHelp()` behind a `<details>` element
  (modtools.js:10960-10983). The shortcuts list is collapsed by default under
  "Power-user keyboard shortcuts". The help panel itself is only reachable via
  `Ctrl+Shift+H` or the `?` button in the status bar.
- Tooltips on status-bar buttons include the shortcut in the `title` attribute
  (e.g. `'Keybinds + commands cheatsheet (Ctrl+Shift+H)'` at modtools.js:19236)
  — visible on hover but invisible to keyboard users who never mouse over.
- Modmail bar shows an inline hint: `"Ctrl+Shift+A archive · Ctrl+Shift+M Mod
  Console · R focus reply"` (modtools.js:12051, 19780). This is the only
  inline shortcut hint outside the help modal.
- The QUICK tab, Ban tab, Message tab, and Intel tab have zero inline shortcut
  hints.

### Discoverability gaps

1. **No keyboard hint at first focus.** When a user opens the extension popup
   or the Mod Console for the first time, there is no "? for help" or `[?]`
   affordance visible to a keyboard user.
2. **Help shortcut list is collapsed** — a user who opens Help with
   `Ctrl+Shift+H` sees visual-action rows first; shortcuts require expanding
   the `<details>`. No new user would discover shortcuts without already knowing
   `Ctrl+Shift+H`.
3. **`Ctrl+K` command palette** is wired (modtools.js:5390-5402) but is not
   listed in the help panel's shortcut table. It is undiscoverable.
4. **`Ctrl+Enter` submit** is documented in the help table only for modmail
   reply. It is not hinted inline in the modmail reply textarea placeholder
   — the placeholder says `"Type your message… (Ctrl+Enter to send)"` on the
   Mod Chat panel (modtools.js:16437) but the modmail reply textarea in the
   Message tab has no such hint.

---

## D. Cmd/Ctrl Key Consistency

### Positive findings

- All multi-key shortcuts use `e.ctrlKey` checks (not `e.metaKey` alone),
  which is correct for the Windows target audience.
- `Ctrl+Enter` for send is consistently checked with
  `(e.ctrlKey || e.metaKey)` at both modtools.js:15477 and 16518 — portable
  to Mac if ever needed.
- No shortcut uses `e.altKey` combinations, which avoids AltGr conflicts on
  European keyboards.

### Inconsistencies

1. **Ctrl+Shift+M is partially documented.** Listed as "Mod Console -> Ban tab
   on hovered post" in the shortcut table but the handler (modtools.js:11922)
   opens specifically against the modmail sender — only on modmail pages.
   The label is misleading and the scope is not surfaced.
2. **`Ctrl+Shift+T` opens Hot-Now panel** (modtools.js:11914, `k==='t'`) but
   is NOT in the help shortcut table. An undocumented shortcut.
3. **Bare `A` on modmail list** is a shortcut that has no visual affordance and
   no mention in the help table. The help table only lists `A (on modmail)` —
   ambiguous about list vs. thread behavior.
4. **`Ctrl+Shift+M` (modtools.js:11921) vs. the bar-icon title `Ctrl+Shift+M`
   on the bar button** — the bar button description says "on hovered post" but
   the handler also fires on modmail sender context. Mismatched.

---

## E. Effort Estimates

Each item is scoped to minimum viable fix. No cosmetic refactor — surgical
changes only.

| Item | Description | Effort | Priority |
|------|-------------|--------|----------|
| E1 | Add `installFocusTrap` call inside `showModal()` so Help, Settings, Mod Log, and all generic modals get the trap automatically. Also add `prevActive` restore on `closeAllPanels` for those modals. | ~30 min | P0 — every modal leaks Tab today |
| E2 | Wire `Escape` in global keydown to call `unpinTooltip()` if `tooltipPinned` is true, BEFORE `closeAllPanels`, so Esc has the layered cascade: tooltip first, then panel. | ~15 min | P1 — blocks keyboard-only flow #10 |
| E3 | Add `j/k` (and `ArrowDown/Up`) row navigation to the pop-drill list in popup.js. Matches the pattern already used in the command palette (modtools.js:5353-5370). | ~45 min | P1 — list nav is a standard power-user expectation |
| E4 | Refactor popup.js inline focus traps (4 copies) to import/call a shared `installFocusTrap`-equivalent. Eliminates selector drift. | ~1 h | P2 — tech debt, no UX regression today |
| E5 | Add `Ctrl+Shift+T` and `Ctrl+K` to the help shortcut table. Expand `<details>` open by default (or use a non-collapsing layout). | ~20 min | P1 — discoverability |
| E6 | Fix modmail list action (#5): check if focused row matches a `hoveredMail`-equivalent data attribute so `A`/`Ctrl+Shift+A` works from keyboard row focus, not only mouse-hover state. | ~1 h | P2 — requires refactoring hover-state to focus-state |
| E7 | Add keyboard nav (ArrowUp/Down + Enter + Esc) to `.gam-ctx-item` context menu. Currently mouse-only despite `role="menuitem"`. | ~45 min | P2 |
| E8 | Add inline shortcut hint to Mod Console Message tab reply textarea placeholder: `"(Ctrl+Enter to send)"`. | ~5 min | P1 — high-value, trivial cost |
| E9 | Fix help table label for `Ctrl+Shift+M` to accurately reflect scope (modmail sender vs. hovered post). Add note on bare `A` behavior difference (list vs. thread). | ~10 min | P2 — documentation, no code |
| E10 | Token-onboard modal: verify `installFocusTrap` is called during wizard mount. If absent, add it. | ~20 min | P1 — onboarding is a critical first-run path |

**Total estimated effort for P0+P1 items (E1-E3, E5, E8, E10):** ~2.5 hours.
**Full remediation including P2:** ~5.5 hours.

---

## Quick-Reference: Esc Cascade As-Built vs. Desired

```
DESIRED cascade (innermost first):
  1. Dismiss pinned tooltip (if visible)
  2. Close inner sub-panel (e.g. asktext, preflight)
  3. Close parent modal/drawer
  4. No-op if nothing open

ACTUAL cascade:
  1. IntelDrawer ESC handler (capture, stopImmediatePropagation) -> closes drawer
  2. showModal ESC handler (capture, stopPropagation) -> checks for .gam-v72-asktext first
  3. Global keydown ESC at modtools.js:11860 -> calls closeAllPanels if panelOpen
  4. Tooltip: NOT in any Esc path. Pinned tooltip persists.

GAP: tooltip layer is missing from the cascade entirely.
```

---

*Generated by UIUX2-33-KEYBOARD agent. Source files: modtools.js (25k+ lines),
popup.js, popup.html.*
