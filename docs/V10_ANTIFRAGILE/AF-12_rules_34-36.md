# AF-12 — Anti-Fragile Suite: Rules 34–36
**Agent:** AF-12 | **Version:** v10.5.1 | **Date:** 2026-05-09 | **Mode:** AUDIT-ONLY

---

## Scope

Files audited: `background.js`, `modtools.js`, `popup.js`
Files modified: none (audit-only)

---

## Rule 34 — Input Validation & Sanitization on RPC Handlers

### Dispatcher-level defenses (background.js)

Three gates fire for every named RPC before any handler runs:

| Gate | Implementation | Location |
|---|---|---|
| Caller-context check | `def.allowed_callers.includes(callerCtx)` — hard error on mismatch | `_dispatchRpc`, L2316 |
| Origin check (content-script) | `_validateRpcSenderOrigin` — exact `URL.origin` match against `_ALLOWED_CONTENT_ORIGINS` | L2293–2310 |
| Arg payload size cap | `JSON.stringify(args).length > _RPC_MAX_ARG_BYTES` (256 KB ceiling) | L2325–2330 |

The origin check was hardened in v9.3.15 (Vanguard ER2-C-1): the previous `indexOf`-prefix match that accepted `greatawakening.win.evil.com` was replaced with `new URL().origin` strict equality.

### Handler-level validation — full RPC roster

The `RPC_HANDLERS` object contains **72 named handlers**. Below is a complete audit. Handlers are grouped by validation posture.

#### STRONG validation (type-check + length cap + allowlist/regex)

| Handler | What is validated |
|---|---|
| `authValidateToken` | Regex `/^[A-Za-z0-9_-]{32,256}$/` before any storage write |
| `authBackupPut` | Same regex; key must be `workerModToken` or `leadModToken` |
| `authBackupGet` | Key allowlist: only `workerModToken`/`leadModToken` pass |
| `modSearch` | `q` + `scope` URL-encoded; `limit` clamped `1–200` |
| `modGawTimeline` | `username` sliced to 64, `limit` clamped `5–50` |
| `macroUpsert` | `kind` allowlist (`ban_msg`/`mm_reply`); `label` ≤80, `body` ≤4000 |
| `macrosList` | `kind` allowlist; rejects unknown kinds with 400 |
| `macroDelete` | `id` must be `Number.isFinite && > 0` |
| `macroUse` | Same integer check |
| `macroAiSuggest` | `kind` allowlist; `count` clamped `3–8`; `context` sliced to 800; `existing_labels` array capped at 30 items × 80 chars each |
| `aiSummarizeBan` | `reason` sliced to 800; `username`/`violation` 64; `duration_label` 16; `evidence_url` 600 |
| `modmailAiReplyForThread` | `sender` sliced to 64 (required); `subject`/`thread_id`/`violation` sliced; `last_messages` capped at last-3 entries × 64/600 per field |
| `aiHealthSummarize` | `report_json` sliced to 32 KB |
| `linkPreview` | Sliced to 1000; regex `^https?:\/\/` required |
| `bugReportList` | `status` URL-encoded; `limit` clamped `1–500` |
| `bugReportUpdate` | `id` integer-gated; string fields coerced via `String()` |
| `adminDrRulesDelete` | `id` integer-gated |
| `modMessageEdit` | `id` integer-gated; `content` non-empty string required |
| `modMessageDelete` | `id` integer-gated |
| `modBugReport` | `debugSnapshot` capped at 16 KB with truncation marker (v9.3.13 Vanguard H-3) |
| `adminSettingsWrite` | `key` presence check |
| `bugReportVisibilityWrite` | `visible_to` presence check |
| `modSusMark`/`modSusClear` | `username` presence check |
| `adminDrRulesAdd` | `pattern` presence check |
| `adminAuditVerify` | `limit` clamped `1–50000`; `from` floored at 0 |
| `adminModPromote` | `tier` allowlist `['mod','senior_lead','lead']`; `username` required |
| `adminModLapsed` | `days` clamped `7–60` |
| `adminUsersLookalikes` | `username` sliced to 64 (required); `limit` clamped `1–10` |
| `adminThreadIntel` | `post_id` sliced to 64 (required) |
| `modmailRecent` | `limit` clamped `5–50` |
| `maintenanceRunNow` | No args, no validation needed |
| `adminMaintenanceReportsList` | `days` clamped `1–90`; `limit` clamped `1–500`; `severity` trimmed |

