# Stale Features & Tech-Debt Audit (v9.0.2)

**Last updated:** 2026-05-04
**Auditor:** Sonnet Ralph 9x agent (claude-sonnet-4-6)
**Scope:** modtools.js (~16,756 LOC), popup.js (~1,342 LOC), background.js (~508 LOC), worker/gaw-mod-proxy-v2.js (~7,972 LOC)

---

## Summary

9 iterations across all audit dimensions found **23 findings**: 0 critical, 5 high, 8 medium, 6 low, 4 trivial. The rollout is safe to proceed -- no item here breaks existing production behavior. The dominant theme is the GitHub JSON storage layer (flags.json, profiles.json, version.json) being fully superseded by D1 + KV but still running in parallel; and the v5.0-Phase-1 RPC migration that is 50% complete with ~65 legacy `workerCall`/`workerFetch` sites still unreachable by the named-RPC framework.

---

## Critical (rolls back rollout)

*No items at this severity level.*

---

## High (next sprint)

### H1: GitHub JSON as the only backing store for flags.json and profiles.json

- **Name:** GitHub-backed flags/profiles with no D1 equivalent
- **Location:** `worker/gaw-mod-proxy-v2.js` lines 878-925 (`handleFlagsRead`, `handleFlagsWrite`, `handleProfilesRead`, `handleProfilesWrite`); lines 2337, 2372 (called again from within delta/sniper enrichment)
- **Severity:** High
- **Why it's stale:** Every call to `/flags/read`, `/flags/write`, `/profiles/read`, `/profiles/write` round-trips to the GitHub Contents API (read + compare + write-back with SHA). There is no D1 table for either dataset. At 14 mods writing concurrently, the `existing.sha` optimistic-lock CAS will produce 409 conflicts; GitHub's secondary rate limit (5,000 requests/hr per token) will be hit under normal rollout load. D1 has `gaw_users` (firehose) but no `mod_flags` or `mod_profiles` table.
- **Recommended fix:** Add migration `020_mod_profiles_and_flags.sql` with `mod_profiles(username TEXT PK, data_json TEXT, updated_at INTEGER)` and `mod_flags(id INTEGER PK AUTOINCREMENT, username TEXT, mod TEXT, severity TEXT, reason TEXT, ts INTEGER)`. Rewrite the four handlers to use `env.AUDIT_DB`. Tombstone the GitHub path with a 30-day read-migration shim that pulls the existing JSON file once into D1 on first write.
- **Blast radius:** Only these four worker endpoints. The GitHub JSON files become read-only historical artifacts. GITHUB_PAT still needed for `/version` and bug-report dispatch, but can be scoped to a separate narrower token.
- **Sprint estimate:** 2 days

---

### H2: `seen:*` KV keys duplicate data already in `gaw_users` D1 table

- **Name:** Duplicate user-seen tracking in KV vs D1
- **Location:** `worker/gaw-mod-proxy-v2.js` lines 2220-2260 (`handleProfilesSeen`, `handleProfilesSeenList`); lines 2356-2361 (sniper enrichment reads KV `seen:` list alongside D1); modtools.js lines 14402-14445 (bulk `/profiles/seen` push every page load)
- **Severity:** High
- **Why it's stale:** The `seen:<username>` KV key stores `{username, lastSeenAt, pageHint}` with 90-day TTL. The D1 `gaw_users` table has `first_seen_at`, `last_seen_at`, `last_updated` columns populated by the firehose ingest. Both are written for every user the content script sees. KV `list({ prefix: 'seen:', limit: 500 })` + N individual `get()` calls (lines 2357-2361) is O(N) KV reads per sniper enrichment pass; at 1,000+ known users this is expensive and redundant.
- **Recommended fix:** Replace `/profiles/seen` write path with a direct `gaw_users` upsert. Replace the `seen:` KV list scan in sniper enrichment with a D1 `SELECT` against `gaw_users`. Gate the transition on `004_firehose` migration presence (already checked at line 986). Expire existing `seen:` keys naturally; no active delete needed.
- **Blast radius:** `/profiles/seen`, `/profiles/seen/list`, and the sniper enrichment scan. The client-side `workerCall('/profiles/seen', ...)` calls in modtools.js lines 14402/14445 need their endpoint target swapped; the payload shape is identical.
- **Sprint estimate:** 1 day

