# Firehose Feature 5 — Hot Now Panel

> Agent: Firehose Builder (1-of-10). Discipline: "Hot Now" panel — replaces SIREN-to-mod-log click.
> Source refs: `modtools.js` lines 15147-15148 (siren handler), 9615 (`_susState`), 4404-4537 (DR helpers), 4385+ (inboxIntel), UX docs W6 + item #20.

---

## A. CURRENT (broken) vs IDEAL

### Current — what fires today

```
[SIREN chip click]
  sirenBtn.addEventListener('click', openModLog)   // modtools.js:15148
    → openModLog()                                 // modtools.js:8777
      → flat reverse-chronological history of past actions
      → watchlist entries
      → pending Death Row entries (all, not sorted by readiness)
```

**What is wrong:**  
The click-target is diagnostic (history), not operational (triage). A mod who sees `🚨 7` and clicks wants to know *what to do in the next 60 seconds*, not what they did in the last 8 hours. The mod log answers the wrong question. This is the W6 friction from `V11_CAT2_UX_FLOWS.md`: 3 clicks, wrong page, ~8s wasted, zero triage value.

### Ideal — what fires after this patch

```
[SIREN chip click]
  _showHotNowPanel()
    → slide-in panel (right dock, 400px, z-index 9999992)
      Section 1: SUS USERS     top 5 by comment_count_24h desc
      Section 2: DR READY      top 5 getDeathRowReady(), sorted by executeAt asc
      Section 3: HOT MODMAIL   top 3 from cached inboxIntel, status=new, flagged=true
      Footer: "View mod log →" link (old destination preserved, demoted)
```

Click-to-meaningful-action target: **under 10 seconds** (vs. current 8s to the wrong page).

---

## B. DATA SOURCES

### Section 1 — Top 5 SUS users (last 24h, sorted by comment velocity)

**Source:** `_susState.rows` (Map, already in memory, polled every 60s via `_susRefresh()`).

Each row shape from worker `/mod/user/sus` (RPC `modSusList`):
```js
{
  username: "badactor42",
  reason: "brigade suspect",
  marked_by: "mod_alice",
  comment_count_24h: 23,   // firehose-derived; already used for BOLD-RED decoration
  marked_at: 1715123456789 // epoch ms — add this if not already returned; worker has it
}
```

Sort: `[..._susState.rows.values()].sort((a,b) => (b.comment_count_24h||0) - (a.comment_count_24h||0)).slice(0,5)`

No extra RPC needed — `_susState` is live.

### Section 2 — Top 5 DR-ready entries

**Source:** `getDeathRowReady()` — already exists at `modtools.js:4537`.

```js
// modtools.js:4537
function getDeathRowReady(){
  return getDeathRow().filter(d => d.status==='waiting' && Date.now() >= d.executeAt);
}
```

Row shape:
```js
{ username, reason, queuedAt, executeAt, status:'waiting' }
```

Sort by `executeAt` ascending (longest-overdue first). Cap at 5.

If `getDeathRowReady().length === 0` fall back to `getDeathRowPending().slice(0,5)` sorted by `executeAt` with a "PENDING" label instead of "READY" — so the section never shows "nothing to show" on a shift with queued but not-yet-due entries.

### Section 3 — Top 3 hot modmail threads

**Source:** Worker RPC `modMessageInbox` (already called by the chat panel at line 14269 with `rpcCall('modMessageInbox', {})`). The panel issues its own async fetch on open; we do not depend on the chat panel being open.

Filter criteria:
- `status === 'new'` (unread/unanswered)
- `flagged === true` OR sender is in `_susState.rows` OR prior-ban indicator from worker row

If the worker row does not expose `flagged`, fall back to: threads where `last_message_from === 'user'` (sender had the last word — unanswered) sorted by `updated_at` desc. This is always available from the inbox shape.

Cap at 3. Fetch is async; show a 2-row skeleton shimmer (existing `.gam-skeleton-shimmer`) while loading, then replace.

### Section 4 — Brigade alerts (stretch, from Feature 4)

When Feature 4 (brigade detector) is shipped, its output key (`brigade_alerts[]`) feeds Section 4 here. The panel is architected to render 3 sections without Feature 4 and 4 sections with it — conditional on `window._gamBrigadeAlerts` being defined.

---

## C. UI DESIGN

