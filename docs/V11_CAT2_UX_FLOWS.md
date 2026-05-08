# V11 — Cat 2: UX Flow Audit & Friction Map

**Generated:** 2026-05-08 by Cat 2 (UX-flow analyst, 4-cat v11 brainstorm)
**Scope:** Workflow friction in v9.17.0; missing atomic actions; v11 compression targets.
**Lens:** time-to-completion, click-count, attention-cost, invisibility-of-tools-when-needed.

---

## A) THE 10 CORE WORKFLOWS — current vs ideal

### W1 — Mod sees hateful post → bans the user
**Today (5 clicks, ~12s):**
1. Hover post → press `B` (Ctrl+Shift+B works on hovered) → Mod Console opens (1 keystroke = 1 click equiv)
2. Pick ban duration (radio)
3. Pick reason macro from dropdown (or type)
4. Click "Ban Preflight"
5. Confirm in second modal
**Friction:** Two-modal preflight + confirm. Reason dropdown is *ahead* of the AI suggestion. No one-shot "ban with last-used reason+duration."
**Ideal (1 click, ~2s):** Right-click any post → "Ban [user] (default 7d / 'Hate speech')" — reuses last-used template; preflight runs invisibly, confirms via toast with 5s undo.
**Fix:** `(modtools.js:6417)` add `quickBan(item, useDefaults=true)` that skips both modals when defaults are present and AI severity ≥ medium. Right-click context menu replaces requiring hover-then-keystroke.

### W2 — Mod gets "why was I banned?" modmail → reviews context → replies
**Today (8 clicks, ~45s):**
1. Click envelope on status bar → modmail panel slides in
2. Click thread row in left list
3. Read message
4. Open new tab to /u/<sender> (manual URL build)
5. Skim their post history
6. Tab back to modmail panel
7. Pick AI candidate reply (already pre-fetched — good)
8. Click "Send"
**Friction:** No inline user-history pane; no "show their last 5 banned posts" button next to sender name. AI candidates render *before* sender intel — wrong order; mod needs context FIRST. `_showModmailPanel` (`modtools.js:14122`) detail pane is single-column; user history isn't there.
**Ideal (3 clicks, ~12s):** Modmail panel detail pane is **3-column**: thread/messages | sender intel (last 10 actions, prior bans, SUS status, account age) | AI candidates. Click thread → all three populate ambiently.
**Fix:** Widen panel to 920px on lg-screen; embed mini-IntelDrawer as middle column. Pre-fetch user history alongside AI reply candidates (already wired in v9.15.0 ambient pre-fetch — just add `getUserHistory` + last-10-actions to the prefetch payload).

### W3 — Mod scans queue at 11pm → bulk-removes 12 spam comments
**Today (~36 clicks, ~3min):** Open /queue → for each item: click queue item → click "remove" → confirm → next. No multi-select.
**Friction:** Queue items are individual click targets; no checkbox column; no "select all visible spam" pattern. P2-5 ("auto-remove queue items from SUS/DR users") would help but doesn't exist yet.
**Ideal (3 clicks, ~15s):** Queue triage console with checkbox column → "Select all from SUS authors" button → "Remove 12 selected" → toast undo (20s).
**Fix:** New `buildQueueTriageConsole()` parallel to `buildTriageConsole()`. Checkbox column + sticky action bar at bottom ("Remove N / Approve N / Ban N authors"). Group-by-author collapse.

### W4 — Lead audits new mod's last 100 actions to spot bad behavior
**Today (~10 clicks, ~5min):** Open popup → Lead tab → Maintenance reports → no per-mod action filter exists. Falls back to mod log filter by mod, but it's a single linear list with no anomaly highlights.
**Friction:** No "audit a mod" view. Anomaly detection (over-banning, ban-without-note, fast-fire patterns) is *not* a feature. Lead must eyeball.
**Ideal (1 click, ~30s for AI summary):** Lead tab → "Audit mod [select]" → renders: action histogram by hour, ban/note/msg ratio, % of bans with prior modmail context, 3 most aggressive bans with one-line AI commentary, list of bans on first-offense accounts.
**Fix:** New worker endpoint `/admin/audit/mod-profile?mod=X&days=30` returns aggregated stats + Llama "behavior summary." Lead-tab UI panel in popup.

