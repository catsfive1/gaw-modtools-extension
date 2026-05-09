# ANTIFRAGILE_SHIPMASTER — v10.6.0 Integration Ship Plan
**Generated:** 2026-05-09 (early AM)
**Scope:** 120 Anti-Fragile Extension Suite rules across modtools.js (23k LOC) + popup.{html,js,css} + background.js + manifest.json
**Source corpus:** 40 audit reports (V10_ANTIFRAGILE/AF-01..AF-40)

---

## A. EXECUTIVE SUMMARY

The 40-agent audit covered 120 rules across every file in the extension. Of 120 rules, **11 were already fully compliant** (no action needed), **4 were partially or fully applied during the audit phase itself** (AF-01, AF-03, AF-04, AF-07 — see Section B), **67 have actionable patches that ship in v10.6**, and **38 are deferred** to v10.7+ due to refactor scope, test harness dependency, or explicit architectural decisions (Web Crypto, Playwright E2E suite, full property test coverage, offscreen documents).

**Priority distribution of v10.6 patches:**
- **P0** (silent failure / data loss / security): 9 patches
- **P1** (high-impact UX or correctness): 28 patches
- **P2** (polish / observability / hardening): 30 patches

**N/A / intentional pass:** Rules 37, 70, 74, 86, 87, 89 (specific sub-items), 107 (property tests), 108 (full E2E suite) — documented ADRs where no code change is correct.

---

## B. ALREADY APPLIED (audit phase)

These fixes were written directly to the dist files during auditing. Integrators do NOT re-apply them; verify they are present before patching.

| Agent | File | Line area | Summary |
|-------|------|-----------|---------|
| AF-01 | background.js | `loadSecrets()` ~L118-123 | Restored `_UPDATE_FLAG_LAST_SET` from `chrome.storage.local` on SW wake so update banner survives SW termination |
| AF-03 | background.js | Before `onInstalled` | Added `self.addEventListener('unhandledrejection')` and `self.addEventListener('error')` writing to `gam_diag_log` |
| AF-03 | modtools.js | Top of IIFE after double-injection guard | Added `window.addEventListener('unhandledrejection')` and `window.addEventListener('error')` |
| AF-04 | background.js | Before `onInstalled` | Added `withBackoff(fn, opts)` helper with exp backoff + jitter; refactored `_persistRotatedToken` to use it |
| AF-04 | background.js | Before `onInstalled` | Added `_recordSwBoot(reason)` function + ring buffer (`gam_sw_boots`, cap 50) |
| AF-04 | background.js | `onInstalled` + `onStartup` | Wired `await _recordSwBoot(...)` at both boot points |
| AF-04 | background.js | `onStartup` (7 alarms.get callbacks) | All 7 `chrome.alarms.get` callbacks now check `chrome.runtime.lastError` first |
| AF-05 | popup.js | L306 | Bare `sendMessage({ type:'GAM_OPEN_POPUP' })` now has `.catch(function(){})` |
| AF-05 | popup.js | L750 | `__saveTokensToSW` now returns `{ ok:false, error:'background SW unavailable' }` on throw |
| AF-05 | modtools.js | L1519 | `_rehydrateFromCache` bare `setTokens` await wrapped in try/catch |
| AF-07 | modtools.js | `runMigrations()` tail | Added `validateSettingsShape()` corruption check + auto-repair via `chrome.storage.local.set` |
| AF-07 | popup.html | `pop-maint-advanced` | Added `maintRepair` button between `maintModmailBackfill` and `maintReset` |
| AF-07 | popup.js | — | Added `maintRepairSettings()` + `__validateSettingsShape()` + `REPAIR_REQUIRED_SHAPE` constants; wired via `__maintWire` |

---

## C. SHIP-V10.6 — INTEGRATOR-WORKER (background.js + manifest.json)

### C.1 — P0 (Critical, ship immediately)

**C.1.1 — Rule 75: `chrome.permissions.onRemoved` handler** (AF-25)
- File: `background.js`, after `_dispatchRpc` definition
- Add `_FEATURE_PERMISSION_MAP` constant + `chrome.permissions.onRemoved.addListener(...)` handler (~50 lines)
- On revocation: zero `secretCache`, broadcast `{type:'permissionsRevoked', origins, features}` to all matching tabs
- Content-script receiver in modtools.js: tear down UI, render static "ModTools disabled" banner; never attempt RPC after this point

**C.1.2 — Rule 23: WAL bypass on `mod_modmail_responses` INSERT** (AF-08, source: worker)
- File: `gaw-mod-proxy-v2.js`, before `mod_modmail_responses` INSERT
- Add `await appendAuditAction(env, { action:'modmail.response_sent', mod, target, meta:JSON.stringify({thread_id,subject}) })`; hard-fail on throw
- This is the only state-mutating write NOT pinned to the Merkle chain; TIER-2 security gap, ship now

**C.1.3 — Rule 38: `lastError` missing from all 4 `onMessage` listeners** (AF-13)
- File: `background.js` L877 top of onMessage callback; `modtools.js` L1182, L4315, L21539
- Add `if (chrome.runtime.lastError) { return; }` as first line of each listener
- Async `sendResponse` calls: wrap as `if (!chrome.runtime.lastError) sendResponse(out);`

**C.1.4 — Rule 46: Missing try/catch on `executeBan`/`executeUnban`** (AF-16)
- File: `modtools.js` ~L6709-L6715
- Wrap `await apiBan(...)` and `await apiUnban(...)` in try/catch; on throw surface snack error + re-enable button
- Also: wrap `apiSendModMessage` outer await (~L528) in try/catch

### C.2 — P1 (High impact)

