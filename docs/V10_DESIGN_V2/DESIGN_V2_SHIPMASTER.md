# DESIGN V2 SHIPMASTER -- v10.13 Implementation Plan

**Editor-in-chief:** OPUS-DESIGN-CTO V2
**Date:** 2026-05-10
**Source corpus:** 39 V2 audits (UIUX2-01..40, less UIUX2-35 which was not delivered)
**Target ship:** v10.13.x in 5 waves, ~30-40h total dev work, parallelizable across multiple Sonnet agents
**Status:** Authoritative. Implementation specs derive from this doc; the 39 child audits are reference material.

---

## Section 1 -- Executive Summary

### Top 5 cross-cutting themes that unify the audits

1. **The token system is schema-only -- callsites never migrated.** v10.10.1 added `C.AMBER`, `C.BLUE`, `--bb-motion-*`, `--bb-warn-status` (proposed), `--bb-teal` (proposed) but NONE are wired. 90 `C.ACCENT` calls still emit blue at brand surfaces. 22 transitions hardcode ms values; 0 use the motion tokens. 175 unique hex values still exist (up from 155 in v1). Every audit independently surfaces the same finding: **the abstraction layer was built; the migration was punted.** (UIUX2-23, UIUX2-24, UIUX2-25, UIUX2-26)

2. **Spec deviations: shipped state regressed v1 promises.** UIUX-08 KPI deltas claim shipped but the CSS rule for `.gam-kpi-delta[data-dir]` doesn't exist -- every delta renders monochrome. UIUX-04 macros card defines `.gam-macro-item-*` classes that no JS uses. Mod Console (UIUX-14) shipped 0% of v1 spec. UIUX-15 maint is at 0% v1 compliance. UIUX-12 health popover shipped but `--bb-pill-label` never received explicit CSS, firehose mismatch state ARMED never wired. **Half the v1 work is verbal-only.** (UIUX2-06 §A, UIUX2-04 §A, UIUX2-18 §A, UIUX2-15 §A)

3. **Inline-styled DOM injection is the silent canonical pattern.** modtools.js has 188 `cssText =` assignments embedding raw hex, raw px, raw motion values directly into runtime DOM. This bypasses every token system. The Bloomberg amber is a single consistent visual brand on paper -- in practice it's `#ff9933`, `#f0a040`, `#E8A317`, plus rgba variants of each, all rendered side by side. Token migration cannot complete without sweeping this surface. (UIUX2-23 §B.4, UIUX2-26 §A, UIUX2-27 §A.2)

4. **The popovers are the strongest surface; surfaces below them are dogfood.** SUS, DR, Queue, Health, Active Mods popovers got ralph-grade attention -- correct lazy load, correct ESC, correct anchor positioning. The bar/ticker beneath them has dead severity weight tiers (CSS !important wins over JS), the stats grid has ghost sparklines + ghost delta chips, the Diag tab reads from a stale storage key (IDB migration regression), and the Intel Drawer is 10 prose sections in a 100vh wall. **The architectural skeleton is sound; the dressing is incomplete.** (UIUX2-09 §B1, UIUX2-01 §A, UIUX2-07 §F, UIUX2-17 §A.2)

5. **The 4/8/12/16 spacing grid is declared and 40% violated.** `--bb-s3 = 6px` is itself off-grid -- every callsite of that token emits a violation. 30+ instances of literal `6px` outside the token system. Three explicit `5px` values violate the project's own charter ("no 5/6/7/9/10/11"). Type scale: 14 distinct font sizes vs 7 target. Letter-spacing: 26 distinct values vs 7 target. **Discipline gap, not architectural gap; mechanical to fix.** (UIUX2-27, UIUX2-26)

### Total cumulative effort estimate

Summed conservatively across the 39 audits where effort is named:

| Bucket | Estimated hours |
|---|---|
| Surface deep-dives (01-20) | ~85h |
| Cross-cutting (21-34) | ~45h |
| Journeys (36-40) -- mostly overlapping with above | ~15h net new |
| **Cumulative if every audit shipped its full spec** | **~145h** |

This is far over what v10.13 can absorb. The corpus contains both v10.13 work and v10.14+ deferred work; the wave plan in §5 partitions to ~30-40h for v10.13 actual dev, deferring the rest.

### The 10 things v10.13 MUST ship

1. **Stats tab honest data: kill ghost sparkline + ghost delta DOM, wire delta chips via sessionStorage diff** (UIUX2-01) -- the most-visited surface in the popup is a credibility wound.
2. **Tokens tab three-state machine: First-Run / Returning Mod / Returning Lead** (UIUX2-02) -- eliminates flash-of-wrong-content, places claim CTA inside the card not orphaned outside.
3. **Status bar ticker severity weight repair: remove `!important` on `font:` shorthand** (UIUX2-09 §B1) -- 5 of 7 ticker states currently render at wrong weight; 10-min CSS edit unlocks shipped JS.
4. **Diag tab IDB read path: route through `diagReadRecent` RPC, not stale `chrome.storage.local.get('gam_diag_log')`** (UIUX2-07 §F.1) -- log is empty post-IDB migration; mods see "no errors" when errors exist.
5. **SUS popover three fixes: chevron reset bug, dead `[DR Rule]` button wired, Unmark on collapsed strip** (UIUX2-10 §E.1) -- click count regressed from 2 to 3 on the most common false-positive recovery action.
6. **Modmail draft local-mirror read on session miss** (UIUX2-39 §E.1, UIUX2-40 §F.1) -- `_mirrorDraftToLocal` writes to local storage; nothing reads it. SW restart silently loses every draft.
7. **Copy-to-clipboard UI feedback (`copyWithPulse` utility)** (UIUX2-31 §B Rank 1) -- zero confirmation today across token copies, debug dump, AI card copy. ~24 lines fixes the highest-ROI gap.
8. **Mod Console keyboard ergonomics: 1-6 tab switching + Ctrl+Enter submit + BAN tab danger color + UNBAN demotion** (UIUX2-18 §C, §D) -- 4 atomic edits, ~9.5h, transforms the daily-mod hot path.
9. **Modmail action bar: add Mark SUS + DR 72h buttons to gam-mm-bar** (UIUX2-37 §C CR-2/CR-3) -- removes the entire Mod Console detour from modmail-to-SUS/DR; saves 2-3 clicks on the highest-frequency cross-surface chain.
10. **First-run wizard `Open greatawakening.win` button on success screen** (UIUX2-36 §E-2) -- 1 line of HTML/JS, eliminates the "type the URL" moment for every new mod.

### The 10 things to defer to v10.14+

1. **Intel Drawer 4-card refactor (~26h)** -- structural rework of 10 sections into 4 semantic cards + Action Strip. Highest-impact UX win in the corpus but exceeds v10.13 budget. Phase 1 (~16h) targeted for v10.14. (UIUX2-17)
2. **Mod Console full v1+v2 spec (~24.5h)** -- ship the P0/P1 keyboard subset in v10.13 wave 4, defer P2/P3 (j/k navigation, INTEL tab restructure, NOTE char counter, OP DELETES per-row actions, draft protection). (UIUX2-18)
3. **Gear Panel two-column nav-rail redesign (~22.5h)** -- structural rebuild. Defer to v10.14 entirely. v10.13 ships only the [view recent] color fix. (UIUX2-20)
4. **Modmail compose row in 3-col panel** -- requires architectural decision on send-direct path; v11 scope. (UIUX2-40 §F.3)
5. **DR popover batch mode (~3.5h)** -- ship N1/N3/N6 fixes in v10.13; defer batch checkboxes + batch fire to v10.14. (UIUX2-11)
6. **Intel Drawer prose-to-ledger row conversion (~4-6h)** -- inside the Phase 1 IntelDrawer rework above. (UIUX2-22 §D.1)
7. **Auth wizard Drop 2 (step indicator + structured per-mode steps)** -- ship Drop 1 (~3h: auto-attempt, severity colors) in v10.13; defer Drop 2 (~12h) to v10.14. (UIUX2-19 §H.8)
8. **Auto-Unsticky popover health bar + GEAR toggle prominence** (~3h) -- defer; lead-only feature, lower frequency than mod hot-path. (UIUX2-15)
9. **Modmail virtual scrolling / scroll-triggered pagination** (~M effort) -- panel structurally caps at 30 threads. Defer until 100-thread-day becomes regular reality. (UIUX2-40 §E9)
10. **Empty states full migration of all hardcoded surfaces (~8h)** -- ship the API alignment + 7 `renderEmptyState` retire in v10.13; defer 18 hardcoded surface migrations to v10.14. (UIUX2-28)

---

## Section 2 -- Critical-Severity (P0) Matrix

P0 = correctness regression, broken-on-arrival feature, accessibility hard-fail, or shipped-but-inert spec compliance.

