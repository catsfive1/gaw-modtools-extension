# UIUX2-12 -- Queue Popover v2 Design Spec
**Auditor:** UIUX2-12-QUEUE-POPOVER
**Skill:** ui-ux-pro-max (Bloomberg dense, moderation queue, inline triage, undo toast, skeleton loader, honest data-gap)
**Date:** 2026-05-10
**Base:** v10.12.3 `_showQueuePopover` (modtools.js L18320-18598)
**Output:** UIUX2-12_queue_popover.md sections A-H

---

## A. v10.12.3 Current State -- Code Audit

### What shipped vs. what UIUX-11 designed

The UIUX-11 spec was implemented faithfully on the client side. Confirmed present in the live code:

| Feature | Spec (UIUX-11) | v10.12.3 actual | Status |
|---|---|---|---|
| 2-line row structure (title+age / author+badges+actions) | Yes | L18475-18488 | DONE |
| Skeleton loader (3 rows, greyed buttons, correct height) | Yes | L18402-18423 | DONE |
| APPR / REM / OPEN buttons visible per row always | Yes | L18483-18488 | DONE |
| Undo toast on Remove with 5s countdown | Yes | L18425-18457 | DONE |
| Toast countdown clearInterval on popover close | Yes | L18584 | DONE |
| Data-gap state (honest: N items but data unavailable) | Yes | L18550-18558 | PARTIALLY -- see B |
| True empty state (queue_depth === 0) | Yes | L18547-18548 | DONE |
| Refresh button re-fetches + re-skeletons | Yes | L18576-18578 | DONE |
| Footer link /mod/queue not /queue | Yes | L18391 | DONE |
| Outside-click and Escape dismiss | Yes | L18589-18597 | DONE |
| Undo interval cleanup on close | Yes | L18584 | DONE |
| depthStr with tilde fallback for null queue_depth | Yes | L18542 | DONE |

### What the worker still returns

Worker `handleModQueueSnapshot` continues to return `{ ok: true, items: [], queue_depth: null, error: "queue items not stored in D1..." }`. The D1 migration from UIUX-11 Section C was not yet applied. The data path is the remaining blocker -- the client UI is ready for it.

---

## B. Critique -- What v10.12.3 Gets Right and Where It Slips

### Honest data-gap state -- PARTIALLY honest

**Issue 1: Data-gap link points to `/queue`, not `/mod/queue`.**

The data-gap fallback at L18556 hardcodes `/queue` as the manual review link:

```js
'<a href="/queue" target="_blank" ...>Open /queue →</a>'
```

The footer link (L18391) correctly points to `/mod/queue`. The data-gap CTA goes to the user-facing queue. A mod clicking it lands on the submission page, not the mod tool. The two links in the same popover point to different places. This is a regression from the UIUX-11 spec which called for `/mod/queue` (or `/mod` as fallback) everywhere.

**Severity:** Medium. Mods who hit the data-gap state will click an unhelpful link and have to navigate manually from the user-facing queue to the mod panel.

**Fix:** Change L18556 href from `/queue` to `/mod/queue`.

---

**Issue 2: Data-gap state lacks a Refresh button.**

When the D1 table is unpopulated, the data-gap body renders static text and a link. There is no way to re-probe the worker without closing and reopening the popover. Once `gaw_queue` exists and the worker starts returning data, a mod who already has the popover open in data-gap state cannot discover this without a manual dismiss-and-reopen cycle.

The Refresh button in the header is wired (L18576) but it calls `_fetchAndRenderQueue()` which re-renders the body -- this works. The problem is discoverability: the data-gap body CTA should visually invite a retry, not just a manual nav.

**Fix:** Add `[Retry]` button inside the data-gap body that calls `_fetchAndRenderQueue()`.

---

**Issue 3: Per-row button visibility on narrow viewports.**

`min-width: 380px` on the popover (L18327) keeps the layout intact for most viewports. The action group `[APPR][REM][OPEN]` sits in `margin-left: auto` flex right. On the minimum width, with a long author name and a report badge, the action group can be clipped by the row-line2 flex container because the author text has no max-width constraint.

Example worst-case row:
```
TruthSeeker99_longtime          3 rpt     [APPR][REM][OPEN]
```
The author flex item has no `overflow: hidden` or `max-width`, so it can push the actions group off the right edge if the container is exactly 380px.

**Fix:** Add `max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap` to `.gam-queue-author` in the injected CSS.

---

**Issue 4: Undo toast per-row insertion can stack if a mod rapidly removes multiple items.**

The undo toast is inserted `insertBefore(toast, row)`. If a mod fires Remove on two rows in rapid succession (within the 5s window), two toasts appear stacked in the body. This is visually coherent but there is no max-toast guard -- a fast mod hitting 10 removes generates 10 simultaneous toasts, each counting down independently.

