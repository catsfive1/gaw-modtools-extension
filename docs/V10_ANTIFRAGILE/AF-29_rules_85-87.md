# AF-29 Audit: Rules 85-87 — Extension Update Handling, Manifest Permissions, Dynamic Import

**Suite:** Anti-Fragile (AF) | **Rules:** 85, 86, 87 | **Version:** v10.5.1 | **Mode:** AUDIT-ONLY

---

## Rule 85 — Handle Extension Update While Running (`chrome.runtime.onUpdateAvailable`)

### Current State

`chrome.runtime.onUpdateAvailable` is **not registered anywhere** in the codebase. The extension does not listen for the Chrome-native update-staged event at all.

Instead, v10.5.1 implements a **custom version-polling mechanism** (introduced v9.3.14, Vanguard C-3):

- `background.js` creates an alarm `gam_update_check` firing every 30 minutes.
- On each tick, it `fetch()`es the worker's `/version` endpoint (not GitHub — GitHub was removed in Vanguard L-3 to eliminate the maintainer's username from the binary).
- If local manifest version != remote, background writes `{ from, to, at, firstSeenAt }` to `chrome.storage.local` key `gam_update_available`.
- A SW-RAM copy (`_UPDATE_FLAG_LAST_SET`) enables `verifyUpdateFlag` to prove the flag was set by the alarm path, not by any rogue in-extension write (Vanguard ER2-C-4 supply-chain defense).
- `modtools.js` reads the flag 1500ms after init, calls `verifyUpdateFlag` against the SW, and — if verified — calls `showUpdateBanner()`, which renders a fixed `.gam-update-banner` element.
- The banner provides a "Reload extension" button that opens `chrome://extensions/?id=<extension-id>`. The user must click the reload arrow manually. **No auto-reload occurs** (auto-reload was explicitly removed as an RCE primitive).
- Once the user reloads and the versions match, the flag is cleared by the next alarm cycle.

### Gap vs. Rule 85

Rule 85 asks for: (a) a non-blocking banner surfacing the new version, (b) auto-reload after 30 minutes if the user doesn't act, gated on persisting current state first.

**Banner — implemented.** The `.gam-update-banner` UI is in place, verified against the SW before render, and non-blocking (fixed top, not a modal).

**Auto-reload — intentionally absent.** Auto-reload was removed in v9.3.14 as a supply-chain RCE vector. This is a documented security decision, not an oversight. See `background.js` lines 4-17.

**What is missing vs. Rule 85 (proposal only, not implemented here):**

The 30-minute auto-reload with state-persist guard is architecturally feasible under the existing alarm infrastructure. Implementation would require:

1. Track `firstSeenAt` in the `gam_update_available` flag payload — **already done.**
2. In the alarm handler, compute `ageMs = Date.now() - firstSeenAt`. If `ageMs > 30 * 60 * 1000` and the user has not dismissed the banner for this version:
   - Snapshot current mod state to `chrome.storage.local` (tokens already in SW vault; any ephemeral UI state needing persist is in `getSetting`/`setSetting` which writes to storage on each call — no extra snapshot required).
   - Call `chrome.runtime.reload()`.
3. The "user dismissed" check must use the existing `updateDismissedFor` setting (already read in `modtools.js` line 20781) as the suppress signal — if `dismissed === flag.to`, skip the auto-reload.

**Security constraint:** `chrome.runtime.reload()` re-introduced here would be safe only because the version source is the worker endpoint (not GitHub), the flag is SW-verified before any reload decision, and the dismiss path is honoured. The Vanguard C-3 threat (GitHub push -> mass RCE) does not apply when the reload is timer-gated and user-dismissible. If this is ever shipped, it must be gated on the `verifyUpdateFlag` SW check, not the raw storage value.

**Current `onUpdateAvailable` gap:** Chrome fires `chrome.runtime.onUpdateAvailable` when Chrome's own update mechanism has staged a new `.crx`. This is separate from the custom version-polling flow. Because ModTools is not distributed through the Chrome Web Store (it is sideloaded), this event will never fire in practice. Registering a handler is harmless but unnecessary for this deployment model. Document the decision and close.

---

## Rule 86 — Minimize Manifest Permissions

### Current Manifest

```json
"permissions": ["storage", "alarms", "cookies"],
"host_permissions": [
  "https://greatawakening.win/*",
  "https://*.greatawakening.win/*",
  "https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev/*"
]
```

### Permission-by-Permission Audit

#### `storage`
**Status: KEEP. Actively used.**

`chrome.storage.local` is the primary persistence layer across all three files. Background uses it for the secret vault (`setTokens`/`tokensStatus`), update flag (`gam_update_available`), maintenance flags (`gam_maint_warning`, `gam_diag_log`), and bug-poll badge state. Content script uses `getSetting`/`setSetting` which wraps storage reads. Popup uses it for diagnostics and maint routines. This permission is load-bearing everywhere.

#### `alarms`
**Status: KEEP. Actively used — 7 distinct alarms registered.**

Evidence from `background.js` `onInstalled` handler (lines 141-148):

