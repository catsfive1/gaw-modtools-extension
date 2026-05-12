# QA-A2 — v10.15.0 + v10.15.1 D-22 Feature Verification (Read-only Audit)

**Auditor:** Claude (QA-A2 read-only mode)
**Date:** 2026-05-12
**Repo:** `D:\AI\_PROJECTS\modtools-ext\`
**HEAD at audit:** `8b1a239` (v10.15.4)
**Commits under verification:** `a1ae76b` (v10.15.0 — D-22 status-bar tour) + `3d79e22` (v10.15.1 — backlog sweep; only the install-accordion subitem in scope here)
**Files inspected:** `modtools.js`, `popup.html`, `popup.js` (for accordion state-machine interaction), `manifest.json`
**Parse check:** `node --check modtools.js` → PARSE OK

Out-of-scope from `3d79e22`: subitems [1] j/k nav, [2] mod-chat focus trap, [3] hot-now focus trap + ESC. Only subitem [4] (install accordion) is verified here per the brief.

---

## Summary

| # | Feature | Status |
|---|---------|--------|
| 1 | `_gamStatusBarTour()` defined at bottom of outer IIFE | **PASS** |
| 2 | Auto-trigger 2s after status-bar mount, gated by `gam_tour_seen_v1` | **PASS** |
| 3 | 7 stops: SHIELD / GEAR / MOD LOG / MODMAIL / HELP / MOD CHAT / TICKER | **PASS** (with 1 graceful-degradation caveat — MODMAIL stop resolves on all pages via the title-prefix fallback selector, not just modmail-thread pages as the commit message implies) |
| 4 | Spotlight + 340 px tooltip card + Skip / Next / Done buttons | **PASS** |
| 5 | Keyboard: ESC = skip, ArrowRight = next | **PASS** (handler is captured globally and properly removed on close — no listener leak) |
| 6 | PRM gate: fade-in animation suppressed under reduce-motion | **PASS** |
| 7 | GEAR replay row "Status-bar tour" / "Replay" in Display section | **PASS** (closes settings before re-firing tour — defensive on replay path) |
| 8 | `window.__gamStatusBarTour` exposed | **PASS** |
| 9 | `setSetting('gam_tour_seen_v1', true)` on Done button | **PASS** |
| 10 | `<details id="firstRunInstallAccordion">` inside `#tokStateFirstRun` | **PARTIAL** — accordion is present and correctly authored, but commit message claims "at the bottom of `#tokStateFirstRun`"; actually positioned **between** the step-2 wizard and the success-state block (see Finding 10) |
| 11 | 3 sections: Manual ZIP (7 steps) / Drive (6 steps) / Troubleshooting | **PASS** |
| 12 | Collapsed by default (no `open` attribute) | **PASS** |
| 13 | Native `<details>/summary` (a11y free) | **PASS** |
| 14 | `min-height:32px` on summary | **PASS** |
| 15 | Brave + manifest links present | **PASS** |

**Overall: PARTIAL.** All 15 verification points implement correctly at the byte level. Two non-blocking findings: (a) the accordion is positioned mid-container, not at the bottom (cosmetic — visible during step 2 of the wizard, which is fine; visible during success state, which is slightly noisy and worth fixing in v.next); (b) the tour overlay does not capture pointer events, so a determined click can pass through the dimmed scrim and navigate away mid-tour (low-impact, no real attack surface, not worth fixing).

No defects in the tour itself. The hoisting / cache-hydration / handler-cleanup / PRM-gate / position-clamp paths are all clean.

---

## Findings

### Feature 1: `_gamStatusBarTour()` location — **PASS**

**Evidence:**

- `modtools.js:28633-28798` — `function _gamStatusBarTour() { … }`.
- Position: **immediately after** the v10.14.4 auto-unsticky CS scanner IIFE (closes L28625) and **before** the outer-IIFE close at L28802. Matches the spec ("at the bottom of the outer IIFE").
- Outer IIFE opens at `modtools.js:24` `(function () {` and closes at `modtools.js:28802` `})();`. The tour function is a `function` declaration (not an expression), so JS hoists it to the top of the outer-IIFE function scope. **The auto-trigger at L20980 can call `_gamStatusBarTour()` directly despite source order** — hoisting is correct.
- `window.__gamStatusBarTour = _gamStatusBarTour` is set at L28800 (inside the outer IIFE, just before its close). Visible from popup-side / external callers.

