# Frontend 3 -- Empty States Everywhere

**Agent:** Frontend Polish 1/3 -- Empty States discipline
**Spec ref:** V11_R2_CAT3_UX_UI.md item #9 (four categories A/B/C/D) + UAT_MODMAIL_2026-05-08.md C.1
**Date:** 2026-05-09

---

## A. CURRENT EMPTY STATE INVENTORY

The codebase ships `renderEmptyState()` (modtools.js:3958) and five SVG icons in `UX_SVG` (modtools.js:3946-3951). That function is flag-gated behind `__uxOn()` -- it returns `null` when the polish flag is off, and callers fall through to v8.0 plain-text. Every surface below has a v8.0 fallback; the gap is the absence of designed Cat A/B/C/D states in the v8.1 path.

| Surface | File | Current empty state | Category needed | Grade |
|---|---|---|---|---|
| Modmail thread list -- popover | modtools.js:14750 | Plain `div` gray text: "No modmail threads after firehose backfill..." Auto-fires firehose first (good), but if backfill also empty shows wall-of-text diagnostic. No icon. | B (act: run backfill) | D |
| Modmail thread list -- panel | modtools.js:14511-14513 | Same pattern as popover. "No modmail threads after firehose backfill." Plain gray div, no icon, same diagnostic blob. | B | D |
| Mod chat list (`.gam-mc-list`) | modtools.js:14108 | **Nothing.** The `list` div is created empty with no initial content or zero-state. When presence returns no mods, the sidebar is blank white space with no label. | A (normal -- solo shift) | F |
| Drill-down panel (6 variants) | popup.js:2722-2733 | `pop-drill-empty` div: "No data in window." + hint text from `__DRILL_EMPTY_HINT`. Text-only, no icon, functional but visually raw. | A/B depending on variant | C |
| Death Row queue (drill: `dr`) | popup.js:2767 | Falls into `__renderDrillEmpty('dr')` -- text only: "Death Row queue is empty. Schedule a ban from the Mod Console to populate." | A (normal -- queue clear) | C |
| Watchlist section (mod log panel) | modtools.js:8884-8899 | **Nothing.** `if(wu.length>0)` -- when watchlist is empty, the entire Watchlist section is simply absent from the Mod Log modal. No zero-state label, no icon, no indication the feature exists. | A (normal -- clean slate) | F |
| Bug reports panel (lead view) | popup.js:2356-2358 | Status span text only: "no open reports" in a `pop-token-status ok` span. No icon, no visual treatment, indistinguishable from a loading state. | A (normal -- all clear) | D |
| Maintenance reports panel | popup.js:4103-4107 | Plain `div` with `color:#aaa` and "No reports in window." No icon. Visually identical to an errored/loading state. | A (normal -- system healthy) | D |
| Tard suggestions (AI scan) | popup.js:3853-3859 | Gray div: "No suspicious patterns detected. (Check firehose is running + gaw_users has data.)" Parenthetical implies broken. | A (normal) / D (error) conflated | D |
| Sticky scan (AI scan) | popup.js:3938-3943 | Gray div with `note` fallback or "No sticky requests detected." Adequate text but no visual. Same broken-vs-clean conflation. | A (normal) | C |

**Summary:** 2 surfaces (mod chat list, watchlist) have zero empty-state handling -- blank space. 4 surfaces have text-only fallbacks that read as "broken or loading." 4 surfaces have functional v8.0 text but no icon treatment and no Cat A/B/C/D distinction.

---

## B. PROPOSED PER-SURFACE EMPTY STATE

Copy and visual spec for each surface. Icon names reference `UX_SVG` keys (existing) or new additions noted with `[ADD]`.

---

### B1. Modmail thread list -- popover and panel

**Category: B** -- system has data, mod needs to act (backfill ran, still empty = visit /modmail first).

```
Icon: 'modmail-empty'  [existing UX_SVG key]
Headline: "No threads ingested yet"
Subtext: "Visit greatawakening.win/modmail to seed the firehose, then refresh."
CTA label: "Run firehose now"
CTA action: window.__GAM_BACKFILL_MODMAIL({ maxPages: 5 })
```

