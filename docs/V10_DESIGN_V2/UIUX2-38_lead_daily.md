# UIUX2-38 -- Lead Daily Flow: Walkthrough, Gap Analysis, Click Audit
**Agent:** UIUX2-38-LEAD-DAILY
**Date:** 2026-05-10
**Version audited:** v10.12.3 + all V10_DESIGN_V2 sub-specs (UIUX2-01 through UIUX2-15)
**Scope:** Lead mod daily routine -- KPI scan, rotation/audit/maint reports, bulk team actions, Auto-Unsticky GEAR, lead-only feature discoverability
**Skill applied:** ui-ux-pro-max -- Bloomberg dense, data-first, operational clarity

---

## A. Lead Routine Walkthrough -- Step by Step

The lead mod's daily routine resolves to six operations. This walkthrough traces
each from intent to completion in the current v10.12.3 + V2-spec UI.

---

### A.1 KPI Scan ("How is the team doing right now?")

**Entry point:** Popup open -> Lead tab

**Path:**
1. Open popup (click extension icon)
2. Click Lead tab (if not already active -- persisted from last session)
3. Read the four KPI tiles: ACTIVE NOW / CLR-RATE / MM p50 / INCIDENTS
4. Read delta chips (session-over-session change direction)
5. Scan lapsed chip (bottom of KPI strip) for overdue mods

**Current click count: 1-2 clicks** (tab switch + read; no action required unless anomaly found)

**What the lead sees:**

| Tile | Signal | Threshold |
|------|--------|-----------|
| ACTIVE NOW | # mods who pinged presence in last session | Red=0, Amber=1-2, Green>=3 |
| CLR-RATE | Team clearance rate from /mod/stats | Red<50%, Amber 50-79%, Green>=80% |
| MM p50 | Median modmail response time p50 | Red>6h, Amber 2-6h, Green<2h |
| INCIDENTS | Stub (V11 not built) | Always -- |

**V2 gaps still blocking this flow (from UIUX2-06):**

- Delta chips have no directional color. `+3 ACTIVE NOW` and `-3 ACTIVE NOW` render identically
  (A.2 in UIUX2-06 -- CSS rule for `.gam-kpi-delta[data-dir]` is missing).
- Loading state is invisible. Tiles show `--` both during RPC flight and as permanent stub --
  the lead cannot tell if data is incoming or will never arrive (A.3).
- INCIDENTS shows `0` green when no endpoint exists, implying confirmed zero (false precision, A.4).
- Deep-Dive summary reads "Deep Dive [+]" with no status strip -- the lead must open it to learn
  anything (A.5).
- Sub-panel status spans (Rotation, Maint Reports, Diagnostics, Settings) are empty (A.6).

**Click count after V2 fixes: unchanged at 1-2.** The data answers the question without clicks
once the delta color and status strip land. The current state requires the lead to open Deep Dive
to form any picture beyond the four raw numbers.

---

### A.2 Deep-Dive into Rotation Report

**Entry point:** Lead card -> Deep Dive accordion -> Discord DM Rotation sub-panel

**Path:**
1. Click Deep Dive accordion to open (1 click)
2. Click "Discord DM Rotation" sub-panel (1 click)
3. Read last-run timestamp, rotation list, token status
4. If rotation is stale: click [ROTATE] Quick Action button to trigger rotation (1 click)
5. For invite generation: click [+INVITE] Quick Action (1 click)

**Current click count for a normal check: 2 clicks**
**Current click count for a stale rotation requiring action: 4 clicks**

**Gaps:**

- Rotation sub-panel `sub-status` span (`lead-sub-rotation-status`) is never populated. The lead
  clicks in blind -- the collapsed row gives no preview of last rotation time (UIUX2-06 A.6, D.3).
- After V2 spec lands: the summary shows "last: Nh ago" without opening. If >24h, the amber
  color signals it. The lead can act on the Quick Actions bar without touching Deep Dive at all
  for routine rotation -- dropping to 1 click ([ROTATE]).
- `inviteBtn` inside the Rotation sub-panel is a duplicate of `qaInviteBtn` in Quick Actions,
  with a separate handler. If the two drift, one silently fails (UIUX2-06 B.3, F.10).

