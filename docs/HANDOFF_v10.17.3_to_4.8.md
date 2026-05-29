# HANDOFF — Commander Cats / GAW ModTools / C5-Ops — to Opus 4.8

**Date:** 2026-05-27
**Outgoing agent:** Claude (Opus 4.7, 1M context)
**Latest ship:** modtools-ext **v10.17.3** / worker **v10.17.2** live (deployed)
**Repo state:** modtools-ext `master` @ `0bb72c8`; c5-ops `main` (worker gitignored)

This handoff is **self-contained**. You (4.8) start with ZERO context from the
prior session except this doc + the system prompt + `~/.claude/CLAUDE.md`
(auto-loaded) + memory.md. Read this end-to-end before doing anything.

**There is a PRIOR handoff** at `docs/HANDOFF_v10.16.50_to_next_chat.md` — it
still holds the durable context (who Commander is, repo layout, AF-08 audit
invariant, z-index hierarchy, standing orders, communication style). Read it
too. THIS doc layers the v10.17.x session on top.

---

## 1. THE ONE-PARAGRAPH CATCH-UP

Commander asked for two things at session start: (1) a crawler that
"sucks in EVERY POST" to the FIREHOSE D1 by randomly searching US-politics
keywords, and (2) a rich "GOD MODE" search feature in ModTools. Both shipped,
plus polish + observability + a recurring-bug fix. **The crawler is the
headline win: FIREHOSE went from ~9.7K posts to 32K+ in a few hours, 21.6K of
them surfaced by the keyword crawler that didn't exist before this session.**
Worker deployed twice (10.17.0, 10.17.2). Extension shipped four times
(10.17.0 → 10.17.3). Also: killed a runaway Claude Code session, answered a
Hermes-API question, and killed (again) the profile-page post-hide bug with a
CSS veto.

---

## 2. CURRENT SHIP STATE (verified 2026-05-27)

| Surface | Version | State |
|---|---|---|
| modtools-ext manifest | **10.17.3** | HEAD `0bb72c8`, tree clean |
| Worker (`gaw-mod-proxy`) | **10.17.2** | deployed live; `/version` confirms |
| D1 `gaw-audit` | — | **673 keywords (all crawled), 32,009 posts, 21,681 via keyword crawler** |
| Latest ZIP | 10.17.3 | `D:\AI\_PROJECTS\dist\gaw-modtools-chrome-store-v10.17.3.zip` (684.8 KB, sha256 `fdafdee4…`) |
| Load-unpacked | 10.17.3 | `D:\AI\_PROJECTS\dist\mod-tools dist\` (re-extracted each build) |
| Drive mirror | 10.17.2 + 10.17.3 | `E:\My Drive\_PROJECTS\modtools-ext\` (last-2 retention) |

**Version divergence is intentional:** worker is 10.17.2, extension is 10.17.3,
because v10.17.3 was an extension-only fix (the profile-hide veto). No worker
redeploy was needed. Don't "fix" the divergence by bumping the worker.

---

## 3. WHAT THIS SESSION BUILT — the v10.17.x chain

### v10.17.0 — FIREHOSE keyword crawler + GOD MODE search (the core ask)

**Crawler (worker side):**
- **Migration 045** (`cloudflare-worker/migrations/045_firehose_keywords.sql`)
  — `firehose_keywords` table (term PK, category, weight, enabled,
  last_crawled_at, crawl_count, posts_found_total, posts_new_last_run,
  last_error, added_at) + 340 seed terms across 6 categories
  (politician/party/issue/conspiracy/canon/generic), weights 0.7–1.8.
- **`keywordCrawlTick(env)`** in `gaw-mod-proxy-v2.js` (~line 12292), wired
  into `scheduled()` (~line 16175) AFTER `gawCrawlTick`. Every cron (5-min
  cadence, KV-gated 5-min minimum) it picks 6 least-recently-crawled terms
  (weight-biased `ORDER BY (last_crawled_at + random/weight)`), hits
  `https://greatawakening.win/search?params=<term>&community=GreatAwakening&sort=new&page=N`
  for up to 2 pages, parses listing HTML with the EXISTING `gawParseListingHtml`
  (search results use the SAME `.post[data-type][data-id]` markup as `/new` —
  confirmed by curl), upserts via EXISTING `gawUpsertPostRow` with
  `captured_by='cron-keyword:<term>'`. One `gaw_ingest_audit` row per tick.
  Flag-kill: env var `GAW_KEYWORD_CRAWL_ENABLED='false'`.
