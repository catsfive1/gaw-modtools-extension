# RALPH-W1 — v10.13.0 Wave 1 Read-Only Audit

**Date:** 2026-05-10
**Auditor:** RALPH-W1 (Sonnet, read-only)
**Target commit:** `93e96fc` (v10.13.0)
**Verified against shipped code at:** HEAD `9c7655e` (v10.13.4)
**Spec source:** `docs/V10_DESIGN_V2/DESIGN_V2_SHIPMASTER.md` §5 W1 (L298-325)

---

## 1. Summary

**Verdict: MIXED — 9 of 11 explicit ACs functionally pass, but two material defects ship into v10.13.0 and persist into v10.13.4.** One is a classic fake-green: W1 deleted a *working* `.pop-stat-val` base CSS rule under the false premise it was being clobbered by an L913 rule whose selectors don't actually match `.pop-stat-val` — the same selector-targets-wrong-class anti-pattern W1 explicitly congratulated itself for catching elsewhere. The other is a silently-dropped acceptance criterion (off-grid 8px font-size in modtools.js, 4 sites) that the spec at line 321 explicitly required but the W1 commit message conveniently omitted from its [PASS] list. No cross-wave regressions: W2-W5 left W1's deliverables untouched.

---

## 2. AC Verification Table

| # | Acceptance criterion (spec verbatim) | Actual code state | Verdict |
|---|---|---|---|
| 1 | Stats tab grid is 4-column. | `popup.css:1184-1186` canonical `.pop-stats { grid-template-columns: repeat(4, 1fr) !important; }`. The L2300 standalone override and L54 dead block both removed. Single source of truth. | **PASS** |
| 2 | All 6 local-data tile delta chips render `+N ^` / `-N v` / `=` after second open. | `popup.js:882-903` `_updateStatDelta()` uses sessionStorage `gam_stats_prev_<tile>`. ASCII `^`/`v` arrows (matches spec literal, not `↑↓`). First-open shows blank (correct per spec wording "after second open"); flat shows `=`; up/down direction sets `data-dir` attribute. CSS at popup.css:1969-1971 paints `[data-dir]` with semantic green/red/faint. AI-tile delta wires inside RPC fire-and-forget at popup.js:1026 — only updates when `typeof calls === 'number'` (silently skips on RPC failure, which is the intended fail-soft behavior). | **PASS** |
| 3 | Activity tiles inject sparkline DOM only when 7d data > 0. | `popup.js:911-943` `_injectStatSparkline()` bails on non-array, empty array, all-zero series, missing target, and `max <= 0`. SVG built from sanitized numeric series only. Idempotent — removes prior `.pop-stat-spark` before re-injecting. Wired only for today/msgs/notes tiles at popup.js:1008-1010 (Pending/DR/Banned correctly omitted as roster-state snapshots). | **PASS** |
| 4 | Inline `style="color:..."` removed from all 8 tiles; `data-state` drives color. | `popup.html:73-138` all 8 tiles emit no `style="color"` attribute. Tiles 2-8 carry `data-state="danger\|info\|good\|warn"`; tile 1 (Pending) intentionally has no `data-state` (default white). CSS rules at popup.css:1226-1233 cover both `.value` and `.pop-stat-val` selectors (W1 commit message brags about catching this exact bug). **HOWEVER, see Finding F-1 below — the *base* `.pop-stat-val` font/size/color rule was simultaneously deleted under a false-clobber claim, regressing typographic styling for ALL 8 tiles.** | **PARTIAL** |
| 5 | AI tile drill renders honest empty state ("Per-call log unavailable"). | `popup.js:4829-4850` `__renderAi24()` calls `gamMakeEmpty({ headline: 'Per-call log unavailable', desc: 'AI usage rolls up at the daily snapshot...' })`. `__DRILL_EMPTY_HINT.ai24` at popup.js:4189 also updated. No "coming v10.11" placeholder remaining. | **PASS** |
| 6 | Death Row alert renders SVG warning icon (no skull emoji). | `popup.js:1040-1051` builds inline SVG triangle warning icon via `alert.innerHTML`. Zero occurrences of U+1F480 (`💀`) in popup.html or popup.js (verified via Python codepoint scan, not just escape syntax — would catch raw codepoint as well). Static template, no user content. | **PASS** |
| 7 | Ticker severity weight tiers render at correct 400/500/700. | `modtools.js:22687-22689` splits the formerly-combined `font:` shorthand — `font-size: var(--bb-t-xs) !important; line-height: 1 !important; font-family: var(--bb-font) !important;` — leaving `font-weight` un-`!important`-ed. JS at modtools.js:19984-19986 sets `tickerEl.style.fontWeight` from `_tickerWeightMap = {quiet:400, queue:500, modmail:600, dr:600, sus:700, opdel:700, auto:500}`. CSS-vs-JS battle resolved. | **PASS** |
| 8 | OP_DEL ticker uses `var(--bb-red)` not raw hex. | `modtools.js:19964` `color: 'var(--bb-red, #ff3b3b)'` with literal fallback, matches SUS state above. Zero raw `#ff3b3b` / `#f33` in OP_DEL context. | **PASS** |
| 9 | 4 `Loading...` strings stripped from popup.html diag divs. | `popup.html:870-882` four `#diagSysIdentity / #diagSwHealth / #diagRpcLog / #diagStorage` divs all carry empty `<span></span>`, not literal "Loading...". `wireDiagSkeletons()` IIFE patches skeleton on tab open. Zero `Loading...` strings remain in stats/diag tab DOM (the comment at popup.html:421 referencing "Loading..." is a v10.12 historical comment, not live text). | **PASS** |
| 10 | Off-grid 5px values in popup.css (3 sites) replaced with 4px. | `popup.css:2122` (gap), `2220` (padding), `2581` (padding) all carry `4px /* v10.13.0 W1: 5px -> 4px snap-to-grid (UIUX2-27) */`. Other 5px values (border-radius:5px at L306, gap:5px at L371, padding:1px 5px at L453, etc.) are unrelated to W1 scope. | **PASS** |
| 11a | New tokens declared in popup.css `:root`: `--bb-blue`, `--bb-warn-status`, `--bb-teal`, `--bb-t-stat-md`, `--bb-t-stat-lg`. | `popup.css:961-972` all 5 tokens declared with documented values. `--bb-blue: #4A9EFF`, `--bb-warn-status: #f59e0b`, `--bb-teal: #14b8a6`, `--bb-t-stat-md: 20px`, `--bb-t-stat-lg: 28px`. | **PASS** |
| 11b | New constant `C.TEAL` in modtools.js. | `modtools.js:412` `TEAL: '#14b8a6'` declared in const C block. | **PASS** |
| 11c | "No callsite migration -- schema only" — zero callsites at W1 ship time. | At W1 ship (commit 93e96fc): zero callsites for any of the 6 new tokens. Verified by tracing introduction history: the only current callsites (`popup.css:291` `--tok-banner-warn-rail` and `popup.css:299` `--tok-enc-chip-text`) were introduced by W2 commit `60bf175` — exactly as the spec promised ("W2-W4 incrementally migrate"). `--bb-teal` / `--bb-t-stat-md` / `--bb-t-stat-lg` / `C.TEAL` still have zero callsites at HEAD (genuinely schema-only, awaiting future waves). | **PASS** |
| **Spec L321** | **(Silently dropped)** Off-grid 8px font-size in modtools.js (4 sites) snapped to 9px. | **NOT in W1 commit message [PASS] list. Verification: `modtools.js` at L22929, L23080, L23089 still contain `font: ... 8px ui-monospace ...` shorthand declarations. Spec required snap-to-9px; W1 silently dropped this AC.** | **FAIL** |
| **Spec L323** | Visual QA: open popup, confirm stats tab reads correctly on first open AND re-open. | **Cannot fully verify without runtime — but Finding F-1 (base `.pop-stat-val` rule deleted) means the visual rendering is materially regressed from pre-W1 baseline. The "delta chip diff visible" sub-criterion functionally passes via the wired sessionStorage diff.** | **UNCONFIRMED (FAIL likely)** |

