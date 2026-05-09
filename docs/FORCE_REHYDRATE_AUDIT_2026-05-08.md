# Force Re-Hydrate Audit (2026-05-08)

---

## A. WHAT IT ACTUALLY DOES

There are **three surfaces** — all resolve to the same two function calls.

### Surface 1 — Diagnostics panel button (`#rehydrateBtn`)
**popup.html:115** declares the button.  
**popup.js:213–235** is the click handler:

1. `chrome.tabs.query({ url: GAW_TAB_PATTERNS, active: true, currentWindow: true })` — finds the frontmost GAW tab.  
2. If none found → shows error "no active GAW tab", returns.  
3. `chrome.tabs.sendMessage(tabs[0].id, { type: 'forceRehydrate' })` — RPC to the content script.  
4. Content script `onMessage` handler (**modtools.js:1236**) receives `forceRehydrate`, calls `_rehydrateImpl()`.  
5. `_rehydrateImpl` (**modtools.js:1544**) does exactly two things:
   - `await preloadSecrets()` — reads `gam_settings` from `chrome.storage.local` into `_secretsCache` in-memory object.
   - `await syncSecretsToBackgroundVault()` — sends `{ type:'setTokens', workerModToken, leadModToken }` to `background.js`.
6. `background.js` `setTokens` handler (**background.js:858**) validates token shape, writes to `secretCache` (RAM), then writes to `chrome.storage.session`.
7. Returns `{ ok:true, hasTeamToken, teamLen, hasLeadToken, leadLen }` — popup shows `OK: team=yes(48), lead=no`.

**What it does NOT do:** touch the worker, D1, KV, or any remote endpoint. Pure local storage → RAM sync.

### Surface 2 — Auth-fail banner button (`#gam-auth-fail-banner`)
**modtools.js:19844** — button labeled "Force re-hydrate" inside the red banner shown when `__validateModAuth()` fails at init.

Click handler (**modtools.js:19846–19866**):
1. Calls `preloadSecrets()` directly (no tab message round-trip; this IS the content script).  
2. Calls `syncSecretsToBackgroundVault()` directly.  
3. Calls `__validateModAuth()` — which hits `/mod/whoami` on the worker.  
4. If ok: `location.reload()`. If still failed: shows the failure reason.

**This version is better.** It re-validates after the sync and auto-reloads on success.

### Surface 3 — Maintenance "Full health report" (`maintForceRehydrate`)
**popup.js:3236–3261** — same logic as Surface 1 (tab query → `forceRehydrate` message → same two calls). Called automatically by the Full health report routine (**popup.js:3504**). Also wired to `#maintRehydrateAlias` element (**popup.js:3828**) — but **that element does not exist in popup.html**. Dead wire.

---

## B. WHEN IT'S USEFUL (the rare edge cases)

The function is only useful when both of these are true simultaneously:

1. **The SW vault is stale** — `secretCache` in `background.js` RAM has an empty or old token.
2. **`chrome.storage.local` has the correct token** — i.e., a token is present in storage but hasn't reached the SW vault yet.

Concrete reproducers:
- **Service-worker eviction then wake**: Chrome evicts the SW after ~30s of inactivity. On the next request the SW calls `loadSecrets()` which reads from `chrome.storage.session` first, then `chrome.storage.local`. Since **v9.2.2** (`background.js:194`) the SW also has a `chrome.storage.onChanged` listener that auto-mirrors any storage write into `secretCache`. These two mechanisms close the desync gap without any user action.
- **Token rotation via recovery script writing directly to `chrome.storage.local`**: The `chrome.storage.onChanged` listener in **both** `background.js` (v9.2.2) and `modtools.js` (v9.2.1, **modtools.js:1380**) will pick up the change and auto-update both caches within milliseconds. Manual re-hydrate is not needed.
- **Extension reload while GAW tab stays open**: The content script reinitializes, calls `preloadSecrets()` + `syncSecretsToBackgroundVault()` at the bottom of `init()` (**modtools.js:19922–19923**). Already automated.
- **popup.js token save**: When the user saves a new token in the popup it writes to `chrome.storage.local`, which fires `onChanged` in background.js and modtools.js. Already automated.

**Remaining gap where the button still helps:** A very specific race: SW eviction between the `onChanged` fire and the SW waking to process it, in a Chrome build where session storage was also lost. Estimated frequency: near-zero in practice, never reproducible on demand.

---

## C. WHY COMMANDER NEVER SEES IT WORK

Three compounding reasons:

1. **The auto-sync already ran.** Since v9.2.1/v9.2.2, both the content script (`_installStorageTokenSync`, **modtools.js:1380**) and the SW (`chrome.storage.onChanged` listener, **background.js:254**) auto-mirror any storage change into the in-memory caches. By the time Commander opens the popup and clicks the button, the sync has already happened. The button does a no-op second write of the same values.

2. **No visible before/after delta.** The success output `team=yes(48), lead=no` is reported in `#rehydrateStatus` below the button. It shows the same state whether or not anything changed. There is no diff, no "was stale, now synced" signal, no before-value. Commander sees a string that looks the same every time.

3. **The button requires a frontmost GAW tab.** If Commander opens the popup from any non-GAW context (new tab page, settings page, etc.) it errors with "no active GAW tab." This is the most common case when someone reaches for diagnostics — they're often not actively on GAW.

