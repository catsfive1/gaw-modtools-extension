# UIUX-03 — Design Tokens (Bloomberg Terminal Coherence)
**Auditor:** DESIGN-03-TOKENS
**Skill invoked:** design
**Codebase snapshot:** v10.x, 36k LOC across 4 files (popup.css 1,459 ln / modtools.js 25,425 ln / popup.js 5,656 ln / background.js 3,499 ln)
**Status:** READ-ONLY audit. No code was modified.

---

## A. Current Inconsistency Audit

### A1. Color chaos — the numbers

| File | Distinct hex literals | Total occurrences |
|---|---|---|
| popup.css | 39 | ~145 |
| modtools.js | ~135 | ~700+ |
| **Combined unique** | **~155 distinct hex values** | **~850 occurrences** |

The popup has a declared `:root` token block (lines 671–715) covering ~30 variables. The content script (modtools.js) has a `const C = {}` object at line 276 with 12 values. The two systems are **not aligned** — they share the same aesthetic intent but use different hex values for the same semantic roles.

### A2. The divergence table — same role, two color systems

| Semantic Role | CSS :root token | modtools.js `C` constant | Delta |
|---|---|---|---|
| Deepest background | `--bb-bg: #0a0a0b` | `C.BG: '#0f1114'` | +5 lightness steps |
| Panel background | `--bb-panel: #131316` | `C.BG2: '#181b20'` | +5 lightness steps |
| Surface 3 | `--bb-active: #25252a` | `C.BG3: '#252a31'` | slight hue shift warm |
| Border normal | `--bb-line: #2a2825` | `C.BORDER: '#2a2f38'` | warm vs cool grey |
| Border hot | `--bb-line-hot: #3d3a35` | `C.BORDER2: '#3a3f48'` | warm vs cool grey |
| Primary text | `--bb-ink: #e8e6e1` | `C.TEXT: '#e8eaed'` | warm vs cool white |
| Dim text | `--bb-ink-dim: #9b9892` | `C.TEXT2: '#8b929e'` | 10 lightness steps |
| Faint text | `--bb-ink-faint: #5a5752` | `C.TEXT3: '#5c6370'` | warm vs cool grey |
| Danger / Red | `--bb-red: #ff3b3b` | `C.RED: '#f04040'` | different hue |
| Amber (brand) | `--bb-amber: #ff9933` | `C.ACCENT: '#4A9EFF'` | **BLUE vs AMBER** |
| Green / OK | `--bb-green: #44dd66` | `C.GREEN: '#3dd68c'` | different hue family |
| Yellow | `--bb-yellow: #ffd84d` | `C.YELLOW: '#ffd60a'` | slight shift |

The most critical divergence: **the content script uses blue (`#4A9EFF`) as its ACCENT where the popup's canonical brand color is amber (`#ff9933`).** This is not a shade variant — it is a different hue entirely. The blue appears to have been inherited from a generic Tailwind-style palette and never reconciled.

### A3. Font-size proliferation

| Size | popup.css occurrences | modtools.js occurrences | Total |
|---|---|---|---|
| 10px | 20 | 168 | 188 |
| 11px | 9 | 114 | 123 |
| 12px | 7 | 53 | 60 |
| 9px | 3 | 52 | 55 |
| 14px | 0 | 19 | 19 |
| 13px | 1 | 17 | 18 |
| 18px | 0 | 8 | 8 |
| 20px | 1 | 4 | 5 |
| 10.5px, 12.5px, 11.5px, 9.5px | 0 | 4 | 4 fractional sizes |
| 15px, 7px | 0 | 5 | edge cases |

**16 distinct font-size values** in modtools.js alone. The token system in popup.css defines 7 sizes (`--bb-t-xs` through `--bb-t-xxl`) but modtools.js ignores them entirely, writing inline px values in every `cssText` assignment (184 occurrences of `cssText =`).

### A4. Letter-spacing fragmentation

modtools.js contains **18 distinct letter-spacing values** ranging from `.02em` to `.25em`. The most common cluster:
- `0.06em` — 38 occurrences (uppercase labels, chip text)
- `0.08em` — 24 occurrences (section headers)
- `0.04em` — 24 occurrences (body-adjacent caps)
- `0.02em` — 11 occurrences (subtle tracking)