**Post-V2 click count (routine rotation check): 1 click if Deep Dive status strip is populated;
2 clicks if the lead wants to confirm details before rotating.**

---

### A.3 Bug Reports Review

**Entry point:** Lead card -> Deep Dive accordion -> Bug Reports sub-panel

**Path:**
1. Click Deep Dive (if not already open, 1 click)
2. Click "Bug Reports" sub-panel (1 click)
3. Read bug list with badge count (`bugListBadge` -- the one wired sub-status)
4. If bugs need action: click to individual bug detail, resolve or triage

**Current click count to see bug count: 2 clicks**
**Current click count to reach individual bug: 3 clicks**

**Note:** Bug Reports is the only sub-panel whose `sub-status` span is wired. The `bugListBadge`
textContent drives it. This is the reference implementation for the five sub-panels -- four others
need equivalent wiring (UIUX2-06 A.6).

**Post-V2:** The Deep Dive outer summary shows `bugs:N` inline. If N > 0 the lead sees the count
without opening Deep Dive. Click count to know the bug count drops to 0 (ambient, from the
collapsed summary strip). Reaching individual bug detail stays at 3 clicks.

---

### A.4 Maintenance Reports Review

**Entry point:** Lead card -> Deep Dive -> Maintenance Reports sub-panel
OR: Lead-panel maint buttons (Audit Verify, Full Report, Roster Staleness, Migration Debt)

**Two-tier problem (identified in UIUX2-05 G):**

There are two parallel maintenance surfaces:
- The 4-card system (card-maint-status / -probes / -detect / -integrity) in the Tools tab -- all mods
- The lead-panel maint buttons (Audit Verify, Full Report, Roster Staleness, Migration Debt) in the
  Lead card -- lead-only

The lead-panel maint buttons use pre-v10.12 CSS classes (`pop-maint-row`, `pop-maint-status`) while
the 4-card system uses `pop-maint-action-row` / `pop-maint-action-status`. This is the same operation
type rendered with different visual language depending on which surface the lead happens to be on.

**Path for Maintenance Reports (Lead card path):**
1. Click Deep Dive (1 click)
2. Click "Maintenance Reports" sub-panel (1 click)
3. `lead-sub-maintreports-status` span is empty -- no preview, no severity
4. Read maintenance report content

**Path for Audit Verify (lead-panel maint path):**
1. Navigate to the bottom of the lead card body (scroll, 0-1 action)
2. Click Audit Verify button (1 click)
3. Read result in status span

**Current click count (Maintenance Reports review): 2 clicks**
**Current click count (Audit Verify): 1-2 clicks**

**Gaps:**
- `lead-sub-maintreports-status` is empty. The lead cannot triage priority before opening.
- The lead-panel maint buttons use old CSS classes and have no amber left-border severity styling
  (UIUX2-05 H.8 recommends adopting `pop-maint-action-row` for these).
- No visual connection between the "Maintenance Reports" sub-panel in Deep Dive and the actual
  Audit Verify / Full Report buttons below it in the lead card body. A lead who opens the sub-panel
  expecting action buttons finds only report content; action buttons are in a different section.

---

### A.5 Token Rotation -- Mod Invite + DM Flow

**Entry point:** Lead card -> Quick Actions bar -> [+INVITE] -> Discord DM manually

**Path:**
1. Click [+INVITE] in Quick Actions bar (1 click)
2. Enter target mod username in prompt (1 interaction)
3. Receive generated invite URL (shown in result)
4. Copy URL manually
5. Open Discord, DM target mod, paste URL

**Current click count: 1 popup click + 1 prompt + manual Discord switch**
**Total operator actions: ~5 (click, type, copy, switch app, paste)**

**This is the single highest-friction daily operation for a lead.** The tool generates the invite
link but the DM delivery is fully manual. There is no in-tool notification, no batch invite
capability, no Discord integration. The "Rotation" quick action (ROTATE button) triggers the
server-side rotation, but the invite URL + DM step is entirely out-of-band.

**From UIUX2-06 B.3:** `inviteBtn` inside the Rotation sub-panel is a second entry point to the
same RPC, creating two handlers for the same operation. The canonical path should be `qaInviteBtn`
in Quick Actions. The Deep Dive `inviteBtn` should either be removed or share the same handler.

