# V11_R2_PLAN — Opus CTO Synthesis (Round 2)

**Author:** Opus (Lead, 6-cat senior-dev brainstorm)
**Date:** 2026-05-08 (PM)
**Inputs:** [V11_R2_CAT1_BACKEND.md](V11_R2_CAT1_BACKEND.md), [V11_R2_CAT2_DATABASE.md](V11_R2_CAT2_DATABASE.md), [V11_R2_CAT3_UX_UI.md](V11_R2_CAT3_UX_UI.md), [V11_R2_CAT4_USABILITY.md](V11_R2_CAT4_USABILITY.md), [V11_R2_CAT5_METRICS.md](V11_R2_CAT5_METRICS.md), [V11_R2_CAT6_ADOPTION.md](V11_R2_CAT6_ADOPTION.md)
**Baseline:** Round 1 = [V11_PLAN.md](V11_PLAN.md) (AM, 30 items, 4 waves). Round 2 = 170+ items across 6 senior-dev disciplines. This document is the binding synthesis.

---

## A) EXECUTIVE SUMMARY

The morning's 3 cats (CMS audit / UX flows / team intel) produced a feature-correct roadmap. Round 2's 6 discipline-lens cats (backend / database / UX-UI / usability / metrics / adoption) revealed something the morning round structurally could not see: **V11_PLAN is shipping into a substrate that is instrumentation-blind, undo-inconsistent, and onboarding-scattered.**

The V11 features are right. The PREREQUISITES the morning round did not name are now visible:

