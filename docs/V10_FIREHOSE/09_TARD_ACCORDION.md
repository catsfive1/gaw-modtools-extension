# Firehose Feature 9 -- Tard Suggester Status-Bar Accordion

## A. WHY MOVE FROM POPUP

The current tard suggester lives in `popup.html` behind the `maintTardSuggest` button, with results rendered into `maintTardSuggestPanel`. The popup is a hostile environment for this workflow:

**Focus-loss destruction.** Chrome closes the popup the moment the mod clicks anywhere on the page -- to check a username, open a tab, or read a comment. The panel renders 3-6 suggestions that require cross-referencing with live content; a mod who clicks out loses everything and has to re-trigger an AI call (quota cost) to get back.

**No multi-action flow.** The popup forces serial operations: see suggestion, click "add DR rule," popup closes, reopen, next suggestion. Adding 3 patterns from one scan should be a 10-second batch action, not 3 round-trips through the popup lifecycle.

**Context switching breaks the comparison.** The AI suggestions include `example` usernames. A mod needs to see those examples against the live feed to judge severity. That requires two simultaneous views -- the suggestion panel and the page -- which the popup prevents by definition.

**Quota waste from re-triggers.** Each `/ai/tards/suggest` call costs AI budget (preflight-gated, counted against daily quota). Mods who lose focus and re-trigger burn budget for results they already received. One persistent fetch per session is the target.

The status-bar accordion solves all three: it survives navigation within the tab, stays co-visible with page content, and supports multi-select bulk actions in a single committed operation.

---

## B. STATUS-BAR ACCORDION POSITION

**Insert between `sirenClearBtn` and `mmBtn`** in the `bar` el() call (line ~15381 of `modtools.js`). Exact insertion point in the existing bar construction:

```
sirenBtn,
sirenClearBtn,
// --> INSERT: tardAccordionBtn <--
mmBtn,
c5Btn,
```

The siren cluster (`sirenBtn` + `sirenClearBtn`) is the alert/threat surface. Tard suggestions are threat-adjacent -- AI-identified hostile patterns worth promoting to Death Row. Sitting immediately after siren is semantically correct: siren = active alerts, tard accordion = pattern candidates. Presence/team buttons (`mmBtn`, `c5Btn`) follow, which are coordination tools that belong further right.

