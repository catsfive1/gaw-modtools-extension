# AF-15 — Anti-Fragile Rules 43-45 Audit
**Version:** v10.5.1  **Mode:** AUDIT-ONLY  **Date:** 2026-05-09

---

## Rule 43 — Inline Schema Validator Proposal

### Current State

`_dispatchRpc` in `background.js` (L2368-2396) performs three envelope-level checks before calling any handler:

1. Unknown RPC name → reject
2. Caller context (content/popup) not in `allowed_callers` → reject
3. Serialized `args` byte size > `_RPC_MAX_ARG_BYTES` → reject

There is **no field-level schema validation** on `args` before each handler runs. Handlers do their own ad-hoc coercion (e.g. `String(args && args.username || '')`, `parseInt(args && args.limit, 10) || 50`) but this is inconsistent and offers no structured error path.

### Proposed `validateRpc` — Tiny Inline Validator

No Zod. Single-function, zero imports. Drop directly above `_dispatchRpc`.

```js
/**
 * validateRpc(args, schema) -> { ok: true } | { ok: false, error: string }
 * schema: { [field]: { type, required?, min?, max?, pattern?, enum? } }
 * Covers the 95% case: string/number/array/boolean fields with length/range/regex constraints.
 */
function validateRpc(args, schema) {
  if (!schema) return { ok: true };
  const a = args || {};
  for (const [field, rule] of Object.entries(schema)) {
    const v = a[field];
    const missing = (v === undefined || v === null || v === '');
    if (rule.required && missing) return { ok: false, error: 'missing required field: ' + field };
    if (missing) continue; // optional + absent = skip
    if (rule.type === 'string') {
      if (typeof v !== 'string') return { ok: false, error: field + ' must be string' };
      if (rule.min != null && v.length < rule.min) return { ok: false, error: field + ' too short (min ' + rule.min + ')' };
      if (rule.max != null && v.length > rule.max) return { ok: false, error: field + ' too long (max ' + rule.max + ')' };
      if (rule.pattern && !rule.pattern.test(v)) return { ok: false, error: field + ' failed pattern check' };
      if (rule.enum && !rule.enum.includes(v)) return { ok: false, error: field + ' must be one of: ' + rule.enum.join(', ') };
    } else if (rule.type === 'number') {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) return { ok: false, error: field + ' must be a finite number' };
      if (rule.min != null && n < rule.min) return { ok: false, error: field + ' below minimum ' + rule.min };
      if (rule.max != null && n > rule.max) return { ok: false, error: field + ' above maximum ' + rule.max };
    } else if (rule.type === 'boolean') {
      if (typeof v !== 'boolean') return { ok: false, error: field + ' must be boolean' };
    } else if (rule.type === 'array') {
      if (!Array.isArray(v)) return { ok: false, error: field + ' must be array' };
      if (rule.max != null && v.length > rule.max) return { ok: false, error: field + ' array too long (max ' + rule.max + ')' };
    }
  }
  return { ok: true };
}
```

Wire it into `_dispatchRpc` after the byte-size check:

```js
if (def.schema) {
  const sv = validateRpc(args, def.schema);
  if (!sv.ok) return { ok: false, status: 400, error: 'schema: ' + sv.error };
}
```

Add `schema` as an optional key to each entry in `RPC_HANDLERS`.

### Top-20 RPC Names — Proposed Schemas

Ranked by call-site frequency across `modtools.js` (grepped `rpcCall('...')` occurrences):

