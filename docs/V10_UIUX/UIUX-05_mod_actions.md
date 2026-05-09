# UIUX-05 — Mod Actions Audit (Ban / Remove / DR / Triage)
**Auditor:** UIUX-05-MOD-ACTIONS
**Generated:** 2026-05-09
**Source:** `modtools.js` (24 081 lines, v10.6.1+)

---

## A. P0 (broken)

### A.1 toggleWatch undo toast is SILENTLY DEAD on all three call sites
**Severity:** P0 — undo claimed, never fires  
**Lines:** 9574-9576, 10167-10168, 10363-10364

`withUndo` at line 6846 gates the undo slot and toast display on:
```js
if (!result || !result.ok) { return result; }
```
All three toggleWatch `withUndo` invocations pass `Promise.resolve(nw)` (where `nw` is a `boolean`) or `Promise.resolve()` (no argument). A boolean has no `.ok` property — `result.ok` is `undefined`, which is falsy. So the guard always fires and the function returns before mounting the toast or slot. The action executes correctly, but undo is silently unavailable.

- Line 9576: `withUndo(() => Promise.resolve(nw), ...)` — `nw` is `true`/`false`. `.ok` = undefined.
- Line 10168: `withUndo(() => Promise.resolve(), ...)` — result is `undefined`. Guard fires immediately.
- Line 10364: same pattern as 9576.

`Ctrl+Shift+W` global hotkey (line 11213-11221) doesn't use `withUndo` at all — no undo available there, but it's not claimed.

**Impact:** Mod watches or unwatches a user, closes the panel, and has no recovery path. No visual indicator that undo failed. The AF-34 comment "Rule 101" implies undo is wired — it's not.

### A.2 Quick-tab "Remove this content" bypasses withUndo entirely
**Severity:** P0 — undo gap on a destructive action  
**Lines:** 9588-9604

The Quick tab's `q==='remove'` handler calls `apiRemove(id, type)` directly without `withUndo`. The NBA panel REMOVE path (line 5864) correctly wraps with `withUndo` Tier B. The Quick tab never got the same treatment when AF-34 was applied. No undo toast, no recovery.

### A.3 Quick-tab "Perma-ban (no msg)" uses native `confirm()` dialog
**Severity:** P0 — blocks the DOM, bypasses preflight audit chain  
**Lines:** 9606-9623

`confirm(`PERMA-BAN ${username}...`)` is a synchronous browser dialog. It:
- Has no armSeconds countdown (the preflight for perma-ban gets 3s per line 8899).
- Fires `apiBan(username, 0, ...)` with `days=0` directly via `executeBan` — no `withUndo`, no ban-preflight RPC call, no audit chain (`_banAuditId` is never set).
- No undo slot registered.

This is a permanent irreversible action with a one-click confirm that predates every safety rail added to the Ban tab. The label says "cannot be undone silently" but there's no undo at all.

### A.4 Strip "Quick-Remove" dropdown also bypasses withUndo
**Severity:** P0 — undo gap, no toast  
**Lines:** 9868-9882

The action strip's Quick-Remove dropdown (injected on post/comment rows) calls `apiRemove(id, type)` without `withUndo`. NBA REMOVE wraps it; strip REMOVE does not.

### A.5 Ban flow: goBtn never shows "sending..." loading text state
**Severity:** P0 (for the perma-ban path only — operator confusion risk)  
**Lines:** 8912-8940

`goBtn.disabled = true` fires at line 8913 but `goBtn.textContent` is never updated to a "Sending..." state during the ban execution sequence. The status banner (`statusEl.innerHTML`) cycles through "Capturing evidence... → Preflight check... → Sending ban..." but the CTA button itself goes from label → disabled with no visual feedback that it's working. For a 1-3s RTT ban this is minor; on a slow connection it's confusing.

---

## B. P1 (high-friction)

### B.1 Ban modal field count and click path
**Verdict:** Acceptable for a semi-structured workflow; some friction remains.

Fields visible on open: Violation type (dropdown), Subject (text), Team macros (dropdown), Message (textarea), Duration (button strip), Also modmail (checkbox). That's 6 interactive elements before the BAN button.

Minimum click path for a basic 1-day ban:
1. Open Mod Console (click hammer icon / `B` hotkey)
2. Select violation type from dropdown (1 click)
3. Duration auto-selects from violation default — no extra click if default fits
4. Click "BAN Xd" button (1 click)
5. Preflight confirm dialog — click "Confirm" (1 click)
6. Wait for preflight RPC → ban RPC → verify

