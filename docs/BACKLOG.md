# BACKLOG — work queue

Audience: agents. Priority-ordered. Each item: scope envelope + files + done-criteria. No narrative.

## TIER 1 — IN FLIGHT

| id | item | status |
|---|---|---|
| **v9.5.0** | Maintenance Mode (12 routines + 4 alarms + lead health report + backlog doc) | sub-agent `acd46b305abfad88d` building. Done when ZIP appears in `dist/`. Commit + push, update AGENT_BRIEF version state. |

## TIER 1 — REQUIRES COMMANDER (legitimate §10 carve-outs)

| id | item | command |
|---|---|---|
| **HMAC backfill** | invoke `POST /admin/audit/backfill-hmac` for the 459 NULL-hmac legacy rows | `pwsh -File scripts/backfill-audit-hmac.ps1` (prompts Commander for `LEAD_MOD_TOKEN` from CF dashboard) |
| **worker repo init** | `git init` cloudflare-worker dir + .gitignore for node_modules / wrangler / *.bak | one-word approval; deferred so far |

## TIER 2 — Near-term (small, scoped, ship-ready)

| id | item | files | done-criteria |
|---|---|---|---|
| **P2-1** | stats backfill for unregistered mods | popup.js + modtools.js detectModStatus | mod with no `gam_settings.isModBrowser=true` still gets accurate stats card values |
| **P2-2** | stats card explanations on hover (P3-1) | popup.html | each `.pop-stat[data-drill]` has explanatory `title=` (already partially done in v9.4.5) |
| **P2-3** | Approve / Remove post buttons in DOM | modtools.js + cURL captures from POST MASTER scored-headers | `[data-gam-action="approve"]` button next to ban on each post, calls /approve with XSRF |
| **P2-4** | OP self-delete detection | gaw-mod-proxy-v2.js firehose ingest | gaw_posts gains `is_deleted_by_op` flag |
| **P2-5** | auto-remove queue items from SUS/DR users | modtools.js queue handler | new queue items from SUS/DR authors auto-call /remove with toast undo |
| **P3-2** | rename or delete legacy `/invite/claim` popup-side path | popup.js | worker side already deleted; popup `claimInviteBtn` button copy update |
| **P3-3** | onboarding visual polish (welcome celebration) | popup.js post-claim path | toast/banner "Welcome, {username} — your token is stored, mod chat is live" |
| **TS-1** | bot-token-derived bucket key for AI per-mod budgeting | gaw-mod-proxy-v2.js aiCallerKey | bot path uses dedicated `bot_<wrangler-secret-token>` bucket, not mod_username |
| **TS-2** | drop `'unsafe-inline'` style-src in popup CSP | popup.css + popup.html + ~38 inline `style.cssText` sites | CSP no longer contains `'unsafe-inline'`; popup renders identically |
| **TS-3** | hard-remove `__GAM_REHYDRATE` window deprecation shim | modtools.js + runbook references | shim gone; rehydrate only via popup button |
| **TS-4** | R-hotkey reply for chat (P1-10 partial) | modtools.js ModChat IIFE | hover msg + R = reply (scope: only when chat panel has focus, not on post pages) |
| **TS-5** | sweep remaining 4 `String(e)` worker error sites to `safeError` | gaw-mod-proxy-v2.js lines 175, 6540, 7717, 8827 | each callsite uses `safeError(e, '<tag>')` if NOT API-contract-bound |
| **TS-6** | force-NULL plaintext column on the 13 still-legacy unrotated mod_tokens rows | one-shot worker endpoint OR `wrangler d1 execute` | `SELECT COUNT(*) FROM mod_tokens WHERE token IS NOT NULL AND token_hash IS NOT NULL` returns 0 |
| **TS-7** | remove `MOD_TOKEN` wrangler secret after 1-week soak | `npx wrangler secret delete MOD_TOKEN` | after 2026-05-12; checkModToken already does not read it |
| **TS-8** | `EXTENSION_ID_ALLOWLIST` populated when extension hits CWS | wrangler.jsonc vars | env-var contains the published CWS extension ID |
| **TS-9** | manifest `"key"` field for deterministic unpacked-install IDs | manifest.json | RSA pubkey base64 in manifest; install ID stable across mods |
| **TS-10** | pre-028 mutated `action` rows boundary marker | one-shot D1 update | KV `audit_pre_028_boundary_id` set to `MAX(id) WHERE correlated_action IS NULL AND action LIKE 'ban.confirmed%'` at deploy time |

