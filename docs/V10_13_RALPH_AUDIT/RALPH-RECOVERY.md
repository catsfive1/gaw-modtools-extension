# RALPH-RECOVERY -- Post-v10.13.4 Failure / Recovery Path Re-Audit

**Auditor:** RALPH-RECOVERY (read-only)
**Repo:** `D:\AI\_PROJECTS\modtools-ext\` @ `9c7655e` (v10.13.4)
**Spec source:** `docs/V10_DESIGN_V2/UIUX2-39_recovery.md` (8-scenario v10.12.3 baseline)
**Cross-refs:** `docs/V10_13_RALPH_AUDIT/RALPH-W2.md` (auth banner audit), `docs/V10_13_RALPH_AUDIT/RALPH-W4.md` (modmail draft mirror audit)
**Waves changing recovery surfaces:** W2 (auth banner severity + auto-attempt + 5s whoami timeout), W3 (snack action button extension; SUS collapsed-strip Unmark), W4 (modmail draft local-mirror read on session miss)
**Date:** 2026-05-10

---

## Summary -- 8 scenarios re-scored

| # | Scenario | UIUX2-39 (v10.12.3) | v10.13.4 today | Delta | Confidence |
|---|---|---|---|---|---|
| A.1 | Auth fail / session expired | GOOD | **BETTER** | W2: 4 reasonSteps branches, severity tiers, auto-attempt before banner | High |
| A.2 | SW restart mid-action | PARTIAL | **PARTIAL (unchanged)** | Banner still says "Extension was reloaded" -- conflates SW restart and ext reload | High |
| A.3 | Extension reload / context invalidated | GOOD | **GOOD (unchanged)** | Orphan banner idempotent; NO pre-banner textarea flush (E.2 not shipped) | High |
| A.4 | Network outage | WEAK | **WEAK (unchanged)** | CB still auto-probes; no offline banner (E.4 not shipped) | High |
| A.5 | Quota exceeded | MISSING | **MISSING (unchanged)** | Silent swallow on `.set()` failures; no quota detection (E.5 not shipped) | High |
| A.6 | SUS unmark accident | MISSING | **MIXED** | W3 added Unmark on collapsed strip (UX win) but did NOT wrap with `withUndo` Tier B (E.3 not shipped). The footgun is now LARGER -- a faster path to fire an undoable accident. Net regression on accident risk. | High |
| A.7 | Wrong-user ban | GOOD | **GOOD (unchanged)** | `withUndo` Tier A 20s intact; expiry only SR-announces, no visible snack (E.7 not shipped) | High |
| A.8 | Modmail draft lost across SW restart | MISSING | **PARTIAL** | W4 wired `gam_modmail_drafts_local` read on cold session in BOTH panel (`renderDetail` L17297-17319) and popover (`loadList` L17511-17529); panel surfaces "Draft restored" chip (L17324-17331); popover does NOT surface chip and may race (RALPH-W4 F5). **Macro drafts (`gam_macro_drafts_local`) for Mod Console BAN/MESSAGE tabs still session-only -- read sites L9003, L9838, L10055, L10267 do NOT fall back to local mirror.** | High |
| **NEW A.9** | **W2 5s whoami timeout: late resolve discarded** | n/a | **NEW WEAK** | If `popupRpc('modWhoami')` resolves after the 5s timer fires, both success (popup.js:1884) and reject (L1934) paths early-return on `_whoamiTimedOut`. Tab stays in State A permanently with valid creds -- no recovery without manual page reload. | High |

**Tally:** 1 BETTER (A.1), 4 unchanged at original score (A.2, A.3, A.4, A.5, A.7), 1 MIXED (A.6 -- net regression on accident risk despite UX win), 1 PARTIAL improvement (A.8 -- modmail covered, macros still gap), 1 NEW WEAK scenario discovered (A.9).

**Net:** the corpus moved forward on auth (W2) and modmail drafts (W4), STILL has the same orphan banner / network / quota / SUS-undo / undo-expiry gaps UIUX2-39 named, AND introduces one new gap via the 5s timeout pattern that was added to fix a different problem.

---

## Section A -- Scenario-by-scenario re-score

### A.1 Auth fail -- session expired / token invalid -- **GOOD -> BETTER**

**Status today:**
- 4 severity tier color-codes (`__authBannerSeverity`, modtools.js:25674-25713): setup amber, connectivity yellow, credential amber, unknown red.
- 4 distinct `reasonSteps` branches: `no_token`, `short_token`, `fetch_failed`/`no_response`, `whoami_status`, `whoami_empty` (modtools.js:25729-25800).
- Auto-attempt chain `preloadSecrets() + sync + revalidate` before banner (modtools.js:25925-25954). Eligible reasons exclude `no_token` (correctly -- nothing to rehydrate).
- `[Force re-hydrate]`, `[Open ModTools popup]`, `[Dismiss]` buttons unchanged. Force re-hydrate retry on fail surfaces inline.

**Deltas vs UIUX2-39:**
- ALL FOUR original gaps from §A.1 partly addressed:
  - "No auto-attempt before banner appears" -> SHIPPED (W2)
  - "All failure reasons share the same red background" -> 4 tier colors SHIPPED (but see open issue below)
  - "No step indicator in reasonSteps list" -> step indicators ("Step 1 of 3:") SHIPPED in copy
  - "Banner does not dismiss automatically on storage.onChanged" -> NOT SHIPPED. The `chrome.storage.onChanged` listener at modtools.js:1761 only re-hydrates `_secretsCache`. There's no auto-dismiss of `#gam-auth-fail-banner` on subsequent successful storage write. User must click `[Force re-hydrate]` or refresh.

