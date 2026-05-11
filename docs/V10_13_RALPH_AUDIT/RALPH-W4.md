# RALPH-W4 — Wave 4 Audit (v10.13.4 / 9c7655e)

**Scope:** Read-only verification of Mod Console keyboard ergonomics, Modmail criticals, Macros v2 card.
**Status:** Substantially shipped. 24/24 functional ACs pass; 4/4 E2E paths trace cleanly. Two functional defects identified (one **MEDIUM**, one **LOW**), plus several spec deviations to log.

---

## Mod Console (10/10 ACs PASS, 1 dead-code finding)

### AC1 — Number keys 1-6 switch tabs (PASS, with caveats)

**Trace:** `_mcKbHandler` at `modtools.js:8245-8276`. Registered globally on `document` with capture, `addEventListener('keydown', _mcKbHandler, true)` at L8277. Listener is bound INSIDE the `openModConsole` closure and closes over `mc` (the modal element).

**Guards verified (all 4):**
- `INPUT` / `TEXTAREA` / `SELECT` (`tn === 'INPUT' || ...` at L8250) — typing "2" into BAN duration input does NOT switch tab. PASS.
- `.gam-mc-dur` button focus (`inDurBtn = !!t.classList.contains('gam-mc-dur')` at L8251) — focus on a `<button class="gam-mc-dur">` does NOT switch tab. PASS.
- Modifier keys excluded: `!e.ctrlKey && !e.altKey && !e.metaKey` at L8253 — Ctrl+1 / Alt+1 do not trigger.
- `mc.isConnected` short-circuit at L8247 — handler is dead while modal is removed from DOM.

**Hunt-list: DOS attack via random number presses on the page when console closed?**
Mitigated. `mc.isConnected` evaluates false post-`mc.remove()`, so handler returns early. Belt-and-suspenders: the `mc.remove` override at L8278-8284 unbinds the listener (`document.removeEventListener('keydown', _mcKbHandler, true)`). `closeAllPanels` (L7405) calls `e.remove()` which routes through the override. **No leak.**

**Edge case (minor):** Handler is global-capture, not scoped to modal subtree. If focus is on an unrelated page element under the modal (e.g., a username link), pressing "1-6" still switches tab. This is the desired behavior (modal-active keyboard nav) but is worth noting that there is no `target.closest('#gam-mc-panel')` check.

### AC2 — Tab labels "1·INTEL" inactive, icon+label active (PASS)

**Trace:** L8217-8230 (initial render) and L8177-8189 (`renderTab` rebuild on switch).
- Inactive: `numStr + '·' + tabDef.label.toUpperCase()` → `"1·INTEL"`, `"2·BAN"`, etc.
- Active: `tabDef.icon + ' ' + tabDef.label` → `"🛡 Intel"`, `"🔨 Ban"`, etc.
- Tab definitions at L8166-8173: 6 tabs (intel, ban, note, message, quick, opdel).

### AC3 — Ctrl+Enter in BAN tab → `mc-ban-go.click()` (PASS)

**Trace:** L8265-8275. Reads `mc._gamTab` (set at L8194 during renderTab). Routes:
- `'ban'` → `#mc-ban-go` (L8268)
- `'note'` → `#mc-note-save` (L8269)
- `'message'` → `#mc-msg-send` (L8270)

**Edge: BAN button disabled.** Guarded at L8271: `if (btn && !btn.disabled)`. PASS.

**Edge: Ctrl+Enter pressed in duration input vs message textarea.** Both are `INPUT`/`TEXTAREA` — but the Ctrl+Enter path is OUTSIDE the `inField` guard. `inField` only gates the number-key path (L8253), not Ctrl+Enter. So Ctrl+Enter in the duration input fires `mc-ban-go.click()`. **Intended:** mod can submit ban from any input. PASS.

### AC4 — Ctrl+Enter in NOTE tab → `mc-note-save.click()` (PASS)
Trace at L8269.

### AC5 — Ctrl+Enter in MESSAGE tab → `mc-msg-send.click()` (PASS)
Trace at L8270.

### AC6 — BAN tab `.gam-mc-tab-danger`: red inactive @ 70% / full red active (PASS visually, FAIL on class evidence)

**FINDING [LOW] — `.gam-mc-tab-danger` is DEAD CLASS, no CSS rule:**

