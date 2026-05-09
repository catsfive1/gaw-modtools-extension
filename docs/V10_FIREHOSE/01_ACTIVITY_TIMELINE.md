# Firehose Feature 1 — Activity Timeline

## A. PROBLEM (current vs ideal)

**Current:** The User Intel Drawer (`buildUserSections`) fires 4 parallel RPCs on open — `modProfilesRead`, `modAuditQuery`, `modIntelDelta`, `modPrecedentFind`. Sections 1-6 render: basic profile stats, a naive mod-action quality score, a delta diff, team notes, NBA, and precedents. **Zero firehose data.** Mod hovers a user, sees account age and prior-ban count — that's it for activity signal.

**Ideal:** Section 7 (new) renders the last 30 days of actual posts + comments from `gaw_posts`/`gaw_comments` as a dense Bloomberg-style chronological list with a sparkline header bar showing hourly activity density. Scannable in under 2 seconds. Click row → opens thread. Removed/deleted items visually flagged.

**Why this matters:** A troll pattern visible in firehose (heavy posting in one 3-hour window, then silence) is completely invisible to the mod hovering them today. This is the highest-signal drawer upgrade possible with the data already sitting in D1.

---

## B. DATA SHAPE

### Worker endpoint already exists

`GET /gaw/user/:username/timeline` (`handleGawUserTimeline`, line 8639) returns posts + comments + user row. It already works. The only problem: **no RPC handler in `background.js` dispatches to it**, so the content script can't call it.

### SQL (inside the existing handler)

Current query fetches LIMIT 100 posts / LIMIT 200 comments — too heavy for a drawer tooltip. Augment the endpoint with a `?limit=50` query param cap:

```sql
-- Posts (already indexed on author via idx_gaw_posts_author)
SELECT id, slug, title, community, score, comment_count,
       created_at, is_removed, is_deleted,
       substr(body_md, 1, 200) AS snippet
  FROM gaw_posts
 WHERE author = ?
   AND created_at >= ?   -- unix epoch: now - 30*86400
 ORDER BY created_at DESC
 LIMIT 30;

-- Comments (idx_gaw_comments_author)
SELECT id, post_id, score, created_at, is_removed, is_deleted,
       substr(body_md, 1, 200) AS snippet
  FROM gaw_comments
 WHERE author = ?
   AND created_at >= ?
 ORDER BY created_at DESC
 LIMIT 30;
```

**EXPLAIN QUERY PLAN concern:** Both tables have single-column `(author)` indexes. SQLite will scan `idx_gaw_posts_author` for the author, then apply the `created_at >=` filter as a table-level predicate — not an index seek on created_at. With 3000 events/day that's fine for now (~90k rows/month across all authors, author slice probably <500). Cat 2's promised `(author, created_at DESC)` compound index kills the table-level filter entirely — design assumes it lands first, but the query runs correctly without it (just slightly slower index scan).

### Response JSON

```json
{
  "ok": true,
  "user": { "username": "...", "karma": 420, "post_count": 88, "comment_count": 312, "registered_at": 1700000000 },
  "posts": [
    { "id": "abc", "slug": "post-slug", "title": "Title text here", "community": "GreatAwakening",
      "score": 42, "comment_count": 7, "created_at": 1746700000, "is_removed": 0, "snippet": "..." }
  ],
  "comments": [
    { "id": "xyz", "post_id": "abc", "score": 5, "created_at": 1746699000, "is_removed": 0, "snippet": "..." }
  ]
}
```

Merge posts + comments client-side, sort by `created_at DESC`, take top 50.

---

## C. WORKER ENDPOINT

Endpoint already exists at `GET /gaw/user/:username/timeline`. Two changes needed:

**1. Add `since` + `limit` query params** to cap response size for the drawer use case:

```js
// Inside handleGawUserTimeline (gaw-mod-proxy-v2.js ~line 8642)
const limit = Math.min(50, Math.max(5, parseInt(url.searchParams.get('limit'), 10) || 50));
const since = parseInt(url.searchParams.get('since'), 10) || (Math.floor(Date.now() / 1000) - 30 * 86400);

// Then bind 3 params instead of 1:
.prepare(`SELECT ... FROM gaw_posts WHERE author = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?`)
.bind(u, since, limit).all()
```

**2. Add named RPC handler in `background.js` RPC_HANDLERS** (see Section F).

No new worker routes. No schema changes. No migrations.

---

## D. CLIENT RENDER (Bloomberg aesthetic)

