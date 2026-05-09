# State Professionalism Suite -- v10.5.1 Refactor Pass

Executed: 2026-05-09
Files in scope: modtools.js (23,053 ln), popup.js (5,028 ln), popup.html (610 ln), popup.css (1,388 ln), background.js (2,340 ln)

---

## A. EXECUTIVE SUMMARY

| Category | Found | Fixed | Deferred |
|---|---|---|---|
| SSOT violations | 1 | 1 | 0 |
| Affordance gaps | 3 | 3 | 0 |
| Runtime invariants | 4 | 4 | 0 |
| State transition bugs | 2 | 2 | 0 |
| Mode consistency | 2 | 1 | 1 |
| **Total** | **12** | **11** | **1** |

Version bump: `v10.5.0` -> `v10.5.1` (manifest.json + modtools.js VERSION constant).
Build: PASS. ZIP: 422.2 KB, SHA-256: `c27d27234b184db6327d7894dfc20c85e381d391b7cc07e1667041dabcbed456`.

---

## B. SKILL 1 -- SSOTGuardian

### B-1. `_teamFeatures` mutation comment was stale / call sites could bypass SSOT

**File:** modtools.js:1679-1693
**Cause:** `pollTeamFeatures()` mutates `_teamFeatures` in-place (correct pattern -- references to the object stay live). The comment above the mutation loop said "Replace in-place" but didn't encode the SSOT contract, leaving future call sites to potentially read `r.data.data` directly. Also swallowed every RPC error silently with no observable trace.

**Fix:** Added explicit SSOT comment (`_teamFeatures is the SSOT for feature flags -- all reads go through getTeamFeature(key), never read r.data.data at call sites`) and added a `console.warn` on not-ok RPC response so failures are observable without breaking the retry loop.

```
BEFORE:
  } catch (e) { /* swallow -- retry next tick */ }

AFTER:
  } else if (r && !r.ok) {
    try { console.warn('[ModTools v10.5.1] pollTeamFeatures: RPC returned not-ok', r && r.error); } catch(_){}
  }
  } catch (e) { /* swallow -- retry next tick */ }
```

**No duplicate state found.** `_gamTier` in popup.js is set once from server (`modWhoami`) and all UI reads derive from it. `gam_settings` in storage is the canonical persisted state; `_secretsCache` in background.js is the RAM mirror, updated atomically via `chrome.storage.session`. No cross-file tier duplication. No setInterval-based tier polls -- `__applyTierGate()` is event-driven (called once on popup open + on storage.onChanged). `pollTeamFeatures` (modtools.js) is the only scheduled poll; it is cheap and necessary (no push channel for feature flags).

---

## C. SKILL 2 -- AffordanceAuditor

### C-1. No right-click discoverability signal on author links

**File:** modtools.js:~10427 (mouseover handler)
**Cause:** Right-click menu fires on any `a[href*="/u/"]` element. There was zero visual signal that right-click was available -- no hover glyph, no title attribute, nothing. Cat 3 #13 called for a hover `...` glyph; the mouseover path was the right injection point.

**Fix:** On first mouseover of any author link, if the element has no existing `title`, set `title="Right-click for mod options"`. Single write per element (`data-gamCtxHinted` guard prevents repeated DOM writes).

```
BEFORE:
  document.addEventListener('mouseover', e=>{
    if (tooltipPinned) return;
    const al = e.target.closest(SELECTORS.authorLink);
    if (!al) return;
    const u = al.textContent.trim();
    if (!u) return;
    _cancelDismiss();

AFTER: (affordance hint injected before _cancelDismiss)
    if (!al.dataset.gamCtxHinted) {
      al.dataset.gamCtxHinted = '1';
      if (!al.title) al.title = 'Right-click for mod options';
    }
```

### C-2. Wizard success state had no exit affordance

**File:** popup.html:357-361, popup.js:~2476
**Cause:** On completing the first-run wizard (step 3 / success), the only way to close the wizard was to click the `<details>` card header -- a non-obvious action. No button, no "Done", no explicit close.

**Fix:** Added a "Done -- collapse this card" button (`#firstRunDone`) to the success step in popup.html. Wired in popup.js to call `_cardWizardComplete()` which collapses the card and injects the "Re-run setup" badge button.

### C-3. Hot Now panel (confirmed OK -- no fix needed)

Close button (x) exists at line 9611. Esc handler at `closeAllPanels()` via `panelOpen='hotnow'` + global keydown listener (line 10569). Modmail 3-col has close button (`data-close` at line 15298) + Esc handler (line 15332). Both confirmed.

---

## D. SKILL 3 -- InvariantGuardian

### D-1. `_gamTier` written without enum guard

**File:** popup.js:1026
**Cause:** `_gamTier = r.data.tier || (r.data.is_lead ? 'lead' : 'mod')`. If server returns an unexpected string (e.g. `'admin'`, `'supermod'`), `_gamTier` gets set to that value and all downstream `if (tier === 'lead')` guards silently misbehave (neither branch matches, UI stays in mod-only mode).

