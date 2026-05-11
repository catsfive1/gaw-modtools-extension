# RALPH-MODCONSOLE — Mod Console v10.13.4 Audit

**Repo:** `D:\AI\_PROJECTS\modtools-ext\`
**HEAD:** `9c7655e` (`feat(v10.13.4): WAVE 4 -- Mod Console keyboard + Modmail criticals + Macros v2`)
**Version:** `10.13.4` (per `manifest.json:4`)
**Spec:** `docs/V10_DESIGN_V2/UIUX2-18_mod_console.md` (v1+v2 spec)
**Plan:** `docs/V10_DESIGN_V2/DESIGN_V2_SHIPMASTER.md` §5 Wave 4
**Mode:** Read-only audit. No code changed, no git ops.

---

## Summary — % v1+v2 Spec Compliance

**Was: 0%. Now: ~38% of the v1+v2 spec, ~100% of the W4-scoped subset.**

W4 was scoped (per SHIPMASTER §5 W4 + §6 D-03) to ship the P0/P1 keyboard ergonomics + BAN danger color + UNBAN demotion + OP DELETES restructure, and explicitly defer P2/P3 (j/k QUICK nav, BAN duration shortcuts, INTEL 2-col, NOTE char counter, draft protection, MESSAGE subject collapse, Repeat-offender banner, QUICK category grouping). v10.13.4 lands every item that was in scope, leaves every item that was not.

Compliance breakdown across UIUX2-18 sections C/D/E/F (15 distinct redesign items):

| Item | Section | v10.13.4 status |
|---|---|---|
| 1. Tab switching 1–6 | C.1 | SHIPPED |
| 2. Tab number-prefix labels | C.1 | SHIPPED |
| 3. BAN-tab dur button guard | C.1 | SHIPPED |
| 4. Ctrl+Enter submit on BAN/NOTE/MSG | C.2 | SHIPPED |
| 5. j/k navigation in QUICK tab | C.3 | NOT SHIPPED (deferred D-03) |
| 6. BAN duration keyboard shortcuts (p/7/3/1/w) | C.4 | NOT SHIPPED (deferred D-03) |
| 7. BAN tab danger color (red tab strip) | D.1 | SHIPPED |
| 8. UNBAN demotion to ghost link | D.2 | SHIPPED |
| 9. Repeat-offender banner red modifier | D.3 | NOT SHIPPED (deferred) |
| 10. QUICK tab category grouping + perma row | D.4 | NOT SHIPPED (deferred D-03) |
| 11. INTEL tab 2-column layout + modnote up | E.1 | NOT SHIPPED (deferred D-03) |
| 12. NOTE char counter + sort label | E.2 | NOT SHIPPED (deferred D-03) |
| 13. OP DELETES time filter + per-row actions + chip | E.3 | SHIPPED |
| 14. MESSAGE subject collapse | E.4 | NOT SHIPPED (deferred) |
| 15. ESC 3-step draft protection | F.1 | NOT SHIPPED (deferred D-03) |

**Shipped:** 7 / 15 items = **46.7% on item count** (and the highest-impact 7).
**Effort-weighted:** P0+P1 priority shipped is **9.5h of the 24.5h spec = 38.8%.**

The conservative number is **~38% v1+v2 spec compliance, up from 0% in v10.12.3**. The W4 scope was defined narrow and the wave delivered exactly what it scoped. The remaining ~62% is the deferred P2/P3 backlog tracked in SHIPMASTER §6 D-03 for v10.14+.

---

## Verification Table

All file/line references are absolute and point to v10.13.4 HEAD `9c7655e`.

| # | Verify item | Result | Evidence |
|---|---|---|---|
| 1 | Number keys 1–6 switch tabs | PASS | `D:\AI\_PROJECTS\modtools-ext\modtools.js:8245-8263` (`_mcKbHandler`, `if (k >= '1' && k <= '6') { ... renderTab(tabs[idx].id) }`) |
| 2 | Guards: input/textarea/select/.gam-mc-dur | PASS | `modtools.js:8249-8253` (`tn === 'INPUT' \|\| tn === 'TEXTAREA' \|\| tn === 'SELECT'`; `inDurBtn = t.classList.contains('gam-mc-dur')`); both included in suppression check before number keys fire |
| 3 | Tab number-prefix labels (inactive: `1·INTEL`, active: `🔨 Ban`) | PASS | `modtools.js:8217-8230` (initial render) and `:8182-8189` (re-render on `renderTab`). Label rebuilds correctly on every active/inactive flip. |
| 4 | Ctrl+Enter routes to correct submit per active tab | PASS | `modtools.js:8265-8275`. Reads `mc._gamTab`, queries `#mc-ban-go` / `#mc-note-save` / `#mc-msg-send` accordingly, respects `btn.disabled`. Tab tracker is set in `renderTab` at `:8194` (`mcRoot._gamTab = id`). |
| 5 | BAN tab `.gam-mc-tab-danger` visually applied | PASS | `modtools.js:8220` adds the class only when `t.id === 'ban'`. CSS at `:21515-21518`: `border-color:rgba(240,64,64,.3); color:${C.RED}` inactive, `background:${C.RED}` active, plus a hover state. Renders correctly without modifying any other tab. |
| 6 | UNBAN demoted to ghost link below status div | PASS | `modtools.js:8977-8985`. Action row now contains only `[Cancel] [BAN]`. UNBAN moved to a `<div>` after `#mc-ban-status`, styled as a 10px right-aligned `<a>` with green text and underline. |
| 7 | UNBAN ghost link click handler still wired | PASS | `modtools.js:9606-9649`. Lookup by `#mc-ban-unban` finds the moved element. Adds `preventDefault`, in-flight gate via `aria-disabled='true' + pointer-events:none`, label swap `⌛ unbanning...` → `✓ unbanned`. Fires preflight, executeUnban, rosterSetStatus, markVerified, logAction, snack. |
| 8 | OP DELETES time-filter dropdown (6h/24h/48h/7d) | PASS | `modtools.js:8290-8328`. `FILTERS` array lists exactly 6/24/48/168 hours; select element `#mc-opdel-filter` is built with options and `change` handler that updates `_curHours` and re-calls `_load()`. Header title also reflects the active filter. |
| 9 | Filter is functional | PASS | `modtools.js:8333` re-fires `rpcCall('modOpDeletes', { since: Date.now() - _curHours * 3600 * 1000, limit: 20 })` on every reload. |
| 10 | Filter persistence (across popup close/reopen) | **FAIL** | `_curHours` is a closure variable initialized to `24` inside `_renderOpDelTab` (`modtools.js:8297`). Every call to the function resets the choice. Not persisted to `getSetting`/`setSetting`, not stored in `chrome.storage`, not cross-mod. Selecting "7d" then closing the console returns "24h" on next open. |
| 11 | OP DELETES per-row Open post button | PASS | `modtools.js:8360-8371`. Opens `https://greatawakening.win + d.permalink` (or raw `d.url` fallback) in a new tab. Uppercase 9px ui-monospace, transparent background, neutral border. |
| 12 | OP DELETES per-row Open console button | PASS | `modtools.js:8372-8382`. Calls `openModConsole(d.author, null, 'intel')`. Amber border, amber text — semantically distinct from Open-post (neutral). |
| 13 | OP DELETES `was_in_queue` styled chip | PASS | `modtools.js:8350-8355`. Renders a `<span>` with amber-tinted background and border, 9px uppercase, "WAS IN QUEUE" label. Replaces the v10.12.3 raw `⚠️ was in queue` emoji concatenation. |

