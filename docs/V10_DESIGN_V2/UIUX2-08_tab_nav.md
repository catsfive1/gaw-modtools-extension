# UIUX2-08 — Popup Top Tab Nav Design Review
**Surface:** 5-tab popup nav (Stats / Tokens / Tools / Lead / Diag)
**Version audited:** v10.12.3
**Files in scope:** `popup.html` lines 55-61, `popup.css` lines 749-785 + 1441-1459, `popup.js` lines 3216-3331
**Date:** 2026-05-10

---

## A. Current Implementation — What Exists

### A.1 HTML Structure (popup.html:55-61)

```html
<nav class="pop-tabnav" role="tablist" aria-label="ModTools navigation">
  <button id="tab-btn-stats"  class="pop-tab pop-tab-active" data-tab="stats"
          role="tab" aria-selected="true"  aria-controls="tab-panel-stats">Stats</button>
  <button id="tab-btn-tokens" class="pop-tab"                data-tab="tokens"
          role="tab" aria-selected="false" aria-controls="tab-panel-tokens">Tokens</button>
  <button id="tab-btn-tools"  class="pop-tab"                data-tab="tools"
          role="tab" aria-selected="false" aria-controls="tab-panel-tools">Tools</button>
  <button id="tab-btn-lead"   class="pop-tab"                data-tab="lead"
          role="tab" aria-selected="false" aria-controls="tab-panel-lead">Lead</button>
  <button id="tab-btn-diag"   class="pop-tab"                data-tab="diag"
          role="tab" aria-selected="false" aria-controls="tab-panel-diag">Diag</button>
</nav>
```

ARIA tablist conformance check:
- `role="tablist"` on `<nav>` — correct
- `aria-label="ModTools navigation"` on tablist — correct
- `role="tab"` on each button — correct
- `aria-selected="true/false"` — present and toggled by `setTab()`
- `aria-controls` pointing to panel IDs — correct
- `id` on each button (required for `aria-labelledby` back-reference from panels) — correct

### A.2 Panel Structure

Five panels exist. Four use the canonical form:
```html
<div id="tab-panel-{name}" role="tabpanel" aria-labelledby="tab-btn-{name}">
```
These are hidden via the `hidden` HTML attribute (set by `setTab()` at JS:3252-3255). This is the correct ARIA pattern — `hidden` makes the panel invisible to both CSS and the accessibility tree simultaneously.

The **Diag panel** deviates:
```html
<div data-tab="diag" class="pop-tab-hidden" id="diagTabSection"
     role="tabpanel" aria-labelledby="tab-btn-diag">
```
It uses `data-tab` + `.pop-tab-hidden` class (the legacy system) rather than `id="tab-panel-diag"` + `hidden` attribute. The `setTab()` function queries `[role="tabpanel"]` filtered by `aria-labelledby`, so `diagTabSection` IS caught by that branch. However the panel's `id` is `diagTabSection` not `tab-panel-diag`, so `aria-controls="tab-panel-diag"` on the Diag button resolves to nothing — broken ARIA association.

### A.3 CSS Layer (popup.css:752-785)

```css
.pop-tabnav {
  display: flex;
  gap: 0;
  background: var(--bb-bg);
  border-bottom: 1px solid var(--bb-line-hot);
  padding: 0; margin: 0;
}
.pop-tab {
  flex: 1 1 auto;
  background: transparent;
  border-bottom: 2px solid transparent;    /* active indicator slot */
  border-radius: 0;
  color: var(--bb-ink-dim);
  font: 600 11px/1.2 var(--bb-font);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 8px 4px;                        /* total touch height ~32px */
  transition: color 100ms, border-color 100ms, background-color 100ms;
}
.pop-tab:hover {
  color: var(--bb-ink);
  background: rgba(255,153,51,0.05);
}
.pop-tab.pop-tab-active {
  color: var(--bb-amber);
  border-bottom-color: var(--bb-amber);
  background: rgba(255,153,51,0.08);
}
.pop-tab:focus-visible {
  outline: 3px solid var(--bb-amber);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px rgba(255,176,0,0.25);
}
```

