# Panel Reorg 3 — Maintenance 4x4 Grid + Rich Tooltips

---

## A. ACTIONS SECTION REDESIGN

### Current state (broken)

Four `<a>` tags stacked in `.pop-actions` as `flex-direction: column`. Each is
100% wide. Each is mostly padding. A mod scanning for "queue" has to read every
emoji + label in sequence. No live data visible without clicking through.

### Target: 1-row × 4-column grid (grows to 2×4 if buttons are added)

```css
/* popup.css — replace the current .pop-actions block */
.pop-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 0 12px 8px;
}

.pop-btn {
  /* existing background / border / font rules stay unchanged */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 4px;
  min-height: 44px;          /* minimum tap target; no wasted space */
  text-align: center;
  font-size: 10px;
  line-height: 1.2;
  white-space: normal;       /* allow 2-line labels in tight columns */
}

/* Icon sits above abbreviated label — Bloomberg dense style */
.pop-btn .pop-btn-icon {
  font-size: 14px;
  line-height: 1;
}
.pop-btn .pop-btn-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bb-ink-dim);
}
/* Primary accent (Triage) keeps blue fill */
.pop-btn-primary .pop-btn-label { color: #fff; }
```

HTML replacement for `.pop-actions`:

```html
<div class="pop-actions" id="pop-actions">
  <a href="https://greatawakening.win/users" target="_blank"
     class="pop-btn pop-btn-primary"
     data-tip="TRIAGE CONSOLE | Pending accounts awaiting review. | Live count: {s-pending} new. | Click to open /users — full roster with status filters. | Last batch added: shown in drill drawer.">
    <span class="pop-btn-icon">&#x1F4CA;</span>
    <span class="pop-btn-label">Triage</span>
  </a>
  <a href="https://greatawakening.win/queue" target="_blank"
     class="pop-btn"
     data-tip="MODERATION QUEUE | Posts + comments flagged for review. | Waiting items: {s-dr} in Death Row queue. | Oldest item age shown when you open /queue. | Act here to prevent items expiring unreviewed.">
    <span class="pop-btn-icon">&#x1F4CB;</span>
    <span class="pop-btn-label">Queue</span>
  </a>
  <a href="https://greatawakening.win/ban" target="_blank"
     class="pop-btn"
     data-tip="BAN MANAGER | Currently banned: {s-banned} total. | Bans issued today: {s-today}. | Click to unban, extend, or audit ban reasons. | Death Row executions land here when triggered.">
    <span class="pop-btn-icon">&#x1F528;</span>
    <span class="pop-btn-label">Ban</span>
  </a>
  <a href="https://greatawakening.win" target="_blank"
     class="pop-btn"
     data-tip="GREAT AWAKENING | Open the forum home page. | Use to verify ambient status after a re-hydrate. | New tabs inherit your active session token. | Check the status bar — if it shows red, tokens need re-hydrate.">
    <span class="pop-btn-icon">&#x1F3E0;</span>
    <span class="pop-btn-label">GAW</span>
  </a>
</div>
```

**Anti-negative-space enforcement:** each cell is `min-height: 44px` and
`flex-direction: column` with icon + label. The icon anchors the visual center;
the label provides the semantic hook. At 44px × (popup-width / 4) ≈ 44×64px each
cell is dense but not cramped. No cell is "mostly padding."

---

## B. RICH-TOOLTIP COMPONENT

### Architecture

Re-use the existing `.gam-bar-custom-tip` delegated-tooltip pattern already
shipped in modtools.js (v9.8.0 / v9.24.0). The bar tooltip listens for
`mouseover` on the bar container and reads `data-tip-text` from the target. The
popup needs the same pattern scoped to `#pop-actions` and `.pop-maint`.

The popup runs in a sandboxed extension page, not the page world. The bar's
`__ensureTipEl` lives in the content-script. We do NOT inject that function into
the popup. Instead we write a self-contained `popupTip.js` (or inline block in
popup.js) that clones the same visual rules.

### Tooltip anatomy

```
+--------------------------------------------------+
| TRIAGE CONSOLE                                    |  <- title (600wt, uppercase, bb-accent)
+--------------------------------------------------+
| Pending accounts awaiting review.                 |  <- line 1
| Live count: 14 new.                               |  <- line 2 (live data injected)
| Click to open /users — full roster with filters.  |  <- line 3
| Last batch added: 3m ago.                         |  <- line 4 (optional)
+--------------------------------------------------+
```

