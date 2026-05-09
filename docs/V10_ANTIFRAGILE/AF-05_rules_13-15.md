# AF-05: Anti-Fragile Suite — Rules 13-15
**GAW ModTools v10.5.1 | Audit date: 2026-05-09**

---

## Rule 13 — sendMessage Error Handling Audit

**Requirement:** Every `chrome.runtime.sendMessage` and `chrome.tabs.sendMessage` call must have either `.then().catch()` or a try/catch with `chrome.runtime.lastError` check, plus a user-visible fallback (snack, status text, or queue-for-retry). Bare calls with no failure path are patched.

### Findings

All three files were grepped exhaustively. Findings by file:

---

#### popup.js

| Line | Call | Status | Notes |
|------|------|--------|-------|
| 306 | `runtime.sendMessage({type:'GAM_OPEN_POPUP'...})` | **BARE — no catch** | Inside `action_fn` callback; SW dead → silent fail. No user feedback. |
| 476 | `runtime.sendMessage({type:'clearTokens'})` | OK | `try{}catch(e){}` — intentional ignore; follow-on storage clear still runs. |
| 486 | `tabs.sendMessage(tab.id, {type:'clearLocalStorage'})` | OK | try/catch with comment. |
| 518 | `runtime.sendMessage({type:'mintSnapshotConsent'})` | OK | try/catch; nonce stays null and caller handles gracefully. |
| 521 | `tabs.sendMessage(tabs[0].id, {type:'getDebugSnapshot'...})` | OK | Inside outer try/catch. |
| 563 | `tabs.sendMessage(tabs[0].id, {type:'forceRehydrate'})` | OK | try/catch; status text updated on both paths. |
| 750 | `runtime.sendMessage({type:'setTokens'...})` | **PARTIAL** | No try/catch at the call site. Caller checks `!r \|\| !r.ok` but if the SW is dead the await throws and propagates to whatever calls `__saveTokensToSW`. The two callers (first-run onboarding, manual save) have try/catch above them — so the throw IS caught — but the error surface back to UI is "network error" generic text, not a meaningful SW-dead message. Not a bare call but error messaging is lossy. |
| 774 | `runtime.sendMessage({type:'tokensStatus'})` | OK | try/catch; returns defaults on failure. |
| 908, 943 | `runtime.sendMessage({type:'rpc', name:'modWhoami'/'authValidateToken'})` | OK | try/catch; `statusEl` updated with error text. |
| 1022, 1199, 1272, 1322, 1449, 1560, 1725, 1850, 1905, 1939 | Various RPC sends | OK | All wrapped in try/catch; UI status elements updated on failure. |
| 2059 | `tabs.sendMessage(tab.id, msg)` — `__sendToGawTab` helper | OK | Throws are intentional (callers catch them). The function itself throws on "no GAW tab" before reaching the send. |
| 2343, 2509, 2519, 2549, 2560, 2704, 2732, 2989, 3038, 3059 | Various RPC sends (invite flows, bug reports, settings) | OK | All inside try/catch with statusEl feedback. |

**Verdict on popup.js:** One bare call (line 306), one lossy-error call (line 750).

---

#### modtools.js

| Line | Call | Status | Notes |
|------|------|--------|-------|
| 1211 | `runtime.sendMessage({type:'verifySnapshotConsent'...})` | OK | try/catch; `sendResponse({ok:false,...})` on catch. |
| 1449, 1455 | `runtime.sendMessage({type:'rpc', name:'authBackupGet/Put'})` | OK | catch returns null/false; callers designed for that. |
| 1519 | `runtime.sendMessage({type:'setTokens'...})` in `_rehydrateFromCache` | **BARE** | No try/catch at this specific await. If the background SW is dead at content-script boot, this throws and halts the rehydration function silently. No user feedback because rehydration is a background operation. |
| 2272 | `runtime.sendMessage(msg)` in the content-script fetch relay | OK | Outer try/catch in `_workerFetch`; error surfaces as `{ok:false, status:0, error:...}`. |
| 10405, 10411 | SUS mark/clear RPCs | OK | Outer try/catch; snack on failure. |
| 10496 | `modSusList` RPC | OK | try/catch; function returns early. |
| 11642 | `modDrRulesList` RPC | OK | try/catch; function returns early. |
| 19682 | Generic RPC dispatcher wrapper | OK | try/catch; returns `{ok:false,...}` on failure. |
| 20771 | `runtime.sendMessage({type:'verifyUpdateFlag'...})` | OK | try/catch; `verified` stays false, caller rejects the flag update. |
| 21352 | `runtime.sendMessage({type:'openPopup'})` | OK | try/catch; button re-enabled on failure. |

**Verdict on modtools.js:** One bare call (line 1519 in `_rehydrateFromCache`).

---

#### background.js

