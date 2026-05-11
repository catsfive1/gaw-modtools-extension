# UIUX2-11 -- Death Row Popover v2 Design
**Auditor:** UIUX2-11-DR-POPOVER
**Skill invoked:** frontend-design (Live execution-monitor popover -- countdown tickers per row, urgency-band visual hierarchy, batch operation bar, staged destructive confirm, withUndo affordance, Bloomberg dense.)
**Target version:** v10.13
**Date:** 2026-05-10
**Affects:** `modtools.js` `_showDrPopover()` (v10.12.0 implementation L18002-18314)
**Prior design:** `docs/V10_DESIGN/UIUX-10_dr_popover.md` (v1, DESIGN-10-DR-POPOVER)
**Status:** AMBER -- read-only design document, no code changes

---

## A. Critique -- v10.12.0 Shipped State vs v1 Spec

### What shipped in v10.12.0

The H.6 patch delivered the high-ROI core of the v1 spec:

- **Sort soonest-first** -- `drList.sort((a,b) => a.executeAt - b.executeAt)` (v1 B.4 -- 1 line, highest ROI)
- **Three urgency bands** -- IMMINENT / TODAY / DEFERRED with band header dividers and left-rail color coding
- **Live 1s countdown tickers** -- `setInterval` updating `textContent` every 1000ms; `_cdMap` keyed by username avoids stale closures
- **Staged Fire-Now confirm gate** -- 2-click, 3s auto-revert (v1 B.6)
- **Cancel All** -- single-action cancellation of every waiting entry via `withUndo` loop
- **Row removal animation** -- CSS `gam-dr-row-out` keyframe collapse

### What was explicitly deferred

The H.6 comment reads verbatim:
> Deferred to v10.12.1: batch ops, inline reason edit, undo countdown toast.

None of the three deferred items shipped. v10.12.1 through v10.12.3 contained no DR popover patches (verified by absence of `_showDrPopover` changes in those tag ranges). These gaps carry forward to v10.13.

### Gap analysis: v1 spec vs v10.12.0 actual

| v1 Feature | Spec section | Shipped? | Notes |
|---|---|---|---|
| Sort soonest-first | B.4 | YES | Line 18008 |
| Live countdown tickers (1s) | B.3 | YES | `_cdMap` + `setInterval` |
| IMMINENT/TODAY/DEFERRED bands | B.4 | YES | Band headers + left rail |
| Band-promote animation (TODAY->IMMINENT) | B.4 + E | NO | Tick only updates text; band class not re-evaluated on tick |
| Staged Fire-Now confirm (2-click, 3s) | B.6 | YES | Timer correct |
| Cancel All | B.5 | YES | Sort bar, `withUndo` per entry |
| Batch mode toggle | B.5 | NO | Deferred |
| Per-row checkbox multi-select | B.5 | NO | Deferred |
| Batch cancel selected | B.5 | NO | Deferred |
| Batch fire selected | B.5 | NO | Deferred |
| Undo toast with countdown button | B.7 | NO | Deferred -- `withUndo` wired but invisible |
| Inline reason click-to-edit | B.8 | NO | Deferred |
| Expand panel (profile link, delay meta) | B.2/D | NO | Profile btn removed but no expand affordance shipped |
| Profile button removed from primary strip | B.2 | YES (sort of) | Profile button gone entirely; no expand added |
| Title live-update on fire/cancel | A (F9) | PARTIAL | Cancel updates title; fire-now removal also updates (line 18227) |
| Band-promote flash animation | E | NO | CSS class `just-promoted` defined in spec, not in shipped CSS |
| Row expand/collapse toggle | B.2/D | NO | No expand button shipped |

### v10.12.0 -- New issues not in v1 spec

**N1 -- Band classification is snapshot-only.** `_updateCountdown()` updates the countdown text and urgency CSS class on the `cdEl` span, but it never re-evaluates the row's band membership (`band-imminent` / `band-today` / `band-deferred` class on the `.gam-dr-row` div). A TODAY entry that crosses the 60-minute threshold visually ticks down to `FIRES IN 00:59` in amber (urg-imminent color), but its row background stays TODAY-colored and it remains physically positioned under the TODAY band header. The urgency color and the band context are now contradicting each other. This is the most glaring live UX bug in the shipped implementation.

**N2 -- Cancel All has no confirm gate.** Fire-Now (single-entry) has a 2-click 3s confirm. Cancel All (all entries) has zero confirm -- one click immediately fires `removeFromDeathRow` for every row. Accidental Cancel All during a panic DR review is unrecoverable within the 10s undo window if there are >5 entries (withUndo fires synchronously per row but each creates a separate undo item; the batch undo requires N separate undo pops). The feature is correct in implementation but the UX affordance is mismatched with its destructive scope.

**N3 -- Cancel All `withUndo` inverse has a data capture bug.** The Cancel All handler at line 18264 uses `drList.find(d => d.username === uname)` to locate the entry for the undo inverse. `drList` is the snapshot taken at popover-open time (before any inline cancels). If a mod cancels individual entries before clicking Cancel All, `drList` still contains those already-removed entries, and the `find()` call will locate them -- causing `addToDeathRow` in the undo inverse to re-add an entry that was manually removed and should stay removed.

**N4 -- `_cdMap` keyed by username, not by DR entry ID.** If a username appears twice in DR (should not happen, but no dedup guard exists in `addToDeathRow`), the second entry overwrites the first in `_cdMap`. The second entry's timer updates correctly but the first entry's `cdEl` reference is lost and the first row's countdown freezes.

**N5 -- No visual undo affordance.** `withUndo` is correctly wired on Cancel, but the snack message at line 18196 reads "removed from Death Row" with no hint that UNDO is available. Undo exists in the global undo stack but is invisible to the mod unless they happen to know the keyboard shortcut. This was the v1 spec's B.7 requirement and is the most impactful invisible feature in the extension.

