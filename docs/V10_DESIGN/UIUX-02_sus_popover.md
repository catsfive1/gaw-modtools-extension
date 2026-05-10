# UIUX-02 — SUS Popover Redesign (Click-to-DR + Tards Inline)
**Auditor:** DESIGN-02-SUS-POPOVER
**Skill invoked:** frontend-design (popover redesign for moderation tool — click-to-expand drill-down with inline action buttons, minimize-clicks principle, dense data display)
**Date:** 2026-05-10
**Affects:** `modtools.js` `_showSusPopover()` (~L16854-17046)

---

## A. Commander's Actual Asks (Distilled)

1. **Click user row → inline drill-down** — richer info appears in-place, no navigation
2. **"Add to DR" per row** — single click, no navigation to /users page
3. **Surface AI-detected tard suspects in the same popover** — unified threat surface
4. **Minimize clicks** — the meta-principle overriding every other design choice

---

## B. Current State Critique

### What the popover does now

Opens from the 🚩 bar icon. Shows a flat list of SUS rows, each containing:
- Row 1: `🚩` + username link (opens `/u/` in new tab) + 24h comment count
- Row 2: reason text (truncated at 80 chars)
- Row 3: meta (marked-by, when) + four buttons: **Profile / Ban / Unmark / Note**

### Click cost audit (current)

