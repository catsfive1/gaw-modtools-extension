# UIUX2-19: Auth Recovery Wizard (v2)

**Version:** v10.13  
**Scope:** `modtools.js __showAuthFailBanner` + `reasonSteps` array; `popup.js initFirstRunWizard`  
**Predecessor:** `docs/V10_DESIGN/UIUX-17_auth_wizard.md`  
**Date:** 2026-05-10

---

## A. What v10.12.3 Actually Ships (Ground Truth)

Reading the live source before critiquing it.

### A.1 `__showAuthFailBanner` (modtools.js L24758-24908)

The function renders a fixed-position `div#gam-auth-fail-banner` top-right, z-index 2147483640. Visual spec: `background:rgba(220,40,40,.95)`, white text, 8px border-radius, 380px max-width. Every failure mode gets the same red background.

**`reasonSteps` branches (live text, verbatim):**

| reason | Step count | Steps |
|---|---|---|
| `no_token` / `short_token` | 4 | Open popup > pick path > paste > still stuck |
| `fetch_failed` / `no_response` | 4 | Click Force re-hydrate > check site > open DevTools > still stuck |
| `whoami_status` | 4 | Token rotated > open popup, expand Tokens card, paste > ask lead > still stuck |
| generic / `exception` | 4 | Auth check failed: {reason} > click Force re-hydrate > error detail or DevTools > ask lead |

**Buttons (per mode):**
- `no_token`, `short_token`, `whoami_status`, `whoami_empty`: "Open ModTools popup" (white fill, red text) + "Force re-hydrate" + "Dismiss"
- `fetch_failed`, `no_response`, generic: "Force re-hydrate" + "Dismiss"

**"Open ModTools popup" behavior:** fires `chrome.runtime.sendMessage({ type: 'openPopup' })`. On `r.ok` it removes the banner. On failure it degrades to "Click extension icon (up arrow)" text + a snack.

**"Force re-hydrate" behavior:** calls `preloadSecrets()` + `syncSecretsToBackgroundVault()` + `__validateModAuth()`. On `re.ok`: removes banner, calls `init()`. On failure: mutates button text to "Still failed ({reason})", re-enables button.

**No step indicator.** No auto-attempt before the banner appears. No storage.onChanged wiring to dismiss the banner when the token changes.

### A.2 `initFirstRunWizard` (popup.js L3031-3214)

3-step structure using `display:block/none` on three sibling `div` elements (`firstRunWizardStep1`, `firstRunWizardStep2`, `firstRunWizardSuccess`). No pill track, no step counter.

**Step 1 — path picker:** three buttons: "I have an invite LINK" / "invite CODE" / "team token". Each sets `pathChoice` and calls `showStep(2)`.

**Step 2 — input:** single text/password field. Prompt text updates per path. Username field shown/hidden per path. "Go" button + "Back" button.

**Step 3 — success:** `firstRunSuccessName` text + `firstRunDone` button (added v10.5.1) + `setTimeout(_cardWizardComplete, 5000)` still runs beneath it.

**Token check at wizard init (v10.3 fix):** reads `__tokensStatus()` via SW RPC instead of raw localStorage. If `hasToken` is truthy, hides wizard immediately. This was the Auth Carry-Over RCA fix.

**Error states:** `status.textContent` with inline color: `#ff3b3b` (red) for hard errors, `#ff9933` (orange) for in-flight, `#ffd84d` (yellow) for soft errors. No step indicator state change.

**Restart setup button** (`restartSetupBtn`, wired at L6146): shows the wizard, resets to step 1. Exists in live code.

**No message-passing between banner and wizard.** The banner's "Open ModTools popup" sends `{ type: 'openPopup' }` only, with no `reason` payload. The wizard has no listener for a banner-origin signal.

---

## B. Critique of v10.12.3 Against v10.11+ Patches

This section evaluates what changed since UIUX-17 was written and what remains unaddressed.

### B.1 Step text accuracy after v10.10.1 "Settings > Token" fix (RESOLVED in v10.7.0)

The v10.7.0 commit comment at L24787 confirms the fix was applied:
```
// v10.7.0 UIUX-06 B.2: fix dead "Settings > Token" menu path (it does not exist in the popup)
```

The `whoami_status` branch now correctly says "expand the Tokens card" and "paste the new token directly into the Team Mod Token field" rather than the dead `Settings > Token` path. This critique item from UIUX-17 is resolved.

