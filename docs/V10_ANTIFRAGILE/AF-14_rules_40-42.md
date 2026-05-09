# AF-14 — Anti-Fragile Rules 40-42 Audit
**Version:** GAW ModTools v10.5.1  
**Audit date:** 2026-05-09  
**Mode:** AUDIT-ONLY — no code changed  
**Files examined:** modtools.js, popup.js, background.js, popup.html, manifest.json

---

## Rule 40 — Message Queuing During SW Downtime

### Finding: NO QUEUE EXISTS

`rpcCall()` in modtools.js (line 19652) is the sole gateway from the content script to the background Service Worker. It already detects SW death correctly — the `EXT_CONTEXT_INVALIDATED` guard at line 19663 catches `chrome.runtime.sendMessage` being undefined or throwing, collapses every Chrome error variant into one actionable code, and surfaces the `_gamShowExtOrphanedBanner()` affordance.

What it does NOT do: persist the failed message anywhere. The call returns `{ ok: false, code: 'EXT_CONTEXT_INVALIDATED' }` and the caller discards it.

### Queuing candidates

Three call patterns need queuing most urgently:

| Call | Location | Why it matters |
|---|---|---|
| `modmailTrackResponse` | modtools.js:535, 15519 | Fire-and-forget AI tracking; silent loss corrupts AI context history |
| `ai_used` flag (inline rpcCall in apiSendModMessage) | modtools.js:535 | Stat integrity: if SW down at send time, ai_used row is never written |
| `bugReportUpdate` | popup.js:2943 | User-initiated; losing a bug report is visible friction |

`modmailTrackResponse` and the `ai_used` path are the two that auto-fire with no retry — they are `.catch(()=>{})` fire-and-forgets. If the SW is restarting at that moment, the data is silently gone.

### Proposed: `gam_msg_queue` storage-backed queue

```js
// --- gam_msg_queue: SW-downtime outbox ---
// chrome.storage.local key: 'gam_msg_queue'
// Schema: Array<{ id, ts, type, name, args }>
// Max depth: 20 (drop oldest on overflow)
// Replay: called at top of rpcCall() on every SW-healthy invocation

const MSG_QUEUE_KEY = 'gam_msg_queue';
const MSG_QUEUE_MAX = 20;

async function _enqueueRpc(name, args) {
  try {
    const r = await chrome.storage.local.get(MSG_QUEUE_KEY);
    const q = (r[MSG_QUEUE_KEY] || []).slice(-(MSG_QUEUE_MAX - 1));
    q.push({ id: Date.now() + Math.random(), ts: Date.now(), type: 'rpc', name, args });
    await chrome.storage.local.set({ [MSG_QUEUE_KEY]: q });
  } catch (_) {}
}

async function _replayMsgQueue() {
  try {
    const r = await chrome.storage.local.get(MSG_QUEUE_KEY);
    const q = r[MSG_QUEUE_KEY];
    if (!q || !q.length) return;
    await chrome.storage.local.remove(MSG_QUEUE_KEY); // optimistic clear
    for (const item of q) {
      try { await rpcCall(item.name, item.args); } catch (_) {}
    }
  } catch (_) {}
}
```

`rpcCall()` integration — two changes only:

1. At the top of a successful send path (after line 19682 resolves `ok:true`), add:
   ```js
   _replayMsgQueue(); // drain outbox if SW just recovered
   ```

2. At the `EXT_CONTEXT_INVALIDATED` return sites (lines 19666 and 19698), callers that pass a `{ queued: true }` option get enqueued instead of silently dropped:
   ```js
   if (opts && opts.queued) { _enqueueRpc(name, args); }
   ```

Only `modmailTrackResponse` and the `ai_used` inline call need `queued:true` in v10.5.1 — they are the only silent-fail paths where data loss has downstream consequences. `bugReportUpdate` is user-facing so it already gets a snack error; no queuing needed there.

**Verdict: MISSING. Implement queue before next SW-kill scenario degrades AI context history.**

---

## Rule 41 — Message-Level Debug Logging (Toggleable)

### Finding: PARTIAL — category-scoped, not message-scoped

The diag infrastructure in modtools.js (lines 43-80) is well-built:

- `_diagBuffer`: in-memory 500-entry ring buffer
- `_DIAG_KEY = 'gam_diag_log'`: persisted to `chrome.storage.local`
- `_diagLog(category, message, extra)`: structured entries with ISO timestamp, category, stack (for sticky/auth-modal/modPost), and version

`popup.js` mirrors this pattern with `MAINT_DIAG_KEY = 'gam_diag_log'` and a parallel append function (line 3669). `background.js` reads `MAINT_DIAG_KEY` at line 51 and writes diag status into the RPC health payload (line 672).

**What is missing:** `rpcCall()` itself is NOT instrumented. Every `chrome.runtime.sendMessage({ type: 'rpc', name, args })` call at line 19682 fires silently. There is no record of: what name was called, with what args, at what time, or what response came back. The `_netLog` ring buffer (lines 19291-19305) captures legacy `workerCall` HTTP traffic, not RPC dispatch.

The result: when a mod reports "the ban didn't register" or "AI reply wasn't tracked," there is no per-message trace to diff against.

### Proposed: `gam_settings.msg_log_enabled` toggle + rpcCall instrumentation