**Conclusion:** Correct placement and correct hoisting. No "function not defined" race.

---

### Feature 2: Auto-trigger 2s after status-bar mount, gated by `gam_tour_seen_v1` — **PASS**

**Evidence:**

- `modtools.js:20969` — `document.body.appendChild(bar);` (status-bar mounts).
- `modtools.js:20978-20982` — auto-trigger:
  ```javascript
  try {
    if (!getSetting('gam_tour_seen_v1', false)) {
      setTimeout(function() { try { _gamStatusBarTour(); } catch (_) {} }, 2000);
    }
  } catch (_) {}
  ```
- Gate fallback is `false` (fresh install → `getSetting` returns `false` → `!false` is truthy → tour fires).
- After Done, `setSetting('gam_tour_seen_v1', true)` is called at L28779; subsequent page-loads read `true` → `!true` is falsy → tour doesn't fire.

**Cache-hydration race assessment (NOT A DEFECT):**

`gam_settings` is in `SENSITIVE_KEYS` (`modtools.js:2247-2255`), so `getSetting` routes through `__syncMemGet` (`modtools.js:2659`), which reads from `__memStore` (a synchronous in-memory `Map`). `__memStore` is hydrated by `hydrateFromChromeStorage()` at `modtools.js:4887`. **Critical observation:** the bar mount path runs inside `init()` (`modtools.js:26774`), which `await`s `hydrateFromChromeStorage()` at L26778 BEFORE proceeding. By the time the bar is appended (much later in init), the cache is hot. The 2s timeout adds 2000 ms more cushion. **No race.**

---

### Feature 3: 7 stops — **PASS** (with note on MODMAIL selector resolution)

**Evidence:**

`modtools.js:28642-28657` declares the 7 stops in the documented order:

1. SHIELD — `#gam-status-bar .gam-bar-brand` → matches `modtools.js:20645` (`cls:'gam-bar-brand gam-bar-icon-brand'`).
2. GEAR — `#gam-status-bar [title="Settings"]` → matches `modtools.js:20674` (`title:'Settings'`).
3. MOD LOG — `#gam-status-bar [title^="Mod log"]` → matches `modtools.js:20901` (`title:'Mod log + Death Row queue …'`).
4. MODMAIL — `#gam-mm-trigger, #gam-status-bar [title^="Modmail"]`. Resolves to **either** `#gam-mm-trigger` (only present on `/modmail/thread/…` and `/messages/…` pages per the `IS_MODMAIL_READ` gate at `modtools.js:20614`) **OR** to `#gam-bar-inbox` at `modtools.js:20823` (which has `title:'Modmail inbox — click to open chat panel'` and is present universally). The title-prefix fallback means the MODMAIL stop resolves on essentially all pages, not just modmail-thread pages.
5. HELP — `#gam-status-bar [title^="Keybinds"]` → matches `modtools.js:20905` (`title:'Keybinds + commands cheatsheet (Ctrl+Shift+H)'`).
6. MOD CHAT — `#gam-mc-badge` → matches `modtools.js:17542`.
7. TICKER — `#gam-bar-ticker` → matches `modtools.js:20687`.

Resolution loop at `modtools.js:28659-28667` uses `bar.querySelector(sel) || document.querySelector(sel)` — bar-scoped first, document-wide fallback. Missing icons are dropped silently via the `if (target) resolved.push(...)` filter. If zero icons resolve, the tour aborts at L28667 (`if (!resolved.length) return`).

**Documentation drift (minor):** The commit message says MODMAIL appears as stop 4 "panel auto-mounts" — that text matches the tooltip card body but doesn't communicate that the icon is `#gam-bar-inbox` on most pages, not `#gam-mm-trigger`. The tour works correctly on all pages where any bar icon is present; this is purely a doc-vs-code wording mismatch. Not a defect.

---

### Feature 4: Spotlight + 340px tooltip card + Skip/Next/Done buttons — **PASS**

