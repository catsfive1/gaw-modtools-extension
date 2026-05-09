# AF-06 — Anti-Fragile Rules 16-18: Storage SSOT, Schema Migration, Quota Safety
**Audit date:** 2026-05-09  
**Files inspected:** `modtools.js`, `popup.js`, `background.js` (dist)  
**Status:** FINDINGS + PRESCRIPTIONS

---

## Rule 16 — `chrome.storage.local` is the SSOT for all persistent data

### Violations found

**Category A: Legitimately annotated exemptions (ALLOW_LOCALSTORAGE_REVIEW)**

The following localStorage uses carry an inline `// ALLOW_LOCALSTORAGE_REVIEW` comment and are architecturally justified:

| Location | Key | Reason |
|---|---|---|
| `modtools.js:1867` | `CachedStore` backing store | Cross-document read; chrome.storage not available in page context |
| `modtools.js:1896` | Same | Same |
| `modtools.js:2189` | `safeGet` fallback | jsdom/test path; chrome.storage unavailable |
| `modtools.js:2204,2236` | `PAGE_SAFE_KEYS` mirror | Non-sensitive, page-local by design |
| `modtools.js:2664,2672` | `gam_telemetry_buffer` | Page-local ring buffer, Amendment A.2 |
| `modtools.js:1845` | `gam_settings` flag peek | Cross-document by design |
| `modtools.js:2598,3670` | Same flag peek pattern | Same |

These are **not violations** — they are intentional page-domain mirrors for keys that cannot cross the extension/page boundary. No action needed.

**Category B: Genuine SSOT violations requiring migration**

| File | Line | Key | Problem |
|---|---|---|---|
| `popup.js` | 2652 | `gam_popup_active_tab` | Persistent UI state (last-active tab) written to `localStorage` in the popup context. The popup runs in the extension context — `chrome.storage.local` is fully available here. This is a hard SSOT violation. |
| `popup.js` | 2686 | `gam_popup_active_tab` | Same key, read path. |
| `modtools.js` | 967 | `gam_schema_version` (K_SCHEMA) | Schema version read from `localStorage` inside `runMigrations`. Should be read from `chrome.storage.local` so the SW and popup see the same schema state. |
| `modtools.js` | 4279, 4310 | `gam_schema_version` | Write path of same key — localStorage. |
| `modtools.js` | 1731, 1737 | `gam_fallback_mode` | Fallback mode flag written/read from localStorage. This is a content-script context so `chrome.storage.local` access goes through the extension's message channel, but the existing `safeGet`/`safeSet` helpers already bridge this. The raw `localStorage` reads at 1731/1737 bypass that bridge. |
| `modtools.js` | 21148, 21155 | `_todayKey` (date-stamp) | Session gate for easter-egg counter. Acceptable as truly ephemeral, but `sessionStorage` would be more semantically correct than `localStorage` here. Low priority. |
| `modtools.js` | 21181, 21184, 21186 | `gam_mod_log`, `gam_ee_cent` | `gam_mod_log` is a primary store key defined in K. Reading/writing it directly from `localStorage` inside the EE handler bypasses `chrome.storage.local` entirely. **SSOT violation.** |
| `modtools.js` | 21485 | `gam_fallback_mode` | Emergency fallback path sets localStorage directly. Should mirror to `chrome.storage.local` via `safeSet`. |
| `modtools.js` | 9579 | `K.LOG` (`gam_mod_log`) | `localStorage.removeItem(K.LOG)` — direct removal of a primary key from localStorage. Should call `safeRemove` or send a `clearLocalStorage` message. |

**IndexedDB note:** `modtools.js:10891` references IndexedDB (`gam_inbox_intel`) in a comment block describing the inbox-intel store architecture. Lines 1420-1443 handle a one-time legacy IDB purge gated by `sessionStorage.getItem('gam_legacy_idb_purged')`. The `sessionStorage` use here is intentional (run-once session guard, not persistence) and the IDB purge itself is the correct migration path. **Not a violation.**

### Prescriptions (Rule 16)

1. **`gam_popup_active_tab` (popup.js:2652/2686):** Replace `localStorage.setItem/getItem` with `chrome.storage.local.set/get`. Wrap in try/catch (Rule 18). No architectural blocker — popup already has full storage access.

2. **`gam_schema_version` in `runMigrations` (modtools.js:4277-4310):** Migration reads/writes schema version from localStorage in the content-script context. The content-script cannot do a synchronous `chrome.storage.local.get`, so `runMigrations` must be made async and the version check must await `safeGet(K_SCHEMA, 0)` (which routes through the extension message channel). See Rule 17 for the broader migration path fix.

3. **`gam_fallback_mode` raw reads (modtools.js:1731/1737/21485):** Replace with `safeGet`/`safeSet` calls. These helpers already exist and route correctly.

4. **EE handler `gam_mod_log`/`gam_ee_cent` (modtools.js:21181-21186):** Replace direct `localStorage.getItem/setItem` with `safeGet`/`safeSet`. `gam_mod_log` is a defined K-key and must not be accessed raw.

