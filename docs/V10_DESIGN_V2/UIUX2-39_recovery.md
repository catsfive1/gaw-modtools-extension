# UIUX2-39 -- Failure Recovery Audit (v10.13 Design Ralph V2)

**Agent:** UIUX2-39-RECOVERY
**Skill:** ui-ux-pro-max -- Forms & Feedback (P8), Navigation Patterns (P9), Accessibility (P1)
**Scope:** Every failure path in the extension: auth, SW restart, extension reload, network outage,
           context invalidated, quota exceeded, SUS unmark accident, wrong-user ban
**Ground truth sources read:** modtools.js (L24758-24908 auth, L5092-7270 undo, L7374-7441 orphan,
           L8700-9920 drafts, L24715-24725 mirror), background.js (L388-466 loadSecrets),
           UIUX2-19_auth_wizard.md, UIUX2-30_error_states.md, UIUX2-09_status_bar.md,
           UIUX2-10_sus_popover.md, UIUX2-13_health_popover.md
**Date:** 2026-05-10

---

## A. Recovery Scenarios -- State Machines

Each scenario maps: trigger -> detected state -> auto-attempt -> user prompt -> recovery action -> resolved state.

---

### A.1 Auth Fail -- Session Expired / Token Invalid

```
Trigger: POST/GET returns loginRedirect=true
         OR csrf() returns falsy
         OR whoami probe returns 401/403/empty

Detect:  setSessionHealthy(false) fires
         SessionListeners notified
         Status-bar session dot -> red (L18872-18906, probe snacks on click)

State machine:
  HEALTHY
    |
    v (loginRedirect detected in workerFetch OR pollSessionHealth)
  SESSION_DEAD
    |-- auto-attempt: pollSessionHealth() re-checks GET /
    |   (same-origin fetch, checks for login page markers)
    |
    |-- if auto-poll recovers within 2 polls (60s):
    |     -> HEALTHY (session dot green, no banner)
    |
    |-- if poll fails:
    |     -> BANNER_SHOWN (__showAuthFailBanner, L24758)
    |
  BANNER_SHOWN
    |-- reasonSteps: no_token / fetch_failed / whoami_status / generic
    |-- buttons: [Open ModTools popup] [Force re-hydrate] [Dismiss]
    |
    |-- [Force re-hydrate] pressed:
    |     preloadSecrets() + syncSecretsToBackgroundVault() + __validateModAuth()
    |     on success: remove banner, call init()           -> HEALTHY
    |     on fail:    button text "Still failed ({reason})"-> BANNER_SHOWN (retry-able)
    |
    |-- [Open ModTools popup] pressed:
    |     sendMessage({type:'openPopup'})
    |     on success: remove banner                        -> WIZARD_OPEN
    |     on fail:    degrade to text instruction
    |
    |-- [Dismiss] pressed:                                 -> SUPPRESSED (no recovery)
    |
  WIZARD_OPEN
    |-- 3-step path picker -> token input -> success/fail
    |-- on success: __validateModAuth() re-fires           -> HEALTHY
    |-- on fail:    inline red status, retry or Back btn   -> WIZARD_OPEN

Resolved: Session dot green. Banner gone. init() re-runs injection.
```

**Current gaps (see Section B.1):**
- No auto-attempt before banner appears (no "trying..." intermediate state)
- Banner does not dismiss automatically on `storage.onChanged` when token is pasted in popup
- No step indicator in the banner's `reasonSteps` list
- All failure reasons share the same red background -- no triage severity hierarchy

---

### A.2 Service Worker Restart Mid-Action

