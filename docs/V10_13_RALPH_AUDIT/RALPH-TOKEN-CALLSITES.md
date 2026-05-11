# RALPH-TOKEN-CALLSITES — Token-system migration state across v10.13

**Repo:** `D:\AI\_PROJECTS\modtools-ext\`
**HEAD audited:** `9c7655e` (v10.13.4 WAVE 4 — FINAL v10.13 wave)
**Compared against:** `cff7e94` (v10.12.4 — last commit before v10.13 wave-train)
**Earlier baseline:** UIUX2-23 cohesion audit snapshot (entered v10.13 cycle citing 175 unique hex)
**Auditor:** RALPH-TOKEN-CALLSITES (read-only)
**Scope:** `popup.css` + `modtools.js` + `popup.js` + `popup.html`
**Mode:** READ-ONLY. No code modified. No git ops.

---

## Summary — Delta from v1 / UIUX2-23 baseline

**The W1 schema-only contract held strictly. All 5 declared tokens (`--bb-blue`, `--bb-warn-status`, `--bb-teal`, `--bb-t-stat-md`, `--bb-t-stat-lg`) are present in `:root`. Two are wired into a small W2/W3 token-banner subsystem via `--tok-*` indirection wrappers. Three (`--bb-teal`, `--bb-t-stat-md`, `--bb-t-stat-lg`) plus the entire `--bb-motion-*` tier and the `C.AMBER_BG/GLOW/WARM/COOL` const-C entries are completely orphaned.**

**Meanwhile, the underlying drift got worse**, not better. v10.13's 5-wave content sweep added new features (Tokens tab three-state, Mod Console keyboard, Macros v2, popover fixes pack) without touching the legacy color/spacing/motion debt — and added new hardcoded hex values along the way. Total unique hex went **220 → 230 (+10)** vs v10.12.4. Raw `#ff9933` in modtools.js went **63 → 71 (+8)**. Inline `cssText =` injection sites went **188 → 205 (+17)**.

**One-line verdict:** v10.13 was a feature-shipping cycle. The token system grew (one new key in const C, five new schema tokens) but the migration sweep deferred from v10.11 has now been deferred again to v10.14. UIUX2-23 phases 1–5 remain unexecuted in their originally-named form.

---

## Metrics — before/after

All counts sourced from raw greps over the named file at the named commit. "v1" = UIUX-03 baseline figures cited inside UIUX2-23 §A.1. "Audit snapshot" = the v10.13 figures UIUX2-23 §A.3 reported when written. "v10.12.4" = `git show cff7e94:<file>`. "v10.13.4" = working-tree HEAD.

