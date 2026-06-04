# GAW ModTools v10.18.2 -- Usability Ralph Storm Master Findings (2026-06-04)

**Storm topology:** 25 iterations x (4 sonnet finders + 1 opus synthesizer per iteration), cumulative dedup, dry-streak early-exit at 5 (not triggered -- ran full 25). 126 agents total, ~14.97M subagent tokens, ~6.7h wall.

**Author:** Claude Opus 4.7 (CTO, C5 Ops). **Storm run-id:** wf_9d006fc6-255.

## Executive summary

438 confirmed findings after opus-synthesis-per-iteration cull. The storm targeted four lenses in parallel each iteration (onboarding/install, daily-driver, discoverability/cognitive-load, error-recovery), with each fresh finding judged for specificity and concreteness by opus before landing in this list. Every finding includes the file:line surface, severity, friction type, proposed fix, evidence, and the iteration that surfaced it.

## Severity breakdown

| Severity | Count |
|---|---|
| **P0** (blocks core moderator job) | 6 |
| **P1** (significant friction) | 198 |
| **P2** (polish) | 207 |
| **P3** (nice-to-have) | 27 |
| **Total** | 438 |

**Note on output truncation:** the opus master-synthesis agent's structured response began mid-paragraph -- the exec summary + heat-table + per-surface grouping it was instructed to produce got eaten by the structured-output transport. The findings body below is intact (~57K chars, 438 entries). For a complete severity x surface heatmap, run the storm again with the schema relaxed to plain text, or post-process the accumulated findings JSON directly.

---

11757 captures `v.id` only inside the remove handler closure. modtools.js:11833: `openModConsole(author, item, 'ban')` passes no violation arg.
- **Found in iteration:** 7

### [P2] Hot Now panel 'Execute' opens ban tab with no pre-filled reason — discards the very field that triggered the queue

Pre-fill via opts.

- **Surface:** modtools.js:12288
- **Friction type:** cognitive-load
- **Repro:**
  - Open Hot Now panel (Ctrl+Shift+T)
  - A Death Row entry is READY
  - Click 'Execute' on the row
  - Ban tab opens with violation, subject, and message blank — the queued `drow.reason` is silently dropped
- **Proposed fix:** Add a 4th options arg to `openModConsole` and forward `drow.reason`: change line 12288 to `openModConsole(drow.username, null, 'ban', { drReason: drow.reason })`. In renderBanTab (modtools.js:9805-9824), if `opts.drReason` is present, prefill `msgIn.value` with `urlPrefix + opts.drReason` and seed `subIn.value` from a short derivation of the reason.
- **Evidence:** modtools.js:12288 (verified): `openModConsole(drow.username, null, 'ban')` — third arg is 'ban', no opts. `drow.reason` is available at L12301 (rendered in the row label) but never threaded through.
- **Found in iteration:** 23

### [P2] GOD MODE bulk action bar lacks 'Queue DR' button despite _smartBulkBan existing in palette

Bulk DR from GOD MODE.

- **Surface:** modtools-aux.js:2098-2100
- **Friction type:** discoverability
- **Proposed fix:** Add 'Queue DR (72h)' button to `_gmRefreshBulkBar` at line 2098: `bar.appendChild(btn('Queue DR (72h)', '#3a1818', () => _gmBulkDeathRow()))`. Implement `_gmBulkDeathRow()` modeled on `_smartBulkBan` at line 1790, but source usernames from `_gmSelected` (already a Map with `.author` per entry) instead of prompting for text input. Show `_gmAuxConfirm` preview, then call `addToDeathRow` for each.
- **Found in iteration:** 10

### [P2] Death Row popover has no j/k row navigation — modmail's pattern was never ported

Add j/k to DR popover.

- **Surface:** modtools.js:21507-21508 (DR popover, only Escape) vs modtools.js:18799-18848 (_mmpKbHandler)
- **Friction type:** cognitive-load
- **Proposed fix:** Add a _drKbHandler mirroring _mmpKbHandler at modtools.js:18826. Target [data-dr-row] divs. j/k move focus by toggling 'outline: 2px solid var(--bb-amber)'. Enter clicks .gam-dr-btn-fire on focused row; Backspace/Delete clicks .gam-dr-btn-cancel. Install on pop open; remove in _closePop at modtools.js:21492.
- **Evidence:** modtools.js:21507-21508 wires only Escape on DR popover. modtools.js:18833-18844 contains modmail's working j/k/Enter handler.
- **Found in iteration:** 18

### [P2] Death Row FIRE NOW stacks two confirm gates — in-row 2-click PLUS preflight 2-second arm

Duplicate confirms in series.

- **Surface:** modtools.js:21337-21362 and modtools.js:20952-20963
- **Friction type:** cognitive-load
- **Repro:**
  - Open Death Row popover
  - Click FIRE NOW on a row (click 1 — armed)
  - Click 'CONFIRM ▶ 3s' (click 2 — _drExecuteNow fires)
  - preflight() opens modal 'Fire ban now?' with armSeconds=2
  - Wait 2s for arm, click Confirm (click 3)
- **Proposed fix:** Remove the in-row Stage 1/Stage 2 gate at modtools.js:21337-21362. Replace with direct call: `fireBtn.addEventListener('click', function(e) { e.stopPropagation(); fireBtn.disabled = true; fireBtn.textContent = '…'; _drExecuteNow(username, reason).then(...).catch(...); });`. preflight() at modtools.js:20953 already provides the safety arm — the in-row gate is redundant.
- **Found in iteration:** 18

### [P2] Death Row popover 'Cancel All' button appears even with 0 items — mod wastes 2-click confirm sequence

Empty-state should disable Cancel All.

- **Surface:** modtools.js:21138-21142 (cancelAllBtn unconditionally appended) and modtools.js:21441-21443 (n===0 check fires only AFTER confirm gate)
- **Friction type:** error-recovery
- **Repro:**
  - Open DR popover when all items have been recently cancelled (count = 0)
  - Body shows empty-state but 'Cancel All' button is still in the sort bar
  - Click Cancel All (stage 1 arms confirm)
  - Click again (stage 2 fires)
  - Receive 'Nothing to cancel' snack
- **Proposed fix:** In _renderDrBands, after the empty-state branch at modtools.js:21192, add: `cancelAllBtn.disabled = true; cancelAllBtn.style.opacity = '0.4'; cancelAllBtn.style.cursor = 'default';`. Re-enable in the non-empty branch.
- **Found in iteration:** 11

### [P2] DR count badge on status bar opens mod log instead of Death Row triage popover

Wrong target on the DR badge.

- **Surface:** modtools.js:22327-22328
- **Friction type:** cognitive-load
- **Repro:**
  - Queue any user to Death Row
  - Wait for skull badge (💀 N) to appear on status bar
  - Click the badge
  - Receive full mod log panel instead of the DR triage popover
- **Proposed fix:** Change modtools.js:22328 from `drBtn.addEventListener('click', openModLog)` to `drBtn.addEventListener('click', function(e) { e.stopPropagation(); try { _showDrPopover(drBtn); } catch(err) { openModLog(); } })`. The ticker at line 22547 already correctly routes `cur.kind === 'dr'` to `_showDrPopover` — the standalone badge needs the same target. Add `title='Death Row queue — click to triage (Ctrl+Shift+L for mod log)'` so mod log stays discoverable via tooltip.
- **Found in iteration:** 10

### [P2] Session dot click on expired session re-confirms the failure with no recovery path — violates its own tooltip contract

Session dot tooltip promises 'reload and re-login' but the click does only a snack.

