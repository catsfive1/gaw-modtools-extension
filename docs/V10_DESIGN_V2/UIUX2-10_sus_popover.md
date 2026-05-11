# UIUX2-10 -- SUS Popover V2 Design Critique & Spec
**Auditor:** UIUX2-10-SUS-POPOVER
**Skill:** frontend-design (hybrid expand-row popover)
**Codebase ref:** `modtools.js` `_showSusPopover()` L17495-17943 (v10.12.3)
**Prior doc:** `docs/V10_DESIGN/UIUX-02_sus_popover.md`
**Date:** 2026-05-10

---

## A. What v1 (UIUX-02) Designed vs What v10.12.3 Actually Shipped

v1 specified the hybrid expand-row pattern and got most of it right on paper. But the gap between the spec and the shipped code is wide enough to matter. This section maps it.

### What shipped correctly

- Collapsed row: `[DR] [⋯] ▶` strip always visible, left zone click-to-expand.
- Lazy drill load: `_loadSusDrillContent` fires `modUserCadence` on first expand, caches with `inner.dataset.loaded`.
- DR button inline: calls `addToDeathRow`, disables itself on success, snacks.
- Tard section: appended below SUS rows with purple `.gam-sus-tard-divider`.
- ESC + click-outside close wired correctly.
- Max-width 500px per spec.
- CSS animations for drill expand (max-height + opacity transition).

### What did NOT ship per v1 spec

| v1 spec item | v10.12.3 reality | Gap severity |
|---|---|---|
| `[⋯]` is an overflow menu (Profile / Ban / Copy username) | `⋯` is a single button that opens `/u/` in a new tab -- identical to Profile. No menu. | Medium -- deceptive affordance |
| Collapsed DR button labeled with delay hint | `[DR]` with no hint it fires 72h. User doesn't know until they expand. | Low -- UX surprise |
| Tard divider has consistent horizontal padding with SUS rows | Divider rendered into `body` div with `padding:6px 0 4px` -- zero horizontal padding. Bleeds differently from 10px-padded rows. | Low -- visual inconsistency |
| Focus trap within popover | Absent entirely. Tab cycles through page behind the popover. | High -- accessibility regression |
| One-expanded-row-at-a-time collapse logic | Collapse loop queries `.gam-sus-row-wrap-outer.expanded` but chevron reset manually touches `ch.style` directly, conflicting with the CSS rule `.gam-sus-row.expanded .gam-sus-chevron`. Double-application of transform reset. | Medium -- can cause stuck chevrons |
| Tard row `[Mark SUS]` button | Tard rows only have `[DR Rule]`. No `[Mark SUS]` for pattern-match suspects. | Low -- deferred is ok |

---

## B. Deep Critique: Is the Hybrid Expand Pattern Working?

**Short answer: structurally yes, but with three real problems.**

### B.1 The chevron reset conflict (real bug)

At L17800-17807, the collapse-all loop does this:

```js
pop.querySelectorAll('.gam-sus-row-wrap-outer.expanded').forEach(function(r) {
  r.classList.remove('expanded');
  const d = r.querySelector('.gam-sus-drill');
  if (d) d.classList.remove('open');
  const ch = r.querySelector('.gam-sus-chevron');
  if (ch) ch.parentElement.closest('.gam-sus-row') && ch.style && (ch.style.transform = '');
  r.querySelector('.gam-sus-row') && r.querySelector('.gam-sus-row').classList.remove('expanded');
});
```

The CSS rule is:
```css
.gam-sus-row.expanded .gam-sus-chevron { transform: rotate(90deg); color: #ff9933; }
```

The JS removes `.expanded` from `rowWrap` (the inner div), which clears the CSS rule. Then it ALSO sets `ch.style.transform = ''` inline -- which is a no-op if the CSS rule is already cleared, but adds an inline style that overrides any future CSS. On the next expand, the CSS rule applies `rotate(90deg)` but `ch.style.transform = ''` (inline) wins over CSS. **The chevron never rotates on the second expand of any previously-collapsed row.**

Fix: remove the `ch.style && (ch.style.transform = '')` line entirely. The CSS rule handles it once `.expanded` is gone.

### B.2 The `⋯` deceptive affordance

The `⋯` button signals "more options" to the user. It delivers exactly one option (profile link), which is already available via the `[Profile →]` link inside the drill panel. This wastes a button slot and trains the user to ignore `⋯` -- exactly the wrong muscle memory for a power-user tool.

Options:
- **A (remove it):** Delete `⋯`. The drill panel already has the profile link. Collapsed row needs `[DR]` and expand indicator only.
- **B (make it real):** Wire a micro-dropdown: `Profile | Copy username | Ban`. Dropdown dismisses on outside-click. This is +40 lines but eliminates the deception.

