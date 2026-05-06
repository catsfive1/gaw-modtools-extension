# FEATURES_INDEX — feature → code map

Audience: agents. WHAT exists, WHERE it lives. No prose. File:line refs are approximate; grep to confirm.

## Identity & auth

| feature | client entry | worker endpoint | D1 table |
|---|---|---|---|
| per-mod token | popup.js loadToken | /mod/whoami | mod_tokens |
| token rotation (self) | popup.js rotateBtn | POST /mod/token/rotate | mod_tokens (token_hash) |
| rotation invite issue (lead) | popup.js generateInvite + rotateRoster | POST /admin/mod/rotation-invite | mod_invites |
| rotation invite claim | popup.js claimRotateBtn | POST /mod/token/claim-rotation | mod_invites + mod_tokens (atomic UPDATE...RETURNING) |
| `?mt_invite=` URL stage | modtools.js ~14908 IIFE | (popup commits) | chrome.storage.session.gam_pending_invite |
| `__applyLeadGate()` | popup.js | calls modWhoami RPC | reads is_lead |
| storage.onChanged token sync | background.js ~165 | n/a | validates regex |
| `setTokens` RPC | background.js ~225 | n/a | validates shape |
| `clearTokens` RPC | background.js ~310 | n/a | 10s rate-limit |

## Triage surfaces

| feature | client entry |
|---|---|
| Mod Console (Intel/Ban/Note/Message/Quick) | modtools.js openModConsole, renderXxxTab |
| Triage Console (/users) | modtools.js buildTriageConsole, refreshTriageConsole |
| Death Row queue | modtools.js getDeathRow, addToDeathRow, scheduleSniper |
| auto-DR rules | modtools.js applyAutoDeathRowRules + _sharedDrRefresh (cross-mod from /mod/dr-rules) |
| USERS auto-poll 60s | modtools.js ~10034 setInterval w/ visibility gate |

## Communication

| feature | client entry | worker endpoint |
|---|---|---|
| Mod Chat panel | modtools.js ModChat IIFE ~12061 | /mod/message/send, /inbox |
| Edit (5min) | modtools.js _gamShowMsgContextMenu | PUT /mod/message/edit |
| Delete (no confirm) | same | DELETE /mod/message/delete |
| Reply (right-click any msg) | same | (client-only) |
| @autocomplete + DM shortcut | modtools.js textarea handler ~12705 | /mod/message/mods-list |
| Modmail popover | modtools.js toggleModmailPopover | (client-only; uses /ban /unban etc.) |
| C5 Command Center (lead) | modtools.js toggleC5Popover | /audit/query, /presence/online |

## User intelligence

| feature | client entry | worker endpoint |
|---|---|---|
| Mark SUS | modtools.js pinTooltip act='sus' | POST/GET/DELETE /mod/user/sus |
| `_susApplyDecorations()` | modtools.js | reads /mod/user/sus 60s poll |
| comment_count_24h hot flag | (server-derived from gaw_comments) | included in GET /mod/user/sus rows |
| username flags + TTL | modtools.js renderTooltipIntel | /flags/read (server filters by team_settings.username_flag_ttl_days) |
| hoverzoom positionTooltip | modtools.js ~8542 | n/a |
| hoverzoom mouse-enter grace 200ms | modtools.js ~8688 _scheduleDismiss | n/a |
| Comeback candidates | popup.js dashboard | /reports/summary (adaptive [60→30→14→7]d threshold) |

## SIREN chip

| feature | location |
|---|---|
| chip render | modtools.js ~13130 sirenBtn + _updateSirenChip |
| dismiss button | modtools.js ~13157 sirenClearBtn (persists `siren.dismissedAtTotal`) |
| count placement | inline-flex emoji-LEFT count-RIGHT |

## Stats & reporting

| feature | location |
|---|---|
| 6 stat cards | popup.html ~33 .pop-stats with data-drill="..." |
| drill-down drawer | popup.html ~66 #pop-drill, popup.js __renderDrill* |
| CSV export | popup.js __exportDrillCsv |
| Top 10 Posters / Quality | popup.js buildDashboardHtml + worker handleReportSummary |
| Removed Content This Week | same; worker queries actions table |
| Force re-hydrate | popup.js #rehydrateBtn → modtools.js _rehydrateImpl |

