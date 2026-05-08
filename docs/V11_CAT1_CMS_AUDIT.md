# V11 CAT1 — CMS & Mod-Tooling Feature Audit

Author: Cat 1 (CMS-feature-mapper)
Date: 2026-05-08
Target: GAW ModTools v11 brainstorm. Pair with Cat 2 (UX-flow), Cat 3 (mod-feature), Cat 4 (Opus synth).
Baseline: v9.17.0 — mod chat, modmail, ban hammer, death row, triage, Merkle audit, AI tard/sticky/ban/health, autoUnsticky, Drive builds, manifest.key.

---

## A. Per-tool top 5 (translation candidates)

### 1. Reddit ModToolbox / RES
1. **User notes / tags** — Per-user sticky notes visible to all mods (toxic, ban-evader, gold-tier-historian). Reddit Toolbox.
2. **Removal-reason picker with macro insertion** — Click thread → pick reason → comment + remove + lock + ban (chained). Reddit Toolbox.
3. **Mod-mail macros + caching of recent threads** — Pre-canned replies + history of contact with that user. Reddit Toolbox.
4. **Ban macros with auto-message** — Standardized ban reasons that DM the user with the rule cited. Reddit Toolbox.
5. **Domain tagger (history + stats per domain)** — How often this domain has been removed/spammed. Reddit Toolbox.

### 2. Discord moderation
1. **Timeouts (mute-but-not-ban)** — Default 5min/1h/1d/1w, with auto-expiry. Discord native.
2. **AutoMod regex/keyword rules with severity tiers** — Auto-delete + flag + ban escalation ladder. Discord AutoMod.
3. **Raid protection (account-age + verification gates)** — Block actions from accounts <N days old during raid mode. Discord.
4. **Audit log with actor + target + before/after diff** — Every mod action diffed and timestamped. Discord.
5. **Slash-command ban/kick/mute with ephemeral confirmations** — Type `/ban user reason` instead of clicking through UI. Discord.

### 3. Twitch moderation
1. **Slow mode (rate-limit posts per user)** — One post per N seconds during heated threads. Twitch.
2. **Follow-only mode (require N-day account age to comment)** — Slows raid waves. Twitch.
3. **Emote-only / link-only blocking per thread** — Surgical content restriction without locking. Twitch.
4. **Shared ban lists across communities** — Federated bans from sister subs. Twitch / FrankerFaceZ.
5. **Auto-mod hold queue with confidence score** — AI flags message, mod approves/rejects in one keystroke. Twitch AutoMod.

### 4. Slack admin
1. **Compliance export (full data, hashed user IDs)** — Forensic dump for legal/audit. Slack Enterprise.
2. **Bulk user actions (deactivate N at once)** — Multi-select then act. Slack admin.
3. **Channel retention policies (auto-delete old)** — Can apply to mod-chat for hygiene. Slack.
4. **SCIM/IdP user provisioning** — Skip — overkill for our scale.
5. **Audit log streaming to webhook** — Real-time event firehose for SIEM/dashboards. Slack.

### 5. Notion / Confluence (collab UX patterns only)
1. **@-mention with notification + thread context** — Mention another mod in a case note, they get pinged with the link. Notion.
2. **Inline comments on highlighted text** — Mods can annotate a specific paragraph of a comment thread. Notion.
3. **Slash command palette (`/`)** — One keystroke summons every action. Notion.
4. **Real-time presence avatars** — See which mod is reading the same thread right now. Notion.
5. **Page templates** — Reusable case-file template per ban category. Notion.

### 6. WordPress / Drupal admin
1. **Role-based capability matrix** — Lead vs mod vs trial-mod with explicit capability bits. WP Roles.
2. **Audit log with revertible actions** — Every change has an "undo" within window. WP Activity Log.
3. **Scheduled publish / scheduled actions** — Schedule a sticky for 9AM tomorrow. WP.
4. **Plugin update notifications with changelog** — Surface "extension updated to v11.2 — what changed" in-product. WP.
5. **Two-factor for privileged accounts** — Hardware-key gate for lead actions. WP.

