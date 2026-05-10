# UIUX-05 — Maintenance Card Redesign
**GAW ModTools v10.11 | Design Ralph | Read-Only Audit**
_Date: 2026-05-10_

---

## A. Current State Critique

### What exists (popup.html L162-295)

The `#card-maint` collapsible card contains **11 interactive controls** arranged as a flat vertical stack of `pop-maint-row` rows inside a single `div.pop-maint`. Two AI detection buttons, two probe buttons, two destructive reset buttons, one Safe Mode toggle, one Feature Health status row, and a `<details>` accordion (`pop-maint-advanced`) that hides 6 additional diagnostic/repair buttons.

**Inventory (in source order):**

| # | ID | Label | Risk tier |
|---|---|---|---|
| 1 | safeModeRow | Safe Mode toggle | Control |
| 2 | featureHealthRow | Feature Health (status display) | Status |
| 3 | maintCookies | Clear stuck cookies + localStorage | Moderate |
| 4 | maintToken | Token health probe | Read |
| 5 | maintTardSuggest | AI: suggest tard / sus patterns | AI / budget |
| 6 | maintStickyScan | AI: scan modmail for sticky requests | AI / budget |
| — | pop-maint-advanced (accordion) | System diagnostics (advanced) | — |
| 7 | maintStorage | Storage health probe | Read |
| 8 | maintSelectorDrift | Selector drift report | Read |
| 9 | maintDiag | Diag log status + purge | Moderate |
| 10 | maintSchema | Schema migration check | Read |
| 11 | maintModmailBackfill | Backfill modmail history | Slow/one-shot |
| 12 | maintRepair | Repair settings | Moderate |
| 13 | maintReset | Reset settings to defaults | DESTRUCTIVE |

**13 controls total** — the highest control density of any card in the popup.

### Problems

**1. Zero visual grouping by semantic purpose.**
The current layout is purely historical — buttons were appended in ship order (v9.5, v9.11, v9.12, v9.16, v10.5). A new mod scanning the card sees an undifferentiated stack: cookies, token, AI suggest, AI scan, storage, drift, diag, schema, backfill, repair, reset. There is no way to visually answer "what kind of thing am I looking for?"

**2. All buttons render identically.**
Every button is `pop-btn pop-btn-ghost` with no color differentiation. Destructive actions (Reset settings — "DESTRUCTIVE" per its own tooltip) are visually identical to read-only probes (Token health probe). A mod can factory-reset their configuration as casually as they check their token age. This is a severity-signaling failure.

**3. The accordion split is arbitrary.**
The `pop-maint-advanced` accordion uses "mod-friendly vs. advanced" as its organizational axis. But the two AI buttons (highly non-technical, AI-budget-spending) are above the fold, while the schema migration check and repair settings (non-destructive, technical) are hidden. The split doesn't match user mental models.

**4. Safe Mode and Feature Health have no visual home.**
They sit at the top of the card because they were added first, not because they form a category. Safe Mode is a system-state toggle; Feature Health is a diagnostic read. They belong in different groups.

**5. Button click targets are undersized for the content.**
`padding: 4px 8px` on `pop-btn-ghost` inside a maintenance context delivers ~28px tap height. Bloomberg terminal density is correct for data rows; it is wrong for buttons that trigger routines. 32px minimum is the WCAG 2.5.8 target size guidance.

**6. No status-area real estate reserved.**
`pop-maint-status` elements are inline, zero-height when empty, and collapse visually into the next row. After a routine fires, the status text sandwiches between two buttons with no visual breathing room. The response feedback is the most important output of this card and it has the least space.

**7. The "Maintenance" card summary does not reflect severity.**
`#card-badge-maint` exists and can show a badge, but the card head gives no indication whether the card contains read-only probes, amber-level warnings, or destructive resets. Every card head looks the same.

---

## B. Redesign Proposal — Sub-Grouped Cards

Commander's directive: **each section is its own SEPARATE AND INDIVIDUAL CARD.**

The single `#card-maint` collapses into **four standalone `<details class="gam-card">` elements**, each with its own header, badge slot, and body. They replace the current card entirely. The existing accordion (`pop-maint-advanced`) is eliminated.

### Four cards

---

### Card 1 — SYSTEM STATUS
**id:** `card-maint-status`
**Icon:** `[SYS]`
**Purpose:** Ambient health indicators. No user-triggered routines. Read-only. Always visible (no collapse by default).

