# AGENT_BRIEF — read this FIRST

Audience: assistant agents picking up GAW ModTools. Not human-friendly. Terse on purpose.

## Version state (2026-05-08 LATE / 2026-05-09 EARLY)

```
extension     v10.4.0  D:\AI\_PROJECTS\dist\mod-tools dist\
                       ZIP: dist/gaw-modtools-chrome-store-v10.4.0.zip (388.5 KB)
                       sha256: f1218343dcec8b840f0e6ef7e767fb4fe1b0fd422a3212f861bd29617a357caf
worker        v9.5.0   deploy 9e5ef888-2b41-4dfc-9268-41754227b27d
                       (handleVersion dynamic — returns deployed_version from
                        WORKER_VERSION constant)
D1 migrations 001–031  applied to gaw-audit
LIVE PROBE    {"deployed_version":"9.4.8","version":"9.4.8","available_version":"8.0.0",...}
              `available_version` is from version.json on GitHub (separate concept).
```

## v10.3 → v10.4 ship notes (2026-05-08 PM, 39+1 ralph synthesis)

This was a 39-agent ralph loop (Opus CTO + 39 Sonnet agents in parallel). Outputs
captured under `docs/V10_FIREHOSE/`, `docs/V10_DISCORD/`, `docs/V10_MULTILEAD/`,
`docs/V10_PANEL/`, `docs/V10_BUGS/`, `docs/V10_V11/`, `docs/V10_FRONTEND/`,
`docs/V10_RALPH_SHIPMASTER.md`, `docs/HARVEST_72H_2026-05-08.md`,
`docs/AUTH_CARRYOVER_RCA_2026-05-08.md`, `docs/FORCE_REHYDRATE_AUDIT_2026-05-08.md`,
`docs/V10_RALPH/STALE_DOC_AUDIT.md`.

**v10.3 ships (2026-05-08 PM)** — auth & cleanup:
- **Auth wizard fix** (popup.js): wizard now reads SW vault via `__tokensStatus()` instead of raw `chrome.storage.local`. Closes the catsfive screenshot bug — wizard popped up for already-authed leads after Drive Desktop sync because session/local stores temporarily disagreed.
- **Force re-hydrate REMOVED** (popup.html): the popup button was a no-op since v9.2.1 (`chrome.storage.onChanged` listeners auto-mirror in milliseconds). The auth-fail-banner version is kept — that one fires in the right context.
- **Mod Chat panel 90% width** (modtools.js:13507): `data-width="lg"` now `90vw` with `max-width:1400px`. Commander asked 3 times.
- **Triage Console → "Manage /users"** (popup.html): rename + 👥 icon + descriptive title=.
- **DRILL // prefix removed** (popup.css): the `::before` pseudo was Bloomberg decoration on top of the working `#pop-drill-title` JS-driven title. Noise eliminated.
- **Export CSV → "Export rows"** (popup.html): with descriptive title= explaining what it does.
- **Ban macro propagation FIX** (modtools.js:7340-7353 + 7548-7565): two bugs — custom macro save didn't write body to textarea; violation change clobbered active macro. Both fixed by ban-macro-bug agent.
- **Worker `/version` dynamic** (worker v9.4.8): returns `deployed_version` from `WORKER_VERSION` constant + `available_version` from GitHub separately. Was returning hardcoded "8.0.0".

**v10.4 ships (2026-05-08 LATE)** — UI grid + visual polish:
- **Action buttons 4-column grid** (popup.css + popup.html): Triage / Queue / Ban / GAW go from full-width single-column-stack to icon-above-uppercase-label 4×1 grid with 44px min-height. Closes Commander's "buttons that are mostly negative space" complaint. Native `title=` carries rich tooltip; custom anticipating-tooltip JS lands v10.5.
- **User-info hover bounds clip fix** (modtools.js): two bugs — async `renderTooltipIntel` rewrote card height without re-positioning (overflowed bottom edge); vertical-flip branch skipped horizontal clamp on shifted-right path. Both fixed.
- **--bb-warn CSS variable** (popup.css): promoted from hard-coded `#f0a040` at 6 sites to canonical `--bb-warn` token. Plus `--bb-purple` companion. Sets stage for visual-consistency Wave 2.
- **Gradient header → flat + 2px amber border** (popup.css): popup header + drill-head both used `linear-gradient` violating the no-gradient rule. Replaced with flat panel + amber bottom border.
- **Stale-doc audit** (`V10_RALPH/STALE_DOC_AUDIT.md`): 35 drift items found across FEATURES_MATRIX, AGENT_BRIEF, BACKLOG, HANDOFF, PROJECT-STATUS. PROJECT-STATUS to be archived (7 major versions stale).

