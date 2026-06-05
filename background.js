// GAW ModTools - Background Service Worker
// v5.8.2: adds auto-reload-on-update via chrome.alarms.
// v7.2: adds secret vault + workerFetch relay (platformHardening flag-on).
// v9.3.14 (Vanguard C-3): REMOVED auto chrome.runtime.reload() supply-chain
//   primitive. The pre-fix flow (poll GitHub raw version.json -> reload
//   extension on mismatch) was a single-account-compromise -> mass-RCE
//   vector: a push to the shared GitHub repo would, on the next 30-min
//   alarm, force every installed extension to reload from on-disk files
//   that the same scheduled task had already overwritten from the same
//   account. NEW flow is notification-only:
//     * Poll worker /version every 30min (no GitHub URL in extension code).
//     * On mismatch, write `gam_update_available` flag to chrome.storage.local.
//     * Content script reads the flag at init and renders the existing
//       .gam-update-banner with a "Reload" button that opens
//       chrome://extensions/?id=<extension-id> -- the user must click
//       the reload arrow themselves.
//   No auto-reload. No GitHub raw URL. RCE primitive eliminated.
// v9.3.14 (Vanguard L-3): version-check URL moved off raw.githubusercontent.com
//   (which leaked the maintainer's GitHub username `catsfive1`) to the
//   already-existing worker `/version` endpoint, which proxies the same
//   shared-flags repo file. Net effect: extension binary no longer contains
//   the maintainer's GitHub handle.

const WORKER_BASE_FOR_VERSION = 'https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev';
const VERSION_JSON_URL = `${WORKER_BASE_FOR_VERSION}/version`;
const ALARM_NAME = 'gam_update_check';
const ALARM_PERIOD_MIN = 30;
// v9.4.4: poll for open bug reports for the toolbar badge. Lead/visible-mod
// only; harmless 403 for un-allowlisted mods.
const BUG_POLL_ALARM = 'gam_bug_poll';
const BUG_POLL_PERIOD_MIN = 5;
// v9.5.0 MAINTENANCE MODE alarms. None is destructive: each writes a flag /
// trims a cache. Click-only routines (cookie clear, reset to defaults) stay
// click-only, never alarm-driven.
const MAINT_QUOTA_ALARM = 'gam_maint_quota_check';
const MAINT_QUOTA_PERIOD_MIN = 360;            // every 6h
const MAINT_TOKEN_AGE_ALARM = 'gam_maint_token_age';
const MAINT_TOKEN_AGE_PERIOD_MIN = 1440;       // every 24h
const MAINT_DIAG_ROTATE_ALARM = 'gam_maint_diag_rotate';
const MAINT_DIAG_ROTATE_PERIOD_MIN = 1440;     // every 24h
const MAINT_INTEL_EVICT_ALARM = 'gam_maint_intel_evict';
const MAINT_INTEL_EVICT_PERIOD_MIN = 30;       // every 30 min
// v9.5.0 autonomous weekly maintenance run. Fires the non-destructive
// subset of the popup's 12 routines AND uploads the aggregate report to the
// worker for Llama analysis. Hard-coded 7d cadence (10080 min). Click-only
// destructive routines (cookie clear, reset to defaults, schema migrate,
// log purge) are NEVER fired by this handler.
const MAINT_WEEKLY_ALARM = 'gam_maint_weekly_run';
const MAINT_WEEKLY_PERIOD_MIN = 60 * 24 * 7;   // every 7 days
// AF-05 (Rule 14): SW health heartbeat — logs vault status + storage usage every 5 min.
const HEALTH_ALARM = 'gam_health';
const HEALTH_PERIOD_MIN = 5;
// v10.10.0 S4: auto-action poll alarm constants.
const AUTO_POLL_ALARM = 'gam_auto_action_poll';
const AUTO_POLL_PERIOD_MIN = 1; // 1 minute -- worker cron runs every 5 min so 1-min poll is responsive without overload
// v10.11 T2 (REDTEAM-1): inactivity lock alarm -- fires every 5 min and checks elapsed idle time.
const INACTIVITY_LOCK_ALARM = 'gam_inactivity_lock';
const INACTIVITY_LOCK_PERIOD_MIN = 5;
// v10.16.34 (Grok #16) proactive alerts -- endpoint may not exist yet; 404 is silently swallowed.
const AI_PROACTIVE_ALARM = 'gam_ai_proactive';
const AI_PROACTIVE_PERIOD_MIN = 10;
// Storage / log shape constants kept in sync with popup.js + modtools.js.
const MAINT_DIAG_KEY = 'gam_diag_log';
const MAINT_DIAG_MAX = 500;
const MAINT_INTEL_KEY = 'gam_profile_intel';
const MAINT_INTEL_MAX_AGE_MS = 48 * 60 * 60 * 1000;  // 48h
const MAINT_QUOTA_BYTES = 5 * 1024 * 1024;
const MAINT_QUOTA_THRESHOLD_PCT = 80;
const MAINT_TOKEN_AGE_WARN_DAYS = 60;
const MAINT_WARNING_KEY = 'gam_maint_warning';
// v9.3.14 (Vanguard C-3): if a banner has been ignored for >7d, escalate
// from silent storage flag to a console.warn so a forensic check sees it.
const UPDATE_NAG_WARN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// --- v7.2 Platform Hardening BEGIN ---
// Secret vault in service-worker RAM + chrome.storage.session. When the
// content script's hardening flag is on it sends {type:'setTokens', ...} to
// this worker; every subsequent {type:'workerFetch', ...} attaches the stored
// tokens server-side so the page never holds auth material.
//
// Regression-guard: every v7.2 message handler is additive. Existing
// 'ping' behaviour (legacy v5.8.1+) is unchanged. If the content script
// never sends setTokens/workerFetch (flag off), this whole subsystem is
// inert memory.

const WORKER_BASE = 'https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev';
// v5.0-Phase-1 complete: all endpoints now have named RPC handlers.
// ALLOWED_ENDPOINTS is kept ONLY for /admin/import-tokens-from-kv which has
// no content-script caller but a direct popup path that predates v5.0.
// All other paths are intentionally removed -- the workerFetch handler will
// reject them with a hard error to surface any missed migration.
const ALLOWED_ENDPOINTS = [
  '/admin/import-tokens-from-kv'
];

let secretCache = { workerModToken: '', leadModToken: '' };

// =============================================================================
// v10.11 T1 (REDTEAM-1): AES-GCM-256 device-key encryption for durable token storage.
// Tokens in chrome.storage.local are encrypted at rest. The CryptoKey lives in
// IndexedDB (gam_crypt_db / keys / device-v1) with extractable:false so it can
// never be exfiltrated even by an attacker who can read extension IDB.
// Secret flow: IDB CryptoKey -> AES-GCM encrypt -> base64 ciphertext + IV
// stored in gam_settings.workerModToken_encrypted / leadModToken_encrypted.
// Plaintext fields are removed after successful migration.
// =============================================================================

// -- IDB helpers (thin wrapper, no external deps) --

function _idbOpen() {
  return new Promise(function(resolve, reject) {
    try {
      var req = indexedDB.open('gam_crypt_db', 1);
      req.onupgradeneeded = function(e) {
        try { e.target.result.createObjectStore('keys'); } catch (_) {}
      };
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror = function(e) { reject(new Error('IDB open error: ' + (e.target && e.target.error && e.target.error.message || 'unknown'))); };
    } catch (e) { reject(e); }
  });
}

function _idbGet(db, store, key) {
  return new Promise(function(resolve, reject) {
    try {
      var tx = db.transaction(store, 'readonly');
      var req = tx.objectStore(store).get(key);
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror = function(e) { reject(new Error('IDB get error: ' + (e.target && e.target.error && e.target.error.message || 'unknown'))); };
    } catch (e) { reject(e); }
  });
}

function _idbPut(db, store, key, value) {
  return new Promise(function(resolve, reject) {
    try {
      var tx = db.transaction(store, 'readwrite');
      var req = tx.objectStore(store).put(value, key);
      req.onsuccess = function() { resolve(); };
      req.onerror = function(e) { reject(new Error('IDB put error: ' + (e.target && e.target.error && e.target.error.message || 'unknown'))); };
    } catch (e) { reject(e); }
  });
}

// Module-scope device key cache (lasts the SW lifecycle; re-loaded from IDB on boot)
let _deviceKey = null;
// Track IDB availability for _cryptHealth
let _idbAvailable = null;

// -- _cryptInit: get-or-create device key persisted in IDB --
async function _cryptInit() {
  if (_deviceKey) return _deviceKey;
  try {
    var db = await _idbOpen();
    _idbAvailable = true;
    var stored = await _idbGet(db, 'keys', 'device-v1');
    if (stored && stored instanceof CryptoKey) {
      _deviceKey = stored;
      return _deviceKey;
    }
    // Generate new non-extractable AES-GCM-256 key
    var key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,          // extractable: false -- key cannot be exported, ever
      ['encrypt', 'decrypt']
    );
    await _idbPut(db, 'keys', 'device-v1', key);
    _deviceKey = key;
    return _deviceKey;
  } catch (e) {
    _idbAvailable = false;
    _deviceKey = null;
    throw new Error('_cryptInit failed: ' + (e && e.message || String(e)));
  }
}

// -- _cryptEncrypt: encrypt plaintext string, return {ct, iv, alg} --
async function _cryptEncrypt(plaintext) {
  var key = await _cryptInit();
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var enc = new TextEncoder();
  var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(plaintext));
  // Base64-encode both iv and ciphertext for JSON storage
  var ivB64 = btoa(String.fromCharCode.apply(null, iv));
  var ctArr = new Uint8Array(ct);
  var ctB64 = btoa(String.fromCharCode.apply(null, ctArr));
  return { ct: ctB64, iv: ivB64, alg: 'AES-GCM-256-v1' };
}

// -- _cryptDecrypt: decrypt {ct, iv, alg} blob, return plaintext string --
async function _cryptDecrypt(blob) {
  if (!blob || !blob.ct || !blob.iv || !blob.alg) throw new Error('invalid encrypted blob shape');
  var key = await _cryptInit();
  var ivArr = new Uint8Array(atob(blob.iv).split('').map(function(c) { return c.charCodeAt(0); }));
  var ctArr = new Uint8Array(atob(blob.ct).split('').map(function(c) { return c.charCodeAt(0); }));
  var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivArr }, key, ctArr);
  return new TextDecoder().decode(plain);
}

// -- _cryptIsEncrypted: true if value has the encrypted blob shape --
function _cryptIsEncrypted(value) {
  return !!(value && typeof value === 'object' && typeof value.ct === 'string' && typeof value.iv === 'string' && value.alg === 'AES-GCM-256-v1');
}

// -- _cryptMigrateSettings: encrypts any plaintext token fields in gam_settings --
// Safe to call multiple times; skips if already encrypted or already migrated.
async function _cryptMigrateSettings() {
  try {
    // Check migration flag
    var flagR = await chrome.storage.local.get('gam_crypt_migrated_v1');
    if (flagR && flagR.gam_crypt_migrated_v1) return; // already migrated

    var r = await chrome.storage.local.get('gam_settings');
    var s = (r && r.gam_settings) || {};
    var changed = false;
    var patch = Object.assign({}, s);

    // Migrate workerModToken
    // v10.11.1 HOTFIX: do NOT delete plaintext after encrypting. If decrypt later
    // fails (CryptoKey-from-IDB clone state issue, key rotation, etc.) the
    // token would be lost forever. Keep plaintext as safety net; loadSecrets
    // prefers plaintext anyway. Plaintext deletion deferred to v10.12+ once
    // round-trip decrypt is verified across SW restarts.
    if (typeof s.workerModToken === 'string' && s.workerModToken.length > 0 && !_cryptIsEncrypted(s.workerModToken_encrypted)) {
      try {
        patch.workerModToken_encrypted = await _cryptEncrypt(s.workerModToken);
        // (intentionally NOT deleting patch.workerModToken — keep plaintext as fallback)
        changed = true;
      } catch (e) {
        try { console.warn('[ModTools v10.11 CRYPT] workerModToken encrypt failed:', e.message); } catch (_) {}
      }
    }

    // Migrate leadModToken — v10.11.1 HOTFIX: keep plaintext as safety net (see workerModToken comment)
    if (typeof s.leadModToken === 'string' && s.leadModToken.length > 0 && !_cryptIsEncrypted(s.leadModToken_encrypted)) {
      try {
        patch.leadModToken_encrypted = await _cryptEncrypt(s.leadModToken);
        // (intentionally NOT deleting patch.leadModToken — keep plaintext as fallback)
        changed = true;
      } catch (e) {
        try { console.warn('[ModTools v10.11 CRYPT] leadModToken encrypt failed:', e.message); } catch (_) {}
      }
    }

    if (changed) {
      await chrome.storage.local.set({ gam_settings: patch });
      try { console.log('[ModTools v10.11 CRYPT] token migration complete'); } catch (_) {}
    }

    // Set migration flag regardless so we don't re-scan on every boot
    await chrome.storage.local.set({ gam_crypt_migrated_v1: Date.now() });
  } catch (e) {
    try { console.warn('[ModTools v10.11 CRYPT] migration error:', e.message); } catch (_) {}
  }
}

// -- _cryptHealth: diagnostic probe for popup Diag tab --
async function _cryptHealth() {
  try {
    var cryptKeyPresent = !!_deviceKey;
    // Probe IDB if not already known
    if (_idbAvailable === null) {
      try { await _idbOpen(); _idbAvailable = true; } catch (_) { _idbAvailable = false; }
    }
    var r = await chrome.storage.local.get('gam_settings');
    var s = (r && r.gam_settings) || {};
    var encryptedTokensFound = (_cryptIsEncrypted(s.workerModToken_encrypted) ? 1 : 0) + (_cryptIsEncrypted(s.leadModToken_encrypted) ? 1 : 0);
    var plaintextTokensFound = ((typeof s.workerModToken === 'string' && s.workerModToken.length > 0) ? 1 : 0) + ((typeof s.leadModToken === 'string' && s.leadModToken.length > 0) ? 1 : 0);
    var migR = await chrome.storage.local.get('gam_crypt_migrated_v1');
    return {
      cryptKeyPresent: cryptKeyPresent,
      idbAvailable: !!_idbAvailable,
      encryptedTokensFound: encryptedTokensFound,
      plaintextTokensFound: plaintextTokensFound,
      lastMigrationTs: (migR && migR.gam_crypt_migrated_v1) || null
    };
  } catch (e) {
    return { cryptKeyPresent: false, idbAvailable: false, encryptedTokensFound: 0, plaintextTokensFound: 0, lastMigrationTs: null, error: String(e && e.message || e) };
  }
}

// =============================================================================
// v10.11 T2 (REDTEAM-1): Inactivity timeout + forced re-auth.
// Opt-in via gam_settings.lock_after_minutes (0 = disabled, default).
// Every onMessage call bumps gam_last_activity_ts in chrome.storage.session.
// The INACTIVITY_LOCK_ALARM (every 5 min) checks elapsed time and zeroes
// secretCache + session storage if the threshold is exceeded.
// =============================================================================

async function _inactivityBumpActivity() {
  try {
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.set({ gam_last_activity_ts: Date.now() });
    }
  } catch (_) {}
}

async function _inactivityLockCheck() {
  try {
    var r = await chrome.storage.local.get('gam_settings');
    var s = (r && r.gam_settings) || {};
    var lockAfterMinutes = parseInt(s.lock_after_minutes, 10) || 0;
    if (lockAfterMinutes <= 0) return; // feature disabled

    var actR = await chrome.storage.session.get('gam_last_activity_ts');
    var lastTs = (actR && actR.gam_last_activity_ts) || 0;
    var idleMs = Date.now() - lastTs;
    var thresholdMs = lockAfterMinutes * 60 * 1000;

    if (lastTs > 0 && idleMs > thresholdMs) {
      // Lock: zero secretCache and session storage.
      secretCache = { workerModToken: '', leadModToken: '' };
      try {
        if (chrome.storage && chrome.storage.session) {
          await chrome.storage.session.remove('gam_settings');
          await chrome.storage.session.remove('gam_last_activity_ts');
        }
      } catch (_) {}
      // Broadcast "locked" state to all popup/content pages.
      try {
        chrome.runtime.sendMessage({ type: 'gamLocked', reason: 'inactivity' }).catch(function() {});
      } catch (_) {}
      try { console.warn('[ModTools v10.11 T2] inactivity lock triggered after', Math.round(idleMs / 60000), 'min idle'); } catch (_) {}
      try { await _maintAppendDiag('inactivity.lock', 'locked', { idleMinutes: Math.round(idleMs / 60000), thresholdMinutes: lockAfterMinutes }); } catch (_) {}
    }
  } catch (_) {}
}

// v7.2 CHUNK 14: allow content scripts to read/write chrome.storage.session
// so invite codes staged from a GAW page (content script) can be consumed
// from the popup. setAccessLevel is session-lifetime; calling it on install
// AND startup keeps it armed across SW evictions. No-op on older Chrome
// builds (wrapped try/catch).
//
// v10.12.1 PA.5 NOTE: TRUSTED_AND_UNTRUSTED_CONTEXTS is kept intentionally.
// Switching to TRUSTED_CONTEXTS would break 25+ content-script chrome.storage.session
// reads/writes in modtools.js (gam_macro_drafts, gam_modmail_drafts, gam_tard_suggestions,
// K_SETTINGS hydration, etc.). Those must be migrated to named RPC handlers first.
// See cross-file dependency in PERF-A-BG report. Infrastructure for the restricted
// path is ready below and should be activated once modtools.js is rerouted.
async function __ensureSessionAccess(){
  try {
    if (chrome.storage && chrome.storage.session && typeof chrome.storage.session.setAccessLevel === 'function'){
      await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
    }
  } catch (e) { /* older Chrome: access-level API absent; content script will fail gracefully */ }
}

// v10.12.1 PA.5: restrict session storage to trusted (background) contexts only.
// DEFERRED — activate after modtools.js content-script session reads are RPC-routed.
// Uncomment the body below and remove the __ensureSessionAccess TRUSTED_AND_UNTRUSTED
// call to enable. Both onInstalled and onStartup call this so it survives SW eviction.
async function _ensureSessionAccessRestricted(){
  try {
    if (chrome.storage && chrome.storage.session && chrome.storage.session.setAccessLevel) {
      await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    }
  } catch (_) {}
}

// v10.7.3: module-scope SemVer comparison for update-flag staleness checks.
// Was inline in the alarm handler in v10.7.2 -- promoted so loadSecrets and
// verifyUpdateFlag can also detect a stale flag and purge it instead of
// waiting 30min for the next alarm tick.
function _semverCmp(a, b) {
  const pa = String(a).replace(/^v/,'').split('.').map(n=>parseInt(n)||0);
  const pb = String(b).replace(/^v/,'').split('.').map(n=>parseInt(n)||0);
  for (let i=0; i<Math.max(pa.length,pb.length); i++){
    const x=pa[i]||0, y=pb[i]||0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// v10.12.3 (Vanguard audit-2 #4): singleton-promise wrapper. _initOnce() at
// L460 protects the cold-boot path with its own _initReady cache, but the
// 14+ direct `await loadSecrets()` call sites (alarm handlers, repair
// actions, RPC pre-flight, settings.onChanged hooks) can each fire a
// concurrent chrome.storage.local read on SW wake. The singleton collapses
// concurrent calls to one in-flight read and clears the cache on settle so
// later cache-invalidation calls re-fetch.
let _loadSecretsPromise = null;
async function loadSecrets() {
  if (_loadSecretsPromise) return _loadSecretsPromise;
  _loadSecretsPromise = (async () => {
  try {
    let s = {};
    if (chrome.storage && chrome.storage.session) {
      const out = await chrome.storage.session.get('gam_settings');
      s = (out && out.gam_settings) || {};
    }
    // Fallback to durable local settings if session storage is empty (e.g.
    // service-worker restart or browser restart before popup re-sync).
    // v10.11 T1 (REDTEAM-1): decrypt encrypted token blobs from local storage.
    if ((!s.workerModToken && !s.leadModToken) && chrome.storage && chrome.storage.local) {
      try {
        const localOut = await chrome.storage.local.get('gam_settings');
        const ls = (localOut && localOut.gam_settings) || {};

        // Attempt decrypt for each token; fall through to plaintext if decrypt fails.
        let workerPlain = '';
        let leadPlain = '';

        // v10.11.1 HOTFIX: prefer plaintext FIRST. The v10.11.0 release tried
        // encrypted first and zeroed the token on decrypt failure -- which
        // happens when CryptoKey-from-IDB structured-clone state is lost
        // across SW restarts. Result: forced re-auth on every load. Now:
        // try plaintext first (always reliable); fall back to decrypt only
        // when plaintext is missing. The migration patch in v10.11.1 also
        // STOPS deleting plaintext after encryption, so plaintext is always
        // the safety net.
        if (typeof ls.workerModToken === 'string' && ls.workerModToken.length > 0) {
          workerPlain = ls.workerModToken;
        } else if (_cryptIsEncrypted(ls.workerModToken_encrypted)) {
          try {
            workerPlain = await _cryptDecrypt(ls.workerModToken_encrypted);
          } catch (e) {
            try { console.warn('[ModTools v10.11.1 CRYPT] workerModToken decrypt failed, no plaintext fallback:', e.message); } catch (_) {}
            workerPlain = '';
          }
        }

        if (typeof ls.leadModToken === 'string' && ls.leadModToken.length > 0) {
          leadPlain = ls.leadModToken;
        } else if (_cryptIsEncrypted(ls.leadModToken_encrypted)) {
          try {
            leadPlain = await _cryptDecrypt(ls.leadModToken_encrypted);
          } catch (e) {
            try { console.warn('[ModTools v10.11.1 CRYPT] leadModToken decrypt failed, no plaintext fallback:', e.message); } catch (_) {}
            leadPlain = '';
          }
        }

        s = { workerModToken: workerPlain, leadModToken: leadPlain };
      } catch (e) {}
    }
    secretCache = {
      workerModToken: s.workerModToken || '',
      leadModToken: s.leadModToken || ''
    };
    // AF-01 P1 fix: restore _UPDATE_FLAG_LAST_SET from durable storage so the
    // update banner survives SW termination. Without this, verifyUpdateFlag
    // returns ok:false after every SW restart until the next alarm fires (~30m).
    //
    // v10.7.3: ALSO detect stale flag (local >= flag.to) and PURGE it on boot
    // instead of restoring + waiting 30min for the alarm to clear it. This is
    // the self-heal path for the v10.7.2 -> v10.7.3 transition: mods who had
    // a stale "9.8.0" flag from the pre-fix code path see the flag cleared
    // immediately on the first SW boot of the new build.
    try {
      if (chrome.storage && chrome.storage.local) {
        const flagOut = await chrome.storage.local.get('gam_update_available');
        const flagPayload = flagOut && flagOut.gam_update_available;
        if (flagPayload && flagPayload.to) {
          const _local = chrome.runtime.getManifest().version;
          if (_semverCmp(_local, flagPayload.to) >= 0) {
            // Local is current or newer than flag.to. Stale -- purge it.
            try { await chrome.storage.local.remove('gam_update_available'); } catch (_) {}
            _UPDATE_FLAG_LAST_SET = null;
          } else {
            _UPDATE_FLAG_LAST_SET = flagPayload;
          }
        }
      }
    } catch (_) {}
  } catch (e) { /* service-worker may have been evicted; cache stays empty */ }
  })();
  _loadSecretsPromise.finally(() => { _loadSecretsPromise = null; });
  return _loadSecretsPromise;
}

// v10.12.1 PA.2: gate RPC on init-ready to fix cold-boot 401 race
// _initOnce() returns a promise that resolves after _cryptInit + loadSecrets
// complete. Idempotent: second call returns the cached promise immediately.
let _initReady = null;
function _initOnce() {
  if (!_initReady) {
    _initReady = (async () => {
      try { await _cryptInit(); } catch (_) {}
      try { await loadSecrets(); } catch (_) {}
    })();
  }
  return _initReady;
}

// v10.12.1 PA.4 (rev. v10.13 — eviction-safe): gam_settings writes go through
// an in-flight Promise chain instead of setTimeout. MV3 service workers can
// evict mid-setTimeout, losing buffered patches. A pending await holds the SW
// alive until the write lands; that's the MV3-correct shape for sub-second
// coalescing. Empirical amplification is still bounded because rapid successive
// setSetting() calls all share the same in-flight Promise via the buffer.
let _settingsWriteBuffer = null;
let _settingsWriteInflight = null;

async function _settingsCoalescedSet(patch) {
  if (!_settingsWriteBuffer) {
    try {
      var cur = await chrome.storage.local.get('gam_settings');
      _settingsWriteBuffer = (cur && cur.gam_settings) || {};
    } catch (_) { _settingsWriteBuffer = {}; }
  }
  Object.assign(_settingsWriteBuffer, patch);
  if (!_settingsWriteInflight) {
    _settingsWriteInflight = (async function() {
      // Yield once via microtask + macrotask so subsequent same-tick patches coalesce.
      await new Promise(function(resolve) { Promise.resolve().then(resolve); });
      var toWrite = _settingsWriteBuffer;
      _settingsWriteBuffer = null;
      _settingsWriteInflight = null;
      try { await chrome.storage.local.set({ gam_settings: toWrite }); } catch (e) {
        try { console.warn('[ModTools PA.4] settings-coalesce write failed:', e && e.message || e); } catch (_) {}
      }
    })();
  }
  return _settingsWriteInflight;
}

// Force-flush on critical writes (token rotation, auth flow).
// With Promise-chain coalescing, awaiting the in-flight write IS the flush.
async function _settingsCoalescedFlush() {
  if (_settingsWriteInflight) {
    try { await _settingsWriteInflight; } catch (_) {}
  } else if (_settingsWriteBuffer) {
    // Edge case: buffer present but no in-flight (shouldn't happen with the above shape).
    var toWrite = _settingsWriteBuffer;
    _settingsWriteBuffer = null;
    try { await chrome.storage.local.set({ gam_settings: toWrite }); } catch (e) {
      try { console.warn('[ModTools PA.4] settings-coalesce flush failed:', e && e.message || e); } catch (_) {}
    }
  }
}

// v10.12.1 PA.3: gam_diag_log -> IndexedDB to eliminate JSON-stringify storm
// on chrome.storage.local. Falls back to the old path if IDB unavailable.
const DIAG_DB_NAME = 'gam_diag_db';
const DIAG_STORE = 'entries';

function _diagDbOpen() {
  return new Promise(function(resolve, reject) {
    try {
      var req = indexedDB.open(DIAG_DB_NAME, 1);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(DIAG_STORE)) {
          var store = db.createObjectStore(DIAG_STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('ts', 'ts');
        }
      };
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror = function(e) { reject(e.target.error); };
    } catch (e) { reject(e); }
  });
}

async function _diagAppend(entry) {
  try {
    var db = await _diagDbOpen();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(DIAG_STORE, 'readwrite');
      tx.objectStore(DIAG_STORE).add(entry);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function(e) { reject(e.target.error); };
    });
  } catch (_) {
    // IDB unavailable: fall back to chrome.storage.local (keep ring buffer cap at 500)
    try {
      chrome.storage.local.get('gam_diag_log').then(function(r) {
        var log = (r.gam_diag_log || []).slice(-499);
        log.push(entry);
        chrome.storage.local.set({ gam_diag_log: log }).catch(function() {});
      }).catch(function() {});
    } catch (_2) {}
  }
}

