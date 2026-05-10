# UIUX-19 — Empty / Loading / Error State Design System

> **Scope:** All surfaces in `modtools.js` + `popup.{html,js,css}`.
> **Aesthetic:** Bloomberg dense — mono accent stack, amber/red signal chips,
> tight 4/8/12 grid, no whitespace decoration. State UI is information, not art.
> **Status:** Design spec — read-only inventory + canonical pattern + CSS
> implementation plan.

---

## A. Inventory — Current State-Handling (where each surface is sloppy)

### A.1 Popup — Stat Tiles (popup.html + popup.js)

**Surface:** Seven `.pop-stat-val` cells (Pending, Death Row, Banned, Bans/24h,
Msgs/24h, Notes/24h, AI today).

**Current behavior:**
- HTML ships with `&mdash;` (`—`) as the initial value (popup.html lines 49-74).
- `popup.js:2605-2611` immediately overwrites any empty cell with the string
  `'--'` before `loadStats()` fires — the E.2.5 pattern.
- On success, values are written directly to `.textContent`.
- On fetch failure: the catch block in `loadStats()` logs to console
  (`console.error('[Popup] Failed to load stats:', err)`) but does **nothing to
  the UI** — tiles stay at `--` forever with no error signal.
- On partial success (worker reachable but AI budget fields absent): AI-today
  tile stays `--` silently; comment says "leave -- placeholder".
- No skeleton shimmer, no stale timestamp, no retry button.

**Sloppiness score: HIGH.** Silent failure — a mod looking at `--` has no idea
if data is loading, failed, or simply unavailable.

---

### A.2 Popup — Drill-Down Drawer (popup.js)

**Surface:** `#pop-drill` overlay — renders a table of users/actions when a stat
tile is clicked.

**Current behavior:**
- Drawer opens immediately; body is populated by `renderDrillDown()`.
- No loading state during the async `popupRpc()` call inside `renderDrillDown`.
- Empty result: uses `gamEmptyState()` (popup.js Patch 5) with icon + headline +
  desc — **this one is correct**.
- RPC error: `gamEmptyState()` is conditionally used for visual specs; error path
  (`rList.ok === false`) writes raw text to `.textContent` with `pop-token-status
  err` class — no retry button.

**Sloppiness score: MEDIUM.** Empty handled well; loading and error are bare text.

---

### A.3 Popup — Diagnostics Tab (popup.html lines 648-660)

**Surface:** Four `<div>` panels: `diagSysIdentity`, `diagSwHealth`,
`diagRpcLog`, `diagStorage`.

**Current behavior:**
- All four ship with inline text content `Loading...` — plain text, no CSS
  class, no animation.
- On populate: text content replaced directly.
- On error: no explicit error state defined — panels may retain `Loading...`
  indefinitely if the RPC fails.

**Sloppiness score: HIGH.** Text "Loading..." is the explicitly banned pattern.

---

### A.4 Popup — SW Restart Notice (popup.js lines 40-46)

**Surface:** Fixed banner injected when `chrome.runtime.sendMessage` throws
"context invalidated".

**Current behavior:**
- `__showPopupRestartNotice()` creates a `div` with hard-coded inline style:
  `background:#2a1d10; border-bottom:1px solid #ff9933; color:#ffd84d`.
- Text: `"Extension is restarting — close and reopen this popup."` — no action
  button, no close affordance, no dismiss.
- Banner persists until the user manually closes and reopens the popup.

**Sloppiness score: MEDIUM.** Functionally communicates the state; missing dismiss
and no reload-action button.

---

### A.5 Popup — Tools Tab / Lead Tools (popup.html lines 420-424)

**Surface:** `#srLeadEmptyHint` shown while senior-lead tools initialize.

**Current behavior:**
- Text: `"Loading elevated tools…"` — plain text with inline color, no animation.
- Comment in HTML: "loading shimmy for senior_lead tier" — but there is no shimmy;
  it is static text.

**Sloppiness score: MEDIUM.** Promises a shimmy that does not exist.

---

### A.6 Popup — Macros List (popup.html line 316)

**Surface:** `#macrosList` initialized with `<div>Loading...</div>` before macros
are fetched.

**Current behavior:** Same "Loading..." bare text pattern, no animation, no error
state defined for when the macros RPC fails.