Color tokens (from existing `C` object, line 82-87):
- BG panel: `#181b20` (C.BG2)
- Border: `#252a31` (C.BG3)
- Text primary: `#e8eaed` (C.TEXT)
- Text muted: `#8b929e` (C.TEXT2)
- Accent/timestamp: `#4A9EFF` (C.ACCENT)
- Removed flag: `#f04040` (C.RED)
- Score positive: `#3dd68c` (C.GREEN)
- **Amber post indicator: `#f5a623`** (new, inline — not in C yet)
- **Amber comment indicator: `#e8c84a`** (new, inline)

Font: `ui-monospace, SFMono-Regular, Consolas, monospace` (matches existing drawer monospace)

### ASCII sketch

```
+--[ ACTIVITY TIMELINE ]------------------------------+
| [sparkline: 30 thin bars, hourly buckets, amber]   |
| 47 items  30d  posts:12  cmts:35                   |
|------------------------------------------------------|
| 14:32  [P]  Great Awakening · +42 · 7c              |
|        Title of the post truncated to ~45 chars...  |
| 14:19  [C]  Post title context here · +5            |
|        Comment snippet truncated...                 |
| [REMOVED] 13:55  [P]  Title · -3 · 0c              |
| 09:12  [C]  Another post context · +11              |
|             ...                                     |
| [ load earlier ]                                   |
+----------------------------------------------------+
```

### Concrete CSS values (injected into the existing CSS template literal)

```css
.gam-at-wrap {
  padding: 8px 14px;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
}
.gam-at-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: #8b929e;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  letter-spacing: .3px;
}
.gam-at-spark {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 16px;
}
.gam-at-spark-bar {
  width: 3px;
  background: #f5a623;
  opacity: .7;
  border-radius: 1px 1px 0 0;
  min-height: 1px;
}
.gam-at-row {
  display: grid;
  grid-template-columns: 42px 20px 1fr;
  gap: 0 6px;
  padding: 3px 0;
  border-top: 1px solid #252a31;
  cursor: pointer;
  line-height: 1.35;
  transition: background .08s;
}
.gam-at-row:hover { background: rgba(255,255,255,.04); margin: 0 -14px; padding: 3px 14px; }
.gam-at-time { color: #8b929e; font-variant-numeric: tabular-nums; }
.gam-at-kind-p { color: #f5a623; font-weight: 700; }
.gam-at-kind-c { color: #e8c84a; }
.gam-at-title { color: #e8eaed; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gam-at-meta { color: #5c6370; font-size: 10px; margin-top: 1px; }
.gam-at-removed { text-decoration: line-through; color: #f04040; opacity: .7; }
.gam-at-score-pos { color: #3dd68c; }
.gam-at-score-neg { color: #f04040; }
.gam-at-more { color: #4A9EFF; font-size: 10px; cursor: pointer; padding: 4px 0; text-align: center; }
```

---

## E. INTERACTION MODEL

- **Click any row** → `window.open('https://greatawakening.win/p/' + slug, '_blank')` for posts; for comments open `https://greatawakening.win/p/' + post_id + '?c=' + comment_id`.
- **Hover row** → no tooltip; the snippet is already inline. Row highlight is sufficient.
- **Keyboard:** drawer's existing Tab/Escape/Backspace handling covers focus trap. Row buttons are `role="button" tabindex="0"` with Enter/Space handler.
- **[load earlier]** button — on click, re-fetch with `since` pushed back another 30 days. Cap at 3 fetches (90 days) to prevent D1 abuse.
- **Removed items** render with `gam-at-removed` strikethrough. Not hidden — mod visibility into removed content is the whole point.
- **Empty state** (user has 0 firehose records): `<div class="gam-at-header">No firehose data for this user yet.</div>` — not an error.
- **Loading state:** section renders a shimmer row (`opacity: .3; background: #252a31; height: 11px; border-radius: 2px;`) immediately, replaced on data arrival.

---

## F. SHIP-TONIGHT MINIMAL PATCH