| # | Metric | v1 baseline | UIUX2-23 audit snapshot | v10.12.4 | v10.13.4 | Δ vs v10.12.4 | Δ vs UIUX2-23 |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | Combined unique hex (4 files) | ~155 | 175 | 220 | **230** | **+10** | **+55** |
| 2 | popup.css unique hex | 39 | 43 | 43 | **51** | +8 | +8 |
| 3 | modtools.js unique hex | ~135 | ~155 | 175 | **177** | +2 | +22 |
| 4 | popup.js unique hex | n/a | n/a | 87 | **84** | -3 | n/a |
| 5 | const C key count | 12 | 35 | 36 | **37** | +1 | +2 |
| 6 | popup.css `--bb-*` token count (declared) | ~30 | 57 | 57 | **62** | +5 | +5 |
| 7 | `C.ACCENT` callsites in modtools.js | n/a | 90 | 81 | **81** | 0 | -9 (\*) |
| 8 | `C.AMBER` callsites in modtools.js (excl. const-def) | 0 | 0 | 0 | **0** | 0 | 0 |
| 9 | `C.BLUE` callsites in modtools.js (excl. const-def) | 0 | 0 | 0 | **0** | 0 | 0 |
| 10 | `C.TEAL` callsites in modtools.js | 0 | n/a | 0 | **0** | 0 | 0 |
| 11 | `C.AMBER_BG/GLOW/WARM/COOL` callsites | 0 | 0 | 0 | **0** | 0 | 0 |
| 12 | `transition:` declarations in popup.css | n/a | 22 | 22 | **26** | +4 | +4 |
| 13 | `transition:` declarations in modtools.js | n/a | n/a | n/a | **106** | n/a | n/a |
| 14 | `var(--bb-motion-*)` callsites — popup.css | 0 | 0 | 0 (\*\*) | **0** (\*\*) | 0 | 0 |
| 15 | `var(--bb-motion-*)` callsites — modtools.js | 0 | 0 | 0 (\*\*) | **0** (\*\*) | 0 | 0 |
| 16 | Raw `#ff9933` in modtools.js | n/a | 85 | 63 | **71** | **+8** | -14 |
| 17 | Raw `#f0a040` in modtools.js | n/a | 12 | 12 | **12** | 0 | 0 |
| 18 | Raw `#E8A317` in modtools.js | n/a | 9 | 9 | **9** | 0 | 0 |
| 19 | Raw `#ff9933` in popup.css | n/a | 3 | 3 | **9** | **+6** | +6 |
| 20 | Raw `#f0a040` in popup.css | n/a | 3 | 3 | **5** | +2 | +2 |
| 21 | `rgba(255,153,51,…)` in modtools.js | n/a | 7 | n/a | **7** | n/a | 0 |
| 22 | `rgba(240,160,64,…)` in modtools.js | n/a | 27 | n/a | **22** | n/a | -5 |
| 23 | `rgba(255,176,0,…)` in popup.css | n/a | 1 | n/a | **2** | n/a | +1 |
| 24 | Raw `#4A9EFF` in popup.css | n/a | 16 | 15 | **14** | -1 | -2 |
| 25 | Raw `#4A9EFF` in modtools.js | n/a | ~14 | 31 | **31** | 0 | +17 |
| 26 | Hardcoded `6px` in popup.css | n/a | 30+ | 39 | **41** | +2 | +11 |
| 27 | `var(--bb-amber)` callsites in popup.css | n/a | 67 | 46 | **52** | +6 | -15 |
| 28 | `var(--bb-warn)` callsites in popup.css | n/a | 14 | 14 | **16** | +2 | +2 |
| 29 | `.cssText =` injection sites in modtools.js | n/a | 188 | 188 | **205** | **+17** | **+17** |
| 30 | W1 declared tokens with ANY callsite | n/a | n/a | 0 | **2** of 5 | +2 | n/a |

(\*) The `C.ACCENT` count drop from 90 → 81 between UIUX2-23-snapshot and v10.12.4 reflects edits inside v10.12.x that the audit doc didn't catch. The count has been **flat at 81 across v10.12.4 → v10.13.4** — no migration occurred.

(\*\*) v10.12.4 popup.css and modtools.js each contain 4 `bb-motion` matches, but those are the four `:root` declarations — zero `var(--bb-motion-*)` consumer references in either file. Same in v10.13.4.

### W1 schema-only token call-graph (the 5 tokens W1 declared)

| W1 token | Declared in popup.css | Indirect-via-`--tok-*` consumers | Direct `var(--bb-*)` consumers | True orphan? |
|---|---|---|---|---|
| `--bb-blue` | yes (L961) | 1 (`--tok-enc-chip-text` at L299, used at L455) | 0 | **No** — alive via 1-step indirection |
| `--bb-warn-status` | yes (L962) | 1 (`--tok-banner-warn-rail` at L291, used at L411/426/434/461) | 0 | **No** — alive via 1-step indirection |
| `--bb-teal` | yes (L963) | 0 | 0 | **YES — fully orphaned** |
| `--bb-t-stat-md` | yes (L971) | 0 | 0 | **YES — fully orphaned** |
| `--bb-t-stat-lg` | yes (L972) | 0 | 0 | **YES — fully orphaned** |

Three of the five tokens W1 declared have **zero references anywhere in the codebase** outside their declaration line. The 5-new-tokens / 5-waves-of-code split produced 0 net callsite migrations for the structural token plan UIUX2-25 and UIUX2-26 mapped out.

---

## Findings

