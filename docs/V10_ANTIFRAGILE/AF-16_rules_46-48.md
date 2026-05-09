# AF-16: Anti-Fragile Audit — Rules 46-48

**Scope:** `modtools.js`, `popup.js`, `background.js` (dist)
**Mode:** AUDIT-ONLY — no code changes
**Version audited:** v10.5.1
**Date:** 2026-05-09

---

## Rule 46 — Async/Await try/catch Coverage

### Methodology

Sampled all `await` call-sites in the three files. The overwhelming majority
are well-covered — the core fetch primitives (`modPost`, `modGet`,
`apiUserAboutJson`, `apiUserCommentsJson`, etc.) wrap every await in
try/catch with `return null` fallback. `background.js` is clean throughout
— every await at the service-worker level is inside try/catch or explicitly
fire-and-forget with a caught sentinel.

The following are **P0/P1 violations only** — sites where a throw propagates
to the caller unhandled and will produce an unhandled-promise-rejection
that kills the in-progress mod action silently.

---

### P0 Violations

#### V46-P0-1 — `apiSendModMessage` (modtools.js ~L528)

```js
const apiSendModMessage = async (u, subject, message, opts) => {
    const r = await modPost('/submit_modmessage', { ... });  // NO try/catch
    try {
        if (r && r.ok) { rpcCall('modmailTrackResponse', ...); }
    } catch (_) {}
    ...
};
```

`modPost` can throw on network failure (AbortController timeout, fetch
reject). The outer `await modPost(...)` is not inside a try/catch. If it
throws, the entire send is silently swallowed as an unhandled rejection —
the caller (send-modmail handler) sees no error, shows no toast, and the
mod thinks the message was sent when it wasn't. This is a data-integrity
violation, not just a UX gap.

**Impact:** Silent failure on mod message send. P0.

---

#### V46-P0-2 — `executeBan` / `executeUnban` (modtools.js ~L6709-L6715)

```js
async function executeBan(username, reason, days){
    const r = await apiBan(username, days||0, reason||getUsersBanReason());
    return r.ok;  // NO try/catch
}
async function executeUnban(username){
    const r = await apiUnban(username);
    return r.ok;  // NO try/catch
}
```

Both functions await `modPost` derivatives with no try/catch. These are the
terminal execution functions for ban/unban — the highest-stakes mod actions
in the system. A network error throws unhandled, the promise rejects, and
callers that don't themselves try/catch (see V46-P1-1 below) will silently
fail.

**Impact:** Silent ban/unban failure, potential phantom bans (state diverges
between local roster and server). P0.

---

### P1 Violations

#### V46-P1-1 — Unban undo-toast handler (modtools.js ~L6285-L6295)

```js
wrap.querySelector('button').addEventListener('click', async () => {
    cleanup();
    snack(`Unbanning ${username}...`, 'info');
    const r = await apiUnban(username);   // NO try/catch
    if (r.ok) { ... snack(`${username} unbanned`, 'success'); }
    else       { snack(`Undo failed (${r.status})`, 'error'); }
});
```

`apiUnban` → `modPost` can throw. No try/catch here. If it does, the
unhandled rejection is invisible to the user — the "Unbanning..." snack
stays visible with no resolution. The `r.ok`/`r.status` branch is never
reached; the error toast on L6294 never fires.

**Impact:** User sees "Unbanning…" and nothing else. P1.

---

#### V46-P1-2 — `__v80ParkCreate` / `__v80ParkList` / `__v80ParkResolve` (modtools.js ~L3010-L3051)

All three Park functions await `rpcCall(...)` with no try/catch:

```js
async function __v80ParkCreate(kind, subjectId, note){
    const r = await rpcCall('modParkedCreate', { ... });  // NO try/catch
    ...
}
async function __v80ParkList(statusFilter){
    return await rpcCall('modParkedList', { ... });  // NO try/catch
}
async function __v80ParkResolve(id, action, reason){
    const r = await rpcCall('modParkedResolve', { ... });  // NO try/catch
    ...
}
```

The call-site for `__v80ParkCreate` IS wrapped (L3323 has try/catch in the
modal submit handler), so the blast radius is limited for create. But `__v80ParkList`
and `__v80ParkResolve` are exposed on `window.__v80.park.*` and called
elsewhere without a guaranteed outer catch.

**Impact:** Park queue UI failures, unresolved rejections from the
shadow-queue panel. P1.

---

#### V46-P1-3 — `syncSecretsToBackgroundVault` inner await (modtools.js ~L1515-L1523)

```js
await chrome.runtime.sendMessage({
    type: 'setTokens', workerModToken: ..., leadModToken: ...
});
```

This is inside `preloadSecrets` which is wrapped, but `syncSecretsToBackgroundVault`
itself calls this `await` inside a function that is NOT consistently wrapped
by callers. On extension context invalidation (SW restart), this throws
`"Receiving end does not exist"` — which `snack()` already handles as an
orphan-banner redirect, but only if the throw is caught. Without the catch
it propagates as an unhandled rejection.

**Impact:** Token sync failures surface as console noise, not user feedback. P1.

---

## Rule 47 — `alert()` Violations

Found **7 `alert()` calls** across `popup.js` and `modtools.js`. Every one
is a P1+ — `alert()` blocks the browser thread, looks unprofessional, and
freezes the GAW page behind it.