**Sloppiness score: HIGH.**

---

### A.7 modtools.js — AI NBA Card (Section 5 of user drawer)

**Surface:** `_drawerRenderNba()` — the "Generate recommendation" flow that
calls `/ai/next-best-action`.

**Current behavior:**
- Loading: mounts `renderSkeleton('card')` only when `__uxOn()` is true (flag-
  gated). Correct pattern when the flag is on.
- Error: skeleton is removed; resultWrap gets `<em class="gam-muted">AI
  unavailable</em>` — grey muted text — and `genBtn` becomes "Retry". No error
  chip, no remediation hint.
- The muted-text error conflicts with the Bloomberg dense aesthetic — a dense UI
  uses explicit colored chips, not grey fade text.

**Sloppiness score: LOW-MEDIUM.** Loading correct; error lacks signal color and
remediation hint.

---

### A.8 modtools.js — Paragraph Skeletons in User Drawer

**Surface:** Sections 1-4 of the user drawer (Intel, History, Notes, Modmail)
use `renderSkeleton('paragraph')` during hydration — correct and behind the
`__uxOn()` flag.

**Sloppiness score: LOW.** Pattern is right; needs no redesign.

---

### A.9 modtools.js — Empty States (renderEmptyState / gamEmptyState)

**Surface:** Death Row rules, Tards rules, user roster filter, bug reports, scan
results, drill-down specs.

**Current behavior:**
- `modtools.js` uses `renderEmptyState()` (flag-gated, returns DOM node with
  icon + headline + description + optional CTA button).
- `popup.js` uses its own parallel `gamEmptyState()` (Patch 5, always-on, same
  shape but slightly different CSS class names and icon set).
- **Gap:** the two implementations are duplicated and not in sync — icon sizes
  differ (40px in modtools vs 32px in popup), class names differ
  (`.gam-empty-card` vs `.gam-empty-card` — same name, different stylesheets),
  CTA button styles diverge (monospace uppercase in popup, gam-btn-accent class
  in modtools contexts).

**Sloppiness score: MEDIUM.** Works per-surface; bifurcated implementation makes
future changes require two-file edits.

---

### A.10 modtools.js — SUS Popover Empty State

**Surface:** `_showSusPopover()` — the watchlist overlay triggered from the
ticker or sus-marker badge.

**Current behavior:**
- When count === 0: creates a raw `<div>` with inline style
  `color:#5a5752;text-align:center;padding:16px 0;font-size:10px` and text
  `"No sus users currently flagged"`.
- No icon, no CTA, no renderEmptyState call.
- When the popover RPC errors: there is no error state at all — the popover
  simply shows an empty body with no indication.

**Sloppiness score: HIGH.** Does not use the shared empty-state system. Raw
inline style is a maintenance hazard.

---

### A.11 modtools.js — Snack / Error Toast (snack() function)

**Surface:** Global `snack()` toast — used for async action outcomes throughout.

**Current behavior:** Color-coded by type ('error'=red, 'warn'=amber, 'success'=
green, 'info'=blue). This is the **one correctly implemented** feedback surface.
Consistent, uses the token palette, disappears after timeout.

**Sloppiness score: NONE.** Reference implementation; other surfaces should match
its signal-color discipline.

---

### A.12 Popup — Token Status Lines

**Surface:** `.pop-token-status` elements across the Tokens tab.

**Current behavior:** `.ok` → green, `.err` → red, `.warn` (via inline
`color:#f0a040`) → amber. Text messages are inline strings, not standardized.
No retry buttons attached to error states.

**Sloppiness score: LOW-MEDIUM.** Signal colors correct; retry affordance missing.

---

## B. Canonical Patterns

All state patterns are governed by the Bloomberg dense palette:

```
BG:       #0c0e12  BG2: #181b20  BG3: #252a31
BORDER:   #2a2f38  BORDER2: #3a3f48
ACCENT:   #4A9EFF  GREEN: #3dd68c  RED: #f04040
AMBER:    #f0a040  PURPLE: #a78bfa  MUTED: #5c6370
TEXT:     #e8eaed  TEXT2: #8b929e
MONO:     'SF Mono','Cascadia Code','JetBrains Mono',Consolas,monospace
```

---

### B.1 Loading State — Skeleton (PREFERRED)

