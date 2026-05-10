# UIUX-12 — Site Health Popover Redesign

**Component:** `_showSiteHealthPopover` (modtools.js ~L17616)
**Trigger:** Shield brand button click in status bar
**Data sources:** localStorage log, `rpcCall('modWhoami')`, `rpcCall('modStats')`
**Version baseline:** v10.6.0 B.7

---

## A. Critique — Current State

### What it is

A fixed-position popover that fires on shield-click. Two async phases:
1. **Immediate render** — pulls from localStorage (`lsGet(K.LOG)`) for 24h action counts (bans, DR adds, approves, removes), plus local state for DR queue depth, watchlist count, SUS count, AI scan/feature state.
2. **Async patch** — `rpcCall('modWhoami')` fills the Worker row; `rpcCall('modStats')` fills a second block (actions_24h, queue_depth, firehose_active, last_verify_ts, recent_actions[5]).

### Structural problems

**1. Two-phase layout shift is jarring and unpredictable.**
The popover renders at one height, then the `#gam-sh-worker-stats` div appears (`display:none` → visible) after the modStats promise resolves. No skeleton, no transition — the box just jumps taller. If both RPCs land at different times you get two jumps.

**2. Duplicate signals without clear hierarchy.**
`firehose` appears twice — once from local `getSetting('firehose.active')`, once from `d.firehose_active` in the worker stats block — with no explanation of why they might differ. A mod reading both values with no context will be confused.
Same issue for actions: local log gives bans/DR/approves/removes separately; modStats gives a single `actions_24h` (D1). Two action counts, different sources, no reconciliation.

**3. No visual grouping. Everything is the same row.**
11+ rows all rendered identically with the same `gam-sh-row` pattern. Key operational signals (worker reachability, firehose state) are visually indistinguishable from secondary metadata (watchlist count, AI scan date). The eye has nowhere to land first.

**4. Recent actions feed is too sparse and too small.**
5 actions, 10px font, showing only type + user and a locale time string. The type string is raw (`ban`, `deathrow`, `approve`) — no badge, no color. The executor name is absent unless the action has `a.user`; otherwise it shows just `?`. At 10px in `C.TEXT3` colour this section is nearly invisible.

**5. Emoji-heavy header reads as casual, not operational.**
`🛡 Site Health` with a version string crammed flush-right. For a tool used under time pressure this reads like a widget, not a command dashboard.

**6. No KPI tiles. No spatial hierarchy.**
The 4 most actionable metrics — 24h action count, queue depth, firehose status, verify age — are buried in a flat list. There is no "at-a-glance" layer. A mod must read every row to understand site state.

**7. Width is fixed 340–420px with no pinning logic.**
Anchored to `anchor.getBoundingClientRect().left`, which can push the popover off-screen on narrow viewports. No max-height guard on the popover body means a long recent_actions list (if that cap ever increases) overflows.

**8. Styling is inline `style=` strings on every element.**
The color logic (`C.WARN`, `C.GREEN`, `C.TEXT`) is correct but baking it into `escapeHtml`-adjacent string concatenation means future changes require touching the render logic, not a style block. It also defeats any CSP that restricts inline styles.

### What works

- Toggle-to-dismiss (click-outside + re-click on shield) is correct.
- Color thresholds (green/warn/red on queue depth, verify age) are sensible.
- Async best-effort on modStats with silent catch is the right pattern — local data always renders.
- ESC key dismiss wired correctly via `pop._escHandler`.

---

## B. Redesign

### Concept: Bloomberg Terminal Dense Dashboard

**Aesthetic direction:** Bloomberg terminal. Charcoal-black field. Amber/green monochrome accent rail. Tabular numerics in a tight monospaced face. Data density without clutter — every pixel earns its place. No gradients, no rounded-corner softness on the data cells. Sharp ruled lines. Status signals rendered as hardware-style LEDs (solid colored squares/dots), not text.

**Retained constraints:**
- Same anchor + positioning logic (above the shield, fixed position)
- Same two-phase async (local-first, RPC-patch)
- Same dismiss semantics (click-outside, re-click, ESC)
- Same color palette roots (`C.*` tokens) — extend, not replace
- No new RPC calls; existing `modWhoami` + `modStats` only

