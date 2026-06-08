// _lead_recovery_copy_smoke_test.mjs
// v10.27.0 lead-aware lockout banner. Slices the REAL pure helpers
// (__authReasonIsCredential + __authLeadRecoverySteps) from modtools.js and
// asserts a returning LEAD is never told to "ask your lead". Also static-checks
// the wiring (lead short-circuit in the copy builder, gam_was_lead persistence,
// role-aware default no_token line). Invariants:
//   1. credential reasons (no_token/short_token/whoami_status/whoami_empty) -> true
//   2. connectivity/other reasons -> false (lead copy must NOT hijack a network blip)
//   3. lead copy mentions GAW LEAD RESCUE + "do NOT need an invite"
//   4. lead copy contains ZERO "ask your lead"
//   5. the copy builder wires: if (__wasLead && __authReasonIsCredential(reason)) -> lead copy
//   6. __validateModAuth persists gam_was_lead on is_lead auth
//   7. the default no_token "still stuck" line is role-aware (GAW LEAD RESCUE present)
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

const ai = SRC.indexOf('function __authReasonIsCredential(reason) {');
const aj = SRC.indexOf('\n  function __showAuthFailBanner(authResult) {', ai);
if (ai < 0 || aj < 0) { console.error('FATAL: helper markers not found', { ai, aj }); process.exit(2); }
const helpers = SRC.slice(ai, aj);
const M = new Function(helpers + '\n return { __authReasonIsCredential: __authReasonIsCredential, __authLeadRecoverySteps: __authLeadRecoverySteps };')();

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== lead-aware lockout recovery copy ===');

// 1. credential reasons -> true
['no_token', 'short_token', 'whoami_status', 'whoami_empty'].forEach(function (r) {
  ck('credential reason "' + r + '" -> true', M.__authReasonIsCredential(r) === true);
});

// 2. non-credential reasons -> false (don't hijack a network/connectivity banner)
['fetch_failed', 'no_response', 'exception', 'unknown', undefined, null, ''].forEach(function (r) {
  ck('non-credential reason "' + String(r) + '" -> false', M.__authReasonIsCredential(r) === false);
});

// 3-4. lead copy content
const lead = M.__authLeadRecoverySteps();
const leadText = lead.join(' · ');
ck('lead copy is a 4-step array', Array.isArray(lead) && lead.length === 4);
ck('lead copy points to GAW LEAD RESCUE', /GAW LEAD RESCUE/.test(leadText));
ck('lead copy says no invite needed', /do NOT need an invite/i.test(leadText));
ck('lead copy says you are the LEAD', /\bLEAD\b/.test(leadText));
ck('lead copy contains ZERO "ask your lead"', !/ask your lead/i.test(leadText));

// 5. wiring: the copy builder short-circuits to lead copy for known leads
ck('copy builder wires lead short-circuit',
  /if \(__wasLead && __authReasonIsCredential\(reason\)\) return __authLeadRecoverySteps\(\);/.test(SRC));

// 6. __validateModAuth persists gam_was_lead on is_lead auth
ck('whoami success persists gam_was_lead',
  /setSetting\('gam_was_lead', !!j\.is_lead\)/.test(SRC) && /isLead:!!j\.is_lead/.test(SRC));

// 7. default no_token "still stuck" line is role-aware (helps before the flag is learned)
ck('default no_token line offers GAW LEAD RESCUE (not just "ask your lead")',
  /Still stuck\? Lead: run GAW LEAD RESCUE/.test(SRC));

// 8. lead title override present
ck('lead-aware banner title override present',
  /GAW ModTools: lead access dropped/.test(SRC));

console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