| # | RPC Name | Call Sites | Schema |
|---|---|---|---|
| 1 | `modAuditLog` | 3 | `{ mod:{type:'string',required:true,max:64}, action:{type:'string',required:true,max:64}, user:{type:'string',max:64}, details:{type:'object'}, pageUrl:{type:'string',max:500} }` |
| 2 | `modProfilesRead` | 3 | `{ usernames:{type:'array',required:true,max:50} }` |
| 3 | `modPrecedentFind` | 4 | `{ kind:{type:'string',required:true,enum:['User','Thread','Post','QueueItem']}, signature:{type:'string',required:true,max:128}, limit:{type:'number',min:1,max:50} }` |
| 4 | `modIntelDelta` | 4 | `{ kind:{type:'string',required:true,enum:['User','Thread','Post','QueueItem']}, id:{type:'string',required:true,max:128}, since_ts:{type:'number',min:0} }` |
| 5 | `macrosList` | 2 | `{ kind:{type:'string',required:true,enum:['ban_msg','mm_reply']} }` |
| 6 | `macroUpsert` | 2 | `{ kind:{type:'string',required:true,enum:['ban_msg','mm_reply']}, label:{type:'string',required:true,max:80}, body:{type:'string',required:true,max:4000} }` |
| 7 | `macroUse` | 2 | `{ id:{type:'number',required:true,min:1} }` |
| 8 | `modmailAiReplyForThread` | 2 | `{ sender:{type:'string',required:true,max:64}, subject:{type:'string',max:240}, thread_id:{type:'string',max:120}, last_messages:{type:'array',max:10} }` |
| 9 | `modAuditQuery` | 2 | `{ limit:{type:'number',min:1,max:500} }` |
| 10 | `modFlagsRead` | 2 | `{}` (no required fields — passthrough) |
| 11 | `modFlagsWrite` | 1 | `{ username:{type:'string',required:true,max:64}, severity:{type:'string',required:true,enum:['low','medium','high','critical']}, reason:{type:'string',max:500} }` |
| 12 | `modSusMark` | 1 | `{ username:{type:'string',required:true,max:64}, reason:{type:'string',max:200} }` |
| 13 | `modBugReport` | 1 | `{ desc:{type:'string',required:true,min:20,max:2000} }` |
| 14 | `modAiNextBestAction` | 1 | `{ kind:{type:'string',required:true}, id:{type:'string',required:true,max:128}, context:{type:'string',max:1000} }` |
| 15 | `modAiShadowTriage` | 1 | `{ kind:{type:'string',required:true}, subject_id:{type:'string',required:true,max:128} }` |
| 16 | `modGawTimeline` | 1 | `{ username:{type:'string',required:true,max:64}, since:{type:'number',min:0}, limit:{type:'number',min:5,max:50} }` |
| 17 | `modMessageEdit` | 1 | `{ id:{type:'number',required:true,min:1}, content:{type:'string',required:true,min:1,max:10000} }` |
| 18 | `modMessageDelete` | 1 | `{ id:{type:'number',required:true,min:1} }` |
| 19 | `aiSummarizeBan` | 1 | `{ username:{type:'string',max:64}, reason:{type:'string',required:true,min:1,max:800}, violation:{type:'string',max:64} }` |
| 20 | `modmailTrackResponse` | 1 | `{ thread_id:{type:'string',required:true,max:120}, sender:{type:'string',required:true,max:64}, response_body:{type:'string',required:true,min:1,max:10000} }` |

**Note:** Several handlers already do equivalent inline coercion (e.g. `macroUpsert` checks `label.length > 80`). Adding `schema` consolidates those into one place and provides the structured `{ ok:false, status:400, error:'schema: ...' }` shape callers can inspect rather than silently swallowing bad args.

---

## Rule 44 — Port Disconnect / Context Invalidated Handling

### What Exists (v9.5.2 / v9.24.0)

**`modtools.js` — `rpcCall()` (L19652-19704):** Two-layer guard:

1. **Pre-check (L19663-19680):** `typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function'` → returns `EXT_CONTEXT_INVALIDATED`, calls `_gamShowExtOrphanedBanner()`.
2. **Catch (L19686-19703):** Regex `/context invalidated|receiving end does not exist|message port closed|sendMessage/i` on the thrown error → same banner + same return code.

**`_gamShowExtOrphanedBanner()` (L6569-6594):** One-shot (guarded by `_gamExtOrphaned` flag). Creates a fixed-position orange top-bar with "Reload page" and "Dismiss" buttons. Reload calls `location.reload()`.

**`snack()` routing (L6597-6601):** Any `snack()` call whose message text matches `_gamIsExtOrphanedMsg()` is silently redirected to the banner instead of spamming individual snacks — prevents N-snack storms from parallel orphaned rpcCall chains.

**`background.js` — `onMessage` listener (L883):** Guarded by `sender.id !== chrome.runtime.id` for all message types; `chrome.runtime.onMessage` itself does not need `port.onDisconnect` because it uses one-shot messaging, not persistent ports.

### Paths That Are Unhandled or Partially Handled

**1. "No response from background" (L19683) — silent non-orphan failure.**
`if (!resp) return { ok: false, status: 0, error: 'no response from background' }` is returned but callers that fire-and-forget (e.g. `rpcCall('modAuditLog', ...).catch(()=>{})`, `rpcCall('modmailTrackResponse', ...)` at L569) silently drop it. This is the SW-restart-mid-action path: the SW wakes cold, takes >100ms, and the message listener returns `undefined` because `sendResponse` was never called before the listener returned `false`. Not an orphaned-extension error — the extension context is valid, the SW just restarted. No UI affordance exists for this case (no snack, no banner, no retry).

**2. `chrome.runtime.lastError` not consumed on fire-and-forget calls.**
Calls like `rpcCall('modAuditLog', ...) ` with `.catch(()=>{})` at L4480 suppress the JS exception, but Chrome still logs a `chrome.runtime.lastError` warning if the background rejected the port. Not user-visible but pollutes the DevTools console and can mask real errors during debugging.

