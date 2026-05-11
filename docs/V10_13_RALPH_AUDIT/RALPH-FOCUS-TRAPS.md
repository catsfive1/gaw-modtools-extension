# RALPH-FOCUS-TRAPS -- Keyboard Focus Trap Coverage Audit (read-only)

**Repo HEAD:** `9c7655e` (v10.13.4)
**Spec:** `docs/V10_DESIGN_V2/UIUX2-33_keyboard.md` (audit) + `DESIGN_V2_SHIPMASTER.md` Wave 3 acceptance (W3 SUS focus trap shipped v10.13.1)
**Date:** 2026-05-10
**Scope:** Sweep every popover, modal, drawer, tooltip-pin, banner, snack, and wizard surface for Tab cycling, ESC dismiss, and trigger-anchor focus restore.

---

## Summary -- Coverage Matrix

| Coverage tier | Count | Surfaces |
|---|---|---|
| FULL trap (Tab cycle + ESC + focus restore) | 6 | Bug Report, askText, Park, Preflight (PARTIAL -- ESC only no trap), Mod Console, Intel Drawer, SUS popover (W3) |
| PARTIAL (ESC dismiss but no Tab trap or focus restore) | 6 | DR popover, Queue popover, Health popover, Active Mods popover, Modmail panel, Hot-Now panel |
| NONE (ESC missing AND no trap AND no restore) | 3 | Auto-Unsticky popover, Snack toast (incl. W3 action button), Pinned tooltip |
| Not-applicable (intentional non-modal) | 2 | Auth banner (passive sticky), context menu (mouse-only by design but flagged) |
| FULL via popup-side inline traps (popup.js) | 4 | popupAlert modal, popupConfirm modal, identity-changed modal, pop-drill drawer |
| Verified gaps in `showModal()` host | 4 | Help, Settings, Mod Log, generic-id modals (Hot-Now is separate impl) |

**Net verdict:** The popover layer is the most-touched mod surface (SUS/DR/Queue/Health/AM all reachable from the status bar), and only 1 of 5 has a real focus trap. Tab leaks into the page DOM behind the popover for the other 4. The Snack action button (W3 new) cannot be reached or dismissed by keyboard.

---

## A. Surface Table -- Authoritative

Source-of-truth lookups in `modtools.js` and `popup.js`. Format: `file:line` for the open/show entry point and the focus-trap install (or absence).

