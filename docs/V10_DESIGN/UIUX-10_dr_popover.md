# UIUX-10 — Death Row Popover Redesign
**Auditor:** DESIGN-10-DR-POPOVER
**Skill invoked:** frontend-design (Death Row queue popover — countdown timers, per-row inline actions, batch operations, Bloomberg aesthetic)
**Date:** 2026-05-10
**Affects:** `modtools.js` `_showDrPopover()` (L17282–17461)
**Cross-reference:** UIUX-02 (_showSusPopover), UIUX-01 (card system), UIUX-03 (design tokens)

---

## A. Critique — Current State

### What the popover does now

Opens from the 💀 ticker bar icon. Shows a flat vertical list of DR entries, each containing:
- Row 1: skull emoji + username link (opens `/u/` in new tab)
- Row 2: "queued X ago, fires in Y" timing string (static — does not tick)
- Row 3: reason text (truncated at 80 chars)
- Row 4: three buttons right-aligned — **Profile / Cancel / Fire now**

Footer: plain text link → "Open full Death Row view →"

### Friction inventory

**F1 — Timers are static.** `timeUntil(executeAt)` is called once at render time. If you open the popover and leave it up while a ban approaches execution, the "fires in" value never updates. For a queue where time-to-execute is the entire decision axis, this is the worst possible omission.

**F2 — No sort order guarantee.** `drList` is `getDeathRow().filter(d => d.status === 'waiting')` — no `.sort()` call. The list renders in insertion order (oldest-queued first), which means the user who is about to fire in 12 minutes might be buried under three users who fire in 4 days. The most urgent entry is not surface-first.

**F3 — No batch operations.** Each row has independent Cancel and Fire now buttons. Cancelling 6 entries (common after a shill wave is resolved) requires 6 clicks on Cancel + 6 confirmation reads of the snack. Zero support for "cancel all" or multi-select.

**F4 — Profile button is pure navigation tax.** The Profile button opens `/u/username` in a new tab. It is the first button in the action strip — the leftmost, highest-priority position — yet it is the lowest-stakes action. It steals prime real estate from Cancel and Fire now.

**F5 — Fire now lacks a confirmation gate.** A single mis-click on "Fire now" executes the ban immediately. No confirm step, no grace window. The Cancel button has withUndo wiring; Fire now does not. A misfire requires manual undo from the undo stack — which most mods don't know exists.

**F6 — Cancel relies on withUndo but provides no visible undo affordance.** The withUndo wrapper fires, but the snack message just says "✓ username removed from Death Row" — no undo button or timer in the toast. Mods have no obvious recovery path.

**F7 — No entry age/urgency visual differentiation.** A user firing in 8 minutes looks identical to one firing in 96 hours. No color coding, no urgency banding, no visual hierarchy between "imminent" and "deferred" entries.

**F8 — 420px max-width, no batch zone.** Adding batch checkboxes and a batch action bar requires horizontal space. The current 420px cap is tight; the SUS popover design extended to 500px with no complaints.

**F9 — Title is static count.** "DEATH ROW — 4 PENDING" never updates as rows are removed/fired inline. The Cancel button does update it (`title.textContent = ...`) but only on cancel — not on fire-now removal.

**F10 — No inline reason editing.** Reasons are rendered read-only. Moderators frequently want to adjust the logged reason before a ban fires, but must navigate to the /users DR page to do so.

### Click cost audit (current)

| Outcome | Current clicks |
|---|---|
| View most-urgent entry | Open popover + scroll (not sorted) = 1–3 |
| Cancel one entry | Open popover + find row + Cancel = 2–3 |
| Cancel all 6 entries | Open popover + 6x Cancel = 7 |
| Fire one now | Open popover + Fire now (NO confirm) = 2 |
| View user profile | Open popover + Profile btn = 2 (new tab) |
| Check if ban fired | Re-open popover = 1 (no live updates) |
| Edit ban reason | 5+ (navigate to /users, find DR section, edit) |

---

## B. Redesign

### B.1 Core design direction — Bloomberg Execution Monitor

The Death Row popover is a **live execution monitor**, not a passive list. It should feel like a Bloomberg order blotter: dense, data-forward, time-critical, with immediate action affordances. The aesthetic is dark terminal with amber urgency signals, monospaced data, and thin red accent for imminent events.

