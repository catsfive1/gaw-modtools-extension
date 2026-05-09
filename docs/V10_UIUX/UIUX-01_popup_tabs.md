# UIUX-01 — Popup Tab System Audit
**Auditor:** UIUX-01-POPUP-TABS
**Generated:** 2026-05-09
**Scope:** popup.html (full, 681 lines), popup.js (wireTabNav IIFE L2796–2900, TAB_MAP, setTab, detectInitialTab), popup.css (L749 `.pop-tab-hidden`, L1441–1459 v10.6.1 hotfix, L913 Bloomberg `!important` overrides)

---

## A. P0 — Maintenance + #macrosSection leakage on Tokens tab (Commander reported)

### Root cause: `<details class="gam-card">` wrapper elements have NO `data-tab` attribute and are not caught by any TAB_MAP selector

This is the single architectural flaw behind every recurrence of this bug.

**The v10.x card refactor** wrapped all content sections in `<details class="gam-card">` collapsible cards:
- `popup.html:139` — `<details class="gam-card" id="card-tools" open>` — wraps all Tools content
- `popup.html:163` — `<details class="gam-card" id="card-maint" open>` — wraps all Maintenance content
- `popup.html:298` — `<details class="gam-card" id="card-macros" open>` — wraps all Team Macros content
- `popup.html:337` — `<details class="gam-card" id="card-tokens" open>` — wraps Team Token + Wizard + Lead card + claimInviteWrap
- `popup.html:400` — `<details class="gam-card" id="card-lead" open>` — wraps Lead token section + KPI row + quick actions + lapsed mods card

None of these six `<details>` elements are tagged by TAB_MAP. The TAB_MAP at `popup.js:2797–2804` targets child elements *inside* the cards:

```js
// popup.js:2797–2804
const TAB_MAP = {
  stats:  ['.pop-stats', '#pop-drill', '.pop-alert', '#dr-alert', '#firstrun-banner'],
  tokens: ['#claimInviteWrap', '.pop-token:not(#macrosSection):not(#leadSection)'],
  tools:  ['.pop-actions', '#macrosSection', '.pop-tools', '.pop-section-label',
           '.pop-maint', '#maintRosterStalenessPanel', '#bugListPanel',
           '#maintReportsPanel', '#maintTardSuggestPanel', '#maintStickyScanPanel'],
  lead:   []
};
```

The tagging loop at `popup.js:2806–2814` sets `el.dataset.tab` on matched children, but the `<details>` parent containers stay untagged. `setTab()` at `popup.js:2823` then selects `[data-tab]:not(.pop-tab)` — which only finds the tagged children, never their containing `<details>` cards.

**What happens when user switches to Tokens tab:**

`setTab('tokens')` hides everything with `data-tab !== 'tokens'` and shows everything with `data-tab === 'tokens'`. The `.pop-maint` div at `popup.html:181` gets tagged `data-tab="tools"` and gets `pop-tab-hidden` applied. BUT its parent `<details id="card-maint">` has no `data-tab`, so `setTab()` never touches it. The `<details>` element remains fully visible. The browser renders it, displaying:

1. The `<summary>` header: "🔧 Maintenance" (popup.html:166)
2. All direct children of `.gam-card-body` that also escaped the tagging — specifically `#maintWarningBanner` (popup.html:175), which has no class matching any TAB_MAP selector and never gets tagged.
3. The `.pop-maint` container itself is hidden by the class toggle — BUT because the `<details>` parent is open and visible, the card chrome (header + empty body) still appears.

**Why `#macrosSection` is fully visible on Tokens tab (not just the card header):**

`#macrosSection` is at `popup.html:308` with class `pop-token`. The TAB_MAP tokens selector `'.pop-token:not(#macrosSection):not(#leadSection)'` explicitly excludes it from being tagged `tokens`. The tools TAB_MAP selector `'#macrosSection'` tags it `tools`. So on `setTab('tokens')`, `#macrosSection` gets `pop-tab-hidden`.

HOWEVER — `#macrosSection` is a `pop-token`-classed element, and the v10.6.1 hotfix at `popup.css:1453` is:
```css
.pop-token.pop-tab-hidden { display: none !important; }
```
That should work for `#macrosSection` itself. The bug is that its parent `<details id="card-macros">` (popup.html:298) is **also** not tagged and remains visible. When the `.gam-card-body` child is rendered by the browser, the `#macrosSection` inside *should* be hidden. But there is a second issue:

**`#card-macros` contains `<details class="gam-card" id="card-macros" open>`**. The `open` attribute means the browser renders the full body. Since `#macrosSection` has `data-tab="tools"` and gets `pop-tab-hidden` applied, the CSS rule `.pop-token.pop-tab-hidden { display:none !important }` should suppress it. This part of the hotfix is structurally correct.