```
Trigger: Chrome terminates SW after 30s idle (MV3 behaviour)
         OR keepalive alarm fires but SW was already dead
         OR browser restart (cold boot)

Detect:  background.js loadSecrets() fires on SW activation
         gam_sw_boots entry appended (L126-127 trimmed to last 20)
         SW hydrates tokens: prefers plaintext -> falls back to decrypt (L401-428)
         Session storage is CLEARED on SW restart (chrome.storage.session is
         not persisted across SW restarts)

Actions that were in-flight at restart:
  - workerFetch() calls: complete or abort? Chrome drops the in-flight message.
    Content script catches: "The message port closed before a response was received"
    -> _gamShowExtOrphanedBanner() fires (L7409-7441)

  NOTE: SW restart != extension reload. SW restart = background re-activates.
  Extension reload = content script context is invalidated. These are DIFFERENT.

State machine (SW restart, same page session still live):
  ACTION_IN_FLIGHT
    |
    v (SW terminated, message dropped)
  RPC_DEAD (message port closed)
    |-- rpcCall() catches, returns EXT_CONTEXT_INVALIDATED code (L22873-22935)
    |-- snack() receives orphan msg -> _gamShowExtOrphanedBanner()
    |-- BUT: EXT_CONTEXT_INVALIDATED code = extension reload, not SW restart
    |   The banner says "Extension was reloaded" but SW restart is a different cause.
    |   ** MISLEADING TEXT BUG ** (see Section C.2)
    |
  BANNER_SHOWN: "Extension was reloaded -- please refresh this page"
    |-- [Reload page] button: location.reload()             -> fresh page load
    |-- Auto-dismiss: NO (sticky banner)
    |-- Sticky 12s snack appears (L7403-7407) -- then disappears, banner persists
    |
  After page reload: fresh content script injection
  SW already warm again (alarm fired, keepalive active)
                                                            -> HEALTHY

Draft preservation during SW restart:
  gam_macro_drafts: session storage LOST if SW restart clears session
    -> mirrored to local storage via _mirrorDraftToLocal (L24719-24725)
    -> TTL: 24h, purge on read
    -> RESTORED: next ban modal open reads from session FIRST,
       then falls back to local mirror (L8700-8714)
  gam_modmail_drafts: same mirror pattern (L16741)
  gam_tard_suggestions: session storage, NOT mirrored -> LOST on SW restart

Resolved: Page reload -> healthy. Drafts recover from local mirror.
```

---

### A.3 Extension Reload / Context Invalidated Mid-Typing

```
Trigger: User manually reloads extension in chrome://extensions
         OR extension auto-updates (Chrome installs new version)
         OR CRX hot-reload in dev

Detect:  Content script's chrome.runtime becomes invalid
         chrome.runtime.id check fails
         Any rpcCall() or chrome.storage access throws/errors

State machine:
  ANY_STATE (mid-typing in ban modal, mid-reading SUS popover, etc.)
    |
    v (chrome.runtime context invalidated)
  ORPHANED
    |-- rpcCall() catches (L22929): "context invalidated / receiving end does not exist"
    |-- _gamShowExtOrphanedBanner() fires ONCE (idempotent guard: _gamExtOrphaned flag)
    |-- All subsequent snack() calls with orphan text are swallowed (L7439-7441)
    |-- Banner: "Extension was reloaded" + [Reload page] button (L7413-7428)
    |
    |-- Any open modal/popover: STAYS OPEN (DOM not touched)
    |   Text already typed: PRESERVED IN DOM (textarea.value intact)
    |   Storage writes in-flight: DROPPED (session/local writes fail silently)
    |
    |-- Draft auto-save (350ms debounce): last successful mirror was to local storage
    |   If debounce had already fired: draft is in local mirror -> survives reload
    |   If user typed < 350ms before reload: draft is NOT in local mirror -> LOST
    |   ** 350ms window = gap in draft preservation ** (see Section C.3)
    |
  [Reload page] pressed:
    Page unloads -> new content script injects
    New rpcCall() succeeds (fresh context)                  -> HEALTHY

  User types in textarea while orphaned:
    Typing works (DOM is alive)
    Pressing [Save note] or [Submit]: rpcCall() -> orphan banner re-attempts
    (idempotent: _gamExtOrphaned already true, banner not re-rendered)
    Button disabled state: depends on caller. Most callers check r.ok and snack.
    Draft in textarea: user must manually copy before reloading.

Resolved: [Reload page] clears context. Drafts from local mirror restore.
```

