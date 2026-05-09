# AF-20: Anti-Fragile Audit -- Rules 58-60
**v10.5.1 | 2026-05-09 | AUDIT-ONLY**

---

## Rule 58: Feature Flags Toggleable Remotely

### What exists

The infrastructure is solid. `modtools.js` implements a two-tier flag system:

1. **Local flags** (`gam_settings.features.*`) -- per-install defaults. 18 flags defined in `MAINT_DEFAULT_SETTINGS` neighborhood, including `features.firehose`, `features.superMod`, `features.drawer`, `features.teamBoost`, `features.platformHardening`, etc.

2. **Team override layer** (`_teamFeatures` object, polled every 5 minutes via `rpcCall('modFeaturesRead', {})` hitting `/features/team/read`) -- lead-promoted values that dominate local defaults. `getFeatureEffective(key, localDefault)` is the canonical read path; call sites in the content script have been migrated to it (v7.1.2 note in code).

Worker endpoint `team_features` row model surfaces in code comments at `popup.js:2766` (bug report visibility) and in the brigade-alert section. The `modFeaturesWrite` / `modFeaturesDelete` RPCs let leads promote/demote flags from the settings UI.

### Gaps

**Gap 1 -- Four high-risk features lack team-flag gates.**

| Feature | Current gate | Missing |
|---|---|---|
| `features.firehose` | `getFeatureEffective('features.firehose', false)` -- correctly team-aware | NONE -- already gated |
| Brigade hard-alerts (`HARD_ALERTS_ON`) | Hard-coded `const HARD_ALERTS_ON = false` at `modtools.js:23042` | No team-flag path. Soak-mode constant can only be changed by a code push, not a remote flag flip. |
| AI Hold Queue panel open | Status bar badge click unconditionally calls `SQ.toggle()` in `V10_V11/02_AI_HOLD_QUEUE.md` spec; no feature flag check | `getFeatureEffective('features.aiHoldQueue', false)` guard missing at toggle entry point |
| AI-DM-send (`adminDiscordDmModSend` RPC) | No flag. Any lead caller with a valid token can invoke. | `getFeatureEffective('features.discordDmSend', false)` check inside the RPC handler or at the popup call site before firing |

**Gap 2 -- `features.firehose` default is `false` in settings defaults, but the boot logic auto-starts if flag is effective-true.** The path `getFeatureEffective('features.firehose', false)` is correct. However, the AI Hold Queue spec (section C2) calls `rpcCall('GET', '/admin/queue/ai-flagged?limit=50&claim=1')` directly with no feature-gate check. If the panel is wired before the team flag is promoted, mods hit the endpoint regardless.

**Gap 3 -- Poll failure is silent.** When `pollTeamFeatures()` fails, the `catch` block swallows the error completely (`/* swallow -- retry next tick */`). If the worker is unreachable for an extended period, the extension silently runs on stale local defaults. There is no staleness indicator (e.g., `_teamFeaturesLastPoll` age check surfaced to the status bar).

### Proposals

1. **Convert `HARD_ALERTS_ON` to a team flag.** Replace the hard-coded constant at `modtools.js:23042` with `const HARD_ALERTS_ON = getFeatureEffective('features.brigadeHardAlerts', false)`. Add `'features.brigadeHardAlerts': false` to `MAINT_DEFAULT_SETTINGS` in `popup.js`. Lead can promote when soak is complete with no code push.

2. **Add AI Hold Queue feature gate.** Wrap `SQ.toggle()` in `if (!getFeatureEffective('features.aiHoldQueue', false)) return;`. Default `false` until lead promotes. Add to settings defaults.

3. **Add AI-DM-send feature gate.** Add `if (!getFeatureEffective('features.discordDmSend', false)) return { ok: false, error: 'feature disabled' };` at the top of the `adminDiscordDmModSend` handler in `background.js`. This is a send-path action with no undo; remote kill-switch is non-optional.