**Bloomberg / intelligence-analyst aesthetic** per item #24: no badges, no cop iconography. Dense rows, color-coded left gutters, tabular numerals, all-caps section labels, 9px letter-spacing headers.

### Panel shell

```css
/* panel shell — new ID, not gam-mc-panel to avoid z-index collision (see modtools.js:15676 comment) */
#gam-hot-now-panel {
  position: fixed;
  top: 0;
  bottom: 36px;               /* clear status bar height */
  right: 0;
  width: 400px;
  max-width: 95vw;
  background: #0f1114;        /* C.BG */
  border-left: 1px solid #3a3f48;  /* C.BORDER2 */
  box-shadow: -8px 0 30px rgba(0,0,0,.6);
  z-index: 9999992;           /* above backdrop (9999990), below modal (9999995) */
  display: flex;
  flex-direction: column;
  font: 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  color: #e8eaed;             /* C.TEXT */
  transform: translateX(100%);
  transition: transform 160ms cubic-bezier(0.0, 0.0, 0.2, 1.0);  /* motion grammar APPEAR */
  overflow: hidden;
}
#gam-hot-now-panel.gam-hn-open {
  transform: translateX(0);
}
```

### Panel header

```
HOT NOW                                                      [x]
[RED 1px top border across full width of header bar]
```

```css
.gam-hn-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 8px;
  border-bottom: 1px solid #2a2f38;
  flex-shrink: 0;
}
.gam-hn-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #f04040;             /* C.RED — always elevated state */
}
.gam-hn-close {
  background: transparent;
  border: none;
  color: #5c6370;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  line-height: 1;
}
.gam-hn-close:hover { color: #e8eaed; }
```

### Section headers

Three distinct section identity colors — mirrors item #20 spec exactly:

| Section | Label | Color |
|---|---|---|
| SUS USERS | `N SUS USERS` | `#f04040` (RED) |
| DEATH ROW | `N DR READY` or `N DR PENDING` | `#a78bfa` (PURPLE) |
| MODMAIL | `N HOT MODMAILS` | `#ff9933` (WARN/amber) |

```css
.gam-hn-section { padding: 10px 14px 4px; }
.gam-hn-section-hdr {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-bottom: 6px;
}
.gam-hn-sep {
  height: 1px;
  background: #2a2f38;
  margin: 6px 0;
}
```

### Row anatomy — SUS section

```
[3px left gutter: RED] [username 12px bold] [reason 10px #8b929e truncate]  [47 🔥 tabular RED]  [▶ Open]
```

Left gutter color codes intensity:
- `comment_count_24h > 15` → `#f04040` (RED, critical)
- `comment_count_24h > 8` → `#ff9933` (WARN, elevated)
- else → `#a78bfa` (PURPLE, flagged but not hot)

```css
.gam-hn-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px 5px 11px;
  border-left: 3px solid transparent;
  font-size: 12px;
  line-height: 1.3;
}
.gam-hn-row:hover { background: rgba(255,255,255,0.03); }
.gam-hn-user { font-weight: 700; flex-shrink: 0; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gam-hn-reason { color: #8b929e; font-size: 10px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gam-hn-count {
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  white-space: nowrap;
}
.gam-hn-act {
  background: transparent;
  border: 1px solid #3a3f48;
  border-radius: 3px;
  color: #8b929e;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 80ms, color 80ms;
}
.gam-hn-act:hover { border-color: #4A9EFF; color: #4A9EFF; }
.gam-hn-act.gam-hn-act-danger:hover { border-color: #f04040; color: #f04040; }
```

### Row anatomy — DR section

```
[3px left gutter: PURPLE] [username bold] [reason 10px]  [READY / 3m ago tabular]  [▶ Execute]  [✕ Cancel]
```

READY rows: gutter `#f04040`, time label `READY` in red.
PENDING rows: gutter `#a78bfa`, time label `in Xm` in purple.

Execute button: `.gam-hn-act.gam-hn-act-danger` (hovers red).
Cancel button: `.gam-hn-act` (neutral, calls `removeFromDeathRow(username)` + refreshes panel).

### Row anatomy — Modmail section

```
[3px left gutter: AMBER or RED*] [sender bold] [subject 10px truncate]  [3m ago tabular amber]  [Open →]
```

*Prior-ban senders (username in SUS map or `banned` in roster) get RED left gutter instead of amber.
"Open →" button: navigates to `/modmail/thread/<thread_id>` via `window.location.href` and closes panel.

