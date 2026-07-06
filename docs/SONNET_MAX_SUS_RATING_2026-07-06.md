# SONNET MAX BUILD PROMPT — SUS user-rating: one-click flag + reason dropdown + subtle comment/username tint

> **You are picking up a coding task on GAW ModTools with ZERO prior context.** Fully
> self-contained. Read start to finish before touching code. Commander Cats is the lead mod and a
> NON-PROGRAMMER vibe-coder — carry the whole technical load, verify from your own side, never use
> him as a test mule, report in plain language (no code / no CLI as a call-to-action).
>
> Produced by a 6-specialist design swarm + adversarial critic. **~80% of this feature already
> exists and must be EXTENDED, not rebuilt** — the project's own memory warns "do NOT rebuild the
> SUS list." Every critic correction is folded in and flagged `[CRITIC]`. Trust this doc over any
> line number — **grep to confirm every anchor before editing; line numbers drift.**

---

## 0. PROJECT FACTS — memorize
- **Repo (USE THIS EXACT PATH):** `D:\AI\_PROJECTS\gaw-modtools-extension` — origin
  `github.com/catsfive1/gaw-modtools-extension`, branch `master`. **NOT `modtools-ext`** (stale
  v8.0.0, no git). First: `git -C "D:\AI\_PROJECTS\gaw-modtools-extension" log --oneline -6` + read
  `manifest.json` version. Baseline at authoring: **v10.36.16**, HEAD `c4cb6e6`. Two sessions may
  share this repo — `git status` before committing; never force-push; `git add` specific files.
- **Files:** `modtools.js` (~1.85 MB, ONE IIFE, CRLF — grep + offset/limit Read only, NEVER full),
  `background.js` (RPC router). This build touches **only `modtools.js`** (backend already exists).
