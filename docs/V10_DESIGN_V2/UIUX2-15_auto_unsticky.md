# UIUX2-15 — Auto-Unsticky: Design Critique v10.12.3 → V2 Spec
**Scope:** Auto-Unsticky popover (`_showAutoUnstickyPopover`) + GEAR Auto-Unsticky Monitoring section + ticker `AUTO Q` kind  
**Surface owner:** Lead-only  
**Source read:** `modtools.js` @ lines 11213–11289, 17390–17487, 19060–19154  
**Date:** 2026-05-10

---

## A. Audit Summary — Does the Lead Feel in Control?

**Short answer: No. The lead has observation but not control.**

The three surfaces form a loop that is structurally sound but operationally blind:

1. **Ticker** emits `N AUTO Q` — a count, nothing more. The lead knows _something_ is pending; they do not know what, how old, or whether the worker is alive.
2. **Popover** shows a flat table of recent actions — status/target/queued/executor/result. It answers "what ran" but not "what is queued right now" or "why hasn't this fired yet."
3. **GEAR** has the opt-in toggle and threshold inputs, plus a single status line that reads `Last poll: X · N queued · N executed in 24h`. That status line is the only synthesis of system health, and it is buried under toggle + two numeric inputs inside a lead-only section.

**Control deficit:** the lead cannot, from any single surface, answer: "Is auto-unsticky working as expected right now?" They must triangulate: GEAR status line (last poll) + ticker (pending count) + popover (per-action table). None of the three surfaces links to the others. The GEAR "view recent" link fires `_showAutoUnstickyPopover(tickerEl)` — hardcoded to the ticker element as anchor, which is visually jarring (popover appears at the bottom of the screen while GEAR is an overlay).

---

## B. Opt-In Toggle Discoverability — Is It Prominent Enough?

**No. The toggle is effectively hidden behind two navigation steps.**

Current path to reach it:
> GEAR icon → scroll to "Auto-Unsticky Monitoring" section → find `addToggle('Auto-unsticky enabled', ...)` row

Problems:

- `addToggle` renders a generic two-column row with a label and a checkbox. There is no visual differentiation from the 10+ other toggles in GEAR. The section header is `🔁 Auto-Unsticky Monitoring` in plain text — same weight as every other section.
- The description text is 30 words buried in a small `gam-settings-desc` span. It explains the mechanism well but does not convey that this feature is **OFF BY DEFAULT** and requires deliberate activation. A lead who has never clicked into GEAR will never discover this feature exists.
- There is a _second_ auto-unsticky toggle in the non-lead section (`autoUnstickyEnabled` / "Auto-unsticky old / popular posts") under "📌 Auto-sticky management." Two toggles with superficially similar names and different scopes (local DOM-watching vs. worker-cron) is a silent confusion hazard. A lead who enables the wrong one gets no feedback.

**The discoverability bar is essentially zero.** If the lead is not already aware of the feature through out-of-band documentation, they will not find it.

---

## C. Does the Popover Answer "Is Auto-Unsticky Working as Expected Today?"

**No. It answers "what ran" but not "is it healthy."**

The popover (`_showAutoUnstickyPopover`, line 17390) renders a `modAutoActionRecent` RPC response as a monospace table: Status / Target / Queued / Executor / Result. 20 rows, max-height 360px, overflow-y auto.

**What it gets right:**
- Relative timestamps (`_auPRelTime`) are correct and human-readable.
- Status color coding (green=done, red=failed, purple=pending) is consistent with the rest of the Bloomberg-terminal aesthetic.
- RPC failure is caught and surfaced as a red inline error (line 17485).

**What it gets wrong:**

1. **No health summary header.** The popover opens with `AUTO-UNSTICKY -- RECENT` and jumps straight into the table. There is no aggregate line: "3 queued · 12 executed today · last worker cron 4m ago." The lead must scan rows to form that picture themselves.

2. **Pending rows are indistinguishable from stale pending rows.** A `status=pending` row that is 2 minutes old vs. 6 hours old looks identical. There is no age-coloring or "stuck?" warning. If the worker has stopped polling, pending rows pile up silently and the lead has no way to detect the outage.

3. **No "executor" data for pending rows.** `executed_by` is `--` for pending, which is correct but means the column provides zero signal for the most actionable rows. Executor should be replaced with an estimated wait or a "waiting for open tab" annotation when status=pending.

4. **Target is the raw `thing_id` (e.g. `t3_abc123`).** Non-clickable, no title. The lead sees a Reddit internal ID with no human context. A post title snippet or thread link would make each row actionable.

