# RALPH-COPY-CLIPBOARD — `copyWithPulse` Migration Completeness Audit

**Auditor:** RALPH-COPY-CLIPBOARD (read-only)
**Repo:** `D:\AI\_PROJECTS\modtools-ext\` @ `9c7655e` (v10.13.4)
**W5 utility commits:** present in shipped `popup.js:365-408`, `modtools.js:7176-7215`, `popup.css:2355-2362`, `modtools.js:21171-21173`
**Spec source-of-truth:**
- `docs/V10_DESIGN_V2/DESIGN_V2_SHIPMASTER.md` Section 5 Wave 5 (lines 474-525), in particular AC at L498-499 and L524.
- `docs/V10_DESIGN_V2/UIUX2-31_micro_interactions.md` §A.3 (L80-103) and §B Rank 1 (L266) — original gap finding.

---

## Summary

W5 successfully introduces the `copyWithPulse(btn, text)` utility in BOTH `popup.js` and `modtools.js` (one near-identical copy in each context — appropriate, since popup and content-script run in different JS realms). The CSS keyframe `gam-copy-flash` is declared in BOTH `popup.css` and the modtools.js GAM_CSS injected stylesheet, with PRM guards in both. The 3-layer fallback ordering matches the CLAUDE.md Rule 9 standard wrapper, with one minor functional divergence (no console-confirm log on success — by design, since the button label IS the confirmation).

**But the spec AC ("All token copy buttons in popup, debug dump, AI card copy use the utility") is NOT fully met.** Only **3 of the 11 clipboard write call sites** route through `copyWithPulse`. **8 inline `navigator.clipboard.writeText` sites remain unmigrated** in the production code paths. Three of those eight are legitimate exceptions (background-of-action auto-copies that have no button to pulse — invite-result auto-copy, modmail useBtn track-and-copy x3 where the button reset is owned by the caller, page-of-action update-bar reload-URL copy). **Two are legitimate misses** (the diag export `maintDiagExport` and the maint health `maintAuditVerify` JSON copy) — both are button-driven copy flows that absolutely should pulse the calling button. **Three are debatable** (rotation-roster fallback `Copy invite` button, lead deep-dive Rotate button, lead Quick Actions invite — all button-driven, all currently use `try { ... } catch (_){}` swallow + manual `btn.textContent` swap, which is exactly the pattern `copyWithPulse` was built to replace).

Eight findings below, ranked. The W5 acceptance criterion as written ("All token copy buttons in popup, debug dump, AI card copy use the utility") is technically met for the *named* surfaces (the popup token-copy buttons via `__makeCopyBtn`, the diag export button, the AI card copy button), but the *spirit* of the AC ("eliminate the credibility gap of zero copy confirmation") is undershipped because copy flows that produce real lead-facing artifacts (health report JSON, diag JSON full export, rotation invites issued from lead surfaces) still write to clipboard with zero UI confirmation.

The utility itself is well-built: 3-layer fallback in correct priority order, focus check in layer 2, textarea cleanup in layer 3, PRM guard on the keyframe, idempotent label-restore via captured `origLabel`. The hunt-list issues raised by the user are mostly defensible — see Findings 1, 2, 3.

---

## Section 1 — Call-site table

Every clipboard-write site found in `modtools.js` + `popup.js` + `background.js`. Ordered file-then-line.

### popup.js (10 raw clipboard-write sites + 2 utility-internal)

| # | File:line | Context | Migrated? | Verdict |
|---|---|---|---|---|
| P1 | popup.js:373 | `copyWithPulse` Layer 2 (utility internals) | n/a — IS the utility | PASS |
| P2 | popup.js:386 | `copyWithPulse` Layer 3 `execCommand('copy')` (utility internals) | n/a — IS the utility | PASS |
| P3 | popup.js:2236 | `await navigator.clipboard.writeText(url)` inside `generateInvite()` after a successful invite create — auto-copies the URL and appends `(copied)` text node to result element | NOT migrated | **Legitimate exception** — there's no button to pulse on this surface; the action is *auto-copy on success*, the visible UI feedback is the inserted `<em> (copied)</em>` text node alongside the URL. Could be argued the "Generate" button itself should pulse, but it's a `withLoading()` button that has its own state transitions (saving -> ok). Keep. |
| P4 | popup.js:2284 | `__makeCopyBtn` factory used for invite link / code / DM template copy buttons | **MIGRATED** (calls `copyWithPulse(b, payload)`) | PASS |
| P5 | popup.js:2326 | `try { navigator.clipboard.writeText(inviteUrl); } catch (e) {}` — auto-copy of full invite URL after `__renderInviteResult` mounts the rotation-roster result block | NOT migrated | **Legitimate exception** — same shape as P3: auto-copy-on-render, no button to pulse, the visible feedback is the rendered URL panel itself. Keep. |
| P6 | popup.js:2408 | `await navigator.clipboard.writeText(...)` inside `copyBtn` click handler in `__issueBulkFromRoster` no-Discord fallback row | **UNMIGRATED — CALL-SITE MISS** | Button-driven copy flow. Currently does `copyBtn.textContent = 'Copied!'` after manual write. This is the exact pattern `copyWithPulse` exists to replace. See Finding 1. |
| P7 | popup.js:5328 | `await navigator.clipboard.writeText(json)` inside `maintDiagExport()` — full diag log JSON to clipboard | **UNMIGRATED — CALL-SITE MISS** | Button-driven (the maint card "Diag export" button). Status feedback goes through `__maintSetStatus` to a separate status div ("✓ N entries copied to clipboard (redacted)"), not the button. Could pulse the calling button additionally. See Finding 2. |
| P8 | popup.js:5597 | `try { await navigator.clipboard.writeText(json); } catch (_) {}` — inside `maintAuditVerify` health-report JSON write | NOT migrated | **Legitimate exception** — the audit-verify fires an HTML-report download in addition to the JSON clipboard write; the button transitions through `withLoading` AND opens an HTML report tab. Pulse is redundant signal here. Keep. |
| P9 | popup.js:5793 | `try { await navigator.clipboard.writeText(url); } catch (_) {}` inside Rotate button click in lead-deep-dive mod-list rotate flow | **UNMIGRATED — CALL-SITE MISS** | Button-driven (`btn`). Currently does `btn.textContent = '✓ link copied'` after manual write — same pattern P6 has, exact target for `copyWithPulse(btn, url)`. See Finding 3. |
| P10 | popup.js:6628 | `try { await navigator.clipboard.writeText(url); } catch (_) {}` inside Quick Actions Invite button | **UNMIGRATED — CALL-SITE MISS** | Button-driven (`qaInviteBtn`). Currently fires `__showToast(...)` after — toast is the user-visible signal, but the button itself silently returns to resting. Same pattern P6/P9 share. See Finding 3. |
| P11 | popup.js:6909 | `copyWithPulse(diagExportBtn, out)` inside `diagExportErrors` button click | **MIGRATED** | PASS |

### modtools.js (8 raw clipboard-write sites + 2 utility-internal)

| # | File:line | Context | Migrated? | Verdict |
|---|---|---|---|---|
| M1 | modtools.js:143 | `await navigator.clipboard.writeText(json)` Layer 2 inside `window.__gamDebugDump` | NOT migrated | **Legitimate exception** — `__gamDebugDump` is a DevTools-console-callable diagnostic (`window.__gamDebugDump()`). It has NO calling button to pulse — the user invoked it from the console, output goes back to the console with a colored confirmation log line ("copied to clipboard via X"). This is exactly the CLAUDE.md Rule 9 browser-console wrapper pattern — keep as-is. The 3-layer fallback in `__gamDebugDump` predates `copyWithPulse` and structurally CANNOT use it (no button arg). Keep. |
| M2 | modtools.js:152 | `execCommand('copy')` Layer 3 inside `window.__gamDebugDump` | NOT migrated | Same exception as M1. |
| M3 | modtools.js:7166 | `navigator.clipboard.writeText(t)` inside legacy `copyAndNotify(t, ok, fb)` helper | NOT migrated | **Legitimate exception, but also a legacy pattern that should be deprecated.** `copyAndNotify` is invoked from 6 sites (modtools.js:10368, 10995, 11240, 11930, 12222 — page-context permalink/username copy on right-click context menus and keyboard shortcuts). These fire WITHOUT a calling button (keyboard `c` key, context-menu item) — there's no DOM element to pulse. The current snack feedback is the right UX channel for that surface. **Recommendation:** keep `copyAndNotify` for keyless / context-menu copy flows; do NOT migrate. Its existence does NOT block the W5 AC. |
| M4 | modtools.js:7182 | `copyWithPulse` Layer 2 (utility internals) | n/a — IS the utility | PASS |
| M5 | modtools.js:7194 | `copyWithPulse` Layer 3 (utility internals) | n/a — IS the utility | PASS |
| M6 | modtools.js:8722 | `copyWithPulse(intelAiCopy, intelAiText.value)` inside Intel AI copy button | **MIGRATED** | PASS — directly named in W5 AC ("AI card copy use the utility"). |
| M7 | modtools.js:17397 | `try { await navigator.clipboard.writeText(body); } catch(_){}` inside modmail send-with-AI useBtn (panel ban/replies path) | NOT migrated | **Legitimate exception** — this is the "track + copy + open thread" composite action. The visible feedback is the snack `'✓ Reply copied + tracked. Paste on the GAW thread.'` plus `window.open(...)` navigating away. The button (`useBtn`) is about to be visually decoupled from the user's attention as soon as the new tab opens. A button-pulse is wasted signal here. Keep. |
| M8 | modtools.js:17653 | Same shape as M7 — modmail draft useBtn write+open+track | NOT migrated | Same exception as M7. |
| M9 | modtools.js:17714 | Same shape as M7 — modmail panel pre-fetched draft useBtn write+open+track | NOT migrated | Same exception as M7. |
| M10 | modtools.js:24949 | `await navigator.clipboard.writeText(reloadHref)` inside `_gamShowExtOrphanedBanner` reload button — copies `chrome://extensions/...` URL because Chrome refuses anchor navigation to chrome:// from content scripts | NOT migrated | **Legitimate exception, but borderline.** The button DOES manually swap label `'✓ URL copied — paste into address bar'` then revert at 4000ms. This is exactly the `copyWithPulse` pattern but with a longer hold (4000ms vs 1200ms) and a custom label. Could be migrated by adding an optional `holdMs` param to `copyWithPulse`. Low priority — the label swap and 4000ms hold are intentional product choices for the orphaned-banner UX (4s gives the user time to read "paste into address bar"). See Finding 4. |