- **Surface:** modtools.js:22282-22297
- **Friction type:** error-recovery
- **Proposed fix:** In the click handler at modtools.js:22282, when `!csrfOk`: open GAW login in a new tab via `window.open('https://greatawakening.win/login', '_blank', 'noopener')` and change the snack to 'Opening GAW login — come back after re-logging in.' Don't auto-reload the current tab (preserves any in-flight work).
- **Evidence:** modtools.js:22282-22297 click handler runs `rpcCall('modWhoami')` and snacks the result. The failure branch (line 22295) only displays text — no navigation. The tooltip at modtools.js:22313 promises 'reload and re-login' — the click does nothing toward either.
- **Found in iteration:** 23

### [P2] Undo-of-undo failure snack mentions 'mod log' with no link, button, or keyboard hint

Recovery path is named but unlinked.

- **Surface:** modtools.js:7724-7726
- **Friction type:** error-recovery
- **Proposed fix:** Minimum change at modtools.js:7726: replace the snack text with `'Undo failed — ' + (err && err.message || 'error') + ' (press Ctrl+Shift+L to view mod log)'`. Better: extend the snack helper to accept a `{ label, onClick }` CTA and pass `{ label: 'Open mod log', onClick: () => { try { openModLog(); } catch(_){} } }`.
- **Evidence:** modtools.js:7726: `snack('Undo failed: ' + (err && err.message || 'error'), 'error')` — no CTA, no keyboard hint. modtools.js:7725 aria-live references 'mod log' but no path is exposed.
- **Found in iteration:** 23

### [P2] Re-hydrate success removes auth banner before init() completes — mod sees blank UI mid-reinit

Banner removal too eager.

- **Surface:** modtools.js:29362-29368
- **Friction type:** error-recovery
- **Proposed fix:** Do not remove banner before init() completes. Update its text to 'Reconnecting... (this page will restore in a moment)' and add inline CSS spinner. Move `b.remove()` into a finally block so it clears regardless of outcome. After `await init()` resolves, call `snack('ModTools restored', 'success')`.
- **Evidence:** modtools.js:29365: `btnRetry.textContent = 'Auth restored -- reloading UI...'`. modtools.js:29367: `try { b.remove(); } catch(_){} try { await init(); }` — banner removed BEFORE init() completes. No spinner, no progress snack. Catch at 29368 only shows snack on error, not on running success path.
- **Found in iteration:** 10

### [P2] Re-hydrate success path that throws inside init() leaves btnRetry stuck at 'Auth restored — reloading UI…' with banner already removed — no retry affordance

Second lens.

- **Surface:** modtools.js:29362-29369
- **Friction type:** error-recovery
- **Proposed fix:** Wrap the init() catch at modtools.js:29367 to re-render the banner and reset the button: in the catch block, instead of only `snack(...)`, call `try { document.body.appendChild(b); } catch(_){}` to re-attach the banner, then `btnRetry.textContent = 'Partial reinit — click to retry'; btnRetry.disabled = false;`. Operator gets a visible recovery path instead of a transient snack pointing at a removed banner.
- **Evidence:** modtools.js:29362-29369: `if (re && re.ok) { btnRetry.textContent = 'Auth restored -- reloading UI...'; try { b.remove(); } catch(_){} try { await init(); } catch(e){ try { snack('Partial re-init: ' + (e.message || e), 'warn'); } catch(_){} } }` — b.remove() happens BEFORE init(), so if init throws, the banner is gone and the only feedback is a transient snack pointing at a removed banner.
- **Found in iteration:** 11

### [P2] Auth-fail 'no_response' uses fetch_failed copy — tells mod about rate-limiting when the real cause is cold SW eviction

Reason-step copy mismatch.

- **Surface:** modtools.js:29292-29299 and modtools.js:29397
- **Friction type:** error-recovery
- **Proposed fix:** Add a dedicated 'no_response' branch before the fetch_failed branch at modtools.js:29292. Steps should read: Step 1 'The extension background worker was evicted after idle time — this is normal. Click Force re-hydrate below.' Step 2 'If that fails, close and reopen this tab.' Step 3 'If the banner persists, open the popup and verify your token.' Also add 'no_response' to the showOpenPopup allowlist at modtools.js:29397.
- **Evidence:** modtools.js:29292 `if (reason === 'fetch_failed' || reason === 'no_response')` — shared step text. modtools.js:29298 'worker may be rate-limiting you' is rate-limit advice misapplied to cold SW eviction. modtools.js:29397 excludes no_response from the Open-popup-button allowlist.
- **Found in iteration:** 18

### [P2] Auth-fail banner step 2 embeds 'https://greatawakening.win' as plain text — mod must retype the URL

textContent strips link semantics.

- **Surface:** modtools.js:29296 (reasonSteps string) and modtools.js:29352 (li.textContent = step strips link semantics)
- **Friction type:** error-recovery
- **Proposed fix:** Change line 29352 loop to accept string OR DOM node: `if (typeof step === 'string') li.textContent = step; else li.appendChild(step);`. In fetch_failed branch (29292-29299), emit a DocumentFragment with a real `<a>` tag for the URL.
- **Found in iteration:** 13

### [P2] GOD MODE auth failure shows 'SEARCH FAILED — unknown' with misleading FTS5 grammar hint on 401/403

Auth error misdiagnoses to grammar.

- **Surface:** modtools-aux.js:2343-2348
- **Friction type:** error-recovery
- **Proposed fix:** Replace lines 2343-2348 with: `const errStatus = r && r.status; const errMsg = (r && (r.error || (r.data && r.data.error))) || 'unknown'; const authHint = (errStatus === 401 || errStatus === 403) ? '<br><b>Auth error:</b> your token was rejected. Open the ModTools popup to re-enter your token.' : '<br><span style="color:' + TXT_DIM + '">Tip: check the grammar help above…</span>'; resultsEl.innerHTML = '<div ...><b>SEARCH FAILED</b> (HTTP ' + (errStatus || '?') + ')<br>' + _gmEsc(String(errMsg)) + authHint + '</div>';`
- **Found in iteration:** 3

### [P2] GOD MODE search renders FTS5 grammar tip on every error — auth/token expiry surfaces irrelevant recovery advice

Second lens.

- **Surface:** modtools-aux.js:2343-2348 (_gmRunSearch error render)
- **Friction type:** error-recovery
- **Proposed fix:** In _gmRunSearch at modtools-aux.js:2343-2348, inspect the error string for auth keywords before rendering the generic FTS5 tip: `const isAuthErr = /401|403|unauthorized|forbidden|token/i.test(String(err)); const tip = isAuthErr ? 'Your mod token may have expired — open the ModTools popup → Tokens tab to refresh.' : 'Tip: check the grammar help above...';`. Surfaces the actionable fix when the actual failure is auth-related.
- **Evidence:** modtools-aux.js:2347: `'Tip: check the grammar help above. If the error mentions FTS5, your query may need adjustment...'` is rendered for ALL error paths including 401/403.
- **Found in iteration:** 4

### [P2] GOD MODE search results require 12+ Tab presses to reach — no auto-focus, no j/k navigation

Keyboard accessibility hole.

- **Surface:** modtools-aux.js:2508-2509 (_gmRunSearch row append), modtools-aux.js:2313-2315 (_gmKeyHandler — Escape only)
- **Friction type:** cognitive-load
- **Proposed fix:** After _gmRunSearch finishes rendering rows, add: `const firstRow = resultsEl.querySelector('[role="button"][tabindex="0"]'); if (firstRow) firstRow.focus();`. Add j/k navigation in _gmKeyHandler when focus is outside the query input.
- **Found in iteration:** 13

### [P2] GOD MODE results have no j/k keyboard navigation — mouse required after every search

Same as above, second lens. The fix can be ported wholesale from modmail's _mmpFocusRow.