### 7. GitHub repo moderation
1. **Lock conversation (read-only)** — Prevent new replies without removing thread. GitHub.
2. **Hide individual comment with reason badge** — "Hidden as off-topic" visible to all. GitHub.
3. **Saved reply / canned response library per mod** — Personal macro store synced across devices. GitHub.
4. **CODEOWNERS-style auto-routing** — Mod-mail about user X auto-tags the mod who last actioned X. GitHub.
5. **Rate-limit-aware API client with backoff** — Don't hammer the worker. GitHub Octokit pattern.

### 8. Supabase / Vercel admin
1. **Real-time metrics dashboard (rps, latency, errors)** — Worker health visible at a glance. Vercel.
2. **Deployment rollback button (one click → previous build)** — Bad ship → revert in <30s. Vercel.
3. **Log streaming with filter chips (severity, route)** — Tail worker logs from inside extension. Supabase.
4. **Environment variable manager with audit** — Who changed which secret when. Vercel.
5. **Status page widget (uptime + last incident)** — Sticky banner if worker is degraded. Vercel.

---

## B. THE LONG LIST (deduped, 50 candidates)

| # | Feature | Source | Tag |
|---|---|---|---|
| 1 | Per-user sticky notes (mod-only) | Reddit Toolbox | intel |
| 2 | Per-user tag chips with color | Reddit Toolbox | intel |
| 3 | Removal-reason picker (chained: comment+remove+lock) | Reddit Toolbox | automation |
| 4 | Domain reputation tracker | Reddit Toolbox | intel |
| 5 | Mod-mail thread history per user | Reddit Toolbox | comms |
| 6 | Timeout (temp mute) with auto-expiry | Discord | content |
| 7 | AutoMod regex rules with severity ladder | Discord AutoMod | automation |
| 8 | Raid mode: gate by account age | Discord | automation |
| 9 | Action-diff audit log (before/after fields) | Discord | audit |
| 10 | Slash-command palette for all mod actions | Discord/Notion | ux |
| 11 | Slow-mode toggle per thread | Twitch | content |
| 12 | Follow-only / age-gated comment mode per thread | Twitch | content |
| 13 | Link-only / emote-only thread restriction | Twitch | content |
| 14 | Shared/federated ban list with sister mods | Twitch | intel |
| 15 | AI hold queue with confidence score + 1-key approve | Twitch AutoMod | ai |
| 16 | Compliance export (CSV + hashed IDs) | Slack | audit |
| 17 | Bulk multi-select user actions | Slack | admin |
| 18 | Mod-chat retention policy (auto-archive old) | Slack | admin |
| 19 | Audit-event webhook firehose | Slack | audit |
| 20 | @-mention another mod with notification | Notion | comms |
| 21 | Inline comment / annotation on a quoted post | Notion | ux |
| 22 | Real-time mod presence avatars on triage queue | Notion | ux |
| 23 | Case-file templates per ban category | Notion | content |
| 24 | Role-capability matrix (lead/mod/trial) explicit | WP | perms |
| 25 | Revertible action window (undo last action ≤60s) | WP | audit |
| 26 | Scheduled actions (sticky/unsticky at time T) | WP | automation |
| 27 | In-extension changelog + "what's new" toast | WP | ux |
| 28 | 2FA / hardware key gate for lead-tier actions | WP | auth |
| 29 | Lock thread (read-only without removal) | GitHub | content |
| 30 | Hide comment with reason badge (visible) | GitHub | content |
| 31 | Personal saved-replies library, synced | GitHub | comms |
| 32 | Auto-route mod-mail by last-actioner | GitHub | automation |
| 33 | Worker health metrics dashboard inline | Vercel | analytics |
| 34 | One-click rollback to previous extension build | Vercel | admin |
| 35 | Live worker log tail with filters | Supabase | analytics |
| 36 | Secret/env var change audit | Vercel | audit |
| 37 | Worker status banner if degraded | Vercel | ux |
| 38 | Ban evader detector (cookie/IP/fingerprint heuristic) | inferred | intel |
| 39 | User reputation score (auto-computed from history) | Reddit/Twitch hybrid | intel |
| 40 | Quick-action keyboard shortcuts (j/k/x style) | Notion/Reddit | ux |
| 41 | Triage queue SLA timer (oldest-pending-N-min badge) | Vercel | analytics |
| 42 | Mod activity leaderboard (actions/week) | Discord | analytics |
| 43 | Word/phrase watchlist with auto-flag | Discord AutoMod | automation |
| 44 | Ban appeal workflow with state machine | Discord | comms |
| 45 | Auto-thread-lock after N hours of inactivity | GitHub | automation |
| 46 | Per-mod theme + density preference | Notion | accessibility |
| 47 | Screen-reader-friendly action announcements | WP | accessibility |
| 48 | Cross-extension search (logs + audit + chat) | Notion/Slack | search |
| 49 | Health-check self-test ("Diagnose my extension") | Vercel | perf |
| 50 | Encrypted local cache for offline triage view | Slack | perf |

