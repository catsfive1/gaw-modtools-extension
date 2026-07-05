// _p11_new_user_bold_flag_smoke_test.mjs
// v10.36.15 WS-5: bold genuinely-new (recent AND unreviewed) usernames --
// the BOLD half of Commander's "sort newest-first AND bold new users" ask
// (the sort half already shipped in v10.36.7). Pure CSS + one class on the
// row; cannot boot-crash and does not touch HI-1.
//
// Slices the real buildUserRow(u, opts) verbatim and stubs every DOM/helper
// dependency with the project's established slice-and-stub convention,
// asserting only the computed row.className (the WS-5 surface).
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P11: bold genuinely-new (recent AND unreviewed) usernames -- gam-t-row-fresh (v10.36.15) ===');

const start = SRC.indexOf('function buildUserRow(u, opts){');
const retIdx = SRC.indexOf('return row;', start);
const end = SRC.indexOf('}', retIdx) + 1;
if (start < 0 || retIdx < 0 || end <= 0) { console.error('FATAL: buildUserRow markers not found'); process.exit(2); }
const fnSrc = SRC.slice(start, end) + '\n return buildUserRow;';

function makeFakeElement() {
  const el = {
    className: '',
    attrs: {},
    style: {},
    _innerHTML: '',
    set innerHTML(v) { this._innerHTML = v; },
    get innerHTML() { return this._innerHTML; },
    setAttribute(k, v) { this.attrs[k] = v; },
    querySelector() { return makeFakeElement(); },
    querySelectorAll() { return []; }, // no .gam-t-act buttons to iterate -- fine, we only assert className
    addEventListener() {},
  };
  return el;
}

function run(u, opts) {
  const document = {
    createElement() { return makeFakeElement(); },
  };
  const triageSelected = new Set(); // empty -- not exercising selection state here
  const noop = () => {};
  const stubs = {
    document, triageSelected,
    escapeHtml: (s) => String(s),
    timeUntil: () => '',
    getSetting: (k, d) => d,
    addToDeathRow: () => false,
    rosterSetStatus: noop,
    logAction: noop,
    snack: noop,
    refreshTriageConsole: noop,
    getUsersBanReason: () => '',
    markSeenUser: noop,
    unmarkSeenUser: noop,
    getWatchlist: () => ({}),
    saveWatchlist: noop,
    instantPermaBan: noop,
    openModConsole: noop,
    showDeathRowPopover: noop,
    showDrPatternPopover: noop,
    IntelDrawer: { open: noop },
    window: { open: noop },
  };
  const argNames = Object.keys(stubs);
  const factory = new Function(...argNames, fnSrc);
  const buildUserRow = factory(...argNames.map(k => stubs[k]));
  return buildUserRow(u, opts);
}

function baseUser(overrides) {
  return Object.assign({
    username: 'testuser',
    status: 'new',
    reviewed: false,
    joinedAt: new Date().toISOString(), // just now -- fresh
    risk: 'low',
    onCurrentPage: true,
  }, overrides);
}

// --- a recent, unreviewed, status:'new' user IS bolded ---
{
  const row = run(baseUser());
  ck('recent unreviewed new user gets gam-t-row-fresh', / gam-t-row-fresh(\s|$)/.test(row.className));
}

// --- a user older than 24h is NOT bolded ---
{
  const old = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
  const row = run(baseUser({ joinedAt: old }));
  ck('a user older than 24h does NOT get gam-t-row-fresh', !/gam-t-row-fresh/.test(row.className));
}

// --- a user just under 24h old IS bolded (boundary) ---
{
  const almostDay = new Date(Date.now() - 23.9 * 3600 * 1000).toISOString();
  const row = run(baseUser({ joinedAt: almostDay }));
  ck('a user just under 24h old gets gam-t-row-fresh', /gam-t-row-fresh/.test(row.className));
}

// --- a reviewed user, even if recent, is NOT bolded ---
{
  const row = run(baseUser({ reviewed: true }));
  ck('a reviewed recent user does NOT get gam-t-row-fresh', !/gam-t-row-fresh/.test(row.className));
}

// --- a non-'new' status user (e.g. watching), even if recent+unreviewed, is NOT bolded ---
{
  const row = run(baseUser({ status: 'watching' }));
  ck('a non-"new"-status user does NOT get gam-t-row-fresh', !/gam-t-row-fresh/.test(row.className));
}

// --- missing joinedAt is treated as NOT fresh (no parse-miss bolding the whole list) ---
{
  const row = run(baseUser({ joinedAt: '' }));
  ck('missing joinedAt does NOT get gam-t-row-fresh (defensive default)', !/gam-t-row-fresh/.test(row.className));
}

// --- unparseable joinedAt is treated as NOT fresh ---
{
  const row = run(baseUser({ joinedAt: 'not-a-real-date' }));
  ck('unparseable joinedAt does NOT get gam-t-row-fresh (defensive default)', !/gam-t-row-fresh/.test(row.className));
}

// --- existing classes (banned/historical/tard/selected) still compose correctly alongside fresh ---
{
  const row = run(baseUser({ status: 'banned' }));
  ck('a banned user (status changed away from "new") does NOT get gam-t-row-fresh, but still gets gam-t-row-banned',
    !/gam-t-row-fresh/.test(row.className) && /gam-t-row-banned/.test(row.className));
}
{
  const row = run(baseUser(), { tard: true });
  ck('a fresh+tard-flagged row gets BOTH classes (CSS precedence, not JS, decides the visual winner)',
    /gam-t-row-fresh/.test(row.className) && /gam-t-row-tard/.test(row.className));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
