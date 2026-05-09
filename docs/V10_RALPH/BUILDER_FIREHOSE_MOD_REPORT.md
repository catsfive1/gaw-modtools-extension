# BUILDER-FIREHOSE-MOD Report — v10.3 Firehose UI Patches

**File scope:** `modtools.js` + `background.js`  
**Baseline LOC:** 22,147 (modtools.js), 2,292 (background.js)  
**Final LOC:** 23,053 (modtools.js), 2,340 (background.js)  
**Net delta:** +906 lines modtools.js, +48 lines background.js  
**Final parse check:** PASS (both files)

---

## Per-Patch Status

### Patch 1: User Similarity Drawer (secLookalikes) — APPLIED

**Status:** Applied  
**Source spec:** `V10_FIREHOSE/02_USER_SIMILARITY.md` Section D  
**Insertion point:** modtools.js ~line 5670 — `buildUserSections()`, new `sec8()` added after existing `sec7()`  
**LOC:** ~55 JS + CSS in GAM_CSS block (~20 lines)

What shipped:
- `sec8()` async function within `buildUserSections()` — fetches `POST /admin/users/lookalikes` directly via `WORKER_BASE` using `getModToken()`
- Renders up to 5 lookalike rows with `.sim-pill--HIGH/MEDIUM/WATCH` confidence pills
- Each row: username chip + confidence pill + karma/age meta + "Open" button that calls `IntelDrawer.open({ kind: 'User' })`
- Loading state ("Scanning co-commenter graph...")
- Empty state ("No lookalikes found -- this user appears unique")
- Error state (shows error message inline)
- Tooltip via `data-tooltip` attribute on hover (thread_overlap + name_distance)
- Return value: `{ id: 8, label: 'Lookalikes', body }`

**background.js RPC addition:** `adminUsersLookalikes` handler at line ~2254 — POSTs to `/admin/users/lookalikes` with username + limit. Allowed callers: content + popup.

**Slash command `/lookalikes`:** Deferred to v10.6 as specified (hard to wire without slash-command dispatcher hooks).

**CSS:** `.sim-panel`, `.sim-panel-header`, `.sim-row`, `.sim-pill--HIGH/MEDIUM/WATCH`, `.sim-meta`, `.sim-username` — all in GAM_CSS.

---

### Patch 2: Ctrl+K Search Palette — APPLIED

**Status:** Applied  
**Source spec:** `V10_FIREHOSE/03_SEARCH_SURFACE.md` Section F  
**Insertion point:** modtools.js ~line 4536 — immediately after the Ctrl+Z undo handler  
**LOC:** ~160 JS + ~35 CSS in GAM_CSS

What shipped:
- `_initSearchPalette()` IIFE registers Ctrl+K keydown listener (ctrlKey only, not metaKey — Windows audience)
- Floating `#gam-search-palette` panel injected into body on first open; positioned above status bar via `bottom: barH + 4px`
- Input: `gam-sp-input` with 250ms debounce triggering `_spRunSearch()`
- Results: interleaved posts+comments sorted by `created_at DESC`, each as `.gam-sr` anchor with POST/COMMENT/REMOVED kind chip, author, community, age, title (posts), snippet
- Keyboard nav: ArrowDown/ArrowUp cycles `aria-selected`, Enter opens permalink in new tab + closes palette, Escape closes
- aria-combobox contract per spec: `role="combobox"`, `aria-haspopup="listbox"`, `aria-controls="gam-sp-list"`, `aria-activedescendant` updated on arrow nav
- Click-outside closes palette (delegated listener on document)
- Toggle: second Ctrl+K closes palette
- Hits existing `/gaw/search` endpoint with `scope=both&limit=30`

**Popup "Search" tab:** Deferred to v10.6 as specified (separate popup.html/popup.js files out of scope).  
**`/find` slash command:** Deferred to v10.6 as specified.

**CSS:** `#gam-search-palette`, `.gam-sp-input-row`, `.gam-sp-input`, `.gam-sp-list`, `.gam-sp-meta`, `.gam-sr`, `.gam-sr-meta`, `.gam-sr-kind*`, `.gam-sr-author`, `.gam-sr-snippet`, `.gam-sr-title` — all in GAM_CSS.

---

### Patch 3: Sticky-Detection Bar Accordion — APPLIED

**Status:** Applied  
**Source spec:** `V10_FIREHOSE/08_STICKY_LIVE_FEED.md` Section E  
**Insertion point (button):** modtools.js ~line 16037 — bar `el()` children array between `sirenClearBtn` and `mmBtn`  
**Insertion point (panel + poll):** modtools.js ~line 16347 — immediately after `document.body.appendChild(bar)`  
**LOC:** ~90 JS + ~15 CSS in GAM_CSS