---

## C. Tag distribution

automation 8 | audit 5 | content 6 | intel 6 | ux 7 | admin 3 | comms 4 | search 1 | perms 1 | analytics 4 | ai 1 | perf 2 | accessibility 2 | auth 1

(Heavy on UX, content control, intel — light on perms/auth because v9 already has those.)

---

## D. NOT-A-FIT LIST

| Feature | Source | Why it doesn't fit |
|---|---|---|
| SCIM/IdP provisioning | Slack | Mod count ~10. Manual onboarding via lead token is fine; SCIM is enterprise overkill. |
| Channel retention policies (auto-delete) for audit log | Slack | Audit log is Merkle-chained — deletion would break the chain. Chat retention OK; audit retention NEVER. |
| Server-side AutoMod with real-time message scanning | Discord | We don't have a hot websocket message stream. AutoMod is reactive (post-hoc) here, not preemptive. |
| Federated cross-community ban lists (the "share with sister sites" piece) | Twitch | We have one site. Hold for v12+ if a network ever exists. |
| Plugin marketplace / 3rd-party extensions | WP | Single closed extension. Adds attack surface for zero benefit. |
| Page templates as full WYSIWYG editor | Notion | Case files don't need rich text — markdown + a few fields is plenty. |
| Real-time co-editing of a single mod note | Notion | One mod actions one item; conflict resolution cost > benefit. |
| Emote-only mode | Twitch | We don't have emotes. Skip. |
| Hardware-key 2FA for every action | WP | Friction kills speed. Lead-tier only, not per-action. |
| Comprehensive role-capability matrix UI | WP | We have lead/mod/trial. A matrix UI is over-engineering for 3 tiers; keep it as constants. |

---

## E. CAT 1's 5 favorites for v11

1. **#3 Removal-reason picker with chained action** — One click instead of three. Biggest meatbag-elimination win in the catalog. Touches: triage console, ban hammer flow, audit log.
2. **#15 AI hold queue with confidence score + 1-key approve** — We already have AI tard/sticky/ban; missing piece is a unified queue where AI pre-flags and mods rubber-stamp with `j` (approve) `k` (reject). Force-multiplies existing AI investment.
3. **#9 Action-diff audit log (before/after on every field)** — We have Merkle chain for *that an action happened*. We don't have *what changed*. Diff per action turns the audit log from a tamper-proof receipt into a forensic instrument.
4. **#26 Scheduled actions** — "Sticky this at 9AM" / "auto-unsticky in 4h" eliminates the `autoUnsticky cooldown` band-aid with a real scheduling primitive. Generalizes beyond stickies (scheduled bans expiring, scheduled posts).
5. **#33 Worker health metrics dashboard inline** — Right now when the worker is degraded, mods discover it by an action failing. A passive top-bar widget showing rps/p99/error-rate from the worker's `/metrics` endpoint converts "WTF is broken" sessions into "yep, worker is in trouble, sit tight" sessions. Five-minute fix on the worker side, big trust dividend.

These five picked for: highest user-time-saved-per-LOC, leverage of existing investment (AI, Merkle, worker), and elimination of currently-manual operator steps.

---

Word count: ~1,180. Under budget.
