# UIUX2-37 — Daily Mod Hot-Path Audit
**v10.13 Design ralph V2 · Agent: UIUX2-37-DAILY-MOD**
*Modmail-to-ban-to-DR-to-audit chain · keystroke economy · batch ops · undo confidence · Bloomberg dense scan-and-act*

---

## A. Journey Trace — clicks/keystrokes per outcome

### Preconditions
- Mod is on any GAW page with the extension active.
- Status bar is visible at bottom of viewport.
- Ticker far-right shows rotating states (30s poll, 4s rotation).

---

### Leg 1 — Detect modmail, open panel

| Step | Surface | Input | Cost |
|------|---------|-------|------|
| 1 | Status bar ticker shows `N MODMAIL` (pulse animation, amber) | Visual scan | 0 |
| 2 | Click ticker | Mouse click | 1 |
| 3 | ModChat panel opens (inbox fetched, thread list rendered) | — | 0 |
| — | **Subtotal: open modmail panel from ticker** | | **1 click** |

**Alternate entry:** envelope icon (chat button) in status bar — also 1 click. Identical cost.

**Ticker rotation hazard:** Ticker rotates every 4s through up to 6 states. If MODMAIL state is not currently visible, mod must wait up to 4s or hover to pause rotation before clicking. This is a **timing-dependent click** — the target moves.

---

### Leg 2 — Read modmail thread, reply

| Step | Surface | Input | Cost |
|------|---------|-------|------|
| 4 | ModChat panel shows thread list; identify target thread | Visual scan | 0 |
| 5 | Click thread row to open | Mouse click | 1 |
| 6 | Read thread content | Visual scan | 0 |
| 7 | Press `R` (on modmail read page) OR click reply textarea | 1 key OR 1 click | 1 |
| 8 | Type reply | Keystrokes (variable) | N |
| 9 | `Ctrl+Enter` to send (if in native form) OR click Send button | 1 chord OR 1 click | 1 |
| — | **Subtotal: read + reply to modmail** | | **2 clicks + 1 kbd (+ typing)** |

**Notes:**
- `R` (bare key, modmail read page, no input focus) focuses reply textarea — saves 1 click. Works only on the read-page URL pattern `/modmail/thread/<id>` or `/messages/<id>`.
- `Ctrl+Enter` send works when in a `<textarea>` inside `form#respond`.
- MODMAIL_3COL feature flag is `true` — the 3-column modmail panel exists but its layout interaction is in the ModChat module, not in the same keydown path.

**Alternate modmail arch (on the native GAW /modmail page):**
- Bare `A` on a hovered row: archive without opening (1 key, 0 navigation)
- Bare `R` on a hovered row: navigate to thread (1 key, triggers `window.location.href`)
- `Ctrl+Shift+A`: archive currently reading thread (1 chord)
- These are the highest-velocity actions on the modmail list — zero navigation, zero extra click.

---

### Leg 3 — Spot SUS user; mark SUS from within modmail

| Step | Surface | Input | Cost |
|------|---------|-------|------|
| 10 | Identify sender as suspicious during modmail read | Visual judgment | 0 |
| 11 | In modmail action bar (injected gam-mm-bar): click `Intel` | Mouse click | 1 |
| 12 | IntelDrawer opens for sender — shows profile, watch, DR status | — | 0 |
| 13 | In IntelDrawer: no direct "Mark SUS" button (falls through to Mod Console) | — | — |
| 13a | Alt: `Ctrl+Shift+M` → opens Mod Console Ban tab for modmail sender | 1 chord | 1 |
| 14 | Mod Console opens → switch to Intel tab | 1 click | 1 |
| 15 | In Intel tab: "Mark SUS" button (if present) or navigate to /u/ profile | 1 click | 1 |

**Or from the SUS popover (if mod navigates to hovered post/user elsewhere):**

