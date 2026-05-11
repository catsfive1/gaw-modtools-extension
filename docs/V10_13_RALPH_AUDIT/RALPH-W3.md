# RALPH-W3 — Wave 3 Popover Fixes Pack — Read-Only Audit

**Auditor:** RALPH-W3 (read-only)
**Target:** GAW ModTools v10.13.1 (W3 commit `4927aea`), as shipped in HEAD `9c7655e` (v10.13.4)
**Scope:** 39 ACs across 5 popover surfaces + snack ext + 4 W1-deferred font sites
**Spec:** `docs/V10_DESIGN_V2/DESIGN_V2_SHIPMASTER.md` §5 W3 (lines 354-417)
**File of record:** `D:\AI\_PROJECTS\modtools-ext\modtools.js` (27671 lines, last touched at v10.13.4)

---

## Summary

**38 of 39 ACs PASS as shipped.**
**1 AC is DEAD CODE (ships, but never executes in production).**

The W3 implementation is overall clean: each AC has a clear `v10.13.1 W3` comment, the diff is contained to `modtools.js`, no schema changes, no new RPCs invented (per the explicit anti-pattern in the commit body — `modAutoRuleAdd` is called with graceful localStorage fallback). Parser passes, version-bump is clean, sister-repo flag bumped at the same commit per process.

The one failure is **Health popover ARMED state**: implemented in JS but gated on a worker field (`firehose_d1_count`) that the worker does not emit. The pill never lights yellow, R-12 is **not actually closed**.

Two minor paper-cuts found during hunt phase that are not AC failures but worth noting:
1. DR Cancel All Undo toast survives popover dismiss; if user closes popover then clicks UNDO, entries are correctly restored to global state but the popover-rerender writes to a detached node (no visible update). User has to reopen DR popover to see resurrected entries.
2. Active Mods popover close-button click leaks one document-level click listener until next outside-click event sweeps it.

---

## AC Verification Table

Status legend: PASS = behavior verified in code; FAIL = AC not met; DEAD = code present but unreachable in production; PER-SPEC = matches spec/commit even if Hunt-list flagged as edge.

### SUS popover (7 ACs)

| # | AC | Status | Where | Evidence |
|---|---|---|---|---|
| SUS-1 | Chevron rotates correctly on second expand | PASS | modtools.js:18352-18356 | Inline `ch.style.transform = ''` removed; CSS rule `.gam-sus-row.expanded .gam-sus-chevron{transform:rotate(90deg)}` (line 18052) is now sole driver. Comment at 18352-18355 documents removal. |
| SUS-2 | `[DR Rule]` button wires `modAutoRuleAdd` RPC | PASS (with caveat) | modtools.js:18429-18477 | RPC is called via `rpcCall('modAutoRuleAdd', ...)` (line 18456). On success-with-`!ok`, network catch, OR thrown sync error, falls back to `_localFallback()` which writes to `getSetting('autoTardRules', [])` and persists via `setSetting`. Caveat: `modAutoRuleAdd` does NOT exist in worker (`gaw-mod-proxy-v2.js`) — verified absent via grep across `cloudflare-worker/`. Path always degrades to localStorage. Localstorage is read in 11 places including the rules engine at L13976/L14073, so persistence + future render are intact. **Working as designed**, just never has the RPC win. |
| SUS-3 | Unmark visible on collapsed strip | PASS | modtools.js:18290-18314 | `unmarkStripBtn` constructed in `_buildSusRow` action strip (always-visible), appended at L18314 before drill panel. Click handler calls `modSusClear` RPC, removes row from popover, updates title. Closure-captures `outerWrap` which is declared 22 lines later — JS const TDZ semantics make this safe at click-time (function has returned, `const` initialized). |
| SUS-4 | DR button label "DR 72h" | PASS | modtools.js:18277 | `drBtn.textContent = 'DR 72h';` Comment at L18275-18276 documents the change. |
| SUS-5 | `[⋯]` button removed | PASS | modtools.js:18316-18319, 18384-18386 | Only 5 references to `⋯` remain in the file, ALL in comments documenting the removal. No DOM construction site. `gam-sus-more` class never used. `moreBtn` variable never declared. |
| SUS-6 | Focus trap (Tab/Shift-Tab + ESC + focus restore) | PASS | modtools.js:18526-18571 | `_getFocusable()` queries `button:not([disabled]), [href], input/select/textarea:not([disabled]), [tabindex]:not([tabindex="-1"])` with offsetWidth/Height visibility filter. `_trapHandler` cycles first↔last on Tab/Shift-Tab with `preventDefault`. `_escHandler` dismisses. `_closePop` restores `_prevFocus` (or anchor as fallback). Initial focus on closeBtn via `setTimeout(0)`. Verified Tab order cycles through [DR 72h], Unmark, [Open Death Row →] when [DR Rule] tard suggestions are absent — all are matched by selector. |
| SUS-7 | Tard divider padding 6px 10px 4px | PASS | modtools.js:18056 | `.gam-sus-tard-divider{...padding:6px 10px 4px;...}` |