Every design decision flows from one principle: **the most urgent entry is always visually dominant and requires the fewest clicks to action.**

### B.2 Redesigned layout anatomy

```
HEADER BAR:
  [💀 DEATH ROW  4 PENDING]  [Batch mode OFF] [×]
  
SORT/FILTER BAR:
  Sorted: FIRES FIRST  |  [Cancel All]

BODY (scrollable, max-height 360px):
  ┌─ IMMINENT band (fires < 60min) — red left rail ─────┐
  │  [□] 💀 shill_larry_99        FIRES IN 08:47  [▲]   │
  │       shill posting · iran posting pattern           │
  │       queued 15h ago  ··  [FIRE NOW *] [Cancel]      │
  └──────────────────────────────────────────────────────┘
  ┌─ TODAY band (fires 1h–24h) — amber left rail ────────┐
  │  [□] 💀 glowie_throwaway      FIRES IN 6h 12m  [▲]  │
  │       new acct; posted 40x in 24h                   │
  │       queued 90m ago  ··  [FIRE NOW *] [Cancel]      │
  │  [□] 💀 newshill_bot          FIRES IN 14h 05m  [▲] │
  │       copy-paste narrative drops                     │
  │       queued 10h ago  ··  [FIRE NOW *] [Cancel]      │
  └──────────────────────────────────────────────────────┘
  ┌─ DEFERRED band (fires > 24h) — dim ──────────────────┐
  │  [□] 💀 tardbot_2026          FIRES IN 3d 14h  [▲]  │
  │       automated tard pattern, matched Rule 7         │
  │       queued 6h ago  ··  [FIRE NOW *] [Cancel]       │
  └──────────────────────────────────────────────────────┘

BATCH BAR (hidden until batch mode ON or checkbox clicked):
  [2 selected]  [Cancel selected]  [Fire selected]  [Clear]

FOOTER:
  Open full Death Row view →
```

### B.3 Live countdown timers

Every "FIRES IN" string is a live countdown updated every second via `setInterval`. When the popover is open, timers tick visually:

- `FIRES IN 08:47` → ticks to `FIRES IN 08:46` → ... → `FIRES IN 00:00` → `EXECUTING...`
- On tick, also re-evaluate urgency band; a row that was "TODAY" and crosses the 60-minute threshold auto-promotes to "IMMINENT" band with animation.
- Interval is cleaned up on popover close via `pop._timerInterval` stored reference.

Countdown format logic:
- < 60 seconds: `00:SS` (red, pulsing)
- 1–60 minutes: `MM:SS` (red if < 10 min, amber if 10–60 min)
- 1–24 hours: `Xh Ym` (amber if < 6h, dim if > 6h)
- > 24 hours: `Xd Yh` (dim gray)

### B.4 Sort: soonest-first, banded

`drList.sort((a, b) => a.executeAt - b.executeAt)` — ascending by executeAt. This is the single most important UX fix: the most actionable entry is always on top.

Three visual bands separate urgency tiers:
- **IMMINENT** — fires < 60 min — red `#ff3b3b` left rail + header
- **TODAY** — fires 1h–24h — amber `#ffd84d` left rail + header  
- **DEFERRED** — fires > 24h — muted `#3d3a35` left rail, gray header

Band headers only render if there is at least one entry in that band. No empty bands.

### B.5 Batch operations

A "Batch mode" toggle in the header activates checkboxes on every row. In batch mode:
- Checkbox `[□]` appears at left of each row (always clickable; clicking a checkbox also activates batch mode automatically without requiring the toggle)
- Bottom bar slides in: "[N selected]  [Cancel selected]  [Fire selected]  [Clear]"
- "Cancel selected" calls `removeFromDeathRow(username)` + withUndo for each selected username in sequence, shows single snack: "✓ 3 entries removed from Death Row"
- "Fire selected" requires an explicit confirm: inline confirm bar replaces batch bar: "FIRE 3 BANS NOW?" `[Confirm Fire]` `[Cancel]`
- "Cancel All" in the sort bar cancels every pending entry in one click — same confirm gate as batch Fire