5. **`localStorage.removeItem(K.LOG)` (modtools.js:9579):** Replace with `safeRemove(K.LOG)` or a `clearLocalStorage` message if in content-script context.

---

## Rule 17 — Always version your storage schema and migrate on extension update

### Current migration topology

**`runMigrations()` in modtools.js (line 4277):**
- Reads `K_SCHEMA` from `localStorage` (violation — see Rule 16).
- Runs migrations 1 (roster status rename) and 2 (hideSidebar default).
- Called from `init()` at line 21391, which is the content-script boot path.
- **NOT called from `chrome.runtime.onInstalled`** (background.js:137).
- **NOT called in SW boot** (`onStartup`, background.js:159).

**`maintSchemaCheck()` in popup.js (line 4012):**
- Reads `gam_settings.gam_settings_schema_version` (a separate schema key embedded inside `gam_settings`).
- This is a **different, parallel versioning system** covering settings-level migrations (feature flag defaults). Currently at version 3.
- Called from the maintenance panel — **manually triggered**, not on init.
- `maintSchemaCheck` is NOT called automatically on popup open.

**`loadSecrets()` in background.js (line 155):**
- Called on `onInstalled` and `onStartup`.
- Does NOT invoke `runMigrations`.

### Gaps identified

| Gap | Severity | Detail |
|---|---|---|
| `runMigrations` not called on `onInstalled` | HIGH | On extension update, the content script may not execute before the user visits a tab. Migrations are delayed until next page load. Roster status rename and hideSidebar default may be missed for users who don't visit a GAW tab soon after update. |
| `runMigrations` not called on SW boot | MEDIUM | If the SW wakes due to an alarm or message before any content script runs, migration state is unread. |
| `runMigrations` reads schema version from `localStorage` | HIGH | localStorage is page-domain; each GAW tab has its own localStorage. Schema version could differ across tabs. The canonical version must live in `chrome.storage.local`. |
| `maintSchemaCheck` not auto-run on popup open | LOW | Settings-schema migrations only fire when the mod manually visits the maintenance panel. A mod who never opens that tab never migrates to v3 defaults. |
| Two separate schema versioning systems | MEDIUM | `gam_schema_version` (content-script, localStorage) and `gam_settings_schema_version` (popup, inside `gam_settings`) are not unified. Audit trail split across two subsystems increases confusion. |

### Prescriptions (Rule 17)

