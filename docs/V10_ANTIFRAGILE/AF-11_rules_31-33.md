# AF-11 -- Rules 31-33 Audit Report
## GAW ModTools v10.5.1 | Agent AF-11 | 2026-05-09

---

## A. Rules covered

**Rule 31.** Every message must have a unique `requestId` and timeout.
**Rule 32.** Implement message versioning and backward compatibility.
**Rule 33.** Use `chrome.runtime.sendMessage` with response callback + error handling.

---

## B. Message inventory

### B1. `chrome.runtime.sendMessage` call sites

All sends are `await`-style (Manifest V3 / Promise API). No callback-style calls found.

| Group | Shape | Call sites (file:line) |
|---|---|---|
| **ping** | `{ type:'ping' }` | background.js (inbound handler only) |
| **setTokens** | `{ type:'setTokens', workerModToken, leadModToken }` | popup.js:750, modtools.js:1519 |
| **clearTokens** | `{ type:'clearTokens' }` | popup.js:476 |
| **tokensStatus** | `{ type:'tokensStatus' }` | popup.js:774 |
| **mintSnapshotConsent** | `{ type:'mintSnapshotConsent' }` | popup.js:518 |
| **verifySnapshotConsent** | `{ type:'verifySnapshotConsent', nonce }` | modtools.js:1211 |
| **verifyUpdateFlag** | `{ type:'verifyUpdateFlag', flag }` | modtools.js:20771 |
| **openPopup** | `{ type:'openPopup' }` | modtools.js:21352 |
| **GAM_OPEN_POPUP** | `{ type:'GAM_OPEN_POPUP', view }` | popup.js:306 |
| **rpc (generic)** | `{ type:'rpc', name:STRING, args:{} }` | popup.js: ~40 sites, modtools.js: ~7 sites |
| **legacy workerFetch relay** | `{ type:'workerFetch', ... }` (via msg variable) | modtools.js:2272 (see note) |

**Note on modtools.js:2272:** The `await chrome.runtime.sendMessage(msg)` call is inside `__legacyWorkerCall`. The `msg` object is built at ~line 2255 as `{ type:'workerFetch', path, body, asLead }`. The background rejects `type:'workerFetch'` hard since v9.3.13, returning `{ ok:false, error:'workerFetch removed ...' }`. The send itself exists but is a dead path in practice.

**Note on modtools.js:19682:** `await chrome.runtime.sendMessage({ type:'rpc', name, args })` is the canonical RPC shim used by almost all content-script RPC calls. This is the central bottleneck for Rules 31-33 analysis.

### B2. `chrome.tabs.sendMessage` call sites

| Shape | Call sites (file:line) |
|---|---|
| `{ type:'clearLocalStorage' }` | popup.js:486, popup.js:3746 |
| `{ type:'getDebugSnapshot', nonce }` | popup.js:521 |
| `{ type:'forceRehydrate' }` | popup.js:563, popup.js:3915 |
| `{ type:'crawlModmailHistory', maxPages }` | popup.js:4670 |
| `{ type:'maintenanceSnack', severity, summary, recommendations }` | background.js:744 |
| Caller-supplied msg (forwarded as-is) | popup.js:2059 (via `sendToActiveGawTab`) |

---

## C. Violations found

### Rule 31 -- Every message must have a unique `requestId` and timeout

**Verdict: UNIVERSALLY VIOLATED across all 50+ call sites.**

**requestId:** The string `requestId` does not appear anywhere in modtools.js, popup.js, or background.js. Zero call sites attach a unique request identifier to any message. The background RPC dispatcher (`background.js:987-993`) does not generate or echo one either.

**Timeout:** No `chrome.runtime.sendMessage` or `chrome.tabs.sendMessage` call site wraps the await in a `Promise.race` or `AbortController`-style timeout. The 20-second `AbortController` in `_rpcWorkerCall` (`background.js:1074`) guards the outgoing **fetch** to the Cloudflare worker, not the message channel itself. If the background service worker is mid-restart when a message arrives, Chrome's response port can stay open indefinitely or close with a context-invalidated error -- neither of which is a timeout on the messaging layer.

| # | Violation | Severity | Affected sites |
|---|---|---|---|
| V1 | No `requestId` on any outbound message | **P2** | All ~50 runtime.sendMessage + all 6 tabs.sendMessage sites |
| V2 | No per-message timeout on the message channel | **P2** | All ~50 runtime.sendMessage + all 6 tabs.sendMessage sites |
| V3 | `popup.js:306` -- fire-and-forget, no await, no response checked | **P1** | popup.js:306 |

**V3 detail:** The `GAM_OPEN_POPUP` send is inside a synchronous `action_fn` callback: `chrome.runtime.sendMessage({ type: 'GAM_OPEN_POPUP', view: 'token-claim' })` with no `await`, no `.then()`, no `.catch()`. The returned Promise is discarded. More critically, `type:'GAM_OPEN_POPUP'` is not handled by the background message router at all -- the only registered handler is `type:'openPopup'`. This message silently disappears. Double violation: fire-and-forget AND unrouted type.

