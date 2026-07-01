# CHANGELOG v10.36.1 — HOTFIX: TDZ crash on MSG_QUEUE_KEY (same class as v10.6.1 FEATURE_FLAGS)

**Released:** 2026-07-01
**Commit:** `86b0fa9`
**Type:** Patch (hotfix — declaration-order / TDZ fix, zero behavior change)

## Summary
Hoists two `const` declarations — `MSG_QUEUE_KEY` and `MSG_QUEUE_MAX` — from the AF-14 message-queue outbox code (`modtools.js`, was ~line 27939) to the top of the file's enclosing IIFE (`modtools.js:62-63`), immediately after `FEATURE_FLAGS` (manifest 10.36.0 → 10.36.1; no worker change). This is the identical fix, for the identical bug class, that `FEATURE_FLAGS` received in v10.6.1.

## Fixes
- 🔧 TDZ `ReferenceError` on `MSG_QUEUE_KEY` (`modtools.js:62-63`, was ~L27939). `rpcCall` is a hoisted `async function` declaration, callable from anywhere in the enclosing IIFE — including during the script's very first synchronous top-to-bottom pass, before execution reached L27939. On every successful RPC response, `rpcCall` fires `_replayMsgQueue()` fire-and-forget (`modtools.js:28064`, no `await`) to drain the pending-message outbox, and `_replayMsgQueue` immediately references `MSG_QUEUE_KEY` as its first action. If that fire-and-forget call landed before L27939 executed, `MSG_QUEUE_KEY` was still in its temporal dead zone, throwing `ReferenceError: Cannot access 'MSG_QUEUE_KEY' before initialization`.

## Why this matters
The crash never broke extension boot: `_replayMsgQueue`'s own `try/catch` caught the `ReferenceError` and routed it through the structured `_logError` logger, so the only visible symptom was a recurring `[gam:storage]` console warning — confirmed firing on every page load, and again roughly every 5 minutes thereafter, in a live browser session. This is the **second** occurrence of this exact bug class: `FEATURE_FLAGS` hit the same TDZ trap in v10.6.1 (referenced from `__v80ParkUI` at script-load time, ahead of its original declaration at L21971) and was fixed the same way — hoist to the top of the IIFE. `MSG_QUEUE_KEY`/`MSG_QUEUE_MAX` now sit directly beneath `FEATURE_FLAGS` at the file head, with an in-code comment cross-referencing both incidents.

## Internal
- 🔨 `README.md` — corrected a long-stale "Current version" line (was v10.9.0, ~27 versions behind actual) to v10.36.1.

## Verification
- ✓ chrome-extension-reviewer — 0 blockers, full MV3 scope pass.
- ✓ mv3-permissions-auditor — 0 blockers, no permission/manifest changes.
- ✓ Test harness — 153/153 smoke assertions passing across all 11 suites; `node --check` syntax-clean on all 4 JS files.

## Known gap (not shipped)
The AF-14 message-queue outbox (`_enqueueRpc` / `_replayMsgQueue` / `rpcCall`) still has **zero dedicated regression test coverage** — this is the second TDZ incident in this exact class (a `const` declared below the first reachable call site of a hoisted function that references it) with nothing guarding against a third. `tests/regressions/` exists and documents a one-file-per-bug convention keyed to a `/bug-reports` numeric ID, but has no entries yet. Natural follow-up: a regression test asserting TDZ-safety for `FEATURE_FLAGS` and `MSG_QUEUE_KEY` together, so neither can be moved back below its call site by a future refactor without the test failing first.

## Smoke test
- ✓ Load the unpacked extension, open any greatawakening.win page, open DevTools console → no `[gam:storage]` TDZ warning on initial load or after ~5 minutes idle (previously fired on load and every ~5 min).
- ✓ Trigger any RPC round trip (e.g., open the popup) → `_replayMsgQueue` drains the outbox normally; `chrome.storage.local.get('gam_msg_queue')` behaves identically to pre-fix.

## Upgrade path
None. Drop-in replacement — reload the unpacked extension, or accept the auto-update.
