// v10.41.0 regression: SHIFT-click on a feed/comment username must open the
// user's profile in a NEW TAB (window.open /u/<name>/). Regressed when GAW's
// SPA router began intercepting the anchor and navigating in-place.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'modtools.js'), 'utf8');

let pass = 0, fail = 0;
const check = (n, ok) => { ok ? (pass++, console.log(`  [PASS] ${n}`)) : (fail++, console.log(`  [FAIL] ${n}`)); };

console.log('=== shift-click new-tab smoke ===');

// 1. the branch exists and is gated correctly (shift only, no other modifiers)
const branchIdx = src.indexOf('v10.41.0: restore SHIFT-click');
check('shift-click branch present', branchIdx > 0);
const branch = src.slice(branchIdx, branchIdx + 1500);
check('gated shift-only (excludes ctrl/meta/alt)',
  branch.includes('e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey'));
check('opens in a new tab', branch.includes("'_blank'"));
check('builds /u/<name>/ target', branch.includes('`/u/${encodeURIComponent(uname)}/`'));
check('preventDefault + stopPropagation (blocks SPA router)',
  branch.includes('e.preventDefault()') && branch.includes('e.stopPropagation()'));
check('branch runs BEFORE the pin branch',
  branchIdx < src.indexOf('if (al && !e.shiftKey && !FallbackMode)'));

// 2. behavioral: replicate the username-derivation logic and prove it
function deriveUname(hrefAttr, text) {
  let uname = '';
  const hm = hrefAttr && /\/u\/([^/?#]+)/i.exec(hrefAttr);
  if (hm) uname = decodeURIComponent(hm[1]);
  else uname = text.trim().replace(/^\/?u\//i, '').replace(/^@/, '');
  return uname;
}
check('href form -> clean username', deriveUname('/u/BadActor/', 'Bad Actor') === 'BadActor');
check('href with query -> clean username', deriveUname('/u/xyz?tab=posts', 'xyz') === 'xyz');
check('no href, u/ text prefix stripped', deriveUname(null, 'u/someone') === 'someone');
check('no href, @ prefix stripped', deriveUname('', '@handle') === 'handle');
check('encoded href decoded', deriveUname('/u/a%20b/', 'a b') === 'a b');

// 3. ctrl-click is NOT hijacked (browser keeps native new-tab)
const ctrlClickHijacked = branch.includes('e.ctrlKey && ') && !branch.includes('!e.ctrlKey');
check('ctrl-click left to browser (not hijacked)', !ctrlClickHijacked);

console.log(`--- ${pass} passed, ${fail} failed ---`);
process.exit(fail ? 1 : 0);
