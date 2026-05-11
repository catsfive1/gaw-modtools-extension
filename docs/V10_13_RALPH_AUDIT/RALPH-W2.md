# RALPH-W2 — Wave 2 (Tokens tab three-state + auth banner severity + first-run Open GAW) Audit

**Auditor:** RALPH-W2 (read-only)
**Repo:** `D:\AI\_PROJECTS\modtools-ext\` @ `9c7655e` (v10.13.4)
**W2 commits:** `60bf175` (main) + `6925ca2` (symmetric-flicker fix)
**Spec:** `docs/V10_DESIGN_V2/DESIGN_V2_SHIPMASTER.md` Section 5 Wave 2 (lines 327-352)

---

## Summary

W2 ships the visible structural refactor cleanly. The three-state machine
(`__tokSetState`), the orphan absorption (`#claimInviteWrap` -> State A), the
purge of `#firstRunWizardStep1`, the move of `#leadSection` into State C, the
banner severity tiers, the auto-attempt chain, and the dedicated `whoami_empty`
/ `short_token` reasonSteps branches are all present and structurally correct
in shipped code. The 6925ca2 fast-path (default-hide both states + immediate
State B render when `hasToken`) is wired correctly.

But two structural defects make the audit not-a-pass:

1. **AC #5 ("age 60-89d amber, >=90d red") is structurally unreachable for
   the typical mod via the ship code.** `__applyTierGate` reads token age from
   `gam_settings.rotated_at` (popup.js:1910), which the local first-run /
   re-claim path NEVER writes. The actual local field set on
   `authValidateToken` (background.js:2408) is `workerModToken_issued_at`.
   `rotated_at` only gets populated as a side-effect of the Lead-only mod-list
   roster code path, so for a freshly-onboarded mod the banner is permanently
   "Token active" / `_ageDays = -1` regardless of actual token age. The
   75-day-old token of a real mod will never trigger the amber/red rail in
   shipped code. The diag tab reads `workerModToken_issued_at` correctly
   (popup.js:6932) -- the bug is local to the W2 patch in `__applyTierGate`.

2. **The "auth banner credential vs setup" severity collision is real.**
   `__authBannerSeverity` returns the same amber color family for `setup`
   (`no_token` / `short_token`) AND `credential` (`whoami_status` /
   `whoami_empty`) -- backgrounds `rgba(245,158,11,.95)` vs `rgba(240,160,64,.95)`
   are visually indistinguishable to a user. Spec AC says "4 severity tiers" but
   shipped code has effectively 3 (amber, yellow, red).

Six lower-severity findings below.

---

## AC verification table

