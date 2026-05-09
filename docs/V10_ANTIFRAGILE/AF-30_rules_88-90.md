# AF-30 — Rules 88-90: Synchronous Blocking, Backpressure, Low-Resource States

**Suite:** Anti-Fragile (AF) | **Mode:** AUDIT-ONLY | **Version:** 10.5.1 | **Date:** 2026-05-09

---

## Rule 88 — Synchronous Blocking Calls

### Top 5 findings

**1. `computeWordScore` — nested O(n*m) synchronous loop (L6866–6887)**

Every call walks all comments and for each comment runs `TROUBLE_WORDS.forEach` (18 entries) with `.includes()`. The outer loop is unbounded — the caller at L7640 caps at 25 comments, but the Intel panel at L7103 passes whatever the API returns. With 200+ comments (not unusual for a flagged account), this executes ~3,600 substring searches synchronously on the main thread. Not jank-inducing today with 18 words, but the cost doubles with every word added to the list. Trivially fixable by building one combined regex once at module load.

**2. Base64 chunked loop in `captureEvidence` (L7028–7033)**

```js
for (let i = 0; i < payloadBytes.length; i += CHUNK) {
  bin += String.fromCharCode.apply(null, payloadBytes.subarray(i, i + CHUNK));
}
```

The code notes the 0x8000 chunking was added to "avoid single-char loop pathology," which is correct. The cap is `EVIDENCE_MAX_BYTES = 50 KB`. At 50 KB / 32 KB chunks that is 2 iterations — effectively zero risk today. However the byte cap is enforced via `TextEncoder().encode(html)` first (itself synchronous on the full outerHTML string, up to 50 KB), then a second encode of the assembled payload. Two sequential TextEncoder passes on up to 100 KB combined. No async escape hatch. Low severity given the hard cap; document and leave alone unless the cap is raised.

**3. `annotateQueueReports` — synchronous DOM scan before the concurrency gate (L13352–13355)**

```js
const items = document.querySelectorAll('.post[data-id], .comment[data-id]');
const q = Array.from(items).filter(i => !i.dataset.gamReportsAnnotated);
```

On a 100-item queue page, this is a synchronous `querySelectorAll` + `Array.from` + `.filter` pass blocking the main thread. The result set is then fed through a CONCURRENCY=3 async worker pool, which is correct. The DOM scan itself is not jank-inducing but it runs inline on page load alongside `runDeepQueueAnalysis` and several other `querySelectorAll` sweeps. Worth wrapping in `queueMicrotask` or `requestIdleCallback` to defer past the initial paint.

**4. `runDeepQueueAnalysis` — full DOM scan + `getContentText` sync on every item (L13417–13418)**

```js
const items = Array.from(document.querySelectorAll('.post[data-id], .comment[data-id]'))
  .filter(i => !i.dataset.gamDeepDone);
```

Same pattern as #3, but called concurrently with it at page-load time. The CONCURRENCY=2 gate controls AI calls but the initial collection is synchronous. On a 100-item queue this is two independent `querySelectorAll` sweeps executing synchronously within the same event loop tick. Consolidating them into a single shared sweep would halve the blocking budget.

**5. `buildActionStrip` called in a synchronous `.forEach` over all queue items (L9593)**

```js
document.querySelectorAll('.post, .comment').forEach(buildActionStrip);
```

`buildActionStrip` is not async but it creates DOM nodes and sets innerHTML on every item. On a dense queue page this is a long synchronous microtask. No `requestIdleCallback` or batching — it runs to completion before the browser can repaint. If the queue has 80 posts this processes all 80 in one uninterrupted sync call.

### What was NOT found

The specific pattern `JSON.parse(document.documentElement.outerHTML)` does not exist. `outerHTML` access is scoped to individual queue items (L7016) with a 50 KB hard cap, not the full document.

---

## Rule 89 — Backpressure for Streaming / Firehose Ingest

### Firehose loop (L21803–21880)

The firehose is a serial async loop — one `fetchAsHtml` at a time, throttled at `FIREHOSE_THROTTLE_DEFAULT = 1500ms` per page. Ingest to the worker fires when the in-memory buffer reaches `FIREHOSE_BATCH = 40` posts. There is no concurrent fetch parallelism. This design is **correctly backpressured at the fetch level** — no firehose-side concern.

The worker side caps at `FIREHOSE_MAX_BATCH = 500` (documented in the task brief; the client constant is 40, so batches never approach the server ceiling under normal operation). Gap: there is no client-side check for worker rejection/rate-limit feedback. If the worker returns a non-2xx the firehose increments `_firehoseState.errors` and continues immediately to the next throttle wait. A sustained 429 or 503 from the worker causes the client to keep pushing on the 1.5s cadence with no exponential backoff. This is the real backpressure gap.

### `/gaw/posts/ingest` from queue pages — the actual audit question

The task asks: when a mod hits a busy 100-post queue page, do all 100 fire concurrently?

**Answer: No, but not because of intentional backpressure.**

The `/gaw/posts/ingest` endpoint is called only by `pushPostsBatch` inside `firehoseLoop`. Queue-page post data is not individually POSTed to `/ingest` — the firehose crawls `/new`, not the queue. What does fire concurrently on queue pages is `annotateQueueReports` (CONCURRENCY=3 gate, L13356) and `runDeepQueueAnalysis` (CONCURRENCY=2 gate, L13434). Both have explicit concurrency limits. Those worker calls go through `rpcCall`/`apiGetReports`, not `/ingest`.