Use for: any panel or list that will be replaced by real data. Replaces the
placeholder content; removed when data arrives.

**Rule:** Skeleton is **always** preferred over spinner and **always** preferred
over text "Loading...". Text "Loading..." is never acceptable on any surface.

**Shape anatomy:**

```
[gam-skeleton-wrap aria-busy="true"]
  [gam-sk-{line|row|card|avatar} gam-skeleton-shimmer]  (1-N based on variant)
```

**Shimmer spec:**
- Base color: `#2a2a30`
- Shimmer gradient: `90deg, #2a2a30 0%, #3a3a42 50%, #2a2a30 100%`
- Background-size: `200% 100%`
- Animation: `gam-skeleton-shimmer 2s linear infinite` (existing keyframe)
- Reduced-motion: static `#2a2a30` fill, no animation (existing `@media` guard)
- Duration: animation runs until `.gam-skeleton-wrap` is removed from DOM

**Variants (existing):**

| Variant       | CSS class     | Height  | Use case                         |
|---------------|---------------|---------|----------------------------------|
| `text-line`   | `gam-sk-line` | 12px    | Single stat value, short label   |
| `paragraph`   | `gam-sk-line` | 12px x3 | Text-heavy section (drawer tabs) |
| `row`         | `gam-sk-row`  | 36px    | List row, macro entry, user row  |
| `card`        | `gam-sk-card` | 120px   | AI card, large content block     |
| `avatar`      | `gam-sk-avatar`| 32px circle | User avatar placeholder    |

**NEW variant needed — `stat-tile`:**

```css
.gam-sk-stat {
  width: 100%;
  height: 28px;        /* matches .pop-stat-val font-size:20px + padding */
  border-radius: 3px;
  background: #2a2a30;
}
```

Used to replace the `--` dash in stat tiles during loading (instead of bare
em-dash which has no visual loading signal).

**Spinner (RARE):** Only when a skeleton is semantically wrong (e.g. a button
that performs an action and the user is waiting for confirmation). Use the
existing `.loading` class on `withLoading()` buttons. No new spinner CSS needed.

**Text "Loading..." (NEVER):** Banned on all surfaces. Text has zero loading
signal — it does not animate, it does not communicate progress. Remove all
instances (A.3, A.5, A.6) as part of implementation.

---

### B.2 Empty State

Use for: a list or panel that loaded successfully but contains zero records.
Not for errors. Not for pre-load.

**Shape anatomy:**

```
[.gam-empty-state role="status"]
  [.gam-empty-icon]   <!-- SVG, 32x32, stroke="currentColor" color:#5c6370 -->
  [.gam-empty-headline]  <!-- 12px/600, color:#e8eaed -->
  [.gam-empty-desc]   <!-- 11px/400, color:#8b929e, max-width:260px -->
  [.gam-empty-cta]    <!-- OPTIONAL: primary-action button -->
```

**CTA button spec:**
- Background: transparent
- Border: `1px solid #4A9EFF`
- Color: `#4A9EFF`
- Font: `600 10px ui-monospace,monospace`, letter-spacing: `0.06em`
- Text: UPPERCASE
- Hover: `background: rgba(74,158,255,0.10)`
- Use for the single most actionable next step ("ADD RULE", "CRAWL QUEUE",
  "REFRESH")

**Contextual icon set (extend existing):**

| Key               | Context                                  |
|-------------------|------------------------------------------|
| `modmail-empty`   | Modmail panel, no messages               |
| `users-empty`     | User roster, no results                  |
| `rules-empty`     | DR rules, Tards rules                    |
| `actions-empty`   | Action log, no actions                   |
| `check-circle`    | Bug reports, clean scan result           |
| `sus-empty` (NEW) | SUS popover, no watchlisted users        |
| `queue-empty` (NEW) | Queue popover, queue is clear          |

**NEW SVG for `sus-empty`:**
```
<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6">
  <circle cx="12" cy="12" r="9"/>
  <path d="M9 12l2 2 4-4"/>
</svg>
```
(Checkmark inside circle — "nothing flagged, all clear".)

**NEW SVG for `queue-empty`:**
```
<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.6">
  <rect x="3" y="4" width="18" height="3" rx="1"/>
  <rect x="3" y="10" width="18" height="3" rx="1" opacity=".4"/>
  <rect x="3" y="16" width="18" height="3" rx="1" opacity=".15"/>
</svg>
```

