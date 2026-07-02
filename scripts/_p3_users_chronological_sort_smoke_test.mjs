// _p3_users_chronological_sort_smoke_test.mjs
// v10.36.7 fix: /users Unreviewed list was not chronological (Commander report,
// 2026-07-01). Root cause: buildTriageData()'s sort comparator trusted raw DOM
// scrape order (_domIdx) for on-page users -- a v5.2.9 assumption ("GAW renders
// .log elements newest-first") -- while completely ignoring `joinedAt`, a
// timestamp already computed for EVERY user (on- and off-page alike) in
// buildUserRecord via parseRelativeAge(joinText). This directly contradicted
// renderTriageList's own 24h-divider logic (~L16510), which already assumes
// "Items are sorted joinedAt-desc". Fix: joinedAt is now the primary
// chronological key for both on-page and off-page users; DOM index / lastSeen
// are tiebreakers only when joinedAt is missing or tied.
//
// Slices the REAL comparator body out of buildTriageData() and runs it via
// Array.prototype.sort against representative fixtures.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P3: /users Unreviewed chronological sort (v10.36.7) ===');

// --- slice the real users.sort((a,b)=>{ ... }) comparator body ---
const startMarker = 'users.sort((a,b)=>{';
const sStart = SRC.indexOf(startMarker);
if (sStart < 0) { console.error('FATAL: users.sort marker not found'); process.exit(2); }
const bodyStart = sStart + startMarker.length;
// find the matching close: comparator body ends at the "});" that closes users.sort(...)
const bodyEnd = SRC.indexOf('\n    });', bodyStart);
if (bodyEnd < 0) { console.error('FATAL: users.sort closing marker not found'); process.exit(2); }
const comparatorBody = SRC.slice(bodyStart, bodyEnd);

const comparator = new Function('a', 'b', comparatorBody);

function iso(hoursAgo) { return new Date(Date.now() - hoursAgo * 3600e3).toISOString(); }

function sortWith(fn, users) {
  return [...users].sort(fn).map(u => u.username);
}

// --- the actual regression: two on-page users, out-of-DOM-order joinedAt ---
{
  // domIdx 0 is OLDER (5h ago), domIdx 1 is NEWER (1h ago) -- if GAW's real
  // DOM order isn't newest-first (the exact scenario Commander hit), the old
  // domIdx-priority comparator would have kept alice (old) ahead of bob (new).
  const users = [
    { username: 'alice', onCurrentPage: true, _domIdx: 0, joinedAt: iso(5) },
    { username: 'bob',   onCurrentPage: true, _domIdx: 1, joinedAt: iso(1) },
  ];
  const order = sortWith(comparator, users);
  ck('on-page: newer joinedAt sorts first regardless of DOM index', order[0] === 'bob' && order[1] === 'alice');
}

// --- tiebreak: on-page users with equal/missing joinedAt fall back to DOM order ---
{
  const users = [
    { username: 'carol', onCurrentPage: true, _domIdx: 0, joinedAt: '' },
    { username: 'dave',  onCurrentPage: true, _domIdx: 1, joinedAt: '' },
  ];
  const order = sortWith(comparator, users);
  ck('on-page: missing joinedAt on both falls back to DOM index (stable, not scrambled)', order[0] === 'carol' && order[1] === 'dave');
}

// --- on-page always precedes off-page, even if off-page has a newer joinedAt ---
{
  const users = [
    { username: 'erin_offpage', onCurrentPage: false, joinedAt: iso(0.1), lastSeen: iso(0.1) },
    { username: 'frank_onpage', onCurrentPage: true, _domIdx: 0, joinedAt: iso(48) },
  ];
  const order = sortWith(comparator, users);
  ck('on-page trumps off-page even when off-page joinedAt is more recent', order[0] === 'frank_onpage' && order[1] === 'erin_offpage');
}

// --- off-page users: joinedAt descending, unchanged from prior behavior ---
{
  const users = [
    { username: 'old_hist', onCurrentPage: false, joinedAt: iso(200) },
    { username: 'new_hist', onCurrentPage: false, joinedAt: iso(2) },
  ];
  const order = sortWith(comparator, users);
  ck('off-page: joinedAt descending preserved', order[0] === 'new_hist' && order[1] === 'old_hist');
}

// --- off-page tiebreak: no joinedAt on either -> lastSeen descending ---
{
  const users = [
    { username: 'seen_old', onCurrentPage: false, joinedAt: '', lastSeen: iso(100) },
    { username: 'seen_new', onCurrentPage: false, joinedAt: '', lastSeen: iso(3) },
  ];
  const order = sortWith(comparator, users);
  ck('off-page: lastSeen descending fallback when joinedAt missing on both', order[0] === 'seen_new' && order[1] === 'seen_old');
}

// --- regression guard: confirm the OLD (pre-fix) domIdx-priority comparator
// would have FAILED the primary regression case, proving this isn't a test
// written to match whatever the code happens to do.
{
  const oldComparatorBody = `
    if(a.onCurrentPage && !b.onCurrentPage) return -1;
    if(!a.onCurrentPage && b.onCurrentPage) return 1;
    if(a.onCurrentPage && b.onCurrentPage) return (a._domIdx||0) - (b._domIdx||0);
    const ja = a.joinedAt ? Date.parse(a.joinedAt) : 0;
    const jb = b.joinedAt ? Date.parse(b.joinedAt) : 0;
    if (ja || jb) return jb - ja;
    return new Date(b.lastSeen||0).getTime() - new Date(a.lastSeen||0).getTime();
  `;
  const oldComparator = new Function('a', 'b', oldComparatorBody);
  const users = [
    { username: 'alice', onCurrentPage: true, _domIdx: 0, joinedAt: iso(5) },
    { username: 'bob',   onCurrentPage: true, _domIdx: 1, joinedAt: iso(1) },
  ];
  const order = sortWith(oldComparator, users);
  ck('regression proof: OLD domIdx-priority comparator got this case WRONG (alice-first)', order[0] === 'alice' && order[1] === 'bob');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
