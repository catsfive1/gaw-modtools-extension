// _p4_pickup_where_left_off_smoke_test.mjs
// v10.36.8: "pick up where I left off" (Commander request, 2026-07-01) -- a
// personal, local-only "reviewed" bookmark for the /users Unreviewed section
// so previously-looked-at (but not actioned) users stop resurfacing on every
// visit. Deliberately NOT roster.status: this is a triage convenience, not a
// moderation decision, and must never touch HI-1/ban/audit machinery.
//
// Slices the real getSeenSet/saveSeenSet/isSeenUser/markSeenUser/unmarkSeenUser
// from modtools.js and exercises them against a localStorage stub. Also runs
// static-assertion guards on buildUserRecord/buildUserRow/renderTriageList to
// confirm the feature is wired end-to-end without touching roster.status.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P4: "pick up where I left off" -- reviewed bookmark (v10.36.8) ===');

// --- slice the 5 real functions verbatim ---
const start = SRC.indexOf('function getSeenSet(){');
const end = SRC.indexOf('function unmarkSeenUser(u){', start);
const endLineEnd = SRC.indexOf('\n', end) + 1;
if (start < 0 || end < 0) { console.error('FATAL: getSeenSet/unmarkSeenUser markers not found'); process.exit(2); }
const fnSrc = SRC.slice(start, endLineEnd);

function makeLsStub() {
  const store = {};
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    removeItem: k => { delete store[k]; },
    _store: store,
  };
}

function run() {
  const ls = makeLsStub();
  const K = { SEEN: 'gam_reviewed_seen' };
  function lsGet(key, fallback) { try { return JSON.parse(ls.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
  function lsSet(key, value) { ls.setItem(key, JSON.stringify(value)); }
  const factory = new Function('K', 'lsGet', 'lsSet',
    fnSrc + '\n return { getSeenSet, saveSeenSet, isSeenUser, markSeenUser, unmarkSeenUser };'
  );
  return factory(K, lsGet, lsSet);
}

// --- behavior: round trip ---
{
  const { isSeenUser, markSeenUser, unmarkSeenUser, getSeenSet } = run();
  ck('fresh user is not seen', isSeenUser('alice') === false);
  markSeenUser('Alice');
  ck('markSeenUser is case-insensitive (lowercased key)', isSeenUser('alice') === true && isSeenUser('ALICE') === true);
  ck('getSeenSet exposes a timestamp, not just a boolean (for future "reviewed N days ago" UI)', typeof getSeenSet()['alice'].at === 'string');
  unmarkSeenUser('alice');
  ck('unmarkSeenUser reverses it', isSeenUser('alice') === false);
}

// --- behavior: independent users don't interfere ---
{
  const { isSeenUser, markSeenUser } = run();
  markSeenUser('bob');
  ck('marking one user does not mark another', isSeenUser('bob') === true && isSeenUser('carol') === false);
}

// --- static: buildUserRecord accepts reviewedSet and returns `reviewed` ---
{
  ck('buildUserRecord signature includes reviewedSet param',
    /function buildUserRecord\([^)]*reviewedSet\)/.test(SRC));
  ck('buildUserRecord return object sets reviewed from reviewedSet (not roster.status)',
    /reviewed:\s*!!\(reviewedSet\s*&&\s*reviewedSet\[k\]\)/.test(SRC));
}

// --- static: buildTriageData wires getSeenSet() through to buildUserRecord ---
{
  ck('buildTriageData calls getSeenSet()', /const reviewedSet = getSeenSet\(\);/.test(SRC));
  ck('buildTriageData passes reviewedSet into buildUserRecord call',
    /buildUserRecord\(c\.username, c\.joinText, c\.ipHash, roster, dr, watchlist, c\.onCurrentPage, c\.domRow, hotPrefixes, reviewedSet\)/.test(SRC));
}

// --- static: the row template renders the toggle only for status==='new' ---
{
  ck('buildUserRow gates the reviewed/unreviewed toggle on status===\'new\'',
    /\$\{u\.status===['"]new['"]\?\(u\.reviewed/.test(SRC));
  ck('row click handler has a reviewed case calling markSeenUser',
    /action==='reviewed'\){\s*\n\s*markSeenUser\(username\)/.test(SRC));
  ck('row click handler has an unreviewed case calling unmarkSeenUser',
    /action==='unreviewed'\){\s*\n\s*unmarkSeenUser\(username\)/.test(SRC));
}

// --- static: the feature never calls rosterSetStatus (must not become a moderation decision) ---
{
  const reviewedBlockStart = SRC.indexOf("// v10.36.8: \"pick up where I left off\" -- split Unreviewed");
  const reviewedBlockEnd = SRC.indexOf('} else {', reviewedBlockStart);
  const block = SRC.slice(reviewedBlockStart, reviewedBlockEnd);
  ck('the Unreviewed-splitting block never calls rosterSetStatus (reviewed stays a local bookmark, not a moderation status change)',
    reviewedBlockStart > 0 && reviewedBlockEnd > reviewedBlockStart && !block.includes('rosterSetStatus'));
  ck('the "mark all reviewed" bulk button writes directly to K.SEEN via getSeenSet/saveSeenSet, not addToDeathRow/executeBan',
    block.includes('getSeenSet()') && block.includes('saveSeenSet(') && !block.includes('addToDeathRow') && !block.includes('executeBan'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