**Unification note:** Both `renderEmptyState` (modtools.js) and `gamEmptyState`
(popup.js) must migrate to the shared `.gam-empty-state` class. The popup
parallel implementation (Patch 5) should be retired in favor of a shared module
loaded in both contexts. Until then, the CSS class names should be aligned:
`.gam-empty-state` replaces `.gam-empty-card`.

---

### B.3 Error State

Use for: a fetch that returned a non-ok response, a network failure, an RPC
error, or any condition where data that *should* be present is not due to a
system failure.

**Shape anatomy:**

```
[.gam-error-state role="alert"]
  [.gam-error-chip]    <!-- colored chip: RED for hard errors, AMBER for soft -->
  [.gam-error-msg]     <!-- 11px, color:#e8eaed, brief factual description -->
  [.gam-error-hint]    <!-- 10px, color:#8b929e, remediation step -->
  [.gam-error-retry]   <!-- OPTIONAL: retry button -->
```

**Error chip spec (`.gam-error-chip`):**

| Severity | BG                        | Border                    | Text      | Prefix  |
|----------|---------------------------|---------------------------|-----------|---------|
| Hard     | `rgba(240,64,64,0.12)`    | `rgba(240,64,64,0.4)`     | `#f04040` | ERR     |
| Soft     | `rgba(240,160,64,0.12)`   | `rgba(240,160,64,0.4)`    | `#f0a040` | WARN    |

Hard errors: RPC failure, HTTP 4xx/5xx, no response, context invalidated.
Soft errors: partial data, stale response, rate-limited.

**Retry button spec (`.gam-error-retry`):**
- Same shape as `.gam-empty-cta` but border/color uses the chip's signal color
  (RED for hard, AMBER for soft).
- Label: "RETRY" (all caps, monospace).
- On click: re-run the fetch that failed; swap back to skeleton during retry.

**Remediation hints (`.gam-error-hint`) — per error type:**

| Error code / pattern          | Hint text                                        |
|-------------------------------|--------------------------------------------------|
| `EXT_CONTEXT_INVALIDATED`     | "Close and reopen the popup."                    |
| HTTP 401 / 403                | "Token may be invalid — re-verify in Tokens tab."|
| HTTP 429                      | "Rate limit hit — wait 60s and retry."           |
| Network timeout / `status:0`  | "Worker unreachable — check CF dashboard."       |
| `NO_RESPONSE`                 | "Extension context lost — reload the extension." |
| AI unavailable                | "AI quota exhausted or model offline."           |
| Generic RPC error             | "Unexpected error — export diagnostics if this persists." |

---

### B.4 Stale State

Use for: data that loaded successfully but is known to be older than a threshold,
or when the last fetch timestamp is old enough to warrant a user nudge.

**Shape anatomy:**

```
[.gam-stale-chip]                          <!-- inline chip, amber -->
  "last updated Xs ago"  [REFRESH button]
```

**Chip spec (`.gam-stale-chip`):**
- Background: `rgba(240,160,64,0.10)`
- Border: `1px solid rgba(240,160,64,0.35)`
- Color: `#f0a040`
- Font: `600 10px ui-monospace,monospace`, letter-spacing: `0.05em`
- Padding: `2px 6px`
- Border-radius: `3px`
- Display: inline-flex, align-items center, gap 6px

**REFRESH button:**
- Same inline-flex row as the timestamp text.
- No border, no background.
- Color: `#f0a040`, underline on hover.
- Font: `600 10px ui-monospace`.
- Label: "REFRESH"

**Staleness thresholds:**

| Surface             | Threshold | Action on trigger              |
|---------------------|-----------|-------------------------------|
| Stat tiles          | >5 min    | Show stale chip above tiles   |
| Roster staleness    | >24h      | Already has existing UI — use chip |
| AI budget           | >10 min   | Show stale chip next to tile  |
| Diag panels         | n/a       | Always-fresh (on-demand load) |

---

## C. Implementation — Shared CSS Classes

The following CSS is the single canonical definition. It should live in a shared
location that both `modtools.js` (injected `<style>`) and `popup.css` consume.
For the popup, add to `popup.css`. For modtools, add to the `__v81InjectSkeletonCss`
injection block (or a new sibling `__v81InjectStateCss`).

