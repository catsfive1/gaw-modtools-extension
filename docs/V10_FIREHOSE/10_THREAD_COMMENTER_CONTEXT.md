# Firehose Feature 10 -- Per-Thread Commenter Context

**Source spec:** V11_CAT2_UX_FLOWS.md W10  
**DB dependency:** V11_R2_CAT2_DATABASE.md item #17 (post_author denorm) + item #23 (ban_count denorm)  
**Status:** Ship-tonight core (A-E); Stretch (F-G)

---

## A. SQL + INDEXES

### Schema prerequisite (migration 043 -- already specced in DATABASE doc)

```sql
-- gaw_comments already has: id, post_id, author, body, created_at, karma, is_removed
-- Item #17 adds the denormalized post_author to eliminate the join:
ALTER TABLE gaw_comments ADD COLUMN post_author TEXT;
UPDATE gaw_comments c
   SET post_author = (SELECT author FROM gaw_posts WHERE id = c.post_id)
 WHERE post_author IS NULL;

CREATE INDEX IF NOT EXISTS idx_gaw_comments_post_author_created
  ON gaw_comments(post_author, created_at DESC);

-- For this feature specifically -- fast per-thread commenter aggregate:
CREATE INDEX IF NOT EXISTS idx_gaw_comments_post_id_created
  ON gaw_comments(post_id, created_at DESC);
```

### Thread aggregate query (worker reads this on every /mod/thread/intel call)

```sql
-- Step 1: pull all commenters on the thread
SELECT
  c.author,
  COUNT(*)                                              AS comment_count,
  MIN(c.created_at)                                    AS first_comment_ms,
  u.created_at                                         AS account_created_ms,
  COALESCE(u.link_karma, 0) + COALESCE(u.comment_karma, 0) AS karma,
  COALESCE(u.ban_count, 0)                             AS ban_count,
  u.is_sus                                             AS is_sus,
  u.is_dr                                              AS is_dr
FROM gaw_comments c
LEFT JOIN gaw_users u ON u.username = c.author
WHERE c.post_id = :post_id
  AND c.is_removed = 0
GROUP BY c.author
ORDER BY first_comment_ms ASC;
```

### Novelty score formula (computed in Worker JS, not SQL)

```
account_age_days = (now_ms - account_created_ms) / 86_400_000
karma            = total link + comment karma (from gaw_users; 0 if unknown)

novelty_score = (
  (account_age_days < 14  ? 50 : 0)   +   // new account: heavy weight
  (account_age_days < 30  ? 20 : 0)   +   // relatively new: moderate
  (karma === 0             ? 20 : 0)   +   // zero karma
  (karma < 10              ? 10 : 0)   +   // near-zero karma
  (ban_count > 0           ? 15 : 0)   +   // prior ban history
  (is_sus                  ? 10 : 0)   +   // already SUS-flagged
  (is_dr                   ? 15 : 0)       // already death-rowed
) / 140 * 100   -- normalize to 0..100
```

Higher = more brigade-likely. Top 5 by novelty_score surface in the panel.

### Novel-account ratio (auto-flag trigger)

```
novel_count = commenters WHERE account_age_days < 14
novel_ratio = novel_count / total_unique_commenters
-- flag if novel_ratio > 0.30
```

---

## B. WORKER ENDPOINT

### Request

```
GET /mod/thread/intel?id=<post_id>
Headers: x-mod-token: <token>
```

`post_id` is the bare ID from the URL (`/p/<post_id>/<slug>`). The worker
extracts it from the query param, validates the token, then runs the aggregate
query against D1.

### Response (JSON)

```json
{
  "post_id": "abc123",
  "total_commenters": 47,
  "novel_ratio": 0.38,
  "novel_count": 18,
  "zero_karma_count": 12,
  "auto_flagged": true,
  "top_suspects": [
    {
      "username": "newuser99",
      "novelty_score": 95,
      "account_age_days": 3,
      "karma": 0,
      "ban_count": 0,
      "is_sus": false,
      "is_dr": false,
      "comment_count": 4,
      "first_comment_ms": 1715200000000
    }
  ],
  "generated_at": 1715201234567
}
```

`top_suspects` is capped at 5 rows, sorted by `novelty_score DESC`.

### Worker handler sketch

