// _p16_dialog_sweep_batch_progress_smoke_test.mjs
// v10.39.0 UX P1 (Dead Buttons & Ban Friction): three workstreams from the
// UXUI-AUDIT-2026-07-07 P1 section, items 1-3.
//   WS-A native dialog sweep   -- ~14 confirm()/prompt() sites on live action
//                                 paths replaced with gamConfirm (styled
//                                 _gamAuxConfirm) / askTextModal / gam-modal.
//                                 Brave can silently suppress native dialogs
//                                 in content scripts => dead buttons.
//   WS-B timed-ban friction    -- client preflight confirm modal SKIPPED for
//                                 duration>0 (Tier-A 20s undo is the net);
//                                 modBanPreflight RPC now runs CONCURRENTLY
//                                 with evidence capture but still gates the
//                                 ban send on {ok:false}.
//   WS-C batch progress+roster -- processDeathRow shows ONE updating progress
//                                 element for batches >3 and a persistent
//                                 completion summary naming up to 10 failed
//                                 usernames (never success-type on failure);
//                                 GOD MODE bulk-DR summary names failures too.
// Behavioral slices of the REAL functions where practical; static asserts
// (with an explicit allowlist of deliberately-skipped sites) elsewhere.
import { readFileSync } from 'node:fs';