## TIER 3 — Architectural / multi-day

### Chat power features (Opus brainstorm; ship in this order)
| id | item | foundation? |
|---|---|---|
| **CHAT-1** | Live Cards (paste GAW URL → auto-expand inline) | yes — every other depends |
| **CHAT-2** | Slash Commands (`/ban @user 7d`, `/lookup`, `/queue`) | reuses @-autocomplete |
| **CHAT-3** | AI Triage (`/triage <post-url>` via Claude `/ai/*`) | uses existing AI proxy |
| **CHAT-4** | Incidents (`/incident` pinned thread + auto-subscribe) | new D1 table mod_incidents |
| **CHAT-5** | Evidence Pinboard | sibling to Incidents |
| **CHAT-6** | Ban Drafts (collaborative mini-modal) | needs Live Cards |
| **CHAT-7** | Smart Quote Reply (auto-include card-state summary) | client-only |
| **CHAT-8** | Mention Escalation (`@@all` → chime + browser notification) | client-only |
| **CHAT-9** | Huddles (ephemeral private sub-channels) | needs incidents foundation |
| **CHAT-10** | Shift Handoff (AI-summarized end-of-shift digest) | needs all above |

### Tard-detection signals (10 brainstormed; ship 3 highest-impact first)
| id | item | impact/effort |
|---|---|---|
| **TARD-1** | comment cadence indicator (>3× 30d avg) | high/low |
| **TARD-2** | first-seen badge (🆕 if account <14d) | high/low |
| **TARD-3** | username similarity to known DR patterns (Levenshtein) | medium/medium |
| **TARD-4** | profile-zero badge (0️⃣ if zero karma after >100 comments) | medium/low |
| **TARD-5** | posting velocity heatmap sparkline | medium/medium |
| **TARD-6** | cross-community fingerprint (multiple .win matching usernames) | medium/high |
| **TARD-7** | reply-to-DR-pattern detector | high/medium |
| **TARD-8** | first-comment-on-thread heatmap (consistent <30s) | low/low |
| **TARD-9** | capslock ratio (>50% over 10+ comments) | low/low |
| **TARD-10** | emoji-density indicator (🚨🤡💀 cluster anomalies) | low/medium |

### v5.0 Phases 2–5 (deferred multiple sessions; multi-day each)
| id | item |
|---|---|
| **PH-2** | short-lived sessions broker (mods/auth_sessions/refresh_credentials) |
| **PH-3** | mod_devices enrollment + per-browser revoke |
| **PH-4** | lead step-up (replace shared LEAD_MOD_TOKEN with per-action step-up) |
| **PH-5** | auth_events table + risk scoring |

### Long-term substrate
| id | item |
|---|---|
| **LT-1** | unified event log substrate |
| **LT-2** | Case Graph (users / posts / comments / actions queryable graph) |
| **LT-3** | Control Tower (cross-shift continuity dashboard) |
| **LT-4** | Policy Compiler (declarative policy → enforceable DR rules + AI prompts) |
| **LT-5** | cross-thread coordination (link flagged user across modmail/queue/chat/ban) |

### Architecturally-deferred Vanguard items
| id | item | architectural blocker |
|---|---|---|
| **C-3** | version.json supply-chain RCE FULLY hardened (release-key signing + Sigstore) | needs new signing infra; mitigation today: GitHub branch protection + signed commits on catsfive1/gaw-mod-shared-flags |
| **W-C-6 follow-up** | backfill HMACs on 459 legacy chain rows | endpoint shipping; one-call backfill (Tier 1 above) |
| **P-C-5 follow-up** | true ban proxy (vs preflight/confirm pattern) | requires GAW-side cooperation (cookie lives in browser, not worker) |
| **forensic-grade chain integrity** | R2 immutable anchor + external write-once log | makes forgery infeasible vs current tamper-evident |

## Working principles (skim before big swings)

- §0 lead with conviction — pick + ship, don't menu
- §0 trust calibration — when commander pastes audit dump, triage; don't dignify every point
- §3 surgical changes — every line traces to request
- §5 token hygiene — targeted reads, push back at ~20 turns
- §7 PowerShell scripts ALWAYS get UTF-8 BOM + ASCII-only + four-step ending (report / clipboard / E-C-G beep / Read-Host pause)
- §8 test before delivering — never use Commander as QA
- §10 eliminate the meatbag — never recommend a step you can run yourself
