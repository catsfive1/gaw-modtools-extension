# AF-17 — Rules 49-51: Structured Logging, Error Boundaries, Global Error Handlers

**Suite:** Anti-Fragile v10.5.1  
**Audit date:** 2026-05-09  
**Mode:** AUDIT-ONLY (no code changes)  
**Audited file:** `modtools-ext/modtools.js`

---

## Rule 49 — Structured Logging via chrome.runtime.sendMessage

### Current state

`_diagLog(category, message, extra)` is defined at lines 53-80. The entry shape it writes is:

```js
{
  ts: Date.now(),
  iso: new Date().toISOString(),
  cat: category,
  msg: String(message || ''),
  extra: extra || null,
  stack: '...',          // only for sticky / auth-modal / modPost
  v: VERSION
}
```

Persistence path: fire-and-forget `chrome.storage.local.get` / `set` into the `gam_diag_log` key. Ring buffer capped at 500 entries. In-memory `_diagBuffer` array shadows the stored log.

**What is missing from the schema:**

1. **No `level` field.** Rule 49's target schema requires `{ts, level, source, msg, ctx}`. The existing shape uses `cat` (category) instead of `source`, omits `level` entirely, and uses `extra` for context rather than `ctx`. Every entry is implicitly "INFO" — there is no way to filter stored entries by severity without re-parsing the message string.

2. **No `chrome.runtime.sendMessage` relay.** Rule 49 calls for centralised logs forwarded to the background script. The current implementation writes directly to `chrome.storage.local` from the content script. Background (`background.js`) never receives a log message; it is completely uninvolved in the diag pipeline.

3. **console.warn/error coverage is partial.** There are ~80 `console.warn` and ~30 `console.error` calls in modtools.js. Of these, only ~22 are instrumented with a corresponding `_diagLog()` call nearby. The vast majority are bare — they exist only in DevTools, never in the diag ring buffer or chrome.storage.

Representative unmirrored call sites (sample, not exhaustive):

| Line | Call | Category missed |
|------|------|-----------------|
| 216 | `console.warn` selector drift | ui-health |
| 1610 | `console.warn` storage write-mismatch | storage |
| 1619 | `console.error` secret save FAILED | auth |
| 5056 | `console.error` drawer fallback threw | v7-drawer |
| 5199 | `console.error` v7 adapter threw | v7-adapter |
| 6878 | `console.warn` pattern-sync push FAILED | pattern-sync |
| 7086 | `console.warn` verifyBan threw | death-row |
| 11902 | `console.warn` users-autorefresh fetch failed | autorefresh |
| 13195 | `console.warn` queue-scroll fetch failed | queue |
| 15119 | `console.error` modchat step FAILED | modchat |
| 19054 | `console.error` applyThemeHarmony failed | theme |
| 21714 | `console.error` firehose loop failed | firehose |

### Proposed normalization

Adopt a unified `diagEntry` schema:

```js
{
  ts:     Date.now(),          // epoch ms — unchanged
  iso:    new Date().toISOString(),
  level:  'info'|'warn'|'error',  // NEW — required
  source: category,            // rename cat -> source for Rule 49 alignment
  msg:    String(message || ''),
  ctx:    extra || null,       // rename extra -> ctx
  stack:  null | '...',        // unchanged; widen to all 'error' level entries
  v:      VERSION
}
```

Add a `sendMessage` relay inside `_diagLog` for `warn` and `error` levels only (info is too noisy for IPC):

```js
if ((level === 'warn' || level === 'error') && chrome?.runtime?.sendMessage) {
  chrome.runtime.sendMessage({ type: 'gam_diag', entry }).catch(() => {});
}
```

Background (`background.js`) adds a listener that appends to a separate `gam_bg_diag` storage key — giving a cross-process view of failures that survive content-script crashes.

---

## Rule 50 — Never Let a Content-Script Error Crash the Page

### Current state

The top-level `init()` (line 21386) is correctly wrapped: `init().catch(err => { ... banner ... })` at line 21573. That is the only function with a full outer catch.

**Feature handlers called from `init()` — boundary coverage audit:**

| # | Handler | Line | Outer try/catch? | Notes |
|---|---------|------|-----------------|-------|
| 1 | `buildTriageConsole()` | 21427 | NO | Called bare; DOM-heavy |
| 2 | `enhanceBanPage()` | 21431 | NO | Called bare |
| 3 | `enhanceQueuePage()` | 21434 | NO | Called bare; starts MutationObserver |
| 4 | `wireV7EntryPoints()` | 21439 | YES (try/catch) | Already guarded |
| 5 | `enhanceModmailRead()` | 21449 | NO | Called bare |
| 6 | `installModmailHintsPanel()` | 21470 | YES (try/catch) | Already guarded |
| 7 | `buildStatusBar()` | 21473 | NO | Called bare; large DOM inject |
| 8 | `ModChat.init()` | 21476 | YES (try/catch) | Already guarded |
| 9 | `startCrawler()` | 21525 | NO | Called inside setTimeout, no catch |
| 10 | `startPresencePings()` | 21490 | NO | Called bare; network-dependent |

Handlers 1, 2, 3, 5, 7, 9, and 10 have no outer error boundary. A single DOM API throw in `buildStatusBar()` or `buildTriageConsole()` will propagate uncaught up through the async `init()` body, short-circuit the remaining boot steps, and silently suppress all subsequent feature initialization without any visible signal to the user.

`openModConsole()` (line 7236) and `executeBan()` (line 6818) are invoked from click handlers and button callbacks throughout the file. Those call sites use bare invocations with no surrounding catch.