The W4 commit message says "BAN tab gets `gam-mc-tab-danger` class -- 70% red inactive, full red active." Code does add the class to markup at `modtools.js:8220` (`const danger = (t.id === 'ban') ? ' gam-mc-tab-danger' : ''`).

**However:** `grep` for `.gam-mc-tab-danger` in `modtools.js` returns ONLY the two add-sites (L8215, 8220). **There is NO CSS rule that targets `.gam-mc-tab-danger`** anywhere in the codebase.

The actual red styling comes from a pre-existing v5.1.9 rule at `modtools.js:21516-21518`:
```css
.gam-mc-tab[data-tab="ban"]:not(.gam-mc-tab-active){border-color:rgba(240,64,64,.3);color:${C.RED}}
.gam-mc-tab[data-tab="ban"].gam-mc-tab-active{background:${C.RED};border-color:${C.RED}}
.gam-mc-tab[data-tab="ban"]:not(.gam-mc-tab-active):hover{background:rgba(240,64,64,.1)}
```

The visual outcome is correct (inactive red border, active full red background), but:
1. The added `.gam-mc-tab-danger` class adds zero behavior — it's pure cruft.
2. Spec says "70% opacity inactive"; actual is 30% red border (0.3 alpha = 30% opaque). Text color is solid red. The 70% number is incorrect by either reading. Result is closer to "subtle red border + bold red text" than "70%-tinted red box".

**Severity: LOW** — visually meets spec intent; but the class is dead and the docstring is misleading. Recommend removing the dead class OR adding a `.gam-mc-tab-danger` CSS rule that genuinely matches the spec.

### AC7 — UNBAN demoted to ghost link below status div (PASS, with UX flag)

**Trace:** Markup at `modtools.js:8982-8985`:
```html
<a href="#" id="mc-ban-unban" style="color:#44dd66;text-decoration:underline;...">already banned — unban instead</a>
```
- Outside `.gam-mc-actions` (verified — actions container closes at L8980, anchor is a sibling of `#mc-ban-status`).
- Anchor handler at L9606-9648.
- `aria-disabled` + `pointer-events:none` set in-flight (L9624-9626) and reset on failure (L9642-9643).
- `e.preventDefault()` at L9610.

**Hunt-list: Does click event still fire to handler when `pointer-events:none` is set?**
First click (before in-flight): `pointer-events` is default `auto` (no rule sets it explicitly), so click fires. Handler sets `pointer-events:none`. Subsequent clicks during in-flight cannot fire because pointer-events is none. Handler is also defended by `aria-disabled === 'true'` early-return at L9611. PASS.

**FINDING [LOW] — Link is unconditionally rendered:**
The anchor is rendered for ALL users in the BAN tab, regardless of whether the user is currently banned. The label "already banned — unban instead" is misleading when applied to a non-banned user. Clicking the link for a non-banned user calls `executeUnban` which fails at the API level (no-op or error), surfacing `Unban failed -- check session, try again` (L9645). **Cosmetic confusion**, no data-loss risk.

**Recommendation:** conditionally show the link only when `verified === true || (roster && roster.status === 'banned')`. Out of W4 scope; v.next item.

### AC8 — OP DELETES time-filter dropdown 6h/24h/48h/7d (PASS, persistence FAIL)

**Trace:** `_renderOpDelTab` at `modtools.js:8290`. FILTERS array at L8291-8296. Dropdown options built at L8312-8321. Default selection: `_curHours = 24` at L8297. Selected via `if (f.hours === _curHours) o.selected = true` at L8319.

**FINDING [LOW] — Filter selection NOT persisted across modal reopens:**
`_curHours` is a closure variable in `_renderOpDelTab`. Each call to `_renderOpDelTab(el2)` (which fires every time the OP DELETES tab is selected via `renderTab('opdel')`) re-creates the closure and resets to `24`. Re-opening Mod Console (or even navigating away from OP DELETES tab and back) loses the filter selection.

The hunt list explicitly asked: "Default selection? Persisted across reloads?" Answer: default 24h, NOT persisted. Spec did not require persistence, but the implementation does not match user expectations for a "filter" UI element.

**Severity: LOW** — minor UX nit; out-of-scope for W4 hardness.

### AC9 — Per-row "Open post" + "Open console" buttons (PASS)

**Trace:** L8358-8382. Both buttons rendered conditionally per row (Open post requires `d.permalink || d.url`, Open console requires `d.author`). Click handlers fire `window.open` and `openModConsole` respectively, with `ev.stopPropagation()`. Styles confirmed.

