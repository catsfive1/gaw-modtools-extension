# UIUX-11 — Queue Popover Redesign (Per-Row Triage — Approve / Remove / Open)
**Auditor:** DESIGN-11-QUEUE-POPOVER
**Skill invoked:** ui-ux-pro-max (moderation queue popover with inline triage actions — Approve/Remove/Open per row, with Undo toast, Bloomberg dense layout)
**Date:** 2026-05-10
**Affects:** `modtools.js` `_showQueuePopover()` (~L17465–17614), `cloudflare-worker/gaw-mod-proxy-v2.js` `handleModQueueSnapshot()` (~L1284–1305)

---

## A. Current State Critique — Count-Only Is a Dead End

### What exists right now

`_showQueuePopover` opens from the ticker bar's `queue` chip. The flow:

1. Mounts a popover immediately with the header `QUEUE — N ITEMS` where N comes from `_firehoseState.postsQueued` (a count, not real data).
2. Fires `rpcCall('modGetQueueSnapshot', { limit: 10 })` async.
3. Worker `handleModQueueSnapshot` returns:
   ```json
   { "ok": true, "items": [], "queue_depth": null,
     "error": "queue items not stored in D1 -- count-only display available via /mod/stats" }
   ```
4. Client receives `items: []` and renders: "Queue is empty" — even when the queue is not empty.
5. Footer has a dead link: `Open full /queue page` (opens `/queue`, which is the site's user-facing submission queue, not a mod tool).

The action buttons (`Approve`, `Remove`, `Open`) at L17571–17590 are wired, call `withUndo` / `apiApprove` / `apiRemove`, and have correct interaction logic — **but they never render** because `items` is always empty.

### Why count-only is a dead end

| Failure mode | Impact |
|---|---|
| Header says "14 ITEMS", body says "Queue is empty" | Actively misleading — looks like a bug to mods |
| No titles, no authors, no ages visible | Zero triage signal; mod must navigate to `/queue` to do any work |
| Action buttons exist in code but never fire | Wasted engineering — the hardest part (wiring `withUndo`, `apiApprove`, `apiRemove`) is already done |
| `/queue` footer link opens the user-facing queue page | Wrong destination — no mod tooling at that URL |
| Queue depth is null from worker | Can't even trust the count in the header |
| No Undo toast on any action | Fire-and-forget — accidental approve has no recovery |

**The root problem is architectural, not cosmetic:** the worker returns `items: []` because `gaw_queue` does not exist as a D1 table. The client-side interaction layer is finished. The data layer is the gap. This design doc specifies both the D1 schema needed and the full UI once data flows.

---

## B. Redesign — Per-Row Triage with Bloomberg Dense Layout

### Design principles (from ui-ux-pro-max)

- **Primary action always visible** (§4 `primary-action`): Approve and Remove are one click from collapsed state — never hidden behind expand.
- **Undo for destructive actions** (§8 `undo-support`): Remove is irreversible without an undo path; toast with 5s countdown is mandatory.
- **Dense but not cramped** (§6 `whitespace-balance`): Bloomberg terminal aesthetic — max data per row, 4px/8px spacing rhythm, no decorative padding.
- **Feedback within 100ms** (§3 `tap-feedback-speed`): Row dims immediately on action; do not wait for the API round-trip.
- **Error recovery** (§8 `error-recovery`): Failed approve/remove shows inline retry, not a silent failure.
- **No color-only meaning** (§1 `color-not-only`): Approve is green with `APPR` label; Remove is red with `REM` label; color reinforces but text carries the meaning.

### Row information architecture

Each queue row renders in two physical lines (26px total row height including border):

```
LINE 1  [title — truncated at ~52 chars]      [age]
LINE 2  [author chip]  [report badge?]         [APPR] [REM] [OPEN]
```

Field definitions:

| Field | Source | Format | Notes |
|---|---|---|---|
| `title` | `gaw_queue.title` | max 52 chars, ellipsis | Fall back to `snippet` if null |
| `age` | `gaw_queue.queued_ts` | `timeAgo()` output | Right-aligned, muted color |
| `author` | `gaw_queue.author` | accent blue chip | Clickable — opens `/u/author` in new tab |
| `report_count` | `gaw_queue.report_count` | `N rpt` amber badge | Only shown when `> 0` |
| `APPR` | action | calls `apiApprove(thing_id)` | Green border, instant row dim |
| `REM` | action | calls `apiRemove(thing_id)` | Red border, Undo toast fires |
| `OPEN` | action | `window.open('/post/'+thing_id)` | Muted, secondary |

### Interaction model

**Approve path** (1 click):
1. Click `APPR`
2. Row immediately dims to `opacity: 0.35`
3. `withUndo(apiApprove, { tier:'B', label:'approve '+thing_id, inverse: apiRemove })` fires
4. `snack('Approved: ' + title.slice(0,30), 'success')` appears
5. After 2s: row fades out and is removed from DOM

**Remove path** (1 click + optional undo):
1. Click `REM`
2. Row immediately dims to `opacity: 0.35`
3. `withUndo(apiRemove, { tier:'B', label:'remove '+thing_id, inverse: apiApprove })` fires
4. Undo toast fires: `"Removed: [title] — Undo"` with 5s countdown (§8 `toast-dismiss`: 3-5s)
5. Clicking Undo calls `apiApprove(thing_id)`, row restores to full opacity
6. After 5s with no Undo: row fades out and is removed from DOM

**Open path** (1 click):
1. Click `OPEN`
2. `window.open('/post/'+thing_id, '_blank', 'noopener')`
3. No row state change — post stays in queue for action

### State transitions

```
[normal] --APPR--> [dimmed] --2s--> [removed]
[normal] --REM---> [dimmed] --5s--> [removed]  (Undo available during 5s window)
[dimmed] --Undo--> [normal]
[normal] --OPEN--> [normal]  (no state change)
```

### Header

```
QUEUE — 14 PENDING                              [Refresh]  [×]
```

- Count sourced from `res.data.queue_depth` (real D1 count), not `_firehoseState.postsQueued`
- `[Refresh]` button re-fires `rpcCall('modGetQueueSnapshot')` and re-renders body
- If `queue_depth` is null (worker returns error), header shows `QUEUE — ~N ITEMS` with tilde indicating estimate

### Footer

```
Open /mod/queue →
```

- Links to `/mod/queue` (mod tooling path), not `/queue` (user-facing path)
- Footer stays minimal — one link, no instruction text

### Loading state

On open: body shows a 3-row skeleton — three `░░░░░░░░░░░░` placeholder rows at correct row height (26px each). This avoids layout shift when data loads and signals to the mod that something is coming.

### Empty state

When `items.length === 0` AND `queue_depth === 0`:
```
Queue is clear — nothing pending.
```

When `items.length === 0` AND `queue_depth > 0` (data gap — D1 table missing):
```
Queue has N items but row data is unavailable.
Open /queue to review manually.    [Open /queue →]
```

This is honest degradation — does not pretend the queue is empty when it is not.

---

## C. Worker D1 Queue Table Schema

The missing piece. The worker at `handleModQueueSnapshot` currently returns `items: []` permanently because no `gaw_queue` table exists. The following schema is the minimum needed to power the popover.

### Migration SQL

```sql
-- Migration 0XX: gaw_queue — mod review queue snapshot table
-- Populated by firehose ingest when a post/comment enters mod queue status.
-- Worker /mod/queue-snapshot reads from this table.
-- thing_id is the Reddit/site fullname (t3_xxxxx for posts, t1_xxxxx for comments).

CREATE TABLE IF NOT EXISTS gaw_queue (
  thing_id      TEXT    PRIMARY KEY,               -- e.g. t3_abc123
  title         TEXT,                              -- post title (posts only)
  snippet       TEXT,                              -- first 200 chars of body
  author        TEXT    NOT NULL,
  queued_ts     INTEGER NOT NULL,                  -- epoch seconds, when entered queue
  report_count  INTEGER NOT NULL DEFAULT 0,
  content_type  TEXT    NOT NULL DEFAULT 'post',   -- 'post' | 'comment'
  status        TEXT    NOT NULL DEFAULT 'pending',-- 'pending' | 'approved' | 'removed'
  actioned_by   TEXT,                              -- mod username who actioned it
  actioned_ts   INTEGER                            -- epoch seconds of action
);

CREATE INDEX IF NOT EXISTS idx_gaw_queue_status_ts
  ON gaw_queue(status, queued_ts DESC);

CREATE INDEX IF NOT EXISTS idx_gaw_queue_author
  ON gaw_queue(author);
```

### Firehose write path

The firehose ingest already processes posts/comments. The addition needed is: when a post enters `queued` status (Reddit reports it as needing mod review), upsert into `gaw_queue`:

```js
// In firehose ingest handler, when post.mod_reports.length > 0
// or post.banned_by === null && post.removed === false && post.spam === false
// (site-specific queue logic):
await env.AUDIT_DB.prepare(`
  INSERT INTO gaw_queue (thing_id, title, snippet, author, queued_ts, report_count, content_type)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(thing_id) DO UPDATE SET
    report_count = excluded.report_count,
    queued_ts    = excluded.queued_ts
`).bind(
  post.name,                           // thing_id
  post.title || null,
  (post.selftext || '').slice(0, 200),
  post.author,
  Math.floor(Date.now() / 1000),
  (post.mod_reports || []).length,
  post.name.startsWith('t1_') ? 'comment' : 'post'
).run();
```

### Worker query update

Replace the stub in `handleModQueueSnapshot` with:

```js
const rows = await env.AUDIT_DB.prepare(`
  SELECT thing_id, title, snippet, author, queued_ts, report_count, content_type
  FROM   gaw_queue
  WHERE  status = 'pending'
  ORDER  BY queued_ts DESC
  LIMIT  ?
`).bind(limit).all();

const countRow = await env.AUDIT_DB.prepare(
  `SELECT COUNT(*) AS n FROM gaw_queue WHERE status = 'pending'`
).first();

return jsonResponse({
  ok: true,
  items: rows.results || [],
  queue_depth: (countRow && countRow.n) || 0
});
```

### Action endpoints (approve / remove)

When a mod approves or removes from the popover, the existing `apiApprove`/`apiRemove` functions call the site API. The worker also needs to mark the queue row as actioned so it disappears from future snapshots:

```js
// Called by any handler that approves/removes a thing
await env.AUDIT_DB.prepare(`
  UPDATE gaw_queue
  SET status = ?, actioned_by = ?, actioned_ts = ?
  WHERE thing_id = ?
`).bind(
  action,            // 'approved' or 'removed'
  mod_username,
  Math.floor(Date.now() / 1000),
  thing_id
).run();
```

This can be wired into the existing `/mod/approve` and `/mod/remove` handlers (if they exist) or added as side-effects in the queue-snapshot endpoint if the client POSTs the action there.

---

## D. Visual Mockup

### Default state — data loaded, 4 items pending

```
┌──────────────────────────────────────────────────────────┐
│ QUEUE — 14 PENDING                      [Refresh]   [×] │
├──────────────────────────────────────────────────────────┤
│ WH Pushing Comms Ahead of Jobs Report — Red Flag?   2m  │
│ TruthSeeker99          3 rpt                [APPR][REM][OPEN] │
├──────────────────────────────────────────────────────────┤
│ Globalists Met Last Night in Basel                  7m  │
│ Q_Patriot_777                               [APPR][REM][OPEN] │
├──────────────────────────────────────────────────────────┤
│ mRNA causes [CENSORED] — Harvard study link        14m  │
│ NWO_Hunter          1 rpt                  [APPR][REM][OPEN] │
├──────────────────────────────────────────────────────────┤
│ What is everyone's take on the latest EO?          31m  │
│ Patriot_Mike                                [APPR][REM][OPEN] │
├──────────────────────────────────────────────────────────┤
│ Open /mod/queue →                                        │
└──────────────────────────────────────────────────────────┘
```

Color key (not shown in ASCII — annotated here):
- `QUEUE — 14 PENDING` header label: `#66ccff` (accent blue), weight 600
- `[Refresh]`: muted `#5a5752`, border `#3d3a35`
- Row title: `#e8e6e1` (primary text), 10px, weight 600
- Age (right): `#5a5752` (muted), 9px
- Author chip: `#66ccff` (accent blue), 9px
- `N rpt` badge: `#ff9933` (amber), 9px
- `[APPR]`: border + text `#44dd66` (green)
- `[REM]`: border + text `#ff3b3b` (red)
- `[OPEN]`: border + text `#5a5752` (muted)
- Row separator: `#2a2825` (1px)
- Background: `#131316`

### Loading state (skeleton, shown before RPC resolves)

```
┌──────────────────────────────────────────────────────────┐
│ QUEUE — LOADING...                                  [×] │
├──────────────────────────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░         ░░░░         │
│ ░░░░░░░░░░                        [APPR][REM][OPEN]     │
├──────────────────────────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░         ░░░░░        │
│ ░░░░░░░░░░░░░░                    [APPR][REM][OPEN]     │
├──────────────────────────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░         ░░░          │
│ ░░░░░░░░                          [APPR][REM][OPEN]     │
└──────────────────────────────────────────────────────────┘
```

Skeleton bars: `#2a2825` (same as separator — they read as placeholder boxes). Buttons shown as greyed outlines during load to preserve layout; they are `pointer-events: none` until data resolves.

### After Remove — row dims, Undo toast appears

```
┌──────────────────────────────────────────────────────────┐
│ QUEUE — 14 PENDING                      [Refresh]   [×] │
├──────────────────────────────────────────────────────────┤
│ WH Pushing Comms Ahead of Jobs Report — Red Flag?   2m  │  <-- dimmed 35%
│ TruthSeeker99          3 rpt                [APPR][REM][OPEN] │
├──────────────────────────────────────────────────────────┤
│ ╔══════════════════════════════════════════════════════╗ │
│ ║  Removed: Globalists Met Last Night — Undo (4s)      ║ │  <-- toast
│ ╚══════════════════════════════════════════════════════╝ │
├──────────────────────────────────────────────────────────┤
│ mRNA causes [CENSORED] — Harvard study link        14m  │
│ NWO_Hunter          1 rpt                  [APPR][REM][OPEN] │
```

Toast: `background: #1a1f1a`, `border: 1px solid #44dd66`, text `#e8e6e1`, `Undo` is `#44dd66` clickable text. Countdown ticks (4s → 3s → 2s → 1s → [removed]).

### Error / data-gap degraded state

```
┌──────────────────────────────────────────────────────────┐
│ QUEUE — ~14 ITEMS (estimate)                        [×] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  14 items pending but row data unavailable.              │
│  Open /queue to review manually.                         │
│                                                          │
│              [Open /queue →]                             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

This is the current real state. Once `gaw_queue` is populated, this path becomes unreachable.

---

## E. CSS / Animation Spec

```css
/* Queue popover container */
#gam-queue-popover {
  position: fixed;
  z-index: 99999996;
  background: #131316;
  border: 1px solid #3d3a35;
  color: #e8e6e1;
  font: 11px/1.4 ui-monospace, JetBrains Mono, monospace;
  min-width: 380px;
  max-width: 480px;
  padding: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
}