```js
// routes/mod-thread-intel.js
export async function handleThreadIntel(req, env) {
  const mod = await validateToken(req, env);
  if (!mod) return jsonResponse({ error: 'unauthorized' }, 401);

  const postId = new URL(req.url).searchParams.get('id');
  if (!postId) return jsonResponse({ error: 'missing id' }, 400);

  const now = Date.now();
  const rows = await env.DB.prepare(`
    SELECT c.author,
           COUNT(*) AS comment_count,
           MIN(c.created_at) AS first_comment_ms,
           u.created_at AS account_created_ms,
           COALESCE(u.link_karma,0)+COALESCE(u.comment_karma,0) AS karma,
           COALESCE(u.ban_count,0) AS ban_count,
           u.is_sus, u.is_dr
    FROM gaw_comments c
    LEFT JOIN gaw_users u ON u.username = c.author
    WHERE c.post_id = ? AND c.is_removed = 0
    GROUP BY c.author
    ORDER BY first_comment_ms ASC
  `).bind(postId).all();

  const commenters = rows.results;
  const total = commenters.length;
  if (total === 0) return jsonResponse({ post_id: postId, total_commenters: 0,
    novel_ratio: 0, novel_count: 0, zero_karma_count: 0,
    auto_flagged: false, top_suspects: [], generated_at: now });

  // Compute novelty scores
  const scored = commenters.map(r => {
    const ageDays = r.account_created_ms
      ? (now - r.account_created_ms) / 86_400_000
      : 999;
    const karma = r.karma;
    const score = (
      (ageDays < 14  ? 50 : 0) +
      (ageDays < 30  ? 20 : 0) +
      (karma === 0   ? 20 : 0) +
      (karma < 10    ? 10 : 0) +
      (r.ban_count > 0 ? 15 : 0) +
      (r.is_sus      ? 10 : 0) +
      (r.is_dr       ? 15 : 0)
    ) / 140 * 100;
    return { ...r, account_age_days: Math.round(ageDays), novelty_score: Math.round(score) };
  });

  const novelCount     = scored.filter(r => r.account_age_days < 14).length;
  const zeroKarmaCount = scored.filter(r => r.karma === 0).length;
  const novelRatio     = novelCount / total;
  const topSuspects    = [...scored]
    .sort((a, b) => b.novelty_score - a.novelty_score)
    .slice(0, 5)
    .map(({ author, novelty_score, account_age_days, karma, ban_count,
             is_sus, is_dr, comment_count, first_comment_ms }) =>
      ({ username: author, novelty_score, account_age_days, karma, ban_count,
         is_sus: !!is_sus, is_dr: !!is_dr, comment_count, first_comment_ms }));

  return jsonResponse({
    post_id: postId, total_commenters: total,
    novel_ratio: Math.round(novelRatio * 100) / 100,
    novel_count: novelCount, zero_karma_count: zeroKarmaCount,
    auto_flagged: novelRatio > 0.30,
    top_suspects: topSuspects, generated_at: now
  });
}
```

Cache TTL: 90 seconds in KV keyed by `thread-intel:${postId}`. Invalidate on
any mod action against users in `top_suspects` (ban, remove).

---

## C. CLIENT INJECTION

### Thread-page detection

`IS_POST_PAGE` is already defined in modtools.js:4607:

```js
const IS_POST_PAGE = /^\/p\/[^/]+/.test(window.location.pathname);
```

Extract the post ID from the URL (mirrors the existing `postId` extraction at
modtools.js:5761):

```js
const _threadPostId = IS_POST_PAGE
  ? (location.pathname.match(/^\/p\/([^\/]+)/)||[])[1] || ''
  : '';
```

### "Thread Watch" button injection

Inject once when `IS_POST_PAGE` is true, after the post title renders. Use the
same selector-fallback pattern as `_SEL_FB`:

```js
function injectThreadWatchBtn() {
  if (!IS_POST_PAGE || !_threadPostId) return;
  if (document.querySelector('#gam-thread-watch-btn')) return; // idempotent

  const titleEl = document.querySelector(
    'h1.post-title, .post h1, h1[class*="title"], .title-content'
  );
  if (!titleEl) return;

  const btn = el('button', {
    id: 'gam-thread-watch-btn',
    class: 'gam-btn-small',
    title: 'Thread Watch -- brigade analysis',
    style: 'margin-left:8px;vertical-align:middle;'
  }, 'Thread Watch');

  btn.addEventListener('click', () => openThreadIntelDrawer(_threadPostId));
  titleEl.after(btn);
}
```

