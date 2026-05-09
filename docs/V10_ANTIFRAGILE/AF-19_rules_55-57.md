# AF-19: Anti-Fragile Rules 55-57 Audit
**GAW ModTools v10.5.1 — AUDIT-ONLY**
**Date:** 2026-05-09

---

## Rule 55 — Bug Report Payload Completeness

### Current payload (modtools.js ~L1137)

```
description        -- user text
include_snapshot   -- consent checkbox state
gaw_user           -- me()
page_url           -- scrubbed via scrubUrlForTelemetry or _bugReportScrubUrl
version            -- VERSION constant ("v10.5.1")
browser            -- navigator.userAgent
recent_actions     -- last 50 mod-log entries (token fields stripped) IF include_snapshot
settings_redacted  -- _scrubSecrets(_allSettings()) IF include_snapshot
timestamp_ms       -- Date.now()
```

The SW relay (background.js `modBugReport` handler, ~L1992) then forwards:
```
title, description, debugSnapshot (capped at 16KB), mod, payload
```

### Gap analysis

**gam_diag_log — MISSING from bug report payload.**
The `diagLog` field exists in the debug snapshot returned by `getDebugSnapshot` (modtools.js ~L981), which IS attached when the user submits via the second code path (the alternate `reportBug` function at ~L20627 that calls `rpcCall('modBugReport', { ..., debugSnapshot: snap, ... })`). However, the primary code path — the modal form at ~L1137 that sends via `rpcCall('modBugReport', payload)` — does NOT call `getDebugSnapshot` and does NOT include `diagLog`. The two code paths exist in parallel and are not equivalent.

**last 5 actions — INSUFFICIENT slice.**
The modal sends `rawLog.slice(-50)`, then gates it behind `include_snapshot`. The spec says 5; code sends 50 with consent, 0 without. This is actually an improvement over spec, but the inconsistency with the snapshot path (which strips to 3 and redacts user fields entirely, ~L20606) means the two submission paths produce differently shaped payloads.

**installType — NOT present.**
The report payload has no indicator of whether the reporter is running a development (`installType: 'development'`) or CWS (`installType: 'normal'`) install. A dev-mode bug reproduced against an unpacked extension may not reproduce on CWS. Triage blind spot.

**Proposed payload additions (modal path, ~L1137):**

```js
// 1. Pull diag_log from storage synchronously at submit time
const diagLogRaw = await new Promise(res => {
  try { chrome.storage.local.get('gam_diag_log', r => res(r.gam_diag_log || [])); }
  catch(_) { res([]); }
});
const diagLog = diagLogRaw.slice(-100); // last 100 entries; ~16KB at typical entry size

// 2. installType from the boot-cached value (see Rule 57 section)
// const installType = _gamInstallType; // 'development' | 'normal' | 'unknown'

const payload = {
  // ... existing fields ...
  gam_diag_log:  snapCb.checked ? diagLog : [],
  install_type:  _gamInstallType,          // Rule 57
  ext_id:        chrome.runtime.id,        // useful for CWS lookup
};
```

**SW relay gap:** the `modBugReport` SW handler only forwards `title`, `description`, `debugSnapshot`, `mod`, `payload`. The new fields need to land in the `payload` object or the handler needs an explicit passthrough. Recommend putting them in `payload` (no SW change needed).

---

## Rule 56 — Silent Error Swallow Audit

All `.catch(()=>{})` and `catch(_){}` occurrences in modtools.js:

### Category A — Legitimate (privacy boundary / fire-and-forget telemetry)