**N6 -- Countdown granularity cliff at the IMMINENT/TODAY boundary.** The format function (line 18062-18067) switches from `MM:SS` to `Xh Ym` at exactly 60 minutes. A TODAY entry at `60:01` shows `1h 0m` (amber). Thirty seconds later, when it crosses into IMMINENT, it shows `59:31` in the `MM:SS` format. This is technically correct but creates a jarring visual jump from relative (`h m`) to absolute (`MM:SS`) format at the moment of highest urgency transition.

**N7 -- Empty state uses `gamMakeEmpty()` helper (line 18114).** This function is called with `icon: 'dr-empty'` -- an icon key that does not appear to exist in the `gamMakeEmpty` registry (confirmed by grep: `dr-empty` appears only at this call site, not in any icon map). Behavior when DR is empty is unknown -- likely falls back to a generic empty state or throws a silent error.

---

## B. Redesign -- v10.13 Targets

### B.1 Design direction -- Operations Console, Not a List

The v10.12.0 popover reads like a styled list. It needs to read like a **live execution monitor**. The distinction is not cosmetic: an execution monitor communicates state change in real-time, surfaces the most critical item without requiring the operator to process all items, and makes the most destructive action the hardest to trigger accidentally.

Bloomberg terminal aesthetic: every pixel earns its rent. No decorative whitespace. Countdown in tabular-numeral monospace that ticks visibly. Urgency communicated by multiple redundant channels (color, position, pulse animation, band label) so it reads at peripheral vision.

### B.2 v10.13 feature set

**Carry from v10.12.0 (unchanged):**
- Sort soonest-first
- Live 1s countdowns
- Staged Fire-Now confirm (2-click, 3s)
- Row removal animation
- Cancel button + withUndo wiring

**Fix (bugs from Section A):**
- N1: Band re-evaluation on tick -- when a row crosses the band threshold, trigger `_renderDrBands()` to reposition it
- N2: Cancel All confirm gate -- 2-click confirm matching Fire-Now pattern
- N3: Cancel All undo inverse snapshot fix -- snapshot entries at cancel time, not popover-open time
- N4: Username dedup guard in `_cdMap` -- key by `username + executeAt` to handle theoretical duplicates
- N6: Countdown format smoothing -- use `MM:SS` from 90 minutes down (not 60) to avoid the sudden format jump at the exact band boundary

**Ship (previously deferred):**
- Batch mode: per-row checkboxes, batch cancel, batch fire with confirm
- Undo toast: surfaced undo button after cancel with 10s countdown
- Cancel All confirm gate (fix N2, ships as part of batch bar)

**Defer to v10.14 (new defer list):**
- Inline reason click-to-edit (B.8 from v1) -- correctness risk: reason field format not fully understood from modtools.js grep; needs separate audit
- Row expand panel -- nice-to-have; profile link accessible via username href already
- Band-promote flash animation -- CSS polish, not functional

### B.3 Countdown format v2

| Time remaining | Format | Color class | Band |
|---|---|---|---|
| <= 0 | `FIRING` | `urg-critical` (pulse) | imminent |
| 0-59s | `00:SS` | `urg-critical` (pulse) | imminent |
| 1-10min | `MM:SS` | `urg-critical` | imminent |
| 10-90min | `MM:SS` | `urg-imminent` | imminent (<60min) / today (60-90min) |
| 90min-6h | `Xh Ym` | `urg-today` | today |
| 6h-24h | `Xh Ym` | `urg-today` (dimmer) | today |
| >24h | `Xd Yh` | `urg-deferred` | deferred |

The key change: `MM:SS` format now spans down to 90 minutes (not 60). This eliminates the jarring `1h 0m` -> `59:31` format flip at the exact band boundary. A row at 61 minutes shows `61:00` (still MM:SS, still in TODAY band), smoothly ticking to `59:59` when it crosses to IMMINENT and the band re-render fires.

### B.4 Band re-evaluation on tick

In `_updateCountdown()`, after updating the countdown text, compare the new band classification against the stored band in `_cdMap`. If it has changed:

```
1. Mark the row for band promotion (add `.just-promoted` class)
2. Call `_renderDrBands(currentDrList)` -- rebuilds band DOM
3. _renderDrBands rebuilds _cdMap from scratch
```

`_renderDrBands()` is called at most once per band-crossing event per entry. Typical DR queue has 3-10 entries; band crossings are rare (once per entry per session). Zero performance concern.

### B.5 Batch operations

Batch mode activates via a `[BATCH]` toggle in the header OR by clicking any row checkbox (auto-activates). In batch mode:

- All row checkboxes become visible (`display: block`)
- Batch bar slides in at the bottom (above footer)
- `[N SELECTED]  [CANCEL SELECTED]  [FIRE SELECTED]  [CLEAR]`

**Batch Cancel Selected:**
1. One click -- fires `removeFromDeathRow(username)` + `withUndo` for each selected username in order
2. Single snack: `N entries removed from Death Row [UNDO 10s]` (undo toast)
3. Each row animates out

**Batch Fire Selected:**
1. Click `[FIRE SELECTED]` -- batch bar morphs to confirm bar: `FIRE N BANS NOW?  [CONFIRM FIRE]  [CANCEL]`
2. `[CONFIRM FIRE]` calls `_drExecuteNow` for each selected in sequence
3. Errors surface per-entry via snack; successful entries animate out
4. During confirm-pending state: outside-click handler is paused (popover stays open)

**Cancel All (revised with confirm):**
The existing Cancel All button in the sort bar stays, but now requires a 2-step confirm identical to Fire-Now: click -> `CANCEL ALL? [CONFIRM]` with 3s auto-revert. This directly fixes N2.

