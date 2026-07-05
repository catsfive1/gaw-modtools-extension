// _p7_banner_excludes_actioned_smoke_test.mjs
// v10.36.12 P0 FIX: getIPClusters(users) clusters EVERY user with a public
// ipHash forever, even after every member has been Death-Rowed/banned/cleared
// -- so the "Burst detected" banner on /users never shrinks or disappears
// once it forms (Commander: "lazy, bad design, plain pure and simple", banner
// unchanged for weeks). getUnresolvedIPClusters() excludes already-actioned/
// reviewed users so the burst alert retires once the cluster is resolved.
// getIPClusters itself is left UNCHANGED for its 3 other legitimate callers.
//
// Slices the real getIPClusters + isPrivateIP + getUnresolvedIPClusters
// functions verbatim (no re-implementation) and behaviorally exercises them.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P7: getUnresolvedIPClusters excludes actioned users; getIPClusters unchanged (v10.36.12) ===');

function sliceFn(startMarker, fromIndex) {
  const start = SRC.indexOf(startMarker, fromIndex || 0);
  if (start < 0) throw new Error('FATAL: marker not found: ' + startMarker);
  const end = SRC.indexOf('\n  }', start) + 4;
  if (end <= 3) throw new Error('FATAL: closing brace not found for: ' + startMarker);
  return { text: SRC.slice(start, end), end };
}

const isPrivateIPSlice = sliceFn('function isPrivateIP(ip){');
const getIPClustersSlice = sliceFn('function getIPClusters(users){', isPrivateIPSlice.end);
const getUnresolvedSlice = sliceFn('function getUnresolvedIPClusters(users){', getIPClustersSlice.end);

const fnSrc = isPrivateIPSlice.text + '\n' + getIPClustersSlice.text + '\n' + getUnresolvedSlice.text
  + '\n return { getIPClusters, getUnresolvedIPClusters };';

const factory = new Function(fnSrc);
const { getIPClusters, getUnresolvedIPClusters } = factory();

function u(username, ipHash, status, reviewed) {
  return { username, ipHash, status: status || 'new', reviewed: !!reviewed };
}

// --- (a) cluster of 4, 2 death-rowed -> 2 unresolved survivors -> below threshold -> not counted as a raid cluster ---
{
  const users = [
    u('alice', '203.0.1.10', 'deathrow'),
    u('bob',   '203.0.1.11', 'deathrow'),
    u('carl',  '203.0.1.12', 'new'),
    u('dave',  '203.0.1.13', 'new'),
  ];
  const unresolved = getUnresolvedIPClusters(users);
  const prefix = '203.0';
  const survivors = unresolved[prefix] || [];
  ck('cluster of 4 with 2 deathrow -> 2 unresolved survivors', survivors.length === 2);
  ck('survivors are the non-actioned users', survivors.includes('carl') && survivors.includes('dave'));
  ck('below the >=3 raid threshold once resolved', survivors.length < 3);
}

// --- (b) cluster of 5, all new/unreviewed -> full cluster still renders, count 5 ---
{
  const users = [
    u('e1', '198.51.100.1', 'new'),
    u('e2', '198.51.100.2', 'new'),
    u('e3', '198.51.100.3', 'new'),
    u('e4', '198.51.100.4', 'new'),
    u('e5', '198.51.100.5', 'new'),
  ];
  const unresolved = getUnresolvedIPClusters(users);
  const survivors = unresolved['198.51'] || [];
  ck('cluster of 5 all-new is fully rendered', survivors.length === 5);
}

// --- (c) getIPClusters is UNCHANGED -- still returns the FULL set including actioned users ---
{
  const users = [
    u('alice', '203.0.1.10', 'deathrow'),
    u('bob',   '203.0.1.11', 'banned'),
    u('carl',  '203.0.1.12', 'cleared'),
    u('dave',  '203.0.1.13', 'new'),
  ];
  const full = getIPClusters(users);
  ck('getIPClusters still returns ALL 4 users regardless of status (unchanged, 3 legit callers depend on this)', (full['203.0'] || []).length === 4);
}

// --- reviewed users are excluded from the unresolved set even if status is still 'new' ---
{
  const users = [
    u('f1', '10.20.30.1', 'new', true),  // reviewed=true -> resolved
    u('f2', '10.20.30.2', 'new', false),
    u('f3', '10.20.30.3', 'new', false),
  ];
  // NOTE: 10.x is a private range per isPrivateIP -- use a public-looking prefix instead
  const users2 = [
    u('f1', '203.5.30.1', 'new', true),
    u('f2', '203.5.30.2', 'new', false),
    u('f3', '203.5.30.3', 'new', false),
  ];
  const unresolved = getUnresolvedIPClusters(users2);
  const survivors = unresolved['203.5'] || [];
  ck('a reviewed=true user is excluded from the unresolved cluster even though status is still "new"', survivors.length === 2 && !survivors.includes('f1'));
}

// --- private IPs are excluded from both (unchanged behavior) ---
{
  const users = [
    u('g1', '192.168.1.5', 'new'),
    u('g2', '192.168.1.6', 'new'),
    u('g3', '192.168.1.7', 'new'),
  ];
  const unresolved = getUnresolvedIPClusters(users);
  ck('private IP ranges produce no cluster in getUnresolvedIPClusters', Object.keys(unresolved).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
