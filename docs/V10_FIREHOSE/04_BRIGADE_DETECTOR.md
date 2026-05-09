# Firehose Feature 4 — Brigade Detector (v10 LITE)

**Status:** Design complete — ship-tonight minimal patch defined.
**Depends on:** Migration 004 (`gaw_comments` live), Migration 043 (`post_author` column).
**Slots into:** Existing `scheduled()` handler alongside `gawCrawlTick`.

---

## A. WHY V10 NOW (vs Cat 1 R2's L-effort defer)

Cat 1 R2 rated this L-effort and parked it behind Cloudflare Queues. That assessment assumed Queues because the detection loop felt like event-driven fan-out. It isn't — it's a rolling-window aggregate. We already have everything required:

1. **`gaw_comments` is live and indexed on `created_at`.** The 10-minute rolling window scan hits `idx_gaw_comments_created` directly — no full-table scan, no fan-out.
2. **`scheduled()` already runs every 5 minutes.** Every other non-trivial background job (sniper, discord-retry, modmail enrichment, retention purge) is already hooked in there. Brigade detection is the same shape: fire-and-forget `ctx.waitUntil`, swallow table-missing errors pre-migration.
3. **Queues would add latency, not reduce it.** The use case is a 10-minute window. A Queue-backed approach adds a producer-consumer round-trip on top of the same D1 read we're doing anyway. The only thing Queues buy is horizontal fan-out across workers — irrelevant at our write rate.
4. **The `post_author` denormalization (Migration 043) eliminates the JOIN** that made Cat 1 R2 nervous about query cost. With `post_author` on `gaw_comments` and a compound index `(post_author, created_at DESC)`, the brigade candidate query is a single indexed scan with a GROUP BY — cheap.
5. **False-positive rate is manageable with two guard queries** (see Section E). The incremental cost of those guards is two small indexed reads per candidate thread, not a cross-table join storm.

Queues become relevant at v11 when we want parallel AI scoring of brigade candidates via Llama. That's Section G. For v10, cron + D1 + `brigade_alerts` table is the complete solution.

---

## B. SCHEMA ADDITIONS

