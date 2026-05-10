# UIUX-17: Auth Wizard Redesign

**Scope:** `modtools.js __showAuthFailBanner` + `reasonSteps` array + `popup.js` first-run wizard render.
**Register:** product UI (design serves the tool).

---

## A. Critique

### A.1 What currently exists

The auth-fail surface ships as two separate mechanisms:

1. **`__showAuthFailBanner`** (modtools.js, injected into the page): a fixed-position red panel, top-right, rendered when `__validateModAuth` returns a failed result. Contains a hard-coded `<ol>` of 3-4 steps per failure mode (`no_token`, `fetch_failed`, `whoami_status`, generic), plus three buttons: "Force re-hydrate", "Open ModTools popup" (conditional), "Dismiss".

2. **`firstRunWizard`** (popup.html + popup.js): a 3-step guided flow inside the popup (step 1: choose path; step 2: paste credential; step 3: success). Fires when no team token is found. Separate from the banner entirely.

### A.2 What works

- The failure-mode branching in `reasonSteps` is accurate: each `reason` code gets a distinct, contextually appropriate set of instructions. That is the right shape.
- The "Open ModTools popup" button (v10.2) is the right instinct: putting the action adjacent to the instruction.
- The `firstRunWizard` path-choice step (link / code / token) correctly reduces cognitive load for new mods by collapsing three possible credential formats to one visible at a time.
- "Force re-hydrate" auto-attempts before demanding manual action, which is the right automation pattern.

### A.3 What fails

**1. Steps are opaque walls of text, not navigable states.**

Each `reasonSteps` entry is a full sentence containing the step number, the instruction, and the condition check. Example:

> "Step 1 of 3: Click 'Force re-hydrate' button immediately below this banner. Wait 5 seconds."

The user cannot tell at a glance: am I on step 1? Did step 1 succeed? When do I move to step 2? The numbered list is informational, not interactive. There is no visual distinction between "the step you are on" and "the steps you have not reached."

**2. Force re-hydrate fires on click only, not automatically.**

The button triggers `preloadSecrets`, `syncSecretsToBackgroundVault`, then `__validateModAuth`. For `fetch_failed` and `whoami_status`, this is the correct first response to every failure. The user should never have to click it; the banner appearing should trigger the attempt silently. The button should only appear if the auto-attempt fails.

**3. Recovery instructions reference UI that the user has to find manually.**

"Open the popup, expand the Tokens card, and click 'Re-enter credentials'" requires the user to: (a) open the popup, (b) find the Tokens card, (c) find the right button inside it. Each is a step the banner could eliminate by opening the popup directly. The "Open ModTools popup" button exists on `no_token / short_token / whoami_status` routes but it does not deep-link into the specific card or action needed.

**4. The banner and the first-run wizard are two separate systems with no shared state or visual language.**

A mod who gets `no_token` sees the red banner with text instructions. When they click "Open ModTools popup", they land in the popup. If the first-run wizard fires, it is an unrelated orange-bordered panel. There is no continuity between "the thing that told you something is wrong" and "the thing guiding you to fix it." The wizard has no knowledge of the banner state, and the banner has no knowledge of the wizard's progress.

**5. Error states inside the wizard are low-signal.**

`status.textContent = 'claim failed: unknown'` in an amber `#9b9892` text element below the input field. No prominent error state. The step indicator says "Step 2 of 2" regardless of whether the attempt failed or succeeded.

**6. `<ol>` numbering is wrong for partially-completed flows.**

Step 1 of the `fetch_failed` wizard says to click Force re-hydrate. If the user clicked it and got "Still failed (fetch_failed)", they are no longer on step 1. The `<ol>` still shows all three steps as unstarted. There is no way to checkpoint progress.

**7. The success state has an unnecessary 5-second auto-collapse delay.**

`setTimeout(() => { _cardWizardComplete(); ... }, 5000)` collapses the wizard after success. The user has no agency here and no visual countdown. The "Done" button (v10.5.1) was added to give an explicit exit, but the 5-second auto-close still fires underneath it, making the "Done" button redundant and slightly confusing.

**8. The banner's visual treatment screams danger even when recovery is trivial.**

`background: rgba(220,40,40,.95)` with white text is the correct signal for a hard error. But `no_token` is not a hard error; it is an expected first-run state. Showing the same full-red treatment for "you haven't set up yet" as for "the worker is down" misrepresents severity. The user gets adrenaline for a setup task.

---

## B. Redesign

### B.1 Core principle

Attempt recovery automatically first. Show the wizard only when automation is exhausted. Step indicators track actual progress. The banner and popup wizard share visual language and explicit state.

### B.2 Auto-attempt-then-prompt model

**On auth failure, before showing any UI:**

```
1. Auto-fire: preloadSecrets() + syncSecretsToBackgroundVault()
2. Auto-fire: __validateModAuth() re-check
   - If ok: suppress all UI. Log "[auth-wizard] auto-recovery succeeded, suppressing banner."
   - If still failing: determine mode (see B.3), show context-appropriate wizard.
```

