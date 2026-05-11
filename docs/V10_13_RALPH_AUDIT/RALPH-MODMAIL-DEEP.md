# RALPH-MODMAIL-DEEP -- 100-Thread Day Audit Post v10.13.4

**Auditor:** RALPH-MODMAIL-DEEP (read-only)
**Date:** 2026-05-10
**Repo:** `D:\AI\_PROJECTS\modtools-ext\` (HEAD `9c7655e`, manifest v10.13.4)
**Scope:** Re-audit of UIUX2-40 critical-path bottlenecks on a 100-thread modmail day, against what Wave 4 actually shipped.
**Sources:** `modtools.js` (27,671 lines), `popup.js`, `docs/V10_DESIGN_V2/UIUX2-40_modmail_deep.md`, `DESIGN_V2_SHIPMASTER.md` Section 5 Wave 4 + Section 6 Backlog, peer audit `RALPH-MODMAIL.md`.

---

## Summary

UIUX2-40 named **four critical-path breaks** that make a 100-thread modmail day painful or impossible. Wave 4 closed **two minor and one major** of those, but the headline 100-thread bottlenecks remain. The panel is still a "competent draft-review tool, not a 100-thread workstation" -- which UIUX2-40 itself predicted.

### Closed by W4

| UIUX2-40 break | W4 disposition |
|---|---|
| **AI cold-cache 3-5s dead zone** (E4) | CLOSED. 4-ghost shimmer grid renders on `[Generate 4 AI replies]` click (modtools.js:17338-17348). |
| **Cold-session draft loss after SW restart** (E1, P0-A.2) | CLOSED. Panel renderDetail (17302-17318) and popover loadList (17515-17528) both read `gam_modmail_drafts_local` on session miss, surface "Draft restored from local" chip (17324-17331). |
| **AI-tracking analytics under-reported on pre-fetched path** (E8 / R-13) | CLOSED. Pre-fetched useBtn now fires `modmailTrackResponse` with `ai_used:1, ai_tone` (17642-17656), mirroring fresh-fetch path (17389-17396). |
| **Intel strip race on async user-leaves-thread** | CLOSED. `_renderIntelStrip` captures strip element at call time and has `if (!strip.isConnected) return;` guard before chip writes (17408-17449). |
| **AI cards 2-up cramped at 320px col 3** (E7) | CLOSED. `host.closest('#gam-mmp-ai')` detection forces `grid-template-columns:1fr` in col 3 (17381-17383). Note: shimmer ghost grid at 17340 still hardcodes `1fr 1fr` -- minor inconsistency (3 lines below). |

### Open after W4 -- the 100-thread bottlenecks UIUX2-40 named

| UIUX2-40 break | Status | SHIPMASTER disposition |
|---|---|---|
| **#1 Popover cap at 15 threads, no pagination** | OPEN. modtools.js:17549 `rpcCall('modmailRecent', { limit: 15 })`. No load-more, no IntersectionObserver, no scroll-trigger. | Not in W4 scope; not in any deferred ID. **Untracked.** |
| **#2 Panel cap at 30 threads, no scroll-triggered load-more** | OPEN. modtools.js:17213 `rpcCall('modmailRecent', { limit: 30 })`. No scroll handler on `#gam-mmp-list`, no sentinel, no load-more button. | Deferred D-08 (`Modmail virtual scroll / scroll-triggered pagination`, ~M, "100-thread day not yet regular") and D-40 (`Modmail panel scroll-triggered pagination (separate from virtual)`, ~M, "ship before D-08"). |
| **#3 Ambient pre-fetch 3 threads / 10 min = 5.5h to warm 100 threads** | OPEN. modtools.js:17084 `limit:5`, 17101 `.slice(0,3)`, 20063 `setInterval(..., 10*60*1000)`. Identical to pre-W4. | Deferred (UIUX2-40 E14 batch-warm). No SHIPMASTER ID assigned. |
| **#4 AI-assisted reply requires 5 manual steps × 60 threads = 300 actions** | OPEN. `[Copy + open]` still copies clipboard + opens new tab; mod must paste + send + switch back manually. | Deferred D-09 (`Modmail compose row in panel + send-direct proxy`, ~XL, "v11 architectural decision needed"). |