| Outcome | Steps |
|---|---|
| View user profile | 1 click (Profile btn) — opens new tab, must navigate back |
| Add user to Death Row | 5 clicks: open SUS popover → click Profile → new tab opens → find DR section → click Add to DR |
| Add a note to user | 3 clicks: open popover → click Note btn → opens /u/ page in new tab (note btn is broken — it's just a profile link!) |
| Unmark SUS | 2 clicks: open popover → click Unmark (good) |
| See why this user is sus | 0 extra clicks (reason shown inline) |
| See user's recent posts | 5+ clicks: navigate to profile, find posts section |
| View AI tard candidates | Cannot — separate `✨` accordion button in bar, completely separate UI surface |

### Friction inventory

1. **Note button is a lie.** `noteBtn` at L16993-16996 just opens `/u/username` in a new tab — same as Profile. It does not write a note. This is dead UX that wastes a button slot.
2. **Profile opens a new tab always.** Any quick reference requires context-switching.
3. **DR requires 5 clicks.** The entire point of having a SUS popover is to action from it — but the biggest action (DR) requires leaving the popover entirely.
4. **Tards are siloed.** The `✨` tard accordion (L18190+) lives as a completely separate UI widget — different button, different panel, different data shape. A user who appears in both requires visiting both surfaces.
5. **No inline history.** You can see the sus reason but not the user's last few posts/comments. You decide blind whether to DR or unmark.
6. **Max width 420px.** Tight for the expanded state we want.
7. **Footer "Click 🚩 username to open profile"** is superfluous instruction text taking footer space. The footer link to `/users` page should stay; the instruction should go.

---

## C. Redesign Proposal — Three Placements Considered

### Option A: Per-row three-dot (⋯) overflow menu

Each row gets a `⋯` button that opens a dropdown: Profile / Add to DR / Unmark / Note / Ban.

**Pros:** Doesn't change row height. Clean.
**Cons:** Adds a click for the most common action (DR). Dropdown menus have hover-target issues in dense lists. Doesn't address the "see user history inline" ask.

### Option B: Per-row click-to-expand (accordion row)

Clicking anywhere on a row (not a button) expands it in place, revealing:
- Last 3 posts/comments snapshot (from a lightweight `modUserCadence` call already cached)
- Full reason text (untruncated)
- Action strip: `[+ DR 72h]` `[+ DR 24h]` `[Unmark]` `[Ban]` `[Note inline]`
- Collapse on second click

**Pros:** Zero extra clicks to reach DR. History visible before deciding. Scales to tard rows too.
**Cons:** Row heights vary (jarring in a dense list). First click on a row is "spent" on expand, not action.

### Option C: Hybrid — One-click primary + expand chevron (WINNER)

Each row has:
- **Left zone (click = expand chevron `▶`):** toggles the inline drill-down panel
- **Right zone:** immediate action buttons always visible — no expand required for primary actions

The always-visible action strip per row is: `[DR]` `[Unmark]` and a `▶` expand indicator.

DR is one click. Unmark is one click. Expand for history/note is one more click if needed.

**Why this wins:**
- DR goes from 5 clicks to **2 clicks** (open popover → click DR)
- Unmark stays at 2 clicks (already good)
- Note becomes a real inline action at **3 clicks** (open → expand → write note)
- History snapshot available at **2 clicks** (open → expand)
- Tard rows use same interaction model — unified surface, zero new learning

---

## D. Tards Integration

### Data source

The tard accordion at L18259 calls `rpcCall('aiTardsSuggest', {})` and caches results in `chrome.storage.session` under key `gam_tard_suggestions` (20min TTL). The data shape is:

```js
{
  suggestions: [
    { pattern: 'string', label: 'string', severity: 'high|medium|low', example: 'string' }
  ],
  scanned: number,
  fetchedAt: number
}
```

These are **username patterns** (regex/substring rules), not specific usernames. They are distinct from `_susState.rows` which contains specific banned usernames.

However there is a second signal: `_newAccountCache` (populated by `modUserCadence` per L11331/L11347) flags specific users as new accounts. This is the most actionable per-user tard signal.

### What "tards" means in the SUS popover context

Commander's ask is to show "AI-detected tard candidates" — users the system suspects are tards but haven't been manually marked SUS yet. The closest real data is:

1. **`_newAccountCache` entries** — users flagged as new accounts with high activity (TARD-2 signal)
2. **Users matching any `autoDeathRowRules` pattern** seen in the firehose but not yet SUS-marked
3. **`aiTardsSuggest` cached suggestions** — but these are patterns, not names

For the SUS popover, the practical approach is to pull from the session cache of `aiTardsSuggest` and display the pattern-match suspects as a secondary section. When the cache is cold, show a single "Fetch tard suspects" button that fires `rpcCall('aiTardsSuggest', {})` inline without leaving the popover.

### Visual differentiation

| Type | Glyph | Color | Badge text |
|---|---|---|---|
| Manually marked SUS | 🚩 | `#ff9933` (amber) | `SUS` |
| AI tard suspect (pattern match) | 🤖 | `#a855f7` (purple) | `AI TARD` |
| New account + high activity | ⚡ | `#ffd84d` (yellow) | `NEW ACCT` |

### Combined sort: most-recent-first

SUS rows: sort by `marked_at` desc.
Tard rows: sort by `severity` (high → medium → low), then by first-seen.
Merged: SUS rows first (they are confirmed), tard rows second with a visual divider.

A "SUSPECTED" section header in purple separates the two groups.

---

## E. Click Reduction Matrix

| Outcome | Current clicks | New clicks | Savings |
|---|---|---|---|
| Add to Death Row (72h) | 5 | **2** (open popover, click DR) | -3 |
| Add to Death Row (custom) | 6 | **3** (open, expand row, DR custom) | -3 |
| Unmark SUS | 2 | **2** (unchanged) | 0 |
| View user history snapshot | 5+ | **2** (open, expand row) | -3 |
| Write a note | broken (3 clicks, goes to profile) | **3** (open, expand, type+save inline) | fixed |
| Ban | 2 (opens external ban page) | **2** (unchanged, preflight in-popover) | 0 |
| View tard suspects | 3 (separate ✨ button + expand + read) | **1** (scrolled into same popover, lazy-loaded) | -2 |
| Add tard to DR | 4 (✨ button + find tard + scroll + DR) | **2** (scroll to tard section, click DR) | -2 |
| Dismiss popover | 1 (× or Esc) | **1** (unchanged) | 0 |

---

## F. Visual Mockup (ASCII)

### Collapsed state (default)

```
┌─────────────────────────────────────────────────────────┐
│ 🚩 SUS — 4 FLAGGED  ·  🤖 3 AI SUSPECTS           [×] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🚩 dirtbag_larry    14 cmts/24h            [DR] [⋯] ▶ │
│     shill posting, iran talking points                  │
│     marked by PATRIOT_MIKE · 2h ago                     │
│ ─────────────────────────────────────────────────────── │
│  🚩 newshill99        3 cmts/24h            [DR] [⋯] ▶ │
│     copy-paste narrative drops                          │
│     marked by you · 47m ago                             │
│ ─────────────────────────────────────────────────────── │
│  ─ ─ ─  AI SUSPECTS (pattern match)  ─ ─ ─ ─ ─ ─ ─ ─  │  ← purple divider
│  🤖 HIGH  throwaway_2024_06   ⚡NEW    [DR] [Mark] ▶   │
│  🤖 MED   glowie_pattern_xyz          [DR] [Mark] ▶    │
│  🤖 LOW   shill_bot_99                [DR] [Mark] ▶    │
│ ─────────────────────────────────────────────────────── │
│ [Refresh suspects]                Open Death Row →      │
└─────────────────────────────────────────────────────────┘
```

### Expanded row state (click ▶ on dirtbag_larry)

```
┌─────────────────────────────────────────────────────────┐
│ 🚩 SUS — 4 FLAGGED  ·  🤖 3 AI SUSPECTS           [×] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🚩 dirtbag_larry    14 cmts/24h            [DR] [⋯] ▼ │
│     shill posting, iran talking points                  │
│     marked by PATRIOT_MIKE · 2h ago                     │
│   ╔═══════════════════════════════════════════════════╗ │
│   ║ LAST ACTIVITY                                     ║ │
│   ║ "Biden is a genius..." · r/gaw · 14m ago          ║ │
│   ║ "The media never lies..." · r/gaw · 1h ago        ║ │
│   ║ "Sauce this" · r/gaw · 2h ago          [Profile →]║ │
│   ╠═══════════════════════════════════════════════════╣ │
│   ║ ACTIONS                                           ║ │
│   ║ [DR 72h] [DR 24h] [Unmark] [Ban] [Note ↓]        ║ │
│   ╠═══════════════════════════════════════════════════╣ │
│   ║ NOTE: ________________________________            ║ │
│   ║       [Save note]                                 ║ │
│   ╚═══════════════════════════════════════════════════╝ │
│ ─────────────────────────────────────────────────────── │
│  🚩 newshill99        3 cmts/24h            [DR] [⋯] ▶ │
```

### DR button behavior (inline, no navigation)

Clicking `[DR]` or `[DR 72h]`:
1. Calls `addToDeathRow(username, 72*3600*1000, reason, { fromUserAction: true })`
2. Row immediately shows `💀 On Death Row (72h)` pill replacing the DR button
3. `snack()` fires: "✓ dirtbag_larry queued for DR ban in 72h"
4. `withUndo` / `_recordUndoAction` called as per existing DR pattern (L4778)
5. Row stays in SUS list (user is still SUS flagged; DR is additive)

### ⋯ overflow menu (secondary actions)

`[⋯]` dropdown contains:
- Profile (new tab)
- Ban now (opens preflight inline or navigates)
- Copy username

This keeps the primary action strip lean: only `[DR]` and `▶` on the collapsed row.

---

## G. CSS Spec / Animation

```css
/* Row expand/collapse */
.gam-sus-drill {
  max-height: 0;
  overflow: hidden;
  transition: max-height 160ms cubic-bezier(0.4, 0, 0.2, 1),
              opacity 120ms ease;
  opacity: 0;
}
.gam-sus-drill.open {
  max-height: 280px;
  opacity: 1;
}

/* Chevron rotation */
.gam-sus-chevron {
  transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-block;
  color: #5a5752;
  font-size: 9px;
  user-select: none;
}
.gam-sus-row.expanded .gam-sus-chevron {
  transform: rotate(90deg);
  color: #ff9933;
}

/* DR button — primary action, always visible */
.gam-sus-dr-btn {
  background: transparent;
  border: 1px solid #ffd84d;
  color: #ffd84d;
  padding: 1px 6px;
  cursor: pointer;
  font: 700 9px ui-monospace, monospace;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: background 80ms, color 80ms;
}
.gam-sus-dr-btn:hover {
  background: rgba(255, 216, 77, 0.15);
}
.gam-sus-dr-btn.fired {
  border-color: #3dd68c;
  color: #3dd68c;
  cursor: default;
}

/* Tard section divider */
.gam-sus-tard-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0 4px;
  color: #a855f7;
  font: 600 9px ui-monospace, monospace;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.gam-sus-tard-divider::before,
.gam-sus-tard-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(168, 85, 247, 0.25);
}

/* Tard row */
.gam-sus-tard-row {
  /* Same structure as SUS row but purple accent */
  border-left: 2px solid rgba(168, 85, 247, 0.4);
  padding-left: 6px;
}

/* Drill-down panel */
.gam-sus-drill-inner {
  background: #0a0a0b;
  border: 1px solid #2a2825;
  border-left: 2px solid #ff9933;
  margin: 4px 0 6px 16px;
  padding: 6px 8px;
  font-size: 10px;
}

/* Note textarea */
.gam-sus-note-input {
  width: 100%;
  box-sizing: border-box;
  background: #131316;
  border: 1px solid #3d3a35;
  color: #e8e6e1;
  font: 10px ui-monospace, monospace;
  padding: 4px 6px;
  resize: vertical;
  min-height: 44px;
  margin-top: 4px;
}
.gam-sus-note-input:focus {
  outline: none;
  border-color: #9b9892;
}

/* New popover max-width — wider to accommodate drill panel */
#gam-sus-popover {
  min-width: 380px;
  max-width: 500px;
}
```

---

## H. HTML Structure / JS Event Flow

### Row DOM structure (collapsed)

```html
<div class="gam-sus-row" data-sus-row="dirtbag_larry">
  <!-- Click zone: left 80% of row = expand toggle -->
  <div class="gam-sus-row-summary" style="cursor:pointer">
    <div class="gam-sus-row1">
      <span class="gam-sus-chevron">▶</span>
      <span>🚩</span>
      <span class="gam-sus-username">dirtbag_larry</span>
      <span class="gam-sus-count hot">14 cmts/24h</span>
    </div>
    <div class="gam-sus-reason">shill posting, iran talking points</div>
    <div class="gam-sus-meta">marked by PATRIOT_MIKE · 2h ago</div>
  </div>
  <!-- Action strip: always visible, right-aligned -->
  <div class="gam-sus-actions">
    <button class="gam-sus-dr-btn" data-username="dirtbag_larry">DR</button>
    <button class="gam-sus-more-btn">⋯</button>
  </div>
  <!-- Drill-down panel: hidden until expanded -->
  <div class="gam-sus-drill" data-drill="dirtbag_larry">
    <div class="gam-sus-drill-inner">
      <div class="gam-sus-drill-loading">loading…</div>
    </div>
  </div>
</div>
```

### JS event wiring

```js
// Row summary click → expand/collapse
rowSummary.addEventListener('click', function(e) {
  if (e.target.closest('.gam-sus-actions')) return; // don't expand if clicking buttons
  const isOpen = row.classList.contains('expanded');
  // Collapse any other open row first (one-at-a-time UX)
  pop.querySelectorAll('.gam-sus-row.expanded').forEach(r => {
    r.classList.remove('expanded');
    r.querySelector('.gam-sus-drill').classList.remove('open');
  });
  if (!isOpen) {
    row.classList.add('expanded');
    const drill = row.querySelector('.gam-sus-drill');
    drill.classList.add('open');
    _loadDrillContent(username, drill, rowData); // lazy-fetch
  }
});

// DR button click → inline DR add, no navigation
drBtn.addEventListener('click', function(e) {
  e.stopPropagation();
  const added = addToDeathRow(username, 72 * 3600 * 1000, reason, { fromUserAction: true });
  if (added) {
    drBtn.textContent = '💀 DR queued';
    drBtn.classList.add('fired');
    drBtn.disabled = true;
    try { snack('✓ ' + username + ' added to Death Row (72h)', 'success'); } catch(_){}
  } else {
    try { snack(username + ' already on Death Row', 'info'); } catch(_){}
  }
});

// Drill content loader (lazy, cached per session)
function _loadDrillContent(username, drillEl, rowData) {
  const inner = drillEl.querySelector('.gam-sus-drill-inner');
  if (inner.dataset.loaded) return; // already fetched this session
  inner.innerHTML = '<div class="gam-sus-drill-loading">loading activity…</div>';
  
  // modUserCadence already pulls recent posts; reuse it
  rpcCall('modUserCadence', { username }).then(function(r) {
    inner.dataset.loaded = '1';
    const posts = (r && r.data && r.data.recent_posts) || [];
    const lines = posts.slice(0, 3).map(p =>
      `<div class="gam-sus-drill-post">"${escapeHtml((p.body || '').slice(0, 60))}…" · ${timeAgo(p.ts)}</div>`
    ).join('');
    
    inner.innerHTML = `
      <div class="gam-sus-drill-section-hdr">LAST ACTIVITY</div>
      ${lines || '<div style="color:#5a5752">no recent posts cached</div>'}
      <a href="/u/${encodeURIComponent(username)}" target="_blank" class="gam-sus-profile-link">Profile →</a>
      <div class="gam-sus-drill-section-hdr" style="margin-top:6px">ACTIONS</div>
      <div class="gam-sus-drill-actions">
        <button class="gam-sus-dr-btn" data-delay="72">DR 72h</button>
        <button class="gam-sus-dr-btn" data-delay="24">DR 24h</button>
        <button class="gam-btn-unmark">Unmark</button>
        <button class="gam-btn-ban">Ban</button>
        <button class="gam-btn-note-toggle">Note ↓</button>
      </div>
      <div class="gam-sus-note-area" style="display:none">
        <textarea class="gam-sus-note-input" placeholder="Add mod note…"></textarea>
        <button class="gam-sus-note-save">Save note</button>
      </div>
    `;
    
    // Wire expanded DR buttons
    inner.querySelectorAll('.gam-sus-dr-btn[data-delay]').forEach(function(b) {
      b.addEventListener('click', function(e) {
        e.stopPropagation();
        const h = parseInt(b.dataset.delay, 10);
        const added = addToDeathRow(username, h * 3600 * 1000, rowData.reason, { fromUserAction: true });
        if (added) {
          b.textContent = '💀 Queued';
          b.classList.add('fired');
          b.disabled = true;
          // Also disable the collapsed DR button
          const colDr = drillEl.closest('.gam-sus-row').querySelector('.gam-sus-actions .gam-sus-dr-btn');
          if (colDr) { colDr.textContent = '💀 DR'; colDr.disabled = true; colDr.classList.add('fired'); }
          try { snack('✓ ' + username + ' → Death Row (' + h + 'h)', 'success'); } catch(_){}
        }
      });
    });
    
    // Note toggle
    const noteToggle = inner.querySelector('.gam-btn-note-toggle');
    const noteArea = inner.querySelector('.gam-sus-note-area');
    if (noteToggle && noteArea) {
      noteToggle.addEventListener('click', function() {
        const open = noteArea.style.display !== 'none';
        noteArea.style.display = open ? 'none' : 'block';
        noteToggle.textContent = open ? 'Note ↓' : 'Note ↑';
        if (!open) noteArea.querySelector('textarea').focus();
      });
    }
    
    // Save note — uses modProfilesWritePatch (same as L6186)
    const saveBtn = inner.querySelector('.gam-sus-note-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        const ta = inner.querySelector('.gam-sus-note-input');
        const text = (ta && ta.value || '').trim();
        if (!text) return;
        saveBtn.disabled = true;
        saveBtn.textContent = '…';
        try {
          await rpcCall('modProfilesWritePatch', {
            username,
            patch: { notes: text }
          });
          ta.value = '';
          saveBtn.textContent = '✓ Saved';
          try { snack('✓ Note saved for ' + username, 'success'); } catch(_){}
          setTimeout(() => { saveBtn.textContent = 'Save note'; saveBtn.disabled = false; }, 2000);
        } catch(err) {
          saveBtn.textContent = 'Failed';
          saveBtn.disabled = false;
          try { snack('Note save failed: ' + (err && err.message || err), 'error'); } catch(_){}
        }
      });
    }
  }).catch(function() {
    inner.innerHTML = '<div style="color:#5a5752">activity unavailable</div>';
    inner.dataset.loaded = '1';
  });
}
```

---

## I. Implementation Notes (Existing Helpers Reused)

| Action | Helper | Location | Notes |
|---|---|---|---|
| Add to Death Row | `addToDeathRow(username, delayMs, reason, { fromUserAction: true })` | L4768 | Pass `fromUserAction:true` for undo stack |
| Undo support | `_recordUndoAction` | L4812 | Called automatically by `addToDeathRow` with `fromUserAction` |
| Toast notification | `snack(msg, type)` | global | Types: `'success'`, `'error'`, `'info'` |
| Unmark SUS | `rpcCall('modSusClear', { username })` | L16971 (existing) | Already in current popover — reuse |
| Write note | `rpcCall('modProfilesWritePatch', { username, patch: { notes } })` | L6186 | |
| User activity | `rpcCall('modUserCadence', { username })` | L6027 | Returns recent posts; already called for cadence chip |
| Tard suspects cache | `chrome.storage.session.get(['gam_tard_suggestions'])` | L18352 | 20min TTL; reuse cached data, lazy-fetch if cold |
| Mark SUS inline | `rpcCall('modSusMark', { username, reason })` | L11223 | For tard rows' `[Mark]` button |
| Escape decorations update | `_susApplyDecorations(true)` | L16980 | Call after any SUS state mutation |
| Time formatting | `timeAgo()` / `timeUntil()` | global | Already used in current popover |
| HTML sanitization | `escapeHtml()` | global | Required on all user-supplied strings |
| DR check (prevent double-add) | `getDeathRow().find(d => d.username.toLowerCase() === username.toLowerCase())` | L4769 | Used internally by `addToDeathRow` — DR button should disable if already queued |

### Initialization — pre-check DR state on row render

When building each SUS row, check `getDeathRow()` immediately:
```js
const alreadyOnDr = getDeathRow().some(d => d.username.toLowerCase() === username.toLowerCase() && d.status === 'waiting');
if (alreadyOnDr) {
  drBtn.textContent = '💀 On DR';
  drBtn.disabled = true;
  drBtn.classList.add('fired');
}
```

### Tard suspect rows — what data to render

Pull from session cache:
```js
chrome.storage.session.get(['gam_tard_suggestions'], function(res) {
  const cached = res && res['gam_tard_suggestions'];
  if (cached && cached.suggestions && cached.suggestions.length) {
    _renderTardSection(pop, cached.suggestions);
  } else {
    _renderTardFetchButton(pop); // single "Fetch tard suspects" button
  }
});
```

Tard suggestions are patterns, not usernames. Display them as pattern rows (what the accordion does), with `[DR Rule]` to add the pattern as an auto-DR rule rather than DR-ing a specific user. This is more honest than pretending the pattern is a user. Label them `🤖 PATTERN` instead of a username.

Alternatively: if `_newAccountCache` has entries (populated by prior cadence calls), those ARE specific users — render those in the tard section as `🤖 ⚡NEW dirtbag_2025` with `[DR]` and `[Mark SUS]` buttons.

---

## J. Effort Estimate

| Task | Lines changed/added | Complexity | Est. time |
|---|---|---|---|
| Refactor `_showSusPopover` row builder to use new layout | ~80 lines changed | Medium — structural only | 1.5h |
| Add `_loadDrillContent` lazy-loader function | ~120 lines new | Medium — new async call | 1h |
| Add tard section renderer with cache read | ~60 lines new | Low | 0.5h |
| DR button inline wiring + state sync | ~30 lines new | Low | 0.5h |
| Note inline form (replaces broken Note button) | ~40 lines new | Low | 0.5h |
| CSS additions (expand animation, tard divider) | ~60 lines new | Low | 0.5h |
| Widen popover to 500px max-width | 1 line | Trivial | 5min |
| Remove broken Note→Profile alias | 1 line deleted | Trivial | 5min |
| Footer cleanup (remove redundant instruction text) | 5 lines changed | Trivial | 5min |
| **Total** | **~400 lines net** | | **~5h** |

### Risk flags

- `modUserCadence` RPC is called per-expand. If it has no caching of its own, opening 10 rows rapidly will fire 10 RPCs. Mitigation: `inner.dataset.loaded` guard (already in spec above) ensures one fetch per row per popover session.
- `modProfilesWritePatch` note field: confirm worker-side field name is `notes` (confirmed at L6186 — it is).
- Tard section: pattern rows vs user rows are conceptually different. Use clear visual distinction (`🤖 PATTERN` vs `🤖 USERNAME`) and don't conflate DR-of-a-pattern-rule with DR-of-a-specific-user.
- Max-height on drill panel needs to be tall enough for the note textarea + action strip. `max-height: 280px` with overflow-y:auto is safe.

---

## K. Key Design Decisions Summary

1. **DR is a first-class collapsed-row action** — always visible, never hidden behind expand or dropdown. 2 clicks max.
2. **Expand is for investigation** — history snapshot, full reason, note. Costs one extra click — acceptable because it's optional.
3. **One expanded row at a time** — collapsing others on expand prevents runaway layout growth in a small popover.
4. **Tard section is appended, not interleaved** — keeps SUS (confirmed) and AI (suspect) conceptually separate. Purple divider is the visual boundary.
5. **Note button is fixed** — it now writes a note instead of opening a profile. The broken alias at L16993-16996 is deleted.
6. **Popover gets wider** — 420→500px max-width to accommodate the drill panel comfortably.
7. **DR button disables after use** — prevents double-add confusion; state syncs from `getDeathRow()` on initial render.