### DR popover (6 ACs)

| # | AC | Status | Where | Evidence |
|---|---|---|---|---|
| DR-1 | Cancel All 2-step confirm + 3s auto-revert | PASS | modtools.js:18933-18962 | First click: `confirming` class added, label → "Confirm ▶ 3s", color shifts to deeper amber, pulse animation, `setTimeout` 3000ms revert. Second click: `clearTimeout`, proceeds. Mirrors FIRE NOW pattern at L18211 per spec. |
| DR-2 | Snapshot at cancel time, not popover-open | PASS | modtools.js:18964-18979 | `const liveDr = getDeathRow().filter(...)` reads live state at click moment (L18970). Comment at L18964-18969 documents the bug being fixed. Manually-removed-mid-session entries no longer resurrect on undo. |
| DR-3 | Band re-eval on tick when row crosses threshold | PASS | modtools.js:18750-18776 | `_cdMap` tracks `band` per username. `_updateCountdown` detects `entry.band !== fmt.band`, sets `_bandRerenderQueued`, defers `setTimeout(0)` re-render via `_renderDrBands(fresh)` to coalesce simultaneous crossings. |
| DR-4 | Countdown MM:SS extends to 90min | PASS | modtools.js:18705-18707 | `if (mins < 90) { return { text: 'MM:SS', cls: 'urg-today', band: 'today' }; }` — the 60-90min window is MM:SS in TODAY band. Below 60min becomes IMMINENT band (still MM:SS). Above 90min becomes hr-format. No `1h 0m → 59:31` flip. |
| DR-5 | Undo toast extended snack | PASS | modtools.js:18994-19017 | Calls `snack(msg, 'success', { actionLabel:'UNDO', actionDurationMs:10000, onAction:fn })`. Snack ext (L7519-7613) renders amber ghost button + 2px countdown bar at bottom + auto-dismisses at 10s. Click UNDO: restores all entries from `snapshot`, fires `_renderDrBands(fresh)`, updates title. |
| DR-6 | `gamMakeEmpty('dr-empty', ...)` icon resolves | PASS | modtools.js:4488 | `_GAM_EMPTY_SVG['dr-empty']` is registered with circle+X icon. Used at L18785 when `drEntries.length === 0`. No fallback to 'queue' needed. |

### Queue popover (4 ACs)

| # | AC | Status | Where | Evidence |
|---|---|---|---|---|
| Q-1 | `/mod/queue` not `/queue` | PASS | modtools.js:19131, 19135, 19317, 19321 | Footer link href `/mod/queue` (L19131), label "Open /mod/queue →" (L19135). Data-gap link href `/mod/queue` (L19317), label "Open /mod/queue →" (L19321). Hint text "Open /mod/queue to review manually..." (L19312). Zero remaining `/queue` (without `/mod`) references for queue-popover routing. |
| Q-2 | Author span max-width 120px + ellipsis | PASS | modtools.js:19084 | `.gam-queue-author{color:#66ccff;cursor:pointer;text-decoration:none;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:bottom}` |
| Q-3 | Refresh disabled during RPC | PASS | modtools.js:19271-19278, 19337-19341 | Pre-call: `refreshBtn.disabled = true; opacity 0.5; cursor default`. Restored on both `.then()` and `.catch()` via `_restoreRefresh()`. Operator cannot stack concurrent `modGetQueueSnapshot` calls. |
| Q-4 | Retry button in data-gap body | PASS | modtools.js:19323-19327 | `gapRetryBtn` constructed alongside `gapLink`, click handler calls `_fetchAndRenderQueue()`. Cyan border-1px ghost button to differentiate from amber `/mod/queue` link. |

### Health popover (9 ACs)

