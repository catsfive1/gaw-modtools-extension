# UIUX2-05 -- Maintenance Cards V2 Design Critique
**GAW ModTools v10.13 | Design Ralph V2 | Read-Only Audit**
_Date: 2026-05-10_
_Surface: Popup -- 4 maint sub-cards (card-maint-status / -probes / -detect / -integrity)_
_Constraint: 380px wide, amber palette, Bloomberg dense_

---

## A. Does the 4-Card Split Actually Solve the Original Problem?

**Short verdict: Yes on grouping. Partially on density. Two structural problems remain unresolved.**

### What the split solved

The original single `#card-maint` had 13 controls in a flat historical stack with zero semantic grouping and no severity signaling. All buttons rendered identically. Destructive reset lived next to read-only probes. The v10.12 split eliminated those failures cleanly:

- Semantic grouping by operation type is now correct. Status/Probes/Detection/Integrity maps directly to how a mod asks "what do I want to do?" -- check ambient health, run a read, run an AI analysis, or mutate state.
- Severity color hierarchy is implemented (cyan probes, purple AI, amber integrity, red reset). The left-border hover accent is the right call for Bloomberg terminal density -- color appears at the interaction moment, not as constant background noise.
- The old `pop-maint-advanced` accordion is eliminated. That was the right decision: the accordion's organizational axis ("mod-friendly vs. advanced") was never the correct split.
- Badge slots per card are independent, enabling per-category alert signaling for the first time.

### Two problems the split did not solve (and introduced one new one)

**Problem 1: Category imbalance is significant.**

Counting actionable controls per card:

| Card | Controls | Load |
|---|---|---|
| card-maint-status | 2 (Safe Mode toggle + Feature Health display) | Minimal |
| card-maint-probes | 4 (Token, Storage, Selector Drift, Diag) | Balanced |
| card-maint-detect | 2 (Tard Suggest, Sticky Scan) | Minimal |
| card-maint-integrity | 5 (Cookies, Backfill, Schema, Repair, Reset) | Dense |

The status card and detect card are thin -- two items each. On a 380px popup, two-item cards with full card chrome (header bar, border, amber rail, body padding) consume 60-70px of vertical real estate each just for structure. A mod scrolling the tools tab now passes FOUR card headers before reaching Macros. That is scroll friction the original single card never created.

**Problem 2: The "wall of buttons" is partially reconstituted in the Integrity card.**

Five buttons in one collapsed card is the same density problem the split was meant to fix, concentrated in the highest-risk card. A mod who opens Integrity sees: Cookies, Backfill, Schema, Repair, Reset -- still a flat stack, still visually identical (except Reset), still no sub-grouping. Backfill is a one-shot slow operation; Schema and Repair are safe diagnostic writes; Cookies is the "GAW gave me a 403" emergency action; Reset is nuclear. Four distinct behavioral profiles in one card with no internal differentiation.

**New problem introduced: Structural inconsistency between cards.**

Cards 1, 2, and 3 use `<div class="gam-card">` with `<div class="gam-card-header">`. Card 4 uses `<details class="gam-card">` with `<summary class="gam-card-head">`. The CSS covers both (`.gam-card > summary.gam-card-head, .gam-card-head`), but the rendered behavior differs: cards 1-3 are always-open permanent panels; card 4 is a collapsible. This is intentional but creates two UX inconsistencies:

- A mod who wants to collapse the Probes card cannot. Cards 1-3 have no collapse affordance. This is a dead end for future density management.
- The amber rail on `.gam-card:hover::before { width: 4px }` signals "this rail responds to hover, implying the card is interactive/collapsible." Cards 1-3 have the hover-thickening rail but no collapse action behind it. That is a false affordance.

---

## B. Category Balance Assessment

### Are the categories the right categories?

Yes. Status / Probes / Detection / Integrity maps correctly to four distinct mental models:

- **Status:** "What is the system doing right now without me touching anything?"
- **Probes:** "I want to read diagnostic state. No side effects."
- **Detection:** "I want AI to analyze something. Budget-aware, async."
- **Integrity:** "I want to change or repair state. Consequences."

The mental model split is correct. The execution density is off.

### What should change for v2

**Option A (recommended): Merge Status into Probes header.**

Safe Mode toggle and Feature Health are two items that do not warrant their own card header. Feature Health is a passive display that appears only when a feature is degraded -- it is hidden by default (`display:none`). Safe Mode is one toggle. These belong as the top two rows of the Probes card under a visual sub-label, not as a standalone card.