**Button identity:** `id="gam-tard-suggest-btn"`, class `gam-bar-icon`. Emoji: `✨` (matches the popup's existing header text, no new visual vocabulary). Title attribute: `"AI tard patterns -- click to expand (scans last 80 usernames via firehose)"`.

**Accordion behavior:** clicking `gam-tard-suggest-btn` toggles an absolutely-positioned panel (`id="gam-tard-accordion"`) anchored `bottom: 36px` above the status bar, left-aligned with the button. This is a drop-UP accordion, not a modal and not an overlay panel. It does not steal focus and is dismissed by a second click on the button or by pressing Escape -- not by any focus-loss event. The page content behind it remains fully interactive.

**Panel dimensions:** `min-width: 360px`, `max-width: 480px`, `max-height: 320px` with `overflow-y: auto`. Matches the monospace dark aesthetic of the existing `maintTardSuggestPanel` render (background `#0a0a0b`, border `#ff9933`).

---

## C. MULTI-SELECT UX

The core improvement over the popup: multi-select with a single committed bulk-add. Current popup adds one DR rule per click. Accordion adds N selected rules in one atomic write.

**Per-row layout** (three columns):

```
[ CHK ] [SEV pill] [pattern + label + example]        [row confidence]
```

- **CHK**: `<input type="checkbox" class="gam-tard-chk">` checked by default for `high` severity, unchecked by default for `medium`/`low`. Mod deselects, not selects.
- **SEV pill**: `<span class="gam-tard-sev">` -- colored badge. `high` = `#ff3b3b`, `medium` = `#ffd84d`, `low` = `#9b9892`. Inherits from existing `sevColors` map in `popup.js` line 3866.
- **Pattern + label + example**: same structure as popup lines 3873-3878 -- `pattern` in `#ff9933` bold, `label` + `(e.g. example)` in `#9b9892`.

**Bulk action footer** (sticky at panel bottom, always visible):

```
[  Add N selected as DR rules  ]   [ Select all ]  [ Clear ]
```

- "Add N selected as DR rules" button: recalculates `N` on every checkbox change. Disabled when `N === 0`. On click: reads `chrome.storage.session` for cached suggestions, writes all selected to `autoDeathRowRules` via a single `chrome.storage.local.get` -> `set` round-trip (not one per rule like the current popup implementation).
- "Select all" / "Clear" toggle: flips all checkboxes in one click.
- After bulk add: button text changes to "Added N rules", each affected row gets a `--` state (greyed, checkbox disabled, pattern crossed out). Panel stays open -- mod can verify what was committed.

**Already-exists guard**: same logic as popup line 3890 (`rules.some(r => r.pattern === s.pattern)`). Rows where the pattern already exists in `autoDeathRowRules` render as `already in DR` dimmed label, checkbox disabled, excluded from the bulk count.

---

## D. PERSISTENCE

**`chrome.storage.session`** is the right scope. Rationale:

- `session` storage survives same-tab navigation (the core requirement) but dies with the tab -- no stale suggestion lists carrying over to next day sessions.
- AI responses are tab-local in intent: the firehose snapshot was taken when the mod triggered the scan; it is meaningfully current for the duration of that browsing session.
- `chrome.storage.local` would be wrong here -- tard suggestions are ephemeral AI output, not settings. Polluting local with time-sensitive AI results creates a stale-read problem next session.

**Storage key:** `gam_tard_suggestions` -- object `{ suggestions: [...], scanned: N, fetchedAt: ISO8601, tab: tabId }`.

**Cache strategy:**

1. On accordion open: check `chrome.storage.session.get('gam_tard_suggestions')`.
2. If cache exists and `fetchedAt` is less than 20 minutes old: render immediately from cache. Show `"cached N min ago"` note in panel header.
3. If cache is absent or stale: show `"fetching..."` spinner in the panel, fire `chrome.runtime.sendMessage({ type:'rpc', name:'aiTardSuggest' })` (same RPC as the popup uses), store response to `chrome.storage.session`, render.
4. Manual refresh: `[ Refresh ]` button in panel header triggers a fresh fetch regardless of cache age. Clearly labeled -- mod opts in to spending quota.

This means the common path (accordion opened a second time during the same session) is instant -- zero network, zero quota.

**Dismissed state**: after bulk-add, mark the panel as `done` in session storage (`gam_tard_suggestions.bulkAddedAt`). On next open, show "N rules added this session" summary with option to refresh. Prevents accidental double-adds.

---

## E. SHIP-TONIGHT PATCH

The popup logic is clean and self-contained -- port is mechanical, not a rewrite. Three diffs.

**Diff 1 -- `modtools.js`: Add button and accordion panel to status bar**

Add `tardAccordionBtn` and `tardAccordionPanel` as module-scoped `let` vars in the bar initialization block. Button constructed with `el()` matching existing pattern:

```javascript
const tardAccordionBtn = el('button', {
  id: 'gam-tard-suggest-btn',
  cls: 'gam-bar-icon',
  title: 'AI tard patterns -- click to expand'
}, '✨');
```

Panel constructed as a `div` appended to `document.body` (not inside the bar, to avoid bar height disruption):

```javascript
const tardAccordionPanel = el('div', {
  id: 'gam-tard-accordion',
  style: {
    display: 'none',
    position: 'fixed',
    bottom: '46px',
    zIndex: '9999981',
    minWidth: '360px',
    maxWidth: '480px',
    maxHeight: '320px',
    overflowY: 'auto',
    background: '#0a0a0b',
    border: '1px solid #ff9933',
    font: '11px/1.4 ui-monospace,JetBrains Mono,monospace',
    padding: '8px'
  }
});
document.body.appendChild(tardAccordionPanel);
```

Button position: insert between `sirenClearBtn` and `mmBtn` in the `bar` el() children array.

Click handler on `tardAccordionBtn`:
1. If panel visible: hide it, return.
2. Show panel, position it left-aligned with button (`getBoundingClientRect().left`).
3. Check session cache -> render or fetch.

Escape key listener: `document.addEventListener('keydown', e => { if (e.key === 'Escape') tardAccordionPanel.style.display = 'none'; })` -- scoped to one listener registered once.

**Diff 2 -- `modtools.js`: `renderTardAccordion(suggestions, scanned, cachedMinAgo)` function**

Port of popup.js lines 3842-3914 with these changes:
- Grid layout adds a leading checkbox column.
- "Add N selected as DR rules" footer replaces individual per-row buttons.
- Bulk write uses a single `chrome.storage.local` round-trip.
- Rows with existing DR patterns render as `already in DR` (disabled).

The `addBtn` per-row is removed entirely. The footer button does the write.

**Diff 3 -- CSS block in `modtools.js` CSS string**

Add to the existing bar CSS:

```css
#gam-tard-accordion { border-radius: 6px; box-shadow: 0 4px 20px rgba(0,0,0,.7); }
#gam-tard-accordion .gam-tard-footer {
  position: sticky; bottom: 0; background: #0a0a0b;
  border-top: 1px solid #2a2825; padding: 6px 0 0; margin-top: 6px;
  display: flex; gap: 6px; align-items: center;
}
#gam-tard-accordion .gam-tard-add-btn {
  flex: 1; background: transparent; border: 1px solid #2eaa44;
  color: #44dd66; padding: 4px 10px; cursor: pointer;
  font: 600 10px ui-monospace,monospace; letter-spacing: 0.04em;
  text-transform: uppercase; border-radius: 3px;
}
#gam-tard-accordion .gam-tard-add-btn:disabled { opacity: 0.4; cursor: default; }
#gam-tard-accordion .gam-tard-sev {
  font-weight: 700; font-size: 9px; letter-spacing: 0.04em;
  text-transform: uppercase; flex-shrink: 0;
}
```

**What stays in the popup**: nothing. Remove `maintTardSuggest`, `maintTardSuggestStatus`, and `maintTardSuggestPanel` from `popup.html`. Remove the `maintTardSuggest()` function and its `__maintWire` call from `popup.js`. The RPC path (`aiTardSuggest` -> `/ai/tards/suggest`) is unchanged -- only the render target moves.

**No worker changes required.** `handleAiTardsSuggest` in `gaw-mod-proxy-v2.js` and its preflight guard are untouched.

---

## F. STRETCH

**Live ambient refresh.** On a 15-minute interval (when the accordion has been opened at least once this session), silently re-fetch and update session cache in the background. Badge the button with a yellow dot when new suggestions differ from last render. Mod sees the dot, clicks to expand updated results. No auto-notification -- just the dot. Keeps suggestions current without burning quota on mods who aren't working the pattern queue.

**Confidence pills.** The Llama response already includes `severity` per suggestion. Stretch: request a numeric `confidence` field (0-100) in the system prompt output schema. Render as a pill `87%` in muted text next to the severity badge. Lets mods prioritize: `high / 94%` is a no-brainer add; `medium / 51%` gets a second look.

**Severity color tiers as row backgrounds.** Instead of only the pill being colored, tint the entire row: `high` rows get `background: rgba(255,59,59,0.06)`, `medium` rows `rgba(255,216,77,0.04)`. Low severity rows are neutral. Gives the mod visual priority ranking at a glance without reading the text.

**Pattern de-dup against existing DR rules on render.** Current popup checks on add (line 3890). Stretch: pre-check on render -- if pattern already exists in `autoDeathRowRules`, immediately mark the row `already in DR`, disable its checkbox, exclude from count. Mod sees at a glance what the AI proposed that they already have vs. what's net-new. Requires one `chrome.storage.local.get('gam_settings')` at render time, which is cheap.

**Bulk pattern sync push.** After a bulk-add, immediately call the existing `pushPatternSync()` path (lines 6305-6319 in `modtools.js`) so the newly added DR rules propagate to the team without waiting for the 60-second poll cycle. Already wired; just needs a call after the bulk write completes.
