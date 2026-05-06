# AGENT_BRIEF — read this FIRST

Audience: assistant agents picking up GAW ModTools. Not human-friendly. Terse on purpose.

## Version state (2026-05-06)

```
extension     v9.5.0   D:\AI\_PROJECTS\dist\mod-tools dist\ (zip 313.7KB sha256 3b5bdef4…)
worker        v9.4.6   deploy 618ee6f4-d23c-4e9d-b877-e3a36364d743
D1 migrations 001–029  applied to gaw-audit
in-flight     autonomous-maint + Llama 3 (sub-agent ade883bfeaa7eab88 building)
                                          will add migration 030 + /maintenance/report
```

## Project layout

```
D:\AI\_PROJECTS\modtools-ext\        ← git repo (master)
  modtools.js          17.5k lines content script
  background.js        2k lines SW (token vault, RPC dispatcher, alarms)
  popup.html .js .css  popup UI
  manifest.json
  scripts/             PowerShell: build, install, recover, backfill
  docs/                FEATURES_INDEX.md, BACKLOG.md, this file
D:\AI\_PROJECTS\cloudflare-worker\   ← NOT in git (Commander deferred)
  gaw-mod-proxy-v2.js  ~9k lines, ~120 endpoints
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
| Worker `lookupModFromToken` is dual-mode (hash-first → plaintext fallback) | gaw-mod-proxy-v2.js ~764 | v9.2.3 lesson; plaintext-only broke 81 endpoints |
| `lookupModFromToken` reads ONLY `x-mod-token` (NOT `x-lead-token`) | same | Vanguard W-C-3; lead env-secret can't double as mod identity |
| `appendAuditAction` MUST hard-fail on state-mutating writes | rotate, claim-rotation, mod_msg.delete, precedent.delete, import-tokens-from-kv, rotation-invite, claim/release | Vanguard W-H-5; never `try/catch{}` around audit append in privileged paths |
| `__applyLeadGate()` is the canonical lead-only popup gate | popup.js | other gates (`hasTeamToken`, `workerModToken`) leak lead UI to non-leads |
| `safeError(e, code)` wraps 500 responses | gaw-mod-proxy-v2.js ~762 | sanitizes D1 exceptions that can include bound parameters incl. tokens |
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
