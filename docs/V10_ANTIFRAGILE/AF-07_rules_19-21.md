# AF-07 -- Anti-Fragile Suite: Rules 19-21

Executed: 2026-05-09
Suite: GAW ModTools v10.5.1
Files touched: modtools.js, popup.js, popup.html

---

## A. EXECUTIVE SUMMARY

| Rule | Description | Status |
|---|---|---|
| Rule 19 | Automatic data repair on schema corruption | SHIPPED |
| Rule 20 | Token storage encryption (Web Crypto) | DEFERRED -- gap documented |
| Rule 21 | "Repair Data" / "Reset to Defaults" affordance | SHIPPED (both present) |

---

## B. RULE 19 -- Automatic Data Repair on Schema Corruption

### B-1. What Was Added

**File:** modtools.js, at the bottom of `runMigrations()` (line ~4387 post-edit)

`runMigrations()` previously handled additive schema migrations (roster rename, hideSidebar default flip) but had zero awareness of structural corruption -- a `gam_settings` blob where required keys are absent or have the wrong type. After the existing migration logic runs, the new code:

1. Reads `gam_settings` from `chrome.storage.local` (the authoritative store -- not localStorage).
2. Runs `validateSettingsShape(stored)` against `SETTINGS_REQUIRED_SHAPE` (10 required keys: scalar booleans, strings, numbers, and arrays).
3. On clean: silent return.
4. On corruption: logs to console + `_diagLog`, patches the bad keys with `DEFAULT_SETTINGS` values via `chrome.storage.local.set`, then surfaces a snack: `"Settings repaired (N key(s) restored to defaults)"`.

The validator is also exposed as `window.__GAM_validateSettingsShape` for console debugging.

### B-2. Shape Contract

The 10 keys in `SETTINGS_REQUIRED_SHAPE` (modtools.js) are the minimum load-bearing set -- the ones whose absence or wrong type would cause silent runtime failures or UI breakage:

| Key | Expected type | Failure mode if absent/wrong |
|---|---|---|
| `autoRefreshEnabled` | boolean | refresh loop skips or throws |
| `workerModToken` | string | every worker call sends undefined |
| `leadModToken` | string | lead API calls fail silently |
| `isLeadMod` | boolean | lead gate always evaluates wrong |
| `hideSidebar` | boolean | sidebar flickers on every load |
| `tardsThreshold` | number | comparison with undefined, all users flagged |
| `autoDeathRowRules` | array | `.forEach` throws on null |
| `autoTardRules` | array | `.forEach` throws on null |
| `features.platformHardening` | boolean | hardening gate falls through |
| `features.teamBoost` | boolean | v8.0 features silently activate or don't |

These 10 are not exhaustive -- `DEFAULT_SETTINGS` has ~40 keys -- but they are the ones with concrete runtime consequences from type mismatch, identified by tracing call sites.

### B-3. Design Decision: chrome.storage.local, Not localStorage

The corruption check reads from `chrome.storage.local`. Earlier in `runMigrations()` the migrations themselves read/write localStorage via `lsGet`/`lsSet`. The rationale for diverging:

- `gam_settings` is authoritative in `chrome.storage.local`. The localStorage copy (in `lsSet`) is a page-context convenience mirror that is actively scrubbed (`_scrubSecrets`).
- Corruption events are most likely to come from storage-merging bugs, stale blobs from old extension versions, or failed migrations -- all of which happen at the chrome.storage layer.
- Reading from localStorage for a corruption check would miss the actual source of truth and would require a separate page-context path that isn't available during background SW boot.

### B-4. What Triggers runMigrations

`runMigrations()` is called once, synchronously, from `init()` at line 21391 (post-edit: 21451). `init()` fires on every page load. The corruption check therefore runs on every GAW page load, after `preloadSecrets()` and `hydrateFromChromeStorage()` have completed. The `chrome.storage.local.get` inside the corruption check is async/callback -- it does not block `init()`.

---

## C. RULE 20 -- Token Storage Encryption (Web Crypto)

### C-1. Current State: Regex Enforcement Is the Gate

`workerModToken` and `leadModToken` are stored plaintext in `chrome.storage.local`. This is not equivalent to encrypted storage. The current enforcement layer is shape validation at write time:

- **popup.js line 895:** `malformed token (expected 32-256 chars alphanumeric + _-)`
- **popup.js line 2541:** `!/^[A-Za-z0-9_-]{32,256}$/.test(input)` rejects malformed pastes before saving.
- **modtools.js line 19466:** `st.workerModToken.length > 8` -- existence check before hydrating cache.
- **modtools.js line 21247:** `String(tok).length < 32` -- minimum length check before `/mod/whoami` probe.

These checks prevent garbage from entering storage and catch invite codes masquerading as tokens (the 401 rollback path in popup.js line 909-919). They are **not encryption**. They gate input shape; they do not protect data at rest.

### C-2. Why Web Crypto Is Not Shipped Tonight

Web Crypto (`crypto.subtle`) symmetric encryption (AES-GCM) requires:

1. A wrapping key. In a Chrome extension, the only durable key storage is `chrome.storage.local` itself or a user-supplied passphrase. Storing the wrapping key in the same storage as the ciphertext is security theater. A passphrase-derived key (PBKDF2) introduces a user-visible prompt on every extension initialization -- high friction for a mod team that already has a token onboarding modal.
2. Migration path for existing installs. All ~N existing mods have plaintext tokens. The migration must decrypt-on-read and encrypt-on-write atomically, with a rollback if the chrome.storage write fails mid-flight.
3. Background SW key lifetime. Service workers are unloaded between events. The symmetric key must be re-derived or cached in `chrome.storage.session` (which is cleared on browser restart). The session key approach means tokens survive restarts only if the user unlocks the key on first use -- same UX friction as above.

**The right architecture for a future ship:**

- Derive a per-installation AES-GCM key from a browser fingerprint + extension ID (non-secret, but installation-unique). Store the key in `chrome.storage.session` with a fallback re-derive on session start.
- On the first install of the encrypted version, encrypt the existing plaintext tokens and write back ciphertext + IV.
- `getModToken()` / `getLeadToken()` become async, returning the decrypted value from the session key.
- All callers of `getModToken()` (currently ~12 call sites) must be awaited. This is the largest diff cost.

**Gap flagged.** The regex enforcement remains the gate. This document is the paper trail for the future Web Crypto ship.

---

## D. RULE 21 -- User-Visible Repair / Reset Affordance

### D-1. Audit Finding: maintReset Already Exists

Before this pass, the popup's Maintenance card (System diagnostics advanced section) already had:

- `maintSchema` -- schema version check and additive migration (schema v3 popup-side).
- `maintReset` -- DESTRUCTIVE triple-confirm wipe of all feature flags (tokens + UX prefs preserved).

Both are correctly wired via `__maintWire`. Both have status divs. `maintReset` requires the user to type `RESET` as the third confirmation, so destructive intent is unambiguous.

**Gap:** No non-destructive "check and fix what's broken" path existed. `maintSchemaCheck` (popup-side) is additive migration, not shape validation. `maintReset` is a sledgehammer. Neither surfaces what was wrong or what was changed -- only that a version migration ran or that everything was nuked.

### D-2. What Was Added: maintRepair

**File:** popup.html -- new `maintRepair` button inside the `pop-maint-advanced` details block, positioned between `maintModmailBackfill` and `maintReset`.

**File:** popup.js -- `maintRepairSettings()` async function + `__validateSettingsShape()` helper + `REPAIR_REQUIRED_SHAPE` + `REPAIR_DEFAULT_VALUES` constants. Wired at `__maintWire('maintRepair', maintRepairSettings, 'repairing...')`.

**Behavior:**

1. Reads `gam_settings` from `chrome.storage.local`.
2. Runs `__validateSettingsShape()` against the 10-key shape contract (same set as Rule 19, mirrored in popup.js constants -- popup context cannot read modtools.js scope).
3. On clean: shows `"No corruption found"` (green).
4. On corruption: patches broken keys with safe defaults, writes back, shows `"Repaired N key(s): [list]"` (green). Logs to `gam_diag_log` via `__maintLog`.
5. On error: shows error message (red).

**Tokens are never touched.** The only keys in `REPAIR_DEFAULT_VALUES` that could touch tokens are `workerModToken: ''` and `leadModToken: ''` -- but those are only patched if the stored value is not a string at all (i.e., the key is present but typed wrong, e.g., `workerModToken: null`). An empty string token already in storage (`''`) passes the `typeof === 'string'` check and is left alone.

### D-3. Position in the UI

The full Maintenance button order in the advanced accordion is now:

1. `maintStorage` -- Storage health probe
2. `maintSelectorDrift` -- Selector drift report
3. `maintDiag` -- Diag log status + purge
4. `maintSchema` -- Schema migration check
5. `maintModmailBackfill` -- Backfill modmail history
6. `maintRepair` -- **Repair settings** (new, AF-07)
7. `maintReset` -- Reset settings to defaults (destructive)

The ordering places the non-destructive repair before the destructive reset, so mods try the lighter tool first.

---

## E. DUPLICATE VALIDATOR SCOPE NOTE

`validateSettingsShape` exists in two places:

| Location | Scope | Used by |
|---|---|---|
| modtools.js `validateSettingsShape` | Page content-script IIFE | `runMigrations()` auto-repair on page load |
| popup.js `__validateSettingsShape` | Popup context | `maintRepairSettings()` button handler |

They share the same 10-key contract but cannot share code because the popup and content-script run in separate JS contexts with no shared module system. The constants are kept identical by copy. If the shape contract expands, both files must be updated. This is noted as a maintenance concern -- acceptable given the absence of a build system for this extension.

---

## F. ACCEPTANCE CRITERIA

- [x] `runMigrations()` in modtools.js calls `validateSettingsShape` after migrations complete.
- [x] Corruption triggers a `chrome.storage.local.set` patch + `snack()` with `"Settings repaired"` text.
- [x] `maintRepair` button is present in popup.html inside the advanced details block.
- [x] `maintRepairSettings()` is wired via `__maintWire` in popup.js.
- [x] `maintRepairSettings()` patches only missing/mistyped keys; token values are preserved unless they are the wrong JS type entirely.
- [x] `maintReset` remains intact and untouched.
- [x] Web Crypto gap is documented with specific architecture notes for the future ship.
- [x] No existing call sites changed. No imports added. No build step required.