**C.2.1 — Rule 14: Missing `gam_health` alarm** (AF-05)
```js
// background.js — constants block:
const HEALTH_ALARM = 'gam_health';
const HEALTH_PERIOD_MIN = 5;
// onInstalled: chrome.alarms.create(HEALTH_ALARM, { periodInMinutes: HEALTH_PERIOD_MIN });
// onStartup: chrome.alarms.get(HEALTH_ALARM, (a) => { if (!a) chrome.alarms.create(...); });
// _healthCheck() function: loadSecrets(), vaultOk check, getBytesInUse, _maintAppendDiag
// alarm dispatcher: if (alarm.name === HEALTH_ALARM) { await _healthCheck(); return; }
```

**C.2.2 — Rule 25: Auto-purge in `_maintQuotaCheck` at >80%** (AF-09)
- File: `background.js`, inside `_maintQuotaCheck()` after the warning is set
- Add `async function _maintQuotaPurge()`: drop oldest 50% of `gam_diag_log`; evict LRU 50% of `gam_profile_intel` (sort by `.ts`); log purge event to diag
- Call `await _maintQuotaPurge()` inside the `if (pct >= MAINT_QUOTA_THRESHOLD_PCT)` branch

**C.2.3 — Rule 27: Cache invalidation on update** (AF-09)
- File: `background.js`, `onInstalled` handler after `_recordSwBoot`
```js
if (details.reason === 'update') {
  try {
    await chrome.storage.local.remove(MAINT_INTEL_KEY);
    // append diag entry with previousVersion
  } catch (e) {}
}
```

**C.2.4 — Rule 39: Per-RPC-name rate limiter in `_dispatchRpc`** (AF-13)
- File: `background.js`, top of `_dispatchRpc`
- Add `_RPC_WINDOWS` Map + `_RPC_LIMITS` + `_rpcRateCheck(name)` function
- Limits: `modAuditLog: 60/min`, `modProfilesWrite: 20/min`, `modAiGrokChat: 10/min`, `modPresencePing: 6/min`
- Return `{ ok:false, status:429, error:'rate limited' }` on breach

**C.2.5 — Rule 24: Settings integrity checksum** (AF-08)
- File: `background.js`
- Add `CHECKSUM_KEY = 'gam_settings_checksum'` + `CHECKSUM_VOLATILE` set
- Add `_computeSettingsChecksum(settings)` using `crypto.subtle.digest('SHA-256')`
- Add `_maintSettingsChecksumWrite()` + `_maintSettingsChecksumVerify()`
- Wire: daily write in 24h alarm; boot verify in `onStartup`; fresh write on `reason==='update'` in `onInstalled`
- On mismatch: `_maintSetWarning({ code:'SETTINGS_CHECKSUM_MISMATCH', ... })`

**C.2.6 — Rule 58: AI-DM-send feature gate** (AF-20)
- File: `background.js`, top of `adminDiscordDmModSend` handler
- Add `if (!getFeatureEffective('features.discordDmSend', false)) return { ok:false, error:'feature disabled' };`

**C.2.7 — Rule 112: Enhance `_recordSwBoot` fields** (AF-38)
- File: `background.js`, `_recordSwBoot()` function
- Add: `ua = navigator.userAgent`, `tier` (probe `gam_settings.isLeadMod`/`workerModToken`), `bytesInUse` via `getBytesInUse`, `boot_count` (length + 1)
- Enrich console.log line to include all four new fields

**C.2.8 — Rule 117: Add `minimum_chrome_version`** (AF-39)
- File: `manifest.json`
```json
"minimum_chrome_version": "116"
```
- Also: annotate the `chrome.action.openPopup` feature-detect guard in background.js with the Chrome 127 note

**C.2.9 — Rule 116: Fix stale version in popup + What's New trigger** (AF-39)
- File: `popup.js` init block: `document.getElementById('ver').textContent = 'v' + chrome.runtime.getManifest().version;`
- File: `background.js` `onInstalled`: on `reason==='update'` write `gam_show_whats_new: version` to storage
- File: `popup.js`: on init check flag, if matches current version clear it and call `openWhatsNewPanel()`
- Add `WHATS_NEW` static object + `openWhatsNewPanel()` modal function (v10.5.1 and v10.5.0 entries)

### C.3 — P2 (Polish / Observability)

**C.3.1 — Rule 11 fields already applied** (AF-04) — verify boot entries include `gam_sw_boots` key.

**C.3.2 — Rule 34: Handler input caps** (AF-12)
- `modAiGrokChat` handler: add `prompt = String(args.prompt||'').slice(0,8192)` at top
- `modAiBanSuggest` handler: add `comment = String(args.comment||'').slice(0,1500)` at top

**C.3.3 — Rule 36: `popupRpc` wrapper** (AF-12) — see Section E.

**C.3.4 — Rule 43: Inline `validateRpc` schema engine** (AF-15)
- File: `background.js`, drop `validateRpc(args, schema)` function (~55 lines) above `_dispatchRpc`
- Add `schema` key to the 20 highest-frequency handlers listed in AF-15
- Wire: `if (def.schema) { const sv = validateRpc(args, def.schema); if (!sv.ok) return { ok:false, status:400, error:'schema: '+sv.error }; }`

**C.3.5 — Rule 118: Self-diagnostics on update** (AF-40)
- File: `background.js`, `onInstalled` on `reason==='update'`
- Add `_runUpdateDiagnostics()`: 4 probes (schema integrity, token validity, index reads, self-ping)
- Failures write to `gam_maint_warning` channel (existing popup channel)

---

## D. SHIP-V10.6 — INTEGRATOR-MOD (modtools.js)

### D.1 — P0 (Critical)

**D.1.1 — Rule 50: `safeFeature` wrapper for 7 bare init calls** (AF-17)
```js
function safeFeature(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.catch === 'function') {
      result.catch(e => {
        _diagLog('safe-feature', '['+name+'] async threw', { msg: e&&e.message||String(e) });
        try { snack(name + ' failed', 'error'); } catch(_) {}
      });
    }
    return result;
  } catch(e) {
    _diagLog('safe-feature', '['+name+'] threw', { msg: e&&e.message||String(e) });
    try { snack(name + ' failed', 'error'); } catch(_) {}
    return null;
  }
}
// In init(): replace bare calls for buildTriageConsole, enhanceBanPage, enhanceQueuePage,
// enhanceModmailRead, buildStatusBar, startCrawler, startPresencePings
```