**The visible Maintenance content is the real smoking gun.** The `<details id="card-maint" open>` at `popup.html:163` has its `.pop-maint` child correctly hidden (tagged `tools`, hotfix covers `.pop-maint.pop-tab-hidden`). But the `<summary>` at `popup.html:164` ("🔧 Maintenance") and the `#maintWarningBanner` div at `popup.html:175` are NOT tagged. `#maintWarningBanner` has class `pop-maint-banner` — not in any TAB_MAP selector, not covered by any hotfix chained selector. The `<details id="card-maint">` card header plus any child that missed the tagging loop renders visibly.

**Similarly for `#card-tools`:** The `<details id="card-tools" open>` at `popup.html:139` has its inner `.pop-section-label` divs (L146, L152), `.pop-tools` divs (L147, L153), and the crawl status div `#crawlStatus` (L158) tagged as `tools`. The `<summary>` header "Tools" at L140 is untagged. On non-tools tabs the card summary remains visible.

**For `#card-macros`:** Team Macros card at popup.html:298. The `#macrosSection` (L308, class `pop-token`) gets tagged as `tools` and hidden. The `<summary>` at L299–303 ("📝 Team Macros") is not tagged. Card header leaks on non-tools tabs.

**Exact lines causing the visible Maintenance + Macros on Tokens tab:**

| Element | popup.html line | class | data-tab assigned? | Visible on Tokens tab? | Why |
|---|---|---|---|---|---|
| `<details id="card-maint">` | L163 | `gam-card` | NO | YES — full card element | No data-tab, setTab() never touches it |
| `<summary>` inside card-maint | L164 | `gam-card-head` | NO | YES | Child of visible parent |
| `#maintWarningBanner` | L175 | `pop-maint-banner` | NO | YES (if non-empty) | Not in any TAB_MAP selector |
| `.pop-maint` | L181 | `pop-maint` | YES (tools) | Correctly hidden | Tagged, hotfix covers it |
| `<details id="card-macros">` | L298 | `gam-card` | NO | YES — full card element | No data-tab, setTab() never touches it |
| `<summary>` inside card-macros | L299 | `gam-card-head` | NO | YES | Child of visible parent |
| `#macrosSection` | L308 | `pop-token` | YES (tools) | Should be hidden (hotfix) | Tagged, `.pop-token.pop-tab-hidden` covers it |
| `<details id="card-tools">` | L139 | `gam-card` | NO | YES | No data-tab |
| `<summary>` inside card-tools | L140 | `gam-card-head` | NO | YES | Child of visible parent |

**Why the v10.6.1 hotfix did not fix this:**

The hotfix (popup.css:1441–1459) addressed the Bloomberg `!important` override problem for elements that *were already tagged* with `data-tab`. It correctly chained `.pop-stats.pop-tab-hidden`, `.pop-maint.pop-tab-hidden`, etc. to win specificity fights. But it never addressed the **untagged `<details class="gam-card">` wrapper elements** — the architectural issue introduced by the v10.x card refactor that the tagging loop in wireTabNav was never updated to cover.

**The fix:**

Two options; Option A is cleanest.

**Option A (HTML, surgical):** Add `data-tab` attributes directly to each `<details class="gam-card">` in popup.html. The JS `if (!el.dataset.tab) el.dataset.tab = tab` guard at popup.js:2810 will skip re-tagging, but the CSS hide via `[data-tab].pop-tab-hidden` at popup.css:1457 will cover them.

```
popup.html:139 — change:
  <details class="gam-card" id="card-tools" open>
  to:
  <details class="gam-card" id="card-tools" data-tab="tools" open>

popup.html:163 — change:
  <details class="gam-card" id="card-maint" open>
  to:
  <details class="gam-card" id="card-maint" data-tab="tools" open>

popup.html:298 — change:
  <details class="gam-card" id="card-macros" open>
  to:
  <details class="gam-card" id="card-macros" data-tab="tools" open>

popup.html:337 — change:
  <details class="gam-card" id="card-tokens" open>
  to:
  <details class="gam-card" id="card-tokens" data-tab="tokens" open>

popup.html:400 — change:
  <details class="gam-card" id="card-lead" open>
  to:
  <details class="gam-card" id="card-lead" data-tab="lead" open>
```

`#card-tokens` tagging as `tokens` will cause a conflict with the leadSection special-case (which also needs to appear on the tokens tab). This is handled: `setTab()` at popup.js:2835–2844 explicitly manages `#leadSection` visibility outside the main loop, so `#leadSection`'s parent `#card-lead` being inside `#card-tokens`'s body is fine — the `#card-tokens` div being visible or not controls the outer shell, and `#leadSection` being a `pop-token`-classed element inside is managed by the special-case code.

