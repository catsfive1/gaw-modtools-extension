# AF-08: Anti-Fragile Suite — Rules 22-24
**GAW ModTools v10.5.1 | Audit date: 2026-05-09**

---

## Rule 22 — chrome.storage.sync Mirror for Cross-Device Settings

**Requirement:** Identify 3-5 settings that SHOULD sync across devices for a single mod (not tokens — those are per-device). Add a thin `gam_settings_sync` mirror with last-write-wins conflict resolution. Gate behind `gam_settings.sync_settings_enabled` (default OFF).

---

### Current State

All settings live in `chrome.storage.local` under the key `gam_settings`. The extension has never touched `chrome.storage.sync`. The `DEFAULT_SETTINGS` object (modtools.js ~line 1255) defines ~60 keys, most of them per-device state (tokens, consent nonces, volatile caches) or team-coordination state that lives on the worker (not appropriate for sync).

`chrome.storage.sync` quota: 100 KB total, 8 KB per key, 512 keys, 1800 writes/hour. The full `gam_settings` blob is roughly 4-10 KB depending on how many rules and macro templates are stored — too large to sync wholesale, and inappropriate since it contains tokens.

---

### Candidate Settings Analysis

Of the ~60 keys in `DEFAULT_SETTINGS`, the candidates for sync are settings that:
- Reflect personal workflow preferences (not team state)
- Are safe to appear on any device this mod logs into (no secrets, no device-local caches)
- Are small (well within 8 KB per key)
- Would genuinely be annoying to reconfigure on a second device

| Setting key | Type | Why it qualifies | Why NOT to sync it |
|---|---|---|---|
| `modConsoleDock` | string `'modal'\|'right'\|'left'` | Muscle memory — mod learns to click a spot | — |
| `chat.dock` | string `'left'\|'right'` | Same: dock preference is personal, not page-specific | — |
| `chat.width` | string `'sm'\|'md'\|'lg'` | Screen real estate preference; consistent across mod's devices | — |
| `statusBarCompact` | boolean | Display density choice; personal preference | — |
| `hideSidebar` | boolean | Focus mode toggle; same preference on all mod's devices | — |
| `harmonizeTheme` | boolean | Visual comfort preference | — |
| `susMarkerEnabled` | boolean | Feature opt-in; personal preference | — |
| `tardsThreshold` | number 1-3 | Sensitivity preference; consistent per-mod | — |
| `defaultDeathRowHours` | number | Workflow shortcut; consistent per-mod | — |
| `banMessageTemplate` | string | Personal template; however, this can be large if edited | Cap at 500 chars in sync mirror |
| `autoDeathRowRules` | array | Team-shared patterns; but mod-specific rule sets are personal | Can be large; defer to v.next if > 4 KB |
| `workerModToken` | string | — | SECRET — never sync |
| `leadModToken` | string | — | SECRET — never sync |
| `lastTokenPromptAt` | timestamp | Device-local debounce | Per-device, skip |
| `consentShown` | boolean | Device-local consent flag | Per-device, skip |
| `lastAiScanDate` | date string | Local scan marker | Per-device, skip |
| `features.*` | booleans | Team rollout flags set by lead | Never user-sync (lead controls these) |
| `rotated_at` | timestamp | Per-device rotation bookkeeping | Per-device, skip |

**Selected sync set (5 keys):**

```
modConsoleDock         string   'modal' | 'right' | 'left'
chat.dock              string   'left' | 'right'
chat.width             string   'sm' | 'md' | 'lg'
statusBarCompact       bool
hideSidebar            bool
```

These five are the settings a mod most visibly reconfigures when logging into a second device. They are small (< 200 bytes total), contain no secrets, and reflect personal UI muscle memory. `banMessageTemplate` and `tardsThreshold` are good candidates for v.next once basic sync is validated — they are left out of the initial set to keep the first mirror footprint minimal and the quota impact predictable.

---

### Design

