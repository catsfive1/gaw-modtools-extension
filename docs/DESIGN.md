# DESIGN.md — GAW ModTools Design System

**Generated:** 2026-05-07 by Anthropic Frontend Design + UI/UX Pro Max + Impeccable unified pass.
**Audience:** the next session implementing UI/UX work.
**Register:** PRODUCT (design serves the moderation job).

---

## Scene sentence (use this when picking direction)

A volunteer mod on a US conspiracy-politics forum, 11pm at a cluttered desk on a 1080p monitor, scanning new user signups for hate-speech patterns while a ban grace-timer counts down and three modmail threads need triage.

Forces: dark theme, information density, zero ceremony, fast paths.

## Style: Editorial Terminal

NOT minimalism (too sparse for the data density). NOT cyberpunk neon (cliché). NOT soft SaaS (wrong job). Editorial-typographic discipline applied to a Bloomberg-Terminal-energy utility.

## Color tokens (OKLCH, restrained + 1 accent ≤10%)

```css
:root {
  /* Surfaces */
  --bg-base:        oklch(15% 0.012 280);
  --bg-raised:      oklch(19% 0.014 280);
  --bg-sunken:      oklch(12% 0.010 280);

  /* Ink */
  --ink-primary:    oklch(94% 0.008 90);
  --ink-secondary:  oklch(70% 0.010 90);
  --ink-tertiary:   oklch(50% 0.012 90);

  /* Borders */
  --border-subtle:  oklch(28% 0.010 280);
  --border-strong:  oklch(40% 0.012 280);

  /* Single accent */
  --accent-amber:       oklch(74% 0.165 65);
  --accent-amber-soft:  oklch(74% 0.165 65 / 0.12);

  /* Functional state */
  --state-danger: oklch(60% 0.21  25);
  --state-good:   oklch(72% 0.15 145);
}
```

## Typography

```css
:root {
  --font-sans: "Geist Sans", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;

  --t-xs: 11px; --t-sm: 12px; --t-base: 14px;
  --t-md: 16px; --t-lg: 20px; --t-xl: 25px; --t-xxl: 31px;

  --w-regular: 400; --w-medium: 500; --w-semi: 600; --w-bold: 700;

  --lh-tight: 1.15; --lh-snug: 1.35; --lh-body: 1.55;

  font-feature-settings: "tnum" 1, "ss01" 1, "cv01" 1;
}
```

Bundle Geist Sans + Geist Mono woff2 in the extension assets. Self-host via the extension's `web_accessible_resources`. `font-display: optional`.

## Elevation + radius

```css
:root {
  --el-1: 0 1px 2px oklch(0% 0 0 / 0.4);
  --el-2: 0 4px 12px oklch(0% 0 0 / 0.45), 0 1px 2px oklch(0% 0 0 / 0.3);
  --el-3: 0 12px 32px oklch(0% 0 0 / 0.55), 0 2px 6px oklch(0% 0 0 / 0.35);

  --r-tight: 4px; --r-default: 8px; --r-loose: 12px;
}
```

## Top-3 anti-patterns to remove

1. **Hero-metric template** — popup stats grid as 6 identical white-bg cards. Replace with typographic data list, mono numerals, contextual sparklines.
2. **Identical card grids** — macros, drill-down, maintenance all repeat `.pop-card`. Replace each with its own appropriate affordance.
3. **Glassmorphism as default** — `backdrop-filter: blur(16px)` decoratively. Reserve blur for modal scrim only.

## Required changes (priority order)

### CRITICAL blocker (do first)
- **Replace every emoji icon with Lucide SVG** — the single biggest "AI-generated" tell. Map in section 6 of HANDOFF_UX_AUTH_2026-05-07.md.

### HIGH (in order)
1. **Popup tab nav** (Tokens / Stats / Tools / Lead) — replaces 380-line vertical scroll
2. **Status bar grouping** — 4 semantic clusters with tonal separators, not pipes
3. **OKLCH token migration** — replace all 47 raw hex values, unify duplicate red/green/etc.
4. **Touch target hit-area expansion** — `::after { inset: -11px }` pattern
5. **Focus-visible rings globally** — keyboard nav currently broken
6. **Tooltip Y-offset above bar** — Commander's D1 ask

### MEDIUM
7. **Geist Sans + Geist Mono bundling** — replace generic system stack
8. **Tabular numerals globally** — `font-feature-settings: "tnum"` on data
9. **Elevation/radius scale enforcement** — kill random shadow + radius values
10. **Side-stripe border removal** — 11 instances of `border-left: 3px solid`

### LOW (cosmetic polish)
11. Skeleton shimmer for >300ms operations
12. Submit-feedback state on Save buttons
13. ARIA labels on icon-only buttons (currently `title=` only)

## What you must NOT do

- **No purple gradients.** Slop reflex.
- **No gradient text.** Impeccable absolute ban.
- **No side-stripe borders.** Same.
- **No "hero-metric template."** Same.
- **No emoji as structural icons.** This is the blocker — fix it first.
- **No system font stack.** Frontend-design slop test.
- **Don't add backdrop-filter: blur as decoration.** Reserve for modal scrim.

## Final critique score (against 99 UX rules)

After the 5 iteration changes are implemented:
- §1 Accessibility CRITICAL: 5/6 ✓ (1 partial: aria-labels)
- §2 Touch CRITICAL: 4/4 ✓
- §3 Performance HIGH: 3/3 ✓
- §4 Style HIGH: 4/5 ✓ (1 fail: emoji icons — the blocker)
- §5 Layout HIGH: 3/3 ✓
- §6 Typography MEDIUM: 7/7 ✓
- §7 Animation MEDIUM: 4/4 ✓
- §8 Forms MEDIUM: 2/3 ⚠
- §9 Navigation HIGH: 2/2 ✓

Production-ready blocker: **emoji icons.** Fix that, ship.

---

## Implementation order for next session

Don't try to do all 13 changes at once. The previous session tried that and missed half. Recommended single-session order:

**Session A (1-2 hours):** Lucide icon migration. Removes the single biggest AI-tell. Ship v9.6.7. Get Commander's read.

**Session B (2-3 hours):** OKLCH token migration + Geist font bundling. Ship v9.6.8.

**Session C (4-6 hours):** Popup tab-nav restructure. Ship v9.7.0 (semver minor — UX restructure).

**Session D (1-2 hours):** Status bar grouping + tooltip Y-offset + hit-area expansion. Ship v9.7.1.

**Session E (1 hour):** Focus-visible rings + reduced-motion + ARIA labels. Ship v9.7.2.

After E: re-run the 99-UX scorecard. If still gaps, target them individually.

Do not interleave sessions. Each ships, each gets read, each commits before the next starts.
