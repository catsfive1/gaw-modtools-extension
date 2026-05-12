# QA-C1 — v10.15.6 RALPH HOTFIX 2 Verification (Read-only)

**Auditor:** Claude (QA-C1 read-only, iteration 3, final)
**Date:** 2026-05-12
**Repo:** `D:\AI\_PROJECTS\modtools-ext\`
**HEAD at audit:** `9065e96` (v10.15.6 — RALPH HOTFIX 2)
**Parent audit:** QA-B1/B2/B3 iteration 2 found 4 fixable items; v10.15.6 claims to close them.
**Parse-check:** `node --check modtools.js` → PARSE OK; `node --check popup.js` → PARSE OK.

---

## Executive summary

All four fixes in v10.15.6 verify **PASS**. The diff is surgical (43 lines added across 3 files), matches the iter-2 findings 1:1, and parses cleanly. No collateral regressions detected.

| Fix | Iter-2 ref | Verdict | Location |
|---|---|---|---|
| 1. ModChat re-open trap | QA-B3 R1 (P1) | **PASS** | modtools.js:17489-17501 |
| 2. HotNow cleanup invocation | QA-B3 R2 (P1) | **PASS** | modtools.js:11598-11605 |
| 3. _mcKbHandler askText guard | QA-B3 R3 (P2) | **PASS** | modtools.js:8456-8463 |
| 4. Rotation DM template promoted | Commander request | **PASS** | popup.js:2442-2452, 2487-2489 |

**Manifest version:** bumped to `10.15.6` (manifest.json:4). Confirmed.

---

## Per-fix verification

### Fix 1 — ModChat re-open trap (QA-B3 R1, P1) — **PASS**

**Location:** modtools.js:17489-17501, inside `openPanel()` BEFORE the existing `_step()` helper declarations.

**Verification checklist:**

- [x] New try/catch block present at L17497-17501.
- [x] Block sits **AFTER** the `_vbuild`/`console.log('[modchat ... openPanel begin')` line (L17487-17488) and **BEFORE** the `function _step(name, fn)` declaration (L17502).
- [x] Block sits **BEFORE** the existing instrumentation (`_step('injectStyles', ...)` at L17530, `_step('buildPanel', buildPanel)` at L17531) — critical because buildPanel short-circuits on cached panel and must NOT re-install the trap a second time on first open.
- [x] Guard is `STATE.panelEl && typeof installFocusTrap === 'function' && !STATE._focusTrapCleanup` (L17498). Triple-AND prevents:
  - First-open path (STATE.panelEl is null) → guard fails, buildPanel installs at L17473
  - Double-open without close (STATE._focusTrapCleanup is truthy from prior install) → guard fails, no double-install
  - Defensive: installFocusTrap exists check (always true in practice but documented)
- [x] Assignment stores result on `STATE._focusTrapCleanup` (L17499), matching the closePanel null-out at L17571.
- [x] `|| null` fallback ensures cleanup is always either a function or null, never undefined.
- [x] try/catch swallows any throw — degraded behavior is "no trap on re-open" not "openPanel aborts".

**Symmetry with closePanel (v10.15.5 fix at L17571):**

```js
// closePanel — L17571 (v10.15.5)
try { if (typeof STATE._focusTrapCleanup === 'function') STATE._focusTrapCleanup(); STATE._focusTrapCleanup = null; } catch (_) {}