### Layout architecture

```
┌─────────────────────────────────────────────────────┐  ← 380px wide
│ SITE HEALTH          [FH ■ LIVE]   [■ WORKER OK]    │  ← header rail
├──────────┬──────────┬──────────┬───────────────────-┤
│ ACTIONS  │  QUEUE   │ FIREHOSE │   VERIFY AGE       │  ← KPI tile row
│  147     │   8      │  LIVE    │    4m ago           │
│  24h     │  depth   │          │                     │
├──────────┴──────────┴──────────┴────────────────────┤
│ ACTIVITY FEED                                        │  ← ticker section
│ 14:22:01  BAN      → u/ToxicUser99        [mod1]    │
│ 14:19:44  APPROVE  → u/GoodPoster         [mod2]    │
│ 14:17:03  DR ADD   → u/SuspectAccount     [mod1]    │
│ 14:14:55  REMOVE   → post/abc123          [mod3]    │
│ 14:11:22  BAN      → u/Spammer77         [mod1]    │
│ 14:08:09  DR ADD   → u/Troll456           [mod2]    │
│ 14:05:44  APPROVE  → u/LegitUser          [mod3]    │
│ 14:02:11  REMOVE   → post/xyz789          [mod1]    │
│ 13:59:38  BAN      → u/BadActor           [mod2]    │
│ 13:57:22  APPROVE  → u/Verified9          [mod1]    │
├─────────────────────────────────────────────────────┤
│ v10.6.0 B.7          14:22:09    [click to dismiss] │  ← footer
└─────────────────────────────────────────────────────┘
```

### Section-by-section spec

#### Header rail
- Left: `SITE HEALTH` in `letter-spacing: 0.12em`, `font-weight: 700`, `font-size: 11px`, uppercase, `C.TEXT` (`#e8eaed`). Monospaced face (`ui-monospace, Consolas`).
- Right cluster, two pill-badges side by side:
  - **Firehose pill**: LED square `■` in `C.GREEN` (`#3dd68c`) + `LIVE` label when active; `■` in `C.TEXT3` + `STANDBY` when inactive. Changes to amber `C.WARN` + `ARMED` when `d.firehose_active` disagrees with local `getSetting`.
  - **Worker pill**: LED square `■` in `C.GREEN` + `WORKER OK` after modWhoami resolves ok; `■` in amber + `PROBING` during flight; `■` in `C.RED` + `WORKER FAIL` on error.
- Separator line below: `1px solid #2a2f38` (C.BORDER), full width.
- Eliminates duplicate firehose row from flat list — single source of truth moved to header.

#### KPI tile row — 4 tiles, equal width, flush border between

Each tile:
```
┌──────────┐
│   147    │  ← value: Bebas Neue or tabular mono, 28px, C.TEXT or threshold color
│  24h ACT │  ← label: 9px, C.TEXT3, uppercase, letter-spacing 0.1em
│  ───────  │  ← threshold bar: thin 2px strip at bottom of tile, green/amber/red
└──────────┘
```

**Tile 1 — 24h Actions (D1)**
- Source: `d.actions_24h` from modStats. Fallback: sum of local bans24+dr24+approves24+removes24 while RPC in flight.
- Color: green `< 50`, amber `50–100`, red `> 100`.
- Label: `24H ACT`

**Tile 2 — Queue Depth**
- Source: `d.queue_depth` from modStats. Fallback: local `drQueue`.
- Color: green `< 20`, amber `20–50`, red `> 50`.
- Label: `QUEUE`

**Tile 3 — Firehose**
- Source: unified (local `fhActive` always; if `d.firehose_active` differs, show amber with `⚠` prefix).
- Display: not a number — LED block. Large `LIVE` in `C.GREEN` or `OFF` in `C.TEXT3`.
- Font size: 22px. Label: `FIREHOSE`

**Tile 4 — Verify Age**
- Source: `d.last_verify_ts` → compute minutes since. While loading: `—`.
- Color: green `< 10m`, amber `10–30m`, red `> 30m`.
- Display: `4m` (omit "ago" — space is tight). Label: `LAST VERIFY`