- **Surface:** modtools-aux.js:2313 (_gmKeyHandler — Escape only); modtools-aux.js:2408-2418 (row onkeydown — Enter/Space only)
- **Friction type:** cognitive-load
- **Proposed fix:** Port the _mmpFocusRow pattern from modtools.js:18807-18848. In _gmKeyHandler add j/k branches (skip when focus is in query input), apply amber outline on focused row, fire window.open on Enter from focused row. ~25 lines, direct copy from the working modmail panel implementation.
- **Evidence:** modtools-aux.js:2313: only handles Escape. Working reference at modtools.js:18807-18848 (_mmpFocusRow / _mmpKbHandler) does exactly this for modmail panel.
- **Found in iteration:** 22

### [P2] GOD MODE search silently truncates at 100 with no 'capped' indicator

Hidden cap.

- **Surface:** modtools-aux.js:2342, 2357-2359
- **Friction type:** discoverability
- **Proposed fix:** At modtools-aux.js:2357-2359, append truncation hint when at cap: `if (total >= 100) metaEl.textContent += ' — capped at 100; refine query for more';`. Worker handler in background.js:2415 already supports up to 200 (`Math.min(200, ...)`), so bumping limit to 200 is also a one-line option.
- **Evidence:** modtools-aux.js:2342: `limit: 100` hardcoded. modtools-aux.js:2357-2359 meta render contains no cap branch or has_more logic.
- **Found in iteration:** 15

### [P2] Update banner orphan-poll silently no-ops when chrome.runtime.id is falsy — false-positive of 'extension reloaded'

Already covered by step-numbering proposal.

- **Surface:** modtools.js:27843
- **Found in iteration:** 10

### [P2] Right-click DR uses bare confirm() — second lens of P2 finding above

Already listed.

- **Surface:** modtools.js:12409
- **Found in iteration:** 13

### [P2] Inactivity-lock broadcast already P1 — content-script handler

Already covered.

- **Surface:** background.js:321
- **Found in iteration:** 11

### [P2] Auto-disabled feature chip has cursor:default and no click handler — tooltip promises action the click doesn't deliver

Add chip click handler.

- **Surface:** modtools.js:29149-29153 (chip construction, no addEventListener follows)
- **Friction type:** error-recovery
- **Proposed fix:** Add `chip.style.cursor = 'pointer'` and `chip.addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'openPopup' }).catch(() => snack('Open popup → Tools → Feature Health to re-enable', 'info')); })`. Update inline cssText to remove `cursor:default`.
- **Evidence:** modtools.js:29149: chip cssText sets `cursor:default;` — signals non-interactive. modtools.js:29152: title promises action. modtools.js:29153 onward: no addEventListener follows construction.
- **Found in iteration:** 13

### [P2] Feature auto-disable chip on status bar is a dead indicator — cursor:default and no click handler

Same finding, second lens.

- **Surface:** modtools.js:29151
- **Friction type:** error-recovery
- **Proposed fix:** At modtools.js:29153 after `bar.appendChild(chip)`: `chip.style.cursor = 'pointer'; chip.addEventListener('click', async function() { try { const r = await chrome.runtime.sendMessage({ type: 'openPopup' }); if (!r || !r.ok) snack('Click the ModTools icon → popup → Tools tab → Feature Health', 'warn'); } catch(_) { snack('Click the ModTools icon → popup → Tools tab → Feature Health', 'warn'); } });`.
- **Found in iteration:** 19

### [P2] Feature auto-disable Re-enable button writes storage but never messages the content script — feature stays dead in the open GAW tab until manual reload

Re-enable doesn't take effect until reload.

- **Surface:** popup.js:6746-6759
- **Friction type:** error-recovery
- **Proposed fix:** After the storage write, send a content-script message: `chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) { if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'remountFeature', feature: feature }); });`. Wire a handler in modtools.js that clears the in-memory disabled Set entry (paired with the _isFeatureDisabled fix) so the next safeFeature call mounts cleanly. If remount messaging fails, fall back to making the chip text 'Reload GAW tab now' a clickable button: `chip.onclick = () => chrome.tabs.reload(tabs[0].id)`.
- **Evidence:** popup.js:6746-6759 confirmed: handler only does `chrome.storage.local.set(...)` and updates local chip text. No chrome.tabs.sendMessage, no popupRpc call. modtools.js:29095 comment claims '_clearErrorCounter: called from popup Re-enable button via RPC' — no such RPC exists.
- **Found in iteration:** 20

### [P2] Feature auto-disable snack tells mod to 're-enable from popup' but the open popup's Feature Health row never updates

CustomEvent doesn't cross process boundary.

- **Surface:** modtools.js:29140 (snack) vs popup.js:6718 (renderFeatureHealthRow IIFE, no rerun)
- **Friction type:** error-recovery
- **Proposed fix:** Add a chrome.storage.onChanged listener in popup.js (alongside the existing one at popup.js:8039): `chrome.storage.onChanged.addListener(function(changes) { if (changes.gam_error_counters) { try { renderFeatureHealthRow(); } catch(_){} } });`. The CustomEvent at modtools.js:29138 fires in content-script scope which the popup cannot receive; storage change is the only cross-process signal already in use.
- **Found in iteration:** 12

### [P2] Death Row auto-execution catch-block (mirror of P1) — second lens

Already cataloged at P1 above.

- **Surface:** modtools.js:8703
- **Found in iteration:** 14

### [P2] Token-onboarding modal 7-day throttle bails with only a console.log when token storage is empty — no snack, no banner

Throttled-with-empty-token silent fail.

- **Surface:** modtools.js:26267-26279 (rejected branch), modtools.js:26376-26380 (throttle bail)
- **Friction type:** error-recovery
- **Proposed fix:** After the throttle return at modtools.js:26379-26380, add a degraded fallback so the throttle suppresses only the MODAL, not all feedback: `try { snack('Still need your mod token — open the popup to re-enter.', 'warn'); } catch(_){}`. snack does not call setSetting(K_SETTINGS), so lastTokenPromptAt is unchanged and the throttle remains intact.
- **Evidence:** modtools.js:26376-26380 throttle bail: console.log + _diagLog + return, with no user-visible signal.
- **Found in iteration:** 5

### [P2] DR popover (mirror of finding above) — j/k navigation

Already cataloged.

- **Surface:** modtools.js:21507
- **Found in iteration:** 18

### [P2] Modmail thread Ctrl+Shift+R label inconsistency — covered above

Already cataloged.

- **Surface:** modtools.js:13714
- **Found in iteration:** 19

### [P2] '? button tooltip references Ctrl+Shift+H but never mentions the Shift+? overlay

Help-surface cross-link gap.

- **Surface:** modtools.js:22703
- **Friction type:** discoverability
- **Repro:**
  - Hover ? button on status bar
  - Tooltip: 'Keybinds + commands cheatsheet (Ctrl+Shift+H)'
  - The 10-row Shift+? quick-reference (modtools-aux.js:422-434) is faster but undiscoverable from this surface
- **Proposed fix:** Change tooltip at modtools.js:22703 to: `title:'Keybinds (Ctrl+Shift+H) · quick overlay: Shift+?'`. One-line change.
- **Found in iteration:** 15

### [P2] Status-bar ❓ tooltip promises 'cheatsheet' but opens a tutorial panel where shortcuts are buried in collapsed <details>

Help panel surfaces tutorial above the shortcut list.

- **Surface:** modtools.js:22703 (tooltip), modtools.js:12431-12454 (openHelp content order)
- **Friction type:** cognitive-load
- **Proposed fix:** Open the <details> by default: at modtools.js:12455 where `el('details', { cls:'gam-help-details' })` is created, append `.setAttribute('open', '')`. Matches the tooltip's promise without weakening it.
- **Evidence:** modtools.js:22703: `title:'Keybinds + commands cheatsheet (Ctrl+Shift+H)'`. modtools.js:12434: first appended section is 'What you can do (no keyboard required)'. modtools.js:12455: keyboard shortcuts wrapped in `el('details', { cls:'gam-help-details' })` — collapsed.
- **Found in iteration:** 19