### F1. Schema-only contract held — strictly. Migration deferred again.

W1's declared scope was schema-only. That contract held. No wave migrated existing legacy callsites to the new tokens. The W2 token-banner subsystem (`--tok-banner-*`, `--tok-enc-chip-*` aliases at popup.css L284–L299) is the **only** consumer that fills any of the new tokens, and it does so through a one-level indirection: `--tok-banner-warn-rail` falls back to `var(--bb-warn-status, #f59e0b)`. That indirection means W2 introduced its **own new wrapper layer** (~10 `--tok-*` aliases, ~13 callsites) instead of using `--bb-warn-status` directly.

Net effect: `--bb-blue` and `--bb-warn-status` have any user only because the W2 token-banner CSS wraps them. Strip the W2 banner layer and both go to zero callsites.

### F2. The metric drift got WORSE during the v10.13 wave-train.

Between v10.12.4 and v10.13.4:

- Combined unique hex grew **+10** (220 → 230). UIUX2-23 §A.1 said "v1 was 155, today is 175." Reality is 230 today.
- Raw `#ff9933` in modtools.js grew **+8** (63 → 71). UIUX2-23 §F flagged this as MEDIUM priority for normalization. v10.13 added 8 more of them.
- Raw `#ff9933` in popup.css grew **+6** (3 → 9). The "3 raw leaks" UIUX2-23 §B.1 flagged tripled.
- Raw `#f0a040` in popup.css grew **+2** (3 → 5).
- Hardcoded `6px` in popup.css grew **+2** (39 → 41). UIUX2-27 declared 5/6/7/9/10/11 off-grid; this metric has been moving up not down.
- `rgba(255,176,0,…)` "rogue amber" in popup.css grew **+1** (1 → 2). UIUX2-23 flagged "1 new rogue"; we now have 2.
- `transition:` declarations in popup.css grew **+4** (22 → 26) and **all 4 new ones are hardcoded ms** (none use `--bb-motion-*`). UIUX2-24 §A flagged 0% adoption; v10.13 added 4 fresh hardcoded transitions on top of that 0%.
- `.cssText =` injection sites grew **+17** (188 → 205). UIUX2-23 §B.4 called these "the editorial debt that blocks token resolution." v10.13 added 17 new ones.

The **only** metrics that improved are: `rgba(240,160,64,…)` in modtools.js (-5, but in real terms an unrelated cleanup elsewhere), `#4A9EFF` in popup.css (-1), and `popup.js` unique hex (-3, also an unrelated cleanup).

### F3. const C grew by exactly 1 key, but no callsites for the new families.

v10.12.4 had 36 const-C keys. v10.13.4 has 37 (one new key — search did not isolate which; const-C definitions are stable across major v10.10.1 → v10.13.4, suggesting one minor addition in v10.13 wave-2 or wave-3 work). The four explicit aliases that v10.10.1 introduced — `C.AMBER_BG`, `C.AMBER_GLOW`, `C.AMBER_WARM`, `C.AMBER_COOL` — remain at **zero call-sites across the entire codebase** through v10.13.4. The same holds for `C.AMBER` (only its declaration line) and `C.BLUE` (only its declaration line). Five waves of feature work shipped without using any of the new const-C aliases — the 80-call-site amber-normalization sweep UIUX2-23 §D-Phase-4 named was deferred.

### F4. `C.ACCENT` callsites moved from 90 → 81 to 81 → 81. Migration is now zero-progress for two cycles.

UIUX2-23 §A.3 reported 90 `C.ACCENT` callsites in the snapshot. v10.12.4 actual: 81. v10.13.4 actual: 81. The discrepancy between UIUX2-23's "90" and the measured 81 is most likely the snapshot used a different counting rule (regex including comments/strings vs. live identifier references). Regardless of source-of-truth, **the count did not change across v10.13's 5 waves.** The phase-3 brand-site `C.ACCENT → C.AMBER` migration UIUX2-23 §D enumerated (~18 sites) has not been started.

### F5. `--bb-motion-*` token tier remains 0% adopted. Hardcoded ms grew.

