# V11 #2 -- Modmail 3-Column Panel (v0 ship)

**Status:** SHIP-TONIGHT patch -- CSS-only layout upgrade, zero JS logic changes.
**Source audit date:** 2026-05-09
**Reference spec:** `docs/V11_R2_CAT3_UX_UI.md` item #12

---

## A. CURRENT STRUCTURE (file:line + DOM)

**Entry point:** `modtools.js:14417` -- `_showModmailPanel()`

The panel is injected as a single `<div id="gam-modmail-panel">` fixed to the
right edge. All layout is inline `style.cssText`; no external CSS class owns
this panel today.

**Live geometry (as of v9.24.0):**

```
panel#gam-modmail-panel
  width: 680px  max-width: 95vw  (inline style, line 14422)
  position: fixed; top:0; right:0; bottom:0
  display: flex; flex-direction: column

  [HEADER row] -- flex-shrink:0, background:#0a0a0b, border-bottom
    Modmail label | spacer | Refresh btn | Close btn

  [BODY wrapper] -- flex:1; display:flex; overflow:hidden
    div#gam-mmp-list   -- width:280px; flex-shrink:0; border-right; overflow-y:auto
    div#gam-mmp-detail -- flex:1; overflow-y:auto; padding:14px
```

`#gam-mmp-detail` renders in sequence: thread title block, latest message
block, `#gam-mmp-ai-host` (AI cards), and the "Open thread" button row. The AI
cards themselves render in a `grid-template-columns:1fr 1fr` 2-up grid inside
`#gam-mmp-ai-host` (line 14599). There is **no column 3** -- AI content is
co-mingled inside column 2.

Sender intel does not exist in the panel at all today. The popover
(`_showModmailPopover`, line 14630) likewise has no intel strip.

**DOM produced by `renderDetail` (lines 14531-14583) in pseudo-markup:**

```
#gam-mmp-detail
  .thread-header   (subject, from, message count, status)
  .last-message    (most recent body, pre-wrap)
  #gam-mmp-ai-host
    [button: Generate 4 AI replies]   <- or cards if cached
  .action-row
    [button: Open thread on GAW]
```

**Key data already available from `modmailRecent` RPC response (per thread `t`):**

| field        | source        | already in scope |
|--------------|---------------|------------------|
| t.first_user | thread object | yes              |
| t.status     | thread object | yes              |
| t.created_at | thread object | check below      |
| ban_count    | not yet       | ambient fetch needed |
| watchlist    | not yet       | ambient fetch needed |
| sus_flag     | not yet       | ambient fetch needed |

Account age / ban count / watchlist are available via the existing
`getUserSummary` / `userIntel` ambient-prefetch path already in the
extension. The intel strip reads from `chrome.storage.session` -- same
pattern as the AI draft cache.

---

## B. NEW LAYOUT (3-column flex)

**Target geometry:**

```
viewport >= 1280px:  panel = 920px, 3 columns
viewport  < 1280px:  panel = 680px, 2 columns (col 3 hidden)
```

**Column allocation:**

| Col | ID                  | Width  | Background | Purpose               |
|-----|---------------------|--------|------------|-----------------------|
| 1   | #gam-mmp-list       | 240px  | #0f1114    | Thread list           |
| 2   | #gam-mmp-center     | flex:1 | #181b20    | Sender intel + messages |
| 3   | #gam-mmp-ai         | 320px  | #111318    | AI drafts only        |

Col 2 takes remaining space (920 - 240 - 320 = 360px at max width, or 680 - 240
= 440px in 2-col fallback where col 3 is display:none).

**Body wrapper becomes:**

```
BODY wrapper (flex row, overflow:hidden)
  #gam-mmp-list     240px fixed, flex-shrink:0, overflow-y:auto
  #gam-mmp-center   flex:1, overflow-y:auto, display:flex, flex-direction:column
    [INTEL STRIP]   40px, flex-shrink:0
    [MESSAGES]      flex:1, overflow-y:auto, padding:14px
  #gam-mmp-ai       320px fixed, flex-shrink:0, overflow-y:auto
```

**Dividers:** `1px solid #2a2f38` between all columns. No decorative elements.

---

## C. SENDER INTEL STRIP (top of col 2)