| Alarm constant | Purpose | Period |
|---|---|---|
| `gam_update_check` | Version poll against worker `/version` | 30 min |
| `gam_bug_poll` | Bug report badge for lead/visible-mod toolbar | 5 min |
| `gam_maint_quota_check` | Storage quota warning (>80%) | MAINT_QUOTA_PERIOD_MIN |
| `gam_maint_token_age_check` | Token age warning (>60d) | MAINT_TOKEN_AGE_PERIOD_MIN |
| `gam_maint_diag_rotate` | Diagnostic log rotation | MAINT_DIAG_ROTATE_PERIOD_MIN |
| `gam_maint_intel_evict` | Intel cache eviction | MAINT_INTEL_EVICT_PERIOD_MIN |
| `gam_maint_weekly` | Weekly maintenance sweep | MAINT_WEEKLY_PERIOD_MIN |

All 7 are dispatched in `chrome.alarms.onAlarm.addListener` (lines 761-768). No unused alarm is created. Permission is fully justified.

#### `cookies`
**Status: KEEP. Actively used — but narrowly.**

Used exclusively in popup.js `Routine #1` of the Maintenance panel: "Clear stuck GAW cookies + localStorage" (lines 3707-3755). The routine calls `chrome.cookies.getAll({ domain })` across three domain variants and `chrome.cookies.remove()` for matched cookie names (XSRF, session, `cf_*`). There is a defensive guard at line 3721: `if (!chrome.cookies || !chrome.cookies.getAll) { throw ... }`.

This is a user-invoked, click-only maintenance routine — never alarm-driven. The permission is justified for this explicit user-facing function.

**Reduction opportunity (low priority):** The `cookies` permission grants read/write access to all cookies on `host_permissions` domains. There is no way to narrow it further within MV3's permission model. The feature justifies the permission; no action required.

#### `host_permissions`

| Entry | Justification |
|---|---|
| `https://greatawakening.win/*` | Content script injection target; all mod API calls (`modPost`, `modGet`) target this origin |
| `https://*.greatawakening.win/*` | Subdomain coverage (e.g. `images.greatawakening.win`, future subdomains); consistent with GAW's CDN topology |
| `https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev/*` | Worker proxy origin; all RPC calls from background (`workerFetch`) and version-check `fetch()` target this URL (line 24-25, `background.js`) |

All three are actively used. No host permission should be removed.

### Permissions Verdict

**No permissions to remove.** All three declared permissions and all three host permission entries have code evidence of active use. The manifest is already minimal for the feature set deployed.

---

## Rule 87 — Dynamic `import()` for Code Splitting

### Architecture Statement

ModTools uses a **deliberate single-file content script architecture**. The three distributed files are:

| File | Role | Dynamic `import()` applicable? |
|---|---|---|
| `modtools.js` | Content script — injected into GAW pages | **No** |
| `background.js` | Service worker | **No** |
| `popup.js` | Extension popup page | **No** |

### Why Dynamic Import Is Not Applicable

**Content scripts (`modtools.js`):** Chrome's content script environment does not support ES module syntax or `import()`. Content scripts run in an isolated world but are not modules — they are classic scripts. `import()` in a content script throws `ReferenceError` at runtime. The single-file architecture is the only viable approach absent a bundler that inlines all dependencies. This is not a limitation to work around; it is a browser constraint.

**Service worker (`background.js`):** MV3 service workers *do* support ES module syntax when declared as `"type": "module"` in the manifest's `background` stanza. The current manifest does not declare `"type": "module"`, meaning `background.js` runs as a classic script. Dynamic `import()` is unavailable in this configuration. Migrating to a module worker would enable code splitting here, but given background.js's role (always-on event router, never lazily loaded), there is no latency or memory benefit to splitting it. The cost — manifest change, potential compatibility delta — exceeds the gain.

**Popup (`popup.js`):** Popup pages support ES modules (they are HTML pages loading scripts). However, `popup.js` is loaded synchronously as `<script src="popup.js">` in `popup.html`. Adding `import()` would require converting the script tag to `<script type="module">` and splitting popup functionality into lazy chunks. Given the popup's usage pattern — opens on click, closes when dismissed, lifetime measured in seconds — deferred loading adds complexity without meaningful performance benefit. The popup is already fast; the user sees it before any lazy chunk would finish loading.

### Decision Record

Dynamic `import()` is **not applicable** to the current ModTools architecture. The constraints are browser-imposed for content scripts, and a performance non-issue for background and popup given their usage patterns. This is an intentional architectural decision, not a gap.

If the project ever adopts a build step (webpack, esbuild, Rollup), code splitting becomes trivially available for popup and background without requiring any manifest changes, and would be worth revisiting at that point.

---

## Summary Table

| Rule | Finding | Action |
|---|---|---|
| 85 — Update handling | Banner present and verified; `onUpdateAvailable` not registered (sideloaded, event never fires); auto-reload absent by security design | Proposal: add 30-min auto-reload via existing alarm + `firstSeenAt` guard, gated on `verifyUpdateFlag`. Register `onUpdateAvailable` as a no-op with documentation comment. |
| 86 — Manifest permissions | All 3 permissions and all 3 host entries are justified with code evidence. Zero removals warranted. | No change. |
| 87 — Dynamic import | N/A for content scripts (browser constraint). N/A for background/popup (no performance case). Intentional single-file architecture. | Document decision. No implementation. |
