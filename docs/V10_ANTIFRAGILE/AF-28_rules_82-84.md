# AF-28: Rules 82-84 Audit
**Version:** v10.5.1 | **Mode:** AUDIT-ONLY | **Date:** 2026-05-09

---

## Rule 82 — Lazy-Load Heavy Features

**Requirement:** Build DOM only on first user invocation, not during `init()`.

### Current State

`init()` (line 21495) is the primary boot function. It runs unconditionally on every
page load for authenticated mods. It calls:

- `buildStatusBar()` (line 21582) — eager, every page load. The bar itself is
  lightweight but it immediately creates DOM for: session pill, fallback toggle,
  filter select, DR skull button, AI scan button, Hot Now button, ModChat button,
  and the modmail envelope button. These are all button/span nodes, cost is low.

- `ModChat.init()` (line 21585) — semi-lazy. The `init()` guard at line 15326
  (`if (STATE.inited) return`) prevents re-init, and the function returns early if
  no token is present. However, `injectStyles()` and `startClosedPolling()` fire
  eagerly on every page load when a token exists. The panel DOM is NOT built until
  `openPanel()` is called — this part is correctly lazy.

- `SuperMod.init()` (line 22942, via `setTimeout(..., 4000)`) — deferred 4s.
  Correctly does no heavy DOM work at init; the actual supermod banner and
  collision-check logic only activates when a textarea receives input.

**Violations (features that boot DOM eagerly when they should wait):**

**V82-1: Mod Console DOM (line 7236 / `openModConsole`)**
Status: CLEAN. `openModConsole` is invoked only on user action (keyboard shortcut,
button click, hammer icon). No DOM is built at init. This is correctly lazy.

**V82-2: IntelDrawer DOM (line 5042 / `_mount`)**
Status: PARTIAL VIOLATION. The `IntelDrawer` IIFE initializes its `state` object and
`l1Store` Map at parse time (module-level memory cost, minor). The `_mount()` function
builds actual DOM lazily on first `open()` call -- that is correct. However,
`wireV7EntryPoints()` is called unconditionally in `init()` (line 21548), which walks
the page DOM to install click listeners regardless of whether IntelDrawer is
feature-flagged on. If `features.drawer` is off, those listeners call `IntelDrawer.open()`
which no-ops, but the listener installation itself is eager work on every SPA navigation.

**V82-3: Hot Now Panel (line 9717 / `_showHotNowPanel`)**
Status: CLEAN. Panel DOM is built fresh on each invocation (innerHTML cleared,
structure rebuilt). No eager mount. Triggered only via button click.

**V82-4: Modmail Popover (line 15693 / `_showModmailPopover`)**
Status: CLEAN. Entire DOM built inside the function, invoked only on click. The
popover pattern here is correct.

**V82-5: Ambient modmail prefetch (line 15401)**
Status: VIOLATION. `_ambientModmailPrefetch()` fires on a 15s delay after ANY
page load, then polls every 10 minutes unconditionally. This makes 5 AI-reply RPC
calls (up to 3 per cycle) regardless of whether the mod has the modmail popover open
or has any intention of using it this session. The "lazy-load" principle is violated:
this feature activates itself without user invocation. It should be gated to only
start when the modmail envelope button is first clicked, or at minimum gated on
`IS_MODMAIL_LIST` page detection.

**V82-6: IntelCache in-memory structure (line 6840)**
Status: MINOR. The `IntelCache` Map (cap 200) and `IntelDrawer._debounceMap` /
`_lastViewedMap` allocate at parse time. These are negligible (empty Maps) but worth
noting as always-on structures.

**Proposed fix for V82-5 (ambient prefetch):**
Replace the unconditional `setTimeout` + `setInterval` with a lazy start triggered
by first click on the modmail envelope button:

```js
// In buildStatusBar(), when wiring the modmail envelope button click:
let _ambientPrefetchStarted = false;
inboxBtn.addEventListener('click', () => {
  if (!_ambientPrefetchStarted) {
    _ambientPrefetchStarted = true;
    setTimeout(() => { try { _ambientModmailPrefetch(); } catch(_){} }, 500);
    setInterval(() => { try { _ambientModmailPrefetch(); } catch(_){} }, 10 * 60 * 1000);
  }
  try { _showModmailPopover(inboxBtn); } catch(err) { ... }
});
```

This preserves the ambient pre-fetch value proposition (drafts ready before the mod
opens the popover) while not burning AI quota on pages where modmail is never opened.

