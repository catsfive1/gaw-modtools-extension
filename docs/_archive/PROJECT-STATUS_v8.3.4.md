# GAW ModTools — Project Status

**As of:** 2026-04-29
**Lead:** catsfive (Commander)
**Collaborator:** bubblegaw (PRs #1, #2 merged)
**Repo:** https://github.com/catsfive1/gaw-modtools-extension

---

## Versions deployed

| Component | Version | State |
|---|---|---|
| Chrome extension | **8.3.4** | Released as ZIP on GitHub; tested mods running v8.0–8.3.x in the wild |
| Cloudflare Worker | **8.3.0** + patches | Live at `gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev`, 6 D1 migrations applied (014 → 017) |
| D1 schema version | 17 (last migration: `discord_retry_queue`) | All migrations idempotent |
| Worker secrets | `MOD_TOKEN`, `LEAD_MOD_TOKEN`, `XAI_API_KEY`, `ANTHROPIC_API_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `GITHUB_PAT` | All set; **`ANTHROPIC_API_KEY` was clobbered by a paste bug — needs re-set** (open issue) |

---

## What's working

- **Core mod actions**: Ban / Remove / Warn / Note / Flair / Lock — all firing through GAW's native CSRF, audit-logged in worker D1
- **Death Row queue**: 72-hour delayed bans with cross-tab idempotency lock (v8.3.3 fix)
- **Auto-DR rules**: 15+ patterns ship with the team, sync via `/profiles/{read,write}` under reserved key `__gaw_team_patterns__`. 5-min pull cycle, propagated cleanly after the v8.1.6 cache-bypass fix
- **Cross-mod sync**: drafts, claims, parks, watchlist, audit log all lockstep across team browsers
- **Mod Chat**: status-bar 💬 icon, 1:1 + ALL-broadcast, 30 msg/min/mod limit, 24h read-receipt retention
- **Discord bridge**: `/gm` slash commands deployed globally — `ask` (Grok-mini), `g3` (Grok), `l3` (Llama), `chat` (Claude — currently broken pending API key re-set), `scope` (Claude→proposal→vote pipeline), `propose`, `vote`, `finalize`, `register`, `help`
- **Worker hardening (v8.3.0)**: AI strict-prefer fallback chain, KV-backed minute rate limits, circuit breakers per provider, retry queue for failed Discord webhooks, hot-path D1 indexes, body-size caps, CORS lockdown on `/admin/*`
- **Token onboarding**: storage-gated modal that fires on first boot only (v8.3.4 — bubblegaw's restored version of v8.3.1's over-removal)
- **Privacy policy**: served at `/privacy` as `text/plain`
- **Firehose ingest**: client crawler firing correctly after v8.2.7 fix (was reading wrong storage key); D1 capturing posts + comments with FTS5 indexes — but no client UI yet to surface the data (see `docs/FIREHOSE.md` for the 10 features waiting to be built)

---

## Known issues / open work

| Severity | Item | Status |
|---|---|---|
| 🔴 Live | `ANTHROPIC_API_KEY` worker secret is 1 char (paste bug) — `/gm chat` falls back to Grok every call | Awaiting Commander to re-paste via `cd cloudflare-worker; $key \| Out-File -Encoding ASCII -NoNewline $env:TEMP\ant.txt; gc $env:TEMP\ant.txt -Raw \| npx wrangler secret put ANTHROPIC_API_KEY` |
| 🟡 Open | Temp `/ai/probe` diagnostic endpoint deployed for the Anthropic key debug — should be removed after key fix verified | TODO follow-up cleanup |
| 🟡 Open | Firehose has zero client UI despite full-text-search backend being live | See `docs/FIREHOSE.md` — Phase 1 (Activity Timeline) is the obvious next ship |
| 🟢 Backlog | Chrome Web Store submission still pending review (item ID `kbhpiojnfnolhpajeccckeikefjfgnkk`, status: Draft → submitted but blocked on screenshot upload from Commander's machine) | Commander needs to upload one screenshot + click Publish |
| 🟢 Backlog | Worker repo (`gaw-mod-proxy-v2.js`) is in `D:\AI\_PROJECTS\cloudflare-worker\` outside any git tree — synced manually into `modtools-ext/worker/` for the public repo each release | Consider `git init` on the worker dir |

---

## Recent releases (last 7 days)

| Tag | Date | Highlight |
|---|---|---|
| v8.0.0 | 2026-04-23 | Team Productivity (Shadow Queue + Park + Precedent) |
| v8.1.x | 2026-04-23 | UX Polish (WCAG AA, skeletons, optimistic UI, touch targets) |
| v8.1.1–v8.1.3 | 2026-04-23 | Token onboarding modal + ESC close |
| v8.1.4–v8.1.5 | 2026-04-23 | Modal save bulletproofing + DOM-health silent |
| v8.2.0 | 2026-04-24 | **Mod Chat** + storage-authoritative modal gate |
| v8.2.1–v8.2.5 | 2026-04-24 | Iterative modal-trigger gating (later realized as over-engineered) |
| v8.2.6 | 2026-04-24 | Enhanced debug snapshot (network log + firehose state) |
| v8.2.7 | 2026-04-24 | **Firehose key-name fix** (was breaking 100% of pushes) |
| v8.3.0 | 2026-04-25 | **Worker hardening** — 8 risk items closed |
| v8.3.1 | 2026-04-25 | Modal nuclear-removed (overcorrection — bubblegaw rolled back) |
| v8.3.2 | 2026-04-25 | Manifest description trimmed for CWS |
| v8.3.3 | 2026-04-26 | **Critical: Death Row dedup** (cross-tab lock + unconditional in-flight) |
| v8.3.4 | 2026-04-29 | bubblegaw's PR #2 — onboarding modal restored with storage gates |

---

## Where things live (filesystem map)

```
D:\AI\_PROJECTS\
├── modtools-ext\           # the public git repo (master synced to GitHub)
│   ├── manifest.json
│   ├── modtools.js         # ~15k LOC content script, the heart
│   ├── background.js       # MV3 service worker
│   ├── popup.{html,css,js}
│   ├── icons\              # 16/48/128
│   ├── worker\             # synced copy of the live worker source
│   │   ├── gaw-mod-proxy-v2.js
│   │   ├── wrangler.jsonc
│   │   └── migrations\     # SQL migrations 001 → 017
│   ├── docs\
│   │   ├── INCIDENT_RUNBOOK.md
│   │   ├── ONE-SHOT-PROMPT-v9.md       # rebuild-from-scratch spec
│   │   ├── FIREHOSE.md                  # vision + 10 features
│   │   ├── PROJECT-STATUS.md           # this file
│   │   ├── PERFORMANCE_STANDARDS.md
│   │   ├── COMMANDER_HANDBOOK.md
│   │   ├── CWS-SUBMISSION-v8.1.4.md
│   │   └── gigas\          # historical design specs
│   ├── scripts\            # PowerShell ops scripts
│   ├── PRIVACY.md
│   └── .gitignore
├── cloudflare-worker\      # NOT in git, but `gaw-mod-proxy-v2.js` synced to repo on each release
├── dist\                   # ZIP build artifacts + CWS store icon
└── logs\                   # local debug logs + token files (NOT in git, .gitignore'd)
```

---

## Tokens / mods provisioned

15 mods registered in D1 `mod_tokens` table:
- 1 lead: `catsfive`
- 14 non-lead: dropgun, Filter, parallax_crow, Fatality, BasedCitizen, Qanaut, bubble_bursts, Brent75, LoneWulf, DiveAndBait, propertyofUniverse, DontTreadOnIT, TaQo, PresidentialSeal

Token reference at `D:\AI\_PROJECTS\logs\mods-provisioned-20260423-130727.txt` (excluded from git).

---

## Next 3 things to ship (recommended order)

1. **Re-set `ANTHROPIC_API_KEY` worker secret** — unblocks `/gm chat` Claude path. 30 seconds.
2. **Firehose Phase 1: User Activity Timeline in Intel Drawer** — single biggest mod-productivity win since Mod Chat. Endpoint exists, just needs drawer panel. ~2 hours.
3. **Chrome Web Store submission completion** — upload screenshot, click Publish. Blocks public install link.

After those: pick from `FIREHOSE.md` Phase 2 features, or address whatever testing surfaces in the wild.
