# UIUX2-25 — Color Semantics Audit
**v10.13 Design Ralph V2 | Cross-cutting**

Scope: `modtools.js` + `popup.css` (dist). Covers the Bloomberg-Terminal dark theme layer (`--bb-*` tokens), the legacy content-script palette (`const C`), and the chip/status system injected into page DOM.

---

## A. Per-Color Meaning Audit

### Color Inventory (canonical tokens)

| Token | Hex | Declared intent in source |
|---|---|---|
| `--bb-amber` / `C.WARN` | `#ff9933` / `#f0a040` | Brand + warn (dual-purpose by design) |
| `--bb-red` / `C.RED` | `#ff3b3b` / `#f04040` | Error, destructive action |
| `--bb-green` / `C.GREEN` | `#44dd66` / `#3dd68c` | Success, healthy state |
| `--bb-cyan` / `C.CYAN` | `#66ccff` | Queue / informational |
| `--bb-purple` / `C.PURPLE` | `#a78bfa` | AI/auto-queue states; lead-mod authority |
| `--bb-yellow` / `C.YELLOW` | `#ffd84d` / `#ffd60a` | Watch-list / data flag |
| `C.BLUE` / `C.ACCENT` (legacy) | `#4A9EFF` | Form inputs, interactive chrome; LEGACY = brand |

**Note:** `--bb-warn` (`#f0a040`) and `--bb-amber` (`#ff9933`) are two distinct hex values for conceptually the same token. The content-script palette uses `#f0a040`; the Bloomberg popup layer uses `#ff9933`. They share the same variable name family but diverge in saturation at two dozen call sites.

---

### Actual usage per color across surfaces

#### AMBER (`--bb-amber`, `C.WARN`, `#ff9933`, `#f0a040`)
Surfaces where amber appears:

| Surface | Usage |
|---|---|
| Header bottom-border | Brand signal (sole header accent) |
| Active tab underline | Brand / navigation selected state |
| Focus ring on inputs | Interactive focus indicator |
| Primary CTA button (popup) | Primary action color |
| Checkbox `accent-color` | Form control |
| Action-row hover in Integrity card | Category hover state |
| Card amber rail (Bloomberg card left border) | Card tier identifier |
| Urgency state on cards (`border-color`) | Alert / urgency escalation |
| Section sub-labels (`--bb-amber-dim`) | Data labeling |
| Status indicator `.pop-maint-action-status.warn` | Warning status |
| `.age.yellow` in maint roster | Age threshold: approaching stale |
| Scrollbar thumb hover | Decorative chrome |
| Empty-state notice icon | Actionable empty state |
| Status bar modmail chip | Incoming modmail alert |
| `--bb-warn` fallback indicator | Fallback mode button |

**Jobs count: 15+.** Amber carries: brand identity, interactive focus, primary actions, warning status, urgency escalation, card category rail, navigation selection, and decorative chrome. This is the single most overloaded color in the system.

---

#### RED (`--bb-red`, `C.RED`, `#ff3b3b`, `#f04040`)

| Surface | Usage |
|---|---|
| Error chip (hard error) | Error/broken state |
| `.pop-token-status.err` | Token validation failure |
| `.pop-drill-pill.banned` / `.ban` | Ban status badge |
| `.pop-drill-pill.ready` | Death Row ready-to-execute |
| Ban button / bulk-ban CTA | Destructive action |
| Danger stat value (`data-state="danger"`) | Stat at threshold |
| Session expired dot | Auth failure |
| Trend down indicator | Metric declining |
| Unread modmail badge (dot) | Notification count |
| `.gam-snack-error` | Error toast |
| Maint reset button | Destructive reset |
| `/ban` page enhancer bar icon | Page context indicator |
| SUS count in status bar chip | Suspicious user alert |
| Death Row element when items ready | Escalated DR state |
| `sev='critical'` severity in content | Critical severity |
| Error state retry CTA | Error recovery |
| Error empty-state icon | Broken state empty |
| Char-count overflow in ModChat | Validation feedback |

**Jobs count: 18.** Red is the most consistent color in the system — virtually every usage maps to "error, failure, destructive action, or critical alert." The single outlier is the unread modmail badge count dot, which is a notification (not an error). Acceptable stretch but worth noting.