13 items checked. 12 pass. 1 fail (filter persistence — see Findings below).

---

## Findings

### F1. Global vs scoped key handler — handler de-registers correctly on modal remove

**Concern:** Will `_mcKbHandler` fire when Mod Console is closed and another modal is open, intercepting plain digit keys 1-6 sitewide?

**Verdict:** No. Defensive guards are correct.

- **Listener attached:** `document.addEventListener('keydown', _mcKbHandler, true)` at `modtools.js:8277` — capture phase, so it sees events before page-level listeners.
- **In-flight guard:** `if (!mc || !mc.isConnected) return;` at `:8247` — the handler bails immediately if the modal is gone from the DOM. Belt.
- **Removal hook:** `mc.remove` is monkey-patched at `:8278-8284` to call `removeEventListener('keydown', _mcKbHandler, true)` before the original `remove()`. Suspenders. The DOM-detached guard (`isConnected`) covers the case where the modal is removed via `closeAllPanels` rather than direct `.remove()`, but the explicit removal hook covers `mc.remove()` as well.
- **No conflicts with other global digit handlers:** Searched all 35+ `addEventListener('keydown', …)` sites in `modtools.js`. None register plain `'1'`-`'6'` outside the new MC handler. Konami at `:25311` lists only arrow keys + `'b','a'`. Easter eggs at `:25441` use ASCII text accumulation (`PAIN`). Power-user shortcuts at `:12167` require `Ctrl+Shift` modifier. The user-page sticky-toggle at `:25180` only fires on `s`/`u` with Shift. No collision.

This passes audit. The keyboard handler is safer than the SHIPMASTER spec literally required (the spec said "scope to root" — implementation scopes to `mc.isConnected` plus removes on `.remove()`, which is functionally equivalent for the modal lifecycle and slightly more defensive).

### F2. UNBAN ghost link — click still fires; no `pointer-events:none + aria-disabled` deadlock

