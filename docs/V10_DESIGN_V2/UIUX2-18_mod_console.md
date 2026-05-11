# UIUX2-18: Mod Console Redesign — v2

**Component:** `#gam-mc-panel` / `openModConsole()` — the primary moderation action surface.
**Keyboard entry:** Ctrl+Shift+M; also opened by username clicks, hammer buttons, HotNow panel.
**Tabs:** INTEL / BAN / NOTE / MESSAGE / QUICK / OP DELETES (6 total as of v10.9.0).
**Prior spec:** UIUX-14_mod_console.md (v1, read-only design document).
**Codebase snapshot:** v10.12.3, `modtools.js` lines 7960–10348.
**Status:** Design spec for implementation. Read-only.

---

## A. Gap Audit — What v1 Specified vs. What v10.12.3 Shipped

v1 (UIUX-14) was a design-only document. None of its redesign specifications have been implemented. This is the full delta.

### A.1 Keyboard Tab Switching (1-6) — NOT IMPLEMENTED

v1 specified number keys 1–6 to switch tabs with Alt+number as fallback. v10.12.3 state: the `openModConsole()` tab nav loop at lines 8052–8059 builds six `<button class="gam-mc-tab">` elements with `onclick: ()=>renderTab(t.id)`. There is no `keydown` handler on the panel or the nav. Switching tabs requires a mouse click. This is the highest-frequency ergonomic miss — mods switching from INTEL to BAN to QUICK touch the mouse every time.

The tab definitions array (line 8019) still uses full emoji-prefixed labels: `📊 Intel`, `🔨 Ban`, `📋 Note`, `↩️ Message`, `⚡ Quick`, `🗑 OP Deletes`. The v1 proposal to replace with `1·INTEL`, `2·BAN`, etc. has not been applied. OP Deletes tab overflows its button at narrow viewports.

**v1 compliance: 0%.**

### A.2 Ctrl+Enter Submit — NOT IMPLEMENTED

v1 specified Ctrl+Enter on BAN, NOTE, and MESSAGE tabs. Actual state:

- **BAN tab:** `mc-ban-go` button has a direct `click` listener attached in `renderBanTab`. No `keydown` listener anywhere in the function (checked lines 8608–9557).
- **NOTE tab:** `mc-note-save` button attached at line 9667. No `keydown` handler for Ctrl+Enter.
- **MESSAGE tab:** `mc-msg-send` button attached in `renderMessageTab`. No Ctrl+Enter handler.

Auto-focus on the primary textarea (`#mc-ban-msg`, `#mc-note-body`, `#mc-msg-body`) fires via `setTimeout` at line 8046. The textarea has focus. Ctrl+Enter does nothing. This means a mod who types a full ban message must reach for the mouse every single time.

**v1 compliance: 0%.**

### A.3 j/k Navigation in QUICK Tab — NOT IMPLEMENTED

v1 provided the exact implementation sketch (B.4). Actual `renderQuickTab` (lines 9980–10044): 11 `<button class="gam-mc-quick">` tiles, all wired with `addEventListener('click')`. No `keydown` listener. No `tabIndex` management. Tiles are not focusable via keyboard at all — the focus trap installed at line 8069 cycles through all interactive elements but the tiles have no logical navigation order for j/k.

The perma-ban tile (line 10008) still has its icon colored `C.RED` but the tile background is unchanged — the red styling is only the emoji, not the tile container.

**v1 compliance: 0%.**

### A.4 BAN Tab — Duration Keyboard Shortcuts — NOT IMPLEMENTED

v1 specified `p` = perma, `7` = 7d, `3` = 3d, `1` = 1d, `w`/`0` = warning, scoped to the BAN tab. The duration row at line 8656 is click-only `.gam-mc-dur` buttons. No keyboard handler attached in `renderBanTab`.

Duration + violation are still on separate rows (lines 8629–8659), not merged into one row as v1 specified. The duration selection requires: (1) click violation, (2) scroll to find duration row, (3) click duration.

**v1 compliance: 0%.**

### A.5 UNBAN Demotion — NOT IMPLEMENTED

