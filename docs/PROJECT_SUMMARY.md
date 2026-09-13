# GAW ModTools — Project Summary

- **Repo:** https://github.com/catsfive1/gaw-modtools-extension (public) · branch `master`
- **Code state described:** v10.50.1 @ `4e79c17` (this doc lands in the commit that follows)
- **Status:** active (multiple ships per week through 2026-08-31)

## Purpose & users

Moderator toolkit for the volunteer mod team of
[greatawakening.win](https://www.greatawakening.win/) — a lead ("Commander")
plus sub-mods. It replaces the site's scattered native moderation UI with one
overlay: unified Mod Console, shared team flags, audit log, Death Row queue,
AI-assisted ban drafting, shadow triage, mod-to-mod chat, per-mod
authentication with rotation invites, and self-healing maintenance routines.
Distributed unpacked (load-from-folder); Chrome Web Store submission prepared
but not published.

## Stack & runtime

| Layer | Tech |
|---|---|
| Extension | Chrome MV3 (minimum Chrome 116), vanilla JS/CSS/HTML, no build step — the repo IS the artifact |
| Content scripts | `modtools.js` (~35.6k lines) + `modtools-aux.js` (~3.7k lines) on `*.greatawakening.win` |
| Service worker | `background.js` (~4.8k lines): secret vault (encrypted), named-RPC dispatcher, 12 alarm schedules |
| Popup | `popup.html/.css/.js` — Tools / Tokens / Lead / Stats / Diag tabs |
| Backend | Cloudflare Worker `gaw-mod-proxy` (companion repo `D:\AI\_PROJECTS\cloudflare-worker\`, NOT in this repo): D1 `AUDIT_DB`, KV `MOD_KV`, R2 `EVIDENCE`, Workers AI (Llama 3.1-8B), Analytics Engine `MOD_METRICS`, xAI Grok, Anthropic Claude, Discord C5Bot |
| Tooling | PowerShell 7 build/install/provision scripts + ~40 standalone Node `.mjs` smoke suites |

## What the code does

- **In-page moderation UI** — Mod Console (Intel/Ban/Note/Message/Quick),
  Triage Console on `/users`, Death Row queue + sniper, SUS flags, watchlist,
  Mod Chat, modmail, raid/firehose intake, profile/post "eater-kill" CSS guard.
- **Privileged relay** — content scripts and popup never hold raw secrets for
  API calls; they issue named RPCs to the service worker, which attaches
  `x-mod-token` / `x-lead-token` and relays to the worker. Tokens are stored
  as an encrypted blob (mandatory since v10.49.6, no plaintext fallback).
- **Auth lifecycle** — lead issues rotation invites (Discord DM + install
  link) → mod claims via `?mt_invite=` or popup paste → atomic token mint in
  D1 → encrypted client persistence → `whoami`-validated sessions; lead
  lockout rescue path (`scripts/recover-lead-access.ps1` + in-page rescue
  modal, hardened in v10.50.1).
- **Autonomy** — alarm-driven update checks (notification-only, no
  auto-reload), bug-report badge polling, autonomous `/users` AI scans,
  weekly non-destructive maintenance run with Llama analysis upload.
- **Data flow** — actions write to the worker → audit rows (HMAC-chained) in
  D1 `AUDIT_DB`, evidence snapshots in R2, presence/budgets/cache in KV,
  per-mod telemetry in Analytics Engine.

## How to run

```powershell
# Build (ZIP + auto-extract to D:\AI\_PROJECTS\dist\mod-tools dist\ for "Load unpacked")
pwsh -File scripts\build-zip.ps1 -NoPause
# Then: chrome://extensions → reload GAW ModTools → hard-refresh greatawakening.win

# Parse gates
node --check modtools.js; node --check background.js; node --check popup.js

# Smoke suites (standalone Node; the regression gate)
node scripts\_p20_sus_system_complete_smoke_test.mjs
```

Env vars (shell, no `.env` file): `CLOUDFLARE_API_TOKEN` (wrangler/D1 ops),
`CF_API_TOKEN` (alias in older scripts). Install guide: [INSTALL.md](INSTALL.md).

## Key files

| Path | Role |
|---|---|
| `manifest.json` | MV3 manifest, permissions, CSP, deterministic extension key |
| `modtools.js` | entire in-page UI + logic |
| `modtools-aux.js` | focus mode, saved views, snooze, palette commands |
| `background.js` | token vault, RPC dispatcher, alarms |
| `popup.html/.css/.js` | toolbar popup UI |
| `scripts/build-zip.ps1` | build + unpacked-folder bridge |
| `scripts/recover-lead-access.ps1` | lead lockout rescue |
| `scripts/_p*_*_smoke_test.mjs` | ~40 Node smoke suites (850 passed at v10.50.0) |
| `tests/regressions/` | one plain-Node file per closed bug (convention in its README) |
| `CHANGELOG.md` | per-version ship log, v10.50.1 at top |

## Recent work (git log, newest first)

- `4e79c17` fix(modtools): v10.50.1 — end the recurring lead-lockout loop
  (rescue script tier fix, popup tier mapping, in-page rescue-token paste,
  durable modal save)
- `3ea8c94` ledger: D1 harvest addendum (cc-ledger account-wide finding + batching plan)
- `e163532` v10.50.0: D1 free-tier rescue (client half) + 11-persona
  simulation fix wave — firehose dedupe, honest undo, batch DR stop, SUS
  keyboard a11y, lead revoke/add from roster; suites 850 passed / 0 failed
- `8503a67`, `4bd82c7` — clipboard opt-in per AGENTS S9; unblock
  rotate/invite/roster after the plaintext-token deletion
- `b018fe7`/`148b8a6`/`557f3cd` v10.49.6 — token encryption made canonical
  (plaintext deleted, key-mint guarded, always-visible rotate button)
- `f87a357`…`4568e32` v10.49.5 — Death Row execute/undo truth-telling wave
- `12aef69`…`a984fac` v10.49.0–v10.49.4 — race-proof `/u/`+`/p/` post-eater
  kill + REAL reorder fix (selector/interpolation root causes)
- `f42fe32` v10.48.0 — registration-burst detection + pattern DR-all
- `093d731` v10.46.0 — team Death-Row visibility · `37c2f28` v10.45.0 — shared team watchlist

## Doc index

- **New (2026-09-13 inventory):** this file, [ARCHITECTURE.md](ARCHITECTURE.md) (C4-lite + permissions map), root [../SECURITY.md](../SECURITY.md), README.md refresh
- **Current-state:** [AGENT_BRIEF.md](AGENT_BRIEF.md) (agent handoff + invariants — note: written at v10.4 era, version numbers inside are historical), [FEATURES_INDEX.md](FEATURES_INDEX.md), [PROJECT-STATUS.md](PROJECT-STATUS.md) (pointer file)
- **Feature matrices:** FEATURES_MATRIX_v10.5.md (latest snapshot), v10.31 / v10.2 / v9.24
- **Ops:** COMMANDER_HANDBOOK.md, INCIDENT_RUNBOOK.md, LEAD-LOCKOUT-PLAYBOOK.md, MAINTENANCE_AUTONOMOUS.md, INSTALL.md, ROLLOUT_LEAD.md, ROLLOUT_MOD.md
- **Security/privacy:** ../PRIVACY.md, ../SECURITY.md, SECURITY_REAUDIT_v9.22.md, CSP_TIGHTENING.md, CRYPTO_DESIGN.md
- **History:** CHANGELOG.md (root), CHANGELOG-v10.50.0/10.36.1/10.16.38.md, HANDOFF_* (12 sessions), RELEASE_NOTES_v9.3.md, UAT_* (2026-05-08), gigas/ (v7.0–v8.5 specs), V10_*/ ralph corpus, SIM-ITERATION-LEDGER.md, BACKLOG.md (v10.4-era), STALE_FEATURES_AUDIT.md

## Known gaps / TODOs (evidenced)

- `BACKLOG.md` TIER-2/3 items from the v10.4 era (CSP `unsafe-inline` removal
  TS-2, auth Phase-2/3 short-lived sessions, device enrollment) — status not
  re-verified against v10.50.x; treat as historical planning, not current.
- AGENT_BRIEF version-state block still says v10.4.0/v9.5.0 (historical).
- CWS publication pending first review (README + `EXTENSION_ID_ALLOWLIST` still empty per backlog TS-8).
- Production worker source (`gaw-mod-proxy-v2.js` + `migrations/`) in the companion dir `D:\AI\_PROJECTS\cloudflare-worker\` is not under version control; the GitHub repo `catsfive1/gaw-mod-proxy` currently holds only a blank create-cloudflare scaffold (BACKLOG TIER-1 "worker repo init" — deferred by Commander).
- No jest/vitest runner; `tests/regressions/` files are plain-Node shims (see `tests/regressions/README.md`).
