# V11 R2 Cat 6 -- USER ADOPTION / ONBOARDING / RETENTION

**Generated:** 2026-05-08 by Cat 6 (User Adoption / Onboarding / Retention / Recruitment)
**Lens:** The adoption funnel for GAW ModTools is not a typical SaaS funnel. Every mod is a volunteer. There is no monetary hook, no viral loop tied to personal benefit, and no "aha moment" promised by a sales deck. The only motivation that works is impact -- the mod's ability to do real work fast, see that it mattered, and feel like part of a team that's doing something worth doing. Every adoption mechanism proposed here is grounded in that dynamic. Gamification traps, badge systems, and leaderboard chest-thumping are excluded by default. The aesthetic is Bloomberg: serious, data-dense, quietly satisfying. The goal is a mod who opens the extension on their own because it makes them better at something they actually care about.

---

## A. THE TOP 25-30 (ranked by adoption leverage)

---

### 1. In-Product Onboarding Wizard (First-Run State Machine)

- **Why through adoption lens:** The current 5.8/10 composite is almost entirely an activation-stage failure. The popup opens to a Stats tab full of dashes. There is no "you are here" signal, no next step, no progress marker. A fresh mod's first experience is zero-information. An in-product wizard replaces INSTALL.md dependency with a guided state machine: Step 1 of 3: Claim your invite. Step 2 of 3: Confirm your identity. Step 3 of 3: Reload the page. Completion rate on linear wizards with three steps is near 100% when the steps are concrete and short. The current flow expects new mods to discover the Tokens tab, understand what "claim invite" means, and figure out that they need to reload -- all without guidance.
- **Funnel stage:** Activation
- **Implementation sketch:** When `__validateModAuth` fails and reason is `no_token`, the popup forces the Tokens tab and renders a sticky 3-step progress banner at the top (not a modal -- modals get dismissed). Step 1 CTA is "Claim invite." Step 2 is auto-triggered on successful claim. Step 3 is a "Reload your GAW tab" button with a countdown. Banner dismisses permanently once `whoami` returns `ok`. Three lines of popup.js `wireTabNav` + a 40-line banner component.
- **Effort:** S
- **Risk:** Lo (no backend changes; pure popup state)
- **Dependency:** None. Ships standalone.
- **Success metric:** % of fresh mods completing claim within 10 minutes of first popup open. Target: from ~60% today to 90%+.
- **Stretch ambition:** Track step-completion telemetry per mod so lead can see where the cohort dropped off.

---

### 2. Brave/Linux Onboarding Rescue Path