/* Header */
.gam-queue-hdr {
  background: #0a0a0b;
  border-bottom: 1px solid #2a2825;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gam-queue-title {
  color: #66ccff;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 10px;
}
.gam-queue-refresh {
  background: transparent;
  border: 1px solid #3d3a35;
  color: #5a5752;
  padding: 1px 5px;
  cursor: pointer;
  font: 9px ui-monospace, monospace;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.gam-queue-refresh:hover { color: #9b9892; border-color: #5a5752; }

/* Body scroll region */
.gam-queue-body {
  max-height: 320px;
  overflow-y: auto;
}

/* Individual item row */
.gam-queue-row {
  border-bottom: 1px solid #2a2825;
  padding: 5px 10px;
  transition: opacity 200ms ease;
}
.gam-queue-row.dimmed {
  opacity: 0.35;
  pointer-events: none;
}
.gam-queue-row.fading {
  opacity: 0;
  transition: opacity 400ms ease;
}

/* Row line 1: title + age */
.gam-queue-row-line1 {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  color: #e8e6e1;
}
.gam-queue-row-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gam-queue-row-age {
  color: #5a5752;
  font-size: 9px;
  font-weight: 400;
  white-space: nowrap;
}

/* Row line 2: author + badges + actions */
.gam-queue-row-line2 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: 9px;
  color: #5a5752;
}
.gam-queue-author {
  color: #66ccff;
  cursor: pointer;
  text-decoration: none;
}
.gam-queue-author:hover { text-decoration: underline; }
.gam-queue-rpt {
  color: #ff9933;
}
.gam-queue-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}