`--bb-motion-{instant,fast,base,slow}` are declared in BOTH popup.css (L2807-2810) AND modtools.js (L23050-23053 inside GAM_CSS). That is **two separate declarations** of the same four tokens, in two surfaces. Neither surface has a single `var(--bb-motion-*)` callsite. v10.13 added 4 more hardcoded transitions to popup.css (now 26) and the modtools.js side has 106 hardcoded transitions. The motion-token system identified by UIUX2-24 has accumulated more debt, not less.

### F6. The Bloomberg/content-script amber-hex split persists with growth on both sides.

Two different "amber" hex values continue to coexist:
- `#ff9933` (popup `--bb-amber`, const C `AMBER`) — popup.css ref count: 52 via var, 9 raw. modtools.js: 71 raw.
- `#f0a040` (popup `--bb-warn`, const C `WARN`) — popup.css ref count: 16 via var, 5 raw. modtools.js: 12 raw.
- `#E8A317` (const C `AMBER_COOL`, no popup token) — popup.css: 0. modtools.js: 9 raw.

The UIUX2-25 §D.7 hex-unification decision ("pick one") was not made. v10.13 added 2 more popup.css raw `#f0a040` leaks and 8 more modtools.js raw `#ff9933` sites. The 4-amber problem UIUX2-23 §B.1 named has stayed at 4 by hex but the **call-site count for raw forms** continues to grow.

### F7. Four hidden orphan tokens (declared, zero use anywhere).

| Token | Surface | Declared at | Callsites | Outcome |
|---|---|---|---|---|
| `--bb-teal` | popup.css | L963 | 0 direct, 0 indirect | **Orphan** |
| `--bb-t-stat-md` | popup.css | L971 | 0 | **Orphan** |
| `--bb-t-stat-lg` | popup.css | L972 | 0 | **Orphan** |
| `C.AMBER_BG`, `C.AMBER_GLOW`, `C.AMBER_WARM`, `C.AMBER_COOL` | modtools.js | L394–L420 (block) | 0 each | **Orphan** (4 keys) |

Total orphans: 7 declared symbols (3 CSS tokens + 4 const-C keys) with zero usage, accumulating across v10.10.1 → v10.13.4. They occupy schema slots, signal intent, and pay nothing back.

### F8. `cssText =` injection has grown +17 sites — the wrong direction.

UIUX2-23 §B.4 explicitly flagged 188 `.cssText =` sites as "editorial debt" — the layer that blocks token resolution because each one inlines a style string at JS-render time. v10.13.4 has 205. Five waves of feature work added 17 new inline-style injection sites instead of refactoring toward classes + tokens. Wave 4 in particular ("Mod Console keyboard + Modmail criticals + Macros v2") is the most likely contributor; macro editor and modmail UI both inject heavy inline styles per UIUX2-26 §A finding.

---

## Recommendations — v10.14 priorities

The original UIUX2-23 phase plan (Phase 1: add `--bb-blue` token / Phase 2: tokenize popup.css / Phase 3: brand `C.ACCENT → C.AMBER` / Phase 4: cssText amber normalization / Phase 5: UIUX2-25 semantic split) is **still the right plan**. v10.13 partially executed Phase 1 (the tokens are declared) without executing 2, 3, 4, or 5. Resume from there.

### P0 — Wire the orphan tokens already declared

**Effort: 1 session. Risk: Low. Visual change: only on the small W2 banner subsystem, no broader impact.**

- Remove `--bb-teal`, `--bb-t-stat-md`, `--bb-t-stat-lg` declarations OR wire them. If kept unused, they are documentation lies — the schema claims teal/stat-tokens exist but no callsite reaches them. Cheapest fix: delete the three orphan declarations; let UIUX2-25 Phase 5 reintroduce them as a single atomic change when their consumers also ship.
- Same call for `C.AMBER_BG`, `C.AMBER_GLOW`, `C.AMBER_WARM`, `C.AMBER_COOL` — orphaned for ~4 cycles. Either wire (Phase 4 amber normalization, see P2) or delete.

