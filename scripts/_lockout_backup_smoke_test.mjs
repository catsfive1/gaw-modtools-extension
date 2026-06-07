// Throwaway smoke test for v10.23.0 lockout-proof L4/L5 (token backup + restore).
// NOT shipped. Run: node scripts/_lockout_backup_smoke_test.mjs
//
// Slices the REAL _writeTokenBackup/_readTokenBackup out of background.js and
// drives them against a mock chrome.storage.local + stub crypt, then simulates
// the loadSecrets restore-on-empty block to prove the self-heal end to end.
// The headline property: the backup is DECRYPT-INDEPENDENT (plaintext fallback),
// so it survives the v10.11.1 crypto-key-loss case the main vault does not.

import { readFileSync } from 'node:fs';
const SRC = readFileSync(new URL('../background.js', import.meta.url), 'utf8');
function slice(a, b, label) {
  const i = SRC.indexOf(a), j = SRC.indexOf(b, i);
  if (i < 0 || j < 0) { console.error('FATAL: region not found: ' + label); process.exit(2); }
  return SRC.slice(i, j);
}
const helpers = slice('async function _writeTokenBackup()', 'async function _rpcWorkerCall(', 'backup helpers');

const prelude = `
let secretCache = { workerModToken: '', leadModToken: '' };
const __store = {};
const chrome = { storage: { local: {
  async get(k){ const key = (typeof k === 'string') ? k : (Array.isArray(k) ? k[0] : Object.keys(k||{})[0]); return (key in __store) ? { [key]: __store[key] } : {}; },
  async set(o){ Object.assign(__store, o); }
} } };
let __encFail = false; // toggle to simulate crypto unavailable
async function _cryptEncrypt(pt){ if (__encFail) throw new Error('no crypto'); return { ct: Buffer.from(String(pt),'utf8').toString('base64'), iv:'aXY=', alg:'AES-GCM-256-v1' }; }
async function _cryptDecrypt(blob){ return Buffer.from(blob.ct,'base64').toString('utf8'); }
function _cryptIsEncrypted(v){ return !!(v && typeof v==='object' && typeof v.ct==='string' && typeof v.iv==='string' && v.alg==='AES-GCM-256-v1'); }
`;
const factory = new Function(prelude + '\n' + helpers + '\n' +
  'return { _writeTokenBackup, _readTokenBackup, store: __store, ' +
  'setCache: (w,l)=>{ secretCache = { workerModToken: w||"", leadModToken: l||"" }; }, ' +
  'getCache: ()=>secretCache, setEncFail: (b)=>{ __encFail = b; }, ' +
  'clearStore: ()=>{ for (const k in __store) delete __store[k]; } };');
const M = factory();

let pass = 0, fail = 0; const log = [];
function check(name, cond, extra) { if (cond) { pass++; log.push('  PASS  ' + name + (extra ? '  ' + extra : '')); } else { fail++; log.push('  FAIL  ' + name + (extra ? '  ' + extra : '')); } }

log.push('=== v10.23.0 lockout-proof L4/L5 backup+restore smoke ===\n');

// [1] round-trip: save a token -> backup has plaintext + encrypted -> read returns it
{
  M.clearStore(); M.setCache('TEAMTOKEN_abc123', '');
  await M._writeTokenBackup();
  const b = M.store.gam_token_backup_v1;
  check('backup written', !!b, 'b=' + JSON.stringify(b && {pt: b.worker_pt, enc: !!b.worker_enc, ver: b.ver}));
  check('backup has plaintext fallback', b && b.worker_pt === 'TEAMTOKEN_abc123');
  check('backup has encrypted blob', !!(b && b.worker_enc && b.worker_enc.alg === 'AES-GCM-256-v1'));
  const r = await M._readTokenBackup();
  check('read returns the token', r === 'TEAMTOKEN_abc123', 'r=' + r);
}

// [2] empty-guard: an empty vault must NOT overwrite a good backup
{
  M.clearStore(); M.setCache('GOODTOKEN', ''); await M._writeTokenBackup();
  M.setCache('', ''); await M._writeTokenBackup(); // vault now empty -> should be a no-op
  const r = await M._readTokenBackup();
  check('empty vault did NOT clobber the good backup', r === 'GOODTOKEN', 'r=' + r);
}

// [3] decrypt-independence: a backup with ONLY an encrypted blob still restores
{
  M.clearStore();
  M.store.gam_token_backup_v1 = { ver: 1, savedAt: 1, worker_enc: { ct: Buffer.from('ENCONLY','utf8').toString('base64'), iv: 'aXY=', alg: 'AES-GCM-256-v1' } };
  const r = await M._readTokenBackup();
  check('encrypted-only backup decrypts on read', r === 'ENCONLY', 'r=' + r);
}

// [4] crypto-loss case: write with encryption FAILING -> plaintext fallback still saved + readable
{
  M.clearStore(); M.setCache('CRYPTLESS', ''); M.setEncFail(true);
  await M._writeTokenBackup(); M.setEncFail(false);
  const b = M.store.gam_token_backup_v1;
  check('crypto-loss: plaintext still written (no worker_enc)', b && b.worker_pt === 'CRYPTLESS' && !b.worker_enc);
  const r = await M._readTokenBackup();
  check('crypto-loss: still restorable via plaintext (the v10.11.1 fix)', r === 'CRYPTLESS', 'r=' + r);
}

// [5] self-heal flow: vault empty + backup present -> restore (mirrors the loadSecrets L5 block)
{
  M.clearStore(); M.setCache('LIVE_TOKEN', ''); await M._writeTokenBackup();   // operator was authed -> backup exists
  // simulate SW eviction / wiped vault: secretCache empty, gam_settings gone
  M.setCache('', '');
  // --- replicate the loadSecrets L5 restore block ---
  const cache = M.getCache();
  let restored = '';
  if (!cache.workerModToken) {
    const bak = await M._readTokenBackup();
    if (bak) { M.setCache(bak, ''); restored = bak;
      M.store.gam_settings = Object.assign({}, M.store.gam_settings || {}, { workerModToken: bak }); }
  }
  check('self-heal restored the token into the vault', M.getCache().workerModToken === 'LIVE_TOKEN', 'cache=' + M.getCache().workerModToken);
  check('self-heal mirrored token into gam_settings (popup sees it)', M.store.gam_settings && M.store.gam_settings.workerModToken === 'LIVE_TOKEN');
  check('restored value matches', restored === 'LIVE_TOKEN');
}

// [6] no-backup case: empty vault + no backup -> read returns '' (falls through to onboarding, unchanged)
{
  M.clearStore(); M.setCache('', '');
  const r = await M._readTokenBackup();
  check('no backup -> empty read (graceful)', r === '');
}

log.push('\n=== RESULT: ' + pass + ' passed, ' + fail + ' failed ===');
console.log(log.join('\n'));
process.exit(fail === 0 ? 0 : 1);
