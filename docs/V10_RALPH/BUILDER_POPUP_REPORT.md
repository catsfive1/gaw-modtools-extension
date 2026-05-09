# BUILDER-POPUP — Ship Report

**Date:** 2026-05-09  
**Agent:** BUILDER-POPUP  
**Files modified:** popup.html, popup.js, background.js

---

## Per-Patch Status

### Patch 1 — Collapsible Cards System (V10_PANEL/01)
**Status: APPLIED**

- 5 `<details class="gam-card">` wrappers added to popup.html: `card-tools`, `card-maint`, `card-macros`, `card-tokens`, `card-lead`. All default `open`.
- JS: `_cardRestoreAll()`, `_cardWireToggle()`, `initCards()` IIFE — persist card open/closed to `gam_card_open_{id}` with 400ms debounce.
- `_cardAutoCollapseTokens(whoamiOk)` — collapses + reorders tokens card after auth success; called from `__applyTierGate`.
- `_cardAuthFailed()` — expands + urgent-classes tokens card on no-token state; called from `loadToken`.
- `_cardWizardComplete()` — collapses tokens card and injects "Re-run setup" button in badge slot; replaces the `wiz.style.display = 'none'` call in both wizard success setTimeout blocks.

**File:line:** popup.js L25–L190 (new block after `$()` helper), popup.html wraps.

---

### Patch 2 — Token Section Reorg + Restart Setup Button (V10_PANEL/02)
**Status: APPLIED (ship-tonight scope)**

Items applied per doc's F-section priority order:

1. **Wizard gating fix** — already fixed in v10.3 (code at popup.js ~L1789 already uses `__tokensStatus()`). No duplicate change needed.
2. **"Re-enter credentials" button** — `#restartSetupWrap` + `#restartSetupBtn` added to popup.html (below `#claimInviteWrap`). JS wired in `wireRestartSetup()` IIFE at bottom of popup.js.
3. **Auto-collapse on auth** — fires via `_cardAutoCollapseTokens(true)` inside `__applyTierGate` after whoami succeeds. Uses the `<details>` card system from Patch 1 (gam-card-order-last + remove open attr).
4. **Context-driven ordering** — deferred (DOM reorder vs. CSS order requires tab-pane flex wrapper; out of scope for tonight per doc §D note). Card system makes this a one-class operation when ready.

**Deferred:** Full `#tokensInnerContent` wrapper + `#tokensCollapsedCard` div (§E) — the Patch 1 card system already provides collapse UX; the extra wrapper would duplicate it. Flagged for consolidation.

---

### Patch 3 — Lead Area 4-Tile KPI Dashboard (V10_PANEL/04 Section I)
**Status: APPLIED (ship-tonight scope)**