- **Separator:** pipe `|` in `data-tip` attribute used as line delimiter.
  First segment is the title (rendered bold + accent color). Remaining
  segments are body lines (rendered at bb-t-xs / 11px, dimmed ink).
- **Live data tokens:** `{s-pending}`, `{s-banned}`, `{s-today}`, `{s-dr}`,
  `{s-msgs}`, `{s-notes}` — resolved from the same `loadStats()` values
  already written to DOM span text content. The tooltip builder reads
  `document.getElementById('s-pending').textContent` at show-time (not
  baked in at render) so data is always current.
- **Positioning:** renders ABOVE the button with 14px gap, left-aligned to
  button edge, clamped to popup width (360px max-width, same as bar tip).
- **Trigger:** `mouseover` delegated on `#pop-actions`, `#pop-tools`,
  `.pop-maint` parent containers. Hides on `mouseout` from the same
  containers. 200ms delay-before-show prevents flicker on rapid sweeps.

### popup.js tooltip wiring (inline block, ~50 lines)

```js
// --- Rich tooltip engine for popup buttons (v10.x) ---
(function initPopupTips() {
  const tip = document.createElement('div');
  tip.className = 'pop-rich-tip';
  document.body.appendChild(tip);

  const LIVE_TOKENS = {
    '{s-pending}': 's-pending',
    '{s-dr}':      's-dr',
    '{s-banned}':  's-banned',
    '{s-today}':   's-today',
    '{s-msgs}':    's-msgs',
    '{s-notes}':   's-notes',
  };

  function resolveTip(raw) {
    let s = raw;
    for (const [token, id] of Object.entries(LIVE_TOKENS)) {
      const el = document.getElementById(id);
      s = s.replaceAll(token, el ? el.textContent.trim() : '?');
    }
    return s;
  }

  function showTip(target, e) {
    const raw = target.dataset.tip;
    if (!raw) return;
    const parts = raw.split('|').map(p => p.trim());
    const title = parts[0];
    const lines = parts.slice(1);
    tip.innerHTML = '';
    const h = document.createElement('div');
    h.className = 'pop-rich-tip-title';
    h.textContent = resolveTip(title);
    tip.appendChild(h);
    for (const ln of lines) {
      const d = document.createElement('div');
      d.className = 'pop-rich-tip-line';
      d.textContent = resolveTip(ln);
      tip.appendChild(d);
    }
    const rect = target.getBoundingClientRect();
    tip.style.left = Math.min(rect.left, window.innerWidth - 370) + 'px';
    tip.style.top  = (rect.top - tip.offsetHeight - 14) + 'px';
    tip.classList.add('pop-tip-show');
  }

  function hideTip() { tip.classList.remove('pop-tip-show'); }

  let showTimer = null;
  document.body.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-tip]');
    if (!t) { clearTimeout(showTimer); hideTip(); return; }
    clearTimeout(showTimer);
    showTimer = setTimeout(() => showTip(t, e), 200);
  });
  document.body.addEventListener('mouseout', e => {
    if (!e.relatedTarget || !e.relatedTarget.closest('[data-tip]')) {
      clearTimeout(showTimer); hideTip();
    }
  });
})();
```

### CSS additions (popup.css)

```css
/* Rich popup tooltip — same visual as .gam-bar-custom-tip */
.pop-rich-tip {
  position: fixed;
  z-index: 99999;
  background: var(--bb-panel);
  border: 1px solid var(--bb-line-hot);
  color: var(--bb-ink);
  font: 400 11px/1.45 var(--bb-font);
  padding: 6px 10px;
  max-width: 340px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms ease-out;
  box-shadow: 0 2px 8px rgba(0,0,0,0.7);
  white-space: normal;
}
.pop-rich-tip.pop-tip-show { opacity: 1; }
.pop-rich-tip-title {
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4A9EFF;
  margin-bottom: 4px;
}
.pop-rich-tip-line {
  color: var(--bb-ink-dim);
  font-size: 11px;
  line-height: 1.4;
  padding-left: 0;
}
.pop-rich-tip-line + .pop-rich-tip-line { margin-top: 2px; }
```

---

## C. PER-BUTTON TOOLTIP CONTENT (anticipated)