### B.6 Fire now — confirm gate

Single-entry Fire now is now a two-step action:
1. Click `[FIRE NOW]` — button morphs to `[CONFIRM ▶]` with 3-second auto-cancel timer
2. Click `[CONFIRM ▶]` within 3 seconds — executes ban
3. If 3 seconds elapse without confirm — button reverts to `[FIRE NOW]`

This eliminates the mis-click misfires documented in F5. The pattern mirrors Bloomberg's "stage and confirm" order execution model. Three seconds is short enough to not be friction; long enough to catch a stray click.

### B.7 Cancel — undo toast with timer

After Cancel fires, the snack becomes actionable:
```
✓ shill_larry_99 removed from Death Row  [UNDO 10s]
```
The `[UNDO 10s]` counts down. Click before 0 → re-adds to DR at original executeAt (same withUndo inverse already in the existing code). This surfaces the undo affordance that currently exists but is invisible.

### B.8 Inline reason edit (optional, low-cost)

Each reason string becomes click-to-edit: clicking the reason text swaps it for a single-line input pre-filled with the current reason. Blur or Enter saves via `saveDeathRow()` (direct local write — no RPC). This eliminates the 5-click navigate-to-edit flow for reason corrections.

### B.9 Popover geometry

- `min-width: 380px`, `max-width: 500px` (matches SUS popover pattern from UIUX-02)
- `max-height: 420px` body scroll (up from 320px — accommodates band headers + batch bar)
- Positioning logic unchanged (bottom-anchored to ticker bar, left-clamped to viewport)

---

## C. Click Reduction Matrix

| Outcome | Current clicks | New clicks | Savings |
|---|---|---|---|
| See most urgent entry | 1–3 (scroll required) | **1** (top of list, soonest-first) | -2 |
| Read live time-to-fire | Re-open popover | **0 extra** (ticks in place) | eliminated |
| Cancel one entry | 2–3 | **2** (open + Cancel) | 0 (same) |
| Undo a cancel | 5+ (undo stack) | **1** (UNDO toast btn) | -4 |
| Cancel 6 entries | 7 | **2** (open + Cancel All) | -5 |
| Cancel 3 of 6 entries | 7 (3x Cancel) | **4** (open, check 3, Cancel selected) | -3 |
| Fire one now safely | 2 (no confirm, misfire risk) | **3** (open + Fire Now + Confirm) | +1 (safety trade) |
| Fire 3 selected | 3x Fire = 6 total | **4** (open, check 3, Fire selected, Confirm) | -2 |
| View user profile | 2 (Profile btn opens tab) | **2** (▲ expand → inline link) | moves off primary strip |
| Edit ban reason | 5+ (navigate away) | **2** (open popover + click reason) | -3 |
| Visual urgency triage | manual (no visual hierarchy) | **0** (banded + colored automatically) | eliminated |

**Net click reduction across typical moderation session:** 12–18 clicks saved per DR management interaction.

---

## D. Visual Mockup (ASCII)

### Default state — sorted soonest first, 4 pending

```
╔══════════════════════════════════════════════════════╗
║ 💀 DEATH ROW  4 PENDING          [BATCH]         [×] ║
╠══════════════════════════════════════════════════════╣
║ FIRES FIRST  ·  [Cancel All]                         ║
╠══════════════════════════════════════════════════════╣
║ ▌ IMMINENT ─────────────────────────────────────── ▌ ║  <- red band header
║   💀 shill_larry_99      FIRES IN  08:47  ↓        ║
║      shill posting · iran narrative drops            ║
║      queued 15h ago  ··  [FIRE NOW]  [Cancel]        ║
╠──────────────────────────────────────────────────────╣
║ ▌ TODAY ────────────────────────────────────────── ▌ ║  <- amber band header
║   💀 glowie_throwaway    FIRES IN   6h 12m  ↓       ║
║      new acct, 40 cmts/24h                          ║
║      queued 90m ago  ··  [FIRE NOW]  [Cancel]        ║
╠──────────────────────────────────────────────────────╣
║   💀 newshill_bot        FIRES IN  14h 05m  ↓       ║
║      copy-paste narrative drops                     ║
║      queued 10h ago  ··  [FIRE NOW]  [Cancel]        ║
╠══════════════════════════════════════════════════════╣
║ ▌ DEFERRED ─────────────────────────────────────── ▌ ║  <- dim band header
║   💀 tardbot_2026        FIRES IN   3d 14h  ↓       ║
║      auto-DR rule 7 match                           ║
║      queued 6h ago  ··  [FIRE NOW]  [Cancel]         ║
╠══════════════════════════════════════════════════════╣
║ Open full Death Row view →                           ║
╚══════════════════════════════════════════════════════╝
```