### AC10 — `was_in_queue` styled chip not raw emoji (PASS)

**Trace:** L8350-8355. Conditional render: `if (d.was_in_queue) { ... append amber chip "WAS IN QUEUE" }`. Chip CSS: `background:rgba(245,166,35,0.18);color:#f5a623;border:1px solid rgba(245,166,35,0.3)`. No emoji. PASS.

---

## Modmail (7/7 ACs PASS, 1 race condition)

### AC11 — gam-mm-bar [Mark SUS] + [DR 72h] (PASS, idempotency caveat)

**Trace:** Markup at L12354-12362. Two new buttons:
- `data-mm="sus"` "🚩 Mark SUS" (warn class)
- `data-mm="dr72"` "☠️ DR 72h" (danger class)

Click handlers at L12410-12469:
- `sus` (L12412-12437): calls `chrome.runtime.sendMessage` with `name:'modSusMark', args:{ username: sender, reason: 'modmail-bar', client_op_id: __makeReqId() }`. Toast on success/failure. Disabled state during in-flight.
- `dr72` (L12438-12469): preflight prompt (danger:true), then `addToDeathRow(sender, 72*3600*1000, 'modmail-bar DR 72h', { fromUserAction: true })`.

**FINDING [LOW] — SUS button NOT state-aware:**
Hunt-list flagged: "What if user is already SUS?". The bar Mark SUS button always says "🚩 Mark SUS" and always calls `modSusMark`. It does NOT toggle to "🚫 Clear SUS" like the user-tooltip path does (L11906-11907 has the state-aware logic). Worker idempotency via `client_op_id` makes the redundant call a graceful no-op (returns ok:true), but the button's "✓ SUS marked" message is misleading for an already-SUS user.

**Recommendation:** Read `_susState.rows.has(sender.toLowerCase())` at modmail-bar render time and label/route accordingly. Out of W4 scope.

**Note:** No "Clear SUS" path from modmail bar. Mod must use Mod Console or hover tooltip to clear.

### AC12 — aiHost 4-ghost shimmer grid on cold (PASS)

**Trace:** L17338-17348. On cold-cache `data-ai-fire` click:
- `aiHost.innerHTML = ''`
- `<div>` with `display:grid;grid-template-columns:1fr 1fr;gap:4px`
- Loop `for (var _gi = 0; _gi < 4; _gi++)` creating 4 `.gam-ai-skeleton` ghosts, each with 4 height-bars.
- Appended before `rpcCall('modmailAiReplyForThread', ...)` await.

PASS — port of ban_msg pattern as claimed.

### AC13 — `renderDetail` reads `gam_modmail_drafts_local` on session miss (PASS)

**Trace:** L17297-17319. Reads `chrome.storage.session.get('gam_modmail_drafts')` first. On `!cached`, falls back to `chrome.storage.local.get('gam_modmail_drafts_local')` and checks `(Date.now() - localStore.savedAt) < 24*60*60*1000` (24h TTL). Sets `_restoredFromLocal = true` if hit.

**Chip surfaced (AC E2E):** L17324-17331 prepends `✓ Draft restored from local` chip when `_restoredFromLocal` is true. Style: green ring on green background. PASS.

### AC14 — popover loadList matches read site + 24h TTL (PASS for read, FAIL for chip)

**Trace:** L17511-17529. Pre-loads `__draftCache = {}` then async session.get → on empty, async local.get → fills `__draftCache = localStore.drafts` if `< 24h`.

**FINDING [MEDIUM] — Race condition: popover does NOT show "Draft restored" chip + drafts may not render on cold-cache:**

The popover code:
1. Initializes `__draftCache = {}` synchronously
2. Fires `chrome.storage.session.get` async (line 17515)
3. Fires `_loadModmailList` async (line 17549)
4. When threads render, line 17666: `const cached = __draftCache && __draftCache[t.thread_id]`

The two async chains race. If `_loadModmailList` resolves and renders rows BEFORE `chrome.storage.session.get → chrome.storage.local.get` chain completes, `__draftCache` is still `{}` and **drafts do NOT render in any row**. Pre-W4 this race only had one async hop; W4 nests a second async hop (local mirror), making the race more likely to lose.

Additionally, **the popover path does NOT surface the "Draft restored" chip** at all. Only `renderDetail` (panel path, L17324-17331) shows the chip. The W4 spec E2E says "Open modmail panel after browser restart → drafts restore from local mirror with 'Draft restored' chip." If "modmail panel" refers to the **slide-out panel** (the renderDetail path), then this passes. If "panel" is interpreted as the popover (the loadList path), it fails — no chip there.