| Line | Pattern | Verdict |
|------|---------|---------|
| 543 | `rpcCall('modMailLog', ...).catch(() => {})` | **Legitimate.** Modmail tracking is fire-and-forget; a failure to log must not surface to the mod or break the actual reply flow. Comment already says "fire-and-forget". |
| 6924 | `rpcCall('modProfilesWrite', ...).catch(()=>{})` | **Legitimate.** Cloud profile push is advisory; local state is the source of truth. Pattern-sync push (separate path at ~L6982) already has explicit error handling + snack. |
| 7661 | `navigator.clipboard.writeText(...).catch(()=>{})` | **Legitimate.** Clipboard write failure on AI copy button is a UX nicety; the text is still in the textarea. Cannot diagnose further without user gesture context. |
| 10687 | `fetchProfileIntel(u).catch(()=>{})` | **Legitimate.** Tooltip intel fetch failure means no extra data shown; tooltip still renders. Logging this would pollute diag with every failed hover on un-indexed users. |
| 11376–77 | `runInboxIntelPass().catch(()=>{})` (x2, timer) | **Borderline.** Timer-driven; a hard failure here could mean the poller silently dies. Recommend at minimum a counter + diag entry on repeated failure (see below). |
| 20188 | `rpcCall('modPresencePing', ...).catch(()=>{})` | **Legitimate.** Presence ping is advisory; failure must not interrupt the mod's workflow. |

### Category B — Remediable (information lost, diagnostics harmed)

| Line | Pattern | Current | Proposed |
|------|---------|---------|---------|
| 1616 | `_authBackupPut(key, value).catch(()=>{})` inside token save path | IDB backup failure silently swallowed inside an already-try-caught block | `_authBackupPut(key, value).catch(e => _diagLog('auth-backup', 'IDB backup write failed', { key, err: String(e) }));` |
| 1636 | `.catch(() => {})` on non-token `setSetting` chrome.storage write | Storage failure for non-token keys goes completely unlogged | `catch(e => _diagLog('settings-write', 'chrome.storage write failed for non-token key', { key, err: String(e) }))` |
| 4491 | `rpcCall('modAuditLog', ...).catch(()=>{})` inside `_flushDeathRowAudit` | Audit flush failure swallowed; D1 audit chain breaks silently | `catch(e => { _diagLog('audit-flush', 'modAuditLog flush FAILED', { err: String(e) }); try { snack('⚠ Audit log flush failed', 'warn'); } catch(_){} })` |
| 15632 | `rpcCall('modMailLog', ...).catch(() => {})` (modmail panel AI reply path) | Same class as line 543 but in a different flow; worth at least a diag entry | `catch(e => _diagLog('modmail-log', 'AI reply tracking failed', { err: String(e) }))` |
| 15640 | `.catch(() => {})` — context from line 15631: modmail log on Open thread path | Same | `catch(e => _diagLog('modmail-log', 'thread-open tracking failed', { err: String(e) }))` |
| 15815 | `.catch(() => {})` — modmail panel list path (line context: ~L15808) | Same | `catch(e => _diagLog('modmail-log', 'list tracking failed', { err: String(e) }))` |
| 20079 | `.catch(()=>{})` — pending invite backup to chrome.storage.local | Invite loss on extension reload if backup silently fails | `catch(e => _diagLog('invite-backup', 'backup-stage local write failed', { err: String(e) }))` |

### Inbox intel poller — special case (lines 11376-77)

Two timer-driven calls. A pattern like this would catch silent poller death:

```js
let _inboxIntelFailCount = 0;
const _runAndTrack = () =>
  runInboxIntelPass().catch(e => {
    _inboxIntelFailCount++;
    if (_inboxIntelFailCount >= 3) {
      _diagLog('inbox-intel', 'poller failed ' + _inboxIntelFailCount + 'x consecutively', { err: String(e) });
      _inboxIntelFailCount = 0; // reset after log to avoid log spam
    }
  });
setTimeout(_runAndTrack, 4000);
_inboxPollTimer = setInterval(_runAndTrack, Math.max(60 * 1000, interval));
```

### Empty-body catch blocks (modtools.js catch(_){} pattern)

There are ~40 occurrences of `catch(_){}` and `catch(e){}` with empty or near-empty bodies. Most are defensive guards around non-critical DOM calls (`_diagLog` itself, `snack`, `focus`). These are acceptable because:
- They wrap calls that cannot throw in ways worth surfacing.
- The try-wrapping pattern prevents a failing diagnostic call from breaking the feature that triggered it.

