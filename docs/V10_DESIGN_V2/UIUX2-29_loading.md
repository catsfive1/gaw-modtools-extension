# UIUX2-29 -- Skeleton / Loading State Audit
**Skill:** frontend-design (skeleton loading audit -- no `Loading...` text, shimmer PRM-respecting, no layout shift, shape matches final content)
**Audit basis:** v10.13 dist -- popup.js, popup.html, popup.css, modtools.js (full grep pass)
**Stance:** is "Loading..." text fully eliminated? No. 10 live instances across 8 surfaces.

---

## A. `Loading...` Text Inventory (BANNED -- all must die)

All literal loading text visible to users. `withLoading()` button-label variants (button text only, never user-visible as a content placeholder) are noted but classified separately.

### A.1 -- popup.html: 4 hardcoded `Loading...` strings in Diagnostics card (LINES 815, 818, 821, 827)

**Location:** `popup.html:815,818,821,827` -- `diagSysIdentity`, `diagSwHealth`, `diagRpcLog`, `diagStorage`

```
<div id="diagSysIdentity" ... >Loading...</div>
<div id="diagSwHealth"    ... >Loading...</div>
<div id="diagRpcLog"      ... >Loading...</div>
<div id="diagStorage"     ... >Loading...</div>
```

**Status:** These ARE caught and replaced by `wireDiagSkeletons()` (popup.js:524-533), which runs on DOMContentLoaded and swaps them for `gamMakeSkel('paragraph')` nodes -- BUT only if `el.textContent.trim() === 'Loading...'` at that exact moment. The HTML seeds them as `Loading...`; JS replaces them. The text is live in the DOM for the flash window between HTML parse and JS execution.

**Verdict:** Still-banned text in HTML even if JS patches it. The initial paint can show "Loading..." if JS is slow or the `<details>` is already open. Fix: remove from HTML; initialize empty with `aria-busy="true"` and let `wireDiagSkeletons()` inject skeletons unconditionally on DOMContentLoaded. The patch already runs -- the HTML just needs the text stripped.

---

### A.2 -- popup.js: `loadBugReports()` writes `loading...` to a status element (LINE 3632)

**Location:** `popup.js:3632` -- Bug Reports panel

```js
status.textContent = 'loading...';
```

**Context:** `status` is `$('bugListStatus')` -- a status text div, not a list area. The list itself is replaced with `gamMakeSkel('paragraph')` (popup.js:3737 -- correct). But the status chip beside the list button gets raw text.

**Verdict:** Replace with aria-based status update or empty string. The list is skeletonized; the status chip doesn't need loading text -- its previous value or empty is fine during load.

---

### A.3 -- popup.js: `__setDrillMeta('loading...')` on drill drawer open (LINE 4204)

**Location:** `popup.js:4204` -- Drill drawer meta bar

```js
__setDrillMeta('loading...');
```

**Context:** The drill drawer title bar has a meta area that shows record counts and export info. On drill open, it's set to `loading...` while the section renders asynchronously.

**Verdict:** Replace with an inline skeleton shimmer chip (1 short line, ~60px wide) or simply empty string. Meta bar is narrow horizontal strip -- a `gam-skel-line` inside the meta span with `width:80px` would maintain layout without text.

---

### A.4 -- popup.js: `__maintWire('maintRosterStaleness', ..., 'loading...')` (LINE 5628)

**Location:** `popup.js:5628` -- Maintenance section, Roster Staleness row

```js
__maintWire('maintRosterStaleness', maintRosterStaleness, 'loading...');
```

**Context:** `__maintWire` is a helper that wires a button + status element. The third arg is the `withLoading()` label shown on the *button* during the async call. This is button-text-during-action, not a persistent content placeholder.

**Verdict:** BORDERLINE. Button labels during async action are not user-facing content placeholders -- they're transient button state. However `loading...` is weaker than an action verb. Replace with `'checking...'` to match the verb style of adjacent wires (`'crawling...'`, `'verifying...'`, `'running...'`). Not a skeleton issue -- a copy issue.

