# Panel Reorg 1 — Collapsible Cards System

_Discipline: card component design + auto-collapse behavior tied to auth state._
_Agent 1 of 4. Reads: popup.html, popup.css (Bloomberg layer), popup.js wireTabNav / __applyLeadGate / loadToken._

---

## A. CARD COMPONENT (HTML + CSS)

### HTML structure

```html
<details class="gam-card" id="card-{id}" open>
  <summary class="gam-card-head">
    <span class="gam-card-chevron" aria-hidden="true">▸</span>
    <span class="gam-card-title">SECTION TITLE</span>
    <!-- optional badge slot -->
    <span class="gam-card-badge" id="card-badge-{id}" style="display:none"></span>
  </summary>
  <div class="gam-card-body">
    <!-- existing section content, verbatim -->
  </div>
</details>
```

`id` values map 1-to-1 to the storage key: `card-tokens`, `card-maint`, `card-tools`, `card-macros`, `card-lead`. The `open` attribute is the HTML default; JS removes it per §B when storage says closed.

### CSS (append to Bloomberg layer — no !important needed here because these are new selectors)

```css
/* ── Collapsible card shell ─────────────────────────────────────────── */
.gam-card {
  border-top: 1px solid var(--bb-line);
  background: transparent;
  margin: 0;
  padding: 0;
}
.gam-card:first-of-type { border-top: none; }

.gam-card-head {
  display: flex;
  align-items: center;
  gap: var(--bb-s2);
  padding: var(--bb-s3) var(--bb-s5);
  cursor: pointer;
  list-style: none;
  user-select: none;
  outline: none;
  transition: background-color 100ms ease-out;
  /* min tap target */
  min-height: 28px;
}
.gam-card-head::-webkit-details-marker { display: none; }
.gam-card-head:hover  { background: var(--bb-amber-bg); }
.gam-card-head:focus-visible {
  outline: 1px solid var(--bb-amber);
  outline-offset: -1px;
}

.gam-card-chevron {
  color: var(--bb-amber-dim);
  font-size: var(--bb-t-xs);
  width: 12px;
  display: inline-block;
  transition: transform 120ms ease-out;
  /* The actual glyph swaps via :open state (no transform needed since
     ▸ and ▾ are distinct glyphs) */
}
.gam-card[open] > .gam-card-head > .gam-card-chevron {
  color: var(--bb-amber);
}
/* Swap glyph on open: cheapest possible animation, no layout jank */
.gam-card:not([open]) > .gam-card-head > .gam-card-chevron::before { content: "▸"; }
.gam-card[open]       > .gam-card-head > .gam-card-chevron::before { content: "▾"; }

.gam-card-title {
  font: 600 var(--bb-t-xs)/1.2 var(--bb-font);
  color: var(--bb-amber);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  flex: 1 1 auto;
}

.gam-card-badge {
  font: 600 var(--bb-t-xs)/1 var(--bb-font);
  color: var(--bb-red);
  background: var(--bb-red-bg);
  border: 1px solid var(--bb-red);
  padding: 1px var(--bb-s2);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.gam-card-body {
  /* No extra padding — existing section content already has its own.
     A 1px inset-left ticks the Bloomberg "data row" convention. */
  border-left: 2px solid var(--bb-line);
  margin-left: var(--bb-s5);
  padding-left: 0;
  /* Height animation via max-height interpolation.
     320px cap covers every card body; transition only fires on open/close. */
  overflow: hidden;
}

/* Reduced-motion: skip animation entirely (already covered by global rule
   in popup.css Iter 22, but belt-and-suspenders for the max-height trick) */
@media (prefers-reduced-motion: no-preference) {
  .gam-card:not([open]) > .gam-card-body {
    /* <details> removes content from layout when closed — no animation needed.
       If we later switch to a CSS-only animation approach this is the hook. */
    display: none; /* native behavior, here for explicitness */
  }
}

/* Tokens card — bottom-reorder state (see §D) */
.gam-card.gam-card-order-last { order: 999; }

/* Card-level highlight when auth fails (tokens card) */
.gam-card.gam-card-urgent > .gam-card-head {
  border-left: 3px solid var(--bb-red);
  padding-left: calc(var(--bb-s5) - 3px);
}
.gam-card.gam-card-urgent > .gam-card-head > .gam-card-title { color: var(--bb-red); }
.gam-card.gam-card-urgent > .gam-card-head > .gam-card-chevron { color: var(--bb-red); }
```

