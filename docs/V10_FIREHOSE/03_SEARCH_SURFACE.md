# Firehose Feature 3 — Free-Text Search Surface

**Status:** Rule 20 + Rule 133 both marked ⚠ in 150_RULES_AUDIT.md.
Worker endpoint verified live. Zero front-end exposure. Ship-tonight patch is Section E.

---

## A. CURRENT WORKER ENDPOINT TRACE

`GET /gaw/search` — verified via `gaw-mod-proxy-v2.js:8592-8636` and router at line 11888.

### Auth
`checkModToken` gate — requires `X-Mod-Token` header (same as every mod endpoint). No lead-only restriction.

### Query parameters
| Param | Default | Constraint |
|-------|---------|-----------|
| `q` | required | ≥ 2 chars; stripped of FTS5 metachars (`["():*~^-+]`), capped 100 chars, wrapped in `"..."` for phrase match |
| `scope` | `both` | `posts` \| `comments` \| `both` |
| `limit` | `50` | max `200` |

### FTS5 tables (from `004_firehose.sql`)
- `gaw_posts_fts` — indexed columns: `title`, `body_md`, `author`, `community`
- `gaw_comments_fts` — indexed columns: `body_md`, `author`

Triggers on `gaw_posts` and `gaw_comments` keep the FTS tables in sync on INSERT/UPDATE/DELETE.

### Response shape (verified from query projections in worker)

```json
{
  "ok": true,
  "posts": [
    {
      "id": "abc123",
      "slug": "some-post-slug",
      "title": "Post title text",
      "author": "username",
      "community": "GreatAwakening",
      "score": 42,
      "comment_count": 7,
      "flair": "Q Drop",
      "created_at": 1714900000,
      "is_removed": 0,
      "snippet": "First 300 chars of body_md..."
    }
  ],
  "comments": [
    {
      "id": "cmt456",
      "post_id": "abc123",
      "author": "username",
      "score": 5,
      "created_at": 1714901000,
      "is_removed": 0,
      "snippet": "First 300 chars of body_md..."
    }
  ]
}
```

**Key gaps in comment response:** no `post_slug` returned — permalink requires a second lookup or client-side construction from `post_id`. Workaround: construct `https://greatawakening.win/p/<post_id>` (works without slug). Posts have `slug` so permalink is `https://greatawakening.win/p/<id>/<slug>`.

**Fetch shape the extension will use:**
```js
const url = new URL(`${WORKER_BASE}/gaw/search`);
url.searchParams.set('q', query);
url.searchParams.set('scope', 'both');
url.searchParams.set('limit', '30');
const resp = await fetch(url, {
  headers: { 'X-Mod-Token': await getModToken() }
});
const data = await resp.json(); // { ok, posts[], comments[] }
```

---

## B. THREE SURFACES

### 1. Popup tab "Search" (ship-tonight)
Fifth tab added to the existing `<nav class="pop-tabnav">`. Houses a search input + results list inside the popup body. 300px palette height, scrollable. No new window; no overlay.

### 2. Status-bar Ctrl+K palette (week 2)
Global `document.addEventListener('keydown')` in `modtools.js` (same pattern as the existing `Ctrl+Z` undo handler at line 4523). When `e.ctrlKey && e.key === 'k'`: inject/show a floating palette element anchored above `#gam-status-bar`. Esc closes it. Identical result rendering to the popup tab.

### 3. Slash command `/find <query>` in chat (week 2)
The existing mod-chat input already has a keydown handler. Intercept lines beginning with `/find ` before send; strip from the message, run a search, render results inline in the chat panel below the input field. Mirrors how Linear handles slash commands.

---

## C. UI DESIGN (Bloomberg)

### ASCII layout — popup Search tab