---

### A.4 Network Outage / Timeout

```
Trigger: fetch() throws or times out (15s AbortController timeout, L810-811)
         OR worker returns 5xx
         OR worker is unreachable (Cloudflare 1101 / 502 / 503)

Detect:  workerFetch() returns { ok:false, status:0, timeout:true } or { ok:false, status:5xx }
         rpcCall() circuit-breaker (CB state: CLOSED -> HALF_OPEN -> OPEN at L22969)

State machine:
  HEALTHY
    |
    v (fetch timeout or 5xx)
  DEGRADED
    |-- rpcCall() returns {ok:false} to caller
    |-- Caller snacks "X failed" (quality varies -- see Section B.4)
    |-- Status-bar site-health popover: worker pill -> WORKER FAIL (L18767-18770)
    |-- Circuit breaker: after 5 failures -> CB OPEN (blocks outbound RPCs for ~30s)
    |
  CB_OPEN
    |-- All rpcCalls return immediately: {ok:false, code:'CB_OPEN', error:'...'}
    |-- No retry UI shown to user (caller sees snack "X failed" same as normal failure)
    |-- Auto-recovery: CB transitions HALF_OPEN after cooldown, probes one request
    |   on probe success: CB CLOSED -> HEALTHY
    |   on probe failure: CB OPEN again
    |
  Offline mode (network fully down):
    |-- All fetches throw NetworkError
    |-- Session dot: red (pollSessionHealth fails)
    |-- No offline-specific UI exists currently
    |-- Mod's in-progress typing: preserved in DOM + local mirror
    |** MISSING: no "you are offline" indicator beyond session dot ** (see Section C.4)

Resolved: Network recovers -> CB probe succeeds -> CB CLOSED -> session dot green.
```

---

### A.5 Quota Exceeded (Storage Write Fails)

```
Trigger: chrome.storage.local exceeds 5MB quota
         OR chrome.storage.session exceeds 10MB quota
         OR chrome.storage.local item exceeds QUOTA_BYTES_PER_ITEM (8192)

Detect:  chrome.storage.local.set() rejects with QuotaExceededError
         .catch() on the set call fires

State machine:
  STORAGE_WRITE
    |
    v (quota exceeded)
  WRITE_FAIL
    |-- Most callers: .catch(function(){}) -- SILENT SWALLOW
    |   User sees no indication that their data was not saved
    |-- Draft mirror: _mirrorDraftToLocal catch block is empty (L24720-24724)
    |** MISSING: no quota warning UI ** (see Section C.5)
    |
  Diagnostic tab: Storage + Audit section shows pct of 5MB (UIUX2-07 D spec)
    |-- Renders stoClass = 'err' when >80% (red value, red section chip)
    |-- But this is in the Diag tab which the mod must open proactively

Resolved: No auto-recovery path exists. Manual: open Diag tab, identify bloat,
          clear via settings or debug snapshot.
```

---

### A.6 SUS User Accidentally Unmarked

```
Trigger: Mod clicks [Unmark] on the collapsed SUS strip (v2 spec: E.1.c)
         OR mod clicks [Unmark] in the drill panel
         Action: rpcCall('modSusClear', { username }) fires immediately

State machine:
  SUS_FLAGGED
    |
    v ([Unmark] clicked)
  UNMARK_IN_FLIGHT
    |-- Button disabled, text "..."
    |-- rpcCall fires
    |
    v (success)
  ROW_REMOVED (outerWrap.remove() called, row gone from DOM)
    |-- snack: "username unmarked SUS" (success, 3-5s)
    |-- withUndo() NOT wired to SUS clear in v10.12.3
    |** MISSING: no undo window after Unmark ** (see Section C.6)
    |
    v (failure)
  ROW_STILL_PRESENT (button re-enabled, snack "Unmark failed: ...")
    |-- User can retry                                      -> SUS_FLAGGED

Resolved (accidental): No automated recovery. Mod must:
  1. Navigate to user profile page
  2. Identify the user as SUS in context
  3. Re-mark via ban-modal "Mark SUS" button or equivalent
  Cost: 3-5 clicks, context switch, memory of who was unmarked.
```

