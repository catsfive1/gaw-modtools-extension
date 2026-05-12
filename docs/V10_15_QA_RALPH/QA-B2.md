# QA-B2 — v10.15.5 RALPH HOTFIX 1 verification (iteration 2)

**Repo HEAD:** `9eaec32 fix(v10.15.5): RALPH HOTFIX 1 — close 8 defects from QA ralph iteration 1`
**Verified against:** iteration-1 defects from QA-A1, QA-A2, QA-A3
**Method:** static read of fix sites + URL-cleanup test cases run via Node `URLSearchParams`
**Code modifications:** none (read-only verification)

---

## Verdict at a glance

| # | Fix                                         | Severity | Status   | Notes |
|---|---------------------------------------------|----------|----------|-------|
| 1 | `showModal` ESC skip for `gam-mc-panel`     | P0       | PASS     | Skip clause at L7864 reached BEFORE `closeAllPanels()`. |
| 2 | `_mcKbHandler` empty-drafts ESC closes      | P0       | PASS     | Active `closeAllPanels()` call at L8540 with try/catch. |
| 3 | Drafted-text path still renders confirm row | P0       | PASS     | L8543-8576 unchanged from v10.15.2 design. |
| 4 | URL-param uses `openPanel`/`togglePanel`    | MED      | PASS     | L20473/L20475 match ModChat return object (L17600/L17602). |
| 5 | URL cleanup via URLSearchParams             | MED      | PASS     | All 4 named test cases produce correct output. |
| 6 | Install accordion hidden on success (n=3)   | LOW      | PASS     | L3559-3560 hides on `n === 3`, restores on n=1/n=2. |

All six iteration-1 defects are closed. Ship-ready from QA's side.

---

## 1. P0 — ESC draft protection no longer dead code

### 1a. `showModal` escHandler skip for Mod Console

**Site:** `modtools.js` L7853-7869

```js
const escHandler = (e) => {
  if (e.key === 'Escape' || e.key === 'Esc') {
    // If a text-modal sub-panel is open on top of us (gam-v72-asktext),
    // let that handle ESC first. We only handle if no inner modal is up.
    if (document.querySelector('.gam-v72-asktext')) return;
    // v10.15.5 QA-A3 P0: skip generic showModal ESC for Mod Console panel.
    // _mcKbHandler owns ESC on gam-mc-panel for the v10.15.2 3-step draft
    // protection feature (empty drafts close, drafted text shows confirm
    // row). Pre-fix this generic handler fired FIRST (capture-phase, same
    // registration order) and called closeAllPanels(), tearing down
    // _mcKbHandler before the draft-protection branch could run.
    if (p && p.id === 'gam-mc-panel') return;
    e.preventDefault();
    e.stopPropagation();
    closeAllPanels();
  }
};
document.addEventListener('keydown', escHandler, true);
```

The early-return at L7864 lands BEFORE `preventDefault`/`closeAllPanels` —
draft-protection (`_mcKbHandler`) gets to run. Verified.

### 1b. `_mcKbHandler` empty-drafts branch

**Site:** `modtools.js` L8526-8542

```js
if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey) {
  try {
    const banDraft   = (mc.querySelector('#mc-ban-msg')   || {}).value || '';
    const noteDraft  = (mc.querySelector('#mc-note-body') || {}).value || '';
    const msgDraft   = (mc.querySelector('#mc-msg-body')  || {}).value || '';
    const anyDraft = (banDraft.trim() + noteDraft.trim() + msgDraft.trim()).length > 0;
    // v10.15.5 QA-A3 P0: empty-drafts path now closes the Mod Console
    // itself. Pre-fix this branch returned and relied on showModal's
    // generic ESC handler to close, but that handler is now skipped for
    // gam-mc-panel (we own ESC fully). Without explicit closeAllPanels
    // here, ESC on an empty Mod Console did nothing -- regression vs
    // prior behavior.
    if (!anyDraft) {
      e.preventDefault();
      try { closeAllPanels && closeAllPanels(); } catch (_) {}
      return;
    }
```

Active call site present (not the prior `return` only). Guard pattern
identical to the click-handler at L8565, consistent style. Verified.

### 1c. Drafted-text confirm row

**Site:** `modtools.js` L8543-8576 (unchanged by hotfix)

The existing v10.15.2 confirm-row build path is intact: dismiss-existing
branch at L8544-8549, build-new branch at L8550-8576 with Discard/Keep
buttons each wired to the correct action. Verified.

---

## 2. MED — URL-param chat-auto-open uses correct ModChat API

