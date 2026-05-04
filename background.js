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
    // v5.0-Phase-1 complete: named RPCs cover all former workerFetch paths.
    // Any workerFetch call for a path NOT in ALLOWED_ENDPOINTS is a missed
    // migration -- hard-error to surface it immediately.
    if (!pathAllowed(path)) {
      console.error('[v5.0/Phase-1 MIGRATION ERROR] workerFetch path=' + path + ' has an RPC equivalent -- use chrome.runtime.sendMessage({type:"rpc",name:...}) instead');
      sendResponse({ ok: false, status: 0, error: 'path migrated to named RPC -- use rpcCall("...") not workerFetch for ' + path });
      return;
    }
    // Legacy path only for /admin/import-tokens-from-kv (no RPC equivalent yet).
    try {
      console.warn('[v5.0/Phase-1 legacy] workerFetch path=' + path + ' -- no named RPC yet, using relay');
    } catch (e) {}
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
      return await _rpcWorkerCall('POST', '/bug/report', {
        title: args && args.title,
        description: args && args.description,
        debugSnapshot: args && args.debugSnapshot,
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
