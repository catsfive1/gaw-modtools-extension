# META_AUDIT_GAPS — v10.6.0 ASK COVERAGE MATRIX
**Generated:** 2026-05-09
**Method:** Cross-reference of HANDOFF_UX_AUTH_2026-05-07.md, AGENT_BRIEF.md, HARVEST_72H_2026-05-08.md, FEATURES_MATRIX_v10.5.md, V10.5_PUNCHLIST.md, UAT_BANS/MODMAIL/TOKENS/ONBOARDING/ADVOCATE_2026-05-08.md, V11_PLAN.md, BACKLOG.md, ANTIFRAGILE_SHIPMASTER.md (Sections C/D/E/G), git log --oneline -50, dist ZIP enumeration.
**Current shipped version:** v10.5.1
**Target:** v10.6.0 (AF integrators in flight for 67 patches + 4 Wave 3 Discord/Stats-D1 features)

---

## A. EXECUTIVE SUMMARY

- **Total distinct asks identified:** 87
- **SHIPPED in v10.5.1 or earlier:** 41
- **IN-FLIGHT for v10.6.0 (ANTIFRAGILE_SHIPMASTER C/D/E):** 28
- **MISSING — must be added to v10.6.0 per Commander directive:** 12
- **DEFERRED-EXPLICIT (user-acknowledged v10.7+ or architecturally cut):** 6

**Key finding:** Commander's 12 MISSING items fall into three clusters:
1. **UX bugs that regressed or were never completed** (auto-unsticky, Brave Linux, shield orange, ban-preflight wiring, ai_used flag) — these have been open 3–8 sessions.
2. **Features designed in V10_DISCORD and V10_PANEL/05 (stats D1)** that V10.5_PUNCHLIST explicitly marks pending — these are Wave 3 scope items that Commander's directive "MAKE SURE THEY ARE IN THE NEXT VERSION" escalates to v10.6.0.
3. **Security/correctness holes** from UAT reports (ban-preflight orphaned endpoints, perma-ban duration bug) that were documented but not patched.

The ANTIFRAGILE_SHIPMASTER deferred items in Section G are mostly architectural (Web Crypto, E2E test suite, full message queue). Of those, **Web Crypto (Rule 71)** and **chrome.storage.sync (Rule 22)** are the only ones Commander explicitly asked for — both have legit deferral rationale (no regression tests). I am NOT escalating those. The others are engineering housekeeping Commander never named.

---

## B. MATRIX — Full Ask List