**Open issues from RALPH-W2 (corroborated):**
- `setup` (rgba 245,158,11) and `credential` (rgba 240,160,64) tiers are visually indistinguishable amber. RALPH-W2 Finding B. Spec promised 4 tiers, code paints 3 effective tiers.
- W2 Finding A (token-age dead code in `__applyTierGate`): not a recovery path issue per se, but the banner's "Token expired - rotate now" red branch is unreachable for the typical mod because `_ageDays = -1` always. So 90+ day tokens never trigger their own recovery banner.
- Auto-attempt timing claim (~150-400ms) is closer to 1-1.5s on cold-everything (RALPH-W2 Finding 2). User sees a longer silent gap before banner, then banner appears -- not awful, but not the spec promise.

**Verdict:** material improvement from UIUX2-39 baseline. Still has the storage.onChanged auto-dismiss gap (low frequency, low pain). Color collision is a UX nit, not a recovery-path defect.

---

### A.2 SW restart mid-action -- **PARTIAL (unchanged from UIUX2-39)**

**Status today:** `_gamShowExtOrphanedBanner` (modtools.js:7492-7512) is unchanged from v10.12.3. Banner text:

```
ModTools updated. The extension was reloaded -- refresh this page to reconnect.
```

This text fires for BOTH:
- True extension reload / context invalidated (correct framing)
- SW restart with message-port-closed (incorrect framing -- ext was NOT reloaded)

**Detection at:** modtools.js:23788, 23797, 23844, 23887 -- all sites that catch `EXT_CONTEXT_INVALIDATED` route to the same banner regardless of cause code.

**UIUX2-39 §C.2 / §E.6 fix:** thread cause through, branch the title text -- NOT SHIPPED.

**UIUX2-39 §E.2 fix (textarea flush before banner):** NOT SHIPPED. The orphan banner does NOT pre-flush textarea draft content to the local mirror before rendering. Last-keystroke 350ms debounce gap remains.

**Verdict:** unchanged. Same severity (low -- refresh works either way; mods may refresh unnecessarily).

---

### A.3 Extension reload / context invalidated -- **GOOD (unchanged)**

**Status today:**
- Idempotent banner via `_gamExtOrphaned` flag (modtools.js:7493).
- Snack noise routed to banner (modtools.js:7522-7524) -- still suppresses spam per orphaned RPC.
- `[Reload page]` button works.
- Modmail draft mirror NOW READS on context-invalidation -> page-refresh path (W4). So drafts SURVIVE the orphan->reload cycle for modmail (not for macro/Mod Console drafts).

**Net change:** the recovery gap closed for modmail (W4); same gap remains for macro drafts. Still good overall.

---

### A.4 Network outage / timeout -- **WEAK (unchanged)**