Two additions required. Migration 043 (from V11_R2_CAT2_DATABASE #17) must land first.

### Migration 043 — `post_author` denormalization (prerequisite)

```sql
-- Migration 043
ALTER TABLE gaw_comments ADD COLUMN post_author TEXT;

UPDATE gaw_comments c
   SET post_author = (SELECT author FROM gaw_posts WHERE id = c.post_id)
 WHERE post_author IS NULL;

CREATE INDEX IF NOT EXISTS idx_gaw_comments_post_author_created
  ON gaw_comments(post_author, created_at DESC);
```

Ingest handler update: when inserting into `gaw_comments`, include `post_author` from the parent post (already in the ingest payload via `gaw_posts.author`).

### Migration 044 — `brigade_alerts` table

```sql
-- Migration 044
CREATE TABLE IF NOT EXISTS brigade_alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id         TEXT NOT NULL,
  post_author     TEXT NOT NULL,
  detected_at     INTEGER NOT NULL,           -- unixepoch ms
  window_start    INTEGER NOT NULL,           -- ms: detected_at - 10min
  unique_commenters INTEGER NOT NULL,         -- >= 4 to be here
  novel_count     INTEGER NOT NULL,           -- commenters with 0 prior OP overlap
  novel_ratio     REAL NOT NULL,              -- novel_count / unique_commenters
  verdict         TEXT NOT NULL,             -- 'flagged'|'watching'|'cleared'
  ai_hold_id      INTEGER,                    -- FK -> ai_hold_queue.id if escalated
  resolved_by     TEXT,
  resolved_at     INTEGER,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_brigade_alerts_post    ON brigade_alerts(post_id);
CREATE INDEX IF NOT EXISTS idx_brigade_alerts_detected ON brigade_alerts(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_brigade_alerts_verdict  ON brigade_alerts(verdict)
  WHERE verdict IN ('flagged', 'watching');
```

`verdict` values:
- `watching` — candidate threshold crossed but novel ratio below the hard flag line
- `flagged` — novel ratio > 0.30 OR all commenters have zero prior OP overlap; triggers alert surface
- `cleared` — mod dismissed or post is legitimate high-traffic content

Alternatively: insert into `ai_hold_queue` with `kind='brigade'` if that table exists (Migration 032). The worker checks for the table at runtime; falls back to `brigade_alerts` if missing. See Section C.

---

## C. WORKER CRON HOOK

Add `brigadeTick(env)` to `scheduled()` after `gawCrawlTick`. Full implementation:

```js
// ---- cron: brigade detection -----------------------------------------------
// Runs every 5 min. Scans 10-min rolling window for coordinated reply spikes.
// Inert pre-migration-044 (table-missing errors swallowed).

const BRIGADE_WINDOW_MS   = 10 * 60 * 1000;   // 10 minutes
const BRIGADE_MIN_REPLIERS = 4;                // unique commenters to trigger candidate scan
const BRIGADE_NOVEL_FLOOR  = 0.30;             // novel ratio threshold for hard flag

async function brigadeTick(env) {
  if (!env.AUDIT_DB) return;
  const now = Date.now();
  const windowStart = now - BRIGADE_WINDOW_MS;

  // Step 1: find candidate threads — >= BRIGADE_MIN_REPLIERS unique commenters
  // in the rolling window, excluding the OP's own comments.
  let candidates;
  try {
    const rs = await env.AUDIT_DB.prepare(`
      SELECT
        post_id,
        post_author,
        COUNT(DISTINCT author)  AS unique_commenters,
        MIN(created_at)         AS first_comment,
        MAX(created_at)         AS last_comment
      FROM gaw_comments
      WHERE created_at > ?
        AND post_author IS NOT NULL
        AND author != post_author
        AND is_removed = 0
      GROUP BY post_id, post_author
      HAVING unique_commenters >= ?
    `).bind(windowStart, BRIGADE_MIN_REPLIERS).all();
    candidates = (rs && rs.results) || [];
  } catch (e) {
    // Pre-migration-043/044: table or column missing. Silent skip.
    if (String(e).includes('no such column') || String(e).includes('no such table')) return;
    console.error('[brigade] candidate query failed', e);
    return;
  }

  if (!candidates.length) return;
  console.log(`[brigade] ${candidates.length} candidate thread(s) in window`);

  for (const c of candidates) {
    try {
      await brigadeEvaluate(env, c, now, windowStart);
    } catch (e) {
      console.error('[brigade] evaluate failed for', c.post_id, e);
    }
  }
}

async function brigadeEvaluate(env, candidate, now, windowStart) {
  const { post_id, post_author, unique_commenters } = candidate;

  // Dedup: skip if we already have a non-cleared alert for this post
  // in the last 30 minutes (avoid re-alerting every 5min cron cycle).
  const existing = await env.AUDIT_DB.prepare(`
    SELECT id FROM brigade_alerts
     WHERE post_id = ?
       AND detected_at > ?
       AND verdict != 'cleared'
     LIMIT 1
  `).bind(post_id, now - 30 * 60 * 1000).first();
  if (existing) return;  // already alerted this window

  // Step 2: fetch the distinct commenter list for this thread in window.
  const commenters = await env.AUDIT_DB.prepare(`
    SELECT DISTINCT author
      FROM gaw_comments
     WHERE post_id = ?
       AND created_at > ?
       AND author != ?
       AND is_removed = 0
  `).bind(post_id, windowStart, post_author).all();

  const commenterList = (commenters.results || []).map(r => r.author);
  if (commenterList.length < BRIGADE_MIN_REPLIERS) return;

  // Step 3: for each commenter, count their historical comments on ANY thread
  // by this OP (outside the current window). 0 prior = novel account for OP.
  let novelCount = 0;
  for (const username of commenterList) {
    const prior = await env.AUDIT_DB.prepare(`
      SELECT COUNT(*) AS cnt
        FROM gaw_comments
       WHERE author = ?
         AND post_author = ?
         AND created_at < ?
         AND is_removed = 0
       LIMIT 1
    `).bind(username, post_author, windowStart).first();
    if (!prior || prior.cnt === 0) novelCount++;
  }

  const novelRatio = novelCount / commenterList.length;
  const verdict = (novelRatio > BRIGADE_NOVEL_FLOOR || novelCount === commenterList.length)
    ? 'flagged'
    : 'watching';

  // Step 4: write brigade_alerts row.
  let alertId = null;
  try {
    const ins = await env.AUDIT_DB.prepare(`
      INSERT INTO brigade_alerts
        (post_id, post_author, detected_at, window_start,
         unique_commenters, novel_count, novel_ratio, verdict)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      post_id, post_author, now, windowStart,
      commenterList.length, novelCount, novelRatio, verdict
    ).run();
    alertId = ins && ins.meta && ins.meta.last_row_id;
  } catch (e) {
    // Pre-migration-044: table missing. Log to console and stop — no escalation.
    if (String(e).includes('no such table')) {
      console.warn('[brigade] brigade_alerts table missing — run migration 044');
      return;
    }
    throw e;
  }

  if (verdict !== 'flagged') {
    console.log(`[brigade] watching post ${post_id} — novel ratio ${novelRatio.toFixed(2)}`);
    return;
  }

  console.log(`[brigade] FLAGGED post ${post_id} by ${post_author} — ${novelCount}/${commenterList.length} novel, ratio ${novelRatio.toFixed(2)}`);

  // Step 5: escalate to ai_hold_queue if available (Migration 032).
  try {
    const holdIns = await env.AUDIT_DB.prepare(`
      INSERT INTO ai_hold_queue
        (kind, target_kind, target_id, confidence, suggested_action, state, created_at, updated_at)
      VALUES ('brigade', 'thread', ?, ?, 'watch', 'pending', ?, ?)
    `).bind(post_id, Math.min(0.95, 0.60 + novelRatio * 0.35), now, now).run();
    const holdId = holdIns && holdIns.meta && holdIns.meta.last_row_id;
    if (holdId && alertId) {
      await env.AUDIT_DB.prepare(
        `UPDATE brigade_alerts SET ai_hold_id = ? WHERE id = ?`
      ).bind(holdId, alertId).run();
    }
  } catch (_) {
    // ai_hold_queue pre-Migration-032: silently skip escalation.
  }

  // Step 6: Discord alert.
  if (env.DISCORD_WEBHOOK) {
    const postUrl = `https://greatawakening.win/p/${post_id}`;
    await discordWebhookSend(env, 'DISCORD_WEBHOOK', {
      username: 'GAW ModTools | Brigade Detector',
      embeds: [{
        title: 'BRIGADE ALERT',
        color: 0xE74C3C,
        description: `**Thread by ${post_author}** triggered brigade detection.\n${novelCount} of ${commenterList.length} repliers have ZERO prior history with this OP.`,
        fields: [
          { name: 'Post', value: postUrl, inline: false },
          { name: 'Novel ratio', value: `${(novelRatio * 100).toFixed(0)}%`, inline: true },
          { name: 'Unique repliers (10m)', value: String(commenterList.length), inline: true },
          { name: 'Novel accounts', value: String(novelCount), inline: true }
        ],
        timestamp: new Date(now).toISOString()
      }]
    }).catch(e => console.error('[brigade] discord alert failed', e));
  }
}
```

**Wire into `scheduled()`** — one line added after the existing `gawCrawlTick` call:

```js
ctx.waitUntil(gawCrawlTick(env).catch(cronCatch('gawCrawlTick')));
ctx.waitUntil(brigadeTick(env).catch(cronCatch('brigadeTick')));  // v10 NEW
```

---

## D. CLIENT NOTIFICATION

Three surfaces, in escalation order:

### 1. Status-bar SIREN pulse (amber, auto-clears on mod ack)

Brigade alerts surface to the status bar the same way other AI signals do. When the extension polls `/modtools/status` (or the equivalent health/alert endpoint), the response includes a `brigade_alerts` field:

```json
{
  "brigade_alerts": {
    "count": 2,
    "latest": {
      "post_id": "abc123",
      "post_author": "TargetedOP",
      "novel_ratio": 0.83,
      "unique_commenters": 6,
      "detected_at": 1715280000000
    }
  }
}
```

Status-bar renders an amber `BRIG` chip when `count > 0`. Clicking opens the ModQueue filtered to `brigade` kind. Chip dismisses when last alert is cleared or 30 minutes elapse without new flags.

### 2. Browser notification

On first brigade flag per session, fire `new Notification('Brigade Alert', { body: 'Coordinated reply detected on ...' })` with the post link. Requires notification permission — request it during onboarding, same path as existing mod alerts.

### 3. ModChat ping

Discord webhook fires in `brigadeEvaluate()` above (Step 6). The embed includes the direct post URL, novel ratio, and commenter count. Mods can react with a defined emoji to mark as "watching" or "cleared" — a future bot listener can write back to `brigade_alerts.verdict`.

---

## E. FALSE-POSITIVE GUARDS

The two most common noise sources and how we stop them:

**1. Viral/trending posts.** A post that hits the front page legitimately gets dozens of new commenters in 10 minutes — all of whom may have zero prior history with the OP simply because they've never commented on that person's threads before. Guard: **require the thread to be ≤ 2 hours old**. Brigades typically target fresh posts; viral drift on established posts is a different pattern. Add to the candidate query:

```sql
AND post_id IN (
  SELECT id FROM gaw_posts
   WHERE created_at > (? - 2 * 3600 * 1000)
)
```

**2. Well-known OPs.** A prolific poster with hundreds of posts will have a large comment pool across many users — "novel" is meaningless for them. Guard: **skip OP accounts with > 200 historical comments-received** (a KV-cached count, refreshed weekly). High-volume OPs aren't brigade targets in the way a fresh-account post is.

**3. Known-good accounts.** Long-tenured users with 50+ posts of their own aren't brigade participants — they're regulars. Guard: **exclude commenters where `gaw_users.post_count > 50 OR gaw_users.comment_count > 100`** from the novel count. These are regulars commenting on a hot thread, not astroturf.

**4. Re-alert suppression.** The 30-minute dedup check in `brigadeEvaluate()` prevents the 5-min cron from spamming alerts on the same thread. A single flag per 30-minute window per thread.

Tuning: `BRIGADE_NOVEL_FLOOR = 0.30` is conservative. At 4 commenters that's 2 novel accounts to hit `watching`, 2 to `flagged`. Tune upward if false-positive rate is high after first week.

---

## F. SHIP-TONIGHT MINIMAL PATCH

Smallest diff that proves the detector works without surfacing noise to mods:

**Step 1 — Migrations (run in order):**

```sql
-- Migration 043 (post_author denorm — prerequisite)
ALTER TABLE gaw_comments ADD COLUMN post_author TEXT;
UPDATE gaw_comments c
   SET post_author = (SELECT author FROM gaw_posts WHERE id = c.post_id)
 WHERE post_author IS NULL;
