// Smoke test for the PROFILE PROTECTOR / CSS-VETO detector in modtools-aux.js.
//
// v10.31 root-fixed modtools.js _isProfileViewNow() to treat ANY /u/<name> (on ANY
// sub-tab) as a profile — but the twin detector that arms the PROFILE PROTECTOR + the
// !important CSS veto (modtools-aux.js _isProfileNow) was left on the OLD whitelist regex.
// Result: on GAW's owner-default profile tab (/u/<name>/submitted, /overview, ...) the
// protector never armed, body.gam-on-profile-page was never set, the veto never applied,
// and posts kept getting "eaten" — the exact recurring bug across 12+ sessions.
//
// This test slices the REAL _isProfileNow() from modtools-aux.js and asserts the SAME 16
// cases the modtools.js detector already passes, so the two detectors can never drift again.
// Run: node scripts/_profile_protector_detect_smoke_test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, '..', 'modtools-aux.js'), 'utf8');

const startMarker = 'function _isProfileNow() {';
const s = SRC.indexOf(startMarker);
if (s < 0) { console.error('FAIL: cannot find _isProfileNow (renamed/moved).'); process.exit(2); }
const e = SRC.indexOf('\n  }', s);
if (e < 0) { console.error('FAIL: cannot slice _isProfileNow body.'); process.exit(2); }
const block = SRC.slice(s, e) + '\n}';

// eslint-disable-next-line no-new-func
const factory = new Function('window', block + '\n return _isProfileNow;');
const fnFor = (pathname) => factory({ location: { pathname } })();

let pass = 0, fail = 0; const out = [];
const expect = (pathname, want) => {
  const got = fnFor(pathname);
  const ok = got === want;
  if (ok) pass++; else fail++;
  out.push('  [' + (ok ? 'PASS' : 'FAIL') + '] ' + (want ? 'PROFILE (protect+veto)' : 'not-profile') + '  ' + pathname + (ok ? '' : '  -> got ' + got));
};

// MUST arm the protector (content protected) — every tab incl. the NON-whitelisted owner tabs:
expect('/u/me', true);
expect('/u/me/', true);
expect('/u/catsfive', true);
expect('/u/catsfive/', true);
expect('/u/catsfive/posts', true);
expect('/u/catsfive/comments', true);
expect('/u/catsfive/saved', true);
expect('/u/catsfive/submitted', true);   // <-- old whitelist regex returned FALSE here = the eater
expect('/u/catsfive/overview', true);     // <-- and here (GAW owner-default tab)
expect('/u/me/upvoted', true);
expect('/u/SomeOtherUser', true);

// MUST NOT arm on non-profile surfaces:
expect('/u/c:GreatAwakening', false);     // community, not a profile
expect('/users', false);                  // triage page
expect('/p/abc123', false);               // a post
expect('/modmail/thread/5', false);
expect('/', false);

console.log('=== _isProfileNow (protector/veto) detection smoke ===');
console.log(out.join('\n'));
console.log('--- ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
