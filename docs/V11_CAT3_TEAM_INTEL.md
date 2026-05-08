# V11 — CAT 3 — Team Coordination & Intelligence

**Brainstorm role:** Mod-team-centric. v11 should turn 15 mods into one nervous system.
**Anchor stack (v9.17):** ModChat, modmail, ban hammer, death row, triage, audit Merkle chain, presence ping, Intel Drawer, precedents table, draft handoff scaffold (`/drafts/handoff`), proposals (`/proposals/*`), autoDeathRowRules team-sync.

The team already has tendons. v11 wires the muscle.

---

## A) Per-dimension state, gap, proposal, effort

### 1. Real-time presence
- **Have:** `/presence/ping` (60-90s TTL, page category) + `/presence/online` (lead). `/presence/viewing` per Intel Drawer subject (10-min TTL, collision warn).
- **Gap:** Page category is coarse ("queue"); no idle/active distinction; nothing surfaces *what* a mod is acting on; no live cursor on shared queue rows.
- **v11 proposals:**
  - **F1 Presence Bar (S)** — top-of-screen avatar strip showing all 15 mods with status dot (active <2m / idle <10m / offline). Hover = page category + last action verb. Click = ping them in chat.
  - **F2 Live Queue Cursors (M)** — when two mods open the same queue/death-row item, show small avatar pill on the row + "X is reviewing." Reuses `/presence/viewing` table by extending kind to `QueueItem` (already supported in `_drawerRenderPrecedents`).
  - **F3 "What I'm doing" verb (S)** — extend ping payload with `{verb:'banning'|'reviewing'|'drafting'|'reading'}` derived client-side. Surfaces in F1.

### 2. Workload distribution
- **Have:** Audit log per mod (`actions.author`). No aggregation.
- **Gap:** No one — including the mod themselves — sees their own throughput. Lead has zero ability to spot burnout or freeloading.
- **v11 proposals:**
  - **F4 Personal Stats Card (S)** — popup card: "Today / Week / 30d — bans, removes, warns, modmail, queue clears" with sparkline. Pulls from `appendAuditAction` already-indexed table.
  - **F5 Lead Heatmap (M)** — `/admin/team/load` aggregates last-7d action counts per mod into a heatmap. Spot the 80/20 (we know we have it). Triggers F11 (auto-rebalance).

### 3. Handoff continuity
- **Have:** `/drafts/handoff` with `handoff_note`. Used only for in-progress ban drafts.
- **Gap:** No end-of-shift digest. Next mod boots into a void and re-discovers the active heat.
- **v11 proposals:**
  - **F6 Shift Digest (M)** — when a mod's idle timer hits 30m or they explicitly `/offshift`, an AI-generated digest (Claude via existing `/ai/*`) lands in modmail-team-thread: "Active drafts: 2. Heating up: thread #abc (5 mod-actions/hr). Open proposals awaiting vote: 3. Watchlist hits last shift: 4 users." Next mod opens panel, sees pinned digest at top.
  - **F7 Drawer Bookmark Pass (S)** — "Pass to next" button on Intel Drawer pins subject + 1-line note to a team `passed_to_next_shift` queue. New mods see "5 things passed to you" badge on launch.

### 4. Incident response
- **Have:** Discord webhook on proposals (lead-channel ping). Manual `@@all` shouting in chat. Incident runbook is a doc, not surfaced in tool.
- **Gap:** No formal "we are under attack" mode. No co-location of evidence. No auto-elevation of suspect signal-to-noise.
- **v11 proposals (see §C):**
  - **F8 Incident Mode toggle (M)** — any mod can `/incident <name>`. Backed by new `mod_incidents` D1 table (matches BACKLOG CHAT-4). UI flips to incident skin (red top-bar, evidence pinboard, all bans tagged with incident_id, all chat scoped to incident sub-channel).
  - **F9 Auto-Brigade Detector (L)** — worker-side: rolling 5m window of new-account ban velocity + IP cluster fingerprint + reply-graph cluster. When threshold trips, auto-`/incident brigade-YYYYMMDD-HHMM` AND fire chime + browser notification to all mods.

### 5. Decision precedent
- **Have:** `precedents` table + `/precedent/find` keyed by kind+signature (User / Thread / Post / QueueItem). Drawer shows top 5. Ban-draft can cite count.
- **Gap:** Find is exact-signature only. Pattern-level lookup ("show me the last 10 'lock thread' decisions on conspiracy threads") doesn't exist. No "what did *catsfive* decide on similar"-by-mod facet.
- **v11 proposals (see §D):**
  - **F10 Precedent Engine (M)** — `/precedent/search` with full-text on `title+rule_ref+reason` (FTS5; firehose already proves the pattern), filters: by-mod, by-rule, by-action, by-time. Surfaces in drawer Section 6 + standalone `/precedent` slash command.

### 6. Performance feedback
- **Have:** Audit log. Stats popup hints (P2-1, P2-2 in BACKLOG).
- **Gap:** Mods can't self-evaluate. Lead can't reward.
- **v11 proposals (see §B):**
  - **F11 Scoreboard (M)** — see §B. 8 KPIs, lead-only at first; opt-in personal view for rank-and-file.