### B.6 Undo toast

After any single-entry Cancel:

```
snack element content:
  [✓ shill_larry_99 removed from Death Row]  [UNDO  8s]
```

The `[UNDO Ns]` button counts down from 10. Clicking before 0 calls the `withUndo` inverse synchronously. After 0, button disappears and the snack auto-dismisses.

Implementation: the existing `snack()` helper does not support action buttons natively. Options:
- **Option A:** Extend `snack()` with an optional `{ actionLabel, onAction, duration }` param -- clean, reusable
- **Option B:** Inline a custom snack element for this case only -- simpler, no other callers need it

Recommendation: Option A. The undo toast pattern will appear in queue popover cancels and potentially ban cancels. The `snack()` helper extension is 20 lines and pays for itself across multiple call sites.

---

## C. Click Reduction Matrix (v10.12.0 vs v10.13)

| Outcome | v10.12.0 clicks | v10.13 clicks | Delta |
|---|---|---|---|
| See most urgent entry | 1 (top of list) | 1 | -- |
| Read live time-to-fire | 0 (ticks in place) | 0 | -- |
| Know a band crossed threshold | Manual (no reposition) | 0 (auto-rerender) | eliminated |
| Cancel one entry + undo if mistake | 2 + 5 (undo stack) | 2 + 1 (UNDO toast btn) | -4 |
| Cancel All with confirm | 1 (no confirm!) | 3 (click + confirm + ok) | +2 (safety trade) |
| Cancel 3 of 6 entries | 3x Cancel = 3 | check 3 + Cancel selected = 4 | +1 (precision trade) |
| Cancel all 6 entries | Cancel All = 1 | Cancel All + confirm = 3 | +2 (safety trade) |
| Batch undo 3 cancels | 3x undo stack pops | 1 (single UNDO toast) | -2 |
| Fire selected 2 entries | 2x (Fire Now + Confirm) = 4 | check 2 + Fire selected + Confirm = 4 | -- |
| Discover UNDO exists | Never (invisible) | 0 (toast surfaces it) | eliminated friction |

Net: the two cases where v10.13 adds clicks (Cancel All confirm, batch cancel vs individual) are intentional safety additions. All capability losses are recovered by the undo toast. The UX debt from invisible `withUndo` is paid off.

---

## D. Visual Mockup (ASCII)

### Default state -- 4 pending, no batch

```
+======================================================+
| [skull] DEATH ROW  4 PENDING       [BATCH]       [x] |
+------------------------------------------------------+
| FIRES FIRST  *  [CANCEL ALL?]                        |
+------------------------------------------------------+
|  IMMINENT -----------------------------------------  |  <- #ff3b3b header
| [skull] shill_larry_99      FIRES IN  08:47          |
|         shill posting . iran narrative drops          |
|         queued 15h ago  **  [FIRE NOW]  [Cancel]     |
+------------------------------------------------------+
|  TODAY ---------------------------------------------  |  <- #ffd84d header
| [skull] glowie_throwaway    FIRES IN   6h 12m        |
|         new acct; 40 cmts/24h                        |
|         queued 90m ago  **  [FIRE NOW]  [Cancel]     |
|                                                      |
| [skull] newshill_bot        FIRES IN  14h 05m        |
|         copy-paste narrative drops                   |
|         queued 10h ago  **  [FIRE NOW]  [Cancel]     |
+------------------------------------------------------+
|  DEFERRED ------------------------------------------  |  <- #5a5752 header
| [skull] tardbot_2026        FIRES IN   3d 14h        |
|         auto-DR rule 7 match                         |
|         queued 6h ago   **  [FIRE NOW]  [Cancel]     |
+------------------------------------------------------+
| Open full Death Row view ->                          |
+======================================================+
```

### Fire-Now staged confirm (single entry)

```
| [skull] shill_larry_99      FIRES IN  08:12          |
|         shill posting . iran narrative drops          |
|         queued 15h ago  **  [CONFIRM > 3s]  [Cancel] |
```

`[CONFIRM > 3s]` pulses amber->orange, countdown ticks in label, auto-reverts to `[FIRE NOW]` at 0.

### Cancel All -- confirm gate (N2 fix)

Sort bar transforms:

```
| FIRES FIRST  *  [CANCEL ALL? CONFIRM  3s]  [x abort] |
```

Auto-reverts after 3s. `[x abort]` immediately cancels the confirm state and restores `[CANCEL ALL?]`.

### Batch mode -- 2 selected

```
+======================================================+
| [skull] DEATH ROW  4 PENDING      [BATCH ON]     [x] |
+------------------------------------------------------+
| FIRES FIRST  *  [CANCEL ALL?]                        |
+------------------------------------------------------+
|  IMMINENT -----------------------------------------  |
|[X] [skull] shill_larry_99   FIRES IN  07:51          |
|            shill posting . iran narrative drops       |
|            queued 15h ago                            |
+------------------------------------------------------+
|  TODAY ---------------------------------------------  |
|[X] [skull] glowie_throwaway FIRES IN   6h 09m        |
|            new acct, 40 cmts/24h                     |
|            queued 90m ago                            |
|                                                      |
|[ ] [skull] newshill_bot     FIRES IN  14h 02m        |
|            copy-paste narrative drops                |
+------------------------------------------------------+
|  DEFERRED ------------------------------------------  |
|[ ] [skull] tardbot_2026     FIRES IN   3d 14h        |
+------------------------------------------------------+
| 2 SELECTED  [CANCEL SELECTED]  [FIRE SELECTED]  [x] |
+------------------------------------------------------+
| Open full Death Row view ->                          |
+======================================================+
```

### Batch Fire -- confirm gate

Batch bar morphs inline:

```
| FIRE 2 BANS NOW?  [CONFIRM FIRE]  [CANCEL]           |
```