Result: 3 cards total (Probes+Status merged, Detection, Integrity). Scroll overhead drops by one full card header (~60px). The Probes card becomes 6 rows -- still manageable at Bloomberg density (6 x 32px = 192px body, fits in 380px popup without scrolling the card).

**Option B: Keep 4 cards, give Status card substance.**

Surface `maintWarningChip` content (the `gam_maint_warning` flag) inside the Status card body as a structured warning row rather than just in the popup header chip. Add the `gam_fallback_mode` NATIVE MODE indicator as a second status row. This gives Status card 4 real rows (Safe Mode, Feature Health, Maint Warning state, Fallback Mode state) and earns its card chrome.

**Option A is the right call for 380px.** Bloomberg density means every card header costs approximately the same pixel height as 2 data rows. A two-item card fails that test.

---

## C. Integrity Card Internal Structure

The Integrity card needs internal sub-grouping. Five buttons with no internal differentiation at the highest-risk tier is the original problem compressed.

### Recommended internal structure

Three behavioral tiers within Integrity:

**Tier 1 -- Emergency (run-it-now operations):**
- Clear stuck cookies + localStorage -- the "GAW gave me 403" operation
- Backfill modmail history -- one-shot, slow, no undo

**Tier 2 -- Safe writes (diagnostic repairs):**
- Schema migration check
- Repair settings

**Tier 3 -- Destructive (nuclear):**
- Reset settings to defaults

Implementation: two `gam-card-subsection` dividers with `gam-card-sub-label` labels ("EMERGENCY" in amber, "REPAIR" in ink-dim, "DESTRUCTIVE" in red) between the tiers. This uses existing CSS already in the system. Zero new classes needed. The triple-confirm on Reset already handles pre-click friction; the sub-label "DESTRUCTIVE" adds pre-open friction at the visual scan level.

---

## D. Color Hierarchy -- Does It Work?

The severity-color system is correct in design and correct in implementation. Assessment by signal:

**Cyan (Probes):** Right choice. Cyan on a dark amber-dominant terminal reads as "informational, safe, read-only." No false urgency. The hover left-border at 3px is readable without competing with the amber card rail.

**Purple (Detection):** Right choice. Purple signals "AI / cost / async" as a distinct category from both safe reads and dangerous writes. The budget implication is communicated by color alone, which creates one weakness: a new mod with no color context cannot know purple = AI budget without tooltip exposure. The card title "[AI] Detection" mitigates this -- the word "AI" is in the header.

**Amber (Integrity):** Correct for write/repair operations. The card head amber rail is already the system-wide amber signal, so Integrity card body inheriting amber for its action rows is consistent. One collision: the system-wide amber on `.gam-card-title` means ALL card titles are amber. The Integrity card title "[INT] Integrity" is amber like every other title. There is no visual step-up for the highest-risk card at the header level.

**Recommendation:** Give the Integrity card title `--bb-amber` at higher weight (or the integrity card header a `background: var(--bb-amber-bg)` tint) so it reads visually louder than the three peer cards. A mod scanning the popup should feel the integrity card "costs more to enter."

**Red (Reset):** Correct. The `#maintReset` rule (red text + red border + red-bg) is properly scoped. The `!important` overrides are necessary given the cascade depth. One note: the current CSS has `color: var(--bb-red) !important` on the button but the button text in the HTML uses emoji unicode `&#x1F198;` (SOS button). If the emoji renders at non-monochrome on any platform, it breaks the "red text is the only red in the row" signal. Recommend replacing with a text label only: "RESET TO DEFAULTS" in red, no emoji prefix.

---

## E. Click Target Floor Assessment

**32px minimum is specified. Current implementation delivers it -- barely.**

The `.pop-maint-action-row` has `min-height: 32px`. The `.pop-maint-action-row .pop-btn` inside it has `min-height: 28px` with `padding: 5px 8px`. The button's actual hit area expands because `flex: 1` makes it fill the row width, and the row is `min-height: 32px`. So the effective click height is 32px from the row, not 28px from the button's own min-height.

This works, but only because the row and button are co-aligned. If the status div on the right has content that pushes the button to wrap (unlikely at 380px but possible with long status strings), the button could compress below 32px.

