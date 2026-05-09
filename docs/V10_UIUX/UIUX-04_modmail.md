# UIUX-04 -- Modmail Audit
**Auditor:** UIUX-04-MODMAIL
**Generated:** 2026-05-09
**Source:** `modtools.js` (24,081 lines), `popup.js`, `docs/V10_V11/03_MODMAIL_3COL.md`, `docs/UAT_MODMAIL_2026-05-08.md`

---

## A. P0 (broken)

### A.1 -- Send button stays disabled on success (mm_reply path)
**File:** `modtools.js:9460-9498`

On a successful send in the Message tab (mm_reply), `btn.disabled = true` is set at line 9466
and is NEVER re-enabled after success. On failure (`!r.ok`) the button is correctly
re-enabled at line 9476. On success the button mutates to `'✓ Sent'` (line 9497) but
`disabled` stays true. The mod cannot send a second message to the same user in the same
session without closing and reopening the Mod Console. This is a usability break that blocks
fast multi-message flows.

**Reproduction:** Open Mod Console for a user > Message tab > send a message > send button
shows "Sent" checkmark and is stuck disabled. No way to reset it without reopening the panel.

**Fix:** Add `btn.disabled = false;` after line 9497 -- OR (better) clear the textarea and
reset the button so the tab is ready for a follow-up message:
```js
// after line 9497:
btn.disabled = false;
btn.textContent = '\u{21A9}️ Send message';
body.value = '';
subj.value = subj.value; // leave subject for followup
```

---

### A.2 -- AI replies never load in the modmail panel when panel is opened cold (session-local mirror read gap)
**File:** `modtools.js:16056-16062`, `modtools.js:22174-22179`

When `_showModmailPanel()` renders a thread, it reads the AI draft cache ONLY from
`chrome.storage.session` (`gam_modmail_drafts`). Session storage is cleared when the browser
session ends or when the extension reloads. The `_mirrorDraftToLocal` function
(lines 22174-22179) writes `gam_modmail_drafts_local` to `chrome.storage.local` as a TTL
fallback, but `renderDetail` in the panel (line 16058-16062) has NO fallback read from
`chrome.storage.local`. On a fresh browser start or post-extension-update, the session cache
is empty, the panel shows "Generate 4 AI replies" button with no pre-fetched content,
and the ambient prefetch doesn't run until the first inbox click after a 500ms delay.

**The popover (`_showModmailPopover`) has the same gap** -- `__draftCache` is populated from
session only (line 16227-16229).

The `popup.js` side correctly reads `gam_modmail_drafts_local` (line 5630-5631) for its purge
logic, confirming the local mirror exists -- but neither panel nor popover reads it.

**Impact:** Every fresh browser session shows cold cache. Mods waiting on AI candidates for
30+ seconds on first open. The ambient prefetch starts on inbox click but takes 3-5s per
batch and only pre-fetches 3 threads per cycle.

**Fix:** In `renderDetail`, after session cache miss, fall back to local:
```js
// after: cached = cache[t.thread_id];
if (!cached) {
  try {
    const localOut = await chrome.storage.local.get('gam_modmail_drafts_local');
    const localStore = localOut && localOut.gam_modmail_drafts_local;
    if (localStore && localStore.drafts) cached = localStore.drafts[t.thread_id];
  } catch(_) {}
}
```
Same fix needed in `__draftCache` initialization in `_showModmailPopover` (line 16226-16230).

---

### A.3 -- `enhanceModmailRead` is dead by default
**File:** `modtools.js:11344`

```js
if (getSetting('statusBarCompact', true)) return;
```

`statusBarCompact` defaults to `true` (line 1510). This means `enhanceModmailRead` -- the
function that injects the ModTools action bar on `/modmail/thread/<id>` pages -- silently
exits on every call for every mod who has never changed this setting. The bar with Intel,
Ban, Unban, and Note buttons never appears. The feature is wired, init'd correctly via
`safeFeature('enhanceModmailRead', ...)` (line 22441), but gates on a setting whose default
kills it. This is effectively a dead feature unless a mod discovers `statusBarCompact`
and turns it off.

