# AF-04: Anti-Fragile Suite — Rules 10, 11, 12

**Target files:** background.js, popup.js, modtools.js
**Worker:** out of scope
**Version:** 10.5.1 (no bump)
**Author:** AF-04 agent, 2026-05-09

---

## Scope

This document covers Rules 10–12 of the Anti-Fragile Suite:

- **Rule 10** — Exponential backoff with jitter on all retry paths
- **Rule 11** — Service Worker boot logging to a ring buffer in chrome.storage.local
- **Rule 12** — `chrome.runtime.lastError` checked in every callback-style Chrome API site

---

## Rule 10 — Exponential Backoff + Jitter

### Audit findings

Three categories of retry logic exist across the codebase:

**1. `_persistRotatedToken` in background.js (lines ~1038–1056 pre-patch)**
The original implementation used a `for` loop with `100 * attempt` delay — linear, not exponential:
```
// Exponential-ish backoff: 100ms, 200ms before attempt 3
await new Promise(function(res) { setTimeout(res, 100 * attempt); });
```
This produced delays of 100ms, 200ms, 300ms — linear growth. No jitter. This is the most critical retry path in the extension: a failed token persist after rotation leaves the mod locked out after the next SW eviction.

**2. SuperMod poller in modtools.js (lines ~22624–22696)**
The MasterHeartbeat-driven `__smDelaySec` backoff: `__smDelaySec = ok ? 15 : Math.min(120, __smDelaySec * 2)` — correct exponential doubling (15 → 30 → 60 → 120), capped at 120s. Already compliant.

**3. Scattered `/* retry next tick */` and `/* will retry next visit */` comments**
These are informal retry hints attached to non-critical UI paths (Death Row, profile river). They are not retry loops — they describe the natural next-poll cadence. No backoff is needed because the retry is not immediate: it fires on the next user scroll or next MH tick. Not in scope for mechanical patching.

### Changes made

**Added `withBackoff` helper (background.js, before `onInstalled`):**
```js
async function withBackoff(fn, opts) {
  const base = (opts && opts.base) || 100;
  const cap  = (opts && opts.cap)  || 8000;
  const max  = (opts && opts.maxAttempts) || 3;
  let lastErr;
  for (var attempt = 0; attempt < max; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt < max - 1) {
        const delay = Math.min(cap, base * Math.pow(2, attempt)) + Math.random() * base;
        await new Promise(function(res) { setTimeout(res, delay); });
      }
    }
  }
  throw lastErr;
}
```

Delay schedule with `base=100, cap=800, maxAttempts=3`:
- attempt 0 fails → wait 100ms * 2^0 + jitter(0–100ms) = 100–200ms
- attempt 1 fails → wait 100ms * 2^1 + jitter(0–100ms) = 200–300ms
- attempt 2 fails → throw

The jitter term (`Math.random() * base`) prevents thundering-herd if multiple SW instances ever compete for storage (unlikely but possible during extension update races).

**Refactored `_persistRotatedToken` to use `withBackoff`:**
The retry body (get/merge/set/verify) now runs inside the `fn` callback. A verify mismatch throws `Error('verify mismatch on attempt N')`, which `withBackoff` catches and retries. The `saved` / `lastError` contract to callers is preserved exactly — callers (`authRotateSelf`, `authClaimInvite`) see no change.

---

## Rule 11 — SW Boot Logging

### Audit findings

Prior to this patch, SW boot events were logged only to `console.log('[ModTools] Installed:', details.reason)` inside `onInstalled`. The `onStartup` listener had no boot logging at all. There was no persistent ring buffer, no version stamp, and no way for a post-mortem diagnostic to reconstruct the SW lifecycle (number of evictions, timing gaps between startups, version mismatches between install and runtime).

### Changes made

**Added `_recordSwBoot(reason)` (background.js, before `onInstalled`):**
```js
async function _recordSwBoot(reason) {
  try {
    const ver = chrome.runtime.getManifest().version;
    const entry = { v: ver, ts: new Date().toISOString(), reason: reason || 'unknown' };
    const raw = await chrome.storage.local.get('gam_sw_boots');
    const boots = (raw && Array.isArray(raw.gam_sw_boots)) ? raw.gam_sw_boots : [];
    boots.push(entry);
    if (boots.length > 50) boots.splice(0, boots.length - 50);
    await chrome.storage.local.set({ gam_sw_boots: boots });
    console.log('[modtools v' + ver + '] SW boot at ' + entry.ts + ' reason=' + reason);
  } catch (e) { /* non-fatal -- boot log is diagnostic only */ }
}
```

Design decisions:
- **Ring buffer cap: 50.** An entry is ~80 bytes (ISO ts + semver + reason). 50 entries = ~4KB, negligible against the 10MB chrome.storage.local quota.
- **`splice(0, n)` trim** removes oldest entries — the ring preserves the most recent 50 boots.
- **Key: `gam_sw_boots`** — follows the existing `gam_` prefix convention.
- **Non-fatal wrapper.** `_recordSwBoot` is called before the alarm setup block; a storage failure must not abort the SW bootstrap.
- **Console log format: `[modtools v<X>] SW boot at <ts> reason=<reason>`** — matches the directive exactly, and is machine-greppable.