Every `data-tip` value below. Pipe-delimited: first segment = title, rest = body
lines. Live tokens in `{braces}` are resolved at show-time from `loadStats()`.

### Actions row (4-column grid)

**Triage Console**
```
TRIAGE CONSOLE | Pending accounts awaiting review. | Live pending: {s-pending} new registrations. | Open /users to approve, watch, or flag each one. | Sorted newest-first; use status filter to isolate 'new'. | Counts update each time you open the popup.
```

**Queue**
```
MODERATION QUEUE | Posts and comments flagged for mod attention. | Death Row waiting: {s-dr} items. | Oldest items expire unreviewed if not actioned. | Click to work through the queue top-to-bottom. | Death Row executions appear here when timer fires.
```

**Ban**
```
BAN MANAGER | Total accounts currently banned: {s-banned}. | Bans issued in last 24h: {s-today}. | Unban, extend duration, or audit ban reasons here. | Death Row inmates appear on this page post-execution. | Use Crawl /users after mass-bans to sync roster.
```

**GAW (Forum Home)**
```
GREAT AWAKENING | Open greatawakening.win home page. | Use after Force Re-hydrate to confirm token is live. | New tab inherits current session — no re-login needed. | Status bar should show green lock if auth is healthy. | If bar shows red, run Token health probe before acting.
```

---

### Diagnostics row (Debug snapshot, Dashboard, Force re-hydrate)

Note: per the panel-reorg brief, "Force re-hydrate" stays; "Debug snapshot" and
"Dashboard" are candidates for removal or demotion. Tooltips are written here
regardless — if they ship, they get tips; if demoted to advanced, same tips apply.

**Debug snapshot**
```
DEBUG SNAPSHOT | Copies last 50 console events + DOM diagnostics to clipboard. | Use when reporting a bug — paste snapshot into chat immediately. | Redacted: tokens are masked before copy. | Output format: JSON array with timestamp, level, message, stack. | Does NOT reload page or affect session state.
```

**Dashboard**
```
MOD ACTIVITY DASHBOARD | Per-mod action totals for today and trailing 7 days. | Shows: bans, messages sent, notes added per mod. | Data source: gam_mod_log filtered to your session. | Use for team standups or to spot inactive accounts. | Opens as a drill-drawer panel inside this popup.
```

**Force re-hydrate**
```
FORCE RE-HYDRATE | Re-reads token vault from chrome.storage into Service Worker. | Run this after rotating your token via a recovery script. | Also fixes 'auth desynced' snack on GAW pages. | Result format: team=yes(48) means 48-char token cached in SW. | Safe to run anytime — read-only, no data written.
```

---

### Data harvest row (Crawl buttons)

**Crawl /users (10)**
```
CRAWL USERS — 10 PAGES | Walks /users pages 1-10 in your active GAW tab. | Ingests ~300 user records into roster (gam_users_roster). | Estimated time: ~30 seconds at normal throttle. | Run after a ban wave or when roster count looks stale. | Roster count shown in Triage Console tooltip above.
```

**Crawl /users (30)**
```
CRAWL USERS — 30 PAGES | Deep crawl: pages 1-30, ~900 user records. | Estimated time: ~90 seconds — tab must stay open. | Use for monthly full roster sync or after a site update. | Overwrites roster with fresh data — no data is lost. | Run Crawl /users (10) first to verify tab is active.
```

**Crawl /queue (5)**
```
CRAWL QUEUE — 5 PAGES | Walks /queue pages 1-5 in your active GAW tab. | Ingests flagged items into the local queue cache. | Estimated time: ~15 seconds. | Run before working the queue to ensure you see all items. | Queue depth shown in Queue button tooltip above.
```

---

### Maintenance section — top 4 (always visible)

**Clear stuck cookies + localStorage**
```
CLEAR STUCK COOKIES | Fixes 403 / CSRF errors on greatawakening.win. | Clears: XSRF, session, cf_* cookies + per-tab localStorage. | Does NOT affect your ModTools token (stored in extension storage). | Run this first when GAW actions return 403 or page acts strange. | Safe to run at any time — re-login may be required after.
```

**Token health probe**
```
TOKEN HEALTH PROBE | Pings worker /mod/whoami to verify your mod token. | Reports token age: green <60d / yellow 60-90d / red >90d. | Also confirms lead-mod status (lead=yes/no). | Run when actions fail silently or you see 401 errors in sniff log. | If red age shown, request token rotation from lead mod.
```