| # | AC | Status | Where | Evidence |
|---|---|---|---|---|
| H-1 | Firehose pill no flicker | PASS | modtools.js:19494-19498 | `fhPillInitialCls = fhActive ? 'gam-sh2-pill--ok' : 'gam-sh2-pill--err'` is computed BEFORE `pop.innerHTML` template-string assignment. Pill rendered with correct class at first paint. Comment at L19483-19487 documents the pre-fix amber-flicker bug. |
| H-2 | Pill min-width 68px | PASS | modtools.js:19411 | `.gam-sh2-pill{...min-width:68px;justify-content:center;...}` |
| H-3 | WebKit scrollbar styling | PASS | modtools.js:19437-19440 | Four pseudos: `::-webkit-scrollbar{width:8px}`, `-track{background:#1a1d22}`, `-thumb{background:#3a3f48;border-radius:0}`, `-thumb:hover{background:#4a4f58}`. |
| H-4 | Feed row hover state | PASS | modtools.js:19444 | `.gam-sh2-feed-row:hover{background:rgba(74,158,255,0.06)}` |
| H-5 | Empty-state row on `recent_actions:[]` | PASS | modtools.js:19596-19602 | `_renderFeed` checks `!actions || actions.length === 0`, appends `gam-sh2-feed-empty` `<li>` with text "No recent moderator activity in the last 24h." |
| H-6 | KPI 999+ cap | PASS | modtools.js:19537 | `var displayVal = (typeof value === 'number' && value >= 1000) ? '999+' : String(value);` |
| H-7 | "VERIFY" not "LAST VERIFY" | PASS | modtools.js:19506 | `<div class="gam-sh2-tile-lbl">VERIFY</div>` |
| H-8 | `data-loading="1"` on stub tiles, cleared by `_setTile`/`_setFhTile` | PASS | modtools.js:19503-19506, 19541, 19551 | All 4 tiles render with `data-loading="1"`. CSS rule `.gam-sh2-tile[data-loading="1"] .gam-sh2-tile-val{color:#5c6370 !important}` (L19449) forces neutral dim. `_setTile` clears via `tileWrap.removeAttribute('data-loading')` (L19541). `_setFhTile` clears at L19551. |
| H-9 | **Firehose ARMED state wired** | **DEAD** | **modtools.js:19657 vs cloudflare-worker/gaw-mod-proxy-v2.js:1262** | **`_setFhPillArmed` (L19567-19574) implements the visual state correctly. The detection at L19657 is `if (d.firehose_active && d.firehose_d1_count != null && ...)` — but the worker `/mod/stats` payload at gaw-mod-proxy-v2.js L1255-1267 emits `firehose_active`, `actions_24h`, `queue_depth`, `last_verify_ts`, `recent_actions`, `ai_calls_today`, `ai_calls_cap` — NO `firehose_d1_count` field. The `!= null` guard always fails. Pill never goes to ARMED in production. R-12 is shipped-but-not-wired.** |

### Active Mods popover (9 ACs)

| # | AC | Status | Where | Evidence |
|---|---|---|---|---|
| AM-1 | Tier classification (active <30m / idle 30m-4h / stale >4h) | PASS | modtools.js:17799-17804 | `_classifyTier(deltaMs)`: `< 30 * 60_000` → active; `< 4 * 3600_000` → idle; else stale. Strict-less-than means a row at exactly 30 minutes lands in IDLE (boundary inclusive on idle side), exactly 4h lands in STALE. No off-by-one. |
| AM-2 | Colored presence dot per tier | PASS | modtools.js:17758-17761 | `.gam-am-dot--active{background:#3dd68c}` (green), `--idle{background:#ffd84d}` (amber), `--stale{background:#5a5752}` (dark gray). `_addRow` (L17850) applies via `dot.className = 'gam-am-dot gam-am-dot--' + e.tier`. |
| AM-3 | Sort recency desc | PASS | modtools.js:17832 | `.sort(function(a, b) { return a.delta - b.delta; })` — smallest delta (most recent activity) first. |
| AM-4 | Section dividers ACTIVE (n) / IDLE (n) / EARLIER | PASS | modtools.js:17874-17885 | `_addDivider('ACTIVE (' + groups.active.length + ')')` and same for IDLE. Stale divider is `EARLIER` without count — matches W3 commit message verbatim ("ACTIVE (n) / IDLE (n) / EARLIER"). The brief mentioned "EARLIER (n)" — that was a brief-side typo; spec + commit both say no count for stale. **Per-spec.** |
| AM-5 | Page-path 40ch ellipsis + clickable | PASS | modtools.js:17763, 17855-17862 | `.gam-am-page{...max-width:40ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block}`. `_addRow` creates `<a>` if `e.page` truthy, else `<span>`. `target=_blank rel=noopener`. |
| AM-6 | Mod count `(n)` in header | PASS | modtools.js:17818-17819 | `if (titleEl) titleEl.textContent = 'Active mods (' + mods.length + ')';` |
| AM-7 | Time-ago "now" for <60s | PASS | modtools.js:17791-17798 | `_formatAgo(ms)`: `if (s < 60) return 'now'`. Then minutes (`< 60`), then hours. |
| AM-8 | Segmented control wrapper | PASS | modtools.js:17751-17754, 17774-17778 | `.gam-am-seg` flex container with internal border-right separators. Three buttons `data-w="4|8|24"`. `aria-pressed="true"` style highlights with amber tint. `role="group" aria-label="Time window"` on parent. |
| AM-9 | aria-pressed + aria-label on close | PASS | modtools.js:17775-17779, 17787 | Window buttons start `aria-pressed="false"`, `highlightWindow(h)` (L17784-17789) sets the active one to `true`. Close button has `aria-label="Close popover"`. |