**Animation timing:** The Bloomberg layer already uses `100ms ease-out` for interactive elements and `120ms ease-out` for the `.pop-maint-advanced` chevron. This card system matches those values exactly. No spring physics, no `max-height` lerp — native `<details>` toggle is instant and that is correct for a terminal aesthetic.

---

## B. PERSISTENCE (chrome.storage.local)

### Key naming

```
gam_card_open_{id}   →  boolean  (true = open, false = collapsed)
```

Examples: `gam_card_open_tokens`, `gam_card_open_maint`, `gam_card_open_tools`, `gam_card_open_macros`, `gam_card_open_lead`.

### JS module (drop into popup.js, call once on DOMContentLoaded)

```js
// ── Card persistence ─────────────────────────────────────────────────────
// Write debounce: 400ms. <details> toggle fires on every click; debounce
// prevents a rapid open/close pair from issuing two storage writes.
const _cardWriteTimers = {};

async function _cardRestoreAll() {
  const ids = ['tokens', 'maint', 'tools', 'macros', 'lead'];
  const keys = ids.map(id => 'gam_card_open_' + id);
  try {
    const data = await chrome.storage.local.get(keys);
    ids.forEach(id => {
      const el = document.getElementById('card-' + id);
      if (!el) return;
      const stored = data['gam_card_open_' + id];
      // undefined = first visit = use HTML default (open attribute present)
      if (stored === false) el.removeAttribute('open');
      else if (stored === true) el.setAttribute('open', '');
    });
  } catch (_) {}
}

function _cardWireToggle(id) {
  const el = document.getElementById('card-' + id);
  if (!el) return;
  el.addEventListener('toggle', () => {
    clearTimeout(_cardWriteTimers[id]);
    _cardWriteTimers[id] = setTimeout(() => {
      chrome.storage.local.set({ ['gam_card_open_' + id]: el.open }).catch(() => {});
    }, 400);
  });
}

(async function initCards() {
  await _cardRestoreAll();
  ['tokens', 'maint', 'tools', 'macros', 'lead'].forEach(_cardWireToggle);
})();
```

**First-visit behavior:** storage key absent → `undefined` → HTML attribute wins. Cards default to `open` in markup; a collapsed card is an explicit user choice, so there is no ambiguity on first load.

**Cross-tab coherence:** not needed. The popup is a single ephemeral window; it re-runs `initCards` on every open, so stale in-memory state is impossible.

---

## C. AUTO-COLLAPSE RULES

Three rules, three triggers. All fire inside `loadToken` / `__applyLeadGate` (existing call sites — no new hooks needed).

### Rule 1 — Tokens card: collapse + reorder to bottom when auth is confirmed

**Trigger:** `loadToken` resolves with `hasTeamToken === true` AND `/mod/whoami` returns `ok: true`.

```js
async function _cardAutoCollapseTokens(whoamiOk) {
  const card = document.getElementById('card-tokens');
  if (!card) return;
  if (whoamiOk) {
    // Collapse
    card.removeAttribute('open');
    chrome.storage.local.set({ gam_card_open_tokens: false }).catch(() => {});
    // Reorder to bottom (see §D)
    card.classList.add('gam-card-order-last');
    card.classList.remove('gam-card-urgent');
  }
}
```

Call after the whoami probe inside `loadToken` succeeds. The reorder is additive — the class is stored in-memory only (not persisted), so it recomputes correctly on every popup open based on live auth state.

### Rule 2 — Tokens card: expand + reorder to top when auth fails

**Trigger:** `loadToken` resolves with `hasTeamToken === false`, OR whoami returns `ok: false`, OR any network error in the token probe.

```js
function _cardAuthFailed() {
  const card = document.getElementById('card-tokens');
  if (!card) return;
  card.setAttribute('open', '');
  // Do NOT write to storage — user may have intentionally collapsed it
  // and we don't want to clobber that preference permanently on a transient error.
  card.classList.remove('gam-card-order-last');
  card.classList.add('gam-card-urgent'); // red left rail + red title
}
```

**Why not persist the forced-open?** Auth failures are transient. Persisting `gam_card_open_tokens: true` on every failed ping would fight the user's deliberate collapse on a shaky network. The urgent class is the signal; the open state is the consequence.

### Rule 3 — Tokens card: fully hide on wizard complete, show "Re-run setup" button