async function _diagPrune(maxAgeDays, capCount) {
  if (maxAgeDays === undefined) { maxAgeDays = 7; }
  if (capCount === undefined) { capCount = 1000; }
  try {
    var db = await _diagDbOpen();
    var cutoff = Date.now() - maxAgeDays * 86400000;
    return new Promise(function(resolve) {
      var tx = db.transaction(DIAG_STORE, 'readwrite');
      var idx = tx.objectStore(DIAG_STORE).index('ts');
      var range = IDBKeyRange.upperBound(cutoff);
      idx.openCursor(range).onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      tx.oncomplete = function() { resolve(); };
    });
  } catch (_) {}
}

async function _diagReadRecent(limit) {
  if (limit === undefined) { limit = 500; }
  try {
    var db = await _diagDbOpen();
    return new Promise(function(resolve) {
      var out = [];
      var tx = db.transaction(DIAG_STORE, 'readonly');
      var idx = tx.objectStore(DIAG_STORE).index('ts');
      idx.openCursor(null, 'prev').onsuccess = function(e) {
        var cursor = e.target.result;
        if (cursor && out.length < limit) { out.push(cursor.value); cursor.continue(); }
        else { resolve(out); }
      };
      tx.onerror = function() { resolve(out); };
    });
  } catch (_) {
    // IDB unavailable: read from legacy storage.local path
    try {
      var r = await chrome.storage.local.get('gam_diag_log');
      return (r.gam_diag_log || []).slice(-limit);
    } catch (_2) { return []; }
  }
}

// One-shot migration: copy existing gam_diag_log entries from storage.local into IDB
async function _diagMigrateFromStorage() {
  try {
    var flagR = await chrome.storage.local.get('gam_diag_migrated_v1');
    if (flagR && flagR.gam_diag_migrated_v1) { return; } // already done
    var r = await chrome.storage.local.get('gam_diag_log');
    var entries = (r && r.gam_diag_log) || [];
    if (entries.length > 0) {
      var db = await _diagDbOpen();
      await new Promise(function(resolve) {
        var tx = db.transaction(DIAG_STORE, 'readwrite');
        var store = tx.objectStore(DIAG_STORE);
        entries.forEach(function(e) { try { store.add(e); } catch (_) {} });
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { resolve(); };
      });
    }
    await chrome.storage.local.remove('gam_diag_log');
    await chrome.storage.local.set({ gam_diag_migrated_v1: Date.now() });
  } catch (_) {}
}

// AF-03 Rule 7: global error handlers for unhandled promise rejections and errors.
// Writes to chrome.storage.local gam_diag_log (same shape as _maintAppendDiag)
// so failures are visible in the debug snapshot across SW evictions.
self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = (reason && reason.message) ? reason.message : String(reason);
  const stack = (reason && reason.stack) ? reason.stack : null;
  console.warn('[ModTools-SW] Unhandled rejection:', msg, stack);
  // v10.12.1 PA.3: write to IDB diag store instead of storage.local
  try {
    const entry = { ts: Date.now(), iso: new Date().toISOString(), cat: 'unhandledrejection', msg, stack, v: 'v10.5.1' };
    _diagAppend(entry).catch(function() {});
  } catch (_) {}
});

self.addEventListener('error', (event) => {
  const msg = (event.message) ? event.message : String(event);
  const stack = (event.error && event.error.stack) ? event.error.stack : null;
  console.warn('[ModTools-SW] Uncaught error:', msg, stack);
  // v10.12.1 PA.3: write to IDB diag store instead of storage.local
  try {
    const entry = { ts: Date.now(), iso: new Date().toISOString(), cat: 'uncaught-error', msg, stack, v: 'v10.5.1' };
    _diagAppend(entry).catch(function() {});
  } catch (_) {}
});

function pathAllowed(path) {
  if (!path || typeof path !== 'string') return false;
  for (const prefix of ALLOWED_ENDPOINTS) {
    if (path === prefix || path.startsWith(prefix + '/') ||
        path === prefix + '/' || path.startsWith(prefix + '?')) {
      return true;
    }
  }
  return false;
}
// --- v7.2 Platform Hardening END ---

// AF-04 Rule 11 / AF-38 (Rule 112): SW boot ring buffer. Written on every SW wake
// (install + startup). Keyed gam_sw_boots, capped at 50 entries.
// v10.6.0 fields added: ua, tier, bytesInUse, boot_count.
async function _recordSwBoot(reason) {
  try {
    const ver = chrome.runtime.getManifest().version;
    const ua  = navigator.userAgent;
    const ts  = new Date().toISOString();

    // Tier probe: check gam_settings for isLeadMod / workerModToken.
    var tier = 'unknown';
    try {
      var tierR = await chrome.storage.local.get('gam_settings');
      var tierS = (tierR && tierR.gam_settings) || {};
      if (tierS.isLeadMod)          tier = 'lead';
      else if (tierS.workerModToken) tier = 'mod';
      else                           tier = 'anon';
    } catch (_) {}

    // Storage pressure snapshot.
    var bytesInUse = -1;
    try {
      bytesInUse = await new Promise(function(res, rej) {
        chrome.storage.local.getBytesInUse(null, function(n) {
          if (chrome.runtime.lastError) { rej(chrome.runtime.lastError); return; }
          res(n);
        });
      });
    } catch (_) {}

    // Boot counter (monotonic from ring-buffer length + 1).
    const raw = await chrome.storage.local.get('gam_sw_boots');
    const boots = (raw && Array.isArray(raw.gam_sw_boots)) ? raw.gam_sw_boots : [];
    const bootCount = boots.length + 1;

    const entry = { v: ver, ts, reason: reason || 'unknown', ua, tier, bytesInUse, boot_count: bootCount };
    boots.push(entry);
    if (boots.length > 50) boots.splice(0, boots.length - 50);
    await chrome.storage.local.set({ gam_sw_boots: boots });
    console.log('[modtools v' + ver + '] SW boot #' + bootCount + ' at ' + ts +
      ' reason=' + reason + ' tier=' + tier + ' storage=' + bytesInUse + 'B ua=' + ua);
  } catch (e) { /* non-fatal -- boot log is diagnostic only */ }
}

// AF-04 Rule 10: generic exponential-backoff helper.
// opts: { base=100, cap=8000, maxAttempts=3 } (ms)
async function withBackoff(fn, opts) {
  const base = (opts && opts.base) || 100;
  const cap  = (opts && opts.cap)  || 8000;
  const max  = (opts && opts.maxAttempts) || 3;
  let lastErr;
  for (var attempt = 0; attempt < max; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt < max - 1) {
        const delay = Math.min(cap, base * Math.pow(2, attempt)) + Math.random() * base;
        await new Promise(function(res) { setTimeout(res, delay); });
      }
    }
  }
  throw lastErr;
}

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[ModTools] Installed:', details.reason);
  await _recordSwBoot(details.reason || 'install');

  // v10.16.30 (Grok #34): register the uninstall feedback URL. The worker's
  // /uninstall endpoint accepts ONLY version + reason params -- no token, no
  // user, no identifying info. Privacy-safe; intent is aggregate "we lost N
  // installs this week" diagnostic and a chance to ask why. If the worker
  // doesn't have the endpoint deployed yet, Chrome still opens the URL on
  // uninstall and the worker just returns 404 -- benign.
  try {
    const __ver = chrome.runtime.getManifest().version;
    chrome.runtime.setUninstallURL(WORKER_BASE + '/uninstall?v=' + encodeURIComponent(__ver), () => {
      if (chrome.runtime.lastError) {
        try { console.warn('[ModTools v10.16.30] setUninstallURL:', chrome.runtime.lastError.message); } catch (_) {}
      }
    });
  } catch (e) { try { console.warn('[ModTools v10.16.30] setUninstallURL throw:', e.message); } catch (_) {} }

  // AF-09 (Rule 27): on version update, invalidate the gam_profile_intel cache.
  // Session storage (gam_modmail_drafts) is auto-cleared by SW termination on update.
  // gam_profile_intel persists across updates and must be purged explicitly
  // so stale AI analysis results don't survive the update boundary.
  if (details.reason === 'update') {
    try {
      await chrome.storage.local.remove(MAINT_INTEL_KEY);
      console.log('[ModTools AF-09] update: purged gam_profile_intel cache');
      var purgeEntry = {
        ts: new Date().toISOString(),
        cat: 'maint.updatePurge',
        msg: 'version update: purged gam_profile_intel',
        extra: { fromVersion: details.previousVersion || 'unknown' }
      };
      var purgeR = await chrome.storage.local.get(MAINT_DIAG_KEY);
      var purgeLog = purgeR[MAINT_DIAG_KEY] || [];
      purgeLog.push(purgeEntry);
      if (purgeLog.length > MAINT_DIAG_MAX) purgeLog.splice(0, purgeLog.length - MAINT_DIAG_MAX);
      await chrome.storage.local.set({ [MAINT_DIAG_KEY]: purgeLog });
    } catch (e) {
      console.warn('[ModTools AF-09] update purge failed:', e);
    }
    // AF-39 (Rule 116): signal popup to show "What's New" panel on first open after update.
    try {
      await chrome.storage.local.set({ gam_show_whats_new: chrome.runtime.getManifest().version });
    } catch (_) {}
    // AF-08 (Rule 24): on update, write a fresh checksum (migration may have changed settings).
    // Verify-on-update would be a false positive; write fresh baseline instead.
    try { await _maintSettingsChecksumWrite(); } catch (_) {}
    // AF-40 (Rule 118): self-diagnostics on update.
    try { await _runUpdateDiagnostics(); } catch (_) {}
  } else {
    // On fresh install, just verify (no prior checksum = first-run OK, silent).
    try { await _maintSettingsChecksumVerify(); } catch (_) {}
  }

  // (Re)create the recurring update-check alarm on install/update
  // v10.12.1 PA.1: jitter to prevent thundering herd across 15-mod fleet
  try {
    chrome.alarms.create(ALARM_NAME, { delayInMinutes: ALARM_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: ALARM_PERIOD_MIN });
    chrome.alarms.create(BUG_POLL_ALARM, { delayInMinutes: BUG_POLL_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: BUG_POLL_PERIOD_MIN });
    // v9.5.0 maintenance alarms.
    chrome.alarms.create(MAINT_QUOTA_ALARM, { delayInMinutes: MAINT_QUOTA_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: MAINT_QUOTA_PERIOD_MIN });
    chrome.alarms.create(MAINT_TOKEN_AGE_ALARM, { delayInMinutes: MAINT_TOKEN_AGE_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: MAINT_TOKEN_AGE_PERIOD_MIN });
    chrome.alarms.create(MAINT_DIAG_ROTATE_ALARM, { delayInMinutes: MAINT_DIAG_ROTATE_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: MAINT_DIAG_ROTATE_PERIOD_MIN });
    chrome.alarms.create(MAINT_INTEL_EVICT_ALARM, { delayInMinutes: MAINT_INTEL_EVICT_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: MAINT_INTEL_EVICT_PERIOD_MIN });
    chrome.alarms.create(MAINT_WEEKLY_ALARM, { delayInMinutes: MAINT_WEEKLY_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: MAINT_WEEKLY_PERIOD_MIN });
    chrome.alarms.create(HEALTH_ALARM, { delayInMinutes: HEALTH_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: HEALTH_PERIOD_MIN });
    // v10.10.0 S1: auto-action poll alarm creation.
    chrome.alarms.create(AUTO_POLL_ALARM, { delayInMinutes: AUTO_POLL_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: AUTO_POLL_PERIOD_MIN });
    // v10.11 T2 (REDTEAM-1): inactivity lock alarm.
    chrome.alarms.create(INACTIVITY_LOCK_ALARM, { delayInMinutes: INACTIVITY_LOCK_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: INACTIVITY_LOCK_PERIOD_MIN });
    // v10.16.34 (Grok #16) proactive alerts -- endpoint may not exist yet; 404 silently swallowed.
    chrome.alarms.create(AI_PROACTIVE_ALARM, { delayInMinutes: AI_PROACTIVE_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: AI_PROACTIVE_PERIOD_MIN });
  } catch (e) { console.warn('[ModTools] alarm create failed', e); }
  // v8.6.9: AWAIT __ensureSessionAccess so subsequent storage calls don't
  // fire before the session-area access level is set. Pre-fix race: the
  // setAccessLevel call was async-fired but not awaited; consumers that
  // hit chrome.storage.session immediately after install could fail.
  try { await __ensureSessionAccess(); } catch (e) {}
  // v10.11 T1 (REDTEAM-1): init crypto key + migrate any plaintext tokens on install/update.
  try { await _cryptInit(); } catch (e) { try { console.warn('[ModTools v10.11 CRYPT] _cryptInit onInstalled:', e.message); } catch (_) {} }
  try { await _cryptMigrateSettings(); } catch (e) { try { console.warn('[ModTools v10.11 CRYPT] migrate onInstalled:', e.message); } catch (_) {} }
  try { await loadSecrets(); } catch (e) {}
  // v10.12.1 PA.3: one-shot migration of gam_diag_log from storage.local to IDB
  try { await _diagMigrateFromStorage(); } catch (e) {}
});

// Also ensure the alarm is alive on service-worker wake-up
chrome.runtime.onStartup?.addListener(async () => {
  await _recordSwBoot('startup');
  try {
    // AF-04 Rule 12: every chrome.alarms.get callback checks lastError before use.
    chrome.alarms.get(ALARM_NAME, (a) => {
      if (chrome.runtime.lastError) { console.warn('[ModTools] alarms.get ALARM_NAME:', chrome.runtime.lastError.message); return; }
      // v10.12.1 PA.1: jitter to prevent thundering herd across 15-mod fleet
      if (!a) chrome.alarms.create(ALARM_NAME, { delayInMinutes: ALARM_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: ALARM_PERIOD_MIN });
    });
    chrome.alarms.get(BUG_POLL_ALARM, (a) => {
      if (chrome.runtime.lastError) { console.warn('[ModTools] alarms.get BUG_POLL_ALARM:', chrome.runtime.lastError.message); return; }
      if (!a) chrome.alarms.create(BUG_POLL_ALARM, { delayInMinutes: BUG_POLL_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: BUG_POLL_PERIOD_MIN });
    });
    // v9.5.0 maintenance alarms — ensure alive on SW wake.
    chrome.alarms.get(MAINT_QUOTA_ALARM, (a) => {
      if (chrome.runtime.lastError) { console.warn('[ModTools] alarms.get MAINT_QUOTA_ALARM:', chrome.runtime.lastError.message); return; }
      if (!a) chrome.alarms.create(MAINT_QUOTA_ALARM, { delayInMinutes: MAINT_QUOTA_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: MAINT_QUOTA_PERIOD_MIN });
    });
    chrome.alarms.get(MAINT_TOKEN_AGE_ALARM, (a) => {
      if (chrome.runtime.lastError) { console.warn('[ModTools] alarms.get MAINT_TOKEN_AGE_ALARM:', chrome.runtime.lastError.message); return; }
      if (!a) chrome.alarms.create(MAINT_TOKEN_AGE_ALARM, { delayInMinutes: MAINT_TOKEN_AGE_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: MAINT_TOKEN_AGE_PERIOD_MIN });
    });
    chrome.alarms.get(MAINT_DIAG_ROTATE_ALARM, (a) => {
      if (chrome.runtime.lastError) { console.warn('[ModTools] alarms.get MAINT_DIAG_ROTATE_ALARM:', chrome.runtime.lastError.message); return; }
      if (!a) chrome.alarms.create(MAINT_DIAG_ROTATE_ALARM, { delayInMinutes: MAINT_DIAG_ROTATE_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: MAINT_DIAG_ROTATE_PERIOD_MIN });
    });
    chrome.alarms.get(MAINT_INTEL_EVICT_ALARM, (a) => {
      if (chrome.runtime.lastError) { console.warn('[ModTools] alarms.get MAINT_INTEL_EVICT_ALARM:', chrome.runtime.lastError.message); return; }
      if (!a) chrome.alarms.create(MAINT_INTEL_EVICT_ALARM, { delayInMinutes: MAINT_INTEL_EVICT_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: MAINT_INTEL_EVICT_PERIOD_MIN });
    });
    chrome.alarms.get(MAINT_WEEKLY_ALARM, (a) => {
      if (chrome.runtime.lastError) { console.warn('[ModTools] alarms.get MAINT_WEEKLY_ALARM:', chrome.runtime.lastError.message); return; }
      if (!a) chrome.alarms.create(MAINT_WEEKLY_ALARM, { delayInMinutes: MAINT_WEEKLY_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: MAINT_WEEKLY_PERIOD_MIN });
    });
    // AF-05 (Rule 14): health heartbeat resurrection on SW wake.
    chrome.alarms.get(HEALTH_ALARM, (a) => {
      if (chrome.runtime.lastError) { console.warn('[ModTools] alarms.get HEALTH_ALARM:', chrome.runtime.lastError.message); return; }
      if (!a) chrome.alarms.create(HEALTH_ALARM, { delayInMinutes: HEALTH_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: HEALTH_PERIOD_MIN });
    });
    // v10.10.0 S1: auto-action poll alarm resurrection on SW wake.
    chrome.alarms.get(AUTO_POLL_ALARM, (a) => {
      if (chrome.runtime.lastError) { console.warn('[ModTools] alarms.get AUTO_POLL_ALARM:', chrome.runtime.lastError.message); return; }
      if (!a) chrome.alarms.create(AUTO_POLL_ALARM, { delayInMinutes: AUTO_POLL_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: AUTO_POLL_PERIOD_MIN });
    });
    // v10.11 T2 (REDTEAM-1): inactivity lock alarm resurrection.
    chrome.alarms.get(INACTIVITY_LOCK_ALARM, (a) => {
      if (chrome.runtime.lastError) { console.warn('[ModTools] alarms.get INACTIVITY_LOCK_ALARM:', chrome.runtime.lastError.message); return; }
      if (!a) chrome.alarms.create(INACTIVITY_LOCK_ALARM, { delayInMinutes: INACTIVITY_LOCK_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: INACTIVITY_LOCK_PERIOD_MIN });
    });
    // v10.16.34 (Grok #16) proactive alerts alarm resurrection.
    chrome.alarms.get(AI_PROACTIVE_ALARM, (a) => {
      if (chrome.runtime.lastError) { console.warn('[ModTools] alarms.get AI_PROACTIVE_ALARM:', chrome.runtime.lastError.message); return; }
      if (!a) chrome.alarms.create(AI_PROACTIVE_ALARM, { delayInMinutes: AI_PROACTIVE_PERIOD_MIN + (Math.random() * 0.5), periodInMinutes: AI_PROACTIVE_PERIOD_MIN });
    });
  } catch (e) {}
  // v8.6.9: AWAIT both bootstrap calls so the SW is fully ready before
  // any incoming RPC handler fires.
  try { await __ensureSessionAccess(); } catch (e) {}
  // v10.11 T1 (REDTEAM-1): init crypto key + run migration on every SW boot.
  try { await _cryptInit(); } catch (e) { try { console.warn('[ModTools v10.11 CRYPT] _cryptInit onStartup:', e.message); } catch (_) {} }
  try { await _cryptMigrateSettings(); } catch (e) { try { console.warn('[ModTools v10.11 CRYPT] migrate onStartup:', e.message); } catch (_) {} }
  try { await loadSecrets(); } catch (e) {}
  // v10.12.1 PA.3: one-shot migration of gam_diag_log from storage.local to IDB
  try { await _diagMigrateFromStorage(); } catch (e) {}
  // AF-08 (Rule 24): verify settings checksum on startup.
  try { await _maintSettingsChecksumVerify(); } catch (e) {}
});

