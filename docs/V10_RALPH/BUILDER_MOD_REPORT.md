# BUILDER-MOD Report — V10 Ship-Tonight Feature Patches

**Agent:** BUILDER-MOD
**Date:** 2026-05-09
**Files modified:** `modtools.js` (primary), `background.js` (Patch 2 RPC handler)
**Final parse check:** PASS (both files)
**Net LOC added (modtools.js):** ~790 (original 21,357 -> 22,147)

---

## Per-Patch Results

### Patch 1: Repeat-Offender Halo (V10_FIREHOSE/06) ✅

**Status:** Applied
**LOC added:** ~70 JS + 7 CSS lines
**Files:** `modtools.js`

**Insertions:**
- `sec1()` replacement: `modtools.js:5420–5510` — full rewrite with halo logic, history toggle, pAudit async populate
- CSS added after `.gam-drawer-note-ts` rule (~line 16155): `.gam-repeat-halo`, `.gam-repeat-badge`, `.gam-repeat-label`, `.gam-repeat-history`, `@keyframes gam-halo-pulse`, `.gam-repeat-halo--pulse`

**Key decisions:**
- Used `profile.priorBans` from existing `pProfiles` fetch (zero extra network cost)
- pAudit fallback populates history list rows with existing `.gam-drawer-note-row` CSS
- Pulse class removed after 700ms via setTimeout
- `banned` variable fallback NOT wired (sec2 runs concurrently; pAudit is already awaited there, not accessible from sec1 scope without race) — `banCount` falls back to 0 if `priorBans` is null, which means halo only fires when worker returns the field. Correct per spec: "preferred future state is Cat2 item #23."

---

### Patch 2: Activity Timeline sec7() (V10_FIREHOSE/01) ✅

**Status:** Applied
**LOC added:** ~110 JS (sec7 fn) + 17 CSS lines + 12 lines in background.js
**Files:** `modtools.js`, `background.js`

**Insertions:**
- `background.js:1132–1143` — `modGawTimeline` RPC handler (after `modPresencePing`)
- `modtools.js:5579–5673` — `async function sec7()` before the `return [...]` statement
- Return updated: `modtools.js:5674` — now `return [sec1(), sec2(), sec3(), sec4(), sec5(), sec6(), sec7()]`
- CSS: `.gam-at-wrap`, `.gam-at-header`, `.gam-at-spark`, `.gam-at-spark-bar`, `.gam-at-row`, `.gam-at-time`, `.gam-at-kind-p`, `.gam-at-kind-c`, `.gam-at-title`, `.gam-at-removed`, `.gam-at-meta`, `.gam-at-score-pos`, `.gam-at-score-neg`, `.gam-at-more`

**Note:** Worker `handleGawUserTimeline` patch (honoring `since`/`limit` params) is BUILDER-WORKER scope. sec7 will receive default 30-row response until worker is patched; this works per spec ("assume default 30/50 row response works").

---

### Patch 3: Hot Now Panel (V10_FIREHOSE/05) ✅

**Status:** Applied
**LOC added:** ~120 JS (_showHotNowPanel + _closeHotNowPanel) + 23 CSS lines
**Files:** `modtools.js`

**Insertions:**
- `modtools.js:15340` — SIREN button title updated: `"click to open mod log"` → `"click for Hot Now triage"`
- `modtools.js:15341` — handler swapped: `openModLog` → `_showHotNowPanel`
- `modtools.js:15385` — dynamic title update also patched
- `modtools.js:9960` — added `if(k==='t'){ e.preventDefault(); _showHotNowPanel(); return; }` (Ctrl+Shift+T)
- `modtools.js:9054–9186` — `_showHotNowPanel()` + `_closeHotNowPanel()` functions inserted after `openModLog()` close
- CSS added: `#gam-hot-now-panel`, `.gam-hn-open`, `.gam-hn-header`, `.gam-hn-title`, `.gam-hn-close`, `.gam-hn-body`, `.gam-hn-section`, `.gam-hn-section-hdr`, `.gam-hn-sep`, `.gam-hn-row`, `.gam-hn-user`, `.gam-hn-reason`, `.gam-hn-count`, `.gam-hn-act`, `.gam-hn-act-danger`, `.gam-hn-footer`, `.gam-hn-footer-link`

**Sections shipped:** SUS Users (Section 1) + Death Row Ready/Pending (Section 2) + footer link. Modmail section (F1 stretch) deferred per spec.

---

### Patch 4: Custom Canned Response Memory (V10_BUGS/02) ✅

**Status:** Applied
**LOC added:** ~200 JS across 6 insertion points
**Files:** `modtools.js`

**Insertions:**
- `modtools.js:7413` (after msgIn assignment) — ban tab restore IIFE
- `modtools.js:7619` (after ban tab macroUse RPC) — `_recordMacroDraftBase` IIFE + input listener attachment
- `modtools.js:8097` (after ban tab clearDraft) — `_clearMacroDraft` IIFE + `_maybeSuggestPromote` kick
- `modtools.js:8308` (after body assignment) — msg tab restore IIFE
- `modtools.js:8354` (after msg tab macroUse RPC) — `_recordMacroDraftBase` IIFE (mm_reply) + input listener
- `modtools.js:8491` (after msg clearDraft) — `_clearMacroDraft` IIFE (mm_reply)
- `modtools.js:21230–21290` — `_showDraftChip()` + `_maybeSuggestPromote()` helpers (inside SuperMod IIFE before `attachDraftPersistence`)
- `modtools.js:21882` — exposed on SuperMod public API: `_showDraftChip`, `_maybeSuggestPromote`