`processDeathRow()` (line 7130) has a `try/catch` for each inmate iteration — correctly isolated. This is the model the others should follow.

The `ModChat.openPanel()` internal `_step()` / `_stepAsync()` wrappers (lines 15187-15210) are also the right pattern: individual steps catch + snack + degrade gracefully. That pattern should be extracted and generalised.

### Proposed `safeFeature` wrapper

```js
function safeFeature(name, fn) {
  try {
    const result = fn();
    // Handle async features transparently
    if (result && typeof result.catch === 'function') {
      result.catch(e => {
        _diagLog('safe-feature', '[' + name + '] async threw', { msg: e && e.message || String(e) });
        console.error('[ModTools] feature "' + name + '" async failed', e);
        try { snack(name + ' failed — check console', 'error'); } catch(_) {}
      });
    }
    return result;
  } catch(e) {
    _diagLog('safe-feature', '[' + name + '] threw', { msg: e && e.message || String(e) });
    console.error('[ModTools] feature "' + name + '" threw', e);
    try { snack(name + ' failed — check console', 'error'); } catch(_) {}
    return null;
  }
}
```

Usage in `init()` replaces bare calls:

```js
// Before
buildTriageConsole();
enhanceBanPage();
enhanceQueuePage();
enhanceModmailRead();
buildStatusBar();

// After
safeFeature('buildTriageConsole',    () => buildTriageConsole());
safeFeature('enhanceBanPage',        () => enhanceBanPage());
safeFeature('enhanceQueuePage',      () => enhanceQueuePage());
safeFeature('enhanceModmailRead',    () => enhanceModmailRead());
safeFeature('buildStatusBar',        () => buildStatusBar());
// setTimeout-wrapped features:
setTimeout(() => safeFeature('startCrawler', () => startCrawler()), 6000);
setTimeout(() => safeFeature('startPresencePings', () => startPresencePings()), 3000);
```

The snack is optional — `safeFeature` should accept an `{silent: true}` option for background features (crawler, presence pings) where a user-visible error toast would be confusing.

---

## Rule 51 — Global Error Boundary (window.onerror + unhandledrejection)

### Current state

**Neither handler exists.**

A search for `window.addEventListener('error'` and `window.addEventListener('unhandledrejection'` returns zero matches in modtools.js, background.js, and popup.js. There is no global error boundary anywhere in the extension.

This means:
- Any synchronous throw that escapes a function boundary propagates to the browser's default error handler. It appears in DevTools console but is never captured in the diag ring buffer.
- Any rejected Promise that is not `.catch()`-ed produces an `unhandledrejection` event that is also completely invisible to the extension's own diagnostics.

Both of these classes of error are common in content scripts: RPC timeouts become unhandled rejections if the `.catch()` is accidentally omitted; MutationObserver callbacks and IntersectionObserver callbacks throw outside any `try/catch` chain.

### Proposed insertion

Insert at the top of the IIFE, immediately after `_diagLog` is defined (after line 80), before the constants block:

```js
// Rule 51 — global error boundary
(function installGlobalErrorBoundary() {
  window.addEventListener('error', function(evt) {
    // Ignore cross-origin script errors (no useful info available)
    if (!evt.filename || evt.filename === '') return;
    // Only handle errors from this extension's own scripts
    if (evt.filename && !evt.filename.includes(chrome.runtime.id)) return;
    try {
      _diagLog('global-error', evt.message, {
        file: evt.filename,
        line: evt.lineno,
        col:  evt.colno,
        err:  evt.error && evt.error.stack ? evt.error.stack.slice(0, 500) : null
      });
    } catch(_) {}
  });

  window.addEventListener('unhandledrejection', function(evt) {
    try {
      const reason = evt.reason;
      const msg = reason instanceof Error
        ? reason.message
        : String(reason || 'unknown rejection');
      const stack = reason instanceof Error && reason.stack
        ? reason.stack.slice(0, 500)
        : null;
      _diagLog('unhandled-rejection', msg, { stack: stack });
    } catch(_) {}
  });
})();
```

**Scope note:** content scripts share `window` with the page but run in an isolated world. The `window.addEventListener('error')` approach in a content script captures errors from the content script's own scope, not page-world errors — which is the correct and desired behaviour.

**chrome.runtime.id guard:** filters out errors from other extensions or the page itself; only modtools-sourced errors are logged.

---

## Summary of Gaps

| Rule | Finding | Severity |
|------|---------|----------|
| 49 | `_diagLog` schema missing `level` field; `extra`/`ctx` and `cat`/`source` naming misalign with spec | Medium |
| 49 | No `chrome.runtime.sendMessage` relay to background for centralised log aggregation | Medium |
| 49 | ~80% of `console.warn/error` calls have no corresponding `_diagLog` mirror | High |
| 50 | 7 of 10 top feature-handler entry points in `init()` lack an outer error boundary | High |
| 50 | No `safeFeature` wrapper or equivalent defensive pattern exists | High |
| 51 | `window.addEventListener('error')` absent — zero coverage | Critical |
| 51 | `window.addEventListener('unhandledrejection')` absent — zero coverage | Critical |

### What is already good

- `_diagLog` itself is structurally sound: ring buffer, fire-and-forget storage, selective stack capture, version tagging.
- `init().catch()` is correctly in place — the boot sequence will not silently die.
- `ModChat._step()` / `_stepAsync()` pattern is a solid local model; generalising it to `safeFeature()` is low-risk.
- `processDeathRow()` per-inmate try/catch is correctly isolated.