// v10.16.30 (Grok #8): zero secretCache + session storage when the SW is
// about to be unloaded by Chrome. Defense-in-depth -- chrome.storage.session
// is auto-wiped by browser restart per MV3 spec, but Chrome's "suspended SW"
// state is not the same as restart, and the cache can persist in memory if
// the SW is later resurrected without going through onStartup. This handler
// guarantees the in-memory cache is empty across the suspend boundary.
chrome.runtime.onSuspend?.addListener(() => {
  try {
    secretCache = { workerModToken: '', leadModToken: '' };
    if (chrome.storage && chrome.storage.session) {
      // Fire-and-forget: onSuspend is a "best effort" hook; Chrome may not
      // wait for the promise. The wipe is opportunistic insurance.
      chrome.storage.session.remove('gam_settings').catch(() => {});
    }
    console.log('[ModTools v10.16.30] onSuspend: secretCache zeroed');
  } catch (e) { try { console.warn('[ModTools v10.16.30] onSuspend wipe failed:', e.message); } catch (_) {} }
});

// v10.16.30 (Grok #8 paired): if Chrome cancels the suspension (user activity,
// keepalive RPC), re-hydrate from chrome.storage.local so the next RPC has a
// valid token. Without this we'd silently 401 on the first call after a
// cancelled suspend.
chrome.runtime.onSuspendCanceled?.addListener(() => {
  try {
    loadSecrets().catch(() => {});
    console.log('[ModTools v10.16.30] onSuspendCanceled: re-hydrating secretCache');
  } catch (_) {}
});

// v7.2 CHUNK 14: also arm on module load so a freshly-reloaded SW never
// leaves the session area locked to extension-only contexts.
try { __ensureSessionAccess(); } catch (e) {}

// v9.2.2 hotfix: keep secretCache in sync with chrome.storage.local. Pre-fix,
// the SW's vault was only updated by the {type:'setTokens'} message path.
// Any direct write to chrome.storage.local (emergency console snippet, lead
// rotation script, or any out-of-band recovery) left the vault stale, so
// every subsequent RPC sent the OLD token and the worker rejected with 401.
// This listener re-mirrors gam_settings into secretCache on every change.
//
// v9.3.13 (Vanguard C-2/H-2) + v9.3.15 (Vanguard ER2-H-4): validate token
// shape before any promotion. v9.3.15 tightens the regex to (a) reject
// leading/trailing dashes (CLI flag-injection footgun if a token ever lands
// in a wrangler/curl command line via debug paste), and (b) require at
// least one letter AND one digit so all-dash or all-underscore strings are
// rejected. Empty string is still "explicit clear, OK."
var __TOKEN_SHAPE_RE = /^[A-Za-z0-9_-]{32,256}$/;
function __isValidTokenOrEmpty(v) {
  if (typeof v !== 'string') return false;
  if (v === '') return true; // empty = explicit clear, OK
  if (!__TOKEN_SHAPE_RE.test(v)) return false;
  // ER2-H-4: tightening — reject leading/trailing dash (CLI flag-injection)
  if (v.startsWith('-') || v.startsWith('_') || v.endsWith('-') || v.endsWith('_')) return false;
  // Must contain at least one ASCII letter AND one digit (rejects all-dash etc.)
  if (!/[A-Za-z]/.test(v)) return false;
  if (!/[0-9]/.test(v)) return false;
  return true;
}
// v9.3.15 (Vanguard ER2-C-3): popup-only snapshot consent nonce, held in
// SW RAM (not chrome.storage.session). Content scripts cannot read SW RAM,
// so a compromised content-script context cannot mint its own consent.
// The popup mints, the content script verifies via SW round-trip.
const _SNAPSHOT_CONSENT = { nonce: null, mintedAt: 0 };
function __mintSnapshotConsent() {
  try {
    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    const hex = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
    _SNAPSHOT_CONSENT.nonce = hex;
    _SNAPSHOT_CONSENT.mintedAt = Date.now();
    return hex;
  } catch (_) { return null; }
}
function __verifyAndConsumeSnapshotConsent(presented) {
  const now = Date.now();
  const valid = !!(_SNAPSHOT_CONSENT.nonce
    && presented === _SNAPSHOT_CONSENT.nonce
    && (now - _SNAPSHOT_CONSENT.mintedAt) < 5000);
  // One-shot regardless of outcome — prevents replay even on validation fail.
  _SNAPSHOT_CONSENT.nonce = null;
  _SNAPSHOT_CONSENT.mintedAt = 0;
  return valid;
}
// v9.3.15 (Vanguard ER2-C-4): the gam_update_available banner is now
// background-verified. Background tracks the last flag value it set in SW
// RAM; content script must call `verifyUpdateFlag` and only renders the
// banner if SW confirms the flag matches what background set. A malicious
// in-extension write to chrome.storage.local cannot trick the banner
// because it never matches the SW's record.
let _UPDATE_FLAG_LAST_SET = null;
// v9.3.15 (Vanguard ER2-H-3): rate-limit clearTokens to 1 every 10s.
// Pre-fix any in-extension surface could spam the RPC and DoS the vault.
let _LAST_CLEAR_TOKENS_AT = 0;
try {
  chrome.storage.onChanged.addListener(function(changes, area) {
    if (area !== 'local') return;
    if (!changes || !changes.gam_settings) return;
    var nv = changes.gam_settings.newValue;
    if (!nv || typeof nv !== 'object') return;
    var prevWorker = secretCache.workerModToken || '';
    var prevLead = secretCache.leadModToken || '';
    // v9.3.13: validate shape BEFORE promotion. Reject malformed values
    // and keep the prior cached value rather than overwriting with garbage.
    var rawNextWorker = (typeof nv.workerModToken === 'string') ? nv.workerModToken : prevWorker;
    var rawNextLead   = (typeof nv.leadModToken === 'string')   ? nv.leadModToken   : prevLead;
    var nextWorker = __isValidTokenOrEmpty(rawNextWorker) ? rawNextWorker : prevWorker;
    var nextLead   = __isValidTokenOrEmpty(rawNextLead)   ? rawNextLead   : prevLead;
    if (rawNextWorker !== nextWorker || rawNextLead !== nextLead) {
      try { console.error('[ModTools v9.3.13 SECURITY] storage.onChanged refused malformed token write — keeping prior cache value'); } catch(_){}
    }
    if (nextWorker !== prevWorker || nextLead !== prevLead) {
      secretCache = { workerModToken: nextWorker, leadModToken: nextLead };
      // Also push into chrome.storage.session so the next SW evict+reload
      // picks the right vault from loadSecrets()'s session-first lookup.
      try {
        if (chrome.storage && chrome.storage.session) {
          chrome.storage.session.get('gam_settings').then(function(out){
            var cur = (out && out.gam_settings) || {};
            var merged = Object.assign({}, cur, {
              workerModToken: nextWorker,
              leadModToken: nextLead
            });
            chrome.storage.session.set({ gam_settings: merged }).catch(function(){});
          }).catch(function(){});
        }
      } catch (_) {}
      try {
        console.log('[ModTools v9.2.2] SW vault re-synced from storage change',
          { hasTeam: !!nextWorker, hasLead: !!nextLead });
      } catch (_) {}
    }
  });
} catch (e) {}

// v9.4.4: poll worker for open bug reports; update toolbar badge.
async function _bugPollAndBadge() {
  try {
    if (!secretCache.workerModToken) {
      try { await loadSecrets(); } catch (_) {}
    }
    if (!secretCache.workerModToken) {
      try { chrome.action.setBadgeText({ text: '' }); } catch (_) {}
      return;
    }
    const r = await _rpcWorkerCall('GET', '/admin/bug-reports?status=open&limit=1', undefined);
    if (!r || !r.ok || !r.data) {
      // 403 = not allowlisted. Clear the badge silently.
      try { chrome.action.setBadgeText({ text: '' }); } catch (_) {}
      return;
    }
    const n = parseInt(r.data.open_count, 10) || 0;
    const text = n > 0 ? (n > 99 ? '99+' : String(n)) : '';
    try {
      chrome.action.setBadgeText({ text });
      if (text) chrome.action.setBadgeBackgroundColor({ color: '#cc3333' });
    } catch (_) {}
  } catch (e) {
    try { chrome.action.setBadgeText({ text: '' }); } catch (_) {}
  }
}

// =========================================================================
// v9.5.0 MAINTENANCE alarm handlers
// =========================================================================
// Each is non-destructive and only writes the gam_maint_warning flag (or
// trims caches). The flag is a separate concern from gam_update_available;
// the popup surfaces it via a yellow chip in the header (NOT the existing
// update banner) so they don't misfire each other.

async function _maintAppendDiag(routine, result, extra) {
  // v10.12.1 PA.3: write to IDB diag store instead of storage.local
  try {
    const entry = {
      ts: Date.now(),
      iso: new Date().toISOString(),
      cat: 'maint',
      msg: String(routine || ''),
      extra: { result, ...(extra || null) },
      stack: null,
      v: chrome.runtime.getManifest().version
    };
    await _diagAppend(entry);
  } catch (e) { /* fire-and-forget */ }
}

async function _maintSetWarning(payload) {
  try {
    if (!payload) {
      await chrome.storage.local.remove(MAINT_WARNING_KEY);
      return;
    }
    // Preserve firstSeenAt across re-fires of the same warning.
    const cur = await chrome.storage.local.get(MAINT_WARNING_KEY);
    const prev = cur[MAINT_WARNING_KEY];
    const firstSeenAt = (prev && prev.reason === payload.reason && prev.firstSeenAt)
      ? prev.firstSeenAt : new Date().toISOString();
    await chrome.storage.local.set({
      [MAINT_WARNING_KEY]: {
        ...payload,
        at: new Date().toISOString(),
        firstSeenAt
      }
    });
  } catch (e) { /* fire-and-forget */ }
}

// AF-09 (Rule 25): auto-purge when storage quota > 80%.
// Drops oldest 50% of gam_diag_log and LRU 50% of gam_profile_intel.
// Mirrors what maintStorageTrim() does in popup.js but runs autonomously.
async function _maintQuotaPurge() {
  var evicted = 0;
  var log = [];

  // Purge gam_diag_log: drop oldest 50% via IDB prune (v10.12.1 PA.3)
  try {
    // Prune entries older than 3 days when quota is critical (aggressive vs normal 7d)
    await _diagPrune(3, 500);
    evicted += 1; // approximate; IDB doesn't return deleted count synchronously
    log.push('diag_log: IDB prune complete (3d cutoff)');
  } catch (e) {
    log.push('diag_log purge failed: ' + String(e && e.message || e));
  }

  // Purge gam_profile_intel: evict LRU 50% (sort by .ts ascending, drop bottom half)
  try {
    var r2 = await chrome.storage.local.get(MAINT_INTEL_KEY);
    var intel = r2[MAINT_INTEL_KEY] || {};
    var intelEntries = Object.entries(intel);
    if (intelEntries.length > 0) {
      intelEntries.sort(function(a, b) { return ((a[1] && a[1].ts) || 0) - ((b[1] && b[1].ts) || 0); });
      var dropCount2 = Math.floor(intelEntries.length / 2);
      var kept2 = Object.fromEntries(intelEntries.slice(dropCount2));
      await chrome.storage.local.set({ [MAINT_INTEL_KEY]: kept2 });
      evicted += dropCount2;
      log.push('profile_intel: dropped ' + dropCount2 + ', kept ' + (intelEntries.length - dropCount2));
    }
  } catch (e) {
    log.push('profile_intel purge failed: ' + String(e && e.message || e));
  }

  // Log the purge event to gam_diag_log
  try {
    var purgeEntry = {
      ts: new Date().toISOString(),
      cat: 'maint.quotaPurge',
      msg: 'auto-purge: evicted ' + evicted + ' entries',
      extra: { evicted: evicted, detail: log }
    };
    var r3 = await chrome.storage.local.get(MAINT_DIAG_KEY);
    var existing = r3[MAINT_DIAG_KEY] || [];
    existing.push(purgeEntry);
    if (existing.length > MAINT_DIAG_MAX) existing.splice(0, existing.length - MAINT_DIAG_MAX);
    await chrome.storage.local.set({ [MAINT_DIAG_KEY]: existing });
  } catch (_) {}

  console.log('[ModTools AF-09] quota auto-purge complete. Evicted:', evicted, log);
  return evicted;
}

async function _maintQuotaCheck() {
  try {
    const total = await new Promise((resolve, reject) => {
      try { chrome.storage.local.getBytesInUse(null, n => resolve(n)); }
      catch (e) { reject(e); }
    });
    const pct = total / MAINT_QUOTA_BYTES * 100;
    if (pct >= MAINT_QUOTA_THRESHOLD_PCT) {
      await _maintSetWarning({
        reason: 'Storage quota high (' + pct.toFixed(1) + '%)',
        detail: 'open Maintenance > Storage health probe > Trim now',
        severity: pct >= 95 ? 'danger' : 'warn'
      });
      // AF-09 (Rule 25): auto-purge when over threshold.
      try { await _maintQuotaPurge(); } catch (_) {}
    } else {
      // Auto-clear if storage was previously high but is now OK.
      const cur = await chrome.storage.local.get(MAINT_WARNING_KEY);
      const w = cur[MAINT_WARNING_KEY];
      if (w && /Storage quota high/.test(w.reason || '')) {
        await chrome.storage.local.remove(MAINT_WARNING_KEY);
      }
    }
    await _maintAppendDiag('alarm.quotaCheck', 'ok', { total, pct });
  } catch (e) {
    await _maintAppendDiag('alarm.quotaCheck', 'err', { error: String(e && e.message || e) });
  }
}

async function _maintTokenAgeCheck() {
  try {
    const r = await chrome.storage.local.get('gam_settings');
    const s = (r && r.gam_settings) || {};
    const rotatedAt = s.rotated_at;
    if (!rotatedAt) {
      await _maintAppendDiag('alarm.tokenAge', 'noop', { reason: 'no rotated_at stamp' });
      return;
    }
    const ageDays = Math.floor((Date.now() - new Date(rotatedAt).getTime()) / 86400000);
    if (ageDays > MAINT_TOKEN_AGE_WARN_DAYS) {
      await _maintSetWarning({
        reason: 'Token rotation due (' + ageDays + 'd old)',
        detail: 'rotate via popup token panel',
        severity: ageDays > 90 ? 'danger' : 'warn'
      });
    } else {
      const cur = await chrome.storage.local.get(MAINT_WARNING_KEY);
      const w = cur[MAINT_WARNING_KEY];
      if (w && /Token rotation due/.test(w.reason || '')) {
        await chrome.storage.local.remove(MAINT_WARNING_KEY);
      }
    }
    await _maintAppendDiag('alarm.tokenAge', 'ok', { ageDays });
    // v10.11 T3 (REDTEAM-1): check token expiry metadata and emit rotation reminder.
    try {
      var nowMs = Date.now();
      var expiryFields = [
        { key: 'workerModToken_expires_at', label: 'team token' },
        { key: 'leadModToken_expires_at', label: 'lead token' }
      ];
      for (var ei = 0; ei < expiryFields.length; ei++) {
        var ef = expiryFields[ei];
        var expiresAt = s[ef.key];
        if (!expiresAt) continue;
        var daysRemaining = Math.floor((expiresAt - nowMs) / 86400000);
        if (daysRemaining <= 3) {
          await _maintSetWarning({
            reason: ef.label + ' expires in ' + daysRemaining + ' day' + (daysRemaining === 1 ? '' : 's'),
            detail: 'rotate via popup token panel immediately',
            severity: 'danger'
          });
        } else if (daysRemaining <= 7) {
          await _maintSetWarning({
            reason: ef.label + ' expires in ' + daysRemaining + ' days',
            detail: 'rotate via popup token panel soon',
            severity: 'warn'
          });
        }
      }
    } catch (_) {}
    // AF-08 (Rule 24): write fresh settings checksum daily (piggybacking the 24h alarm).
    try { await _maintSettingsChecksumWrite(); } catch (_) {}
  } catch (e) {
    await _maintAppendDiag('alarm.tokenAge', 'err', { error: String(e && e.message || e) });
  }
}

async function _maintDiagRotate() {
  // v10.12.1 PA.3: use IDB-backed _diagPrune instead of storage.local array trim
  try {
    await _diagPrune(7, 1000);
    await _maintAppendDiag('alarm.diagRotate', 'ok', { pruned: true });
  } catch (e) {
    try { console.warn('[maint] diagRotate failed', e); } catch (_) {}
  }
}

async function _maintIntelEvict() {
  try {
    const r = await chrome.storage.local.get(MAINT_INTEL_KEY);
    const intel = r[MAINT_INTEL_KEY] || {};
    const cutoff = Date.now() - MAINT_INTEL_MAX_AGE_MS;
    let evicted = 0;
    const next = {};
    for (const [k, v] of Object.entries(intel)) {
      const ts = (v && (v.ts || v.cachedAt)) || 0;
      if (ts && ts >= cutoff) next[k] = v;
      else evicted++;
    }
    if (evicted > 0) {
      await chrome.storage.local.set({ [MAINT_INTEL_KEY]: next });
    }
    await _maintAppendDiag('alarm.intelEvict', 'ok',
      { evicted, kept: Object.keys(next).length });
  } catch (e) {
    try { console.warn('[maint] intelEvict failed', e); } catch (_) {}
  }
}

// AF-40 (Rule 118): self-diagnostics on update. Runs 4 lightweight probes when
// the extension is updated. Failures surface via the existing gam_maint_warning
// channel so no new popup UI is needed.
async function _runUpdateDiagnostics() {
  var version = chrome.runtime.getManifest().version;
  var diagKey = 'gam_diag_update_' + version.replace(/\./g, '_');
  var probes = {};

  // Probe 1: schema integrity — required keys present in gam_settings.
  try {
    var p1r = await chrome.storage.local.get('gam_settings');
    var p1s = (p1r && p1r.gam_settings) || null;
    probes.schema = { ok: true, keyCount: p1s ? Object.keys(p1s).length : 0, hasSettings: !!p1s };
  } catch (e) {
    probes.schema = { ok: false, error: String(e && e.message || e) };
  }

  // Probe 2: token validity — tokens present and pass shape check if non-empty.
  try {
    var hasWorker = !!(secretCache && secretCache.workerModToken);
    var hasLead   = !!(secretCache && secretCache.leadModToken);
    var workerOk  = !hasWorker || __isValidTokenOrEmpty(secretCache.workerModToken);
    var leadOk    = !hasLead   || __isValidTokenOrEmpty(secretCache.leadModToken);
    probes.tokens = { ok: workerOk && leadOk, hasWorkerToken: hasWorker, hasLeadToken: hasLead, workerOk, leadOk };
    if (!workerOk || !leadOk) {
      await _maintSetWarning({
        code: 'STALE_TOKEN_SHAPE',
        message: 'Update detected stale token shape -- re-enter your token in the popup.',
        severity: 'warn',
        firstSeenAt: Date.now()
      });
    }
  } catch (e) {
    probes.tokens = { ok: false, error: String(e && e.message || e) };
  }

  // Probe 3: storage index reads — critical compound keys parseable.
  try {
    var p3r = await chrome.storage.local.get(['gam_profile_intel', 'gam_parked_items', 'gam_diag_log']);
    var intelOk  = !p3r.gam_profile_intel  || typeof p3r.gam_profile_intel === 'object';
    var parkedOk = !p3r.gam_parked_items   || typeof p3r.gam_parked_items  === 'object';
    var diagOk   = !p3r.gam_diag_log       || Array.isArray(p3r.gam_diag_log);
    probes.indexes = { ok: intelOk && parkedOk && diagOk, intelOk, parkedOk, diagOk };
    if (!intelOk || !parkedOk || !diagOk) {
      await _maintSetWarning({
        code: 'STORAGE_INDEX_CORRUPT',
        message: 'Update detected storage index mismatch. Open Maintenance to repair.',
        severity: 'warn',
        firstSeenAt: Date.now()
      });
    }
  } catch (e) {
    probes.indexes = { ok: false, error: String(e && e.message || e) };
  }

  // Probe 4: self-ping (fire-and-forget; 5s timeout). Catches broken SW state.
  try {
    var selfPingOk = false;
    await new Promise(function(res) {
      var tid = setTimeout(res, 5000);
      chrome.runtime.sendMessage({ type: 'ping' }, function(r) {
        if (chrome.runtime.lastError) { clearTimeout(tid); res(); return; }
        selfPingOk = !!(r && r.ok);
        clearTimeout(tid);
        res();
      });
    });
    probes.selfPing = { ok: selfPingOk };
    if (!selfPingOk) {
      await _maintSetWarning({
        code: 'SW_SELF_PING_FAILED',
        message: 'SW self-ping failed post-update. Try reloading the extension.',
        severity: 'warn',
        firstSeenAt: Date.now()
      });
    }
  } catch (e) {
    probes.selfPing = { ok: false, error: String(e && e.message || e) };
  }

  // Persist results.
  try {
    await chrome.storage.local.set({ [diagKey]: { ts: Date.now(), version, probes } });
    await _maintAppendDiag('update.diagnostics', 'ok', { version, probes });
  } catch (_) {}
}

// AF-08 (Rule 24): settings integrity checksum. Computed daily; verified on boot.
// On mismatch the existing maint-warning chip surfaces to the popup automatically.
const CHECKSUM_KEY = 'gam_settings_checksum';
const CHECKSUM_VOLATILE = new Set([
  'lastTokenPromptAt', 'lastAiScanDate', 'customBanHistory',
  'sync_last_written_at', 'rotated_at'
]);

async function _computeSettingsChecksum(settings) {
  try {
    var stable = {};
    for (var _k in (settings || {})) {
      if (Object.prototype.hasOwnProperty.call(settings, _k) && !CHECKSUM_VOLATILE.has(_k)) {
        stable[_k] = settings[_k];
      }
    }
    var sorted = Object.fromEntries(
      Object.entries(stable).sort(function(a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; })
    );
    var encoded = new TextEncoder().encode(JSON.stringify(sorted));
    var hashBuf = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuf))
      .map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  } catch (e) {
    return null;
  }
}

async function _maintSettingsChecksumWrite() {
  try {
    var r = await chrome.storage.local.get('gam_settings');
    var s = (r && r.gam_settings) || {};
    var hash = await _computeSettingsChecksum(s);
    if (!hash) return;
    var payload = {
      hash: hash,
      computedAt: Date.now(),
      settingsKeyCount: Object.keys(s).length
    };
    await chrome.storage.local.set({ [CHECKSUM_KEY]: payload });
    try { await _maintAppendDiag('checksum.write', 'ok', { hash: hash.slice(0, 16) + '...' }); } catch (_) {}
  } catch (e) {
    try { await _maintAppendDiag('checksum.write', 'err', { error: String(e && e.message || e) }); } catch (_) {}
  }
}