The one exception is ~L545: `catch (_) { /* never block the caller */ }` which wraps the entire modmail-logging block in `modPost`. This is intentional (caller-safety), but the comment is the only documentation of intent. Recommend adding a `_diagLog` inside: `_diagLog('modpost-mail-log', 'mail-log block threw', { err: String(_) })`.

---

## Rule 57 — chrome.management.getSelf() for Dev vs Production Gating

### Current state

`chrome.management.getSelf()` is **not called anywhere** in the codebase (`grep` of all three JS files returns zero matches). There is no `installType` detection. The extension has no mechanism to distinguish a developer's unpacked sideload from a CWS user's install at runtime.

### Impact

- `console.warn` calls (there are 136 total across modtools.js) fire for all users in production. CWS users who open DevTools see noise that was intended for debugging.
- Bug reports have no `install_type` field, so Commander cannot tell whether a report came from a dev sideload or a real CWS user.
- No dev-only safeguards (e.g., verbose logging, feature-flag overrides) are possible without this signal.

### Proposed implementation

**Boot-time cache in background.js** (one call, result held in SW RAM):

```js
// background.js — near top, after manifest constants
let _gamInstallType = 'unknown'; // 'development' | 'normal' | 'unknown'
(async () => {
  try {
    const self = await chrome.management.getSelf();
    _gamInstallType = self.installType; // 'development' or 'normal'
  } catch (e) {
    // chrome.management not available (e.g. MV2 content script context)
    _gamInstallType = 'unknown';
  }
})();
```

**Expose via RPC** so content scripts and popup can query it:

```js
// background.js RPC handler (add to the RPC table)
gamInstallType: {
  allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
  async handler() { return { ok: true, data: { installType: _gamInstallType } }; }
},
```

**Content script — lazy init on first use** (modtools.js):

```js
// Near _diagLog definition
let _gamInstallType = null;
async function _getInstallType() {
  if (_gamInstallType !== null) return _gamInstallType;
  try {
    const r = await rpcCall('gamInstallType', {});
    _gamInstallType = (r && r.data && r.data.installType) || 'unknown';
  } catch (_) { _gamInstallType = 'unknown'; }
  return _gamInstallType;
}
```

**Dev-only console.warn gating pattern:**

```js
// Replace bare console.warn('[ModTools ...]', e) calls with:
if (await _getInstallType() === 'development') {
  console.warn('[ModTools ...]', e);
}
// OR for synchronous contexts (where the cached value is already set):
if (_gamInstallType === 'development') {
  console.warn('[ModTools ...]', e);
}
```

This is not a bulk-replace task — the 136 `console.warn` calls need case-by-case review. Priority candidates are the verbose diagnostic warns that fire on every page load (auth token hydration, storage reads, sticky instrumentation). Production-facing errors that the mod should see (auth failure, RPC hard error) should remain unconditional.

**Dev-only `_diagLog` verbosity** — a separate flag `_diagVerbose` (set true when `installType === 'development'`) can gate stack-trace capture in `_diagLog` to dev builds only, since the current code always captures stacks for `sticky`, `auth-modal`, and `modPost` categories regardless of environment.

---

## Summary Table

| Rule | Finding | Priority |
|------|---------|---------|
| 55 | `gam_diag_log` missing from modal-path bug report payload | High |
| 55 | `install_type` missing from all bug report paths | Medium |
| 55 | Two parallel `reportBug` code paths produce inconsistent payload shapes | Medium |
| 56 | Lines 1616, 1636, 4491: remediable swallows in auth/storage/audit paths | High |
| 56 | Lines 15632, 15640, 15815, 20079: remediable swallows in modmail/invite | Low |
| 56 | Inbox intel poller (11376-77): needs consecutive-failure counter | Medium |
| 57 | `chrome.management.getSelf()` not called anywhere; no dev/prod gate | High |
| 57 | 136 `console.warn` calls unconditionally visible in production | Medium |