5. **No "failed" call-to-action.** Failed rows show `http_status/error` but there is no retry affordance, no dismiss, no detail expansion. The row is informational-only; if something failed 6 times, the lead can only observe, not act.

6. **Popover anchor is the ticker element.** When opened from GEAR (line 11286: `_showAutoUnstickyPopover(tickerEl)`), the popover positions itself relative to the ticker bar at the bottom of the screen — while the GEAR modal is open and covering most of the viewport. This is a spatial collision: the popover appears behind or below the GEAR overlay depending on z-index stacking.

7. **No last-poll timestamp in the popover.** `res.last_poll_at` is used in the GEAR status line (line 11280) but not surfaced in the popover. The lead who opens the popover from the ticker has no idea when the worker last checked GAW.

---

## D. Ticker — AUTO Q Chip Assessment

**The chip works but undersells urgency and provides no context.**

Current state: `N AUTO Q` in `#c084fc` (bb-purple), font-weight 500, letter-spacing 0.04em. It appears in the ticker rotation alongside POSTS Q, MODMAIL, DR PENDING, SUS, OP DEL.

**Severity positioning issue:** AUTO Q is weighted at 500 (same priority tier as POSTS Q / info level), below modmail (600), DR (600), SUS (700). But an auto-unsticky action is a _deferred execution_ — a post is already past threshold and waiting for a mod tab to fire it. This is operationally closer to DR PENDING (something the team committed to do) than to POSTS Q (items arriving in queue). The severity should be 600 (warn tier), not 500.

**`pulse: false`** — AUTO Q does not pulse. Every other time-sensitive state (modmail) pulses. If a post has been pending unsticky for 3+ hours because no mod has had a GAW tab open, there is no escalating signal. The chip looks the same at minute 1 and hour 6.

**Count-only message:** `3 AUTO Q` tells the lead there are 3 pending actions. It does not tell them how old the oldest one is. A message like `3 AUTO Q (2h)` — annotated with the age of the oldest pending item — would immediately communicate whether the queue is healthy (recent) or stuck (hours old).

**No pulse on failure.** If the most recent action has `status=failed`, the ticker shows the same purple chip. There is no color change or exclamation marker to signal that an action failed and needs attention.

---

## E. GEAR Section — Threshold Controls Assessment

**The controls are functionally correct but ergonomically raw.**

GEAR renders two `<input type="number">` fields for `max age hrs` and `min upvotes`. They respond to `change` events with clamped writes to `setSetting`. No debounce, no confirmation, immediate persistence.

**Logic description mismatch:** The GEAR desc (line 11229) says "Post must exceed BOTH max age AND min upvotes." The `autoUnstickyTick` function (line 24151) for the _local_ watcher uses OR logic (`age >= maxHours OR upvotes >= threshold`). These are different features (local watcher vs. worker cron), but a lead who reads one description and assumes it applies to both will misconfigure their thresholds. The distinction is not called out anywhere on screen.

**No live preview / impact estimate.** The lead sets `max_age_hours = 10` and `min_upvotes = 110` with no feedback on how many currently-stickied posts would qualify under those thresholds. This is the key decision the lead is making — "how aggressive should auto-unsticky be?" — and they are flying blind.

**No threshold change acknowledgment.** After changing a number input and tabbing away, nothing happens visually. No snackbar, no "saved," no color flash. The lead cannot confirm that the change persisted.

**Input sizing inconsistency:** `max age hrs` input is `width:60px`; `min upvotes` is `width:80px`. The wider input is for the smaller-magnitude number (upvotes top out at 10000 vs. hours at 240). This is inverted — both should be 64px, or hours narrower than upvotes.

**No "push to worker" indicator.** Worker reads these settings on each cron tick. Changes take effect only on the next worker run (up to 5 minutes later). This lag is invisible. If the lead changes thresholds and immediately looks at the status line, they will see the old run's data and believe their change had no effect.

---

## F. Architecture of Missing Observability

Three pieces of data the system _has_ that are not surfaced on any of the three surfaces:

| Data | Where it exists | Not shown in |
|---|---|---|
| `last_poll_at` | `modAutoActionRecent` RPC response | Popover |
| Oldest-pending-item age | Derivable from `queued_at` on pending rows | Ticker chip |
| Failed-action count | Derivable from `status=failed` rows | Ticker chip, GEAR status line |

The GEAR status line (line 11281) shows `last_poll` + `N queued` + `N executed in 24h`. It does not show failed count, oldest-pending age, or whether the local watcher (`autoUnstickyEnabled`) is running concurrently with the worker cron (`auto_unsticky_enabled`) — a potential double-fire scenario that has no UI warning.

---

## G. V2 Design Directives (What to Build)

### G1. Ticker chip — 3 changes