**All classes are un-prefixed with a flag guard** — they are always-on. The
`gam-ux-polish-on` body-class scoping from v8.1 skeletons was a flag-gate
artifact. The canonical state system is unconditional.

```css
/* ============================================================
   GAM State System — canonical CSS
   Palette tokens (must match modtools.js const C):
     BG2 #181b20  BORDER #2a2f38
     RED #f04040  AMBER #f0a040  MUTED #5c6370
     TEXT #e8eaed  TEXT2 #8b929e
   ============================================================ */

/* ── Skeleton ─────────────────────────────────────────────── */
.gam-skel-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}
.gam-skel-line {
  height: 12px;
  border-radius: 4px;
  background: #2a2a30;
}
.gam-skel-row {
  height: 36px;
  border-radius: 6px;
  background: #2a2a30;
}
.gam-skel-card {
  height: 120px;
  border-radius: 8px;
  background: #2a2a30;
}
.gam-skel-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #2a2a30;
  flex-shrink: 0;
}
.gam-skel-stat {
  width: 100%;
  height: 28px;
  border-radius: 3px;
  background: #2a2a30;
}

@media (prefers-reduced-motion: no-preference) {
  .gam-skel-shimmer {
    background: linear-gradient(
      90deg,
      #2a2a30 0%,
      #3a3a42 50%,
      #2a2a30 100%
    );
    background-size: 200% 100%;
    animation: gam-skel-pulse 2s linear infinite;
  }
  @keyframes gam-skel-pulse {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
}

/* ── Empty state ──────────────────────────────────────────── */
.gam-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 16px;
  text-align: center;
}
.gam-empty-icon {
  color: #5c6370;
}
.gam-empty-headline {
  font-size: 12px;
  font-weight: 600;
  color: #e8eaed;
  line-height: 1.3;
}
.gam-empty-desc {
  font-size: 11px;
  color: #8b929e;
  max-width: 260px;
  line-height: 1.5;
}
.gam-empty-cta {
  margin-top: 4px;
  padding: 5px 12px;
  background: transparent;
  border: 1px solid #4A9EFF;
  color: #4A9EFF;
  cursor: pointer;
  font: 600 10px ui-monospace, 'SF Mono', Consolas, monospace;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-radius: 3px;
  transition: background 0.12s;
}
.gam-empty-cta:hover {
  background: rgba(74, 158, 255, 0.10);
}

/* ── Error state ──────────────────────────────────────────── */
.gam-error-state {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
}
.gam-error-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border-radius: 3px;
  font: 700 10px ui-monospace, 'SF Mono', Consolas, monospace;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  align-self: flex-start;
}
.gam-error-chip.hard {
  background: rgba(240, 64, 64, 0.12);
  border: 1px solid rgba(240, 64, 64, 0.40);
  color: #f04040;
}
.gam-error-chip.soft {
  background: rgba(240, 160, 64, 0.12);
  border: 1px solid rgba(240, 160, 64, 0.40);
  color: #f0a040;
}
.gam-error-msg {
  font-size: 11px;
  color: #e8eaed;
  line-height: 1.45;
}
.gam-error-hint {
  font-size: 10px;
  color: #8b929e;
  line-height: 1.4;
}
.gam-error-retry {
  margin-top: 4px;
  padding: 4px 10px;
  background: transparent;
  cursor: pointer;
  font: 600 10px ui-monospace, 'SF Mono', Consolas, monospace;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-radius: 3px;
  align-self: flex-start;
  transition: background 0.12s;
}
.gam-error-retry.hard {
  border: 1px solid rgba(240, 64, 64, 0.5);
  color: #f04040;
}
.gam-error-retry.hard:hover { background: rgba(240, 64, 64, 0.10); }
.gam-error-retry.soft {
  border: 1px solid rgba(240, 160, 64, 0.5);
  color: #f0a040;
}
.gam-error-retry.soft:hover { background: rgba(240, 160, 64, 0.10); }

/* ── Stale chip ───────────────────────────────────────────── */
.gam-stale-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid rgba(240, 160, 64, 0.35);
  background: rgba(240, 160, 64, 0.10);
  color: #f0a040;
  font: 600 10px ui-monospace, 'SF Mono', Consolas, monospace;
  letter-spacing: 0.05em;
}
.gam-stale-chip .gam-stale-refresh {
  background: none;
  border: none;
  color: #f0a040;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  padding: 0;
}
.gam-stale-chip .gam-stale-refresh:hover { color: #ffd84d; }
```

