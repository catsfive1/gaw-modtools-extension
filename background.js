// GAW ModTools - Background Service Worker
// v5.8.2: adds auto-reload-on-update via chrome.alarms.
// v7.2: adds secret vault + workerFetch relay (platformHardening flag-on).
//
// Flow:
//   1. Windows Task Scheduler runs update-modtools.ps1 every 30 min (see
//      install-auto-update.ps1). That overwrites modtools-ext/ on disk.
//   2. This alarm fires every 30 min and compares our loaded
//      chrome.runtime.getManifest().version to the published version.json
//      in the shared-flags repo.
//   3. If GitHub shows a NEWER version AND our manifest still reports the
//      old one, the files on disk were updated but Chrome is still running
//      the old copy -- so we call chrome.runtime.reload() to swap in fresh
//      code.
//   4. If GitHub version == our loaded version, reload is pointless; skip.

const VERSION_JSON_URL = 'https://raw.githubusercontent.com/catsfive1/gaw-mod-shared-flags/main/version.json';
const ALARM_NAME = 'gam_update_check';
const ALARM_PERIOD_MIN = 30;

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
const ALLOWED_ENDPOINTS = [
  '/presence', '/drafts', '/proposals', '/claims', '/audit', '/features',
  '/ai/next-best-action', '/ai/analyze', '/bug/report', '/invite/claim',
  '/admin/import-tokens-from-kv', '/modmail/sync',
  // v8.0 Team Productivity endpoints (Session A backend lands in Session C deploy).
  '/ai/shadow-triage', '/parked', '/ai-suspect'
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
    if (!chrome.storage || !chrome.storage.session) return;
    const out = await chrome.storage.session.get('gam_settings');
    const s = (out && out.gam_settings) || {};
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

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[ModTools] Installed:', details.reason);
  // v7.2: removed the storage-inventory console.log call from onInstalled
  // (previously dumped every key in chrome.storage.local -- now gone).
  // (Re)create the recurring update-check alarm on install/update
  try {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN });
  } catch (e) { console.warn('[ModTools] alarm create failed', e); }
  // v7.2: warm the secret cache on install/update.
  try { loadSecrets(); } catch (e) {}
  // v7.2 CHUNK 14: open session storage to content scripts.
  try { __ensureSessionAccess(); } catch (e) {}
});

// Also ensure the alarm is alive on service-worker wake-up
chrome.runtime.onStartup?.addListener(() => {
  try {
    chrome.alarms.get(ALARM_NAME, (a) => {
      if (!a) chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MIN });
    });
  } catch (e) {}
  // v7.2: warm the secret cache on each cold start.
  try { loadSecrets(); } catch (e) {}
  // v7.2 CHUNK 14: re-arm session access after SW eviction.
  try { __ensureSessionAccess(); } catch (e) {}
});

// v7.2 CHUNK 14: also arm on module load so a freshly-reloaded SW never
// leaves the session area locked to extension-only contexts.
try { __ensureSessionAccess(); } catch (e) {}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  try {
    const resp = await fetch(VERSION_JSON_URL, { cache: 'no-store' });
    if (!resp.ok) return;
    const data = await resp.json();
    const remote = (data && typeof data.version === 'string') ? data.version : null;
    if (!remote) return;
    const local = chrome.runtime.getManifest().version;
    if (remote === local) return;                     // we're up to date
    // Newer remote AND local files may have been refreshed by the scheduled
    // task -- reload the extension so Chrome picks up the on-disk changes.
    // If the scheduled task HASN'T run, this reload is a no-op and we retry
    // next tick.
    console.log('[ModTools] version mismatch (loaded=' + local + ', remote=' + remote + ') -- reloading extension');
    // Mark the intended upgrade in storage so content scripts can show a toast
    await chrome.storage.local.set({ gam_autoreload: {
      from: local, to: remote, at: new Date().toISOString()
    }});
    chrome.runtime.reload();
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
    secretCache = {
      workerModToken: (typeof msg.workerModToken === 'string') ? msg.workerModToken : '',
      leadModToken: (typeof msg.leadModToken === 'string') ? msg.leadModToken : ''
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

  if (msg && msg.type === 'workerFetch') {
    const path = msg.path || '';
    if (!pathAllowed(path)) {
      sendResponse({ ok: false, status: 0, error: 'endpoint not allowed' });
      return; // no async work -> no true return
    }
    (async () => {
      // Warm cache if service-worker was just revived.
      if (!secretCache.workerModToken && !secretCache.leadModToken) {
        try { await loadSecrets(); } catch (e) {}
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 20000);
      try {
        const headers = new Headers(msg.headers || {});
        if (secretCache.workerModToken) headers.set('X-Mod-Token', secretCache.workerModToken);
        if (msg.asLead && secretCache.leadModToken) headers.set('X-Lead-Token', secretCache.leadModToken);
        if (msg.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
        const r = await fetch(WORKER_BASE + path, {
          method: msg.method || (msg.body === undefined ? 'GET' : 'POST'),
          headers: headers,
          body: msg.body === undefined ? undefined : JSON.stringify(msg.body),
          signal: ctrl.signal
        });
        const text = await r.text();
        sendResponse({ ok: r.ok, status: r.status, text: text });
      } catch (e) {
        sendResponse({
          ok: false,
          status: 0,
          error: String(e && e.message || e),
          timeout: !!(e && e.name === 'AbortError')
        });
      } finally {
        clearTimeout(timer);
      }
    })();
    return true;
  }
  // --- v7.2 Platform Hardening END ---
});