**D.1.2 — Rule 97: Replace `location.reload()` in auth-fail banner with in-place `init()`** (AF-33)
- File: `modtools.js` ~L21431
```js
// Before: setTimeout(() => location.reload(), 400);
// After:
try { b.remove(); } catch(_){}
try { await init(); } catch(e){ try { snack('Partial re-init: '+(e.message||e),'warn'); } catch(_){} }
```
- Also: `location.reload()` at ~L21165 (storage.onChanged) — wrap `_handleNav` in try/catch; on catch call `closeAllPanels()`, log to diagBuffer, do NOT reload

**D.1.3 — Rule 65: innerHTML escaping — 8 P2 violations** (AF-22)
- `modtools.js` L4575-4582: `item.author`, `item.community` — wrap with `escapeHtml()`
- L4609, L4629: API/network error strings — wrap with `escapeHtml(String(...))`
- L7960, L7992, L8813, L8822: replace `replace(/[<>"]/g,'')` with `escapeHtml(String(...))`
- L16662, L16665, L16676, L16679: tard-pattern error strings — wrap with `escapeHtml()`

**D.1.4 — Rule 64: URL validation unconditional** (AF-22)
- `modtools.js` L20626: remove the `else` branch entirely; `allowlistedUrl()` call must be unconditional regardless of `__hardeningOn()`
- L6179: wrap `href` in `allowlistedUrl()` before assigning to `location.href`

### D.2 — P1 (High impact)

**D.2.1 — Rule 31/33: `__makeRequestId` + `__sendWithTimeout` in RPC shim** (AF-11)
```js
// modtools.js — add near rpcCall:
function __makeReqId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
}
function __sendWithTimeout(msg, timeoutMs) {
  return Promise.race([
    chrome.runtime.sendMessage(msg),
    new Promise((_,rej) => setTimeout(() => rej(new Error('MSG_TIMEOUT_'+(msg.type||'rpc')+'_'+timeoutMs+'ms')), timeoutMs))
  ]);
}
// In rpcCall(): replace sendMessage call:
const requestId = __makeReqId();
const resp = await __sendWithTimeout({ type:'rpc', name, args: args||{}, requestId, msgV:1 }, 25000);
```
- In background.js RPC dispatcher: `if (msg.requestId) out.requestId = msg.requestId; out.msgV = MSG_V;`
- Fix `popup.js:306` GAM_OPEN_POPUP wrong type: replace with async `__sendWithTimeout({ type:'openPopup' }, 5000)` + try/catch

**D.2.2 — Rule 35: Thin circuit breaker on `rpcCall`** (AF-12)
- Add `_CB` state object (`CLOSED/OPEN/HALF_OPEN`, threshold=4, resetAfterMs=15000) near `rpcCall`
- Wrap `rpcCall` invocations on the three polling paths (`modMessageInbox`, `modMessageUnreadCount`, `modPresencePing`) with `rpcCallBreaker`
- OPEN state fires existing `_gamShowExtOrphanedBanner()`

**D.2.3 — Rule 47: Replace all 7 `alert()` calls** (AF-16)
- `popup.js` L453, L490, L493, L543, L2092, L2098: replace with `showPopupBanner(msg, severity)` helper (non-blocking, 5s auto-dismiss)
- `modtools.js` ~L19931: replace with `setTimeout(() => snack('...','warn'), 800)`
- `modtools.js` ~L20554: replace with `snack('Bug reporting is disabled...','warn', 6000)`

**D.2.4 — Rule 48: `snackWithActions` API** (AF-16)
```js
// modtools.js — extend showToast():
function snackWithActions(msg, severity, actions, duration=8000) {
  // build toast, append one <button> per action entry, each calls fn() then dismisses
  // falls back to plain snack() when actions is empty
}
// Wire to: executeBan failure path (Retry), unban undo-toast catch (Retry/Ignore),
// apiSendModMessage failure (Retry), bug report fail (Retry), DR execution fail (Retry)
```

**D.2.5 — Rule 78: debounce/throttle helpers + violations** (AF-26)
```js
// modtools.js — add near top of IIFE (extract/replace the existing scoped debounce at L21971):
function debounce(fn, ms) { let t; return function() { const a=arguments; clearTimeout(t); t=setTimeout(function(){ fn.apply(null,a); }, ms); }; }
function throttle(fn, ms) { let last=0; return function() { const now=Date.now(); if(now-last<ms)return; last=now; fn.apply(null,arguments); }; }
```
- V1: DECLAS `document.input` listener (~L21332) — debounce 200ms
- V2: ModChat `@autocomplete` input (~L15154) — debounce 120ms
- V3: Bug-report char counter (~L1127) — debounce 50ms
- V4: ModChat char-count (~L15106) — debounce 50ms
- V5: Macro draft save (~L8173, L8984) — debounce 350ms

**D.2.6 — Rule 80: IntelDrawer ESC handler leak** (AF-27)
- `modtools.js` ~L5015-5037: store handler ref as `state._escHandler`, remove on `closeAllPanels` sweep when `#gam-intel-backdrop` is swept
```js
// _mount():
if (!state._escBound) {
  state._escHandler = function(e) { /* existing body */ };
  document.addEventListener('keydown', state._escHandler, true);
  state._escBound = true;
}
// In closeAllPanels() / backdrop sweep:
if (state._escHandler) { document.removeEventListener('keydown', state._escHandler, true); state._escHandler=null; state._escBound=false; }
```

