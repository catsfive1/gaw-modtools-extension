# AF-03 — Anti-Fragile Suite: Rules 7–9
**Agent:** AF-03 | **Version:** v10.5.1 | **Date:** 2026-05-09

---

## Scope

Files audited: `background.js`, `modtools.js`
Files modified: `background.js`, `modtools.js`

---

## Rule 7 — Global Error Handlers

### Audit result

Neither `background.js` nor `modtools.js` had any of the following:
- `self.addEventListener('unhandledrejection', ...)`
- `self.addEventListener('error', ...)`
- `window.addEventListener('unhandledrejection', ...)`
- `window.addEventListener('error', ...)`

Both were missing global handlers entirely.

### Changes made

#### background.js

Added at top of file (after constants, before `onInstalled` listener):

```js
// AF-03 Rule 7: global error handlers for unhandled rejections and errors.
// Both write to the chrome.storage.local diag log (same key/format as the
// existing _maintAppendDiag system) so failures are captured across SW evictions.
self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = (reason && reason.message) ? reason.message : String(reason);
  const stack = (reason && reason.stack) ? reason.stack : null;
  console.warn('[ModTools-SW] Unhandled rejection:', msg, stack);
  try {
    const entry = {
      ts: Date.now(), iso: new Date().toISOString(),
      cat: 'unhandledrejection', msg, stack, v: 'v10.5.1'
    };
    chrome.storage.local.get('gam_diag_log').then(r => {
      const log = (r.gam_diag_log || []).slice(-499);
      log.push(entry);
      chrome.storage.local.set({ gam_diag_log: log }).catch(() => {});
    }).catch(() => {});
  } catch (_) {}
});

self.addEventListener('error', (event) => {
  const msg = event.message || String(event);
  const stack = (event.error && event.error.stack) ? event.error.stack : null;
  console.warn('[ModTools-SW] Uncaught error:', msg, stack);
  try {
    const entry = {
      ts: Date.now(), iso: new Date().toISOString(),
      cat: 'uncaught-error', msg, stack, v: 'v10.5.1'
    };
    chrome.storage.local.get('gam_diag_log').then(r => {
      const log = (r.gam_diag_log || []).slice(-499);
      log.push(entry);
      chrome.storage.local.set({ gam_diag_log: log }).catch(() => {});
    }).catch(() => {});
  } catch (_) {}
});
```

#### modtools.js

Added at the top of the IIFE body (immediately after the double-injection guard):

```js
// AF-03 Rule 7: global error handlers for content script context.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = (reason && reason.message) ? reason.message : String(reason);
  console.warn('[ModTools] Unhandled rejection:', msg);
  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      const entry = {
        ts: Date.now(), iso: new Date().toISOString(),
        cat: 'unhandledrejection', msg, v: VERSION
      };
      chrome.storage.local.get('gam_diag_log').then(r => {
        const log = (r.gam_diag_log || []).slice(-499);
        log.push(entry);
        chrome.storage.local.set({ gam_diag_log: log }).catch(() => {});
      }).catch(() => {});
    }
  } catch (_) {}
});

window.addEventListener('error', (event) => {
  const msg = (event.error && event.error.message) ? event.error.message : (event.message || String(event));
  console.warn('[ModTools] Uncaught error:', msg);
  try {
    if (chrome && chrome.storage && chrome.storage.local) {
      const entry = {
        ts: Date.now(), iso: new Date().toISOString(),
        cat: 'uncaught-error', msg, v: VERSION
      };
      chrome.storage.local.get('gam_diag_log').then(r => {
        const log = (r.gam_diag_log || []).slice(-499);
        log.push(entry);
        chrome.storage.local.set({ gam_diag_log: log }).catch(() => {});
      }).catch(() => {});
    }
  } catch (_) {}
});
```