Flag location: `gam_settings` in `chrome.storage.local` (same key as all other user toggles, so it surfaces in the popup Settings tab naturally).

Ring buffer: 200 entries under key `gam_rpc_log` in `chrome.storage.local`. Separate from `gam_diag_log` to avoid crowding the existing diag stream.

```js
// In rpcCall(), wrap the sendMessage call:
const _RPC_LOG_KEY = 'gam_rpc_log';
const _RPC_LOG_MAX = 200;

async function rpcCall(name, args) {
  // ... existing EXT_CONTEXT_INVALIDATED guard unchanged ...
  const t0 = Date.now();
  const msgLogEnabled = getSetting('msg_log_enabled', false);
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'rpc', name, args: args || {} });
    if (msgLogEnabled) {
      _appendRpcLog({
        ts: t0, name, ok: !!(resp && resp.ok),
        status: resp && resp.status,
        latency_ms: Date.now() - t0,
        // sanitize: drop response_body, token fields
        error: (resp && resp.error) || null
      });
    }
    if (!resp) return { ok: false, status: 0, error: 'no response from background' };
    return resp;
  } catch (e) {
    // ... existing catch unchanged, but also log the failure ...
    if (msgLogEnabled) {
      _appendRpcLog({ ts: t0, name, ok: false, status: 0,
        latency_ms: Date.now() - t0, error: String(e && e.message || e) });
    }
    // ... existing returns unchanged ...
  }
}

async function _appendRpcLog(entry) {
  try {
    const r = await chrome.storage.local.get(_RPC_LOG_KEY);
    const log = (r[_RPC_LOG_KEY] || []).slice(-(_RPC_LOG_MAX - 1));
    log.push(entry);
    await chrome.storage.local.set({ [_RPC_LOG_KEY]: log });
  } catch (_) {}
}
```

Sanitization rules (non-negotiable):
- Never log `args.response_body` (modmail content)
- Never log `args.token`, `workerModToken`, `leadModToken`
- Log `name`, `ok`, `status`, `latency_ms`, `error` only
- Args that ARE safe to log: `thread_id`, `username`, `ai_used`, `ai_tone`, `sent_at`, numeric/boolean fields

The toggle should appear in the popup Debug/Diag section alongside the existing diag snapshot button. Off by default. The `downloadDebugSnapshot` handler should include `gam_rpc_log` alongside `gam_diag_log` when `msg_log_enabled` is true.

**Verdict: PARTIAL. Diag ring buffer exists but rpcCall is untracked. Instrumentation required; the toggle scaffolding is straightforward given existing getSetting/setSetting patterns.**

---

## Rule 42 — No eval / new Function with Message Data

### Grep results: CLEAN

Pattern searched across all `.js` files:
```
eval(  |  new Function(  |  Function('  |  Function("
setTimeout("  |  setTimeout('  |  setInterval("  |  setInterval('
```

**Result: Zero matches.**

All `setTimeout` / `setInterval` calls in the codebase pass function references or arrow functions — never string literals. Verified sample:

| File | Line | Pattern | Verdict |
|---|---|---|---|
| background.js:1074 | `setTimeout(() => { ctrl.abort() }, 20000)` | Arrow fn | CLEAN |
| background.js:1154 | `setTimeout(() => { ctrl.abort() }, 15000)` | Arrow fn | CLEAN |
| popup.js:54 | `setTimeout(function() { ... }, delay)` | Function ref | CLEAN |
| popup.js:354 | `setTimeout(function() { ... }, 0)` | Function ref | CLEAN |
| modtools.js:315-336 | `setTimeout(()=>{ buildTriageConsole() }, 700)` | Arrow fn | CLEAN |
| modtools.js:1697 | `setInterval(() => { pollTeamFeatures() }, 300000)` | Arrow fn | CLEAN |
| modtools.js:1889 | `setTimeout(function(){ self.flush(); }, TTL.FLUSH_MS)` | Function ref | CLEAN |

No `eval(`, `new Function(`, or string-argument timer calls anywhere in the extension. Message data (`msg.args`, `resp.data`) is consumed only through property access and JSON serialization — never evaluated as code.

The one adjacent pattern worth noting: modtools.js line 2274 does `JSON.parse((r && r.text) || 'null')` on the raw text returned from the SW relay. This is not `eval` — `JSON.parse` is safe provided the input is attacker-controlled string data (which it is, from the GAW worker, not from message senders). No action required; flagged for awareness only.

**Verdict: CLEAN. No Rule 42 violations found.**

---

## Summary

| Rule | Status | Priority |
|---|---|---|
| 40 — SW downtime queue | MISSING | HIGH — implement `gam_msg_queue` with replay; wire `modmailTrackResponse` and `ai_used` paths first |
| 41 — Message-level logging | PARTIAL — diag buffer exists, rpcCall untracked | MEDIUM — add `gam_settings.msg_log_enabled` + `_appendRpcLog` wrapper in rpcCall |
| 42 — No eval/new Function | CLEAN | No action |

Rule 40 is the only item requiring new code before v10.5.1 ships. The queue is small (20-entry storage-backed outbox, ~30 lines), the replay hook is a single call at the rpcCall success path, and the two at-risk callers (`modmailTrackResponse`, inline `ai_used`) are both already wrapped in `.catch(()=>{})` — so adding `queued:true` is a one-line change per call site.