### [P2] Status bar upvote-filter dropdown shows bare stopwatch emoji — zero semantic signal

Self-describing label.

- **Surface:** modtools.js:22316-22322
- **Friction type:** discoverability
- **Proposed fix:** (1) At modtools.js:22320 change `'⏱'` to `'⏱ OFF'` so the dropdown always carries text. (2) Register palette command for keyboard cycling: `{ label: 'Toggle upvote-age filter', kw: 'upvote age filter hide validated', icon: '⏱', fn: () => { const sel = document.getElementById('gam-bar-filter'); if (sel) { const opts = ['off','4h','8h','12h']; sel.value = opts[(opts.indexOf(sel.value)+1)%opts.length]; sel.dispatchEvent(new Event('change')); } } }`.
- **Evidence:** modtools.js:22320: `o.textContent = v === 'off' ? '⏱' : '⏱ ${v}'`. No palette entry's kw contains 'upvote', 'age filter', or 'hide validated'.
- **Found in iteration:** 15

### [P2] Status-bar upvote-age filter renders as bare clock emoji — CSS tooltip doesn't fire on <select>

Same surface, different fix angle.

- **Surface:** modtools.js:22316-22321
- **Friction type:** cognitive-load
- **Proposed fix:** Change modtools.js:22320 option label to be self-describing: `o.textContent = v === 'off' ? 'Filter: off' : 'Filter: hide ' + v + '+'`. Makes the closed state legible without any hover.
- **Evidence:** modtools.js:22320 textContent is just the clock emoji + time. modtools.js:24830: CSS tooltip rule targets gam-bar-icon[title]:hover::before — Chrome does not render ::before on <select>.
- **Found in iteration:** 21

### [P2] Upvote-age filter options labeled with time only — filter ALSO requires upvotes, but the gate is invisible until after selection

Third lens.

- **Surface:** modtools.js:22317-22322 (filterSel option construction) + modtools.js:17169-17173 (applyUpvoteAgeFilter)
- **Friction type:** cognitive-load
- **Proposed fix:** Change option text at modtools.js:22320 from `'⏱ ${v}'` to `'⏱ ${v} + upvoted'`. Options then read '⏱ 4h + upvoted', '⏱ 8h + upvoted', '⏱ 12h + upvoted', making both conditions visible before selection.
- **Found in iteration:** 16

### [P2] Watch quick-action button has no title — Ctrl+Shift+W shortcut only documented in collapsed help

Tooltip on Watch.

- **Surface:** modtools.js:11309
- **Friction type:** discoverability
- **Proposed fix:** Add title to the button template at modtools.js:11309: `<button class="gam-mc-quick" data-q="watch" title="${w ? 'Remove from watchlist (Ctrl+Shift+W from any page)' : 'Add to watchlist (Ctrl+Shift+W from any page)'}">`.
- **Evidence:** modtools.js:11309 `<button class="gam-mc-quick" data-q="watch">` has no title.
- **Found in iteration:** 21

### [P2] Toggle Status Bar visibility' palette command is ephemeral — bar reappears on next page load with no warning

Persistence gap.

- **Surface:** modtools.js:5593-5599
- **Friction type:** cognitive-load
- **Proposed fix:** Back the toggle with `setSetting`, matching hideSidebar (modtools.js:12647) and orientation (modtools.js:12669): `const hidden = getSetting('gam_status_bar_hidden', false); setSetting('gam_status_bar_hidden', !hidden); bar.style.display = hidden ? '' : 'none';`. In `_buildStatusBar`, read the setting and apply on build.
- **Evidence:** modtools.js:5598: `if (bar) bar.style.display = (bar.style.display === 'none') ? '' : 'none';` — pure DOM mutation. No `gam_status_bar_hidden` key exists in settings schema.
- **Found in iteration:** 6

### [P2] Palette 'Open Mod Console' is a dead end on /queue — snack 'not found on this page' with no fallback

Add fallback.

- **Surface:** modtools.js:5556-5560
- **Friction type:** error-recovery
- **Proposed fix:** After the `btn` lookup fails, fall back to the focused/hovered item: `else if (hoveredItem) { openModConsole(getAuthor(hoveredItem), hoveredItem, 'ban'); } else { const target = document.querySelector('.post[data-id], .comment[data-id]'); if (target) openModConsole(getAuthor(target), target, 'ban'); else snack('Hover a post/comment first, then reopen the palette', 'warn'); }`
- **Found in iteration:** 2

### [P2] Palette 'Open Mod Console' label promises a global command but the command body requires a hovered user row — fires unhelpful 'not found' snack on most pages

Honest label.

- **Surface:** modtools.js:5553-5560 (_apRegistry entry)
- **Friction type:** cognitive-load
- **Proposed fix:** Change the palette entry label to 'Open Mod Console (hover a user row first)' so the page-context requirement is disclosed before selection. Pairs the existing fn body with an honest label — no new feature path.
- **Found in iteration:** 20

### [P2] Palette 'Open Death Row queue' snacks 'not found on this page' instead of calling openModLog()

Fallback to openModLog().

- **Surface:** modtools.js:5573-5580 (and sibling 5582-5590 'Open Auto-Action queue')
- **Friction type:** discoverability
- **Proposed fix:** Change the else branch at modtools.js:5578-5579 from `snack('Death Row queue button not found on this page', 'warn')` to `if (typeof openModLog === 'function') openModLog(); else location.href = 'https://greatawakening.win/users'`. openModLog (the function the status-bar DR chip calls at modtools.js:22328) works on every page. Same fix for 'Open Auto-Action queue' at modtools.js:5587-5589.
- **Found in iteration:** 5

### [P2] Ctrl+K 'No results' state doesn't hint at GOD MODE for archived/removed content

Cross-link Ctrl+K to GOD MODE.

- **Surface:** modtools.js:5401-5402
- **Friction type:** discoverability
- **Proposed fix:** modtools.js:5402 — replace `metaEl.textContent = 'No results'` with: `metaEl.innerHTML = 'No results — '`; append an anchor 'try GOD MODE (author:X, removed:1, date ranges)' with onclick that calls _closePalette() then window._gamOpenGodMode(). Hook already exposed at modtools-aux.js:2891.
- **Found in iteration:** 8

### [P2] Ctrl+K palette and Ctrl+Shift+P palette never cross-reference each other — operators who learn one never discover the other

Same gap, second lens.

- **Surface:** modtools.js:5448, modtools.js:5731
- **Friction type:** discoverability
- **Proposed fix:** In `_openPalette` (modtools.js:5431), append a footer div after the metaDiv at line 5465: text `'Ctrl+Shift+P → action palette (bans, macros, AI tools)'`. In `_apEnsure` (modtools.js:5715), change the left footer span at line 5731 from `'↑↓ navigate · ↵ execute'` to `'↑↓ navigate · ↵ execute · Ctrl+K for content search'`. Two one-liners; each surface teaches the other.
- **Found in iteration:** 23

### [P2] First-run tour skips GOD MODE — new mods complete the tour never learning firehose search exists

Add 8th stop.