**Fix (intent ambiguity):** If the bar is meant to appear only in non-compact mode, the
logic is correct but the default should be `false`. If the bar should always show on modmail
thread pages regardless of compact mode, remove the gate entirely. Need Commander direction on
which intent is correct.

---

### A.4 -- Modmail send in the PANEL has no send path at all
**File:** `modtools.js:16041-16053` (renderDetail)

The full-screen modmail panel (`_showModmailPanel`) renders thread details including
message body and an "Open thread on GAW" button. There is NO send textarea, NO reply form,
and NO call to `apiSendModMessage` anywhere inside the panel. The AI card "Copy + open"
buttons (lines 16101-16116) copy the reply to clipboard and open the thread in a new tab,
leaving the mod to paste manually into the native GAW form. This is a deliberate architectural
choice (per UAT_MODMAIL_2026-05-08 §D), but it means:

- The tracking loop (`modmailTrackResponse`) is only fired when the mod uses the "Copy + open"
  button -- it does NOT fire when the mod actually sends via GAW native form.
- There is no visual send confirmation in the panel. The panel shows only draft candidates,
  not "send from here" capability.

This is a known architectural gap (UAT §D), not a regression. However, the "Copy + open"
flow DOES now fire `modmailTrackResponse` at copy time (lines 16106-16112 in the panel,
16398-16404 in the popover) -- this was added in v9.23.0. The loop fires on copy, not on
actual send, which overstates AI usage but is better than never.

**Status:** Not fully broken, but architect should decide whether to add `data-send-direct`
buttons per UAT §E.1 recommendation.

---

## B. P1 (high-friction)

### B.1 -- 3-column layout: SPEC SHIPPED BUT `detail.querySelector` BUG CONFIRMED
**Files:** `modtools.js:15895-15938`, `modtools.js:16056`

The 3-column layout from `03_MODMAIL_3COL.md` spec IS implemented in the current code
(lines 15895-15938). The panel correctly computes `mmIs3Col = window.innerWidth >= 1280`,
sets width to `920px` at >= 1280px and `680px` below, and renders the three-column DOM.
The AI column (`#gam-mmp-ai`) is shown/hidden conditionally. The intel strip is rendered
via `_renderIntelStrip(t)` called inside `renderDetail`.

**However, one critical bug from the spec (E2) is fixed correctly:**
`aiHost = panel.querySelector('#gam-mmp-ai-host')` at line 16056 -- uses `panel.querySelector`,
not `detail.querySelector`. This is the correct fix per spec E2. No regression here.

**Width complaint (Commander ADVOCATE F):** At 1366px (a common laptop display), the panel
correctly falls into 3-col mode (`1366 >= 1280` = true) and renders at 920px wide.
920px / 1366px = 67.4% of the viewport. This leaves only 446px of page visible -- for
the typical GAW layout this does occlude most of the post feed. The spec did not account for
1366px as an edge case; 920px is only safe above ~1400px.

**Recommendation:** Lower the 3-col breakpoint to `>= 1400px` and the 3-col width to
`860px`. At 1366px, fall to 2-col at `680px` (49.8% of viewport). Or keep 3-col but allow
drag-resize (spec deferred this to v.next).

**Mobile:** There is no media-query or viewport check below 680px. At < 680px the
`max-width:95vw` cap kicks in but the internal flex columns don't reflow -- at ~375px
(iPhone SE) the panel is 95% wide but col 1 (240px) and col 3 (320px) fight for space
and col 2 (`flex:1`) collapses near zero. Not a real-world issue for mods on mobile, but
worth noting.

---

### B.2 -- AI reply card UX: confidence score absent; tone labels present but incomplete palette
**Files:** `modtools.js:16086-16118` (panel `renderAICards`), `modtools.js:9382-9404` (mod-console inline), `modtools.js:8424-8436` (ban-tab inline)