4. **Surface poll staleness.** In the status bar maintenance warning path, if `Date.now() - _teamFeaturesLastPoll > 15 * 60 * 1000` (15 min, 3 missed polls), add a `[FLAGS-STALE]` chip to the bar. Non-blocking; just visible.

---

## Rule 59: Gracefully Handle Missing Optional Permissions

### What exists

The manifest declares exactly three `permissions`:

```json
"permissions": ["storage", "alarms", "cookies"]
```

No `optional_permissions` block exists. All three are required permissions -- they are granted at install time or the extension fails to install. There are no runtime `chrome.permissions.request` calls anywhere in the codebase.

The `host_permissions` block grants `greatawakening.win/*` and the worker URL.

### Gaps

**Gap 1 -- `cookies` permission has one graceful check, everything else is bare.**

In `popup.js:maintClearCookies()`, there IS a guard:

```js
if (!chrome.cookies || !chrome.cookies.getAll) {
  throw new Error('chrome.cookies API unavailable -- did the cookies permission install?');
}
```

This is the only permission guard in the entire codebase. The error surfaces to the status div. This is adequate for a required permission (it should never fire in normal operation) but there is no user-visible recovery path -- the status just shows the error string.

**Gap 2 -- `alarms` permission has zero guards.** `background.js` calls `chrome.alarms.create(...)` six times inside a `try/catch` that only logs `'alarm create failed'` to the SW console -- a surface no end user ever sees. If alarms fail (Firefox with MV3, restricted enterprise profile), all timed maintenance routines silently stop: weekly health reports never run, token-age warnings never fire, bug-poll never runs. The content script has no visibility into this.

**Gap 3 -- `storage` permission has no guards.** Every `chrome.storage.local.get/set/remove` call is in try/catch blocks, but they catch generic errors and surface them as "failed: ..." strings. None distinguish "storage unavailable" from other errors. In practice `storage` cannot be revoked post-install, but the code has no defense-in-depth here.

