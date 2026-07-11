# RESUME PROMPT — GAW ModTools (paste into a fresh Claude Code session)

You are resuming work on **GAW ModTools**, a Chrome MV3 extension + Cloudflare Worker that moderates greatawakening.win (Mod Console, /users Triage Console, Death Row queue, mod-to-mod chat, Bot Raid Shield, SUS user-rating, team watchlist).

## STEP 0 — ORIENT BEFORE TOUCHING ANYTHING (skipping this wasted hours on 2026-07-10)
1. **CANONICAL working dir = `D:\AI\_PROJECTS\gaw-modtools-extension`.** Confirm it:
   `git -C "D:\AI\_PROJECTS\gaw-modtools-extension" remote -v` — it MUST show `gaw-modtools-extension.git`. If it doesn't, STOP: you are in the wrong repo (a parent `D:\AI\_PROJECTS\.git` Hermes monorepo shadows dirs that lost their own `.git`).
2. **What Brave actually LOADS = `D:\AI\_PROJECTS\dist\mod-tools dist`** (refreshed by `scripts/build-zip.ps1`). Check its version:
   `grep '"version"' "D:\AI\_PROJECTS\dist\mod-tools dist\manifest.json"`. This is ground truth for "what the operator is running."
3. **`modtools.js` (~1.9 MB) is GITIGNORED** (`.gitignore` `/*` broad-ignore). It is NOT in the repo — the only full copies live in the working dir + `dist\*.zip`. A `git clone` will NOT give you modtools.js. Do not trust any dir that isn't the canonical one.
4. There are/were **stale duplicate copies** on this machine (e.g. an old `modtools-ext`). Do NOT work in them. Only the dir whose remote is `gaw-modtools-extension.git` is real.
5. Read: `docs/HANDOFF_2026-07-10.md` (last session), then the top of `CHANGELOG.md`, then `git log --oneline -12`.

## Ship loop (each version)
`node --check modtools.js` → run every `node scripts/*.mjs` (all must pass) → bump `manifest.json` → `git commit` (modtools.js won't be in the commit — it's gitignored, expected) → `pwsh -NoProfile -ExecutionPolicy Bypass -File "scripts\build-zip.ps1" -NoPause` (builds the zip AND extracts to `dist\mod-tools dist`) → `git push`. **Commander RELOADS at `brave://extensions` (reload arrow + F5) — that step is non-automatable and is his.**

## Live-verify in Commander's real browser (Claude-in-Chrome)
Fresh automated tabs get torn down instantly on GAW (CF bot-protection). **WORKAROUND:** navigate an **already-alive** tab to `/u/catsfive/` (it survives), then navigate **that same tab** to your target page; inspect with one atomic `browser_batch` [navigate → javascript_tool eval → read_console_messages] call. Reusing an existing tab works; spawning fresh ones does not.

## Current state (2026-07-10, v10.45.0)
- **Recently fixed + live-verified:** (a) profile "eater" was the river appending posts out of chronological order — fixed with `_reorderProfilePostsChronological()` (posts now newest-first); (b) "/users not working / everything broke" was `autoRefreshTick` reloading every unfocused tab every 60s — fixed to `if (!idle) return;`.
- **Concurrent session active** on feature work (v10.41–45: SHIFT-click fix, SUS rating, /users alerts polish, keyboard-focus, team watchlist). Because `modtools.js` is gitignored there is **no merge protection** — before editing modtools.js, check its working-tree mtime to confirm no other session is mid-edit; if one is, coordinate rather than overwrite.
- **Next feature queued:** `docs/BUILD-BRIEF-AUDIT-LOG-VIEWER.md` (Audit-Log Viewer over the live `modAuditQuery` / `/audit/query` worker endpoint).

## Guardrails (non-negotiable)
- **HI-1 (sacred):** AI/autonomous paths write to the SUS list ONLY; a human flush queues Death Row; NEVER an auto-ban path anywhere. Reuse `addToDeathRow(u, 72h, {fromUserAction:true})`.
- Every user-facing change ships with a slice-eval smoke test in `scripts/` (no npm deps / no jsdom — hand-rolled DOM stubs; slice the REAL function from source by brace-counting).
- **Prod deploys** (`wrangler deploy` / `d1 execute --remote`) are classifier-gated → need Commander's explicit "deploy" each time; never work around a denial. The worker (`gaw-mod-proxy-v2.js`) is gitignored.
- Commander is a **non-programmer**: plain-language reports, no code as a call-to-action, run everything yourself, test from your side before saying "done" (§8) — he cannot read the code to catch a silent regression.