---

### A.5 -- popup.js: `__maintLoadReports()` writes `loading...` to status chip (LINE 5802)

**Location:** `popup.js:5802` -- Maintenance Reports panel

```js
status.textContent = 'loading...';
```

**Context:** Same pattern as A.2 -- status chip beside the list button. The report list itself likely gets populated inline.

**Verdict:** Same fix as A.2 -- empty or aria-only status during load, not text.

---

### A.6 -- popup.js: Lapsed mods loader writes `loading...` to status chip (LINE 6089)

**Location:** `popup.js:6089` -- Lead tab, Lapsed Mods section

```js
if (status) { status.className = 'pop-token-status'; status.textContent = 'loading...'; }
```

**Verdict:** Same as A.2 and A.5 -- status chip beside a list. Empty during load, error text on fail.

---

### A.7 -- modtools.js: Mod Notes section writes `loading...` to status div (LINE 8171)

**Location:** `modtools.js:8171` -- Mod Card, Notes tab, note status element

```js
status.textContent = 'loading...';
```

**Context:** Inside the Notes tab of the Mod Card. This is a status indicator for the note autosave system (not a list). It updates live to `'saving...'`, `'saved'`, `'error'`.

**Verdict:** This is a *state machine* status chip -- the loading state is the initial fetch of the existing note. Replace with an empty string or a shimmer-block on the textarea itself (disabled textarea skeleton) rather than text in the status div.

---

### A.8 -- modtools.js: Note history section has `(loading...)` count span + emoji text (LINE 9574)

**Location:** `modtools.js:9574,9577` -- Mod Card, Note History tab

```js
`<span class="gam-mc-hint" id="mc-note-count">(loading...)</span>`
`<div id="mc-note-history" ...>🔍 loading notes...</div>`
```

**Context:** The count span shows `(N notes)` once loaded. The history div shows the actual note entries. Both are hardcoded as template literals with loading text.

**Verdict:** Two violations in one template. Count span: start empty or `(-)`. History div: replace with `gamMakeSkel('paragraph')` (2-3 lines). This is content area -- skeleton is correct here, not text.

---

### A.9 -- modtools.js: Modmail Panel thread list column seeds `loading...` inline (LINE 16784)

**Location:** `modtools.js:16784` -- Modmail Panel, thread list column (gam-mmp-list)

```js
'<div id="gam-mmp-list" ...>loading...</div>'
```

**Context:** innerHTML string building the 3-column modmail panel. The list column seeds with text, then `__mmpLoadList()` overwrites it immediately. There's a secondary hit at line 16835 (`list.innerHTML = '<div style="...">loading...</div>'`) used during refresh.

**Verdict:** Two instances. Column seed: inject a `gam-skel-row` x3 shimmer block matching the ~36px-tall thread row height. Refresh state (16835): same skeleton rows, not text.

---

### A.10 -- modtools.js: Active Mods popup body seeds `loading...` (LINE 17330)

**Location:** `modtools.js:17330` -- Active Mods popover, body area

```js
'<div id="gam-active-mods-body" ...>loading...</div>'
```

**Context:** Immediately after mount, `loadWindow(hours)` is called which sets `body.innerHTML = '<span style="color:#5a5752">querying...</span>'` (17345) then renders real rows. Two-step: `loading...` -> `querying...` -> real content.

**Verdict:** The double-step is noise. Seed with skeleton rows matching the ~24px mod-row height (3 rows), then `loadWindow` replaces directly with real content, skipping the text intermediate.

---

### A.11 -- modtools.js: User presence popup `loadingEl.textContent = 'Loading...'` (LINE 17422)

**Location:** `modtools.js:17422` -- User Presence popover (audit/presence section)

```js
loadingEl.textContent = 'Loading...';
```

**Context:** A transient loading indicator div while async presence data fetches. The popover body is narrow (~360px max height).