### Scrollable body

```css
.gam-hn-body {
  overflow-y: auto;
  flex: 1;
  /* thin scrollbar — matches existing modtools.js pattern */
  scrollbar-width: thin;
  scrollbar-color: #3a3f48 transparent;
}
```

### Empty state

Each section individually: if zero rows, a single centered 11px `#5c6370` line:
`"No active SUS users"` / `"Queue empty"` / `"No flagged threads"`

No global "nothing to show" — the panel only appears when SIREN chip is visible (`total > 0`), so at minimum one section has data.

### Footer

```css
.gam-hn-footer {
  border-top: 1px solid #2a2f38;
  padding: 7px 14px;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}
.gam-hn-footer-link {
  font-size: 10px;
  color: #5c6370;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
}
.gam-hn-footer-link:hover { color: #8b929e; }
```

Footer text: `"View mod log →"` — calls `closeAllPanels(); openModLog();`

---

## D. SIREN HANDLER REWIRE

**File:** `modtools.js`  
**Line:** 15148 (confirmed by grep)

```js
// BEFORE — modtools.js:15147-15148
const sirenBtn = el('button', { id:'gam-siren-count', cls:'gam-bar-icon', style:{display:'none'}, title:'Live status — click to open mod log' });
sirenBtn.addEventListener('click', openModLog);

// AFTER
const sirenBtn = el('button', { id:'gam-siren-count', cls:'gam-bar-icon', style:{display:'none'}, title:'Live status — click for Hot Now triage' });
sirenBtn.addEventListener('click', _showHotNowPanel);
```

The `title` attribute update is mandatory — it's the tooltip text visible on hover, and "open mod log" is now wrong.

**Also update the keyboard shortcut** (from `V11_CAT2_UX_FLOWS.md` §C, Ctrl+Shift+T):
```js
// modtools.js:9770 area — existing keyboard handler
// BEFORE:
if(k==='l'){ e.preventDefault(); openModLog(); return; }
// AFTER — add alongside existing 'l' binding, don't remove it:
if(k==='t'){ e.preventDefault(); _showHotNowPanel(); return; }
```

---

## E. SHIP-TONIGHT MINIMAL PATCH

**Goal:** smallest diff that changes SIREN click to meaningful triage. Two sections (SUS + DR Ready). Modmail section skipped (async fetch, no ship-tonight bloat).

### New function `_showHotNowPanel()` — ~120 LOC

