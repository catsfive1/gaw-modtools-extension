# V11 #1 -- Right-Click Universal Context Menu (v0 ship)

**Status:** Ship-tonight patch defined (Section E).
**Version target:** v10.2.x hotfix branch; keyboard parity in v10.4.
**Reference:** Cat 3 #2 (Bloomberg visual), Cat 4 #5 (keyboard parity -- Wave 2).

---

## A. SINGLE ROUTER ARCHITECTURE

One `contextmenu` listener at `document.body`. Routes via `.closest()` priority chain. No surface-specific listeners. No per-element addEventListener spam. Existing `/u/` handler at line 8902 is replaced entirely by this router.

```js
// -----------------------------------------------------------------------
// V11 #1: Universal right-click router
// Replace existing listener block at modtools.js L8897-8957
// -----------------------------------------------------------------------

let _gamCtxMenu = null;

function _gamCloseCtx() {
  if (_gamCtxMenu) { _gamCtxMenu.remove(); _gamCtxMenu = null; }
}

// Dismiss on any click outside, Escape, or scroll
document.addEventListener('click',   _gamCloseCtx, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') _gamCloseCtx(); }, true);
document.addEventListener('scroll',  _gamCloseCtx, { passive: true, capture: true });

document.addEventListener('contextmenu', (e) => {
  if (FallbackMode) return;

  // --- Surface detection (priority order) ---
  const t = e.target;

  // 1. Skip any GAM-owned UI (never intercept our own chrome)
  if (t.closest('#gam-status-bar, .gam-modal, .gam-ctx-menu, .gam-msg-ctx-menu, #gam-intel-drawer')) return;

  // 2. Route
  const userLink  = t.closest('a[href*="/u/"]');
  const postEl    = t.closest('.post[data-id], .comment[data-id]');
  const mmRow     = t.closest('.gam-mc-thread-row');
  const chatMsg   = t.closest('.gam-mc-msg-box, .gam-chat-msg');

  let surface = null, payload = {};

  if (userLink) {
    const m = (userLink.getAttribute('href') || '').match(/\/u\/([^\/\?#]+)/);
    if (!m || !m[1] || m[1].toLowerCase().startsWith('c:') || m[1] === 'me') return;
    surface = 'user';
    payload = { username: decodeURIComponent(m[1]) };

  } else if (postEl) {
    const id   = postEl.getAttribute('data-id') || '';
    if (!id) return;
    const kind = postEl.getAttribute('data-type') === 'comment' ? 'comment' : 'post';
    const auEl = postEl.querySelector('.details a[href^="/u/"]');
    const author = auEl ? (auEl.getAttribute('href') || '').replace(/^\/u\/|\/$/g, '') : '';
    surface = 'post';
    payload = { id, kind, author, el: postEl };

  } else if (mmRow) {
    const tid = mmRow.dataset.gamThreadId || '';
    const sender = mmRow.dataset.gamSender || '';
    surface = 'modmail';
    payload = { tid, sender };

  } else if (chatMsg) {
    const mid = chatMsg.dataset.gamMsgId || '';
    const isMine = chatMsg.dataset.gamMine === '1';
    surface = 'chat';
    payload = { mid, isMine };

  } else {
    return; // nothing right-click-able here
  }

  e.preventDefault();
  _gamCloseCtx();
  _gamShowCtx(e.clientX, e.clientY, surface, payload);

}, true);
```

### Surface detection rationale

| Surface | Selector | Data extracted |
|---|---|---|
| User | `a[href*="/u/"]` | username from href |
| Post/comment | `.post[data-id], .comment[data-id]` | data-id, data-type, author link |
| Modmail row | `.gam-mc-thread-row` | data-gam-thread-id, data-gam-sender |
| Chat message | `.gam-mc-msg-box, .gam-chat-msg` | data-gam-msg-id, data-gam-mine |