---

### A.7 Wrong-User Banned

```
Trigger: Mod triggers apiBan() on the wrong username
         Username may be filled from:
           - clicked element (username parsing from DOM)
           - mod console target detection
           - manual input in ban modal

State machine:
  BAN_INTENT (mod opens ban modal, target is wrong user)
    |
    v ([Ban] confirmed, preflight passed or bypassed)
  BAN_IN_FLIGHT (apiBan() fires)
    |
    v (success)
  BAN_FIRED
    |-- withUndo() is WIRED for ban: tier 'A', 20s window (L9439-9542)
    |-- Undo toast shown: "Banned username. Press U or activate Undo button"
    |-- Ctrl+Z / [U] key / toast button fires _executeUndo()
    |
  UNDO_ACTIVE (within 20s window)
    |-- _executeUndo calls inverse: apiUnban(_banTarget) (L7211-7235)
    |-- on success: snack "[username] unbanned"
    |-- on fail: snack "Undo failed: {err.message}" (L7220)   -> BAN_STUCK
    |
  UNDO_EXPIRED (>20s elapsed)
    |-- _undoSlot = null, _undoTimer cleared
    |-- Manual path: mod must use [Unban] button in user profile
    |   OR use native Reddit mod tools
    |** Gap: no "undo window expired" notification ** (see Section C.7)

Resolved (within 20s): apiUnban succeeds. Undo toast was shown.
Resolved (after 20s): Manual unban via profile page (3-5 clicks, context switch).
```

---

### A.8 Modmail Draft Lost Across SW Restart

```
Trigger: SW restarts while mod has typed a partial modmail reply
         chrome.storage.session is cleared on SW restart
         gam_modmail_drafts is session-stored

State machine:
  DRAFT_IN_PROGRESS (mod typing in modmail 3-col reply box)
    |-- Debounced save fires every 350ms to chrome.storage.session
    |-- _mirrorDraftToLocal mirrors to chrome.storage.local (L16741)
    |-- Local key: 'gam_modmail_drafts_local'
    |
    v (SW restart, session cleared)
  SESSION_CLEARED
    |-- Next open of modmail popover:
    |   chrome.storage.session.get('gam_modmail_drafts') -> empty
    |   THEN: code does NOT fall back to local mirror
    |** Gap: modmail draft local mirror is not READ on session miss ** (see Section C.8)
    |
  DRAFT_LOST (no restore UI shown)

Compare: gam_macro_drafts (ban/note messages):
  READ path at L8704-8714: reads session, does NOT fall back to local.
  Same gap -- local mirror written but never read.

_mirrorDraftToLocal writes:   gam_macro_drafts_local, gam_modmail_drafts_local
Read path for session miss:   NOT IMPLEMENTED in v10.12.3

Resolved: Draft lost. Mirror write exists (E.3.4) but read-path is missing.
```

---

## B. Recovery Affordance Audit

Mapping each scenario against ui-ux-pro-max P8 (Forms & Feedback) and P9 (Navigation).

