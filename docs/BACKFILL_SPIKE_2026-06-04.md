# FIREHOSE Backfill Spike — Findings & Recommended Ship

**Date:** 2026-06-04 · **Author:** Claude Opus 4.7 (CTO, C5 Ops)
**Status:** spike complete · ready-to-build spec for v10.19 backfill ship
**Parent:** [HANDOFF_FIREHOSE_GODMODE.md §8B](HANDOFF_FIREHOSE_GODMODE.md)

---

## TL;DR

The handoff named three backfill paths (JSON API ingest, ID-walk, author-walk) and flagged author-walk as **"needs a build-time spike to confirm author-feed pagination depth."** Spike result: there is **no JSON user-feed endpoint** (every `/user/*.json` shape I probed 404s), **but the profile-page HTML at `/u/<name>?page=N` paginates deep** — 50 items/page, monotonically descending IDs, working at page 20 with no apparent end. So author-walk is alive, just over HTML instead of JSON. Combined with the other live-probed facts, the recommended v10.19 ship is a **three-track hybrid backfill** with author-walk as the fast path.

---

## Live probes (2026-06-04)

| Probe | Result | Implication |
|---|---|---|
| `GET api.scored.co/api/v2/post/newv2.json?community=GreatAwakening` | HTTP 200, 25 posts, `has_more_entries:true`, current max id **8,658,472** | Live crawl ingest path — clean JSON, all the fields we need (title, content, score, is_removed, is_deleted, is_edited, removal_source, created, comments, community, author) |
| `GET api.scored.co/api/v2/post/post.json?id=N&community=GreatAwakening` for N ∈ {100, 1000, 10000, 100000, 500000, 1000000, 2000000, 5000000} | HTTP 200 every time; `community=` query param **silently ignored** — returns whichever community the post is actually in | Post IDs are **globally sequential across the entire scored.co network** (TheDonald + GAW + others). ID-walk must **filter community AFTER fetch.** |
| First-GAW-by-ID sweep | id=2,000,000 (2021-02-04) is GAW; id=5,000,000 (2022-11-04) is TheDonald | GAW posts are sparse within the global ID space. Rough ID range for GAW backfill: **~2M to 8.66M = ~6.66M IDs to walk**. Yield rate per sample ~10–15% GAW. |
| `GET api.scored.co/api/v2/user/posts.json?...` and 5 sibling variants | All 404 | **No JSON user-feed endpoint.** The handoff's "author-feed pagination depth" question can't be answered via JSON. |
| `GET greatawakening.win/u/catsfive?page=N` for N ∈ {1, 2, 5, 10, 20} | HTTP 200 every time, **50 items/page**, IDs strictly decreasing (page 1 → 8,658,472; page 20 → 8,527,503) | **Author-walk via HTML pagination WORKS and goes deep.** Each page returns post-listing HTML the existing `gawParseListingHtml` already understands (same `data-id` markup as `/new` and `/search`). |

**Per-page yield gap fixed: 25 (JSON `/newv2`) vs 50 (HTML profile)** — author-walk pulls 2× per request.

---

## What changes vs the handoff

1. **The handoff's "HTML `?page=N` pagination is dead" finding was scoped to the `/new` listing.** It is **not** dead on profile pages. Author-walk via HTML is alive.
2. **No JSON author-feed exists** — author-walk has to use HTML scraping (same parser the v10.17 keyword crawler already uses for `/search`).
3. **ID-walk's community= query param is a no-op** — every per-ID fetch returns whatever community the post is in. The cron has to filter `community=='GreatAwakening'` after the fetch and drop the rest.

Everything else in the handoff §8B holds.

---

## Recommended v10.19 ship — three-track hybrid

**Order matters: 1 (live cleanup) → 2 (high-signal backfill) → 3 (deep gap-fill).**

### Track 1 — Swap live crawler to JSON API *(foundational; do first)*
- Replace the current `/new` HTML scrape in `gawCrawlTick` with `GET /api/v2/post/newv2.json?community=GreatAwakening`.
- Map JSON fields → existing `gaw_posts` columns (already structurally identical to what the HTML parser extracts).
- Keep keyword crawler on HTML for now — `/search` may not have a JSON equivalent (a follow-up spike). Live `/new` JSON swap alone removes the HTML-parser breakage risk on the highest-volume path.
- **Diff size: ~80 lines worker.** No D1 schema change.