`[CONFIRM FIRE]` is red, pulsing. No auto-revert (deliberate: batch fire is high-consequence, operator must explicitly cancel). Outside-click handler suspended until resolved.

### Undo toast (after single Cancel)

```
snack: [✓ shill_larry_99 removed from Death Row] [UNDO 9s]
```

The `[UNDO 9s]` label counts down. Clicking calls the withUndo inverse. Toast dismisses at 0 or after click.

---

## E. CSS Spec (delta from v10.12.0)

Changes are additive relative to the shipped `gam-dr-popover-css` block. Lines that already exist in v10.12.0 are noted as EXISTING.

```css
/* EXISTING -- kept as-is */
.gam-dr-band-hdr { ... }
.gam-dr-band-hdr.band-imminent { color: #ff3b3b; background: rgba(255,59,59,0.06); }
.gam-dr-band-hdr.band-today    { color: #ffd84d; background: rgba(255,216,77,0.04); }
.gam-dr-band-hdr.band-deferred { color: #5a5752; }
.gam-dr-row.band-imminent      { border-left-color: #ff3b3b; background: rgba(255,59,59,0.03); }
.gam-dr-row.band-today         { border-left-color: #ffd84d; }
.gam-dr-row.band-deferred      { border-left-color: #2a2825; }
.gam-dr-countdown.urg-critical { color: #ff3b3b; animation: gam-dr-cd-pulse 1s ease-in-out infinite; }
.gam-dr-countdown.urg-imminent { color: #ff6b35; }
.gam-dr-countdown.urg-today    { color: #ffd84d; }
.gam-dr-countdown.urg-deferred { color: #5a5752; }

/* NEW -- Batch mode */
.gam-dr-batch-toggle {
  background: transparent;
  border: 1px solid #3d3a35;
  color: #5a5752;
  padding: 1px 6px;
  cursor: pointer;
  font: 600 8px ui-monospace, monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: border-color 80ms, color 80ms;
}
.gam-dr-batch-toggle.active {
  border-color: #ffd84d;
  color: #ffd84d;
}

/* NEW -- Per-row checkbox (hidden until batch mode) */
.gam-dr-checkbox {
  width: 12px;
  height: 12px;
  cursor: pointer;
  accent-color: #ffd84d;
  flex-shrink: 0;
  display: none;
}
.gam-dr-popover-batch .gam-dr-checkbox {
  display: inline-block;
}

/* NEW -- Batch bar (slides in above footer) */
.gam-dr-batch-bar {
  background: #0a0a0b;
  border-top: 1px solid #2a2825;
  padding: 4px 10px;
  display: none;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  letter-spacing: 0.05em;
}
.gam-dr-batch-bar.visible {
  display: flex;
}
.gam-dr-batch-count {
  color: #ffd84d;
  font-weight: 700;
}
.gam-dr-batch-cancel-btn {
  border-color: #ff9933;
  color: #ff9933;
}
.gam-dr-batch-fire-btn {
  border-color: #ff3b3b;
  color: #ff3b3b;
}
.gam-dr-batch-clear-btn {
  margin-left: auto;
  border-color: #3d3a35;
  color: #5a5752;
}

/* NEW -- Cancel All confirm state (sort bar morphs) */
.gam-dr-cancel-all-btn.confirming {
  border-color: #ff9933;
  color: #ff9933;
  animation: gam-dr-cd-pulse 0.7s ease-in-out infinite;
}
.gam-dr-cancel-all-abort {
  background: transparent;
  border: none;
  color: #5a5752;
  cursor: pointer;
  font: 9px ui-monospace, monospace;
  padding: 0 4px;
  display: none;
}
.gam-dr-cancel-all-btn.confirming ~ .gam-dr-cancel-all-abort {
  display: inline;
}

/* NEW -- Band-promote flash (N1 fix -- fires when _renderDrBands re-inserts row) */
@keyframes gam-dr-band-promote {
  0%   { background: rgba(255, 59, 59, 0); }
  20%  { background: rgba(255, 59, 59, 0.20); }
  100% { background: rgba(255, 59, 59, 0.03); }
}
.gam-dr-row.just-promoted {
  animation: gam-dr-band-promote 900ms ease-out forwards;
}

/* NEW -- Undo toast action button (extends snack pattern) */
.gam-snack-action-btn {
  background: transparent;
  border: none;
  color: #ffd84d;
  font: 700 9px ui-monospace, monospace;
  letter-spacing: 0.06em;
  text-decoration: underline;
  cursor: pointer;
  padding: 0 0 0 8px;
  white-space: nowrap;
}
.gam-snack-action-countdown {
  color: #9b9892;
  font-size: 9px;
}
```

---

## F. HTML Structure (annotated, v10.13 target)

The popover DOM structure in `_showDrPopover` should produce this shape. Annotated as what the JavaScript createElement calls should build -- not literal HTML (the function uses DOM API, not innerHTML).