**Verdict:** Replace `loadingEl` with a `gamMakeSkel('paragraph')` node (2 lines, matches the eventual text block). The `loadingEl` is removed once data arrives -- the skeleton approach works cleanly here.

---

### A.12 -- modtools.js: AI Tard-Note panel uses `'Fetching...'` and `'Fetching (fresh)...'` (LINES 19670, 19687)

**Location:** `modtools.js:19670,19687` -- AI Tard-Note suggestion panel

```js
bodyEl.innerHTML = '<div style="color:#9b9892;...">Fetching...</div>';
bodyEl.innerHTML = '<div style="color:#9b9892;...">Fetching (fresh)...</div>';
```

**Context:** Small inline AI suggestion panel in user context menus. The body is a compact area showing 1-3 suggestion chips.

**Verdict:** Replace both with `gamMakeSkel('row')` (one row skeleton, ~36px). The panel is small enough that a single skeleton row communicates load state without text. "Fetching (fresh)" vs "Fetching" distinction is not user-meaningful.

---

### withLoading() Button Labels -- NOT Banned (classified separately)

The following are `withLoading(btn, label, fn)` calls where `label` only appears as the button's own `.textContent` during the async operation. The button reverts to its original label when done. These are transient button affordances -- never content placeholders. They are not banned under the "no Loading... text" rule, but the `loading...` variants in this list should be replaced with action verbs:

| Line | Current label | Better label |
|---|---|---|
| popup.js:3711 | `'loading...'` | `'fetching...'` |
| popup.js:5853 | `'loading...'` | `'fetching...'` |
| popup.js:5628 | `'loading...'` | `'checking...'` |

All other `withLoading()` calls already use action verbs (`'saving...'`, `'crawling...'`, `'rotating...'`, `'trimming...'`, etc.) and are correct.

---

## B. Skeleton Coverage Per Surface

| Surface | Location | Skeleton present? | Mechanism |
|---|---|---|---|
| Stats tab tiles | popup.js:481-510 | YES | `gamMakeSkel('stat')` on open; cleared by `loadStats()` success |
| Diagnostics panels | popup.html + popup.js:524-533 | PARTIAL | HTML seeds `Loading...`; JS patches to `gamMakeSkel('paragraph')` on DOMContentLoaded. Race window exists. |
| Bug Reports list | popup.js:3737 | YES | `list.replaceChildren(gamMakeSkel('paragraph'))` |
| Bug Reports status chip | popup.js:3632 | NO | Raw `loading...` text |
| Drill drawer (popup) | popup.js:4198-4206 | NO | `__setDrillMeta('loading...')` -- no skeleton |
| Maintenance reports status | popup.js:5802 | NO | Raw text |
| Lapsed mods status | popup.js:6089 | NO | Raw text |
| Intel Drawer sections (modtools) | modtools.js:5843-5855 | YES | `renderSkeleton('paragraph')` when `__uxOn()`; legacy 3-div skeleton when flag off |
| NBA / Next Best Action card | modtools.js:6190-6196 | YES | `renderSkeleton('card')` while fetching |
| AI Mod Card preview | modtools.js:8834-8846 | YES (custom) | 4-cell 2x2 grid of `gam-ai-skeleton` ghost cards |
| Mod Card note status | modtools.js:8171 | NO | Raw `loading...` text |
| Mod Card note history | modtools.js:9574,9577 | NO | `(loading...)` count span + emoji text |
| Lookalikes section | modtools.js:6613-6614 | NO | Inline text `'Scanning co-commenter graph...'` (non-banned, not "Loading..." -- but still text) |
| Activity feed (SH2) | modtools.js:18668-18671 | YES (custom) | 10x shimmer `li` rows with staggered `animation-delay` via CSS custom property |
| Modmail panel thread list | modtools.js:16784,16835 | NO | Raw `loading...` text |
| Active Mods popover | modtools.js:17330 | NO | Raw `loading...` text |
| User Presence popover | modtools.js:17422 | NO | Raw `Loading...` textContent |
| AI Tard-Note panel | modtools.js:19670,19687 | NO | `Fetching...` / `Fetching (fresh)...` text |
| Queue skeleton (page-side) | modtools.js:14612-14627 | YES (custom) | `gam-queue-skeleton` 3-row wrap with MutationObserver removal |