// openPanel re-install — L17497-17501 (v10.15.6)
try {
  if (STATE.panelEl && typeof installFocusTrap === 'function' && !STATE._focusTrapCleanup) {
    STATE._focusTrapCleanup = installFocusTrap(STATE.panelEl) || null;
  }
} catch (_) {}
```

Pair is symmetric. closePanel nulls → openPanel re-installs on next open.

**buildPanel short-circuit confirmed:** modtools.js:17266 `if (STATE.panelEl) return STATE.panelEl;`. Original install at L17473 only fires when buildPanel runs to completion (first build). After first close (which keeps STATE.panelEl truthy because the panel DOM is just CSS-hidden, not removed — see L17572 `STATE.panelEl.classList.remove('gam-mc-open')`), the next openPanel re-install at L17497 is what carries the trap.

**Verdict:** PASS.

---

### Fix 2 — HotNow cleanup invocation (QA-B3 R2, P1) — **PASS**

**Location:** modtools.js:11598-11605, inside `_closeHotNowPanel()`.

**Verification checklist:**

- [x] try/catch wrapper present at L11605: `try { if (typeof hnPanel._gamHnFocusTrapCleanup === 'function') hnPanel._gamHnFocusTrapCleanup(); } catch (_) {}`.
- [x] Invocation sits **AFTER** the `if (!hnPanel) return;` guard at L11597 (so we never deref null).
- [x] Invocation sits **BEFORE** the `hnPanel.classList.remove('gam-hn-open')` at L11606 — order matches the iter-2 recommendation; while strict ordering vs. the classList toggle is not load-bearing for the trap to read `panel.contains(activeElement)`, it's clean.
- [x] Invocation sits **BEFORE** the setTimeout-deferred DOM removal at L11607 — required so the trap's internal listener-removal and `prevActive.focus()` still see a live `rootEl` and a live activeElement chain.
- [x] Property accessed is `_gamHnFocusTrapCleanup`, matching the install at L11491.
- [x] `typeof === 'function'` guard prevents throw if the install branch at L11489-11493 was skipped (e.g., installFocusTrap somehow undefined).

**Install/cleanup pairing:**

```js
// Install — L11491 (v10.15.1)
hnPanel._gamHnFocusTrapCleanup = installFocusTrap(hnPanel) || null;

// Cleanup invocation — L11605 (v10.15.6)
try { if (typeof hnPanel._gamHnFocusTrapCleanup === 'function') hnPanel._gamHnFocusTrapCleanup(); } catch (_) {}
```

Disposer captured at install, invoked at close. Closes the iter-2 P1 gap.

**Verdict:** PASS.

---

### Fix 3 — _mcKbHandler askText sub-modal guard (QA-B3 R3, P2) — **PASS**

**Location:** modtools.js:8456-8463, inside `_mcKbHandler()`.

**Verification checklist:**

- [x] New guard line present at L8463: `if (document.querySelector('.gam-v72-asktext')) return;`.
- [x] Guard sits **AFTER** the `if (!mc || !mc.isConnected) return;` check at L8455 (correct order — the connectedness check is cheaper and more fundamental).
- [x] Guard sits **BEFORE** the rest of the handler body (`const t = e.target;` at L8464 and subsequent tab-switch / duration-shortcut logic).
- [x] Selector `.gam-v72-asktext` matches the actual askText DOM class. Confirmed: askTextModal at modtools.js:2899 creates `cls: 'gam-modal gam-v72-asktext'`.
- [x] Pattern matches the showModal escHandler precedent at modtools.js:7857: `if (document.querySelector('.gam-v72-asktext')) return;` — character-identical guard. The two handlers (showModal generic ESC + _mcKbHandler MC-specific) now use the same sub-modal yield idiom.

**Verdict:** PASS.

---

### Fix 4 — Rotation DM template promoted (Commander request) — **PASS**

**Location:** popup.js:2442-2452 (`__makeCopyBtn` signature change) + popup.js:2487-2489 (`__renderInviteResult` order change).

**Verification checklist:**

- [x] `__makeCopyBtn` accepts new optional 4th argument `primary` (L2442).
- [x] When `primary` truthy: `className = 'pop-btn pop-btn-primary'` (L2445).
- [x] When `primary` falsy: `className = 'pop-btn pop-btn-ghost'` (preserves prior behavior for non-DM buttons).
- [x] Inline `style.cssText` differs by primary flag (L2446-2448):
  - primary: `font-size:10px;padding:3px 8px;margin-right:4px;font-weight:600`
  - ghost: `font-size:10px;padding:2px 6px;margin-right:4px`
  - Primary variant has bigger padding (3px 8px vs 2px 6px) AND `font-weight:600`. Visual hierarchy intent honored.
- [x] DM template button appended **FIRST** at L2487, with 4th arg `true` for primary styling:
  ```js
  btnRow.appendChild(__makeCopyBtn('✉ Copy DM template', __dmTemplate(...), null, true));
  ```
- [x] URL button second at L2488 (no primary flag).
- [x] Code-only button third at L2489 (no primary flag).
- [x] Order: DM → URL → Code (was: URL → Code → DM in v10.15.5).

**CSS validity check (hunt question 4):**

`.pop-btn-primary` is defined in popup.css at L124-130:
```css
.pop-btn-primary {
  background: var(--bb-blue);
  border-color: var(--bb-blue);
  color: #fff;
  font-size: 12px;
  padding: 8px 12px;
}
```

It IS a real visible style — blue background, white text. Note the inline `style.cssText` at L2446-2447 overrides `font-size` (10px) and `padding` (3px 8px), but **does NOT** override `background`/`border-color`/`color`. Those inherit from the class. So:
- Background: `var(--bb-blue)` (blue) — visible
- Color: `#fff` (white text) — visible
- Padding: `3px 8px` (inline override, slightly less)
- Font-weight: `600` (inline addition)