async function _maintSettingsChecksumVerify() {
  try {
    var results = await Promise.all([
      chrome.storage.local.get(CHECKSUM_KEY),
      chrome.storage.local.get('gam_settings')
    ]);
    var sr = results[0];
    var cr = results[1];
    var stored = sr && sr[CHECKSUM_KEY];
    if (!stored || !stored.hash) return;
    var current = await _computeSettingsChecksum(cr && cr.gam_settings || {});
    if (!current) return;
    if (current === stored.hash) {
      try { await _maintAppendDiag('checksum.boot', 'ok', { match: true }); } catch (_) {}
      return;
    }
    console.warn('[ModTools AF-08] settings checksum mismatch on boot', {
      stored: stored.hash.slice(0, 16),
      current: current.slice(0, 16),
      storedAt: new Date(stored.computedAt).toISOString()
    });
    try {
      await _maintAppendDiag('checksum.boot', 'warn', {
        match: false,
        storedHash: stored.hash.slice(0, 16) + '...',
        currentHash: current.slice(0, 16) + '...',
        storedAt: stored.computedAt
      });
    } catch (_) {}
    await _maintSetWarning({
      code: 'SETTINGS_CHECKSUM_MISMATCH',
      message: 'Settings integrity check failed on boot. Use Repair to restore defaults for any corrupted fields.',
      severity: 'warn',
      firstSeenAt: Date.now()
    });
  } catch (e) {
    try { console.warn('[ModTools AF-08] checksum verify error', e.message); } catch (_) {}
  }
}

// AF-05 (Rule 14): SW health heartbeat handler. Fires every 5 minutes.
// Logs vault status + storage usage to gam_diag_log for forensic analysis.
async function _healthCheck() {
  try { await loadSecrets(); } catch (_) {}
  const vaultOk = !!(secretCache && (secretCache.workerModToken || secretCache.leadModToken));
  let storageBytes = 0;
  try {
    storageBytes = await new Promise(function(res) {
      chrome.storage.local.getBytesInUse(null, function(b) { res(b || 0); });
    });
  } catch (_) {}
  const entry = {
    ts: Date.now(),
    vaultOk: vaultOk,
    hasWorkerToken: !!(secretCache && secretCache.workerModToken),
    hasLeadToken: !!(secretCache && secretCache.leadModToken),
    storageBytesUsed: storageBytes,
    storageQuotaPct: Math.round((storageBytes / (MAINT_QUOTA_BYTES || 5242880)) * 100)
  };
  try { await _maintAppendDiag('health.check', 'ok', entry); } catch (_) {}
  if (!vaultOk) {
    console.warn('[ModTools health] vault empty at heartbeat -- SW was evicted and not yet rehydrated');
  }
}

// =========================================================================
// v9.5.0 AUTONOMOUS WEEKLY MAINTENANCE RUN
// =========================================================================
// Fires every 7 days. Runs ONLY the non-destructive subset of the user-tier
// + lead-tier routines, aggregates results into a single payload, posts to
// the worker for Llama 3 analysis, and writes the LLM verdict back into a
// local notification flag (`gam_maint_last_report`) that the content script
// reads to render a one-line snack.
//
// HARD CONSTRAINTS (non-negotiable, encoded here so future edits respect):
//   * Never fires destructive routines (cookie clear, reset to defaults,
//     schema migration, log purge). Those stay click-only.
//   * Lead-only routines (audit-chain verify, roster staleness audit) are
//     skipped on non-lead installs (whoami short-circuits the gate).
//   * Worker upload is gated by team_settings.maintenance_autonomous_enabled.
//     If disabled, local routines still run (so gam_maint_warning chip
//     stays accurate) but the worker call is skipped.
//   * Allow-list of fields in the payload — no tokens, no PII beyond
//     the worker-derived mod_username (which the worker already knows).

const MAINT_LAST_REPORT_KEY = 'gam_maint_last_report';
const MAINT_AUTONOMOUS_FLAG = 'maintenance_autonomous_enabled';
const MAINT_PROMPT_VERSION_KEY = 'maintenance_prompt_version';
const MAINT_DEFAULT_PROMPT_VERSION = 'v1';