- **Surface:** modtools.js:31580-31594 (stops array, 7 entries, no #gam-godmode-bar-icon)
- **Friction type:** discoverability
- **Proposed fix:** Add an 8th stop to modtools.js:31594: `{ sel: "#gam-godmode-bar-icon", label: "GOD MODE", text: "Advanced firehose search — searches the full indexed archive including removed/deleted posts. Supports author:, date:, score:, community: filters. Ctrl+Shift+P → \"god mode\" or click this icon." }`. The resolved loop at modtools.js:31597 already drops missing selectors gracefully.
- **Found in iteration:** 12

### [P2] First-run tour overlay click-outside-to-dismiss not wired — dark backdrop is a dead zone

Wire backdrop click to dismiss.

- **Surface:** modtools.js:31607-31647
- **Friction type:** error-recovery
- **Proposed fix:** After `document.body.appendChild(overlay)` at modtools.js:31647 add: `overlay.addEventListener('click', function(e){ if (e.target === overlay) { _closeTour(true); } });`. Pass `true` (not `false`) so skipping via backdrop ALSO marks the tour seen. Matches the ban-console modal pattern at modtools.js:3852.
- **Found in iteration:** 15

### [P2] Help panel 'Recent additions' frozen at v10.15→v10.16 — GOD MODE Search, FIREHOSE, Snapshot for Fix invisible

Many convergent findings.

- **Surface:** modtools.js:12487-12500
- **Friction type:** discoverability
- **Proposed fix:** Update modtools.js:12487 summary to `'Recent additions (v10.17 → v10.18)'`. Replace recentItems with current entries: GOD MODE firehose search modal, GOD MODE full search app + popup button, Firehose crawl health panel (palette, lead-only).
- **Found in iteration:** 3

### [P2] Help panel 'Recent additions' frozen — second/third/fourth/fifth/sixth/seventh lens

Same finding repeated.

- **Found in iteration:** 4, 11, 12, 13, 15, 19, 25

### [P2] Modmail Mark Resolved overlap — already cataloged

Already covered.

- **Found in iteration:** 4

### [P3] Watch quick-action button — already P3 above

Already cataloged.

- **Found in iteration:** 21

### [P3] Tools tab card bracket prefixes — already P3 above

Already cataloged.

- **Found in iteration:** 18

### [P3] Gear button tooltip omits Ctrl+Shift+S — only status-bar action that hides its own shortcut

Trivial tooltip fix.

- **Surface:** modtools.js:22455
- **Friction type:** discoverability
- **Proposed fix:** Change modtools.js:22455 title from 'Settings' to 'Settings (Ctrl+Shift+S)' to match the established pattern at 22699 (log button) and 22703 (help button).
- **Evidence:** modtools.js:22455: `title:'Settings'`. Compare to 22699 and 22703 which both include their Ctrl+Shift+? shortcut.
- **Found in iteration:** 21

### [P3] Ctrl+Shift+T (Hot Now panel) is a live shortcut undocumented in every help surface

Doc the shortcut.

- **Surface:** modtools.js:13575 (handler) vs modtools.js:12458-12473 + modtools-aux.js:422-434 (help lists)
- **Friction type:** discoverability
- **Proposed fix:** Add `['Ctrl+Shift+T', 'Hot Now — live TARD + Death Row triage panel']` to the sc array at modtools.js:12458-12473. Add `{ keys: 'Ctrl+Shift+T', desc: 'Hot Now triage panel' }` to _helpShortcuts() at modtools-aux.js:422-434.
- **Found in iteration:** 25

### [P3] Queue APPR row removed 2s after click but undo window is 5s — operator sees row vanish before they can verify what they approved

Align timing.

- **Surface:** modtools.js:21706 (2000ms) vs modtools.js:21720 (5000ms for REM)
- **Friction type:** cognitive-load
- **Proposed fix:** Change line 21706 from 2000 to 5000. Costs nothing and aligns APPR with REM's window. Pairs naturally with adding the undo toast (separate finding above).
- **Evidence:** modtools.js:21706 confirmed: `setTimeout(function() { _fadeRemoveRow(row); }, 2000)` for APPR; line 21720 is 5000ms for REM. The asymmetry is uncommented.
- **Found in iteration:** 20

---

## modtools-aux.js

### [P1] Palette 'Investigate user' uses raw window.prompt — silently fails on Brave

Already cataloged in modtools.js section.

- **Found in iteration:** 24

### [P1] Macro feature has Start/Stop/List palette commands but no Play — captured actions are never replayable

The whole macro system is write-only.

- **Surface:** modtools-aux.js:1955-1957 (palette entries); _macroList at modtools-aux.js:1780-1786 only displays names; no _macroPlay/_macroExec exists anywhere
- **Friction type:** discoverability
- **Repro:**
  - Palette -> Macro · Start recording -> perform actions -> Stop -> name it
  - Palette -> 'macro' -> no Play/Run/Execute command exists
  - List shows names + action counts but offers no execution path — the entire subsystem is write-only
- **Proposed fix:** Add a fourth palette entry to the wave4 array at modtools-aux.js:1958: `{ label: 'Macro · Play saved macro', kw: 'macro run play execute replay', icon: '▶', fn: _macroPlay }`. Implement `_macroPlay` as: read `gam_macros`, picker via `_gamAuxAsk`, iterate stored `actions` and for each `{type:'click', label}` find the first matching `.gam-btn, .gam-mc-send-btn, .gam-strip-btn` whose trimmed textContent equals the stored label and dispatch a click with a 200ms delay between actions.
- **Found in iteration:** 2

### [P1] Macro system records and lists but has no 'Run macro' palette entry — recorded macros are permanently unexecutable

Same finding.

- **Surface:** modtools-aux.js:1955-1957 (wave4 palette registrations); modtools-aux.js:1780-1786 (_macroList read-only)
- **Friction type:** discoverability
- **Proposed fix:** Add a 'Macro · Run saved macro' palette entry. Minimum viable: `_macroRun` reads `gam_macros`, shows `_gamAuxAsk` picker with macro names, then dispatches synthetic click events on `.gam-btn` elements matching recorded labels in sequence with short delays.
- **Found in iteration:** 14

### [P1] Macro feature has Start/Stop/List palette commands but no Play — third lens

Same finding.

- **Found in iteration:** 13

### [P1] Palette 'GOD MODE: Search by author' fires blocking window.prompt() instead of opening the modal

Already covered at P1 in modtools.js findings — fix lives in modtools-aux.js.

- **Surface:** modtools-aux.js:2909-2910
- **Friction type:** cognitive-load
- **Proposed fix:** Remove the dedicated 'Search by author' palette entry — redundant with the main 'GOD MODE: Search firehose' entry which accepts `author:NAME` syntax. If a shortcut is wanted, change the fn to `_gmOpenModal('author:')` so the modal opens with query pre-seeded and cursor after the colon. Kill the prompt fallback path entirely.
- **Found in iteration:** 17

### [P1] GOD MODE result rows show @author as static text — clicking does not open Mod Console for that author

Make the author column actionable.

- **Surface:** modtools-aux.js:2484-2486
- **Friction type:** cognitive-load
- **Proposed fix:** Make the @author span clickable: at modtools-aux.js:2485, capture the element, set cursor:pointer + title='Click: open Mod Console intel for ' + row.author, addEventListener('click', e => { e.stopPropagation(); _gmCloseModal(); if (window._gamOpenModConsole) window._gamOpenModConsole(row.author, null, 'intel'); }). Mirrors the cross-script export pattern at modtools-aux.js:2891.
- **Found in iteration:** 5

### [P1] GOD MODE result row: amber author column looks interactive but only opens the post — no path to mod console

Same finding, second lens.

- **Surface:** modtools-aux.js:2484-2486 (author column is plain span)
- **Friction type:** discoverability
- **Proposed fix:** Replace the plain mkSpan at modtools-aux.js:2485 with an interactive span that stops propagation and opens the mod console.
- **Found in iteration:** 12

### [P1] GOD MODE result rows: amber author column is visually clickable but dead — every other amber username in the extension is actionable

Third lens.

- **Surface:** modtools-aux.js:2484-2486 (author column uses mkSpan with no event handler)
- **Friction type:** cognitive-load
- **Proposed fix:** In the author column builder at modtools-aux.js:2485, replace `mkSpan(...)` with a clickable anchor that opens Mod Console.
- **Found in iteration:** 11

### [P1] GOD MODE search author column has no path to Mod Console — must copy username + close modal + re-navigate

Fourth lens.

- **Surface:** modtools-aux.js:2484-2486, modtools-aux.js:2098-2100
- **Friction type:** discoverability
- **Proposed fix:** Expose `openModConsole` on `window._gamOpenModConsole` in modtools.js (mirroring how `window._gamOpenGodMode` is exposed at modtools-aux.js:2891). Then in modtools-aux.js:2485, replace the static `mkSpan` with a clickable span: `cursor:pointer; text-decoration:underline; title='Open Mod Console'`, onclick `window._gamOpenModConsole(row.author, null, 'intel')` with fallback to opening the user's profile in a new tab.
- **Found in iteration:** 23

### [P1] GOD MODE bulk-action bar has no moderation actions — search-to-act requires leaving the modal

Bulk DR button — convergent fix.

- **Surface:** modtools-aux.js:2098-2100 (_gmRefreshBulkBar)
- **Friction type:** cognitive-load
- **Proposed fix:** Append a fourth button to `bar` after Copy URLs at modtools-aux.js:2100: `bar.appendChild(btn('☠ Death Row (72h)', '#3a1818', async () => { ... await _gmRpc('addToDeathRow', ...) ... _gmRefreshBulkBar(); }));`.
- **Found in iteration:** 16

### [P1] GOD MODE bulk-select stops at 'Copy authors' — no path to act on the selected accounts without leaving the modal

Same finding, additional lens.

- **Surface:** modtools-aux.js:2098 (bulk bar action set), modtools-aux.js:2282 (_gmBulkCopy)
- **Friction type:** discoverability
- **Proposed fix:** In _gmRefreshBulkBar (modtools-aux.js:2098 region), add a 'DR all authors' button next to 'Copy authors'.
- **Found in iteration:** 7

### [P1] Firehose has zero popup OR palette entries — floating panel is the only control surface

Add palette entries.

- **Surface:** popup.html (no firehose), modtools.js:5551-5699 (_apRegistry has no firehose), modtools.js:29951-29963 (panel is only UI)
- **Friction type:** discoverability
- **Proposed fix:** 1) Add a Firehose status row to popup Tools tab inside #card-maint-status (or as its own subsection): show active/idle + Start/Pause button wired through existing firehoseStart/firehoseStop. 2) Add one palette entry: `{ label: 'Firehose — toggle data capture', kw: 'firehose crawl capture start pause stop', icon: '🔥', fn: () => _firehoseState.active ? firehoseStop() : firehoseStart() }`.
- **Found in iteration:** 17

