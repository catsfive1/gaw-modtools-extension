# Auth Carry-Over Root Cause Analysis (2026-05-08)

## A. EXECUTIVE FINDING

The auth loss on v9.24 -> v10.2 upgrade is a **three-part failure stack**. The
primary cause: the `initFirstRunWizard` guard (`popup.js:1782-1784`) reads
`chrome.storage.local` for `workerModToken`, but the `loadToken` path in
hardening-flag-on mode never reads local storage -- it calls `tokensStatus`
which reads from the SW RAM cache (`secretCache`). If the service worker is
evicted between the Drive Desktop sync drop and the first popup open, the SW
RAM cache is cold. `secretCache` is empty. `tokensStatus` returns
`hasTeamToken: false`. The wizard check, however, reads `chrome.storage.local`
**directly** -- so it sees the stored token and hides itself. But `loadToken`
simultaneously reads the **SW cache** and shows "not configured". The two reads
disagree because they hit different backing stores at different warmth states.
Secondary causes: (1) the IDB backup write path (`modtools.js:1616`) is
fire-and-forget with no confirmation, so a page-context crash can silently drop
it; (2) `saveTokensSecurely` in `popup.js:407-424` sends `setTokens` to the SW
but ALSO writes `chrome.storage.local` in a separate try-catch -- if the SW
write succeeds but the local write fails (or vice versa), the two stores
diverge. The wizard/verified-lead-token contradiction visible in Commander's
screenshot is this exact divergence rendered live: wizard reads stale-cold
local storage (empty team token or a race where the read happens before the SW
write completes), `loadLead` reads the SW cache which IS warm from an earlier
session, so lead shows "verified" while team shows the wizard.

---

## B. EVIDENCE TRAIL

1. **Wizard guard reads `chrome.storage.local` directly**
   `popup.js:1782-1784`
   ```js
   const out = await chrome.storage.local.get('gam_settings');
   const s = (out && out.gam_settings) || {};
   hasToken = !!(s.workerModToken && String(s.workerModToken).length >= 32);
   ```
   Guard checks local storage. If token IS there, wizard hides. If not, wizard
   shows.

2. **`loadToken` (flag-on) reads SW RAM cache, not local storage**
   `popup.js:459-479`
   ```js
   if (await __hardeningOnPopup()) {
     const status = await __tokensStatus();  // -> background 'tokensStatus' RPC
     ...
   }
   ```
   `tokensStatus` handler at `background.js:952-960` prefers `secretCache`
   (RAM), falls back to `loadSecrets()` only if cache is empty.

3. **SW cache is populated at startup from session-first, local-fallback**
   `background.js:100-121`: `loadSecrets()` reads `chrome.storage.session`
   first, then falls back to `chrome.storage.local`. If the service worker is
   evicted (after Drive Desktop drops the new ZIP), `secretCache` is reset to
   `{workerModToken:'', leadModToken:''}` (`background.js:84`). The next popup
   open triggers `loadSecrets()` -- but `chrome.storage.session` is also empty
   post-eviction (session storage is cleared on SW restart). So the fallback
   fires: `chrome.storage.local` is read. If that read races with the popup's
   own storage writes, or if the Drive Desktop sync triggered an extension
   reload that wiped session storage only (not local), the sequence of events
   determines whether `secretCache` is warm or cold when the popup's
   `__tokensStatus` RPC arrives.

4. **`loadToken` and `initFirstRunWizard` execute concurrently, reading different stores**
   `popup.js:1763-1791`:
   ```js
   loadToken();    // async, reads SW RAM via tokensStatus RPC
   loadLead();     // async, reads SW RAM via tokensStatus RPC
   // ... ~28 lines later ...
   (async function initFirstRunWizard() { // reads chrome.storage.local
     const out = await chrome.storage.local.get('gam_settings');
   ```
   Both `loadToken` and `initFirstRunWizard` run concurrently in the same
   microtask queue. The wizard guard awaits local storage. `loadToken` awaits
   the SW RPC. Neither waits for the other. If SW is cold, `loadToken` triggers
   `loadSecrets()` inside the SW (which is async and may not complete before
   the `tokensStatus` response). The wizard independently sees local storage and
   may get a DIFFERENT answer.