W4 reduced step count for `[Mark SUS]` and `[DR 72h]` (eliminating 1-2 Mod Console detours per relevant thread), but the **5-step AI reply path is unchanged** for the 60% of threads where the mod uses an AI draft.

### W4 deviations from the original plan

- **Draft mirror TTL widened from 4h to 24h** in the read path (17313, 17523) -- the SHIPMASTER §9 risk callout permits this on `mirror.savedAt > Date.now() - 24h`. **However, popup.js purge logic still uses 4h TTL** for the same key (`DRAFT_TTL_MODMAIL_MS = 4*60*60*1000` at popup.js:7013). This is a contract split -- see Findings F4.

---

## Bottleneck Table -- 100-Thread Day Cost

The original UIUX2-40 §A trace, updated with W4-shipped reductions in **bold**.

| Step | Per-thread cost (pre-W4) | Per-thread cost (post-W4) | 100-thread cost (post-W4) |
|---|---|---|---|
| Pop the modmail popover | 1 click | 1 click | 1 click |
| Promote to full panel | 1 click | 1 click | 1 click |
| Click thread row to render detail | 1 click | 1 click | 100 clicks |
| Wait for AI cold-cache fetch (no shimmer) | 3-5s blocking | **3-5s with skeleton** -- perceived latency cut ~50% per ui-ux-pro-max | 5-8 min total |
| Read 4 AI cards, pick one | ~10s | ~10s | 17 min total |
| `[Copy + open]` -> new tab opens | 1 click | 1 click | 100 clicks |
| Switch tab to GAW thread | 1 switch | 1 switch | 100 switches |
| Locate reply textarea, paste, send | 3 actions | 3 actions | 300 actions |
| Switch back to panel | 1 switch | 1 switch | 100 switches |
| Optional: Mark SUS on bad-actor sender | **was** 5 steps via Mod Console | **2 clicks** via gam-mm-bar (BUT ONLY if mod opened thread on GAW) | 0-100 clicks |
| Optional: DR 72h on bad-actor sender | **was** 5+ steps via Mod Console | **2 clicks + arm** via gam-mm-bar (same caveat) | 0-100 clicks |
| **Total per AI-replied thread (60% of 100)** | ~7 actions + ~13s wait | ~7 actions + ~13s wait | ~420 actions + ~13min wait |
| **Mark SUS / DR 72h savings per relevant thread** | 0 (handled in Mod Console) | 3 fewer steps **only if** mod is already on GAW thread page | 0-60 saved actions |

**Net 100-thread-day savings from W4:** ~ten clicks of perceived latency relief from shimmer, ~3 saved steps × however many bad-actor threads landed on GAW (`/modmail/thread/<id>`) page. The extension's modmail panel itself does NOT have Mark SUS / DR 72h buttons; those live on the GAW DOM via `enhanceModmailRead()` (modtools.js:12340-12345 -- gated by `/modmail/thread/<id>/` route). On the panel-only flow, the 5-step AI reply path is unchanged.

---

## Findings

### F1 -- Pre-fetch rate is unchanged. UIUX2-40 §B.2 verdict still holds.

**Code:** modtools.js:17080-17120 (the `_ambientModmailPrefetch` function).

```js
const rec = await rpcCall('modmailRecent', { limit: 5 });
...
const need = threads.filter(...).slice(0, 3);  // pre-fetch at most 3 per cycle (AI budget)
```

modtools.js:20063: `setInterval(..., 10 * 60 * 1000);`

**Math:** 3 threads / 10 min = 18/hr = 100 in 5h33m. UIUX2-40 §B.2 said "this is not a pre-fetch -- it's a slow background trickle." Still true. UIUX2-40's E14 ("Batch warm on panel open: 10-thread first cycle, then maintenance") was rated S-effort and assigned P2 -- shipped nowhere.

**Severity:** HIGH on a 100-thread day. On a 30-thread day it's a non-issue, which is why it survived three audit waves.

---

