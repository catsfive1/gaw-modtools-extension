# AF-13: Anti-Fragile Audit — Rules 37-39
**GAW ModTools v10.5.1 | AUDIT-ONLY | 2026-05-09**

---

## Rule 37 — Long-Lived Ports (chrome.runtime.connect)

**Finding: SKIP — sendMessage is correct for all current paths. Zero port migrations proposed.**

### Analysis

The codebase has four `onMessage.addListener` registrations:

| Location | Purpose | Traffic pattern |
|---|---|---|
| `background.js:877` | Unified SW router (ping, setTokens, clearTokens, rpc, etc.) | Request/response, low frequency |
| `modtools.js:1182` | Debug snapshot, sniff toggle, rehydrate | Popup-triggered, one-shot |
| `modtools.js:4315` | clearLocalStorage, getStats, maintenanceSnack | Popup-triggered, one-shot |
| `modtools.js:21539` | manualCrawl, fetchReport, crawlModmailHistory | Popup-triggered, one-shot |

**Modmail panel:** Modmail is crawled via `crawlModmailHistory()` in modtools.js. This is a polling loop driven by `setTimeout` inside the content script — it does not stream data back to the popup in real time. The popup fires a single `chrome.tabs.sendMessage({ type: 'crawlModmailHistory', maxPages: N })` and awaits one response containing aggregated stats. No incremental updates flow back.

**Chat panel:** The mod-chat system (modtools.js ~line 14265) is entirely content-script-resident. Messages are polled from the worker via direct `fetch` calls inside the content script at `POLL_CLOSED_MS = 30s` / `POLL_OPEN_MS = 10s` intervals. The popup never reads streaming chat data — it controls chat UI embedded in the page DOM. No extension messaging pipe carries chat traffic.

**Port migration would be justified if:** a panel needed to stream >1 message per second back to the popup continuously over a session-length connection. Neither modmail nor chat qualifies — modmail is batch-and-done, chat polling runs in the content script itself with no popup relay.

**Decision: sendMessage-only architecture is correct and should be preserved.** The overhead of establishing a port, registering `onDisconnect`, and managing reconnect logic for these one-shot request/response patterns would add complexity with zero throughput benefit.

---

## Rule 38 — chrome.runtime.lastError in addListener Callbacks

**Finding: 4 VIOLATIONS across 3 files.**

`chrome.runtime.lastError` must be accessed inside any callback that could trigger a Chrome runtime error — primarily any `sendResponse` path where the caller may have navigated away, and any async operation inside a listener. Unchecked `lastError` causes Chrome to throw an unhandled error to the console.

### Violations

**V38-1: `background.js:877` — SW unified router (most critical)**
The main `onMessage.addListener` has no `lastError` check at the top of the callback or inside any of the `(async () => { ... })()` blocks before calling `sendResponse`. If the popup closes or the content script context is invalidated between the listener firing and `sendResponse` being called (e.g., in the `rpc` handler at line 1044-1050), Chrome silently logs `lastError`. The `clearTokens`, `setTokens`, `openPopup`, and all RPC branches use `(async () => { sendResponse(...) })()` with no guard.

```js
// VIOLATION — no lastError check before sendResponse in async branch
if (msg && msg.type === 'rpc') {
  (async () => {
    const out = await _dispatchRpc(msg.name, msg.args, sender);
    sendResponse(out);  // <-- caller may be gone; lastError not checked
  })();
  return true;
}
```

**V38-2: `modtools.js:1182` — content script listener (init block 1)**
The `forceRehydrate`, `getDebugSnapshot`, `clearSniff`, and `toggleSniff` handlers call `sendResponse` inside async blocks or directly with no `chrome.runtime.lastError` guard. The `verifySnapshotConsent` round-trip at line 1211 (`chrome.runtime.sendMessage(...)`) has no `lastError` check on its own response either.

**V38-3: `modtools.js:4315` — content script listener (init block 2)**
`clearLocalStorage`, `getStats`, and `maintenanceSnack` all call `sendResponse` synchronously with no `lastError` check. If the popup closed between sending and the content script processing the message, Chrome will raise an unhandled error.

**V38-4: `modtools.js:21539` — content script listener (init block 3)**
`manualCrawl`, `fetchReport`, and `crawlModmailHistory` use `.then(r => sendResponse(...)).catch(e => sendResponse(...))` — no `lastError` access in either branch.

### Compliant baseline for comparison
`background.js:212` correctly checks `lastError` in the `chrome.alarms.get` callback:
```js
if (chrome.runtime.lastError) { console.warn('...', chrome.runtime.lastError.message); return; }
```
All four `onMessage` listeners need the same treatment.