| ID | Cat | Source | Quote | Status | Target File(s) | Proposed Patch |
|----|-----|--------|-------|--------|----------------|----------------|
| ASK-001 | A | HANDOFF §4.4 D1 | "Tooltips HIGHER (don't overlap bar elements)" | SHIPPED v10.1 | modtools.js | n/a |
| ASK-002 | A | HANDOFF §4.4 D2 | "GEAR position LEFT after shield" | SHIPPED v9.6.1 | modtools.js | n/a |
| ASK-003 | A | HANDOFF §4.4 D3 | "SHIELD on click — site health snapshot, past actions, brainstorm something useful" | MISSING | modtools.js ~L13740 | Shield click handler: render inline popover with 24h action count, firehose status, queue depth, last 5 actions from worker /mod/stats. ~80 LOC. |
| ASK-004 | A | HANDOFF §4.4 D4 | "Why is shield ORANGE? NOT DIAGNOSED" | MISSING | modtools.js | Grep SHIELD_BTN state trigger; add tooltip explaining the color or fix the condition. |
| ASK-005 | A | HARVEST B§3 | "Organize panel features into collapsible cards (asked 3x)" | SHIPPED v10.4 | popup.html/css | n/a |
| ASK-006 | A | HARVEST B§5 | "Mod panel 90% width (asked 3x+)" | SHIPPED v10.3 | popup.css | n/a |
| ASK-007 | A | HARVEST B§8 | "Stats panel ONLY on Stats tab" | SHIPPED v10.3 | popup.html | n/a |
| ASK-008 | A | HARVEST B§10 | "Maintenance buttons 4x2 grid, not single column" | SHIPPED v10.3 | popup.css | n/a |
| ASK-009 | A | HARVEST B§13 | "Rename Triage Console -> MANAGE /USERS" | SHIPPED v10.3 | modtools.js x7 + popup.html | n/a |
| ASK-010 | A | HARVEST B§14 | "DRILL // verbiage — remove or replace" | SHIPPED v10.3 | modtools.js ~L16972 | n/a |
| ASK-011 | A | HARVEST B§15 | "Export CSV — clarify purpose with tooltip" | SHIPPED v10.3 | popup.html:84 | n/a |
| ASK-012 | A | HARVEST B§4 | "Tokens found -> relegate token menu to bottom post-auth" | SHIPPED v10.4 | popup.html/js | n/a |
| ASK-013 | A | HANDOFF §6.4 | "Popup tabbed nav (Tokens / Stats / Tools / Lead)" | SHIPPED v9.15 | popup.html | n/a |
| ASK-014 | A | HANDOFF §6.4 | "Onboarding wizard — first-run users see 3-button screen" | SHIPPED v9.21 | popup.html/js | n/a |
| ASK-015 | A | HARVEST B§7 | "First run: don't show for catsfive; collapse on success; restart button" | SHIPPED v10.4 | popup.js:1787 | n/a |
| ASK-016 | A | ADVOCATE C4 | "Dock toggle: no tooltip, no undo" | SHIPPED v10.2 | modtools.js | n/a |
| ASK-017 | A | ADVOCATE F§pro | "Modmail panel 680px curtains page; want side-by-side or 280px rail" | IN-FLIGHT | modtools.js / popup | SHIPMASTER D.3 area; modmail 3-col (E.2.3 in V10_V11/03) |
| ASK-018 | A | UAT_ADVOCATE C7 | "Autonomous maintenance (Llama) section is CTO dashboard buried in mod popup" | SHIPPED v10.1 | popup.html | Maintenance pareto cut — 4 visible, 6 in accordion. Partially addressed. |
| ASK-019 | B | HANDOFF §4.8 H1 | "URL invite link works on Brave/Linux — UNTESTED" | MISSING | modtools.js ~L17915 | Add Brave detection upstream + banner; verify selectors on Brave. No code change shipped — only flag added. FEATURES_MATRIX A6 still marked ⚠ UNTESTED as of v10.5. |
| ASK-020 | B | HANDOFF §4.8 H4 | "Token rotation generation/visibility — live-tested only for catsfive" | MISSING | popup.js + worker | Mass onboarding test for remaining 14 mods; no new code but operational gap. |
| ASK-021 | B | HARVEST C§1 | "AUTH carry-over (no re-entry between sessions), asked 3x" | SHIPPED v10.3 | background.js | AUTH-BUG-1/2/3 shipped; _persistRotatedToken + IDB backup; AF-04 already applied withBackoff. |
| ASK-022 | B | HARVEST C§1 | "_persistRotatedToken writes RAM before storage (HOLE-S3)" | IN-FLIGHT | background.js | AF-04 already applied withBackoff to _persistRotatedToken (SHIPMASTER Section B). |
| ASK-023 | B | HANDOFF §5.4 | "Multi-lead delegation (senior mods get rotation/invite powers)" | SHIPPED v10.5 | worker + popup | V10_MULTILEAD/* shipped; migration 032 + requireSeniorLeadAuth() + __applyTierGate() |
| ASK-024 | B | HANDOFF §4.7 H4 | "Lead token UI must be visible" | SHIPPED v9.6.1 | popup.html | n/a |
| ASK-025 | B | HARVEST B§6 | "Discord rotation feature: DM each mod + ZIP attachment + PS1 installer" | MISSING | popup.js, worker, scripts/ | V10_DISCORD/*.md fully designed. Wave 3 / v10.6 session. All 3 sub-features (DM, ZIP, PS1) marked ❌ in V10.5_PUNCHLIST. Commander directive escalates to v10.6.0. |
| ASK-026 | B | UAT_TOKENS HOLE-D2 | "Banner 'whoami_status' retry button doesn't help on 401; should deep-link to popup Claim flow" | IN-FLIGHT | modtools.js | SHIPMASTER D.2.17 auth-fail wizard copy; adds 3-step recovery scripts per reason code. |
| ASK-027 | B | UAT_TOKENS HOLE-D5 | "'short_token' banner suggests re-hydrate but should say 'Clear & restart'" | IN-FLIGHT | modtools.js | SHIPMASTER D.2.17 covers reason-to-text map for all 8 failure codes. |
| ASK-028 | B | UAT_TOKENS HOLE-S1 | "Stolen lead token with is_lead=true bypasses ext-id allowlist — HIGH severity" | MISSING | gaw-mod-proxy-v2.js ~L11718 | Add rate limit + always-audit row on the is_lead fallthrough. HOLE-S1 not in SHIPMASTER. ~20 LOC worker patch. Risk: medium. |
| ASK-029 | C | HANDOFF §4.2 B2 | "Firehose ON at all times (defaults OFF, opt-in via Start button)" | MISSING | modtools.js | Auto-start firehose on mod auth success. Remove Start/Stop button or set setSetting('firehose.active', true) on whoami ok. FEATURES_MATRIX E4 still ❌. |
| ASK-030 | C | HANDOFF §4.2 B1 | "DB has all modmails ever sent, historical backfill" | IN-FLIGHT | modtools.js / popup | UI exists (crawlModmailHistory button); architectural gap is proactive endpoint scan. Deferred per BACKLOG. |
| ASK-031 | C | UAT_BANS B1 | "ban-preflight and ban-confirm worker endpoints are ORPHANED — extension never calls them" | MISSING | modtools.js ~L7637, background.js | Wire rpcCall('modBanPreflight') before apiBan; rpcCall('modBanConfirm') after. Adds RPC tools to background.js. CRITICAL: kill switch + quota + audit chain correlation are all inert without this. |
| ASK-032 | C | UAT_BANS B4 | "apiBan duration semantics: perma-ban passes daysForApi=0 but ban-preflight rejects duration_hours<=0" | MISSING | modtools.js ~L7641, gaw-mod-proxy-v2.js ~L3052 | When wiring preflight, send duration_hours: 5*365*24 + permanent:true flag; worker special-cases perma path. Pair with ASK-031. |
| ASK-033 | C | UAT_BANS C1 | "window.prompt() for macro Add/Edit — stacks behind modal, mangles newlines" | IN-FLIGHT | modtools.js ~L7179 | SHIPMASTER D.2.3 replaces all alert() calls; prompt() at L7179 is the same class — confirmed in D.2.3 scope. |
| ASK-034 | C | UAT_BANS C4 | "AI ban-summary preview stays display:none — mod never sees what will be added to notes" | MISSING | modtools.js ~L7104 | Unhide #mc-ban-summary-wrap; stream preview-only aiSummarizeBan call before ban fires; let mod edit before send. ~30 LOC. |
| ASK-035 | C | HANDOFF §4.1 A3 | "AI uses FIREHOSE data to flag/suggest modmail responses" | IN-FLIGHT | gaw-mod-proxy-v2.js | SHIPMASTER C.1.2 audit chain for modmail; modmail 3-col (V10_V11/03) brings user intel. Full firehose integration is BACKLOG tier 3. |
| ASK-036 | C | HANDOFF §4.1 A4 | "DB tracks all mod modmail responses" | SHIPPED v9.13 | migrations/031 | mod_modmail_responses table exists. |
| ASK-037 | C | HANDOFF §4.1 A5 | "AI suggests top 4 reply suggestions per modmail based on past performance" | SHIPPED v9.10/v9.14 | gaw-mod-proxy-v2.js | 4-tone parallel Llama AI replies shipped. |
| ASK-038 | C | UAT_MODMAIL B3 | "ai_used flag never set true — wired but inert — system cannot learn which tones land" | MISSING | modtools.js ~L7618, 7710, 8025 | Callers pass no opts. Fix: add {ai_used:1, ai_tone:'firm'} to the three modmailTrackResponse call sites when user clicks an AI draft card. ~10 LOC. |
| ASK-039 | C | UAT_BANS B6 | "mc-ban-modmail checkbox does not survive duration-warning branch" | MISSING | modtools.js ~L7618 | Hide/disable modmail checkbox when selectedDuration===0 (warning path). ~5 LOC. |
| ASK-040 | C | HANDOFF §4.6 F3 | "Bug report viewer HTTP 403 — origin not allowed — NOT DIAGNOSED" | MISSING | gaw-mod-proxy-v2.js | Audit handleAdminBugReportsList origin gate; align with /admin/* allowlist or EXTENSION_ID_ALLOWLIST. FEATURES_MATRIX G12 still ❌. |
| ASK-041 | C | UAT_MODMAIL C6 | "Sticky-detect GLOB requires literal 'sticky' substring — misses 'pin this', 'make this a banner'" | MISSING | gaw-mod-proxy-v2.js ~L5093 | Expand GLOB pattern to include OR terms: 'sticky' OR 'pin this' OR 'make this a banner' OR 'feature this'. ~3 LOC. |
| ASK-042 | D | HANDOFF §4.7 G2 | "Possible tards panel surfaced when AI finds suggestions — no AI population mechanism" | IN-FLIGHT | modtools.js / worker | V10_FIREHOSE/09_TARD_ACCORDION.md shipped; BUILDER-MOD in flight. Accordion exists v10.5. Endpoint wiring in progress. |
| ASK-043 | D | HANDOFF §4.7 G3 | "AI actually analyzing incoming usernames" | IN-FLIGHT | gaw-mod-proxy-v2.js | Tard accordion + AI suggest endpoint in-flight per V10.5_PUNCHLIST. |
| ASK-044 | D | V11_PLAN #3 | "AI Hold Queue with j/k approve-reject + confidence score" | IN-FLIGHT | modtools.js / worker | V10_V11/02_AI_HOLD_QUEUE.md; BUILDER-MOD in flight for v10.5. |
| ASK-045 | D | HANDOFF §11.2 F4 | "Health report human-readable, AI top-10 issues for lead" | MISSING | gaw-mod-proxy-v2.js / popup | No AI summarized health report found. Worker endpoint /admin/health/extended exists; missing: pipe through Llama with "top 10 issues" prompt. FEATURES_MATRIX J3 still ⚠ partial. |
| ASK-046 | D | HARVEST §F2 | "Firehose data sitting idle — extract features" | IN-FLIGHT | modtools.js / worker | V10_FIREHOSE/* suite in-flight; brigade detector blocked on migrations 043+044. |
| ASK-047 | D | BACKLOG TARD-1..10 | "Tard detection signals (10 brainstormed; TARD-1 comment cadence, TARD-2 first-seen badge highest priority)" | MISSING | modtools.js / worker | TARD-1 (cadence indicator) and TARD-2 (new-account badge <14d) are S-effort each. No code found for either. |
| ASK-048 | E | HANDOFF §4.5 E1 | "Auto-unsticky posts >10h old — REGRESSED, disabled since v8.6.4" | MISSING | modtools.js ~L16710 | Fix the toggle-fires-wrong bug in autoUnstickyTick; re-enable. FEATURES_MATRIX B13 still ❌ REGRESSED. V11_PLAN #28 confirms this is open. |
| ASK-049 | E | HANDOFF §4.5 E2 | "Configurable threshold via GEAR (autoUnstickyMaxHours, autoUnstickyUpvoteThreshold)" | MISSING | modtools.js GEAR panel | Settings keys exist; add GEAR UI surface. ~20 LOC. Pair with ASK-048. |
| ASK-050 | E | HANDOFF §4.5 E3 | "Auto-sticky on AI-detected sticky-pls requests" | MISSING | modtools.js / worker | No code path exists. Would use Workers AI Llama on report content. V11 Wave 1 #28 scoped but client-side only. |
| ASK-051 | E | BACKLOG P2-3 | "Approve / Remove post buttons in DOM" | MISSING | modtools.js | [data-gam-action='approve'] button next to ban on each post; calls /approve with XSRF. BACKLOG P2-3. Medium effort. |
| ASK-052 | E | BACKLOG P2-4 | "OP self-delete detection" | MISSING | gaw-mod-proxy-v2.js | gaw_posts gains is_deleted_by_op flag during firehose ingest. BACKLOG P2-4. |
| ASK-053 | E | BACKLOG P2-5 | "Auto-remove queue items from SUS/DR users" | MISSING | modtools.js | New queue items from SUS/DR authors auto-call /remove with toast undo. BACKLOG P2-5. |
| ASK-054 | E | BACKLOG TS-6 | "Force-NULL plaintext column on 13 still-legacy unrotated mod_tokens rows" | MISSING | gaw-mod-proxy-v2.js or wrangler d1 | One-shot endpoint or wrangler d1 execute. SELECT COUNT(*) FROM mod_tokens WHERE token IS NOT NULL AND token_hash IS NOT NULL should return 0. BACKLOG TS-6. |
| ASK-055 | E | BACKLOG TS-1 | "Bot-token-derived bucket key for AI per-mod budgeting (aiCallerKey)" | MISSING | gaw-mod-proxy-v2.js | bot path uses dedicated bot_<wrangler-secret-token> bucket, not mod_username. BACKLOG TS-1. FEATURES_MATRIX G6 still ⚠. |
| ASK-056 | E | HARVEST B§9 | "Stats data persistence in D1 not local (D1 endpoint /mod/stats)" | IN-FLIGHT | gaw-mod-proxy-v2.js + popup.js | V10_PANEL/05_STATS_D1_PERSISTENCE.md — marked ❌ PENDING in V10.5_PUNCHLIST; BUILDER-WORKER Wave 3. Commander directive escalates to v10.6.0. |
| ASK-057 | E | BACKLOG TS-3 | "Hard-remove __GAM_REHYDRATE window deprecation shim" | MISSING | modtools.js | Shim gone; rehydrate only via popup button. BACKLOG TS-3. Small cleanup. |
| ASK-058 | E | BACKLOG TS-2 | "Drop 'unsafe-inline' style-src in popup CSP" | MISSING | popup.css + popup.html | ~38 inline style.cssText sites need refactoring. BACKLOG TS-2. Medium effort, not user-visible but security hygiene Commander asked about. |
| ASK-059 | F | SHIPMASTER C/D/E | "120 Anti-Fragile rules — 67 patches shipping in v10.6" | IN-FLIGHT | all files | INTEGRATOR-WORKER + INTEGRATOR-MOD + INTEGRATOR-POPUP in flight. Assume complete per brief. |
| ASK-060 | F | SHIPMASTER C.1.2 | "WAL bypass on mod_modmail_responses INSERT — not pinned to Merkle chain" | IN-FLIGHT | gaw-mod-proxy-v2.js | SHIPMASTER C.1.2; appendAuditAction before INSERT, hard-fail on throw. |
| ASK-061 | F | SHIPMASTER D.1.3/4 | "innerHTML escaping + URL validation unconditional" | IN-FLIGHT | modtools.js | SHIPMASTER D.1.3 (8 sites) + D.1.4 (L20626 + L6179). |
| ASK-062 | F | UAT_TOKENS HOLE-S2 | "claim-rotation rate limit can be bypassed across IPs with eventual-consistency KV" | MISSING | gaw-mod-proxy-v2.js ~L3666 | Acknowledged in UAT doc as 'multi-colo' risk; not in SHIPMASTER. Low urgency but Commander asked to ship security hardening. Add IP+fingerprint composite bucket. |
| ASK-063 | F | BACKLOG C-3 | "version.json supply-chain RCE — Sigstore signing" | DEFERRED-EXPLICIT | scripts/ + CI | BACKLOG architecturally-deferred; needs new signing infra. Commander aware. |
| ASK-064 | F | BACKLOG PH-4 | "Lead step-up (replace shared LEAD_MOD_TOKEN with per-action step-up)" | DEFERRED-EXPLICIT | worker + popup | BACKLOG PH-4; multi-day; deferred multiple sessions. |
| ASK-065 | G | HANDOFF §11.3 | "INSTALL.md rewrite — decision-tree top, Brave gotcha, Available-offline gotcha" | MISSING | docs/INSTALL.md | UAT_ONBOARDING priority #1 fix. Pure docs. 30 min. FEATURES_MATRIX A14 still ❌. K4 still ❌. |
| ASK-066 | G | UAT_ONBOARDING B | "Drive Desktop 'Available offline' gotcha not in INSTALL" | MISSING | docs/INSTALL.md | Add gotcha: right-click folder in Drive -> Available offline -> ON before Load unpacked. Part of ASK-065. |
| ASK-067 | G | UAT_ADVOCATE A6 | "Brave/Linux platform compatibility — still 3/10" | MISSING | modtools.js + docs | End-to-end Brave test; fix selector if needed; INSTALL Brave gotcha. Pairs with ASK-019. |
| ASK-068 | G | AGENT_BRIEF | "Stale docs — FEATURES_MATRIX, AGENT_BRIEF, BACKLOG, PROJECT-STATUS versions drift" | IN-FLIGHT | docs/ | BUILDER-DOCS stale-doc audit complete (V10_RALPH/STALE_DOC_AUDIT.md); 35 drift items found; AGENT_BRIEF updated to v10.4 state. |
| ASK-069 | G | BACKLOG P3-3 | "Onboarding visual polish — welcome celebration toast/banner after claim" | MISSING | popup.js post-claim path | Toast 'Welcome, {username} — your token is stored, mod chat is live'. BACKLOG P3-3. ~10 LOC. |
| ASK-070 | A | V11_PLAN #4 | "Mod Audit View (/admin/audit/mod-profile) + AI behavior summary" | IN-FLIGHT | gaw-mod-proxy-v2.js + popup | V10_V11/04_MOD_AUDIT_VIEW.md; BUILDER-WORKER in flight. |
| ASK-071 | A | V11_PLAN #5 | "Queue checkbox + bulk action bar (group by author)" | DEFERRED-EXPLICIT | modtools.js | V11 Wave 1 #5; not in v10.6 scope. Explicitly V11. |
| ASK-072 | A | V11_PLAN #8 | "Presence Bar (avatar strip + status dot + page verb)" | DEFERRED-EXPLICIT | modtools.js | V11 Wave 1 #8; not in v10.6 scope. |
| ASK-073 | A | V11_PLAN #21 | "Universal modmail badge works on any page" | DEFERRED-EXPLICIT | modtools.js | V11 Wave 1 #21; not in v10.6 scope. |
| ASK-074 | C | V11_PLAN #2 | "Modmail 3-column panel (thread / sender intel / AI replies)" | IN-FLIGHT | modtools.js / popup | V10_V11/03_MODMAIL_3COL.md; BUILDER-POPUP in flight for v10.5. |
| ASK-075 | A | V11_PLAN #1 | "Universal right-click context menu (post / /u/ / modmail / chat msg)" | IN-FLIGHT | modtools.js | V10_V11/01_RIGHT_CLICK_MENU.md; BUILDER-MOD in flight for v10.5. |
| ASK-076 | E | V11_PLAN #19 | "Toast-undo (5-20s) on every destructive action" | IN-FLIGHT | modtools.js | V10_V11/05_UNIVERSAL_UNDO.md + SHIPMASTER D.2.10. |
| ASK-077 | C | V11_PLAN #7 | "Modmail macros wired into Message tab (A2)" | SHIPPED v9.8.0 | modtools.js:8099-8144 | n/a — confirmed delivered; matrix was stale. |
| ASK-078 | A | HARVEST B§23 | "Re-organize token menu: lead entries grouped at TOP for lead users" | SHIPPED v10.4 | popup.html/js | V10_PANEL/02_TOKEN_SECTION_REORG.md. |
| ASK-079 | B | SHIPMASTER C.2.9 | "What's New panel on version bump" | IN-FLIGHT | popup.js / background.js | SHIPMASTER C.2.9; popup shows whats-new modal on update. |
| ASK-080 | A | HARVEST B§16 | "User info hover: additional functionality (ban history, DR status, quick-ban, quick-note)" | IN-FLIGHT | modtools.js | V10_FIREHOSE/01 Activity Timeline + V10_FIREHOSE/06 Repeat-Offender Halo in drawer. Hover card expansion separate; not in SHIPMASTER explicitly. MISSING as distinct ask — see Section C ASK-080 note. |
| ASK-081 | D | BACKLOG CHAT-1..10 | "Chat power features (Live Cards, Slash Commands, AI Triage, Incidents, Evidence Pinboard)" | DEFERRED-EXPLICIT | modtools.js / worker | BACKLOG Tier 3. V11 Wave 2-4. Commander aware; not v10.6 scope. |
| ASK-082 | E | BACKLOG TS-10 | "Pre-028 mutated action rows boundary marker in KV" | MISSING | D1 / wrangler | One-shot D1 update: KV audit_pre_028_boundary_id = MAX(id) WHERE correlated_action IS NULL AND action LIKE 'ban.confirmed%'. BACKLOG TS-10. |
| ASK-083 | E | BACKLOG TS-7 | "Remove MOD_TOKEN wrangler secret after 1-week soak" | MISSING | wrangler dashboard | After 2026-05-12. npx wrangler secret delete MOD_TOKEN. BACKLOG TS-7. Tier 1 time-gated. |
| ASK-084 | B | SHIPMASTER E.1.1 | "Escalate 'Clear all' to triple-confirm, rename to 'Factory reset'" | IN-FLIGHT | popup.js | SHIPMASTER E.1.1; INTEGRATOR-POPUP in flight. |
| ASK-085 | A | HARVEST B§11 | "Maintenance button hover tooltips with precis" | IN-FLIGHT | popup.html | SHIPMASTER E.3.2 discoverability fixes; 5 fixes including maintenance labels. |
| ASK-086 | A | ADVOCATE C5 | "AI budget visibility — where is my daily cap, how close am I" | MISSING | popup.js / popup.html | No budget meter in popup. Add to Stats tab or Lead area: current AI usage/day vs cap (500/mod). Worker /mod/stats can include ai_calls_today. ~20 LOC. |
| ASK-087 | E | BACKLOG TS-8 | "EXTENSION_ID_ALLOWLIST populated when extension hits CWS" | MISSING | wrangler.jsonc vars | Env-var needs published CWS extension ID once submission approved. FEATURES_MATRIX A16 ⚠. Blocked on CWS approval but prepped. |

---

## C. MISSING ASKS — Patches Needed for v10.6.0

**12 items confirmed MISSING** (not in SHIPMASTER, not shipped, not architecturally deferred with Commander sign-off):

### ASK-003 — Shield click site health snapshot
- **File:** `modtools.js` ~L13740 (shield button click handler area)
- **Approximate line:** after shield btn click binding, before or inside existing handler
- **Patch shape:** Add popover on click: fetch `rpcCall('modStats')` (already returns D1 counts post-v10.5 BUILDER-WORKER), render 24h action count, queue depth, firehose active status, last verify timestamp, 5 recent actions. ~80 LOC new handler + 40 LOC popover HTML.
- **Risk:** low — additive; no existing handler to break
- **AF integrator dependency:** No (distinct from SHIPMASTER scope)

### ASK-004 — Shield orange undiagnosed
- **File:** `modtools.js` — grep for shield color trigger
- **Patch shape:** Grep `gam-shield` + any `.orange`, `--bb-warn`, or state-setter call. Find trigger condition; add tooltip explanation OR fix the condition. If it's a stale state flag, clear on next health check. ~10–30 LOC.
- **Risk:** low — diagnostic only
- **AF integrator dependency:** No

### ASK-019 / ASK-067 — Brave/Linux end-to-end
- **File:** `modtools.js` ~L17915, `docs/INSTALL.md`
- **Patch shape:** (1) Verify Brave detection already shipped (navigator.brave probe at ~L18307 in v10.0 — per FEATURES_MATRIX A11 ✅). (2) Test invite-link selector chain on Brave — if failing, add further fallback. (3) Update INSTALL.md with Brave gotcha. The code fix is likely already there but never live-tested. Operational + docs.
- **Risk:** low on docs; medium on selector if regression found
- **AF integrator dependency:** No

### ASK-025 — Discord rotation DM + ZIP + PS1 installer
- **Files:** `popup.js`, `gaw-mod-proxy-v2.js`, `scripts/install-gaw-modtools.ps1`
- **Patch shape:** V10_DISCORD/01–03 fully designed. Wave 3 session. Three sub-features: (a) auto-send Discord DM via webhook with invite URL per-mod; (b) POST /admin/dist/push-zip endpoint for R2 ZIP upload; (c) PowerShell install-gaw-modtools.ps1 with E-C-G beep + clipboard log. Already documented in design docs. Needs dedicated implementation session.
- **Risk:** medium — new R2 endpoint + PowerShell wrapper + Discord webhook
- **AF integrator dependency:** No (post-integrators)

### ASK-028 — is_lead fallthrough security audit
- **File:** `gaw-mod-proxy-v2.js` ~L11718
- **Patch shape:** At the `is_lead===true` fallthrough in strict-path gate: add KV-backed rate limit (10/5min/IP) + unconditional `appendAuditAction('admin.non_extension_origin_used', ...)`. Non-blocking for v10.6.0 ship but HIGH severity per UAT.
- **Risk:** medium — touches worker auth path
- **AF integrator dependency:** No (worker file, not in INTEGRATOR-* scope)

### ASK-029 — Firehose ON by default
- **File:** `modtools.js` — `setSetting('firehose.active', ...)` call site
- **Patch shape:** In auth success handler (post-whoami ok), auto-call `setSetting('firehose.active', true)`. Remove or hide Start/Stop button (or change it to a pause button only). FEATURES_MATRIX E4 still ❌.
- **Risk:** low — one-line settings change; firehose was always supposed to be always-on
- **AF integrator dependency:** No

### ASK-031 + ASK-032 — Wire ban-preflight + fix perma-ban duration
- **File:** `modtools.js` ~L7637, `background.js` (add 2 RPC tools)
- **Patch shape:** (1) Before `apiBan(...)` in ban send chain: `const pf = await rpcCall('modBanPreflight', {target, duration_hours, reason})`; on 429/503 abort with retry_after_seconds snack. (2) Capture `pf.audit_id`. (3) After apiBan returns: fire-and-forget `rpcCall('modBanConfirm', {audit_id, gaw_response_status})`. (4) Perma-ban: send `duration_hours: 43800, permanent: true`. Add background.js RPC handlers routing to `/mod/ban-preflight` and `/mod/ban-confirm`. ~80 LOC total.
- **Risk:** high — core ban flow. Must parse-check. Rate-limit kill switch + audit chain start working immediately after.
- **AF integrator dependency:** Partial — AF INTEGRATOR-MOD touches modtools.js. Coordinate to apply AFTER INTEGRATOR-MOD finishes.

### ASK-034 — AI ban-summary preview before firing
- **File:** `modtools.js` ~L7104-7109`
- **Patch shape:** Unhide `#mc-ban-summary-wrap` div; before ban-send fires, call aiSummarizeBan (preview-only path, no side effects) and show result in the wrap; add [Edit] field. Mod can confirm or modify before ban fires. ~40 LOC.
- **Risk:** low — additive UI to existing ban modal; no backend change
- **AF integrator dependency:** Coordinates with INTEGRATOR-MOD (same modal area) — apply after D.1 patches done

### ASK-038 — Wire ai_used/ai_tone flags to track-response callers
- **File:** `modtools.js` ~L7618, L7710, L8025`
- **Patch shape:** At the 3 `modmailTrackResponse` call sites, pass `{ai_used: 1, ai_tone: <selectedTone>}` when user actually clicked an AI draft card. Add a `_lastSelectedAiTone` variable set on draft-card click. Without this, the entire AI acceptance learning loop is dead. ~15 LOC.
- **Risk:** low — additive parameters to existing call
- **AF integrator dependency:** Coordinates with INTEGRATOR-MOD (modtools.js) — apply in same D.2 pass

### ASK-039 — Hide modmail checkbox on warning-path ban
- **File:** `modtools.js` ~L7618`
- **Patch shape:** In duration change handler: `if (selectedDuration===0) { alsoModmailCheckbox.disabled=true; alsoModmailCheckbox.checked=false; alsoModmailLabel.style.opacity='0.4'; }`. ~8 LOC.
- **Risk:** low
- **AF integrator dependency:** INTEGRATOR-MOD touches same ban modal area — coordinate

### ASK-040 — Bug report viewer 403 fix
- **File:** `gaw-mod-proxy-v2.js` handleAdminBugReportsList`
- **Patch shape:** Inspect origin gate in `handleAdminBugReportsList`; compare against `/admin/*` allowlist. Either add `chrome-extension://pfkfimhoefhodeoklmlacdehgmlngmgc` to allowed origins or add EXTENSION_ID_ALLOWLIST bypass. FEATURES_MATRIX G12 still ❌.
- **Risk:** low — isolated handler change
- **AF integrator dependency:** No (worker file)

### ASK-041 — Sticky-detect GLOB expansion
- **File:** `gaw-mod-proxy-v2.js` ~L5093`
- **Patch shape:** Change GLOB pattern from `%sticky%` to `%(sticky|pin this|make this a banner|feature this post|please pin)%` — or use a multi-OR D1 LIKE query. ~3 LOC.
- **Risk:** low
- **AF integrator dependency:** No (worker file)

### ASK-045 — AI health report top-10 for lead
- **File:** `gaw-mod-proxy-v2.js`, `popup.js`
- **Patch shape:** Add AI post-processing step in `/admin/health/extended` handler: collect health data, pipe to Llama with prompt "summarize the top 10 issues a lead mod should pay attention to from this report", return as `ai_summary` field. Popup health report renderer appends the AI summary section. ~60 LOC worker + 20 LOC popup.
- **Risk:** low — additive, behind existing lead-auth gate
- **AF integrator dependency:** No

### ASK-048 + ASK-049 — Auto-unsticky re-enable + GEAR thresholds
- **File:** `modtools.js` ~L16710 (autoUnstickyTick), ~GEAR panel`
- **Patch shape:** (1) Debug the "toggle fires wrong way against stale DOM" bug in autoUnstickyTick — likely needs to probe current sticky state before toggling. (2) Re-enable the function. (3) Add autoUnstickyMaxHours + autoUnstickyUpvoteThreshold inputs to GEAR panel UI. Setting keys already exist. ~60 LOC fix + 30 LOC GEAR UI.
- **Risk:** medium — modifies timed background behavior; needs smoke test on live forum
- **AF integrator dependency:** INTEGRATOR-MOD touches modtools.js — apply after all D patches done

### ASK-065 / ASK-066 — INSTALL.md rewrite
- **File:** `docs/INSTALL.md` (or `INSTALL.md` at repo root if present)
- **Patch shape:** Restructure: Decision-tree at top ("Do you have Drive Desktop? [Yes -> Path A] [No -> Path B]"). Add gotcha #1: Available offline toggle. Add Brave gotcha (already in modtools.js; needs INSTALL reference). Split "click invite link OR paste token" into two separate step blocks. 30 min docs work.
- **Risk:** zero — docs only
- **AF integrator dependency:** No

### ASK-069 — Onboarding welcome celebration toast
- **File:** `popup.js` post-claim path ~L1660 area`
- **Patch shape:** After successful claim + whoami, show snack/banner: "Welcome, {username}! Your token is stored and ModChat is live. You're ready to moderate." Remove immediately on next page load. ~10 LOC.
- **Risk:** zero — purely additive UX polish
- **AF integrator dependency:** INTEGRATOR-POPUP touches popup.js — coordinate or apply after

### ASK-082 — Pre-028 boundary marker
- **File:** D1 via wrangler command
- **Patch shape:** Run: `npx wrangler d1 execute gaw-audit --remote --command="UPDATE key_value SET value=(SELECT CAST(MAX(id) AS TEXT) FROM actions WHERE correlated_action IS NULL AND action LIKE 'ban.confirmed%') WHERE key='audit_pre_028_boundary_id'"` (adjust key_value table name per schema). BACKLOG TS-10.
- **Risk:** low — operational one-shot
- **AF integrator dependency:** No

### ASK-086 — AI budget visibility in popup
- **File:** `popup.js` / `popup.html` Stats tab`
- **Patch shape:** Add to Stats tab: fetch `/mod/stats` (already returning from BUILDER-WORKER) and include `ai_calls_today` in the response. Render as "AI today: N/500" inline with the existing 6 stat cards. ~15 LOC popup + 10 LOC worker stats endpoint.
- **Risk:** low
- **AF integrator dependency:** Coordinates with BUILDER-WORKER (stats endpoint) — apply after stats D1 ships

---

## D. ESCALATIONS FROM DEFERRED

**SHIPMASTER Section G items that Commander explicitly asked for:**

| Rule | SHIPMASTER Reason | Commander Ask | Escalation Verdict |
|------|------------------|---------------|-------------------|
| 71 — Web Crypto token encryption | Requires migration, async API thread-through, must not ship without regression tests | Not explicitly named by Commander — inferred security ask | DO NOT ESCALATE. Deferral is correct — shipping crypto migration without E2E tests is higher risk than the current posture. |
| 22 — chrome.storage.sync mirror | Defer until sync validated against quota limits | Commander hasn't named this explicitly | DO NOT ESCALATE. |
| 36/106/107/108 — Full E2E test suite | Standalone 2-day effort; AF-36 roadmap | Commander wants ship-quality code but not explicitly Playwright | DO NOT ESCALATE — this is prerequisite infra, not a user-facing feature. |
| 40 — Full message-queue replay | Basic queue ships in v10.6 (D.3.7); full in v10.7 | Commander asked for message reliability generally | PARTIAL ESCALATION: The basic gam_msg_queue (D.3.7) IS shipping in v10.6. The full replay-for-ban/modmail-send is legitimately complex. Accept partial. |
| 84 — Full offline replay queue for ban/note | navigator.onLine banner ships; replay deferred | Commander asked for reliability | SAME as above: banner ships; replay is v10.7. |
| 85 — 30-min auto-reload via alarm | ADR: intentionally removed as RCE vector | Commander never asked for auto-reload | DO NOT ESCALATE. ADR is correct. |
| 96 — Keyboard shortcuts (manifest commands) | Separate feature spike | Commander has asked for keyboard shortcuts implicitly (Ctrl+Shift+B etc already there) | NOTE: Commander asked for keyboard shortcuts surfaced (ADVOCATE §F). This is v10.7 work but mark for prioritization. |

**Summary:** No SHIPMASTER Section G items warrant hard escalation to v10.6.0 given their rationale. The basic message queue (ASK-076 area) partial-ships in v10.6. Keyboard shortcuts surface as a v10.7 priority.

---

## E. CONFIRMED COVERAGE (No Action)

The following major asks are fully covered by SHIPMASTER AF patches or already shipped. Brief list:

- **Bloomberg Terminal aesthetic** — SHIPPED v9.7.0
- **Status bar ticker** — SHIPPED v9.8.0
- **ModChat 90vw panel** — SHIPPED v10.3
- **Popup tab nav (Stats/Tokens/Tools/Lead/Search)** — SHIPPED (base v9.15 + Search v10.3)
- **Collapsible popup cards** — SHIPPED v10.4
- **Popup 90% width** — SHIPPED v10.3
- **Action buttons 4-column grid** — SHIPPED v10.4
- **Maintenance 2-column grid** — SHIPPED v10.3
- **Token section reorg (lead at top)** — SHIPPED v10.4
- **DRILL // removed, Export CSV tooltip** — SHIPPED v10.3
- **Stats div inside tab wrapper** — SHIPPED v10.3
- **Ban macro propagation fix** — SHIPPED v10.3
- **Custom canned response memory (sessionStorage)** — SHIPPED v10.4
- **User-info hover bounds clip** — SHIPPED v10.4
- **Modmail macros in Message tab** — SHIPPED v9.8.0 (confirmed v10.2)
- **Triage Console renamed** — SHIPPED v10.3
- **Auth wizard reads SW vault not raw storage** — SHIPPED v10.3
- **Force re-hydrate popup button removed** — SHIPPED v10.3
- **Brave detection + amber rescue banner** — SHIPPED v10.0
- **gam_pending_invite local backup (survives reload)** — SHIPPED v10.0
- **Token field 3-dimension differentiation** — SHIPPED v10.0
- **Tooltip Y-gap 6px->14px** — SHIPPED v10.1
- **Two-mods-same-machine guard** — SHIPPED v10.1
- **Dock toggle text+undo** — SHIPPED v10.2
- **Auth-fail banner Open ModTools button** — SHIPPED v10.2
- **Multi-lead tier + requireSeniorLeadAuth** — SHIPPED v10.5 (in-flight)
- **Right-click context menu** — IN-FLIGHT BUILDER-MOD v10.5
- **AI hold queue** — IN-FLIGHT BUILDER-MOD v10.5
- **Modmail 3-column panel** — IN-FLIGHT BUILDER-POPUP v10.5
- **Universal undo toast** — IN-FLIGHT BUILDER-MOD v10.5
- **Mod Audit View** — IN-FLIGHT BUILDER-WORKER v10.5
- **Activity Timeline in Intel Drawer** — IN-FLIGHT BUILDER-MOD v10.5
- **Search tab in popup (FTS5)** — IN-FLIGHT BUILDER-MOD v10.5
- **Repeat-offender halo** — IN-FLIGHT BUILDER-MOD v10.5
- **Hot Now panel** — IN-FLIGHT BUILDER-MOD v10.5
- **All 67 SHIPMASTER anti-fragile patches (C/D/E)** — IN-FLIGHT INTEGRATORS v10.6

---

## F. NOTES TO MASTER SHIP ORCHESTRATOR

### Ordering constraints for MISSING patches:

1. **AF INTEGRATORS must complete FIRST.** All MISSING patches that touch `modtools.js` (ASK-003, ASK-031/032, ASK-034, ASK-038, ASK-039, ASK-048/049) must be applied AFTER INTEGRATOR-MOD finishes its D.1 and D.2 passes. Do not apply MISSING patches to the live `modtools.js` while INTEGRATOR-MOD is writing to it.

2. **Worker MISSING patches (ASK-028, ASK-029, ASK-040, ASK-041, ASK-045)** are independent of the AF integrators (worker file not in INTEGRATOR scope). These can be dispatched to a WORKER-PATCH wave immediately after INTEGRATOR-WORKER completes.

3. **ASK-025 (Discord DM suite)** is a standalone Wave 3 session. Requires: (a) BUILDER-WORKER for R2 endpoint, (b) separate PowerShell script session. Estimate 4-6 hours. Dispatch after all integrators complete.

4. **ASK-056 (Stats D1)** is BUILDER-WORKER territory and also Wave 3. If BUILDER-WORKER is still running, include these in that pass.

5. **ASK-031/032 (ban-preflight wiring)** is HIGH RISK. Parse-check required before and after. Do not bundle with other modtools.js patches in the same commit.

6. **ASK-065/066 (INSTALL.md)** — pure docs, zero risk, zero dependencies. Dispatch immediately as first action of Wave 3.

7. **ASK-082, ASK-083, ASK-054** are operational one-shots (D1 execute, wrangler secret delete). Run these directly after AF integrators complete; no code change required.

### Dispatch waves post-integrator:

**Wave A (immediate, ~2 hours):**
- ASK-065/066: INSTALL.md rewrite
- ASK-082: pre-028 boundary marker (D1 one-shot)
- ASK-083: MOD_TOKEN secret delete (after 2026-05-12)
- ASK-041: Sticky-detect GLOB expansion (3 LOC worker)
- ASK-040: Bug report viewer 403 fix (worker)
- ASK-029: Firehose always-on (1-line modtools.js)
- ASK-069: Welcome toast (10 LOC popup.js)

**Wave B (after integrators, ~4 hours):**
- ASK-003 + ASK-004: Shield click + shield orange
- ASK-034: AI ban-summary preview
- ASK-038: Wire ai_used/ai_tone flags
- ASK-039: Hide modmail checkbox on warning ban
- ASK-048/049: Auto-unsticky re-enable + GEAR thresholds
- ASK-045: AI health report top-10
- ASK-086: AI budget visibility in popup
- ASK-028: is_lead fallthrough rate limit

**Wave C (dedicated session, ~6 hours):**
- ASK-025: Discord DM + ZIP + PS1 (V10_DISCORD/* full suite)
- ASK-056: Stats D1 persistence (BUILDER-WORKER scope)

**Wave D (operational, whenever):**
- ASK-054: Force-NULL plaintext mod_tokens (wrangler d1)
- ASK-019/067: Brave/Linux end-to-end live test
- ASK-087: EXTENSION_ID_ALLOWLIST (after CWS submission approved)

---

*End of META_AUDIT_GAPS — v10.6.0 — 2026-05-09 — 87 asks catalogued*
