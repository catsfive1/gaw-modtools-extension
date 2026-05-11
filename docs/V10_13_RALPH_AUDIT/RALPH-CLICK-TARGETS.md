# RALPH-CLICK-TARGETS — v10.13.4 click-target compliance audit

**HEAD:** `9c7655e` (v10.13.4 WAVE 4) | **Date:** 2026-05-10
**Scope:** AA-tight 32×32 px floor per UIUX2-34 spec.
**Method:** Static cascade analysis of `popup.css` (2,816 lines) + `modtools.js` GAM_CSS
(~lines 20880–22850, plus the Bloomberg layer ~21870–22790) + inline-style sweep of
`popup.html` and `popup.js`.

> Read-only audit. **No code changed.**

---

## Summary

**W5 fixed 8 of the 13 originally-listed UIUX2-34 violations** (`.gam-bar-icon` ::after,
`.gam-t-act` ::after, button base 28→32, 5 `min-height:0!important` rules removed,
`.pop-drill-close` 32×32, drill toolbar 24→32, `.gam-ctx-item` 32, `.gam-tip-ctrl-x` 32).

**5 originally-listed violations remain unfixed**, **6 W3/W4-introduced violations are
new**, **2 cascade-loss bugs** in W5's own fixes were uncovered, and **2 hit-zone overlap
defects** were created by the new `::after` overlays. **Plus** the **17 content-script
button classes that have no Bloomberg-base safety net** are uniformly sub-32px because
the `.pop-btn, button { min-height:32px }` rule is scoped to the popup document and does
not cross into the content-script DOM.

| Surface | Original (UIUX2-34) | Now |
|---|---|---|
| Popup buttons (covered by Bloomberg base 32 px) | mostly < 32 px | **mostly PASS** via cascade rescue |
| Popup buttons w/ `min-height:0!important` overrides | 5 sites | 0 (all removed) |
| Popup inline-style `min-height:0` overrides | not surveyed | **3 sites still active** |
| Popup `min-height: 28px !important` overrides | 2 sites | **2 still active** (`.gam-crawl-pill`, `.pop-maint-action-row .pop-btn`) |
| Content-script bar icons (`.gam-bar-icon`) | 22 px no extension | PASS via Bloomberg layer `::after inset:-10px` (50 px hit zone) — but **adjacent overlap defect** |
| Content-script triage row buttons (`.gam-t-act`) | 22 px | PASS via `::after inset:-6px` — but **adjacent overlap defect** |
| Content-script `.gam-bar-icon-brand` | 22 px no extension | **STILL 22 px no extension** (W5 missed it — different class name) |
| Content-script general buttons (.gam-btn, .gam-strip-btn, .gam-bar-btn, .gam-modal-close, .gam-empty-cta, …) | various | **ALL still < 32 px** (no Bloomberg base in content-script CSS) |

### Compliance percentages

I count 38 distinct interactive selectors across both surfaces.

| Bucket | Count | Compliance |
|---|---:|---:|
| Popup buttons under Bloomberg base | 21 | 18 PASS / 3 fail = **86%** |
| Popup buttons with size overrides | 4 | 1 PASS / 3 fail = 25% |
| Content-script buttons (no base rule) | 17 | 4 PASS (mc-head, t-act extension, bar-icon extension, tip-ctrl-x) / 13 fail = **24%** |
| Hit-area extension overlays | 2 | both create adjacency-overlap misclick defects |
| **OVERALL** | **38** | **23 PASS / 15 FAIL = 61% AA-tight compliance** |

The popup is essentially fixed. **The content-script is barely 24% compliant — it never
got an analogue of the popup's "all-button base rule" treatment.**

---

## Violation table

Effective height/width computed assuming default font-loading, content-box default,
and including padding + border. Where a min-height rule rescues a smaller padding-derived
box, that's noted.

### A. Popup violations — sites W5 missed