**D.2.7 — Rule 16: Storage SSOT violations** (AF-06) — 5 patches:
- `popup.js` L2652/2686: replace `localStorage.setItem/getItem('gam_popup_active_tab')` with `chrome.storage.local.set/get`
- `modtools.js` L1731/1737/21485: replace raw `localStorage` reads/writes of `gam_fallback_mode` with `safeGet`/`safeSet`
- `modtools.js` L21181-21186 (EE handler): replace `localStorage.getItem/setItem(K.LOG)` with `safeGet`/`safeSet`
- `modtools.js` L9579: replace `localStorage.removeItem(K.LOG)` with `safeRemove(K.LOG)`

**D.2.8 — Rule 30: Silent storage swallows — add `console.warn`** (AF-10)
- `modtools.js` ~L1636: `.catch(() => {})` on non-token setSetting → `.catch(e => console.warn('[gam] setSetting failed', key, e))`
- `modtools.js` ~L1899: `CachedStore.flush` bare catch → add `console.warn('[gam] CachedStore flush failed', this.ns, e)`
- `modtools.js` ~L2232: `__syncMemSet` bare catch → add `console.warn('[gam] syncMemSet failed', key, e)`
- `background.js` ~L4209/4213/4216: bg storage handler catches → add `console.warn('[gam] bg storage write failed', key, e)`
- `modtools.js` ~L16631: tard-accordion `.set` callback — add `if (chrome.runtime.lastError) { console.warn(...); return; }`

**D.2.9 — Rule 58: Convert `HARD_ALERTS_ON` to team flag** (AF-20)
- `modtools.js` ~L23042: `const HARD_ALERTS_ON = getFeatureEffective('features.brigadeHardAlerts', false)`
- Add `'features.brigadeHardAlerts': false` to `MAINT_DEFAULT_SETTINGS` in popup.js

**D.2.10 — Rule 101: Extend `withUndo` to 4 more actions** (AF-34)
- `apiRemove` in NBA panel → `withUndo(() => apiRemove(...), { tier:'B', inverse:() => apiApprove(...) })`
- `toggleWatch` (all 3 call sites) → `withUndo(() => toggleWatch(username), { tier:'B', inverse:() => toggleWatch(username) })`
- `apiSticky` in NBA panel → `withUndo(() => apiSticky(thingId), { tier:'B', inverse:() => apiSticky(thingId) })`
- `removeFromDeathRow` → wire new `'dr-remove'` type to System A (`_recordUndoAction`)

**D.2.11 — Rule 56: Remediable silent swallows** (AF-19)
- `modtools.js` L1616: `_authBackupPut catch` → add `_diagLog('auth-backup','IDB backup write failed',{key,err:String(e)})`
- L4491: `_flushDeathRowAudit catch` → add `_diagLog` + `snack('Audit log flush failed','warn')`
- L20079: invite-backup catch → add `_diagLog('invite-backup','backup write failed',{err:String(e)})`

**D.2.12 — Rule 82: Gate ambient modmail prefetch behind first click** (AF-28)
- `modtools.js`, in `buildStatusBar()` modmail envelope button click handler:
```js
let _ambientPrefetchStarted = false;
inboxBtn.addEventListener('click', () => {
  if (!_ambientPrefetchStarted) {
    _ambientPrefetchStarted = true;
    setTimeout(() => { try { _ambientModmailPrefetch(); } catch(_){} }, 500);
    setInterval(() => { try { _ambientModmailPrefetch(); } catch(_){} }, 10*60*1000);
  }
  try { _showModmailPopover(inboxBtn); } catch(err) { /* existing */ }
});
// Remove the unconditional setTimeout(15s) + setInterval(10min) boot calls
```

**D.2.13 — Rule 29: 3 feature-flag call sites bypass `getFeatureEffective`** (AF-10)
- `modtools.js` ~L3125: `getSetting('features.shadowQueue', false)` → `getFeatureEffective('features.shadowQueue', false)`
- ~L3258: `getSetting('features.park', false)` → `getFeatureEffective('features.park', false)`
- ~L8209: `getSetting('features.precedentCiting', false)` → `getFeatureEffective('features.precedentCiting', false)`

**D.2.14 — Rule 45: SW-restart snack with auto-retry** (AF-15)
- `modtools.js` in `rpcCall()` at the `if (!resp)` path:
```js
if (!resp) {
  try { await new Promise(r => setTimeout(r, 1500)); const retry = await chrome.runtime.sendMessage({type:'rpc',name,args:args||{}}); if (retry) return retry; } catch(_){}
  try { _gamShowSwRestartSnack(name); } catch(_){}
  return { ok:false, status:0, code:'SW_NO_RESPONSE', error:'ModTools background restarted. Retrying...' };
}
// Add _gamShowSwRestartSnack(rpcName) — fixed-bottom snack, Retry + Dismiss, 12s auto-dismiss
```

**D.2.15 — Rule 77: `scheduleIdle` wrapper for 8 boot tasks** (AF-26)
```js
function scheduleIdle(fn, timeoutMs) {
  if (typeof requestIdleCallback === 'function') { requestIdleCallback(fn, { timeout: timeoutMs }); }
  else { setTimeout(fn, timeoutMs); }
}
// Replace setTimeout with scheduleIdle for: _ambientModmailPrefetch, pullPatternsFromCloud,
// pollTeamFeatures boot kick, _sharedDrRefresh, _susRefresh, injectBadges+injectAllStrips,
// _gamOrphanBackdropSweep, __updateTicker
```

**D.2.16 — Rule 73: Strip `tokenLen` from `window.__GAM_AUTH_RESULT`** (AF-25)
- `modtools.js` ~L21404: remove the `tokenLen` field from the window-exposed shape (keep `ok`, `reason`, `status`)