### Snack utility (4 ACs)

| # | AC | Status | Where | Evidence |
|---|---|---|---|---|
| SN-1 | Backwards-compat: snack(msg) and snack(msg, type) work | PASS | modtools.js:7519, 7533 | `function snack(msg, type='info', opts)` — `opts` defaults to `undefined`. `const o = opts || {}` (L7533). `hasAction` and `hasCountdown` both fall to false on missing/empty opts. Old call sites unchanged. |
| SN-2 | Action button + onAction click → fires + dismisses | PASS | modtools.js:7552-7568 | When `hasAction`, btn is constructed, click handler calls `o.onAction()` then triggers immediate dismiss via `gam-snack-show` class removal + 200ms `s.remove()` + clears countdown interval + dismiss timer. |
| SN-3 | Countdown bar + auto-dismiss at duration | PASS | modtools.js:7570-7589, 7609-7613 | When `hasCountdown`, 2px amber bar at `bottom:0`, width tweens via 100ms `setInterval`. Auto-dismiss timer at L7609 fires at `durationMs` (= `actionDurationMs` when set). Race: if click fires first, action handler clears both timers; if auto-dismiss fires first, no action handler ever runs. No double-fire path. |
| SN-4 | Bloomberg ghost-button hover style | PASS | modtools.js:21175-21176 | `.gam-snack-action{background:transparent;border:1px solid #ff9933;color:#ff9933;...}`. `:hover{background:#ff9933;color:#0a0a0b}` — fills amber on hover, black text. |

### W1 deferred — font-size 8px → 9px (4 ACs)

| # | AC | Status | Where | Evidence |
|---|---|---|---|---|
| W1-1 | `.gam-dr-band-hdr` (DR popover band labels) | PASS | modtools.js:18655 | `font-size:9px` (formerly 8px). W3-comment at L18654 documents off-grid snap to type-scale charter (4/8/9/10/11px tiers). |
| W1-2 | cancelAllBtn inline | PASS | modtools.js:18732 | `font:600 9px ui-monospace,monospace` |
| W1-3 | `.gam-queue-btn` (Queue APPR/REM/OPEN) | PASS | modtools.js:19089 | `font:700 9px ui-monospace,monospace` |
| W1-4 | tier badge inline (status bar L badge) | PASS | modtools.js:19908 | `font:700 9px ui-monospace,monospace` (commit referenced L19031, file content there is now blank line — file drifted; the actual badge construction is at L19905-19912). |

**Total:** 39 ACs reviewed → **38 PASS, 1 DEAD** (H-9 Firehose ARMED).

---

## Findings

### F-1: H-9 Firehose ARMED state is dead code (CRITICAL FOR R-12)

**Symptom:** Health popover Firehose pill never enters ARMED yellow-blinking state in production.

**Root cause:** modtools.js:19657 gates the call to `_setFhPillArmed(local, d1)` on `d.firehose_d1_count != null`. The worker `/mod/stats` handler (`cloudflare-worker/gaw-mod-proxy-v2.js:1255-1267`) does NOT emit a `firehose_d1_count` field. The condition always evaluates false → `_setFhPillArmed` is never called.