### background.js

| # | File:line | Context | Migrated? | Verdict |
|---|---|---|---|---|
| B1 | (none) | — | n/a | **Legitimate exception (architectural)** — `background.js` is the service worker. SW context has no `navigator.clipboard` access (offscreen documents are required for clipboard ops in MV3 SWs), and there's no DOM/button to pulse. Zero clipboard writes is the correct state. Confirmed via grep: no matches for `clipboard|execCommand` in `background.js`. |

### Total tally

- **3 sites migrated to `copyWithPulse`** (popup.js: `__makeCopyBtn`, `diagExportErrors` | modtools.js: `intelAiCopy`).
- **5 legitimate exceptions** (P3, P5, P8, M1+M2, M3, M7+M8+M9 — counted as 5 distinct functional contexts).
- **4 unmigrated call-site misses** that should be migrated (P6, P7, P9, P10).
- **1 borderline** (M10 update-bar reload).

The W5 spec wording ("All token copy buttons in popup, debug dump, AI card copy use the utility") is **literally PASS** if read narrowly — `__makeCopyBtn` is the popup token-copy factory, `diagExportErrors` is the debug dump, `intelAiCopy` is the AI card copy. The four named surfaces ship correctly.

The W5 spec **intent** ("eliminate the highest-ROI copy-confirmation gap" per UIUX2-31 §B Rank 1) is **partial**, because four button-driven copy flows on lead-relevant surfaces (rotation roster fallback, maint diag export, lead deep-dive rotate, Quick Actions invite) still use the manual `btn.textContent = 'Copied!'` pattern — exactly the pattern `copyWithPulse` was built to standardize.