Tile borders: `1px solid C.BORDER` between tiles, `border-radius: 0` on all — sharp-cornered grid, no softness.

No layout shift: tiles render immediately with fallback/local values and update in place (textContent swap) when modStats resolves. No visibility toggle needed.

#### Activity feed — last 10 actions (not 5)

Increase from 5 to 10 rows. Data source: `d.recent_actions` sliced to 10. Each row:

```
14:22:01  BAN      → u/ToxicUser99         [mod1]
```

Column widths (fixed, tabular):
- **Timestamp**: `HH:MM:SS`, 55px, `C.TEXT3`, monospaced 10px
- **Type badge**: 7-char fixed width, uppercase, colored background pill (see below), 10px bold
- **Arrow + target**: flex-fill, `C.TEXT2`, 11px, truncated with ellipsis at ~200px
- **Executor**: `[username]`, flush right, `C.TEXT3`, 10px, truncated at 60px

Type badge colors (background pill on dark field):
| Type | Background | Text |
|---|---|---|
| `ban` | `rgba(240,64,64,.18)` | `#f04040` |
| `deathrow` | `rgba(167,139,250,.15)` | `#a78bfa` |
| `approve` | `rgba(61,214,140,.15)` | `#3dd68c` |
| `remove` | `rgba(240,160,64,.15)` | `#f0a040` |
| other | `rgba(139,146,158,.12)` | `#8b929e` |

Executor column: sourced from `a.executor || a.mod || a.by || null`. If null, omit the bracket entirely rather than show `[?]`.

Feed section: `max-height: 200px; overflow-y: auto` with custom scrollbar (`2px wide, C.BORDER2 track, C.ACCENT thumb`). This bounds popover height regardless of how many actions are returned.

Feed header: `ACTIVITY FEED` label in `9px`, uppercase, `C.TEXT3`, `letter-spacing: 0.12em`, with a thin `1px solid C.BORDER` above. Right-side: `LAST 10` in same style.

Skeleton state: While modStats is in flight, render 10 placeholder rows as animated shimmer bars (`background: linear-gradient(90deg, #2a2f38 25%, #3a3f48 50%, #2a2f38 75%); background-size: 200% 100%; animation: gam-shimmer 1.2s infinite`). No "probing..." text.

#### Footer
Single row, 3 elements: `version string` left | `HH:MM:SS` timestamp center | `ESC or click outside` right. All `9px`, `C.TEXT3`, no border — just `padding-top: 6px; border-top: 1px solid C.BORDER` above.

### Animation
- **Entry**: popover scales from `scale(0.96) translateY(6px)` to identity + opacity 0→1. Duration `140ms`, `ease-out`. CSS only — a single `@keyframes gam-sh-in`.
- **KPI value update**: when modStats resolves and a tile value changes, flash the number `color → C.ACCENT → original-threshold-color` over `300ms`. Pure CSS transition via class swap.
- **Feed shimmer → real rows**: fade-in on the populated rows `opacity: 0 → 1`, `transition: 200ms`, staggered via `animation-delay: calc(var(--i) * 30ms)` on each `li`. `--i` set as inline style property in JS.
- No layout jump. The popover renders at full target height (KPI tiles + feed max-height) immediately, shimmers fill the feed area, values swap in-place.

### Popover sizing and positioning
- **Width**: `380px` fixed. No min/max dance.
- **Height**: KPI tiles ~72px + feed max 200px + header 32px + footer 28px = ~332px max. Constant regardless of data volume.
- **Positioning**: existing `r.left` / `window.innerHeight - r.top + 8` logic retained. Add clamp: `left = Math.max(8, Math.min(r.left, window.innerWidth - 396))` to prevent right-side overflow.
- **Scrollable feed** absorbs variable action counts without reflowing the popover shell.

### CSS injection approach
All new rules go into the existing `buildCSS()` / template literal block (L~19287). New class prefix: `gam-sh2-*` (avoids collision with existing `gam-sh-*` used by the current implementation during any overlap period). The old rules stay until the old function is fully replaced.