**Total: 3 clicks + 2 form interactions + ~2-4s async wait.** Acceptable but not fast. The subject/message auto-populate on violation select (line 8658-8670) saves the most friction.

**Missing:** No keyboard shortcut to fire the ban from within the modal without clicking. The `B` hotkey only opens the console; there's no `Ctrl+Enter` to submit.

### B.2 Duration selector: no explicit "Permanent" warning in the button strip
**Lines:** 303, 8207-8210, 8616-8620

The duration button strip renders "Permanent" as the last button (value=-1). Selecting it changes `goBtn` label to "PERMA-BAN (reason sent as message)" and the preflight title to "PERMANENT BAN — Preflight". The preflight dialog does show `armSeconds: 3` for perma. However:

- The duration button itself has no visual distinction beyond being "active" — no red highlight, no warning color on the "Permanent" chip in the strip compared to "Warning Only" or day-based options.
- A mod could slide from "30 Days" to "Permanent" and not register the severity difference at a glance.

**The modmail checkbox dimming on duration=0 (B.5 fix) is correctly implemented** at lines 8632-8644: `modmailCb.disabled = true`, `opacity: 0.4`, unchecks. Verified working.

### B.3 AI ban-summary preview: visibility and flow
**Verdict:** Wired correctly; minor UX friction.

- Wrap (`#mc-ban-summary-wrap`) starts `display:none` in HTML (line 8240). It's unconditionally shown at line 8534 when the ban modal initializes — always visible.
- The static preview `div` is replaced with an editable `textarea` (line 8540). Mod can type/edit it.
- Preview auto-populates after 1.2s debounce when the reason field has 10+ chars (line 8542-8562). This is passive and clear.
- On ban fire, if the textarea has content, it's used as `summary14` directly without a second AI call (line 9027-9028). Correct.
- Fallback chain: mod-edited text → fresh AI call → word-truncation (lines 9027-9044). Clean.

**Friction:** The label ("AI summary (auto-appended to notes after BAN)") is 10px, uppercase, `#9b9892` — small and easy to miss. A mod may not realize this is an editable field they can override before firing.

### B.4 Perma-ban path: UI clearly indicates "permanent"
**Verdict:** Yes, clearly indicated in multiple places.

- `goBtn` label changes to "PERMA-BAN (reason sent as message)" (line 8617).
- Preflight title reads "PERMANENT BAN — Preflight" (line 8897).
- Preflight `danger: true` renders the dialog in danger styling (line 8898).
- `armSeconds: 3` forces a countdown before confirm activates (line 8899).
- The `43800h + permanent:true` is sent only to the preflight RPC (lines 8950, 8957) — not to `apiBan` itself. `apiBan` receives `daysForApi = 0` (line 8944, 8981). This is correct per the GAW API contract (days=0 = perma on the wire).

**Minor concern:** The UI says "PERMA-BAN" at confirm time but the wire payload uses `days=0`. If a mod looks at network traffic or the audit log, the duration recorded is `duration: -1` (internal only). The `43800h` goes only to the worker preflight, not to GAW's native ban endpoint. This is architecturally sound but could confuse anyone auditing logs.

### B.5 Undo toast: timing, positioning, and reachability
**Lines:** 6751-6794

- **Tier A (ban):** 20s window. **Tier B (remove/sticky/watch):** 5s window.
- Position: `bottom:56px; right:16px` — floats above status bar, does not overlap modals.
- Progress bar drains left-to-right as time elapses.
- Undo button auto-focuses on mount (`undoBtn.focus()` at line 6781) — keyboard-reachable immediately.
- `U` key also fires undo without mouse while outside inputs (lines 6810-6820).
- The `+400ms` expire buffer (line 6792) ensures the toast is visible slightly past the slot TTL.

**Friction:** 5 seconds (Tier B) is very tight for remove/sticky on a slow connection. The mod fires the action, the async round-trip takes 1-2s, leaving 3s of real undo time. No explicit Tier B window extension. The toast text does not show the countdown number ("Undo · 4s left") — only the draining progress bar.

**No stacking:** only one undo slot exists (`_undoSlot`). A second action immediately displaces the previous undo slot. The previous undo toast `_undoExpire` timer is never cancelled when replaced — both toasts can be visible briefly, but clicking the old toast's button after `_undoSlot` was replaced calls `_executeUndo` which checks `_undoSlot.clientOpId !== clientOpId` (line 6797) and silently no-ops. Not dangerous but confusing.

### B.6 Triage Console: no j/k row navigation
**Verdict:** Missing entirely.