- **GAW search endpoint reality:** it's `/search?params=<term>` — the param is
  literally named `params`, NOT `q`. 200 OK unauthenticated with the
  `GAW_CRAWL_UA`. Sort options: new/top/old/controversial. Pagination `&page=N`.
  `community=GreatAwakening` scopes to GAW. This was discovered by probing; the
  homepage search form's `<input name="params">` was the tell.

**GOD MODE search (worker side):**
- `handleGawSearch` extended with `?godmode=1` grammar via new
  `parseGodmodeQuery(q)` (~line 10783). Supports: `"phrase"`, `author:X`,
  `community:X`, `score:>50`/`>=`/`<`/`<=`/`=`, `date:YYYY-MM-DD..YYYY-MM-DD`
  (either end optional), `removed:0|1`, `-term` (FTS5 NOT), `term*` (prefix).
  Back-compat: v9.6.0 behavior preserved bit-for-bit when `godmode` absent.
  SQL-safe: column names + operators built into WHERE strings; all user values
  go through bindings. Added `sort=score` alongside date/rank.
- **Parser test:** `cloudflare-worker/test-godmode-parser.js` — standalone Node
  harness, 34 assertions, ALL PASS. Re-run it if you touch the parser.

**GOD MODE search (extension side):**
- `background.js` `modSearch` RPC extended to forward `godmode` + `sort`.
- `modtools-aux.js` **Wave 5 IIFE** (`_gamAuxWave5GodMode`, ~line 1888+) — the
  search modal + 3 palette commands (Ctrl+Shift+P → "GOD MODE"). Bloomberg
  aesthetic, z-9999995. `window._gamOpenGodMode(seedQuery?)` exposed.

### v10.17.1 — GOD MODE polish (bundled into the v10.17.2 commit)
- **Bulk action bar** on results: 28px checkbox column, "all visible/invert/
  none" toolbar, sticky bar with Open-in-tabs / Copy-authors / Copy-URLs /
  Clear. Selection in `_gmSelected` Map keyed `${kind}:${id}`. Row refactored
  from `<a>` to role=button `<div>` so checkbox clicks don't open the URL.
- **Saved + recent queries** chip strip: ★ Save button → `chrome.storage.local.
  gam_godmode_saved`; auto-tracked recents → `gam_godmode_recent`. Click chip =
  load + run. Hover-× deletes saved.
- **Status-bar 🔍 icon** injected into `#gam-status-bar` (mirrors the v10.3 BRIG
  chip pattern at modtools.js:31185), with MutationObserver fallback.

### v10.17.2 — observability + keyword bank 2×
- **Migration 046** (`046_firehose_keywords_expand.sql`) — +334 net-new terms
  (340 → 674): Trump 2024 cabinet, full Senate/governors/AGs, J6 figures,
  UFO/Disclosure, niche conspiracies, named events, memes, religion, gov
  agencies, media/tech. INSERT OR IGNORE (idempotent).
- **`/admin/firehose/keywords`** endpoint (lead-only via `requireLeadAuth`,
  ~line 11277) — 7-metric summary + 4 detail tables + last_tick. Inert (503)
  if migration 045 missing.
- **`modAdminFirehoseKeywords`** RPC in background.js.
- **"GOD MODE: Firehose crawl health"** palette command 🔥 + modal in Wave 5
  (`_gmOpenHealthModal`). `window._gamOpenFirehoseHealth()` exposed.

### v10.17.3 — profile-page hide veto (THE FINAL EATER KILL)
- Commander hit the recurring `/u/<name>` post-hide bug AGAIN (the one
  v10.16.37 "Kill the Eater" supposedly fixed). Source evidence: posts past the
  newest few had `class="post mobile_user "` with a **trailing space** —
  residue of `gam-age-hidden` added then stripped, but the visual `display:none`
  survived.
- **Root cause:** `applyUpvoteAgeFilter()` (modtools.js:17129) hides
  age+score-qualifying posts via inline `display:none` + the gam-age-hidden
  class/attr. It HAS a profile-page gate (`_isProfileViewNow()` at 17135) and a
  defense-in-depth protector (modtools-aux.js:1041) that strips the hide. But in
  Commander's runtime the protector loses the strip race for inline display:none.