```js
function _showHotNowPanel(){
  closeAllPanels();

  // ── build or reuse panel shell ──────────────────────────────────────
  let panel = document.getElementById('gam-hot-now-panel');
  if (!panel){
    panel = el('div', { id:'gam-hot-now-panel' });
    document.body.appendChild(panel);
  }
  panel.innerHTML = '';

  // ── header ──────────────────────────────────────────────────────────
  const closeBtn = el('button', { cls:'gam-hn-close', title:'Close' }, '×');
  closeBtn.addEventListener('click', _closeHotNowPanel);
  panel.appendChild(el('div', { cls:'gam-hn-header' },
    el('span', { cls:'gam-hn-title' }, '\u{1F6A8} HOT NOW'),
    closeBtn
  ));

  const body = el('div', { cls:'gam-hn-body' });
  panel.appendChild(body);

  // ── Section 1: SUS Users ─────────────────────────────────────────────
  const susRows = [..._susState.rows.values()]
    .sort((a,b) => (b.comment_count_24h||0) - (a.comment_count_24h||0))
    .slice(0, 5);
  const susSection = el('div', { cls:'gam-hn-section' });
  susSection.appendChild(el('div', {
    cls:'gam-hn-section-hdr',
    style:{ color:'#f04040' }
  }, susRows.length + ' SUS USER' + (susRows.length !== 1 ? 'S' : '')));
  if (susRows.length === 0){
    susSection.appendChild(el('div', { style:{color:'#5c6370',fontSize:'11px',padding:'4px 0'} }, 'No active SUS users'));
  } else {
    susRows.forEach(row => {
      const cnt = row.comment_count_24h || 0;
      const gutterColor = cnt > 15 ? '#f04040' : cnt > 8 ? '#ff9933' : '#a78bfa';
      const cntColor    = cnt > 8  ? '#f04040' : '#ff9933';
      const r = el('div', { cls:'gam-hn-row', style:{ borderLeftColor: gutterColor } });
      const openBtn = el('button', { cls:'gam-hn-act' }, 'Open');
      openBtn.addEventListener('click', () => {
        _closeHotNowPanel();
        openModConsole(row.username, null, 'intel');
      });
      r.appendChild(el('span', { cls:'gam-hn-user' }, row.username));
      r.appendChild(el('span', { cls:'gam-hn-reason' }, row.reason || ''));
      if (cnt > 0) r.appendChild(el('span', { cls:'gam-hn-count', style:{color:cntColor} }, cnt + '/24h'));
      r.appendChild(openBtn);
      susSection.appendChild(r);
    });
  }
  body.appendChild(susSection);
  body.appendChild(el('div', { cls:'gam-hn-sep' }));

  // ── Section 2: Death Row Ready ───────────────────────────────────────
  let drRows = getDeathRowReady().sort((a,b) => a.executeAt - b.executeAt).slice(0, 5);
  const drPending = drRows.length === 0;
  if (drPending) drRows = getDeathRowPending().sort((a,b) => a.executeAt - b.executeAt).slice(0, 5);
  const drSection = el('div', { cls:'gam-hn-section' });
  const drLabel = drPending
    ? (drRows.length + ' DR PENDING')
    : (drRows.length + ' DR READY');
  drSection.appendChild(el('div', {
    cls:'gam-hn-section-hdr',
    style:{ color:'#a78bfa' }
  }, drLabel));
  if (drRows.length === 0){
    drSection.appendChild(el('div', { style:{color:'#5c6370',fontSize:'11px',padding:'4px 0'} }, 'Queue empty'));
  } else {
    drRows.forEach(row => {
      const ready = Date.now() >= row.executeAt;
      const gutterColor = ready ? '#f04040' : '#a78bfa';
      const timeLabel   = ready ? 'READY' : 'in ' + timeUntil(row.executeAt);
      const timeColor   = ready ? '#f04040' : '#a78bfa';
      const r = el('div', { cls:'gam-hn-row', style:{ borderLeftColor: gutterColor } });
      const execBtn = el('button', { cls:'gam-hn-act gam-hn-act-danger' }, ready ? 'Execute' : 'Queue');
      execBtn.disabled = !ready;
      execBtn.addEventListener('click', () => {
        _closeHotNowPanel();
        openModConsole(row.username, null, 'ban');
      });
      const cancelBtn = el('button', { cls:'gam-hn-act' }, '×');
      cancelBtn.addEventListener('click', () => {
        removeFromDeathRow(row.username);
        rosterSetStatus(row.username, 'new');
        snack(row.username + ' removed from DR', 'info');
        _showHotNowPanel();  // re-render
      });
      r.appendChild(el('span', { cls:'gam-hn-user' }, row.username));
      r.appendChild(el('span', { cls:'gam-hn-reason' }, row.reason || ''));
      r.appendChild(el('span', { cls:'gam-hn-count', style:{color:timeColor} }, timeLabel));
      r.appendChild(execBtn);
      r.appendChild(cancelBtn);
      drSection.appendChild(r);
    });
  }
  body.appendChild(drSection);

  // ── footer ───────────────────────────────────────────────────────────
  const footerLink = el('button', { cls:'gam-hn-footer-link' }, 'View mod log →');
  footerLink.addEventListener('click', () => { _closeHotNowPanel(); openModLog(); });
  panel.appendChild(el('div', { cls:'gam-hn-footer' }, footerLink));

  // ── open ─────────────────────────────────────────────────────────────
  requestAnimationFrame(() => panel.classList.add('gam-hn-open'));
  panelOpen = 'hotnow';
}

function _closeHotNowPanel(){
  const panel = document.getElementById('gam-hot-now-panel');
  if (!panel) return;
  panel.classList.remove('gam-hn-open');
  setTimeout(() => { panel.remove(); }, 180);
  panelOpen = null;
}
```

**CSS injection** — add to the GAM_CSS template string (alongside existing panel rules):