---

## Rule 83 — Cache Network Responses with Proper Expiration

**Requirement:** Every network cache must have explicit TTL + invalidation path.

### Client-Side Caches

**C83-1: `IntelCache` (in-memory Map, line 6840)**
- TTL: YES -- `HOVER_CACHE_MS = 30 * 60 * 1000` (30 min), checked at line 6854.
- Invalidation: YES -- explicit `IntelCache.delete(username.toLowerCase())` called
  after a successful ban action (line 8797).
- LRU eviction: YES -- capped at 200 entries, oldest evicted at line 6847.
- **Status: COMPLIANT.**

**C83-2: `gam_modmail_drafts` (chrome.storage.session)**
- Per-entry TTL: YES -- `FRESH_MS = 30 * 60 * 1000` (30 min), checked at line 15380
  (`cachedAt` field). Entries older than 30 min trigger a re-fetch by the ambient poller.
- Session eviction: IMPLICIT -- `chrome.storage.session` is cleared when the browser
  session ends. No explicit TTL on the session itself beyond browser closure.
- Invalidation path: NO explicit invalidation when a mod SENDS a reply to a thread.
  After a modmail reply is submitted, the old AI draft for that `thread_id` remains
  in `gam_modmail_drafts` until it ages out at 30 min. A mod re-opening the popover
  within 30 min of replying will see the stale draft suggestion, not a "draft used"
  state.
- **Status: PARTIAL VIOLATION (V83-2).** Add a `cache[thread_id] = null` or delete
  step in the modmail send success handler.

**C83-3: `gam_macro_drafts` (chrome.storage.session)**
- TTL: NONE. Macro drafts are stored and retrieved with no timestamp field, no expiry
  check, and no purge. They accumulate until the browser session ends.
- Invalidation: YES on explicit discard/submit (line 8850 reads + updates the store
  after submit).
- **Status: VIOLATION (V83-3).** For long-running sessions (mods leaving browser
  open for days), macro drafts survive indefinitely. Each draft entry should carry a
  `savedAt` timestamp; entries older than `DRAFT_MS` (24h, defined at line 1864 for
  SuperMod draft persistence) should be purged on read.

**C83-4: `PROFILE_TTL_MS` / profile cache (line 704)**
- TTL: YES -- `48 * 60 * 60 * 1000` (48h), checked against `indexedAt` timestamp.
- **Status: COMPLIANT.**

**C83-5: `IntelDrawer` L1 in-memory cache (line 5067 / `l1Store`)**
- TTL: NONE. The LRU map is capped at 500 entries but has no time-based expiry.
  A user's intel data fetched at session start is served from L1 for the entire
  session regardless of how old it is.
- Invalidation: NO explicit path. After a ban, `IntelCache.delete()` is called
  (C83-1) but `l1Store` is not flushed for that user.
- **Status: VIOLATION (V83-5).** L1 entries should carry a `fetchedAt` timestamp;
  `l1Get` should return null when `(Date.now() - v.fetchedAt) > HOVER_CACHE_MS`.
  Also, the ban-success handler should call `l1Store.delete(key)` alongside
  `IntelCache.delete(username)`.

**C83-6: SuperMod L1 draft cache (line 22918 / `L1` export)**
- Not audited in depth here; SuperMod's own TTL and eviction is its own system.
  Its `DRAFT_MS` (24h) is correctly defined; downstream usage within SuperMod appears
  to check this. Mark as DEFERRED pending SuperMod-specific audit.

### Worker-Side KV Caches

The worker uses `MOD_KV` for presence, cache, invites, and daily budgets per the
README. These are managed server-side and are outside client-side enforcement scope.
No client-side TTL violations were found in the RPC call layer -- responses are
consumed and handed to one of the above client caches.

---

## Rule 84 -- Progressive Enhancement

**Requirement:** Core features work with zero network. Offline-mode banner + queue-for-replay for degraded operations.

### Features That Work Offline Today

These rely exclusively on `chrome.storage.local`, `chrome.storage.session`, or
in-memory state populated at boot:

| Feature | Storage source | Offline status |
|---|---|---|
| Status bar render | In-memory (populated from chrome.storage at boot) | WORKS -- bar renders from cached profile data even with no network |
| Audit log read | `chrome.storage.local` (`gam_mod_log`, line 21290) | WORKS -- read-only, fully local |
| Draft autosave (SuperMod) | `chrome.storage.local` via `gam_draft_*` keys | WORKS -- writes are local-only |
| Fallback mode toggle | `localStorage.gam_fallback_mode` | WORKS |
| Hot Now panel display | In-memory `_susState` + death-row store | WORKS -- shows last-known data |
| Death row queue display | `chrome.storage.local` roster | WORKS -- read-only |
| IntelDrawer L1 cache | In-memory `l1Store` | WORKS for cached subjects; stale but renders |

### Features That Break Offline

These make live RPC calls and have no fallback path or user-facing signal:

| Feature | Failure mode | Current handling |
|---|---|---|
| AI reply generation (modmail) | `rpcCall('modmailAiReplyForThread', ...)` fails | Silent failure in `_ambientModmailPrefetch`; popover shows no draft suggestions |
| Modmail send | `rpcCall('modmailReply', ...)` fails | Shows red banner in popover but no retry queue |
| Ban submission | `rpcCall('banUser', ...)` fails | Snack error; ban is lost |
| Note save | `rpcCall('saveNote', ...)` fails | Snack error; note is lost |
| Modmail list load | `rpcCall('modmailRecent', ...)` fails | Popover shows "loading recent modmail..." indefinitely |
| Intel fetch | Worker fetch fails | IntelDrawer body shows spinner then error skeleton |
| Presence pings | `startPresencePings` interval fails silently | No user feedback |

### Current Offline Signal: None

There is a single string `'offline / token missing'` referenced at line 20574 in
what appears to be a HUD helper, but no `navigator.onLine` listener, no
`ononline`/`onoffline` event handler, and no offline-mode banner of any kind in
the primary UX paths.

### Proposed: Offline Banner + Replay Queue

**Step 1 -- Detect and surface offline state:**

```js
// Near top of init(), after auth gate:
function _updateOfflineBanner(online) {
  let banner = document.getElementById('gam-offline-banner');
  if (online) { if (banner) banner.remove(); return; }
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'gam-offline-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999999;' +
      'background:#c0392b;color:#fff;font:600 12px ui-monospace,monospace;' +
      'padding:4px 12px;text-align:center';
    banner.textContent = 'GAW ModTools: OFFLINE -- actions queued for replay';
    document.body.prepend(banner);
  }
}
window.addEventListener('online',  () => { _updateOfflineBanner(true);  _drainReplayQueue(); });
window.addEventListener('offline', () => { _updateOfflineBanner(false); });
_updateOfflineBanner(navigator.onLine);
```

**Step 2 -- Replay queue for write operations:**

Destructive actions (ban, note, modmail reply) should enqueue to
`chrome.storage.local` under a `gam_replay_queue` key when `!navigator.onLine`,
then drain and re-submit on the `online` event. Each queued item carries:
`{ op, args, queuedAt, clientOpId }`. The `_drainReplayQueue` function
processes items in FIFO order, surfaces per-item success/failure via snack.

**Priority for queue-for-replay:**

- P0 (implement first): ban submission -- data loss on offline is unacceptable.
- P1: modmail reply -- write action, high value.
- P2: note save -- write action, moderate value.
- P3 (skip for now): AI reply generation -- not worth queuing; stale context by reconnect.

---

## Summary Table

| Rule | Finding ID | Severity | Description |
|---|---|---|---|
| R82 | V82-5 | HIGH | Ambient modmail prefetch starts unconditionally; no user trigger |
| R82 | V82-2 | LOW | `wireV7EntryPoints()` runs eagerly on every SPA nav even when drawer flag is off |
| R83 | V83-2 | MEDIUM | `gam_modmail_drafts` not invalidated on modmail send success |
| R83 | V83-3 | MEDIUM | `gam_macro_drafts` has no TTL; accumulates indefinitely in long sessions |
| R83 | V83-5 | MEDIUM | IntelDrawer L1 has no time-based eviction; stale data served indefinitely; not flushed on ban |
| R84 | V84-1 | HIGH | No `navigator.onLine` detection, no offline banner |
| R84 | V84-2 | HIGH | Ban / note / modmail send have no replay queue; writes are silently lost offline |

**Items compliant:** IntelCache (TTL + LRU + ban invalidation), profile cache (48h TTL),
ModChat.init() panel DOM (correctly lazy), Mod Console DOM (correctly lazy),
Hot Now panel DOM (correctly lazy), Modmail popover DOM (correctly lazy).