| # | AC | Verdict | Evidence |
|---|---|---|---|
| 1 | Tokens tab renders exactly ONE of three states post-whoami | PASS-with-edges | `__tokSetState` (popup.js:210-218) toggles two divs cleanly. Both default-hidden post-6925ca2 (popup.html:470,535). Edge: a rapid whoami success that resolves BEFORE `initFirstRunWizard` runs the no-token check ends in benign State B (fast-path). See Finding 1 for the timeout race. |
| 2 | `#claimInviteWrap` orphan absorbed into State A | PASS | `#claimInviteBtn` lives at popup.html:478, inside `#tokStateFirstRun`. Zero remaining `#claimInviteWrap` element references in HTML/JS (only in comments + docs). |
| 3 | `#firstRunWizardStep1` purged | PASS | Zero references in popup.html / popup.js / modtools.js (verified via grep). All hits are in `docs/V10_DESIGN_V2/UIUX2-02_tokens_tab.md` (spec) and `docs/V10_PANEL/02_TOKEN_SECTION_REORG.md` (legacy roadmap). |
| 4 | `#leadSection` inside `#tokStateReturning` | PASS | Located at popup.html:574-829, parent is `#tokStateReturning` (L535-831). Default `style="display:none"`. `__applyTierGate` (popup.js:1926-1927) toggles based on tier. The 200ms flash-of-lead-content for non-leads is structurally eliminated. |
| 5 | State B verified-banner: username, tier, ENC, age (60-89d amber, >=90d red rotate-now) | **FAIL (structural)** | `__tokUpdateBanner` logic is correct in popup.js:222-287, BUT the upstream `_ageDays` value from `__applyTierGate` (L1909-1911) reads `gam_settings.rotated_at`, which is never written on the local first-run / re-claim path. Real local field is `workerModToken_issued_at` (background.js:2408). For typical mods `_ageDays = -1` permanently -> amber/red branches unreachable. See Finding A. |
| 6 | Wizard success has full-width "Open greatawakening.win" button | PASS | `<a id="firstRunOpenGaw">` at popup.html:523-526. No JS handler needed (native anchor). `target="_blank" rel="noopener noreferrer"` correct. Class `tok-cta-primary` styled in popup.css. |
| 7 | Auth banner: 4 severity tiers (setup amber, connectivity yellow, credential amber, unknown red) | **FAIL (visual collision)** | All 4 tiers exist in code (modtools.js:25674-25713). But `setup` (rgba 245,158,11) and `credential` (rgba 240,160,64) are both amber-warm and visually indistinguishable. Spec said "4 color tiers" but the effective tier count to a user is 3. See Finding B. |
| 8 | Auth banner auto-attempts preloadSecrets+sync+revalidate before showing; suppress if recovers within ~150-400ms | PASS-with-caveat | Wired at modtools.js:25925-25954. `_autoAttemptable` excludes `no_token` correctly, includes `whoami_empty` / `short_token` / etc. ONE cycle limit enforced. `preloadSecrets()` performs synchronous chrome.storage.local read + IDB fallback (modtools.js:1839+); `syncSecretsToBackgroundVault` does an async SW message. The 150-400ms claim is achievable on warm cache, but on a cold IDB fallback the chain can run 600-1200ms (network-bound `__validateModAuth` retry doing a full /mod/whoami fetch). See Finding 2. |
| 9 | `whoami_empty` has dedicated reasonSteps branch | PASS | modtools.js:25767-25773. Distinct from `whoami_status`. Reachable via `__validateModAuth` modtools.js:25502 (HTTP 200 with no `username` field). |
| 10 | `short_token` has dedicated reasonSteps branch (not lumped with `no_token`) | PASS | modtools.js:25729-25735. Reachable via modtools.js:25486 (`tok.length < 32`). Step 1 includes the actual length: `'... (' + tokenLen + ' chars)'` which is helpful UX. |
| 11 | Whoami timeout (5s) -> first-run | PASS-with-edges | Wired at popup.js:1875-1880. 5s setTimeout fires `__tokSetState('first-run')` + `_cardAuthFailed()`. Both the success path (L1884) and the catch path (L1934) check `_whoamiTimedOut` and bail. See Finding 3 for the rapid-resolve race. |
| E1 | E2E: open extension fresh (no token) -> wizard | PASS | `loadToken` (L1640+) calls `__tokensStatus` -> `hasToken=false` -> `__tokSetState('first-run')` + `_cardAuthFailed()` (L1659-1660). State A renders. |
| E2 | E2E: save valid token -> State B | PASS | `firstRunGo` handler (L3448-3531) calls `authValidateToken` RPC, then `popupRpc('modWhoami')`, on success calls `showStep(3)` (success state). After 5s `_cardWizardComplete` fires + `loadToken/loadLead/loadStats` re-runs. `__applyTierGate` then transitions to State B/C. |
| E3 | E2E: whoami fail -> red banner with retry | PASS | `__validateModAuth` returns `{ ok:false, reason:'whoami_status', ... }` -> `__authBannerSeverity` returns `kind:'credential'` -> `__showAuthFailBanner` renders the banner with `Force re-hydrate` button. Correct steps surface. |
| E4 | E2E: token age >90d -> red expired banner + inline rotate | **FAIL (structural)** | Same root cause as AC #5. `_ageDays` is computed from `rotated_at` which is unset on local first-run path -> err branch (L263-279) unreachable for the common path. The diag tab's separate `loadMaintTokenStatus` (popup.js:5194-5223) DOES use `rotated_at` correctly because it's reading server-side mod-list data, not local. The two surfaces disagree on the same mod. |