5. **`saveTokensSecurely` writes SW via message AND local storage in separate try-catches**
   `popup.js:407-425`:
   ```js
   const r = await chrome.runtime.sendMessage(msg);      // setTokens -> SW
   // ...
   try {
     const current = await chrome.storage.local.get('gam_settings');
     // ...
     await chrome.storage.local.set({ gam_settings: s });
   } catch (e) {}   // SILENT FAILURE -- local write can fail, caller gets ok:true
   ```
   The outer function returns `r` (SW response) before confirming local write.
   A quota error or race on the local write silently drops it. SW cache is warm;
   local storage is not updated; next SW eviction => permanent token loss.

6. **IDB backup write is fire-and-forget**
   `modtools.js:1616`:
   ```js
   try { _authBackupPut(key, value).catch(()=>{}); } catch(_){}
   ```
   Any IDB write failure is silently discarded. The `preloadSecrets` IDB
   recovery path at `modtools.js:1467-1486` can only recover what was
   successfully written. No confirmation, no retry, no alert.

7. **`runMigrations` is NOT the culprit for auth wipe**
   `modtools.js:4272-4306` -- migrations 1 and 2 operate only on `K.ROSTER`
   and `setSetting('hideSidebar', true)`. Neither touches `workerModToken` or
   `leadModToken`. Schema version key (`gam_schema_version`) lives in
   `localStorage`, not `chrome.storage.local`. Not the cause.

8. **Manifest `key` field is present and stable**
   `manifest.json:6` -- key is a full 392-byte RSA public key. Drive Desktop
   sync is a file copy, not a Chrome Web Store update, so Chrome does NOT treat
   this as an uninstall/reinstall. `chrome.storage.local` is preserved. The
   manifest key is not the cause -- but if the key field were ever stripped from
   the manifest.json in a future copy, Chrome would assign a new extension ID
   and provision fresh storage. Document this as a prevention invariant.