```html
<div id="gam-dr-popover">

  <!-- Header -->
  <div class="gam-dr-hdr">
    <span class="gam-dr-title">[skull] DEATH ROW  N PENDING</span>
    <button class="gam-dr-batch-toggle">BATCH</button>
    <button class="gam-dr-close" aria-label="Close">x</button>
  </div>

  <!-- Sort/action bar -->
  <div class="gam-dr-sortbar">
    <span>FIRES FIRST</span>
    <button class="gam-dr-cancel-all-btn">CANCEL ALL?</button>
    <!-- injected when confirming: -->
    <button class="gam-dr-cancel-all-abort" style="display:none">x abort</button>
  </div>

  <!-- Scrollable body -->
  <div class="gam-dr-body">

    <!-- Band header (rendered only if band has entries) -->
    <div class="gam-dr-band-hdr band-imminent">IMMINENT</div>

    <!-- Row (one per entry) -->
    <div class="gam-dr-row band-imminent" data-dr-row="username">

      <!-- Line 1: checkbox + skull + username + countdown -->
      <div class="gam-dr-row-l1">
        <input type="checkbox" class="gam-dr-checkbox">
        <span>[skull]</span>
        <a class="gam-dr-username" href="/u/username" target="_blank">username</a>
        <span class="gam-dr-countdown urg-critical">FIRES IN 08:47</span>
      </div>

      <!-- Line 2: reason (truncated 70 chars) -->
      <div class="gam-dr-reason">reason text here...</div>

      <!-- Line 3: queued time + buttons -->
      <div class="gam-dr-row-l3">
        <span class="gam-dr-queued-time">queued 15h ago</span>
        <button class="gam-dr-btn gam-dr-btn-cancel">Cancel</button>
        <button class="gam-dr-btn gam-dr-btn-fire">FIRE NOW</button>
      </div>

    </div><!-- /.gam-dr-row -->

    <!-- Band header TODAY -->
    <div class="gam-dr-band-hdr band-today">TODAY</div>
    <!-- ...more rows... -->

    <!-- Band header DEFERRED -->
    <div class="gam-dr-band-hdr band-deferred">DEFERRED</div>
    <!-- ...more rows... -->

  </div><!-- /.gam-dr-body -->

  <!-- Batch bar (hidden until batch mode active + selection > 0) -->
  <div class="gam-dr-batch-bar">
    <span class="gam-dr-batch-count">0 SELECTED</span>
    <button class="gam-dr-btn gam-dr-batch-cancel-btn">CANCEL SELECTED</button>
    <button class="gam-dr-btn gam-dr-batch-fire-btn">FIRE SELECTED</button>
    <button class="gam-dr-btn gam-dr-batch-clear-btn">x</button>
  </div>

  <!-- Footer -->
  <div class="gam-dr-footer">
    <a href="/users?tab=deathrow" target="_blank" rel="noopener">
      Open full Death Row view ->
    </a>
  </div>

</div><!-- /#gam-dr-popover -->
```

Key structural changes from v10.12.0:
- `[BATCH]` button added to header (was absent)
- `gam-dr-cancel-all-btn` is now a `CANCEL ALL?` first-stage button (not direct action)
- `gam-dr-cancel-all-abort` sibling for abort during confirm state
- `gam-dr-checkbox` input inside each row's l1 (hidden by default, shown via `.gam-dr-popover-batch` class on `#gam-dr-popover`)
- `gam-dr-batch-bar` div is a new child of the popover (above footer, below body)
- Batch bar contains its own confirm state management (morphs into `FIRE N BANS NOW?` row)

---

## G. JavaScript Spec (delta patches)

These are surgical changes to the existing `_showDrPopover` function body. Line numbers reference v10.12.0 source for orientation; the actual implementation will adjust for any preceding edits.

### G.1 Fix N1 -- Band re-evaluation on tick

**Current** `_updateCountdown` (L18102-18106):
```js
function _updateCountdown(username, cdEl, executeAt) {
  const fmt = _drFormatCountdown(executeAt);
  cdEl.textContent = 'FIRES IN ' + fmt.text;
  cdEl.className = 'gam-dr-countdown ' + fmt.cls;
}
```

**Replace with:**
```js
function _updateCountdown(username, cdEl, executeAt) {
  const fmt = _drFormatCountdown(executeAt);
  cdEl.textContent = 'FIRES IN ' + fmt.text;
  cdEl.className = 'gam-dr-countdown ' + fmt.cls;
  // N1 fix: re-evaluate band membership; rerender if band changed
  const entry = _cdMap[username];
  if (entry && entry.band && entry.band !== fmt.band) {
    entry.band = fmt.band;
    // Rebuild band DOM; _renderDrBands resets _cdMap so exit after
    var currentList = getDeathRow()
      .filter(function(d) { return d && d.status === 'waiting'; })
      .sort(function(a, b) { return (a.executeAt || 0) - (b.executeAt || 0); });
    _renderDrBands(currentList);
    return;
  }
}
```

**`_cdMap` entry shape change** -- add `band` field when populating:
```js
// existing line 18155, add band:
_cdMap[username] = { cdEl: cdEl, executeAt: executeAt, band: fmt.band };
```

### G.2 Fix N3 -- Cancel All snapshot capture at cancel time

**Current** (L18262-18281): iterates `pop.querySelectorAll('[data-dr-row]')` and uses `drList.find()` for the undo inverse. `drList` is stale.

**Replace** the `cancelAllBtn` event listener with:
```js
cancelAllBtn.addEventListener('click', function() {
  if (!cancelAllBtn.classList.contains('confirming')) {
    // Stage 1: show confirm
    cancelAllBtn.classList.add('confirming');
    cancelAllBtn.textContent = 'CANCEL ALL? CONFIRM  3s';
    cancelAllAbortBtn.style.display = 'inline';
    var _confirmTimer = setTimeout(function() {
      cancelAllBtn.classList.remove('confirming');
      cancelAllBtn.textContent = 'CANCEL ALL?';
      cancelAllAbortBtn.style.display = 'none';
    }, 3000);
    cancelAllBtn._confirmTimer = _confirmTimer;
  } else {
    // Stage 2: execute
    clearTimeout(cancelAllBtn._confirmTimer);
    cancelAllBtn.classList.remove('confirming');
    cancelAllBtn.textContent = 'CANCEL ALL?';
    cancelAllAbortBtn.style.display = 'none';
    // N3 fix: snapshot live entries at cancel time, not popover-open time
    var liveEntries = getDeathRow().filter(function(d) { return d && d.status === 'waiting'; });
    var allRows = pop.querySelectorAll('[data-dr-row]');
    allRows.forEach(function(row) {
      var uname = row.getAttribute('data-dr-row');
      if (!uname) return;
      var liveEntry = liveEntries.find(function(d) { return d && d.username === uname; });
      if (!liveEntry) return; // already removed inline; skip
      try {
        withUndo(function() { removeFromDeathRow(uname); return Promise.resolve(); }, {
          tier: 'B', label: 'DR cancel ' + uname,
          inverse: function() {
            if (liveEntry.delayMs) addToDeathRow(uname, liveEntry.delayMs, liveEntry.reason || '');
            return Promise.resolve();
          }
        });
      } catch(_) {}
      row.classList.add('removing');
    });
    setTimeout(function() {
      pop.querySelectorAll('.gam-dr-row.removing').forEach(function(r) { r.remove(); });
      title.textContent = '\u{1F480} DEATH ROW  0 PENDING';
      try { snack('All Death Row entries cancelled', 'success'); } catch(_) {}
    }, 250);
  }
});

cancelAllAbortBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  clearTimeout(cancelAllBtn._confirmTimer);
  cancelAllBtn.classList.remove('confirming');
  cancelAllBtn.textContent = 'CANCEL ALL?';
  cancelAllAbortBtn.style.display = 'none';
});
```