## v10.0 → v10.2 ship notes (2026-05-08 PM)

Three coordinated mod-impact ships landed in one session:

**v10.0 — Onboarding Recovery cluster:**
- Brave Shields detection + amber rescue banner + popup-paste fallback path
- `gam_pending_invite` chrome.storage.local backup mirror (5-min TTL) survives extension reload mid-claim
- Force re-hydrate duplicate removed (#maintRehydrateAlias deleted; canonical button is #rehydrateBtn at top)
- Token field 3-dimension differentiation: outline-key TEAM (amber) vs purple-tinted LEAD field with left rail and amber-team-label

**v10.1 — Polish kill:**
- Bar-icon tooltip Y-gap 6px → 14px (closes HANDOFF D1)
- Maintenance pareto cut: 4 mod-friendly buttons visible, 6 dev-jargon ones folded into `<details>` accordion (closes advocate groan #1)
- Two-mods-same-machine collision guard: `__noteWhoami` detects identity change after whoami probe and surfaces purple modal (popup.js)

**v10.2 — Workflow / cross-talk:**
- Dock toggle: emoji `⬅️/➡️` → text `DOCK: L` / `DOCK: R` + 4s undo toast (closes advocate groan #4)
- Auth-fail banner gains "Open ModTools popup" button via `chrome.action.openPopup()` cross-talk (Chrome 127+); falls back to snack on older Chrome
- New background.js RPC handler `openPopup` for content-script → popup direct-open
- Discovered A2 (modmail macros in Mod Console Message tab) was already shipped v9.8.0; matrix was stale

## Project layout

```
D:\AI\_PROJECTS\modtools-ext\        ← git repo (master)
  modtools.js          ~21k lines content script
  background.js        2k lines SW (token vault, RPC dispatcher, alarms)
  popup.html .js .css  popup UI
  manifest.json
  scripts/             PowerShell: build, install, recover, backfill
  docs/                FEATURES_INDEX.md, BACKLOG.md, this file
D:\AI\_PROJECTS\cloudflare-worker\   ← NOT in git (Commander deferred)
  gaw-mod-proxy-v2.js  ~12k lines, ~120 endpoints
  migrations/*.sql     001–029
  wrangler.jsonc       vars; secrets dashboard-managed
D:\AI\_PROJECTS\dist\                ← build output (auto-extracted)
```

## Boot commands

```bash
# Extension build (auto-extracts to dist/mod-tools dist/)
pwsh -File D:\AI\_PROJECTS\modtools-ext\scripts\build-zip.ps1 -NoPause

# Parse-check before any commit
node --check D:\AI\_PROJECTS\modtools-ext\modtools.js
node --check D:\AI\_PROJECTS\modtools-ext\background.js
node --check D:\AI\_PROJECTS\modtools-ext\popup.js

# Worker deploy (always parse-check first)
cd D:\AI\_PROJECTS\cloudflare-worker
node --check gaw-mod-proxy-v2.js
npx wrangler deploy

# D1 migration apply
npx wrangler d1 execute gaw-audit --remote --file=migrations/NNN_xxx.sql

# Probe tokens (catsfive lead)
TOKEN='Ts2wPWowho27L2AlaMAYWncIlEzFQzZDWyZbQAyw6whUUl7k'
W='https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev'
curl -sS "$W/mod/whoami" -H "x-mod-token: $TOKEN" -H 'origin: https://greatawakening.win'
```

## Invariants — break these and Commander loses time

| Invariant | Where | Why |
|---|---|---|
| `manifest.json.version` AND `modtools.js:34 const VERSION` bump in lockstep | both files | popup reads manifest, status bar reads VERSION; drift is silent |
| Worker `lookupModFromToken` is dual-mode (hash-first → plaintext fallback) | gaw-mod-proxy-v2.js ~982 | v9.2.3 lesson; plaintext-only broke 81 endpoints |
| `lookupModFromToken` reads ONLY `x-mod-token` (NOT `x-lead-token`) | same | Vanguard W-C-3; lead env-secret can't double as mod identity |
| `appendAuditAction` MUST hard-fail on state-mutating writes | rotate, claim-rotation, mod_msg.delete, precedent.delete, import-tokens-from-kv, rotation-invite, claim/release | Vanguard W-H-5; never `try/catch{}` around audit append in privileged paths |
| `__applyLeadGate()` is the canonical lead-only popup gate | popup.js | other gates (`hasTeamToken`, `workerModToken`) leak lead UI to non-leads |
| `safeError(e, code)` wraps 500 responses | gaw-mod-proxy-v2.js ~796 | sanitizes D1 exceptions that can include bound parameters incl. tokens |
| `closeAllPanels` selector list includes ALL backdrop variants | modtools.js ~5660 | orphan blur layers were the recurring "icons stuck behind blur" bug |
| Z-index hierarchy preserved | GAM_CSS comment block | popovers > modals > backdrop; chat-panel rule scoped to `[data-dock]` so Mod Console modal isn't pinned below backdrop |
| `scripts/build-zip.ps1` auto-extracts ZIP to `dist/mod-tools dist/` | scripts/build-zip.ps1 | Commander's "Load unpacked" reads from there; remove auto-extract → manual unzip every build |
| Audit chain `action` column is IMMUTABLE post-write | migration 028 + handleModBanConfirm | mutating action breaks the chain hash; use `correlated_action` |
| `MOD_TOKEN` plaintext fallback REMOVED from `checkModToken` | gaw-mod-proxy-v2.js ~480 | Vanguard W-C-1; never reintroduce |
| Token shape regex: `^[A-Za-z0-9_-]{32,256}$` + must contain ≥1 letter ≥1 digit, no leading/trailing dash/underscore | background.js ~151 | enforced on every storage write + setTokens RPC |
| `EXTENSION_ID_ALLOWLIST` env-var GATE on `/admin/*` paths | gaw-mod-proxy-v2.js ~9466 | currently empty; rebuild lock-down when extension publishes to CWS |
| Migration 026 boundary id check on `entry_hmac IS NULL` | handleAuditVerify | reject NULL hmac when id ≥ boundary |
| AI proxy daily caps via KV: 500/mod + 5000 global | aiPreflight() | Vanguard W-C-4; x-discord-id bypass already closed |

## Decision tree

```
new commander message
├── pure UI/UX feedback → BACKLOG.md tier 2; pick smallest scope; ship
├── security report     → §0 filter noise; confirm real, fix, ship
├── new feature ask     → match to BACKLOG.md tier 3 OR brainstorm; clarify scope before spawning
├── vague "make better" → pick top of BACKLOG.md tier 2; ship
└── bug report          → reproduce; root-cause; ship; never ask "what about your end?"
```

## Eliminate the Meatbag (~/.claude/CLAUDE.md §10)

Before "you should run X / verify Y / I recommend N" — ask: can I do this myself? If yes, do it.
- CLI / file edits / scripts / probes / migrations / deploys / doc updates → all assistant scope
- ONLY carve outs: physical UI clicks attended in real-time, business judgment, real-time credentials only Commander holds (e.g. `LEAD_MOD_TOKEN` value lives in CF dashboard)

## Worker auth model (cheat sheet)

| header | meaning | who reads |
|---|---|---|
| `x-mod-token` | per-mod identity (hash-first dual-mode lookup) | every authed endpoint |
| `x-lead-token` | env-var secret for `checkLeadToken` | `/admin/audit/verify`, `/admin/health/extended`, some legacy admin paths |
| `is_lead` flag on `mod_tokens` row | tier marker | every `/admin/*` after Vanguard sweep prefers this |
| `chrome-extension://<id>` Origin | strict-path gate | `EXTENSION_ID_ALLOWLIST` must contain id; currently empty |
| no Origin + lead-token | direct curl admin | post-PR2-H-3, requires lead-token; otherwise 403 |

## What NOT to repeat

The session that produced v9.3.0 → v9.4.6 already shipped:
- 30+ Vanguard Round 1 findings
- 25+ Vanguard Round 2 findings
- 12-iteration ralph (UI/UX 200% pass)
- 4-agent parallel build for stats drill-down + bug-report E2E + popup tightening + broom mode + site-CSS top padding
- HMAC backfill endpoint (invocation deferred until Commander runs the .ps1 wrapper)

If something seems broken in those areas, it's a fresh regression. Check git blame from `02736e7` onward, not the historical context.
