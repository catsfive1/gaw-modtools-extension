// v10.46.0: team Death-Row VISIBILITY. Peers' pending DR placements sync
// (display-only) through the proven __gaw_team_patterns__ blob, keyed by mod.
// Proves: (1) push carries deathRowByMod, (2) pull absorbs it into _teamDrByMod
// (NEVER into K.DR), (3) keyed-by-mod merge is clobber-safe + propagates
// removals, (4) HI-1 -- no peer reaper executes another mod's queue.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'modtools.js'), 'utf8');

let pass = 0, fail = 0;
const check = (n, ok) => { ok ? (pass++, console.log(`  [PASS] ${n}`)) : (fail++, console.log(`  [FAIL] ${n}`)); };

console.log('=== team Death-Row visibility smoke ===');

// 1. push payload carries deathRowByMod on the proven blob
const pushIdx = src.indexOf('async function pushPatternsToCloud');
const pushBody = src.slice(pushIdx, pushIdx + 1500);
check('push carries deathRowByMod', /deathRowByMod:\s*_deathRowByModForPush\(me\)/.test(pushBody));

// 2. pull absorbs into _teamDrByMod, and does so display-only
const pullIdx = src.indexOf('async function pullPatternsFromCloud');
const pullBody = src.slice(pullIdx, pullIdx + 3200);
check('pull absorbs payload.deathRowByMod into _teamDrByMod',
  pullBody.includes('_teamDrByMod = payload.deathRowByMod'));

// 3. CRITICAL HI-1: the team map is never merged into the executable K.DR queue.
// The only writer of K.DR is saveDeathRow(lsSet(K.DR,...)); assert the pull's
// deathRowByMod handling does NOT call saveDeathRow / addToDeathRow / lsSet(K.DR.
const drAbsorb = pullBody.slice(pullBody.indexOf('payload.deathRowByMod') - 60, pullBody.indexOf('payload.deathRowByMod') + 220);
check('HI-1: team-DR absorb never writes K.DR',
  !/saveDeathRow|addToDeathRow|lsSet\(K\.DR/.test(drAbsorb));
check('HI-1: team-DR absorb has no ban-exec ref',
  !/executeBan|apiBan|processDeathRow/.test(drAbsorb));

// 4. keyed-by-mod merge helper: preserves other mods, replaces own slot
const helperIdx = src.indexOf('function _deathRowByModForPush');
const helperBody = src.slice(helperIdx, helperIdx + 500);
check('_deathRowByModForPush preserves other mods keys', helperBody.includes("if (k !== me) out[k] = _teamDrByMod[k]"));
check('_deathRowByModForPush replaces own slot (removal propagates)',
  helperBody.includes('if (mine.length) out[me] = mine; else delete out[me]'));

// 5. only WAITING items are synced (not executed/history)
const stripIdx = src.indexOf('function _stripDrForSync');
const stripBody = src.slice(stripIdx, stripIdx + 300);
check('_stripDrForSync syncs only status==waiting', stripBody.includes("d.status === 'waiting'"));

// 6. behavioral: keyed-by-mod merge semantics
function mergeForPush(teamByMod, me, myList) {
  const out = {};
  for (const k in teamByMod) { if (k !== me) out[k] = teamByMod[k]; }
  if (myList.length) out[me] = myList; else delete out[me];
  return out;
}
let m = mergeForPush({ alice: [{ username: 'x' }] }, 'bob', [{ username: 'y' }]);
check('merge keeps alice + adds bob', m.alice && m.bob && m.bob[0].username === 'y');
m = mergeForPush({ alice: [{ username: 'x' }], bob: [{ username: 'old' }] }, 'bob', []);
check('bob clearing their queue removes their key (removal propagates)', m.alice && !('bob' in m));
m = mergeForPush({ bob: [{ username: 'stale' }] }, 'bob', [{ username: 'fresh' }]);
check('bob updating replaces (no stale dupes)', m.bob.length === 1 && m.bob[0].username === 'fresh');

// 7. getTeamDeathRow flattens + can exclude self
const gtdIdx = src.indexOf('function getTeamDeathRow');
const gtdBody = src.slice(gtdIdx, gtdIdx + 900);
check('getTeamDeathRow supports excludeMe', gtdBody.includes('if (excludeMe && mod === me) continue'));
check('getTeamDeathRow sorts by executeAt', gtdBody.includes('(a.executeAt||0) - (b.executeAt||0)'));

// 8. display banner exists in renderTriageAlerts, read-only
const alertIdx = src.indexOf('function renderTriageAlerts');
const alertBody = src.slice(alertIdx, alertIdx + 2500);
check('triage alert shows team-DR count', alertBody.includes('queued for Death Row by teammates'));
check('triage alert uses getTeamDeathRow(true) (excludes self)', alertBody.includes('getTeamDeathRow(true)'));

console.log(`--- ${pass} passed, ${fail} failed ---`);
process.exit(fail ? 1 : 0);