- **Why through adoption lens:** Half the forum base runs Brave. The current invite flow silently fails on Brave Shields (no detection, no error, no alternative). A mod who gets a broken invite flow and sees no error will: (a) ask the lead for help (burning lead bandwidth), (b) give up, or (c) email/message someone with "is this broken?" All three are activation failures. The fix is a detection-then-alternate-path: detect Brave, surface a banner on the invite-link click explaining the Shields issue, and offer a fallback path (paste the URL or the bare code into the popup's Claim field). This is documented in UAT_ONBOARDING B2 as a ~20-line fix in modtools.js near L17915.
- **Funnel stage:** Activation
- **Implementation sketch:** `navigator.brave?.isBrave()` check upstream of the `mt_invite` IIFE parser. On positive: show a persistent amber banner on the GAW page: "Brave Shields may have stripped your invite code. Paste the full invite URL into the Claim field in the ModTools popup." Banner includes a copy-able link to the INSTALL doc and a "Open popup" button. Also: add a prominent Brave gotcha to INSTALL.md and create a 5-line INSTALL_BRAVE.md that is linked from that banner.
- **Effort:** S
- **Risk:** Lo (detection is read-only; the fallback path -- paste into popup -- already works per UAT_ONBOARDING B4)
- **Dependency:** None. This is V11 #15 already in the plan; this entry is the ADOPTION framing of why it belongs in Wave 1, not Wave 2.
- **Success metric:** Zero activation failures attributed to Brave Shields in the next 30-mod cohort.
- **Stretch ambition:** Detect Firefox too (content script permissions differ). Same banner, same fallback.

---

### 3. Default Popup Tab = Tokens When Unauthenticated

- **Why through adoption lens:** The fresh mod's first popup open shows the Stats tab with six dashes. The Tokens tab -- where the only meaningful action is -- is one click away, unlabeled, with no hint that it is the right destination. This is a discoverability failure of the most preventable kind. Every fresh mod must discover the Tokens tab on their own. Some do not. The fix is mechanical: when `__validateModAuth` returns a non-ok state, `wireTabNav` lands on Tokens by default, and a banner at the top says "Step 1: claim your invite here."
- **Funnel stage:** Activation
- **Implementation sketch:** 15-line `popup.js` change in `wireTabNav` or `loadToken`: check auth state on init; if not `valid`, call `wireTabNav('tokens')` and inject the Step 1 banner. Auth state is already computed by the time `loadToken` runs.
- **Effort:** S
- **Risk:** Lo
- **Dependency:** None (already partially framed in UAT_ONBOARDING E5).
- **Success metric:** Mean time to popup-Tokens-tab for fresh mods drops from unmeasured to sub-5 seconds.
- **Stretch ambition:** Animate a subtle pulse on the Claim button to draw the eye without being garish.

---

### 4. Self-Service Onboarding: Lead Bandwidth Cut by 80%

- **Why through adoption lens:** The lead (catsfive) is the single onboarding bottleneck. Every new mod requires a manual DM with an invite link, verbal guidance through the INSTALL steps, and often a follow-up support session. At 14 non-lead mods today and a hypothetical 30-mod team at scale, this is a structural ceiling on team growth. The target is: lead generates an invite link in two clicks, pastes it into Discord/DM, and the mod's next question is never about setup. The wizard (item 1), the Brave rescue (item 2), the tab default (item 3), and the INSTALL decision-tree rewrite together are the components. This item is the LIFECYCLE call to ship all four as a coherent "self-service onboarding bundle" in Wave 1.
- **Funnel stage:** Activation (lead-bandwidth reduction is a precondition for scaling acquisition)
- **Implementation sketch:** Bundle: wizard banner + Brave detect + tab default + INSTALL.md rewrite (decision-tree: Drive Desktop yes/no, Brave yes/no, two-mods-same-machine warning). Lead popup one-click "Copy invite link" that generates `https://greatawakening.win/?mt_invite=CODE` and copies to clipboard. Currently leads must assemble this URL manually from the bare code (UAT_TOKENS E3: verify this is not already done).
- **Effort:** S-M (INSTALL rewrite is S; wizard bundle is the sum of items 1-3)
- **Risk:** Lo
- **Dependency:** Items 1, 2, 3 above.
- **Success metric:** Lead-hours-per-new-mod drops from estimated 20-30 min to under 5 min. Track by asking lead to log time after next 3 onboardings.
- **Stretch ambition:** Lead dashboard card showing "X mods onboarded this month / avg time to first action." Feeds item 12.

---

### 5. Time-to-First-Value Funnel Map (and the gaps)

- **Why through adoption lens:** Auth is not first value. Auth is the tollbooth before first value. The current time-to-first-action sequence is: install (~10 min) -> auth (6-8 min happy path) -> discover modmail (~2-5 min) -> complete first modmail action. Conservative total: 20-25 minutes before a mod does anything that matters. At 30 minutes per first session, half the session is setup. The goal for v11 is to collapse this to: install (5 min, wizard-guided) -> auth (3 min, wizard) -> right-click first post -> action taken. Target: first meaningful action within 10 minutes of install. This item is not a feature -- it is a measurement mandate. Ship the telemetry hooks (event: `first_action_taken`, `time_since_install_ms`) so we can actually know the current number and track improvement.
- **Funnel stage:** Activation
- **Implementation sketch:** On first successful `__validateModAuth`, set a `gam_first_auth_ts` timestamp in `chrome.storage.local`. On first successful mod action (any ban/warn/remove/modmail-send), emit `first_action_taken` event to worker audit log with `elapsed_ms = now - first_auth_ts`. Lead can query this per-mod. No new backend table needed -- the audit `actions` table already accepts `source` metadata; add `elapsed_from_auth_ms` to the row.
- **Effort:** S
- **Risk:** Lo (additive only; no behavioral change)
- **Dependency:** None.
- **Success metric:** p50 time-to-first-action drops to under 15 minutes. p90 under 30.
- **Stretch ambition:** Alert lead when a mod has authed but taken zero actions after 24h -- first lapse signal.

---

### 6. Sandbox / Demo Mode for Unauthenticated Mods

- **Why through adoption lens:** Today, an unauthenticated mod can do exactly nothing with the extension. The popup is a wall of dashes. There is no way to explore what the tool does, understand what a ban flow looks like, or get a sense of what moderating with this tool feels like -- before completing the auth gauntlet. This is a cold start problem. Demo mode is not a "try before you buy" gimmick -- it is a way to let a new mod understand the tool's shape before they've committed to the setup cost. A 2-minute demo mode experience that shows realistic (anonymized, synthetic) data -- a modmail thread, a queue item, the right-click menu -- converts curiosity into commitment.
- **Funnel stage:** Activation (bridges pre-auth to auth motivation)
- **Implementation sketch:** When auth fails and no invite is staged, show a "Preview the tool (demo data)" link in the wizard banner. Click loads a static JSON fixture into the popup (no worker calls) that renders synthetic modmail threads, a fake queue, a fake ban target. Mods can click through the full flow on fake data. On any action attempt, a soft modal: "That would have worked. To do this for real, claim your invite above." Exit demo mode -> wizard resumes.
- **Effort:** M (fixture data + demo render branch in each component)
- **Risk:** Lo-Md (risk: mods may not realize they're in demo mode; mitigate with persistent orange "DEMO MODE" banner)
- **Dependency:** Items 1, 3 (wizard scaffolding). Cat 3 owns the visual rendering of the demo mode banner.
- **Success metric:** % of mods who open demo mode and then complete auth within the same session. Target 70%+.
- **Stretch ambition:** Demo mode auto-launches in a walkthrough sequence (modmail -> ban -> queue) so the mod sees the three highest-value workflows in 90 seconds without clicking.

---

### 7. Trial Mod Tier with Shadow Mode as Onboarding Vehicle

- **Why through adoption lens:** Cat 3 F13 (Shadow Mode) was designed as a training mechanism. Through the adoption lens, it is also the formal definition of the trial-mod tier. Right now the distinction between "trial mod" and "full mod" is implicit: catsfive knows who's new and watches them. That is not scalable. A formal trial tier with Shadow Mode auto-on for first 30 days creates a structural accountability frame: new mods know they are in a review period, senior mods know to check their queue, and promotion to full mod is a concrete milestone with observable criteria.
- **Funnel stage:** Activation -> Retention (trial completion = first major retention milestone)
- **Implementation sketch:** `mod_tokens` row gets a `tier` column: `trial | full | lead`. Trial mods auto-get Shadow Mode (every ban/warn/remove intercepts and queues for senior review). After 30 days AND X actions AND Y% AI-agreement, lead sees a "Promote to full mod" button on the Scoreboard (V11 item 12). One-click promotion updates tier, disables Shadow Mode. Trial mods see their own status in the popup: "Trial mod -- 18 of 30 days complete, 42 actions."
- **Effort:** M (schema col + promotion endpoint + trial-status surface in popup)
- **Risk:** Md (gamification trap: trial criteria must not feel like a grind; mitigate by making criteria generous and promotion a human decision, not an auto-unlock)
- **Dependency:** V11 #26 (Shadow Mode), V11 #12 (Scoreboard), Cat 2 schema for `tier` col.
- **Success metric:** % of trial mods promoted to full mod within 45 days. % of trial mods who request Shadow Mode off before 30 days (early-engagement signal vs. frustration signal).
- **Stretch ambition:** Auto-generate a promotion summary for the lead: "Trial mod PresidentialSeal completed 30 days: 87 actions, 94% AI agreement, 0 overturned bans. Recommended: promote."

---

### 8. Shift Digest as Retention Mechanism (not just handoff)

- **Why through adoption lens:** Cat 3 F6 / V11 #11 frames the AI Shift Digest as a handoff tool. Through the adoption lens, it is also a retention mechanism. A mod who opens the extension and immediately sees "here's what happened since you were last online, here's what's hot now, here's where you're needed" is a mod who feels connected to an ongoing story rather than dropping into a vacuum. That sense of continuity is one of the strongest retention drivers for volunteer contributors in any context. The digest is the "previously on" that makes showing up feel worth it.
- **Funnel stage:** Retention
- **Implementation sketch:** On mod login (first `__validateModAuth` ok after >4h absence), the Intel Drawer auto-opens with a "Since you were away" digest: 5 bullet points (AI-generated, Claude via existing path) covering active incidents, pending proposals, top queue items, any patterns added since last visit, new team members. 5 seconds of read time, then it collapses. Mod can pin it open. This is V11 #11 with a retention-framing trigger added: not just "end of shift" but also "return from absence."
- **Effort:** S (the digest generation is V11 #11; the "return from absence" trigger is a 10-line addition)
- **Risk:** Lo (digest quality is the only risk; mitigate by making the prompt tight and the output < 100 words)
- **Dependency:** V11 #11 (AI Shift Digest base feature).
- **Success metric:** % of mods with >4h absence gaps who return within 48h. Track before/after digest launch. Target: 7-day return rate improves from unknown baseline to 80%+.
- **Stretch ambition:** Digest personalizes by mod role: trial mods get "your queue focus areas"; veteran mods get "patterns you haven't reviewed"; lead gets "team health in 5 numbers."

---

### 9. First-Action Acknowledgment (Quiet, Not Saccharine)

- **Why through adoption lens:** The first meaningful action a mod takes -- first ban, first modmail reply, first death row add -- should not pass without acknowledgment. Not a badge. Not a popup with confetti. A single line in the audit log and a one-time snack message: "First ban logged. For the record." Bloomberg aesthetic: it happened, it was recorded, you should know. The function of this moment is not celebration for its own sake; it is a signal that the system saw what the mod did and it counted. For a volunteer who is not getting a paycheck, "the system noticed" is a meaningful form of recognition.
- **Funnel stage:** Activation -> Retention (first-action moment is the activation/retention bridge)
- **Implementation sketch:** Worker-side, on first successful action per mod (detectable from `actions` table: `SELECT COUNT(*) FROM actions WHERE author = ?`), return an `is_first_action: true` flag in the action response. Client-side, intercept this flag and show a snack: "First [ban/warn/modmail] — logged." No fanfare. Snack auto-dismisses in 4 seconds. The audit log entry gets a `milestone: first_action` tag. Lead can see all "first action" milestones in the Mod Health Strip (V11 #30).
- **Effort:** S
- **Risk:** Lo
- **Dependency:** None. The `actions` count query is one line.
- **Success metric:** % of mods who take a second action within 24h of first action. Target: 85%+.
- **Stretch ambition:** First-week and first-month milestones on the same pattern. First week: "7 days active. N actions taken." First month: "30 days. N actions. For the record."

---

### 10. Personal Stats Card as Daily Habit Anchor

- **Why through adoption lens:** V11 #10 / Cat 3 F4 proposed the Personal Stats Card primarily as a motivation lever. Through the adoption lens it is also a habit-formation mechanism. A mod who opens the popup and sees "today: 4 actions / this week: 23 / 30d: 91" has a concrete reason to return: to see those numbers move. This is not gamification in the points-and-badges sense; it is the same principle that makes a word-count tracker useful for a writer. The number is not a reward -- it is a mirror. For a volunteer who has no manager and no performance review, the stats card is the only feedback loop that tells them they're contributing.
- **Funnel stage:** Retention (habit formation)
- **Implementation sketch:** V11 #10 as-spec. Adoption-layer addition: the stats card should show a 7-day sparkline in Bloomberg amber so the mod can see trend (are my weeks getting busier or lighter?). Also: first time the card shows, a one-time tooltip: "Your contribution, recorded." After that it's just data.
- **Effort:** S (V11 #10 is already ranked 10th in V11_PLAN; this is adoption framing)
- **Risk:** Lo
- **Dependency:** V11 #10, `actions` table already indexed.
- **Success metric:** DAU/MAU ratio for mods. If mods check stats daily, DAU/MAU approaches 1. Track popup-open frequency per mod (low-cost telemetry: `chrome.action.onClicked` event count).
- **Stretch ambition:** Opt-in "weekly summary" DM via ModChat: "Your week: 23 actions, 2 modmails, 1 DR add. Team total: 187."

---

### 11. Lapsed-Mod Reactivation Path

- **Why through adoption lens:** There is currently no concept of a lapsed mod in the product. Token rotation is the only lifecycle event. A mod who has not acted in 30 days is invisible to the lead and to the system. They may be on vacation. They may have quietly rage-quit. They may just need a nudge. Without detection, there is no path back. The reactivation path does not need to be automated to be effective: surface the lapsed-mod signal in the Lead Scoreboard, and give the lead a one-click "ping via ModChat" action. The ping content is simple: "Hey [mod], haven't seen you in a while -- everything ok? Still want to be on the team?" Human signal, not bot behavior.
- **Funnel stage:** Resurrection
- **Implementation sketch:** Define "lapsed" as >21 days since last action (configurable by lead via settings). Worker computes lapsed-mod list from `actions GROUP BY author, MAX(ts)`. Lead Scoreboard (V11 #12) gets a "Lapsed" card showing the list. Each row has a "Ping in chat" button that pre-fills a ModChat DM. Lead sends or edits. Optionally, if the mod has provided a Discord username (future), the ping goes there too.
- **Effort:** S-M (query is trivial; the UX surface is the Scoreboard card)
- **Risk:** Lo (ping is human-initiated, not automated; no false-positive blast risk)
- **Dependency:** V11 #12 (Lead Scoreboard), V11 #13 (slash palette for chat DM).
- **Success metric:** % of lapsed mods who return to action within 14 days of a lead ping. Track before/after this feature.
- **Stretch ambition:** Automated ping on 30-day lapse if lead has opted into it -- sent as ModChat DM from "ModTools System" with lead's name attached. "catsfive noticed you haven't been online in 30 days. All good?"

---

### 12. Mod Resignation Off-Boarding (the Human Moment)

- **Why through adoption lens:** Token revoke is mechanical. The human moment -- a mod who has been volunteering for months deciding to step back -- currently has no product surface at all. There is no "thank you" moment, no record of their contribution, no graceful exit. This matters for adoption because a mod who has a good exit is a mod who refers the next candidate. A mod who just gets their token nuked and never hears from the system again is not a referral source. The off-boarding moment is the referral pipeline's last gate.
- **Funnel stage:** Off-boarding -> Referral
- **Implementation sketch:** When lead revokes a token (`/admin/token/revoke`), worker triggers a "departure record" in the audit log: `{action: 'mod_departed', author: 'catsfive', subject: username, actions_lifetime: N, days_active: D}`. Lead popup shows this summary before confirming revoke: "PresidentialSeal: 847 actions over 94 days. Revoke token?" After confirm: lead gets a pre-filled ModChat message template: "Thanks for your service, [mod]. Your N actions are part of the permanent record." Lead can edit and send, or skip. The mod's contribution stats persist in the audit log forever.
- **Effort:** S
- **Risk:** Lo
- **Dependency:** `actions` table aggregate query. Token revoke endpoint already exists.
- **Success metric:** % of departing mods who are explicitly thanked (lead sends the message). % who return as community advocates / referrers (hard to measure; proxy: whether they stay in the forum community after departing).
- **Stretch ambition:** A permanent "alumni" list in the Scoreboard. Mods who contributed 100+ actions keep their name in the record. "PresidentialSeal -- departed 2026-06-01 -- 847 actions."

---

### 13. Community-to-Mod Recruitment Funnel

- **Why through adoption lens:** Currently the only recruitment path is: catsfive notices someone, decides they'd make a good mod, DMs them. This does not scale. There is no way for a high-karma community member to express interest in moderating, and there is no systematic way for the lead to identify candidates from the user base. A lightweight "express interest" path closes this gap without creating noise: a form (or a GAW page) where power users can submit a note to the lead. The lead reviews when convenient. No automation, no promises.
- **Funnel stage:** Acquisition
- **Implementation sketch:** Simplest: a pinned GAW post or sidebar link to a worker endpoint `/mod/recruit/apply` that accepts `{username, note}` and stores in a `mod_applications` D1 table. Lead sees pending applications as a badge in the Lead Scoreboard. One-click "Invite" or "Decline." No email confirmation to applicant (privacy; keep it async). If declined, lead can optionally DM via GAW.
- **Effort:** M (new endpoint + table + Scoreboard card)
- **Risk:** Md (spam applications; mitigate by requiring minimum karma threshold on the GAW account, enforced by the worker via GAW API if available)
- **Dependency:** Cat 2 for schema, Cat 1 for endpoint. Lead Scoreboard (V11 #12).
- **Success metric:** Number of qualified mod candidates surfaced per month via this path vs. lead-initiated outreach. Target: 2+ per quarter from community.
- **Stretch ambition:** Worker auto-screens applications against karma + account-age thresholds and surfaces only qualifying candidates to the lead.

---

### 14. Distributed Mentorship Structure (Beyond catsfive)

- **Why through adoption lens:** catsfive is the sole mentor. At 15 mods, this is manageable. At 30+ it is not. A distributed mentorship structure assigns each new/trial mod a veteran mentor (not catsfive) for their first 30 days. The mentor's job is simple: review their trial mod's Shadow Mode queue once a day and leave a coaching note when a decision was borderline. The product surface is minimal: V11 #14 (Two-Click Second Opinion) + V11 F12 (Coaching Loop) already provide the mechanism. This item is the adoption-layer call to formalize the mentor assignment and surface it in the Scoreboard.
- **Funnel stage:** Activation -> Retention
- **Implementation sketch:** `mod_tokens` row gets an optional `mentor_mod` field. Lead assigns mentor on token creation (dropdown of veteran mods). Mentor sees a "Mentees" card in their popup: "PresidentialSeal: 3 items in Shadow Queue today." One-click to review. Coaching note is a ModChat DM. Trial mod sees "Your mentor: propertyofUniverse" in their popup stats card.
- **Effort:** S (schema field + Scoreboard card + one additional popup display)
- **Risk:** Lo-Md (mentor fatigue if shadow queue is large; mitigate by auto-limiting shadow-queue items to 5/day max per trial mod)
- **Dependency:** Trial tier (item 7), Shadow Mode (V11 #26), Two-Click Second Opinion (V11 #14).
- **Success metric:** Trial-mod retention rate at 30 days, with vs. without mentor assigned. Lead bandwidth spent on mentoring (track lead's coaching note count vs. mentor note count -- target: mentor handles 80%).
- **Stretch ambition:** Mentor assignment is visible to all mods so the team knows the structure. "Team structure: catsfive (lead) -> propertyofUniverse (veteran) -> PresidentialSeal (trial)."

---

### 15. Social Proof: "Your Team's Last 24h" Panel

- **Why through adoption lens:** A volunteer who never sees the team working is a volunteer who feels isolated. Social proof is not about competition; it is about evidence that the enterprise is real, that others are contributing, that the work is ongoing. A "last 24h" panel in the popup or Intel Drawer showing: "3 mods active in the last hour / 47 queue items processed / 12 bans / 2 incidents resolved" is not a leaderboard -- it is a newsroom dashboard. Bloomberg-flavored, data-only, no names attached to individual counts unless the mod clicks in.
- **Funnel stage:** Retention
- **Implementation sketch:** Worker endpoint `/mod/team/snapshot` (reads `actions` table + `presence` table, aggregates into a 5-number summary). Rendered as a collapsible card at the bottom of the popup Stats tab. Refreshes on popup open. Numbers only: N mods active / N actions today / N queue items / N incidents. No per-mod breakdown at this level -- that's the Scoreboard (V11 #12, lead-only).
- **Effort:** S
- **Risk:** Lo
- **Dependency:** V11 #12 (Scoreboard) shares the same data; this is a read-only subset.
- **Success metric:** % of mods who open the popup at least once daily (proxy for "is this useful enough to check"). Secondary: qualitative feedback from mods on whether they feel connected to the team.
- **Stretch ambition:** "Shift handoff" flavor: the card shows who is currently online and a one-line AI summary of what they're working on. "propertyofUniverse reviewing 3 DR items. Brent75 on modmail."

---

### 16. Power-User Activation: Right-Click Discovery Path

- **Why through adoption lens:** V11's biggest compression win (item #1, right-click context menu) is also the primary power-user activation mechanism. A mod who has discovered right-click is a mod who has unlocked the tool. V11_PLAN notes: "Within one shift, 14 of 15 mods will discover the new path on their own." Through the adoption lens, "discover on their own" is not enough -- the discovery moment should be deliberately triggered during the first session to ensure it happens within 24h, not eventually. A first-session discovery prompt creates power-user activation within the first shift.
- **Funnel stage:** Activation -> Retention (power-user activation = strong 30d retention predictor)
- **Implementation sketch:** On first successful auth AND first GAW page load with the extension active, show a single amber snack message at the bottom of the page: "Tip: right-click any post, comment, or username for mod actions." One-time only. Snack stays for 8 seconds and does not auto-dismiss if the user is moving the mouse (hover detection). Log `right_click_discovery_shown: true` in `chrome.storage.local`. Track first actual right-click-menu-use in telemetry.
- **Effort:** S
- **Risk:** Lo
- **Dependency:** V11 #1 (right-click menu must ship first).
- **Success metric:** % of mods who use the right-click menu within their first 7 days. Target: 90%+ (vs. estimated 30% today who discover keyboard shortcuts in the same window).
- **Stretch ambition:** Day-3 contextual tip: "Tip: right-click a username -> 'View history' to pull the Intel Drawer without navigating." Progressive disclosure of the tool's depth.

---

### 17. Slash Palette Discovery Path

- **Why through adoption lens:** The slash command palette (V11 #13) is the tool's power-user ceiling. A mod who uses `/ban`, `/precedent`, `/coach` is a mod who is maximally effective and deeply engaged. But slash commands are invisible to a new mod. The adoption mandate is to ensure slash commands are discovered within the first two weeks, not after six months of muscle-memory accumulation. A brief in-product callout on first ModChat open is enough.
- **Funnel stage:** Retention (power-user activation, week 2)
- **Implementation sketch:** First time a mod opens ModChat and types any character, a one-time tooltip appears below the textarea: "Type / to see available commands." Tooltip dismisses on first `/` keypress or after 10 seconds. Log `slash_palette_discovered: true` in local storage. Track first actual slash command use.
- **Effort:** S
- **Risk:** Lo
- **Dependency:** V11 #13 (slash palette must ship first).
- **Success metric:** % of mods using at least one slash command by day 14. Target: 70%+.
- **Stretch ambition:** Weekly "command of the week" in the shift digest: "This week: /precedent find 'ban appeal' -- search past decisions by keyword."

---

### 18. Cross-Mod Recognition: Durable Kudos System

- **Why through adoption lens:** ModChat praise is ephemeral. A good call by a mod on Wednesday is gone by Friday. A lightweight, permanent "noted" system allows any mod to mark a peer's action as notable -- not a badge, not a score, just a durable record. The aggregate of "noted" marks becomes a quiet signal of who the team respects. It is also a mentorship tool: veterans marking new mods' good calls is the most credible form of positive feedback available in a volunteer context.
- **Funnel stage:** Retention
- **Implementation sketch:** In the Intel Drawer, next to any logged action, a small "Noted" button (one click, no confirmation). Stores `{noted_by, action_id, ts}` in a `mod_kudos` table. No count displayed publicly -- private signal to the lead only, visible in the Mod Health Strip (V11 #30). The mod who received a "Noted" sees a private snack on next login: "Your action on [date] was noted by [veteran]." That's it. No public leaderboard.
- **Effort:** S-M
- **Risk:** Md (risk: notes could be used politically; mitigate by making all "noted" marks lead-visible so abuse is auditable; no public display)
- **Dependency:** V11 #30 (Mod Health Strip), Intel Drawer (existing).
- **Success metric:** % of mods who receive at least one "Noted" within their first 30 days (proxy for social integration). % of veteran mods who use "Noted" weekly (proxy for culture adoption).
- **Stretch ambition:** Annual "contribution summary" per mod: total actions + total "Noted" received. Delivered as a ModChat DM from catsfive on the mod's one-year anniversary.

---

### 19. Precedent of the Day as Judgment Training

- **Why through adoption lens:** Cat 3 F12 (Coaching Loop) includes a "Precedent of the Day" auto-posted to chat. Through the adoption lens, this is also the primary judgment-formation mechanism for new mods. A mod who reads one real past case per day -- the facts, the decision, the reasoning -- is a mod who develops a shared understanding of team standards without requiring a formal training session. After 30 days of Precedent of the Day, a new mod has seen 30 real cases and absorbed the team's decision-making pattern. This is durable knowledge that reduces future escalations to the lead.
- **Funnel stage:** Retention (training as a retention mechanism -- mods who grow feel invested)
- **Implementation sketch:** Daily cron (worker-side) selects one `precedents` row from the last 90 days, prioritizing rows where `action` was non-trivial (ban >7d, lock, DR add) and `reason` is > 50 chars (substantive). Posts to ModChat as a pinned message: "Precedent of the Day: [rule_ref] -- [1-sentence AI synopsis] -- [link to drawer view]." Trial mods auto-tagged. Veteran mods can react with a thumbs up to signal "this is a good example." Reactions are stored as `mod_kudos` (reuses item 18 table).
- **Effort:** S (cron + post; AI synopsis via existing Claude path)
- **Risk:** Lo (curated from existing data; no new decisions required)
- **Dependency:** V11 #22 (Precedent Engine for search/selection), ModChat (existing).
- **Success metric:** Trial mod AI-agreement rate at 30 days vs. cohorts without Precedent of the Day. Hypothesis: 5+ percentage point improvement.
- **Stretch ambition:** New mods can reply to the Precedent of the Day with "what would I have done?" and get a private AI comparison against the actual decision. No grades, no scores -- just reflection.

---

### 20. Invitation Link Expiry UX (72h Failure Recovery)

- **Why through adoption lens:** An expired invite is currently surfaced as a generic HTTP 404 in the popup with the text "invalid." A new mod who sees "invalid" does not know whether they did something wrong, whether the system is broken, or whether the invite expired. The most common recovery path is: message the lead, explain the problem, get a new invite. This burns lead bandwidth and creates a support ticket out of an entirely avoidable UX failure. The fix is surfacing the specific reason: "This invite expired. Ask your lead for a new link."
- **Funnel stage:** Activation (failure recovery)
- **Implementation sketch:** Worker `handleModTokenClaimRotation` already returns `HTTP 404` on expired invites; extend the error body to include `{error: 'expired', expired_at: ISO_TS}`. Popup.js `__claimInviteClick` catches this code and shows: "Invite expired [X hours ago]. Message your lead for a new link." Include a pre-filled ModChat DM button: "Request new invite from catsfive." One click sends a DM.
- **Effort:** S (worker: 2-line change; popup: 10-line change; ModChat DM pre-fill: 5 lines)
- **Risk:** Lo
- **Dependency:** None.
- **Success metric:** Zero "invalid" as the only error feedback for expired invites. Lead-bandwidth reduction from invite-expired support requests.
- **Stretch ambition:** Worker proactively warns lead when invite codes are within 12h of expiry with no claim: "Alert: 3 unclaimed invites expire in 12h -- resend links?"

---

### 21. Two-Mods-Same-Machine Guard with Human-Readable Recovery

- **Why through adoption lens:** UAT_ONBOARDING B6 documents a silent identity collision when two mods share a Drive Desktop sync folder. The symptom is: second mod's claim overwrites first mod's token silently. There is no detection, no error, no recovery path. Both mods may believe they are authenticated when one is not. This is an activation-stage trust failure: the tool behaved correctly from a technical standpoint but left two users confused. The fix (UAT_ONBOARDING B6: compare `whoami.username` to prior on save) is the Cat 1/Cat 2 call. The adoption-layer addition is the human-readable recovery instruction.
- **Funnel stage:** Activation
- **Implementation sketch:** On `claim-rotation` success, popup.js compares new `mod_username` to prior `gam_settings.workerModToken`-derived username. Mismatch triggers a hard modal: "This Chrome profile already holds a token for [prior mod]. GAW ModTools requires one token per Chrome profile. To use a separate mod account, create a new Chrome profile. Guide: [link]." No silent overwrite. Modal has two buttons: "Use [prior mod]'s token" (cancel) or "Yes, replace with my token" (proceed with explicit confirmation).
- **Effort:** S
- **Risk:** Lo
- **Dependency:** UAT_ONBOARDING B6 fix (already in priority list).
- **Success metric:** Zero silent identity collisions in production. All collisions surface the modal.
- **Stretch ambition:** INSTALL.md gets a "Shared Computer" section with Chrome profile creation walkthrough.

---

### 22. Onboarding Status Visible to Lead

- **Why through adoption lens:** The lead currently has no visibility into where each new mod is in the onboarding process. Did they claim their invite? Did they complete first auth? Did they take their first action? The only signal is silence or a DM. A lead-visible onboarding status board closes this loop: lead can see at a glance which mods are stuck and where.
- **Funnel stage:** Activation (lead-visibility of activation funnel)
- **Implementation sketch:** Worker aggregates per-mod onboarding state from `mod_tokens` + `actions` tables: `{mod, token_age_h, first_action_ts, action_count_7d}`. Lead Scoreboard (V11 #12) gets an "Onboarding" section showing mods with `action_count_7d = 0` who have tokens. Lead can see "PresidentialSeal: claimed token 3 days ago, zero actions -- needs nudge." One-click "Ping in chat."
- **Effort:** S (query + Scoreboard section; depends on V11 #12)
- **Risk:** Lo
- **Dependency:** V11 #12 (Lead Scoreboard).
- **Success metric:** Lead time to identify stuck-in-onboarding mods drops from days (waiting for silence) to real-time.
- **Stretch ambition:** Automated ping from system after 48h with no action: "You've been set up but haven't moderated yet. Need help getting started?" Requires lead opt-in.

---

### 23. Habit Formation: Daily Ritual Surface

- **Why through adoption lens:** A tool that requires active effort to open is a tool with a high habit-formation barrier. The current extension has no ambient signal except the modmail badge count. A mod who is not actively engaged may go days without opening the extension simply because there is no trigger. A daily ritual surface -- a small, consistent "your shift" indicator -- creates a soft habit anchor. Not a push notification (intrusive). Not a mandatory check-in. A contextual hint that is only visible when the mod is already on the GAW site.
- **Funnel stage:** Retention (habit formation)
- **Implementation sketch:** When a mod lands on greatawakening.win and has not taken any action in the current calendar day, the status bar shows a gentle amber dot on the GEAR icon and a 3-second snack: "3 items in queue / 1 modmail waiting." The dot clears after the mod takes any action or opens the popup. This is not a notification -- it is a state indicator that respects the mod's autonomy while surfacing actionable information.
- **Effort:** S
- **Risk:** Lo (purely informational; no new data required)
- **Dependency:** Status bar (existing), modmail badge count (existing), queue count endpoint (existing).
- **Success metric:** DAU/MAU ratio. If this works, mods who visit GAW more frequently also open the extension more frequently.
- **Stretch ambition:** Mod can set a "shift preference" (morning / evening / weekend) in the popup settings. The ambient dot only fires during their preferred shift window. Respects volunteer time boundaries.

---

### 24. CWS Submission as Adoption Unlock

- **Why through adoption lens:** The extension is currently sideloaded ("Load unpacked"). This is a meaningful friction point for non-technical mods and a complete blocker for any future mods who are not comfortable with Chrome developer mode. The Chrome Web Store submission is not primarily a distribution channel -- it is a legitimacy signal and an installation simplification. "Click install" vs. "enable developer mode, download a ZIP, extract it, load unpacked, pin the icon" is a 30x reduction in installation friction. CWS submission is the highest-leverage single action for improving the acquisition-to-activation conversion rate for future mods.
- **Funnel stage:** Acquisition (installation friction)
- **Implementation sketch:** This is already in progress (draft state per project TLDR). The adoption-layer call is: prioritize completing the CWS submission before expanding the mod team. Every mod onboarded via "Load unpacked" is a mod who had to clear a non-trivial technical hurdle. That hurdle filters out good mods who are not comfortable with Chrome internals.
- **Effort:** M (CWS submission process: screenshots, privacy policy, review wait)
- **Risk:** Lo-Md (CWS review can reject or delay; mitigate by submitting early and iterating)
- **Dependency:** None blocking. Manifest is already MV3-compliant per project docs.
- **Success metric:** % of new mods who install without needing lead assistance with the install process. Target: 95% post-CWS vs. estimated 60% with current sideload.
- **Stretch ambition:** CWS listing page serves as the public face of the mod team's tooling: "Professional moderation tools for the GAW community. Invite-only."

---

### 25. Reactivation Trigger: Lapsed-Mod In-Product Surface

- **Why through adoption lens:** Distinct from item 11 (which covers the lead-initiated ping), this item covers what happens when a lapsed mod returns on their own. A mod who hasn't acted in 30 days and opens the extension should see a "you've been away" context-setter: what changed while they were out, what's in queue now, one clear action they can take in the next 5 minutes. The goal is to convert a tentative return visit into an active session.
- **Funnel stage:** Resurrection
- **Implementation sketch:** When `__validateModAuth` returns ok AND `gam_settings.last_action_ts` is >21 days ago, auto-trigger the "Since you were away" digest (same mechanism as item 8) but with a more direct first-person frame: "Welcome back. Here's what's changed." 3-4 bullet points: queue depth, any new team members, any incidents in the interim. Bottom of the digest: one amber CTA -- "Start with the oldest unresolved modmail." Clears after mod takes any action.
- **Effort:** S (depends on the digest mechanism from item 8; add the lapse-detection trigger)
- **Risk:** Lo
- **Dependency:** Item 8 (Shift Digest), V11 #11.
- **Success metric:** % of lapsed mods (>21d) who take an action within the same session they see the reactivation surface. Target: 60%+.
- **Stretch ambition:** If the mod was lapsed >60 days, the welcome-back screen includes a soft "Are you still on the team?" with two buttons: "Yes, I'm back" (logs a presence ping) and "I'd like to step back" (initiates the off-boarding flow from item 12).

---

### 26. INSTALL.md Decision-Tree Rewrite

- **Why through adoption lens:** INSTALL.md is the pre-product onboarding surface. Every failure mode in the current INSTALL flow (Drive Desktop assumed, Brave not mentioned, "wrong folder" foot-gun in step 3, no decision tree) is an adoption failure that happens before the product can even attempt to help. The doc rewrite is the cheapest activation improvement available: pure docs, no code, 30-minute effort, removes the two highest-volume failure modes documented in UAT_ONBOARDING B1 and B2.
- **Funnel stage:** Activation (pre-product)
- **Implementation sketch:** Top of INSTALL.md: "Do you have Drive Desktop installed? Yes -> Path A. No -> Path B." Path A section leads with the "Available offline" toggle gotcha before mentioning "Load unpacked." Common Gotchas section: Brave Shields (with the exact banner text mod will see), two-mods-same-machine, Drive-Desktop-not-synced. Every step ends with "what you should see" (not just what to do). Final section: "Still stuck? Message catsfive in ModChat or Discord with a screenshot."
- **Effort:** S
- **Risk:** Lo
- **Dependency:** None.
- **Success metric:** Reduction in lead-received "install help" DMs in the next 30 days. Proxy: lead self-reports.
- **Stretch ambition:** INSTALL.md is auto-linked from the wizard banner (item 1) so mods who want depth can find it from within the product.

---

### 27. Power-User Activation Milestone: Day 30 Check

- **Why through adoption lens:** Research on volunteer contributor retention consistently shows that contributors who are still active at 30 days are dramatically more likely to be active at 6 months. The 30-day mark is the most predictive retention milestone. A deliberate day-30 touchpoint -- not automated, human-initiated by the lead -- closes this gate explicitly. The lead sees a "30-day anniversaries" card in the Scoreboard. One click sends a ModChat message: "PresidentialSeal -- 30 days. N actions. Full mod." That's the entire ceremony.
- **Funnel stage:** Retention -> off-trial promotion
- **Implementation sketch:** Lead Scoreboard card: "30-day anniversaries this week: [list]." Each entry shows: mod name, action count, AI agreement rate, any overturned bans. Lead sends a one-click pre-filled ModChat message. If the mod is on trial tier (item 7), this card doubles as the promotion trigger.
- **Effort:** S (Scoreboard card + pre-filled message; depends on V11 #12)
- **Risk:** Lo
- **Dependency:** V11 #12 (Lead Scoreboard), trial tier (item 7).
- **Success metric:** % of mods still active at day 45. If the day-30 touchpoint works, this should be 80%+.
- **Stretch ambition:** The mod receives a private ModChat notification on their 30-day anniversary regardless of whether the lead sends the manual message: "30 days with the team. N actions on record." No fanfare. Just acknowledgment.

---

### 28. Feedback Loop: Mod-to-Lead Feature Suggestions

- **Why through adoption lens:** Engaged mods who feel their input shapes the tool are retained mods. The proposals system (V11 existing) is heavyweight and was described as "underused." A lighter-weight "I have an idea" path -- not a full proposal, just a quick text field in the popup -- gives mods a channel to contribute without the overhead of a formal proposal. The lead reviews weekly. Good ideas get promoted to proposals. The mod who submitted gets a "we're looking at this" reply in ModChat.
- **Funnel stage:** Retention (engagement and agency)
- **Implementation sketch:** Popup Tools tab: small "Feedback" section (collapsed by default). Text area: "Something annoying? Something missing?" Submit sends to a `mod_feedback` worker endpoint, stores in a small D1 table. Lead sees a "Feedback" card in the Scoreboard with unread count. Lead can reply via ModChat DM or promote to a proposal. No voting, no public display.
- **Effort:** S
- **Risk:** Lo (noise risk mitigated by keeping it private/lead-only)
- **Dependency:** Lead Scoreboard (V11 #12) for the review surface.
- **Success metric:** % of mods who submit at least one piece of feedback within their first 60 days. Target: 50%+. % of feedback items that result in a shipped change within 90 days (signal of responsiveness).
- **Stretch ambition:** Monthly "feedback digest" to all mods: "This month: 7 suggestions received, 2 shipped, 3 in backlog, 2 declined (with reason)." Closes the loop publicly.

---

### 29. Onboarding Quality Score (Track It)

- **Why through adoption lens:** The current composite score is 5.8/10 based on a manual audit. This is not a live metric. v11 should instrument the onboarding funnel so the score is computable from actual data, not auditor judgment. The metrics are: % completing claim within 10 min, time to first auth, time to first action, % encountering Brave failure, % needing lead assistance. These are derivable from the audit log + local storage telemetry already proposed in other items.
- **Funnel stage:** Measurement (enables all other funnel work)
- **Implementation sketch:** Worker dashboard endpoint `/admin/onboarding/funnel` returns: N mods invited last 30d / N claimed / N first-action-taken / median-time-to-first-action / N Brave-failure-detected. Lead Scoreboard (V11 #12) shows this as a "Onboarding Funnel" card. Updates daily.
- **Effort:** S-M (the data is mostly already in the audit log; the query is the work)
- **Risk:** Lo
- **Dependency:** V11 #12, items 5 (first-action telemetry) and 2 (Brave detection).
- **Success metric:** The score itself becomes trackable. Target: 8/10 composite by end of v11 rollout (from 5.8/10 today).
- **Stretch ambition:** Automated alert to lead when onboarding funnel drops below a threshold: "Warning: 3 mods invited in the last 7 days, 0 have taken a first action. Check onboarding."

---

### 30. v11 Target: 8.5/10 Onboarding Composite

- **Why through adoption lens:** UAT_ONBOARDING estimates that fixing the top 5 failure modes (INSTALL rewrite + Brave detect + tab default + invite-backup + collision guard) lifts the composite to ~8/10 with "~3 hours of focused work." V11 adds the wizard, the demo mode, the first-action acknowledgment, the trial tier, and the telemetry. The realistic v11 target is 8.5/10 composite. The remaining 1.5 points is CWS submission (removes sideload friction) + Brave/Linux live-test (removes the platform uncertainty). These are not blocked by code -- they require a real test session on a Brave/Linux box.
- **Funnel stage:** Measurement anchor
- **Implementation sketch:** This is the score contract for v11. Cat 5 (Metrics) owns the measurement methodology. Cat 6 proposes that the score is computed from: (a) discoverability of next step, (b) error clarity, (c) time-to-authenticated, (d) platform compatibility, (e) time-to-first-action (new dimension). Each dimension 0-10, equal weight. Score is auditable from actual telemetry, not just auditor judgment (per item 29).
- **Effort:** S (scoring framework is definitional; the work is in the other items)
- **Risk:** Lo
- **Dependency:** All activation-stage items above.
- **Success metric:** Composite score 8.5/10 by v11.2 ship date, measured from telemetry not audit.
- **Stretch ambition:** 9/10 by v12, gated on CWS publication and confirmed Brave/Linux smoke test.

---

## B. WHAT V11_PLAN MISSED (in adoption lens)

V11_PLAN is feature-complete and correctly prioritized for the mod-in-the-seat problem. It does not address the lifecycle gaps that determine whether the seat is occupied in the first place.

**1. No off-boarding surface.** Token revoke is the only lifecycle event. A mod who leaves has no acknowledgment, no contribution record surfaced to them, and no referral path. This is the end of the referral loop: a mod who exits without a human moment is a mod who does not recruit the next candidate.

**2. No lapsed-mod detection or reactivation path.** V11 assumes mods are either active or gone. The space between -- "I haven't moderated in three weeks but I haven't quit" -- is where most volunteer attrition happens and where a low-cost intervention (a lead ping, a welcome-back digest) is most effective. V11 has no surface for this.

**3. No acquisition path from the community.** The mod team grows only via catsfive's personal network. The community itself -- the high-karma posters, the daily contributors -- has no way to express interest in moderating. This is a structural ceiling on team growth at a scale that matters (30+ mods, if the forum grows).

**4. No measurement of the onboarding funnel.** V11 ships many activation improvements but has no instrumented funnel to know whether they worked. Without time-to-first-action telemetry, the composite score remains a manual audit number. The improvements cannot be validated or iterated.

**5. CWS submission is a precondition for scale, not a nice-to-have.** V11_PLAN does not list CWS completion as a dependency for any wave. Through the adoption lens, it IS a dependency for any wave that adds new mods: every mod onboarded via "Load unpacked" is a mod who cleared a non-trivial technical barrier that will filter out good candidates.

---

## C. ADOPTION BETS (structural calls for v11)

**Bet 1: Ship the self-service onboarding bundle as a single Wave 1 unit.** Wizard banner + Brave detect + tab default + INSTALL rewrite + invite-backup + collision guard. These six items are individually small but collectively define whether a fresh mod can onboard without the lead. Ship them together or they are half-measures.

**Bet 2: Introduce the trial-mod tier formally in v11.** Shadow Mode (V11 #26) is currently classified as Wave 4 (first-to-cut on slip). Promote it to Wave 2. Without the trial tier, every new mod is a full mod from day one, which means the lead has no structured accountability surface and no mechanism to catch bad early decisions before they become bad habits.

**Bet 3: The shift digest is a retention mechanism, not just a handoff tool.** Design it from the start with two triggers: end-of-shift AND return-from-absence (>4h gap). The return-from-absence trigger is the reactivation mechanism for lapsed mods. Adding it costs one conditional in the trigger logic.

**Bet 4: Measure the funnel from day 1 of v11.** Instrument `first_auth_ts`, `first_action_ts`, `brave_failure_detected`, and `right_click_discovered` as audit-log metadata before Wave 1 ships. Without baseline telemetry from Wave 1, Wave 2 adoption improvements are unvalidatable.

**Bet 5: CWS submission is a precondition for mod-team scaling past 20 mods.** The sideload process filters out too many otherwise-qualified candidates. Complete the CWS submission alongside Wave 1, not after v11 is "done."

---

## D. RISKS (top 5)

**1. Gamification creep.** The trial tier with criteria, the personal stats card with sparklines, the kudos system, the milestones -- each individually respects the Bloomberg aesthetic. Collectively they can drift toward Discord-bot territory if any single item tips toward "score chasing." Mitigation: no public rankings, no badges visible to the mod themselves (only the lead sees kudos totals), no competitive framing in any copy. The test: would a Bloomberg terminal show this? If not, redesign.

**2. Lead-bandwidth strain at scale.** The lapsed-mod ping, the 30-day check, the application review, the off-boarding moment -- these all require lead attention. At 15 mods this is manageable. At 30+ the lead is doing more administrative work than moderating. Mitigation: the mentor structure (item 14) distributes the mentoring load. The application review and 30-day promotion should be batched weekly (not real-time) so they occupy one scheduled hour, not scattered interruptions.

**3. Trial-mod filter effect.** If the trial criteria are perceived as burdensome (30 days, Shadow Mode on everything), good candidates may decline to join or drop out early. Mitigation: make Shadow Mode visible to the trial mod as a learning tool, not a surveillance mechanism. The framing matters: "for your first 30 days, senior mods can see your decisions and offer coaching" not "for your first 30 days, your decisions are reviewed before they execute."

**4. Demo mode mismatch.** If the synthetic demo data does not reflect the real forum content (tone, volume, type of moderation decision), new mods will feel surprised by the real tool. Mitigation: demo fixtures are curated from real anonymized past cases, not generic placeholder content. Cat 3 owns the visual rendering; Cat 6's ask is that the content is authentic.

**5. Community recruitment noise.** Opening a "mod application" path from the forum community will generate low-quality applications and potentially hostile applications from users who have been banned. Mitigation: karma + account-age threshold enforced server-side before the application is even stored. Lead never sees the noise. The threshold should be conservative (high karma, long account age) until calibrated.

---

## E. CTO SYNTHESIS NOTES

The adoption gap in v11 is not a feature gap -- it is a lifecycle gap. The features are strong. The onboarding wizard, Brave rescue, INSTALL rewrite, and trial tier together would lift the composite from 5.8 to 8.5/10. But these items are currently scattered across Wave 1, Wave 2, and Wave 4 in the V11_PLAN, with Shadow Mode (the trial-tier engine) in the first-to-cut wave.

The structural call for Opus/CTO: the self-service onboarding bundle is a coherent unit that should ship atomically in Wave 1. Not as separate tickets distributed across waves. The adoption funnel is only as strong as its weakest step, and the weakest step is currently Step 1: the fresh mod who opens a popup full of dashes and sees no next action.

The measurement infrastructure (item 29) should ship with Wave 1, not after. Without telemetry, v11's adoption improvements are faith-based.

The CWS submission is a dependency for scale, not a deliverable for after scale. Submit it now.

The one thing this brainstorm would cut: demo mode (item 6) is the lowest adoption leverage of the 30 items relative to its M-effort cost. If Wave 1 slips, cut demo mode first. The wizard + Brave rescue + tab default + INSTALL rewrite accomplish 85% of the activation improvement at 20% of the effort. Demo mode is the marginal 15%.

The one thing this brainstorm would elevate: the shift digest's return-from-absence trigger (item 8) is a single-conditional addition to V11 #11 that converts a handoff tool into a reactivation mechanism. It costs nothing extra to build if V11 #11 is already shipping. It should be treated as part of V11 #11, not a separate item.

Word count: ~4,100
