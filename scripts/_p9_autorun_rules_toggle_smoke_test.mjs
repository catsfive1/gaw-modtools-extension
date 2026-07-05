// _p9_autorun_rules_toggle_smoke_test.mjs
// v10.36.12 WS-3: master on/off toggle for the AUTOMATIC (background) Auto-DR
// rule invocations. The engine already auto-ran on load with no way to turn
// it off and only snacked when something matched, so a clean sweep was
// invisible (looked identical to "the engine is dead"). This adds
// DEFAULT_SETTINGS.autoRunRulesOnLoad (default TRUE -- preserves existing
// behavior) and guards the four genuinely-AUTOMATIC call sites:
//   1. scrapeCurrentPage() ingest              (new-user scrape)
//   2. fetchAndIngestUsersPage() autorefresh    (silent 60s poll)
//   3. the 4h periodic DR rule sweep timer      (unattended background)
//   4. buildTriageConsole() boot                (page load)
// Two OTHER call sites intentionally stay UNGUARDED because they are
// user-initiated clicks, not automatic paths: the "Run rules now" sweep
// button, and the Add-Pattern-inline "apply immediately" action. A rules
// toggle that also silenced a manual button-press would be the same
// "control does nothing" trust-break repeated in a new spot.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P9: auto-run-rules master toggle, default TRUE, six call sites correctly gated (v10.36.12) ===');

// --- DEFAULT_SETTINGS.autoRunRulesOnLoad === true ---
{
  const m = /autoRunRulesOnLoad:\s*true\b/.exec(SRC);
  ck('DEFAULT_SETTINGS.autoRunRulesOnLoad === true', !!m);
}

// --- registered in validateSettingsShape's required-shape map as boolean ---
{
  const m = /autoRunRulesOnLoad:\s*'boolean'/.exec(SRC);
  ck('autoRunRulesOnLoad registered as boolean in SETTINGS_REQUIRED_SHAPE (popup Repair restores it)', !!m);
}

// --- helper: grab a window of source around a marker for a scoped regex check ---
function windowAround(marker, before, after, fromIndex) {
  const idx = SRC.indexOf(marker, fromIndex || 0);
  if (idx < 0) throw new Error('FATAL: marker not found: ' + marker);
  return { ctx: SRC.slice(Math.max(0, idx - (before || 200)), idx + (after || 200)), idx };
}

// --- Site 1: scrapeCurrentPage ingest -- guarded ---
let site1End = 0;
{
  const { ctx, idx } = windowAround('applyAutoDeathRowRules(newUsernames);', 300, 50);
  site1End = idx + 40;
  ck('Site 1 (scrapeCurrentPage ingest) is guarded by getSetting(\'autoRunRulesOnLoad\', true)',
    /getSetting\('autoRunRulesOnLoad',\s*true\)/.test(ctx));
}

// --- Site 2: fetchAndIngestUsersPage autorefresh -- guarded ---
{
  const { ctx } = windowAround('applyAutoDeathRowRules(newUsernames);', 300, 50, site1End);
  ck('Site 2 (fetchAndIngestUsersPage autorefresh) is guarded', /getSetting\('autoRunRulesOnLoad',\s*true\)/.test(ctx));
}

// --- Site 3: 4h periodic sweep timer -- guarded ---
{
  const { ctx } = windowAround('try { applyAutoDeathRowRules(candidates); } catch(e){}', 300, 50);
  ck('Site 3 (4h periodic DR sweep timer) is guarded', /getSetting\('autoRunRulesOnLoad',\s*true\)/.test(ctx));
}

// --- Site 4: buildTriageConsole boot -- guarded ---
{
  const { ctx } = windowAround('applyAutoDeathRowRules(allNewNames)', 300, 20);
  ck('Site 4 (buildTriageConsole page-load boot) is guarded', /getSetting\('autoRunRulesOnLoad',\s*true\)/.test(ctx));
}

// --- Site 5: the "Run rules now" sweep button -- must NOT be guarded (user click) ---
{
  const { ctx, idx } = windowAround('applyAutoDeathRowRules(combined);', 800, 50);
  ck('sweep button context contains sweepBtn (confirms we are looking at the right handler)', /sweepBtn/.test(ctx));
  const immediatePrefix = SRC.slice(Math.max(0, idx - 60), idx);
  ck('Site 5 (user-initiated "Run rules now" sweep button) is NOT gated -- must always run on click',
    !/getSetting\('autoRunRulesOnLoad'/.test(immediatePrefix));
}

// --- Site 6: Add-Pattern inline immediate-apply -- must NOT be guarded (user click) ---
{
  const { ctx, idx } = windowAround('if (newNames.length) applyAutoDeathRowRules(newNames);', 1200, 20);
  ck('Add-Pattern immediate-apply context contains gam-dr-add-btn (confirms right handler)', /gam-dr-add-btn/.test(ctx));
  const line = SRC.slice(idx, idx + 60);
  ck('Site 6 (user-initiated Add-Pattern immediate-apply) is NOT gated -- must always run on click',
    !/getSetting\('autoRunRulesOnLoad'/.test(line));
}

// --- toolbar checkbox + settings-card mirror exist, created/bound in-render ---
{
  ck('toolbar checkbox exists (renderTriageToolbar)', /autoRulesChk\.type = 'checkbox'/.test(SRC));
  ck('toolbar checkbox bound to setSetting(\'autoRunRulesOnLoad\', ...) on change (in-render binding, not stale)',
    /autoRulesChk\.addEventListener\('change', \(\) => \{\s*setSetting\('autoRunRulesOnLoad'/.test(SRC));
  ck('settings-card mirror via addToggle(...) exists', /addToggle\('Auto-run Death Row rules on page load', 'autoRunRulesOnLoad'/.test(SRC));
}

// --- status line reflects last-run state ---
{
  ck('status line text references "Auto-rules ON" / last-run / flagged count', /Auto-rules ON.*last run.*flagged/.test(SRC));
  ck('_lastRulesRunQueued module-scoped tracker declared', /let _lastRulesRunQueued = 0;/.test(SRC));
  ck('applyAutoDeathRowRules sets _lastRulesRunQueued on every run (even 0)', /_lastRulesRunQueued = queued;/.test(SRC));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