This eliminates the "click Force re-hydrate" step from all failure paths where re-hydration is the correct first action. The button becomes a retry for when the auto-attempt has already failed, not a first action.

**Auto-attempt timing:** synchronous within `init()`, before `__showAuthFailBanner` is called. Add a 200ms debounce to avoid flicker on page loads where the SW vault is cold and catches up quickly.

### B.3 Failure mode severity reclassification

| Reason | Severity | Auto-attempt | Wizard mode |
|---|---|---|---|
| `no_token` | Setup (amber) | None -- token genuinely absent | First-run wizard |
| `short_token` | Setup (amber) | Hydrate attempt, then popup | Token-entry wizard |
| `fetch_failed` | Connectivity (yellow) | Auto-retry x1, then show | Connectivity wizard |
| `no_response` | Connectivity (yellow) | Auto-retry x1, then show | Connectivity wizard |
| `whoami_status` | Credential (amber) | Hydrate attempt, then popup | Token-rotation wizard |
| generic | Unknown (red) | Hydrate attempt | Diagnostic wizard |

**Color logic (OKLCH):**
- Setup states: amber-warm `oklch(78% 0.15 60)` border on a near-black panel. Not red. These are expected states.
- Connectivity states: yellow `oklch(85% 0.14 90)` -- signals "wait, not your fault."
- Credential states: amber `oklch(74% 0.16 50)` -- signals "action needed, fixable."
- Unknown/hard states: red `oklch(58% 0.22 24)` -- signals "something is wrong."

The panel background is always `oklch(12% 0.01 260)` (near-black with faint cool tint). Only the border and accent change per severity.

### B.4 Visual step indicator

Replace the `<ol>` text block with a three-zone layout:

```
+--------------------------------------------------+
|  [AMBER BORDER] GAW ModTools                     |
|  Your token needs setup. (subtitle per mode)     |
|                                                  |
|  Step track:                                     |
|  [1: Checking...] > [2: Enter token] > [3: Done] |
|   ^^^^current                                    |
|  ------------------------------------------------|
|  [Active step content area]                      |
|  ------------------------------------------------|
|  [Primary action button]   [Dismiss]             |
+--------------------------------------------------+
```

Step track implementation:
- Three pill-shaped nodes connected by a hairline.
- Current step: filled accent color, label visible.
- Completed steps: filled green `oklch(65% 0.18 150)`, checkmark icon.
- Upcoming steps: unfilled, label dimmed at 35% opacity.
- No animation needed; state changes are instant (no bounce, no elastic).

### B.5 Step content per failure mode

**no_token / short_token (First-run wizard)**

```
[Step 1: Auto-checking]      -> auto-fires, advances to step 2 immediately
[Step 2: Pick your path]     -> 3 buttons: invite link / invite code / team token
[Step 3: Enter + verify]     -> single input, "Save and verify" button
                             -> on success: advance to complete state
[Complete]                   -> "You're in. Reload the page to see the status bar."
                                + auto-dismiss after 8s with visible countdown ("Closing in 7s")
```

Step 1 is a loading state visible for 300-500ms while the hydration auto-attempt runs. If it succeeds, jump to complete. If it fails (token genuinely absent), advance to step 2 with no user action.

**fetch_failed / no_response (Connectivity wizard)**

```
[Step 1: Auto-retry]         -> fires immediately, spinner visible
                             -> if ok: suppress banner entirely
                             -> if still failing: advance to step 2
[Step 2: Site check]         -> "We tried to reach the worker automatically.
                                Check greatawakening.win in a new tab.
                                Is the site loading?"
                             -> Two buttons: "Yes, site loads" / "No, site is down"
[Step 3: Diagnostic path]
  - If "site loads": "Open DevTools (F12) > Console. Look for red lines starting
                      with [modtools]. Copy the first one and send to your lead."
                      + "Copy error to clipboard" button (reads from diag log if accessible)
  - If "site down":  "The worker is offline. Wait 5 minutes and reload this page.
                      Nothing to do on your end." + auto-dismiss in 30s countdown.
```

**whoami_status (Token-rotation wizard)**

```
[Step 1: Auto-refresh]       -> auto-hydrate attempt
                             -> if ok: done, suppress
                             -> if fails: advance to step 2
[Step 2: Open popup]         -> one button: "Open ModTools popup"
                             -> button fires chrome.runtime.sendMessage({type:'openPopup'})
                             -> if popup opens: auto-advance to step 3 + mark popup opened
                             -> if popup unavailable: inline fallback text "Click the GAW
                                ModTools icon in the Chrome toolbar (top right)"
[Step 3: Update token]       -> "In the popup, find the Tokens card.
                                Paste the new token your lead sent. Click Save."
                             -> Listening: chrome.storage.onChanged -- if token changes,
                                auto-fire re-validate. On success: close banner.
```