### 7. Training & onboarding
- **Have:** Token onboarding modal. README. Nothing about *judgment*.
- **Gap:** New mod has no scaffold for "what's a borderline call vs a clear ban."
- **v11 proposals (see §E):**
  - **F12 Coaching Loop (M)** — see §E. Drawer surfaces "veteran calls on similar" + AI-narrated rationale.
  - **F13 Shadow Mode (S)** — toggle "Trainee mode": every action shows `[Suggested action: ban 7d, based on 12 precedents — confirm?]` with mandatory veteran review queue for first 30 days. Reuses proposals table.

### 8. Cross-mod review
- **Have:** Proposals system (`/proposals/create` → vote → finalize). Underused.
- **Gap:** Proposals are heavyweight; no lightweight "second eyes?" ping.
- **v11 proposals:**
  - **F14 Two-Click Second Opinion (S)** — Drawer button "👀 Second Opinion" → posts `mod_review_request` to chat scoped to currently-online mods, includes drawer state snapshot. First responder claims it; original mod sees "✓ propertyofUniverse reviewing."
  - **F15 Borderline Auto-Park (S)** — when AI ban suggester confidence is 40-65% (the gray zone), action auto-parks for senior review instead of executing. Reuses Park table.

### 9. Banned-user lifecycle
- **Have:** Ban + Death Row + audit. No appeals path. No repeat-offender flag.
- **Gap:** Unbans are GAW-side (manual). Repeat offenders are rediscovered every time.
- **v11 proposals:**
  - **F16 Appeal Inbox (M)** — modmail message tagged `kind:appeal` auto-routes to dedicated tab; resolution captured as `appeal_outcome` on the original ban audit row. Closes feedback loop.
  - **F17 Repeat-Offender Halo (S)** — Intel Drawer shows red halo + count if subject username (or any matching alt-pattern from autoDeathRowRules) has ≥2 prior actions. Click expands to history.

### 10. Pattern intelligence
- **Have:** `autoDeathRowRules` (15+ team-shared patterns). Static.
- **Gap:** No emergence detection. Patterns are added by hand after pain.
- **v11 proposals:**
  - **F18 Pattern Discovery (L)** — nightly worker job clusters last-72h banned-user usernames (Levenshtein + character n-grams), flags clusters of ≥3 with similar style, posts to `#pattern-proposals` chat thread for lead approval → one-click adopts as autoDeathRowRule.
  - **F19 Brigade Reply-Graph (M)** — when ≥4 users reply to the same thread within 10m AND share NO prior thread overlap with the OP, flag the thread + suggest lock. Reuses firehose.

---

## B) The Scoreboard — 8 lead KPIs

Lead-only dashboard, refreshes every 5m. SQL-backed, all derivable from `actions` + `presence`.

| # | KPI | Why it matters | Source |
|---|---|---|---|
| 1 | **Active mods now / total** (e.g. 6/15) | Coverage baseline | `/presence/online` |
| 2 | **Queue clear-rate (last 24h)** items processed / items arrived | Are we keeping up? | actions where action='queue.process' / firehose ingest count |
| 3 | **Median action latency** (queue arrival → action) | Speed of response | actions.ts - firehose.first_seen |
| 4 | **Top 3 / Bottom 3 mods by 7d action count** | Workload imbalance + freeloader detection | actions GROUP BY author |
| 5 | **AI agreement rate** (mod accepts AI suggestion / total suggestions) | AI calibration | ai_suggestions + actions |
| 6 | **Unban / appeal rate** (overturned bans / total bans, 30d) | Are we banning too aggressively? | F16 appeal_outcome |
| 7 | **Precedent citation rate** (bans with precedent_count>0 / total bans) | Consistency | actions.precedent_count |
| 8 | **Open incidents / open proposals / parked items** | Backlog of unfinished work | mod_incidents + proposals + parked |

Each tile click = drill into the underlying rows. Each KPI also surfaces as a tiny sparkline next to the lead's chat avatar.

---

## C) Incident Mode

**Trigger:** any mod runs `/incident <slug>` in chat, OR auto-trigger from F9 (brigade detector).

**Auto-actions on incident creation:**
1. Insert into `mod_incidents` (id, slug, opened_by, opened_at, status='open').
2. Create chat sub-channel `#inc-<slug>`, auto-subscribe all online mods.
3. Pin a top-bar red banner: "🚨 INCIDENT: brigade-2026-05-08-1430 — 12 actions logged · @propertyofUniverse opened · 3 mods active."
4. All bans/removes/warns done while incident is open auto-tag `incident_id`. Audit row carries the tag.
5. Evidence Pinboard side-panel opens — drag-drop posts/users/screenshots/chat-message-quotes pin to it. Survives session.
6. AI triage primed: every `/triage <url>` in incident chat auto-includes incident context.
7. **Auto-elevate:** AI ban-suggest threshold drops from 65% → 50% confidence (faster execution under fire).
8. **Auto-throttle:** raise per-mod action rate-limit ceiling 2x for duration of incident.

