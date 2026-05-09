# AF-26 Audit: Rules 76-78 — Thread Safety, Idle Scheduling, Event Throttling

**Suite:** Anti-Fragile (AF) | **File audited:** `modtools.js` | **Version:** v10.5.1 | **Date:** 2026-05-09 | **Mode:** AUDIT-ONLY

---

## Rule 76 — Never block the main thread in content scripts or popup

### Top-5 candidates for refactor (synchronous heavy work on hot paths)

**1. `document.addEventListener('input', ...)` global DECLAS regex — line 21332**

A delegated `input` listener on `document` fires on every keystroke anywhere on the page. The handler immediately runs `/declas/i.test(t.value || '')` against the full textarea value. On a long ban-reason field this is a regex match on potentially hundreds of characters per keypress, with zero guard against being called while the user is typing fast. The listener has no debounce wrapper. This is the single highest-risk hot-path violation in the file.

**2. ModChat `@autocomplete` `input` handler — lines 15154-15166**

On every keystroke in the ModChat textarea this handler: slices the entire value to cursor position, runs `/@([A-Za-z0-9_-]*)$/.match()`, then `.filter()` walks the full `STATE.modsList` array and calls `String.startsWith()` on every entry. For communities with large mod lists this is a synchronous O(n) walk per keypress. No debounce is present. This fires on every character, including backspace.

**3. `MasterHeartbeat.tick()` subscriber dispatch — line 2188 (`setInterval`)**

`MasterHeartbeat` maintains a `subs` array and calls every subscriber synchronously inside a single `setInterval` callback. Subscribers include DOM-touching functions (status bar updates, Death Row counter, badge re-injection). If any subscriber stalls (slow DOM query, an uncaught exception that is swallowed), the entire heartbeat tick blocks. There is no yield between subscriber calls.

**4. `injectBadges()` + `injectAllStrips()` called sequentially on SPA nav — line 399**

Both are called together inside a `setTimeout(..., 900)` on every SPA navigation event. Both walk the DOM (`document.querySelectorAll` with compound selectors across `.post`, `.comment`, `.details > span.since`). These are full-page DOM scans. On a long queue page with 50+ posts this is a synchronous multi-hundred-node walk per navigation. `injectAllStrips()` itself calls `injectBadges()` as well (line 9586 area), risking double-walk.

**5. `JSON.parse` inside `lsGet` called on every settings read — line 4212**

`lsGet(key, fallback)` calls `JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback))` synchronously and is called from render paths, event handlers, and timer callbacks throughout the file (203 `querySelectorAll`/forEach calls reference settings). While individual parses are fast, `lsGet` on a large blob (e.g. `gam_settings` containing all feature flags, all rule arrays, all user overrides) on every DOM mutation or tick is cumulative main-thread cost with no memoization beyond the `CachedStore` path — and many call sites bypass `CachedStore` and call `lsGet` directly.

---

## Rule 77 — Use `requestIdleCallback` for non-critical work

**Current usage: zero.** `grep requestIdleCallback` returns no matches.