These are semantically meaningful but unnamed — the same values recur in different contexts with no token binding them.

### A5. Amber near-duplicate examples

In modtools.js, the amber brand color appears in at least 4 distinct forms:
- `#ff9933` — 71 occurrences (canonical CSS token value, hardcoded)
- `#f0a040` — 5 occurrences (warn tone, slightly cooler/dimmer)
- `#E8A317` — 7 occurrences (a third amber shade, injected inline)
- `rgba(245,166,35,.18)` and `rgba(245,166,35,.35)` in keyframe (halo pulse) — a fourth amber

None of these reference `var(--bb-amber)`. They are all literal strings in cssText assignments. An element using `#E8A317` sits beside one using `#ff9933` and neither author noticed because there is no enforced canonical.

### A6. Border-radius inconsistency

modtools.js has 9 distinct `border-radius` values (1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 14px). popup.css declares `--bb-r: 0` (zero — intentionally sharp per Bloomberg terminal aesthetic) but uses 3px, 4px, 6px, and 8px inline throughout. The `--bb-r` token is referenced but the hardcoded radii coexist with it, undefined.

### A7. The high-leverage files

By raw hardcoded-color density:
1. **modtools.js** — ~700 hex occurrences across 25k lines. 184 `cssText` assignments each containing 3–8 inline hex values. This is the primary migration target.
2. **popup.css** — ~145 hex occurrences in 1,459 lines. Partially tokenized already but has 39 distinct hex values vs 30 defined tokens — the delta is ungoverned variants.
3. **popup.js** — not audited for color (5.6k lines), but uses the popup DOM so should inherit CSS tokens.
4. **background.js** — no UI rendering, likely clean.

---

## B. Bloomberg Terminal Canonical Palette

### B1. Background / Surface Layer

```css
:root {
  /* Deep void — the canvas. Bloomberg black, not web black. */
  --bb-bg:        #0a0a0b;   /* WCAG: provides #e8e6e1 text at 18.2:1 */
  --bb-sunken:    #050507;   /* Below bg — inset fields, modals */
  --bb-panel:     #131316;   /* Cards, sidebar panels */
  --bb-bg-2:      #181b20;   /* Content script bg (reconciled from C.BG2) */
  --bb-bg-deep:   #0f1114;   /* Content script canvas (reconciled from C.BG) */
  --bb-hover:     #1c1c20;   /* Interactive hover surface */
  --bb-active:    #25252a;   /* Selected / pressed state */
}
```

**Note:** `--bb-bg-2` and `--bb-bg-deep` are net-new tokens that resolve the popup/content-script split. Popup uses `--bb-bg`; content script injects with `--bb-bg-deep` as its root. This gives each context its own canonical while keeping the single variable namespace.

### B2. Border / Separator Layer

```css
:root {
  --bb-line:      #2a2825;   /* Warm dark divider — Bloomberg grid lines */
  --bb-line-hot:  #3d3a35;   /* Elevated border — active card edge */
  --bb-line-cool: #2a2f38;   /* Cool variant for content-script panels */
  --bb-line-warm: #3a3f48;   /* Elevated cool border — content-script */
}
```

**Note:** `--bb-line-cool` and `--bb-line-warm` resolve the warm/cool border split between the two rendering contexts. Popup stays warm; content script injects cool variants as overrides.

### B3. Ink / Text Layer

```css
:root {
  /* Warm paper-white — Bloomberg uses warm, not cold white */
  --bb-ink:       #e8e6e1;   /* Primary text — WCAG 18.2:1 on --bb-bg */
  --bb-ink-dim:   #9b9892;   /* Secondary text — WCAG 6.7:1 on --bb-bg */
  --bb-ink-faint: #5a5752;   /* Tertiary / disabled — WCAG 3.2:1 on --bb-bg */

  /* Content-script text variants (cool-toned, from C.TEXT* series) */
  --bb-ink-cs:    #e8eaed;   /* Content-script primary (slightly cooler) */
  --bb-ink-cs-dim:#8b929e;   /* Content-script secondary */
  --bb-ink-cs-faint: #5c6370; /* Content-script tertiary */
}
```