v1 identified the UNBAN button as a preflight hazard — equal visual weight to BAN, adjacent in the same action row. Current state at lines 8682–8684: three buttons in `gam-mc-actions` — Cancel, UNBAN, BAN — all the same height and visual class. UNBAN has a green border via inline style, which helps, but it is the same `gam-btn` height and sits between Cancel and the BAN button. A miss-click on BAN lands on UNBAN and vice versa.

v1 proposed UNBAN as a ghost link-button below the action row. Not done.

**v1 compliance: 0%.**

### A.6 Escape Key 3-Step Behavior — NOT IMPLEMENTED

v1 specified: ESC with unsaved text → discard confirm inline; ESC with no unsaved text → return focus to tab nav; ESC from tab nav focus → close. Actual behavior: ESC closes the entire panel immediately (handled by the global `keydown` listener in the panel close path). No draft-protection gate. Draft loss is real — the `SuperMod.clearDraft` call at line 9696 only fires on successful save, not on discard.

**v1 compliance: 0%.**

### A.7 OP DELETES Tab — Per-Row Actions — NOT IMPLEMENTED

v1 specified "Open post" and "Open user console" buttons per row. Actual `_renderOpDelTab` (lines 8073–8101): pure read-only list. Each row renders title, meta string (author, subreddit, time, was-in-queue emoji), optional snippet. No buttons. A mod reading this tab cannot act without manually opening a new console or hunting the username elsewhere. The tab is a dead end.

The `was_in_queue` flag is a raw `⚠️ was in queue` emoji string inside the meta div (line 8090). No chip styling. The loading state uses a raw `innerHTML` string without the standard `.gam-mc-loading` class (line 8074 — note: it does use `class="gam-mc-loading"` in the wrapper div, but `style="padding:10px"` is inline rather than token-driven, and the error state at line 8099 is raw `innerHTML` with hardcoded `color:#ff3b3b`).

The 24h window is hardcoded in the RPC call (line 8075: `Date.now() - 24 * 3600 * 1000`). No filter control.

**v1 compliance: 0%.**

### A.8 INTEL Tab Layout — NOT IMPLEMENTED

v1 proposed a 3-zone above-the-fold layout: account row, evidence block, 2-column (history | note), collapsed AI section. Actual `renderIntelTab` (lines 8104–8146): sequential vertical stack — loading summary, loading score, note mount, reported comment section, local history section, AI section, tip div, mods-only note mount. This is 7 sequential sections requiring 2–3 full scrolls.

The mods-only note (mounted at `#gam-mc-modnote-mount`, line 8152+) remains at the bottom. On a re-visit, a mod who wants to update the note must scroll past account summary, score, reported comment, and full history.

The AI section (lines 8127–8143) is expanded by default with a visible header row. v1 proposed collapsing it as a `<details>` element.

**v1 compliance: 0%.**

### A.9 Tab Visual Differentiation — BAN Danger Color — NOT IMPLEMENTED

v1 specified: BAN tab active state uses `--mc-danger` border-bottom and label color instead of the default amber accent. Inactive BAN tab has `--mc-danger` at 70% opacity. Actual: `gam-mc-tab-active` is a single class applied uniformly across all six tabs (line 8033–8034). No per-tab color logic. BAN looks identical to INTEL when active.

**v1 compliance: 0%.**

### A.10 NOTE Tab — Character Counter, Sort Label — NOT IMPLEMENTED

v1 specified a `0/500` character counter updating on input (amber at 400, red at 480), and an explicit "newest first" sort label on the history header. Actual `renderNoteTab` (line 9571+): no character counter anywhere. History header reads "Note history (loading...)" — no sort direction. The `slice().reverse()` at line 9640 renders newest-first silently.

**v1 compliance: 0%.**

### A.11 QUICK Tab — Category Grouping, Perma Row — NOT IMPLEMENTED

