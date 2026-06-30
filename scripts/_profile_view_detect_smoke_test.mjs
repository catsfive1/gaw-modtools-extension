// Smoke test for v10.30 ROOT-CAUSE FIX: _isProfileViewNow must treat ANY /u/<name>
// (on ANY sub-tab) as a profile so content is NEVER eaten on /u/me or /u/catsfive.
// Slices the REAL function from modtools.js and runs it against the URLs Commander named
// plus the regression cases. Run: node scripts/_profile_view_detect_smoke_test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, '..', 'modtools.js'), 'utf8');

const startMarker = 'function _isProfileViewNow(){';
const s = SRC.indexOf(startMarker);
if (s < 0) { console.error('FAIL: cannot find _isProfileViewNow (renamed/moved).'); process.exit(2); }
const e = SRC.indexOf('\n  }', s);
if (e < 0) { console.error('FAIL: cannot slice _isProfileViewNow body.'); process.exit(2); }
const block = SRC.slice(s, e) + '\n}';

// eslint-disable-next-line no-new-func
const factory = new Function('window', block + '\n return _isProfileViewNow;');
const fnFor = (pathname) => factory({ location: { pathname } })();

let pass = 0, fail = 0; const out = [];
const expect = (pathname, want) => {
  const got = fnFor(pathname);
  const ok = got === want;
  if (ok) pass++; else fail++;
  out.push('  [' + (ok ? 'PASS' : 'FAIL') + '] ' + (want ? 'PROFILE (no filter)' : 'not-profile') + '  ' + pathname + (ok ? '' : '  -> got ' + got));
};

// MUST be profiles (content protected) — the URLs Commander named + every tab incl. NON-whitelisted ones:
expect('/u/me', true);
expect('/u/me/', true);
expect('/u/catsfive', true);
expect('/u/catsfive/', true);
expect('/u/catsfive/posts', true);
expect('/u/catsfive/comments', true);
expect('/u/catsfive/saved', true);
expect('/u/catsfive/submitted', true);   // <-- old whitelist regex returned FALSE here = the bug
expect('/u/catsfive/overview', true);     // <-- and here
expect('/u/me/upvoted', true);
expect('/u/SomeOtherUser', true);

// MUST NOT be treated as a user profile:
expect('/u/c:GreatAwakening', false);     // community, not a profile
expect('/users', false);                  // triage page (IS_USERS_PAGE)
expect('/p/abc123', false);               // a post
expect('/modmail/thread/5', false);
expect('/', false);

console.log('=== _isProfileViewNow detection smoke ===');
console.log(out.join('\n'));
console.log('--- ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