CREATE INDEX IF NOT EXISTS idx_gaw_comments_post_author_created
  ON gaw_comments(post_author, created_at DESC);

-- Migration 044 (brigade_alerts)
CREATE TABLE IF NOT EXISTS brigade_alerts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id          TEXT NOT NULL,
  post_author      TEXT NOT NULL,
  detected_at      INTEGER NOT NULL,
  window_start     INTEGER NOT NULL,
  unique_commenters INTEGER NOT NULL,
  novel_count      INTEGER NOT NULL,
  novel_ratio      REAL NOT NULL,
  verdict          TEXT NOT NULL DEFAULT 'flagged',
  ai_hold_id       INTEGER,
  resolved_by      TEXT,
  resolved_at      INTEGER,
  notes            TEXT
);
CREATE INDEX IF NOT EXISTS idx_brigade_alerts_detected ON brigade_alerts(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_brigade_alerts_verdict  ON brigade_alerts(verdict)
  WHERE verdict IN ('flagged','watching');
```

**Step 2 — Worker:** add `brigadeTick()` + `brigadeEvaluate()` functions from Section C. Wire the `brigadeTick` call into `scheduled()`. Deploy.

**Step 3 — Observe, don't alert.** For the first 48 hours, set `verdict` to `watching` regardless of novel ratio — write to `brigade_alerts` but skip the Discord webhook and status-bar push. Let the table accumulate data. Pull the top 10 rows and calibrate thresholds before enabling hard flags.

```sql
-- Calibration query: run after 48h soak
SELECT post_id, post_author, unique_commenters, novel_count,
       ROUND(novel_ratio * 100, 1) AS novel_pct, verdict, detected_at
  FROM brigade_alerts
 ORDER BY novel_ratio DESC
 LIMIT 20;
```

**Step 4 — Enable hard flags.** Flip `BRIGADE_NOVEL_FLOOR` based on calibration output and re-deploy. Enable Discord webhook path. Add status-bar chip in next extension build.

Total diff: ~120 lines of JS (the two functions + 1 scheduled() line), two SQL migrations. No new external dependencies, no Queues, no new KV namespaces.

---

## G. STRETCH (v10.5+)

**Reply-graph fingerprint.** The current detector is purely temporal + novelty. v10.5 adds structural analysis: do the brigade commenters reply to each other, or only to the OP? A pure fan-in pattern (all replies at depth 0, no cross-commenter replies) is a stronger brigade signal than organic conversation. Query uses `parent_id` from `gaw_comments` — already stored.

**AI confidence scoring.** Pass the candidate thread summary (post body, commenter list, novel ratio, reply graph shape) to the Llama `/ai/classify` endpoint. Returns a 0-1 confidence score and a rationale string. Store in `brigade_alerts.notes` and use as a secondary filter before hard-flagging. This is where Queues would actually help — fan-out one Llama call per candidate in parallel.

**Auto-incident invocation.** When `novel_ratio > 0.70` AND `unique_commenters >= 6`, auto-open a `mod_incidents` row with `trigger_kind='auto-brigade'`. Populate `r2_evidence_key` with a screenshot of the thread captured via the Puppeteer-style endpoint. Mod gets a pre-packaged incident to close, not a raw alert to investigate.

**Temporal clustering.** Track the interval between comments (not just the count). A brigade often has comments arriving in a tight cluster (< 30 seconds between each). Organic comment arrival follows a power-law distribution. A Z-score on inter-comment interval is a cheap additional signal.

**Cross-thread fingerprint.** If the same set of novel accounts appears on multiple OP threads within 24 hours, escalate confidence significantly. This catches slow brigades that spread their comments to avoid the 10-minute window threshold.