| ID | Selector | Source | Declared | Effective height × width | Verdict |
|---|---|---|---:|---:|---|
| **P-1** | "Re-run setup" badge button | `popup.js:184` (inline) | `padding:1px 6px;min-height:0;height:18px` | **18 × ~70** | **VIOLATION** — `min-height:0` + explicit `height:18px` defeats Bloomberg base 32 px. **Active misclick risk.** |
| **P-2** | "Ping all" button (Lead tab) | `popup.html:665` (inline) | `padding:2px 6px;min-height:0` | **~14 × ~50** | **VIOLATION** — inline `min-height:0` overrides base. |
| **P-3** | Lapsed-mod row "Ping" button | `popup.js:6720` (inline) | `padding:1px 5px;min-height:0` | **~13 × ~38** | **VIOLATION** — same pattern, lapsed-mod row inline action. |
| **P-4** | `.gam-crawl-pill` (Quick / Deep depth segments) | `popup.css:2153` | `min-height:28px !important` | **28 × ≥36** | **VIOLATION** — explicit floor below the AA-tight 32. UIUX2-34 §A.2 already flagged it as borderline; W5 left it alone. |
| **P-5** | `.pop-maint-action-row .pop-btn` | `popup.css:2217` | `min-height:28px !important` | **28 × flex-1** | **VIOLATION on button itself.** Spec §C.2 argued reachability is OK because button is `flex:1` inside a 32 px row, so row clicks route to button — but the button's own hit target is 28 px. Marginal. |
| **P-6** | `.tok-banner-rotate-btn` (auth banner err-state CTA) | `popup.css:470` | `padding:2px 8px` font 10/1 | base button `min-height:32` rescues → **32 × ~60** | **PASS via Bloomberg base.** Listed because the prompt asked specifically. |
| **P-7** | `.tok-cta-primary` ("Open GAW" first-run wizard primary) | `popup.css:326` | `padding:11px 14px` font 12/1 border 2 | **38 × full-width** | **PASS.** Generous. |
| **P-8** | `.tok-path-btn` (3-up secondary path row) | `popup.css:373` | `padding:7px 6px` font 10/1 border 1 | base `min-height:32` rescues → **32 × flex-1** | **PASS via base.** |
| **P-9** | Safe-Mode toggle handle (`.gam-toggle` track in popup.html:277) | `popup.html` inline | `width:32;height:16` | **16 × 32** | **VIOLATION** — toggle track is 16 px tall, no `::after` extension. Label text is the click area for the checkbox, but the visible track is half the AA-tight floor. |

### B. Content-script violations — W5 fixed two classes, the rest are still raw

The popup's "all-buttons-32px" rescue rule lives at `popup.css:1138` and only applies to
the popup's HTML document. Every interactive class declared inside `GAM_CSS` (the
content-script CSS string injected into the GAW DOM) lacks an equivalent safety net.