| ID | Surface | Finding | File:line | Fix size | Effort | Deps | Affects |
|---|---|---|---|---|---|---|---|
| P0-01 | Stats tab ghost sparkline DOM | 8 tiles render `<div class="pop-stat-spark">` containers with no JS ever writing to them; ~14px dead space per tile | popup.html:75-141 | -8 lines | XS | none | mods, leads |
| P0-02 | Stats tab ghost delta chips | `d-pending`, `d-dr`, `d-banned`, `d-today`, `d-msgs`, `d-notes`, `d-ai`, `d-unsticky` rendered as ghost boxes; `_updateKpiDelta` exists but only wired to Lead KPI | popup.js:756-761 | +30 lines | S | none | all |
| P0-03 | Stats tab inline `style="color:..."` overrides | 6 of 8 tiles hardcode color in HTML, contradict `[data-state]` token system | popup.html:83-140 | -6 lines | XS | P0-04 | all |
| P0-04 | Stats tab CSS specificity war | 4 separate `.pop-stats` rule blocks fighting; 475 `!important` declarations | popup.css L54, L913, L2292 | consolidate | M | none | all |
| P0-05 | Stats tab AI tile drill placeholder shipped | "Per-call log... coming v10.11" in production; v10.12.3 is shipping | popup.js:4229-4248 | replace func | XS | none | all |
| P0-06 | Tokens tab orphaned claim button | `#claimInviteWrap` rendered OUTSIDE `#card-tokens`; primary first-run CTA not in card | popup.html:789-792 | structural | M | P0-07 | first-runs |
| P0-07 | Tokens tab flash-of-wrong-content | `leadStatus` "lead-mod only feature" visible to every mod for ~200ms before whoami resolves | popup.js:1652-1658 | three-state | L | P0-06 | mods |
| P0-08 | Status bar ticker severity tiers inert | CSS `font:600 ... !important` on `.gam-bar-ticker` (L21779) overrides JS `tickerEl.style.fontWeight = ...`; 5 of 7 weight tiers broken | modtools.js L21779 | 4-line CSS | XS | none | all |
| P0-09 | Diag tab IDB read path stale | `renderDiagTab` reads `chrome.storage.local.get('gam_diag_log')`; v10.12.3 moved log to IDB; mods see empty log when errors exist | popup.js diag block | RPC route | M | none | all |
| P0-10 | Diag tab broken `aria-controls` | Diag button declares `aria-controls="tab-panel-diag"` but panel id is `diagTabSection` | popup.html:805 | rename | XS | none | a11y |
| P0-11 | SUS popover chevron reset double-application | Manual `ch.style.transform = ''` conflicts with CSS rule; chevron never rotates on second expand | modtools.js:17806 | -1 line | XS | none | all |
| P0-12 | SUS popover dead [DR Rule] button | Tard rows build button at L17875, no click handler attached | modtools.js:17875 | wire handler | S | none | all |
| P0-13 | SUS popover Unmark regression | v1 promised collapsed strip Unmark; implementation buried in drill panel | modtools.js _buildSusRow | +25 lines | S | none | all |
| P0-14 | DR popover Cancel All snapshot bug | `drList.find()` for undo inverse uses popover-open snapshot; cancels manually-removed entries | modtools.js:18264 | snapshot fix | S | none | all |
| P0-15 | DR popover band re-eval on tick missing | TODOY entry crossing 60min threshold ticks down to `00:59` in amber but stays in TODAY band | modtools.js:18102 | +20 lines | S | none | all |
| P0-16 | DR popover Cancel All no confirm | Single click fires `removeFromDeathRow` for every row; no 2-step confirm | modtools.js cancelAllBtn | confirm gate | S | none | all |
| P0-17 | DR popover undo invisible | `withUndo` wired on Cancel but no toast surface; undo is keyboard-only & undocumented | modtools.js:18196 | snack ext | S | snack ext | all |
| P0-18 | Queue popover wrong link | Data-gap CTA `/queue` goes to user-facing queue, not `/mod/queue` | modtools.js:18556 | 1 char | XS | none | mods |
| P0-19 | Health popover firehose pill flicker | L18678 sets initial `--warn` (blinking amber) then L18726 corrects; 0-1 frame mismatch | modtools.js:18678 | inline class | XS | none | all |
| P0-20 | Health popover scrollbar (Chrome ignores Firefox-only) | `scrollbar-width:thin` is FF-only; Chrome uses `::-webkit-scrollbar` pseudos | modtools.js:18647 | +3 lines | XS | none | all |
| P0-21 | Health popover false-confidence loading | `LAST VERIFY` `--` placeholder renders green by default; mods see all-green KPI tiles during probe | modtools.js:18643 | data-loading | S | none | all |
| P0-22 | Modmail panel cold AI shimmer absent | Panel `aiHost.innerHTML = '⌛ AI drafting...'` plain text; ban/mm tab inline shimmer was backported but panel skipped | modtools.js:16946 | port shimmer | S | none | all |
| P0-23 | Modmail track-response missing on prefetched | Pre-fetched draft useBtn fires clipboard + open but skips `modmailTrackResponse`; AI usage analytics under-reported by ~majority | modtools.js:17227 | wire RPC | XS | none | analytics |
| P0-24 | Modmail draft local-mirror not read | `_mirrorDraftToLocal` writes `gam_modmail_drafts_local` and `gam_macro_drafts_local`; reads only check session; SW restart silently loses every draft | modtools.js:8704, 16700 | +6 lines each | XS | none | all |
| P0-25 | Loading text "Loading..." in HTML | popup.html:815-827 hardcodes 4 instances; race window before JS patches | popup.html:815-827 | strip text | XS | none | all |
| P0-26 | Auth banner no auto-attempt | `init()` shows banner immediately on `__validateModAuth` fail; no preloadSecrets retry first | modtools.js __validateModAuth | +20 lines | S | none | all |
| P0-27 | First-run wizard no GAW link on success | "Refresh greatawakening.win" instructional text but no clickable link | popup.html firstRun success | +1 line | XS | none | first-runs |
| P0-28 | Macros card window.confirm() x2 | `__macroDelete` and `__macroAiSeed` use OS-blocking `window.confirm()` | popup.js:3836, 3879 | inline | M | none | all |
| P0-29 | Macros card duplicate `.gam-macro-tab-active` | popup.css L231 (blue, !important) and L1107 (amber) both target same selector; old wins | popup.css L231-234 | -4 lines | XS | none | all |
| P0-30 | Empty states API split (`ctaFn` vs `ctaAction`) | modtools.js factory uses `ctaAction`; popup.js factory uses `ctaFn`; copy-paste between files breaks | modtools.js, popup.js | shim | S | none | all |
| P0-31 | Tab nav `offsetParent` filter not spec-correct | Skip-hidden filter fragile against future visibility:hidden CSS | popup.js wireTabNav | replace | XS | none | a11y |
| P0-32 | Tab nav stale Lead localStorage | If user lost lead status, popup restores to Lead tab and shows blank panel | popup.js detectInitialTab | guard | XS | none | demotions |

---

## Section 3 -- High-Severity (P1) Matrix

P1 = significant UX regression, deferred-but-claimed v1 promise, motion/PRM gap, or accessibility soft-fail.