**Recommendation:** Set `min-height: 32px` directly on `.pop-maint-action-row .pop-btn` (not just 28px) to make the floor self-enforcing regardless of row content. Add `box-sizing: border-box` to ensure padding is included in that 32px. This is a 2-line CSS change.

WCAG 2.5.8 (Target Size Minimum) requires 24x24px at AA, 44x44px at AAA. The 32px floor exceeds AA. For a dense terminal UI where the user has precision-pointing (mouse), 32px is defensible. Touch is not a target surface for this popup.

---

## F. Status Line Assessment

The `.pop-maint-action-status` pattern is correct: inline-right, tabular-nums, colorized by result class (.ok/.warn/.err), hidden when empty. Two issues:

**Issue 1: `max-width: 120px` is too tight for real status strings.**

Actual status strings from popup.js include:
- `"47d green / ok"` -- fits
- `"no matching cookies found (12 inspected). reload GAW tabs to test."` -- truncates at 120px
- `"migrated v3 -> v4 (added 2 default(s))."` -- borderline
- `"Llama: no suggestions (budget: 0/5 remaining)"` -- truncates

When status strings truncate silently (no ellipsis, no tooltip), the mod loses outcome information. The status div has `white-space: nowrap` and no `text-overflow: ellipsis`, so text simply clips at the max-width boundary -- the worst possible truncation behavior.

**Recommendation:**
```css
.pop-maint-action-status {
  /* Remove max-width: 120px */
  max-width: none;
  /* Allow wrapping for long status */
  white-space: normal;
  word-break: break-word;
}
```
This lets the status wrap to a second line within the row. The row min-height accommodates this naturally because `align-items: center` reflows. For Bloomberg density, a two-line status row is acceptable -- it signals "this action returned information worth reading."

**Issue 2: Status persists across sessions.**

Status divs are in-memory DOM only -- they reset when the popup closes. A mod who ran Token Probe, got "47d green / ok", closed the popup and reopened it, sees an empty status. This is correct behavior for non-persistent state. No change needed, but it should be documented in the design so future implementers do not add persistent status caching unnecessarily.

---

## G. `__maintWire` Pattern Assessment

The `__maintWire(id, fn, label)` pattern is minimal and correct:

```javascript
function __maintWire(id, fn, label) {
  const b = $(id);
  if (!b) return;
  b.addEventListener('click', () => withLoading(b, label || 'running...', fn));
}
```

The null-guard `if (!b) return` is the key defensive piece -- it means wiring calls for elements that do not exist in the current HTML (e.g., lead-only elements not present for non-lead mods) silently no-op rather than throwing. This is correct.

**One dead wire identified:**

`__maintWire('maintRehydrateAlias', maintForceRehydrate, 'rehydrating...')` is called at line 5306 of popup.js, but `#maintRehydrateAlias` does not exist in the current HTML (not in cards 1-4, confirmed by full HTML grep). This wire silently no-ops. The function `maintForceRehydrate` exists in JS and has a `__maintSetStatus('maintRehydrateAliasStatus', ...)` target that also does not exist. This is a ghost wire -- the feature was presumably removed from the HTML at some point and the JS wire was not cleaned up. Not a runtime error, but dead code.

**Additional ghost wires** (buttons in lead-only section at popup.html ~L712, using old `pop-maint-row` class, not the new `pop-maint-action-row`):
- `maintAuditVerify` -- wired, exists in HTML at L714 inside the lead panel, uses old `.pop-maint-row` / `.pop-maint-status` classes, not the new action-row system
- `maintFullReport` -- same
- `maintRosterStaleness` -- same
- `maintMigrationDebt` -- same

These lead-panel maint buttons are NOT in the 4-card system. They live in a separate section (the lead panel at ~L700 in popup.html). They use the pre-v10.12 class names (`pop-maint-row`, `pop-maint-status` via `pop-token-status pop-maint-status`). This is a two-tier maintenance surface -- the 4-card system for all mods, plus a separate lead-panel section for lead-only operations. This is functionally correct but architecturally inconsistent: lead-only maint operations sit outside the maint card system with different CSS classes and no severity coloring.

**Recommendation for v2:** The lead panel maint buttons (Audit Verify, Full Report, Roster Staleness, Migration Debt) should adopt `pop-maint-action-row` / `pop-maint-action-status` classes and receive amber left-border severity styling. They are already scoped to lead-only by JS visibility gating. This is a CSS-class swap only, no structural change.

---

## H. Summary -- V2 Recommendations (Priority Order)

