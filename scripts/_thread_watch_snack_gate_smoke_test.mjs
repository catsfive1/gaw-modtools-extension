// Smoke test for v10.30 storm #1: Thread-Watch snack-gate.
// Slices the REAL _onBanAndRemove / _onWatchUser / _onMarkSus from modtools.js and
// asserts: {ok:false} -> error snack (NOT success); {ok:true} -> success snack; and
// that _onMarkSus was rewired modMarkSus -> modSusMark with {username, reason}.
// Run: node scripts/_thread_watch_snack_gate_smoke_test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, '..', 'modtools.js'), 'utf8');

// Slice the contiguous 3-function block (they reference only rpcCall, snack, document).
const startMarker = '  async function _onBanAndRemove(username, postId) {';
const endMarker = '  function _makeBulkBanBtn(';
const startIdx = SRC.indexOf(startMarker);
const endIdx = SRC.indexOf(endMarker);
if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
  console.error('FAIL: could not slice the thread-watch functions from source (anchors moved).');
  process.exit(2);
}
const block = SRC.slice(startIdx, endIdx);

let pass = 0, fail = 0;
const checks = [];
function check(name, cond) { if (cond) { pass++; checks.push('  [PASS] ' + name); } else { fail++; checks.push('  [FAIL] ' + name); } }

// Harness: build the 3 functions with injected stubs.
function build(rpcImpl) {
  const snacks = [];
  const rpcCalls = [];
  const rpcCall = async (name, args) => { rpcCalls.push({ name, args }); return rpcImpl(name, args); };
  const snack = (msg, type) => { snacks.push({ msg, type }); };
  const documentStub = { querySelector: () => null };
  // eslint-disable-next-line no-new-func
  const factory = new Function('rpcCall', 'snack', 'document',
    block + '\n return { _onBanAndRemove, _onWatchUser, _onMarkSus };');
  const fns = factory(rpcCall, snack, documentStub);
  return { fns, snacks, rpcCalls };
}

const okTrue = async () => ({ ok: true });
const okFalse = async () => ({ ok: false, error: 'unknown rpc: test' });

const run = async () => {
  // 1) Failure path: every action shows an ERROR snack, never a success.
  {
    const { fns, snacks } = build(okFalse);
    await fns._onBanAndRemove('eviluser', 'p1');
    check('_onBanAndRemove {ok:false} -> error snack', snacks.some(s => s.type === 'error'));
    check('_onBanAndRemove {ok:false} -> NO success snack', !snacks.some(s => s.type === 'success'));
  }
  {
    const { fns, snacks } = build(okFalse);
    await fns._onWatchUser('eviluser', 'r');
    check('_onWatchUser {ok:false} -> error snack', snacks.some(s => s.type === 'error'));
    check('_onWatchUser {ok:false} -> NO success snack', !snacks.some(s => s.type === 'success'));
  }
  {
    const { fns, snacks } = build(okFalse);
    await fns._onMarkSus('eviluser');
    check('_onMarkSus {ok:false} -> error snack', snacks.some(s => s.type === 'error'));
    check('_onMarkSus {ok:false} -> NO success snack', !snacks.some(s => s.type === 'success'));
  }

  // 2) Success path: success snack fires when the RPC genuinely returns ok.
  {
    const { fns, snacks } = build(okTrue);
    await fns._onBanAndRemove('user', 'p1');
    check('_onBanAndRemove {ok:true} -> success snack', snacks.some(s => s.type === 'success'));
  }
  {
    const { fns, snacks } = build(okTrue);
    await fns._onMarkSus('user');
    check('_onMarkSus {ok:true} -> success snack', snacks.some(s => s.type === 'success'));
  }

  // 3) SUS rewire: _onMarkSus must call modSusMark (NOT modMarkSus) with {username, reason}.
  {
    const { fns, rpcCalls } = build(okTrue);
    await fns._onMarkSus('alice');
    const c = rpcCalls[0] || {};
    check('_onMarkSus calls modSusMark (not modMarkSus)', c.name === 'modSusMark');
    check('_onMarkSus sends {username}', c.args && c.args.username === 'alice');
    check('_onMarkSus sends a {reason}', !!(c.args && typeof c.args.reason === 'string' && c.args.reason.length));
  }

  console.log('=== Thread-Watch snack-gate smoke ===');
  console.log(checks.join('\n'));
  console.log('--- ' + pass + ' passed, ' + fail + ' failed ---');
  process.exit(fail ? 1 : 0);
};
run();