### G.3 Undo toast -- extend snack()

Locate the `snack()` helper (search: `function snack(`). Add an optional third param:

```js
// snack(message, type, opts)
// opts: { actionLabel, onAction, actionDurationMs }
// If opts provided, appends an action button with countdown to the snack element.
```

Inside `snack()`, after the snack element is built and before appending:
```js
if (opts && opts.actionLabel && typeof opts.onAction === 'function') {
  var dur = opts.actionDurationMs || 10000;
  var actionBtn = document.createElement('button');
  actionBtn.className = 'gam-snack-action-btn';
  var _remaining = Math.round(dur / 1000);
  actionBtn.textContent = opts.actionLabel + ' ' + _remaining + 's';
  var _actionTick = setInterval(function() {
    _remaining--;
    if (_remaining <= 0) {
      clearInterval(_actionTick);
      actionBtn.remove();
      return;
    }
    actionBtn.textContent = opts.actionLabel + ' ' + _remaining + 's';
  }, 1000);
  actionBtn.addEventListener('click', function() {
    clearInterval(_actionTick);
    opts.onAction();
    // dismiss snack early
    if (snackEl.parentNode) snackEl.parentNode.removeChild(snackEl);
  });
  snackEl.appendChild(actionBtn);
}
```

**Cancel button updated** to use the extended snack:
```js
// Replace line 18196:
try {
  snack(
    '✓ ' + username + ' removed from Death Row',
    'success',
    {
      actionLabel: 'UNDO',
      actionDurationMs: 10000,
      onAction: function() {
        if (entry.delayMs) addToDeathRow(username, entry.delayMs, reason);
      }
    }
  );
} catch(_) {}
```

### G.4 Batch mode

Add after the `sortBar` DOM construction (around L18092):