---

## 3. Findings

### F-1 [HIGH] — `.pop-stat-val` base rule deleted under false-clobber claim

**File:** `popup.css:54-60` (W1 deletion site) + `popup.css:1215-1221` (the rule W1 incorrectly claimed was clobbering it)

**Pre-W1 state (commit 93e96fc^, L69-75):**
```css
.pop-stat-val {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  color: #e8eaed;
  letter-spacing: -0.4px;
}
```
This was the **only working** rule that styled `.pop-stat-val` — the actual class emitted by all 8 stat tile values in popup.html.

**W1 commit message (verbatim):**
> "popup.css consolidated dead pre-Bloomberg .pop-stats rule block at L54 (every property was clobbered by L913 with !important; now removed)."

**Reality check at L1215 (the alleged "clobbering" rule):**
```css
.pop-stat .value, .pop-stat-value, .pop-stat-num {
  font: 600 var(--bb-t-xl)/1.1 var(--bb-font) !important;
  color: var(--bb-amber) !important;
  ...
}
```

Selectors: `.pop-stat .value` (no element has `.value`), `.pop-stat-value` (no element has this class), `.pop-stat-num` (no element has this class). **All three selectors are inert** for `.pop-stat-val` — the same bug pattern W1 simultaneously caught and surgically fixed for the `[data-state]` color variants ("would have shipped fake-green").