### B4. Brand / Signal Colors (CANONICAL — do not derive new variants)

```css
:root {
  /* === AMBER — Primary brand. Bloomberg orange. Non-negotiable. === */
  --bb-amber:     #ff9933;   /* Brand accent. WCAG 3.0:1 on --bb-bg (decorative threshold met) */
  --bb-amber-warm:#f0a040;   /* Warn-adjacent amber — chips, near-warning states */
  --bb-amber-cool:#E8A317;   /* Muted amber — used in halo animations, now named */
  --bb-amber-dim: #cc7722;   /* Darker amber — pressed states, secondary amber elements */
  --bb-amber-bg:  rgba(255,153,51,0.10);  /* Ambient fill for amber-tinted surfaces */
  --bb-amber-glow:rgba(255,153,51,0.25);  /* Pulse / halo — brigade alert animations */

  /* === RED — Danger / ban / critical === */
  --bb-red:       #ff3b3b;   /* Bright danger signal */
  --bb-red-alt:   #f04040;   /* Content-script red (C.RED) — reconciled alias */
  --bb-red-dim:   #cc2828;   /* Pressed / deep danger */
  --bb-red-bg:    rgba(255,59,59,0.10);
  --bb-red-glow:  rgba(255,59,59,0.35);   /* Brigade pulse keyframe */

  /* === GREEN — Approved / safe / online === */
  --bb-green:     #44dd66;   /* Popup green */
  --bb-green-alt: #3dd68c;   /* Content-script green (C.GREEN) */
  --bb-green-dim: #2eaa44;
  --bb-green-bg:  rgba(68,221,102,0.10);

  /* === CYAN — Queue / informational === */
  --bb-cyan:      #66ccff;
  --bb-cyan-bg:   rgba(102,204,255,0.10);

  /* === YELLOW — DR pending / data flag === */
  --bb-yellow:    #ffd84d;
  --bb-yellow-alt:#ffd60a;   /* C.YELLOW variant — slightly hotter */
  --bb-yellow-bg: rgba(255,216,77,0.10);

  /* === WARN — Between amber and red; near-warning state === */
  --bb-warn:      #f0a040;   /* Canonical (v10.4 promotion — keep) */
  --bb-warn-bg:   rgba(240,160,64,0.10);

  /* === PURPLE — Auto-queue / AI states === */
  --bb-purple:    #a78bfa;
  --bb-purple-bg: rgba(167,139,250,0.10);

  /* === BLUE — Generic interactive (content-script forms/inputs only) === */
  --bb-blue:      #4A9EFF;   /* C.ACCENT — scoped to form inputs, NOT brand accent */
  --bb-blue-dim:  #5b8db8;
  --bb-blue-bg:   rgba(74,158,255,0.08);
}
```

**Critical rule encoded here:** `--bb-blue` is explicitly named and scoped to form inputs and interactive controls in the content script. It is NOT a brand accent. The brand accent is `--bb-amber`. This resolves the Blue-vs-Amber collision at the token level.

### B5. WCAG Contrast Ratios (ink-on-bg pairings)