**D.2.17 — Rule 99: 3-step recovery wizard copy in auth-fail banner** (AF-33)
- `modtools.js` `__showAuthFailBanner` reason-to-text map: replace single-sentence strings with numbered `<ol>` wizard scripts for `no_token`, `fetch_failed`, `whoami_status` failure modes (including "Still stuck?" fallback line)

### D.3 — P2 (Polish)

**D.3.1 — Rule 49: Add `level` field to `_diagLog` schema** (AF-17) — rename `cat`→`source`, `extra`→`ctx`, add `level:'info'|'warn'|'error'`; sendMessage relay for warn/error only

**D.3.2 — Rule 83: Cache TTL fixes** (AF-28)
- `gam_modmail_drafts`: invalidate `cache[thread_id]` on modmail send success
- `gam_macro_drafts`: add `savedAt` timestamp; purge entries older than 24h on read
- IntelDrawer `l1Store`: add `fetchedAt` timestamp; return null when `Date.now()-v.fetchedAt > HOVER_CACHE_MS`; flush on ban-success alongside `IntelCache.delete()`

**D.3.3 — Rule 90: `LOW_RESOURCE_MODE` flag** (AF-30)
- Add `detectLowResource()` at init (getBattery <20% + !charging OR deviceMemory <=1)
- On low resource: `document.body.classList.add('gam-low-resource')`; cancel ambient prefetch; defer firehose auto-start; disable runDeepQueueAnalysis auto-run
- CSS: `.gam-low-resource * { animation:none!important; transition:none!important; }`

**D.3.4 — Rule 41: rpcCall message-level debug logging** (AF-14)
- Add `_RPC_LOG_KEY = 'gam_rpc_log'` + `_appendRpcLog(entry)` function (cap 200 entries)
- Gate behind `getSetting('msg_log_enabled', false)`; sanitize: log `name, ok, status, latency_ms, error` only — never token values or response bodies
- `downloadDebugSnapshot` includes `gam_rpc_log` when `msg_log_enabled` is true

**D.3.5 — Rule 119: Add `FEATURE_FLAGS` const** (AF-40)
```js
const FEATURE_FLAGS = Object.freeze({ HOT_NOW_PANEL:true, MODMAIL_3COL:true, AI_HOLD_QUEUE:true, UNIVERSAL_UNDO:true });
// Guard each feature's wire-up with: if (FEATURE_FLAGS.X) { ... }
```

**D.3.6 — Rule 57: `gamInstallType` RPC** (AF-19)
- `background.js`: boot-time `_gamInstallType` via `chrome.management.getSelf()`; expose as `gamInstallType` RPC
- `modtools.js`: lazy-init `_getInstallType()` + cache; use to gate verbose dev-only console.warns

**D.3.7 — Rule 40: `gam_msg_queue` SW-downtime outbox** (AF-14)
- Add `_enqueueRpc(name, args)` + `_replayMsgQueue()` (cap 20 entries, `chrome.storage.local`)
- On successful RPC send: call `_replayMsgQueue()` to drain outbox
- Wire `queued:true` option to `modmailTrackResponse` and the inline `ai_used` path

---

## E. SHIP-V10.6 — INTEGRATOR-POPUP (popup.html + popup.js + popup.css)

### E.1 — P0 (Critical)

**E.1.1 — Rule 60: Escalate "Clear all" to triple-confirm** (AF-20)
- `popup.js` `clearBtn` handler: add dialog #2 "This includes your mod token..." + dialog #3 via `__popupAskText({ label:'Type WIPE to confirm', validate: v => v==='WIPE' })`
- Also update confirm message text to mention: "Your audit log (gam_diag_log) is preserved. The setup wizard will re-appear to guide re-authentication."
- Rename button label from "Clear all" to "Factory reset"

### E.2 — P1 (High impact)

**E.2.1 — Rule 36: `popupRpc` wrapper + `__showPopupRestartNotice`** (AF-12)
```js
// popup.js — add near top:
async function popupRpc(name, args) {
  try {
    const r = await chrome.runtime.sendMessage({ type:'rpc', name, args: args||{} });
    if (!r) return { ok:false, code:'NO_RESPONSE', error:'No response from extension background.' };
    return r;
  } catch(e) {
    const msg = String(e && e.message || e);
    if (/context invalidated|receiving end does not exist|message port closed/i.test(msg)) {
      __showPopupRestartNotice();
      return { ok:false, code:'EXT_CONTEXT_INVALIDATED', error:'Extension is restarting — close and reopen this popup.' };
    }
    return { ok:false, error:msg };
  }
}
function __showPopupRestartNotice() {
  if (document.getElementById('gam-popup-restart-notice')) return;
  const d = document.createElement('div');
  d.id = 'gam-popup-restart-notice';
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#2a1d10;border-bottom:1px solid #ff9933;color:#ffd84d;font:600 11px ui-monospace,monospace;padding:6px 12px;text-align:center;';
  d.textContent = 'Extension is restarting — close and reopen this popup.';
  document.body.prepend(d);
}
// Replace all direct chrome.runtime.sendMessage({type:'rpc',...}) in popup.js with popupRpc(name,args)
```

**E.2.2 — Rule 100: `importBtn` — data import** (AF-34)
- `popup.html`: add `importBtn` in footer adjacent to `exportBtn`
- `popup.js`: handler: file picker → parse JSON → validate `scope==='owned-keys'` → schema-version check → skip tokens/sniff_log/fallback_mode → `chrome.storage.local.set()` → snack result → reload popup
- Never overwrite `workerModToken`/`leadModToken` from import

**E.2.3 — Rule 52: Safe Mode flag + toggle** (AF-18)
- `popup.html` Maintenance section: add full-width Safe Mode toggle row at top (amber when active)
- `popup.js`: toggle writes `setSetting('safe_mode', bool)` + shows "reload GAW tab to apply" snack
- `modtools.js` init: gate `if (getSetting('safe_mode',false)) { /* skip: firehose, AI calls, presence, animations, auto-DR */ }` before subsystem init
- Safe mode preserves: token entry, ban hammer, modmail send, status bar (static), mod log read, settings panel