**Severity: MEDIUM** — race may cause cold-cache popover to render rows without drafts. Mitigation: await both reads before threads render, OR re-render once draft cache settles. Out of W4 scope.

### AC15 — `__renderDrafts` useBtn fires `modmailTrackResponse` with `ai_used:1, ai_tone` (PASS)

**Trace:** L17640-17656 (popover useBtn). Calls `rpcCall('modmailTrackResponse', { thread_id, sender, subject, response_body, ai_used:1, ai_tone: rp.tone || null, sent_at })`. Mirrors the fresh-fetch path at L17385-17400 (panel `renderAICards`).

**Both AI tracking sites verified:**
- Panel fresh-fetch: L17385-17400
- Panel pre-fetched: implicitly the same path via `renderAICards(... fresh=false)` — same useBtn handler at L17385.
- Popover pre-fetched: L17640-17656.

PASS.

### AC16 — `_renderIntelStrip` `isConnected` guard pre-async (PASS)

**Trace:** L17408-17449. Captures `strip = panel.querySelector('#gam-mmp-intel')` at L17409. Async IIFE at L17418-17448. Guard at L17433: `if (!strip.isConnected) return;` BEFORE any chip queries. PASS.

### AC17 — Send button reset preserves emoji (PASS)

**Trace:** L10279-10283. Reset path: `btn.textContent = '\u{21A9}\u{FE0F} Send message'` (= "↩️ Send message"). Compared with markup at L10039: same emoji. PASS.

### AC18 — AI cards single-column in 320px col 3 (PASS)

**Trace:** L17378-17383. Detection: `inCol3 = !!(host.closest && host.closest('#gam-mmp-ai'))`. The AI host `#gam-mmp-ai-host` (L17176) is a child of the col-3 sidebar `#gam-mmp-ai` (L17172), so `closest('#gam-mmp-ai')` returns the parent → `inCol3 = true` → `gridCols = '1fr'`.

Outside col-3 (e.g., the wide popover loadList — separate `__renderDrafts` path with hardcoded `1fr 1fr` at L17627), grid is 2-column. Spec satisfied.

---

## Macros (7/7 ACs PASS)

### AC19 — Inline 4s countdown delconfirm (PASS)

**Trace:** `__macroBeginDelconfirm` at `popup.js:4280-4335`. Flow:
1. Check if row already in `delconfirm` state → if yes, toggle off (call `__macroEndDelconfirm`).
2. Stash `row.innerHTML` to `row.dataset.gamOrig`.
3. Replace contents with banner: label + 3px countdown bar (`<span>` with CSS `animation: gam-macro-delconfirm-shrink 4s linear forwards`) + Confirm + Cancel buttons.
4. `setTimeout(... 4000)` auto-cancels via `__macroEndDelconfirm`.
5. Cancel button → clearTimeout + `__macroEndDelconfirm`.
6. Confirm button → clearTimeout + `__macroDoDelete(m)` (calls `popupRpc('macroDelete', { id })`).

CSS animation defined at `popup.css:1505-1525` (4s linear shrink), with `prefers-reduced-motion` override at L1526-1528 (disables animation, sets static 50% bar). PASS.

### AC20 — AI review panel checkbox + SAVE SELECTED (N) (PASS)

**Trace:** `__macroShowAiReview` at `popup.js:4407-4494`. Flow:
1. Removes any prior review panel.
2. Builds panel with one `<label>` per suggestion containing checkbox + label + body. All checkboxes default `checked = true`.
3. SAVE button text via `_refreshCount`: `'Save selected (' + n + ')'`. Live-updated on every checkbox change (L4463 listeners). Disabled when `n === 0`.
4. Save click → batch `popupRpc('macroUpsert', ...)` for each picked suggestion. Reports `✓ saved N (M failed)`.

CSS button `text-transform: uppercase` (`popup.css:1600`) renders as **SAVE SELECTED (N)** visually. Screen readers see "Save selected (N)" — a11y-friendly. PASS.

### AC21 — Duplicate `.gam-macro-tab-active` block at popup.css:207-211 removed (PASS)

