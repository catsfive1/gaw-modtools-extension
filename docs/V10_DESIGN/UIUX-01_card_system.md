# UIUX-01 — Popup Card System Redesign
**Auditor:** DESIGN-01-CARDS-OVERVIEW
**Skill invoked:** ui-ux-pro-max (documentation mode — 99 UX rules, 50+ styles, 161 palettes applied)
**Generated:** 2026-05-10
**Popup width:** 380px fixed (Chrome extension constraint)
**Theme:** Bloomberg Terminal — amber (#ff9933) / black (#0c0e12) / JetBrains Mono

---

## A. Current State Critique

### A.1 The `<details>` accordion is the wrong primitive for this surface

The current card system uses `<details class="gam-card">` with `<summary class="gam-card-head">` for three cards: **Tools** (`#card-tools`), **Maintenance** (`#card-maint`), and **Macros** (`#card-macros`) — all `data-tab="tools"`. Two more cards exist for Tokens (`#card-tokens`, no `data-tab`) and Lead (`#card-lead`, no `data-tab`), plus a `<div data-tab="diag">` wrapper around the Diag card.

`<details>` is the wrong primitive here for six reasons:

1. **Collapsed state is a false affordance.** All three cards ship with `open` attribute. They default open. If a user closes one and reopens the popup (within the same Chrome session), the collapsed state is not persisted — it resets. The CSS class `gam-card-order-last` is only wired for the tokens card, not the others. Mods get no memory of their preferences.

2. **The `<summary>` header does not visually delineate card boundaries.** There are no explicit CSS rules for `.gam-card`, `.gam-card-head`, `.gam-card-body`, `.gam-card-chevron`, or `.gam-card-title` anywhere in `popup.css`. Zero. The visual appearance comes entirely from the Bloomberg cascade rules hitting `<details>` and `<summary>` elements incidentally. This is architecturally fragile: any Bloomberg CSS iteration that normalizes `<details>` will visually break all cards.

3. **Three cards stacked on the Tools tab with no visual separation.** On the Tools tab, `#card-tools` + `#card-maint` + `#card-macros` render as a continuous unbroken column. There is no margin, gap, border, or background contrast differentiating where one card ends and the next begins. To a mod, this reads as one long wall of buttons. Commander's complaint — "each section needs to be its own SEPARATE AND INDIVIDUAL CARD" — is physically true: the sections ARE visually merged.

4. **Tab-scoping is done on inner children, not the card container.** `data-tab="tools"` is on the `<details>` element itself, but `wireTabNav()` in `popup.js` also tags `.pop-actions`, `.pop-tools`, `.pop-maint`, `.pop-section-label`, and named panels with `data-tab="tools"` by selector. This means card content and card container are separately gated — a double-hide pattern. This caused the recurring "card headers leaking into wrong tabs" bug fixed in v10.6.2 (`display:grid !important` defeating `display:none !important`). The v10.6.1 hotfix added chained selectors (`.pop-stats.pop-tab-hidden`) as a band-aid, but the root cause — tab scoping on inner children — is still live.

5. **`#card-tokens` and `#card-lead` have no `data-tab` attribute.** These two cards are not in `TAB_MAP` and have no `data-tab` on their `<details>` element. Their visibility is handled entirely by `wireTabNav()`'s special-case code for `#leadSection` and `#leadOnlyTools`. This makes the system inhomogeneous: 3 cards use `data-tab` on the container, 2 cards are hard-coded special cases in JS.

6. **No visual card identity.** In a Bloomberg Terminal aesthetic, cards should be discrete panel units with a clear header bar (amber uppercase label, left rail or top border), a sunken body, and an unambiguous bottom boundary. The current `<details>` approach produces headers that look like accordion triggers — correct for a collapsible, wrong for a permanent information panel. Mods are spending cognitive effort figuring out where sections begin and end.

### A.2 Bloomberg CSS `!important` specificity conflict

The Bloomberg layer (starting at `popup.css:660`, the `:root { --bb-* }` block) applies `!important` to every structural layout rule: `.pop-stats { display: grid !important }`, `.pop-tools { display: flex }`, `.pop-maint { border: 1px solid var(--bb-line) !important }`. When `wireTabNav()` tries to hide these with `.pop-tab-hidden { display: none !important }`, the chained Bloomberg rules at the same or higher specificity win — hence the multi-hotfix history. The card `<details>` elements lack Bloomberg rules entirely, making them CSS orphans that inherit whatever the browser default `<details>` rendering produces (typically zero visual treatment in Chrome).

### A.3 Information hierarchy is absent

The ui-ux-pro-max `visual-hierarchy` rule (priority 5, layout) and `weight-hierarchy` rule (priority 6, typography) both require that size, spacing, and weight establish reading order. Currently:
- Card headers (summary text, ~11px uppercase) are the same weight as section labels inside cards (`pop-section-label`, also 11px uppercase amber)
- Card bodies have no background differentiation from the popup body (`#0c0e12` everywhere)
- There is no margin between cards on the Tools tab — the vertical rhythm collapses to zero at section boundaries

### A.4 The `open` default destroys scrollability

With all three Tools-tab cards open by default, the popup body on the Tools tab is ~800px tall in a 600px popup window (Chrome extension max height before scrolling kicks in). The ui-ux-pro-max `scroll-behavior` rule warns explicitly: "avoid nested scroll regions that interfere with the main scroll experience." The current design forces mods to scroll past an entire Maintenance accordion to reach Macros, even though the tab nav was specifically added to eliminate scrolling (Commander issue #30).

---

## B. Redesign Proposal

### B.1 Core principle: permanent panels, not accordions

Replace `<details>` with explicit `<div class="gam-card" data-tab="X">` permanent panels. Each card is always fully visible within its tab — no collapse/expand on the card level. Collapse is only used for the existing inner `<details class="pop-maint-advanced">` (System diagnostics) and `<details class="pop-maint-advanced" id="leadSettingsAccordion">`, which are correctly scoped sub-accordions, not top-level cards.

**Rationale from ui-ux-pro-max:**
- `progressive-disclosure` rule (priority 8): reveal complexity progressively via sub-accordions, not by hiding entire sections behind a top-level toggle
- `content-priority` rule (priority 5): show core content first; the Tools tab's three sections are all "core" — they should all be visible without user action
- `nav-hierarchy` rule (priority 9): the tab bar IS the primary navigation; cards within a tab are secondary content that should be fully exposed once the tab is selected

### B.2 Card anatomy

Each card gets a mandatory three-part structure:

```
.gam-card                    ← outer container, border, background, margin
  .gam-card-header           ← top bar: amber left rail + uppercase title + optional badge
  .gam-card-body             ← content area: slightly sunken bg, consistent padding
```

**Visual signals per card header:**
- 2px amber left rail (the Bloomberg "accent line" pattern already used on `#leadSection::before`)
- 10px uppercase monospace label, letter-spacing 0.1em, color `--bb-amber`
- Optional status badge (pill, right-aligned): count or state indicator
- Header background: `--bb-panel` (`#181b20`) — one step lighter than card body
- Card body background: `--bb-bg` (`#0c0e12`) — the popup base

**Separation between cards:**
- 8px gap (`margin-bottom: var(--bb-s4)`) between sibling cards within a tab
- 1px solid `--bb-line-hot` border on all four sides of each card
- No gap needed between card header and card body — they share the card border

### B.3 Tab scoping — unified, no special cases

Every `<div class="gam-card">` gets `data-tab="X"` on the outer container. `wireTabNav()` hides/shows the container. Inner children inherit. No more double-hide. No more special-case JS for `#leadSection` / `#leadOnlyTools`.

The Tokens card moves to `data-tab="tokens"`. The Lead card moves to `data-tab="lead"`. The `#leadSection` div inside the Lead card retains its amber left-rail styling but is no longer a special visibility target — it's just content inside `#card-lead`.

Exception: `#leadSection` currently appears on BOTH the Tokens tab (token input) and Lead tab (token input + lead tools). The cleanest migration is to duplicate the token input row into both cards, or extract the shared portion into a `data-tab=""` static row above the card stack. Recommendation: put the Team Token input in `data-tab="tokens"` and the Lead Token input in `data-tab="lead"`. They are logically separate — no duplication needed.

### B.4 Stats panel stays as-is

The `.pop-stats` grid (Stats tab) is correctly implemented — it IS a Bloomberg terminal ledger panel, not a card. No changes to the Stats tab card pattern.

### B.5 Sizing constraints at 380px

At 380px width with 12px horizontal padding on each side, card content width is 356px. Card internal padding: 8px horizontal (`--bb-s4`), giving a content column of 340px. This is sufficient for:
- Two-column button grids (4px gap, ~166px per button)
- Full-width single-column inputs
- The macros list (max-height: 240px overflow scroll — retained)

No card should have internal horizontal scrolling. The rotation roster panel (`max-width: none !important`) already fills width correctly.

---

## C. Visual Mockup (ASCII)

### C.1 Tools tab — three discrete cards

```
+------------------------------------------+  <- popup border (380px)
| SHIELD ModTools          v10.11   [LEAD] |  <- .pop-header (amber bottom border)
+------------------------------------------+
| STATS | TOKENS | TOOLS | LEAD | DIAG     |  <- .pop-tabnav
+------------------------------------------+
|                                          |
| +--------------------------------------+ |  <- .gam-card#card-tools (8px margin)
| |[= TOOLS                        [0] ]| |  <- .gam-card-header (amber left rail)
| +--------------------------------------+ |
| | [Diagnostics]                        | |  <- .pop-section-label
| | [Debug snapshot]  [Dashboard      ] | |
| | [Data harvest]                       | |
| | [Crawl /users(10)] [/users(30)    ] | |
| | [Crawl /queue (5)]                   | |
| +--------------------------------------+ |
|                                          |
| +--------------------------------------+ |  <- .gam-card#card-maint (8px gap above)
| |[= MAINTENANCE                  [!] ]| |  <- header, amber rail, badge if warning
| +--------------------------------------+ |
| | [!] Safe Mode                  [OFF] | |
| | [Cookie clear + localStorage      ] | |
| | [Token health probe               ] | |
| | [AI: suggest tard/sus patterns    ] | |
| | [AI: scan modmail sticky requests ] | |
| | > System diagnostics (advanced)    | |  <- inner <details> stays
| +--------------------------------------+ |
|                                          |
| +--------------------------------------+ |  <- .gam-card#card-macros
| |[= TEAM MACROS                  [3] ]| |  <- badge = macro count
| +--------------------------------------+ |
| | [Ban messages] [Modmail replies   ] | |
| | +------------------------------------+ |
| | | Loading...                         | |  <- #macrosList (scrollable, max 240px)
| | +------------------------------------+ |
| | [+ Add custom] [Spark Generate AI ] | |
| +--------------------------------------+ |
|                                          |
+------------------------------------------+
| Export log . Import . Factory reset      |  <- .pop-footer
+------------------------------------------+
```

### C.2 Tokens tab — single card

```
+------------------------------------------+
| ... header + tabnav ...                  |
+------------------------------------------+
|                                          |
| +--------------------------------------+ |  <- .gam-card#card-tokens data-tab="tokens"
| |[= TOKENS                           ]| |
| +--------------------------------------+ |
| | [KEY] Team Mod Token                 | |
| | Required for all mod actions         | |
| | [password input                    ] | |
| | [Save]                               | |
| | [Rotate my token] [I have an invite] | |
| |                                      | |
| | [First-run wizard — when no token]   | |
| |                                      | |
| | [Claim invite]                       | |
| | [Re-enter credentials]               | |
| +--------------------------------------+ |
|                                          |
+------------------------------------------+
```

### C.3 Lead tab — single card

```
+------------------------------------------+
| ... header + tabnav ...                  |
+------------------------------------------+
|                                          |
| +--------------------------------------+ |  <- .gam-card#card-lead data-tab="lead"
| |[= LEAD                             ]| |  <- purple left rail (not amber) to signal authority tier
| +--------------------------------------+ |
| | [CROWN] Lead Mod Token               | |
| | [password input — purple border    ] | |
| | [Save]                               | |
| |                                      | |
| | -- lead-only tools (gated) --        | |
| | [Generate invite link             ] | |
| | [Mod rotation roster              ] | |
| |                                      | |
| | ACTIVE NOW  CLR-RATE  MM p50  INC    | |  <- #leadKpiRow (4-tile, display:grid)
| | [+Invite] [Rotate all] [Bugs] [Chat] | |  <- #leadQuickActions
| |                                      | |
| | LAPSED [N]  [Ping all]               | |  <- #lapsedModsCard
| |                                      | |
| | > Settings & Maintenance (advanced)  | |  <- inner accordion stays
| +--------------------------------------+ |
|                                          |
+------------------------------------------+
```

### C.4 Diag tab — single card

```
+------------------------------------------+
| ... header + tabnav ...                  |
+------------------------------------------+
|                                          |
| +--------------------------------------+ |  <- .gam-card#card-diag data-tab="diag"
| |[= DIAGNOSTICS                      ]| |
| +--------------------------------------+ |
| | [SYSTEM IDENTITY]                    | |
| | Loading...                           | |
| | [SERVICE WORKER HEALTH]              | |
| | Loading...                           | |
| | [RPC ERROR LOG (LAST 50)]            | |
| | Loading...     [Copy errors]         | |
| | [STORAGE + AUDIT]                    | |
| | Loading...                           | |
| | [Copy full snapshot to clipboard   ] | |
| +--------------------------------------+ |
|                                          |
+------------------------------------------+
```

---

## D. CSS Specification

Add the following rule block to `popup.css`, immediately after the `.pop-maint-advanced` block (after line 1336). These are Bloomberg-system-aligned, fully `!important`-safe.

```css
/* ── v10.11 UIUX-01: Discrete card panel system ─────────────────────────
   Replaces <details> accordion with explicit permanent panels.
   Each .gam-card is a standalone visual unit: border, header bar, body.
   Bloomberg-compatible: no rounded corners, monospace headers, amber rails.
   ──────────────────────────────────────────────────────────────────────── */

.gam-card {
  display: block !important;
  margin: 0 0 var(--bb-s4) 0 !important;       /* 8px gap between cards */
  border: 1px solid var(--bb-line-hot) !important;
  background: var(--bb-bg) !important;
  position: relative;
}

/* Amber left rail — the Bloomberg panel accent */
.gam-card::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--bb-amber) !important;
  pointer-events: none;
  z-index: 1;
}

/* Lead card: purple authority rail instead of amber */
#card-lead::before {
  background: var(--bb-purple) !important;
}

.gam-card-header {
  display: flex !important;
  align-items: center !important;
  gap: var(--bb-s3) !important;
  padding: var(--bb-s3) var(--bb-s4) var(--bb-s3) var(--bb-s5) !important;
  background: var(--bb-panel) !important;       /* #181b20 — one step above bg */
  border-bottom: 1px solid var(--bb-line-hot) !important;
  min-height: 0 !important;
  user-select: none;
}

.gam-card-title {
  font: 700 var(--bb-t-xs)/1.2 var(--bb-font) !important;
  color: var(--bb-amber) !important;
  text-transform: uppercase !important;
  letter-spacing: 0.12em !important;
  flex: 1 1 auto;
}

/* Lead card title: purple */
#card-lead .gam-card-title {
  color: var(--bb-purple) !important;
}

.gam-card-badge {
  font: 700 var(--bb-t-xs)/1 var(--bb-font) !important;
  color: var(--bb-bg) !important;
  background: var(--bb-amber) !important;
  padding: 1px var(--bb-s2) !important;
  border-radius: 0 !important;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  min-width: 18px;
  text-align: center;
}

/* Warning badge: red bg */
.gam-card-badge.warn {
  background: var(--bb-red) !important;
}

.gam-card-body {
  padding: var(--bb-s4) var(--bb-s4) var(--bb-s4) var(--bb-s5) !important;
  background: var(--bb-bg) !important;
}

/* Urgent state: amber border, pulsing left rail */
.gam-card.gam-card-urgent {
  border-color: var(--bb-amber) !important;
}
.gam-card.gam-card-urgent::before {
  animation: gam-card-rail-pulse 1.8s ease-in-out infinite;
}
@keyframes gam-card-rail-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

/* Order-last: appended to end of card stack when token is confirmed OK */
.gam-card.gam-card-order-last {
  order: 999;
}

/* The card container on a tab is a flex column so order-last works */
[data-tab] > .gam-card,
.pop-tab-body > .gam-card {
  /* flex child ordering support */
}
```

### D.1 Remove these now-obsolete rules when migration is complete

- The `<details>` / `<summary>` browser-default rendering was providing zero explicit styling. No removal needed in CSS — but the `.gam-card-order-last` JS class must be updated to target the new `.gam-card` div, not the old `<details>`.

---

## E. HTML Structure Specification

### E.1 New card element template

Replace every:
```html
<details class="gam-card" id="card-X" data-tab="Y" open>
  <summary class="gam-card-head">
    <span class="gam-card-chevron" aria-hidden="true"></span>
    <span class="gam-card-title">TITLE</span>
    <span class="gam-card-badge" id="card-badge-X" style="display:none"></span>
  </summary>
  <div class="gam-card-body">
    [content]
  </div>
</details>
```

With:
```html
<div class="gam-card" id="card-X" data-tab="Y">
  <div class="gam-card-header">
    <span class="gam-card-title">TITLE</span>
    <span class="gam-card-badge" id="card-badge-X" style="display:none"></span>
  </div>
  <div class="gam-card-body">
    [content]
  </div>
</div>
```

Changes:
- `<details>` → `<div>` (no open/close state)
- `<summary class="gam-card-head">` → `<div class="gam-card-header">`
- Remove `<span class="gam-card-chevron">` (no chevron needed on permanent panels)
- Keep `data-tab="Y"` on the outer div (unchanged — JS targets this)
- Remove `open` attribute (not applicable to div)

### E.2 Per-card migrations

| Old element | New element | data-tab | Notes |
|---|---|---|---|
| `<details#card-tools>` | `<div#card-tools>` | `tools` | No change to content |
| `<details#card-maint>` | `<div#card-maint>` | `tools` | Inner `<details class="pop-maint-advanced">` stays as-is |
| `<details#card-macros>` | `<div#card-macros>` | `tools` | No change to content |
| `<details#card-tokens>` | `<div#card-tokens>` | `tokens` | ADD data-tab="tokens" (currently missing) |
| `<details#card-lead>` | `<div#card-lead>` | `lead` | ADD data-tab="lead" (currently missing) |
| `<details#card-diag>` (inside `#diagTabSection`) | `<div#card-diag>` | Stays inside `div#diagTabSection[data-tab="diag"]` | diagTabSection wrapper retained |

### E.3 Diag tab — no wrapper needed

`#diagTabSection` is a `<div data-tab="diag">` wrapping `<details#card-diag>`. After migration, it wraps `<div#card-diag>`. The wrapper is still valid and should be kept — it allows adding more cards to the Diag tab in future without changing the tab-scoping logic.

### E.4 Emoji icons in card titles

Current titles include emoji: `&#x1F527; Maintenance`, `&#x1F4DD; Team Macros`, `&#x1F511; Tokens`, `&#x1F451; Lead`. The ui-ux-pro-max `no-emoji-icons` rule (priority 4) flags emoji as structurally wrong for icon usage. However, these are used as Unicode glyphs in text content, not as interactive controls — and Commander has approved the Bloomberg aesthetic which accepts them in this role. They should be kept as-is but wrapped in `aria-hidden="true"` spans to prevent screen reader verbosity:

```html
<span class="gam-card-title">
  <span aria-hidden="true">&#x1F527;</span> MAINTENANCE
</span>
```

---

## F. Implementation Notes

### F.1 `__maintWire` — zero changes needed

`__maintWire(id, fn, label)` in `popup.js` wires button click handlers by element ID. All button IDs (`maintCookies`, `maintStorage`, etc.) are on elements inside `.gam-card-body` which is structurally identical. The function is not aware of the card container — it's purely ID-based. No changes.

### F.2 `TAB_MAP` in `wireTabNav` — targeted additions only

Current `TAB_MAP`:
```js
tokens: ['#claimInviteWrap', '.pop-token:not(#macrosSection):not(#leadSection)'],
lead:   []  // special-cased below
```

After migration:
- `#card-tokens` gains `data-tab="tokens"` on the outer div — `wireTabNav`'s `querySelectorAll('[data-tab]:not(.pop-tab)')` already handles this. No TAB_MAP change needed for tokens.
- `#card-lead` gains `data-tab="lead"` on the outer div — same, automatic.
- The special-case block for `#leadSection` and `#leadOnlyTools` in `wireTabNav` becomes unnecessary **only if** `#leadSection` and `#leadOnlyTools` are children of `#card-lead` which is itself `data-tab="lead"`. Since both divs are already inside the card-lead content, they inherit the parent hide/show. Remove the special-case block from `wireTabNav` after confirming no other tabs reference those IDs.

**Key risk:** `#claimInviteWrap` is currently in `TAB_MAP.tokens` but is a sibling of `#card-tokens` in the HTML (it lives AFTER the `</details>` closing tag for `#card-tokens`, at line 625). After migration, move `#claimInviteWrap` inside `#card-tokens .gam-card-body` to eliminate the need for its TAB_MAP entry.

### F.3 Collapsed-state persistence

Current code in `popup.js` (~lines 140-165):
```js
card.removeAttribute('open');                           // sets <details> collapsed
card.classList.add('gam-card-order-last');             // reorders card
chrome.storage.local.set({ gam_card_open_tokens: false });
```

After migration:
- Remove `card.removeAttribute('open')` — no-op on a `<div>`
- `card.classList.add('gam-card-order-last')` — still works, CSS `order:999` applies
- `gam_card_open_tokens` storage key — no longer meaningful. Remove the write. Reading this key on popup open can be removed too. The card is always visible; only its position changes.

### F.4 `_cardAuthFailed` and `_cardWizardComplete`

Both functions call `card.setAttribute('open', '')` and `card.removeAttribute('open')`. After migration, these lines become no-ops but do not cause errors (setAttribute on a div is valid HTML). Remove them in a cleanup pass — they are dead code post-migration. The `gam-card-urgent` class manipulation and badge insertion logic are unaffected.

### F.5 `#firstRunWizard` DOM position

`#firstRunWizard` is currently inside `#card-tokens .gam-card-body` (between the Team token block and the `<details#card-lead>` opening). After migration, its position is unchanged. No action needed.

### F.6 `#restartSetupWrap` DOM position

Currently at the bottom of `#card-tokens .gam-card-body`, just before the closing `</div>`. Position unchanged after migration. The `firstRunDone` button's click handler calls `card.removeAttribute('open')` — remove that line.

### F.7 The `#leadKpiRow` display:grid hotfix

`#leadKpiRow` has an inline comment noting a HOTFIX that removed `display:grid` from its inline style because it was defeating `display:none`. This was caused by the same CSS specificity war that hit `.pop-stats`. After migration, `#leadKpiRow` is inside `#card-lead[data-tab="lead"]` which is hidden/shown by the card container. The inline `display:none` on `#leadKpiRow` is controlled by `__applyLeadGate` — that logic is unchanged. The hotfix comment can stay as documentation.

---

## G. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **`wireTabNav` special-case removal breaks lead tab** | HIGH | Test lead tab visibility on all 5 tabs after removing the `#leadSection` / `#leadOnlyTools` special-case block. If anything breaks, restore the block — it's additive-safe. |
| **`gam_card_open_tokens` storage read on startup causes no-op setAttribute** | LOW | Remove the read + write. If left in, `card.removeAttribute('open')` on a div is a no-op — no crash. |
| **`order: 999` on `.gam-card-order-last` requires a flex parent** | MEDIUM | Wrap the cards inside each tab in a `<div class="pop-tab-body" style="display:flex;flex-direction:column">` or rely on the body's block flow. Simplest: `display:block` with `order` ignored — just use DOM reordering instead. Alternatively: add `display:flex;flex-direction:column` to the tab content wrapper. |
| **`.pop-maint { border: 1px solid var(--bb-line) !important }` double-borders** | LOW | `.pop-maint` inside `.gam-card-body` will have its own border inside the card border. This creates a double-border on the Maintenance section. Fix: add `.gam-card-body > .pop-maint { border: none !important }` to eliminate the inner border when maint is a direct child of a card body. |
| **`#diagTabSection` wrapper + `#card-diag` both getting borders** | LOW | `#diagTabSection` has no border styling. `#card-diag` as a `div.gam-card` inside it will pick up the card border correctly. No double-border risk. |
| **Emoji in card headers (`&#x1F527;` etc.) varying in rendering width** | LOW | Font metrics for emoji differ across OS. At 380px fixed width, title text will wrap or truncate at max. Keep titles short (all current titles are 1-2 words). |
| **`gam-card-urgent` animation on tokens card draws attention away from content** | VERY LOW | The pulse animation is only active during auth-failed state. It is correctly scoped to the card border rail, not the content. No risk. |

---

## H. Effort Estimate

| Task | Estimate |
|---|---|
| HTML migration (5 cards: details → div, summary → div.gam-card-header) | 30 min |
| CSS additions (new .gam-card ruleset, ~40 lines) | 20 min |
| JS cleanup (`removeAttribute('open')`, remove storage key, TAB_MAP simplification) | 30 min |
| Move `#claimInviteWrap` inside `#card-tokens` | 10 min |
| Remove `wireTabNav` special-case for `#leadSection` / `#leadOnlyTools` + test | 20 min |
| Fix `.pop-maint` double-border inside card body | 10 min |
| QA: verify all 5 tabs, lead gate, auth-fail state, wizard complete state | 30 min |
| **Total** | **~2.5 hours** |

This is a well-scoped, low-regression change. The card content is completely untouched. The tab-scoping mechanism is simplified, not replaced. The Bloomberg CSS layer is extended with explicit card rules for the first time — ending the "CSS orphan" status of `.gam-card`.

---

## I. Summary of Root Causes (for Commander)

The popup is unusable as cards because:

1. **`.gam-card` has zero CSS rules** — the browser renders `<details>` with default styling, which in Chrome is essentially invisible (no border, no background, no header bar). Every card is visually indistinguishable from its neighbor.

2. **All three Tools-tab cards have no gap between them** — they stack flush, no margin, no divider, producing a single merged wall of UI.

3. **`<details>` collapse is the wrong metaphor** — sections should be permanently open panels, not toggleable. The toggle state is unsaved and resets on popup open.

4. **Two cards have no `data-tab`** — Tokens and Lead cards are invisible to the tab system, requiring fragile JS special-casing.

The fix is: explicit `<div class="gam-card">` with explicit CSS, 8px inter-card gaps, amber left rails, and `data-tab` on every card container. ~2.5 hours of surgical changes, zero content changes, zero new JS patterns.
