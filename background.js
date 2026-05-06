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

// v7.2 CHUNK 14: allow content scripts to read/write chrome.storage.session
// so invite codes staged from a GAW page (content script) can be consumed
// from the popup. setAccessLevel is session-lifetime; calling it on install
// AND startup keeps it armed across SW evictions. No-op on older Chrome
// builds (wrapped try/catch).
async function __ensureSessionAccess(){
  try {
    if (chrome.storage && chrome.storage.session && typeof chrome.storage.session.setAccessLevel === 'function'){
      await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
    }
  } catch (e) { /* older Chrome: access-level API absent; content script will fail gracefully */ }
}

async function loadSecrets() {
  try {
    let s = {};
    if (chrome.storage && chrome.storage.session) {
      const out = await chrome.storage.session.get('gam_settings');
      s = (out && out.gam_settings) || {};
    }
    // Fallback to durable local settings if session storage is empty (e.g.
    // service-worker restart or browser restart before popup re-sync).
    if ((!s.workerModToken && !s.leadModToken) && chrome.storage && chrome.storage.local) {
      try {
        const localOut = await chrome.storage.local.get('gam_settings');
        const ls = (localOut && localOut.gam_settings) || {};
        s = {
          workerModToken: ls.workerModToken || '',
          leadModToken: ls.leadModToken || ''
        };
      } catch (e) {}
    }
    secretCache = {
      workerModToken: s.workerModToken || '',
      leadModToken: s.leadModToken || ''
    };
  } catch (e) { /* service-worker may have been evicted; cache stays empty */ }
}

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

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[ModTools] Installed:', details.reason);
  // (Re)create the recurring update-check alarm on install/update
  try {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN });
    chrome.alarms.create(BUG_POLL_ALARM, { periodInMinutes: BUG_POLL_PERIOD_MIN });
    // v9.5.0 maintenance alarms.
    chrome.alarms.create(MAINT_QUOTA_ALARM, { periodInMinutes: MAINT_QUOTA_PERIOD_MIN });
    chrome.alarms.create(MAINT_TOKEN_AGE_ALARM, { periodInMinutes: MAINT_TOKEN_AGE_PERIOD_MIN });
    chrome.alarms.create(MAINT_DIAG_ROTATE_ALARM, { periodInMinutes: MAINT_DIAG_ROTATE_PERIOD_MIN });
    chrome.alarms.create(MAINT_INTEL_EVICT_ALARM, { periodInMinutes: MAINT_INTEL_EVICT_PERIOD_MIN });
    chrome.alarms.create(MAINT_WEEKLY_ALARM, { periodInMinutes: MAINT_WEEKLY_PERIOD_MIN });
  } catch (e) { console.warn('[ModTools] alarm create failed', e); }
  // v8.6.9: AWAIT __ensureSessionAccess so subsequent storage calls don't
  // fire before the session-area access level is set. Pre-fix race: the
  // setAccessLevel call was async-fired but not awaited; consumers that
  // hit chrome.storage.session immediately after install could fail.
  try { await __ensureSessionAccess(); } catch (e) {}
  try { await loadSecrets(); } catch (e) {}
});