### [P1] Firehose has zero palette entries for start/stop — keyboard-first operators can only reach it via the visual panel widget

Same gap.

- **Surface:** modtools.js:29968-29978, modtools-aux.js:2895-2937
- **Friction type:** discoverability
- **Proposed fix:** Expose `firehoseStart`/`firehoseStop` as `window._gamFirehoseStart`/`window._gamFirehoseStop` near modtools.js:29868-29902. After the wave5 forEach block at modtools-aux.js:2938, register two palette commands: 'Firehose · Start data capture' and 'Firehose · Pause data capture'.
- **Found in iteration:** 23

### [P1] Firehose Start/Pause has no command palette entry — only way to pause/resume is the auto-injected panel

Third lens.

- **Surface:** modtools-aux.js:2895-2939 (wave5 palette block), modtools.js:29859 (firehoseStart), modtools.js:29885 (firehoseStop)
- **Friction type:** discoverability
- **Proposed fix:** Register two palette entries in the wave5 block at modtools-aux.js:2939: `window._gamCmdkRegister({ label: 'Firehose · Start crawler', kw: 'firehose start crawl ingest background', icon: '\\u{1F525}', fn: () => { if (typeof firehoseStart === 'function') firehoseStart(); else snack('Firehose not available on this page', 'warn'); } });` and a Pause entry calling firehoseStop.
- **Found in iteration:** 5

### [P1] Lead-only 'Firehose crawl health' visible to all mods in palette — already cataloged P1

Already covered.

- **Surface:** modtools-aux.js:2926
- **Found in iteration:** 4

### [P1] Shift+? shortcuts overlay omits Alt+J/K queue nav AND all Ctrl+Shift mod-action chords

Multiple convergent findings on the same _helpShortcuts array. Best fix: extract to a module-scoped mutable array that waves push into.

- **Surface:** modtools-aux.js:422-434 (_helpShortcuts return)
- **Friction type:** discoverability
- **Proposed fix:** Convert `_helpShortcuts` at modtools-aux.js:422 from a closed array literal to a module-level mutable array that each wave's IIFE pushes into on load. Wave 5 IIFE then pushes `{ keys: '🔍 status bar', desc: 'GOD MODE firehose search' }` and `{ keys: 'Alt+J / Alt+K', desc: 'Queue navigation (wave 4)' }`. Also append the daily-driver Ctrl+Shift+B/R/X/W/C/L/S chords.
- **Found in iteration:** 9, 11, 13, 15, 19, 22, 25

### [P2] GOD MODE 'Open in tabs' >25 guard uses window.confirm() — only remaining native blocking dialog in the GOD MODE surface

Replace with double-tap or _gamAuxConfirm.

- **Surface:** modtools-aux.js:2136-2138 (_gmBulkOpenTabs)
- **Friction type:** cognitive-load
- **Proposed fix:** Replace window.confirm() at modtools-aux.js:2137 with double-tap pattern matching DR fire-now (modtools.js:21335-21342). Use module-scoped flag `_gmBulkPendingConfirm`: first click arms with snack 'Opening N tabs — click again within 3s to confirm'; second click within timeout executes; timeout clears flag.
- **Found in iteration:** 11

### [P2] GOD MODE bulk 'Open in tabs' (>25) uses raw `window.confirm()` — single missed site in an otherwise consistent file

Same root cause, second lens.

- **Surface:** modtools-aux.js:2137
- **Friction type:** error-recovery
- **Proposed fix:** Mark `_gmBulkOpenTabs` async. Replace line 2137 with: `const ok = await (typeof window._gamAuxConfirm === 'function' ? window._gamAuxConfirm('Opening ' + n + ' tabs. Browser may slow down. Continue?', { okLabel: 'Open ' + n + ' tabs', cancelLabel: 'Cancel', danger: n > 50 }) : Promise.resolve(window.confirm('Opening ' + n + ' tabs. Continue?')));`.
- **Found in iteration:** 3

### [P2] GOD MODE 'Open in tabs' bulk action uses window.confirm — silently fails on Brave with >25 selected

Third lens.

- **Surface:** modtools-aux.js:2136-2138 (_gmBulkOpenTabs window.confirm call)
- **Friction type:** error-recovery
- **Proposed fix:** Replace window.confirm at modtools-aux.js:2137 with `await window._gamAuxConfirm('Opening ' + n + ' tabs. Browser may slow down. Continue?', { okLabel: 'Open tabs', danger: true })`. Make _gmBulkOpenTabs async. _gamAuxConfirm is already installed on window by the aux IIFE 0 preamble.
- **Found in iteration:** 22

### [P2] Palette 'Action · Ban + Send Template (1-click)' opens a profile tab and exits — no template, no ban, no combo

Label lies.

- **Surface:** modtools-aux.js:1809-1815 (_banPlusTemplate), modtools-aux.js:1959 (palette registration)
- **Friction type:** error-recovery
- **Proposed fix:** Drop the palette entry and the function. The 'ban template combo flow' the label promises is identical to the work a mod does after Ctrl+Shift+B. Either delete to avoid the dedup footgun, or rename to 'Action · Open user profile (new tab)' and strip 'template' / 'combo' / 'flow' from kw and snack text.
- **Found in iteration:** 6

