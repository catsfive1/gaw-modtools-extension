# RALPH-TOKENS -- v10.13.4 Tokens Tab Audit (post-W2)

**Scope:** Read-only audit of the Tokens tab implementation shipped in Wave 2 (v10.13.3) against the original UIUX2-02 + UIUX2-19 specs.
**HEAD:** `9c7655e` (v10.13.4 Wave 4 final)
**Files audited:**
- `D:\AI\_PROJECTS\modtools-ext\popup.html` L450-849
- `D:\AI\_PROJECTS\modtools-ext\popup.js` L150-200, L210-287, L1640-1940, L1963-2030, L3295-3531, L3534-3650, L6745-6770
- `D:\AI\_PROJECTS\modtools-ext\popup.css` L284-565
- `D:\AI\_PROJECTS\modtools-ext\modtools.js` L25470-25510, L25670-25960
**Read-only — no source modifications.**

---

## Summary

**Original UIUX2-02 grade (v10.12.3):** **D+** -- structural chaos (3 concerns, zero hierarchy), orphan claim button outside the card, 200ms flash-of-lead-content for non-leads, implicit state machine with flicker, encryption + age metadata invisible, 5-7 click first-run cost.

**Post-W2 grade (v10.13.4):** **B+** -- explicit three-state machine eliminates flash, claim CTA absorbed into State A, leadSection moved inside State C (no orphan), banner severity surfaces age + ENC, auto-attempt suppresses banner on transient failures, dedicated branches for `whoami_empty` and `short_token`, "Open GAW" button on success.