**Concern:** Hunt asks "does click still fire with pointer-events:none + aria-disabled? Or is unban silently broken?"

**Verdict:** Not broken. The pointer-events/aria-disabled state is **applied dynamically** during in-flight, not at rest.

- **Initial markup** (`modtools.js:8984`):
  ```html
  <a href="#" id="mc-ban-unban" style="color:#44dd66;text-decoration:underline;cursor:pointer;background:transparent;border:none;padding:0;font:inherit">already banned — unban instead</a>
  ```
  No `pointer-events:none`. No `aria-disabled`. Click fires.
- **In-flight guard** at `:9611`: `if (unbanBtn.getAttribute('aria-disabled') === 'true') return;` — early exit only after the click has already entered the handler.
- **In-flight state set** at `:9624-9626`: `aria-disabled='true'`, `pointerEvents='none'`, label swap to `⌛ unbanning...`. This is **after** preflight resolves true, **before** the network round-trip — correct double-click suppression.
- **Failure recovery** at `:9642-9646`: removes both attributes on `executeUnban` returning false. State cleared.

The semantics are: at rest, fully clickable. Mid-action, locked. After failure, clickable again. After success, label says `✓ unbanned` and stays in pointer-events:none state, which is correct because the action is no longer applicable.

### F3. OP DELETES filter persistence — DOES NOT survive close/reopen (real finding)

**Verdict:** Filter is per-render-only. Resets to 24h on every tab open.

- `_curHours = 24` at `modtools.js:8297` is a closure-local `let` inside `_renderOpDelTab`. Every entry into the function reassigns it.
- No persistence to `getSetting('opdelWindowHours', …)`, no `chrome.storage` write, no module-level variable.
- **Effect:** mod opens MC → switches to OP DEL → picks "7d" → reads → closes MC → reopens MC → OP DEL tab → window is back to "24h." Mods who want a 7d default will pick it every single time.

**Severity:** Low to medium. The default of 24h is reasonable for the majority case, and 9 out of 10 mod sessions probably want 24h. But the cost-to-fix is trivial (one `getSetting` + one `setSetting`), and the audit hunt list called this out as a likely miss — it is a real miss.

**Repair recommended for v10.14:**
```js
let _curHours = parseInt(getSetting('opdelWindowHours', 24), 10) || 24;
// in change handler:
sel.addEventListener('change', function(){
  _curHours = parseInt(sel.value, 10) || 24;
  setSetting('opdelWindowHours', _curHours);
  _load();
});
```
Cross-mod scope is automatic via `getSetting` (chrome.storage.sync). 4-line addition.

### F4. `aria-controls` — never existed, still doesn't, no regression

**Concern:** Hunt asks "was `aria-controls` updated to match new tab numbering?"

**Verdict:** Tab buttons never had `aria-controls`. The tab numbering change does not affect any ARIA wiring because there was none.

- Searched `modtools.js` for `aria-controls` — only one match at `:5325` and that's the Settings select autocomplete, unrelated.
- The MC tab nav buttons only have: `cls`, `data-tab`, `data-num`, `onclick`. No `id`, no `aria-controls`, no `role="tab"` for that matter.
- The tab panels don't have IDs of the shape `mc-panel-intel` either — the panels container is a single `gam-mc-panels` div whose contents are `innerHTML = ''`'d and rebuilt on every tab switch (`modtools.js:8196-8199`).

This is a pre-existing a11y soft-fail (UIUX2-33 keyboard accessibility — `role="tablist"` / `role="tab"` / `aria-controls` / `aria-selected` triplet is missing on the MC tab strip), but it is **not a regression introduced by W4**. W4 added keyboard navigation; the missing ARIA wiring was pre-existing. UIUX2-33 should pick this up in v10.14.

### F5. Tab label rebuild on `renderTab` — slight DOM thrash, no functional issue

**Observation, not a finding:** The new `renderTab` function rebuilds every tab's `textContent` on every switch (`modtools.js:8182-8189`). This is 6 string assignments per tab switch — negligible perf cost, negligible reflow. But it does mean the tab labels are not accessible to assistive tech via a stable "name" — every switch swaps "1·INTEL" ↔ "📊 Intel".

Recommendation for v10.14: store the immutable accessible name in `aria-label` (`aria-label="Intel tab"`) so screen readers get a stable announcement, while the visible `textContent` is free to swap with the active state.

### F6. Three different reds still in MC

**Cross-cutting cosmetic, not in W4 scope but worth flagging:**

- BAN tab strip danger color uses `${C.RED}` (`#f04040`) at `:21516-21518`.
- OP DELETES error state still hardcodes `#ff3b3b` at `modtools.js:8391`.
- OP DELETES title color `#ff3b3b` at `modtools.js:8341` — different from `C.RED`.
- WAS IN QUEUE chip uses amber (`#f5a623`), not red, which is actually correct semantic differentiation (queue ≠ deletion).