There is no code path where 100 queue items fire 100 concurrent `fetch` calls to `/ingest`. The ingest surface is firehose-only and serial. **No fix needed here.**

### Missing: worker error → backoff signal

The firehose error handler (L21869–21872):
```js
} catch (e) {
  console.error(`[firehose] page ${page} failed`, e);
  _firehoseState.errors++;
  await new Promise(r => setTimeout(r, 10000));
}
```

Page-fetch failures wait 10s, but `pushPostsBatch` failures (L21862) wait zero seconds before the next throttle window. If the worker is down, the client hammers it on every 1.5s cycle until `_firehoseState.abort` is set. Proposal: detect HTTP 429/503 in `pushPostsBatch`, surface a `retryAfter` signal to `firehoseLoop`, and pause for `Math.min(retryAfter || 60000, 300000)` before resuming.

---

## Rule 90 — Low-Memory / Low-Battery Device States

### Current state

Neither `navigator.getBattery()` nor `navigator.deviceMemory` appear anywhere in the codebase. There is no low-resource mode. The ambient modmail prefetch (`_ambientModmailPrefetch`, L15361) fires on a 10-minute `setInterval` with no visibility or resource checks beyond `document.visibilityState === 'hidden'`. Animations (skeleton shimmer, toast transitions, panel slide-ins) are CSS-driven and unconditional — no `prefers-reduced-motion` guard except the single CSS comment at L3960 which notes the `@media` guard without verifying it is actually applied.

### Proposed flag: `LOW_RESOURCE_MODE`

**Battery detection — Chromium only, not in Firefox/Safari:**

```js
async function detectLowResource() {
  let lowBattery = false;
  try {
    if (navigator.getBattery) {
      const batt = await navigator.getBattery();
      lowBattery = !batt.charging && batt.level < 0.20;
      batt.addEventListener('levelchange', () => {
        const nowLow = !batt.charging && batt.level < 0.20;
        if (nowLow !== lowBattery) { lowBattery = nowLow; applyResourceMode(nowLow); }
      });
    }
  } catch (_) {}
  return lowBattery;
}
```

**Memory hint — `navigator.deviceMemory` (Chrome 63+, not Firefox/Safari):**

Returns a rough bucket: `0.25 | 0.5 | 1 | 2 | 4 | 8` GB. Values at or below `1` indicate a constrained device. This is a hint only — it is not real-time and cannot detect memory pressure mid-session. Use as a one-time check at init.

```js
const LOW_MEMORY_HINT = (navigator.deviceMemory || 8) <= 1;
```

**What to suppress when `LOW_RESOURCE_MODE` is active:**

| Feature | Normal | Low-resource |
|---|---|---|
| Skeleton shimmer animation | CSS `animation: 2s linear infinite` | `animation: none` via body class |
| Toast CSS transitions | `opacity 180ms, transform 180ms` | removed (`transition: none`) |
| Panel slide-in transitions | `transform 0.2s ease-out` | removed |
| `_ambientModmailPrefetch` | 10-min setInterval | disabled entirely |
| Firehose auto-start | boots 3s after init | deferred until user manually starts |
| `runDeepQueueAnalysis` | auto on queue page load | disabled (mod must opt in per-session) |

Apply via a single `document.body.classList.add('gam-low-resource')` and CSS overrides:

```css
.gam-low-resource * { animation: none !important; transition: none !important; }
```

**Memory pressure — no direct API.** `performance.memory` (Chrome-only, non-standard) exposes `usedJSHeapSize` / `jsHeapSizeLimit`. A ratio above 0.85 is a soft signal. This should not gate core mod actions — only ambient/prefetch features. Do not block ban/approve/remove flows under any resource state.

**Browser support reality check:**

- `navigator.getBattery()`: Chrome/Edge only. Firefox removed it in v52 (fingerprinting concern). Safari never shipped it.
- `navigator.deviceMemory`: Chrome/Edge only. Always returns `undefined` in Firefox and Safari — the `|| 8` fallback ensures no suppression on those browsers.
- Both APIs should be wrapped in `try/catch` with a permissive fallback (assume not low-resource) so the guard never blocks functionality on unsupported browsers.

**Implementation scope:** Approximately 60 lines — `detectLowResource()` async init, one `applyResourceMode(bool)` function that sets/clears the body class and cancels the ambient `setInterval` handle, and one CSS rule block. No architectural change required.

---

## Summary Table

| Rule | Finding | Severity | Action |
|---|---|---|---|
| 88 | `computeWordScore` nested O(n*m) sync loop | Low | Precompile single regex at module load |
| 88 | `buildActionStrip` forEach over all items sync | Low | Wrap in `requestIdleCallback` |
| 88 | Two parallel `querySelectorAll` sweeps on queue load | Low | Consolidate into one shared sweep |
| 88 | Evidence capture double TextEncoder pass | Negligible | Document only; cap is 50 KB |
| 89 | Firehose no backoff on worker 429/503 | Medium | Add exponential backoff in `pushPostsBatch` |
| 89 | 100-post queue page concurrent ingest? | None | Confirmed not a real code path |
| 90 | No `navigator.getBattery()` / `deviceMemory` usage | Gap | Implement `LOW_RESOURCE_MODE` flag (60 lines) |
| 90 | Ambient prefetch not suppressed on constrained devices | Low | Disable when `LOW_RESOURCE_MODE` active |
| 90 | Animations not suppressed on constrained devices | Low | CSS body-class override when flag active |