---

#### GREEN (`--bb-green`, `C.GREEN`)

| Surface | Usage |
|---|---|
| `.pop-token-status.ok` | Token valid |
| Session OK dot | Auth healthy |
| Trend up indicator | Metric rising |
| `data-state="good"` stat | Healthy stat value |
| `.gam-snack-success` | Success toast |
| `.age.green` maint roster | Fresh / recently active |
| Cleared section in triage | User cleared / no action |
| Regex validation hint "valid" | Input valid feedback |
| Own message sender name in ModChat | Self-identification |
| Divider in cleared-users section | Visual separator |
| `.pop-maint-action-status.ok` | Action succeeded |
| Success empty-state CTA | Onboarding complete |

**Jobs count: 12.** Green is well-focused: success, health, validity, positive trend. The "own message sender name" usage (ModChat) is cosmetic self-identification, not a status signal — minor semantic stretch but not harmful.

---

#### CYAN (`--bb-cyan`, `C.CYAN`)

| Surface | Usage |
|---|---|
| Queue count chip in status bar | Live queue depth |
| `data-state="info"` stat value | Informational stat |
| `.gam-snack-info` | Info toast |
| Onboarding empty-state icon | First-run / guidance |
| `.cat-probe` category head | Probe action category |
| Action-row hover in Probes card | Probe hover state |
| Maint roster `.name` (popup layer) | User display name |
| Drill-down pill `.pending` | Pending modmail status |
| Pagination / "view recent" links | Navigation links |
| External-link chip style | External resource indicator |

**Jobs count: 10.** Cyan has two distinct jobs: (1) informational / probe-tier status and (2) interactive navigation links. These are related but not identical. The maint roster using cyan for user display names is the weakest fit — it reads as "info" but the intent seems to be "clickable/link."

---

#### PURPLE (`--bb-purple`, `C.PURPLE`)

| Surface | Usage |
|---|---|
| `.cat-detect` category head | AI-detection action category |
| AI detection card badge | AI-generated indicator |
| Action-row hover in Detect card | AI-detect hover state |
| `.pop-drill-pill.dr` | Death Row queue status |
| Death Row stat value (when not ready) | DR pending count |
| Lead card amber rail override (card) | Lead-mod authority tier |
| Lead card title color | Lead-mod authority tier |
| Lead input field accent | Lead-exclusive field |
| `.gam-ctx-item--lead` (context menu) | Lead-mod menu item |
| Broadcast message left border | ModChat broadcast |
| `gam-mc-conv-name.gam-mc-all` | "All mods" broadcast thread |
| `gam-mc-msg-to-all` | Broadcast recipient label |
| Death Row log type icon | DR log entry marker |
| Auto-queue chip in status bar | Auto-queue active |

**Jobs count: 14, across 2 fundamentally different domains:**
- **AI/automation** (AI-detect category, AI badge, auto-queue, broadcast)
- **Lead-mod authority** (lead card, lead inputs, lead context item, lead chat thread)

These two jobs share purple but mean different things. "This action was taken by an AI" and "this is a lead-mod privileged surface" are not the same semantic. A lead mod is a human authority tier; AI is a machine automation tier. They collide in purple.

---

#### YELLOW (`C.YELLOW`, `#ffd60a`, `--bb-yellow`)

| Surface | Usage |
|---|---|
| "Watching" stat value (triage) | Watch-list count |
| Section color for "watching" segment | Watch-list grouping |
| Watch badge/pill on user rows | User is watched |
| Pattern field monospace text | DR rule pattern display |
| Bulk "watch" batch button | Batch watch action |
| ModChat "watch" pill | ModChat watched status |
| Inline watched indicator | Inline status chip |
| `.age.yellow` approaching stale | Age warning threshold |
| Modchat Lead conversation name | Lead mod in chat |
| `sev='danger'` (mid-severity) | Mid-severity alert |
| Eye icon in log (observation type) | Observation log entry |

**Jobs count: 11, two distinct domains:**
- **Watch-list / surveillance** (watching users, DR patterns, observation log)
- **Lead-mod identity in ModChat** (`.gam-mc-lead` = yellow)

