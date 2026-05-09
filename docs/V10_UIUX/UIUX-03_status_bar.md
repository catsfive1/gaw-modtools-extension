# UIUX-03 — Status Bar + Ticker + Button Cluster Audit
**Auditor:** UIUX-03-STATUS-BAR
**Generated:** 2026-05-09
**Source scanned:** `modtools.js` (v10.6.1) — `buildStatusBar()` L16649–L17383, GAM_CSS L17977–19492, Bloomberg override CSS L18640–19428

---

## A. P0 (Broken)

### A.1 Active-mods popover opens BELOW the bar, into the floor — always off-screen

**Location:** `_showActiveModsPopover`, L16435
```js
pop.style.top  = (r.bottom + 6) + 'px';
```
The bar is pinned `bottom:14px`. Every icon sits roughly 14–42px from the bottom of the viewport. `r.bottom + 6` resolves to `viewport_height - ~28px + 6`, which places the popover below the bottom edge of the screen. It is not visible. All other popovers anchor correctly with `bottom: (window.innerHeight - r.top + offset) + 'px'`. This one is the odd one out.

**Severity: P0** — the 👥 Active Mods button has a click handler but the popover it opens is invisible every time.

---

### A.2 `#gam-status-bar .gam-bar-icon::after` hit-extension does not apply to `filterSel` (`<select>`)

**Location:** CSS Iter 4, L18679–18683; `buildStatusBar` L16694–16707
The `::after` inset-`-10px` pseudo-element that extends hit area to 42px applies only to elements where `::after` is rendered. A `<select>` element does not render `::after` in any browser. The filter select (`<select class="gam-bar-icon gam-bar-filter" id="gam-bar-filter">`) therefore has its native click target (22×22 CSS, actual rendered height 22px inside a 28px bar). At 22px it is below the 32px tap minimum from the brief.

**Severity: P0** — undersized tap target on a control Commander uses regularly.

---

## B. P1 (High-friction UX)

### B.1 Shield button tooltip: confirmed present and correct

The `brandBtn` title at L16805:
```
`GAW ModTools ${VERSION} — click for site health — amber color = Bloomberg Terminal theme (not a warning)`
```
This matches the v10.6.0 fix B.8 requirement verbatim. The tooltip is stripped on first hover by the custom-tip system (L17350–17353) and re-displayed above the bar via `gam-bar-custom-tip`. Confirmed discoverable.

Site health popover (`_showSiteHealthPopover`, L16502–16597): opens on click, positioned above the anchor (`bottom: window.innerHeight - r.top + 8`), click-outside dismiss wired (L16592–16597). No P1 issue here.

### B.2 Ticker: no hover-pause, no speed control, static 4-second rotation

**Location:** L16869
```js
setInterval(()=>{ __tickerIdx = (__tickerIdx + 1) % ...; __updateTicker(); }, 4000);
```
The ticker rotates every 4 seconds unconditionally. There is no:
- Hover pause (if the mod is reading a message the ticker switches under them)
- Speed setting (no `getSetting` consulted for rotation interval)
- Visual indication that it is clickable when `target === ''` (CSS `cursor:default` exists on `[data-target=""]` — good, but the `cursor:pointer` on the non-empty-target states is carried by `.gam-bar-icon` base CSS, not explicitly set here, so it inherits — fine)

Hover state for ticker at L19413: `border-color: var(--bb-line-hot)`, background transparent. Visible but subtle. No "click me" affordance beyond the color flicker.

**P1:** Ticker content flipping while the mod is reading it is friction. A `mouseover` pause (clearing and restarting the 4s interval) would be a one-liner fix.

### B.3 Modmail inbox button: count badge correct, but title reverts to stale text after unread count updates

