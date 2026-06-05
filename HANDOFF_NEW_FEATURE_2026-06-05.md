# HANDOFF — modtools-ext, new feature session

**Date:** 2026-06-05
**From:** Claude (CTO of C5 Operations)
**To:** next Claude session
**Purpose:** Commander wants to start a new feature on modtools-ext. This doc primes you on the state of the board so you can hit the ground running. Ask Commander what the feature is, then execute.

---

## 1. Where the codebase is

- **Version shipped:** `v10.18.9` (commit `8208090`, ZIP at `D:\AI\_PROJECTS\dist\modtools-ext-v10.18.9.zip`, mirrored to `E:\My Drive\_PROJECTS\modtools-ext\` per §15)
- **Last 5 versions are a back-to-back grind chain** — `v10.18.5 → v10.18.9` all shipped this session. Storm scorecard:
  - P1: 10/10 unique findings shipped
  - P2: 4/62 shipped (DR badge route, GOD MODE open-tabs gate, undo snack hint, ❓ tooltip rewrite)
  - P3: 0/8
- **Outstanding verify:** Commander has not yet posted a fresh SNAPSHOT FOR FIX from v10.18.4+. The `isMod is not defined` storm in `gam_diag_log` *should* be silenced (three sites patched in v10.18.4 → `detectModStatus()`), but unverified end-to-end. If the new feature touches mod-gated code paths, **run the snapshot first.**

---

## 2. Conventions you must NOT break

1. **Per-version commits.** Every `manifest.json` version bump = its own commit, no batching. (See `~/.claude/rules/common/git-workflow.md`.)
2. **Standing authorization to commit + push.** No "shall I commit?" — just do it on natural commit points. Only ask for force-push, push to `main`, hooks-skip, or files-with-secrets.
3. **§15 Drive mirror.** Every shipped ZIP also lands at `E:\My Drive\_PROJECTS\modtools-ext\` via `scripts\mirror-to-drive.ps1 -Version <v>`. Last-2 retention.
4. **PowerShell §7.** No `<placeholder>` syntax in user-pasted commands, UTF-8 BOM, ASCII-only, four-step ending block (log → clipboard → E-C-G beep → Read-Host pause). Parse-check via `scripts/_ps1-check.ps1`.
5. **§8 test before delivering.** Never use Commander as a test mule. If you can `curl` it / wrangler-probe it / parse-check it from your side, do that first.
6. **§13/§14 don't hold, don't menu.** Pick the next move, execute, ship, loop. Surface forks only when they're genuinely load-bearing.
7. **Token vault stays popup-only.** Reveals go through `RPC_CALLER_POPUP` in `background.js` — never via URL fragment, DOM text, or content-script context.

---

## 3. Surface map (top files)

| File | Lines | Role |
|---|---|---|
| `manifest.json` | 53 | MV3 manifest, currently v10.18.9 |
| `modtools.js` | 31,731+ | Main content script — Mod Console, Death Row, sticky decoration, GOD MODE bulk actions, palette |
| `modtools-aux.js` | ~3,300 | Helper IIFEs — Wave5 palette entries, GOD MODE modal (`_gmOpenModal`), bulk bar (`_gmRefreshBulkBar`), `_gamAuxAsk`/`_gamAuxConfirm`, `_gamSnapshotForFix` |
| `background.js` | ~1,500 | Service worker — RPC dispatcher, token vault (`secretCache`), alarms, FIREHOSE start/stop, snapshot RPCs |
| `popup.html` / `popup.js` | — | Toolbar popup — token-reveal button, GOD MODE Search btn, SNAPSHOT FOR FIX btn |
| `package.py` | — | Build pipeline (ZIP + load-unpacked dir mirror per Chrome ext dist tradition) |
| `scripts/mirror-to-drive.ps1` | — | §15 Drive mirror with last-2 retention |
| `scripts/_ps1-check.ps1` | 16 | One-arg parse-check harness (Git Bash `$err` workaround) |
| `CHANGELOG.md` | — | Inverted (newest first); update before commit |

---

## 4. Open backlog (storm-flagged P2/P3)

Source of truth: `docs/USABILITY_RALPH_2026-06-04.md` (89 entries from the 25x ralph storm).

**Highest-impact deferred P2s with verified surfaces:**
1. **Hot Now Execute pre-fills ban reason** — `modtools.js:12299` discards `drow.reason` in the `openModConsole(drow.username, null, 'ban')` call. Approach: transient `window.__gamPendingBanReason` cache that `renderBanTab` reads + clears on init. Likely textarea `#mc-ban-msg` near `modtools.js:9816+`.
2. **DR popover j/k navigation** — mirror `_mmpKbHandler` from modmail palette
3. **DR FIRE NOW double-confirm collapse** — current flow asks twice; collapse to one
4. **DR Cancel All disable-when-empty** — button enabled even when queue is empty
5. **Session-dot recovery path** — clicking the red session-dot should open login tab, not just toast
6. **Re-hydrate banner timing race** — banner appears before storage settles

**Strategic v10.19 fork (separate from P2 grind):**
`docs/BACKFILL_SPIKE_2026-06-04.md` documents a 3-track hybrid backfill plan:
- T1: JSON-API live-crawler swap (replace HTML-scrape FIREHOSE)
- T2: SW-side D1 dedupe with per-post `gam_seen_post:<id>` TTL keys
- T3: Public archive search UI (gated behind pro-tier paywall)

---

## 5. Worker / backend state

- **CF Worker:** `gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev` (production)
- **Worker source: gitignored.** Lives outside the extension repo. Don't try to grep it from `modtools-ext/`.
- **D1 schema:** post-master pattern. Most recent migration `044` (Stripe subscriptions table, shipped v9.12.0+stripe).
- **Stripe checkout:** wired in Worker as of GAW MOD pro-tier (2026-05-19). Pro routes: `/stripe/checkout`, `/stripe/webhook`, `/stripe/status`, `/pro/ban-templates`, `/pro/search`. Replay-attack patched (5-min Stripe tolerance + isNaN guard).

---

## 6. The new feature — what to do on session start

1. **Read this doc.** (You're here.)
2. **Run `git status` + `git log -5 --oneline`** to confirm tree is clean and you understand the last 5 ships.
3. **Ask Commander:** *"What's the new feature? Drop me the brief in one paragraph."*
4. Once briefed:
   - If it's a feature with a clear acceptance criterion → propose ONE approach with conviction (§0), confirm, execute.
   - If it's exploratory → ask one targeted clarifying question, then go.
   - If it touches the storm backlog (§4) → check whether the storm-flagged version is already a near-fit; don't re-design what's already specced.
5. **Default first-move when in doubt:** start a small spike branch via `git checkout -b feat/<name>` so the v10.18.x storm grind chain stays linear on `main`.

---

## 7. What NOT to do

- **Don't restart the 25x ralph storm.** The findings are already extracted; the queue is workable as-is. Storm again only if the new feature is in a domain the existing storm didn't cover.
- **Don't grind P2/P3 unprompted.** Commander explicitly said "new feature." If you finish the feature early and want to pad the session, then yes grind — but the feature is priority 1.
- **Don't edit `worker/` from inside `modtools-ext/`.** Worker source is gitignored and lives outside. If the feature needs Worker changes, ask Commander to bring up the Worker dir.
- **Don't touch `~/.claude/settings.json`** unless Commander explicitly approves — it's classifier-protected. Project-level `D:\AI\_PROJECTS\modtools-ext\.claude\settings.json` is OK with explicit ask.

---

## 8. Quick context lookups

- **CHANGELOG:** `D:\AI\_PROJECTS\modtools-ext\CHANGELOG.md`
- **Storm master:** `D:\AI\_PROJECTS\modtools-ext\docs\USABILITY_RALPH_2026-06-04.md`
- **Backfill spike:** `D:\AI\_PROJECTS\modtools-ext\docs\BACKFILL_SPIKE_2026-06-04.md`
- **Prior handoff (FIREHOSE+GOD MODE):** `D:\AI\_PROJECTS\modtools-ext\HANDOFF_FIREHOSE_GODMODE.md`
- **Memory primer:** `C:\Users\smoki\.claude\projects\C--\memory\MEMORY.md`
- **Global rules:** `C:\Users\smoki\.claude\CLAUDE.md` + `~/.claude/rules/common/*.md`

---

## 9. Commander profile (don't forget)

- Non-programmer power user. Wants execution, not menus.
- Says "Grind!" when he wants you to keep shipping without asking.
- Will say "garbage UI performance" or "this is annoying" when something is wrong — listen literally, fix the path, not just the named step (§11).
- Wins from per-version commits + ZIP + Drive mirror loop. Every ship completes that loop.
- Standing E-C-G beep at end of long PS scripts is sacred.

---

**Ready when the next session starts. First message to Commander: *"What's the new feature?"***
