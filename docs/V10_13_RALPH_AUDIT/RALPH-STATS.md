# RALPH-STATS — Stats Tab Wave 1 Re-Audit

**Auditor:** RALPH-STATS (read-only)
**Repo:** `D:\AI\_PROJECTS\modtools-ext\` @ `9c7655e` (v10.13.4)
**W1 commit:** `93e96fc` (`feat(v10.13.0): WAVE 1 -- token foundation + Stats honesty + ticker weight + Loading strip`)
**Spec:** `docs/V10_DESIGN_V2/UIUX2-01_stats_tab.md` (original audit, "still dogfood 4-6/10")
**Shipmaster acceptance criteria:** `docs/V10_DESIGN_V2/DESIGN_V2_SHIPMASTER.md` Wave 1, lines 298-323

---

## Summary

**Re-rating: 6/10.** Up from the original audit's 4-6/10 floor. Net positive
move, but the wave was **not** the "Stats honesty" headline ship its
SHIPMASTER name promises. Three of the eight named acceptance criteria
are partially or fully unmet, two new dogfood patterns landed, and the
"CSS consolidation" claim is technically false (the rule blocks were
re-stacked, not collapsed).

**What unambiguously got better:**
- Sparkline DOM is no longer a permanent ghost on every tile. Real
  SVG polylines now inject into the three activity tiles (Bans / Msgs
  / Notes) when the 7d log has any non-zero day.
- Delta math on second open works correctly (sessionStorage diff is
  signed, with `=` for flat).
- Skull emoji is gone from the Death Row alert; an inline SVG warning
  triangle inherits the alert's red color cleanly.
- Inline `style="color:..."` is gone from all 8 tiles in popup.html.
- The 4-column grid is the single source of truth (the 3-col
  `repeat(3,1fr)` block at the old L54 was deleted; the L913 block was
  upgraded to 4-col in place; the L2292 override was deleted).

**What is still dogfood after W1:**

1. **Six of the eight delta chips render as visible 1px-bordered ghost
   boxes on the very first popup open of every session.** `_updateStatDelta`
   sets `textContent=''` and `data-dir='none'` when `prev===null`, and
   the matching CSS rule at popup.css:2705
   (`color: var(--bb-ink-faint); border-color: var(--bb-line)`) keeps
   the box drawn. There is no `.pop-stat-delta:empty { display:none }`
   rule. The original audit's spec D, line 165, explicitly required
   `:empty { display:none }`. It was never written. AC #2's "render
   directional `+N ^` / `-N v` / `=` after second open" is met -- but
   the **first-open ghost box pattern (audit defect A.2) is half-fixed,
   not killed**.

2. **The 8th tile (Auto-UNS) is now the canonical placeholder dogfood
   slot, replacing the AI tile.** `s-unsticky` and `d-unsticky` are
   wired in `wireStatSkeletons` and `_clearStatSkeletons` but are
   **never written by any JS code path**. There is no
   `_setStatTile('s-unsticky', ...)`, no fire-and-forget RPC, no
   `__renderUnsticky()` drill, no `__DRILL_TITLES.unsticky24`. Click
   the tile and it falls through `renderDrillDown` to the generic
   `__renderDrillEmpty` (popup.js:4811). The HTML still ships
   `data-state="info"`, a hardcoded `--` text content, and a tooltip
   promising "Posts auto-unstickied in last 24h. Click for log." It
   delivers neither. **This is the same shipped-promise-without-
   delivery pattern audit defect A.5 named for the AI tile**, transplanted
   one tile to the right.

3. **`tile.dataset.state` is hardcoded in popup.html and never set
   dynamically by JS.** Audit recommendation B.3 was specific:
   "loadStats() should set `tile.dataset.state` based on thresholds
   (e.g., Death Row > 0 = danger; Pending > 20 = danger; everything
   else defaults to amber)." A grep across popup.js for `dataset.state`
   or `setAttribute('data-state'` returns zero hits. The ship is
   instead: HTML hardcodes `data-state="danger"` on Death Row and
   Banned tiles permanently, `data-state="warn"` on Notes/24h
   permanently, `data-state="info"` on Bans/24h, AI today, Auto-UNS,
   `data-state="good"` on Msgs/24h. **Banned tile is permanently red
   even when count is zero. AI today tile is permanently cyan even at
   95% of cap.** This is a 5-color rainbow (red / cyan / green / amber-warn
   / amber-default) with no semantic threshold logic -- exactly what
   shipmaster P1-46 ("5-color rainbow on stats grid -- 8 tiles, 5 colors,
   no semantic meaning") flagged as a P1 still to fix. P1-46 is listed
   as "depends on P0-03" -- P0-03 (kill inline color overrides) shipped
   without P1-46, so the rainbow regressed.

4. **CSS consolidation is partial.** Two duplicate rule pairs remain:
   - `.pop-stat-delta[data-dir="up|down|flat"]` is declared at popup.css:2339-2341
     **AND** at popup.css:2702-2705. Same selector, same property, same
     `!important`. The L2702 block additionally adds `data-dir="flat"`
     with `--bb-ink-dim` (vs L2341's `--bb-ink-faint`) -- a real
     semantic conflict, not just dead duplication. Source-order
     tiebreaker means L2702 wins.
   - `.pop-stat .value` / `.pop-stat-value` / `.pop-stat-num`
     selectors at popup.css:1215-1232 are dead under the actual HTML
     (which emits `.pop-stat-val`). The `.pop-stat-val` class was
     bolted on alongside in the same rule (popup.css:1227,1229,1231,1233),
     but the original three-selector list was kept "for safety." It is
     dead code -- popup.html ships zero `.value` / `.pop-stat-value`
     / `.pop-stat-num` instances. (modtools.js:22222 ships the same
     dead selectors in its content-script CSS string injected into
     greatawakening.win, but that's out of scope; the popup-context
     dead code is what matters here.)

5. **`!important` count went UP, not down.** Original audit reported
   "475 !important declarations" in popup.css. Current count: **489**.
   The shipmaster's W1 budget said "popup.css -100/+100" -- net zero
   diff. Spec stated the consolidation would let the W1 stat-block
   `!important` calls drop "because the !important was needed to beat
   specificity from earlier blocks that no longer exist." That premise
   was that the L54 v9.4.4-era block would be deleted. It was. But
   every other rule kept its `!important`, and the new W1 rules
   (`.pop-stat-head`, `.pop-stat-spark`, `.pop-stat-spark-bar`,
   `.pop-stat-delta` second block, the W1 `data-state="warn"` rule)
   all shipped with `!important` on every line. The structural defect
   audit A.3 named is still present.

6. **`.pop-stat-spark-bar` CSS rules at popup.css:2716-2723 are
   completely dead.** `_injectStatSparkline` injects a `<div
   class="pop-stat-spark"><svg><polyline /></svg></div>` -- a single
   container with an SVG inside. It does NOT create
   `<div class="pop-stat-spark-bar">` children. The
   `.pop-stat-spark-bar`, `.pop-stat-spark-bar.today`, and
   `.pop-stat-spark-bar.zero` rules will never match anything in the
   popup. They are 8 lines of dead CSS with their own `!important`.

7. **Stale-state bug on `dr-alert`.** `loadStats()` at popup.js:1033-1052
   only writes the alert when `drReady > 0`. There is no
   `else { alert.style.display='none'; alert.innerHTML=''; }` branch.
   If a popup session goes from drReady=2 -> drReady=0 (a mod
   executed both pending DR rows from another tab), reopening the
   popup leaves the previously-rendered "2 Death Row inmates READY"
   text visible until the next reload that hits drReady>0 again.
   `_clearStatSkeletons` clears the value tiles; nothing clears the
   alert. **First-load is fine; re-load with reduced count is wrong.**

8. **Death Row tile color violates SHIPMASTER conflict-resolution
   #6 ("Keep purple for v10.13").** popup.html:81 ships
   `data-state="danger"` on the DR tile (red, via popup.css:1227).
   SHIPMASTER §CONFLICT 6 explicitly resolved: *"Keep purple for
   v10.13. Revisit with UIUX2-25 semantic split in v10.14. Rationale:
   changing DR pill color is high-visibility for leads."* W1 ignored
   this and shipped red. There is no `data-state="purple"` /
   `--bb-purple` rule in popup.css for `.pop-stat-val`, so even if
   someone wrote `data-state="queue"` it would fall through to the
   default amber. To honor the conflict resolution, W1 needed to
   either keep the inline `style="color:var(--bb-purple)"` (which it
   was specifically deleting) OR add a `data-state="queue"` rule and
   wire it. Neither happened.

**Reach of the wave that genuinely ships:**
- AC #1 (4-col grid): PASS
- AC #2 (delta chips render after second open): PASS for second-open;
  PARTIAL for first-open (ghost boxes still drawn)
- AC #3 (sparkline injects only when 7d data > 0): PASS
- AC #4 (inline color overrides removed): PASS in HTML; data-state-
  drives-color is hardcoded-static, not threshold-driven
- AC #5 (AI tile drill renders honest empty, not version placeholder): PASS
- AC #6 (DR alert renders SVG): PASS
- (No formal AC for 8th tile data wiring -- audit §H.5 explicitly
  scoped it out -- but the placeholder pattern persists.)

---

## AC Verification Table

| # | AC (W1 SHIPMASTER) | Verdict | Evidence |
|---|---|---|---|
| 1 | Stats tab grid is 4-column | **PASS** | popup.css:1184-1187 single canonical block; `grid-template-columns: repeat(4, 1fr)`. Tile borders at popup.css:1204-1205 use `4n` / `-n+4`. Old L54 block deleted (popup.css:54-59 is now a removal-comment). Old L2292 override deleted (popup.css:2781-2784 is now a removal-comment). |
| 2 | All 6 local-data tile delta chips render directional after second open | **PARTIAL** | `_updateStatDelta` (popup.js:882-903) is correctly wired and called from `loadStats` for pending/dr/banned/today/msgs/notes (popup.js:998-1003). sessionStorage key `gam_stats_prev_<tile>` is the diff source. ASCII arrows ` ^` / ` v`, flat = `=`, signed numerics. Math is correct. **First-open issue:** when `prev===null` the chip stays empty + `data-dir="none"`, but the CSS rule at popup.css:2705 keeps a 1px border drawn around the empty chip -- visible ghost box on every tile on first open of the session. The original audit (§D, line 165) demanded `:empty { display:none }`; never written. |
| 3 | Activity tiles inject sparkline DOM only when 7d data > 0 | **PASS** | `_injectStatSparkline` (popup.js:911-943) early-returns when no series day > 0. `_bin7d` (popup.js:947-962) builds a 7-day array correctly (oldest→newest, ageDays floor, type predicate). Called for today/msgs/notes (popup.js:1008-1010). The dead static `<div class="pop-stat-spark" id="spark-*">` HTML is gone. SVG polyline injected as a 48×12 viewbox child of `.pop-stat`. Stroke is `currentColor` so it inherits the value color. Idempotent (removes prior spark before injecting). |
| 4 | Inline `style="color:..."` removed from all 8 tiles; `data-state` drives color | **PARTIAL** | popup.html shows zero `style="color:..."` on `.pop-stat-val` elements (verified). `data-state` rules at popup.css:1226-1233 cover danger/good/info/warn correctly with `.pop-stat-val` added to each selector. **But `data-state` is hardcoded static in HTML (popup.html:81/89/97/105/113/122/132)** rather than computed from value thresholds. JS never calls `dataset.state = ...`. Banned is always red, even at 0. AI today is always cyan, even at 95%-of-cap. Death Row is always red even at 0. Audit B.3 ("loadStats() should set tile.dataset.state based on thresholds") is **not implemented**. |
| 5 | AI tile drill renders honest empty state | **PASS** | `__renderAi24` (popup.js:4829-4850) replaced the v10.11-promise placeholder. Renders the live `s-ai-today` value (e.g. `47/500`), an "AI calls today" sub-label, and `gamMakeEmpty({ headline: 'Per-call log unavailable', desc: 'AI usage rolls up at the daily snapshot — per-call detail is not retained.' })`. No version numbers in copy. `__DRILL_EMPTY_HINT.ai24` (popup.js:4545) is updated correspondingly. |
| 6 | Death Row alert renders SVG warning icon (no skull emoji) | **PASS-with-edge** | `loadStats()` popup.js:1040-1051 emits an inline SVG warning triangle (`<path>` for the triangle outline, `<line>` for the stem, `<circle r=0.5>` for the dot). Stroke=`currentColor` inherits the alert's red color (popup.css:62-73). Skull emoji removed. **Edge:** the `<circle cx="12" cy="17" r="0.5">` dot has no `fill` attribute; SVG parent has `fill="none"`. The 0.5-radius circle relies on a 2px stroke ring being visible, which works visually but the canonical Feather/Lucide warning-triangle pattern uses `<line x1="12" y1="17" x2="12.01" y2="17">` with `stroke-linecap="round"` to draw a proper round dot. Cosmetic, but inconsistent with the rest of the icon library. **Bigger edge:** no else-branch resets the alert -- if `drReady` drops to 0 between opens the previously-rendered SVG + count text remains visible (see Finding 7). |
| 7 | Ticker severity weight tiers (quiet/queue/auto/sus/opdel) at 400/500/700 | (not in scope — modtools.js change) | Not audited here. |
| 8 | OP_DEL ticker uses `var(--bb-red)` not raw hex | (not in scope — modtools.js change) | Not audited here. |
| 9 | 4 `Loading...` strings stripped from popup.html diag divs | (not in scope) | Not audited here. |
| 10 | Off-grid 5px values in popup.css (3 sites) replaced with 4px | (not in scope) | Not audited here. |
| 11 | New tokens declared in popup.css `:root` (`--bb-blue`, `--bb-warn-status`, `--bb-teal`, `--bb-t-stat-md`, `--bb-t-stat-lg`) | (token foundation — not stats-specific) | popup.css:962 has `--bb-warn-status`. Not audited further. |
| 12 | Visual QA: stats tab reads correctly on first open AND re-open | **PARTIAL** | First open: ghost-box deltas drawn around all 6 chips (Finding 1). Banned tile colored red regardless of count (Finding 3). Second open: deltas correctly render `+N ^` / `-N v` / `=`. |

**Tally:** 6 PASS, 3 PARTIAL, 1 PASS-with-edge, 2 not in scope.

---

## Findings

### Finding 1 (P0 — UX) — `:empty { display:none }` was the load-bearing CSS for the audit and was never written

**Severity:** P0 (the chip ghost-box pattern is exactly what the original audit's section A.2 named as "dogfood evidence #2"; W1 cited fixing it as a headline goal).

**Where:** popup.css around L2693-2705 (the `.pop-stat-delta` rule block).

**Why it persists:**
The W1 implementation correctly avoids writing arrow / number text on
first open (popup.js:889-892 sets `textContent = ''` and
`data-dir = 'none'`). But the chip element still has:
```css
.pop-stat-delta { padding: 1px 4px; border: 1px solid currentColor; opacity: 0.9; }
.pop-stat-delta[data-dir="none"] { color: var(--bb-ink-faint) !important;
                                    border-color: var(--bb-line) !important; }
```
1px+4px+border + non-zero opacity = a visible ~3px-wide hollow box drawn
to the right of the label on every tile on first popup open of every
new browser session. Six of those, plus a seventh on AI (when AI
returns) and an eighth on Auto-UNS (always, since unsticky never resolves).

**Spec referenced:**
UIUX2-01 §D, line 165: `.pop-stat-delta:empty { display: none; }
/* KEY: no ghost box on first load */`. Comment was load-bearing; rule was not shipped.

**Fix size:** 1 line of CSS. Add `.pop-stat-delta:empty { display: none !important; }` to the popup.css:2693+ block. Done. Pre-existing `data-dir="none"` initial HTML stays harmless because the `:empty` selector + display:none beats it.

---

### Finding 2 (P0 — dogfood) — 8th tile is unwired, undelivered, and click-tooltip-promised

**Severity:** P0 (it's a shipped placeholder masquerading as a feature -- the same defect class as the AI tile placeholder W1 was specifically called out to fix).

**Where:**
- popup.html:130-139 (tile markup with `--` static value, `data-state="info"`, `data-drill="unsticky24"`, tooltip "Posts auto-unstickied in last 24h. Click for log.")
- popup.js: zero references to `s-unsticky` or `d-unsticky` outside of `wireStatSkeletons` (popup.js:626) and `_clearStatSkeletons` (popup.js:645) -- both of which only manage skeleton lifecycle, never write the value.
- popup.js:4793-4811 (`renderDrillDown`): `unsticky24` falls through to `__renderDrillEmpty(key)` because there is no `else if (key === 'unsticky24')` branch.
- popup.js:4529-4546 (`__DRILL_TITLES` and `__DRILL_EMPTY_HINT`): zero entry for `unsticky24`. Drill drawer would render with title "Detail" (the `__DRILL_TITLES[key] || 'Detail'` fallback at popup.js:4798).

**The user-visible failure:**
1. Mod opens the popup, sees the Auto-UNS tile with `--` value and an
   info-cyan color cue.
2. Hovers → reads "Posts auto-unstickied in last 24h. Click for log."
3. Clicks → drill drawer opens with title "Detail" (generic fallback),
   body shows "(no data for unsticky24)" generic empty hint.
4. Skeleton-cleared `--` stays as `--` permanently because nothing
   sets the value.

The original audit's §H.5 explicitly scoped this out as "pre-existing
gap, separate defect" -- but that was the v10.12.3 state. W1's name
was *Stats honesty*, and shipping a tile with a hover-promised drill
that fails is the same defect class as the v10.12.3 AI tile placeholder.
W1 fixed the AI tile and let the Auto-UNS tile inherit the dogfood
pattern.

**The honest options:**
- Wire it. Add a `unsticky24` writer in modtools.js's auto-unsticky
  handler that pushes a `gam_diag_log` entry with `type:"auto_unsticky"`,
  reuse `_bin7d` and `_renderSpark`, add `__renderUnsticky24` drill,
  add `__DRILL_TITLES.unsticky24` and `__DRILL_EMPTY_HINT.unsticky24`.
  Estimated: ~1.5h (the spec is in `docs/V10_DESIGN/UIUX-09_stats_tab.md`
  §G).
- Remove the tile entirely until the data lands. Drop popup.html:130-139,
  drop the two `s-unsticky` / `'s-unsticky'` mentions in popup.js. The
  grid becomes 7 cells, asymmetric -- which is the pre-W1 state, but
  honest. SHIPMASTER explicitly closed CONFLICT 4 ("3-col vs 4-col")
  on 4-col, so removing the tile creates a 3-col-then-1-cell row
  asymmetry that's worse than re-wiring.

**Recommended:** Wire it. The data source (auto-unsticky handler)
already runs in modtools.js -- the work is one log-write call and a
50-line drill renderer copied from `__renderBans24`.

**Fix size:** ~70 lines of JS, 4 lines of object-literal entries, 1
modtools.js log-write hook. ~1.5h total.

---

### Finding 3 (P1 — semantics) — 5-color rainbow regressed; `data-state` is static, not threshold-driven

**Severity:** P1 (visible to every user every open; semantic miscommunication; explicitly named in SHIPMASTER as P1-46 and tied to P0-03 as a dependency).

**Where:** popup.html:73-139 (eight `data-state` declarations, all hardcoded). Zero JS callers of `setAttribute('data-state'` or `dataset.state`.

**Current static state distribution:**

| Tile | `data-state` | Rendered color | Semantic correctness |
|---|---|---|---|
| Pending | (none -- defaults amber) | amber | OK as default neutral |
| Death Row | `danger` | red | Wrong @ 0; SHIPMASTER §CONFLICT 6 said "keep purple" -- regression |
| Banned | `danger` | red | Wrong; "banned" is the desired terminal state, not a danger condition; especially wrong @ 0 |
| Bans / 24h | `info` | cyan | OK as activity color |
| Msgs / 24h | `good` | green | OK as activity color |
| Notes / 24h | `warn` | warn-orange | Wrong; notes are routine, not warning |
| AI today | `info` | cyan | Wrong @ ≥80% of cap; should escalate amber/red |
| Auto-UNS | `info` | cyan | Moot (never has data) |

**What audit B.3 specified:** "loadStats() should set `tile.dataset.state`
based on thresholds (e.g., Death Row > 0 = danger; Pending > 20 = danger;
everything else defaults to amber)." Quoted verbatim from UIUX2-01 line 52.

**What W1 shipped:** static HTML attributes that lock the color
without regard to value. The threshold logic the audit recommended (and
that the existing `_updateKpiDelta` helper at popup.js:5876 already
implements as a model) was not copied into Stats.

**Fix size:** ~40 lines of JS. Pattern:
```js
function _setStatState(tileSelector, value, thresholds) {
  const tile = document.querySelector(tileSelector);
  if (!tile) return;
  if (thresholds.danger != null && value >= thresholds.danger) tile.dataset.state = 'danger';
  else if (thresholds.warn != null && value >= thresholds.warn)   tile.dataset.state = 'warn';
  else if (thresholds.zeroIsGood && value === 0)                  tile.dataset.state = 'good';
  else delete tile.dataset.state; // back to default amber
}
```
Calls in `loadStats`:
```js
_setStatState('[data-drill="pending"]', pending,   { danger: 20 });
_setStatState('[data-drill="dr"]',      drPending, { danger: 1 });   // any DR is danger
_setStatState('[data-drill="banned"]',  banned,    {});               // amber default; not "danger"
_setStatState('[data-drill="bans24"]',  todayBans, {});
_setStatState('[data-drill="msgs24"]',  todayMsgs, {});
_setStatState('[data-drill="notes24"]', todayNotes, {});
// AI tile inside its async block:
_setStatState('[data-drill="ai24"]', calls / cap, { warn: 0.80, danger: 0.95 });
```
Then strip the `data-state="..."` attributes from popup.html so they
don't lock the initial render. Net: ~40 lines added to popup.js, ~6
attributes removed from popup.html. Estimated: ~45 minutes.

---

### Finding 4 (P1 — CSS hygiene) — Duplicate `.pop-stat-delta[data-dir]` blocks with diverging "flat" color

**Severity:** P1 (semantic conflict, not just dead duplication; the second block wins by source order, but the first-block author's intent is silently overridden).

**Where:**
- popup.css:2339-2341 (`data-dir="up|down|flat"` -- "flat" → `--bb-ink-faint`)
- popup.css:2702-2705 (`data-dir="up|down|flat|none"` -- "flat" → `--bb-ink-dim`, plus an additional `none` rule)

Both blocks have identical specificity (single attribute selector + single class). Source order tiebreak: L2702 wins. So `--bb-ink-dim` is the live color for the flat chip; the L2341 `--bb-ink-faint` rule is dead. The W1 commit added the L2702 block in the new spark/delta CSS section without removing the L2339 block from the canonical block-2 area.

**Why it matters:** The original audit cited "475 !important declarations" and "4 separate `.pop-stats` rule blocks fighting" as the structural defect. W1 cleaned the .pop-stats grid blocks (good), but introduced a new .pop-stat-delta duplicate. Net: stat-related rules are still duplicated, just in different selectors than before.

**Fix size:** Delete popup.css:2339-2341 (3 lines). Pick the desired flat color (suggest `--bb-ink-dim` since that's the live-winning value) and document the choice. Estimated: 5 minutes.

---

### Finding 5 (P1 — dead CSS) — `.pop-stat-spark-bar`, `.pop-stat-spark-bar.today`, `.pop-stat-spark-bar.zero` rules at popup.css:2716-2723 cannot match anything in the popup

**Severity:** P1 (8 lines of `!important`-laden dead code; maintenance hazard; the audit's headline structural concern was CSS bloat).

**Where:** popup.css:2716-2723.

**Why it's dead:** `_injectStatSparkline` (popup.js:911-943) builds a single `<div class="pop-stat-spark"><svg viewBox="..."><polyline /></svg></div>` -- a single container element with an inline SVG inside. It does NOT generate any `<div class="pop-stat-spark-bar">` children. The spark CSS spec from the original audit (UIUX2-01 §D, lines 194-203) was a CSS-bar-chart pattern; the W1 implementation switched to SVG polyline (a different rendering approach) but didn't delete the bar-pattern CSS that was prepped for the abandoned approach.

**Same problem class** (different scope): popup.css:1215-1232 keeps `.pop-stat .value`, `.pop-stat-value`, `.pop-stat-num` selectors that don't match anything popup.html emits (the actual class is `.pop-stat-val`). The `.pop-stat-val` class was added to each selector list ("for safety") rather than the dead three-selector list being deleted.

**Fix size:**
- Delete popup.css:2716-2723 (8 lines).
- Reduce popup.css:1215-1232 to use only `.pop-stat-val` (drop `.pop-stat .value`, `.pop-stat-value`, `.pop-stat-num`). ~6 selector trims.

Net: ~14 lines deleted. Estimated: 10 minutes.

---

### Finding 6 (P1 — CSS bloat budget violation) — `!important` count went UP, not down

**Severity:** P1 (the W1 line-budget premise was that consolidation would reduce `!important` usage; the actual effect was net +14).

**Where:** popup.css overall.

**Numbers:**
- Original audit (UIUX2-01 line 22): "475 !important declarations" in popup.css.
- v10.13.4 ship: 489 declarations (`grep -c "!important" popup.css`).

**Net delta:** +14 declarations. The new W1-introduced rule blocks
(`.pop-stat-head` at popup.css:2686-2692, `.pop-stat-spark` at
popup.css:2708-2723, the second `.pop-stat-delta` block at
popup.css:2693-2705) added their own `!important` to almost every line
on the assumption that the other Bloomberg `!important` rules in the
file would otherwise win specificity ties. Some of those may be
necessary (the v9.7.0 layer at popup.css ~L1180 is the dominant force);
many are not.

**The shipmaster's W1 line-budget said "popup.css -100/+100":** ~zero
net diff. The actual net diff is +14 `!important`s alone, which is
acceptable for the line budget but contradicts the *premise* of the
consolidation pitch. Worth flagging because future waves will keep
inheriting and propagating the pattern unless explicitly
de-`!important`ed.

**Fix size:** Audit, not a one-liner. The `.pop-stat-head` /
`.pop-stat-delta` / `.pop-stat-spark` blocks at popup.css:2685-2723
could probably drop ~10 of their `!important`s without breaking the
cascade because the v9.7.0 Bloomberg block doesn't define those
selectors. Estimated dry-run: ~30 minutes to identify which
`!important`s are actually load-bearing vs. defensive.

---

### Finding 7 (P1 — bug) — `dr-alert` element retains stale content when `drReady` drops to 0

**Severity:** P1 (visible to leads who have just executed pending DR; the popup will show "READY" alert after the inmates are gone).

**Where:** popup.js:1033-1052 (the `if (drReady > 0)` block has no `else`).

**Repro:**
1. Two DR rows are at executable state. `drReady` = 2. Open popup. Alert renders "2 Death Row inmates READY -- visit GAW to execute."
2. Lead opens GAW in another tab and executes both bans. `dr` storage updates to status='done'. `drReady` is now 0.
3. Reopen the popup. `loadStats()` runs. The `if (drReady > 0)` branch is skipped. The alert div retains its previous innerHTML (the SVG + count + READY text).

**Caveat:** `_clearStatSkeletons` clears the value tiles, and the
default popup HTML (`<div class="pop-alert" id="dr-alert"
style="display:none">`) starts hidden. So **first** popup open of a
session is correct. The bug is only on subsequent opens within the
same popup process (which for an extension popup is rare since the
popup is destroyed and recreated on every close-and-reopen). The bug
window is mainly **single popup-open + slow DR execution from another
tab + drill-drawer-without-close-and-reopen**. Realistic but not
common.

**Fix size:** 4 lines:
```js
} else {
  const alert = $('dr-alert');
  if (alert) { alert.style.display = 'none'; alert.innerHTML = ''; }
}
```
Estimated: 5 minutes.

---

### Finding 8 (P2 — semantic) — Death Row tile is `data-state="danger"` (red); SHIPMASTER §CONFLICT 6 explicitly resolved "keep purple for v10.13"

**Severity:** P2 (small visual change for leads; spec-violation more than user-pain).

**Where:** popup.html:81 (`<div class="pop-stat" data-drill="dr" data-state="danger" ...>`).

**Spec violation:** `docs/V10_DESIGN_V2/DESIGN_V2_SHIPMASTER.md` lines 237-241:
> ### CONFLICT 6: Death Row tile color
> - UIUX2-21 §C.4 says keep purple (queue/scheduled state).
> - UIUX2-25 §D.6 says move to yellow (watch-list/surveillance tier; DR is human-initiated extended-watch).
> - UIUX2-01 default uses purple.
>
> **Winner: Keep purple for v10.13.** Revisit with UIUX2-25 semantic split in v10.14.

The W1 commit shipped red. To honor "keep purple," W1 needed either
(a) the inline `style="color:var(--bb-purple)"` it was specifically
deleting, or (b) a `data-state="queue"` or `data-state="scheduled"`
rule with `color: var(--bb-purple)`. Neither shipped.

**Fix size:** Add `.pop-stat[data-state="queue"] .pop-stat-val { color: var(--bb-purple) !important; }` to the popup.css:1226-1233 block (1 line). Change popup.html:81 `data-state="danger"` to `data-state="queue"`. Estimated: 5 minutes.

---

### Finding 9 (P2 — cosmetic) — DR alert SVG dot uses `<circle r="0.5" fill="none">` pattern instead of canonical `<line ... stroke-linecap="round">`

**Severity:** P2 (renders, but inconsistent with the rest of the icon library; trivial).

**Where:** popup.js:1048 (`<circle cx="12" cy="17" r="0.5"/>` inside an SVG with `fill="none"`).

**Why it renders at all:** The 0.5-radius circle has no fill (parent
`fill="none"` applies); the visible "dot" is the 2px stroke ring
around a 0.5-radius circle = a 2.5-radius ring outline. This is a hack
from a pre-Feather-icons era; modern Lucide / Feather warning icons
use `<line x1="12" y1="17" x2="12.01" y2="17"/>` with
`stroke-linecap="round"` to draw a true round dot.

**Fix size:** Replace 1 line. Estimated: 1 minute.

---

### Finding 10 (P2 — cohesion) — Two skeleton tile lists drift from each other

**Severity:** P2 (maintenance-hazard; not user-visible today).

**Where:**
- popup.js:626: `wireStatSkeletons` lists 8 tiles.
- popup.js:645: `_clearStatSkeletons` lists 8 tiles.
- popup.js:3317: anti-flash placeholder list lists 7 tiles (no `s-unsticky`).

The third list silently omits `s-unsticky`. In practice, popup.html:138
hardcodes `--` text content for `s-unsticky`, so the placeholder loop
is moot for that tile. But anyone refactoring popup.html to remove the
hardcoded text would silently break the anti-flash for that tile only.

**Fix size:** Promote the 8-element array to a top-level
`const STAT_TILE_IDS` (or `const STAT_TILE_DEF` if other metadata
attaches), use it in all three sites + the future `_setStatState`
helper. Estimated: 10 minutes.

---

## Recommendations

**Priority order** (driven by the audit's "be brutal" framing and the
"new dogfood patterns" subaxis):

| # | Action | Severity | Effort | Why |
|---|---|---|---|---|
| 1 | Wire the 8th tile (Auto-UNS) data source + drill renderer, OR drop the tile until it's wired | P0 | ~1.5h or ~10min | The shipped placeholder is the same dogfood pattern W1 was specifically named to fix. AI tile got the rescue; this one didn't. |
| 2 | Add `.pop-stat-delta:empty { display: none !important; }` | P0 | 1 line | The first-open ghost-box is the audit's headline defect A.2; it's still drawn 6 times on every fresh popup open. Closes the half-finished W1 fix. |
| 3 | Wire `tile.dataset.state` from value thresholds in `loadStats`; strip hardcoded `data-state` from popup.html | P1 | ~45min | Fixes Finding 3 (5-color rainbow) AND Finding 8 (DR tile color). One pass closes both. |
| 4 | Add the `else { reset dr-alert }` branch | P1 | 4 lines | Finding 7. Trivial. |
| 5 | Delete the duplicate `.pop-stat-delta[data-dir]` rule block at popup.css:2339-2341; delete dead `.pop-stat-spark-bar` rules at popup.css:2716-2723; trim dead `.value` / `.pop-stat-value` / `.pop-stat-num` selectors at popup.css:1215-1232 | P1 | ~10min | Findings 4 & 5. Drops ~25 lines of CSS, kills the maintenance hazard. |
| 6 | Walk popup.css:2685-2723 and de-`!important` the lines that don't need it (don't fight the v9.7.0 block) | P1 | ~30min | Finding 6 directional, not a one-liner. Reduces future-wave inheritance pattern. |
| 7 | Replace `<circle r="0.5">` with `<line x2="12.01" stroke-linecap="round">` in DR alert SVG | P2 | 1 line | Finding 9. Cosmetic. |
| 8 | Promote stat-tile-IDs array to a single shared constant | P2 | ~10min | Finding 10. Pre-emptive cohesion. |

**Total estimated cleanup to land all P0+P1:** ~3.0h. Total to also
include P2 hygiene: ~3.5h.

**The big-picture call:** W1 moved the Stats tab from "definitely
dogfood" to "mostly honest, still has visible flaws." The 6/10 rating
is the right brutal floor: every AC was shipped at some level, but
three of the most user-visible flaws (ghost-box deltas on first open,
the silent placeholder 8th tile, the static-not-thresholded `data-state`)
are exactly the kind of "looks polished but inert in different ways"
pattern the prompt's sub-axis flagged. Closing all P0+P1 from this
audit (≤3h) would land the Stats tab solidly in the 8/10 range. The
final 2 points would require the JetBrains-Mono ASCII-arrow rendering
to actually look as good as the Bloomberg aesthetic the spec promises
-- which is a font-shipping problem more than a code problem.