**Wired at both boot points:**
- `onInstalled`: `await _recordSwBoot(details.reason || 'install')` — captures `install`, `update`, `chrome_update`
- `onStartup`: `await _recordSwBoot('startup')` — captures browser restarts and SW eviction/restart cycles

The `onStartup` call is at the very top of the listener, before the `try` block, so it fires even if alarm creation fails.

**Reading the log.** From any extension context or DevTools console:
```js
chrome.storage.local.get('gam_sw_boots', r => console.log(JSON.stringify(r.gam_sw_boots, null, 2)));
```

---

## Rule 12 — `chrome.runtime.lastError` in Every Callback

### Audit findings

Chrome's callback-style APIs (as opposed to the Promise-based API) silently swallow errors unless the callback reads `chrome.runtime.lastError`. Unread `lastError` values produce the unchecked-error console warning and, in some Chrome versions, surfaced errors in the extensions management page.

In background.js, modtools.js, and popup.js, all `chrome.runtime.sendMessage`, `chrome.tabs.sendMessage`, and `chrome.cookies.*` calls use the `await` (Promise-based) form. Thrown exceptions — which is how the Promise API surfaces `lastError` — are caught by surrounding `try/catch` blocks. These sites are compliant without explicit `lastError` checks.

The gap was specifically in the **callback-style** `chrome.alarms.get` calls inside `onStartup`. There were 7 such callbacks, none checking `lastError`:

```js
chrome.alarms.get(ALARM_NAME, (a) => {
  if (!a) chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN });
});
```

If the alarms API threw an error (extension context destroyed, permissions changed, unusual Chrome shutdown path), the callback would receive `undefined` for `a`, create an alarm under the error condition, and the `lastError` would be silently ignored — leaving an unchecked-error annotation in DevTools.

### Changes made

All 7 `chrome.alarms.get` callbacks in `onStartup` now check `lastError` as the first statement and return early on error:

```js
chrome.alarms.get(ALARM_NAME, (a) => {
  if (chrome.runtime.lastError) {
    console.warn('[ModTools] alarms.get ALARM_NAME:', chrome.runtime.lastError.message);
    return;
  }
  if (!a) chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN });
});
```

Alarms covered:
- `ALARM_NAME` (update check, 30min)
- `BUG_POLL_ALARM` (badge poll, 5min)
- `MAINT_QUOTA_ALARM` (quota check, 6h)
- `MAINT_TOKEN_AGE_ALARM` (token age, 24h)
- `MAINT_DIAG_ROTATE_ALARM` (diag rotate, 24h)
- `MAINT_INTEL_EVICT_ALARM` (intel evict, 30min)
- `MAINT_WEEKLY_ALARM` (weekly run, 7d)

The `onInstalled` block uses `chrome.alarms.create` directly inside a `try/catch` — that catch already handles any lastError equivalently, so no change needed there.

**popup.js and modtools.js:** No callback-style Chrome API calls exist in these files. All `sendMessage`, `tabs.sendMessage`, `cookies.getAll`, `cookies.remove`, and `tabs.query` calls are Promise-based (`await`), wrapped in `try/catch`. Compliant as-is.

---

## Summary of Changes

| File | Change | Lines affected |
|---|---|---|
| background.js | Added `_recordSwBoot()` ring-buffer function | ~15 lines inserted before `onInstalled` |
| background.js | Added `withBackoff()` helper | ~18 lines inserted before `onInstalled` |
| background.js | `onInstalled`: added `await _recordSwBoot(...)` call | 1 line |
| background.js | `onStartup`: added `await _recordSwBoot('startup')` call | 1 line |
| background.js | `onStartup`: 7 `alarms.get` callbacks now check `lastError` | 7 lines added |
| background.js | `_persistRotatedToken`: linear retry refactored to `withBackoff` | ~10 lines changed |
| popup.js | No changes required | — |
| modtools.js | No changes required | — |

---

## Compliance Matrix

| Rule | Status | Notes |
|---|---|---|
| R10: exp backoff + jitter on retry paths | PASS | `_persistRotatedToken` now uses `withBackoff`; SuperMod poller was already compliant |
| R11: SW boot log to `gam_sw_boots` ring buffer | PASS | Both `onInstalled` and `onStartup` write versioned entries; cap 50 |
| R12: `lastError` in every callback site | PASS | All 7 `alarms.get` callbacks patched; all `sendMessage`/`cookies`/`tabs` sites use await+try/catch |

---

## Risk Assessment

**Low.** All three changes are additive or tighten existing error handling:
- `withBackoff` is a pure function; `_persistRotatedToken`'s external contract (returns `{ saved, lastError }`) is unchanged.
- `_recordSwBoot` is wrapped in its own try/catch and is non-fatal by design.
- `lastError` checks are early-returns that prevent acting on error state — they do not change behavior in the happy path.

No functional behavior changes to mod-facing features. No schema changes. No version bump required.