v1 proposed category-separated rows with `// DEATH ROW`, `// CONTENT`, `// NUCLEAR` micro-labels and a full-width perma-ban row at the bottom. Actual grid (lines 9986–10044): 11 tiles in `gam-mc-grid`, mixed order. Watch, DR 72h, DR 96h, DR 7d, Perma-ban, Remove, Copy permalink, Open profile, Flag, Grant title, DR Sniper. Perma-ban is in slot 5 (middle of the grid), not isolated. No category labels. No visual grouping.

**v1 compliance: 0%.**

### A.12 MESSAGE Tab — Subject Collapse, Unified Dropdown — NOT IMPLEMENTED

v1 proposed collapsing Subject into a chevron and unifying Team macro + Local template into one dropdown. Actual `renderMessageTab` (lines 9708–9733): two separate dropdowns (Team macro + Local template) stacked vertically, then Subject input, then body textarea. Subject is fully visible at all times. Two competing dropdowns creates a decision paralysis that the unified "Template / Macro" dropdown would resolve.

**v1 compliance: 0%.**

---

## B. Aesthetic Critique — v10.12.3 vs. Bloomberg Terminal Target

### B.1 Tab Strip Density Regression

The 6-tab strip on a 680px modal (the hardcoded `showModal` call at line 8063) allocates an average of ~113px per tab. Tabs contain `emoji + space + label`. On "OP Deletes" the label alone is 9 characters plus emoji — at the font size used, this likely clips or wraps. The tab strip is 38px tall (estimated from the `gam-mc-tabs` class). A Bloomberg-style header allocates 28px. The 10px recovery is a full line of data at 10px monospace.

Visual hierarchy between tabs is flat: all inactive tabs share the same color, all active tabs share the same `gam-mc-tab-active` treatment. No semantic coding: BAN looks the same as QUICK.

### B.2 BAN Tab Form — Cognitive Load

The BAN tab vertical stack (lines 8621–8694) contains 8 distinct form regions in order: Evidence block, repeat-offender banner, Violation select, custom history picker (hidden), Subject input, Team macros dropdown, Message textarea (7 rows), Duration row, Modmail checkbox, AI section, Action buttons, Status, AI summary preview. That is 13 visible regions in the worst case (repeat offender + evidence both present + AI expanded).

Violation and Duration are the two decisions a mod makes every ban. They are separated by Subject + Team macros + a 7-row textarea. The Subject field (line 8640) is positioned between the primary decision (Violation) and the primary content (Message), despite being the least-frequently-changed field.

### B.3 QUICK Tab — Tile Inconsistency Under Danger Tier

The perma-ban tile uses `style="color:${C.RED}"` only on the icon `<span>` (line 10009). The tile container `.gam-mc-quick` has no red styling. A destructive tile that looks like an informational tile is a preflighting failure at the visual layer, before any confirm dialog fires.

The DR Sniper tile (`data-q="sniper"`) is in slot 11 — the last position — despite being thematically part of the Death Row group in slots 2–4. A mod scanning top-to-bottom for DR variants will miss Sniper.

### B.4 Color Token Divergence (from UIUX-03)

The BAN tab danger color uses `C.RED = '#f04040'` (modtools.js constant). The popup stylesheet uses `--bb-red: #ff3b3b`. These are not the same color. A mod's mental model of "danger red" is visually inconsistent between surfaces. In `_renderOpDelTab` the error state hardcodes `color:#ff3b3b` (line 8099) — matching the popup, not `C.RED`. Three different reds for the same semantic role.

The QUICK tab Perma-ban icon uses `C.RED`. The BAN tab "BAN" button uses `gam-btn-danger` class (CSS-defined). The OP DELETES error uses `#ff3b3b`. None of these are guaranteed to be the same rendered color.

---

## C. v2 Redesign Spec — Keyboard Ergonomics

### C.1 Tab Switching — 1-6 Number Keys

**Implementation target:** `openModConsole()`, immediately after `nav.appendChild(b)` (line 8059), before `body.appendChild(nav)`.

Add a single `keydown` listener scoped to the panel container `mc` element. Map keys 1–6 to the tab IDs in order:

```
key '1' → 'intel'
key '2' → 'ban'
key '3' → 'note'
key '4' → 'message'
key '5' → 'quick'
key '6' → 'opdel'
```