**E.2.4 — Rule 54: `gam_error_counters` auto-disable on 3x crash** (AF-18)
- New storage key `gam_error_counters` (shape: `{[featureName]: { count, window_start, disabled_at }}`)
- Add `_incrementErrorCounter(featureName)` + `_onFeatureAutoDisabled` + `_renderDisabledChip` + `_clearErrorCounter` in modtools.js
- 5-min sliding window, threshold=3; on disable: render chip + `_maintAppendDiag('auto_disable',...)` + custom event
- Boot-time gate: read counters, skip mount + render disabled chip for any `disabled_at > 0`
- `popup.html`/`popup.js`: Feature Health row in Maintenance (below Safe Mode); lists auto-disabled features with Re-enable buttons

**E.2.5 — Rule 26: Stat-cell `--` placeholder before `loadStats()`** (AF-09)
```js
// popup.js, before loadStats() call:
['s-pending','s-dr','s-banned','s-today','s-msgs','s-notes'].forEach(function(id) {
  const el = document.getElementById(id);
  if (el && !el.textContent.trim()) el.textContent = '--';
});
loadStats();
```

**E.2.6 — Rule 18: `QUOTA_BYTES_EXCEEDED` detection + auto-purge** (AF-06)
- `popup.js` + `background.js`: wrap critical `chrome.storage.local.set` calls:
```js
try { await chrome.storage.local.set({[key]:value}); }
catch(e) {
  if (e && e.message && e.message.includes('QUOTA_BYTES_EXCEEDED')) {
    await _purgeOldestDiagLog50Pct();
    await chrome.storage.local.set({[key]:value}); // retry once
  } else throw e;
}
```
- Add shared `_purgeOldestDiagLog50Pct()` to both files
- `popup.js` `_autoStorageProbe`: add `if (pct > 90) await _purgeOldestDiagLog50Pct()`
- Fix 4 silent `.catch(function(){})` calls in popup.js (L57, L73, L112, L267): add `console.warn`

**E.2.7 — Rule 55: Add `gam_diag_log` + `install_type` to bug report modal path** (AF-19)
- `modtools.js` bug report modal (~L1137): add `gam_diag_log: diagLogRaw.slice(-100)` (if consent) + `install_type: _gamInstallType` + `ext_id: chrome.runtime.id` to payload object

**E.2.8 — Rule 20: Escalate "Clear all" confirm — additionally rename footer button** (see E.1.1 above)

### E.3 — P2 (Polish)

**E.3.1 — Rule 94: Diagnostics Diag tab** (AF-32)
- `popup.html`: add 5th nav tab `data-tab="diag"`
- `popup.js`: `renderDiagTab()` — reads `gam_sw_boots`, `gam_diag_log`, `gam_settings`, `chrome.alarms.getAll()` in parallel; renders 4 sections: System identity, SW health, RPC error log, Storage+audit
- "Debug snapshot" button moves here; auto-refreshes on `storage.onChanged` for diag keys

**E.3.2 — Rule 95: 5 discoverability fixes** (AF-32)
- AI button error states: append "AI unavailable — use Ban Manager to ban manually" hint
- FallbackMode ON: add "NATIVE MODE" label to maintenance warning chip with tooltip
- SW dead token-save: distinguish `lastError` "Could not establish connection" from worker rejection; render actionable text
- Crawl success message: append "users now visible in Stats > Pending and searchable in Mod Console (Ctrl+Shift+M)"
- Token health red: inject "Token expired — click here to rotate" action link in `maintTokenStatus` div

**E.3.3 — Rule 47: showPopupBanner helper** (AF-16, coordinates with E.1.1)
- Add non-blocking `showPopupBanner(msg, severity)` helper in popup.js; auto-dismisses at 5s

**E.3.4 — Rule 98: Promote session drafts to local with TTL** (AF-33)
- `gam_modmail_drafts`: mirror to `chrome.storage.local` with 4h TTL key (`savedAt` + `DRAFT_TTL_MS = 4*60*60*1000`); purge on read when stale
- `gam_macro_drafts`: same pattern, 24h TTL

---

## F. SHIP-V10.6 — INTEGRATOR-MIGRATIONS (D1 schema bumps)

No new D1 migrations expected for the client-side anti-fragile work. The one worker-side patch (WAL for `mod_modmail_responses` — C.1.2 above) is a code-only change in the worker handler, not a schema migration.

**Canary column** (AF-37 Rule 111): `ALTER TABLE bot_mods ADD COLUMN is_canary INTEGER NOT NULL DEFAULT 0` — this is optional infrastructure, not blocking for v10.6 ship. Include if the worker PR is cut in the same window.

**ADR — Web Crypto token encryption (Rule 71):**
Web Crypto AES-GCM encryption for `workerModToken`/`leadModToken` is architecturally designed (AF-07, AF-24) but deferred. The API contract is specified in AF-24 (`gam_crypt.wrap/unwrap`, device-key in `gam_crypt_key`, migration path). Ship in v10.7 after the test harness (AF-36) is in place to verify the migration is lossless. Do not ship crypto migration without automated regression coverage on the token-persistence path.

---

## G. DEFERRED TO V10.7+

These require scope beyond surgical patches, new infrastructure dependencies, or explicit ADR decisions.