Controls:
- Safe Mode toggle row (`safeModeRow`)
- Feature Health row (`featureHealthRow`)
- Maintenance warning banner (`maintWarningBanner`)

Rationale: Safe Mode is a system state, not a maintenance action. Feature Health is a passive monitor. These do not belong alongside probe buttons. They need persistent visibility — they are status displays, not commands.

---

### Card 2 — PROBES
**id:** `card-maint-probes`
**Icon:** `[PRB]`
**Purpose:** Read-only diagnostic reads that cost nothing and can be run at any time.

Controls:
- `maintToken` — Token health probe
- `maintStorage` — Storage health probe
- `maintSelectorDrift` — Selector drift report
- `maintDiag` — Diag log status + purge (read side; purge is a secondary action on the result)

Rationale: All four are non-destructive reads. Storage probe, selector drift, and diag log are advanced but read-only. They belong together because the answer to "something feels off" is to run probes, not repairs.

---

### Card 3 — DETECTION (AI)
**id:** `card-maint-detect`
**Icon:** `[AI]`
**Purpose:** AI-budget-spending analysis routines. Grouped because they share a cost, a latency, and a result panel.

Controls:
- `maintTardSuggest` — AI: suggest tard / sus patterns
- `maintStickyScan` — AI: scan modmail for sticky requests

Rationale: These are the only two controls that consume the daily AI budget. They have longer latency (Llama round-trip), return a result panel, and have a different cost model than all other buttons. Isolation prevents a mod from accidentally running both in sequence without seeing the budget impact.

---

### Card 4 — INTEGRITY (destructive/repair)
**id:** `card-maint-integrity`
**Icon:** `[INT]`
**Purpose:** State-mutating and destructive operations. Amber/red severity. Collapsed by default.

Controls:
- `maintCookies` — Clear stuck cookies + localStorage (moderate)
- `maintModmailBackfill` — Backfill modmail history (slow, one-shot)
- `maintSchema` — Schema migration check (safe write)
- `maintRepair` — Repair settings (non-destructive write)
- `maintReset` — Reset settings to defaults (DESTRUCTIVE — red)

Rationale: Any operation that writes or deletes state belongs here, grouped behind a single collapsed card that communicates "these have consequences." The amber header color signals caution before the mod opens it. Reset sits at the bottom with a red button style. Cookies and backfill are moderate-risk; schema and repair are safe writes — all coexist here because they are all state-mutating vs. read-only.

---

## C. Severity-Color Guidance

Mapped directly to existing `--bb-*` token set. No new colors required.