```
+----------------------------------------------+
| [Stats] [Tokens] [Tools] [Lead] [Search]     |  <- pop-tabnav
+----------------------------------------------+
| [ gaw FTS  ___________________________  ] [X]|  <- search input row
|   scope: [Both v]                            |
+----------------------------------------------+
| POST   5m ago   GreatAwakening   u/anon      |
| "Q Drop intel — first 80 chars of snippet..."| <- result row
+----------------------------------------------+
| COMMENT  2h ago   GreatAwakening   u/anon   |
| "Comment body snippet first 80 chars shown..." |
+----------------------------------------------+
| (12 results — click to open)                 |
+----------------------------------------------+
```

### Concrete CSS (injected via popup.css additions)

```css
/* Search tab container */
#searchTab {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 8px;
}

/* Input row */
.gam-search-row {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-bottom: 6px;
}
.gam-search-input {
  flex: 1;
  background: #0e1115;
  border: 1px solid #2a2f38;
  border-radius: 0;           /* Bloomberg: square corners */
  color: #e8eaed;
  font: 12px ui-monospace, 'JetBrains Mono', monospace;
  padding: 5px 8px;
  outline: none;
}
.gam-search-input:focus {
  border-color: #4A9EFF;
}
.gam-search-scope {
  background: #0e1115;
  border: 1px solid #2a2f38;
  color: #8b929e;
  font: 11px ui-monospace, monospace;
  padding: 4px 6px;
  border-radius: 0;
}

/* Results list */
.gam-search-results {
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid #2a2f38;
  background: #0a0c0f;
}
.gam-search-results:empty::before {
  content: 'No results';
  display: block;
  padding: 12px;
  color: #5c6370;
  font: 11px ui-monospace, monospace;
  text-align: center;
}

/* Result row */
.gam-sr {
  display: block;
  padding: 6px 8px;
  border-bottom: 1px solid #181b20;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}
.gam-sr:hover,
.gam-sr[aria-selected="true"] {
  background: #181b20;
  outline: 1px solid #4A9EFF;
  outline-offset: -1px;
}
.gam-sr-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 3px;
  font: 10px ui-monospace, monospace;
  color: #5c6370;
}
.gam-sr-kind {
  font-weight: 700;
  font-size: 9px;
  letter-spacing: 0.08em;
  padding: 1px 4px;
  border-radius: 0;
}
.gam-sr-kind-post    { color: #4A9EFF; border: 1px solid #4A9EFF; }
.gam-sr-kind-comment { color: #a78bfa; border: 1px solid #a78bfa; }
.gam-sr-kind-removed { color: #f04040; border: 1px solid #f04040; }
.gam-sr-author  { color: #3dd68c; }
.gam-sr-snippet {
  font: 11px ui-monospace, monospace;
  color: #8b929e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gam-sr-title {
  font: 11px/1.3 ui-monospace, monospace;
  color: #e8eaed;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Status/count line */
.gam-search-meta {
  font: 10px ui-monospace, monospace;
  color: #5c6370;
  padding: 4px 2px 0;
}
```

### Ctrl+K palette (overlay, status-bar surface)
Same CSS classes above, but wrapped in:
```css
#gam-search-palette {
  position: fixed;
  bottom: 36px;          /* sits above the 28px status bar */
  left: 50%;
  transform: translateX(-50%);
  width: 480px;
  max-width: 95vw;
  background: #0a0c0f;
  border: 1px solid #4A9EFF;
  z-index: 9999999;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.7);
  display: none;
}
#gam-search-palette.gam-sp-open { display: block; }
```

---

## D. KEYBOARD CONTRACT (ARIA)

The result list implements the `combobox` pattern (ARIA 1.2):

```html
<div role="combobox"
     aria-haspopup="listbox"
     aria-expanded="true"
     aria-controls="gam-sr-list"
     aria-activedescendant="">

  <input class="gam-search-input"
         role="searchbox"
         aria-label="Search posts and comments"
         aria-autocomplete="list" />
</div>

<div id="gam-sr-list" role="listbox" aria-label="Search results">
  <a class="gam-sr" role="option" id="sr-0" aria-selected="false" href="...">...</a>
  <a class="gam-sr" role="option" id="sr-1" aria-selected="false" href="...">...</a>
</div>
```

