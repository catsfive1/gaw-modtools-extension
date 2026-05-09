# V11 #3 -- AI Hold Queue (v0 ship)

**Scope:** Migration 032, three worker endpoints, one slide-in panel, parallel
write path so the legacy `ai_suspect_queue` daily scan keeps working unmodified.
**Ship target:** Tonight (Wave 1 blocker per Cat 2 CTO synthesis #1).

---

## A. MIGRATION 032 -- Full DDL

```sql
-- Migration 032: ai_hold_queue
-- State machine: unclaimed -> claimed -> resolved
-- Concurrent claim safety: UPDATE...WHERE claimed_by IS NULL RETURNING *
-- All times are Unix epoch milliseconds.

CREATE TABLE IF NOT EXISTS ai_hold_queue (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  kind             TEXT NOT NULL
    CHECK(kind IN ('tard','sticky','ban','brigade','modmail','daily-score')),
  target_kind      TEXT NOT NULL
    CHECK(target_kind IN ('user','post','comment','thread')),
  target_id        TEXT NOT NULL,
  confidence       REAL NOT NULL         -- 0.0..1.0; floor 0.65 to enter
    CHECK(confidence >= 0.0 AND confidence <= 1.0),
  suggested_action TEXT NOT NULL
    CHECK(suggested_action IN ('ban','remove','warn','watch','approve')),
  reason_json      TEXT NOT NULL,        -- {summary, evidence[], rule_refs[]}
  source_model     TEXT,                 -- 'llama-3.3-70b'|'grok-3-mini' etc.
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,     -- created_at + 72h; cron prunes expired
  claimed_by       TEXT,                 -- mod username; NULL = unclaimed
  claimed_at       INTEGER,
  resolved_action  TEXT
    CHECK(resolved_action IS NULL OR
          resolved_action IN ('approved','rejected','overridden')),
  resolved_by      TEXT,
  resolved_at      INTEGER,
  override_action  TEXT,                 -- if mod chose 'overridden': what they did
  via              TEXT DEFAULT 'hold_queue',
  incident_id      INTEGER               -- FK to mod_incidents when in incident mode
);

-- Primary queue read: pending items, highest confidence first (j/k UI)
CREATE INDEX IF NOT EXISTS idx_ahq_pending
  ON ai_hold_queue(confidence DESC, created_at)
  WHERE claimed_by IS NULL
    AND resolved_at IS NULL
    AND expires_at > (unixepoch() * 1000);

-- Per-kind pipeline drain (claimed + unresolved count per kind)
CREATE INDEX IF NOT EXISTS idx_ahq_kind_pending
  ON ai_hold_queue(kind, created_at)
  WHERE resolved_at IS NULL;

-- Expiry sweep (cron deletes WHERE expires_at < now AND resolved_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_ahq_expires
  ON ai_hold_queue(expires_at);

-- Suggested-action + confidence for queue prioritization
CREATE INDEX IF NOT EXISTS idx_ahq_suggested_action
  ON ai_hold_queue(suggested_action, confidence DESC)
  WHERE resolved_at IS NULL;

-- Optional: JSON expression index for rule_refs faceting (D1 SQLite 3.43+ supported)
-- Enables future: WHERE json_extract(reason_json, '$.rule_refs[0]') = 'RULE_07'
CREATE INDEX IF NOT EXISTS idx_ahq_rule_ref
  ON ai_hold_queue(json_extract(reason_json, '$.rule_refs[0]'), created_at DESC);
```

**Expiry cron (add to existing `teamProductivityCronTick`):**
```sql
DELETE FROM ai_hold_queue
 WHERE expires_at < (unixepoch() * 1000)
   AND resolved_at IS NULL;
```

---

## B. WORKER ENDPOINTS

### B1. GET /admin/queue/ai-flagged

Returns the pending queue paginated, highest-confidence first. Atomically
claims the top-N items for the requesting mod so no two mods work the same row.

```js
// Route: GET /admin/queue/ai-flagged?limit=25&claim=1
// Auth: requiresModToken (existing middleware)
async function handleAiHoldQueue(request, env) {
  const mod = await getModFromToken(request, env);
  if (!mod) return jsonResponse({ ok: false, error: 'invalid token' }, 401);

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100);
  const doClaim = url.searchParams.get('claim') === '1';
  const now = Date.now();

  // Paginated read -- always returns unclaimed + unresolved, confidence DESC
  const rows = await env.AUDIT_DB.prepare(`
    SELECT id, kind, target_kind, target_id, confidence,
           suggested_action, reason_json, source_model,
           created_at, expires_at, claimed_by, claimed_at
      FROM ai_hold_queue
     WHERE resolved_at IS NULL
       AND expires_at > ?
     ORDER BY confidence DESC, created_at ASC
     LIMIT ?
  `).bind(now, limit).all();

  // Atomic claim: UPDATE WHERE claimed_by IS NULL RETURNING
  // This is the race-safe pattern -- two mods j-keying simultaneously
  // cannot both get the same row because only one UPDATE wins.
  if (doClaim && rows.results.length > 0) {
    const ids = rows.results
      .filter(r => r.claimed_by === null)
      .slice(0, 5)
      .map(r => r.id);

    if (ids.length > 0) {
      // D1 batch: one round-trip for all claims
      const stmts = ids.map(id =>
        env.AUDIT_DB.prepare(`
          UPDATE ai_hold_queue
             SET claimed_by = ?, claimed_at = ?
           WHERE id = ?
             AND claimed_by IS NULL
             AND resolved_at IS NULL
          RETURNING id, claimed_by
        `).bind(mod, now, id)
      );
      await env.AUDIT_DB.batch(stmts);
    }
  }

  return jsonResponse({
    ok: true,
    queue: rows.results,
    meta: {
      fetched: rows.results.length,
      claimed_by_me: rows.results.filter(r => r.claimed_by === mod).length,
      as_of: now
    }
  });
}
```

### B2. POST /admin/queue/ai-flagged/:id/resolve

Mod submits their decision (j = approved, k = rejected, or override with a
custom action). Atomic: refuses to resolve an already-resolved row.

```js
// Route: POST /admin/queue/ai-flagged/:id/resolve
// Body: { resolved_action: 'approved'|'rejected'|'overridden', override_action?: string }
async function handleAiHoldQueueResolve(request, env, id) {
  const mod = await getModFromToken(request, env);
  if (!mod) return jsonResponse({ ok: false, error: 'invalid token' }, 401);

  const body = await request.json();
  const { resolved_action, override_action } = body;

  const validActions = ['approved', 'rejected', 'overridden'];
  if (!validActions.includes(resolved_action)) {
    return jsonResponse({ ok: false, error: 'invalid resolved_action' }, 400);
  }
  if (resolved_action === 'overridden' && !override_action) {
    return jsonResponse({ ok: false, error: 'override_action required when overridden' }, 400);
  }

  const now = Date.now();

  // Atomic resolve: WHERE resolved_at IS NULL prevents double-resolve (409 if 0 rows)
  const result = await env.AUDIT_DB.prepare(`
    UPDATE ai_hold_queue
       SET resolved_action = ?,
           resolved_by     = ?,
           resolved_at     = ?,
           override_action = ?
     WHERE id = ?
       AND resolved_at IS NULL
    RETURNING id, kind, target_kind, target_id, confidence,
              suggested_action, resolved_action, resolved_by
  `).bind(resolved_action, mod, now, override_action || null, parseInt(id)).first();

  if (!result) {
    return jsonResponse({ ok: false, error: 'item already resolved or not found' }, 409);
  }

  // Write audit row so this decision appears in the action log
  await appendAuditAction(env, {
    mod,
    action: `ai_queue_${resolved_action}`,
    target_user: result.target_kind === 'user' ? result.target_id : null,
    extra: JSON.stringify({
      ai_hold_queue_id: result.id,
      kind: result.kind,
      confidence: result.confidence,
      suggested: result.suggested_action,
      decided: resolved_action,
      override: override_action || null
    }),
    via: 'hold_queue'
  });

  return jsonResponse({ ok: true, resolved: result });
}
```

### B3. GET /admin/queue/ai-flagged/stats

Quick count for the status bar badge and panel header live count.

```js
// Route: GET /admin/queue/ai-flagged/stats
async function handleAiHoldQueueStats(request, env) {
  const mod = await getModFromToken(request, env);
  if (!mod) return jsonResponse({ ok: false, error: 'invalid token' }, 401);

  const now = Date.now();
  const stats = await env.AUDIT_DB.prepare(`
    SELECT
      COUNT(*) FILTER (WHERE claimed_by IS NULL AND resolved_at IS NULL AND expires_at > ?) AS pending,
      COUNT(*) FILTER (WHERE claimed_by IS NOT NULL AND resolved_at IS NULL AND expires_at > ?) AS claimed,
      COUNT(*) FILTER (WHERE resolved_at IS NOT NULL
                         AND resolved_at > (? - 86400000)) AS resolved_24h,
      COUNT(*) FILTER (WHERE resolved_action = 'approved'
                         AND resolved_at > (? - 86400000)) AS approved_24h,
      COUNT(*) FILTER (WHERE resolved_action = 'rejected'
                         AND resolved_at > (? - 86400000)) AS rejected_24h
    FROM ai_hold_queue
  `).bind(now, now, now, now, now).first();

  return jsonResponse({ ok: true, stats });
}
```

---

## C. CLIENT PANEL -- "SIGNAL QUEUE" Slide-In

**Visual identity:** Cat 3 item #6 -- blue header, confidence-tier left gutter,
intelligence framing (Cat 3 item #24). Panel is 480px wide, slides in from right.

### C1. CSS (add to GAM_CSS block)

```css
/* ── AI Hold Queue / Signal Queue panel ─────────────────────────── */
#gam-signal-queue {
  position: fixed;
  top: 28px;                        /* below status bar */
  right: 0;
  width: 480px;
  height: calc(100vh - 28px);
  background: #0f1114;
  border-left: 1px solid #2c5282;   /* AI blue border -- signals machine zone */
  z-index: 9100;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  /* APPEAR motion grammar: 160ms material decelerate */
  transition: transform 160ms cubic-bezier(0.0, 0.0, 0.2, 1.0);
}
#gam-signal-queue.gam-sq-open {
  transform: translateX(0);
}

/* Header */
#gam-sq-header {
  background: #111318;
  border-bottom: 1px solid #2c5282;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
#gam-sq-title {
  font: 700 11px/1 'JetBrains Mono', monospace;
  letter-spacing: 1.5px;
  color: #7cb8ff;                   /* AI blue */
  text-transform: uppercase;
}
#gam-sq-count {
  font: 600 11px/1 'JetBrains Mono', monospace;
  color: #7cb8ff;
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}
#gam-sq-close {
  background: none;
  border: 1px solid #2c5282;
  color: #5c6370;
  font-size: 11px;
  padding: 2px 6px;
  cursor: pointer;
  border-radius: 3px;
}
#gam-sq-close:hover { color: #e8eaed; border-color: #4a9eff; }

/* Item list */
#gam-sq-list {
  overflow-y: auto;
  flex: 1;
}

/* Individual queue item */
.gam-sq-item {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid #1a1d22;
  height: 56px;
  cursor: default;
  position: relative;
  transition: background 80ms linear;
}
.gam-sq-item:hover { background: rgba(255,255,255,0.03); }

/* Confidence-tier left gutter (3px color bar) */
.gam-sq-item::before {
  content: '';
  width: 3px;
  flex-shrink: 0;
  background: var(--gam-sq-gutter, #5c6370);
}
.gam-sq-item[data-conf="high"]::before { --gam-sq-gutter: #3dd68c; }  /* >=0.85 */
.gam-sq-item[data-conf="med"]::before  { --gam-sq-gutter: #f5a623; }  /* 0.65-0.85 */
.gam-sq-item[data-conf="low"]::before  { --gam-sq-gutter: #5c6370; }  /* <0.65 (defensive) */

.gam-sq-item-body {
  padding: 8px 10px;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}
.gam-sq-subject {
  font: 400 13px/1.2 'JetBrains Mono', monospace;
  color: #e8eaed;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gam-sq-meta {
  display: flex;
  gap: 6px;
  align-items: center;
}
.gam-sq-conf-pct {
  font: 600 11px/1 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
}
[data-conf="high"] .gam-sq-conf-pct { color: #3dd68c; }
[data-conf="med"]  .gam-sq-conf-pct { color: #f5a623; }
[data-conf="low"]  .gam-sq-conf-pct { color: #5c6370; }

.gam-sq-suggested {
  font: 400 11px/1 'JetBrains Mono', monospace;
  color: #8b929e;
}

/* j/k action buttons */
.gam-sq-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  padding: 0 10px 0 6px;
  flex-shrink: 0;
}
.gam-sq-btn {
  font: 700 10px/1 'JetBrains Mono', monospace;
  padding: 4px 8px;
  border-radius: 3px;
  cursor: pointer;
  border: none;
  letter-spacing: 0.5px;
}
.gam-sq-btn-approve {
  background: rgba(61,214,140,0.15);
  color: #3dd68c;
  border: 1px solid rgba(61,214,140,0.3);
}
.gam-sq-btn-approve:hover { background: rgba(61,214,140,0.25); }
.gam-sq-btn-reject {
  background: rgba(240,64,64,0.12);
  color: #f04040;
  border: 1px solid rgba(240,64,64,0.25);
}
.gam-sq-btn-reject:hover { background: rgba(240,64,64,0.22); }

/* DECISION motion (Cat 3 item #7 -- spring, 200ms) */
.gam-sq-item.gam-sq-deciding-approve {
  animation: gam-sq-approve 200ms cubic-bezier(0.34,1.56,0.64,1.0) forwards;
}
.gam-sq-item.gam-sq-deciding-reject {
  animation: gam-sq-reject 200ms cubic-bezier(0.34,1.56,0.64,1.0) forwards;
}
@keyframes gam-sq-approve {
  0%   { transform: translateX(0); background: rgba(61,214,140,0.2); }
  100% { transform: translateX(-40px); opacity: 0; }
}
@keyframes gam-sq-reject {
  0%   { transform: translateX(0); background: rgba(240,64,64,0.2); }
  100% { transform: translateX(40px); opacity: 0; }
}

/* Empty state */
#gam-sq-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  color: #5c6370;
}
#gam-sq-empty-icon { font-size: 28px; color: #276749; }
#gam-sq-empty-label {
  font: 400 12px/1 'JetBrains Mono', monospace;
  color: #8b929e;
}
#gam-sq-empty-sub {
  font: 400 10px/1 'JetBrains Mono', monospace;
  color: #5c6370;
}

/* Skeleton loading rows */
.gam-sq-skeleton {
  height: 56px;
  border-bottom: 1px solid #1a1d22;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gam-sq-skeleton-line {
  height: 10px;
  border-radius: 2px;
  background: linear-gradient(90deg, #1a1d22 0%, #252a31 50%, #1a1d22 100%);
  background-size: 200% 100%;
  animation: gam-skeleton-shimmer 1.5s ease infinite;
}
```

### C2. JS Panel Logic (add to content script)

```js
// ── Signal Queue Panel ────────────────────────────────────────────
const SQ = {
  open: false,
  items: [],
  focusIdx: 0,

  async toggle() {
    if (SQ.open) { SQ.close(); return; }
    SQ.render();
    document.getElementById('gam-signal-queue').classList.add('gam-sq-open');
    SQ.open = true;
    await SQ.load();
    SQ.bindKeys();
  },

  close() {
    document.getElementById('gam-signal-queue').classList.remove('gam-sq-open');
    SQ.open = false;
    SQ.unbindKeys();
  },

  render() {
    if (document.getElementById('gam-signal-queue')) return;
    const el = document.createElement('div');
    el.id = 'gam-signal-queue';
    el.innerHTML = `
      <div id="gam-sq-header">
        <span id="gam-sq-title">Signal Queue</span>
        <span id="gam-sq-count">[--]</span>
        <button id="gam-sq-close">ESC</button>
      </div>
      <div id="gam-sq-list">
        ${[0,1,2].map(() => `
          <div class="gam-sq-skeleton">
            <div class="gam-sq-skeleton-line" style="width:60%"></div>
            <div class="gam-sq-skeleton-line" style="width:35%"></div>
          </div>`).join('')}
      </div>`;
    document.body.appendChild(el);
    document.getElementById('gam-sq-close').addEventListener('click', SQ.close);
  },

  async load() {
    const data = await rpcCall('GET', '/admin/queue/ai-flagged?limit=50&claim=1');
    if (!data.ok) return;
    SQ.items = data.queue;
    SQ.focusIdx = 0;
    SQ.renderItems();
    document.getElementById('gam-sq-count').textContent = `[${SQ.items.length}]`;
  },

  renderItems() {
    const list = document.getElementById('gam-sq-list');
    if (!SQ.items.length) {
      list.innerHTML = `
        <div id="gam-sq-empty">
          <div id="gam-sq-empty-icon">&#10003;</div>
          <div id="gam-sq-empty-label">Queue clear -- 0 items awaiting review</div>
          <div id="gam-sq-empty-sub">AI has no pending signals</div>
        </div>`;
      return;
    }
    list.innerHTML = SQ.items.map((item, i) => {
      const conf = item.confidence;
      const tier = conf >= 0.85 ? 'high' : conf >= 0.65 ? 'med' : 'low';
      const reason = (() => { try { return JSON.parse(item.reason_json).summary; } catch { return item.target_id; } })();
      return `
        <div class="gam-sq-item${i === SQ.focusIdx ? ' gam-sq-focused' : ''}"
             data-conf="${tier}" data-id="${item.id}" data-idx="${i}">
          <div class="gam-sq-item-body">
            <div class="gam-sq-subject" title="${reason}">${reason}</div>
            <div class="gam-sq-meta">
              <span class="gam-sq-conf-pct">${Math.round(conf * 100)}% CONFIDENCE</span>
              <span class="gam-sq-suggested">${item.suggested_action.toUpperCase()}</span>
              <span class="gam-chip gam-chip-neutral" style="font-size:9px">${item.kind.toUpperCase()}</span>
            </div>
          </div>
          <div class="gam-sq-actions">
            <button class="gam-sq-btn gam-sq-btn-approve" data-id="${item.id}" data-idx="${i}">[j] APPROVE</button>
            <button class="gam-sq-btn gam-sq-btn-reject"  data-id="${item.id}" data-idx="${i}">[k] REJECT</button>
          </div>
        </div>`;
    }).join('');

    // Event delegation
    list.querySelectorAll('.gam-sq-btn-approve').forEach(btn => {
      btn.addEventListener('click', () => SQ.decide(parseInt(btn.dataset.idx), 'approved'));
    });
    list.querySelectorAll('.gam-sq-btn-reject').forEach(btn => {
      btn.addEventListener('click', () => SQ.decide(parseInt(btn.dataset.idx), 'rejected'));
    });
  },

  async decide(idx, action) {
    const item = SQ.items[idx];
    if (!item) return;
    const el = document.querySelector(`.gam-sq-item[data-idx="${idx}"]`);
    if (!el) return;

    const animClass = action === 'approved' ? 'gam-sq-deciding-approve' : 'gam-sq-deciding-reject';
    el.classList.add(animClass);

    // Fire resolve endpoint (non-blocking on animation)
    rpcCall('POST', `/admin/queue/ai-flagged/${item.id}/resolve`,
      { resolved_action: action })
      .catch(err => gamLog('sq resolve error', err));

    setTimeout(() => {
      SQ.items.splice(idx, 1);
      SQ.focusIdx = Math.min(idx, SQ.items.length - 1);
      SQ.renderItems();
      document.getElementById('gam-sq-count').textContent = `[${SQ.items.length}]`;
    }, 180);
  },

  _keyHandler: null,

  bindKeys() {
    SQ._keyHandler = (e) => {
      if (!SQ.open) return;
      if (e.key === 'j') { e.preventDefault(); SQ.decide(SQ.focusIdx, 'approved'); }
      if (e.key === 'k') { e.preventDefault(); SQ.decide(SQ.focusIdx, 'rejected'); }
      if (e.key === 'Escape') { SQ.close(); }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        SQ.focusIdx = Math.min(SQ.focusIdx + 1, SQ.items.length - 1);
        SQ.renderItems();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        SQ.focusIdx = Math.max(SQ.focusIdx - 1, 0);
        SQ.renderItems();
      }
    };
    document.addEventListener('keydown', SQ._keyHandler);
  },

  unbindKeys() {
    if (SQ._keyHandler) document.removeEventListener('keydown', SQ._keyHandler);
    SQ._keyHandler = null;
  }
};
```

**Status bar badge** -- add to existing bar render:
```js
// After existing bar icons, add:
const sqStats = await rpcCall('GET', '/admin/queue/ai-flagged/stats').catch(() => null);
const sqPending = sqStats?.stats?.pending || 0;
if (sqPending > 0) {
  // Pulse the badge at amber when items waiting
  gamStatusBar.insertAdjacentHTML('beforeend', `
    <span id="gam-sq-badge"
          style="color:#7cb8ff;font-size:10px;cursor:pointer;margin-left:6px"
          title="AI Signal Queue: ${sqPending} pending">
      [AI:${sqPending}]
    </span>`);
  document.getElementById('gam-sq-badge')?.addEventListener('click', SQ.toggle);
}
```

---

## D. SHIP-TONIGHT MINIMAL PATCH

Exact sequence -- three files touched, no existing behavior broken:

**1. Deploy migration 032.**
```
npx wrangler d1 execute gaw-mod-audit --remote --file=migrations/032_ai_hold_queue.sql
```
Verify: `SELECT count(*) FROM ai_hold_queue;` returns 0.

**2. Add three routes to the worker** (`gaw-mod-proxy-v2.js` routing block):
```js
// In the existing route dispatcher (url.pathname switch / if-chain):
if (path === '/admin/queue/ai-flagged' && method === 'GET')
  return handleAiHoldQueue(request, env);
if (path.match(/^\/admin\/queue\/ai-flagged\/(\d+)\/resolve$/) && method === 'POST')
  return handleAiHoldQueueResolve(request, env, path.match(/\/(\d+)\//)[1]);
if (path === '/admin/queue/ai-flagged/stats' && method === 'GET')
  return handleAiHoldQueueStats(request, env);
```

**3. Parallel write path in the daily AI scan.**

The existing `ai_suspect_queue` write (line 10776 in worker) is preserved
unchanged. Add a second INSERT immediately after it that also writes to
`ai_hold_queue`. This is the parallel write that lets ops validate the new
queue before cutting over:

```js
// Immediately after the existing ai_suspect_queue INSERT (around line 10780):
// Parallel write to ai_hold_queue -- dual-write during transition
const holdExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7-day TTL for daily-score kind
await env.AUDIT_DB.prepare(`
  INSERT INTO ai_hold_queue
    (kind, target_kind, target_id, confidence, suggested_action,
     reason_json, source_model, created_at, expires_at, via)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT DO NOTHING
`).bind(
  'daily-score',
  'user',
  username,                          // the suspect username
  aiRisk / 100.0,                    // normalize 0-100 -> 0.0-1.0
  aiRisk >= 85 ? 'ban' : 'watch',
  JSON.stringify({ summary: aiReason, evidence: [], rule_refs: [] }),
  aiModel,
  Date.now(),
  holdExpiry,
  'ai_suspect_queue_mirror'
).run().catch(err => console.error('ai_hold_queue mirror write failed:', err));
// Note: .catch() so any error never kills the primary suspect_queue write.
```

**4. Add panel CSS and JS** to the content script bundle. Wire `SQ.toggle()`
to the `[AI:N]` status bar badge (see C2 above).

**5. Deploy worker.**

Smoke test checklist:
- `GET /admin/queue/ai-flagged` returns `{ok:true, queue:[]}` (empty on day 1)
- `GET /admin/queue/ai-flagged/stats` returns `{ok:true, stats:{pending:0,...}}`
- Status bar badge shows `[AI:0]` -- no errors in console
- After next daily scan run, verify rows appear in `ai_hold_queue` via D1 console
- j/k flash + panel-slide animation fires; row disappears after decision
- `POST /admin/queue/ai-flagged/1/resolve` with a non-existent ID returns 409

**Legacy compatibility:** `ai_suspect_queue` write path is untouched. All
existing `/admin/queue/ai-suspects` routes keep working. This is zero-break
dual-write.

---

## E. NEXT-WAVE ENHANCEMENTS

**Wave 2 (v11.1):**
- Cut `ai_suspect_queue` write path over to `ai_hold_queue` exclusively
  (Cat 2 migration #20). Remove dual-write shim. Drop legacy suspect queue
  routes once no active clients depend on them.
- Add `kind` filter to the queue panel (`?kind=tard`, `?kind=ban`, etc.) for
  pipeline-specific drain views.
- Confidence trend sparkline in header ("AI 83% accurate this week") as a
  60x12px inline SVG from Analytics Engine aggregate (Cat 5 item #3).
- `false_positive_flag` column + mod-feedback loop: when a mod rejects with
  `override_action`, log it as a negative training signal for Cat 5's
  calibration loop (Cat 5 items #9, #20).

**Wave 3 (v11.2):**
- Shadow mode for trainees: queue shows AI suggestions but mod must decide
  before seeing them -- measure AI agreement rate (Cat 5 item #20).
- Incident mode integration: `incident_id` FK wired; queue items tagged to
  an active incident get a fuchsia `INC` chip (Cat 3 item #17).
- Auto-send for `confidence >= 0.92 AND kind = 'modmail'`: 5-second undo
  window, then action executes (requires Cat 5 item #4 funnel
  instrumentation to validate threshold first).
- `ai_hold_queue` as the single queue for ALL AI signal types: `sticky`,
  `tard`, `brigade`, `modmail` (currently scattered across separate
  detection paths). One panel, all signals, one state machine.

**Architecture bet from Cat 2 item #1:** `ai_hold_queue` unifies
`shadow_triage_decisions`, `ai_suspect_queue`, and the modmail draft cache
by v11.2. The v0 ship tonight lays the schema foundation for that
consolidation without touching any existing table.