**Note:** The restore IIFEs call `SuperMod._showDraftChip` indirectly. Since `_gamPromptMacro` presence is checked with `typeof === 'function'` guard, auto-promote degrades gracefully if that helper doesn't exist in scope.

---

### Patch 5: Right-Click Universal Context Menu v0 (V10_V11/01) ✅

**Status:** Applied (user surface only per Section E spec)
**LOC added:** ~55 JS + 13 CSS lines (net; old handler removed)
**Files:** `modtools.js`

**Replacements:**
- `modtools.js:9290–9350` — old `gamContextMenu` / `closeGamContextMenu` / full contextmenu handler REPLACED with new `_gamCtxMenu` / `_gamCloseCtx` / Bloomberg-style router (user surface only)
- Old CSS rules (5 lines) at `gam-ctx-menu`, `gam-ctx-head`, `gam-ctx-item`, `gam-ctx-item:hover`, `gam-ctx-sep` REPLACED with expanded Bloomberg ruleset (13 lines): adds `gam-ctx-item--danger`, `gam-ctx-item--lead`, `gam-ctx-label`, `gam-ctx-kbd`, `gam-ctx-kbd kbd`

**Behavior preserved:** Open Console, Ban, Watch/Unwatch, Copy username, Open GAW profile (same as old menu). DR72 + Note + Message items removed per v0 spec (user surface only, Bloomberg items). Keyboard parity (Shift+F10) explicitly deferred to v10.4 per doc.

**CSS fix:** `content:'\25C6'` (octal escape — illegal in template literal) replaced with literal `'◆'` character.

---

### Patch 6: Modmail 3-column Panel (V10_V11/03) ✅

**Status:** Applied
**LOC added:** ~65 JS + 0 CSS (layout via inline styles per existing panel pattern)
**Files:** `modtools.js`

**Modifications:**
- `modtools.js:14857` — `panel.style.cssText` now computes width dynamically: `920px` at `>=1280px`, `680px` below
- `modtools.js:14858–14900` — `panel.innerHTML` restructured to 3-col body: `#gam-mmp-list` (240px, `#0f1114`), `#gam-mmp-center` (flex:1, `#181b20`) containing `#gam-mmp-intel` strip + `#gam-mmp-detail`, `#gam-mmp-ai` (320px, `#111318`, hidden at <1280px) containing `#gam-mmp-ai-host`
- `modtools.js:15016` — **aiHost querySelector bug fix**: `detail.querySelector('#gam-mmp-ai-host')` → `panel.querySelector('#gam-mmp-ai-host')`
- `modtools.js:14993–15006` — `renderDetail` `detail.innerHTML` cleaned: removed stale `<div id="gam-mmp-ai-host"></div>` (now lives in col 3); added `_renderIntelStrip(t)` call
- `modtools.js:15125–15165` — `_renderIntelStrip(t)` function added (async, reads `gam_user_intel_<username>` from session storage, falls back to `getUserSummary` RPC)
- `modtools.js:14958` — thread row min-height: `min-height:48px` added
- `modtools.js:14966–14968` — active rail upgraded: `2px` → `3px`, `rgba(255,153,51,0.12)` → `0.10`, `paddingLeft:10px` → `9px`

---

### Patch 7: Universal Undo Middleware (V10_V11/05) ✅

**Status:** Applied — client-side pilot (ban action only)
**LOC added:** ~130 JS
**Files:** `modtools.js`

**Insertions:**
- `modtools.js:6067–6200` — full undo infrastructure: `_undoSlot`, `_undoTimer`, `_setUndoSlot()`, `_getUndoSlot()`, `_gamUndoAnnounce()`, `_showUndoToast()`, `_executeUndo()`, global U-key handler (registered once), `withUndo()` async wrapper
- `modtools.js:8176–8196` — `apiBan` call wrapped with `withUndo(...)` (Tier A, 20s, "Banned {username}", inverse calls `rpcCall('modUnban', ...)`)
- `modtools.js:8262` — existing `showBanUndoToast(username)` call commented out (would double-toast; `withUndo` shows its own)

**Server-side deferred:** `pending_undo` D1 table (migration 034) + `POST /mod/op/undo` endpoint are BUILDER-WORKER scope. Client inverse currently calls `rpcCall('modUnban', ...)` directly as local fallback.

**SR/accessibility:** `_gamUndoAnnounce()` uses `role="alert"` aria-live region. Undo button receives focus on toast mount.

---

## Deferred Items

| Item | Reason | Scope |
|---|---|---|
| Worker `handleGawUserTimeline` `since`/`limit` params | BUILDER-WORKER scope | Background |
| Modmail section in Hot Now Panel (Section 3) | Marked as stretch/F1 in doc | v10.4 |
| Brigade alerts section in Hot Now Panel (Section 4) | Requires Feature 4 (brigade detector) | Post-F4 |
| Right-click keyboard parity (Shift+F10) | Explicitly deferred to v10.4 per doc | v10.4 |
| `pending_undo` D1 table + `/mod/op/undo` endpoint | BUILDER-WORKER scope | Background |
| Undo cascade to remove/bulk-remove/DR-add/sticky | v10.5 per doc | v10.5 |
| `gam_users.ban_count` denormalized column (halo backend) | Cat2 item #23, migration 046 | Wave 2 |

---

## Final Parse Check

```
node --check modtools.js   -> PASS (exit 0)
node --check background.js -> PASS (exit 0)
```

Total modtools.js: 22,147 lines (+790 from 21,357)