**Evidence:**

- Spotlight class injected once at `modtools.js:28689-28707` via `<style id="gam-tour-style">`; `.gam-tour-spotlight` rule at L28694 (`outline:2px solid #ff9933; box-shadow:0 0 0 9999px rgba(5,5,7,0.72)` — the 9999px box-shadow scrim is the "spotlight" technique).
- Spotlight applied at L28723 via `step.el.classList.add('gam-tour-spotlight')` and removed at L28717 before re-applying on next step.
- Tooltip card: `#gam-tour-card` styled at L28695 (`position:fixed; max-width:340px; …`). Created/reused at L28728 (`document.getElementById('gam-tour-card') || document.createElement('div')`).
- Card content at L28731-28740: includes label + step counter ("N of M"), tour text (set via `textContent` at L28743 to avoid HTML-escape pitfalls — correctly defensive), meta line ("Press ESC to skip · → for next"), and the row of action buttons.
- Buttons: `#gam-tour-skip` (always present), `#gam-tour-next` (when not last), `#gam-tour-done` (when last). Conditional last-step swap at L28737-28739 via `isLast = idx === resolved.length - 1`. All three buttons have `min-height:32px` (rule at L28700) — WCAG 2.5.5 target size satisfied.
- Position-clamping at L28748-28760: card placed 16 px above target, falls back to 16 px below if `top < 8`, left clamped to `[8, window.innerWidth - cardW - 8]`. The catch block at L28758 falls back to centered. **Bloomberg discipline-level robust**.

---

### Feature 5: Keyboard — ESC = skip, ArrowRight = next — **PASS**

**Evidence:**

- `modtools.js:28784-28791` — `_keyHandler`:
  ```javascript
  function _keyHandler(e) {
    if (e.key === 'Escape') { e.preventDefault(); _closeTour(false); return; }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (idx < resolved.length - 1) { idx++; _renderStep(); }
      else _closeTour(true);
    }
  }
  document.addEventListener('keydown', _keyHandler, true);
  ```
- Capture phase (`true`) — fires before any descendant page handlers, ensuring ESC and ArrowRight are consumed by the tour while it's open.
- ESC calls `_closeTour(false)` — does NOT mark seen → tour will re-fire on next page-load (matches commit-message intent).
- ArrowRight on last step calls `_closeTour(true)` — DOES mark seen.
- **Cleanup at L28777**: `document.removeEventListener('keydown', _keyHandler, true)` runs unconditionally inside `_closeTour`. Listener is referenced by name (function declaration hoisted inside `_gamStatusBarTour`), so `removeEventListener` correctly matches the registered reference. **No leak.**
- Re-entry guard at L28635 (`if (document.getElementById('gam-tour-overlay')) return`) prevents a second tour invocation from stacking up another keyhandler.

**ArrowRight capture caveat (NOT A DEFECT):** Capture-phase preemption means a page element with its own ArrowRight handler (e.g., a slider or carousel) cannot receive ArrowRight while the tour is open. In practice the user is interacting with the tour, not the page beneath the dark scrim. Low risk.

---

### Feature 6: PRM gate — **PASS**

**Evidence:**

- `modtools.js:28682-28686`:
  ```javascript
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      overlay.style.animation = 'none';
    }
  } catch (_) {}
  ```
- Overlay default animation is `gam-tour-fade-in 200ms ease-out` (set inline at L28678). Reduce-motion users get `animation:none` instead. Keyframes injected at L28693 (`@keyframes gam-tour-fade-in{from{opacity:0}to{opacity:1}}`).
- Spotlight outline and card placement do not use animation, only the overlay's fade-in. PRM-correct: a user with reduced-motion preference sees an instant appearance, no transition.

**Bloomberg motion-charter compliance: PASS.**

---

### Feature 7: GEAR replay row — **PASS**

**Evidence:**