```css
#gam-hot-now-panel{position:fixed;top:0;bottom:36px;right:0;width:400px;max-width:95vw;background:${C.BG};border-left:1px solid ${C.BORDER2};box-shadow:-8px 0 30px rgba(0,0,0,.6);z-index:9999992;display:flex;flex-direction:column;font:12px -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;color:${C.TEXT};transform:translateX(100%);transition:transform 160ms cubic-bezier(0.0,0.0,0.2,1.0);overflow:hidden}
#gam-hot-now-panel.gam-hn-open{transform:translateX(0)}
.gam-hn-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px 8px;border-bottom:1px solid ${C.BORDER};flex-shrink:0}
.gam-hn-title{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.RED}}
.gam-hn-close{background:transparent;border:none;color:${C.TEXT3};cursor:pointer;font-size:16px;padding:0 2px;line-height:1}
.gam-hn-close:hover{color:${C.TEXT}}
.gam-hn-body{overflow-y:auto;flex:1;scrollbar-width:thin;scrollbar-color:${C.BORDER2} transparent}
.gam-hn-section{padding:10px 14px 4px}
.gam-hn-section-hdr{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px}
.gam-hn-sep{height:1px;background:${C.BORDER};margin:4px 0}
.gam-hn-row{display:flex;align-items:center;gap:8px;padding:5px 14px 5px 11px;border-left:3px solid transparent;font-size:12px;line-height:1.3}
.gam-hn-row:hover{background:rgba(255,255,255,0.03)}
.gam-hn-user{font-weight:700;flex-shrink:0;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gam-hn-reason{color:${C.TEXT2};font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gam-hn-count{font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;flex-shrink:0;white-space:nowrap}
.gam-hn-act{background:transparent;border:1px solid ${C.BORDER2};border-radius:3px;color:${C.TEXT2};font-size:10px;font-weight:600;padding:2px 7px;cursor:pointer;flex-shrink:0;transition:border-color 80ms,color 80ms}
.gam-hn-act:hover{border-color:${C.ACCENT};color:${C.ACCENT}}
.gam-hn-act:disabled{opacity:.4;cursor:default}
.gam-hn-act.gam-hn-act-danger:hover{border-color:${C.RED};color:${C.RED}}
.gam-hn-footer{border-top:1px solid ${C.BORDER};padding:7px 14px;display:flex;justify-content:flex-end;flex-shrink:0}
.gam-hn-footer-link{font-size:10px;color:${C.TEXT3};background:transparent;border:none;cursor:pointer;padding:0}
.gam-hn-footer-link:hover{color:${C.TEXT2}}
```

**Minimal diff summary:**
- 2-line change at line 15147-15148 (siren button title + handler)
- 1-line addition at keyboard handler ~line 9770 (Ctrl+Shift+T)
- `_showHotNowPanel()` + `_closeHotNowPanel()` functions (~130 LOC)
- CSS block added to GAM_CSS template (~20 rules, single-line compressed)
- `closeAllPanels()` already handles removal of any `.gam-modal` and backdrop — the hot-now panel uses its own `.gam-hn-open` class and explicit `_closeHotNowPanel()`, so no changes to `closeAllPanels()` are required. The panel's `id` is new (`gam-hot-now-panel`), not `gam-mc-panel`, avoiding the z-index collision documented at line 15676.

---

## F. STRETCH

### F1 — Modmail section (Section 3)

Add after DR section in `_showHotNowPanel()`. Fetch is async; show skeleton rows while loading:

```js
// after DR section is appended:
body.appendChild(el('div', { cls:'gam-hn-sep' }));
const mailSection = el('div', { cls:'gam-hn-section' });
const mailHdr = el('div', { cls:'gam-hn-section-hdr', style:{color:'#ff9933'} }, '... HOT MODMAILS');
mailSection.appendChild(mailHdr);
// skeleton while fetching
const skels = [0,1,2].map(() => el('div', { cls:'gam-hn-row gam-skeleton-shimmer', style:{height:'28px',borderRadius:'2px',marginBottom:'4px'} }));
skels.forEach(s => mailSection.appendChild(s));
body.appendChild(mailSection);

// async fill
rpcCall('modMessageInbox', {}).then(r => {
  skels.forEach(s => s.remove());
  const threads = ((r && r.ok && r.data && (Array.isArray(r.data) ? r.data : r.data.data)) || [])
    .filter(t => t.status === 'new' || t.unread)
    .sort((a,b) => (b.updated_at||0) - (a.updated_at||0))
    .slice(0, 3);
  mailHdr.textContent = threads.length + ' HOT MODMAIL' + (threads.length !== 1 ? 'S' : '');
  if (threads.length === 0){
    mailSection.appendChild(el('div', { style:{color:'#5c6370',fontSize:'11px',padding:'4px 0'} }, 'No flagged threads'));
    return;
  }
  threads.forEach(t => {
    const isSusSender = _susState.rows.has(String(t.sender || t.from || '').toLowerCase());
    const gutterColor = isSusSender ? '#f04040' : '#ff9933';
    const age = t.updated_at ? timeAgo(t.updated_at * 1000) : '';
    const r = el('div', { cls:'gam-hn-row', style:{borderLeftColor:gutterColor} });
    const openBtn = el('button', { cls:'gam-hn-act' }, 'Open');
    const tid = t.thread_id || t.id || '';
    openBtn.addEventListener('click', () => {
      _closeHotNowPanel();
      window.location.href = '/modmail/thread/' + tid;
    });
    r.appendChild(el('span', { cls:'gam-hn-user' }, t.sender || t.from || '?'));
    r.appendChild(el('span', { cls:'gam-hn-reason' }, (t.subject || '').slice(0, 50)));
    if (age) r.appendChild(el('span', { cls:'gam-hn-count', style:{color:'#ff9933'} }, age));
    r.appendChild(openBtn);
    mailSection.appendChild(r);
  });
}).catch(() => {
  skels.forEach(s => s.remove());
  mailSection.appendChild(el('div', { style:{color:'#5c6370',fontSize:'11px'} }, 'Modmail unavailable'));
});
```

