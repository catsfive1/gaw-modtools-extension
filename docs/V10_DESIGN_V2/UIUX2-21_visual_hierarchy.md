# UIUX2-21 — Visual Hierarchy Audit
**Bloomberg-Terminal Chrome Extension — v10.13 Design Ralph V2**
Auditor: UIUX2-21-HIERARCHY | Date: 2026-05-10

---

## A. Failure Patterns

Six structural failure modes recur across the 30+ surfaces sampled.

### A.1 The Wall of Equal Weight (most widespread)

**What it looks like:** Every element rendered at the same font-size (11-12px), the same color (#8b929e or #e8eaed), the same border (#2a2f38), the same padding. The eye has no starting point.

**Where it hits hardest:**
- **Tools tab** — "Diagnostics" subsection: Debug Snapshot, Dashboard, and the five crawl pills all render as `.pop-btn-ghost` at 10px / #8b929e. None is visually promoted over the others. There is no primary action in this group.
- **Maintenance cards ([PRB] Probes, [AI] Detection, [INT] Integrity)** — every row is identical: emoji + label + `pop-btn` (no modifier). Token health probe, Storage health probe, Selector drift report, Diag log status are all rank-1 visually even though they have different operational urgency.
- **Lead tab / Deep Dive accordion** — all five sub-accordions (Rotation, Bug Reports, Maintenance Reports, Diagnostics & Audit, Settings) use the same `gam-lead-sub summary` style. Open state has no visual indicator that differs between "active, in-use sub-section" and "collapsed".

### A.2 Primary CTA Lost in Peers

**What it looks like:** The `.pop-btn-primary` class (blue fill, #4A9EFF) exists but is applied inconsistently or not at all where the most important action lives.

**Instances:**
- **Stats tab action grid** — only `Users` gets `.pop-btn-primary`. `Queue`, `Ban`, and `GAW` all get plain `.pop-btn`. In a 4-column grid that fills uniformly, the blue fill on Users is the ONLY hierarchy signal in the row — and it is weakened because the other three buttons are identical-weight. The eye reads four equal buttons, not one primary + three secondary.
- **First-run wizard** — `Save & verify` has `background:#ff9933` hardcoded inline, which is correct conceptually (it IS the primary action) but bypasses the token system. It looks distinct from everything else but inconsistently so.
- **Mod Console (.gam-mc-actions)** — Ban and Cancel buttons use `.gam-btn-danger` and `.gam-btn-cancel` respectively. Correct class usage. However, the minimum width of 160px for *both* makes them equal in visual weight. The destructive action (ban) has no SIZE advantage over cancel.
- **Context menu (.gam-ctx-menu)** — items are all `height:28px; font-size:11px`. Danger items get `color:#f04040` but no size or weight signal. Users do not see "this action is terminal" until they read.

### A.3 Muted Text That Is Actually Readable (over-muted inverse)

**What it looks like:** Secondary and tertiary content is so dim it becomes invisible at display brightness, defeating the purpose of keeping it on-screen.

**Instances:**
- `.pop-stat-label` is `font-size:9px; color:#5c6370 (TEXT3)`. This is tertiary-text color at the smallest type size in the system (9px). Tile labels (Pending, Death Row, Banned, Bans/24h) are arguably the second most important element in the stats grid — they tell you WHAT the number means — yet they render below WCAG AA contrast for normal text (the #5c6370 on #181b20 pairing is approximately 4.1:1, which passes large text but 9px is not large text under WCAG 3.3).
- `.pop-token-hint` at `font-size:10px; color:#5c6370` — the capability description under every token input field. This is informational enough to warrant TEXT2 (#8b929e), not TEXT3.
- `gam-card-sub-label` (Tools tab subsection headers "Diagnostics", "Data Harvest") — these are effectively section titles, but they are styled at the same weight as surrounding ghost buttons. No uppercase tracking, no promoted weight in the baseline CSS; the distinction comes only from context.
- `.gam-tip-meta` (tooltip): `color:TEXT3; font-size:10px` — account age, join date, karma. This is genuinely tertiary and is correctly muted.

### A.4 Color Overloaded as the Only Differentiator

**What it looks like:** Every semantic signal is expressed through color alone, with no weight or size variation supporting it. This fails for colorblind users AND in dense grids where color nuance compresses visually.

**Instances:**
- **Stats grid** — each of the 8 tiles uses a *different* accent color for its value: `var(--bb-purple)` (Death Row), `var(--bb-red)` (Banned), `var(--bb-cyan)` (Bans/24h), `var(--bb-green)` (Msgs/24h), `var(--bb-warn)` (Notes/24h), `#c084fc` (AI today), `var(--bb-cyan)` (Auto-UNS). Eight tiles, five distinct colors, no hierarchical meaning. The eye reads "colorful" not "prioritized." The semantic intent (red=bad, cyan=informational) is lost in the rainbow.
- **Drill pills** (`.pop-drill-pill`): banned / pending / dr / ready / note / msg / ban — all correct semantically, but a user skimming six pills in a drill row must read-the-color, not read-the-size. No pill is visually primary.
- **Mod Console tab bar** — active tab is `.gam-mc-tab-active` with background:ACCENT (#4A9EFF). Correct. Inactive tabs are `color:TEXT2`. Adequate hierarchy here, actually.

### A.5 Implicit Rank With No Visual Separator

**What it looks like:** Groups of actions or data that have different conceptual tiers are presented without the visual separation that signals "these belong to different ranks."

**Instances:**
- **Maintenance cards**: [SYS] System Status + Safe Mode toggle sits above [PRB] Probes + [AI] Detection + [INT] Integrity. All four use the same `.gam-card` class with the same `gam-card-header` + `gam-card-title` pattern. The card frame is the only separator. Users scanning the Tools tab see a stack of identically-weighted cards — there is no "always visible OS-level info" vs "run-once diagnostic" visual distinction.
- **Lead tab / Quick Actions Bar** (`#leadQuickActions`): the `+ Invite`, `Rotate`, separator, `Bugs`, `Maint`, `Chat` buttons all render as `.gam-qa-btn` with no size or color variation. Invite (high-frequency) and Chat (external link) have the same visual weight as Bugs (inspect panel, lower frequency).
- **Footer** — `Export log · Import · Factory reset` uses `pop-link` (#8b929e) for all three. `Factory reset` gets `.pop-link-danger` (hover: #f04040), which is correct on hover, but resting state is identical to the other two — the dangerous action has no distinguishing resting appearance.

### A.6 Depth/Z-Layer Inconsistency

**What it looks like:** Modal and overlay surfaces use inconsistent visual elevation signals (gradient vs flat, border thickness, shadow), making depth ambiguous.

**Instances:**
- `.gam-modal-header` still has `background:linear-gradient(180deg,${C.BG2} 0%,${C.BG} 100%)` — a gradient that was supposed to be removed per "Bloomberg no gradients" rule (noted in the drill-head comment at popup.css:458). The modal title is 13px/700 weight (correct for a T1 heading on a modal), but the gradient header breaks the flat surface rule.
- `#gam-tooltip` has `border-left:3px solid ACCENT` — a left-rail accent. This is actually a correct hierarchy signal (it visually elevates the tooltip above the page canvas). This pattern is NOT consistently used across other surfaces. Status-bar uses the same `inset:3px 0 0 ACCENT` in modmail bar. Inconsistency in where the "accent-rail = elevated surface" convention applies.

---

## B. Hierarchy Ranking System

Three content tiers, two mute levels. Binding across all surfaces.

### B.1 Tier Definitions

| Tier | Name | Purpose | User's eye should land here: |
|------|------|---------|------------------------------|
| **T1** | Primary | Single most important action or status value per surface | First |
| **T2** | Secondary | Supporting labels, secondary actions, status values | Second |
| **T3** | Tertiary | Metadata, timestamps, hints, keyboard shortcuts | Third / on demand |
| **M1** | Muted-interactive | Ghost buttons, filter controls, footer links (actionable but low-priority) | Only when scanning |
| **M2** | Muted-static | Legal hints, version number, help text, status footnotes | Never required |

### B.2 Rendering Rules Per Tier

**T1 — Primary**
- Font: 13-20px, weight 700
- Color: surface-contrast primary (`#e8eaed` / `--bb-ink`) OR brand signal (`#ff9933` amber for brand, `#4A9EFF` blue for form CTA, `#f04040` red for destructive-primary)
- Background: filled (`#4A9EFF`, `#ff9933`, `#f04040` — never transparent for buttons)
- Size signal: larger than all peers on the same surface by >= 1 type step
- ONLY ONE T1 element per visible surface region. If you have two T1 elements, one of them is T2.

**T2 — Secondary**
- Font: 11-12px, weight 600
- Color: `#8b929e` (TEXT2 / `--bb-ink-dim`) OR appropriately muted semantic color (e.g., `#8b929e` label, not raw RED)
- Background: bordered-transparent (ghost pattern) or `#181b20` panel
- Hover: reveals accent border (`#4A9EFF`) or slightly lighter background — no full-fill change

**T3 — Tertiary**
- Font: 10-11px, weight 400-600
- Color: `#5c6370` (TEXT3 / `--bb-ink-faint`)
- No interactive affordance unless explicitly a link
- Max one visual decoration (italic, monospace family, or dimmer color — not both italic AND color AND small)

**M1 — Muted-interactive**
- All ghost buttons, footer links, toolbar icon buttons at rest
- Font: 10-11px, weight 600
- Color at rest: TEXT2 (#8b929e) or TEXT3 (#5c6370)
- Focus/hover: accent border + TEXT (no fill unless T2 promotion)
- Danger M1 (Factory Reset, Delete, ctx--danger): TEXT2 at rest, RED on hover. NOT red at rest — that's reserved for T1 destructive.

**M2 — Muted-static**
- Version badge, timestamps below 10px, keyboard shortcut hints
- `font-size:9-10px; color:#5c6370`
- Not interactive. If a M2 element is hovered, nothing should change.

---

## C. Token and Class Specification

These are additive to the existing token set — no renames required.

### C.1 New Semantic Classes (popup.css)

```css
/* === Hierarchy rank classes === */

/* T1: Primary CTA fill — one per visible surface region */
.pop-h1-cta {
  background: var(--bb-amber);       /* brand primary */
  border-color: var(--bb-amber);
  color: #0a0a0b;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 16px;
  min-height: 36px;
}
.pop-h1-cta-danger {
  background: var(--bb-red);
  border-color: var(--bb-red);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 16px;
  min-height: 36px;
}
.pop-h1-cta-form {
  background: #4A9EFF;               /* form/input CTA, NOT brand */
  border-color: #4A9EFF;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 16px;
}

/* T2: Secondary action — bordered ghost with text promotion */
.pop-h2-action {
  background: transparent;
  border: 1px solid #2a2f38;
  color: #e8eaed;                    /* promoted to TEXT, not TEXT2 */
  font-size: 11px;
  font-weight: 600;
}
.pop-h2-action:hover {
  border-color: #4A9EFF;
  background: rgba(74,158,255,.06);
}

/* T3: Tertiary metadata label */
.pop-h3-meta {
  font-size: 10px;
  color: #5c6370;
  font-weight: 400;
  letter-spacing: 0.2px;
}

/* M1: Muted interactive (current pop-btn-ghost is M1 — formalize name) */
/* No new class needed — pop-btn-ghost IS M1. Just apply consistently. */

/* M2: Static muted text */
.pop-m2-static {
  font-size: 9px;
  color: #5c6370;
  pointer-events: none;
  user-select: none;
}
```

### C.2 CSS Variable Additions (the `--bb-` token set)

```css
/* Add to the :root block in popup.css or the var() block in modtools.js */
--bb-t1-size: 13px;
--bb-t1-weight: 700;
--bb-t2-size: 11px;
--bb-t2-weight: 600;
--bb-t3-size: 10px;
--bb-t3-weight: 400;
--bb-muted-size: 9px;

/* Semantic rank colors (use these instead of raw hex in new code) */
--bb-rank-primary: var(--bb-amber);       /* T1 brand */
--bb-rank-form-cta: #4A9EFF;              /* T1 form submit */
--bb-rank-destructive: var(--bb-red);     /* T1 danger */
--bb-rank-secondary: var(--bb-ink);       /* T2 ink */
--bb-rank-tertiary: var(--bb-ink-faint);  /* T3 / M1 rest */
--bb-rank-static: var(--bb-ink-faint);    /* M2 */
```

### C.3 Content-Script Side (modtools.js GAM_CSS)

The content-script injects CSS as string templates. Apply the same rules via the `C` constant aliases already in place:

```js
// T1 primary — use C.AMBER for brand CTA, C.RED for destructive
// T2 secondary — use C.TEXT for promoted ghost buttons
// T3 metadata — use C.TEXT3 (#5c6370)
// M1 muted interactive — use C.TEXT2 (#8b929e) rest, C.TEXT on hover
// M2 static muted — use C.TEXT3, no hover state
```

### C.4 Stats-Grid Color Normalization

Replace the 5-color rainbow with semantic intent + ONE neutral:

| Tile | Current | Correct | Reason |
|------|---------|---------|--------|
| Pending | `#e8eaed` (white) | `var(--bb-ink)` | Neutral — it's a count, not a status |
| Death Row | `var(--bb-purple)` | `var(--bb-purple)` | Keep — purple signals "scheduled/queued state" |
| Banned | `var(--bb-red)` | `var(--bb-red)` | Keep — red signals harm/termination |
| Bans/24h | `var(--bb-cyan)` | `var(--bb-warn)` | Cyan is "informational"; bans are operational urgency → warn |
| Msgs/24h | `var(--bb-green)` | `var(--bb-ink-dim)` | Green means "healthy/safe" — messages aren't a health signal |
| Notes/24h | `var(--bb-warn)` | `var(--bb-ink-dim)` | Notes are routine, not a warning |
| AI today | `#c084fc` | `var(--bb-purple)` | Align with purple=AI/queue semantic |
| Auto-UNS | `var(--bb-cyan)` | `var(--bb-cyan)` | Keep — informational automation count |

Net result: 3 semantic colors (red, purple, cyan) + ink/ink-dim for routine counts. Rainbow collapses to a legible signal system.

---

## D. Per-Surface Violations (Sampled)

### D.1 Stats Grid (popup.html lines 67-143)

| Element | Current weight | Correct tier | Violation |
|---------|---------------|--------------|-----------|
| `.pop-stat-val` (the number) | 20px/700/accent-color | T1 | **Correct weight, wrong color** — 5 different colors, no common hierarchy signal |
| `.pop-stat-label` (tile name) | 9px/600/#5c6370 | T2 | **Under-ranked** — label identifies the metric; should be TEXT2 (11px), not TEXT3 (9px) |
| `.pop-stat-delta` | 9px (inherited) | T3 | Correct tier, but delta direction symbols are unweighted — user cannot at-a-glance parse up/down |
| `.pop-stat-spark` | implicit | M2 | Sparkline is M2 static. Correct. |
| Action grid: Users | `.pop-btn-primary` | T1 | **Only T1 in grid — correct but isolated.** 3 peers at same visual weight erode the signal. |
| Action grid: Queue/Ban/GAW | `.pop-btn` (base) | Should be T2 | **Missing tier class.** These are secondary nav, not primary. |

### D.2 SUS Tooltip / Hover Card (`#gam-tooltip`, modtools.js)

| Element | Current weight | Correct tier | Violation |
|---------|---------------|--------------|-----------|
| `.gam-tip-name` | 13px/700/TEXT | T1 | **Correct.** Username is the primary identity anchor. |
| `.gam-tip-chip` (ok/bad/warn/dr) | 10px/700/uppercase | T1 adjacent | **Over-weighted** — chips compete with the name. Should be T2 badges. Weight 600 not 700. |
| `.gam-tip-meta` (join date, karma) | 10px/TEXT3 | T3 | **Correct tier, correct color.** |
| `.gam-tip-score` | 11px/600 | T2 | **Correct.** |
| `.gam-tip-stats` | 10px/TEXT3 | T3 | **Correct.** |
| `.gam-tip-ctrl-btn` (Pin, Ban, Close) | 10px/600/TEXT2 | M1 | **Correct** — these are secondary controls in the tooltip context. |
| `.gam-tip-ctrl-dr` (Death Row) | same as above + red border/color | T1 destructive | **Under-differentiated.** DR action in a tooltip is T1 destructive. It should be visually distinct from the other control buttons, not just color-differentiated. Use 11px + red fill or explicit `pop-h1-cta-danger` style. |

### D.3 Mod Console (gam-mc-*, modtools.js)

| Element | Current weight | Correct tier | Violation |
|---------|---------------|--------------|-----------|
| `.gam-mc-user` | 15px/700/TEXT | T1 | **Correct.** Username anchors the console. |
| `.gam-mc-pill` (status chips) | 10px/700/uppercase | T2 | **One step over-weighted.** Pills should be 10px/600. |
| `.gam-mc-h` (section headers: Notes, History) | 11px/700/uppercase/TEXT2 | T2 | **Correct.** |
| `.gam-mc-stat-v` (stat values in 4-col grid) | 18px/700/TEXT | T1 within tile | **Correct** — same issue as pop-stat-val: the label below it (`.gam-mc-stat-l`) is 9px/TEXT3. Under-ranked tile labels. |
| `.gam-mc-q-label` (quick-action tile label) | 13px/700/TEXT | T1 within tile | **Correct.** Quick-action tiles have clear T1 labels. |
| `.gam-mc-q-sub` (tile subtitle) | 10px/TEXT3 | T3 | **Correct.** |
| `.gam-mc-dur` (ban duration tiles) | 11px/600/TEXT2 | M1 | **Correct** — they are selection options, not a primary CTA until selected. |
| `.gam-mc-dur-active` | RED fill | T1 | **Correct** — active selection is elevated. |
| Ban submit button (.gam-btn-danger) | `.gam-btn-danger` = RED fill | T1 destructive | **Correct class, wrong size parity** — ban button is same min-width (160px) as cancel. Ban should be slightly visually dominant. Recommend ban 170px min, cancel 120px min, or weight 700 vs 600. |
| `.gam-mc-actions` spacing | `margin-top:16px` | — | **Correct** — sufficient whitespace to rank actions above body. |

### D.4 Context Menu (gam-ctx-menu, modtools.js)

| Element | Current weight | Correct tier | Violation |
|---------|---------------|--------------|-----------|
| `.gam-ctx-head` (username label) | 10px/700/uppercase/TEXT3 | T3 | **Correct** — it's a non-interactive header identifying context. |
| `.gam-ctx-item` (standard) | 11px/TEXT | T2 | **Correct.** Standard actions are secondary. |
| `.gam-ctx-item--danger` | 11px/RED | T1 | **Under-weighted.** Danger items are only color-differentiated. No size, weight, or background signal separates them from standard items. Add `font-weight:700` and optionally a red-tinted background at rest (rgba(240,64,64,.04)) to create a resting visual distinction — not just hover. |
| `.gam-ctx-item--lead` | 11px/PURPLE + small diamond glyph | T2 | **Correct** — the diamond glyph adds a non-color dimension to lead-only items. Good pattern. Replicate for danger: add a skull/warning glyph to `--danger` items. |
| `.gam-ctx-kbd` (keyboard shortcuts) | 9px/TEXT3 | M2 | **Correct.** |

### D.5 Maintenance Cards (popup.html lines 265-404)

| Element | Current weight | Correct tier | Violation |
|---------|---------------|--------------|-----------|
| `.gam-card-title` ("[SYS] System Status") | 12px(implied)/600 | T1 card header | **Correct** — the `[TAG]` prefix is a useful type signal. |
| `.pop-maint-action-row button` (.pop-btn) | 11px/600/#e8eaed / #181b20 bg | T2 | **Wall of equal weight** — 4 probes, 2 AI routines, 5 integrity ops all render identically. None is visually prioritized as the "recommended first action." |
| Safe Mode toggle label | inline style, bg:transparent | M1 | **Poorly anchored** — "Safe Mode" uses `pop-btn` styling as a non-interactive label. Semantic mismatch creates visual confusion. |
| `[INT] Integrity` card | `<details>` collapsed | — | **Correct decision** — destructive ops are collapsed by default. The `[INT]` tag signals risk. But the collapsed summary renders identically to other card summaries. It should carry a red left-rail or amber warning glyph at rest. |
| `.pop-maint-action-status` | 10px/TEXT3 | T3 | **Correct.** Status feedback is T3. |

### D.6 Intel Drawer (`#gam-intel-drawer`, modtools.js)

| Element | Current weight | Correct tier | Violation |
|---------|---------------|--------------|-----------|
| Drawer title (from `gam-modal-title`) | 13px/700/TEXT | T1 | **Correct.** |
| `.gam-modal-header` | gradient background | — | **Violation of Bloomberg flat-surface rule.** The `linear-gradient(180deg,BG2 0%,BG 100%)` was marked for removal but persists. Flat `BG2` fill required. |
| Tab bar (`.gam-mc-tab-active`) | ACCENT fill | T1 within nav | **Correct.** |
| AI Analysis button (`#gam-intel-ai-go`) | `.gam-btn gam-mc-ai-btn` | T1 | Needs to be the visually dominant element in that section. Inspect whether it currently gets `.gam-btn-accent` fill — it should. |
| Copy button (`#gam-intel-ai-copy`) | `.gam-btn gam-mc-ai-use` | T2 | Secondary to the analysis run. |

---

## E. Effort Estimate

| Fix | Scope | Effort | Impact |
|-----|-------|--------|--------|
| Stats-grid color normalization (5 colors → 3 semantics + ink) | popup.html: 8 `style=` attributes | 30 min | High — eliminates rainbow confusion on the default view |
| Stat-tile label promotion: 9px TEXT3 → 11px TEXT2 | popup.css `.pop-stat-label` | 5 min | Medium — improves readability immediately |
| Action grid T2 class: Queue/Ban/GAW get `.pop-h2-action` | popup.html: 3 elements | 10 min | Medium — isolates the T1 Users button |
| Footer danger-at-rest signal: Factory reset gets distinct resting color | popup.css `.pop-link-danger` | 5 min | Medium — safety improvement |
| Context menu danger items: font-weight:700 + rest-state red-tint bg | modtools.js GAM_CSS | 10 min | Medium |
| Context menu danger glyph (parallel to lead diamond) | modtools.js GAM_CSS | 15 min | Low-Medium |
| Modal header: remove gradient, flat BG2 fill | modtools.js GAM_CSS | 5 min | Low (visual polish, aligns with Bloomberg flat rule) |
| Integrity card: red left-rail at rest | popup.css or popup.html inline | 10 min | Medium — signals "destructive zone" before expand |
| Death Row tooltip button promotion to T1-destructive style | modtools.js, gam-tip-ctrl-dr | 15 min | Medium |
| Stats-grid delta symbols: add weight/size signal for up/down | popup.css `.pop-stat-delta` | 20 min | Low — directional change clarity |
| Maintenance rows: identify 1 "recommended first" action per card | popup.html + popup.css | 45 min | High — resolves wall-of-equal-weight in Tools tab |
| Token/class formalization (add `.pop-h1-cta`, `.pop-h2-action`) | popup.css | 30 min | High (foundational — enables consistent application) |

**Total estimated effort: ~3.5 hours of targeted CSS + HTML line edits across popup.css, popup.html, and the GAM_CSS string in modtools.js.**

No architectural changes. No JS logic changes. All fixes are styling-layer only.

### Priority order for shipping:

1. Stats-grid color normalization + label size (35 min, highest visibility surface)
2. Token class spec additions to popup.css (30 min, enables all downstream fixes)
3. Maintenance card wall-of-equal-weight: promote 1 action per card (45 min, second most-visited surface)
4. Context menu danger items: weight + rest-state background (10 min, safety-critical)
5. Action grid T2 class + footer danger rest-state (15 min, low effort / high signal)
6. Modal header gradient removal + Integrity card left-rail (15 min, polish)
7. Remaining items as capacity allows

---

*Surfaces sampled: Stats grid, Action grid, Drill drawer, SUS tooltip / hover card, Mod Console (titlebar + tabs + quick-actions + ban form), Context menu, Maintenance cards (all 4), Tokens tab, Lead tab (KPI strip + quick actions + deep dive), Intel drawer, Status bar, First-run wizard, Team Macros card, Diag tab. Color constants sourced from `const C` (modtools.js:370) and CSS variable block (popup.css:672).*