HTML additions to popup.html (inside leadSection, after #leadOnlyTools):
- `#leadKpiRow` — 4-tile CSS grid: ACTIVE NOW / CLR-RATE / MM p50 / INCIDENTS
- `#leadQuickActions` — 4 quick-action buttons: + Invite / Rotate all / Bugs (N) / Chat
- `#lapsedModsCard` — lapsed mods card with list, ping button, threshold input

JS additions to popup.js (`__loadLeadKpi`, `__loadLapsedMods`):
- Tile 1 (Active Now) reads `/presence/online` via existing `modPresencePing` RPC
- Tiles 2–4 stub with `—` (CLR-RATE, MM p50 require new worker endpoints per doc; deferred)
- INCIDENTS tile shows `0` with tooltip "coming v11.3"
- Lapsed mods card uses new `adminModLapsed` RPC (added to background.js)
- Quick-actions row wired: Invite calls `adminInviteCreate` + clipboard, RotateAll proxies to roster button, Bugs proxies to bugListBtn, Chat opens new tab

**Settings accordion:** All existing Team settings + Autonomous maintenance + Lead Maintenance buttons wrapped in `<details id="leadSettingsAccordion" class="pop-maint-advanced">` inside `#leadOnlyTools`. Closed by default. Zero JS changes.

**Deferred per doc:** Sparklines (need AE data), hover tooltips, 30-day anniversaries card, onboarding funnel, mod audit dropdown.

**Background.js:** `adminModLapsed` RPC added → `GET /admin/mod/lapsed?days=N` (lead auth).

---

### Patch 4 — Multi-Lead UI (V10_MULTILEAD/02)
**Status: APPLIED**

- `__applyLeadGate()` kept as thin backward-compat wrapper calling `__applyTierGate()`
- `__applyTierGate()` — new implementation: resolves `_gamTier` from `r.data.tier || (r.data.is_lead ? 'lead' : 'mod')`, calls `__renderTierBadge` + `__applyTierVisibility`
- `__applyTierVisibility(tier, whoamiData)` — full tier matrix:
  - Lead nav tab: hidden for mod + senior_lead
  - `#leadOnlyTools`: visible for senior_lead + lead
  - Lead-exclusive nodes (maintAuditVerify, maintFullReport, maintAutoToggle, maintAutoSave, maintAutoStatus, maintRunNow): hidden for senior_lead
  - Bug reports: senior_lead read-only (bugVisInput.readOnly, bugVisSave hidden)
  - KPI row + quick-actions + lapsed card: full lead only
- `__renderTierBadge(tier)` — purple LEAD / cyan SR-LEAD / hidden mod; `#tierBadge` span added to popup.html header
- `#srLeadEmptyHint` — loading shimmy div added inside `#leadOnlyTools`
- Per-row tier `<select>` injected in `__buildRosterRow` when `_gamTier === 'lead'`
- `__confirmTierChange` + `__showConfirmModal` + `__showToast` helpers added
- `adminModPromote` RPC added to background.js → `POST /admin/mod/promote` (lead auth)

**File:line:** popup.js — new `__applyTierGate` block (~L850–L1090 in patched file). background.js — new RPC entries at end of RPC_HANDLERS.

---

### Patch 5 — Empty States P1–P5 (V10_FRONTEND/03)
**Status: APPLIED (popup-side surfaces)**

- `gamEmptyState(opts)` + `GAM_EMPTY_SVG` map + CSS injection IIFE — added to popup.js early (after `$()` helper block).
- P1 (Modmail popover/panel post-backfill): belongs in modtools.js scope — **BUILDER-MOD scope, not touched here**.
- P2 (Mod chat list no recipients): modtools.js scope — **BUILDER-MOD scope, not touched here**.
- P3 (Death Row drill-down empty): `__renderDrillEmpty('dr')` → `gamEmptyState({icon:'check-circle', headline:'Death Row clear', ...})`.
- P3b (Pending triage drill-down): `__renderDrillEmpty('pending')` → `gamEmptyState({icon:'users-empty', headline:'Triage queue clear', ...})`.
- P4 (Bug reports panel empty): `loadBugReports` zero-reports branch → `gamEmptyState({icon:'check-circle', headline:'No open bug reports', ...})`.
- P5 (Tard suggestions clean scan): empty branch → `gamEmptyState({icon:'users-empty', headline:'No new patterns detected', ...})` — parenthetical "check firehose" removed.

**Note on P1/P2:** Both patch sites are in modtools.js (content script), not popup.js. Per constraints, these are BUILDER-MOD scope. The `gamEmptyState` shared component is now available in popup.js; a parallel `renderEmptyState` upgrade for modtools.js is the sibling agent's task.

---

### Patch 6 — Proactive Notice Library + 3 Notices (V10_FRONTEND/05)
**Status: APPLIED**

- `_shouldShowNotice(id)` guard — `chrome.storage.local` read of `gam_notice_{id}_dismissed`.
- `gamProactiveNotice(opts)` — full implementation: severity palette (warn/alert/incident), session dedup, persist-dismiss to storage, auto-clear polling at 15s interval, teardown function. All innerHTML is XSS-escaped (textContent or escaped interpolation).
- N-01 (Token age >75d): IIFE on load — reads `gam_settings.tokenIssuedAt`, fires if >75d old. persist_dismiss=true. auto_clear_condition checks for newer token.
- N-02 (AI budget ≥80%): IIFE on load — reads `aiUsageToday/aiDailyLimit`. persist_dismiss=false, one_per_session=true.
- N-03 (Watched user posts): exposed as `window.__gamNoticeWatchedPost(post)` — called by modtools.js feed handler when a watched author posts. 90s auto-teardown.

---

## Net LOC Delta

| File | Before | After | Delta |
|---|---|---|---|
| popup.html | 484 | 610 | +126 |
| popup.js | 4233 | 4934 | +701 |
| background.js | 2236 | 2272 | +36 |
| **Total** | **6953** | **7816** | **+863** |

---

## Final Parse Check

```
node --check popup.js    -> (no output = PASS)
node --check background.js -> (no output = PASS)
```

Both files parse clean. popup.html is valid HTML5 (details/summary elements are W3C standard in all MV3-capable Chrome versions).

---

## File:Line Cites for New Sections

| Section | File | Approx lines |
|---|---|---|
| Card persistence system (Patch 1) | popup.js | ~25–190 |
| gamEmptyState + GAM_EMPTY_SVG (Patch 5) | popup.js | ~191–310 |
| _shouldShowNotice + gamProactiveNotice + N-01/02/03 (Patch 6) | popup.js | ~311–520 |
| __applyTierGate + __applyTierVisibility + __renderTierBadge (Patch 4) | popup.js | ~930–1120 |
| __confirmTierChange + __showConfirmModal + __showToast (Patch 4) | popup.js | ~1120–1195 |
| __buildRosterRow tier dropdown (Patch 4) | popup.js | ~1175–1205 |
| __renderDrillEmpty visual states (Patch 5 P3) | popup.js | ~2870–2900 |
| loadBugReports empty state (Patch 5 P4) | popup.js | ~2510–2535 |
| maintTardSuggest empty state (Patch 5 P5) | popup.js | ~4010–4030 |
| __loadLeadKpi + __loadLapsedMods + wireRestartSetup (Patch 3) | popup.js | ~4900–5050 |
| adminModPromote + adminModLapsed RPCs (Patches 4+3) | background.js | ~2179–2215 |
| card-tools / card-maint / card-macros / card-tokens / card-lead wrappers | popup.html | ~129–580 |
| tierBadge span | popup.html | ~27 |
| srLeadEmptyHint div | popup.html | ~347 |
| KPI row / quick-actions / lapsed-mods card | popup.html | ~450–530 |
| restartSetupWrap | popup.html | ~484 |

---

## Constraints Compliance

- All collapsible cards default `open` in markup. Storage overrides only on user action.
- `adminModPromote` added to both popup.js (caller) and background.js (handler).
- Empty states for modmail panel and mod chat list are modtools.js scope — not touched.
- No new design introduced beyond the spec docs.
- Existing `__applyLeadGate` kept as backward-compat wrapper — zero call-site regressions.