Searched the full keyboard handler (lines 11164-11270) and the Triage Console section (12484+). No `j`/`k` next/prev binding for `.gam-t-row` exists. The only triage-specific keyboard binding is `Escape` to close the popover (line 11172). For shift-based triage with many users queued this is a real friction point: mod must use mouse to advance through rows.

### B.7 Mod Console discoverability: Ctrl+Shift+M
**Verdict:** Discoverable only from modmail context; not globally documented on-page.

`Ctrl+Shift+M` only fires when `findModmailSender()` returns a sender (line 11233-11236). On a feed page or users page, the shortcut does nothing. The help modal (line 10383) documents `/users` capabilities. The status bar tooltip text says "Mod log + Death Row queue — your action history (Ctrl+Shift+L)" for the log icon. There's no ambient visual affordance that Ctrl+Shift+M opens the console from a feed post — the `B` hotkey is effectively the primary method on feed pages (line 11209), and it requires hovering a post first.

### B.8 toggleWatch: badge update after watch from Quick tab
**Lines:** 9574-9578

After `q==='watch'`, the panel calls `closeAllPanels()` but NOT `injectBadges(true)`. The `injectBadges` call that refreshes the watch eye badge on post rows only happens from the `Ctrl+Shift+W` path (line 11219) and MutationObserver (line 12008). On a static page with no new DOM mutations, the watched badge won't appear until the next page scroll that triggers MutationObserver or a page reload. The mod closes the console and sees no visual confirmation the watch applied.

### B.9 Death Row queue visual states
**Lines:** 4757, 5111-5116, 10093-10113