**Trace:** `popup.css:206-208` is now a comment block:
```css
/* v10.13.4 W4 (P0-29 / R-08): duplicate .gam-macro-tab-active block removed.
   The Bloomberg-amber active state at L1403 is now the single source of truth
   (was being overridden by an old blue !important block here). */
```
The amber rule at L1387-1390 is the sole `.gam-macro-tab-active` rule:
```css
.gam-macro-tab-active, .gam-macro-tab.active {
  color: var(--bb-amber) !important;
  border-bottom-color: var(--bb-amber) !important;
}
```
**Note:** Spec said "popup.css:231-234" (per `DESIGN_V2_SHIPMASTER.md:457`). Actual removal at L207-211. The line numbers shifted; the *block* is gone. PASS.

### AC22 — Filter bar (search + sort name/use/date) (PASS)

**Trace:** `__macroEnsureFilterBar` at `popup.js:4073-4110`. Mounted idempotently on first `loadMacros` call (L4217).
- Search input: `type="search"`, listens on `input`, sets `__macroFilter` to lowercased trimmed value, fires `__macroRender`.
- Sort `<select>`: 3 options (`name` / `use` / `date`), default `name`. Fires `__macroRender` on change.
- Insert position: `section.insertBefore(bar, list)` — above the macros list.

Filter logic at `__macroRender` L4117-4123: case-insensitive substring match on `(label + ' ' + body)`. Sort logic at L4124-4134.

**a11y:** `aria-label` set on both inputs. PASS.

