# HANDOFF — UI/UX, AUTH, USABILITY, FEATURE GAPS

**Audience:** the next Opus session.
**Date written:** 2026-05-07 (revised after Commander demanded a full ask audit).
**Tone:** brutally honest. No victory lap.

Commander's verbatim, this session: *"I am very very very much NOT impressed with the current state of everything. This workflow is a mess. The modtools panel is a confusing nightmare."*

---

## 0. Mission

Three things, in priority:

1. **Fix the auth/token onboarding flow** so a fresh mod can claim an
   invite and authenticate on the first try, on Chrome AND Brave AND
   Linux. **Untested on Brave/Linux as of v9.6.6.**

2. **Make the popup and status bar make sense.** The current state is
   the result of seven versions of corrections, half of which
   contradict each other. There is no coherent design.

3. **Close the 12 open feature gaps in section 4 below.** They are
   gaps from past sessions that were claimed delivered but weren't,
   or were partially delivered, or regressed.

**Do not invent new features. Do not "improve" outside this mandate.
Fix the path the user walks. Then close the gaps. Then stop.**

---

## 1. Project layout (memorize)

```
D:\AI\_PROJECTS\modtools-ext\           ← git repo, master branch
  manifest.json                         ← MV3 manifest, version + key
  modtools.js          ~17.5k lines     ← content script (the universe)
  background.js        ~2k lines        ← service worker
  popup.html .js .css                   ← popup UI (the second universe)
  scripts/                              ← PowerShell: build, install, recover
  docs/
    AGENT_BRIEF.md                      ← terse single-pane reference
    BACKLOG.md                          ← Tier 1/2/3 work queue
    FEATURES_INDEX.md                   ← feature → file:line map
    HANDOFF_UX_AUTH_2026-05-07.md       ← THIS FILE

D:\AI\_PROJECTS\cloudflare-worker\      ← NOT in git (Commander deferred init)
  gaw-mod-proxy-v2.js  ~9k lines        ← the worker
  migrations/*.sql                      ← 001-030 applied to gaw-audit D1
  wrangler.jsonc                        ← bindings (vars only; secrets in dashboard)

D:\AI\_PROJECTS\dist\
  mod-tools dist\                       ← auto-extracted unpacked install
  gaw-modtools-chrome-store-v*.zip      ← built ZIPs
```

## 2. Version state (verify before changing anything)

```
extension     v9.6.6    D:\AI\_PROJECTS\dist\mod-tools dist\
worker        v9.6.2    Current Version ID: ac185a20-2b59-46d9-8b50-06c40009f28b
extension ID  pfkfimhoefhodeoklmlacdehgmlngmgc  (deterministic via manifest.key)
catsfive token  Ts2wPWowho27L2AlaMAYWncIlEzFQzZDWyZbQAyw6whUUl7k
worker URL    https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev
```

Verify live: `curl -sS "$WORKER/mod/whoami" -H "x-mod-token: $TOKEN" -H 'origin: https://greatawakening.win'` should return `{"username":"catsfive","is_lead":true}`.

---

## 3. Commander's working style (load this BEFORE you write code)

From `~\.claude\CLAUDE.md`:

- **§0 lead with conviction.** Don't hand him a menu — pick and ship.
  "Confirm or redirect" beats "what would you like me to do?"
- **§10 eliminate the meatbag.** Before recommending he do anything,
  ask: can I do this myself? If yes, do it. CLI commands, file edits,
  worker deploys, D1 inserts, smoke tests — all yours.
- **§11 trace the whole path.** When he names ONE friction step,
  audit the entire flow. Eliminate everything in that flow you can.
  Don't stop at the named symptom.
- **§7 PowerShell scripts:** UTF-8 BOM, ASCII-only, four-step ending
  (structured report → clipboard → E-C-G beep → Read-Host pause).
- **§8 test before delivering.** If you can verify from your side via
  curl/D1/probe — do it. Don't ship "should work, try it."
- **§9 every diagnostic copies to clipboard** with visual confirmation.
- **He cannot be offended.** Push back when you have a real argument.

What he hates:
- "Should I do A or B?" — pick A, defend it briefly, move on.
- "Recommended pre-rollout steps: 1) wrangler secret put 2) ..." —
  run them yourself, report what you did.
- **Repeating himself.** He has had to say "GEAR on the LEFT" and
  "macros should be SMARTER" and "user page should not hide posts"
  multiple times. That's a sign you didn't read carefully.

---