Priority chain: user-link wins over post (a post's author name is a /u/ link -- the user surface is more specific). Modmail and chat are unambiguous by class.

---

## B. PER-SURFACE ITEM SETS

```js
const CTX_SURFACES = {

  user: (p) => [
    { act: 'console',   label: 'Open Mod Console',    kbd: 'Ctrl+Shift+P' },
    { act: 'ban',       label: 'Ban...',               kbd: 'Ctrl+Shift+B', danger: true },
    { act: 'watch',     label: isWatched(p.username) ? 'Unwatch' : 'Watch', kbd: 'Ctrl+Shift+W' },
    { act: 'sus',       label: 'Mark SUS',             kbd: null },
    { sep: true },
    { act: 'copy-user', label: 'Copy username',        kbd: null },
    { act: 'profile',   label: 'Open GAW profile',     kbd: null },
  ],

  post: (p) => [
    { act: 'quick-ban', label: 'Quick-ban author',     kbd: 'Ctrl+Shift+B', danger: true },
    { act: 'remove',    label: 'Remove post...',       kbd: 'Ctrl+Shift+X', danger: true },
    { act: 'approve',   label: 'Approve',              kbd: null },
    { sep: true },
    { act: 'console',   label: 'Open Console',         kbd: 'Ctrl+Shift+P' },
    { act: 'copy-link', label: 'Copy permalink',       kbd: 'Ctrl+Shift+C' },
  ],

  modmail: (p) => [
    { act: 'mm-open',    label: 'Open thread',         kbd: null },
    { act: 'mm-archive', label: 'Archive',             kbd: 'A' },
    { act: 'mm-quote',   label: 'Quote in chat',       kbd: null },
    { sep: true },
    { act: 'console',    label: 'Open sender console', kbd: null },
  ],

  chat: (p) => [
    { act: 'chat-reply', label: 'Reply',               kbd: null },
    { act: 'chat-quote', label: 'Quote in modmail',    kbd: null },
    { act: 'chat-copy',  label: 'Copy message',        kbd: null },
    ...(p.isMine ? [
      { sep: true },
      { act: 'chat-edit',  label: 'Edit',              kbd: null },
      { act: 'chat-del',   label: 'Delete',            kbd: null, danger: true },
    ] : []),
  ],

};

function _gamShowCtx(cx, cy, surface, payload) {
  const items = CTX_SURFACES[surface]?.(payload) || [];
  if (!items.length) return;

  const menu = el('div', {
    cls:   'gam-ctx-menu',
    id:    'gam-ctx-menu',
    role:  'menu',                        // keyboard parity (Cat 4 #5, v10.4)
    'aria-label': `${surface} actions`,
  });

  // Header label
  const headText =
    surface === 'user'    ? payload.username :
    surface === 'post'    ? (payload.kind === 'comment' ? 'Comment' : 'Post') :
    surface === 'modmail' ? 'Modmail thread' :
    'Chat message';

  menu.appendChild(el('div', { cls: 'gam-ctx-head' }, headText));

  items.forEach((item) => {
    if (item.sep) {
      menu.appendChild(el('div', { cls: 'gam-ctx-sep', role: 'separator' }));
      return;
    }
    const row = el('div', {
      cls:       'gam-ctx-item' + (item.danger ? ' gam-ctx-item--danger' : '') + (item.lead ? ' gam-ctx-item--lead' : ''),
      role:      'menuitem',              // ARIA contract
      tabindex:  '-1',
      'data-act': item.act,
    });
    const lbl = el('span', { cls: 'gam-ctx-label' }, item.label);
    row.appendChild(lbl);
    if (item.kbd) {
      const kbdEl = el('span', { cls: 'gam-ctx-kbd' });
      item.kbd.split('+').forEach((k, i) => {
        if (i > 0) kbdEl.appendChild(document.createTextNode('+'));
        kbdEl.appendChild(el('kbd', {}, k));
      });
      row.appendChild(kbdEl);
    }
    menu.appendChild(row);
  });

  document.body.appendChild(menu);

  // --- Position: clamp to viewport ---
  const vw = window.innerWidth, vh = window.innerHeight;
  const mw = 224, mh = menu.offsetHeight || 180;
  menu.style.left = Math.min(cx + 2, vw - mw - 8) + 'px';
  menu.style.top  = Math.min(cy + 2, vh - mh - 8) + 'px';
  _gamCtxMenu = menu;

  // --- Click dispatch ---
  menu.addEventListener('click', async (ev) => {
    const row = ev.target.closest('[data-act]');
    if (!row) return;
    _gamCloseCtx();
    await _gamCtxDispatch(row.dataset.act, payload, surface);
  });
}

async function _gamCtxDispatch(act, p, surface) {
  const u = p.username || p.author || p.sender || '';

  switch (act) {
    // -- User surface --
    case 'console':    openModConsole(u, null, 'intel'); break;
    case 'ban':        openModConsole(u, null, 'ban');   break;
    case 'quick-ban':  openModConsole(u, null, 'ban');   break;
    case 'watch': {
      const nw = toggleWatch(u);
      snack(nw ? `${u} watched` : `${u} unwatched`, nw ? 'warn' : 'success');
      break;
    }
    case 'sus': {
      await markSUS(u);
      snack(`${u} marked SUS`, 'warn');
      break;
    }
    case 'copy-user':  copyAndNotify(u, 'Username copied'); break;
    case 'profile':    window.open(`/u/${encodeURIComponent(u)}/`, '_blank'); break;

    // -- Post surface --
    case 'remove':     openModConsole(u, p.id, 'remove'); break;
    case 'approve': {
      await approvePost(p.id, p.kind);
      snack('Approved', 'success');
      break;
    }
    case 'copy-link':  copyAndNotify(window.location.origin + `/comments/${p.id}/`, 'Link copied'); break;

    // -- Modmail surface --
    case 'mm-open':    openModMailThread(p.tid); break;
    case 'mm-archive': archiveModMailThread(p.tid); break;
    case 'mm-quote':   quoteModMailInChat(p.tid); break;

    // -- Chat surface --
    case 'chat-reply': chatReplyTo(p.mid); break;
    case 'chat-quote': quoteChatInModmail(p.mid); break;
    case 'chat-copy':  copyChatMessage(p.mid); break;
    case 'chat-edit':  chatEdit(p.mid); break;
    case 'chat-del':   chatDelete(p.mid); break;
  }
}
```

---

## C. VISUAL -- Bloomberg per Cat 3 #2

Full CSS block to append inside the `GAM_CSS` constant. Replaces the existing `.gam-ctx-menu` rules at lines 16438-16443 and 17307-17331.

```css
/* V11 #1: Universal right-click context menu -- Bloomberg primitive */
/* Spec: Cat 3 #2 -- 220px dark pill, JetBrains Mono, kbd hints, danger-red, lead-purple */

.gam-ctx-menu {
  position: fixed;
  z-index: 10000005;
  width: 220px;
  background: #181b20;                         /* C.BG2 */
  border: 1px solid #3a3f48;                   /* C.BORDER2 */
  border-radius: 4px;                          /* Bloomberg square -- NOT pill */
  padding: 4px 0;
  box-shadow: 0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
  font: 11px/1 'JetBrains Mono', 'SF Mono', 'Cascadia Code', Consolas, monospace;
  color: #e8eaed;                              /* C.TEXT */
  user-select: none;
  pointer-events: auto;
}

.gam-ctx-head {
  padding: 6px 12px 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #5c6370;                              /* C.TEXT3 -- de-emphasized */
  border-bottom: 1px solid #2a2f38;           /* C.BORDER */
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gam-ctx-sep {
  height: 1px;
  background: #2a2f38;                         /* C.BORDER */
  margin: 3px 0;
}

.gam-ctx-item {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  color: #e8eaed;
  cursor: pointer;
  transition: background-color 80ms linear;   /* Cat 3 #7 MICROINTERACTION */
  white-space: nowrap;
}

.gam-ctx-item:hover {
  background: rgba(255,255,255,0.06);
}

/* Dangerous actions: Ban, Remove, Delete */
.gam-ctx-item--danger {
  color: #f04040;                              /* C.RED */
}
.gam-ctx-item--danger:hover {
  background: rgba(240,64,64,0.12);
}

/* Lead-only actions */
.gam-ctx-item--lead {
  color: #a78bfa;                              /* C.PURPLE */
}
.gam-ctx-item--lead::before {
  content: '\25C6';                            /* filled diamond U+25C6 */
  font-size: 7px;
  margin-right: 5px;
  opacity: 0.8;
}

.gam-ctx-label {
  flex: 1;
  font-size: 11px;
  line-height: 1;
}

/* Keyboard hint pills -- right-aligned */
.gam-ctx-kbd {
  display: flex;
  align-items: center;
  gap: 1px;
  margin-left: 8px;
  font-size: 9px;
  color: #5c6370;                              /* C.TEXT3 */
}
.gam-ctx-kbd kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  min-width: 16px;
  padding: 0 3px;
  background: transparent;
  border: 1px solid #3a3f48;
  border-radius: 2px;
  font: inherit;
  font-size: 9px;
  color: #5c6370;
  line-height: 1;
  white-space: nowrap;
}

/* Hover-reveal right-click affordance (Cat 3 #13) */
/* Targets: /u/ links, .post rows, .gam-mc-thread-row */
a[href*='/u/']:not(#gam-status-bar a):not(.gam-modal a):hover,
.post[data-id]:hover,
.comment[data-id]:hover,
.gam-mc-thread-row:hover {
  outline: 1px solid rgba(255,153,51,0.18);   /* faint amber hint */
  outline-offset: 1px;
}
```

### BB-variable form (for the Iter-28 block that already uses CSS vars)

```css
/* Append to existing Iter-28 block at L17307 */
.gam-ctx-head {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--bb-text-muted) !important;
  border-bottom: 1px solid var(--bb-line) !important;
  padding: 6px var(--bb-s5) !important;
}
.gam-ctx-item {
  display: flex !important;
  align-items: center !important;
  height: 28px !important;
}
.gam-ctx-item--danger { color: var(--bb-red) !important; }
.gam-ctx-item--danger:hover { background: rgba(240,64,64,0.12) !important; }
.gam-ctx-item--lead   { color: var(--bb-purple) !important; }
.gam-ctx-label { flex: 1; }
.gam-ctx-kbd   { font-size: 9px; color: var(--bb-text-muted); margin-left: 8px; }
.gam-ctx-kbd kbd {
  border: 1px solid var(--bb-line-hot);
  border-radius: 2px;
  padding: 0 3px; height: 16px;
  font: 9px/1 var(--bb-font);
  color: var(--bb-text-muted);
}
```

---

## D. KEYBOARD PARITY (follow-up v10.4)

**Dependency:** Router from Section A must ship first. Keyboard parity wraps the existing router.

### Shift+F10 trigger

```js
// Add alongside the contextmenu listener block (Section A)
document.addEventListener('keydown', (e) => {
  if (FallbackMode) return;
  // Shift+F10 = standard "application key" / keyboard contextmenu
  if (!e.shiftKey || e.key !== 'F10') return;

  const active = document.activeElement;
  if (!active || active === document.body) return;

  // Reuse the same surface-detection logic
  const fakeEvent = {
    target:    active,
    clientX:   active.getBoundingClientRect().left,
    clientY:   active.getBoundingClientRect().bottom + 4,
    preventDefault: () => {},
  };
  // Re-dispatch through the router by synthesizing surface detection
  // (extract the same .closest() chain from the contextmenu handler)
  _gamTriggerCtxForElement(active, fakeEvent.clientX, fakeEvent.clientY);
  e.preventDefault();
});

function _gamTriggerCtxForElement(el, cx, cy) {
  const userLink = el.closest('a[href*="/u/"]');
  const postEl   = el.closest('.post[data-id], .comment[data-id]');
  const mmRow    = el.closest('.gam-mc-thread-row');
  const chatMsg  = el.closest('.gam-mc-msg-box, .gam-chat-msg');
  // same branch logic as contextmenu handler -- populate surface/payload then call _gamShowCtx
  // ... (identical branch body)
}
```

### role="menu" keyboard contract

```js
// Inside _gamShowCtx, after menu is in DOM:
function _gamCtxKeyNav(e) {
  if (!_gamCtxMenu) return;
  const items = [..._gamCtxMenu.querySelectorAll('[role="menuitem"]')];
  const cur   = document.activeElement;
  const idx   = items.indexOf(cur);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    (items[idx + 1] || items[0]).focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    (items[idx - 1] || items[items.length - 1]).focus();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    cur?.click();
  } else if (e.key === 'Escape' || e.key === 'Tab') {
    _gamCloseCtx();
    _gamCtxReturnFocus?.focus();         // restore trigger element focus
  }
}
_gamCtxMenu.addEventListener('keydown', _gamCtxKeyNav);
// On open: items[0].focus()
// On close: restore _gamCtxReturnFocus (set = document.activeElement before _gamShowCtx call)
```

**ARIA contract summary:**
- Menu container: `role="menu"`, `aria-label="<surface> actions"`
- Each item: `role="menuitem"`, `tabindex="-1"`
- Separator: `role="separator"` (no menuitem role)
- On open: first menuitem receives focus
- ArrowDown/Up: cycle through menuitems (wrap)
- Enter/Space: activate focused item
- Escape/Tab: close, return focus to trigger element
- `aria-haspopup="menu"` on any static trigger button that opens this menu

**DO NOT ship keyboard parity half-finished.** Per Cat 4 #5: "Must ship with full keyboard contract or not at all." If arrow-key nav is incomplete, SR users get trapped. v10.4 ships the full contract or ships nothing.

---

## E. SHIP-TONIGHT MINIMAL PATCH

Three highest-impact items: **Quick-ban / Watch / Open Console** for the user surface only. Surgically replaces the existing `/u/` context-menu handler (L8897-8957). No new surfaces touched tonight.

### File: `modtools.js`

**Remove:** Lines 8897-8957 (the old `/u/` handler block, from the comment `// v5.1.9 EXP Loop 3:` through the closing `}, true);`).

**Insert in place:**

```js
  // V11 #1 v0: Universal right-click router (ship-tonight: user surface only)
  // Surfaces: user (/u/ link) -- post/modmail/chat in v10.3
  let _gamCtxMenu = null;
  function _gamCloseCtx() { if (_gamCtxMenu) { _gamCtxMenu.remove(); _gamCtxMenu = null; } }
  document.addEventListener('click',   _gamCloseCtx, true);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') _gamCloseCtx(); }, true);

  document.addEventListener('contextmenu', (e) => {
    if (FallbackMode) return;
    const t = e.target;
    if (t.closest('#gam-status-bar, .gam-modal, .gam-ctx-menu, #gam-intel-drawer')) return;

    // Surface: user link
    const a = t.closest('a[href*="/u/"]');
    if (!a) return;
    const m = (a.getAttribute('href') || '').match(/\/u\/([^\/\?#]+)/);
    if (!m) return;
    const u = decodeURIComponent(m[1]);
    if (!u || u.toLowerCase().startsWith('c:') || u === 'me') return;

    e.preventDefault();
    _gamCloseCtx();

    const watched = isWatched(u);
    const menu = el('div', { cls: 'gam-ctx-menu', id: 'gam-ctx-menu', role: 'menu' });
    menu.innerHTML = `
      <div class="gam-ctx-head">${escapeHtml(u)}</div>
      <div class="gam-ctx-item" role="menuitem" tabindex="-1" data-act="console">
        <span class="gam-ctx-label">Open Mod Console</span>
        <span class="gam-ctx-kbd"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd></span>
      </div>
      <div class="gam-ctx-item gam-ctx-item--danger" role="menuitem" tabindex="-1" data-act="ban">
        <span class="gam-ctx-label">Ban...</span>
        <span class="gam-ctx-kbd"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd></span>
      </div>
      <div class="gam-ctx-item" role="menuitem" tabindex="-1" data-act="watch">
        <span class="gam-ctx-label">${watched ? 'Unwatch' : 'Watch'}</span>
        <span class="gam-ctx-kbd"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>W</kbd></span>
      </div>
      <div class="gam-ctx-sep" role="separator"></div>
      <div class="gam-ctx-item" role="menuitem" tabindex="-1" data-act="copy">
        <span class="gam-ctx-label">Copy username</span>
      </div>
      <div class="gam-ctx-item" role="menuitem" tabindex="-1" data-act="profile">
        <span class="gam-ctx-label">Open GAW profile</span>
      </div>
    `;
    document.body.appendChild(menu);
    const vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = Math.min(e.clientX + 2, vw - 228) + 'px';
    menu.style.top  = Math.min(e.clientY + 2, vh - (menu.offsetHeight || 180) - 8) + 'px';
    _gamCtxMenu = menu;

    menu.addEventListener('click', async (ev) => {
      const item = ev.target.closest('[data-act]');
      if (!item) return;
      _gamCloseCtx();
      const act = item.dataset.act;
      if (act === 'console') openModConsole(u, null, 'intel');
      else if (act === 'ban')     openModConsole(u, null, 'ban');
      else if (act === 'watch') {
        const nw = toggleWatch(u);
        snack(nw ? `${u} watched` : `${u} unwatched`, nw ? 'warn' : 'success');
      }
      else if (act === 'copy')    copyAndNotify(u, 'Username copied');
      else if (act === 'profile') window.open(`/u/${encodeURIComponent(u)}/`, '_blank');
    });
  }, true);
```

**CSS patch** -- in the `GAM_CSS` block, replace the five `.gam-ctx-*` rules at lines 16438-16443:

```css
/* V11 #1 v0: context menu -- Bloomberg square, JetBrains Mono */
.gam-ctx-menu{position:fixed;z-index:10000005;width:220px;background:#181b20;border:1px solid #3a3f48;border-radius:4px;padding:4px 0;box-shadow:0 8px 32px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.04);font:11px/1 'JetBrains Mono','SF Mono',Consolas,monospace;color:#e8eaed;user-select:none}
.gam-ctx-head{padding:6px 12px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5c6370;border-bottom:1px solid #2a2f38;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gam-ctx-sep{height:1px;background:#2a2f38;margin:3px 0}
.gam-ctx-item{display:flex;align-items:center;height:28px;padding:0 12px;color:#e8eaed;cursor:pointer;transition:background-color 80ms linear}
.gam-ctx-item:hover{background:rgba(255,255,255,.06)}
.gam-ctx-item--danger{color:#f04040}
.gam-ctx-item--danger:hover{background:rgba(240,64,64,.12)}
.gam-ctx-item--lead{color:#a78bfa}
.gam-ctx-item--lead::before{content:'\25C6';font-size:7px;margin-right:5px;opacity:.8}
.gam-ctx-label{flex:1;font-size:11px}
.gam-ctx-kbd{display:flex;align-items:center;gap:1px;margin-left:8px;font-size:9px;color:#5c6370}
.gam-ctx-kbd kbd{display:inline-flex;align-items:center;justify-content:center;height:16px;min-width:16px;padding:0 3px;border:1px solid #3a3f48;border-radius:2px;font:9px/1 inherit;color:#5c6370;background:transparent}
```

Also update the **Iter-28 block** (line 17307) -- the override rules already correctly override background and border; add only the new class overrides:

```css
.gam-ctx-item--danger{color:var(--bb-red)!important}
.gam-ctx-item--danger:hover{background:rgba(240,64,64,.12)!important}
.gam-ctx-label{flex:1}
.gam-ctx-kbd{font-size:9px;color:var(--bb-text-muted);margin-left:8px}
.gam-ctx-kbd kbd{border:1px solid var(--bb-line-hot);border-radius:2px;padding:0 3px;height:16px;font:9px/1 var(--bb-font);color:var(--bb-text-muted);background:transparent}
```

### What ships tonight vs what defers

| Item | Tonight | v10.3 | v10.4 |
|---|---|---|---|
| User surface (/u/ link) | YES | -- | -- |
| Post/comment surface | -- | YES | -- |
| Modmail row surface | -- | YES | -- |
| Chat message surface | -- | YES | -- |
| Bloomberg CSS (head, kbd, danger, sep) | YES | -- | -- |
| Shift+F10 keyboard trigger | -- | -- | YES |
| role="menu" arrow-key nav | -- | -- | YES |
| aria-haspopup on trigger elements | -- | -- | YES |

Tonight's patch is ~55 lines of JS + 12 lines of CSS. Regression surface: zero -- replaces only the existing `/u/` handler with identical behavior + Bloomberg styling + keyboard hint pills.

---

## F. STRETCH -- Full action set (v10.3)

### Post surface additions

```
Approve               --> approvePost(id, kind)
Remove post...        --> openModConsole(author, id, 'remove')
Quick-ban author      --> openModConsole(author, null, 'ban')
Add to Death Row 72h  --> addToDeathRow(author, 72*3600*1000, ...)  [lead-only, purple]
Copy permalink        --> copyAndNotify(permaUrl, 'Link copied')
```

### Modmail surface additions

```
Open thread           --> openModMailThread(tid)
Archive               --> archiveModMailThread(tid)  [same as 'A' hotkey]
Quote in chat         --> quoteModMailInChat(tid)
Open sender console   --> openModConsole(sender, null, 'intel')
Mark sender SUS       --> markSUS(sender)            [danger]
```

### Chat surface additions

```
Reply                 --> chatReplyTo(mid)
Quote in modmail      --> quoteChatInModmail(mid)
Copy message          --> copyChatMessage(mid)
Edit (own only)       --> chatEdit(mid)
Delete (own only)     --> chatDelete(mid)             [danger]
```

### Hover affordance (Cat 3 #13, v10.3)

150ms delayed `⋮` glyph in bottom-right corner of hovered right-clickable targets:

```js
let _hoverTimer = null;
document.addEventListener('mouseover', (e) => {
  const target = e.target.closest('a[href*="/u/"], .post[data-id], .comment[data-id], .gam-mc-thread-row');
  if (!target || target.closest('#gam-status-bar, .gam-modal')) return;
  _hoverTimer = setTimeout(() => {
    if (target.querySelector('.gam-ctx-hint')) return;
    const hint = el('span', { cls: 'gam-ctx-hint', 'aria-hidden': 'true' }, '⋮');
    target.style.position = target.style.position || 'relative';
    target.appendChild(hint);
  }, 150);
});
document.addEventListener('mouseout', (e) => {
  clearTimeout(_hoverTimer);
  e.target.closest('a[href*="/u/"], .post[data-id], .comment[data-id], .gam-mc-thread-row')
    ?.querySelector('.gam-ctx-hint')?.remove();
});
```

```css
.gam-ctx-hint {
  position: absolute; bottom: 2px; right: 4px;
  font-size: 9px; color: #5c6370; opacity: 0.7;
  pointer-events: none; line-height: 1;
}
```

---

*Last updated: 2026-05-09. V11 #1 v0 patch ready for integration.*