### Rule 32 -- Message versioning and backward compatibility

**Verdict: NO versioning scheme exists.**

No message in the codebase carries a version field (`v`, `version`, `msgVersion`, or similar). The background dispatcher matches solely on `msg.type` (and `msg.name` for `type:'rpc'`). There is no negotiation path for older callers that send a legacy shape.

The existing `type:'workerFetch'` → hard-error pattern in background.js is a *deprecation guard*, not a versioning scheme. It tells the caller "this is gone," but does not let callers declare the version they speak or receive a graceful downgrade.

| # | Violation | Severity | Location |
|---|---|---|---|
| V4 | No version field on any message shape | **P2** | All message senders (all 3 files) |
| V5 | Background dispatcher has no version branch or compat shim | **P2** | background.js:826-995 |

### Rule 33 -- `chrome.runtime.sendMessage` with response callback + error handling

**Verdict: Partially compliant. Error handling present at catch level but not response-shape level. Several call sites are non-compliant.**

Most `await chrome.runtime.sendMessage(...)` calls ARE wrapped in `try/catch`, which satisfies the "error handling" clause for network-level failures (context invalidated, port closed). The content-script RPC shim at modtools.js:19681-19703 is the best-implemented site: it catches, classifies the error string, and shows an orphaned-extension banner.

**Non-compliant sites:**

| # | File:Line | Problem | Severity |
|---|---|---|---|
| V6 | popup.js:306 | Fire-and-forget; no await, no catch, response not checked | **P1** |
| V7 | popup.js:476 | `try { await ... } catch (e) {}` -- catch body is empty; errors silently swallowed | P2 |
| V8 | modtools.js:1519 | `await chrome.runtime.sendMessage(...)` inside `try{}catch(e){}` with empty catch | P2 |
| V9 | popup.js:3065 | `loadBugVisibility` catch body is empty (`} catch (e) {}`) | P3 |
| V10 | modtools.js:21352 | Response is checked (`r && r.ok`) but no timeout guard; if SW is dead, catch fires but orphan banner path not triggered (different code path from the shim) | P2 |

**Partially compliant (response checked but no requestId echo-verify):**
The majority of popup.js RPC calls do check `r && r.ok` and surface error text. This is adequate for Rule 33's response-callback intent but does not confirm the response corresponds to the specific request (no requestId correlation).

---

## D. PROPOSED fixes (not yet applied)

### D1 -- Add `__makeRequestId()` utility and attach to all outbound messages

**Target files:** modtools.js (RPC shim), popup.js (top-level utility), background.js (echo in response)

**modtools.js -- shim site (line ~19681):**
```diff
+  function __makeReqId() {
+    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
+  }
+
   try {
-    const resp = await chrome.runtime.sendMessage({ type: 'rpc', name: name, args: args || {} });
+    const requestId = __makeReqId();
+    const resp = await chrome.runtime.sendMessage({ type: 'rpc', name: name, args: args || {}, requestId });
     if (!resp) return { ok: false, status: 0, error: 'no response from background' };
     return resp;
   }
```

**background.js -- RPC dispatcher echo (line ~988):**
```diff
   if (msg && msg.type === 'rpc') {
     (async () => {
       const out = await _dispatchRpc(msg.name, msg.args, sender);
+      if (msg.requestId) out.requestId = msg.requestId;
       sendResponse(out);
     })();
     return true;
   }
```

### D2 -- Add per-message channel timeout via `Promise.race`

**Target files:** modtools.js (RPC shim), popup.js (shared utility)

The message timeout must wrap the Chrome messaging layer, not the inner fetch. Proposed utility:

```diff
+ function __sendWithTimeout(msg, timeoutMs) {
+   return Promise.race([
+     chrome.runtime.sendMessage(msg),
+     new Promise((_, rej) =>
+       setTimeout(() => rej(new Error('MSG_TIMEOUT_' + (msg.type || 'rpc') + '_' + timeoutMs + 'ms')), timeoutMs)
+     )
+   ]);
+ }
```

**modtools.js -- replace direct sendMessage in shim (line 19682):**
```diff
-    const resp = await chrome.runtime.sendMessage({ type: 'rpc', name: name, args: args || {}, requestId });
+    const resp = await __sendWithTimeout({ type: 'rpc', name: name, args: args || {}, requestId }, 25000);
```

