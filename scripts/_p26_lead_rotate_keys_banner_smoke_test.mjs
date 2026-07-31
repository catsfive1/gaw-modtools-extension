// v10.49.2: "Rotate sub-mod keys" control restored to the Tokens tab. Proves
// the prominent lead-only banner exists in popup.html, is gated to tier==='lead'
// in __applyTierGate (NOT a client-set flag), the roster is retargetable to a
// top-level inline panel, the button is wired, the live unrotated-count hint
// prefetch exists, no native prompt() was introduced, and the manifest is
// bumped. The underlying RPCs (adminListMods / adminIssueInvite / adminBulkInvite)
// are unchanged -- this is a pure UI-surfacing change.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const popupHtml = readFileSync(join(root, 'popup.html'), 'utf8');
const popupJs = readFileSync(join(root, 'popup.js'), 'utf8');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

let pass = 0, fail = 0;
const check = (n, ok) => { ok ? (pass++, console.log(`  [PASS] ${n}`)) : (fail++, console.log(`  [FAIL] ${n}`)); };

console.log('=== v10.49.2 lead "Rotate sub-mod keys" banner smoke ===');

// ── (1) Banner + inline panel exist in popup.html ─────────────────────────
check('popup.html has #leadRotateKeysBanner', popupHtml.includes('id="leadRotateKeysBanner"'));
check('popup.html has #leadRotateRosterPanel (inline mount)', popupHtml.includes('id="leadRotateRosterPanel"'));
check('popup.html has #leadRotateResult (status target)', popupHtml.includes('id="leadRotateResult"'));
check('popup.html has #leadRotateHint (live count text)', popupHtml.includes('id="leadRotateHint"'));
check('popup.html has #leadRotateKeysBtn', popupHtml.includes('id="leadRotateKeysBtn"'));

// Banner must live INSIDE #tokStateReturning (the authed view) so it inherits
// the authed state gate, and BEFORE #tokManagementDetails (top-of-tab prominence).
const bannerIdx = popupHtml.indexOf('id="leadRotateKeysBanner"');
const mgmtIdx = popupHtml.indexOf('id="tokManagementDetails"');
const returningIdx = popupHtml.indexOf('id="tokStateReturning"');
check('banner is placed after #tokStateReturning opens', bannerIdx > returningIdx && bannerIdx > 0);
check('banner is placed before #tokManagementDetails (top-of-tab prominence)', bannerIdx < mgmtIdx);

// ── (2) Banner hidden by default (display:none) so non-leads never see it ─
check('banner default display:none', /id="leadRotateKeysBanner"[\s\S]{0,200}display:\s*none/.test(popupHtml));

// ── (3) Accessibility: button has aria-haspopup/expanded/controls ─────────
check('button has aria-expanded (toggle announce)', popupHtml.includes('aria-expanded="false"'));
check('button has aria-controls pointing at roster panel', popupHtml.includes('aria-controls="leadRotateRosterPanel"'));
check('result target has aria-live="polite" (status announce)', popupHtml.includes('aria-live="polite"'));

// ── (4) Tier gate in __applyTierGate is FULL-LEAD only ────────────────────
// Find the gate line and confirm it keys off _gamTier === 'lead' (NOT senior_lead,
// NOT gam_settings.isLeadMod). Mirror the roster's per-row tier-change gate.
const gateStart = popupJs.indexOf('v10.49.2: surface the prominent');
const gateBlock = popupJs.slice(gateStart, gateStart + 1200);
check('gate block found in popup.js', gateStart !== -1);
check('gate references _leadRotateKeysBanner by id', gateBlock.includes("getElementById('leadRotateKeysBanner')"));
check('gate toggles display on tier === "lead"', /_gamTier\s*===\s*'lead'/.test(gateBlock));
check('gate does NOT show banner for senior_lead (full-lead privilege match)', !/senior_lead[\s\S]{0,80}_rotBanner/.test(gateBlock));
check('gate does NOT read a client-set flag (gam_settings.isLeadMod)', !/isLeadMod/.test(gateBlock));