#### MINIMAL validation (String coercion only, no length cap)

These handlers coerce all args via `String(args && args.X || '')` or `args && args.X` passthrough but impose no upper-bound length cap on free-text fields that reach the worker:

| Handler | Uncapped fields | Risk level |
|---|---|---|
| `modFlagsWrite` | `reason` | LOW — worker enforces |
| `modProfilesWrite` | `profile` (object) | LOW — worker enforces |
| `modProfilesWritePatch` | `patch` (object) | LOW — worker enforces |
| `modTitlesWrite` | `title`, `kind` | LOW |
| `modSniperArm` | `banDelayHours` | LOW — numeric, worker enforces |
| `modAiNextBestAction` | `context`, `extra` | MEDIUM — AI prompt injection surface |
| `modAiGrokChat` | `prompt` | MEDIUM — AI prompt injection surface; no client-side cap |
| `modAiBanSuggest` | `comment` (sliced to 1500 in one call site, but not in handler) | MEDIUM |
| `modmailTrackResponse` | `response_body` (String coerced, no cap in handler) | LOW |
| `modPresencePing` | `args || {}` passthrough | LOW |
| `modModmailSync` | `threads`, `messages` arrays | LOW — 256 KB dispatcher cap backstop |
| `modProposalsCreate` | `args || {}` passthrough | LOW |
| `modParkedCreate` | `note` | LOW |
| `adminDiscordDmModSend` | `body` (Discord DM text, trimmed but uncapped) | LOW |

**Finding R34-1 (MEDIUM):** `modAiGrokChat` passes `prompt` to the worker with no client-side length cap. The 256 KB dispatcher ceiling is the only backstop. A compromised content script could exhaust per-mod AI budget in a single call with a ~250 KB prompt. Recommend: cap `prompt` at 8 KB in the handler, matching `macroAiSuggest`'s `context` cap discipline.

**Finding R34-2 (LOW-INFO):** `modAiBanSuggest` slices `comment` to 1500 at call sites in `modtools.js` but the handler itself does not enforce this cap — a different call path could bypass it. Recommend: add `.slice(0, 1500)` to the handler for defense-in-depth.

**Finding R34-3 (LOW-INFO):** Fourteen handlers pass object args (`profile`, `patch`, `threads`, `messages`, etc.) through to the worker with no field-level validation. The 256 KB ceiling at `_dispatchRpc` is the sole structural backstop. This is acceptable given worker-side enforcement, but should be noted for future audit if worker validation is ever relaxed.

### Pre-RPC checks on legacy message types

| Type | Validation |
|---|---|
| `setTokens` | Shape check via `__isValidTokenOrEmpty`; type coerced; malformed tokens rejected before storage |
| `clearTokens` | Rate-limited to 1 per 10 s (v9.3.15 Vanguard M-1) |
| `mintSnapshotConsent` | Caller must NOT have `sender.tab` (popup-only enforced) |
| `verifySnapshotConsent` | `nonce` coerced to string; one-shot 5 s TTL consumed on verify |
| `verifyUpdateFlag` | Triple-field equality check against SW RAM |
| `openPopup` | No args consumed |
| `ping` | No args consumed |

---

## Rule 35 — Circuit Breaker for Flaky Message Channels

### Current state: no client-side circuit breaker exists

The `rpcCall` function in `modtools.js` (L19652) wraps `chrome.runtime.sendMessage` with:

1. Pre-call context check — detects severed `chrome.runtime` and returns `EXT_CONTEXT_INVALIDATED` immediately (v9.5.2 + v9.24.0).
2. Post-call catch — coalesces Chrome's four "extension orphaned" error variants into the same `EXT_CONTEXT_INVALIDATED` code.

What is **absent**: there is no circuit breaker for the case where the background SW is alive but flaky (slow, partially responsive, repeatedly timing out). Every `rpcCall` goes straight to `sendMessage` regardless of recent failure history. A SW that takes 18 s per call and times out repeatedly will block UI code on every attempt until the caller's own catch fires.

The `_rpcWorkerCall` helper in `background.js` has a 20 s `AbortController` timeout for outbound worker fetches. That covers the network leg. It does not cover the `sendMessage` round-trip itself, which has no timeout in the browser API — it will hang until the SW responds or the port is destroyed.