| Step | Surface | Input | Cost |
|------|---------|-------|------|
| 10b | Hover post by suspicious user | Hover | 0 |
| 11b | `Ctrl+Shift+P` → Mod Console Intel tab | 1 chord | 1 |
| 12b | Intel tab: click "Mark SUS" | 1 click | 1 |
| — | **Subtotal: mark SUS from hovered post** | | **1 chord + 1 click** |

**From right-click context menu on a username (injected context menu):**
| Step | Surface | Input | Cost |
|------|---------|-------|------|
| — | Right-click username → context menu appears | 1 right-click | 1 |
| — | Click "SUS" option in context menu | 1 click | 1 |
| — | **Subtotal: mark SUS via context menu** | | **2 clicks** |

**From SUS popover after clicking ticker:**
- Ticker shows `N SUS` → 1 click → SUS popover opens → expand row → 2 clicks to reach SUS actions
- Total from fresh ticker: **3 clicks** to reach the unmark/ban actions inside the SUS popover

---

### Leg 4 — Ban with macro

| Step | Surface | Input | Cost |
|------|---------|-------|------|
| 16 | Open Mod Console Ban tab | `Ctrl+Shift+B` (on hovered post) = 1 chord | 1 |
| 17 | Select violation from dropdown | 1 click + 1 select | 2 |
| 18 | Select team macro from dropdown | 1 click + 1 select (or arrow keys) | 2 |
| 19 | Macro fills subject + message textarea | Auto | 0 |
| 20 | Select ban duration (click a duration chip) | 1 click | 1 |
| 21 | Click BAN button | 1 click | 1 |
| 22 | Preflight modal appears (shows target, action, duration, message) | — | 0 |
| 23 | Click Confirm in preflight | 1 click | 1 |
| 24 | `withUndo` fires, ban POST sent, undo toast appears (20s window) | — | 0 |
| 25 | Ban verified; snack + status banner | — | 0 |
| — | **Subtotal: ban with macro, no modmail** | | **1 chord + 6 clicks** |

**Perma-ban path adds:** 3-second arm delay on the preflight confirm button (visual countdown, user must wait before Confirm is live) — not a click, but a forced pause.

**AI-generated ban message path (adds):**
- Click "Generate" button → 1 click → wait for AI → "Use this reply" → 1 click — adds **2 clicks + latency**

---

### Leg 5 — Add to Death Row

**From Mod Console Quick tab (fastest path):**
| Step | Surface | Input | Cost |
|------|---------|-------|------|
| 26 | In Mod Console: click Quick tab | 1 click | 1 |
| 27 | DR duration chip: click (e.g. 72h) | 1 click | 1 |
| — | **Subtotal: DR from Mod Console Quick tab** | | **2 clicks** |

**From SUS popover DR button (fastest inline path):**
| Step | Surface | Input | Cost |
|------|---------|-------|------|
| — | Ticker click (if SUS state showing) | 1 click | 1 |
| — | In SUS popover: click [DR] on the target row | 1 click | 1 |
| — | **Subtotal: DR from SUS popover** | | **2 clicks** |
Note: no confirm guard on the SUS popover DR button — fires immediately. Uses `fromUserAction:true` flag so an undo slot is registered and Ctrl+Z works.

**From context menu (right-click on username):**
- Right-click → "Death Row" option → click → confirm dialog → 2 clicks + 1 confirm = **3 clicks** (has `confirm()` guard per v10.10.2 SUS-DR FIX note)

**From tooltip pin on /users page:**
- Hover user → tooltip pins → "DR" button visible → click DR → input hours → confirm → **3 clicks + 1 input**

---

### Leg 6 — Audit log entry

Audit logging is **fully automatic** — every action writes via `logAction()` which:
1. Writes to localStorage mod log synchronously
2. Fire-and-forgets `modAuditLog` RPC to D1-backed cloud audit log

**Operator cost for audit: 0 clicks, 0 keystrokes.** It is implicit in every action.

**Viewing the audit log:**
| Step | Surface | Input | Cost |
|------|---------|-------|------|
| — | `Ctrl+Shift+L` | 1 chord | 1 |
| — | Mod Log + Death Row panel opens | — | 0 |
| — | **Subtotal: open audit log** | | **1 chord** |