**Visual spec (from item #12):**

```
HEIGHT: 40px
BACKGROUND: inherits #181b20 from col 2
BORDER-BOTTOM: 1px solid #2a2f38
PADDING: 0 12px
DISPLAY: flex; align-items:center; gap:8px; flex-shrink:0
```

**Chip layout (left to right):**

```
[u/username  #66ccff bold]  [SPACE]
[AGE chip]  [BAN chip]  [SUS chip]  [WATCH chip]
```

Chips follow the existing `.gam-chip` visual language (item #1 token set):

| Chip      | Condition           | FG        | BG          |
|-----------|---------------------|-----------|-------------|
| AGE       | always shown        | #9b9892   | #1e222a     |
| BAN >0    | ban_count > 0       | #f04040   | rgba(240,64,64,0.18) |
| BAN =0    | omit               | --        | --          |
| SUS       | sus_flag active     | #f5a623   | rgba(245,166,35,0.18) |
| WATCHLIST | watching = true     | #a78bfa   | rgba(167,139,250,0.18) |

Account age format: `Xd` / `Xmo` / `Xy` (tabular mono, 10px). If data not
loaded yet, show `--` placeholder and populate on async resolve.

**Data path:** Intel strip reads from `chrome.storage.session` key
`gam_user_intel_<username>` (same ambient-prefetch path the status bar
already populates when a mod views a user). On miss, fire
`rpcCall('getUserSummary', { username: t.first_user })` inline and cache.
This is a read-only operation -- no new RPC verb needed, path already exists.

---

## D. RESPONSIVE BREAKPOINTS

Two states only -- no intermediate steps:

**State A: 3-column (viewport >= 1280px)**

```css
#gam-modmail-panel {
  width: 920px;
}
#gam-mmp-ai {
  display: flex;  /* visible */
}
#gam-mmp-ai-host {
  display: none;  /* AI cards moved to col 3, not col 2 */
}
```

**State B: 2-column fallback (viewport < 1280px)**

```css
#gam-modmail-panel {
  width: 680px;
}
#gam-mmp-ai {
  display: none;  /* col 3 hidden */
}
#gam-mmp-ai-host {
  display: block; /* AI cards fall back into col 2 as before */
}
```

Breakpoint applied via `window.innerWidth` check at panel construction time
(one check, no ResizeObserver needed for v0). The panel is fixed-position and
does not reflow on viewport resize while open -- this is acceptable for v0.
ResizeObserver + live reflow is the stretch goal.

Condition to add at line 14422 (panel construction, before `style.cssText`
assignment):

```js
const is3Col = window.innerWidth >= 1280;
const panelWidth = is3Col ? '920px' : '680px';
```

---

## E. SHIP-TONIGHT PATCH

**Strategy:** CSS-only restructure of the panel body. No logic changes. The
`renderDetail` function output moves wholesale into `#gam-mmp-center .messages`
and `#gam-mmp-ai`. The AI card host (`#gam-mmp-ai-host`) relocates to col 3
when 3-col is active.

### E1. Panel construction diff (line ~14421-14439)

Replace the current `panel.innerHTML` block with the 3-column structure below.
The header row is unchanged. Only the body changes.

```js
// line 14421 -- replace panel.innerHTML assignment:
const is3Col = window.innerWidth >= 1280;
panel.style.cssText =
  'position:fixed;top:0;right:0;bottom:0;' +
  'width:' + (is3Col ? '920px' : '680px') + ';' +
  'max-width:95vw;z-index:9999988;' +
  'background:#131316;border-left:1px solid #2a2f38;' +
  'color:#e8e6e1;font:11px/1.4 ui-monospace,JetBrains Mono,monospace;' +
  'display:flex;flex-direction:column;' +
  'box-shadow:-8px 0 30px rgba(0,0,0,0.55);' +
  'transform:translateX(100%);transition:transform 0.2s ease-out';

panel.innerHTML =
  // HEADER -- unchanged
  '<div style="background:#0a0a0b;border-bottom:1px solid #3d3a35;padding:10px 14px;display:flex;align-items:center;gap:10px;flex-shrink:0">' +
    '<span style="color:#ff9933;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;font-size:12px">\u{1F4E5} Modmail</span>' +
    '<span style="color:#5a5752;font-size:10px">-- full panel</span>' +
    '<span style="flex:1"></span>' +
    '<button data-refresh="1" title="Refresh" style="background:transparent;border:1px solid #2a2825;color:#9b9892;padding:3px 8px;cursor:pointer;font:600 9px ui-monospace,monospace;letter-spacing:0.06em;text-transform:uppercase">Refresh</button>' +
    '<button data-close="1" title="Close (ESC)" style="background:transparent;border:none;color:#5a5752;padding:2px 8px;cursor:pointer;font-size:18px;line-height:1">x</button>' +
  '</div>' +
  // BODY -- 3-column flex row
  '<div style="flex:1 1 auto;display:flex;overflow:hidden">' +
    // COL 1: thread list
    '<div id="gam-mmp-list" style="width:240px;flex-shrink:0;border-right:1px solid #2a2f38;overflow-y:auto;background:#0f1114">loading...</div>' +
    // COL 2: intel strip + messages
    '<div id="gam-mmp-center" style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:#181b20">' +
      '<div id="gam-mmp-intel" style="height:40px;flex-shrink:0;border-bottom:1px solid #2a2f38;display:flex;align-items:center;gap:8px;padding:0 12px;color:#5a5752;font-size:10px">Select a thread</div>' +
      '<div id="gam-mmp-detail" style="flex:1;overflow-y:auto;padding:14px;color:#9b9892">' +
        '<div style="text-align:center;padding:40px 20px">' +
          '<div style="color:#5a5752;font-size:11px;letter-spacing:0.08em;text-transform:uppercase">Select a thread</div>' +
          '<div style="color:#5a5752;font-size:10px;margin-top:6px">Pick a thread on the left to see messages + AI reply candidates.</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    // COL 3: AI drafts (hidden at <1280px)
    '<div id="gam-mmp-ai" style="width:320px;flex-shrink:0;border-left:1px solid #2a2f38;overflow-y:auto;background:#111318;' + (is3Col ? '' : 'display:none;') + '">' +
      '<div style="padding:10px 12px;border-bottom:1px solid #2a2f38;flex-shrink:0">' +
        '<span style="color:#7cb8ff;font-size:9px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase">AI Drafts</span>' +
      '</div>' +
      '<div id="gam-mmp-ai-host" style="padding:10px">' +
        '<div style="color:#5a5752;font-size:10px">Select a thread</div>' +
      '</div>' +
    '</div>' +
  '</div>';
```

### E2. renderDetail adjustment

The existing `renderDetail` function writes to `#gam-mmp-detail` and
`#gam-mmp-ai-host`. With the new DOM, `#gam-mmp-ai-host` now lives inside
`#gam-mmp-ai` (col 3) instead of inside `#gam-mmp-detail`. The query in
`renderDetail` already uses `detail.querySelector('#gam-mmp-ai-host')` --
**this breaks** because `#gam-mmp-ai-host` is no longer a descendant of
`#gam-mmp-detail`.

Fix: change the query to scope from `panel` instead of `detail`:

```js
// line ~14555 -- was:
const aiHost = detail.querySelector('#gam-mmp-ai-host');
// change to:
const aiHost = panel.querySelector('#gam-mmp-ai-host');
```

One-line change. No other logic in `renderDetail` touches the AI host.

### E3. Intel strip population

Add `_renderIntelStrip(t)` call at the top of `renderDetail`, immediately
after the detail innerHTML assignment:

```js
function _renderIntelStrip(t) {
  const strip = panel.querySelector('#gam-mmp-intel');
  if (!strip) return;
  strip.innerHTML =
    '<span style="color:#66ccff;font-weight:600;font-size:11px">u/' + escapeHtml(t.first_user || '?') + '</span>' +
    '<span id="gam-intel-age" style="background:#1e222a;color:#9b9892;font-size:10px;padding:2px 7px;border-radius:10px;font-variant-numeric:tabular-nums">--</span>' +
    '<span id="gam-intel-ban" style="display:none;background:rgba(240,64,64,0.18);color:#f04040;font-size:10px;padding:2px 7px;border-radius:10px;font-weight:600">BAN --</span>' +
    '<span id="gam-intel-sus" style="display:none;background:rgba(245,166,35,0.18);color:#f5a623;font-size:10px;padding:2px 7px;border-radius:10px;font-weight:600">SUS</span>' +
    '<span id="gam-intel-watch" style="display:none;background:rgba(167,139,250,0.18);color:#a78bfa;font-size:10px;padding:2px 7px;border-radius:10px;font-weight:600">WATCH</span>';

  // Async resolve: check session cache first, then RPC fallback
  (async () => {
    let intel = null;
    try {
      const key = 'gam_user_intel_' + t.first_user;
      const out = await chrome.storage.session.get(key);
      intel = out && out[key];
    } catch(_){}
    if (!intel && t.first_user) {
      try {
        const r = await rpcCall('getUserSummary', { username: t.first_user });
        if (r && r.ok && r.data) intel = r.data;
      } catch(_){}
    }
    if (!intel) return;

    const ageEl  = panel.querySelector('#gam-intel-age');
    const banEl  = panel.querySelector('#gam-intel-ban');
    const susEl  = panel.querySelector('#gam-intel-sus');
    const watchEl = panel.querySelector('#gam-intel-watch');

    if (ageEl && intel.account_age_days != null) {
      const d = intel.account_age_days;
      ageEl.textContent = d < 30 ? d + 'd' : d < 365 ? Math.floor(d / 30) + 'mo' : Math.floor(d / 365) + 'y';
    }
    if (banEl && intel.ban_count > 0) {
      banEl.style.display = '';
      banEl.textContent = 'BAN ' + intel.ban_count;
    }
    if (susEl && intel.sus_flag) {
      susEl.style.display = '';
    }
    if (watchEl && intel.watching) {
      watchEl.style.display = '';
    }
  })();
}
```

Call site inside `renderDetail`, before the AI host block:

```js
// add immediately after: detail.innerHTML = ...
_renderIntelStrip(t);
```

### E4. Thread list row height adjustment

Current row padding is `8px 12px` with 3 sub-elements (line 14497). Spec
calls for 48px row height. Add `min-height:48px` to the row `cssText`:

```js
// line 14497 -- add min-height:48px
row.style.cssText = 'min-height:48px;border-bottom:1px solid #2a2825;padding:8px 12px;cursor:pointer;transition:background-color 80ms';
```

Thread list width changes from 280px (hardcoded in current `#gam-mmp-list`
style) to 240px -- this is handled in the new innerHTML above.

### E5. Active thread highlight

Current selected-row style (line 14503-14505):

```js
row.style.background = 'rgba(255,153,51,0.12)';
row.style.borderLeft = '2px solid #ff9933';
row.style.paddingLeft = '10px';
```

Upgrade to spec (3px rail, matching item #12):

```js
row.style.background = 'rgba(255,153,51,0.10)';
row.style.borderLeft = '3px solid #ff9933';
row.style.paddingLeft = '9px';  // 12-3=9 to keep text flush
```

### E6. AI column header

Already included in the new innerHTML (E1). The `#gam-mmp-ai` col has a
sticky header row reading "AI DRAFTS" in `#7cb8ff` at 9px letter-spaced. The
`renderAICards` function writes into `#gam-mmp-ai-host` which is now beneath
that header. No change to `renderAICards` needed.

---

## F. CHANGE SUMMARY

| Location | Line(s) | Type | Description |
|---|---|---|---|
| `_showModmailPanel` | ~14421-14439 | Replace | 3-col innerHTML, dynamic width |
| `_showModmailPanel` | 14422 | Add | `is3Col` const + conditional width |
| `renderDetail` | ~14555 | 1-line | aiHost query: `detail.` -> `panel.` |
| `renderDetail` | ~14532 (after innerHTML) | Add | `_renderIntelStrip(t)` call |
| `renderDetail` | 14497 | Tweak | row min-height:48px |
| `renderDetail` | 14503-14505 | Tweak | Active rail 3px, paddingLeft 9px |
| new function | after `renderAICards` | Add | `_renderIntelStrip(t)` (20 lines) |

**Total JS delta:** ~50 lines added, ~10 modified. No new RPC verbs. No manifest
changes. No background script changes.

---

## G. WHAT IS NOT IN THIS PATCH (v.next)

- ResizeObserver live reflow when viewport resizes while panel is open
- Drag-resize handle between col 2 and col 3 (item #12 stretch)
- `chrome.storage.local` persistence of column widths (item #12 stretch)
- Status chip on thread-list rows (right-aligned per item #12 sketch) --
  already partially present via the `status` span in `head` (line 14516-14518);
  moving it to right-align is a CSS tweak deferred to keep this patch minimal
- AI card grid from 2-up to vertical stack in col 3 (the 2-up grid
  `grid-template-columns:1fr 1fr` at line 14599 may be too wide for 320px col;
  set to `1fr` for v0, revisit after UAT)
