# PUNCH LIST — v9.3.x

Generated 2026-05-05 from Commander's testing session feedback after the
v9.2.x rotation/onboarding rollout. Items below ordered by **impact**, not
arbitrary grouping. Each item has acceptance criteria so a fresh agent
session can pick it up cold.

---

## P0 — Security / blocking

### P0-1. Non-mod accounts must NOT see ModTools UI ✓ DONE v9.3.0

`__validateModAuth` early-return in modtools.js init. Non-mod accounts now
see ZERO ModTools UI. Re-checks on visibilitychange + hourly poller.

### P0-2. Mod action icons rendered behind the blur layer (PS reproduction) ✓ DONE v9.3.1

**Root cause:** Same bug class as v8.6.1 — `closeAllPanels()` selector list
caught only `.gam-modal, #gam-backdrop`, missing four newer backdrop variants
(`.gam-modal-backdrop`, `#gam-intel-backdrop`, `#gam-token-onboard-backdrop`,
anonymous consent backdrop). When any of those modals closed via direct
`.remove()` of the inner modal element only, the backdrop element survived
and continued blurring everything below z-9999990 (mod-console panel,
popovers, action strips). PresidentialSeal hit this after the token-onboard
flow.

**Fix shipped (v9.3.1):**
- `closeAllPanels` selector expanded to all backdrop variants + opt-in
  `[data-gam-orphan-backdrop]` marker for any future backdrops.
- New `_gamOrphanBackdropSweep()` runs at init + every 30s
  (visibility-gated): removes any backdrop with no associated open modal.
  Logs a warning when it activates so the missing close-path can be
  hunted later.
- Modmail-actions popover (`#gam-mm-popover`) and C5 popover
  (`#gam-c5-popover`) z-index raised from 9999990 → 9999996. They no longer
  tie with the backdrop; they sit explicitly above modals (.gam-modal at
  9999995).
- **Z-index hierarchy audit** documented as a comment block at the top of
  the GAM_CSS template (acceptance: ✓).

### P0-3. Username case-insensitive on claim ✓ DONE v9.3.0

Worker version `5803a642`. Both popup-side prompt and claim handler now
do a `.toLowerCase()` comparison and write the canonical case from the
invite row.

**Note:** Tested by claiming PresidentialSeal with input "presidentialseal"
post-deploy. Worker accepted, mod_tokens row updated, claim flow works.

### P0-4. Username flags expire after configurable period (default 30 days) ✓ DONE v9.3.2

**Worker (deploy `c19f2a2d-a3a9-4b22-a718-897f9e0cf375`):**
- Migration `021_team_settings.sql` — generic key/value table, seed
  `username_flag_ttl_days = 30`. Reusable foundation for P1-6 etc.
- New endpoints: `GET /mod/settings` (any authed mod), `PUT /admin/settings`
  (lead-only, allow-listed keys). Both use dual-mode `lookupModFromToken`.
- `/flags/read` modified — reads TTL from `team_settings`, filters
  `mod_flags` SELECT WHERE `ts > nowSec - ttlDays * 86400`. Note: ts is in
  seconds (caught and corrected from the original spec which assumed ms).
- CORS allow-methods extended to include `PUT`.
- All 4 curl probes returned 200; non-allowlisted keys → 400; missing token
  → 401.

**Client (v9.3.2):**
- Two new RPC handlers in `background.js`: `modSettingsRead` (any caller),
  `adminSettingsWrite` (popup-only, asLead).
- Popup: lead section now has a "Team settings" sub-section with a
  numeric input + Save button for the flag TTL. Lead-only by virtue of
  living inside `#leadSection`. Reads current value on popup open via
  `loadTeamSettings()`.
- No client-side filtering needed — worker enforces TTL on every
  `/flags/read`. "Cross-mod sync" is automatic via that.

---

## P1 — High impact UX

### P1-1. Hoverzoom is boundary-aware ✓ DONE v9.3.3