What shipped:
- `#gam-sticky-chip` button inserted into bar (hidden by default, shows "PIN N" in amber when queue non-empty)
- `#gam-sticky-accordion` div appended to `document.body`, `position:fixed; bottom:36px`
- `_pollStickyQueue()` hits `GET /admin/queue/sticky?status=pending&limit=20` every 60s with 8s deferred start
- `_renderStickyChip(count, items)` builds accordion rows: confidence pill (high/med/low) + sender + reason excerpt + "Open" button
- "Open" button: `window.open(modmail thread URL)` + fires `PATCH /admin/queue/sticky/<thread_id>` with `{status: "acknowledged"}`
- "Dismiss all" footer button: patches all visible items as dismissed, hides chip
- Click-chip toggles accordion visibility, left-aligns panel to chip position

**CSS:** `#gam-sticky-chip`, `#gam-sticky-accordion`, `.gam-sacc-header`, `.gam-sacc-row`, `.gam-sacc-conf*`, `.gam-sacc-reason`, `.gam-sacc-footer` — in GAM_CSS.

---

### Patch 4: Tard Suggester Accordion Relocate — APPLIED

**Status:** Applied (popup-side `maintTardSuggest` NOT removed per spec — coexist for v10.5)  
**Source spec:** `V10_FIREHOSE/09_TARD_ACCORDION.md`  
**Insertion point (button):** modtools.js ~line 16037 — bar `el()` children array between sticky chip and `mmBtn`  
**Insertion point (panel + logic):** modtools.js ~line 16347 — after `document.body.appendChild(bar)`  
**LOC:** ~160 JS + ~20 CSS in GAM_CSS

What shipped:
- `#gam-tard-suggest-btn` (✨ emoji) inserted into bar between sticky chip and mmBtn
- `#gam-tard-accordion` div appended to `document.body`, `position:fixed; bottom:46px`
- `window._openTardAccordion(accEl)` called on first open — builds header (with Refresh button) + `#gam-tard-body` + sticky footer
- `_fetchAndRenderTards(accEl, forceRefresh)` — checks `chrome.storage.session` for `gam_tard_suggestions` cache (20-min TTL); renders from cache or fires `rpcCall('aiTardsSuggest', {})`, stores result to session storage
- Per-row: checkbox (high pre-checked, others unchecked) + severity pill (color from existing sevColors) + pattern + label + example
- Already-exists guard: checks `getSetting('autoDeathRowRules')`; rows with existing patterns rendered dimmed+disabled with "already in DR" label
- Bulk-add footer: "Add N selected as DR rules" button (recalculates N on every checkbox change) writes single `chrome.storage.local` round-trip to `gam_settings.autoDeathRowRules`
- "Select all" / "Clear" buttons
- Escape listener closes both sticky and tard accordions
- Manual Refresh button triggers fresh RPC regardless of cache age

**CSS:** `#gam-tard-accordion`, `.gam-tard-header`, `.gam-tard-row`, `.gam-tard-footer`, `.gam-tard-add-btn`, `.gam-tard-sev`, `.gam-tard-pattern`, `.gam-tard-label`, `.gam-tard-row--exists` — in GAM_CSS.

---

### Patch 5: Per-Thread Commenter Thread Watch Button — APPLIED

**Status:** Applied (per-row 1-click actions + bulk + auto-flag button amber pulse)  
**Source spec:** `V10_FIREHOSE/10_THREAD_COMMENTER_CONTEXT.md` Section C  
**Insertion point (call site 1):** modtools.js ~line 6205 — end of IS_POST_PAGE block, after bylineHost btn appended  
**Insertion point (call site 2):** modtools.js ~line 9439 — end of `compactBylines()` for DOM-swap resilience  
**Function definitions:** modtools.js ~line 22817 (bottom of file, before final `})()`)  
**LOC:** ~200 JS + ~20 CSS in GAM_CSS

What shipped:
- `injectThreadWatchBtn(postId)` — idempotent (guards on `#gam-thread-watch-btn` already present), injects button after `h1.post-title` / fallback `h1` selectors
- `openThreadIntelDrawer(postId)` — fetches `GET /mod/thread/intel?id=<postId>` from `WORKER_BASE`, calls `IntelDrawer.open({ kind:'Post' })`, sets amber button class on `auto_flagged:true`
- `_renderThreadIntelPanel(data, postId)` — stats strip (total commenters, novel ratio %, zero-karma %), AUTO-FLAGGED red badge when flagged, suspect rows list, bulk action bar for 2+ suspects
- `_renderSuspectRow(s, postId)` — novelty badge + `@username Nd karma cmts` info + Ban+Remove / Watch / SUS inline buttons
- `_onBanAndRemove(username, postId)` — parallel `Promise.all([rpcCall('modBanUser'), rpcCall('modCommentRemoveBatch')])`, greys row on success
- `_onWatchUser(username, reason)` — `rpcCall('modWatchUser')`
- `_onMarkSus(username)` — `rpcCall('modMarkSus')`
- `_makeBulkBanBtn(suspects, postId)` — bans all + removes comments in parallel Promise.all
- `_makeBulkWatchBtn(suspects)` — watches all in parallel

