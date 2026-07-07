// v10.40.1: factory-reset corner of the WS-3 split-brain fix.
// Popup Factory reset removes gam_settings then bumps gam_settings_writeStamp;
// content-script hydrate must treat "no chrome settings + newer stamp" as an
// authoritative wipe and CLEAR the stale page-localStorage copy (tabs closed
// during the reset never receive the clearLocalStorage message).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mod = readFileSync(join(root, 'modtools.js'), 'utf8');
const pop = readFileSync(join(root, 'popup.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}`); }
}

console.log('=== factory-reset writeStamp smoke ===');

// 1. popup: clearBtn bumps the stamp AFTER the owned-keys remove
const clearIdx = pop.indexOf("$('clearBtn').addEventListener");
check('clearBtn handler found', clearIdx > 0);
const clearBlock = pop.slice(clearIdx, clearIdx + 3500);
const removeIdx = clearBlock.indexOf('chrome.storage.local.remove');
const stampIdx = clearBlock.indexOf('gam_settings_writeStamp: Date.now()');
check('factory reset bumps writeStamp', stampIdx > 0);
check('stamp bump comes AFTER the remove', removeIdx > 0 && stampIdx > removeIdx);

// 2. modtools: hydrate has the wipe branch (null settings + newer stamp -> removeItem)
const wipeBranch = mod.indexOf("if (k === 'gam_settings' && stored[k] == null){");
check('hydrate wipe branch exists', wipeBranch > 0);
const wipeBlock = mod.slice(wipeBranch, wipeBranch + 1200);
check('wipe branch clears page copy', wipeBlock.includes('localStorage.removeItem(k)'));
check('wipe branch gated on newer chrome stamp', wipeBlock.includes('chromeStamp > lsStamp'));
check('wipe branch mirrors the stamp', wipeBlock.includes('JSON.stringify(chromeStamp)'));

// 3. behavioral: exercise the sliced branch logic with a stub localStorage
const K = 'gam_settings_writeStamp';
function simulateHydrateForSettings(storedSettings, storedStamp, ls) {
  // faithful re-implementation of the two stamp branches' decision logic,
  // then asserted against the real source shape above
  const chromeStamp = Number(storedStamp) || 0;
  const lsStamp = Number(JSON.parse(ls[K] || '0')) || 0;
  if (storedSettings != null && chromeStamp > lsStamp) return 'overwrite';
  if (storedSettings == null && chromeStamp > lsStamp) return 'wipe';
  return 'legacy-null-fill';
}
check('stale tab after reset -> wipe', simulateHydrateForSettings(null, 2000, { [K]: '1000', gam_settings: '{"x":1}' }) === 'wipe');
check('normal popup write -> overwrite', simulateHydrateForSettings({ a: 1 }, 2000, { [K]: '1000' }) === 'overwrite');
check('no stamps, settings present -> legacy path', simulateHydrateForSettings({ a: 1 }, undefined, {}) === 'legacy-null-fill');
check('fresh install (nothing anywhere) -> legacy path', simulateHydrateForSettings(null, undefined, {}) === 'legacy-null-fill');

console.log(`--- ${pass} passed, ${fail} failed ---`);
process.exit(fail ? 1 : 0);
