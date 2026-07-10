// _select_all_cluster_smoke_test.mjs
// v10.29.0 "select all from one address" on a Triage Console burst alert.
// Slices the REAL getIPClusters from modtools.js to verify the clustering the
// feature selects on, then static-asserts the wiring: the Select-all link, the
// filter-handler guard (so the new link doesn't break "Filter this cluster"),
// select-into-triageSelected + filter-to-cluster, and HI-1 (the handler only
// SELECTS -- no ban/deathrow path; the batch buttons still gate the action).
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

// --- slice getIPClusters (pure: users -> {prefix:[username,...]}) ---
const gStart = SRC.indexOf('function getIPClusters(users){');
const gRet = SRC.indexOf('return ipMap;', gStart);
const gEnd = SRC.indexOf('}', gRet) + 1;
if (gStart < 0 || gRet < 0 || gEnd <= 0) { console.error('FATAL: getIPClusters markers not found'); process.exit(2); }
const fnSrc = SRC.slice(gStart, gEnd);
const stubIsPrivateIP = (h) => String(h).startsWith('PRIV');
const getIPClusters = new Function('isPrivateIP', fnSrc + '\n return getIPClusters;')(stubIsPrivateIP);

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== select-all-from-one-address (v10.29.0) ===');

// --- clustering behavior ---
const users = [
  { username: 'bot_aaa1', ipHash: '77.88.1.2' },
  { username: 'bot_aaa2', ipHash: '77.88.3.4' },   // same /16 (77.88) -> the flood
  { username: 'bot_aaa3', ipHash: '77.88.250.9' },
  { username: 'realguy',  ipHash: '12.34.5.6' },    // lone, different prefix
  { username: 'noip' },                              // no ipHash -> excluded
  { username: 'privguy',  ipHash: 'PRIV.1.2.3' },    // private -> excluded
];
const clusters = getIPClusters(users);

ck('flood clusters under one prefix', Array.isArray(clusters['77.88']) && clusters['77.88'].length === 3);
ck('cluster array holds USERNAMES (what triageSelected stores)',
  JSON.stringify(clusters['77.88'].slice().sort()) === JSON.stringify(['bot_aaa1', 'bot_aaa2', 'bot_aaa3']));
ck('lone user is its own prefix', Array.isArray(clusters['12.34']) && clusters['12.34'].length === 1);
ck('user with no ipHash excluded', !Object.values(clusters).some(arr => arr.includes('noip')));
ck('private IP excluded', !Object.keys(clusters).some(p => p.startsWith('PRIV')) && !Object.values(clusters).some(arr => arr.includes('privguy')));

// --- wiring (static) ---
// v10.43.0: prefix is escapeHtml-wrapped in the attribute (WS-9 defense-in-depth)
ck('burst alert has a "Select all" link (data-cluster-select)',
  /data-cluster-select="\$\{escapeHtml\(prefix\)\}"/.test(SRC) && /gam-t-alert-selectall/.test(SRC));
ck('filter handler is guarded so the new link does not break "Filter this cluster"',
  /if\(!a\.dataset\.cluster\) return;/.test(SRC));

// isolate the select-all handler block for HI-1 + behavior asserts
const hStart = SRC.indexOf(".gam-t-alert-selectall').forEach");
const hEnd = SRC.indexOf('refreshTriageConsole();', hStart);
const handler = (hStart >= 0 && hEnd >= 0) ? SRC.slice(hStart, hEnd + 30) : '';
// v10.36.12 P0 FIX: switched from getIPClusters to getUnresolvedIPClusters so
// the burst banner + its Select-all/Death-Row-all links exclude already-
// actioned users (see scripts/_p7_banner_excludes_actioned_smoke_test.mjs).
ck('select handler recomputes the cluster from the live roster (unresolved-only)', /getUnresolvedIPClusters\(users\)/.test(handler));
ck('select handler adds the cluster users to the batch selection', /triageSelected\.add\(n\)/.test(handler));
ck('select handler filters to the cluster so they are visible', /triageFilter='cluster-'\+prefix/.test(handler));
ck('HI-1: select handler only SELECTS -- no ban/deathrow/flush path', !/deathrow|\bban\b|executeBan|banUser|flush/i.test(handler));

console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
