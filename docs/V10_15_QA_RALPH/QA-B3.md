# QA-B3 — v10.15.x Cross-cutting Regression Sweep (Read-only)

**Auditor:** Claude (QA-B3 read-only mode)
**Date:** 2026-05-12
**Repo:** `D:\AI\_PROJECTS\modtools-ext\`
**HEAD at audit:** `9eaec32` (v10.15.5)
**Scope:** Cross-cutting sweep across all 15 features shipped v10.14.5..v10.15.5; interaction effects, worker contract sanity, CSS specificity, PRM coverage, mobile viewports, prior-PASS invalidation.
**Iteration 1 references:** QA-A1..A5, QA-B1, QA-B2 already exist alongside this file.

**Parse-check:** `node --check modtools.js` → PARSE OK; `popup.js` → PARSE OK; `background.js` → PARSE OK.

---

## Executive summary

Eight cross-cutting defects/interaction effects found, of which **two are P1 (real keyboard-a11y / behavior regressions introduced by v10.15.5's own hotfix surface)** and the remaining six are P2/P3 (edge-case, theoretical, or pre-existing-but-newly-relevant).

| # | Severity | Title | Where |
|---|---|---|---|
| **R1** | **P1** | **Mod Chat panel focus trap dies on 2nd open** — v10.15.5 fix introduces "first close works, subsequent opens have no trap" | modtools.js:17249, 17536-17546 |
| **R2** | **P1** | **Hot-Now panel cleanup invocation still missing** — QA-A4 P1 gap NOT closed by v10.15.5 | modtools.js:11587-11593 |
| R3 | P2 | `_mcKbHandler` lacks sub-modal guard — ESC on askText opened from Mod Console fires BOTH handlers | modtools.js:8526, 2962 |
| R4 | P2 | Asymmetric a11y after v10.15.5: trap installs unconditionally, but askText/Park `role="dialog"`/`aria-modal` still gated on `__uxOn()` | modtools.js:2897, 3755 |
| R5 | P2 | Duplicate `installFocusTrap` on Mod Console (`showModal` + `openModConsole`) — two listeners, redundant work | modtools.js:7875, 8442 |
| R6 | P3 | AI rate limiter theoretical race: burst arriving during dequeue-microtask can transiently exceed 3-concurrent cap | modtools.js:24681-24704 |
| R7 | P3 | Tour overlay shares `z-index:9999999` with snack toast + brave banner — visual layering inversion in rare timing collisions | modtools.js:28747-28748, 7373, 7656, 21751 |
| R8 | P3 | ESC double-fire interaction: snack-action ESC + tour ESC both consume same keydown (capture, same target) | modtools.js:7796, 28845 |

**No P0 defects found.** All 15 v10.15.x features are functionally present; the regression layer is in interaction effects and incomplete v10.15.5 hotfix coverage.

**Worker RPC contract sanity:** PASS. None of `modAutoActionRecent`, `modSusMark`, `adminSettingsWrite`, `autoUnstickyScanReport` are affected by v10.15.x changes. The only RPC layer change is the new client-side rate-limit wrapper on `modmailAiReplyForThread` (gate is name-equality scoped; all other names short-circuit at the first check at modtools.js:24688).

**CSS specificity battles:** PASS. v10.15.x added zero new `!important` declarations (`git diff c8276dc..HEAD -- modtools.js | grep '^+' | grep important` → empty). The new `gam-mc-quick-group` / `gam-mc-quick-header` rules at modtools.js:21890-21892 are stand-alone class selectors that don't compete with any prior `!important`.

**PRM coverage:** PASS. The only animation introduced in v10.15.x is the tour overlay fade-in at modtools.js:28731 (`animation:gam-tour-fade-in 200ms ease-out`), and it's PRM-gated at modtools.js:28735-28739 (suppresses animation when `prefers-reduced-motion: reduce`). No other v10.15.x animation slipped through.

**Mobile/narrow viewport (<720px):** PASS-WITH-NUANCE. The status-bar tour card has `max-width:340px` with viewport-clamp logic at modtools.js:28807 — works at all viewports. The install accordion is responsive within the fixed 520px Chrome popup (no responsive concerns). QUICK category grouping flows naturally inside the Mod Console (which already has `@media (max-width:720px)` rule at modtools.js:16766 setting panel width to `100vw`). One narrow-viewport observation surfaced below as N1 but no defect.

**Prior PASS verdict invalidation:** None. v10.15.5 removal of `__uxOn()` from `installFocusTrap` (modtools.js:4185-4195) actually *strengthens* the v10.13 RALPH-FOCUS-TRAPS audit's PASS verdicts because those verdicts had assumed the trap was active for the surfaces marked PASS, when in reality the trap was silently no-op for default-config users (uxPolish defaults to false). Post-v10.15.5 the trap installs unconditionally — the PASS verdicts now match reality. **No regression.**

---

## Regression findings (severity-ranked)

### R1 — P1 — Mod Chat panel focus trap dies on 2nd open

**Where:** `modtools.js:17249-17250` (buildPanel early-return) + `modtools.js:17536-17546` (closePanel after v10.15.5 hotfix).

**What happens:**

1. First open of Mod Chat panel: `buildPanel()` creates `STATE.panelEl`, installs trap at line 17457, stores cleanup at `STATE._focusTrapCleanup`. Tab cycle works.
2. First close: v10.15.5 closePanel hotfix at line 17542 invokes cleanup → restores focus to `prevActive` (the badge button) → sets `STATE._focusTrapCleanup = null`. Tab listener detached from panel.
3. **Second open: `buildPanel()` early-returns at line 17250 because `STATE.panelEl` is set (panel was hidden via CSS class, NOT removed from DOM). `installFocusTrap` is NOT called again. `STATE._focusTrapCleanup` remains null.**
4. Tab inside the re-opened panel: no trap → Tab leaks into page DOM.
5. Second close: `STATE._focusTrapCleanup` is null → focus restoration is no-op.

**Why this is a regression introduced by v10.15.5:** Pre-v10.15.5, cleanup was never invoked (the QA-A4 gap), so the listener stayed bound across open/close cycles. The trap "worked" forever (same single listener serving every open). v10.15.5 wired the cleanup at close, which CORRECTLY removes the listener — but didn't add a corresponding re-install at re-open. Net: pre-fix trap-always-on with no focus-restore; post-fix trap-once-then-broken.

**Fix shape (NOT implemented — read-only QA):**

```js
function closePanel(){
  if (!STATE.panelEl) return;
  try { if (typeof STATE._focusTrapCleanup === 'function') STATE._focusTrapCleanup(); STATE._focusTrapCleanup = null; } catch (_) {}
  STATE.panelEl.classList.remove('gam-mc-open');
  stopAllPolling();
  startClosedPolling();
}

