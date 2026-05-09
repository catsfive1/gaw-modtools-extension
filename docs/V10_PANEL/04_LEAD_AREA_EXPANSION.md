# Panel Reorg 4 -- Lead Area Expansion

**Author:** Panel Reorg Agent 4 (Lead UX)
**Date:** 2026-05-09
**Inputs:** popup.html #leadSection, V11_R2_CAT5_METRICS.md, V11_R2_CAT6_ADOPTION.md, V11_PLAN.md #4/#12/#30

---

## A. CURRENT (sparse) vs PROPOSED (data-rich)

### Current state -- what the lead sees today

```
[Lead Mod Token ____________] [Save]
  [Generate invite link]
  [Mod rotation roster]

  Team settings
    Flag expiry (days) [__] [Save]

  Bug reports
    [Open bug reports] [badge]
    Who can read? [______] [Save]

  Maintenance (lead)
    [Audit chain verify]
    [Full health report]
    [Roster staleness audit]
    [Migration debt scanner]

  Autonomous maintenance (Llama)
    Auto-run weekly [enabled v] [Save]
    [Maintenance reports (14d)] [all severities v] [Run now]
```

The panel has two modes: token input (always visible) and lead tools (gated). The tools are a flat vertical stack of 8+ buttons with no grouping by urgency, no live data, and no anticipation of what the lead actually needs at the moment they open the popup. Every action requires a click to discover whether there is anything to act on.

### Proposed state -- Bloomberg-style, data-first

```
[KPI ROW]  12 active  |  94% clear  |  p50 3.2m  |  2 incidents
[ACTION ROW]  [+ Invite]  [Rotate all]  [Bugs 3]  [Chat]
[LAPSED MODS card]   [30-DAY card]
[ONBOARDING FUNNEL card]
[AUDIT / MOD PROFILE link]
[-- Settings (collapsed) --]
```

The lead opens the popup and immediately reads the team's state from a 4-tile KPI row. The two most time-sensitive cards (lapsed mods, 30-day anniversaries) are surfaced below without a click. Quick-actions are a single horizontal row above the cards. Everything else collapses.

---

## B. 4-TILE KPI DASHBOARD AT TOP

One tight row. Bloomberg amber on black. Monospace digits. Each tile is clickable to drill.

### Wire layout

```
+------------+------------+------------+------------+
| ACTIVE NOW |  CLR-RATE  |  MM p50    |  INCIDENTS |
|     12     |   94%/24h  |   3.2 min  |     2 open |
|  ___..---  |  ___.----  |  ---.___   |  ..        |
+------------+------------+------------+------------+
```