// ── (5) openRotationRoster retargetable via opts, defaults preserved ──────
const rosterStart = popupJs.indexOf('async function openRotationRoster(');
const rosterSig = popupJs.slice(rosterStart, rosterStart + 600);
check('openRotationRoster accepts opts param', /openRotationRoster\(\s*opts\s*\)/.test(rosterSig));
check('opts defaults panelId to legacy rotateRosterPanel', /panelId\s*\|\|\s*'rotateRosterPanel'/.test(rosterSig));
check('opts defaults resultId to legacy rotateInviteResult', /resultId\s*\|\|\s*'rotateInviteResult'/.test(rosterSig));
check('retarget reads panel via $(panelId) (not hardcoded)', rosterSig.includes('const panel = $(panelId)'));

// ── (6) Banner wiring IIFE exists and retargets into the inline panel ─────
check('wireLeadRotateKeys function defined', popupJs.includes('function wireLeadRotateKeys()'));
check('wireLeadRotateKeys auto-invoked at load', /\(\s*\)\s*\)\s*;\s*\n\s*wireLeadRotateKeys\(\)/.test(popupJs) || /wireLeadRotateKeys\(\);/.test(popupJs));
check('banner click calls openRotationRoster retargeted to leadRotateRosterPanel',
  /panelId:\s*'leadRotateRosterPanel'/.test(popupJs) && /resultId:\s*'leadRotateResult'/.test(popupJs));
check('banner click toggles aria-expanded', /setAttribute\(\s*'aria-expanded'/.test(popupJs));

// ── (7) Live unrotated-count hint prefetch ────────────────────────────────
check('__prefetchRotateHint function defined', popupJs.includes('async function __prefetchRotateHint()'));
check('prefetch reads adminListMods RPC', /__prefetchRotateHint[\s\S]{0,800}adminListMods/.test(popupJs));
check('prefetch filters !is_lead && !rotated_at for the unrotated count',
  /!m\.is_lead\s*&&\s*!m\.rotated_at/.test(popupJs));
check('prefetch updates #leadRotateHint text', popupJs.includes("$('leadRotateHint')"));
check('prefetch degrades silently on failure (no throw to auth path)', /catch\s*\(\s*_\s*\)[\s\S]{0,40}static default/.test(popupJs));
check('prefetch invoked from __applyTierGate only when tier===lead',
  /if\s*\(\s*_gamTier\s*===\s*'lead'\s*\)[\s\S]{0,80}__prefetchRotateHint/.test(popupJs));

// ── (8) No native prompt() introduced in the new code region ──────────────
// Slice the region from the banner gate to the v8.5.0 marker, strip // line
// comments (the explanatory comment legitimately names the prompt() bug being
// fixed), then assert no executable prompt( remains. Mirrors _p25's pattern.
const regionStart = popupJs.indexOf('v10.49.2: surface the prominent');
const prefetchEnd = popupJs.indexOf("// v8.5.0: Per-mod token sovereignty.");
const newRegion = popupJs.slice(regionStart, prefetchEnd > regionStart ? prefetchEnd : regionStart + 8000);
const newRegionNoComments = newRegion.replace(/^\s*\/\/.*$/gm, '');
check('no native prompt() in the new banner/roster code region', !/\bprompt\s*\(/.test(newRegionNoComments));

// ── (9) Backward compat: legacy nested path untouched ─────────────────────
check('legacy #rotateRosterBtn still in popup.html', popupHtml.includes('id="rotateRosterBtn"'));
check('legacy #rotateRosterPanel still in popup.html', popupHtml.includes('id="rotateRosterPanel"'));
check('legacy wireRoster still binds #rotateRosterBtn to openRotationRoster',
  popupJs.includes("$('rotateRosterBtn')") && /wireRoster\(\)/.test(popupJs));

// ── (10) Reused roster helpers unchanged (no duplicated logic) ────────────
check('__buildRosterRow still defined (reused, not duplicated)', popupJs.includes('function __buildRosterRow'));
check('__issueSingleFromRoster still defined (reused)', popupJs.includes('function __issueSingleFromRoster'));
check('__issueBulkFromRoster still defined (reused)', popupJs.includes('function __issueBulkFromRoster'));
check('__renderInviteResult still defined (reused)', popupJs.includes('function __renderInviteResult'));

// ── (11) Version bump + changelog ─────────────────────────────────────────
// Simple semver-gte: returns true if a >= b.
function vGte(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}
check('manifest version >= 10.49.2', vGte(manifest.version, '10.49.2'));
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
check('CHANGELOG has v10.49.2 entry at top', changelog.indexOf('v10.49.2') < changelog.indexOf('v10.49.0'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