### B.2 Step indicator presence (UNRESOLVED)

The banner still renders a flat `<ol>` with text items like "Step 1 of 3: Click...". No visual pill track, no current/complete/upcoming states, no step-level affordance. UIUX-17 B.4 was not implemented.

### B.3 Auto-attempt-then-prompt model (UNRESOLVED)

`init()` calls `__validateModAuth()` once, and if it fails, calls `__showAuthFailBanner` immediately. There is no auto-fire of `preloadSecrets() + syncSecretsToBackgroundVault()` before the banner appears. The 200ms debounce proposed in UIUX-17 B.2 was not implemented. The user still sees the banner on cold-SW states that would self-resolve in 300ms.

### B.4 Severity color reclassification (UNRESOLVED)

All four failure modes render `rgba(220,40,40,.95)` — solid red. `no_token` is a first-run setup state, not a hard error. `fetch_failed` is a transient connectivity event. Presenting both identically to `exception`-level failures conflates severity. UIUX-17 B.3 color taxonomy was not implemented.

### B.5 Banner-to-popup message passing (UNRESOLVED)

The `openPopup` message carries no `reason` payload. `initFirstRunWizard` has no listener for an incoming reason code. When a `whoami_status` banner opens the popup, the wizard shows its generic path-picker step 1 rather than jumping directly to the token-paste step. Two disconnected systems with no shared state. UIUX-17 B.8 was not implemented.

### B.6 5-second silent auto-collapse (PARTIALLY ADDRESSED)

`setTimeout(_cardWizardComplete, 5000)` still fires (L3162, L3201). The `firstRunDone` button was added (v10.5.1) to give an explicit exit, but the `setTimeout` underneath it still fires. On success, both paths (countdown-fire and Done-click) call `_cardWizardComplete()`, making the Done button a race. UIUX-17 B.10 proposed a visible countdown; that was not implemented.

### B.7 Error states inside wizard (PARTIALLY ADDRESSED)

Error messages appear via `status.textContent` and `status.style.color`. The text is more specific in some paths (e.g., the "invite code in token slot" detection at L3203-3204 is accurate and helpful). But the step indicator node does not change color on failure, and there is no "Try again" button — the user must re-submit the same form. The remediation text ("click Back and try the 'invite CODE' path") is present inline, which is correct, but the visual weight is low.

### B.8 New issue: `whoami_empty` not in reasonSteps

`__validateModAuth` can return `reason: 'whoami_empty'` (L24589). The `showOpenPopup` condition at L24867 correctly includes `whoami_empty` in the button-eligibility set. But `reasonSteps` has no dedicated branch for `whoami_empty` — it falls through to the generic fallback. A `whoami_empty` state means the token is valid (200 OK) but the response body has no `username` field — a different diagnostic posture than `exception`. The generic steps ("Try clicking Force re-hydrate / open DevTools") are partially wrong for this case.

### B.9 New issue: `short_token` lumped with `no_token` despite different remediation

`no_token` means the field is empty — the user has never set a token. `short_token` means something is in storage but it is fewer than 32 characters — likely a truncation event, a test value left in, or a partial paste. The wizard steps are identical for both, but the likely cause and remediation differ. For `short_token`, the first thing to do is check what is already in the Tokens card, not open a fresh first-run wizard. Lumping them means the mod is told to go through invite-link/code flow when they may just need to repaste.

---

## C. Redesign Targets for v10.13

Prioritized by user-impact-per-implementation-hour. Items marked CARRY-OVER were specified in UIUX-17 and not shipped. Items marked NEW are post-v10.12.3 discoveries.

| ID | Change | Priority | Effort |
|---|---|---|---|
| C1 | Auto-attempt before banner show (CARRY-OVER) | P0 | 0.5h |
| C2 | Severity reclassification + per-mode banner color (CARRY-OVER) | P0 | 1h |
| C3 | `whoami_empty` dedicated reasonSteps branch (NEW) | P0 | 0.5h |
| C4 | `short_token` split from `no_token` with distinct steps (NEW) | P1 | 0.5h |
| C5 | Step progress indicator — pill track (CARRY-OVER) | P1 | 2h |
| C6 | Per-mode step content rewrite as structured objects (CARRY-OVER) | P1 | 3h |
| C7 | Banner-to-popup reason payload + wizard pre-routing (CARRY-OVER) | P2 | 2h |
| C8 | Visible countdown replacing silent auto-collapse (CARRY-OVER) | P2 | 0.5h |
| C9 | Inline tooltips per step (CARRY-OVER) | P3 | 1h |
| C10 | storage.onChanged auto-dismiss with exit animation (CARRY-OVER) | P3 | 1h |