**Color:** icon in `#f5a623` (amber -- action needed). CTA button: amber ghost (`border: 1px solid #ff9933; color: #ff9933; background: transparent`).

**When to show:** only after the auto-firehose attempt has already run (`forceFirehose === true` path, threads still zero). Before that attempt, the existing "firing firehose..." progress message is correct -- do not replace it.

**Current code patch site:** modtools.js:14749-14751 (popover) and modtools.js:14511-14513 (panel). Both replace the `body.innerHTML = '<div>...'` blob with `renderEmptyState(...)`.

---

### B2. Modmail thread list -- post-firehose error (Cat D)

**Category: D** -- broken / RPC failed.

```
Icon: [ADD] 'error-octagon'
Headline: "Could not load modmail"
Subtext: verbatim error message from API (already escaped via escapeHtml)
CTA label: "Retry"
CTA action: _loadModmailList(false)
```

**Color:** icon in `#f04040` (red). CTA: red ghost button.

**Current code patch site:** modtools.js:14730-14732 (popover) and modtools.js:14494-14496 (panel).

---

### B3. Mod chat list -- no recipients

**Category: A** -- normal state on a quiet shift, no action needed.

```
Icon: [ADD] 'users-empty'  [existing UX_SVG key]
Headline: "No mods online"
Subtext: "You're running solo. Messages you send will queue for the team."
CTA: none
```

**Color:** icon in `#5c6370` (gray -- calm). Headline `#8b929e`. Subtext `#5c6370`.

**Current code patch site:** modtools.js:14108 -- after `const list = el('div', { cls:'gam-mc-list' })`, append the empty card immediately. It gets replaced when `renderModList()` populates with actual mods. Use `id="gam-mc-list-empty"` so it can be removed without walking children.

---

### B4. Drill-down panel -- pending triage (no users)

**Category: A** -- normal, queue is clear.

```
Icon: [ADD] 'users-empty'
Headline: "Triage queue clear"
Subtext: "No new users waiting. Run a /users crawl to refresh the roster."
CTA: none
```

**Current code patch site:** popup.js:2746 -- `__renderDrillEmpty('pending')` is called; upgrade `__renderDrillEmpty` to use `renderEmptyState` injected via message relay or inline equivalent in popup context.

---

### B5. Drill-down panel -- Death Row queue empty

**Category: A** -- normal. Queue empty = nothing pending.

```
Icon: [ADD] 'check-circle'  (new SVG: <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-5"/></svg>)
Headline: "Death Row clear"
Subtext: "No users scheduled for banning. Add from the Mod Console when ready."
CTA: none
```

**Color:** icon in `#3dd68c` (green -- all clear is a positive state, not neutral).

---

### B6. Watchlist section -- empty (Mod Log modal)

**Category: A** -- clean slate, expected at start.

```
Icon: [ADD] 'eye-empty' (new SVG: <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="12" cy="12" rx="9" ry="6"/><circle cx="12" cy="12" r="2.5"/></svg>)
Headline: "Watchlist empty"
Subtext: "Right-click any /u/ link and choose Watch to add a user."
CTA: none
```

**Size:** 24px icon (smaller -- this is a section within the Mod Log, not a full-panel empty state).

**Current code patch site:** modtools.js:8884 -- the `if(wu.length>0)` block currently hides the entire section when empty. Replace with: always render the section header and append an inline empty note when `wu.length === 0`.

---

### B7. Bug reports panel -- no open reports

**Category: A** -- healthy state, lead sees all-clear.

```
Icon: [ADD] 'bug-clear' (new SVG: <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 8c-2.2 0-4 1.8-4 4s1.8 4 4 4 4-1.8 4-4-1.8-4-4-4z"/><path d="M12 4v4M12 16v4M4 12H2M22 12h-2M6.3 6.3l-1.4-1.4M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/><line x1="4" y1="4" x2="20" y2="20" stroke-width="1.6"/></svg>)
Headline: "No open bug reports"
Subtext: "Team is clean. Reports appear here as mods submit them."
CTA: none
```