1. **`ai_used=0` is a metrics catastrophe**, not a wiring bug — until truthful, 12 of Cat 5's 28 metrics are blind, every AI investment is a black box, and the 80% modmail-automation goal is unreachable.
2. **The Analytics Engine binding was silently broken** — fixed this session as v9.4.7. But `MOD_METRICS` is wired and used by ZERO client hot paths. The pipe exists; nothing flows.
3. **Bulk-action safety requires three layers co-shipped** (server idempotency + DB pending_undo + client universal-undo middleware). Wave 1's flagship feature breaks under retry without all three.
4. **Right-click menu (the morning's "BIG BET") cannot ship without keyboard parity** (`Shift+F10` + `role="menu"` + focus restoration). Cat 4's hard call: shipping it without these is a net-negative accessibility event — the entire ban/watch/remove flow becomes mouse-only for the first time. This is regression, not feature.
5. **Onboarding bundle is an atomic Wave 1 unit, not scattered tickets.** The current V11_PLAN puts wizard at §11.3, Brave detection at #15, tab default in BACKLOG, INSTALL rewrite nowhere. Until shipped together, each piece is a half-measure.

**Round 2 theme:** ACTIVATE THE SUBSTRATE. v11 doesn't need new features so much as it needs the foundations the existing features assume. Then ship the morning's right-click + modmail-3-col + AI-hold-queue with proper foundation underneath.

**Adjustments from V11_PLAN AM:**
- Wave 1 expands by 7 prerequisite items (1 P0 fix + 6 substrate items)
- Wave 4's Shadow Mode (trial-tier engine) promoted to Wave 2 (Cat 6)
- Wave 4's Demo Mode is now the formal first-cut
- Cloudflare Queues introduced as Wave 3 prerequisite for Brigade Detector (Cat 1)
- WCAG 2.1 AA promoted from BACKLOG to release gate (Cat 4)

---

## B) CONVERGENCE POINTS — where 3+ cats independently land on the same call

**These are the highest-confidence signals in this round. Multiple disciplines reaching the same conclusion through different lenses = strong evidence.**

### Convergence 1: `ai_used=0` is THE critical-path fix (Cats 2, 5, 6 + UAT_MODMAIL)
- Cat 5: "12 of 28 metrics blind until truthful." Wave 1 critical.
- Cat 2: schema needs `ai_acceptance_ms` + `edit_distance` columns to give the loop richness, not just a boolean.
- Cat 6: first-action telemetry depends on it for funnel measurement.
- Action: Cat 2 ships migration 036 (3 columns), Cat 5 owns the closure semantics, UAT_MODMAIL E1 client fix lands the same PR. **Wave 1, week 1.**

### Convergence 2: ai_hold_queue is the architectural simplifier of v11 (Cats 1, 2, 3, 5)
- Cat 1: Wave 1 backend deliverable; the `/admin/queue/ai-flagged` endpoint trio.
- Cat 2: full state machine schema (DDL with atomic claim pattern, partial indexes, RETURNING).
- Cat 3: blue-header visual identity ("machine zone"), j/k motion, left-gutter confidence tiers.
- Cat 5: confidence scoring as a first-class primitive emitted to Analytics Engine, not a one-off feature.
- Action: this lands as a single coordinated PR across 4 disciplines. **Wave 1.**

### Convergence 3: Idempotency + universal undo are co-shipped or bulk actions break (Cats 1, 2, 4)
- Cat 1: client_op_id idempotency keys as a standard primitive on every mutating endpoint.
- Cat 2: `pending_undo` table with atomic claim (`UPDATE ... WHERE consumed_at IS NULL RETURNING`).
- Cat 4: universal undo **POLICY** (Tier A 20s / Tier B 5s / `U` hotkey / SR announcement) before implementation, plus client `withUndo()` middleware so future features inherit undo for free.
- Action: bulk-action flagship (V11 #5) cannot ship until ALL THREE land. **Wave 1 prerequisite.**

### Convergence 4: Right-click menu requires keyboard parity (Cats 3, 4)
- Cat 4: `Shift+F10` trigger + `role="menu"` ARIA contract + focus restoration. **Must-not-cut.** Right-click without keyboard equivalent is a net-negative accessibility event because the primary moderation flow (ban/watch/remove) becomes mouse-only.
- Cat 3: visual design includes explicit kbd hints rendering ([Ctrl][Shift][B] as pill spans inside menu rows).
- Action: V11_PLAN #1 (the BIG BET) is redefined as "right-click + keyboard parity + ARIA menu contract" as a single shippable unit. **Wave 1.**

### Convergence 5: Onboarding is an atomic Wave 1 bundle (Cats 4, 6)
- Cat 6: wizard banner + Brave detection + tab default + INSTALL rewrite + invite-backup + collision guard. "Ship together or each is a half-measure."
- Cat 4: tab default on unauth, auth-fail banner cross-talk, "Force re-hydrate" duplicate merge, Brave fallback path.
- Cat 3: token field 3-dimension differentiation (filled crown vs outline key + purple lead tint), gradient-popup-header removal.
- Action: bundle into one Wave 1 deliverable named "Onboarding Recovery." Composite onboarding score moves from **5.8 → 8.5** as the success metric. **Wave 1.**

### Convergence 6: Analytics Engine systematic adoption (Cats 1, 5)
- Cat 1: P0 fixed this session (binding name `ANALYTICS_ENGINE` → `MOD_METRICS`, deployed v9.4.7); per-request middleware emits one data point per request automatically.
- Cat 5: 10 event types defined (modmail.ai_accept, ai.budget, mod.shift_actions, etc.) emitted from same wave as the features they measure.
- Action: AE adoption audit (Cat 5 #26) lands Wave 1, then 10 event types instrumented across Waves 1-2. **Wave 1.**

### Convergence 7: Bloomberg aesthetic is a release gate, not a vibe (Cats 3, 6 + advocate)
- Cat 3: "EXTEND Bloomberg, do NOT break from it on new surfaces. Five semantic colors not seven. Intelligence framing over law enforcement."
- Cat 6: "No public rankings, no badges visible to mod, no competitive framing. Would a Bloomberg terminal show this? If not, redesign."
- Action: any V11 feature that adds gamification, decorative motion, or playful copy fails the gate. **Continuous.**

---

## C) RELEASE-BLOCKING CONSTRAINTS

**These hold or v11 doesn't ship. Non-negotiable in synthesis.**

| # | Constraint | Owner | Source |
|---|---|---|---|
| 1 | Right-click context menu ships with keyboard parity (`Shift+F10` + `role="menu"` + focus restore) | Cat 3+4 | Cat 4 hard call |
| 2 | Bulk-action endpoints REQUIRE `client_op_id` idempotency + 30s pending_undo TTL + client `withUndo()` middleware before going live | Cat 1+2+4 | 3-cat convergence |
| 3 | `ai_used=1` writes truthfully before any AI quality metric or auto-send tier ships | Cat 5 | Critical path |
| 4 | WCAG 2.1 AA passes (NVDA/JAWS test session) on every Wave 1 surface before merge | Cat 4 | Bet 1 |
| 5 | Bloomberg aesthetic preserved — no decorative motion, no gradients, no public scoreboards visible to mods, intelligence framing not law-enforcement framing | Cat 3+6 | Convergence 7 |
| 6 | EXTENSION_ID_ALLOWLIST hot-swap path (comma-separated list) ships before CWS rollout | Cat 1 | Risk 4 |
| 7 | Analytics Engine binding fixed (DONE this session, v9.4.7) and per-request telemetry middleware live before any new metric ships | Cat 1+5 | P0 fixed; substrate |

---

## D) THE NEW WAVE 1 — REDEFINED ATOMIC SCOPE

Round 1 Wave 1 = 10 items. Round 2 keeps those 10 but **adds 7 substrate prerequisites** that must ship in the same wave for the existing 10 to be safe and useful.

### D.1 Wave 1 SUBSTRATE PREREQUISITES (new, Round 2 additions)

| # | Item | Owner | Effort | Why blocking |
|---|---|---|---|---|
| **W1-S1** | ai_used=1 truthful (UAT_MODMAIL E1 client fix + Cat 2 schema cols `ai_acceptance_ms` + `edit_distance`) | Cat 2+5 + client | S | Unblocks 12 metrics |
| **W1-S2** | Idempotency keys (`client_op_id`) on all mutating endpoints (Cat 1 #6) | Cat 1 | M | Bulk action correctness |
| **W1-S3** | `pending_undo` D1 table (Cat 2 #3) | Cat 2 | S | Server-side undo storage |
| **W1-S4** | `withUndo()` client middleware + universal undo policy (Cat 4 #9 + Bet 2) | Cat 4 | M | Consistent undo across all features |
| **W1-S5** | ai_hold_queue table + `/admin/queue/ai-flagged` trio (Cat 1 #10+16, Cat 2 #1) | Cat 1+2 | M | Backend for V11 #3 (j/k queue) |
| **W1-S6** | Per-request Analytics Engine middleware + 10 event types defined (Cat 1 #4, Cat 5 #26) | Cat 1+5 | M | Observability substrate |
| **W1-S7** | EXTENSION_ID_ALLOWLIST comma-list refactor + runbook (Cat 1 #13) | Cat 1 | S | CWS rollout safety |

### D.2 Wave 1 USER-FACING FEATURES (Round 1 + Round 2 keyboard/visual prereqs)

| # | Item | Round 1 → Round 2 changes |
|---|---|---|
| **W1-1** | Right-click universal context menu | + `Shift+F10` keyboard trigger + `role="menu"` ARIA + focus restore (Cat 4 #5 must-not-cut) + 220px Bloomberg-styled visual primitive (Cat 3 #2) + on-hover `⋮` glyph indicator (Cat 3 #13) |
| **W1-2** | Modmail 3-column panel | + 3-zone color coding (Cat 3 #12) + sans-serif body text (Cat 3 #11) + 280px collapsed-rail mode (Cat 4 #13) + composite `(sender, sent_at DESC)` index (Cat 2 #6) |
| **W1-3** | AI hold queue (j/k approve/reject) | + blue-header machine-zone identity + green/red flash motion on j/k (Cat 3 #6) + confidence scoring as RETURNING column (Cat 2 #1) + funnel instrumentation (Cat 5 #4) |
| **W1-4** | Mod Audit View (`/admin/audit/mod-profile`) | + composite index `(mod, action, ts)` PRE-shipped (Cat 2 #10/#13) + AI summary via Workers AI streaming (Cat 1 #22) |
| **W1-5** | Queue checkbox + bulk action bar | + idempotency (W1-S2) + pending_undo (W1-S3) + withUndo (W1-S4) all required |
| **W1-6** | Repeat-offender halo + count in Intel Drawer | + denormalized `gaw_users.ban_count` for O(1) lookup (Cat 2 #23) + amber halo + ×N badge visual (Cat 3 #22) |
| **W1-7** | Modmail macros wired in modmail tab (A2 finally) | + `macro_uses` learning loop schema (Cat 2 #12) tracking edit_distance + accept_rate |
| **W1-8** | Presence Bar (avatar strip + status dot + page verb) | + 8-hue curated palette (Cat 3 #18) + `aria-label` per avatar with mod state (Cat 4 #20) |
| **W1-9** | Universal `📬 N` modmail badge on any page | + ph-envelope icon swap (Cat 3 #4) replaces emoji |
| **W1-10** | Auto-unsticky bug fix + GEAR threshold UI | + atomic UPDATE...RETURNING for sticky toggle (extend B3 pattern from this session) |
| **W1-11 (NEW)** | **Onboarding Recovery Bundle** — wizard banner + Brave detection + tab default + INSTALL rewrite + invite-backup + collision guard | Cat 6 atomic unit; Cat 4 cross-talk fix (#3) included |
| **W1-12 (NEW)** | **Token field 3-dimension differentiation** — outline key vs filled crown + purple lead tint + section rail | Cat 3 #5 + Cat 4 #2 |
| **W1-13 (NEW)** | **Canonical amber dedup** — single `--gam-amber: #f5a623` CSS variable replacing 3 in-production amber hex values | Cat 3 #19 + section E.1 prereq for ALL Wave 1 visual items |
| **W1-14 (NEW)** | **Auth-fail banner → popup cross-talk** — banner button opens popup directly to Tokens tab via `chrome.action.openPopup()` with focus on Claim button | Cat 4 #3; closes the keyboard recovery dead-end |

**Wave 1 timeline:** 8-10 days (was 5-7 in Round 1). The 4-day expansion is the substrate prerequisites. The cost is concrete: without them, Wave 1's user-facing features ship into a broken substrate and either fail in the field or require Wave 2 emergency patches. Pay the cost in Wave 1.

---

## E) WAVE 2 / 3 / 4 — ADJUSTMENTS

### Wave 2 — v11.1 — "UX polish + bug-class kills"

**Round 1 list preserved.** Round 2 additions:
- **W2-NEW: Trial-mod tier with Shadow Mode** (PROMOTED from Wave 4 by Cat 6) — `mod_tokens.tier` column, Shadow Mode auto-on for first 30 days, promotion criteria, mentor assignment field.
- **W2-NEW: Phosphor icon migration** (Cat 3 #4) — L effort, replaces all emoji in status bar/popup.
- **W2-NEW: FTS5 contentless tables for firehose** (Cat 2 #5) — eliminates 3x write amplification on upsert hot path.
- **W2-NEW: AI confidence scoring on modmail candidates** (Cat 5 #3) — gates auto-send tier in Wave 3.
- **W2-NEW: Lead Scoreboard with 4 tiles + 2 lifecycle cards** (Cat 5 + Cat 6) — SLA / active mods / AI acceptance / queue pressure + Onboarding card + Lapsed card.
- **W2-NEW: Cron task isolation + per-task wall-clock budget** (Cat 1 #3) — wraps each cron task with `withTimeout(fn, ms)`.

### Wave 3 — v11.2 — "Team coordination + intelligence"

**Round 1 list preserved.** Round 2 additions:
- **W3-NEW: Cloudflare Queues** (Cat 1 #18) — replaces enrichment + discord-retry cron drains; PREREQUISITE for Wave 4 brigade detector. L effort.
- **W3-NEW: AI prompt drift canary** (Cat 5 #11) — weekly synthetic-thread runs against baseline, alerts on >15% drift.
- **W3-NEW: A/B testing harness** (Cat 5 #17) — KV-backed variant assignment, reusable across all future prompt changes.
- **W3-NEW: R2 audit anchoring** (Cat 2 #9) — `audit_chain_anchors` table + cron writes to R2; partial forensic-grade integrity.
- **W3-NEW: Personal stats card with sparklines** (V11 #10 promoted from Wave 2) — habit anchor for retention (Cat 6 #10).

### Wave 4 — v11.3 — "Ambitious / experimental"

**Round 1 list with explicit cuts:**
- **CUT: Demo Mode** (Cat 6 self-cut). M effort, lowest adoption leverage of the 30 Cat 6 items.
- **CUT (if scope slips): Auto-Brigade Detector** (originally Wave 4). DEFER to v12 if Wave 3 Queues haven't proven stable.
- **CUT (if scope slips): Trainee Shadow Mode** — already promoted to Wave 2 as part of trial-tier formalization.
- **KEEP: Incident Mode** with fuchsia visual identity (Cat 3 #17).
- **KEEP: Scheduled actions.**

---

## F) NEW ARCHITECTURE BETS (5 from Round 2 cross-disciplinary convergence)

These are STRUCTURAL CALLS Round 1 didn't make. Each is defended below.

### Bet R2-1: Activate the observability substrate before adding new features
Round 1 said "add Worker health widget (#18)." Round 2 says: the Analytics Engine binding has been silently broken since whenever it was added (P0 fixed this session). The CLIENT writes ZERO events. Adding a widget on top of dead infrastructure is theater. This bet is to ship the AE per-request middleware + 10 event types in Wave 1, BEFORE shipping the widget. Without this, Wave 2's Lead Scoreboard cannot be populated.

### Bet R2-2: Idempotency keys are a platform primitive, not per-feature
Cat 1's bet promoted to a structural call: every mutating endpoint accepts `client_op_id`, KV stores the response for 300s, duplicates within the window return the cached response. This single primitive serves: bulk-action retry safety, toast-undo correlation, and the future generalized retry contract. Cost: 2ms KV lookup per mutating request. Benefit: closes the "mod clicked twice, got two bans" bug class permanently.

### Bet R2-3: Universal undo as client middleware (`withUndo()`), not per-feature add-on
Cat 4's bet: every state-mutating call passes through a `withUndo(actionFn, opts)` wrapper. New features inherit undo automatically. The alternative — implementing undo per feature — produces inconsistent UX where some actions undo and others don't. This pairs with R2-2 server-side idempotency and the `pending_undo` D1 table (Cat 2 #3) as a 3-layer system.

### Bet R2-4: ai_hold_queue is the single AI substrate by v11.2
Cat 2's bet: by v11.2, three legacy AI tables (`shadow_triage_decisions`, `ai_suspect_queue`, ephemeral KV tard caches) all migrate INTO `ai_hold_queue` with a `kind` discriminator. Three tables → one table. Three query patterns → one. Three retention policies → one. The migration path is non-breaking (writes to old tables stay working during transition). This is the single biggest structural simplifier of v11.

### Bet R2-5: WCAG 2.1 AA is a release gate, not a backlog item
Cat 4's bet: ship WCAG 2.1 AA passing on every Wave 1 surface, validated by an actual NVDA/JAWS test session before merge. Failure blocks the wave. The 150-rules audit shows 6 ⚠ accessibility rules — they're symptoms of a single architectural gap (accessibility was layered on top of mouse-first design rather than embedded as a constraint). Round 2's call: extract a 200-line `gamA11y` module (`trapFocus`, `restoreFocus`, `buildCombobox`, `buildMenu`) so all panels share the same focus contract. Without this, the right-click menu Wave 1 ships with inconsistent ARIA per panel.

---

## G) THE ONE BIG BET — REVISED

Round 1 said: **right-click universal context menu is the call.**

Round 2 says: **the call is correct, but it ships as a 3-part atomic unit:**
1. The right-click visual + interaction (Round 1)
2. **Keyboard parity** (`Shift+F10` + `role="menu"` + focus restoration) — Cat 4 must-not-cut
3. **Activated observability** (per-event AE telemetry on every menu invocation, every action taken via the menu)

The compression dividend Round 1 named (5-clicks → 1-click on bans, 4-clicks → 1-click on watchlist, etc.) is real. Round 2 adds: without the keyboard parity, the dividend is mouse-only — and the same bet that converts veterans converts NOBODY who needs keyboard navigation. Without the telemetry, we ship the feature blind to its own adoption.

The big bet is unchanged in spirit. Round 2 raised its bar to "ship it as a complete primitive."

---

## H) TOP RISKS — SYNTHESIZED ACROSS ALL 6 CATS

1. **Bulk-action correctness collapses if any of idempotency / pending_undo / withUndo ships late.** All three layers must land Wave 1 or bulk-action stays in Wave 2. Cat 1+2+4 convergence.
2. **AI calibration disasters at scale if `ai_used=0` is not fixed before auto-send tier (V11.2) ships.** We will tune confidence thresholds against ghost data. Cat 5 critical-path.
3. **EXTENSION_ID_ALLOWLIST single-string format = guaranteed 403 storm during CWS rollout window.** Cat 1 risk 4. 2-hour fix that prevents 5-minute outage for all 15 mods. Pre-CWS.
4. **KV write amplification breaks AI rate-limiting at peak.** 15 mods at AI minute-cap = 432k KV writes/day on rate-limit buckets alone. Cat 1 risk 1. Mitigated by AE telemetry to track + Durable Object rate-limit migration as v12 work.
5. **FTS5 trigger write amplification on firehose upserts** (3x per ingest). Cat 2 risk 2. Wave 2 (contentless FTS5 migration) closes the gap before raid-level firehose volumes blow it open.
6. **Right-click menu keyboard regression.** Cat 4 risk: shipping V11 #1 without `Shift+F10` is a net-negative event. Mitigation: gate constraint #1.
7. **Bloomberg aesthetic drift toward Discord-bot.** Cat 3+6 risk: gamification creep across stats card + kudos + milestones. Mitigation: "would Bloomberg show this?" as a release-gate test.

---

## I) WHAT THE DISCIPLINE-LENS ROUND ADDED — HONEST ACCOUNTING

Round 1 was 3 cats × CMS-feature / UX-flow / team-intel angles. Strong on WHAT to ship. Weak on:

- **Substrate gaps** (Round 1 assumed AE, ai_used, idempotency all worked) — Round 2 found 3 of them broken or absent.
- **Accessibility** (Round 1 had zero SR test cases) — Round 2 elevated WCAG 2.1 AA to release gate.
- **Database schema design** (Round 1 named tables but didn't design state machines, indexes, EXPLAIN-QUERY-PLAN concerns) — Round 2 produced full DDL with 30 schema items.
- **Observability** (Round 1 had 8 KPIs, all lagging operational) — Round 2 added AI quality, drift detection, mod fatigue, cost visibility, A/B harness as a stack.
- **Lifecycle gaps** (Round 1 was feature-focused — no off-boarding, no lapsed-mod reactivation, no community-to-mod recruitment) — Round 2 named all three.
- **Visual primitives for new surfaces** (Round 1 said "incident mode" — Round 2 designed it: fuchsia tier, identity gradient, scoped color rules).
- **Live P0 bugs** (Cat 1 found Analytics Engine binding name mismatch; fixed this session, v9.4.7).

Round 1 was the strategic plan. Round 2 is the engineering plan. Both are needed.

---

## J) CTO 5-PICK IF SCOPE FORCES A CUT

If only 5 things from Round 2 ship in v11, in priority order:

1. **`ai_used=1` truthful + `ai_acceptance_ms` + `edit_distance` schema** (W1-S1). The substrate every AI metric depends on. Without it, v11's AI investment is a black box.
2. **Right-click + keyboard parity + ARIA `role="menu"` + focus restore** (W1-1). The morning's BIG BET, ship as a complete primitive. Compression dividend real, regression risk eliminated.
3. **Idempotency + pending_undo + withUndo middleware** co-shipped (W1-S2/3/4). Bulk-action flagship safe to ship.
4. **Onboarding Recovery Bundle** (W1-11). Activation 5.8 → 8.5. Bottleneck on team scaling.
5. **Per-request Analytics Engine middleware + 10 event types** (W1-S6). Observability substrate. Without it, Wave 2's Lead Scoreboard is a blank chart.

Notice what's NOT in the top 5: the new visual surfaces (modmail 3-col, AI hold queue UI). Those are flagship features but they don't ship alone. They ship alongside (1) data correctness (item 1), (3) bulk-safety (item 3), and (5) observability (item 5). Drop any of those substrate items and the visible features fail in the field within a week.

---

## K) WHAT I'M ASKING COMMANDER TO CONFIRM OR REDIRECT

1. **Wave 1 expanded to 14 user-facing items + 7 substrate prerequisites = 21 deliverables in 8-10 days.** This is more than V11_PLAN AM proposed. The expansion is the substrate prerequisites. **Confirm the expanded scope or redirect to a leaner Wave 1.**
2. **Right-click menu is the BIG BET, gated on keyboard parity (Cat 4 hard call).** Confirm this is the right ship-or-don't-ship constraint, or redirect.
3. **Shadow Mode promoted from Wave 4 to Wave 2** (Cat 6 ask, supported by trial-tier formalization). Confirm or redirect.
4. **WCAG 2.1 AA promoted from BACKLOG to release gate** (Cat 4 Bet 1). Real cost: 2-hour NVDA test session per wave. Confirm or redirect.
5. **Demo Mode is the formal first-cut.** Cat 6 self-cut; preserves wizard + Brave + tab default + INSTALL rewrite as the high-leverage 80%. Confirm or redirect.

---

## L) ARTIFACT INVENTORY

| Doc | Generated | Status |
|---|---|---|
| [V11_PLAN.md](V11_PLAN.md) | 2026-05-08 AM | Round 1 strategic plan; partially superseded by this doc |
| [V11_R2_CAT1_BACKEND.md](V11_R2_CAT1_BACKEND.md) | 2026-05-08 PM | 25 items, ~7800 words |
| [V11_R2_CAT2_DATABASE.md](V11_R2_CAT2_DATABASE.md) | 2026-05-08 PM | 30 items with full DDL, ~4100 words |
| [V11_R2_CAT3_UX_UI.md](V11_R2_CAT3_UX_UI.md) | 2026-05-08 PM | 25 items, ~6500 words |
| [V11_R2_CAT4_USABILITY.md](V11_R2_CAT4_USABILITY.md) | 2026-05-08 PM | 30 items, ~3970 words |
| [V11_R2_CAT5_METRICS.md](V11_R2_CAT5_METRICS.md) | 2026-05-08 PM | 28 items end-to-end loops, ~5500 words |
| [V11_R2_CAT6_ADOPTION.md](V11_R2_CAT6_ADOPTION.md) | 2026-05-08 PM | 30 items lifecycle-framed, ~4100 words |
| [V11_R2_PLAN.md](V11_R2_PLAN.md) | 2026-05-08 PM | THIS DOCUMENT — binding synthesis |
| [FEATURES_MATRIX_v9.24.md](FEATURES_MATRIX_v9.24.md) | 2026-05-08 PM | Authoritative current-state baseline |

**Word count this synthesis:** ~3,400. Combined Round 2 corpus: ~31,000 words across 7 docs. Six disciplines, 170+ items, one synthesis.

---

**Final note for the next session:** the morning round was V11_PLAN. The afternoon round was this. **The next session should not produce a Round 3 plan.** It should pick ONE Wave 1 substrate prerequisite (W1-S1 ai_used=1 is the highest-leverage) and ship it. Round 2's value is converted to product only by execution.
