# Firehose Feature 7 -- Top-N Posters Analytics

**Status:** Design complete -- ready to implement
**Auth gate:** Lead token required (all endpoints + UI)
**Tables:** `gaw_posts`, `gaw_comments` (Migration 004)

---

## A. WHY THIS HELPS MODS

Mods currently have no visibility into posting velocity. The firehose ingests
every post and comment, but nothing surfaces "who is posting the most this
week." That gap creates three concrete moderation failures:

1. **Coordination detection is manual.** A brigade of 8 accounts each posting
   20 times/day looks normal in isolation. The Top-N board makes the spike
   visible in 30 seconds instead of requiring a mod to notice it across feeds.

2. **Early ban target validation.** When a mod wants to ban a high-volume
   poster, the leaderboard provides instant context: is this user's volume a
   one-day spike or a 30-day pattern? The distinction matters for duration
   calibration.

3. **Astroturf pattern identification.** New accounts hitting the top-20 post
   list within 24h of creation is a classic astroturf signal. Cross-referencing
   rank with account age (from `gaw_users.registered_at`) exposes it without
   a manual search.

4. **Mod workload distribution.** If a single author generates 40% of the
   daily comment volume, leads can pre-assign a mod to watch that thread tree
   rather than letting it hit the queue reactively.

The leaderboard is a 30-second daily scan, not a deep investigation tool. Its
value is that it surfaces the top 20 names every shift so nothing hides in
aggregate noise.

---

## B. SQL + INDEXES

### Index gap -- SHIP THIS FIRST

Migration 004 created single-column indexes on `author` and `created_at`
separately. The leaderboard query filters on `created_at` AND groups by
`author`, so D1's planner will scan the full author index and re-filter by
date, or vice versa. A composite index collapses that to a single range scan:

```sql
-- Add to migration 005 (or a standalone 004b patch):
CREATE INDEX IF NOT EXISTS idx_gaw_posts_author_created
  ON gaw_posts(author, created_at);

CREATE INDEX IF NOT EXISTS idx_gaw_comments_author_created
  ON gaw_comments(author, created_at);
```

Without these, the query still works -- it just scans more rows as the tables
grow past ~500k.

### Leaderboard queries

Window boundaries are Unix epoch seconds passed from the worker:

```sql
-- Top-N post authors in window
SELECT
  author,
  COUNT(*)                            AS n,
  MIN(created_at)                     AS first_post,
  MAX(created_at)                     AS last_post,
  ROUND(COUNT(*) * 86400.0
        / MAX(MAX(created_at) - MIN(created_at), 86400), 1)  AS posts_per_day
FROM gaw_posts
WHERE created_at > :since
  AND is_removed = 0
  AND is_deleted = 0
GROUP BY author
ORDER BY n DESC
LIMIT :limit;   -- default 20

-- Top-N comment authors in window (same shape)
SELECT
  author,
  COUNT(*)                            AS n,
  MIN(created_at)                     AS first_comment,
  MAX(created_at)                     AS last_comment,
  ROUND(COUNT(*) * 86400.0
        / MAX(MAX(created_at) - MIN(created_at), 86400), 1)  AS comments_per_day
FROM gaw_comments
WHERE created_at > :since
  AND is_removed = 0
  AND is_deleted = 0
GROUP BY author
ORDER BY n DESC
LIMIT :limit;
```

The `posts_per_day` / `comments_per_day` column is the velocity score: it
normalizes count by the span of the user's activity within the window, so a
user who posted 20 times in 2 hours ranks higher on velocity than one who
posted 25 times spread across 7 days.

### Window definitions

| Label | `since` offset |
|-------|---------------|
| 24h   | `NOW - 86400` |
| 7d    | `NOW - 604800` |
| 30d   | `NOW - 2592000` |

---

## C. WORKER ENDPOINT