// Normalize CRLF -> LF so multi-line fragment asserts are stable.
const SRC = readFileSync(new URL('../modtools.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const AUX = readFileSync(new URL('../modtools-aux.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const POPUP = readFileSync(new URL('../popup.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ck(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('=== P16: dialog sweep + timed-ban friction + batch progress (v10.39.0) ===');

// ---------------------------------------------------------------------------
// WS-A0: gamConfirm helper exists and routes through _gamAuxConfirm.
// ---------------------------------------------------------------------------
{
  ck('gamConfirm helper defined', SRC.includes('function gamConfirm(message, opts){'));
  ck('gamConfirm routes through window._gamAuxConfirm',
    /function gamConfirm\(message, opts\)\{[\s\S]{0,400}window\._gamAuxConfirm === 'function'/.test(SRC));
}

// ---------------------------------------------------------------------------
// WS-A1: every SWEPT site's old native call is GONE and its styled
// replacement is present. These are the exact audit-doc sites.
// ---------------------------------------------------------------------------
{
  const sweptGone = [
    // [old native fragment, replacement fragment, label]
    ['if (!confirm(`Arm DR Sniper on', 'await gamConfirm(`Arm DR Sniper on', 'DR sniper arm'],
    ["if (!confirm('Cancel death row for", "await gamConfirm('Cancel death row for", 'DR cancel-selected'],
    ["if(confirm('Clear all?')", "await gamConfirm('Clear all mod-log entries?'", 'mod-log clear all'],
    ['if (!confirm(`Add ${ctxU} to Death Row', 'await gamConfirm(`Add ${ctxU} to Death Row', 'ctx-menu DR add'],
    ['if (!confirm(`Add ${username} to Death Row', 'await gamConfirm(`Add ${username} to Death Row', 'tooltip DR add'],
    ['if(!confirm(`Ban ${triageSelected.size}', 'await gamConfirm(`Ban ${triageSelected.size}', 'batch ban-all'],
    ["window.confirm('Queue ALL ' + tards.length", "await gamConfirm('Queue ALL ' + tards.length", 'tards queue-all'],
    ['if (!confirm(`Unban ${uname}?', 'await gamConfirm(`Unban ${uname}?', 'ban-page unban'],
    ["prompt('Edit your message (5min window):'", "title: 'Edit message',", 'team-chat edit'],
    ["ok = window.confirm('Send AI reply directly?", "ok = await gamConfirm(", 'AI direct send'],
    ['if (!confirm(`Unban ${sender}?', 'await gamConfirm(`Unban ${sender}?', 'modmail unban'],
    ['if (!window.confirm(confirmMsg))', 'await gamConfirm(confirmMsg,', 'lock drift confirm'],
    ["const choice = window.prompt(\n            '🛡 IMMUNE POSTS", "showModal('gam-immune-mgr'", 'immune-posts manager'],
  ];
  for (const [oldFrag, newFrag, label] of sweptGone) {
    ck('WS-A swept [' + label + ']: native call gone', !SRC.includes(oldFrag));
    ck('WS-A swept [' + label + ']: styled replacement present', SRC.includes(newFrag));
  }
  // popup invite prompt: no native prompt anywhere in popup.js
  ck('WS-A swept [popup invite]: native prompt gone from popup.js',
    !/\b(?:window\.)?prompt\s*\(\s*[^)\s]/.test(POPUP));
  ck('WS-A swept [popup invite]: __popupAskText now unconditional',
    !POPUP.includes("who = prompt(isQa"));
  // immune-posts manager modal shape
  ck('WS-A immune modal: per-row Remove buttons', /_immuneRemove\(entry\.thingId\);/.test(SRC));
  ck('WS-A immune modal: Clear all via gamConfirm',
    SRC.includes("await gamConfirm('Remove immunity from ALL ' + entries.length"));
  ck('WS-A immune modal: old type-a-number menu gone', !SRC.includes('a number to REMOVE that entry'));
}

// ---------------------------------------------------------------------------
// WS-A2: global native-dialog scan with an ALLOWLIST of deliberately-skipped
// sites (out of this cut's audit-doc scope) + the single last-ditch fallback
// inside gamConfirm itself. Any NEW native confirm()/prompt() with a message
// that isn't allowlisted fails this test.
// ---------------------------------------------------------------------------
{
  const ALLOWLIST = [
    'Promise.resolve(!!window.confirm(message))',   // gamConfirm's own aux-missing fallback
    'Username to investigate:',                     // GOD-MODE investigate fallback (aux primary is styled)
    'Archive all current notes for',                // notes archive (not in audit-doc list)
    'Grant title to',                               // title-grant chain = P1 item 4 (separate cut)
    'Custom title text',                            // title-grant chain = P1 item 4
    'Expires in N days',                            // title-grant chain = P1 item 4
    'severity? (watch / danger / critical)',        // flag-user chain = P1 item 4
    'Reason (visible to other mods):',              // flag-user chain = P1 item 4
    'Reason for marking',                           // SUS custom-reason fallback (not in list)
    'Clear SUS flag on',                            // SUS clear (not in list)
    'Wipe all team chat?',                          // not in audit-doc list
    'Mark this thread as resolved',                 // not in audit-doc list
    'GAW ModTools detected an invite code',         // invite-claim security confirms (not in list)
    'Bug title (short):',                           // bug-report fallback (hardening-off)
    'What went wrong? (details)',                   // bug-report fallback
    'Bug reports are posted as PUBLIC GitHub issues', // bug-report consent
    'Open this URL to reload the extension:',       // last-ditch reload fallback
  ];
  const re = /(?:window\.)?(?:confirm|prompt)\(/g; // no whitespace before ( => prose mentions like "confirm (…)" don't match
  let m;
  const offenders = [];
  while ((m = re.exec(SRC)) !== null) {
    const start = m.index;
    // skip identifiers ending in confirm/prompt (gamConfirm, _gamAuxConfirm, _gamPromptMacro, …)
    const prev = SRC[start - 1] || '';
    if (!m[0].startsWith('window.') && /[\w$.]/.test(prev)) continue;
    const after = SRC.slice(start + m[0].length, start + m[0].length + 400);
    if (after.startsWith(')')) continue; // empty-arg mentions in comments: prompt()
    const windowTxt = SRC.slice(Math.max(0, start - 120), start + 420);
    if (!ALLOWLIST.some(a => windowTxt.includes(a))) offenders.push(windowTxt.slice(100, 220).replace(/\s+/g, ' '));
  }
  ck('WS-A allowlist scan: zero non-allowlisted native dialogs in modtools.js (found: ' +
    (offenders.length ? offenders.join(' || ') : 'none') + ')', offenders.length === 0);
}

// ---------------------------------------------------------------------------
// WS-B1: timed-ban preflight-modal skip -- slice the real branch and run it.
// ---------------------------------------------------------------------------
const pfSkipStart = SRC.indexOf('let confirmed = true;\n      if (!(duration > 0)) confirmed = await preflight({');
ck('WS-B: modal-skip branch present', pfSkipStart > 0);
{
  const sliceEnd = SRC.indexOf('if (!confirmed) return;', pfSkipStart);
  ck('WS-B: modal-skip slice end found', sliceEnd > pfSkipStart);
  const slice = SRC.slice(pfSkipStart, sliceEnd + 'if (!confirmed) return;'.length);
  const run = (duration, pfReturn, calls) => new Function(
    'duration', 'preflight', 'durationLabel', 'username', 'subject', 'message',
    'alsoModmail', 'evidenceText', 'isRepeat', 'priorCount',
    'return (async () => { ' + slice + '\n return { confirmed }; })();'
  )(
    duration,
    (opts) => { calls.push(opts); return Promise.resolve(pfReturn); },
    (d) => String(d), 'userX', 'subj', 'msg body', false, '', false, 0
  );
  // timed ban (duration=7): modal SKIPPED, proceeds
  {
    const calls = [];
    const r = await run(7, true, calls);
    ck('WS-B timed ban: preflight modal NOT shown', calls.length === 0);
    ck('WS-B timed ban: proceeds (confirmed=true)', r && r.confirmed === true);
  }
  // perma (duration=-1): modal SHOWN with danger + 3s arm; cancel blocks
  {
    const calls = [];
    const r = await run(-1, false, calls);
    ck('WS-B perma: preflight modal shown', calls.length === 1);
    ck('WS-B perma: danger + 3s arm preserved', calls[0].danger === true && calls[0].armSeconds === 3);
    ck('WS-B perma: cancel => early return (no action)', r === undefined);
  }
  // warning (duration=0): modal SHOWN
  {
    const calls = [];
    const r = await run(0, true, calls);
    ck('WS-B warning: preflight modal shown', calls.length === 1);
    ck('WS-B warning: confirm proceeds', r && r.confirmed === true);
  }
}

// ---------------------------------------------------------------------------
// WS-B2: concurrent preflight RPC -- slice the real region and run it.
// ---------------------------------------------------------------------------
const pfcStart = SRC.indexOf("const _pfPromise = rpcCall('modBanPreflight', {");
ck('WS-B: concurrent _pfPromise present', pfcStart > 0);
{
  const pfcEndMarker = 'statusEl.innerHTML = `<div class="gam-mc-banner gam-mc-banner-info">Sending ban...</div>`;';
  const pfcEnd = SRC.indexOf(pfcEndMarker, pfcStart);
  ck('WS-B: concurrent slice end found', pfcEnd > pfcStart);
  const slice = SRC.slice(pfcStart, pfcEnd);
  ck('WS-B static: RPC starts BEFORE evidence capture is awaited',
    slice.indexOf("rpcCall('modBanPreflight'") < slice.indexOf("await captureEvidence('ban'"));
  ck('WS-B static: preflight verdict awaited BEFORE ban send region ends',
    slice.includes('const _pfRes = await _pfPromise;'));
  ck('WS-B static: audit chain intact (modBanConfirm still fired downstream)',
    SRC.includes("rpcCall('modBanConfirm', {"));

  const makeRun = ({ pfResult, pfReject } = {}) => {
    const events = [];
    const snacks = [];
    const statusEl = { innerHTML: '' };
    const goBtn = { disabled: true };
    const fn = new Function(
      'rpcCall', 'captureEvidence', '_logError', 'ERR_SEV', 'statusEl', 'goBtn', 'snack',
      'username', 'item', '_hoursForApi', '_isPerma', 'fullReason',
      'return (async () => { ' + slice + '\n return { banAuditId: _banAuditId, evidenceKey }; })();'
    );
    const p = fn(
      (name, args) => {
        events.push('pf-start');
        return new Promise((res, rej) => setTimeout(() => {
          events.push('pf-settled');
          if (pfReject) rej(pfReject); else res(pfResult);
        }, 20));
      },
      () => {
        events.push('evidence-start');
        return new Promise((res) => setTimeout(() => { events.push('evidence-done'); res('evi-key'); }, 5));
      },
      (...a) => events.push('logError'),
      { MED: 'med' },
      statusEl, goBtn,
      (msg, type) => snacks.push({ msg, type }),
      'userX', null, 168, false, 'subj\r\n\r\nmsg'
    );
    return { p, events, snacks, statusEl, goBtn };
  };
  // happy path: RPC + evidence overlap; audit id captured; proceeds
  {
    const { p, events } = makeRun({ pfResult: { ok: true, audit_id: 'a-77' } });
    const r = await p;
    ck('WS-B concurrent: RPC fired before evidence started', events.indexOf('pf-start') < events.indexOf('evidence-start'));
    ck('WS-B concurrent: evidence ran WHILE preflight in flight', events.indexOf('evidence-start') < events.indexOf('pf-settled'));
    ck('WS-B concurrent: audit_id captured', r && r.banAuditId === 'a-77');
    ck('WS-B concurrent: evidence key preserved', r && r.evidenceKey === 'evi-key');
  }
  // preflight {ok:false} still HARD-GATES the ban send
  {
    const { p, snacks, goBtn } = makeRun({ pfResult: { ok: false, error: 'cooldown' } });
    const r = await p;
    ck('WS-B gate: {ok:false} preflight blocks the send (early return)', r === undefined);
    ck('WS-B gate: operator told why', snacks.some(s => s.type === 'error' && s.msg.includes('Ban blocked by preflight') && s.msg.includes('cooldown')));
    ck('WS-B gate: ban button re-enabled for retry', goBtn.disabled === false);
  }
  // preflight REJECTION stays non-fatal (worker outage must not block bans)
  {
    const { p, events } = makeRun({ pfReject: new Error('worker down') });
    const r = await p;
    ck('WS-B reject: non-fatal -- proceeds without audit id', r && r.banAuditId === null);
    ck('WS-B reject: failure logged', events.includes('logError'));
  }
}

// ---------------------------------------------------------------------------
// WS-C1: processDeathRow -- slice the real function, run batches.
// ---------------------------------------------------------------------------
const pdrStart = SRC.indexOf('async function processDeathRow(){');
ck('WS-C: processDeathRow found', pdrStart > 0);
{
  const pdrEnd = SRC.indexOf('const TAB_MEMORY = {};', pdrStart);
  ck('WS-C: processDeathRow slice end found', pdrEnd > pdrStart);
  const slice = SRC.slice(pdrStart, SRC.lastIndexOf('}', pdrEnd) + 1)
    // trim trailing comment banner between fn end and TAB_MEMORY
    .replace(/\/\/ ╔[\s\S]*$/, '');
  const pdrFnEnd = slice.lastIndexOf('\n  }');
  const fnSrc = slice.slice(0, pdrFnEnd + 4);
  ck('WS-C: slice captured (non-trivial)', fnSrc.length > 1500 && fnSrc.trimEnd().endsWith('}'));

  const makeHarness = ({ inmates, failFor = new Set() }) => {
    const progress = [];
    const snacks = [];
    let progressDone = 0;
    const fn = new Function(
      'getDeathRowReady', 'markDrInFlight', 'acquireDrLock', 'clearDrInFlight', 'releaseDrLock',
      'executeBan', 'markDeathRowExecuted', 'rosterSetStatus', 'verifyBan', 'markVerified',
      'logAction', 'rpcCall', 'snack', '_gamBatchProgress', '_gamBatchProgressDone',
      'IS_USERS_PAGE', 'refreshTriageConsole', 'document', 'setTimeout',
      fnSrc + '\n return processDeathRow;'
    )(
      () => inmates,
      () => true,
      async () => true,
      () => {},
      async () => {},
      async (u) => !failFor.has(u),
      () => {},
      () => {},
      async () => true,
      () => {},
      () => {},
      () => ({ catch: () => {} }),
      (msg, type, opts) => snacks.push({ msg, type, opts }),
      (txt) => progress.push(txt),
      () => { progressDone++; },
      false, () => {},
      { querySelector: () => null },
      (cb) => cb() // collapse the 2s stagger for the test
    );
    return { fn, progress, snacks, getProgressDone: () => progressDone };
  };
  const mk = (names) => names.map(n => ({ username: n, reason: 'r', executeAt: 1000, queuedAt: 0 }));

  // batch of 6 with 2 failures -> progress shown, sticky ERROR summary naming both
  {
    const { fn, progress, snacks, getProgressDone } = makeHarness({
      inmates: mk(['u1', 'u2', 'u3', 'u4', 'u5', 'u6']),
      failFor: new Set(['u2', 'u5'])
    });
    await fn();
    ck('WS-C >3 batch: progress element updated per inmate', progress.length === 6);
    ck('WS-C >3 batch: progress counts up ("Banning 1/6…")', progress[0].includes('1/6') && progress[5].includes('6/6'));
    ck('WS-C >3 batch: progress torn down on completion', getProgressDone() === 1);
    const summary = snacks[snacks.length - 1];
    ck('WS-C failures: summary is ERROR type (never success on failure)', summary.type === 'error');
    ck('WS-C failures: summary is persistent (sticky)', summary.opts && summary.opts.sticky === true);
    ck('WS-C failures: summary names the failed users', summary.msg.includes('Failed: u2, u5'));
    ck('WS-C failures: summary carries truthful counts', summary.msg.includes('4/6 banned'));
    ck('WS-C failures: NO success-type summary emitted',
      !snacks.some(s => s.type === 'success' && s.msg.startsWith('Batch')));
  }
  // batch of 5, zero failures -> sticky SUCCESS summary
  {
    const { fn, snacks } = makeHarness({ inmates: mk(['a', 'b', 'c', 'd', 'e']) });
    await fn();
    const summary = snacks[snacks.length - 1];
    ck('WS-C clean batch: success summary', summary.type === 'success' && summary.msg.includes('5/5 banned'));
    ck('WS-C clean batch: summary sticky', summary.opts && summary.opts.sticky === true);
  }
  // batch of 2 (<=3) -> NO progress element, NO batch summary (per-user snacks suffice)
  {
    const { fn, progress, snacks } = makeHarness({ inmates: mk(['x', 'y']) });
    await fn();
    ck('WS-C small batch: no progress element', progress.length === 0);
    ck('WS-C small batch: no batch summary', !snacks.some(s => s.msg.startsWith('Batch')));
  }
  // >10 failures -> roster caps at 10 with "+N more"
  {
    const names = Array.from({ length: 13 }, (_, i) => 'f' + (i + 1));
    const { fn, snacks } = makeHarness({ inmates: mk(names), failFor: new Set(names) });
    await fn();
    const summary = snacks[snacks.length - 1];
    ck('WS-C roster cap: names first 10 then "+3 more"',
      summary.msg.includes('f10') && !summary.msg.includes('f11') && summary.msg.includes('+3 more'));
  }
}

// ---------------------------------------------------------------------------
// WS-C2: snack sticky option + window export + GOD MODE roster (static).
// ---------------------------------------------------------------------------
{
  ck('snack: sticky option gates the auto-dismiss timer',
    /if \(!o\.sticky\) \{\s*\n\s*s\._gamDismissTimer = setTimeout/.test(SRC));
  ck('snack: exported to window for aux (_gmSnack was console-only before)',
    SRC.includes('try { window.snack = snack; } catch(_){}'));
  ck('_gamBatchProgress: single updating element (getElementById reuse)',
    /function _gamBatchProgress\(text\)\{[\s\S]{0,200}getElementById\('gam-batch-progress'\)/.test(SRC));
  ck('_gamBatchProgress: not part of the snack stack (no data-stack attr)',
    !/gam-batch-progress'[\s\S]{0,300}data-stack/.test(SRC));
  // aux GOD MODE bulk DR
  ck('aux bulk DR: failure NAMES collected', AUX.includes('failedNames.push(name)'));
  ck('aux bulk DR: roster capped at 10 with +N more',
    AUX.includes("failedNames.slice(0, 10).join(', ')") && AUX.includes("', +' + (failed - 10) + ' more'"));
  ck('aux bulk DR: any failure => err type (never ok on partial failure)',
    AUX.includes("failed > 0 ? 'err' : 'ok'"));
  ck('aux bulk DR: old bare-count tail gone', !AUX.includes("' (' + failed + ' failed)'"));
}

// ---------------------------------------------------------------------------
// HI-1 guard: the sweep changed CONFIRMATION SURFACES only. The regions that
// execute bans are untouched: executeBan/addToDeathRow/apiBan call sites
// still present and identical in count-critical spots; gamConfirm itself
// never calls any executor.
// ---------------------------------------------------------------------------
{
  const gcStart = SRC.indexOf('function gamConfirm(message, opts){');
  const gcSrc = SRC.slice(gcStart, SRC.indexOf('}', SRC.indexOf('return Promise.resolve(false);', gcStart)) + 1);
  ck('HI-1: gamConfirm calls NO executor', !/executeBan|addToDeathRow|apiBan|executeUnban|rpcCall/.test(gcSrc));
  ck('HI-1: DR stagger timing untouched (2000ms)', SRC.includes('await new Promise(r=>setTimeout(r, 2000));'));
  ck('HI-1: processDeathRow verify-after-ban intact', /markDeathRowExecuted\(inmate\.username\);[\s\S]{0,600}verifyBan\(inmate\.username\)/.test(SRC));
  ck('HI-1: modBanPreflight still gates via ok check', SRC.includes('if (!pf || !pf.ok) {'));
  ck('HI-1: withUndo(apiBan) ban send untouched', SRC.includes('return apiBan(_banTarget, _banDays, _banReason);'));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