### W5 — Mod investigates suspicious user → checks history → adds to watchlist
**Today (4 clicks, ~10s):** Hover user → tooltip shows minimal intel → click into user → manually click watchlist toggle in Mod Console → close → carry on. **Or** Ctrl+Shift+W on hovered post (good — already exists at `modtools.js:9565`).
**Friction:** Watchlist add via keyboard works on **post hover only**, not username hover or modmail thread. No "watch this user from the modmail panel" button. No watchlist-add reason field.
**Ideal (1 click + optional 1 reason):** Right-click any `/u/` link anywhere → "Watch with reason..." inline prompt. Watch entry persists reason for the lead audit trail.
**Fix:** Universal context-menu hook on all `a[href*="/u/"]` and `[data-username]` selectors (modtools.js GAM_CSS template). One handler routes to `toggleWatch(username, {reason})`.

### W6 — Mod sees SIREN chip pulse → drills in → triages
**Today (3 clicks, ~8s):** SIREN chip click → opens mod log (`modtools.js:14767`). Mod log is the WRONG destination — it's a flat history, not a triage queue.
**Friction:** SIREN chip aggregates SUS-count + recent-DR-adds, but click-target dumps the user into mod log. There's no "show me what's on fire RIGHT NOW" view.
**Ideal (1 click, ~3s):** Click chip → slide-in "Hot Now" panel: top 5 SUS users (sortable by comment_count_24h), top 5 DR adds (last 24h with reason), top 3 modmail threads with `status=new` + last_user_post_was_flagged. One-click action on each row.
**Fix:** New `_showHotNowPanel()` in modtools.js. Chip's existing handler (`sirenBtn.addEventListener('click', openModLog)` at line 14767) → swap to new panel. Mod log link goes inside the panel as a footer.

### W7 — Lead generates 5 rotation invites → emails team
**Today (~15 clicks, ~3min):** Popup → Lead tab → Mod rotation roster → for each unrotated mod: click "Issue invite" → copy link → paste into separate email → repeat 5x. No bulk email composer. "Issue all unrotated" exists but doesn't email; just copies last URL.
**Friction:** Email composer is fully out-of-app. No template. No bulk send. No tracking of "emailed but not claimed."
**Ideal (2 clicks, ~30s):** Roster → "Issue + email all unrotated (5)" → opens single mailto: with all 5 invite blocks pre-templated, one mailto window per recipient (or a single multi-recipient with personalized links via `?to1=&to2=`-style — depends on email client). Track `invite_emailed_at` server-side.
**Fix:** Server-side: `POST /admin/mod/rotation-invite-bulk` returns `[{mod, url, mailto}]`. Client: new "Issue all + email" button generates one `mailto:` per recipient, opens them serially with 200ms gap. Roster shows `📧 emailed 2h ago / not yet claimed` badge.

### W8 — Cross-shift handoff: lead briefs next shift on hot incidents
**Today (no feature; ~10min manual):** Lead writes free-form message in mod chat. Next shift reads scrollback. No structured handoff.
**Friction:** **This entirely doesn't exist.** Backlog has CHAT-10 (Shift Handoff: AI-summarized end-of-shift digest) but it's tier-3 deferred.
**Ideal (1 click, ~15s):** "End shift" button in chat panel → AI generates digest from last 8h of: bans, SUS adds, hot modmail threads, unresolved incidents, watchlist additions. Posts as pinned thread. Next mod's first-load shows "Handoff from <prev mod> — 8h ago" prominently.
**Fix:** Promote CHAT-10 to tier-1 for v11. Lean on existing `aiCallerKey` + worker `/audit/query`. Lead-tier feature in v11.0; rollout to all mods in v11.1.