**Site:** `modtools.js` L20465-20496 + ModChat return object at L17597-17604

```js
if (window.__GAM_MOD_CHAT && typeof window.__GAM_MOD_CHAT.openPanel === 'function') {
  window.__GAM_MOD_CHAT.openPanel();
} else if (window.__GAM_MOD_CHAT && typeof window.__GAM_MOD_CHAT.togglePanel === 'function') {
  window.__GAM_MOD_CHAT.togglePanel();
} else {
  // Last-resort: click the status-bar chat badge if it exists
  var badge = document.getElementById('gam-mc-badge');
  if (badge) badge.click();
}
```

ModChat IIFE at L17597-17604 exports:
```js
return {
  init,
  createStatusBarButton,
  openPanel,    // L17600
  closePanel,
  togglePanel,  // L17602
  applyServerMessageUpdate
};
```

`open` / `toggle` were never on this object — pre-fix the auto-open relied
entirely on the badge-click fallback. The fix lines up name-for-name with
the actual exports. Verified.

---

## 3. MED — URL cleanup via URLSearchParams

**Site:** `modtools.js` L20483-20492

```js
try {
  var sp = new URLSearchParams(location.search);
  sp.delete('gam_open_chat');
  var cleanQs = sp.toString();
  var cleanUrl = location.pathname + (cleanQs ? '?' + cleanQs : '');
  history.replaceState(null, '', cleanUrl + location.hash);
} catch (_) {}
```

### Test cases (ran via `node -e`, Node's URLSearchParams matches browser spec)

| Input                                            | Output                | Expected              | Result |
|--------------------------------------------------|-----------------------|-----------------------|--------|
| `?gam_open_chat=1`                               | `` (empty)            | `` (empty)            | PASS   |
| `?gam_open_chat=1&other=y`                       | `?other=y`            | `?other=y`            | PASS   |
| `?other=x&gam_open_chat=1`                       | `?other=x`            | `?other=x`            | PASS   |
| `?other=x&gam_open_chat=1&another=z`             | `?other=x&another=z`  | `?other=x&another=z`  | PASS   |

All four named cases produce the expected serialization. Verified.

### Bonus edge cases tested

- **Multi-value** `?gam_open_chat=1&gam_open_chat=foo&other=y`
  → `?other=y` — `.delete()` removes all occurrences. Correct.
- **URL-encoded values** `?other=hello%20world&gam_open_chat=1`
  → `?other=hello+world` — URLSearchParams round-trips spaces as `+` (form
  encoding) instead of `%20` (path encoding). Both are valid per RFC 3986
  for query strings; browsers and servers accept both. Not a defect for
  this use case (URL is purely cosmetic — page is already fully loaded).

---

## 4. LOW — Install accordion hidden in success state

**Site:** `popup.js` L3550-3571

```js
function showStep(n) {
  const s2 = document.getElementById('firstRunWizardStep2');
  const sk = document.getElementById('firstRunWizardSuccess');
  if (s2) s2.style.display = n === 2 ? 'block' : 'none';
  if (sk) sk.style.display = n === 3 ? 'block' : 'none';
  // v10.15.5 QA-A2 LOW: hide the install accordion during the wizard success
  // state. Pre-fix the green success banner + Open-GAW CTA + Done button
  // appeared side-by-side with the still-visible "Install help" expandable
  // accordion (mild UX noise after a successful claim).
  const accord = document.getElementById('firstRunInstallAccordion');
  if (accord) accord.style.display = (n === 3) ? 'none' : '';
  ...
}
```

The empty string for `n !== 3` restores CSS-default visibility, which is
correct for back-nav (`showStep(1)` via `#firstRunBack` at L3603-3609).
Verified.

---

## Hunt-list answers

### Hunt 1: `closeAllPanels()` defensive try/catch?

**Answer:** Yes — both sites guard with `try { closeAllPanels && closeAllPanels(); } catch (_) {}` (L8540 ESC empty-drafts, L8565 Discard button click).