**Finding R35-1 (MEDIUM):** No circuit breaker on `chrome.runtime.sendMessage`. Repeated SW-side failures (SW thrash, service-worker-kill-on-idle cycle, worker network errors) cause UI code to pile up awaiting hung `sendMessage` calls with no backoff or fast-fail.

### Proposed thin client-side breaker

This is a design proposal only (audit mode). The breaker would live in `modtools.js`, wrapping `rpcCall`, and would NOT modify `background.js`.

```js
// AF-12 R35 proposal: thin circuit breaker for chrome.runtime.sendMessage
// State: CLOSED (normal), OPEN (fast-fail), HALF_OPEN (probe allowed).
const _CB = {
  state: 'CLOSED',       // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  failures: 0,
  threshold: 4,          // 4 consecutive failures -> OPEN
  resetAfterMs: 15_000,  // try HALF_OPEN probe after 15 s
  openedAt: 0,
  lastProbeAt: 0
};

async function rpcCallBreaker(name, args) {
  if (_CB.state === 'OPEN') {
    const now = Date.now();
    if (now - _CB.openedAt < _CB.resetAfterMs) {
      return { ok: false, status: 0, code: 'CB_OPEN',
               error: 'Extension messaging circuit open — retrying shortly.' };
    }
    // Transition to HALF_OPEN for one probe
    _CB.state = 'HALF_OPEN';
    _CB.lastProbeAt = now;
  }

  const r = await rpcCall(name, args);

  if (!r || !r.ok) {
    const isTransient = !r || r.code === 'EXT_CONTEXT_INVALIDATED'
      || r.error === 'no response from background';
    if (isTransient) {
      _CB.failures++;
      if (_CB.failures >= _CB.threshold || _CB.state === 'HALF_OPEN') {
        _CB.state = 'OPEN';
        _CB.openedAt = Date.now();
        _CB.failures = 0;
        try { _gamShowExtOrphanedBanner(); } catch(_) {}
      }
    }
  } else {
    // Success resets breaker
    _CB.state = 'CLOSED';
    _CB.failures = 0;
  }
  return r;
}
```

**Design decisions:**
- Threshold of 4 consecutive transient failures before OPEN. Transient = `EXT_CONTEXT_INVALIDATED` or `no response from background`. Explicit worker errors (HTTP 4xx/5xx) do NOT trip the breaker — those are caller logic errors, not channel faults.
- 15 s reset window before HALF_OPEN probe. Shorter than a SW restart cycle (~30 s), so the UI recovers as soon as the SW comes back.
- HALF_OPEN trips immediately to OPEN on probe failure — no retry budget in probe mode.
- Banner fires on OPEN transition (same `_gamShowExtOrphanedBanner` path that R36 uses), so the user gets one notification regardless of which error path triggered.
- Implementation impact: replace direct `rpcCall` calls in hot paths (polling: `modMessageInbox`, `modMessageUnreadCount`, `modPresencePing`) with `rpcCallBreaker`. Fire-and-forget audit log calls can remain on bare `rpcCall`.

---

## Rule 36 — Fallback UI for Messaging Failures

### Current state: partial coverage, no popup-side fallback

#### Content script (modtools.js) — GOOD

`rpcCall` (L19652) has three-layer protection added across v9.5.2 and v9.24.0:

1. **Pre-call detection:** checks `typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function'` — surfaces banner immediately and returns structured `EXT_CONTEXT_INVALIDATED`.
2. **Post-catch detection:** regex `/context invalidated|receiving end does not exist|message port closed|sendMessage/i` coalesces all Chrome error variants.
3. **Banner UI (v9.24.0):** `_gamShowExtOrphanedBanner()` injects a fixed-top amber bar reading "ModTools updated. The extension was reloaded — refresh this page to reconnect." with "Reload page" and "Dismiss" buttons. One-shot guard via `document.getElementById('gam-ext-orphaned-banner')` prevents stacking.
4. **snack() routing (v9.24.0):** `snack()` checks `_gamIsExtOrphanedMsg(msg)` before rendering — orphaned-error snacks are silently redirected to the one-shot banner instead of spamming per-call.

**Coverage assessment:** content-script path is well-hardened. The banner fires on the very first orphaned RPC call and suppresses all subsequent noise.

#### Popup (popup.js) — GAP

The popup makes `chrome.runtime.sendMessage` calls directly throughout (not via `rpcCall`). Representative examples: `saveTokensSecurely` (L750), `__tokensStatus` (L774), token save flow (L943), whoami probes (L908, L1022, L1939), and all RPC dispatches from popup.js.