### P1 — Phase 2 (popup.css raw `#4A9EFF` → `var(--bb-blue)`)

**Effort: 0.5 session. Risk: Low. 14 line changes, all form-interactive.**

`--bb-blue` is declared, the indirection wrapper for the W2 banner exists, but the 14 raw `#4A9EFF` sites in popup.css still bypass it. Mechanical search-replace; no visual change. Closes the schema-vs-callsite gap on `--bb-blue` and gives Phase 3 (the brand split) a clean substrate.

### P2 — Phase 4 (cssText amber normalization)

**Effort: 1 session. Risk: Low. ~80 line changes in modtools.js cssText/innerHTML strings.**

Three search-replace runs:
- `'#ff9933'` → `C.AMBER` (71 sites)
- `'#f0a040'` → `C.WARN` (12 sites)
- `'#E8A317'` → `C.AMBER_COOL` (9 sites)

This wires up `C.AMBER_COOL` (currently orphan), centralizes amber logic on the const, and makes any future amber tweak a single-const change. Lower risk than Phase 3 because pure refactor (visual parity, no semantic shift). Best to do BEFORE Phase 3.

### P3 — Phase 3 (brand-site `C.ACCENT → C.AMBER`, ~18 sites)

**Effort: 1 session. Risk: Medium — visual change. Requires QA pass.**

Apply UIUX2-23 §C heuristic. The 18 brand-role sites (`gam-bar-brand`, `gam-t-brand`, `gam-c5-mod`, etc.) shift from `#4A9EFF` to `#ff9933`. This is the visible cohesion fix the v1 audit was asking for. Side-effect: the remaining ~63 `C.ACCENT` callsites all settle into the form-chrome bucket, justifying the eventual `C.ACCENT` → `C.BLUE` rename.

### P4 — Stop the bleed in v10.14 wave work

**Effort: process change. Risk: None.**

Add a build/CI assertion that:
- Raw `#ff9933` / `#f0a040` / `#E8A317` may not appear in NEW lines (existing lines grandfathered until P2 ships).
- Raw `#4A9EFF` may not appear in NEW popup.css lines.
- New `transition:` declarations in popup.css must reference `var(--bb-motion-*)`.
- New `.cssText =` blocks > 50 chars trigger a warning recommending class-based approach.

Without this, any v10.14 feature work will continue accumulating debt while the migration sweep runs concurrently — the lesson of v10.13.

### P5 — UIUX2-25 semantic split (defer to v10.15)

`--bb-warn-status` is declared and consumed by W2 (good). UIUX2-25's full semantic split (lead-mod purple → teal, ModChat lead yellow → teal, integrity amber → warn-status, DR pill purple → yellow, etc.) is ~39 line changes per UIUX2-25 §E. Best executed as a single atomic visual change after P0–P3 stabilize the substrate. Defer.

### P6 — UIUX2-24 motion adoption (parallel-track to P3)

The 26 popup.css transitions and 106 modtools.js transitions need a one-shot search-replace pass to swap to `var(--bb-motion-*)` per UIUX2-24 §E.1. Low risk (all motion changes within JND). Can run concurrently with P1–P3 as it touches different lines.

---

## Source-of-truth reproducibility

All counts in the metrics table are reproducible by running:

```bash
cd D:\AI\_PROJECTS\modtools-ext

# combined unique hex (line 1):
(cat popup.css modtools.js popup.js popup.html | \
  grep -oEh '#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{3}\b' | \
  tr 'A-F' 'a-f' | sort -u | wc -l)

# C.ACCENT (line 7):
grep -cE 'C\.ACCENT' modtools.js

# orphan check on tokens (lines in F7):
grep -cE 'var\(--bb-teal' popup.css modtools.js
grep -cE 'var\(--bb-t-stat' popup.css modtools.js

# raw amber drift (lines 16, 19):
grep -ciE '#ff9933' modtools.js
grep -ciE '#ff9933' popup.css
```

To reproduce v10.12.4 baseline: `git show cff7e94:popup.css | …` (etc.).

---

**End of audit. No code modified. No git ops performed.**