---

## D. RECOMMENDATION

**OPTION A — REMOVE the button. Automate the function.**

Conviction: the button's failure mode is not "the logic is wrong" — the logic is correct. The failure mode is "the button exists at all." The auto-sync infrastructure (v9.2.1/v9.2.2) already makes every scenario this button was designed for self-healing. The button is a diagnostic artifact from before those listeners existed that was never retired. Remove it from the Diagnostics section. The logic itself can stay as the implementation of the auth-fail banner (Surface 2), which is the only context where it's triggered at the right time.

### Option A — REMOVE the button, automate the function

**Auto-trigger already exists — no new code needed.** The `chrome.storage.onChanged` listeners in `modtools.js:1380` and `background.js:254` already do the sync automatically. The auth-fail banner's "Force re-hydrate" button (Surface 2) handles the one case where manual trigger is genuinely justified (user sees auth failed, clicks, banner validates and auto-reloads).

**Removed UI surfaces:**
- `popup.html:115–118` — `#rehydrateBtn` button element
- `popup.html:120` — `#rehydrateStatus` div
- `popup.html:103` — `Diagnostics` section label (now empty; `debugBtn` and `dashBtn` move to Tools or collapse)
- `popup.js:208–235` — the `__rehydrateBtn` click handler block
- `popup.js:3234–3261` — `maintForceRehydrate()` function (if Full health report also drops it from its routine at popup.js:3504)
- `popup.js:3828` — `__maintWire('maintRehydrateAlias', ...)` (already dead — no element)

**Patch sketch:**

```diff
// popup.html:103-120 — DELETE:
-  <div class="pop-section-label">Diagnostics</div>
-  <div class="pop-tools">
-    <button id="debugBtn" class="pop-btn pop-btn-ghost">&#x1F9EA; Debug snapshot</button>
-    <button id="dashBtn" class="pop-btn pop-btn-ghost">&#x1F4CA; Dashboard</button>
-    <button id="rehydrateBtn" class="pop-btn pop-btn-ghost" ...>&#x21BB; Force re-hydrate</button>
-  </div>
-  <div id="rehydrateStatus" class="pop-token-status"></div>

// ADD debugBtn + dashBtn under existing Tools section instead (no behavior change)
+  <button id="debugBtn" class="pop-btn pop-btn-ghost">&#x1F9EA; Debug snapshot</button>
+  <button id="dashBtn" class="pop-btn pop-btn-ghost">&#x1F4CA; Dashboard</button>

// popup.js:208-235 — DELETE the entire __rehydrateBtn handler block.

// popup.js:3504 — REMOVE forceRehydrate step from Full health report:
-  await step('forceRehydrate', maintForceRehydrate, 'maintRehydrateAliasStatus');

// popup.js:3828 — DELETE dead wire:
-  __maintWire('maintRehydrateAlias', maintForceRehydrate, 'rehydrating...');

// popup.js:3234-3261 — DELETE maintForceRehydrate() function.
```

**Keep as-is (do not touch):**
- `modtools.js:19844` — the auth-fail banner's "Force re-hydrate" button. This one fires at the right moment, re-validates, and auto-reloads. It is justified.
- `modtools.js:1544` — `_rehydrateImpl` closure. Still used by the banner's direct `preloadSecrets` + `syncSecretsToBackgroundVault` calls.
- `modtools.js:1380` — `_installStorageTokenSync` listener. This is the real fix; keep it.
- `background.js:254` — SW `onChanged` mirror. Keep it.

---

## E. SHIP-TONIGHT FIX (v10.3)

Three files, surgical cuts:

1. **popup.html** — delete `#rehydrateBtn`, `#rehydrateStatus`, and the `Diagnostics` section label. Move `debugBtn` + `dashBtn` into the existing `pop-tools` under a `System` label inside the advanced `<details>` accordion (already exists at popup.html:180). Zero net functionality loss.

2. **popup.js** — delete lines 208–235 (`__rehydrateBtn` handler), delete `maintForceRehydrate()` function (lines 3234–3261), remove the `forceRehydrate` step from the full-report routine (line 3504), delete the dead `maintRehydrateAlias` wire (line 3828).

3. **popup.html Diagnostics section** — the label at line 103 becomes orphaned; delete it too.

Total deletions: ~55 lines of popup.js, ~8 lines of popup.html. Zero new code.

The auth-fail banner keeps its "Force re-hydrate" button — that one works, fires in context, and re-validates. Commander will never click the popup button again because it won't exist; the banner version fires automatically when needed.

---

## F. AGENTS NEEDED IF KEPT (Option B — not recommended)

If the decision were to keep the button, the minimum fixes are:

1. **Visible diff signal**: store the pre-rehydrate `tokensStatus` from the SW, compare after, show "vault was already current" vs "vault updated from storage".
2. **Remove the GAW-tab prerequisite**: the popup is an extension context that has direct access to `chrome.storage.local`. It should call `preloadSecrets` equivalents directly via `rpc:'authBackupGet'` or read storage itself, not bounce through a content-script message. The tab requirement is why it errors most of the time.
3. **Auto-trigger on popup open**: run the sync silently every time the popup opens, not on button click.

None of these are worth implementing. The auto-sync infrastructure already does all three, invisibly, in the background. Option B is Option A with extra steps.
