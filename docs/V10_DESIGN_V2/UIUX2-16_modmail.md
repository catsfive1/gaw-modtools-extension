# UIUX2-16 -- Modmail Design Audit V2
**Auditor:** UIUX2-16-MODMAIL
**Generated:** 2026-05-10
**Source:** `modtools.js` (26,657 lines, v10.8.0+), `docs/V10_UiUX/UIUX-04_modmail.md` (v1 audit)
**Scope:** Popover (`_showModmailPopover`), 3-col panel (`_showModmailPanel`), AI 4-tone reply cards (`renderAICards`, `__renderDrafts`), draft persistence indicator, send-button state machine

---

## A. V1 Patch Status -- What Shipped, What Missed

The v1 audit (UIUX-04, 2026-05-09) identified six code-level issues across P0/P1. This section gives a definitive pass/fail verdict for each by reference to live line numbers.

### A.1 -- Send button stuck-disabled on success [v1 P0-A.1] -- FIXED

**Evidence:** Lines 9970-9975. After `btn.textContent = '✓ Sent'`, a `setTimeout(1.5s)` fires `btn.disabled = false; btn.textContent = 'Send message'; body.value = '';`. The mod can send a follow-up after 1.5s without reopening.

**Residual (new):** The reset label at line 9973 is `'Send message'`, but the original button text at line 9732 is `'\u{21A9}\u{FE0F} Send message'` (arrow-return emoji). The reset drops the arrow. Minor visual regression -- the button visually changes personality on first use and never recovers the arrow. Low priority, but fix is a one-liner: change `btn.textContent = 'Send message'` to `btn.textContent = '↩️ Send message'`.

### A.2 -- Cold cache fallback for AI drafts [v1 P0-A.2] -- FIXED

**Evidence:**
- Panel `renderDetail` lines 16928-16938: after session cache miss, reads `gam_modmail_drafts_local` from `chrome.storage.local` with a 4-hour TTL guard.
- Popover `_showModmailPopover` lines 17105-17115: same fallback on cold `__draftCache`.

Both surfaces now survive browser restart with warm AI candidates. Complete fix.

### A.3 -- 3-col breakpoint at 1280px [v1 P1-B.1] -- FIXED

**Evidence:** Line 16762: `const mmIs3Col = window.innerWidth >= 1400;`. The v10.6.2 hotfix comment is inline. At 1366px, panel is now 680px (49.8% viewport). Commander complaint resolved.

### A.4 -- Tone color inconsistency [v1 P1-B.2] -- FIXED

**Evidence:** Lines 57-65. `GAM_TONE_COLOR` is a module-level frozen const used by `tonecolor()`. All three card surfaces (panel `renderAICards` at 16967, popover pre-fetched `__renderDrafts` at 17219, popover on-demand at 17270) call `tonecolor(rp.tone)`. The ban-tab inline (8856) and mm_reply inline (9856) also call `tonecolor()`. Single source of truth in place.

**Note:** `neutral` and `curious` are in the const but the worker never returns them (per code inspection). No issue, but the const is forward-compatible.

### A.5 -- AI card shimmer skeleton [v1 P1-B.3] -- PARTIAL

**Fixed surfaces:** Ban-tab inline (lines 8834-8846) and mm_reply inline (lines 9820-9832) both render 4 ghost cards with `.gam-ai-skeleton` during the RPC. The CSS at line 22004-22011 provides the shimmer animation.

**Remaining gap -- panel cold path:** Line 16946 still renders:
```
⌛ AI drafting (4 calls in parallel, ~3-5s)...
```
as a plain `<div>`. The panel's "Generate 4 AI replies" button click handler does NOT mount the 4-ghost shimmer grid before awaiting the RPC. This is the one surface where the skeleton was not backported. Patch spec in Section G.

### A.6 -- Draft auto-save indicator [v1 P1-B.4] -- FIXED