Guard: `if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;` — number keys should not fire when a mod is typing in a form field. This is the only guard needed. No Alt modifier required; plain number keys in the panel context are unambiguous because the panel captures input via focus trap.

Tab labels update to include the number hint in the inactive state: `1·INTEL`, `2·BAN`, etc. (abbreviated to max 5 chars after the number). Active tab shows full label. This recovers ~20px per tab on the strip.

**BAN tab specific:** the `keydown` listener must check `e.target` against the ban tab's Duration buttons to avoid `2` switching to BAN when a mod is pressing the "2" to pick a 2-day duration. The scoping guard (textarea/input check) does not cover buttons. Add a secondary check: `if (document.activeElement.classList.contains('gam-mc-dur')) return;`.

### C.2 Ctrl+Enter Submit — All Write Tabs

Single pattern, three call sites. Inside each tab renderer, after the submit button is referenced, add:

```js
const panelRoot = root;
panelRoot.addEventListener('keydown', function(e){
  if (e.ctrlKey && e.key === 'Enter'){
    e.preventDefault();
    submitBtn.click(); // submitBtn = mc-ban-go / mc-note-save / mc-msg-send
  }
});
```

Scope to `root` (the `.gam-mc-panel` div for this tab), not `document`. This fires only when focus is inside the active tab. No risk of cross-tab interference since panels are destroyed and recreated on each `renderTab()` call (line 8035: `panels.innerHTML = ''`).

One edge case: the BAN tab's submit requires a duration to be selected (`data-armed` attribute on a `.gam-mc-dur` button). If Ctrl+Enter fires before a duration is selected, the `mc-ban-go` click handler should surface an inline error rather than silently refusing. This behavior already exists in the click handler — Ctrl+Enter just needs to trigger the same click path.

### C.3 j/k Navigation in QUICK Tab

Add after tiles are rendered and click handlers are attached (after line 10044):

```js
const tiles = [...root.querySelectorAll('.gam-mc-quick:not([disabled])')];
let focusIdx = -1;

function moveFocus(delta){
  if (focusIdx === -1) focusIdx = 0;
  else focusIdx = Math.max(0, Math.min(tiles.length - 1, focusIdx + delta));
  tiles[focusIdx].focus();
}

root.addEventListener('keydown', function(e){
  if (e.key === 'j') { e.preventDefault(); e.stopPropagation(); moveFocus(1); }
  else if (e.key === 'k') { e.preventDefault(); e.stopPropagation(); moveFocus(-1); }
  else if (e.key === 'Home') { e.preventDefault(); focusIdx = 0; tiles[0]?.focus(); }
  else if (e.key === 'End')  { e.preventDefault(); focusIdx = tiles.length - 1; tiles[focusIdx]?.focus(); }
  else if (e.key === 'Enter' && focusIdx >= 0) tiles[focusIdx]?.click();
});
```

`e.stopPropagation()` on `j`/`k` is critical — GAW's global keydown listener uses j/k for post navigation. The scoped listener stops the event from propagating out of the panel.

Each `.gam-mc-quick` tile needs `tabIndex="0"` in the rendered HTML so they are programmatically focusable. Add via the `el()` helper or in the template string: `<button class="gam-mc-quick" tabindex="0" data-q="watch">`.

