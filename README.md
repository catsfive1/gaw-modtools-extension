# GAW ModTools

Chrome extension for the volunteer moderator team of [greatawakening.win](https://www.greatawakening.win/).

Unified Mod Console overlay on the native site — shared team flags, audit log, Death Row queue, Intel Drawer with precedent-citing ban drafts, Shadow Queue triage, Park button for senior-mod handoff, Discord bridge with Grok + Claude AI, per-mod authentication, full cross-mod sync.

**Current version:** 8.1.5

## Architecture

- **`modtools.js`** — content script injected on `*.greatawakening.win`. Builds the Mod Console, drawer, ribbon, status bar. Reads via DOM + native CSRF; submits via the worker API.
- **`background.js`** — MV3 service worker. Keeps the token vault, relays worker calls, runs scheduled housekeeping.
- **`popup.js` / `popup.html`** — extension popup for configuration, token entry, feature flags, settings.
- **`manifest.json`** — MV3 manifest. Scoped to `greatawakening.win` + our Cloudflare Worker only.

## Backend

Private Cloudflare Worker at `gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev`. Source lives in a separate repo (`gaw-mod-proxy`). D1 for audit + shared state; KV for presence, cache, invites; R2 for evidence snapshots; Workers AI (Llama 3) + xAI Grok + Anthropic Claude for AI features.

## Install (unpacked, development)

1. Download the latest `gaw-modtools-chrome-store-v*.zip` release
2. Extract to a folder
3. Chrome/Brave → `chrome://extensions/` → Developer mode ON → Load unpacked → select the folder
4. Sign into greatawakening.win
5. Paste your per-mod token in the onboarding modal (obtained from lead mod)

## Install (Chrome Web Store)

Pending first review — link will be added here once approved.

## License & contribution

Internal moderation tooling. Not intended for reuse outside of the GAW mod team.