**Evidence:** `_showDraftSavedChip()` at lines 17946-17958 creates a `.gam-draft-saved` span with `color:#3dd68c`, opacity:0 base, fades in on each debounced save and auto-fades after 1.5s. Called at line 9914 inside the `chrome.storage.session.set().then()` resolve path. The indicator is visible after the user edits a macro in the mm_reply tab.

---

## B. New Issues -- Code Audit V2

### B.1 -- P1: Popover pre-fetched drafts path missing `modmailTrackResponse` [NEW]

**File:** `modtools.js:17227-17232` (`_showModmailPopover`, `__renderDrafts` function, `useBtn` click handler)

When ambient pre-fetch has already cached AI drafts for a thread, clicking "Copy + open" in the popover routes through `__renderDrafts`. This handler (lines 17227-17232) copies the body and opens the thread but does NOT fire `modmailTrackResponse`:

```js
useBtn.addEventListener('click', async (ce) => {
  ce.stopPropagation();
  try { await navigator.clipboard.writeText(rp.body); } catch(_){}
  window.open('https://greatawakening.win/modmail/thread/...' , '_blank');
  try { snack('✓ Reply copied. Paste on the GAW thread.', 'success'); } catch(_){}
});
```

The on-demand path (`aiBtn.addEventListener` at lines 17278-17292) correctly fires `modmailTrackResponse`. The pre-fetched path does not. This means the majority of AI usage -- where ambient pre-fetch works correctly -- is invisible to the tracking loop. The AI learning loop relies on `modmailTrackResponse` to close the feedback cycle; missing it on the hot path invalidates usage analytics.

**Impact:** `ai_used=1` is systematically under-reported whenever ambient pre-fetch succeeds (the common case). The dashboard will show AI usage near zero even if mods are using AI drafts on every reply.

**Fix:** Add the `modmailTrackResponse` call to `__renderDrafts` `useBtn.addEventListener`:
```js
try {
  rpcCall('modmailTrackResponse', {
    thread_id: t.thread_id, sender: t.first_user,
    subject: t.subject || '', response_body: rp.body,
    ai_used: 1, ai_tone: rp.tone || null,
    sent_at: Date.now()
  }).catch(() => {});
} catch(_){}
```

### B.2 -- P2: Intel strip badge write race on rapid thread switching [NEW]

**File:** `modtools.js:17008-17036` (`_renderIntelStrip`, inner async IIFE)

`_renderIntelStrip(t)` is called synchronously at line 16912 inside `renderDetail`. It immediately writes placeholder badges to `#gam-mmp-intel`, then fires an async IIFE that resolves `getUserSummary` and writes to `panel.querySelector('#gam-intel-age')` etc.

If the mod clicks thread A then thread B within 200-500ms (before thread A's async resolves), the `_renderIntelStrip` for thread B runs first (overwriting the badges with B's placeholder), but thread A's async settles and then writes to the SAME badge elements with A's data. Thread B's intel strip shows thread A's data.

The issue is `panel.querySelector` at lines 17022-17025 -- it queries the entire panel rather than the specific strip element captured at call time:
```js
const ageEl   = panel.querySelector('#gam-intel-age');
```

**Fix:** Capture the strip element at sync time before the async:
```js
function _renderIntelStrip(t) {
  const strip = panel.querySelector('#gam-mmp-intel');
  if (!strip) return;
  // ... write placeholders ...
  const ageEl   = strip.querySelector('#gam-intel-age');
  const banEl   = strip.querySelector('#gam-intel-ban');
  const susEl   = strip.querySelector('#gam-intel-sus');
  const watchEl = strip.querySelector('#gam-intel-watch');
  // pass by closure into the async IIFE -- resolved values only write if strip still in DOM
  (async function() {
    // ... fetch intel ...
    if (!strip.isConnected) return; // guard: user closed panel or switched thread
    // write to captured elements, not re-queried
  })();
}
```

### B.3 -- P2: Panel AI card body stored in HTML attribute (fragile, XSS-adjacent) [NEW]

**File:** `modtools.js:16972` (`renderAICards`)

```js
'<button data-use-body="' + escapeHtml(rp.body) + '" ...>'
```