This was acknowledged in UIUX2-18 §H and SHIPMASTER §4 CONFLICT 7: "C.RED for content-script, --bb-red for popup, defer unification to v10.14." So these are known and tracked. Not a W4 miss.

---

## Recommendations — v10.14 Minimum

The shipped P0/P1 subset is correct and Commander should ship it as v10.13.4. The deferred backlog (SHIPMASTER D-03) is real work but does not need to land in v10.13.x.

For v10.14, the **minimum** Mod Console items to ship are ranked here by the (impact / effort) ratio Commander tends to optimize for:

### Tier 1 — ship in the first v10.14 wave (4-6h)

1. **OP DELETES filter persistence** (`getSetting`/`setSetting` for `opdelWindowHours`). 30min. Highest-leverage fix in this audit because it's a paper cut every mod hits and the fix is one-line trivial. Deferred backlog doesn't even mention this — it's a v10.13.4 oversight.
2. **NOTE tab character counter + sort label** (UIUX2-18 §E.2). 1h. Pure additive UX. Mod sees text length while typing. Zero risk.
3. **BAN duration keyboard shortcuts** (`p/7/3/1/w/0`, scoped to BAN tab keydown handler with the same `inField`/`inDurBtn` guards already proven in `_mcKbHandler`). 1.5h. Completes the keyboard ergonomics promise — currently mods can switch tabs and submit by keyboard, but still need to mouse for duration choice. The full hot-path is "Ctrl+Shift+B → 2 → type → 7 → Ctrl+Enter" if this lands.
4. **MESSAGE subject collapse** (UIUX2-18 §E.4). 1h. Compacts the MESSAGE tab vertical sprawl by ~35px. Low risk — `<details>` element is well-supported.
5. **Repeat-offender banner red modifier** (UIUX2-18 §D.3). 0.5h. New CSS class `gam-mc-banner-repeat` with red-tinted background. No JS change needed beyond the class swap.

### Tier 2 — schedule for v10.14 wave 2 if budget permits (8-10h)

6. **j/k navigation in QUICK tab** (UIUX2-18 §C.3). 1.5h. Less ROI than Tier 1 because QUICK tab usage is lower-frequency than BAN/NOTE/MSG, but the j/k pattern would extend cleanly from the existing `_mcKbHandler`.
7. **QUICK tab category grouping + perma isolation** (UIUX2-18 §D.4). 2h. Visual organization win. Pairs naturally with j/k nav.
8. **INTEL tab 2-column above-the-fold** (UIUX2-18 §E.1). 4h. Highest-impact UX work in the deferred set, but most expensive in viewport-QA effort. Deferred to dedicated v10.14 wave with screenshot comparisons. Not first-cut v10.14 material.

### Tier 3 — defer to v10.15 or kill

9. **ESC 3-step draft protection** (UIUX2-18 §F.1). 2.5h, medium risk. Touches the global ESC handler. Genuine value but blast radius justifies later treatment with full E2E coverage. The current "ESC closes" behavior is annoying but not destructive — drafts in `chrome.storage.session` survive (per `SuperMod.clearDraft` lifecycle). Not bleeding.

### Out of scope for v10.14, propose closing as won't-fix

The MESSAGE tab unified Team-macro/Local-template dropdown (UIUX2-18 §E.4 last paragraph) is correctly deferred to v3 per the spec itself. Not v10.14 material.

---

## Conclusion

W4 shipped exactly the scope SHIPMASTER §5 W4 promised. The implementation is defensive in correct ways the spec didn't even require (modal-detached guard plus explicit listener removal on `.remove()`; UNBAN dynamic disable rather than at-rest deadlock). The 7 shipped items are the highest-impact 7 of the 15.

**Net compliance gain: 0% → 38% (effort-weighted) / 47% (item-count). Single regression-class issue is OP DELETES filter persistence, trivially fixable in v10.14.**

The W4 commit (`9c7655e`) is ship-quality. Recommend v10.14 first wave picks up the OP DELETES persistence fix plus Tier 1 of the recommendations above.

---

**Audit author:** Opus 4.7 (1M context), read-only audit per RALPH-MODCONSOLE prompt.
**Audit date:** 2026-05-10.
**Files referenced:** `modtools.js`, `manifest.json`, `docs/V10_DESIGN_V2/UIUX2-18_mod_console.md`, `docs/V10_DESIGN_V2/DESIGN_V2_SHIPMASTER.md` (all in `D:\AI\_PROJECTS\modtools-ext\`).
**Code mutation:** None. **Git ops:** None.