Sparkline below the number is 7 data points (7d), 12px tall, SVG drawn inline. Amber (#f0a040) on panel background (#11131a). No axis labels -- the number IS the label.

---

### Tile 1 -- Active Mods Now

```
ACTIVE NOW
    12
 [sparkline: 7d daily peak]
```

**Data source:** `/presence/online` -- already exists, returns `{mods: [...]}`. Count of mods with a presence ping in the last 5 minutes. 7d history from Analytics Engine `event=mod.presence_peak_daily`.

**Hover tooltip:** Full list of currently online mods with page-verb ("catsfive on /queue", "Brent75 on /modmail"). This is the Presence Bar (V11 #8) data -- same endpoint, secondary surface.

**Click drills to:** Live presence view -- who is where. Same data as the Presence Bar but rendered as a popup panel.

**Alert threshold:** Amber when active < 2 during known peak hours (detectable from 30d historical pattern stored in KV). Red when active = 0.

---

### Tile 2 -- Queue Clear-Rate 24h

```
CLR-RATE
  94%/24h
 [sparkline: 7d daily rate]
```

**Data source:** D1 `actions` table vs firehose `gaw_ingest_audit`. Ratio: actions taken / items arrived, rolling 24h window. Cat 5 metric #14. Worker endpoint `/metrics/queue-pressure` (new, S-effort, reads existing tables).

**Hover tooltip:** Breakdown -- "Arrivals: 213 / Actioned: 200 / Unactioned: 13 items (oldest: 4.2h)". 7-day sparkline with amber band at 80%.

**Click drills to:** Queue pressure detail -- hourly bar chart of arrivals vs. actions, list of oldest unactioned items.

**Alert threshold:** Amber < 80%. Red < 60% or any item > 6h old.

---

### Tile 3 -- Modmail Median Latency

```
  MM p50
  3.2 min
 [sparkline: 7d daily p50]
```

**Data source:** Cat 5 metric #5. D1 query on `modmail_threads.first_seen_at` vs `mod_modmail_responses.sent_at` where `is_first_reply=1`. Endpoint `/metrics/modmail-sla` (new, S-effort).

**Hover tooltip:** "p50: 3.2m / p90: 18m / p99: 47m -- 7d trend: improving". SLA breach bands: p90 > 4h is the Cat 5 alert threshold.

**Click drills to:** SLA breakdown by sender category (ban_appeal, spam_report, general_question). Shows which category is slow.

**Alert threshold:** Amber when p90 > 2h. Red when p90 > 4h. Sparkline turns red on an up-trend of 3+ consecutive days.

---

### Tile 4 -- Open Incidents

```
INCIDENTS
  2 open
 [sparkline: 7d incident count]
```

**Data source:** D1 `mod_incidents` table, `closed_at IS NULL`. Count. V11 Wave 4 F8 dependency -- until Incident Mode ships, this tile shows 0 with "coming v11.3" subtext rather than hiding.

**Hover tooltip:** "Brigade Alpha (2h 14m open, 3 mods active) / Spam wave (48m open, 1 mod)". Each incident name is a link to the Incident Mode panel.

**Click drills to:** Incident list ordered by age. One-click join.

**Alert threshold:** Any open incident turns the tile border amber. More than 1 incident simultaneously: red border.

---

## C. LAPSED MODS + 30-DAY ANNIVERSARIES CARDS

### Lapsed Mods Card

Source: Cat 6 #11, Cat 6 #25. Definition: >21 days since last action.

```
+------------------------------------------+
| LAPSED  (3)                    [Ping all] |
+------------------------------------------+
| Brent75          29d   [Ping]  [Revoke]  |
| PresidentialSeal 35d   [Ping]  [Revoke]  |
| propertyOfUni... 22d   [Ping]  [Revoke]  |
+------------------------------------------+
| [Adjust threshold: 21d]                  |
+------------------------------------------+
```

**Data source:** Worker query on D1 `actions GROUP BY author, MAX(ts)`. Endpoint `/admin/mod/lapsed?days=21`. Already structurally feasible -- the `actions` table has this indexed. S-effort.

**Ping action:** Pre-fills a ModChat DM to the mod. Lead edits and sends. Text: "Hey [mod] -- haven't seen you in [N] days. Still want to be on the team? No pressure either way." One click opens the DM pre-filled; lead sends or dismisses. Does NOT auto-send -- human signal per Cat 6 design intent.

**Ping all:** Opens a batch-compose view with all lapsed mods in BCC-style list. One send for the whole cohort.

**Revoke:** Leads to the token revoke flow with the departure record moment (Cat 6 #12): shows lifetime actions + days active before confirming, with pre-filled "thank you" message.

**Threshold control:** Small inline input at bottom -- lead can dial the lapse threshold (default 21d, configurable 7-60d). Saves to team settings. Not a buried Settings menu; it's contextual to the card.

---

### 30-Day Anniversaries Card

Source: Cat 6 #27. Mods hitting their 30-day mark this week (rolling 7d window).

```
+------------------------------------------+
| 30-DAY ANNIVERSARIES this week  (2)      |
+------------------------------------------+
| ModerateSword   30d  91 actions  [Promote]|
| GoldenEagle456  33d  54 actions  [Check] |
+------------------------------------------+
```

**Data source:** D1 `mod_tokens.created_at` -- mods whose token age crosses 30d within the current calendar week. Joined with `actions` aggregate for action count.

**Promote button:** Appears when trial tier is active (V11 Wave 4, `mod_tokens.tier='trial'`). One-click promotes to full mod -- updates tier, disables Shadow Mode. Shows a pre-filled ModChat: "[mod] -- 30 days. [N] actions. Welcome to the full team."

**Check button:** Shown when the mod has < 40 actions (under-engaged). Click opens their Mod Audit View (section D).

**Card hides:** When zero mods in the window. No empty state -- just absent. Reduces noise.

---

## D. MOD AUDIT VIEW LINK (modal trigger)

Source: V11_PLAN #4 -- "Mod Audit View (/admin/audit/mod-profile) + AI summary". Currently exists as a planned endpoint but no popup surface.

```
+------------------------------------------+
| MOD AUDIT                                |
| [Audit a mod: select...          v] [Go] |
+------------------------------------------+
```

**Component:** Single `<select>` populated from `/admin/mod/list`. Dropdown lists every active mod by username. Select + Go opens the Mod Audit View in a full-popup drill drawer (same `#pop-drill` mechanism that stat tiles use, just wider).

**Mod Audit View contents (drill drawer):**

```
+-- Mod Profile: Brent75 ---------------[X]--+
| Actions 7d: 47  |  30d: 183  |  Total: 841 |
| AI acceptance: 68%  |  Citations: 41%       |
| Ban overturn: 0 (30d)  |  Fatigue: normal   |
|                                             |
| [Action histogram: 7d bar chart]           |
| [Top rules cited: R3 (22), R5 (18), R9 (4)]|
|                                             |
| AI SUMMARY                                  |
| "Brent75 is a high-volume, citation-aware   |
| mod with above-average acceptance rate.     |
| No overturn risk signals in 30d. Workload   |
| peaked Tuesday--Thursday. Consider for      |
| mentor assignment."                         |
|                                             |
| [Ping in chat]  [Issue rotation]  [Revoke] |
+---------------------------------------------+
```

**Data source:** `/admin/audit/mod-profile?mod=Brent75` -- reads D1 `actions` table aggregates. AI summary from existing Llama path (same worker, new prompt variant). Claude Cat 5 metric #4 (Mod Audit View) is the exact specification for this endpoint.

**Histograms:** 7d action bars, 12px height, rendered as inline SVG. Same sparkline component as KPI tiles, just horizontal bars instead.

**Why not a tab:** The drill drawer is already built. Opening a new tab breaks popup context. Drawer stays in popup, closes on Esc. Consistent with how `#pop-drill` works today for stat drilldowns.

---

## E. ONBOARDING FUNNEL CARD

Source: Cat 6 #22, #29. Shows where the current cohort of new mods is stuck.

```
+------------------------------------------+
| ONBOARDING FUNNEL (last 30d)             |
+------------------------------------------+
| Invited:   8                             |
| Claimed:   6  (75%)                      |
| First auth: 5  (63%)                     |
| First action: 4  (50%)   <-- flag        |
+------------------------------------------+
| 1 mod stuck at [first auth] for 3 days   |
| [Ping: PresidentialSeal]                 |
+------------------------------------------+
```

**Data source:** Worker endpoint `/admin/onboarding/funnel` (Cat 6 #29). Reads:
- Invited: `mod_tokens` rows created in the last 30d
- Claimed: tokens with `token IS NOT NULL`
- First auth: tokens where `first_action_ts IS NOT NULL`
- First action: `actions GROUP BY author` with `min(ts)` in window

**Flag logic:** Any stage drop-off > 25% turns that row amber. The "stuck at" callout appears for any mod who has been at a stage for > 48h without advancing. Shows mod name + "Ping" button (pre-fills ModChat DM).

**Card is lead-only.** Mods do not see the funnel.

**Refresh:** On popup open. Not real-time -- S3-bucket-style, worker computes and caches in KV for 15 minutes.

---

## F. QUICK-ACTIONS ROW

One horizontal strip immediately below the KPI tiles, above the cards. Four buttons. No labels -- icons with tooltips only (Bloomberg style: if you need a label you don't belong at the terminal).

```
[ + Invite ]  [ Rotate all ]  [ Bugs (3) ]  [ Chat ]
```

**Invite:** Generates an invite link immediately (calls existing `/admin/invite/generate`), copies URL to clipboard, shows a 3s snack "Link copied." Zero intermediate steps. Current flow requires: scroll to Lead Token area -> click Generate invite link -> read the result -> manually copy. This is the Cat 6 #4 elimination of lead friction.

**Rotate all:** Issues rotation invites for all mods past their rotation window (same as `rotateRosterBtn` but fires immediately with one confirmation dialog instead of opening a panel). Pre-fills DM to each mod with their personal invite link. Batch.

**Bugs (N):** Opens the bug reports panel inline (same `bugListPanel` but now triggered from quick-actions). The badge count `N` matches `bugListBadge`. If N = 0, button is dimmed. Lead sees the number before clicking -- no surprise.

**Chat:** Opens ModChat in a slide-in, not a new tab. (Dependency: ModChat must be embeddable, which is a separate call. Until then, this opens a GAW chat URL in a new tab. Acceptable interim.)

---

## G. COLLAPSE-UNNECESSARY (Settings card at bottom)

The current Lead section has two items that are used infrequently and currently presented at the same visual weight as urgent operational tools:

1. **Team settings** (flag expiry TTL, bug visibility config)
2. **Autonomous maintenance** (toggle + severity filter + run-now)

Both collapse into a single `<details>` element pinned to the bottom of the lead section. Closed by default. Same pattern as the existing "System diagnostics (advanced)" accordion in the mod-tier Maintenance section.

```
<details>
  <summary>Settings & Maintenance</summary>
  [Flag expiry TTL]
  [Bug visibility]
  [Autonomous maintenance toggle]
  [Maintenance reports 14d]
  [Run now]
  [Audit chain verify]
  [Full health report]
  [Roster staleness audit]
  [Migration debt scanner]
</details>
```

This is a pure reorganization -- no handler changes. The existing IDs (`flagTtlInput`, `maintAutoToggle`, etc.) stay. The `<details>` wrapper adds zero JS. Lead has to click once to expand; they do this occasionally, not every popup open.

**What stays outside the accordion permanently:**
- Lead Mod Token field (always-visible, authentication critical)
- KPI tile row (always-visible, operational)
- Quick-actions row (always-visible, operational)
- Lapsed mods card (always-visible when populated)
- 30-day anniversaries card (always-visible when populated)
- Mod Audit dropdown (always-visible)
- Onboarding Funnel card (always-visible)

Everything that was "settings I set once and forget" goes into the accordion. Everything operationally relevant stays above.

---

## H. ANTICIPATE-CONTEXT TOOLTIPS

Each tile and card has a hover state. Bloomberg design: tooltip is data-dense, not decorative.

### Tile hover specs

**Active Now (hover):**
```
catsfive -- /queue (4m ago)
Brent75 -- /modmail (12m ago)
propertyOfUniverse -- /users (1m ago)
[9 more offline]
```
Delay: 300ms. Dismisses on mouseout. Max height: 200px, scrollable if > 10 names.

**Clear-Rate (hover):**
```
Arrivals 24h: 213
Actioned: 200  (94%)
Oldest unactioned: 4.2h (Brent75 flagged at 14:32)
7d mean: 91%   7d low: 78%
```

**MM p50 (hover):**
```
p50: 3.2 min
p90: 18 min
p99: 47 min
Slowest category: ban_appeal (p50 14m)
7d trend: improving (-22% from prior week)
```

**Incidents (hover):**
```
Brigade Alpha     2h 14m    3 mods active
Spam wave #4      48m       1 mod
[+ incident]
```

### Card hover specs

**Lapsed mod row (hover on mod name):**
```
Last action: 2026-04-10
Actions total: 341
Actions 30d before lapse: 14   (declining)
Mentor assigned: propertyOfUniverse
```
This is the fatigue trajectory data (Cat 5 #13) surfaced without a separate click.

**30-day row (hover on mod name):**
```
Actions: 91 total
AI acceptance: 68%   Team mean: 61%
Overturn rate: 0%
Mentor notes: 3 received
Recommendation: promote
```

**KPI sparklines (hover on sparkline itself):**
Show the specific date's value as a floating label. "Tue May 6: 89%" etc. Sparse -- only shows on hover, not always-on.

---

## I. SHIP-TONIGHT MINIMAL VERSION

The 4-tile dashboard + lapsed mods card + quick-actions row. Everything else is "next push." Here is the exact scope that ships tonight.

### What's in

1. **KPI tile row** -- 4 tiles, static values (no sparklines yet), data from existing endpoints where available:
   - Active Now: reads `/presence/online` (exists)
   - Clear-Rate: reads a new `/metrics/queue-pressure` endpoint (S-effort: one D1 query)
   - MM p50: requires `is_first_reply` column + `/metrics/modmail-sla` (S-effort if Cat 2 adds the column in this push; else use a placeholder "SLA TBD" tile with amber badge)
   - Incidents: reads `mod_incidents` table (if V11 F8 shipped) or shows "0 / coming v11.3"
   
2. **Lapsed mods card** -- worker query on `actions MAX(ts) GROUP BY author`. Lead set threshold. Ping button pre-fills ModChat DM. Revoke shows departure summary.

3. **Quick-actions row** -- Invite (existing handler, new placement), Rotate all (existing handler, new placement), Bugs (N) badge (existing `bugListBadge` logic), Chat (new tab for now).

4. **Collapse Settings accordion** -- wrap existing Team settings + Autonomous maintenance + lead Maintenance buttons in `<details>`. Zero JS changes.

### What's deferred

- Sparklines (need 7 days of Analytics Engine data; add the event types now, render in v11.1)
- Hover tooltips (add after tile structure stabilizes)
- 30-day anniversaries card (depends on `mod_tokens.tier` column from Cat 2)
- Onboarding funnel card (depends on `/admin/onboarding/funnel` endpoint)
- Mod audit dropdown (depends on V11 #4 endpoint)
- Application review (depends on Cat 6 #13 + new D1 table)
- Worker health widget (depends on Analytics Engine adoption from Cat 5)

### Estimated effort for ship-tonight scope

| Item | Effort | Blocker |
|---|---|---|
| KPI tile HTML + CSS | S (2-3h) | None |
| `/metrics/queue-pressure` worker endpoint | S (1-2h) | None |
| Lapsed mods card + worker query | S (2-3h) | None |
| Quick-actions row (HTML + wire existing handlers) | S (1h) | None |
| Settings accordion wrap | S (30min) | None |
| **Total** | **~8h** | None |

This is a single-session push. No schema migrations. No new tables. All four items read from existing data.

---

## J. STRETCH -- Full Lead Scoreboard (V11_PLAN #12)

V11_PLAN #12 ("Lead Scoreboard, 8 KPIs, 5m refresh") is the natural evolution of the 4-tile dashboard once Analytics Engine is flowing. The full scoreboard replaces the popup Lead tab with a dedicated `/admin/scoreboard` page (or a fullscreen popup mode triggered from a "Expand" button in the top-right of the KPI row).

### The 8 Cat 3 KPIs mapped to tile+card structure

| KPI | Cat 3 Source | Tile or Card | Data |
|---|---|---|---|
| 1. Active mods now | Cat 3 F1 | Tile 1 (ships tonight) | presence/online |
| 2. Queue clear-rate | Cat 3 F2 | Tile 2 (ships tonight) | queue-pressure endpoint |
| 3. Modmail p50 SLA | Cat 5 #5 | Tile 3 (ships tonight) | modmail-sla endpoint |
| 4. Open incidents | Cat 3 F8 | Tile 4 (V11.3) | mod_incidents table |
| 5. AI acceptance rate | Cat 5 #1 | Stretch tile 5 | Analytics Engine |
| 6. Ban overturn rate | Cat 5 #8 | Stretch tile 6 | actions + F16 appeals |
| 7. Precedent citation rate | Cat 5 #12 | Stretch tile 7 | actions.precedent_count |
| 8. Mod fatigue signals | Cat 5 #13 | Stretch card | actions trend + presence |

### Full scoreboard layout

```
+----------+----------+----------+----------+
|  ACTIVE  | CLR-RATE |  MM p50  | INCIDENTS|
|    12    |   94%    |   3.2m   |    2     |
|sparkline |sparkline |sparkline |sparkline |
+----------+----------+----------+----------+
|  AI ACC  | OVERTURN | CITATION | FATIGUE  |
|   68%    |   2.1%   |   41%    |  1 flag  |
|sparkline |sparkline |sparkline |  amber   |
+----------+----------+----------+----------+

[LAPSED MODS]         [30-DAY ANNIVERSARIES]
[ONBOARDING FUNNEL]   [MOD AUDIT]
[APPLICATION REVIEW]  [TEAM WORKLOAD HEATMAP]
```

Bottom half of the scoreboard is cards -- same cards described in sections C-F, but now in a 2-column grid instead of a single column (more screen real estate in the expanded view).

### Workload Heatmap (Cat 5 #10, V11_PLAN #12)

A 15-mod x 7-day x 6-shift grid. Each cell: action count as a color saturation value (amber = high, near-black = zero). Click cell: list of actions in that mod x shift window. This is the lead's answer to "who's carrying the 2am load" without querying D1 manually.

```
         Mon  Tue  Wed  Thu  Fri  Sat  Sun
catsfive  |||  |||  |||  |||  |||  |||  |||  (lead -- suppressed in stats)
Brent75   |    |||  ||   |||  |    .    .
property  ||   |    ||   |    |||  |||  ||
[...]
```

Cell darkness = action density. Amber cells = above team mean. Red cells = > 2 sigma (anomaly, Cat 5 #18).

### Application review panel (Cat 6 #13)

Appears only if `mod_applications` table exists (Cat 6 #13 shipped). Card shows:

```
APPLICATIONS (4 pending)
MountainHiker99   karma:847  age:2.3y  [Invite] [Decline]
JusticeSeeker11   karma:412  age:0.8y  [Invite] [Decline]
[...]
```

Applications are pre-filtered by the worker (karma threshold + account age). Lead only sees qualifying candidates. Invite click fires the standard invite flow. Decline logs a `mod_application_declined` event (no notification to applicant -- async by design).

### Lead Scoreboard trigger

The scoreboard is NOT a separate tab (tabs are already at 4: Stats / Tokens / Tools / Lead). Instead, the KPI row in the Lead tab has a small `[...]` expand button top-right. Click toggles the popup into a 600px-wide fullscreen mode (using the existing `popup.html` `max-width` CSS override, already possible in MV3 with `chrome.windows.create`). Fullscreen mode shows the 2-column scoreboard. Close button returns to standard popup. No new route; no new window type; just a wider popup.

---

**Word count: ~2,850**
