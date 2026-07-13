// Smoke test for v10.47.0 profile-COMMENTS chronological reorder.
//
// BACKGROUND: the v10.36.11 fix (_reorderProfilePostsChronological) only sorted
// POSTS — its selector was `.post[data-id]:not([data-type="comment"])`, so COMMENT
// cards on /u/me (overview) and /u/<name>/comments were never reordered. The
// profile river appends fetched comment pages OUT OF chronological order, so the
// operator's recent comments (#2 .. ~3-4 days) got stranded BELOW older comments
// and LOOKED eaten, while the single newest stayed on top — same symptom class as
// the posts "eater", just on comments. Reported across ~12 sessions.
//
// v10.47.0 generalizes the reorder to ALSO sort comment cards within their own
// .comment-list, never mixing them with posts. This test slices the REAL function
// from modtools.js and runs it against a stub DOM that has BOTH a scrambled
// .post-list AND a scrambled .comment-list, then asserts:
//   1. posts end up strictly newest-first within their .post-list
//   2. comments end up strictly newest-first within their .comment-list
//   3. the two lists NEVER mix (no post in comment-list, no comment in post-list)
//   4. the live "eater" shape (recent comment stranded below a 4-day comment) is gone
//   5. idempotent (second pass performs ZERO DOM moves)
// Run: node scripts/_profile_river_comment_reorder_smoke_test.mjs
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
function makeItem(ageMs, label, type) {
  // type is 'post' or 'comment'. data-id prefixed so post vs comment ids never collide.
  const timeEl = {
    getAttribute: (n) => (n === 'datetime' ? new Date(ageMs).toISOString() : (n === 'title' ? label : null)),
    textContent: label,
  };
  return {
    _age: ageMs, _label: label, _type: type, parentElement: null,
    getAttribute: (n) => (n === 'data-type' ? type : (n === 'data-id' ? type + ':' + ageMs : null)),
    querySelector: (sel) => (sel === 'time' ? timeEl : null),
  };
}
function makeContainer(name) {
  return {
    _name: name, children: [],
    appendChild(node) {
      const k = this.children.indexOf(node);
      if (k !== -1) this.children.splice(k, 1);
      this.children.push(node);
      node.parentElement = this;
      moveCount++;
    },
  };
}

const H = 3600e3, D = 24 * H;
const now = 1_780_000_000_000;

// The EXACT live "eater" scramble, applied to BOTH lists so we prove the fix
// handles each independently: [newest survivor] + [OLD block stranded high] +
// [RECENT block dumped low]. This is the order the river paints when it appends
// page N+1 above page N's already-rendered older items.
const scramble = [
  now - 19 * H,                                              // #0 newest survivor
  now - 4 * D, now - 4 * D, now - 5 * D, now - 6 * D,        // OLD block stranded HIGH
  now - 19 * H, now - 20 * H, now - 1 * D, now - 2 * D, now - 3 * D, // RECENT block dumped LOW
];

const postList = makeContainer('post-list');
const commentList = makeContainer('comment-list');
const allItems = [];
scramble.forEach((ms) => {
  const p = makeItem(ms, new Date(ms).toUTCString(), 'post');
  postList.appendChild(p); allItems.push(p);
});
scramble.forEach((ms) => {
  const c = makeItem(ms, new Date(ms).toUTCString(), 'comment');
  commentList.appendChild(c); allItems.push(c);
});
moveCount = 0; // reset after seeding

// document.querySelectorAll stub: route the real selectors to the right items,
// returned in CURRENT DOM order (post-list children first, then comment-list),
// exactly like a real browser. Returning a fixed seed-order array here would
// make the idempotency check spuriously fail (pass 2 would "see" the old order).
// Posts selector:    '.post[data-id]:not([data-type="comment"])'
// Comments selector: '.post[data-id][data-type="comment"], .comment[data-id][data-type="comment"]'
const allNodes = () => [...postList.children, ...commentList.children]; // live DOM order
const globalDoc = {
  querySelectorAll(sel) {
    if (sel.includes(':not([data-type="comment"])')) return allNodes().filter((it) => it._type === 'post');
    if (sel.includes('[data-type="comment"]')) return allNodes().filter((it) => it._type === 'comment');
    return [];
  },
  body: {},
  querySelector: () => null,
};
const factory = new Function('document', '_isProfileViewNow', '_profileReorderObs',
  fnSrc + '\n return _reorderProfilePostsChronological;');
const fn = factory(globalDoc, () => true, null);

let pass = 0, fail = 0; const out = [];
const check = (name, cond) => { if (cond) { pass++; out.push('  [PASS] ' + name); } else { fail++; out.push('  [FAIL] ' + name); } };
const strictlyDesc = (ages) => { for (let k = 1; k < ages.length; k++) if (ages[k] > ages[k - 1]) return false; return true; };

// PASS 1
fn();

const postAges    = postList.children.map((p) => p._age);
const commentAges = commentList.children.map((c) => c._age);

check('posts sorted strictly newest-first', strictlyDesc(postAges));
check('comments sorted strictly newest-first', strictlyDesc(commentAges));
check('post-list still holds only posts', postList.children.every((p) => p._type === 'post'));
check('comment-list still holds only comments', commentList.children.every((c) => c._type === 'comment'));
check('no post leaked into comment-list', !commentList.children.some((c) => c._type === 'post'));
check('no comment leaked into post-list', !postList.children.some((p) => p._type === 'comment'));

// The live "eater" bug for comments: a recent (<1d) comment appeared AFTER a
// 4-day comment. Assert that ordering is impossible after the fix.
const firstOldIdx = commentAges.findIndex((a) => a <= now - 4 * D);
const lastRecentIdx = commentAges.reduce((acc, a, idx) => (a > now - 4 * D ? idx : acc), -1);
check('comments: no recent item stranded below an old item', lastRecentIdx < firstOldIdx && lastRecentIdx !== -1);
check('comments: newest is at top', commentAges[0] === now - 19 * H);
check('comments: oldest is at bottom', commentAges[commentAges.length - 1] === now - 6 * D);

// PASS 2 — idempotent (no further moves)
moveCount = 0;
fn();
check('idempotent: second pass performs ZERO DOM moves', moveCount === 0);

console.log('=== _reorderProfilePostsChronological (v10.47.0 comments) smoke ===');
console.log(out.join('\n'));
console.log('--- ' + pass + ' passed, ' + fail + ' failed ---');
process.exit(fail ? 1 : 0);
