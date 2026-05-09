# BUILDER-FIREHOSE-WORKER Report
**Generated:** 2026-05-09  
**Agent:** BUILDER-FIREHOSE-WORKER  
**Session target:** v9.5.1 -> v9.6.0

---

## Summary

All 6 firehose worker patches shipped. Migrations 036-041 applied cleanly.
Worker deployed and all new endpoints smoke-tested live.

---

## Migrations Applied

| Migration | File | Status | Notes |
|-----------|------|--------|-------|
| 036 | `036_brigade_post_author.sql` | APPLIED | `post_author` column backfilled (13,058 rows written). Two indexes created. |
| 037 | `037_brigade_alerts.sql` | APPLIED | `brigade_alerts` table + 3 indexes created. |
| 038 | `038_lookalikes_idx.sql` | APPLIED | `idx_gaw_comments_post_author` covering index for self-join. |
| 039 | `039_topn_idx.sql` | APPLIED | Composite indexes on `gaw_posts(author, created_at)` and `gaw_comments(author, created_at)`. |
| 040 | `040_sticky_queue.sql` | APPLIED | `sticky_queue` table + status index created. |
| 041 | `041_thread_intel_idx.sql` | APPLIED | `idx_gaw_comments_post_id_created` (idempotent; already created in 036). |

---

## WORKER_VERSION Bump

`9.5.1` -> `9.6.0`

---

## Deploy

**Deploy ID:** `92cd89e6-ef8a-4618-9dc8-47b075f2af6a`  
**URL:** https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev  
**Size:** 529.32 KiB / gzip: 114.61 KiB

---

## Per-Patch Notes

### Patch 1: Brigade Detector (V10_FIREHOSE/04)
- `brigadeTick()` + `brigadeEvaluate()` added per Section C spec.
- Wired into `scheduled()` after `gawCrawlTick`.
- **Soak-first mode active:** verdict forced to `watching` regardless of novel ratio. Discord alerts suppressed. Set `BRIGADE_HARD_ALERTS_ON=true` env var to enable hard flags after 48h calibration.
- All 4 false-positive guards from Section E implemented: prolific OP skip (>200 comments-received), tenured regular exclusion from novel count (post_count>50 OR comment_count>100), 30-minute re-alert dedup, `is_removed=0` filter on both sides.
- Gracefully inert pre-migration (table/column missing errors swallowed).

### Patch 2: User Similarity (V10_FIREHOSE/02)
- `handleUsersLookalikes` added with Levenshtein helper (`levenshtein()`).
- Co-commenter self-join + JS re-rank (80% overlap / 20% name similarity).
- Confidence tiers: HIGH >= 0.6, MEDIUM >= 0.35, WATCH below.
- **Feature-flagged:** set `LOOKALIKES_FEATURE=true` env var to enable. Currently returns `{"ok":false,"error":"feature not enabled"}` (intentional until flag set).
- All 7 false-positive guards from Section E implemented: min_overlap floor, confidence tiers only (no raw scores), name_distance as metadata, `is_removed=0` on both join sides, `c2.author != c1.author` self-exclusion.

### Patch 3: Search Surface FTS5 upgrade (V10_FIREHOSE/03 Section F)
- `handleGawSearch` upgraded from phrase-only to prefix+boolean.
- Trailing `*` queries pass through as prefix; all others phrase-wrapped.
- Optional `?sort=rank` param using `bm25()` for relevance ordering (default: `date`, no regression).
- Expanded sticky-detect keyword OR block also applied to the existing on-demand `handleAiStickyDetect` endpoint (11-keyword set per Section B).

### Patch 4: Top-N Posters (V10_FIREHOSE/07)
- `handleAdminFirehoseTopPosters` added.
- `GET /admin/firehose/top-posters?window=24h|7d|30d&kind=post|comment|both&limit=N`
- Velocity score (`posts_per_day` / `comments_per_day`) normalized by user's active span in window.
- Lead-only via `requireLeadAuth`.

### Patch 5: Sticky-Detection live-feed cron (V10_FIREHOSE/08)
- `stickyDetectCronTick()` wired into `scheduled()`.
- 11-keyword OR GLOB block (expanded from single `*sticky*`).
- KV rate-limit flag (`sticky_cron_last`) prevents double-runs within 4 min.
- `GET /admin/queue/sticky` + `PATCH /admin/queue/sticky/<thread_id>` endpoints added.
- `sticky_queue` upsert is `ON CONFLICT(thread_id) DO NOTHING` (idempotent).

### Patch 6: Per-Thread Commenter Context (V10_FIREHOSE/10)
- `handleModThreadIntel` added for `GET /mod/thread/intel?id=<post_id>`.
- Novelty scoring formula in JS (account age, karma, ban_count, is_sus, is_dr weights).
- **Schema adaptation:** `gaw_users` does not have `link_karma`, `comment_karma`, `ban_count`, `is_sus`, `is_dr` columns in the live schema. Substituted with `karma` (single column) and zeroed-out the missing fields. Novelty score still functions via account age + karma signals; ban/sus signals will activate automatically if/when those columns are added.
- Top 5 suspects returned sorted by novelty_score DESC.

---

## Endpoint Smoke Probe Results

| Endpoint | Method | Result | Notes |
|----------|--------|--------|-------|
| `/version` | GET | `9.6.0` | PASS |
| `/admin/users/lookalikes` | POST | `{"ok":false,"error":"feature not enabled"}` | PASS (flag intentionally off) |
| `/admin/firehose/top-posters?window=24h&kind=post&limit=5` | GET | `ok:true, 5 posts returned` | PASS |
| `/admin/queue/sticky?limit=5` | GET | `ok:true, items:[], count:0` | PASS (empty, cron not yet run) |
| `/mod/thread/intel?id=8608316` | GET | `ok:true, 1 commenter, novelty_score:21` | PASS (real data) |
| `/gaw/search?q=Q*&scope=posts&limit=3` | GET | `ok:true, 3 posts` | PASS (prefix search) |
| `/gaw/search?q=trump&scope=posts&sort=rank&limit=3` | GET | `ok:true, 3 posts` | PASS (rank sort) |

---

## Schema Adaptation Log

**gaw_users missing columns:** The design doc (V10_FIREHOSE/10) specified `link_karma`, `comment_karma`, `ban_count`, `is_sus`, `is_dr` on `gaw_users`. Live schema has only `karma` (single column). The thread intel handler uses `karma` for the karma signals and zeroes the others. Novelty scoring is functional but ban/sus signals are dormant. When those columns land (V11 DATABASE doc items), the SQL query in `handleModThreadIntel` should be updated to restore them.

---

## To Activate Remaining Feature Flags

```
# Enable lookalikes (after validating against known alt accounts)
npx wrangler secret put LOOKALIKES_FEATURE
# Enter: true

# Enable brigade hard alerts (after 48h soak calibration)
npx wrangler secret put BRIGADE_HARD_ALERTS_ON
# Enter: true
```

Calibration query for brigade soak review:
```sql
SELECT post_id, post_author, unique_commenters, novel_count,
       ROUND(novel_ratio * 100, 1) AS novel_pct, verdict, detected_at
  FROM brigade_alerts
 ORDER BY novel_ratio DESC
 LIMIT 20;
```