**Location:** L16903–16921 (`__updateInboxBadge`)
When `n > 0`, the title is updated to `n + ' unread modmail — click to open chat panel'`. On hover, `mouseover` at L17350 strips the current `.title` to `data-tip-text`. If `__updateInboxBadge` fires again (every 5s) and writes a new `.title` while the mouse is still hovering, the custom tooltip is now stale (it shows the old count) because the custom tip only re-syncs on a new `mouseover` event, not on a live `.title` mutation. The annotation at v9.24.0 (L17342) acknowledges the re-sync-on-hover fix, but that only fires on the next hover entry, not while hovered.

**P1:** Minor — the count in the tooltip can be up to 5s stale while actively hovering. Not dangerous but confusing.

### B.4 Presence ping interval not visible to the mod anywhere in the bar

Presence pings fire every 30s (L20847: `setInterval(()=>{ if (!document.hidden) ping(); }, 30000)`). The interval is configured at a hardcoded constant — not surfaced in the GEAR panel, not shown in the site-health popover, and not in any tooltip. Mods who enabled presence at consent time have no way to see "I am currently pinging every 30s" without reading source.

**P1:** Low urgency but a discoverability gap. The site-health popover already shows firehose ON/OFF; adding "Presence: ON (30s)" would close the gap with one row.

### B.5 GEAR button: opens `openSettings()`, label is only `⚙️` with tooltip "Settings" — discoverable

The GEAR is a `button` with `onclick:openSettings, title:'Settings'` at L16813. The custom tip system gives it a clean above-bar tooltip. `openSettings()` renders a full settings panel via `showModal()`. The panel itself (L10429+) uses toggle rows with label/desc/liveEffect — UX-clean internally. No P1 issues found in the GEAR button itself.

### B.6 Hot Now siren button: gate working, but button is hidden by default and only appears with data

**Location:** L16720–16722, L16731–16770
```js
const sirenBtn = el('button', { ..., style:{display:'none'}, title:'Live status — click for Hot Now triage' });
if (FEATURE_FLAGS.HOT_NOW_PANEL) sirenBtn.addEventListener('click', _showHotNowPanel);
```
`FEATURE_FLAGS.HOT_NOW_PANEL = true` (L42). The gate is functioning — the handler is wired. The button is hidden until `_updateSirenChip()` fires (2.5s after bar mount) and finds `total > 0`. If total is 0 the button never appears — correct behavior. When it does appear, the inline-flex + width:auto layout (L16751–16758) is applied cleanly.

**P1:** When `HOT_NOW_PANEL` is false, `sirenBtn` has no click handler at all, but still has `title:'Live status — click for Hot Now triage'`. The tooltip would lie to the user. Currently not triggered since the flag is `true`, but a flag flip would leave a dead-but-tooltip'd button. Low risk, noted.

### B.7 Dock toggle: undo works, label is self-describing, no P1 issues

**Location:** L15507–15541
`dockBtn` label always reads the current side ("DOCK: L" / "DOCK: R"). The 4-second undo toast with an UNDO button is correctly anchored inside the panel head. `setSetting('chat.dock', next)` persists the choice. The ADVOCATE C4 concern ("no undo") was resolved in v10.2. Confirmed clean.

### B.8 Bar conflict with site footer / sticky elements

The bar is `position:fixed; bottom:14px; left:50%; transform:translateX(-50%)`. It is centered horizontally and floats 14px from the bottom. GAW's own footer sits below the page scroll area — the bar overlay covers it slightly on short viewports, but because the bar is centered and pill-shaped it doesn't block functional nav. There is **no `padding-bottom` injected into `document.body`** — so content near the true bottom of the page (last post in a feed) can scroll behind the bar and be partially occluded when the user reaches the bottom of the feed.

**P1:** The last ~42px of page content (bar height 28 + bottom 14) is permanently occluded for mods who scroll to the bottom of a feed. No `body { padding-bottom: 56px }` compensation is applied anywhere in the codebase. The `min-width: 720px` on the bar (L19379) means on narrower viewports the bar overflows and creates a horizontal scrollbar — a separate issue on tablets/narrow windows.