| Rule(s) | Reason for deferral | AF agent |
|---------|---------------------|----------|
| 71 — Web Crypto token encryption | Requires migration, async API thread-through at 12+ call sites, must not ship without regression tests | AF-07, AF-24 |
| 22 — chrome.storage.sync mirror | Feature-complete design done; defer until sync is validated against quota limits in production | AF-08 |
| 36 (unit/E2E tests) | Full Playwright E2E suite + Vitest unit harness; standalone effort ~2 engineering days | AF-36 |
| 106/107/108 — Full test suite | All tests per AF-36 roadmap | AF-36 |
| 40 — Full message-queue replay | `gam_msg_queue` basic queue ships (D.2.17); full queue with all action types in v10.7 | AF-14 |
| 43 — Schema validator on all 72 handlers | Top-20 handlers ship in v10.6 (C.3.4); remaining 52 in v10.7 | AF-15 |
| 52/53/54 — Safe Mode + full fallback chips | Core safe-mode toggle ships (E.2.3); per-surface fallback chips + `gam_error_counters` full implementation in v10.7 | AF-18 |
| 84 — Full offline replay queue for ban/note | `navigator.onLine` banner ships; replay queue for ban/modmail-send deferred | AF-28 |
| 85 — 30-min auto-reload via alarm | ADR: auto-reload was intentionally removed as RCE vector; re-evaluate with security review only | AF-29 |
| 96 — Keyboard shortcuts (manifest commands) | Requires manifest changes + background handler + content-script overlay; separate feature spike | AF-32 |
| 111 — Canary release infra | `is_canary` column + canary R2 path; low urgency relative to other work | AF-37 |
| 110 — Migration tests | Blocked on test runner (AF-36) | AF-37 |
| 57 — Full console.warn gating | 136 call-site review; not surgical | AF-19 |
| 79 — Memory logging | Nice-to-have observability | AF-27 |
| 17/R6 — `runMigrations` in `onInstalled` | Requires async refactor of `runMigrations` + schema version migration to storage.local; non-trivial | AF-06 |

---

## H. CONFLICTS + RESOLUTIONS

**H.1 — Rule 51 vs AF-03 ALREADY APPLIED**
AF-17 (Rule 51) proposed `window.addEventListener('error')` and `'unhandledrejection'` for modtools.js. AF-03 already applied these. AF-17's additional requirement is that they also emit via `chrome.runtime.sendMessage` relay to background — that relay is a separate P2 patch (D.3.1 in the logging section). No conflict; AF-03 is the base, AF-17's relay is additive.

**H.2 — Rule 13 (AF-05) vs Rule 31 (AF-11)**
Both flag `popup.js:306` (`GAM_OPEN_POPUP`). AF-05 applied a bare `.catch()`; AF-11 correctly identifies it also uses the wrong message type (`GAM_OPEN_POPUP` vs `openPopup`). Resolution: D.2.1 supersedes the AF-05 fix — replace the entire line with the `__sendWithTimeout({ type:'openPopup' }, 5000)` pattern. The integrator for modtools.js should verify the AF-05 `.catch()` patch is not double-applied.

**H.3 — Rule 16 (`runMigrations`) vs deferred items**
AF-06 flags `gam_schema_version` as written to localStorage (SSOT violation). The fix requires making `runMigrations` async and reading from `chrome.storage.local`. This touches the migration boot path and is deferred (Section G). The 4 other Rule 16 violations (popup active tab, fallback mode, EE handler, removeItem) ship in v10.6 (D.2.7) as they are surgical.

**H.4 — Rule 47 alerts: popup vs content script**
AF-16 flags alerts in both files. Two separate integrators own these. The `showPopupBanner` helper (E.3.3) is popup-only; the modtools.js alert replacements (D.2.3) use the existing `snack()`. No shared code needed.

**H.5 — Rule 22 (AF-08 sync) vs Rule 24 (AF-08 checksum)**
The checksum verify in `_syncSettingsApply` requires calling `maintenanceChecksumRefresh` RPC after applying sync values. Since sync (Rule 22) is deferred, this wiring is also deferred. The checksum write/verify in `onInstalled`/`onStartup` and the 24h alarm (C.2.5) ships without the sync trigger.

---

## I. CROSS-REFERENCES TO AF REPORTS

| Section | Patch | AF Source |
|---------|-------|-----------|
| C.1.1 | permissions.onRemoved | AF-25 (Rule 75) |
| C.1.2 | WAL modmail_responses | AF-08 (Rule 23) |
| C.1.3 | lastError in onMessage | AF-13 (Rule 38) |
| C.1.4 | executeBan try/catch | AF-16 (Rule 46) |
| C.2.1 | gam_health alarm | AF-05 (Rule 14) |
| C.2.2 | Auto quota purge | AF-09 (Rule 25) |
| C.2.3 | Cache invalidate on update | AF-09 (Rule 27) |
| C.2.4 | Per-RPC rate limiter | AF-13 (Rule 39) |
| C.2.5 | Settings checksum | AF-08 (Rule 24) |
| C.2.6 | AI-DM feature gate | AF-20 (Rule 58) |
| C.2.7 | Boot fingerprint fields | AF-38 (Rule 112) |
| C.2.8 | minimum_chrome_version | AF-39 (Rule 117) |
| C.2.9 | Version display + What's New | AF-39 (Rule 116) |
| C.3.2 | Input caps (AI handlers) | AF-12 (Rule 34) |
| C.3.4 | validateRpc schema engine | AF-15 (Rule 43) |
| C.3.5 | Self-diagnostics on update | AF-40 (Rule 118) |
| D.1.1 | safeFeature wrapper | AF-17 (Rule 50) |
| D.1.2 | Replace location.reload | AF-33 (Rule 97) |
| D.1.3 | innerHTML escaping | AF-22 (Rule 65) |
| D.1.4 | URL validation unconditional | AF-22 (Rule 64) |
| D.2.1 | requestId + sendWithTimeout | AF-11 (Rules 31, 33) |
| D.2.2 | Circuit breaker | AF-12 (Rule 35) |
| D.2.3 | alert() replacements | AF-16 (Rule 47) |
| D.2.4 | snackWithActions | AF-16 (Rule 48) |
| D.2.5 | debounce/throttle + violations | AF-26 (Rule 78) |
| D.2.6 | IntelDrawer ESC leak | AF-27 (Rule 80) |
| D.2.7 | Storage SSOT violations | AF-06 (Rule 16) |
| D.2.8 | Silent storage swallows | AF-10 (Rule 30) |
| D.2.9 | brigadeHardAlerts team flag | AF-20 (Rule 58) |
| D.2.10 | withUndo to 4 more actions | AF-34 (Rule 101) |
| D.2.11 | Remediable swallows | AF-19 (Rule 56) |
| D.2.12 | Gate ambient prefetch | AF-28 (Rule 82) |
| D.2.13 | getFeatureEffective routing | AF-10 (Rule 29) |
| D.2.14 | SW-restart snack | AF-15 (Rule 45) |
| D.2.15 | scheduleIdle wrapper | AF-26 (Rule 77) |
| D.2.16 | Strip tokenLen from window | AF-25 (Rule 73) |
| D.2.17 | Auth-fail wizard copy | AF-33 (Rule 99) |
| D.3.7 | gam_msg_queue outbox | AF-14 (Rule 40) |
| E.1.1 | Clear all triple-confirm | AF-20 (Rule 60) |
| E.2.1 | popupRpc wrapper | AF-12 (Rule 36) |
| E.2.2 | importBtn | AF-34 (Rule 100) |
| E.2.3 | Safe Mode toggle | AF-18 (Rule 52) |
| E.2.4 | Auto-disable on crash | AF-18 (Rule 54) |
| E.2.5 | Stat-cell placeholder | AF-09 (Rule 26) |
| E.2.6 | QUOTA_BYTES_EXCEEDED | AF-06 (Rule 18) |
| E.2.7 | Bug report diag_log | AF-19 (Rule 55) |
| E.3.1 | Diagnostics tab | AF-32 (Rule 94) |
| E.3.2 | Discoverability fixes | AF-32 (Rule 95) |
| E.3.4 | Promote session drafts | AF-33 (Rule 98) |