### W9 — Mod explores AI tard suggestions → adds 3 to autoDeathRowRules
**Today (4 clicks per rule, ~30s each, 90s total):** Popup → Maintenance → "AI: suggest tard / sus patterns" → wait → reads list → click "+ DR rule" on each → confirm. 1-click add (good!). But the panel is in the popup, which closes on focus-loss — losing context.
**Friction:** Popup is ephemeral (closes when you click outside). Tard panel survives within the popup but won't survive cross-app context switching. Adding 3 rules requires keeping the popup pinned (or reopening + re-querying AI = wasted budget).
**Ideal (2 clicks per rule + persistence):** Tard suggestions render in **modtools.js status bar dropdown** (not popup). Persists across navigation. Per-row: "+ DR rule" + "Watch only" + "Dismiss." Multi-select with "Add 3 selected as DR rules."
**Fix:** Move tard suggestions to a status-bar accordion (between SIREN and presence). One refresh button. Per-row checkbox + bulk action footer.

### W10 — Mod investigates viral thread getting brigaded
**Today (~12 clicks, ~2min):** See pulsing comment count → click thread → scroll → spot 4 SUS commenters → for each: hover → tooltip → click into user → check history → back → repeat. No "thread summary."
**Friction:** No per-thread brigade detector. No "show me commenters newer than 7d on this thread." `compactBylines()` already runs but only formats time; doesn't surface novelty.
**Ideal (1 click, ~5s):** "Thread Watch" button injected next to thread title → AI panel: total commenters, % new accounts (<14d), % zero-karma, top 5 most-likely-brigade-pattern users with one-click "ban + remove comment" each. Auto-flags if novel-account ratio > 30%.
**Fix:** New IntelDrawer kind `Thread`. Worker endpoint `/mod/thread/intel?id=X` aggregates commenters' age + history. Client renders side-panel with bulk actions.

---

## B) MISSING ATOMIC ACTIONS (single-click ops that should exist but don't)

1. **Right-click any `/u/` link → 4-item menu**: Open Mod Console / Watch / Mark SUS / Copy ban-permalink.
2. **Right-click any post → 4-item menu**: Quick-ban / Approve / Remove / Copy permalink.
3. **Middle-click any modmail row → archive without opening** (today: must open).
4. **Shift+click watchlist toggle → "Watch + add to roster review queue"** (lead pulls these weekly).
5. **Click any timestamp ("3h ago") → copy ISO timestamp to clipboard** (audit screenshots).
6. **Drag a username chip onto another mod's chat avatar → DM that mod with the user pre-quoted.**
7. **Click siren-chip count → opens that user's Mod Console directly** (not the entire mod log).
8. **Long-press status-bar envelope → "Mark all visible modmail as read"** (today: per-thread).
9. **Click DR queue count → expand inline to last 5 entries with one-click un-DR** (today: opens full mod log).
10. **Right-click chat message → "Quote in modmail reply"** for cross-surface evidence pinning.

---

## C) PROPOSED KEYBOARD SHORTCUTS (10 new, mnemonic, conflict-checked against `modtools.js:9559-9587`)

| Combo | Action | Mnemonic |
|---|---|---|
| `Ctrl+Shift+Q` | Open Quick-ban modal (last-used template, hovered or focused user) | **Q**uick |
| `Ctrl+Shift+T` | Open "Hot Now" panel (was: SIREN drilldown) | **T**riage |
| `Ctrl+Shift+E` | End shift → AI handoff digest | **E**nd shift |
| `Ctrl+Shift+D` | Open dashboard (already on a button; promote to kbd) | **D**ash |
| `Ctrl+Shift+U` | "Watch user" inline prompt (any focused/hovered user) | **U**watch |
| `Ctrl+Shift+G` | Toggle queue triage console grouping | **G**roup |
| `Ctrl+Shift+N` | Quick-note on current user (anywhere) | **N**ote |
| `Ctrl+Shift+J` | Jump to next unread modmail thread | **J**ump |
| `Ctrl+Shift+K` | Jump to previous unread modmail thread | **K**ack |
| `Ctrl+Shift+/` | Open keyboard shortcut overlay (already partial via `?`) | **?** help |