### Remediation pattern (for implementation phase)
At the top of each `onMessage.addListener` callback body, before any other logic:
```js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (chrome.runtime.lastError) { return; }  // <-- add this line
  // ... existing handler logic ...
});
```
For async `sendResponse` calls, wrap the call:
```js
(async () => {
  const out = await _dispatchRpc(msg.name, msg.args, sender);
  if (!chrome.runtime.lastError) sendResponse(out);
})();
```

---

## Rule 39 — Rate-Limiting sendMessage / RPC Flooding

**Finding: 2 existing rate limits, 4 RPC categories with no per-name limit. One generic SW-side guard proposed.**

### Existing rate limits

| Mechanism | Location | Scope | Limit |
|---|---|---|---|
| `_LAST_CLEAR_TOKENS_AT` debounce | `background.js:946` | `clearTokens` msg type | 1 per 10s |
| `CLIENT_RATE_PER_MIN` token bucket | `modtools.js:14275` | Chat `modMessageSend` (client side) | 30/min |
| `WRITE_RATE_PER_MINUTE = 30` | Background chat handler | Chat write path (server side) | 30/min |

### Unprotected paths that can flood the SW

**U39-1: `modAuditLog` — fire-and-forget from DOM events**
`modtools.js:4371` calls `rpcCall('modAuditLog', ...)` inside `logAction()`. `logAction()` is called on every ban, remove, flag, title-write, sniper-arm, and precedent-mark action. There is no client-side debounce. A bug or automation loop that triggers bans rapidly (e.g., bulk ban from the Triage Console) could fire dozens of audit RPCs in a second, each producing a `chrome.runtime.sendMessage` and a subsequent SW-side fetch.

**U39-2: `modProfilesWrite` — called from hover panels**
`modtools.js:6815` and `7346` call `rpcCall('modProfilesWrite', ...)` on profile note saves. These are user-triggered, but the hover panel has no debounce on the save path — rapid typing or a buggy MutationObserver re-trigger could fire multiple writes per second.

**U39-3: `modAiGrokChat` — AI assist on ban/modmail panels**
Called from user-facing buttons (lines 7633, 7643, 7720), but there is no per-RPC debounce. Double-clicking an AI button sends two simultaneous RPCs; each reaches the SW and fires a fetch to the Grok/Llama endpoint.

**U39-4: Presence ping — `modPresencePing`**
Called from popup.js:4904 on a manual button. Low risk as-is, but the pattern is the same: no debounce.

### Proposed: generic SW-side per-RPC-name rate limiter

A single 15-line guard at the top of `_dispatchRpc` in `background.js` covers all four cases without touching any call site:

```js
// --- Per-RPC-name rate limit (AF-13, Rule 39) ---
const _RPC_WINDOWS = new Map();   // name -> [timestamp, ...]
const _RPC_LIMITS = {
  modAuditLog:      { maxPerMin: 60 },   // high-volume, tolerate bursts
  modProfilesWrite: { maxPerMin: 20 },   // user saves, no burst needed
  modAiGrokChat:    { maxPerMin: 10 },   // expensive upstream call
  modPresencePing:  { maxPerMin: 6  },   // once per 10s is plenty
  // default: no limit (popup admin RPCs are inherently low-frequency)
};

function _rpcRateCheck(name) {
  const limit = _RPC_LIMITS[name];
  if (!limit) return true;
  const now = Date.now();
  const window = (_RPC_WINDOWS.get(name) || []).filter(t => now - t < 60_000);
  if (window.length >= limit.maxPerMin) {
    console.warn('[ModTools AF-13] RPC rate-limited:', name, window.length + '/min');
    return false;
  }
  window.push(now);
  _RPC_WINDOWS.set(name, window);
  return true;
}

// In _dispatchRpc, before the handler lookup:
async function _dispatchRpc(name, args, sender) {
  if (!_rpcRateCheck(name)) {
    return { ok: false, status: 429, error: 'rate limited (' + name + ')' };
  }
  // ... existing dispatch logic ...
}
```

**Why SW-side, not client-side:** Content scripts are untrusted surfaces. A compromised or buggy content script can bypass any client-side debounce. The SW is the single choke point all `rpc` messages pass through, making it the correct enforcement layer — consistent with the existing `clearTokens` 10s debounce pattern already in `background.js`.

**Why per-name, not global:** A global RPC rate limit would throttle admin popup operations (token rotation, mod list) during any burst from a content script. Per-name limits let high-value popup operations pass through while clamping the high-frequency content-script paths.

---

## Summary

| Rule | Status | Action |
|---|---|---|
| 37 (ports) | PASS — skip | sendMessage is correct; no port migrations warranted |
| 38 (lastError) | 4 VIOLATIONS | Add `lastError` guard at top of all 4 `onMessage` callbacks; wrap async `sendResponse` |
| 39 (rate limit) | PARTIAL — 2 covered, 4 exposed | Add `_rpcRateCheck()` in `_dispatchRpc`; limits for `modAuditLog`, `modProfilesWrite`, `modAiGrokChat`, `modPresencePing` |
