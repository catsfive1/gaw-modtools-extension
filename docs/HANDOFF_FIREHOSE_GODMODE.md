# FIREHOSE + GOD MODE SEARCH — Project & Feature Handoff

**Last updated:** 2026-05-30 · **Author:** Claude Opus 4.8 (CTO, C5 Ops)
**Ship state:** extension **v10.18.1** (`6381d55`) · worker **v10.18.1** (deployed)
**Live archive:** **33,600+ posts / 6,300+ comments**, growing ~250 posts every 5 min, autonomous

---

## 1. What this is, in one paragraph

GAW's native search is weak — you can't use quotes, operators, or rich filters, and you can't find deleted content. **FIREHOSE** fixes the data half: a Cloudflare Worker cron continuously archives greatawakening.win posts/comments into a Cloudflare D1 (SQLite) database with full-text search — capturing content *before* it gets removed. **GOD MODE SEARCH** is the product half: a real search engine on top of that archive, with a proper query language (quotes, `author:`, `score:>50`, `date:`, `removed:1`, exclusions, prefix), available both inside the ModTools extension and as a standalone web app. Together they turn years of GAW content into something genuinely searchable — better than the live site can do.

---

## 2. Current state (verified 2026-05-30)

| Thing | Value |
|---|---|
| Extension version | **10.18.1** (`modtools-ext` master `6381d55`) |
| Worker version | **10.18.1** (deployed to `gaw-mod-proxy`) |
| Posts archived | **33,643** (climbing continuously) |
| Comments archived | **6,360** |
| Posts found via keyword crawler | **21,746** (65% — the crawler is the engine) |
| Keyword wordbank | **673 terms** (all rotating) |
| Crawler status | LIVE, ticks every 5 min |
| Standalone search app | https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev/godmode |
| Worker base | https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev |
| D1 database | `gaw-audit` (id `5b54825c-de21-4d73-812c-867ee93e751d`) |

---

## 3. The two pillars

### FIREHOSE — the data engine
A self-feeding archive of GAW content in D1. Two crawl mechanisms run on the worker's 5-minute cron:
- **`gawCrawlTick`** — walks the `/new` feed, captures the freshest posts + hydrates comments.
- **`keywordCrawlTick`** (v10.17.0) — the heavy lifter. Picks the 6 least-recently-crawled terms from a 673-word politics/conspiracy wordbank (weight-biased), searches GAW for each, and ingests every result. This is what surfaced 21K+ posts the `/new` crawl alone would have missed.
- Both upsert into `gaw_posts` / `gaw_comments` (idempotent — keyed on post id, safe to overlap/re-run).
- Every captured post is full-text indexed (SQLite FTS5) on title + body + author.
- Flag-killable via env var `GAW_KEYWORD_CRAWL_ENABLED='false'`.

### GOD MODE SEARCH — the product
A search engine over the FIREHOSE archive, in two surfaces:

**A) Standalone web app** — `GET /godmode` on the worker (v10.18.0). A self-contained search page: paste mod token once → search the whole archive → click any result to jump to it on GAW. Live archive stats baked into the header. Its own destination — bookmarkable, shareable.

