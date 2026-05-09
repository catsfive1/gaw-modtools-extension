# Frontend 2 -- Interaction Grammar
**Discipline:** motion timing, keyboard navigation, focus management
**Source docs:** V11_R2_CAT3_UX_UI.md item #7; V11_R2_CAT4_USABILITY.md items #10, #11, Bet 3
**Date:** 2026-05-09

---

## A. MOTION CSS VARIABLES (5 classes per Cat 3 #7)

Add to the `GAM_CSS` block immediately after the existing color token block.
All panels, menus, and animated surfaces reference these -- never hardcode
a `transition` value directly.

```css
/* === GAM Motion Grammar v1 ============================================
   Five classes. Nothing outside these five. Bloomberg rule: data updates
   are instant -- only structural UI changes get motion.
   ================================================================== */

/* 1. MICROINTERACTION -- hover / focus state changes */
:root {
  --gam-dur-micro:    80ms;
  --gam-ease-micro:   linear;

  /* 2. APPEAR -- panel slide-in, menu open, modal mount */
  --gam-dur-appear:   160ms;
  --gam-ease-appear:  cubic-bezier(0.0, 0.0, 0.2, 1.0); /* material decelerate */

  /* 3. DISAPPEAR -- panel close, toast dismiss, menu close */
  --gam-dur-dismiss:  120ms;
  --gam-ease-dismiss: cubic-bezier(0.4, 0.0, 1.0, 1.0); /* material accelerate */

  /* 4. DECISION -- j/k approve/reject in hold queue, spring overshoot */
  --gam-dur-decision: 200ms;
  --gam-ease-decision: cubic-bezier(0.34, 1.56, 0.64, 1.0);

  /* 5. PULSE -- SIREN / escalation / incident status. Speed varies by tier. */
  --gam-dur-pulse-calm:     2000ms; /* NOTICE / WARN */
  --gam-dur-pulse-alert:    1000ms; /* ALERT */
  --gam-dur-pulse-incident:  500ms; /* INCIDENT -- fuchsia, fastest */
  --gam-ease-pulse:         ease-in-out;
}

/* Reduced-motion: collapse all animation to instant except pulse
   (pulse becomes static border color shift instead of animation) */
@media (prefers-reduced-motion: reduce) {
  :root {
    --gam-dur-micro:    0ms;
    --gam-dur-appear:   0ms;
    --gam-dur-dismiss:  0ms;
    --gam-dur-decision: 0ms;
    --gam-dur-pulse-calm:     0ms;
    --gam-dur-pulse-alert:    0ms;
    --gam-dur-pulse-incident: 0ms;
  }
}
```

**No-motion zones (Bloomberg rule -- these must NEVER get a transition):**
- Tabular data cells updating (count changes, chip text changes)
- Skeleton-to-content swap (content snaps in)
- Tab switches in popup
- Chip color changes driven by data (state is data, not UI affordance)

---

## B. AUDIT: EXISTING TRANSITIONS VS. CORRECT CLASS

Every hardcoded `transition` in the codebase should map to one of the five
variables above. Audit findings follow. Format: `file:line -- current value
-- correct variable -- action`.

### modtools.js