## 4. THE ASK AUDIT — full picture

Past 3 days of asks vs delivered code. Status: ✅ delivered, ⚠ partial, ❌ broken/missing/regressed.

### 4.1 Macros (custom ban + modmail, AI-driven)

| # | Ask | Status | Detail |
|---|---|---|---|
| **A1** | Custom ban messages, addable/deletable by any mod, synced | ✅ | Migration 022_team_macros + worker /macros/* + Mod Console ban tab in v9.6.1 |
| **A2** | Custom modmail replies, synced | ⚠ | Schema supports `kind='mm_reply'`, popup tab exists, **but Mod Console modmail tab dropdown not wired** — first thing to fix |
| **A3** | AI uses FIREHOSE data to flag/suggest modmail responses | ❌ | /macros/ai-suggest exists with generic prompt; does NOT consult firehose data |
| **A4** | DB tracks all mod modmail responses | ❌ | team_macros tracks use_count + last_used_by; no per-thread response history table |
| **A5** | AI suggests top 4 reply suggestions per modmail, based on past performance | ❌ | No per-thread suggestion engine |
| **A6** | "+ ADD CUSTOM" at TOP of dropdown, AI-generated starter macros | ✅ | v9.6.1 |

### 4.2 Firehose (broken in 2 of 3 dimensions)

| # | Ask | Status | Detail |
|---|---|---|---|
| **B1** | DB has all modmails ever sent, historical backfill | ⚠ | modmail_threads schema with ON CONFLICT dedupe exists; **no proactive historical backfill** — only ingests as mod sees them |
| **B2** | Firehose ON at all times | ❌ | Opt-in via popup Start button, defaults OFF. setSetting('firehose.active', true) only fires on explicit start |
| **B3** | Duplicate detection so DB doesn't bloat | ❌ BROKEN | gaw_posts (line 7577) and gaw_comments (line 7656) real-firehose INSERTs **lack ON CONFLICT clause**. Every duplicate primary-key insert throws. **Likely explanation for `firehoseState.errors:8` in Commander's debug snapshot.** Test-seed path (line 8876) DOES have ON CONFLICT — proves the schema supports it |

**Fix path for B3:** add `ON CONFLICT(id) DO UPDATE SET score=excluded.score, comment_count=excluded.comment_count, last_updated=excluded.last_updated, version=version+1` to both INSERTs. Same pattern as the test-seed path.

### 4.3 Modmail UX

| # | Ask | Status | Detail |
|---|---|---|---|
| **C1** | Hints panel (minimizable, hovers next to modmail) | ✅ | v9.6.0 `gam-mm-hints` |
| **C2** | Best shortcuts (researched + decided) | ⚠ | Panel shows shortcuts but "best" not validated against use; consider telemetry |

### 4.4 Mod Bar

| # | Ask | Status | Detail |
|---|---|---|---|
| **D1** | Tooltips HIGHER (don't overlap bar elements) | ❌ | Still flagged. Find `.gam-tip` CSS rule, adjust bottom offset |
| **D2** | GEAR position (originally "far right" → corrected to LEFT after shield) | ✅ | v9.6.1 |
| **D3** | SHIELD on click — site health snapshot, past actions, brainstorm something useful | ❌ | Currently a basic stub. Brainstorm: 24h actions count, queue depth, firehose status, audit chain head, last verify ts, sus user count |
| **D4** | Why is shield ORANGE? | ❌ NOT DIAGNOSED | Probably a state indicator. Find the trigger and either explain in tooltip or fix |

### 4.5 Lead-only features (auto-sticky management)

| # | Ask | Status | Detail |
|---|---|---|---|
| **E1** | Auto-unsticky posts >10h old | ❌ REGRESSED | Code exists (`autoUnstickyTick` line 16710) but DISABLED since v8.6.4 because /sticky is a toggle endpoint that fires the wrong way against stale DOM. Commander asking again means: fix the underlying bug, re-enable |
| **E2** | Configurable threshold via GEAR (autoUnstickyMaxHours, autoUnstickyUpvoteThreshold) | ❌ | Settings keys exist; no GEAR UI surface |
| **E3** | Auto-sticky on AI-detected "sticky pls!" requests | ❌ | No code path. Would use Workers AI Llama on report content |

### 4.6 Bugs

| # | Ask | Status | Detail |
|---|---|---|---|
| **F1** | User page hides past N days of posts | ✅ FIXED v9.6.6 | This session — gates compactBylines + injectAllStrips + injectBadges + applyUpvoteAgeFilter on `_isProfileViewNow()` |
| **F2** | ModChat not opening | ✅ FIXED v9.6.5 | Backtick inside CSS comment closed outer JS template literal |
| **F3** | Bug report viewer "failed (HTTP 403) — origin not allowed" | ❌ NOT DIAGNOSED | Worker `handleAdminBugReportsList` likely has stricter origin gate. Check worker origin allowlist for /admin/bug-reports |
| **F4** | Health report human-readable, AI top-10 | ⚠ PARTIAL | renderHealth exists v9.6.0; no AI-summarized "top 10 issues that lead should pay attention to" |

### 4.7 USERS page

| # | Ask | Status | Detail |
|---|---|---|---|
| **G1** | Rules auto-run on every page reload | ⚠ UNVERIFIED | autoDeathRowRules sweep code exists; verify it fires on every /users mount |
| **G2** | "Possible tards" panel surfaced when AI finds suggestions | ❌ | autoTardRules array starts empty; no AI population mechanism. Need a `/admin/tards/suggest` endpoint that scans new users and proposes patterns |
| **G3** | AI actually analyzing incoming usernames | ❌ | No active analyzer found |

### 4.8 Auth / Token

| # | Ask | Status | Detail |
|---|---|---|---|
| **H1** | URL invite link works on Brave/Linux | ⚠ UNVERIFIED | v9.6.3 broader fallback selectors + alert() if all miss. Untested on Brave |
| **H2** | Modmail page error was auth issue | ✅ | Resolved when team token entered |
| **H3** | Lead token UI must be visible | ✅ FIXED v9.6.1 | #leadOnlyTools split |
| **H4** | Token rotation generation/visibility | ⚠ PARTIAL | manifest.key stable; /admin/mod/list works; onboarding live-tested only for catsfive (1 of 15 mods) |

### 4.9 NEW (this session)

| # | Ask | Status | Detail |
|---|---|---|---|
| **I1** | User page: ZERO content massaging, just infinite "river" | ✅ FIXED v9.6.6 | This commit |

---

## 5. The auth disaster (full picture)

### 5.1 Three token concepts, often conflated

| Name | Where stored | Proves | Used for |
|---|---|---|---|
| `workerModToken` | `chrome.storage.local.gam_settings` | per-mod identity | every authed `/mod/*` and `/admin/*` |
| `leadModToken` | `chrome.storage.local.gam_settings` | extra defense-in-depth factor | only 3 endpoints (audit backfill, health/extended, key rotation) after v9.6.2 |
| `LEAD_MOD_TOKEN` | CF Dashboard secrets | env-side comparison value | what `leadModToken` is checked against |

**As of v9.6.2** the worker accepts EITHER `x-lead-token` OR `x-mod-token + is_lead=true` for almost all admin endpoints (`requireLeadAuth` helper). Lead-tier work no longer needs the separate lead token. The popup still shows the field — kept for the 3 dual-factor ops — but creates UX confusion.

### 5.2 First-time mod onboarding flow (what SHOULD happen)

1. Lead opens popup → 👥 Mod rotation roster → Generate Invite for a specific mod
2. Lead sends new mod the URL: `https://greatawakening.win/?mt_invite=<code>`
3. New mod loads unpacked extension (ID stays stable)
4. New mod logs into greatawakening.win
5. New mod clicks the invite link
6. modtools.js IIFE detects `?mt_invite=`, validates header user link, asks `window.confirm()`
7. On confirm: stages `gam_pending_invite` into chrome.storage.session, strips URL
8. New mod opens popup → sees "📥 Claim invite" button
9. Clicks Claim → enters their GAW username → confirms
10. Worker validates invite, mints token, stores in mod_tokens, returns
11. Popup saves to chrome.storage.local, refreshes lead-gate
12. Refresh greatawakening.win → bar appears → fully authenticated

### 5.3 Silent failure points (mapped to known bugs)

- **Step 5** Brave Shields may strip `?mt_invite=` query parameter as tracker
- **Step 6** Header user-link selector misses on theme variants (v9.6.3 added 5 fallbacks + screen-anchored sweep — UNTESTED on Brave)
- **Step 7** chrome.storage.session has had MV3 bugs in Brave; staged invite may not persist between IIFE stage and popup claim
- **Step 9** Username case-mismatch. Worker normalizes lowercase but UX doesn't say so

### 5.4 What you must verify works (live, not from logs)

For Chrome AND Brave on Linux:
- [ ] Fresh install → click invite link → see confirm dialog → click OK → snack/alert says "Invite STAGED"
- [ ] Open popup → see "📥 Claim invite" button (not greyed out)
- [ ] Click Claim → enter username → click Claim → token saved
- [ ] Refresh GAW → bar appears, no auth-fail banner

If any of these fail, that's where you start. **The previous session did not test on Brave from its side. §8 violation. Don't repeat.**

---

## 6. The UX nightmare (specifics)

### 6.1 Status bar layout

Current order at modtools.js ~13725:
```
[shield] [gear] | [modlog] [siren] [snipe] [bug] [chat] [presence] [auth-lock] [maint] | [USERS-only] [BAN-only]
```

Open issues:
- **D1** tooltips overlap adjacent icons — move them HIGHER (top of bar, not under it)
- **D3** SHIELD click is dumb — needs site health snapshot
- **D4** SHIELD turned orange unexplained — diagnose
- **D2** GEAR is in the right place now (LEFT after shield) — don't move

### 6.2 Popup

380+ lines of HTML in `popup.html`. Vertical scroll of organic-growth sections:

- 🔑 Team Mod Token (input + save) — first-run path
- 👑 Lead Mod Token (input + save + always-visible since v9.6.1)
- ✓ Hint banner ("your team token authenticates you as lead")
- 📥 Claim invite button
- Stats grid (6 cards with click drill-down)
- Force re-hydrate
- Mod log link
- Macros panel (ban_msg / mm_reply tabs)
- Bug reports (lead-only)
- Maintenance routines (12 user + 4 lead)
- Lead-only tools section (rotation roster, team settings)

Issues:
- **Too long.** No tab/nav, no search, no collapsible sections
- **Token field UX confuses people.** 🔑 Team vs 👑 Lead look identical. Commander pasted lead value into lead field, expected the bar to unlock. The bar needs the TEAM token — separate field
- **Macros panel buried.** "Generate with AI" is a great feature, you'd never find it
- **Drill-down stats expand inline** — popup gets very tall

### 6.3 Mod Console (modal from bar)

`openModConsole()` in modtools.js. Tabs: Intel / Ban / Note / Message / Quick.

- v9.6.1 macros dropdown in Ban tab is good (live-tested)
- **A2 unfinished:** Modmail tab needs the same dropdown wired to `kind='mm_reply'` macros — first thing to fix in macros area
- z-index/backdrop conflicts have been recurring (the chat-panel ID-collision bug was found this way)

### 6.4 What an actual UX overhaul would look like

YOUR call to make and ship. Sketch:

- **Popup tabbed nav** (Tokens | Stats | Tools | Lead). Reduces scroll. Each tab is one screen
- **Onboarding wizard.** First-run users see ONE screen with three buttons: "I have an invite link" / "I have an invite code" / "I have a token". Each path is guided
- **Status bar logical grouping**, separators, consistent icon order. Document why every icon exists
- **Tooltip stacking** — top of bar, no overlap
- **Auth-fail banner** is good — keep. But add: "What is each token?" inline help so users don't paste the wrong one

---

## 7. What this session shipped

| Ver | What | Caveat |
|---|---|---|
| v9.5.1 | SPA watcher fix for profile-page hidden posts | Took 12 sessions. Insufficient — Commander hit it again, hence v9.6.6 |
| v9.5.2 | rpcCall hardening for Extension Context Invalidated | Good |
| v9.5.3 | Visible auth-fail banner with "Force re-hydrate" | Good. Banner is the safety net |
| v9.6.0 | Mega-ralph (multi-feature commit) | Not all reviewed in detail. Wrapped openPanel in try/catch — this is what unmasked the 6-version backtick bug |
| v9.6.1 | GEAR moved to LEFT after Commander correction. Lead-token always visible. Smart macros (+ Add custom + AI) | UX correction |
| v9.6.2 | requireLeadAuth helper; team token + is_lead unlocks 95% of admin ops | Big UX win |
| v9.6.3 | URL invite header-link broader fallback + alert() if all miss. ModChat openPanel labeled errors | UNVERIFIED on Brave |
| v9.6.4 | Aggressive console instrumentation in openPanel. No-throw degraded mode | Diagnostic only |
| v9.6.5 | THE backtick-closes-template-literal bug in injectStyles | Six versions to find |
| v9.6.6 | User profile pages: ZERO content massaging | Commander's 5th repetition of this complaint. Final |

---

## 8. What this session FAILED at (Commander deserves this list)

1. **Misread Commander's GEAR direction.** He said "move the GEAR" — I shipped right. He clarified LEFT. §11 violation
2. **Custom macros first cut too primitive.** Commander said "WAY more smart than this" — caught and shipped in v9.6.1
3. **Six versions to find the backtick bug.** My greps for "data" missed it because the bare identifier is parser-induced. Then I made the SAME bug in my own commit-explanation comment
4. **Did not test on Brave Linux from my side.** Commander's mod is on Linux Brave. I have Chrome MCP. §8 violation
5. **Did not eliminate enough meatbag steps.** Commander still had to: paste tokens into wrong field, retry installs, reload extension multiple times, switch tabs to read DevTools console
6. **Token confusion never got a UX fix at the field-label level.** 🔑 vs 👑 are too subtle. New mod's brain treats them as "two slots, one token"
7. **Did not audit firehose state when claiming features delivered.** B2 (always-on) and B3 (dedupe) were claimed in v8.x and weren't there. Commander's snapshot showed errors:8 — the dedupe gap. Did not flag this proactively
8. **Did not return to E1/E2/E3 (auto-sticky)** — Commander asked, I shipped nothing. Auto-unsticky has been disabled since v8.6.4

---

## 9. Boot commands

```bash
# Build extension (auto-extracts to dist/mod-tools dist/)
pwsh -File D:\AI\_PROJECTS\modtools-ext\scripts\build-zip.ps1 -NoPause

# Parse-check before any commit
node --check D:\AI\_PROJECTS\modtools-ext\modtools.js
node --check D:\AI\_PROJECTS\modtools-ext\background.js
node --check D:\AI\_PROJECTS\modtools-ext\popup.js

# Worker deploy (ALWAYS parse-check first)
cd D:\AI\_PROJECTS\cloudflare-worker
node --check gaw-mod-proxy-v2.js
npx wrangler deploy

# D1 migration apply
npx wrangler d1 execute gaw-audit --remote --file=migrations/NNN_xxx.sql

# Probe tokens (catsfive lead)
TOKEN='Ts2wPWowho27L2AlaMAYWncIlEzFQzZDWyZbQAyw6whUUl7k'
W='https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev'
curl -sS "$W/mod/whoami" -H "x-mod-token: $TOKEN" -H 'origin: https://greatawakening.win'

# Live worker version
curl -sS "$W/version" 2>&1 | head -3

# Live mod roster (lead-tier; team token works after v9.6.2)
curl -sS "$W/admin/mod/list" -H "x-mod-token: $TOKEN" -H 'origin: https://greatawakening.win' | jq .
```

---

## 10. Invariants (break these and Commander loses time)

| Invariant | Why |
|---|---|
| `manifest.json.version` AND `modtools.js:34 const VERSION` bump in lockstep | Drift is silent |
| `manifest.key` field stays — extension ID stays | Removing it rotates ID, wipes chrome.storage |
| Worker `lookupModFromToken` is dual-mode (hash-first → plaintext fallback) | v9.2.3 lesson |
| `lookupModFromToken` reads ONLY `x-mod-token` (NOT `x-lead-token`) | W-C-3 |
| `appendAuditAction` MUST hard-fail on state-mutating writes | Never `try/catch{}` around audit append |
| `__applyLeadGate()` is the canonical lead-only popup gate | Don't add other gates |
| `safeError(e, code)` wraps 500 responses | Sanitizes D1 exceptions |
| `closeAllPanels` selector list includes ALL backdrop variants | Orphan-blur bug |
| Z-index hierarchy: popovers > modals > backdrop; chat-panel rule scoped to `[data-dock]` | ID-collision bug |
| `scripts/build-zip.ps1` auto-extracts ZIP to `dist/mod-tools dist/` | Commander's load-unpacked path |
| Audit chain `action` column is IMMUTABLE post-write | Use `correlated_action` |
| `MOD_TOKEN` plaintext fallback REMOVED from `checkModToken` | W-C-1 |
| Token shape regex: `^[A-Za-z0-9_-]{32,256}$` + ≥1 letter ≥1 digit, no leading/trailing dash | Defense in depth |
| Migration 026 boundary id check on `entry_hmac IS NULL` | Reject NULL hmac when id ≥ boundary |
| **NEW v9.6.5:** never use backticks inside JS template literals — including in CSS comments inside `s.textContent = \`...\`;` | Closes template, throws ReferenceError |
| **NEW v9.6.6:** user profile pages run NO content modifiers — gate on `_isProfileViewNow()` for compactBylines, injectAllStrips, injectBadges, applyUpvoteAgeFilter | Commander's hard rule |

---

## 11. Recommended priority order for next session

Pick the ONE you want to spend a session on. Don't try multiple at once — the previous session tried that and missed half.

### 11.1 Quick wins (1-2 hour each, ship one per session)

1. **Fix B3 dedupe** (critical, also explains the live errors). Add `ON CONFLICT(id) DO UPDATE SET score=excluded.score, ...` to gaw-mod-proxy-v2.js lines 7577 and 8014. Smoke-test: insert duplicate, verify no error, verify row updated
2. **Fix D1 tooltip Y-offset.** Adjust `.gam-tip` CSS `bottom` value to push tooltips above the bar
3. **Fix F3 bug report 403.** Audit handleAdminBugReportsList origin gate; align with /admin/* allowlist
4. **A2 modmail macros dropdown wiring** in Mod Console modmail tab. Mirror the v9.6.1 ban-tab pattern
5. **D4 shield orange diagnosis.** Find the trigger; either explain in tooltip or fix
6. **B2 firehose always-on.** Remove the Start/Stop button OR auto-start on mod auth success

### 11.2 Medium (half day)

7. **D3 shield-click site health snapshot.** Brainstorm + ship: 24h actions count, queue depth, firehose status, audit chain head, last verify ts, sus user count, latest 5 actions
8. **F4 health report AI top-10.** Pipe maintenance report through Workers AI Llama with prompt: "summarize the top 10 issues a lead mod should pay attention to from this report"
9. **G2/G3 AI tard suggester.** New endpoint `/admin/tards/suggest` that scans recent gaw_users for username patterns, calls Llama for analysis, populates a panel in Triage Console
10. **Brave Linux end-to-end test.** Spin up Brave (you have Chrome MCP — try Brave too), run full onboarding, verify each step. Document what breaks

### 11.3 Major (multi-session, only after Commander confirms)

11. **Popup tabbed nav** (Tokens | Stats | Tools | Lead) — reduces vertical scroll
12. **Onboarding wizard** — first-run users see 3-button screen with guided paths
13. **E1/E2/E3 auto-sticky management** — fix the v8.6.4 toggle bug, re-enable with GEAR thresholds, add AI-driven sticky-detection
14. **A3-A5 firehose-driven AI modmail suggestions** — new `mod_modmail_responses` table tracking per-thread response history, AI-suggest endpoint that consults firehose data + history
15. **B1 historical modmail backfill** — figure out the GAW API surface for past modmails, write a one-shot ingest endpoint

---

## 12. What you should NOT do

- Don't refactor modtools.js. 17.5k lines for reasons. Monolith intentional
- Don't add new tracking/telemetry. Ship UX
- Don't propose splitting the worker. Don't
- Don't init the cloudflare-worker repo without one-word approval
- Don't bump versions out of lockstep
- Don't touch the audit chain HMAC logic. 459-row backfill exists; let it stay
- **Don't use backticks inside JS template literals. EVER.** Including in comments. Including in commit messages
- **Don't run page-DOM modifiers on user profile pages.** Gate on `_isProfileViewNow()`
- Don't try to fix everything in section 4 in one session. Pick one. Ship. Repeat

---

## 13. Recommended first 30 minutes

1. Read AGENT_BRIEF.md, BACKLOG.md, FEATURES_INDEX.md, this file
2. Verify build/worker state with section 9 commands
3. Verify live token with `curl /mod/whoami`
4. Boot Chrome MCP / Brave if available. Reproduce the new-mod onboarding flow yourself BEFORE touching code. Document where it fails on Brave specifically
5. Read popup.html top-to-bottom
6. Pick ONE item from section 11.1. Tell Commander what you'll do, why, and your expected diff size. Wait for confirm-or-redirect. Then ship it
7. **Do not ship a "huge UX overhaul" commit.** Ship one focused improvement, get Commander's read, ship the next

---

## 14. Final notes

Commander is rolling out to real moderators on his forum NOW. Every UX failure has a real human cost — a mod not getting authenticated, not being able to ban a violating user, not being able to message the team.

The previous session frustrated him because it tried to do too many things at once and missed half of them. Don't repeat. Pick one thing, do it well, get the read, pick the next.

Section 4 (the ask audit) is your roadmap. Section 8 (failures) is your warning. Section 11 (priority order) is your starting menu.

Good luck.