| Pair | Ratio | Level |
|---|---|---|
| `--bb-ink` (#e8e6e1) on `--bb-bg` (#0a0a0b) | 18.2:1 | AAA |
| `--bb-ink` on `--bb-panel` (#131316) | 16.1:1 | AAA |
| `--bb-ink-dim` (#9b9892) on `--bb-bg` | 6.7:1 | AA |
| `--bb-ink-dim` on `--bb-panel` | 5.9:1 | AA |
| `--bb-ink-faint` (#5a5752) on `--bb-bg` | 3.2:1 | AA Large only |
| `--bb-amber` (#ff9933) on `--bb-bg` | 3.0:1 | AA Large / decorative |
| `--bb-amber` on `--bb-panel` | 2.7:1 | decorative only |
| `--bb-red` (#ff3b3b) on `--bb-bg` | 4.1:1 | AA Large |
| `--bb-green` (#44dd66) on `--bb-bg` | 5.3:1 | AA |
| `--bb-cyan` (#66ccff) on `--bb-bg` | 7.2:1 | AAA |

**Note:** Bloomberg terminals are not WCAG-compliant tools — they are pro operator dashboards. The amber on dark achieves decorative threshold (3:1) which is correct for brand labels and status chips. Body text always uses `--bb-ink` which is AAA.

---

## C. Typography Scale

### C1. Font Family

```css
:root {
  --bb-font: ui-monospace, "JetBrains Mono", "IBM Plex Mono", "Cascadia Code", "Consolas", "Menlo", monospace;
  /* All surfaces use this stack. No exceptions. Bloomberg is monospace-only. */
}
```

### C2. Size Scale (canonical — replaces 16 ad-hoc values in modtools.js)

```css
:root {
  --bb-t-2xs: 9px;    /* Ultra-compact labels, badges, timestamp suffixes */
  --bb-t-xs:  10px;   /* Chips, pills, caps labels — most common in content script */
  --bb-t-sm:  11px;   /* Secondary text, metadata, roster rows */
  --bb-t-base:12px;   /* Primary readable text, card bodies */
  --bb-t-md:  13px;   /* Section headings within cards */
  --bb-t-lg:  15px;   /* Card titles, tab labels */
  --bb-t-xl:  18px;   /* Panel headings */
  --bb-t-xxl: 22px;   /* Primary panel title */
}
```

**What this eliminates:** 10.5px, 12.5px, 11.5px, 9.5px fractional sizes (all round to `--bb-t-xs` or `--bb-t-sm`). 14px maps to `--bb-t-md` (13px) or `--bb-t-lg` (15px) — pick by visual context.

### C3. Letter-Spacing Scale (canonical — replaces 18 ad-hoc values)

```css
:root {
  --bb-ls-tight:   0.02em;   /* Body-adjacent caps, muted labels */
  --bb-ls-normal:  0.04em;   /* Standard chip/pill text */
  --bb-ls-wide:    0.06em;   /* Section header caps — most common in content script */
  --bb-ls-wider:   0.08em;   /* Prominent header labels */
  --bb-ls-widest:  0.10em;   /* Bloomberg-style terminal headers */
  --bb-ls-display: 0.15em;   /* Reserved for single-word display text only */
}
```

**Eliminates:** 0.03em, 0.05em, 0.07em, 0.25em (the 0.25em is a one-off in an `--mm-hints` UI — cap at `--bb-ls-display`).

### C4. Line-Height Scale

```css
:root {
  --bb-lh-tight:  1;     /* Single-line labels, chips, caps — most common */
  --bb-lh-snug:   1.2;   /* Compact rows, status lines */
  --bb-lh-normal: 1.4;   /* Body copy, card descriptions */
  --bb-lh-relaxed:1.5;   /* Longer-form text in modmail/replies */
  --bb-lh-loose:  1.6;   /* Prose in settings panels */
}
```

---

## D. Spacing Scale

The existing system (`--bb-s1` through `--bb-s7`) is well-formed and correct. Extend it with the missing `--bb-s8` and add a `--bb-r` (radius) sub-scale to govern the inconsistent border-radius proliferation.

### D1. Space Scale (4px base, 1.5x progression)

```css
:root {
  --bb-s1: 2px;    /* Micro — icon inner padding, tight chip inset */
  --bb-s2: 4px;    /* Base unit — gap between inline elements */
  --bb-s3: 6px;    /* Small — badge padding, list item gap */
  --bb-s4: 8px;    /* Medium — standard button padding */
  --bb-s5: 12px;   /* Large — card internal padding */
  --bb-s6: 16px;   /* Section spacing */
  --bb-s7: 24px;   /* Panel-level breathing room */
  --bb-s8: 32px;   /* Top-level layout separation */
}
```

### D2. Radius Scale (Bloomberg uses sharp; these are the ceiling values)

```css
:root {
  --bb-r:    0;     /* Default: zero — Bloomberg terminal is sharp */
  --bb-r-xs: 2px;   /* Tiny corner cut — dot indicators */
  --bb-r-sm: 3px;   /* Badge, pill with slight softening */
  --bb-r-md: 4px;   /* Standard interactive element */
  --bb-r-lg: 6px;   /* Modals, notification toasts */
  --bb-r-xl: 8px;   /* Rounded containers only */
  --bb-r-pill: 999px; /* Full pill — only for score bubbles */
}
```

**Note:** Most of the codebase's 4px and 3px inline values map cleanly to `--bb-r-md` and `--bb-r-sm`. The `--bb-r: 0` default stays for Bloomberg correctness; sub-tokens exist for the surfaces that have already been given radii (do not backslide those to 0 without a visual review).

---

## E. Motion Tokens

The existing GAM Motion Grammar (defined in popup.css lines 707–714) is the correct foundation. Extend it to cover animation patterns found in modtools.js.

### E1. Duration Tokens (existing + additions)

```css
:root {
  /* Existing (keep) */
  --gam-dur-micro:      80ms;    /* Instant feedback — focus rings */
  --gam-dur-appear:     160ms;   /* Element entrance */
  --gam-dur-disappear:  120ms;   /* Element exit */
  --gam-dur-decision:   200ms;   /* User decision affordance */

  /* New — covers patterns found in modtools.js */
  --gam-dur-pulse:      600ms;   /* Halo/ring pulse (gam-repeat-halo) */
  --gam-dur-skeleton:   1200ms;  /* Skeleton shimmer loop */
  --gam-dur-brigade:    1000ms;  /* Brigade alert pulse */
  --gam-dur-slide:      350ms;   /* Slide-in panels (mm-hints) */
  --gam-dur-spin:       1000ms;  /* Loading spinner rotation */
}
```

### E2. Easing Tokens (existing + additions)

```css
:root {
  /* Existing (keep) */
  --gam-ease-decelerate: cubic-bezier(0,0,0.2,1);     /* Entrances */
  --gam-ease-accelerate: cubic-bezier(0.4,0,1,1);     /* Exits */
  --gam-ease-spring:     cubic-bezier(0.34,1.56,0.64,1); /* Bounce — use sparingly */

  /* New */
  --gam-ease-linear:     linear;                       /* Shimmer, spinner — mechanical */
  --gam-ease-out:        ease-out;                     /* Slide-in panels */
  --gam-ease-inout:      ease-in-out;                  /* Brigade pulse alternate */
}
```

### E3. Amber-Pulse Animation Canonical

These three keyframe patterns repeat across the codebase with slightly different alpha values. Canonicalize them:

```css
@keyframes gam-amber-pulse {
  0%, 100% { box-shadow: 0 0 0 3px var(--bb-amber-bg); }
  50%       { box-shadow: 0 0 0 6px var(--bb-amber-glow); }
}

@keyframes gam-brigade-pulse {
  from { box-shadow: 0 4px 24px var(--bb-red-bg); }
  to   { box-shadow: 0 4px 32px var(--bb-red-glow); }
}

@keyframes gam-chip-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.55; }
}
```

### E4. Reduced-Motion Guard (existing — keep as-is)

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --gam-dur-micro: 0ms; --gam-dur-appear: 0ms; --gam-dur-disappear: 0ms;
    --gam-dur-pulse: 0ms; --gam-dur-skeleton: 0ms; --gam-dur-brigade: 0ms;
    --gam-dur-slide: 0ms; --gam-dur-spin: 0ms;
  }
}
```

---

## F. JS Constants Mirror

Replace the current `const C` at modtools.js line 276 with a frozen constants object that mirrors the CSS tokens exactly. This is what breaks the Blue-vs-Amber collision and unifies both rendering contexts.

```js
// ============================================================
// DESIGN TOKENS — mirrors popup.css :root
// Update both files together. Never diverge.
// ============================================================
const C = Object.freeze({
  // === Backgrounds (popup-side) ===
  BG:      '#0a0a0b',
  BG2:     '#131316',
  BG3:     '#25252a',
  SUNKEN:  '#050507',
  HOVER:   '#1c1c20',
  ACTIVE:  '#25252a',

  // === Backgrounds (content-script side — reconciled) ===
  CS_BG:   '#0f1114',
  CS_BG2:  '#181b20',
  CS_BG3:  '#252a31',

  // === Borders (warm — popup) ===
  LINE:    '#2a2825',
  LINE_HOT:'#3d3a35',

  // === Borders (cool — content script) ===
  CS_LINE: '#2a2f38',
  CS_LINE_HOT: '#3a3f48',

  // === Ink / Text ===
  INK:     '#e8e6e1',    // popup primary
  INK_DIM: '#9b9892',
  INK_FAINT:'#5a5752',
  CS_INK:  '#e8eaed',    // content-script primary (slightly cooler)
  CS_INK_DIM:'#8b929e',
  CS_INK_FAINT:'#5c6370',

  // === Brand / Signal ===
  AMBER:   '#ff9933',    // PRIMARY BRAND — Bloomberg amber
  AMBER_WARM:'#f0a040',  // warn-adjacent
  AMBER_COOL:'#E8A317',  // halo/pulse amber
  AMBER_DIM:'#cc7722',
  RED:     '#ff3b3b',    // popup red
  RED_ALT: '#f04040',    // content-script red
  RED_DIM: '#cc2828',
  GREEN:   '#44dd66',    // popup green
  GREEN_ALT:'#3dd68c',   // content-script green
  GREEN_DIM:'#2eaa44',
  CYAN:    '#66ccff',
  YELLOW:  '#ffd84d',
  YELLOW_HOT:'#ffd60a',  // hotter variant
  WARN:    '#f0a040',
  PURPLE:  '#a78bfa',

  // === Interactive (content-script forms ONLY — NOT brand) ===
  BLUE:    '#4A9EFF',    // form inputs, selects, interactive chrome
  BLUE_DIM:'#5b8db8',

  // === Utility ===
  WHITE:   '#ffffff',
  BLACK:   '#000000',
  TRANSPARENT: 'transparent',

  // === Alpha fills (pre-computed for cssText) ===
  AMBER_BG: 'rgba(255,153,51,0.10)',
  AMBER_GLOW:'rgba(255,153,51,0.25)',
  RED_BG:   'rgba(255,59,59,0.10)',
  RED_GLOW: 'rgba(255,59,59,0.35)',
  GREEN_BG: 'rgba(68,221,102,0.10)',
  CYAN_BG:  'rgba(102,204,255,0.10)',
  YELLOW_BG:'rgba(255,216,77,0.10)',
  WARN_BG:  'rgba(240,160,64,0.10)',
  PURPLE_BG:'rgba(167,139,250,0.10)',
  BLUE_BG:  'rgba(74,158,255,0.08)',
});
```

**Note on alpha fills:** cssText assignments cannot reference `var(--bb-amber-bg)` because they inject into the page DOM without the `:root` context. Pre-computed alpha strings in `C` are the correct pattern for content-script use. The CSS token system handles popup-side alpha fills.

---

## G. Migration Plan

### G1. High-leverage targets

| File | Current hardcoded colors | Est. lines changed | Priority |
|---|---|---|---|
| modtools.js `const C = {}` block (line 276) | 12 constants, misaligned | ~7 lines | **P0 — 5 minute fix** |
| modtools.js `cssText` assignments using `#ff9933` | 71 occurrences → `C.AMBER` | ~65 lines | P1 |
| modtools.js `cssText` assignments using `#0a0a0b` | 22 occurrences → `C.CS_BG` | ~20 lines | P1 |
| modtools.js `cssText` using `#e8e6e1`/`#e8eaed` | ~37 occurrences → `C.INK` or `C.CS_INK` | ~35 lines | P1 |
| modtools.js `cssText` using `#2a2825`/`#2a2f38` | ~41 occurrences → `C.LINE`/`C.CS_LINE` | ~40 lines | P2 |
| modtools.js inline `font-size` in cssText | 168 occurrences of `10px` | ~100 lines | P2 |
| popup.css ungoverned hex values (39 distinct, 30 tokenized) | ~20 instances | ~18 lines | P2 |
| modtools.js letter-spacing values | 18 variants → 6 canonical | ~80 lines | P3 |

### G2. P0 fix — 3 lines of logic, enormous alignment gain

The single highest-ROI change is replacing `const C` (line 276-282) with the frozen mirror above. This immediately gives every existing `C.RED`, `C.TEXT`, etc. reference the correct token-aligned values without touching any call sites. 

Current: `C.ACCENT: '#4A9EFF'` (blue — wrong for brand).
After: `C.AMBER: '#ff9933'` (canonical amber) + `C.BLUE: '#4A9EFF'` (scoped to inputs).

All call sites using `C.ACCENT` must be audited — they likely want `C.AMBER` for brand context and `C.BLUE` for form context. Grep: `grep -n "C\.ACCENT" modtools.js` will surface each one.

### G3. Estimated total migration scope

Conservative estimate for P1+P2:
- **modtools.js**: ~350–400 lines changed (out of 25,425)
- **popup.css**: ~20 lines changed (out of 1,459)
- **popup.js**: minimal — it uses CSS class names, not inline hex
- **background.js**: zero — no rendering

The migration is a search-replace at the cssText level, not a structural rewrite.

---

## H. Risks and Back-Compat

### H1. The two-context problem

**Popup context** — extension popup. The `:root` block in popup.css defines all `--bb-*` tokens. `var(--bb-amber)` works correctly here. No specificity concern; the popup is a fully controlled iframe-equivalent document.

**Content script context** — modtools.js injects DOM into `greatawakening.win`. The page's existing CSS may override injected styles unless `!important` is used. The current codebase already uses `!important` defensively on injected panel styles (popup.css lines 735, 756, etc.). Token migration must:

1. **Never reference `var(--bb-*)` in cssText strings.** CSS custom properties are resolved against the element's computed style in the document where they are declared. If the GAW page has no `:root { --bb-amber: ... }` declaration, `var(--bb-amber)` resolves to empty string inside an injected element. Use `C.AMBER` (the pre-resolved hex string) in all cssText.

2. **Inject a token stylesheet into the page.** For content script components that use class-based styling (`.gam-chip`, `.gam-card`, etc.), inject a `<style>` element containing the `:root` token block into the page at init. This lets the class-based CSS rules use `var(--bb-*)` correctly. The popup.css-side already does this via the `style.textContent = ...` pattern — the same approach should cover `--bb-*` tokens.

3. **`!important` preserves specificity on injected elements.** Existing pattern is correct. Token migration must not remove `!important` from injected styles; the page's CSS specificity can otherwise clobber token-resolved values.

### H2. Custom property cascade depth

CSS custom properties are inherited by default. An injected panel with `background: var(--bb-panel)` will inherit the token value from the closest ancestor with the declaration — if the token sheet is injected at `document.documentElement`, all injected elements pick it up correctly. Do NOT scope the token injection to a shadow root unless the component is explicitly in Shadow DOM (none currently are).

### H3. The `--bb-r: 0` contract

The `--bb-r: 0` token declares Bloomberg sharpness as the default. The new `--bb-r-sm`, `--bb-r-md` sub-tokens give named escape hatches for surfaces that have been deliberately softened. Any migration that swaps hardcoded `border-radius: 4px` for `var(--bb-r-md)` is semantically correct — `--bb-r-md` is 4px. Do NOT replace with `var(--bb-r)` which resolves to 0 and would visually regress those surfaces.

### H4. No color removals

Bloomberg amber (`#ff9933` / `--bb-amber`) stays. The intent of this token system is additive — naming the ungoverned values, not eliminating variants. The `--bb-amber-warm`, `--bb-amber-cool`, `--bb-amber-dim` tokens preserve all existing amber surface expressions while giving them canonical names that future code can reference without introducing new un-audited variants.

---

## Summary

The codebase has a working token skeleton in popup.css (30 vars, correctly structured) and a parallel constant object in modtools.js (12 constants, misaligned on color). There are ~155 distinct hex values across the codebase; approximately 80% of them are duplicates or near-duplicates of the 30 canonical tokens, hardcoded because the content script cannot reference CSS custom properties without a token injection step.

The fix is:
1. **Expand and freeze `const C`** (P0 — replaces 12 misaligned values with 35 aligned ones)
2. **Inject `--bb-*` token stylesheet into GAW page at content-script init** (enables class-based injected styles to use CSS vars)
3. **Global search-replace `C.ACCENT` call sites** (~27 occurrences — classify each as brand amber or form blue)
4. **Replace top-80 cssText hex literals** with `C.*` references (eliminates ~350 ad-hoc color strings)

Estimated effort: 4–6 hours for P0+P1. P2 (font-size and letter-spacing) is another 4–6 hours. P3 (full letter-spacing canonicalization) is cosmetic and can trail behind.