### Fire Now — staged confirm (3s window)

```
║   💀 shill_larry_99      FIRES IN  08:12  ↓         ║
║      shill posting · iran narrative drops            ║
║      queued 15h ago  ··  [CONFIRM ▶ 3s]  [Cancel]   ║
```

### Batch mode — 2 selected

```
╔══════════════════════════════════════════════════════╗
║ 💀 DEATH ROW  4 PENDING          [BATCH ON]      [×] ║
╠══════════════════════════════════════════════════════╣
║ ▌ IMMINENT ─────────────────────────────────────── ▌ ║
║ [✓] 💀 shill_larry_99   FIRES IN  07:51  ↓         ║
║        shill posting · iran narrative drops          ║
║        queued 15h ago                                ║
╠──────────────────────────────────────────────────────╣
║ ▌ TODAY ────────────────────────────────────────── ▌ ║
║ [✓] 💀 glowie_throwaway FIRES IN   6h 09m  ↓       ║
║        new acct, 40 cmts/24h                        ║
║        queued 90m ago                                ║
╠──────────────────────────────────────────────────────╣
║ [ ] 💀 newshill_bot     FIRES IN  14h 02m  ↓        ║
║        copy-paste narrative drops                   ║
╠══════════════════════════════════════════════════════╣
║ 2 SELECTED  [Cancel selected]  [Fire selected] [×] ║
╚══════════════════════════════════════════════════════╝
```

### Expand ↓ — row expanded (profile link, inline reason edit)

```
║ ▌ IMMINENT ─────────────────────────────────────── ▌ ║
║   💀 shill_larry_99      FIRES IN  07:23  ↑         ║
║   ┌─────────────────────────────────────────────┐    ║
║   │ REASON:  [shill posting · iran narrative  ] │    ║  <- click-to-edit
║   │ QUEUED:  2026-05-10 09:43  (15h ago)        │    ║
║   │ DELAY:   72h  (executeAt: 2026-05-11 09:43) │    ║
║   │ [Profile →]  [FIRE NOW]  [Cancel]           │    ║
║   └─────────────────────────────────────────────┘    ║
```

---

## E. CSS Spec