```js
// Batch mode state
var _batchMode = false;
var _batchSelected = new Set();

// Batch toggle button (added to header alongside closeBtn)
var batchToggleBtn = document.createElement('button');
batchToggleBtn.className = 'gam-dr-batch-toggle';
batchToggleBtn.textContent = 'BATCH';
hdr.insertBefore(batchToggleBtn, closeBtn);

// Abort button for Cancel All confirm (sibling to cancelAllBtn)
var cancelAllAbortBtn = document.createElement('button');
cancelAllAbortBtn.className = 'gam-dr-cancel-all-abort';
cancelAllAbortBtn.textContent = 'x abort';
cancelAllAbortBtn.style.display = 'none';
sortBar.appendChild(cancelAllAbortBtn);

// Batch bar (between body and footer)
var batchBar = document.createElement('div');
batchBar.className = 'gam-dr-batch-bar';
var batchCountEl = document.createElement('span');
batchCountEl.className = 'gam-dr-batch-count';
batchCountEl.textContent = '0 SELECTED';
var batchCancelBtn = document.createElement('button');
batchCancelBtn.className = 'gam-dr-btn gam-dr-batch-cancel-btn';
batchCancelBtn.textContent = 'CANCEL SELECTED';
var batchFireBtn = document.createElement('button');
batchFireBtn.className = 'gam-dr-btn gam-dr-batch-fire-btn';
batchFireBtn.textContent = 'FIRE SELECTED';
var batchClearBtn = document.createElement('button');
batchClearBtn.className = 'gam-dr-btn gam-dr-batch-clear-btn';
batchClearBtn.textContent = 'x';
batchBar.appendChild(batchCountEl);
batchBar.appendChild(batchCancelBtn);
batchBar.appendChild(batchFireBtn);
batchBar.appendChild(batchClearBtn);
// Insert before footer (append after body, before foot)

function _setBatchMode(on) {
  _batchMode = on;
  if (on) {
    pop.classList.add('gam-dr-popover-batch');
    batchToggleBtn.classList.add('active');
    batchToggleBtn.textContent = 'BATCH ON';
    batchBar.classList.add('visible');
  } else {
    pop.classList.remove('gam-dr-popover-batch');
    batchToggleBtn.classList.remove('active');
    batchToggleBtn.textContent = 'BATCH';
    batchBar.classList.remove('visible');
    _batchSelected.clear();
    _updateBatchBar();
    // uncheck all
    pop.querySelectorAll('.gam-dr-checkbox').forEach(function(cb) { cb.checked = false; });
  }
}

function _updateBatchBar() {
  var n = _batchSelected.size;
  batchCountEl.textContent = n + ' SELECTED';
  batchCancelBtn.disabled = n === 0;
  batchFireBtn.disabled = n === 0;
  if (n > 0 && !_batchMode) _setBatchMode(true);
}

batchToggleBtn.addEventListener('click', function() {
  _setBatchMode(!_batchMode);
});

batchClearBtn.addEventListener('click', function() {
  _setBatchMode(false);
});

// Checkbox wiring (called from addEntry, which already exists in _renderDrBands):
// Inside addEntry(), after row construction, add:
//   var cb = document.createElement('input');
//   cb.type = 'checkbox'; cb.className = 'gam-dr-checkbox';
//   cb.addEventListener('change', function() {
//     if (cb.checked) { _batchSelected.add(username); if (!_batchMode) _setBatchMode(true); }
//     else { _batchSelected.delete(username); }
//     _updateBatchBar();
//   });
//   line1.insertBefore(cb, skullEl); // before skull, at leftmost position

// Batch Cancel handler
batchCancelBtn.addEventListener('click', function() {
  var toCancel = Array.from(_batchSelected);
  toCancel.forEach(function(uname) {
    var entry = drList.find(function(d) { return d && d.username === uname; });
    var row = pop.querySelector('[data-dr-row="' + uname + '"]');
    if (!row) return;
    try {
      withUndo(function() { removeFromDeathRow(uname); return Promise.resolve(); }, {
        tier: 'B', label: 'DR cancel ' + uname,
        inverse: function() {
          if (entry && entry.delayMs) addToDeathRow(uname, entry.delayMs, entry.reason || '');
          return Promise.resolve();
        }
      });
      row.classList.add('removing');
    } catch(_) {}
  });
  setTimeout(function() {
    pop.querySelectorAll('.gam-dr-row.removing').forEach(function(r) { r.remove(); });
    title.textContent = '\u{1F480} DEATH ROW  ' + pop.querySelectorAll('[data-dr-row]').length + ' PENDING';
    try {
      snack('✓ ' + toCancel.length + ' entries removed from Death Row', 'success');
    } catch(_) {}
  }, 240);
  _setBatchMode(false);
});

// Batch Fire handler -- morphs batch bar into confirm bar
batchFireBtn.addEventListener('click', function() {
  if (batchFireBtn.classList.contains('confirming')) return;
  batchFireBtn.classList.add('confirming');
  var n = _batchSelected.size;
  // Morph batch bar content
  batchBar.innerHTML = '';
  var confirmMsg = document.createElement('span');
  confirmMsg.style.cssText = 'color:#ff6b35;font-weight:700;flex:1';
  confirmMsg.textContent = 'FIRE ' + n + ' BANS NOW?';
  var confirmFireBtn = document.createElement('button');
  confirmFireBtn.className = 'gam-dr-btn gam-dr-batch-fire-btn';
  confirmFireBtn.textContent = 'CONFIRM FIRE';
  var cancelConfirmBtn = document.createElement('button');
  cancelConfirmBtn.className = 'gam-dr-btn gam-dr-batch-clear-btn';
  cancelConfirmBtn.textContent = 'CANCEL';
  batchBar.appendChild(confirmMsg);
  batchBar.appendChild(confirmFireBtn);
  batchBar.appendChild(cancelConfirmBtn);
  // Pause outside-click during confirm (R3 from v1)
  var _origOutsideClick = _outsideClick;
  _outsideClick = null;
  confirmFireBtn.addEventListener('click', function() {
    _outsideClick = _origOutsideClick; // restore
    var toFire = Array.from(_batchSelected);
    toFire.forEach(function(uname) {
      var row = pop.querySelector('[data-dr-row="' + uname + '"]');
      var entry = drList.find(function(d) { return d && d.username === uname; });
      var reason = (entry && entry.reason) || '';
      _drExecuteNow(uname, reason).then(function() {
        if (row) { row.classList.add('removing'); setTimeout(function() { row.remove(); }, 220); }
      }).catch(function(err) {
        try { snack('Fire failed for ' + uname + ': ' + (err && err.message || err), 'error'); } catch(_) {}
      });
    });
    setTimeout(function() {
      title.textContent = '\u{1F480} DEATH ROW  ' + pop.querySelectorAll('[data-dr-row]').length + ' PENDING';
    }, 260);
    _setBatchMode(false);
  });
  cancelConfirmBtn.addEventListener('click', function() {
    _outsideClick = _origOutsideClick; // restore
    _setBatchMode(false);
    // Rebuild batch bar from scratch
    // simplest: close and reopen batch mode
    // Actually: just call _setBatchMode(false) which clears the bar, done.
  });
});
```

### G.5 Fix N6 -- Countdown format smoothing (90min boundary)

**Replace** `_drFormatCountdown` lines 18062-18064 (the IMMINENT thresholds):

```js
// OLD:
if (secs < 60) { return { text: '00:' + String(secs).padStart(2,'0'), cls: 'urg-critical', band: 'imminent' }; }
if (mins < 10) { return { text: String(Math.floor(mins)).padStart(2,'0') + ':' + String(secs % 60).padStart(2,'0'), cls: 'urg-critical', band: 'imminent' }; }
if (mins < 60) { return { text: String(mins).padStart(2,'0') + ':' + String(secs % 60).padStart(2,'0'), cls: 'urg-imminent', band: 'imminent' }; }
if (hrs < 6)  { return { text: hrs + 'h ' + (mins % 60) + 'm', cls: 'urg-today', band: 'today' }; }
if (hrs < 24) { return { text: hrs + 'h ' + (mins % 60) + 'm', cls: 'urg-today', band: 'today' }; }

// NEW (90-min smoothing):
if (secs < 60)  { return { text: '00:' + String(secs).padStart(2,'0'), cls: 'urg-critical', band: 'imminent' }; }
if (mins < 10)  { return { text: String(Math.floor(mins)).padStart(2,'0') + ':' + String(secs % 60).padStart(2,'0'), cls: 'urg-critical', band: 'imminent' }; }
if (mins < 60)  { return { text: String(mins).padStart(2,'0') + ':' + String(secs % 60).padStart(2,'0'), cls: 'urg-imminent', band: 'imminent' }; }
if (mins < 90)  { return { text: String(mins).padStart(2,'0') + ':' + String(secs % 60).padStart(2,'0'), cls: 'urg-today', band: 'today' }; }
if (hrs < 6)    { return { text: hrs + 'h ' + (mins % 60) + 'm', cls: 'urg-today', band: 'today' }; }
if (hrs < 24)   { return { text: hrs + 'h ' + (mins % 60) + 'm', cls: 'urg-today', band: 'today' }; }
```