---

## C. P2 (Polish)

### C.1 Animations and transitions

- Base `.gam-bar-icon`: `transition:background .1s,color .1s,transform .1s` — appropriate.
- Bloomberg Iter 4 override: `transition: color 100ms ease-out, background-color 100ms ease-out, border-color 100ms ease-out` — consistent, slightly shorter. The `transform` transition from the base is not overridden, so scale(1.12) on hover still applies from the base `.gam-bar-icon:hover` rule. The Iter 4 hover does NOT include a scale transform — so the two rulesets conflict: one adds scale, the other doesn't remove it. Depending on cascade order (Iter 4 comes after base, both at same specificity for the non-`#gam-status-bar` selector), the Iter 4 does NOT override `transform:scale(1.12)` because it doesn't declare `transform` at all. Result: icons still scale on hover inside the bar. Minor visual inconsistency with the flat Bloomberg aesthetic.

- Ticker pulse animation (`gam-ticker-pulse-kf`) at L19422–19426: 1.5s ease-in-out infinite — appropriate for MODMAIL urgency signal.
- Inbox arrived animation (`gam-inbox-arrived-kf`) at L19448–19455: 0.7s × 3 — correct for a brief attention-grabber.
- `prefers-reduced-motion` at L19320: status bar and bar icons are listed — transitions and animations are suppressed. Good.

### C.2 Color contrast (Bloomberg amber-on-black)