---

## C. Visual Mockup

```
┌─────────────────────────────────────────────────────────────┐
│ SITE HEALTH                    [■ LIVE]  [■ WORKER OK]      │
├──────────────┬──────────────┬──────────────┬────────────────┤
│     147      │      8       │     LIVE     │      4m        │
│   24H ACT    │    QUEUE     │   FIREHOSE   │  LAST VERIFY   │
│ ▬▬▬▬▬▬▬▬▬▬  │ ▬▬▬▬▬▬▬▬▬▬  │ ▬▬▬▬▬▬▬▬▬▬  │ ▬▬▬▬▬▬▬▬▬▬    │
│  [GREEN]     │  [GREEN]     │  [GREEN]     │  [GREEN]       │
├──────────────┴──────────────┴──────────────┴────────────────┤
│ ACTIVITY FEED                                    LAST 10    │
│ ─────────────────────────────────────────────────────────── │
│ 14:22:01  [  BAN  ]  → u/ToxicUser99              [mod1]   │
│ 14:19:44  [APPROVE]  → u/GoodPoster                [mod2]  │
│ 14:17:03  [ DR ADD]  → u/SuspectAccount            [mod1]  │
│ 14:14:55  [ REMOVE]  → post/abc123def456           [mod3]  │
│ 14:11:22  [  BAN  ]  → u/Spammer77                [mod1]   │
│ 14:08:09  [ DR ADD]  → u/Troll456                  [mod2]  │
│ 14:05:44  [APPROVE]  → u/LegitUser                 [mod3]  │
│ 14:02:11  [ REMOVE]  → post/xyz789abc              [mod1]  │
│ 13:59:38  [  BAN  ]  → u/BadActor88               [mod2]   │
│ 13:57:22  [APPROVE]  → u/Verified9                 [mod1]  │
├─────────────────────────────────────────────────────────────┤
│ v10.6.0 B.7              14:22:09         ESC or click out  │
└─────────────────────────────────────────────────────────────┘

COLOR KEY (on #0f1114 background)
─────────────────────────────────────────────────────────────
Header LED ■ LIVE:     #3dd68c (C.GREEN)   solid square 8×8px
Header LED ■ PROBING:  #f0a040 (C.WARN)   blinking 0.8s
Header LED ■ FAIL:     #f04040 (C.RED)

KPI value (green):     #3dd68c   28px  ui-monospace / Consolas
KPI value (amber):     #f0a040   28px
KPI value (red):       #f04040   28px
KPI label:             #5c6370   9px  uppercase  ls:0.12em
KPI threshold bar:     2px bottom strip matching value color

Type badge [BAN]:      bg rgba(240,64,64,.18)   text #f04040
Type badge [APPROVE]:  bg rgba(61,214,140,.15)  text #3dd68c
Type badge [DR ADD]:   bg rgba(167,139,250,.15) text #a78bfa
Type badge [REMOVE]:   bg rgba(240,160,64,.15)  text #f0a040

Feed timestamp:        #5c6370 (C.TEXT3)  10px mono
Feed target:           #8b929e (C.TEXT2)  11px
Feed executor:         #5c6370 (C.TEXT3)  10px

Entry animation:       scale(0.96)→1 + opacity 0→1  140ms ease-out
Shimmer:               linear-gradient sweep  1.2s infinite
```

### Rendered HTML skeleton (reference for implementer)