Focused tile visual state: inject into the panel's CSS block `'.gam-mc-quick:focus { box-shadow: 0 0 0 2px var(--mc-accent, #ff9933) inset; outline: none; }'`. This uses the amber brand accent, not a browser default focus ring.

### C.4 Duration Keyboard Shortcuts on BAN Tab

Inside `renderBanTab`, after `const durRow = root.querySelector('#mc-ban-durs');` (line 8715), attach a keydown listener on `root`:

```
key 'w' or '0' → arm Warning/0d duration
key '1'        → arm 1d
key '3'        → arm 3d
key '7'        → arm 7d
key 'p'        → arm Perma (43800h / permanent)
```

Guard: `if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;` — only fire when no form field has focus.

"Arm" means: find the `.gam-mc-dur` button matching the value and call its click handler, or directly add the `data-armed` attribute and visual active class. Mirror whatever the existing duration button click logic does so the visual feedback (active class, `data-armed` state) is identical whether triggered by mouse or keyboard.

---

## D. v2 Redesign Spec — Visual Hierarchy and Danger Tier

### D.1 BAN Tab Danger Color — Tab Strip

The `renderTab()` function (lines 8030–8050) applies `gam-mc-tab-active` uniformly. Change: after `t.classList.toggle('gam-mc-tab-active', t.dataset.tab === id)`, add:

```js
if (t.dataset.tab === 'ban') {
  t.classList.toggle('gam-mc-tab-danger', t.dataset.tab === id);
}
```

CSS rule to inject into the panel's style block:
```css
.gam-mc-tab.gam-mc-tab-danger {
  color: rgba(224, 48, 48, 0.70);
}
.gam-mc-tab.gam-mc-tab-active.gam-mc-tab-danger {
  color: #e03030;
  border-bottom-color: #e03030;
}
```

This is a 4-line change with zero risk of side effects. The `.gam-mc-tab-danger` class is only added to the BAN tab button and has no effect while inactive (the 70% red is low-contrast enough to read as a warning, not a scream).

### D.2 UNBAN Demotion

Current layout (lines 8681–8685): `[Cancel] [UNBAN] [BAN]`.

Target layout: `[Cancel]` · `[BAN]` — then below the status div, a demoted link:
```
already banned? → unban (ghost, small, success-colored)
```

Implementation: remove UNBAN from `gam-mc-actions`. After `#mc-ban-status`, insert a `<div class="gam-mc-unban-row">` containing a ghost-styled anchor or button with `color: #2da85a; font-size: 10px; text-decoration: underline; background: none; border: none; cursor: pointer;`. Text: `already banned — unban instead`. Wire the same `id="mc-ban-unban"` click handler (the existing handler at the UNBAN button reference in `renderBanTab` is already wired by ID lookup, so the DOM element just needs to move).

This eliminates the false-equivalence between BAN and UNBAN. A mod who reaches for BAN and misclicks lands on Cancel (safe) instead of UNBAN (dangerous).

### D.3 Repeat-Offender Banner Differentiation

Current banner class (line 8628): `gam-mc-banner-warn` — same class used for generic warnings throughout the console. v1 identified this as a visual collision.

Add a new modifier class `gam-mc-banner-repeat` with:
```css
background: rgba(200, 60, 30, 0.15);
border-left: 3px solid #e03030;
color: #e8d0c0;
```

The `gam-mc-banner-warn` background is amber/yellow-tinted (shared with non-ban warnings). The repeat-offender banner should be red-tinted to signal "this person has been here before and the stakes are higher." No new copy needed — the existing text content is correct.

### D.4 QUICK Tab — Category Grouping and Perma Isolation

Restructure the tile order in `renderQuickTab` into four visual groups separated by `<div class="gam-mc-grid-sep">// LABEL</div>` elements:

```
// INFO
[Watch/Unwatch]  [Copy permalink]  [Open profile]

// DEATH ROW
[DR 72h]  [DR 96h]  [DR 7d]  [DR Sniper 125h]

// CONTENT
[Remove this content]  [Flag user]  [Grant title]

// NUCLEAR  (full-width row, red-tinted background)
[Perma-ban (no msg) — entire row width]
```

The separator `<div>` spans full grid width and sits outside the 3-column grid flow. Style:
```css
.gam-mc-grid-sep {
  grid-column: 1 / -1;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 9px;
  color: #505a66;
  letter-spacing: 0.1em;
  padding: 6px 0 2px;
  border-top: 1px solid #1e2630;
  margin-top: 2px;
}
```

Perma-ban tile: move to its own row below `// NUCLEAR`. The tile itself gets `style="grid-column: 1/-1; background: rgba(224,48,48,0.06);"`. The icon `<span>` already has `color: C.RED` — additionally apply `color: #e03030` to the label span for full red-tier styling.

The j/k navigation index array must be rebuilt after the separator divs are inserted — the `querySelectorAll('.gam-mc-quick:not([disabled])')` selector will correctly skip the separator divs.

---

## E. v2 Redesign Spec — Tab-Level Improvements

### E.1 INTEL Tab — Above-the-Fold Restructuring

The mods-only note at `#gam-mc-modnote-mount` (injected at the bottom, line 8145) is the highest-priority write operation for returning mods. It must move.

Target layout (replace the monolithic `root.innerHTML` string in `renderIntelTab`):

```
[Account row — single async-loaded line: chips + score, one loading state]
[Evidence block — if item context]
[Split row: left=history (scrollable, max-height:180px) | right=modnote (mount)]
[AI section — <details> collapsed by default, summary="AI Conformity Check"]
```

The `mountModNote()` IIFE (starting at line 8152) remains functionally unchanged — only its mount point moves. `#gam-mc-modnote-mount` moves to the right column of the split row. The two separate loading states (`gam-mc-intel-summary` and `gam-mc-intel-score`) consolidate into one: `id="gam-mc-intel-summary"` loads account + score together; `gam-mc-intel-score` is removed.

The AI section wraps in `<details id="gam-mc-intel-ai-wrap"><summary>AI Sidebar Conformity Check</summary>...</details>`. The `<details>` open/close state can be persisted via `getSetting` if desired; default is closed.

History sort label: change the section header from plain `"Local mod history"` to `"Local mod history — newest first"`.

### E.2 NOTE Tab — Character Counter and Sort Label

In `renderNoteTab`, update the history section header (line 9573):
```
"Note history (newest first)" [count] ............. [Clear all]
```

In the textarea div, add a character counter span:
```html
<div class="gam-mc-char-count" id="mc-note-chars">0 / 500</div>
```

Wire it on `input`:
```js
body.addEventListener('input', function(){
  const len = body.value.length;
  const c = root.querySelector('#mc-note-chars');
  if (!c) return;
  c.textContent = len + ' / 500';
  c.style.color = len >= 480 ? '#e03030' : len >= 400 ? '#ff9933' : '#505a66';
});
```

The textarea already has `maxLength` bound in the existing code (not shown in the range read but referenced in v1 spec). The counter only adds visual feedback.

The template picker (line 9580) stays as-is — it is already logically positioned (before the write area). The only change is making it compact: position it in the write section header row rather than as a standalone `.gam-mc-field`.

### E.3 OP DELETES Tab — Per-Row Actions and Time Filter

This tab needs the most structural work. The `_renderOpDelTab` function needs:

1. **Time filter dropdown** in the tab header:
   ```html
   <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
     <div class="gam-mc-h">OP Self-Deletions</div>
     <select class="gam-input" id="mc-opdel-window" style="width:auto;font-size:10px">
       <option value="6">Last 6h</option>
       <option value="24" selected>Last 24h</option>
       <option value="48">Last 48h</option>
       <option value="168">Last 7d</option>
     </select>
   </div>
   ```
   Changing the select re-calls `rpcCall('modOpDeletes', { since: Date.now() - hours*3600*1000, limit:20 })` and re-renders.

2. **Per-row action buttons** — after each row's snippet element, append:
   ```js
   const actions = el('div', { style: 'display:flex;gap:6px;margin-top:4px' });
   if (d.permalink) {
     const openPost = el('a', {
       href: d.permalink,
       target: '_blank',
       cls: 'gam-mc-evidence-link',
       style: 'font-size:10px'
     }, 'Open post');
     actions.appendChild(openPost);
   }
   if (d.author) {
     const openConsole = el('button', {
       cls: 'gam-btn',
       style: 'font-size:10px;padding:2px 6px'
     }, 'Open console');
     openConsole.addEventListener('click', function(){
       openModConsole(d.author, null, 'intel');
     });
     actions.appendChild(openConsole);
   }
   row.appendChild(actions);
   ```

3. **Was-in-queue chip** — replace the raw emoji string (line 8090) with a styled chip:
   ```js
   // Instead of appending to the meta string:
   if (d.was_in_queue) {
     const chip = el('span', {
       style: 'display:inline-block;background:rgba(224,48,48,0.15);border:1px solid #e03030;color:#e03030;font-size:9px;padding:1px 5px;border-radius:2px;margin-left:4px;letter-spacing:0.06em'
     }, 'WAS IN QUEUE');
     meta.appendChild(chip);
   }
   ```

4. **Loading state consistency**: The current `root.innerHTML` assignment (line 8074) puts the class on the inner div. Move to a top-level wrapper: `root.appendChild(el('div', { cls: 'gam-mc-loading' }, 'Loading OP deletions...'))`.

5. **Error state**: Replace the hardcoded `color:#ff3b3b` inline string (line 8099) with `root.appendChild(el('div', { cls: 'gam-mc-banner gam-mc-banner-red' }, 'Error loading: ' + ...))`.

### E.4 MESSAGE Tab — Subject Collapse

Wrap the Subject field in a `<details>` element:
```html
<details class="gam-mc-field" id="mc-msg-subj-wrap">
  <summary style="font-size:10px;color:#505a66;cursor:pointer;user-select:none">Edit subject</summary>
  <input type="text" class="gam-input" id="mc-msg-subj" placeholder="Subject line..." style="margin-top:4px">
</details>
```

When a template is selected, the subject auto-populates (existing logic already does this). If it populates, expand the `<details>` via `subj_wrap.open = true` so the mod sees the auto-fill. If the subject is the default/template subject, it can stay collapsed.

The two competing dropdowns (Team macro + Local template) remain separate for v2 — unifying them is a higher-complexity change requiring dropdown data merging and option-value disambiguation. This is deferred to v3.

---

## F. v2 Redesign Spec — Draft Protection (Escape Key)

### F.1 Three-Step ESC Behavior

The global keydown handler that closes panels on ESC needs to route through a draft-check before closing the mod console. The entry point is wherever `closeAllPanels` is wired to the ESC key (not shown in the read range but referenced in the v1 audit and codebase globally).

The mod console panel element `mc` gets a method or data attribute:

```js
// In openModConsole(), after mc is created:
mc._hasDraft = function(){
  const activePanel = panels.querySelector('.gam-mc-panel');
  if (!activePanel) return false;
  const ta = activePanel.querySelector('textarea');
  if (!ta) return false;
  const defaultVal = ta.dataset.defaultVal || '';
  return ta.value.trim().length > 0 && ta.value !== defaultVal;
};
```

In the ESC handler, replace direct `closeAllPanels()` with:
```js
const mc = document.querySelector('#gam-mc-panel, .gam-mc-panel-root');
if (mc && mc._hasDraft && mc._hasDraft()){
  // Step 1: show discard confirm bar
  _showDiscardBar(mc);
  return;
}
// Step 2/3: if tab nav not focused, focus it; if already focused, close
const tabNav = mc && mc.querySelector('.gam-mc-tabs');
if (tabNav && !tabNav.contains(document.activeElement)){
  tabNav.querySelector('.gam-mc-tab-active')?.focus();
  return;
}
closeAllPanels();
```

`_showDiscardBar(mc)` injects a 28px bar at the top of the panel body:
```
[!] Unsaved changes — [Discard] [Keep editing]
```
Styled: `background: rgba(224,48,48,0.12); border-bottom: 1px solid #e03030;`. [Discard] calls `closeAllPanels()`. [Keep editing] removes the bar and restores focus to the textarea. Both buttons are keyboard-accessible and are the only focusable elements when the bar is visible.

---

## G. Implementation Priority Stack

All 8 groups are ordered by impact-to-effort ratio, with the constraint that each group is independently shippable without the others.

| Priority | Group | Changes | Est. Effort | Risk |
|---|---|---|---|---|
| P0 | Keyboard tab switching (1–6) | `openModConsole()` keydown listener, tab label abbreviation | 2h | Low — additive |
| P0 | Ctrl+Enter submit (BAN/NOTE/MSG) | 3 keydown listeners, one per renderer | 1h | Low — additive |
| P0 | BAN tab danger color on tab strip | 4 CSS lines + 3 JS lines in `renderTab()` | 0.5h | Low — additive |
| P1 | UNBAN demotion | Move button, rewire click handler | 1.5h | Low — DOM-only |
| P1 | Repeat-offender banner diff. | New CSS class, one class swap | 0.5h | Low |
| P1 | OP DELETES per-row actions + chip | `_renderOpDelTab` restructure | 2.5h | Low |
| P1 | OP DELETES time filter | Select element + re-fetch on change | 1h | Low |
| P2 | j/k nav in QUICK tab | Keydown listener + tabIndex attributes | 1.5h | Low — scoped |
| P2 | BAN duration keyboard shortcuts | Keydown listener + arm logic | 1.5h | Medium — guard needed |
| P2 | QUICK tab category grouping + perma isolation | Restructure tile order + separators | 2h | Low |
| P2 | NOTE tab char counter + sort label | Input listener + label text change | 1h | Low |
| P3 | INTEL tab 2-column layout | `root.innerHTML` restructure + modnote mount move | 4h | Medium — viewport QA needed |
| P3 | NOTE/MESSAGE template compaction | Section header restructure | 1.5h | Low |
| P3 | Escape 3-step draft protection | ESC handler routing + discard bar | 2.5h | Medium — global handler |
| P3 | MESSAGE subject collapse | `<details>` wrap + auto-expand on template fill | 1h | Low |
| **P0–P1 subtotal** | | | **~9.5h** | |
| **P2 subtotal** | | | **~6h** | |
| **P3 subtotal** | | | **~9h** | |
| **Grand total** | | | **~24.5h** | |

**Batch recommendation for first ship:** P0 items (tab switching, Ctrl+Enter, BAN danger color) plus UNBAN demotion and OP DELETES restructure. That is the highest-signal group — keyboard ergonomics + safety + dead-end tab fix — at under 10 hours of work with zero behavior regression risk for mouse-only mods.

---

## H. Design Tokens — v2 Alignment

The UIUX-03 audit documented the split between `--bb-*` CSS variables (popup) and `C.*` JS constants (content script). The mod console sits entirely in the content script and therefore uses `C.*`. For the changes in this spec, use these canonical values throughout:

```js
// Danger tier
C.RED         = '#f04040'    // existing — use for all danger in MC
// Do NOT mix with #ff3b3b (_renderOpDelTab error state) or #e03030 (v1 spec)
// Resolution: pick ONE. Recommend: stay on C.RED (#f04040) for all MC danger.
// Update the _renderOpDelTab error color from #ff3b3b to C.RED.
// Update all v2 danger references in this spec from #e03030 to C.RED.

// Accent / active state
C.ACCENT      = '#4A9EFF'    // existing blue — MC tab active border
// v1 proposed switching MC to amber (#ff9933). This is a philosophical choice:
// blue accent is what the codebase already uses for interactive states in the MC.
// Recommendation: leave C.ACCENT blue for MC interactive states; use C.AMBER
// for the BAN danger-tab color so it reads as distinct from interaction.

// Add C.AMBER if not present: '#ff9933' — for duration armed state, repeat-offender
// banner left-border accent in non-danger contexts.

// Success
C.GREEN       = '#3dd68c'    // existing — UNBAN ghost button color

// Muted
C.TEXT3       = '#5c6370'    // existing — separator labels, char counter default

// Border
C.BORDER      = '#2a2f38'    // existing — separator divs, grid-sep border-top
```

**One new constant needed:** `C.DANGER_BG = 'rgba(224,48,48,0.08)'` for the perma-ban tile background and the BAN tab inactive color wash. Not currently in the `C` object. Add it alongside `C.RED` in the const block.

For any change in this spec that cites `#e03030`, substitute `C.RED` (`#f04040`) to maintain single-source danger color. The slight brightness difference from v1's `#e03030` is immaterial — consistency with the existing `C.RED` is worth more than precision-matching a spec that was never implemented.

---

**Document revision:** v2.0 — 2026-05-10
**Author:** UIUX2-18-MOD-CONSOLE
**Next action:** P0 keyboard changes can ship as a single PR without design review — they are additive, reversible, and zero-risk for mouse-only workflows.