---

## D. Auto-Attempt Model (C1)

Insert a pre-banner hydration pass inside `init()` before the `__showAuthFailBanner` call.

**Implementation site:** `modtools.js`, inside the `if (!(__authResult && __authResult.ok))` block, immediately before `__showAuthFailBanner(__authResult)`.

**Logic:**

```
modes eligible for auto-attempt before showing banner:
  fetch_failed, no_response, whoami_status, whoami_empty, short_token, exception

modes NOT eligible (token genuinely absent, auto-attempt cannot help):
  no_token

For eligible modes:
  1. await preloadSecrets()
  2. await syncSecretsToBackgroundVault()
  3. const re2 = await __validateModAuth()
  4. if re2.ok: log "[auth-wizard] auto-recovery succeeded", do NOT call __showAuthFailBanner, return
  5. else: call __showAuthFailBanner(re2)   // use the fresh result, not the stale one
```

Debounce: none needed. The function calls are already async-sequential. The total round-trip (storage read + SW push + worker fetch) is 150-400ms and happens before any DOM is painted.

**Result:** Mods with a cold SW vault who are already authenticated see zero banner. The banner only appears for mods who genuinely need action.

---

## E. Severity Color System (C2)

Replace the single `rgba(220,40,40,.95)` background with a mode-keyed border system. The panel background stays near-black across all modes.

**Token table:**

| Mode | reasons | Border color | Label | Text accent |
|---|---|---|---|---|
| setup | `no_token` | `oklch(78% 0.15 60)` amber-warm | "Setup needed" | `oklch(85% 0.12 60)` |
| setup | `short_token` | `oklch(78% 0.15 60)` amber-warm | "Token incomplete" | same |
| connectivity | `fetch_failed`, `no_response` | `oklch(85% 0.14 90)` yellow | "Connection issue" | `oklch(90% 0.10 90)` |
| credential | `whoami_status`, `whoami_empty` | `oklch(74% 0.16 50)` amber | "Token needs update" | `oklch(80% 0.12 50)` |
| unknown | `exception`, generic | `oklch(58% 0.22 24)` red | "Auth error" | `oklch(75% 0.15 24)` |

**Panel background (all modes):** `oklch(12% 0.01 260)` near-black with faint cool tint, `rgba(0,0,0,0.92)` fallback for browsers without OKLCH.

**Title text:** always white `#fff`.

**Implementation:** replace the monolithic `b.style.cssText` block in `__showAuthFailBanner` with a mode-derived `severityClass` computed at the top of the function, then apply 2-4 CSS variables to the banner element. No external stylesheet needed — inline CSS vars on the element itself.

---

## F. Step Progress Indicator (C5)

Replace the `<ol>` text block with a three-zone layout.

### F.1 HTML structure (generated in JS, no innerHTML for user-derived content)

```
[banner header row]
[severity label]        [step track: 1 > 2 > 3]
[step content area]
[action buttons]
```

**Step track DOM pattern:**

```
div.wiz-track
  span.wiz-node[data-state="current|complete|upcoming"]  "1"
  span.wiz-connector                                      (hairline)
  span.wiz-node[data-state="current|complete|upcoming"]  "2"
  span.wiz-connector
  span.wiz-node[data-state="current|complete|upcoming"]  "3"
```

**State CSS (inline, no external sheet):**

| state | background | border | opacity | icon |
|---|---|---|---|---|
| current | mode accent color | none | 1.0 | step number |
| complete | `oklch(65% 0.18 150)` green | none | 1.0 | checkmark (text: "v") |
| upcoming | `transparent` | `1px solid rgba(255,255,255,0.2)` | 0.35 | step number |
| error | `oklch(55% 0.20 20)` red | none | 1.0 | "!" |

**No animation.** State changes are instant DOM attribute swaps. `_LOW_RESOURCE_MODE` is already checked globally; the track respects it automatically because no CSS transitions are used.

### F.2 Advancing the track

```
wizSetStep(n):
  for each node i in [1,2,3]:
    if i < n:  node.dataset.state = 'complete'
    if i == n: node.dataset.state = 'current'
    if i > n:  node.dataset.state = 'upcoming'
```