**Confidence score:** Not present anywhere in the card rendering. The AI reply RPC returns
`ar.data.replies` -- each entry has `tone`, `label`, `body`. No `confidence` or `score`
field is rendered. UAT_MODMAIL §B.3 identifies this as a missing feature; no confidence
signal means no auto-sort and no threshold for future auto-send.

**Tone labels: present, but palette inconsistency:**
The spec (brief) says 4 tones: `firm/neutral/empathetic/curious`.
The code renders 4 tones: `firm/empathetic/brief/escalate`.
These are different sets. `toneColor` maps (line 16090, 16333, 16385):
```js
{ firm:'#ff3b3b', empathetic:'#66ccff', brief:'#ffd84d', escalate:'#ff9933' }
```
The mod-console inline path (line 9386) has only 3 colors (firm/empathetic/other).
The ban-tab inline path (line 8435) also has 3 colors (firm/empathetic/other).
Neither path handles `escalate` as a distinct color. If the worker ever returns `escalate`
on the mod-console path, it renders in fallback yellow (`#ffd84d`) -- not the amber
(`#ff9933`) used in the panel. **Inconsistent color coding across surfaces for the same tone.**

**Click affordance:** In the panel, "Copy + open" button text is clear but small (10px,
`#44dd66` border). In the popover, same. In the mod-console inline path the button reads
"Use this" which only populates the textarea -- it doesn't open the thread. These three
surfaces have different interaction models for the same user intent (use an AI draft), which
creates confusion about what will happen on click.

---

### B.3 -- AI reply first-click latency: no loading skeleton, text-only fallback
**Files:** `modtools.js:16066-16069`, `modtools.js:16363-16372`

When ambient pre-fetch hasn't run (cold session, new thread), the panel renders:
```
[button: Generate 4 AI replies]
```
On click it replaces with:
```
'⌛ AI drafting (4 calls in parallel, ~3-5s)...'
```
This is a single line of gray text. No skeleton cards, no progress indicator, no estimated
time remaining. The 3-5s wait with nothing to look at breaks the flow.

The popover path (lines 16363-16372) uses:
```
aiBtn.textContent = '⌛ AI drafting...';
```
Also no skeleton.

**Recommended:** Render 4 ghost cards with animated shimmer while the RPC is in flight.
The layout is known (2-column grid in the panel, 2-column in popover). The placeholder
reduces perceived latency significantly.

---

### B.4 -- Draft auto-save indicator absent in all modmail surfaces
**Files:** `modtools.js:9431-9446` (mm_reply macro draft auto-save), `modtools.js:9297` (SuperMod._showDraftChip)

The mm_reply tab has debounced auto-save (350ms on input, line 9434). The `_showDraftChip`
call at line 9296 fires only on RESTORE (populating an existing draft back into the field),
not on SAVE. So after the mod picks a macro and edits it, the draft is silently saved to
session storage every 350ms with no indicator.

**The mod has no visual confirmation that their edit is being persisted.**

The ban tab has the same gap (lines 8477-8511).

The `SuperMod._showDraftChip` function exists and is called on restore -- it would be the
right place to also show a "Saving..." -> "Saved" state, but it isn't called during the
input debounce handler.

---

### B.5 -- Macros: window.prompt confirmed REPLACED in both contexts (no issue)
**Files:** `modtools.js:8332-8336` (ban_msg), `modtools.js:9337-9341` (mm_reply)

Both Add paths now call `_gamPromptMacro()` (line 14575), which renders a proper inline
modal with label input, textarea (multi-line, 10 rows, resize:vertical), Esc handler,
Ctrl+Enter submit, and outside-click-to-dismiss. `window.prompt` is NOT used anywhere
in these paths. Per ASK-033 / v9.23.0 D.2.3 -- this was fixed correctly.

**Multi-line newline preservation:** The textarea (`<textarea>`) preserves newlines
natively. The body is taken as `.trim()` of the value and passed directly to `macroUpsert`.
No newline stripping. This is correct.