1. **Move `runMigrations` to be called from `onInstalled` in background.js.** Since `runMigrations` currently runs in the content-script context and reads localStorage, it must first be refactored to use `chrome.storage.local` (see Rule 16 prescription #2), then invoked from the background's `onInstalled` handler after `loadSecrets()`. This ensures migrations run exactly once per update regardless of tab visits.

2. **Call `runMigrations` (or a background-safe equivalent) in `onStartup`.** Guard with a version check to avoid re-running completed migrations on every SW wake.

3. **Migrate `K_SCHEMA` key to `chrome.storage.local`.** On first run after this change, the migration bootstrap should read `localStorage` as a fallback, promote the value to `chrome.storage.local`, then delete the localStorage copy.

4. **Auto-call `maintSchemaCheck` on popup init path.** Add a non-blocking call (no await, fire-and-forget with a `.catch`) at the bottom of the popup's `DOMContentLoaded` handler so settings-schema migrations apply silently on popup open.

5. **Long-term: unify the two schema version keys.** Consolidate `gam_schema_version` and `gam_settings_schema_version` into a single `chrome.storage.local` key (`gam_schema_version`) with a migration registry that covers both content-script and settings-level migrations.

---

## Rule 18 — try/catch + quota checks around every storage call

### try/catch coverage assessment

**background.js:** All `chrome.storage.local` calls are inside `async` functions with outer `try/catch`. The `_autoStorageProbe()`, `_autoTokenProbe()`, `_autoDiagStatus()` helpers each have a top-level try/catch returning `{ ok: false, error }` on failure. **Coverage: PASS.**

**popup.js:** The majority of calls are inside `async` functions with outer try/catch blocks (e.g. `loadStats`, `maintStorageProbe`, `maintStorageTrim`). Unwrapped calls exist:

| Line | Call | Issue |
|---|---|---|
| 57 | `chrome.storage.local.set(...)` | `.catch(function(){})` — swallows error silently, no log. Acceptable for non-critical card-state persistence but should at minimum `console.warn`. |
| 73, 112 | Same pattern | Same. |
| 190 | `chrome.storage.local.get(...)` wrapped in `new Promise` + try/catch | OK. |
| 267 | `chrome.storage.local.set(...)` inside `try { ... } catch (_) {}` | Silently swallowed. |

**modtools.js:** Content-script storage calls that go through `safeGet`/`safeSet` are wrapped. Raw `localStorage` calls all have `try/catch`. The `chrome.storage.local` calls at lines 16621/16631 (tard-accordion bulk-add handler) use the callback form without any error handler on the `.set` callback — if storage fails, the UI updates (button disabled, rows grayed) but the write is silently lost. **Minor violation.**

### Quota probe assessment

**popup.js `maintStorageProbe()` (line 3772):**
- Calls `chrome.storage.local.getBytesInUse(null, ...)` — correct.
- Computes `pct = total / MAINT_QUOTA_BYTES * 100` and surfaces it in the maintenance panel.
- Shows `warn` status at >80% but does NOT auto-trigger purge.
- `maintStorageTrim()` evicts oldest 50% of intel cache (`K.INTEL`) and caps `gam_diag_log` at 500 entries on manual trigger. **Does not purge `gam_diag_log` on quota error.**

**background.js `_autoStorageProbe()` (line 491):**
- Runs on the `MAINT_QUOTA_ALARM` cadence (background, autonomous).
- Returns `{ ok, total_bytes, pct, top_keys }` — correct.
- Does NOT trigger any purge on high pct. The result is written to `MAINT_LAST_REPORT_KEY` for the popup to surface, but no automatic remediation fires.

**QUOTA_BYTES_EXCEEDED error handling:** Zero instances of `QUOTA_BYTES_EXCEEDED` or `QuotaExceededError` error-string matching anywhere in the codebase. If `chrome.storage.local.set` fails with a quota error, it is caught by the outer try/catch and logged as a generic error string — the specific quota condition is never identified, and no targeted purge is triggered.

### Prescriptions (Rule 18)

1. **Add `QUOTA_BYTES_EXCEEDED` detection to all `chrome.storage.local.set` callers.** The pattern:
   ```js
   try {
     await chrome.storage.local.set({ [key]: value });
   } catch (e) {
     if (e && e.message && e.message.includes('QUOTA_BYTES_EXCEEDED')) {
       await _purgeOldestDiagLog50Pct();
       await chrome.storage.local.set({ [key]: value }); // retry once
     } else { throw e; }
   }
   ```
   Implement `_purgeOldestDiagLog50Pct()` as a shared helper in both `background.js` and `popup.js` that reads `gam_diag_log`, drops the oldest 50%, and writes back.

2. **Auto-purge in `_autoStorageProbe` when pct > 90.** The background probe already has the pct value — add:
   ```js
   if (pct > 90) { await _purgeOldestDiagLog50Pct(); }
   ```
   This converts the probe from a passive reporter to an active remediation agent.

3. **Surface quota % in the popup storage probe status line.** Currently shown as `x.x% of 5MB`. Add a color-coded threshold: green < 60%, yellow 60-80%, red > 80%. Already partially implemented (`pct > 80 ? 'warn' : 'ok'`) — just needs the 60% amber tier added.

4. **Fix silent `.catch(function(){})` swallows in popup.js (lines 57, 73, 112, 267).** Change to `.catch(function(e){ console.warn('[Popup] storage.set failed:', e); })`. These are non-critical writes (card open state, store timestamp) but silent failure makes debugging impossible.

5. **Fix tard-accordion `.set` callback (modtools.js:16631).** The callback form `chrome.storage.local.set({ gam_settings: settings }, function() { ... })` has no error path. Add `if (chrome.runtime.lastError) { console.warn('[modtools] tard-accordion set failed:', chrome.runtime.lastError.message); return; }` at the top of the callback.

---

## Summary table

| Rule | Finding | Severity | Action |
|---|---|---|---|
| 16 | `gam_popup_active_tab` in `popup.js` localStorage | HIGH | Migrate to `chrome.storage.local` |
| 16 | `gam_schema_version` read/write via localStorage in `runMigrations` | HIGH | Migrate to `chrome.storage.local`; make `runMigrations` async |
| 16 | `gam_fallback_mode` raw localStorage bypasses `safeGet`/`safeSet` | MEDIUM | Use existing helpers |
| 16 | EE handler reads `gam_mod_log` from localStorage directly | MEDIUM | Use `safeGet`/`safeSet` |
| 16 | `localStorage.removeItem(K.LOG)` at line 9579 | MEDIUM | Use `safeRemove` |
| 17 | `runMigrations` not called on `onInstalled` or `onStartup` | HIGH | Add to background.js handlers |
| 17 | Two separate schema version systems | MEDIUM | Unify under `chrome.storage.local` |
| 17 | `maintSchemaCheck` only manual | LOW | Auto-call on popup open |
| 18 | No `QUOTA_BYTES_EXCEEDED` detection anywhere | HIGH | Add detection + auto-purge of `gam_diag_log` oldest 50% |
| 18 | `_autoStorageProbe` passive-only at high pct | MEDIUM | Add auto-purge at pct > 90 |
| 18 | Silent `.catch(function(){})` in popup.js (4 sites) | LOW | Add `console.warn` |
| 18 | Tard-accordion `.set` callback has no error path | LOW | Add `chrome.runtime.lastError` check |

**Compliant / no action needed:** All `chrome.storage.local` calls in `background.js`; all `ALLOW_LOCALSTORAGE_REVIEW`-annotated localStorage uses in `modtools.js`; legacy IDB purge with `sessionStorage` session guard.