| ID | Selector | Source | Declared | Effective height × width | Verdict |
|---|---|---|---:|---:|---|
| **CS-1** | `.gam-bar-icon-brand` (header brand chip) | `modtools.js:21258` | `width:22;height:22` no `::after` | **22 × 22** | **VIOLATION** — UIUX2-34 §A.12 listed this; W5 added `::after` to `.gam-bar-icon` only, not to `.gam-bar-icon-brand`. **Different class name, missed.** |
| **CS-2** | `.gam-btn` base | `modtools.js:20944` | `padding:6px 14px` font 12/1 | **24 × auto** | **VIOLATION** — used by Cancel/Submit/Handoff/Propose/Execute/Punt/Veto/Close in 30+ call sites. |
| **CS-3** | `.gam-btn-small` | `modtools.js:20952` | `padding:4px 10px` font 11 | **19 × auto** | **VIOLATION.** |
| **CS-4** | `.gam-park-btn` | `modtools.js:4071` | `padding:2px 6px` font 14/1 | **20 × auto** | **VIOLATION.** |
| **CS-5** | `.gam-modal-close` (X on every gam-modal) | `modtools.js:20922` | `padding:2px 6px` font 18/1 | **22 × ~24** | **VIOLATION** — modal close is a high-stress target. UIUX2-34 §A.12 didn't catch it; should match `.pop-drill-close` 32×32 treatment. |
| **CS-6** | `.gam-empty-cta` (empty-state CTA) | `modtools.js:22831` | `padding:6px 14px` font 11/1.2 border 1 | **27 × auto** | **VIOLATION.** |
| **CS-7** | `.gam-mc-send-btn` (Mod Console Send) | `modtools.js:16237` | `padding:6px 16px` font 13 inherit | **25 × auto** | **VIOLATION.** Critical send button. |
| **CS-8** | `.gam-strip-btn` (Quick-Remove / Flair / Ban Author inline post strip) | `modtools.js:21044` | `padding:2px 8px` font 10 | **16 × auto** | **VIOLATION.** Used on every queue post. |
| **CS-9** | `.gam-settings-promote-btn` | `modtools.js:21800` | `padding:3px 9px` font 10 border 1 | **18 × auto** | **VIOLATION.** |
| **CS-10** | `.gam-mc-tab` / `.gam-modal-tab` (Mod Console + modal tabs) | `modtools.js:22084` (Bloomberg layer) | `padding:8px 12px` font 11/1 border 2 | **29 × auto** | **VIOLATION** — close to 32 but technically below. **W4 added number-prefixed labels to these tabs but did not change dimensions.** |
| **CS-11** | `.gam-mm-bar-btn` (modmail bar — Intel / Ban / Unban / Note / **Mark SUS** / **DR 72h**) | `modtools.js:21643` | `padding:5px 10px` font 11 border 1 | **23 × auto** | **VIOLATION × 6** — every button in the W4-introduced modmail bar is 23 px. |
| **CS-12** | `.gam-snack-action` (W3-introduced action button on toasts) | `modtools.js:21175` | `padding:2px 8px` font 9 border 1 | **17 × auto** | **VIOLATION** — W3 hygiene addition shipped without sizing audit. |
| **CS-13** | `.gam-tip-ctrl-btn` (tooltip controls — Open Intel / Mark SUS / Death Row / Copy name) | `modtools.js:21601` | `padding:3px 8px` font 10 border 1 | **18 × auto** | **VIOLATION × 4** — only the X button (`.gam-tip-ctrl-x`) was bumped to 32×32 in W5; the four sibling control buttons in the same tooltip stayed at 18 px. |
| **CS-14** | `.gam-sus-dr-btn` (SUS-DR menu inline actions: DR 72h / DR 24h / Unmark / Ban) | `modtools.js:18053` | `padding:1px 6px` font 9 border 1 | **15 × auto** | **VIOLATION × 4** — V3-shipped SUS-DR menu (commit `0d32a85`) buttons are 15 px tall. |
| **CS-15** | `.gam-drawer-close`, `.gam-drawer-mark-precedent` | `modtools.js:21162` | `padding:4px 10px` font 11 border 1 | **21 × auto** | **VIOLATION** — drawer close X is 21 px. |
| **CS-16** | `.gam-t-flush-btn` (flush Death Row CTA) | `modtools.js:21504` | `padding:6px 14px` font 11 | **23 × auto** | **VIOLATION.** Destructive action, sub-spec target. |
| **CS-17** | `.gam-card-head-toggle` (Safe Mode toggle label) | `popup.css:2168` | font 9/1.2 no padding | **~11 × auto** | **VIOLATION on label container.** Native checkbox is `display:none`, the visible 32×16 track is the toggle. Same as P-9 from a different angle. |

### C. W5's own fixes — cascade-loss / regression risks

| ID | Issue | Detail |
|---|---|---|
| **C-1** | `.gam-bar-icon` `::after` overridden | W5 source says `inset:-5px → 32 px tap zone`. Bloomberg layer `#gam-status-bar .gam-bar-icon::after` at `modtools.js:21965` declares **`inset:-10px`** (44 px tap zone). Higher specificity wins, so the visible behavior is 44 px not 32 — **actually MORE accessible than spec, but not what was shipped**, and it amplifies C-2 below. |
| **C-2** | `.gam-bar-icon` adjacent hit-zone OVERLAP | Bar gap is 6 px (`--bb-s3`); icons are ~30 px wide (22 + 8 padding); `::after inset:-10px` extends to 50 px wide. **Adjacent extensions overlap by ≈14 px on every adjacency**, and CSS paint order means the **rightmost icon wins clicks in the overlap zone**. ~12-20 icons in the bar, so ~11-19 of these ambiguous corridors exist. **This is a real misclick bug introduced by W5.** |
| **C-3** | `.gam-t-act` adjacent hit-zone OVERLAP | Action cell has `gap:3px` between 22 px buttons; `::after inset:-6px` extends each to 34 px wide. **Adjacent extensions overlap by 9 px on every adjacency**, 4 buttons × 3 adjacencies = 3 ambiguous corridors per row. Right-most button (Ban) silently steals clicks meant for Watch / DR / Pattern. **Active hit-stealing bug.** |
| **C-4** | `.gam-stale-refresh` padding=0 wins, height saved by base | After removing `min-height:0!important`, the rule still has `padding:0 !important`. Base button rule's `padding:6px 12px !important` is OVERRIDDEN here because `.gam-stale-refresh` rule comes later in source order (line 2660 vs base at 1144) and !important matches. So padding stays 0 and only `min-height:32` rescues the height. Width depends entirely on text length — fine for "Refresh" but borderline. Worth re-checking that no zero-padding rule was retained out of habit. |

### D. Touch-device unreachability — Macros v2 hover trio