/* Action buttons — shared base */
.gam-queue-btn {
  background: transparent;
  border: 1px solid currentColor;
  padding: 1px 5px;
  cursor: pointer;
  font: 700 8px ui-monospace, monospace;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: background 80ms;
  line-height: 1.6;
}
.gam-queue-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.gam-queue-btn-appr { color: #44dd66; }
.gam-queue-btn-appr:hover:not(:disabled) { background: rgba(68, 221, 102, 0.12); }
.gam-queue-btn-rem  { color: #ff3b3b; }
.gam-queue-btn-rem:hover:not(:disabled)  { background: rgba(255, 59, 59, 0.12); }
.gam-queue-btn-open { color: #5a5752; }
.gam-queue-btn-open:hover { color: #9b9892; }

/* Skeleton loading bars */
.gam-queue-skeleton-bar {
  display: inline-block;
  background: #2a2825;
  border-radius: 2px;
  height: 9px;
}

/* Undo toast */
.gam-queue-undo-toast {
  background: #1a1f1a;
  border: 1px solid #44dd66;
  padding: 6px 10px;
  font-size: 9px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gam-queue-undo-btn {
  color: #44dd66;
  background: none;
  border: none;
  cursor: pointer;
  font: 700 9px ui-monospace, monospace;
  padding: 0;
  text-decoration: underline;
}
.gam-queue-undo-countdown { color: #5a5752; }

/* Footer */
.gam-queue-foot {
  border-top: 1px solid #2a2825;
  padding: 4px 10px;
}
.gam-queue-foot a {
  color: #5a5752;
  font-size: 9px;
  text-decoration: none;
}
.gam-queue-foot a:hover { color: #9b9892; }
```

---

## F. JS Interaction Spec

### Row builder

```js
function _buildQueueRow(it) {
  const row = document.createElement('div');
  row.className = 'gam-queue-row';
  row.dataset.thingId = it.thing_id;

  const age = it.queued_ts ? timeAgo(new Date(it.queued_ts * 1000).toISOString()) : '';
  const rptBadge = it.report_count > 0
    ? '<span class="gam-queue-rpt">' + it.report_count + ' rpt</span>'
    : '';

  row.innerHTML =
    '<div class="gam-queue-row-line1">' +
      '<span class="gam-queue-row-title">' + escapeHtml(it.title || it.snippet || '(no title)') + '</span>' +
      '<span class="gam-queue-row-age">' + escapeHtml(age) + '</span>' +
    '</div>' +
    '<div class="gam-queue-row-line2">' +
      '<a class="gam-queue-author" href="/u/' + encodeURIComponent(it.author) + '" target="_blank" rel="noopener">' + escapeHtml(it.author) + '</a>' +
      rptBadge +
      '<div class="gam-queue-actions">' +
        '<button class="gam-queue-btn gam-queue-btn-appr">APPR</button>' +
        '<button class="gam-queue-btn gam-queue-btn-rem">REM</button>' +
        '<button class="gam-queue-btn gam-queue-btn-open">OPEN</button>' +
      '</div>' +
    '</div>';

  const thingId = it.thing_id;
  const label = (it.title || it.snippet || thingId).slice(0, 40);

  // Approve
  row.querySelector('.gam-queue-btn-appr').addEventListener('click', function(e) {
    e.stopPropagation();
    _queueAction(row, 'approve', thingId, label);
  });

  // Remove — with Undo toast
  row.querySelector('.gam-queue-btn-rem').addEventListener('click', function(e) {
    e.stopPropagation();
    _queueAction(row, 'remove', thingId, label);
  });

  // Open
  row.querySelector('.gam-queue-btn-open').addEventListener('click', function(e) {
    e.stopPropagation();
    window.open('/post/' + encodeURIComponent(thingId), '_blank', 'noopener');
  });

  return row;
}
```

### Action handler with Undo

```js
function _queueAction(row, action, thingId, label) {
  // Instant visual feedback — row dims before API resolves
  row.classList.add('dimmed');

  const apiFn   = action === 'approve' ? apiApprove : apiRemove;
  const undoFn  = action === 'approve' ? apiRemove  : apiApprove;
  const undoLabel = (action === 'approve' ? 'Approved' : 'Removed') + ': ' + label;

  if (action === 'remove') {
    // Insert Undo toast immediately above the dimmed row
    const toast = _buildUndoToast(undoLabel, function onUndo() {
      row.classList.remove('dimmed');
      try { withUndo(function() { return undoFn(thingId); }, { tier: 'B', label: 'undo-remove ' + thingId, inverse: function() { return apiFn(thingId); } }); } catch(_) {}
    });
    row.parentNode.insertBefore(toast, row);

    // Auto-remove toast + row after 5s
    setTimeout(function() {
      toast.remove();
      _fadeRemoveRow(row);
    }, 5000);
  }

  withUndo(function() { return apiFn(thingId); }, {
    tier: 'B',
    label: action + ' ' + thingId,
    inverse: function() { return undoFn(thingId); }
  });

  if (action === 'approve') {
    // No undo toast for approve (non-destructive); fade row after 2s
    setTimeout(function() { _fadeRemoveRow(row); }, 2000);
    try { snack('Approved: ' + label, 'success'); } catch(_) {}
  }
}

function _fadeRemoveRow(row) {
  row.classList.add('fading');
  setTimeout(function() { row.remove(); }, 400);
}

function _buildUndoToast(label, onUndo) {
  let secs = 5;
  const toast = document.createElement('div');
  toast.className = 'gam-queue-undo-toast';

  function render() {
    toast.innerHTML =
      '<span>' + escapeHtml(label) + '</span>' +
      '<button class="gam-queue-undo-btn">Undo</button>' +
      '<span class="gam-queue-undo-countdown">(' + secs + 's)</span>';
    toast.querySelector('.gam-queue-undo-btn').addEventListener('click', function() {
      onUndo();
      toast.remove();
    });
  }

  render();
  const tick = setInterval(function() {
    secs--;
    if (secs <= 0) { clearInterval(tick); return; }
    const cdEl = toast.querySelector('.gam-queue-undo-countdown');
    if (cdEl) cdEl.textContent = '(' + secs + 's)';
  }, 1000);

  return toast;
}
```

### Skeleton loader

```js
function _buildSkeleton(n) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const row = document.createElement('div');
    row.className = 'gam-queue-row';
    row.innerHTML =
      '<div class="gam-queue-row-line1">' +
        '<span class="gam-queue-skeleton-bar" style="width:' + (160 + i * 20) + 'px"></span>' +
        '<span class="gam-queue-skeleton-bar" style="width:24px;margin-left:auto"></span>' +
      '</div>' +
      '<div class="gam-queue-row-line2" style="margin-top:3px">' +
        '<span class="gam-queue-skeleton-bar" style="width:64px"></span>' +
        '<div class="gam-queue-actions">' +
          '<button class="gam-queue-btn gam-queue-btn-appr" disabled style="opacity:0.2">APPR</button>' +
          '<button class="gam-queue-btn gam-queue-btn-rem" disabled style="opacity:0.2">REM</button>' +
          '<button class="gam-queue-btn gam-queue-btn-open" disabled style="opacity:0.2">OPEN</button>' +
        '</div>' +
      '</div>';
    frag.appendChild(row);
  }
  return frag;
}
```

### Refresh button

```js
refreshBtn.addEventListener('click', function() {
  body.innerHTML = '';
  body.appendChild(_buildSkeleton(3));
  titleEl.textContent = 'QUEUE — LOADING...';
  _fetchAndRenderQueue(body, titleEl);
});
```

---

## G. Implementation Notes — Existing Helpers Reused

| Action | Helper | Location | Notes |
|---|---|---|---|
| Approve post/comment | `apiApprove(thingId)` | existing in modtools.js | Already wired in current popover code at L17572 |
| Remove post/comment | `apiRemove(thingId)` | existing in modtools.js | Already wired at L17580 |
| Undo scaffolding | `withUndo(fn, opts)` | existing in modtools.js | Already called at L17574, L17580 — reuse exact pattern |
| Toast notification | `snack(msg, type)` | global | Types: `'success'`, `'error'`, `'info'` |
| Time formatting | `timeAgo(isoString)` | global | Called at L17554 in current code — reuse |
| HTML sanitization | `escapeHtml(str)` | global | Mandatory on all user-provided strings |
| RPC channel | `rpcCall('modGetQueueSnapshot', { limit })` | background.js | Already present; just needs worker to return real data |
| Popover anchor positioning | existing in `_showQueuePopover` L17477-17480 | keep as-is | Position logic is correct |
| Escape / outside-click dismiss | L17600-17613 | keep as-is | Dismiss logic is correct |

The entire interaction layer (buttons, `withUndo`, `apiApprove`, `apiRemove`) already exists in the current code at L17562–17593. The only client-side work is:
1. Replace the flat `body.innerHTML` builder with the structured `_buildQueueRow` function
2. Add the skeleton loader
3. Add the Undo toast for Remove
4. Fix the footer link (`/queue` → `/mod/queue`)
5. Add the Refresh button

The backend work (D1 schema + firehose write + query) is where the real effort lives.

---

## H. Effort Estimate

### Client-side (modtools.js)

| Task | Lines changed/added | Complexity | Est. time |
|---|---|---|---|
| Replace row builder with `_buildQueueRow` | ~80 lines changed | Low — structural refactor of existing loop | 1h |
| Add `_buildSkeleton` loader | ~30 lines new | Low | 20min |
| Add `_queueAction` + `_buildUndoToast` + `_fadeRemoveRow` | ~80 lines new | Medium — timer + DOM coordination | 1h |
| Add Refresh button to header | ~10 lines new | Low | 15min |
| Fix footer link `/queue` → `/mod/queue` | 1 line | Trivial | 5min |
| CSS additions (skeleton, undo toast, fading, btn states) | ~80 lines new | Low | 30min |
| Add empty-state / error-state branching | ~20 lines changed | Low | 20min |
| **Client total** | **~300 lines net** | | **~3.5h** |

### Backend (cloudflare-worker + D1)

| Task | Complexity | Est. time |
|---|---|---|
| Write migration SQL for `gaw_queue` | Low | 20min |
| Add firehose upsert when post enters queue status | Medium — requires understanding firehose ingest flow | 1.5h |
| Update `handleModQueueSnapshot` to query D1 | Low — 15-line query replacing the stub | 30min |
| Add queue row status update on approve/remove actions | Medium — wire into existing approve/remove handlers | 1h |
| D1 index + test query | Low | 20min |
| **Backend total** | | **~3.5h** |

### Total estimate

| Layer | Effort |
|---|---|
| Client (modtools.js) | ~3.5h |
| Backend (worker + D1) | ~3.5h |
| **Grand total** | **~7h** |

### Risk flags

1. **Firehose queue signal** — the firehose ingest knows when posts are ingested but may not reliably know which posts are currently in the mod queue (vs already approved). This requires a signal from the Reddit/site API response (`mod_reports`, `approved`, `spam` fields) to determine queue membership. If the firehose doesn't capture these fields reliably, the `gaw_queue` table will be stale or sparse. **Mitigation:** add a separate `/mod/refresh-queue` worker endpoint that calls the site's `/r/all/about/modqueue.json` API directly (with mod credentials) and bulk-upserts into `gaw_queue`. This is the authoritative source.

2. **Undo timer leak** — the `setInterval` in `_buildUndoToast` must be cleared when the popover closes before the 5s window. Store the interval ID on the toast element and clear in `_closePop()`. Missing this causes a timer firing on a detached node.

3. **`withUndo` for approve** — approving is not destructive in the traditional sense (it's reversible by removing). Confirm that `withUndo` tier `'B'` is appropriate or if approve should use a lower-priority tier. The current code at L17574 uses tier `'B'` — keep it.

4. **`/mod/queue` footer link** — confirm this path exists in the mod panel before shipping. If it doesn't, use `/mod` as the fallback landing page rather than the user-facing `/queue`.

---

## I. Key Design Decisions

1. **Approve and Remove are always visible per row** — never behind expand or overflow. Primary actions cannot be one click away from invisible.
2. **Undo is mandatory for Remove, not optional** — Remove is permanent without it. The 5s countdown is long enough to catch mistakes and short enough not to stall triage cadence.
3. **Skeleton loader not a spinner** — 3 placeholder rows at actual row height prevent layout shift when data loads (§3 `content-jumping`).
4. **Data-gap degraded state is honest** — when the D1 table is missing, show what we know (count estimate) and offer the manual path. Do not show "Queue is empty" when it is not.
5. **Refresh button** — queue state changes as mods action items; a manual refresh prevents the popover from showing stale data if left open.
6. **Footer link corrected** — `/queue` is the user-facing submission page. `/mod/queue` (or `/mod`) is where mod tooling lives. The current link wastes a click by sending mods to the wrong place.
7. **Row dims immediately on action, not after API response** — 100ms feedback rule (§3 `tap-feedback-speed`). The API call is fire-and-forget; the UI does not wait for confirmation to give visual feedback.
8. **Author chip links to `/u/` in new tab** — clicking author is investigation, not triage. It should not close the popover or interrupt the action flow.
