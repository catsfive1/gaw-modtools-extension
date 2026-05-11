# UIUX2-28 — Empty States Audit (v10.13 Design V2)

Audit date: 2026-05-10
Files examined: `modtools.js`, `popup.js` (source at `D:\AI\_PROJECTS\modtools-ext\`)

---

## A. Factory vs. Hardcoded Inventory

### Three parallel implementations exist (consolidation is incomplete)

| # | Function | File | Context | Flag-gated? | CTA support |
|---|---|---|---|---|---|
| 1 | `renderEmptyState(opts)` | modtools.js ~L4393 | Content-script popovers (v8.1 era) | YES — `__uxOn()` guard; returns `null` when flag off | `ctaLabel` + `ctaAction` |
| 2 | `gamMakeEmpty(opts)` | modtools.js ~L4486 | Content-script popovers (v10.12 canonical) | NO — always-on | `ctaLabel` + `ctaAction` |
| 3 | `gamEmptyState(opts)` | popup.js ~L235 | Popup panels (v10.x Patch 5) | NO — always-on | `ctaLabel` + `ctaFn` (NOTE: different param name) |
| 4 | `gamMakeEmpty(opts)` | popup.js ~L312 | Popup panels (v10.12 Patch 5b canonical) | NO — always-on | `ctaLabel` + `ctaFn` |

**UIUX-19 declared consolidation done. It is not.** Four distinct implementations remain. The UIUX-19 comment at modtools.js L4554 says "new code should call `gamMakeSkel/gamMakeEmpty` directly" — but `renderEmptyState` is still called at 7 live call sites (see Section B). The CTA parameter naming divergence between `ctaAction` (modtools.js factories) and `ctaFn` (popup.js factories) is an undocumented API split that will bite any dev who copies a call from one file to the other.

---

### Call-site count by function

| Function | Call sites | File(s) |
|---|---|---|
| `renderEmptyState(...)` | 7 | modtools.js only |
| `gamMakeEmpty(...)` | 3 (modtools) + 1 (popup) | both |
| `gamEmptyState(...)` | 4 | popup.js only |
| Hardcoded (no factory) | ~18 | both (see Section B) |

**Total factory-routed surfaces: 15. Hardcoded surfaces: ~18. Majority are still unmanaged.**

---

## B. Per-Surface Empty-State Quality

### B1. Factory-routed surfaces

| Surface | File | Factory used | Helper text? | Action present? | CTA wired? | Quality |
|---|---|---|---|---|---|---|
| DR automod rules (first run) | modtools.js L13466 | `renderEmptyState` | "Add your first rule to auto-flag usernames that match a pattern." | YES | YES — focuses `#gam-dr-add-pat` input | GOOD |
| Tard rules (first run) | modtools.js L13622 | `renderEmptyState` | "Add a pattern to auto-flag comments from suspect accounts." | YES | YES — focuses `#gam-tards-add-pat` input | GOOD |
| Users filter — no match | modtools.js L14092 | `renderEmptyState` | "Try clearing the search box or broadening the pattern." | action implicit (clear box) | NO button | OK — but no affordance |
| Mod actions — none in 1h | modtools.js L19901 | `renderEmptyState` | "Quiet on the moderation front right now." | NO | NO | WEAK — dead-end |
| Mods online — none | modtools.js L19932 | `renderEmptyState` | "You're solo -- flags will fire through to your queue." | NO | NO | OK — informational, but headline tone is passive |
| Presence HUD — quiet | modtools.js L23764 | `renderEmptyState` | "No other mods have this page open right now." | NO | NO | WEAK — dead-end |
| Suspicious queue — clean | modtools.js L17845 | `gamMakeEmpty` | "No users currently flagged as suspicious." | NO | NO | OK — resolved state |
| Death Row — clear | modtools.js L18114 | `gamMakeEmpty` | "No pending bans." | NO | NO | WEAK — terse, no next step |
| Mod queue — clear | modtools.js L18548 | `gamMakeEmpty` | "Nothing pending." | NO | NO | WEAK — most terse of all |
| Bug reports — none | popup.js L3651 | `gamEmptyState` | "Team is clean. Reports appear here as mods submit them." | NO | NO | OK — educational |
| Macros — none | popup.js L3751 | `gamMakeEmpty` | "Click Add custom below to create one." | action implied | NO button | OK — but no visual affordance |
| User triage — pending | popup.js L4028 | `gamEmptyState` | "No new users waiting. Run a /users crawl to refresh." | NO | NO | WEAK — tells user to do work manually |
| Username clusters — none | popup.js L5468 | `gamEmptyState` | "0 suspicious username clusters in current data." | NO | NO | WEAK — raw data feel, not human |

### B2. Hardcoded surfaces (no factory)

These bypass the empty-state system entirely — no icon, no CTA, often raw `innerHTML` with inline styles.

| Surface | File | Line approx | Current text | Icon? | Action? | Quality |
|---|---|---|---|---|---|---|
| Intel tab — no local actions | modtools.js | L8258 | `<div class="gam-mc-empty-dense">No local actions logged for X.</div>` | NO | NO | POOR |
| Intel tab — no recent comments | modtools.js | L8330 | `<div class="gam-mc-empty-dense">No recent comments parsed. Fresh account or private profile.</div>` | NO | NO | POOR |
| Intel tab — fetch error | modtools.js | L8411 | `<div class="gam-mc-empty">Fetch error (see console).</div>` | NO | NO | POOR — errors belong in `gamMakeError`, not empty-state class |
| Note tab — no notes | modtools.js | L9636 | `<div class="gam-mc-empty-dense">No notes recorded yet. Add the first below.</div>` | NO | NO | POOR — there IS an action (the textarea below), just not wired |
| User filter fallback | modtools.js | L14101 | `<div class="gam-t-empty">No users match this filter.</div>` | NO | NO | POOR — duplicate of L14092 path |
| Modmail threads — loading | modtools.js | L16847 | Inline `<div style="...">No threads cached...` | NO | NO | POOR — raw inline style |
| Modmail threads — empty after backfill | modtools.js | L16856 | Inline `<div style="...">No modmail threads after firehose backfill.</div>` | NO | NO | POOR |
| Mod-to-mod chat — no conv selected | modtools.js | L16113 | `el('div', {cls:'gam-mc-empty'})` + textContent | NO | NO | POOR — `gam-mc-empty` is the old class (no icon spec) |
| Mod-to-mod chat — no messages | modtools.js | L16122 | same pattern | NO | NO | POOR |
| Presence HUD — fallback path | modtools.js | L23773 | `<div class="gam-hud-empty">no mods online</div>` | NO | NO | POOR — lowercase, no period |
| Auto-unsticky — no recent actions | modtools.js | L17449 | `el('div'); textContent = 'No recent auto-unsticky actions'` | NO | NO | POOR |
| Mod token missing (list) | modtools.js | L5255 | `<div style="...">No mod token.</div>` | NO | NO | DIFFERENT — this is a config error, not empty-state |
| Username patterns — none | modtools.js | L19580 | `<div style="...">No patterns found. Try Refresh.</div>` | NO | NO | POOR — action exists (Refresh button), not wired |
| Popup — no token rotate | popup.js | L2425 | `textContent = 'no current token -- nothing to rotate'` | NO | NO | DIFFERENT — config error |
| Popup — activity zero states | popup.js | L3946-3949 | Raw string map (bans24, msgs24, notes24, ai24) | NO | NO | POOR — plain text, no visual hierarchy |
| Mod-to-mod chat preview — no messages | popup.js | L16101 | `textContent = 'No messages yet'` | NO | NO | POOR |
| Mods header — none active | popup.js | L5933 | `textContent = 'No mods active right now'` | NO | NO | PARTIAL — this is a label, not a panel |

---

## C. Icon Variety vs. Reuse

### modtools.js icon pool (`UX_SVG` + `_GAM_EMPTY_SVG`)

| Icon key | Visual concept | Used by |
|---|---|---|
| `inbox-empty` | Inbox with filter tray | (defined, never called in factory sites — dead) |
| `users-empty` | Two silhouettes | Mods online, users filter, presence HUD, username clusters |
| `rules-empty` | Document with lines | DR automod, tard rules |
| `actions-empty` | Plus cross | Mod actions (v8.1 context) |
| `modmail-empty` | Envelope | (defined in UX_SVG, not in _GAM_EMPTY_SVG — unreachable from gamMakeEmpty) |
| `sus-empty` | Silhouette with strike-through | Suspicious queue |
| `queue-empty` | Stacked bars fading | Mod queue |
| `dr-empty` | Circle with X | Death Row |

**Problems:**
- `users-empty` is overloaded across 4 semantically different surfaces (mods online, users filter no-match, presence HUD, username clusters). A user who sees this icon in all four contexts gets no differentiation.
- `inbox-empty` and `modmail-empty` (UX_SVG) are defined but never reach call sites via `gamMakeEmpty` — the content-script factory uses `_GAM_EMPTY_SVG` which does not include them.
- `actions-empty` is a plus-cross SVG — semantically wrong for "nothing happened." It reads as "add," not "empty." This is an icon meaning bug.

### popup.js icon pool (`GAM_EMPTY_SVG` + `GAM_STATE_SVG`)

| Icon key | Visual concept | Used by |
|---|---|---|
| `modmail-empty` | Envelope | (defined, used in no call site in popup.js) |
| `users-empty` | Two silhouettes | Username clusters (popup), triage pending |
| `check-circle` | Circle checkmark | Bug reports — 0 open |
| `error-octagon` | Stop octagon with `!` | (defined, used in no popup call site) |
| `rules-empty` | Document with lines | Macros — none |
| `sus-empty` | Checkmark circle (DIFFERENT from modtools version) | (in GAM_STATE_SVG — `gamMakeEmpty` popup merges both maps) |
| `queue-empty` | Stacked bars fading | (in GAM_STATE_SVG) |

**Critical inconsistency:** `sus-empty` in popup.js (`GAM_STATE_SVG`) is a checkmark-circle — positive sentiment. `sus-empty` in modtools.js (`_GAM_EMPTY_SVG`) is a silhouette with a strike-through — negative/cleared. Same key, opposite visual semantics between files.

---

## D. Migration Plan

### Priority 1 — API alignment (prerequisite for everything else)

The `ctaFn` vs. `ctaAction` split must be resolved before any call-site migration. Pick one. Recommendation: `ctaFn` (popup.js convention is newer and simpler). Add a backward-compat shim in modtools.js `gamMakeEmpty` that accepts either. This is a 5-line change.

### Priority 2 — Kill `renderEmptyState` call sites (7 sites, modtools.js)

These are still `__uxOn()`-gated, which means they degrade to plain text on flag-off. All 7 should move to `gamMakeEmpty` (which is always-on). The two that have CTAs (DR rules, tard rules) need `ctaFn`/`ctaAction` alignment from Priority 1. Estimated: 1 hour.

### Priority 3 — Wire CTAs on high-value dead-end states

The following factory-routed surfaces have a natural primary action but no CTA:

| Surface | Recommended CTA label | Action |
|---|---|---|
| Mod queue — clear | "Check /reports" | link to `/reports` page |
| Death Row — clear | "View /users" | link to `/users` |
| Mods online — none | "Open mod channel" | fire mod-to-mod chat |
| User triage — pending | "Run /users crawl" | trigger the crawl action |
| Username clusters — none | "Run scan" | trigger cluster analysis |

These are the surfaces where the mod has arrived at a dead-end and needs a next step. Estimated: 2-3 hours.

### Priority 4 — Migrate highest-traffic hardcoded surfaces

Focus on surfaces a mod sees every session:

1. **Intel tab — no local actions** (L8258): replace `gam-mc-empty-dense` div with `gamMakeEmpty({icon:'actions-empty', headline:'No actions logged', desc:'Actions appear here after bans, removes, and notes.'})`. Note: use a better icon than `actions-empty` (the plus-cross is wrong — suggest a new `log-empty` icon).
2. **Intel tab — no recent comments** (L8330): `gamMakeEmpty({icon:'users-empty', headline:'No comments indexed', desc:'Fresh account or private profile.'})`
3. **Note tab — no notes** (L9636): `gamMakeEmpty({icon:'rules-empty', headline:'No notes yet', desc:'Add the first below.', ctaFn: focusNoteTextarea})`
4. **Modmail threads — empty** (L16856): `gamMakeEmpty({icon:'modmail-empty', headline:'Inbox empty', desc:'No threads after backfill. Visit /modmail directly to seed.'})`
5. **Mod-to-mod chat — no conversation selected** (L16113): `gamMakeEmpty({icon:'users-empty', headline:'Select a conversation', desc:'Pick a mod from the list on the left.'})`

Estimated: 2-3 hours.

### Priority 5 — Deduplicate icon pool and fix semantic errors

1. Retire `inbox-empty` from `UX_SVG` (dead code) or promote it to `modmail-empty` replacement (better concept for modmail surface).
2. Rename `actions-empty` to something not visually meaning "add." Suggest `activity-empty` with a clock/wave icon.
3. Align `sus-empty` between files — pick one SVG, use it in both `_GAM_EMPTY_SVG` and `GAM_STATE_SVG`.
4. Add `log-empty`, `mail-empty`, `chat-empty` icons to cover the surfaces being migrated in Priority 4. Estimated 30 min design + 30 min wiring.

### Priority 6 — Config-error surfaces (do NOT use empty-state factory)

The following are miscategorized as empty states but are actually configuration errors:

- "No mod token." (L5255, L6619) — should be `gamMakeError({severity:'hard', msg:'No mod token configured.', hint:'Open Settings > Tokens to add one.', retryFn: openSettings})`
- "no current token — nothing to rotate" (popup L2425) — same treatment

These two surfaces put the mod in a hard stop with no recovery affordance. Routing them to `gamMakeError` with a CTA that opens settings is a first-run UX win.

---

## E. Effort Summary

| Priority | Description | Effort | Blocker |
|---|---|---|---|
| 1 | API alignment (`ctaFn` vs `ctaAction` shim) | 30 min | None |
| 2 | Kill 7 `renderEmptyState` call sites | 1 hr | Priority 1 |
| 3 | CTA wiring on 5 high-value dead-end states | 2-3 hr | Priority 1 |
| 4 | Migrate top-5 hardcoded surfaces | 2-3 hr | Priority 5 (icons) |
| 5 | Icon pool dedup + semantic fix + 3 new icons | 1 hr | None |
| 6 | Reclassify 2 config-error surfaces to `gamMakeError` | 1 hr | None |
| **Total** | | **~8-9 hr** | |

### The one thing to do first

Priority 1 (the `ctaFn`/`ctaAction` shim) is a 5-line change that unblocks everything else. Do it in the same commit as Priority 2 (kill `renderEmptyState`) — that's a clean, self-contained ticket: "consolidate empty-state API, retire flag-gated renderEmptyState." Everything from Priority 3 onward is additive UX improvement.

### What good looks like post-migration

- Single factory per context (`gamMakeEmpty` in modtools.js, `gamMakeEmpty` in popup.js, identical API)
- Every empty state has: SVG icon + headline + 1-sentence desc
- Every first-run / dead-end surface has a CTA button that does something (not just text)
- Config-error surfaces route to `gamMakeError` with a recovery action
- Icon pool has 8-10 semantically distinct icons, none reused across incompatible surfaces
- `renderEmptyState` removed or aliased to `gamMakeEmpty` with a deprecation comment