// Storage / quota helpers (read-only probes that mirror the popup's
// maintStorageProbe / maintTokenProbe / maintSelectorDriftReport / etc. but
// run without touching the DOM).
async function _autoStorageProbe() {
  try {
    const total = await new Promise((resolve) => {
      try { chrome.storage.local.getBytesInUse(null, n => resolve(n || 0)); }
      catch (_) { resolve(0); }
    });
    const pct = total / MAINT_QUOTA_BYTES * 100;
    const all = await chrome.storage.local.get(null);
    const sizes = Object.entries(all).map(([k, v]) => {
      let s; try { s = JSON.stringify(v).length; } catch (_) { s = 0; }
      return [k, s];
    }).sort((a, b) => b[1] - a[1]);
    const top5 = sizes.slice(0, 5).map(([k, s]) => ({ key: k, bytes: s }));
    return { ok: true, total_bytes: total, pct: Number(pct.toFixed(2)), top_keys: top5 };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function _autoTokenProbe() {
  try {
    const t0 = Date.now();
    const r = await _rpcWorkerCall('POST', '/mod/whoami', null);
    const latency = Date.now() - t0;
    if (!r || !r.ok || !r.data) {
      return { ok: false, latency_ms: latency, status: r && r.status, error: r && r.error };
    }
    const username = r.data.username || '?';
    const isLead = !!r.data.is_lead;
    const settings = await chrome.storage.local.get('gam_settings');
    const s = (settings && settings.gam_settings) || {};
    let token_age_days = null;
    if (s.rotated_at) {
      try { token_age_days = Math.floor((Date.now() - new Date(s.rotated_at).getTime()) / 86400000); }
      catch (_) {}
    }
    return { ok: true, mod_username: username, is_lead: isLead, latency_ms: latency, token_age_days };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function _autoSelectorDrift() {
  try {
    const r = await chrome.storage.local.get('gam_learned_selectors');
    const learned = (r && r.gam_learned_selectors) || {};
    const keys = Object.keys(learned);
    return { ok: true, drift_count: keys.length, keys: keys.slice(0, 8) };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function _autoDiagStatus() {
  try {
    const r = await chrome.storage.local.get(MAINT_DIAG_KEY);
    const log = (r && r[MAINT_DIAG_KEY]) || [];
    let recent_errors = 0;
    const cutoff = Date.now() - 7 * 86400000;
    for (const e of log) {
      if (e && e.ts >= cutoff && e.extra && (e.extra.result === 'err' || e.extra.error)) {
        recent_errors++;
      }
    }
    return {
      ok: true,
      log_count: log.length,
      log_cap: MAINT_DIAG_MAX,
      pct_of_cap: Number((log.length / MAINT_DIAG_MAX * 100).toFixed(1)),
      recent_errors_7d: recent_errors
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function _autoSchemaCheck() {
  // Read-only: compares stored schema_version vs the popup's MAINT_SCHEMA_CURRENT
  // (kept in sync via constants below). NEVER migrates here; click-only.
  const MAINT_SCHEMA_KEY = 'gam_settings_schema_version';
  const MAINT_SCHEMA_CURRENT = 3;
  try {
    const r = await chrome.storage.local.get('gam_settings');
    const s = (r && r.gam_settings) || {};
    const stored = parseInt(s[MAINT_SCHEMA_KEY], 10) || 1;
    return {
      ok: true,
      stored_version: stored,
      code_version: MAINT_SCHEMA_CURRENT,
      drift: stored !== MAINT_SCHEMA_CURRENT,
      drift_kind: stored === MAINT_SCHEMA_CURRENT ? 'none' :
                  (stored > MAINT_SCHEMA_CURRENT ? 'downgrade' : 'pending_migrate')
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function _autoAuditVerify(isLead) {
  if (!isLead) return { skipped: true, reason: 'non_lead' };
  try {
    const r = await _rpcWorkerCall('POST', '/admin/audit/verify', { limit: 5000, from: 0 }, { asLead: true });
    if (!r || !r.ok || !r.data) {
      return { ok: false, status: r && r.status, error: r && r.error };
    }
    return {
      ok: true,
      chain_ok: !!r.data.ok,
      verified: r.data.verified || 0,
      total: r.data.total || 0,
      null_hmac_post_boundary: !!r.data.entry_hmac_null_post_boundary
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

async function _autoRosterStaleness(isLead) {
  if (!isLead) return { skipped: true, reason: 'non_lead' };
  try {
    const r = await _rpcWorkerCall('GET', '/admin/mod/list', undefined, { asLead: true });
    if (!r || !r.ok || !r.data || !Array.isArray(r.data.mods)) {
      return { ok: false, status: r && r.status, error: r && r.error };
    }
    let red = 0, yellow = 0, green = 0, never_rotated = 0;
    for (const m of r.data.mods) {
      if (m.is_lead) continue;
      if (!m.rotated_at) { red++; never_rotated++; continue; }
      const ageDays = Math.floor((Date.now() - new Date(m.rotated_at).getTime()) / 86400000);
      if (ageDays < 30) green++;
      else if (ageDays < 90) yellow++;
      else red++;
    }
    return { ok: true, total: r.data.mods.length, green, yellow, red, never_rotated };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

// Read team_settings.maintenance_autonomous_enabled. Defaults to '1' (on).
// Cached via /mod/settings — any authed mod can read.
async function _autoIsAutonomousEnabled() {
  try {
    const r = await _rpcWorkerCall('GET', '/mod/settings', undefined);
    if (!r || !r.ok || !r.data || !r.data.settings) return true; // default-on if unreachable
    const v = r.data.settings[MAINT_AUTONOMOUS_FLAG];
    if (v == null) return true;
    return String(v).trim() !== '0';
  } catch (_) { return true; }
}

async function _maintWeeklyRun() {
  const startedAt = Date.now();
  await _maintAppendDiag('alarm.weeklyRun', 'start', { startedAt });
  try {
    // SW may have been evicted; re-hydrate secretCache from session/local
    // storage before any worker call.
    try { await loadSecrets(); } catch (_) {}
    if (!secretCache || !secretCache.workerModToken) {
      await _maintAppendDiag('alarm.weeklyRun', 'noop',
        { reason: 'no worker token (mod not yet onboarded)' });
      return;
    }
    // 1) Determine identity (drives lead-only routine gating).
    const tokenInfo = await _autoTokenProbe();
    const isLead = !!(tokenInfo && tokenInfo.ok && tokenInfo.is_lead);

    // 2) Run all non-destructive routines in parallel where independent.
    const [storage, selectorDrift, diag, schema, auditVerify, roster] = await Promise.all([
      _autoStorageProbe(),
      _autoSelectorDrift(),
      _autoDiagStatus(),
      _autoSchemaCheck(),
      _autoAuditVerify(isLead),
      _autoRosterStaleness(isLead)
    ]);

    const results = {
      storage_health: storage,
      token_health: tokenInfo,
      selector_drift: selectorDrift,
      diag_log_status: diag,
      schema_migration_check: schema,
      audit_chain_verify: auditVerify,
      roster_staleness_audit: roster
    };

    // 3) Persist a local copy regardless of upload outcome, so the popup can
    //    show "last weekly run" even if the worker is unreachable.
    const localPayload = {
      ts: startedAt,
      iso: new Date(startedAt).toISOString(),
      extension_version: chrome.runtime.getManifest().version,
      results,
      uploaded: false,
      llm: null
    };

    // 4) Check the lead kill switch. If autonomous uploads are disabled,
    //    skip the worker call but keep the local snapshot.
    const autonomousOn = await _autoIsAutonomousEnabled();
    if (!autonomousOn) {
      await chrome.storage.local.set({ [MAINT_LAST_REPORT_KEY]: localPayload });
      await _maintAppendDiag('alarm.weeklyRun', 'skipped_upload',
        { reason: 'team_settings.maintenance_autonomous_enabled=0' });
      return;
    }

    // 5) Upload to the worker. Worker handles Llama analysis + audit-chain
    //    append + D1 persistence; reply contains severity/summary/recs.
    let upload = { ok: false };
    try {
      upload = await _rpcWorkerCall('POST', '/maintenance/report', {
        extension_version: localPayload.extension_version,
        results,
        ts: startedAt
      });
    } catch (e) {
      upload = { ok: false, error: String(e && e.message || e) };
    }

    if (upload && upload.ok && upload.data) {
      localPayload.uploaded = true;
      localPayload.llm = {
        report_id: upload.data.report_id || null,
        severity: upload.data.severity || 'info',
        summary: upload.data.summary || '',
        recommendations: Array.isArray(upload.data.recommendations) ? upload.data.recommendations : [],
        prompt_version: upload.data.prompt_version || null
      };
      await _maintAppendDiag('alarm.weeklyRun', 'ok', {
        report_id: localPayload.llm.report_id,
        severity: localPayload.llm.severity
      });
    } else {
      await _maintAppendDiag('alarm.weeklyRun', 'upload_failed', {
        status: upload && upload.status,
        error: upload && upload.error
      });
    }

    await chrome.storage.local.set({ [MAINT_LAST_REPORT_KEY]: localPayload });

    // 6) Fire a content-script snack on the active GAW tab (if any). Silent
    //    on severity=ok per spec; non-blocking — no tab is fine.
    try {
      const sev = (localPayload.llm && localPayload.llm.severity) || 'ok';
      if (sev !== 'ok') {
        const tabs = await chrome.tabs.query({
          url: ['https://greatawakening.win/*', 'https://*.greatawakening.win/*']
        });
        for (const t of tabs) {
          try {
            await chrome.tabs.sendMessage(t.id, {
              type: 'maintenanceSnack',
              severity: sev,
              summary: (localPayload.llm && localPayload.llm.summary) || '',
              recommendations: (localPayload.llm && localPayload.llm.recommendations) || []
            });
          } catch (_) { /* tab may be sleeping or content script not ready */ }
        }
      }
    } catch (_) {}
  } catch (e) {
    await _maintAppendDiag('alarm.weeklyRun', 'err', {
      error: String(e && e.message || e)
    });
  }
}

// v10.10.0 S2: auto-action poll -- claim pending unsticky actions from worker
// and dispatch to open GAW content-script tabs for execution.
async function _autoActionPoll() {
  // Gate: respect opt-in setting. Read gam_settings.auto_unsticky_enabled
  // (default false). If disabled, return.
  try {
    const out = await chrome.storage.local.get('gam_settings');
    const enabled = !!(out && out.gam_settings && out.gam_settings.auto_unsticky_enabled);
    if (!enabled) return;
  } catch(_) { return; }

  // Need a mod token to call worker. If no token cached, return.
  if (!secretCache || !secretCache.workerModToken) {
    try { await loadSecrets(); } catch(_) {}
  }
  if (!secretCache.workerModToken) return;

  // 1. Claim up to 3 pending actions from worker.
  let claimed = [];
  try {
    const r = await fetch(WORKER_BASE + '/mod/auto-actions/claim', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mod-token': secretCache.workerModToken,
        'x-extension-id': chrome.runtime.id
      },
      body: JSON.stringify({ action: 'unsticky', limit: 3 })
    });
    if (!r.ok) {
      // v10.10.0 S3: diag on claim failure.
      await _maintAppendDiag('auto-action-poll', 'warn', { claimed_count: 0, dispatched_count: 0, failed_count: 0, claim_http: r.status });
      return;
    }
    const data = await r.json();
    claimed = (data && data.claimed) || [];
  } catch(e) {
    await _maintAppendDiag('auto-action-poll', 'warn', { claimed_count: 0, dispatched_count: 0, failed_count: 0, claim_err: String(e && e.message || e) });
    return;
  }

  if (claimed.length === 0) return; // v10.10.0 S3: skip diag log when nothing claimed and no error.

  // 2. For each claimed action, dispatch to an open GAW tab. If no tab is open
  //    on greatawakening.win, leave the actions claimed -- the next poll
  //    cycle will retry. (Worker has its own claim-timeout handling for
  //    truly orphaned claims.)
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ['*://greatawakening.win/*', '*://*.greatawakening.win/*'] });
  } catch(_) {}
  if (!tabs || tabs.length === 0) {
    // Mark each claimed action as failed-no-tab so worker can re-pend or
    // the next poll re-claim. Use complete endpoint with a sentinel error.
    for (const act of claimed) {
      _autoActionReportFailure(act.id, 0, 'no_gaw_tab_open').catch(() => {});
    }
    // v10.10.0 S3: diag on no-tab failure.
    await _maintAppendDiag('auto-action-poll', 'warn', { claimed_count: claimed.length, dispatched_count: 0, failed_count: claimed.length, reason: 'no_gaw_tab_open' });
    return;
  }

  // Pick the first GAW tab that's "complete" (page loaded).
  const tab = tabs.find(t => t.status === 'complete') || tabs[0];

  // 3. Send each claimed action to the content script for execution.
  let dispatched = 0;
  let failed = 0;
  for (const act of claimed) {
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, {
        type: 'gam_auto_action_execute',
        action: act
      });
      // Content script should return {ok, status, error?}.
      if (resp && resp.ok) {
        dispatched++;
        _autoActionReportSuccess(act.id, resp.status || 200).catch(() => {});
      } else {
        failed++;
        _autoActionReportFailure(act.id, (resp && resp.status) || 0, (resp && resp.error) || 'unknown_failure').catch(() => {});
      }
    } catch (err) {
      // Content script not loaded or tab navigated away.
      failed++;
      _autoActionReportFailure(act.id, 0, 'cs_unreachable: ' + String(err && err.message || err)).catch(() => {});
    }
  }

  // v10.10.0 S3: diag entry only when something was claimed.
  try {
    await _maintAppendDiag('auto-action-poll', 'info', { claimed_count: claimed.length, dispatched_count: dispatched, failed_count: failed });
  } catch(_) {}
}

async function _autoActionReportSuccess(id, status) {
  return fetch(WORKER_BASE + '/mod/auto-actions/' + encodeURIComponent(id) + '/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mod-token': secretCache.workerModToken, 'x-extension-id': chrome.runtime.id },
    body: JSON.stringify({ result_status: status, result_error: null })
  });
}

async function _autoActionReportFailure(id, status, errMsg) {
  return fetch(WORKER_BASE + '/mod/auto-actions/' + encodeURIComponent(id) + '/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mod-token': secretCache.workerModToken, 'x-extension-id': chrome.runtime.id },
    body: JSON.stringify({ result_status: status, result_error: errMsg })
  });
}

// v10.16.34 (Grok #16) proactive alerts -- endpoint may not exist yet; 404 is silently swallowed.
async function _aiProactiveAlertsPoll() {
  try {
    const r = await _rpcWorkerCall('GET', '/ai/proactive-alerts', undefined);
    const alerts = (r && r.ok && Array.isArray(r.data)) ? r.data : [];
    await chrome.storage.local.set({ gam_ai_proactive_alerts: alerts });
  } catch (_) {
    // best-effort; never noise on missing endpoint
    try { await chrome.storage.local.set({ gam_ai_proactive_alerts: [] }); } catch (_2) {}
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // AF-05 (Rule 14): health heartbeat -- check vault + storage every 5 min.
  if (alarm.name === HEALTH_ALARM) { await _healthCheck(); return; }
  // v10.11 T2 (REDTEAM-1): inactivity lock check.
  if (alarm.name === INACTIVITY_LOCK_ALARM) { await _inactivityLockCheck(); return; }
  // v10.10.0 S1: auto-action poll dispatch.
  if (alarm.name === AUTO_POLL_ALARM) { await _autoActionPoll(); return; }
  if (alarm.name === BUG_POLL_ALARM) { await _bugPollAndBadge(); return; }
  // v9.5.0 maintenance alarms.
  if (alarm.name === MAINT_QUOTA_ALARM)        { await _maintQuotaCheck();    return; }
  if (alarm.name === MAINT_TOKEN_AGE_ALARM)    { await _maintTokenAgeCheck(); return; }
  if (alarm.name === MAINT_DIAG_ROTATE_ALARM)  { await _maintDiagRotate();    return; }
  if (alarm.name === MAINT_INTEL_EVICT_ALARM)  { await _maintIntelEvict();    return; }
  if (alarm.name === MAINT_WEEKLY_ALARM)       { await _maintWeeklyRun();     return; }
  // v10.16.34 (Grok #16) proactive alerts -- endpoint may not exist yet; 404 is silently swallowed.
  if (alarm.name === AI_PROACTIVE_ALARM)       { await _aiProactiveAlertsPoll(); return; }
  if (alarm.name !== ALARM_NAME) return;
  try {
    const resp = await fetch(VERSION_JSON_URL, { cache: 'no-store' });
    if (!resp.ok) return;
    const data = await resp.json();
    // v10.7.2 HOTFIX: read available_version (latest extension release from GitHub
    // version.json), NOT data.version which is the WORKER version (different number
    // space). The pre-fix code compared extension manifest "10.7.0" against worker
    // "9.8.0" and showed a "latest v9.8.0" downgrade banner.
    let remote = (data && typeof data.available_version === 'string') ? data.available_version : null;
    // Backward compat fallback: only accept data.version if it looks like an extension
    // version (10.x or higher). Worker versions are 9.x and below.
    if (!remote && typeof data.version === 'string' && /^v?(?:10|11|12|13)\./.test(data.version)) {
      remote = data.version;
    }
    if (!remote) return;
    const local = chrome.runtime.getManifest().version;
    // SemVer comparison: only set the banner flag if remote is STRICTLY NEWER
    // than local. Stale GitHub version.json (e.g. 8.0.0) must not trigger a
    // downgrade banner.
    function _semverCmp(a, b) {
      const pa = String(a).replace(/^v/,'').split('.').map(n=>parseInt(n)||0);
      const pb = String(b).replace(/^v/,'').split('.').map(n=>parseInt(n)||0);
      for (let i=0; i<Math.max(pa.length,pb.length); i++){
        const x=pa[i]||0, y=pb[i]||0;
        if (x !== y) return x < y ? -1 : 1;
      }
      return 0;
    }
    if (_semverCmp(local, remote) >= 0) {
      // Local is current or newer than remote. Clear any stale notification flag.
      try { await chrome.storage.local.remove('gam_update_available'); } catch (_) {}
      return;
    }
    // v9.3.14 (Vanguard C-3): NOTIFY ONLY. Do not call chrome.runtime.reload().
    // The content script's banner consumer surfaces this to the mod, who must
    // click the Reload arrow themselves. This breaks the GitHub-account ->
    // RCE chain entirely.
    let firstSeenAt = Date.now();
    try {
      const cur = await chrome.storage.local.get('gam_update_available');
      if (cur && cur.gam_update_available && cur.gam_update_available.to === remote && cur.gam_update_available.firstSeenAt) {
        firstSeenAt = cur.gam_update_available.firstSeenAt; // preserve original
      }
    } catch (_) {}
    // v9.3.15 (Vanguard ER2-C-4): track this in SW RAM so verifyUpdateFlag
    // can attest that the flag was set BY the alarm path, not by some other
    // in-extension write. A malicious in-extension surface can still write
    // the storage key, but its value won't match _UPDATE_FLAG_LAST_SET so
    // the content-script consumer (which calls verifyUpdateFlag before
    // rendering) refuses to draw the banner.
    const _flagPayload = {
      from: local,
      to: remote,
      at: new Date().toISOString(),
      firstSeenAt: firstSeenAt
    };
    _UPDATE_FLAG_LAST_SET = _flagPayload;
    await chrome.storage.local.set({ gam_update_available: _flagPayload });
    const ageMs = Date.now() - firstSeenAt;
    if (ageMs > UPDATE_NAG_WARN_AFTER_MS) {
      try {
        console.warn('[ModTools v9.3.14] update banner ignored for ' +
          Math.round(ageMs / 86400000) + 'd (loaded=' + local + ', remote=' + remote +
          ') -- mod still on stale build');
      } catch (_) {}
    } else {
      try { console.log('[ModTools v9.3.14] update available (loaded=' + local + ', remote=' + remote + ') -- banner flag set, NO auto-reload'); } catch (_) {}
    }
  } catch (e) {
    console.warn('[ModTools] update check failed', e);
  }
});

// Unified message router. Legacy 'ping' + v7.2 'setTokens' / 'workerFetch' /
// 'tokensStatus' share this listener. Origin guard (sender.id ===
// chrome.runtime.id) remains in place for every handler.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // AF-13 (Rule 38): check lastError first; if set, the caller is gone — bail.
  if (chrome.runtime.lastError) { return; }
  // v5.8.1 security: same-extension sender guard (HIGH-4)
  if (sender.id !== chrome.runtime.id) return;

  // v10.11 T2 (REDTEAM-1): bump inactivity timestamp on every message from popup/content.
  _inactivityBumpActivity().catch(function() {});

  if (msg && msg.type === 'ping') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return true;
  }

  // v10.2: openPopup handler. Lets content-script surfaces (auth-fail
  // banner, in-page snacks, etc.) ask Chrome to open the ModTools popup
  // directly. chrome.action.openPopup() is Chrome 127+ AND requires that
  // the calling event chain originates from a user gesture in a tab
  // belonging to the extension's host_permissions. Both are true here:
  // the caller is the GAW content script, the user clicked a banner.
  // AF-39 (Rule 117): minimum_chrome_version is "116" in manifest.json.
  // Mods on Chrome 116-126 will hit the else branch below (feature-detect
  // guard fails) and see the fallback snack. Chrome 127+ get auto-open.
  if (msg && msg.type === 'openPopup') {
    (async () => {
      try {
        if (chrome && chrome.action && typeof chrome.action.openPopup === 'function') {
          await chrome.action.openPopup();
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'openPopup unavailable (Chrome <127?)' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }

  // --- v7.2 Platform Hardening BEGIN ---
  if (msg && msg.type === 'setTokens') {
    // v9.3.13 (Vanguard H-2): validate token shape on inbound setTokens.
    // Reject any field with a malformed shape rather than overwriting the
    // cache. Empty string is a valid "clear me" signal.
    const hasWorker = Object.prototype.hasOwnProperty.call(msg, 'workerModToken');
    const hasLead = Object.prototype.hasOwnProperty.call(msg, 'leadModToken');
    const candWorker = hasWorker ? ((typeof msg.workerModToken === 'string') ? msg.workerModToken : '') : null;
    const candLead   = hasLead   ? ((typeof msg.leadModToken === 'string')   ? msg.leadModToken   : '') : null;
    if (hasWorker && !__isValidTokenOrEmpty(candWorker)) {
      sendResponse({ ok: false, error: 'malformed workerModToken (rejected by SW vault)' });
      return true;
    }
    if (hasLead && !__isValidTokenOrEmpty(candLead)) {
      sendResponse({ ok: false, error: 'malformed leadModToken (rejected by SW vault)' });
      return true;
    }
    secretCache = {
      workerModToken: hasWorker ? candWorker : (secretCache.workerModToken || ''),
      leadModToken:   hasLead   ? candLead   : (secretCache.leadModToken   || '')
    };
    (async () => {
      try {
        if (chrome.storage && chrome.storage.session) {
          await chrome.storage.session.set({ gam_settings: secretCache });
        }
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }
  // v9.3.13 (Vanguard M-1) + v9.3.15 (Vanguard ER2-H-3): atomic clearTokens
  // RPC, rate-limited to 1 per 10s to prevent DoS-replay-spam from any
  // in-extension surface that briefly gets compromised.
  if (msg && msg.type === 'clearTokens') {
    const _now = Date.now();
    if (_now - _LAST_CLEAR_TOKENS_AT < 10_000) {
      try { console.warn('[ModTools v9.3.15] clearTokens rate-limited (debounce 10s)'); } catch (_) {}
      sendResponse({ ok: false, error: 'clearTokens rate-limited (10s debounce)' });
      return true;
    }
    _LAST_CLEAR_TOKENS_AT = _now;
    secretCache = { workerModToken: '', leadModToken: '' };
    (async () => {
      try {
        if (chrome.storage && chrome.storage.session) {
          try { await chrome.storage.session.remove('gam_settings'); } catch (_) {}
        }
        try { console.warn('[ModTools v9.3.15] SW vault explicitly cleared via clearTokens RPC'); } catch (_) {}
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }
  // v9.3.15 (Vanguard ER2-C-3): popup-only mint of one-shot snapshot consent.
  // Held in SW RAM; content scripts cannot mint. Popup → mint → tab.sendMessage.
  if (msg && msg.type === 'mintSnapshotConsent') {
    // Reject if caller is not the popup (no sender.tab; sender.url is the
    // popup HTML URL like chrome-extension://<id>/popup.html). Content
    // scripts always have sender.tab populated.
    if (sender && sender.tab) {
      sendResponse({ ok: false, error: 'mintSnapshotConsent: popup-only' });
      return true;
    }
    const nonce = __mintSnapshotConsent();
    sendResponse({ ok: !!nonce, nonce });
    return true;
  }
  // v9.3.15 (Vanguard ER2-C-3): content script forwards the popup-supplied
  // nonce here. Background validates against SW RAM (one-shot, 5s TTL).
  if (msg && msg.type === 'verifySnapshotConsent') {
    const presented = String((msg && msg.nonce) || '');
    const ok = __verifyAndConsumeSnapshotConsent(presented);
    sendResponse({ ok });
    return true;
  }
  // v9.3.15 (Vanguard ER2-C-4): content script asks SW to verify that the
  // gam_update_available flag in chrome.storage.local was actually set by
  // the SW alarm path (and not by some other in-extension surface). Returns
  // ok only if the flag matches the SW's most-recent set.
  if (msg && msg.type === 'verifyUpdateFlag') {
    const presented = msg && msg.flag;
    // v10.7.3: defensive stale-flag check. If the presented flag's `to` is
    // current/older than local, refuse verification AND purge the storage key.
    // This catches the case where a stale flag survived a code update.
    try {
      const _local = chrome.runtime.getManifest().version;
      if (presented && presented.to && _semverCmp(_local, presented.to) >= 0) {
        chrome.storage.local.remove('gam_update_available').catch(() => {});
        _UPDATE_FLAG_LAST_SET = null;
        sendResponse({ ok: false, expected: 'local-current-or-newer-than-flag' });
        return true;
      }
    } catch (_) {}
    const last = _UPDATE_FLAG_LAST_SET;
    const matches = !!(last && presented
      && last.from === presented.from
      && last.to === presented.to
      && last.firstSeenAt === presented.firstSeenAt);
    sendResponse({ ok: matches, expected: matches ? null : 'flag does not match SW-set value' });
    return true;
  }

  // v10.8.0 A1: content-script-initiated stale-flag purge. Defensive — content
  // script already has direct chrome.storage.local access, but this gives the
  // SW a chance to clear its RAM mirror too.
  if (msg && msg.type === 'clearUpdateFlag') {
    (async () => {
      try {
        await chrome.storage.local.remove('gam_update_available');
        _UPDATE_FLAG_LAST_SET = null;
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }

  // v10.8.0 A2: popup Re-enable button clears a feature's auto-disable entry
  // from gam_error_counters. The delete is authoritative in the SW so the
  // content-script feature guard picks it up on next read.
  if (msg && msg.type === 'clearErrorCounter') {
    const feature = String((msg && msg.feature) || '');
    if (!feature) {
      sendResponse({ ok: false, error: 'feature required' });
      return true;
    }
    (async () => {
      try {
        const r = await chrome.storage.local.get('gam_error_counters');
        const counters = (r && r.gam_error_counters) || {};
        delete counters[feature];
        await chrome.storage.local.set({ gam_error_counters: counters });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }

  if (msg && msg.type === 'tokensStatus') {
    (async () => {
      // Prefer live RAM; fall back to session store if the service worker
      // was just revived.
      if (!secretCache.workerModToken && !secretCache.leadModToken) {
        try { await loadSecrets(); } catch (e) {}
      }
      // v10.11 T3 (REDTEAM-1): surface token age/expiry metadata.
      var r3 = {};
      try {
        var tsR = await chrome.storage.local.get('gam_settings');
        var tsS = (tsR && tsR.gam_settings) || {};
        var nowMs = Date.now();
        r3.workerTokenIssuedAt = tsS.workerModToken_issued_at || null;
        r3.workerTokenExpiresAt = tsS.workerModToken_expires_at || null;
        r3.workerTokenAgeDays = tsS.workerModToken_issued_at ? Math.floor((nowMs - tsS.workerModToken_issued_at) / 86400000) : null;
        r3.workerTokenDaysRemaining = tsS.workerModToken_expires_at ? Math.floor((tsS.workerModToken_expires_at - nowMs) / 86400000) : null;
        r3.leadTokenIssuedAt = tsS.leadModToken_issued_at || null;
        r3.leadTokenExpiresAt = tsS.leadModToken_expires_at || null;
        r3.leadTokenAgeDays = tsS.leadModToken_issued_at ? Math.floor((nowMs - tsS.leadModToken_issued_at) / 86400000) : null;
        r3.leadTokenDaysRemaining = tsS.leadModToken_expires_at ? Math.floor((tsS.leadModToken_expires_at - nowMs) / 86400000) : null;
      } catch (_) {}
      sendResponse({
        ok: true,
        hasTeamToken: !!secretCache.workerModToken,
        hasLeadToken: !!secretCache.leadModToken,
        ...r3
      });
    })();
    return true;
  }

  // v10.11 T4 (REDTEAM-1): cryptHealth RPC -- popup Diag tab calls this to surface crypt status.
  if (msg && msg.type === 'cryptHealth') {
    (async () => {
      try {
        var health = await _cryptHealth();
        // Wire into _maintAppendDiag so it appears in the diagnostic log.
        try { await _maintAppendDiag('crypt.health', 'ok', health); } catch (_) {}
        sendResponse({ ok: true, data: health });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message || e) });
      }
    })();
    return true;
  }

  // v9.3.13 (Vanguard H-1): legacy `workerFetch` relay DELETED. It was the
  // last general-purpose token-attached relay and any future RPC bug that
  // could trigger it with `asLead:true` was a one-shot at the most dangerous
  // admin endpoint that exists. Every former workerFetch path is now covered
  // by a named RPC handler (RPC_HANDLERS). If something still tries to use
  // type='workerFetch', return a hard error so we hear about it immediately.
  if (msg && msg.type === 'workerFetch') {
    try {
      console.error('[ModTools v9.3.13] DEPRECATED type:"workerFetch" — use named RPC dispatch (type:"rpc", name:...) instead. path=' + (msg.path || '?'));
    } catch (_) {}
    sendResponse({
      ok: false,
      status: 0,
      error: 'workerFetch removed in v9.3.13 (Vanguard H-1) — migrate to a named RPC handler'
    });
    return true;
  }

  // --- v8.6.0 / v5.0-Phase-1: Named RPC dispatcher ---
  if (msg && msg.type === 'rpc') {
    (async () => {
      const out = await _dispatchRpc(msg.name, msg.args, sender);
      // AF-13 (Rule 38): guard lastError before sendResponse — caller may have
      // navigated or closed while the async dispatch was in flight.
      if (!chrome.runtime.lastError) sendResponse(out);
    })();
    return true;
  }
  // --- v7.2 Platform Hardening END ---
});

// =========================================================================
// v8.6.0 / v5.0-Phase-1: Named RPC framework
// =========================================================================
// The legacy `workerFetch(path, asLead)` is a generic privileged relay --
// content scripts can ask the background to call any allowlisted endpoint
// with attached secrets. The v5.0 spec explicitly removes that pattern in
// favor of explicit, named RPCs that are fixed at the background layer.
//
// Each RPC handler:
//   - is keyed by a name that maps 1:1 to a specific worker operation
//   - validates its caller context (which extension surface invoked it)
//   - reads tokens from the background's secret cache, never echoing them
//   - returns only the operation result, never the token material
//
// During Phase 1 we co-exist with workerFetch -- the legacy path keeps
// working but emits a console warning per call so we can find every
// remaining call site for the v8.6.x migration sweep. Phase 2 (short-lived
// sessions) and Phase 3 (device enrollment) replace the underlying token
// model; this framework is the boundary that lets that swap happen without
// touching every content-script call site again.

const RPC_CALLER_CONTENT  = 'content';
const RPC_CALLER_POPUP    = 'popup';

function _classifyCaller(sender) {
  if (!sender) return null;
  if (sender.tab && sender.tab.id != null) return RPC_CALLER_CONTENT;
  return RPC_CALLER_POPUP;
}

// v9.2.1 hotfix: read-verify-retry save for token rotation.
// Updates the SW vault immediately, then persists to chrome.storage.local with
// a confirm-read step. Returns { saved: bool, lastError: string|null }.
// If saved=false, the caller MUST surface a CRITICAL error -- the worker has
// already flipped to the new hash; the old token is dead.
// AF-04 Rule 10: retry loop now routed through withBackoff (true exponential
// backoff with jitter: 100ms base, 800ms cap, 3 attempts).
// v10.11 T1 (REDTEAM-1): persists encrypted blob, not plaintext.
async function _persistRotatedToken(newTokenPlaintext) {
  // Update in-memory SW vault immediately so this SW lifecycle still works.
  secretCache.workerModToken = newTokenPlaintext;

  // Pre-encrypt once outside the retry loop; IV is random-per-call so this is fine.
  var encBlob = null;
  try { encBlob = await _cryptEncrypt(newTokenPlaintext); } catch (_) {}

  var saved = false;
  var lastError = null;
  try {
    await withBackoff(async function(attempt) {
      var cur = await chrome.storage.local.get('gam_settings');
      var merged = Object.assign({}, (cur && cur.gam_settings) || {});
      delete merged.workerModToken; // remove any residual plaintext
      if (encBlob) {
        merged.workerModToken_encrypted = encBlob;
      } else {
        // IDB unavailable -- fall back to plaintext (best-effort)
        merged.workerModToken = newTokenPlaintext;
      }
      await chrome.storage.local.set({ gam_settings: merged });
      // Read back to confirm.
      var verify = await chrome.storage.local.get('gam_settings');
      var vs = (verify && verify.gam_settings) || {};
      // Verify via encrypted field if we wrote one, else via plaintext field.
      if (encBlob) {
        if (!vs.workerModToken_encrypted || vs.workerModToken_encrypted.ct !== encBlob.ct) {
          throw new Error('encrypted verify mismatch on attempt ' + attempt);
        }
      } else {
        if (vs.workerModToken !== newTokenPlaintext) {
          throw new Error('verify mismatch on attempt ' + attempt);
        }
      }
    }, { base: 100, cap: 800, maxAttempts: 3 });
    saved = true;
  } catch (e) {
    lastError = String((e && e.message) || e);
  }
  // Best-effort session write (not durable across SW restarts, but covers the
  // gap between rotation and the next chrome.storage.local flush).
  try {
    if (chrome.storage && chrome.storage.session) {
      await chrome.storage.session.set({ gam_settings: secretCache });
    }
  } catch (_) {}
  return { saved: saved, lastError: lastError };
}

async function _rpcWorkerCall(method, path, body, opts) {
  const o = opts || {};
  if (!secretCache.workerModToken && !secretCache.leadModToken) {
    try { await loadSecrets(); } catch (e) {}
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, o.timeoutMs || 20000);
  try {
    const headers = new Headers();
    if (secretCache.workerModToken) headers.set('X-Mod-Token', secretCache.workerModToken);
    if (o.asLead && secretCache.leadModToken) headers.set('X-Lead-Token', secretCache.leadModToken);
    if (body !== undefined && body !== null) headers.set('Content-Type', 'application/json');
    // v10.16.30 (Grok #17): every RPC carries the extension version so the
    // worker can correlate audit rows with client build. Worker reads it
    // opportunistically (no enforcement) -- intent is diagnostic, not gating.
    try {
      const __extVer = chrome.runtime.getManifest().version;
      if (__extVer) headers.set('X-Extension-Version', __extVer);
    } catch (_) {}
    // v10.16.30 (Grok #27): replay-protection input header. Worker may
    // enforce a +/-5min window in a future hardening pass; today it is
    // a forward-compat signal.
    headers.set('X-Client-TS', String(Date.now()));
    const r = await fetch(WORKER_BASE + path, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: headers,
      body: (body === undefined || body === null) ? undefined : JSON.stringify(body),
      signal: ctrl.signal
    });
    const text = await r.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (e) {}
    return { ok: r.ok, status: r.status, data: parsed, text: text };
  } catch (e) {
    return {
      ok: false, status: 0,
      error: String(e && e.message || e),
      timeout: !!(e && e.name === 'AbortError')
    };
  } finally {
    clearTimeout(timer);
  }
}

const RPC_HANDLERS = {
  // ---- modXxx: callable from content script + popup ---------------------
  modAuditLog: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    // AF-15 (Rule 43): schema for top-frequency handler.
    schema: {
      mod:     { type: 'string', required: true, max: 64 },
      action:  { type: 'string', required: true, max: 64 },
      user:    { type: 'string', max: 64 },
      pageUrl: { type: 'string', max: 500 }
    },
    async handler(args) {
      return await _rpcWorkerCall('POST', '/audit/log', {
        mod: args && args.mod || 'unknown',
        action: args && args.action || 'unknown',
        user: args && args.user || '',
        details: args && args.details || {},
        pageUrl: args && args.pageUrl || ''
      });
    }
  },
  modWhoami: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler() { return await _rpcWorkerCall('POST', '/mod/whoami', null); }
  },
  // v10.19.1: Discord / Integrations config (lead-only). The worker enforces
  // is_lead; these attach the lead token. The webhook is a server-side secret --
  // the read never returns its value (configured-boolean only).
  adminIntegrationsRead: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler() { return await _rpcWorkerCall('GET', '/admin/integrations-config', undefined, { asLead: true }); }
  },
  adminIntegrationsWrite: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) { return await _rpcWorkerCall('POST', '/admin/integrations-config', args || {}, { asLead: true }); }
  },
  adminIntegrationsTest: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) { return await _rpcWorkerCall('POST', '/admin/integrations-config/test', args || { target: 'discord_raid' }, { asLead: true }); }
  },
  modSearch: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const q = encodeURIComponent(String(args && args.q || ''));
      const scope = encodeURIComponent(String(args && args.scope || 'both'));
      const limit = Math.min(200, Math.max(1, parseInt(args && args.limit, 10) || 50));
      // v10.17.0 GOD MODE: forward optional ?godmode=1 + ?sort= params when
      // the caller passes them. Worker preserves v9.6.0 behavior when absent.
      const godmode = (args && args.godmode) ? '1' : '';
      const sort = String(args && args.sort || '').toLowerCase();
      const validSort = (sort === 'rank' || sort === 'score' || sort === 'date') ? sort : '';
      let path = '/gaw/search?q=' + q + '&scope=' + scope + '&limit=' + limit;
      if (godmode) path += '&godmode=1';
      if (validSort) path += '&sort=' + validSort;
      return await _rpcWorkerCall('GET', path, undefined);
    }
  },
  // v10.17.2: firehose crawler observability (lead-only on worker side via
  // requireLeadAuth -- non-leads will get a 403 surfaced to the caller).
  modAdminFirehoseKeywords: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const limit  = Math.min(50, Math.max(1, parseInt(args && args.limit, 10)  || 10));
      const sample = Math.min(50, Math.max(1, parseInt(args && args.sample, 10) || 10));
      return await _rpcWorkerCall('GET',
        '/admin/firehose/keywords?limit=' + limit + '&sample=' + sample,
        undefined);
    }
  },
  modPresencePing: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    // AF-15 (Rule 43): no required fields; passthrough.
    schema: {},
    async handler(args) { return await _rpcWorkerCall('POST', '/presence/ping', args || {}); }
  },
  // ASK-086 / WAVE-B-AUX A.3: fetch /mod/stats from worker for AI budget + aggregate counts.
  // Returns ai_calls_today, ai_calls_cap when WAVE-C stats D1 ships; safe null fields until then.
  modStats: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    schema: {},
    async handler() { return await _rpcWorkerCall('GET', '/mod/stats', undefined); }
  },
  modGawTimeline: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    // AF-15 (Rule 43): schema for modGawTimeline.
    schema: {
      username: { type: 'string', required: true, max: 64 },
      since:    { type: 'number', min: 0 },
      limit:    { type: 'number', min: 5, max: 50 }
    },
    async handler(args) {
      const u = encodeURIComponent(String(args && args.username || '').slice(0, 64));
      if (!u) return { ok: false, status: 400, error: 'username required' };
      const since = parseInt(args && args.since, 10) || (Math.floor(Date.now() / 1000) - 30 * 86400);
      const limit = Math.min(50, Math.max(5, parseInt(args && args.limit, 10) || 30));
      return await _rpcWorkerCall('GET',
        '/gaw/user/' + u + '/timeline?since=' + since + '&limit=' + limit, undefined);
    }
  },

  // ---- authXxx: validate + store a candidate mod token (popup token-save flow) -
  authValidateToken: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const candidate = String(args && args.token || '');
      if (!candidate || !/^[A-Za-z0-9_-]{32,256}$/.test(candidate)) {
        return { ok: false, status: 0, error: 'malformed token' };
      }
      // Test the candidate against /version WITHOUT putting it in secretCache yet.
      const ctrl = new AbortController();
      const timer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 15000);
      try {
        const headers = new Headers();
        headers.set('X-Mod-Token', candidate);
        const r = await fetch(WORKER_BASE + '/version', { method: 'GET', headers, signal: ctrl.signal });
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (e) {}
        if (!r.ok) return { ok: false, status: r.status, error: 'token rejected by worker' };
        if (!parsed || typeof parsed.version !== 'string' || parsed.version.length > 32) {
          return { ok: false, status: r.status, error: 'malformed worker version response' };
        }
        // Token validated -- promote it into secretCache and persist.
        // v10.11 T1 (REDTEAM-1): encrypt before writing to chrome.storage.local.
        // v10.11 T3 (REDTEAM-1): record issued_at timestamp.
        secretCache.workerModToken = candidate;
        try {
          if (chrome.storage && chrome.storage.session) {
            await chrome.storage.session.set({ gam_settings: secretCache });
          }
          if (chrome.storage && chrome.storage.local) {
            const cur = await chrome.storage.local.get('gam_settings');
            const base = { ...((cur && cur.gam_settings) || {}) };
            // v10.11.1 HOTFIX: write BOTH plaintext AND encrypted. Plaintext
            // is the reliable safety net; encrypted is opportunistic. Don't
            // delete plaintext (was causing token loss when decrypt failed
            // on next SW restart).
            base.workerModToken = candidate;
            try {
              base.workerModToken_encrypted = await _cryptEncrypt(candidate);
            } catch (_) {
              // Encryption failed -- plaintext is sufficient.
            }
            const nowMs = Date.now();
            base.workerModToken_issued_at = nowMs;
            base.workerModToken_expires_at = nowMs + (30 * 24 * 60 * 60 * 1000); // 30-day default
            await chrome.storage.local.set({ gam_settings: base });
          }
        } catch (e) {}
        return { ok: true, status: r.status, data: { version: parsed.version } };
      } catch (e) {
        return { ok: false, status: 0, error: String(e && e.message || e), timeout: !!(e && e.name === 'AbortError') };
      } finally {
        clearTimeout(timer);
      }
    }
  },

  // ---- adminXxx: invite create (lead popup) ------------------------------
  adminInviteCreate: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/invite/create', {
        mod: args && args.mod
      }, { asLead: true });
    }
  },

  // ---- modSettings: shared team settings (cross-mod sync, P0-4 v9.3.1) ----
  // Worker: GET /mod/settings (any mod), PUT /admin/settings (lead-only).
  // The first lead-mutable setting is `username_flag_ttl_days` (default 30) —
  // server-side enforced on /flags/read, so just calling the GETs/PUTs here
  // is enough; no extra propagation logic needed.
  modSettingsRead: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler() { return await _rpcWorkerCall('GET', '/mod/settings', undefined); }
  },
  adminSettingsWrite: {
    // v10.14.3: opened to CONTENT caller for the auto-unsticky GEAR sync. Worker
    // still enforces `is_lead=1` on /admin/settings (gaw-mod-proxy-v2.js L1950),
    // so a non-lead content-script call cannot succeed — the allowed_callers
    // softening only widens the trusted RPC surface, not the worker contract.
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const key = String(args && args.key || '');
      const value = String(args && args.value || '');
      if (!key) return { ok: false, status: 0, error: 'missing key' };
      return await _rpcWorkerCall('PUT', '/admin/settings', { key, value }, { asLead: true });
    }
  },

  // v10.14.4: CS-side auto-unsticky scan ingest. Worker cron is dead in
  // production (CF Bot Fight Mode 403s worker-to-worker fetches with a JS
  // challenge interstitial -- workers can't solve those). Real lead browsers
  // on the GAW homepage scrape stickies from the DOM and POST them here;
  // worker applies same threshold check and queues. Lead-only.
  autoUnstickyScanReport: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const stickies = Array.isArray(args && args.stickies) ? args.stickies : [];
      return await _rpcWorkerCall('POST', '/admin/auto-unsticky-scan', { stickies }, { asLead: true });
    }
  },

  // ---- bugReport*: lead/visible-mod read; lead-only write/visibility -----
  // v9.4.4 — surfaces the previously dead-letter `bug_reports` D1 table to the
  // popup so leads can triage incoming reports without a separate dashboard.
  // GET /admin/bug-reports (mod token, gated by team_features.bug_report_visible_to)
  // PUT /admin/bug-reports/<id> (lead-only)
  // POST /admin/bug-reports/visibility (lead-only)
  // GET  /admin/bug-reports/visibility (any mod)
  bugReportList: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const status = encodeURIComponent(String(args && args.status || 'open'));
      const limit  = Math.min(500, Math.max(1, parseInt(args && args.limit, 10) || 100));
      return await _rpcWorkerCall('GET', '/admin/bug-reports?status=' + status + '&limit=' + limit, undefined);
    }
  },
  bugReportUpdate: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const id = parseInt(args && args.id, 10);
      if (!Number.isFinite(id) || id <= 0) return { ok: false, status: 0, error: 'missing id' };
      const body = {};
      if (args && args.status !== undefined) body.status = String(args.status);
      if (args && args.assigned_to !== undefined) body.assigned_to = args.assigned_to === null ? null : String(args.assigned_to);
      if (args && args.triage_note !== undefined) body.triage_note = String(args.triage_note);
      if (args && args.resolution_note !== undefined) body.resolution_note = String(args.resolution_note);
      return await _rpcWorkerCall('PUT', '/admin/bug-reports/' + id, body);
    }
  },
  bugReportVisibilityRead: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler() { return await _rpcWorkerCall('GET', '/admin/bug-reports/visibility', undefined); }
  },
  bugReportVisibilityWrite: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const visible_to = String(args && args.visible_to || '').trim();
      if (!visible_to) return { ok: false, status: 0, error: 'missing visible_to' };
      return await _rpcWorkerCall('POST', '/admin/bug-reports/visibility', { visible_to });
    }
  },
  // v9.6.0: Team-shared macros (custom ban messages + modmail responses)
  // Any mod can read/write via x-mod-token. Sync'd across team via worker.
  // Endpoints under /macros/* (NOT /admin/*) so EXTENSION_ID_ALLOWLIST gate
  // doesn't apply -- routine mod usage from any popup origin.
  macrosList: {
    allowed_callers: [RPC_CALLER_POPUP, RPC_CALLER_CONTENT],
    // AF-15 (Rule 43): schema for macrosList.
    schema: {
      kind: { type: 'string', required: true, enum: ['ban_msg', 'mm_reply'] }
    },
    async handler(args) {
      const kind = String(args && args.kind || '');
      if (kind !== 'ban_msg' && kind !== 'mm_reply') return { ok:false, status:0, error:'invalid_kind' };
      return await _rpcWorkerCall('GET', '/macros/list?kind=' + encodeURIComponent(kind), undefined);
    }
  },
  macroUpsert: {
    allowed_callers: [RPC_CALLER_POPUP, RPC_CALLER_CONTENT],
    // AF-15 (Rule 43): schema for macroUpsert.
    schema: {
      kind:  { type: 'string', required: true, enum: ['ban_msg', 'mm_reply'] },
      label: { type: 'string', required: true, max: 80 },
      body:  { type: 'string', required: true, max: 4000 }
    },
    async handler(args) {
      const kind = String(args && args.kind || '');
      const label = String(args && args.label || '').trim();
      const body = String(args && args.body || '').trim();
      if (kind !== 'ban_msg' && kind !== 'mm_reply') return { ok:false, status:0, error:'invalid_kind' };
      if (!label || !body) return { ok:false, status:0, error:'label_and_body_required' };
      if (label.length > 80) return { ok:false, status:0, error:'label_too_long' };
      if (body.length > 4000) return { ok:false, status:0, error:'body_too_long' };
      const payload = { kind, label, body };
      const id = args && args.id;
      if (Number.isFinite(id) && id > 0) payload.id = id;
      return await _rpcWorkerCall('POST', '/macros/upsert', payload);
    }
  },
  macroDelete: {
    allowed_callers: [RPC_CALLER_POPUP, RPC_CALLER_CONTENT],
    async handler(args) {
      const id = parseInt(args && args.id, 10);
      if (!Number.isFinite(id) || id <= 0) return { ok:false, status:0, error:'missing_id' };
      return await _rpcWorkerCall('POST', '/macros/delete', { id });
    }
  },
  macroUse: {
    allowed_callers: [RPC_CALLER_POPUP, RPC_CALLER_CONTENT],
    // AF-15 (Rule 43): schema for macroUse.
    schema: {
      id: { type: 'number', required: true, min: 1 }
    },
    async handler(args) {
      const id = parseInt(args && args.id, 10);
      if (!Number.isFinite(id) || id <= 0) return { ok:false, status:0, error:'missing_id' };
      return await _rpcWorkerCall('POST', '/macros/use', { id });
    }
  },
  // v9.6.1: AI-generated macro suggestions. Calls /macros/ai-suggest which
  // hits Workers AI Llama. Returns suggestion list WITHOUT inserting --
  // the popup decides which to upsert. Counts against per-mod AI budget.
  // v9.8.0: now passes existing_labels[] anti-list to prevent repetition.
  macroAiSuggest: {
    allowed_callers: [RPC_CALLER_POPUP, RPC_CALLER_CONTENT],
    async handler(args) {
      const kind = String(args && args.kind || '');
      if (kind !== 'ban_msg' && kind !== 'mm_reply') return { ok:false, status:0, error:'invalid_kind' };
      const count = Math.min(8, Math.max(3, parseInt(args && args.count, 10) || 5));
      const context = String(args && args.context || '').slice(0, 800);
      const existing_labels = Array.isArray(args && args.existing_labels)
        ? args.existing_labels.slice(0, 30).map(s => String(s || '').slice(0, 80))
        : [];
      return await _rpcWorkerCall('POST', '/macros/ai-suggest', { kind, count, context, existing_labels });
    }
  },
  // v9.23.0 SECURITY HOTFIX (Opus audit CRIT NEW-1): IDB auth backup
  // moved to SW (extension origin) from content script (page origin).
  // Page-origin IDB = exfil risk via GAW XSS. SW-origin IDB = isolated
  // to chrome-extension://<id>, no page can access.
  authBackupGet: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const key = String(args && args.key || '');
      if (!key || (key !== 'workerModToken' && key !== 'leadModToken')) {
        return { ok:false, status:0, error:'invalid_key' };
      }
      try {
        const db = await new Promise((resolve, reject) => {
          const r = indexedDB.open('gam_auth_backup', 1);
          r.onupgradeneeded = e => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains('tokens')) d.createObjectStore('tokens', { keyPath:'key' });
          };
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        const value = await new Promise((resolve) => {
          const tx = db.transaction('tokens', 'readonly');
          const req = tx.objectStore('tokens').get(key);
          req.onsuccess = () => resolve(req.result ? req.result.value : null);
          req.onerror = () => resolve(null);
        });
        return { ok:true, status:200, data:{ value } };
      } catch (e) {
        return { ok:false, status:0, error:String(e && e.message || e) };
      }
    }
  },
  authBackupPut: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const key = String(args && args.key || '');
      const value = String(args && args.value || '');
      if (!key || (key !== 'workerModToken' && key !== 'leadModToken')) {
        return { ok:false, status:0, error:'invalid_key' };
      }
      // Token shape validation (same as setTokens) before persisting
      if (value && !/^[A-Za-z0-9_-]{32,256}$/.test(value)) {
        return { ok:false, status:0, error:'invalid_shape' };
      }
      try {
        const db = await new Promise((resolve, reject) => {
          const r = indexedDB.open('gam_auth_backup', 1);
          r.onupgradeneeded = e => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains('tokens')) d.createObjectStore('tokens', { keyPath:'key' });
          };
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction('tokens', 'readwrite');
          tx.objectStore('tokens').put({ key, value, ts: Date.now() });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        return { ok:true, status:200 };
      } catch (e) {
        return { ok:false, status:0, error:String(e && e.message || e) };
      }
    }
  },
  // v9.14.0 - list recent modmail threads from modmail_threads (Commander #44).
  // v10.15.8 - real pagination: accept optional offset arg, forward to worker.
  modmailRecent: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const limit = Math.min(100, Math.max(5, parseInt(args && args.limit, 10) || 15));
      const offset = Math.min(5000, Math.max(0, parseInt(args && args.offset, 10) || 0));
      const qs = '?limit=' + limit + (offset > 0 ? ('&offset=' + offset) : '');
      return await _rpcWorkerCall('GET', '/modmail/recent' + qs, undefined);
    }
  },
  // v10.15.9 - batch risk stats for modmail thread rows. Takes users[] and
  // returns aggregated account_age_days + ban_count + actions_7d per user.
  // One batch RPC replaces N per-row lookups when rendering the inbox.
  modmailBatchRiskStats: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const users = Array.isArray(args && args.users) ? args.users : [];
      return await _rpcWorkerCall('POST', '/modmail/batch-risk-stats', { users });
    }
  },
  // v10.16.16 - mark a modmail thread as resolved without sending a reply.
  // Worker flips status='resolved' + claimed_by + last_seen. Use for
  // informational threads, thank-yous, or anything that doesn't warrant a
  // response but the mod wants off the active triage list.
  modmailMarkResolved: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const thread_id = String(args && args.thread_id || '');
      if (!thread_id) return { ok: false, error: 'thread_id required' };
      return await _rpcWorkerCall('POST', '/modmail/mark-resolved', { thread_id });
    }
  },
  // v9.13.0 - track a sent modmail response for AI history-awareness.
  // Best-effort, fire-and-forget. Caller passes (thread_id, sender,
  // response_body, optional subject/ai_used/ai_tone). Worker inserts row
  // into mod_modmail_responses for retrieval in /modmail/ai-reply-for-thread.
  modmailTrackResponse: {
    allowed_callers: [RPC_CALLER_CONTENT],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/modmail/track-response', {
        thread_id:     String(args && args.thread_id || ''),
        sender:        String(args && args.sender || ''),
        subject:       String(args && args.subject || ''),
        response_body: String(args && args.response_body || ''),
        ai_used:       args && args.ai_used ? 1 : 0,
        ai_tone:       args && args.ai_tone || null,
        sent_at:       Number(args && args.sent_at) || Date.now()
      });
    }
  },
  // v9.12.0 - AI sticky-request detector (Commander #17). Scans recent
  // modmail_messages for sticky requests, returns up to 10 with confidence.
  aiStickyDetect: {
    allowed_callers: [RPC_CALLER_POPUP, RPC_CALLER_CONTENT],
    async handler() {
      return await _rpcWorkerCall('POST', '/ai/sticky-detect', {});
    }
  },
  // v9.11.0 - AI top-10 health-report summary (Commander #21).
  aiHealthSummarize: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const report_json = String(args && args.report_json || '').slice(0, 32 * 1024);
      if (!report_json) return { ok:false, status:0, error:'report_json required' };
      return await _rpcWorkerCall('POST', '/ai/health-summarize', { report_json });
    }
  },
  // v9.11.0 - link preview metadata fetcher for hoverzoom-style chat
  // previews. Worker fetches the URL server-side, parses og:title +
  // og:description, returns to caller. Caches results to avoid hammering.
  linkPreview: {
    allowed_callers: [RPC_CALLER_CONTENT],
    async handler(args) {
      const url = String(args && args.url || '').slice(0, 1000);
      if (!url || !/^https?:\/\//i.test(url)) return { ok:false, status:0, error:'invalid url' };
      return await _rpcWorkerCall('POST', '/link/preview', { url });
    }
  },
  // v9.10.0: AI tard / sus-pattern suggester. Scans recent usernames in
  // gaw_users via the worker, returns up to 6 proposed patterns. Used to
  // surface a "Possible tards" panel in the popup / triage console.
  aiTardsSuggest: {
    allowed_callers: [RPC_CALLER_POPUP, RPC_CALLER_CONTENT],
    async handler() {
      return await _rpcWorkerCall('POST', '/ai/tards/suggest', {});
    }
  },
  // v9.9.0: lead-only mod chat wipe. Posts to /mod/message/clear-all which
  // enforces lead+name allowlist server-side. Worker logs an audit row.
  modMessageClearAll: {
    allowed_callers: [RPC_CALLER_CONTENT],
    async handler() {
      return await _rpcWorkerCall('POST', '/mod/message/clear-all', {});
    }
  },
  // v9.9.0: AI ban-reason summary (<=15 words) for auto-append to user notes
  // after a successful BAN. Best-effort, non-blocking; if AI fails the
  // caller falls back to first-14-words local truncation.
  aiSummarizeBan: {
    allowed_callers: [RPC_CALLER_CONTENT],
    async handler(args) {
      const reason = String(args && args.reason || '').slice(0, 800);
      if (!reason) return { ok:false, status:0, error:'reason_required' };
      return await _rpcWorkerCall('POST', '/ai/summarize-ban', {
        username:       String(args.username || '').slice(0, 64),
        violation:      String(args.violation || '').slice(0, 64),
        duration_label: String(args.duration_label || '').slice(0, 16),
        reason,
        evidence_url:   String(args.evidence_url || '').slice(0, 600)
      });
    }
  },
  // v9.8.0: per-thread modmail reply drafting. Distinct from macroAiSuggest.
  // Takes the actual thread context and returns 2 candidate replies that
  // DIFFER in tone (firm vs empathetic). Replaces the "AI suggest" button
  // in the ban-modal which previously discarded all context.
  modmailAiReplyForThread: {
    allowed_callers: [RPC_CALLER_POPUP, RPC_CALLER_CONTENT],
    async handler(args) {
      const sender = String(args && args.sender || '').slice(0, 64);
      if (!sender) return { ok:false, status:0, error:'sender_required' };
      const payload = {
        sender,
        subject:      String(args && args.subject || '').slice(0, 240),
        thread_id:    String(args && args.thread_id || '').slice(0, 120),
        violation:    String(args && args.violation || '').slice(0, 120),
        evidence_url: String(args && args.evidence_url || '').slice(0, 600),
        last_messages: Array.isArray(args && args.last_messages)
          ? args.last_messages.slice(-3).map(m => ({
              author: String(m && m.author || '').slice(0, 64),
              body:   String(m && m.body || '').slice(0, 600)
            }))
          : []
      };
      return await _rpcWorkerCall('POST', '/modmail/ai-reply-for-thread', payload);
    }
  },

  // v10.16.34 -- AI endpoints (Grok #16) -----------------------------------------
  // Three thin pass-throughs. Worker enforces auth + rate limits server-side.
  aiExplain: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    schema: {
      username:    { type: 'string', required: true, max: 64 },
      context:     { type: 'string', max: 32 },
      target_type: { type: 'string', max: 16 }
    },
    async handler(args) {
      return await _rpcWorkerCall('POST', '/ai/explain', {
        username:    String(args && args.username || '').slice(0, 64),
        context:     String(args && args.context || '').slice(0, 32),
        target_type: String(args && args.target_type || '').slice(0, 16)
      });
    }
  },
  aiSummarizeThread: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    schema: {
      thread_id: { type: 'string', max: 64 },
      content:   { type: 'string', required: true, max: 16000 }
    },
    async handler(args) {
      const content = String(args && args.content || '').slice(0, 16000);
      if (!content) return { ok: false, status: 0, error: 'content required' };
      const body = { content };
      if (args && args.thread_id) body.thread_id = String(args.thread_id).slice(0, 64);
      return await _rpcWorkerCall('POST', '/ai/summarize-thread', body);
    }
  },
  aiSuggestAction: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    schema: {
      username:        { type: 'string', required: true, max: 64 },
      context_summary: { type: 'string', max: 2000 }
    },
    async handler(args) {
      const username = String(args && args.username || '').slice(0, 64);
      if (!username) return { ok: false, status: 0, error: 'username required' };
      const body = {
        username,
        context_summary: String(args && args.context_summary || '').slice(0, 2000)
      };
      if (Array.isArray(args && args.recent_actions)) {
        body.recent_actions = args.recent_actions.slice(0, 50);
      }
      return await _rpcWorkerCall('POST', '/ai/suggest-action', body);
    }
  },

  // ---- modSus: cross-mod-visible "Mark SUS" flag (P1-3, v9.3.4) ----------
  // Worker: POST /mod/user/sus (any mod), GET /mod/user/sus, DELETE same.
  // Includes comment_count_24h per row for the BOLD-RED velocity override.
  modSusMark: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    // AF-15 (Rule 43): schema for modSusMark.
    schema: {
      username: { type: 'string', required: true, max: 64 },
      reason:   { type: 'string', max: 200 }
    },
    async handler(args) {
      const username = String(args && args.username || '');
      const reason   = String(args && args.reason || '');
      if (!username) return { ok: false, status: 0, error: 'missing username' };
      return await _rpcWorkerCall('POST', '/mod/user/sus', { username, reason });
    }
  },
  modSusList: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler() { return await _rpcWorkerCall('GET', '/mod/user/sus', undefined); }
  },
  modSusClear: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const username = String(args && args.username || '');
      if (!username) return { ok: false, status: 0, error: 'missing username' };
      return await _rpcWorkerCall('DELETE', '/mod/user/sus', { username });
    }
  },

  // ---- Death Row rule sync (P1-6, v9.3.5) --------------------------------
  // Worker: GET /mod/dr-rules (any mod), POST/DELETE /admin/dr-rules (lead).
  // Shared rules are read-only on the client; local rules in
  // gam_settings.autoDeathRowRules continue to work and merge with shared
  // at eval time (modtools.js side).
  modDrRulesList: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler() { return await _rpcWorkerCall('GET', '/mod/dr-rules', undefined); }
  },
  adminDrRulesAdd: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const pattern = String(args && args.pattern || '');
      const reason  = String(args && args.reason || '');
      const ttl_hours = parseInt(args && args.ttl_hours, 10);
      if (!pattern) return { ok: false, status: 0, error: 'missing pattern' };
      const body = { pattern, reason };
      if (Number.isFinite(ttl_hours) && ttl_hours > 0) body.ttl_hours = ttl_hours;
      return await _rpcWorkerCall('POST', '/admin/dr-rules', body, { asLead: true });
    }
  },
  adminDrRulesDelete: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const id = parseInt(args && args.id, 10);
      if (!Number.isFinite(id) || id <= 0) return { ok: false, status: 0, error: 'missing id' };
      return await _rpcWorkerCall('DELETE', '/admin/dr-rules', { id }, { asLead: true });
    }
  },

  // ---- Mod chat edit/delete (P1-7, v9.3.8) -------------------------------
  // Worker enforces 5-min edit window + own-message-only authorship from
  // the canonical token-derived username. Client just calls.
  modMessageEdit: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    // AF-15 (Rule 43): schema for modMessageEdit.
    schema: {
      id:      { type: 'number', required: true, min: 1 },
      content: { type: 'string', required: true, min: 1, max: 10000 }
    },
    async handler(args) {
      const id = parseInt(args && args.id, 10);
      const content = String(args && args.content || '');
      if (!Number.isFinite(id) || id <= 0) return { ok: false, status: 0, error: 'missing id' };
      if (!content) return { ok: false, status: 0, error: 'empty content' };
      return await _rpcWorkerCall('PUT', '/mod/message/edit', { id, content });
    }
  },
  modMessageDelete: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    // AF-15 (Rule 43): schema for modMessageDelete.
    schema: {
      id: { type: 'number', required: true, min: 1 }
    },
    async handler(args) {
      const id = parseInt(args && args.id, 10);
      if (!Number.isFinite(id) || id <= 0) return { ok: false, status: 0, error: 'missing id' };
      return await _rpcWorkerCall('DELETE', '/mod/message/delete', { id });
    }
  },

  // ---- authXxx: validate + store a candidate lead token ------------------
  authValidateLeadToken: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const candidate = String(args && args.token || '');
      if (!candidate) return { ok: false, status: 0, error: 'no token provided' };
      // Temporarily test the candidate against /presence/online (lead-gated).
      // Use the stored team token + candidate lead token.
      if (!secretCache.workerModToken && !secretCache.leadModToken) {
        try { await loadSecrets(); } catch (e) {}
      }
      const teamTok = secretCache.workerModToken;
      if (!teamTok) return { ok: false, status: 0, error: 'team token not set -- save team token first' };
      const ctrl = new AbortController();
      const timer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 15000);
      try {
        const headers = new Headers({ 'Content-Type': 'application/json' });
        headers.set('X-Mod-Token', teamTok);
        headers.set('X-Lead-Token', candidate);
        const r = await fetch(WORKER_BASE + '/presence/online', {
          method: 'POST', headers, body: '{}', signal: ctrl.signal
        });
        if (r.status === 403) return { ok: false, status: 403, error: 'not a lead-mod token' };
        if (!r.ok) return { ok: false, status: r.status, error: 'worker error (HTTP ' + r.status + ')' };
        // Valid -- store it.
        // v10.11 T1 (REDTEAM-1): encrypt before writing to chrome.storage.local.
        // v10.11 T3 (REDTEAM-1): record issued_at timestamp.
        secretCache.leadModToken = candidate;
        try {
          if (chrome.storage && chrome.storage.session) {
            await chrome.storage.session.set({ gam_settings: secretCache });
          }
          if (chrome.storage && chrome.storage.local) {
            const cur = await chrome.storage.local.get('gam_settings');
            const base = { ...((cur && cur.gam_settings) || {}), isLeadMod: true };
            delete base.leadModToken; // remove plaintext field
            try {
              base.leadModToken_encrypted = await _cryptEncrypt(candidate);
            } catch (_) {
              base.leadModToken = candidate; // IDB unavailable: fall back to plaintext
            }
            const nowMs = Date.now();
            base.leadModToken_issued_at = nowMs;
            base.leadModToken_expires_at = nowMs + (30 * 24 * 60 * 60 * 1000); // 30-day default
            await chrome.storage.local.set({ gam_settings: base });
          }
        } catch (e) {}
        return { ok: true, status: r.status, data: { verified: true } };
      } catch (e) {
        return { ok: false, status: 0, error: String(e && e.message || e), timeout: !!(e && e.name === 'AbortError') };
      } finally {
        clearTimeout(timer);
      }
    }
  },

  // ---- authXxx: popup-only, mod's own token management ------------------

  // v9.2.1 hotfix: verified save with read-back confirmation + 3-attempt retry.
  // The old silent-catch pattern returned ok:true even when storage failed,
  // leaving the user locked out after SW eviction. This version surfaces the
  // failure so the popup can show a CRITICAL recovery banner instead of a
  // false-success snack.
  authRotateSelf: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler() {
      const r = await _rpcWorkerCall('POST', '/mod/token/rotate', null);
      if (!(r.ok && r.data && typeof r.data.new_token === 'string')) return r;
      const persistResult = await _persistRotatedToken(r.data.new_token);
      if (!persistResult.saved) {
        return {
          ok: false,
          status: 500,
          error: 'rotation_save_failed',
          detail: 'Worker rotation succeeded but local storage write failed: ' + persistResult.lastError +
            '. Your token is at risk -- you may be locked out after a service-worker restart.' +
            ' Please use a lead-issued rotation invite to recover via /mod/token/claim-rotation.',
          new_token_in_memory: true
        };
      }
      return { ok: true, status: r.status, data: { ok: true, mod_username: r.data.mod_username, rotated: true } };
    }
  },
  authClaimInvite: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const r = await _rpcWorkerCall('POST', '/mod/token/claim-rotation', {
        code: args && args.code,
        username: args && args.username
      });
      if (!(r.ok && r.data && typeof r.data.new_token === 'string')) return r;
      const persistResult = await _persistRotatedToken(r.data.new_token);
      if (!persistResult.saved) {
        return {
          ok: false,
          status: 500,
          error: 'rotation_save_failed',
          detail: 'Worker claim succeeded but local storage write failed: ' + persistResult.lastError +
            '. Your token is at risk -- you may be locked out after a service-worker restart.' +
            ' Please retry the claim invite or contact the lead mod.',
          new_token_in_memory: true
        };
      }
      return { ok: true, status: r.status, data: { ok: true, mod_username: r.data.mod_username, claimed: true } };
    }
  },
  authGetMyDevices: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler() {
      return { ok: true, status: 200, data: { devices: [], stub: 'phase-3-pending' } };
    }
  },
  authRevokeMyDevice: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler() {
      return { ok: false, status: 501, error: 'phase-3-pending: device revocation lands with mod_devices schema' };
    }
  },

  // ---- modXxx: flags/* + profiles/* (Iter 2) --------------------------------
  modFlagsRead: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/flags/read', args || {});
    }
  },
  modFlagsWrite: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    // AF-15 (Rule 43): schema for modFlagsWrite.
    schema: {
      username: { type: 'string', required: true, max: 64 },
      severity: { type: 'string', required: true, enum: ['low', 'medium', 'high', 'critical'] },
      reason:   { type: 'string', max: 500 }
    },
    async handler(args) {
      return await _rpcWorkerCall('POST', '/flags/write', {
        username: args && args.username,
        mod: args && args.mod,
        severity: args && args.severity,
        reason: args && args.reason
      });
    }
  },
  modProfilesRead: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    // AF-15 (Rule 43): schema for modProfilesRead.
    schema: {
      usernames: { type: 'array', required: true, max: 50 }
    },
    async handler(args) {
      return await _rpcWorkerCall('POST', '/profiles/read', args || {});
    }
  },
  modProfilesWrite: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/profiles/write', {
        username: args && args.username,
        profile: args && args.profile
      });
    }
  },
  modProfilesWritePatch: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/profiles/write', {
        username: args && args.username,
        patch: args && args.patch
      });
    }
  },
  modProfilesSeen: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/profiles/seen', {
        users: args && args.users
      });
    }
  },

  // ---- modXxx: titles/* + deathrow/sniper/* (Iter 3) ----------------------
  modTitlesRead: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/titles/read', args || {});
    }
  },
  modTitlesWrite: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/titles/write', {
        username: args && args.username,
        title: args && args.title,
        kind: args && args.kind,
        mod: args && args.mod,
        expiresAt: args && args.expiresAt
      });
    }
  },
  modSniperArm: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/deathrow/sniper/arm', {
        username: args && args.username,
        mod: args && args.mod,
        banDelayHours: args && args.banDelayHours
      });
    }
  },
  modSniperList: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/deathrow/sniper/list', args || {});
    }
  },
  modSniperRemove: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/deathrow/sniper/remove', {
        username: args && args.username
      });
    }
  },

  // ---- modXxx: ai/* + ai-suspect (Iter 4) ----------------------------------
  modAiNextBestAction: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    // AF-15 (Rule 43): schema for modAiNextBestAction.
    schema: {
      kind:    { type: 'string', required: true },
      id:      { type: 'string', required: true, max: 128 },
      context: { type: 'string', max: 1000 }
    },
    async handler(args) {
      return await _rpcWorkerCall('POST', '/ai/next-best-action', {
        kind: args && args.kind,
        id: args && args.id,
        context: args && args.context,
        extra: args && args.extra,
        mod: args && args.mod
      });
    }
  },
  modAiGrokChat: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      // AF-12 (Rule 34): cap prompt at 8 KB — matches macroAiSuggest context cap discipline.
      const prompt = String(args && args.prompt || '').slice(0, 8192);
      return await _rpcWorkerCall('POST', '/ai/grok-chat', {
        prompt: prompt,
        max_tokens: args && args.max_tokens,
        temperature: args && args.temperature,
        model: args && args.model,
        prefer: args && args.prefer
      });
    }
  },
  modAiBanSuggest: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      // AF-12 (Rule 34): cap comment at 1500 for defense-in-depth (call sites already slice
      // but handler-level cap ensures no path bypasses the limit).
      const comment = String(args && args.comment || '').slice(0, 1500);
      return await _rpcWorkerCall('POST', '/ai/ban-suggest', {
        username: args && args.username,
        comment: comment,
        prompt: args && args.prompt
      });
    }
  },
  modAiScore: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/ai/score', {
        usernames: args && args.usernames
      });
    }
  },
  modAiShadowTriage: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/ai/shadow-triage', {
        kind: args && args.kind,
        subject_id: args && args.subject_id,
        context: args && args.context
      });
    }
  },
  modAiSuspectEnqueue: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/ai-suspect/enqueue', {
        username: args && args.username,
        ai_risk: args && args.ai_risk,
        ai_reason: args && args.ai_reason,
        source: args && args.source,
        ai_model: args && args.ai_model,
        prompt_version: args && args.prompt_version
      });
    }
  },

  // ---- modXxx: precedent/* + intel/* (Iter 5) ------------------------------
  modPrecedentFind: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/precedent/find', {
        kind: args && args.kind,
        signature: args && args.signature,
        limit: args && args.limit
      });
    }
  },
  modPrecedentMark: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/precedent/mark', {
        kind: args && args.kind,
        signature: args && args.signature,
        title: args && args.title,
        rule_ref: args && args.rule_ref,
        action: args && args.action,
        reason: args && args.reason,
        source_ref: args && args.source_ref
      }, { asLead: true });
    }
  },
  modIntelDelta: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/intel/delta', {
        kind: args && args.kind,
        id: args && args.id,
        since_ts: args && args.since_ts
      });
    }
  },

  // ---- modXxx: audit/query + presence/online (Iter 6) ----------------------
  modAuditQuery: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/audit/query', {
        sinceHours: args && args.sinceHours,
        limit: args && args.limit
      });
    }
  },
  modPresenceOnline: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/presence/online', args || {}, { asLead: true });
    }
  },

  // ---- modXxx: modmail/* + parked/* + bug/* + features/* + evidence/* + reports/* (Iter 7) --
  modModmailSync: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/modmail/sync', {
        mod: args && args.mod,
        threads: args && args.threads,
        messages: args && args.messages
      });
    }
  },
  modParkedCreate: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/parked/create', {
        kind: args && args.kind,
        subject_id: args && args.subject_id,
        note: args && args.note
      });
    }
  },
  modParkedList: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const qs = (args && args.status) ? ('?status=' + encodeURIComponent(String(args.status))) : '?status=open';
      return await _rpcWorkerCall('GET', '/parked/list' + qs, undefined);
    }
  },
  modParkedResolve: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/parked/resolve', {
        id: args && args.id,
        resolution_action: args && args.resolution_action,
        resolution_reason: args && args.resolution_reason
      });
    }
  },
  modBugReport: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    // AF-15 (Rule 43): schema for modBugReport.
    schema: {
      desc: { type: 'string', required: true, min: 20, max: 2000 }
    },
    async handler(args) {
      // v9.3.13 (Vanguard H-3): cap debugSnapshot at 16KB before relay.
      // The RPC arg-bytes ceiling is 256KB which a compromised mod token
      // could spam to blow D1 row-size budget. 16KB is plenty for the
      // snapshot fields we actually use (counts, status, env). Anything
      // larger is truncated with a marker.
      const _MAX_SNAPSHOT_BYTES = 16 * 1024;
      let snap = args && args.debugSnapshot;
      try {
        if (snap && typeof snap !== 'string') snap = JSON.stringify(snap);
        if (typeof snap === 'string' && snap.length > _MAX_SNAPSHOT_BYTES){
          snap = snap.slice(0, _MAX_SNAPSHOT_BYTES) + '\n…[TRUNCATED by SW v9.3.13 — was ' + (args.debugSnapshot.length || '?') + ' bytes]';
        }
      } catch (_) { snap = '[snapshot serialization error]'; }
      return await _rpcWorkerCall('POST', '/bug/report', {
        title: args && args.title,
        description: args && args.description,
        debugSnapshot: snap,
        mod: args && args.mod,
        payload: args && args.payload
      });
    }
  },
  modFeaturesRead: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler() {
      return await _rpcWorkerCall('GET', '/features/team/read', undefined);
    }
  },
  modFeaturesWrite: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/features/team/write', {
        feature: args && args.feature,
        value: args && args.value,
        mod: args && args.mod
      }, { asLead: true });
    }
  },
  modFeaturesDelete: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/features/team/delete', {
        feature: args && args.feature,
        mod: args && args.mod
      }, { asLead: true });
    }
  },
  modEvidenceUpload: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/evidence/upload', {
        key: args && args.key,
        contentType: args && args.contentType,
        contentBase64: args && args.contentBase64,
        meta: args && args.meta
      });
    }
  },
  modReportsSummary: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/reports/summary', args || {});
    }
  },

  // ---- modXxx: mod/message/* (Iter 8) -------------------------------------
  modMessageUnreadCount: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler() { return await _rpcWorkerCall('GET', '/mod/message/unread-count', undefined); }
  },
  modMessageModsList: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler() { return await _rpcWorkerCall('GET', '/mod/message/mods-list', undefined); }
  },
  modMessageMarkRead: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/mod/message/mark-read', { ids: args && args.ids });
    }
  },
  modMessageSend: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/mod/message/send', { to: args && args.to, content: args && args.content });
    }
  },
  modMessageInbox: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler() { return await _rpcWorkerCall('GET', '/mod/message/inbox', undefined); }
  },

  // ---- modXxx: drafts/* + proposals/* + claims/* + presence/viewing (Iter 8) -
  modDraftsWrite: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/drafts/write', {
        action: args && args.action, target: args && args.target, body: args && args.body
      });
    }
  },
  modDraftsDelete: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/drafts/delete', {
        action: args && args.action, target: args && args.target
      });
    }
  },
  modDraftsRead: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const action = encodeURIComponent(String(args && args.action || ''));
      const target = encodeURIComponent(String(args && args.target || ''));
      return await _rpcWorkerCall('GET', '/drafts/read?action=' + action + '&target=' + target, undefined);
    }
  },
  modDraftsList: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const mine = (args && args.mine) ? '?mine=1' : '';
      return await _rpcWorkerCall('GET', '/drafts/list' + mine, undefined);
    }
  },
  modDraftsHandoff: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/drafts/handoff', {
        action: args && args.action, target: args && args.target, handoff_note: args && args.handoff_note
      });
    }
  },
  modProposalsCreate: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) { return await _rpcWorkerCall('POST', '/proposals/create', args || {}); }
  },
  modProposalsList: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const since = (args && args.since != null) ? ('?since=' + encodeURIComponent(String(args.since))) : '';
      return await _rpcWorkerCall('GET', '/proposals/list' + since, undefined);
    }
  },
  modProposalsVote: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const isLead = !!(args && (args.action === 'Veto'));
      return await _rpcWorkerCall('POST', '/proposals/vote', {
        id: args && args.id, action: args && args.action
      }, { asLead: isLead });
    }
  },
  modClaimsWrite: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/claims/write', { thread_id: args && args.thread_id });
    }
  },
  modClaimsList: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler() { return await _rpcWorkerCall('GET', '/claims/list', undefined); }
  },
  modPresenceViewing: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      // _get:true => GET (collision check), default => POST (announce presence)
      if (args && args._get) {
        const kind = encodeURIComponent(String(args.kind || ''));
        const id = encodeURIComponent(String(args.id || ''));
        return await _rpcWorkerCall('GET', '/presence/viewing?kind=' + kind + '&id=' + id, undefined);
      }
      return await _rpcWorkerCall('POST', '/presence/viewing', { kind: args && args.kind, id: args && args.id });
    }
  },

  // ---- adminXxx: popup-only, must be lead-stepped-up (Phase 4 will gate) -
  adminListMods: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler() { return await _rpcWorkerCall('GET', '/admin/mod/list', undefined, { asLead: true }); }
  },
  adminIssueInvite: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      return await _rpcWorkerCall('POST', '/admin/mod/rotation-invite', {
        username: args && args.username
      }, { asLead: true });
    }
  },
  adminBulkInvite: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) { return await _rpcWorkerCall('POST', '/admin/mod/rotation-invite-bulk', args || {}, { asLead: true }); }
  },
  adminAuditVerify: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const limit = Math.min(50000, Math.max(1, parseInt(args && args.limit, 10) || 5000));
      const from = Math.max(0, parseInt(args && args.from, 10) || 0);
      return await _rpcWorkerCall('GET', '/admin/audit/verify?limit=' + limit + '&from=' + from, undefined, { asLead: true });
    }
  },
  // v10.16.26: lightweight audit-chain health summary (lead-only). Sub-100ms
  // aggregate query suitable for a 30s refresh tile in the popup.
  adminAuditHealth: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler() { return await _rpcWorkerCall('GET', '/admin/audit/health', undefined, { asLead: true }); }
  },
  // v10.16.29: remote AI key rotation (lead-only). Lead pastes new key →
  // worker stores in KV → all mods proxy through worker → new key live
  // for everyone without redeploy.
  adminAiKeyStatus: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler() { return await _rpcWorkerCall('GET', '/admin/ai-key/status', undefined, { asLead: true }); }
  },
  adminAiKeyRotate: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const provider = String(args && args.provider || '');
      const key = String(args && args.key || '');
      return await _rpcWorkerCall('POST', '/admin/ai-key/rotate', { provider, key }, { asLead: true });
    }
  },
  adminDisableMod: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler() {
      return { ok: false, status: 501, error: 'phase-2-pending: epoch-bump lands with mods table' };
    }
  },
  adminEpochBump: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler() {
      return { ok: false, status: 501, error: 'phase-2-pending: auth_epoch lands with mods table' };
    }
  },

  // v9.5.0 autonomous maintenance: lead-tier RPC for the Maintenance Reports
  // sub-section in the popup. Fetches recent reports across all mods.
  adminMaintenanceReportsList: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const days = Math.min(90, Math.max(1, parseInt(args && args.days, 10) || 14));
      const limit = Math.min(500, Math.max(1, parseInt(args && args.limit, 10) || 100));
      const sev = String(args && args.severity || '').trim();
      const qs = ['days=' + days, 'limit=' + limit];
      if (sev) qs.push('severity=' + encodeURIComponent(sev));
      return await _rpcWorkerCall('GET', '/admin/maintenance/reports?' + qs.join('&'), undefined, { asLead: true });
    }
  },
  // v9.5.0 autonomous maintenance: any-mod RPC for the local "Run weekly
  // health check now" button. Re-uses the same worker upload path the
  // alarm uses; popup wraps + reads chrome.storage.local for last_report
  // afterward.
  maintenanceRunNow: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler() {
      try {
        await _maintWeeklyRun();
        const r = await chrome.storage.local.get(MAINT_LAST_REPORT_KEY);
        return { ok: true, data: r && r[MAINT_LAST_REPORT_KEY] || null };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    }
  },

  // v10.x Multi-Lead: promote/demote a mod's tier. Lead-only endpoint.
  // payload: { mod_username: string, tier: 'mod'|'senior_lead'|'lead' }
  adminModPromote: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const username = String((args && args.mod_username) || (args && args.payload && args.payload.mod_username) || '').trim();
      const tier     = String((args && args.tier) || (args && args.payload && args.payload.tier) || '').trim();
      if (!username) return { ok: false, status: 400, error: 'mod_username required' };
      if (!['mod', 'senior_lead', 'lead'].includes(tier)) {
        return { ok: false, status: 400, error: 'tier must be mod|senior_lead|lead' };
      }
      return await _rpcWorkerCall('POST', '/admin/mod/promote', { mod_username: username, tier }, { asLead: true });
    }
  },

  // v10.x Lead KPI: lapsed mods query.
  // args: { days: number }
  adminModLapsed: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const days = Math.min(60, Math.max(7, parseInt((args && args.days) || 21, 10)));
      return await _rpcWorkerCall('GET', '/admin/mod/lapsed?days=' + days, undefined, { asLead: true });
    }
  },

  // v10.5.0: Discord DM — rotation invite blast to all unrotated mods.
  // args: { include_rotated?: bool, include_zip?: bool, dry_run?: bool }
  adminRotationDmAllUnrotated: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const payload = {
        include_rotated: !!(args && args.include_rotated),
        include_zip:     args && args.include_zip != null ? !!args.include_zip : true,
        dry_run:         !!(args && args.dry_run)
      };
      return await _rpcWorkerCall('POST', '/admin/rotation/dm-all-unrotated', payload, { asLead: true });
    }
  },

  // v10.5.0: Generate AI-drafted DM bodies for lead review.
  // args: { discord_id: string, kind: string, context_json?: {} }
  // Returns { nonce, drafts: [{tone, body}] } — NO send happens here.
  adminDiscordDmModWithAiDraft: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const discordId   = String((args && args.discord_id) || '').trim();
      const kind        = String((args && args.kind) || '').trim();
      const contextJson = (args && args.context_json) || {};
      if (!discordId) return { ok: false, status: 400, error: 'discord_id required' };
      if (!kind)      return { ok: false, status: 400, error: 'kind required' };
      return await _rpcWorkerCall('POST', '/admin/discord/dm-mod-with-ai-draft',
        { discord_id: discordId, kind, context_json: contextJson },
        { asLead: true });
    }
  },

  // v10.5.0: Send lead-approved DM to a mod via Discord.
  // If ai_draft_id supplied, body must match one of the 4 AI drafts.
  // args: { discord_id: string, body: string, source_kind?: string, ai_draft_id?: string }
  adminDiscordDmModSend: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      // AF-20 (Rule 58): feature gate — lead must explicitly enable Discord DM send.
      // discordDmSend is a send-path action with no undo; remote kill-switch is mandatory.
      try {
        var fgR = await chrome.storage.local.get('gam_settings');
        var fgS = (fgR && fgR.gam_settings) || {};
        var dmEnabled = !!(fgS.features && fgS.features['discordDmSend']);
        if (!dmEnabled) return { ok: false, error: 'feature disabled (features.discordDmSend)' };
      } catch (_) {
        return { ok: false, error: 'feature gate check failed' };
      }
      const discordId  = String((args && args.discord_id) || '').trim();
      const msgBody    = String((args && args.body) || '').trim();
      const sourceKind = String((args && args.source_kind) || '').trim();
      const aiDraftId  = String((args && args.ai_draft_id) || '').trim();
      if (!discordId) return { ok: false, status: 400, error: 'discord_id required' };
      if (!msgBody)   return { ok: false, status: 400, error: 'body required' };
      return await _rpcWorkerCall('POST', '/admin/discord/dm-mod-send',
        { discord_id: discordId, body: msgBody, source_kind: sourceKind || undefined, ai_draft_id: aiDraftId || undefined },
        { asLead: true });
    }
  },
  // v10.3 Patch 1: User similarity lookalikes. POSTs to /admin/users/lookalikes.
  adminUsersLookalikes: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const username = String((args && args.username) || '').slice(0, 64).trim();
      if (!username) return { ok: false, status: 400, error: 'username required' };
      const limit = Math.max(1, Math.min(10, parseInt((args && args.limit) || 5, 10)));
      return await _rpcWorkerCall('POST', '/admin/users/lookalikes', { username, limit });
    }
  },
  // v10.3 Patch 5: Thread commenter intel. GETs /mod/thread/intel?id=<post_id>.
  adminThreadIntel: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const postId = String((args && args.post_id) || '').slice(0, 64).trim();
      if (!postId) return { ok: false, status: 400, error: 'post_id required' };
      return await _rpcWorkerCall('GET', '/mod/thread/intel?id=' + encodeURIComponent(postId), null);
    }
  },

  // ASK-031: ban-preflight RPC — proxies to /mod/ban-preflight on the worker.
  // Called by modtools.js before apiBan fires. Returns kill-switch + quota check.
  // Worker may return 429 (with retry_after_seconds) or 503 (kill switch active).
  modBanPreflight: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    // WAVE-B-AUX A.1: schema mirrors the worker's expected body shape (ASK-032 perma-ban included).
    schema: {
      target:         { type: 'string',  required: true,  max: 64  },
      duration_hours: { type: 'number',  required: true,  min: 0,  max: 43800 },
      reason:         { type: 'string',  required: true,  max: 512 },
      permanent:      { type: 'boolean', required: false }
    },
    async handler(args) {
      if (!secretCache.workerModToken && !secretCache.leadModToken) {
        try { await loadSecrets(); } catch (e) {}
      }
      const ctrl = new AbortController();
      const timer = setTimeout(function() { try { ctrl.abort(); } catch (_) {} }, 15000);
      try {
        const headers = new Headers();
        if (secretCache.workerModToken) headers.set('X-Mod-Token', secretCache.workerModToken);
        headers.set('X-Extension-Id', chrome.runtime.id);
        headers.set('Content-Type', 'application/json');
        const r = await fetch(WORKER_BASE + '/mod/ban-preflight', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(args || {}),
          signal: ctrl.signal
        });
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {}
        // Pass 429 (retry_after_seconds) and 503 (kill switch) through as-is.
        return { ok: r.ok, status: r.status, data: parsed, text: text };
      } catch (e) {
        return { ok: false, status: 0, error: 'network failure', code: 'PREFLIGHT_NETWORK' };
      } finally {
        clearTimeout(timer);
      }
    }
  },

  // v10.8.0 A3: queue snapshot for M3 ticker popover — POST /mod/queue-snapshot.
  // Returns current mod action queue state (pending, processing, recent).
  modGetQueueSnapshot: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    schema: {
      limit: { type: 'number', required: false, min: 1, max: 50 }
    },
    async handler(args) {
      if (!secretCache.workerModToken && !secretCache.leadModToken) {
        try { await loadSecrets(); } catch (e) {}
      }
      const ctrl = new AbortController();
      const timer = setTimeout(function() { try { ctrl.abort(); } catch (_) {} }, 15000);
      try {
        const headers = new Headers();
        if (secretCache.workerModToken) headers.set('X-Mod-Token', secretCache.workerModToken);
        headers.set('X-Extension-Id', chrome.runtime.id);
        headers.set('Content-Type', 'application/json');
        const body = { limit: Math.min(50, Math.max(1, parseInt(args && args.limit, 10) || 10)) };
        const r = await fetch(WORKER_BASE + '/mod/queue-snapshot', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body),
          signal: ctrl.signal
        });
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {}
        return { ok: r.ok, status: r.status, data: parsed, text: text };
      } catch (e) {
        return { ok: false, status: 0, error: 'network failure', code: 'QUEUE_SNAPSHOT_NETWORK' };
      } finally {
        clearTimeout(timer);
      }
    }
  },

  // v10.8.0 A4: user cadence data for TARD-1 chip — GET /mod/user/cadence?username=<u>.
  modUserCadence: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    schema: {
      username: { type: 'string', required: true, max: 64 }
    },
    async handler(args) {
      if (!secretCache.workerModToken && !secretCache.leadModToken) {
        try { await loadSecrets(); } catch (e) {}
      }
      const username = String((args && args.username) || '').trim().slice(0, 64);
      if (!username) return { ok: false, status: 400, error: 'username required' };
      const ctrl = new AbortController();
      const timer = setTimeout(function() { try { ctrl.abort(); } catch (_) {} }, 15000);
      try {
        const headers = new Headers();
        if (secretCache.workerModToken) headers.set('X-Mod-Token', secretCache.workerModToken);
        headers.set('X-Extension-Id', chrome.runtime.id);
        const r = await fetch(WORKER_BASE + '/mod/user/cadence?username=' + encodeURIComponent(username), {
          method: 'GET',
          headers: headers,
          signal: ctrl.signal
        });
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {}
        return { ok: r.ok, status: r.status, data: parsed, text: text };
      } catch (e) {
        return { ok: false, status: 0, error: 'network failure', code: 'USER_CADENCE_NETWORK' };
      } finally {
        clearTimeout(timer);
      }
    }
  },

  // v10.9.0 A1: op-deletes feed — GET /mod/op-deletes?since=<ts>&limit=<n>.
  modOpDeletes: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    schema: {
      since: { type: 'number', required: false },
      limit: { type: 'number', required: false, max: 50 }
    },
    async handler(args) {
      if (!secretCache.workerModToken && !secretCache.leadModToken) {
        try { await loadSecrets(); } catch (e) {}
      }
      const since = (args && args.since) || (Date.now() - 24 * 3600 * 1000);
      const limit = Math.min(50, (args && args.limit) || 20);
      const ctrl = new AbortController();
      const timer = setTimeout(function() { try { ctrl.abort(); } catch (_) {} }, 15000);
      try {
        const headers = new Headers();
        if (secretCache.workerModToken) headers.set('X-Mod-Token', secretCache.workerModToken);
        headers.set('X-Extension-Id', chrome.runtime.id);
        const r = await fetch(
          WORKER_BASE + '/mod/op-deletes?since=' + encodeURIComponent(since) + '&limit=' + limit,
          { method: 'GET', headers: headers, signal: ctrl.signal }
        );
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {}
        return { ok: r.ok, status: r.status, data: parsed, text: text };
      } catch (e) {
        return { ok: false, status: 0, error: 'network failure', code: 'OP_DELETES_NETWORK' };
      } finally {
        clearTimeout(timer);
      }
    }
  },

  // v10.9.0 A2: brigade new-cluster detection — GET /mod/brigade/new-cluster?thread_id=<id>.
  modBrigadeNewCluster: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    schema: {
      thread_id: { type: 'string', required: true, max: 128 }
    },
    async handler(args) {
      if (!secretCache.workerModToken && !secretCache.leadModToken) {
        try { await loadSecrets(); } catch (e) {}
      }
      const thread_id = String((args && args.thread_id) || '').trim().slice(0, 128);
      if (!thread_id) return { ok: false, status: 400, error: 'thread_id required' };
      const ctrl = new AbortController();
      const timer = setTimeout(function() { try { ctrl.abort(); } catch (_) {} }, 15000);
      try {
        const headers = new Headers();
        if (secretCache.workerModToken) headers.set('X-Mod-Token', secretCache.workerModToken);
        headers.set('X-Extension-Id', chrome.runtime.id);
        const r = await fetch(
          WORKER_BASE + '/mod/brigade/new-cluster?thread_id=' + encodeURIComponent(thread_id),
          { method: 'GET', headers: headers, signal: ctrl.signal }
        );
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {}
        return { ok: r.ok, status: r.status, data: parsed, text: text };
      } catch (e) {
        return { ok: false, status: 0, error: 'network failure', code: 'BRIGADE_CLUSTER_NETWORK' };
      } finally {
        clearTimeout(timer);
      }
    }
  },

  // v10.9.0 A3: lookalike-confirmed lookup — GET /mod/user/lookalike-confirmed?username=<u>.
  modUserLookalikeConfirmed: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    schema: {
      username: { type: 'string', required: true, max: 64 }
    },
    async handler(args) {
      if (!secretCache.workerModToken && !secretCache.leadModToken) {
        try { await loadSecrets(); } catch (e) {}
      }
      const username = String((args && args.username) || '').trim().slice(0, 64);
      if (!username) return { ok: false, status: 400, error: 'username required' };
      const ctrl = new AbortController();
      const timer = setTimeout(function() { try { ctrl.abort(); } catch (_) {} }, 15000);
      try {
        const headers = new Headers();
        if (secretCache.workerModToken) headers.set('X-Mod-Token', secretCache.workerModToken);
        headers.set('X-Extension-Id', chrome.runtime.id);
        const r = await fetch(
          WORKER_BASE + '/mod/user/lookalike-confirmed?username=' + encodeURIComponent(username),
          { method: 'GET', headers: headers, signal: ctrl.signal }
        );
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {}
        return { ok: r.ok, status: r.status, data: parsed, text: text };
      } catch (e) {
        return { ok: false, status: 0, error: 'network failure', code: 'LOOKALIKE_CONFIRMED_NETWORK' };
      } finally {
        clearTimeout(timer);
      }
    }
  },

  // v10.10.0 S5: recent auto-actions feed -- GET /mod/auto-actions/recent?limit=N.
  // Used by GEAR Auto-Unsticky panel to render status line + popover table.
  modAutoActionRecent: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    schema: {
      limit: { type: 'number', required: false, max: 100 }
    },
    async handler(args) {
      if (!secretCache.workerModToken && !secretCache.leadModToken) {
        try { await loadSecrets(); } catch (e) {}
      }
      const limit = Math.min(100, (args && args.limit) || 20);
      const ctrl = new AbortController();
      const timer = setTimeout(function() { try { ctrl.abort(); } catch (_) {} }, 15000);
      try {
        const headers = new Headers();
        if (secretCache.workerModToken) headers.set('X-Mod-Token', secretCache.workerModToken);
        headers.set('X-Extension-Id', chrome.runtime.id);
        const r = await fetch(
          WORKER_BASE + '/mod/auto-actions/recent?limit=' + limit,
          { method: 'GET', headers: headers, signal: ctrl.signal }
        );
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) {}
        return { ok: r.ok, status: r.status, data: parsed, text: text };
      } catch (e) {
        return { ok: false, status: 0, error: 'network failure', code: 'AUTO_ACTION_RECENT_NETWORK' };
      } finally {
        clearTimeout(timer);
      }
    }
  },

  // ASK-031: ban-confirm RPC — fire-and-forget audit correlation after apiBan returns.
  // Never blocks the ban flow. Errors are logged and swallowed.
  modBanConfirm: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    // WAVE-B-AUX A.1: schema for the audit correlation payload.
    schema: {
      audit_id:           { type: 'string',  required: true,  max: 128 },
      gaw_response_status: { type: 'number',  required: true              },
      gaw_response_ok:    { type: 'boolean', required: true              }
    },
    async handler(args) {
      if (!secretCache.workerModToken && !secretCache.leadModToken) {
        try { await loadSecrets(); } catch (e) {}
      }
      try {
        const headers = new Headers();
        if (secretCache.workerModToken) headers.set('X-Mod-Token', secretCache.workerModToken);
        headers.set('X-Extension-Id', chrome.runtime.id);
        headers.set('Content-Type', 'application/json');
        await fetch(WORKER_BASE + '/mod/ban-confirm', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(args || {})
        });
      } catch (e) {
        // Fire-and-forget: log but never surface errors to the caller.
        console.warn('[ModTools ASK-031] modBanConfirm failed (non-fatal):', e && e.message || e);
      }
      return { ok: true };
    }
  },

  // v10.12.1 PA.3: diagReadRecent RPC — popup/bug-report payload reader fetches
  // recent diag entries from IDB. Replaces direct storage.local reads in modtools.js.
  diagReadRecent: {
    allowed_callers: [RPC_CALLER_POPUP],
    schema: { limit: { type: 'number' } },
    async handler(args) {
      try {
        var limit = Math.min(1000, Math.max(1, (args && args.limit) ? parseInt(args.limit, 10) || 500 : 500));
        var entries = await _diagReadRecent(limit);
        return { ok: true, data: entries };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    }
  },

  // v10.18.3: SW-side state for the SNAPSHOT FOR FIX debug capture.
  // Returns alarms + live worker version + boot-log tail. Called by the
  // content script's _gamSnapshotForFix() to merge with its DOM forensics.
  // Both callers (content + popup) allowed -- the popup Diag tab button
  // sends through the active GAW tab, but the popup itself may also invoke
  // when no GAW tab is open (degraded but still useful).
  snapshotSwState: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler() {
      try {
        var data = {
          alarms: [],
          workerVersion: null,
          recentBoots: [],
          bootCount: 0,
          lastBoot: null
        };
        try {
          var raw = await chrome.storage.local.get('gam_sw_boots');
          var boots = (raw && Array.isArray(raw.gam_sw_boots)) ? raw.gam_sw_boots : [];
          data.bootCount = boots.length;
          data.lastBoot = boots.length > 0 ? boots[boots.length - 1] : null;
          data.recentBoots = boots.slice(-10).map(function(b) {
            return {
              ts: b.ts || null,
              reason: b.reason || '?',
              v: b.v || '?',
              tier: b.tier || '?',
              boot_count: b.boot_count || 0
            };
          });
        } catch (_) {}
        try {
          var al = await new Promise(function(res) {
            try { chrome.alarms.getAll(function(a) { res(a || []); }); } catch (_) { res([]); }
          });
          data.alarms = (al || []).map(function(a) {
            return {
              name: a.name,
              nextIso: a.scheduledTime ? new Date(a.scheduledTime).toISOString() : null,
              periodInMinutes: a.periodInMinutes || null
            };
          });
        } catch (_) {}
        try {
          var resp = await fetch(WORKER_BASE + '/version', { method: 'GET' });
          if (resp && resp.ok) {
            var j = await resp.json();
            if (j && j.version) data.workerVersion = String(j.version);
          }
        } catch (_) {}
        return { ok: true, data: data };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    }
  },

  // v10.18.2: explicit user-gesture team-token reveal for the GOD MODE
  // popup-launcher button. The standalone /godmode app is served from the
  // workers.dev origin -- it cannot reach the SW vault directly, so the
  // popup hands the token off via clipboard + new-tab open. POPUP-ONLY:
  // content scripts and the worker can never invoke this. Every call is
  // diag-logged so any future abuse path is forensically recoverable.
  popupRevealTeamToken: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler() {
      try {
        if (!secretCache || !secretCache.workerModToken) {
          try { await loadSecrets(); } catch (_) {}
        }
        var token = secretCache && secretCache.workerModToken;
        if (!token) {
          return { ok: false, error: 'no team token stored' };
        }
        try {
          await _maintAppendDiag('tokens.reveal.popup', 'ok',
            { ts: Date.now(), reason: 'godmode handoff', len: String(token).length });
        } catch (_) {}
        return { ok: true, token: String(token) };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    }
  }
};

