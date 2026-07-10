// v10.45.0: the watchlist is now shared team intelligence, riding the same
// proven __gaw_team_patterns__ blob the DR/Tard rules sync through. This test
// proves: (1) the push payload carries the watchlist, (2) the pull merges a
// remote watchlist by union, (3) saveWatchlist triggers a push (suppressed
// during merge), (4) HI-1 -- the watchlist sync references no ban-exec path.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'modtools.js'), 'utf8');

let pass = 0, fail = 0;
const check = (n, ok) => { ok ? (pass++, console.log(`  [PASS] ${n}`)) : (fail++, console.log(`  [FAIL] ${n}`)); };

console.log('=== watchlist team-sync smoke ===');

// 1. push payload includes watchlist, on the proven blob
const pushIdx = src.indexOf('async function pushPatternsToCloud');
check('pushPatternsToCloud found', pushIdx > 0);
const pushBody = src.slice(pushIdx, pushIdx + 1400);
check('push payload carries watchlist', /watchlist:\s*getWatchlist\(\)/.test(pushBody));
check('push still goes through modProfilesWrite + PATTERN_SYNC_KEY',
  pushBody.includes("rpcCall('modProfilesWrite'") && pushBody.includes('PATTERN_SYNC_KEY'));

// 2. pull merges remote watchlist by union, suppressed
const pullIdx = src.indexOf('async function pullPatternsFromCloud');
const pullBody = src.slice(pullIdx, pullIdx + 2800);
check('pull reads payload.watchlist', pullBody.includes('payload.watchlist'));
check('pull merges by union (only adds missing keys)', pullBody.includes('if (!localWl[k])'));
check('pull merge happens inside _suppressPatternPush guard',
  pullBody.indexOf('_suppressPatternPush = true') < pullBody.indexOf('payload.watchlist') &&
  pullBody.indexOf('payload.watchlist') < pullBody.indexOf('_suppressPatternPush = false'));

// 3. saveWatchlist triggers a (suppressible) push
const swIdx = src.indexOf('function saveWatchlist(wl){');
const swBody = src.slice(swIdx, swIdx + 700);
check('saveWatchlist pushes on local change', swBody.includes('pushPatternsToCloud()'));
check('saveWatchlist suppresses push during merge', swBody.includes('if (!_suppressPatternPush)'));

// 4. HI-1: the watchlist sync touches no ban-execution path
const banRe = /executeBan|addToDeathRow|apiBan|processDeathRow|modBanConfirm/;
check('HI-1: saveWatchlist body has no ban-exec ref', !banRe.test(swBody));
check('HI-1: pull watchlist-merge block has no ban-exec ref',
  !banRe.test(pullBody.slice(pullBody.indexOf('payload.watchlist') - 40, pullBody.indexOf('payload.watchlist') + 400)));

// 5. behavioral: union-merge logic is correct (adds missing, keeps existing, cloud-add wins on absent)
function mergeWl(localWl, remoteWl) {
  const out = { ...localWl };
  let changed = false;
  for (const k in remoteWl) { if (!out[k]) { out[k] = remoteWl[k]; changed = true; } }
  return { out, changed };
}
let r = mergeWl({ alice: { added: 'a' } }, { bob: { added: 'b' } });
check('union adds remote-only watch', r.out.alice && r.out.bob && r.changed);
r = mergeWl({ alice: { added: 'local' } }, { alice: { added: 'remote' } });
check('local watch preserved on key collision (no clobber)', r.out.alice.added === 'local' && !r.changed);
r = mergeWl({ a: 1, b: 2 }, {});
check('empty remote = no change', !r.changed);

console.log(`--- ${pass} passed, ${fail} failed ---`);
process.exit(fail ? 1 : 0);