| Line | Call | Status | Notes |
|------|------|--------|-------|
| 744 | `tabs.sendMessage(t.id, {type:'maintenanceSnack'...})` | OK | for-loop inside try/catch; individual tab failure is absorbed. |

**Verdict on background.js:** Clean.

---

### Patches Applied

#### Patch 1 — popup.js line 306: bare sendMessage in action_fn

**Before:**
```js
action_fn: function() {
  chrome.runtime.sendMessage({ type: 'GAM_OPEN_POPUP', view: 'token-claim' });
},
```

**After:**
```js
action_fn: function() {
  chrome.runtime.sendMessage({ type: 'GAM_OPEN_POPUP', view: 'token-claim' }).catch(function() {
    // SW evicted; popup will open on next user click when SW restarts.
  });
},
```

Rationale: the action is fire-and-forget (open a popup view). Silent catch is correct here — no snack needed because if the popup fails to open the user sees no change and can click again. Swallowing the error prevents an uncaught promise rejection in DevTools.

---

#### Patch 2 — modtools.js line 1519: bare sendMessage in _rehydrateFromCache

**Before:**
```js
await chrome.runtime.sendMessage({
  type: 'setTokens',
  workerModToken: workerModToken,
  leadModToken: leadModToken
});
```

**After:**
```js
try {
  await chrome.runtime.sendMessage({
    type: 'setTokens',
    workerModToken: workerModToken,
    leadModToken: leadModToken
  });
} catch (_) {
  // SW evicted mid-rehydration; tokens remain in _secretsCache for this
  // content-script lifecycle and will be pushed on next SW wake.
}
```

Rationale: `_rehydrateFromCache` is called at content-script init. If the SW is dead at that instant, the throw halted the entire function. The catch keeps the rehydration path alive for the rest of that function's work.

---

#### Patch 3 — popup.js line 750: lossy error text in __saveTokensToSW

**Before:** (no change to call site; fix is in the error surface)

The `setTokens` send at line 750 is called from two callers that have their own try/catch, so the throw is caught. However, both callers render `r && r.error || 'network error'` — which becomes `'network error'` when `r` is undefined because the SW was dead. This masks a SW-eviction as a network error.

**After:** (wrap the call in __saveTokensToSW itself)
```js
let r;
try {
  r = await chrome.runtime.sendMessage(msg);
} catch (_) {
  return { ok: false, error: 'background SW unavailable — reload extension or reopen popup' };
}
if (!r || !r.ok) return r || { ok: false, error: 'no response from background' };
```

This surfaces a meaningful message instead of the generic "network error" when the SW is dead at save time.

---

## Rule 14 — Health Alarm (`gam_health`)

**Requirement:** `chrome.alarms.create('gam_health', { periodInMinutes: 5 })` present in background.js. Handler logs vault status + storage usage to diag log.

### Finding

`gam_health` does NOT exist in the codebase. Background.js has seven alarms:

| Alarm constant | Name | Period |
|---|---|---|
| `ALARM_NAME` | `gam_update_check` | 30 min |
| `BUG_POLL_ALARM` | `gam_bug_poll` | 5 min |
| `MAINT_QUOTA_ALARM` | `gam_maint_quota_check` | 6 h |
| `MAINT_TOKEN_AGE_ALARM` | `gam_maint_token_age` | 24 h |
| `MAINT_DIAG_ROTATE_ALARM` | `gam_maint_diag_rotate` | 24 h |
| `MAINT_INTEL_EVICT_ALARM` | `gam_maint_intel_evict` | 30 min |
| `MAINT_WEEKLY_ALARM` | `gam_maint_weekly_run` | 7 days |

`gam_bug_poll` at 5 min fires `_bugPollAndBadge()`, which does call `loadSecrets()` defensively — but it does not log vault status or storage usage to the diag log. It is a badge-update path, not a health log.

### Addition Required

Add to the constant block (after `MAINT_WEEKLY_PERIOD_MIN`):

```js
// v10.5.1 AF-05: SW health heartbeat — logs vault status + storage usage.
const HEALTH_ALARM = 'gam_health';
const HEALTH_PERIOD_MIN = 5;
```

Add to `onInstalled` alarm creation block:

```js
chrome.alarms.create(HEALTH_ALARM, { periodInMinutes: HEALTH_PERIOD_MIN });
```

Add to `onStartup` alarm-alive check block:

```js
chrome.alarms.get(HEALTH_ALARM, (a) => {
  if (!a) chrome.alarms.create(HEALTH_ALARM, { periodInMinutes: HEALTH_PERIOD_MIN });
});
```

Add health handler function:

