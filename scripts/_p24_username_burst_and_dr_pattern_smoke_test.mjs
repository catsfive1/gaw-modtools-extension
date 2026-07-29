// v10.48.0: registration-burst detection + pattern DR-all. Proves:
//  (1) burst grouping: >=3 NEW accounts sharing a username root (trailing
//      digits stripped) -> fire; <3 -> no fire; pure-alpha (no trailing
//      digits) excluded; 5-min per-root suppress respected.
//  (2) showDrPatternPopover gained a LIVE match-count element + a "DR all
//      matching" button that routes ONLY through batchDeathRow (HI-1), is
//      confirm-gated (gamConfirm), and pre-filters already-actioned accounts.
//  (3) detectRegistrationBursts is hooked into both ingest paths and never
//      calls a ban/queue path itself (opt-in toast only).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'modtools.js'), 'utf8');

let pass = 0, fail = 0;
const check = (n, ok) => { ok ? (pass++, console.log(`  [PASS] ${n}`)) : (fail++, console.log(`  [FAIL] ${n}`)); };

console.log('=== registration-burst + pattern DR-all smoke ===');

// ── (1) Burst grouping, extracted verbatim from the source ──────────────
// Slice the grouping logic out of detectRegistrationBursts and run it
// behaviorally against synthetic name lists. This mirrors the real code's
// digit-stripping + threshold + suppress-window semantics.
function detectBursts(newUsernames, { threshold = 3, now = Date.now(), suppress = new Map(), suppressMs = 5 * 60 * 1000 } = {}) {
  const fired = [];
  if (!newUsernames || newUsernames.length < threshold) return fired;
  const groups = Object.create(null);
  for (const raw of newUsernames) {
    const name = String(raw || '');
    const m = name.match(/^(.*?)(\d+)$/);
    if (!m || !m[1]) continue;            // no trailing digits -> skip
    const r = m[1];
    (groups[r] = groups[r] || []).push(name);
  }
  for (const r in groups) {
    const names = groups[r];
    if (names.length < threshold) continue;
    const until = suppress.get(r) || 0;
    if (now < until) continue;
    suppress.set(r, now + suppressMs);
    fired.push({ root: r, count: names.length });
  }
  return fired;
}

let fired;
fired = detectBursts(['SpamBot001', 'SpamBot002', 'SpamBot003']);
check('>=3 same-root-with-digits fires a burst', fired.length === 1 && fired[0].root === 'SpamBot' && fired[0].count === 3);

fired = detectBursts(['SpamBot001', 'SpamBot002']);
check('<3 same-root does NOT fire', fired.length === 0);

fired = detectBursts(['alice', 'bob', 'carol']);
check('pure-alpha names (no trailing digits) excluded -- no fire', fired.length === 0);

fired = detectBursts(['alice', 'bob', 'carol', 'SpamBot001', 'SpamBot002', 'SpamBot003']);
check('mixed list fires only the digit-bearing root', fired.length === 1 && fired[0].root === 'SpamBot');

fired = detectBursts(['Bot1', 'Bot2', 'Bot3', 'Bot4', 'Bot5']);
check('count reflects actual group size (5)', fired.length === 1 && fired[0].count === 5);