DR entries only have `status: 'waiting'` in the data model (lines 4757, 5111). "Executed" state is set at line 5116 but `getDeathRowPending()` (line 5111) filters only `status==='waiting'` — so executed entries never appear in the Mod Log DR section. There is no UI for "scheduled" vs "pending execution" distinction (e.g., an entry that's 1 minute from executing vs 72h away looks identical — both show "Executes in X" relative time via `timeUntil`).

No "cancelled" visual state in the queue. When a mod clicks "Cancel" (line 10106), the entry is deleted from storage entirely — it disappears. There's no cancelled/archived state for audit review.

---

## C. P2 (polish)

### C.1 Confirmation dialogs — count and appropriateness
The ban flow has two confirmation layers: the preflight panel (P1) and the `withUndo` toast (post-fire). This is correct for a destructive action. The perma path adds the armSeconds delay. Not over-confirmed.

The Quick-tab perma-ban uses a native `confirm()` (only one layer, no arm) — this is *under-confirmed* for a permanent action (see A.3).

DR "Cancel" button in Mod Log has no confirmation at all — single click removes from queue. Given the undo stack records it, this is acceptable but could surprise mods expecting a "are you sure?"

### C.2 Color coding on action buttons
- BAN button: `gam-btn-danger` (red) — correct.
- Duration = 0: BAN button switches to `gam-btn-accent` (blue) for warning-only — good semantic distinction.
- UNBAN button: green text, neutral background (`#0a0a0b`) — not a standard button class; it's custom-styled inline (line 8235). Lower contrast than it should be.
- Quick-tab buttons: neutral grey grid. No color coding on "Perma-ban" vs "Watch" vs "Remove" — all render identically except for icon color (red warning icon on perma at line 9531 `color:${C.RED}`).

### C.3 Loading states during action firing
Status banner (`#mc-ban-status`) cycles through info/green banners with text. The BAN button itself only disables (`goBtn.disabled = true`) with no text change during the async sequence. Mod can't distinguish "it's working" from "it froze." The button label should change to "Sending..." on click.

### C.4 Toast positioning collision risk
- Snack: `bottom:14px; right:100px` (line 17625 CSS)
- Undo toast: `bottom:56px; right:16px` (line 6757)
- Unban wrap (interim toast at line 6654): `bottom:90px; right:16px`
- Status bar: `bottom:14px; left:50%`

These are stacked vertically and do not collide with each other. Hot Now panel is right-docked and does not block the bottom-right corner. Positioning is clean.

### C.5 Recent action ledger visibility
The Mod Log (Ctrl+Shift+L / `L` hotkey) shows the last 100 log entries with DR queue at the top and action ledger below. The ledger is visible only inside the modal — no ambient "last action" chip on the status bar except for today's ban/remove/msg counts (line 10080-10082). The ledger is not discoverable without knowing the shortcut.

### C.6 Bulk action support status
Batch actions are implemented and shipping in v10.x (not V11 backlog):
- Checkboxes on Triage Console rows.
- Batch toolbar appears when selections exist (line 13040-13067).
- Actions: Watch all / Death Row 72h / Ban all now / Cancel.
- `batchBanUsers` uses `executeBan` sequentially with 1.5s rate-limit delay (line 13085). No withUndo on batch bans.

This is functional but has no undo at all for batch ban. Large-scale destructive action with a single `confirm()` gate.

---

## D. Proposed v10.7 Patches

### Patch 1 — Fix toggleWatch withUndo (all three call sites)
**File:** `modtools.js`  
**Lines to patch:** 9574-9577, 10167-10168, 10362-10364

The root cause is `withUndo` requires `result.ok` to be truthy. `toggleWatch` returns a `boolean`. Wrap the boolean in a fake-ok object.

**Before (line 9574-9577):**
```js
const nw = toggleWatch(username);
withUndo(() => Promise.resolve(nw), { tier: 'B', label: nw ? (username + ' watched') : (username + ' unwatched'), inverse: () => { toggleWatch(username); } });
```

**After:**
```js
const nw = toggleWatch(username);
withUndo(() => Promise.resolve({ ok: true, toggled: nw }), { tier: 'B', label: nw ? (username + ' watched') : (username + ' unwatched'), inverse: () => { toggleWatch(username); } });
```

Apply the same `{ ok: true }` wrapping to:
- Line 10168: `withUndo(() => Promise.resolve(), ...)` → `withUndo(() => Promise.resolve({ ok: true }), ...)`
- Line 10364: same pattern as 9576

### Patch 2 — Wrap Quick-tab `q==='remove'` with withUndo
**File:** `modtools.js`  
**Lines:** 9588-9604

**Before:**
```js
const r = await apiRemove(id, type);
if (r.ok){ logAction(...); snack(...); } else { snack(...); }
```

**After:**
```js
await withUndo(() => apiRemove(id, type), {
  tier: 'B', label: 'Removed ' + type,
  inverse: () => apiApprove(id, type)
});
logAction({ type:'remove', user:username, contentId:id, contentType:type, evidenceKey, source:'mod-console-quick' });
```

### Patch 3 — Replace Quick-tab perma-ban `confirm()` with preflight + withUndo
**File:** `modtools.js`  
**Lines:** 9606-9623

Replace native `confirm()` with the shared `preflight()` helper (same pattern as Ban tab, line 8896). Add `armSeconds: 3` and `danger: true`. Add `withUndo` on `apiBan` call with unban inverse. Register audit chain (`modBanPreflight` → `modBanConfirm`).

### Patch 4 — Wrap strip Quick-Remove with withUndo
**File:** `modtools.js`  
**Lines:** 9868-9882

Same treatment as Patch 2. `apiRemove(id, type)` → `withUndo(() => apiRemove(id, type), { tier:'B', label:'Removed '+v.label, inverse:()=>apiApprove(id,type) })`.

### Patch 5 — goBtn loading text state during ban execution
**File:** `modtools.js`  
**Line:** 8913 (after `goBtn.disabled = true`)

Add: `goBtn.textContent = 'Sending...';`  
Restore on failure paths (lines 8922, 8965, 9006): `goBtn.textContent = <original label per updateGoLabel()>;`

### Patch 6 — Quick-tab Watch: call injectBadges after watch toggle
**File:** `modtools.js`  
**Line:** 9577 (after `closeAllPanels()`)

Add: `try { injectBadges(true); } catch(_) {}`

This ensures the watch badge appears on post rows immediately without waiting for a MutationObserver trigger.

### Patch 7 — Add j/k keyboard navigation to Triage Console rows
**File:** `modtools.js`  
**Location:** keyboard handler section, ~line 11172

After the IS_USERS_PAGE Escape handler, add:
```js
if (IS_USERS_PAGE && !inI) {
  if (k === 'j' || k === 'k') {
    const rows = [...document.querySelectorAll('.gam-t-row')];
    if (!rows.length) return;
    const cur = document.querySelector('.gam-t-row:focus, .gam-t-row.gam-t-row-focused');
    const idx = cur ? rows.indexOf(cur) : -1;
    const next = k === 'j' ? Math.min(idx + 1, rows.length - 1) : Math.max(idx - 1, 0);
    rows[next].focus();
    rows[next].classList.add('gam-t-row-focused');
    if (cur) cur.classList.remove('gam-t-row-focused');
    e.preventDefault();
  }
}
```
Requires `.gam-t-row` to have `tabindex="0"` in the row template.

---

## E. Action Surface Inventory

| Surface | Trigger | Action | withUndo | Undo window | Preflight |
|---|---|---|---|---|---|
| Ban tab — Warning | BAN btn (dur=0) | apiSendModMessage | No | None | preflight() modal |
| Ban tab — Timed ban | BAN btn (dur>0) | apiBan | Yes (Tier A) | 20s | preflight() + modBanPreflight RPC |
| Ban tab — Perma-ban | BAN btn (dur=-1) | apiBan | Yes (Tier A) | 20s | preflight() armSeconds=3 + modBanPreflight RPC |
| Ban tab — Unban | UNBAN btn | apiUnban | No | None | preflight() modal |
| Quick tab — Watch | Watch button | toggleWatch | Yes (broken — see A.1) | 5s (never fires) | None |
| Quick tab — Death Row 72h/96h/7d | DR buttons | addToDeathRow | Yes (System A, Ctrl+Z) | 20s grace | None |
| Quick tab — Perma-ban (no msg) | Perma btn | apiBan | No | None | native confirm() only |
| Quick tab — Remove content | Remove btn | apiRemove | No (see A.2) | None | None |
| Quick tab — DR Sniper | Sniper btn | addToDeathRow (+ rule) | No | None | native confirm() |
| NBA panel — REMOVE | REMOVE btn | apiRemove | Yes (Tier B) | 5s | None |
| NBA panel — SPAM | SPAM btn | apiRemove | Yes (Tier B) | 5s | None |
| NBA panel — STICKY | STICKY btn | apiSticky | Yes (Tier B) | 5s | None |
| NBA panel — APPROVE | APPROVE btn | apiApprove | No | None | None |
| Strip — Quick-Remove | Dropdown item | apiRemove | No (see A.4) | None | None |
| Strip — Ban Author | Ban Author btn | opens Mod Console | N/A | N/A | via Ban tab |
| Triage — Batch ban | Ban all now | executeBan (loop) | No | None | native confirm() |
| Triage — Batch DR | Death Row 72h | addToDeathRow | No | None | None |
| Mod Log — DR Cancel | X button | removeFromDeathRow | Yes (System A, Ctrl+Z) | 20s grace | None |
| Mod Log — Unwatch | X button | toggleWatch | Yes (broken — see A.1) | 5s (never fires) | None |
| Context menu — Watch/Unwatch | Context item | toggleWatch | Yes (broken — see A.1) | 5s (never fires) | None |
| Ctrl+Shift+W | Global hotkey | toggleWatch | No | None | None |

**Click count to fire basic ban (Ban tab):** 3 clicks + violation select (4 interactions total) + ~3s async.  
**Click count to fire DR 72h (Quick tab):** 2 clicks (open console + DR72h button) + 20s grace undo.

---

## F. Hot-Path UX Scoring

Rating scale: 1-10 for "operator can ban a spammer in under 5 seconds with full undo."

| Surface | Score | Rationale |
|---|---|---|
| Ban tab (timed ban) | 6/10 | 4 interactions + preflight dialog + ~3s async. Undo works. Under 5s only if connection is fast. |
| Ban tab (perma-ban) | 7/10 | Same flow plus armSeconds=3 countdown adds safety without friction. |
| Quick tab — DR 72h | 8/10 | 2 clicks, undo via Ctrl+Z, no confirmation dialog. Fast for "watch and wait." |
| Quick tab — Watch | 5/10 | 2 clicks, panel closes immediately, badge doesn't refresh (Patch 6 needed), undo silently broken. |
| Quick tab — Perma (no msg) | 3/10 | 1 click + native confirm() — no undo, no audit trail, no arm delay. Dangerous and under-protected. |
| NBA panel — REMOVE | 8/10 | 1 click from wherever the AI drawer surfaces. 5s undo. Fast. |
| NBA panel — STICKY | 8/10 | Same as REMOVE. |
| Strip — Quick-Remove | 6/10 | 2 clicks (open dropdown + select violation). No undo (Patch 4 needed). |
| Triage batch ban | 4/10 | Multi-select + confirm() + sequential fire. No undo. High risk, low ceremony. |
| Triage j/k navigation | 0/10 | Does not exist. Mouse-only. |

**Overall mod-action UX grade: 6/10.** The core ban flow is solid with preflight + withUndo. The gaps are concentrated in Quick tab (perma-ban ceremony too weak, watch undo broken, remove no undo) and strip (no undo on remove). Three of the four P0s are fixable in under 30 lines each (Patches 1, 2, 4). The j/k navigation gap (Patch 7) is a moderate effort but high daily-use value.