**popup.js -- replace all direct `await chrome.runtime.sendMessage` calls with `__sendWithTimeout`.** The existing `try/catch` structure already handles the rejection; only the send call changes. Recommended timeout: 25s (5s headroom over the background's 20s fetch timeout so the SW has time to respond before the caller gives up).

**tabs.sendMessage sites:** Same pattern. `chrome.tabs.sendMessage` has no built-in timeout either. Wrap with `Promise.race` using a shorter timeout (8s -- content-script responses are local, no network hop).

### D3 -- Fix `popup.js:306` -- GAM_OPEN_POPUP fire-and-forget + wrong type

Two problems in one line: (1) fire-and-forget, (2) wrong message type (`GAM_OPEN_POPUP` is not in the background router; should be `openPopup`).

```diff
-   chrome.runtime.sendMessage({ type: 'GAM_OPEN_POPUP', view: 'token-claim' });
+   (async () => {
+     try {
+       const r = await __sendWithTimeout({ type: 'openPopup' }, 5000);
+       if (!r || !r.ok) console.warn('[ModTools] openPopup RPC failed:', r && r.error);
+     } catch (e) { console.warn('[ModTools] openPopup send failed:', e && e.message); }
+   })();
```

Note: `view: 'token-claim'` is dropped because the `openPopup` handler in background.js ignores it (`chrome.action.openPopup()` has no view parameter in the Chrome API). If popup-deep-linking is needed, that is a separate feature.

### D4 -- Add message versioning field to background dispatcher

Minimal versioning scheme: callers may optionally include `{ msgV: 1 }`. Background echoes the version it handled. Non-presence = v0 (legacy). This enables future callers to declare `msgV:2` for new field shapes without breaking old callers.

**background.js -- top of unified listener (line 826):**
```diff
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return;
+   const MSG_V = (msg && typeof msg.msgV === 'number') ? msg.msgV : 0;
+   // v10.6+ callers send msgV:1; v0 = legacy (all existing callers). No behavior
+   // difference in v10.6; the field exists so callers can detect compat.
```

**background.js -- echo in sendResponse paths (RPC handler):**
```diff
       const out = await _dispatchRpc(msg.name, msg.args, sender);
       if (msg.requestId) out.requestId = msg.requestId;
+      out.msgV = MSG_V;
       sendResponse(out);
```

**modtools.js -- shim can assert version echo:**
```diff
     const resp = await __sendWithTimeout({ type: 'rpc', name, args: args || {}, requestId, msgV: 1 }, 25000);
     if (!resp) return { ok: false, status: 0, error: 'no response from background' };
+    // Rule 32 compat check: background older than v10.6 will echo msgV:0 (absent).
+    // Tolerate that -- do not hard-fail, just skip requestId correlation.
     return resp;
```

### D5 -- Fix empty-catch sites (V7, V8, V9)

**popup.js:476:**
```diff
-  try { await chrome.runtime.sendMessage({ type: 'clearTokens' }); } catch (e) {}
+  try { await __sendWithTimeout({ type: 'clearTokens' }, 10000); } catch (e) {
+    console.warn('[ModTools] clearTokens send failed:', e && e.message);
+  }
```

**modtools.js:1519 (`syncSecretsToBackgroundVault`):**
```diff
-    await chrome.runtime.sendMessage({ type: 'setTokens', workerModToken, leadModToken });
-  } catch (e) {}
+    await __sendWithTimeout({ type: 'setTokens', workerModToken, leadModToken }, 10000);
+  } catch (e) {
+    try { console.warn('[ModTools SW vault sync failed]', e && e.message); } catch(_){}
+  }
```

**popup.js:3065 (`loadBugVisibility`):**
```diff
-  } catch (e) {}
+  } catch (e) {
+    console.warn('[ModTools] loadBugVisibility failed:', e && e.message);
+  }
```

---

## E. Priority ranking for integration agent

| Priority | Fix | Rule | Severity | Effort |
|---|---|---|---|---|
| 1 | D3 -- GAM_OPEN_POPUP fire-and-forget + wrong type | 31+33 | P1 | 1 line -> 7 lines |
| 2 | D1 -- Add `__makeRequestId` + echo in dispatcher | 31 | P2 | ~15 lines |
| 3 | D2 -- `__sendWithTimeout` utility + apply to RPC shim | 31 | P2 | ~20 lines |
| 4 | D5 -- Fix empty-catch sites | 33 | P2-P3 | 3 x 2-line patches |
| 5 | D4 -- `msgV` versioning field | 32 | P2 | ~10 lines |
| 6 | D2 (ext) -- Apply `__sendWithTimeout` to all popup.js sites | 31 | P2 | ~40 line-replacements |
| 7 | D2 (ext) -- Apply timeout to `tabs.sendMessage` sites | 31 | P2 | ~8 sites |

Items 1-5 are surgical and safe to land in a single commit. Items 6-7 are mechanical find-replace sweeps; no logic change, just timeout wrapping.

---

## F. Parse-check status

No code was modified. Audit-only mode per charter. Integration agent is responsible for parse-checking all proposed patches before landing.

Files audited:
- `modtools.js` (dist) -- exit 0 (pre-existing)
- `popup.js` (dist) -- exit 0 (pre-existing)
- `background.js` (dist) -- exit 0 (pre-existing)