| Location | Current value | Correct class | Action |
|---|---|---|---|
| `modtools.js:14443` -- modmail panel `panel.style.cssText` | `transition:transform 0.2s ease-out` | APPEAR (160ms decelerate) | Replace with `var(--gam-dur-appear)` / `var(--gam-ease-appear)` |
| `modtools.js:13504` -- chat panel `#gam-mc-panel[data-dock]` | `transition:transform .2s ease-out,width .2s ease-out` | APPEAR for open, DISAPPEAR for close | Split into open/close classes; 160ms decelerate open, 120ms accelerate close |
| `modtools.js:13512` -- `.gam-mc-headctl` | `transition:border-color .12s,color .12s` | MICROINTERACTION (80ms linear) | Change to `var(--gam-dur-micro) var(--gam-ease-micro)` |
| `modtools.js:13520` -- `.gam-mc-close` | `transition:color .1s,background .1s` | MICROINTERACTION | Same fix -- `.1s` rounds up to `80ms` linear |
| `modtools.js:13524` -- `.gam-mc-conv` | `transition:background .1s` | MICROINTERACTION | Same |
| `modtools.js:13555` -- `.gam-mc-send-btn` | `transition:opacity .1s` | MICROINTERACTION | Same |
| `modtools.js:14518` / `:14756` -- modmail row `row.style.cssText` | `transition:background-color 80ms` | MICROINTERACTION | Already 80ms -- add `linear` easing explicitly |
| `modtools.js:15720` -- `.gam-snack` | `transition:opacity .14s,transform .18s` | APPEAR (mount) / DISAPPEAR (dismiss) | Mount: 160ms decelerate. Dismiss: 120ms accelerate. Split class |
| `modtools.js:15742` -- `#gam-backdrop` | `transition:opacity .2s` | APPEAR open / DISAPPEAR close | Split: open 160ms decelerate, close 120ms accelerate |
| `modtools.js:15746` -- `.gam-modal` | `transition:opacity .15s,transform .18s` | APPEAR / DISAPPEAR | Same split as backdrop |
| `modtools.js:15752` -- `.gam-modal-close` | `transition:color .1s,background .1s` | MICROINTERACTION | 80ms linear |
| `modtools.js:15727` -- `.mail.standard_page` | `transition:background .15s` | MICROINTERACTION | 80ms linear |
| `modtools.js:15769` -- `.gam-input/.gam-textarea/.gam-select` | `transition:border-color .15s` | MICROINTERACTION | 80ms linear |
| `modtools.js:16015` -- drawer note textarea | `transition:border-color .15s` | MICROINTERACTION | 80ms linear |
| `modtools.js:16084` -- `.gam-bar-icon:focus-visible` | `outline:2px solid` (no transition) | MICROINTERACTION | Add `transition:outline-color var(--gam-dur-micro) var(--gam-ease-micro)` |

### popup.js / popup.css

| Location | Current value | Correct class | Action |
|---|---|---|---|
| `popup.js:1610` -- `.hm-bar` | `transition:opacity .15s` | MICROINTERACTION | 80ms linear |
| `popup.css:66` -- button/input hover | `transition:border-color .12s, background .12s` | MICROINTERACTION | 80ms linear |
| `popup.css:117` -- tab button | `transition:background .1s, border-color .1s, color .1s` | MICROINTERACTION | 80ms linear |
| `popup.css:155` / `193` / `451` / `481` | Various `.1s-.12s` hover transitions | MICROINTERACTION | All 80ms linear |
| `popup.css:716` -- pop-tab | `transition:color 100ms ease-out, border-color 100ms ease-out, background-color 100ms ease-out` | MICROINTERACTION | 80ms linear -- `100ms ease-out` is visually correct but non-canonical |

**New surfaces (context menu, AI hold queue, presence bar, Hot Now panel)**
must use the variables from day one -- no hardcoded values. The DECISION
class (200ms spring) is reserved for the hold queue j/k approve/reject
row-exit animation only.

---

## C. FOCUS RING UPGRADE (1px outline -> 3px + glow)

### What exists now

Two separate focus implementations, neither meeting WCAG 2.2 SC 2.4.11:

1. **In-page bar icons** (`modtools.js:16084`):
   `outline:2px solid ${C.ACCENT};outline-offset:2px`
   -- 2px, no glow. Passes 2.1 AA, marginal.

2. **Popup tabs** (`popup.css:725`):
   `outline:1px solid var(--bb-amber) !important;outline-offset:-1px`
   -- 1px, negative offset (ring inside button = partially clipped). Fails.