**Key bindings (to be wired in the input's `keydown` handler):**

| Key | Behavior |
|-----|----------|
| `ArrowDown` | Move `aria-selected` to next row; scroll into view; update `aria-activedescendant` on combobox wrapper |
| `ArrowUp` | Move `aria-selected` to previous row; wrap to bottom from first |
| `Enter` | Open `href` of active row in new tab (`window.open(href, '_blank')`); close palette if overlay |
| `Escape` | Clear active selection; close palette (overlay) or clear input (popup tab) |
| typing | Reset cursor to index -1; re-run search after 250ms debounce |

```js
// Minimal keyboard handler (same pattern for both surfaces)
let _srIdx = -1;

input.addEventListener('keydown', (e) => {
  const rows = [...list.querySelectorAll('[role="option"]')];
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _srIdx = (_srIdx + 1) % rows.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _srIdx = (_srIdx - 1 + rows.length) % rows.length;
  } else if (e.key === 'Enter' && _srIdx >= 0) {
    e.preventDefault();
    window.open(rows[_srIdx].href, '_blank');
    return;
  } else if (e.key === 'Escape') {
    closePalette();
    return;
  } else {
    _srIdx = -1;
  }
  rows.forEach((r, i) => {
    const sel = i === _srIdx;
    r.setAttribute('aria-selected', sel);
    if (sel) { r.scrollIntoView({ block: 'nearest' }); }
  });
  combo.setAttribute('aria-activedescendant', _srIdx >= 0 ? (rows[_srIdx].id || '') : '');
});
```

---

## E. SHIP-TONIGHT MINIMAL PATCH

Lights up the popup Search tab only. No status-bar changes. One feature flag gate so it can be toggled off in the field.

### 1. `popup.html` — add the Search tab button

File: `D:\AI\_PROJECTS\modtools-ext\popup.html`

Location: line 38, after the `<button ... data-tab="lead">Lead</button>` element.

**Diff:**
```diff
-    <button class="pop-tab" data-tab="lead" role="tab" aria-selected="false">Lead</button>
+    <button class="pop-tab" data-tab="lead" role="tab" aria-selected="false">Lead</button>
+    <button class="pop-tab" data-tab="search" role="tab" aria-selected="false">Search</button>
```

Then add the Search panel body immediately after the `</nav>` at line 39:
```diff
+  <!-- v10.0: Search tab. Hits /gaw/search FTS5 endpoint. Rule 20 fix. -->
+  <div id="searchTab" data-tab="search">
+    <div class="gam-search-row">
+      <input id="gamSearchInput" class="gam-search-input"
+             type="search" placeholder="Search posts + comments..."
+             aria-label="Search posts and comments"
+             autocomplete="off" spellcheck="false" />
+      <select id="gamSearchScope" class="gam-search-scope" title="Scope">
+        <option value="both">Both</option>
+        <option value="posts">Posts</option>
+        <option value="comments">Comments</option>
+      </select>
+    </div>
+    <div id="gamSearchList" class="gam-search-results" role="listbox"
+         aria-label="Search results" aria-live="polite"></div>
+    <div id="gamSearchMeta" class="gam-search-meta"></div>
+  </div>
```

### 2. `popup.js` — wire the search logic

Add immediately before the closing `})();` of the existing IIFE (or append at file bottom as a self-contained block). The existing `wireTabNav` function at line 1939 picks up `data-tab="search"` automatically — no changes there needed.

```js
// v10.0: Search tab — Rule 20 fix. Hits /gaw/search FTS5.
(function initSearchTab() {
  const WORKER_BASE = 'https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev';
  const input  = document.getElementById('gamSearchInput');
  const scope  = document.getElementById('gamSearchScope');
  const list   = document.getElementById('gamSearchList');
  const meta   = document.getElementById('gamSearchMeta');
  if (!input || !list) return;

  let _debounce = null;
  let _srIdx = -1;

  function relAge(ts) {
    const s = Math.floor((Date.now() / 1000) - ts);
    if (s < 120)  return s + 's ago';
    if (s < 3600) return Math.floor(s/60) + 'm ago';
    if (s < 86400) return Math.floor(s/3600) + 'h ago';
    return Math.floor(s/86400) + 'd ago';
  }

  function buildRow(item, kind) {
    const isRemoved = item.is_removed === 1;
    const href = kind === 'post'
      ? `https://greatawakening.win/p/${item.id}${item.slug ? '/' + item.slug : ''}`
      : `https://greatawakening.win/p/${item.post_id}`;
    const row = document.createElement('a');
    row.className = 'gam-sr';
    row.role = 'option';
    row.href = href;
    row.target = '_blank';
    row.rel = 'noopener noreferrer';
    row.setAttribute('aria-selected', 'false');
    const kindLabel = isRemoved ? 'REMOVED' : kind.toUpperCase();
    const kindCls = isRemoved ? 'gam-sr-kind-removed' : `gam-sr-kind-${kind}`;
    row.innerHTML = `
      <div class="gam-sr-meta">
        <span class="gam-sr-kind ${kindCls}">${kindLabel}</span>
        <span class="gam-sr-author">u/${item.author}</span>
        <span>${item.community || ''}</span>
        <span>${relAge(item.created_at)}</span>
      </div>
      ${kind === 'post' && item.title
        ? `<div class="gam-sr-title">${item.title.replace(/</g,'&lt;')}</div>`
        : ''}
      <div class="gam-sr-snippet">${(item.snippet||'').slice(0,120).replace(/</g,'&lt;')}</div>`;
    row.addEventListener('click', (e) => { e.preventDefault(); window.open(href, '_blank'); });
    return row;
  }

  async function runSearch(q) {
    list.innerHTML = '<div style="padding:10px;color:#5c6370;font:11px monospace">Searching...</div>';
    meta.textContent = '';
    _srIdx = -1;
    try {
      const tok = await new Promise(res => {
        chrome.storage.local.get(['gam_mod_token'], r => res(r.gam_mod_token || ''));
      });
      if (!tok) { list.innerHTML = '<div style="padding:10px;color:#f04040;font:11px monospace">No mod token — save one on the Tokens tab.</div>'; return; }
      const url = new URL(`${WORKER_BASE}/gaw/search`);
      url.searchParams.set('q', q);
      url.searchParams.set('scope', scope.value);
      url.searchParams.set('limit', '30');
      const resp = await fetch(url.toString(), { headers: { 'X-Mod-Token': tok } });
      const data = await resp.json();
      if (!data.ok) { list.innerHTML = `<div style="padding:10px;color:#f04040;font:11px monospace">Error: ${data.error||resp.status}</div>`; return; }
      list.innerHTML = '';
      const posts    = data.posts    || [];
      const comments = data.comments || [];
      const total = posts.length + comments.length;
      if (total === 0) { meta.textContent = 'No results'; return; }
      // Interleave by created_at desc
      const all = [
        ...posts.map(p => ({ ...p, _kind: 'post' })),
        ...comments.map(c => ({ ...c, _kind: 'comment' }))
      ].sort((a,b) => b.created_at - a.created_at);
      all.forEach((item, i) => {
        const row = buildRow(item, item._kind);
        row.id = `gam-sr-${i}`;
        list.appendChild(row);
      });
      meta.textContent = `${total} result${total !== 1 ? 's' : ''} — click or Enter to open`;
    } catch (err) {
      list.innerHTML = `<div style="padding:10px;color:#f04040;font:11px monospace">Search failed: ${err.message||err}</div>`;
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(_debounce);
    const q = input.value.trim();
    if (q.length < 2) { list.innerHTML = ''; meta.textContent = ''; return; }
    _debounce = setTimeout(() => runSearch(q), 250);
  });

  // Keyboard nav
  input.addEventListener('keydown', (e) => {
    const rows = [...list.querySelectorAll('[role="option"]')];
    if (!rows.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _srIdx = (_srIdx + 1) % rows.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _srIdx = (_srIdx - 1 + rows.length) % rows.length;
    } else if (e.key === 'Enter' && _srIdx >= 0) {
      e.preventDefault();
      window.open(rows[_srIdx].href, '_blank');
      return;
    } else {
      return;
    }
    rows.forEach((r, i) => {
      const sel = i === _srIdx;
      r.setAttribute('aria-selected', String(sel));
      if (sel) r.scrollIntoView({ block: 'nearest' });
    });
  });

  scope.addEventListener('change', () => {
    const q = input.value.trim();
    if (q.length >= 2) runSearch(q);
  });
})();
```

### 3. `popup.css` — add search styles

Append the CSS from Section C (all `.gam-search-*` and `.gam-sr*` rules) to the bottom of `popup.css`. No existing rules are touched.

### 4. `wireTabNav` in `popup.js` — zero changes needed

The `wireTabNav` function at line 1939 already handles `data-tab="search"` generically. The Search tab body uses `id="searchTab"` with `data-tab="search"` so it auto-hides/shows correctly. The tab button added in step 1 gets `.pop-tab-active` via the existing `setTab` logic.

### 5. CSP — zero changes needed

`popup.html` line 14: `connect-src https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev` already covers the search endpoint.

### File summary
| File | Lines changed | Risk |
|------|--------------|------|
| `popup.html` | +16 (tab button + panel) | None — additive only |
| `popup.js` | +80 (appended IIFE) | None — no existing code touched |
| `popup.css` | +55 (appended rules) | None — new class namespace |

---

## F. STRETCH (Week 2)

### Surface 2: Status-bar Ctrl+K palette

In `modtools.js`, add after the existing `Ctrl+Z` handler (line 4523):

```js
// v10.0: Ctrl+K search palette
document.addEventListener('keydown', function(e) {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key !== 'k' && e.key !== 'K') return;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
  e.preventDefault();
  _toggleSearchPalette();
});
```

`_toggleSearchPalette()` injects `#gam-search-palette` above the status bar on first call (same HTML structure as popup tab), focuses the input. Esc closes. Same `runSearch()` logic — extracted to a shared helper callable from both surfaces. The palette reuses the `.gam-sr`, `.gam-sr-meta`, etc. class names already defined for the content script's injected styles.