**V2 recommendation (within current architecture -- no Discord API):**
- After invite URL is generated, auto-copy it to clipboard with a "[URL copied]" confirmation.
- Eliminate the "copy it manually" step. This drops one operator action.
- The prompt for target username is unavoidable without a mod-picker UI.

**Minimum click count post-V2 (single invite): 1 click + 1 type + manual Discord**

Bulk DM rotation (inviting multiple mods in sequence) requires repeating this flow N times.
There is no batch mode. For a team rotation of 5 mods, that is 5 x (click + type + switch to
Discord + DM). This is the largest remaining meatbag loop in the lead daily workflow.

---

### A.6 Auto-Unsticky Threshold Management

**Entry point:** GEAR icon -> "Auto-Unsticky Monitoring" section

**Path (discovery):**
1. Click GEAR icon (1 click)
2. Scroll to "Auto-Unsticky Monitoring" section in GEAR (1-3 scroll actions)
3. Find the enable toggle (visually identical to 10+ other toggles -- no differentiation)
4. Adjust max_age_hours and min_upvotes inputs (2 interactions)
5. Close GEAR (1 click)

**Current click count to reach threshold controls: 4-6 actions**

**Critical discoverability failure (UIUX2-15 B):**
The toggle is buried under identical styling with no visual differentiation. A lead who has
never been told this feature exists will not discover it. The feature is OFF BY DEFAULT.
There is no ambient signal that the feature exists and is inactive.

**Second toggle confusion (UIUX2-15 B):**
There are TWO auto-unsticky toggles in GEAR:
- "Auto-unsticky enabled" under "Auto-Unsticky Monitoring" -- worker-cron (lead-only)
- "Auto-unsticky old / popular posts" under "Auto-sticky management" -- local DOM watcher (all mods)

Same display name family, different mechanisms, different scopes. If both are active, the same
post can be unstickied twice within the cooldown window (UIUX2-15 F).

**Auto-Unsticky Ticker (ambient signal):**
When posts are pending unsticky, the ticker shows `N AUTO Q` in purple weight-500.
- The chip does not pulse (unlike modmail, DR, SUS which signal urgency by pulsing)
- The chip shows count only, not oldest-pending age
- If an action failed, the chip stays purple -- no color shift to signal failure

This means the lead's only ambient signal for Auto-Unsticky health is a count of pending items
with no context about staleness or failures (UIUX2-15 D).

**Auto-Unsticky Popover (diagnostic view):**
Triggered from the ticker chip. Shows: status / target / queued / executor / result table.
- No health summary header (last cron time, total executed today, failed count)
- Pending rows look identical regardless of age -- a 6-hour-old pending item looks like a 2-minute-old one
- Popover anchors to the ticker element; when opened from GEAR status line, appears at the bottom
  of screen while GEAR modal is open (spatial collision -- UIUX2-15 C.6)
- Failed rows have no retry affordance

**Click count to answer "is Auto-Unsticky working right now?":**
Current state: minimum 3 surfaces required (GEAR status line + ticker chip + popover). No single
surface answers the question. At minimum 3 clicks across two UI surfaces.
Post-V2: popover health bar answers it in 1 click from the ticker.

---

### A.7 Team Activity Audit

**Entry point:** Stats tab -> PENDING / DEATH ROW / BANNED tiles + Active Mods popover

**Stats tab path (A.7a):**
1. Click Stats tab if not active (1 click)
2. Read 8-tile grid: Pending, Death Row, Banned, Bans/24h, Msgs/24h, Notes/24h, AI Today, Auto-UNS
3. Click tile for drill-down if count warrants investigation

**Active Mods popover path (A.7b):**
1. Click presence button in mod toolbar (1 click)
2. Read who is online, their current page, last-seen time
3. Toggle 4H / 8H / 24H window to adjust scope

**Current stat tile gaps (UIUX2-01):**
- All 8 delta chips are ghost boxes (wired in HTML, never written by JS) -- the "session trend"
  signal is completely absent