**Color:** icon in `#3dd68c` (green -- zero bugs is a good thing). Replace the current inline `status.textContent = 'no open reports'` with a proper empty card rendered inside `panel`.

---

### B8. Maintenance reports panel -- no reports

**Category: A** -- healthy, autonomous maintenance has nothing to flag.

```
Icon: [ADD] 'wrench-check' (new SVG: <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3-3a6 6 0 0 1-7.5 7.5L5.2 21a2.1 2.1 0 0 1-3-3L9.5 9.8a6 6 0 0 1 7.5-7.5l-3 3z"/><path d="M16 10l2 2" stroke-width="1"/></svg>)
Headline: "No maintenance issues"
Subtext: "System is healthy. Autonomous maintenance runs weekly and reports here."
CTA: none
```

**Color:** icon in `#3dd68c`. Replace `popup.js:4104-4107` block.

---

### B9. Tard suggestions -- clean scan

**Category: A** -- normal result, NOT a broken state.

```
Icon: 'users-empty'  [existing]
Headline: "No new patterns detected"
Subtext: "0 suspicious username clusters in current data. Scan again after firehose adds more users."
CTA: none
```

**Key fix:** remove the parenthetical "(Check firehose is running + gaw_users has data.)" -- this reads as an error diagnosis, not a clean result. The mod should read "scan complete, nothing to flag" not "did something break?" The CTA for a broken firehose belongs in a Cat D state, not the normal empty path.

---

### B10. Sticky scan -- no requests

**Category: A** -- clean result.

```
Icon: [ADD] 'pin-empty' (new SVG: <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/><line x1="2" y1="2" x2="22" y2="22" stroke-width="1.6"/></svg>)
Headline: "No sticky requests detected"
Subtext: "No posts requesting mod promotion in the scan window."
CTA: none
```

---

## C. SHARED COMPONENT (gamEmptyState)

The existing `renderEmptyState()` at modtools.js:3958 is the right foundation. It covers the modtools.js content-script context. The popup context (popup.js) has no equivalent -- all popup empty states are hand-rolled inline. Ship a parallel function into popup.js.

```js
// popup.js -- portable empty-state renderer
// Mirrors modtools.js renderEmptyState() interface. No flag-gate (popup already
// on v11 path). Injects its CSS once on first call.
(function __installPopupEmptyState() {
  if (window.__gamEmptyStateReady) return;
  window.__gamEmptyStateReady = true;
  const s = document.createElement('style');
  s.textContent = [
    '.gam-empty-card{display:flex;flex-direction:column;align-items:center;gap:10px;',
    'padding:24px 16px;text-align:center}',
    '.gam-empty-icon{color:#5c6370}',
    '.gam-empty-headline{font-size:13px;font-weight:600;color:#e8eaed}',
    '.gam-empty-desc{font-size:11px;color:#8b929e;max-width:280px;line-height:1.5}',
    '.gam-empty-cta{margin-top:2px;padding:6px 14px;background:transparent;',
    'border:1px solid #ff9933;color:#ff9933;cursor:pointer;font:600 11px ui-monospace,monospace;',
    'letter-spacing:0.06em;text-transform:uppercase}',
    '.gam-empty-cta:hover{background:rgba(255,153,51,0.10)}'
  ].join('');
  (document.head || document.body).appendChild(s);
})();

// Inline SVG map for popup context. Static constants -- XSS-safe.
const GAM_EMPTY_SVG = {
  'modmail-empty':  '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  'users-empty':    '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.2"/><path d="M15 20a4 4 0 0 1 6 0"/></svg>',
  'check-circle':   '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-5"/></svg>',
  'error-octagon':  '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  'rules-empty':    '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>'
};

// gamEmptyState({icon, headline, desc, ctaLabel, ctaFn}) -> DOM node
function gamEmptyState(opts) {
  const o = opts || {};
  const card = document.createElement('div');
  card.className = 'gam-empty-card';
  card.setAttribute('role', 'status');
  if (o.icon && GAM_EMPTY_SVG[o.icon]) {
    const iw = document.createElement('div');
    iw.className = 'gam-empty-icon';
    iw.innerHTML = GAM_EMPTY_SVG[o.icon]; // STATIC -- XSS-safe
    card.appendChild(iw);
  }
  if (o.headline) {
    const h = document.createElement('div');
    h.className = 'gam-empty-headline';
    h.textContent = String(o.headline);
    card.appendChild(h);
  }
  if (o.desc) {
    const d = document.createElement('div');
    d.className = 'gam-empty-desc';
    d.textContent = String(o.desc);
    card.appendChild(d);
  }
  if (o.ctaLabel && typeof o.ctaFn === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gam-empty-cta';
    btn.textContent = String(o.ctaLabel);
    btn.addEventListener('click', function(e) { try { o.ctaFn(e); } catch(_) {} });
    card.appendChild(btn);
  }
  return card;
}
```