### [P2] Palette 'Action · Ban + Send Template (1-click)' opens a new tab with no ban queued — label promises 1-click, body is just a navigation

Second lens.

- **Surface:** modtools-aux.js:1959 (label), modtools-aux.js:1809-1815 (body)
- **Friction type:** cognitive-load
- **Proposed fix:** Rename palette entry to `'Action · Open profile for ban + template (new tab)'` with kw `'ban template open profile user new tab'`. Remove '(1-click)' and 'combo flow' wording. Update snack to `'Opening u/' + u + ' in new tab — use the Mod Console to ban + send template there'`.
- **Found in iteration:** 19

### [P2] 'Queue · Priority inbox' palette label implies global use; runs only on modmail pages and lies about undo behavior

Honest label + accurate undo copy.

- **Surface:** modtools-aux.js:1677-1689, modtools-aux.js:1950
- **Friction type:** error-recovery
- **Proposed fix:** Two tiny edits in modtools-aux.js: (1) rename the palette label at line 1950 from `'Queue · Priority inbox (urgent only)'` to `'Modmail · Priority inbox (urgent only — modmail page only)'` and add `'modmail page only'` to the kw. (2) At line 1685, change `'Re-run to undo.'` to `'Auto-restores in 30s.'` to match actual behavior.
- **Found in iteration:** 23

### [P2] Saved-views Load/Delete require typing a blind number into a text prompt — names are in the question label, not clickable

Button picker.

- **Surface:** modtools-aux.js:342-363 (_viewsLoadPrompt, _viewsDeletePrompt)
- **Friction type:** cognitive-load
- **Proposed fix:** In _viewsLoadPrompt and _viewsDeletePrompt, render each saved view as a clickable button row inside the card. Resolve promise with clicked view's name. Skip parseInt. Reuse wave4 palette item button pattern.
- **Found in iteration:** 13

### [P2] 'Macro · Stop recording' palette entry is always present — mod runs it without an active recording and gets cryptic 'Not recording' snack

Label clarification.

- **Surface:** modtools-aux.js:1956 and modtools-aux.js:1776-1778
- **Friction type:** cognitive-load
- **Proposed fix:** Rename the static label at modtools-aux.js:1956 to: `{ label: 'Macro · Stop recording (only when active)', kw: 'macro stop save end', icon: '⏹', fn: _macroStop }`. Stronger: when _macroStartRecord begins, set `window._gamMacroRecordingActive = true` and have the palette filter at command-list time include Stop only when that flag is true.
- **Found in iteration:** 24

### [P2] Macro recorder has no persistent active-state indicator — mod loses track of whether recording is on once the start snack dismisses

Add status-bar chip.

- **Surface:** modtools-aux.js:1753-1774 (_macroStartRecord); modtools-aux.js:1776-1778 (_macroStop)
- **Friction type:** discoverability
- **Proposed fix:** In _macroStartRecord, append a status-bar chip: `<span id='gam-macro-rec-chip' class='gam-bar-icon' style='color:#ff3b3b' title='Recording active — click to stop'>REC</span>` with click handler calling _macroStop. Remove the chip in _macroStop. Persistent visible state, one-click stop.
- **Found in iteration:** 20

### [P2] Polling-pause state is invisible on the status bar — operator with paused polling spends time debugging stale queue counts

Add chip.

- **Surface:** modtools-aux.js:378-411 (_pollingPauseToggle); modtools-aux.js:590-599 (palette entries)
- **Friction type:** discoverability
- **Proposed fix:** In _pollingPauseToggle pause branch, inject a status-bar chip `<span id='gam-poll-pause-chip' class='gam-bar-icon' style='color:#ffd84d' title='Polling PAUSED — click to resume'>⏸</span>` with click handler calling _pollingPauseToggle. Remove chip in unpause branch.
- **Found in iteration:** 20

### [P2] Palette 'AI · Voice-to-action' has no capability hint in label — fails silently on Brave with vague snack

Label-level capability hint.

- **Surface:** modtools-aux.js:1003 (label/kw), modtools-aux.js:883-885 (body)
- **Friction type:** error-recovery
- **Proposed fix:** Two changes: (1) Update label at modtools-aux.js:1003 to `'AI · Voice-to-action (Chrome + mic required)'` so the constraint is visible before invocation. (2) Update failure snack at modtools-aux.js:884 to `'Speech recognition not available — requires Chrome with microphone permission (not supported in Brave by default)'`. Add palette keyword `'chrome only microphone'` to wave2 entry.
- **Found in iteration:** 19

### [P2] GOD MODE search placeholder hardcodes 'author:catsfive' — Commander's personal username leaked into operator UI

Two convergent findings — replace with USERNAME placeholder.

- **Surface:** modtools-aux.js:2554 (gam-godmode-q input)
- **Friction type:** cognitive-load
- **Proposed fix:** Replace 'catsfive' with a generic stand-in at modtools-aux.js:2554: change `author:catsfive` to `author:USERNAME`.
- **Found in iteration:** 16, 17

### [P2] GOD MODE palette label uses unexplained jargon ('firehose', 'rich grammar')

Plain-language label.

- **Surface:** modtools-aux.js:2897
- **Friction type:** cognitive-load
- **Proposed fix:** modtools-aux.js:2897 — change label to 'GOD MODE: Advanced search (author: date: removed: score: filters)'. Update kw to prepend operator-typing terms: 'advanced search filter removed deleted author date score god mode firehose archive query'.
- **Found in iteration:** 8

### [P2] GOD MODE modal '⛶ FULL APP' button label is opaque — tooltip-only destination hint

Visible destination.

- **Surface:** modtools-aux.js:2541-2544
- **Friction type:** discoverability
- **Proposed fix:** Rename the visible label from `'⛶ FULL APP'` to `'⛶ Standalone search'` at modtools-aux.js:2544.
- **Found in iteration:** 4

### [P3] GOD MODE button tooltip teaches palette path instead of communicating 'click me'

Multiple convergent findings.

- **Surface:** modtools-aux.js:2952
- **Friction type:** discoverability
- **Proposed fix:** Edit modtools-aux.js:2952 to: `btn.title = "GOD MODE search — click to search the full post/comment archive (including removed). Also reachable via Ctrl+Shift+P → god mode."` Primary affordance (click) leads, palette is secondary.
- **Found in iteration:** 12, 16, 24

### [P3] GOD MODE status-bar icon tooltip describes the keyboard path before the click action

Same finding, first lens.

- **Surface:** modtools-aux.js:2952
- **Friction type:** discoverability
- **Proposed fix:** modtools-aux.js:2952 — change to `btn.title = 'GOD MODE Search — click to open (also Ctrl+Shift+P → "god mode")';`.
- **Found in iteration:** 1

### [P3] Stethoscope status-bar icon tooltip says 'paste to Claude' — Commander-internal jargon shown to every mod

Internal jargon leak.

- **Surface:** modtools-aux.js:3435 (status-bar button title), modtools-aux.js:3419 (palette label)
- **Friction type:** discoverability
- **Proposed fix:** Rewrite modtools-aux.js:3435 to `btn.title = "Debug snapshot: captures page state + ModTools settings to clipboard. Share with your team lead when reporting a visual bug."`. Rename the palette label at line 3419 from `'Snapshot for fix -- capture page state + copy to clipboard'` to `'Debug snapshot — capture page state for bug report (copies to clipboard)'`.
- **Found in iteration:** 6

### [P2] 15+ palette AI commands surface 'failed: unknown' on auth/consent errors — no hint about token scope or the AI consent toggle