**Why not A:** Five real defects remain (see Findings). The most significant: (1) `_cardAutoCollapseTokens(true)` still gets called on auth success but `#card-tokens` is now a `<div>` not `<details>`, so the call is a half-no-op (CSS class swap works, `removeAttribute('open')` is meaningless). (2) "Re-enter credentials" link is gated to `tier !== 'mod'`, so regular mods who need to repaste a fresh token from their lead never see the affordance. (3) Race window: 5s whoami timeout means a slow worker still gives mods 5 full seconds of pre-render limbo where neither State A nor State B shows. (4) `tab-btn-lead` is HTML-visible by default; the `display:none` only flips on after `__applyTierVisibility` fires, so the lead tab button still flashes for ~150-300ms on every popup open for non-leads (the spec said this was the original P0-07 defect being fixed -- it's STRUCTURALLY fixed inside the card but the **tab button** flash is unaddressed). (5) Auto-attempt limit is per-init not per-session: every popup re-open gets a fresh attempt, which is correct but worth noting.

**Net:** W2 ships the spec, plus or minus the items above. Acceptance criteria 11/13 pass cleanly; 2 with caveats.

---

## Verification table

| Check | Status | Evidence |
|---|---|---|
| **A/B/C three-state render** | PASS | `popup.js` L210-218 -- `__tokSetState` is the single point of truth, swaps visibility on `#tokStateFirstRun` / `#tokStateReturning` |
| **No flash** (State A default-hidden) | PASS | `popup.html` L470: `<div id="tokStateFirstRun" ... style="display:none">` -- both states start hidden, JS reveals after whoami |
| **State leak** (showing both at once) | PASS | `__tokSetState` does `firstRun.style.display = (state === 'first-run') ? '' : 'none'` and the inverse for returning -- mutually exclusive |
| **Missed transitions** | PASS | All 4 paths covered: `loadToken` no-token (L1659), `__applyTierGate` whoami-fail (L1888), `__applyTierGate` whoami-ok (L1913-1921), `__applyTierGate` whoami-timeout (L1876-1880), `__applyTierGate` catch (L1937), `initFirstRunWizard` no-token (L3376), `initFirstRunWizard` has-token (L3371) |
| **`#claimInviteWrap` inside `#tokStateFirstRun`** (R-06) | PASS | `popup.html` L478-481: `<button id="claimInviteBtn"` lives inside L470-529 `#tokStateFirstRun`. Old `#claimInviteWrap` orphan is gone. |
| **`#leadSection` inside `#tokStateReturning`** (P0-07) | PASS | `popup.html` L574-829: `<div id="leadSection" style="display:none">` lives inside L535-831 `#tokStateReturning`. The original `#card-lead` is now an empty shell at L849. |
| **No flash for non-leads** (lead structurally hidden) | PASS w/ caveat | `#leadSection` `display:none` by default + `__applyTierGate` only un-hides for `lead`/`senior_lead`. **However:** the lead **tab button** (`#tab-btn-lead`) at popup.html L59 is still HTML-visible at first paint -- only `__applyTierVisibility` (L1969) flips it. Race window persists for the **nav button**, just not the panel content. |
| **4 severity tiers visually distinguishable** | PASS | `modtools.js __authBannerSeverity` L25674-25713 returns 4 distinct `bg` values: setup amber `rgba(245,158,11,.95)`, connectivity yellow `rgba(217,197,36,.95)`, credential amber `rgba(240,160,64,.95)`, unknown red `rgba(220,40,40,.95)`. **Caveat:** setup-amber `#f59e0b` and credential-amber `#f0a040` are visibly close (same hue, ~20% lightness delta). At a glance they read as "amber" not "two distinct ambers." Title text + label text differ, so taxonomy still reads if read carefully. |
| **`whoami_empty` reasonSteps branch** | PASS | `modtools.js` L25767-25774, distinct from `whoami_status` (correct: server-row stale vs token rotated) |
| **`short_token` reasonSteps branch** | PASS | `modtools.js` L25729-25736, distinct from `no_token` (token-len in step 1, "repaste cleanly" in step 3) |
| **`whoami_empty` reaches render** | PASS | `__validateModAuth` L25502 returns `reason:'whoami_empty'` -> `__showAuthFailBanner(authResult)` L25960 -> `reasonSteps` L25767 branch hit |
| **`short_token` reaches render** | PASS | `__validateModAuth` L25486 returns `reason:'short_token'` -> banner branch L25729 hit |
| **First-run wizard "Open GAW" button** | PASS | `popup.html` L523-526: full-width `<a id="firstRunOpenGaw" href="https://greatawakening.win/" target="_blank" rel="noopener noreferrer" class="tok-cta-primary">`. Plain `<a>`, no JS wiring needed. New tab open is the desired behavior. |
| **Auto-attempt before banner** | PASS | `modtools.js` L25932: `_autoAttemptable = ['fetch_failed','no_response','whoami_status','whoami_empty','short_token','exception']` (correctly excludes `no_token` -- nothing to re-hydrate). L25933 single-cycle limit; L25938 success suppresses banner; L25960 fall-through shows banner with fresh result |
| **Auto-attempt 1-cycle limit** | PASS | No retry loop -- single `_retry = await __validateModAuth()` at L25937 |
| **`firstRunWizardStep1` references purged** | PASS | Grep finds only the historical comment "no separate #firstRunWizard wrapper / Step1" at popup.js L6747 -- no live element reference |
| **ENC chip surfaces always** | PASS | `__tokUpdateBanner` L255-260 unconditionally appends ENC chip (encryption is always-on since v10.11) |
| **Age 60-89d amber warn** | PASS | L280-286: amber `tok-age-warn` "age Nd -- rotate soon" |
| **Age >=90d red expired + rotate-now** | PASS | L262-279: red `tok-age-err` + inline `tok-banner-rotate-btn` that opens management accordion + scrolls to rotate button |

---

## Findings

### F1 [HIGH] -- `_cardAutoCollapseTokens` is a half-no-op on the new `<div>` card

**Where:** `popup.js` L155-165 (`_cardAutoCollapseTokens`), L167-173 (`_cardAuthFailed`), L175-201 (`_cardWizardComplete`); call site L1930.

**What:** The three "card ritual" helpers all do `card.removeAttribute('open')` / `card.setAttribute('open', '')`. This was meaningful when `#card-tokens` was a `<details>` element. In v10.13.3 W2 the HTML was rewritten to `<div class="gam-card" id="card-tokens">` (popup.html L458). `removeAttribute('open')` on a `<div>` is silent no-op as far as collapse behavior is concerned. The CSS class swap (`gam-card-urgent` / `gam-card-order-last`) still functions, but the "auto-collapse on auth success" semantic is gone.

**Impact:** Low functional, medium-conceptual. The State B banner is its own surface -- we don't WANT the card collapsed post-auth in the new design. So this defect is partly self-cancelling. But the dead code is misleading: a future maintainer reading `_cardAutoCollapseTokens` will think it does something it doesn't.

**Spec source:** UIUX2-02 H.2 CONFLICT 1 explicitly flagged this and recommended "preserve `<details>` but do NOT call `_cardAutoCollapseTokens` on auth success. Recommend the latter (safer, smaller diff)." Implementation went the opposite direction -- removed `<details>` but KEPT the call site. Worst of both.

---

### F2 [HIGH] -- "Re-enter credentials" link is gated to `tier !== 'mod'`

**Where:** `popup.js` L2022-2024:
```js
const rsw = $('restartSetupWrap');
if (rsw && tier !== 'mod') rsw.style.display = '';
```

**What:** `#restartSetupWrap` (popup.html L836) starts with `display:none`. The only un-hide path is in `__applyTierVisibility` at L2024, gated to non-mod tiers. So **regular mods never see the "Re-enter credentials" link**.

**Impact:** Workflow break. The whole point of the link is for a mod whose token was rotated and who needs to repaste. With this gate, the path is: regular mod's whoami fails -> sees auth banner on the page -> opens popup -> sees State A wizard. State A works for that case (path-picker has "Raw token" path). But the spec text in UIUX2-02 explicitly says "always rendered, low prominence" so an authed mod can also re-run wizard if needed.

**Spec source:** UIUX2-02 §F:
> Re-enter credentials: always rendered, low prominence

**Severity:** HIGH because it silently inverts spec intent. The mod most likely to need "Re-enter" is a returning mod who pasted a stale token and got into State B with a working but old token -- they have the affordance gone.

---

### F3 [MEDIUM] -- `tab-btn-lead` flashes for non-leads (~150-300ms)

**Where:** `popup.html` L59 (`<button id="tab-btn-lead" class="pop-tab" ...>`) + `popup.js` L1969 (`leadTab.style.display = (tier === 'lead') ? '' : 'none'`).

**What:** The lead tab nav button defaults to visible at first paint. Only after `__applyTierGate` -> `__applyTierVisibility` fires (after the whoami round-trip) does it get hidden for non-leads. This is the same flash-of-wrong-content defect that motivated W2 in the first place -- it was fixed for the `#leadSection` panel content but the tab button itself wasn't moved.

**Impact:** A non-lead opening the popup sees 4 nav tabs flash to 3 a fraction of a second later. Cosmetically the same defect the audit surfaced.

**Mitigation in spec:** UIUX2-02 H.2 CONFLICT 3 said to retain the Lead tab as an empty deep-dive shell (option a). That was done -- but the **flash of the tab button** wasn't addressed. Recommend HTML-default `style="display:none"` on `#tab-btn-lead` and only un-hiding it in `__applyTierVisibility`. Same pattern as `#leadSection`.

---

### F4 [MEDIUM] -- Whoami timeout is 5 seconds with no intermediate state

**Where:** `popup.js` L1876-1880:
```js
let _whoamiTimedOut = false;
const _whoamiTimer = setTimeout(function() {
  _whoamiTimedOut = true;
  try { __tokSetState('first-run'); } catch(_){}
  try { _cardAuthFailed(); } catch(_){}
}, 5000);
```

**What:** If the whoami RPC neither resolves nor rejects within 5 seconds, the tab is forced to State A. Good defensive behavior. **However:** between popup-open and whoami-resolution, both `#tokStateFirstRun` and `#tokStateReturning` are `display:none` (they default-hidden in HTML). The user sees an empty Tokens tab body for up to 5 seconds on a slow network.

**Impact:** First-run users on slow connections see "did the popup break?" empty space. The spec acknowledged this risk (DESIGN_V2_SHIPMASTER §10 noted "Tokens tab three-state machine misses an edge state (whoami pending then drops)") but the fix shipped is reactive (5s timeout) not proactive (showing a skeleton/loading state during the gap).

**Recommendation:** During the gap, show a minimal skeleton inside `#card-tokens` body (e.g., a centered spinner with "Verifying token..." text). 5s with empty body is too long without a signal.

---

### F5 [LOW] -- Auto-attempt is per-init, not per-session

**Where:** `modtools.js` L25932-25954.

**What:** The auto-attempt fires once per `init()` invocation. `init()` runs once per page-load (and possibly on SPA navigation via `installSpaWatcher`). So a browser restart -> fresh page-load -> fresh `init()` -> fresh single auto-attempt. There's no session-storage flag preventing repeat attempts on the same broken state.

**Impact:** Intended. The spec says "per page-load." But if a mod has a permanently-broken token (server row deleted) and reloads the page 50 times in an hour, that's 50 fresh whoami attempts at the worker. Probably fine for current load but a candidate for future rate-limit attention.

**Resolution to question in prompt:** Per-init, which means per page-load, which means browser restart resets it. **This is intended** per the spec -- C1 in UIUX2-19 says "per init" -- but worth noting because the prompt asked.

---

### F6 [LOW] -- `tokenIssuedAt` vs `rotated_at` confusion in age computation

**Where:** `popup.js` L1907-1912 reads `gam_settings.rotated_at` only:
```js
const _ra = _st && _st.gam_settings && _st.gam_settings.rotated_at;
if (_ra) _ageDays = Math.floor((Date.now() - new Date(_ra).getTime()) / 86400000);
```

**What:** UIUX2-02 spec says "Token age tracked via `gam_settings.tokenIssuedAt` / `gam_settings.rotated_at`" -- both. `maintTokenProbe` (the spec's reference, popup.js L4593+) reads both. The W2 implementation only reads `rotated_at`. If a mod has only `tokenIssuedAt` populated (e.g., very-first-claim with no rotation yet), the age computation falls through to `_ageDays = -1` -> banner shows green "Token active" with no age info at all.

**Resolution to question in prompt:** If `tokenIssuedAt` is null/0 AND `rotated_at` is also null, `_ageDays = -1`, severity defaults to `'ok'` (green), banner shows "Token active" with no age. Defaults to "fresh-looking" not "ancient" -- which is **wrong for a token that's actually 80 days old but never rotated**. A first-claim token with `tokenIssuedAt = 2026-02-15` and `rotated_at = null` would render as if it's brand new.

**Severity:** LOW because in practice every token gets `rotated_at` populated on first save. But it's a quiet correctness bug.

**Recommendation:** Use `rotated_at || tokenIssuedAt` in the age computation. One-line fix.

---

### F7 [LOW] -- Lead-tab nav guard: clicking flash-visible Lead tab during init shows blank panel

**Where:** `popup.html` L848-849 -- `tab-panel-lead` has inline `style="display:none"`. `setTab('lead')` (popup.js L3573-3576) sets `panel.hidden = false`, which translates to removing the `hidden` attribute. **But** the inline `style="display:none"` is the dominant rule -- removing the `hidden` attribute does not override `style="display:none"`.

**What:** A non-lead clicks the tab-btn-lead during the ~200ms flash window -> `setTab('lead')` runs -> `tab-btn-lead` gets `aria-selected="true"` -> all other panels get `hidden=true` -> `tab-panel-lead` is told `hidden=false` but `style="display:none"` keeps it invisible. Net result: empty popup body, no tab content visible at all, until the user clicks another tab.

**Impact:** Cosmetic. The flash window is very short and the user is probably about to lose the affordance entirely (`__applyTierVisibility` will hide the button). But it's a state where clicking shows nothing.

**Recommendation:** Either (a) remove the inline `style="display:none"` from `#tab-panel-lead` and let `setTab` drive visibility (consistent with all other panels), OR (b) add the lead-tab-button HTML-default-hidden fix from F3 so the click can never happen.

---

### F8 [LOW] -- Two amber severity tiers ("setup" + "credential") are visually too close

**Where:** `modtools.js __authBannerSeverity` L25677 (`#f59e0b`) vs L25699 (`#f0a040`).

**What:** Setup-amber `rgba(245,158,11,.95)` and credential-amber `rgba(240,160,64,.95)` are within ~5% RGB distance. To a quick-glance read, both render as "amber banner" -- the user has to read the title line (`Setup needed` vs `Token needs update`) to tell them apart.

**Impact:** Spec said 4 distinct severity tiers. We have 4 named tiers but visually 3 (red, yellow, amber-ish). Title-text disambiguation is sufficient for accessibility but the at-a-glance pattern recognition the spec invoked isn't fully delivered.

**Recommendation:** Shift credential amber toward redder hue (e.g., `#e8841f`) so it reads as "warm-amber" vs setup's "cool-amber." Or (better) keep 3 visual tiers and merge setup + credential into one "needs-attention" tier with distinct titles -- the user-actionable distinction is title, not color.

---

## Recommendations (prioritized)

**P1 (ship before next release):**
1. **F2 fix** -- remove the `tier !== 'mod'` gate on `restartSetupWrap` reveal. Either always-show after `loadToken` resolves, or show conditionally on hasToken-but-may-be-stale. One-line fix.
2. **F3 fix** -- add HTML-default `style="display:none"` to `#tab-btn-lead` and make `__applyTierVisibility` flip-on for `tier === 'lead'`. Eliminates the residual lead-tab-button flash. Mirrors the `#leadSection` pattern.

**P2 (next minor):**
3. **F1 cleanup** -- delete or repurpose `_cardAutoCollapseTokens` and the `removeAttribute('open')` calls in `_cardWizardComplete` / `_cardAuthFailed`. The CSS class swaps are the only meaningful actions; collapse the helpers to just those.
4. **F4 fix** -- skeleton/spinner in the Tokens tab body during the whoami gap (>500ms). Even a single "Verifying..." line is better than empty.
5. **F6 fix** -- `_ra = ... rotated_at || ... tokenIssuedAt`. One-line fallback.

**P3 (polish):**
6. **F7 fix** -- remove inline `style="display:none"` from `#tab-panel-lead` so panel visibility is consistent across all 5 tabs.
7. **F8 reconsider** -- if visual distinctness across 4 severity tiers is the goal, shift credential amber. If 3 tiers + title-text is acceptable, document the choice in UIUX2-19 and close the spec gap.

**No-action (intended behavior or already addressed):**
- F5 (per-init auto-attempt) -- intended per spec.
- ENC chip always-shown -- correct since v10.11 encryption is always-on.

---

*Audit complete. Read-only -- no source modifications, no git operations performed.*