**Coverage summary:** 6 of 18 surfaces have true skeletons. 4 are partial or text-fallback. 8 have no skeleton at all.

---

## C. Shape Mismatch Analysis (Skeleton vs Final Content)

### C.1 -- Diagnostics panels: paragraph skeleton vs monospace preformatted block (MISMATCH)

**Skeleton:** `gamMakeSkel('paragraph')` -- 3 lines at 80%, 95%, 70% width, 12px height each.
**Final content:** `white-space:pre-wrap; font-family:ui-monospace; font-size:10px; line-height:1.6` -- a multi-line monospace dump, typically 8-15 lines of key:value pairs.

**Gap:** Skeleton has 3 lines; content has 8-15. Height difference causes layout shift when content replaces skeleton. The skeleton should be 6-8 lines tall, each ~10px height matching the 10px monospace font, narrower widths (key:value pattern suggests 40-60% widths).

**Fix:** Add a `'mono-block'` variant to `gamMakeSkel` -- 7 lines, alternating 55%/80% widths, 10px height, 1px gap (matching `line-height:1.6` at `font-size:10px`).

---

### C.2 -- Mod Card note history: paragraph skeleton (not yet applied) should match note card shape (MISMATCH)

**Current:** Text `🔍 loading notes...` (no skeleton at all).
**Final content:** A list of note cards, each with username chip + timestamp + note text block (~48px per card, 1-N items).

**Fix:** Skeleton should be 2 `gam-skel-row` items (36-48px each) not a paragraph skeleton. Row variant communicates "list of items" correctly.

---

### C.3 -- Lookalikes section: text "Scanning..." vs card grid (MISMATCH)

**Current:** Text `'Scanning co-commenter graph...'` in a 10px muted color element.
**Final content:** 0-5 user cards each showing username + match score chip, in a vertical list.

**Gap:** Text implies a scanning operation (acceptable affordance) but the height difference when cards paint will shift layout. 2 `gam-skel-row` items (36px each) would hold the space.

---

### C.4 -- Active Mods popover: text vs row list (MISMATCH)

**Current:** `loading...` text, then overwritten by `querying...` text.
**Final content:** A list of mod rows, each ~24px (username + last-seen badge).

**Fix:** 4 `gam-skel-row` items at ~24px height matching the mod row structure.

---

### C.5 -- AI ghost-card (modtools): shape matches final 2x2 action-card grid (MATCH)

**Skeleton:** 4 cells, 2-column grid, each 80px tall with inner line stubs at 30%/90%/80%/60% widths.
**Final content:** 4 action-card panels (2x2), similar height, similar inner text structure.

**Assessment:** Good shape match. The `::after` shimmer sweep is correct. PRM check: animation is in CSS with no explicit `@media (prefers-reduced-motion)` guard (modtools.js:22011). Needs guard.

---

### C.6 -- Activity feed shimmer (SH2): row shape matches final (MATCH)

**Skeleton:** 10x `<li class="gam-sh2-feed-shimmer">` -- 28px height, staggered 80ms delay.
**Final content:** Feed rows at similar height with type badge + text.

**Assessment:** Shape correct. Staggered delay is a nice touch. PRM: the keyframe `gam-sh2-shimmer` has no PRM guard (modtools.js:18628). The `@media (prefers-reduced-motion: reduce)` block at modtools.js:22185 does NOT include `.gam-sh2-feed-shimmer`. Needs adding.

---

### C.7 -- Intel Drawer paragraph skeleton vs section content (PARTIAL MATCH)