The listening pattern already exists in the banner (storage.onChanged). Extend it to trigger the same auto-validate loop rather than just dismissing.

### B.6 "Show me" inline tooltips

Each step that references a UI location gets a "Show me" affordance:

```
"Find the Tokens card."  [Show me ?]
```

On hover/click, a small tooltip-arrow image or description appears:
```
"The Tokens card is the first section at the top of the popup, labeled 'TOKENS'.
 Click it to expand."
```

Implementation: a `<button class="wiz-tooltip-trigger">?</button>` with adjacent `<div class="wiz-tooltip" hidden>` text. Show/hide on click. No animation. No external image loading. Text only.

One tooltip per step, keyed to the specific UI element the step references. Do not tooltip-ify generic instructions.

### B.7 Auto-dismiss on resolution

The existing `chrome.storage.onChanged` listener inside the banner already fires when storage changes. Wire it to a re-validate call:

```js
chrome.storage.onChanged.addListener((ch) => {
  if (ch.gam_settings) {
    __validateModAuth().then(re => {
      if (re && re.ok) {
        // animate banner out over 400ms ease-out, then remove
        b.style.opacity = '0';
        b.style.transform = 'translateY(-8px)';
        setTimeout(() => { try { b.remove(); } catch(_){} }, 400);
      }
    });
  }
});
```

Transition: `opacity` and `translateY` only (no layout properties). Ease-out-quart curve.

### B.8 Connecting banner to popup wizard

When the banner fires "Open ModTools popup" and the popup opens:

1. Banner posts a `chrome.runtime.sendMessage({ type: 'authFailBanner', reason: authResult.reason })` before opening.
2. The popup's `initFirstRunWizard` checks for this message on load and, if present, pre-selects the appropriate wizard path (e.g., `whoami_status` -> pre-open the Tokens card, skip step 1 path selection).
3. The popup sends back a `{ type: 'wizardComplete', username }` on success.
4. The banner listens for this message and dismisses.

This replaces the current two-system disconnect with a single user journey spanning both surfaces.

### B.9 Error states inside wizard

When a step fails:

- The step indicator node for the current step turns red `oklch(55% 0.2 20)`.
- The content area shows: error summary (one line, plain English), specific remediation (one line), and a "Try again" button if the action is retryable.
- "Try again" re-fires the same action, re-updates the step indicator to loading state.

Example for token paste failure:

```
[Step 3 node: red]
"That token didn't work (HTTP 401)."
"Make sure you pasted the full token your lead sent, including any trailing characters."
[Try again]  [Ask my lead -- open bug report]
```

"Ask my lead" is a `mailto:` or clipboard-copy fallback (copy diagnostics), not a support ticket system.

### B.10 Eliminating the 5-second auto-collapse

Replace the `setTimeout(_cardWizardComplete, 5000)` with:

- On success: show the complete state with a countdown "Closing in 5..." that ticks visibly.
- "Done" button closes immediately.
- On close (either path): fire `_cardWizardComplete()`.

The user can always interrupt the countdown. No silent auto-close.

---

## C. Effort estimate

| Area | Work | Estimate |
|---|---|---|
| Auto-attempt before banner show | Add 2-function call + 200ms debounce before `__showAuthFailBanner`, re-check result | 0.5h |
| Severity reclassification + color system | 4 CSS classes, switch in banner constructor | 1h |
| Step indicator HTML + CSS | Pill track with 3 nodes, state classes (current / complete / upcoming) | 2h |
| Per-mode step content rewrite | Replace `reasonSteps` string arrays with structured step-object definitions; renderer loop | 3h |
| Connectivity wizard interactive branching | "Site loads?" buttons, two downstream paths, auto-dismiss for "site down" path | 2h |
| Tooltip system | `wiz-tooltip-trigger` + `wiz-tooltip` per step, click-toggle, text-only | 1h |
| Auto-dismiss on storage change with transition | Wire `onChanged` to `__validateModAuth`, opacity+translateY exit | 1h |
| Banner-to-popup message passing | `sendMessage` on banner open, `initFirstRunWizard` message listener, completion ack | 2h |
| Wizard error state redesign | Step node color change, error summary + remediation text, retry button | 1.5h |
| Countdown for wizard auto-close | Replace `setTimeout` with interval, visible tick, Done button interrupt | 0.5h |
| **Total** | | **~14.5h** |

Priority order for implementation:
1. Auto-attempt (0.5h) -- eliminates the most friction for the most users immediately.
2. Banner-to-popup message passing (2h) -- removes the two-system disconnect.
3. Severity reclassification + color (1h) -- kills the false-alarm red for setup states.
4. Step indicator (2h) -- makes progress legible.
5. Per-mode content rewrite (3h) -- requires step indicator complete first.
6. Everything else in dependency order.

A v0 that ships items 1-3 (3.5h) is already a meaningful regression-free improvement over the current design.