Called once per state transition. When the auto-attempt at step 1 resolves to still-failing, advance to step 2 without requiring user action.

---

## G. Per-Mode Step Content (C3, C4, C6)

Replace the string-array `reasonSteps` with a structured step-object array. Each step object has:

```js
{
  label: string,           // short label for step track node (max 12 chars)
  content: string,         // instruction text
  tooltip: string|null,    // "Show me" tooltip text, null if no tooltip needed
  primaryAction: {
    label: string,
    handler: string        // named handler key, looked up at render time
  }|null,
  autoFire: string|null    // named auto-action key to fire before rendering this step
}
```

### G.1 `no_token` mode (Setup / amber)

```
Step 1: Auto-check
  content: "Checking for a saved token..."
  autoFire: "hydrate_and_recheck"
  [if recheck ok: jump to complete]
  [if still no_token: advance to step 2]

Step 2: Pick your path
  content: "Choose how your lead set you up:"
  primaryAction: [3 inline buttons: Invite Link / Invite Code / Team Token]
  tooltip: "Not sure which? Ask your lead: 'Did you send me a link, a code, or a token?'"

Step 3: Paste and save
  content: [dynamic per path choice]
    link:  "Paste the full URL your lead sent (https://greatawakening.win/?mt_invite=...)"
    code:  "Paste the 48-char invite code"
    token: "Paste the team mod token your lead sent"
  primaryAction: { label: "Save and verify", handler: "wizard_go" }
  tooltip: [per path]
    link:  "The link starts with https://greatawakening.win/?mt_invite= -- paste the whole thing including the https://"
    code:  "The code is 48 characters, letters and numbers only, no spaces"
    token: "The token is 32-256 characters. If you're unsure, try the Invite Link path instead"

Complete:
  content: "You're set up. Reload the page to activate the status bar."
  countdown: 8  [visible "Closing in 7... 6..." tick]
  primaryAction: { label: "Done (close now)", handler: "wizard_complete" }
```

### G.2 `short_token` mode (Setup / amber) -- split from `no_token`

```
Step 1: Auto-check
  content: "Checking your saved token..."
  autoFire: "hydrate_and_recheck"
  [if ok: complete]
  [if still short_token: advance to step 2]

Step 2: Check what's there
  content: "Your token is saved but too short to be valid. Open the ModTools popup and look at the Tokens card."
  primaryAction: { label: "Open ModTools popup", handler: "open_popup" }
  tooltip: "The Tokens card is the first section in the popup, labeled TOKENS. Click it to expand if it's collapsed."

Step 3: Re-enter
  content: "In the Tokens card, look for the Team Mod Token field. Clear it, paste the full token your lead sent, and click Save."
  tooltip: "A valid token is 32-256 characters. If you only have an invite link or code, close the popup and use the first-run wizard instead."

Complete:
  content: "Token updated. Reload the page."
  countdown: 8
  primaryAction: { label: "Done", handler: "wizard_complete" }
```

### G.3 `fetch_failed` / `no_response` mode (Connectivity / yellow)

```
Step 1: Auto-retry
  content: "Retrying connection to the worker..."
  autoFire: "hydrate_and_recheck"
  [if ok: suppress banner entirely]
  [if still failing: advance to step 2]

Step 2: Site check
  content: "We couldn't reach the worker automatically. Is greatawakening.win loading for you?"
  primaryAction: None (two inline options below)
  inlineChoiceA: { label: "Yes, site loads", nextStep: 3, outcome: "site_loads" }
  inlineChoiceB: { label: "No, site is down", nextStep: 3, outcome: "site_down" }
  tooltip: null

Step 3: Diagnostic path (branched by choice)
  if site_loads:
    content: "The site loads but the worker is unreachable. Open DevTools (F12), go to Console, look for red lines starting with [modtools]. Copy the first one."
    primaryAction: { label: "Copy error to clipboard", handler: "copy_diag_error" }
    tooltip: "Press F12 to open DevTools. Click the 'Console' tab. Errors show in red. Copy the first red line that starts with [modtools]."
  if site_down:
    content: "The site is offline. The worker is also offline. Nothing to do on your end. Wait a few minutes and reload."
    primaryAction: null
    autoCountdown: 30  [auto-dismiss in 30s with visible "Closing in 29..." tick]

Complete (site_loads path):
  content: "Error copied to clipboard. Paste it to your lead."
  countdown: 8
  primaryAction: { label: "Done", handler: "wizard_complete" }
```