### H.1 Merge Status card into Probes header [MEDIUM -- 45min]

The two-item Status card does not earn its card chrome. Merge Safe Mode toggle and Feature Health display as the top two rows of card-maint-probes under a `gam-card-sub-label` "SYSTEM STATE" divider. Eliminates one full card header from scroll path. Reduces 4 cards to 3.

If Option B is preferred (keep 4 cards, add substance to Status): route `gam_maint_warning` and `gam_fallback_mode` display into the Status card body as dedicated status rows, replacing the popup-header chip as the primary surface for these signals.

### H.2 Sub-group Integrity card internally [MEDIUM -- 30min]

Add two `gam-card-subsection` + `gam-card-sub-label` dividers to card-maint-integrity:
- "EMERGENCY" section: Cookies, Backfill
- "REPAIR" section: Schema, Repair Settings
- "DESTRUCTIVE" section: Reset (red sub-label, red button, no other items)

Uses existing CSS. Zero new classes. Eliminates the flat-stack problem in the highest-risk card.

### H.3 Remove emoji prefixes from maint buttons [LOW -- 15min]

The HTML uses emoji unicode in button text (`&#x1F511;`, `&#x1F4CA;`, `&#x1FA7A;`, etc.) inside a Bloomberg terminal aesthetic that otherwise uses no emoji. These emoji are cross-platform inconsistent (render at 12-16px color emoji on Windows, black-and-white on some Linux). They undermine the monochrome terminal identity. Strip them. The button labels are self-describing without icons.

Exception: Safe Mode warning triangle `&#x26A0;` may stay as it is a unicode geometric character, not a color emoji, and the warning signal is useful.

### H.4 Fix Reset button emoji [LOW -- 5min]

`&#x1F198;` (SOS button -- red emoji on most platforms) before "Reset settings to defaults" overrides the red CSS color signal with a color emoji. Replace button text with "RESET TO DEFAULTS" in uppercase -- the red text + border is sufficient friction signal.

### H.5 Fix `.pop-maint-action-status` truncation [LOW -- 10min]

Remove `max-width: 120px` and `white-space: nowrap`. Allow status text to wrap. Add `text-overflow: ellipsis; overflow: hidden` only if `white-space: nowrap` is retained (pick one approach). Status truncation currently clips silently with no indicator.

### H.6 Fix `.pop-maint-action-row .pop-btn` min-height [LOW -- 5min]

Change `min-height: 28px` to `min-height: 32px` on the button directly. Makes the 32px floor self-enforcing at the element level.

### H.7 Fix false affordance on non-collapsible card rails [LOW -- 15min]

Cards 1-3 have the amber rail hover-thicken behavior (`:hover::before { width: 4px }`) but no collapse action. Either:
- Remove the hover-thicken rule for `div.gam-card` (apply it only to `details.gam-card`)
- Or add a CSS custom property `--card-collapsible: 0` on div cards and gate the hover rule on it

The hover rail thickening currently implies interactivity that does not exist.

### H.8 Adopt new action-row classes for lead panel maint buttons [LOW -- 20min]

Swap `pop-maint-row` / `pop-maint-status` for `pop-maint-action-row` / `pop-maint-action-status` on the 4 lead-panel maint buttons (Audit Verify, Full Report, Roster Staleness, Migration Debt). Pure CSS-class swap. No JS changes. Unifies the maint button visual system across both surfaces.

---

## Appendix: Issues Out of Scope for This Audit

The following were observed but are not UX-05 surface issues:

- **Ghost wire: `maintRehydrateAlias`** -- dead JS wire with no corresponding HTML element. Should be removed in a JS cleanup pass (not a UX issue, a dead code issue).
- **`maintWarningChip` location** -- the chip writes to `#maintWarningChip` which is in the popup header, not in card-maint-status. If H.1 Option B is adopted, the chip routing should be reviewed.
- **Lead-only autonomous maintenance section** (~L5686 popup.js, ~L712 popup.html) -- architecturally separate from the 4-card system. Its UX is out of scope for UIUX2-05 but should be addressed in UIUX2-08 (lead card) context.

---

_Read-only. No code changes in this document._
_Files audited: popup.html (L258-404), popup.css (L1716-1799), popup.js (__maintWire block L5294-5629, __maintLoadWarning L5631-5671)_
_Prior art: docs/V10_DESIGN/UIUX-05_maint_card.md_