Wait — `#card-lead` is actually nested INSIDE `#card-tokens`'s `.gam-card-body` (popup.html:400 is at indentation inside the `</div><!-- /.gam-card-body tokens -->` block that closes at L635). If `#card-tokens` is tagged `tokens` and `#card-lead` is tagged `lead`, then on the Tokens tab: `#card-tokens` shows, `#card-lead` gets hidden. But `#card-lead` contains `#leadSection` which the special-case shows. This creates an impossible state — `#card-lead` hidden but `#leadSection` inside it shown; the hidden parent wins, so `#leadSection` disappears.

**The nesting is the structural contradiction.** The card layout embeds one card inside another (card-lead inside card-tokens), which breaks single-`data-tab` assignment. This is why the special-case handling in JS exists, but it only handles the leaf element (`#leadSection`) not the intermediate wrapper (`#card-lead`).

**Option A (revised) — tag the gam-card containers that don't span multiple tabs:**

```
popup.html:139 — <details class="gam-card" id="card-tools" data-tab="tools" open>
popup.html:163 — <details class="gam-card" id="card-maint" data-tab="tools" open>
popup.html:298 — <details class="gam-card" id="card-macros" data-tab="tools" open>
```

For `#card-tokens` (L337) and `#card-lead` (L400): do NOT add `data-tab` because the JS special-case already manages their content children directly. Instead, extend the special-case in `setTab()` to explicitly manage these two card wrappers:

In popup.js, inside `setTab(name)`, after the leadSection special-case block (after popup.js:2852), add:

```js
// Card wrappers that span multiple tabs — manage explicitly
const cardTokens = document.getElementById('card-tokens');
const cardLead = document.getElementById('card-lead');
if (cardTokens) {
  if (name === 'tokens') {
    cardTokens.classList.remove('pop-tab-hidden');
  } else {
    cardTokens.classList.add('pop-tab-hidden');
  }
}
if (cardLead) {
  if (name === 'lead') {
    cardLead.classList.remove('pop-tab-hidden');
  } else {
    cardLead.classList.add('pop-tab-hidden');
  }
}
```

**Option B (JS-only, no HTML changes):** Extend the TAB_MAP to include the card IDs as selectors, and remove the gam-card IDs from the tokens/lead special-case. Requires restructuring the HTML nesting of card-lead out of card-tokens body.

**Option A (card IDs in HTML + JS explicit management) is the recommended fix.** Minimum diff, no HTML nesting change required.

---

## B. P0 — Other element leakage (every element-vs-expected-tab mismatch)

### B.1 — `.pop-tools` inside `#leadOnlyTools` (inside `#leadSection`) tagged as `tools`, not `lead`

`popup.html:426` and `popup.html:434`: two `<div class="pop-tools">` elements inside `#leadOnlyTools` inside `#leadSection`. These match the TAB_MAP tools selector `'.pop-tools'` and get tagged `data-tab="tools"`.