**On incident close:** AI generates postmortem (actions taken / mods involved / patterns identified / suggested new autoDeathRowRules) → lands in `docs/postmortems/<slug>.md` + posted to chat.

**In the bar:** red pulse on chat icon. Click = jump to incident channel. Even mods who weren't online at trigger see "🚨 1 incident closed since you logged off — read postmortem."

---

## D) Precedent Engine

Three lookup paths, all hitting the same `/precedent/search` endpoint:

1. **By subject (current):** open Intel Drawer → Section 6 already shows top 5 by signature.
2. **By pattern:** chat slash command `/precedent rule:R5 last:30d` → returns table of all R5 actions with mod, target, action, reason. Backs the new mod's "what does R5 actually mean in practice" question.
3. **By prose:** chat input `/precedent find "doxx threats"` → FTS5 on title+reason+rule_ref. Cites top 5 with permalinks.

**Drawer integration:** when AI ban-suggest fires, server already injects `precedent_count` (v8.0 chunk 9). v11 extends that with **top-3 example summaries** (anonymized: rule_ref + action + days_ago — never authored_by). The mod sees: "12 prior R5 cases — last 3: 7d ban (3d ago), warn (8d ago), 30d ban (12d ago)."

**Schema add:** none. `precedents` already has `kind, signature, title, rule_ref, action, reason, source_ref, authored_by, marked_at`. Add an FTS5 virtual table mirroring `title+reason+rule_ref` (CHAT-1 / firehose pattern proves the recipe).

---

## E) Coaching Loop

A new mod ramps without a 1:1 by being **shown** the team's judgment, in context, every time they hover a borderline action.

**Mechanism:**
1. **F13 Shadow Mode** (auto-on for first 30 days, opt-out for veterans):
   - Every Ban / Remove / Warn click intercepts → shows AI-generated suggestion ("12 precedents say 7d ban; closest case `2026-04-15 propertyofUniverse R5 7d` reasoning: <quoted reason>"). Trainee accepts / overrides / asks for second opinion.
2. **Drawer Section 6 always-on:** veteran rationale visible by default for trainees. Veterans can collapse.
3. **Daily 5-min "Precedent of the Day"** auto-posted to chat: a notable resolved case (rule_ref + 1-paragraph AI synopsis + link to drawer view). Trainees auto-tagged; reactions = "got it."
4. **Trainee scoreboard:** mirrors lead scoreboard but personal. KPIs: AI agreement %, precedent-cited %, second-opinion-asked count, overturned actions count. Veteran lead reviews weekly with one-click "promote to full mod."
5. **Coaching tickets:** any mod can `/coach @newmod re: <action_id>` → DM-style chat thread linking the action + drawer state, captured for trainee's review log.

---

## F) Top 10 highest-impact team-intel features for v11

Ranked by (mod-team-leverage × likelihood-of-actually-shipping-given-foundations).

| Rank | ID | Feature | Effort | Why first |
|---|---|---|---|---|
| 1 | **F1** | Presence Bar | S | Every other coordination feature reads from this. Foundation. |
| 2 | **F8** | Incident Mode | M | Highest pain reduction during attacks. Backlog already plans CHAT-4. |
| 3 | **F10** | Precedent Engine search | M | Unlocks consistency + coaching simultaneously. FTS5 recipe proven. |
| 4 | **F4** | Personal Stats Card | S | Cheapest motivation lever; mods see themselves. |
| 5 | **F11** | Lead Scoreboard | M | Lead can finally manage. Drives F5/F6 prioritization. |
| 6 | **F6** | AI Shift Digest | M | Closes the handoff void. Reuses Claude path. |
| 7 | **F14** | Two-Click Second Opinion | S | Lightweight ⇒ actually used (proposals are not). |
| 8 | **F13** | Shadow Mode for trainees | S | Coaching loop ignition; reuses proposals + precedent. |
| 9 | **F9** | Auto-Brigade Detector | L | Worker-side, but force-multiplies F8. |
| 10 | **F17** | Repeat-Offender Halo | S | Cheapest ban-quality win; 30-LOC drawer change. |

**Rationale on ordering:** F1 unblocks F8/F11/F14 (presence-aware UI). F10+F4+F11 close the data loops the team is currently flying blind on. F6 is the single highest-perceived-value item from any prior shift hand-off conversation. F9 is the only L; it earns its slot because brigades are the #1 unhandled stress event.

---

**Cross-references:** BACKLOG CHAT-4/5/8/10 and TARD-1/2/7 are subsumed or extended by F8/F10/F18. PRoposal/draft tables already exist; F8/F14/F15 reuse them. Merkle chain auto-extends to incident-tagged rows (no schema break).

**Sizing rollup:** 4 × S, 5 × M, 1 × L = roughly 3-4 weeks lead-engineer or 1 week with parallel agents on the S tier.
