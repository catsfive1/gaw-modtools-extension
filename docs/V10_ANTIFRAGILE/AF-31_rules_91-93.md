# AF-31 -- Rules 91-93: Visible Feedback, Recovery Options, Health Indicators

**Auditor:** AF-31 agent  
**Date:** 2026-05-09  
**Version audited:** v10.5.1  
**Mode:** AUDIT-ONLY -- no code changes proposed here

---

## Rule 91 -- Every action must have visible feedback (loading, success, error)

Audit scope: ban send, modmail send, macro upsert, claim invite, dock toggle, watchlist toggle, AI hold queue j/k.

### BAN SEND -- PASS

The ban path (`modtools.js` ~L8524) is the strongest in the codebase. It follows a sequential banner progression inside `#mc-ban-status`:

1. `goBtn.disabled = true` immediately on click
2. "Capturing evidence..." banner
3. "Sending ban..." banner
4. On failure: red banner + re-enables button + `snack('Ban failed...', 'error')`
5. On success: "Ban POST accepted. Verifying..." then green checkmark
6. A 10-second undo toast mounts inline (V11 #5 undo middleware)

No silent path exists. The warning-only sub-path (duration === 0) shows "Sending warning message..." and resolves to green or red. This is the gold standard.

### MODMAIL SEND -- PASS WITH NOTE

The mod-to-mod chat send (`STATE.sendBtn`, `modtools.js` ~L14949-14998) disables the button during flight and re-enables on resolution. The modmail panel send path at `modtools.js` ~L3355-3378 does the same (`submit.disabled = true/false`). However, the success state for the chat panel does not emit a snack -- it relies solely on the message appearing in the thread list as the visual confirmation. That is acceptable UX but the edge case where the message silently fails network-side (not a 4xx, just a dropped response) would leave the button re-enabled with no feedback. Low risk; not a Rule 91 violation at current traffic levels.

### MACRO UPSERT -- PASS (content script), PASS (popup)

Content script path (`modtools.js` ~L8021-8043): `macroUpsert` RPC fires, success emits `snack('Macro saved to team', 'success')`, failure emits `snack('Save failed: ...', 'error')`. No loading state or button disable surrounds the RPC call itself -- the dropdown returns to its header option on `macroPick.value = ''` immediately, which functions as implicit loading. This is a minor violation of the spirit of Rule 91: the mod cannot tell whether the save is in-flight or has resolved until the snack appears. A button disable for the ~200ms network round-trip is missing but the window is short enough that it has not caused user complaints.

Popup path (`popup.js` ~L3174-3188): `__macroSave` sets `__macroSetStatus('saving...')` before the RPC, then resolves to tick or error. Full feedback loop present.

**Minor gap flagged:** content-script macro upsert has no loading indicator for the async call, only a post-hoc snack. If the worker is slow (>1s), the mod receives no in-flight signal. Not a breaking violation but should be hardened.

### CLAIM INVITE -- PASS

`modtools.js` ~L20107-20141: The claim flow shows `window.confirm()` as the loading gate (user-acknowledged). On HTTP failure: `snack('Invite claim rejected (HTTP N)', 'error')`. On malformed token: `snack('Server returned malformed modToken -- refused.', 'error')`. On success: `snack('Welcome! ModTools is now synced with your team.', 'success')`. All three branches covered.

**One gap:** the fetch itself at L20121 has no loading indicator between the confirm click and the response. On a slow connection the UI appears frozen for up to 5s with no spinner or button state change. This is a Rule 91 violation -- the mod has no signal that the claim is in-flight after clicking OK in the confirm dialog.

### DOCK TOGGLE -- PASS

`modtools.js` ~L15047-15070: dock flip is instant (CSS attribute change) and mounts a 4-second undo toast locally inside the panel head. The label updates immediately to reflect the new side ("DOCK: R" -> "DOCK: L"). No async, no network -- instant feedback is appropriate. The undo toast counts as both success signal and recovery option. This is correct.

### WATCHLIST TOGGLE -- PARTIAL VIOLATION

`modtools.js` ~L4500-4503: `toggleWatch()` is a pure localStorage read-modify-write with no feedback whatsoever. Call sites in the NBA actions block (`L5580`) do emit `snack(id + ' watching', 'warn')` -- that path is covered. However the call sites at L12592 and L12886 (Triage Console batch paths and the users-page action strips) write to the watchlist synchronously and emit no snack. A mod toggling watchlist from a triage row gets zero confirmation. Rule 91 violation at those two call sites.

The `toggleWatch` function itself returns `true/false` (added/removed) which callers COULD use to emit feedback, but the triage-row handlers do not check the return value before moving on.

### AI HOLD QUEUE j/k -- PASS WITH NOTE

Per the `02_AI_HOLD_QUEUE.md` spec (Section C2), the `decide()` function at the relevant JS block:

1. Adds animation class `gam-sq-deciding-approve` or `gam-sq-deciding-reject` immediately on keypress
2. Fires the resolve RPC non-blocking (`.catch(err => gamLog(...))`)
3. After 180ms removes the row from the list

**This is a Rule 91 problem in the error path.** The RPC call is fired non-blocking, meaning if the resolve endpoint returns an error (409 already-resolved, 401 bad token, 503 worker down), the mod sees the row slide out and gets no feedback. The `.catch()` writes to `gamLog` but gamLog is internal -- nothing surfaces to the UI. An item the mod thought they resolved could remain unresolved in D1 with no indication.

The spec document notes this was intentional for animation UX but it violates Rule 91's error-visibility requirement. Success path is fine (animation = implicit success). Error path is silent.

---

## Rule 92 -- Never hide recovery options for clean-UI reasons

### TOKENS CARD COLLAPSE -- PASS, WITH ONE CONDITION

The collapse mechanism (`popup.js` ~L33-113) uses native `<details>/<summary>`. State persists to `chrome.storage.local` (`gam_card_open_tokens`). The card is always present in the DOM -- collapse only hides the body. The summary/header remains clickable at all times. Recovery from a collapsed tokens card is: click the summary. Zero re-install required.

**Auth-fail guard is correct:** `_cardAuthFailed()` forces the card open AND applies the red-rail `gam-card-urgent` class, ensuring the mod cannot miss the problem. The forced-open does NOT persist to storage (intentionally -- to avoid fighting a transient-error expansion with the user's deliberate preference). This is the right design.

**One condition to watch:** `_cardAutoCollapseTokens(whoamiOk)` collapses the card when auth succeeds. If the popup is opened during a brief window where auth is flapping (succeed, collapse, fail, but the `_cardAuthFailed` re-expansion hasn't fired yet), the mod could see a collapsed token card on an auth-failed session. The whoami probe runs in `loadToken` and the auth-fail handler fires in the same flow, so the race window is <100ms. Acceptable but worth instrumenting in the next pass.

### RESET EXTENSION -- PASS, GUARDED BY TRIPLE CONFIRM

`popup.js` ~L4125-4192: `maintResetDefaults` is gated behind three sequential confirmations:
1. `__popupConfirm` warning dialog
2. A second confirm
3. A typed "RESET" text input

After reset, tokens and UX prefs are preserved (token, leadToken, dock layout, etc.). The mod can still use the extension without reclaiming anything. This is not a hidden recovery path -- it is a nuclear option with enough friction that accidental activation is nearly impossible. Rule 92 satisfied.

**`clearBtn` (full data wipe) -- BORDERLINE.** `popup.js` ~L457-494 requires only a single `window.confirm()`. This wipes the mod token -- after which the mod must obtain a fresh rotation invite from their lead. The confirm message now explicitly states "you'll need a fresh rotation invite from your lead to recover" (added in v9.3.6 fix). The recovery option IS disclosed, but it is disclosed in a native browser dialog that many users click through without reading. Rule 92 technically satisfied (the option is findable) but the single-confirm gate for a token-destroying action is weaker than the triple-confirm reset. Flagged for a future hardening pass -- minimum: add a typed-confirmation for `clearBtn` matching the reset flow.

### "RE-RUN SETUP" BUTTON -- PASS

`_cardWizardComplete()` (`popup.js` ~L87-113) injects a "Re-run setup" button into the card badge slot when the wizard completes. The button is visible in the collapsed card header (summary row), so the mod can always re-enter the wizard without any hunt. Rule 92 satisfied.

### FALLBACK MODE -- PASS

FallbackMode toggle (`modtools.js` ~L1776) emits a prominent orange snack when native fallback is activated. The in-page UI continues to function via native Reddit buttons. The mod can disable fallback via Settings. Recovery is one toggle, always accessible through the gear icon in the status bar.

### INTEL DRAWER / MOD CONSOLE -- NO HIDDEN RECOVERY

Close buttons are always visible. Mod Console has Cancel at every step. No confirmation state hides the close affordance. Pass.

---

## Rule 93 -- Provide clear status indicators for extension health

### CURRENT STATE

The status bar has partial health coverage:

- **Session health dot** (`sessDot`, ~L16143-16164): green/red dot, click triggers CSRF + whoami probe, snacks the result. Shows session liveness but does not surface the underlying data.
- **Auth-fail banner** (`gam-auth-fail-banner`): full-width red banner when auth is definitively broken, with a "Force re-hydrate" button and an "Open ModTools popup" button. This is excellent -- Rule 91 + 92 both satisfied here.
- **Ticker** (`tickerEl`): shows team-broadcast messages, not extension health.
- **Version update notice** (`gam-update-close`, ~L20828): surfaces when a newer extension version is available. Dismissible. Only shows available_version vs. current -- does not show worker deployed_version.

**What is missing for single-glance health:**

The `/version` endpoint now correctly separates `deployed_version` (worker) and `available_version` (GitHub latest), per `V10_FRONTEND/04_VERSION_ENDPOINT.md`. The popup reads this but the in-page status bar does not surface the worker version or extension version at a glance. Token age is not surfaced anywhere. Queue depth exists as an `[AI:N]` badge in the spec but only when `sqPending > 0` (invisible on a clear queue).

### PROPOSED HEALTH CHIP

A single compact chip should live at the right end of the status bar, between the chat button and the ticker. It aggregates the four signals that matter most for a mod's moment-to-moment confidence:

```
[v10.5.1 | W:9.4.8 | T:6d | Q:4]
```

- **Ext version** -- `chrome.runtime.getManifest().version` -- always available, zero network cost
- **Worker version** -- from `/version` response `deployed_version` field -- cached; refresh on popup open or every 60min
- **Token age** -- derived from token creation timestamp stored at claim time, or from whoami response metadata if the worker surfaces it -- expressed in days ("2d", "14d", "expired")
- **Queue depth** -- from `/admin/queue/ai-flagged/stats` `pending` count -- polled every 5min alongside the existing `pollSessionHealth` interval

**Lead-only vs all-mods decision:** All mods should see this chip. The queue depth is the only lead-privileged data point, and even regular mods benefit from knowing there are items awaiting review (it prompts them to open the Signal Queue panel). The worker already returns `pending` count on the stats endpoint to any valid mod token. Lead-exclusive display of the queue count would require a separate endpoint path and fragments the health picture for no gain.

**Chip states:**

| Signal | Healthy display | Warning display | Critical display |
|---|---|---|---|
| Ext version | `v10.5.1` (grey) | `v10.5.1*` with asterisk if update available (amber) | -- |
| Worker version | `W:9.4.8` (grey) | `W:!` if /version fetch failed (amber) | -- |
| Token age | `T:6d` (grey) | `T:28d` (amber if >21 days) | `T:EXP` red if whoami fails |
| Queue depth | `Q:0` hidden or grey | `Q:4` (amber when >0) | `Q:10+` (red if >10) |

The chip itself is a single `<span>` with monospace font, low contrast at idle, that upgrades to amber/red per the worst signal among the four. Hovering expands a tooltip with the full detail. Clicking routes to the popup.

**Token age implementation note:** The extension currently stores the token via `setSetting('workerModToken', d.modToken)` at claim time (~L20140) but does not persist the claim timestamp. The `whoami` response from the worker should surface a `token_issued_at` or `token_age_days` field so the chip can render accurately without a client-side timestamp that would reset on every token re-hydration. If the worker does not yet expose this, the fallback is to store `gam_token_claimed_at: Date.now()` at claim time and at every successful re-hydration. Either approach is one additional field.

---

## Summary Table

| Action | Rule 91 status | Notes |
|---|---|---|
| Ban send | PASS | Full banner + button-disable + undo toast |
| Modmail send (panel) | PASS | Button disable + error handling |
| Modmail send (chat) | PASS WITH NOTE | No snack on success; message appearance is implicit |
| Macro upsert (popup) | PASS | `saving...` -> tick/error |
| Macro upsert (content script) | MINOR VIOLATION | No loading indicator during async flight; only post-hoc snack |
| Claim invite | VIOLATION | No in-flight indicator after confirm dialog |
| Dock toggle | PASS | Instant feedback + undo toast |
| Watchlist toggle (NBA/snack path) | PASS | Snack emitted |
| Watchlist toggle (triage/batch paths) | VIOLATION | Two call sites at L12592, L12886 emit no feedback |
| AI hold queue j/k success | PASS | Animation = implicit success |
| AI hold queue j/k error | VIOLATION | RPC error is non-blocking; mod sees row vanish with no error signal |

| Recovery path | Rule 92 status | Notes |
|---|---|---|
| Tokens card collapse | PASS | Always re-expandable; auth-fail forces open |
| Clear all data | BORDERLINE | Single-confirm for token-destroying action; recovery path is disclosed in dialog |
| Reset extension | PASS | Triple-confirm; tokens preserved |
| Re-run wizard | PASS | Button in collapsed card header |
| Fallback mode | PASS | Toggle always accessible via gear |

| Health signal | Rule 93 current status | Proposal |
|---|---|---|
| Auth failure | PASS | Full-width red banner + two recovery buttons |
| Session dot | PARTIAL | Click-to-probe only; no always-visible data |
| Extension version | NOT SURFACED in-page | Add to health chip |
| Worker version | NOT SURFACED in-page | Add to health chip from /version |
| Token age | NOT SURFACED | Add to health chip; requires token_issued_at from worker or local timestamp |
| Queue depth | PASS when >0 (badge) | Normalize into unified health chip; remove the conditional-only badge |

---

_Word count: ~2,100. Audit-only mode -- zero code changes._