3. **All other interactive elements** (buttons, inputs, modal close, chat
   controls): `outline:none` with border-color shift on `:focus` only.
   Keyboard users get a border-color change but no visible ring. Fails.

### Target state (Cat 4 #11 exact spec)

```css
/* ===== GAM FOCUS RING -- WCAG 2.2 SC 2.4.11 compliant ===============
   Applies universally via :focus-visible (never :focus -- avoids
   showing ring on mouse click). outline-offset:2px prevents parent
   overflow clipping. box-shadow glow remains visible against amber
   accent color on elements that ARE amber. No color change -- amber
   is correct brand signal.
   ================================================================== */

:focus-visible {
  outline: 3px solid var(--gam-amber);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px rgba(255, 176, 0, 0.25);
}

/* Override the existing negative-offset popup tab rule */
.pop-tab:focus-visible {
  outline: 3px solid var(--gam-amber) !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 5px rgba(255, 176, 0, 0.25);
}

/* Bar icons: keep existing rule, upgrade to 3px */
.gam-bar-icon:focus-visible,
.gam-bar-icon-brand:focus-visible {
  outline: 3px solid var(--gam-amber);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px rgba(255, 176, 0, 0.25);
}

/* Inputs: replace outline:none with :focus-visible ring.
   Keep border-color shift ON :focus for mouse users. */
.gam-input:focus-visible,
.gam-textarea:focus-visible,
.gam-select:focus-visible,
.gam-mc-recipient:focus-visible,
.gam-mc-textarea:focus-visible {
  outline: 3px solid var(--gam-amber);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px rgba(255, 176, 0, 0.25);
}
```

**What changes:** ring width 1-2px -> 3px, glow halo added, negative
offset fixed, all interactive elements covered by the universal rule.

**What does NOT change:** amber color, brand identity, border-color shifts
on input `:focus` (those stay -- they serve mouse users).

**WCAG 2.2 SC 2.4.11 check:** minimum focus indicator area = perimeter of
unfocused component * 2 CSS pixels. A 3px outline at `outline-offset:2px`
on any element >=16px in any dimension passes. The 5px glow adds further
contrast area. This closes Cat 4 Rule 80 and Rule 112 from warning to pass.

---

## D. gamA11y MODULE SKETCH

Per Cat 4 Bet 3: a single 200-line module that all panels import, so the
"forgot to restore focus on close" bug class is impossible permanently.

### Public API