---

### H3: `workerFetch` generic relay -- 65 unmigratable call sites still using the deprecated path

- **Name:** Legacy `workerFetch` / `__legacyWorkerCall` relay (v5.0-Phase-1 incomplete)
- **Location:** `background.js` lines 203-246 (`workerFetch` handler, emits deprecation warning per call); modtools.js line 14120-14136 (dispatching `workerCall` falls through to `__legacyWorkerCall` when flag is off); modtools.js ~67 `workerCall()` call sites; background.js `ALLOWED_ENDPOINTS` list (line 33-39)
- **Severity:** High
- **Why it's stale:** Every `workerCall()` invocation in the content script that does NOT resolve via the flag-on `workerCallRelay` path hits the legacy `workerFetch` generic relay, which emits `[v5.0/Phase-1 deprecated] workerFetch path=...` console warnings. The `ALLOWED_ENDPOINTS` allowlist (lines 33-39) is missing critical endpoints the content script actually calls: `/flags`, `/profiles`, `/titles`, `/deathrow`, `/sniper`, `/precedent`, `/intel`, `/gaw`, `/ai/score`, `/ai/grok-chat`, `/ai/ban-suggest`, `/ai/conformity-check`, `/ai/shadow-triage`, `/parked`, `/mod/message`, `/modmail/enrich`. Any path not in `ALLOWED_ENDPOINTS` is blocked with `{ ok: false, error: 'endpoint not allowed' }` when the flag is on -- meaning flag-on mode is incomplete for most features.
- **Recommended fix:** Phase 1 completion: for each unregistered endpoint, add a named RPC handler to `background.js:RPC_HANDLERS` that calls `_rpcWorkerCall`. The pattern is already established (`modAuditLog`, `modSearch`, etc.). Once all ~65 sites have an RPC equivalent, flip the v7.2 hardening flag to default-on. The `ALLOWED_ENDPOINTS` list and `__legacyWorkerCall` can then be deleted.
- **Blast radius:** This is the entire v5.0 auth hardening project. Incomplete migration means the security goal (tokens never touch page-side JS) is not fully achieved. No production regression risk from leaving it as-is; the legacy path still works.
- **Sprint estimate:** 3-4 days (full sweep)

---

### H4: popup.js uses raw `fetch()` directly to worker instead of RPC

- **Name:** popup.js raw-fetch bypass of background.js secret vault
- **Location:** `popup.js` lines 448, 567, 625, 735, 774, 922, 1032, 1093 (8 direct `fetch(WORKER_BASE_POPUP + '/...')` calls)
- **Severity:** High
- **Why it's stale:** popup.js reads tokens from `chrome.storage.local` itself and attaches them as headers in raw `fetch()` calls. The v7.2 Platform Hardening spec moved token custody to the background service worker's secret vault (background.js `secretCache`). Popup is explicitly `RPC_CALLER_POPUP` in background.js's framework but 8 endpoints bypass it entirely. The `authRotateSelf` and `authClaimInvite` RPC handlers already exist in background.js for the rotation endpoints -- popup ignores them. This deviates from the v5.0 token isolation design.
- **Recommended fix:** Replace all 8 `fetch()` calls in popup.js with `chrome.runtime.sendMessage({ type: 'rpc', name: 'authXxx', args: {...} })`. The corresponding RPC handlers either already exist or need a one-liner addition to `RPC_HANDLERS`. Removes direct token reads from popup.js.
- **Blast radius:** popup.js only. No content-script or worker change needed. Risk: if background SW has been evicted and `loadSecrets()` hasn't re-run, the RPC path needs the SW warm-up to complete before responding -- already handled by `loadSecrets()` guard in `_rpcWorkerCall`.
- **Sprint estimate:** 1 day

---

### H5: `/ai/conformity-check` called by client but missing from worker router