**Status today:**
- Circuit breaker auto-probe behavior unchanged (modtools.js rpcCall CB at L22969 area).
- `pollSessionHealth` red dot unchanged.
- NO offline indicator beyond session dot. UIUX2-39 §E.4 not shipped (it's in v10.14+ deferred backlog as D-30).

**Verdict:** unchanged. Same gap. Mod still cannot distinguish "I'm offline" from "auth expired" without clicking the session dot.

---

### A.5 Quota exceeded -- **MISSING (unchanged)**

**Status today:**
- `chrome.storage.local.set()` failures still silent-swallow at every callsite. Searched modtools.js for `QuotaExceeded` / `quota_exceeded` / `quota exceeded` -- 1 incidental hit (`AI quota exhausted` text) and zero handling code.
- Diag tab gauge (UIUX2-07 D spec) shows pct of 5MB; mod must open Diag tab proactively.
- UIUX2-39 §E.5 not shipped (it's in v10.14+ deferred backlog as D-31).

**Verdict:** unchanged. Same gap. No detection -> no UI -> silent data loss.

---

### A.6 SUS user accidentally unmarked -- **MIXED (W3 made the path easier without adding undo)**

**Status today:**
- W3 ADDED collapsed-strip Unmark button (modtools.js:18290-18314). UIUX2-10 v1 promise fulfilled -- 2-click recovery from accidental SUS instead of 3-click via drill panel.
- The strip Unmark fires `rpcCall('modSusClear', ...)` IMMEDIATELY (L18299). NO `withUndo` wrapper.
- The drill-panel Unmark (modtools.js:18142-18162) ALSO fires immediately. NO `withUndo` wrapper.
- UIUX2-39 §E.3 (wrap with `withUndo` Tier B 5s window) NOT SHIPPED.
- `withUndo` infrastructure exists (modtools.js:7322), Tier B is functional (used at L6183, L6184, L6187, L10363, L10723), and the snack-action-button extension shipped in W3 (used at modtools.js:18994-19009 for DR Cancel All) provides the perfect surface for SUS undo. The plumbing is there; it just isn't wired.

**Why this scores worse than UIUX2-39's MISSING:** UIUX2-39's recovery cost was "3-5 clicks, context switch" because the user had to navigate to user profile and re-mark. W3 made the unmark path FASTER (collapsed strip, one click) WITHOUT adding the safety net. The SUS popover is now optimized for a destructive action with no recovery affordance. Worse than v10.12.3 in accident risk; better in recovery cost. Net: a footgun that fires faster.

**Fix path (out of scope):** wrap both unmark sites with `withUndo` Tier B + reuse the W3 snack action extension. ~30-line change. The inverse function would call `modSusMark` with a generic reason (UIUX2-39 §E.3 example provided).

**Verdict:** MIXED. UX improvement on success path, undo gap unchanged from UIUX2-39, but accident-risk surface area increased.

---

### A.7 Wrong-user ban -- **GOOD (unchanged)**

**Status today:**
- `withUndo` Tier A 20s wired for ban (modtools.js:9746, 10440 area).
- `_setUndoSlot` timer fires `_gamUndoAnnounce('Undo window closed.')` at expiry (modtools.js:7224-7228) -- but this is SR-LIVE only; no visible snack.
- Ctrl+Z / [U] keyboard handler intact (L7308-7318).
- UIUX2-39 §E.7 (visible "undo window expired" snack) NOT SHIPPED. Toast self-removes silently at TTL+400 (L7288-7290).

**Verdict:** core recovery path good; expiry-notification gap unchanged. Sighted user has no visible cue when the undo window closed.

---

### A.8 Modmail draft lost across SW restart -- **MISSING -> PARTIAL**

**Status today:**

**Modmail panel path (`renderDetail`, L17297-17319):** PASS. Reads `chrome.storage.session.get('gam_modmail_drafts')` first; on `!cached`, falls back to `chrome.storage.local.get('gam_modmail_drafts_local')` with `(Date.now() - savedAt) < 24h` TTL check. Sets `_restoredFromLocal=true`. Prepends green `✓ Draft restored from local` chip at L17324-17331 (UIUX2-39 §E.1 fully shipped for this surface).

**Modmail popover path (`loadList`, L17511-17529):** PASS-with-race. Same nested fallback chain, but:
- Race: the `chrome.storage.session.get -> chrome.storage.local.get` chain is async; `_loadModmailList` may render rows BEFORE `__draftCache` is populated. RALPH-W4 Finding F5 (MEDIUM). Cold-cache popover may render rows with empty drafts.
- No `Draft restored` chip in popover path (RALPH-W4 F5 second half). Mod sees drafts populate without acknowledgment.

**Macro drafts (`gam_macro_drafts`):** STILL MISSING. Read sites that DO NOT fall back to local mirror:
- modtools.js:9003 -- Mod Console BAN tab `ban_msg` macro restore
- modtools.js:9838 -- ban modal v2 macro restore
- modtools.js:10055 -- Mod Console MESSAGE tab `mm_reply` macro restore
- modtools.js:10267 -- legacy modmail reply macro restore

The `gam_macro_drafts_local` key IS WRITTEN by `_mirrorDraftToLocal` (L25632) at every macro draft session save (called at L9253, L9269, L10206, L10223). The mirror exists -- it's just not read on cold session.

**UIUX2-39 §E.1 explicitly named both keys** (`gam_modmail_drafts_local` AND `gam_macro_drafts_local`) as the fix scope. SHIPMASTER §5 W4 acceptance criteria L450 only listed `gam_modmail_drafts_local`. The macro draft side was silently dropped from W4 scope.

**Net:** modmail surface fixed (with one MEDIUM race in popover path, RALPH-W4 F5). Macro drafts (ban message, modmail reply, mm_reply) still silently lose data on SW restart.

---

### A.9 NEW: W2 5s whoami timeout -- late-resolve discards valid auth -- **NEW WEAK**

**Trigger:** popup opens, `popupRpc('modWhoami')` is in flight, takes >5s (slow worker, cold edge, slow connection).

**Detect:** `_whoamiTimer` fires at 5s (popup.js:1876-1880):
```js
const _whoamiTimer = setTimeout(function() {
  _whoamiTimedOut = true;
  try { __tokSetState('first-run'); } catch(_){}
  try { _cardAuthFailed(); } catch(_){}
}, 5000);
```

**State machine:**
1. `_whoamiTimedOut = true` AND State A rendered AND `gam-card-urgent` painted on tokens card.
2. Whoami eventually resolves (either success at L1883 or reject at L1933).
3. Both paths early-return on `if (_whoamiTimedOut) return` (L1884, L1934).
4. **Result:** valid whoami response is discarded silently. Tab stays in State A. Card stays urgent-flagged. Tier render, lead section, KPI load all skipped.
5. **No automatic retry path.** User must close and re-open the popup, OR refresh the page (which re-runs init), OR paste the token again to trigger storage.onChanged + re-evaluate (which won't actually help, since `__applyTierGate` is only called on init/load and not on storage updates -- verified by grep on `__applyTierGate` -- only called from `loadToken`/`init`).

**Why this is new:** UIUX2-39 audited v10.12.3, which had no 5s timeout pattern. W2 ADDED the timeout to fix the spec's stated risk ("If whoami never resolves AND never rejects within 5s, the Tokens tab would otherwise stay in its pre-render limbo"). The fix introduced a new failure mode: late-but-valid resolution.

**Severity:** WEAK. Most whoami calls resolve in <1s warm. The window is the cold-everything edge case (cold worker, cold SW, slow client connection). When it fires, the user sees a stuck State A despite valid auth. They will likely close the popup and re-open -- which works -- but they have no signal that this is the recovery path.

**Fix candidate (out of scope):**
- On late-success: re-trigger `__applyTierGate()` rather than bail. Or set up a `re-attempt-pending` flag and run the State B branch from the resolve handler regardless of timeout.
- Or: lengthen the timer to 10-15s (matching the rpcCall AbortController timeout of 15s at L810-811). Less aggressive recovery, but eliminates the race.
- Or: on timeout, render State A WITH a "Reconnecting..." overlay that auto-clears when whoami resolves and triggers state transition -- so the late-success path lands in the right state.

**Verdict:** new low-frequency gap introduced as a side-effect of a useful safety net. Worth mentioning, low priority to fix.

---

## Section B -- Scenario table (combined)

| # | Scenario | Detected? | Auto-Attempt? | User Prompt? | Undo Window? | Recovery Action? | Score | Change vs UIUX2-39 |
|---|---|---|---|---|---|---|---|---|
| A.1 | Auth fail | YES (session dot + auto-attempt) | YES (W2) | YES (banner with severity tiers + step indicators) | NO | YES ([Force re-hydrate] + [Open popup]) | **BETTER** | Auto-attempt + tiers + steps shipped |
| A.2 | SW restart | PARTIAL (banner, wrong text) | NO | YES | N/A | YES ([Reload page]) | **PARTIAL** | unchanged |
| A.3 | Ext reload | YES (orphan banner) | NO | YES (idempotent) | N/A | YES ([Reload page]) | **GOOD** | modmail drafts now survive (W4) |
| A.4 | Network outage | PARTIAL (CB + session dot) | YES (CB probe) | NO | NO | NO | **WEAK** | unchanged |
| A.5 | Quota exceeded | NO | NO | NO | NO | NO | **MISSING** | unchanged |
| A.6 | SUS unmark | N/A | N/A | NO (no undo) | NO | NO | **MIXED** | strip-Unmark UX win without undo |
| A.7 | Wrong-user ban | N/A | N/A | YES (toast 20s) | YES (Tier A) | YES (Ctrl+Z / [U]) | **GOOD** | unchanged; expiry-snack still SR-only |
| A.8 | Modmail draft lost | YES (panel chip) | YES (W4 read) | n/a (auto-restore) | N/A | YES (auto-restore) | **PARTIAL** | modmail panel YES, popover race + no chip; macros NO |
| **A.9** | **5s whoami late-resolve** | **PARTIAL** | **NO** | **NO** | **N/A** | **NO (manual reopen)** | **NEW WEAK** | new gap from W2 |

---

## Section C -- Findings (P-ordered)

### Finding R-01 (P1) -- Macro draft local-mirror read NOT shipped

**Where:** modtools.js L9003, L9838, L10055, L10267 (Mod Console BAN tab + ban modal + Mod Console MESSAGE tab + legacy modmail reply).

**What's there:** all 4 sites read `chrome.storage.session.get('gam_macro_drafts')` only. None falls back to `chrome.storage.local.get('gam_macro_drafts_local')`.

**What's missing:** the W4-style nested-async fallback chain that landed in modtools.js:17297-17319 for modmail. The `_mirrorDraftToLocal` write side IS firing (L9253, L9269, L10206, L10223 -- every session save mirrors).

**Why this matters:** the highest-friction draft is the ban modal MESSAGE -- mods often type 2-3 paragraphs of detailed justification, then SW restart silently nukes the textarea. UIUX2-39 §C.4 explicitly named this surface as part of the §E.1 fix. SHIPMASTER §5 W4 ACs only named the modmail half; the macro half got dropped.

**Spec gap:** UIUX2-39 §E.1 example fix block is generic ("`gam_modmail_drafts_local` // or `gam_macro_drafts_local`"), but SHIPMASTER L450 line item picks only the modmail key. W4 implemented to spec; spec was incomplete.

**Fix size:** ~6 lines per site, 4 sites = ~24 lines. Same shape as the W4 modmail fix, plus the green chip via `SuperMod._showDraftChip` (already wired for the session-cache hit path at L9009).

**Severity:** P1. Real data loss for the most common ban-modal use case. Mods will either re-type from scratch (frustration) or accept the loss (lower-quality bans).

---

### Finding R-02 (P2) -- SUS Unmark on collapsed strip has no undo

**Where:** modtools.js L18290-18314 (W3 collapsed strip) AND L18142-18162 (drill panel Unmark).

**What's there:** both sites fire `rpcCall('modSusClear', ...)` immediately, then remove the row from DOM and update title count. No `withUndo` wrapper. No 5s/10s undo toast.

**What UIUX2-39 §E.3 prescribed:** wrap with `withUndo` Tier B 5s. Inverse function calls `modSusMark` with a generic reason placeholder. Same shape as the existing Tier B usages (L6183, L6184, L6187, L10363).

**Why W3 made this worse:** W3 added the collapsed-strip path so accidents fire faster (1 click instead of 2-3 to expand drill). UX improvement on intent path; accident-risk magnified.

**Fix size:** ~25 lines (rough estimate from UIUX2-39 §E.3 example). Plumbing exists. The W3 snack-action-button extension (modtools.js:7552-7587) provides the perfect surface, identical to the DR Cancel All undo wired at modtools.js:18994-19009.

**Severity:** P2. SUS Unmark is destructive but not nuclear (the user is still flagged in retroactive search if logged elsewhere). Frequency is moderate-low (Unmark is used on false-positive recovery, not as a daily action). But the broken-windows / Bloomberg professionalism standard says: every destructive action that fires from a 1-click path needs a recovery affordance.

---

### Finding R-03 (P2) -- Auth banner does not auto-dismiss on storage.onChanged

**Where:** modtools.js:1761-1785 (storage listener -- updates `_secretsCache` only).

**What's missing:** when the user pastes a token in the popup, `gam_settings.workerModToken` updates. `_secretsCache` re-hydrates. But `#gam-auth-fail-banner` (if shown) does NOT auto-dismiss. User must click [Force re-hydrate] to validate the new token.

**UIUX2-39 §A.1 named this gap.** Not shipped in W2.

**Fix size:** ~15 lines. In the `if (updated)` block at modtools.js:1777, fire `__validateModAuth()` async. On success: remove `#gam-auth-fail-banner` and re-call `init()` (or at least the post-auth UI bringup). On fail: leave banner.

**Severity:** P2. Low frequency (banner is shown rarely), but the manual click is a stale meatbag step (CLAUDE.md §10 / §11). Auto-dismiss closes the loop without operator attention.

---

### Finding R-04 (P3) -- SW restart vs ext reload banner text conflation

**Where:** modtools.js:7492-7512 (`_gamShowExtOrphanedBanner`).

**What's there:** single banner text "ModTools updated. The extension was reloaded -- refresh this page to reconnect." regardless of whether the trigger is SW restart (background re-activation) or ext reload (CRX context invalidated).

**UIUX2-39 §C.2 / §E.6 fix:** thread cause through `_gamShowExtOrphanedBanner(cause)`, branch the title text. SW-restart variant: "Background service restarted. Refresh to reconnect." Ext-reload variant: "Extension was reloaded. Refresh to reconnect."

**Fix size:** ~10 lines. Cause code is already available at the catch sites (rpcCall returns `EXT_CONTEXT_INVALIDATED` for true reload, message-port-closed for SW restart -- L23788-23887 catches differ).

**Severity:** P3. Cosmetic. Refresh works either way. Reduces mod confusion in support tickets.

---

### Finding R-05 (P3) -- Orphan banner does not flush textarea drafts before render

**Where:** modtools.js:7492-7512 (orphan banner trigger).

**What's missing:** UIUX2-39 §C.3 / §E.2 -- on orphan detection, synchronously flush every open textarea's content to local mirror before showing the banner. Closes the 350ms debounce gap.

**Why it matters more now:** W4 wired the local-mirror READ path for modmail. The flush WRITE on orphan would fully close the loop. Without flush, the up-to-350ms-of-keystrokes gap persists; with flush, it shrinks to "the keystroke you were on".

**Fix size:** ~15 lines. Iterate `document.querySelectorAll('textarea[data-gamMacroDraftAttached]')` in the banner-render function, call `_mirrorDraftToLocal` synchronously per textarea before banner DOM injection.

**Severity:** P3. Combined with R-01 (macro draft read fallback), this would close the macro-draft + modmail-draft loss case to ~zero. On its own, it only closes the corner-case 350ms gap.

---

### Finding R-06 (P3) -- Undo-window-expired notification is SR-only, not visible

**Where:** modtools.js:7224-7228 (`_setUndoSlot` timer expiry).

**What's there:** `_gamUndoAnnounce('Undo window closed.')` -- aria-live-only.

**What's missing:** UIUX2-39 §E.7 -- visible snack at expiry. Sighted user has no cue when the 20s window closed; they may try to Ctrl+Z 25s after the action and silently get nothing.

**Fix size:** ~5 lines. Capture `_undoSlot.label` before clearing, call `snack('Undo window expired: ' + label, 'info')` in the timer callback.

**Severity:** P3. Polish. UIUX2-39 already noted this; deferred backlog item D-32.

---

### Finding R-07 (P3) -- W2 5s whoami timeout discards late-resolved success

**Where:** popup.js:1876-1939 (`__applyTierGate` body).

**What's there:** 5s timer forces State A on timeout. Late-success/late-reject early-return without state transition.

**State stuck:** popup permanently in State A despite valid creds. User must reopen popup or refresh page.

**Fix candidates:**
- On timeout fire, render State A WITH "Reconnecting..." overlay; clear overlay when whoami eventually resolves and run the State B branch.
- Or: `__applyTierGate` becomes idempotent via guard flag; late-success calls `__applyTierGate()` recursively.
- Or: extend timeout to 10-15s (matches rpcCall AbortController). Lower frequency of trigger.

**Severity:** P3 / WEAK. Cold-everything edge case. Low frequency, low pain (close+reopen recovers).

---

## Section D -- Recommendations (out of scope, for handoff)

### Priority order if a future wave revisits recovery:

| Rank | Finding | Effort | Surface | Why |
|---|---|---|---|---|
| 1 | R-01 (macro draft local-mirror read) | ~30 min | modtools.js 4 sites | Real data loss; mods cannot tolerate losing a typed ban message |
| 2 | R-02 (SUS Unmark withUndo Tier B) | ~30 min | modtools.js 2 sites | W3 made this footgun easier without recovery; net regression |
| 3 | R-03 (auth banner auto-dismiss on storage.onChanged) | ~15 min | modtools.js:1777 area | Eliminates manual [Force re-hydrate] click after popup token paste |
| 4 | R-05 (orphan banner textarea flush) | ~15 min | modtools.js:7494 | Closes the 350ms write-side gap; pairs cleanly with W4 read-side |
| 5 | R-04 (SW restart vs ext reload banner text) | ~10 min | modtools.js:7500-7505 | Cosmetic accuracy; reduces support friction |
| 6 | R-06 (undo expiry visible snack) | ~5 min | modtools.js:7227 | Polish; pairs with §A.7 |
| 7 | R-07 (5s timeout late-resolve) | ~30 min | popup.js:1876-1939 | New low-frequency gap from W2 |

**Total: ~2h 15min if all 7 ship together.** P1+P2 alone is ~75 min and closes the two named regressions (macro draft loss, SUS undo gap) plus the auth auto-dismiss.

### Cross-wave conflict check

- W2 (auth banner, popup.js timeout) and W4 (modmail draft mirror) ship cleanly together.
- W3 (SUS strip) is the source of R-02; the W3 snack-action-button extension is the SAME plumbing the fix needs.
- None of W1 / W5 touch recovery surfaces. No conflict.

### No code changes were made in this audit.

---

## Section E -- Hold-the-line items (from UIUX2-39 §G, re-verified)

These recovery affordances STILL work in v10.13.4. Do not regress.

| Feature | Implementation | Location | Status |
|---|---|---|---|
| Auth banner with severity tiers + reasonSteps + auto-attempt | `__authBannerSeverity`, `__showAuthFailBanner`, auto-attempt chain | modtools.js:25674-25954 | **enhanced (W2)** |
| `[Force re-hydrate]` retry + init() | unchanged | modtools.js | OK |
| Session dot live probe on click | `setSessionHealthy` + dot click | modtools.js | OK |
| Ext context orphan banner (idempotent) | `_gamShowExtOrphanedBanner`, `_gamExtOrphaned` flag | modtools.js:7492-7512 | OK |
| snack() routes orphan noise to banner | unchanged | modtools.js:7522-7524 | OK |
| Wrong-user ban: withUndo Tier A 20s, Ctrl+Z | `withUndo`, `_executeUndo`, U-key listener | modtools.js:7322-7355, 7308-7318 | OK |
| Draft local mirror write (modmail + macro) | `_mirrorDraftToLocal` on every session set | modtools.js:25632 | OK |
| Modmail draft local-mirror READ on session miss (panel) | nested async fallback + Draft restored chip | modtools.js:17297-17319, 17324-17331 | **new (W4)** |
| Modmail draft local-mirror READ on session miss (popover) | nested async fallback (no chip; race per RALPH-W4 F5) | modtools.js:17511-17529 | **new (W4)** |
| Draft 24h TTL on read-side | TTL widened to 24h in W4 | modtools.js:17313, 17523 | **new (W4)** |
| SW restart token recovery (plaintext-first) | `loadSecrets` plaintext preference | background.js | OK |
| CB auto-probe on half-open | rpcCall CB | modtools.js | OK |
| Diag tab storage usage gauge | `_diagRenderSto` | popup.js | OK |
| Ban preflight 3s arm | preflight() modal | modtools.js | OK |
| Snack action button extension (10s countdown) | `actionLabel` / `onAction` / `actionDurationMs` opts | modtools.js:7526-7587 | **new (W3)** |
| DR Cancel All undo via snack-action | snapshot + restore | modtools.js:18994-19009 | **new (W3)** |

---

*Generated: 2026-05-10. RALPH-RECOVERY. Read-only audit. No code changes in this document.*