- Sparkline containers are in DOM but never rendered -- 14px of dead space per tile
- Death Row alert uses skull emoji as semantic signal (no-emoji-icons violation)
- AI tile drill-down is a shipped placeholder ("coming v10.11 -- requires worker API")
- Inline color overrides contradict the token/data-state system

**Active Mods popover gaps (UIUX2-14):**
- All rows render identically -- a mod seen 23h ago looks the same as one seen 4m ago
- No presence dot, no idle/active/stale tiers
- Sort order is server-order, not recency-descending
- Time-ago shows "0m" for mods seen <60s ago (should show "now")
- Page-path column is not clickable, truncates at 32 chars with no ellipsis
- No mod count in header

**For the lead specifically:** the Active Mods popover is the team-health pulse check. The flat
rendering means the lead must read every time-ago value to know who is actually live. The V2
spec (UIUX2-14 G) adds active/idle/stale tiers with colored dots, section dividers (ACTIVE N /
IDLE N / EARLIER), and recency sorting -- turning a scan from O(N) to O(1).

---

## B. Discovery Gaps -- Lead-Only Features Mods Cannot See

The lead-only surface is structured via `#leadOnlyTools` visibility gating. This creates two
discovery failure modes:

### B.1 Features the lead cannot discover either

| Feature | Location | Discovery path | Current discoverability |
|---------|----------|----------------|------------------------|
| Auto-Unsticky worker-cron | GEAR "Auto-Unsticky Monitoring" | GEAR scroll | ZERO -- no ambient signal, buried toggle, off by default |
| Discord DM Rotation | Lead card -> Deep Dive -> Rotation sub-panel | 2 clicks + no status preview | LOW -- Deep Dive summary is opaque |
| Lapsed mods management | Lead card -> lapsed chip | Conditional render (only when >0 lapsed) | MEDIUM -- chip appears when needed |
| Audit Verify / Full Report | Lead card -> lead-panel maint section | Scroll to bottom of lead card | LOW -- no prominence differentiation from non-lead maint buttons |
| Roster Staleness | Lead card -> lead-panel maint section | Same as above | LOW |
| Migration Debt | Lead card -> lead-panel maint section | Same as above | LOW |
| KPI tabs (CLR-RATE, MM p50) | Lead card -> KPI strip | Visible immediately on Lead tab | HIGH -- top of card |

**The two highest-impact lead-only features (Auto-Unsticky and DM Rotation) are the two hardest to find.**

### B.2 Features mods see that leads may not know are lead-exclusive

The Lead tab button is conditionally visible to leads only (hidden via CSS/JS visibility gating).
Non-lead mods never see the Lead tab. This is correct behavior, but it creates an asymmetry:
if a lead-mod temporarily loses lead status, their browser restores to the Lead tab from
localStorage and shows a blank panel (UIUX2-08 D.3 -- no guard against stale tab restoration).

### B.3 The "lead-only maint" zone has no visual marker

The lead-panel maint buttons (Audit Verify, Full Report, Roster Staleness, Migration Debt) live at
the bottom of the lead card body with no section header distinguishing them from the generic
maintenance surface in the Tools tab. A lead who knows to run these operations will find them;
a new lead promoted to the role has no affordance indicating these buttons exist or what
separates them from the 4-card maint system. A `LEAD MAINTENANCE` sub-label with amber accent
would mark the zone (zero JS cost, 1 HTML addition).

---

## C. KPI Usefulness Check -- "How Is the Team Doing Today?"

Evaluated against the lead's actual operational question: "Which problems need my attention right now?"

### C.1 ACTIVE NOW -- HIGH USEFULNESS, PARTIALLY BROKEN

**Answers:** "Is anyone actually moderating?"
**Current state:** Live data from `modPresencePing`. Three-tier color (green/amber/red). Panel
toggle shows mod list. Click to expand name list.
**Delta:** Session-over-session direction is tracked but not colored (A.2, UIUX2-06). A `+3`
and a `-3` look identical.
**V2 fix:** Delta color CSS (4 rules, 30-second change). Post-fix: high usefulness fully realized.

### C.2 CLR-RATE -- MEDIUM USEFULNESS, DATA DEPENDENT