// v8.6.9: arg payload size cap. Prevents a compromised content script
// from DoSing the worker via a 10MB details object on modAuditLog or
// similar. 256KB is well above any legitimate RPC arg shape (~1KB
// average) and well below the worker's 1MB body cap. Stringify cost is
// bounded since we only do it on the size check, not on the wire.
const _RPC_MAX_ARG_BYTES = 256 * 1024;

// v8.6.9: defense-in-depth origin check. The chrome.runtime.id guard at
// the top of the message listener already rejects cross-extension
// senders. This is for content-script-context RPCs: confirm the page
// origin is one we expect (greatawakening.win) before letting modXxx
// run. Popup/options-page senders have no sender.tab so they pass
// through untouched -- the lead-token gate handles those.
const _ALLOWED_CONTENT_ORIGINS = [
  'https://greatawakening.win',
  'http://greatawakening.win'
];

function _validateRpcSenderOrigin(callerCtx, sender) {
  if (callerCtx !== 'content') return true; // popup/options: no tab origin
  // v9.3.15 (Vanguard Round-2 ER2-C-1): origin must be checked via
  // `new URL().origin` exact-equal, NOT prefix-string matching. The pre-fix
  // `url.indexOf(o) === 0` accepted hostname-confusion attacks like
  // `https://greatawakening.win.evil.com/x` (string-prefix matches but
  // origin is evil.com) and userinfo-spoof like
  // `https://greatawakening.win@evil.com/`. String-prefix is NEVER a valid
  // origin check.
  const url = sender && sender.url ? String(sender.url) : '';
  if (!url) return false;
  let parsedOrigin;
  try { parsedOrigin = new URL(url).origin; } catch (_) { return false; }
  for (const o of _ALLOWED_CONTENT_ORIGINS) {
    if (parsedOrigin === o) return true;
  }
  return false;
}

