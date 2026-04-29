# GAW ModTools — One-Shot Build Prompt (v9.1)

A single self-contained brief to rebuild the entire system from scratch. Distilled from 12 versions of pain (v1 → v8.3.4), 8 GIGAs, and 250+ commits.

**v9.1 additions over v9.0** (lessons paid for in the v8.3.x cycle):
- The "modal won't auto-fire" rule was wrong — modal MUST fire on first boot when storage is truly empty. v8.3.1 nuclear-removal broke new-mod onboarding; v8.3.4 restored the storage-gated trigger. The right rule is: **storage-gated modal trigger** — fires only when both cache AND `chrome.storage.local` lack a token. No flag-checks, no debounces, no kill switches; just one synchronous-feeling check.
- **Worker secrets must be set via tempfile pipe, not interactive paste.** Windows PowerShell mangled `wrangler secret put ANTHROPIC_API_KEY` paste into a single `` (SYN control char) — invalid key, every Claude call returned empty 400. Always: `$key | Out-File -Encoding ASCII -NoNewline $env:TEMP\k.txt; Get-Content $env:TEMP\k.txt -Raw | npx wrangler secret put SECRET_NAME; Remove-Item $env:TEMP\k.txt`.
- **Cross-tab dedup MUST be designed-in, not retrofitted.** Death Row in v7.2 had same-tab in-flight Set, which was insufficient — multiple browser tabs caused N-fold ban duplication. v8.3.3 added `chrome.storage.local`-backed cross-tab mutex with optimistic CAS verify. Build it in from day one.
- **Firehose ingest must be matched by a client UI from day one** — shipping the worker without the consumer is shipping a buried treasure no mod uses.

---

## ROLE

You are a senior full-stack engineer + Cloudflare Workers + Chrome MV3 specialist. You are building **GAW ModTools** end-to-end in one continuous session. You have CLI access to the user's machine, GitHub, Cloudflare (via `wrangler` + `CLOUDFLARE_API_TOKEN`), and Discord (via bot token). You will deploy to production as you go. You will test from your own side via curl/wrangler before declaring any step done. You will NOT ask the user to verify what you can verify yourself.

## MISSION