Three files. ~120 lines of new code. No schema changes. No migrations. No feature-flag gymnastics (reuse existing `features.drawer` gate — it's already on for all mods).

### 1. `background.js` — add RPC handler (after line ~1126, inside RPC_HANDLERS)

```js
  modGawTimeline: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const u = encodeURIComponent(String(args && args.username || '').slice(0, 64));
      if (!u) return { ok: false, status: 400, error: 'username required' };
      const since = parseInt(args && args.since, 10) || (Math.floor(Date.now() / 1000) - 30 * 86400);
      const limit = Math.min(50, Math.max(5, parseInt(args && args.limit, 10) || 30));
      return await _rpcWorkerCall('GET',
        `/gaw/user/${u}/timeline?since=${since}&limit=${limit}`, undefined);
    }
  },
```

### 2. `gaw-mod-proxy-v2.js` — patch `handleGawUserTimeline` to honor `since` + `limit`

```js
// Replace the hardcoded .prepare() calls (~lines 8645-8657) with:
async function handleGawUserTimeline(request, env, username) {
  const auth = await checkModToken(request, env); if (auth) return auth;
  if (!env.AUDIT_DB) return jsonResponse({ ok: false, error: 'D1 not bound' }, 503);
  const u = decodeURIComponent(username || '').slice(0, 64);
  if (!u) return jsonResponse({ ok: false, error: 'username required' }, 400);
  const url2 = new URL(request.url);
  const limit = Math.min(50, Math.max(5, parseInt(url2.searchParams.get('limit'), 10) || 30));
  const since = parseInt(url2.searchParams.get('since'), 10) || (Math.floor(Date.now() / 1000) - 30 * 86400);

  const posts = (await env.AUDIT_DB.prepare(
    `SELECT id, slug, title, community, score, comment_count, created_at, is_removed,
            substr(body_md, 1, 200) AS snippet
       FROM gaw_posts WHERE author = ? AND created_at >= ?
       ORDER BY created_at DESC LIMIT ?`
  ).bind(u, since, limit).all()).results || [];

  const comments = (await env.AUDIT_DB.prepare(
    `SELECT id, post_id, score, created_at, is_removed,
            substr(body_md, 1, 200) AS snippet
       FROM gaw_comments WHERE author = ? AND created_at >= ?
       ORDER BY created_at DESC LIMIT ?`
  ).bind(u, since, limit).all()).results || [];

  const user = await env.AUDIT_DB.prepare(
    `SELECT username, karma, post_count, comment_count, registered_at FROM gaw_users WHERE username = ?`
  ).bind(u).first();

  return jsonResponse({ ok: true, user: user || null, posts, comments });
}
```

### 3. `modtools.js` — new `sec7()` inside `buildUserSections` + CSS + sparkline

**Insert after `sec6()` (line ~5516), before the `return` statement at line 5518:**

```js
    async function sec7() {
      const since30 = Math.floor(Date.now() / 1000) - 30 * 86400;
      const res = await rpcCall('modGawTimeline', { username: id, since: since30, limit: 30 });
      const wrap = el('div', { cls: 'gam-at-wrap' });

      if (!res || !res.ok || (!res.data)) {
        wrap.appendChild(el('div', { cls: 'gam-at-header' }, 'No firehose data for this user.'));
        return { id: 7, label: 'Activity', body: wrap };
      }

      const { posts = [], comments = [] } = res.data;

      // Merge + sort
      const items = [
        ...posts.map(p => ({ ...p, _kind: 'P', _ts: p.created_at })),
        ...comments.map(c => ({ ...c, _kind: 'C', _ts: c.created_at })),
      ].sort((a, b) => b._ts - a._ts).slice(0, 50);

      // Sparkline: 24 hourly buckets over last 24h
      const now = Math.floor(Date.now() / 1000);
      const buckets = new Array(24).fill(0);
      items.forEach(it => {
        const hoursAgo = Math.floor((now - it._ts) / 3600);
        if (hoursAgo >= 0 && hoursAgo < 24) buckets[23 - hoursAgo]++;
      });
      const maxB = Math.max(1, ...buckets);
      const spark = el('div', { cls: 'gam-at-spark' });
      buckets.forEach(v => {
        const bar = el('div', { cls: 'gam-at-spark-bar' });
        bar.style.height = Math.max(1, Math.round((v / maxB) * 16)) + 'px';
        spark.appendChild(bar);
      });

      const hdr = el('div', { cls: 'gam-at-header' });
      hdr.appendChild(spark);
      hdr.appendChild(document.createTextNode(
        ` ${items.length} items  30d  P:${posts.length}  C:${comments.length}`
      ));
      wrap.appendChild(hdr);

      // Rows
      const fmtTime = ts => {
        const d = new Date(ts * 1000);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      };
      const fmtScore = s => s > 0 ? '+' + s : String(s);

      items.forEach(it => {
        const row = el('div', { cls: 'gam-at-row' + (it.is_removed ? ' gam-at-removed-row' : ''), role: 'button', tabindex: '0' });
        const timeEl = el('span', { cls: 'gam-at-time' }, fmtTime(it._ts));
        const kindEl = el('span', { cls: it._kind === 'P' ? 'gam-at-kind-p' : 'gam-at-kind-c' }, `[${it._kind}]`);
        const bodyWrap = el('div');
        const title = it._kind === 'P'
          ? (it.title || '').slice(0, 55)
          : (it.snippet || '').replace(/\n/g, ' ').slice(0, 55);
        const scoreCls = it.score > 0 ? 'gam-at-score-pos' : (it.score < 0 ? 'gam-at-score-neg' : '');
        const titleEl = el('div', { cls: 'gam-at-title' + (it.is_removed ? ' gam-at-removed' : '') }, title);
        const metaEl = el('div', { cls: 'gam-at-meta' });
        metaEl.innerHTML = (it.community ? escapeHtml(it.community) + ' &middot; ' : '')
          + `<span class="${scoreCls}">${fmtScore(it.score || 0)}</span>`
          + (it._kind === 'P' ? ` &middot; ${it.comment_count || 0}c` : '');
        bodyWrap.appendChild(titleEl);
        bodyWrap.appendChild(metaEl);
        row.appendChild(timeEl);
        row.appendChild(kindEl);
        row.appendChild(bodyWrap);

        const openItem = () => {
          if (it._kind === 'P' && it.slug) {
            window.open('https://greatawakening.win/p/' + it.slug, '_blank');
          } else if (it._kind === 'C' && it.post_id) {
            window.open('https://greatawakening.win/p/' + it.post_id, '_blank');
          }
        };
        row.addEventListener('click', openItem);
        row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(); } });
        wrap.appendChild(row);
      });

      if (items.length === 0) {
        wrap.appendChild(el('div', { cls: 'gam-at-header' }, 'No activity in last 30 days.'));
      }

      return { id: 7, label: 'Activity', body: wrap };
    }
```

**Change `return [sec1(), sec2(), sec3(), sec4(), sec5(), sec6()];` (line 5518) to:**
```js
    return [sec1(), sec2(), sec3(), sec4(), sec5(), sec6(), sec7()];
```

**Add CSS block** (inside the existing CSS template literal, after `.gam-drawer-section` rules ~line 15977):

```css
.gam-at-wrap{padding:8px 14px;font:11px ui-monospace,SFMono-Regular,Consolas,monospace}
.gam-at-header{display:flex;align-items:center;gap:8px;margin-bottom:8px;color:${C.TEXT2};font-size:10px;font-variant-numeric:tabular-nums;letter-spacing:.3px}
.gam-at-spark{display:flex;align-items:flex-end;gap:1px;height:16px}
.gam-at-spark-bar{width:3px;background:#f5a623;opacity:.7;border-radius:1px 1px 0 0;min-height:1px}
.gam-at-row{display:grid;grid-template-columns:42px 20px 1fr;gap:0 6px;padding:3px 0;border-top:1px solid ${C.BG3};cursor:pointer;line-height:1.35;transition:background .08s}
.gam-at-row:hover{background:rgba(255,255,255,.04)}
.gam-at-time{color:${C.TEXT2};font-variant-numeric:tabular-nums}
.gam-at-kind-p{color:#f5a623;font-weight:700}
.gam-at-kind-c{color:#e8c84a}
.gam-at-title{color:${C.TEXT};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gam-at-removed{text-decoration:line-through;color:${C.RED};opacity:.7}
.gam-at-meta{color:${C.TEXT3};font-size:10px;margin-top:1px}
.gam-at-score-pos{color:${C.GREEN}}
.gam-at-score-neg{color:${C.RED}}
.gam-at-more{color:${C.ACCENT};font-size:10px;cursor:pointer;padding:4px 0;text-align:center}
```

---

## G. STRETCH FEATURES

**v10.4 — Day/hour heatmap strip**
Replace the 24-bar sparkline with a 7-row x 24-col grid (Mon–Sun x hour). Color intensity = event count. Mod can instantly see "this user posts every Tuesday 2am" — bot pattern detection at a glance. CSS Grid, no JS library needed.

**v10.4 — Velocity badge**
Pull the last-7d count vs prior-7d count from the endpoint. Render `[+180% 7d]` in amber next to the header. Sudden spikes = coordinated campaign signal.

**v10.5 — Community breakdown donut**
Simple inline bar chart: `GreatAwakening 68% | Freeboards 22% | other 10%`. Single-community dominance is a troll signal. Pure CSS flex bars, no SVG.

**v10.5 — Removed-content rate**
`(removed_posts + removed_comments) / total` as a percentage chip. `>30%` = red chip. Built from the already-returned `is_removed` field — zero extra queries.

**v10.6 — Cross-user pattern link**
"2 other watched users posted in the same thread within 1h." Requires a small worker query joining `gaw_posts` with the watchlist. High-value astroturf detection.

**v10.6 — Inline snippet expand**
Click the snippet text (not the row arrow) to expand the full 200-char preview in-place without leaving the drawer. `detail` toggle, no extra fetch.

---

*Patch lines: background.js +12, gaw-mod-proxy-v2.js +15 (replace existing handler), modtools.js +90 (sec7 fn + CSS). Worker deploy required. Extension reload required.*