**AI: suggest tard / sus patterns**
```
AI PATTERN SUGGESTER | Llama scans last 80 usernames seen via firehose. | Proposes up to 6 username patterns worth flagging. | Detects: hate-speech archetypes, known troll handles, sus sequences. | Counts against daily AI budget (shared across team). | Review suggestions before adding — false positives possible.
```

**AI: scan modmail for sticky requests**
```
AI STICKY SCANNER | Scans last 7 days of modmail messages. | Looks for 'sticky pls', 'please sticky', variations. | Llama confirms intent — reduces false positives vs. keyword match. | Returns up to 10 threads with confidence score. | Click a result to open that modmail thread directly.
```

---

### Maintenance section — advanced accordion (6 items)

**Storage health probe**
```
STORAGE HEALTH PROBE | Reads chrome.storage.local usage + top-5 largest keys. | Shows total bytes used vs. 10MB extension quota. | Trim button: evicts oldest 50% of intel cache + caps diag log. | Run if popup feels sluggish or crawls fail silently. | Safe: trim only removes cache, never roster or settings.
```

**Selector drift report**
```
SELECTOR DRIFT REPORT | Lists CSS selector promotions in gam_learned_selectors. | Signals when GAW changed their DOM layout (e.g. post redesign). | High drift count = ambient crawlers may be missing elements. | Review and run a full Crawl /users (30) if drift is high. | Read-only — no changes made to selectors by this probe.
```

**Diag log status + purge**
```
DIAG LOG STATUS | Shows count of entries in gam_diag_log. | Export button: copies redacted JSON to clipboard. | Purge button: removes oldest 50% of entries to free space. | Use Export when reporting a bug to share full diagnostic context. | Purge if Storage probe shows log as a top-5 large key.
```

**Schema migration check**
```
SCHEMA MIGRATION CHECK | Compares stored schema_version to current code constant. | If mismatch: runs additive migration with safe defaults. | Non-destructive — existing settings and tokens are preserved. | Run after an extension update if you see unexpected behavior. | Shows version before/after so you know what changed.
```

**Backfill modmail history**
```
BACKFILL MODMAIL | Walks /modmail pages 1-10 in your active GAW tab. | Ingests historical threads + messages into inbox-intel pipeline. | Estimated time: ~15 seconds (1.5s/page throttle). | Run ONCE to seed historical data — ambient ingest takes over after. | Do not run repeatedly; duplicates are filtered but it wastes time.
```

**Reset settings to defaults**
```
RESET SETTINGS — DESTRUCTIVE | Wipes gam_settings feature flags to factory defaults. | Preserves your mod token — you will NOT be logged out. | Triple-confirmation dialog shown before any data is erased. | Use ONLY when 'everything seems weird' and other probes show nothing. | After reset: re-configure notification prefs and AI budget in Settings.
```

---

## D. POPULATING LIVE DATA

| Tooltip token | Source key | Computed in | Notes |
|---|---|---|---|
| `{s-pending}` | `gam_users_roster` | `loadStats()` → `pending` var | Count of entries where `status === 'new'` or `'pending'` |
| `{s-dr}` | `gam_deathrow` | `loadStats()` → `drPending` var | Count of DR entries where `status === 'waiting'` |
| `{s-banned}` | `gam_users_roster` | `loadStats()` → `banned` var | Count of entries where `status === 'banned'` |
| `{s-today}` | `gam_mod_log` | `loadStats()` → `todayBans` var | Log entries with `type === 'ban'` in last 24h |
| `{s-msgs}` | `gam_mod_log` | `loadStats()` → `todayMsgs` var | Log entries with `type === 'message'\|'reply'` in last 24h |
| `{s-notes}` | `gam_mod_log` | `loadStats()` → `todayNotes` var | Log entries with `type === 'note'` in last 24h |

All six values are already computed by `loadStats()` and written to `<span id="s-*">` DOM nodes.
The tooltip resolver reads those spans at show-time — no additional storage calls.
Zero latency, always in sync with the header stats displayed at popup-open.

For queue age (oldest item) and roster last-crawl timestamp: not currently in
`loadStats()`. Add to a follow-up `loadStats()` extension:

```js
// In loadStats(), add after existing filters:
const oldestDR = dr.reduce((min, d) => Math.min(min, d.addedAt || Infinity), Infinity);
const drAgeMin = oldestDR === Infinity ? null : Math.round((now - oldestDR) / 60000);
// Write to a hidden span for tooltip resolution:
const drAgeEl = document.getElementById('s-dr-age');
if (drAgeEl) drAgeEl.textContent = drAgeMin !== null ? drAgeMin + 'm' : '--';
```

Then use `{s-dr-age}` in the Queue tooltip: "Oldest item: {s-dr-age} ago."

---

## E. ANTI-NEGATIVE-SPACE RULES

A button has too much negative space when: padding area exceeds 40% of total
cell area, OR the label occupies fewer than 2 lines of a cell taller than 36px,
OR the cell width forces text onto 1 line at < 50% of the available width.

**Detection heuristic (automated):**

```js
// Run in popup DevTools to audit all .pop-btn cells
document.querySelectorAll('.pop-btn').forEach(btn => {
  const r = btn.getBoundingClientRect();
  const style = getComputedStyle(btn);
  const pxPad = (parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)) * 2
               + (parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)) * 2;
  const area = r.width * r.height;
  const density = 1 - (pxPad / area);
  console.log(btn.textContent.trim().slice(0,20), '->', Math.round(density * 100) + '%',
    density < 0.6 ? '!!! SPARSE' : 'OK');
});
```

**Fixes:**

| Symptom | Fix |
|---|---|
| Single-line label in wide cell | Add icon row above label; add live count below label |
| Full-width stacked button | Switch parent to `display:grid; grid-template-columns: repeat(4,1fr)` |
| Ghost button with no visual weight | Add `border-left: 2px solid var(--bb-line-hot)` accent |
| Label text < 10 chars, cell > 60px wide | Add a secondary line (count or status abbreviation) |
| Emoji + label fits in 1 line | Split into icon span + label span, flex-column layout |

**The rule in one sentence:** every button cell should have meaningful content
filling at least 60% of its area — icon, label, and optionally a live count
badge. If it doesn't, something is missing.

---

## F. SHIP-TONIGHT PATCH

Minimal diff to ship the grid + tooltips without touching handler logic:

1. **popup.css** — replace `.pop-actions` block with grid version (Section A).
   Add `.pop-btn` flex-column overrides. Add `.pop-rich-tip` + `.pop-rich-tip-title`
   + `.pop-rich-tip-line` classes (Section B CSS).

2. **popup.html** — replace the four `<a>` tags in `.pop-actions` with the new
   `data-tip` versions that include icon `<span>` + label `<span>` (Section A HTML).
   Add `data-tip` attributes to all existing `<button>` elements in `.pop-tools`
   and `.pop-maint` rows using the exact strings from Section C.

3. **popup.js** — append the `initPopupTips()` IIFE (Section B JS) at the end of
   the file, after `loadStats()` is already defined. No changes to existing handlers.

4. **Verify:** open popup, hover each button for 200ms, confirm tooltip appears
   above button, live counts resolve to actual numbers (not `?`), tooltip hides
   on mouse-out. Check in popup DevTools: no JS errors, no layout overflow.

No changes to modtools.js, background.js, or manifest.json required.

---

## G. STRETCH

**Animated count delta:** when `loadStats()` runs and a count changes from the
previous value, animate the affected tooltip token with a brief yellow flash
(CSS `animation: tip-delta-flash 0.4s ease-out`). Requires storing previous
count values in a module-level object in popup.js.

**Sparkline in tooltip (Queue / Ban):** a 7-day ban-rate sparkline rendered as
inline SVG inside the tooltip. Data from `K.LOG` filtered by day bucket. ~30
lines of SVG path math. Fires only when the tooltip is for Queue or Ban buttons.
Adds ~200ms to first show (SVG generation) — acceptable given 200ms delay-before-show.

**Keyboard nav:** `Tab` into a `.pop-btn`, show tip on `focus`, hide on `blur`.
Requires `tabindex="0"` on `<a>` tags (already implicit) and adding `focus` /
`blur` listeners alongside `mouseover` / `mouseout` in `initPopupTips()`. Single
`addEventListenerOptions: {passive: true}` call handles both.

**Color-coded count badges:** render `{s-pending}` as a colored inline badge
inside the tooltip — green if 0, yellow if 1-9, red if 10+. Same logic as the
header stat pills. 5 lines of CSS, 3 lines of JS in `resolveTip()`.