**No issue in B.5.**

---

### B.6 -- Send button state: no disabled-while-empty guard in mm_reply tab
**File:** `modtools.js:9460-9466`

The send button is enabled at all times while the tab is open. There is an empty-body
check (line 9463: `if (!message){ snack('Message is empty', 'error'); return; }`) but the
button itself is not disabled until the check fires. An empty textarea yields an error snack
-- this is adequate but not ideal. No `disabled` attribute toggled on the button based on
textarea content.

**Not broken** -- the guard is there -- but the expected pattern is button disabled until
content present. Low friction issue but worth flagging.

---

## C. P2 (polish)

### C.1 -- Empty state messaging
**File:** `modtools.js:15989-15991` (panel), `modtools.js:16271-16273` (popover)

Panel empty state after firehose:
```
"No modmail threads after firehose backfill. Check that you are logged into GAW..."
```
Correct and informative. 10px font in `#9b9892`.

Popover equivalent is similar. Auto-firehose on empty is implemented in both surfaces
(v9.24.0, lines 15980-15987 panel, 16262-16269 popover). The empty state is rarely
seen in normal operation. **No issue.**

---

### C.2 -- AI tone color coding: distinguishable in the panel, inconsistent in mod-console
**Summary:** (see B.2 for detail)

Panel `renderAICards`: 4 tones, 4 distinct colors. Distinguishable.
Mod-console inline (`__ai__` path): 3 colors -- `escalate` falls through to yellow, same
as `brief`. If both tones ever appear in the same card set they look identical.
**Minor inconsistency, not a breakage.**

---

### C.3 -- Thread list scroll behavior
**File:** `modtools.js:15918`

`#gam-mmp-list` has `overflow-y:auto`. 30 threads (panel loads `limit:30`) at ~60px each =
~1800px of list content in a full-height panel. At 768px viewport height the list fits ~12
threads without scrolling; the rest are accessible by scrolling. No virtual scrolling. For
30 threads this is fine; would need review at 200+ threads.

---

### C.4 -- Sender intel column: static badges, no hover card
**File:** `modtools.js:16122-16161` (`_renderIntelStrip`)

Intel strip shows: username, AGE chip, BAN count chip, SUS chip, WATCH chip. All static
inline chips in a 40px strip. No hover card with expanded data (post count, comment score,
recent activity). The data for expanded intel is available via `getUserSummary` but not
rendered beyond the 4 chips. For most modmail workflows 4 chips is sufficient; the mod can
open Mod Console for deeper intel.

---

### C.5 -- Modmail backfill (CRAWL button) discoverability
**File:** `popup.js:3686-3709` (maintModmailBackfill)

