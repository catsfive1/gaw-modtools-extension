# GAW ModTools — Unified In-Page Design Token System

**Status:** Proposal (v1)
**Scope:** the in-page (content-script injected) UI in `modtools.js` / `modtools-aux.js` / `popup.js`.
**Problem solved:** 193 unique hardcoded hex literals, no palette, three half-overlapping conventions (`C.*` JS object, `--bb-*` popup vars, `--gam-*` WCAG-audited vars). This collapses all of it into **one** semantic token set (≤20 tokens) exposed two ways: a JS `GAM_TOK` const for inline `cssText` and a matching CSS custom-property block for `GAM_CSS` `<style>` rules.

---

## 1. Design principles

1. **Dark theme is the ground truth.** Near-black warm surfaces (`#0a0a0b` / `#0f1114`). Tokens are named for *role*, not hue.
2. **Amber is the brand.** `#ff9933` / `--bb-amber` stays the single accent. Blue (`#4A9EFF`) is demoted to a *form-input* role only (it was never brand — see `C.ACCENT` legacy-alias comment in `modtools.js:407`).
3. **Two delivery channels, one source of truth.** `var()` is unreliable in injected inline `cssText` (documented at `modtools.js:416`), so every token ships as a **literal hex in `GAM_TOK`** (for `el.style.cssText`) AND as a **CSS custom property** (for `<style>` rules). The hex values are identical between the two — the JS map is the canonical source; the CSS block is generated from it.
4. **Preserve passed contrast audits.** Where `--gam-*` already bumped a value for WCAG (muted-text `#8b929e`→`#b0b5bc`, link `#4A9EFF`→`#7cb8ff`, danger-text→`#fed7d7`), the **audited value wins**. We do not regress to the raw literal.
5. **Soft fills are derived, not invented.** The dozens of `rgba(R,G,B,.08–.35)` tints collapse to per-signal `-soft` (≈10–12% fill) and `-line` (≈25–35% border) tokens.

---

## 2. The 20 semantic tokens

| Token | Hex | Role |
|---|---|---|
| `surface` | `#0a0a0b` | Deepest page/backdrop base (popup `--bb-bg`, content-script deepest nest) |
| `surface-raised` | `#0f1114` | Primary canvas / card-dark (`C.BG`, `--gam-bg-dark`) |
| `surface-panel` | `#181b20` | Panels, headers, raised cards (`C.BG2`, `--gam-bg-card`) |
| `surface-overlay` | `#252a31` | Selected/surface-3, hover wells, modal inner (`C.BG3`) |
| `border` | `#2a2f38` | Normal divider/border (`C.BORDER`) |
| `border-strong` | `#3a3f48` | Elevated border, focus surround (`C.BORDER2`, warm `--bb-line-hot`) |
| `ink` | `#e8e6e1` | Primary text (popup `--bb-ink`; content-script `#e8eaed` folds here) |
| `ink-muted` | `#b0b5bc` | Secondary text — **WCAG-bumped** (`--gam-muted-text`, was `#8b929e`) |
| `ink-faint` | `#7a7672` | Tertiary/disabled/placeholder (`--bb-ink-faint`, content `#5c6370` folds here) |
| `accent` | `#ff9933` | **Brand amber** (`--bb-amber`, `C.AMBER`) |
| `accent-soft` | `rgba(255,153,51,0.10)` | Amber tint — hover rows, active-row bg |
| `accent-line` | `rgba(255,153,51,0.28)` | Amber border/divider/glow |
| `info` | `#7cb8ff` | Links + form-input accent — **WCAG-bumped** (`--gam-link`, raw `#4A9EFF` for chrome) |
| `info-soft` | `rgba(74,158,255,0.10)` | Blue tint backgrounds |
| `danger` | `#f04040` | Ban/destructive (`C.RED`) |
| `danger-soft` | `rgba(240,64,64,0.12)` | Red tint / alert bg / ban-pill |
| `warn` | `#f0a040` | Caution/watch (`C.WARN`, `--bb-amber-warm`) |
| `success` | `#3dd68c` | Verified/OK (`C.GREEN`) |
| `special` | `#a78bfa` | AI / auto-queue / death-row / new-account (`C.PURPLE`) |
| `focus-ring` | `#ff9933` | Keyboard focus outline (amber, matches brand; 2px solid) |