The guard `if (!el.dataset.tab) el.dataset.tab = tab` at popup.js:2810 prevents overwrite — but ONLY if these elements are encountered AFTER `#leadSection` gets tagged. Since `lead: []` means no lead tagging happens, these `.pop-tools` inside `#leadOnlyTools` end up tagged `tools`. On the Lead tab, `setTab('lead')` hides them (they're `data-tab="tools"`), but the leadTools special-case shows `#leadOnlyTools`. The `.pop-tools` children inside `#leadOnlyTools` are hidden by `[data-tab="tools"].pop-tab-hidden` even though `#leadOnlyTools` is shown.

**Result:** "Generate invite link" button (L427) and "Mod rotation roster" button (L435) inside `#leadOnlyTools` are HIDDEN on the Lead tab because they carry `data-tab="tools"` and `setTab('lead')` hides them.

**Expected:** These should not have any `data-tab` assignment (they are protected by the `#leadOnlyTools` parent's visibility). Fix: add explicit exclusions to the tools TAB_MAP `.pop-tools` selector, or process lead content after tools to prevent the cross-tag.

Same problem applies to:
- `popup.html:449` — `.pop-tools` (Flag expiry row) inside `#leadSettingsAccordion` inside `#leadOnlyTools` — tagged `tools`
- `popup.html:462` — `.pop-tools` (Bug reports) — tagged `tools`
- `popup.html:470` — `.pop-tools` (Bug vis config) — tagged `tools`
- `popup.html:519` — `.pop-tools` (Autonomous maintenance toggle) — tagged `tools`
- `popup.html:532` — `.pop-tools` (Maintenance reports list) — tagged `tools`

And `.pop-section-label` divs inside `#leadSettingsAccordion`:
- `popup.html:448` — "Team settings" label — tagged `tools`
- `popup.html:461` — "Bug reports" label — tagged `tools`
- `popup.html:481` — "🔧 Maintenance (lead)" label — tagged `tools`
- `popup.html:518` — "🤖 Autonomous maintenance (Llama)" label — tagged `tools`

And `.pop-maint` at `popup.html:482` inside `#leadOnlyTools` — tagged `tools`.

All of these elements are inside `#leadOnlyTools` which JS correctly shows on Lead tab, but they carry `data-tab="tools"` and `setTab('lead')` hides them. The Lead tab would show the card shell and the `#leadSection` pop-token wrapper, but every interior child div would be hidden because it was cross-tagged as `tools`.

**Fix:** The tools TAB_MAP selectors must use `:not` exclusions for content inside `#leadSection`:

```js
// popup.js:2800–2802, proposed replacement:
tools: [
  '.pop-actions',
  '#macrosSection',
  '.pop-tools:not(#leadSection .pop-tools)',
  '.pop-section-label:not(#leadSection .pop-section-label)',
  '.pop-maint:not(#leadSection .pop-maint)',
  '#maintRosterStalenessPanel', '#bugListPanel',
  '#maintReportsPanel', '#maintTardSuggestPanel', '#maintStickyScanPanel'
],
```

### B.2 — `.pop-tools` inside `#card-tokens` tagged `tools` instead of `tokens`

`popup.html:354` — `<div class="pop-tools">` containing Rotate + claimRotateBtn — is inside the team token `.pop-token` div. The `.pop-token` is tagged `tokens` by TAB_MAP. But the `.pop-tools` inside it is also matched by the tools TAB_MAP selector `.pop-tools` and tagged `tools` (tools TAB_MAP is processed after tokens, but the guard `if (!el.dataset.tab)` means once `pop-token` tags the parent as `tokens`, the child `.pop-tools` is still untagged and gets grabbed by the tools pass).

Actually the guard is on the element, not the parent — the `.pop-tools` at L354 is a separate element from the `.pop-token` at L345. The `.pop-token` at L345 gets tagged `tokens`. The `.pop-tools` at L354 is a separate element and gets tagged `tools` since it matches `.pop-tools`.

**Result:** On the Tokens tab, the Rotate and claimRotateBtn buttons (inside `.pop-tools` at L354) are hidden because that `.pop-tools` has `data-tab="tools"`.

**Fix:** Same exclusion approach — `'.pop-tools:not(#card-tokens .pop-tools)'` or more precisely `'.pop-tools:not(.pop-token .pop-tools)'` to exclude `.pop-tools` nested inside `.pop-token` elements.

### B.3 — `#crawlStatus` (popup.html:158) — untagged, inside `#card-tools`

`#crawlStatus` has class `pop-token-status` — not in any TAB_MAP selector. It will remain untagged. On non-tools tabs it's hidden only if `#card-tools` is hidden (which it currently is NOT). Once `#card-tools` gets `data-tab="tools"` (Option A fix), `#crawlStatus` would be automatically hidden by parent visibility. No individual fix needed if Option A is applied.

### B.4 — `#maintWarningBanner` (popup.html:175) — untagged, inside `#card-maint`

Class `pop-maint-banner` — not in any TAB_MAP selector. Currently untagged. On Tokens tab: parent `#card-maint` is visible (no `data-tab`), `.pop-maint` child is hidden, so the banner div can appear if it's `display:block`. Same resolution as B.3 — fixed by tagging `#card-maint` with `data-tab="tools"`.

### B.5 — `#firstRunWizard` (popup.html:365) — untagged, inside `#card-tokens`

`#firstRunWizard` has no class in any TAB_MAP selector and has `style="display:none"` as default. It would only appear when a no-token first-run shows it. Since it lives inside `#card-tokens`, once `#card-tokens` is managed by the special-case JS (Option A fix), the wizard is covered by parent visibility.

### B.6 — `#leadKpiRow`, `#leadQuickActions`, `#lapsedModsCard` (popup.html:559, 587, 600) — untagged

These three elements are inside `#card-lead`'s `.gam-card-body`, but they each have inline `style="display:none"` (or `display:none;display:grid` — see B.7). They're managed by lead-gate JS elsewhere. Not tagged by TAB_MAP. Covered by `#card-lead` parent management once Option A is applied.

### B.7 — `#leadKpiRow` has conflicting inline styles (popup.html:559)

```html
<div id="leadKpiRow" style="display:none;display:grid;...">
```

The second `display:grid` in the same style string overwrites the first `display:none`. This element is always in grid-display mode regardless of the `display:none` intention. The element is only hidden by lead-gate JS, but any code that doesn't call the lead-gate explicitly will see it as visible. This is a separate bug from the tab system but contributes to content leakage.

Same issue at `#leadQuickActions` (popup.html:587): `style="display:none;display:flex;"` — always flex.

---

## C. P1 — Friction items

### C.1 — `detectInitialTab` whitelist missing 'diag' (popup.js:2898)

```js
// popup.js:2898
setTab(['stats','tokens','tools','lead'].includes(initial) ? initial : 'stats');
```

The whitelist `['stats','tokens','tools','lead']` does not include `'diag'`. If the user was on the Diag tab when they closed the popup, `localStorage` stores `'diag'`. On reopen, `detectInitialTab` returns `'diag'`, the whitelist rejects it, and `setTab('stats')` is called instead. The user always gets reset to Stats after visiting Diag.

**Fix:** `popup.js:2898` — change the array to `['stats','tokens','tools','lead','diag']`.

### C.2 — `localStorage` vs `chrome.storage.local` (popup.js:2860)

```js
// popup.js:2860
try { localStorage.setItem('gam_popup_active_tab', name); } catch (_) {}
```

AF-06 mandates `chrome.storage.local` as the storage SSOT. This is a `localStorage` write that bypasses it. In service worker / incognito contexts, `localStorage` may be unavailable or isolated. `detectInitialTab` at popup.js:2894 reads it back from `localStorage` — consistent within the popup, but violates SSOT and will lose state across incognito sessions.

**Fix:** Replace popup.js:2860 with an async `chrome.storage.local.set({ gam_popup_active_tab: name })` call, and popup.js:2894 with `chrome.storage.local.get('gam_popup_active_tab')` in the async `detectInitialTab` function (which is already `async`).

### C.3 — No keyboard navigation on tab nav

The `<nav class="pop-tabnav" role="tablist">` at popup.html:36 has `role="tablist"` and each button has `role="tab"` and `aria-selected`, which is correct. However, there is no keyboard arrow-key navigation. ARIA authoring practices for `tablist` require Left/Right arrow keys to move between tabs, Home/End for first/last. Currently only Tab key and mouse work. No `keydown` listener is wired in `wireTabNav`.

**Fix (popup.js):** Add to wireTabNav, after the click listener at popup.js:2862–2864:

```js
const tabBtns = [...document.querySelectorAll('.pop-tab')];
document.querySelector('.pop-tabnav').addEventListener('keydown', e => {
  const idx = tabBtns.indexOf(document.activeElement);
  if (idx === -1) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); tabBtns[(idx + 1) % tabBtns.length].focus(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); tabBtns[(idx - 1 + tabBtns.length) % tabBtns.length].focus(); }
  if (e.key === 'Home') { e.preventDefault(); tabBtns[0].focus(); }
  if (e.key === 'End') { e.preventDefault(); tabBtns[tabBtns.length - 1].focus(); }
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab(document.activeElement.dataset.tab); }
});
```

### C.4 — `leadSection` special-case on `tokens` tab: orphaned children remain visible

When `name === 'tokens'`, `setTab()` shows `#leadSection` (correct — lead token input should be visible on Tokens tab per v9.6.1 intent). But `#leadOnlyTools` is hidden (correct). However, several `.pop-tools` and `.pop-section-label` children inside `#leadOnlyTools` carry `data-tab="tools"` (per bug B.1 above). On the Tokens tab they are correctly hidden (their `data-tab="tools"` causes hiding). But if the B.1 fix (`:not` exclusions in TAB_MAP) is applied, those children will become untagged, and the `#leadOnlyTools` wrapper's visibility via JS will be the sole gate — which is correct but requires confirming the JS special-case at popup.js:2845–2852 actually hides `#leadOnlyTools` on the tokens tab. It does: `if (name === 'lead') show else hide`.

### C.5 — Tab active state on non-default initial tab

`popup.html:37` hardcodes `class="pop-tab pop-tab-active"` and `aria-selected="true"` on the Stats tab button. If `detectInitialTab()` returns `'tokens'` (no-token first-run path), `setTab('tokens')` correctly updates `aria-selected` and the active class via popup.js:2854–2858. This is working correctly because `setTab` always re-applies all tab active states. No bug here.

### C.6 — `#pop-drill` tagged `stats` but never receives `data-tab` in HTML

`popup.html:85` — `<div id="pop-drill" class="pop-drill" style="display:none">`. It's in TAB_MAP stats array at popup.js:2798. The JS tagging loop will set `data-tab="stats"` on it. Works correctly at runtime, but the inline `style="display:none"` and the JS-set `data-tab` could conflict: on the Stats tab, `setTab('stats')` calls `el.style.display = ''` (clears inline) AND removes `pop-tab-hidden`. If the drill panel is supposed to be hidden by default even on the Stats tab, clearing `el.style.display = ''` when switching to stats will un-hide it if it was inline-hidden. This is a pre-existing quirk but worth noting — the drill panel has its own show/hide logic via the drill buttons, so clearing `display:none` here is wrong for that element. Consider removing `#pop-drill` from the stats TAB_MAP and letting its own show/hide logic manage it independently.

---

## D. P2 — Polish items

### D.1 — Tab badge / alert dot only on Tokens (no-token), never on other tabs

The alert dot at popup.js:2878–2884 is added to the Tokens tab button when no token is saved. No other tab gets a badge. There's no badge on Tools, Lead, or Diag tabs for actionable state. `#card-badge-maint`, `#card-badge-tools`, `#card-badge-macros` (popup.html:143, 167, 302) exist in HTML with `style="display:none"` but no code in wireTabNav populates them. These badges are orphaned UI — they exist in HTML, are never shown by the tab system itself (only by card-specific JS elsewhere), and their relationship to the tab nav badges is unclear.

### D.2 — Scroll position not preserved across tab switches

`setTab()` applies `pop-tab-hidden` to outgoing content and removes it from incoming content. No scroll position is saved or restored. If a user scrolls deep into the Tools tab content, switches to Stats, and back to Tools, they land at the top. For the Lead tab's tall content (KPI row + macros + lead tools) this is noticeable friction.

Fix: save `window.scrollY` keyed to the departing tab before hiding, restore on reveal.

### D.3 — `popup.html:559` and `popup.html:587` — double-`display` in inline style

As noted in B.7: `style="display:none;display:grid;"` and `style="display:none;display:flex;"` — the second declaration wins in all browsers. These elements (`#leadKpiRow`, `#leadQuickActions`) are always in their visible display-type at parse time. The intent was `display:none` until lead-gate JS shows them, but the second `display:` declaration defeats that. Any code that checks `el.style.display === 'none'` before showing will get `'grid'` or `'flex'` back, not `'none'`, and may incorrectly skip the show step.

### D.4 — `<details open>` on all cards means full content renders immediately

All five `<details class="gam-card">` elements have `open` attribute. The browser renders and lays out all content on popup load even though most cards are hidden by tab switching. This adds render cost and means hidden tab content (Tools card, Maintenance card, Macros card) still consume DOM layout resources. For a 380px popup this is unlikely to cause visible jank but is worth noting for battery/perf on slow devices.

### D.5 — `#card-tokens` nests `#card-lead` inside it (popup.html:399–615)

The Lead card (`<details id="card-lead">`) is nested inside the Tokens card's `.gam-card-body`. This is structurally incorrect for a tab system where each card should belong to one tab. The nesting means you cannot independently hide `#card-lead` without also hiding `#card-tokens`. The special-case JS works around this but adds fragility. The correct fix is to move `#card-lead` out of `#card-tokens`'s body to be a sibling of `#card-tokens` in the DOM.

### D.6 — `popup.html:24` — version displayed as `v10.6.0`, not v10.6.1

The `<span class="pop-ver" id="ver">v10.6.0</span>` at popup.html:24 shows v10.6.0. If the v10.6.1 hotfix was shipped, this should read v10.6.1. Minor but causes confusion when diagnosing which version is running.

---

## E. Proposed v10.7 patches (consolidated, file/line-specific)

Ordered by impact. P0 first.

### Patch 1 (P0) — Tag `#card-tools`, `#card-maint`, `#card-macros` with data-tab in HTML

**File:** `popup.html`

```
L139: <details class="gam-card" id="card-tools" open>
  →   <details class="gam-card" id="card-tools" data-tab="tools" open>

L163: <details class="gam-card" id="card-maint" open>
  →   <details class="gam-card" id="card-maint" data-tab="tools" open>

L298: <details class="gam-card" id="card-macros" open>
  →   <details class="gam-card" id="card-macros" data-tab="tools" open>
```

This alone eliminates the Maintenance card header and Team Macros card header leaking on all non-tools tabs. The `[data-tab].pop-tab-hidden` rule at `popup.css:1457` already covers `<details>` elements.

### Patch 2 (P0) — Manage `#card-tokens` and `#card-lead` explicitly in setTab()

**File:** `popup.js`, inside `setTab(name)`, after popup.js:2852 (after the `leadTools` block, before the tab active-state update at L2854):

```js
// Manage card wrappers that span multiple tabs
const cardTokens = document.getElementById('card-tokens');
const cardLead = document.getElementById('card-lead');
if (cardTokens) {
  if (name === 'tokens') {
    cardTokens.classList.remove('pop-tab-hidden');
  } else {
    cardTokens.classList.add('pop-tab-hidden');
  }
}
if (cardLead) {
  if (name === 'lead') {
    cardLead.classList.remove('pop-tab-hidden');
  } else {
    cardLead.classList.add('pop-tab-hidden');
  }
}
```

Note: since `#card-lead` is nested inside `#card-tokens`, hiding `#card-tokens` automatically hides `#card-lead` too. The explicit `#card-lead` management is needed for when `#card-tokens` is shown (on the tokens tab) but `#card-lead` should be hidden.

### Patch 3 (P0) — Fix TAB_MAP tools selectors to exclude content inside `#leadSection`

**File:** `popup.js`, TAB_MAP at popup.js:2800–2802:

```js
// Before:
tools:  ['.pop-actions', '#macrosSection', '.pop-tools', '.pop-section-label',
         '.pop-maint', '#maintRosterStalenessPanel', '#bugListPanel',
         '#maintReportsPanel', '#maintTardSuggestPanel', '#maintStickyScanPanel'],

// After:
tools:  ['.pop-actions', '#macrosSection',
         '.pop-tools:not(#leadSection .pop-tools):not(.pop-token .pop-tools)',
         '.pop-section-label:not(#leadSection .pop-section-label)',
         '.pop-maint:not(#leadSection .pop-maint)',
         '#maintRosterStalenessPanel', '#bugListPanel',
         '#maintReportsPanel', '#maintTardSuggestPanel', '#maintStickyScanPanel'],
```

This prevents `.pop-tools`, `.pop-section-label`, and `.pop-maint` elements inside `#leadSection` (and `.pop-token` containers generally) from being incorrectly tagged as `tools`.

Also fix the tokens TAB_MAP to include `.pop-tools` inside token containers:

```js
// Before:
tokens: ['#claimInviteWrap', '.pop-token:not(#macrosSection):not(#leadSection)'],

// After:
tokens: ['#claimInviteWrap',
         '.pop-token:not(#macrosSection):not(#leadSection)',
         '.pop-tools:not(#leadSection .pop-tools)'],
```

Wait — this would double-tag `.pop-tools` since the guard prevents overwrite. The correct approach: the `:not(.pop-token .pop-tools)` in the tools selector (above) prevents the tools pass from grabbing `.pop-tools` inside `.pop-token` wrappers, leaving them untagged. Untagged elements are invisible to `setTab()` — they get neither shown nor hidden. Since they are children of a tagged `.pop-token` container, parent visibility controls them. This is the correct outcome.

### Patch 4 (P1) — Add 'diag' to detectInitialTab whitelist

**File:** `popup.js:2898`

```js
// Before:
setTab(['stats','tokens','tools','lead'].includes(initial) ? initial : 'stats');

// After:
setTab(['stats','tokens','tools','lead','diag'].includes(initial) ? initial : 'stats');
```

### Patch 5 (P1) — Migrate tab persistence from localStorage to chrome.storage.local

**File:** `popup.js`

At popup.js:2860, replace:
```js
try { localStorage.setItem('gam_popup_active_tab', name); } catch (_) {}
```
with:
```js
try { chrome.storage.local.set({ gam_popup_active_tab: name }); } catch (_) {}
```

At popup.js:2894, replace:
```js
try { return localStorage.getItem('gam_popup_active_tab') || 'stats'; }
```
with:
```js
try {
  const r = await chrome.storage.local.get('gam_popup_active_tab');
  return (r && r.gam_popup_active_tab) || 'stats';
}
```
(The enclosing function is already `async function detectInitialTab()`, so `await` is valid.)

### Patch 6 (P2) — Fix double-display inline style on `#leadKpiRow` and `#leadQuickActions`

**File:** `popup.html`

```
L559: style="display:none;display:grid;..."
  →   style="display:none;..."  (remove second display:grid — grid is the CSS default for this element's gam-kpi-tile layout; lead-gate JS applies it when needed)

L587: style="display:none;display:flex;..."
  →   style="display:none;..."
```

### Patch 7 (P2) — Correct version string in popup.html

**File:** `popup.html:24`

```
<span class="pop-ver" id="ver">v10.6.0</span>
  →  <span class="pop-ver" id="ver">v10.7.0</span>
```
(or v10.6.1 if that hotfix version is the current baseline)

---

## F. Untagged elements inventory

Elements with rendered content that have NO `data-tab` assignment and are NOT inside a tagged parent, as of the current codebase (before any patches):

| Element | popup.html line | Class(es) | Should be on tab | Why untagged | Covered by patch? |
|---|---|---|---|---|---|
| `#card-tools <details>` | L139 | `gam-card` | tools | Not in any TAB_MAP selector | Patch 1 |
| `#card-tools <summary>` | L140 | `gam-card-head` | tools | Child of untagged parent | Patch 1 (parent fix) |
| `#card-maint <details>` | L163 | `gam-card` | tools | Not in any TAB_MAP selector | Patch 1 |
| `#card-maint <summary>` | L164 | `gam-card-head` | tools | Child of untagged parent | Patch 1 (parent fix) |
| `#maintWarningBanner` | L175 | `pop-maint-banner` | tools | Not in any TAB_MAP selector | Patch 1 (parent fix) |
| `#card-macros <details>` | L298 | `gam-card` | tools | Not in any TAB_MAP selector | Patch 1 |
| `#card-macros <summary>` | L299 | `gam-card-head` | tools | Child of untagged parent | Patch 1 (parent fix) |
| `#card-tokens <details>` | L337 | `gam-card` | tokens | Spans multiple tabs (contains card-lead) | Patch 2 |
| `#card-tokens <summary>` | L338 | `gam-card-head` | tokens | Child of untagged parent | Patch 2 (parent fix) |
| `#firstRunWizard` | L365 | (none relevant) | tokens | No TAB_MAP selector; inline `display:none` | Patch 2 (parent fix) |
| `#card-lead <details>` | L400 | `gam-card` | lead | Nested inside card-tokens; not tagged | Patch 2 |
| `#card-lead <summary>` | L401 | `gam-card-head` | lead | Child of untagged parent | Patch 2 (parent fix) |
| `#leadKpiRow` | L559 | (none relevant) | lead | No TAB_MAP selector; lead-gate managed | Patch 2 (parent fix) |
| `#leadQuickActions` | L587 | (none relevant) | lead | No TAB_MAP selector; lead-gate managed | Patch 2 (parent fix) |
| `#lapsedModsCard` | L600 | (none relevant) | lead | No TAB_MAP selector; lead-gate managed | Patch 2 (parent fix) |
| `#claimInviteWrap` | L625 | `pop-tools` | tokens | IS in TAB_MAP tokens — correctly tagged | N/A (working) |
| `#restartSetupWrap` | L630 | (none relevant) | tokens | No TAB_MAP selector; inline `display:none` | Patch 2 (parent fix) |
| `#crawlStatus` | L158 | `pop-token-status` | tools | No TAB_MAP selector | Patch 1 (parent fix) |
| `#diagTabSection` | L639 | (hardcoded) | diag | Has `data-tab="diag"` hardcoded in HTML | Already working |
| `.pop-footer` | L669 | `pop-footer` | always | Intentionally global — correct | N/A |
| `.pop-header` | L22 | `pop-header` | always | Intentionally global — correct | N/A |
| `.pop-tabnav` | L36 | `pop-tabnav` | always | Intentionally global — correct | N/A |

**Cross-tagged elements (tagged to wrong tab, causes P0 hidden content on correct tab):**

| Element | popup.html line | Tagged as | Should be | Impact |
|---|---|---|---|---|
| `.pop-tools` inside `#leadOnlyTools` (L426, L434) | L426, L434 | `tools` | untagged (managed by leadOnlyTools parent) | Lead tab: invite/roster buttons hidden |
| `.pop-tools` inside `#leadSettingsAccordion` (L449, L462, L470, L519, L532) | multiple | `tools` | untagged | Lead tab: all lead settings inputs hidden |
| `.pop-section-label` inside `#leadSettingsAccordion` (L448, L461, L481, L518) | multiple | `tools` | untagged | Lead tab: section headers hidden |
| `.pop-maint` at L482 inside `#leadSection` | L482 | `tools` | untagged | Lead tab: lead maintenance buttons hidden |
| `.pop-tools` at L354 inside team-token `.pop-token` | L354 | `tools` | untagged (or `tokens`) | Tokens tab: Rotate/claimRotate buttons hidden |

---

## Summary: Priority execution order for v10.7

1. **Patch 1** — 3 HTML attribute additions to `#card-tools`, `#card-maint`, `#card-macros`. Eliminates Maintenance + Team Macros card headers leaking. Zero JS changes. Lowest risk.
2. **Patch 2** — JS `setTab()` extension for `#card-tokens` and `#card-lead`. Eliminates Lead card header leaking on non-lead tabs, Tokens card header on non-token tabs.
3. **Patch 3** — TAB_MAP `:not` exclusions for `#leadSection` content. Fixes all cross-tagged children that make the Lead tab show empty card shells.
4. **Patch 4** — 1-word change, add `'diag'` to whitelist. Unblocks Diag tab persistence.
5. **Patches 5–7** — Storage migration, double-display fix, version string. Low-risk cleanups.

Patches 1–3 together close the recurrent "content from wrong tab is visible" bug class permanently by fixing both the missing parent tags AND the cross-tagging of children. The previous hotfixes (v9.22.0 class-based toggle, v10.6.1 specificity chaining) addressed symptoms on elements that WERE tagged but whose CSS `!important` rules won. The root cause — untagged `<details>` card wrappers introduced by the v10.x card refactor — was never addressed.