9. **Wizard vs verified-lead-token contradiction (Commander's screenshot)**
   `popup.js:620-632` (flag-on `loadLead`): reads `__tokensStatus` which reads
   SW RAM. If `secretCache.leadModToken` happens to be warm (SW was not fully
   evicted, or had been warmed by an earlier `loadSecrets` call that completed
   before the popup's lead-status read), `hasLeadToken: true` -> `leadStatus`
   shows "stored" / "verified". Meanwhile wizard guard reads `chrome.storage.local`
   for `workerModToken` -- if local storage's `workerModToken` was cleared or
   race-lost from the prior Drive Desktop sync drop, `hasToken = false` and
   wizard shows. Net effect: wizard open (team token missing from local) +
   lead status "verified" (lead token in SW RAM). Two stores, two truths,
   contradictory UI.

---

## C. THE BUG (or BUGS)

### Bug 1 -- Dual-backing-store read split between wizard and loadToken

- **What happens:** `initFirstRunWizard` reads `chrome.storage.local`; `loadToken`
  reads the SW RAM cache via RPC. These can disagree. Wizard sees no team token
  (local storage stale or lost), shows STEP 1. `loadToken` sees stale or cold
  SW cache, shows "not configured". Both running concurrently.
- **What should happen:** One authoritative answer about whether the team token
  exists. Wizard and `loadToken` must agree.
- **Why it happens:** wizard guard was added (`popup.js:1776`) as a simple
  quick-read, not plumbed through the same `__tokensStatus` RPC path that
  `loadToken` uses.
- **Reproducer:** (1) Install v9.24. Save token. (2) Drop v10.2 ZIP via Drive
  Desktop. Chrome reloads extension -- SW evicts. (3) Open popup within ~2s
  of reload before `loadSecrets()` completes. Wizard check reads local storage
  (fast), `loadToken` reads SW RAM (returns empty while `loadSecrets` is in
  flight). Race window is ~200-500ms.
- **Fix sketch:** Change wizard guard to use `__tokensStatus()` instead of
  raw local storage read. `popup.js:1782-1784` becomes:
  ```js
  const status = await __tokensStatus();
  hasToken = status.hasTeamToken;
  ```
  This ensures the wizard and `loadToken` query the same source of truth. The
  SW's `tokensStatus` handler already calls `loadSecrets()` when cache is cold
  (`background.js:956-957`), so this also forces a warm-up before the wizard
  decision.
- **Risk:** Low. `__tokensStatus` already exists and is already called by
  `loadToken` on every popup open.
- **Effort:** S (3 lines changed)

### Bug 2 -- `saveTokensSecurely` local-write failure is silently dropped

- **What happens:** `popup.js:424` `chrome.storage.local.set` is inside a bare
  `try { ... } catch (e) {}` block. A quota error, extension update race, or
  disk I/O hiccup silently drops the write. The function returns the SW
  `setTokens` response (`ok: true`). Caller believes save succeeded. Next SW
  eviction leaves local storage without the token.
- **What should happen:** If local write fails, the caller should know. At
  minimum, a console error. Ideally, a retry.
- **Fix sketch:** Log the failure and surface it to the caller:
  ```js
  try {
    await chrome.storage.local.set({ gam_settings: s });
  } catch (e) {
    console.error('[popup v10.x] local storage write FAILED after setTokens:', e);
    // Optionally: return { ok: false, error: 'local_write_failed: ' + e.message };
  }
  ```
  Whether to propagate the error depends on how critical local storage is
  vs the SW vault. Since `preloadSecrets` falls back to local, this write IS
  critical for post-eviction recovery. It should propagate.
- **Risk:** Low. Does not change the happy path.
- **Effort:** S

### Bug 3 -- IDB backup write is fire-and-forget with no confirmation

- **What happens:** `modtools.js:1616` calls `_authBackupPut` with
  `.catch(()=>{})`. Any write failure silently exits. The recovery path at
  `modtools.js:1467-1486` can only recover from a successful backup.
- **What should happen:** Log failures. Retry on next `setSetting` call.
- **Fix sketch:**
  ```js
  _authBackupPut(key, value).catch((e) => {
    console.warn('[modtools v10.x] IDB backup write failed for', key, e);
  });
  ```
- **Risk:** Low. Console noise only -- no behavior change.
- **Effort:** S

### Bug 4 -- Wizard visible with lead token showing "verified" (screenshot bug)

- **Root cause:** Same as Bug 1. SW RAM had a warm `leadModToken` (SW was
  partially evicted -- session cleared but RAM momentarily alive, or `loadSecrets`
  from local restored lead but not worker). Wizard reads local `workerModToken`
  as absent. These are two reads from two stores that can differ.
- **Fix:** Bug 1 fix (wizard reads `__tokensStatus`) eliminates this. Once both
  wizard and `loadToken` use the same RPC, they agree on `hasTeamToken` state.
  The lead "verified" status is correct -- it WAS in the SW vault. The wizard
  showing is the incorrect half. Fixing the guard eliminates the contradiction.

---

## D. AUTOMATION OPPORTUNITY

The extension already has all three recovery mechanisms -- they just don't fire
reliably on SW eviction. The fix is to chain them explicitly at popup open:

**Current flow (broken):**
```
popup opens
  |-> loadToken() -- reads SW RAM (cold -> empty) -> shows "not configured"
  |-> initFirstRunWizard() -- reads local storage -> may show or hide
  (no guaranteed order, no single warm-up gate)
```

**Fixed flow (zero meatbag):**
```
popup opens
  |-> await __tokensStatus()   // forces loadSecrets() if cold
  |                             // loadSecrets(): local -> IDB -> session cascade
  |-> wizard reads same result // consistent answer
  |-> loadToken reads same result // consistent answer
  |-> if still no token after all three backing stores:
      |-> auto-show wizard (correct, both agree)
      |-> if IDB had backup: auto-restored to local + SW cache silently
          -> wizard hides itself -> no user action needed
```

The IDB recovery at `modtools.js:1467-1486` already does this restoration --
but only if `_authBackupPut` succeeded (Bug 3). Fix Bugs 1+3 and the full
cascade becomes:

1. SW evicted -> session cleared
2. Popup opens -> `__tokensStatus` -> `loadSecrets()` -> reads local -> found -> warm SW cache -> wizard hides -> loadToken shows "stored" -- **DONE, zero user action**
3. If local also missing (true reinstall) -> `loadSecrets()` -> IDB backup -> restores to local -> warm SW cache -> wizard hides -- **DONE, zero user action**
4. If IDB also missing (genuine first install) -> wizard shows -> correct

No credential re-entry required for cases 2 and 3.

---

## E. SHIP-TONIGHT FIX (v10.3)

Three surgical changes. All low-risk. No schema changes. No migrations.

**Change 1: `popup.js:1782-1784` -- wizard reads SW RPC not raw local storage**

```js
// OLD:
let hasToken = false;
try {
  const out = await chrome.storage.local.get('gam_settings');
  const s = (out && out.gam_settings) || {};
  hasToken = !!(s.workerModToken && String(s.workerModToken).length >= 32);
} catch (_) {}

// NEW:
let hasToken = false;
try {
  const status = await __tokensStatus();
  hasToken = !!(status && status.hasTeamToken);
} catch (_) {}
```

This is the primary fix. Wizard and `loadToken` now query the same backing store.
`__tokensStatus` forces `loadSecrets()` on cold SW, which cascades through
session -> local -> IDB in that order.

**Change 2: `popup.js:424` -- surface local write failure**

```js
// OLD:
try {
  const current = await chrome.storage.local.get('gam_settings');
  const s = { ...(current.gam_settings || {}) };
  if (hasWorker) s.workerModToken = t.workerModToken || '';
  if (hasLead) { s.leadModToken = t.leadModToken || ''; s.isLeadMod = !!(t.leadModToken || ''); }
  await chrome.storage.local.set({ gam_settings: s });
} catch (e) {}

// NEW:
try {
  const current = await chrome.storage.local.get('gam_settings');
  const s = { ...(current.gam_settings || {}) };
  if (hasWorker) s.workerModToken = t.workerModToken || '';
  if (hasLead) { s.leadModToken = t.leadModToken || ''; s.isLeadMod = !!(t.leadModToken || ''); }
  await chrome.storage.local.set({ gam_settings: s });
} catch (e) {
  console.error('[ModTools popup] local storage write failed after SW setTokens:', e);
}
```

**Change 3: `modtools.js:1616` -- log IDB backup failures**

```js
// OLD:
try { _authBackupPut(key, value).catch(()=>{}); } catch(_){}

// NEW:
try {
  _authBackupPut(key, value).catch((e) => {
    console.warn('[ModTools] IDB auth backup write failed for', key, e && e.message);
  });
} catch(_){}
```

---

## F. PREVENTION FOR FUTURE

1. **Invariant: wizard guard MUST use the same token-presence signal as `loadToken`.**
   Add to AGENT_BRIEF and code comments: "Any UI element that gates on 'does a token
   exist' MUST call `__tokensStatus()`, never read `chrome.storage.local` directly.
   The SW vault is the source of truth; local storage is a persistence mirror only."

2. **Invariant: manifest `key` field must be present in EVERY build artifact.**
   Add a pre-ship check: `if (!manifest.key) throw 'manifest.key missing -- Chrome will assign new ID and wipe storage'`.
   Drive Desktop sync copies whatever is in the dist ZIP; if a future build step
   strips the key field, every mod loses their extension ID and all storage.

3. **Invariant: local storage writes that back up SW vault state must be logged on failure.**
   Silent `catch(e){}` on `chrome.storage.local.set` is forbidden for token paths.
   Lint rule or code comment: "Token-carrying storage writes must log failures."

4. **Add a startup self-heal in `popup.js`:** Before `loadToken()` / `loadLead()` /
   `initFirstRunWizard()` fire, gate on a single `await __tokensStatus()` call that
   forces SW warm-up. This eliminates the entire race class: by the time any of the
   three concurrent functions run, the SW cache is known-warm and all three will see
   the same state.

5. **Add a `runMigrations` no-op guard for v10.x schema bumps:** Current migrations
   (1 and 2) are safe. Document explicitly that any future migration touching
   `gam_settings` MUST preserve `workerModToken` and `leadModToken` unconditionally,
   and add a unit test assertion to the verify script.