---

### Full chain summary — modmail → reply → spot SUS → mark SUS → ban with macro → add to DR → view audit

| Segment | Best path | Clicks | Keystrokes |
|---------|-----------|--------|------------|
| Open modmail from ticker | Ticker click | 1 | 0 |
| Read + reply | Click thread + `R` + type + `Ctrl+Enter` | 1 | 2 chords |
| Mark SUS (from modmail sender) | `Ctrl+Shift+M` + click Intel + click Mark SUS | 1 | 1 chord |
| Ban with macro | `Ctrl+Shift+B` + 3 selects + 1 duration + 1 BAN + 1 Confirm | 5 | 1 chord |
| Add to DR (Quick tab) | Click Quick + click 72h chip | 2 | 0 |
| Audit (automatic) | — | 0 | 0 |
| View audit | `Ctrl+Shift+L` | 0 | 1 chord |
| **TOTALS** | | **10 clicks** | **5 chords** |

---

## B. Friction in Hot Paths

### B1. Ticker timing dependency (HIGH friction, pervasive)
The ticker rotates every 4s through up to 6 states. When a mod sees MODMAIL, SUS, or DR in their peripheral vision and goes to click, the state may have already rotated. This is a **moving click target** — completely contrary to Bloomberg terminal principles where data is always in a fixed position.

Current mitigation: hover pauses rotation. But the mod must hover before the state rotates away.

**Root friction:** The ticker is the only global alert mechanism AND a rotating display. These two purposes conflict.

### B2. SUS marking requires navigation away from modmail (MEDIUM friction)
When reading a modmail from a suspicious sender, the fastest path to Mark SUS is `Ctrl+Shift+M` → Mod Console Ban tab → switch to Intel tab → click Mark SUS. That is 1 chord + 2 clicks minimum. The modmail action bar (gam-mm-bar) offers Intel, Ban, Unban, Note — but "Mark SUS" is not in it. The mod must open a second surface.

### B3. Ban preflight prefill from modmail context is incomplete (MEDIUM friction)
Opening the Mod Console Ban tab from a modmail thread does not auto-fill the violation type. The mod must select violation, then macro. Two sequential selects with no defaults remembered from the previous action on this user. The macro draft restore works (session cache), but only if the mod has previously started a macro for this user.

### B4. DR from modmail has no inline path (MEDIUM friction)
On the modmail read page, there is no 1-click DR action. The mod must: open Mod Console (1 chord) → Quick tab (1 click) → DR chip (1 click). Three actions. The SUS popover DR button is 2 clicks but requires navigating away from modmail or catching the SUS ticker state.

### B5. Perma-ban 3s arm delay is a forced pause (LOW friction — intentional safety gate)
The preflight confirm button for perma-bans has a 3-second countdown before it becomes active (`armSeconds: 3`). This is an intentional safety gate. The mod must wait. On a busy moderation session, this is a minor but real interruption to flow.

### B6. AI ban message generation adds latency and 2 extra clicks (LOW friction, optional path)
The "Generate with AI" path adds a round-trip to the CF Worker plus 2 clicks (Generate + "Use this reply"). Mods who rely on macros avoid this entirely. Mods who want custom AI messages pay the latency cost on every ban.

### B7. Modmail 3-col panel vs native page: two distinct modmail surfaces (MEDIUM confusion)
The MODMAIL_3COL flag is true, meaning ModChat provides an in-page panel. But the native GAW modmail page (/modmail) also exists with its own keyboard shortcuts (bare `A`, bare `R`). Mods may be in either surface without knowing which one the keystrokes target. The modmail read-page detection regex is fragile — mods on native GAW modmail threads get different keyboard affordances than mods inside the ModChat panel.

### B8. SUS popover row collapse/expand is one-at-a-time (LOW friction)
The SUS popover collapses all other rows when one is expanded — accordion behavior. If a mod wants to compare two SUS users' activity, they must expand, read, collapse, expand. No multi-row view.

