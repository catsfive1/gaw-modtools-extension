> **WARNING: STALE** — superseded by FEATURES_MATRIX_v10.5.md. Kept for historical reference. Do not use for current state.

# GAW ModTools — Features Matrix

**As of:** 2026-05-08 (extension v9.24.0 / worker v9.4.6)
**Sources:** modtools.js (~20.8k LOC), gaw-mod-proxy-v2.js (~11.95k LOC, ~120 endpoints), popup.{html,js,css}, background.js, migrations 001–031, UAT_BANS/MODMAIL/TOKENS/ONBOARDING/ADVOCATE_2026-05-08, V11_CAT1/2/3, 150_RULES_AUDIT, HANDOFF_UX_AUTH_2026-05-07.

**Status legend:** ✅ shipped + verified · ⚠ shipped partial / has caveats · ❌ open / regressed / not built · 🆕 V11 roadmap candidate · 🛑 architecturally deferred.

---

## A. AUTH & TOKEN PIPELINE

| # | Feature | Status | Evidence / Note |
|---|---|---|---|
| A1 | Manifest.key — deterministic extension ID across mod machines | ✅ | manifest.json:6 (RSA pubkey) |
| A2 | Worker `lookupModFromToken` dual-mode (hash-first, plaintext fallback) | ✅ | gaw-mod-proxy-v2.js:976; W-C-3 lesson |
| A3 | `requireLeadAuth` accepts `x-lead-token` OR `x-mod-token + is_lead=true` | ✅ | v9.6.2; gaw-mod-proxy-v2.js:591 |
| A4 | Token rotation: lead invite → mod claim → atomic UPDATE...RETURNING | ✅ | UAT_TOKENS verified end-to-end; gaw-mod-proxy-v2.js:3701-3793 |
| A5 | Invite-link IIFE on GAW page (`mt_invite=CODE`) → confirm → stage to chrome.storage.session | ✅ | modtools.js:17905 |
| A6 | Header-link selector chain (5 fallbacks + screen-anchored sweep) | ⚠ | UNTESTED on Brave Linux (UAT_ONBOARDING) |
| A7 | Popup auto-detect URL paste vs invite-code paste vs token paste | ✅ | popup.js:514-578 |
| A8 | Whoami probe rollback on 401 → re-stage as invite | ✅ | popup.js:561-578 |
| A9 | Auth-fail banner + "Force re-hydrate" recovery button | ✅ | modtools.js:19336-19392 (advocate report's "unsung hero") |
| A10 | Token shape regex enforced storage-side and on setTokens RPC | ✅ | background.js:151 |
| A11 | Brave Shields strip `mt_invite` query param — silent failure | ❌ | UAT_ONBOARDING; no detection or warning yet |
| A12 | Two-mods-same-machine collision (Drive sync) overwrites token silently | ❌ | UAT_ONBOARDING — no whoami-username compare on save |
| A13 | `gam_pending_invite` lost on extension reload mid-claim | ❌ | UAT_ONBOARDING — no chrome.storage.local backup mirror |
| A14 | INSTALL.md decision-tree top + Brave/Drive-offline gotchas | ❌ | docs only; no in-product help |
| A15 | Mass mod-onboarding live-tested | ⚠ | only catsfive (1/15) verified live; H4 in handoff |
| A16 | `EXTENSION_ID_ALLOWLIST` env-var populated in worker | ⚠ | currently `pfkfimhoefhodeoklmlacdehgmlngmgc` (catsfive); needs CWS ID once published |
| A17 | 2FA / hardware-key gate for lead actions | 🛑 | V11 §5 cut — overkill for 15-mod team |
| A18 | Short-lived sessions broker / mods/auth_sessions/refresh | 🆕 | BACKLOG PH-2; multi-day, deferred |
| A19 | Per-browser device enrollment + revoke | 🆕 | BACKLOG PH-3 |

---

## B. MOD ACTIONS (ban / remove / warn / note / lock / sticky)

| # | Feature | Status | Evidence |
|---|---|---|---|
| B1 | Manual ban send chain with preflight + confirm modals | ✅ | modtools.js:7583-7655 |
| B2 | Repeat-offender escalation (warn → 7d → 30d → perma) | ✅ | modtools.js:7044, 7367 |
| B3 | UNBAN inside ban tab with auto-note + roster cleared | ✅ | modtools.js:7099-7582; UAT_BANS A2 |
| B4 | Username auto-fill from ban-hammer (4-step fallback: getAuthor / URL / data-attr / snack) | ✅ | modtools.js:6422-6437 |
| B5 | Custom ban-message macros — list/upsert/delete/use-count CRUD | ✅ | gaw-mod-proxy-v2.js:4368-4501; team_macros table |
| B6 | "+ Add custom" entry at TOP of ban-modal dropdown | ✅ | modtools.js:7149-7193 |
| B7 | "Generate with AI" reply (4-tone, history-aware) inside ban modal | ✅ | modtools.js:7200-7275 |
| B8 | AI ban-summary auto-note (15-word cap, hard slice, fallback) | ✅ | modtools.js:7669-7684; gaw-mod-proxy-v2.js:4842-4904 |
| B9 | `ai_used` / `ai_tone` flags actually set when AI used | ❌ | UAT_MODMAIL §B.3: callers pass NO opts → `ai_used: 0` always; **wired but inert** |
| B10 | Ban-preflight / ban-confirm endpoints (rate-limit + chained-audit + kill-switch) | ⚠ | UAT_BANS B1 — endpoints exist + handlers exist but NOT wired into client send chain (orphaned at gaw-mod-proxy-v2.js:11773-11774, 2980-3110) |
| B11 | Death Row queue (72h delayed bans, cross-tab idempotency, 20s undo) | ✅ | v8.3.3 |
| B12 | Auto-DR rules (15+ patterns, 5-min team sync) | ✅ | autoDeathRowRules array; profiles read/write @ `__gaw_team_patterns__` |
| B13 | Auto-unsticky (>10h old) | ❌ REGRESSED | autoUnstickyTick @ modtools.js:16710 disabled since v8.6.4 (toggle-endpoint stale-DOM bug) |
| B14 | Configurable thresholds via GEAR (autoUnstickyMaxHours, upvoteThreshold) | ❌ | settings keys exist; no GEAR UI surface |
| B15 | AI-detected sticky-pls requests | ❌ | no code path; would use Workers AI Llama |
| B16 | Removal-reason picker with chained action (comment+remove+lock+ban) | 🆕 | V11 #17 W2; Cat1 #3 |
| B17 | Bulk multi-select queue actions with group-by-author | 🆕 | V11 #5 W1 |
| B18 | Toast-undo (5-20s) on every destructive action | 🆕 | V11 #19 W1 |
| B19 | Lock thread (read-only without removal) | 🆕 | Cat1 #29 |
| B20 | Hide individual comment with reason badge | 🆕 | Cat1 #30 |
| B21 | Timeout (temp mute with auto-expiry) | 🆕 | Cat1 #6 |
| B22 | Slow-mode / follow-only / link-only thread restrictions | 🛑 | Cat1 NOT-A-FIT — needs GAW-side cooperation |
| B23 | Scheduled actions (sticky/unsticky/ban at time T) | 🆕 | V11 #29 W3; Cat1 #26 |
| B24 | Watchlist toggle (Ctrl+Shift+W on hovered post) | ✅ | modtools.js:9565 |
| B25 | Watchlist-add via right-click any /u/ link with reason | 🆕 | V11 #1; Cat2 W5 |

---

## C. MODMAIL

| # | Feature | Status | Evidence |
|---|---|---|---|
| C1 | Live ingest poller (`startInboxIntelPoller`) → IDB → worker sync | ✅ | UAT_MODMAIL; modtools.js:10164 |
| C2 | Backfill deep-crawl (`crawlModmailHistory`) — popup button | ✅ | UAT_MODMAIL; modtools.js:10108-10159; popup.js:3686 |
| C3 | D1 storage `mod_modmail_responses` + `modmail_threads` + `modmail_messages` | ✅ | migration 031 |
| C4 | Track-on-send writes ai_used + ai_tone | ⚠ | endpoint accepts, callers don't pass — see B9 |
| C5 | 4-tone AI replies (firm/empathetic/brief/escalate) parallel Llama 3.3-70b | ✅ | gaw-mod-proxy-v2.js:4736-4825 |
| C6 | History augmentation (last 3 same-sender past replies) injected into AI prompt | ✅ | gaw-mod-proxy-v2.js:4702-4717 |
| C7 | Quality guards (foreign script, self-correction-loop, length 30-320, escape-pollution) | ✅ | gaw-mod-proxy-v2.js:4761-4792 |
| C8 | Ambient pre-fetch (15s settle, 10-min interval, 30-min freshness) | ✅ | modtools.js:14073-14115 |
| C9 | Cached drafts render instantly (popover + panel pull cache before AI call) | ✅ | modtools.js:14344, 14238 |
| C10 | 4-tone color-coded cards in panel + popover | ✅ | modtools.js:14271, 14421 |
| C11 | Modmail hints panel (minimizable, hovers next to modmail) | ✅ | v9.6.0 `gam-mm-hints` |
| C12 | Modmail macros dropdown wired in MOD CONSOLE Message tab | ✅ | SHIPPED v9.8.0; modtools.js:8099-8144 (mm_reply kind wired); HANDOFF §4.1 was stale |
| C13 | AI consults firehose for modmail | ❌ | A3; UAT_MODMAIL §B says "draft-assist tool, not auto-replier" |
| C14 | Confidence scoring on AI replies | ❌ | UAT_MODMAIL §B.1 — all 4 returned equally |
| C15 | Auto-send for low-risk categories | ❌ | UAT_MODMAIL §B.2 — no classifier |
| C16 | History filtered by ai_used acceptance | ❌ | UAT_MODMAIL §B.4 — noisy training signal |
| C17 | Subject/topic similarity match across senders | ❌ | UAT_MODMAIL §B.5 — first-time sender gets zero examples |
| C18 | Empty modmail_threads on first install — silent no-op | ❌ | UAT_MODMAIL §C.1 |
| C19 | Token-absent fast-exit silent (no telemetry) | ❌ | UAT_MODMAIL §C.2 |
| C20 | Universal `📬 N` modmail badge on any page (not just /modmail/thread/*) | 🆕 | V11 #21 W1 |
| C21 | Modmail 3-column panel (thread / sender intel / AI replies) | 🆕 | V11 #2 W1; Cat2 W2 |
| C22 | Appeal Inbox routing (`kind:appeal` auto-tab) | 🆕 | Cat3 F16 |
| C23 | Sticky-detect via GLOB + Llama JSON filter on modmail_messages | ✅ | gaw-mod-proxy-v2.js:5072-5162 |

---

## D. MOD CHAT

| # | Feature | Status | Evidence |
|---|---|---|---|
| D1 | Status-bar 💬 icon, 1:1 + ALL-broadcast, slide-in panel | ✅ | v8.2.0 |
| D2 | 30 msg/min/mod client rate limit | ✅ | RULE_14 verified |
| D3 | 5-min edit window + 24h delete + read receipts | ✅ | shipped |
| D4 | R-hotkey reply on chat panel focus | ⚠ | TS-4 partial in BACKLOG |
| D5 | Slash command palette (/ban, /lookup, /precedent, /incident, /coach) | 🆕 | V11 #13 W2; Cat3 D |
| D6 | Live Cards (paste GAW URL → auto-expand inline) | 🆕 | BACKLOG CHAT-1 |
| D7 | Incidents (`/incident` pinned thread + auto-subscribe) | 🆕 | V11 #24 W4; Cat3 F8 |
| D8 | Evidence Pinboard | 🆕 | BACKLOG CHAT-5 |
| D9 | Ban Drafts (collaborative mini-modal) | 🆕 | BACKLOG CHAT-6 |
| D10 | Smart Quote Reply (auto-include card-state summary) | 🆕 | BACKLOG CHAT-7 |
| D11 | Mention Escalation (`@@all` → chime + browser notification) | 🆕 | BACKLOG CHAT-8 |
| D12 | Huddles (ephemeral private sub-channels) | 🆕 | BACKLOG CHAT-9 |
| D13 | Shift Handoff AI digest | 🆕 | V11 #11 W3; Cat2 W8; Cat3 F6 |
| D14 | Two-Click Second Opinion (lightweight proposal) | 🆕 | V11 #14 W2; Cat3 F14 |

---

## E. TRIAGE / DEATH ROW / SUS / FIREHOSE

| # | Feature | Status | Evidence |
|---|---|---|---|
| E1 | Firehose ingest (posts + comments) atomic UPSERT | ✅ | **v9.4.6 this session — B3 fixed** |
| E2 | FTS5 index on title+body_md+author+community | ✅ | migration 004 |
| E3 | gaw_users aggregate upsert | ✅ | gaw-mod-proxy-v2.js:8518 |
| E4 | Firehose ON-by-default | ❌ | B2 still opt-in; HANDOFF §4.2 |
| E5 | Historical modmail backfill | ⚠ | UI exists (popup #6) but no proactive endpoint scan |
| E6 | Triage Console with autoDeathRow rules | ✅ | shipped |
| E7 | SUS user detection + status pills | ✅ | shipped |
| E8 | Compact bylines / age filter / SUS overlay / Death Row badges | ✅ | gated to non-profile pages per F1 v9.6.6 |
| E9 | User profile page = ZERO content massaging (the "river") | ✅ | v9.6.6 |
| E10 | AI tard suggester | ⚠ | autoTardRules array starts empty; no AI population mechanism (G2) |
| E11 | Active username analyzer | ❌ | G3; no analyzer found |
| E12 | AI hold queue (ai_hold_queue table) with j/k approve-reject | 🆕 | V11 #3 W1; biggest architectural simplifier per V11 §E.3 |
| E13 | Tard-suggestion accordion in status bar (relocated from popup) | 🆕 | V11 #23 W2; Cat2 W9 |
| E14 | Repeat-offender halo + count in Intel Drawer | 🆕 | V11 #6 W2; Cat3 F17 |
| E15 | "Hot Now" panel (replaces SIREN-to-mod-log) | 🆕 | V11 #9 W2; Cat2 W6 |
| E16 | Brigade detector (auto-flag novel-account ratio >30%) | 🆕 | V11 #25 W4; Cat3 F9 |
| E17 | Pattern Discovery (nightly Levenshtein clusters) | 🆕 | Cat3 F18 |
| E18 | Worker-side AutoMod with hot websocket scanning | 🛑 | Cat1 NOT-A-FIT — no hot stream |

---

## F. AUDIT / MERKLE / PRECEDENT

| # | Feature | Status | Evidence |
|---|---|---|---|
| F1 | `appendAuditAction` on every mutating endpoint | ✅ | hard-fail invariant |
| F2 | Merkle hash chain (HMAC + prev_hash + boundary id check) | ✅ | migration 026, 028 |
| F3 | `correlated_action` for non-mutable corrections | ✅ | invariant — `action` column immutable |
| F4 | HMAC backfill endpoint for 459 legacy NULL-hmac rows | ⚠ | endpoint exists; .ps1 wrapper invocation TIER-1 in BACKLOG |
| F5 | Audit verify (`/admin/audit/verify`) with HMAC + boundary check | ✅ | migration 026 |
| F6 | `precedents` table + `/precedent/find` keyed by kind+signature | ✅ | shipped |
| F7 | Drawer Section 6 shows top 5 precedents on subject | ✅ | shipped |
| F8 | Precedent FTS5 search (`/precedent/search` by mod/rule/action/time) | 🆕 | V11 #22 W3; Cat3 F10 |
| F9 | Action-diff audit (before/after JSON per mutating action) | 🆕 | V11 #16 W3; Cat1 #9; storage cost ~200B/row |
| F10 | Audit-event webhook firehose (real-time SIEM stream) | 🆕 | Cat1 #19 |
| F11 | Mod Audit View (`/admin/audit/mod-profile`) + AI behavior summary | 🆕 | V11 #4 W1; Cat2 W4 |
| F12 | Compliance export (CSV + hashed IDs) | 🛑 | V11 §C cut — Merkle chain IS the export |
| F13 | Forensic-grade chain integrity (R2 immutable anchor + external write-once) | 🛑 | architectural; deferred to v12+ |
| F14 | Revertible action window (undo last action ≤60s) | 🆕 | Cat1 #25 |
| F15 | Secret/env-var change audit log | 🆕 | V11 #27 W2; Cat1 #36 |

---

## G. AI INTEGRATIONS / OBSERVABILITY

| # | Feature | Status | Evidence |
|---|---|---|---|
| G1 | AI proxy with daily caps (500/mod, 5000 global) via KV | ✅ | aiPreflight; W-C-4 |
| G2 | Circuit breakers per provider (Grok / Claude / Llama) | ✅ | v8.3.0; circuitBreakerCheck |
| G3 | AI strict-prefer fallback chain (Llama-Workers → Grok → Claude) | ✅ | v8.3.0 |
| G4 | KV-backed minute rate limits per route | ✅ | v8.3.0 |
| G5 | Retry queue for failed Discord webhooks | ✅ | v8.3.0 |
| G6 | aiCallerKey bot-token-derived bucket | ⚠ | BACKLOG TS-1; bot path uses mod_username |
| G7 | Maintenance Mode (12 routines + 4 alarms) autonomous Llama | ✅ | v9.5.0 |
| G8 | Daily AI scan migrated to ai_suspect_queue pending-review state | ✅ | v8.0 amendment B |
| G9 | Provenance stamps on all AI UI | ✅ | v8.0 amendment B |
| G10 | Evidence-backed AI output schema | ✅ | v8.0 amendment B |
| G11 | AI confidence pills + severity tags | ✅ | per advocate report |
| G12 | Bug-report viewer "HTTP 403 — origin not allowed" | ❌ | F3 in handoff; advocate report; handleAdminBugReportsList origin gate too strict |
| G13 | Worker `/version` endpoint returns hardcoded "8.0.0" + v8 notes | ✅ | FIXED v9.4.8; handleVersion() now returns WORKER_VERSION dynamically |
| G14 | `/version` should read WORKER_VERSION dynamically | ✅ | SHIPPED v9.4.8 W-23 |
| G15 | Worker health metrics dashboard (rps/p99/error-rate inline widget) | 🆕 | V11 #18 W2; Cat1 #33 |
| G16 | Live worker log tail with filter chips (severity, route) | 🆕 | Cat1 #35 |
| G17 | Status banner if worker degraded | 🆕 | Cat1 #37 |
| G18 | Health-check self-test ("Diagnose my extension") | 🆕 | Cat1 #49 |
| G19 | One-click rollback to previous extension build | 🛑 | Cat1 #34 — needs CWS infra |

---

## H. UI SURFACES

### H.1 Status Bar (modtools.js ~13725)

| # | Feature | Status | Evidence |
|---|---|---|---|
| H1 | Bar layout: shield, gear, modlog, siren, snipe, bug, chat, presence, auth-lock, maint, USERS-only, BAN-only | ✅ | shipped |
| H2 | GEAR position LEFT (after shield) — final per Commander correction | ✅ | v9.6.1 |
| H3 | Tooltips overlap adjacent icons | ❌ | D1 in handoff; `.gam-tip` CSS bottom value too low |
| H4 | SHIELD click — site health snapshot brainstorm (24h actions / queue depth / firehose / chain head / sus count) | ❌ | D3; basic stub only |
| H5 | SHIELD orange unexplained | ❌ | D4; not diagnosed |
| H6 | Status bar ticker rotates "X new posts / Y modmails / N SUS" | ✅ | RULE_41 |
| H7 | Right-click context menu — universal (post / /u/ / modmail row / chat msg) | 🆕 | V11 #1 W1 — THE BIG BET |
| H8 | Presence Bar (avatar strip + status dot + page verb) | 🆕 | V11 #8 W1; Cat3 F1 |
| H9 | Live queue cursors (other-mod avatars on row) | 🆕 | V11 #20 W2; Cat3 F2 |
| H10 | Worker health metrics inline | 🆕 | V11 #18 W2 |
| H11 | Personal Stats Card (today/week/30d sparklines) in popup | 🆕 | V11 #10 W2; Cat3 F4 |

### H.2 Popup (popup.html, popup.js)

| # | Feature | Status | Evidence |
|---|---|---|---|
| H12 | Tab nav: Stats / Tokens / Tools / Lead | ✅ | v9.15.0 — "eliminated scroll-of-shame" |
| H13 | Popup tab persistence | ✅ | RULE_19 |
| H14 | Stats card with 6 click-drill cards | ✅ | shipped |
| H15 | Stats backfill for unregistered mods | ❌ | BACKLOG P2-1 |
| H16 | Stats card explanations on hover | ⚠ | BACKLOG P2-2; partially done |
| H17 | Token field UX confusing (🔑 Team vs 👑 Lead — 2-emoji distinction) | ❌ | advocate report; HANDOFF §6.2 |
| H18 | First-time popup defaults to Stats tab (showing — for unauthenticated) | ❌ | UAT_ONBOARDING; should land on Tokens with "Step 1 of 1" |
| H19 | "Force re-hydrate" surfaced TWICE in popup | ⚠ | advocate report — confusing |
| H20 | Maintenance section has 11 buttons with developer-jargon labels ("Schema migration check", "Migration debt scanner") | ❌ | advocate report — RULE_VIOLATION developer-speak in mod tool |
| H21 | "Autonomous maintenance (Llama)" buried in lead-only popup | ⚠ | advocate report — CTO dashboard inside mod popup |
| H22 | Onboarding wizard (first-run 3-button screen: link / code / token) | 🆕 | V11 §11.3 #12 |
| H23 | Brave detection + invite-link warning banner | 🆕 | V11 #15 W1; UAT_ONBOARDING |
| H24 | Search surfaced (worker `/gaw/search` exists, popup doesn't expose) | 🆕 | RULE_20; Cat1 #48 |

### H.3 Mod Console (modtools.js openModConsole)

| # | Feature | Status | Evidence |
|---|---|---|---|
| H25 | Tabs: Intel / Ban / Note / Message / Quick | ✅ | shipped |
| H26 | Macros dropdown in Ban tab | ✅ | v9.6.1 |
| H27 | Macros dropdown in Modmail tab | ❌ | A2 — wired in ban only; V11 #7 W1 |
| H28 | Z-index hierarchy (popovers > modals > backdrop; chat-panel scoped to [data-dock]) | ✅ | invariant |
| H29 | closeAllPanels covers all backdrop variants | ✅ | invariant |
| H30 | Quick-ban (right-click → "Ban [user] (default 7d / 'Hate speech')") | 🆕 | Cat2 W1 |

### H.4 Modmail Panel

| # | Feature | Status | Evidence |
|---|---|---|---|
| H31 | Slide-in 680px right panel | ✅ | shipped |
| H32 | 3-column (thread / sender intel / AI replies) | ❌ | C2 — single-column today; V11 #2 |
| H33 | Side-by-side with GAW thread | ❌ | advocate groan #6 — covers half thread |
| H34 | Per-thread brigade detector with one-click ban+remove | 🆕 | Cat2 W10 |

---

## I. DISCORD BRIDGE

| # | Feature | Status | Evidence |
|---|---|---|---|
| I1 | `/gm` slash commands global registration | ✅ | v8.2 |
| I2 | `/gm ask` (Grok-mini), `/gm g3` (Grok), `/gm l3` (Llama), `/gm chat` (Claude) | ⚠ | Claude broken pending API key re-set per PROJECT-STATUS |
| I3 | `/gm scope` (Claude → proposal → vote pipeline) | ✅ | shipped |
| I4 | `/gm propose / vote / finalize / register / help` | ✅ | shipped |
| I5 | Discord webhook on proposals (lead-channel ping) | ✅ | shipped |
| I6 | Manual `@@all` shouting in chat (no formal incident mode) | ⚠ | informal; V11 #24 formalizes |

---

## J. MAINTENANCE / OBSERVABILITY

| # | Feature | Status | Evidence |
|---|---|---|---|
| J1 | 12 user maintenance routines (modtools.js maint section) | ✅ | v9.5.0 |
| J2 | 4 lead maintenance alarms | ✅ | v9.5.0 |
| J3 | Lead health report | ⚠ | F4; partial — no AI top-10 summary |
| J4 | Backlog doc auto-generated | ✅ | v9.5.0 |
| J5 | DOM-health silent | ✅ | v8.1.5 |
| J6 | Gaw_ingest_audit table tracking firehose calls | ✅ | gaw-mod-proxy-v2.js:8546 |
| J7 | Daily AI scan with severity dropdown | ✅ | shipped |
| J8 | Ringbuffer ID-collision-bug pattern (chat-panel z-index lesson) | ✅ | invariant carried forward |
| J9 | Pre-028 boundary marker for mutated `action` rows | ⚠ | BACKLOG TS-10; one-shot D1 update pending |

---

## K. ROLLOUT / PROVISIONING

| # | Feature | Status | Evidence |
|---|---|---|---|
| K1 | 15 mods provisioned (1 lead + 14 non-lead) | ✅ | PROJECT-STATUS |
| K2 | Drive Desktop sync delivery path (Path A) | ✅ | INSTALL.md |
| K3 | Offline ZIP path (Path B) | ⚠ | UAT_ONBOARDING — buried under Path A |
| K4 | Drive "Available offline" gotcha documented | ❌ | UAT_ONBOARDING fix |
| K5 | INSTALL.md decision-tree top | ❌ | UAT_ONBOARDING fix |
| K6 | Mass token rotation generation/visibility for 14 non-lead mods | ⚠ | H4 — only catsfive live-tested |
| K7 | Bulk invite-and-email composer ("Issue all unrotated + email") | 🆕 | Cat2 W7 |
| K8 | Chrome Web Store submission | ⚠ | item ID kbhpiojnfnolhpajeccckeikefjfgnkk; blocked on screenshot upload |

---

## L. DATABASE STATE

| # | Item | Status | Note |
|---|---|---|---|
| L1 | D1 migrations 001–031 applied to gaw-audit | ✅ | confirmed |
| L2 | gaw-audit DB size | ~11 MB | per latest probe |
| L3 | actions table indexed on (author, ts, target, action) | ✅ | confirmed |
| L4 | gaw_posts FTS5 + triggers (ai/ad/au) | ✅ | migration 004 |
| L5 | gaw_comments indexed on (post_id, author, created_at, parent_id, is_removed) | ✅ | migration 004 |
| L6 | mod_modmail_responses indexed on thread/sender/mod/sent_at | ✅ | migration 031 |
| L7 | team_macros (kind, label, body, use_count, last_used_by) | ✅ | migration 022 |
| L8 | precedents (kind, signature, title, rule_ref, action, reason, source_ref, authored_by, marked_at) | ✅ | shipped |
| L9 | mod_tokens (token_hash + token plaintext fallback) | ✅ | dual-mode lookup |
| L10 | 13 still-legacy unrotated mod_tokens rows with NOT-NULL plaintext | ⚠ | BACKLOG TS-6; one-shot endpoint or wrangler d1 needed |
| L11 | Action-diff column (`actions.diff_json`) | 🆕 | V11 #16 W3 |
| L12 | `ai_hold_queue` table | 🆕 | V11 §E.3 |
| L13 | `mod_incidents` table | 🆕 | V11 #24; BACKLOG CHAT-4 |
| L14 | `ai_suspect_queue` (pending-review state) | ✅ | v8.0 |
| L15 | `audit_pre_028_boundary_id` KV | ⚠ | TS-10 deferred |

---

## M. KEYBOARD / INTERACTION

| # | Feature | Status | Evidence |
|---|---|---|---|
| M1 | Ctrl+Shift+B ban hammer on hovered post | ✅ | shipped |
| M2 | Ctrl+Shift+W watchlist on hovered post | ✅ | modtools.js:9565 |
| M3 | Ctrl+Shift+M mod console | ✅ | shipped |
| M4 | Right-click universal context menu | 🆕 | V11 #1 W1 — THE BIG BET |
| M5 | Slash command palette in chat | 🆕 | V11 #13 W2 |
| M6 | 10 new keyboard shortcuts (Q/T/E/D/U/G/N/J/K/?) | 🆕 | Cat2 §C |
| M7 | Touch targets 44×44 hit areas | ✅ | RULE_28 |
| M8 | Focus trap on modals | ✅ | RULE_16 |

---

## N. ARCHITECTURALLY DEFERRED (out of v11 scope)

| # | Item | Status | Why |
|---|---|---|---|
| N1 | C-3 version.json supply-chain RCE FULLY hardened (Sigstore) | 🛑 | needs new signing infra; mitigation today: GitHub branch protection |
| N2 | True ban-proxy (vs preflight/confirm) | 🛑 | needs GAW-side cooperation |
| N3 | Forensic chain (R2 immutable anchor + external log) | 🛑 | makes forgery infeasible vs current tamper-evident |
| N4 | PH-2/3/4/5 auth-substrate refactors | 🛑 | multi-day each; deferred multiple sessions |
| N5 | Federated cross-community ban lists | 🛑 | one-site for now; Cat1 NOT-A-FIT |
| N6 | Plugin marketplace / 3rd-party extensions | 🛑 | single closed extension |
| N7 | Real-time co-editing of mod notes | 🛑 | conflict-resolution cost > benefit |
| N8 | SCIM/IdP user provisioning | 🛑 | enterprise theater for 15-mod team |
| N9 | Hardware-key 2FA for every action | 🛑 | friction kills speed |
| N10 | Worker-side AutoMod with hot websocket | 🛑 | no hot stream available |

---

## O. CROSS-REFERENCES

- **V11_PLAN.md** — Opus-CTO synthesis from CAT1/2/3 (today AM); top-30 features, 4 release waves
- **V11_CAT1_CMS_AUDIT.md** — 50-feature catalog from external moderation tools
- **V11_CAT2_UX_FLOWS.md** — 10 core workflows + missing atomic actions + dashboards
- **V11_CAT3_TEAM_INTEL.md** — presence + incident mode + precedent engine + coaching
- **UAT_BANS_2026-05-08.md** — ban pipeline code-trace verification
- **UAT_MODMAIL_2026-05-08.md** — modmail pipeline + 80% automation feasibility (verdict: NO from current arch)
- **UAT_TOKENS_2026-05-08.md** — token lifecycle + state machine
- **UAT_ONBOARDING_2026-05-08.md** — fresh-mod day-1 friction map (composite 5.8/10)
- **UAT_ADVOCATE_2026-05-08.md** — user's-voice walkthrough (groans + delights)
- **150_RULES_AUDIT.md** — Commander's 150 non-negotiables, status by rule
- **HANDOFF_UX_AUTH_2026-05-07.md** — yesterday's mission + ask audit (sections superseded by V11_PLAN where overlapping)
- **AGENT_BRIEF.md / BACKLOG.md / FEATURES_INDEX.md** — terse working refs
- **PROJECT-STATUS.md** — STALE (2026-04-29; says v8.3.4); use this matrix instead

---

## P. HEADLINE NUMBERS

- Extension: **v10.2.0** (manifest + modtools.js VERSION constant)
- Worker: **v9.4.8** (WORKER_VERSION dynamically returned by handleVersion())
- Worker `/version` endpoint string: **WORKER_VERSION** (dynamic as of v9.4.8; G13/G14 fixed)
- Endpoints: **~120**
- D1 migrations: **001–031**
- Mods: **15** (1 lead, 14 non-lead)
- Languages: **JS only** (no TS in repo)
- AI providers: **Llama Workers (primary) → Grok → Claude (fallback chain)**
- AI budgets: **500 calls/mod/day, 5000/global/day**
- Firehose batch cap: **500 posts/comments per ingest**

---

**Composite advocate-mode score (per UAT_ADVOCATE):** 22/30 minutes spent doing real work; 8 minutes fighting the tool. **Score: 5.8/10 onboarding** / **3✅ 2⚠ 2❌ on Bill-of-Rights.**

**Top friction holes still open after v9.24.0:**
1. Brave invite-link param strip (silent)
2. Token field UX (🔑 vs 👑 too subtle)
3. ~~Modmail macros NOT in modmail tab (A2)~~ — SHIPPED v9.8.0 (C12 corrected)
4. Bug-report viewer 403 (F3)
5. Auto-unsticky regressed since v8.6.4 (E1)
6. AI used flag never set true (B9 / C4 — wired but inert)
7. Tooltip Y-offset (D1)
8. Shield orange undiagnosed (D4)
9. Maintenance section developer-jargon
10. No right-click context menu yet (V11 #1 — biggest single compression dividend)

This matrix is the authoritative current-state baseline. **Use it instead of PROJECT-STATUS.md (stale).**