### G.4 `whoami_status` / `whoami_empty` mode (Credential / amber)

```
Step 1: Auto-refresh
  content: "Refreshing your token..."
  autoFire: "hydrate_and_recheck"
  [if ok: suppress banner]
  [if still failing: advance to step 2]

Step 2: Open popup
  content: "Your token needs updating. Open the ModTools popup."
  primaryAction: { label: "Open ModTools popup", handler: "open_popup_with_reason" }
  tooltip: "Click the GAW ModTools icon in the top-right of your Chrome toolbar if the button doesn't work."
  [on popup open: advance to step 3]
  [on popup unavailable: show inline text "Click the GAW ModTools icon in the Chrome toolbar (top right)"]

Step 3: Update token
  content: "In the popup, find the Tokens card. Paste the new token your lead sent you. Click Save."
  primaryAction: null  [listening: storage.onChanged will auto-advance]
  tooltip: "The Tokens card is the first section labeled TOKENS. If you don't have a new token yet, ask your lead for a fresh invite link."

Complete:
  content: "Token updated. Reloading mod tools..."
  [auto-fire __validateModAuth and init() on complete]
```

**`whoami_empty` distinction from `whoami_status`:** same wizard steps, but step 1 content says "Verifying your token response..." instead of "Refreshing your token..." -- a subtle but accurate difference. The step text does not expose technical internals to the mod.

### G.5 Generic / `exception` mode (Unknown / red)

```
Step 1: Auto-retry
  content: "Attempting recovery..."
  autoFire: "hydrate_and_recheck"
  [if ok: suppress]
  [if still failing: advance to step 2]

Step 2: Diagnostic
  content: "Something unexpected happened. Error: {reason}. Try the re-hydrate action."
  primaryAction: { label: "Force re-hydrate", handler: "force_rehydrate" }
  tooltip: null

Step 3: Escalate
  content: "Still failing. Open DevTools (F12 > Console) and copy the first red error line."
  primaryAction: { label: "Copy diagnostic to clipboard", handler: "copy_diag_error" }
  tooltip: "Open DevTools with F12. Go to Console tab. Copy the red error starting with [modtools]."

Complete / escalate:
  content: "Diagnostic copied. Paste to your lead or a bug report."
  primaryAction: { label: "Done", handler: "wizard_complete" }
```

---

## H. Implementation Notes and Constraints

### H.1 Renderer architecture

Replace the current `reasonSteps.forEach(li => ...)` block with a two-function structure:

```
buildWizardState(authResult)  -> returns { severity, stepDefs, currentStep }
renderWizardStep(banner, state, stepIndex)  -> updates DOM in-place
```

`buildWizardState` is a pure function (no DOM). `renderWizardStep` is the only DOM-touching function. This structure enables testing `buildWizardState` independently and allows step transitions to call `renderWizardStep(b, state, nextStep)` without re-building the banner.

### H.2 autoFire execution

Named auto-actions are a lookup table, not eval:

```js
const AUTO_ACTIONS = {
  hydrate_and_recheck: async function() {
    await preloadSecrets();
    await syncSecretsToBackgroundVault();
    return __validateModAuth();
  }
};
```

On step render, if `step.autoFire` is set, execute `AUTO_ACTIONS[step.autoFire]()` and advance step based on result. All autoFire actions resolve to a `__validateModAuth` result object; the wizard advances `if re.ok` else falls to next manual step.

### H.3 Countdown implementation

Replace `setTimeout(_cardWizardComplete, 5000)` with:

```js
function _startCountdown(el, seconds, onComplete) {
  let remaining = seconds;
  el.textContent = 'Closing in ' + remaining + '...';
  const iv = setInterval(function() {
    remaining--;
    if (remaining <= 0) {
      clearInterval(iv);
      onComplete();
      return;
    }
    el.textContent = 'Closing in ' + remaining + '...';
  }, 1000);
  return iv; // caller stores to clearInterval on Done click
}
```

The "Done" button's click handler calls `clearInterval(iv)` then `_cardWizardComplete()`. No race.

### H.4 Tooltip implementation