### A.4 JavaScript — wireTabNav() (popup.js:3220-3331)

`setTab(name)` does two things in sequence:
1. **Legacy data-tab elements** — adds/removes `.pop-tab-hidden` class and clears inline `style.display`.
2. **ARIA tabpanels** — sets `panel.hidden = (labelId !== 'tab-btn-' + name)`.

Tab buttons get `aria-selected` toggled and `tabIndex` set to 0 (active) or -1 (inactive) — correct roving tabindex pattern per WAI-ARIA APG.

Keyboard navigation: ArrowLeft/Right with modulo wraparound; Home/End to first/last. Filters via `offsetParent !== null` to skip any display:none tabs (e.g. Lead tab hidden from non-leads). Auto-activates on focus (not deferred to Enter/Space) which is the APG "automatic activation" variant — valid per spec.

Badge dot: injected as `<span class="pop-tab-alert-dot">` with pulse keyframes. Only fires when no team token stored. Keyed by class presence check to avoid double-inject.

---

## B. What Works Well — Preserve These

1. **ARIA conformance is largely solid.** tablist/tab/tabpanel triad, aria-selected, aria-controls, aria-labelledby, roving tabindex — all present and toggled correctly by `setTab()`.

2. **Keyboard nav is complete.** Arrow keys, Home, End, wraparound, hidden-tab skipping. This is the full APG mandatory set. Nothing to add structurally.

3. **Active indicator design is correct for the Bloomberg aesthetic.** Bottom-border underline (2px amber) + amber text + subtle amber background tint. Clear, non-cluttered, on-brand. The inactive state (dimmed ink, transparent border) creates sufficient hierarchy contrast.

4. **focus-visible ring is well-designed.** 3px amber outline + 5px glow halo is highly visible without being garish. Correctly uses `:focus-visible` not `:focus` so mouse users don't see the ring.

5. **100ms transition** on color/border/background is at the fast end of the 150-300ms UX guideline range but is appropriate for a tab nav — tab switches feel instant rather than laggy.

6. **localStorage persistence** of active tab with fallback to `'stats'` is correct UX. First-run redirect to `tokens` tab with badge dot is a good onboarding pattern.

7. **The specificity fix at L1449-1458** is the right architectural decision. Chaining two classes beats Bloomberg's single-class `!important` without resorting to inline styles. Comment explains the root cause. This is a stable solution.

---

## C. Defects — Confirmed Bugs

### C.1 CRITICAL — Diag panel `aria-controls` broken
**Location:** `popup.html:61` + `popup.html:805`

The Diag button declares `aria-controls="tab-panel-diag"` but the Diag panel's `id` is `diagTabSection`. No element in the DOM has `id="tab-panel-diag"`. Screen readers cannot programmatically associate the Diag tab with its panel.

**Fix:** Rename the panel id OR add the expected id as a second ID (not valid HTML) — the correct fix is to rename to `id="tab-panel-diag"` and update `aria-labelledby="tab-btn-diag"` (already correct).

Also: the Diag panel uses the `data-tab` + class system instead of the `hidden` attribute system. `setTab()` DOES catch it via the `[role="tabpanel"]` query + `aria-labelledby` check, so it does hide/show correctly at runtime. But the dual-system is fragile (see D.1 below).

### C.2 MEDIUM — Badge dot uses inline `style.cssText` with animation keyframes injected via `<style>` element
**Location:** `popup.js:3313-3321`

The keyframe injection guard (`if (!document.getElementById('gam-tab-dot-style'))`) works, but the dot's `style.cssText` includes a hard-coded `animation` name that references those keyframes. If `detectInitialTab()` is ever called twice (e.g. from a re-init path), the guard prevents double-injection of keyframes but the dot could be appended again if the `!tokensBtn.querySelector('.pop-tab-alert-dot')` check fails (it checks for the span by class before appending — this guard is correct). Low priority but fragile.