The crawl button lives in the popup under Maintenance section (button #6). It's accessible
but requires the mod to know to open the popup and find Maintenance. In the modmail panel,
an empty-inbox auto-fires the crawl (v9.24.0) so discovery isn't critical. However, the
Refresh button in both the popover (`↻ REFRESH`) and panel ("Refresh") ALSO triggers
a firehose crawl (3-5 pages) via `window.__GAM_BACKFILL_MODMAIL`. This is the correct
discovery path -- mods find the Refresh button naturally when they see stale data.

---

### C.6 -- Ambient prefetch first-click latency
**File:** `modtools.js:16889-16896`

Ambient prefetch starts 500ms after FIRST inbox click. First call to `modmailRecent` is
live (not pre-fetched). On a cold session, the sequence is:
1. Click inbox icon
2. Popover opens, shows "loading recent modmail..."
3. `rpcCall('modmailRecent', { limit: 15 })` fires (~200-500ms)
4. Thread list renders
5. Per-thread AI is either cached (good) or requires explicit "✨ AI reply candidates" click

First-click latency to see threads: ~500ms (network). Acceptable.
First AI draft latency (cold, no cache): 3-5s after clicking the AI button. Acceptable
given the loading text, but a skeleton would help (see B.3).

---

## D. Proposed v10.7 patches

These are patch descriptions only. Code changes in modtools.js are forbidden for this auditor.

### 1. Fix send button stuck-disabled on success (P0-A.1)
**File:** `modtools.js` around line 9497
**Before:** Button stays `disabled` after `btn.textContent = '✓ Sent'`
**After:** After the success path, add:
```js
btn.disabled = false;
btn.textContent = '\u{21A9}️ Send message';
body.value = '';
```
Rationale: mod should be able to send a follow-up in the same session without reopening.

### 2. Read local mirror on cold cache for panel and popover (P0-A.2)
**File:** `modtools.js`, `renderDetail` function (~line 16056-16062) and `_showModmailPopover` (~line 16226-16230)
**Before (panel):**
```js
const out = await chrome.storage.session.get('gam_modmail_drafts');
const cache = (out && out.gam_modmail_drafts) || {};
cached = cache[t.thread_id];
```
**After (panel):**
```js
const out = await chrome.storage.session.get('gam_modmail_drafts');
const cache = (out && out.gam_modmail_drafts) || {};
cached = cache[t.thread_id];
if (!cached) {
  try {
    const lo = await chrome.storage.local.get('gam_modmail_drafts_local');
    const localStore = lo && lo.gam_modmail_drafts_local;
    if (localStore && localStore.drafts) cached = localStore.drafts[t.thread_id];
  } catch(_) {}
}
```
Same pattern for the popover's `__draftCache` initialization.

### 3. Unify toneColor across all 3 AI card surfaces (P1-B.2)
**File:** `modtools.js` lines 16090, 16333, 16385 (panel `renderAICards`, popover inline `__renderDrafts`, popover `aiBtn` click), plus 8435 (ban-tab inline), 9386 (mm_reply inline)
**Before:** 3 surfaces have 2-3 color entries missing `escalate`
**After:** Centralize as a module-level const:
```js
const GAM_TONE_COLOR = { firm:'#ff3b3b', empathetic:'#66ccff', brief:'#ffd84d', escalate:'#ff9933', neutral:'#9b9892', curious:'#a78bfa' };
```
Use `GAM_TONE_COLOR[rp.tone] || '#9b9892'` in all 5 locations.

### 4. Loading skeleton for AI cards while RPC is in flight (P1-B.3)
**File:** `modtools.js`, panel `renderDetail` (~line 16066-16069), popover `aiBtn` click (~line 16363-16372)
**Before:** Single text line "⌛ AI drafting..."
**After:** Render 4 ghost card divs with:
```js
aiHost.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
  Array(4).fill('<div style="background:#1a1d22;border:1px solid #2a2f38;padding:10px;height:90px;' +
    'animation:gam-shimmer 1.2s ease-in-out infinite alternate"></div>').join('') +
  '</div>';
```
Add keyframe `@keyframes gam-shimmer { from{opacity:0.4} to{opacity:0.8} }` to the global CSS block.

### 5. Draft save indicator for mm_reply textarea (P1-B.4)
**File:** `modtools.js`, the debounce input handler at ~line 9434
**Before:** Silent save, no indicator
**After:** After the `chrome.storage.session.set` resolves, flash a tiny "Saved" chip
near the textarea for 1.5s:
```js
// inside the .then() of the set call:
const chip = root.querySelector('#mc-msg-saved-chip');
if (chip) { chip.style.opacity = '1'; setTimeout(() => { chip.style.opacity = '0'; }, 1500); }
```
Add the chip element to the mm_reply tab template HTML near the textarea (initially opacity:0).

### 6. Lower 3-col breakpoint to 1400px to fix 1366px curtaining (P1-B.1)
**File:** `modtools.js:15896`
**Before:** `const mmIs3Col = window.innerWidth >= 1280;`
**After:** `const mmIs3Col = window.innerWidth >= 1400;`
This ensures 1366px laptops get the 680px 2-col panel (49.8% viewport) instead of 920px
3-col (67.4% viewport). At 1400+ the 920px panel leaves 480px of page visible, which is
acceptable.

---

## E. Modmail surface inventory

| Entry point | Trigger | UX state |
|---|---|---|
| `enhanceModmailRead()` | `safeFeature` boot call on `/modmail/thread/*` and `/messages/*` URLs | **Dead by default** -- gated on `statusBarCompact === false`; default is `true` (P0-A.3) |
| Status bar `[📥]` inbox button | First click on the bottom status bar | Opens `_showModmailPopover` -- WORKING. Lazy-starts ambient prefetch on first click. |
| `_showModmailPopover(anchor)` | `[📥]` click | Popover (480px wide, 560px max-height) with thread list, AI reply buttons, Refresh, Expand. WORKING. Local cache fallback missing (P0-A.2). |
| `[↗ EXPAND]` in popover | Click inside popover | Promotes to full-screen panel via `_showModmailPanel()`. WORKING. |
| `_showModmailPanel()` | Expand button OR direct call | Full-screen 3-col panel (920/680px). WORKING. Width issue at 1366px (P1-B.1). |
| Mod Console > Message tab (mm_reply) | Mod Console open, Message tab selected | Send form with macro picker, AI inline (2-card), draft restore. WORKING. Send-stuck bug (P0-A.1). |
| Mod Console > Ban tab (ban_msg) | Mod Console open, Ban tab | Macro picker with ban_msg kind, `_gamPromptMacro` modal for Add. WORKING. |
| Popup > Maintenance > Backfill modmail | Popup > Maintenance button #6 | Fires `crawlModmailHistory` on active GAW tab. WORKING but requires mod to know location. |
| `_ambientModmailPrefetch()` | 500ms after first inbox click, then every 10 min | Pre-fetches 3 threads/cycle into session cache. WORKING. Skips if tab hidden or low-resource mode. |
| AI card "Copy + open" (panel) | Click any AI card button in panel | Copies body, fires `modmailTrackResponse`, opens GAW thread. WORKING (v9.23.0). |
| AI card "Copy + open" (popover) | Click in popover | Same as above. WORKING. |
| AI card "Use this" (mod-console) | Click in mm_reply AI preview | Populates textarea body, sets `_lastSelectedAiTone`. WORKING. |

---

## F. 3-column layout verdict

**Current state (as shipped):**

| Viewport | Panel width | Mode | Verdict |
|---|---|---|---|
| >= 1920px | 920px | 3-col | GOOD -- leaves 1000px of page visible |
| 1440px | 920px | 3-col | OK -- 520px visible |
| 1366px | 920px | 3-col | BAD -- 446px of page, curtains the feed. Commander complaint confirmed. |
| 1280-1399px | 920px | 3-col | MARGINAL -- 360-479px visible |
| < 1280px | 680px | 2-col | OK for most laptop screens |
| < 720px | 95vw | 2-col (capped) | BROKEN -- flex layout doesn't reflow, col 1 + col 3 fight |

**Root cause:** Breakpoint `>= 1280` is too aggressive. `920px` is the 3-col width; at
`1280px` that's 71.9% of the viewport. Commander's complaint is about 680px in 2-col mode
(the prior layout), but the 3-col switch at 1280px actually makes the problem worse by
jumping to 920px at a viewport that can't comfortably host it.

**Verdict:** 3-column DOM is correctly implemented. Layout logic has a breakpoint error.
Fix: `>= 1400px` for 3-col (see patch D.6). The 280px "rail" mention in ADVOCATE F is
aspirational (a collapsed rail that expands on hover) -- this is not implemented and is a
separate v.next scope.

**At 1920px+ (desktop mod workflow):** 3-col works excellently. Thread list (240px) +
messages (360px) + AI drafts (320px) = logical separation, correct labeling, no overlap.

**At 1366px (laptop):** Use patch D.6 to fall to 2-col. The AI column folds into the
message column as before, which is the correct degradation.

**Mobile (< 720px):** Not a supported workflow for mods. The `max-width:95vw` cap is the
safety net. No fix required for v10.7.