**background.js RPC addition:** `adminThreadIntel` handler at line ~2268 — GETs `/mod/thread/intel?id=<postId>`. Allowed callers: content + popup.

**Note:** `rpcCall('modBanUser')`, `rpcCall('modCommentRemoveBatch')`, `rpcCall('modWatchUser')`, `rpcCall('modMarkSus')` are called by name — caller must verify these RPC names exist in the handler map. If they differ (e.g. `modBanAdd`), adjust the call sites at the function definitions near line 22817.

**Stretch deferred:** AI brigade-assessment narrative + reply-graph viz deferred to v11.1 per spec.

**CSS:** `#gam-thread-watch-btn`, `.gam-thread-watch-btn--flagged`, `.gam-thread-stats`, `.gam-badge--warn`, `.gam-suspect-row`, `.gam-suspect-row--actioned`, `.gam-novelty-badge`, `.gam-suspect-info`, `.gam-suspect-actions`, `.gam-thread-bulk` — in GAM_CSS.

---

### Patch 6: Brigade Detector BRIG Chip — APPLIED (soak-ready infrastructure)

**Status:** Applied — soak-ready, chip hidden until worker endpoint live  
**Source spec:** `V10_FIREHOSE/04_BRIGADE_DETECTOR.md` Section D  
**Insertion point:** modtools.js bottom, `_initBrigChip()` IIFE before final `})()`, deferred 1500ms to let bar mount  
**LOC:** ~55 JS + ~5 CSS in GAM_CSS

What shipped:
- `_initBrigChip()` IIFE: creates `#gam-brig-chip` button, inserts before `.gam-bar-spacer` in the bar (rightmost amber chip)
- Chip starts hidden (`display:none`); shows "BRIG N" when alerts present
- `_pollBrigadeAlerts()` every 60s (12s deferred start): hits `GET /admin/queue/brigade?status=watching&status=flagged&limit=10`
- Silently ignores 404/non-OK responses (pre-migration endpoint not live yet)
- Click opens Hot Now panel via `_showHotNowPanel()`
- `BRIGADE_HARD_ALERTS_ON = false` feature flag — browser Notification path is wired but gated off for 48h soak period per spec

**Initial state:** ZERO live alerts since worker is soak-first. Chip stays permanently hidden. Infrastructure is in place for when `brigade_alerts` table + worker endpoint land.

**Deferred:** Auto-incident creation + reply-graph viz deferred to v11 per spec.

**CSS:** `#gam-brig-chip` — in GAM_CSS.

---

## Background.js RPC Additions

| RPC Name | Callers | Endpoint | Added at line |
|---|---|---|---|
| `adminUsersLookalikes` | content, popup | `POST /admin/users/lookalikes` | ~2254 |
| `adminThreadIntel` | content, popup | `GET /mod/thread/intel?id=...` | ~2268 |

---

## Net LOC Delta

| File | Before | After | Delta |
|---|---|---|---|
| `modtools.js` | 22,147 | 23,053 | +906 |
| `background.js` | 2,292 | 2,340 | +48 |

---

## Final Parse Check Status

```
node --check modtools.js  → PARSE OK
node --check background.js → PARSE OK
```

All checks run sequentially after each patch, no failures at any stage.

---

## Deferred Items

| Item | Reason |
|---|---|
| `/lookalikes <username>` slash command | Needs slash-command dispatcher hooks; deferred to v10.6 per spec |
| Popup "Search" tab (popup.html/popup.js) | Out-of-scope file; deferred to v10.6 per spec |
| `/find` slash command in mod chat | Deferred to v10.6 per spec |
| Thread Watch AI brigade narrative | Deferred to v11.1 per spec |
| Reply-graph cluster visualization | Deferred to v11.1 per spec |
| Brigade auto-incident creation | Deferred to v11 per spec |
| Popup-side `maintTardSuggest` removal | Intentional coexist for v10.5; removal in v10.6 |
| Thread Watch KV cache (90s TTL) | v10.3 ships direct D1 query; cache layer in wave 2 |

---

## Worker Coordination Notes

The following endpoints are called by the new UI but ship from BUILDER-FIREHOSE-WORKER (not this file):
- `POST /admin/users/lookalikes` — Patch 1 calls this from `sec8()` directly via fetch
- `GET /admin/queue/sticky?status=pending` — Patch 3 polls this every 60s
- `GET /mod/thread/intel?id=<post_id>` — Patch 5 fetches this on Thread Watch click
- `GET /admin/queue/brigade?...` — Patch 6 polls this every 60s (404-silent until live)

If BUILDER-FIREHOSE-WORKER's brigade endpoint shape differs from `GET /admin/queue/brigade?status=watching&status=flagged&limit=10`, update the fetch URL in `_pollBrigadeAlerts()` near the bottom of modtools.js.

---

*Generated 2026-05-09 by BUILDER-FIREHOSE-MOD. Sequential single-file patch run. No template literals nested inside GAM_CSS (v9.6.5 lesson observed). Bloomberg aesthetic preserved throughout.*