Operator sees a blue-filled, white-text, bold button distinct from the two ghost (transparent-bg, border-only) buttons next to it. Visual primacy delivered.

(Hover state at L131-134 inherits `:hover { background:#5aadff; border-color:#5aadff; }` — works for the inline-styled variant too.)

**Verdict:** PASS.

---

## Hunt-list answers

### R1 hunt — double openPanel without intervening close

**Question:** Does the re-install logic do anything bad (e.g., double-install) when openPanel is called twice without a close between calls?

**Answer:** **NO, guard prevents it.** The condition `!STATE._focusTrapCleanup` is the load-bearing piece. Trace:

1. **First openPanel call:** STATE.panelEl is null → buildPanel runs → buildPanel installs trap at L17473 setting STATE._focusTrapCleanup. The new L17497 block was skipped because STATE.panelEl was null at L17498-check time.

2. **Second openPanel call WITHOUT close:** STATE.panelEl is truthy AND STATE._focusTrapCleanup is truthy → guard at L17498 fails (`!STATE._focusTrapCleanup` is false) → new block skipped. buildPanel short-circuits at L17266 (returns existing STATE.panelEl) → install path at L17473 also skipped. **No double-install.**

3. **Open → close → open:** STATE.panelEl truthy (panel still in DOM, just CSS-hidden via class removal). closePanel invokes prior cleanup and nulls STATE._focusTrapCleanup. Next openPanel call: STATE.panelEl truthy AND STATE._focusTrapCleanup null → guard passes → re-install fires. buildPanel still short-circuits. Single fresh trap installed. Correct.

**Edge case considered:** if openPanel is called twice in extremely rapid succession before the first call completed its installFocusTrap synchronously, could there be a race? No — JavaScript is single-threaded and `installFocusTrap` is synchronous (it queues a microtask but the assignment to STATE._focusTrapCleanup at L17499 happens before the next event loop tick).

**Conclusion:** Re-install guard is correct and complete.

### R2 hunt — HotNow listener stacking on multiple opens

**Question:** What if HotNow open is called multiple times? Does the keydown listener at L11482-11487 stack?

**Answer:** **NO, panel-creation gate prevents it.** Trace:

1. **First _showHotNowPanel call:** `document.getElementById('gam-hot-now-panel')` returns null → `if (!hnPanel)` enters → builds panel + attaches keydown (L11482-11487) + installs focus trap (L11491). Panel appended to body.

2. **Second _showHotNowPanel WITHOUT close:** `getElementById` returns the existing panel → `!hnPanel` is false → entire creation block (L11473-11494) **skipped**. Only `hnPanel.innerHTML = ''` (L11495) and subsequent header/body rebuild run. **No listener stack, no trap stack.**