**B) Inside the extension** (v10.17.0–10.18.1) — for mods already running ModTools:
- `Ctrl+Shift+P` → "GOD MODE" → search modal (uses the mod's saved token automatically, no paste needed)
- 🔍 icon in the floating status bar
- Bulk actions on results (open-in-tabs, copy authors, copy URLs)
- Saved + recent query chips
- **"⛶ FULL APP" button** (v10.18.1) — escalates the modal to the standalone app, carrying the current query

### The search grammar (both surfaces)
```
trump pelosi              words (FTS5 AND)
"exact phrase"            quoted phrase
author:catsfive           by a specific user
community:GreatAwakening  scope to a community (posts only)
score:>50  score:<=10     vote thresholds (> >= < <= =)
date:2026-01-01..2026-03-01   date range (either end optional)
removed:1                 DELETED content (mod-only lens — the killer feature)
-fauci                    exclude a term
trump*                    prefix match
```
Sort: relevance (BM25) · newest · score. Scope: posts · comments · both.

---

## 4. Observability

- **Worker endpoint** `GET /admin/firehose/keywords` (lead-only) — summary stats (total/crawled/never-crawled/errored, posts found, avg yield) + top-productive terms + recently-crawled + errored + never-crawled sample + last-tick metadata.
- **In-extension** `Ctrl+Shift+P` → "Firehose crawl health" — renders all of the above as a modal (KPI tiles + tables).
- **Self-verifying profile-hide check** (v10.17.4) — unrelated to FIREHOSE; a console PASS/FAIL assertion for the `/u/` post-hide bug.

---

## 5. Architecture & where things live

```
D:\AI\_PROJECTS\
├── modtools-ext\                      (Chrome MV3 extension — git: master)
│   ├── modtools-aux.js                Wave 5 IIFE = all GOD MODE UI (~line 1888)
│   │                                  + profile-protector IIFE (~line 1041)
│   ├── background.js                  modSearch + modAdminFirehoseKeywords RPCs
│   ├── manifest.json                  version 10.18.1
│   ├── docs\                          this file + prior handoffs + ROLLOUT_*.md
│   └── scripts\build-zip.ps1          packager
└── cloudflare-worker\                 (GITIGNORED from c5-ops — deploys via wrangler)
    ├── gaw-mod-proxy-v2.js            the worker (handlers below)
    ├── migrations\045_*.sql           firehose_keywords table + 340 seed terms
    ├── migrations\046_*.sql           +334 keywords (→ 673)
    ├── test-godmode-parser.js         34-assertion grammar test (all pass)
    └── scripts\deploy.ps1             deploy (auto wrangler deploy --keep-vars + smoke)
```

**Key worker handlers** (`gaw-mod-proxy-v2.js`):
- `keywordCrawlTick` — the keyword-fanout crawler (wired into `scheduled()`)
- `gawCrawlTick` — the `/new` crawler
- `handleGawSearch` + `parseGodmodeQuery` — search API + grammar parser (`/gaw/search?godmode=1`)
- `handleGodModeApp` — serves the standalone `/godmode` web app
- `handleAdminFirehoseKeywords` — observability endpoint

**Key endpoints:**
| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /godmode` | public shell | the standalone search app |
| `GET /gaw/search?godmode=1&q=…` | mod token | the search API (powers both surfaces) |
| `GET /admin/firehose/keywords` | lead only | crawler observability |
| `GET /version` | public | version check |

**D1 tables:** `gaw_posts`, `gaw_comments` (+ FTS5 mirrors `gaw_posts_fts` / `gaw_comments_fts`), `gaw_users`, `gaw_crawl_state`, `gaw_ingest_audit`, `firehose_keywords`.

**Critical fact:** the worker source is **gitignored from the c5-ops repo** — it lives only in the local file + the deployed worker. There is no git backup. The `modtools-ext/CHANGELOG.md` is the worker's change record.

---

## 6. How to use it (ELI5)

**Inside the extension** (for mods): on any GAW page, press `Ctrl+Shift+P`, type "god mode", hit Enter. Search box appears. Type words (or operators). Click a result to jump to it. Uses your saved token automatically.

**Standalone app** (full-screen / shareable): go to the `/godmode` URL, paste your mod token once, search.

**Try:** `trump` · `author:someuser` · `"exact phrase"` · `removed:1` (finds deleted posts) · `epstein score:>50 date:2026-01-01..`

---

## 7. How to roll it out

**To existing mods (now):** they already have ModTools + tokens. Push the v10.18.1 ZIP via Discord DM (`dist\gaw-modtools-chrome-store-v10.18.1.zip`); they reload the extension (`chrome://extensions` → ↻). GOD MODE then works in their palette using their saved token — zero token fuss. Full mod-facing copy is drafted in chat / `docs/ROLLOUT_MOD.md` is the established template.

**Known gap:** the *standalone app* makes a user paste a token, and there's **no "copy my token" button** in the popup yet — so for the team, the in-extension path is the easy one. (Proposed fix: a "Copy my token + open GOD MODE" popup button.)

---

## 8. Strategic roadmap (grounded in live API probing, 2026-05-30)

### A) Public rollout — GOD MODE as a public search engine for GAW
Make it a public-facing feature, not just a mod tool. **Tiered access is the key design:**
- **Public (no login):** searches **non-removed** posts only. Indexing already-public content, like Google indexing a forum — safe. Dead-simple Google-style box; operators behind an "Advanced" toggle; mobile-first.
- **Mods (token):** + removed/deleted content + forensics. The `removed:1` graveyard stays mod-only.

Path: drop token requirement for non-removed search → per-IP rate limiting → real domain (e.g. `search.greatawakening.win`) → announce via stickied post + header link. The public tier needs **no token**, which erases the token-friction gap entirely. This makes GOD MODE a flagship differentiator the native platform can't match.

### B) Historical backfill — ingest years of >20-vote posts
**Live-probe findings (what GAW actually supports):**
- HTML `?page=N` pagination is **dead** (ignored).
- The **Scored JSON API is wide open**: `api.scored.co/api/v2/post/*.json?community=GreatAwakening` returns clean structured data (id, score, created-ms, title, author, content, is_removed, uuid/slug, comments…). No HTML parsing, no WAF fight.
- `top.json` is a **capped leaderboard** (~25, bottoms at 171 votes) — useless for completeness.
- Feeds **don't paginate backward** via any cursor tried (page/from/before/after).
- **Per-post-by-ID WORKS:** `api.scored.co/api/v2/post/post.json?id=<N>&community=GreatAwakening` returns any post. Post IDs are **sequential integers**.

**The backfill strategy (ranked):**
1. **Switch ingest to the JSON API** — cleaner data, no scraping, no breakage. Foundational.
2. **Autonomous ID-walk** — since any post is fetchable by ID and IDs are sequential, a free background cron walks GAW's ID range, fetches each post, keeps `score>20`, upserts (idempotent + resumable + throttled). Set-and-forget over weeks; covers all history.
3. **Author-history walk** — walk known authors' full post histories via the API (targets GAW content with no waste). *Needs a build-time spike to confirm author-feed pagination depth.*
4. Combo: API ingest + author-walk (bulk) + ID-walk (gap-fill) + live crawler (forward).

**Recommended order:** backfill *first*, then go public — a public search engine is only impressive with years of depth behind it. First concrete step is a ~1-hour spike: switch crawler to the JSON API + confirm author-feed pagination + sample the ID range to size the job.

---

## 9. Version history (this feature line)

| Ver | What |
|---|---|
| v10.17.0 | FIREHOSE keyword crawler (`keywordCrawlTick` + migration 045, 340 terms) + GOD MODE search grammar (`parseGodmodeQuery`) + in-extension search modal |
| v10.17.1 | Bulk action bar + saved/recent query chips + status-bar 🔍 icon |
| v10.17.2 | `/admin/firehose/keywords` observability + crawl-health modal + migration 046 (→673 terms) |
| v10.17.3 | Profile-page hide veto (CSS `!important` — unrelated to FIREHOSE) |
| v10.17.4 | Self-verifying profile-hide console assertion |
| v10.18.0 | **GOD MODE SEARCH standalone app** (`/godmode` worker route) |
| v10.18.1 | Discoverability — "FULL APP" button + palette command + `#q=` query-carry |

---

## 10. Open items / known gaps

1. **In-browser validation pending.** The GOD MODE UI (modal, bulk actions, standalone app, profile-hide veto) is code-verified (34 parser tests + curl smoke + parse-checks) but has NOT been confirmed rendering in a live browser with a real token. **First action with Commander present: 60-second reload + search smoke-test.**
2. **No "copy my token" button** — blocks frictionless standalone-app use for non-lead mods.
3. **Backfill not started** — the archive is recent-only (days, not years) until the ID-walk/author-walk ships.
4. **Public tier not built** — still mod-token-gated everywhere.
5. **Standalone app URL is a `workers.dev` domain** — fine for mods, wants a real domain before a public launch.
6. **Crawler saturating** — all 673 keywords rotate fast; yield-per-tick will fall as the index fills. Tuning options in the prior handoff (more terms/tick, deep backfill).

---

## 11. Standing orders (inherited)
Never ask permission to commit · commit at every version change · test from your own side before handing Commander anything · eliminate the meatbag (run it yourself) · drive, don't hold, don't menu · every ZIP mirrors to `E:\My Drive\_PROJECTS\modtools-ext\` (last-2) · worker source gitignored (CHANGELOG is its record) · Git Bash mangles `taskkill /F` → use PowerShell `Stop-Process`.

— Opus 4.8, CTO C5 Ops, 2026-05-30