// AF-15 (Rule 43): inline schema validator for RPC args. Zero imports, zero deps.
// schema: { [field]: { type, required?, min?, max?, pattern?, enum? } }
// Covers 95% case: string/number/array/boolean with length/range/regex constraints.
function validateRpc(args, schema) {
  if (!schema) return { ok: true };
  var a = args || {};
  for (var field in schema) {
    if (!Object.prototype.hasOwnProperty.call(schema, field)) continue;
    var rule = schema[field];
    var v = a[field];
    var missing = (v === undefined || v === null || v === '');
    if (rule.required && missing) return { ok: false, error: 'missing required field: ' + field };
    if (missing) continue;
    if (rule.type === 'string') {
      if (typeof v !== 'string') return { ok: false, error: field + ' must be string' };
      if (rule.min != null && v.length < rule.min) return { ok: false, error: field + ' too short (min ' + rule.min + ')' };
      if (rule.max != null && v.length > rule.max) return { ok: false, error: field + ' too long (max ' + rule.max + ')' };
      if (rule.pattern && !rule.pattern.test(v)) return { ok: false, error: field + ' failed pattern check' };
      if (rule.enum && !rule.enum.includes(v)) return { ok: false, error: field + ' must be one of: ' + rule.enum.join(', ') };
    } else if (rule.type === 'number') {
      var n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) return { ok: false, error: field + ' must be a finite number' };
      if (rule.min != null && n < rule.min) return { ok: false, error: field + ' below minimum ' + rule.min };
      if (rule.max != null && n > rule.max) return { ok: false, error: field + ' above maximum ' + rule.max };
    } else if (rule.type === 'boolean') {
      if (typeof v !== 'boolean') return { ok: false, error: field + ' must be boolean' };
    } else if (rule.type === 'array') {
      if (!Array.isArray(v)) return { ok: false, error: field + ' must be array' };
      if (rule.max != null && v.length > rule.max) return { ok: false, error: field + ' array too long (max ' + rule.max + ')' };
    }
  }
  return { ok: true };
}