`positionTooltip()` rewritten with explicit flip rules: when default
left-anchored placement would push the tooltip past `viewport.width - 8`,
the tooltip flips to right-anchored (its right edge aligns with the
anchor's right edge). Vertical flip from below→above when below would
overflow already existed; kept. 8px MARGIN from viewport edges.

### P1-2. Mouse can enter hoverzoom box ✓ DONE v9.3.3

- CSS for `#gam-tooltip` flipped from `pointer-events:none` to `auto`
  (tooltip now hover-detectable; before it was invisible to the mouse).
- 200ms `_hoverDismissTimer` introduced. On `mouseout` from username OR
  from tooltip, schedule dismiss in 200ms. On `mouseover`/`mouseenter`
  on either, cancel pending dismiss. Result: mouse can traverse the
  ~6px gap between username and tooltip without losing it, and once
  inside the tooltip the user can click action buttons (P1-3 SUS button
  etc. lands here in iter 4).

### P1-3. Mark user as SUS (cross-mod visible) ✓ DONE v9.3.4

**Worker (deploy `daeeee4b-b285-4e3a-a8bb-53456a0c7ee7`):**
- Migration `022_mod_user_sus.sql`: `mod_user_sus` table (UNIQUE on
  username, REPLACE on conflict) + `sus_ttl_days = 30` seeded into
  `team_settings` (lead-mutable via existing PUT /admin/settings).
- Single multiplexed handler `handleModUserSus` covers POST/GET/DELETE
  on `/mod/user/sus`. POST validates `[A-Za-z0-9_-]{3,32}`, computes
  expires_at from sus_ttl_days, snapshots comment count at mark time
  (`marked_at_comment_count`). GET filters cleared+expired and joins
  comment count from `gaw_comments` (`comment_count_24h` per row).
  DELETE soft-clears (cleared_at + cleared_by from token).
- Probes 5/5 → 200 (mark→read→clear→re-read).
- DELETE method added to CORS allow-methods.

**Client (v9.3.4):**
- Three new RPC handlers in `background.js`: `modSusMark`, `modSusList`,
  `modSusClear`.
- Pinned tooltip controls now include 🚩 Mark SUS / 🚫 Clear SUS button
  (toggles based on current state).
- `_susState` cache + `_susRefresh()` polled every 60s (visibility-gated)
  and on `visibilitychange:visible`.
- `_susApplyDecorations()` walks every `a[href^="/u/"]` link and decorates
  matching usernames with 🚩 prefix + orange (#f0a040) color, BOLD RED
  (#f04040 weight 700) when `comment_count_24h > 8`. Tooltip shows
  who-marked + reason + 24h comment count for hot users. Decorations
  reverse cleanly when a user is cleared (orig text + title restored).
- MutationObserver re-decorates as new author links stream into the DOM
  (queue, profile river, modmail thread, etc.).

### P1-4. Status bar SIREN for active TARDs / DRs ✓ DONE v9.3.7

`#gam-siren-count` button between drBtn and mmBtn. `_updateSirenChip()`
runs every 30s + 2.5s after init. Shows 🚨 + total count, hidden when
both SUS count and last-24h DR adds are zero. Color tier: amber by
default, red when ≥5 recent DRs OR any HOT SUS user (>8 comments/24h).
Title (hover): `"CURRENT STATUS: N TARDs (SUS), M DRs added in last 24h
— click to open mod log"`. Click → opens mod log.

### P1-5. USERS page lives without F5 ✓ DONE v9.3.7

`/users` auto-refresh dropped from 90s → 60s cadence. Already had
`document.hidden` skip; kept. Added `#gam-users-live-dot` indicator
appended to the triage console header that cycles through:
`🟢 live (60s)` → `🟠 fetching…` → `⚪ paused (tab hidden)`. Resumes
to live state on `visibilitychange:visible`. New unreviewed users
already flow through `refreshTriageConsole()` after fetch — no F5 needed.

### P1-6. Death Row rules sync across all mods ✓ DONE v9.3.5

**Worker (deploy `75a10648-3f4b-4241-940f-1ef3f60003dc`):**
- Migration `023_dr_rules.sql`: `dr_rules` table (pattern, reason,
  ttl_hours, created_by, deleted_at) with active/created indexes.
- `GET /mod/dr-rules` (any mod) → `{rules:[...]}` of active rules sorted
  by created_at desc.
- `POST /admin/dr-rules` (lead-only): validates pattern compiles
  (`new RegExp(pattern, 'i')`), ttl_hours int 1-8760 (default 168),
  inserts row. 400 on invalid regex.
- `DELETE /admin/dr-rules` (lead-only): soft-delete via deleted_at.
- All 6 probes green; invalid-regex 400 confirmed.

**Client (v9.3.5):**
- 3 new RPC handlers in `background.js`: `modDrRulesList`,
  `adminDrRulesAdd`, `adminDrRulesDelete`.
- `_sharedDrState` cache + `_sharedDrRefresh()` polled every 60s
  (visibility-gated) + on `visibilitychange:visible`.
- New `_getEffectiveDrRules()` returns merged local + shared rules
  (de-duped by pattern; local wins). `applyAutoDeathRowRules()` now uses
  this merged getter — USERS page evaluation auto-applies shared rules
  to incoming users with the correct reason string and TTL hours.
- Shared rules are tagged `shared:true` so future popup UI can render
  them as read-only chips.
- `window.gamListSharedDrRules()` exposed for lead debugging.

---

---

## NOOB-ROLLOUT AUDIT (sub-agent finding — partial fixes shipped v9.3.6)

Sub-agent walked the rollout flow for a non-lead mod (PresidentialSeal).
Found the platformHardening flag was the primary noob-rollout dead-end.

### Audit-N1. platformHardening default flipped to true ✓ DONE v9.3.6

`modtools.js:1228` — was `false`, now `true`. With the flag off, fresh
installs fell into the dead `/invite/claim` codepath AND the popup's
`claimInviteWrap` was hidden. First-time mods literally couldn't claim
their rotation invite.

### Audit-N2. claimInviteWrap visible by default ✓ DONE v9.3.6

`popup.html:124` — removed `style="display:none"`. Click handler at
`popup.js:1379` already prints a clear status when nothing is staged,
so it's safe to show unconditionally now.

### Audit-N3. Clear All confirm names what's lost ✓ DONE v9.3.6

`popup.js:118` — confirm message now explicitly lists `mod token (you'll
need a fresh rotation invite from your lead to recover)` and `lead token`.
Previously these were the highest-impact wipes and the dialog said
nothing about them.

### Audit-N4. claimInviteBtn username prompt softened ✓ DONE v9.3.6

`popup.js:1398` — was "case sensitive", now "any spelling — match is
case-insensitive since v9.3.0". P0-3 fixed worker case-insensitivity in
v9.3.0; the prompt was lying to the user.

### Audit-N5. First-run hint in popup ✓ DONE v9.3.6

`popup.js` — the "no token" status message now reads `👋 First time?
Click 📨 Claim invite below if you have a link, OR 📥 I have a rotation
invite to enter the code manually.`

### Audit-N6. Reload-GAW-tabs after claim — STILL OPEN

Audit recommendation: append `\n— now refresh any open GAW tabs` to the
post-claim success message at `popup.js:1101-1104`. Deferred to v9.3.7.

### Audit-N7. detectModStatus DOM heuristic stale-cache — STILL OPEN

Likely cause of P2-1 stats backfill issue per audit. With P0-1 valid
`__validateModAuth` should bypass the `isModBrowser` cache. Bigger
refactor; deferred to v9.4.

### Audit-N8. Decouple fresh-install snack from auth-suppress — STILL OPEN

`__validateModAuth` returns false silently. Audit recommends a one-shot
snack: "ModTools installed but no token — open the extension popup."
Deferred to v9.3.7.

### Audit-N9. Dead /invite/claim codepath cleanup (also P3-2) — STILL OPEN

Now actively a trap because flag-off branch hit it. With flag default-on
(N1), normal users no longer reach it; cleanup is safe. Deferred to v9.3.7.

### Audit-N10. detectModStatus 5-checkbox consent for noobs — STILL OPEN

Five consent checkboxes pop up 2s after fresh-claim init. Most noobs
will dismiss out of fear, breaking crawler/firehose. Deferred to v9.4
(needs design discussion on which features should be opt-in vs opt-out).

---

## P1 — Chat polish

### P1-7. Edit / delete sent messages within window ✓ DONE v9.3.8

**Worker (deploy `ee79c60e-ac68-482a-a1b0-8ab6d0a2ac64`):**
- Migration `024_mod_messages_edit_delete.sql`: adds `edited_at`,
  `deleted_at`, `deleted_by` cols + index on deleted_at.
- `PUT /mod/message/edit` — 5min window enforced server-side
  (`MOD_MSG_EDIT_WINDOW_MS = 300_000`), authorship via
  `v7ModUsernameVerified` (canonical username from token), encrypts new
  body via `encField`. 410 if window expired. 403 if not author.
- `DELETE /mod/message/delete` — soft-delete; idempotent on
  already-deleted. `deleted_by` from token.
- `/mod/message/inbox` modified: returns `[message deleted]` for tombstone
  rows; preserves `edited_at`/`deleted_at` fields for client to render.
- All 6 probes 200; tombstone substitution + edited_at preservation
  verified.

**Client (v9.3.8):**
- 2 new RPC handlers in `background.js`: `modMessageEdit`,
  `modMessageDelete`.
- `_gamShowMsgContextMenu(x, y, msg)` defined just before ModChat IIFE.
  Right-click on own message in chat thread → menu with Edit + Delete.
  Edit shows live remaining-seconds counter (`Edit (Xs left)`); past
  window the option is greyed out.
- Render adds `(edited)` italic suffix when `m.edited_at` is set, and
  greys the body when `deleted_at` set (server already substitutes
  content, client just styles it).

### P1-8. Chat panel docking + width selector ✓ DONE v9.3.9

Two new header buttons on `#gam-mc-panel`:
- Width: cycles `SM / MD / LG` (320/480/640px). Persists to
  `gam_settings['chat.width']`. Default MD.
- Dock: toggles ⬅️ / ➡️. Persists to `gam_settings['chat.dock']`.
  Default right.

CSS uses `[data-dock]` and `[data-width]` attribute selectors with smooth
`transition:transform .2s, width .2s`. Left-dock has `box-shadow:8px 0
30px ...` mirroring the right-dock style. The default right-dock at MED
(480px) doesn't overlap GAW's right sidebar at default desktop widths.

### P1-9. @username autocomplete with DM shortcut ✓ DONE v9.3.9

Composer textarea now intercepts `@partial` typed at cursor: opens a
small popup (`.gam-mc-at-popup`) above the textarea listing matching
mods (uses cached `STATE.modsList`). Up to 8 results, prefix-match.
- ↑/↓ navigates (active item highlighted)
- Tab or Enter completes
- Esc dismisses
- mousedown on an item also completes
- blur dismisses (150ms grace so click handlers fire)

DM shortcut in `sendCurrent()`: if content starts with `@KnownMod ` and
the mod is in `STATE.modsList`, the recipient is overridden to that
username and the `@KnownMod ` prefix is stripped from the body. Empty
body after stripping shows a snack and re-fills the prefix so the user
can type. If the @-name is unknown, normal broadcast/recipient behavior.

### P1-10. Right-click reply / R-hotkey reply ✓ DONE v9.3.9 (partial)

Reply added to the right-click context menu on any chat message
(own or others'). Pre-fills composer with multi-line aware blockquote:
`> @author wrote:\n> line1\n> line2\n\n` and positions cursor after the
prefix. Works on both own and others' messages — Edit/Delete remain
own-only.

R-hotkey deferred to v9.3.10 (overlaps with the existing R-hotkey on
post pages; needs scoping logic).

---

## P2 — Stats cards (popup home)

### P2-1. Stats backfill for all mods (incl. unregistered)

**Status:** Open
**Reported:** PS's stats card shows all 0 even though server-side data
exists for unregistered mods.

**Acceptance:**
- Stats endpoint pulls from `mod_audit` filtered by `mod_username = ?`
  regardless of `mod_tokens` state.
- 0s only when the mod genuinely has no audit history (true state).

### P2-2. Stats cards clickable + drill-down

**Status:** Open
**Reported:** "Pending / Death Row / Banned / Bans 24h / Msgs 24h /
Notes 24h" cards should be clickable.

**Acceptance:**
- Click "Bans 24h" → opens a drawer or navigates to the audit log
  filtered to ban actions in last 24h.
- Hover → tooltip explaining what the metric counts.
- All cards consistent in interaction model.

---

## P2 — Post moderation integration

### P2-3. Approve / Remove post buttons in DOM

**Status:** Open
**Reported:** Provided cURLs for GAW's `/approve`, `/remove`, `/delete`
endpoints.

**Acceptance:**
- Inject Approve / Remove buttons next to existing mod actions in post DOM.
- Use captured XSRF token (same pattern as POST MASTER's scored-headers).
- Approve: `POST /approve` with `id={postId}&type=post&community={community}`.
- Remove: `POST /remove` same body shape.
- Audit log entry per action (mod_audit row).
- Status snack on success/fail.

### P2-5. Auto-remove queue items from SUS/DR users

**Status:** Open
**Reported:** When a new user posts or comments, GAW auto-flags it for
mod review (queue). If that user is on the SUS list OR Death Row, the
post/comment should be auto-removed (mod can undo).

**Acceptance:**
- Firehose / queue listener detects new queue entries.
- Cross-references author against `mod_user_sus` + `auto_death_row_rules`
  + `gam_deathrow` shared list.
- If match: hits GAW `POST /remove` with the captured XSRF token (same
  pattern as P2-3 manual approve/remove).
- Logs to mod_audit with action `'auto_remove'` + `reason: 'sus' | 'dr'`.
- Surfaces a toast: "Auto-removed @user post (SUS) — undo".
- Undo button hits `POST /approve` and removes the audit entry.
- Lead can configure the threshold per category (SUS / DR) in popup.

### P2-4. Detect OP self-delete

**Status:** Open
**Reported:** OP can delete their own post via `POST /delete`. Capture
this signal so mod tools can flag deleted-by-OP posts in firehose.

**Acceptance:**
- Firehose ingest extends `gaw_posts` with `is_deleted_by_op` flag (the
  page returns "Post not found" + the cookie still has user info).
- Feed into intel-cache so a mod browsing later sees "deleted by OP X
  minutes after posting" annotation.

---

## P3 — Brainstormed tard-identification features

(Per Commander's request to brainstorm — these are suggestions, not yet
prioritized.)

1. **Comment cadence indicator** — small clock icon next to username if
   their comment-per-hour rate is >3× their 30-day average. Hot signal.
2. **First-seen badge** — `🆕` if account is <14 days old.
3. **Profile-zero badge** — `0️⃣` if zero karma after >100 comments.
4. **Username similarity to known TARDs** — Levenshtein-distance check
   against the `auto_death_row_rules` patterns; tooltip shows match %.
5. **Posting velocity heatmap** — in profile hover, a tiny sparkline of
   comments-per-hour over last 24h. Spikes = suspicious.
6. **Cross-community fingerprint** — if a username appears on multiple
   .win sites with similar comment patterns, mark as cross-community
   (might be sock/multi-account).
7. **Reply-to-DR-pattern detector** — flag users who have >X% of their
   comments replying to known DR'd users (often co-conspirators).
8. **First-comment-on-thread heatmap** — users who consistently get the
   first comment on new posts within 30s (often signal-boosters).
9. **Capslock ratio** — running average of % uppercase chars in
   comments; >50% over 10+ comments = SCREAMING flag.
10. **Emoji-density indicator** — typical TARDs lean heavy on specific
    emoji clusters (🚨🤡💀); anomalies ping the SUS detector.

---

## P3 — Polish / followups

### P3-1. Stats card explanations on hover

Tooltip per card so a new lead understands the metric without spelunking.

### P3-2. Auto-claim button rename

The "Claim invite" auto-staged button (claimInviteBtn) was technically
just rewired in v9.2.7 — the LEGACY whole-team `/invite/claim` endpoint
is now dead code in modtools' view. Either:
- Delete the legacy `/invite/claim` codepath entirely
- OR rename the popup-side label to "📨 Claim staged invite" so it's
  clearly differentiated from the manual "I have a rotation invite"

### P3-3. Onboarding visual polish

When a fresh mod claims, surface a brief celebration UI: "Welcome,
PresidentialSeal — your token is stored, mod chat is live, you can
close this popup." Currently just a status line flip.

---

## Test matrix (per release)

Before declaring v9.3.x ready:

- [ ] Fresh mod can claim invite via auto-button (case-insensitive)
- [ ] Fresh mod can claim invite via manual button (case-insensitive)
- [ ] Lead can re-issue invite for already-rotated mod
- [ ] Non-mod accounts see ZERO ModTools UI
- [ ] Mod chat send + receive
- [ ] Self-message doesn't increment own unread count
- [ ] Self-message DOES appear in own thread view
- [ ] Modal icons clickable for fresh mod (not blur-blocked)
- [ ] Hoverzoom doesn't clip at viewport edge
- [ ] DR rules sync across two mod sessions in different browsers
- [ ] USERS page refreshes without F5 within 60s of new user appearance
- [ ] Stats cards show audit data for newly-onboarded mods

---

## Vanguard extension stretch-goal closures (v9.3.14)

Round 2 of the external Vanguard security audit; complementary to the
worker-side fixes shipped at `9267ad2f`.

### C-3. Auto chrome.runtime.reload() supply-chain RCE — DONE v9.3.14

**Bug:** background.js alarm polled `raw.githubusercontent.com/.../version.json`
every 30 min and called `chrome.runtime.reload()` on mismatch. Combined with
`update-modtools.ps1` (which overwrites on-disk extension files from the same
GitHub raw URL), a single GitHub-account compromise could push malicious code
+ trigger reload across every install.

**Fix:**
- Removed `chrome.runtime.reload()` from the alarm handler entirely.
- Version-check URL flipped from GitHub raw → worker `/version` (also
  closes Vanguard L-3 — maintainer username no longer in extension code).
- New `gam_update_available` flag in chrome.storage.local; content-script
  init reads it and renders the existing `.gam-update-banner` with a new
  "↻ Reload extension" button that copies `chrome://extensions/?id=<id>`
  to clipboard for the user to paste manually.
- If the banner has been ignored >7d, a `console.warn` fires on the alarm
  tick to surface the stale-build state in forensic checks.

### H-4. getDebugSnapshot PII exfil — DONE v9.3.14

**Bug:** popup→content `getDebugSnapshot` message returned full snapshot
(mod actions, watchlist, deathRow, intel cache) on any
`sender.id === chrome.runtime.id` send, with no fresh-user-action handshake.

**Fix:** popup writes `_gam_snapshot_consent: {at: Date.now()}` to
`chrome.storage.session` BEFORE sending the message; content-script handler
validates `Date.now() - at < 2000`, rejects otherwise, and CLEARS the
consent token on first read so the same token cannot be replayed.

### M-3. Tabs permission too broad — DONE v9.3.14

`tabs` permission dropped from `manifest.json`. Verified all
`chrome.tabs.query({url: ...})` and `chrome.tabs.sendMessage(...)` call
sites use URL patterns covered by `host_permissions`
(`https://greatawakening.win/*`, `https://*.greatawakening.win/*`).
`chrome.tabs.create({ url })` does not require the `tabs` permission.

### M-4. style-src 'unsafe-inline' — PARTIAL v9.3.14

**Status:** partial fix shipped. The two largest inline-style blocks
(`__popupAskText` / `__popupConfirm` modal scaffold and `__renderInviteResult`
invite card) now use CSS classes from `popup.css`. ~38 smaller
`style.cssText` sites remain in popup.js (status colors, error rows, single
inline-style tweaks). `'unsafe-inline'` is still in popup.html's CSP and
WILL stay until the remaining sites are converted in v9.4. Documented in
the popup.css block header.

### L-1. Token prefix in console log — DONE v9.3.14

`__GAM_REHYDRATE` previously logged `team.slice(0,6) + '...' + team.slice(-4)`
— 10 of N chars. Replaced with `teamLen` / `leadLen` only.

### L-2. window.__GAM_REHYDRATE — DONE v9.3.14

Implementation moved to closure-scoped `_rehydrateImpl`. Window exposure
is now a deprecation shim that warns + delegates (preserves emergency
runbooks documented in CLAUDE.md). New "↻ Force re-hydrate" button in the
popup's Diagnostics section sends a `forceRehydrate` runtime message; no
prefix logging on the popup side either.

### L-3. GitHub username in extension code — DONE v9.3.14

Background.js version-check URL moved off `raw.githubusercontent.com/catsfive1/...`
to the worker's existing `/version` endpoint (which proxies the same
`shared-flags/version.json` server-side). Maintainer GitHub handle no longer
in extension binary.

### Deferred to v9.4

- M-4 remainder: convert ~38 small `style.cssText` sites in popup.js to
  classes, then drop `'unsafe-inline'` from popup.html style-src.
- Replace deprecation shim of `window.__GAM_REHYDRATE` with hard removal
  once all internal/external runbooks are updated.