### F2 — Brigade alerts section (Section 4, Feature 4 dependent)

```js
// After modmail section, gated:
if (Array.isArray(window._gamBrigadeAlerts) && window._gamBrigadeAlerts.length > 0){
  body.appendChild(el('div', { cls:'gam-hn-sep' }));
  const brigSection = el('div', { cls:'gam-hn-section' });
  const alerts = window._gamBrigadeAlerts.slice(0, 3);
  brigSection.appendChild(el('div', { cls:'gam-hn-section-hdr', style:{color:'#7cb8ff'} }, alerts.length + ' BRIGADE SIGNALS'));
  alerts.forEach(a => {
    const r = el('div', { cls:'gam-hn-row', style:{borderLeftColor:'#7cb8ff'} });
    r.appendChild(el('span', { cls:'gam-hn-user' }, a.thread_title || 'Thread'));
    r.appendChild(el('span', { cls:'gam-hn-reason' }, a.account_count + ' new accounts · ' + a.novel_pct + '% novel'));
    const openBtn = el('button', { cls:'gam-hn-act' }, 'Inspect');
    openBtn.addEventListener('click', () => { _closeHotNowPanel(); /* open thread intel panel */ });
    r.appendChild(openBtn);
    brigSection.appendChild(r);
  });
  body.appendChild(brigSection);
}
```

### F3 — AI confidence pills on SUS rows

When worker `/mod/user/sus` returns an `ai_score` field (0-100 integer), append a pill to each SUS row:

```js
if (row.ai_score != null){
  const pill = el('span', {
    style: {
      fontSize:'9px', fontWeight:'700', letterSpacing:'.5px',
      padding:'1px 5px', borderRadius:'2px',
      background: row.ai_score > 80 ? 'rgba(240,64,64,.2)' : 'rgba(255,153,51,.15)',
      color:       row.ai_score > 80 ? '#f04040' : '#ff9933',
      flexShrink:  '0'
    }
  }, row.ai_score + '% CONF');
  r.appendChild(pill);
}
```

### F4 — Multi-mod claimed indicator

When a DR entry has `claimed_by` populated (requires worker schema addition), show a `[👁 alice]` badge on the row in `#3dd68c` (green) so mods don't double-execute.

### F5 — Auto-open on escalation

From item #20 stretch: when `_updateSirenChip()` transitions from WARN to ALERT state (i.e., `isHot` goes from false to true), auto-open the panel without a click:

```js
// Inside _updateSirenChip(), after isHot is computed:
const wasHot = sirenBtn.getAttribute('data-was-hot') === '1';
if (isHot && !wasHot && !panelOpen){
  _showHotNowPanel();
}
sirenBtn.setAttribute('data-was-hot', isHot ? '1' : '0');
```

This requires that `_showHotNowPanel` is defined before `_updateSirenChip` in the file, which it is if placed in the MOD LOG + HELP section block (~line 8777+).

---

*Word count: ~2,400. Ship-tonight patch: sections A + D + E. Stretch: F1 (next sprint), F2 (post Feature-4), F3-F5 (polish pass).*