**Gap 4 -- Brigade hard-alert path uses `Notification` API (Web API, not Chrome extension permission) with only a `Notification.permission === 'granted'` check.** This is the correct pattern for the Web Notification API. However, the check is inside the `if (HARD_ALERTS_ON && ...)` branch which is currently dead code (`HARD_ALERTS_ON = false`). When that flag goes live (post proposal #1 above), this check will matter. It is already correct -- no action needed here unless `Notification.requestPermission()` is added to a first-run flow.

**Gap 5 -- No `chrome.permissions.contains` check at any entry point.** Since all permissions are required (not optional), this is less critical than it would be with an `optional_permissions` block. However, enterprise policies can revoke permissions on required extensions. A startup check would make failures diagnosable.

### Proposals

5. **Add alarm availability probe at SW startup.** After `chrome.alarms.create(...)` calls in `onInstalled`, query `chrome.alarms.get(ALARM_NAME, cb)` and if the alarm is missing after creation, write `gam_alarm_broken = true` to `chrome.storage.local`. Content script reads this flag at init and adds an `[ALARMS OFFLINE]` chip to the maintenance warning. Non-blocking; purely diagnostic.

6. **Add `chrome.permissions.contains` probe at popup open** for the three required permissions. If any returns false (enterprise revocation scenario), show a single-line banner in the popup header: "Permission X revoked -- some features will not work. Re-install the extension." This fires only on a genuine anomaly; add a 5-minute debounce so it is not checked on every popup open.

7. **Convert cookie-clear error from raw throw to user-facing recovery.** Current path throws and the `catch` in `maintClearCookies` writes to the status div, which is fine. Proposal: also surface a fallback action -- "cookies permission unavailable; clear manually at chrome://settings/siteData" -- so the mod has a concrete next step.

---

## Rule 60: "Reset Extension" Nuclear Option

### What exists

Two separate reset mechanisms:

**A. "Clear all" button** (`clearBtn` in `popup.html` footer, `popup.js:457`)

- Location: always visible, popup footer, labeled "Clear all" in red (`pop-link-danger` class)
- Confirmation: ONE `window.confirm()` dialog. Text updated at v9.3.6 to explicitly list what is wiped including mod token. Text:

  ```
  Clear ALL ModTools data?

  This wipes:
    * Your mod token (you'll need a fresh rotation invite from your lead to recover)
    * Lead token (if set)
    * Mod log, roster, death row, watchlist, verification, notes, intel cache

  This cannot be undone. Continue?
  ```

- Scope: removes all `OWNED_KEYS` from `chrome.storage.local` (storage, alarms, cookies permissions, gam_mod_log, gam_users_roster, gam_deathrow, gam_watchlist, gam_banned_verified, gam_user_notes, gam_profile_intel, gam_schema_version, gam_fallback_mode, gam_settings, gam_sniff_log). Also sends `clearTokens` RPC to zero the SW vault. Also sends a message to every open GAW tab to clear their localStorage.
- Token preservation: NONE. Both mod token and lead token are wiped.
- Audit log: `gam_diag_log` is NOT in `OWNED_KEYS` and is NOT wiped. The diag log survives "Clear all."
- Recovery: the confirm message tells the user what to do (ask lead for rotation invite). No in-UI recovery button.

**B. "Reset settings to defaults" button** (`maintReset` in Maintenance > System diagnostics (advanced), `popup.js:4056`)

- Location: buried under Maintenance card > "System diagnostics (advanced)" accordion. Hidden from plain view.
- Confirmation: TRIPLE-CONFIRMED. `ok2 = window.confirm(...)` (first confirm), `ok2 = window.confirm(...)` (second confirm), then `__popupAskText({ title: 'CONFIRM #3 of 3', validate: v => v === 'RESET' ? '' : 'Type RESET (uppercase) exactly.' })`.
- Scope: removes OWNED_KEYS except `gam_settings`, plus `gam_learned_selectors`. Re-installs `gam_settings` with `MAINT_DEFAULT_SETTINGS` merged with preserved UX prefs.
- Token preservation: YES. Tokens, tier, username, onboarding markers, UX preferences (dock position, sidebar, filter state, easter eggs) are all preserved. Only feature flags and caches reset.
- Audit log: `gam_diag_log` survives (not in OWNED_KEYS and not in the explicit key list).
- Recovery: status message says "Tokens + UX prefs preserved. Reload GAW tabs." No further action required for authentication.

### Gaps

**Gap 1 -- "Clear all" has single-confirm, not triple-confirm.** The consequences (token loss requiring lead intervention) are more severe than "Reset settings" (token preserved), yet "Reset settings" has triple-confirm and "Clear all" has single-confirm. This is inverted. A mod who clicks "Clear all" by reflex (it is always visible and red) loses their token and is locked out until the lead issues a rotation invite.

**Gap 2 -- `gam_diag_log` survives both resets -- this is correct but not documented.** The audit log (`gam_diag_log`) is intentionally excluded from OWNED_KEYS. This means it survives a "Clear all." This is the right call -- you want the audit trail to survive a nuclear reset -- but the confirm message does not say so. A mod might assume "Clear all" wiped their log and stop reporting thinking they have no evidence.

**Gap 3 -- No in-UI recovery path after "Clear all".** After wiping the token, the popup shows empty state with no prompt to re-enter credentials or launch the wizard. The `firstRunWizard` shows when `gam_settings.tokenOnboardedOnce` is absent. After a "Clear all" that wipes `gam_settings`, the wizard should auto-appear on next popup open. Verify: the wizard init in `popup.js:initFirstRunWizard()` reads `gam_settings.tokenOnboardedOnce` -- if "Clear all" wipes gam_settings entirely, the wizard WILL re-show. This is the correct behavior, but it should be tested; the confirm message should mention it: "The setup wizard will re-appear to guide you through re-authentication."

**Gap 4 -- "Reset settings" confirm dialogs use `window.confirm()` (dialogs #1 and #2).** `window.confirm()` in a Chrome extension popup is supported but can be blocked by enterprise policy (`--disable-javascript-harmony` or popup dialog suppression). If blocked, the confirm returns `false` and the reset is silently cancelled. For a nuclear button this is tolerable (fails safe), but the user has no indication the dialog was suppressed. The third confirm uses `__popupAskText()` (custom modal) which is immune to this. Making all three use `__popupAskText` would be more consistent.

**Gap 5 -- "Clear all" is visible to all tiers.** Any mod can nuke their installation. This is intentional (it's their own data), but a confused non-lead mod who runs "Clear all" thinking it is a "logout" button loses their token and blocks themselves from modding until the lead issues a rotation invite. The button label "Clear all" does not communicate the severity.

### Proposals

8. **Escalate "Clear all" to triple-confirm.** Match the pattern of `maintReset`. Dialog #1: current text (already correct). Dialog #2: "This includes your mod token. You cannot recover it yourself -- only your Lead can issue a new rotation invite. Are you sure?" Dialog #3: `__popupAskText({ label: 'Type WIPE to confirm', validate: v => v === 'WIPE' })`. The popup modal `__popupAskText` already exists in `popup.js`.

9. **Add to "Clear all" confirm message:** "Your audit log (gam_diag_log) is preserved. The setup wizard will re-appear to guide re-authentication." This resolves gaps 2 and 3 simultaneously with zero code change beyond the string.

10. **Rename or re-label the footer button.** "Clear all" reads like a form-clear action. "Wipe installation" or "Factory reset" more accurately communicates irreversibility. Low effort, high signal-to-noise for new mods.

11. **Post-reset wizard auto-show -- verify and document.** Confirm via manual test that a "Clear all" (which wipes `gam_settings` entirely) causes `firstRunWizard` to appear on the next popup open. If it does, add a comment to the `clearBtn` handler documenting this behavior. If it does not (because `tokenOnboardedOnce` is read from a different path), fix the wizard init check to also trigger on `gam_settings` absence.

---

## Summary Table

| Rule | Finding | Severity | Proposal |
|---|---|---|---|
| 58 | `HARD_ALERTS_ON` hard-coded, no remote toggle | HIGH | #1: convert to `features.brigadeHardAlerts` team flag |
| 58 | AI Hold Queue has no feature gate | HIGH | #2: `getFeatureEffective('features.aiHoldQueue', false)` at toggle entry |
| 58 | AI-DM-send has no feature gate | HIGH | #3: kill-switch in `adminDiscordDmModSend` handler |
| 58 | Team flags poll-failure is silent | MEDIUM | #4: `[FLAGS-STALE]` chip after 15min gap |
| 59 | Alarm creation failures invisible to users | MEDIUM | #5: `gam_alarm_broken` flag + status chip |
| 59 | No `chrome.permissions.contains` startup probe | LOW | #6: probe at popup open, 5min debounce |
| 59 | Cookie-clear has no recovery path in error text | LOW | #7: add fallback instruction to error string |
| 60 | "Clear all" single-confirm vs Reset's triple-confirm | HIGH | #8: escalate to triple-confirm + `__popupAskText` |
| 60 | Audit log survival not mentioned in "Clear all" confirm | MEDIUM | #9: add two sentences to confirm text |
| 60 | Button label does not signal irreversibility | MEDIUM | #10: rename to "Factory reset" or "Wipe installation" |
| 60 | Post-reset wizard auto-show unverified | MEDIUM | #11: manual test + comment |

**Priority order for v11 implementation:** #1, #2, #3 (Rule 58 flag gates for live high-risk features), then #8 (nuclear button safety), then #4, #5, #9, #10, #11.
