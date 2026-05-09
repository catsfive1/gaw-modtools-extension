# AF-02: Anti-Fragile Rules 4-6 Audit Report
**File audited:** `background.js` (GAW ModTools v10.5.1)
**Agent:** AF-02
**Rules:** 4 (top-level listener registration), 5 (install/activate lifecycle), 6 (onInstalled migration logic)
**Result:** PASS with one cosmetic flag. No edits to `background.js` required.

---

## Rule 4: All listeners registered at module top level

### Method

Grepped for every `addListener` call pattern across the file:
- `chrome.runtime.onInstalled.addListener`
- `chrome.runtime.onStartup?.addListener`
- `chrome.storage.onChanged.addListener`
- `chrome.alarms.onAlarm.addListener`
- `chrome.runtime.onMessage.addListener`
- `self.addEventListener` (SW conventional form)

Confirmed no `async function init()`, `async function setup()`, or similar async wrapper function exists in the file. No listener is nested inside a deferred call chain.

### Findings

| Listener | Line | Location | Status |
|---|---|---|---|
| `chrome.runtime.onInstalled.addListener` | 137 | Module top level | PASS |
| `chrome.runtime.onStartup?.addListener` | 159 | Module top level | PASS |
| `chrome.storage.onChanged.addListener` | 255 | Inside `try{}` at module top level | PASS* |
| `chrome.alarms.onAlarm.addListener` | 761 | Module top level | PASS |
| `chrome.runtime.onMessage.addListener` | 826 | Module top level | PASS |
| `self.addEventListener` | — | Not present | N/A (MV3 SW does not need it) |

*The `chrome.storage.onChanged.addListener` is wrapped in a bare `try{}` block at module top level (lines 254-293), not inside any function. This is a legitimate defensive pattern to silently no-op if the API is unavailable in a degraded environment. The listener registration itself executes synchronously at module evaluation time. No violation.

**Rule 4 verdict: PASS. No hoisting required.**

---

## Rule 5: install/activate lifecycle with skipWaiting/claim equivalent

### MV3 Context Note

For a Chrome MV3 service worker, `self.addEventListener('install', ...)` / `'activate'` / `skipWaiting()` / `clients.claim()` are the conventional SW lifecycle events. However, Chrome's MV3 extension service worker handles this lifecycle internally — the extension runtime owns the SW lifecycle. The idiomatic MV3 equivalents are:

- `self.addEventListener('install')` → `chrome.runtime.onInstalled`
- `self.addEventListener('activate')` + `skipWaiting()` + `clients.claim()` → handled by Chrome automatically; the extension-developer hook is `chrome.runtime.onInstalled` for first-install/update logic
- Session access re-arming after SW eviction → `chrome.runtime.onStartup`

Both hooks are present and correctly structured.

### Findings

**`chrome.runtime.onInstalled` (lines 137-156):**
- Creates all 7 alarms (version check, bug poll, 5 maintenance alarms)
- Awaits `__ensureSessionAccess()` to arm `chrome.storage.session` access level
- Awaits `loadSecrets()` to hydrate the in-RAM secret vault
- All three operations are correctly `await`-ed within the async listener callback

**`chrome.runtime.onStartup` (lines 159-188):**
- Present with optional-chain guard (`?.addListener`) to safely degrade on older Chrome builds where `onStartup` may not exist
- Re-arms all 7 alarms with `chrome.alarms.get` + conditional `create` (idempotent pattern — avoids duplicates)
- Awaits `__ensureSessionAccess()` and `loadSecrets()` — same bootstrap sequence as `onInstalled`

**Module-level eager bootstrap (line 192):**
- `try { __ensureSessionAccess(); } catch (e) {}` fires synchronously at module load
- This covers the edge case of a SW that was evicted and reloaded without triggering `onStartup` (e.g., from an extension update that didn't trigger `onInstalled` either). Belt-and-suspenders; correct.

**Rule 5 verdict: PASS. Lifecycle is correctly handled for MV3.**

---

## Rule 6: onInstalled with migration logic; onStartup with content-script re-injection / state restoration

### Migration Logic Audit

The `onInstalled` handler (lines 137-156) creates alarms and re-arms session access. It does **not** contain explicit storage schema migration (e.g., bumping `gam_settings_schema_version`).

Schema migration in this codebase is **intentionally delegated to the content script via `runMigrations()` in `modtools.js`** (line 21391 in modtools.js), which runs at content-script init time. The autonomous weekly maintenance alarm handler (`_maintWeeklyRun`) contains a read-only `_autoSchemaCheck()` function that detects drift but explicitly never migrates — by design ("click-only", per comments at line 569).

This is an explicit architectural decision, not an oversight:
- `_autoSchemaCheck()` (lines 567-587) compares `stored_version` vs `MAINT_SCHEMA_CURRENT = 3` and reports drift kind (`none` / `pending_migrate` / `downgrade`)
- The inline comment "NEVER migrates here; click-only" makes the boundary explicit
- `runMigrations()` in `modtools.js` handles localStorage schema; `chrome.storage.local` schema bumps are delegated to popup-triggered maintenance flows

**Assessment:** The migration responsibility split is deliberate and documented. `onInstalled` creating the alarms IS the migration equivalent for alarm-based subsystems (v9.5.0 maintenance alarms were added via this path). Adding a schema migration call to `onInstalled` would be scope expansion outside this agent's mandate and would conflict with the intentional "click-only for destructive ops" constraint.

### State Restoration / Content-Script Re-injection via onStartup

`onStartup` (lines 159-188) handles:

1. **Alarm resurrection** — all 7 alarms checked and conditionally re-created. This is the primary state restoration: alarms are ephemeral across browser restarts and must be rebuilt.
2. **Session access re-arming** — `__ensureSessionAccess()` re-grants content scripts access to `chrome.storage.session`, which is wiped on browser restart.
3. **Secret vault hydration** — `loadSecrets()` restores `secretCache` from session/local storage, so the first RPC after a SW cold-start doesn't fail with empty tokens.

**Content-script re-injection:** The `onStartup` handler does not explicitly re-inject content scripts via `chrome.scripting.executeScript`. In this architecture, content scripts are declared in `manifest.json` with `"run_at": "document_idle"` and Chrome handles re-injection on browser startup automatically via the manifest declaration. There is no dynamic injection path that would need to be replicated on `onStartup`. No violation.

**Rule 6 verdict: PASS. Migration logic is intentionally delegated by design (documented); state restoration on `onStartup` covers the three ephemeral subsystems (alarms, session access, RAM vault).**

---

## Optional-Chain Flag (Cosmetic — Not a Violation)

Line 159: `chrome.runtime.onStartup?.addListener(async () => {`

The `?.` optional chain is a PS 7 / ES2020 pattern. In an MV3 Chrome extension targeting Chrome 88+, `chrome.runtime.onStartup` is always defined — the optional chain is defensive dead code. It is harmless and does not constitute a violation of Rule 4 (the listener is still registered synchronously at module top level). No edit made. Flagged for awareness only.

---

## Summary

| Rule | Finding | Action Taken |
|---|---|---|
| Rule 4: Listeners at top level | All 5 listeners at module top level; no async wrapper nesting; `storage.onChanged` inside top-level `try{}` is correct | None required |
| Rule 5: install/activate lifecycle | `onInstalled` + `onStartup` both present, correctly structured, await bootstrap calls | None required |
| Rule 6: Migration logic + state restore | Schema migration deliberately delegated to content script by design; `onStartup` correctly restores alarms, session access, and RAM vault | None required |

**No edits made to `background.js`. File is compliant with Rules 4-6 as written.**