### F2 -- Panel/popover thread caps unchanged. No load-more anywhere.

**Code:**
- modtools.js:17549 (popover): `rpcCall('modmailRecent', { limit: 15 })`
- modtools.js:17213 (panel): `rpcCall('modmailRecent', { limit: 30 })`

Searched for `IntersectionObserver` near modmail surfaces -- only matches are for `/queue` infinite scroll (modtools.js:15168, 15522) and not the modmail panel/popover. No sentinel, no load-more button, no scroll handler on `#gam-mmp-list`.

**Severity:** CRITICAL on day-start with 50+ threads. Mod sees 30, can't reach the other 20+ from inside the panel. UIUX2-40 §A.2 step 8 named this as a "structural cap." SHIPMASTER §6 D-40 acknowledges it ("ship before D-08") but no implementation lands in v10.13.x.

**Mitigation:** Mod can call `[Refresh]` after triaging the visible 30, but that re-fetches the same 30 most-recent (limit unchanged) -- not a paging mechanism.

---

### F3 -- AI rate limiting / concurrency guard never shipped.

**Code search:** `MAX_CONCURRENT|aiQueue|aiRate|backpressure` against modtools.js -- no matches in the modmail/AI surface. The `_ambientModmailPrefetch` `for (const t of need)` loop (17102-17114) is the only sequential AI call site. The on-demand `[Generate 4 AI replies]` button (17334-17361 panel; 17670-17714 popover) and `[✨ AI reply candidates]` popover button fire `rpcCall('modmailAiReplyForThread', ...)` directly with no debounce, no in-flight registry, no max-concurrency guard.

**Worker side:** UIUX2-40 §B.4 noted the proxy (`gaw-mod-proxy-v2.js`) has no rate-limit middleware on `modmailAiReplyForThread`. Not re-verified in this audit; UIUX2-40's claim remains the best-known source.

**Burst risk:** A power user clicking through 5 threads in rapid succession before any AI completes fires 5 × 4 = 20 parallel Llama calls. This is exactly the scenario UIUX2-40 §B.4 named.

**Severity:** MEDIUM (functional risk: 429s on burst, no UI retry path). HIGH on a 100-thread day with an impatient mod.

**SHIPMASTER disposition:** UIUX2-40 E13 (`AI request client-side queue (max 3 concurrent), ~50 lines, M effort`) is documented in the original audit. NOT in any v10.13 wave. NOT in SHIPMASTER §6 deferred backlog (D-08 through D-40). **Untracked.**

---

### F4 -- Draft mirror TTL split between writer (24h read) and purger (4h kill).

**The deviation:** UIUX2-40 E1 spec was "fall back to local mirror on cold session". SHIPMASTER §9 risk callout (line 658) gates restoration on `mirror.savedAt > Date.now() - 24h`. W4 implements this:

- modtools.js:17313 (panel renderDetail): `(Date.now() - (localStore.savedAt || 0)) < 24 * 60 * 60 * 1000`
- modtools.js:17523 (popover loadList): same 24h gate

**The contract split:** popup.js:7013 still has the OLD 4h TTL constant for the SAME storage key:

```js
var DRAFT_TTL_MODMAIL_MS = 4  * 60 * 60 * 1000;  // 4 hours
```

popup.js:7022-7023: when the popup opens, if `now - savedAt > 4h`, the entry is REMOVED from local storage:

```js
if (mmDraft && mmDraft.savedAt && (now - mmDraft.savedAt) > DRAFT_TTL_MODMAIL_MS) {
  await chrome.storage.local.remove('gam_modmail_drafts_local');
}
```

**Practical consequence:** if the mod opens the popup ANY time between hour-4 and hour-24 after the last draft mirror write, the popup's purge logic deletes the local mirror BEFORE the panel renderDetail can read it. The "24h survival" promise from W4 is violated as soon as the user opens the popup.

If the mod never opens the popup (only uses the on-page modmail panel), the 24h survival works. But the popup is the standard ModTools entry point -- it gets opened often.