All clear of Chrome built-ins (verified against current Chrome 130 reserved set; `Ctrl+Shift+Q` quits Chrome on **macOS only** — fine for Windows-first user base).

---

## D) MISSING NOTIFICATIONS (events that should auto-notify)

1. **Watched user posts** — currently silent. Should: status-bar pulse + optional desktop notification.
2. **DR rule matches** — already auto-actions, but no audible/visible "DR triggered on @user."
3. **Modmail from prior-banned user** — high-priority badge color (today: same color as new).
4. **New mod tries to use a token** — lead alert on first use of any rotation invite (catches suspicious claims).
5. **Token age >75d** — popup banner before the 90d hard threshold.
6. **AI budget at 80%** — early warning today only fires at 100%.
7. **Cross-mod: same user reported in 2+ modmails within 1h** — brigade signal.
8. **Schema-version mismatch on background.js update** — auto-warn before user hits a bug.

---

## E) MISSING DASHBOARDS (lead at-a-glance team health)

1. **Mod Health Strip** — per-mod row: token age | last action | actions/day 7d-avg | ban-with-note % | ban-on-first-offense %. Color-coded.
2. **Brigade Heatmap** — 24h × 7d grid showing comment-spike anomalies on monitored threads.
3. **Modmail SLA Board** — average response time per mod, oldest unanswered, "stuck claimed" (claimed >2h, still no reply).
4. **Token Vault Status** — total mods, rotated <30d, rotated 30-60d, rotated >60d, never rotated. Click row → Roster.
5. **AI Spend Curve** — per-mod daily budget vs cap; trendline; flag mods burning >70% before noon UTC.
6. **Flag Rate Dashboard** — flags created vs flags expired (TTL); ratio per mod (catches over-flaggers).

---

## F) THE 10 MOST PAINFUL MULTI-CLICK FLOWS (compress to 1-2 clicks in v11)

| # | Today | Target | Compression mechanic |
|---|---|---|---|
| 1 | Hateful-post-to-banned (W1): 5 clicks | 1 click | Right-click + last-used template default |
| 2 | Modmail with full context (W2): 8 clicks | 3 clicks | 3-column panel, ambient prefetch user-history |
| 3 | Bulk spam queue (W3): 36 clicks | 3 clicks | Checkbox column + group-by-author |
| 4 | Mod audit (W4): 10 clicks + 5min | 1 click | `/admin/audit/mod-profile` endpoint + AI summary |
| 5 | Generate+email N invites (W7): 15 clicks | 2 clicks | Bulk endpoint + serial mailto: open |
| 6 | SIREN drilldown (W6): 3 clicks → wrong page | 1 click | New "Hot Now" panel |
| 7 | Shift handoff (W8): manual ~10min | 1 click | AI digest from last 8h substrate |
| 8 | Brigade investigation (W10): 12 clicks | 1 click | Thread Watch panel |
| 9 | Add 3 AI-tard rules (W9): 12 clicks | 4 clicks | Status-bar accordion + multi-select |
| 10 | "What's the diff between this mod and the team avg?" | 1 click | Mod Health Strip dashboard |

**Aggregate:** v11 should reclaim ~25 minutes per mod per shift through these compressions alone.

---

## SYNTHESIS NOTE FOR CAT 4 (Opus)

The pattern: **v9 features are all individually correct, but they live in the wrong surfaces.** Modmail panel doesn't bring user-intel. SIREN chip dumps to mod log instead of triage. Tard suggestions hide in popup. Bulk operations are missing on the queue (the highest-volume surface). Lead has no per-mod accountability view despite all the audit infrastructure.

**v11 thesis: don't ship more features — relocate what exists into the surfaces where the actual work happens, and fill the 4 atomic-action gaps (right-click menu, queue checkboxes, mod-audit view, shift-handoff digest).**