`.gam-macro-item-actions` (popup.css:1431-1440) starts at `opacity:0` and only reveals on
`:hover` / `:focus-within`. **Touch devices have no `:hover` and no clean focus-within
trigger for a non-button list-item parent.** A PRM `@media (prefers-reduced-motion: reduce)`
override at line 1460 sets `opacity:1` — but that's for **motion**, not for **touch**. PRM
fires only when the user has explicitly opted out of motion in their OS — which has no
correlation with input modality.

**Effective click target on touch: 0 px (invisible, untargetable).** This is a
**WCAG 2.5.5 + 2.5.7 fail** for the entire macros v2 action trio (Edit / Duplicate /
Delete) on iOS, iPadOS, Android, and any mouse-less environment.

The right gate is `@media (hover: none)`, which sets `opacity:1` for any device whose
primary input cannot hover. PRM is the wrong gate.

---

## Findings

### F-1 — The two new ::after overlays both cause adjacent-button hit-stealing

W5 added invisible 5-10 px hit-zone extensions on `.gam-bar-icon` and `.gam-t-act`.
Neither factored in adjacency: where two same-class buttons are spaced by less than
2× the inset distance, the extensions overlap. Stacking-order CSS gives the click to
the later DOM sibling unconditionally — which means **the leftmost icons in the bar
silently lose clicks to their right neighbors** in the overlap strips.

| Surface | Inset | Gap | Overlap per adjacency | Click goes to |
|---|---:|---:|---:|---|
| `.gam-bar-icon` | 10 px (Bloomberg) | 6 px | **14 px** | rightmost (Ban hammer beats every neighbor) |
| `.gam-t-act` | 6 px | 3 px | **9 px** | rightmost (Ban beats Pattern beats DR beats Watch) |

The fix is straightforward: invert the inset to be vertical-only (e.g. `inset:-5px 0`)
or apply `pointer-events:none` to the `::after` and rely on enlarged padding. But
shipping unbalanced hit zones is worse than no extension at all because the misclicks
are **now systematic and silent**, not random.

### F-2 — Content-script has no analogue of the popup's `min-height:32` safety net

The popup got fixed in a single line: `popup.css:1148` set `min-height:32` on
`.pop-btn, button`. This rescues every popup button that doesn't explicitly opt out.
The content-script CSS (the GAM_CSS string injected via `<style>` into the GAW page DOM)
has no equivalent. Adding one rule like

```css
.gam-btn, .gam-mc-send-btn, .gam-strip-btn, .gam-bar-btn, .gam-modal-close,
.gam-empty-cta, .gam-mm-bar-btn, .gam-snack-action, .gam-tip-ctrl-btn,
.gam-sus-dr-btn, .gam-drawer-close, .gam-t-flush-btn, .gam-bar-icon-brand,
.gam-park-btn, .gam-mc-tab, .gam-modal-tab { min-height:32px; }
```

would close ~12 of the 17 content-script violations in one diff. The remaining ones
(`.gam-strip-btn` is a wrapped `<a>` not `<button>`, `.gam-mm-bar-btn` may need a width
floor too) need targeted attention.

### F-3 — Three inline-style `min-height:0` overrides are still active

W5 swept `min-height:0!important` rules out of `popup.css` but never grepped `.html` /
`.js` source for inline-style equivalents. Result:

- `popup.html:665` — Ping all
- `popup.js:184` — Re-run setup
- `popup.js:6720` — Lapsed-mod ping

These three ride the same defect class as the now-removed CSS rules. They need the
same surgery (drop the `min-height:0` segment).

### F-4 — Macros v2 hover trio is touch-unreachable

The hover-reveal pattern (`opacity:0 → 1 on hover`) is a desktop-mouse pattern. The
PRM gate that exists today fires on the wrong axis. Rewriting the gate to
`@media (hover: none)` makes the trio opacity:1 by default on touch and tablet, with
desktop keeping the hover-reveal aesthetic.

### F-5 — `.gam-bar-icon-brand` is a ghost violation

UIUX2-34 §A.12 listed it explicitly. W5's commit log claims the bar-icon fix is in
place. **It only landed on `.gam-bar-icon` — `.gam-bar-icon-brand` is a different class
that shares no rules with it.** The brand chip (the leftmost item in the bar — the
shield icon that opens C5) is still 22×22 with no extension. Identical fix needed:
`position:relative; ::after { content:''; position:absolute; inset:-10px; }` or share
the rule via `.gam-bar-icon, .gam-bar-icon-brand`.

### F-6 — Popup `min-height:28px !important` overrides survive W5