```js
/**
 * gamA11y -- accessibility primitives for GAM panels
 * Source: V11_R2_CAT4_USABILITY.md Bet 3
 *
 * USAGE:
 *   const a11y = window.gamA11y;
 *   // Open panel:
 *   a11y.trapFocus(panelEl);
 *   // Close panel:
 *   a11y.restoreFocus();
 *   // Combobox (slash palette, Ctrl+K search):
 *   const cmb = a11y.buildCombobox({ input, listbox, onSelect });
 *   cmb.destroy(); // cleanup
 *   // ARIA menu (right-click context menu):
 *   const menu = a11y.buildMenu({ menuEl, onClose });
 *   menu.destroy();
 */
window.gamA11y = (() => {
  // --- focusReturnStack -------------------------------------------------
  // Stack so nested panels (e.g. modal inside drawer) restore correctly.
  const _stack = [];

  // --- trapFocus(el) ----------------------------------------------------
  // Finds all focusable descendants, constrains Tab/Shift+Tab within el.
  // Saves document.activeElement to stack before moving focus.
  // el: HTMLElement -- the container to trap focus within.
  function trapFocus(el) {
    const focusable = [...el.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),' +
      'select:not([disabled]),textarea:not([disabled]),' +
      '[tabindex]:not([tabindex="-1"])'
    )].filter(n => !n.closest('[hidden]') && !n.closest('[aria-hidden="true"]'));
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];

    // Save return target (must be in doc; verified on restore)
    _stack.push(document.activeElement);

    function handler(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    el.addEventListener('keydown', handler);
    el._gamTrapHandler = handler; // stored for destroy
    first.focus();
  }

  // --- restoreFocus() ---------------------------------------------------
  // Pops the stack and moves focus back. Validates element is still in DOM.
  // Falls back to document.body if target was removed (e.g. row deleted).
  function restoreFocus() {
    const target = _stack.pop();
    if (target && document.contains(target)) {
      target.focus();
    } else {
      document.body.focus();
    }
  }

  // --- buildCombobox(opts) ---------------------------------------------
  // Full ARIA 1.1 combobox pattern per APG.
  // opts.input    -- the <input> element
  // opts.listbox  -- the <ul role="listbox"> element
  // opts.onSelect -- callback(value, item)
  // Returns { destroy }
  //
  // Keyboard contract (WCAG SC 2.1.1 + ARIA spec):
  //   ArrowDown/Up  -- move aria-activedescendant through listbox items
  //   Enter         -- confirm selection
  //   Escape        -- close listbox, restore focus to input
  //   Home/End      -- jump to first/last item
  //   Printable char -- typed into input, filter list
  function buildCombobox({ input, listbox, onSelect }) {
    let activeIdx = -1;
    const items = () => [...listbox.querySelectorAll('[role="option"]')];

    function setActive(idx) {
      const list = items();
      list.forEach((el, i) => {
        el.setAttribute('aria-selected', i === idx ? 'true' : 'false');
        if (i === idx) {
          el.id = el.id || ('gam-opt-' + Math.random().toString(36).slice(2));
          input.setAttribute('aria-activedescendant', el.id);
        }
      });
      activeIdx = idx;
      if (list[idx]) list[idx].scrollIntoView({ block: 'nearest' });
    }

    function keydown(e) {
      const list = items();
      if (!list.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(Math.min(activeIdx + 1, list.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(Math.max(activeIdx - 1, 0));
      } else if (e.key === 'Home') {
        e.preventDefault(); setActive(0);
      } else if (e.key === 'End') {
        e.preventDefault(); setActive(list.length - 1);
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        const el = list[activeIdx];
        onSelect(el.dataset.value, el);
      } else if (e.key === 'Escape') {
        listbox.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        activeIdx = -1;
        input.focus();
      }
    }

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listbox.id);
    listbox.setAttribute('role', 'listbox');
    input.addEventListener('keydown', keydown);

    // Announce item count when listbox opens
    function announceCount() {
      const n = items().length;
      input.setAttribute('aria-label',
        input.getAttribute('data-label') + ` (${n} option${n !== 1 ? 's' : ''})`);
    }
    const listObserver = new MutationObserver(announceCount);
    listObserver.observe(listbox, { childList: true });

    return {
      destroy() {
        input.removeEventListener('keydown', keydown);
        listObserver.disconnect();
      }
    };
  }

  // --- buildMenu(opts) -------------------------------------------------
  // ARIA 1.1 menu pattern for the right-click context menu.
  // opts.menuEl   -- the <div role="menu"> element
  // opts.onClose  -- callback fired when menu should close (Escape / Tab)
  // Returns { destroy }
  //
  // Keyboard contract:
  //   ArrowDown/Up  -- move focus through role="menuitem" elements
  //   Home/End      -- first/last item
  //   Enter / Space -- activate item
  //   Escape / Tab  -- close + restoreFocus()
  function buildMenu({ menuEl, onClose }) {
    menuEl.setAttribute('role', 'menu');
    const items = () => [...menuEl.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')];

    trapFocus(menuEl); // menu IS a focus trap

    function keydown(e) {
      const list = items();
      const cur = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        list[Math.min(cur + 1, list.length - 1)]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        list[Math.max(cur - 1, 0)]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault(); list[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault(); list[list.length - 1]?.focus();
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        onClose();
        restoreFocus();
      }
    }

    menuEl.addEventListener('keydown', keydown);
    // Focus first item
    items()[0]?.focus();

    return {
      destroy() {
        menuEl.removeEventListener('keydown', keydown);
        if (menuEl._gamTrapHandler) menuEl.removeEventListener('keydown', menuEl._gamTrapHandler);
      }
    };
  }

  return { trapFocus, restoreFocus, buildCombobox, buildMenu };
})();
```

