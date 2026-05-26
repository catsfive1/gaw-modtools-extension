# CHANGELOG v10.16.38 — MV3 SW eviction-safe settings coalescer

**Released:** 2026-05-15
**Type:** Patch (correctness fix)

## Summary
Replaces the `setTimeout`-based debouncer in `background.js` PA.4 coalescer with a Promise-chain pattern that is safe under MV3 service-worker eviction. The 300ms debounce window was vulnerable to silent settings-write loss if Chrome evicted the SW mid-timer.

## Fixes
- 🔧 `background.js:489-524` — replaced `_settingsWriteTimer` (setTimeout-based) with `_settingsWriteInflight` (Promise-based). MV3 SWs are not evicted while a pending await is in flight, so the buffer survives. `_settingsCoalescedFlush()` simplified to await the in-flight promise. **Same public API** — no caller changes required.

## Why this matters
The old PA.4 (v10.12.1) used `setTimeout(fn, 300)` to coalesce rapid `setSetting` calls. MV3 service workers are not guaranteed to stay alive during arbitrary `setTimeout` durations — Chrome can evict idle SWs at any point. If eviction landed inside the 300ms window, the buffered patches were lost without warning. Non-critical settings (UI preferences, state flags) silently dropped. The fix uses an awaited Promise instead of a timer: while a Promise is pending, the SW is "busy" and cannot be evicted.

## Smoke test
- ✓ Open extension popup, change 3+ settings rapidly → close popup → reopen → all 3 settings present
- ✓ Open extension popup, change a setting → wait 60s → reopen → setting present (verifies SW restart doesn't lose pending writes)
- ✓ `chrome.storage.local.get('gam_settings')` after coalesce flush returns the latest merged state

## Companion worker changes (deployed v241ea871)
- Worker `gaw-mod-proxy-v2.js` — Discord `boss→worker` delegation message now length-guarded via `truncateForDiscord(..., 1500)`. Prevents 400-on-long-output when Grok delegates to Llama with a verbose task description.
- Worker — new `/uninstall` endpoint logs version-at-uninstall to MOD_KV (90-day TTL). Closes churn-signal gap from `chrome.runtime.setUninstallURL` previously hitting 404.

## Upgrade path
None. Drop-in replacement.