**Answers:** "Is the team clearing the modmail queue efficiently?"
**Current state:** Hooked to `modStats` RPC. Correct thresholds. Null fallback is `--`.
**Limitation:** Clearance rate is a lagging indicator -- it reflects yesterday's work, not today's.
A team that was excellent yesterday but is absent today still shows a green CLR-RATE tile.
Combined with ACTIVE NOW it gives a useful composite: high CLR-RATE + low ACTIVE NOW = coast
(team is slowing down on a good baseline). Low CLR-RATE + high ACTIVE NOW = problem (team is
present but not clearing).
**Delta:** Same broken coloring as ACTIVE NOW.
**V2 assessment:** MEDIUM usefulness today; HIGH usefulness after delta color lands.

### C.3 MM p50 -- LOW-MEDIUM USEFULNESS IN CURRENT FORM

**Answers:** "How long are modmails sitting unanswered at the median?"
**Current state:** Hooked to `modStats` RPC. Correct thresholds (Green <2h, Amber 2-6h, Red >6h).
**Problem:** p50 is a population median. A lead who sees `p50 = 1.4h` cannot tell whether that
reflects 10 modmails all under 2h or 50 modmails including several at 12h. The median hides the
long tail that actually creates a bad user experience. The tile is correct as a summary signal
but insufficient for diagnostic action.
**`data-invert="true"` requirement:** For MM p50, "up" direction is bad (longer wait = worse).
The delta color CSS must invert for this tile (UIUX2-06 C.3, Option A -- `data-invert` attribute,
4 additional CSS rules).
**V2 assessment:** Useful as a green/red headline; requires drill-down for actionable detail.

### C.4 INCIDENTS -- NOT USEFUL IN CURRENT FORM

**Answers:** Nothing reliably. Always shows `0` green (V11 mod_incidents not built).
**Current state:** Hardcoded `_setKpiTile('kpi-incidents', 0, 'var(--bb-green)')`. Implies the
system has checked and confirmed zero incidents. This is false precision.
**V2 fix:** Render as `--` stub with tooltip explaining why (UIUX2-06 C.2, F.8). When V11 ships,
wire to real endpoint.
**V2 assessment:** Zero usefulness today; will be HIGH value when V11 ships.

### C.5 Summary verdict: KPI strip answers "how is the team doing?" at a surface level

The four tiles, when fully wired and correctly colored, give the lead a 4-second morning check:
- Active Now = team presence signal
- CLR-RATE = throughput signal
- MM p50 = responsiveness signal
- INCIDENTS = incident signal (future)

None of the four tiles answer "which mod specifically needs coaching?" or "what is the queue
composition right now?" Those require drill-downs. The KPI strip is a dashboard-level roll-up,
not a management tool. It answers "is everything roughly okay" but not "what should I do next."

For "what should I do next," the lead needs:
- Stats tab tile drill-downs (PENDING list, Death Row list)
- Active Mods popover (who is online right now)
- Deep Dive Rotation status (is rotation stale?)
- Deep Dive Bug Reports badge (any open bugs?)

The KPI strip is necessary but not sufficient for the full daily check.

---

## D. Click Reduction Analysis for Routine Lead Operations

### D.1 Current vs V2 click counts (per operation)

| Operation | Current clicks | V2 clicks | Reduction | Key change |
|-----------|----------------|-----------|-----------|------------|
| KPI scan (morning check) | 1-2 | 1 | -1 | Status strip on Deep Dive summary; delta colors work |
| Check if rotation is stale | 3 (tab + deep dive + sub-panel) | 1 | -2 | Sub-panel status "last: Nh ago" on collapsed summary |
| Check bug count | 2 (tab + deep dive) | 0 | -2 | Bug count in Deep Dive summary strip: "bugs:N" |
| Trigger rotation | 4 (tab + deep dive + sub-panel confirm + ROTATE) | 2 | -2 | Quick Action ROTATE direct from Lead card; sub-status pre-confirms need |
| Generate invite | 2 (tab + INVITE click) | 2 | 0 | No change to click path; auto-clipboard eliminates one manual action |
| Check Auto-Unsticky status | 3+ (GEAR + scroll + popover) | 1 | -2 | Health bar in popover; anchor fix; prominence toggle in GEAR |
| Identify who is live | 2 (stats tab + active mods click + scan rows) | 1 | -1 | Active/idle/stale tiers; section dividers; sort by recency |
| Check pending modmail drain | 2 (stats tab + PENDING tile click) | 2 | 0 | Delta chip lands automatically; same click path |
| Confirm team stats (daily) | 2 (stats tab + read) | 2 | 0 | Delta chips fix the "trend" question; same tab |
| Maintenance audit (Audit Verify) | 1-2 | 1 | 0-1 | Consistent action-row styling; no structural change |