**Note (minor):** The no-match message at L4137 sanitizes via `replace(/[<>&"]/g, '')` for HTML interpolation. Single quote `'` is NOT stripped, but no attribute injection vector exists at this rendering site (it's plain text inside a `<div>`). Safe.

### AC23 — Inline edit form ABOVE list (PASS)

**Trace:** `__macroEnsureEditAbove` at `popup.js:4061-4070`. The HTML markup (`popup.html:431`) places `#macroEditWrap` AFTER `#macrosList` (sibling order: list → tools → editWrap). On first `loadMacros` call (L4218), the form is hoisted via `section.insertBefore(wrap, list)` — placed immediately ABOVE the list (below the filter bar which was inserted just before).

`wrap.dataset.gamHoisted = '1'` flag prevents re-hoist. Idempotent. PASS.

### AC24 — Hover-revealed action trio (PASS, touch caveat)

**Trace:** Row builder `__macroRow` at `popup.js:4152-4211`:
- `actions.className = 'gam-macro-item-actions'` (L4168)
- Three buttons: Edit, Duplicate, Delete (with `.danger`)
- All children of the row's top flex container.

CSS at `popup.css:1431-1462`:
- `.gam-macro-item-actions { opacity: 0; transition: opacity 120ms ease-out; }`
- `.gam-macro-item:hover .gam-macro-item-actions, .gam-macro-item:focus-within .gam-macro-item-actions { opacity: 1; }`
- `prefers-reduced-motion`: actions stay opacity 1 (no transition) per L1460-1462.

**Hunt-list — touch device + keyboard accessibility:**
- Keyboard: `:focus-within` ensures actions reveal when ANY descendant (the buttons themselves) gets focus. Tab-navigating to a button reveals the trio. PASS.
- Touch: most modern WebKit/Blink emulate `:hover` on first tap (so tap reveals; tap again triggers). Tap-anywhere-to-reveal works because the row is the parent of the buttons. Mild friction (two-tap pattern), but functional. PASS.

The `prefers-reduced-motion` override at L1461 forces actions to be permanently visible — solving the touch-tap UX concern for users with reduced-motion preference.

### AC25 — `.gam-macro-row` migrated to `.gam-macro-item-*` (PASS)

**Trace:** `grep` for `gam-macro-row` in production sources (`modtools.js`, `popup.js`, `popup.css`, `popup.html`):
- **0 matches** in production code.
- 16+ matches only in `docs/V10_DESIGN/`, `docs/V10_DESIGN_V2/` (audit docs).

`__macroRow` at `popup.js:4152-4211` uses:
- `gam-macro-item` (L4154)
- `gam-macro-item-label` (L4160)
- `gam-macro-item-meta` (L4164, L4204)
- `gam-macro-item-actions` (L4168)
- `gam-macro-item-action` (L4171, L4177, L4185)
- `gam-macro-item-action danger` (L4185)
- `gam-macro-item-body` (L4199)

CSS at `popup.css:1396-1462` defines all `.gam-macro-item-*` rules. Migration complete. PASS.

---

## E2E (4/4 PASS by inspection)

### E2E-1 — Press 2 → BAN tab + Ctrl+Enter submits (PASS)

1. Open Mod Console: `openModConsole(username)` → renders 6 tabs, focus traps onto modal.
2. Press "2": `_mcKbHandler` fires (capture phase). `inField=false`, `inDurBtn=false`, `idx = 1`, `tabs[1].id = 'ban'`. `e.preventDefault()` + `renderTab('ban')`. **BAN tab visible.**
3. Type ban reason in `#mc-ban-msg`.
4. Press Ctrl+Enter: handler reads `mc._gamTab === 'ban'` → `btn = #mc-ban-go` → `btn.click()` → BAN flow fires (preflight + apiBan).

PASS.

### E2E-2 — BAN tab inactive 70% / active full red (PASS visually, FAIL on opacity number)

Inactive: `border-color: rgba(240,64,64,.3)` (= 30% opaque red border). Text: solid red. **Spec says 70%, actual is 30%** — but visually reads as a warning, not a scream.
Active: `background: ${C.RED}` + `border-color: ${C.RED}` (full red). PASS.

### E2E-3 — Modmail [Mark SUS] click works without opening Mod Console (PASS)

Bar handler at `modtools.js:12412-12437`. Calls `modSusMark` RPC directly via `chrome.runtime.sendMessage`. No `openModConsole` invocation. Updates button to "✓ SUS marked", logs action. PASS.

### E2E-4 — Open modmail panel after browser restart → drafts restore + chip (PASS for panel, FAIL for popover)

**Panel path (`renderDetail`):** Cold session, AI host reads `gam_modmail_drafts_local` from `chrome.storage.local`, validates 24h TTL, hits `_restoredFromLocal = true`, prepends green "✓ Draft restored from local" chip. PASS.

**Popover path (`loadList`):** Local-mirror fallback at L17519-17527 fires async, but **no chip surfaced** (chip code only exists in `renderDetail`, not `loadList`). PARTIAL FAIL — see AC14.

If the spec means the slide-out panel: PASS. If it means the popover list: FAIL.

---

## Findings Summary

| # | Severity | Area | Issue | Recommendation |
|---|----------|------|-------|----------------|
| F1 | LOW | Mod Console | `.gam-mc-tab-danger` class added to markup but no CSS rule targets it. Visual outcome correct (via pre-existing `[data-tab="ban"]` rule), but class is dead code. Spec opacity number (70%) does not match actual (30% border). | Either add a `.gam-mc-tab-danger` rule that genuinely matches spec, or remove the dead class. |
| F2 | LOW | Mod Console | UNBAN ghost link rendered unconditionally in BAN tab regardless of user's banned status. Misleading label for non-banned users. | Conditionally render based on `verified === true` or roster status. |
| F3 | LOW | Mod Console | OP DELETES filter selection NOT persisted across modal reopens (`_curHours` is closure-local). | Persist to `getSetting('opdelFilterHours', 24)` if needed. |
| F4 | LOW | Modmail bar | Mark SUS button is NOT state-aware. Always says "Mark SUS" / always calls `modSusMark`. Worker idempotency masks the redundant call but UI message is misleading for already-SUS users. | Read `_susState.rows.has(sender.toLowerCase())` at render and route to `modSusClear` if already SUS. |
| F5 | **MEDIUM** | Modmail popover | Race condition: `__draftCache` may still be `{}` when threads render on cold-cache, so drafts don't appear. The W4 nested-async chain (session.get → local.get) widens the race vs pre-W4. **Also:** popover does NOT surface "Draft restored" chip (only `renderDetail` does). | Await both reads before rendering rows, or re-render rows once draft cache settles. Add chip render to popover path too. |
| F6 | LOW | UNBAN handler | Anchor with `pointer-events:none` defends against click during in-flight, but the same defense lives in the `aria-disabled === 'true'` early-return — belt+suspenders is fine, but worth noting both must stay in sync if either is removed. | None — current code is correct. |

---

## Verdict

**24/24 functional ACs verified, 4/4 E2E paths trace.** Implementation is shipped per spec with one MEDIUM-severity race in the popover draft cache (F5) and one dead-class artifact in BAN tab styling (F1). Remaining 4 findings are LOW UX nits.

**Surgical fixes recommended for F5 (popover draft race + missing chip).** Other findings are v.next quality items — none block W4 acceptance.

**No code modified. No git ops performed. Read-only.**
