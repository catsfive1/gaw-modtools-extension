# AF-27: Memory, Listener Lifecycle, Offscreen Compute
**Rules 79-81 | GAW ModTools v10.5.1 | AUDIT-ONLY**

---

## Rule 79 — Memory Monitoring (`chrome.system.memory` stretch)

### Permission Reality
`chrome.system.memory` is not in `manifest.json` (`permissions` array holds only
`storage`, `alarms`, `cookies`). It cannot be added to a content script context
anyway — it is a background-only API. No path forward there without a manifest
change and a background-side relay.

### Viable Substitute: `performance.memory`
Chromium exposes `window.performance.memory` in content script context. It is
deprecated as of Chrome 115 (origin trial ended) but remains available on most
Chromium builds behind no flag as of v10.5.1. Three fields are useful:

| Field | Meaning |
|---|---|
| `usedJSHeapSize` | live JS heap bytes |
| `totalJSHeapSize` | heap committed (used + fragmented) |
| `jsHeapSizeLimit` | per-tab cap (~4 GB on 64-bit) |

### Proposed Implementation
Add a passive logger to the existing diagnostic/diag channel. No new UI. No
new interval — piggyback on the `__domHealthCheckInterval` or fire once on
extension boot + once every 5 minutes aligned with `pollTeamFeatures`.

```js
// Rule 79 -- heap snapshot to diag log
function _r79LogHeap(label) {
  try {
    const m = window.performance && window.performance.memory;
    if (!m) return;
    const mb = v => (v / 1048576).toFixed(1);
    console.debug('[R79-heap]', label,
      'used=' + mb(m.usedJSHeapSize) + 'MB',
      'total=' + mb(m.totalJSHeapSize) + 'MB',
      'limit=' + mb(m.jsHeapSizeLimit) + 'MB',
      'ratio=' + (m.usedJSHeapSize / m.jsHeapSizeLimit * 100).toFixed(1) + '%'
    );
  } catch(e) {}
}
```

Call sites: boot (after feature-flag poll resolves), and inside
`__domHealthCheckInterval` body which already fires every 30 s on visible pages.
Label argument carries call site context (`'boot'`, `'health-check'`, etc.) so
log lines are greppable.

**Threshold alert (optional):** if `usedJSHeapSize / jsHeapSizeLimit > 0.70`,
emit a `console.warn` with tag `[R79-heap-pressure]`. Do not snack the user.
Diag only.

**Effort:** S. One function + two call-site inserts. No manifest change.

**Risk:** `performance.memory` returns 0 in some cross-origin iframes and in
contexts where the Chromium memory accounting is disabled via policy. Guard
with a `!m` check already shown above; log lines simply won't appear in those
contexts.

---

## Rule 80 — Listener and Interval Lifecycle Audit

### Methodology
Searched `modtools.js` (~22,000 lines) for all `addEventListener` calls (112
total) and all paired `removeEventListener` calls (14 total). Mapped each
document-level keydown listener to its teardown path.

### Confirmed Clean (properly paired)

| Location | Add | Remove | Mechanism |
|---|---|---|---|
| `preflight` modal (`~L1779`) | `document.addEventListener('keydown', escHandler)` | `L1773`: `removeEventListener` inside `finish()` resolver | Inline paired |
| `asktext` modal (`~L2505`) | `document.addEventListener('keydown', onKey, true)` | `L2480`: removed inside `finish()` try/catch | Inline paired |
| Dismiss-popup pattern (`~L3598`, `L15976`, `L16782`, `L16838`) | `document.addEventListener('click', dismiss, true)` | Self-removing closure on first trigger | Safe |
| `showModal` helper (`~L6686`) | `document.addEventListener('keydown', escHandler, true)` | Stored as `p._gamEscHandler`; cleaned by `closeAllPanels` at `L6509` | Routed through cleanup |
| `IntelDrawer` ESC handler (`~L5019`) | Added once behind `state._escBound` guard | NEVER explicitly removed | **LEAK (see below)** |
| Token-onboard ESC handler (`~L19563`) | `document.addEventListener('keydown', onEscGlobal, true)` | `L19551`: cleaned in `finally` block | Inline paired |
| Shadow-kbd handler (`~L2939`) | Added inside `__v80InstallShadowKeyDelegate` at init | Never removed | Intentional — permanent system handler |
| Ctrl+Z undo handler (`~L4528`) | Global init, no remove | Intentional permanent |
| Ctrl+K search palette | Registers `document.keydown` and `document.click` at palette-open time | Self-removes on close | Clean |

### Real Leak: IntelDrawer ESC handler (L5015-5037)

```js
if (!state._escBound) {
  document.addEventListener('keydown', function(e) {
    if (!state.open) return;
    // ... Escape / Backspace handling
  }, true);
  state._escBound = true;
}
```

The handler is registered on first `_mount()` call and **never removed**, not
even when the drawer is destroyed. The `state._escBound` guard prevents
duplicate registrations within a page session, but if the page is an SPA with
nav-triggered re-init (which GAW is — `_handleNav` reinitializes feature
modules on pushState/popState), and `state` is reset on each nav, the guard is
cleared and a new listener accumulates. Each fresh `IntelDrawer._mount()` call
after a nav leaves an orphan listener behind.