### C.3 LOW — No `id="tab-panel-diag"` means `tab-panel-diag` ID is promised but never fulfilled
**Impact:** Automated accessibility testing (axe, Lighthouse) will flag this as a broken `aria-controls` reference. No functional regression for sighted users.

---

## D. Structural Fragility — Not Bugs Yet, But Will Be

### D.1 Dual hide/show system is a technical debt bomb

`setTab()` runs TWO parallel hide mechanisms:
- **Branch 1:** `[data-tab]:not(.pop-tab)` → adds/removes `.pop-tab-hidden` class
- **Branch 2:** `[role="tabpanel"]` → sets `.hidden` attribute

The Diag panel is in BOTH systems simultaneously (it has `data-tab` AND `role="tabpanel"`). That means `setTab('diag')` removes `.pop-tab-hidden` via Branch 1 AND removes `.hidden` via Branch 2. When switching AWAY from Diag, both branches add `.pop-tab-hidden` AND add `.hidden`. This is redundant but harmless today. If a future panel is added that has `role="tabpanel"` but also inherits Bloomberg's `display:grid !important`, Branch 2's `hidden` attribute will be beaten by the CSS specificity again — the same bug that required the L1449 fix in the first place. The `hidden` attribute sets `display:none` at user-agent level, which sits below author stylesheets in the cascade. A Bloomberg `display:grid !important` will override it.

**Recommendation:** Consolidate to the `hidden` attribute system exclusively for tabpanels. Remove the `data-tab` attribute from tabpanel root elements. Keep the `data-tab` + class system only for non-panel legacy elements (`.pop-stats`, `.pop-actions`, etc.) that genuinely need it.

### D.2 `offsetParent !== null` filter for hidden tabs is fragile

The keyboard nav filters tabs via `offsetParent !== null`. This works for `display:none` tabs. It will NOT work if a tab is hidden via `visibility:hidden` or `opacity:0` (both have non-null `offsetParent`). Currently no tab uses those hiding methods, but the filter is not defensive against future CSS changes. The correct filter per WAI-ARIA APG is to check `!tab.hidden && getComputedStyle(tab).display !== 'none'`.

### D.3 Lead tab visibility control not tracked in wireTabNav

The Lead tab button can be conditionally hidden (for non-lead users) via CSS or JS outside `wireTabNav`. The keyboard nav skips it via the `offsetParent` filter. But `setTab('lead')` can still be called via localStorage restore if a user was previously a lead mod, then lost lead status. There is no guard in `setTab()` to detect this case and fall back to `'stats'`. Low probability but will produce a blank panel if triggered.

---

## E. Visual Hierarchy Assessment

### E.1 Active state contrast — PASS

Active tab: `var(--bb-amber)` text + 2px amber bottom border + `rgba(255,153,51,0.08)` background tint.
Inactive tab: `var(--bb-ink-dim)` text + `rgba(0,0,0,0)` border + no background.

The delta between active and inactive is driven by THREE simultaneous signals (color, border, background). This is over-specified in a good way — any one of the three alone would be sufficient; having all three means users with color perception differences still see the active indicator via the border underline shape.

Concern: At 11px font size and all-caps, the per-tab label readability is at the edge. "DIAG" at 11px/uppercase/600 weight is legible on the Bloomberg dark background but marginally so. Do not go smaller. If tab count ever grows to 6+, compress padding before reducing font size.

### E.2 Inactive state — MARGINAL

`var(--bb-ink-dim)` provides reduced contrast relative to the active tab, which is correct. The concern is whether `bb-ink-dim` passes WCAG AA (4.5:1) against `bb-bg`. This cannot be verified without the actual token values, but given Bloomberg Terminal's high-contrast dark theme, it likely passes. **Flag for contrast-check pass on inactive tab labels against the nav background.** If `bb-ink-dim` is intentionally below 4.5:1 (as a subtle de-emphasis), that is a WCAG violation — inactive tab labels are functional UI text, not decorative.