**Severity:** Low -- mod queues are small (10 items shown). But visually, 3+ simultaneous toasts would push the body past its `max-height: 320px` scroll boundary and look like noise.

**Fix (v2):** Cap simultaneous toasts at 2. If a third Remove fires while 2 toasts are active, suppress the toast for the third (silently commit the remove) and show a brief inline notice: `"Multiple removals in progress."` This is a v2 concern, not a blocker.

---

**Issue 5: `snack()` call on Approve may throw silently and leave no feedback.**

At L18499, the Approve handler calls `snack('Approved: ' + label, 'success')` inside a `try { } catch(_) {}` that swallows the error. If `snack` is not in scope (scope varies by page context), the mod gets no confirmation. The row dims and disappears in 2s -- that is visual feedback -- but for accessibility (and for mods who tab away after clicking), the absence of a toast is a gap.

**Fix (v2):** Promote `snack` success call to the same undo-toast mechanism used for Remove. Both actions get a toast, but Approve's toast is read-only (no Undo button) and shorter (2s). This keeps feedback symmetric and accessible.

---

### What v10.12.3 gets definitively right

- **Skeleton loader is pixel-correct.** Three rows at `gam-queue-row` height with greyed button stubs (opacity 0.2, pointer-events inherited as disabled). No layout shift when data resolves. Matches UIUX-11 §D loading mockup exactly.
- **Undo toast mechanics are solid.** `clearInterval` on close (L18584) prevents timer leak. `onUndo` re-enqueues `withUndo(apiApprove)` correctly. Toast is inserted before the dimmed row, not appended at bottom -- spatially anchored to the actioned item.
- **depthStr tilde estimation** at L18542 correctly degrades: real count when `queue_depth != null`, tilde+firehose estimate when null. The tilde communicates approximation without hiding the gap.
- **Error handler** at L18534 uses `gamMakeError` with `retryFn: _fetchAndRenderQueue` -- error state is not a dead end.
- **CSS injection is idempotent** (guard at L18334) -- safe for multi-call scenarios.
- **ESC + outside-click dismiss** both correctly call `_closePop()` which clears intervals before removing the DOM node.

---

## C. v2 Delta -- Changes Over v10.12.3

These are the only changes needed. The base is sound.

| ID | Change | Priority | Lines affected |
|---|---|---|---|
| C1 | Fix data-gap CTA href `/queue` -> `/mod/queue` | HIGH | L18556 |
| C2 | Add `[Retry]` button in data-gap body | MEDIUM | L18550-18558 |
| C3 | Add `max-width + overflow ellipsis` to `.gam-queue-author` in inline CSS | MEDIUM | L18345 |
| C4 | Cap simultaneous undo toasts at 2 | LOW | `_queueAction` / REM handler |
| C5 | Promote Approve feedback to 2s read-only toast (same toast system, no Undo button) | LOW | L18499 |

C1 is the only one with a correctness impact (broken link). C2-C5 are quality improvements for v2. Recommend shipping C1+C3 in this pass, C2+C4+C5 in a follow-up.

---

## D. Visual Spec -- v2 States

### D.1 Normal state (data loaded, 4 rows)

```
+----------------------------------------------------------+
| QUEUE -- 14 PENDING                      [Refresh]  [x] |
+----------------------------------------------------------+
| WH Comms Ahead of Jobs Report -- Red Flag?          2m  |
| TruthSee...         3 rpt               [APPR] [REM] [OPEN] |
+----------------------------------------------------------+
| Globalists Met Last Night in Basel                  7m  |
| Q_Patriot_777                           [APPR] [REM] [OPEN] |
+----------------------------------------------------------+
| mRNA causes [CENSORED] -- Harvard study link        14m |
| NWO_Hunter          1 rpt               [APPR] [REM] [OPEN] |
+----------------------------------------------------------+
| What is everyone's take on the latest EO?           31m |
| Patriot_Mike                            [APPR] [REM] [OPEN] |
+----------------------------------------------------------+
| Open /mod/queue ->                                       |
+----------------------------------------------------------+
```

Author chip now has max-width 120px + ellipsis (C3) -- "TruthSeeker99_longtime" truncates to "TruthSee..." before crowding the action group.

---

### D.2 Loading state (skeleton, 3 rows)

```
+----------------------------------------------------------+
| QUEUE -- LOADING...                                 [x] |
+----------------------------------------------------------+
| [__________________________________________]    [____]   |
| [____________]                [APPR] [REM] [OPEN]       |
+----------------------------------------------------------+
| [__________________________________________________]    |
| [__________________]          [APPR] [REM] [OPEN]       |
+----------------------------------------------------------+
| [____________________________________________]  [____]   |
| [________]                    [APPR] [REM] [OPEN]       |
+----------------------------------------------------------+
```