```html
<!-- Injected as pop.innerHTML — no framework, pure DOM like current impl -->

<div class="gam-sh2-header">
  <span class="gam-sh2-title">SITE HEALTH</span>
  <div class="gam-sh2-pills">
    <span class="gam-sh2-pill gam-sh2-pill--fh" id="gam-sh2-fh-pill">
      <span class="gam-sh2-led"></span>
      <span class="gam-sh2-pill-label">PROBING</span>
    </span>
    <span class="gam-sh2-pill gam-sh2-pill--worker" id="gam-sh2-worker-pill">
      <span class="gam-sh2-led"></span>
      <span class="gam-sh2-pill-label">PROBING</span>
    </span>
  </div>
</div>

<div class="gam-sh2-kpi-row">
  <div class="gam-sh2-tile" id="gam-sh2-tile-actions">
    <div class="gam-sh2-tile-val" id="gam-sh2-val-actions">—</div>
    <div class="gam-sh2-tile-lbl">24H ACT</div>
    <div class="gam-sh2-tile-bar" id="gam-sh2-bar-actions"></div>
  </div>
  <div class="gam-sh2-tile" id="gam-sh2-tile-queue">
    <div class="gam-sh2-tile-val" id="gam-sh2-val-queue">—</div>
    <div class="gam-sh2-tile-lbl">QUEUE</div>
    <div class="gam-sh2-tile-bar" id="gam-sh2-bar-queue"></div>
  </div>
  <div class="gam-sh2-tile" id="gam-sh2-tile-fh">
    <div class="gam-sh2-tile-val gam-sh2-tile-val--text" id="gam-sh2-val-fh">—</div>
    <div class="gam-sh2-tile-lbl">FIREHOSE</div>
    <div class="gam-sh2-tile-bar" id="gam-sh2-bar-fh"></div>
  </div>
  <div class="gam-sh2-tile" id="gam-sh2-tile-verify">
    <div class="gam-sh2-tile-val" id="gam-sh2-val-verify">—</div>
    <div class="gam-sh2-tile-lbl">LAST VERIFY</div>
    <div class="gam-sh2-tile-bar" id="gam-sh2-bar-verify"></div>
  </div>
</div>

<div class="gam-sh2-feed-header">
  <span>ACTIVITY FEED</span>
  <span>LAST 10</span>
</div>
<ul class="gam-sh2-feed" id="gam-sh2-feed">
  <!-- 10x shimmer placeholders rendered immediately -->
  <li class="gam-sh2-feed-shimmer" style="--i:0"></li>
  <!-- ... × 10 -->
</ul>

<div class="gam-sh2-footer">
  <span id="gam-sh2-ver">v10.6.0</span>
  <span id="gam-sh2-ts">14:22:09</span>
  <span>ESC or click outside</span>
</div>
```

### CSS snapshot (critical rules)