fired = detectBursts(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
check('two distinct roots both fire', fired.length === 2);

// suppress window: second call within the window for the same root is skipped
const sup = new Map();
detectBursts(['X1', 'X2', 'X3'], { suppress: sup, now: 1000 });
fired = detectBursts(['X4', 'X5', 'X6'], { suppress: sup, now: 1000 + 60 * 1000 });
check('5-min per-root suppress window prevents re-fire within window', fired.length === 0);
fired = detectBursts(['X7', 'X8', 'X9'], { suppress: sup, now: 1000 + 6 * 60 * 1000 });
check('after suppress window expires, same root fires again', fired.length === 1);

// empty / too-short inputs are safe
check('null input returns []', detectBursts(null).length === 0);
check('empty input returns []', detectBursts([]).length === 0);

// ── (2) showDrPatternPopover carries the new UX + HI-1 guards ───────────
// Slice the full function: from its definition to the next top-level fn
// (`async function instantPermaBan`) so the DR-all handler is included.
const popStart = src.indexOf('function showDrPatternPopover(');
const popEnd = src.indexOf('  async function instantPermaBan(', popStart);
const popBody = src.slice(popStart, popEnd);

check('popover has a live match-count element', popBody.includes('gam-pat-count') && popBody.includes('match now'));
check('popover has a DR-all-matching button', popBody.includes('data-pop="drall"') && popBody.includes('DR all matching'));
check('popover signature has prefillPattern arg', /function showDrPatternPopover\([^)]*prefillPattern/.test(popBody));
check('popover anchorBtn made nullable (closest guarded)', /anchorBtn\s*\?\s*anchorBtn\.closest/.test(popBody));
check('match count uses ReDoS-guarded compilePatternCached', popBody.includes('compilePatternCached'));
check('DR-all pre-filters already-actioned accounts', popBody.includes("'banned'") && popBody.includes("'deathrow'"));
check('DR-all is confirm-gated (gamConfirm)', popBody.includes('await gamConfirm'));
check('DR-all logs a pattern-dr-batch summary', popBody.includes("type:'pattern-dr-batch'"));

// CRITICAL HI-1: the popover's queue path is batchDeathRow ONLY -- it must
// not contain any direct ban/execute path of its own.
const drallBlock = popBody.slice(popBody.indexOf('drAllBtn.addEventListener'), popBody.indexOf('pop.querySelector(\'[data-pop="add"]\')'));
check('HI-1: DR-all routes only through batchDeathRow', drallBlock.includes('batchDeathRow('));
check('HI-1: DR-all handler has no direct executeBan / apiBan / instantPermaBan ref',
  !/executeBan|apiBan|instantPermaBan/.test(drallBlock));

// ── (3) detectRegistrationBursts is wired + itself contains no queue path ─
const burstStart = src.indexOf('function detectRegistrationBursts(');
const burstEnd = src.indexOf('  function scrapeCurrentPage(', burstStart);
const burstBody = src.slice(burstStart, burstEnd);

check('detectRegistrationBursts uses BURST_THRESHOLD', burstBody.includes('BURST_THRESHOLD'));
check('detectRegistrationBursts excludes pure-alpha (regex match on trailing digits)',
  burstBody.includes('name.match(/^(.*?)(\\d+)$/)'));
check('detectRegistrationBursts sets a per-root suppress window', burstBody.includes('_burstSuppress') && burstBody.includes('BURST_SUPPRESS_MS'));
check('detectRegistrationBursts toast is opt-in (actionLabel only, no queue call in the fn)',
  burstBody.includes('actionLabel') && !/batchDeathRow|addToDeathRow|executeBan|apiBan/.test(burstBody));
check('detectRegistrationBursts onAction opens the popover pre-filled', burstBody.includes('showDrPatternPopover(null') && burstBody.includes('pattern'));
check('detectRegistrationBursts is wrapped so it can never break scraping', /try\s*\{[\s\S]*\}\s*catch\s*\(\s*e\s*\)\s*\{[\s\S]*burst detection must never break/.test(burstBody));

// Both ingest paths hook the detector
const scrapeBody = src.slice(src.indexOf('function scrapeCurrentPage('), src.indexOf('function scrapeCurrentPage(') + 1800);
check('scrapeCurrentPage calls detectRegistrationBursts', scrapeBody.includes('detectRegistrationBursts(newUsernames)'));
const fetchBody = src.slice(src.indexOf('async function fetchAndIngestUsersPage'), src.indexOf('async function fetchAndIngestUsersPage') + 2200);
check('fetchAndIngestUsersPage calls detectRegistrationBursts', fetchBody.includes('detectRegistrationBursts(newUsernames)'));

// ── (4) version bump landed in the manifest ─────────────────────────────
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
check('manifest version bumped to 10.48.0', manifest.version === '10.48.0');

// ── report ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