async function openPanel(){
  // ... existing code through buildPanel ...
  // v10.15.6: re-install trap on every open (buildPanel short-circuits on reuse,
  //   but trap was disposed by previous closePanel).
  if (STATE.panelEl && !STATE._focusTrapCleanup) {
    try { STATE._focusTrapCleanup = installFocusTrap(STATE.panelEl) || null; } catch(_){}
  }
  // ... rest of openPanel ...
}
```

**Impact:** Default-config keyboard mods (now all of them post-v10.15.5) get full a11y on the FIRST Mod Chat session per page-load, then degraded a11y on subsequent opens until refresh. Mods typically open chat multiple times per shift. Real impact.

---

### R2 — P1 — Hot-Now panel cleanup invocation still missing

**Where:** `modtools.js:11587-11593` (`_closeHotNowPanel`).

**What happens:** v10.15.5 hotfix surface explicitly addressed Mod Chat (R10) and Modmail full panel (R11) cleanup invocation, but **left Hot-Now (R12) unchanged**.

```js
function _closeHotNowPanel() {
  const hnPanel = document.getElementById('gam-hot-now-panel');
  if (!hnPanel) return;
  hnPanel.classList.remove('gam-hn-open');
  setTimeout(function() { if (hnPanel.parentNode) hnPanel.remove(); }, 180);
  panelOpen = null;
  // ^^ NO _gamHnFocusTrapCleanup() invocation
}
```

The cleanup stored at `hnPanel._gamHnFocusTrapCleanup` (modtools.js:11483) is **never invoked**. The 180ms setTimeout removal of the panel severs the trap's `keydown` listener naturally (DOM detach), so there's no listener leak, but **focus is NEVER restored to the trigger (the SIREN button)** when Hot-Now closes.

**Severity rationale:** QA-A4 audit clearly identified this gap (B.3, D.2) with line-precise fix shape. v10.15.5 acknowledged QA-A4 but addressed only 2 of 3 named gaps. Hot-Now was the loudest of the three (QA-A4 D.2 marked it explicitly as P1; SIREN/Hot-Now is one of the most-used keyboard surfaces).

**Fix shape (per QA-A4 D.2):**

```js
function _closeHotNowPanel() {
  const hnPanel = document.getElementById('gam-hot-now-panel');
  if (!hnPanel) return;
  try { if (typeof hnPanel._gamHnFocusTrapCleanup === 'function') hnPanel._gamHnFocusTrapCleanup(); } catch (_) {}
  hnPanel.classList.remove('gam-hn-open');
  setTimeout(function() { if (hnPanel.parentNode) hnPanel.remove(); }, 180);
  panelOpen = null;
}
```

Two lines. Should have been in v10.15.5.

**Note on cascading:** `closeAllPanels()` (modtools.js:7497-7524) also doesn't reach Hot-Now because `#gam-hot-now-panel` is not in its SEL set. So even when ANOTHER panel triggers `closeAllPanels`, Hot-Now's cleanup still doesn't fire. The fix has to live in `_closeHotNowPanel` directly.