`escapeHtml` neutralizes `<>&"'` but `rp.body` values from the worker can be multi-line (newlines become `&#10;` in the attribute, but `getAttribute` restores them). The issue is not XSS (escapeHtml is correct), but the attribute storage pattern fails on reply bodies > ~1000 chars on some browser/extension sandbox contexts where attribute size is capped. More practically: the body is fully duplicated in the DOM (once in the `<div>` display element, once in the button attribute), doubling memory for a UI that can have 4 cards x 30 threads in cache.

**Fix:** Use a closure over `rp.body` directly in the `addEventListener` (the pattern used by `__renderDrafts` in the popover at line 17229):
```js
// Instead of:
'<button data-use-body="' + escapeHtml(rp.body) + '">'
// Use addEventListener with closure -- already the pattern in the popover path
```

The cards function at 16963 uses `innerHTML` string-building which prevents closure capture. Rewrite `renderAICards` to use DOM construction (matching the `__renderDrafts` pattern) or keep innerHTML but drop `data-use-body` and pass body via a Map keyed by index.

### B.4 -- P2: Panel AI column card grid 2-col at 320px is too narrow for reply bodies [NEW]

**File:** `modtools.js:16976`

```js
host.innerHTML = head + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + cards + '</div>';
```

The AI column is fixed at 320px (`width:320px` at line 16796). With 10px host padding (line 16800), inner width = 300px. Two columns with 8px gap = ~146px per card. Cards use `white-space:pre-wrap` for the body (line 16970), so reply text wraps. A firm reply of "Your post was removed for violating Rule 5 -- no personal attacks..." at 80 chars wraps to ~6 lines in 146px at 11px monospace. The cards become tall and the AI column requires heavy scrolling.

The `__renderDrafts` popover path correctly uses the same 2-col grid (`display:grid;grid-template-columns:1fr 1fr;gap:4px` at line 17214) but inside a 480px-wide popover, giving ~220px per card -- much more workable.

**Fix options:**
1. Single-column layout in the 320px AI panel: `grid-template-columns:1fr`. Cards are wider (300px), show more text, less scrolling. Slight vertical elongation is fine.
2. Truncate card bodies to 3-4 lines with `overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical` and provide "Expand" or "Copy" that shows the full text.
3. Keep 2-col but cap AI column at 400px (requires widening panel to 1000px at 3-col, acceptable at >= 1440px viewport).

Recommendation: option 2 -- 4-line clamp with the "Copy + open" button below -- matches the popover pattern (line 17222: `max-height:80px;overflow-y:auto`).

### B.5 -- P3: Popover `_loadModmailList` firehose state not reflected in `[↻ REFRESH]` label [NEW]

**File:** `modtools.js:17082-17087`

```js
if (e.target.closest('[data-refresh]')) {
  e.stopPropagation();
  _loadModmailList(true);
  return;
}
```

When the mod clicks `↻ REFRESH`, `_loadModmailList(true)` fires and the popover body text updates to the firehose in-progress message. But the REFRESH button itself gives no feedback -- it remains `↻ REFRESH` with no disabled state, no spinner, no color change. A mod who clicks twice fires two concurrent firehose crawls.

**Fix:** Disable the refresh button during the load:
```js
const refreshBtn = e.target.closest('[data-refresh]');
if (refreshBtn) {
  e.stopPropagation();
  refreshBtn.disabled = true;
  refreshBtn.textContent = '⏳';
  _loadModmailList(true).finally(() => {
    refreshBtn.disabled = false;
    refreshBtn.textContent = '↻ REFRESH';
  });
  return;
}
```
`_loadModmailList` is async -- the `.finally()` resets once the list resolves.

### B.6 -- P3: Send button "empty guard" is error-snack only, not `disabled` state [v1 B.6 -- remains] [NEW]

**File:** `modtools.js:9935`

```js
if (!message){ snack('Message is empty', 'error'); return; }
```