**Recommendation: Option A.** The popover is a triage surface. If the mod needs the profile they can expand the row. Removing `⋯` cleans the collapsed strip to `[DR] ▶` which is the intended two-action surface.

### B.3 Focus trap is missing

No focus trap = screen-reader users and keyboard-nav users can Tab past the popover into the background page. For a modal-adjacent overlay that intercepts ESC, this is an accessibility hole. The fix is a standard focus-trap: capture Tab/Shift+Tab events inside the popover and cycle between the first and last focusable elements.

Reference implementation is 15 lines and is detailed in section G.

---

## C. Tards Section: Integrated or Bolted-On?

**Bolted-on. Not by a wide margin, but detectably.**

### What feels integrated

- The purple divider (`.gam-sus-tard-divider`) with `::before`/`::after` hairlines is visually coherent. Purple as the tard accent against amber SUS rows reads correctly.
- Lazy fetch from session cache (`gam_tard_suggestions`) with fallback to a "Fetch tard suspects" button is the right data-access pattern. Non-blocking, no RPC on popover open.
- The header update at L17861 (`title.textContent = '... · 🤖 N AI SUSPECTS'`) keeps the count in the header, which is good.

### What feels bolted-on

1. **Horizontal padding mismatch.** The divider has `padding:6px 0 4px` -- no horizontal padding. SUS rows have `padding:5px 10px`. The divider text and pseudo-element lines start at the left edge of the container, not at 10px indent like everything else. It looks like a different component dropped in.

   Fix: add `padding:6px 10px 4px` to `.gam-sus-tard-divider`.

2. **Tard rows have no expand capability.** SUS rows have click-to-expand with activity drill-down. Tard rows are flat -- severity label, pattern string, `[DR Rule]` button. There's no way to investigate a pattern further from inside the popover. This is acceptable given tard rows are patterns (not usernames) but it means the interaction model diverges at the divider.

   If `_newAccountCache` entries are eventually surfaced here (specific users, not patterns), they NEED the same expand-row treatment as SUS rows. Right now the code only handles pattern suggestions, which makes the flat layout correct.

3. **`[DR Rule]` button has no wired handler.** At L17875-17877, the button is built and appended but no `addEventListener` is attached. It is a dead button. The handler was deferred and never shipped. This is the single most broken thing in the tard section.

   Fix: wire `[DR Rule]` to add the pattern to `autoDeathRowRules` -- same mechanism as the tard accordion in the main bar. Or, for V2, change the button label to `Add Rule` and wire it to `rpcCall('modAutoRuleAdd', { pattern: s.pattern, severity: s.severity })`.

---

## D. Click Reduction Audit: What v10.12.3 Actually Achieved

Comparing against v1's projected matrix:

| Outcome | v1 projected | v10.12.3 actual | Delta from projection |
|---|---|---|---|
| Add to DR (72h) | 2 clicks | 2 clicks (open popover, click [DR]) | On target |
| Add to DR (24h) | 3 clicks (open, expand, DR 24h) | 3 clicks | On target |
| Unmark SUS | 2 clicks | 2 clicks (expand needed -- Unmark is in drill panel only) | Worse -- was projected as 2, but Unmark moved to drill panel in implementation. Now 3 clicks. |
| Write a note | 3 clicks (fixed from broken) | 3 clicks (open, expand, type+save) | On target, note is now real |
| View history snapshot | 2 clicks (open, expand) | 2 clicks | On target |
| View tard suspects | 1 click (scroll) | 1 click if cache warm; 2 clicks if cache cold (open + click Fetch) | On target |
| Add tard DR Rule | 2 clicks | 0 clicks -- button is dead | REGRESSION |

**Critical miss: Unmark is buried in the drill panel.** v1's collapsed strip was `[DR] [Unmark]` per the ASCII mockup at section F. The implementation shipped `[DR] [⋯]` where `[⋯]` became a profile link. Unmark was moved into the drill panel, adding an extra click. For a moderation tool where Unmark is the "false positive" action and needs to be fast, this is meaningful friction.

---

## E. V2 Fixes -- Prioritized

### E.1 Critical (ship before next Commander session)

**E.1.a Fix the chevron reset bug**

Remove the manual `ch.style.transform = ''` from the collapse-all loop. CSS rule handles it. One line deleted.

Location: L17806
```js
// DELETE this line:
if (ch) ch.parentElement.closest('.gam-sus-row') && ch.style && (ch.style.transform = '');
```

**E.1.b Wire the [DR Rule] button in tard rows**