### B9. Death Row "Cancel All" has no undo (MEDIUM friction)
`cancelAllBtn` in the DR popover removes all rows with `withUndo` wrapping per-item, but the undo slots are overwritten in a loop — effectively the last item wins on `Ctrl+Z`. Bulk cancel is not atomically reversible.

---

## C. Click-Reduction Opportunities

| ID | Current flow | Proposed reduction | Saves |
|----|-------------|---------------------|-------|
| CR-1 | Ticker rotates away from MODMAIL before click | Sticky alert badge (non-rotating) alongside ticker for any state with `pulse:true`; ticker can still rotate below it | Eliminates timing dependency |
| CR-2 | Mark SUS from modmail requires 1 chord + 2 clicks | Add "Mark SUS" button directly to gam-mm-bar (alongside Intel/Ban/Unban/Note) | Saves 2 clicks |
| CR-3 | DR from modmail requires Mod Console detour (3 actions) | Add "DR 72h" button to gam-mm-bar | Saves 2 clicks |
| CR-4 | Ban with macro: violation select + macro select = 2 sequential selects | Last-used violation auto-restored per user (already has macro draft restore — add violation memory) | Saves 1 click |
| CR-5 | SUS popover: drill expand + find ban = 2 clicks after open | Always-visible Ban button on each SUS row (like the existing DR button) without needing expand | Saves 1 click per row |
| CR-6 | DR popover Fire Now = 2 clicks (FIRE NOW → CONFIRM) | Acceptable — this is an intentional 2-click safety gate. Keep. | — |
| CR-7 | Mod Console: violation + macro always start from empty | Pre-select most-used violation after first use (learn per-mod via session storage) | Saves 1 click avg |
| CR-8 | Modmail reply: click textarea + type | Auto-focus reply textarea when thread opens in ModChat panel (textarea.focus() already called on panel open — verify it targets the reply field) | Saves 1 click |

**Highest-ROI reductions:** CR-2 and CR-3 together eliminate the biggest detour in the modmail → SUS/DR path.

---

## D. Power-User Shortcut Affordances