**Net effect:**
- Pre-W1: `.pop-stat-val` rendered at 20px / weight 700 / `#e8eaed` from the working rule.
- Post-W1: All 8 stat tile values fall through to body-default font (likely 12-13px / weight 400 / inherited color), since no working selector matches `.pop-stat-val`. Bloomberg-style typographic ledger appearance materially regressed.

**Why the W1 agent missed it:** They appear to have read the L913 rule's selector list, seen `.value` etc., and assumed it covered `.pop-stat-val` — exactly the same heuristic mistake their own commit message warns about. Self-aware about the bug pattern, blind to applying it to themselves on the parent rule.

**Suggested fix size: XS** — 1 line change. Update L1215 selector to `.pop-stat .value, .pop-stat-value, .pop-stat-num, .pop-stat-val` OR (cleaner) restore the deleted rule as a separate non-`!important` block at the top of the file. Better: replace the entire L1215 block selector with `.pop-stat-val`-only (remove the dead `.value` legacy aliases).

---

### F-2 [MEDIUM] — Spec acceptance criterion silently dropped

**Spec L321:** "Off-grid 8px font-size in modtools.js (4 sites) snapped to 9px."

**W1 commit message:** This criterion is not in the [PASS] list. The commit message says only "Off-grid 5px values in popup.css (3 sites) replaced with 4px" — the 5px portion. The 8px portion was omitted without explanation.

**Verification at HEAD:**
- `modtools.js:22929` `font:700 8px ui-monospace,monospace;`
- `modtools.js:23080` `font: 700 8px ui-monospace, monospace; letter-spacing: 0.1em;`
- `modtools.js:23089` `padding: 1px 6px; cursor: pointer; font: 600 8px ui-monospace, monospace;`

3 of 4 spec-named sites still 8px (the spec said "4 sites" — I found 3, possibly the agent miscounted, possibly one is a different shorthand variation I missed). Off-grid violation persists.

**Suggested fix size: XS** — 3-4 line replacements (8px → 9px in the matched font: shorthand declarations).

---

### F-3 [LOW] — `_updateStatDelta` AI tile silently skips when RPC fails

**File:** `popup.js:1015-1030`

The AI tile's `_updateStatDelta('ai', calls)` only fires when `r && r.ok && r.data && typeof calls === 'number'`. If the RPC fails, sessionStorage is never updated. Subsequent successful RPC compares against stale prev value from N opens ago.

**Real-world impact:** Minor. The chip will read as "since last successful RPC" rather than "since last open." Not a correctness bug per spec wording.

**Suggested fix size: XS** — 3 lines, optionally call `_updateStatDelta('ai', NaN)` or skip the chip entirely on RPC fail to invalidate stale state. Probably not worth fixing — current behavior is reasonable fail-soft.

---

### F-4 [LOW] — Inert legacy selectors `.value`, `.pop-stat-value`, `.pop-stat-num` left behind

**File:** `popup.css:1215, 1226, 1228, 1230, 1232`

After F-1 is fixed, the `.value`/`.pop-stat-value`/`.pop-stat-num` legacy selectors at L1215 and the `[data-state] .value` selector half of L1226-1232 will still be inert. Dead CSS adds parser cost, harms grep-ability, and increases the cognitive load when reading the file. The W1 agent kept them out of "preserve compat" caution but they were never functional.