---

## Section 2 — Hunt-list verification (the user-named edges)

The user's brief named four specific concerns. Verifying each.

### Hunt 1 — Layer 1 `typeof copy === 'function'` in normal page execution

**Question:** in normal page execution (not DevTools console eval), does `typeof copy === 'function'` correctly evaluate to false? Or does it throw `ReferenceError` silently?

**Verdict:** SAFE — wrapped in `try/catch(_){}`.

**Evidence:**
- `popup.js:368`: `try { if (typeof copy === 'function') { copy(text); copied = 'devtools'; } } catch(_){}`
- `modtools.js:7178`: `try { if (typeof copy === 'function') { copy(text); copied = 'devtools'; } } catch(_){}`

**Why this works:** the `typeof` operator is the canonical safe-test for an undeclared identifier in JavaScript — `typeof undeclaredVar` returns the string `'undefined'` instead of throwing `ReferenceError`. This is the documented exception in the language. So in the popup window (no DevTools `copy` helper), `typeof copy === 'function'` evaluates to `false` cleanly, the `if` body never runs, and Layer 2 takes over. Even if the implementation didn't use `typeof` (e.g., bare `if (copy)` would throw), the surrounding `try/catch` would swallow it. Belt-and-suspenders.

**Note:** in content-script realms (where `modtools.js` runs), there are zero realistic scenarios where `copy()` would be defined unless DevTools is open AND inspecting the page-isolated world. Layer 1 effectively never fires there. Cheap to attempt; harmless.