- **Severity:** Raise `auto` from weight 500 to 600. Raise letter-spacing from `0.04em` to `0.06em`. Treat it as warn-tier, not info-tier.
- **Age annotation:** Compute oldest-pending `queued_at` in `_pollAutoPendingCount` and store alongside count. Render as `3 AUTO Q · 2h` when oldest item is >30 min old.
- **Failed state:** If any pending+failed exist, shift chip color from `#c084fc` (purple) to `#ff9933` (amber, same tier as modmail) and add `!` suffix: `1 FAILED`.
- **Pulse on stale:** Add `pulse: true` when oldest pending item is >1 hour old OR any item is failed.

### G2. Popover — 5 changes

- **Health bar at top:** One line above the table: `Last worker cron: 4m ago · 3 pending · 12 done today · 0 failed`. Colored: grey if cron <10m ago, amber if 10–30m, red if >30m (worker may be down).
- **Age column for pending rows:** Replace the generic `Queued` column with a colored age column: green <10m, amber 10–60m, red >60m.
- **Target title:** Resolve `thing_id` to a post title snippet (from cached DOM or RPC). Show as `[t3_abc] Title of post (truncated 40ch)`. Link to post in new tab.
- **Failed row expansion:** Click a failed row to expand an inline detail panel: HTTP status, error message, retry button (fires `modAutoActionRetry` RPC), dismiss button.
- **Anchor fix:** Accept a second `anchorEl` param that is the actual clicked element. When called from GEAR status line, anchor to the status line element, not `tickerEl`. Remove the hardcoded `tickerEl` reference in line 11286.

### G3. GEAR section — 4 changes

- **Opt-in toggle prominence:** Render the `Auto-unsticky enabled` toggle with a distinct visual treatment: left border `3px solid #c084fc`, background `rgba(192,132,252,0.05)`, label in `#c084fc` weight 600 instead of default `#e8e6e1` weight 400. Add a `OFF BY DEFAULT — lead must activate` badge in amber next to the label when the toggle is off.
- **Disambiguate from local watcher:** Add a one-line info callout below the toggle: "This is the worker-cron feature (fires every 5 min via Cloudflare). It is separate from the local 'Auto-sticky management' toggle above, which watches the DOM only while you have a tab open."
- **Threshold save confirmation:** On `change`, flash a `Saved` badge (green, 1.5s fade) adjacent to the input that was changed.
- **Push lag notice:** Add below the threshold inputs: "Worker picks up changes on next cron tick (up to 5 min)."
- **Status line anchor fix:** Pass the status line element itself as anchor to `_showAutoUnstickyPopover` instead of `tickerEl`.

### G4. Dual-toggle confusion mitigation

- Detect at render time if both `autoUnstickyEnabled` (local) and `auto_unsticky_enabled` (worker cron) are true simultaneously.
- If both are on, show a yellow warning row between the two sections: "Both local and worker auto-unsticky are active. The same post may be unstickied twice if both triggers fire within the 6h cooldown window. Consider disabling the local watcher if the worker cron is the intended mechanism."

---

## H. Implementation Priority Order

| # | Change | Surface | Effort | Impact |
|---|---|---|---|---|
| 1 | G2 health bar (last cron + counts) | Popover | S | HIGH — directly answers "is it working?" |
| 2 | G2 anchor fix (GEAR → status line) | Popover | XS | HIGH — fixes spatial collision bug |
| 3 | G1 age annotation on chip | Ticker | S | HIGH — surfaces hidden staleness |
| 4 | G3 opt-in toggle prominence | GEAR | S | HIGH — discoverability fix |
| 5 | G1 failed state (amber + pulse) | Ticker | S | MED — escalation for broken actions |
| 6 | G2 age coloring for pending rows | Popover | XS | MED — zero-scan status at a glance |
| 7 | G3 threshold save confirmation | GEAR | XS | MED — eliminates "did it save?" friction |
| 8 | G4 dual-toggle warning | Both GEAR sections | S | MED — prevents double-fire confusion |
| 9 | G3 disambiguate from local watcher | GEAR | XS | MED — prevents misconfiguration |
| 10 | G2 target title + link | Popover | M | MED — actionability, requires cache/RPC |
| 11 | G2 failed row expansion + retry | Popover | M | MED — turns observation into action |
| 12 | G1 severity tier raise (600) | Ticker weight map | XS | LOW — refinement, not blocking |
| 13 | G3 push lag notice | GEAR | XS | LOW — sets correct expectation |

Items 1–4 are the minimum viable V2 for the "does the lead feel in control?" question. Together they take ~2h of implementation.

---

*End of UIUX2-15*