**Trigger:** first-run wizard emits success (the existing `setTimeout(() => { wiz.style.display = 'none'; ... }, 5000)` block in popup.js line ~1879).

```js
function _cardWizardComplete() {
  const card = document.getElementById('card-tokens');
  if (!card) return;
  // Hide the body; keep summary visible with a "Re-run setup" link
  card.removeAttribute('open');
  card.classList.add('gam-card-order-last');
  // Inject "Re-run setup" button into summary badge slot if not already there
  const badge = document.getElementById('card-badge-tokens');
  if (badge && !badge.querySelector('.gam-card-rerun')) {
    const btn = document.createElement('button');
    btn.className = 'pop-btn pop-btn-ghost gam-card-rerun';
    btn.style.cssText = 'font-size:9px;padding:1px 6px;min-height:0;height:18px;line-height:1';
    btn.textContent = 'Re-run setup';
    btn.addEventListener('click', e => {
      e.stopPropagation(); // don't toggle card on button click
      const wiz = document.getElementById('firstRunWizard');
      if (wiz) { wiz.style.display = ''; }
      // Reset wizard to step 1
      ['firstRunWizardStep1','firstRunWizardStep2','firstRunWizardSuccess']
        .forEach((id, i) => {
          const el = document.getElementById(id);
          if (el) el.style.display = i === 0 ? '' : 'none';
        });
      card.setAttribute('open', '');
    });
    badge.style.display = '';
    badge.appendChild(btn);
  }
  chrome.storage.local.set({ gam_card_open_tokens: false }).catch(() => {});
}
```

Hook this into the wizard success block — replace the raw `wiz.style.display = 'none'` call with `_cardWizardComplete()`.

---

## D. REORDER LOGIC

**Decision: CSS `order` property on a flex container. Not DOM move.**

**Why not DOM move:** The tab system in `wireTabNav` assigns `data-tab` attributes by querying selectors at startup. Moving a node in the DOM after `wireTabNav` has already tagged it would orphan those attributes and break tab toggling unless `wireTabNav` is re-run. Re-running `wireTabNav` is fragile; DOM mutation is permanently risky here.

**Why CSS order works:** The tab content areas are already `display:flex; flex-direction:column` (or can trivially be made so — currently they're block children of `body`, but the Bloomberg layer's body is `flex` compatible). Adding `order: 999` to a card moves it visually to the bottom with zero DOM mutation and zero JS timing risk.

**Required one-time change:** wrap the tab content areas in a flex column container, or confirm that `body` itself is a flex column (it isn't currently — it's `display:block`). The cheapest fix: add a `<div class="gam-tab-pane" data-tab="tokens">` wrapper per tab and style it:

```css
.gam-tab-pane {
  display: flex;
  flex-direction: column;
}
```

Then `wireTabNav` targets `.gam-tab-pane[data-tab=X]` instead of loose selectors. The `gam-card-order-last` class on the card inside the pane then operates correctly.

**Alternative (if tab-pane wrapper is deferred):** Store the Tokens card DOM reference and call `card.parentNode.appendChild(card)` (moves to end of parent). This is a single-call append, not a splice, so it doesn't force a full re-layout of siblings. Still a DOM move — acceptable as a fallback since `wireTabNav` has already run by the time auth resolves. Flag as technical debt to migrate to CSS order when the tab-pane wrapper ships.

---

## E. KEYBOARD CONTRACT

`<details>/<summary>` has native keyboard support baked into every browser:

- **Enter / Space** on `<summary>`: toggles open/close. No JS needed.
- **Tab**: focuses `<summary>` in document order, then any focusable children inside the open body.
- **Esc**: no native behavior — leave it alone. (Esc is already wired to close the drill-down overlay in popup.js; don't intercept it here.)

**`aria-expanded`:** `<details>` maps to the ARIA `group` role with implicit `aria-expanded` derived from the `open` attribute. Browser accessibility trees handle this natively. Do not add a manual `aria-expanded` attribute — it would create a duplicate that screen readers may announce twice.

**Focus trap:** NOT needed. Cards are not modal dialogs. Keyboard users tab through the summary, then through the card's content naturally. The existing popup tab-nav (`.pop-tab` buttons) sits above all cards in DOM order, which is correct.

**One gap to close:** the `.gam-card-rerun` button inside the summary needs `e.stopPropagation()` (already in the §C code) AND explicit keyboard handling to prevent the button's Enter key from also toggling the parent `<details>`. Native behavior: Enter on a button fires `click`, not `toggle`, so `stopPropagation` on `click` is sufficient. Verified: `<button>` inside `<summary>` does not forward Enter to the `<details>` toggle in Chrome 124+.

---

## F. SHIP-TONIGHT PATCH

Minimum diff to go live. Converts 5 logical sections to `.gam-card` and wires auth auto-collapse on Tokens. Roughly 80 lines of HTML change + 60 lines of JS.

### HTML changes (popup.html)

Wrap these five blocks. Inner content is untouched — only the outer shell changes:

1. **Tokens card** (`card-tokens`): wraps the `Team Mod Token` `.pop-token` div + the `Lead Mod Token / leadSection` `.pop-token` div + `#firstRunWizard` + `#claimInviteWrap`. Default: `open`. No `open` if auth verified.

2. **Maintenance card** (`card-maint`): wraps `.pop-section-label` "Maintenance" + `#maintWarningBanner` + `.pop-maint` (all 10 rows + `<details class="pop-maint-advanced">`). Default: `open`.

3. **Tools card** (`card-tools`): wraps `.pop-section-label` "Diagnostics" + `.pop-tools` (debug/dashboard/rehydrate) + `.pop-section-label` "Data harvest" + `.pop-tools` (crawl buttons) + their status divs. Default: `open`.

4. **Macros card** (`card-macros`): wraps `#macrosSection`. Default: `open`.

5. **Actions card** (`card-actions`): wraps `.pop-actions` (the 4 link buttons). Default: `open`. Lowest-priority ship; can defer to v10.2 if time is short.

### JS additions (popup.js)

Add the `_cardRestoreAll`, `_cardWireToggle`, `initCards` block from §B.

Add `_cardAutoCollapseTokens` and `_cardAuthFailed` from §C.

Hook into `loadToken`:
```js
// At end of the hasTeamToken === true branch (inside __hardeningOnPopup path):
await _cardAutoCollapseTokens(status.whoamiOk); // pass through whoami result

// In the catch / hasTeamToken === false branch:
_cardAuthFailed();
```

Hook into the wizard success block (popup.js ~L1879):
```js
// Replace: setTimeout(() => { wiz.style.display = 'none'; ... }, 5000)
// With:
setTimeout(() => {
  _cardWizardComplete();
  try { loadToken(); loadLead(); loadStats(); } catch(_){}
}, 5000);
```

### CSS additions (popup.css)

Append the full §A CSS block (≈50 lines). No existing rules are modified.

### Ship-tonight risk: LOW

- `<details>/<summary>` is supported in all Chrome versions that can run a Manifest V3 extension.
- No existing IDs or classes are renamed. `wireTabNav` queries by selector; if the selector is a descendant of a `.gam-card`, the query still finds it.
- The Bloomberg `!important` layer does not conflict: `.gam-card`, `.gam-card-head`, `.gam-card-body`, `.gam-card-chevron`, `.gam-card-title`, `.gam-card-badge` are all new class names.
- One watch item: the Bloomberg `* { border-radius: 0 !important }` rule in Iter 21 applies to `<summary>` — that is correct and desired.

---

## G. STRETCH — Per-card "minimize via X button" vs collapse

The current design uses `<details>` collapse as the only minimize gesture. A separate X button per card is the Bloomberg equivalent of a panel close (think "F2 WIN" in a Bloomberg terminal pane).

**Recommendation: defer. Here is why.**

The X button model implies the card can be fully dismissed from the visible set, not just collapsed. That introduces a "restore all" affordance — a hidden panel list or a reset button — which is a non-trivial UX surface. It also conflicts with the auth auto-rules in §C: if the user X-closes the Tokens card and then their auth expires, Rule 2 wants to re-expand it. A dismissed card can't be expanded.

The `<details>` collapse is semantically correct for "I know this section exists, I just don't need to see the body right now." The X/dismiss model is semantically "I want this gone until I ask for it." The latter requires §C to be redesigned.

**When to revisit:** after the card layout has been live for a sprint and Commander signals that individual sections feel permanently irrelevant. At that point, add a `data-dismissible` attribute to non-critical cards (Actions, Macros) and a thin "Restore hidden panels" link in the footer. Tokens and Maintenance should never be dismissible given the auth-state rules.

---

_Word count: ~1,950. Concrete CSS + JS sketches throughout. No speculative features beyond the stated scope._