- `modtools.js:11863-11880` — the replay row inside the Display section (`addSection('🖥️ Display')` opens at L11851).
- Label: `<label class="gam-settings-lbl">Status-bar tour</label>` (L11867).
- Description: `<div class="gam-settings-desc">Replay the 7-stop first-run orientation tour…</div>` (L11868).
- Button: `<button class="pop-btn pop-btn-ghost" id="gam-replay-tour-btn" style="min-height:32px; …">Replay</button>` (L11870).
- Click handler at L11871-11878:
  ```javascript
  _tourRow.querySelector('#gam-replay-tour-btn').addEventListener('click', function() {
    try { closeSettings && closeSettings(); } catch (_) {}
    try {
      if (typeof window.__gamStatusBarTour === 'function') {
        setTimeout(function() { window.__gamStatusBarTour(); }, 200);
      }
    } catch (_) {}
  });
  ```

**Defensive `closeSettings()` before tour:** the replay path closes the settings modal first, so the tour's spotlight isn't obscured by an open modal. The auto-trigger path doesn't need this guard because the 2s timer fires before any user-initiated panel is realistically open. **Correct asymmetric defense.**

**Section placement note:** the commit message states "at the top of the GEAR Display section." Actually the row is added **at the end** of the Display section (after `Hide Sidebar`, `Sus Marker`, `Theme Harmony`, `Mail Hover Highlight` toggles at L11852-11859, and right before `addSection('⚡ Moderation')` at L11882). Cosmetic / non-blocking.

---

### Feature 8: `window.__gamStatusBarTour` exposed — **PASS**

`modtools.js:28800` — `try { window.__gamStatusBarTour = _gamStatusBarTour; } catch (_) {}`. Inside the outer IIFE, just before its close at L28802. Exposed to popup-side code, GEAR replay button, and any future hook.

---

### Feature 9: `setSetting('gam_tour_seen_v1', true)` on Done — **PASS**

**Evidence:**

- Done button click handler (L28768) → `_closeTour(true)`.
- ArrowRight on last step (L28789) → `_closeTour(true)`.
- `_closeTour(true)` at L28778-28780: `if (markSeen) { try { setSetting('gam_tour_seen_v1', true); } catch (_) {} }`.

Skip path (`_closeTour(false)`) and ESC path (`_closeTour(false)`) both skip the `setSetting` call → tour will re-fire next page-load. Matches documented intent ("Skip closes without marking seen").

---

### Feature 10: `<details id="firstRunInstallAccordion">` inside `#tokStateFirstRun` — **PARTIAL**

**Evidence:**

- `popup.html:541-577` — the `<details>` block with the 3 sections (Manual ZIP, Drive, Troubleshooting).
- `popup.html:493` — `#tokStateFirstRun` container opens.
- `popup.html:598` — `#tokStateFirstRun` container closes.

**Defect 10A — accordion is mid-container, not at the bottom:**

Commit `3d79e22` body claims the accordion is "at the bottom of `#tokStateFirstRun` in popup.html." The accordion sits at L541-577, but the success-state block `#firstRunWizardSuccess` is at L580-597 — i.e. the accordion is **above** the success block, **between** `#firstRunWizardStep2` (the path-2 form, ends L533) and the success state.

**Practical impact:**

`popup.js` `__tokSetState('first-run')` toggles the entire `#tokStateFirstRun` container's `display`, not its children. So:

- **Path-picker view (default State A):** path buttons + claim CTA visible; step-2 wizard hidden; success block hidden; **accordion visible** — correct.
- **Step-2 view (after path button click):** `showStep(2)` at `popup.js:3550-3565` hides `.tok-path-row`, `.tok-path-divider`, `#claimInviteBtn`, `#claimInviteStatus`; shows `#firstRunWizardStep2`; **does NOT touch `#firstRunInstallAccordion`** → accordion stays visible below the step-2 form. Reasonable (still useful for "where do I get this token" lookups while pasting). Non-blocking.
- **Success view (after successful claim):** `showStep(3)` shows `#firstRunWizardSuccess`, hides path-row + step-2; **does NOT touch the accordion** → accordion is still visible BELOW the green success banner + "Open greatawakening.win" CTA + "Done — close setup" button. **This is visually noisy** — the user has authenticated, the install help is no longer relevant, but the accordion still occupies space. Mild UX issue, not blocking.

