# DESIGN_SHIPMASTER — v10.11 Implementation Plan
**CTO synthesis from 20-agent design ralph**
**Generated:** 2026-05-10
**Source corpus:** UIUX-01..20 audits (`docs/V10_DESIGN/UIUX-NN_*.md`)
**Status:** READ-ONLY synthesis. No code touched. Defines the dispatch plan for v10.11.0.

---

## A. Executive summary

- **Total surfaces audited:** 20
- **Total issues identified:** ~210 (P0: 38 / P1: 96 / P2: 76 — counted from each audit's effort tables)
- **Total proposed effort across all audits, raw sum:** ~152 hours
- **Realistic v10.11.0 ship surface (P0 + select P1):** ~62 hours of integration work, parallelizable across 6 disjoint-file workers into ~12 wall-clock hours
- **Already in flight (v10.10.1 hotfix):** 5 highest-leverage micro-fixes (see §J)

### Convergence patterns (the meta-findings — what 70% of complaints share)

1. **`.gam-card` is a CSS orphan rendering as plain `<details>`** — appears in UIUX-01, 04, 05, 06, 07, 08. Single highest-leverage root cause: every "cards mushed together" complaint is downstream of the fact that `.gam-card / .gam-card-head / .gam-card-body / .gam-card-title` have **zero** explicit CSS. The browser's default `<details>` rendering is invisible.

2. **Hex chaos — 155 distinct hex values, two competing color systems** (popup vs content script), with `C.ACCENT='#4A9EFF'` (blue) overwriting brand amber `#ff9933` in 27+ places — UIUX-03 root finding, echoed in UIUX-08, 09, 12, 16, 19, 20 as "inline color hardcoding."

3. **Stale broken conditionals + missing `data-drill`** — UIUX-08 found `count<2 ? '#f0a040' : '#f0a040'` (both branches identical) on Active Now. UIUX-09 found AI tile is the only stat with no `data-drill`. UIUX-13 found username rendered as `<strong>` not `<a>`. Pattern: silent functional bugs hiding inside Bloomberg styling work.

4. **Click cost dominated by navigation tax** — every popover audit (UIUX-02 SUS, UIUX-10 DR, UIUX-11 Queue) shows the most-used action requires navigating away. SUS Add-to-DR is 5 clicks; DR has no batch ops; Queue has dead "Open /queue" footer. Inline triage cuts 3-5 clicks per row.

5. **Two-phase async causes layout shift everywhere** — UIUX-08 (KPI tiles render then patch), UIUX-12 (site-health worker stats `display:none → visible`), UIUX-19 (stat tiles silently fail). The fix in every case: render with `--` placeholders + skeleton, swap textContent in-place when RPC resolves. Never `display:none → visible`.

6. **Two parallel state-handling implementations** — UIUX-19 found `renderEmptyState` (modtools.js, flag-gated) AND `gamEmptyState` (popup.js, always-on) with same intent, divergent CSS. Same pattern in UIUX-18 (motion: `--gam-dur-*` tokens defined but unused — dual reduced-motion strategies).

7. **Keyboard reachability holes on click-handler `<div>`s** — UIUX-20: 7 stat cards + 4 KPI tiles + drill drawer all click-handler-only, no `tabindex`, no `role="button"`. Tab roles missing `aria-controls` / `role="tabpanel"`.

8. **Severity signaling collapsed onto color alone** — UIUX-08 (KPI tiles all amber regardless of meaning), UIUX-16 (ticker color-only), UIUX-19 (AI error in `gam-muted` grey). Bloomberg discipline: severity = color + weight + chip; never color alone.

### Top 3 root causes that explain ~70% of "unusable" complaints

1. **`.gam-card` has zero CSS rules.** Every visual collapse on the Tools/Lead tabs is downstream of this single absence. The v10.10.1 hotfix lands the basic ruleset; the v10.11 ship master extends it across all 5 cards.
2. **`const C = {}` (modtools.js:276) is misaligned with popup.css `:root` tokens.** Brand color collides with form input color. Every "the colors look off" complaint traces here. v10.10.1 P2 lands the 35-key mirror; v10.11 propagates to call sites.
3. **Operator decisions blocked by navigation.** Every popover-audit's #1 complaint is "I can't act from here." The redesigns are 80% adding inline action buttons + lazy-loaded drill panels — not new architecture.

---

## B. Cross-audit convergence patterns

### B.1 The `.gam-card` CSS-orphan pattern
**Appears in:** UIUX-01, 04, 05, 06, 07, 08
**Root cause:** `<details class="gam-card">` with zero matching CSS rules. Browser default `<details>` rendering in Chrome is essentially invisible (no border, no background, no header bar). Three Tools-tab cards stack flush with no margin, no divider.
**Recommended fix:** ship `.gam-card` ruleset (UIUX-01 §D) with 8px inter-card gap, amber left rail, explicit header background. Apply to all 5 cards (#card-tools, #card-maint, #card-macros, #card-tokens, #card-lead).

### B.2 The hex-color chaos pattern
**Appears in:** UIUX-03 (root audit), 08, 09, 12, 16, 17, 18, 19
**Root cause:** 155 distinct hex values, ~700 occurrences, primarily in `cssText` template literals inside modtools.js. `C.ACCENT='#4A9EFF'` (blue) is the brand-color collision. 4 distinct ambers (#ff9933, #f0a040, #E8A317, rgba(245,166,35,...)).
**Recommended fix:** UIUX-03 §F's frozen `const C` object (35 keys mirror of popup.css tokens). Search-replace top-80 hex literals.

### B.3 The orphaned-children pattern
**Appears in:** UIUX-01 (lead/tokens cards have no `data-tab`), 08 (#leadKpiRow / #leadQuickActions / #lapsedModsCard outside #card-lead)
**Root cause:** Tab visibility gated by JS special-cases on inner divs rather than the card container. Caused recurring "card headers leaking into wrong tabs" hotfix history (v10.6.1, v10.6.2).
**Recommended fix:** Move all orphans inside their owning card, add `data-tab="lead|tokens"` to those card containers. Drop the `#leadSection` / `#leadOnlyTools` special-case block in `wireTabNav`.

### B.4 The two-phase RPC layout shift pattern
**Appears in:** UIUX-08, 09, 11, 12, 19
**Root cause:** RPC callback toggles `display:none → visible`, causing height jump. UIUX-12: "the box just jumps taller" on `#gam-sh-worker-stats`.
**Recommended fix:** Render placeholders + skeleton at full target height immediately. Swap textContent in-place when RPC resolves. Never `display:none → visible` for primary content.

### B.5 The stale-conditional bug pattern
**Appears in:** UIUX-08 (`count<2 ? amber : amber`), 09 (AI tile no data-drill), 13 (username `<strong>` not `<a>`), 09 (CSV export hidden in footer), 11 (`/queue` footer link wrong)
**Root cause:** Functional bugs camouflaged as design weakness. Each is 1-3 line fixes that ship alongside larger redesigns.
**Recommended fix:** All 5 ship in v10.10.1 hotfix wave (3 already in flight, 2 deferred).

### B.6 The click-cost-as-navigation pattern
**Appears in:** UIUX-02 (5 clicks → DR), 10 (no DR batch ops), 11 (queue actions exist in code but never render), 13 (Intel Drawer has no action affordances), 14 (no kbd tab nav)
**Root cause:** Action buttons exist in the JS but render in the wrong place or behind navigation. UIUX-11 is the most extreme: the entire interaction layer is wired but sits inactive because `items: []`.
**Recommended fix:** Inline action strips per row + sticky action bar in drawers. UIUX-13's "Action Strip" pattern is the reference.

### B.7 The dual-implementation pattern
**Appears in:** UIUX-18 (`--gam-dur-*` tokens defined but unused; dual reduced-motion), 19 (`renderEmptyState` modtools vs `gamEmptyState` popup), 20 (popup vs content-script motion guards)
**Root cause:** Add-it-once-then-add-another-one pattern. The popup and content-script contexts evolved independently with similar helpers.
**Recommended fix:** Canonicalize on the modtools-side helpers; alias popup helpers to them. Inject token stylesheet at content-script init so `var(--bb-*)` works across both contexts.

### B.8 The severity-color-only pattern
**Appears in:** UIUX-08 (KPI tiles all amber), 16 (ticker color-only severity), 19 (AI error grey)
**Root cause:** Color carries severity alone. WCAG 1.4.1 violation. Bloomberg discipline requires color + weight + label.
**Recommended fix:** UIUX-16's weight tier table (font-weight 400→700 by severity), UIUX-08's per-tile color thresholds, UIUX-19's hard/soft chip system.

---

## C. Priority tiers

### P0 (ship-blocking, ~28h total)
Items that materially break the operator experience. v10.11.0 must include all of these.

| ID | Source | Patch | Hours |
|---|---|---|---|
| P0-01 | UIUX-01 §D | `.gam-card` CSS ruleset — full version | 0.5 |
| P0-02 | UIUX-01 §E | HTML migration: 5 cards `<details>` → `<div>`, add `data-tab` | 0.5 |
| P0-03 | UIUX-01 §F | JS cleanup: remove `removeAttribute('open')`, drop wireTabNav special-case | 0.5 |
| P0-04 | UIUX-03 §F | `const C` 35-key frozen mirror replacing 12 misaligned values | 0.25 |
| P0-05 | UIUX-08 §C.1 | Active Now color bug: `count<2 ? amber : amber` → semantic | 0.1 |
| P0-06 | UIUX-09 §F.2 | AI tile `data-drill="ai24"` + drill branch | 0.25 |
| P0-07 | UIUX-13 §C.2 | Username `<strong>` → `<a href="/u/...">` in IntelDrawer | 0.1 |
| P0-08 | UIUX-19 §C.2 | Skeleton replaces `Loading...` text (4 diag panels + macros + lead hint) | 1.0 |
| P0-09 | UIUX-19 §C.2 | Stat tiles silent-failure → error chip + retry | 0.75 |
| P0-10 | UIUX-20 §G | Stat cards + KPI tiles add `role="button" tabindex="0" aria-label` | 0.75 |
| P0-11 | UIUX-20 §G | Tab content gets `role="tabpanel" aria-labelledby` | 1.0 |
| P0-12 | UIUX-20 §G | Drill-down drawer focus management + `role="dialog"` | 1.0 |
| P0-13 | UIUX-04 §D | Tools card: 2-col Diagnostics grid + segmented crawl row | 1.5 |
| P0-14 | UIUX-05 §B | Maintenance: split into 4 sub-cards (Status / Probes / Detection / Integrity) | 3.5 |
| P0-15 | UIUX-08 §F | Lead card: KPI strip + Quick Actions inside #card-lead, lapsed chip | 4.0 |
| P0-16 | UIUX-02 §F-J | SUS popover hybrid (DR button always visible + expand drill) | 5.0 |
| P0-17 | UIUX-10 §F | DR popover: sort + bands + live countdowns + Fire-Now confirm gate | 4.0 |
| P0-18 | UIUX-11 §H (client) | Queue popover: per-row triage + skeleton + Undo toast + footer fix | 3.5 |
| **P0 TOTAL** | | | **28h** |

### P1 (high-impact, ~21h total)
Items that create real friction but don't block. Ship in v10.11.0 if possible; otherwise v10.11.1.

| ID | Source | Patch | Hours |
|---|---|---|---|
| P1-01 | UIUX-06 §G | Macros card: 28px dense rows, hover-reveal actions, inline edit | 7.75 |
| P1-02 | UIUX-07 §H | Tokens card: 3-state machine (first-run / mod / lead) | 5.5 |
| P1-03 | UIUX-09 §H.1-H.4 | Stats tab: 4×2 grid + sparklines + delta chips (frontend only) | 5.0 |
| P1-04 | UIUX-12 §D | Site Health popover Bloomberg dashboard + KPI tiles | 4.5 |
| P1-05 | UIUX-13 §E | Intel Drawer: 4 cards + sticky action strip (Identity card + strip first) | 12.0 |
| P1-06 | UIUX-14 §D | Mod Console: number keys 1-6 tab nav + Ctrl+Enter + Escape 3-step | 4.5 |
| P1-07 | UIUX-15 §D | Gear Panel: 2-column nav + categorized panes (phase 1 only) | 8.0 |
| P1-08 | UIUX-16 §B1 | Ticker severity weight tiers (font-weight + letter-spacing) | 1.0 |
| P1-09 | UIUX-17 §B | Auth wizard: auto-attempt-then-prompt + severity reclassification | 3.5 |
| P1-10 | UIUX-18 §F | Motion tokens `--bb-motion-*` wired across popup.css | 5.5 |
| P1-11 | UIUX-19 §C.2 | Empty state factory unification (`gamMakeEmpty/Error/Skel/Stale`) | 3.0 |
| P1-12 | UIUX-20 §G P1 | Macro edit `<label for>`, `--bb-ink-faint` contrast fix, `filterSel` aria-label | 1.5 |
| **P1 TOTAL** | | | **~62h raw** |

Of the P1 list, the v10.11.0 ship master pulls **only the items that fit the disjoint-file parallel waves** — see §D below. The full P1 set is ~62h raw; v10.11.0 takes ~21h of it.

### P2 (polish, ~30h total — defer to v10.11.1+)

| ID | Source | Patch | Hours |
|---|---|---|---|
| P2-01 | UIUX-09 §H.5-H.6 | Stats sparkline backend + auto-unsticky tile | 3.5 |
| P2-02 | UIUX-11 §H (worker) | Queue D1 schema + firehose write + worker query | 3.5 |
| P2-03 | UIUX-13 §E remainder | History sub-tabs, AI decoupling, note quote-copy | 9.0 |
| P2-04 | UIUX-14 §D batch | Batch action bar (multi-select) | 8.0 |
| P2-05 | UIUX-15 §D phases 2-3 | Gear Panel TEAM pane, search, dirty state | 13.0 |
| P2-06 | UIUX-16 §B2-B6 | Ticker crossfade, siren bump, trend arrow, tooltip arrow | 7.0 |
| P2-07 | UIUX-17 §C remainder | Auth wizard step indicator + connectivity flow | 11.0 |
| P2-08 | UIUX-18 §F.5-F.10 | Motion: explicit easing sweep, gam-row-expand | 6.5 |
| P2-09 | UIUX-20 §G P3 | Arrow-key tab nav, focus restore, landmarks | 3.0 |

---

## D. v10.11.0 SHIP-MASTER (P0 + select P1)

Patches grouped by file scope so integrators run in parallel waves. Effort is integration-only (read-and-apply) — content already specified in source audits.

### D.1 INTEGRATOR-CSS (popup.css only)
Single-file owner. Pure additions to the Bloomberg layer.

1. **D.1.1 — `.gam-card` ruleset** (UIUX-01 §D, ~40 lines) — 0.25h *[v10.10.1 stub already ships; this completes it]*
2. **D.1.2 — `.gam-card-subsection` + `.gam-card-grid2` + `.gam-crawl-row` family** (UIUX-04 §D, ~80 lines) — 0.5h
3. **D.1.3 — `.pop-maint-cat-head` + `.pop-maint-action-row` + `.pop-maint-action-status`** (UIUX-05 §E, ~50 lines) — 0.5h
4. **D.1.4 — `.gam-kpi-tile` + `.gam-qa-btn` + `.gam-qa-sep` + `#lapsedModsChip` + `.gam-lead-deepdive`** (UIUX-08 §E, ~120 lines) — 1.0h
5. **D.1.5 — `.gam-empty-state` / `.gam-error-state` / `.gam-stale-chip` / `.gam-skel-stat`** (UIUX-19 §C, ~140 lines) — 0.5h
6. **D.1.6 — Stat tile sparkline + delta chip CSS skeleton** (UIUX-09 §E, ~80 lines — can ship without backend) — 0.5h
7. **D.1.7 — `--bb-ink-faint` contrast fix: bump from #5a5752 to #7a7672** (UIUX-20 §D fail row) — 0.1h
8. **D.1.8 — Tab `[hidden]` attribute support for tabpanel a11y** (UIUX-20 §F, ~5 lines) — 0.1h
9. **D.1.9 — `--bb-motion-*` token additions to `:root`** (UIUX-18 §C.1, ~20 lines, additive only — does NOT migrate callsites) — 0.25h

**INTEGRATOR-CSS total: ~3.65h**, ~535 added lines. Zero risk to existing rules.

### D.2 INTEGRATOR-POPUP-HTML (popup.html only)
Single-file owner. Structural HTML migration.

1. **D.2.1 — Cards `<details>` → `<div>` + add `data-tab`** (UIUX-01 §E, 5 cards) — 0.5h
2. **D.2.2 — Tools card: 2-col Diagnostics + segmented crawl** (UIUX-04 §E.1) — 0.25h
3. **D.2.3 — Maintenance: replace `#card-maint` with 4 sub-cards** (UIUX-05 §F) — 1.0h *[preserves all 13 element IDs — zero JS work]*
4. **D.2.4 — Lead card: move `#leadKpiRow`/`#leadQuickActions` inside, add `#lapsedModsChip`** (UIUX-08 §F) — 0.5h
5. **D.2.5 — Tab content wrappers get `role="tabpanel"` + `aria-labelledby` + `hidden`** (UIUX-20 §F) — 0.25h
6. **D.2.6 — Stat cards add `role="button" tabindex="0" aria-label`; KPI tiles same** (UIUX-20 §G P0) — 0.25h
7. **D.2.7 — Drill-drawer toolbar (filter + sort + export inline)** (UIUX-09 §F.3) — 0.25h
8. **D.2.8 — Macro edit `<label for>` pairs** (UIUX-20 §G P1) — 0.1h
9. **D.2.9 — Inline color cleanup: `#aaa`, `#888`, `#5c6370` → `var(--bb-ink-dim)`** (UIUX-20 §D) — 0.1h

**INTEGRATOR-POPUP-HTML total: ~3.2h**. Critical: D.2.3 must verify all `card-badge-maint` JS call sites still work — see §I.1.

### D.3 INTEGRATOR-POPUP-JS (popup.js only)
Single-file owner. JS wiring for HTML and CSS changes above.

1. **D.3.1 — `wireTabNav`: drop `#leadSection`/`#leadOnlyTools` special-case** (UIUX-01 §F.2) — 0.25h
2. **D.3.2 — Remove `removeAttribute('open')` calls (no-ops on div)** (UIUX-01 §F.3-F.4) — 0.25h
3. **D.3.3 — Active Now color bug fix** (UIUX-08 §C.1, 3 lines) — 0.1h
4. **D.3.4 — Hook CLR-RATE + MM p50 to `/mod/stats`** (UIUX-08 §C.2, ~20 lines) — 0.5h
5. **D.3.5 — KPI delta tracking via sessionStorage** (UIUX-08 §C.4) — 0.25h
6. **D.3.6 — Lapsed chip wiring (replace `#lapsedModsCard` show/hide)** (UIUX-08 §G.9) — 0.25h
7. **D.3.7 — `qaMaintBtn` opens deep-dive accordion + scroll** (UIUX-08 §G.10) — 0.25h
8. **D.3.8 — Drill drawer: focus mgmt + `role="dialog"` + filter/sort/csv toolbar wiring** (UIUX-09 §F.4 + UIUX-20 §G) — 0.75h
9. **D.3.9 — Stat cards: keyboard handler (Enter/Space activates)** (UIUX-20 §G P0) — 0.25h
10. **D.3.10 — Tab content `[hidden]` toggle wiring (replaces display:none for a11y)** (UIUX-20 §F) — 0.25h
11. **D.3.11 — `gamMakeSkel/Empty/Error/Stale` factory functions** (UIUX-19 §C.1) — 1.0h
12. **D.3.12 — Wire stat tiles + diag panels to skeleton + error states** (UIUX-19 §C.2) — 1.0h
13. **D.3.13 — Macros count badge populate** (UIUX-04 §F header wiring) — 0.1h

**INTEGRATOR-POPUP-JS total: ~5.0h**. D.3.11 is shared infra — completes before D.3.12.

### D.4 INTEGRATOR-MOD (modtools.js — the 25k LOC monster)
Subdivided into 4 sub-tracks. These can run in parallel because they touch different functions.

#### D.4.a — Visual layer (color tokens + cssText cleanup)
1. **D.4.a.1 — Replace `const C` (line 276) with frozen 35-key mirror** (UIUX-03 §F) — 0.25h *[v10.10.1 already lands stub; this is the full version]*
2. **D.4.a.2 — Audit `C.ACCENT` call sites: classify each as brand-amber vs form-blue** (UIUX-03 §G.2, ~27 occurrences) — 1.0h
3. **D.4.a.3 — Inject `--bb-*` token stylesheet at content-script init** (UIUX-03 §H.1 H.2) — 0.5h
4. **D.4.a.4 — Bloomberg state CSS injection block (`.gam-empty-state` / `.gam-error-state` / `.gam-skel-*`)** (UIUX-19 §C) — 0.5h
5. **D.4.a.5 — Username `<strong>` → `<a href="/u/...">` in IntelDrawer sec1** (UIUX-13 §C.2) — 0.1h *[v10.10.1 lands the patch]*
6. **D.4.a.6 — Ticker severity weight tiers** (UIUX-16 §B1, ~12 lines JS) — 0.5h

**D.4.a sub-total: ~2.85h**

#### D.4.b — Card / popover refactors
1. **D.4.b.1 — SUS popover: hybrid layout (DR-always-visible + expand drill)** (UIUX-02 §F-J) — 5.0h
2. **D.4.b.2 — DR popover: sort + bands + live countdowns + Fire-Now confirm + Cancel All** (UIUX-10 §F priority 1-4) — 3.5h
3. **D.4.b.3 — Queue popover: per-row triage + skeleton + Undo toast + footer fix** (UIUX-11 §H client-side) — 3.5h
4. **D.4.b.4 — Site Health popover Bloomberg dashboard** (UIUX-12 §D phase 1: 3h) — 3.0h

**D.4.b sub-total: ~15.0h** — largest single block. SUS + DR + Queue can ship as independent diffs.

#### D.4.c — State management (empty/loading/error)
1. **D.4.c.1 — SUS popover empty state: `gamMakeEmpty({icon:'sus-empty'})`** (UIUX-19 §C.2) — 0.25h
2. **D.4.c.2 — AI NBA error: `gamMakeError({severity:'soft'})` replacing grey muted text** (UIUX-19 §C.2) — 0.25h
3. **D.4.c.3 — Retire `renderSkeleton` / `renderEmptyState` — alias to new factories** (UIUX-19 §D) — 0.5h
4. **D.4.c.4 — Add `prefers-reduced-motion` block to GAM_CSS** (UIUX-18 §D.2) — 0.5h

**D.4.c sub-total: ~1.5h**

#### D.4.d — Accessibility sweep (cross-cutting in modtools.js)
1. **D.4.d.1 — Brigade pulse: JS-gate animation on `prefers-reduced-motion`** (UIUX-20 §E) — 0.25h
2. **D.4.d.2 — `filterSel` add `aria-label="Upvote age filter"`** (UIUX-20 §G) — 0.05h
3. **D.4.d.3 — `gam-bar-tier-badge` add `aria-hidden="true"`** (UIUX-20 §G) — 0.05h

**D.4.d sub-total: ~0.35h**

**D.4 INTEGRATOR-MOD total: ~19.7h** (across 4 sub-tracks).

### D.5 INTEGRATOR-WORKER (gaw-mod-proxy-v2.js)
Worker-side dependencies flagged by audits. Independent of frontend — can ship before, after, or alongside.

1. **D.5.1 — `gaw_queue` D1 migration + firehose write + query** (UIUX-11 §C, ~3.5h) — 3.5h
2. **D.5.2 — `/mod/stats` adds `spark` + `yesterday` + `unsticky24` fields** (UIUX-09 §G) — 2.0h
3. **D.5.3 — `/mod/stats recent_actions[].executor` field (if missing)** (UIUX-12 dependency) — 0.5h
4. **D.5.4 — Action endpoints update `gaw_queue.status` on approve/remove** (UIUX-11 §C) — 1.0h

**INTEGRATOR-WORKER total: ~7h**. Items D.5.1, D.5.2 are P2 (deferred for v10.11.1) but listed here for visibility. D.5.3 is small enough to bundle into v10.11.0 if executor field is missing.

### D.6 INTEGRATOR-A11Y (cross-cutting sweep — multi-file)
This is a single multi-file sweep that touches popup.html (~64 LOC), popup.js (~39 LOC), popup.css (~2 LOC), modtools.js (~26 LOC). Already enumerated in D.1, D.2, D.3, D.4.d above. Listed here for visibility:

- Stat cards + KPI tiles role/tabindex/aria-label (D.2.6)
- Tab panel role + aria-labelledby + hidden (D.2.5 + D.3.10)
- Drill drawer focus management (D.3.8)
- `--bb-ink-faint` contrast fix (D.1.7)
- Inline color → `var(--bb-ink-dim)` (D.2.9)
- Macro edit `<label for>` (D.2.8)
- Brigade pulse PRM gate (D.4.d.1)
- `filterSel` aria-label, `gam-bar-tier-badge` aria-hidden (D.4.d.2 D.4.d.3)

**A11y total: ~3.65h** — embedded in §D.1-D.4 above; no separate dispatch needed.

---

## E. v10.11.1+ DEFERRED (the long tail of P1/P2)

The full P1 list above is ~62h raw. v10.11.0 cherry-picks ~21h. The remainder ships as v10.11.1 / v10.11.2:

### v10.11.1 (proposed, ~30h)
- P1-01 Macros card refactor (7.75h) — UIUX-06
- P1-02 Tokens card 3-state machine (5.5h) — UIUX-07
- P1-05 Intel Drawer cards + Action Strip (12h, identity card + strip phase only) — UIUX-13
- P1-09 Auth wizard auto-attempt + severity reclass (3.5h) — UIUX-17
- P1-12 Macro `<label for>`, contrast token fix, `filterSel` aria-label (1.5h) — UIUX-20

### v10.11.2 (proposed, ~25h)
- P1-06 Mod Console kbd 1-6 + Ctrl+Enter + Escape 3-step (4.5h) — UIUX-14
- P1-07 Gear Panel 2-col phase 1 (8h) — UIUX-15
- P1-10 Motion tokens callsite migration (5.5h) — UIUX-18
- P1-11 Empty state factory unification (3h) — UIUX-19
- D.5.1 + D.5.2 worker sparkline backend (5.5h) — UIUX-09 / 11

### v10.11.3+ (P2 long tail, ~50h spread over multiple ships)
Per §C P2 table.

---

## F. Conflicts + resolutions

Where audits proposed different solutions for the same surface or token:

### F.1 — Card fragmentation strategy: 4 cards vs 1
**UIUX-04** treats Maintenance as one card with sub-sections (`.gam-card-subsection`).
**UIUX-05** explicitly directs splitting into 4 separate `<details class="gam-card">` cards (Status / Probes / Detection / Integrity).
**CTO ruling: UIUX-05 wins.** Commander's directive — "each section is its own SEPARATE AND INDIVIDUAL CARD" — is binding. UIUX-04's sub-section pattern is correct for Tools card (Diagnostics + Data Harvest are clearly two sub-sections of one tool surface) but Maintenance has 13 controls spanning 4 distinct intents.

### F.2 — Lead card structure: keep details vs migrate
**UIUX-01** wants all 5 cards migrated `<details>` → `<div>` (permanent panels).
**UIUX-08** preserves `<details class="gam-card" id="card-lead">` and adds an inner `<details class="gam-lead-deepdive">` for sub-panels.
**CTO ruling: UIUX-01 wins on the outer card; UIUX-08 wins on the deep-dive inner.** Outer cards are permanent; nested settings/diagnostics retain `<details>` for collapse.

### F.3 — Stats grid 4-col vs adding 8th tile
**UIUX-09** proposes 4×2 grid + new Auto-Unsticky 8th tile.
**v10.10.1 hotfix** lands AI tile `data-drill="ai24"` only.
**CTO ruling: ship UIUX-09's 4-col grid in v10.11.0 (CSS+HTML only, frontend independent). Add 8th tile as P2** when `unsticky24` log write lands in modtools.js. The 4-col grid alone is a clean win.

### F.4 — Token blue: scope vs eliminate
**UIUX-03** explicitly retains `--bb-blue` `#4A9EFF` scoped to form inputs only.
**UIUX-08** uses `--bb-amber` for the Lead card accent and treats blue as wrong everywhere.
**CTO ruling: UIUX-03 wins.** Blue is a form/interactive scope token, not brand. Lead card accent is amber (or purple per UIUX-01 §B4 if we want hierarchical authority signal — purple over amber for Lead vs Mod). **Purple = lead card** per UIUX-01 §C.3 mockup.

### F.5 — `--bb-r` (border-radius) default
**UIUX-03** declares `--bb-r: 0` (Bloomberg sharp) and adds named sub-tokens (`--bb-r-sm: 3px`, `--bb-r-md: 4px`).
**Multiple audits** use `border-radius: 3-8px` inline.
**CTO ruling: UIUX-03 wins.** Migration replaces hardcoded radii with named sub-tokens; the `--bb-r: 0` default stays for greenfield surfaces. **Do NOT replace existing `border-radius: 4px` with `var(--bb-r)` (= 0)** — that would visually regress.

### F.6 — UIUX-09 sparklines: ship without backend
**UIUX-09 §H.8 sequencing** says CSS+HTML first (zero data dependency), then JS helpers, then worker.
**CTO ruling: confirmed.** Frontend ships in v10.11.0 with skeleton sparklines. Worker spark fields land in v10.11.1.

### F.7 — Auth banner severity: red always vs reclassify
**UIUX-17** reclassifies `no_token` → amber (setup, not error), `fetch_failed` → yellow (connectivity).
**Existing `__showAuthFailBanner`** uses red `rgba(220,40,40,.95)` for everything.
**CTO ruling: UIUX-17 wins.** False-alarm red on first-run is the most-cited new-mod onboarding friction. Severity colors ship in v10.11.1 alongside auto-attempt-then-prompt.

### F.8 — Sparkline next to ticker
**UIUX-16 §B4** explicitly recommends SKIPPING the sparkline (negative ROI given popover architecture).
**Some other audits implicitly assume sparklines everywhere.**
**CTO ruling: UIUX-16 wins.** Trend arrow only (`▲ ▼ =`), no sparkline next to ticker. Sparklines stay scoped to the Stats grid only.

---

## G. Implementation order (by dependency)

```
WAVE 1 (parallel, independent files, no JS dependencies):
  ├─ INTEGRATOR-CSS (popup.css)              → ~3.65h
  ├─ INTEGRATOR-WORKER (D.5.3 only)          → ~0.5h
  └─ Block 1 complete (~3.65h wall-clock if parallel; ~4.15h if serial)

WAVE 2 (depends on Wave 1 CSS landing):
  ├─ INTEGRATOR-POPUP-HTML (popup.html)      → ~3.2h
  ├─ INTEGRATOR-MOD-VISUAL (D.4.a)           → ~2.85h
  └─ Block 2 complete (~3.2h wall-clock if parallel)

WAVE 3 (depends on Wave 2 HTML+visual landing):
  ├─ INTEGRATOR-POPUP-JS (popup.js)          → ~5.0h
  ├─ INTEGRATOR-MOD-CARDS (D.4.b)            → ~15.0h (longest critical path)
  ├─ INTEGRATOR-MOD-STATE (D.4.c)            → ~1.5h
  ├─ INTEGRATOR-MOD-A11Y (D.4.d)             → ~0.35h
  └─ Block 3 complete (~15h wall-clock — D.4.b dominates)

WAVE 4 (verification + final smoke):
  ├─ Cross-tab QA (5 tabs × 2 tiers × auth states)
  ├─ Drill drawer focus restore validation
  ├─ Reduced-motion mode validation
  └─ Wave 4 complete (~2h)

TOTAL CRITICAL PATH: ~24h wall-clock
TOTAL EFFORT (including all parallel work): ~62h
PARALLELIZATION FACTOR: ~2.6x
```

**Critical path bottleneck:** D.4.b (popover refactors in modtools.js). If the orchestrator can split D.4.b.1 (SUS), D.4.b.2 (DR), D.4.b.3 (Queue), D.4.b.4 (Site Health) into 4 sub-agents each owning one popover function, the wall-clock drops to ~5h for the popover wave.

**Recommended sub-split for D.4.b:**
- INTEGRATOR-SUS-POPOVER (5.0h owner)
- INTEGRATOR-DR-POPOVER (3.5h owner)
- INTEGRATOR-QUEUE-POPOVER (3.5h owner)
- INTEGRATOR-HEALTH-POPOVER (3.0h owner)

These 4 functions (`_showSusPopover`, `_showDrPopover`, `_showQueuePopover`, `_showSiteHealthPopover`) are at distinct line ranges in modtools.js. Disjoint, no merge conflicts.

---

## H. v10.11.0 dispatch plan

Specific agent prompts the orchestrator can use. Each prompt is self-contained — agent has zero conversation context.

### H.1 — INTEGRATOR-CSS

```
You are INTEGRATOR-CSS for v10.11.0. Single file: D:\AI\_PROJECTS\modtools-ext\popup.css.

Apply these patches in order. Each CITES the source audit:

1. UIUX-01 §D — Add `.gam-card / .gam-card-header / .gam-card-title / .gam-card-badge / .gam-card-body / .gam-card-urgent` ruleset (~40 lines). Insert immediately after the `.pop-maint-advanced` block (~line 1336).

2. UIUX-04 §D — Add `.gam-card-subsection / .gam-card-sub-label / .gam-card-grid2 / .gam-crawl-row / .gam-crawl-group / .gam-crawl-pill / .gam-card-head-toggle` ruleset (~80 lines). Append after the UIUX-01 block.

3. UIUX-05 §E — Add `.pop-maint-cat-head / .pop-maint-action-row / .pop-maint-action-status / #maintReset` styling (~50 lines). Append.

4. UIUX-08 §E — Add `#leadKpiRow + .gam-kpi-tile + .gam-kpi-label + .gam-kpi-val + .gam-kpi-delta + #leadQuickActions + .gam-qa-btn + .gam-qa-sep + .gam-qa-badge + #lapsedModsChip + #lapsedModsPanel + .gam-lead-deepdive + .gam-lead-sub` (~120 lines). Append.

5. UIUX-19 §C — Add `.gam-skel-wrap + .gam-skel-line + .gam-skel-row + .gam-skel-card + .gam-skel-avatar + .gam-skel-stat + @keyframes gam-skel-pulse + .gam-empty-state + .gam-empty-icon + .gam-empty-headline + .gam-empty-desc + .gam-empty-cta + .gam-error-state + .gam-error-chip.hard + .gam-error-chip.soft + .gam-error-msg + .gam-error-hint + .gam-error-retry + .gam-stale-chip + .gam-stale-refresh` (~140 lines). Append.

6. UIUX-09 §E — Add `.pop-stat-head + .pop-stat-delta + .pop-stat-spark + .pop-stat-spark-bar + .pop-drill-toolbar + .pop-drill-filter + .pop-drill-sort + .pop-drill-export + .pop-drill-count + .pop-drill-esc-hint` rules (~80 lines). Append.

7. UIUX-09 §E.2 — Update `.pop-stats { grid-template-columns: repeat(4, 1fr) !important }` (was 3-col). Update nth-child border rules: `.pop-stat:nth-child(3n) { border-right: 1px solid var(--bb-line) !important }` (undo old), `.pop-stat:nth-child(4n) { border-right: none !important }`, `.pop-stat:nth-last-child(-n+4) { border-bottom: none !important }`.

8. UIUX-20 §D — In the `:root` block, change `--bb-ink-faint: #5a5752` to `--bb-ink-faint: #7a7672` (was 2.75:1 contrast; now 4.6:1 AA pass).

9. UIUX-18 §C.1 — Add `--bb-motion-instant: 50ms / --bb-motion-fast: 120ms / --bb-motion-base: 200ms / --bb-motion-slow: 400ms / --bb-ease-decel / --bb-ease-accel / --bb-ease-standard / --bb-ease-spring / --bb-ease-linear` to `:root`. ADDITIVE ONLY — do NOT migrate existing `transition:` rules. That's a v10.11.2 task.

CONSTRAINTS:
- Do NOT remove any existing CSS rules.
- Do NOT migrate hardcoded hex values to tokens (call sites in modtools.js depend on hex literals).
- Preserve all `!important` chains exactly.

VERIFICATION: After patching, the file should be larger by ~535 lines. No existing rules deleted.

Report back: total LOC added, file final line count, any anomalies.
```

### H.2 — INTEGRATOR-POPUP-HTML

```
You are INTEGRATOR-POPUP-HTML for v10.11.0. Single file: D:\AI\_PROJECTS\modtools-ext\popup.html.

PRECONDITION: H.1 (INTEGRATOR-CSS) must complete first.

Apply these patches:

1. UIUX-01 §E — Migrate 5 cards from <details class="gam-card" open> to <div class="gam-card">:
   #card-tools (data-tab="tools"), #card-maint (NB: replaced wholesale in step 3), #card-macros (data-tab="tools"), #card-tokens (ADD data-tab="tokens"), #card-lead (ADD data-tab="lead"). Replace <summary class="gam-card-head"> with <div class="gam-card-header">. Remove <span class="gam-card-chevron">. Remove `open` attribute. Preserve all child element IDs.

2. UIUX-04 §E.1 — Replace #card-tools body with the 2-col Diagnostics grid + segmented crawl row. Preserve element IDs (debugBtn, dashBtn, all crawl-btn data-section/data-pages combos, crawlStatus, crawlStatusLabel).

3. UIUX-05 §F — Replace single #card-maint with FOUR cards: #card-maint-status (Safe Mode + Feature Health + maintWarningBanner), #card-maint-probes (maintToken, maintStorage, maintSelectorDrift, maintDiag), #card-maint-detect (maintTardSuggest, maintStickyScan), #card-maint-integrity (maintCookies, maintModmailBackfill, maintSchema, maintRepair, maintReset). All 4 cards data-tab="tools". Preserve all 13 button IDs verbatim.

4. UIUX-08 §F — Inside #card-lead body: move #leadKpiRow inside (was outside), move #leadQuickActions inside (was outside). Add #lapsedModsChip + #lapsedModsPanel replacing always-rendered #lapsedModsCard. Replace #leadSettingsAccordion with #gam-lead-deepdive containing 5 sub <details>: rotation, bugs, maintreports, diag, settings. Preserve every single element ID listed in UIUX-08 §G.

5. UIUX-09 §F — Update each .pop-stat tile to include `.pop-stat-head` (label + delta span) + `.pop-stat-val` (existing) + `.pop-stat-spark` (7 bars). 8 tiles total, including new `data-drill="ai24"` on AI tile. New 8th tile #s-unsticky placeholder is acceptable but optional in v10.11.0 — if including, mark with comment "// data source: v10.11.1+ unsticky24 RPC".

6. UIUX-09 §F.3 — Drill drawer #pop-drill: add `.pop-drill-toolbar` row with #pop-drill-filter (input) + #pop-drill-sort (select) + #pop-drill-csv (button). Add `.pop-drill-count` span in header. Move CSV button OUT of footer.

7. UIUX-20 §G P0 — Each .pop-stat tile: add `role="button" tabindex="0" aria-label="{label}: {val}"`. Each .gam-kpi-tile: add same pattern.

8. UIUX-20 §F — Wrap tab content in `role="tabpanel" aria-labelledby="tab-{name}" data-tab="{name}"` divs. Tab buttons get matching `id="tab-{name}"`. Use `hidden` attr instead of CSS display:none for inactive panels.

9. UIUX-20 §G P1 — Add explicit `<label for="macroEditLabel">LABEL</label>` + `<label for="macroEditBody">BODY</label>` (currently using placeholder only).

10. UIUX-20 §D — Replace inline `color:#aaa`, `color:#888`, `color:#5c6370` with `color:var(--bb-ink-dim)` (5 instances total per UIUX-20 §D table).

CONSTRAINTS:
- Preserve every element ID exactly. Do NOT rename any existing IDs.
- Preserve `data-tab` attributes that already exist; only ADD new ones for tokens + lead.
- The card-badge-maint single ID becomes 4 separate IDs (card-badge-maint-status, card-badge-maint-probes, card-badge-maint-detect, card-badge-maint-integrity) per UIUX-05 §F. Note this for INTEGRATOR-POPUP-JS to handle in its badge writes.

VERIFICATION: Open the file, confirm 5 cards exist (Tools, Maint-Status, Maint-Probes, Maint-Detect, Maint-Integrity, Macros, Tokens, Lead — actually 8 with the maint split), every tab has matching tabpanel, every stat tile is keyboard-reachable.

Report back: total cards count, all preserved IDs verified, any structural anomalies.
```

### H.3 — INTEGRATOR-POPUP-JS

```
You are INTEGRATOR-POPUP-JS for v10.11.0. Single file: D:\AI\_PROJECTS\modtools-ext\popup.js.

PRECONDITION: H.2 (INTEGRATOR-POPUP-HTML) must complete first.

Apply these patches:

1. UIUX-01 §F.2 — In `wireTabNav()`: REMOVE the special-case block for `#leadSection` and `#leadOnlyTools` visibility. The new <div class="gam-card" data-tab="lead"> handles this automatically via the standard data-tab gate. Verify by toggling all 5 tabs after change — lead card should hide/show correctly.

2. UIUX-01 §F.3 — Remove all `card.removeAttribute('open')` and `card.setAttribute('open', '')` calls. They're no-ops on <div>. Specifically: search popup.js for these strings and delete them.

3. UIUX-01 §F.4 — Remove the `gam_card_open_tokens` chrome.storage write/read. The card is always visible now.

4. UIUX-04 §F — Wire #crawlStatusLabel span text to last-crawl timestamp from existing crawlStatus logic. ~5 lines.

5. UIUX-04 §F — Wire #card-badge-macros to live macro count on macros load. ~5 lines.

6. UIUX-05 §F — Update `card-badge-maint` JS call sites: re-map writes to the 4 new badge IDs per the mapping in UIUX-05 §F. (Warning/health → -status; token age → -probes; AI budget → -detect; settings corruption → -integrity.) Search-replace.

7. UIUX-08 §C.1 — Fix Active Now color bug at popup.js:5324 (or wherever __loadLeadKpi sets el.style.color). Current: `count === 0 ? '#f04040' : count < 2 ? '#f0a040' : '#f0a040'` (broken — both branches identical). Replace with the corrected semantic logic from UIUX-08 §C.1 (uses CSS color tokens).

8. UIUX-08 §C.2 — In `__loadLeadKpi`: add ~20 lines hooking CLR-RATE and MM p50 to `popupRpc('modStats', {})` response fields `queue_clear_rate_24h` and `modmail_p50_hours`. If null, render `--` with faint color. Add the helper `setKpiTile(tileId, value, color)` per the spec.

9. UIUX-08 §C.4 — Add `updateKpiDelta(tileId, newVal)` helper using sessionStorage. Wire to all 4 KPI tile renders.

10. UIUX-08 §G.9 — Wire #lapsedModsChip + #lapsedModsPanel: chip displays only when lapsed_count > 0; clicking #lapsedExpandBtn toggles panel visibility. #lapsedPingAllBtn calls existing handler.

11. UIUX-08 §G.10 — Wire #qaMaintBtn click → opens #gam-lead-deepdive accordion + scrolls to #lead-sub-diag sub-panel. ~10 lines. Remove #qaBugsBadge sync from #bugListBadge — single badge now (use #bugListBadge or rename).

12. UIUX-08 §G.12 — Update `TAB_MAP.lead` (currently `[]`): add `'#gam-lead-deepdive'`, `'#lapsedModsChip'`, `'#lapsedModsPanel'`. Single line.

13. UIUX-09 §F.4 — Add helpers `renderSparkline(spark-id, data7, colorVar)` and `renderDelta(d-id, today, yesterday)`. Wire into existing `loadStats()`. New AI tile drill branch in `renderDrillDown()` for `data-drill="ai24"`.

14. UIUX-09 §F.4 — Drill drawer: wire #pop-drill-filter live `input` event to filter `.pop-drill-row` elements by row text match. Wire #pop-drill-sort `change` to re-sort visible rows. Wire #pop-drill-count to display row count badge. Move CSV export click handler from old footer location to #pop-drill-csv.

15. UIUX-09 §F.4 — Drill drawer focus management: on open, capture `prevFocus = document.activeElement`, set `aria-modal="true" role="dialog"` on #pop-drill, focus the close button. On close, `prevFocus?.focus()`.

16. UIUX-19 §C.1 — Add factory functions to popup.js (NEW, copy from UIUX-19 §C.1): `gamMakeSkel(variant)`, `gamMakeEmpty(opts)`, `gamMakeError(opts)`, `gamMakeStale(label, refreshFn)`. Plus the GAM_EMPTY_SVG icon map (sus-empty + queue-empty new SVGs from UIUX-19 §B.2).

17. UIUX-19 §C.2 — Wire stat tiles: on popup open, set each `#s-*` element to `gamMakeSkel('stat')`. On loadStats() success, replace skeleton with value. On loadStats() failure, render `gamMakeError({severity:'hard', label:'STATS', msg:'Worker unreachable', hint:'Check CF dashboard.', retryFn: loadStats})` ABOVE the tiles.

18. UIUX-19 §C.2 — Wire diag panels (#diagSysIdentity, #diagSwHealth, #diagRpcLog, #diagStorage): replace `Loading...` initial text with `gamMakeSkel('paragraph')`. Replace on RPC populate.

19. UIUX-19 §C.2 — Wire `#srLeadEmptyHint` and `#macrosList` initial state to skeleton.

20. UIUX-19 §C.2 — `__showPopupRestartNotice`: replace hardcoded inline-style div with structured `gam-error-state` + `gam-error-chip.hard` + close button `window.close()`.

21. UIUX-20 §G P0 — Stat cards + KPI tiles: add keydown handler — Enter/Space activates the click handler (because they're now tabindex="0" role="button").

22. UIUX-20 §F — Tab content visibility: replace direct `display:none` toggling with `panel.hidden = !active` (boolean attr). Active panel: `panel.hidden = false`.

CONSTRAINTS:
- Do NOT introduce new RPC calls in v10.11.0.
- Preserve all existing function names and arities.
- The new factories (gamMake*) must work both on data-loaded paths and on first-render paths.

VERIFICATION: Open popup, verify (a) all 5 tabs render correctly, (b) lead card appears only on Lead tab, (c) stat tiles show skeleton on first paint then values, (d) drill drawer can be opened + filtered + closed via Esc with focus restore.

Report back: total LOC changed, factory functions added, any wiring anomalies.
```

### H.4 — INTEGRATOR-MOD-VISUAL (D.4.a)

```
You are INTEGRATOR-MOD-VISUAL for v10.11.0. Single file: D:\AI\_PROJECTS\modtools-ext\modtools.js (25k LOC). Touch ONLY visual layer functions.

Apply these patches:

1. UIUX-03 §F — Replace the `const C = {...}` object at line 276 with the frozen 35-key mirror from UIUX-03 §F. CRITICAL: keep all existing key names that are referenced elsewhere (RED, GREEN, ACCENT, TEXT, BG, etc. — all preserved). ADD new keys (AMBER, AMBER_WARM, AMBER_COOL, CS_INK, CS_BG, etc.). Wrap in `Object.freeze()`.

2. UIUX-03 §G.2 — Audit `C.ACCENT` call sites. Run search for `C\.ACCENT` (~27 occurrences). For each, classify:
   - Brand context (chip color, header accent, KPI value) → replace with `C.AMBER`
   - Form input context (border on inputs, selects, focus rings on form fields) → keep as `C.BLUE` (renamed from ACCENT)
   - Use grep + manual review per occurrence.
   - Document each in commit message.

3. UIUX-03 §H.1-H.2 — Inject token stylesheet at content-script init. Add a function `__injectTokenStylesheet()` that mounts a `<style>` element to `document.documentElement` containing the `:root { --bb-amber: #ff9933; --bb-line: ... }` block (mirror of popup.css). Call from boot. ~20 lines.

4. UIUX-19 §C — Add Bloomberg state CSS injection block (`__v81InjectStateCss` or sibling). Inject the same .gam-empty-state / .gam-error-state / .gam-skel-* rules from UIUX-19 §C as a <style> block at content-script init. ~140 lines of CSS.

5. UIUX-13 §C.2 — In `buildUserSections` (search for "el('strong', null, String(id))" inside sec1), change to `el('a', {href: '/u/' + id, target: '_blank', rel: 'noopener'}, String(id))` wrapped in <strong> if the existing styling needs preservation. ~3 lines. *[NOTE: v10.10.1 hotfix may already land this. Verify before patching.]*

6. UIUX-16 §B1 — Ticker severity weight tiers. In `__updateTicker()`: add `weight` and `letterSpacing` fields to each state object based on the `kind` (per UIUX-16 §B1 table). Apply via `tickerEl.style.fontWeight = state.weight` and `tickerEl.style.letterSpacing = state.letterSpacing`. Also fix the hardcoded `#ff3b3b` for OPDEL → `var(--bb-red)` (or `C.RED` since it's content-script). ~12 lines.

CONSTRAINTS:
- Do NOT touch popover renderers (D.4.b is a separate agent).
- Do NOT touch state-management helpers (D.4.c is separate).
- C.ACCENT call site classification is the most error-prone step. When uncertain, default to C.AMBER (more likely correct).

VERIFICATION: Open the GAW page in browser, verify (a) brand color amber on chips/KPIs (was blue), (b) form inputs still look correct (still blue accent), (c) IntelDrawer username clickable, (d) ticker severity differs by weight.

Report back: total C.ACCENT classifications (N→AMBER, M→BLUE), token stylesheet injection successful, any visual regressions noted.
```

### H.5 — INTEGRATOR-SUS-POPOVER (D.4.b.1)

```
You are INTEGRATOR-SUS-POPOVER for v10.11.0. Single file: D:\AI\_PROJECTS\modtools-ext\modtools.js. Touch ONLY `_showSusPopover()` (~L16854-17046).

Apply UIUX-02 §F-J in full:

1. Refactor row builder to hybrid layout: collapsed row has `[DR]` + `[⋯]` + `▶` (expand chevron) always visible. ~80 lines.

2. Add `_loadDrillContent(username, drillEl, rowData)` lazy-loader for expand panel. Reuses `rpcCall('modUserCadence', {username})` for last 3 posts. ~120 lines. Cache via `inner.dataset.loaded = '1'` to prevent re-fetch.

3. Add tard suspect section renderer pulling from `chrome.storage.session.get(['gam_tard_suggestions'])`. Render below SUS rows with purple "AI SUSPECTS" divider per UIUX-02 §F. ~60 lines.

4. DR button inline wiring: click → `addToDeathRow(username, 72*3600*1000, reason, {fromUserAction:true})` + state sync (button morphs to "💀 DR queued" on success). Pre-check `getDeathRow()` on row render to disable button if already on DR. ~30 lines.

5. Note inline form (REPLACE the broken `noteBtn` at L16993-16996 that opens /u/ — DELETE that line). Inline note panel inside expand drill: textarea + Save → `rpcCall('modProfilesWritePatch', {username, patch:{notes: text}})`. ~40 lines.

6. CSS additions (append to GAM_CSS string): `.gam-sus-drill / .gam-sus-chevron / .gam-sus-dr-btn / .gam-sus-tard-divider / .gam-sus-tard-row / .gam-sus-drill-inner / .gam-sus-note-input / #gam-sus-popover {min-width:380px; max-width:500px}` (~60 lines).

7. Empty state (UIUX-19 §C.2): when SUS count === 0, render `gamMakeEmpty({icon:'sus-empty', headline:'Queue is clean', desc:'No users currently flagged as suspicious.'})` instead of raw inline-style div. ~5 lines net.

8. Footer cleanup: remove redundant "Click 🚩 username to open profile" instruction text. ~3 lines.

9. Widen popover: `max-width: 420px` → `max-width: 500px`. 1 line.

CONSTRAINTS:
- Helper functions reused (do not reimplement): addToDeathRow, withUndo, snack, rpcCall('modSusClear'), rpcCall('modProfilesWritePatch'), rpcCall('modUserCadence'), _susApplyDecorations, escapeHtml.
- Tard rows: pattern matches are NOT specific users. Display them as `🤖 PATTERN` rows with `[Add as DR rule]` action, NOT `[DR]` for a specific user. Per UIUX-02 §I "Tard suspect rows".

VERIFICATION: Open SUS popover, verify (a) DR is one click from collapsed row, (b) row expands inline showing recent posts, (c) tard section appears below SUS rows when cache is warm, (d) note save works inline, (e) Esc closes, (f) empty state shows when count=0.

Report back: ~400 lines net change, all rpcCall reuses confirmed, any helpers missing.
```

### H.6 — INTEGRATOR-DR-POPOVER (D.4.b.2)

```
You are INTEGRATOR-DR-POPOVER for v10.11.0. Single file: modtools.js. Touch ONLY `_showDrPopover()` (~L17282-17461).

Apply UIUX-10 §F priority 1-4 (defer 5-7 to v10.11.1):

1. Sort `drList` by `executeAt` ascending (1 line — highest ROI, ship first). ~1 line.

2. Live countdown timers: `setInterval` 1s tick updating each row's "FIRES IN" element via `el.textContent = formattedCountdown(executeAt)`. Store interval id on `pop._timerInterval`, clear on close. Format logic per UIUX-10 §B.3 (urgency tiers: critical/imminent/today/deferred). ~60 lines.

3. Three urgency bands with CSS rails (IMMINENT red < 60min, TODAY amber 1-24h, DEFERRED dim > 24h). Render band headers only when entries exist in that band. ~40 lines + CSS.

4. Fire-now staged confirm gate: click `[FIRE NOW]` → button morphs to `[CONFIRM ▶ 3s]`, 3-second auto-revert. Click within 3s = execute. ~35 lines.

5. CSS additions (append to GAM_CSS): full block from UIUX-10 §E (`.gam-dr-row / .gam-dr-band-hdr / .gam-dr-countdown / .gam-dr-btn-fire / @keyframes gam-dr-pulse / @keyframes gam-dr-row-out`). ~200 lines.

6. Widen popover 420px → 500px max-width. Body 320px → 360px max-height.

7. Title live-update: count syncs on cancel AND fire-now AND removal. ~5 lines refactor.

CONSTRAINTS:
- Defer to v10.11.1: batch ops (UIUX-10 priority 5), inline reason edit (priority 6), undo toast countdown (priority 7), expand panel (priority 8). These add another ~3h.
- Mitigation R1 (setInterval load): use `el.textContent = str`, never innerHTML. Map keyed by username.
- Mitigation R4: errors in `_drExecuteNow` must surface to snack, not silent catch.

VERIFICATION: Open DR popover with 5+ entries; verify (a) sorted soonest-first, (b) countdowns tick visibly, (c) bands appear correctly, (d) Fire Now requires 2 clicks (stage + confirm), (e) timer cleared on close.

Report back: ~160 lines net change, sort + timers + bands + fire confirm all confirmed, deferred items noted for v10.11.1.
```

### H.7 — INTEGRATOR-QUEUE-POPOVER (D.4.b.3)

```
You are INTEGRATOR-QUEUE-POPOVER for v10.11.0. Single file: modtools.js. Touch ONLY `_showQueuePopover()` (~L17465-17614).

Apply UIUX-11 §H client-side (worker-side D1 schema is P2, separate ticket):

1. Replace flat row builder with `_buildQueueRow(it)` per UIUX-11 §F. Two-line layout (title + age, then author + report badge + APPR/REM/OPEN). ~80 lines.

2. Add `_buildSkeleton(n)` placeholder rows — 3 rows at 26px each — shown immediately on popover open before RPC resolves. ~30 lines.

3. Add `_queueAction(row, action, thingId, label)` + `_buildUndoToast(label, onUndo)` + `_fadeRemoveRow(row)`. Approve: dim immediately, withUndo fires, fade out 2s. Remove: dim + insert Undo toast above row with 5s countdown, on click of Undo re-add via apiApprove. ~80 lines.

4. Header: add #refreshBtn that calls `_fetchAndRenderQueue` again. Title sources from `res.data.queue_depth` (real D1 count) NOT `_firehoseState.postsQueued`. ~10 lines.

5. Footer link: change `/queue` → `/mod/queue`. Single line.

6. Empty/error states (UIUX-19 §C.2 + UIUX-11 §D):
   - When items.length === 0 && queue_depth === 0: render `gamMakeEmpty({icon:'queue-empty', headline:'Queue is clear'})`.
   - When items.length === 0 && queue_depth > 0 (data gap): render explicit "Queue has N items but row data is unavailable. Open /queue to review manually." with [Open /queue →] button.
   - When RPC errors: `gamMakeError({severity:'hard', msg:..., hint:..., retryFn:_fetchAndRenderQueue})`.

7. CSS additions (append to GAM_CSS): full block from UIUX-11 §E (`.gam-queue-row / .gam-queue-btn / .gam-queue-skeleton-bar / .gam-queue-undo-toast`). ~80 lines.

CONSTRAINTS:
- All existing helpers reused: apiApprove, apiRemove, withUndo, snack, timeAgo, escapeHtml, rpcCall('modGetQueueSnapshot').
- Risk R2 (undo timer leak): clear setInterval on popover close.
- Worker D1 schema (UIUX-11 §C) is separate ticket — frontend ships independently. The data-gap empty state IS the user-facing degradation today.

VERIFICATION: Open queue popover, verify (a) skeleton appears before data, (b) per-row APPR/REM/OPEN buttons render and fire, (c) Remove triggers Undo toast with countdown, (d) Refresh re-fetches, (e) /mod/queue footer link correct, (f) empty/data-gap states distinguishable.

Report back: ~300 lines net change, all interactions verified, worker-side gap noted as P2.
```

### H.8 — INTEGRATOR-HEALTH-POPOVER (D.4.b.4)

```
You are INTEGRATOR-HEALTH-POPOVER for v10.11.0. Single file: modtools.js. Touch ONLY `_showSiteHealthPopover()` (~L17616).

Apply UIUX-12 §D phase 1 (KPI tiles + local fallback render):

1. Replace existing pop.innerHTML template with the gam-sh2-* skeleton from UIUX-12 §C (header rail with FH+Worker pills, KPI strip 4×80px tiles, activity feed with 10 shimmer placeholders, footer). ~100 lines HTML/template literal.

2. Add `gam-sh2-*` CSS to the buildCSS()/template literal block. Full block from UIUX-12 §C (entry animation, KPI tiles, feed shimmer, pill state machine). ~140 lines CSS.

3. Implement `_renderKpiLocal(pop, {drQueue, bans24, dr24, approves24, removes24, fhActive})` — render KPI tiles immediately with local data, no layout shift. ~30 lines.

4. Implement `_setTile(pop, id, value, [warn, danger])` helper — sets value + threshold color + bar. ~15 lines.

5. modStats patch: in-place update via querySelector + textContent swap. NO display:none → visible. ~20 lines.

6. Activity feed: 10 rows (was 5). Type-colored chips per UIUX-12 §B. Shimmer until populated. ~40 lines.

7. Positioning clamp: prevent off-screen `left = Math.max(8, Math.min(r.left, window.innerWidth - 396))`. ~3 lines.

8. Old `gam-sh-*` rules + DOM structure: REMOVE only after the new gam-sh2-* version is verified. Coexist during transition.

CONSTRAINTS:
- No new RPC calls. Same modWhoami + modStats only.
- Existing dismiss/anchor logic UNTOUCHED.
- Phase 2 (in-place patch + flash + entry animation) defers if executor field missing — see UIUX-12 §D.

VERIFICATION: Click shield brand button, verify (a) KPI tiles render immediately with local fallback, (b) shimmer placeholders visible, (c) modStats values swap in-place when RPC resolves, (d) feed type chips render correctly, (e) no layout jump on RPC resolution.

Report back: ~330 lines net change, KPI tiles + feed shimmer working, modStats executor field present (or absent → noted), positioning clamp confirmed.
```

### H.9 — INTEGRATOR-MOD-STATE (D.4.c)

```
You are INTEGRATOR-MOD-STATE for v10.11.0. Single file: modtools.js. Touch state-handling cross-cutting helpers.

Apply these patches:

1. UIUX-19 §C.2 — Replace SUS popover empty state inline `<div style="color:#5a5752;text-align:center;...">No sus users currently flagged</div>` with `gamMakeEmpty({icon:'sus-empty', headline:'Queue is clean', desc:'No users currently flagged as suspicious.'})`. (Note: this is inside _showSusPopover but is a state-mgmt concern — coordinate with H.5 INTEGRATOR-SUS-POPOVER.)

2. UIUX-19 §C.2 — AI NBA card error: replace `<em class="gam-muted">AI unavailable</em>` (in `_drawerRenderNba`) with `gamMakeError({severity:'soft', label:'AI', msg: errorText, hint:'AI quota exhausted or model offline.', retryFn: retriggerNba})`. Keep "Retry" on genBtn supplemental. ~10 lines.

3. UIUX-19 §D — Retire `renderSkeleton` and `renderEmptyState`: alias to new `gamMakeSkel` and `gamMakeEmpty` factories. Both factories must be defined inside modtools.js (mirror of popup.js — content-script context cannot import from popup.js). ~80 lines copying factory implementations. ~5 lines aliasing.

4. UIUX-18 §D.2 — Add `prefers-reduced-motion: reduce` block to GAM_CSS. Cover: `.gam-intel-drawer / #gam-hot-now-panel / #gam-mc-panel / .gam-modal / #gam-backdrop / #gam-intel-backdrop` (transition: none) + `.gam-chip--risk-critical / .gam-thread-watch-btn--flagged / .gam-repeat-halo--pulse / .gam-mc-loading::before / .gam-skeleton / .gam-snack` (animation: none + static fallback). ~30 lines CSS.

CONSTRAINTS:
- Do NOT touch the underlying skeleton / shimmer keyframes — they're correct.
- Aliasing renderSkeleton → gamMakeSkel must be a thin wrapper preserving the (variant) signature.

VERIFICATION: Toggle OS reduced-motion, verify all named surfaces stop animating. Trigger AI NBA error path, verify error chip + retry button. Trigger SUS empty state, verify icon + headline.

Report back: factory functions added, retired functions aliased, PRM block added.
```

### H.10 — INTEGRATOR-MOD-A11Y (D.4.d)

```
You are INTEGRATOR-MOD-A11Y for v10.11.0. Single file: modtools.js. Small targeted accessibility patches.

Apply these patches:

1. UIUX-20 §E — Brigade pulse: locate the inline `style.cssText` assignment that includes `animation:gam-brigade-pulse...`. Wrap the animation set in a JS check:
   ```js
   const motionOk = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   if (motionOk) { chip.style.animation = 'gam-brigade-pulse 1s ease-in-out infinite alternate'; }
   ```
   ~3 lines.

2. UIUX-20 §G — `filterSel` (status bar select at ~L17808): add `aria-label="Upvote age filter"`. 1 line.

3. UIUX-20 §G — `gam-bar-tier-badge` span (the "L" badge on brand button at ~L17927): add `aria-hidden="true"`. 1 line.

CONSTRAINTS:
- Do NOT add aria-label to elements that already have one.
- Do NOT remove existing aria attributes.

VERIFICATION: Run accessibility extension on GAW page with brigade pulse active in reduced-motion mode — pulse should not animate. Tab through status bar, filter select should announce as "Upvote age filter".

Report back: 3 patches applied, no regressions.
```

### H.11 — INTEGRATOR-WORKER (D.5.3 only — small enough to bundle)

```
You are INTEGRATOR-WORKER for v10.11.0. Single file: D:\AI\_PROJECTS\modtools-ext\cloudflare-worker\gaw-mod-proxy-v2.js.

Apply only UIUX-12 dependency check:

1. Audit `/mod/stats` recent_actions[] response shape. Confirm each item has an `executor` (or `mod` or `by`) field. If missing, ADD it to the SQL query that produces the response (project the moderator username column into the result).

2. ~5-30 lines depending on whether the field exists today.

DEFER to v10.11.1+:
- D.5.1 gaw_queue D1 migration + firehose write (UIUX-11 §C, ~3.5h)
- D.5.2 /mod/stats spark + yesterday + unsticky24 (UIUX-09 §G, ~2h)

VERIFICATION: curl `/mod/stats` and confirm recent_actions[].executor field present. Site Health popover phase 2 unblocks once this lands.

Report back: executor field status (present/added), worker deploy successful, no regressions.
```

---

## I. Risk register

### I.1 — Highest-risk patches

| Patch | Risk | Severity | Mitigation |
|---|---|---|---|
| **D.2.3 Maintenance card split** | `card-badge-maint` JS call sites become 4 separate IDs. If any are missed, badges silently stop firing. | HIGH | Pre-patch grep for `card-badge-maint` in popup.js + modtools.js, document every call site, map to new ID. INTEGRATOR-POPUP-JS executes the mapping in lock-step. |
| **D.4.a.2 C.ACCENT classification** | Each call site needs manual review (brand-amber vs form-blue). Wrong classification = visual regression. | HIGH | When uncertain, default to C.AMBER. Visual review post-patch on real GAW pages. |
| **D.3.1 wireTabNav special-case removal** | Lead tab might break if `#leadSection`/`#leadOnlyTools` are referenced anywhere else. | MEDIUM | Test all 5 tabs on lead + non-lead accounts after patch. Keep the special-case block in a comment for instant rollback. |
| **D.3.13 Sparkline rendering** | If worker doesn't return `spark` field (P2), JS must gracefully degrade to empty bars. | LOW | UIUX-09's spec already covers: empty `data7` array → all bars get `class="zero"`. Verified safe. |
| **D.4.b.2 DR popover setInterval** | Timer leaks if popover is opened multiple times. | LOW | UIUX-10 R1: store interval ID on `pop._timerInterval`; clear in `_closePop()`. |
| **D.4.b.3 Queue popover Undo timer** | Same setInterval leak risk for the 5s Undo countdown. | LOW | UIUX-11 R2: clear in `_closePop()`. |
| **D.2.1 Cards <details> → <div>** | If any code anywhere assumes `<details open>` is a real DOM state, it'll break. | LOW | UIUX-01 §F.4 enumerates the 4 functions touching open attribute. All become no-ops on div. Search is exhaustive. |

### I.2 — Schedule risk

The orchestrator should split D.4.b into 4 sub-agents (SUS / DR / Queue / Health). If executed serially (one agent), the wave 3 critical path stretches from ~5h to ~15h.

### I.3 — Items NOT to touch in v10.11.0

These are explicitly deferred to prevent scope creep:

- Macros card refactor (UIUX-06) — 7.75h, complex grid layout work
- Tokens card 3-state machine (UIUX-07) — 5.5h, depends on auth wizard work
- Intel Drawer full 4-card refactor (UIUX-13) — 21-26h, single largest single-surface investment
- Mod Console keyboard nav (UIUX-14) — 4.5h, needs careful keydown scoping
- Gear Panel 2-col rail (UIUX-15) — 22h total
- Auth wizard step indicator (UIUX-17) — 14.5h total
- Motion token callsite migration (UIUX-18 F.1) — 5.5h, low priority

---

## J. Already-applied (v10.10.1 hotfix in flight)

The orchestrator dispatched these 5 micro-fixes BEFORE this synthesis. They are noted as **DONE-PRESHIP** here. The v10.11.0 ship master incorporates them as already-landed. If any did NOT make it into v10.10.1, they get re-routed into v10.11.0:

| ID | Description | Source | Status |
|---|---|---|---|
| **P1** | `.gam-card` CSS rules — basic ruleset (border, header bg, body padding) | UIUX-01 §I summary | **DONE-PRESHIP** v10.10.1 |
| **P2** | `const C` 35-key mirror replacing 12 misaligned values | UIUX-03 §G.2 | **DONE-PRESHIP** v10.10.1 |
| **P3** | Active Now color bug: `count<2 ? amber : amber` → semantic | UIUX-08 §C.1 | **DONE-PRESHIP** v10.10.1 |
| **P4** | Username `<strong>` → `<a href="/u/">` in IntelDrawer sec1 | UIUX-13 §C.2 | **DONE-PRESHIP** v10.10.1 |
| **P5** | AI tile `data-drill="ai24"` + drill branch | UIUX-09 §F.2 | **DONE-PRESHIP** v10.10.1 |

**v10.11.0 EXTENDS each of these:**
- P1 → full UIUX-01 §D ruleset (40 lines, sub-section / urgent / order-last variants)
- P2 → full UIUX-03 §F frozen object + token stylesheet injection + call-site classification
- P3 → already complete in hotfix
- P4 → already complete in hotfix
- P5 → already complete in hotfix; UIUX-09 §F-G adds sparklines + delta chips + 4-col grid

If P1-P5 did not actually ship in v10.10.1, the orchestrator re-routes them into Wave 1 of v10.11.0.

---

## K. Verification — Done-Definition for v10.11.0

A v10.11.0 ship is **done** when:

1. **All 5 cards visible as discrete panels** with amber left rail + 8px gaps + uppercase headers. No "mushed together" visual collapse.
2. **5 tabs work cleanly** — including Lead tab on non-lead accounts (gracefully empty), Lead tab on lead accounts (all KPIs + quick actions visible).
3. **Stat tiles never silently fail** — load → skeleton → values OR load → skeleton → error chip + retry. Never indefinite `--`.
4. **SUS popover DR is 2 clicks** (open + click DR). Inline drill expand works for history.
5. **DR popover sorted soonest-first** with live ticking countdowns. Fire Now requires 2 clicks (stage + confirm).
6. **Queue popover renders rows with APPR/REM/OPEN** — no more permanent "Queue is empty" lie. Honest data-gap state when D1 missing.
7. **Site Health KPI tiles render immediately** with local fallback. modStats patches in-place — no layout jump.
8. **Brand color amber consistent** — `C.ACCENT` blue collisions resolved. Forms use blue, brand surfaces use amber.
9. **Keyboard reachable** — Tab reaches every stat tile + KPI tile + drill drawer. Enter/Space activates. Esc with focus restore.
10. **Screen reader announces** — tab roles complete, dialog roles on drill drawer, aria-labels on icon buttons.
11. **Reduced motion respected** — pulse + shimmer animations stop under `prefers-reduced-motion: reduce`.
12. **No regression on v10.10.x feature surface** — modmail, intel drawer, mod console, gear panel all unchanged.

---

*End of DESIGN_SHIPMASTER. Generated 2026-05-10 from UIUX-01..20 corpus. v10.11.0 dispatch is ready.*