| # | Scenario | Detected? | Auto-Attempt? | User Prompt? | Undo Window? | Recovery Action Offered? | Overall |
|---|---|---|---|---|---|---|---|
| A.1 | Auth fail | YES (session dot red) | YES (pollSessionHealth 2 polls) | YES (#gam-auth-fail-banner with reasonSteps) | NO | YES ([Force re-hydrate] [Open popup]) | **GOOD** |
| A.2 | SW restart | PARTIAL (orphan banner fires, wrong label) | NO | YES (orphan banner) | N/A | YES ([Reload page]) | **PARTIAL** |
| A.3 | Ext reload/context invalid | YES (orphan banner) | NO | YES (orphan banner, idempotent) | N/A | YES ([Reload page]) | **GOOD** |
| A.4 | Network outage | PARTIAL (session dot red, CB) | YES (CB auto-probe) | NO (no offline banner) | NO | NO (silent) | **WEAK** |
| A.5 | Quota exceeded | NO | NO | NO | NO | NO | **MISSING** |
| A.6 | SUS unmark accident | N/A (user intended) | N/A | NO (no undo) | NO | NO | **MISSING** |
| A.7 | Wrong-user ban | N/A (user intended) | N/A | YES (withUndo toast 20s) | YES (20s Tier A) | YES (Ctrl+Z / [U]) | **GOOD** |
| A.8 | Modmail draft lost | NO | N/A | NO | N/A | NO (mirror written, not read) | **MISSING** |

**Scoring:**
- GOOD (3): Auth fail, Extension context invalid, Wrong-user ban
- PARTIAL (1): SW restart
- WEAK (1): Network outage
- MISSING (3): Quota exceeded, SUS unmark undo, Modmail draft read-path

---

## C. Draft-Preservation Gaps

### C.1 What Works Correctly

- `_mirrorDraftToLocal()` (L24719-24725): writes `gam_macro_drafts_local` and `gam_modmail_drafts_local` to chrome.storage.local on every session write.
- 24h TTL: entries older than 24h are purged on the write side before saving.
- Macro drafts (ban message, note body): save on `input` with 350ms debounce.
- Draft chip `_showDraftSavedChip()`: visual confirmation when debounce fires.

### C.2 Gap: SW Restart vs Extension Reload -- Conflated in Banner Text

**Location:** `_gamShowExtOrphanedBanner` (L7409-7428)
**Banner text:** "Extension was reloaded -- please refresh this page"
**Actual trigger:** fires for BOTH context-invalidated (true reload) AND SW restart message-drop.
**Impact:** Mod refreshes page expecting extension to be fresh, but the extension was never reloaded -- just the SW restarted. On refresh, the page reloads unnecessarily. Better: distinguish the two causes in the banner text. SW restart banner should say "ModTools background service restarted -- refreshing will reconnect it."
**Severity:** Low (refresh works either way; just misleading text).

### C.3 Gap: 350ms Draft-Save Window on Context Invalidation

**Problem:** Draft save debounce is 350ms. If the extension is reloaded while the mod is mid-keystroke and the debounce has not fired, the last typed characters are NOT in the local mirror. The mod sees a partial draft (everything before the last 350ms of typing).
**Worst case:** mod types a long ban message, extension auto-updates in background, mod hits submit -- context invalidated -- draft in mirror is from 350ms ago or up to the full debounce window.
**Severity:** Low (350ms is brief; most of the draft is preserved). Gap exists but is corner-case.
**Fix candidate:** On beforeunload or orphan detection, immediately flush textarea contents to local mirror without waiting for debounce. One `_mirrorDraftToLocal()` call synchronized on the orphan banner display.

### C.4 Gap: Modmail Draft Local Mirror Not Read on Session Miss

**Problem:** `_mirrorDraftToLocal('gam_modmail_drafts', cache)` writes to `gam_modmail_drafts_local` (L16741). When the modmail popover opens after a SW restart (session cleared), it reads from `chrome.storage.session.get('gam_modmail_drafts')` which is empty. It does NOT fall back to `gam_modmail_drafts_local`.
**Same gap for macro drafts:** Read at L8704 reads only session. The local mirror key `gam_macro_drafts_local` is written but never read.
**Impact:** Any draft typed in a session where the SW restarts is silently lost. The mod sees an empty textarea. No notification.
**Fix (Section E):** On session miss, read from local mirror key. If found and within TTL: restore text, show "Draft restored" chip inline. Purge local mirror after restore to prevent stale re-restore.

### C.5 Gap: gam_tard_suggestions Not Mirrored

**Problem:** `gam_tard_suggestions` is session-only. No local mirror. Lost on every SW restart.
**Impact:** AI suspects list evaporates. Mod must click "Fetch tard suspects" again. Minor friction.
**Fix candidate:** Mirror tard suggestions to local with same pattern. TTL: 4h (shorter than 24h since tard data is more volatile than draft text).

---

## D. Auto-Recovery vs User-Prompt Decision Matrix

| Scenario | Can auto-recover? | Auto-attempt strategy | Prompt-user if auto fails | Threshold |
|---|---|---|---|---|
| Auth fail (session expired) | YES -- poll / re-hydrate | 2 polls (30s each), then banner | YES -- banner with reasonSteps | 2 poll failures |
| SW restart (message port drop) | NO (page refresh required) | N/A | YES -- banner (improve text per C.2) | Immediate on orphan detect |
| Extension reload (context invalid) | NO (page refresh required) | N/A | YES -- banner (idempotent) | Immediate |
| Network outage | PARTIAL -- CB auto-probe | CB half-open probe after 30s cooldown | NO currently -- ADD offline banner at 60s offline | CB open > 60s |
| Quota exceeded | NO -- requires manual cleanup | N/A | YES -- ADD Diag tab chip with "Storage full" warning | On any failed .set() |
| SUS unmark accident | YES -- add undo window | N/A (action already fired) | NO (add Ctrl+Z / snack undo) | Immediate post-unmark |
| Wrong-user ban | YES -- withUndo tier A | withUndo already wired | YES -- undo toast shown | 20s window |
| Modmail draft lost | YES -- read local mirror | On session miss, read local key | ONLY if restore found something | On first open of drafts |

**Auto-recover-first principle (ui-ux-pro-max `error-recovery` + §10 of CLAUDE.md):**
- Auto-attempt silently, surface only if it fails.
- Never prompt before attempting.
- For undo windows: show proactively (user acted, grace window is expected feedback).

---

## E. Recommended Recovery Affordances -- Prioritized

### E.1 CRITICAL -- Modmail + Macro Draft Fallback Read (30 min)

**Files:** modtools.js `_loadModmailDraft()` call site (approx. L16700 area) and ban-modal macro draft read (L8704).

When session read returns empty for `gam_modmail_drafts` or `gam_macro_drafts`:

```js
// After chrome.storage.session.get returns empty:
if (!sessionDraft || Object.keys(sessionDraft).length === 0) {
  // Try local mirror (written by _mirrorDraftToLocal)
  const localKey = 'gam_modmail_drafts_local'; // or 'gam_macro_drafts_local'
  const local = await chrome.storage.local.get(localKey);
  const mirror = local && local[localKey];
  if (mirror && mirror.drafts && (Date.now() - mirror.savedAt) < 24 * 60 * 60 * 1000) {
    // Restore into session for this request
    draft = mirror.drafts;
    // Show restore chip
    _showDraftSavedChip(targetEl, 'Draft restored after restart');
    // Purge local mirror so stale data doesn't re-apply next open
    chrome.storage.local.remove(localKey).catch(function(){});
  }
}
```

**Impact:** Eliminates the silent draft-lost on SW restart. Highest-friction gap for a typing mod.

### E.2 HIGH -- Orphan Banner: Flush Draft Before Showing Banner (15 min)

**File:** modtools.js `_gamShowExtOrphanedBanner()` (L7409).

Before rendering the banner, attempt a synchronous (best-effort) local mirror flush of any textarea containing draft content:

```js
function _gamShowExtOrphanedBanner() {
  if (_gamExtOrphaned) return;
  _gamExtOrphaned = true;
  // Flush any open textarea drafts to local mirror immediately
  // (bypasses the 350ms debounce -- this is the last chance)
  try {
    document.querySelectorAll('textarea[data-gamMacroDraftAttached]').forEach(function(ta) {
      var key = ta.dataset.gamDraftKey;
      if (key && ta.value && ta.value.trim()) {
        var obj = {}; obj[key] = { body: ta.value, savedAt: Date.now() };
        _mirrorDraftToLocal(key.split(':')[0] === 'mm' ? 'gam_modmail_drafts' : 'gam_macro_drafts', obj);
      }
    });
  } catch(_) {}
  // ... rest of banner render
}
```

**Impact:** Closes the 350ms debounce gap (C.3). Draft text is preserved up to the exact moment the banner fires.

### E.3 HIGH -- SUS Unmark: Add Undo Window (45 min)

**File:** modtools.js `_showSusPopover()` Unmark button handler (UIUX2-10 E.1.c new code).

Wrap the Unmark action with `withUndo()` using Tier B (5s window) so the mod gets the standard undo toast:

```js
unmarkBtn.addEventListener('click', async function(e) {
  e.stopPropagation();
  unmarkBtn.disabled = true; unmarkBtn.textContent = '...';
  try {
    await withUndo(
      function() { return rpcCall('modSusClear', { username, client_op_id: __makeReqId() }); },
      {
        tier: 'B',
        label: username + ' unmarked SUS',
        inverse: function() {
          // Re-mark SUS: rpcCall modSusMark -- requires mod to have the original reason/note
          // For recovery, use a generic reason placeholder
          return rpcCall('modSusMark', { username, reason: 'Re-marked (undo)', client_op_id: __makeReqId() });
        }
      }
    );
    // ... row remove, header update, snack (existing code)
  } catch(err) {
    // ... existing error path
  }
});
```

**Impact:** 5-second undo window for the common "fat-finger Unmark" case. Consistent with ban undo model.

### E.4 MEDIUM -- Network Outage: Offline Indicator at 60s (2h)

**File:** modtools.js, near `pollSessionHealth` (L2090).

Track consecutive `setSessionHealthy(false)` calls. After 60s of `SessionHealthy === false` with no recovery, show a sticky amber (not red) top banner:

```
[!] No connection to GAW -- actions will fail. Reconnecting...  [Dismiss]
```

Auto-dismiss when `setSessionHealthy(true)` fires. This is distinct from auth failure (red banner) by both color and copy.

**Impact:** Mod understands they are offline vs auth-expired. Currently both look the same (red session dot, nothing else).

### E.5 MEDIUM -- Quota Warning in Status Bar / Diag Tab (1.5h)

**Files:** modtools.js (storage quota check), background.js (periodic check).

On any failed `chrome.storage.local.set()` that throws QuotaExceededError:

```js
.catch(function(e) {
  if (e && /quota/i.test(String(e))) {
    // Surface in Diag tab + status bar
    try { _flagStorageQuotaExceeded(); } catch(_) {}
  }
});
```

`_flagStorageQuotaExceeded()`: sets a session flag, signals session dot to go amber with tooltip "Storage full -- open Diag tab", and writes a warn entry to the diag log.

**Impact:** Quota failure goes from silent to amber-flagged. Mod knows to open the Diag tab.

### E.6 LOW -- SW Restart vs Ext Reload: Differentiate Banner Text (15 min)

**File:** modtools.js `_gamShowExtOrphanedBanner()` (L7413).

The banner fires for two distinct causes:
- `EXT_CONTEXT_INVALIDATED` (true extension reload) -> "Extension was reloaded. Refresh to reconnect."
- Message port closed with SW dead (SW restart, not full reload) -> "Background service restarted. Refresh to reconnect." (softer framing)

Thread the cause code through `_gamShowExtOrphanedBanner(cause)` and branch the title copy:

```js
function _gamShowExtOrphanedBanner(cause) {
  var title = (cause === 'EXT_CONTEXT_INVALIDATED')
    ? 'Extension was reloaded'
    : 'Background service restarted';
  // ... rest unchanged
}
```

**Impact:** Reduces mod confusion. Refresh still resolves both, but the framing is accurate.

### E.7 LOW -- Undo Expiry Notification (30 min)

**File:** modtools.js `_setUndoSlot()` / `withUndo()`.

When the 20s Tier A undo window expires (the timer fires), currently the undo slot is silently cleared. The mod has no notification that their undo window just closed.

Add a brief "Undo window expired for: [action label]" snack at the moment the timer fires:

```js
_undoTimer = setTimeout(function() {
  var expiredLabel = _undoSlot ? _undoSlot.label : '';
  _undoSlot = null;
  if (expiredLabel) {
    try { snack('Undo window expired: ' + expiredLabel, 'info'); } catch(_) {}
  }
  if (_undoToast) { try { _undoToast.remove(); } catch(_) {} _undoToast = null; }
}, ttlMs);
```

**Impact:** Mod knows when they missed the window instead of wondering why Ctrl+Z stopped working.

---

## F. Effort Summary

| # | Fix | Effort | Priority | Scenario covered |
|---|---|---|---|---|
| E.1 | Modmail + macro draft fallback read from local mirror | 30 min | P0 | A.8 (draft lost) |
| E.2 | Flush textarea draft to local mirror on orphan banner | 15 min | P0 | A.3 (ext reload) |
| E.3 | SUS Unmark: wrap with withUndo Tier B | 45 min | P1 | A.6 (accidental unmark) |
| E.4 | Network offline banner at 60s sustained outage | 2h | P2 | A.4 (network outage) |
| E.5 | Quota exceeded: surface warning in status + diag | 1.5h | P2 | A.5 (quota) |
| E.6 | Differentiate SW restart vs ext reload banner text | 15 min | P3 | A.2 (SW restart UX) |
| E.7 | Undo window expiry notification snack | 30 min | P3 | A.7 (ban undo) |

**P0 total: 45 min** -- closes the two silent data-loss gaps (draft loss + context invalidation flush).
**P1 total: 45 min** -- closes the accidental-SUS-unmark hole.
**P2 total: 3.5h** -- adds the two missing ambient status indicators (offline, quota).
**P3 total: 45 min** -- polish / clarity on existing banners.

---

## G. What Is Already Correct (Hold the Line)

These recovery affordances are confirmed working in v10.12.3. Do NOT regress them.

| Feature | Implementation | Location |
|---|---|---|
| Auth fail banner with reasonSteps | `__showAuthFailBanner()`, [Force re-hydrate] + [Open popup] | modtools.js L24758-24908 |
| [Force re-hydrate] button: retry + init() on success | L24800-24820 | modtools.js |
| Session dot: green/red live probe on click | `setSessionHealthy()` + dot click handler | modtools.js L2080-2100 |
| Ext context orphan banner (idempotent) | `_gamShowExtOrphanedBanner()`, `_gamExtOrphaned` flag | modtools.js L7409-7441 |
| snack() routes orphan noise to banner (not spam) | L7437-7442 | modtools.js |
| Wrong-user ban: withUndo Tier A, 20s, Ctrl+Z | `withUndo()`, `_executeUndo()`, keydown listener | modtools.js L9439-9542, L7211-7235 |
| Draft local mirror write | `_mirrorDraftToLocal()` on every session set | modtools.js L24719-24725 |
| Draft 24h TTL purge on write | Purge loop before every session.set | modtools.js L8950-8952 |
| Draft saved chip feedback | `_showDraftSavedChip()` after debounce fires | modtools.js L9914 |
| SW restart: token recovery plaintext-first | loadSecrets() plaintext preference (v10.11.1 hotfix) | background.js L401-428 |
| CB auto-probe on half-open | Circuit breaker in rpcCall (L22969) | modtools.js |
| Diag tab storage usage gauge | `_diagRenderSto()`, pct threshold coloring | UIUX2-07 spec |
| Ban preflight confirm (armSeconds:3, danger:true) | `preflight()` modal with 3s arm | modtools.js |

---

*Generated: 2026-05-10. UIUX2-39-RECOVERY. Read-only audit. No code changes in this document.*