```css
/* Entry animation */
@keyframes gam-sh2-in {
  from { opacity:0; transform:scale(0.96) translateY(6px); }
  to   { opacity:1; transform:scale(1)    translateY(0);   }
}
@keyframes gam-sh2-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes gam-sh2-blink {
  0%,100% { opacity:1; } 50% { opacity:.3; }
}

#gam-sh2-pop {
  position: fixed;
  width: 380px;
  background: #0f1114;
  border: 1px solid #3a3f48;
  border-radius: 6px;
  box-shadow: 0 16px 48px rgba(0,0,0,.75), 0 0 0 1px rgba(74,158,255,.08);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11px;
  color: #8b929e;
  z-index: 9999985;
  animation: gam-sh2-in 140ms ease-out forwards;
  overflow: hidden;
}

/* Header */
.gam-sh2-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid #2a2f38;
}
.gam-sh2-title {
  font-size: 11px; font-weight: 700; color: #e8eaed;
  letter-spacing: 0.12em;
}
.gam-sh2-pills { display: flex; gap: 6px; }
.gam-sh2-pill {
  display: flex; align-items: center; gap: 4px;
  padding: 2px 7px; border-radius: 3px;
  border: 1px solid #2a2f38;
  font-size: 9px; letter-spacing: 0.1em; font-weight: 700;
}
.gam-sh2-led {
  width: 7px; height: 7px; border-radius: 1px; flex-shrink: 0;
}
.gam-sh2-pill--ok   .gam-sh2-led { background: #3dd68c; }
.gam-sh2-pill--warn .gam-sh2-led { background: #f0a040;
  animation: gam-sh2-blink 0.8s infinite; }
.gam-sh2-pill--err  .gam-sh2-led { background: #f04040; }

/* KPI tiles */
.gam-sh2-kpi-row {
  display: grid; grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid #2a2f38;
}
.gam-sh2-tile {
  padding: 10px 0 0;
  border-right: 1px solid #2a2f38;
  text-align: center;
  position: relative;
}
.gam-sh2-tile:last-child { border-right: none; }
.gam-sh2-tile-val {
  font-size: 28px; font-weight: 700; line-height: 1;
  letter-spacing: -0.02em;
  color: #3dd68c; /* default green; overridden by data state */
  transition: color 300ms;
}
.gam-sh2-tile-val--text { font-size: 20px; } /* LIVE / OFF */
.gam-sh2-tile-lbl {
  font-size: 9px; color: #5c6370; letter-spacing: 0.1em;
  margin-top: 4px; padding-bottom: 10px;
}
.gam-sh2-tile-bar {
  height: 2px; width: 100%;
  background: #3dd68c; /* overridden by state */
  transition: background 300ms;
}

/* Activity feed */
.gam-sh2-feed-header {
  display: flex; justify-content: space-between;
  padding: 6px 12px 4px;
  font-size: 9px; color: #5c6370; letter-spacing: 0.12em;
  border-bottom: 1px solid #2a2f38;
}
.gam-sh2-feed {
  list-style: none; margin: 0; padding: 0;
  max-height: 200px; overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #4A9EFF #2a2f38;
}
.gam-sh2-feed-row {
  display: grid;
  grid-template-columns: 58px 62px 1fr 64px;
  align-items: center;
  gap: 0 6px;
  padding: 4px 12px;
  border-bottom: 1px solid #1e2228;
  animation: gam-sh2-fade-in 200ms ease-out both;
  animation-delay: calc(var(--i, 0) * 30ms);
}
@keyframes gam-sh2-fade-in {
  from { opacity:0; } to { opacity:1; }
}
.gam-sh2-feed-ts   { color: #5c6370; font-size: 10px; }
.gam-sh2-feed-type {
  font-size: 9px; font-weight: 700; letter-spacing: 0.05em;
  text-align: center; padding: 2px 4px; border-radius: 2px;
  white-space: nowrap;
}
.gam-sh2-feed-target {
  color: #8b929e; font-size: 10px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.gam-sh2-feed-exec {
  color: #5c6370; font-size: 10px; text-align: right;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Shimmer placeholder rows */
.gam-sh2-feed-shimmer {
  height: 28px; padding: 4px 12px;
  background: linear-gradient(
    90deg, #1e2228 25%, #2a2f38 50%, #1e2228 75%
  );
  background-size: 200% 100%;
  animation: gam-sh2-shimmer 1.2s infinite linear;
  animation-delay: calc(var(--i, 0) * 80ms);
  border-bottom: 1px solid #1e2228;
}

/* Footer */
.gam-sh2-footer {
  display: flex; justify-content: space-between;
  padding: 6px 12px;
  font-size: 9px; color: #5c6370;
  border-top: 1px solid #2a2f38;
}
```

### JavaScript update logic (key patterns, not full implementation)