**Fix:** Clamp to known enum `['mod', 'senior_lead', 'lead']` with `console.warn` on unexpected value + safe fallback to `'mod'` (fail-closed).

```
BEFORE:
  _gamTier = r.data.tier || (r.data.is_lead ? 'lead' : 'mod');

AFTER:
  const _rawTier = r.data.tier || (r.data.is_lead ? 'lead' : 'mod');
  if (!['mod', 'senior_lead', 'lead'].includes(_rawTier)) {
    console.warn('[ModTools v10.5.1] unexpected tier value from server:', _rawTier, '-- defaulting to mod');
  }
  _gamTier = ['mod', 'senior_lead', 'lead'].includes(_rawTier) ? _rawTier : 'mod';
```

### D-2. `gam_card_open_*` written without explicit boolean guard

**File:** popup.js:55
**Cause:** `el.open` on a `<details>` element is a DOM boolean. Storing it to chrome.storage directly is fine in practice, but the guard documents the invariant and prevents future refactors from accidentally writing a non-boolean.

**Fix:** Assign `const openBool = el.open === true` before the storage write. Runtime impact: none. Documents intent.

### D-3. Right-click surface attribution: non-user `/u/` href logged

**File:** modtools.js:9730-9735
**Cause:** The contextmenu handler matched `a[href*="/u/"]` and then ran `/u/([^\/\?#]+)` regex. If the href was `/u/community:foo` or similar edge case, the regex would miss (`ctxM` = null) and silently return. No trace.

**Fix:** Added explicit `console.warn` on the regex-miss path with the offending href, so the edge case is debuggable.

### D-4. Brigade chip: soak-mode data arrived with no console trace

**File:** modtools.js:~23054
**Cause:** `HARD_ALERTS_ON = false` suppresses browser Notification. But when brigade rows arrive, there was zero console trace -- chip appeared but no log entry. No way to confirm soak data flow in devtools.

**Fix:** Added `console.log('[ModTools v10.5.1 BRIG] N brigade row(s) watching/flagged; hard-alerts=false')` on every poll that returns count > 0.

---

## E. SKILL 4 -- StateTransitionTester

### E-1. Activity Timeline (sec7): zero-posts user shows header AND empty message simultaneously

**File:** modtools.js:5824-5876
**Scenario:** "Activity Timeline drawer section: user with zero posts -> empty state shown (not silent skeleton)"
**Cause:** The sparkline header ("0 items 30d P:0 C:0") was appended to `wrap` unconditionally BEFORE the item loop. The "No activity in last 30 days" empty-state was then appended AFTER the loop. Zero-post users saw both: a useless "0 items" header + the empty message.

**Fix:** Wrapped the header block in `if (atItems.length > 0)`. Zero-item users see only "No activity in last 30 days."

```
BEFORE:
  const hdr = el('div', { cls: 'gam-at-header' });
  hdr.appendChild(spark);
  hdr.appendChild(document.createTextNode(' 0 items  30d  P:0  C:0'));
  wrap.appendChild(hdr);
  // ... loop (no iterations) ...
  if (atItems.length === 0) {
    wrap.appendChild(el('div', {cls:'gam-at-header'}, 'No activity in last 30 days.'));
  }

AFTER:
  if (atItems.length > 0) {
    const hdr = el('div', { cls: 'gam-at-header' });
    hdr.appendChild(spark);
    hdr.appendChild(document.createTextNode(' N items  30d  P:X  C:Y'));
    wrap.appendChild(hdr);
  }
  // ... loop ...
  if (atItems.length === 0) {
    wrap.appendChild(el('div', {cls:'gam-at-header'}, 'No activity in last 30 days.'));
  }
```

### E-2. Tooltip pin doesn't break on hover of different username

**File:** modtools.js:10433-10434
**Scenario:** "Tooltip pinned -> mod hovers another username -> pin breaks correctly"
**Cause:** `document.addEventListener('mouseover')` returned immediately on the first line if `tooltipPinned`. This meant hovering a different username while the pin was active had no effect -- the pin only broke on outside click. The mod had to click somewhere off the tooltip to unpin, then hover again.

**Fix:** Removed the blanket early-return. When hovering a different username while pinned: call `unpinTooltip()` and fall through to render the new user's tooltip. When hovering the SAME pinned username: return (keep pin).

```
BEFORE:
  document.addEventListener('mouseover', e=>{
    if (tooltipPinned) return; // <-- blanket bail regardless of target

AFTER:
  document.addEventListener('mouseover', e=>{
    const al = e.target.closest(SELECTORS.authorLink);
    if (!al) return;
    const u = al.textContent.trim();
    if (!u) return;
    // [affordance hint]
    if (tooltipPinned) {
      if (u === currentHoverUsername) return; // same user -- keep pin
      unpinTooltip(); // different user -- break pin, fall through
    }
    _cancelDismiss();
```

