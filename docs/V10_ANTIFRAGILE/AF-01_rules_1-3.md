# AF-01 -- Rules 1-3 Audit + Fix Report
## GAW ModTools v10.5.1 | Agent AF-01 | 2026-05-09

---

## A. Rules covered

**Rule 1.** Treat the service worker as ephemeral -- it can be terminated at any time.
**Rule 2.** Never rely on in-memory state surviving across events.
**Rule 3.** Use `chrome.storage.session` for short-lived state that must survive SW restarts.

---

## B. Violations found

| # | File:Line | Severity | Variable | Description | Disposition |
|---|-----------|----------|----------|-------------|-------------|
| 1 | background.js:250 | **P1** | `_UPDATE_FLAG_LAST_SET` | SW-RAM-only flag used by `verifyUpdateFlag` RPC. After SW termination, resets to `null`. Result: every `verifyUpdateFlag` call returns `ok:false` until the next 30-min alarm fires and re-sets the flag. Update banner disappears for up to 30 minutes on any SW restart. | **FIXED** -- restored from `chrome.storage.local` in `loadSecrets()` |
| 2 | background.js:253 | P2 | `_LAST_CLEAR_TOKENS_AT` | Rate-limit counter for the `clearTokens` RPC (10s debounce). Resets to 0 on SW termination. A SW restart resets the debounce, allowing one `clearTokens` to fire immediately after revival. Not exploitable in practice (attacker would also need to trigger the SW restart). | Deferred -- cosmetic security gap, not data loss or UX break |
| 3 | background.js:223 | OK | `_SNAPSHOT_CONSENT` | Nonce held in SW RAM by design (security boundary: content scripts must not be able to read it). 5s TTL means any in-flight consent minted before a SW termination is naturally expired. No storage mirror is correct here. | No action -- by design |
| 4 | background.js:1056 | OK | `setTimeout` (backoff sleep) | Single-shot delay inside `_persistRotatedToken` retry loop. Completes within the same SW activation. Not scheduling periodic work. | No action -- not a Rule 2 violation |
| 5 | background.js:1074,1154,1589 | OK | `setTimeout` (abort timers) | Fetch abort controllers. All fire within their enclosing async function, inside the same event. Not scheduling across SW lifetimes. | No action -- not a Rule 2 violation |
| 6 | background.js:84 | OK | `secretCache` | Critical token vault. Mirrored to `chrome.storage.session` on every write path (setTokens, authValidateToken, leadValidateToken, persistRotatedToken, storage.onChanged listener). `loadSecrets()` restores from session-first, local-fallback on both `onInstalled` and `onStartup`. | No action -- correctly handled |
| 7 | modtools.js:6568+ | OK | `_gamExtOrphaned` etc. | All `let _gam*` variables in modtools.js are declared inside the content-script IIFE. Content scripts are scoped to the tab lifetime, not the SW. Rules 1-3 apply to the SW only. `setInterval` calls in modtools.js are likewise content-script-scoped. | No action -- out of SW scope |

---

## C. Fixes applied (with diffs)

### Fix 1 -- background.js: Restore `_UPDATE_FLAG_LAST_SET` from durable storage on SW wake

**Location:** `loadSecrets()`, background.js lines 118-123 (before patch)

**Before:**
```js
    secretCache = {
      workerModToken: s.workerModToken || '',
      leadModToken: s.leadModToken || ''
    };
  } catch (e) { /* service-worker may have been evicted; cache stays empty */ }
}
```

**After:**
```js
    secretCache = {
      workerModToken: s.workerModToken || '',
      leadModToken: s.leadModToken || ''
    };
    // AF-01 P1 fix: restore _UPDATE_FLAG_LAST_SET from durable storage so the
    // update banner survives SW termination. Without this, verifyUpdateFlag
    // returns ok:false after every SW restart until the next alarm fires (~30m).
    try {
      if (chrome.storage && chrome.storage.local) {
        const flagOut = await chrome.storage.local.get('gam_update_available');
        if (flagOut && flagOut.gam_update_available && flagOut.gam_update_available.to) {
          _UPDATE_FLAG_LAST_SET = flagOut.gam_update_available;
        }
      }
    } catch (_) {}
  } catch (e) { /* service-worker may have been evicted; cache stays empty */ }
}
```

**Why safe:** `_UPDATE_FLAG_LAST_SET` is a `let` declared at module scope (line 250). `loadSecrets()` is only ever *invoked* from `onInstalled`/`onStartup` listeners, which fire after module evaluation completes -- no TDZ hazard. The restored value is the exact object previously written to `chrome.storage.local` by the alarm path, so `verifyUpdateFlag` structural comparison (`from`, `to`, `firstSeenAt`) is immediately valid. No new data is fabricated; we are restoring SW RAM from the authoritative durable record.

**Lines added:** 9 (within the 1-5 line surgical fix target; expanded to include guard + try/catch for correctness).

---

## D. Bigger refactors flagged for integration agent

### D1 -- `_LAST_CLEAR_TOKENS_AT` persistence (P2, deferred)

`_LAST_CLEAR_TOKENS_AT` could be mirrored to `chrome.storage.session` so the 10s debounce survives SW restarts. However, this requires adding a session read to the `clearTokens` handler (async path that currently runs synchronously on the rate-limit check). The check at line 895 is `_now - _LAST_CLEAR_TOKENS_AT < 10_000` -- converting it to an async session read would require restructuring the message handler to `return true` and async-respond, which is already the pattern below but needs care not to introduce a TOCTOU window. Deferring to integration agent: the attack surface is negligible (SW restart clears debounce once, user is never the victim) and the refactor touches the `clearTokens` message handler flow beyond 5 lines.

### D2 -- `onStartup` alarm recreation gap (observation, not a Rule 1-3 violation)

`onStartup` re-creates alarms that may have been destroyed. However, if the SW is terminated mid-alarm-handler (e.g., during `_maintWeeklyRun`), the partially-completed work is lost. This is a Rule 1/2 pattern but the fix involves checkpointing alarm progress to `chrome.storage.session` -- a broader refactor. Flagged for a dedicated alarm-idempotency agent.

---

## E. Parse-check status

```
Baseline (pre-fix):
  node --check background.js  --> exit 0 (PASS)
  node --check modtools.js    --> exit 0 (PASS)

Post-fix:
  node --check background.js  --> exit 0 (PASS)
  node --check modtools.js    --> not modified, status unchanged (PASS)
```

All files parse-clean. No version bump applied (integration agent responsibility). No ZIP built. No commit made.