**Fix for v.next (one-line in `popup.js`):** in `showStep(n)` at `popup.js:3550-3565`, add `const accord = document.getElementById('firstRunInstallAccordion'); if (accord) accord.style.display = (n === 3) ? 'none' : '';` so success state hides the accordion. Adding this to `__tokSetState` or the success-mount path is also fine.

---

### Feature 11: 3 sections — **PASS**

**Evidence:**

- **Recommended: Manual ZIP** — `popup.html:549-558`. Numbered list (`<ol>`) with **7** `<li>` items: save ZIP to stable folder → unzip → `chrome://extensions/` → Developer mode → Load unpacked → puzzle-pin → return + paste token. **Step count: 7 ✓**
- **For auto-updates: Google Drive** — `popup.html:560-568`. Numbered list (`<ol>`) with **6** `<li>` items: Drive Desktop install → folder share → File Explorer locate → Available-offline → load-unpacked-from-Drive → auto-updates. **Step count: 6 ✓**
- **Troubleshooting** — `popup.html:570-575`. Unordered list (`<ul>`) with **3** `<li>` items: manifest-missing error / Brave Shields gotcha / fallback to lead DM + full INSTALL.md link.

---

### Feature 12: Collapsed by default — **PASS**

`popup.html:541` — `<details id="firstRunInstallAccordion" style="…">`. **No `open` attribute.** Native `<details>` default state is collapsed; first open-toggle is user-initiated.

**State persistence (Hunt-Q4 answer):** The accordion's open/closed state is held in the DOM only. When the popup closes, the Chrome popup destroys its DOM. When the user reopens the popup, fresh HTML loads from `popup.html` → accordion is collapsed again. **No memory between popup-open sessions.** This is fine for the typical State-A user (claim flow is short; accordion is reference material; collapsed-by-default keeps the claim CTA prominent), but worth flagging as expected behavior.

---

### Feature 13: Native `<details>/summary` — **PASS**

`popup.html:541` opens `<details>`, `popup.html:542` opens `<summary>`. Both native HTML elements. No JS state, no `aria-expanded` (the native element manages this automatically). Keyboard support (Space/Enter to toggle on summary) is built-in. Screen-reader announcements for expanded/collapsed are built-in.

---

### Feature 14: `min-height:32px` on summary — **PASS**

