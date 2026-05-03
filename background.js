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
  } catch (e) {}
  // v8.6.9: AWAIT both bootstrap calls so the SW is fully ready before
  // any incoming RPC handler fires.
  try { await __ensureSessionAccess(); } catch (e) {}
  try { await loadSecrets(); } catch (e) {}
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
    const hasWorker = Object.prototype.hasOwnProperty.call(msg, 'workerModToken');
    const hasLead = Object.prototype.hasOwnProperty.call(msg, 'leadModToken');
    secretCache = {
      workerModToken: hasWorker
        ? ((typeof msg.workerModToken === 'string') ? msg.workerModToken : '')
        : (secretCache.workerModToken || ''),
      leadModToken: hasLead
        ? ((typeof msg.leadModToken === 'string') ? msg.leadModToken : '')
        : (secretCache.leadModToken || '')
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
    // v8.6.0 / v5.0-Phase-1: legacy generic relay. Every call here is a
    // pre-v5.0 call site that has not yet been migrated to a named RPC.
    // Logged so the v8.6.x sweep can find them.
    try {
      console.warn('[v5.0/Phase-1 deprecated] workerFetch path=' + path + ' -- migrate to a named rpc handler in background.js (RPC_HANDLERS map)');
    } catch (e) {}
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

  // ---- authXxx: popup-only, mod's own token management ------------------
  authRotateSelf: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler() {
      const r = await _rpcWorkerCall('POST', '/mod/token/rotate', null);
      if (r.ok && r.data && typeof r.data.new_token === 'string') {
        secretCache.workerModToken = r.data.new_token;
        try {
          if (chrome.storage && chrome.storage.session) {
            await chrome.storage.session.set({ gam_settings: secretCache });
          }
          if (chrome.storage && chrome.storage.local) {
            const cur = await chrome.storage.local.get('gam_settings');
            const merged = { ...((cur && cur.gam_settings) || {}), workerModToken: r.data.new_token };
            await chrome.storage.local.set({ gam_settings: merged });
          }
        } catch (e) {}
        return { ok: true, status: r.status, data: { ok: true, mod_username: r.data.mod_username, rotated: true } };
      }
      return r;
    }
  },
  authClaimInvite: {
    allowed_callers: [RPC_CALLER_POPUP],
    async handler(args) {
      const r = await _rpcWorkerCall('POST', '/mod/token/claim-rotation', {
        code: args && args.code,
        username: args && args.username
      });
      if (r.ok && r.data && typeof r.data.new_token === 'string') {
        secretCache.workerModToken = r.data.new_token;
        try {
          if (chrome.storage && chrome.storage.session) {
            await chrome.storage.session.set({ gam_settings: secretCache });
          }
          if (chrome.storage && chrome.storage.local) {
            const cur = await chrome.storage.local.get('gam_settings');
            const merged = { ...((cur && cur.gam_settings) || {}), workerModToken: r.data.new_token };
            await chrome.storage.local.set({ gam_settings: merged });
          }
        } catch (e) {}
        return { ok: true, status: r.status, data: { ok: true, mod_username: r.data.mod_username, claimed: true } };
      }
      return r;
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
  const url = sender && sender.url ? String(sender.url) : '';
  for (const o of _ALLOWED_CONTENT_ORIGINS) {
    if (url.indexOf(o) === 0) return true;
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