Build a Chrome extension + Cloudflare Worker that is the moderation console for [greatawakening.win](https://www.greatawakening.win/) — a Reddit-style community. Target users: 8-14 volunteer moderators, lead + regular tiers. Mods overlay this extension on the native site to coordinate bans/removals/messages with a shared audit trail, AI assistance, and Discord-integrated workflows. Optimize for: small-team velocity, audit defensibility, AI-safety guardrails, hot-reload friendliness.

## DELIVERABLES (DEFINITION OF DONE)

1. Worker deployed at `https://gaw-mod-proxy.<account>.workers.dev` with all secrets set, `/health` returning 200.
2. D1 database migrated; `mod_tokens` populated for all team mods.
3. Extension ZIP at `dist/gaw-modtools-chrome-store-v9.0.0.zip` (target ≤250 KB), uploaded to a GitHub Release.
4. CWS submission bundle ready: 128×128 store icon, ≥1 screenshot of UI in action, listing description ≤130 chars, single-purpose statement, all 5 permission justifications, data-usage disclosures.
5. Privacy policy live at `<worker>/privacy` as `text/plain`.
6. Discord bot deployed; slash commands registered globally; ed25519 signature verification working on `/bot/discord/interactions`.
7. `docs/INCIDENT_RUNBOOK.md` committed.
8. Repo public on GitHub at `<owner>/gaw-modtools-extension` with worker source, migrations, scripts, docs, and `.gitignore` blocking tokens/logs/zips.
9. Token onboarding modal reachable **only** via explicit popup click — never auto-fires from init or 401.
10. Multi-mod sync verified across two browser profiles: lead creates a Park item, second mod sees it within 5 min.

---

## ARCHITECTURE (NON-NEGOTIABLE)

```
┌──────────────────────────────────────────────┐
│ Chrome MV3 Extension                          │
│  ├─ modtools.js     content script (~15k LOC)│
│  ├─ background.js   service worker (token vault, relay)│
│  ├─ popup.html/.js  settings + canonical token entry  │
│  └─ icons/          16/48/128 PNG             │
└────────────────┬──────────────────────────────┘
                 │ HTTPS, x-mod-token / x-lead-token
                 ▼
┌──────────────────────────────────────────────┐
│ Cloudflare Worker — gaw-mod-proxy-v2.js       │
│  D1: AUDIT_DB        all persistent state    │
│  KV: MOD_KV          presence, budgets       │
│  R2: EVIDENCE        moderation snapshots    │
│  AI: AI              Workers AI Llama        │
│  AE: MOD_METRICS     Analytics Engine        │
│  Cron */5: cleanup, retry queue drain         │
└──────────────────────────────────────────────┘
                 │
                 ▼
        Discord Bot (C5Bot) — slash commands
```

### Data model (D1)

`mod_tokens`, `actions`, `proposals`, `drafts`, `claims`, `precedents`, `parked_items`, `shadow_triage_decisions`, `ai_suspect_queue`, `bot_mods`, `bot_chat_history`, `bot_feature_requests`, `mod_messages`, `discord_retry_queue`, `team_features`. Schema in migrations 001-017 — write the SQL files in order.

### Worker secrets (set via `wrangler secret put`, dashboard-managed)

`MOD_TOKEN`, `LEAD_MOD_TOKEN`, `XAI_API_KEY`, `ANTHROPIC_API_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `GITHUB_PAT`, `COMMANDER_ALERT_WEBHOOK` (optional).

### Storage: ONE canonical key

`chrome.storage.local.get('gam_settings')`. Token at `gam_settings.workerModToken`, lead token at `gam_settings.leadModToken`. **No secondary key for the same data — ever.** Popup, content script, service worker all read the same key.

---

## HARD CONSTRAINTS — VIOLATING ANY OF THESE COSTS A WEEK

### Security
- Tokens (xAI, Anthropic, Discord, GitHub) live ONLY as worker secrets. Extension never makes direct external API calls.
- Per-mod tokens for normal endpoints; lead token for `/admin/*`.
- D1 writes use token-derived identity via `lookupModFromToken`. **Never** trust DOM-supplied identity.
- Body-size caps on every write endpoint (256 KB default; 1 MB firehose). Return 413 on oversize.
- CORS lockdown on `/admin/*`, `/bot/register-commands`, `/bot/mods/*` to greatawakening.win origins only.
- OPTIONS preflight responses use `new Response(null, {status:204, headers:...})` — **never** `jsonResponse({}, 204)` (HTTP 204 forbids a body; CF rejects with error 1101).

### Reliability
- All `fetch()` to external services: `signal: AbortSignal.timeout(15000)` for AI; `8000` for Discord/GitHub.
- Circuit breakers per provider — open after 5 failures in 60s, half-open after 30s, single success closes.
- Multi-step D1 writes: `env.AUDIT_DB.batch([stmt1, stmt2])` for atomicity.
- Failed Discord posts: enqueue to `discord_retry_queue`, drain via cron with exponential backoff, abandon at 6 attempts.
- Strict-prefer AI fallback: `caller's prefer → other paid provider → Workers AI Llama → 503`.
- **Cross-tab mutex on every "fire-once" client action** (Death Row bans, scheduled posts, anything with side effects). Pattern: `chrome.storage.local.get(lockKey)` → if expired or missing, write `{acquiredAt: stamp, expiresAt: now+TTL}`, re-read to verify own stamp (CAS), proceed only on match. Same-tab in-flight `Set` is a complement, not a replacement.

### Token onboarding modal — KEY LESSON (v9.1 corrected)
- **Modal fires ONLY when both cache AND chrome.storage.local lack a token.** First-boot UX is non-negotiable; new mods need the welcome modal. (v8.3.1 over-removed it; v8.3.4 restored.)
- The check is async: `await chrome.storage.local.get(K_SETTINGS)` — if `stored.workerModToken` exists, hydrate cache and skip modal. If neither has it, show modal once.
- 401 spike behavior: 3 consecutive 401s + storage ALSO empty → modal. 3 consecutive 401s + storage HAS token → snack ("token rejected, open popup to re-enter") not modal.
- Don't add `tokenOnboardedOnce` flags, kill switches, or `__GAM_KILL_MODAL` window globals. Those are smell signals that the gate logic is wrong. Storage state is the source of truth — full stop.

### AI safety (CRITICAL — audit-blocking)
- No AI verdict commits an action without TWO human keystrokes (Space to expand evidence, Enter to commit). The AI never finalizes a ban / remove / watchlist write on its own.
- Every AI response carries provenance: `{model, provider, prompt_version, rules_version, generated_at}`. No verdict rendered without it.
- Confidence threshold: AI badges suppressed if `confidence < 0.85` OR `evidence` array empty. Item falls through to manual triage.
- Precedent citations: cite by `rule_ref` + outcome count. **Never** by `user_id`, `source_ref`, `authored_by`, or `username`. Worker SELECT FROM precedents must return aggregates only.
- Daily AI suspect scan writes to `ai_suspect_queue`. Never to watchlist directly. Human must explicitly promote.

### Cross-mod sync
- All shared state (auto-DR rules, parks, drafts, watchlist) in D1 with per-record mod attribution.
- Pull frequency: 5 min for shared rules. Instant for in-flight actions.
- **NEVER** > 5-minute client-side caches on shared data (a 6-hour cache shipped in v7 caused 6-hour rule propagation lag).
- Every push path logs success AND failure (no silent `catch(e){}`).

### Privacy
- No PII collected. Site-public content only.
- Privacy policy at `<worker>/privacy` as `text/plain`. Embed PRIVACY.md content in the worker.
- Page-localStorage NEVER mirrors sensitive state under flag-on `platformHardening`.

### Code hygiene
- Forward slashes in URL paths. `'\path\to'` is a JS escape-sequence bug — backslashes get stripped, route matching fails silently. Grep the codebase for `'\\` in router/case strings.
- ONE storage key per concept. Don't ship a feature that reads from `getSetting('modToken')` alongside one that reads from `getSetting('workerModToken')`.
- `manifest.json` version AND `const VERSION` in modtools.js bumped together. Debug snapshots use the const; if it lags, every diagnostic looks wrong.
- Multi-step storage writes: `await setSetting()` (returns Promise) — not fire-and-forget.

### PowerShell scripts (Commander runs them)
- BOM + ASCII only (Windows PS 5.1 misparses UTF-8-no-BOM with non-ASCII).
- No `<placeholder>` syntax (PS treats `<` as redirection).
- 4-step mandatory ending: structured report → log buffer to clipboard → E-C-G beep (659/523/784) → Read-Host pause.
- Parse-check both `powershell.exe` (5.1) AND `pwsh.exe` (7.x) before declaring ready.

---

## BUILD ORDER

Execute these phases sequentially. Each phase ends with a green smoke test from your side. **Do not move to phase N+1 until phase N is verified live.**

### Phase 1 — Worker foundation (2 hr)
1. Create CF account artifacts: D1 (`gaw-audit`), KV (`gaw-mod-kv`), R2 (`gaw-mod-evidence`), Workers AI binding.
2. `wrangler.jsonc` with bindings, vars, cron `*/5 * * * *`, `compatibility_flags: ["nodejs_compat"]`.
3. Migrations 001-014 (`migrations/*.sql`). Apply via `wrangler d1 execute gaw-audit --remote --file=...`.
4. Worker skeleton: `/health`, `/version`, `/audit/log`, `/audit/query`, `/profiles/{read,write}`, `/mod/whoami`.
5. Auth helpers: `checkModToken` (async, D1-aware + legacy `MOD_TOKEN` secret fallback), `checkLeadToken`, `lookupModFromToken`.
6. CORS preflight handler returning `new Response(null, {status:204, headers:CORS})` — **NOT** `jsonResponse({},204)`.
7. Body-size cap helper `safeJson(request, maxBytes)`.
8. Rate-limit primitives: in-memory `rateLimitWrite` + KV-backed `aiMinuteCheck`.
9. Deploy. `curl /health` → 200. `curl /mod/whoami` with bogus token → 401 `token_invalid`.

### Phase 2 — Extension scaffold (3 hr)
1. `manifest.json` MV3, host_permissions for `*.greatawakening.win` + your worker only.
2. `popup.{html,css,js}` — settings panel, canonical token entry field, save button (writes to `gam_settings.workerModToken`, returns Promise).
3. `background.js` — token vault in `chrome.storage.session`, message relay for `setTokens` / `tokensStatus`, periodic alarm refresh.
4. `modtools.js` skeleton:
   - `K_SETTINGS = 'gam_settings'` const
   - `SECRET_SETTING_KEYS = new Set(['workerModToken', 'leadModToken'])`
   - `_secretsCache = {}` + `preloadSecrets()` populates from chrome.storage.local at init
   - `setSetting(key, value)` returns Promise for secret keys; updates cache synchronously THEN persists async
   - `getSetting`, `getModToken`, `getLeadToken`
   - `workerCall(path, body, asLead, extSignal)` with 15s timeout, AbortController, 401 telemetry
   - `_recordNetCall()` ring buffer (50 entries) for debug snapshot
   - status bar build, drawer scaffolding, snack helper
5. Verify: load unpacked, popup → enter token → /mod/whoami round-trips with the token in cache + storage.

### Phase 3 — Mod actions (3 hr)
1. Ban / Remove / Warn / Note / Flair / Lock — submit via GAW DOM with native CSRF.
2. Audit log push to `/audit/log` after every action.
3. Death Row queue: 72-hour delay default; idempotency via `(target, dr_scheduled_at)` unique index; verification before fire.
4. Modmail enhance: inline ban/unban buttons, claim-on-open, sender intel popover.

### Phase 4 — Cross-mod sync (2 hr)
1. `/profiles/{read,write}` — single source of truth for shared rules under reserved username `__gaw_team_patterns__`.
2. `pushPatternsToCloud` — debounced 10s, log success AND failure.
3. `pullPatternsFromCloud` — every 5 min via `setInterval`, `_cloudProfilesCache = null` BEFORE each fetch (no stale 6-hr cache).
4. Drafts (`/drafts/{read,write,handoff,list}`) — 2-second debounce sync, 24h retention.
5. Modmail claims (`claims` table, 10-min TTL, "Mod X on this" badges).
6. Precedents — append-only `/precedent/mark`, lookup by signature, never by user.

### Phase 5 — Intel Drawer (2 hr)
1. v7.0 state grammar: subject = {kind: User|Thread|Post|QueueItem, id, ctx}.
2. AI recommendation panel — calls `/ai/next-best-action` with subject context, displays under flag.
3. Section composer (6 sections: identity, history, drafts, AI, precedent, action), feature-flagged.

### Phase 6 — Team productivity (2 hr)
1. **Park button** — drawer + worker `/parked/{create,list,resolve}`, Discord DM to original parker on resolve.
2. **Shadow Queue** — badge on queue rows showing AI pre-decision; **two-key commit** (Space → expand evidence + arm Enter → Enter → commit). Schema: `{decision, confidence, evidence[], counterarguments[], rule_refs[], prompt_version, model, provider, rules_version, generated_at}`. Suppress badge if `confidence<0.85` OR `evidence.length===0`.
3. **Precedent-citing ban draft** — drawer button → fetches precedent count by rule, drops citation into ban-message draft. NO user IDs in citation.
4. **AI suspect queue cleanup** — replace direct watchlist write with `enqueueAiReview(...)` → `ai_suspect_queue` table. Lead reviews via dedicated panel.

### Phase 7 — Discord bridge (1.5 hr)
1. `handleDiscordInteractions` with **ed25519 signature verification** using `DISCORD_PUBLIC_KEY` (don't ship without — Discord blocks unsigned).
2. Slash commands registered via `/bot/register-commands` (lead-token gated): `register`, `ask`, `g3`, `l3`, `chat`, `scope`, `propose`, `vote`, `finalize`, `status`, `help`.
3. `processChat` — Claude bridge with identity (`bot_mods` → username), thread memory (`bot_chat_history`, 24h), recent-actions context (`buildModActivitySummary`), strict-prefer fallback chain. KV-backed daily cap (50/mod/day).
4. `processScope` — Claude scopes a feature → JSON `{reflected_summary, tech_spec, acceptance, risks, poll_options, effort_estimate}` → INSERT into `bot_feature_requests` → embed with poll buttons.
5. `processPropose` / `processVote` / `processFinalize` — feature pipeline ending in DM-to-Commander with Claude-Code-ready prompt.
6. `notifyCommander(env, {event, severity})` — Discord webhook for 5xx alerts; rate-limited (max 1/min/error_signature).

### Phase 8 — Mod Chat (1 hr)
1. Migration 015 `mod_messages`.
2. Endpoints: `/mod/message/{send,inbox,mark-read,unread-count,mods-list}` — all per-mod-token gated, 30 msg/min rate limit per token.
3. Status bar 💬 icon with unread badge. Click → side panel with conversation list + composer.
4. Polling: 30s when closed, 10s when open. Stop polling when `document.visibilityState === 'hidden'`.
5. Optimistic send — append to UI immediately, rollback on 4xx/5xx.
6. XSS-safe — all dynamic content via `textContent`. `innerHTML` only for static SVG/scaffolding.

### Phase 9 — Worker hardening (1 hr)
1. Migration 016 — hot-path indexes: `actions(target_user|action|mod|ts)`, `precedents(action, marked_at)`, `bot_feature_requests(status)`.
2. Migration 017 — `discord_retry_queue` table + partial indexes for drain query.
3. AI fallback chain helper `aiCallWithFallback(env, {prefer, system, messages})`.
4. KV per-mod minute rate limit on AI routes (20/min/mod, key `ai_minute_<id>_<minute>`, TTL 120s).
5. Circuit breakers in KV (`cb_state_<provider>`).
6. `discordWebhookSend()` wrapper — enqueues retry on non-2xx.
7. Cron drainer for retry queue (25/tick, exp backoff, abandon at 6).
8. Body-size caps via `safeJson()` on all write endpoints.

### Phase 9.5 — Firehose UI (NEW, ~3 hr)

The worker side of firehose (ingest + FTS5 search + per-user timeline endpoints) is in Phases 1-2. The CLIENT side that actually surfaces it has been the perpetual gap. Build at least these in v1:

1. **Activity Timeline panel in Intel Drawer** — calls `/gaw/user/<u>/timeline`, renders the user's last 50 posts + 100 comments inline. Single biggest mod-productivity win.
2. **Search panel** in Mod Console — query input, scope toggle (posts / comments / both), date range, click-through to GAW URLs.
3. **Removal time-machine** — when GAW shows `[removed]`, ModTools enhancer fetches the captured `body_md` and shows a "View captured content" expand link.

See `docs/FIREHOSE.md` for the full 10-feature roadmap. Ship at least the first 3 alongside the ingest, or you'll have a buried treasure no mod uses.

### Phase 10 — Onboarding + ops (1 hr)
1. PowerShell scripts (BOM+ASCII, dual-engine parse-clean, 4-step ending):
   - `scripts/provision-mod-token.ps1` — single mod
   - `scripts/provision-all-mods.ps1` — batch
   - `scripts/test-cf-token.ps1` — verify CF API token
   - `scripts/verify-v9.ps1` — acceptance gates
2. Privacy policy at `/privacy`: embed PRIVACY.md as a JS template-string constant, serve as `text/plain` with `cache-control: public, max-age=1800`.
3. `docs/INCIDENT_RUNBOOK.md` — D1 unreachable, lead token rotation, AI provider down, mass-ban rollback, Discord bot dead, worker quota exhausted.
4. CWS submission bundle in `docs/CWS-SUBMISSION-v9.0.0.md` — listing copy under 130 chars short, ≤16k chars detailed, all 5 permission justifications, data-usage answers, screenshot shot-list.
5. README.md with architecture diagram + install + deploy instructions.
6. `.gitignore` blocking `*.token`, `*-token-*.txt`, `dist/`, `*.zip`, `node_modules/`, `.wrangler/`, `logs/`, `*.bak`.

---

## QUALITY GATES (RUN BETWEEN PHASES)

- `node --check` clean on every JS file modified
- D1 migration applied + verified via `SELECT name FROM sqlite_master WHERE name='<table>'`
- Live worker `/health` 200; `/mod/whoami` 401 with bogus token; 200 with real token
- Every new endpoint smoke-tested via curl from your side, recording status + latency in the report
- Token persistence verified across browser restart (set, kill browser, restart, /mod/whoami still 200 without re-entering)
- `git grep "case '\\\\"` and `git grep "'\\\\.*\\\\.*'"` return zero hits in router files
- `git grep "getSetting('modToken')"` returns zero hits
- Manifest version === const VERSION (one source of truth)
- All ZIP-bound files use forward-slash paths (Chrome rejects backslashes)

## ANTI-PATTERNS (DO NOT DO)

- ❌ "Smart" gate logic on the token modal (v8.2.1 → v8.2.5 → v8.3.1 → v8.3.4 saga). **The right design is one storage check, one decision; no flags, no kill switches, no debounces.**
- ❌ Auto-trigger removal as a fix (v8.3.1 broke first-boot UX for new mods)
- ❌ Multiple storage keys for the same concept (`modToken` vs `workerModToken` cost an entire firehose)
- ❌ Silent `catch(e){}` on push paths (always log; consider snack)
- ❌ Reading user identity from DOM (use `lookupModFromToken`)
- ❌ Direct external API calls from extension (always proxy via worker)
- ❌ `'\\path\\to'` route patterns (forward slashes only — backslashes silently strip in JS string literals)
- ❌ Bare `setInterval` in feature code (use MasterHeartbeat orchestrator)
- ❌ `jsonResponse({}, 204)` for OPTIONS (forbidden body; use `new Response(null, ...)` — this caused error-1101 across the worker for a day)
- ❌ Same-tab-only dedup on fire-once actions (Death Row N-fold ban duplication when N tabs open)
- ❌ Including secrets in any debug snapshot, log, or telemetry payload
- ❌ Bumping `manifest.json` without bumping `const VERSION` in modtools.js (debug snapshot version field lies)
- ❌ Interactive `wrangler secret put` paste in PowerShell (clipped to 1 char of garbage on Windows; always tempfile-pipe)
- ❌ Shipping firehose ingest without firehose UI (data goes nowhere mods can use)
- ❌ Single CWS account if multiple devs (Group Publisher tarpit — wait until needed)
- ❌ Asking the user to verify what curl/wrangler can verify from your side
- ❌ Going nuclear when targeted is enough (v8.3.1 deleted four trigger sites when only one needed surgery)

## REPORTING DURING BUILD

Every phase ends with a brief structured report:
```
PHASE N — <name>
PASS: <items, with one-line evidence each>
FAIL: <items + cause + remediation plan>
DEPLOY: <worker version ID, ZIP path/sha, git commit>
```

When a phase fails verification, fix it before proceeding. Don't accumulate tech debt across phases.

---

**This brief is the entire project. Build it.**