Call `injectThreadWatchBtn()` from the existing `IS_POST_PAGE` block at
modtools.js:5760 and from `compactBylines()` so it survives DOM swaps.

### Panel render via gam-intel-drawer

Open the existing `gam-intel-drawer` with a new `kind = 'thread'`:

```js
async function openThreadIntelDrawer(postId) {
  IntelDrawer.open({ kind: 'thread', id: postId, title: 'Thread Watch' });
  IntelDrawer.setLoading(true);

  let data;
  try {
    const r = await fetch(`${WORKER_BASE}/mod/thread/intel?id=${postId}`, {
      headers: { 'x-mod-token': getModToken() }
    });
    data = await r.json();
  } catch(e) {
    IntelDrawer.setBody(el('div', { class: 'gam-drawer-error' },
      'Failed to load thread intel. Check network.'));
    return;
  } finally {
    IntelDrawer.setLoading(false);
  }

  IntelDrawer.setBody(renderThreadIntelPanel(data));
}
```

### Panel HTML structure

```
+------------------------------------------+
| Thread Watch         [auto-flagged badge] |
+------------------------------------------+
| 47 commenters  38% new (<14d)  26% 0-karma|
+------------------------------------------+
| SUSPECT USERS (top 5 by novelty)         |
|  [score] @newuser99  3d  0 karma  4 cmts  |
|          [Ban+Remove] [Watch] [SUS]       |
|  [score] @account2   11d 2 karma  2 cmts  |
|          [Ban+Remove] [Watch] [SUS]       |
|  ...                                      |
+------------------------------------------+
| [Ban All 5] [Watch All 5]                |
+------------------------------------------+
```

Render function (abbreviated):

```js
function renderThreadIntelPanel(data) {
  const wrap = el('div', { class: 'gam-thread-intel' });

  if (data.auto_flagged) {
    wrap.appendChild(el('div', {
      class: 'gam-badge gam-badge--warn',
      style: 'margin-bottom:8px'
    }, `AUTO-FLAGGED: ${Math.round(data.novel_ratio*100)}% new accounts`));
  }

  // Stats strip
  wrap.appendChild(el('div', { class: 'gam-thread-stats' },
    el('span', {}, `${data.total_commenters} commenters`),
    el('span', {}, `${Math.round(data.novel_ratio*100)}% new (<14d)`),
    el('span', {}, `${Math.round(data.zero_karma_count/data.total_commenters*100)}% zero-karma`)
  ));

  // Suspect rows
  const suspectList = el('div', { class: 'gam-thread-suspects' });
  for (const s of data.top_suspects) {
    suspectList.appendChild(renderSuspectRow(s, data.post_id));
  }
  wrap.appendChild(suspectList);

  // Bulk action bar
  if (data.top_suspects.length > 1) {
    const bar = el('div', { class: 'gam-thread-bulk' });
    bar.appendChild(makeBulkBanBtn(data.top_suspects, data.post_id));
    bar.appendChild(makeBulkWatchBtn(data.top_suspects));
    wrap.appendChild(bar);
  }

  return wrap;
}
```

---

## D. ONE-CLICK BULK ACTIONS

### Per-row actions

Each suspect row renders three inline buttons:

| Button | Action | Endpoint called |
|--------|---------|-----------------|
| Ban + Remove | Bans user AND removes all their comments on this thread | POST /mod/ban + POST /mod/comment/remove-batch |
| Watch | Adds to watchlist with reason "Thread Watch: [post_id]" | POST /mod/watch |
| SUS | Marks user SUS | POST /mod/sus |

```js
function renderSuspectRow(s, postId) {
  const row = el('div', { class: 'gam-suspect-row',
    'data-username': s.username, 'data-post-id': postId });

  const badge = el('span', { class: 'gam-novelty-badge' },
    `${s.novelty_score}`);
  const info = el('span', { class: 'gam-suspect-info' },
    `@${s.username}  ${s.account_age_days}d  ${s.karma} karma  ${s.comment_count} cmts`);
  const actions = el('div', { class: 'gam-suspect-actions' });

  const banRemoveBtn = el('button', { class: 'gam-btn-small gam-btn--red' }, 'Ban+Remove');
  banRemoveBtn.addEventListener('click', () =>
    onBanAndRemove(s.username, postId));

  const watchBtn = el('button', { class: 'gam-btn-small' }, 'Watch');
  watchBtn.addEventListener('click', () =>
    onWatchUser(s.username, `Thread Watch: ${postId}`));

  const susBtn = el('button', { class: 'gam-btn-small gam-btn--orange' }, 'SUS');
  susBtn.addEventListener('click', () => onMarkSus(s.username));

  actions.append(banRemoveBtn, watchBtn, susBtn);
  row.append(badge, info, actions);
  return row;
}
```