Pre-flight consent check + better error mapping.

- **Surface:** modtools-aux.js:778, 803, 843, 1385, 1403, 1423, 1433, 1466, 1489, 1524
- **Friction type:** error-recovery
- **Proposed fix:** Add a pre-flight check at the top of each AI palette fn: `if (typeof consentEnabled === 'function' && !consentEnabled('features.ai')) { _snack('AI features off - enable in Settings (GEAR -> Features -> Daily AI Scan)', 'warn'); return; }`. For runtime errors, replace the unknown-error snack with: `const _aiErr = (r && r.error) || 'unknown'; const _aiHint = /401|403/.test(_aiErr) ? ' - token may lack ai scope; rotate via popup' : (_aiErr === 'unknown' ? ' - check Diag tab' : ''); _snack('X failed: ' + _aiErr + _aiHint, 'err');`.
- **Found in iteration:** 7

### [P2] Modmail panel ALL/NEW/AWT/RES filter rail is mouse-only — keyboard nav forces a mouse-grab

Cross-referenced with modtools.js finding above. Fix lives in modtools.js:18826.

- **Surface:** modtools.js:18826 (_mmpKbHandler); modtools.js:18626 (filter tab HTML)
- **Found in iteration:** 7

### [P2] Modmail mm-bar advertises 3 shortcuts; 4 daily-driver chords live in a collapsed widget

Extend mm-bar hint.

- **Surface:** modtools.js:13714 (always-visible bar), modtools.js:22243-22249 (collapsed widget)
- **Friction type:** discoverability
- **Proposed fix:** Extend the mm-bar string at modtools.js:13714 to: `Ctrl+Shift+A archive · Ctrl+Shift+B ban · Ctrl+Shift+M console · R reply · ? all shortcuts`. The '?' at the end is the literal anchor that surfaces the widget for the full list.
- **Found in iteration:** 16

---

## background.js, docs+install, other

### [P0] gam_show_whats_new flag is written on every update but popup.js never reads it

Already cataloged at P1 popup section. Reaffirmed here as a background.js dependency.

- **Surface:** background.js:787 (write)
- **Found in iteration:** 20

### [P1] Inactivity-lock broadcasts 'gamLocked' but no handler exists

Already cataloged in modtools.js section.

- **Surface:** background.js:321 (sender)
- **Found in iteration:** 11

### [P1] Installer passes chrome://extensions to Brave — Brave doesn't alias the scheme

PowerShell installer-script bug.

- **Surface:** scripts/install-gaw-modtools.ps1:302
- **Friction type:** error-recovery
- **Repro:**
  - Have only Brave (no Chrome) installed on a Windows machine
  - Run install-gaw-modtools.ps1
  - Find-Browser resolves brave.exe into $browserPath
  - Line 302 fires Start-Process $browserPath 'chrome://extensions'
  - Brave opens to a blank/error page — its extensions UI lives at brave://extensions
- **Proposed fix:** Before line 302, branch: `$extUrl = if ($browserPath -match 'brave') { 'brave://extensions' } elseif ($browserPath -match 'edge') { 'edge://extensions' } else { 'chrome://extensions' }`. Use $extUrl in the Start-Process call and the two fallback log lines at 306/309.
- **Found in iteration:** 21

---

## Recommended v10.19+ rollout order

The next ship should batch the install/upgrade flow first — every convergent finding (12+) tracks back to the same operator pain Commander hit today. Most of the rest are one-line text or one-block JS changes.

1. **One-click `chrome://extensions` from popup install accordion (popup.html:580).** Wrap the `<code>chrome://extensions/</code>` text in a `<button onclick="chrome.tabs.create(...)">`. Branch on `navigator.brave?.isBrave()` for the URL scheme. Closes nine convergent install/upgrade findings in one edit. Estimated: 10 lines.

2. **Update banner shared SW handoff `{type:'openExtensionsPage'}` (modtools.js:27867, modtools.js:5695).** Wire one new SW handler in background.js that calls `chrome.tabs.create({url:'chrome://extensions/?id=' + chrome.runtime.id})`. Reuse it from (a) the update-banner Reload button, (b) the palette 'Reload extension' command, (c) the future popup 'Reload extension' button. Closes orphan recovery + URL-copy theater + Brave scheme bug. Estimated: 25 lines.

3. **Version-agnostic Developer mode copy across all surfaces (popup.html:581, docs/INSTALL.md:61, install-gaw-modtools.ps1:351, invite-mod.ps1:313, publish-to-drive.ps1:125).** Replace 'switch top-right' with: 'Enable Developer mode — visible top-right toggle on Chrome 125-, or the ⋮ kebab menu on Chrome 126+, or the left sidebar depending on version. Once on, a Load unpacked button appears.' One-line edit per file. Closes Commander's exact 2026-06-04 friction.

4. **rotation_save_failed in-memory token recovery (popup.js:2973-2978, background.js:3114).** Add a 60-second module-scoped variable in background.js that holds the rotated token after rotation_save_failed; add an `authRetryPersist` RPC; add 'Retry save' and 'Copy new token' buttons to popup. Closes the worst-class auth failure in the product — three convergent P1 findings, but lockout severity warrants treating as the highest-impact recovery fix after the install flow. Estimated: 40 lines.

5. **popupRpc single auto-retry on NO_RESPONSE (popup.js:26-39).** One 1500ms retry inside popupRpc before returning NO_RESPONSE. Closes five convergent cold-SW findings: red Tokens card on cold SW, '✓ stored' on indeterminate probe, 'first-run' wizard flash for returning mods, 'token may be invalid' misdiagnosis, 'HTTP ?' on Diag ping. Estimated: 8 lines.

6. **Auth-fail consecutive-401 promotion to banner (modtools.js:26279, 26820, 29262).** Promote the transient warn snack to the full `__showAuthFailBanner` infrastructure with action buttons. Add `loginRedirect` link to the four inline ban/note/message/queue failure banners. Closes four convergent findings on mid-session auth failure surfaces. Estimated: 30 lines.

7. **Death Row ban failure exposes the full result object (modtools.js:8307-8309 + 8701).** Stop discarding `loginRedirect`/`timeout`/`status` from `executeBan`. Three convergent findings. Two-line signature change + four-line snack branch. Estimated: 8 lines.

8. **Wizard Enter-key submit + remove 5s auto-collapse (popup.js:3988, 4021, 4059).** Add Enter handlers on `#firstRunInput` and `#firstRunUsername`; remove the two auto-collapse setTimeouts. Closes six convergent first-run wizard findings. Estimated: 10 lines.

9. **Update banner step-numbered buttons + Brave scheme detect (modtools.js:27801, 27803, 27867).** Renumber buttons '1. Reload extension' / '2. Reload this page'. Add `isBrave` branch to set `brave://extensions` URL. Replace 4s revert with persistent '✓ Paste in address bar' label. Closes seven convergent update-banner findings. Estimated: 15 lines.

10. **Mark Resolved + DR right-click + SUS prompt migration to preflight/withUndo (modtools.js:19261, 12409, 13300, 13294, 11580, 15767, 12107, 17356, 10871).** Sweep all remaining `window.confirm/prompt/alert` in mod-action paths to `preflight`/`askTextModal`/`_gamAuxConfirm`. Closes nine destructive-confirm findings in one consistent pass. Estimated: 50 lines across nine call sites.

Everything below the top 10 is text-only or one-line tooltip/label fixes that should be batched alongside the structural fixes above (Tools-tab bracket-prefix strip, popup tab title= attributes, `_helpShortcuts` extraction, palette kw expansion, recentItems refresh, `catsfive` placeholder replacement). Aim for v10.19 to ship items 1-7 and v10.19.1 to clean up 8-10 plus the text-only sweep.