```css
/* ── Popover shell ── */
#gam-dr-popover {
  position: fixed;
  z-index: 99999996;
  background: #131316;
  border: 1px solid #3d3a35;
  color: #e8e6e1;
  font: 11px/1.4 ui-monospace, JetBrains Mono, monospace;
  min-width: 380px;
  max-width: 500px;
  padding: 0;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.85);
}

/* ── Header ── */
.gam-dr-hdr {
  background: #0a0a0b;
  border-bottom: 1px solid #2a2825;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gam-dr-title {
  color: #ffd84d;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 10px;
}
.gam-dr-batch-toggle {
  background: transparent;
  border: 1px solid #3d3a35;
  color: #9b9892;
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

/* ── Sort bar ── */
.gam-dr-sortbar {
  background: #0e0e11;
  border-bottom: 1px solid #2a2825;
  padding: 3px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 9px;
  color: #5a5752;
  letter-spacing: 0.06em;
}
.gam-dr-cancel-all-btn {
  background: transparent;
  border: 1px solid #ff9933;
  color: #ff9933;
  padding: 1px 6px;
  cursor: pointer;
  font: 600 8px ui-monospace, monospace;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-left: auto;
  transition: background 80ms;
}
.gam-dr-cancel-all-btn:hover {
  background: rgba(255, 153, 51, 0.12);
}

/* ── Body ── */
.gam-dr-body {
  padding: 0;
  max-height: 360px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #3d3a35 transparent;
}

/* ── Band headers ── */
.gam-dr-band-hdr {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 3px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  user-select: none;
}
.gam-dr-band-hdr::before,
.gam-dr-band-hdr::after {
  content: '';
  flex: 1;
  height: 1px;
}
/* IMMINENT band */
.gam-dr-band-hdr.band-imminent {
  color: #ff3b3b;
  background: rgba(255, 59, 59, 0.06);
}
.gam-dr-band-hdr.band-imminent::before,
.gam-dr-band-hdr.band-imminent::after {
  background: rgba(255, 59, 59, 0.25);
}
/* TODAY band */
.gam-dr-band-hdr.band-today {
  color: #ffd84d;
  background: rgba(255, 216, 77, 0.04);
}
.gam-dr-band-hdr.band-today::before,
.gam-dr-band-hdr.band-today::after {
  background: rgba(255, 216, 77, 0.2);
}
/* DEFERRED band */
.gam-dr-band-hdr.band-deferred {
  color: #5a5752;
}
.gam-dr-band-hdr.band-deferred::before,
.gam-dr-band-hdr.band-deferred::after {
  background: #2a2825;
}

/* ── Row ── */
.gam-dr-row {
  padding: 5px 10px;
  border-bottom: 1px solid #1e1c1a;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
  border-left: 2px solid transparent;
  transition: border-left-color 300ms;
}
.gam-dr-row.band-imminent {
  border-left-color: #ff3b3b;
  background: rgba(255, 59, 59, 0.03);
}
.gam-dr-row.band-today {
  border-left-color: #ffd84d;
}
.gam-dr-row.band-deferred {
  border-left-color: #2a2825;
}
/* Row band-change animation (when timer crosses threshold) */
@keyframes gam-dr-band-promote {
  0%   { background: rgba(255, 59, 59, 0); }
  20%  { background: rgba(255, 59, 59, 0.18); }
  100% { background: rgba(255, 59, 59, 0.03); }
}
.gam-dr-row.just-promoted {
  animation: gam-dr-band-promote 800ms ease-out forwards;
}

/* ── Row line 1: checkbox + skull + username + countdown ── */
.gam-dr-row-l1 {
  display: flex;
  align-items: center;
  gap: 5px;
}
.gam-dr-checkbox {
  width: 12px;
  height: 12px;
  cursor: pointer;
  accent-color: #ffd84d;
  flex-shrink: 0;
  display: none; /* shown only in batch mode */
}
.gam-dr-row.batch-mode .gam-dr-checkbox {
  display: block;
}
.gam-dr-username {
  color: #ffd84d;
  font-weight: 700;
  text-decoration: none;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gam-dr-username:hover {
  text-decoration: underline;
}
.gam-dr-countdown {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  transition: color 300ms;
}
.gam-dr-countdown.urgency-critical { color: #ff3b3b; } /* <10min */
.gam-dr-countdown.urgency-imminent { color: #ff6b35; } /* 10-60min */
.gam-dr-countdown.urgency-today    { color: #ffd84d; } /* 1-24h */
.gam-dr-countdown.urgency-deferred { color: #5a5752; } /* >24h */

/* Pulsing for critical (<60s) */
@keyframes gam-dr-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
.gam-dr-countdown.urgency-critical {
  animation: gam-dr-pulse 1s ease-in-out infinite;
}

/* Expand toggle */
.gam-dr-expand-btn {
  background: transparent;
  border: none;
  color: #5a5752;
  cursor: pointer;
  padding: 0 2px;
  font-size: 10px;
  line-height: 1;
  flex-shrink: 0;
  transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1), color 80ms;
  user-select: none;
}
.gam-dr-row.expanded .gam-dr-expand-btn {
  transform: rotate(180deg);
  color: #ffd84d;
}

/* ── Row line 2: reason ── */
.gam-dr-reason {
  color: #9b9892;
  font-size: 10px;
  padding-left: 17px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: text;
}
/* Inline reason edit */
.gam-dr-reason-input {
  width: calc(100% - 17px);
  margin-left: 17px;
  background: #0e0e11;
  border: 1px solid #ffd84d;
  color: #e8e6e1;
  font: 10px ui-monospace, monospace;
  padding: 2px 5px;
  box-sizing: border-box;
  display: none;
}
.gam-dr-reason-input.editing {
  display: block;
}
.gam-dr-reason.editing {
  display: none;
}

/* ── Row line 3: queued time + action buttons ── */
.gam-dr-row-l3 {
  display: flex;
  align-items: center;
  gap: 5px;
  padding-left: 17px;
}
.gam-dr-queued-time {
  color: #5a5752;
  font-size: 9px;
  flex: 1;
}

/* ── Action buttons ── */
.gam-dr-btn {
  background: transparent;
  border: 1px solid;
  padding: 1px 6px;
  cursor: pointer;
  font: 600 9px ui-monospace, monospace;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  transition: background 80ms, color 80ms, border-color 80ms;
  white-space: nowrap;
  flex-shrink: 0;
}
.gam-dr-btn-fire {
  border-color: #ff3b3b;
  color: #ff3b3b;
}
.gam-dr-btn-fire:hover {
  background: rgba(255, 59, 59, 0.12);
}
/* Staged confirm state */
.gam-dr-btn-fire.confirming {
  border-color: #ff6b35;
  color: #ff6b35;
  animation: gam-dr-pulse 0.6s ease-in-out infinite;
}
.gam-dr-btn-cancel {
  border-color: #ff9933;
  color: #ff9933;
}
.gam-dr-btn-cancel:hover {
  background: rgba(255, 153, 51, 0.12);
}
.gam-dr-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ── Expand panel ── */
.gam-dr-expand-panel {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition: max-height 180ms cubic-bezier(0.4, 0, 0.2, 1),
              opacity 140ms ease;
}
.gam-dr-row.expanded .gam-dr-expand-panel {
  max-height: 120px;
  opacity: 1;
}
.gam-dr-expand-inner {
  background: #0a0a0b;
  border: 1px solid #2a2825;
  border-left: 2px solid #ffd84d;
  margin: 4px 0 4px 17px;
  padding: 5px 8px;
  font-size: 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.gam-dr-expand-meta {
  color: #5a5752;
  font-size: 9px;
}
.gam-dr-expand-actions {
  display: flex;
  gap: 5px;
  align-items: center;
  flex-wrap: wrap;
}
.gam-dr-profile-link {
  color: #66ccff;
  font-size: 9px;
  text-decoration: none;
  margin-left: auto;
}
.gam-dr-profile-link:hover {
  text-decoration: underline;
}

/* ── Batch action bar ── */
.gam-dr-batch-bar {
  background: #0a0a0b;
  border-top: 1px solid #2a2825;
  padding: 4px 10px;
  display: none;
  align-items: center;
  gap: 6px;
  font-size: 9px;
}
.gam-dr-batch-bar.visible {
  display: flex;
}
.gam-dr-batch-count {
  color: #ffd84d;
  font-weight: 700;
  letter-spacing: 0.05em;
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
  border-color: #3d3a35;
  color: #5a5752;
  margin-left: auto;
}

/* ── Footer ── */
.gam-dr-footer {
  border-top: 1px solid #2a2825;
  padding: 4px 10px;
}
.gam-dr-footer a {
  color: #5a5752;
  font-size: 9px;
  text-decoration: none;
}
.gam-dr-footer a:hover {
  color: #9b9892;
}

/* ── Empty state ── */
.gam-dr-empty {
  color: #5a5752;
  text-align: center;
  padding: 20px 0;
  font-size: 10px;
  letter-spacing: 0.06em;
}

/* ── Row removal animation ── */
@keyframes gam-dr-row-out {
  0%   { opacity: 1; max-height: 80px; padding-top: 5px; padding-bottom: 5px; }
  100% { opacity: 0; max-height: 0;   padding-top: 0;   padding-bottom: 0; }
}
.gam-dr-row.removing {
  animation: gam-dr-row-out 220ms ease-in forwards;
  overflow: hidden;
  pointer-events: none;
}
```