- **Fix (don't chase, veto):** new `<style id="gam-profile-veto-style">`
  injected by the protector IIFE declares
  `body.gam-on-profile-page .post[data-viewer] { display: revert !important;
  visibility: visible !important; opacity: 1 !important }` + parallel rules for
  every gam-* class/marker. CSS `!important` beats inline display:none from any
  source. `display: revert` honors GAW's own stylesheet so layout doesn't break.
  Body class `gam-on-profile-page` toggled by `_arm()`/`_disarm()` so the veto
  scopes ONLY to profile pages. **Irrevocable: a future hider can't beat this.**
- **NOT YET VALIDATED IN BROWSER** — see Open Items #1.

---

## 4. ARCHITECTURE NOTES YOU'LL NEED

- **Worker source is gitignored from c5-ops.** `cloudflare-worker/` (incl.
  `gaw-mod-proxy-v2.js` and ALL migration files) is NOT version-controlled in
  the c5-ops repo by design — it deploys via `wrangler`, and the deployed worker
  + local file are the only copies. There is no git backup. Do not be surprised
  when `git add cloudflare-worker/...` says "ignored."
- **Deploy command:** `pwsh -NoProfile -File
  "D:\AI\_PROJECTS\cloudflare-worker\scripts\deploy.ps1" -NoPause` — auto-finds
  wrangler.jsonc, runs `wrangler deploy --keep-vars`, smoke-tests. Bump
  `WORKER_VERSION` constant (line 87) BEFORE deploying so /version is honest.
- **D1 commands:** `npx --yes wrangler@latest d1 execute gaw-audit --remote
  --command "..." --yes` (or `--file=migrations/NNN.sql`). DB name `gaw-audit`,
  id `5b54825c-de21-4d73-812c-867ee93e751d`.
- **Reused crawler helpers (don't reinvent):** `gawParseListingHtml(html,
  community)`, `gawUpsertPostRow(env,p,now,actor)`, `gawLogIngest(...)`,
  `gawSleep(ms)`, `GAW_CRAWL_UA`. All in gaw-mod-proxy-v2.js.
- **modtools-ext packager:** `pwsh -NoProfile -File
  "D:\AI\_PROJECTS\modtools-ext\scripts\build-zip.ps1" -NoPause`. Does NOT
  auto-mirror to Drive — do that manually (cp + last-2 prune) per CLAUDE.md §15.
- **Wave structure in modtools-aux.js:** Waves 1-4 are older palette commands;
  **Wave 5 (v10.17.0+) is all the GOD MODE + crawl-health surface.** The
  profile-post-protector is a SEPARATE IIFE near line 1041 (NOT a Wave).

---

## 5. OPEN ITEMS / PENDING (ranked)

### URGENT — needs Commander or first-turn attention
1. **v10.17.3 profile-hide veto is UNVALIDATED in-browser.** Commander must
   reload the extension on `/u/catsfive` and confirm previously-hidden posts now
   show. Expected console line: `[modtools-aux PROFILE PROTECTOR v10.17.3] armed
   + CSS veto active`; body should carry class `gam-on-profile-page`. If posts
   STILL hidden: inspect a hidden `.post`, check Computed → `display`, report
   which rule wins. The veto is `revert !important` vs inline — should win, but
   it's not confirmed against the live DOM.

### MEDIUM
2. **The entire GOD MODE UI is unvalidated in-browser.** I verified the parser
   (34/34) + the worker endpoint (curl) but NEVER saw the modal, bulk actions,
   saved-query chips, status-bar icon, or crawl-health modal render in a real
   browser. First 4.8 task with Commander watching: have him reload + open
   Ctrl+Shift+P → "GOD MODE" and smoke-test. Likely-fine but unproven.
3. **Popup Diag "Firehose Crawl Health" panel was DEFERRED.** I shipped a
   palette-command modal instead (scope-conservative). A popup Diag tab panel is
   the v10.17.4 candidate if Commander wants it in the popup chrome.
4. **Crawler tuning.** It's saturating fast (all 673 terms crawled at least
   once). Yield-per-tick will drop as the index fills. Consider: raise
   `KEYWORD_TERMS_PER_TICK` (currently 6), add a slow deep-backfill tick
   (pages 1-N for a few terms), or auto-tune weights by
   posts_new_last_run/crawl_count yield. Not urgent — it's working.
5. **FIREHOSE.md feature #1 — User Activity Timeline in Intel Drawer.** The
   doc calls it the highest-ROI unbuilt feature. Endpoint `/gaw/user/<u>/
   timeline` already exists; needs UI wiring into the drawer (modtools.js — the
   31K-line file, so regression risk). Good focused-session candidate.

### HOUSEKEEPING
6. **c5-ops rescue stash:** `stash@{0}: rescue 2-spec.md from runaway session`.
   It holds a 71-line edit to `hermes-superagent/specs/keyboard-shortcuts/
   2-spec.md` that a runaway session had in-flight when I killed it. Commander
   decides: `git stash pop` (recover) or `git stash drop` (discard).
7. **Other Claude Code sessions.** During this session there were 4 OTHER live
   Claude Code instances (started 5:14/10:16/10:44/11:02 AM) besides this one. I
   killed only the runaway (PID 113876, a `/breezing` harness loop churning
   xt8-resurrection). The other 4 were left alone — they may be Commander's
   intentional workspace tabs. If he reports another "won't stop," the kill
   recipe is: find the `claude-code/2.1.x/claude.exe` parent via WMI
   ParentProcessId chain from its MCP children, confirm it's NOT this session's
   parent, then `Stop-Process -Id <pid> -Force` (NOT `taskkill /F` — Git Bash
   mangles `/F` into `F:/`).

---

## 6. STANDING ORDERS (inherited — see prior handoff + CLAUDE.md)

- **Never ask permission to commit.** Dirty tree + obvious commit moment → just
  commit. Co-Authored-By trailer preserved for modtools-ext.
- **Commit at every version change.** Manifest bump → commit immediately.
- **Test before delivering (§8).** curl/wrangler/parse-check/node-test from your
  side before telling Commander to try. He is not QA.
- **Eliminate the meatbag (§10).** If you can run it, run it. Don't hand him
  command lists.
- **Drive, don't hold (§13/§14).** Don't close with "holding." Pick the next
  item and execute. Simulate the redirect; don't menu him.
- **Project archive (§15).** Every ZIP mirrors to `E:\My Drive\_PROJECTS\
  <project>\` with last-2 retention.
- **PowerShell rules.** ASCII-only, UTF-8 BOM, 4-step ending block, parse-check
  both 5.1 + 7, `(if ...)` is a statement not expression (§0.2c).
- **Git Bash on Windows footgun:** `taskkill /F` → "Invalid argument 'F:/'".
  Use PowerShell `Stop-Process` for process kills.

---

## 7. VERIFICATION COMMANDS (run on first turn to confirm state)

```bash
# modtools-ext
cd "D:/AI/_PROJECTS/modtools-ext" && git log --oneline -4 && grep '"version"' manifest.json && git status --short

# worker live version (expect 10.17.2)
curl -s https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev/version | grep -oE '"version":"[^"]*"'

# D1 firehose state (expect 673 keywords, posts climbing)
cd "D:/AI/_PROJECTS/cloudflare-worker" && npx --yes wrangler@latest d1 execute gaw-audit --remote --command "SELECT 'kw:'||COUNT(*) FROM firehose_keywords UNION ALL SELECT 'posts:'||COUNT(*) FROM gaw_posts UNION ALL SELECT 'kw_posts:'||COUNT(*) FROM gaw_posts WHERE captured_by LIKE 'cron-keyword%';" --yes

# crawler still ticking? (check newest keyword-cron audit row)
cd "D:/AI/_PROJECTS/cloudflare-worker" && npx --yes wrangler@latest d1 execute gaw-audit --remote --command "SELECT ts, rows_in, rows_new, error FROM gaw_ingest_audit WHERE source='server-cron-keyword' ORDER BY ts DESC LIMIT 3;" --yes

# c5-ops stash (the rescued 2-spec.md)
cd "D:/AI/_PROJECTS" && git stash list

# latest ZIPs
ls -1t "D:/AI/_PROJECTS/dist/" | grep gaw-modtools | head -3
```

---

## 8. FILES TO READ ON FIRST TURN (in order)

1. `~/.claude/CLAUDE.md` (auto-loaded — skim it; §0/§8/§10/§13/§14)
2. THIS file
3. `docs/HANDOFF_v10.16.50_to_next_chat.md` (durable context: AF-08, z-index, who/where)
4. `CHANGELOG.md` (top entries are v10.17.0 → v10.17.3, very detailed)
5. For crawler work: `gaw-mod-proxy-v2.js` `keywordCrawlTick` + `handleGawSearch` + `parseGodmodeQuery`
6. For UI work: `modtools-aux.js` Wave 5 IIFE (~line 1888) + profile-protector IIFE (~line 1041)

---

## 9. FINAL NOTE TO 4.8

You're inheriting a healthy, shipping codebase. The crawler Commander asked for
is not just built — it's filled FIREHOSE with 20K+ posts in hours and is still
running autonomously on the 5-min cron. The GOD MODE search backend is proven
(34/34 parser + curl-tested endpoint); the UI is built but unproven in-browser,
so the highest-value first move with Commander present is a 5-minute reload +
smoke-test of the GOD MODE modal and the v10.17.3 profile-hide veto.

Do not be deferential. Don't say "I'll check first" when you can just check.
Don't menu him with options — pick the next move and execute. If you find a real
flaw in my work, push back hard and fix it. He cannot be offended.

Standing posture: **drive forward.**

— Outgoing agent, v10.17.x session, Opus 4.7, 2026-05-27