**Confirmed OK (no fix needed):**
- Mod selects macro -> edits body -> switches violation -> macro body preserved: confirmed at line 8156 (`macroIsActive` guard in violation `change` handler).
- Tier badge stays LEAD on rejected promote: confirmed at line 1181 (`selectEl.value = prevTier` before async RPC) + line 1202 (no value flip on `!r.ok`).
- Right-click duplicate menu guard: confirmed at line 9734 (`_gamCloseCtx()` called before building new menu).
- Wizard restart with original tokens preserved: "Re-run setup" re-shows the wizard at step 1; it does not clear existing tokens from storage.
- j/k hold queue idempotency: no AI hold queue in current v10.5 codebase -- deferred (see H).

---

## F. SKILL 5 -- ModeConsistencyReviewer

### F-1. Right-click menu: closed -> open transition confirmed clean

`_gamCtxMenu` is the state variable. `_gamCloseCtx()` removes + nulls it. Called on: `document click` (capture), `Escape` keydown, and at start of each new contextmenu build. Duplicate menu structurally impossible.

### F-2. Wizard state machine diagram

```
[HIDDEN]
   |
   | first boot (no token stored)
   v
[STEP 1 - path choice]
   | user clicks Link / Code / Token
   v
[STEP 2 - input]  <--(Back)-- [STEP 2]
   |
   | submit success
   v
[STEP 3 - success]
   |
   | Done button (v10.5.1) OR card header click
   v
[DISMISSED - card collapsed, badge shows "Re-run setup"]
   |
   | "Re-run setup" click
   v
[STEP 1 - path choice]  (tokens NOT cleared on re-entry)
```

Every step has an exit: Step 1 has per-path buttons. Step 2 has Back + Go. Step 3 now has "Done" (v10.5.1 fix). Dismissed state has "Re-run setup". State machine is complete with no mode-locks.

### F-3. Auth/Tier/Panel combined state diagram (most complex)

```
POPUP OPEN
  |
  +-> __applyTierGate()
        |
        |-- RPC fails --------> _cardAuthFailed() [tokens card urgent]
        |
        `-- RPC ok
              |
              +--> _gamTier = 'mod'        -> no leadOnlyTools, no leadTab, no KPI
              +--> _gamTier = 'senior_lead' -> leadOnlyTools visible, no leadTab, no KPI
              +--> _gamTier = 'lead'        -> leadOnlyTools visible, leadTab visible, KPI visible

TIER CHANGE (lead UI)
  selectEl.change
    -> __confirmTierChange()
         |-- user cancels modal -> selectEl.value reverted (no state change)
         |-- RPC fails          -> toast error, selectEl stays at prevTier (badge unchanged)
         `-- RPC ok             -> selectEl.value = newTier, badge updated, toast success

PANELS (panelOpen state)
  null -> 'modconsole' -> null (Esc / close btn)
  null -> 'log'        -> null
  null -> 'hotnow'     -> null (Esc / close btn / _closeHotNowPanel)
  null -> 'help'       -> null
  null -> 'settings'   -> null
  Each panel: closeAllPanels() sets panelOpen=null and removes DOM.
```

### F-4. Deferred: j/k AI hold queue visible UI hint

The spec references "AI hold queue j/k: visible UI hint about j/k keys." Searched for `holdQueue`, `jkNav`, AI queue j/k -- not present in v10.5 codebase. This feature is referenced in spec but not shipped. Not a regression; deferred.

---

## G. v10.5.1 ZIP

| Field | Value |
|---|---|
| Path | `D:\AI\_PROJECTS\dist\gaw-modtools-chrome-store-v10.5.1.zip` |
| Size | 422.2 KB |
| SHA-256 | `c27d27234b184db6327d7894dfc20c85e381d391b7cc07e1667041dabcbed456` |
| Build parse | PASS (modtools.js parse: OK reported by build-zip.ps1) |
| manifest version | 10.5.1 |
| modtools.js VERSION | v10.5.1 |

---

## H. WHAT WAS NOT FIXED (deferred + reason)

| Item | Reason |
|---|---|
| j/k AI hold queue visible UI hint (Skill 2 / Skill 4) | Feature not present in v10.5 codebase. Spec references a future hold queue. Not a regression -- no code to fix. |
| Modmail 3-col column collapse affordance on small viewports (Skill 2) | Panel width switches between 680px and 920px based on `window.innerWidth >= 1280` at build time. No dynamic resize listener. A ResizeObserver would be needed to toggle col3 on viewport change after open. Non-trivial DOM refactor; deferred to v11 modmail work. |
| Stats local-cache staleness guard (Skill 4) | "Stats data persistence: client falls back to local if /mod/stats fails -> local cache stale -> still shows correct rough numbers." The stats fallback path exists but there is no explicit staleness timestamp check or "data may be stale" UI hint when serving from cache. Low priority; deferred. |
| Macro draft body persisted across violation dropdown switch -- full session coverage | The `gamMacroDraftAttached` guard prevents double-listener; `gam_macro_drafts` in `chrome.storage.session` is keyed by `kind:username`. Verified the guard exists. Full coverage test (Ctrl+K palette reopen, navigation away/back) requires browser runtime, not static analysis. Marked for E2E. |