### Ban + Remove implementation

```js
async function onBanAndRemove(username, postId) {
  // Fire ban + comment removal in parallel
  await Promise.all([
    callWorker('/mod/ban', { target_user: username,
      duration_days: 7, reason: 'Brigade activity', via: 'thread-watch' }),
    callWorker('/mod/comment/remove-batch', { post_id: postId,
      author: username, via: 'thread-watch' })
  ]);
  snack(`Banned @${username} + removed their comments`, 'success');
  // Gray out the row
  document.querySelector(`[data-username="${username}"]`)
    ?.classList.add('gam-suspect-row--actioned');
}
```

### Bulk actions

```js
function makeBulkBanBtn(suspects, postId) {
  const btn = el('button', { class: 'gam-btn-small gam-btn--red' },
    `Ban All ${suspects.length}`);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Banning...';
    // D1 batch: all bans in one round-trip via /mod/ban-batch
    await callWorker('/mod/ban-batch', {
      targets: suspects.map(s => ({
        username: s.username, duration_days: 7,
        reason: 'Brigade activity', via: 'thread-watch'
      })),
      post_id: postId,        // also remove-batch on this thread
      remove_comments: true
    });
    snack(`Banned ${suspects.length} users + removed comments`, 'success');
    btn.textContent = 'Done';
  });
  return btn;
}

function makeBulkWatchBtn(suspects) {
  const btn = el('button', { class: 'gam-btn-small' },
    `Watch All ${suspects.length}`);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await Promise.all(suspects.map(s =>
      callWorker('/mod/watch', { username: s.username,
        reason: 'Thread Watch bulk', via: 'thread-watch' })
    ));
    snack(`Watching ${suspects.length} users`, 'success');
    btn.textContent = 'Done';
  });
  return btn;
}
```

### Undo