```
GET /admin/firehose/top-posters
  ?window=24h|7d|30d   (default: 24h)
  ?kind=post|comment|both  (default: both)
  ?limit=20            (max 50, default 20)
```

Auth: Lead token required. Returns 401 on team token.

Response shape (HTTP 200):

```json
{
  "window": "24h",
  "since": 1746730000,
  "generated_at": 1746816400,
  "posts": [
    {
      "rank": 1,
      "author": "PatriotAnon",
      "n": 47,
      "posts_per_day": 47.0,
      "first_post": 1746730120,
      "last_post":  1746814900
    }
  ],
  "comments": [
    {
      "rank": 1,
      "author": "TruthSeeker99",
      "n": 312,
      "comments_per_day": 312.0,
      "first_comment": 1746730005,
      "last_comment":  1746816000
    }
  ]
}
```

When `kind=post`, the `comments` array is omitted. When `kind=comment`, the
`posts` array is omitted. When `kind=both`, both are present and ranked
independently.

Worker implementation sketch:

```js
// handlers/firehose-top-posters.js
export async function handleTopPosters(request, env) {
  const url   = new URL(request.url);
  const win   = url.searchParams.get('window') ?? '24h';
  const kind  = url.searchParams.get('kind')   ?? 'both';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 50);

  const WINDOWS = { '24h': 86400, '7d': 604800, '30d': 2592000 };
  const since = Math.floor(Date.now() / 1000) - (WINDOWS[win] ?? 86400);

  const SQL_POSTS = `
    SELECT author, COUNT(*) AS n,
      MIN(created_at) AS first_post, MAX(created_at) AS last_post,
      ROUND(COUNT(*) * 86400.0 / MAX(MAX(created_at) - MIN(created_at), 86400), 1)
        AS posts_per_day
    FROM gaw_posts
    WHERE created_at > ? AND is_removed = 0 AND is_deleted = 0
    GROUP BY author ORDER BY n DESC LIMIT ?`;

  const SQL_COMMENTS = `
    SELECT author, COUNT(*) AS n,
      MIN(created_at) AS first_comment, MAX(created_at) AS last_comment,
      ROUND(COUNT(*) * 86400.0 / MAX(MAX(created_at) - MIN(created_at), 86400), 1)
        AS comments_per_day
    FROM gaw_comments
    WHERE created_at > ? AND is_removed = 0 AND is_deleted = 0
    GROUP BY author ORDER BY n DESC LIMIT ?`;

  const out = { window: win, since, generated_at: Math.floor(Date.now() / 1000) };

  if (kind === 'post' || kind === 'both') {
    const { results } = await env.AUDIT_DB.prepare(SQL_POSTS).bind(since, limit).all();
    out.posts = results.map((r, i) => ({ rank: i + 1, ...r }));
  }
  if (kind === 'comment' || kind === 'both') {
    const { results } = await env.AUDIT_DB.prepare(SQL_COMMENTS).bind(since, limit).all();
    out.comments = results.map((r, i) => ({ rank: i + 1, ...r }));
  }

  return new Response(JSON.stringify(out), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

Route registration in `worker.js`:
```js
if (path === '/admin/firehose/top-posters' && method === 'GET') {
  return requireLead(request, () => handleTopPosters(request, env));
}
```

---

## D. UI DESIGN (Bloomberg sparkline-ledger)

### Placement

Goes inside the **Lead tab** (`data-tab="lead"`) in `popup.html`, as a new
collapsible section below whatever Lead-gated content already renders there.
It is not on the Stats tab -- Stats is visible to all mods; this surface is
lead-only by both auth and UI placement.

### ASCII layout sketch

```
+----------------------------------------------------------+
|  HOT POSTERS                        [24h] [7d] [30d]    |
|  [Posts] [Comments]                                      |
+----------------------------------------------------------+
|  #   Author              Count   Vel/day   Sparkline     |
|  1   PatriotAnon           47      47.0   [====------]  |
|  2   RedpillReporter       31      31.0   [===-------]  |
|  3   DigitalSoldier22      28      14.0   [==--------]  |
|  4   NightshiftPatriot     19       9.5   [=---------]  |
|  5   ...                                                 |
|                                                          |
|  Showing top 20 of 1,247 authors  [Export CSV]          |
+----------------------------------------------------------+
```

Each row is a `<tr>` in a `<table class="hp-table">`. The sparkline is a
narrow inline bar drawn as a `<span>` with `width` set proportionally to the
top-ranked author's count (max-width 80px, CSS `background: #4A9EFF`).