Skeleton bars = `#2a2825`. Buttons shown at opacity 0.2, disabled. No Refresh button during load (Refresh button not yet rendered -- it is rendered on mount but should be grayed during the initial RPC round-trip). See C-note below.

**C-note:** Current code renders Refresh immediately and it is clickable during load. A second click during the initial RPC fires a second `rpcCall` and clears the skeleton body, causing a visible flash. Fix: set `refreshBtn.disabled = true` at start of `_fetchAndRenderQueue()`, re-enable in `.then()` and `.catch()`.

---

### D.3 Data-gap state (D1 table missing -- current real state)

```
+----------------------------------------------------------+
| QUEUE -- ~14 ITEMS (estimate)                       [x] |
+----------------------------------------------------------+
|                                                          |
|  14 items pending but row data unavailable.              |
|  The mod queue D1 table has not been populated yet.      |
|                                                          |
|  [Open /mod/queue ->]          [Retry]                   |
|                                                          |
+----------------------------------------------------------+
```

Changes from v10.12.3:
- CTA link now `/mod/queue` (C1)
- Added `[Retry]` button calls `_fetchAndRenderQueue()` (C2)
- Body copy more explicit: "D1 table has not been populated" vs vague "row data unavailable" -- mods should know this is an infrastructure gap, not a transient error.

