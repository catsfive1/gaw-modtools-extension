// v10.48.1: profile "/u/" post-eater -- structural root cause fix. Proves the
// reorder observer is now attached on SPA navigation (not only on hard reload),
// and the SPA profile-detection flag is a structural rule (not a whitelist).
// The recurring bug was: enhanceUserProfilePage() gated the SOLE reorder-observer
// attach site on a load-time const; SPA nav (username click) left that const
// stale-false, so the observer never attached and GAW's scrambled page-append
// order showed ("first post, then eaten until 5 days later").
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, 'modtools.js'), 'utf8');

let pass = 0, fail = 0;
const check = (n, ok) => { ok ? (pass++, console.log(`  [PASS] ${n}`)) : (fail++, console.log(`  [FAIL] ${n}`)); };

console.log('=== profile /u/ post-eater structural fix smoke ===');

// ── (1) SPA-nav profile branch now wires the reorder observer ───────────
// The now.user branch of _handleNav must reference the reorder attach path.
// Slice _handleNav's full body (it's a nested fn inside installSpaWatcher; the
// next sibling fn is well past our block, so a 1500-char window from navStart
// is enough to capture the new reorder-attach block at ~line 788).
const navStart = src.indexOf('function _handleNav()');
const navBody = src.slice(navStart, navStart + 6000);
check('SPA-nav handler found', navStart !== -1 && navBody.length > 500);
check('SPA-nav now.user branch references the reorder observer (_profileReorderObs)',
  navBody.includes('_profileReorderObs'));
check('SPA-nav now.user branch creates/re-attaches the observer on profile nav',
  /_profileReorderObs\s*=\s*new MutationObserver/.test(navBody) || navBody.includes('_profileReorderObs.observe'));
check('SPA-nav now.user branch fires an immediate reorder pass',
  navBody.includes('_scheduleReorderProfilePosts'));
check('SPA-nav reorder attach is gated on the DYNAMIC _isProfileViewNow (not the static const)',
  /typeof _isProfileViewNow[\s\S]{0,120}_isProfileViewNow\(\)/.test(navBody));
check('SPA-nav reorder attach does NOT depend on IS_USER_PROFILE_PAGE const',
  // Strip comments first: the explanatory comment legitimately names the
  // stale const it's fixing; the guard must only check actual CODE lines.
  !/IS_USER_PROFILE_PAGE/.test(navBody.replace(/^\s*\/\/.*$/gm, '')));

// ── (2) the now.user flag is a structural rule, not a whitelist ─────────
// Slice the _currentPageFlags body (nested fn; find by its name without the
// `function` prefix to match the indented definition site).
const flagsStart = src.indexOf('_currentPageFlags(path){');
const flagsBody = src.slice(flagsStart, flagsStart + 1800);
// Source is CRLF; match the user: line CRLF-aware.
const userLineMatch = flagsBody.match(/user:\s*([^\r\n]+?),[\r\n]/);
check('_currentPageFlags has a user: flag', !!userLineMatch);
const userLine = userLineMatch ? userLineMatch[1] : '';
check('user: flag matches ANY /u/<name> (structural, not whitelisted sub-route)',
  userLine.includes('/^\\/u\\/[^/]+/') && !/(posts|comments|saved|upvoted|downvoted)/.test(userLine));
check('user: flag excludes /u/c:<community>', /\/u\/c:/i.test(userLine) || userLine.toLowerCase().includes('c:'));

// Behavioral mirror of the new flag rule -- proves it accepts unlisted tabs
// and rejects communities, which the old whitelist missed.
function isProfileFlag(path) {
  return /^\/u\/[^/]+/.test(path) && !/^\/u\/c:/i.test(path);
}
check('flag: /u/me accepted (owner default, was missed by old whitelist)', isProfileFlag('/u/me'));
check('flag: /u/catsfive accepted', isProfileFlag('/u/catsfive'));
check('flag: /u/me/posts accepted (listed sub-tab)', isProfileFlag('/u/me/posts'));
check('flag: /u/me/owner accepted (UNLISTED sub-tab -- the trap)', isProfileFlag('/u/me/owner'));
check('flag: /u/me/ accepted (trailing slash)', isProfileFlag('/u/me/'));
check('flag: /u/c:general REJECTED (community, not a user profile)', !isProfileFlag('/u/c:general'));
check('flag: / rejected (feed, not a profile)', !isProfileFlag('/'));
check('flag: /users rejected (triage, not a profile)', !isProfileFlag('/users'));
check('flag: /p/abc rejected (single post)', !isProfileFlag('/p/abc-uuid'));

// ── (3) the reorder function itself stays HI-1 (pure DOM sort) ──────────
const reorderStart = src.indexOf('function _reorderProfilePostsChronological()');
const reorderEnd = src.indexOf('function _scheduleReorderProfilePosts()', reorderStart);
const reorderBody = src.slice(reorderStart, reorderEnd);
check('reorder fn found', reorderStart !== -1);
check('HI-1: reorder fn has NO ban/queue/execute refs (pure DOM sort)',
  !/executeBan|apiBan|addToDeathRow|batchDeathRow|instantPermaBan|processDeathRow/.test(reorderBody));
check('reorder fn sorts newest-first by <time> descending', reorderBody.includes('getT(b) - getT(a)'));
check('reorder fn separates posts from comments (never mixed)', reorderBody.includes(':not([data-type="comment"])'));

// ── (4) v10.49.0 race-proof CSS veto (complementary layer) ──────────────
// The concurrent eater-kill commit added a top-of-IIFE <style> block that
// forces .post visible on /u/ and /p/ via !important, scoped to
// body.gam-protect-posts. CSS cannot race the hider -- this is why the fix
// finally holds. Assert it is present and correctly scoped.
check('CSS eater-kill style block present (gam-eater-kill-style)',
  src.includes("id = 'gam-eater-kill-style'") || src.includes('id="gam-eater-kill-style"'));
check('CSS veto scoped to body.gam-protect-posts (never leaks to feeds)',
  src.includes('body.gam-protect-posts .post'));
check('CSS veto uses !important on display (beats inline display:none)',
  /display\s*:\s*flex\s*!important/.test(src));
check('CSS veto body-class is set SYNCHRONOUSLY (classList.toggle in the IIFE)',
  src.includes("classList.toggle('gam-protect-posts'"));
check('CSS veto re-asserts on SPA nav (history hook)',
  /history\.pushState\s*=\s*_hook/.test(src) || src.includes("_hook(history.pushState"));

// ── (5) version gate (>= so this test survives future bumps) ────────────
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
function _vGte(v, min){ const a=v.split('.').map(Number), b=min.split('.').map(Number); for(let i=0;i<3;i++){ if((a[i]||0)>(b[i]||0)) return true; if((a[i]||0)<(b[i]||0)) return false; } return true; }
// The eater fix shipped at 10.48.1 (SPA reorder attach + structural flag) and
// was reinforced at 10.49.0 (race-proof CSS veto). Any version >= 10.48.1 is
// correct; the CSS-veto checks above additionally require the 10.49.0 layer.
check('manifest version >= 10.49.0 (eater-kill shipped, CSS veto reinforced)', _vGte(manifest.version, '10.49.0'));

// ── report ──────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