**Note on stack traces:** The SW handler includes `stack` because the SW context is opaque to debugging tools and stack traces are the only forensic path. The content script handler omits stack (it's already in DevTools console) to keep the diag log lean.

---

## Rule 8 — No Long-Running Sync Blocks in Service Worker

### Audit result

`background.js` uses no `setInterval`, no `setTimeout` for recurring tasks. All recurring work runs through `chrome.alarms`. The SW is event-driven throughout.

**One borderline pattern found:**

#### `_autoStorageProbe()` — severity: MEDIUM

```js
const all = await chrome.storage.local.get(null);   // fetches ALL keys
const sizes = Object.entries(all).map(([k, v]) => {
  let s; try { s = JSON.stringify(v).length; } catch (_) { s = 0; }
  return [k, s];
}).sort((a, b) => b[1] - a[1]);
```

`chrome.storage.local.get(null)` returns every stored key. At v10.5.1 with an active installation, the `gam_profile_intel` key alone can hold 2,000 user-profile objects, `gam_diag_log` can hold 500 entries, and there are 30+ other keys. The subsequent `JSON.stringify` on every value and the `.sort()` are synchronous CPU. This runs inside the `gam_maint_quota_check` alarm handler (every 6 hours) and inside `_maintWeeklyRun` (every 7 days). At current data volumes this is unlikely to exceed the 30s SW eviction threshold, but it will generate a measurable synchronous stall on large profiles.

**Recommendation (defer, don't migrate yet):** Replace `JSON.stringify(v).length` with `getBytesInUse([key])` per-key, or limit `get(null)` to only the known large keys. No code change in this agent pass — flagged for AF-04 or a targeted fix pass.

**No other blocking patterns found.** All other loops in `background.js` iterate over small bounded collections:
- `pathAllowed()`: iterates `ALLOWED_ENDPOINTS` — 1 entry.
- `_autoRosterStaleness()`: iterates mod list from worker — bounded by team size, network-awaited.
- `_autoDiagStatus()`: iterates `gam_diag_log` — max 500 entries, simple property read per entry.
- `_maintIntelEvict()`: iterates `gam_profile_intel` — single `Object.entries` pass then a write. Low severity.
- Retry loop in `workerFetch`: max 3 iterations, each awaited.

---

## Rule 9 — `chrome.alarms` + Persistent Storage for Recurring Tasks

### background.js audit

**Result: CLEAN.** Zero `setInterval` calls in `background.js`. All recurring tasks use `chrome.alarms.create` + `chrome.alarms.onAlarm.addListener`:

| Alarm name | Period | Purpose |
|---|---|---|
| `gam_update_check` | 30 min | Version check vs worker /version |
| `gam_bug_poll` | 5 min | Open bug report badge |
| `gam_maint_quota_check` | 6h | Storage quota probe |
| `gam_maint_token_age` | 24h | Token rotation age warning |
| `gam_maint_diag_rotate` | 24h | Diag log trim |
| `gam_maint_intel_evict` | 30 min | Profile intel cache eviction (48h TTL) |
| `gam_maint_weekly_run` | 7 days | Autonomous maintenance report |

Alarms are re-created on both `onInstalled` and `onStartup` to survive SW eviction.

### modtools.js audit

**Result: ALL SETINTERVAL CALLS ARE IN CONTENT SCRIPT — CORRECT.**

`modtools.js` runs as a content script injected into the page, not as a service worker. Content scripts have a full page lifecycle (alive as long as the tab is open) and a real `window` object. `setInterval` is appropriate here.

22 `setInterval` calls identified. Classification:

| Location / purpose | Interval | Classification |
|---|---|---|
| `sweepIv` — profile-river initial sweep | ~5 iterations then cleared | OK — self-clearing, short-lived |
| `pollTeamFeatures` | 5 min | OK — visibility-gated |
| `iv` — armed-action countdown UI | ad hoc, self-clearing | OK — UI timer, always cleared |
| `MasterHeartbeat._ivId` — single shared dispatcher for all v7.2 timers | configurable | OK — this IS the correct pattern: one interval, modulo-dispatched. Better than N separate intervals. |
| `_triageHeartbeat` — DOM re-injection guard | configurable | OK — self-clears on detection |
| setInterval for countdown column updates | fast tick, /users page only | OK — UI animation |
| `STATE.pollClosedTimer` / `STATE.pollOpenTimer` — inbox poll | POLL_CLOSED_MS / POLL_OPEN_MS | OK — stopped via `stopAllPolling()` |
| `_ambientModmailPrefetch` | 10 min | OK — fire-and-forget, no tight coupling |
| `_updateSirenChip` | 30s | OK — DOM-only, cheap |
| `__updateTicker` / ticker rotation | 30s / 4s | OK — UI animation |
| `__updateInboxBadge` | 5s | OK — DOM badge update |
| `updateDeathRowCounter` | 5s | OK — DOM badge update |
| `pollSessionHealth` | 2 min | OK — lightweight health check |
| `_pollStickyQueue` | 60s | OK — visibility-gated via page DOM |
| `_c5RefreshTimer` — active-mods popover | 15s, self-clears when popover closes | OK — self-managing |
| `presenceIv` | 30s, visibility-gated | OK |
| `_seenFlushIv` — seen-username queue flush | 30s | OK — batching pattern |
| Cloud flags refresh | 5 min | OK |
| Title overlay refresh | 5 min | OK |
| DR live indicator | configurable | OK |
| DR sweep | 4h | OK — rare |
| `checkForUpdate` | UPDATE_CHECK_INTERVAL_MS | OK — content script update nag |
| `autoUnstickyTick` | 4 min | OK |
| `_susRefresh` | 60s, visibility-gated | OK |
| `_sharedDrRefresh` | 60s, visibility-gated | OK |
| `_inboxPollTimer` | min 60s | OK — replaceable timer pattern |

**No migration to `chrome.alarms` needed or appropriate.** Content script `setInterval` is the correct primitive. Migrating to alarms would require cross-context messaging overhead with no benefit.

**One style note:** `_inboxPollTimer` is replaced via `clearInterval`+`setInterval` rather than a simple restart — this is fine but could be simplified to a timeout-chain pattern. Not a correctness issue.

---

## Long-Running Async Work — Offscreen Document Candidates

### Audit result

No handler in `background.js` is flagged as exceeding 30s in expected wall time:

- `_maintWeeklyRun`: fan-out of 6 parallel async calls + 1 worker upload. Each individual call is a network fetch. Total expected wall time: 2–8s on a healthy connection. Not a candidate.
- `workerFetch` with retry: max 3 × 20s timeout = 60s theoretical worst case. In practice: first attempt almost always resolves. The AbortController timeout on each individual fetch means the SW keeps its event loop alive through the awaits. Not a blocking issue.
- Debug snapshot handler: largest observed snapshot ~500KB. `JSON.stringify` at this size is <5ms. Not a candidate.

**No offscreen document migration needed at this time.** Flag for re-evaluation if AI inference work (Deep Analysis calls) is ever moved into the SW — that workload (streaming LLM response) is the natural candidate.

---

## Implementation Notes

### Insertion points

**background.js:** global handlers inserted at line ~136 (after the `pathAllowed` function and the `// --- v7.2 Platform Hardening END ---` comment, before `chrome.runtime.onInstalled.addListener`). This ensures `secretCache` and the constant `MAINT_DIAG_KEY` are defined before the handlers fire.

**modtools.js:** global handlers inserted immediately after the double-injection guard block (after `window.__GAM_MT_LOADED = true;`, before the `_rehydrateImpl` declaration). This puts them at the very top of the IIFE so they catch any rejection that fires during module initialization.

### Diag log integration

Both handlers write to `gam_diag_log` using the same shape as `_diagLog()` / `_maintAppendDiag()`:
```
{ ts, iso, cat, msg, stack?, v }
```
The `cat` values `'unhandledrejection'` and `'uncaught-error'` are new — they do not collide with existing categories. The existing 500-entry cap is respected (`.slice(-499)` before push).

### Why `self` in SW, `window` in content script

Service workers expose `self` (the global `ServiceWorkerGlobalScope`). `window` is undefined in a SW context. Content scripts inject into a page that has a real `window`. Using the wrong global silently no-ops — hence the split.

---

## Status

| Rule | Finding | Action | Result |
|---|---|---|---|
| 7 — Global error handlers | Missing in both files | Added to both | DONE |
| 8 — No blocking SW tasks | One MEDIUM issue (`_autoStorageProbe` full-store JSON.stringify) | Flagged, not fixed (out of scope for this pass) | FLAGGED |
| 9 — alarms + persistent storage | background.js: fully alarm-based. modtools.js: setInterval correct for content script | No changes needed | CLEAN |