**Skeleton:** `renderSkeleton('paragraph')` -- 2 lines at 100%/70%.
**Final content:** Per-section -- ranges from 1-line status to multi-line structured data to interactive widgets.

**Assessment:** Paragraph skeleton is generic and works for most sections. Sections with interactive content (ban history, action buttons) will cause layout shift. Acceptable for now; per-section variants would require adapter knowledge.

---

## D. Spinner vs Skeleton Decision Per Surface

| Surface | Recommended | Rationale |
|---|---|---|
| Stats tab tiles | SKELETON (current -- keep) | Tiles have fixed layout; skeleton prevents shift |
| Diagnostics panels | SKELETON (fix shape -- see C.1) | Content is structured, shape-matchable |
| Bug Reports list | SKELETON (current -- keep) | List-shaped content |
| Bug Reports status chip | NEITHER -- empty string | Chip is secondary; no content placeholder needed |
| Drill drawer meta bar | SKELETON (1 short line, 80px) | Meta bar is inline; needs width reservation |
| Maintenance reports status | NEITHER -- empty | Status chip, secondary to list |
| Lapsed mods status | NEITHER -- empty | Same as above |
| Intel Drawer sections | SKELETON (current -- keep) | Already implemented |
| NBA card area | SKELETON (current -- keep) | Card-shaped, correct |
| AI Mod Card preview | SKELETON (current -- keep; add PRM guard) | Custom ghost-card grid matches final |
| Mod Card note status | NEITHER -- empty string | Autosave state machine; text on actual state change |
| Mod Card note history | SKELETON (row x2 -- see C.2) | List of note cards |
| Lookalikes section | SKELETON (row x2 -- see C.3) | User card list |
| Activity feed | SKELETON (current -- keep; add PRM guard) | Custom row shimmer, shape matches |
| Modmail thread list | SKELETON (row x3) | Thread rows ~36px each |
| Active Mods popover | SKELETON (row x4) | Mod rows ~24px each |
| User Presence popover | SKELETON (paragraph) | Text-block content |
| AI Tard-Note panel | SKELETON (1 row) | Compact suggestion list |
| Queue rows (page) | SKELETON (current -- keep) | Row skeleton already correct |

**Spinner verdict:** No surface should show a spinner for initial content load. Spinners are acceptable only for confirmed user-triggered one-shot actions where a result is not content-shaped (e.g., "Copy to clipboard" confirmation, "Rotate token"). All content areas get skeletons.

---

## E. Effort Breakdown

### E.1 -- QUICK WINS (< 15 min each, no new infrastructure)

| ID | Fix | File | Lines | Effort |
|---|---|---|---|---|
| E1-A | Strip `Loading...` from popup.html diag divs; leave empty with `aria-busy` | popup.html | 815,818,821,827 | 5 min |
| E1-B | Replace `status.textContent = 'loading...'` x3 with empty string | popup.js | 3632, 5802, 6089 | 5 min |
| E1-C | `__setDrillMeta('')` on drawer open (not `'loading...'`) | popup.js | 4204 | 2 min |
| E1-D | `maintRosterStaleness` wire label: `'loading...'` -> `'checking...'` | popup.js | 5628 | 1 min |
| E1-E | `withLoading` button labels: two `'loading...'` -> `'fetching...'` | popup.js | 3711, 5853 | 2 min |
| E1-F | Mod Card note status: start empty, not `'loading...'` | modtools.js | 8171 | 2 min |
| E1-G | Note count span: start `(-)` not `(loading...)` | modtools.js | 9574 | 2 min |
| E1-H | AI Tard-Note: both `Fetching...` divs -> `gamMakeSkel('row')` node | modtools.js | 19670,19687 | 10 min |

---

### E.2 -- MEDIUM (30-60 min, requires DOM surgery or new skeleton variant)