**Tally:** 11 PASS / PASS-with-caveat, 3 FAIL (AC #5, AC #7, E4 — though E4 and AC #5 are the same root cause).

---

## Findings

### Finding A (P0 — structural) — Token age banner is dead code in the common-path

**Where:** `popup.js:1904-1921` (`__applyTierGate` post-whoami block).

**What the code reads:**
```js
const _st = await chrome.storage.local.get('gam_settings');
const _ra = _st && _st.gam_settings && _st.gam_settings.rotated_at;
if (_ra) _ageDays = Math.floor((Date.now() - new Date(_ra).getTime()) / 86400000);
```

**What's actually written on a fresh claim** (background.js:2407-2410, `authValidateToken` RPC handler — the path the wizard, raw paste, and rotation-claim all funnel through):
```js
const nowMs = Date.now();
base.workerModToken_issued_at = nowMs;
base.workerModToken_expires_at = nowMs + (30 * 24 * 60 * 60 * 1000);
```

**Result:** `gam_settings.rotated_at` is undefined for the typical mod's local
storage. `_ageDays` stays at -1. `__tokUpdateBanner` falls through both `>= 90`
and `>= 60` branches. Banner renders "Token active" forever, regardless of how
old the token actually is.

**Where `rotated_at` IS legitimately set:** only via the Lead-driven rotation
roster path in popup.js:5194-5202 (which reads `gam_settings.rotated_at` from
the worker's mod-list response and surfaces it in the maint tile). That code
path is read-only -- it does not write back to `gam_settings`.

**Why this isn't caught by the spec:** the spec says "ageDays>=90 -> red
rotate-now path; 60-89 -> amber" but never names the source field. The W2
agent presumably picked `rotated_at` because the lead-side maint code uses it
-- without checking the local first-run write path. The diag tab uses
`workerModToken_issued_at` correctly (popup.js:6932) -- so the same extension
is already inconsistent on which field defines age.

**Fix (out of scope -- noted for handoff):** in `__applyTierGate` change to:
```js
const _ra = _st?.gam_settings?.rotated_at || _st?.gam_settings?.workerModToken_issued_at;
```
With `rotated_at` keeping precedence so post-rotation the age resets (since
`workerModToken_issued_at` would still hold the older claim time on the same
storage row through a rotation). Better: standardize on a single field
across the popup. Owners of W4 / W5 / future audit should pick one.

---

### Finding B (P1 — visual collision) — `setup` and `credential` banner tiers are both amber

**Where:** `modtools.js:25674-25713` (`__authBannerSeverity`).

```js
// kind: 'setup'      -> bg rgba(245, 158, 11, .95) // amber-warm
// kind: 'connectivity' -> bg rgba(217, 197, 36, .95) // yellow
// kind: 'credential'  -> bg rgba(240, 160, 64, .95) // amber
// kind: 'unknown'     -> bg rgba(220, 40, 40, .95)  // red
```

`setup` (245,158,11) and `credential` (240,160,64) are visually
indistinguishable -- both amber-warm with ~5 deg hue difference. The spec
called for "4 severity tiers" but practically Commander/users see 3 (amber /
yellow / red), and the amber tier overloads two semantically distinct meanings:

- `setup needed` -> the user has no/short token, must onboard
- `credential needs update` -> the user has a token, server rejected it

These are different remediations. The banner copy in the title differs
("Setup needed" vs "Token needs update"), the OL steps differ correctly, and
the `Open ModTools popup` button shows for both -- so the textual recovery
path is fine. But at a glance the amber color says "same problem" when it
isn't.

**Fix (out of scope):** drift `credential` to a different hue (e.g.
240,140,80 -> burnt orange) or use a distinct stripe pattern / icon to
disambiguate. Or rename the spec to "3 visual severity tiers + 4 logical
recovery flows" and own the collision.

---

### Finding 1 (P2 — race) — Pending-then-immediate-success collapses to State B but `_cardAuthFailed` already fired

**Where:** `popup.js:3324-3326` (loadToken/loadLead are kicked off synchronously)
and `popup.js:3335-3372` (initFirstRunWizard async block).

**Race window:**
1. `loadToken()` runs synchronously (L3324). Inside, `__tokensStatus` is awaited.
2. Concurrently, `initFirstRunWizard` IIFE (L3335) starts. It also awaits
   `__tokensStatus`.
3. If `loadToken` resolves with `hasTeamToken: false` FIRST (e.g. the SW vault
   returns empty before IDB backfill completes), `loadToken` calls
   `__tokSetState('first-run')` AND `_cardAuthFailed()` (L1659-1660). The
   tokens card is force-opened with `gam-card-urgent` class.
4. Then `initFirstRunWizard` resolves with `hasToken: true` (because IDB
   backfill ran in `preloadSecrets` since first call), calls
   `__tokSetState('returning', { ageDays: -1, encrypted: true })` (L3371).
5. State machine flips to State B but the card is still flagged "urgent" from
   step 3. Cosmetic glitch: a returning mod sees the urgent (red-rail) card
   for a moment with State B content inside.

**Severity:** low. Race window is narrow (one `await` between two
`__tokensStatus` calls), and the visible result is the urgent class lingering,
not stale State A content. But it's the kind of thing that turns into a
"why is the card red?" support ticket from a fresh claim.

**Fix (out of scope):** in `__tokSetState('returning')` -> also call
`card.classList.remove('gam-card-urgent')` to ensure clean state.

---

### Finding 2 (P2 — perf claim) — Auto-attempt timing window is 600-1500ms in the worst case, not 150-400ms

**Where:** `modtools.js:25933-25950` and the chain dependencies.

The spec / commit message says "suppress if recovers within ~150-400ms." Trace:

- `preloadSecrets()` (modtools.js:1839+): chrome.storage.local read (~5-50ms) +
  optional IDB fallback (~50-200ms if backups exist). Worst case ~250ms.
- `syncSecretsToBackgroundVault()`: SW round-trip with `setTokens` payload.
  Chrome SW wake-up on cold start can be 100-400ms; warm SW is ~10-30ms.
- `__validateModAuth()` retry (modtools.js:25937): a fresh `fetch(WORKER_BASE +
  '/mod/whoami', ...)` -- this is the biggest cost. Cold worker on Cloudflare
  edge can be 200-800ms; warm worker 50-200ms. There's no caching here -- this
  is a real network call.

Total: warm path ~150-300ms (matches spec), but cold worker + cold SW + cold
IDB easily hits 1-1.5 seconds. The banner is suppressed only if the retry
succeeds before show. Right now there's no "show banner immediately, swap to
'auth restored' if recovery succeeds" pattern -- it's all-or-nothing wait.

**Effect on user:** on slow connections / cold workers, the user sees a
~1-second delay before the failure banner appears (tab is silent). Not awful,
but worth flagging because the spec promised "~150-400ms."

**Fix (out of scope):** add a 400ms timeout on the auto-attempt; on timeout,
show banner immediately. If retry resolves OK after banner is shown, swap
banner contents to "auth restored" + auto-dismiss.

---

### Finding 3 (P3 — race) — 5s whoami timeout fires while popupRpc is in flight

**Where:** `popup.js:1872-1939` (`__applyTierGate` body).

**Race:** `_whoamiTimer` is set for 5s (L1876-1880). `popupRpc('modWhoami')`
is awaited (L1883). If popupRpc takes >5s, the timer fires -- it sets
`_whoamiTimedOut = true` and forces State A + `_cardAuthFailed`. Then
popupRpc resolves successfully. The success path (L1884) checks
`_whoamiTimedOut` and bails -- so no double-state-write happens.

But there's a subtle bug: if popupRpc resolves at exactly the moment
the timer fires (within the same microtask flush), there's no guarantee
of ordering. JS event loop semantics say the timer callback runs FIRST in
its tick, but if the await resumes before the timer fires (due to
microtask hoisting), L1884 runs `if (_whoamiTimedOut) return` -- but
`_whoamiTimedOut` is still false. The function continues, calls
`__tokSetState('returning', ...)`. THEN the timer fires (still queued
from setTimeout), sets `_whoamiTimedOut=true`, and forces the state back
to first-run. Result: rapid State B -> State A flicker on a slow whoami.

**Fix (out of scope):** clear the timer FIRST in the success path (L1885),
before the L1884 timeout check. Or use AbortController and a single
race promise. The current order is harmless on warm path but vulnerable
on slow paths.

---

### Finding 4 (P2 — UX leak) — Empty `#card-lead` shell renders visible if a lead user clicks the Lead nav button

**Where:** `popup.html:848-850` and CSS at `popup.css:1935-1955`.

```html
<div id="tab-panel-lead" role="tabpanel" aria-labelledby="tab-btn-lead" style="display:none">
  <div class="gam-card" id="card-lead" data-tab="lead" style="display:none">
    <span id="card-badge-lead" class="gam-card-badge" style="display:none"></span>
  </div>
</div>
```

CSS:
```css
.gam-card {
  display: block !important;
  margin: 0 0 8px 0 !important;
  border: 1px solid var(--bb-line-hot) !important;
  background: var(--bb-bg) !important;
  position: relative;
}
.gam-card::before { /* amber/purple rail */ }
#card-lead::before { background: var(--bb-purple) !important; }
```

The inline `style="display:none"` on `#card-lead` is OVERRIDDEN by the
`!important` `.gam-card { display:block }` rule. So as soon as `setTab('lead')`
runs (popup.js:3567 sets `el.style.display = ''` on every `[data-tab="lead"]:not(.pop-tab)`),
the card becomes visible. Result: an empty bordered box with a purple left
rail, no content, no header text. A lead user clicking the Lead tab sees
this.

There IS a saving grace: `#tab-panel-lead` itself ALSO has inline
`style="display:none"` (L848) which is NEVER cleared by setTab. setTab only
toggles `panel.hidden` (L3575) which sets the `[hidden]` attribute. The CSS
rule `[role="tabpanel"][hidden] { display:none !important }` (popup.css:2798)
is an OVERRIDE of `display:none` -- it makes hidden panels stay hidden. But
the inline `display:none` on the panel is normal-priority, so when `[hidden]`
goes false, the inline `display:none` STILL applies (no `!important` rule at
this specificity unsets it). So the panel itself stays invisible -- which
incidentally hides the empty `#card-lead` shell beneath it.

So in practice: clicking the Lead nav button as a lead user shows ABSOLUTELY
NOTHING. The aria-controls target is hidden. The user clicked a button and
"nothing happened." For non-leads the tab is hidden anyway. For leads, this
is dead navigation -- the useful Lead content lives on the Tokens tab now,
but there's no signage telling the user that.

**Severity:** low-medium. Not a visual regression (no empty box flashes),
but a navigation dead-end. The Lead nav button is a button-to-nowhere for
full leads.

**Fix (out of scope):** either (a) hide the Lead nav button entirely
(`__applyTierVisibility` already hides it for non-leads at L1969 — extend to
all tiers and rely on Tokens tab State C for lead content), OR (b) put a
"Lead controls have moved to Tokens tab" link inside the empty Lead panel.

---

### Finding 5 (P3 — comment vs reality) — `tokenIssuedAt` doc divergence

**Where:** spec L344 of SHIPMASTER.md says "60-89d amber, ≥90d red rotate-now"
without naming the source field. Code uses `rotated_at`. Diag tab and crypto
docs use `workerModToken_issued_at`. The same audit (UIUX2-02) at L750 says
"Read token age from rotation timestamp" -- ambiguous.

This is the documentation root cause of Finding A. The spec author should
have named the field. The W2 agent picked the wrong one. No code fix needed
here, but if a future wave re-audits the tokens tab, the spec needs to lock
the field.

---

### Finding 6 (P3 — minor) — `_cardAuthFailed` paints `gam-card-urgent` even on State B fast-path failure

**Where:** `popup.js:1660` (loadToken no-token branch).

`loadToken` calls both `__tokSetState('first-run')` AND `_cardAuthFailed()`
on the no-token path. `_cardAuthFailed` adds the `gam-card-urgent` class to
`#card-tokens`. This is correct for State A. But the urgent class is never
cleared on transition to State B/C. If the user pastes a token, transitions
to State B via `__applyTierGate` (which calls `_cardAutoCollapseTokens(true)`,
which removes only `gam-card-order-last`), the `gam-card-urgent` class
LINGERS on the card.

`_cardAutoCollapseTokens`:
```js
if (whoamiOk) {
  card.removeAttribute('open');
  card.classList.add('gam-card-order-last');
  card.classList.remove('gam-card-urgent');  // <-- DOES remove it
}
```

Wait -- L163 DOES remove it. OK so this is fine on the success path. But the
6925ca2 fast-path (`__tokSetState('returning'...)` from `initFirstRunWizard`
at L3371) doesn't call `_cardAutoCollapseTokens`, only sets state. If
loadToken's no-token branch fired before the wizard's fast-path resolved
(see Finding 1 race), the urgent class stays. Same downstream symptom as
Finding 1 -- coincidental same fix.

---

## Cross-wave conflict check

W1 declared `--bb-blue: #4A9EFF` and `--bb-warn-status: #f59e0b` in popup.css
:root. W2 consumes them at popup.css:286-294 via the `--tok-banner-warn-rail`
chain. No conflict. The grep confirms `--bb-warn-status` is referenced in
both W1's :root block and W2's tok-banner block.

W2's `__authBannerSeverity` colors are inline (rgba literals) NOT W1 tokens.
That's a smell -- it means W3+ banner-color tweaks have to edit modtools.js,
not the :root token block. Acceptable for now since the auth banner is
modtools.js-rendered (page-injected), not popup-rendered.

W2 left `#card-lead` as an empty shell with `data-tab="lead"`. W3-W5 don't
reintroduce any content there (verified by grep on `card-lead` in popup.html:
two hits, both at the empty shell). Future waves should be aware the Lead
tab is dead navigation per Finding 4.

W4 (v10.13.4 commit `9c7655e`) is "Mod Console keyboard + Modmail criticals
+ Macros v2." None of those touch the Tokens tab or auth banner. Verified
clean from W2's perspective.

---

## Recommendations (out of scope, for handoff)

1. **P0 — Fix the token-age field divergence.** Change `__applyTierGate`
   (popup.js:1910) to fall back to `workerModToken_issued_at` so the amber/red
   age branches are reachable for typical mods. Or pick one field and migrate
   the other surface. The current state is silent dead code on the most
   visible piece of W2.

2. **P1 — Disambiguate the auth banner amber tiers.** Either retint
   `credential` to a different hue family, or accept the spec promise was
   3-tier-not-4 and update SHIPMASTER. The amber-vs-amber collision
   undermines the "4 severity tiers" AC.

3. **P2 — Hide the Lead nav button when Lead content has moved into Tokens
   tab.** `__applyTierVisibility` (popup.js:1968-1969) currently HIDES the
   Lead button for non-leads but SHOWS it for leads. After W2, lead content
   is on Tokens tab. Recommendation: hide for all tiers. The aria-controls
   target stays valid (empty panel) but no user can click into the dead
   navigation.

4. **P2 — Add a `card.classList.remove('gam-card-urgent')` to
   `__tokSetState('returning'|'expired')`.** Defensive cleanup for the race
   window where `_cardAuthFailed` fires before the fast-path State B render
   (Finding 1, Finding 6). One-line add, structural safety.

5. **P3 — Tighten the auto-attempt timing claim.** Either add a 400ms
   guard timeout in modtools.js:25933 or drop the "150-400ms" wording from
   the spec. Today the worst case is closer to 1.5s on cold-everything.

6. **P3 — Order-of-ops in `__applyTierGate` timeout race.** Move the
   `clearTimeout(_whoamiTimer)` BEFORE the `if (_whoamiTimedOut) return`
   check (popup.js:1884-1885), or use a single AbortController. Defensive
   against the rare slow-resolve / timeout collision.

---

**End of RALPH-W2 audit.**