| ID | Surface | Finding | File:line | Effort | Deps | Affects |
|---|---|---|---|---|---|---|
| P1-01 | Stats tab Death Row skull emoji alert | `\u{1F480}` color emoji clashes with monochrome terminal; not themable | popup.js:785 | XS | P0-04 | all |
| P1-02 | Tools card emoji on Diagnostics buttons | `&#x1F9EA;` `&#x1F4CA;` violate no-emoji-icons | popup.html:231-232 | XS | none | all |
| P1-03 | Tools card crawl pill 28px below 36px floor | WCAG min target violated | popup.css:1689 | XS | none | a11y |
| P1-04 | Tools card double-indent in subsections | body 14px + subsection 8px + grid 8px = 32px left offset | popup.css:1655 | XS | none | all |
| P1-05 | Tools card `card-badge-tools` permanently hidden | Badge slot exists, no JS ever populates | popup.html:224 | remove or wire | XS | none | hygiene |
| P1-06 | Maint cards: Status card thin (2 items) | Two-item card with full chrome wastes 60px scroll path | popup.html maint cards | merge into Probes | M | none | all |
| P1-07 | Maint cards: Integrity flat 5-button stack | Same wall problem as old monolith, concentrated in highest-risk card | popup.html card-integrity | sub-group | M | none | all |
| P1-08 | Maint emoji buttons | `&#x1F511;` `&#x1F4CA;` `&#x1FA7A;` `&#x1F198;` (Reset SOS!) etc. | popup.html maint cards | strip | XS | none | all |
| P1-09 | Maint status max-width:120px clips | Long status strings clip silently with no ellipsis | popup.css:1780 | CSS fix | XS | none | all |
| P1-10 | Maint button min-height mismatch | row=32px, button=28px; phantom 2px gap | popup.css:1753 | 1 line | XS | none | hygiene |
| P1-11 | Maint card hover-thicken on non-collapsibles | False-affordance: amber rail thickens but no collapse action | popup.css `.gam-card:hover::before` | gate | XS | none | hygiene |
| P1-12 | Maint lead panel uses old CSS classes | `pop-maint-row` not `pop-maint-action-row`; no severity styling | popup.html lead panel | swap classes | S | none | leads |
| P1-13 | Lead card KPI delta no color CSS | `.gam-kpi-delta[data-dir]` rule absent; deltas render monochrome | popup.css after .gam-kpi-delta | +6 rules | XS | none | leads |
| P1-14 | Lead card data-loading state not wired | Pulse animation defined but JS never sets attribute | popup.js __loadLeadKpi | +12 lines | S | none | leads |
| P1-15 | Lead card INCIDENTS hardcoded `0` | False precision; V11 mod_incidents not built | popup.js:5982 | -3+5 lines | XS | none | leads |
| P1-16 | Lead card sub-panel status spans empty | 4 of 5 sub-panel `<span class="sub-status">` never written | popup.js __loadLeadKpi | +30 lines | S | none | leads |
| P1-17 | Lead card spacing rhythm asymmetric | KPI 8/4/4 inter-element gaps; should be 6/6/6 | popup.css | 3 changes | XS | none | leads |
| P1-18 | Lead card inviteBtn dual handlers | `inviteBtn` (sub-panel) + `qaInviteBtn` (Quick Actions) both wire to adminInviteCreate | popup.js:1761 | unify | S | none | leads |
| P1-19 | Diag tab no virtualization | At 500 entries naive renderer creates 1500 DOM nodes synchronously | popup.js renderDiagTab | full rewrite | L | P0-09 | leads |
| P1-20 | Diag tab no filter/search | Mod cannot filter by severity or text-search | popup.js renderDiagTab | toolbar | L | P1-19 | all |
| P1-21 | Diag tab monolithic textContent blobs | 4 sections render as multi-line textContent on a single div | popup.js renderDiagTab | decompose | M | P1-19 | all |
| P1-22 | Tab nav badge dot not generalized | One-off inline JS; no `window.modTabBadge.set()` API | popup.js detectInitialTab | refactor | S | none | all |
| P1-23 | Status bar emoji icons | `fbBtn` `gearBtn` `inboxBtn` `peopleBtn` `tardBtn` use emoji | modtools.js bar buttons | replace | M | none | all |
| P1-24 | Status bar OP_DEL hardcoded hex | `'#ff3b3b'` not `var(--bb-red, #ff3b3b)` | modtools.js:19082 | XS | none | hygiene |
| P1-25 | DR popover countdown format jump at 60min | `1h 0m` -> `59:31` jarring at exact band boundary | modtools.js:18062 | +5 lines | XS | none | all |
| P1-26 | Queue popover author overflow at 380px | No max-width / ellipsis on author span | modtools.js:18345 | 1 line | XS | none | all |
| P1-27 | Queue popover Refresh during load fires twice | No disabled state on refreshBtn during RPC | modtools.js:18083 | wire .finally | XS | none | all |
| P1-28 | Health popover firehose ARMED state never wired | UIUX-12 spec'd warn pill on local/D1 mismatch | modtools.js:18712 | new fn | S | none | leads |
| P1-29 | Health popover empty-state for `recent_actions:[]` | Feed silently collapses; worse than shimmer | modtools.js:18791 | +5 lines | XS | none | all |
| P1-30 | Health popover KPI 999+ truncation | `actions_24h:1500` overflows tile | modtools.js _setTile | +1 line | XS | none | hygiene |
| P1-31 | Active Mods no idle/active hierarchy | Flat list; mod seen 23h ago looks like 4m ago | modtools.js _showActiveModsPopover | tiers | M | none | leads |
| P1-32 | Active Mods sort order | Server-order not recency-desc | modtools.js | 1 sort | XS | none | leads |
| P1-33 | Active Mods page-path not clickable | 32-char silent truncation, no ellipsis, no link | modtools.js | DOM | S | none | leads |
| P1-34 | Auto-Unsticky ticker no age annotation | `3 AUTO Q` count-only; no oldest-pending age | modtools.js _pollAutoPendingCount | +5 lines | S | none | leads |
| P1-35 | Auto-Unsticky GEAR toggle prominence | Buried in 10+ identical toggles; OFF by default unannounced | modtools.js openSettings | new style | S | none | leads |
| P1-36 | Auto-Unsticky popover anchor bug | Hardcoded ticker anchor; from GEAR appears at bottom of screen behind modal | modtools.js:11286 | param | XS | none | leads |
| P1-37 | Modmail panel intel strip race | Rapid thread switching: thread A's async fires after B mounts | modtools.js:17022 | capture | S | none | all |
| P1-38 | Modmail panel AI 2-col grid in 320px | Cards wrap 6 lines at 146px each | modtools.js:16976 | clamp | S | none | all |
| P1-39 | Modmail tone color firm/error conflict | `#ff3b3b` used for both AI firm tone and error states | modtools.js GAM_TONE_COLOR | shift hex | XS | none | all |
| P1-40 | Modmail send button drop arrow emoji on reset | Reset label "Send message" loses original "↩️ Send message" | modtools.js:9973 | 1 char | XS | none | hygiene |
| P1-41 | Auth wizard no severity colors | All failure modes red; no triage hierarchy | modtools.js __showAuthFailBanner | severity | S | none | all |
| P1-42 | Auth wizard whoami_empty no dedicated branch | Falls through to generic; partially-wrong steps | modtools.js reasonSteps | branch | XS | none | all |
| P1-43 | Auth wizard short_token lumped with no_token | Different remediation conflated | modtools.js reasonSteps | branch | XS | none | all |
| P1-44 | Gear panel [view recent] color | `#4A9EFF` (blue/form) used at brand-role link | modtools.js:11258 | swap to amber | XS | none | hygiene |
| P1-45 | Gear panel auto-unsticky toggle dual confusion | Two near-identically-named toggles, no warning if both on | modtools.js openSettings | warning | S | none | leads |
| P1-46 | Visual hierarchy 5-color rainbow on stats grid | 8 tiles, 5 colors, no semantic meaning | popup.html stats | normalize | XS | P0-03 | all |
| P1-47 | Type scale 8px in JS-injected (off-grid) | 4 occurrences in DR/queue chips | modtools.js | snap to 9 | XS | none | hygiene |
| P1-48 | Type scale 10.5px in macro editor | Off-grid | modtools.js:15450 | snap to 10 | XS | none | hygiene |
| P1-49 | Type scale 12.5px in modmail body | Off-grid | modtools.js:15851 | snap to 12 | XS | none | hygiene |
| P1-50 | Type scale 18-20px close x buttons | 18px and 20px both used | modtools.js:15826, 20039 | snap to 16 | XS | none | hygiene |
| P1-51 | Spacing 5px hardcoded x3 (charter violation) | gap:5px in card-grid2; padding:5px in maint btn; 5px 12px in empty-cta | popup.css:1655, 1753, 2095 | 4->5 swap | XS | none | hygiene |
| P1-52 | Spacing `--bb-s3 = 6px` (token off-grid) | Token itself violates the 4/8/12/16 grid | popup.css :root | s3=4px | S | broad | hygiene |
| P1-53 | Click target `.gam-bar-icon` 22x22px | 20+ status bar buttons below 32px AA-tight floor | modtools.js:20408 | ::after ext | M | none | a11y |
| P1-54 | Click target `.gam-t-act` 22x22px | Triage row action buttons | modtools.js:20606 | ::after ext | S | none | a11y |
| P1-55 | Click target `min-height:0!important` overrides | 5 popup.css rules actively sabotage Bloomberg 28px floor | popup.css | -5 lines | XS | none | a11y |
| P1-56 | Empty states 7 `renderEmptyState` flag-gated | Feature-flagged with `__uxOn()`; degrades to plain text on flag-off | modtools.js | replace | S | P0-30 | all |
| P1-57 | Empty states `actions-empty` icon meaning | Plus-cross SVG semantically reads as "add" not "empty" | modtools.js _GAM_EMPTY_SVG | replace | XS | none | hygiene |
| P1-58 | Loading `_diag*` panels: paragraph skeleton vs mono-block content | 3 lines vs 8-15 lines; layout shift | popup.js wireDiagSkeletons | new variant | M | P0-09 | all |
| P1-59 | Error messages opaque 'Remove failed' x4 | All four NBA catch blocks discard `e.message` | modtools.js:6166-10424 | +catch | XS | none | all |
| P1-60 | Error messages 'Action failed' generic | NBA catch loses action name | modtools.js:6133 | thread name | XS | none | all |
| P1-61 | gamMakeError missing `hint` x2 | popup.js loadStats and loadMacros | popup.js:795, 3741 | +hint | XS | none | all |
| P1-62 | Micro-interactions undo countdown invisible | 20s undo window has no visual countdown signal | modtools.js | conic ring | M | none | all |
| P1-63 | Micro-interactions tab :active state missing | 80ms press window unfeedbacked | popup.css .pop-tab | 3 lines | XS | none | a11y |
| P1-64 | Micro-interactions ban preflight enable signal | Disabled->enabled transition has no shadow pulse | modtools.js preflight | +keyframe | S | none | all |
| P1-65 | Copy/voice "Are you ABSOLUTELY sure" | Double-confirm + caps shout, melodramatic | modtools.js (chat wipe) | collapse | S | none | hygiene |
| P1-66 | Copy/voice 'Bug report ... Commander will see it shortly' | Marketing voice in operator console | modtools.js bug report snack | rewrite | XS | none | hygiene |
| P1-67 | Keyboard `showModal` no focus trap | Help, Settings, Mod Log, Mod Console leak Tab | modtools.js showModal | wrap | S | none | a11y |
| P1-68 | Keyboard ESC tooltip not in cascade | Pinned tooltip persists after ESC | modtools.js global keydown | +check | XS | none | a11y |
| P1-69 | Keyboard popup drill no j/k row nav | Tab-only through every row | popup.js drill | +keydown | M | none | a11y |
| P1-70 | First-run no status bar tooltip tour | Bar appears with zero introduction | modtools.js init | tour | M | none | first-runs |

