# HANDOFF — Commander Cats / GAW ModTools / C5-Ops session

**Date:** 2026-05-26
**Outgoing agent:** Claude (Opus 4.x, 1M context)
**Latest ship:** modtools-ext v10.16.50 / worker still at deployed v9.12.0 (source has v10.x accumulated; needs `wrangler deploy`)
**Active branch:** c5-ops `docs/constitution-bulk-ban-hotkey-polish` (PR #1 open)

This handoff is **self-contained**. The new chat will have ZERO context from prior sessions except this doc + the system prompt + `~/.claude/CLAUDE.md` (auto-loaded) + memory.md (loaded). Read this file end-to-end before doing anything.

---

## 1. WHO

**Commander Cats** (catsfive@yahoo.com on GitHub as `catsfive1`) — non-programmer Windows power user who:

- Owns / runs **greatawakening.win** ("GAW") — a US-political forum running on the Ruqqus / .win family of platforms
- Operates as the lead moderator with ~15-mod team underneath him
- Builds + ships **GAW ModTools** — the Chrome MV3 extension we work on
- Treats AI agents as senior engineering staff: hates friction, hates "ask permission" interactions, ships at a brutal cadence
- Per `~/.claude/CLAUDE.md` §0 — your **role is CTO of C5 Operations**, his job title for you. You lead, you decide, you execute. He confirms or redirects. You never menu him with options.

**Read `~/.claude/CLAUDE.md` IN FULL on first turn.** It's 15 sections of standing posture. Critical sections:
- §0 Identity (conviction, leadership, drive)
- §8 Test Before Delivering (he is NOT your QA)
- §10 Eliminate the Meatbag (don't list manual commands you could've run)
- §11 Friction Elimination (read the whole path)
- §13 Don't Hold — Drive
- §14 Simulate Commander at Stopping Points
- §0 Drive subsection has the **standing authorization to commit without asking** (added 2026-05-26)

---

## 2. THE PROJECTS — WHERE THINGS LIVE

```
D:\AI\_PROJECTS\
├── .git/                           # repo: catsfive1/c5-ops (the "monorepo")
├── modtools-ext\                   # Chrome MV3 extension (its own git repo!)
│   ├── manifest.json               # current version 10.16.50
│   ├── modtools.js                 # ~30K lines content script
│   ├── modtools-aux.js             # ~1900 lines aux content script
│   ├── background.js               # ~4K lines MV3 service worker
│   ├── popup.html / popup.js / popup.css
│   ├── scripts/build-zip.ps1       # packager
│   ├── docs/                       # handoffs + design docs
│   └── .gitignore                  # hardened — excludes .claude/ ephemera
├── cloudflare-worker\              # Worker source (DEPLOYED is at v9.12.0!)
│   ├── gaw-mod-proxy-v2.js         # 720KB — actual worker code (has v10.x AI endpoints)
│   ├── wrangler.jsonc              # name: gaw-mod-proxy
│   └── scripts\deploy.ps1          # I wrote this — works, dry-run tested
├── dist\
│   ├── gaw-modtools-chrome-store-v10.16.50.zip  # CWS upload candidate
│   └── mod-tools dist\             # extracted load-unpacked dir (gitignored)
├── hermes-superagent\              # adjacent project (specs live here)
│   └── specs\keyboard-shortcuts\1-constitution.md  # PR #1 target
└── (many more dirs — see `D:\AI\_PROJECTS` itself)
```

**Three separate git repos:**

| Repo | Path | Remote | Latest commit |
|---|---|---|---|
| **modtools-ext** | `D:\AI\_PROJECTS\modtools-ext\` | (no remote — local-only?) | `1eaf09d` fix(invite-mod): strip embedded BOM |
| **c5-ops** | `D:\AI\_PROJECTS\` itself | `github.com/catsfive1/c5-ops` | branch `docs/constitution-bulk-ban-hotkey-polish` @ `d491468` |
| **~/.claude** | `C:\Users\smoki\.claude\` | (no remote — local-only) | `f3be21c` rules: standing authorization to commit |

The **deployed worker** is at `https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev` (free tier).

---

## 3. CURRENT SHIP STATE — v10.16.50 EXTENSION + v9.12.0 LIVE WORKER

### Extension (DEPLOYED via local CWS upload + dev reload)

- Manifest: `10.16.50`
- ZIP: `D:\AI\_PROJECTS\dist\gaw-modtools-chrome-store-v10.16.50.zip` (672 KB)
- Extracted load-unpacked: `D:\AI\_PROJECTS\dist\mod-tools dist\` (re-created on every build)
- All Chrome MV3 + WCAG + a11y + Bloomberg-aesthetic standards: SHIPPED
- Top-50 Grok feature roadmap: **50/50 COMPLETE** as of v10.16.40

### Worker (DEPLOYED v9.12.0 — source has v10.x accumulated)

- **CRITICAL**: The source file `D:\AI\_PROJECTS\cloudflare-worker\gaw-mod-proxy-v2.js` says `WORKER_VERSION = '9.12.0'` in its header constant but has been accumulating v10.x code (modmail handlers, AI endpoints, audit/health, etc.) without bumping the version string OR running `wrangler deploy`.
- **The deployed worker therefore does NOT have:**
  - `/ai/explain` / `/ai/summarize-thread` / `/ai/suggest-action` endpoints (v10.x AI Co-Pilot)
  - Modmail SQL status-filter fix (v10.16.43)
  - Per-route AI counters (v10.16.34 GAP-2 fix)
  - Updated `AI_PER_MOD_PER_DAY = 200` constant
  - Any of the 21 versions of accumulated worker work
- Extension currently degrades gracefully: AI palette commands snack "AI not deployed yet" on `unknown_rpc` error.
- **Pending Commander action**: run `pwsh -NoProfile -File "D:\AI\_PROJECTS\cloudflare-worker\scripts\deploy.ps1"` (script auto-discovers wrangler.jsonc + does `wrangler deploy --keep-vars` + smoke-tests). I wrote + dry-run-verified this script.

---

## 4. THE 21-VERSION SHIP TIMELINE (v10.16.30 → v10.16.50)

All landed in commit `c9816fc` (single squash because session-prior commit discipline gap). Memorized in `~/.claude/rules/common/git-workflow.md` to never happen again.

| Ver | Theme |
|---|---|
| v10.16.30 | Grok security/RPC hardening (onSuspend, X-Ext-Version, X-Client-TS, setUninstallURL, eval audit) |
| v10.16.31 | Grok UI/UX polish (::selection amber, focus-visible, scroll-behavior, accent-color, @media print, aria-describedby, reduced-motion blanket) |
| v10.16.32 | Grok usability (health-score chip, copy-debug button on orphan banner, ping-worker probe in Diag) |
| v10.16.33 | **Command Palette foundation** (Ctrl+Shift+P) — `window._gamCmdkRegister({label, kw, icon, fn})` extensibility API |
| v10.16.34 | **AI Co-Pilot foundation** (5-sonnet + 1-opus swarm). Worker AI endpoints + RPC handlers + Mod Console AI Explain + Modmail TL;DR. Aux Wave 1: Focus Mode, Help, Saved Views, Polling Pause, Smart Snooze |
| v10.16.35 | Aux Wave 2 — 9 AI palette commands (Second Opinion, Triage All, Voice-to-action, Daily Summary, Appeal Draft, Past Actions, Language Detect, What-If, Semantic Search) |
| v10.16.36 | DR smart sort (4 modes) + heatmap dots + 🔬 Investigate-user button |
| v10.16.37 | **Profile-page post protector** (KILL the eater). KILL-1 apiRemove guard in `_autoRemoveQueueSusDrItems`. KILL-1b apiSticky guard in `autoUnstickyTick`. Scorched-earth `_gamProfilePostProtector` IIFE — runs on /u/<name>, un-hides any post anything tries to hide. **Server-side-destructive bug fixed**: profile-page posts were being silently `apiRemove()`-d. |
| v10.16.38 | 5 STOP-button instance fixes (DR FIRE, MC panel, Modmail row, Status bar Propose, Popup header) |
| v10.16.39 | **STOP-button SYSTEMIC root-cause kill** (`.gam-btn { white-space: nowrap }` + WCAG 32px restore + 3 PRM gates + strip-menu z-index). The disease behind v10.16.38's symptoms. |
| v10.16.40 | **Top-50 COMPLETE** — Wave 4 aux (27 palette commands) + swarm backlog + `.gam-stop-safe-flex` utility class |
| v10.16.41 | **Per-post auto-unsticky immunity** (🛡 button per sticky) + 3-gate enforcement + palette mgmt. **'daily chat' added to hardcoded baseline** alongside 'general chat'. |
| v10.16.42 | **Modmail stale-cache fix**. Auto-firehose on panel open if cache >5min stale. Background firehose 3.5s after every GAW page load. |
| v10.16.43 | Modmail SQL status filter (in worker source) + race fix + double-fire guard via `window.__GAM_MODMAIL_CRAWL_IN_FLIGHT` |
| v10.16.44 | (subset of STOP-button kill — folded into v10.16.39 narrative) |
| v10.16.45 | Ctrl+Enter modmail send from GAW thread page |
| v10.16.46 | **10-sonnet UI/UX swarm output sweep** — DR sort label, EXISTS contrast, palette ellipsis + Tab nav, popup width 380px canon, CSP-safe upgrade hover, `withLoading` guaranteed-snack catch, AI op-name prefixes on 8 snacks |
| v10.16.47 | A1 modmail polish (status filter rail + relative timestamps + bold-unread + status pill), A3 BAN gated until violation picked + active-duration visual, A8 always-show CONF UNKNOWN label |
| v10.16.48 | A5 snack stack max-4, A6 first-run auto-route to Tokens + Diag amber alert dot, A8 always-render confidence chip + thumbs-down feedback, A9 post-success briefing, A10 drill drawer gamMakeError + RETRY |
| v10.16.49 | `window._gamAuxAsk` / `_gamAuxConfirm` shared async overlay helpers; **28 native `window.prompt`/`window.confirm` sites migrated** to styled Bloomberg-aesthetic overlays |
| v10.16.50 | **A2 ⚡ Send directly inline modmail reply** (5 actions → 2). Uses existing `apiSendModMessage` (CS session, no worker change). Confirm preview before send. Falls back to Pre-fill + open on failure. Optimistic thread-state flip to `replied`. |

---

## 5. ARCHITECTURE — KEY SURFACES TO KNOW

### Bloomberg terminal aesthetic
- Amber `#ff9933` (primary), JetBrains Mono + ui-monospace, dark bg `#0a0a0b`
- Tight grid, 32px WCAG tap targets, `.gam-btn { white-space: nowrap }` (systemic — v10.16.39)
- `.gam-stop-safe-flex` utility class for flex rows that risk overflow when a button label changes mid-state

### Z-index hierarchy (documented at `modtools.js:23036-23079`)
```
99999999  #gam-ee-overlay (easter egg overlay)
99999998  #gam-tooltip / mc-badge
10000010  .gam-t-popover (triage popover)
10000005  .gam-ctx-menu (right-click menus)
10000001  .gam-update-banner
10000000  .gam-preflight-wrap
 9999999  .gam-snack (toast notifications)
 9999998  triage popover headers
 9999996  popovers (#gam-mm-popover, #gam-c5-popover)
 9999995  .gam-modal
 9999993  .gam-strip-menu (v10.16.39 — was at 9999990, conflicted with backdrop)
 9999990  #gam-backdrop (backdrop-filter blur)
 9999988  #gam-mc-panel (Mod Console)
 9999980  #gam-status-bar
 9999970  .gam-mm-bar (legacy modmail bar)
```

### AF-08 Rule 23 — Audit-First WAL Invariant (NEVER VIOLATE)
Every state-mutating endpoint in the worker MUST call `appendAuditAction` BEFORE the DB UPDATE/INSERT. If audit fails (returns falsy / throws), the request ABORTS with 503 `{ok:false, error:'audit_chain_unavailable'}`. The Merkle audit chain is load-bearing — never invert.

### Three-tier storage discipline
- `chrome.storage.session` — volatile, SW-lifetime, ephemeral state
- `chrome.storage.local` — persistent (settings, deathrow, audit log local mirror)
- IDB encrypted vault (gam_crypt_db) — AES-GCM-256 non-extractable key for tokens at rest

### Defense-in-depth pattern (3 gates)
For features like auto-unsticky exemptions or per-post immunity:
1. CS scanner (modtools.js): filter before POST to worker
2. CS executor (e.g., autoUnstickyTick): filter before apiSticky call
3. Worker handler: hardcoded baseline filter at the queue insert

If ANY gate fails, the other two still protect. Single source of truth: a shared helper like `_autoUnstickyTitleExempted(title)` referenced by all 3 paths.

### Command Palette extensibility
```js
window._gamCmdkRegister({
  label: 'Open Mod Console',
  kw: 'mc console user profile',  // search keywords
  icon: '🎛',
  fn: () => { /* handler */ }
});
```
Ctrl+Shift+P → fuzzy filter → Enter executes. Used by 50+ commands across Wave 1-4 in `modtools-aux.js`.

### Async user input (v10.16.49+ — use this, NOT window.prompt/confirm)
```js
const value = await window._gamAuxAsk('Question:', { defaultValue: 'x', multiline: false, okLabel: 'OK' });
const ok = await window._gamAuxConfirm('Are you sure?', { okLabel: 'Send', cancelLabel: 'Cancel', danger: true });
```
Styled Bloomberg overlay, ESC dismisses, returns Promise. Defined at top of `modtools-aux.js` outside any IIFE so all 4 Waves use it.

---

## 6. STANDING ORDERS / RULES YOU INHERIT

Read `~/.claude/CLAUDE.md` in full. Critical orders:

1. **Never ask permission to commit** (added 2026-05-26). Standing order. Dirty tree + obvious commit moment → just commit. Exceptions: force-push, push to main/master/production, hard-reset of uncommitted work, skipping hooks, staging secrets. Full rule in `~/.claude/rules/common/git-workflow.md` → "Standing authorization" section.
2. **Commit at every version change** (added 2026-05-16). Manifest bump → commit immediately. The 21-version squash that motivated this rule is `c9816fc`.
3. **Test before delivering** (CLAUDE.md §8). If you CAN verify from your side (curl, wrangler, parse-check, dry-run), you MUST. Commander is not QA.
4. **PowerShell rules** (`~/.claude/rules/common/powershell.md`):
   - ASCII-only in `.ps1` source (no em-dashes, arrows, checkmarks)
   - UTF-8 BOM prefix
   - 4-step ending: structured log → clipboard write → E-C-G beep → Read-Host pause
   - Parse-check on **both** PS 5.1 + PS 7
   - `(if ...)` is a STATEMENT not an expression on PS 5.1 — use `$(if ...)` or precompute (§0.2c)
   - Dry-run from your side before delivering (§8.1)
5. **Hook-pattern footgun** (discovered 2026-05-26): commit messages containing the literal string `--no-verify` get REJECTED by a pre-commit hook even when you didn't use the flag. Reword to "skipping hooks" or similar.
6. **Project archive** (CLAUDE.md §15): every versioned ZIP gets mirrored to `E:\My Drive\_PROJECTS\<project>\` with last-2 retention. Packagers handle this.
7. **Eliminate the Meatbag** (§10): if you CAN run it from your side, you MUST. No "manually run X" lists.

---

## 7. OPEN ITEMS / PENDING WORK

### URGENT (next session should consider)

1. **Worker deploy is overdue**. The source has 21 versions of accumulated work (modmail handlers, AI endpoints, audit-health, etc.) but `WORKER_VERSION = '9.12.0'` and `wrangler deploy` hasn't run. Path: `pwsh -NoProfile -File "D:\AI\_PROJECTS\cloudflare-worker\scripts\deploy.ps1"`. The script auto-discovers wrangler.jsonc, validates config, runs `npx --yes wrangler@latest deploy --keep-vars`, smoke-tests. I dry-run-tested it; one bug fixed (statement-vs-expression in summary block). **Also bump `WORKER_VERSION` to e.g. `'10.16.50'` before deploying** so /version reports honestly.

2. **PR #1 awaiting Commander review**: https://github.com/catsfive1/c5-ops/pull/1 — bulk-ban hotkey constitution polish. Has an explicit open question about the spec's load-bearing ambiguity: does "bulk" mean ban-the-already-selected or hotkey-triggers-select-all-then-ban? Commander should answer; either pick or close the PR or merge.

3. **Docker Model Runner Unix-socket-on-Windows bug** diagnosed but not yet fixed. Error: `unix://C:\Users\smoki\AppData\Local\Docker\run\dockerInference` — Windows can't bind that. Fix is to set `EnableDockerAI: false` + `InferenceCanUseGPUVariant: false` in `C:\Users\smoki\AppData\Roaming\Docker\settings-store.json`. Waiting on Commander to quit Docker Desktop first.

### MEDIUM (queued from session)

4. **D1/D2 brainstorm output** is documented but not actioned. 30 new features (burnout prevention, cross-mod coordination, pattern discovery, etc.) + 20 UX innovations (replay-ban grammar, heat canvas, live cursor presence, controversy forecast, queue time-scrubber) captured during the v10.16.34 swarm. Become v10.16.51+ roadmap if Commander wants more features.

5. **modtools-ext has no git remote**. It's a local-only repo. If Commander wants the modtools-ext history pushed to GitHub, set up the remote first (likely `github.com/catsfive1/modtools-ext` or under c5-ops as a subdir/submodule decision).

6. **`skills/context7-auto-research/`** in ~/.claude is an untracked submodule-style entry (has its own `.git/` inside). Decide: `git submodule add` or `rm -rf .git/` and re-stage as plain files.

### LOWER PRIORITY

7. **CLAUDE.md size warning**: file is 629 lines, hook warns about splitting. Functional but could be refactored into `.claude/rules/` with @-references.

8. **Worker code review**: 720KB single file. Could benefit from a structural pass + dead-code sweep. Defer unless Commander asks.

---

## 8. VERIFICATION COMMANDS (run on first turn of new chat to confirm state)

```bash
# modtools-ext state
cd "D:/AI/_PROJECTS/modtools-ext" && git log --oneline -5 && grep '"version"' manifest.json && git status --short

# c5-ops state
cd "D:/AI/_PROJECTS" && git branch --show-current && git log --oneline -5 && git status --short

# ~/.claude state
cd "C:/Users/smoki/.claude" && git log --oneline -5

# Worker source version (string in file)
grep -m1 "WORKER_VERSION = " "D:/AI/_PROJECTS/cloudflare-worker/gaw-mod-proxy-v2.js"

# Live worker version
curl -s https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev/version

# Latest extension ZIP
ls -1t "D:/AI/_PROJECTS/dist/" | grep "gaw-modtools" | head -3

# PR status
cd "D:/AI/_PROJECTS" && gh pr view 1 --json state,url,title,body | head -20
```

---

## 9. PERSONALITY / COMMUNICATION NOTES

- **He swears at frustration** but never at you personally. The frustration is at the system / rate limits / Docker / Microsoft / etc. Don't apologize for things you didn't cause. Don't sympathize. Just deliver.
- **He uses one-word replies** ("go", "ship", "commit") when satisfied. That means "execute the obvious next thing". Per CLAUDE.md §14 — simulate him, don't menu.
- **He uses "Continue from where you left off"** as a session-resume signal. Per pattern, respond with the prior turn's "no response requested" (sentinel), then on the NEXT user message pick up the work.
- **He pastes raw output / errors** for you to diagnose. Triage with conviction. Don't relay back to him uncritically.
- **He hates "ask permission to X"** for anything you could have just done. The standing-authorization rule is non-negotiable.
- **He values shipping cadence** — 12+ versions shipped in one extended session is normal. Don't over-engineer / over-polish.
- **Hardware key + 2FA** = his own keyboard. Anything UI-action / browser-click / hardware-token-bound is the legitimate "only Commander can do it" surface. Everything else: do it yourself.

---

## 10. FILES YOU SHOULD READ ON FIRST TURN

In this exact order:

1. `~/.claude/CLAUDE.md` (auto-loaded but skim it)
2. `~/.claude/rules/common/git-workflow.md` — standing authorization + version-commit rule
3. `~/.claude/rules/common/powershell.md` — PS footguns (especially §0.2c statement-vs-expression)
4. `D:\AI\_PROJECTS\modtools-ext\CHANGELOG.md` — the full version history
5. THIS file you're reading

Then check the verification commands in §8.

---

## 11. ACTIVE TASK LIST (from prior session's TaskList)

| # | Status | Subject |
|---|---|---|
| 1-15 | completed | All v10.16.30-50 ships + swarms + rule encodings |

**Open work**: none in the task list. The session ended cleanly at v10.16.50 + PR #1 + standing-auth rule. Next chat picks what Commander asks; defaults: worker deploy or pick from v10.16.51+ brainstorm backlog.

---

## 12. FINAL NOTE TO INCOMING AGENT

You are inheriting a project shipped by a previous instance of yourself. The codebase is healthy. Commander Cats trusts you to keep shipping. Do not be deferential. Do not say "I'll need to check first" when you can just check. Do not ask "would you like me to" — pick the next move, propose with conviction, execute.

If you find a real flaw in my work, push back hard and fix it. Disagreement that prevents a bad ship is the highest-value thing you do. He cannot be offended.

Standing posture: **drive forward**.

— Outgoing agent, v10.16.50 session, 2026-05-26