- `--bb-amber: #ff9933` on `--bb-bg: #0c0e12`. The contrast ratio of #ff9933 on #0c0e12 is approximately 9.6:1 — well above WCAG AA (4.5:1) and passes AAA (7:1). Good.
- `--bb-ink-dim` (icon default color, approximately #5a5752) on `#0c0e12`: approximately 3.2:1. This is below WCAG AA for normal text (4.5:1) but the icons are emoji/glyphs at 13px — large enough that this is a borderline compliance gap, not a showstopper. On hover/active, color bumps to `--bb-amber` (#ff9933) which passes comfortably.
- `--bb-ink-faint` used for "site quiet" ticker text: approximately 2.5:1 — fails WCAG AA. The intent is to visually de-emphasize the quiet state (correct design intent) but the contrast is below minimum even for large text.

**P2:** "site quiet" ticker text fails WCAG contrast. Consider `--bb-ink-dim` (#5a5752 → target ~3.5:1) or lighten the faint token.

### C.3 Font sizing across button cluster

- Bar base font: `11px` (L17980)
- Icon emoji: `font-size:13px` — consistent
- Ticker: `11px` uppercase monospace — consistent
- `sirenClearBtn` dismiss: `font-size:11px` — consistent
- `#gam-sess-pill`: `font-size:11px` — consistent
- `#gam-dr-count`: `font-size:11px;font-weight:600` — consistent
- `select.gam-bar-icon`: `font-size:12px` — 1px bump for readability on the select. Acceptable.

### C.4 Spacing consistency

The Bloomberg CSS gap on `#gam-status-bar` is set by the base CSS at L17980 (`gap:6px`) and then the Iter 29 override at L19373 also sets `display:inline-flex` with no explicit gap override, so the 6px gap from the base rule applies. Separators (`gam-bar-sep`) add 1px with side margins of `var(--bb-s3)`. The visual result is consistent.

### C.5 Truncation on narrow viewports

The bar has `min-width: 720px` (L19379). On any viewport narrower than 720px the bar overflows its center-transform container. There is no `@media` query in the bar CSS to collapse or hide secondary buttons. The bar will overflow the viewport and create a horizontal scrollbar. GAW is not a mobile site so this may be acceptable, but tablet moderators (iPad) at 768px portrait would have 48px of bar overflow — enough to hide the right-side ticker completely.

### C.6 Status bar height vs content

Bar is `height:28px`, `bottom:14px` — total footprint is the area 14px–42px from viewport bottom. No `padding-bottom` is added to `document.body`. The last ~42px of feed content is permanently overlapped by the bar when the user scrolls to the absolute bottom of any list page. Posts near the bottom are partially obscured, though the bar's `backdrop-filter:blur(16px)` means the content is visible through the bar, just partially readable. Actionable buttons (vote, comment) within that 42px zone would be blocked by the bar's `::after` pseudo-elements on icons (inset -10px extends click area 10px below the bar edge). This is a scroll-padding/padding-bottom gap that affects UX proportionally to how often the mod reaches the bottom of long feeds.

### C.7 Click-outside-to-close on popovers

| Popover | Click-outside dismiss |
|---|---|
| Site health (`_showSiteHealthPopover`) | Yes — L16592–16597 |
| Modmail actions (`toggleModmailPopover`) | Yes — L17418–17423 |
| Modmail inbox (`_showModmailPopover`) | Yes — L16218–16221 |
| Active mods (`_showActiveModsPopover`) | Yes — L16494–16496 |
| C5 Command Center (`toggleC5Popover`) | Not confirmed in excerpt |

All confirmed popovers have `setTimeout` + `document.addEventListener('click', dismiss, true)` patterns. No Escape-key handler is wired to any popover — pressing Escape does not close them (only the sticky/tard accordions at L17123–17128 listen for Escape). This is a keyboard accessibility gap.

### C.8 Custom tooltip: no Escape-to-dismiss, no role=tooltip

The `gam-bar-custom-tip` div has no `role="tooltip"`, no `id` linked to the button via `aria-describedby`. Screen readers will not associate the tooltip with its trigger. The custom tip is purely visual. Low impact for a mod tool but worth noting for completeness.

---

## D. Proposed v10.7 Patches

### Patch 1 — Fix active-mods popover positioning (P0)
**File:** `modtools.js`, `_showActiveModsPopover` ~L16435
```js
// BEFORE:
pop.style.top  = (r.bottom + 6) + 'px';

// AFTER:
pop.style.bottom = (window.innerHeight - r.top + 6) + 'px';
pop.style.top = '';   // clear any stale top value
```

### Patch 2 — Fix `<select>` hit target (P0)
**File:** `modtools.js` + GAM_CSS
The `<select class="gam-bar-icon">` cannot use the `::after` hit-extension. Wrap it in a `<label>` or increase the select's own min-height:
```css
/* In GAM_CSS, after select.gam-bar-icon: */
select.gam-bar-icon { min-height: 32px !important; }
```
32px is the stated minimum from the brief; 36px would be safer.

### Patch 3 — Ticker hover-pause (P1)
**File:** `modtools.js` ~L16869
```js
// Replace the bare setInterval with a pause-on-hover version:
let __tickerPaused = false;
const __tickerRotate = setInterval(()=>{
  if (__tickerPaused) return;
  __tickerIdx = (__tickerIdx + 1) % Math.max(1, __tickerStates.length);
  __updateTicker();
}, 4000);
tickerEl.addEventListener('mouseenter', () => { __tickerPaused = true; });
tickerEl.addEventListener('mouseleave', () => { __tickerPaused = false; });
```

### Patch 4 — Add body padding-bottom to prevent content occlusion (P1)
**File:** `modtools.js`, `buildStatusBar()`, after `document.body.appendChild(bar)` at L17013
```js
// Ensure page content is not permanently occluded by the bar.
document.body.style.paddingBottom = Math.max(
  parseInt(getComputedStyle(document.body).paddingBottom, 10) || 0,
  56  // bar 28px + bottom 14px + 14px breathing room
) + 'px';
```

### Patch 5 — Presence ping visibility in site-health popover (P1)
**File:** `modtools.js`, `_showSiteHealthPopover()` ~L16535
```js
// Add after the firehose row:
const presenceOn = !!consentEnabled('features.presence');
// existing row() calls...
row('Presence pings', presenceOn ? 'ON (30s)' : 'OFF', presenceOn ? C.GREEN : C.TEXT3)
```

### Patch 6 — Escape key closes all popovers (P2)
**File:** `modtools.js`, `buildStatusBar()` — add after bar is appended (L17013)
```js
document.addEventListener('keydown', function __barEsc(e) {
  if (e.key !== 'Escape') return;
  ['gam-site-health-popover','gam-modmail-popover','gam-active-mods-popover','gam-mm-popover','gam-c5-popover'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
}, true);
```

### Patch 7 — Fix `transform:scale` conflict in Bloomberg hover (P2)
**File:** `modtools.js`, GAM_CSS Iter 4, after `#gam-status-bar .gam-bar-icon:hover`
```css
#gam-status-bar .gam-bar-icon:hover {
  /* existing rules... */
  transform: none !important;  /* Bloomberg flat aesthetic — no scale */
}
```

### Patch 8 — "site quiet" ticker contrast fix (P2)
**File:** `modtools.js`, `__updateTicker` ~L16850
```js
// BEFORE:
states.push({ msg: 'site quiet', color: 'var(--bb-ink-faint, #5a5752)', target: null });
// AFTER:
states.push({ msg: 'site quiet', color: 'var(--bb-ink-dim, #8a8680)', target: null });
```

---

## E. Status Bar Element Inventory

| # | Element | ID/Class | Purpose | Click target | Handler | Current state |
|---|---|---|---|---|---|---|
| 1 | Shield brand | `.gam-bar-brand.gam-bar-icon-brand` | Opens site-health popover; easter-egg on 7 clicks | 22px visual + 42px via ::after (Bloomberg Iter 4) | `_showSiteHealthPopover(brandBtn)` | Working. Tooltip: correct (v10.6.0 B.8 verified) |
| 2 | GEAR | `.gam-bar-icon` | Opens settings modal | 22px visual + 42px via ::after | `openSettings()` | Working. Tooltip: "Settings" |
| 3 | Separator | `.gam-bar-sep` | Visual divider | Not interactive | — | Working |
| 4 | Mod log / clipboard | `.gam-bar-icon` | Opens mod log + DR queue | 22px + 42px | `openModLog()` | Working. Tooltip: "Mod log + Death Row queue..." |
| 5 | Inbox / Modmail | `#gam-bar-inbox .gam-bar-icon` | Opens modmail popover; shows unread count badge | 22px + 42px | `_showModmailPopover(inboxBtn)` | Working. Badge + animation correct. Ambient prefetch lazy-starts on first click |
| 6 | Active mods | `#gam-bar-people .gam-bar-icon` | Shows online mods popover | 22px + 42px | `_showActiveModsPopover(peopleBtn)` | **BROKEN — popover opens below viewport (P0 A.1)** |
| 7 | Separator | `.gam-bar-sep` | Visual divider | Not interactive | — | Working |
| 8 | Help | `.gam-bar-icon` | Keybinds cheatsheet | 22px + 42px | `openHelp()` | Working |
| 9 | Debug snapshot | `.gam-bar-icon` | Downloads redacted JSON | 22px + 42px | `downloadDebugSnapshot()` | Working |
| 10 | Bug report | `.gam-bar-icon` | Files GitHub bug via worker | 22px + 42px | `openBugReportModal()` | Working |
| 11 | Clean UI broom | `#gam-clean-broom .gam-bar-icon` | Toggles share/hide/block visibility | 22px + 42px | `toggleCleanUi()` | Working. `.gam-on` class toggles visually |
| 12 | Lock (post pages only) | `#gam-lock-btn .gam-bar-icon` | Locks/unlocks current post | 22px + 42px | `togglePostLock()` | Conditional — only on `/p/<id>` |
| 13 | Separator | `.gam-bar-sep` | Visual divider | Not interactive | — | Working |
| 14 | Session dot | `#gam-sess-pill .gam-bar-icon` | Session health indicator; live CSRF+whoami check on click | 22px + 42px | inline async probe | Working. Color: grey/green/red per session state |
| 15 | Fallback toggle | `#gam-fb-toggle .gam-bar-icon` | Toggles ModTools interception vs GAW native UI | 22px + 42px | `setFallbackMode(!FallbackMode)` | Working. Icon: 🔒/🔓. Title updates with mode |
| 16 | Separator | `.gam-bar-sep` | Visual divider | Not interactive | — | Working |
| 17 | Upvote/age filter | `#gam-bar-filter select.gam-bar-icon` | Filters feed by upvote+age threshold | **22px (no ::after, no hit extension) — P0 A.2** | `applyUpvoteAgeFilter()` | Working functionally, undersized tap |
| 18 | DR counter | `#gam-dr-count .gam-bar-icon` | Shows Death Row count; hidden when 0 | 22px + 42px | `openModLog()` | Working. Hidden by default |
| 19 | Siren / Hot Now | `#gam-siren-count .gam-bar-icon` | Shows TARD+DR total; click opens Hot Now panel | auto-width + 42px via ::after | `_showHotNowPanel()` | Working. Gate: FEATURE_FLAGS.HOT_NOW_PANEL=true |
| 20 | Siren dismiss | `#gam-siren-clear .gam-bar-icon` | Dismisses siren until new activity | 22px + 42px | inline; persists to `siren.dismissedAtTotal` | Working. Shows only when sirenBtn visible |
| 21 | PIN chip | `#gam-sticky-chip .gam-bar-icon` | Shows sticky-pin request count; opens accordion | auto-width | opens `#gam-sticky-accordion` | Working. Polls every 60s |
| 22 | AI Tard patterns | `#gam-tard-suggest-btn .gam-bar-icon` | Opens AI tard-pattern accordion | 22px + 42px | opens `#gam-tard-accordion` | Working |
| 23 | Modmail actions (modmail pages only) | `#gam-mm-trigger .gam-bar-icon` | Quick modmail action popover on `/modmail/thread/` pages | 22px + 42px | `toggleModmailPopover(mmBtn)` | Conditional. Working on modmail pages |
| 24 | C5 Command Center (Commander only) | `#gam-c5-btn .gam-bar-icon` | Lead-mod dashboard (actions + online mods) | 22px + 42px | `toggleC5Popover(c5Btn)` | Conditional. Commander + lead only |
| 25 | Triage Console indicator (users page) | `.gam-bar-icon` (static span) | Passive indicator: triage console active | Not clickable — `cursor:default` | None | Conditional. Correct |
| 26 | Ban page indicator | `.gam-bar-icon` (static span) | Passive: /ban page enhancer active | Not clickable | None | Conditional. Correct |
| 27 | Spacer | `.gam-bar-spacer` | Flex spacer pushing right group to far right | Not interactive | — | Working |
| 28 | ModChat launcher | Created by `ModChat.createStatusBarButton()` | Opens/closes team chat panel | Per ModChat impl | ModChat.openPanel/closePanel | Working (assumed; ModChat.createStatusBarButton is out of scope) |
| 29 | Ticker | `#gam-bar-ticker .gam-bar-icon.gam-bar-ticker` | Status scroller — POSTS Q / MODMAIL / DR PENDING / SUS / site quiet | Full ticker width + 42px | navigates or opens ModChat | Working. **No hover-pause (P1 B.2)** |
| 30 | BRIG chip (v10.3 P6) | `#gam-brig-chip` (added post-bar via setTimeout) | Brigade alert count | auto-width | `_showHotNowPanel()` | Working. Hidden until alerts |
| 31 | Senior chip | Rendered by `renderSeniorChip()` | Indicates senior-mod queue items | Per renderSeniorChip impl | — | Working (assumed; out of scope) |

---

*End of UIUX-03 audit — 2 P0 bugs, 6 P1 friction points, 8 P2 polish items, 8 patches proposed.*