---

### R3 — P2 — `_mcKbHandler` lacks sub-modal guard for askText / nested panels

**Where:** `modtools.js:8526` (Mod Console ESC branch) + `modtools.js:2962-2967` (askText onKey) + `modtools.js:7857` (showModal escHandler asktext guard, present here but NOT in _mcKbHandler).

**Interaction trace:**

1. User opens Mod Console (showModal at line 7811). showModal's escHandler is registered on document at capture phase.
2. User clicks QUICK action that opens askTextModal (e.g., `data-q="title"` → triggers `askTextModal({...})` at line 10905). askText's `onKey` is registered on document at capture phase, AFTER showModal's handler.
3. `_mcKbHandler` is registered at line 8597 between steps 1 and 2 — ordering: showModal escHandler → `_mcKbHandler` → askText onKey.
4. v10.15.5 fix at line 7864 makes showModal's escHandler skip when `p.id === 'gam-mc-panel'`. Good — showModal stays out of Mod Console's ESC business.
5. **BUT:** `_mcKbHandler` does NOT have the same askText-guard that v10.15.5 added to showModal. When the operator presses ESC inside an askText opened ON TOP of Mod Console:
   - `_mcKbHandler` fires FIRST (registered before askText)
   - Checks Mod Console drafts at line 8528-8531. If any of `#mc-ban-msg` / `#mc-note-body` / `#mc-msg-body` have non-empty trimmed text, it builds the confirm row (preventDefault + stopPropagation).
   - askText's `onKey` is bubble-blocked by `stopPropagation` — BUT `stopPropagation` does NOT block other capture-phase listeners on same target (would need `stopImmediatePropagation`). askText is also capture-phase. **Both handlers fire.**
   - Result: ESC inside askText shows the Mod Console's draft-confirm AND closes askText (or fires askText's `finish(null)`).
   - Operator's intent ("dismiss this prompt") yields a confusing dual effect.

**Why this is real:** The QUICK tab's `title` action chains 3 sequential askText modals (modtools.js:10905, 10922, 10944). If the operator was mid-typing in BAN message before clicking `title`, all three askText prompts trigger the spurious draft-confirm on ESC.

**Severity rationale:** Real, easy-to-trigger interaction effect. Not silent data corruption, just confusing UX. P2 because rare (operator has to be drafting in one Mod Console tab while invoking an askText from another action), and fixable in ~3 lines.

**Fix shape:**

```js
function _mcKbHandler(e){
  if (!mc || !mc.isConnected) return;
  // v10.15.6: if a sub-modal is on top, let it own ESC.
  if (document.querySelector('.gam-v72-asktext, .gam-preflight-wrap')) return;
  // ... rest unchanged ...
}
```

---

### R4 — P2 — Asymmetric a11y after v10.15.5 `__uxOn()` removal

**Where:** `modtools.js:4185-4195` (v10.15.5 removed gate from `installFocusTrap`); BUT `modtools.js:2897, 2924, 3755, 3788, 1430, 1453, 1470, 5949` still gate aria-modal / role=dialog / role=alert / aria-live attributes on `__uxOn()`.

**What happens:**

v10.15.5 removed the `__uxOn()` gate from `installFocusTrap` to fix the silent no-op for default-config users (uxPolish default false). Now the focus trap installs unconditionally — Tab/Shift-Tab cycle works, focus restored on close.

BUT: in `askTextModal` (modtools.js:2897):

```js
const __axPanel = __uxOn() ? { tabindex: '-1', role: 'dialog', 'aria-modal': 'true' } : {};
```

Same pattern at:
- modtools.js:2924 (askText error region, role=alert + aria-live=polite)
- modtools.js:3755 (Park panel, role=dialog + aria-modal + aria-label)
- modtools.js:3788 (Park status region, role=status + aria-live=polite)
- modtools.js:1430 (BugReport body region, role=region + aria-label)
- modtools.js:1453 (BugReport counter, role=status + aria-live=polite)
- modtools.js:1470 (BugReport actions, role=group + aria-label)
- modtools.js:5949 (settings sections, role=region + aria-label)

**Default-config users (uxPolish=false) now get:**
- Focus trap (Tab cycle + restore) — YES, post-v10.15.5
- `role="dialog"` + `aria-modal="true"` — NO, still gated
- Sub-region aria roles — NO, still gated

