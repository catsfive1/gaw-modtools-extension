# GAW ModTools In-Page UI — REDESIGN BRIEF

> Consolidated build brief for the in-page (content-script) UI of the GAW ModTools
> extension. Single source of truth for the build swarm. Every work package below
> is handed to a separate build agent. Read PARTS 1–2 in full before touching any
> component package — they define the design language and the JS-safe migration
> mechanism that EVERY package depends on.
>
> Target file for all work: `modtools.js` (single ~1.7MB content script). Targeted
> reads only — never load the whole file.

---

## PART 1 — THE DESIGN LANGUAGE (one page)

A dark, injected moderation power-tool. The visual job is **decision-latency**:
a moderator must read a verdict-state in one fixation and trust that an action
landed. The language below is built around that.

### 1.1 Color tokens (canonical set — locked)

| Token | Hex / value | Role |
|---|---|---|
| `surface` | `#0a0a0b` | Deepest backdrop base |
| `surface-sunken` | `#050507` | Inset/sunken field wells |
| `surface-raised` | `#0f1114` | Primary canvas / cards |
| `surface-panel` | `#181b20` | Panels, headers, raised cards, floating-card shell |
| `surface-overlay` | `#252a31` | Selected/hover wells, modal inner, key-cap chips |
| `border` | `#2a2f38` | Normal divider/border |
| `border-strong` | `#3a3f48` | Elevated/modal/floating-layer border |
| `ink` | `#e8e6e1` | Primary text |
| `ink-muted` | `#b0b5bc` | Secondary text (WCAG-bumped). **ALL tertiary/instruction text routes here, not ink-faint.** |
| `ink-faint` | `#7a7672` | Disabled labels + field placeholders ONLY |
| `on-accent` | (split — see 1.7) | Text on colored fills |
| `accent` | `#ff9933` | Brand amber — interactive/active-state chrome ONLY |
| `accent-soft` | `rgba(255,153,51,0.10)` | Hover rows, active-row bg |
| `accent-line` | `rgba(255,153,51,0.28)` | Amber border/divider/glow, progress tracks |
| `focus-ring` | `#ff9933` | Keyboard focus outline (2px solid, 2px offset) |
| `info` | `#7cb8ff` | Links + form-input accent (WCAG-bumped) |
| `info-soft` | `rgba(74,158,255,0.10)` | Blue tint backgrounds |
| `danger` | `#f04040` | Ban/destructive/death-row-terminal |
| `danger-soft` | `rgba(240,64,64,0.12)` | Red tint / ban-pill bg / alert bg |
| `warn` | `#f0a040` | Caution/**watch** state |
| `warn-soft` | `rgba(240,160,64,0.12)` | Watch/caution tinted bg *(derive from warn @ ~12%)* |
| `success` | `#3dd68c` | Verified/OK/saved |
| `success-soft` | `rgba(61,214,140,0.12)` | Verified/saved tinted bg *(derive @ ~12%)* |
| `special` | `#a78bfa` | AI / auto-queue / death-row / new-account purple |
| `special-soft` | `rgba(167,139,250,0.12)` | AI/cluster/new-account tinted bg *(derive @ ~12%)* |
| `scrim` | `rgba(0,0,0,0.60)` | Modal/backdrop overlay (collapses all .35–.7 overlays) |

### 1.2 Type scale (6 steps)

| Step | Size | Weight / tracking | Use |
|---|---|---|---|
| label-caps | 11px | 600, `.04em`, uppercase | tabs, meta, counters, section heads, key-caps |
| secondary | 12px | 400 | muted/secondary, note-meta, hints |
| body | 13px | 400 | body text, inputs, palette rows |
| card-title | 15px | 600 | card titles |
| modal-title | 18px | 600 | modal titles |
| *(numerics)* | inherit | `font-variant-numeric: tabular-nums` | all counts, countdowns, scores |

Kill `ui-monospace` on the new-account badge — use 11px tabular caps for cross-platform consistency.

### 1.3 Spacing scale (4px base)

`4 / 8 / 12 / 16 / 24 / 32`. Defaults: card padding **16**, inter-card gap **12**,
section gap **24**, inline chip padding **4/8**, icon-gap **8**.

### 1.4 Radius

`6px` chips/buttons/inputs · `8px` cards/modals/floating notifications · `pill` (999px) for status pills.

### 1.5 Elevation contract (z-elevation = surface step + border, NOT free grays)

A strict ramp. Each step up pairs with a 1px border. Shadow ONLY on truly-floating layers.

```
backdrop      surface           (#0a0a0b)
card (in-flow)surface-raised    (#0f1114) + 1px border        — NO shadow
panel/header  surface-panel     (#181b20) + 1px border
selected/well surface-overlay   (#252a31)
sunken field  surface-sunken    (#050507) inset
floating      surface-panel + 1px border-strong + 0 8px 24px scrim shadow
              (modals, toasts, popovers ONLY)
```

This kills the "everything reads as #1a1c20" flatness. C.BG/BG2/BG3 and `--gam-bg-*`
map onto these four tokens via aliasing — no JS class renames.

### 1.6 Motion

- One global `@media (prefers-reduced-motion: reduce)` block caps ALL animation/
  transition durations and sets `animation-iteration-count: 1` across `*, ::before, ::after`.
- Every animated state needs a **static fallback that survives PRM**: skeletons →
  static `surface-overlay` block + border; repeat-halo → persistent 2px ring (not a
  one-shot pulse); countdown → static remaining-time text.
- Button "landed" confirmation: 1.2s success-green state via CSS transition keyed off
  the state class JS already toggles, then reverts.

### 1.7 Severity color-language (icon-shape + position + tint — NEVER color alone)

Every state carries **three redundant signals**: a tinted fill, a glyph/shape, and
ink-weight or a positional mark (left-rail / bottom-border). 5-level ladder:

| Level | Token | Shape/glyph | Meaning |
|---|---|---|---|
| danger | `danger` `#f04040` | octagon / solid | ban, destructive, death-row-terminal |
| warn | `warn` `#f0a040` | triangle | caution, **watch**, cluster (high-volume catch) |
| watch-chrome split | `accent` `#ff9933` | — | **chrome ONLY** (active tab/row, focus). NEVER a verdict. |
| auto-AI | `special` `#a78bfa` | robot | AI / auto-queue / new-account (outline) / death-row (solid) |
| verified | `success` `#3dd68c` | circle-check | verified / OK / saved |

**on-accent split (WCAG 1.4.3 — critical):**
- `on-accent-dark` = `#0a0a0b` → use on **amber / warn / success** fills (black-on-amber 9.86, success 11.20).
- `on-accent-light` = `#ffffff` → use on **danger / special / info** fills only. Darken the info/blue button fill until white clears 4.5:1.

**Verdict vs attribute:** verdict pills (banned/watched/death-row) = **solid fill +
on-accent text**, render first, single non-wrapping row, overflow → `+N` chip.
Attribute pills (verified/new-account) = **outline + tinted bg**, demoted to a
second row that may wrap. `special` differentiates by fill (death-row solid /
terminal) vs outline (new-account / informational).

---

## PART 2 — JS-SAFE MECHANISM (global, every package obeys)

### 2.1 Two delivery channels, one canonical source

`var()` is unreliable inside injected inline `cssText` (documented at `modtools.js:416`).
So tokens ship **twice with identical values**. `GAM_TOK` is the source of truth; the
CSS block mirrors it.

**CHANNEL 1 — inline styles (`el.style.cssText`):**
A frozen JS object next to the existing `C` object:

```js
const GAM_TOK = Object.freeze({
  surface:'#0a0a0b', surfaceSunken:'#050507', surfaceRaised:'#0f1114',
  surfacePanel:'#181b20', surfaceOverlay:'#252a31',
  border:'#2a2f38', borderStrong:'#3a3f48',
  ink:'#e8e6e1', inkMuted:'#b0b5bc', inkFaint:'#7a7672',
  onAccentDark:'#0a0a0b', onAccentLight:'#ffffff',
  accent:'#ff9933', accentSoft:'rgba(255,153,51,0.10)', accentLine:'rgba(255,153,51,0.28)',
  focusRing:'#ff9933',
  info:'#7cb8ff', infoSoft:'rgba(74,158,255,0.10)',
  danger:'#f04040', dangerSoft:'rgba(240,64,64,0.12)',
  warn:'#f0a040', warnSoft:'rgba(240,160,64,0.12)',
  success:'#3dd68c', successSoft:'rgba(61,214,140,0.12)',
  special:'#a78bfa', specialSoft:'rgba(167,139,250,0.12)',
  scrim:'rgba(0,0,0,0.60)',
});
```

Inline migration is **string concatenation only**:
`el.style.cssText='color:#9b9892'` → `el.style.cssText='color:'+GAM_TOK.inkMuted`.
**No `var()`, no runtime resolution in inline cssText. Ever.**

**CHANNEL 2 — `<style>` rules:**
A `--gam-tok-*` custom-property block appended to the existing `:root` sheet at
`modtools.js:4424`. Stylesheet rules migrate `color:#9b9892` → `color:var(--gam-tok-ink-muted)`.

`*-soft` derived tokens (warn-soft/success-soft/special-soft) must be **added** to both
channels — they are new.

### 2.2 Retained / WCAG rules

- Already-audited `--gam-*` badge pairs (ok/danger/warn bg+text) that passed WCAG in
  Session C are **RETAINED VERBATIM** — only used in `<style>` rules where `var()` is
  safe. Do not regress them.
- WCAG-bumped values WIN over raw literals: `ink-muted #8b929e→#b0b5bc`,
  `info #4A9EFF→#7cb8ff`. Keep `-legacy` aliases until the byte-identical opt-out flag retires.

### 2.3 Locked-selector discipline (HARD RULE)

Each package lists **LOCKED SELECTORS — DO NOT TOUCH**. These IDs/classes/`data-*`/ARIA
attrs are wired to JS logic and downstream selectors. You may **restyle** them (change the
CSS rule or the cssText value via GAM_TOK) but you may **NOT rename, remove, or restructure**
them, and you may not change the textContent that carries an accessible name (e.g. tab number
prefixes become CSS `::before` counters, never part of JS-written text).

### 2.4 Build gate — id-integrity check (MUST PASS)

The packager already runs structural gates (the POST MASTER G1–G4 family is precedent).
The in-page build MUST pass an **HTML↔JS id-integrity check**: every selector this brief
locks must still resolve after migration. Concretely, the gate:

1. Greps each migrated component's **literal hex values to ZERO** outside `GAM_TOK` and
   the `:root` token block (the per-component "done" signal).
2. Confirms every locked selector string still appears in the file (no accidental rename).
3. Parse-checks the file (`node --check`).

### 2.5 Rollout order (additive-first)

1. Define `GAM_TOK` + `:root --gam-tok-*` block. **Nothing reads them yet.**
2. Migrate per-component in the work-package order below. Each component verified by
   re-grepping its literals to zero + selector-integrity + `node --check`.

### 2.6 Z-layer ladder (named constants — replaces magic numbers)

Define as CSS custom props AND document the JS literals onto these tiers so backdrop-blur
can never cover a modal:

```
--z-content   : 0
--z-sticky-bar
--z-drawer
--z-backdrop-scrim
--z-modal
--z-toast     : top
```

Map existing literals (`9999990` / `9999995` / `2147483600` / `2147483640` / `10000000`)
onto these tiers. Park modal's rogue `10000000` collapses into `--z-modal`.

### 2.7 Global a11y invariants (apply in foundational packages, every package respects)

- `:focus-visible { outline:2px solid var(--focus-ring); outline-offset:2px }` on ALL
  interactive base classes. Ensure no `overflow:hidden` well clips the offset ring
  (use `overflow:clip` + inset, or pad).
- Min target size **32px** (44 primary), **24px absolute floor** via transparent `::before`
  hit-area for deliberately-small visuals. This rule is **UNscoped** — moved OFF
  `body.gam-ux-polish-on` so new classes can't silently opt out.
- One global `prefers-reduced-motion` cap (2.6).

---

## PART 3 — WORK PACKAGES (in build order)

> Foundational packages (WP-01, WP-02) MUST land first — every other package depends on
> the tokens, z-ladder, motion cap, and elevation contract they install.

---

### WP-01 — Master GAM_CSS + Token Install + Global Invariants  *(FOUNDATION — build first)*

**Target component:** GAM CSS + Touch-Target Stylesheet (global injected) — `master-css`

**Render fns / line ranges:**
- `GAM_CSS` (24090) — template literal block `24090–24410`
- `injectTouchTargetCSS` (4737) — style element text `4737–4759`
- `compactBylines` style block (12008) — `12008–12015`
- Token install target: `:root` sheet at `modtools.js:4424`; `C` object neighbor for `GAM_TOK`

**LOCKED SELECTORS — DO NOT TOUCH** (restyle only): all `#gam-*` ids and `.gam-*` classes
enumerated in the master-css inventory (`#gam-backdrop`, `#gam-mc-panel`, `#gam-intel-drawer`,
`#gam-triage`, `.gam-modal*`, `.gam-btn*`, `.gam-mc-*`, `.gam-snack*`, `.gam-tooltip`,
`.gam-input/.gam-textarea/.gam-select/.gam-field`, `.gam-chip--*`, `.gam-drawer-*`,
`.gam-ux-polish-on`, all `[data-*]` and page selectors like `.post`, `.comment`, `.mail`).

**Visual transformation:**
1. **Install both channels** (2.1): add `GAM_TOK` frozen object beside `C`; append the
   `--gam-tok-*` block to the `:root` sheet at 4424. Add the three new `*-soft` derived tokens.
2. **Collapse the dual cool/warm palette**: alias `C.ACCENT`/`C.BLUE`, `C.BORDER`/`C.LINE`,
   `--gam-bg-*` onto the single token ramp. One amber, one red, one green, one purple, one info-blue.
3. **Z-ladder** (2.6): define named `--z-*` props; reassign the magic numbers in GAM_CSS to tiers.
4. **Global motion cap** (2.6): one `@media (prefers-reduced-motion: reduce)` covering `*, ::before, ::after`.
5. **Unscope the min-target rule** (2.7): move `min-height:32px`/44-primary OFF
   `body.gam-ux-polish-on` onto the shared interactive base classes; add 24px `::before`
   hit-area helper for sub-24 visuals.
6. **Global `:focus-visible`** (2.7) on interactive base classes; ensure no injected
   `overflow:hidden` container clips the offset ring.
7. **Elevation contract** (1.5): set in-flow `.gam-*` cards to surface-raised + 1px border,
   NO shadow; floating shells (`.gam-modal`, `.gam-snack`, popovers) to surface-panel +
   border-strong + scrim shadow.

**Acceptance criteria:**
- `GAM_TOK` exists, frozen, beside `C`; `:root --gam-tok-*` block present with matching values incl. 3 new soft tokens.
- No literal hex remains in `GAM_CSS`/touch-target/compactBylines blocks outside the token definitions (re-grep → zero).
- All locked selectors still resolve (id-integrity gate green).
- Named `--z-*` props defined; no bare `9999990`/`2147483600`/`10000000` left in the sheet.
- One global PRM block; one unscoped min-target rule; global `:focus-visible` present.
- `node --check` passes.

---

### WP-02 — Mod Console Shell + Tabs + Backdrop  *(FOUNDATION — build second)*

**Target component:** `modconsole-shell` — establishes the elevation contract in practice.

**Render fns / line ranges:** `openModConsole` (8772), `renderTab` (8834), `showModal` (8267),
`showBackdrop` (8261), `_renderOpDelTab` (9076), `renderIntelTab` (9190), `renderBanTab` (9851),
`renderNoteTab` (10870), `renderMessageTab` (10956), `renderQuickTab` (11336).
Style locations: `24087–26700` (GAM_CSS), `24168–24234` (modal/mc core), `8261–8305`
(showBackdrop inline), `9023` (mc-esc-confirm inline cssText).

**LOCKED SELECTORS — DO NOT TOUCH:** `#gam-backdrop`, `#gam-mc-panel`, `.gam-mc-tab`,
`.gam-mc-panel(s)`, `.gam-mc-tabs`, `.gam-mc-body`, `.gam-mc-head`, `.gam-modal-header/title/close/pin`,
`.gam-modal-body`, `.gam-mc-titlebar/shield/user/pills`, `.gam-mc-pill*` (watch/ban/verified/dr/clean),
`.gam-modal-dock(-left/-right)`, `#mc-ban-msg`, `#mc-note-body`, `#mc-msg-body`, `#mc-ban-go`,
`#mc-note-save`, `#mc-msg-send`, `#mc-esc-confirm/discard/keep`, `#mc-opdel-filter`, `.gam-mc-quick/dur`,
`[data-tab]`, `[data-dock]`, `[data-num]`, `[role='dialog']`, `[aria-modal='true']`, `[aria-labelledby]`,
`._gamUsername`, `._gamItem`, `._gamTab`, `._gamEscHandler`.

**Visual transformation:**
1. **Elevation:** backdrop=`scrim`; shell=`surface-raised`; titlebar+tabs=`surface-panel` with
   1px `border-strong` bottom edge.
2. **Active tab — 3 redundant signals:** `accent-soft` fill + 2px `accent` bottom-border + `ink`
   (bright) label; inactive = transparent + `ink-muted`. Tab number prefix (`1·INTEL`) becomes a
   CSS `::before` counter — **never** part of JS-written textContent (keeps accessible name stable).
3. **Status pills — verdict/attribute split** (1.7): verdict pills (banned/watched/death-row) =
   solid fill + on-accent text, render first, single non-wrapping row capped to one line, overflow
   → `+N` chip; attribute pills (verified/new-account) = outline + tinted bg, second row may wrap.
   Each pill gets a leading severity glyph so a truncated chip stays parseable. Cap titlebar
   `max-height` so pills never displace the tab row.
4. **Modal positioning:** replace `top:50%/translate(-50%,-50%)` with a flex overlay
   (`align-items:flex-start; padding-block:~8vh; overflow:auto`), `max-height:88vh`. Titlebar
   always first-visible; fixes mobile clip + subpixel scale jank + 200/400% reflow.
5. **ESC-confirm:** reserve a fixed-height footer slot for `#mc-esc-confirm` styled as a real
   confirm (warn/danger border) so it never reflows the titlebar or orphans DOM.
6. **Backdrop safety:** z-layer dialog ABOVE scrim as siblings so in-dialog clicks physically
   cannot hit the backdrop hit-area (don't rely on stopPropagation).
7. **Dock state:** persistent indicator — tint the docked edge with `accent-line` / filled-vs-outline
   pin glyph, not hover-only tooltip. Docked sidebar = `surface-panel` + 1px border-strong inner edge,
   documented drawer z-tier.

**Acceptance criteria:**
- Active tab readable in grayscale (bottom-border + bg + ink-weight, not color-only); `aria-selected` set.
- Tab number prefix is a `::before` counter; accessible name = "INTEL" stable across states.
- Verdict pills single-row with `+N` overflow; attribute pills demoted; titlebar `max-height` holds.
- Modal pins top, full titlebar visible at 320px width and 400% zoom; no translate-centering.
- `#mc-esc-confirm` occupies a reserved slot; no orphan after modal destroy.
- All locked selectors resolve; component literals re-grep to zero; `node --check` passes.

---

### WP-03 — Toasts / Snacks / Undo Notifications

**Target component:** `toasts-snacks`

**Render fns / line ranges:** `showToast` (4796), `snack` (8085), `snackWithActions` (4829),
`showBanUndoToast` (7531), `_showUndoToast` (7714), `_gamShowSwRestartSnack` (7936),
`injectToastCSS` (4768), `_gamShowExtOrphanedBanner` (7964).
Styles: `4768–4786`, `24138–24147`, `24463`, `25943–25956`, inline cssText `7536–7545`,
`7719–7742`, `7938–7960`, `8007–8014`.

**LOCKED SELECTORS — DO NOT TOUCH:** `#gam-toast-stack`, `.gam-toast(-show/-success/-error/-info)`,
`#gam-undo`, `#gam-undo-toast-*`, `.gam-snack` (+ `[data-stack]`, `-show`, `-success/-error/-warn/-info`,
`-action`, `-countdown-bar`), `#gam-sw-restart-snack`, `#gam-ext-orphaned-banner/-reload/-dismiss/-copy`,
`#gam-sr-live`, `#gam-status-bar`, `[role=alert]`, `[role=status]`, `[aria-live]`.

**Visual transformation:**
1. **One floating-card shell** across all 7 functions via their existing classes: `surface-panel`
   bg, `border-strong`, 8px radius, `0 8px 24px scrim` shadow, 12/16 padding, 8px icon-gap, plus a
   **severity-colored 3px left keyline** (info/success/warn/danger/special per outcome).
2. **One `.gam-toast-btn` dismiss/action treatment:** transparent bg, 1px border, `ink-muted` text,
   32px min touch target, hover→`accent-soft`. Apply on-accent split to amber/green undo buttons
   (`on-accent-dark` text).
3. **Route all hardcoded hex** (`#1a1c20`, `#444`, `#3a2500`, `#eee`, `#4A9EFF`, `C.*` divergence)
   onto GAM_TOK.
4. **One countdown/progress style:** 2px `accent-line`→`accent` fill track at card bottom; replaces
   the 3 scattered implementations; static under PRM.
5. **Z-hierarchy:** assign existing literals to the `--z-toast` (top) tier; undo/snack carries the
   strongest elevation so the actionable toast is always topmost.
6. **a11y parity:** add `role`/`aria-live` to `_showUndoToast` (currently omits). Every toast gets a
   keyboard-reachable dismiss with visible focus ring, not just `hasAction` toasts.

**Acceptance criteria:**
- All 7 functions render one shell (panel bg, border-strong, scrim shadow, severity keyline).
- One `.gam-toast-btn` style; amber/green undo buttons pass contrast (on-accent-dark).
- No hardcoded hex remains in any toast function (re-grep → zero).
- Single progress style; static under PRM. `_showUndoToast` has aria-live; all toasts keyboard-dismissable.
- Z-literals mapped to `--z-toast`; `node --check` passes.

---

### WP-04 — Modals (Text / Bug / Park / Precedent)

**Target component:** `modals`

**Render fns / line ranges:** `askTextModal` (2900), `openBugReportModal` (1429), `openParkModal` (3775),
`_openMarkPrecedentModal` (6388). Inline styles `2912–2969`, `3778–3817`, `6393–6411`; classes
`24168–24178`, `24189–24213`, `4144–4147`.

**LOCKED SELECTORS — DO NOT TOUCH:** `#gam-bug-desc/-counter/-snap`, `.gam-bug-report-*`,
`.gam-btn(-cancel/-accent)`, `.gam-v72-asktext(-backdrop)`, `.gam-modal(-backdrop)`,
`.gam-v80-park-overlay/-modal`, `.gam-input`, `#gam-precedent-modal`, `.gam-nba-action-primary/-alt`,
`[data-gam-action='park']`, `[data-gam-park-kind/-subject]`, `role/aria-*` attrs.

**Visual transformation:**
1. All modals: `surface-raised` body + `surface-panel` titlebar + `border-strong`, 8px radius, single
   scrim shadow, top-pinned flex overlay (per WP-02 pattern) — fixes 200/400% reflow + subpixel jank.
2. **Unify form fields** into one `.gam-input-group` rhythm applied via class so the ~40 inline-styled
   elements converge without per-element JS edits: label 11px caps `ink-muted`, field on
   `surface-sunken` + 1px border, focus→accent-ring.
3. Replace `#1a1c20`/`#1a202c`/`#1a2032` divergence (bug/asktext/park) with the single surface ramp.
4. Backdrop = `scrim` token (drop park's `0.65` → shared `0.60` so urgent-action context stays legible);
   click-to-close consistent across all four modals.
5. Park modal z drops from `10000000` to `--z-modal` (z-ladder removes the need for the rogue value).

**Acceptance criteria:**
- All four modals share surface ramp + border-strong + scrim shadow + top-pinned positioning.
- Form fields visually unified via `.gam-input-group`; no per-modal hex divergence (re-grep → zero).
- Backdrop uses scrim token; park no longer uses a bespoke high-z literal.
- Locked selectors resolve; `node --check` passes.

---

### WP-05 — Ban Tab + Custom History

**Target component:** `ban-tab`

**Render fns / line ranges:** `renderBanTab` (9851), `renderCustomHist` (10334). Styles `24204–24211`,
`24272–24290`, `24887–24891`, `24909–24911`; inline `9939–9947`, `10135–10203`, `10299–10300`.

**LOCKED SELECTORS — DO NOT TOUCH:** `#mc-ban-viol/-subj/-msg/-durs/-modmail/-cancel/-go/-status/-unban`,
`#mc-ban-custom-hist(-wrap)`, `.gam-mc-custom-hist-item`, `#mc-ban-macro-pick`, `.gam-mc-dur(-active)`,
`#mc-ban-ai-*`, `#mc-ban-summary-wrap/-edit/-preview`, `#mc-ai-preview`, `.gam-mc-field`,
`.gam-mc-banner(-red/-warn/-info/-green)`, `.gam-mc-evidence*`, `.gam-mc-actions`, `.gam-btn*`,
`.gam-input`, `.gam-textarea`, `data-v`, `data-idx`, `aria-disabled`, dataset `idx/v/body`.

**Visual transformation:**
1. **Duration buttons = segmented control** on `surface-overlay`: inactive=`ink-muted`/transparent
   ghost outline (`border-strong`), active=`danger-soft` fill + `danger` text + 1px `danger` border +
   **octagon glyph + inset ring / left-bar** (non-color active mark — fixes 1.4.1). Preselect one
   default (`accent-soft`) so the active duration is visible pre-interaction. data-v parsing stays JS;
   visual is class-driven. Active amber-tier durations use `on-accent-dark`.
2. **`#mc-ban-status`** container gets a default banner shell (severity-soft bg + colored left keyline
   + 1px border) so bare `innerHTML` still reads as a structured banner.
3. **Custom-history (130px)**: thin token-styled scrollbar (`accent-line` thumb) + bottom fade-mask so
   overflow is visible; ensure focus-ring offset isn't clipped by the well's overflow.
4. **AI-summary textarea** (`#mc-ban-summary-edit`) on `surface-sunken` with the shared input rhythm;
   while replacing the preview it carries an amber "editing" left-accent that flips `success` on save.
5. Confirm-ban button sits on a `danger-soft` well, visually weightier than benign controls.
6. **Unban link**: replace the `display:none`/`''` dual-state wrapper with a stable `visibility` toggle.

**Acceptance criteria:**
- Active duration readable pre-click (non-color mark + fill + glyph); a default is preselected.
- `#mc-ban-status` renders as a structured banner even on bare innerHTML.
- Custom-history overflow visible (styled scrollbar + fade); focus ring not clipped.
- Editing/saved state visible on the summary textarea; unban link uses visibility toggle.
- Locked selectors resolve; component hex re-greps to zero; `node --check` passes.

---

### WP-06 — Intel Tab

**Target component:** `intel-tab`

**Render fns / line ranges:** `renderIntelTab` (9190). Styles `25038–25073`, `24238–24290`,
`24900–24906`, `24241–24243`, `24260–24270`, `24887–24891`, `25041–25062`; inline `9242–9243`.

**LOCKED SELECTORS — DO NOT TOUCH:** `#gam-mc-intel-summary/-score/-note/-hist/-ai-wrap`,
`#gam-intel-ai-engine/-go/-out/-text/-copy/-err`, `#gam-mc-ai-explain-wrap/-btn`, `#gam-mc-modnote-mount`,
`.gam-mc-intel-2col/-col(-left/-right)/-compact`, `.gam-mc-loading`, `.gam-mc-section`, `.gam-mc-h`,
`.gam-mc-chip(s)(-ok/-bad/-warn/-mini)`, `.gam-mc-score-*`, `.gam-mc-empty(-dense)`, `.gam-mc-note*`,
`.gam-mc-hist-*`, `.gam-mc-evidence*`, `.gam-mc-ai-*`, `.gam-mc-banner(-red)`, `.gam-mc-intel-tip`.

**Visual transformation:**
1. Two-column on `surface-raised` cards (16 padding, 12 gap, **NO shadow**), collapsing to single
   column via container width (keep the existing 520px breakpoint behavior).
2. **Loading state = the shared skeleton shimmer** (one implementation from WP-09), not the bespoke
   `.gam-mc-loading::before` spinner.
3. **AI-Explain popover** adopts the floating-card shell (`surface-panel` + `border-strong` + scrim
   shadow) WITH viewport-edge clamping; confidence chip colors map to success/warn/danger tokens so JS
   only swaps a **token class**, not a hex.
4. Section headers = 11px `accent` caps with `.04em` tracking; note-meta inline = 12px `ink-muted`
   tabular — drop decorative emoji/dashes for cross-font consistency.
5. Empty states use the shared `.gam-empty-card` style (WP-09) on `surface-raised`; route empty/tip
   text to `ink-muted` (never `ink-faint`).
6. Cadence/similarity tone drivers map to tokens (see WP-10 — shared with `sections`); chip color from
   a token class, not a runtime hex.

**Acceptance criteria:**
- Two-col cards on surface-raised, no shadow, collapse at small width.
- Loading uses the shared skeleton (not the bespoke spinner); AI-Explain uses the floating shell + edge-clamp; confidence = token class.
- Section heads 11px accent caps; note-meta tabular ink-muted, no decorative glyphs.
- Empty/tip text on ink-muted; locked selectors resolve; hex re-greps to zero; `node --check` passes.

---

### WP-07 — Note Tab + Mod Note + History

**Target component:** `note-tab`

**Render fns / line ranges:** `renderNoteTab` (10870), `mountModNote` (9382), `renderHistory` (10959).
Styles `25057–25073`, `24238–24290`, `24191–24212`.

**LOCKED SELECTORS — DO NOT TOUCH:** `#gam-mc-modnote-mount`, `#mc-note-count/-clear-all/-history/-tpl/-body/-cancel/-save/-charcount/-status`,
`.gam-mc-note*`, `.gam-mc-section`, `.gam-mc-h`, `.gam-mc-field`, `.gam-mc-actions`, `.gam-mc-hint`,
`.gam-mc-empty-dense`, `.gam-mc-banner(-warn/-info/-green/-red)`, `.gam-btn(-cancel/-accent)`,
`.gam-input`, `.gam-textarea`.

**Visual transformation:**
1. **Editing-vs-saved as a card-level state**, not a text-color whisper: left-border warm-`accent`/amber
   while dirty, `success` on save, plus a pencil→check icon swap. (Saved-flash = `success-soft` + a
   persistent "saved" micro-chip.)
2. **Char counter**: surface the 500-char threshold proactively — a subtle track that fills toward
   `warn` as the count climbs, with a visible `500+` label (threshold documented in-UI).
3. Replace the `🧹` Clear-All emoji with a consistent trash glyph (ti-trash style).
4. Meta row: add `min-width` clamps so a long mod-name + timestamp can't break the flex alignment.
5. Note-history truncation indicator beyond ellipsis (subtle fade) where it scrolls.

**Acceptance criteria:**
- Editing vs saved visually unambiguous (left-border state + icon swap), not status-text-only.
- 500-char threshold shown proactively with a visible label.
- Clear-All uses a consistent glyph; meta row has min-width clamps.
- Locked selectors resolve; hex re-greps to zero; `node --check` passes.

---

### WP-08 — Badges (shadow / repeat / senior / new / park)

**Target component:** `badges`

**Render fns / line ranges:** `__v80BuildShadowBadge` (3384), `renderSeniorChip` (4007), `parkBtn` (3887),
`newBadge` inline (6823), repeat-badge/halo (6801–6806). Styles `4143–4153`, `24485–24492`, `24549–24614`,
`4745–4754`, `24136`, `24191–24210`; inline `3894`, `6824`, `3780–3868`, `3684`, `6802–6805`.

**LOCKED SELECTORS — DO NOT TOUCH:** `[data-gam-shadow-*]` (all), `[data-gam-action='park']`,
`[data-gam-park-kind/-subject]`, `.gam-shadow-badge/-why`, `.gam-repeat-badge/-halo(--pulse)`,
`.gam-parked`, `.gam-park-btn`, `.gam-bar-icon`, `#gam-v80-park-chip`, `#gam-status-bar`, `.gam-input`,
`.gam-btn(-accent)`, `.gam-v80-park-overlay/-modal`, `#gam-v80-park-popover`, `[role='dialog']`,
`[aria-modal]`, `[aria-live]`, `[role='status']`, `[data-user]`.

**Visual transformation:**
1. **Re-map shadow-badge fills onto full-saturation tokens**: green = `success` text on `success-soft`
   + 1px border; red = `danger` text on `danger-soft` + 1px border. Drop the dim `276749/9b2c2c` /
   `c6f6d5/feb2b2` pairs. on-accent split where fills are solid.
2. **Repeat-halo = persistent ring**: a 2px `accent-line` (or `danger` for offenders) `box-shadow`
   ring that survives re-render and PRM. The 600/700ms pulse becomes the PRM-gated enhancement, not the
   only signal.
3. **Status-bar chip**: 24px min hit area (transparent `::before` to reach 24×24 without growing the
   visual), 11px tabular type, kill `ui-monospace`. Severity glyph carries meaning when the label truncates.
4. **Parked `⏸` marker** into a fixed 16px leading gutter, aligned by baseline so variable-width text
   can't misalign it.
5. **`.gam-shadow-why` tooltip**: switch `display:none` → `visibility:hidden`+`opacity` (+ `aria-hidden`
   toggling) so it stays in the a11y tree and transitions safely.
6. Severity ladder glyphs (1.7) applied so badges are legible in grayscale.
7. Park modal backdrop → shared `scrim` 0.60.

**Acceptance criteria:**
- Shadow-badge greens/reds use tokens at AA contrast on dark; dim custom hexes gone.
- Repeat state glanceable on EVERY render (persistent ring), pulse PRM-gated.
- Status-bar chip ≥24px hit area, tabular (no ui-monospace); parked glyph baseline-aligned in gutter.
- `.gam-shadow-why` in a11y tree (visibility, not display:none).
- Locked selectors resolve; hex re-greps to zero; `node --check` passes.

---

### WP-09 — Skeleton Loaders + Empty States

**Target component:** `skeleton-empty`

**Render fns / line ranges:** `renderSkeleton` (4452), `renderEmptyState` (4525), `gamMakeSkel` (4596),
`gamMakeEmpty` (4618), `gamMakeError` (4658), `__v81InjectSkeletonCss` (4476), `__v81InjectEmptyStateCss` (4566),
`__injectTokenAndStateStylesheet` (26546). Styles `4420–4504`, `4566–4583`, `26325–26367`, `26546–26638`.

**LOCKED SELECTORS — DO NOT TOUCH:** `.gam-skeleton-wrap`, `.gam-sk-line/-row/-card/-avatar`,
`.gam-skeleton-shimmer`, `.gam-empty-card/-icon/-headline/-desc/-cta/-state`, `.gam-skel-line`,
`.gam-error-state/-chip/-msg/-hint/-retry`, `aria-busy`, `aria-live`, `role=status`.

**Visual transformation:**
1. **Collapse to ONE skeleton look** on the token ramp: shimmer over `surface-overlay` blocks. Resolve
   the dual implementation (v8.1 gated vs v10.12 always-on) into one shared treatment.
2. **PRM fallback**: under reduced-motion, static `surface-overlay` block + border + a "Loading…"
   `::after` — NOT nothing.
3. **Unify the two empty-state CSS blocks** into one `.gam-empty-card`: `surface-raised`, 24 padding,
   centered 13px `ink-muted` message + 12px `ink-faint` subtext + a 44px-min CTA (accent or ghost).
   Remove the 26325–26367 override duplication. (Empty popup state's 9px-font/no-touch-target case
   gets the 44px CTA.)
4. **Error states**: swap hardcoded `#ff3b3b`/`#f0a040` for `danger`/`warn` tokens.

**Acceptance criteria:**
- One skeleton implementation; static PRM fallback present.
- One `.gam-empty-card` (no duplicate override block); CTA ≥44px.
- Error states use danger/warn tokens (no hardcoded hex).
- Locked selectors resolve; hex re-greps to zero; `node --check` passes.

---

### WP-10 — Content Sections (User / Post / Thread / QueueItem Intel Drawer)

**Target component:** `sections`

**Render fns / line ranges:** `buildUserSections` (6767), `buildThreadSections` (7205),
`buildPostSections` (7265), `buildQueueSections` (7350). Styles `6824–6913`, `24475–24543`,
`26369–26378`, `26600+`.

**LOCKED SELECTORS — DO NOT TOUCH:** `.gam-repeat-badge/-halo(--pulse)/-label/-history`,
`.gam-drawer-note-row/-author/-ts/-body/-form`, `.gam-nba-action-primary/-alt`, `.gam-error-state`,
`.gam-at-wrap/-header/-spark/-spark-bar/-row/-removed-row/-time/-kind-p/-kind-c/-title/-removed/-meta/-score-pos/-score-neg`,
`.sim-panel(-header)`, `.sim-row`, `.sim-username`, `.sim-pill(--HIGH/--MEDIUM/--WATCH)`, `.sim-meta`,
`.gam-muted`, `[data-gam-nba-action]`, `[data-section]`, `[data-boundary]`, `hidden`, `role=button`, `tabindex`.

**Visual transformation:**
1. **Cadence chip** color driven from a token map (BURSTING→`danger`, HEAVY→`warn`, NEW→`special`) at
   consistent saturation — not ad-hoc runtime strings.
2. **Similarity pills**: standardize HIGH/MED/LOW onto `danger`/`warn`/`ink-muted` tiers so confidence
   reads positionally; keep the locked `.sim-pill--*` class names (restyle only).
3. **Activity sparkline**: cap bar heights to a normalized CSS scale so distributions stay comparable
   across users (no raw inline pixel heights driving visual weight).
4. **Repeat-halo**: persistent ring per WP-08 (shared treatment), PRM-gated pulse.
5. **Explicit empty state** for zero-length arrays: `ink-faint` block + a one-line "no signal" label
   (don't inherit ambiguous muted color).
6. New-account badge: 11px tabular caps (shared with WP-08), `special` outline.

**Acceptance criteria:**
- Cadence + similarity colors token-driven at consistent saturation; `.sim-pill--*` names preserved.
- Sparkline heights normalized via CSS (comparable across users).
- Zero-length arrays show an explicit empty state, not bare muted text.
- Locked selectors resolve; hex re-greps to zero; `node --check` passes.

---

### WP-11 — Command Palette (Ctrl+Shift+P) + Action-Picker HUD

**Target component:** `command-palette` (+ `action-picker-hud` — same DOM)

**Render fns / line ranges:** `_openPalette` (5462), `_closePalette` (5458), `_apEnsure` (5757),
`_apRender` (5804), `_apExecuteCurrent` (5830), `_apOpen` (5838), `_apClose` (5848). Inline cssText
`5764`, `5766–5773`, `5812`, `5821–5823`.

**LOCKED SELECTORS — DO NOT TOUCH:** `#gam-cmdk-palette`, `#gam-cmdk-card`, `#gam-cmdk-input`,
`#gam-cmdk-list`, `[role='dialog']`, `[role='combobox']`, `[role='listbox']`, `[role='option']`,
`[aria-modal='true']`, `[aria-label='ModTools command palette'/'Filter commands'/'Available commands']`,
all aria-* (`-haspopup/-expanded/-controls/-activedescendant/-selected/-autocomplete`).

**Visual transformation:**
1. Input row = `surface-sunken` well, 13px body, a specific placeholder (not generic).
2. **Selected row — full-weight indicator**: `accent-soft` fill + 2px `accent` left-border + `ink`
   (bright) text, replacing the low-contrast tint. Ensure `calc(65vh-50px)` list container doesn't
   clip the focus-ring offset; selected row scroll-into-view on keyboard nav.
3. **Icon gutter** fixed 20px with 13px tabular type for emoji consistency.
4. **Empty state**: centered 12px `ink-muted` with actionable copy ("No commands match — try fewer
   words"), never `ink-faint`.
5. **Keyboard-hint footer** on `surface-panel`, 11px caps, with `↑↓`/`⏎` in bordered key-cap chips
   (`border` + `surface-overlay` bg) instead of bare unicode.
6. Scrollbar → thin `accent-line`-on-track styling. Backdrop → `scrim` token (drop the subtle 2px blur).

**Acceptance criteria:**
- Selected row unmistakable during keyboard nav (left-rail + fill + bright ink); scrolls into view; ring not clipped.
- Icon gutter fixed 20px tabular; empty state actionable on ink-muted.
- Key-cap chips bordered; scrollbar accent-styled; backdrop = scrim.
- Locked selectors resolve; hex re-greps to zero; `node --check` passes.

---

### WP-12 — Triage Console (alerts / stats / toolbar / batch bar) — the BURST surface

**Target component:** `triage-console`

**Render fns / line ranges:** `buildTriageData` (15139), `refreshTriageConsole` (15321),
`renderTriageStats` (15407), `renderTriageAlerts` (15731), `renderTriageToolbar` (15848),
`renderTriageBatchBar` (15902). Styles `24664–24826`; inline `15351`, `15566–15567`, `15737`, `15747`,
`15799`, `15822`, `15889–15890`, `15906–15914`.

**LOCKED SELECTORS — DO NOT TOUCH:** `#gam-triage`, all `.gam-t-*` classes (stats/alert/toolbar/filter/
cluster/batch/list/row/check/user/ip/risk/prior/status/badge/countdown/verified/actions/act/section/
dr-rule/dr-add/tards/users-live-dot), `#gam-dr-rules`, `#gam-tards-rules`, `#gam-dr-add-*`,
`#gam-tards-add-*`, `#gam-*-pat-hint`, `#gam-dr-sweep-*`, `#gam-users-live-dot`, all `[data-action=*]`,
`[data-rule-idx]`, `[data-trule-idx]`, `[data-cluster(-select)]`, `[data-sb-for]`, `[data-incluster]`,
`[data-flush]`, `[data-user]`.

**Visual transformation (stability over density — every reflow is a re-scan):**
1. **COMPACT density mode**: 28–32px user rows, 11–12px tabular type, soft-tinted status chips.
2. **Filter row = fixed-height single-line horizontal-scroll container** (no vertical wrap) so buttons
   never reposition on resize — preserves operator muscle-memory. Active filter = `surface-overlay` bg +
   `accent-soft` + `accent` border.
3. **Batch-action bar**: sticky, fixed-height; count as a bold `accent` chip; actions truncate (not wrap).
4. **Stats grid**: `auto-fit minmax(120px,1fr)` (or a fixed 2-up with ellipsis values) so it reflows
   instead of overflowing at narrow widths; collapse to single column below 380px.
5. **Cluster badge** promoted to high salience: `warn`-level (warm-amber + triangle) OR `special-soft`
   bg + `special` border + raised one elevation step — catchable mid-firehose.
6. **Death-row countdown**: `danger-soft` bg + `danger` ink + tabular/monospace digits so it reads as
   time-pressure and is visually distinct from status badges (keyline pattern).
7. **Rule-pattern input** (`gam-t-dr-add-pat`): visible 2px `info`/`accent` focus-ring + `surface-sunken`
   well — the "barely-visible blue border" goes away. Click-to-edit affordance = persistent dotted
   underline in `ink-faint` (not hover-only).
8. Separate the two competing CTAs (AI-scan vs auto-DR sweep) by weight: one primary `accent` fill, the
   other ghost/outline.

**Acceptance criteria:**
- Filter buttons never reposition vertically on resize (fixed-height horizontal scroll).
- Stats grid never overflows narrow viewports; collapses below 380px.
- Batch bar sticky/fixed-height, count is a bold accent chip, actions truncate.
- Cluster badge high-salience; death-row countdown danger-soft + tabular, distinct from status badges.
- Rule-pattern input has a visible focus ring + well; click-to-edit affordance persistent.
- Compact rows 28–32px; locked selectors resolve; hex re-greps to zero; `node --check` passes.

---

### WP-13 — Top Banners (auth-fail, ext-orphaned)

**Target component:** `banners`

**Render fns / line ranges:** `__showAuthFailBanner` (29965), `_gamShowExtOrphanedBanner` (7964).
Inline `30040–30133`, `8007–8014`; CSS rules `25842–25873`.

**LOCKED SELECTORS — DO NOT TOUCH:** `#gam-auth-fail-banner` (+ `button`), `#gam-ext-orphaned-banner`,
`#gam-ext-orphaned-copy/-reload/-dismiss`, `[data-severity]`.

**Visual transformation:**
1. Route the inline-hardcoded rgba colors + the dual inline/`--bb-*` var mix onto GAM_TOK so both
   banners draw from one system (kills the "two style systems" maintenance burden).
2. Apply the floating/notification shell language (severity-soft bg + colored left keyline + 1px border)
   consistent with WP-03.
3. Add explicit hover/focus states + a **disabled-state visual** for buttons (auth-fail sets the
   `disabled` attr with no feedback today). One shared button treatment (`.gam-toast-btn` family).
4. Banner title color reconciled to the token severity (no CSS-var vs inline-rgba mismatch).
5. Map the hardcoded z-index literals (`2147483640` vs `99999999`) onto the `--z-*` ladder.

**Acceptance criteria:**
- Both banners token-driven (no raw rgba / no dual style system); title color consistent.
- Buttons have hover/focus + a disabled-state visual; shared button treatment.
- Z-literals mapped to the ladder; locked selectors resolve; hex re-greps to zero; `node --check` passes.

---

## BUILD ORDER (dependency-correct)

```
WP-01  Master GAM_CSS + Token Install + Global Invariants   [FOUNDATION]
WP-02  Mod Console Shell + Tabs + Backdrop                  [FOUNDATION]
WP-03  Toasts / Snacks / Undo
WP-04  Modals (Text / Bug / Park / Precedent)
WP-05  Ban Tab + Custom History
WP-06  Intel Tab
WP-07  Note Tab + Mod Note + History
WP-08  Badges (shadow / repeat / senior / new / park)
WP-09  Skeleton Loaders + Empty States
WP-10  Content Sections (User/Post/Thread/QueueItem)
WP-11  Command Palette + Action-Picker HUD
WP-12  Triage Console (burst surface)
WP-13  Top Banners (auth-fail, ext-orphaned)
```

Every package: re-grep its literals to **zero** outside `GAM_TOK`/`:root`, confirm all locked
selectors still resolve (id-integrity gate), `node --check`. No package renames/removes a locked
selector or changes accessible-name textContent.