### Minimal CSS additions

```css
/* popup.css additions -- Hot Posters panel */
.hp-panel        { padding: 8px 12px; }
.hp-controls     { display: flex; gap: 6px; margin-bottom: 8px; align-items: center; }
.hp-win-btn      { font-size: 11px; padding: 2px 7px; border-radius: 4px;
                   background: #1a1a2e; border: 1px solid #333; color: #aaa;
                   cursor: pointer; }
.hp-win-btn.active { border-color: #4A9EFF; color: #4A9EFF; }
.hp-kind-btn     { font-size: 11px; padding: 2px 7px; border-radius: 4px;
                   background: #1a1a2e; border: 1px solid #333; color: #aaa;
                   cursor: pointer; }
.hp-kind-btn.active { border-color: #3dd68c; color: #3dd68c; }
.hp-table        { width: 100%; border-collapse: collapse; font-size: 11px; }
.hp-table th     { color: #666; font-weight: 600; text-align: left;
                   padding: 3px 6px; border-bottom: 1px solid #222; }
.hp-table td     { padding: 3px 6px; color: #ccc; vertical-align: middle; }
.hp-table tr:hover td { background: #1a1a2e; cursor: pointer; }
.hp-rank         { color: #555; width: 20px; }
.hp-author       { max-width: 120px; overflow: hidden; text-overflow: ellipsis;
                   white-space: nowrap; }
.hp-count        { color: #f0a040; text-align: right; width: 50px; }
.hp-vel          { color: #a78bfa; text-align: right; width: 50px; }
.hp-bar-cell     { width: 80px; }
.hp-bar          { display: inline-block; height: 6px; border-radius: 3px;
                   background: #4A9EFF; min-width: 2px; }
.hp-footer       { font-size: 10px; color: #555; margin-top: 6px;
                   display: flex; justify-content: space-between; }
```

The sparkline bar width:
```js
const maxN = rows[0].n;
row.barWidth = Math.max(2, Math.round((row.n / maxN) * 78));
```

### Data refresh

- On Lead tab activation: auto-fetch `kind=both&window=24h`.
- Window and kind buttons trigger re-fetch. Debounce 300ms.
- No polling -- this is a on-demand pull, not a live feed. A "Refresh" button
  suffices; mods check it at shift start, not continuously.

---

## E. CLICK-DRILL

Click any row in the Hot Posters table to open the existing `pop-drill` drawer
(already wired in `popup.js` via `renderDrillDown`). The drawer re-purposes
for this feature:

**Drill payload:** the clicked `author` string is passed to a new drill key
`'hotposter'`. The `renderDrillDown('hotposter', { author })` call fetches
`/admin/intel/user?username=<author>` (the existing Intel Drawer endpoint) and
renders the user's profile, ban history, post/comment tallies, and account age
in the existing drawer layout.

Implementation in `popup.js`:

```js
// Wire after table render:
document.querySelectorAll('.hp-table tr[data-author]').forEach(tr => {
  tr.addEventListener('click', () => {
    const author = tr.dataset.author;
    renderDrillDown('user-intel', { username: author });
  });
});
```

No new drawer component. No new endpoint. The Intel Drawer already knows how
to render a user -- this just routes into it from a new entry point.