### C.1 JS Factory Functions

These replace the duplicate `renderEmptyState` / `gamEmptyState` split. Both
existing functions should be aliased to the new canonical version during
migration.

**`gamMakeEmpty(opts)`** — unified empty-state factory:
```js
// opts: { icon, headline, desc, ctaLabel, ctaFn }
function gamMakeEmpty(opts) {
  const o = opts || {};
  const root = document.createElement('div');
  root.className = 'gam-empty-state';
  root.setAttribute('role', 'status');
  if (o.icon && GAM_EMPTY_SVG[o.icon]) {
    const iw = document.createElement('div');
    iw.className = 'gam-empty-icon';
    iw.innerHTML = GAM_EMPTY_SVG[o.icon]; // static constants only — XSS-safe
    root.appendChild(iw);
  }
  if (o.headline) {
    const h = document.createElement('div');
    h.className = 'gam-empty-headline';
    h.textContent = String(o.headline);
    root.appendChild(h);
  }
  if (o.desc) {
    const d = document.createElement('div');
    d.className = 'gam-empty-desc';
    d.textContent = String(o.desc);
    root.appendChild(d);
  }
  if (o.ctaLabel && typeof o.ctaFn === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gam-empty-cta';
    btn.textContent = String(o.ctaLabel);
    btn.addEventListener('click', function(e) { try { o.ctaFn(e); } catch(_){} });
    root.appendChild(btn);
  }
  return root;
}
```

**`gamMakeError(opts)`** — canonical error-state factory:
```js
// opts: { severity ('hard'|'soft'), label, msg, hint, retryFn }
function gamMakeError(opts) {
  const o = opts || {};
  const sev = o.severity === 'soft' ? 'soft' : 'hard';
  const root = document.createElement('div');
  root.className = 'gam-error-state';
  root.setAttribute('role', 'alert');
  const chip = document.createElement('div');
  chip.className = 'gam-error-chip ' + sev;
  chip.textContent = o.label || (sev === 'hard' ? 'ERR' : 'WARN');
  root.appendChild(chip);
  if (o.msg) {
    const m = document.createElement('div');
    m.className = 'gam-error-msg';
    m.textContent = String(o.msg);
    root.appendChild(m);
  }
  if (o.hint) {
    const h = document.createElement('div');
    h.className = 'gam-error-hint';
    h.textContent = String(o.hint);
    root.appendChild(h);
  }
  if (typeof o.retryFn === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gam-error-retry ' + sev;
    btn.textContent = 'RETRY';
    btn.addEventListener('click', function(e) { try { o.retryFn(e); } catch(_){} });
    root.appendChild(btn);
  }
  return root;
}
```

**`gamMakeSkel(variant)`** — skeleton factory (replaces `renderSkeleton`):
```js
// variant: 'line'|'paragraph'|'row'|'card'|'avatar'|'stat'
function gamMakeSkel(variant) {
  const V = {
    line:      { cls: 'gam-skel-line',   count: 1 },
    paragraph: { cls: 'gam-skel-line',   count: 3 },
    row:       { cls: 'gam-skel-row',    count: 1 },
    card:      { cls: 'gam-skel-card',   count: 1 },
    avatar:    { cls: 'gam-skel-avatar', count: 1 },
    stat:      { cls: 'gam-skel-stat',   count: 1 }
  };
  const cfg = V[variant] || V.line;
  const wrap = document.createElement('div');
  wrap.className = 'gam-skel-wrap';
  wrap.setAttribute('aria-busy', 'true');
  wrap.setAttribute('aria-live', 'off');
  for (let i = 0; i < cfg.count; i++) {
    const n = document.createElement('div');
    n.className = cfg.cls + ' gam-skel-shimmer';
    wrap.appendChild(n);
  }
  return wrap;
}
```