// Also ensure the alarm is alive on service-worker wake-up
chrome.runtime.onStartup?.addListener(async () => {
  try {
    chrome.alarms.get(ALARM_NAME, (a) => {
      if (!a) chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN });
    });
    chrome.alarms.get(BUG_POLL_ALARM, (a) => {
      if (!a) chrome.alarms.create(BUG_POLL_ALARM, { periodInMinutes: BUG_POLL_PERIOD_MIN });
    });
    // v9.5.0 maintenance alarms — ensure alive on SW wake.
    chrome.alarms.get(MAINT_QUOTA_ALARM, (a) => {
      if (!a) chrome.alarms.create(MAINT_QUOTA_ALARM, { periodInMinutes: MAINT_QUOTA_PERIOD_MIN });
    });
    chrome.alarms.get(MAINT_TOKEN_AGE_ALARM, (a) => {
      if (!a) chrome.alarms.create(MAINT_TOKEN_AGE_ALARM, { periodInMinutes: MAINT_TOKEN_AGE_PERIOD_MIN });
    });
    chrome.alarms.get(MAINT_DIAG_ROTATE_ALARM, (a) => {
      if (!a) chrome.alarms.create(MAINT_DIAG_ROTATE_ALARM, { periodInMinutes: MAINT_DIAG_ROTATE_PERIOD_MIN });
    });
    chrome.alarms.get(MAINT_INTEL_EVICT_ALARM, (a) => {
      if (!a) chrome.alarms.create(MAINT_INTEL_EVICT_ALARM, { periodInMinutes: MAINT_INTEL_EVICT_PERIOD_MIN });
    });
    chrome.alarms.get(MAINT_WEEKLY_ALARM, (a) => {
      if (!a) chrome.alarms.create(MAINT_WEEKLY_ALARM, { periodInMinutes: MAINT_WEEKLY_PERIOD_MIN });
    });
  } catch (e) {}
  // v8.6.9: AWAIT both bootstrap calls so the SW is fully ready before
  // any incoming RPC handler fires.
  try { await __ensureSessionAccess(); } catch (e) {}
  try { await loadSecrets(); } catch (e) {}
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
  try {
    const r = await chrome.storage.local.get(MAINT_DIAG_KEY);
    const log = (r[MAINT_DIAG_KEY] || []).slice(-(MAINT_DIAG_MAX - 1));
    log.push({
      ts: Date.now(),
      iso: new Date().toISOString(),
      cat: 'maint',
      msg: String(routine || ''),
      extra: { result, ...(extra || null) },
      stack: null,
      v: chrome.runtime.getManifest().version
    });
    await chrome.storage.local.set({ [MAINT_DIAG_KEY]: log });
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
  } catch (e) {
    await _maintAppendDiag('alarm.tokenAge', 'err', { error: String(e && e.message || e) });
  }
}