The drawer title shows: **"Intel: PatriotAnon"** with the standard close (X /
Esc) and the existing CSV export scoped to that user's audit entries.

---

## F. SHIP-TONIGHT PATCH

Minimum viable ship: two SQL indexes + one worker route + one UI panel.

**Step 1 -- indexes (migration 004b or 005 preamble):**

```sql
CREATE INDEX IF NOT EXISTS idx_gaw_posts_author_created
  ON gaw_posts(author, created_at);
CREATE INDEX IF NOT EXISTS idx_gaw_comments_author_created
  ON gaw_comments(author, created_at);
```

Run via:
```
wrangler d1 execute AUDIT_DB --remote --command "CREATE INDEX IF NOT EXISTS idx_gaw_posts_author_created ON gaw_posts(author, created_at)"
wrangler d1 execute AUDIT_DB --remote --command "CREATE INDEX IF NOT EXISTS idx_gaw_comments_author_created ON gaw_comments(author, created_at)"
```

**Step 2 -- worker route:** add `handleTopPosters` from Section C. Wire in
the main router under `/admin/firehose/top-posters`. The `requireLead` guard
is already established -- reuse it verbatim.

**Step 3 -- popup HTML:** add one `<div class="hp-panel">` block inside the
Lead tab section. Wire the window/kind toggle buttons and the table render
function in `popup.js`.

**Step 4 -- CSS:** append the 20-line `.hp-*` block to `popup.css`.

Total diff estimate: ~180 lines (worker handler + popup JS + HTML fragment +
CSS). No schema migration for new tables. No new D1 binding. No new KV keys.
Everything uses existing auth and existing Intel Drawer.

---

## G. STRETCH

### Velocity anomaly detection

The `posts_per_day` column becomes useful when compared to a baseline. The
stretch version adds a 30-day rolling baseline per author:

```sql
SELECT author,
  COUNT(*) FILTER (WHERE created_at > :since_24h) AS count_24h,
  COUNT(*) FILTER (WHERE created_at > :since_30d) / 30.0 AS baseline_per_day,
  (COUNT(*) FILTER (WHERE created_at > :since_24h)
   / NULLIF(COUNT(*) FILTER (WHERE created_at > :since_30d) / 30.0, 0))
     AS velocity_ratio
FROM gaw_posts
WHERE created_at > :since_30d
GROUP BY author
HAVING velocity_ratio > 3      -- only show if today is 3x their baseline
ORDER BY velocity_ratio DESC
LIMIT 20;
```

A `velocity_ratio > 3` means the author is posting at 3x their 30-day pace
today. That is a concrete anomaly signal, not just a raw count.

### Anomaly alert chip

If any author's `velocity_ratio > 5` AND they are not in the known-mod list
(from `gaw_users` cross-ref), emit a red chip in the Lead tab header:
"3 accounts spiking (5x+ baseline)". Click opens the Hot Posters panel
pre-filtered to anomalies only.

### New-account velocity filter

Cross-join with `gaw_users.registered_at`: if `registered_at > (NOW - 7d)`
AND the author is in the top-20 post list, tag the row with a "NEW" badge
in amber. New accounts at posting velocity is the astroturf tell.

### Community breakdown

The `community` column exists on `gaw_posts`. Add a `?community=` filter
to the endpoint so lead can scope the leaderboard to a specific sub. Useful
on large instances with multiple communities.

### gaw_users counter sync

`gaw_users.post_count` and `comment_count` are denormalized at ingestion time.
They are fast to read but drift from the COUNT(*) truth as posts are removed.
A nightly cron that runs `UPDATE gaw_users SET post_count = (SELECT COUNT(*) FROM gaw_posts WHERE author = username AND is_removed = 0)` would let the leaderboard fall back to the denormalized column for the 30d window (cheap) while using COUNT(*) for 24h (small table scan). Not needed for v1 -- the COUNT(*) queries are fast enough at current scale.