**`gamMakeStale(label, refreshFn)`** — stale-chip factory:
```js
function gamMakeStale(label, refreshFn) {
  const chip = document.createElement('span');
  chip.className = 'gam-stale-chip';
  chip.textContent = label || 'stale';
  if (typeof refreshFn === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gam-stale-refresh';
    btn.textContent = 'REFRESH';
    btn.addEventListener('click', function(e) {
      chip.remove();
      try { refreshFn(e); } catch(_){}
    });
    chip.appendChild(btn);
  }
  return chip;
}
```

---

### C.2 Surface-Specific Wiring Plan

**Stat tiles (A.1):**
1. On popup open: set each `#s-*` element's content to `gamMakeSkel('stat')`.
2. On `loadStats()` success: replace skeleton with value string.
3. On `loadStats()` failure: replace with `gamMakeError({ severity:'hard',
   label:'STATS', msg:'Worker unreachable', hint:'Check CF dashboard.',
   retryFn: loadStats })` inside a compact wrapper above the tiles.
4. On stale (>5 min since last update): append `gamMakeStale('last updated
   Xs ago', loadStats)` above the stats grid.

**Diag panels (A.3):**
Replace all four `Loading...` initial values with `gamMakeSkel('paragraph')`.
On populate: remove skeleton, write content. On RPC failure: `gamMakeError()`.

**SW Restart banner (A.4):**
Replace hard-coded `__showPopupRestartNotice` div with a structured element that
uses `.gam-error-state` + `.gam-error-chip.hard`. Add a "CLOSE POPUP" button
that calls `window.close()`.

**SR Lead hint (A.5):**
Replace `"Loading elevated tools…"` with `gamMakeSkel('row')` inside
`#srLeadEmptyHint`. Remove when tools load.

**Macros list (A.6):**
Replace initial `<div>Loading...</div>` with `gamMakeSkel('row')` (×3 for
expected list items).

**AI NBA card (A.7):**
On error: replace `<em class="gam-muted">AI unavailable</em>` with
`gamMakeError({ severity:'soft', label:'AI', msg: errorText,
hint: 'AI quota exhausted or model offline.', retryFn: retriggerNba })`.
Keep "Retry" on genBtn as supplemental; the error state provides the primary
visual signal.

**SUS Popover empty (A.10):**
Replace inline-style empty div with `gamMakeEmpty({ icon:'sus-empty',
headline:'Queue is clean', desc:'No users currently flagged as suspicious.' })`.

---

## D. Effort Estimate

| Task | Files | Effort |
|------|-------|--------|
| Add canonical CSS to `popup.css` | popup.css | 0.5h |
| Add canonical CSS injection to modtools.js `__v81InjectStateCss` | modtools.js | 0.5h |
| Add `gamMakeSkel / gamMakeEmpty / gamMakeError / gamMakeStale` factories to popup.js | popup.js | 1h |
| Wire stat tiles (A.1): skeleton on open, error + stale on fail/timeout | popup.js | 1h |
| Wire Diag tab panels (A.3): skeleton replaces "Loading..." | popup.html + popup.js | 0.5h |
| Wire SW Restart banner (A.4): structured error chip + close button | popup.js | 0.5h |
| Wire SR Lead hint (A.5) and Macros list (A.6): skeleton | popup.html + popup.js | 0.5h |
| Wire AI NBA card error (A.7): error chip + remediation hint | modtools.js | 0.5h |
| Wire SUS Popover empty (A.10): gamMakeEmpty | modtools.js | 0.5h |
| Retire `gamEmptyState` (popup Patch 5) — alias to `gamMakeEmpty` | popup.js | 0.5h |
| Retire `renderSkeleton` + `renderEmptyState` — alias to new factories | modtools.js | 0.5h |
| Add new SVG icons (sus-empty, queue-empty) to both SVG maps | both | 0.25h |
| QA: visual check all surfaces in flag-on and reduced-motion | — | 1h |
| **TOTAL** | | **~7h** |

**Priority order (highest signal-density fix first):**
1. Stat tiles (A.1) — most visible, silent failure is a trust issue.
2. Diag panels (A.3) — "Loading..." ban enforcement.
3. SUS Popover empty (A.10) — raw inline style, not using the system.
4. AI NBA error (A.7) — grey muted text is invisible in the dense aesthetic.
5. SW Restart banner (A.4) — missing dismiss and action.
6. SR Lead / Macros (A.5, A.6) — skeleton polish, low user-visible impact.
7. Factory unification (retire duplicates) — maintenance, no user impact.