async function _maintDiagRotate() {
  try {
    const r = await chrome.storage.local.get(MAINT_DIAG_KEY);
    const log = r[MAINT_DIAG_KEY] || [];
    if (log.length <= MAINT_DIAG_MAX) {
      await _maintAppendDiag('alarm.diagRotate', 'noop', { count: log.length });
      return;
    }
    const trimmed = log.slice(-MAINT_DIAG_MAX);
    await chrome.storage.local.set({ [MAINT_DIAG_KEY]: trimmed });
    await _maintAppendDiag('alarm.diagRotate', 'ok',
      { dropped: log.length - MAINT_DIAG_MAX, kept: MAINT_DIAG_MAX });
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

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === BUG_POLL_ALARM) { await _bugPollAndBadge(); return; }
  // v9.5.0 maintenance alarms.
  if (alarm.name === MAINT_QUOTA_ALARM)        { await _maintQuotaCheck();    return; }
  if (alarm.name === MAINT_TOKEN_AGE_ALARM)    { await _maintTokenAgeCheck(); return; }
  if (alarm.name === MAINT_DIAG_ROTATE_ALARM)  { await _maintDiagRotate();    return; }
  if (alarm.name === MAINT_INTEL_EVICT_ALARM)  { await _maintIntelEvict();    return; }
  if (alarm.name === MAINT_WEEKLY_ALARM)       { await _maintWeeklyRun();     return; }
  if (alarm.name !== ALARM_NAME) return;
  try {
    const resp = await fetch(VERSION_JSON_URL, { cache: 'no-store' });
    if (!resp.ok) return;
    const data = await resp.json();
    const remote = (data && typeof data.version === 'string') ? data.version : null;
    if (!remote) return;
    const local = chrome.runtime.getManifest().version;
    if (remote === local) {
      // We are current. Clear any stale notification flag so the banner
      // disappears once the user actually reloads.
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
  // v5.8.1 security: same-extension sender guard (HIGH-4)
  if (sender.id !== chrome.runtime.id) return;

  if (msg && msg.type === 'ping') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
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
    const last = _UPDATE_FLAG_LAST_SET;
    const matches = !!(last && presented
      && last.from === presented.from
      && last.to === presented.to
      && last.firstSeenAt === presented.firstSeenAt);
    sendResponse({ ok: matches, expected: matches ? null : 'flag does not match SW-set value' });
    return true;
  }

  if (msg && msg.type === 'tokensStatus') {
    (async () => {
      // Prefer live RAM; fall back to session store if the service worker
      // was just revived.
      if (!secretCache.workerModToken && !secretCache.leadModToken) {
        try { await loadSecrets(); } catch (e) {}
      }
      sendResponse({
        ok: true,
        hasTeamToken: !!secretCache.workerModToken,
        hasLeadToken: !!secretCache.leadModToken
      });
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
      sendResponse(out);
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
async function _persistRotatedToken(newTokenPlaintext) {
  // Update in-memory SW vault immediately so this SW lifecycle still works.
  secretCache.workerModToken = newTokenPlaintext;

  var saved = false;
  var lastError = null;
  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      var cur = await chrome.storage.local.get('gam_settings');
      var merged = Object.assign({}, (cur && cur.gam_settings) || {}, { workerModToken: newTokenPlaintext });
      await chrome.storage.local.set({ gam_settings: merged });
      // Read back to confirm -- chrome.storage.local is generally reliable but
      // can fail silently under disk quota or extension update races.
      var verify = await chrome.storage.local.get('gam_settings');
      var verifiedToken = verify && verify.gam_settings && verify.gam_settings.workerModToken;
      if (verifiedToken === newTokenPlaintext) {
        saved = true;
        break;
      }
      lastError = 'verify mismatch on attempt ' + attempt;
    } catch (e) {
      lastError = String((e && e.message) || e);
    }
    // Exponential-ish backoff: 100ms, 200ms before attempt 3
    await new Promise(function(res) { setTimeout(res, 100 * attempt); });
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
  modSearch: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) {
      const q = encodeURIComponent(String(args && args.q || ''));
      const scope = encodeURIComponent(String(args && args.scope || 'both'));
      const limit = Math.min(200, Math.max(1, parseInt(args && args.limit, 10) || 50));
      return await _rpcWorkerCall('GET', '/gaw/search?q=' + q + '&scope=' + scope + '&limit=' + limit, undefined);
    }
  },
  modPresencePing: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
    async handler(args) { return await _rpcWorkerCall('POST', '/presence/ping', args || {}); }
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
        secretCache.workerModToken = candidate;
        try {
          if (chrome.storage && chrome.storage.session) {
            await chrome.storage.session.set({ gam_settings: secretCache });
          }
          if (chrome.storage && chrome.storage.local) {
            const cur = await chrome.storage.local.get('gam_settings');
            const merged = { ...((cur && cur.gam_settings) || {}), workerModToken: candidate };
            await chrome.storage.local.set({ gam_settings: merged });
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
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const key = String(args && args.key || '');
      const value = String(args && args.value || '');
      if (!key) return { ok: false, status: 0, error: 'missing key' };
      return await _rpcWorkerCall('PUT', '/admin/settings', { key, value }, { asLead: true });
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

  // ---- modSus: cross-mod-visible "Mark SUS" flag (P1-3, v9.3.4) ----------
  // Worker: POST /mod/user/sus (any mod), GET /mod/user/sus, DELETE same.
  // Includes comment_count_24h per row for the BOLD-RED velocity override.
  modSusMark: {
    allowed_callers: [RPC_CALLER_CONTENT, RPC_CALLER_POPUP],
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
        secretCache.leadModToken = candidate;
        try {
          if (chrome.storage && chrome.storage.session) {
            await chrome.storage.session.set({ gam_settings: secretCache });
          }
          if (chrome.storage && chrome.storage.local) {
            const cur = await chrome.storage.local.get('gam_settings');
            const merged = { ...((cur && cur.gam_settings) || {}), leadModToken: candidate, isLeadMod: true };
            await chrome.storage.local.set({ gam_settings: merged });
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
      return await _rpcWorkerCall('POST', '/ai/grok-chat', {
        prompt: args && args.prompt,
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
      return await _rpcWorkerCall('POST', '/ai/ban-suggest', {
        username: args && args.username,
        comment: args && args.comment,
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

async function _dispatchRpc(name, args, sender) {
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
  try {
    return await def.handler(args || {}, { caller: callerCtx });
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message || e) };
  }
}