**Net effect:** Screen-reader users on default-config navigate INTO the trap (focus moves to first focusable on open) but the SR doesn't announce "Dialog: Input required" because the role isn't set. Keyboard-only sighted users get full trap behavior. JAWS/NVDA/VoiceOver users get the focus shift but lose context.

**Severity rationale:** Marginal a11y degradation for SR-only users. The trap fix is more important than the role attrs (operator can still complete the form; SR just lacks the modal context announcement). Worth fixing for symmetry — either remove `__uxOn()` gating from these attribute paths too, OR document the asymmetry. The "lead don't accommodate" judgment per CLAUDE.md §0 is: **remove the gating from all aria sites in v10.15.6** since baseline a11y shouldn't be opt-in.

---

### R5 — P2 — Duplicate `installFocusTrap` on Mod Console

**Where:** `modtools.js:7875` (showModal's install) + `modtools.js:8442` (openModConsole's install).

**What happens:**

`showModal(p)` at line 7875 calls `installFocusTrap(p)` for ALL modals it creates. Then `openModConsole` at line 8442 calls `installFocusTrap(mc)` AGAIN on the same element (since `mc === p` from the showModal call at line 8436).

`installFocusTrap` (modtools.js:4185-4226) registers a NEW `keydown` Tab listener on `rootEl` each invocation — there's no idempotency check. Net effect:

- **Two `keydown` listeners on `gam-mc-panel`** — both run on every Tab. Both compute first/last items, both attempt to refocus. Second listener sees focus already moved by first → no-op. Wasted CPU but no functional bug.
- **`prevActive` captured TWICE** — second capture overwrites first on the panel's `_gamFocusCleanup` property (line 4224 reassignment). When `closeAllPanels` invokes cleanup (line 7507), the SECOND `prevActive` is what gets refocused. Since both captures happen within the same synchronous call chain, `prevActive` is the SAME element both times. **No behavior difference.**
- **`queueMicrotask` focus-shift fires TWICE** to `items[0]` (line 4215). Both target same element. Second is no-op. Mild redundancy.

**Severity rationale:** Cosmetic. Two listeners doing the same work on every Tab keystroke inside Mod Console. Not a bug. Worth deduping for code health.

**Fix shape:** Pick one site. Recommend removing the install at openModConsole:8442 (showModal handles all modals uniformly).

---

### R6 — P3 — AI rate limiter theoretical race in dequeue microtask

**Where:** `modtools.js:24681-24704`.

**Trace:** Detailed in working notes above. Summary: between `_aiInflight = Math.max(0, _aiInflight - 1)` (line 24700) and the queued resolver's awaiting promise resuming, a fresh call C entering the gate sees `_aiInflight === 2` and bypasses the await. Meanwhile the queued call's microtask resumes, increments `_aiInflight` to 3 (good), and recurses — BUT call C has also incremented `_aiInflight` to 3 (now 4 in-flight). **Concurrent count momentarily exceeds 3.**

**Why this is rare:** Requires a fresh `modmailAiReplyForThread` call to be invoked synchronously between two specific microtask points within the dequeue path. Realistic only if multiple sources fire AI calls (e.g., a background poll + user click) within microtask-window precision.

**Severity rationale:** Theoretical. Default usage pattern is single-source burst-click; all calls in that burst hit the gate before any dequeue happens. The "DDOS our own AI binding" risk the limiter was designed to prevent is fully mitigated for the common case. The corner case might let 4-5 concurrent calls slip past — not 10+, not 100+. Not worth fixing unless the worker AI binding shows 429s in production.

---

### R7 — P3 — Tour overlay z-index collision

**Where:**

- Tour spotlight + card: `z-index:9999999` (modtools.js:28747, 28748)
- Snack toast: `z-index:9999999` (modtools.js:21751)
- Bug-report toast: `z-index:9999999` (modtools.js:7373)
- Brave banner: `z-index:99999999` (modtools.js:7656) — ONE MORE NINE → ALWAYS on top of tour

**Trace:** First-run flow with Brave detection:
1. v10.14.4 BraveBanner fires at install time (top-most, z-index 99999999)
2. Status bar mounts ~init() complete
3. Tour fires 2s after bar mount (z-index 9999998 for overlay, 9999999 for spotlight + card)
4. Brave banner covers the top of the viewport. Tour's first stop (SHIELD on the bar at bottom) shows spotlight correctly; tour CARD is positioned 16px above the icon. If the icon happens to be in upper part of viewport (unlikely for the bottom-docked status bar), card might overlap with banner.

**For typical bottom-bar layout:** Banner top, bar bottom. Card positioned ABOVE bar icons. Card top edge at roughly `r.top - cardH - 16` where `r` is icon's bbox. Cards stay in lower 2/3 of viewport. **No visible collision with the top Brave banner.**