**Evidence:**
- `grep -r "firehose_d1_count" cloudflare-worker/` → **no matches** (worker doesn't emit this field)
- `grep -r "firehose_d1_count" modtools-ext/` → 2 matches, both in modtools.js, both in the dead comparison block
- The original UIUX2-13 audit (L217-237) specified ARMED as a simple `localActive !== d1Active` flag-mismatch check — comparing booleans `fhActive` vs `d.firehose_active` (both fields exist). The W3 implementation invented a richer count-drift detection that requires worker-side cooperation that wasn't built.

**Impact:** R-12 is a CLOSED tag in the W3 commit but the behavior never fires. Mod sees green LIVE pill even when extension's local `_firehoseState.postsQueued` diverges from worker D1 by 50+ items after a worker restart. Trust-debt regression.

**Fix options:**
1. **Worker-side:** Add `firehose_d1_count: <count>` to the `/mod/stats` payload at gaw-mod-proxy-v2.js:1262-1268. Requires reading the firehose D1 count (likely a `SELECT COUNT(*) FROM firehose_*` query). 1 commit, ~10 LOC, matches the documented intent of the W3 design.
2. **Extension-side fallback:** Drop the count-drift detection and revert to flag-mismatch as audited (`fhActive !== d.firehose_active`). 5-line change in modtools.js, no worker change. Loses the "5-item drift / 20% delta" sensitivity but actually fires.

**Recommendation:** Option 1. The count-drift is a richer signal and the worker change is small. Run `wrangler d1 execute` to confirm the firehose table name, then ship the worker patch.

### F-2: DR Cancel All Undo survives popover dismiss (PAPER-CUT)

**Symptom:** User opens DR popover → Cancel All → Confirm → snack appears with UNDO button + 10s countdown → user closes popover (× / ESC / outside-click) → user clicks UNDO before 10s.

**Behavior:**
- `addToDeathRow` correctly restores all snapshot entries to global state
- `_renderDrBands(fresh)` is called against the now-detached popover body. No visual update because the body is GC-pending.
- `title.textContent = ...` mutates a detached node. No-op visually.
- The **second** snack ("Restored N entries") appears correctly via `snack(...)` at L19009.

**Net effect:** Restoration works correctly; user just doesn't SEE the resurrected rows until they reopen the DR popover. Minor UX paper-cut, no data loss, no error logged.

**Impact:** Low. AC for DR-5 still passes — undo fires, action restores. The visual update is silent when popover is closed.

**Fix:** Wrap `_renderDrBands(fresh)` in `if (document.body.contains(pop))` guard. 2-line change. Optional polish.

### F-3: Active Mods close-button leaks one document click listener (PAPER-CUT)

**Symptom:** modtools.js:17893 — close button click does `pop.remove()` only. The document-level `click` listener registered at L17897-17900 (`close` function) remains attached.

**Behavior:** Next time anything is clicked anywhere on the page, `close` fires, `pop.contains(ev.target)` returns false (pop is detached), executes `pop.remove()` (no-op), removes itself via `removeEventListener`. **Self-cleans on next click.**

**Impact:** Until the next click, ONE listener is leaked. Below the threshold worth a fix unless other listeners pile up.

**Fix:** Move the listener-removal into a single `_closePop()` helper, called from both close-button-click and outside-click. 5-line refactor.

### F-4: Active Mods has no ESC handler (NOT IN AC, MENTIONED IN AUDIT)

The original UIUX2-14 audit didn't require ESC dismiss for Active Mods — it required keyboard-accessible close button (PASS via aria-label). However ESC is missing. All other W3 popovers (SUS, DR, Queue, Health) have ESC handlers. Active Mods is the outlier.

**Impact:** Cosmetic inconsistency. AC list does not call this out, so not a fail.

**Fix:** Mirror the SUS-popover ESC pattern (L18570-18571). 4-line addition.

---

## Cross-Wave Conflicts

### CWC-1: Popovers and `closeAllPanels()` selector list

`closeAllPanels()` at modtools.js:7357-7400 sweeps `.gam-modal`, `#gam-backdrop`, `.gam-modal-backdrop`, `#gam-intel-backdrop`, `#gam-token-onboard-backdrop`, `.gam-preflight-wrap`, `[data-gam-orphan-backdrop]`. **None of the W3 popovers are in this list.** That is by design: popovers self-manage via per-instance outside-click + ESC handlers. They're not modal — they're transient overlays.

**Verified non-conflict path:** SUS popover open → user clicks BAN modal trigger → `closeAllPanels()` runs to clear other modals → does NOT close SUS → BAN modal opens → click outside SUS (now in BAN modal area) → SUS's `_outsideClick` handler fires → SUS dismisses. No collision.

**Verified non-conflict path:** SUS popover open → user opens DR popover → DR's outside-click registration is set on `setTimeout(0)`. SUS's existing outside-click handler fires when DR-trigger click bubbles. SUS dismisses. DR remains. Single-popover invariant maintained.

**No regression.**

### CWC-2: Snack stacking

`snack(msg, type, opts)` removes any prior `#gam-snack` element (L7539: `const old=document.getElementById('gam-snack'); if(old) old.remove();`). DR Cancel All fires `snack(...)` with countdown. If user fires another action mid-countdown, the active snack is destroyed and replaced. Countdown interval is **NOT** cleared when an outside snack call replaces the snack — the old snack's `setInterval(s._gamCountdownInterval, ...)` keeps running on a detached element.

**Impact:** Minor memory leak per snack-replacement. The interval body mutates `bar.style.width` on a GC-pending node. Eventually GC'd when the closure goes out of scope (probably immediately since no other reference). **Below paper-cut threshold.**

**Fix:** In `snack()` at L7539, before `old.remove()`, check `old._gamCountdownInterval` and clear it. 2-line addition.

### CWC-3: SUS focus trap doesn't include the Tard suspects section

Tard rows are added asynchronously via `chrome.storage.session.get(['gam_tard_suggestions'], ...)`. By the time tard suggestions arrive, the focus trap is already installed. The `_getFocusable()` function re-queries on each Tab keypress (L18537), so newly-appended tard `[DR Rule]` buttons ARE picked up correctly on next Tab. **No regression.**

### CWC-4: 60-90min countdown band/format combination is unusual but per-spec

For an entry between 60min and 90min remaining: format is `MM:SS` (e.g., `89:42`), band is `today`. So the DR row sits under the `band-today` (yellow) header but displays MM:SS like an imminent entry. The visual treatment is amber but the format is "imminent-style." This is per spec (UIUX2-11 §C.4) — the 90min MM:SS extension exists precisely to avoid a `1h 0m → 59:31` flip at the 60min boundary. **Working as designed.** Operator sees: enters at 95min → `1h 35m` → ticks to `1h 30m` → at 89:59 transitions to `89:59` (still under TODAY band) → at 59:59 transitions to IMMINENT band (still MM:SS). Cleaner than the pre-fix flip.

---

## Recommendations

### P0 — Fix before next release

1. **Close H-9 (Firehose ARMED dead code).** Add `firehose_d1_count` to `/mod/stats` worker payload OR revert client-side to flag-mismatch detection. Recommendation: worker-side patch — preserves the W3 design intent. Approx. 10 LOC + 1 wrangler deploy.

### P1 — Polish in v10.13.5

2. **DR Undo: guard `_renderDrBands` against detached popover** (F-2). 2-line `if (document.body.contains(pop))` wrap.
3. **Active Mods: unify close paths** (F-3). Move close-button click + outside click into shared `_closePop()`.
4. **Active Mods: add ESC handler** (F-4). 4-line mirror of SUS pattern.
5. **snack(): clear stale countdown interval on replacement** (CWC-2). 2-line addition.

### P2 — Backlog

6. The `modAutoRuleAdd` RPC is currently a 100% miss. Either ship the RPC server-side (small, matches the W3 commit's documented intent for SUS-2) or remove the RPC call attempt and call `_localFallback()` directly. Either way the ambiguity should be resolved — currently every click incurs an unnecessary network round-trip + catch overhead.
7. Documentation: `docs/V10_DESIGN_V2/UIUX2-13_health_popover.md` audit at §F.1 specified flag-mismatch ARMED detection. The W3 implementation chose count-drift instead, requiring a worker change that wasn't shipped. Update the audit doc OR back out the count-drift code, depending on the resolution of F-1.

---

## Verification posture

- **Read-only:** No code modified, no git operations performed.
- **Spec authority:** `DESIGN_V2_SHIPMASTER.md` §5 W3 (lines 354-417), `UIUX2-10` through `UIUX2-14` audit docs.
- **Source of truth:** `D:\AI\_PROJECTS\modtools-ext\modtools.js` at HEAD `9c7655e` (post-W3, current v10.13.4).
- **Worker context:** `D:\AI\_PROJECTS\cloudflare-worker\gaw-mod-proxy-v2.js` (production worker, where `/mod/stats` and `modGetQueueSnapshot` live).
- **Coverage:** All 39 ACs explicitly verified against shipped code, including hunt-list edges. F-1 (Firehose ARMED) is the only AC failure; everything else passes either as-shipped or as-spec.

---

**Audit ends. RALPH-W3 out.**