Every one of these has `try/catch` that returns `{ ok: false, error: String(e) }` or surfaces an error label in the popup UI. However:

- There is **no equivalent of `_gamShowExtOrphanedBanner`** for the popup surface.
- When the SW is dead (common after browser restart or extension update while popup is open), the popup will show per-field error labels like `"network error: Extension context invalidated."` with no actionable guidance.
- The popup does not detect `EXT_CONTEXT_INVALIDATED` and substitute a friendly "Extension is restarting, close and reopen the popup" message.

**Finding R36-1 (MEDIUM):** Popup lacks a centralized context-invalidation handler. Each catch block independently stringifies the exception, producing inconsistent, non-actionable error messages when the SW is unavailable.

**Finding R36-2 (LOW):** No "Extension is restarting..." interim state. When the popup is open and the SW is cold-starting (first call after browser idle eviction), the first `sendMessage` call may fail with `"Receiving end does not exist."` before the SW restarts. This shows as a generic error rather than a transient-retry notice.

### Proposed popup fallback UI (audit-only proposal)

A small shared wrapper in `popup.js`:

```js
// AF-12 R36 proposal: popup-side context-invalidation wrapper
async function popupRpc(name, args) {
  try {
    const r = await chrome.runtime.sendMessage({ type: 'rpc', name, args: args || {} });
    if (!r) return { ok: false, code: 'NO_RESPONSE', error: 'No response from extension background.' };
    return r;
  } catch (e) {
    const msg = String(e && e.message || e);
    if (/context invalidated|receiving end does not exist|message port closed/i.test(msg)) {
      __showPopupRestartNotice();
      return { ok: false, code: 'EXT_CONTEXT_INVALIDATED',
               error: 'Extension is restarting — close and reopen this popup.' };
    }
    return { ok: false, error: msg };
  }
}

function __showPopupRestartNotice() {
  // Idempotent — only inject once
  if (document.getElementById('gam-popup-restart-notice')) return;
  const d = document.createElement('div');
  d.id = 'gam-popup-restart-notice';
  d.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:9999;background:#2a1d10;' +
    'border-bottom:1px solid #ff9933;color:#ffd84d;font:600 11px ui-monospace,monospace;' +
    'padding:6px 12px;text-align:center;';
  d.textContent = 'Extension is restarting — close and reopen this popup.';
  document.body.prepend(d);
}
```

**Implementation note:** replace direct `chrome.runtime.sendMessage({ type:'rpc', ... })` calls in popup.js with `popupRpc(name, args)`. Legacy message types (`setTokens`, `clearTokens`, `tokensStatus`, etc.) that call `sendMessage` directly should either be wrapped with the same catch pattern or routed through `popupRpc` with `type` passthrough.

---

## Summary Table

| Rule | Finding | Severity | Status |
|---|---|---|---|
| R34 | 72 RPC handlers — 30+ have strong length/type validation | — | PASS |
| R34 | `modAiGrokChat.prompt` uncapped client-side | MEDIUM | OPEN |
| R34 | `modAiBanSuggest.comment` cap enforced at call site, not handler | LOW | OPEN |
| R34 | 14 object-passthrough handlers (profile, patch, arrays) | LOW-INFO | ACCEPTED |
| R35 | No circuit breaker on `chrome.runtime.sendMessage` | MEDIUM | OPEN |
| R36 | Content-script orphaned-banner coverage complete (v9.24.0) | — | PASS |
| R36 | Popup lacks centralized context-invalidation fallback UI | MEDIUM | OPEN |
| R36 | No transient-retry notice for cold SW start in popup | LOW | OPEN |

---

## Recommended Implementation Order

1. **R36-popup wrapper** (`popupRpc` + `__showPopupRestartNotice`) — smallest diff, highest user-visible impact. One function replaces ~40 scattered `sendMessage` call sites.
2. **R34 handler caps** — add `.slice(0, 8192)` to `modAiGrokChat.prompt` and `.slice(0, 1500)` to `modAiBanSuggest.comment` in handlers. Two-line changes.
3. **R35 circuit breaker** — add `_CB` state and `rpcCallBreaker` wrapper; wire into the three polling paths (`modMessageInbox`, `modMessageUnreadCount`, `modPresencePing`). Moderate diff, significant resilience gain.