- **Name:** Missing worker endpoint: `/ai/conformity-check`
- **Location:** `modtools.js` line 6617 (caller); `worker/gaw-mod-proxy-v2.js` -- no `case '/ai/conformity-check'` and no `handleAiConformityCheck` function anywhere in the file
- **Severity:** High
- **Why it's stale:** The conformity-check feature (deep analysis on user comments, sidebar AI analysis) calls `workerCall('/ai/conformity-check', ...)` which hits a 404 from the worker's default handler. The feature appears in the settings UI at modtools.js line 8197. Users who enable "Deep Analysis on Load" get silent 404 errors. This is an unimplemented feature stub that shipped with a broken wire.
- **Recommended fix:** Either (a) implement `/ai/conformity-check` in the worker (it would be nearly identical to `/ai/grok-chat` with a fixed conformity-analysis prompt), or (b) reroute the client call to `/ai/grok-chat` with the conformity prompt baked into the body, which already exists and works. Option (b) is 30-minute work.
- **Blast radius:** Deep Analysis / AI conformity sidebar. No other feature depends on this endpoint.
- **Sprint estimate:** 0.5 days

---

## Medium (within 2 sprints)

### M1: `version.json` read via GitHub API on every `/version` request

- **Name:** Worker /version endpoint reads version.json from GitHub on every call
- **Location:** `worker/gaw-mod-proxy-v2.js` lines 1003-1009 (`handleVersion`); `background.js` line 17 (`VERSION_JSON_URL` points to `raw.githubusercontent.com`); `background.js` lines 128-131 (alarm also directly fetches the raw URL, bypassing the worker)
- **Severity:** Medium
- **Why it's stale:** The worker's `/version` endpoint fetches `version.json` from the GitHub Contents API on every call (no caching). The background alarm (line 128) fetches the raw GitHub URL directly every 30 minutes rather than calling the worker's own `/version` endpoint. The version value is static per deploy; it should be an env var or hardcoded constant in the worker, not a live GitHub fetch. At 14 mods reloading simultaneously, this generates 14 GitHub API calls for a value that won't change until the next deploy.
- **Recommended fix:** Add `CURRENT_VERSION` as a Cloudflare env var (or hardcode it in the worker matching `manifest.json`). Return it directly from `handleVersion()`. Remove the `readGithubFile(env, 'version.json')` call. Background alarm should call `WORKER_BASE + '/version'` (already exists) rather than the raw GitHub URL -- this gives a single cached source of truth.
- **Blast radius:** Auto-update flow in background.js. No user-visible behavior change.
- **Sprint estimate:** 2 hours

---

### M2: Dual AI budget tracking -- in-memory `xaiDailyCounter` vs KV `bot:grok:budget` -- inconsistent across worker instances

- **Name:** Split AI budget counter (in-memory vs KV)
- **Location:** `worker/gaw-mod-proxy-v2.js` line 56 (`xaiDailyCounter`); lines 1018-1055 (`/ai/score` uses in-memory counter for xAI); lines 2877-2934 (`/modmail/enrich` uses KV `mm:grok:budget`); lines 3081-3090 (`/bot` commands use KV `bot:grok:budget`); lines 6458-6460 (`/ai/shadow-triage` uses KV `bot:grok:budget`)
- **Severity:** Medium
- **Why it's stale:** `/ai/score` enforces its xAI daily cap via an in-memory variable (`xaiDailyCounter`). Cloudflare Workers spin up multiple isolates; each isolate has its own `xaiDailyCounter`. With 14 mods running concurrent sessions, the per-isolate counter underestimates real spend. The bot command paths and shadow-triage correctly use KV, which is shared across isolates. The inconsistency means the `BUDGET_XAI_CALLS_PER_DAY = 200` cap in `/ai/score` is not reliably enforced.
- **Recommended fix:** Move `/ai/score`'s xAI budget tracking to KV (`bot:grok:budget:<date>` or a new dedicated key), mirroring the pattern already used by the bot command paths. Keep the in-memory counter as a fast-path short-circuit (if in-memory says exhausted, skip KV check).
- **Blast radius:** `/ai/score` budget enforcement only. No user-visible change under normal load; matters at scale.
- **Sprint estimate:** 3 hours