All periodic/background work runs via `setTimeout` or `setInterval`, which fire at exact intervals regardless of whether the browser is in a frame or idle. Below are 8 tasks that should yield via `requestIdleCallback` (with a `setTimeout` fallback for environments that don't support it):

| # | Task | Current scheduling | Why it qualifies for `requestIdleCallback` |
|---|---|---|---|
| 1 | `_ambientModmailPrefetch()` | `setTimeout(15000)` then `setInterval(10min)` | Non-critical background AI prefetch. User never waits on this path. Lines 15402-15403. |
| 2 | `pullPatternsFromCloud()` initial kick | `setTimeout(3000)` | Death Row / Tard patterns sync. No visible UI until result arrives; initial settle can wait for idle. Line 7001. |
| 3 | `pollTeamFeatures()` boot kick | `setTimeout(6000)` | Feature flag read from RPC. 6s delay already signals non-urgency. Could be idle-scheduled instead. Line 1730. |
| 4 | `_sharedDrRefresh()` initial kick | `setTimeout(2000)` | Shared Death Row rules fetch. Rules already cached; initial remote sync can wait for idle. Line 11767. |
| 5 | `_susRefresh()` initial kick | `setTimeout(1500)` | Suspicious-user list decoration. Decorations are cosmetic; 1.5s setTimeout can become idle-callback. Line 10657. |
| 6 | `injectBadges()` + `injectAllStrips()` on SPA nav | `setTimeout(900)` | Badge / strip injection on navigation is cosmetic enhancement, not blocking UI. Line 398-400. |
| 7 | `_gamOrphanBackdropSweep()` initial kick | `setTimeout(1500)` | Orphan modal cleanup. Purely maintenance; no urgency. Line 6668. |
| 8 | `__updateTicker()` initial boot | `setTimeout(800)` | Status-bar ticker first paint. Ticker is informational; idle scheduling safe. Line 16356. |

**Recommended wrapper** (to add once, reference everywhere):

```js
function scheduleIdle(fn, timeoutMs) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: timeoutMs });
  } else {
    setTimeout(fn, timeoutMs);
  }
}
```

---

## Rule 78 — Throttle/debounce all high-frequency event listeners

### Audit results

**A single `debounce` helper exists** at line 21971, scoped inside the SharedMod closure. It is used correctly for `_draftPut` (2s debounce on cross-mod draft sync). It is **not exported or reused** elsewhere. Every other `input` listener manages its own ad-hoc `clearTimeout`/`setTimeout` or has no throttling at all.

### Violations

**V1 — `document.addEventListener('input', ...)` DECLAS handler — line 21332 — NO debounce**

Global delegated listener. Fires synchronously on every keystroke site-wide, runs a regex immediately. Must be debounced. Proposed fix: debounce 200ms, bail early if `e.target.tagName !== 'TEXTAREA'` before the timeout fires.

```js
// BEFORE (line 21332):
document.addEventListener('input', e => {
  if (!getSetting('easterEggsEnabled', true)) return;
  const t = e.target;
  if (!t || t.tagName !== 'TEXTAREA') return;
  if (/declas/i.test(t.value || '')) { ... }
});

// AFTER:
let _declasTimer = null;
document.addEventListener('input', e => {
  const t = e.target;
  if (!t || t.tagName !== 'TEXTAREA') return;
  clearTimeout(_declasTimer);
  _declasTimer = setTimeout(() => {
    if (!getSetting('easterEggsEnabled', true)) return;
    if (/declas/i.test(t.value || '')) { ... }
  }, 200);
});
```

**V2 — ModChat `@autocomplete` `input` handler — line 15154 — NO debounce**

Runs regex + O(n) list filter on every keystroke. Needs a 100-150ms debounce. The existing `_closeAtPopup()` fast-path (no match) is cheap, but the `filter + renderAtPopup` path is not.

```js
// AFTER: wrap the handler body in a debounce
let _atTimer = null;
ta.addEventListener('input', () => {
  clearTimeout(_atTimer);
  _atTimer = setTimeout(() => {
    const v = ta.value;
    const cur = ta.selectionStart || v.length;
    const before = v.slice(0, cur);
    const m = before.match(/@([A-Za-z0-9_-]*)$/);
    if (!m) { _closeAtPopup(); return; }
    const q = (m[1] || '').toLowerCase();
    const mods = (STATE.modsList || []).filter(x =>
      q === '' ? true : (x.mod_username || '').toLowerCase().startsWith(q)
    ).slice(0, 8);
    _renderAtPopup(mods);
  }, 120);
});
```

**V3 — Bug-report char counter `input` handler — line 1127 — NO debounce**

Updates a DOM text node on every keystroke. Low cost individually but needless at 60wpm. A 50ms debounce costs nothing visible and removes guaranteed-redundant DOM writes.

**V4 — ModChat char-count `input` handler — line 15106 — NO debounce**

`updateCharCount` on every keystroke. Same pattern as V3. 50ms debounce appropriate.

**V5 — Macro draft save `input` handlers — lines 8173, 8984 — NO debounce**

Both handlers call `chrome.storage.session.get('gam_macro_drafts')` synchronously on every keystroke then write back. `chrome.storage.session.get` is async, so it does not block the thread, but it creates a new Promise per keystroke at up to ~10 calls/second. Should be debounced 300-500ms to collapse rapid typing into a single write.

**V6 — `window.addEventListener('scroll', ...)` lazy-load safety net — line 13820**

```js
window.addEventListener('scroll', () => {
  if (scrollTimer) return;
  scrollTimer = setTimeout(() => {
    scrollTimer = null;
    ...
  }, ...);
});
```

This uses a "leading-edge gate" pattern (set timer, ignore until it fires) which is equivalent to a throttle — but the timer duration is missing from the grep context and should be confirmed. If the timeout is < 100ms this is effectively unthrottled. Recommend explicit `throttle(fn, 150)` for clarity and correctness.

### Proposed shared utilities (add once near top of IIFE)

```js
function debounce(fn, ms) {
  let t;
  return function() {
    const a = arguments;
    clearTimeout(t);
    t = setTimeout(function() { fn.apply(null, a); }, ms);
  };
}

function throttle(fn, ms) {
  let last = 0;
  return function() {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    fn.apply(null, arguments);
  };
}
```

The `debounce` at line 21971 is already correct — extract it to module scope and delete the duplicate. The `throttle` helper does not exist anywhere in the file and must be added.

---

## Summary table

| Rule | Finding | Severity | Count |
|---|---|---|---|
| 76 | `document.input` global fires regex per keypress, no guard | High | 1 |
| 76 | `@autocomplete` O(n) filter per keypress, no debounce | High | 1 |
| 76 | `injectBadges` + `injectAllStrips` full DOM scan on every SPA nav | Medium | 1 |
| 76 | `lsGet` JSON.parse bypassing CachedStore on hot render paths | Medium | ~many |
| 77 | `requestIdleCallback` usage | Zero | 0/8 boot tasks |
| 78 | Unthrottled/undebounced `input` listeners | High | 5 confirmed violations |
| 78 | `scroll` listener uses ad-hoc gate, not named throttle | Low | 1 |
| 78 | `debounce` helper is closure-scoped, not shared | Low | 1 |
| 78 | `throttle` helper absent entirely | Medium | 0 implementations |
