// _claim_token_adopt_smoke_test.mjs
// v10.28.0 claim-box token adoption. Slices the REAL __isTokenShape +
// __tryAdoptCodeAsToken out of popup.js and drives them against mocked
// saveTokensSecurely + popupRpc. The trap this fixes: a lead recovering via
// GAW LEAD RESCUE pastes a TEAM TOKEN into the rotation-invite "code" field;
// tokens and invite codes share the base64url shape, so the worker rejects it
// ("claim failed: invalid"). The fix adopts a value that actually authenticates.
// Invariants:
//   1. non-token-shape input        -> null, and NO save attempted
//   2. token-shape + whoami 200+user -> returns username, token KEPT (not rolled back)
//   3. token-shape + whoami 200 no-user -> null, save ROLLED BACK to ''
//   4. token-shape + whoami 401     -> null, save ROLLED BACK to ''
//   5. saveTokensSecurely fails     -> null, whoami never probed
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../popup.js', import.meta.url), 'utf8');

const isStart = SRC.indexOf('function __isTokenShape(t) {');
// NB: the body contains a regex with `}` ({32,256}), so match the closing brace
// on its own line ('\n}'), not the first '}' (which is inside the regex).
const isEnd = SRC.indexOf('\n}', isStart) + 2;
const adoptStart = SRC.indexOf('async function __tryAdoptCodeAsToken(code) {');
const adoptEnd = SRC.indexOf('\nasync function claimRotationInvite()', adoptStart);
if (isStart < 0 || isEnd <= 0 || adoptStart < 0 || adoptEnd < 0) {
  console.error('FATAL: markers not found', { isStart, isEnd, adoptStart, adoptEnd });
  process.exit(2);
}
const isShapeSrc = SRC.slice(isStart, isEnd);
const adoptSrc = SRC.slice(adoptStart, adoptEnd);

const factory = new Function(
  'saveTokensSecurely', 'popupRpc',
  isShapeSrc + '\n' + adoptSrc + '\n return __tryAdoptCodeAsToken;'
);

const REAL_TOKEN = 'h2jeblWoK90nzlOdSYOSQRHWA9yBq11ZpwaCfSfdlPc'; // 43-char base64url (real recovery token shape)

function harness(opts) {
  const calls = { save: [], whoami: 0 };
  const saveTokensSecurely = async (t) => {
    calls.save.push(t.workerModToken);
    if (opts.saveFails) return { ok: false, error: 'forced' };
    return { ok: true };
  };
  const popupRpc = async (name) => {
    if (name === 'modWhoami') { calls.whoami++; return opts.whoami; }
    return { ok: false };
  };
  return { adopt: factory(saveTokensSecurely, popupRpc), calls };
}

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== claim-box token adoption ===');

(async () => {
  // 1. non-token-shape -> null + no save
  {
    const h = harness({ whoami: { ok: true, data: { username: 'x' } } });
    const u = await h.adopt('short');
    ck('non-token-shape returns null', u === null);
    ck('non-token-shape never saves', h.calls.save.length === 0);
  }

  // 2. token-shape + valid whoami -> username + KEPT
  {
    const h = harness({ whoami: { ok: true, data: { username: 'catsfive', is_lead: true } } });
    const u = await h.adopt(REAL_TOKEN);
    ck('valid token -> returns username', u === 'catsfive');
    ck('valid token -> saved once with the token', h.calls.save.length === 1 && h.calls.save[0] === REAL_TOKEN);
    ck('valid token -> NOT rolled back', !h.calls.save.includes(''));
    ck('valid token -> whoami probed once', h.calls.whoami === 1);
  }

  // 3. token-shape + whoami 200 but no username -> null + rolled back
  {
    const h = harness({ whoami: { ok: true, data: {} } });
    const u = await h.adopt(REAL_TOKEN);
    ck('no-username -> returns null', u === null);
    ck('no-username -> rolled back to ""', h.calls.save.length === 2 && h.calls.save[1] === '');
  }

  // 4. token-shape + whoami 401 -> null + rolled back
  {
    const h = harness({ whoami: { ok: false, status: 401 } });
    const u = await h.adopt(REAL_TOKEN);
    ck('401 -> returns null', u === null);
    ck('401 -> rolled back to ""', h.calls.save.length === 2 && h.calls.save[1] === '');
  }

  // 5. save failure -> null, whoami never probed
  {
    const h = harness({ saveFails: true, whoami: { ok: true, data: { username: 'x' } } });
    const u = await h.adopt(REAL_TOKEN);
    ck('save failure -> returns null', u === null);
    ck('save failure -> whoami never probed', h.calls.whoami === 0);
  }

  console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail === 0 ? 0 : 1);
})();