**Scope check:** `closeAllPanels` is defined at `modtools.js` L7475 in the
same IIFE closure as `_mcKbHandler` (L8453). The symbol is statically
captured by the closure — `closeAllPanels &&` is technically belt-and-
suspenders (the binding can't be `undefined` here), but it shields against
any future refactor that might break the binding or make `closeAllPanels`
throw on early-init edge cases (e.g., DOM not ready). Acceptable.

### Hunt 2: ESC with focus inside `#mc-esc-confirm` Discard/Keep buttons

**Scenario:** User has drafted text -> presses ESC -> confirm row renders
-> user Tabs into Discard or Keep button -> presses ESC again.

**Path traced:**
1. `_mcKbHandler` is `document.addEventListener('keydown', _mcKbHandler, true)` (capture-phase, L8597) — fires regardless of focus location inside the panel.
2. Inside the panel? The early guard at the top of `_mcKbHandler` is `if (!mc || !mc.isConnected) return;` — still inside the panel, so handler runs.
3. ESC branch L8526 enters with `anyDraft === true` (drafts unchanged by Tab).
4. **Critical: L8543-8549** — `confirmRow = mc.querySelector('#mc-esc-confirm')` finds it, `confirmRow.remove(); return;` fires. Confirm row dismissed, focus naturally falls back to body (Discard/Keep got removed mid-keydown). User stays in Mod Console with drafts intact.

**Result:** Pressing ESC while focused inside Discard/Keep dismisses the
confirm row — same as ESC anywhere else in the panel. Behavior is
consistent and correct.

**Tiny note:** Focus after the row is removed lands on `document.body`
(not back into the textarea). Mild UX rough edge — pressing ESC twice
(open confirm, dismiss confirm) leaves the user without text-focus, so a
third ESC re-opens the confirm. Not a defect; the "Keep typing" button
exists for the intentional restore-focus path. Document but don't fix.

### Hunt 3: URLSearchParams URL-encoding edge cases

- **Encoded values round-trip OK** — `%20` → `+` for spaces is a valid
  alternate encoding accepted by all browsers and servers. Same with
  `+` → `%2B` for literal-plus, etc. URLSearchParams uses
  `application/x-www-form-urlencoded` rules consistently. No data loss.
- **Multi-value** — `.delete(name)` removes ALL entries matching the name.
  Verified above. Not a vulnerability.
- **Case sensitivity** — `gam_open_chat` is matched case-sensitively (HTML
  spec). `?GAM_OPEN_CHAT=1` would not be deleted. The triggering condition
  at L20466 (`indexOf('gam_open_chat=1') >= 0`) also requires lower-case,
  so the two checks are consistent — if it triggers, it cleans.
- **No-trigger path** — if `gam_open_chat` isn't in the URL, the cleanup
  block doesn't run at all (gated by L20466). Safe.

### Hunt 4: Install accordion back-navigation

**Path:**
1. User completes claim wizard -> `showStep(3)` fires (L3676 or L3714)
   -> `accord.style.display = 'none'` (L3560).
2. User clicks `#firstRunBack` -> handler at L3603 calls `showStep(1)`
   -> `accord.style.display = ''` (empty string = inherit CSS default).
3. CSS-default visibility for `#firstRunInstallAccordion` is the normal
   visible state (no `display: none` rule in CSS).

**Result:** Accordion re-shows correctly on back-nav. The `''` assignment
clears the inline override and lets CSS govern. Verified.

---

## Recommendations

### Ship as-is

All six iteration-1 defects close cleanly. No new regressions introduced.
The hotfix is correctly scoped — surgical edits at the four sites, no
adjacent-code churn. Ready for v10.15.5 release.

### Optional polish for v.next (not blockers)

1. **Restore focus after ESC-dismissal of confirm row.** Currently after
   ESC dismisses `#mc-esc-confirm`, focus lands on body. Could route through
   the same focus-restore logic the "Keep typing" button uses (L8568-8574).
   ~6 lines, pure UX nice-to-have.

2. **Document `+` vs `%20` in URL cleanup.** If any future caller links to
   the same URL after cleanup (e.g., social-share or copy-link button) and
   expects `%20`, they'd see `+`. Currently zero callers do this, so no-op.
   Worth noting in CHANGELOG.

3. **Lossy URL re-encoding hardening.** If we ever want bit-exact preservation
   of the original query (e.g., a third-party parses `+` vs `%20` strictly),
   the safer pattern is a regex that excises just the `gam_open_chat=...` segment
   without rebuilding the rest:
   ```js
   var q = location.search.replace(/[?&]gam_open_chat=[^&]*/g, '');
   if (q.startsWith('&')) q = '?' + q.slice(1);
   ```
   Not needed today (URL is cosmetic post-mount); flagging as design note only.

### Process notes

- The fix comments at each site reference the QA tag (`v10.15.5 QA-A3 P0`,
  etc.) — excellent traceability. Keep this convention.
- The `closeAllPanels && closeAllPanels()` defensive guard pattern is now
  used in 3 places (8540, 8565, plus existing call sites). Consider a tiny
  `safeCloseAllPanels()` helper if a 4th site appears — but at 3 it's still
  inline-clear, no extraction needed.