```js
// Immediate render with local fallbacks — no layout shift
function _renderKpiLocal(pop, { drQueue, bans24, dr24, approves24, removes24, fhActive }) {
  const localTotal = bans24 + dr24 + approves24 + removes24;
  _setTile(pop, 'actions', localTotal, [50, 100]);
  _setTile(pop, 'queue',   drQueue,    [20, 50]);
  _setFhTile(pop, fhActive);
  // verify: unknown until modStats → leave as '—' with neutral bar
}

// modStats patch — swap values in-place, no DOM restructure
rpcCall('modStats', {}).then(function(sr) {
  if (!sr || !sr.ok || !sr.data) return;
  const d = sr.data;
  if (d.actions_24h != null) _setTile(pop, 'actions', d.actions_24h, [50, 100]);
  if (d.queue_depth  != null) _setTile(pop, 'queue',  d.queue_depth,  [20, 50]);
  if (d.firehose_active != null) _setFhTile(pop, d.firehose_active);
  if (d.last_verify_ts) {
    const mins = Math.round((Date.now() - d.last_verify_ts) / 60000);
    _setTile(pop, 'verify', mins + 'm', [10, 30]);
  }
  if (Array.isArray(d.recent_actions)) _renderFeed(pop, d.recent_actions.slice(0, 10));
}).catch(function(){});

// Helper: set tile value + threshold color + bar
function _setTile(pop, id, value, [warn, danger]) {
  const valEl = pop.querySelector('#gam-sh2-val-' + id);
  const barEl = pop.querySelector('#gam-sh2-bar-' + id);
  if (!valEl || !barEl) return;
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  const color = (isNaN(n) || n < warn) ? '#3dd68c' : n < danger ? '#f0a040' : '#f04040';
  valEl.textContent = String(value);
  valEl.style.color = color;
  barEl.style.background = color;
}

// Feed render — replaces shimmer rows
const TYPE_COLORS = {
  ban:       { bg:'rgba(240,64,64,.18)',    fg:'#f04040', label:'BAN' },
  deathrow:  { bg:'rgba(167,139,250,.15)',  fg:'#a78bfa', label:'DR ADD' },
  approve:   { bg:'rgba(61,214,140,.15)',   fg:'#3dd68c', label:'APPROVE' },
  remove:    { bg:'rgba(240,160,64,.15)',   fg:'#f0a040', label:'REMOVE' },
};
function _renderFeed(pop, actions) {
  const feed = pop.querySelector('#gam-sh2-feed');
  if (!feed) return;
  feed.innerHTML = '';
  actions.forEach(function(a, i) {
    const tc = TYPE_COLORS[a.type] || { bg:'rgba(139,146,158,.12)', fg:'#8b929e', label: (a.type||'?').toUpperCase().slice(0,7) };
    const ts = a.ts ? new Date(a.ts).toLocaleTimeString('en-GB', { hour12:false }) : '—';
    const exec = a.executor || a.mod || a.by || '';
    const li = document.createElement('li');
    li.className = 'gam-sh2-feed-row';
    li.style.setProperty('--i', i);
    li.innerHTML =
      `<span class="gam-sh2-feed-ts">${escapeHtml(ts)}</span>` +
      `<span class="gam-sh2-feed-type" style="background:${tc.bg};color:${tc.fg}">${escapeHtml(tc.label)}</span>` +
      `<span class="gam-sh2-feed-target">${escapeHtml((a.user || a.target || '—'))}</span>` +
      (exec ? `<span class="gam-sh2-feed-exec">[${escapeHtml(exec)}]</span>` : '<span></span>');
    feed.appendChild(li);
  });
}
```

---

## D. Effort Estimate

| Task | Complexity | Est. time |
|---|---|---|
| CSS — new `gam-sh2-*` rule block in `buildCSS()` | Low | 45 min |
| HTML skeleton — replace `pop.innerHTML` template | Low | 30 min |
| KPI local render + `_setTile` helper | Low | 20 min |
| Firehose pill + worker pill state machine | Medium | 30 min |
| Feed shimmer → real rows with stagger | Medium | 25 min |
| modStats patch logic (in-place update, no layout shift) | Low | 20 min |
| Positioning clamp (prevent off-screen) | Trivial | 10 min |
| Feed scroll (max-height + custom scrollbar) | Trivial | 10 min |
| Entry animation + value-change flash | Low | 20 min |
| Remove old `gam-sh-*` rules + legacy DOM structure | Low | 15 min |
| QA — test local-only path (modStats timeout), worker fail path, all 4 action types in feed | Medium | 45 min |
| **Total** | | **~4.5h** |

**Phasing recommendation:**

- **Phase 1 (3h):** Full HTML/CSS replacement + KPI tiles + local-fallback render. Ship as cosmetic uplift with same data surface. Both RPC calls unchanged.
- **Phase 2 (1.5h):** modStats in-place patch + feed shimmer → real rows + entry animation. Requires modStats `executor` field to be populated by the worker (if not already present, feed executor column shows blank — acceptable fallback).

**modStats shape dependency:** The redesign requires `d.recent_actions[].executor` (or `mod` or `by`) for the executor column. If that field isn't in the current worker response, the executor column degrades to empty span — no breakage. Check `/mod/stats` handler in the worker before Phase 2.

**No new RPC calls. No schema changes. No breaking changes to existing dismiss/anchor logic.**