---

## J. INTEGRATOR HANDOFF NOTES

### INTEGRATOR-WORKER (background.js + manifest.json)

**File scope:** `D:\AI\_PROJECTS\dist\mod-tools dist\background.js`, `manifest.json`

**Read first:** AF-01, AF-02, AF-03, AF-04, AF-05, AF-08, AF-09, AF-12, AF-13, AF-15, AF-20, AF-25, AF-38, AF-39, AF-40

**Non-regression commitments:**
- The 7-alarm structure (names, periods) must not change
- `secretCache` shape `{ workerModToken, leadModToken }` must not change
- `loadSecrets()` fallback chain (session-first, local-fallback) must be preserved
- All AF-04 already-applied fixes (withBackoff, _recordSwBoot, lastError guards) must be present before you begin

**Parse-check gate:** `node --check background.js` must exit 0 before and after each patch. Do not bundle multiple patches into one check-cycle; check after each C.x section.

**Order of operations:** Apply C.1 patches first (P0), verify parse, then C.2, then C.3. The `gam_health` alarm (C.2.1) must be in `onInstalled` before the alarm dispatcher entry (both in the same file). The settings checksum (C.2.5) depends on `_maintAppendDiag` which already exists — do not redefine it.

---

### INTEGRATOR-MOD (modtools.js)

**File scope:** `D:\AI\_PROJECTS\dist\mod-tools dist\modtools.js`

**Read first:** AF-10, AF-11, AF-12, AF-14, AF-15, AF-16, AF-17, AF-19, AF-20, AF-22, AF-25, AF-26, AF-27, AF-28, AF-33, AF-34, AF-40

**Non-regression commitments:**
- `escapeHtml()` already exists — use it, do not redefine it
- `rpcCall(name, args)` external signature must not change; add `__makeReqId`/`__sendWithTimeout` as internal wrappers
- `safeFeature()` must be defined before `init()` call sites that use it
- `debounce()` at L21971 must be extracted to module scope and the scoped copy removed, not duplicated
- `snackWithActions` extends `showToast()` — do not replace `snack()`; `snack()` with no actions must still work

**Largest diff risk:** D.1.1 (`safeFeature` wrapper) and D.2.1 (`__sendWithTimeout`) both touch `init()` and `rpcCall()` respectively — these are the highest-traffic code paths. Test both with `node --check modtools.js` after application. Do not merge D.1 and D.2 patches in the same pass.

**Order:** D.1 patches (P0) first. `safeFeature` and `location.reload` replacement must ship together or not at all — they both touch the auth-fail banner flow. Do D.2 as a separate pass.

---

### INTEGRATOR-POPUP (popup.html + popup.js + popup.css)

**File scope:** `D:\AI\_PROJECTS\dist\mod-tools dist\popup.{html,js,css}`

**Read first:** AF-06, AF-09, AF-12, AF-16, AF-18, AF-19, AF-20, AF-32, AF-33, AF-34, AF-39

**Non-regression commitments:**
- `__maintWire(id, fn, loadingText)` pattern must remain the wiring mechanism for all maintenance buttons
- `__popupAskText` already exists — use it for the triple-confirm WIPE dialog (E.1.1); do not redefine it
- `WHATS_NEW` object in popup.js must use static entries only — no `fetch()` calls for changelog content
- `popupRpc` wrapper replaces direct `sendMessage({type:'rpc',...})` calls; do NOT wrap the non-rpc sends (`setTokens`, `clearTokens`, `tokensStatus`) with `popupRpc` — those use a different type field and go through separate handlers

**What's New modal:** the popup already has a modal pattern (see `__popupAskText`). Reuse its CSS overlay structure; do not add new z-index layers or new modal root elements.

**Import button placement:** footer row, between `exportBtn` and `clearBtn`. After this ship, move `clearBtn` into the Maintenance advanced accordion (Rule 102 debt — out of scope for v10.6 but flag for v10.7).

---

*End of ANTIFRAGILE_SHIPMASTER v10.6.0 — 2026-05-09*