**Severity:** HIGH for the cold-restart use case the W4 fix was specifically designed to solve. The bug is invisible on light days because the prefetch refreshes before 4h elapses. On a 100-thread day where the mod is heads-down for 6+ hours and then has a Chromium auto-update at hour-5: drafts vanish.

**Adjacent risk (stale-write-wins):** `_mirrorDraftToLocal` at modtools.js:25632-25638 writes the WHOLE drafts cache with a single `savedAt` timestamp:

```js
chrome.storage.local.set({ [localKey]: { drafts: drafts, savedAt: Date.now() } })
```

Each prefetch cycle (every 10 min) writes ALL cached drafts back to local mirror with a fresh `savedAt`. If thread #47 was drafted at hour-3 and thread #92 was drafted at hour-23, both share the latest `savedAt`. The 24h gate is per-mirror-write, not per-thread. So freshness is "youngest write wins," which is fine for restoration but **does NOT cause stale-write-wins** in the traced way (the prefetch refreshes the whole blob; it doesn't reach in and overwrite a specific thread with stale data).

**However:** the read flow at 17302-17318 reads `chrome.storage.session.get('gam_modmail_drafts')` FIRST, falls back to local mirror only on `!cached`. So a stale 23h-old mirror entry CANNOT override a 5-min-old session entry on the read path. On that count, the audit-prompt's hypothesis is **disproved** -- session-first ordering protects against the named override.

The real bug is the F4 TTL split, not session-vs-mirror precedence.

---

### F5 -- AI reply step count: 5 manual steps -> 5 manual steps. No reduction.

**Code:** modtools.js:17389-17400 (panel renderAICards `data-use-body` click handler) and 17640-17656 (popover pre-fetched useBtn).

The actual user flow:

1. Click `[Copy + open thread]` (1 step) -> clipboard write, `window.open(...)`, snack.
2. New tab opens at `https://greatawakening.win/modmail/thread/<id>` (auto, 0 steps).
3. Locate textarea on GAW thread (1 step).
4. Paste (Ctrl+V) (1 step).
5. Click Send on GAW (1 step).
6. Switch back to panel tab (1 step).

That's 5 manual steps unchanged from UIUX2-40 §A.3. SHIPMASTER §6 D-09 ("compose row in panel + send-direct proxy") is the planned fix and is explicitly v11 architectural scope. The W4 wave did not attempt to reduce step count on the AI reply path.

**Severity for 100-thread day:** This is the dominant friction. UIUX2-40 §A.3 calculated 60 threads × 5 steps = 300 manual actions -- still accurate post-W4.

**Mark SUS / DR 72h ergonomics did improve** (gam-mm-bar buttons), BUT only inside the GAW page DOM after `[Copy + open]` brings the mod to `/modmail/thread/<id>/`. The extension's own panel does NOT show Mark SUS / DR 72h on each thread row.

---

### F6 -- Power-user gaps from UIUX2-40 §C: 6 named, 0 closed by W4.

| UIUX2-40 §C gap | Status | SHIPMASTER ID |
|---|---|---|
| C.1 No send-direct path | OPEN | D-09 (v11) |
| C.2 No thread status optimistic update after Copy+open | OPEN. UIUX2-40 E8 was P1; not in any v10.13 wave. Untracked. | -- |
| C.3 No keyboard navigation between threads in panel | OPEN | UIUX2-40 E10 (P2 v10.14); no SHIPMASTER ID |
| C.4 No bulk action surface | OPEN | UIUX2-40 E18 (P3 v11 research); no SHIPMASTER ID |
| C.5 No macro injection in panel compose area | OPEN -- panel has NO compose area at all | D-09 (v11) |
| C.6 No risk chips inline in thread list rows | OPEN. modtools.js:17236-17269 panel row builder shows: who, status, subject, preview. NO ban_count, NO sus_flag, NO watch chip. | UIUX2-40 E11 (P2 v10.14) -- no SHIPMASTER ID assigned to this specific item; D-21 is the related "hover card" |

**Net W4 contribution to power-user gaps:** zero. All six items are open. UIUX2-40 §F.3 design verdict ("the panel is a competent draft-review tool, not a 100-thread-day workstation") is unaltered by W4.

---