The 60-90 minute window now renders `MM:SS` (today-colored), transitioning smoothly into the existing IMMINENT `MM:SS` band when it crosses 60 minutes. No format jump at the band boundary.

---

## H. Effort Estimate and Conflicts

### H.1 Effort breakdown (v10.13 delta from v10.12.0)

| Task | Net lines | Risk | Est. time |
|---|---|---|---|
| G.1 -- Band re-eval on tick (N1 fix) | ~20 lines changed | Medium (re-render logic) | 25 min |
| G.2 -- Cancel All confirm gate + N3 snapshot fix | ~45 lines changed | Medium | 35 min |
| G.3 -- snack() undo toast extension | ~30 lines changed | Low | 25 min |
| G.4 -- Batch mode (toggle, checkboxes, bar, cancel, fire) | ~130 lines added | High (most complex) | 90 min |
| G.5 -- Countdown format smoothing (N6 fix) | ~5 lines changed | Low | 10 min |
| CSS additions (E section) | ~80 lines added | Low | 20 min |
| gamMakeEmpty 'dr-empty' icon fix (N7) | ~5 lines | Trivial | 5 min |
| Integration test (manual, ticker visible, batch flow) | -- | -- | 20 min |
| **Total** | **~315 lines net** | | **~3.5h** |

This is roughly half the effort of the v1 full spec (~6.5h) because the hard infrastructure (sort, bands, tickers, Fire-Now confirm, row animation) is already shipped.

### H.2 Risk flags

**R1 -- `_renderDrBands()` re-render on band crossing.** The re-render destroys and rebuilds the body DOM. Any in-progress Fire-Now confirm state on a TODAY->IMMINENT crossing row will be lost (the button reverts to `FIRE NOW`). Mitigation: before re-render, snapshot which rows are currently in `confirming` state and restore the `confirming` class post-render. Acceptable complexity; the event is rare.

**R2 -- Batch bar `_outsideClick` nullification.** G.4 sets `_outsideClick = null` during batch fire confirm to prevent popover from closing. If the mod navigates away from the page during confirm (closes tab), this leaves a dangling interval. Not a correctness issue -- the tab close clears everything. But if the popover's `_closePop` is called by another path (ESC key), `_outsideClick` will be null and `document.removeEventListener('click', null, true)` is a no-op (safe). No issue.

**R3 -- snack() helper location.** The `snack()` function is called throughout modtools.js. Its definition must be located before adding the optional third param. If snack is defined as a const arrow function before the DR popover code, the change is simple. If it is a hoisted function declaration, order doesn't matter. Grep confirms: `function snack(` exists at one location. The third-param extension is backward-compatible (existing callers pass 2 args; opts defaults to undefined).

**R4 -- `gamMakeEmpty` 'dr-empty' icon (N7).** Search `gamMakeEmpty` for the icon registry to determine correct icon key for empty DR state. If no DR-specific icon exists, use `'empty'` or `'queue'` (whatever the queue popover uses). This is a 5-minute fix blocked on a 2-minute grep.

**R5 -- Batch fire: `_drExecuteNow` is not awaited in sequence.** The batch fire handler fires all selected bans in parallel (forEach). This matches existing behavior of individual Fire-Now buttons and is acceptable. If `_drExecuteNow` has server-side rate limiting, parallel fires may hit it. Mitigation: fire in sequence with a 200ms gap if rate limiting becomes an issue. Not a v10.13 blocker.

### H.3 Conflicts with other v10.x work

| Area | Risk | Notes |
|---|---|---|
| `snack()` helper | LOW | Extending with optional third param; backward-compatible; no other v10.x work touches snack() |
| `_renderDrBands()` | LOW | Called only within `_showDrPopover` scope; no external callers |
| `getDeathRow()` / `removeFromDeathRow()` / `addToDeathRow()` | NONE | Read-only access patterns; functions unchanged |
| `withUndo` | NONE | Additional callers only; undo stack behavior unchanged |
| `_cdMap` shape change (add `band` field) | NONE | Internal to `_showDrPopover` closure |
| CSS namespace `gam-dr-*` | NONE | All new classes prefixed correctly; no collision with queue or sus popovers |
| `.gam-dr-popover-batch` class on `#gam-dr-popover` | NONE | New class; no existing rules select it |

No conflicts with any open v10.x design doc. The Queue popover (H.7, `_showQueuePopover`) shares the same CSS injection pattern but uses `gam-queue-*` namespace throughout.

### H.4 Implementation order recommendation

1. G.5 (format smoothing) -- 10 min, zero risk, ships immediately as a standalone fix
2. G.2 (Cancel All confirm + N3) -- 35 min, high safety value
3. G.3 (undo toast) -- 25 min, highest visibility UX gain
4. G.1 (band re-eval on tick) -- 25 min, correctness fix
5. CSS additions for batch -- 20 min, required before G.4
6. G.4 (batch mode) -- 90 min, most complex, ship last

Steps 1-4+CSS can be PRd as `v10.13-dr-fixes` (~115 lines) before batch is complete. Step 6 ships as `v10.13-dr-batch` separately.