**modtools.js** already has `renderEmptyState()` -- add new SVG icons (`check-circle`, `error-octagon`, `eye-empty`, `pin-empty`) to the `UX_SVG` constant at modtools.js:3946. Keep same XSS comment, same pattern.

---

## D. SHIP-TONIGHT PATCH -- top 5 most-visible empty surfaces

Priority ordered by: UAT impact first (C.1 "assumed broken"), then daily-driver surfaces mods see on every shift.

---

### P1 -- Modmail popover post-backfill empty (HIGHEST PRIORITY)

**Why first:** UAT_MODMAIL_2026-05-08 C.1 is explicit. New mod opens the popover, firehose runs, still empty. Current text blob looks like a diagnostic error dump. Directly caused "assumed broken" confusion.

**Patch -- modtools.js:14749-14751:**

Replace:
```js
body.innerHTML = '<div style="padding:12px;color:#9b9892">No modmail threads after firehose backfill.<br><br>' + ...
```

With:
```js
const __mmEmpty = renderEmptyState({
  icon: 'modmail-empty',
  headline: 'No threads ingested yet',
  description: 'Visit greatawakening.win/modmail once to seed the firehose, then use Refresh.',
  ctaLabel: 'Run firehose',
  ctaAction: function() { _loadModmailList(true); }
});
if (__mmEmpty) { body.innerHTML = ''; body.appendChild(__mmEmpty); }
else { body.innerHTML = '<div style="padding:12px;color:#9b9892">No modmail threads yet. Visit /modmail to seed, then Refresh.</div>'; }
return;
```

Apply same replacement to the panel variant at modtools.js:14511-14513.

---

### P2 -- Mod chat list no-recipients blank

**Why second:** Every shift, every mod opens chat. The blank sidebar with zero content for a solo mod reads as "the list didn't load." One sentence eliminates the ambiguity.

**Patch -- modtools.js:14108 (after `const list = el('div', { cls:'gam-mc-list' })`)**

Add immediately after:
```js
const __mcSolo = renderEmptyState({
  icon: 'users-empty',
  headline: 'No mods online',
  description: "Solo shift. Messages queue for the team."
});
if (__mcSolo) {
  __mcSolo.id = 'gam-mc-list-empty';
  __mcSolo.style.padding = '16px 8px';
  list.appendChild(__mcSolo);
}
```

In the function that renders the mods list (presence response handler), add before populating: `const __old = list.querySelector('#gam-mc-list-empty'); if (__old) __old.remove();`

---

### P3 -- Death Row drill-down

**Why third:** Leads open the DR queue every shift. "No data in window." plus one-line hint text is the current state. Green checkmark + "Death Row clear" communicates operational status at a glance. This is the difference between "is anything wrong?" and "I can see we're clear."

**Patch -- popup.js:`__renderDrillEmpty` function (2722-2733):**

Upgrade the DR variant specifically. The other drill variants are lower-visibility but follow the same pattern once `gamEmptyState` is installed in popup.js.