| # | Surface | Open fn (file:line) | Trap install | Trap shape | ESC dismiss | Focus restore on close | aria-modal? | Verdict |
|---|---------|--------------------|--------------|------------|-------------|------------------------|--------------|---------|
| 1 | **SUS popover** | `_showSusPopover` modtools.js:18013 | inline W3 trap modtools.js:18526-18549 | `pop._trapHandler` (own copy of focusable selector, NOT shared `installFocusTrap`) | YES (modtools.js:18570) | YES (modtools.js:18560-18561, restores `_prevFocus` or anchor) | NO `aria-modal` attr | PASS (W3 ACs met) |
| 2 | **DR popover** | `_showDrPopover` modtools.js:18631 | NONE | -- | YES (modtools.js:19049) | NO -- focus falls to body | NO | GAP |
| 3 | **Queue popover** | `_showQueuePopover` modtools.js:19057 | NONE | -- | YES (modtools.js:19369) | NO | NO | GAP |
| 4 | **Health popover** | `_showSiteHealthPopover` modtools.js:19378 | NONE | -- | YES (modtools.js:19683-19689) | NO | NO | GAP |
| 5 | **Active Mods popover** | `_showActiveModsPopover` modtools.js:17735 | NONE | -- | NO -- only outside-click (modtools.js:17897-17900) | NO | NO | GAP (worst: no ESC) |
| 6 | **Auto-Unsticky popover** | `_showAutoUnstickyPopover` modtools.js:17908 | NONE | -- | NO -- only outside-click | NO | NO | GAP (no ESC) |
| 7 | **Mod Console** | `openModConsole` modtools.js:8115; trap at 8240 | YES via shared `installFocusTrap(mc)` | shared utility | YES (modtools.js:7663-7674 `showModal` ESC handler) | YES via `_gamFocusCleanup` (modtools.js:4166-4170, run by `closeAllPanels` 7388-7389) | role=dialog/aria-modal NOT set on `gam-mc-panel` | PASS |
| 8 | **Help modal** | `openHelp` modtools.js:11245; `showModal` 11296 | NONE -- `showModal` does not auto-install | -- | YES (showModal ESC) | NO -- focus drops to body on close | NO | GAP |
| 9 | **Settings modal** | `openSettings` modtools.js:11303; `showModal` 11608 | NONE | -- | YES | NO | NO | GAP |
| 10 | **Mod Log modal** | `openModLog` modtools.js:10921; `showModal` 11029 | NONE | -- | YES | NO | NO | GAP |
| 11 | **Hot-Now panel** | `_showHotNowPanel` modtools.js:11034 | NONE | -- | NO -- only close button + outside; uses `panelOpen='hotnow'` so global ESC at 12170 hits `closeAllPanels` (NOT `_closeHotNowPanel`), but `closeAllPanels` doesn't sweep `#gam-hot-now-panel` from its SEL set (modtools.js:7379-7387) -- so global ESC partially works through `panelOpen=null` reset but the DOM node remains | UNCERTAIN | NO | BUG: ESC may not fully dismiss; no trap; no restore |
| 12 | **Modmail panel (V11 #3)** | `_showModmailPanel` modtools.js:17132 | NONE | -- | YES (modtools.js:17189-17194) | NO | NO | GAP |
| 13 | **Mod Chat panel** | `ModChat.openPanel` modtools.js:16970 | NONE -- audit reference to "8069" was wrong (that line is unrelated DR code) | -- | unclear; relies on togglePanel | NO | NO | GAP (audit overstated coverage) |
| 14 | **askTextModal** | modtools.js:2843 | YES (modtools.js:2944) | shared utility | YES (modtools.js:2918) | YES via cleanup hook (2912-2913) | YES role=dialog (2852) | PASS |
| 15 | **Park modal** | modtools.js:3700 | YES (modtools.js:3795) | shared utility | YES (modtools.js:3747-3748) | YES (3746-3747) | YES (3710) | PASS |
| 16 | **Bug Report modal** | modtools.js:1432 | YES (modtools.js:1555) | shared utility | YES via showModal ESC (modal opens via `showModal`) | YES (cleanup runs in closeAllPanels) | NO explicit (`gam-bug-report-panel` lacks aria-modal) | MOSTLY-PASS |
| 17 | **Intel Drawer** | `IntelDrawer.open` modtools.js:5779 | YES (modtools.js:5796) | shared utility (additive to sentinel-based) | YES (5700-ish + 12170 cascade) | YES (5802) | YES (5679, role=dialog/aria-modal) | PASS (best in class) |
| 18 | **Preflight panel** | `preflight()` modtools.js:2135 | NONE -- audit claimed line 2939 = preflight, but 2939 is askText backdrop click handler. Preflight has no `installFocusTrap` call. | -- | YES (2158, 2166) | NO -- only the resolve | NO | GAP (audit was wrong; preflight is unprotected) |
| 19 | **Snack toast** (incl. W3 action button) | `snack()` modtools.js:7519 | NONE | -- | NO -- ESC does nothing | N/A (no focus moved) | NO | GAP -- W3 action button (e.g. `[UNDO 10s]` for DR Cancel-All) cannot be activated by keyboard without Tab into a non-modal floating element |
| 20 | **Auth banner** (`gam-ext-orphaned-banner`) | `_gamShowExtOrphanedBanner` modtools.js:7492 | N/A (banner, not modal) | -- | NO ESC handler | NO | NO | INTENTIONAL non-modal; buttons reachable via Tab but no focus management on Reload/Dismiss |
| 21 | **Pinned tooltip** | `pinTooltip` modtools.js:11895 | NONE -- tooltip has interactive controls (Open Intel, Mark SUS, DR, Copy, x) | -- | NO -- audit gap confirmed: `unpinTooltip()` not on ESC cascade | NO | NO | GAP -- mouse-pinned tooltip with 5 buttons is keyboard-trapped and ESC-untouchable |
| 22 | **Context menu** (`.gam-ctx-item`) | `contextmenu` modtools.js:11185 | N/A (mouse-triggered, items have `tabindex="-1"`) | -- | YES via `_gamCloseCtx` ESC at modtools.js:11156 | YES (returns to body; no anchor stash) | role=menuitem set per item; no menu-level role/aria-orientation | PARTIAL (no Arrow nav as audit notes) |
| 23 | **First-run wizard (popup)** | `firstRunPath*` popup.js:3406-3432; `showStep()` popup.js:3386 | NONE -- step transitions move focus to input but no trap or aria-live | -- | NO ESC | N/A (in-popup not modal) | NO | GAP-LITE -- popup body is the modal context; less critical |
| 24 | **popupAlert modal** (popup) | popup.js:1422-ish | inline trap popup.js:1462-1470 | own copy of focusable selector | YES (popup.js:1460) | YES (popup.js:1456) | YES role=dialog | PASS |
| 25 | **popupConfirm modal** (popup) | popup.js:1492 | inline trap popup.js:1543-1551 | own copy | YES (popup.js:1541) | YES (popup.js:1537) | YES role=dialog (popup.js:1502) | PASS |
| 26 | **Identity-changed modal** (popup) | popup.js:2860-ish | inline trap popup.js:2879-2886 | own copy | YES (popup.js:2878) | YES (popup.js:2891) | YES (popup.js:2861) | PASS |
| 27 | **Pop-drill drawer** (popup) | popup.js:432+ | inline trap popup.js:572-583 | own copy | YES (popup.js:574) | YES on close-btn click only (popup.js:566-570) | YES role=dialog (popup.html:149) | PASS-ALMOST -- focus restore wired to close-btn click handler, not ESC keydown path |

---

## B. Findings

### B.1 Five popovers, four leaking Tab

Of the five popovers exposed via the status bar (SUS, DR, Queue, Health, Active Mods), **only SUS** received a focus trap (W3, v10.13.1). The other four all share the same shape:

- ESC dismiss handler attached document-wide
- Outside-click closes
- Close button works
- **No Tab/Shift-Tab cycling**
- **No focus moved into the popover on open**
- **No focus restoration to the trigger anchor on close**

A keyboard user who tabs into one of these popovers can Tab past the close button and land in the page DOM behind the popover, with the popover still visually on top. They then have to ESC + manually re-focus their position in the page. This is the exact "Tab leak" anti-pattern UIUX2-33 §B.1 named for `showModal()`-hosted modals.

**Surfaces affected (all `modtools.js`):**
- DR popover -- L18631
- Queue popover -- L19057
- Health popover -- L19378
- Active Mods popover -- L17735
- Auto-Unsticky popover -- L17908 (worst: also no ESC)

### B.2 SUS focus trap is correct but not using the shared utility

W3 acceptance criterion "Focus trap installed" on SUS popover ships at modtools.js:18526-18549, but:

- It rolls its own `_trapHandler` rather than calling `installFocusTrap(pop)` (modtools.js:4140).
- Its focusable selector (line 18532) drifts from the canonical FOCUSABLE constant (modtools.js:4142): SUS uses `[href]` while shared uses `a[href]`. SUS includes any element with `[href]` (e.g. SVG `<a>` tags would match), shared only matches `<a href>`. Practically equivalent today; latent drift risk.
- It does NOT call `installFocusTrap` so it does NOT register a `_gamFocusCleanup` on `pop`. `closeAllPanels` (modtools.js:7388-7389) iterates the SEL set looking for `_gamFocusCleanup` -- SUS popover element ID `gam-sus-popover` is NOT in that SEL set anyway, so the divergence is harmless, but it's a tech-debt copy.
- Verdict: **SUS W3 spec is met, but as inline rather than shared infra.** Same drift risk UIUX2-33 §B.2 raised about popup.js inline traps.

### B.3 Snack action button is a keyboard dead-end

W3 introduced `snack(msg, type, opts)` with `actionLabel`/`onAction`/`actionDurationMs` (modtools.js:7519-7614). The action button is rendered as a real `<button>` with click handler -- but:

- Snack toast is `position:fixed` in the bottom-right with `pointer-events: auto` only when an action button is rendered (modtools.js:7568). Tab order: it's an off-flow element. A keyboard user mid-task cannot reach the [UNDO] button without manually Tab-walking through the entire intervening DOM.
- ESC does not dismiss the snack.
- Focus is not moved to the action button when the snack appears.
- The snack auto-dismisses on `actionDurationMs` (10s for DR Cancel-All), so a slower keyboard user may never reach it.

**For the DR popover Cancel-All flow specifically:** mod fires Cancel All -> snack appears bottom-right with [UNDO 10s] -> mod has 10s to mouse-click UNDO. There is **no keyboard path** to UNDO during that 10s window. Either the action button must auto-focus (and ESC dismiss the snack), or there must be a keyboard alternative (e.g. Ctrl+Z mapped to the most recent `withUndo` action).

### B.4 Pinned tooltip remains keyboard-untouchable (UIUX2-33 §B Quick-Reference confirmed)

`pinTooltip()` (modtools.js:11895) injects a controls bar with 5 buttons (Open Intel / Mark SUS / DR / Copy / x). The tooltip has `tooltipPinned = true`, but:

- Global ESC handler at modtools.js:12170 only fires `closeAllPanels()` if `panelOpen` is set. `tooltipPinned` is **not** in the `panelOpen` taxonomy.
- `unpinTooltip()` (modtools.js:11829) is only called from: (a) outside-click (line 12158), (b) per-action handlers (intel/sus/close), (c) hover into a different user (line 12003). NO keyboard path.
- The audit's recommended Esc cascade (UIUX2-33 §Quick-Reference, P1, ~15 min effort) was not shipped in W3 or W5.

This is a 1-line fix per the audit's E2 estimate (intercept ESC in the global keydown handler before `closeAllPanels` if `tooltipPinned`).

### B.5 ESC cascade still not layered

UIUX2-33's desired cascade: `tooltip -> inner sub-panel (asktext/preflight) -> parent modal -> noop`. As-built:

1. `IntelDrawer ESC handler` (capture-phase, stopImmediatePropagation) closes drawer.
2. `showModal ESC handler` (capture, stopPropagation) closes its own modal, but checks for `.gam-v72-asktext` first and yields if present (modtools.js:7667).
3. Per-popover ESC handlers (SUS/DR/Queue/Health) fire and close themselves.
4. Global keydown ESC at 12170 fires `closeAllPanels()` if `panelOpen`.
5. **Pinned tooltip: no ESC layer.**

Order of fire is uncoordinated -- multiple handlers may fire on a single ESC press because each is registered separately at document level (no central dispatcher). Today this works because most handlers do `stopPropagation()`. But a SUS popover ESC (modtools.js:18570 -- registered at `document.addEventListener('keydown', pop._escHandler)`, not on `pop`) does NOT stopPropagation, so SUS ESC + global ESC will both fire. Side effects today are harmless (SUS closes itself, then closeAllPanels has nothing to do), but it's fragile.

### B.6 Active Mods + Auto-Unsticky popovers: NO ESC handler

These are the worst offenders. Both rely solely on outside-click dismiss:

- `_showActiveModsPopover` (modtools.js:17735): outside-click only, no ESC
- `_showAutoUnstickyPopover` (modtools.js:17908): outside-click only, no ESC

A keyboard user who opens AM popover via the Active Mods status-bar button (with keyboard activation -- Enter on focused button) cannot dismiss it without:

1. Tabbing to the close-button [x] inside the popover, AND
2. Pressing Enter on it (assuming Tab reaches it -- given the popover has no focus trap, Tab walk includes background DOM).

Or hitting any other element on the page with mouse.

ESC is the standard a11y dismiss for transient overlays. This is missing.

### B.7 `closeAllPanels` SEL set missing popover IDs

`closeAllPanels()` (modtools.js:7357-7407) iterates a fixed SEL set:

```
'.gam-modal',
'#gam-backdrop',
'.gam-modal-backdrop',
'#gam-intel-backdrop',
'#gam-token-onboard-backdrop',
'.gam-preflight-wrap',
'[data-gam-orphan-backdrop]'
```

Popover IDs `gam-sus-popover`, `gam-dr-popover`, `gam-queue-popover`, `gam-sh2-pop`, `gam-active-mods-popover`, `gam-auto-unsticky-popover`, `gam-modmail-panel`, `gam-hot-now-panel` -- **none are in the SEL set**.

Implication: a keyboard user pressing ESC while a popover IS open and `panelOpen=null` (because popovers don't set `panelOpen`) will trigger global ESC (line 12170) -> `panelOpen` is null -> early-return -> nothing happens. The popover's own ESC handler MUST fire to close it. If that handler races or fails, the popover is undismissable.

This is the architecture defect that the inline ESC handlers in each popover are working around.

### B.8 First-run wizard (popup.js) lacks step focus management

Wizard step transitions (popup.js:3406, 3415, 3424) move focus to the input field after a 50ms `setTimeout`. But:

- No focus restoration when going Back (popup.js:3433 just resets state).
- No focus management on success-step entry (popup.js:_cardWizardComplete at 3445).
- No aria-live announcement of step changes (a screen reader user has no signal that the step moved).
- Done button on success (`firstRunDone`) does not return focus anywhere defined.

For a non-modal flow embedded in the popup, this is "low-stakes" but ships a regression vs. UIUX2-36 §E-2 which named "wizard step transitions need clear focus signals."

### B.9 `showModal` host has no focus trap (UIUX2-33 §B.1 reconfirmed)

`showModal()` at modtools.js:7621 does NOT call `installFocusTrap`. Coverage is conditional on each caller invoking it. As of v10.13.4:

- Bug Report -- YES (1555)
- Mod Console -- YES (8240)
- askText panel-style call to `showModal` -- N/A (askText is its own modal builder, not via showModal)
- Park -- YES (3795) -- but Park does not use showModal either; it builds an overlay/modal pair directly
- Help -- NO
- Settings -- NO
- Mod Log -- NO

Audit recommendation E1 (~30 min, P0 in UIUX2-33): add `installFocusTrap(p)` inside `showModal` so all callers benefit. **Not shipped through v10.13.4.**

---

## C. ARIA & Trigger Affordances

### C.1 `aria-modal` on popover roots

Only Intel Drawer (modtools.js:5679), askText (2852), Park (3710), and the three popup.js modals (popupAlert/Confirm/identity-changed) set `role="dialog"` + `aria-modal="true"` properly.

Missing on:
- SUS popover root
- DR popover root
- Queue popover root
- Health popover root
- Active Mods popover root
- Auto-Unsticky popover root
- Hot-Now panel root
- Modmail panel root
- Mod Chat panel root
- Mod Console panel root (despite focus trap)

A screen reader navigating into one of these reads the content as part of the page, not as a modal context. Keyboard-only sighted users still get focus trap on Mod Console; SR users do not get the modal-context cue.

### C.2 `aria-haspopup` on triggers

popup.html: only Bug Reports button + Maint button advertise `aria-haspopup="true"`.

modtools.js: only the v6 combobox at line 5323 sets it. Status-bar buttons that open SUS/DR/Queue/Health/AM/Auto-Unsticky popovers do NOT advertise `aria-haspopup`. A SR user pressing Enter on the SUS-count button hears "button" with no signal that a popover will open.

### C.3 `aria-expanded` on toggles

Only the lapsed-mods Expand button (popup.html:667) and the v6 combobox set it. Popover triggers do not.

---

## D. Recommendations (priority-ordered)

| # | Recommendation | Effort | Priority | Affects |
|---|----------------|--------|----------|---------|
| R1 | Add `installFocusTrap(pop)` call to `_showDrPopover`, `_showQueuePopover`, `_showSiteHealthPopover`, `_showActiveModsPopover`, `_showAutoUnstickyPopover`. Each is ~3 lines (try/catch/install + cleanup wire on close). | ~45 min total | **P0** | All status-bar mod hot paths |
| R2 | Add ESC handler to `_showActiveModsPopover` and `_showAutoUnstickyPopover` -- they currently have no ESC dismiss. Match the pattern at `_showDrPopover` line 19049. | ~10 min | **P0** | a11y blocker for those two |
| R3 | Refactor SUS popover inline trap (modtools.js:18526-18549) to call shared `installFocusTrap(pop)` instead. Eliminates selector-drift risk. Net diff: -20 lines, +1 line. | ~15 min | P1 | SUS only -- tech debt |
| R4 | Add ESC dismiss + focus auto-move to snack action button. When `hasAction` is true (modtools.js:7552), move keyboard focus to the action button after the snack mounts; register a snack-scoped ESC handler that dismisses without firing the action. | ~30 min | **P0** | W3 DR Cancel-All UNDO is keyboard-unreachable today |
| R5 | Add tooltip ESC layer to the global keydown handler at modtools.js:12170. Before `closeAllPanels`, check `if (tooltipPinned) { unpinTooltip(); e.preventDefault(); return; }`. UIUX2-33 §E.2 already specced this at ~15 min P1. | ~15 min | **P0** (already deferred once) | All pinned-tooltip workflows |
| R6 | Add `installFocusTrap` call inside `showModal()` (modtools.js:7621) so Help, Settings, Mod Log, and any future generic-modal caller get the trap automatically. Idempotent for current callers (Mod Console, Bug Report) since they already install it; first install wins via cleanup-on-replace. | ~30 min | **P0** (UIUX2-33 §E E1 deferred) | Help, Settings, Mod Log, all future generic modals |
| R7 | Add `role="dialog"` + `aria-modal="true"` to all popover roots (SUS/DR/Queue/Health/AM/Auto-Unsticky/Hot-Now/Modmail/ModConsole/ModChat). One line per root. | ~20 min | P1 | SR users only |
| R8 | Add `aria-haspopup="true"` + `aria-expanded` toggling to status-bar trigger buttons that open popovers. | ~30 min | P1 | SR + a11y audit signal |
| R9 | Migrate popup.js inline traps (4 copies: pop-drill drawer, popupAlert, popupConfirm, identity-changed) to a shared local `_popupFocusTrap()` helper. UIUX2-33 §E E4 already specced at ~1h P2. | ~1 h | P2 | Tech debt, no UX regression |
| R10 | Mod Chat panel: add `installFocusTrap` to `openPanel()` (modtools.js:16970). Audit reference to "8069" was wrong -- there is no trap on Mod Chat today. | ~15 min | P1 | Mod Chat keyboard users |
| R11 | Modmail panel: add focus trap + focus restore to `_showModmailPanel` (modtools.js:17132). | ~20 min | P1 | Modmail keyboard hot path |
| R12 | Hot-Now panel: add focus trap + verify ESC actually closes (today's `closeAllPanels` does NOT sweep `#gam-hot-now-panel` -- only sets `panelOpen=null`, leaving the DOM node visible). Investigate and fix. | ~30 min | **P0** (suspect open bug) | Hot-Now hot-path |
| R13 | Preflight panel: add focus trap. `preflight()` at modtools.js:2135 has ESC but no Tab cycling. UIUX2-33 audit was wrong about "preflight has trap at line 2939" -- that's askText's backdrop click handler, not preflight. | ~15 min | P1 | Ban preflight is the most-frequent confirm flow |
| R14 | First-run wizard: add `aria-live` polite announcement on `showStep(n)` transitions; add focus management on Done success-step entry. | ~20 min | P2 | First-run keyboard/SR users |

---

## E. What W3 Actually Shipped vs. UIUX2-33 Promised

| Item | UIUX2-33 said | W3 SHIPMASTER said | Reality (HEAD `9c7655e`) |
|------|---------------|--------------------|--------------------------| 
| SUS focus trap | Gap (audit missing) | Acceptance: "Focus trap installed" | SHIPPED at modtools.js:18526-18549 (inline, not shared utility) |
| DR popover focus trap | Not named in W3 | Not named in W3 | **NOT SHIPPED** |
| Queue popover focus trap | Not named in W3 | Not named in W3 | **NOT SHIPPED** |
| Health popover focus trap | Not named in W3 | Not named in W3 | **NOT SHIPPED** |
| Active Mods popover focus trap | Not named in W3 | Not named in W3 | **NOT SHIPPED** |
| `showModal` auto-focus-trap | Audit recommended (E1, P0, ~30m) | Not in W3, W4, or W5 ACs | **DEFERRED** |
| Esc cascade incl. tooltip | Audit recommended (E2, P1, ~15m) | Not in W3, W4, or W5 ACs | **DEFERRED** |
| Snack action button keyboard reachable | W3 introduced action button | "Undo toast surfaces via extended snack..." -- AC met visually but not keyboard-wise | **PARTIAL** -- action button renders, but no keyboard path to it |

**Bottom line:** W3 specifically named the SUS focus trap as an AC; it shipped. But "popover focus trap coverage" was not a W3 theme -- it was scoped to one popover (SUS). The other four popovers were left for a future wave. UIUX2-33's E1/E2 recommendations remain outstanding.

---

## F. ESC Cascade -- As-Built (annotated)

```
Keypress: ESC

Layer 0 -- intel-drawer ESC (capture-phase, stopImmediatePropagation)
            modtools.js:5700-ish
            FIRES IF intel-drawer open. Closes drawer + bypasses every other layer.

Layer 1 -- showModal-modal ESC (capture-phase, stopPropagation)
            modtools.js:7663-7674
            FIRES IF a .gam-modal is in DOM. Yields to .gam-v72-asktext if present.
            Does NOT close popovers (those aren't .gam-modal).

Layer 2 -- per-popover ESC handlers (NO capture, NO stopPropagation)
            modtools.js:18570 (SUS), 19049 (DR), 19369 (Queue), 19683 (Health)
            FIRES IF that popover is open.
            Active Mods + Auto-Unsticky have no ESC handler.

Layer 3 -- preflight ESC (no capture, no stopPropagation)
            modtools.js:2158, 2166

Layer 4 -- global keydown ESC
            modtools.js:12167-12170
            Fires `closeAllPanels()` only if `panelOpen` is set.
            `panelOpen` set by: modconsole, log, hotnow, help, settings.
            `panelOpen` NOT set by: any popover.

Layer 5 -- pinned tooltip:
            **MISSING.** ESC does not unpin.
```

Cascade gaps:
1. Pinned tooltip: no ESC layer. Persists until mouse click.
2. Active Mods + Auto-Unsticky popovers: no ESC layer. Persist until outside-click.
3. Hot-Now panel: ESC fires `closeAllPanels()` (because `panelOpen='hotnow'`), but `closeAllPanels` SEL set does NOT include `#gam-hot-now-panel`. The DOM node may not be removed. Only `panelOpen=null` is reset. **This is a likely open bug -- needs verification.**
4. Race conditions when multiple popovers/modals are stacked: per-popover handlers don't `stopPropagation`, so global ESC fires too. Today benign; latent risk.

---

## G. Quick Patches (suggested code -- not applied per agent brief)

### G.1 Fix R1 -- DR popover focus trap

Insert at modtools.js:19032 (just after `document.body.appendChild(pop);`):

```js
try { if (typeof installFocusTrap === 'function') installFocusTrap(pop); } catch(e){}
```

And at modtools.js:19036 (start of `_closePop`):

```js
try { if (pop._gamFocusCleanup) { pop._gamFocusCleanup(); pop._gamFocusCleanup = null; } } catch(_){}
```

Mirror for Queue (19139), Health (19610-ish, before async work), Active Mods (17782), Auto-Unsticky (17943).

### G.2 Fix R5 -- ESC unpins tooltip

Before line 12170 (`if(k==='escape' && panelOpen){...}`):

```js
if (k === 'escape' && tooltipPinned) {
  unpinTooltip();
  e.preventDefault();
  return;
}
```

### G.3 Fix R2 -- ESC for Active Mods

Insert at modtools.js:17900 (just after `document.addEventListener('click', close, true);`):

```js
const _amEsc = function(ev) {
  if (ev.key === 'Escape') {
    if (typeof close === 'function') close({ target: document.body });
    document.removeEventListener('keydown', _amEsc);
  }
};
document.addEventListener('keydown', _amEsc);
```

Mirror for Auto-Unsticky (17949).

---

*Generated by RALPH-FOCUS-TRAPS audit. Source: `modtools.js` (1.46 MB), `popup.js`, `popup.html`, UIUX2-33_keyboard.md, DESIGN_V2_SHIPMASTER.md §5 W3.*