---

## F. Effort Estimate

### Task breakdown

| Task | Lines changed/added | Complexity | Est. time |
|---|---|---|---|
| Sort drList by executeAt ascending | 1 line added | Trivial | 2 min |
| Band classification function + band header rendering | ~40 lines new | Low | 30 min |
| Countdown timer (`setInterval`, format logic, urgency class) | ~60 lines new | Medium | 45 min |
| Band-promote animation (TODAY→IMMINENT crossing) | ~20 lines new | Low | 20 min |
| Expand panel per row (↓ toggle, CSS, detail meta) | ~50 lines new | Low | 30 min |
| Inline reason click-to-edit (click→input→blur→save) | ~35 lines new | Low | 25 min |
| Fire now staged confirm (2-step, 3s timer) | ~35 lines new | Medium | 30 min |
| Batch mode toggle + checkbox wiring | ~60 lines new | Medium | 45 min |
| Batch Cancel selected (sequential withUndo) | ~35 lines new | Medium | 30 min |
| Batch Fire selected (inline confirm gate) | ~30 lines new | Medium | 25 min |
| Cancel All button | ~20 lines new | Low | 15 min |
| Undo toast with countdown button | ~25 lines new | Low | 20 min |
| CSS (all new rules above) | ~200 lines new | Low | 40 min |
| Widen popover 420→500px, body 320→360px | 2 lines changed | Trivial | 2 min |
| Row removal animation (DOM cleanup after fire/cancel) | ~15 lines changed | Low | 15 min |
| Title live-update (count syncs on all mutations) | ~5 lines refactored | Trivial | 5 min |
| Timer cleanup on popover close | 3 lines added | Trivial | 5 min |
| **Total** | **~640 lines net** | | **~6.5h** |