**Snack toast collision:** Snack at `z-index:9999999` (same as spotlight). If a snack fires during the tour (e.g., auto-unsticky CS scanner reports a queued candidate at ~4-5s), the snack overlays the tour spotlight at SAME z-index — paint order (later DOM node wins) puts snack on top. Snack is bottom-right, 100px-from-right offset; spotlight is wherever the next icon is. Typically NOT overlapping geometrically. **Visual collision unlikely.**

**Severity rationale:** Edge case. Not user-blocking. Worth noting for designers.

---

### R8 — P3 — Snack-action ESC + tour ESC double-fire interaction

**Where:** `modtools.js:7787-7796` (snack ESC) + `modtools.js:28837-28845` (tour ESC).

**Trace:**

1. An action snack appears (e.g., DR Cancel-All UNDO with 10s countdown). Snack registers `keydown` ESC handler on document at capture phase (line 7796).
2. Tour fires (2s timer from bar mount). Tour registers `keydown` handler on document at capture phase (line 28845).
3. **Ordering:** snack registered first, tour second. Both on document, both at capture phase.
4. User presses ESC. Snack handler fires first → preventDefault + dismisses snack. Snack handler does NOT call `stopImmediatePropagation`.
5. Tour handler fires second on same capture-phase. preventDefault again (idempotent). Closes tour with `_closeTour(false)` (skip path, doesn't mark seen).

**Net effect:** ESC dismisses BOTH snack and tour in one keystroke. Probably not user intent — the user wanted to dismiss whichever was on top (tour visually).

**Why this is rare:** Requires a snack-with-action to fire DURING the tour. The tour is mostly first-run; mods rarely have active snacks at boot. Realistic only if:
- An auto-unsticky CS scan completes during the tour and fires its snack
- A background poll surfaces an unrelated action snack during tour

**Severity rationale:** Cosmetic, rare. Not worth fixing — `stopImmediatePropagation` in the tour ESC would prevent snack dismissal, but the user might reasonably want snack dismissed first. No clean rule.

---

## Interaction effects (summary table)

| Effect | Severity | Where |
|---|---|---|
| `_mcKbHandler` ESC fires alongside askText ESC (no sub-modal guard) | P2 — R3 | modtools.js:8526 vs 2962 |
| `_mcKbHandler` reads stale drafts when Mod Console tab is BAN but user is in NOTE/MESSAGE tab — concatenates `(banDraft + noteDraft + msgDraft).trim()` so cross-tab drafts trigger ESC confirm | P3 (intentional per spec — "any tab's draft is a draft") | modtools.js:8528-8531 |
| Snack-action ESC + tour ESC both consume keydown | P3 — R8 | modtools.js:7796 vs 28845 |
| Bug-report toast + tour spotlight share `z-index:9999999` | P3 — R7 | modtools.js:7373 vs 28748 |
| AI rate-limit dequeue race window | P3 — R6 | modtools.js:24681-24704 |
| Re-opened Mod Chat panel has dead trap after first close | P1 — R1 | modtools.js:17249-17250 |
| Modmail full-panel ESC handler on document (bubble phase) doesn't block ESC from nested askText (capture phase) — actually works correctly because asktext capture fires first with stopPropagation | NO defect | modtools.js:17771 verified safe |

---

## Cross-cutting findings

### CF1 — CSS specificity audit: PASS

`git diff c8276dc..HEAD -- modtools.js | grep '^+' | grep 'important'` → 0 hits. v10.15.x added zero new `!important` declarations.

New rules introduced (modtools.js:21890-21892):

```css
.gam-mc-quick-group{margin-bottom:12px}
.gam-mc-quick-group:last-of-type{margin-bottom:0}
.gam-mc-quick-header{font:600 10px ui-monospace,"JetBrains Mono",monospace;color:#9b9892;text-transform:uppercase;letter-spacing:0.08em;padding:6px 4px 4px;border-bottom:1px solid #3d3a35;margin-bottom:8px}
```

No selector conflicts with existing `!important` rules (verified: no `.gam-mc-quick-group` or `.gam-mc-quick-header` in any prior `!important` rule). The Bloomberg-iter status-bar `!important` overrides at modtools.js:22813-22834 target `#gam-status-bar` scope only — orthogonal.

### CF2 — PRM coverage audit: PASS

Animations introduced in v10.15.x (`git diff c8276dc..HEAD | grep -iE 'animation|transition|keyframes' | grep '^+'`):

- modtools.js:28731 `animation:gam-tour-fade-in 200ms ease-out` (tour overlay fade-in)
- modtools.js:28746 `@keyframes gam-tour-fade-in{from{opacity:0}to{opacity:1}}` (keyframes def)

**PRM gating verified:** modtools.js:28735-28739 explicitly suppresses overlay animation when `prefers-reduced-motion: reduce` matches:

```js
if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  overlay.style.animation = 'none';
}
```

No other animations introduced. Spotlight uses `outline` + `box-shadow` (no transition). Card uses `position:fixed` with computed coordinates (no animation). **PRM coverage complete.**

### CF3 — Worker contract sanity audit: PASS

v10.15.x changes to `rpcCall` (modtools.js:24681-24704) add a name-equality-scoped rate limiter that ONLY fires for `name === 'modmailAiReplyForThread'`. All other RPC names short-circuit at the first check (line 24688: `if (name === 'modmailAiReplyForThread' && !rpcCall._aiBypass)` — falsy for any other name).

**Specifically checked:**

| RPC | Status | Where |
|---|---|---|
| `modAutoActionRecent` | Unaffected | modtools.js:12078, 18675 |
| `modSusMark` | Unaffected | modtools.js:12455, 12935, 18880 |
| `adminSettingsWrite` | Unaffected | modtools.js:12010 |
| `autoUnstickyScanReport` | Unaffected | modtools.js:28659 (called from v10.14.4 CS scanner IIFE; rate-limiter is irrelevant) |

No worker contract regressions.

### CF4 — Mobile/narrow viewport audit: PASS-WITH-NUANCE

**Tour card at narrow viewport:** card has `max-width:340px` (modtools.js:28748) with viewport-clamp at modtools.js:28807: `left = Math.max(8, Math.min(window.innerWidth - cardW - 8, left))`. At viewport=360px, card occupies ~340px width with 12px margin — tight but functional.

**Install accordion:** inside Chrome popup which is fixed at 520px width (popup.css:21-27). Accordion is responsive within that container. Native `<details>` element flows correctly at any container width.

**QUICK category grouping:** wraps inside Mod Console body. Mod Console has `@media (max-width:720px) { #gam-mc-panel { width:100vw } .gam-mc-list { width:110px } }` (modtools.js:16766-16769). At <720px, panel takes full viewport; QUICK tab buttons in 4 group containers stack naturally (each group is `display:flex` via `gam-mc-grid`).

**Status-bar narrow-viewport observation (N1):** the bar is `display:inline-flex` centered with `transform:translateX(-50%)`. As icons accumulate (14+ icons + 5 separators in v10.14.5+), intrinsic width can exceed viewport at <500px. **No `flex-wrap`, no `max-width:100vw` clamp.** Bar overflows horizontally. **Pre-existing**, not introduced by v10.15.x — but worth noting because v10.14.5 ADDED 2 separators which moved the threshold marginally lower. Status-bar tour spotlights icons via `getBoundingClientRect()`; if an icon is partially off-screen-right, the spotlight outline appears around an offscreen element and the tour card might clamp to viewport but the visual logic looks broken. **Not a regression, not blocking.**

### CF5 — Prior PASS verdict invalidation: NONE

v10.13 `RALPH-FOCUS-TRAPS.md` marked these as PASS: Mod Console, askText, Park, Bug Report (mostly-pass), Intel Drawer, SUS popover (W3), popup-side inline traps. v10.15.5 removal of `__uxOn()` gating from `installFocusTrap` doesn't degrade any of these — they all called `installFocusTrap` and got the no-op closure pre-fix (silently inert for default-config) or the real cleanup post-fix. **All PASS verdicts now actually mean what they say** (previously they were technically incorrect for default-config users).

v10.14 SHIPMASTER claims also unaffected; the v10.14 wave focused on Stats v2 + Macros HTML + Mod Console keyboard (1-6 + Ctrl+Enter) — none of those are touched by v10.15.x's a11y / focus / token changes.

### CF6 — Setting persistence audit: PASS

`gam_tour_seen_v1` is correctly persisted by `setSetting` through the sensitive-key path:

1. `setSetting('gam_tour_seen_v1', true)` (modtools.js:1981) — not in `SECRET_SETTING_KEYS`, goes to L2049
2. `s = _allSettings()` reads merged settings (modtools.js:1969 → `lsGet('gam_settings', {})`)
3. `s.gam_tour_seen_v1 = true`
4. `lsSet('gam_settings', s)` (modtools.js:4855) — `gam_settings` IS in `SENSITIVE_KEYS` (modtools.js:2247-2255), routes to `__syncMemSet`
5. `__syncMemSet` (modtools.js:2663) updates `__memStore` synchronously + fires `chrome.storage.local.set` fire-and-forget

The next `getSetting('gam_tour_seen_v1')` in the same session reads from `__memStore` → returns `true` synchronously. Cross-tab propagation happens via `chrome.storage.onChanged` wiring elsewhere (modtools.js searches confirm listeners exist).

**No issue with `setSetting` in this session context.**

---

## Worker contract sanity (detail)

Re-verification per the brief's hunt list:

- **modAutoActionRecent**: Called at modtools.js:12078 and 18675. Neither call site is touched by v10.15.x. Rate limiter at L24688 short-circuits (`name !== 'modmailAiReplyForThread'`). **No regression.**
- **modSusMark**: Called via `chrome.runtime.sendMessage` directly at modtools.js:12455 (not through `rpcCall` wrapper at that site) and via `rpcCall` at L12935. Neither path affected. **No regression.**
- **adminSettingsWrite**: Called at modtools.js:12010 from settings save handlers. Not affected by v10.15.x. **No regression.**
- **autoUnstickyScanReport**: Called at modtools.js:28659 from the v10.14.4 CS-side scanner IIFE. The IIFE runs lead-only (line 28619 `isLeadMod()` gate), on homepage only (line 28616 `location.pathname !== '/'` early return), with 5-min throttle. Not touched by v10.15.x. **No regression.**

---

## Hunt-list resolution

The brief named 5 specific hunt items. Verdicts:

### H1 — `_mcKbHandler` ESC conflict with focus-trap ESC

**VERIFIED:** No conflict with `installFocusTrap` itself (which only handles Tab, not ESC). But REAL conflict with askText ESC when an askText opens ON TOP of Mod Console — see R3. The fix is a one-line guard at the top of `_mcKbHandler`.

### H2 — Status-bar tour spotlight after v10.14.5 separator additions

**VERIFIED:** All 7 stop selectors still resolve. Separators (`<span class="gam-bar-sep">`) don't have `title` attributes, so `[title="Settings"]` / `[title^="Mod log"]` / etc. selectors are unaffected. The selectors at modtools.js:28695-28710 each match a unique non-separator element. Tour works correctly post-v10.14.5.

### H3 — v10.15.4 AI rate limiter interaction with Mod Chat panel

**VERIFIED:** No interaction. The rate limiter gate at modtools.js:24688 fires only when `name === 'modmailAiReplyForThread'`. Mod Chat panel (`__GAM_MOD_CHAT`) does NOT call `modmailAiReplyForThread` — its AI integration uses different RPC names (verified by grep across the file for `rpcCall` near Mod Chat code paths: zero hits for `modmailAi*` within the ModChat module's L17000-L17600 range). **No interaction effect.**

### H4 — v10.15.5 `__uxOn()` gate removal — inconsistencies elsewhere

**VERIFIED:** YES, see R4. v10.15.5 removed gating from `installFocusTrap` but did NOT remove from the aria-attribute construction sites at modtools.js:2897, 2924, 3755, 3788, 1430, 1453, 1470, 5949. Default-config users now get focus trap without `role="dialog"` + `aria-modal="true"` on askText / Park / Bug Report sub-regions. Asymmetric a11y.

### H5 — `setSetting('gam_tour_seen_v1', true)` correctness

**VERIFIED PASS.** See CF6. The persistence path is correct end-to-end: synchronous RAM update via `__memStore` + durable write via `chrome.storage.local.set`. Re-read in same session is immediate.

---

## Recommendations

### P1 — must-fix in v10.15.6

**R1 fix (Mod Chat re-open):** Add trap re-install in `openPanel` after `buildPanel` short-circuits:

```js
// modtools.js openPanel, after const panel = _step('buildPanel', buildPanel);
if (panel && !STATE._focusTrapCleanup) {
  try { STATE._focusTrapCleanup = installFocusTrap(panel) || null; } catch(_){}
}
```

~3 lines. Closes R1 cleanly.

**R2 fix (Hot-Now cleanup invocation):** Add to `_closeHotNowPanel`:

```js
function _closeHotNowPanel() {
  const hnPanel = document.getElementById('gam-hot-now-panel');
  if (!hnPanel) return;
  try { if (typeof hnPanel._gamHnFocusTrapCleanup === 'function') hnPanel._gamHnFocusTrapCleanup(); } catch (_) {}
  hnPanel.classList.remove('gam-hn-open');
  setTimeout(function() { if (hnPanel.parentNode) hnPanel.remove(); }, 180);
  panelOpen = null;
}
```

2 lines. Closes the QA-A4 P1 gap that v10.15.5 missed.

### P2 — should-fix in v10.15.6

**R3 fix (`_mcKbHandler` sub-modal guard):**

```js
function _mcKbHandler(e){
  if (!mc || !mc.isConnected) return;
  if (document.querySelector('.gam-v72-asktext, .gam-preflight-wrap')) return;
  // ... rest unchanged ...
}
```

1 line. Symmetric with the showModal escHandler's existing askText guard (modtools.js:7857).

**R4 fix (a11y symmetry):** Remove `__uxOn()` gating from aria-attribute construction sites. Same rationale as v10.15.5's `installFocusTrap` ungating — baseline a11y shouldn't be opt-in. Sites: modtools.js:2897, 2924, 3755, 3788, 1430, 1453, 1470, 5949. ~8 one-line changes.

**R5 fix (dedup focus-trap install on Mod Console):** Remove `installFocusTrap(mc)` at modtools.js:8442. showModal already installs at L7875. 1 line removed.

### P3 — defer

R6, R7, R8 are cosmetic / edge-case. Not worth in-scope for v10.15.6 unless coalesced with other work in the area.

### N1 (informational) — status-bar overflow at <500px

The bar's `display:inline-flex` with no `flex-wrap` means it overflows horizontally on very narrow viewports. v10.14.5 added 2 separators bringing the threshold slightly lower. Consider `flex-wrap: wrap` + `max-width: 100vw` at a future iteration. **Not introduced by v10.15.x; not blocking.**

---

## Acceptance

- [x] All 15 v10.15.x features functionally present and operative (re-confirmed via spot-checks where iteration 1 already verified)
- [x] No P0 defects found
- [x] R1 + R2 identified as P1 v10.15.5-introduced regression / incomplete-hotfix gap
- [x] Worker RPC contract intact (modAutoActionRecent, modSusMark, adminSettingsWrite, autoUnstickyScanReport unaffected)
- [x] CSS specificity stable (no new `!important`, no conflicts with prior overrides)
- [x] PRM gating complete on all v10.15.x animations
- [x] Mobile/narrow viewport functional at <720px (with one pre-existing observation N1)
- [x] Prior v10.13/v10.14 PASS verdicts not invalidated; v10.15.5 actually strengthens them for default-config users
- [x] `setSetting` persistence path verified correct for `gam_tour_seen_v1`

**Verdict:** Ship-quality at v10.15.5 EXCEPT for R1 (P1) and R2 (P1). Recommend v10.15.6 hotfix wave to close R1+R2+R3+R4+R5 in one focused commit (~15 lines total).

---

## File:line evidence index

| What | Where |
|---|---|
| R1: Mod Chat panel reuse via `STATE.panelEl` early-return | `modtools.js:17249-17250` |
| R1: closePanel cleanup + null assignment (v10.15.5 hotfix) | `modtools.js:17542` |
| R1: openPanel does NOT re-install trap | `modtools.js:17501-17532` |
| R2: `_closeHotNowPanel` missing cleanup invocation | `modtools.js:11587-11593` |
| R2: cleanup is stored but never called | `modtools.js:11483` (install) |
| R3: `_mcKbHandler` lacks asktext guard | `modtools.js:8526` (ESC branch) |
| R3: showModal HAS asktext guard | `modtools.js:7857` (reference) |
| R3: askText onKey on document capture | `modtools.js:2962-2967, 2981` |
| R4: v10.15.5 ungated `installFocusTrap` | `modtools.js:4185-4195` |
| R4: `__uxOn()` still gates aria attrs | `modtools.js:2897, 2924, 3755, 3788, 1430, 1453, 1470, 5949` |
| R5: showModal installs trap | `modtools.js:7875` |
| R5: openModConsole installs trap (DUPLICATE) | `modtools.js:8442` |
| R6: AI rate-limit gate | `modtools.js:24681-24704` |
| R7: tour spotlight + card z-index | `modtools.js:28747, 28748` |
| R7: snack z-index | `modtools.js:21751` |
| R7: bug-report toast z-index | `modtools.js:7373` |
| R7: Brave banner z-index | `modtools.js:7656` |
| R8: snack ESC handler | `modtools.js:7787-7796` |
| R8: tour ESC handler | `modtools.js:28837-28845` |
| CF1: no new !important rules | `git diff c8276dc..HEAD modtools.js \| grep '^+' \| grep important` → empty |
| CF2: tour overlay animation + PRM gate | `modtools.js:28731, 28735-28739` |
| CF3: AI rate limit name-scoped | `modtools.js:24688` |
| CF4: tour card viewport clamp | `modtools.js:28807` |
| CF4: popup fixed at 520px | `popup.css:21-27` |
| CF4: Mod Console <720px CSS | `modtools.js:16766-16769` |
| CF6: `gam_tour_seen_v1` setSetting path | `modtools.js:1981` → `4855` → `2663` |
| CF6: `gam_settings` in SENSITIVE_KEYS | `modtools.js:2247-2255` |
| Parse check | `node --check modtools.js` → PARSE OK; popup.js + background.js → PARSE OK |

---

**End of QA-B3.**