`popup.html:542` — `<summary style="…; min-height:32px; box-sizing:border-box">`. WCAG 2.5.5 target size (44 × 44 minimum ideal, 32 minimum acceptable per Chrome Mod Tools' established target). The summary spans full width of the accordion (`display:flex; justify-content:space-between`).

---

### Feature 15: Brave + manifest links — **PASS**

- **Brave Shields note:** `popup.html:573` — "Brave users: Brave Shields may strip the `?mt_invite` URL parameter. Use the Raw token path above instead, or lower Shields for greatawakening.win."
- **Full INSTALL.md link:** `popup.html:574` — `<a href="https://raw.githubusercontent.com/catsfive1/gaw-mod-shared-flags/main/INSTALL.md" target="_blank" rel="noopener noreferrer">full install guide</a>`. `rel="noopener noreferrer"` for new-tab safety.
- **Manifest-error note:** `popup.html:572` — '"Manifest file is missing or unreadable" → wrong folder selected. Pick the one with `manifest.json` directly inside.' Matches the most common Load-unpacked failure mode.
- **Drive Desktop link:** `popup.html:562` — `<a href="https://drive.google.com/drive/download" target="_blank" rel="noopener noreferrer">drive.google.com/drive/download</a>`. Bonus link not called out in the brief; nice to have.

---

## Hunt-list answers

### Q1 — Tour: popover already open when tour fires?

**Auto-trigger path:** the 2s timer fires before any user-initiated panel can realistically be open. Worst case is an auto-mounted mod-chat panel from a prior session (z-index 9999988) or a hot-now panel; **the tour overlay (z-index 9999998) and spotlight/card (9999999) layer on top**, so the tour visually wins, but **the spotlight target might be visually obscured by the overlapping panel** because the panel is z-stacked above the bar (bar z-index = 9999980 < panel z-index = 9999988). User sees the dark scrim and the spotlight outline on the bar icon, but if the panel covers that bar region, the outline is hidden behind the panel.

**Replay path:** `closeSettings()` is called explicitly at `modtools.js:11872` before re-firing the tour — but only `closeSettings`, not all panels. If the user opens the GEAR settings WHILE the mod-chat panel is also open and clicks Replay, the settings close but the chat panel remains.

**Severity:** low. The auto-trigger window (2s after bar mount) is short; the replay path is operator-controlled. **Not blocking.** A defensive fix would call `closeAllPanels()` at the top of `_gamStatusBarTour()`, but `closeAllPanels()` has side effects (cleanup hooks for other panels) that might be undesirable. Status quo is acceptable.

### Q2 — Tour: scroll during the tour — does the tooltip card follow?

**No re-position on scroll.** The card is positioned via `position:fixed; left:Xpx; top:Ypx` once per step at `_renderStep()` (L28748-28760), calculated from `target.getBoundingClientRect()`. There is no `scroll` listener.

**Why this is fine:** The status bar is `position:fixed; bottom:14px` (`modtools.js:22062`). Its viewport position is invariant under scroll. The bar's `getBoundingClientRect()` returns the same coordinates at any scroll position. The tour card, also `position:fixed`, anchored above the bar by 16 px, also stays put. Scrolling the page beneath does not move the bar OR the card. **Tour positioning is correct for any scroll position.**

Note: the page CAN scroll beneath the dark overlay (overlay does not capture wheel events; no `overflow:hidden` set on `body`). Content under the scrim moves; tour scaffolding does not. Visually consistent.

### Q3 — Tour: keyboard handler properly removed?

**Yes — clean cleanup, no leak.**

Evidence summary:
- Handler registered ONCE at L28792 with `capture:true`.
- Handler is a named `function _keyHandler(e) { … }` declared inside `_gamStatusBarTour` scope. Reference stays stable for `removeEventListener`.
- `_closeTour()` at L28777 calls `document.removeEventListener('keydown', _keyHandler, true)`. Both phase-flag and reference match the registration → cleanup succeeds.
- All exit paths (Skip click, Next-on-last-step ArrowRight, Done click, ESC) route through `_closeTour()`.
- Re-entry guard at L28635 prevents stacking a second handler.

### Q4 — Accordion: open-state persistence across popup-close/reopen?

**No persistence by design.** Native `<details>` open state is held in the DOM; Chrome's popup destroys its DOM on close. On reopen, fresh `popup.html` parses and the accordion is collapsed again (no `open` attr at L541).

If persistence were wanted, the fix is ~10 lines of JS: `addEventListener('toggle', …)` on the `<details>`, write `chrome.storage.local.set({ gam_install_accordion_open: details.open })`, and read it at popup-init to apply `details.open = stored`. **Not in scope; the collapsed-default behavior is appropriate for State A's claim-CTA-prominent intent.**

### Q5 — Accordion: inline `style="..."` violations per Bloomberg discipline?

**~25 inline `style="..."` attributes across the accordion block (L541-577).** All declarations are presentational (margin, padding, font, color, border, etc.); no behavior depends on them.

**Verdict: matches existing convention, not a real violation.** `popup.html` has 126 `style=` attributes total (verified via grep). The codebase has clearly chosen inline-style for the popup template. The CONTENT script (`modtools.js`) does use class-based CSS via injected `<style>` blocks (e.g., the tour itself injects `<style id="gam-tour-style">` at L28689-28707 — proper discipline there). The popup template was authored under a different convention and the accordion follows it.

**Refactor opportunity (low priority, v.next):** extract the accordion's style into a `<style>` block in `popup.html`'s `<head>` (or a class set, since popup.html already loads CSS via `popup.css`). Estimated diff: ~60 lines (one rule per inline declaration). Benefit: ~30 fewer bytes per render, easier theming, easier audit. Not worth blocking on.

---

## Cross-cutting observations (read-only — not deficiencies)

### Observation 1 — Overlay doesn't capture pointer events

`overlay.style.cssText` at L28674-28679 sets only background + position + z-index + font. **No `pointer-events`**. Default is `auto` for divs, BUT the spotlight target's z-index (9999999, via `.gam-tour-spotlight`) is HIGHER than the overlay's (9999998), so the spotlighted element IS clickable through the overlay — which is what the tour intends (the user can click the icon being highlighted if curious). However, **non-spotlighted page elements are NOT shielded**: a click on the page (outside the spotlight) lands on whatever's at that x/y under the overlay because the overlay's pointer-events default lets clicks pass through transparent dark scrim. Actually wait — `pointer-events:auto` on a fixed-position div with rgba(5,5,7,0.72) does INTERCEPT clicks. The dark scrim catches clicks; they don't pass through.

**Confirmed via spec:** `position:fixed; top:0; left:0; right:0; bottom:0` covers the viewport. The overlay catches clicks except where higher-z-index elements (spotlight, card) sit on top. **Clicks anywhere on the dimmed background land on the overlay div, which has no click handler → silently absorbed.** Cannot click through to page elements. **This is good behavior — operator stays on-rails during the tour.**

**Minor nit:** clicking the dimmed area doesn't dismiss the tour (no overlay click handler). Many tour libraries do "click-outside dismisses." Status-bar tour doesn't. Operator must use Skip / Done / ESC. Documented in the meta line ("Press ESC to skip · → for next") so discoverable.

### Observation 2 — Tour replay row added at end of Display section, not top

Commit message says "the top of the GEAR Display section." Actually the row is at L11863-11880, AFTER the four toggles that comprise the rest of Display (Hide Sidebar / Sus Marker / Theme Harmony / Mail Hover Highlight at L11852-11859) and BEFORE the Moderation section (`addSection('⚡ Moderation')` at L11882). Discovery slightly weaker than "top" but still very findable. Cosmetic.

### Observation 3 — Skip path's "re-fire forever" behavior is intended

Commit message: "Skip tour] (closes without marking seen) … [Done — don't show again] (closes + setSetting gam_tour_seen_v1)". Confirmed: Skip path goes through `_closeTour(false)` at L28764, which does NOT set the seen flag. **Operator who skips → tour fires again next page-load → operator skips again → repeats.** Eventually the operator clicks Done. This is the intended pattern (analogous to GitHub's "OK, got it" vs "Don't show me this again" UX) but could read as annoying.

**Not a defect.** Documented intent. The Done button is labeled "Done · don't show again" with the explicit promise.

### Observation 4 — `setSetting` is sync-write through to `chrome.storage.local`

`gam_settings` is in `SENSITIVE_KEYS` → `setSetting` routes through `__syncMemSet` (`modtools.js:2663`) which writes to `__memStore` synchronously, then fires-and-forgets `chrome.storage.local.set` (L2666-2670). After Done, the next `getSetting('gam_tour_seen_v1')` in the same session reads `true` from RAM — no race. Cross-tab propagation depends on `chrome.storage.onChanged`, which is wired elsewhere (`modtools.js` listens for it for various keys).

---

## Recommendations

### v10.16 — Fix Defect 10A (accordion visible on success state)

`popup.js:3550-3565` `showStep(n)` — add:

```javascript
const accord = document.getElementById('firstRunInstallAccordion');
if (accord) accord.style.display = (n === 3) ? 'none' : '';
```

at the end of the function. On successful claim (step 3), the install accordion hides. On Re-run-setup, `showStep(1)` restores it. ~3 lines. Removes the only mild UX-debt finding from this audit.

### v10.16+ — Optional: dismiss-on-overlay-click for tour

`modtools.js:28709` — add `overlay.addEventListener('click', function(e) { if (e.target === overlay) _closeTour(false); });` to allow click-outside-card to skip the tour. Matches operator expectation from other tour libraries. **Not blocking;** ESC and Skip button cover the intent.

### v10.16+ — Optional: rewrite accordion inline styles to classes

`popup.html:541-577` — extract the ~25 inline `style=` to a `<style>` block in `popup.html`'s head, or to `popup.css` (if extant). Reduces page weight and matches discipline used by the content script. **Cosmetic;** not blocking.

### Documentation drift in commit messages (informational)

- `a1ae76b`: "Replay button at the top of the GEAR Display section" — actually at the **end**. (`modtools.js:11863`.)
- `3d79e22`: accordion "at the bottom of `#tokStateFirstRun`" — actually **mid-container**, above the success-state block. (`popup.html:541` vs `#firstRunWizardSuccess` at L580.)

Both are cosmetic doc-vs-code drifts. Useful for future-search to align.

---

## File:line evidence index

| What | Where |
|---|---|
| `_gamStatusBarTour()` function definition | `modtools.js:28633-28798` |
| Outer IIFE open/close | `modtools.js:24` / `modtools.js:28802` |
| `window.__gamStatusBarTour` export | `modtools.js:28800` |
| Auto-trigger 2s after bar mount | `modtools.js:20978-20982` |
| Bar mount (`appendChild`) | `modtools.js:20969` |
| Tour 7 stops definition | `modtools.js:28642-28657` |
| SHIELD target site | `modtools.js:20645` |
| GEAR target site | `modtools.js:20674` |
| MOD LOG target site | `modtools.js:20901` |
| MODMAIL trigger (conditional) | `modtools.js:20614-20617` |
| MODMAIL inbox (universal fallback) | `modtools.js:20823-20828` |
| HELP target site | `modtools.js:20905` |
| MOD CHAT target site | `modtools.js:17542` |
| TICKER target site | `modtools.js:20687` |
| Tour overlay creation | `modtools.js:28669-28679` |
| PRM gate | `modtools.js:28682-28686` |
| Injected CSS (`<style id="gam-tour-style">`) | `modtools.js:28689-28707` |
| Spotlight class application | `modtools.js:28723` (add) / `modtools.js:28717, 28773` (remove) |
| Card creation + 340px max-width rule | `modtools.js:28695, 28728` |
| Card content (label / text / buttons) | `modtools.js:28731-28740` |
| `textContent` for tour text (XSS-safe) | `modtools.js:28743` |
| Card positioning + viewport clamp | `modtools.js:28748-28760` |
| Skip / Next / Done button wiring | `modtools.js:28763-28768` |
| `_closeTour` cleanup | `modtools.js:28771-28782` |
| Listener removal | `modtools.js:28777` |
| `setSetting('gam_tour_seen_v1', true)` on Done | `modtools.js:28779` |
| ESC + ArrowRight handler | `modtools.js:28784-28792` |
| Re-entry guard | `modtools.js:28635` |
| Bar absence retry | `modtools.js:28637` |
| Empty-resolved abort | `modtools.js:28667` |
| GEAR replay row | `modtools.js:11863-11880` |
| `closeSettings` defensive call | `modtools.js:11872` |
| `getSetting`/`setSetting` definitions | `modtools.js:1970-2042` |
| `__syncMemGet` (sync RAM read for sensitive keys) | `modtools.js:2659-2662` |
| `gam_settings` in `SENSITIVE_KEYS` | `modtools.js:2247-2255` |
| `hydrateFromChromeStorage` awaited in `init()` | `modtools.js:26778` |
| `#firstRunInstallAccordion` block | `popup.html:541-577` |
| `#tokStateFirstRun` container | `popup.html:493-598` |
| `#firstRunWizardSuccess` block (after accordion) | `popup.html:580-597` |
| Manual ZIP `<ol>` (7 items) | `popup.html:550-558` |
| Drive `<ol>` (6 items) | `popup.html:561-568` |
| Troubleshooting `<ul>` (3 items) | `popup.html:571-575` |
| Brave Shields note | `popup.html:573` |
| INSTALL.md link | `popup.html:574` |
| Drive Desktop link | `popup.html:562` |
| Summary `min-height:32px` | `popup.html:542` |
| `__tokSetState` (container show/hide) | `popup.js:210-218` |
| `showStep(n)` (child visibility — does NOT touch accordion) | `popup.js:3550-3565` |
| Bar `position:fixed` (why scroll-position is moot for tour) | `modtools.js:22062` |
| Status-bar z-index | `modtools.js:22062` (9999980) |
| Mod chat panel z-index | `modtools.js:16679` (9999988) |
| Tour overlay z-index | `modtools.js:28676` (9999998) |
| Tour spotlight + card z-index | `modtools.js:28694, 28695` (9999999) |
| Parse check | `node --check modtools.js` → PARSE OK |

---

**End of QA-A2.**
