# HANDOFF — GAW ModTools — v10.17.4 (clean, MODTOOLS-only)

**Date:** 2026-05-27
**Outgoing lead:** Claude Opus 4.8 (1M context)
**Ship state:** extension **v10.17.4** (`e8e87f9`) / worker **v10.17.2** live
**Repo:** `D:\AI\_PROJECTS\modtools-ext` on `master`, tree clean

> This handoff is deliberately MODTOOLS-only. The durable cross-project context
> (who Commander is, AF-08 audit invariant, z-index map, standing orders) lives
> in `docs/HANDOFF_v10.16.50_to_next_chat.md` — read that once for background.
> The v10.17.0→10.17.3 build detail lives in `docs/HANDOFF_v10.17.3_to_4.8.md`
> and in `CHANGELOG.md`. THIS doc is the lead's clean-desk priority brief.

---

## THE BOTTOM LINE (read this first)

ModTools just shipped a huge amount in one session: a FIREHOSE keyword crawler,
a GOD MODE search feature, observability, and four patches to a recurring
profile-page bug. **The crawler is PROVEN and winning** — 32K+ posts in D1, 21K+
from the new crawler, ticking every 5 min autonomously. **Everything else is
CODE-VERIFIED BUT NOT BROWSER-VERIFIED.** Parser unit tests pass (34/34), the
worker endpoint curls clean, all JS parses — but the GOD MODE modal, bulk
actions, saved-query chips, status-bar icon, crawl-health modal, and the
profile-hide veto have **never been seen render in a live browser.**

**The job right now is NOT to build more. It is to VALIDATE what's built, then
stabilize.** Building v10.17.5 features on an unvalidated v10.17.x surface is
building on sand. Resist the urge.

---

## CURRENT STATE (verified 2026-05-27)

| Surface | Value |
|---|---|
| Extension manifest | **10.17.4** (`e8e87f9`, tree clean) |
| Worker `/version` | **10.17.2** (deployed; divergence is intentional — 10.17.3/.4 were ext-only) |
| D1 `gaw-audit` | **673 keywords (all crawled), 32,276 posts, 21,735 via crawler, last tick <1 min ago** |
| Latest ZIP | `dist\gaw-modtools-chrome-store-v10.17.4.zip` (686 KB, sha256 `bcf29af0…`) |
| Load-unpacked | `dist\mod-tools dist\` (re-extracted each build) |
| Drive mirror | v10.17.3 + v10.17.4 (last-2) |
| Parse status | all 4 JS files (modtools.js / -aux.js / background.js / worker) PARSE OK |

---

## PRIORITY STACK (my call as lead — execute top-down)

### P0 — VALIDATE in-browser (gates everything; needs Commander 5 min)
The single highest-value action. Have Commander reload the extension
(`chrome://extensions` → reload, or Load Unpacked `dist\mod-tools dist\`) and:

1. **Profile-hide bug — now self-reporting (v10.17.4).** Open `/u/catsfive`,
   open DevTools console, wait ~2.5s, read ONE line:
   - GREEN `[GAM VETO SELF-CHECK PASS] N posts, 0 computed-hidden` → bug is dead, close the chapter.
   - RED `[GAM VETO SELF-CHECK FAIL] … first offender: id=… display=…` → paste that line; fix is actionable cold (the CSS selector needs tightening for whatever's still winning the cascade).
   This is the closest thing to from-our-side validation for a UI-only bug — the extension measures `getComputedStyle` and tells you. No DevTools dig required.
2. **GOD MODE search.** Ctrl+Shift+P → type "god mode" → open the search modal.
   Run `epstein author:catsfive date:2026-01-01..`. Confirm: results render,
   checkboxes select, bulk bar appears (Open-in-tabs / Copy-authors / Copy-URLs),
   ★ Save chips persist, status-bar 🔍 opens it. If any of these breaks, it's a
   contained fix in `modtools-aux.js` Wave 5 (~line 1888) — modtools.js untouched.
3. **Crawl health modal.** Ctrl+Shift+P → "Firehose crawl health" (lead-only).
   Confirm the KPI tiles + tables render against the live `/admin/firehose/keywords`.

**Until P0 is done, do not start P3.**

### P1 — Reconcile worker/ext version on next worker touch
Worker 10.17.2 vs ext 10.17.4 is fine (10.17.3/.4 were ext-only). But the NEXT
time you deploy the worker, bump `WORKER_VERSION` (gaw-mod-proxy-v2.js:87) to
match the extension so `/version` stays honest. No action needed until then.

### P2 — Refactor debt: NAMED, DEFERRED, scoped when it happens
`modtools.js` is **31K+ lines in one file**; `modtools-aux.js` is ~2,700 lines
with 5 bolted-on Waves. This is real maintainability debt. **But do NOT big-bang
refactor it** — it has a torrid ship cadence and unvalidated recent features;
ripping it apart now is how you inject a regression you can't trace. When the
time comes, the ONLY low-risk first cut is extracting the self-contained **Wave 5
(GOD MODE + crawl health, ~800 lines)** into its own content-script file, because
it's new + isolated + has its own `window._gamOpenGodMode` entry point. Leave the
31K-line core alone until the surface is stable and validated. Refactor is a
post-stabilization task, not a now task.

### P3 — Next feature (ONLY after P0 passes)
Pick ONE, with Commander's steer:
- **FIREHOSE.md feature #1 — User Activity Timeline in Intel Drawer.** The doc
  calls it the highest single mod-productivity win. Endpoint `/gaw/user/<u>/
  timeline` already exists; needs UI wiring into the drawer. This touches the
  31K-line modtools.js → regression risk → do it as a focused session with
  validation, not a drive-by.
- **Crawler tuning.** All 673 terms are fully rotated; yield-per-tick will fall
  as the index saturates. Options: raise `KEYWORD_TERMS_PER_TICK` (6), add a
  slow deep-backfill tick (pages 1-N), or auto-tune weights by yield ratio.
  Worker-only, low UI risk. The crawler is the proven win — protect it.

### P4 — Housekeeping
- **c5-ops rescue stash:** `git -C D:/AI/_PROJECTS stash list` shows
  `stash@{0}: rescue 2-spec.md from runaway session`. Commander decides pop vs drop.
- Worker source + migrations are **gitignored from c5-ops** (deploy via wrangler,
  no git backup). Don't be surprised; don't "fix" it.

---

## VERIFY-ON-FIRST-TURN

```bash
cd "D:/AI/_PROJECTS/modtools-ext" && git log --oneline -3 && grep '"version"' manifest.json && git status --short
curl -s https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev/version | grep -oE '"version":"[^"]*"'
cd "D:/AI/_PROJECTS/cloudflare-worker" && npx --yes wrangler@latest d1 execute gaw-audit --remote --command "SELECT 'kw:'||COUNT(*) FROM firehose_keywords UNION ALL SELECT 'posts:'||COUNT(*) FROM gaw_posts UNION ALL SELECT 'last_tick_min_ago:'||CAST((strftime('%s','now')-MAX(ts))/60 AS INT) FROM gaw_ingest_audit WHERE source='server-cron-keyword';" --yes
```

---

## KEY FILE MAP (MODTOOLS only)

- `modtools-aux.js` **Wave 5 IIFE** (~line 1888) — all GOD MODE search + crawl-health UI; `window._gamOpenGodMode()` / `_gamOpenFirehoseHealth()`.
- `modtools-aux.js` **profile-protector IIFE** (~line 1041) — the CSS veto + `_selfVerify()` (v10.17.4). Separate from the Waves.
- `modtools.js:17129` `applyUpvoteAgeFilter()` — the upstream age-hider with its `_isProfileViewNow()` gate at 17135 (the thing the veto vetoes).
- `background.js` — `modSearch` + `modAdminFirehoseKeywords` RPCs.
- `cloudflare-worker/gaw-mod-proxy-v2.js` — `keywordCrawlTick` (~12292), `handleGawSearch`/`parseGodmodeQuery` (~10683/10783), `/admin/firehose/keywords` (~11277). **Gitignored from c5-ops.**
- `cloudflare-worker/test-godmode-parser.js` — 34-assertion parser harness; re-run if you touch the grammar.

---

## STANDING ORDERS (don't relearn these the hard way)
- Never ask permission to commit. Commit at every version change. Co-Authored-By trailer on modtools-ext commits.
- Test from your side before handing Commander anything (curl / wrangler / parse / node-test). He is not QA.
- Eliminate the meatbag — if you can run it, run it. Drive; don't hold; don't menu.
- Every ZIP mirrors to `E:\My Drive\_PROJECTS\modtools-ext\` last-2.
- Git Bash mangles `taskkill /F` → use PowerShell `Stop-Process` for process kills.

---

## FINAL WORD
The crawler delivered exactly what Commander asked — it's filling FIREHOSE on
autopilot. The rest of the surface is built and code-clean but unproven in a
browser, and the profile-hide bug has a credibility history. So the discipline
this hands you is: **prove it works before you build the next thing.** v10.17.4
already turned the worst-burned bug into a one-glance console check — use that
energy. Validate, stabilize, then build. Drive forward.

— Opus 4.8, lead, 2026-05-27