```js
function __renderDrillEmpty(key) {
  const body = $('pop-drill-body');
  body.textContent = '';
  // Cat A/B visual empty states for high-visibility variants
  const visualSpecs = {
    dr: { icon: 'check-circle', headline: 'Death Row clear', desc: 'No users scheduled for banning.' },
    pending: { icon: 'users-empty', headline: 'Triage queue clear', desc: 'No new users waiting. Run a /users crawl to refresh.' }
  };
  const spec = visualSpecs[key];
  if (spec && typeof gamEmptyState === 'function') {
    body.appendChild(gamEmptyState(spec));
    return;
  }
  // Fallback: v8.0 text
  const wrap = document.createElement('div');
  wrap.className = 'pop-drill-empty';
  wrap.textContent = 'No data in window.';
  const hint = document.createElement('div');
  hint.className = 'pop-drill-empty-hint';
  hint.textContent = __DRILL_EMPTY_HINT[key] || '';
  wrap.appendChild(hint);
  body.appendChild(wrap);
}
```

---

### P4 -- Bug reports panel (lead view)

**Why fourth:** Lead-specific. The current "no open reports" lives in a tiny status span -- visually identical to loading. A green check-circle card is instantly readable without parsing the status text color.

**Patch -- popup.js:2356-2360, replace the `reports.length === 0` branch in `loadBugReports`:**

```js
if (reports.length === 0) {
  const emptyCard = (typeof gamEmptyState === 'function')
    ? gamEmptyState({ icon: 'check-circle', headline: 'No open bug reports', desc: 'Team is clean. Reports appear here as mods submit them.' })
    : null;
  if (emptyCard) {
    panel.appendChild(emptyCard);
    status.className = 'pop-token-status ok';
    status.textContent = '0 open -- visibility: ' + (r.data.visible_to || 'leads');
  } else {
    status.textContent = 'no open reports';
  }
  return;
}
```

---

### P5 -- Tard suggestions clean scan

**Why fifth:** The current parenthetical "Check firehose is running + gaw_users has data" makes a clean result look like a warning. Removing it and adding a visual clears the Cat A vs Cat D conflation that confuses mods running their first scan.

**Patch -- popup.js:3853-3859:**

Replace the `suggestions.length === 0` branch:
```js
if (suggestions.length === 0) {
  const emptyCard = (typeof gamEmptyState === 'function')
    ? gamEmptyState({
        icon: 'users-empty',
        headline: 'No new patterns detected',
        desc: '0 suspicious username clusters in current data.'
      })
    : null;
  if (emptyCard) {
    panel.appendChild(emptyCard);
  } else {
    const empty = document.createElement('div');
    empty.style.color = '#9b9892';
    empty.textContent = 'No suspicious patterns detected.';
    panel.appendChild(empty);
  }
  __maintSetStatus('maintTardSuggestStatus', 'scan complete (0 suggestions)', 'ok');
  return;
}
```

---

## Implementation notes

1. `gamEmptyState` must be defined in popup.js before any call site (place it near top of file, after `$()` helper). The `__installPopupEmptyState()` CSS injection runs once on definition.

2. The five new SVG icons for modtools.js UX_SVG: `check-circle`, `error-octagon`, `eye-empty`, `pin-empty`, `wrench-check`. Add them at modtools.js:3946 inside the `UX_SVG` constant. They follow the same `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6">` frame.

3. The modtools.js `renderEmptyState` CSS at line 4006-4011 uses `#1f1f24` background and `border-radius:8px`. The popup context prefers no background card (popup has its own panel background). Override in popup with `gamEmptyState` returning a card with `background: transparent` -- add `.gam-empty-card { background: none }` to the popup-specific CSS injection.

4. **Watchlist section (B6) is not in the P1-P5 ship list** -- it's inside the Mod Log modal which is lower-frequency than the surfaces above. Ship in the next pass once P1-P5 are verified.

5. **Cat C (first-time onboarding) is already handled** by the popup's token-missing flow (`firstRunInput`, `popup.js:1811-1829`). No new work needed there.

6. Success metric (from V11_R2_CAT3 item #9): "assumed broken" complaints drop to zero in next UAT cohort. Measurable by filtering UAT feedback for the phrase "didn't load" or "broken" on surfaces listed above.