```js
function buildTooltip(text) {
  const wrap = document.createElement('span');
  wrap.style.cssText = 'position:relative;display:inline-block;margin-left:4px';
  const btn = document.createElement('button');
  btn.textContent = '?';
  btn.style.cssText = 'width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,0.4);background:rgba(255,255,255,0.1);color:#fff;font-size:10px;line-height:1;cursor:pointer;padding:0;vertical-align:middle';
  const tip = document.createElement('div');
  tip.hidden = true;
  tip.style.cssText = 'position:absolute;bottom:calc(100% + 4px);left:0;background:oklch(18% 0.01 260);color:#e0e0e0;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:8px 10px;font-size:11px;line-height:1.4;max-width:260px;min-width:180px;z-index:1;white-space:normal';
  tip.textContent = text;
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    tip.hidden = !tip.hidden;
  });
  document.addEventListener('click', function() { tip.hidden = true; }, { once: true, capture: true });
  wrap.appendChild(btn);
  wrap.appendChild(tip);
  return wrap;
}
```

One tooltip per step. `null` tooltip means no `?` button rendered. Text-only content, no external image loads.

### H.5 Banner-to-popup reason routing (C7)

**Banner side:** when "Open ModTools popup" is clicked, send:

```js
chrome.runtime.sendMessage({ type: 'openPopup', reason: authResult.reason })
```

(Adds `reason` to the existing message shape. `openPopup` handler in background.js passes it through to the popup on open via `chrome.storage.session.set({ gam_pending_wizard_reason: reason })` with a 30s TTL.)

**Popup side:** at the top of `initFirstRunWizard`, after the `hasToken` check, read:

```js
const pending = await chrome.storage.session.get('gam_pending_wizard_reason');
const incomingReason = pending && pending.gam_pending_wizard_reason;
```

If `incomingReason === 'whoami_status' || 'whoami_empty'`: show the tokens card (or scroll to it), skip path-picker step, go directly to step that says "paste your updated token here". Clear the session key after reading.

This requires no new message protocol — `openPopup` already goes through the background script.

### H.6 storage.onChanged auto-dismiss (C10)

Wire inside `__showAuthFailBanner` after banner is appended to DOM:

```js
const _storageListener = async function(changes) {
  if (!changes.gam_settings) return;
  const re = await __validateModAuth();
  if (re && re.ok) {
    b.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
    b.style.opacity = '0';
    b.style.transform = 'translateY(-8px)';
    setTimeout(function() {
      try { b.remove(); } catch(_){}
      try { chrome.storage.onChanged.removeListener(_storageListener); } catch(_){}
    }, 400);
  }
};
try { chrome.storage.onChanged.addListener(_storageListener); } catch(_){}
```

Remove the listener on banner dismiss (Dismiss button and auto-close paths) to avoid orphaned listeners.

### H.7 Regression protection

The following behaviors must not change between v10.12.3 and v10.13:

- `#gam-auth-fail-banner` ID -- used by the double-render guard. Must stay.
- `showOpenPopup` logic: `['no_token','short_token','whoami_status','whoami_empty']` eligibility for the open-popup button. The new wizard renders this button as a step action; the old button list can be removed once C7 is implemented.
- The `preloadSecrets + syncSecretsToBackgroundVault + __validateModAuth` sequence in "Force re-hydrate" must be preserved as the named handler `force_rehydrate` so the retry path retains identical behavior.
- `initFirstRunWizard`'s `hasToken` check via `__tokensStatus()` (v10.3 fix) must not be removed or bypassed by the routing change in H.5.

### H.8 Phased ship recommendation

Given 14-15h total effort, ship in two drops to avoid a big-bang banner regression:

**Drop 1 (3h, safe to ship independently):**
- C1: Auto-attempt before banner show
- C2: Severity color reclassification
- C3: `whoami_empty` dedicated branch
- C4: `short_token` split

These are additive or replace-in-place changes to `__showAuthFailBanner`. No structural DOM change. Low regression surface.

**Drop 2 (11-12h, requires Drop 1):**
- C5 + C6: Step indicator + structured step content (simultaneous -- indicator is useless without content)
- C7: Banner-to-popup routing
- C8: Countdown
- C9: Tooltips
- C10: storage.onChanged auto-dismiss

Drop 2 is a full replacement of the banner DOM structure. Ship behind a feature flag (`FEATURE_FLAGS.AUTH_WIZARD_V2`) initialized to `false`, gate with `if (FEATURE_FLAGS.AUTH_WIZARD_V2)` in `__showAuthFailBanner` and in `initFirstRunWizard`. Flip flag to `true` in a follow-on hotfix after 24h of Drop 1 stability. Remove flag and dead v1 code path in v10.14 cleanup.