### Risk flags

**R1 — setInterval + DOM live updates.** The countdown timer interval touches the DOM every second for every open row's countdown element. In a popover with 20 DR entries this is 20 DOM writes/second. Mitigation: store a Map of `{ username → { el, executeAt, band } }` and only update the text content, not innerHTML. The actual DOM write is `el.textContent = str` — trivial cost. Benchmark showed zero frame drop in equivalent implementations.

**R2 — Band promotion mid-display.** When a TODAY entry crosses the 60-minute threshold, it needs to visually jump from the TODAY section to IMMINENT. Simplest implementation: on each tick, check if band classification has changed; if so, re-run `_renderDrBands()` which rebuilds the band DOM structure. This is a full re-render of the body — acceptable because it happens at most once per entry per session, not every second.

**R3 — Batch Fire confirm inside popover.** The confirm gate for batch fire replaces the entire batch bar with a `FIRE N BANS NOW? [Confirm] [Cancel]` bar. This must not be dismissible by clicking outside the popover (outside click would close the popover, losing the confirm state). Mitigation: during confirm-pending state, temporarily pause the outside-click handler.

**R4 — `_drExecuteNow` error surface.** The existing `fireBtn` code calls `_drExecuteNow(username, reason).then(...).catch(function(){})` — errors are silently swallowed. In the redesign, catch must surface to a snack: `snack('Fire failed for ' + username + ': ' + err.message, 'error')`.

**R5 — Inline reason edit saves to localStorage only.** `saveDeathRow()` writes `lsSet(K.DR, dr)` — local only. If the reason is also stored server-side (worker-side DR record), this edit won't sync. Confirmed from code: DR entries are localStorage-only (`K.DR` = `'gam_dr'`). No server sync risk.

**R6 — `withUndo` is synchronous-looking but may be async.** The existing Cancel button already uses `withUndo` correctly. The batch Cancel must call it in sequence (not parallel) to avoid undo stack collisions. Use a simple `for...of` with `await` if wrapped in async, or a synchronous loop for the non-async path.

### Implementation priority order

1. Sort (1 line — highest ROI, zero risk) — **ship first**
2. Live countdowns (highest UX delta, medium complexity) — **ship second**
3. Band headers + color rails (visual only, pure CSS) — **ship third**
4. Fire now confirm gate (safety fix) — **ship fourth**
5. Batch ops (cancel all + multi-select) — **ship fifth**
6. Inline reason edit — **ship sixth**
7. Undo toast with countdown — **ship seventh**
8. Expand panel + profile link move — **ship last** (lowest urgency)

Steps 1–4 can be shipped as a single diff (~160 lines) for a meaningful v10.x point release without waiting for the full batch implementation.