The button is built at L17875 but has no handler. Wire it:

```js
drRuleBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  drRuleBtn.disabled = true;
  drRuleBtn.textContent = '...';
  rpcCall('modAutoRuleAdd', { pattern: s.pattern, severity: s.severity || 'medium' })
    .then(function() {
      drRuleBtn.textContent = 'Added';
      try { snack('Auto-DR rule added: ' + s.pattern, 'success'); } catch(_) {}
    })
    .catch(function(err) {
      drRuleBtn.disabled = false;
      drRuleBtn.textContent = 'DR Rule';
      try { snack('Rule add failed: ' + (err && err.message || err), 'error'); } catch(_) {}
    });
});
```

If `modAutoRuleAdd` RPC does not exist, fall back to `chrome.storage.local` write to the `autoDeathRowRules` key -- same mechanism the tard accordion uses.

**E.1.c Add Unmark back to collapsed strip**

The collapsed strip must be `[DR] [Unmark] ▶`. Unmark at 2 clicks is a design requirement, not a nice-to-have. It was projected that way in v1 and the implementation regressed it.

In `_buildSusRow`, in the `actStrip` assembly block, add an Unmark button after `drBtn`:

```js
const unmarkBtn = document.createElement('button');
unmarkBtn.textContent = 'Unmark';
unmarkBtn.title = 'Unmark as SUS';
unmarkBtn.style.cssText = 'background:transparent;border:1px solid #ff9933;color:#ff9933;padding:1px 5px;cursor:pointer;font:600 9px ui-monospace,monospace;letter-spacing:0.04em;text-transform:uppercase;white-space:nowrap';
unmarkBtn.addEventListener('click', async function(e) {
  e.stopPropagation();
  unmarkBtn.disabled = true; unmarkBtn.textContent = '...';
  try {
    await rpcCall('modSusClear', { username: username, client_op_id: __makeReqId() });
    if (typeof _susState === 'object' && _susState && _susState.rows) {
      _susState.rows.delete(String(username).toLowerCase());
    }
    try { _susApplyDecorations(true); } catch(_) {}
    outerWrap.remove();
    const remaining = pop.querySelectorAll('[data-sus-row]').length;
    title.textContent = '🚩 SUS -- ' + remaining + ' FLAGGED';
    try { snack('✓ ' + username + ' unmarked SUS', 'success'); } catch(_) {}
  } catch(err) {
    try { snack('Unmark failed: ' + (err && err.message || err), 'error'); } catch(_) {}
    unmarkBtn.disabled = false; unmarkBtn.textContent = 'Unmark';
  }
});
actStrip.appendChild(unmarkBtn);
```