| Card | Category header color | Button accent | Button bg on hover | Risk level |
|---|---|---|---|---|
| SYSTEM STATUS | `--bb-ink-dim` (neutral gray) | none | `--bb-hover` | n/a (display) |
| PROBES | `--bb-cyan` (#66ccff) | `--bb-cyan` left-border | `--bb-cyan-bg` | None — read |
| DETECTION (AI) | `--bb-purple` (#a78bfa) | `--bb-purple` left-border | `--bb-purple-bg` | Budget cost |
| INTEGRITY | `--bb-amber` (#ff9933) | `--bb-amber` left-border | `--bb-amber-bg` | Write/destruct |
| Reset button only | `--bb-red` (#ff3b3b) | `--bb-red` border + text | `--bb-red-bg` | DESTRUCTIVE |

**Principle:** The left-border accent on each button row is the primary color signal. The button text stays `--bb-ink` (neutral) to preserve readability. Only the Reset button inverts this — red text + red border — because it requires the strongest possible pre-click friction without a JavaScript confirm dialog on every probe.

**Safe Mode toggle:** when active, the track background shifts to `--bb-amber-bg`, the thumb to `--bb-amber`, and the label to `--bb-amber`. This matches the existing spec at L187-190 but should be explicit in CSS rather than inline styles.

---

## D. Visual Mockup (ASCII, Bloomberg terminal aesthetic)

```
+--[ SYS ]--SYSTEM STATUS-----------------------------------------+
| [=] Safe Mode  [OFF]   << toggle, amber when active             |
| [v] Feature Health: All features healthy                        |
+------------------------------------------------------------------+

+--[ PRB ]--PROBES-------------------------------------------------+
| [cyan left-border]                                              |
|   [TOKEN HEALTH PROBE          ]  >> 47d green / ok             |
| - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -|
|   [STORAGE HEALTH PROBE        ]                                |
| - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -|
|   [SELECTOR DRIFT REPORT       ]                                |
| - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -|
|   [DIAG LOG STATUS + PURGE     ]                                |
+------------------------------------------------------------------+

+--[ AI ]--DETECTION (AI)------------------------------------------+
| [purple left-border]                              AI BUDGET: n/a|
|   [AI: SUGGEST TARD / SUS PATTERNS]                             |
| - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -|
|   [AI: SCAN MODMAIL FOR STICKY REQUESTS]                        |
+------------------------------------------------------------------+

+--[ INT ]--INTEGRITY (click to expand)----------------------------+
  +----------------------------------------------------------------+
  | [amber left-border]                                           |
  |   [CLEAR STUCK COOKIES + LOCALSTORAGE]                        |
  | - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -|
  |   [BACKFILL MODMAIL HISTORY    ]                              |
  | - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -|
  |   [SCHEMA MIGRATION CHECK      ]                              |
  | - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -|
  |   [REPAIR SETTINGS             ]                              |
  | - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -|
  |   [RESET SETTINGS TO DEFAULTS  ]  << RED text + border       |
  +----------------------------------------------------------------+
```

**Density notes:**
- Category header: 10px monospace, uppercase, letter-spacing 0.12em, color = category accent
- Button rows: 32px min-height (up from ~28px), `padding: 5px 8px`, text-align left
- Left-border accent: 3px solid, category color, `border-radius: 0` (terminal aesthetic)
- Status text: appears inline-right of the button on the same row, right-aligned, tabular-nums, 10px, `--bb-ink-dim` default, colorized by result (.ok = green, .warn = amber, .err = red)
- Dividers between rows: `1px solid var(--bb-line)` — existing spec preserved

---

## E. CSS Specification

### New category header rule

```css
/* UIUX-05: Maintenance sub-card category header */
.pop-maint-cat-head {
  font: 600 var(--bb-t-xs)/1.2 var(--bb-font);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  padding: var(--bb-s3) var(--bb-s4) var(--bb-s2);
  margin: 0;
  border-bottom: 1px solid var(--bb-line);
  user-select: none;
  /* color set per-card via modifier */
}
.pop-maint-cat-head.cat-probe   { color: var(--bb-cyan); }
.pop-maint-cat-head.cat-detect  { color: var(--bb-purple); }
.pop-maint-cat-head.cat-integrity { color: var(--bb-amber); }
.pop-maint-cat-head.cat-status  { color: var(--bb-ink-dim); }
```

### New button row with left-border accent

```css
/* UIUX-05: Maintenance action row — button + inline status */
.pop-maint-action-row {
  display: flex;
  align-items: center;
  gap: var(--bb-s4);
  padding: var(--bb-s2) var(--bb-s4);
  border-bottom: 1px solid var(--bb-line);
  min-height: 32px;
  border-left: 3px solid transparent;
  transition: background 80ms ease-out, border-left-color 80ms ease-out;
}
.pop-maint-action-row:last-child { border-bottom: none; }

/* Category-specific left-border accent on hover */
#card-maint-probes    .pop-maint-action-row:hover { border-left-color: var(--bb-cyan);   background: var(--bb-cyan-bg); }
#card-maint-detect    .pop-maint-action-row:hover { border-left-color: var(--bb-purple); background: var(--bb-purple-bg); }
#card-maint-integrity .pop-maint-action-row:hover { border-left-color: var(--bb-amber);  background: var(--bb-amber-bg); }

/* Button inside action row — override pop-btn-ghost sizing */
.pop-maint-action-row .pop-btn {
  flex: 1;
  text-align: left;
  padding: 5px 8px;
  min-height: 28px;
  background: transparent;
  border: none;
  color: var(--bb-ink);
  font: 400 var(--bb-t-sm)/1.3 var(--bb-font);
  cursor: pointer;
  transition: color 80ms ease-out;
}
.pop-maint-action-row .pop-btn:hover { color: var(--bb-ink); }
.pop-maint-action-row .pop-btn:focus-visible {
  outline: 1px solid var(--bb-amber);
  outline-offset: -1px;
}

/* Inline status — right side of the row */
.pop-maint-action-status {
  font: 400 var(--bb-t-xs)/1 var(--bb-font);
  font-variant-numeric: tabular-nums;
  color: var(--bb-ink-dim);
  white-space: nowrap;
  flex-shrink: 0;
  max-width: 120px;
  text-align: right;
}
.pop-maint-action-status:empty { display: none; }
.pop-maint-action-status.ok   { color: var(--bb-green); }
.pop-maint-action-status.warn { color: var(--bb-amber); }
.pop-maint-action-status.err  { color: var(--bb-red); }

/* Reset button — only button in the system with red styling */
#maintReset {
  color: var(--bb-red) !important;
  border: 1px solid var(--bb-red-dim) !important;
  border-radius: var(--bb-r) !important;
  background: var(--bb-red-bg) !important;
}
#maintReset:hover {
  background: rgba(255,59,59,0.18) !important;
  border-color: var(--bb-red) !important;
}

/* AI detection card — budget badge in card head */
#card-maint-detect .gam-card-badge {
  color: var(--bb-purple);
  border-color: rgba(167,139,250,0.4);
  background: var(--bb-purple-bg);
}

/* Integrity card — collapsed by default */
#card-maint-integrity:not([open]) .gam-card-head {
  color: var(--bb-amber);
}

/* Safe Mode toggle — CSS-driven state color (remove inline styles in HTML) */
#safeModeToggle:checked ~ #safeModeToggleTrack {
  background: var(--bb-amber-bg);
}
#safeModeToggle:checked ~ #safeModeToggleTrack .safeModeToggleThumb {
  left: 18px;
  background: var(--bb-amber);
}
```

### Existing rules to retire

The following existing rules become redundant and should be removed when UIUX-05 ships:

- `.pop-maint` (both instances, L578 and L1002) — container replaced by individual card bodies
- `.pop-maint-row` (both instances, L584 and L1007) — replaced by `.pop-maint-action-row`
- `.pop-maint-row .pop-btn-ghost` (L589) — replaced by `.pop-maint-action-row .pop-btn`
- `.pop-maint-status` (both instances, L593 and L1018) — replaced by `.pop-maint-action-status`
- `.pop-maint-advanced` and all sub-rules (L1297-1336) — accordion eliminated
- Inline styles on `safeModeRow`, `safeModeToggleTrack`, `safeModeToggleThumb`, `safeModeToggleLabel2` — moved to CSS

---

## F. HTML Structure

Replaces `<details class="gam-card" id="card-maint">` (L162-295) with four discrete cards.

```html
<!-- ================================================================
     UIUX-05: Maintenance — four separate cards
     Replaces: <details id="card-maint"> (popup.html L162-295)
     ================================================================ -->

<!-- Card 1: System Status (always open, no collapse) -->
<details class="gam-card" id="card-maint-status" data-tab="tools" open>
  <summary class="gam-card-head">
    <span class="gam-card-chevron" aria-hidden="true"></span>
    <span class="gam-card-title">[SYS] System Status</span>
    <span class="gam-card-badge" id="card-badge-maint-status" style="display:none"></span>
  </summary>
  <div class="gam-card-body">
    <div id="maintWarningBanner" class="pop-maint-banner" style="display:none"></div>
    <!-- Safe Mode toggle -->
    <div class="pop-maint-action-row" id="safeModeRow">
      <span class="pop-btn" style="flex:1;font-size:11px;color:var(--bb-ink-dim)"
            title="Disables firehose, AI, animations, presence ping, auto-DR. Keeps: token entry, ban hammer, modmail send, mod log, settings.">
        Safe Mode
      </span>
      <label class="gam-toggle" id="safeModeToggleLabel" style="display:flex;align-items:center;gap:4px;cursor:pointer">
        <input type="checkbox" id="safeModeToggle" style="display:none">
        <span id="safeModeToggleTrack" class="gam-toggle-track"
              style="display:inline-block;width:32px;height:16px;border-radius:8px;background:var(--bb-line);position:relative;transition:background .2s">
          <span id="safeModeToggleThumb"
                style="position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--bb-ink-faint);transition:left .2s,background .2s"></span>
        </span>
        <span id="safeModeToggleLabel2" style="font-size:11px;color:var(--bb-ink-faint)">OFF</span>
      </label>
    </div>
    <!-- Feature Health -->
    <div class="pop-maint-action-row" id="featureHealthRow" style="display:none;flex-direction:column;align-items:flex-start">
      <div style="font-size:10px;color:var(--bb-ink-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">Feature Health</div>
      <div id="featureHealthList" style="font-size:11px;color:var(--bb-ink-faint)">All features healthy</div>
    </div>
  </div>
</details>

<!-- Card 2: Probes -->
<details class="gam-card" id="card-maint-probes" data-tab="tools" open>
  <summary class="gam-card-head">
    <span class="gam-card-chevron" aria-hidden="true"></span>
    <span class="gam-card-title">[PRB] Probes</span>
    <span class="gam-card-badge" id="card-badge-maint-probes" style="display:none"></span>
  </summary>
  <div class="gam-card-body" style="padding:0">
    <div class="pop-maint-action-row">
      <button id="maintToken" class="pop-btn"
              title="Pings worker /mod/whoami, reports token age + lead status. Color-coded by age (green <60d / yellow 60-90d / red >90d).">
        Token health probe
      </button>
      <div id="maintTokenStatus" class="pop-maint-action-status"></div>
    </div>
    <div class="pop-maint-action-row">
      <button id="maintStorage" class="pop-btn"
              title="Reads chrome.storage.local usage + top-5 largest keys. Trim button evicts oldest 50% of intel cache + caps diag log.">
        Storage health probe
      </button>
      <div id="maintStorageStatus" class="pop-maint-action-status"></div>
    </div>
    <div class="pop-maint-action-row">
      <button id="maintSelectorDrift" class="pop-btn"
              title="Lists learned-selector promotions from gam_learned_selectors so you can see if GAW changed their layout.">
        Selector drift report
      </button>
      <div id="maintSelectorDriftStatus" class="pop-maint-action-status"></div>
    </div>
    <div class="pop-maint-action-row">
      <button id="maintDiag" class="pop-btn"
              title="Counts diag log entries. Buttons: Export (clipboard, redacted JSON) and Purge oldest 50%.">
        Diag log status + purge
      </button>
      <div id="maintDiagStatus" class="pop-maint-action-status"></div>
    </div>
  </div>
</details>

<!-- Card 3: Detection (AI) -->
<details class="gam-card" id="card-maint-detect" data-tab="tools" open>
  <summary class="gam-card-head">
    <span class="gam-card-chevron" aria-hidden="true"></span>
    <span class="gam-card-title">[AI] Detection</span>
    <span class="gam-card-badge" id="card-badge-maint-detect" style="display:none"></span>
  </summary>
  <div class="gam-card-body" style="padding:0">
    <div class="pop-maint-action-row">
      <button id="maintTardSuggest" class="pop-btn"
              title="Llama scans the last 80 usernames seen via firehose and proposes patterns worth flagging (hate speech, troll archetypes, etc.). Counts against your daily AI budget.">
        AI: suggest tard / sus patterns
      </button>
      <div id="maintTardSuggestStatus" class="pop-maint-action-status"></div>
    </div>
    <div id="maintTardSuggestPanel" style="display:none"></div>
    <div class="pop-maint-action-row">
      <button id="maintStickyScan" class="pop-btn"
              title="Scans the last 7 days of modmail messages for sticky requests, AI-confirms intent, returns flagged threads.">
        AI: scan modmail for sticky requests
      </button>
      <div id="maintStickyScanStatus" class="pop-maint-action-status"></div>
    </div>
    <div id="maintStickyScanPanel" style="display:none"></div>
  </div>
</details>

<!-- Card 4: Integrity (collapsed by default — destructive ops) -->
<details class="gam-card" id="card-maint-integrity" data-tab="tools">
  <summary class="gam-card-head">
    <span class="gam-card-chevron" aria-hidden="true"></span>
    <span class="gam-card-title">[INT] Integrity</span>
    <span class="gam-card-badge" id="card-badge-maint-integrity" style="display:none"></span>
  </summary>
  <div class="gam-card-body" style="padding:0">
    <div class="pop-maint-action-row">
      <button id="maintCookies" class="pop-btn"
              title="Clears stuck XSRF/session/cf_* cookies on greatawakening.win plus per-tab localStorage. Use when GAW gives 403/CSRF errors.">
        Clear stuck cookies + localStorage
      </button>
      <div id="maintCookiesStatus" class="pop-maint-action-status"></div>
    </div>
    <div class="pop-maint-action-row">
      <button id="maintModmailBackfill" class="pop-btn"
              title="Walks /modmail page 1..10 in your active GAW tab and ingests historical threads + messages. ~15s for 10 pages. Run once.">
        Backfill modmail history
      </button>
      <div id="maintModmailBackfillStatus" class="pop-maint-action-status"></div>
    </div>
    <div class="pop-maint-action-row">
      <button id="maintSchema" class="pop-btn"
              title="Compares stored gam_settings.schema_version against the code-side constant. If mismatch, runs additive migration (safe defaults).">
        Schema migration check
      </button>
      <div id="maintSchemaStatus" class="pop-maint-action-status"></div>
    </div>
    <div class="pop-maint-action-row">
      <button id="maintRepair" class="pop-btn"
              title="Non-destructive. Checks gam_settings for missing or wrong-type keys and fills them with safe defaults. Tokens + UX prefs are never touched.">
        Repair settings
      </button>
      <div id="maintRepairStatus" class="pop-maint-action-status"></div>
    </div>
    <div class="pop-maint-action-row">
      <button id="maintReset" class="pop-btn"
              title="DESTRUCTIVE. Wipes gam_settings feature flags (preserves tokens). Triple-confirms before running. Use only when 'everything seems weird'.">
        Reset settings to defaults
      </button>
      <div id="maintResetStatus" class="pop-maint-action-status"></div>
    </div>
  </div>
</details>
```

**ID compatibility:** All 13 element IDs (`maintToken`, `maintStorage`, `maintSelectorDrift`, `maintDiag`, `maintTardSuggest`, `maintStickyScan`, `maintTardSuggestPanel`, `maintStickyScanPanel`, `maintCookies`, `maintModmailBackfill`, `maintSchema`, `maintRepair`, `maintReset`, `safeModeRow`, `safeModeToggle`, `safeModeToggleTrack`, `safeModeToggleThumb`, `safeModeToggleLabel`, `safeModeToggleLabel2`, `featureHealthRow`, `featureHealthList`, `maintWarningBanner`) are preserved verbatim. Zero JS changes required.

**`data-tab` attribute:** All four cards carry `data-tab="tools"` so the existing tab-visibility system hides/shows them identically to the current `#card-maint`.

**Badge slots:** Each card has its own `gam-card-badge` slot. The v10.x `card-badge-maint` consumers in popup.js need to be mapped to the appropriate sub-card badge. Suggested mapping:
- Warning/health state flags → `card-badge-maint-status`
- Token age warn → `card-badge-maint-probes`
- AI budget warn → `card-badge-maint-detect`
- Settings corruption warn → `card-badge-maint-integrity`

---

## G. Effort Estimate

| Work item | Scope | Estimate |
|---|---|---|
| popup.html: replace single `#card-maint` with four cards | L162-295 surgical replacement | 1h |
| popup.css: add `.pop-maint-cat-head`, `.pop-maint-action-row`, `.pop-maint-action-status` | ~50 lines new CSS | 30m |
| popup.css: retire redundant old `.pop-maint*` rules, `.pop-maint-advanced` block | ~30 lines deleted | 15m |
| popup.css: move Safe Mode toggle color from inline styles to CSS rules | 8 lines | 15m |
| popup.js: re-map `card-badge-maint` badge writes to four new badge IDs | grep `card-badge-maint`, update 1-4 call sites | 30m |
| popup.js: re-map `card-maint-status` open/close state if persisted | check `gam_settings` persistence | 30m |
| QA: verify all 13 button handlers still fire, status fields update, Safe Mode toggle works | manual smoke | 30m |
| **Total** | | **~3.5h** |

**Zero-risk items confirmed:**
- All button IDs unchanged — no JS handler edits needed
- All status div IDs unchanged — no JS DOM-write edits needed
- `data-tab="tools"` preserved — tab-gate logic unaffected
- Bloomberg CSS token set unchanged — no visual regression to other cards

**One risk to verify before ship:**
The existing `pop-maint-advanced` accordion is referenced nowhere in popup.js (confirmed by ID search — it has no JS interaction). It is CSS-only. Its removal is safe.

**popup.js badge-write audit required:** search for `card-badge-maint` in popup.js and modtools.js to confirm the exact call sites before updating badge IDs. This is the only JS surface touched by this redesign.