Colors:
- Amber headline (`#ffd84d`) kept -- signals warning, not error
- `[Retry]` button: same style as `[Refresh]` header button (muted border, `#5a5752` text)
- `[Open /mod/queue ->]` amber border (#ff9933), same as v10.12.3

---

### D.4 Remove actioned -- undo toast + dimmed row

```
+----------------------------------------------------------+
| QUEUE -- 14 PENDING                      [Refresh]  [x] |
+----------------------------------------------------------+
| WH Comms Ahead of Jobs Report           [APPR] [REM] [OPEN]| <- dimmed 35%
| TruthSee...         3 rpt               [APPR] [REM] [OPEN]|
+----------------------------------------------------------+
| Removed: Globalists Met Last Night -- Undo (4s)          | <- toast (green border)
+----------------------------------------------------------+
| Globalists Met Last Night in Basel                  7m  | <- dimmed 35%
| Q_Patriot_777                           [APPR] [REM] [OPEN]|
+----------------------------------------------------------+
| mRNA causes [CENSORED]                  [APPR] [REM] [OPEN] |
+----------------------------------------------------------+
```

Toast sits between the row above and the dimmed row. Countdown ticks every 1s. "Undo" is underlined green, clickable. After 5s: toast auto-removes, row fades (400ms), then `row.remove()`.

---

### D.5 Approve actioned -- 2s read-only toast (v2, C5)

```
+----------------------------------------------------------+
| QUEUE -- 14 PENDING                      [Refresh]  [x] |
+----------------------------------------------------------+
| Approved: WH Comms Ahead of Jobs Report (2s)             | <- read-only toast, green border
+----------------------------------------------------------+
| WH Comms Ahead...                       [APPR] [REM] [OPEN]| <- dimmed 35%
| TruthSee...         3 rpt                                   |
+----------------------------------------------------------+
```

No Undo button. Toast border `#44dd66` (same as remove toast but text reads "Approved:"). Fades with the row after 2s. Provides accessible text feedback without requiring `snack()` availability.

---

## E. CSS Delta (additive to v10.12.3)

Only two rules need to change or be added to the inline CSS injected at L18337-18361.

### Change 1: Author max-width (C3)

Replace current:
```css
.gam-queue-author{color:#66ccff;cursor:pointer;text-decoration:none}
```
With:
```css
.gam-queue-author{color:#66ccff;cursor:pointer;text-decoration:none;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block}
```

### Change 2: Read-only approve toast variant (C5, optional in this pass)

Add rule:
```css
.gam-queue-approve-toast{background:#131316;border:1px solid #44dd66;padding:6px 10px;font-size:9px;color:#e8e6e1}
```

No other CSS changes required. All existing rules are correct.

---

## F. JS Delta (additive to v10.12.3)

### F.1 Fix data-gap CTA href (C1 -- one character change)

In `_fetchAndRenderQueue`, data-gap branch at L18556:

Change:
```js
'<a href="/queue" target="_blank" rel="noopener" style="...">Open /queue →</a>'
```
To:
```js
'<a href="/mod/queue" target="_blank" rel="noopener" style="...">Open /mod/queue →</a>'
```

### F.2 Add Retry button to data-gap body (C2)

After building `gapWrap`, before `body.appendChild(gapWrap)`, add:

```js
const retryBtn = document.createElement('button');
retryBtn.style.cssText = 'background:transparent;border:1px solid #3d3a35;color:#5a5752;padding:2px 10px;font:600 9px ui-monospace,monospace;letter-spacing:0.04em;text-transform:uppercase;cursor:pointer;margin-top:8px';
retryBtn.textContent = 'Retry';
retryBtn.addEventListener('click', function() { _fetchAndRenderQueue(); });
gapWrap.appendChild(retryBtn);
```

### F.3 Disable Refresh during load (C-note from D.2)

At the top of `_fetchAndRenderQueue()`:
```js
function _fetchAndRenderQueue() {
  refreshBtn.disabled = true;   // ADD: prevent double-fire during load
  body.innerHTML = '';
  body.appendChild(_buildSkeleton(3));
  // ...
```

In the `.then()` handler, after `body.innerHTML = ''`:
```js
  refreshBtn.disabled = false;  // ADD
```

In the `.catch()` handler:
```js
  refreshBtn.disabled = false;  // ADD
```

### F.4 Approve read-only toast (C5 -- optional this pass)

Replace the `snack()` call in the Approve handler (L18499) with an inline toast:

```js
// Replace this:
try { snack('Approved: ' + label, 'success'); } catch(_) {}

// With this:
const aToast = document.createElement('div');
aToast.className = 'gam-queue-approve-toast';
aToast.textContent = 'Approved: ' + label;
if (row.parentNode) row.parentNode.insertBefore(aToast, row);
setTimeout(function() { if (aToast.parentNode) aToast.remove(); }, 2000);
```

---

## G. Unchanged -- Do Not Touch

These parts of v10.12.3 are correct and should not be modified in this pass:

- Popover positioning logic (L18328-18331) -- correct anchor calculation
- `_buildSkeleton` function -- matches spec, no changes needed
- `_buildUndoToast` function -- timer management, onUndo wiring all correct
- `_fadeRemoveRow` function -- parentNode guard at L18461 prevents errors on already-removed rows
- `_closePop` interval cleanup at L18584 -- correct
- ESC + outside-click dismiss (L18589-18597) -- correct
- All CSS except the two delta rules in E -- correct
- RPC call signature `rpcCall('modGetQueueSnapshot', { limit: 10 })` -- matches worker interface

---

## H. Implementation Sequence and Effort

### H.1 Immediate (this pass -- blocking correctness)

| Task | Change | File | Est. |
|---|---|---|---|
| Fix data-gap link `/queue` to `/mod/queue` | C1 | modtools.js L18556 | 2 min |
| Add author max-width to inline CSS | C3 | modtools.js L18345 | 5 min |
| Add Retry button to data-gap body | C2 | modtools.js L18550-18558 | 10 min |
| Disable Refresh during RPC load | C-note | modtools.js `_fetchAndRenderQueue` | 5 min |

**Total: ~22 min. These are all single-function edits inside `_showQueuePopover`.**

### H.2 Follow-up (quality pass -- not blocking)

| Task | Change | Est. |
|---|---|---|
| Approve read-only toast replacing snack() | C5 | 15 min |
| Toast cap at 2 simultaneous | C4 | 20 min |

**Follow-up total: ~35 min.**

### H.3 Backend blocker (unchanged from UIUX-11 -- still unblocked)

The D1 migration, firehose write path, and `handleModQueueSnapshot` query update from UIUX-11 Section C are the only things that will make real rows appear. The client UI is fully ready. All four UIUX-11 backend tasks still need to be applied:

1. Run `gaw_queue` migration SQL (UIUX-11 §C -- ~20 min)
2. Add firehose upsert when posts enter queue status (~1.5h)
3. Replace `handleModQueueSnapshot` stub query (~30 min)
4. Wire queue row status update on approve/remove actions (~1h)

The data-gap state (D.3 in this doc) is the live state until those land. After they land, D.1 is the live state with no further client changes required.

---

### H.4 Risk flags carried forward from UIUX-11 (no change in assessment)

1. **Firehose queue signal reliability** -- the firehose may not reliably see `mod_reports` field. Recommend a `/mod/refresh-queue` worker endpoint that polls the site's modqueue API as an authoritative backfill. This mitigates a sparse `gaw_queue` table.

2. **Undo timer leak on early close** -- already mitigated in v10.12.3 at L18584 (`pop._undoIntervals.forEach(clearInterval)`). No action needed.

3. **`/mod/queue` path validity** -- confirm this route exists in the mod panel before shipping the footer link. If not, use `/mod` as fallback. The current link (correctly `/mod/queue`) will 404 if the route is not registered.

4. **`withUndo` tier 'B' for Approve** -- non-destructive, confirm tier is appropriate. Current code at L18497 uses `'B'`. No change recommended without understanding the tier priority queue behavior.