// AF-13 (Rule 39): per-RPC-name rate limiter. Enforced SW-side so a compromised
// content script cannot bypass client-side debounces.
const _RPC_WINDOWS = new Map();
const _RPC_LIMITS = {
  modAuditLog:       { maxPerMin: 60 },
  modProfilesWrite:  { maxPerMin: 20 },
  modAiGrokChat:     { maxPerMin: 10 },
  modPresencePing:   { maxPerMin: 6  },
  // ASK-031 / WAVE-B-AUX A.1: ban-preflight + ban-confirm rate limits.
  // 30/min each is generous for actual ban throughput (~1-3/min peak).
  modBanPreflight:   { maxPerMin: 30 },
  modBanConfirm:     { maxPerMin: 30 },
  // v10.8.0 A3/A4: queue snapshot (ticker popover) + user cadence (TARD-1 chip).
  modGetQueueSnapshot: { maxPerMin: 30 },
  modUserCadence:      { maxPerMin: 60 },
  // v10.9.0 A1-A3: op-deletes, brigade new-cluster, lookalike-confirmed.
  modOpDeletes:                { maxPerMin: 30 },
  modBrigadeNewCluster:        { maxPerMin: 60 },
  modUserLookalikeConfirmed:   { maxPerMin: 60 },
  // v10.10.0 S5: auto-action recent feed.
  modAutoActionRecent:         { maxPerMin: 30 }
};

function _rpcRateCheck(name) {
  var limit = _RPC_LIMITS[name];
  if (!limit) return true;
  var now = Date.now();
  var window = (_RPC_WINDOWS.get(name) || []).filter(function(t) { return now - t < 60000; });
  if (window.length >= limit.maxPerMin) {
    console.warn('[ModTools AF-13] RPC rate-limited:', name, window.length + '/min');
    return false;
  }
  window.push(now);
  _RPC_WINDOWS.set(name, window);
  return true;
}

async function _dispatchRpc(name, args, sender) {
  // v10.12.1 PA.2: gate RPC on init-ready to fix cold-boot 401 race
  await _initOnce();
  // AF-13 (Rule 39): per-name rate check before any handler runs.
  if (!_rpcRateCheck(String(name || ''))) {
    return { ok: false, status: 429, error: 'rate limited (' + String(name) + ')' };
  }
  const def = RPC_HANDLERS[String(name || '')];
  if (!def) return { ok: false, status: 0, error: 'unknown rpc: ' + String(name) };
  const callerCtx = _classifyCaller(sender);
  if (!def.allowed_callers.includes(callerCtx)) {
    return { ok: false, status: 0, error: 'rpc ' + name + ' refused for caller-context ' + String(callerCtx) };
  }
  // v8.6.9: origin guard for content-script RPCs.
  if (!_validateRpcSenderOrigin(callerCtx, sender)) {
    console.warn('[rpc] origin rejected: ' + (sender && sender.url));
    return { ok: false, status: 0, error: 'rpc ' + name + ' refused: sender origin not allow-listed' };
  }
  // v8.6.9: arg size cap.
  try {
    if (args != null) {
      const argSize = JSON.stringify(args).length;
      if (argSize > _RPC_MAX_ARG_BYTES) {
        return { ok: false, status: 0, error: 'rpc ' + name + ' refused: args too large (' + argSize + ' bytes > ' + _RPC_MAX_ARG_BYTES + ')' };
      }
    }
  } catch (sizeErr) {
    return { ok: false, status: 0, error: 'rpc ' + name + ' refused: args not serializable' };
  }
  // AF-15 (Rule 43): field-level schema validation (if handler declares a schema).
  if (def.schema) {
    const sv = validateRpc(args, def.schema);
    if (!sv.ok) return { ok: false, status: 400, error: 'schema: ' + sv.error };
  }
  try {
    return await def.handler(args || {}, { caller: callerCtx });
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message || e) };
  }
}

// AF-25 (Rule 75): Handle revoked permissions by disabling affected features cleanly.
// When the user revokes a host permission via the Chrome address-bar chip or
// extensions management page, zero secretCache and broadcast to all affected tabs
// so the content script can tear down UI and show a user-readable banner.
const _FEATURE_PERMISSION_MAP = {
  'https://greatawakening.win/*':   ['modtools_ui', 'workerFetch', 'inboxIntel', 'modChat', 'modmailBackfill'],
  'https://*.greatawakening.win/*': ['modtools_ui', 'workerFetch', 'inboxIntel', 'modChat', 'modmailBackfill'],
};

if (chrome.permissions && chrome.permissions.onRemoved) {
  chrome.permissions.onRemoved.addListener(async (permissions) => {
    const revokedOrigins = (permissions && permissions.origins) || [];
    if (revokedOrigins.length === 0) return;

    const affectedFeatures = new Set();
    for (const origin of revokedOrigins) {
      const features = _FEATURE_PERMISSION_MAP[origin];
      if (features) features.forEach(function(f) { affectedFeatures.add(f); });
    }
    if (affectedFeatures.size === 0) return;

    console.warn('[ModTools AF-25] Host permissions revoked:', revokedOrigins,
                 '-- disabling:', Array.from(affectedFeatures));

    // Clear in-RAM secret cache so workerFetch stops attempting calls.
    if (affectedFeatures.has('workerFetch')) {
      secretCache = { workerModToken: '', leadModToken: '' };
    }

    // Notify all tabs that match the revoked origins so the content script
    // can suppress UI and surface a user-readable banner.
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (!tab.id || !tab.url) continue;
        try {
          const tabOrigin = new URL(tab.url).origin;
          const isAffected = revokedOrigins.some(function(o) {
            const base = o.replace(/\/\*$/, '');
            return tabOrigin === base ||
                   tabOrigin.endsWith('.' + base.replace(/^https?:\/\/\*\./, ''));
          });
          if (!isAffected) continue;
          chrome.tabs.sendMessage(tab.id, {
            type: 'permissionsRevoked',
            origins: revokedOrigins,
            features: Array.from(affectedFeatures)
          }).catch(function() { /* tab may not have content script */ });
        } catch (_) {}
      }
    } catch (_) {}
  });
}
// AF-25 (Rule 75) END