### E.3 Hover state — PASS

`rgba(255,153,51,0.05)` background + `var(--bb-ink)` text (brighter than inactive). Subtle, directional, on-brand. No focus ring on hover (correct — focus ring only on keyboard focus).

### E.4 Tab bar height — MARGINAL

Padding is `8px 4px`. With 11px font and 1.2 line-height: total computed height = `8 + (11 * 1.2) + 8 = 29.2px`. This is below the 44px touch target minimum (Apple HIG / WCAG 2.5.5). For a desktop Chrome extension popup this is acceptable — there is no touch interaction. If ModTools ever ships a mobile companion or becomes a PWA, this needs to be revisited. No action required now.

---

## F. Badge Dot Assessment

### F.1 Current implementation

Alert dot on Tokens tab (no-token state): 6x6px red circle, pulsing at 1.5s ease-in-out, appended as inline `<span>`. Only Tokens gets a badge today; the infrastructure is not generalized.

### F.2 What is missing

No badge state exists for:
- Stats tab: could receive a "new death row items" alert
- Lead tab: could receive a "pending invites need action" alert
- Diag tab: could receive a "RPC error rate elevated" alert

The badge is currently one-off JS code, not a reusable system. This is acceptable for v10 but is the correct call-out for v10.13 planning.

### F.3 Badge design recommendation for v10.13

