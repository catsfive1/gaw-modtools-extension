# UIUX2-23 -- Bloomberg Theme Cohesion Audit
**v10.13 Design Ralph V2 | Cross-cutting**
**Auditor:** UIUX2-23-COHESION
**Codebase snapshot:** dist/ -- modtools.js (25,400+ LOC), popup.css (2,300+ LOC)
**Prior audit baseline:** UIUX-03 (v10.x, ~155 distinct hex values, 12-key const C)
**Status:** READ-ONLY audit. No code modified.

---

## A. Token-System State vs v1 Audit (UIUX-03)

### A1. What v1 (UIUX-03) found

| Metric | v1 baseline (UIUX-03) |
|---|---|
| Combined unique hex values | ~155 distinct |
| popup.css hex literals | 39 |
| modtools.js hex literals | ~135 |
| const C keys | 12 |
| popup.css --bb-* tokens | ~30 |
| Amber forms in modtools.js | 4 (ff9933, f0a040, E8A317, rgba(245,166,35)) |
| Critical divergence | C.ACCENT = #4A9EFF (blue) vs --bb-amber = #ff9933 (brand) |

The v1 audit flagged two competing color systems and 155 distinct hex values as the core problem. It proposed the AMBER/BLUE semantic split as the fix but did not implement it.

### A2. What v10.10.1 shipped (P2 DESIGN-03)

v10.10.1 expanded const C from 12 to 35 keys. Key additions:

- `C.AMBER` (#ff9933) -- PRIMARY BRAND, new explicit amber token
- `C.BLUE` (#4A9EFF) -- FORM INPUTS explicit, equals LEGACY C.ACCENT
- `C.ACCENT` retained as `C.BLUE` alias for backward compat
- POPUP_BG, POPUP_PANEL, SUNKEN, HOVER, ACTIVE -- popup side mirrored
- LINE, LINE_HOT -- warm border variants
- INK, INK_DIM -- popup text variants
- AMBER_WARM (#f0a040), AMBER_COOL (#E8A317) -- amber sub-variants named
- AMBER_BG, AMBER_GLOW, RED_BG, RED_GLOW, GREEN_BG, CYAN_BG, PURPLE_BG, WARN_BG -- alpha pre-computed fills
- Explicit comment: "new code should use C.AMBER for brand, C.BLUE for forms. Full call-site sweep ships v10.11."

popup.css --bb-* token system expanded to 57 declared tokens (vs ~30 in v1), adding motion/easing tokens, spark tokens, and --bb-warn-bg, --bb-warn.

### A3. Current state (v10.13 snapshot)

| Metric | v10.13 actual |
|---|---|
| Combined unique hex values | **175 distinct** (+20 vs v1) |
| popup.css hex literals | 43 |
| modtools.js hex literals | ~155 |
| const C keys | 35 |
| popup.css --bb-* tokens | 57 |
| C.ACCENT call sites | **90** |
| C.AMBER call sites | **1** (only in const C definition itself) |
| C.BLUE call sites | **1** (only in const C definition itself) |
| C.AMBER_BG/GLOW/WARM/COOL call sites | **0** each |
| Amber hardcoded outside const C | **80 lines** (60 cssText/style, 17 ternary/logic, 3 console.log) |
| Blue hardcoded outside const C | **30 lines** (popup.css: 17, modtools.js: 13) |

**The 35-key const C expansion was schema work without a call-site sweep.** The new keys (AMBER, BLUE, AMBER_BG, AMBER_GLOW, AMBER_WARM, AMBER_COOL) have zero usage outside their definition. All 90 C.ACCENT call sites still fire the legacy alias unchanged.

---

## B. Remaining Drift

### B1. The 4-amber problem -- current state

v1 audit identified 4 amber forms. As of v10.13:

| Amber form | Hex | modtools.js occurrences | popup.css occurrences | Status |
|---|---|---|---|---|
| `#ff9933` raw | Primary brand amber | 85 (hardcoded) | 3 (raw) / 67 (via var(--bb-amber)) | Active -- dominant form |
| `#f0a040` raw | Warn-adjacent amber | 12 (hardcoded) | 3 (raw) / 14 (via var(--bb-warn)) | Active -- second amber |
| `#E8A317` raw | Halo/pulse amber | 9 (hardcoded) | 0 | Active -- third amber |
| `rgba(255,153,51,...)` | Alpha amber | 7 (hardcoded) | 8 (hardcoded) | Active |
| `rgba(240,160,64,...)` | Alpha warn-amber | 27 (hardcoded) | 11 (hardcoded) | Active |
| `rgba(255,176,0,...)` | Rogue amber (popup.css only) | 0 | 1 | New rogue |

**The 4-amber problem has become a 6-amber problem.** v10.10.1 named AMBER_WARM and AMBER_COOL in const C but neither gained a CSS token in popup.css, and neither was wired into existing call sites. The hardcoded forms all persist.

**Key finding:** in popup.css, var(--bb-amber) is used 67 times (correct), but 3 raw #ff9933 and 3 raw #f0a040 still leak through. In modtools.js, zero const-C amber tokens are used -- all 80+ amber sites are raw hex or rgba() strings in cssText/innerHTML.

### B2. Blue-on-amber surfaces

The original UIUX-03 concern was popup BLUE accent vs content-script AMBER. The split was never executed:

**C.ACCENT (#4A9EFF blue) at brand-role call sites (should become C.AMBER):**

| CSS class / context | Line (approx) | Correct token |
|---|---|---|
| `.gam-bar-brand` | L20363 | `C.AMBER` -- brand toolbar label |
| `.gam-t-brand` | L20467 | `C.AMBER` -- triage panel brand label |
| `.gam-c5-mod` | L20440 | `C.AMBER` -- C5 mod badge |
| `.gam-mc-title` | L15825 | `C.AMBER` -- ModConsole title |
| `.gam-bar-icon-brand` | L20369 | `C.AMBER` -- brand icon color |
| `.gam-settings-team` | L20895 | `C.AMBER` -- team label text |
| `.gam-home-label` | L20766 | `C.AMBER` -- home bar label |
| `.gam-home-jump` | L20774 | `C.AMBER` -- home jump link (brand, not nav) |
| `.gam-t-brand` (triage) | L20467 | `C.AMBER` -- brand element |
| Status bar triage icon | L19290 | `C.AMBER` -- brand context indicator |
| `.gam-log-user` | L20185 | ambiguous (actor name -- possibly BLUE/link) |

Rough count: **~15-20 C.ACCENT call sites** in modtools.js carry brand semantics and should migrate to `C.AMBER`. The remaining ~70 are form-interactive (focus rings, input borders, buttons, toggles, send-btn, snack-info background) and should stay as `C.BLUE`.

**popup.css blue hardcoded (#4A9EFF) -- 16 raw sites:**
All 16 are in form-interactive context (input focus borders, CTA buttons, token form fields, filter inputs). None appear to be brand. These are correct usage; the only issue is they bypass the `--bb-blue` token (which does not exist in popup.css -- see below).

**Missing token: `--bb-blue` is not declared in popup.css.** The popup layer has --bb-amber, --bb-red, --bb-green, --bb-cyan, --bb-purple, --bb-yellow, --bb-warn but no --bb-blue. The 16 raw #4A9EFF sites in popup.css have no token to reference. This is a gap from v10.10.1 which added the concept but skipped the popup token.

### B3. WARN (#f0a040) vs AMBER (#ff9933) -- hex unification status

The two amber hex values remain unresolved:
- popup.css: `--bb-amber: #ff9933` (canonical brand, 67 usages via var())
- modtools.js: `C.WARN: #f0a040` (warn label, 34 usages via C.WARN)
- These are NOT the same color. Delta: #ff9933 is more saturated/orange; #f0a040 is dimmer/golden.

UIUX2-25 (color semantics, already filed) recommends splitting these into two explicit tokens: `--bb-amber` (brand chrome, #ff9933) and `--bb-warn-status` (warning state, #f59e0b proposed). That proposal stands and is the correct resolution -- see UIUX2-25 section D.7.

### B4. Inline cssText injection sites (hardcoded amber not reachable by CSS tokens)

188 `.cssText =` assignments exist in modtools.js. These inject style strings directly into DOM elements at runtime. Because CSS custom properties (`var(--bb-amber)`) are resolved by the browser against the page's stylesheet cascade, they theoretically work in injected inline styles -- BUT only if the injected element is inside a document that has the `--bb-*` root block. The content-script injects a style sheet into the page (`<style>` tag), so `var()` would resolve.

**Conclusion:** the 80 amber hardcoded lines in cssText are not technically forced to be raw hex -- `C.AMBER` would work if substituted (the const is already defined). The barrier is purely that no one wired the new tokens to the existing sites. This is editorial debt, not architectural constraint.

---

## C. C.ACCENT Classification Heuristic (82-Site Sweep)

To execute the deferred v10.11 sweep, apply this 3-signal decision rule to each `C.ACCENT` call site:

### Rule: AMBER if ALL of these are true
1. **Class name contains:** `brand`, `title`, `label`, `name`, `badge`, `icon-brand`, `bar-brand`, `home-label`, `c5-mod`, `t-brand`, `settings-team`, `mm-hints-help`, `mm-hints-tab`
2. **Element role is:** communicating identity, section heading, brand chrome, nav selected state
3. **NOT adjacent to:** `focus`, `input`, `select`, `textarea`, `btn`, `send`, `checkbox`, `toggle`, `filter`, `search`, `accent-color`

### Rule: BLUE (keep C.BLUE or --bb-blue) if ANY of these are true
1. Class contains: `focus`, `input`, `select`, `textarea`, `btn`, `button`, `send`, `checkbox`, `toggle`, `filter`, `search`, `accent-color`, `snack-info`
2. Context is: `:focus` pseudo-selector, `accent-color:`, CTA button, interactive hover/active state
3. The element the user physically interacts with (types into, clicks to submit, toggles on/off)

### Rule: LEAVE AS-IS (C.ACCENT alias fine) for
- Structural chrome that is neither brand identity nor a form element (e.g., left-border accent on panels, tooltip border, batch-info bar border). These use ACCENT as a general highlight -- acceptable until a deeper structural pass.

### Automated sweep signal
A reliable regex pre-filter for the AMBER candidates in modtools.js cssText injection strings:

```
pattern: /C\.ACCENT.*?(brand|title|label|head|name|badge)/i
```
This catches 12-15 of the ~20 AMBER candidates automatically. Manual review is needed for ambiguous cases (`.gam-log-user`, `.gam-at-more`, `.gam-mm-hints-help`).

### Anticipated split from sweep
| Outcome | Count (estimated) |
|---|---|
| Migrate C.ACCENT -> C.AMBER | ~18 sites |
| Keep C.ACCENT -> rename alias to C.BLUE | ~55 sites |
| Structural chrome (leave, note for later) | ~7 sites |
| **Total** | **80** (10 more in popup.css inline = ~90 total) |

---

## D. Migration Strategy

### D1. Phase ordering (lowest risk first)

**Phase 1: Schema (popup.css) -- 1 session, ~10 line changes, zero risk**
Add `--bb-blue: #4A9EFF` to the `:root` block in popup.css immediately below `--bb-cyan`. This fills the missing token gap with no visual change -- it only creates the variable. No call sites reference it yet.

**Phase 2: Unify popup.css raw #4A9EFF to var(--bb-blue) -- 1 session, ~16 line changes, low risk**
All 16 raw `#4A9EFF` and `#5aadff` sites in popup.css are form-interactive. Replace with `var(--bb-blue)` and `var(--bb-blue-bright)` respectively. Visual parity -- no rendering change, gains token hygiene.

**Phase 3: modtools.js brand sites -- 1 session, ~18 line changes, low-medium risk**
Use the heuristic in section C. Replace C.ACCENT with C.AMBER at the ~18 brand-role sites. Visually: branded labels, titles, and the brand toolbar will shift from #4A9EFF (blue) to #ff9933 (amber). This is the visible cohesion fix -- the thing the v1 audit was complaining about. **Requires visual QA pass** on the mod toolbar and triage panel.

**Phase 4: modtools.js cssText amber normalization -- 1 session, ~80 line changes, low risk**
Replace raw `#ff9933`, `#f0a040`, `#E8A317` strings in cssText with `C.AMBER`, `C.WARN`, `C.AMBER_COOL` respectively. Pure refactor, no visual change. Side-effects: establishes a stable foundation for future amber remapping (e.g., when UIUX2-25's --bb-warn-status token is added, only the C.WARN constant needs updating -- all call sites follow automatically).

**Phase 5: UIUX2-25 semantic split -- deferred to separate ticket**
Adding --bb-warn-status and --bb-teal (new tokens), remapping amber away from warning-status surfaces, resolving purple/lead-yellow contradictions. This is the UIUX2-25 scope and should be executed after phases 1-4 stabilize the base.

### D2. Manual vs automated

| Phase | Method |
|---|---|
| Phase 1 (add --bb-blue token) | Manual edit, 1 line |
| Phase 2 (popup.css raw->var) | Semi-automated: grep for `#4[Aa]9[Ee][Ff]{2}` in popup.css, each hit is a var(--bb-blue) substitution |
| Phase 3 (brand sites) | Manual: apply heuristic from section C, ~18 sites, each requires judgment |
| Phase 4 (cssText amber) | Semi-automated: 3 search-replace runs (ff9933->C.AMBER, f0a040->C.WARN, E8A317->C.AMBER_COOL) in cssText/innerHTML strings only |
| Phase 5 (semantic split) | Manual: token additions + targeted class remaps, per UIUX2-25 remediation table |

Phases 2 and 4 can be scripted. Phases 1, 3, 5 require human judgment on each site.

---

## E. Effort Estimate

| Phase | Scope | Lines changed | Sessions | Risk |
|---|---|---|---|---|
| 1: Add --bb-blue token | popup.css | ~1 | 0.1 | None |
| 2: Popup raw hex -> var() | popup.css | ~18 | 0.5 | Low |
| 3: Brand site ACCENT -> AMBER | modtools.js | ~36 (18 sites x avg 2 lines) | 1 | Medium -- visual change |
| 4: cssText amber normalization | modtools.js | ~80 | 1 | Low |
| 5: UIUX2-25 semantic split | modtools.js, popup.css | ~39 (per UIUX2-25) | 1.5 | Medium |
| **Total** | | **~174 lines** | **~4 sessions** | **Medium** |

### What phases 1-4 deliver (without phase 5)
- 175 unique hex values -> estimated **~145** (remove ~30 redundant hardcoded ambers and blues that collapse to const references)
- 90 C.ACCENT sites -> **~55 C.BLUE + ~18 C.AMBER + ~7 C.ACCENT structural**
- popup.css #4A9EFF raw occurrences -> **0** (all tokenized)
- modtools.js amber raw hex occurrences -> **~10** (only ternary/logic expressions that genuinely branch on computed amber shades -- those cannot be trivially collapsed to a single const)
- Bloomberg ledger discipline metric: const C is the single source of truth for all amber and blue values used in cssText. Changing C.AMBER changes all 80 call sites simultaneously.

### What phase 5 adds
- Semantic disambiguation (amber != warn, purple != lead-mod, yellow != lead-chat)
- Two new tokens: --bb-warn-status, --bb-teal
- Resolves the 15-job amber overload identified in UIUX2-25

---

## F. Quick-Reference: Remaining Drift by File

### modtools.js
| Issue | Count | Priority |
|---|---|---|
| C.ACCENT at brand-role sites | ~18 | HIGH -- visible cohesion fix |
| C.ACCENT at form-interactive sites using wrong name | ~55 | LOW -- rename alias only |
| Raw #ff9933 in cssText/style | 85 | MEDIUM -- token normalization |
| Raw #f0a040 in cssText/style | 12 | MEDIUM -- token normalization |
| Raw #E8A317 in cssText/style | 9 | MEDIUM -- token normalization |
| Raw rgba(74,158,255) blue inline | 28 | LOW -- match popup.css token |
| Raw rgba(240,160,64) warn inline | 27 | MEDIUM -- normalize to C.WARN |
| Raw rgba(255,153,51) amber inline | 7 | MEDIUM -- normalize to C.AMBER_BG |
| C.AMBER_WARM/COOL/BG/GLOW used: 0 | -- | SCHEMA ONLY -- wire up in phase 4 |

### popup.css
| Issue | Count | Priority |
|---|---|---|
| --bb-blue token missing | 1 missing token | HIGH -- blocks tokenization |
| Raw #4A9EFF (blue hardcoded) | 16 | MEDIUM -- all form-interactive, need token |
| Raw #ff9933 / #f0a040 outside var() | 7 | LOW -- mostly in comments/declarations |
| rgba(240,160,64) raw | 11 | LOW -- warn surfaces, tie to var(--bb-warn) |
| rgba(255,176,0) rogue amber | 1 | LOW -- one-off, normalize |
| --bb-warn vs --bb-amber hex split | persistent | Defer to phase 5 / UIUX2-25 |