---

## Section 4 -- Conflict Resolution

Audits proposed conflicting fixes. The CTO picks the winner with reasoning. "DECISION NEEDED" is reserved for genuinely unresolvable cases.

### CONFLICT 1: AMBER vs WARN-STATUS hex unification

- UIUX2-23 §B.3 says "two amber values, defensible as layer boundary if both clearly mean 'brand'."
- UIUX2-25 §C says split into `--bb-amber` (brand chrome) + `--bb-warn-status` (`#f59e0b` proposed) for warning state.

**Winner: UIUX2-25.** Rationale: the audits agree amber is doing 15+ jobs; the only defensible fix is splitting brand from warning. UIUX2-23 is a migration audit -- it just records drift. UIUX2-25 is the semantic spec. Implement two tokens.

**Implementation:** Add `--bb-warn-status: #f59e0b` to popup.css. Migrate `.pop-maint-action-status.warn`, `.age.yellow`, `gam_maint_warning` chip, modmail status chip, `sev='danger'`. Leave `--bb-amber` and `C.WARN` alone for v10.13 -- their hex unification is v10.14 hygiene.

### CONFLICT 2: Lead surfaces -- TEAL vs PURPLE vs YELLOW

- UIUX2-25 §D.3 says move all lead surfaces to new `--bb-teal: #14b8a6`, freeing purple for AI/automation only and yellow for watch-list only.
- UIUX2-06 (Lead Card) keeps purple semantics for the deep-dive structure.
- ModChat currently uses yellow for lead identity (`.gam-mc-lead`).

**Winner: UIUX2-25 -- defer execution to v10.14.** Rationale: introducing teal is a 10-line CSS change but it touches lead card rail, lead inputs, lead context, ModChat threads. The visible-color shift on a high-stakes surface (lead card) without QA dedicated to it is risky for v10.13. Add the token. Don't migrate callsites.

**Decision in v10.13:** Add `--bb-teal` token + `C.TEAL` constant. No callsite migration. v10.14 dedicated wave handles the migration with visual QA.

### CONFLICT 3: Spacing token `--bb-s3` -- 6px or 4px