- **Ship loop (ONE version for this whole cohesive feature — suggest `v10.37.0`, confirm against
  CHANGELOG):** bump `manifest.json` → `CHANGELOG.md` entry → `node --check modtools.js` → run full
  `scripts/_*.mjs` → add a new numbered slice-eval smoke test → `git add` specific files → commit →
  push → `pwsh -File scripts\build-zip.ps1 -NoPause` (rebuilds the Brave-loaded dir
  `D:\AI\_PROJECTS\dist\mod-tools dist\` — **commit ≠ shipped**) → `pwsh -File scripts\mirror-to-drive.ps1 -Version 10.37.0 -NoPause`.
- **Boot-probe reality:** there is NO full-IIFE boot probe in this repo and building one is its own
  session — DON'T. Safety net = `node --check` (syntax) + a **slice-eval smoke test of each NEW
  function** in stubbed globals (see `scripts/_p0_triage_mount_smoke_test.mjs`). Declare new
  top-level helpers as hoisted `function foo(){}`, not `const`, where an earlier caller needs them.
- **HI-1 (never violate):** the SUS list is the deliberately-SAFE list — it NEVER bans. This whole
  feature is HI-1-safe: all writes go through `modSusMark`/`modSusClear` only. **See the Death-Row
  adjacency trap in §7 — the one place HI-1 is thin.**
- **No worker deploy:** all three RPCs are already live. Nothing here needs a worker/D1 change; if
  you find yourself wanting server-side reason validation, STOP — that's a forbidden deploy.

---

## 1. THE ASK, AND WHAT ALREADY EXISTS

Commander wants: *a convenient, all-mod "user rating" that flags users for attention and tints
their comments + username SLIGHTLY (almost imperceptibly) orange/red; any mod can add or remove;
mark reason picked from a **dropdown** of smart presets.*

**Already LIVE — reuse as-is, do NOT rebuild:**
- **Backend (any authed mod, no deploy):** `modSusMark {username, reason(≤200)}`, `modSusList`
  (returns rows `{username, reason, marked_by, comment_count_24h}`), `modSusClear {username}` —
  background.js:3084-3112. So "any mod adds or removes, with a reason" is **already true**.
- **`_susState.rows`** = Map(lowercased-username → row), hydrated from `modSusList`, refreshed by a
  60s `_susRefresh` + on tab refocus.
- **Twin decorators** `_susApplyDecorations` (~14085, full-doc) and `_susDecorateOne` (~15188,
  per-anchor) already decorate every `a[href^="/u/"]` for a SUS user: set username text color
  (`C.WARN #f0a040`, or `#f04040` when `comment_count_24h > 8` = "hot"), weight, **prepend a 🚩
  glyph**, and set a rich native `title` = "🚩 SUS by \<marked_by\>: \<reason\>". They repaint under
  the consolidated body observer **`_gamBodyObs` (~15247, 800ms debounce)**.
- **`buildActionStrip` (~12194)** injects per-comment/post mod controls and already has a dropdown
  idiom: `gam-strip-drop` / `gam-strip-menu` (~12209-12256).

**GENUINELY NEW (narrow):** (A) a subtle **background** wash on the username *and its comment/post
body* (today only username *text color* changes; comment bodies get nothing); (B) a **reason
dropdown** replacing the raw `prompt()`; (C) a **one-click Flag/Clear** control on every comment.

---

## 2. `[CRITIC]` THE #1 TRAP — WIRE TO THE RIGHT SYSTEM
Grepping "sus" will surface `startSusMarker` / `paintSusMarkers` / `computeSusSet` /
`susMarkerEnabled` (~13344, ~29234-29275) and the `.gam-sus-x` glyph. **That is a SEPARATE system**
— the "✗ next to watchlisted / cloud-flagged usernames" marker; it reads watchlist/cloud-flags,
**NOT `_susState`.** Its own toggle text at ~13343 confirms it. **Wiring the tint there = a DEAD
feature + a duplicate observer.** ALL new tint work rides `_susDecorateOne` / `_susApplyDecorations`
under `_gamBodyObs`. Use a NEW setting `susTint` — do NOT reuse `susMarkerEnabled`.

---

## 3. WS-A — Subtle username + comment/post background tint (MUST)
Extend BOTH twin decorators to stamp a class on the comment/post container; ship the wash as one
injected stylesheet.

- **New injector `function _gamInjectSusTintStyles()`** cloned from `_gamInjectFlagDotStyles`
  (~29312): id-guarded `<style id="gam-sus-tint-styles">` with this exact CSS (dark theme; alphas
  are tuned — do not lower the body wash below 0.045 or it vanishes; the inset rail is the real
  at-a-glance signal):
  ```
  .gam-sus-comment{background:rgba(240,160,64,.055);box-shadow:inset 3px 0 0 rgba(240,160,64,.55);border-radius:2px;transition:background .12s,filter .12s}
  .gam-sus-comment.gam-sus-comment-hot{background:rgba(240,64,64,.075);box-shadow:inset 3px 0 0 rgba(240,64,64,.60)}
  .gam-sus-comment a[href^="/u/"][data-gam-sus-decorated]{background:rgba(240,160,64,.14);padding:0 3px;border-radius:3px}
  .gam-sus-comment.gam-sus-comment-hot a[href^="/u/"][data-gam-sus-decorated]{background:rgba(240,64,64,.16)}
  .gam-sus-comment:hover{filter:brightness(1.15)}
  .gam-sus-comment:hover a[href^="/u/"][data-gam-sus-decorated]{background:rgba(240,160,64,.22)}
  .gam-sus-comment.gam-sus-comment-hot:hover a[href^="/u/"][data-gam-sus-decorated]{background:rgba(240,64,64,.24)}
  ```
  Call it once at the SUS boot site (near where `_susRefresh` is scheduled, ~14147), gated on
  `getSetting('susTint', true)`.
- **In BOTH decorators, at the point where the anchor is confirmed decorated** (`_susDecorateOne`
  after `a.setAttribute('data-gam-sus-decorated','1')` ~15230; the equivalent line in
  `_susApplyDecorations` ~14134-14136), add (gated on `susTint`):
  ```
  var box = a.closest('.comment, .post');
  if (box) { box.classList.add('gam-sus-comment'); box.classList.toggle('gam-sus-comment-hot', isHot); box.setAttribute('aria-label', 'Flagged SUS by ' + (row.marked_by || '?') + ': ' + reason); }
  ```
  `isHot` and `reason`/`row` are already local at that point in both fns. `.comment, .post` is the
  canonical GAW container pair (used at `a.closest('.post, .comment')` ~12128).
- **`[CRITIC]` The twins are NOT byte-identical** (one is `const`/full-doc `querySelectorAll`, one is
  `var`/per-anchor with different surrounding lines). Edit each **in place** — do not paste one
  block into the other verbatim. But BOTH must get the stamp, or force-repaint tints while
  scroll-added nodes don't (or vice-versa).
- **Symmetric teardown in BOTH un-decorate branches** (~15197-15208 and ~14098-14109):
  ```
  var box = a.closest('.comment, .post');
  if (box && !box.querySelector('a[href^="/u/"][data-gam-sus-decorated]')) { box.classList.remove('gam-sus-comment','gam-sus-comment-hot'); box.removeAttribute('aria-label'); }
  ```
  Only strip when NO sus username remains in the container (a comment may quote a second sus user).
  **`[CRITIC]`** the un-decorate branch does NOT unconditionally `return` — it falls through with an
  `if(!isNew) return` because a cleared-SUS user may still be a NEW account needing the ⓝ badge.
  Your teardown must sit BEFORE that continuation and must not assume the branch exits.
- Register `susTint: true` in the DEFAULTS object (~1752, beside `susMarkerEnabled`).
- **Acceptance:** a SUS user's comment body + username show a faint amber wash + crisp inset left
  rail on the dark theme; HOT (>8/24h) shifts red; clearing SUS removes BOTH decorations on the next
  repaint (no stale-orange rows); `susTint` OFF removes the wash with zero per-element cleanup;
  200-comment thread scrolls smoothly (no new observer). New test asserts the class-stamp + teardown
  logic sliced from a decorator.

---

## 4. WS-B — Reason dropdown: 9 GAW-native presets + Custom (MUST)
- Define `const SUS_REASONS = [...]` near `VIOLATIONS` (~488, the tone reference), each an
  `{emoji, label}` (or plain-string) entry with a leading `[tag]` token (human-readable AND
  machine-groupable later from one free-text field — zero schema change). Final list:
  ```
  [evasion]  Ban evasion / known alt
  [shill]    Concern troll / manufactured doubt
  [doomer]   Doomer / blackpill / demoralization
  [spam]     Spam / self-promo / PAYtriot
  [slop]     Low-effort / copypasta / AI slop
  [divisive] Divisive / race-baiting / brigading
  [fringe]   Off-topic / fringe (flat earth, chemtrails)
  [cross-win] Bad conduct on other .WINs
  [watch]    Watch - pattern forming, no single hit
  Custom...
  ```
- The dropdown value IS the full `"[tag] label"` string, passed verbatim as the `reason` param to
  `modSusMark` (mirrors ~13987). **Cap client-side to 200** to match the schema.
- **`Custom...`** falls back to the existing `prompt()` on that one branch only (stores whatever the
  mod types, no forced tag). Reason stays **OPTIONAL** — mark must still succeed with empty reason
  (preserves the `(no reason)` fallback ~15234). Single-select.
- Wire the SAME menu in BOTH the action-strip control (WS-C) and as the replacement for the raw
  `prompt()` at ~13986 (the tooltip 'sus' path).
- **`[CRITIC]`** keep the source strings ASCII-clean (` / `, ` - `, plain `[brackets]`, no smart
  quotes / em-dash inside the literal); carry any emoji as `\u{...}` in `new_string` only.
- **NO server-side reason enum/validation** (forbidden deploy). Presets are pure client strings.

---

## 5. WS-C — One-click Flag/Clear SUS control in the action strip (MUST)
- **`[CRITIC]` Read `buildActionStrip` (~12194) first** — it early-returns on
  `item.dataset.gamStrip === '1'` (~12195) and only injects where a `[data-action=ban]` control
  exists (~12199). `author` is available ~12203.
- After the Ban-Author block, append a **state-aware** control cloning the `gam-strip-drop` /
  `gam-strip-menu` idiom (~12209-12256). Compute `const lk = String(author||'').toLowerCase(); const isSus = _susState.rows.has(lk);`
  - **Not sus →** `🚩 Flag SUS ▾` opening a menu of `SUS_REASONS` + `Custom...`; each item →
    `_gamMarkSusFromStrip(author, label)`. Reuse the exact menu-toggle handler (~12239).
  - **Already sus →** a single `✓ SUS ✕` button, `title = 'SUS by ' + row.marked_by + ': ' + row.reason`,
    click → `_gamClearSusFromStrip(author)` — **no `confirm()`** (mis-click is trivially reversible;
    SUS is HI-1-safe; Commander hates friction).
  - Real `<button>` with `aria-label` (`Flag <user> as SUS` / `Clear SUS on <user>`), `aria-pressed`
    reflecting state, native focus outline; if a shared touch-target class exists grep it and reuse,
    else inline the size.
- **Shared helpers `async function _gamMarkSusFromStrip(username, reason)` and
  `async function _gamClearSusFromStrip(username)`**, extracted from the proven tooltip path
  (~13981-13994). **`[CRITIC]` they MUST be `async`** (the source uses `await
  chrome.runtime.sendMessage`). Mark: `modSusMark {username, reason, client_op_id: __makeReqId()}` →
  on ok `_susState.rows.set(lk, row)` → `snack` → **`_susApplyDecorations(true)`** (optimistic, so
  the acting mod sees the tint instantly — do NOT wait for the 60s poll) → dispatch
  `gam-roster-change`. Clear mirrors with `modSusClear` + `rows.delete`.
- Retrofit the tooltip 'sus' path (~13975) and the modmail-bar button (hardcoded
  `reason: 'modmail-bar'` ~14493) to call these SAME helpers so all three surfaces converge.
- **`[CRITIC]` The strip builds ONCE per item** (`dataset.gamStrip` guard). After mark/clear the
  button won't flip Flag↔Clear unless a repaint re-runs — dispatch `gam-roster-change` / re-trigger
  the strip injection. Items with no native ban action get no strip (coverage gap — the tooltip
  'sus' fallback covers those; accepted, matches Quick-Remove reach).
- **Acceptance:** every comment/post where the mod has ban power shows one-gesture Flag SUS ▾ (or ✓
  SUS ✕); any mod flags with a preset in one gesture and clears in one click; who+reason on hover;
  acting mod sees tint update instantly; keyboard-operable menu (arrow/Enter/Escape, focus restores).

---

## 6. WS-D + WS-E — Settings toggle + a11y backstop (SHOULD; fold in unless budget forces a cut)
- **WS-D:** `addToggle('SUS Tint', 'susTint', 'Softly tint SUS users comments & usernames (amber; red when hot).', v => { _gamInjectSusTintStyles(); _susApplyDecorations(true); })` immediately after the
  existing `addToggle('Sus Marker','susMarkerEnabled',...)` (~13343). **`[CRITIC]` Read the exact
  `addToggle` signature at ~13343 and the DEFAULTS shape at ~1752 before editing** — don't assume
  arg order. Do NOT reuse `susMarkerEnabled`.
- **WS-E (non-color a11y backstop — non-negotiable, folded into WS-A, not a separate engine):** the
  wash must NEVER be the sole signal (WCAG 1.4.1). The inset left-rail (WS-A `box-shadow`) + the 🚩
  glyph the decorator ALREADY prepends + the container `aria-label` together make a SUS row
  perceivable with the wash off, in forced-colors mode, and to a screen reader. Cap the body wash
  alpha ≤0.09 and do NOT recolor body text (composited contrast stays ≥4.5:1). Route mark/clear
  confirmations through the existing `snack()` (already speaks via the v10.36.16 ungated aria-live
  announcer) — do NOT add a third announce call.

---

## 7. LANDMINES `[CRITIC]` (this file has bitten prior sessions)
- **WRONG OBSERVER (highest):** tint rides `_susDecorateOne`/`_susApplyDecorations` under
  `_gamBodyObs` — NEVER `startSusMarker`/`paintSusMarkers`/`susMarkerEnabled` (the ✗ system).
- **TWIN DECORATORS non-identical:** edit both 14085 and 15188 in place; don't copy-paste verbatim.
- **isNew CONTINUATION:** un-decorate branches fall through for the ⓝ new-account badge; your
  teardown must not assume the branch returns.
- **CLEANUP ON CLEAR:** remove the container class only when no other `[data-gam-sus-decorated]`
  anchor remains in it — else cleared users keep a permanent orange row until reload (worst-
  visibility bug for a curator who clears often).
- **DEATH-ROW ADJACENCY (HI-1):** the tooltip `act==='sus'` branch (~13975) sits one else-if from
  `act==='dr'` (~13960→13966) which calls `addToDeathRow(..., 'sus-flag', ...)` — a real ban path.
  When you converge the tooltip path onto the shared helper, **leave the `dr` branch untouched** and
  never route any preset (esp. `[watch]`/`[evasion]`) into it. Presets are display strings only.
- **ASYNC HELPERS:** `_gamMarkSusFromStrip`/`_gamClearSusFromStrip` must be `async`.
- **STRIP REBUILD GUARD:** `dataset.gamStrip==='1'` blocks re-build; dispatch `gam-roster-change` to
  flip the button after mark/clear.
- **FORCE-REPAINT IS FULL-DOC:** `_susApplyDecorations(true)` does a whole-document
  `querySelectorAll` — fine on a click, NEVER inside the observer/mutation path.
- **CROSS-MOD STALENESS:** `_susState` refreshes on the 60s `_susRefresh` + refocus only (no push —
  that'd need the forbidden deploy). Optimistic local set is correct; don't add a poll shortener or
  socket. Other mods see changes within 60s — accepted.
- **TINT ALPHA FLOOR:** 0.055 on the dark theme is near-invisible by design — but "almost
  imperceptible" can silently mean "invisible," making a shipped feature look unbuilt to a Commander
  who judges by feel. **Keep the inset rail (0.55 alpha) as the real at-a-glance cue**, and confirm
  the wash is visible at all before declaring done.
- **CRLF / escape-text:** anchor Edits on ASCII-only unique strings (e.g.
  `a.setAttribute('data-gam-sus-decorated', '1');`, the `prompt(` literal ~13986, `reason: 'modmail-bar'`
  ~14493). Never paste a rendered emoji into `old_string`; carry `\u{1F6A9}` in `new_string`.
- **VERIFY-FIRST GAPS:** before editing, confirm by grep/Read — the `addToggle` signature (~13343),
  the DEFAULTS shape (~1752), and whether a shared "44px touch-target" CSS class actually exists
  (the spec asserts it; if absent, inline the target size — don't invent a dependency).

---

## 8. BUILD ORDER
1. Scaffolding: `SUS_REASONS` const near `VIOLATIONS` (~488); `susTint:true` default (~1752);
   `addToggle` (~13343). `node --check`.
2. `_gamInjectSusTintStyles()` (clone of ~29312) + call at boot — verify the stylesheet lands.
3. WS-A decorator edits: class-stamp + `aria-label` in BOTH decorate branches (14085 + 15188) +
   symmetric teardown in BOTH un-decorate branches. Verify tint appears on an existing SUS user and
   clears cleanly. **(Highest-risk step — twin discipline + isNew continuation.)**
4. WS-C helpers: extract `async _gamMarkSusFromStrip`/`_gamClearSusFromStrip` from ~13981-13994;
   slice-eval.
5. WS-C control: append the state-aware `gam-strip-menu` control in `buildActionStrip`; wire items
   to helpers + `SUS_REASONS`. Verify flag→tint→clear round-trip in-strip.
6. Convergence: replace the raw `prompt()` (~13986) with the same dropdown (`Custom...` fallback);
   retrofit the modmail-bar site to the shared helper.
7. A11y pass: `aria-label`/`aria-pressed`/focus on the control; contrast cap; single-channel
   announce. `node --check` + slice-eval all new bodies. ONE version bump (`v10.37.0`), CHANGELOG,
   commit, push, build-zip, mirror-to-drive.

New test: `scripts/_pN_sus_rating_smoke_test.mjs` (next free number — `ls scripts/_*.mjs`) slicing
the decorator container-stamp + teardown logic and the mark/clear helpers with stubbed
`chrome.runtime`/`_susState`/DOM; assert: sus user → `.gam-sus-comment` added; hot → `-hot`; clear →
class removed only when no sus anchor remains; helper posts `modSusMark`/`modSusClear` with the
reason; and a static-guard that no new SUS code references `executeBan`/`addToDeathRow` (HI-1).

---

## 9. REPORTING TO COMMANDER
Plain language, no code, no CLI as a call-to-action. Describe what he'll SEE and DO, e.g.: *"Flagged
users' comments and names now carry a faint amber tint (red if they're posting fast), you flag or
un-flag any comment in one click with a dropdown of ready-made reasons, and any mod can clear a flag
instantly."* The only manual step you may ask of him is the extension reload (state it plainly). The
big context to give him: **most of this was already built server-side — you made it visible and
one-click, no new backend.** Verify from your own side first — never "try it and tell me."
