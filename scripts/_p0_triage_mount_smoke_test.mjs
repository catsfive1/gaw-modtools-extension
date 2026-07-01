// _p0_triage_mount_smoke_test.mjs
// v10.36.2 P0 fix: /users Death-Row regression (Opus 4.8 brainstorm brief, 2026-07-01).
// Root cause: buildTriageConsole()'s boot call silently swallowed any mount error
// (modtools.js boot setTimeout catch), so a GAW DOM drift left the native /users
// list rendered with zero indication ModTools had failed -- Commander could not
// queue anyone to Death Row. Slices the REAL scrapeCurrentPage from modtools.js to
// verify the structure-agnostic extraction, then static-asserts: the hard
// `spans.length<2` gate is gone from all three affected sites, the boot catch no
// longer swallows silently, and the safeFeature call site no longer lies about
// success when the mount actually failed.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P0: /users Triage Console mount regression (v10.36.2) ===');

// --- slice the REAL scrapeCurrentPage(...) from modtools.js ---
const sStart = SRC.indexOf('function scrapeCurrentPage(){');
const sRet = SRC.indexOf('return added;', sStart);
const sEnd = SRC.indexOf('}', sRet) + 1;
if (sStart < 0 || sRet < 0 || sEnd <= 0) { console.error('FATAL: scrapeCurrentPage markers not found'); process.exit(2); }
const fnSrc = SRC.slice(sStart, sEnd);

function makeLog({ spans = [], dataset = {}, anchor = null } = {}) {
  return {
    querySelectorAll(sel) { return sel === 'span' ? spans.map(t => ({ textContent: t })) : []; },
    dataset,
    querySelector(sel) { return (sel === 'a[href^="/u/"]' && anchor) ? { textContent: anchor } : null; },
  };
}

function run(logs) {
  const added = [];
  const stubTrySelectAll = () => logs;
  const stubRosterAdd = (u, j, ip) => { added.push({ u, j, ip }); return true; };
  const stubApplyAutoDR = () => {};
  const scrapeCurrentPage = new Function(
    'trySelectAll', 'rosterAdd', 'applyAutoDeathRowRules',
    fnSrc + '\n return scrapeCurrentPage;'
  )(stubTrySelectAll, stubRosterAdd, stubApplyAutoDR);
  const count = scrapeCurrentPage();
  return { count, added };
}

// --- behavior: happy path (unchanged) ---
{
  const { count, added } = run([makeLog({ spans: ['alice', '2026-01-01'] })]);
  ck('happy path: 2-span row still extracts username', count === 1 && added[0].u === 'alice');
}

// --- behavior: the actual DOM-drift case this bug is about ---
{
  // Only 1 span AND it's not the username (drifted layout -- old code's hard
  // `if(spans.length<2) return;` dropped any row like this outright).
  const { count, added } = run([makeLog({ spans: [''], dataset: { username: 'bob' } })]);
  ck('drift case: 1-span row (empty) with dataset.username falls back and is NOT dropped',
    count === 1 && added[0].u === 'bob');
}

// --- behavior: zero spans, anchor-only row ---
{
  const { count, added } = run([makeLog({ spans: [], anchor: 'carol' })]);
  ck('zero-span row with a[href^="/u/"] anchor falls back to the anchor text',
    count === 1 && added[0].u === 'carol');
}

// --- behavior: genuinely nothing extractable -> skipped, not thrown ---
{
  let threw = false, count = 0;
  try { ({ count } = run([makeLog({ spans: [] })])); } catch (e) { threw = true; }
  ck('row with no span/dataset/anchor is skipped silently (no throw, added stays 0)',
    !threw && count === 0);
}

// --- regression guard: the hard gate must be gone from the sliced fn ---
// (matches the CODE pattern `if(spans.length<2)return`, not prose that merely
// mentions it -- this fn's own explanatory comment quotes the old pattern.)
const HARD_GATE_RE = /if\s*\(\s*spans\.length\s*<\s*2\s*\)\s*return/;
ck('scrapeCurrentPage: hard `spans.length<2` gate is GONE', !HARD_GATE_RE.test(fnSrc));
ck('scrapeCurrentPage: derives username via dataset.username fallback', /log\.dataset\.username/.test(fnSrc));
ck('scrapeCurrentPage: derives username via a[href^="/u/"] anchor fallback', /a\[href\^="\/u\/"\]/.test(fnSrc));

// --- static: same fix applied to buildTriageData() and fetchAndIngestUsersPage() ---
const btdStart = SRC.indexOf('function buildTriageData(){');
const btdEnd = SRC.indexOf('candidates.push({username, joinText, ipHash, onCurrentPage:true, domRow:log, _domIdx:domIdx});', btdStart);
const btdSrc = SRC.slice(btdStart, btdEnd);
ck('buildTriageData: hard `spans.length<2` gate is GONE', !HARD_GATE_RE.test(btdSrc));
ck('buildTriageData: falls back through dataset.username and anchor', /log\.dataset\.username/.test(btdSrc) && /a\[href\^="\/u\/"\]/.test(btdSrc));

const fipStart = SRC.indexOf('async function fetchAndIngestUsersPage()');
const fipEnd = SRC.indexOf('if (newUsernames.length > 0)', fipStart);
const fipSrc = SRC.slice(fipStart, fipEnd);
ck('fetchAndIngestUsersPage: hard `spans.length<2` gate is GONE', !HARD_GATE_RE.test(fipSrc));
ck('fetchAndIngestUsersPage: falls back through dataset.username and anchor', /log\.dataset\.username/.test(fipSrc) && /a\[href\^="\/u\/"\]/.test(fipSrc));

// --- static: boot call no longer silently swallows ---
const bootStart = SRC.indexOf("if(now.users && !document.getElementById('gam-triage')){");
const bootEnd = SRC.indexOf('now.queue', bootStart);
const bootSrc = SRC.slice(bootStart, bootEnd);
ck('boot call: old silent swallow `catch(e){}` (empty body) is GONE from the users boot path',
  !/try\{\s*buildTriageConsole\(\);\s*\}catch\(e\)\{\}/.test(bootSrc));
ck('boot call: catch now logs to console.error', /console\.error\(.*buildTriageConsole boot failed/.test(bootSrc));
ck('boot call: catch now shows a persistent banner', /_showTriageMountFailBanner\(e\)/.test(bootSrc));

// --- static: banner helper exists and uses the real danger token ---
ck('_showTriageMountFailBanner is defined', /function _showTriageMountFailBanner\(err\)\{/.test(SRC));
ck('banner uses GAM_TOK.danger (existing design-token convention)',
  /gam-triage-fail-banner[\s\S]{0,400}GAM_TOK\.danger/.test(SRC));

// --- static: safeFeature call site no longer lies about success ---
const sfStart = SRC.indexOf("safeFeature('buildTriageConsole', () => buildTriageConsole());");
const sfWindow = SRC.slice(Math.max(0, sfStart - 400), sfStart + 400);
ck('safeFeature call site: success snack is gated on the actual result',
  /_triageResult\s*=\s*safeFeature\('buildTriageConsole'/.test(sfWindow) && /if\s*\(\s*_triageResult\s*!==\s*null\s*\)/.test(sfWindow));
ck('safeFeature call site: failure path also shows the persistent banner',
  /_showTriageMountFailBanner\(new Error/.test(sfWindow));

console.log('=== ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