The 6x6px dot at 11px font/uppercase is proportionally correct — roughly half the cap-height. The red (#ff3b3b) contrasts well on the Bloomberg dark background. The pulse animation at 1.5s is not distracting.

Proposed generalized badge API for v10.13:

```js
// In wireTabNav, expose a public method:
window.modTabBadge = {
  set(tabName, state) {
    // state: 'alert' (red, pulsing) | 'info' (amber, static) | null (remove)
    const btn = document.querySelector(`.pop-tab[data-tab="${tabName}"]`);
    if (!btn) return;
    let dot = btn.querySelector('.pop-tab-badge');
    if (state === null) { if (dot) dot.remove(); return; }
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'pop-tab-badge';
      btn.appendChild(dot);
    }
    dot.dataset.state = state; // CSS drives color + animation via [data-state]
  }
};
```

CSS drives color and pulse via `[data-state="alert"]` / `[data-state="info"]` attribute selectors — no inline `style.cssText`. This removes the fragility of the current approach.

---

## G. The [hidden] Migration Assessment — Is It Solid?

### G.1 What v10.12 changed

Prior to v10.12, all panels were hidden via `data-tab` + `.pop-tab-hidden` class. v10.12 added `role="tabpanel"` + `hidden` attribute on four of the five panels (Stats, Tokens, Tools, Lead). The Diag panel was not migrated.

### G.2 Is the migration solid for the four migrated panels?

Yes. The `hidden` attribute approach is more semantically correct and more robust for ARIA:
- Screen readers expose `hidden` panels as non-existent (correct per ARIA spec for tabpanels)
- No CSS specificity war required — `hidden` cannot be beaten by `display:grid !important` because... wait, it can. The HTML `hidden` attribute maps to `display:none` in the user-agent stylesheet. Author stylesheets with `!important` CAN override it.

**This is the same bug that was fixed at L1449.** The four migrated panels currently work because they do NOT have Bloomberg `display:grid !important` rules applied to their root elements (the `<div id="tab-panel-*">` wrappers don't have `pop-stats` or `pop-actions` classes). The legacy elements inside those panels (`.pop-stats` inside `#tab-panel-stats`) DO have those classes, but the `hidden` on the parent suppresses the entire subtree — the `display:grid` on the child is irrelevant when the parent is `display:none`.

So the migration is solid today. The fragility would surface only if someone adds `class="pop-stats"` or similar to the panel root element itself. Unlikely but worth documenting.

### G.3 Diag panel migration status — INCOMPLETE

`diagTabSection` must be migrated to match the other four panels:
- Change `id="diagTabSection"` to `id="tab-panel-diag"` (fixes broken `aria-controls`)
- Remove `data-tab="diag"` and `class="pop-tab-hidden"` from the root element
- Add `hidden` attribute initially (same as it's hidden by default now)
- Update any JS references to `#diagTabSection` to `#tab-panel-diag`

---

## H. Recommendations — Priority Ordered

### H.1 [P0 — Fix Now] Diag panel broken ARIA

**Bug:** `aria-controls="tab-panel-diag"` on the Diag tab button resolves to no element. Automated a11y scanners will flag this.

**Fix in popup.html:805:**
```html
<!-- BEFORE -->
<div data-tab="diag" class="pop-tab-hidden" id="diagTabSection"
     role="tabpanel" aria-labelledby="tab-btn-diag">

<!-- AFTER -->
<div id="tab-panel-diag" role="tabpanel" aria-labelledby="tab-btn-diag" hidden>
```

Also remove `data-tab="diag"` from TAB_MAP in wireTabNav (the `diag: []` entry — it's already empty, just remove the key to make it clear Diag is now fully panel-managed).

If any JS references `#diagTabSection` by that ID, update them to `#tab-panel-diag`.

### H.2 [P1 — v10.13] Verify inactive tab label contrast

Run `bb-ink-dim` against `bb-bg` through a contrast checker. Must hit 4.5:1 for WCAG AA. If it does not, the fix is to use a slightly brighter ink-dim value for the tab context only:

```css
.pop-tab { color: var(--bb-tab-ink-inactive, var(--bb-ink-dim)) !important; }
```

This allows a tab-specific override without touching the global token.

### H.3 [P1 — v10.13] Consolidate badge dot to reusable system

Replace the one-off inline badge injection in `detectInitialTab()` with the `window.modTabBadge.set()` API described in F.3. Add CSS for `.pop-tab-badge[data-state="alert"]` (red + pulse) and `.pop-tab-badge[data-state="info"]` (amber, static). This is a 30-line change that unblocks badge use on Stats, Lead, and Diag tabs without further code duplication.

### H.4 [P2 — v10.13] Harden keyboard nav filter

Replace `t.offsetParent !== null` with:
```js
.filter(t => !t.hidden && getComputedStyle(t).display !== 'none')
```
This is spec-correct and defensive against visibility changes that `offsetParent` would miss.

### H.5 [P2 — v10.13] Guard `setTab()` against stale localStorage for Lead

Add a check: if `initial === 'lead'` and the Lead tab button is not visible (`offsetParent === null`), fall back to `'stats'`. One-liner guard prevents a blank panel for users who lost lead status between sessions.

### H.6 [P3 — Hold] Consolidate dual hide/show to `hidden`-only for tabpanels

Long-term, remove `data-tab` from panel root elements and rely exclusively on the `hidden` attribute system for the five `role="tabpanel"` divs. The legacy `data-tab` + class system stays for non-panel elements (`.pop-stats`, `.pop-actions`, etc.) which need it due to Bloomberg specificity wars. This is a structural cleanup, not a bug fix — do it in a dedicated pass, not mixed with feature work.

---

## Summary Table

| Section | Finding | Priority | Action |
|---------|---------|----------|--------|
| C.1 | Diag aria-controls broken (tab-panel-diag id missing) | P0 | Fix in popup.html |
| C.2 | Badge dot inline style + keyframe injection fragile | P1 | Refactor in v10.13 |
| D.1 | Dual hide/show system structural debt | P3 | Cleanup pass |
| D.2 | offsetParent filter not spec-correct | P2 | Harden in v10.13 |
| D.3 | No guard vs stale Lead localStorage | P2 | One-liner in v10.13 |
| E.2 | Inactive tab label contrast unverified | P1 | Audit token values |
| G.3 | Diag panel not migrated to hidden attr | P0 | Same fix as C.1 |
| H.3 | Badge system not reusable | P1 | API in v10.13 |