Remove the duplicate Unmark from the drill panel actions (or keep it -- it's not wrong to have both, just redundant). Keep in drill panel for discoverability; also have it on collapsed strip for speed.

### E.2 High (V2 scope)

**E.2.a Remove `⋯` button OR make it a real dropdown**

Recommendation is removal. The drill panel has the profile link. If the decision is to keep `⋯`, the dropdown needs at minimum: Profile | Copy username. Ban belongs in the drill panel, not a dropdown -- it's dangerous enough to require seeing the user's context first.

If removing: delete `moreBtn` construction and wiring at L17769-17839.

**E.2.b Fix tard divider horizontal padding**

Change the divider style from `padding:6px 0 4px` to `padding:6px 10px 4px` in the `.gam-sus-tard-divider` CSS rule at L17538.

**E.2.c Collapsed DR button tooltip**

Add `drBtn.title = 'Add to Death Row (72h)'` -- already present at L17757. Good. But add the delay hint visually:

Change `drBtn.textContent = 'DR'` to `drBtn.textContent = 'DR 72h'`.

This removes ambiguity. The user sees `[DR 72h]` on the collapsed strip and `[DR 72h] [DR 24h]` in the drill panel. Consistent labeling.

### E.3 Next minor (focus trap)

**E.3.a Focus trap implementation**

After `document.body.appendChild(pop)`:

```js
// Focus trap
var _focusTrap = (function() {
  var focusable = 'button:not(:disabled),a[href],textarea,input,[tabindex]:not([tabindex="-1"])';
  function _getFocusable() {
    return Array.from(pop.querySelectorAll(focusable)).filter(function(el) {
      return !el.closest('[style*="display:none"]');
    });
  }
  function _handler(ev) {
    if (ev.key !== 'Tab') return;
    var els = _getFocusable();
    if (els.length === 0) return;
    var first = els[0], last = els[els.length - 1];
    if (ev.shiftKey) {
      if (document.activeElement === first) { ev.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  }
  pop.addEventListener('keydown', _handler);
  // Set initial focus to close button
  closeBtn.focus();
  return { destroy: function() { pop.removeEventListener('keydown', _handler); } };
})();
```

In `_closePop`, add `_focusTrap.destroy()`.

---

## F. Visual Specification V2 (Updated)

### Collapsed state (V2)

```
+----------------------------------------------------------+
| SUS -- 4 FLAGGED  *  3 AI SUSPECTS                  [x] |
+----------------------------------------------------------+
|                                                          |
|  [>] [flag] dirtbag_larry    14 cmts/24h  [DR 72h][Unmark] |
|     shill posting, iran talking points                   |
|     marked by PATRIOT_MIKE * 2h ago                      |
|  -------------------------------------------------------  |
|  [>] [flag] newshill99        3 cmts/24h  [DR 72h][Unmark] |
|     copy-paste narrative drops                           |
|     marked by you * 47m ago                              |
|  -------------------------------------------------------  |
|  --- AI SUSPECTS (pattern match) -----------------------  |  <- purple hairlines
|  HIGH  throwaway_2024_*   [DR Rule]                      |
|  MED   glowie_pattern_*   [DR Rule]                      |
|  LOW   shill_bot_*        [DR Rule]                      |
|  -------------------------------------------------------  |
|  Open Death Row ->                                       |
+----------------------------------------------------------+
```

### Expanded state (one row open)

```
+----------------------------------------------------------+
| SUS -- 4 FLAGGED  *  3 AI SUSPECTS                  [x] |
+----------------------------------------------------------+
|                                                          |
|  [v] [flag] dirtbag_larry    14 cmts/24h  [DR 72h][Unmark] |
|     shill posting, iran talking points                   |
|     marked by PATRIOT_MIKE * 2h ago                      |
|    +----------------------------------------------------+ |
|    | LAST ACTIVITY                                      | |
|    | "Biden is a genius..." * r/gaw * 14m ago           | |
|    | "The media never lies..." * r/gaw * 1h ago         | |
|    | "Sauce this" * r/gaw * 2h ago       [Profile ->]   | |
|    |----------------------------------------------------|  |
|    | ACTIONS                                            | |
|    | [DR 72h] [DR 24h] [Unmark] [Ban] [Note v]         | |
|    |----------------------------------------------------|  |
|    | Add mod note...                                    | |
|    | [Save note]                                        | |
|    +----------------------------------------------------+ |
|  -------------------------------------------------------  |
|  [>] [flag] newshill99        3 cmts/24h  [DR 72h][Unmark] |
```

### Color tokens (unchanged from v10.12.3, confirmed correct)

| Token | Value | Use |
|---|---|---|
| `--sus-bg` | `#131316` | Popover background |
| `--sus-border` | `#3d3a35` | Default borders |
| `--sus-hdr` | `#0a0a0b` | Header/drill inner background |
| `--sus-text` | `#e8e6e1` | Primary text |
| `--sus-muted` | `#9b9892` | Secondary text |
| `--sus-ghost` | `#5a5752` | Meta text, disabled states |
| `--sus-amber` | `#ffd84d` | Username highlight, DR button |
| `--sus-orange` | `#ff9933` | Chevron expanded, Unmark button |
| `--sus-red` | `#ff3b3b` | SUS header, Ban button, hot count |
| `--sus-green` | `#3dd68c` | DR fired state |
| `--sus-purple` | `#a855f7` | Tard section accent |
| `--sus-blue` | `#66ccff` | Profile link |

---

## G. CSS Deltas V2 (changes from v10.12.3)

```css
/* FIX E.2.b: tard divider horizontal padding to match row padding */
.gam-sus-tard-divider {
  padding: 6px 10px 4px;  /* was: 6px 0 4px */
}

/* NEW E.1.c: Unmark button in collapsed strip */
.gam-sus-unmark-strip {
  background: transparent;
  border: 1px solid #ff9933;
  color: #ff9933;
  padding: 1px 5px;
  cursor: pointer;
  font: 600 9px ui-monospace, monospace;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  transition: background 80ms;
}
.gam-sus-unmark-strip:hover {
  background: rgba(255, 153, 51, 0.12);
}
.gam-sus-unmark-strip:disabled {
  opacity: 0.5;
  cursor: default;
}

/* FIX E.2.c: DR button shows delay in collapsed strip */
/* (no CSS change needed -- textContent change in JS) */

/* NEW E.3.a: focus-visible ring for keyboard nav */
#gam-sus-popover button:focus-visible,
#gam-sus-popover a:focus-visible,
#gam-sus-popover textarea:focus-visible {
  outline: 1px solid #ffd84d;
  outline-offset: 1px;
}
```

---

## H. Implementation Sequence (V2)

Ordered by risk/impact. Each step is independently shippable.

### Step 1 -- Bug fixes (no UX change, ship immediately)

1. **Chevron reset conflict** (E.1.a) -- delete one line at L17806. Parse-verify after.
2. **Tard divider padding** (E.2.b) -- one CSS string change at L17538. No behavior change.
3. **DR Rule button wiring** (E.1.b) -- ~20 lines added inside `_renderTardSection`. Touches L17876.

Risk: None. Pure additive or surgical deletion.

### Step 2 -- Click reduction (core UX improvement)

4. **Unmark on collapsed strip** (E.1.c) -- ~25 lines in `_buildSusRow`. Duplicate handler alongside drill panel Unmark is fine.
5. **DR button label** (E.2.c) -- one textContent change at L17756. Trivial.
6. **Remove `⋯` button** (E.2.a) -- delete moreBtn construction (L17769) and wiring (L17836-17839). Four lines deleted. The profile link in the drill panel covers the use case.

Risk: Low. Click count for Unmark goes from 3 back to 2 (projected). DR label is a cosmetic clarification.

### Step 3 -- Accessibility (next minor)

7. **Focus trap** (E.3.a) -- ~20 lines added after `document.body.appendChild(pop)`. Requires updating `_closePop` to call `_focusTrap.destroy()`.

Risk: Low. Self-contained. Focus is set to `closeBtn` on open which is correct behavior.

### Step 4 -- Deferred (V2.1)

- Tard section: surface `_newAccountCache` specific users as expandable rows (same pattern as SUS rows, purple border-left accent).
- `[⋯]` real dropdown if decision reverses -- Profile | Copy username.
- Batch DR action (select multiple rows, DR all at once).

---

## I. Reused Helpers (unchanged from v1 spec)

All helpers identified in v1 section I are confirmed present and unchanged in v10.12.3. Specific confirmation:

- `addToDeathRow` -- confirmed called correctly at L17824, L17610
- `rpcCall('modSusClear')` -- confirmed at L17630; reuse for collapsed Unmark button
- `rpcCall('modProfilesWritePatch')` -- confirmed at L17673; note save is working
- `rpcCall('modUserCadence')` -- confirmed at L17577; lazy-load pattern with `inner.dataset.loaded` guard is correct
- `chrome.storage.session.get(['gam_tard_suggestions'])` -- confirmed at L17885; cache read pattern is correct
- `_susApplyDecorations(true)` -- confirmed at L17634; must be called after any SUS state mutation
- `snack()`, `timeAgo()`, `escapeHtml()`, `__makeReqId()` -- all confirmed present

No new RPCs or helpers required for steps 1-3. Step 4 (new account cache surfacing) would need `_newAccountCache` read access, confirmed populated by `modUserCadence` at L11331.

---

## J. Effort Estimate V2

| Step | Change | Lines | Risk | Est |
|---|---|---|---|---|
| 1a: Chevron fix | Delete 1 line | -1 | None | 5 min |
| 1b: Tard divider padding | Change 1 CSS string | ~1 | None | 5 min |
| 1c: DR Rule wiring | Add handler | +20 | Low | 20 min |
| 2a: Unmark collapsed strip | Add button + handler | +25 | Low | 30 min |
| 2b: DR 72h label | Change textContent | +1 | None | 5 min |
| 2c: Remove ⋯ button | Delete 4 lines | -4 | Low | 10 min |
| 3: Focus trap | Add 20-line trap | +22 | Low | 20 min |
| **Total** | | **~+65, -5** | | **~1.5h** |

V2 is a contained patch. No structural refactor. Every change is additive or surgical deletion against the existing `_showSusPopover` function.

---

## K. Summary Verdict

The hybrid expand-row pattern from v1 landed correctly in v10.12.3. The bones are right. The three issues that matter:

1. **`[⋯]` is a lie** -- one button promising a menu and delivering a single link. Remove it.
2. **Unmark regressed to 3 clicks** -- it belongs on the collapsed strip. Add it back.
3. **`[DR Rule]` buttons are dead** -- the tard section's only action is unwired. Fix before showing this to anyone.

Everything else is polish (divider padding, chevron CSS conflict, focus trap). The tard section is not bolted-on structurally but is visually misaligned and has a dead button that makes the entire section feel unfinished. The section's integration improves substantially once the DR Rule handler is wired and the divider padding is aligned.

The expand animation, lazy drill-load, DR inline wiring, note form, and ESC/click-outside are all working correctly.