**3. Content-script `onMessage` listener (L1223-1243) — `forceRehydrate` path lacks disconnect guard.**
The `msg?.type === 'forceRehydrate'` handler at L1236 sends a response but does not check for extension context validity before calling `_rehydrateImpl()`. If the content script is orphaned and receives a synthetic message (theoretically impossible from Chrome's own dispatch, but possible in tests), this would throw an unguarded exception.

**4. `openPopup` message path (L898-905) in background.js — no error surfaced to content script on `chrome.action.openPopup` throw.**
If `chrome.action.openPopup()` throws rather than rejecting (Chrome 127 quirk on certain window states), the surrounding `try/catch` at L900 returns `{ ok: false, error: ... }` but the content script's handler at L21427 only checks `r && r.ok` — the `r.error` string is never surfaced; it degrades to "Click extension icon ↑" with no diagnostic. Acceptable but worth noting.

**5. No persistent port usage detected** — there is no `chrome.runtime.connect()` / `port.onDisconnect` anywhere in the three JS files. All messaging is one-shot `sendMessage`. This means `port.onDisconnect` is not a concern for the current architecture. If a persistent port is ever added (e.g. for streaming firehose push), Rule 44 handling will need a `port.onDisconnect` → reconnect loop at that point.

**Summary:** The orphaned-extension (reload-while-tab-is-open) case is fully handled. The SW-restart-mid-action (cold-start race, no response) case is silently dropped. That is the primary gap.

---

## Rule 45 — "Reconnect" UI Affordance Audit

### Auth-Fail Banner (existing, `__showAuthFailBanner`)

Three buttons rendered conditionally (L21383-21448):

| Button | Condition | Action |
|---|---|---|
| **Force re-hydrate** | Always | `preloadSecrets()` + `syncSecretsToBackgroundVault()` + re-validate; reloads page on success |
| **Open ModTools popup** | `reason` in `['no_token','short_token','whoami_status','whoami_empty']` | `chrome.runtime.sendMessage({ type:'openPopup' })` |
| **Dismiss** | Always | `b.remove()` |

This covers auth failures fully. "Open popup" maps to Rule 45's "Reconnect" intent for the auth path.

### Orphaned-Extension Banner (`_gamShowExtOrphanedBanner`)

Two buttons: **Reload page** and **Dismiss**. Reload is the correct recovery — a page reload re-attaches the content script to the fresh extension context. This satisfies Rule 45 for the hard-orphan case.

### Gap — SW Restart Mid-Action (non-auth, non-orphan)

The `{ error: 'no response from background' }` path at L19683 has **no UI affordance**. Scenario: mod clicks "Ban" mid-session; the SW was terminated by Chrome's 5-minute idle eviction; the `rpcCall` returns `ok:false, error:'no response from background'`; the ban-modal error handler shows a generic error snack; there is no "Retry" or "Reconnect" button.

This is the missing Rule 45 affordance. The auth-fail banner covers auth-specific failures; the orphaned-extension banner covers reload-after-update; but transient SW cold-start failures (recoverable — no page reload needed, just retry the RPC) have no dedicated UX path.

### Proposed Thin Reconnect Snack

For `error:'no response from background'` returns, surface a non-blocking snack with an auto-retry option instead of a generic error:

```js
// In rpcCall(), replace the silent return at L19683:
if (!resp) {
  // SW may have restarted cold (5-min idle eviction). Offer one auto-retry
  // after a 1.5s warm-up delay before escalating to a UI prompt.
  try {
    await new Promise(r => setTimeout(r, 1500));
    const retry = await chrome.runtime.sendMessage({ type: 'rpc', name: name, args: args || {} });
    if (retry) return retry;
  } catch (_) {}
  // Auto-retry failed -- surface a reconnect snack with a manual retry button.
  try { _gamShowSwRestartSnack(name); } catch (_) {}
  return { ok: false, status: 0, code: 'SW_NO_RESPONSE', error: 'ModTools background restarted. Retrying...' };
}
```

`_gamShowSwRestartSnack(rpcName)` (proposed, ~30 lines):

- Fixed-bottom snack (distinct from the orphan banner — no "Reload" required)
- Text: "ModTools background restarted — click Retry to resume."
- **Retry button**: re-dispatches the original `rpcCall(rpcName, ...)` with the same args
- **Dismiss button**: removes snack, no retry
- Auto-dismiss after 12 seconds if no action taken
- Deduped by snack ID (`gam-sw-restart-snack`) so parallel failures don't stack

This is the only net-new UI proposed under Rule 45. Everything else is covered by existing affordances.

---

## Summary Table

| Rule | Status | Gap | Severity |
|---|---|---|---|
| 43 — Schema validation | NOT PRESENT | No field-level schema on any RPC; ad-hoc coercion only | Medium — malformed args silently coerced, not rejected |
| 44 — Disconnect handling | PARTIAL | Orphan-on-reload: covered. SW cold-start `no response`: silently dropped | Low — SW restart is rare, recovers on retry |
| 45 — Reconnect button | PARTIAL | Auth-fail: 3 buttons including effective "Reconnect". Orphan: "Reload" present. SW restart: no affordance | Medium — transient mid-action failures leave mod with generic error and no path forward |

**Implementation priority:** Rule 43 schema layer is the cleanest win — ~100 lines added to background.js, zero behavioral change for well-formed calls, immediate structured errors for malformed args. Rule 45 SW-restart snack is the most visible UX gap for mods mid-action.