**Suggested fix size: XS** — selector cleanup in 5 rule blocks. Pure dead-code removal.

---

### F-5 [LOW] — `valLine.textContent = aiVal` cleanly safe but worth noting

**File:** `popup.js:4835`

`aiVal` derives from `s-ai-today.textContent`, which is set by RPC at popup.js:1024 as `calls + '/' + cap` where both are `typeof === 'number'`-checked. Safe — no XSS surface. Confirmed safe; flagging only because the audit hunt list asks for selector/data-flow trust verification.

**Suggested fix size: N/A** — no fix needed.

---

## 4. Cross-Wave Conflict Check

Diffed `93e96fc..HEAD` for changes touching W1's deliverables:

| Area | Post-W1 changes | Verdict |
|---|---|---|
| `.pop-stats` / `.pop-stat` rules | None added or modified post-W1. W1's grid + tile styling is the canonical state at HEAD. | Clean |
| `--bb-blue`, `--bb-warn-status` | Consumed by W2 at popup.css:291,299 via `--tok-*` aliases. Spec-compliant — "W2-W4 incrementally migrate." | Clean — positive consumption |
| `--bb-teal`, `--bb-t-stat-md`, `--bb-t-stat-lg`, `C.TEAL` | Zero post-W1 callsites. Genuinely schema-only awaiting future waves. | Clean |
| `_updateStatDelta` / `_injectStatSparkline` / `_bin7d` / `__renderAi24` / `dr-alert` / `_tickerWeightMap` | No post-W1 modifications to any of these helpers. W1's wiring is intact at HEAD. | Clean |
| `.gam-bar-ticker` font block | No post-W1 changes — split shorthand still in place. | Clean |
| 5px → 4px sites | No regressions back to 5px. | Clean |

**No cross-wave conflicts.** W2 (Tokens tab), W3 (popovers), W4 (Mod Console + Modmail), W5 (a11y hygiene) all left W1's deliverables untouched. The only post-W1 contact point is W2's positive consumption of W1 schema tokens — exactly as specified.

---

## 5. Recommendations — v10.13.x Hotfix Candidates

Ordered by severity × ease:

1. **[HIGH, XS] Hotfix F-1** — Restore `.pop-stat-val` typographic base rule. Either:
   - Add `.pop-stat-val` to the L1215 selector (one-line change), OR
   - Restore a clean `.pop-stat-val { font-size: var(--bb-t-stat-md); font-weight: 700; ... }` block using the W1 schema tokens (which are otherwise unconsumed — kills two birds: fixes regression, demonstrates token consumption).
   This is the highest-value fix. The pre-W1 stat tiles rendered correctly; the v10.13.0+ stat tiles render with body-default font. Operator-visible regression.

2. **[MEDIUM, XS] Close F-2** — Replace 8px font-sizes in modtools.js at L22929/L23080/L23089 with 9px (or `var(--bb-t-xs)` 10px if dropping to 9px breaks a layout). Either action closes the dropped spec AC.

3. **[LOW, XS] Cleanup F-4** — Remove the `.value`, `.pop-stat-value`, `.pop-stat-num` legacy selectors after F-1 is fixed. Dead CSS hygiene.

4. **[LOW, XS] Optional F-3** — Sweep `gam_stats_prev_ai` from sessionStorage on RPC failure to prevent stale-prev comparison on next success. Marginal correctness improvement; likely not worth the diff weight.

**Bundle suggestion:** F-1 + F-2 + F-4 ship together as v10.13.5 hygiene patch — total diff ~10 lines, all surgical, all closing real W1-shipped defects. F-3 can ride along or defer.

---

## Audit notes

- Full W1 diff reviewed via `git show 93e96fc`.
- Verification target: HEAD (`9c7655e`, v10.13.4) — the shipped state operators run today, not the W1 commit's snapshot.
- Files inspected: `popup.html`, `popup.css`, `popup.js`, `modtools.js`. Per scope, no tests run, no other files touched.
- Unicode codepoint scan (Python `\U0001f480`) used to defend against missed-emoji false negatives from grep-only checks.
- Pre-W1 CSS retrieved via `git show 93e96fc^:popup.css` to ground the F-1 regression claim.
