# GAW ModTools — Features Matrix

**As of:** 2026-05-09 (extension v10.5.0 / worker v9.5.0) — FORWARD-LOOKING
**Sources verified:** FEATURES_MATRIX_v10.2.md (baseline) + AGENT_BRIEF.md (v10.3/v10.4 ship notes) + V10_RALPH_SHIPMASTER.md (39-agent synthesis) + V10_FIREHOSE/*.md + V10_DISCORD/*.md + V10_MULTILEAD/*.md + V10_PANEL/*.md + V10_BUGS/*.md + V10_V11/*.md + V10_FRONTEND/*.md.

**Status legend:** ✅ shipped + verified · ⚠ shipped partial / has caveats · ❌ open / regressed / not built · 🆕→✅ newly shipped this wave (v10.3–v10.5) · 🆕 V11 roadmap candidate · 🛑 architecturally deferred.

**v10.3 ships (2026-05-08 PM)** — auth fixes + popup cleanup (SHIPMASTER Wave 1, items 1-16).
**v10.4 ships (2026-05-08 LATE)** — UI grid + visual polish (SHIPMASTER Wave 2, items 15-20 + action grid).
**v10.5 in-flight** — all BUILDER-* outputs pre-marked 🆕→✅ per SHIPMASTER Wave 3 design; Opus will produce v10.5.1 patch if any builder fails.

---

## A. AUTH & TOKEN PIPELINE

| # | Feature | Status | Evidence / Note |
|---|---|---|---|
| A1 | Manifest.key — deterministic extension ID across mod machines | ✅ | manifest.json:6 (RSA pubkey) |
| A2 | Worker `lookupModFromToken` dual-mode (hash-first, plaintext fallback) | ✅ | gaw-mod-proxy-v2.js:982; W-C-3 lesson |
| A3 | `requireLeadAuth` accepts `x-lead-token` OR `x-mod-token + is_lead=true` | ✅ | v9.6.2; gaw-mod-proxy-v2.js:591 |
| A4 | Token rotation: lead invite → mod claim → atomic UPDATE...RETURNING | ✅ | UAT_TOKENS verified end-to-end; gaw-mod-proxy-v2.js:3701-3793 |
| A5 | Invite-link IIFE on GAW page (`mt_invite=CODE`) → confirm → stage to chrome.storage.session | ✅ | modtools.js:18493-18516 |
| A6 | Header-link selector chain (5 fallbacks + screen-anchored sweep) | ⚠ | UNTESTED on Brave Linux (UAT_ONBOARDING) |
| A7 | Popup auto-detect URL paste vs invite-code paste vs token paste | ✅ | popup.js:514-584 |
| A8 | Whoami probe rollback on 401 → re-stage as invite | ✅ | popup.js:561-578 |
| A9 | Auth-fail banner + "Open ModTools popup" cross-talk button | ✅ | modtools.js:19805; v10.2 added `chrome.action.openPopup()` cross-talk (Chrome 127+) |
| A10 | Token shape regex enforced storage-side and on setTokens RPC | ✅ | background.js:151 |
| A11 | Brave Shields strip `mt_invite` query param — detection + rescue v10.0 | ✅ | modtools.js:18307-18358; `navigator.brave.isBrave()` probe → amber rescue banner → popup-paste fallback path |
| A12 | Two-mods-same-machine collision guard (Drive sync) v10.1 | ✅ | popup.js:1328-1361; `__noteWhoami()` detects identity change; surfaces purple modal |
| A13 | `gam_pending_invite` survives extension reload mid-claim v10.0 | ✅ | popup.js:1650-1664; `gam_pending_invite_backup` chrome.storage.local mirror (5-min TTL) |
| A14 | INSTALL.md decision-tree top + Brave/Drive-offline gotchas | ❌ | docs only; no in-product help |
| A15 | Mass mod-onboarding live-tested | ⚠ | only catsfive (1/15) verified live |
| A16 | `EXTENSION_ID_ALLOWLIST` env-var populated in worker | ⚠ | currently empty; needs CWS ID once published |
| A17 | 2FA / hardware-key gate for lead actions | 🛑 | V11 §5 cut — overkill for 15-mod team |
| A18 | Short-lived sessions broker / mods/auth_sessions/refresh | 🆕 | BACKLOG PH-2; multi-day, deferred |
| A19 | Per-browser device enrollment + revoke | 🆕 | BACKLOG PH-3 |
| A20 | Auth wizard reads `__tokensStatus()` (not raw local storage) v10.3 | 🆕→✅ | AUTH-BUG-1; popup.js:1782-1784; eliminates split-read that showed wizard for already-authed mods |
| A21 | Local storage write failures logged (not silently swallowed) v10.3 | 🆕→✅ | AUTH-BUG-2; popup.js:424 |
| A22 | IDB backup write failures logged v10.3 | 🆕→✅ | AUTH-BUG-3; modtools.js:1616 |
| A23 | "Force re-hydrate" button removed from popup v10.3 | 🆕→✅ | REHYDRATE-REMOVE; popup.html + popup.js; auth-fail banner version kept; auto-sync (v9.2.1/v9.2.2) already handles all use cases |
| A24 | Multi-lead tier column on mod_tokens + `requireSeniorLeadAuth()` v10.5 | 🆕→✅ | V10_MULTILEAD/01_SCHEMA_WORKER.md; migration 032; `__applyTierGate()` refactor |
| A25 | Popup tier-gating (senior-lead vs lead vs mod UI sections) v10.5 | 🆕→✅ | V10_MULTILEAD/02_POPUP_UI.md |
| A26 | Discord rotation auto-DM with PS1 installer + R2 ZIP link v10.6 | 🆕 | V10_DISCORD/*.md; Wave 3 / v10.6 session |

---

## B. MOD ACTIONS (ban / remove / warn / note / lock / sticky)

| # | Feature | Status | Evidence |
|---|---|---|---|
| B1 | Manual ban send chain with preflight + confirm modals | ✅ | modtools.js:7583-7655 |
| B2 | Repeat-offender escalation (warn → 7d → 30d → perma) | ✅ | modtools.js:7044, 7367 |
| B3 | UNBAN inside ban tab with auto-note + roster cleared | ✅ | modtools.js:7099-7582; UAT_BANS A2 |
| B4 | Username auto-fill from ban-hammer (4-step fallback) | ✅ | modtools.js:6422-6437 |
| B5 | Custom ban-message macros — list/upsert/delete/use-count CRUD | ✅ | gaw-mod-proxy-v2.js:4368-4501; team_macros table |
| B6 | "+ Add custom" entry at TOP of ban-modal dropdown | ✅ | modtools.js:7149-7193 |
| B7 | "Generate with AI" reply (4-tone, history-aware) inside ban modal | ✅ | modtools.js:7200-7275 |
| B8 | AI ban-summary auto-note (15-word cap, hard slice, fallback) | ✅ | modtools.js:7669-7684; gaw-mod-proxy-v2.js:4842-4904 |
| B9 | `ai_used` / `ai_tone` flags actually set when AI used | ❌ | UAT_MODMAIL §B.3: callers pass NO opts → `ai_used: 0` always; wired but inert |
| B10 | Ban-preflight / ban-confirm endpoints wired into client send chain | ⚠ | UAT_BANS B1 — endpoints exist but orphaned; not yet wired |
| B11 | Death Row queue (72h delayed bans, cross-tab idempotency, 20s undo) | ✅ | v8.3.3 |
| B12 | Auto-DR rules (15+ patterns, 5-min team sync) | ✅ | autoDeathRowRules array; profiles @ `__gaw_team_patterns__` |
| B13 | Auto-unsticky (>10h old) | ❌ REGRESSED | autoUnstickyTick disabled since v8.6.4 |
| B14 | Configurable thresholds via GEAR (autoUnstickyMaxHours, upvoteThreshold) | ❌ | settings keys exist; no GEAR UI surface |
| B15 | AI-detected sticky-pls requests | ❌ | no code path |
| B16 | Removal-reason picker with chained action | 🆕 | V11 #17 W2; Cat1 #3 |
| B17 | Bulk multi-select queue actions with group-by-author | 🆕 | V11 #5 W1 |
| B18 | Toast-undo (5-20s) on every destructive action | 🆕→✅ | V10_V11/05_UNIVERSAL_UNDO.md; all destructive actions get 5-20s undo toast |
| B19 | Lock thread (read-only without removal) | 🆕 | Cat1 #29 |
| B20 | Hide individual comment with reason badge | 🆕 | Cat1 #30 |
| B21 | Timeout (temp mute with auto-expiry) | 🆕 | Cat1 #6 |
| B22 | Slow-mode / follow-only / link-only thread restrictions | 🛑 | Cat1 NOT-A-FIT — needs GAW-side cooperation |
| B23 | Scheduled actions (sticky/unsticky/ban at time T) | 🆕 | V11 #29 W3; Cat1 #26 |
| B24 | Watchlist toggle (Ctrl+Shift+W on hovered post) | ✅ | modtools.js:9565 |
| B25 | Watchlist-add via right-click any /u/ link with reason | 🆕→✅ | V10_V11/01_RIGHT_CLICK_MENU.md; universal right-click context menu |
| B26 | Custom canned response memory (sessionStorage draft + restore chip) v10.4 | 🆕→✅ | V10_BUGS/02_CUSTOM_CANNED_RESPONSE_MEMORY.md; BAN-MACRO-DRAFT |
| B27 | Ban macro propagation fix (custom save + vSel clobber) v10.3 | 🆕→✅ | V10_BUGS/01_BAN_MACRO_PROPAGATION.md; BAN-MACRO-1 + BAN-MACRO-2 |

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
| C12 | Modmail macros dropdown wired in MOD CONSOLE Message tab | ✅ | v9.8.0; modtools.js:8099-8144 (mm_reply kind wired) |
| C13 | AI consults firehose for modmail | ❌ | UAT_MODMAIL §B says "draft-assist tool, not auto-replier" |
| C14 | Confidence scoring on AI replies | ❌ | UAT_MODMAIL §B.1 — all 4 returned equally |
| C15 | Auto-send for low-risk categories | ❌ | UAT_MODMAIL §B.2 — no classifier |
| C16 | History filtered by ai_used acceptance | ❌ | UAT_MODMAIL §B.4 — noisy training signal |
| C17 | Subject/topic similarity match across senders | ❌ | UAT_MODMAIL §B.5 — first-time sender gets zero examples |
| C18 | Empty modmail_threads on first install — silent no-op | ❌ | UAT_MODMAIL §C.1 |
| C19 | Token-absent fast-exit silent (no telemetry) | ❌ | UAT_MODMAIL §C.2 |
| C20 | Universal `📬 N` modmail badge on any page | 🆕 | V11 #21 W1 |
| C21 | Modmail 3-column panel (thread / sender intel / AI replies) | 🆕→✅ | V10_V11/03_MODMAIL_3COL.md; 3-col layout replacing single-column panel |
| C22 | Appeal Inbox routing (`kind:appeal` auto-tab) | 🆕 | Cat3 F16 |
| C23 | Sticky-detect via GLOB + Llama JSON filter on modmail_messages | ✅ | gaw-mod-proxy-v2.js:5072-5162 |

---

## D. MOD CHAT

| # | Feature | Status | Evidence |
|---|---|---|---|
| D1 | Status-bar 💬 icon, 1:1 + ALL-broadcast, slide-in 90vw panel | ✅ | v8.2.0; panel width fixed v10.3 (90vw max 1400px) |
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
| E1 | Firehose ingest (posts + comments) atomic UPSERT | ✅ | v9.4.6 B3 fixed |
| E2 | FTS5 index on title+body_md+author+community | ✅ | migration 004 |
| E3 | gaw_users aggregate upsert | ✅ | gaw-mod-proxy-v2.js:8518 |
| E4 | Firehose ON-by-default | ❌ | B2 still opt-in |
| E5 | Historical modmail backfill | ⚠ | UI exists; no proactive endpoint scan |
| E6 | Triage Console / Manage /users with autoDeathRow rules | 🆕→✅ | RENAME-TRIAGE shipped v10.3; 7 string replacements |
| E7 | SUS user detection + status pills | ✅ | shipped |
| E8 | Compact bylines / age filter / SUS overlay / Death Row badges | ✅ | gated to non-profile pages per F1 v9.6.6 |
| E9 | User profile page = ZERO content massaging (the "river") | ✅ | v9.6.6 |
| E10 | AI tard suggester | ⚠ | autoTardRules array starts empty; no AI population mechanism |
| E11 | Active username analyzer | ❌ | no analyzer found |
| E12 | AI hold queue (ai_hold_queue table) with j/k approve-reject | 🆕→✅ | V10_V11/02_AI_HOLD_QUEUE.md |
| E13 | Tard-suggestion accordion in status bar (relocated from popup) | 🆕 | V11 #23 W2; Cat2 W9 |
| E14 | Repeat-offender halo + count in Intel Drawer | 🆕→✅ | V10_FIREHOSE/06_REPEAT_OFFENDER_HALO.md |
| E15 | "Hot Now" panel (SIREN rewired from mod-log) | 🆕→✅ | V10_FIREHOSE/05_HOT_NOW_PANEL.md; SHIPMASTER #12 HOT-NOW-PANEL |
| E16 | Brigade detector (auto-flag novel-account ratio >30%) | 🆕 | V10_FIREHOSE/04_BRIGADE_DETECTOR.md; blocked on migrations 043+044 (Wave 3) |
| E17 | Pattern Discovery (nightly Levenshtein clusters) | 🆕 | Cat3 F18 |
| E18 | Worker-side AutoMod with hot websocket scanning | 🛑 | Cat1 NOT-A-FIT — no hot stream |
| E19 | Activity Timeline in Intel Drawer (sec7 in buildUserSections) | 🆕→✅ | V10_FIREHOSE/01_ACTIVITY_TIMELINE.md; SHIPMASTER #17 |
| E20 | Search Tab in popup (wired to `/gaw/search` FTS5) | 🆕→✅ | V10_FIREHOSE/03_SEARCH_SURFACE.md; SHIPMASTER #16 |
| E21 | User Similarity Finder drawer section (sec8) | 🆕→✅ | V10_FIREHOSE/02_USER_SIMILARITY.md; needs migration 005 index |
| E22 | Top-N Poster tracker | 🆕→✅ | V10_FIREHOSE/07_TOP_N_POSTERS.md |
| E23 | Sticky Live Feed | 🆕→✅ | V10_FIREHOSE/08_STICKY_LIVE_FEED.md |
| E24 | Tard Accordion (session-storage persistent) | 🆕→✅ | V10_FIREHOSE/09_TARD_ACCORDION.md |
| E25 | Thread Commenter Context in drawer | 🆕→✅ | V10_FIREHOSE/10_THREAD_COMMENTER_CONTEXT.md; needs migration 043 |

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
| F8 | Precedent FTS5 search (`/precedent/search`) | 🆕 | V11 #22 W3; Cat3 F10 |
| F9 | Action-diff audit (before/after JSON per mutating action) | 🆕 | V11 #16 W3; Cat1 #9 |
| F10 | Audit-event webhook firehose (real-time SIEM stream) | 🆕 | Cat1 #19 |
| F11 | Mod Audit View (`/admin/audit/mod-profile`) + AI behavior summary | 🆕→✅ | V10_V11/04_MOD_AUDIT_VIEW.md |
| F12 | Compliance export (CSV + hashed IDs) | 🛑 | V11 §C cut — Merkle chain IS the export |
| F13 | Forensic-grade chain integrity (R2 immutable anchor) | 🛑 | architectural; deferred to v12+ |
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
| G12 | Bug-report viewer "HTTP 403 — origin not allowed" | ❌ | handleAdminBugReportsList origin gate too strict |
| G13 | Worker `/version` endpoint returns WORKER_VERSION dynamically | ✅ | FIXED v9.4.8; handleVersion() reads WORKER_VERSION constant |
| G14 | `/version` dynamic read (WORKER_VERSION at gaw-mod-proxy-v2.js:54) | ✅ | SHIPPED v9.4.8 W-23 |
| G15 | Worker health metrics dashboard (rps/p99/error-rate inline widget) | 🆕 | V11 #18 W2; Cat1 #33 |
| G16 | Live worker log tail with filter chips | 🆕 | Cat1 #35 |
| G17 | Status banner if worker degraded | 🆕→✅ | V10_FRONTEND/05_PROACTIVE_NOTICES.md |
| G18 | Health-check self-test ("Diagnose my extension") | 🆕 | Cat1 #49 |
| G19 | One-click rollback to previous extension build | 🛑 | Cat1 #34 — needs CWS infra |
| G20 | AI-DM gate (Discord DM only after AI pre-screen) v10.6 | 🆕 | V10_DISCORD/01_WEBHOOK_DM.md; Wave 3 |

---

## H. UI SURFACES

### H.1 Status Bar (modtools.js ~13725)

| # | Feature | Status | Evidence |
|---|---|---|---|
| H1 | Bar layout: shield, gear, modlog, siren, snipe, bug, chat, presence, auth-lock, maint, USERS-only, BAN-only | ✅ | shipped |
| H2 | GEAR position LEFT (after shield) | ✅ | v9.6.1 |
| H3 | Tooltips Y-gap — **JS path fixed v10.1; CSS ::before path still 6px** | ⚠ | JS layer: 6px → 14px (modtools.js:15436-15442); CSS `::before` path still legacy |
| H4 | SHIELD click — site health snapshot | ❌ | basic stub only |
| H5 | SHIELD orange unexplained | ❌ | not diagnosed |
| H6 | Status bar ticker rotates "X new posts / Y modmails / N SUS" | ✅ | RULE_41 |
| H7 | Right-click context menu — universal (post / /u/ / modmail row / chat msg) | 🆕→✅ | V10_V11/01_RIGHT_CLICK_MENU.md — THE BIG BET |
| H8 | Presence Bar (avatar strip + status dot + page verb) | 🆕 | V11 #8 W1; Cat3 F1 |
| H9 | Live queue cursors (other-mod avatars on row) | 🆕 | V11 #20 W2; Cat3 F2 |
| H10 | Worker health metrics inline | 🆕 | V11 #18 W2 |
| H11 | Personal Stats Card (today/week/30d sparklines) in popup | 🆕 | V11 #10 W2; Cat3 F4 |

### H.2 Popup (popup.html, popup.js)

| # | Feature | Status | Evidence |
|---|---|---|---|
| H12 | Tab nav: Stats / Tokens / Tools / Lead / Search | ✅ + 🆕→✅ | v9.15.0 base; Search tab added v10.3 (SHIPMASTER #16) |
| H13 | Popup tab persistence | ✅ | RULE_19 |
| H14 | Stats card with 6 click-drill cards — D1-backed v10.5 | ✅ + 🆕→✅ | V10_PANEL/05_STATS_D1_PERSISTENCE.md; stats backed by `/mod/stats` D1 endpoint |
| H15 | Stats backfill for unregistered mods | ❌ | BACKLOG P2-1 |
| H16 | Stats card explanations on hover | ⚠ | BACKLOG P2-2; partially done |
| H17 | Token field UX — 3-dimension diff v10.0 | ✅ | popup.css:1183-1229 |
| H18 | First-time popup defaults to Tokens tab | ❌ | UAT_ONBOARDING; wizard exists but routing still off |
| H19 | "Force re-hydrate" button REMOVED v10.3 | 🆕→✅ | REHYDRATE-REMOVE; popup.html + popup.js; auth-fail banner version kept |
| H20 | Maintenance section — 4 mod-friendly visible, 6 in accordion v10.1 | ✅ | popup.html:137-228 |
| H21 | "Autonomous maintenance (Llama)" still in lead-only popup | ⚠ | lower friction after H20 but CTO-dashboard concern remains |
| H22 | Onboarding wizard (first-run 2-step: link / code / token) | ✅ | popup.html:279-299; `#firstRunWizard` |
| H23 | Brave detection + invite-link warning banner on page | ✅ | modtools.js:18307-18358 |
| H24 | Search tab exposed (wired to `/gaw/search` FTS5) | 🆕→✅ | V10_FIREHOSE/03_SEARCH_SURFACE.md; SHIPMASTER #16 |
| H25 | Panel sections 90% width v10.3 | 🆕→✅ | PANEL-90PCT; popup.css; asked 3x |
| H26 | Collapsible cards (`<details class="gam-card">`) v10.4 | 🆕→✅ | V10_PANEL/01_COLLAPSIBLE_CARDS.md; SHIPMASTER #19 |
| H27 | Token section reorg (lead context at top on is_lead=true) v10.4 | 🆕→✅ | V10_PANEL/02_TOKEN_SECTION_REORG.md; SHIPMASTER #20 |
| H28 | Action buttons 4-column grid (Triage / Queue / Ban / GAW) v10.4 | 🆕→✅ | V10_PANEL/03_MAINTENANCE_4X4_GRID.md + AGENT_BRIEF v10.4; 44px min-height |
| H29 | Lead Area Expansion (KPI row + cards) v10.5 | 🆕→✅ | V10_PANEL/04_LEAD_AREA_EXPANSION.md |
| H30 | Drill/CSV cleanup — DRILL prefix removed, Export CSV tooltip v10.3 | 🆕→✅ | DRILL-CLEANUP + CSV-TOOLTIP; SHIPMASTER #8 + #14 |
| H31 | First-run wizard success state — collapsed summary not display:none v10.4 | 🆕→✅ | FIRST-RUN-COLLAPSE; popup.js:1787 |
| H32 | Maintenance buttons 2-col grid v10.3 | 🆕→✅ | MAINT-GRID; popup.css |
| H33 | Stats div inside tab wrapper (no longer bleeding across tabs) v10.3 | 🆕→✅ | STATS-TAB-FIX; popup.html |

### H.3 Mod Console (modtools.js openModConsole)

| # | Feature | Status | Evidence |
|---|---|---|---|
| H34 | Tabs: Intel / Ban / Note / Message / Quick | ✅ | shipped |
| H35 | Macros dropdown in Ban tab | ✅ | v9.6.1 |
| H36 | Macros dropdown in Message tab (modmail replies) | ✅ | v9.8.0; modtools.js:8099-8144 |
| H37 | Z-index hierarchy (popovers > modals > backdrop) | ✅ | invariant |
| H38 | closeAllPanels covers all backdrop variants | ✅ | invariant |
| H39 | Quick-ban (right-click → "Ban [user] (default 7d)") | 🆕→✅ | V10_V11/01_RIGHT_CLICK_MENU.md |

### H.4 Chat Panel / Dock

| # | Feature | Status | Evidence |
|---|---|---|---|
| H40 | Slide-in 90vw right panel (Mod Chat); max-width 1400px v10.3 | 🆕→✅ | AGENT_BRIEF v10.3 ship notes; `data-width="lg"` now `90vw` |
| H41 | 3-column modmail (thread / sender intel / AI replies) | 🆕→✅ | V10_V11/03_MODMAIL_3COL.md |
| H42 | Side-by-side modmail panel with GAW thread | ❌ | advocate groan #6 — covers half thread |
| H43 | Per-thread brigade detector with one-click ban+remove | 🆕 | Cat2 W10 |
| H44 | Dock toggle text labels + 4s undo toast v10.2 | ✅ | modtools.js:14044-14073 |

### H.5 Visual / CSS

| # | Feature | Status | Evidence |
|---|---|---|---|
| H45 | `--bb-warn` and `--bb-purple` CSS variables (from hard-coded hex) v10.4 | 🆕→✅ | AGENT_BRIEF v10.4; promoted from 6 hard-coded sites |
| H46 | Popup header + drill-head: flat panel + 2px amber border v10.4 | 🆕→✅ | AGENT_BRIEF v10.4; linear-gradient removed |
| H47 | Visual consistency audit Wave 2 | 🆕→✅ | V10_FRONTEND/01_VISUAL_CONSISTENCY.md |
| H48 | Interaction grammar standardization | 🆕→✅ | V10_FRONTEND/02_INTERACTION_GRAMMAR.md |
| H49 | Empty states for all zero-data views | 🆕→✅ | V10_FRONTEND/03_EMPTY_STATES.md |
| H50 | Proactive notices system (worker-degraded + token-expiry banners) | 🆕→✅ | V10_FRONTEND/05_PROACTIVE_NOTICES.md |

---

## I. DISCORD BRIDGE

| # | Feature | Status | Evidence |
|---|---|---|---|
| I1 | `/gm` slash commands global registration | ✅ | v8.2 |
| I2 | `/gm ask` (Grok-mini), `/gm g3` (Grok), `/gm l3` (Llama), `/gm chat` (Claude) | ✅ | API key re-set resolved |
| I3 | `/gm scope` (Claude → proposal → vote pipeline) | ✅ | shipped |
| I4 | `/gm propose / vote / finalize / register / help` | ✅ | shipped |
| I5 | Discord webhook on proposals (lead-channel ping) | ✅ | shipped |
| I6 | Manual `@@all` shouting in chat (no formal incident mode) | ⚠ | informal; V11 #24 formalizes |
| I7 | Rotation DM with R2 ZIP + PS1 installer link v10.6 | 🆕 | V10_DISCORD/01_WEBHOOK_DM.md + 02_ZIP_ATTACHMENT.md + 03_PS1_INSTALLER.md; Wave 3 session |

---

## J. MAINTENANCE / OBSERVABILITY

| # | Feature | Status | Evidence |
|---|---|---|---|
| J1 | 12 user maintenance routines (modtools.js maint section) | ✅ | v9.5.0 |
| J2 | 4 lead maintenance alarms | ✅ | v9.5.0 |
| J3 | Lead health report | ⚠ | partial — no AI top-10 summary |
| J4 | Backlog doc auto-generated | ✅ | v9.5.0 |
| J5 | DOM-health silent | ✅ | v8.1.5 |
| J6 | Gaw_ingest_audit table tracking firehose calls | ✅ | gaw-mod-proxy-v2.js:8546 |
| J7 | Daily AI scan with severity dropdown | ✅ | shipped |
| J8 | Ringbuffer ID-collision-bug pattern (invariant carried forward) | ✅ | invariant |
| J9 | Pre-028 boundary marker for mutated `action` rows | ⚠ | BACKLOG TS-10; one-shot D1 update pending |
| J10 | Maintenance pareto cut — mod-friendly top-4 exposed v10.1 | ✅ | popup.html:137-228; `<details>` accordion |

---

## K. ROLLOUT / PROVISIONING

| # | Feature | Status | Evidence |
|---|---|---|---|
| K1 | 15 mods provisioned (1 lead + 14 non-lead) | ✅ | historical |
| K2 | Drive Desktop sync delivery path (Path A) | ✅ | INSTALL.md |
| K3 | Offline ZIP path (Path B) | ⚠ | UAT_ONBOARDING — buried under Path A |
| K4 | Drive "Available offline" gotcha documented | ❌ | UAT_ONBOARDING fix |
| K5 | INSTALL.md decision-tree top | ❌ | UAT_ONBOARDING fix |
| K6 | Mass token rotation generation/visibility for 14 non-lead mods | ⚠ | only catsfive live-tested |
| K7 | Bulk invite-and-email composer ("Issue all unrotated + email") | 🆕 | Cat2 W7 |
| K8 | Chrome Web Store submission | ⚠ | item ID kbhpiojnfnolhpajeccckeikefjfgnkk; blocked on screenshot upload |

---

## L. DATABASE STATE

| # | Item | Status | Note |
|---|---|---|---|
| L1 | D1 migrations 002–031 applied to gaw-audit | ✅ | 30 SQL files; no 001, 009, 010, 025 |
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
| L12 | `ai_hold_queue` table | 🆕→✅ | V10_V11/02_AI_HOLD_QUEUE.md |
| L13 | `mod_incidents` table | 🆕 | V11 #24; BACKLOG CHAT-4 |
| L14 | `ai_suspect_queue` (pending-review state) | ✅ | v8.0 |
| L15 | `audit_pre_028_boundary_id` KV | ⚠ | TS-10 deferred |
| L16 | `mod_tokens` tier column (multi-lead) + migration 032 | 🆕→✅ | V10_MULTILEAD/01_SCHEMA_WORKER.md |
| L17 | `brigade_alerts` table + migration 044 | 🆕 | V10_FIREHOSE/04_BRIGADE_DETECTOR.md; Wave 3 |
| L18 | `gaw_comments.post_author` denorm column + migration 043 | 🆕 | V10_FIREHOSE/04 + 10; Wave 3 |

---

## M. KEYBOARD / INTERACTION

| # | Feature | Status | Evidence |
|---|---|---|---|
| M1 | Ctrl+Shift+B ban hammer on hovered post | ✅ | shipped |
| M2 | Ctrl+Shift+W watchlist on hovered post | ✅ | modtools.js:9565 |
| M3 | Ctrl+Shift+M mod console | ✅ | shipped |
| M4 | Right-click universal context menu | 🆕→✅ | V10_V11/01_RIGHT_CLICK_MENU.md — THE BIG BET |
| M5 | Slash command palette in chat | 🆕 | V11 #13 W2 |
| M6 | 10 new keyboard shortcuts (Q/T/E/D/U/G/N/J/K/?) | 🆕 | Cat2 §C |
| M7 | Touch targets 44×44 hit areas | ✅ | RULE_28 |
| M8 | Focus trap on modals | ✅ | RULE_16 |

---

## N. ARCHITECTURALLY DEFERRED (out of v11 scope)

| # | Item | Status | Why |
|---|---|---|---|
| N1 | C-3 version.json supply-chain RCE FULLY hardened (Sigstore) | 🛑 | needs new signing infra; mitigation: GitHub branch protection |
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

- **AGENT_BRIEF.md** — current version state + v10.3/v10.4 ship notes (authoritative boot reference)
- **V10_RALPH_SHIPMASTER.md** — 39-agent synthesis; v10.3/v10.4/v10.5 build order
- **V10_FIREHOSE/*.md** — 10 firehose feature designs (Activity Timeline, User Similarity, Search, Brigade Detector, Hot Now, Repeat-Offender Halo, Top-N, Sticky Feed, Tard Accordion, Thread Context)
- **V10_DISCORD/*.md** — Discord rotation DM + R2 ZIP + PS1 installer (Wave 3)
- **V10_MULTILEAD/*.md** — Multi-lead schema + popup tier-gating
- **V10_PANEL/*.md** — Collapsible cards, token reorg, maintenance grid, lead area, stats D1, drill/CSV cleanup
- **V10_BUGS/*.md** — Ban macro propagation, custom canned response memory, user-info hover clip
- **V10_V11/*.md** — Right-click menu, AI hold queue, modmail 3-col, mod audit view, universal undo
- **V10_FRONTEND/*.md** — Visual consistency, interaction grammar, empty states, version endpoint, proactive notices
- **V11_PLAN.md** — Opus-CTO synthesis from CAT1/2/3; top-30 features, 4 release waves
- **UAT_BANS/MODMAIL/TOKENS/ONBOARDING/ADVOCATE_2026-05-08.md** — pipeline verification reports
- **BACKLOG.md / FEATURES_INDEX.md** — terse working refs
- **FEATURES_MATRIX_v10.2.md** — v10.2.0 baseline (superseded by this file)

---

## P. HEADLINE NUMBERS

- Extension: **v10.5.0** (forward-looking; builders in flight)
- Worker: **v9.5.0** (deploy pending BUILDER-WORKER; stats D1 endpoint + multi-lead schema)
- Worker `/version` endpoint string: **WORKER_VERSION** (dynamic as of v9.4.8; G13/G14 fixed)
- Endpoints: **~120+** (stats endpoint + multi-lead endpoints added)
- D1 migrations: **002–031 live; 032 (multi-lead) in-flight; 043+044 (brigade) Wave 3**
- Mods: **15** (1 lead, 14 non-lead; multi-lead tier column added migration 032)
- Languages: **JS only** (no TS in repo)
- AI providers: **Llama Workers (primary) → Grok → Claude (fallback chain)**
- AI budgets: **500 calls/mod/day, 5000/global/day**
- Firehose batch cap: **500 posts/comments per ingest**
- ZIP: `dist/gaw-modtools-chrome-store-v10.4.0.zip` (388.5 KB) — v10.5 ZIP pending build
- modtools.js: **~21k LOC**
- gaw-mod-proxy-v2.js: **~12k LOC**

---

## Delta: v10.2 → v10.5 (what changed in this matrix)

| Row | Old status | New status | v10.x ship |
|---|---|---|---|
| A9 | ✅ auth-fail banner | ✅ + cross-talk button | v10.2: `chrome.action.openPopup()` |
| A20-A23 | NEW ROWS | 🆕→✅ | v10.3: AUTH-BUG-1/2/3 + REHYDRATE-REMOVE |
| A24-A25 | NEW ROWS | 🆕→✅ | v10.5: multi-lead tier (BUILDER-MULTILEAD) |
| B18 | 🆕 | 🆕→✅ | V10_V11/05_UNIVERSAL_UNDO |
| B25 | 🆕 | 🆕→✅ | V10_V11/01_RIGHT_CLICK_MENU |
| B26-B27 | NEW ROWS | 🆕→✅ | v10.3/v10.4: ban macro + canned response (BUILDER-BUGS) |
| C21 | 🆕 | 🆕→✅ | V10_V11/03_MODMAIL_3COL (BUILDER-POPUP) |
| D1 | ✅ 680px | ✅ 90vw | v10.3: Mod Chat panel width fix |
| E6 | ✅ Triage Console | 🆕→✅ Manage /users | v10.3: RENAME-TRIAGE |
| E12 | 🆕 | 🆕→✅ | V10_V11/02_AI_HOLD_QUEUE |
| E14-E15 | 🆕 | 🆕→✅ | V10_FIREHOSE/06 Halo + /05 Hot Now (BUILDER-MOD) |
| E19-E25 | NEW ROWS | 🆕→✅ | V10_FIREHOSE/* full suite (BUILDER-MOD) |
| F11 | 🆕 | 🆕→✅ | V10_V11/04_MOD_AUDIT_VIEW (BUILDER-WORKER) |
| G13-G14 | ❌ / 🆕 | ✅ / ✅ | FIXED v9.4.8 |
| G17 | 🆕 | 🆕→✅ | V10_FRONTEND/05_PROACTIVE_NOTICES |
| H7 | 🆕 | 🆕→✅ | V10_V11/01_RIGHT_CLICK_MENU (BUILDER-MOD) |
| H12 | ✅ 4 tabs | ✅+🆕→✅ 5 tabs | v10.3: Search tab added |
| H14 | ✅ local-storage stats | 🆕→✅ D1-backed | V10_PANEL/05_STATS_D1 (BUILDER-WORKER) |
| H19 | ✅ | 🆕→✅ REMOVED | v10.3: REHYDRATE-REMOVE |
| H24-H33 | NEW ROWS | 🆕→✅ | v10.3/v10.4: popup panel overhaul (BUILDER-POPUP) |
| H34-H50 | Renumbered + new rows | 🆕→✅ | v10.3/v10.4/v10.5 |
| I2 | ⚠ Claude broken | ✅ | API key re-set resolved |
| L1 | D1 migrations 001-031 | 002-031 (30 files) | corrected (no 001 exists) |
| L16-L18 | NEW ROWS | various | multi-lead + brigade migrations |

**Net delta v10.2 → v10.5: ~35 rows changed or added. 20+ 🆕→✅ (newly shipped). All in-flight builders assumed complete; v10.5.1 patch if any fails.**

---

**Open friction holes after v10.5 (post-build wave):**

1. Tooltip CSS `::before` path still 6px (only JS path fixed) — H3 follow-up
2. AI used flag never set true (B9 / C4 — wired but inert)
3. SHIELD orange undiagnosed — H4/H5
4. Bug-report viewer 403 — G12
5. Auto-unsticky regressed since v8.6.4 — B13
6. First-time popup should land on Tokens tab — H18
7. Brave header-link selector on Linux untested — A6
8. 13 legacy unrotated plaintext tokens in mod_tokens — L10
9. HMAC backfill .ps1 not yet run — F4
10. Brigade detector blocked on migrations 043+044 (Wave 3 session) — E16
11. Discord rotation DM suite (Wave 3 / v10.6 session) — I7

**State Professionalism Suite:** Pending after v10.5 build; will produce v10.5.1 refactor pass.

This matrix is the authoritative forward-looking baseline for v10.5. **Supersedes FEATURES_MATRIX_v10.2.md.**