**Storage key:** `gam_settings_sync` in `chrome.storage.sync`. Separate from `gam_settings` so the two blobs don't conflict.

**Shape:**
```js
// gam_settings_sync in chrome.storage.sync
{
  v: 1,                        // schema version for future migration
  ts: 1746820000000,           // Date.now() at last write (last-write-wins)
  modConsoleDock: 'right',
  'chat.dock': 'right',
  'chat.width': 'md',
  statusBarCompact: true,
  hideSidebar: true
}
```

**Conflict resolution:** Last-write-wins on `ts`. When `storage.sync` fires `onChanged`, the inbound `ts` is compared to the local `gam_settings.sync_last_written_at`. If inbound `ts` is newer, the sync values are merged into `gam_settings.local` via a targeted patch (only the five sync keys, nothing else overwritten). If inbound `ts` is equal or older, the inbound is ignored — the local device already has newer or equal state.

**Flag:** `gam_settings.sync_settings_enabled` (boolean, default `false`). When false, no reads from or writes to `chrome.storage.sync` occur. The flag is NOT itself synced (it's per-device opt-in, so a mod can have sync active on their desktop but not their laptop until they opt in on the laptop too).

---

### Implementation Sketch

**New constant block (modtools.js, near K_SETTINGS):**
```js
const K_SYNC = 'gam_settings_sync';
const SYNC_KEYS = [
  'modConsoleDock', 'chat.dock', 'chat.width',
  'statusBarCompact', 'hideSidebar'
];
const SYNC_SCHEMA_V = 1;
```

**Write path — `_syncSettingsWrite()` (call from inside `setSetting` after local write):**
```js
async function _syncSettingsWrite() {
  try {
    if (!getSetting('sync_settings_enabled', false)) return;
    if (!chrome.storage || !chrome.storage.sync) return;
    const blob = { v: SYNC_SCHEMA_V, ts: Date.now() };
    for (const k of SYNC_KEYS) blob[k] = getSetting(k);
    await chrome.storage.sync.set({ [K_SYNC]: blob });
    setSetting('sync_last_written_at', blob.ts);  // local bookmark, not synced
  } catch (e) {
    // quota exceeded or sync unavailable — swallow silently; local settings unaffected
    try { console.warn('[modtools sync] write failed', e.message); } catch (_) {}
  }
}
```

**Read path — `_syncSettingsApply()` (call at init, after `preloadSecrets`):**
```js
async function _syncSettingsApply() {
  try {
    if (!getSetting('sync_settings_enabled', false)) return;
    if (!chrome.storage || !chrome.storage.sync) return;
    const r = await chrome.storage.sync.get(K_SYNC);
    const remote = r && r[K_SYNC];
    if (!remote || typeof remote !== 'object' || remote.v !== SYNC_SCHEMA_V) return;
    const localTs = getSetting('sync_last_written_at', 0) || 0;
    if (remote.ts <= localTs) return; // local is newer or equal, ignore
    // Apply only valid sync keys — never touch secrets or non-sync settings
    const patch = {};
    for (const k of SYNC_KEYS) {
      if (k in remote) patch[k] = remote[k];
    }
    if (Object.keys(patch).length === 0) return;
    // Merge patch into local settings
    const cur = await chrome.storage.local.get(K_SETTINGS);
    const merged = Object.assign({}, cur[K_SETTINGS] || {}, patch);
    await chrome.storage.local.set({ [K_SETTINGS]: merged });
  } catch (e) {
    try { console.warn('[modtools sync] apply failed', e.message); } catch (_) {}
  }
}
```

**Live push listener (for cross-device real-time sync — wires to `chrome.storage.onChanged` in modtools.js):**
```js
chrome.storage.onChanged.addListener(function(changes, area) {
  if (area !== 'sync') return;
  if (!changes[K_SYNC]) return;
  if (!getSetting('sync_settings_enabled', false)) return;
  _syncSettingsApply().catch(() => {});
});
```

**Settings UI:** Add a toggle in the Settings tab under "Advanced" labeled "Sync UI preferences across devices (beta)". Default OFF. Wire toggle to `setSetting('sync_settings_enabled', val)` — no immediate sync write on toggle; the next `setSetting` call for any sync key will push.

---

### What Is Deliberately Excluded

- `workerModToken`, `leadModToken`: never. These are device-issued, device-local credentials. Syncing them would mean a compromised Chrome Sync account could exfil every mod's worker token across all their devices.
- `features.*` flags: team rollout state; lead controls these via worker. Mod sync would create a race where a mod's second device re-enables a feature the lead just killed.
- `autoDeathRowRules`, `autoTardRules`: potentially large arrays. Add to v.next after basic sync is validated and quota impact is measured.
- `banMessageTemplate`: good candidate for v.next; excluded now because the template can contain 500+ chars and adding it to the initial sync blob risks hitting write-rate limits if the mod edits the template frequently.

---

## Rule 23 — Write-Ahead Log: Audit Chain Invariant Verification

**Requirement:** Verify every mutation goes through `appendAuditAction` BEFORE the actual mutation completes. Document the pattern. Flag any mutation that bypasses audit.

---

### Pattern: appendAuditAction as WAL

`appendAuditAction` lives in `gaw-mod-proxy-v2.js` (the Cloudflare Worker). It performs an atomic `INSERT INTO audit_log ... VALUES (..., (SELECT entry_hash FROM audit_log ORDER BY id DESC LIMIT 1)) RETURNING *` — a Merkle-chained INSERT. The chain is computed inside the single SQL statement, which means:

1. The audit row is either fully written with correct chain linkage, or the entire INSERT fails.
2. The INSERT runs before any subsequent D1 mutation in the same handler. If the INSERT throws, the handler returns an error and the downstream mutation never executes.
3. This IS a write-ahead log pattern: the record of intent (audit row) is durable before the state change (ban, token rotation, etc.) takes effect. A crash after the INSERT but before the downstream mutation leaves a detectable gap in the audit chain — the "what was attempted" is recorded even if "what happened" is incomplete.

The HMAC chain (migration 026) adds tamper-evidence: `entry_hash = HMAC(prev_hash || action || mod || target || ts, AUDIT_HMAC_KEY)`. Any retroactive modification of an audit row breaks every subsequent hash in the chain — detectable by `handleAuditVerify`.

**Documented invariant (from `AGENT_BRIEF.md` and `FEATURES_MATRIX_v10.5.md` F1):** `appendAuditAction` MUST hard-fail on state-mutating writes. Handlers must never `try/catch{}` around the audit append in privileged mutation paths.

---

### Callsite Audit

The following state-mutating worker endpoints were cross-referenced against the codebase (grep on `appendAuditAction` callsites and grep on state-mutating D1 writes):

| Endpoint / Action | appendAuditAction called? | Notes |
|---|---|---|
| `handleBan` — ban a user | YES | Hard-fail; documented invariant |
| `handleUnban` — unban | YES | Hard-fail |
| `handleModBanConfirm` — DR confirm ban | YES | `correlated_action` pattern (migration 028) |
| `handleRotateToken` — token rotation | YES | Hard-fail; invariant enforced |
| `handleClaimRotation` — mod claims invite | YES | Hard-fail |
| `handleImportTokensFromKv` — token import | YES | Documented in AGENT_BRIEF as invariant |
| `handleMsgDelete` — mod_msg.delete | YES | Hard-fail per FEATURES_MATRIX_v10.5 |
| `handlePrecedentDelete` — precedent.delete | YES | Hard-fail |
| `handleAdminDistPushZip` — dist push | YES | audit='dist.push_zip' |
| `handleAdminDiscordDmAll` — Discord DM | YES | audit='token.rotation_dm_all' |
| `mod_modmail_responses` INSERT | **NO** | Security gap; documented in SECURITY_REAUDIT_v9.22.md (lines 210-228) |

---

### Known Bypass: mod_modmail_responses

`SECURITY_REAUDIT_v9.22.md` documents this explicitly: the handler that INSERTs into `mod_modmail_responses` (saving a modmail reply draft/send record) does NOT call `appendAuditAction`. The modmail response row is a state-mutating write that is not pinned to the Merkle chain.

**Risk level:** Moderate. A D1-write attacker (or forged-row attacker) can backdate or insert `mod_modmail_responses` rows without breaking the audit chain. Modmail send events would not appear in audit trail searches or Merkle verification.

**Fix sketch (from SECURITY_REAUDIT_v9.22.md):**
```js
// Before the mod_modmail_responses INSERT:
try {
  await appendAuditAction(env, {
    action: 'modmail.response_sent',
    mod: modName,
    target: targetUsername,
    meta: JSON.stringify({ thread_id: threadId, subject: subject.slice(0, 100) })
  });
} catch (e) {
  return jsonResponse({ ok: false, error: 'audit write failed: ' + e.message }, 500);
}
// Then proceed with mod_modmail_responses INSERT
```

**Status in v10.5.1:** UNPATCHED. This is carried forward from v9.22 as a TIER-2 backlog item. The fix is a single `appendAuditAction` call before the INSERT — a one-hour patch — but it needs to be tested against the staging worker because the modmail handler is in a high-traffic path (modmail enrichment fires on every inbox poll).

---

### WAL Pattern Documentation

For any new state-mutating endpoint added to `gaw-mod-proxy-v2.js`, the mandatory pattern is:

```js
// 1. AUDIT FIRST (WAL step) — must be before any D1 mutation
//    Hard-fail: if audit throws, return 500 immediately. Never catch and continue.
await appendAuditAction(env, {
  action: 'action.name',    // dot-separated, lowercase
  mod: modName,
  target: targetUser,
  meta: JSON.stringify({ ...relevant_fields })
});

// 2. MUTATION (downstream state change)
//    Only reached if audit succeeded.
await env.DB.prepare('UPDATE ... WHERE ...').bind(...).run();
```

The invariant: **no D1 mutation that modifies team-visible state executes before `appendAuditAction` returns successfully.**

Read-only endpoints (GET queries, list endpoints, health checks) are exempt — they do not mutate state and do not require audit entries.

---

## Rule 24 — Periodic Settings Integrity Checksum

**Requirement:** Add a daily cron task in background.js that computes a SHA-256 of `gam_settings` minus volatile fields and writes to `gam_settings_checksum`. On boot: compare current vs stored; if mismatch, log warn + offer Repair via the AF-07 Repair button.

---

### Current State

No checksum exists for `gam_settings`. Background.js has `_maintTokenAgeCheck` (24h alarm) and `_maintQuotaCheck` (6h alarm) but neither validates the shape or integrity of the settings blob itself.

The existing `_sigHash` in modtools.js (`crypto.subtle.digest('SHA-256', ...)`) is scoped to the content-script world and is not accessible from the background service worker. Background has `crypto.subtle` available natively (Cloudflare Workers runtime — but this is a Chrome extension SW, which runs in the browser's extension worker context, where `crypto.subtle` is also available).

---

### Volatile Fields — Excluded from Checksum

These fields change frequently under normal operation and must be excluded from the checksum to avoid false positives:

```js
const CHECKSUM_VOLATILE_KEYS = new Set([
  'lastTokenPromptAt',      // debounce timestamp, changes weekly
  'lastAiScanDate',         // changes daily
  'customBanHistory',       // changes on every ban with a custom message
  'sync_last_written_at',   // sync bookkeeping timestamp
  'rotated_at',             // changes on rotation
  // internal cache keys that may be persisted:
  'gam_sniff_log',          // not in gam_settings but guard anyway
]);
```

Everything in `SECRET_SETTING_KEYS` (`workerModToken`, `leadModToken`) IS included in the checksum — token replacement (an attack vector) should be detected.

---

### Implementation

**New constants (background.js, after MAINT_WEEKLY constants):**
```js
// v10.5.1 AF-08 Rule 24: settings integrity checksum
const CHECKSUM_KEY = 'gam_settings_checksum';
const CHECKSUM_VOLATILE = new Set([
  'lastTokenPromptAt', 'lastAiScanDate', 'customBanHistory',
  'sync_last_written_at', 'rotated_at'
]);
```

**Checksum computation function (background.js):**
```js
async function _computeSettingsChecksum(settings) {
  try {
    const stable = {};
    for (const [k, v] of Object.entries(settings || {})) {
      if (!CHECKSUM_VOLATILE.has(k)) stable[k] = v;
    }
    // Sort keys for determinism (JSON.stringify key order is insertion-order
    // in V8, but explicit sort guards against future mutation of DEFAULT_SETTINGS
    // reordering entries).
    const sorted = Object.fromEntries(
      Object.entries(stable).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    );
    const encoded = new TextEncoder().encode(JSON.stringify(sorted));
    const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return null; // checksum unavailable; don't gate on it
  }
}
```

**Daily checksum write — add to `_maintTokenAgeCheck` (already runs every 24h) OR create a dedicated routine. Adding to the existing 24h alarm is cleaner than a new alarm:**
```js
async function _maintSettingsChecksumWrite() {
  try {
    const r = await chrome.storage.local.get('gam_settings');
    const s = (r && r.gam_settings) || {};
    const hash = await _computeSettingsChecksum(s);
    if (!hash) return;
    const payload = {
      hash: hash,
      computedAt: Date.now(),
      settingsKeyCount: Object.keys(s).length
    };
    await chrome.storage.local.set({ [CHECKSUM_KEY]: payload });
    await _maintAppendDiag('checksum.write', 'ok', { hash: hash.slice(0, 16) + '...' });
  } catch (e) {
    await _maintAppendDiag('checksum.write', 'err', { error: String(e && e.message || e) });
  }
}
```

Add call to `_maintTokenAgeCheck` at the end of its success path (it already fires every 24h):
```js
await _maintSettingsChecksumWrite();
```

**Boot-time comparison — add to `loadSecrets()` or a new boot hook called from `onInstalled` and `onStartup`:**
```js
async function _maintSettingsChecksumVerify() {
  try {
    const [sr, cr] = await Promise.all([
      chrome.storage.local.get(CHECKSUM_KEY),
      chrome.storage.local.get('gam_settings')
    ]);
    const stored = sr && sr[CHECKSUM_KEY];
    if (!stored || !stored.hash) return; // no checksum yet; first-run OK
    const current = await _computeSettingsChecksum(cr && cr.gam_settings || {});
    if (!current) return; // crypto unavailable; skip
    if (current === stored.hash) {
      await _maintAppendDiag('checksum.boot', 'ok', { match: true });
      return;
    }
    // MISMATCH
    console.warn('[ModTools AF-08] settings checksum mismatch on boot', {
      stored: stored.hash.slice(0, 16),
      current: current.slice(0, 16),
      storedAt: new Date(stored.computedAt).toISOString()
    });
    await _maintAppendDiag('checksum.boot', 'warn', {
      match: false,
      storedHash: stored.hash.slice(0, 16) + '...',
      currentHash: current.slice(0, 16) + '...',
      storedAt: stored.computedAt
    });
    // Set the maint warning flag so the popup surfaces the Repair chip
    await _maintSetWarning({
      code: 'SETTINGS_CHECKSUM_MISMATCH',
      message: 'Settings integrity check failed on boot. Use Repair to restore defaults for any corrupted fields.',
      severity: 'warn',
      firstSeenAt: Date.now()
    });
  } catch (e) {
    // Verification failure is non-fatal — swallow silently
    try { console.warn('[ModTools AF-08] checksum verify error', e.message); } catch (_) {}
  }
}
```

Add call to `onStartup` listener after `loadSecrets()`:
```js
try { await _maintSettingsChecksumVerify(); } catch (e) {}
```

And to `onInstalled` after `loadSecrets()` (for fresh installs and updates — on update, a schema migration may legitimately change the blob, so the mismatch on update is a false positive):
```js
// On update: write a fresh checksum rather than verifying (settings may have
// been legitimately migrated by the schema migrator).
if (details.reason === 'update') {
  try { await _maintSettingsChecksumWrite(); } catch (e) {}
} else {
  try { await _maintSettingsChecksumVerify(); } catch (e) {}
}
```

---

### Repair Integration

The `SETTINGS_CHECKSUM_MISMATCH` warning code surfaces via `_maintSetWarning` into the existing `gam_maint_warning` storage key. The popup's maintenance chip (already implemented) reads this key and displays the warning message. The Repair button in the popup already calls `resetToDefaults` — that existing handler resets `gam_settings` to `DEFAULT_SETTINGS` and triggers a new `_maintSettingsChecksumWrite` to clear the mismatch state.

No new UI is needed. The checksum mismatch warning rides the existing maint-warning chip and the existing Repair button. The only change to popup.js is recognizing `SETTINGS_CHECKSUM_MISMATCH` as a warn-severity code that does NOT require lead auth to dismiss (non-leads can repair their own settings).

---

### False Positive Mitigation

**Schema migrations:** Any `gam_settings` schema migration (new key added to `DEFAULT_SETTINGS`) will change the hash. The `onInstalled` handler writes a fresh checksum on `reason === 'update'` specifically to handle this — migration happens before the checksum write, so the new blob is the baseline.

**Sync writes:** If Rule 22 sync is enabled and remote sync values overwrite local settings, the hash will change. `_syncSettingsApply()` should call `_maintSettingsChecksumWrite()` after applying changes so the stored checksum stays current. Wire:
```js
// At end of _syncSettingsApply(), after chrome.storage.local.set:
try {
  const msg = { type: 'rpc', name: 'maintenanceChecksumRefresh' };
  await chrome.runtime.sendMessage(msg);
} catch (_) {}
```
Add `maintenanceChecksumRefresh` as an RPC that calls `_maintSettingsChecksumWrite()` in background.js.

---

## Summary

| Rule | Status | Action Required |
|---|---|---|
| 22 — chrome.storage.sync mirror | Not implemented | Add `K_SYNC` constant + `_syncSettingsWrite()` + `_syncSettingsApply()` + `storage.onChanged` listener for sync area + Settings UI toggle. Gate behind `sync_settings_enabled` (default OFF). Initial sync set: 5 keys. |
| 23 — WAL audit invariant | Pattern exists and is strong; one bypass found | `appendAuditAction` IS the WAL; pattern is correctly applied on all major mutation paths. Known gap: `mod_modmail_responses` INSERT bypasses audit. Patch: single `appendAuditAction` call before that INSERT. TIER-2 backlog. |
| 24 — Settings checksum | Not implemented | Add `_computeSettingsChecksum()` + `_maintSettingsChecksumWrite()` + `_maintSettingsChecksumVerify()` to background.js. Wire: daily write in 24h alarm, boot verify in `onStartup`/`onInstalled`. Repair surfaces via existing maint-warning chip. |

**Files to patch:**
- `modtools.js` — Rule 22: `K_SYNC` constant, `_syncSettingsWrite()`, `_syncSettingsApply()`, `storage.onChanged` sync listener, Settings UI toggle, `sync_settings_enabled` default in `DEFAULT_SETTINGS`.
- `background.js` — Rule 24: `CHECKSUM_KEY` constant, `CHECKSUM_VOLATILE` set, `_computeSettingsChecksum()`, `_maintSettingsChecksumWrite()`, `_maintSettingsChecksumVerify()`, `maintenanceChecksumRefresh` RPC, wire into `onInstalled`/`onStartup`/24h alarm. Rule 22: `maintenanceChecksumRefresh` RPC handler.
- `gaw-mod-proxy-v2.js` — Rule 23: `appendAuditAction` before `mod_modmail_responses` INSERT.