### D.2 The three biggest remaining friction points (post-V2)

**1. Discord DM rotation delivery (no automation)**
After invite generation, the lead must manually switch to Discord, find the target mod's DM,
and paste the URL. This is a 3-5 step out-of-band operation that cannot be eliminated without
a Discord webhook/bot integration. Current total friction: ~6 operator actions per invite.
V2 eliminates one (auto-clipboard). The other 5 are outside the extension's reach.

**2. Bulk team operations have no batch mode**
If 3 mods are lapsed, the lead must:
a) Ping All (one click from the lapsed chip -- this works)
b) Invite each lapsed mod individually (3 x invite flow)
There is no "invite all lapsed" bulk operation. The `Ping All` button covers the ping side;
the invite side is entirely manual.

**3. Auto-Unsticky feature discoverability (before first use)**
A new lead must stumble into GEAR and scroll past 10+ identical toggles to find the
Auto-Unsticky enable toggle. There is no "lead setup checklist," no first-run prompt, no
ambient signal that this feature is inactive and available. Post-V2 (GEAR prominence fix),
the toggle becomes visually distinct within GEAR, but the lead still must know to look in GEAR.

---

## E. Effort Summary -- Outstanding V2 Work Affecting Lead Daily Flow

Items below are drawn from child specs. Only those directly on the lead daily path are listed.

### E.1 Blocking (must land before Lead daily is reliable)

| Item | Source | Files | Effort | Impact |
|------|--------|-------|--------|--------|
| Delta color CSS (`.gam-kpi-delta[data-dir]` + invert) | UIUX2-06 F.1 | popup.css | 10 min | KPI tiles become meaningfully directional |
| Loading state wire-up (pulse on RPC flight) | UIUX2-06 F.7 | popup.js | 15 min | Lead can tell loaded vs pending vs stub |
| INCIDENTS null stub (replace hardcoded 0) | UIUX2-06 F.8 | popup.js | 5 min | Eliminates false precision |
| Deep-Dive status strip ("bugs:N maint:ok last:3h ago") | UIUX2-06 F.6, F.12 | popup.html, popup.js | 20 min | Reduces click count on rotation/bug check from 2 to 0 |
| Sub-panel status wiring (Rotation, Bug Reports) | UIUX2-06 F.12 | popup.js | 20 min | Collapsed panels carry preview signal |
| Active Mods: idle/active/stale tiers + sort + section dividers | UIUX2-14 H4 | modtools.js | 45 min | Team presence scan from O(N) to O(1) |
| Auto-Unsticky popover health bar | UIUX2-15 G2 | modtools.js | M | Answers "is it working?" in 1 click |
| Auto-Unsticky popover anchor fix | UIUX2-15 G2 | modtools.js | XS | Eliminates spatial collision from GEAR |
| Auto-Unsticky GEAR toggle prominence | UIUX2-15 G3 | modtools.js | S | Feature becomes discoverable |

### E.2 High value, non-blocking

| Item | Source | Files | Effort | Impact |
|------|--------|-------|--------|--------|
| Stats tab delta chips (sessionStorage-based trend) | UIUX2-01 F.1 | popup.js, popup.html | 1h | Team daily stats gain trend signal |
| Stats tab ghost spark containers removed | UIUX2-01 B.1 | popup.html, popup.css | 30 min | Eliminates dead space, wires 3 activity sparklines |
| Lapsed chip label dynamic threshold | UIUX2-06 F.9 | popup.js | 10 min | Chip label reflects actual threshold setting |
| inviteBtn handler unification | UIUX2-06 F.10 | popup.js | 20 min | Eliminates double-handler maintenance trap |
| Lead-panel maint buttons: adopt action-row CSS | UIUX2-05 H.8 | popup.html, popup.css | 20 min | Visual consistency between lead and general maint |
| LEAD MAINTENANCE section sub-label | This spec | popup.html | 5 min | New-lead discoverability for audit buttons |
| Auto-Unsticky ticker: age annotation + failed state | UIUX2-15 G1 | modtools.js | S | Ambient staleness signal without opening popover |
| Active Mods: mod count in header | UIUX2-14 H5 | modtools.js | 5 min | Immediate team density read from header |
| Active Mods: page-path as clickable link | UIUX2-14 E | modtools.js | 20 min | Jump to mod's current page without copy-paste |