### F7 -- Mod Console keyboard (W4) is irrelevant inside the modmail panel.

**Audit-prompt question:** does W4 Mod Console keyboard (number-key tab switch + Ctrl+Enter) help in the modmail panel?

**Code:** modtools.js:8245-8284 (`_mcKbHandler` registration + lifecycle).

```js
function _mcKbHandler(e){
  // Only fire when this Mod Console modal is open & in the DOM.
  if (!mc || !mc.isConnected) return;
  ...
}
document.addEventListener('keydown', _mcKbHandler, true);
```

The handler is gated on `mc.isConnected` (the Mod Console modal). When the modmail panel is open and Mod Console is closed, `mc.isConnected === false` and every keydown returns early. **Verified: zero behavioral effect on modmail panel/popover navigation.**

Mod Console is a separate modal (#gam-mc-panel), opened via `openModConsole(username, item, tab)`. From the modmail panel, the only path to Mod Console is the gam-mm-bar buttons on the GAW thread DOM (Ban / Note / Unban) -- which ALSO requires the mod to have already left the panel and opened the GAW thread.

**Severity:** N/A -- not a regression, just a non-fit. UIUX2-40 §C.3 (keyboard nav for thread list) requires a modmail-panel-specific handler that doesn't exist.

---

### F8 -- Shimmer skeleton inconsistency (minor).

modtools.js:17338-17348 (cold-fetch shimmer) hardcodes `grid-template-columns:1fr 1fr` for the 4 ghost cards, even when the host lives in `#gam-mmp-ai` (the 320px col 3 sidebar). The actual rendered AI cards at 17383 detect col 3 and use `1fr`. So during the 3-5s AI fetch, the shimmer shows 2-up at 320px (cramped); on success, the cards reflow to 1-col stacked.

**Severity:** LOW. Cosmetic mismatch during a 3-5s window. Not a correctness issue.

**Fix:** ~3 lines to apply the same `host.closest('#gam-mmp-ai')` detection in the shimmer block at 17340.

---

## Recommendations

Priority is **what would actually make the 100-thread day work**, not full UIUX2-40 closure.

### R1 -- Fix the F4 TTL contract split (LOW effort, HIGH leverage)

Two-line fix at popup.js:7013:

```js
var DRAFT_TTL_MODMAIL_MS = 24 * 60 * 60 * 1000;  // 24 hours -- match modtools.js read TTL
```

Eliminates the silent-purge-while-popup-opens regression. This is a SHIPMASTER §9 commitment that's already half-implemented; closing it costs nothing and unblocks the cold-restart promise W4 was sold on. Not currently in any deferred ID.

### R2 -- Ship D-40 (panel scroll-triggered pagination) as v10.13.5 hotfix

UIUX2-40 §D.1 already prescribed it: IntersectionObserver sentinel at the bottom of the thread list; on intersect, fetch next page of `modmailRecent` with offset. ~40 lines, M effort. This is the single change that flips the panel from "structurally capped at 30" to "100-thread-day workstation candidate." SHIPMASTER recognizes this as the prerequisite to D-08 virtualization.

Without this, the extension cannot pretend to support a 100-thread day.

### R3 -- Add a 10-thread first-cycle batch warm to `_ambientModmailPrefetch` (LOW effort)

modtools.js:17101 -- change `.slice(0, 3)` on the FIRST cycle to `.slice(0, 10)`, then revert to 3 on subsequent cycles via a module-scoped `_firstWarmDone` flag. UIUX2-40 E14, S-effort. Reduces 100-thread warmup from 5.5h to ~33 min after first panel open.

This is the highest-ROI prefetch tweak. The 4-parallel-call rate is the real Llama-budget concern, not the per-cycle batch size; 10 threads × 10-min cycle delay between is still well under any reasonable rate-limit.

### R4 -- Add inline risk chips to panel thread list rows (UIUX2-40 §C.6, E11)

modtools.js:17236-17269 row builder. The `_renderIntelStrip` function already fetches `ban_count`, `sus_flag`, `watching` via `getUserSummary`. Cache the result per-thread (it's already keyed in session storage as `gam_user_intel_<username>`) and back-populate the row chip on intel resolution.

Visual triage cuts the "click every thread to find the bad-actor" tax. M effort, P2 in UIUX2-40, but high practical leverage on a 100-thread day where 20% of threads are bad-actor escalations.

### R5 -- Add a client-side AI request queue (UIUX2-40 §B.4, E13)

modtools.js: introduce a module-scoped `_aiRequestQueue` with `MAX_CONCURRENT_AI = 3`. Wrap `rpcCall('modmailAiReplyForThread', ...)` in a queue gate. On burst clicks (5 threads in 2 seconds), the 4th and 5th wait for one of the first three to resolve.

UIUX2-40 named this as L effort (50 lines). Currently UNTRACKED in SHIPMASTER -- this is a recommendation to add it. Hardens the system against the worker-side rate-limit risk that SHIPMASTER acknowledges but doesn't fix.

### R6 -- Cosmetic: align shimmer grid with cards grid (F8)

modtools.js:17340 -- one line:

```js
grid.style.cssText = 'display:grid;grid-template-columns:' + (aiHost.closest('#gam-mmp-ai') ? '1fr' : '1fr 1fr') + ';gap:4px;margin-top:4px';
```

Closes a 3-5s perceived inconsistency. XS effort. Not blocking 100-thread-day.

---

## Disposition Summary

| UIUX2-40 finding | UIUX2-40 priority | W4 outcome |
|---|---|---|
| §A.1 popover cap 15, no pagination | implicit P1 | OPEN, untracked |
| §A.1 panel cap 30, no scroll-load-more | implicit P0 for 100-thread | OPEN, deferred D-40 / D-08 |
| §A.1 ambient prefetch 3/10min trickle | P2 (E14) | OPEN, no SHIPMASTER ID |
| §A.3 cold AI 3-5s dead zone | P1 (E4) | CLOSED via shimmer grid |
| §A.3 AI cards 2-up cramped at 320px | P1 (E7) | CLOSED for cards, OPEN for shimmer grid |
| §A.3 5-step AI reply path | P2 (E16, v11) | OPEN, deferred D-09 (v11) |
| §A.4 cold-session draft loss | P0 (E1) | CLOSED with TTL split bug (F4) |
| §A.5 macro injection unavailable in panel | P2 (E15, v11) | OPEN, deferred D-09 (v11) |
| §A.6 sender intel inline drilldown | P2 (E12, E11) | OPEN, deferred D-21 (hover card) |
| §A.7 stale draft cache by afternoon | P2 (TTL audit) | F4 bug makes this WORSE if popup opened mid-day |
| §B.1 DOM bloat at limit > 50 | P2 (E17) | N/A -- limit not raised |
| §B.2 prefetch can't scale | P2 (E14) | OPEN |
| §B.3 draft sync session vs mirror gap | P0 (E1) | CLOSED with F4 caveat |
| §B.4 AI rate-limit exposure | P2 (E13) | OPEN, untracked |
| §C.1-C.6 power-user flow gaps | mixed P1/P2 | 0 of 6 closed |
| §D.1 virtualization for 100+ threads | P2 (E17) | OPEN, deferred D-08 |
| §F.3 panel must own the full reply loop (V11 direction) | architectural | unchanged |

**Net post-W4 verdict:** UIUX2-40's overall design conclusion ("the current panel is a competent draft-review tool. It is not a 100-thread-day workstation.") **stands unchanged.** W4 was a quality and correctness wave -- it polished the cold-cache experience and closed three regressions (R-13, R-14, R-15). It did not move the 100-thread-day bottleneck.

The minimum closure for an honest "100-thread workstation" claim is R1 + R2 + R3 -- three patches totaling ~M effort -- plus the v11 architectural pivot (D-09) for the 5-step AI reply path. Until R2 lands, the panel structurally caps at 30 visible threads and the marketing language for 100-thread support cannot be defended.

---

*RALPH-MODMAIL-DEEP complete. 1 silent regression (F4), 5 named-but-deferred bottlenecks, 6 recommendations. Read-only audit; no code or git changes performed.*