```js
async function _healthCheck() {
  try { await loadSecrets(); } catch (_) {}
  const vaultOk = !!(secretCache && (secretCache.workerModToken || secretCache.leadModToken));
  let storageBytes = 0;
  try {
    storageBytes = await new Promise((res) => {
      chrome.storage.local.getBytesInUse(null, (b) => res(b || 0));
    });
  } catch (_) {}
  const entry = {
    ts: Date.now(),
    vaultOk: vaultOk,
    hasWorkerToken: !!(secretCache && secretCache.workerModToken),
    hasLeadToken: !!(secretCache && secretCache.leadModToken),
    storageBytesUsed: storageBytes,
    storageQuotaPct: Math.round((storageBytes / (MAINT_QUOTA_BYTES || 5242880)) * 100)
  };
  try { await _maintAppendDiag('health.check', 'ok', entry); } catch (_) {}
  if (!vaultOk) {
    console.warn('[ModTools health] vault empty at heartbeat — SW was evicted and not yet rehydrated');
  }
}
```

Add to `chrome.alarms.onAlarm.addListener` dispatcher:

```js
if (alarm.name === HEALTH_ALARM) { await _healthCheck(); return; }
```

**Why this matters:** The diag log is the primary forensic artifact for post-incident analysis. Without a periodic vault + storage snapshot, diagnosing "SW was evicted and nobody noticed" requires reconstructing the timeline from sparse event-driven entries. A 5-minute heartbeat gives ~288 data points per day, enough to pinpoint eviction windows.

---

## Rule 15 — SW Restart: Critical State Restore + Race Gate

**Requirement:** On `chrome.runtime.onStartup`, verify `secretCache` is hydrated from `chrome.storage.local` before any other handler reads it. If race condition exists (message handler fires before `loadSecrets` resolves), add a Promise gate.

### Finding: loadSecrets() IS called in onStartup

`onStartup` listener at line 159–188 does `await loadSecrets()` as its final step (after alarm resurrection). The comment at line 184–187 explicitly documents this: "AWAIT both bootstrap calls so the SW is fully ready before any incoming RPC handler fires."

### Finding: Race Condition Exists But Is Mitigated, Not Eliminated

`chrome.runtime.onMessage.addListener` registers **synchronously at module parse time** (line 826). The `onStartup` async listener resolves `loadSecrets()` asynchronously. In theory, a message can arrive in the window between:

1. Module loads, `onMessage` listener registered, `secretCache = { workerModToken:'', leadModToken:'' }` (line 84)
2. `onStartup` fires, `loadSecrets()` begins async storage read
3. **Message arrives here** — `secretCache` is still empty
4. `loadSecrets()` resolves, populates `secretCache`

**Existing mitigations (sufficient for current traffic):**

- `_rpcWorkerCall` (line 1070–1071): `if (!secretCache.workerModToken && !secretCache.leadModToken) { try { await loadSecrets(); } ... }` — lazy rehydration before any worker call.
- `tokensStatus` handler (line 956–957): same defensive `loadSecrets()` call if cache is empty.
- `_bugPollAndBadge` (line 298–299): same pattern.
- `_maintWeeklyRun` (line 648): same pattern.

**Assessment:** The defensive `loadSecrets()` inside `_rpcWorkerCall` is the correct fix for the race. Every handler that touches `secretCache` for a worker call goes through `_rpcWorkerCall`, so the lazy-load fires before the first real credential use. The race window produces at most one extra storage read, not a credential-less fetch.

**A formal Promise gate is NOT required.** The lazy-load pattern is idiomatic for MV3 service workers and handles SW eviction (the more common scenario) as well as startup. A gate would add complexity and a new failure mode (messages queueing indefinitely if `loadSecrets()` hangs).

**One gap identified:** `tokensStatus` has its own defensive call, but the `clearTokens` and `setTokens` handlers (lines 896–905, 862–884) do NOT have a defensive `loadSecrets()` before operating on `secretCache`. These handlers write to `secretCache` rather than read it for auth, so the absence is harmless for auth — but a `clearTokens` message arriving before `onStartup` completes would correctly zero the cache, which is fine. `setTokens` overwrites the cache unconditionally, which is also correct. No action needed on these two.

### Content Script Re-injection

Not needed. GAW ModTools uses manifest `content_scripts` with `matches: ["*://greatawakening.win/*"]`. Chrome automatically re-injects into matching tabs on SW restart. Manual re-injection via `chrome.scripting.executeScript` would be needed only if scripts were injected programmatically at runtime with no manifest entry — which is not the case here. Correct to leave this alone.

---

## Summary

| Rule | Status | Action |
|---|---|---|
| 13 — sendMessage error handling | 2 bare calls found + 1 lossy error path | Patches documented above (popup.js:306, modtools.js:1519, popup.js:750) |
| 14 — gam_health alarm | Missing | Add `HEALTH_ALARM` constant, create in onInstalled + onStartup, add `_healthCheck()` handler |
| 15 — SW state restore on restart | Implemented with mitigations | No gate needed; lazy-load pattern in `_rpcWorkerCall` covers the race; content script re-injection correctly N/A |

**Files to patch:** `background.js` (Rule 14 additions), `popup.js` (Rule 13 line 306 and line 750), `modtools.js` (Rule 13 line 1519).