The button is never `disabled` when the textarea is empty. The existing guard prevents accidental empty send, but the expected visual contract for a send button is disabled-until-content. The mod has no visual cue that the button is inactive. This was noted in v1 as low priority -- still unaddressed.

**Fix:** Add an `input` listener on `body` to toggle `btn.disabled` based on `body.value.trim().length > 0`. One-liner wired at tab mount time.

---

## C. 3-Column Layout -- Current State at Key Viewports

Breakpoint fix confirmed in v10.6.2 HOTFIX at line 16762. Current layout matrix:

| Viewport | Mode | Panel width | Viewport coverage | Verdict |
|---|---|---|---|---|
| >= 1920px | 3-col | 920px | 47.9% | GOOD |
| 1440px | 3-col | 920px | 63.9% | OK |
| 1400px | 3-col | 920px | 65.7% | MARGINAL -- edge of breakpoint |
| 1366px | 2-col | 680px | 49.8% | GOOD -- Commander issue resolved |
| 1280px | 2-col | 680px | 53.1% | GOOD |
| < 680px | 2-col (capped) | 95vw | 95% | USABLE but AI col hidden |

**Remaining layout gap (P3):** The 2-col mode hides `#gam-mmp-ai` (`display:none` at line 16796) but the AI column's content is still rendered to the DOM. The panel width changes from 920px to 680px but the AI host div (`#gam-mmp-ai-host`) still has `renderAICards` called into it -- content is built but invisible. This is a minor wasted RPC + render, not a breakage.

**3-col column proportions at 920px:**
- Col 1 (thread list): 240px -- 26.1%
- Col 2 (intel + messages): flex:1 = 360px -- 39.1%
- Col 3 (AI drafts): 320px -- 34.8%

The 60/40 split between content (Col 2) and AI (Col 3) is intentional but Col 2 feels compressed for long reply bodies. The `#gam-mmp-detail` inner content area at 14px padding = 332px effective width for the `pre-wrap` message display. Acceptable but close.

---

## D. AI Tone Palette -- 4-Tone Design Review

Current palette (line 57-63):

| Tone | Color | Hex | Design assessment |
|---|---|---|---|
| firm | Red | `#ff3b3b` | Strong signal -- correctly signals assertive action. Risk: red is also error color. |
| empathetic | Sky blue | `#66ccff` | Calm, approachable. Good contrast on dark `#0a0a0b`. |
| brief | Yellow | `#ffd84d` | Neutral-efficient. Visually distinct from the others. |
| escalate | Amber | `#ff9933` | Shares hue with the global GAM brand accent. Risk: escalate and brand accent indistinguishable at small size. |
| fallback | Gray | `#9b9892` | Correct -- unknown tones degrade gracefully. |

**Design issues:**

1. **firm vs error color conflict:** `#ff3b3b` is used for both "firm" tone and error states (e.g., line 16839 error display uses `color:#ff3b3b`). In the AI card column where both can appear simultaneously (e.g., one card shows firm reply while another card above fails), the mod must parse context to distinguish intent from error. Consider shifting firm to `#ff6b6b` (lighter red, clearly intentional vs error) or desaturate to `#e05a5a`.

2. **escalate vs brand accent:** `#ff9933` is used for escalate tone AND for all primary UI accent elements (thread selected state at line 16870, status bar brand elements, refresh button borders throughout). The escalate card label uses this amber, making it read as "primary/normal" rather than "elevated concern." Consider shifting escalate to a distinct color: `#f5a623` (deeper amber) or `#ff7b00` (orange-red).

3. **Card label type size is 10px on firm/escalate:** At `font-size:10px` (line 16969) with `letter-spacing:0.06em` and `text-transform:uppercase`, the tone labels are readable but at the minimum viable size. The color is the primary differentiator. Recommend bumping to 11px to reduce the burden on color alone (addresses accessibility rule `color-not-only`).