**Proposed fix:** store the handler reference and clean it on `destroy()` /
`close()` when drawer count reaches zero.

```js
// In _mount():
if (!state._escBound) {
  state._escHandler = function(e) { ... };
  document.addEventListener('keydown', state._escHandler, true);
  state._escBound = true;
}

// In destroy() or a new IntelDrawer.teardown():
if (state._escHandler) {
  document.removeEventListener('keydown', state._escHandler, true);
  state._escHandler = null;
  state._escBound = false;
}
```

Teardown should be called from `closeAllPanels()` (already the canonical
cleanup hub at L6476) when `#gam-intel-backdrop` is swept.

### setInterval Audit

Active intervals that are never cleared:

| Interval | Purpose | Cleared? |
|---|---|---|
| `pollTeamFeatures` every 5 min (`L1697`) | Feature flags | No — intentional, page-lifetime |
| `__domScheduler` (`L2154`) | Modulo-dispatched subtask bus | No — intentional singleton |
| `_gamOrphanBackdropSweep` every 30 s (`L6560`) | Orphan backdrop cleanup | No — intentional |
| `_susRefresh` every 60 s (`L10549`) | Sus-user refresh | No — intentional |
| `_sharedDrRefresh` every 60 s (`L11659`) | Shared deathrow | No — intentional |
| `_inboxPollTimer` every 60-N s (`L11268`) | Inbox intel pass | Stored in `_inboxPollTimer` but `clearInterval` is never called | **Soft risk** |
| `pullPatternsFromCloud` every 30 min (`L6895`) | Pattern sync | No clear; var not stored | **Soft risk** |
| `_triageHeartbeat` (`L13113`) | Triage console heartbeat | Cleared on `_panelEl` removal (`L13115`) | Clean |

The two "soft risk" intervals are low-severity: they guard with
`document.visibilityState` checks and have cheap payloads. The `_inboxPollTimer`
variable is declared at module scope — a `clearInterval(_inboxPollTimer)` call
could be wired to a future `destroy` path. Not urgent; flag for v11 cleanup.

---

## Rule 81 — Offscreen Document Candidates

### What offscreen documents solve
`chrome.offscreen.createDocument` (MV3) creates a hidden page that can run JS
without injecting into the host page. Valid use: heavy synchronous CPU work
that would jank the content script's main thread.

### Candidate Assessment

**Candidate A — `_sha1Sync` / `_sha1Hex12` (L5362)**
Pure-JS SHA-1 fallback used for precedent signatures. Runs synchronously on
short inputs (body sliced to 80 chars). The fast path already uses
`crypto.subtle` which is async and non-blocking. The sync fallback only fires
when SubtleCrypto is unavailable. **Not worth offscreen migration** — the
inputs are tiny and the sync path is a rare fallback.

**Candidate B — `crawlModmailHistory` (L11207)**
Walks up to 50 pages of `/modmail`, parsing each response. Each page involves
a `fetch` + DOM parse via `ingestCurrentModmailPage`. This is already async
and throttled at 1.5 s/page. The bottleneck is network, not CPU. **Not a
compute problem — offscreen doesn't help.**

**Candidate C — `runInboxIntelPass` + `syncCapturedToWorker` (L11152)**
Iterates up to 10 modmail thread fetches per poll cycle, computes SHA-256
signatures via `crypto.subtle` (already async), and writes to IndexedDB. All
async. No synchronous CPU block. **Not a candidate.**

**Candidate D — `JSON.parse(localStorage.getItem('gam_mod_log') || '[]')` (L21181)**
The mod log grows unbounded over a mod session. On long sessions the log can
reach hundreds of entries. The parse is synchronous and runs inside an
achievement-check IIFE at boot. If the log grows to thousands of entries this
becomes a blocking parse on the main thread. **Weak candidate** — at current
scale (hundreds of entries, each small) parse time is sub-millisecond. If v11
targets longer session durability or log persistence across sessions, this is
the first place to watch. A `requestIdleCallback` wrapper around the
achievement checks would address it with far less complexity than offscreen.

**Candidate E — `IntelDrawer` body rendering (L5174)**
Builds card sections from fetched user/thread/post data. All DOM manipulation,
no heavy CPU. **Not a candidate.**

### Verdict on offscreen migration
No current compute path in `modtools.js` justifies the operational complexity
of `chrome.offscreen.createDocument` (requires `offscreen` permission, async
message-passing bridge, additional manifest entry, additional file). The
extension's heavy work is network-bound, not CPU-bound. **Recommend: do not
add offscreen documents in v10.x.** Revisit if a future feature introduces
synchronous bulk text analysis (e.g., regex over full post history, ML
inference, CSV export of full audit log).

---

## Summary

| Rule | Status | Action Required |
|---|---|---|
| 79 — Memory logging | Not implemented | Add `_r79LogHeap()` to boot + health-check interval. S effort. |
| 80 — Listener leaks | One real leak | Fix `IntelDrawer` ESC handler: store ref, remove on `closeAllPanels` sweep. `_inboxPollTimer` and pattern-sync intervals are soft risks for v11. |
| 81 — Offscreen compute | Not warranted | No current compute path qualifies. Flag mod-log achievement parse for `requestIdleCallback` if log grows. |