### Existing shortcuts (confirmed in code)

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl+Shift+B` | Open Mod Console → Ban tab (hovered post) | Any page, post hovered |
| `Ctrl+Shift+R` | Open Mod Console → Message tab | Any page, post hovered |
| `Ctrl+Shift+X` | Open Mod Console → Quick tab (Remove) | Any page, post hovered |
| `Ctrl+Shift+P` | Open Mod Console → Intel tab | Any page, post hovered |
| `Ctrl+Shift+W` | Toggle watch on hovered user | Any page, post hovered |
| `Ctrl+Shift+C` | Copy permalink of hovered post | Any page, post hovered |
| `Ctrl+Shift+L` | Open Mod Log + Death Row panel | Global |
| `Ctrl+Shift+S` | Open Settings panel | Global |
| `Ctrl+Shift+H` | Open Help panel | Global |
| `Ctrl+Shift+A` | Archive modmail (thread or hovered list row) | Modmail pages |
| `Ctrl+Shift+M` | Open Mod Console against modmail sender | Modmail thread |
| `Ctrl+Enter` | Send modmail reply | Modmail reply textarea in form#respond |
| `R` (bare) | Focus reply textarea | Modmail read page, no input focus |
| `A` (bare) | Archive hovered modmail row | Modmail list page, row hovered |
| `Esc` | Close active panel | Any panel open |
| `Ctrl+Z` | Undo last mod action | Global, no input focus (20s for Tier A, 5s for Tier B) |
| `Ctrl+K` | Open search palette | Global |

### Gaps in shortcut coverage

| Missing shortcut | Rationale |
|-----------------|-----------|
| No shortcut to open SUS popover directly | Must hover ticker or navigate to /users |
| No shortcut to mark SUS on hovered post | Requires Mod Console → Intel tab → click |
| No shortcut to add DR on hovered post | Requires Mod Console → Quick tab → click |
| No shortcut to open modmail panel | Ticker click or chat button only |
| No shortcut to open DR popover directly | Must click ticker when DR state is showing |

### Undo confidence
- **Tier A (20s window):** Bans — mod has 20 full seconds to `Ctrl+Z` after any ban
- **Tier B (5s window):** Remove, approve, watch, archive, DR cancel, DR add
- **No undo:** Mark SUS / Clear SUS (RPC only, no inverse registered), bulk Cancel All in DR popover (per-item undo slots overwrite each other)
- `Ctrl+Z` is keyboard-only; there is also a visible undo toast with an "Undo" button for mouse users
- `undoLastModAction()` is called from the keyboard handler; `withUndo` is the action wrapper — these are consistent

---

## E. Effort Matrix

### Bloomberg dense scan-and-act assessment

| Principle | Current state | Rating |
|-----------|-------------|--------|
| Fixed-position high-signal alerts | Ticker rotates; alert position is fixed but content moves | PARTIAL |
| Glanceable state in <200ms | Ticker text is readable, color-coded, font-weight escalates with urgency | GOOD |
| Act without navigation | Ticker popovers (SUS, DR, Queue, Modmail) keep mod on current page | GOOD |
| Keyboard-first for repeat actions | Rich shortcut set for Ban/Message/Remove on hovered post; gaps in SUS/DR | PARTIAL |
| Undo confidence for destructive actions | 20s for bans, 5s for removes; visible toast; Ctrl+Z global | GOOD |
| Batch operations | DR has Cancel All; SUS popover has no batch; ban is always single-target | PARTIAL |
| Persistent visual feedback | Snack toasts, status banners in modal, audit log auto-writes | GOOD |
| No modals for routine triage | Popovers handle SUS/DR/Queue; Mod Console is a modal but unavoidable for ban | PARTIAL |

### Per-outcome effort rating (1=trivial, 5=high friction)

| Outcome | Clicks | Chords | Forced waits | Effort |
|---------|--------|--------|--------------|--------|
| Archive modmail (hovered row) | 0 | 0 | 0 | 1 — bare `A` |
| Reply to modmail thread | 1+N | 1 | 0 | 2 |
| Mark SUS (hovered post) | 2 | 1 | 0 | 2 |
| Mark SUS (from modmail) | 3 | 1 | 0 | 3 |
| Ban with macro (hovered post) | 6 | 1 | 0 (timed if perma) | 3 |
| Ban perma (safety gate) | 6 | 1 | 3s arm | 4 |
| Add to DR (SUS popover) | 2 | 0 | 0 | 1 |
| Add to DR (from modmail) | 3 | 1 | 0 | 3 |
| View audit log | 0 | 1 | 0 | 1 |
| Fire DR ban (DR popover) | 2 | 0 | 3s confirm | 2 |

### Priority change recommendations

| Priority | Change | Impact |
|----------|--------|--------|
| P0 | Add "Mark SUS" + "DR 72h" buttons to gam-mm-bar (the inline modmail action bar) | Removes entire Mod Console detour from modmail → SUS/DR path; saves 2-3 clicks on the highest-frequency cross-surface chain |
| P1 | Non-rotating sticky badge for actionable ticker states (`pulse:true` states) | Eliminates timing-dependent click; mod can click when ready, not when ticker happens to show it |
| P2 | Add direct keyboard shortcut to Mark SUS on hovered post | Brings SUS marking to parity with Ban (`Ctrl+Shift+B`) — suggest `Ctrl+Shift+U` (U for sUspect) |
| P3 | Restore last-used violation type per user in Mod Console Ban tab | Saves 1 select on repeat-offender bans, which are common for SUS users |
| P4 | Atomic undo for "Cancel All" in DR popover — batch the withUndo calls into a single undo slot | Fixes the broken undo on bulk DR cancel |
| P5 | Keyboard shortcut to open SUS popover and DR popover directly (not ticker-state-dependent) | Suggests `Ctrl+Shift+Num1` = SUS popover, `Ctrl+Shift+Num2` = DR popover, or similar |