| ID | Fix | Effort |
|---|---|---|
| E2-A | Modmail thread list: seed 3x `gam-skel-row` instead of `loading...` text; also fix refresh state (16835) | 30 min |
| E2-B | Active Mods popover: seed 4x `gam-skel-row` (24px) instead of `loading...` | 20 min |
| E2-C | User Presence popover: replace `loadingEl` with `gamMakeSkel('paragraph')` node | 15 min |
| E2-D | Mod Card note history: inject `gamMakeSkel('row')` x2 before async; remove on render | 20 min |
| E2-E | Lookalikes section: inject 2x `gam-skel-row` instead of scanning text; remove on resolve | 20 min |
| E2-F | Add `'mono-block'` variant to `gamMakeSkel` (7 lines, 10px, mono spacing) for diag panels | 30 min |

---

### E.3 -- PRM GUARD GAPS (animation without `prefers-reduced-motion` guard)

| ID | Animation | Location | Fix |
|---|---|---|---|
| E3-A | `gam-ai-skeleton::after` shimmer sweep | modtools.js:22005-22011 | Wrap in `@media (prefers-reduced-motion: no-preference)` |
| E3-B | `gam-sh2-shimmer` / `.gam-sh2-feed-shimmer` | modtools.js:18628,18654 | Add `.gam-sh2-feed-shimmer { animation: none }` to PRM block (modtools.js:22185) |
| E3-C | `gam-queue-skeleton-bar` shimmer (if any) | modtools.js:18357 | Confirm no animation; currently static gray -- OK |
| E3-D | popup.css `gam-skel-pulse` | popup.css:2062-2070 | Already correct -- wrapped in `@media (prefers-reduced-motion: no-preference)` |
| E3-E | modtools.js `gam-skel-pulse` | modtools.js:22180-22186 | Already correct -- `@media (prefers-reduced-motion: reduce) { .gam-skel-line { animation: none } }` |

**PRM status:** popup.css skeleton is correct. modtools.js skeleton lines are correct. The AI ghost-card and activity feed shimmer are NOT guarded. Two fixes needed (E3-A, E3-B).

---

### E.4 -- INFRASTRUCTURE DEBT

The codebase has THREE separate skeleton implementations:

| System | Location | Scope |
|---|---|---|
| `gamMakeSkel` (popup-canonical) | popup.js:285-310 + popup.css:2031-2070 | popup context only |
| `gamMakeSkel` (modtools-local, v8.1) | modtools.js:4464-4477 | popover/drawer context (inside IIFE) |
| `gam-skeleton` / `renderSkeleton` (v8.1 legacy) | modtools.js:4314-4365 | flag-gated, modtools context |

The modtools.js `gamMakeSkel` at 4464 does NOT use `gam-skel-shimmer` -- it applies `gam-skel-line` with inline `background:#2a2825` and a separate `gam-skel-pulse` animation. The popup.js version uses `.gam-skel-shimmer` (gradient sweep). They look different.

**Not a v10.13 blocker** but the divergence means a future "skeleton design update" requires touching 3 systems. Worth consolidating into a shared content-script-accessible module in a future pass.

---

## F. Summary Verdict

"Loading..." text is NOT fully eliminated. The answer to the audit question is: **10 live instances across 8 surfaces** (A.1 through A.12, counting the modmail double-hit and AI tard-note double-hit as single surface each).

**Total banned text instances:** 10 user-visible strings (Loading..., loading..., Fetching...)
**Surfaces with true skeletons:** 6 of 18 (33%)
**PRM violations in animation:** 2 (AI ghost-card, activity feed shimmer)
**Shape mismatches causing layout shift:** 3 confirmed (diag panel mono-block, note history, active mods)

**Priority order for v10.13:**
1. E1-* quick wins -- all < 15 min, eliminate the text
2. E3-A, E3-B -- PRM guards, 5 min each
3. E2-A, E2-B, E2-C -- modmail/active-mods/presence skeletons (visible surfaces)
4. E2-F -- mono-block variant for diag panels (shape match)
5. E2-D, E2-E -- note history + lookalikes (lower-traffic surfaces)