4. **No tone icon:** The tone label is text-only (`firm`, `empathetic`, etc.). Adding a small inline icon (e.g., `⚠` for escalate, `✦` for firm, `♡` for empathetic, `→` for brief) would provide a second differentiator beyond color, meeting the WCAG `color-not-only` rule. The existing system uses emoji in other labels (line 9772: `✨`, line 9769: `➕`) -- one emoji per tone card is consistent with existing style.

---

## E. Draft Auto-Save UX -- Current Implementation

The save indicator added in v10.8.0 M5 (`_showDraftSavedChip`, line 17946) is implemented as:

- A `<span class="gam-draft-saved">` appended to the textarea's `parentNode`
- Text: `✓ Saved`, color `#3dd68c` (green), 9px monospace uppercase
- Appears on each debounced save (350ms), fades out after 1.5s
- Located in the `.gam-mc-field` container, next to the label row

**Positives:**
- Non-blocking: does not interrupt typing
- Resets correctly on repeated saves (timer is cleared and restarted at line 17957)
- Color (`#3dd68c`) is distinct from tone colors and error states

**Issues:**

1. **No `Saving...` state:** The chip skips the "in-progress" moment. `chrome.storage.session.set` is async but fast enough that the `✓ Saved` appears without any transition delay in practice. However, on storage contention or extension overhead, there could be a 50-200ms gap where nothing shows. Consider showing `Saving...` immediately on input-debounce trigger and replacing with `✓ Saved` on `.then()`.