## Bug reports

| feature | location | notes |
|---|---|---|
| submit | modtools.js openBugReportModal + RPC modBugReport | snapshot 16KB-capped |
| lead review | popup.js #bugReportsSection (in #leadSection) | gated by __applyLeadGate |
| visibility allowlist | popup.js #bugVisibilityInput | team_features.bug_report_visible_to: 'leads'\|'all'\|'user1,user2,...' |
| toolbar badge | background.js _bugPollAndBadge alarm BUG_POLL_ALARM 5min | chrome.action.setBadgeText |
| worker endpoints | gaw-mod-proxy-v2.js handleAdminBugReportsList/Update/Visibility | migration 029 |

## Audit & security

| feature | location |
|---|---|
| Merkle chain INSERT | gaw-mod-proxy-v2.js appendAuditAction (atomic INSERT...VALUES(..., (SELECT entry_hash...)) RETURNING) |
| HMAC anchor | _getAuditHmacKey (env.AUDIT_HMAC_KEY first, KV fallback) |
| boundary check | _getAuditHmacBoundary + handleAuditVerify |
| `correlated_action` for ban-confirm | migration 028 + handleModBanConfirm |
| ban preflight | POST /mod/ban-preflight (10/min + 100/day + bans_disabled kill switch) |
| ban confirm | POST /mod/ban-confirm |
| AI cost caps | aiPreflight() — KV `ai_day:<mod>:<YYYYMMDD>` + `ai_global:<YYYYMMDD>` |
| diag ring buffer | modtools.js _diagLog (500 entries cap) |

## Page polish

| feature | location |
|---|---|
| status bar | modtools.js buildStatusBar ~13075 |
| green dot click probe | modtools.js sessDot.addEventListener('click', ...) |
| site CSS top padding | modtools.js GAM_CSS ~14335 `.post{padding-top:1px}` + `.post-list .post{padding-top:1px}` |
| broom mode bylines | modtools.js compactBylines() (runs from injectAllStrips) |
| compact time format | modtools.js compactTimeUnit() (s/m/h/d/w/mo/y) |
| z-index audit comment | modtools.js GAM_CSS template top |
| orphan-backdrop sweep | modtools.js _gamOrphanBackdropSweep (every 30s + init) |

## Maintenance Mode (v9.5 in flight)

(Will be confirmed when sub-agent `acd46b305abfad88d` completes.)
- 12 routines (8 user + 4 lead) in popup
- 4 background alarms: gam_maint_quota_check, gam_maint_token_age, gam_maint_diag_rotate, gam_maint_intel_evict
- yellow `gam_maint_warning` chip in popup header on threshold breach

## Build / deploy / storage

| concern | location |
|---|---|
| ZIP build | scripts/build-zip.ps1 (auto-extracts to dist/mod-tools dist/) |
| install pipeline | Commander uses chrome://extensions Load unpacked from dist/mod-tools dist/ |
| worker deploy | `cd cloudflare-worker && npx wrangler deploy` |
| migration apply | `npx wrangler d1 execute gaw-audit --remote --file=migrations/NNN.sql` |
| wrangler secrets | ANTHROPIC_API_KEY, DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY, GITHUB_PAT, LEAD_MOD_TOKEN, MOD_DATA_KEY, MOD_TOKEN (decommissioned), SENTRY_DSN, XAI_API_KEY, AUDIT_HMAC_KEY |
| KV bindings | MOD_KV (cache, rate limits, audit-hmac fallback, version cache) |
| R2 bindings | EVIDENCE (mod-prefixed paths) |

## Common grep targets

```bash
# Find a feature by user-visible label
grep -rn "Mark SUS\|Force re-hydrate\|Clear all" modtools.js popup.*

# Find an RPC handler
grep -n "modSomething:" background.js          # client RPC dispatch
grep -n "case '/some/path':" gaw-mod-proxy-v2.js  # worker route

# Find a CSS class
grep -n "\.gam-something" modtools.js          # all in GAM_CSS template

# Find a storage key
grep -n "K\.SOMETHING\|gam_setting_name" modtools.js
```
