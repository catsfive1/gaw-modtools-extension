// _p10_run_rules_now_smoke_test.mjs
// v10.36.14 WS-4: "Run rules now" on the /users triage toolbar. The Auto-DR
// rules engine and a zero-safe on-demand sweep already existed (v7.0.1) but
// were buried in a collapsible rules-editor sidebar the operator never
// opens. runRuleSweep() extracts that sweep's body verbatim so a new,
// discoverable toolbar button can share the exact same logic as the
// existing (now-thin) buried sidebar button, instead of duplicating it.
//
// Slices the real runRuleSweep() verbatim and stubs its DOM/state
// dependencies (getRoster, getDeathRow, the .gam-t-row DOM sweep,
// applyAutoDeathRowRules, getSetting, logAction) with the project's
// established slice-and-stub convention.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P10: runRuleSweep -- result signal on both queued>0 and queued===0 paths (v10.36.14) ===');

const start = SRC.indexOf('function runRuleSweep(){');
if (start < 0) { console.error('FATAL: runRuleSweep marker not found'); process.exit(2); }
const end = SRC.indexOf('\n  }', start) + 4;
if (end <= 3) { console.error('FATAL: runRuleSweep closing brace not found'); process.exit(2); }
const fnSrc = SRC.slice(start, end) + '\n return runRuleSweep;';

function makeHarness({ rosterNames = [], visibleNames = [], rulesEnabledCount = 1, drDelta = 0 } = {}) {
  const logCalls = [];
  const drCallCount = { n: 0 };
  const roster = {};
  rosterNames.forEach((name, i) => { roster['u' + i] = { name }; });

  function getRoster() { return roster; }
  function getSetting(key /*, fallback */) {
    if (key === 'autoDeathRowRules') {
      return Array.from({ length: rulesEnabledCount }, (_, i) => ({ pattern: 'p' + i, enabled: true }));
    }
    return [];
  }
  // getDeathRow: first call is "before" (0), subsequent reflect drDelta so
  // afterDr - beforeDr === drDelta regardless of how many times it's read.
  function getDeathRow() {
    drCallCount.n++;
    const len = drCallCount.n === 1 ? 0 : drDelta;
    return Array.from({ length: len }, (_, i) => i);
  }
  function applyAutoDeathRowRules(/* usernames */) { /* no-op: DR delta is simulated via getDeathRow above */ }
  function logAction(rec) { logCalls.push(rec); }
  const document = {
    querySelectorAll(sel) {
      if (sel === '.gam-t-row [data-user]') {
        return visibleNames.map(n => ({ getAttribute: () => n }));
      }
      return [];
    },
  };

  const factory = new Function(
    'getRoster', 'getSetting', 'getDeathRow', 'applyAutoDeathRowRules', 'logAction', 'document',
    fnSrc
  );
  const runRuleSweep = factory(getRoster, getSetting, getDeathRow, applyAutoDeathRowRules, logAction, document);
  return { runRuleSweep, logCalls };
}

// --- no enabled rules -> ok:false, reason 'no-rules', no throw ---
{
  const { runRuleSweep } = makeHarness({ rosterNames: ['alice'], rulesEnabledCount: 0 });
  const result = runRuleSweep();
  ck('no enabled rules -> ok:false', result.ok === false);
  ck('no enabled rules -> reason is no-rules', result.reason === 'no-rules');
  ck('no enabled rules -> queued is 0 (not undefined)', result.queued === 0);
}

// --- no roster/visible users -> ok:false, reason 'no-users' ---
{
  const { runRuleSweep } = makeHarness({ rosterNames: [], visibleNames: [], rulesEnabledCount: 2 });
  const result = runRuleSweep();
  ck('no users to sweep -> ok:false', result.ok === false);
  ck('no users to sweep -> reason is no-users', result.reason === 'no-users');
}

// --- queued > 0 path: produces a clear success result signal ---
{
  const { runRuleSweep, logCalls } = makeHarness({ rosterNames: ['bad_user_1', 'bad_user_2'], rulesEnabledCount: 1, drDelta: 2 });
  const result = runRuleSweep();
  ck('queued>0 path -> ok:true', result.ok === true);
  ck('queued>0 path -> queued reflects the DR delta', result.queued === 2);
  ck('queued>0 path -> combined includes the roster users', result.combined.includes('bad_user_1') && result.combined.includes('bad_user_2'));
  ck('queued>0 path -> rulesEnabled reported', result.rulesEnabled === 1);
  ck('queued>0 path -> logAction fired with scanned/rules/queued', logCalls.length === 1 && logCalls[0].type === 'auto-dr-manual-sweep' && logCalls[0].queued === 2);
}

// --- queued === 0 path (clean sweep, not a silent no-op): still ok:true with an explicit zero ---
{
  const { runRuleSweep, logCalls } = makeHarness({ rosterNames: ['clean_user'], rulesEnabledCount: 1, drDelta: 0 });
  const result = runRuleSweep();
  ck('queued===0 (clean sweep) -> still ok:true (ran successfully, just no matches)', result.ok === true);
  ck('queued===0 (clean sweep) -> queued is explicitly 0, not falsy/undefined', result.queued === 0 && typeof result.queued === 'number');
  ck('queued===0 (clean sweep) -> logAction still fires (proof the sweep ran)', logCalls.length === 1 && logCalls[0].queued === 0);
}

// --- roster + visible-DOM users are merged and de-duplicated ---
{
  const { runRuleSweep } = makeHarness({ rosterNames: ['dup_user', 'roster_only'], visibleNames: ['dup_user', 'dom_only'], rulesEnabledCount: 1, drDelta: 0 });
  const result = runRuleSweep();
  ck('roster + visible-DOM users merged with no duplicates', result.combined.length === 3 &&
    result.combined.includes('dup_user') && result.combined.includes('roster_only') && result.combined.includes('dom_only'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