> **Within budget at 20.** `surface`, `border`, `ink`, signal, and the three soft/line derivatives cover every documented component. Two named extras kept because they appear in many components and have no semantic synonym: `warn` (distinct from `danger` — watch vs ban) and `special` (purple AI/auto, distinct from `info` blue).

### 2a. Signal-pair table (text-on-color badges)

Badges (`APPROVE`/`REMOVE`/`WATCH`) and chips use the **already-audited `--gam-*` pairs** — kept verbatim, not re-derived, because they passed contrast in Session C:

| Pair | bg | text |
|---|---|---|
| success-badge | `#276749` | `#c6f6d5` |
| danger-badge | `#9b2c2c` | `#fed7d7` |
| warn-badge | `#744210` | `#ffe5b0` |

These live in the CSS block as `--gam-ok-bg/-text` etc. and are **referenced by the token system, not replaced** — they are the only place raw `var()` is safe (they're used in `<style>` rules, never inline cssText).

---

## 3. Top-literal → token mapping

The ~40 highest-frequency literals (counts from the whole-file grep) and where each lands:

| Hex | Count | Token |
|---|---|---|
| `#9b9892` | 156 | `ink-muted` *(folds into the WCAG-bumped `#b0b5bc`; legacy value retained as `ink-muted-legacy` for byte-identical opt-out)* |
| `#2a2825` | 57 | `border` *(warm divider `--bb-line` → unified `border`)* |
| `#ff3b3b` | 55 | `danger` *(popup bright red folds to `#f04040`; keep `danger-bright` alias if a callsite needs the hotter red)* |
| `#fff` | 48 | `on-accent` *(white text on colored fills; see note)* |
| `#e8e6e1` | 48 | `ink` |
| `#ff9933` | 38 | `accent` |
| `#3d3a35` | 38 | `border-strong` *(warm `--bb-line-hot`)* |
| `#0a0a0b` | 35 | `surface` |
| `#f04040` | 34 | `danger` |
| `#ffd84d` | 33 | `warn` *(popup yellow `--bb-yellow` → folds to warn family; `warn-bright` alias if needed)* |
| `#44dd66` | 32 | `success` *(popup green folds to `#3dd68c`)* |
| `#3dd68c` | 31 | `success` |
| `#4A9EFF` | 28 | `info` *(text/link usages → `#7cb8ff`; raw form-chrome usages keep `#4A9EFF` via `info-chrome`)* |
| `#5c6370` | 23 | `ink-faint` |
| `#66ccff` | 22 | `info` *(cyan informational → folds to info; `info-cyan` alias only if visually required)* |
| `#a78bfa` | 21 | `special` |
| `#a0aec0` | 21 | `ink-muted` |
| `#2a2f38` | 21 | `border` |
| `#e2e8f0` | 18 | `ink` *(modal text)* |
| `#0f1114` | 16 | `surface-raised` |
| `#131316` | 15 | `surface-panel` *(popup `--bb-panel`; nearer panel than overlay)* |
| `#2d3748` | 14 | `border` *(modal hover-dark)* |
| `#7a7672` | 12 | `ink-faint` |
| `#050507` | 12 | `surface` *(sunken inset → deepest; `surface-sunken` alias)* |
| `#ff6b6b` | 11 | `danger` *(soft red text → folds to danger)* |
| `#8b929e` | 11 | `ink-muted` *(legacy secondary)* |
| `#4a5568` | 11 | `border-strong` *(modal border)* |
| `#e8eaed` | 10 | `ink` *(content-script primary)* |
| `#181b20` | 10 | `surface-panel` |
| `#f6ad55` | 8 | `warn` *(parked glyph / modal accent)* |
| `#e8eaed`/`#252a31`/`#0f1419` | — | `ink` / `surface-overlay` / `surface` (modal input bg → `surface`) |
| `#276749` | — | success-badge bg (`--gam-ok-bg`) |
| `#c6f6d5` | — | success-badge text (`--gam-ok-text`) |
| `#9b2c2c` | — | danger-badge bg (`--gam-danger-bg`) |
| `#fed7d7` | — | danger-badge text (`--gam-danger-text`) |
| `#744210` | — | warn-badge bg (`--gam-warn-bg`) |
| `#ffe5b0` | — | warn-badge text (`--gam-warn-text`) |
| `#f5a623` | — | `warn` *(repeat-offender halo; `warn-halo` alias for the keyframe-specific amber)* |
| `#f0a040` | — | `warn` |
| `rgba(0,0,0,.55)` | — | `scrim` *(backdrop overlay — one token covers .35/.5/.55/.6/.65/.7 modal overlays at `0.6`)* |

**`on-accent` (`#fff`) note:** `#fff` is contextual — it's text *on* a colored fill (red ban pill, blue button, amber chip). One `on-accent` token (`#ffffff`) covers all of them; the underlying signal token supplies the fill. This avoids 48 scattered `#fff` literals becoming 48 token lookups with no semantic meaning.

---

## 4. `GAM_TOK` — JS const for inline `cssText`

Drop-in next to the frozen `C` object in `modtools.js`. This is the **canonical source**; the CSS block in §5 is generated to match. Use these in `el.style.cssText = ...` where `var()` does not resolve.

```js
// === Unified design tokens (literal hex — safe in injected inline cssText) ===
// Canonical source. GAM_CSS custom-properties (see GAM_CSS block) mirror these.
// var() is unreliable in injected inline cssText (see C object note), so inline
// styles read GAM_TOK.*; <style>-rule CSS reads the var(--gam-tok-*) equivalents.
const GAM_TOK = Object.freeze({
  // surfaces (dark, warm, near-black)
  surface:        '#0a0a0b',
  surfaceSunken:  '#050507',
  surfaceRaised:  '#0f1114',
  surfacePanel:   '#181b20',
  surfaceOverlay: '#252a31',
  // borders
  border:         '#2a2f38',
  borderStrong:   '#3a3f48',
  // ink
  ink:            '#e8e6e1',
  inkMuted:       '#b0b5bc', // WCAG-bumped; was #8b929e
  inkMutedLegacy: '#8b929e', // byte-identical opt-out only
  inkFaint:       '#7a7672',
  onAccent:       '#ffffff', // text on colored fills
  // brand accent (amber)
  accent:         '#ff9933',
  accentSoft:     'rgba(255,153,51,0.10)',
  accentLine:     'rgba(255,153,51,0.28)',
  focusRing:      '#ff9933',
  // info / form-input (blue)
  info:           '#7cb8ff', // WCAG-bumped link/text; was #4A9EFF
  infoChrome:     '#4A9EFF', // raw blue for non-text form chrome
  infoSoft:       'rgba(74,158,255,0.10)',
  // danger (red)
  danger:         '#f04040',
  dangerSoft:     'rgba(240,64,64,0.12)',
  // warn (orange)
  warn:           '#f0a040',
  warnSoft:       'rgba(240,160,64,0.12)',
  // success (green)
  success:        '#3dd68c',
  successSoft:    'rgba(61,214,140,0.12)',
  // special (purple — AI / auto / death-row)
  special:        '#a78bfa',
  specialSoft:    'rgba(167,139,250,0.12)',
  // overlay scrim (collapses .35–.7 backdrops)
  scrim:          'rgba(0,0,0,0.60)',
});
```

**Migration mechanism (inline):** a callsite like
`el.style.cssText = 'color:#9b9892;border-bottom:1px solid #2a2825'`
becomes
`el.style.cssText = 'color:' + GAM_TOK.inkMuted + ';border-bottom:1px solid ' + GAM_TOK.border`
(or a template literal). No `var()`, no runtime resolution risk.

---

## 5. `GAM_CSS` — CSS custom-property block for `<style>` rules

Append to the existing `:root{…}` sheet (the one at `modtools.js:4424`). The already-audited `--gam-*` pairs are **kept as-is**; the new `--gam-tok-*` properties are added alongside so `<style>`-rule CSS can use `var()`.

```css
:root {
  /* ----- unified design tokens (mirror of GAM_TOK) ----- */
  --gam-tok-surface:         #0a0a0b;
  --gam-tok-surface-sunken:  #050507;
  --gam-tok-surface-raised:  #0f1114;
  --gam-tok-surface-panel:   #181b20;
  --gam-tok-surface-overlay: #252a31;
  --gam-tok-border:          #2a2f38;
  --gam-tok-border-strong:   #3a3f48;
  --gam-tok-ink:             #e8e6e1;
  --gam-tok-ink-muted:       #b0b5bc;   /* WCAG-bumped; legacy below */
  --gam-tok-ink-muted-legacy:#8b929e;
  --gam-tok-ink-faint:       #7a7672;
  --gam-tok-on-accent:       #ffffff;
  --gam-tok-accent:          #ff9933;
  --gam-tok-accent-soft:     rgba(255,153,51,0.10);
  --gam-tok-accent-line:     rgba(255,153,51,0.28);
  --gam-tok-focus-ring:      #ff9933;
  --gam-tok-info:            #7cb8ff;   /* WCAG-bumped link; chrome below */
  --gam-tok-info-chrome:     #4A9EFF;
  --gam-tok-info-soft:       rgba(74,158,255,0.10);
  --gam-tok-danger:          #f04040;
  --gam-tok-danger-soft:     rgba(240,64,64,0.12);
  --gam-tok-warn:            #f0a040;
  --gam-tok-warn-soft:       rgba(240,160,64,0.12);
  --gam-tok-success:         #3dd68c;
  --gam-tok-success-soft:    rgba(61,214,140,0.12);
  --gam-tok-special:         #a78bfa;
  --gam-tok-special-soft:    rgba(167,139,250,0.12);
  --gam-tok-scrim:           rgba(0,0,0,0.60);

  /* ----- retained audited badge pairs (do NOT regress) ----- */
  --gam-ok-bg:#276749;      --gam-ok-text:#c6f6d5;
  --gam-danger-bg:#9b2c2c;  --gam-danger-text:#fed7d7;
  --gam-warn-bg:#744210;    --gam-warn-text:#ffe5b0;
}
```

**Migration mechanism (`<style>` rules):** a rule like
`.gam-row{color:#9b9892;border:1px solid #2a2f38}`
becomes
`.gam-row{color:var(--gam-tok-ink-muted);border:1px solid var(--gam-tok-border)}`.

---

## 6. Rollout order (surgical)

1. Add `GAM_TOK` const + the `--gam-tok-*` lines to the existing `:root` sheet. (Additive, zero behavior change — nothing reads them yet.)
2. Migrate `<style>`-rule literals to `var(--gam-tok-*)` (safe — these are real stylesheets).
3. Migrate inline `cssText` literals to `GAM_TOK.*` concatenation, **component by component**, in the inventory order (modconsole-shell → intel-tab → ban-tab → … → master-css).
4. Each migrated component: diff must be color-only, render-verified, then the raw literals it owned drop out of the grep count.
5. Keep `*-legacy` aliases until the byte-identical opt-out flag (`body.gam-ux-polish-on`) is retired; then delete.

**Verification gate:** after each component, re-grep its literals — they should hit **zero** outside `GAM_TOK`/`:root`. The 193→≤20 collapse is measured, not asserted.
