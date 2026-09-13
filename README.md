# GAW ModTools

Professional moderator toolkit for [greatawakening.win](https://www.greatawakening.win/).

Chrome extension + Cloudflare Worker backend providing a unified Mod Console, shared team flags, audit log, Death Row queue, AI-assisted ban drafting, Shadow Queue triage, Park button for senior handoff, Discord bridge with Grok + Claude, and per-mod authentication with cross-mod sync.

**Status:** active · **Current version:** v10.50.1 (`manifest.json`; `chrome.runtime.getManifest()` reports the live version)

> Deep-dive docs: [docs/PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [CHANGELOG.md](CHANGELOG.md) · [SECURITY.md](SECURITY.md)

---

## Repository layout

```
/
├── manifest.json              Chrome extension MV3 manifest (v10.50.1)
├── modtools.js                Content script (~35.6k lines) — the main UI + logic
├── modtools-aux.js            Auxiliary content script (Focus Mode, saved queue
│                              views, smart snooze, Cmd-K palette commands)
├── background.js              Extension service worker (~4.8k lines): token vault,
│                              named-RPC dispatcher, alarms/maintenance routines
├── popup.html / popup.css / popup.js   Extension popup (Tools / Tokens / Lead / Stats / Diag tabs)
├── icons/                     Extension icons (16/48/128)
│
├── docs/                      ~100 documents: feature matrices, handoffs, runbooks,
│   ├── PROJECT_SUMMARY.md     Current-state summary (this mission's entry point)
│   ├── ARCHITECTURE.md        C4-lite architecture + permissions map
│   ├── FEATURES_MATRIX_v10.5.md  Latest feature-matrix snapshot (v10.5 era)
│   ├── FEATURES_INDEX.md      feature → code → endpoint → D1-table map
│   ├── COMMANDER_HANDBOOK.md  Lead mod's operations handbook
│   ├── INSTALL.md             Full install guide
│   ├── INCIDENT_RUNBOOK.md / LEAD-LOCKOUT-PLAYBOOK.md / MAINTENANCE_AUTONOMOUS.md
│   └── gigas/                 Feature spec history (v7.0 → v8.5)
│
├── scripts/
│   ├── build-zip.ps1          Build: ZIP for CWS + auto-extract to dist\mod-tools dist\
│   ├── deploy-unpacked.ps1    Source → "Load unpacked" browser bridge
│   ├── provision-mod-token.ps1 / provision-all-mods.ps1 / invite-mod.ps1
│   ├── recover-lead-access.ps1 (+ RECOVER-LEAD-ACCESS.bat) — lead lockout rescue
│   ├── _p*_*_smoke_test.mjs   ~40 self-contained Node smoke suites (regression gates)
│   └── ...                    installers, publish, verify, HMAC backfill helpers
│
├── tests/regressions/         One plain-Node test file per closed bug report
├── PRIVACY.md                 Public privacy policy (served at worker /privacy)
├── SECURITY.md                Security posture + reporting
├── CHANGELOG.md               Per-version changelog (latest: v10.50.1)
└── .gitignore                 Tokens, logs, builds, backups — all excluded
```

**Note:** the Cloudflare Worker backend is NOT in this repo. It lives in the
companion directory `D:\AI\_PROJECTS\cloudflare-worker\` (`gaw-mod-proxy-v2.js`,
`migrations/*.sql`, `wrangler.jsonc`) — see *Architecture* below.

---

## Architecture

**Extension (this repo)** runs as an MV3 content script on `*.greatawakening.win` + its own service worker. Overlays the Mod Console on the native site. Reads DOM + native CSRF; submits via the worker API through the background service worker's named-RPC relay (tokens never touch content-script storage).

Full diagrams, module map, and the manifest permissions table: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

**Worker (companion repo, `D:\AI\_PROJECTS\cloudflare-worker\`)** at `gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev`:
- **D1** (`AUDIT_DB`) — audit log, mod_tokens, parked_items, shadow_triage_decisions, ai_suspect_queue, precedents, proposals, drafts, claims, bot_mods, bot_chat_history
- **KV** (`MOD_KV`) — presence, cache, invites, daily budgets
- **R2** (`EVIDENCE`) — snapshots captured at action time
- **AI** — Cloudflare Workers AI (Llama 3.1-8B), xAI Grok (3-mini / 3 / 4), Anthropic Claude (Haiku 4.5)
- **Analytics Engine** (`MOD_METRICS`) — per-mod usage telemetry

**Discord bot (C5Bot)**: slash commands `/gm ask`, `/gm g3`, `/gm l3`, `/gm chat` (Claude bridge), `/gm scope` (Claude-backed feature scoping → auto-filed proposal), `/gm register` (self-onboarding), `/gm propose`, `/gm vote`, `/gm finalize`. The feature pipeline goes: mod hits friction → `/gm scope` → structured spec → team votes → lead finalizes → bot DMs Claude-Code-ready prompt to Commander → shipped.

---

## Install

See **[docs/INSTALL.md](docs/INSTALL.md)** for the full install guide, including:

- Decision tree: Drive Desktop path vs. manual ZIP path
- Step-by-step load-unpacked instructions
- Brave Shields gotcha (invite links)
- Drive Desktop "Available offline" gotcha
- Linux notes
- Verification checklist

## Install (Chrome Web Store)

Pending first review. Link will be added here once published.

---

## Deploy (worker)

The worker lives in the companion repo (`D:\AI\_PROJECTS\cloudflare-worker\`, not tracked here).

Requires a `CLOUDFLARE_API_TOKEN` env var with `Workers Scripts:Edit`, `D1:Edit`, `Workers KV:Edit`, `Workers R2:Edit` permissions on the parent account.

```powershell
cd D:\AI\_PROJECTS\cloudflare-worker
node --check gaw-mod-proxy-v2.js   # always parse-check first
npx wrangler@latest deploy
```

Secrets (`DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `XAI_API_KEY`, `LEAD_MOD_TOKEN`, `MOD_TOKEN`, `ANTHROPIC_API_KEY`) are dashboard-managed — `--keep-vars` preserves them across deploys.

## Provision a mod token

```powershell
powershell -ExecutionPolicy Bypass -File scripts/provision-mod-token.ps1
```

Prompts for GAW username + your lead token. Generates a 32-byte random token, registers it in D1 `mod_tokens`, copies to clipboard for DM'ing to the mod.

---

## Build & test (extension)

```powershell
# Build ZIP + auto-extract to the "Load unpacked" folder + node --check parse gate
pwsh -File scripts\build-zip.ps1 -NoPause

# Parse-check the three big sources without a build
node --check modtools.js; node --check background.js; node --check popup.js

# Run one smoke suite (each scripts/_*_smoke_test.mjs is standalone Node)
node scripts\_p25_profile_reorder_spa_attach_smoke_test.mjs
```

Smoke suites are the real regression gate (v10.50.0 shipped with **850 passed / 0 failed** across the suites). `tests/regressions/` holds one plain-Node file per closed bug report (see its README for the convention).

---

## Environment variables

Read by `scripts/*.ps1` (no `.env` file is used; set these in your shell):

| Name | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for wrangler deploy / D1 operations (most scripts) |
| `CF_API_TOKEN` | Alias accepted by a couple of older scripts |

Extension-side secrets (mod/lead tokens) are entered in the popup, stored encrypted in `chrome.storage` (v10.49.6+: encryption mandatory, no plaintext fallback), and validated against the worker — never committed. Worker secrets (`DISCORD_BOT_TOKEN`, `XAI_API_KEY`, `ANTHROPIC_API_KEY`, …) are Cloudflare-dashboard-managed.

---

## Contributing

Internal moderation tooling for the GAW mod team. Write access by invitation only. See `docs/COMMANDER_HANDBOOK.md` for workflow conventions.