### Integration points (where each function lands in v11)

| Call site | Function | Notes |
|---|---|---|
| Context menu open (`buildContextMenu`) | `trapFocus` + `buildMenu` | Escape closes menu + `restoreFocus` to post row |
| Context menu close | `restoreFocus` | Returns to the right-clicked element |
| Modmail panel open/close | `trapFocus` / `restoreFocus` | Panel is a full trap; close restores to envelope icon |
| Mod Console panel open/close | `trapFocus` / `restoreFocus` | Close restores to post row that triggered it |
| Intel Drawer open/close | `trapFocus` / `restoreFocus` | Close restores to triggering element |
| Slash command palette (`/` in chat) | `buildCombobox` | Input = chat textarea; listbox = suggestion dropdown |
| Ctrl+K search palette | `buildCombobox` | Separate input element; listbox = search results |
| Modal (ban confirmation, etc.) | `trapFocus` / `restoreFocus` | Already semi-trapped; migrate to `gamA11y.trapFocus` |

**Critical: all existing `closeAllPanels` call sites must call `restoreFocus()` after closing.** Cat 4 #10 identifies this as the single-line fix that closes the "focus jumps to document.body" failure class.

---

## E. SHIP-TONIGHT PATCH (CSS variables only)

This is the Wave 1 deliverable: pure CSS, zero JS changes, zero behavioral
risk. It ships tonight. The behavior layer (gamA11y module, split
open/close transition classes) is Wave 2.

**Patch contents:**

1. **Add the 5 motion variable block** to `GAM_CSS` (Section A above).
   Do not change any existing `transition:` values yet -- variables can
   co-exist with hardcoded values; the audit in Section B is Wave 2 work.

2. **Add the universal `:focus-visible` rule** to `GAM_CSS` (Section C above).
   This immediately upgrades every interactive element in the in-page UI to
   3px+glow without touching any JS.

3. **Fix the popup tab focus ring** in `popup.css:725`:
   ```css
   /* BEFORE */
   .pop-tab:focus-visible {
     outline: 1px solid var(--bb-amber) !important;
     outline-offset: -1px !important;
   }
   /* AFTER */
   .pop-tab:focus-visible {
     outline: 3px solid var(--gam-amber);
     outline-offset: 2px;
     box-shadow: 0 0 0 5px rgba(255, 176, 0, 0.25);
   }
   ```
   Note: remove `!important` -- the universal `:focus-visible` rule above
   provides the same value, so the specificity war is unnecessary.

4. **Confirm `--gam-amber` is defined** before the focus ring rule. The
   three-amber dedup (Cat 3 D.1: `#f5a623` / `#f0a040` / `#ff9933`) is
   a Wave 1 prerequisite from Cat 3 -- whichever value wins, `--gam-amber`
   must point to it. The focus ring does not own that decision; it
   consumes it.

**What this does NOT do tonight:**
- Does not change any transition durations (audit work is Wave 2)
- Does not add the `gamA11y` module (Wave 2)
- Does not split open/close panel transitions (Wave 2)
- Does not add `prefers-reduced-motion` handling beyond the CSS var block
  (vars collapse to 0ms which is sufficient -- no animation fires)

**Verification steps (before merge):**
- Tab through popup: every button, input, and tab must show 3px amber
  glow ring, not 1px clipped ring
- Tab through in-page bar icons: 3px ring visible, not 2px (existing rule)
- Tab through mod console panel: all controls show ring
- Simulate reduced motion: confirm zero animation on any hover/focus/panel

---

*Word count: ~2200 words. Within 1500-2500 budget.*