### popup.js (5 violations)

| Line | Call | Context |
|------|------|---------|
| 453 | `alert('Export failed: ' + err.message)` | JSON export catch block |
| 490 | `alert('ModTools data cleared. Reload any GAW tabs...')` | Clear-data success |
| 493 | `alert('Clear failed: ' + err.message)` | Clear-data catch block |
| 543 | `alert('Debug snapshot failed: ' + err.message)` | Debug snapshot catch |
| 2092 | `alert('Dashboard load failed. Need open GAW tab + mod token.')` | Dashboard open failure |
| 2098 | `alert('Dashboard failed: ' + e.message)` | Dashboard open catch |

### modtools.js (2 violations)

| Line | Call | Context | Notes |
|------|------|---------|-------|
| ~19931 | `alert('GAW ModTools detected an invite code...')` | Invite-URL handler, user not logged in | Intentional — comment says "snack not visible yet on first load" |
| ~20554 | `alert('Bug reporting is disabled...')` | `reportBug()` gate | Blocks thread unnecessarily |

### Proposed replacements

All popup.js alerts replace cleanly with a `showPopupBanner(msg, severity)`
helper (non-blocking, auto-dismisses at 5s, appended to popup DOM):

- Export/snapshot failures → `showPopupBanner('Export failed: ' + err.message, 'error')`
- Clear success → `showPopupBanner('Data cleared — reload any GAW tabs', 'success')`
- Dashboard failures → `showPopupBanner('Dashboard failed: ' + e.message, 'error')`

The `~L19931` modtools.js alert is the one legitimate edge case — snack bar
may not be mounted yet during first-load invite detection. Replace with a
deferred snack: `setTimeout(() => snack('...', 'warn'), 800)`. The 800ms
delay is enough for init() to complete.

The `~L20554` bug-report gate → `snack('Bug reporting is disabled...', 'warn', 6000)`.

---

## Rule 48 — Retry/Ignore on Recoverable Errors

### Current snack() signature

```js
function snack(msg, type='info') { ... }
```

No actions. Toasts are display-only. The user has no way to retry a failed
network call without re-triggering the entire flow manually.

### Top 8 high-impact error paths lacking retry/ignore

| # | Location | Error snack today | Missing action | Recovery fn |
|---|----------|-------------------|----------------|-------------|
| 1 | `executeBan` failure path | Silent (no snack at all — P0 above) | Retry | Re-call `executeBan(username, reason, days)` |
| 2 | Unban undo-toast catch | `snack('Undo failed (${r.status})', 'error')` | Retry, Ignore | Re-call `apiUnban(username)` |
| 3 | Mod message send (`apiSendModMessage`) | Silent (P0 above) | Retry | Re-call with original args |
| 4 | Bug report submit (L1159) | `snack('Bug report failed: ' + msg, 'error')` | Retry | Re-call `rpcCall('modBugReport', payload)` |
| 5 | Precedent mark failed (L5316) | `snack('Mark failed: ...', 'error')` | Retry | Re-call the precedent write |
| 6 | Auto-DR rule sync failed (L6879) | `snack('Auto-DR rule sync failed...', 'warn')` | Retry, Dismiss | Re-call `_pushCloudProfiles()` |
| 7 | Death Row execution failed (L7102) | `snack('Death Row FAILED: ... -- will retry next visit', 'error')` | Retry now | Re-call the DR execution for that inmate |
| 8 | Park resolve failed (L3579) | `snack('Resolve failed: ...', 'error')` | Retry | Re-call `__v80ParkResolve(id, action, reason)` |

### Proposed `snackWithActions(msg, severity, actions)` API

```js
/**
 * @param {string} msg
 * @param {'info'|'warn'|'error'|'success'} severity
 * @param {Array<{label: string, fn: function}>} actions
 * @param {number} [duration=8000]  -- longer default so user can act
 */
function snackWithActions(msg, severity, actions, duration = 8000) {
    // 1. Build toast via existing showToast() infrastructure
    // 2. Append one <button> per action entry inside the toast element
    // 3. Each button calls action.fn() then dismisses the toast
    // 4. Falls back to plain snack() when actions array is empty/absent
    // 5. "Ignore" actions are just { label: 'Dismiss', fn: () => {} }
}
```

This requires only adding a `actions` parameter to the existing toast
construction in `showToast()` — the DOM is already a flexbox row, buttons
append cleanly. No new CSS layer needed. Estimated diff: ~40 lines inside
the v8.1 toast block.

**Implementation priority order:** items 1-3 are P0 (they currently show
no error at all). Items 4-8 are P1 (they show an error but give the user
no path forward without reloading or repeating the full action sequence).

---

## Summary

| Rule | Violations | Severity |
|------|-----------|----------|
| 46 (try/catch) | 5 sites | 2x P0, 3x P1 |
| 47 (alert) | 7 calls | All P1+; 1 with partial justification |
| 48 (retry/ignore) | 8 high-impact paths | 3x P0-adjacent, 5x P1 |

Highest combined-risk item: **`executeBan`/`executeUnban`** — P0 on Rule 46
(no try/catch), P0-adjacent on Rule 48 (no retry on failure), which means
a network hiccup during a ban silently fails and the mod has zero
indication the action didn't land.