All bulk bans write a `pending_undo` row (per DATABASE item #3). The panel
renders a "Undo (30s)" toast button after bulk action fires. Client calls
`POST /mod/undo { client_op_id }` which atomically claims and reverses via
`inverse_json`.

---

## E. AUTO-FLAG TRIGGER

### Trigger condition

```
novel_ratio > 0.30  (>=30% of unique commenters have accounts <14 days old)
```

Evaluated in the worker at response time. The field `auto_flagged: true` in the
response drives three client behaviors:

1. **Thread Watch button turns amber** with a pulsing ring (CSS class
   `gam-thread-watch-btn--flagged`) -- visible before the mod clicks.
2. **Panel header shows a red "AUTO-FLAGGED" badge** (see Section C render).
3. **SIREN chip increments** -- the flag count fed back to the main status bar
   so a watching lead can see brigade activity without opening the thread.

### Proactive detection (stretch -- firehose hook)

When the firehose ingests a comment burst (`gaw_comments` inserts > 8 on the
same `post_id` within 60 seconds of each other), the ingest worker pre-computes
the novel ratio for that post_id and writes to a `thread_flags` KV key:

```
KV key: thread-flag:<post_id>
Value: { novel_ratio, flagged_at, total_commenters }
TTL: 3600s
```

The extension polls `GET /mod/thread-flags` every 30s on post pages and lights
up the Thread Watch button **before the mod has to click it**.

```js
// Polling -- only active on IS_POST_PAGE
async function pollThreadFlags() {
  if (!IS_POST_PAGE || !_threadPostId) return;
  try {
    const r = await fetch(`${WORKER_BASE}/mod/thread-flags?id=${_threadPostId}`,
      { headers: { 'x-mod-token': getModToken() } });
    if (!r.ok) return;
    const d = await r.json();
    if (d.flagged) {
      document.querySelector('#gam-thread-watch-btn')
        ?.classList.add('gam-thread-watch-btn--flagged');
    }
  } catch(_) {}
}
setInterval(pollThreadFlags, 30_000);
pollThreadFlags(); // immediate on load
```

---

## F. SHIP-TONIGHT PATCH

Minimum viable ship (no proactive polling, no undo, no KV cache):

**Backend (1 file change)**
- Add `handleThreadIntel` to the worker router: `GET /mod/thread/intel`
- Query runs directly against D1 (no KV cache layer yet -- add in wave 2)
- Only requires `gaw_comments` and `gaw_users` tables (no migration needed if
  `post_author` backfill already ran; if not, the join path `LEFT JOIN gaw_posts`
  is the fallback at slightly higher query cost)

**Client (modtools.js, 3 insertion points)**
1. `IS_POST_PAGE` block (~line 5760): call `injectThreadWatchBtn()` once
2. `compactBylines()` (~line 8703): re-call `injectThreadWatchBtn()` for resilience
3. New functions at bottom of file: `injectThreadWatchBtn`, `openThreadIntelDrawer`,
   `renderThreadIntelPanel`, `renderSuspectRow`, `onBanAndRemove`, `onWatchUser`, `onMarkSus`

**CSS additions** (add to GAM_CSS template):
```css
#gam-thread-watch-btn { margin-left:8px; }
#gam-thread-watch-btn.gam-thread-watch-btn--flagged {
  background: var(--gam-orange, #e67e22);
  animation: gam-pulse 1.2s infinite;
}
.gam-thread-stats { display:flex; gap:12px; font-size:11px;
  color:var(--gam-text2); padding:6px 0 10px; }
.gam-suspect-row { display:flex; align-items:center; gap:8px;
  padding:6px 0; border-bottom:1px solid var(--gam-border); }
.gam-suspect-row--actioned { opacity:0.35; pointer-events:none; }
.gam-novelty-badge { min-width:32px; text-align:center; font-weight:700;
  font-size:11px; background:var(--gam-bg3); border-radius:3px; padding:2px 4px; }
.gam-suspect-actions { margin-left:auto; display:flex; gap:4px; }
.gam-thread-bulk { padding:8px 0 0; display:flex; gap:8px; }
.gam-badge--warn { background:#c0392b; color:#fff; padding:4px 8px;
  border-radius:3px; font-size:11px; font-weight:700; }
```

**Estimated diff size:** ~200 lines JS + 15 lines CSS + 1 worker route (~60 lines).  
**No new migrations required for ship-tonight** -- the query degrades gracefully
without `post_author` denorm (uses a subquery join instead).  
**Test path:** Open any `/p/` thread with >= 5 comments, click Thread Watch,
verify panel loads with commenter count and at least 1 suspect row.

---

## G. STRETCH

### AI commentary on the suspect cluster

After the top-5 list renders, fire a secondary async call to
`POST /mod/ai/thread-summary` with the top suspects payload. The AI returns a
1-2 sentence brigade assessment:

> "4 of 5 top commenters were created within 72h of each other and have
> overlapping comment history on 3 prior threads. Likely coordinated."

Render this in a collapsible `<details>` element below the stats strip so it
doesn't block the primary action surface.

Model: Llama-3.3-70b via the existing `aiCallerKey` path. Budget: ~300 tokens
input + 80 tokens output. Gate behind `features.thread_ai_summary` feature flag.

### Reply-graph cluster visualization

Map commenters as nodes; draw edges when two users have commented on >= 2 of
the same threads in the past 30 days (cross-thread overlap). Render as a small
SVG force-directed graph (D3 or hand-rolled -- no external deps since we're in
a content script). Color nodes by novelty score. High-cluster-coefficient
subgraphs = brigade cell.

Data source: a new endpoint `GET /mod/thread/overlap?authors=a,b,c,...` that
queries `gaw_comments` for shared post_ids across the supplied author list
(capped at 30 authors to stay within D1 query budget).

```sql
-- Cross-thread overlap check (parameterized for D1 prepared statement)
SELECT a.author AS auth_a, b.author AS auth_b, COUNT(DISTINCT a.post_id) AS shared
  FROM gaw_comments a
  JOIN gaw_comments b ON a.post_id = b.post_id AND a.author < b.author
 WHERE a.author IN (/* up to 30 usernames */)
   AND b.author IN (/* same list */)
   AND a.created_at > (unixepoch()*1000 - 30*24*60*60*1000)
 GROUP BY a.author, b.author
HAVING shared >= 2;
```

This query uses `idx_gaw_comments_post_id_created` (defined in Section A) for
the self-join. For 30 users on a 30-day window it should complete under 50ms on
current firehose table sizes.

Defer cluster viz to v11.1 -- it's high-value but not a ship-blocker.