### E.3 Total effort for full lead-daily reliability

**Blocking items:** ~2.5 hours
**High value non-blocking:** ~4 hours
**Total to full V2 lead-daily spec:** ~6.5 hours

No items require new RPCs. All changes are within existing popup.js, modtools.js, popup.html,
popup.css. No schema changes. No worker changes except when V11 mod_incidents ships.

---

## F. Cross-Spec Structural Issues Surfaced by This Analysis

Three issues not addressed in any child spec:

### F.1 No "lead setup checklist" for first-run leads

When a mod is promoted to lead, the UI gives no guidance. The Lead tab appears, showing
the KPI strip (all `--` on first session), a Deep Dive with empty sub-panel status spans,
and lead-panel maint buttons with old CSS. There is no prompt saying "enable Auto-Unsticky,"
"generate your first invite link," or "run an Audit Verify." A new lead relies entirely on
out-of-band onboarding documentation.

**Recommendation:** A one-time "first-run" banner inside the Lead card body, dismissed on first
interaction, listing the three lead-only features with their entry points. Zero RPC cost.
Minimal HTML, localStorage flag to suppress after first view.

### F.2 The lead daily flow spans three tabs (Stats, Tools, Lead)

The morning routine requires:
- Stats tab (team stats, pending, death row)
- Lead tab (KPI strip, deep dive, lapsed mods)
- Active Mods popover (presence -- accessible from mod toolbar, not a tab)
- GEAR (Auto-Unsticky configuration)

There is no single "lead dashboard" view. The lead triangulates across three tabs plus a modal.
This is by design (Bloomberg density forces content separation), but it means the "daily check"
has a minimum of 3-4 tab switches.

**Post-V2 mitigation:** The Stats tab delta chips + Active Mods tier separation reduce the time
spent on each tab, but do not eliminate the tab-switch overhead. The lead daily routine is
inherently multi-tab. Acceptable for a power-user tool; worth naming explicitly.

### F.3 Lead-only Quick Actions bar has no lead badge on the tab

The Lead tab button has no badge dot (UIUX2-08 F.2 identifies this gap). If the lapsed chip
fires (lapsed mods > 0), the lead sees it only after clicking into the Lead tab. There is no
ambient "attention needed" signal on the tab nav itself.

**Recommendation (from UIUX2-08 F.3):** Extend the `window.modTabBadge.set()` API (proposed
in UIUX2-08) to fire an amber `info` badge on the Lead tab when `lapsedModsCount > 0`. The
lapsed count is already computed by `__loadLapsedMods`. One additional call to set/clear the badge.

---

## Summary

The lead daily flow in v10.12.3 is functional but requires 3-5x more operator actions than
necessary to answer routine questions. The root causes are:

1. **KPI tiles carry data but not trend** -- delta chips are structurally present but never
   colored, so the session-over-session signal is invisible.

2. **Deep Dive is opaque when collapsed** -- the outer accordion gives no status preview,
   forcing the lead to open sub-panels to know whether any action is needed.

3. **Auto-Unsticky is the least discoverable lead-only feature** and the only one where the
   lead has control over system behavior (vs. observing team behavior). Its three surfaces
   (ticker, popover, GEAR) do not answer "is it working?" without manual triangulation.

4. **Active Mods flat rendering** makes the team presence check O(N) when it should be O(1).

5. **Discord DM rotation delivery is fully manual** and will remain so without Discord integration.

The V2 specs collectively address items 1-4. Item 5 requires a product decision (Discord bot/webhook).
Total effort to resolve items 1-4: ~6.5 hours across existing files, no new dependencies.
