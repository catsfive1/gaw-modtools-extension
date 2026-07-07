// v10.38.1 regression: parseRelativeAge must parse GAW's NEW age format
// ("23 hours", "1 day" -- no "ago" suffix; live-confirmed 2026-07-07) as well
// as the old "N units ago" form. When it returned '' for every user, the
// v10.36.7 newest-first /users sort silently collapsed to raw DOM order.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'modtools.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok) {
  if (ok) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}`); }
}

console.log('=== parseRelativeAge ago-optional smoke ===');

// slice the real function out of source
const start = src.indexOf('function parseRelativeAge(text){');
check('parseRelativeAge found in source', start > 0);
const end = src.indexOf('\n  }', start);
const fnSrc = src.slice(start, end + 4);
const parseRelativeAge = new Function(`return (${fnSrc})`)();

const HOUR = 3600e3, DAY = 86400e3;
function ageMs(iso) { return Date.now() - Date.parse(iso); }
function approx(ms, target) { return Math.abs(ms - target) < 60e3; }

// NEW GAW format (no "ago") -- the live-confirmed regression case
check('"23 hours" parses (new GAW format)', approx(ageMs(parseRelativeAge('23 hours')), 23 * HOUR));
check('"1 day" parses (new GAW format)', approx(ageMs(parseRelativeAge('1 day')), DAY));
check('"5 minutes" parses', approx(ageMs(parseRelativeAge('5 minutes')), 5 * 60e3));

// OLD format must keep working
check('"3 days ago" still parses (old format)', approx(ageMs(parseRelativeAge('3 days ago')), 3 * DAY));
check('"1 hour ago" still parses', approx(ageMs(parseRelativeAge('1 hour ago')), HOUR));

// garbage still rejected
check('empty string -> ""', parseRelativeAge('') === '');
check('"junk text" -> ""', parseRelativeAge('junk text') === '');
check('"hours" alone (no number) -> ""', parseRelativeAge('hours') === '');

// PROOF the old regex was the bug: the pre-fix pattern fails on the new format
const oldRe = /(\d+)\s*(minute|hour|day|week|month|year)s?\s*ago/i;
check('OLD regex fails on "23 hours" (proves the regression)', oldRe.exec('23 hours') === null);
check('NEW source regex requires optional-ago form', fnSrc.includes('(?:\\s*ago)?'));

// sort-integration sanity: with parsed joinedAt, newest-first comparator works
const users = [
  { name: 'old', joinedAt: parseRelativeAge('1 day') },
  { name: 'new', joinedAt: parseRelativeAge('5 minutes') },
  { name: 'mid', joinedAt: parseRelativeAge('13 hours') },
];
users.sort((a, b) => Date.parse(b.joinedAt) - Date.parse(a.joinedAt));
check('sort integration: newest first', users.map(u => u.name).join(',') === 'new,mid,old');

console.log(`--- ${pass} passed, ${fail} failed ---`);
process.exit(fail ? 1 : 0);