2. **Indicator position relative to textarea:** The chip is appended to `body.parentNode` (the `.gam-mc-field` wrapper), positioned absolute at `top:0;right:0` (from `_showDraftChip`'s style at line 25507). The `_showDraftSavedChip` at line 17952 does NOT set `position:absolute` -- it relies on the flex flow of the parent. Without knowing the exact DOM structure at call time, the chip may flow inline below the textarea label rather than overlaying it. This should be QA'd visually.

3. **Ban-tab equivalence:** The ban-tab's auto-save debounce (`mm_reply` kind, `ban_msg` kind) at lines 9904-9918 wires `_showDraftSavedChip`. The ban-tab send path at line 8936-9537 does not clear the saved chip visually on send -- the chip persists with `✓ Saved` after the message is actually sent and the form might be about to reset. The chip should be removed (or fade immediately) on successful send.

---

## F. Send-Button State Machine -- Full Analysis

The mm_reply send button (`#mc-msg-send`) traverses these states:

| State | Condition | Visual | disabled? |
|---|---|---|---|
| Idle-empty | Textarea empty, tab open | `↩️ Send message` | No (should be Yes -- see B.6) |
| Idle-ready | Textarea has content | `↩️ Send message` | No |
| Sending | `btn.disabled = true` after click | `↩️ Send message` (grayed) | Yes |
| Success | After `.then()` resolves | `✓ Sent` | Yes |
| Reset | After 1.5s setTimeout | `Send message` (no emoji) | No |
| Error | `!r.ok` path | `↩️ Send message` (re-enabled) | No |

**Issues:**

1. **Idle-empty is not disabled** (B.6 above). The guard is snack-only.
2. **Success state label drops the emoji** (A.1 residual above). `✓ Sent` is correct but Reset loses `↩️`.
3. **No timeout on the Sending state.** If `apiSendModMessage` hangs (network stall, worker timeout), the button stays stuck in disabled/Sending with "Sending..." banner indefinitely. No timeout, no retry affordance.
   - **Fix:** Add `AbortController` with a 30s timeout to `apiSendModMessage`, or a `Promise.race([send, timeout])` at the call site that re-enables the button after 30s with an error message.
4. **Concurrent double-click.** `btn.disabled = true` fires synchronously on first click, so a second click before the first await is blocked. This is correct. No issue.

---

## G. Patch Specifications for V2

These are implementation-ready descriptions. RALPH or FORGE executes.

### G.1 -- Panel AI cold-path shimmer skeleton [P1, from A.5]

**File:** `modtools.js` line 16946

**Before:**
```js
aiHost.innerHTML = '<div style="color:#9b9892;font-size:11px;padding:8px 0">⌛ AI drafting (4 calls in parallel, ~3-5s)...</div>';
```

**After:** Replace with the same 4-ghost grid pattern used in ban_msg (line 8834-8846):
```js
(function() {
  var _skGrid = document.createElement('div');
  _skGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px';
  for (var _gi = 0; _gi < 4; _gi++) {
    var ghost = document.createElement('div');
    ghost.className = 'gam-ai-skeleton';
    ghost.style.cssText = 'background:#1a1a1d;border:1px solid #2a2825;padding:8px;height:80px;position:relative;overflow:hidden';
    ghost.innerHTML = '<div style="height:8px;background:#2a2825;width:30%;margin-bottom:6px"></div>' +
      '<div style="height:6px;background:#2a2825;width:90%;margin-bottom:4px"></div>' +
      '<div style="height:6px;background:#2a2825;width:80%;margin-bottom:4px"></div>' +
      '<div style="height:6px;background:#2a2825;width:60%"></div>';
    _skGrid.appendChild(ghost);
  }
  aiHost.innerHTML = '';
  aiHost.appendChild(_skGrid);
})();
```

**Why not just use `innerHTML`:** The shimmer animation is CSS-driven via `gam-ai-skeleton::after` (line 22005-22011). The `::after` pseudo-element requires `position:relative;overflow:hidden` on the host element. Setting this via `style.cssText` on a DOM node (not an innerHTML string) is cleaner and avoids the CSS parse of inline `::after`. The existing ban_msg and mm_reply paths use DOM construction for this reason.

### G.2 -- Popover pre-fetched draft tracking [P1, from B.1]

**File:** `modtools.js` lines 17227-17232 (`__renderDrafts` useBtn click handler)

**Before:** (useBtn click, lines 17227-17232)
```js
useBtn.addEventListener('click', async (ce) => {
  ce.stopPropagation();
  try { await navigator.clipboard.writeText(rp.body); } catch(_){}
  window.open('https://greatawakening.win/modmail/thread/' + encodeURIComponent(t.thread_id), '_blank');
  try { snack('✓ Reply copied. Paste on the GAW thread.', 'success'); } catch(_){}
});
```

**After:** Add tracking call before clipboard write:
```js
useBtn.addEventListener('click', async (ce) => {
  ce.stopPropagation();
  try {
    rpcCall('modmailTrackResponse', {
      thread_id: t.thread_id, sender: t.first_user,
      subject: t.subject || '', response_body: rp.body,
      ai_used: 1, ai_tone: rp.tone || null, sent_at: Date.now()
    }).catch(function(){});
  } catch(_){}
  try { await navigator.clipboard.writeText(rp.body); } catch(_){}
  window.open('https://greatawakening.win/modmail/thread/' + encodeURIComponent(t.thread_id), '_blank');
  try { snack('✓ Reply copied + tracked. Paste on the GAW thread.', 'success'); } catch(_){}
});
```

**Snack update:** Change snack text from `✓ Reply copied.` to `✓ Reply copied + tracked.` (matching the on-demand path) so the mod knows tracking fired.

### G.3 -- Intel strip stale race guard [P2, from B.2]

**File:** `modtools.js` lines 17022-17025 (inside the async IIFE in `_renderIntelStrip`)

**Before:**
```js
const ageEl   = panel.querySelector('#gam-intel-age');
const banEl   = panel.querySelector('#gam-intel-ban');
const susEl   = panel.querySelector('#gam-intel-sus');
const watchEl = panel.querySelector('#gam-intel-watch');
```

**After:** Capture at sync time and add stale guard:
```js
// Move these four lines BEFORE the async IIFE, using strip (already captured):
const ageEl   = strip.querySelector('#gam-intel-age');
const banEl   = strip.querySelector('#gam-intel-ban');
const susEl   = strip.querySelector('#gam-intel-sus');
const watchEl = strip.querySelector('#gam-intel-watch');
// Inside the async IIFE, add at top:
if (!strip.isConnected) return; // guard: panel closed or thread switched
```

### G.4 -- Send button empty guard [P3, from B.6]

**File:** `modtools.js`, `renderMessageTab` function, after textarea `body` is queried

**After the line** `const body = root.querySelector('#mc-msg-body');` (around line 9739), add:
```js
// Disable send when textarea is empty
(function() {
  var sendBtn = root.querySelector('#mc-msg-send');
  if (!sendBtn || !body) return;
  function _toggleSend() {
    sendBtn.disabled = (body.value.trim().length === 0);
  }
  _toggleSend();
  body.addEventListener('input', _toggleSend);
})();
```

### G.5 -- Refresh button feedback during firehose [P3, from B.5]

**File:** `modtools.js`, popover click handler around line 17083-17087

**Before:**
```js
if (e.target.closest('[data-refresh]')) {
  e.stopPropagation();
  _loadModmailList(true);
  return;
}
```

**After:**
```js
const _rBtn = e.target.closest('[data-refresh]');
if (_rBtn) {
  e.stopPropagation();
  _rBtn.disabled = true;
  _rBtn.textContent = '⏳';
  _loadModmailList(true).finally(function() {
    _rBtn.disabled = false;
    _rBtn.textContent = '↻ REFRESH';
  });
  return;
}
```

Note: `_loadModmailList` is async (it `return`s the `rpcCall().then()` chain). Confirm the function actually returns the Promise at the top level before wiring `.finally()` -- review lines 17123-17304 to verify the outer `async function _loadModmailList()` declaration returns the inner promise correctly.

### G.6 -- Send button Reset emoji restore [P3, from A.1 residual]

**File:** `modtools.js` line 9973

**Before:**
```js
btn.textContent = 'Send message';
```

**After:**
```js
btn.textContent = '↩️ Send message';
```

---

## H. Summary and Priority Queue

### Fixed in v10.8.0 (confirmed by code)
All v1 P0 and P1 issues are resolved in the live source except A.5 (partial). No regressions introduced except A.1 residual emoji label drop (P3).

### New findings prioritized

| ID | Severity | Issue | File + Line | Impact |
|---|---|---|---|---|
| B.1 | P1 | Popover pre-fetched drafts missing `modmailTrackResponse` | L17227-17232 | AI usage analytics systematically under-counted |
| A.5 gap | P1 | Panel cold-path AI loading: no shimmer skeleton | L16946 | 3-5s blank wait in most-used surface |
| B.2 | P2 | Intel strip stale-data race on rapid thread switch | L17022-17025 | Wrong user data displayed in intel strip |
| B.3 | P2 | AI card body stored in `data-use-body` attribute | L16972 | DOM bloat; fragile on long bodies |
| B.4 | P2 | Panel AI 2-col card grid too narrow at 320px | L16976 | Cards require heavy scroll; body text cramped |
| D.1 | P2 | firm/error color conflict (`#ff3b3b` for both) | L58 | Intent vs error distinction ambiguous |
| D.2 | P2 | escalate/brand accent same amber (`#ff9933`) | L61 | Escalate reads as normal/primary |
| B.5 | P3 | Refresh button no feedback during firehose | L17083-17087 | Double-fire risk; no loading signal |
| E.3 | P3 | Saved chip persists after successful send | L9952 area | Stale indicator after form reset |
| B.6 | P3 | Send button not disabled when textarea empty | L9935 | Visual inconsistency, not breakage |
| A.1r | P3 | Send reset drops arrow emoji | L9973 | Cosmetic regression |
| F.3 | P3 | No send timeout / stuck Sending state | L9944 | Blocked form on network stall |

### Recommendation
Ship G.1 and G.2 together as the highest-value patch: panel skeleton completes the B.3 fix (making all three surfaces consistent), and the tracking fix closes the AI analytics hole that makes the entire modmailTrackResponse feature unreliable. Both are surgical 10-15 line changes. B.2 (intel race) is also quick and should ship with it.

The tone palette issues (D.1, D.2) require Commander direction -- changing hex values in `GAM_TONE_COLOR` is a one-liner but the color choices are design decisions, not bugs.