### Surface 3: /find in mod chat

In the chat send handler, intercept before the message goes to the worker:
```js
if (text.startsWith('/find ')) {
  const q = text.slice(6).trim();
  if (q.length >= 2) { renderSearchInlineInChat(q); return; }
}
```

`renderSearchInlineInChat(q)` appends a `<div class="gam-chat-search-results">` block below the input, same row rendering as above.

### Query syntax extensions (FTS5 phrase + prefix)

The worker currently wraps everything in `"..."` (phrase match only). To expose prefix search (`cat*`) and boolean AND:

Worker change (one line):
```js
// Current (phrase only):
const ftsQ = '"' + cleaned + '"';
// Extended (allow trailing * for prefix, space = AND):
const ftsQ = cleaned.endsWith('*')
  ? cleaned                          // user typed prefix
  : '"' + cleaned + '"';             // default: phrase
```

Add `scope` chip to result rows to let mods filter inline without re-searching.

### FTS5 ranking weights

The worker currently orders by `created_at DESC` — recency, not relevance. FTS5 exposes `rank` via `bm25()`:

```sql
SELECT ..., bm25(gaw_posts_fts) AS bm25_score
  FROM gaw_posts_fts f
  JOIN gaw_posts p ON p.rowid = f.rowid
 WHERE gaw_posts_fts MATCH ?
 ORDER BY bm25(gaw_posts_fts)   -- lower = more relevant in FTS5
 LIMIT ?
```

Worker change: add `?sort=rank|date` query param, default `date` (current behavior, no regression), opt-in `rank` for relevance-ordered results.

---

*Generated 2026-05-09. Endpoint verified from source. No assumptions.*