---

### M3: `authGetMyDevices` and `authRevokeMyDevice` RPC handlers return stubs

- **Name:** Phase-3 device management stubs in production background.js
- **Location:** `background.js` lines 401-410 (`authGetMyDevices` returns `{ devices: [], stub: 'phase-3-pending' }`; `authRevokeMyDevice` returns HTTP 501)
- **Severity:** Medium
- **Why it's stale:** These handlers were scaffolded for a phase-3 device-enrollment system. They return stubs silently. If popup.js were to call them (it does not currently), the user would see an empty device list or a 501 error with no explanation. The stubs have no associated issue tracker reference or ETA.
- **Recommended fix:** Either (a) surface a "Phase 3 not yet available" message in the popup UI where devices would be shown, or (b) gate the entire device section in popup.html behind a feature flag until phase 3 ships.
- **Blast radius:** Popup device-management UI (not yet rendered in production). No content-script impact.
- **Sprint estimate:** 1 hour (gate the UI section)

---

### M4: `adminDisableMod` and `adminEpochBump` RPC handlers return HTTP 501

- **Name:** Phase-2 admin RPC stubs in production background.js
- **Location:** `background.js` lines 439-449 (`adminDisableMod` returns 501 "phase-2-pending"; `adminEpochBump` returns 501 "phase-2-pending")
- **Severity:** Medium
- **Why it's stale:** These were scaffolded as part of the v5.0 auth epoch / mod disable workflow. They silently fail. If a lead mod attempts to revoke a compromised mod's access via the popup, nothing happens -- the request succeeds client-side (200 from the background dispatcher) but returns `ok: false` with an opaque error. During a security incident (compromised mod token) this silent no-op is the worst possible outcome.
- **Recommended fix:** Until Phase 2 ships, surface these stub states clearly in popup.html: disable the "Revoke Access" button and show "Manual revocation via CF dashboard required -- Phase 2 pending." Mark the stub error with a severity=CRITICAL label in the popup instead of treating it like a generic error.
- **Blast radius:** Admin popup panel for mod management. No content-script impact.
- **Sprint estimate:** 1 hour

---

### M5: `chrome.storage.onChanged` sync for settings is single-listener, SuperMod-only

- **Name:** chrome.storage.onChanged cross-tab sync covers only SuperMod polling
- **Location:** `modtools.js` lines 16712-16718 (single `chrome.storage.onChanged` listener inside `SuperMod.init()`)
- **Severity:** Medium
- **Why it's stale:** The only `chrome.storage.onChanged` listener in the entire codebase is inside the SuperMod poller, and it only starts/stops the SuperMod polling interval when the user toggles the setting. There is no cross-tab sync for any other setting changes. If a mod changes `workerModToken` in the popup and then navigates in the content-script tab, `secretCache` in the background SW and the in-memory `__memStore` in the content script can diverge until the next page reload. The v7.2 hardening spec called for a broadcast-channel or `chrome.storage.onChanged` listener in the content script to re-hydrate `__memStore` on token change.
- **Recommended fix:** Add a `chrome.storage.onChanged` listener in the content script's main init that re-runs `hydrateFromChromeStorage()` on `area === 'local'` changes to `K_SETTINGS`. This is a one-line add in the existing hardening layer.
- **Blast radius:** Token updates propagate without page reload. No user-visible regression.
- **Sprint estimate:** 2 hours

---

### M6: `_diagLog` is fire-and-forget with no debounce -- O(N) chrome.storage writes