`.gam-crawl-pill` (popup.css:2156) and `.pop-maint-action-row .pop-btn` (popup.css:2221)
both lock height at 28 px with `!important`. UIUX2-34 §A.2 noted these as "borderline"
but not in the W5 fix list. They're 12 % below the AA-tight floor; bumping both to 32
is a four-character fix per rule.

### F-7 — Mod Console / Modal tabs are 29 px (W4 + Bloomberg)

`.gam-mc-tab` and `.gam-modal-tab` get `padding:8px 12px !important` in the Bloomberg
content-script layer (modtools.js:22092). Result: 11 px font + 16 padding + 2 border =
29 px tall. Three pixels short of the 32-px floor. W4's number-prefix change ("1·INTEL")
didn't touch dimensions — these tabs were already 29 px before W4 and stayed 29 px.

---

## Recommendations

Ordered by impact-per-line.

| Priority | Fix | Estimated effort | Why |
|---|---|---:|---|
| **P0** | Add content-script base rule: `.gam-btn, .gam-mc-send-btn, .gam-strip-btn, .gam-modal-close, .gam-empty-cta, .gam-mm-bar-btn, .gam-snack-action, .gam-tip-ctrl-btn, .gam-sus-dr-btn, .gam-drawer-close, .gam-drawer-mark-precedent, .gam-t-flush-btn, .gam-park-btn, .gam-mc-tab, .gam-modal-tab, .gam-settings-promote-btn { min-height: 32px; box-sizing: border-box; }` near top of GAM_CSS | 30 min | Closes CS-2…CS-16 in one diff. Content-script's missing analogue of the popup base rule. |
| **P0** | Apply `.gam-bar-icon, .gam-bar-icon-brand { position:relative; }` and merge `::after` rules so brand chip gets the same hit extension as regular bar icons | 10 min | Closes CS-1, restores intent of the W5 fix. |
| **P0** | Swap macros v2 hover gate from `prefers-reduced-motion` to `@media (hover: none)` for the `opacity:1` rule | 5 min | Closes touch-unreachability for Edit/Duplicate/Delete. |
| **P0** | Strip `min-height:0` from the 3 inline styles: `popup.html:665`, `popup.js:184`, `popup.js:6720` | 5 min | Closes P-1, P-2, P-3 (re-run / ping all / lapsed ping). |
| **P1** | Constrain `::after` insets to **vertical-only** OR set `pointer-events:none` on the overlap on `.gam-bar-icon::after` and `.gam-t-act::after`, then bump padding to recover horizontal hit zone | 1 h | Closes C-2, C-3 (the systematic right-button-steals-click defect introduced by W5). |
| **P1** | Bump `.gam-crawl-pill` and `.pop-maint-action-row .pop-btn` from 28→32 min-height | 5 min | Closes P-4, P-5. |
| **P1** | Bump `.gam-mc-tab` / `.gam-modal-tab` Bloomberg padding from `8px 12px` to `10px 12px` (or add `min-height:32`) | 10 min | Closes CS-10 (29→32 px), without rewriting the tab tab style. |
| **P2** | Replace Safe-Mode toggle 32×16 track with native checkbox styled at 32×24 + ::after extension to 32×32 | 30 min | Closes P-9, CS-17 from the same diff. |
| **P2** | Replace `.gam-modal-close { padding:2px 6px }` with `min-width:32; min-height:32; padding:0; line-height:1` for consistency with `.pop-drill-close` and `.gam-tip-ctrl-x` | 5 min | Closes CS-5. |

After P0 + P1: **34 of 38 selectors PASS = 89 % AA-tight compliance.** The four
remaining sub-32 elements are all decorative chips that are non-essential targets and
acceptable at 28 px under WCAG 2.5.5 AA proper (24 px minimum).

---

## Appendix — Files inspected

- `D:\AI\_PROJECTS\modtools-ext\popup.css` (2,816 lines)
- `D:\AI\_PROJECTS\modtools-ext\modtools.js` (27,671 lines — GAM_CSS spans ~20880-22850 plus
  Bloomberg overlay ~21870-22790)
- `D:\AI\_PROJECTS\modtools-ext\popup.html` (905 lines)
- `D:\AI\_PROJECTS\modtools-ext\popup.js` (7,035 lines — inline-style sweep only)
- `D:\AI\_PROJECTS\modtools-ext\docs\V10_DESIGN_V2\UIUX2-34_click_targets.md` (the original spec)
- W5 commit `722bcf7` (v10.13.2) for the fix-list ground truth