### Track 2 — Author-walk backfill *(fast path; biggest impact per hour)*
- New worker route or scheduled job that walks `D:` for every author currently in `gaw_posts` and pages `/u/<author>?page=1..N` until a page returns posts whose IDs are **all already in `gaw_posts`** (= caught up).
- Re-uses existing `gawParseListingHtml` + `gawUpsertPostRow`. Idempotent. Resumable.
- Self-expanding: every backfilled post may surface a new author whose history then gets walked.
- **Throughput:** 50 posts/page × ~1 page/sec gentle = 180K posts/hour. The full ~33K-author catch-up is hours, not weeks.
- **State:** new D1 column `gaw_users.last_backfill_page_walked` + `last_backfill_at`. Same idempotency story as `firehose_keywords`.
- **Diff size: ~150 lines worker + 1 migration.**

### Track 3 — ID-walk gap-fill *(deep coverage; runs continuously)*
- New cron tick that pulls a batch of N un-seen post IDs (descending from max-id, gap-aware) and fetches each via `GET /api/v2/post/post.json?id=N`.
- Keep only `community=='GreatAwakening'` rows. Drop the rest with a single `gaw_id_gap_seen` write so the same ID never gets fetched twice.
- New D1 table `gaw_id_walker_state` (next_id_descending, last_walked_at, post_yield_total, non_gaw_drops_total) so the cron resumes after worker restart.
- **Throughput estimate:** 6.66M IDs to walk × ~10% GAW yield × 50ms/fetch = ~93 hours of fetches to cover the whole range. At 5-min cron with batch=120, that's ~115 ticks/day × 120 fetches = 13.8K/day → ~17 months. Need to crank batch size or parallelize.
- **Pragmatic option:** start with batch=120, observe yield/throttle for a week, then tune batch + add concurrent fetches (Cloudflare Worker `Promise.all` × 6) to hit ~3× faster.
- **Diff size: ~120 lines worker + 1 migration.**

---

## Estimated total v10.19 scope

- Worker: ~350 lines net + 2 D1 migrations (047 author-walk state, 048 ID-walker state).
- Extension: zero changes if we don't expose new observability panels; +30 lines for a "Backfill status" tile in the existing crawl-health modal.
- Worker version: 10.18.1 → **10.19.0**.
- Extension version: 10.18.2 → **10.19.0** (if we ship the observability tile; otherwise hold extension at 10.18.2).

---

## Open questions (not blockers — answer during build)

1. **Rate limits.** No 429s seen during the spike's ~30 requests over ~2 minutes. Real-world steady-state throughput will tell us. Defensive throttle in the cron: `await sleep(50ms)` between fetches, exponential backoff on 429/503.
2. **`/search?params=` JSON equivalent.** The keyword crawler is the heaviest current load. If `api.scored.co` has a JSON search, swap it too. Follow-up curl spike — `searchv2.json` 404'd in this probe but there may be other names.
3. **Removed-content handling.** Live `/newv2` returns `is_removed:true` posts (confirmed in the probe response). Per-ID fetches likewise return removed posts. The archive captures removal *correctly* during forward crawl — but backfilled-after-removal posts may already be `is_removed:true` at fetch time, which is the desired behavior (we want the graveyard).
4. **Comments backfill.** Out of scope for v10.19 unless trivial. The current archive has ~6,360 comments vs 33,643 posts (ratio 0.19). Live `/newv2` brings comment counts but not bodies. Comments backfill = separate v10.20 spike.

---

## How to consume this doc

The recommended next conversation is a **build-and-ship turn for Track 1** (swap live crawler to JSON API). It's the foundational change, the smallest diff, and de-risks the bigger backfill tracks by proving the JSON ingest pipeline works end-to-end. Track 2 and Track 3 stack on it.

If Commander redirects to a different priority (public tier, comments backfill, alternate strategy), this doc is also the orientation reference for any other model picking up.

— Opus 4.7, CTO C5 Ops, 2026-06-04