3. **Open → close → open:** _closeHotNowPanel invokes cleanup (L11605 — v10.15.6 new) AND schedules DOM removal in 180ms (L11607). Next _showHotNowPanel call: depends on timing relative to setTimeout.
   - **Normal case (>180ms gap):** panel DOM removed → getElementById returns null → fresh build + fresh listener + fresh trap. Clean.
   - **Pathological case (<180ms gap, user reclicks SIREN before timeout fires):** panel DOM still present → creation block skipped → keydown listener and trap-cleanup property still exist from prior session. **The trap-cleanup property points to a stale cleanup function whose `prevActive` and event-listener handle belong to the previous session.** When the next close fires, this stale cleanup invokes `removeEventListener` on a node that... actually still exists, so the removeEventListener is a no-op (the listener was already removed by the prior session's cleanup at L11605). `prevActive.focus()` re-focuses the SIREN button that was the trigger from TWO sessions ago.
   - **Severity assessment:** P3 at worst. The user-facing effect is "focus jumps to wherever it was before the first of the two rapid-open clicks" — a one-frame focus glitch. Not worth fixing now.

**Conclusion:** No stacking. One pathological corner (sub-180ms re-open) produces a benign focus quirk; not regressive vs. v10.15.5.

### R3 hunt — .gam-v72-asktext selector validity

**Question:** Is `.gam-v72-asktext` the actual selector? Verify the class name exists in the DOM at some askText call.

**Answer:** **YES.** Grep shows the class is created in `askTextModal()` at modtools.js:2899:

```js
const panel = el('div', {
  cls: 'gam-modal gam-v72-asktext',   // ← here
  style: { ... }
});
```

The backdrop also gets `gam-v72-asktext-backdrop` at L2891. The querySelector `.gam-v72-asktext` matches the panel exactly (not the backdrop, which has the `-backdrop` suffix). Pattern matches the showModal escHandler at L7857 verbatim. Class-name spelling is `gam-v72-asktext` (no trailing dash, no typo). Confirmed.

### Bonus hunt — DM template CSS styling (already answered in Fix 4)

`.pop-btn-primary` is defined in popup.css with real visible properties (blue background, white text). The inline style.cssText override doesn't clobber color/background. Operator sees a hierarchically-primary button.

---

## Recommendations

### Ship verdict

**APPROVE v10.15.6 for ship.** All four claimed fixes verify present, correct, and parse-clean. No collateral regressions in adjacent code. Manifest version bumped. Iter-2 P1×2 + P2×1 closed. Commander UX request delivered.

### Optional follow-ups (P3, not gating)

1. **HotNow rapid-re-open focus quirk** (hunt 2 pathological case): if a SIREN power-user re-clicks within 180ms of closing, focus restores to the trigger from the session-before-last. Fix: in _closeHotNowPanel, also `hnPanel._gamHnFocusTrapCleanup = null;` after invoking (same null-out pattern as STATE._focusTrapCleanup on the ModChat side). One-liner addition at L11605. Not regressive vs. v10.15.5; ship later.

2. **R4 from iter-2 (asymmetric a11y)** still open: `installFocusTrap` runs unconditionally post-v10.15.5, but askText/Park panels' `role="dialog"` + `aria-modal="true"` attributes are still gated on `__uxOn()` at modtools.js:2897 and ~3755. Screen readers therefore announce these as plain divs, not modals, even though Tab containment works. Pure-a11y delta, P2. Document and address in v10.15.7 or v10.16.

3. **R5 from iter-2 (duplicate trap install on Mod Console)** still open: both `showModal` and `openModConsole` install traps on `#gam-mod-console-modal`. Pre-v10.15.5 invisible (uxOn-gated); post-v10.15.5 means two keydown listeners that do redundant work. No user-facing defect (Tab containment is idempotent), but worth deduping. P2-P3.

4. **R6/R7/R8 from iter-2** (rate-limit race, z-index inversion, ESC double-fire): all P3 timing/layering corner cases. Defer to v10.16 layering pass.

### Test plan for Commander

Manual smoke (5 minutes total):

1. **ModChat re-open** — Open Mod Chat (button or shortcut) → focus is inside panel. ESC closes → focus restores to opener. Re-open ModChat → Tab cycles within panel (not into page DOM). Close again → focus restores to opener again. **Pre-v10.15.6 second open lost Tab containment.**

2. **HotNow close focus restore** — Click SIREN → panel opens, focus inside. Close (ESC or X button) → focus restores to SIREN button. **Pre-v10.15.6 focus stayed on the panel's last-focused button or fell to body.**

3. **MC + askText ESC** — On Mod Console QUICK tab, run a title-grant flow that chains askText prompts. Inside the askText prompt, press ESC. The askText cancels; the MC does NOT also show a "Discard draft?" prompt. **Pre-v10.15.6 ESC fired both, producing confusing double-prompt.**

4. **Rotation invite DM-first** — Generate a rotation invite from the lead popup. Verify button order is `✉ Copy DM template` (blue, bold, leftmost) → `🔗 Copy invite link` (ghost) → `Copy code only` (ghost). Click DM template → clipboard contains the full Discord DM blob.

If all four pass, v10.15.6 is green.

---

**End of QA-C1 verification report.**