The lead-mod identity usage is a conflict: purple owns lead-mod authority everywhere else, but ModChat uses yellow for lead convos. This is a direct intra-codebase contradiction. Purple = lead on cards/inputs; yellow = lead in chat.

---

#### BLUE / ACCENT (`C.BLUE`, `C.ACCENT`, `#4A9EFF`)

| Surface | Usage |
|---|---|
| Form input focus border | Interactive focus (new intent) |
| ModChat title / active tab / send button | Navigation chrome |
| "Unreviewed" stat (triage) | Neutral count |
| Links / "view recent" (some surfaces) | Navigation link |
| LEGACY brand (pre-amber migration) | Deprecated brand role |
| Info snack (content-script layer) | Info toast (content layer only) |
| Shadow-armed outline | Keyboard-armed shadow action |

Blue is in migration. The comment at line 367-368 documents the intended split: `C.AMBER` for brand, `C.BLUE` for form chrome. However, ~20 call sites still use `C.ACCENT` (the alias) for brand-surface coloring in ModChat — title, active tab, send button — making the migration incomplete. The old semantic (brand) and new semantic (form input) coexist unresolved.

---

## B. Drift Cases — Overloaded Colors

### B.1 AMBER: 15+ jobs (critical overload)

Amber is simultaneously:
1. **Brand identity** (header border, active tab underline)
2. **Interactive focus** (input focus ring, checkbox)
3. **Primary action** (CTA button)
4. **Warning status** (`.warn` status, fallback mode indicator)
5. **Category identity** (Integrity card hover rail)
6. **Urgency escalation** (card urgent state border)
7. **Navigation selection** (active tab)
8. **Decorative chrome** (scrollbar thumb)

The brand+warn collision is the most damaging. When a mod sees amber on a card border, it could mean "Bloomberg brand chrome" or "this item is urgent/warning." The system relies on context to disambiguate, but context fails when components are viewed in isolation (e.g., in a panel summary with no adjacent brand elements).

### B.2 PURPLE: Two incompatible domains

Purple means:
- **AI/automation** (AI-detect card, AI badge, auto-queue chip, broadcasts)
- **Lead-mod authority** (lead card rail, lead inputs, lead context items)

These are orthogonal. A lead mod taking a manual action vs. the system auto-queuing a user are completely different events. Using one color for both trains mods to misread authority signals.

### B.3 YELLOW: Lead identity contradiction with PURPLE

Purple = lead authority on all card/form surfaces. Yellow = lead identity in ModChat (`.gam-mc-lead`). A lead mod opening the chat panel sees their conversations highlighted in yellow; opening the lead card they see purple. Same entity, two colors, zero semantic justification.

### B.4 BLUE/ACCENT: Incomplete migration

`C.ACCENT` (= `C.BLUE` = `#4A9EFF`) retains brand duties in ModChat while being designated for form-chrome only in the v10 plan. Every `C.ACCENT` call site that isn't a form input or focus ring is technical debt emitting the wrong signal.

### B.5 WARN vs AMBER: Two tokens, one concept, different hex values

`--bb-warn` (`#f0a040`) and `--bb-amber` (`#ff9933`) are both "amber/orange" but differ in saturation. Content-script surfaces use `#f0a040`; popup surfaces use `#ff9933`. The visual difference is subtle but measurable, and it means "the same warning concept" has two different rendered colors depending on which surface the mod is looking at.

---

## C. Proposed Semantic Map

Design principle: **one color = one job at the semantic level.** Brand chrome is structural, not a semantic color. The system needs to resolve the amber multi-job problem by separating brand chrome from warning status.