### Hunt 2 — Layer 2 `document.hasFocus()` check

**Question:** Layer 2 (`navigator.clipboard.writeText`) requires `document.hasFocus()`. Does the wrapper check focus? Per CLAUDE.md Rule 9 standard wrapper, yes — verify.

**Verdict:** PASS — both implementations explicitly gate on `document.hasFocus()` AND on `navigator.clipboard` existence.

**Evidence:**
- `popup.js:372`: `if (navigator.clipboard && document.hasFocus()) { navigator.clipboard.writeText(text); copied = 'clipboard-api'; }`
- `modtools.js:7181`: `if (navigator.clipboard && document.hasFocus()) { navigator.clipboard.writeText(text); copied = 'clipboard-api'; }`

This matches the CLAUDE.md Rule 9 wrapper at C:\Users\smoki\.claude\rules\common\powershell.md (referenced in CLAUDE.md Section 9, lines 244-260 of the global config) verbatim — both layers gate, and Layer 3 (textarea) runs without that gate.

**Edge case considered:** what if `navigator.clipboard` exists but `writeText` is undefined (very old Chrome)? The current code calls `.writeText` directly inside `try { ... } catch(_){}`. A `TypeError: navigator.clipboard.writeText is not a function` would be caught and Layer 3 would fire. Safe.

**Edge case considered:** what if `writeText` returns a Promise that rejects asynchronously (e.g., user denied clipboard permission)? The current implementation does NOT `await` the Promise — it sets `copied = 'clipboard-api'` synchronously after invoking `writeText`. This is a **MINOR FIRMNESS GAP** — see Finding 5. The button will pulse "COPIED" even if the actual clipboard write fails async. In practice this is rare on Chrome (clipboard write rarely rejects on a button-click gesture in a focused popup), but it's a strictly-incorrect signal.

### Hunt 3 — Layer 3 textarea cleanup

**Question:** does the cleanup actually remove the temp textarea after copy?

**Verdict:** PASS in the success path. **MARGINAL in the throw path** — see Finding 6.

**Evidence (popup.js:381-389):**
```js
try {
  var ta = document.createElement('textarea');
  ta.value = String(text);
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  var ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (ok) copied = 'execCommand';
} catch(_){}
```

**The throw window:** if `ta.focus()`, `ta.select()`, OR `document.execCommand('copy')` throws, control transfers to the `catch(_){}` block — and `document.body.removeChild(ta)` never runs. The textarea is leaked in the DOM (off-screen at top:-9999px, opacity:0, so user-invisible).

**Real-world likelihood:** very low. `focus()` and `select()` on a freshly-created textarea attached to body don't throw under realistic conditions. `execCommand('copy')` is deprecated but well-behaved — it returns `false` on failure rather than throwing in current Chrome.