- **Name:** _diagLog writes chrome.storage.local synchronously per event
- **Location:** `modtools.js` lines 47-74 (`_diagLog` function, `chrome.storage.local.get + set` on every call)
- **Severity:** Medium
- **Why it's stale:** Every call to `_diagLog` triggers a `chrome.storage.local.get()` then a `chrome.storage.local.set()`. On modPost calls (which are already the hottest path) this generates a storage read+write per log line. During `/sticky` toggle storms (the exact scenario that triggered `_diagLog`'s creation at v8.6.5), dozens of log entries per second each cause their own storage round-trip. The in-memory ring buffer `_diagBuffer` is correct; the per-call persist is the bug.
- **Recommended fix:** Replace the per-call `chrome.storage.local.set` with a debounced flush: accumulate in `_diagBuffer`, then flush the whole buffer to `chrome.storage.local` at most once per 2 seconds. Existing read of `_DIAG_KEY` on page load still works. Total lines changed: ~10.
- **Blast radius:** Diagnostic log persistence. No behavior change. Reduces chrome.storage write pressure during sticky storms.
- **Sprint estimate:** 1 hour

---

### M7: `llama-3.1-8b-instruct` used as primary Workers AI model in 12 places vs `llama-3.3-70b` used in 2

- **Name:** Stale Workers AI model selection -- llama-3.1-8b preferred over newer 3.3-70b
- **Location:** `worker/gaw-mod-proxy-v2.js` lines 1038, 1187, 1241, 2801, 2945, 2958, 5588 (all use `@cf/meta/llama-3.1-8b-instruct`); lines 3037, 6147 (use `@cf/meta/llama-3.3-70b-instruct-fp8-fast`)
- **Severity:** Medium
- **Why it's stale:** `BOT_LLAMA` at line 3037 is defined as the 70b model and used in bot commands. All the non-bot AI paths (`/ai/score`, `/ai/grok-chat`, `/ai/ban-suggest`, modmail enrichment fallback) still hardcode `llama-3.1-8b`. This is inconsistent -- the bot gets the better model, the mod tools get the weaker one.
- **Recommended fix:** Unify by replacing all `@cf/meta/llama-3.1-8b-instruct` literals with the `BOT_LLAMA` constant (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`). Both models are free tier Workers AI. Search-and-replace, then test that the AI endpoints still return well-formed JSON.
- **Blast radius:** All AI endpoints that fall through to Workers AI as final provider. No cost change (both free). Quality improvement.
- **Sprint estimate:** 1 hour

---

### M8: `/ai/analyze` in `ALLOWED_ENDPOINTS` has no matching worker endpoint

- **Name:** Phantom ALLOWED_ENDPOINTS entry: /ai/analyze
- **Location:** `background.js` line 35; `worker/gaw-mod-proxy-v2.js` -- no `case '/ai/analyze'` and no `handleAiAnalyze` function
- **Severity:** Medium
- **Why it's stale:** The `ALLOWED_ENDPOINTS` allowlist in background.js includes `/ai/analyze` as a whitelisted relay target. No matching endpoint exists in the worker router and no client code calls it. It is dead configuration from a planned feature that was never built.
- **Recommended fix:** Remove `/ai/analyze` from `ALLOWED_ENDPOINTS`. If the feature is eventually built, add it back with its implementation.
- **Blast radius:** None. The endpoint does not exist; removing the allowlist entry cannot break anything.
- **Sprint estimate:** 5 minutes

---

## Low (when convenient)

### L1: Bug-report GitHub fallback lives alongside D1 path

- **Name:** Dual bug-report persistence path (D1 primary + GitHub Issues fallback)
- **Location:** `worker/gaw-mod-proxy-v2.js` lines 2045-2080 (`handleBugReport` inner GitHub block); lines 2073-2080 (creates GitHub Issue when `GITHUB_PAT` is present)
- **Severity:** Low
- **Why it's stale:** `handleBugReport` first writes to D1 `bug_reports` table (migration 011). Then, if `GITHUB_PAT` is configured, it also creates a GitHub Issue in the same repo used for flags/profiles. This double-write was intentional as a belt-and-suspenders approach. Now that D1 is reliable and the bug_reports table exists, the GitHub Issues creation is redundant and creates noise in the shared-flags repo.
- **Recommended fix:** Remove the GitHub Issues creation block (lines 2073-2080). The `BUG_REPORT_DISPATCH_REPO` webhook dispatch (lines 2045-2063) can remain if desired for Slack/Discord notifications. GITHUB_PAT scope can then be reduced to just the `version.json` path.
- **Blast radius:** Bug reports still land in D1. GitHub Issues feed goes dark. No mod workflow depends on the Issues feed (it was never surfaced in the dashboard).
- **Sprint estimate:** 30 minutes

---

### L2: `ALLOWED_ENDPOINTS` allowlist is missing 15+ endpoints that workerFetch legitimately needs

- **Name:** ALLOWED_ENDPOINTS whitelist out of date
- **Location:** `background.js` lines 33-39
- **Severity:** Low
- **Why it's stale:** The 9 entries in `ALLOWED_ENDPOINTS` cover only the endpoints present at the v7.2 Platform Hardening ship. Since then, 15+ new endpoints were added to the worker (`/flags`, `/profiles`, `/titles`, `/deathrow/sniper/*`, `/precedent/*`, `/intel/delta`, `/gaw/*`, `/ai/score`, `/ai/grok-chat`, `/ai/ban-suggest`, `/ai/shadow-triage`, `/parked/*`, `/mod/message/*`, `/modmail/enrich`). Any mod who flips `platformHardening` flag on gets 404/blocked responses from these endpoints.
- **Recommended fix:** Expand the list, or (better) replace the static allowlist with a dynamic one that validates the path against the worker's known endpoint table. The proper v9.1 fix is to complete the RPC migration (H3) at which point `ALLOWED_ENDPOINTS` and the legacy relay are deleted entirely.
- **Blast radius:** Flag-on path only; default flag is off in production.
- **Sprint estimate:** 1 hour (expanding list) or deferred to H3 completion

---

### L3: ARCHITECTURE.md and CODEMAP.md fetched from GitHub on every bot command invocation

- **Name:** Bot context docs fetched live from GitHub per call
- **Location:** `worker/gaw-mod-proxy-v2.js` lines 3118-3136 (grounding context loader); lines 3127, 3131 (raw.githubusercontent.com fetch inside the bot request handler)
- **Severity:** Low
- **Why it's stale:** Every Discord bot command that uses the `/bot/*` grounding path fetches ARCHITECTURE.md and CODEMAP.md from GitHub raw on each invocation. These docs are static between deployments. At the moment, this is 2 extra HTTP round-trips per bot command, each with ~200ms latency.
- **Recommended fix:** Cache the grounding context in KV with a 1-hour TTL (`gaw:grounding:arch` and `gaw:grounding:codemap`). On cache miss, fetch from GitHub and re-cache. The KV lookup adds ~10ms vs the current 200ms per document.
- **Blast radius:** Bot command latency only. No behavioral change.
- **Sprint estimate:** 1 hour

---

### L4: `gam_sniff_log` localStorage key has no page-domain migration shim

- **Name:** K_SNIFF localStorage key not covered by hardening migration
- **Location:** `modtools.js` line 731 (`K_SNIFF = 'gam_sniff_log'`); line 737-740 (reads/writes to localStorage); `PAGE_SAFE_KEYS` at line 1509 does NOT include `K_SNIFF`
- **Severity:** Low
- **Why it's stale:** `PAGE_SAFE_KEYS` only allows `gam_fallback_mode` and `gam_schema_version` on the page domain. `K_SNIFF` is in `SENSITIVE_KEYS` (line 1513), meaning under flag-on it routes through `__memStore`. However the explicit `localStorage.removeItem(K_SNIFF)` at line 1129 (debug snapshot clear) bypasses the adapter and writes directly to page localStorage. On flag-on installs, existing sniff data in page localStorage is orphaned.
- **Recommended fix:** Add a migration step in the schema migration sequence that copies any existing `gam_sniff_log` from page localStorage to the chrome.storage.local adapter, then clears the page-domain copy.
- **Blast radius:** Sniff log data only. No mod workflow depends on persisted sniff data (it's a debugging tool).
- **Sprint estimate:** 1 hour

---

### L5: 224 `// v5.x` version comments throughout modtools.js are mostly stale documentation

- **Name:** 224 inline v5.x version history comments
- **Location:** `modtools.js` (224 hits from `// v5.`) -- distributed throughout the file
- **Severity:** Low
- **Why it's stale:** These comments document behavior that was current during v5.x development. Many reference `BUG-1`, `H3`, `CRIT-02` etc. from audits long since resolved. They accumulate cognitive overhead for reviewers and make it harder to identify what is actually current behavior vs. historical context.
- **Recommended fix:** During any major refactor of a section, strip `// v5.x` changelogs older than 2 major versions (i.e., anything below v7.x can be removed). Do not do this as a standalone sweep -- it would create noise in git blame with no functional value.
- **Blast radius:** None.
- **Sprint estimate:** Opportunistic, no standalone sprint item

---

### L6: `admin/import-tokens-from-kv` endpoint name is misleading post-D1 migration

- **Name:** Misleading endpoint name: /admin/import-tokens-from-kv
- **Location:** `worker/gaw-mod-proxy-v2.js` lines 2162-2200 (`handleAdminImportTokensFromKv`); `background.js` line 36 (in `ALLOWED_ENDPOINTS`)
- **Severity:** Low
- **Why it's stale:** The endpoint is named "import from KV" but it actually imports tokens from a JSON body into D1 `mod_tokens` table (migration 012). The name is a historical artifact from when tokens were stored in KV. The actual handler has not touched KV since migration 012 landed. Misleading to new team members.
- **Recommended fix:** Rename to `/admin/mod/import-tokens` or `/admin/mod/seed-tokens`. Update `ALLOWED_ENDPOINTS` and any popup.js callers. Zero behavioral change.
- **Blast radius:** Endpoint URL change requires coordinated popup.js + background.js + worker update in same deploy.
- **Sprint estimate:** 1 hour

---

## Trivial (cleanup pass)

### T1: `autoUnstickyTick` legacy body preserved under unreachable early-return

- **Name:** Dead code: autoUnstickyTick body under emergency-disabled return
- **Location:** `modtools.js` lines 15000-15064 (entire function; `return` at line 15029 makes lines 15032-15064 unreachable)
- **Severity:** Trivial
- **Why it's stale:** Feature was emergency-disabled at v8.6.3 because `/sticky` is a toggle endpoint with no idempotent set-state API. The function body (65 lines) is preserved "for reactivation" but reactivation requires a fundamentally different implementation approach (non-toggle endpoint, or server-state read-before-write). The existing body would reproduce the exact bug it was disabled for.
- **Recommended fix:** Delete lines 15032-15064 and the `/* eslint-disable no-unreachable */` comment. Keep the no-op stub and the 60-line comment block explaining WHY it's disabled and what the reactivation requirements are. The commented-out timer calls at lines 15547-15548 can also be deleted.
- **Blast radius:** None.
- **Sprint estimate:** 10 minutes

---

### T2: `USERS_BAN_REASON` static const is a shadow of the dynamic getter

- **Name:** Dead static `USERS_BAN_REASON` constant shadowed by `getUsersBanReason()`
- **Location:** `modtools.js` lines 84-92 (`USERS_BAN_REASON` const defined; comment says "replaced at call sites below" but the const value is identical to `USERS_BAN_REASON_DEFAULT`)
- **Severity:** Trivial
- **Why it's stale:** `const USERS_BAN_REASON = USERS_BAN_REASON_DEFAULT` at line 92 serves no purpose since line 91 states all call sites use `getUsersBanReason()`. If any call site still uses the static const, it bypasses user configuration.
- **Recommended fix:** Grep for `USERS_BAN_REASON[^_]` references; confirm they all call `getUsersBanReason()`. Delete the static const.
- **Blast radius:** None if call sites are already migrated.
- **Sprint estimate:** 15 minutes

---

### T3: `grok-3-mini` hardcoded in two client-side `workerCall` calls in modtools.js

- **Name:** Hardcoded model name in content script AI calls
- **Location:** `modtools.js` lines 6610 and 6694 (`model: 'grok-3-mini'` passed in workerCall to `/ai/grok-chat`)
- **Severity:** Trivial
- **Why it's stale:** The user-facing AI model selector (settings at line 8193) lets mods choose their preferred AI model. The two hardcoded calls bypass that setting and always request `grok-3-mini`. The worker's `/ai/grok-chat` handler applies the `resolveAiOrder` fallback chain, so model selection matters.
- **Recommended fix:** Replace `model: 'grok-3-mini'` with `model: getSetting('aiProvider', 'grok-3-mini')` at both call sites.
- **Blast radius:** These two AI calls (ban suggest, sidebar conformity). Trivial.
- **Sprint estimate:** 10 minutes

---

### T4: `BOT_GROK_DAILY_CENTS_CAP` undefined constant fallback in `/ai/shadow-triage`

- **Name:** `BOT_GROK_DAILY_CENTS_CAP` referenced before definition in shadow-triage budget check
- **Location:** `worker/gaw-mod-proxy-v2.js` line 5677: `parseInt(env.BOT_GROK_DAILY_CAP_CENTS || String(BOT_GROK_DAILY_CENTS_CAP || 500), 10)` -- `BOT_GROK_DAILY_CENTS_CAP` is defined at lines 2917-2929 as a const in the bot section, but line 5677 is in the `/health` handler which appears before the bot section in the source. Two other references (lines 3169, 3611) are also inside the bot section so they are fine. Workers JS executes in a single parse, so the const IS available at runtime, but the ordering creates a forward-reference that looks like a bug to readers.
- **Severity:** Trivial
- **Why it's stale:** Not a runtime bug (module-scope consts are hoisted in V8), but creates confusion. Line 5677 should reference the same source of truth as 3169/3611.
- **Recommended fix:** Move `BOT_GROK_DAILY_CENTS_CAP` and `BOT_GROK_MINI`/`BOT_GROK_FULL` constants to the top of the file near `BUDGET_XAI_CALLS_PER_DAY`.
- **Blast radius:** None (not a runtime bug).
- **Sprint estimate:** 5 minutes

---

## Recommended sprint structure

### Sprint v9.1 -- Storage migration (1 week)

Focus: eliminate GitHub JSON as a live data store.

1. **H1** -- Migrate flags.json + profiles.json to D1 (`mod_flags`, `mod_profiles` tables). Write migration 020. Implement D1-backed handlers. Add read-migration shim.
2. **H2** -- Migrate `seen:*` KV to D1 `gaw_users`. Remove `/profiles/seen` KV writes.
3. **M1** -- Worker `/version` from env var; background alarm calls worker `/version`.
4. **L1** -- Remove GitHub Issues dual-write in bug reports.
5. **T4**, **L6** -- Const reorganization and endpoint rename.

---

### Sprint v9.2 -- Auth hardening completion (1.5 weeks)

Focus: complete v5.0-Phase-1 RPC migration.

1. **H3** -- Register all unregistered endpoints in `RPC_HANDLERS`. Expand or eliminate `ALLOWED_ENDPOINTS`. Flip hardening flag to default-on.
2. **H4** -- Replace popup.js raw fetches with RPC calls.
3. **L2** -- Update ALLOWED_ENDPOINTS as interim step or delete it once H3 is done.
4. **M5** -- Add `chrome.storage.onChanged` cross-tab settings sync.

---

### Sprint v9.3 -- Feature fixes and AI cleanup (3 days)

1. **H5** -- Implement or reroute `/ai/conformity-check`.
2. **M2** -- Unify xAI budget tracking to KV.
3. **M3**, **M4** -- Gate phase-2/3 stub endpoints in popup UI.
4. **M7** -- Unify Workers AI to `llama-3.3-70b` across all endpoints.
5. **M8** -- Remove phantom `/ai/analyze` from ALLOWED_ENDPOINTS.
6. **T3** -- Respect aiProvider setting in hardcoded model calls.

---

### Sprint v9.4 -- Polish and debt paydown (2 days)

1. **M6** -- Debounce `_diagLog` storage flush.
2. **L3** -- Cache bot grounding docs in KV.
3. **L4** -- K_SNIFF migration shim.
4. **T1** -- Delete dead `autoUnstickyTick` body.
5. **T2** -- Remove static `USERS_BAN_REASON` const.
6. **L5** -- Opportunistic v5.x comment cleanup during section touches.