- UIUX2-27 §D Priority 4 says fix `--bb-s3: 6px → 4px`. This auto-migrates all `var(--bb-s3)` uses. ~8 sites tighten from 6 to 4.
- This conflicts with multiple deep-dive audits that assume current padding is correct (they didn't audit at the token level).

**Winner: UIUX2-27.** Rationale: 6px is a charter violation. The token is the root cause. Single-line token edit + visual spot-check is the right move. The 8 propagated sites tighten by 2px each -- visually reasonable at Bloomberg dense.

**Implementation:** Wave 2 (Spacing Normalization). Token edit + manual spot-check at the 8 callsite locations.

### CONFLICT 4: Stats grid layout 3-col vs 4-col

- UIUX2-01 §C visual mockup shows 4-column grid (8 tiles in 2 rows of 4).
- UIUX2-22 §D.9 says "fill or rationalize the empty 8th-slot asymmetry," recommends 4-column.
- Current state: 3-column with empty bottom-right cell.

**Winner: 4-column.** Rationale: both audits independently arrive at the same conclusion. 4-col fills the 8 tiles cleanly with no asymmetry, matches Bloomberg ledger convention, and on 380px gives ~95px per tile (acceptable for 4 chars max value).

**Implementation:** Wave 1 (Stats tab). `grid-template-columns: repeat(4, 1fr)`. Tile padding adjusts to ~10-12px horizontal.

### CONFLICT 5: Modmail AI cards 2-col vs 1-col stack

- UIUX2-16 §B.4 recommends single-column in 320px AI panel.
- UIUX2-40 §F.1 also recommends 1-col stack.

**Winner: 1-col stack.** Both audits agree. 2-col at 146px-each-card with pre-wrap text wraps body to 6 lines. 1-col at 300px-card width is reasonable height with 2-3 line clamp.

**Implementation:** Wave 4 (Modmail). `grid-template-columns: 1fr` in `renderAICards`.

### CONFLICT 6: Death Row tile color

- UIUX2-21 §C.4 says keep purple (queue/scheduled state).
- UIUX2-25 §D.6 says move to yellow (watch-list/surveillance tier; DR is human-initiated extended-watch).
- UIUX2-01 default uses purple.

**Winner: Keep purple for v10.13. Revisit with UIUX2-25 semantic split in v10.14.** Rationale: changing DR pill color is high-visibility for leads. UIUX2-25 §D.6 is correct semantically but the migration carries visual surprise. Defer with the broader teal/purple/yellow rebalancing.

### CONFLICT 7: Mod Console DANGER color hex

- UIUX2-18 §H says use `C.RED = #f04040` (existing) for all MC danger. Reject v1's `#e03030`.
- popup.css uses `--bb-red: #ff3b3b`.
- Diag tab error uses `#ff3b3b` hardcoded.

**Winner: `C.RED = #f04040` for content-script (Mod Console etc.), `--bb-red = #ff3b3b` for popup.** Acceptable layer split. UIUX2-25 §C confirms the dual-token approach as the layer boundary. v10.13 does NOT unify; v10.14 may unify under `--bb-warn-status` discipline.

### CONFLICT 8: Empty states `ctaFn` vs `ctaAction` parameter name

- UIUX2-28 says align both files to `ctaFn` (popup.js convention).
- modtools.js `gamMakeEmpty` uses `ctaAction`.

**Winner: `ctaFn` everywhere with backward-compat shim.** Add 5-line shim to modtools.js `gamMakeEmpty` accepting either. Migrate over time. Newer convention is shorter.

### CONFLICT 9: Click-target floor 32px vs 44px

- UIUX2-34 says 32px AA-tight is pragmatic for desktop extension; raise via `::after` inset, not box growth.
- UIUX2-03 §D.3 says crawl pills 28→36px (still below 44px AAA, calls it Bloomberg-density compromise).
- Some surfaces (`.pop-actions`) already at 44px.

**Winner: 32px floor with `::after` extension pattern; primary CTAs at 44px.** Rationale: ::after extension preserves Bloomberg dense visual, gives a11y compliance. Primary actions (Stats action grid) stay at 44px.

**Implementation:** Wave 5 (Click-target compliance). Apply `::after { inset:-5px }` pattern to `.gam-bar-icon`, `.gam-t-act`. Bloomberg button base bump 28→32px. Remove `min-height:0!important` overrides.

### CONFLICT 10: Status card merge into Probes vs keep with substance

- UIUX2-05 §B presents Option A (merge: 4 cards → 3) and Option B (keep, give substance via fallback/maint chips).

**Winner: Option A (merge).** Rationale: 380px is a hard width budget. Two-item Status card costs ~60px for chrome. Merge eliminates a full card header from scroll path. Move Safe Mode + Feature Health to top of Probes under "SYSTEM STATE" sub-label.

**DECISION NEEDED ITEMS** (genuinely unresolvable without Commander input):

### DECISION-1: Integrity card header color tier (UIUX2-25 §D.2)

Current: amber. The amber-on-amber conflict means Integrity reads as "brand" not "high-risk." Two paths:
- (a) `--bb-warn-status` for integrity (warning/threshold tier).
- (b) `--bb-teal` for integrity (human-authority-tier).

**Recommended default for v10.13: option (a) warn-status.** Integrity ops are threshold-of-risk operations, not authority-tier. Lead-only ops (Audit Verify, Roster Staleness) get teal in v10.14. Commander can redirect.

### DECISION-2: Severity-tier text on auth banner (UIUX2-19 §E)

Current: all failures red. Audit proposes 4 severity tiers (setup amber, connectivity yellow, credential amber, unknown red). The recommendation maps `no_token` to setup (amber) -- but Commander may consider missing-token a hard error per existing design.

**Recommended default: ship UIUX2-19 §E as proposed.** Ship 4-tier color system. Easily revertible if Commander disagrees with `no_token` being amber not red.

---

## Section 5 -- v10.13 Implementation Waves

5 parallel-executable waves. Each wave is one focused commit batch executable by one Sonnet agent in one session.

### WAVE 1 -- TOKEN-FOUNDATION-AND-STATS-HONESTY

**Scope:** Schema additions, Stats tab full v2 rewrite, status bar P0 fixes, type/letter-spacing snap-to-grid for popup.css.

**Files touched:** popup.html (stats grid + structural), popup.css (tokens + stats + nav + footer + drill toolbar `min-height` fixes), popup.js (loadStats + delta wiring + sparkline injection + drill empty AI), modtools.js (ticker `!important` removal + opdel hex fix).

**Line budget:** ~250 net diff (popup.html -50, popup.css -100/+100, popup.js +120, modtools.js +5).

**Effort:** 8h.

**Dependencies:** None. First wave; everything else builds on this.

**Acceptance criteria:**
- Stats tab grid is 4-column.
- All 6 local-data tile delta chips render directional `+N ^` / `-N v` / `=` after second open.
- Activity tiles (Bans/Msgs/Notes /24h) inject sparkline DOM only when 7d data > 0.
- Inline `style="color:..."` removed from all 8 tiles; `data-state` drives color.
- AI tile drill renders honest empty state ("Per-call log unavailable") not version-shipped placeholder.
- Death Row alert renders SVG warning icon (no skull emoji).
- Ticker severity weight tiers (quiet/queue/auto/sus/opdel) render at correct 400/500/700 weight.
- OP_DEL ticker uses `var(--bb-red)` not raw hex.
- 4 `Loading...` strings stripped from popup.html diag divs.
- Off-grid 5px values in popup.css (3 sites) replaced with 4px.
- Off-grid 8px font-size in modtools.js (4 sites) snapped to 9px.
- New tokens declared in popup.css `:root`: `--bb-blue: #4A9EFF`, `--bb-warn-status: #f59e0b`, `--bb-teal: #14b8a6`, `--bb-t-stat-md: 20px`, `--bb-t-stat-lg: 28px`. New constants in modtools.js: `C.TEAL = '#14b8a6'`. **No callsite migration -- schema only.**
- Visual QA: open popup, confirm stats tab reads correctly on first open AND re-open (delta chip diff visible).

---

### WAVE 2 -- TOKENS-TAB-THREE-STATE-AND-AUTH-WIZARD

**Scope:** Tokens tab structural refactor (state A/B/C), auth wizard severity colors + auto-attempt + whoami_empty branch + short_token branch, first-run wizard "Open GAW" link.

**Files touched:** popup.html (tokens tab full rewrite), popup.css (`tok-onboard`, `tok-banner`, `tok-mgmt-details`, `tok-lead-sep`, `tok-error-block` block), popup.js (`__tokSetState`, `__tokUpdateBanner`, `__applyTierGate` patch, first-run "Done" path adds `Open GAW`), modtools.js (`__showAuthFailBanner` per-mode severity + auto-hydrate before show + new `whoami_empty` `short_token` branches).

**Line budget:** ~400 net diff (popup.html +50/-100, popup.css +200, popup.js +100, modtools.js +150).

**Effort:** 9h.

**Dependencies:** Wave 1 (`--bb-blue`, `--bb-warn-status` tokens declared).

**Acceptance criteria:**
- Tokens tab renders exactly one of three states (A/B/C) post-whoami.
- `#claimInviteWrap` orphan absorbed into `#tokStateFirstRun` State A primary CTA.
- `#firstRunWizardStep1` references purged.
- `#leadSection` moved inside `#tokStateReturning` (no flash-of-lead-content for non-leads).
- State B verified-banner shows: username, tier, ENC chip, age (60-89d amber, ≥90d red rotate-now).
- Wizard success screen has full-width "Open greatawakening.win" button.
- Auth banner: 4 severity color tiers (setup amber, connectivity yellow, credential amber, unknown red).
- Auth banner: auto-attempts `preloadSecrets() + sync + revalidate` before showing; suppress if recovers within ~150-400ms.
- `whoami_empty` has dedicated reasonSteps branch.
- `short_token` has dedicated reasonSteps branch (not lumped with `no_token`).
- E2E: open extension fresh (no token) -> wizard. Save valid token -> State B. Whoami fail -> red banner with retry. Token age >90d -> red expired banner + inline rotate.

---

### WAVE 3 -- POPOVER-FIXES-PACK

**Scope:** SUS, DR, Queue, Health, Active Mods popover P0/P1 fixes. Plus snack action button extension (the `withUndo` toast surface for DR).

**Files touched:** modtools.js (popover bodies + snack helper extension).

**Line budget:** ~600 net diff.

**Effort:** 8h.

**Dependencies:** None. Pure modtools.js changes.

**Acceptance criteria:**

SUS popover:
- Chevron reset bug fixed (1 line removal).
- Tard divider padding aligned (`6px 10px 4px`).
- `[DR Rule]` button wires `modAutoRuleAdd` RPC (with localStorage fallback).
- Unmark button visible on collapsed strip (2-click recovery from accidental SUS).
- DR button label reads "DR 72h" not bare "DR".
- `[⋯]` button removed (deceptive single-link affordance).
- Focus trap installed.

DR popover:
- Cancel All gets 2-step confirm gate (3s auto-revert).
- Cancel All snapshot bug fixed (snapshots at cancel time, not popover-open).
- Band re-eval fires on tick when row crosses threshold.
- Countdown format `MM:SS` extends to 90min (not 60min) -- eliminates jarring `1h 0m` -> `59:31`.
- Undo toast surfaces via extended `snack(msg, type, opts)` with `actionLabel`/`onAction`/`actionDurationMs` -- 10s countdown.
- `gamMakeEmpty('dr-empty', ...)` icon resolved (or fallback to `'queue'`).

Queue popover:
- Data-gap link `/queue` -> `/mod/queue`.
- Author span max-width 120px + ellipsis.
- Refresh button disabled during RPC.
- Retry button added to data-gap body.

Health popover:
- Firehose pill correct initial class (no flicker).
- Pill min-width 68px (no STANDBY/UNREACHABLE reflow).
- WebKit scrollbar styling added.
- Feed row hover state added.
- Empty-state row when `recent_actions:[]`.
- KPI 999+ cap on values >= 1000.
- "LAST VERIFY" -> "VERIFY" label (fits 95px tile).
- `data-loading` attribute drives neutral dim color on stub tiles.
- Firehose ARMED state wired (local/D1 mismatch).

Active Mods popover:
- Tier classification: active (<30m) / idle (30m-4h) / stale (>4h).
- Colored presence dot per tier.
- Sort by recency descending.
- Section dividers ACTIVE (n) / IDLE (n) / EARLIER.
- Page-path clickable link, max 40 chars + ellipsis.
- Mod count `(n)` in header.
- Time-ago "now" for <60s.
- Segmented control wrapper for window selector.
- aria-pressed on window buttons; aria-label on close.

E2E:
- Open SUS popover from ticker -> click [DR 72h] on a row -> snack with [UNDO 10s] -> click UNDO before 0 -> entry restored.
- Open DR popover -> Cancel All -> Confirm prompt -> auto-revert at 3s.
- Open Queue popover -> data-gap state shows [Open /mod/queue ->] and [Retry] buttons.

---

### WAVE 4 -- MOD-CONSOLE-KEYBOARD-PLUS-MODMAIL-CRITICALS

**Scope:** Mod Console P0 keyboard ergonomics, BAN tab danger color, UNBAN demotion. Modmail action bar Mark SUS / DR 72h. Modmail panel cold AI shimmer. Modmail draft local-mirror read on cold session. Modmail prefetched track-response wiring. Modmail intel race fix. Macros card window.confirm purges + duplicate `.gam-macro-tab-active` removal.

**Files touched:** modtools.js (Mod Console keyboard handlers + modmail bar + panel renderDetail/AI + macros card v2), popup.js (macros card v2 panel), popup.css (macros styles).

**Line budget:** ~800 net diff.

**Effort:** 9h.

**Dependencies:** None. Wave 3 snack extension is reused but not blocking.

**Acceptance criteria:**

Mod Console:
- Number keys 1-6 switch tabs (with input/select/textarea/`.gam-mc-dur` guards).
- Tab labels show number prefix in inactive state ("1·INTEL", "2·BAN", etc.).
- Ctrl+Enter in BAN tab fires `mc-ban-go.click()`.
- Ctrl+Enter in NOTE tab fires `mc-note-save.click()`.
- Ctrl+Enter in MESSAGE tab fires `mc-msg-send.click()`.
- BAN tab gets `.gam-mc-tab-danger` class (red inactive at 70% opacity, full red active).
- UNBAN button removed from `.gam-mc-actions`. Demoted to ghost link below status div: "already banned -- unban instead" green underline.
- OP DELETES tab time-filter dropdown (6h/24h/48h/7d).
- OP DELETES tab "Open post" + "Open console" buttons per row.
- OP DELETES tab `was_in_queue` chip styled (not raw emoji).

Modmail (mod hot-path):
- gam-mm-bar gets two new buttons: [Mark SUS] (calls `modSusMark`) and [DR 72h] (calls `addToDeathRow`).
- Panel `aiHost` gets 4-ghost shimmer grid on cold AI fetch (port of ban_msg L8834 pattern).
- Panel `renderDetail` reads `gam_modmail_drafts_local` on session cache miss (TTL 24h).
- Panel `__renderDrafts` useBtn fires `modmailTrackResponse` with `ai_used:1, ai_tone`.
- Intel strip `_renderIntelStrip` captures strip element + isConnected guard before async write.
- Send button reset preserves "↩️ Send message" emoji.
- AI cards single-column in 320px col 3.

Macros card:
- `window.confirm()` x2 replaced with inline UI (delconfirm row state for delete; AI suggestion review panel for AI seed).
- Duplicate `.gam-macro-tab-active` block at popup.css:231-234 removed.
- Filter bar (search + sort name/use/date) above list.
- Inline edit form slides above list (not appends below).
- Hover-revealed action trio (edit/duplicate/delete) per row.

Macro card row state machine:
- 4s countdown bar on delete confirm; auto-cancel on timeout.
- AI review panel: checkbox list, SAVE SELECTED (N) updates count.

E2E:
- Open Mod Console, press 2 -> BAN tab visible. Type message, Ctrl+Enter -> ban submits.
- BAN tab inactive: red 70% color. Active: full red border + label.
- Modmail bar: [Mark SUS] click marks user SUS without opening Mod Console.
- Open modmail panel after browser restart -> drafts restore from local mirror with "Draft restored" chip.

---

### WAVE 5 -- HYGIENE-AND-A11Y-PASS

**Scope:** Click-target compliance (`::after` extensions), `min-height:0!important` removal, Bloomberg button base 28→32px, copy-to-clipboard utility (`copyWithPulse`), tab `:active` state, motion token PRM gates (gam-arm-fill, gam-dr-cd-pulse), error message remediation hint additions. Empty states API alignment + 7 `renderEmptyState` retire.

**Files touched:** popup.css (a11y rules + button base), modtools.js (`copyWithPulse` utility, `_gamShowExtOrphanedBanner` flush, snack action buttons hover, error message catches), popup.js (gamMakeError missing hints).

**Line budget:** ~400 net diff.

**Effort:** 6h.

**Dependencies:** None. Independent fixes.

**Acceptance criteria:**

Click-target:
- `.gam-bar-icon` gets `position:relative; ::after { inset:-5px }` -- 32px tap zone, 22px visual.
- `.gam-t-act` gets `position:relative; ::after { inset:-6px }` -- 34px tap zone within 34px row.
- Bloomberg button base `min-height: 28px → 32px` in popup.css.
- `min-height:0!important` removed from `.chip-expand`, `.gam-stale-refresh`, `.pop-drill-filter`, `.pop-drill-sort`, `.pop-drill-export` (5 lines deleted).
- `.pop-drill-close` gets `min-width:32px; min-height:32px`.
- `.gam-ctx-item` `min-height:32px`.
- `.gam-tip-ctrl-x` `min-width:32px; min-height:32px`.

Copy + Clipboard:
- `copyWithPulse(btn, text)` utility in modtools.js: writes to clipboard with 3-layer fallback, swaps button label to "COPIED" for 1200ms, applies `gam-copy-flash` keyframe (rgba(61,214,140,0.22) → transparent over 800ms).
- All token copy buttons in popup, debug dump, AI card copy use the utility.

Micro-interactions:
- `.pop-tab:active { background: rgba(255,153,51,0.12); transition: background 80ms linear; }` added.
- `gam-arm-fill` keyframe wrapped in `@media (prefers-reduced-motion: no-preference)`.
- `gam-dr-cd-pulse` keyframe wrapped in same.
- `gam-ai-skeleton::after` shimmer wrapped in same.
- `.gam-sh2-feed-shimmer` added to PRM block at modtools.js:22185.

Error messages (no architectural change, just message quality):
- 4 `'Remove failed'` snacks include `e.message` + remediation.
- `'Action failed'` NBA generic threads action name.
- `'Note save failed'` becomes inline `gamMakeError` soft in note panel.
- `popup.js loadStats` and `loadMacros` `gamMakeError` calls add `hint:` field.
- 'Bug report ... Commander will see it' replaced with terse `Bug report submitted · ID: ${id}`.
- Double-confirm chat wipe collapsed to single "Wipe all team chat? This cannot be undone."

Empty states:
- `gamMakeEmpty` shim accepts `ctaFn || ctaAction`.
- 7 `renderEmptyState` callsites migrated to `gamMakeEmpty`.
- `actions-empty` icon retired or renamed.

E2E:
- Tab through popup with keyboard -- all buttons receive focus ring; no Tab leaks to page.
- ESC with pinned tooltip dismisses tooltip first, then panel.
- Copy any token in popup -> button briefly shows "COPIED" + green flash.

---

### Wave summary

| Wave | Focus | Effort | Dependencies | Risk |
|---|---|---|---|---|
| 1 | Token foundation + Stats honesty + Ticker | 8h | none | Low (mostly additive) |
| 2 | Tokens 3-state + Auth wizard | 9h | W1 (tokens) | Medium (auth UX visible change) |
| 3 | Popover fixes pack | 8h | none | Low (popover surfaces are well-isolated) |
| 4 | Mod Console + Modmail criticals + Macros | 9h | none | Medium (Mod Console keyboard touches global handler) |
| 5 | Hygiene + A11y pass | 6h | none | Low (mechanical edits) |
| **Total** | | **40h** | | |

**Parallelization:** Waves 1, 3, 4, 5 can run in parallel after a brief Wave-1 token-schema commit. Wave 2 must wait for Wave 1 token schema declaration but only the schema -- not the migration. Realistically, Waves 1+3+5 can be 3 Sonnet agents simultaneously; Wave 2 lands after Wave 1's first commit; Wave 4 lands after Wave 3 (snack extension is shared infra).

**Recommended sequence for deployment:**
1. Wave 1 (8h) ships first as v10.13.0.
2. Wave 3 ships as v10.13.1.
3. Wave 5 (parallel-safe with W3) ships as v10.13.2.
4. Wave 2 ships as v10.13.3.
5. Wave 4 ships as v10.13.4.

This staggered ship lets Commander dogfood each wave before the next lands. Total: 5 versioned ships in v10.13.

---

## Section 6 -- v10.14+ Deferred Backlog

| ID | Item | Effort | Reason for defer |
|---|---|---|---|
| D-01 | Intel Drawer Phase 1: 4 cards + Action Strip | ~16h | UIUX2-17 -- highest-impact UX win but exceeds v10.13 budget |
| D-02 | Intel Drawer Phase 2-4: history sub-tabs, AI decoupling, notes Quote | ~10h | Continuation of D-01 |
| D-03 | Mod Console P2-P3: j/k QUICK nav, INTEL 2-col, NOTE char counter, draft protect | ~15h | UIUX2-18 -- v10.13 ships only P0/P1 keyboard subset |
| D-04 | Gear Panel two-column nav-rail rebuild | ~22.5h | UIUX2-20 -- structural rebuild, defer fully |
| D-05 | DR popover batch mode (checkboxes, batch fire/cancel) | ~3.5h | UIUX2-11 -- v10.13 ships only N1/N3/N6 fixes |
| D-06 | Auth wizard Drop 2 (step indicator, structured per-mode steps, tooltips) | ~12h | UIUX2-19 -- Drop 1 ships in W2; Drop 2 needs feature flag rollout |
| D-07 | Auto-Unsticky: popover health bar, GEAR prominence, retry button | ~3h | UIUX2-15 -- lead-only, lower frequency |
| D-08 | Modmail virtual scroll / scroll-triggered pagination | ~M | UIUX2-40 -- 100-thread day not yet regular |
| D-09 | Modmail compose row in panel + send-direct proxy | ~XL | UIUX2-40 -- v11 architectural decision needed |
| D-10 | Empty states: 18 hardcoded surface migrations | ~6h | UIUX2-28 -- v10.13 ships API alignment + 7 retire only |
| D-11 | Diag tab full virtual log + filter pills + filter input | ~4h | UIUX2-07 -- v10.13 ships only IDB read fix |
| D-12 | Modmail panel AI cards body in closure not data-attribute | ~2h | UIUX2-16 -- DOM bloat optimization |
| D-13 | Color semantics teal migration: lead surfaces purple/yellow → teal | ~3h | UIUX2-25 -- visual change, needs visual QA wave |
| D-14 | Color semantics warn-status migration callsites | ~2h | UIUX2-25 -- depends on D-13 visual QA |
| D-15 | Spacing: full GAM_CSS Bloomberg override block | ~1h | UIUX2-27 -- additive override, not blocking |
| D-16 | Maint cards: merge Status into Probes (Option A) | ~45min | UIUX2-05 -- structural; ship after token wave settles |
| D-17 | Maint cards: Integrity sub-grouping (EMERGENCY/REPAIR/DESTRUCTIVE) | ~30min | UIUX2-05 -- with D-16 |
| D-18 | Stats grid 4-col + spark bars wired to log data | included in W1 | UIUX2-01 -- ships in W1 |
| D-19 | Tab nav: badge dot generalized API (`window.modTabBadge.set`) | ~30min | UIUX2-08 §H.3 -- enables Stats/Lead/Diag tab badges |
| D-20 | Tab nav: focus trap consolidation in popup.js | ~1h | UIUX2-08 §D.1 |
| D-21 | Modmail intel sender hover card (expanded data on hover) | ~M | UIUX2-40 §C.6 -- v.next |
| D-22 | First-run: in-popup install guide accordion + status-bar tooltip tour | ~3h | UIUX2-36 §E -- onboarding polish |
| D-23 | Lead daily: lead first-run feature checklist banner | ~1h | UIUX2-38 §F.1 -- new-lead orientation |
| D-24 | Status bar emoji icon SVG replacement | ~3h | UIUX2-09 §B7 -- 5 icons; non-trivial assets |
| D-25 | Maint emoji button strip (4-5 buttons) | ~XS | UIUX2-05 §H.3 -- ship as part of D-16 if convenient |
| D-26 | Stats tab: remove 4-col empty asymmetry | included in W1 | UIUX2-22 §D.9 |
| D-27 | Drill rows: timestamp 90→72px + status pill min-width | ~10min | UIUX2-22 §D.3 -- low priority |
| D-28 | DR drill: row-background banding by status | ~45min | UIUX2-22 §D.4 -- low priority |
| D-29 | Loading: `mono-block` skeleton variant for diag panels | ~30min | UIUX2-29 §C.1 -- depends on Diag rebuild |
| D-30 | Recovery: network offline banner at 60s sustained outage | ~2h | UIUX2-39 §E.4 -- low frequency |
| D-31 | Recovery: quota exceeded warning in status + diag | ~1.5h | UIUX2-39 §E.5 -- rare |
| D-32 | Recovery: undo window expiry notification | ~30min | UIUX2-39 §E.7 -- polish |
| D-33 | Recovery: SUS unmark withUndo Tier B 5s | ~45min | UIUX2-39 §E.3 -- ships easily but lower priority |
| D-34 | Macros card kind toggle in edit form | included in W4 | UIUX2-04 §B2.8 |
| D-35 | All `var(--bb-font)` JS-injected callsites use full fallback | ~2h | UIUX2-26 §D -- font-stack discipline |
| D-36 | Push letter-spacing px values → em tokens | ~3h | UIUX2-26 §C -- discipline pass |
| D-37 | Color semantics ENC chip honest read (vs hardcoded `encrypted:true`) | ~XS | UIUX2-02 H.6 -- minor |
| D-38 | Welcome celebration toast timing audit | ~XS | UIUX2-02 H.5 |
| D-39 | Auth wizard `gam_pending_wizard_reason` session routing | ~2h | UIUX2-19 §H.5 -- coupled with Drop 2 |
| D-40 | Modmail panel scroll-triggered pagination (separate from virtual) | ~M | UIUX2-40 §E9 -- ship before D-08 |

---

## Section 7 -- Spec Deviations to Repair (REGRESSION FROM CLAIMED DONE)

These are the most embarrassing findings. v1 audits claimed DONE but the v2 audits caught the work was incomplete or functionally broken.

| ID | Surface | v1 claim | v2 reality | Repair wave |
|---|---|---|---|---|
| R-01 | Stats tab delta chips | UIUX-01 H shipped per v10.x note | DOM exists, JS never writes; ghost boxes | Wave 1 |
| R-02 | Stats tab sparklines | UIUX-01 §G implementation log | DOM exists, JS never writes; ghost dead-space | Wave 1 |
| R-03 | Lead KPI delta colors | UIUX-08 G.8 claimed "shipped, partial" | partial = no CSS rule; deltas render monochrome | Wave 1 (CSS) |
| R-04 | Status bar severity weight tiers | v10.12 H.4 shipped JS map | CSS `font: 600 ... !important` overrides; 5 of 7 tiers inert | Wave 1 |
| R-05 | Diag tab IDB read | v10.12.3 said "migration to IDB complete" | popup.js still reads stale `chrome.storage.local`; logs appear empty | Wave 1 (or W3 add) |
| R-06 | Tokens tab `#claimInviteWrap` orphan | UIUX-07 H said "absorbed into card" | Still rendered structurally OUTSIDE `#card-tokens` at popup.html:789 | Wave 2 |
| R-07 | Macros card `.gam-macro-item-*` classes | UIUX-04 D shipped CSS | CSS exists, JS row builder uses old `.gam-macro-row` class with inline styles | Wave 4 |
| R-08 | Macros card duplicate tab-active blocks | UIUX-04 §A.5 H | popup.css:231-234 (blue, !important) and 1107 (amber) coexist; old wins | Wave 4 |
| R-09 | Macros card `window.confirm()` removal | UIUX-04 §B B.1 v2 | Both delete and AI seed still use OS-blocking confirm | Wave 4 |
| R-10 | Mod Console v1 spec compliance | UIUX-14 ralph plan | 0% compliance: no number keys, no Ctrl+Enter, no BAN danger color, no UNBAN demotion, no QUICK j/k | Wave 4 (P0/P1 only) |
| R-11 | Maintenance v1 spec compliance | UIUX-15 ralph plan | 0% compliance on UIUX-15 specific items; v10.12 shipped 4-card split (different scope) | Defer (D-16/D-17) |
| R-12 | Site Health firehose ARMED state | UIUX-12 §B mismatch warn pill | Code only handles ok/err binary; mismatch never wired | Wave 3 |
| R-13 | Modmail prefetched track-response | UIUX-04 P0-A.2 partial | Prefetched useBtn skips `modmailTrackResponse`; AI usage analytics broken | Wave 4 |
| R-14 | Modmail panel cold AI shimmer | UIUX-04 P1-B.3 backport partial | Ban tab + mm_reply tab got shimmer; panel cold path skipped | Wave 4 |
| R-15 | Modmail draft local mirror read | UIUX-04 P0-A.2 promised | mirror is WRITTEN, never READ on cold session miss | Wave 4 |
| R-16 | DR popover batch ops + undo toast | DR popover v1 deferred to v10.12.1 | Never shipped through v10.12.3 | Wave 3 (undo toast); D-05 (batch) |
| R-17 | Empty states factory consolidation | UIUX-19 said "consolidation done" | 4 distinct factories still live; `ctaFn`/`ctaAction` API split unresolved | Wave 5 |
| R-18 | Token system migration | v10.10.1 added 35-key C const | 0 callsites use new tokens; 90 C.ACCENT calls still emit blue at brand sites | Defer (D-13/D-14) |
| R-19 | Motion token migration | v10.12 UIUX-18 §C.1 added 4-tier | 0 callsites use `--bb-motion-*`; 22 transitions hardcoded | Defer (UIUX2-24 followup) |

**Wave 1 alone repairs 5 of these regressions** (R-01, R-02, R-04, R-05 included in scope; R-03 follows Wave 1 token foundation). This is the most embarrassing batch and ships first.

---

## Section 8 -- File-Level Impact Map

| File | Wave 1 lines | Wave 2 lines | Wave 3 lines | Wave 4 lines | Wave 5 lines | Total net |
|---|---|---|---|---|---|---|
| `popup.html` | -50/+30 | +50/-100 | 0 | +40 | 0 | -30 |
| `popup.css` | -100/+100 | +200 | 0 | +100/-30 | +50/-20 | +300 |
| `popup.js` | +120 | +100 | 0 | +50 | +20 | +290 |
| `modtools.js` | +5 | +150 | +600 | +600 | +250 | +1605 |
| `background.js` | 0 | 0 | 0 | 0 | 0 | 0 |
| `manifest.json` | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total net diff** | **+105** | **+400** | **+600** | **+760** | **+300** | **+2165 lines** |

**Note:** Net positive line count is expected because we are wiring shipped-but-inert features (delta chips, sparkline data, banner severity, focus traps, undo toasts). Most of the line growth is feature-completion, not new features.

---

## Section 9 -- Risk Callouts

### What could break in production

| Risk | Wave | Mitigation |
|---|---|---|
| Stats CSS consolidation leaves a `nth-child` rule fighting | W1 | After consolidation, browser-test all 8 tiles render correctly with hover, focus, drill-click |
| Tokens tab three-state machine misses an edge state (whoami pending then drops) | W2 | Add explicit `__tokSetState('first-run')` on whoami timeout, not just on reject |
| Auth wizard auto-attempt creates infinite loop if RPC keeps returning success-then-fail | W2 | Limit auto-attempt to 1 cycle; if still failing, banner shows |
| SUS popover Unmark + chevron change concurrent: race on row removal | W3 | Sequential: chevron CSS reset on collapse-all loop; Unmark fires its own `.gam-dr-row-out` removal |
| DR popover band re-render destroys in-progress Fire-Now confirm state | W3 | Snapshot `.confirming` rows pre-render, restore class post-render |
| Mod Console number key 2 fires while user types "2" in BAN duration input | W4 | Guard `e.target.tagName === 'INPUT'/'TEXTAREA'/'SELECT'` AND `.gam-mc-dur` button focus check |
| Modmail bar [Mark SUS] click on user already SUS | W4 | RPC handles idempotently; UI shows "already SUS" snack on success path |
| Modmail draft local mirror restoration writes stale data over user's fresh draft | W4 | Restore only on session.empty AND mirror.savedAt > Date.now() - 24h; purge mirror after restore |
| `::after` hit-area extension on bar icons collides with hover tooltip `::after` | W5 | Tooltip currently uses `::before` for the tooltip and `::after` for hit area; both were planned -- audit confirms `::after` extension at rest, replaced by tooltip caret on `:hover` -- acceptable |
| Bloomberg button base 28→32px tightens dense maint rows | W5 | `pop-maint-action-row` already 32px min-height with `flex:1` button -- no conflict |
| Copy-to-clipboard fallback path fires `execCommand('copy')` which is deprecated | W5 | Acceptable fallback; primary path uses `navigator.clipboard.writeText` |

### What needs manual QA (vs automated unit/E2E testable)

**Manual QA only:**
- Visual regression on stats tab 4-col layout at 380px popup width (no test infrastructure for popup screenshots).
- Tokens tab three-state visual transitions (flicker absence is visual-only).
- Status bar ticker severity weight rendering (font-weight 400 vs 600 is subtle on dark background).
- Active Mods popover tier divider visual hierarchy at 1080p, 1440p, 1920p.
- Mod Console BAN tab danger color readability (not a contrast-checker output -- subjective at 70% opacity).
- Modmail AI card 1-col stack readability at 320px.
- Click-target ::after hit zones (functional but visual is unchanged -- mod must report perceived improvement).
- All copy/voice changes (operator register is subjective; test with Commander).

**Unit/E2E testable:**
- Stats delta math (sessionStorage diff returns correct sign/magnitude).
- Tokens tab state machine state transitions (assert state class on `#tab-panel-tokens` post-whoami).
- Auth banner severity class application (assert `tok-banner.warn` class for age=72d).
- Popover handlers fire correct RPCs (assert `modAutoRuleAdd` called for tard rules).
- Mod Console keyboard guards (textarea focus blocks number keys; verify with synthetic events).
- Modmail draft restoration (set local mirror, open panel, assert textarea pre-filled).
- Empty state factory accepts both `ctaFn` and `ctaAction` (back-compat shim test).

### What needs cross-version backwards-compat

| Concern | Wave | Notes |
|---|---|---|
| IDB schema (gam_diag_log) | W1 | No schema change; only fix popup.js read path. v10.11→v10.13 IDB store unchanged. |
| `gam_settings` shape | W2 | No new keys added. `tokenIssuedAt` / `rotated_at` already populated. |
| `chrome.storage.local` keys | W4 | New: none. Reading existing `gam_macro_drafts_local`, `gam_modmail_drafts_local`. Pre-existing callers unaffected. |
| Worker RPC contracts | All | No new RPCs. `modSusMark`, `addToDeathRow`, `modAutoRuleAdd`, `modmailTrackResponse` all exist. |
| D1 schema | All | No D1 changes. Queue popover data-gap state remains until D1 migration ships separately (UIUX-11 backend tasks unchanged). |
| Tab localStorage keys | W2 | `lastActiveTab` unchanged. Lead-tab guard added (returns to 'stats' if Lead button hidden). |

### What requires worker-side changes (D1, KV, RPC contract)

**v10.13 worker changes: NONE.** All waves are pure client. Listed deferreds requiring worker:

- D1 `gaw_queue` migration + handleModQueueSnapshot real query (UIUX-11 §C, blocks Queue popover real data).
- D1 `mod_incidents` table (V11 -- INCIDENTS KPI tile).
- Worker `/admin/api/mod/auto-actions/recent` may need `last_poll_at` field surface (already returned per UIUX2-15 read).
- Worker `modAutoRuleAdd` RPC (assumed to exist; verify before W3 ships).
- Worker `modmailTrackResponse` RPC (exists per UIUX2-16 verified).
- Optional: SW writes `gam_diag_log_ts` sentinel key to `chrome.storage.local` to trigger Diag tab refresh on IDB writes (UIUX2-07 §H.8, deferred D-11).

---

# When Done -- Required Report Back

**(filled in below per user spec)**

## 1. Path to the SHIPMASTER doc

`D:\AI\_PROJECTS\modtools-ext\docs\V10_DESIGN_V2\DESIGN_V2_SHIPMASTER.md`

## 2. Top-5 things that surprised me in synthesis (cross-cutting patterns the individual audits missed)

1. **The token-schema-without-migration pattern is the single most pervasive failure across the corpus.** Every cross-cutting audit (UIUX2-23/24/25/26) independently surfaces the same finding from a different angle. v10.10.1 added `C.AMBER`, `C.BLUE`, `--bb-motion-*`, the chip variant classes -- and shipped 0% callsite migration. This isn't isolated to one surface; it's an institutional pattern. The org built abstraction layers and never paid them down. The combined corpus reveals this is the dominant theme; no single audit captures it because each only sees its own surface.

2. **5 distinct "shipped but inert" features survived multiple ralph waves.** Stats delta chips, stats sparklines, lead KPI delta colors, ticker severity weight tiers, modmail track-response on prefetch. Each shipped JS but the matching CSS or wire was missed. The corpus shows a consistent pattern: the JS author shipped half the patch, the CSS author shipped half, both said DONE in different waves, neither integrated. Wave 1 alone repairs 4 of these by lining up the CSS that already exists in the codebase.

3. **The popup is dogfood; the page-injected popovers are ralph-grade.** UIUX2-09/10/11/12/13/14 all rate the popovers 7/10 to 9/10. UIUX2-01/02/05/07/22 rate the popup surfaces 4/10 to 6/10. The popup is the highest-frequency surface (every mod opens it 50x/day) and it's the weakest. The popovers are the visible-to-Commander surfaces and they're polished. The mod hot-path goes through the popup; the popup is what regresses. v10.13 must reverse this ratio.

4. **Cmdr's "DOGFOOD" framing is empirically correct.** I went into the synthesis expecting overstatement. The corpus confirms: ghost DOM elements, dead button handlers, broken severity tiers, IDB read regressions, false-confidence loading states, duplicate handlers wired to the same RPC, factory pattern split across files with mismatched parameter names. The credibility wounds are genuine. v1 ralph ships generated a lot of "claimed DONE" status that v2 ralph is now finding is half-baked. The post-mortem framing matters more than I expected.

5. **The 4/8/12/16 spacing grid charter is itself a token violation.** `--bb-s3 = 6px` -- the project's own token system emits an off-grid value. This is the most surprising structural finding because it's a single-line fix that auto-migrates ~8 sites. The other 30+ literal `6px` instances are downstream of this one decision. Fixing this token alone is higher-leverage than any individual surface fix in the corpus. Ship it in Wave 1.

## 3. Total v10.13 effort budget (sum of waves 1-N)

**40 hours.**

| Wave | Effort |
|---|---|
| 1 -- Token foundation + Stats + Ticker | 8h |
| 2 -- Tokens 3-state + Auth wizard | 9h |
| 3 -- Popover fixes pack | 8h |
| 4 -- Mod Console + Modmail + Macros | 9h |
| 5 -- Hygiene + A11y | 6h |

This is the real dev-hours budget. Sonnet agent overhead (context loads, decision points, verification) adds nominal time per wave. Five waves = five Sonnet sessions, sequentially or partially parallel per Section 5 dependency map.

## 4. Sanity check: 3 audits with findings that disagreed most with broader corpus

**UIUX2-21 (Visual Hierarchy)** -- proposes new `.pop-h1-cta` `.pop-h2-action` `.pop-h3-meta` classes. Corpus consensus is that the existing `pop-btn-primary`, `pop-btn-ghost`, `data-state="..."` patterns ARE the hierarchy primitives -- they just need to be applied consistently. Adding more class names without retiring the old ones makes the wall worse, not better. **Winning side: corpus consensus.** v10.13 does NOT add the new classes; it applies what already exists more consistently. This is a UIUX2-21 §H recommendation that loses to the broader audit-deep-dive findings (UIUX2-01, 03, 05) which all use the existing token system correctly.

**UIUX2-25 (Color Semantics)** -- proposes introducing `--bb-teal: #14b8a6` for lead authority and migrating purple+yellow lead surfaces. UIUX2-06 (Lead Card v2) keeps purple semantics. UIUX2-08 makes no recommendation about lead color. Corpus is essentially silent on whether the teal migration is correct. **Winning side: UIUX2-25 with deferred execution.** Add the token in v10.13 (W1), defer migration to v10.14 D-13/D-14. The semantic argument is correct; the visual change is high-stakes. This is the right call -- declare-but-don't-migrate, same as the rest of the v10.13 token-schema discipline.

**UIUX2-29 (Loading States)** -- says popup.css skeleton uses `.gam-skel-shimmer` (gradient sweep) while modtools.js skeleton uses `gam-skel-pulse` (opacity animation), divergence is "infrastructure debt." UIUX2-31 (micro-interactions) treats existing patterns as architecturally correct. UIUX2-22 (density) doesn't comment on the divergence. **Winning side: UIUX2-31.** Three skeleton implementations IS technical debt, but unifying them is v11 scope. v10.13 does NOT touch the divergence; it just ensures both have PRM guards (W5). UIUX2-29's call to consolidate is correct but not blocking. Defer.

---

*End of DESIGN V2 SHIPMASTER. Read-only synthesis. The 5 waves dispatch separately as implementation tickets.*
