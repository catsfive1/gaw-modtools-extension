# GAW ModTools

Professional moderator toolkit for [greatawakening.win](https://www.greatawakening.win/).

Chrome extension + Cloudflare Worker backend providing a unified Mod Console, shared team flags, audit log, Death Row queue, AI-assisted ban drafting, Shadow Queue triage, Park button for senior handoff, Discord bridge with Grok + Claude, and per-mod authentication with cross-mod sync.

**Current version:** v10.36.4 (current shipped version — see `chrome.runtime.getManifest()` for live version)

---

## Repository layout

```
/
├── manifest.json              Chrome extension MV3 manifest
├── modtools.js                Content script (~14k lines) — the main UI + logic
├── background.js              Extension service worker
├── popup.html / popup.css / popup.js   Extension popup (settings, token entry)
├── icons/                     Extension icons (16/48/128)
│
├── worker/
│   ├── gaw-mod-proxy-v2.js    Cloudflare Worker (~6k lines) — the backend
│   ├── wrangler.jsonc         Worker deploy config (bindings; no secrets)
│   └── migrations/            D1 schema migrations (SQL)
│
├── docs/
│   ├── PERFORMANCE_STANDARDS.md    Performance rules every release respects
│   ├── COMMANDER_HANDBOOK.md       Lead mod's operations handbook
│   ├── CWS-SUBMISSION-v8.1.4.md    Chrome Web Store listing bundle
│   └── gigas/                       Feature spec history (v7.0 → v8.5)
│
├── scripts/
│   ├── provision-mod-token.ps1     Mint + register a single mod token
│   ├── provision-all-mods.ps1      Batch-mint tokens from a username list
│   ├── test-cf-token.ps1           Verify Cloudflare API token + wrangler
│   ├── publish-and-test-v8.ps1     One-shot deploy + verify pipeline
│   ├── verify-v8-0.ps1             v8.0 acceptance gate
│   └── verify-v8-1.ps1             v8.1 acceptance gate
│
├── PRIVACY.md                 Public privacy policy (served at worker /privacy)
└── .gitignore                 Tokens, logs, builds, backups — all excluded
```

---

## Architecture

**Extension** runs as MV3 content script on `*.greatawakening.win` + its own service worker. Overlays the Mod Console on the native site. Reads DOM + native CSRF; submits via the worker API.

**Worker** at `gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev`:
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

Requires a `CLOUDFLARE_API_TOKEN` env var with `Workers Scripts:Edit`, `D1:Edit`, `Workers KV:Edit`, `Workers R2:Edit` permissions on the parent account.

```powershell
cd worker
npx wrangler@latest deploy
```

Secrets (`DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `XAI_API_KEY`, `LEAD_MOD_TOKEN`, `MOD_TOKEN`, `ANTHROPIC_API_KEY`) are dashboard-managed — `--keep-vars` preserves them across deploys.

## Provision a mod token

```powershell
powershell -ExecutionPolicy Bypass -File scripts/provision-mod-token.ps1
```

Prompts for GAW username + your lead token. Generates a 32-byte random token, registers it in D1 `mod_tokens`, copies to clipboard for DM'ing to the mod.

---

## Contributing

Internal moderation tooling for the GAW mod team. Write access by invitation only. See `docs/COMMANDER_HANDBOOK.md` for workflow conventions.
