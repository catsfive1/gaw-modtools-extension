// Smoke test for v10.36.11 profile-posts chronological reorder.
//
// ROOT CAUSE (confirmed LIVE 2026-07-05 via Claude-in-Chrome on catsfive's real
// /u/catsfive/?type=submission): nothing hides/removes profile posts — the river
// (and GAW native scroll) append fetched pages OUT OF chronological order, so the
// operator's recent posts (#2 .. ~3 days) end up stranded BELOW older 4-6-day
// posts and LOOK eaten. Server order is correct; only the client DOM is scrambled.
//
// _reorderProfilePostsChronological() re-sorts every .post[data-id] by its <time>
// descending into the first .post-list. This test slices the REAL function from
// modtools.js, runs it against a minimal DOM stub seeded in the EXACT scrambled
// order observed live ([19h] + [4d,5d,6d block] + [recent block]), and asserts:
//   1. after one pass, posts are strictly newest-first
//   2. the specific live bug (recent posts below old ones) is gone
//   3. it's idempotent (second pass makes no further DOM moves)
// Run: node scripts/_profile_river_reorder_smoke_test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, '..', 'modtools.js'), 'utf8');

// --- Slice the real function body by brace-counting ---
const marker = 'function _reorderProfilePostsChronological(){';
const start = SRC.indexOf(marker);
if (start < 0) { console.error('FAIL: _reorderProfilePostsChronological not found (renamed/moved).'); process.exit(2); }
let depth = 0, i = SRC.indexOf('{', start), end = -1;
for (; i < SRC.length; i++) {
  if (SRC[i] === '{') depth++;
  else if (SRC[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
if (end < 0) { console.error('FAIL: could not brace-match the function body.'); process.exit(2); }
const fnSrc = SRC.slice(start, end + 1);

// --- Minimal DOM stub ---
let moveCount = 0;
function makePost(ageMs, dtLabel) {
  const timeEl = { getAttribute: (n) => (n === 'datetime' ? new Date(ageMs).toISOString() : (n === 'title' ? dtLabel : null)), textContent: dtLabel };
  return {
    _age: ageMs, _label: dtLabel, parentElement: null,
    getAttribute: (n) => (n === 'data-type' ? 'post' : (n === 'data-id' ? String(ageMs) : null)),
    querySelector: (sel) => (sel === 'time' ? timeEl : null),
  };
}
const container = {
  children: [],
  appendChild(node) { const k = this.children.indexOf(node); if (k !== -1) this.children.splice(k, 1); this.children.push(node); node.parentElement = this; moveCount++; },
};

// Build the EXACT scramble seen live: [19h] + [4d,4d,5d,6d block] + [19h,20h,1d,2d,3d recent block]
const H = 3600e3, D = 24 * H;
const now = 1_780_000_000_000; // fixed epoch (Date.now() is unavailable in scripts anyway)
const order = [
  now - 19 * H,                                   // #0 newest survivor
  now - 4 * D, now - 4 * D, now - 5 * D, now - 6 * D, // stranded-high OLD block
  now - 19 * H, now - 20 * H, now - 1 * D, now - 2 * D, now - 3 * D, // recent block dumped low
];
const posts = order.map((ms) => makePost(ms, new Date(ms).toUTCString()));
posts.forEach((p) => container.appendChild(p));
moveCount = 0; // reset after seeding

// --- Inject stubs and run the real function ---
const globalDoc = { querySelectorAll: (sel) => (sel.startsWith('.post[data-id]') ? container.children.slice() : []), body: {}, querySelector: () => null };
const factory = new Function('document', '_isProfileViewNow', '_profileReorderObs',
  fnSrc + '\n return _reorderProfilePostsChronological;');
const fn = factory(globalDoc, () => true, null);

let pass = 0, fail = 0; const out = [];
const check = (name, cond) => { if (cond) { pass++; out.push('  [PASS] ' + name); } else { fail++; out.push('  [FAIL] ' + name); } };

// PASS 1
fn();
const ages1 = container.children.map((p) => p._age);
let strictlyDesc = true;
for (let k = 1; k < ages1.length; k++) if (ages1[k] > ages1[k - 1]) strictlyDesc = false;
check('after reorder: strictly newest-first', strictlyDesc);
check('newest post is #0', ages1[0] === now - 19 * H);
check('oldest post is last', ages1[ages1.length - 1] === now - 6 * D);
// the live bug: a recent (<1d) post appeared AFTER a 4-day post. Assert that's gone.
const firstOldIdx = ages1.findIndex((a) => a <= now - 4 * D);
const lastRecentIdx = ages1.reduce((acc, a, idx) => (a > now - 4 * D ? idx : acc), -1);
check('no recent post stranded below an old post', lastRecentIdx < firstOldIdx);

// PASS 2 — idempotent (no further moves)
moveCount = 0;
fn();
check('idempotent: second pass performs ZERO DOM moves', moveCount === 0);

console.log('=== _reorderProfilePostsChronological smoke ===');
console.log(out.join('\n'));
console.log('--- ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