```
COLOR        HEX (popup / content-script)   SINGLE SEMANTIC JOB
------------ ------------------------------ -------------------------------------------------
AMBER        #ff9933 / #f0a040             BRAND CHROME ONLY
             (--bb-amber / C.WARN)          Tab underline, card rail, focus ring, header border,
                                            checkboxes, primary button. NOT warning status.

RED          #ff3b3b / #f04040             ERROR + DESTRUCTIVE + CRITICAL ALERT
             (--bb-red / C.RED)            Error states, destructive actions, ban, session fail,
                                           critical severity, stat danger. (current: already clean)

GREEN        #44dd66 / #3dd68c             SUCCESS + HEALTHY + VALID
             (--bb-green / C.GREEN)        Success toasts, valid inputs, healthy stats, cleared
                                           users, positive trends. (current: already clean)

CYAN         #66ccff                       INFORMATIONAL + PROBE TIER
             (--bb-cyan / C.CYAN)          Info toasts, probe-category actions, queue depth chip,
                                           onboarding guidance, informational stats.
                                           NOT navigation links (links get blue).

PURPLE       #a78bfa                       AI / AUTOMATION ONLY
             (--bb-purple / C.PURPLE)      AI-detect badge, auto-queue, shadow-queue events,
                                           AI analysis card. NOT lead-mod authority.

YELLOW/GOLD  #ffd84d / #ffd60a            WATCH-LIST + SURVEILLANCE TIER
             (--bb-yellow / C.YELLOW)      Watched users, watch badges, DR patterns, observation
                                           logs, watch action buttons.

TEAL (NEW)   #14b8a6 (proposed)           LEAD-MOD AUTHORITY
             (--bb-teal, new token)        Lead card rail, lead inputs, lead context items,
                                           lead mod in ModChat, lead-specific actions.
                                           Replaces purple (lead) and yellow (chat lead).

BLUE         #4A9EFF                      INTERACTIVE CHROME + NAVIGATION LINKS ONLY
             (--bb-blue / C.BLUE)         Form input focus, links, ModChat send button, nav
                                           hover states. NOT brand. NOT info toasts (use cyan).

WARN-ORANGE  #f59e0b (proposed)           WARNING / THRESHOLD BREACHED STATUS
             (--bb-warn-status, new)      Status badges only: .warn status chips, .age.yellow
                                           (approaching stale), fallback mode indicator, mid-severity
                                           alerts, modmail attention chip.
                                           This is the COLOR THAT AMBER SHOULD NOT BE DOING.
```

**The core resolution:** split amber into two roles with two tokens:
- `--bb-amber` stays as brand chrome (structural, non-semantic)
- `--bb-warn-status` (`#f59e0b`) becomes the dedicated warning-status color

`#f59e0b` is distinguishable from `#ff9933` in context and well-understood as "warning" in system UI conventions.

---

## D. Per-Surface Remediation

### D.1 Status bar chips (`modtools.js` ~line 19066-19085)

Current:
```
queue chip:     cyan      -- CORRECT (informational/queue)
modmail chip:   amber     -- WRONG (amber = brand; this is an alert)
sus chip:       red       -- CORRECT (danger)
auto-queue chip: purple   -- CORRECT (AI/automation)
```

Remediation: change modmail chip from `--bb-amber` to `--bb-warn-status`. It's an attention alert, not brand chrome.

### D.2 Maintenance action categories (popup.css ~line 1726-1747)

Current:
```
cat-probe:     cyan       -- CORRECT (probe tier)
cat-detect:    purple     -- CORRECT (AI/automation tier)
cat-integrity: amber      -- PROBLEM (amber = brand, not integrity tier)
```

Remediation: Integrity tier needs its own color. Options:
- Assign `--bb-warn-status` to integrity (integrity checks are threshold/warning-level actions)
- Or introduce `--bb-teal` if integrity = human-authoritative action tier

Decision point for Commander: is "integrity" closer to "warning/threshold" or "human authority"? If warning, use warn-orange. If authority, use teal.

### D.3 Lead-mod surfaces

Current inconsistency:
- Lead card rail, lead inputs, lead context menu: **purple** (`#a78bfa`)
- Lead mod in ModChat: **yellow** (`#ffd60a` via `C.YELLOW`)

