// _p12_arialive_ungate_smoke_test.mjs
// v10.36.16 WS-6: __mountAriaLive() / __announce() were gated behind
// __uxOn() (two default-false visual-polish flags), so on a stock install
// the screen-reader live regions never mounted at all -- the accessibility
// face of "no feedback" (snack() already piped every toast to __announce(),
// but nothing was there to hear it). This ungates both unconditionally.
// Regions are .gam-sr-only (visually hidden either way), so this is a pure
// a11y fix with zero visual change; all VISUAL uxPolish gating elsewhere in
// the file is untouched.
//
// Slices the real __mountAriaLive + __announce verbatim and behaviorally
// exercises them with a minimal fake DOM.
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P12: aria-live announcer ungated from __uxOn() (v10.36.16) ===');

// isolate just __mountAriaLive's body up to its own closing brace (before the
// module-scoped __liveDebounce declaration that follows it in source)
const mountEnd = SRC.indexOf('\r\n  }', SRC.indexOf('function __mountAriaLive(){')) + '\r\n  }'.length;
const mountFnSrc = SRC.slice(SRC.indexOf('function __mountAriaLive(){'), mountEnd);

const announceStart = SRC.indexOf('function __announce(kind, msg){');
const announceEnd = SRC.indexOf('\r\n  }', announceStart) + '\r\n  }'.length;
const announceFnSrc = SRC.slice(announceStart, announceEnd);

// --- static: neither function has an early-return guard on __uxOn() anymore ---
// (checks for the executable guard pattern specifically, not just any mention
// of the string -- both functions carry an explanatory comment that names
// __uxOn() in prose, which a bare substring match would false-positive on.)
const UXON_GUARD_RE = /if\s*\(\s*!?\s*__uxOn\(\)\s*\)\s*return/;
ck('__mountAriaLive no longer early-returns on __uxOn()', !UXON_GUARD_RE.test(mountFnSrc));
ck('__announce no longer early-returns on __uxOn()', !UXON_GUARD_RE.test(announceFnSrc));

function makeFakeDoc() {
  const elements = {};
  function makeEl(tag) {
    return {
      tag, id: '', className: '', attrs: {}, textContent: '',
      setAttribute(k, v) { this.attrs[k] = v; },
    };
  }
  const body = { children: [], appendChild(el) { this.children.push(el); elements[el.id] = el; } };
  return {
    body,
    getElementById(id) { return elements[id] || null; },
    createElement(tag) { return makeEl(tag); },
    __elements: elements,
  };
}

function run() {
  const document = makeFakeDoc();
  // capture the scheduled fn via the injected setTimeout stub (the real
  // __announce debounces its write by 50ms via setTimeout)
  let scheduled = null;
  const stubSetTimeout = (fn) => { scheduled = fn; return 1; };
  const stubClearTimeout = () => {};
  const factory = new Function(
    'document', 'setTimeout', 'clearTimeout',
    mountFnSrc + '\n' + announceFnSrc + '\n return { __mountAriaLive, __announce };'
  );
  const api = factory(document, stubSetTimeout, stubClearTimeout);
  return { ...api, document, runScheduled: () => { if (scheduled) scheduled(); } };
}

// --- __mountAriaLive mounts both live regions unconditionally (no flag needed) ---
{
  const { __mountAriaLive, document } = run();
  __mountAriaLive();
  ck('polite live region mounted', !!document.getElementById('gam-live-polite'));
  ck('assertive live region mounted', !!document.getElementById('gam-live-assertive'));
  const polite = document.getElementById('gam-live-polite');
  ck('polite region carries aria-live=polite', polite.attrs['aria-live'] === 'polite');
  ck('polite region is visually hidden via gam-sr-only', polite.className === 'gam-sr-only');
  const assertive = document.getElementById('gam-live-assertive');
  ck('assertive region carries aria-live=assertive', assertive.attrs['aria-live'] === 'assertive');
}

// --- __mountAriaLive is idempotent (no double-mount on repeated calls) ---
{
  const { __mountAriaLive, document } = run();
  __mountAriaLive();
  __mountAriaLive();
  ck('double-mount does not duplicate (body has exactly 2 children)', document.body.children.length === 2);
}

// --- __announce writes into the correct region by kind, debounced via setTimeout ---
{
  const { __mountAriaLive, __announce, document, runScheduled } = run();
  __mountAriaLive();
  __announce('polite', 'Test message');
  runScheduled();
  const polite = document.getElementById('gam-live-polite');
  ck('__announce("polite", ...) writes into the polite region', polite.textContent === 'Test message');
}
{
  const { __mountAriaLive, __announce, document, runScheduled } = run();
  __mountAriaLive();
  __announce('error', 'Danger message');
  runScheduled();
  const assertive = document.getElementById('gam-live-assertive');
  ck('__announce("error", ...) writes into the assertive region', assertive.textContent === 'Danger message');
}

// --- __announce before mount is a safe no-op (no throw) ---
{
  const { __announce } = run();
  let threw = false;
  try { __announce('polite', 'no region yet'); } catch (e) { threw = true; }
  ck('__announce before __mountAriaLive does not throw', !threw);
}

// --- __announce truncates to 200 chars (defense against runaway strings) ---
{
  const { __mountAriaLive, __announce, document, runScheduled } = run();
  __mountAriaLive();
  __announce('polite', 'x'.repeat(500));
  runScheduled();
  const polite = document.getElementById('gam-live-polite');
  ck('__announce truncates message to 200 chars', polite.textContent.length === 200);
}

// --- static: the preflight arm-warning carries role=alert ---
ck('preflight arm-warning div carries role="alert"', /class="gam-preflight-arm" role="alert"/.test(SRC));

// --- static: the Triage alerts container carries role=region + aria-label (not aria-live, per WS-6 spec) ---
ck('Triage alerts container carries role="region" aria-label="Triage alerts"',
  /class="gam-t-alerts" role="region" aria-label="Triage alerts"/.test(SRC));
ck('Triage alerts container is NOT marked aria-live (would re-announce identical text every render)',
  !/class="gam-t-alerts"[^>]*aria-live/.test(SRC));

// --- static: burst delta announcements are keyed by prefix via a tracker, not blind re-announce ---
ck('renderTriageAlerts tracks last-announced cluster counts by prefix (_lastAnnouncedClusters)',
  /_lastAnnouncedClusters/.test(SRC));
ck('burst delta announce only fires when the per-prefix count actually changed',
  /_lastAnnouncedClusters\[prefix\]\s*!==\s*names\.length/.test(SRC));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