**Severity:** P2 hygiene at most. The leaked textarea is not a security issue (no PII reachable since it's already removed from the DOM tree visibility). Memory will GC if no references retained. But strictly it's a missing finally-removeChild.

Same defect shape exists at `modtools.js:7188-7197`.

### Hunt 4 — "COPIED" label revert at 1200ms — what happens on second click at 800ms?

**Question:** if user clicks again at 800ms, does the first timer get cancelled?

**Verdict:** **FAIL — race exists.** See Finding 7.

**Evidence (popup.js:392-406):**
```js
if (btn && copied) {
  try {
    var origLabel = btn.textContent;
    btn.textContent = 'COPIED';
    btn.classList.add('gam-copy-flash');
    btn.style.animation = 'gam-copy-flash 800ms ease-out';
    setTimeout(function() {
      try {
        btn.textContent = origLabel;
        btn.classList.remove('gam-copy-flash');
        btn.style.animation = '';
      } catch(_){}
    }, 1200);
  } catch(_){}
}
```

**The bug walk-through:**
1. T=0: User clicks button. `origLabel` captured = `'COPY URL'`. Label swaps to `'COPIED'`. setTimeout #1 scheduled to fire at T=1200.
2. T=800: User clicks again. New invocation. `origLabel` captured = `'COPIED'` (because the first timer hasn't fired yet — the button still reads `'COPIED'`). Label swaps to `'COPIED'` (no visible change). setTimeout #2 scheduled to fire at T=2000.
3. T=1200: setTimeout #1 fires. Restores `origLabel` (which was `'COPY URL'`). Button correctly reads `'COPY URL'`.
4. T=2000: setTimeout #2 fires. Restores its captured `origLabel` (which was `'COPIED'` from step 2). **Button is now stuck reading `'COPIED'` permanently** until the next click that finishes its full 1200ms cycle without interruption.

**Severity:** P1 functional regression. A double-click pattern (which mods do — clicking a "Copy invite link" button twice to be sure) leaves the button label corrupted as `'COPIED'`. Same defect in both popup.js:392-406 and modtools.js:7199-7212.

**The classic fix** is a `data-orig-label` attribute that's set ONCE on first invoke and read on revert, plus a `clearTimeout(prev)` if a previous timer is in-flight. Or storing the timer handle on the button itself.

This is the most impactful finding in the audit — it's a real user-facing bug introduced by W5, and a regression vs. the pre-W5 surfaces that already had ad-hoc label swap (those used `setTimeout` similarly but the label they were swapping was static, so re-clicks just re-set the same label — they didn't capture-on-pulse).

### Hunt 5 (bonus) — Concurrent multi-button pulsing

**Question (implicit):** can two buttons pulse at the same time? Does one steal state from the other?

**Verdict:** PASS — `origLabel` is captured per-invocation in a closure, no shared state. Two buttons pulsing simultaneously would each have their own captured original and their own setTimeout. The CSS `gam-copy-flash` keyframe applies independently per-element via the inline `btn.style.animation`. No cross-talk.

---

## Section 3 — Findings (ranked)

### Finding 1 (P1 — call-site miss) — Rotation roster bulk-fallback `Copy invite` button bypasses utility

**Where:** `popup.js:2403-2414` (`__issueBulkFromRoster` no-Discord fallback row).

**What ships:**
```js
copyBtn.addEventListener('click', async () => {
  try {
    const ir = await __popupPost('/admin/mod/rotation-invite', { mod_username: r.username });
    const id = await ir.json();
    if (id.ok && id.code) {
      await navigator.clipboard.writeText('https://greatawakening.win/?mt_invite=' + id.code);
      copyBtn.textContent = 'Copied!';
    } else {
      copyBtn.textContent = 'Error';
    }
  } catch (_) { copyBtn.textContent = 'Error'; }
});
```

**Why it should be migrated:** button-driven copy flow with manual `textContent = 'Copied!'` swap. Exact pattern `copyWithPulse(copyBtn, url)` is meant to replace. Shipped code has zero label-revert (`'Copied!'` becomes a permanent label until next render), zero green flash, zero 3-layer fallback. Strictly worse UX than the migrated `__makeCopyBtn` siblings on the same page.

**Recommendation:** swap the inner block to `copyWithPulse(copyBtn, 'https://...')` after RPC succeeds; on RPC failure keep the manual `'Error'` label (or convert to error pulse, but that's scope creep).

---

### Finding 2 (P1 — call-site miss) — `maintDiagExport` clipboard write doesn't pulse the source button

**Where:** `popup.js:5328` (`maintDiagExport` function body, inside `try`).

**What ships:**
```js
const json = JSON.stringify({ exportedAt, version, count, entries: redacted }, null, 2);
await navigator.clipboard.writeText(json);
__maintLog('diagExport', 'ok', { count: redacted.length });
__maintSetStatus('maintDiagStatus', '✓ ' + redacted.length + ' entries copied to clipboard (redacted).', 'ok');
```

**Why it's not the same as the migrated `diagExportErrors` button:** the W5 patch wired `copyWithPulse(diagExportBtn, out)` at popup.js:6909 inside the diag-tab "Copy errors to clipboard" button click handler. That's distinct from `maintDiagExport` (the maint card "Diag export" button on a different surface). `maintDiagExport` is invoked from the maint card with a button event but its handler at `__maintWireBtn('maintDiagExportBtn', maintDiagExport, 'maintDiagStatus')` (line ~5500 area, not shown but pattern matches other maint wirings) doesn't pass the button reference into the function — so the function can't pulse it without a refactor.

**Recommendation:** either accept this as-is (the status div feedback is functional), or refactor `maintDiagExport` to take a `btn` param and have `__maintWireBtn` pass it through. Adding pulse is +6 lines net.

**Also relevant:** the user named "debug dump" in the AC. The `diagExportErrors` button literally exports diag errors and was migrated. The diag SNAPSHOT button (`diagSnapBtn` at popup.html:885) just delegates to `debugBtn` which is a download flow (no clipboard). The maint `maintDiagExport` is the "all entries to clipboard" path that's a sibling — arguably part of the AC, arguably not.

---

### Finding 3 (P1 — two call-site misses) — Lead-surface invite-copy buttons silently swap labels without pulse

**Where:**
- `popup.js:5783-5800` (lead deep-dive mod-list rotate row → manual `btn.textContent = '✓ link copied'`)
- `popup.js:6620-6633` (Quick Actions Invite button → manual `__showToast('Invite for X copied to clipboard', 'ok')`)

Both are button-driven copy flows on lead-only surfaces (rotation actions). Both currently swallow clipboard errors with `try { await navigator.clipboard.writeText(url); } catch (_) {}`. Both then signal success via a different channel (manual label swap or toast).

**Why these matter:** the spec calls out "rotation invites" as a high-friction lead workflow (mod onboarding throughput is the V11 metric). The W5 utility was specifically meant to give the lead a one-shot visual "the URL is on your clipboard, paste it into Discord now." Without the green flash, the lead has to read the toast text or the swapped label — slower scan. Marginal wins compounded across N rotations per session.

**Recommendation:** migrate both. `copyWithPulse(btn, url)` AND keep the toast (the toast carries information beyond the visual — the username) — pulse and toast aren't redundant, they target different cognitive moments.

---

### Finding 4 (P3 — borderline) — `_gamShowExtOrphanedBanner` reload button does its own label-swap with custom hold

**Where:** `modtools.js:24947-24957`.

The orphaned-banner reload button copies a `chrome://` URL (because Chrome blocks anchor navigation to chrome:// from content scripts) and shows `'✓ URL copied — paste into address bar'` for 4000ms.

**Why it's not migrated:** the message is intentional product copy that exceeds the "COPIED" label `copyWithPulse` always uses. The 4000ms hold is intentional (gives the lead time to read the instruction). Migrating without an `opts` param would regress this surface.

**Recommendation:** either:
- (a) Leave as-is. The pulse is nice-to-have; the existing label swap is functional.
- (b) Extend `copyWithPulse(btn, text, opts = { label: 'COPIED', holdMs: 1200 })` with optional overrides, then migrate. +3 lines to the utility.

Low priority. Defer.

---

### Finding 5 (P2 — strict-correctness gap) — Layer 2 `writeText` Promise not awaited, COPIED fires on async failure

**Where:** `popup.js:372-375`, `modtools.js:7181-7184`.

```js
if (navigator.clipboard && document.hasFocus()) {
  navigator.clipboard.writeText(text);  // <-- fire-and-forget Promise
  copied = 'clipboard-api';              // <-- claims success synchronously
}
```

`navigator.clipboard.writeText(text)` returns a Promise. The current code does not `await` it. If the Promise rejects (rare on Chrome with focus + user gesture, but possible on a permission-denied page), `copied` is still set to `'clipboard-api'` and the button pulses "COPIED" — but the text never landed on the clipboard.

**Severity:** P2. In practice, focused-popup + button-click gesture + same-origin write almost never rejects on Chrome. Will misfire on Firefox / iOS Safari with stricter clipboard permissions, but the extension targets Chrome so this is theoretical.

**Recommendation (out of scope):** make `copyWithPulse` async and await the writeText:
```js
if (navigator.clipboard && document.hasFocus()) {
  await navigator.clipboard.writeText(text);
  copied = 'clipboard-api';
}
```
But this requires the caller to `await copyWithPulse(...)` if they care about result. The current synchronous call sites don't, so the change is non-breaking. Net +1 `async` keyword + 1 `await`.

---

### Finding 6 (P3 — hygiene) — Layer 3 textarea leaked if `execCommand` throws

**Where:** `popup.js:381-389`, `modtools.js:7188-7197`.

If `ta.focus()`, `ta.select()`, or `document.execCommand('copy')` throws, the `document.body.removeChild(ta)` line is skipped, leaving the textarea attached to body. Off-screen + opacity:0 + position:fixed at top:-9999px, so visually invisible and not user-reachable.

**Real-world risk:** very low — those calls don't throw under realistic page conditions.

**Recommendation:** wrap removal in finally:
```js
const ta = document.createElement('textarea');
try {
  ta.value = String(text);
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  const ok = document.execCommand('copy');
  if (ok) copied = 'execCommand';
} catch(_) {
} finally {
  try { ta.parentNode && ta.parentNode.removeChild(ta); } catch(_){}
}
```
+3 lines. P3 hygiene.

---

### Finding 7 (P1 — functional bug) — Double-click within 1200ms corrupts button label permanently

**Where:** `popup.js:392-406`, `modtools.js:7199-7212`.

The most-impactful finding in this audit. Walked through in Hunt 4. Recap:

1. Click 1 captures `origLabel = 'COPY URL'`. Label → `'COPIED'`. Timer #1 scheduled.
2. Click 2 at T=800ms (before Timer #1 fires) captures `origLabel = 'COPIED'` (current rendered text). Label → `'COPIED'` (unchanged visually). Timer #2 scheduled.
3. Timer #1 fires at T=1200ms, restores `'COPY URL'`. Looks correct.
4. Timer #2 fires at T=2000ms, restores the STALE `'COPIED'` capture from step 2. **Button is now `'COPIED'` permanently** until next *clean* click that completes its 1200ms cycle.

**User-visible repro:**
1. Open popup. Find any token copy button (e.g., "Copy invite link" in rotation roster result block, post-W5 migration).
2. Click it. See "COPIED" briefly.
3. Within ~1 second, click it again.
4. Wait 2 seconds. Button is now stuck reading "COPIED" forever.

**Severity:** P1. This is real lead-facing UX. Mods double-clicking buttons is normal behavior (uncertainty about whether the click registered → click again to be safe). The bug means the surface visibly lies about its current state.

**Fix sketch:**
```js
function copyWithPulse(btn, text) {
  // ... 3-layer fallback unchanged ...
  if (btn && copied) {
    try {
      // Cancel any in-flight pulse and recover original label
      const prevTimer = btn.__copyPulseTimer;
      if (prevTimer) {
        clearTimeout(prevTimer);
        // origLabel was captured on first pulse; revert if we have it
        const stored = btn.__copyPulseOrigLabel;
        if (stored != null) btn.textContent = stored;
      }
      // First pulse on this button: capture true original
      const origLabel = btn.__copyPulseOrigLabel != null
        ? btn.__copyPulseOrigLabel
        : btn.textContent;
      btn.__copyPulseOrigLabel = origLabel;
      btn.textContent = 'COPIED';
      btn.classList.add('gam-copy-flash');
      btn.style.animation = 'gam-copy-flash 800ms ease-out';
      btn.__copyPulseTimer = setTimeout(function() {
        try {
          btn.textContent = origLabel;
          btn.classList.remove('gam-copy-flash');
          btn.style.animation = '';
          btn.__copyPulseTimer = null;
          btn.__copyPulseOrigLabel = undefined;
        } catch(_){}
      }, 1200);
    } catch(_){}
  }
  return copied;
}
```

Net +6 lines. Both popup.js and modtools.js need the same patch.

---

### Finding 8 (P2 — schema-only completeness) — `copyWithPulse` exists in BOTH popup.js AND modtools.js — appropriate, but watch for drift

**Where:** `popup.js:365-408` (43 lines) AND `modtools.js:7176-7215` (40 lines, var → let / function syntax matches modtools convention).

The two implementations are near-identical. They DIFFER only in:
- `popup.js` uses `var` declarations (popup.js convention).
- `modtools.js` uses `const`/`let` (modtools.js convention).
- Line counts differ by ~3 due to whitespace.

**Why the duplication exists:** popup.html and content-script run in different JS realms (popup is the extension popup window, modtools is a content script injected into greatawakening.win pages). They cannot share a function via global scope. Either:
- (a) Define the utility in a shared module imported by both. The repo doesn't use ES modules in either file.
- (b) Inline-duplicate. Current state.

**Drift risk:** if Finding 7 (double-click bug fix) ships in popup.js but not modtools.js (or vice versa), the surfaces will diverge. Lead has a slightly different copy-pulse experience from mod. Audit-followups should always touch BOTH files together.

**Recommendation:** keep duplication, but add a comment in each location pointing at the other ("Mirror this in modtools.js:7176 if you change anything"). Low priority.

---

## Section 4 — Recommendations (ranked, scope-conservative)

| Rank | Item | Files | Effort |
|---|---|---|---|
| 1 | **Fix Finding 7 (double-click corrupts label)** — P1 functional bug. Add `__copyPulseTimer`/`__copyPulseOrigLabel` tracking on button. Patch BOTH popup.js + modtools.js together. | popup.js, modtools.js | XS (~6 lines each) |
| 2 | **Migrate Findings 1, 3 (P6, P9, P10 in call-site table)** — three button-driven copy flows on lead-relevant surfaces. Net +0 lines (the manual `textContent` swaps replaced by `copyWithPulse(btn, url)`). | popup.js | XS (~3 swaps) |
| 3 | **Migrate Finding 2 (P7 in call-site table)** — `maintDiagExport` button pulse. Requires plumbing `btn` through `__maintWireBtn`. Maintain status div in addition. | popup.js | S (~6 lines) |
| 4 | **Fix Finding 6 (textarea leak on throw)** — P3 hygiene. Wrap removeChild in finally block. Patch BOTH files. | popup.js, modtools.js | XS (~3 lines each) |
| 5 | **Fix Finding 5 (Layer 2 Promise not awaited)** — P2 strict-correctness. Make `copyWithPulse` async + await writeText. Non-breaking for current synchronous callers. | popup.js, modtools.js | XS (~2 keywords each) |
| 6 | **Defer Finding 4 (orphaned-banner reload button)** — P3 borderline. Either leave or extend with `opts` param. Out of scope for v10.13. | modtools.js | XS if pursued |
| 7 | **Defer Finding 8 (drift watch)** — meta-hygiene. Add cross-file pointer comment. Pure documentation. | popup.js, modtools.js | XS |

**Total v.next budget if all P1+P2 ship: ~30 lines across two files, ~30 minutes work.**

---

## Section 5 — Verdict

**W5 AC ("All 4-7 copy call sites migrated to the utility") — PASS-with-caveat.**

The three named surfaces (popup token copies via `__makeCopyBtn`, debug dump via `diagExportErrors`, AI card copy via `intelAiCopy`) ship correctly through `copyWithPulse`. The utility itself is correctly structured (3-layer fallback, focus-gated Layer 2, PRM-guarded keyframe).

**But the spirit of the AC ("eliminate the copy-confirmation credibility gap") is partial** — four button-driven copy flows on lead-relevant surfaces (rotation roster fallback, maint diag export, lead deep-dive Rotate, Quick Actions Invite) still ship the manual-textContent-swap pattern that `copyWithPulse` was meant to retire. These represent ~5 minutes of v.next work.

**One real functional bug (Finding 7, double-click)** lurks in shipped code. P1 priority for v.next. Same defect in both popup.js and modtools.js — must patch together.

**Two minor strict-correctness gaps (Findings 5, 6)** are P2/P3 hygiene. Defensible to defer.

**Hunt list verdict:**
- Hunt 1 (Layer 1 typeof safety): PASS.
- Hunt 2 (Layer 2 focus check): PASS.
- Hunt 3 (Layer 3 textarea cleanup): MARGINAL — leaks on rare throw path (Finding 6).
- Hunt 4 (1200ms revert race): **FAIL** — Finding 7, real bug.

---

*End of RALPH-COPY-CLIPBOARD audit. Read-only. No code modified. No git operations performed.*