Remediation: standardize to `--bb-teal` (#14b8a6) for all lead-mod surfaces. Change:
- `popup.css` line 1495-1498 (lead card rail): `--bb-teal` replaces `--bb-purple`
- `popup.css` line 1530 (lead card title): `--bb-teal`
- `popup.css` line 1269, 1280-1281 (lead input accent): `--bb-teal`
- `modtools.js` line 15836 (`.gam-mc-lead`): `C.TEAL` replaces `C.YELLOW`
- `modtools.js` line 20785 (`.gam-ctx-item--lead`): `C.TEAL` replaces `#a78bfa`

After this, purple is free to be purely AI/automation with no lead ambiguity.

### D.4 Warning status indicators

Amber currently used for warning status (must move to `--bb-warn-status`):
- `.pop-maint-action-status.warn` (popup.css line 1780)
- `.age.yellow` warning tier (popup.css line 1068 — already uses `--bb-amber`)
- `gam_maint_warning` chip (popup.css line 633-634)
- Fallback mode button indicator (`modtools.js` line 18897)
- `sev='danger'` mid-severity in error rendering (`modtools.js` line 11475)
- `--bb-warn: #f0a040` in token status `.warn` (popup.css line 910)

All of these carry "something is wrong but not critical" meaning. They should use `--bb-warn-status`, not `--bb-amber`.

### D.5 ModChat info toast and ACCENT migration

`C.ACCENT` is used for `.gam-snack-info` (info toast background). The new map assigns cyan to informational toasts. Remediation: change `.gam-snack-info` from `C.ACCENT` / `#4A9EFF` to `--bb-cyan`. Done in one line in `modtools.js` at the snack CSS injection point (~line 20011).

Remaining `C.ACCENT` call sites in ModChat (title, send button, active tab, hover states) are interactive chrome — correct assignment under the new map (blue = interactive chrome). No change needed there once the alias is fully understood as "blue, not brand."

### D.6 Death Row pill (purple)

`.pop-drill-pill.dr` uses purple. Under the new map, purple = AI/automation. Death Row is a human-initiated watchlist queue — not AI. This pill should use yellow (watch/surveillance tier) since DR is effectively an extended-watch queue pending ban decision.

Change `.pop-drill-pill.dr` to `C.YELLOW` / `--bb-yellow`.

### D.7 `--bb-warn` vs `--bb-amber` hex unification

Before adding `--bb-warn-status`, unify the two amber hex values:
- `--bb-amber: #ff9933` (popup layer)
- `C.WARN: #f0a040` (content-script layer)

Decision: pick one. `#ff9933` is more saturated and visible. Update `C.WARN` to `#ff9933` across the content-script C palette, or accept the split as a layer boundary (popup vs. page-injected CSS). The latter is defensible if both tokens clearly mean "brand amber" post-migration.

---

## E. Effort Estimate

| Remediation | Files | Estimated lines changed | Risk |
|---|---|---|---|
| Add `--bb-warn-status` token to CSS vars | popup.css | ~5 | Low |
| Add `C.TEAL` to const C, `--bb-teal` token | modtools.js, popup.css | ~8 | Low |
| Move modmail status chip: amber -> warn-status | modtools.js | ~1 | Low |
| Move all `.warn` status indicators to warn-status | popup.css, modtools.js | ~8 | Low |
| Lead surfaces: purple -> teal (card, inputs, context) | popup.css, modtools.js | ~10 | Medium |
| Lead ModChat: yellow -> teal | modtools.js | ~2 | Low |
| Integrity cat: amber -> warn-status or teal (TBD) | popup.css | ~2 | Low |
| DR pill: purple -> yellow | popup.css | ~1 | Low |
| Info toast: blue -> cyan | modtools.js | ~1 | Low |
| Unify `C.WARN` hex with `--bb-amber` | modtools.js | ~1 | Low |
| **Total** | | **~39 lines** | **Medium overall** |

No structural changes. Every item is a token swap. The highest risk is the lead-surface change (teal) because it touches the lead card UI which has visual tests in prior UAT docs — regression-check those surfaces after change.

**One Commander decision needed before D.2 can close:** is the Integrity action category "warning-tier" (warn-orange) or "human-authority-tier" (teal)?

---

## Summary

The system is well-structured with documented intent but amber is doing 15+ jobs and purple is split across two incompatible domains. Red and green are clean and need no changes. The fix is surgical: two new tokens (`--bb-warn-status`, `--bb-teal`), ~39 line changes across two files, and one architectural decision on the Integrity category color. All other colors tighten to their correct lane once amber's warning duty is offloaded and purple's lead duty is handed to teal.
