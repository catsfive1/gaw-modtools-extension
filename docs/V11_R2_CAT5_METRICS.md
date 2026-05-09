# V11 R2 Cat 5 -- METRICS / AI SUCCESS / OBSERVABILITY
**Generated:** 2026-05-08 by Cat 5
**Lens:** GAW ModTools is flying instrumentation-blind. The Merkle audit chain records every action ever taken, the Analytics Engine binding is wired but used only as a generic event sink, `ai_used` has been `0` since the feature launched, and the 8 KPIs Cat 3 proposed for the Lead Scoreboard are all lagging operational metrics -- queue depth, active mod count -- with almost nothing on AI quality, mod fatigue, or learning-loop health. This document closes that gap. Every metric below is defined end-to-end: what event fires, where it stores, what decision it enables, and how the action's outcome feeds back into the next measurement cycle. Rule 36 (AI Suggestions Are Assistive, Not Authoritative) is the hard constraint: we measure AI to make it measurably better, not to replace mod judgment.

---

## A. THE TOP 28 (ranked by metric leverage)

---

### 1. AI Acceptance Rate -- per-tone, per-mod, per-sender-category
- **Why through metrics lens:** The single highest-leverage missing signal. `ai_used` has been wired and false since the feature launched (UAT_MODMAIL §B.3). Without it we cannot learn which tones land, which mods use AI, or whether AI quality is improving. Everything else in this list builds on this being true.
- **Signal:** Client emits `{event:'modmail.ai_accept', mod, tone, thread_id, sender_category, body_hash}` at the moment the mod clicks "Send" on an AI card (UAT_MODMAIL E1 -- the `data-send-direct` button). Fallback: IDB body-hash reconciliation path (UAT_MODMAIL E5) catches paste-and-send cases.
- **Storage:** `mod_modmail_responses.ai_used=1, ai_tone` (column exists, never truthfully set). Aggregate in Analytics Engine: `event=modmail.ai_accept, blob[1]=tone, blob[2]=mod, double[0]=1`.
- **Surface:** Lead Scoreboard KPI #5 (replaces Cat 3's placeholder). Per-mod breakdown in Mod Audit View (#4 in V11_PLAN). Trend sparkline: 7d rolling acceptance rate by tone.
- **Decision driven:** Which tone to pre-rank (sort the 4 cards so the historically highest-accepted tone is top). Which mods need coaching (acceptance rate < 20% = AI not helping them). Whether AI investment is returning value at all.
- **Loop closure:** Acceptance rate by tone -> worker re-weights history filter (past-replies prompt) to preferentially show `ai_used=1` examples -> next generation quality improves -> acceptance rate rises -> repeat.
- **Effort:** S (client-side send button wires the flag; the column and worker handler already exist)
- **Risk:** Lo. Gaming risk: a mod could click "Send" and immediately undo -- but undo events are also tracked (#2). Goodhart risk: if we reward mods for acceptance rate, they rubber-stamp. Mitigate: never expose acceptance rate as a performance metric to mods themselves, only to lead.
- **Dependency:** UAT_MODMAIL E1 (send-direct button)
- **Success metric (meta):** `ai_used=1` rate rises above 0% within 48h of ship. Within 2 weeks, we can answer "which tone gets accepted most by catsfive."

---

### 2. AI Tone Hit-Rate by Sender Category
- **Why through metrics lens:** Even with acceptance rate fixed, acceptance alone is noisy -- a mod might accept the "firm" tone for a ban appeal AND for a spam report. Segmenting by sender category (derived from subject keywords or a light classifier) tells us whether each tone is calibrated for its actual use case.
- **Signal:** At track-response time, worker classifies `subject` into one of 5 buckets (`ban_appeal, spam_report, general_question, harassment_complaint, other`) via a 5-rule keyword match (no LLM needed for v11). Stored alongside `ai_tone` in `mod_modmail_responses`.
- **Storage:** Add `sender_category VARCHAR(30)` to `mod_modmail_responses`. Analytics Engine: `event=modmail.ai_accept_by_cat, blob[1]=sender_category, blob[2]=ai_tone`.
- **Surface:** Lead dashboard drill-down on KPI #5. Not visible to mods.
- **Decision driven:** Prompt tuning. If "brief" tone gets 70% acceptance on spam reports but 10% on ban appeals, the brief-tone system prompt needs appeal-specific guidance.
- **Loop closure:** Category-level acceptance data -> worker adjusts tone-rank per category -> mod sees the right default card first -> acceptance rate rises per category.
- **Effort:** S
- **Risk:** Lo. The keyword classifier can mis-bucket; that introduces noise but not systematic bias. Privacy: subject line is already stored; no new PII exposure.
- **Dependency:** #1 (ai_used truthful)
- **Success metric (meta):** Within 30 days, we can produce a 5x4 heatmap of tone x category with statistically meaningful acceptance rates (>10 observations per cell).

---

### 3. AI Confidence Score per Candidate Reply
- **Why through metrics lens:** The 4 candidates are currently returned equally. No signal exists to rank them, drive auto-send thresholds, or route borderline cases to the hold queue. This is the gating metric for the 80% automation ceiling (UAT_MODMAIL §E.3).
- **Signal:** Second-pass Llama call: "Rate 1-5 likelihood this reply resolves the thread without escalation, given the thread history. Return JSON {tone, score, reasoning_1sentence}." Runs in parallel with the 4 generation calls, costs ~1 AI budget unit per thread.
- **Storage:** `ai_hold_queue.confidence` (V11_PLAN architecture bet #3). For modmail: store `confidence_scores: {firm:4, empathetic:2, brief:3, escalate:1}` as JSON blob on the cache entry. No new D1 table needed for modmail phase.
- **Surface:** Card rank order in the modmail panel (highest confidence rendered first). Confidence badge on each card (1-5 dots). Lead dashboard: 7d avg confidence score by tone.
- **Decision driven:** Auto-send threshold: if top-ranked tone scores 5/5 AND sender_category is in the whitelist, route to auto-send with 5s undo (UAT_MODMAIL E2). Borderline cases (score 3/5) get a "second opinion?" nudge.
- **Loop closure:** Confidence score + mod accept/reject outcome -> calibrate the confidence prompt (does a score-5 prediction actually correlate with acceptance? Track calibration over 30 days).
- **Effort:** M
- **Risk:** Md. LLM self-evaluation is notoriously overconfident. The score is only as good as the calibration loop. Mitigate: treat confidence as a ranking signal, not a ground truth; require human acceptance data to validate before using for auto-send.
- **Dependency:** #1, AI budget headroom (1 extra call per thread)
- **Success metric (meta):** After 4 weeks, confidence score Spearman correlation with mod acceptance > 0.4.

---

### 4. Auto-Send Funnel Instrumentation
- **Why through metrics lens:** UAT_MODMAIL says 80% automation requires a closed loop. That loop has 5 stages. If we cannot measure drop-off at each stage, we cannot tune the funnel. This is the observatory for the entire automation investment.
- **Signal:** 5 events fired per thread that enters the AI path:
  - `modmail.ai_generated` (4 candidates created)
  - `modmail.ai_ranked` (confidence score attached)
  - `modmail.ai_send_direct` (mod clicked Send on AI card -- #1)
  - `modmail.ai_auto_queued` (confidence >= threshold, entered auto-send queue)
  - `modmail.ai_auto_sent` or `modmail.ai_auto_undone` (outcome of auto-send)
- **Storage:** Analytics Engine only. No D1. These are funnel metrics, not forensic audit.
- **Surface:** New "AI Funnel" panel on lead dashboard. Conversion rates between each stage. 7d trend.
- **Decision driven:** If `ai_generated -> ai_send_direct` conversion is 8%, the bottleneck is UX friction (fix the copy-paste path). If `ai_auto_queued -> ai_auto_sent` conversion is 40%, the threshold is too aggressive (mods are undoing). Each stage has a distinct fix.
- **Loop closure:** Funnel data drives threshold calibration for auto-send. If undo rate > 15%, raise confidence threshold. If undo rate < 5%, threshold is too conservative -- lower it.
- **Effort:** M
- **Risk:** Lo. Analytics-only. No PII. Goodhart: don't set team targets on auto-send rate -- it should be a quality signal, not a throughput goal.
- **Dependency:** #1, #3, UAT_MODMAIL E1+E2
- **Success metric (meta):** Within 60 days of v11 ship, we can answer "what % of threads reach auto-send?" with statistical confidence.

---

### 5. Modmail SLA (Thread-Arrival-to-First-Reply Latency)
- **Why through metrics lens:** This is the most direct measure of whether modmail automation is actually helping. If median reply latency drops after AI rollout, that's the proof. If it doesn't, we have a UX friction problem, not an AI quality problem.
- **Signal:** `modmail_threads.first_seen_at` (already populated by inbox-intel poller) vs `mod_modmail_responses.sent_at` (already populated). Compute gap at report time.
- **Storage:** No new storage. D1 query: `SELECT t.thread_id, (r.sent_at - t.first_seen_at) AS latency_ms FROM modmail_threads t JOIN mod_modmail_responses r ON t.thread_id = r.thread_id WHERE r.is_first_reply = 1`. Add `is_first_reply` boolean to `mod_modmail_responses` (set server-side on INSERT when no prior row for thread_id exists).
- **Surface:** Lead Scoreboard KPI replacement for Cat 3's generic "queue clear-rate." Show p50, p90, p99 latency. 7d trend.
- **Decision driven:** SLA breach (p90 > 4h) triggers lead alert. Trending upward over 14d = staffing or tool problem. Trending downward after AI ship = AI working.
- **Loop closure:** SLA trend -> if rising, surface which sender_categories are slowest -> those categories get AI confidence re-tuning -> SLA improves.
- **Effort:** S
- **Risk:** Lo. Privacy: latency is computed on thread IDs, not user identities. The metric captures team behavior, not individual sender data.
- **Dependency:** Cat 2 to add `is_first_reply` column
- **Success metric (meta):** Baseline SLA established within 1 week of deploy. Detectable improvement within 30 days of AI send-direct button ship.

---

### 6. Past-Reply History Quality Score
- **Why through metrics lens:** The history-augmented prompt is currently poisoned by `ai_used=0` rows -- it shows mods examples of replies that may have been human-written, AI-drafted-and-modified, or AI-drafted-and-accepted verbatim, with no distinction. Once #1 is fixed, we can score how "clean" the training history is and whether it's actually improving generations.
- **Signal:** For each thread that hits `handleModmailAiReplyForThread`, the worker logs `{history_rows: N, ai_used_rows: K, sender_category}`. After generation, log `{confidence_score, accepted: true/false}`. Correlate: does higher `ai_used_rows/N` ratio predict better confidence scores and acceptance rates?
- **Storage:** Analytics Engine: `event=modmail.history_quality, blob[1]=sender_category, double[0]=ai_used_ratio, double[1]=confidence_score`.
- **Surface:** Internal metrics only. Not surfaced to mods.
- **Decision driven:** If ai_used_ratio < 0.3 and acceptance is low, activate subject-similarity fallback (UAT_MODMAIL E4) to supplement sparse same-sender history with cross-sender topic matches.
- **Loop closure:** Over time, as #1 populates real `ai_used=1` rows, the history quality score rises, confidence scores rise, acceptance rises, and the loop self-reinforces.
- **Effort:** S (log-only; the data becomes meaningful only after #1 has run for 2+ weeks)
- **Risk:** Lo. Data collection only, no action taken automatically.
- **Dependency:** #1, #3
- **Success metric (meta):** After 30 days, correlation between ai_used_ratio and acceptance rate is measurable (Pearson > 0.2).

---

### 7. AI Budget Consumption Visibility -- Per-Mod, Per-Route
- **Why through metrics lens:** UAT_BANS §B.5 confirms AI budget exhaustion is silent -- `aiSummarizeBan` falls back to local truncation with no notification. The 500 calls/mod/day and 5000 global caps exist but are invisible. Mods don't know they're at 70%. Lead doesn't know which mod is burning the budget.
- **Signal:** `aiPreflight` already enforces per-mod daily KV bucket. After each AI call, write a budget-consumed event: `{event:'ai.budget', mod, route, remaining_today, global_remaining}`. The data is in KV -- expose it.
- **Storage:** New `/metrics/ai-budget` endpoint reads KV keys `ai:<mod>:<YYYYMMDD>` and the global `ai:global:<YYYYMMDD>` counter. Returns JSON: `{mods: [{mod, used, limit, pct}], global: {used, limit, pct}}`.
- **Surface:** Mod popup header: small budget bar "AI: 340/500" with color gradient (green -> amber -> red). Lead dashboard: per-mod budget table. When a mod hits 90%, snack "AI at 90% today -- complex drafts may fall back."
- **Decision driven:** If one mod consumes 40% of global budget, lead redistributes. If auto-send (#4) launches, budget consumption predictability becomes critical to preventing runaway spend.
- **Loop closure:** Visibility -> mods self-regulate high-volume AI use -> global budget lasts longer -> more mods get AI coverage -> modmail SLA (#5) stays consistent.
- **Effort:** S
- **Risk:** Lo. KV read is cheap. Privacy: mod identity exposed only to lead in aggregate view; each mod sees only their own.
- **Dependency:** `aiPreflight` (exists), new read endpoint
- **Success metric (meta):** Zero "silent AI fallback" events per UAT after ship. Mods can see budget status without asking lead.

---

### 8. Ban Overturn Rate (Appeals Loop)
- **Why through metrics lens:** Cat 3 KPI #6 names this but the data shape doesn't exist until F16 (Appeal Inbox) ships. This metric is the single best signal of ban quality: if we're overturning 15%+ of bans on appeal, we are over-banning or under-evidencing. It's also the coaching loop's ground truth.
- **Signal:** When `appeal_outcome` is set to `overturned` on a ban audit row (F16), emit `{event:'ban.overturned', mod, duration_days, had_ai_suggest, had_precedent, rule_ref}`. Denominator: total bans in the same 30d window.
- **Storage:** `actions` table already has ban rows. `appeal_outcome` column added by F16 (Cat 2 owns schema). Analytics Engine: `event=ban.overturned, blob[1]=mod, blob[2]=rule_ref`.
- **Surface:** Lead Scoreboard KPI #6. Per-mod breakdown in Mod Audit View. Alert: if any mod's overturn rate exceeds 20% in 7d, trigger coaching flag.
- **Decision driven:** High overturn rate -> coaching intervention for that mod. High overturn rate on a specific rule_ref -> rule interpretation ambiguity -> precedent engine needs more examples. High overturn rate for AI-suggested bans -> AI ban-suggest prompt needs calibration.
- **Loop closure:** Overturn events -> feed back into trainee scoreboard (#20). Overturned bans with `had_ai_suggest=1` -> flag the original AI suggestion for negative training signal.
- **Effort:** S (dependent on F16 shipping; the metric itself is a D1 count query)
- **Risk:** Lo. Privacy: targets of overturned bans are GAW usernames, already in the audit log. Goodhart: don't set overturn-rate targets -- the goal is surfacing the signal, not gaming it.
- **Dependency:** V11 F16 (Appeal Inbox)
- **Success metric (meta):** Baseline overturn rate established within 30 days of F16 ship. Coaching interventions triggered when rate > 20% for any mod.

---

### 9. AI Ban-Suggest Calibration (Confidence vs. Outcome)
- **Why through metrics lens:** The AI hold queue (V11_PLAN #3) uses confidence scores to gate auto-flag entries. If the confidence score is miscalibrated -- 0.85 confidence but 40% overturn rate -- the queue is actively harmful. We need to measure confidence calibration continuously.
- **Signal:** For every ban that passed through `ai_hold_queue` with a confidence score: `{confidence_bucket: floor(confidence*10)/10, outcome: accepted|rejected|overturned}`. Track over 30-day rolling windows.
- **Storage:** Analytics Engine: `event=ai.ban_calibration, double[0]=confidence, blob[1]=outcome`.
- **Surface:** Internal metrics only (lead + CTO dashboard). A calibration curve: expected outcome rate vs. actual outcome rate at each confidence decile. If the curve deviates > 15% from perfect calibration, alert.
- **Decision driven:** Confidence threshold adjustment for the hold queue. If 0.85+ cases are overturned at 25%, lower the threshold or add a second-pass human review gate.
- **Loop closure:** Calibration data -> threshold adjustment -> hold queue behavior changes -> new calibration data. Weekly recalibration cycle.
- **Effort:** M (requires hold queue to be shipping first, then instrumentation layer)
- **Risk:** Md. Small sample sizes (bans per day) make calibration curves noisy. Use 30-day rolling windows, not 7-day. Flag when N < 30 -- calibration is not statistically valid.
- **Dependency:** V11_PLAN #3 (AI Hold Queue), #8 (appeal outcomes)
- **Success metric (meta):** After 60 days, calibration curve deviation < 10% across confidence deciles.

---

### 10. Mod Workload Distribution (per-shift, per-rule)
- **Why through metrics lens:** Cat 3's Scoreboard shows Top 3 / Bottom 3 mods by 7d action count. That's a lagging indicator of imbalance. The leading indicator is per-shift workload -- who's carrying the load at 2am when one mod is online versus six?
- **Signal:** `appendAuditAction` already writes `(mod, action, ts)`. Derive: actions per mod per 4-hour shift window. Group by `floor(unixtime/14400)`. Emit shift-end rollup to Analytics Engine.
- **Storage:** D1 `actions` table (already indexed on `author+ts`). Analytics Engine: `event=mod.shift_actions, blob[1]=mod, blob[2]=shift_window, double[0]=action_count`.
- **Surface:** Lead heatmap (Cat 3 F5): 15 mods x 7 days x 6 shift-windows. Click cell = drill to action list. Personal Stats Card (#10 in V11_PLAN) shows own per-shift breakdown.
- **Decision driven:** Lead sees 2am shift consistently covered by 1 mod -> adjust rotation. One mod handles 80% of Friday volume -> address before burnout. Per-rule breakdown: one mod doing 90% of spam removals -> are others skipping the queue?
- **Loop closure:** Imbalance detected -> AI Shift Digest (#11 in V11_PLAN) surfaces workload data in handoff note -> next shift mod picks up the underserved area.
- **Effort:** S (the data is in D1; it's a rollup query and a display layer)
- **Risk:** Lo. Privacy: mod identity in internal analytics is by design (mods are staff, not users). Goodhart: don't rank mods on raw action count -- context matters (a careful 10-action shift may be better than a rubber-stamp 100-action shift).
- **Dependency:** Cat 3 F5 (Lead Heatmap surface)
- **Success metric (meta):** Lead can answer "who covered the 2am shift last Tuesday and how many actions did they take?" without querying D1 manually.

---

### 11. AI Prompt Drift Detection (Canary)
- **Why through metrics lens:** AI quality is not stationary. Slang shifts, attack patterns evolve, Llama model updates change output distributions. Without a canary, we discover drift only when mods start complaining that "AI replies feel off."
- **Signal:** Weekly: run a fixed set of 20 canary threads (synthetic, stored in KV) through the modmail AI pipeline. Measure: (a) acceptance rate on canary set if mods were to see them (approximate via confidence score), (b) cosine similarity of output embeddings to baseline embeddings from initial ship week. Alert if avg confidence drops >15% from baseline or cosine similarity drops below 0.75.
- **Storage:** KV: `canary:modmail:baseline_embeddings` (20 vectors, set at v11 ship). KV: `canary:modmail:weekly_scores:<YYYYWW>` (latest canary run results). D1: log each canary run result for trend analysis.
- **Surface:** Internal alert only. Worker cron job (Workers Cron Trigger, already available) fires weekly. If drift detected, file a `#pattern-proposals` chat thread.
- **Decision driven:** Drift > threshold -> trigger prompt review session with lead. Drift on a specific sender category -> targeted prompt revision for that category. Drift across all categories -> Llama model update has changed behavior, needs recalibration.
- **Loop closure:** Canary run -> prompt revision -> canary run again -> verify improvement before deploying revised prompt to production.
- **Effort:** M (canary framework + embedding infrastructure)
- **Risk:** Md. Synthetic canary threads may not track real drift accurately. Mitigate: supplement with real-thread acceptance rate trend from #1 as a second signal.
- **Dependency:** #1 (acceptance baseline), embedding capability (Workers AI has embedding models)
- **Success metric (meta):** First drift event detected and actioned within 90 days of ship. Prompt version history tracked in KV so rollback is 1 command.

---

### 12. Precedent Citation Rate
- **Why through metrics lens:** Cat 3 KPI #7 lists this but doesn't specify the measurement loop. This metric is the leading indicator of consistency: mods who cite precedents are making defensible decisions; mods who don't are improvising. The gap between new and veteran mods on this metric defines the coaching opportunity.
- **Signal:** `actions.precedent_count > 0` (already stored per ban). Derive: per-mod, per-rule citation rate over 30d.
- **Storage:** D1 `actions` table. No new storage.
- **Surface:** Trainee scoreboard: citation rate vs. team mean. Lead Scoreboard KPI #7. Mod Audit View drill-down.
- **Decision driven:** Mod with citation rate < 30% -> coaching ticket auto-generated pointing to `/precedent` search. Rule with low citation rate across all mods -> precedent engine has sparse coverage for that rule -> curate 3 canonical examples.
- **Loop closure:** Low citation rate -> coaching -> mod cites more -> citation rate rises -> overturn rate (#8) falls (hypothesis). Measure the correlation between citation rate and overturn rate over 90d to validate.
- **Effort:** S
- **Risk:** Lo. Goodhart: mods could artificially inflate citation by citing irrelevant precedents. Mitigate: track rule_ref match rate (cited precedent rule == action rule) as a quality gate.
- **Dependency:** Precedent engine (V11_PLAN #22), trainee scoreboard
- **Success metric (meta):** Citation rate increases by 20% for trainees within 30 days of coaching loop activation.

---

### 13. Mod Fatigue Signal (Action-Rate Decay)
- **Why through metrics lens:** Burnout is invisible until a mod goes quiet. A mod handling 50 actions/shift for 3 weeks then dropping to 5 is showing a fatigue signal. No tool currently surfaces this.
- **Signal:** Per-mod, compute 4-week rolling mean action rate (actions/shift). Flag when current week's rate drops > 40% from the 4-week mean AND total hours online remain similar (ruling out planned absence).
- **Storage:** D1 `actions` table for action counts. KV `presence` pings for online time. No new storage.
- **Surface:** Lead-only alert (private -- never shown to the mod being flagged). "Brent75's action rate this week is 60% below their 4-week average. Check in."
- **Decision driven:** Lead reaches out to the mod before they silently drop off. Workload rebalancing before coverage hole appears.
- **Loop closure:** Early detection -> intervention -> either mod recovers or lead adjusts coverage expectations. Track post-intervention recovery rate over 60d.
- **Effort:** M (the signal is computable from D1; the alerting mechanism needs a worker-side cron)
- **Risk:** Md. False positives: a mod taking a planned break will trigger the alert. Mitigate: allow mods to set "planned absence" status that suppresses the alert. Privacy: this metric is sensitive -- access must be strictly lead-only, never surfaced in the team scoreboard.
- **Dependency:** Presence data (already available), lead-alert surface
- **Success metric (meta):** First fatigue flag detected and actioned within 90 days of ship. Zero cases of a mod silently disappearing without a prior signal.

---

### 14. Queue Clear-Rate (Arrival vs. Action)
- **Why through metrics lens:** Cat 3 KPI #2 lists this correctly. This is the foundational operational metric. Expanding it: not just "did we process items" but "did we process the RIGHT items in the RIGHT order." An 80% clear-rate that misses the top-severity items is worse than a 60% rate that hits them.
- **Signal:** Firehose arrival events (already logged in D1 via `gaw_ingest_audit`). Action events (`appendAuditAction`). Compute: (a) items arriving per hour, (b) items actioned per hour, (c) severity-weighted: did high-score firehose items get actioned before low-score ones?
- **Storage:** D1 `actions` + firehose tables. New: `severity_score` on firehose items (derived from existing scoring, just expose it).
- **Surface:** Lead Scoreboard. Real-time "queue pressure" bar: if arrivals > actions for > 30 min, amber alert. If > 2h, red alert.
- **Decision driven:** Queue pressure alert -> lead pages additional mods online. Severity-weighting miss -> triage order in the AI Hold Queue needs reranking.
- **Loop closure:** Queue pressure events -> shift digest includes "queue pressure at 2pm -- 40 items unactioned" -> next shift prioritizes accordingly.
- **Effort:** S
- **Risk:** Lo
- **Dependency:** Firehose ingest audit (existing)
- **Success metric (meta):** Lead can see real-time queue pressure without manually counting items.

---

### 15. Per-Rule Action Distribution (Rule Enforcement Evenness)
- **Why through metrics lens:** Do all mods apply Rule 5 at the same rate? Do some rules go unenforced because they're ambiguous? Rule enforcement evenness is both a consistency and a training signal.
- **Signal:** `appendAuditAction` already stores `rule_ref` on ban/remove actions. Derive: per-rule action count per mod per 30d. Gini coefficient for each rule's distribution across mods.
- **Storage:** D1 `actions` table. No new storage.
- **Surface:** Precedent Engine drill-down: "R5 enforcement over last 30d" shows distribution. Lead Scoreboard: top 3 most unevenly enforced rules this month.
- **Decision driven:** Rule with high Gini (one mod doing 90% of R5 actions) -> ambiguity in rule interpretation -> add a canonical precedent example. Rule with near-zero enforcement -> rule may be obsolete or mods don't know about it.
- **Loop closure:** Enforcement evenness data -> Precedent of the Day (Cat 3 coaching feature) prioritizes unevenly-enforced rules -> distribution normalizes over 30d.
- **Effort:** S (D1 aggregation query; Gini is a standard SQL computation)
- **Risk:** Lo. Goodhart: never tell mods their per-rule counts. The metric drives training, not evaluation.
- **Dependency:** Cat 3 Precedent Engine (#22 in V11_PLAN)
- **Success metric (meta):** Top-3 unevenly enforced rules identified within 1 week of ship.

---

### 16. Token Expiry / Auth Health Signal
- **Why through metrics lens:** UAT_MODMAIL §C.2 identifies a dead zone: when a mod's token expires, `_ambientModmailPrefetch` silently exits, the cache goes stale for hours, and the mod assumes the tool is broken. This is a measurable instrumentation gap.
- **Signal:** Each time `_ambientModmailPrefetch` exits early due to `!getModToken()`, emit `{event:'auth.token_missing', mod_slot}` to Analytics Engine. Correlate with modmail prefetch success rate per mod.
- **Storage:** Analytics Engine only.
- **Surface:** Lead dashboard: "Mods with token errors in last 24h: [list]". Mod-side: red token-expiry badge in popup header (already planned in auth HANDOFF -- this metric triggers it).
- **Decision driven:** Token expiry cluster -> rotation process is broken or tokens are too short-lived. Specific mod with repeated token errors -> direct remediation.
- **Loop closure:** Token error event -> lead sees alert -> pings mod -> mod re-claims token -> prefetch resumes -> modmail SLA (#5) recovers.
- **Effort:** S
- **Risk:** Lo
- **Dependency:** Existing `_ambientModmailPrefetch` instrumentation point
- **Success metric (meta):** Zero cases of a mod being "silently broken" for > 1h without a signal surfaced to lead.

---

### 17. A/B Test Harness for Prompt Variants
- **Why through metrics lens:** We have one modmail AI prompt set today. We cannot know if it's optimal. A/B testing 2 variants requires that (a) we can randomly assign variants without contaminating mod-specific learning, and (b) we can measure acceptance rate per variant.
- **Signal:** At prompt generation time, `handleModmailAiReplyForThread` draws `variant = KV.get('prompt_variant_<mod_hash_mod_2>')` -- a stable per-mod assignment (same mod always gets same variant; avoids within-mod noise). Emit `{event:'ai.variant', variant, mod_hash, thread_id}`. Measure acceptance rate (#1) split by variant.
- **Storage:** KV: `prompt_variant_<mod_hash_mod_2>` (set once per mod, stable). Analytics Engine: `event=ai.variant_accept, blob[1]=variant, double[0]=accepted`.
- **Surface:** Internal metrics only. Not visible to mods.
- **Decision driven:** After 200 observations per variant, t-test for significance. Winning variant gets promoted to all mods. Losing variant is deprecated.
- **Loop closure:** Test -> outcome -> promote winner -> run next test with a new variant. Ongoing cycle of prompt improvement.
- **Effort:** M
- **Risk:** Md. Mod-stable assignment means small teams (15 mods) have low statistical power. 7-8 mods per variant means we need more observations per mod. Mitigate: run tests for at least 30 days and require p < 0.05 before declaring a winner.
- **Dependency:** #1 (acceptance baseline), Cat 2 for KV key management
- **Success metric (meta):** First statistically significant A/B result within 60 days of ship.

---

### 18. Anomaly Detection -- Mod Over-Banning
- **Why through metrics lens:** V11_PLAN risk F1 names bulk-action safety. A specific sub-risk: a mod in a bad state executes 30 bans in 10 minutes. The ban-preflight rate limit (10/min, 100/day -- currently orphaned per UAT_BANS B1) is the hard stop. But the anomaly detector is the soft warning that fires before the hard stop.
- **Signal:** Rolling 5-minute ban velocity per mod (already derivable from `appendAuditAction` timestamp clustering). Alert when: (a) mod exceeds 2-sigma from their own 30d mean in any 30-min window, OR (b) mod exceeds 3x team mean in any 30-min window.
- **Storage:** Analytics Engine: `event=mod.ban_velocity, blob[1]=mod, double[0]=bans_per_5min`. Alert state in KV: `alert:ban_velocity:<mod>` with 15-min TTL.
- **Surface:** Lead-only alert. ModChat system message: "catsfive is banning at 3x usual rate -- review in progress?" with one-click to pause that mod's ban actions (lead-only kill switch, which is already built but orphaned per UAT_BANS B1).
- **Decision driven:** Anomaly -> lead review -> either confirm (legitimate brigade response) or pause the mod's ban channel until review.
- **Loop closure:** Anomaly event -> lead action -> audit row tagged `reviewed_by_lead` -> post-incident review confirms whether the anomaly was a true positive.
- **Effort:** M (the signal is computable; the alerting surface needs the lead kill-switch to be wired up first per UAT_BANS B1)
- **Risk:** Lo. False positives are annoying but harmless -- lead reviews and confirms legitimate activity. The alternative (no detection) is worse.
- **Dependency:** UAT_BANS B1 (ban-preflight wiring), lead kill-switch
- **Success metric (meta):** First anomaly detected within 30 days of ship. False positive rate < 20% after 60-day tuning period.

---

### 19. Incident Response Metrics
- **Why through metrics lens:** Cat 3 F8 (Incident Mode) creates incident records but proposes no measurement framework. How long does an incident last? How many mods participate? How many actions are taken? This data drives postmortem quality.
- **Signal:** On incident close: `{event:'incident.closed', slug, duration_min, mod_count, action_count, brigaders_banned, new_autodr_rules_added}`.
- **Storage:** `mod_incidents` table (F8 schema): add `closed_at, mod_count, action_count` columns. Analytics Engine: `event=incident.closed, double[0]=duration_min, double[1]=action_count`.
- **Surface:** Incident postmortem (auto-generated). Lead dashboard: incident history timeline. Team trend: are incidents getting shorter (response improving)?
- **Decision driven:** Incident duration trending longer -> playbook is failing -> revise. Incident with low mod participation -> coverage gap -> rotation adjustment.
- **Loop closure:** Incident data -> postmortem -> new autoDeathRowRules -> next brigade detected faster -> incident duration shorter.
- **Effort:** S (data is already captured in F8; this is the rollup and surface layer)
- **Risk:** Lo
- **Dependency:** V11 Wave 4 F8 (Incident Mode)
- **Success metric (meta):** Mean incident duration drops 20% over 90 days as playbooks improve.

---

### 20. Trainee vs. Veteran AI Agreement Rate
- **Why through metrics lens:** Cat 3 F12 (Coaching Loop) proposes a trainee scoreboard with "AI agreement %". This needs precise definition: not "did the trainee accept the AI suggestion" but "when the trainee deviated from the AI suggestion, was their deviation later validated (by overturn rate being lower) or invalidated?" This is the metric that tells us whether trainees are learning or rubber-stamping.
- **Signal:** For every trainee action where AI ban-suggest fired: `{trainee_mod, ai_suggested_action, actual_action, match: true/false, overturn_within_30d: true/false}`. The meaningful metric is `match=false AND overturn=false` (trainee was RIGHT to deviate) vs. `match=false AND overturn=true` (trainee should have followed AI).
- **Storage:** D1: add `ai_agreed` boolean to actions table for trainee-mode actions. `appeal_outcome` from F16 provides the 30d validation signal.
- **Surface:** Trainee scoreboard: "AI agreement % (corrected)" -- shows the two-component score, not a raw agreement rate. Lead weekly review: which trainees are learning to exercise good judgment vs. which are blindly following or blindly ignoring AI.
- **Decision driven:** Trainee who consistently overrides AI correctly -> promote to full mod. Trainee who overrides AI and is subsequently overturned repeatedly -> more coaching. Trainee who agrees with AI on cases that are later overturned -> AI is the problem, not the trainee.
- **Loop closure:** Trainee outcome data -> prompt adjustment when AI is consistently wrong on a category -> trainee accuracy improves.
- **Effort:** M
- **Risk:** Md. Small sample sizes per trainee. Require minimum 30 actions before drawing conclusions. Privacy: trainee metrics shown only to lead and the trainee themselves.
- **Dependency:** #8 (overturn rate), trainee shadow mode (V11 #26)
- **Success metric (meta):** First trainee promoted to full mod based on scoreboard data within 60 days.

---

### 21. Worker Health Observability (p99 Latency, Error Rate, Circuit Breaker State)
- **Why through metrics lens:** V11_PLAN #18 proposes a health widget. The metric definition needs to be precise: what crosses the "something is wrong" threshold?
- **Signal:** Every worker request: log `{route, latency_ms, status_code, provider_used}` to Analytics Engine. Circuit breaker state changes already logged (`circuitBreakerRecord`). New: emit `event=worker.latency, double[0]=latency_ms, blob[1]=route` on every request.
- **Storage:** Analytics Engine only. Compute p50/p99 in Analytics Engine queries.
- **Surface:** Top-bar widget (V11_PLAN #18): "Worker: p99=240ms | Err: 0.2% | AI: workers-ai open". Alert thresholds: p99 > 2000ms (amber), > 5000ms (red). Error rate > 2% (amber), > 10% (red).
- **Decision driven:** p99 spike -> identify the slow route -> optimize or circuit-break it. Provider circuit open -> AI routes are degrading -> alert mods that AI features may be slower.
- **Loop closure:** Latency alert -> investigation -> fix -> latency drops -> alert clears.
- **Effort:** S
- **Risk:** Lo. Adding per-request logging has marginal CPU cost. Sample at 10% for non-critical routes to reduce write volume.
- **Dependency:** Analytics Engine binding (exists, used by handleMetricsWrite)
- **Success metric (meta):** P99 baseline established within 1 week. First performance regression caught via metric rather than mod complaint.

---

### 22. Modmail Thread Abandonment Rate
- **Why through metrics lens:** A thread that got pre-fetched AI drafts but never received a reply is a dead zone. High abandonment rate means either (a) mods are ignoring low-priority threads, (b) the AI draft quality is so bad it's not worth editing, or (c) the thread resolved itself (user withdrew).
- **Signal:** `modmail_threads` records `first_seen_at`. If no `mod_modmail_responses` row appears within 48h of first_seen, mark `abandoned=true`. Correlate with: was an AI draft generated for this thread? What was the thread's sender_category?
- **Storage:** D1: `abandoned` boolean on `modmail_threads` (set by a worker cron, hourly scan). Analytics Engine: `event=modmail.abandoned, blob[1]=sender_category, blob[2]=had_ai_draft`.
- **Surface:** Lead dashboard: "Abandoned threads this week: 12 (8 had AI draft ready)." Alert if abandoned rate > 30%.
- **Decision driven:** High abandonment with AI draft ready -> the send-direct button (#1) is not being used -- UX friction problem. High abandonment in specific category -> that category needs auto-send (#4).
- **Loop closure:** Abandonment signal -> tune auto-send threshold for high-abandonment categories -> abandonment rate drops.
- **Effort:** S
- **Risk:** Lo. Some abandonment is correct (user resolved themselves). The metric is most useful as a trend, not an absolute.
- **Dependency:** #1 (to distinguish "draft ready but not used" from "draft never generated")
- **Success metric (meta):** Abandonment rate baseline established. Drops measurably within 30 days of send-direct button ship.

---

### 23. Macro Effectiveness Score
- **Why through metrics lens:** Custom macros (already in the system) have a `use_count` that goes up but never goes down. We don't know if a macro that gets used 50 times is actually effective -- does it reduce reply time? Does it get edited before send?
- **Signal:** At `macroUse` time, if the macro body is sent unedited (`body_hash_at_select == body_hash_at_send`), emit `{event:'macro.used_verbatim', macro_id, mod}`. If edited before send, emit `{event:'macro.used_edited', macro_id, mod, edit_distance_pct}`.
- **Storage:** Analytics Engine only. `use_count` in D1 is already the raw counter.
- **Surface:** Macro manager popup: each macro shows "Used verbatim 80% / edited 20%." Macros edited > 50% of the time are flagged: "Consider updating this macro's body."
- **Decision driven:** Macro that's always edited -> it's a template, not a macro; refactor it. Macro with 0 verbatim uses -> delete it.
- **Loop closure:** Effectiveness score -> macro pruning -> macro list gets shorter and better -> mods find the right macro faster -> reply latency (#5) drops.
- **Effort:** S
- **Risk:** Lo. The edit-distance computation is client-side, cheap.
- **Dependency:** Macro system (already exists)
- **Success metric (meta):** Macro library size drops by 20% within 60 days as low-effectiveness macros are pruned.

---

### 24. Presence-to-Action Conversion (Idle Detection)
- **Why through metrics lens:** A mod can be "present" (pinging every 60s) while doing nothing. The gap between "online" and "actioning" is the real coverage signal. Presence without action is worse than no presence because it masks a coverage hole.
- **Signal:** Per-mod, per-shift: `{presence_duration_min, action_count}`. Derive: actions-per-presence-minute. Alert when a mod has been "online" for > 30 min with 0 actions in the same window.
- **Storage:** D1 presence pings (existing). D1 actions table (existing). No new storage.
- **Surface:** Lead heatmap (#10): presence-to-action ratio as a secondary color layer (green = active, amber = present-but-idle, grey = offline).
- **Decision driven:** Present-but-idle for > 30m -> system sends a gentle chat ping: "Quiet stretch -- any queue items to clear?" Repeated pattern -> lead conversation about workload.
- **Loop closure:** Idle detection -> intervention -> mod re-engages -> queue clear-rate (#14) improves.
- **Effort:** S
- **Risk:** Md. Invasive if surfaced to mods without context. Strictly lead-only. The automated "gentle ping" must be opt-in for the mod team.
- **Dependency:** Presence data (existing), chat integration
- **Success metric (meta):** Idle periods > 30m with zero actions reduced by 40% within 60 days.

---

### 25. Sticky-Detect False Positive Rate
- **Why through metrics lens:** UAT_MODMAIL §C.6 identifies a known gap: sticky-detect requires the literal substring "sticky" and misses "pin this," "make this a banner," "feature this post." The false negative rate is unquantified. This metric quantifies the gap.
- **Signal:** For each sticky-detect run: `{threads_scanned, flagged_count, mod_actioned_count, mod_dismissed_count}`. Dismissed = mod rejected the sticky suggestion. Dismissed rate is a proxy for false positive rate.
- **Storage:** Analytics Engine: `event=sticky.flagged, double[0]=confidence_level`. D1: add `dismissed_at` on sticky-detect results table (currently only `resolved_at` exists).
- **Surface:** Internal metrics. Alert if dismissed rate > 50% (detector is not useful).
- **Decision driven:** High dismissed rate -> expand the keyword set or improve the classifier. High flag rate + low action rate -> either mods are ignoring it or it's too noisy.
- **Loop closure:** Dismissed events -> expand keyword dictionary -> re-run canary -> improved detection -> lower dismissed rate.
- **Effort:** S
- **Risk:** Lo
- **Dependency:** Existing sticky-detect pipeline
- **Success metric (meta):** False positive rate (dismissed/flagged) below 30% within 30 days of keyword expansion.

---

### 26. Analytics Engine Full-Adoption Audit
- **Why through metrics lens:** `handleMetricsWrite` exists and the Analytics Engine binding is declared but the endpoint is referenced from almost nowhere in the client code. The client is not writing structured events. This is a structural instrumentation gap: we have the pipe, nothing is flowing through it systematically.
- **Signal:** Audit every `rpcCall` and `background.js` call to count how many produce an Analytics Engine write vs. how many produce only D1 writes or nothing. The gap is the instrumentation backlog.
- **Storage:** This is a one-time audit, not an ongoing metric.
- **Surface:** Internal engineering report. One-time output: a list of 10-15 call sites that should be emitting events but aren't. Each becomes a target for #1-#25 above.
- **Decision driven:** Prioritizes which instrumentation to add first. If 80% of AI calls have no Analytics Engine event, that's the highest-leverage gap.
- **Loop closure:** Audit -> instrument -> Analytics Engine data density increases -> every metric in this document becomes measurable.
- **Effort:** S (Grep + analysis)
- **Risk:** Lo
- **Dependency:** None
- **Success metric (meta):** 15+ structured event types flowing to Analytics Engine within 30 days of v11 ship.

---

### 27. Modmail Pre-fetch Hit Rate
- **Why through metrics lens:** The ambient pre-fetch runs every 10 min, fetches 3 threads, caches for 30 min. UAT_MODMAIL §C.3 identifies that a backgrounded tab gets zero pre-fetches. We don't know what percentage of modmail opens find a warm cache vs. a cold miss requiring a live AI call.
- **Signal:** In `_showModmailPopover` and `_showModmailPanel`, when pulling from `chrome.storage.session.gam_modmail_drafts`: `{event:'modmail.cache_hit', thread_id, age_ms}` vs. `{event:'modmail.cache_miss', thread_id}`.
- **Storage:** Analytics Engine only.
- **Surface:** Internal metrics. Cache hit rate target: > 70%. If below, pre-fetch interval or thread-count needs adjustment.
- **Decision driven:** Hit rate < 50% -> increase pre-fetch frequency or pre-fetch count. Hit rate > 90% -> pre-fetch is over-provisioned (wasting AI budget).
- **Loop closure:** Hit rate -> pre-fetch parameter tuning -> hit rate optimized -> modmail latency stays near-zero for mods.
- **Effort:** S
- **Risk:** Lo
- **Dependency:** Existing pre-fetch pipeline
- **Success metric (meta):** Cache hit rate > 70% established within 2 weeks. Pre-fetch parameters adjusted if outside target range.

---

### 28. Per-Mod AI Tone Preference Profile
- **Why through metrics lens:** Different mods have different communication styles. If catsfive consistently accepts "firm" tone and dismisses "empathetic" tone, the system should learn that and pre-rank accordingly for catsfive's sessions. This is the personalization loop.
- **Signal:** Derived from #1 (ai_used=1 events), aggregated per mod per tone over 30d. No new event emission needed.
- **Storage:** KV: `ai:tone_profile:<mod_hash>` = `{firm:0.65, empathetic:0.15, brief:0.12, escalate:0.08}` (normalized acceptance rates). Updated weekly from Analytics Engine aggregates.
- **Surface:** Not visible to mods. Used internally by `handleModmailAiReplyForThread` to sort the 4 candidate cards.
- **Decision driven:** Pre-rank: the mod's historically most-accepted tone appears first in the UI. If a mod has < 20 observations, fall back to global acceptance rates.
- **Loop closure:** Tone acceptance -> profile update -> card ranking changes -> acceptance rate rises -> profile updates again. Self-improving loop.
- **Effort:** S (KV write from weekly Analytics Engine aggregate)
- **Risk:** Lo. Privacy: profile keyed on mod hash (not plaintext username). Goodhart: can't be gamed because mods don't see their own profile.
- **Dependency:** #1 (acceptance data), 30 days of data before profiles are meaningful
- **Success metric (meta):** Per-mod profiles activated for mods with >= 20 observations. Measurable acceptance rate increase (vs. global ranking) within 60 days.

---

## B. WHAT V11_PLAN MISSED (in metrics lens)

**1. No AI quality KPIs at all in the 8 Cat 3 KPIs.**
Cat 3's scoreboard covers operational health (active mods, queue clear-rate, latency, action counts, appeal rate, precedent citations, open incidents). Absent: any measure of AI accuracy, calibration, or improvement trajectory. KPI #5 ("AI agreement rate") is one line with no loop closure defined. The 8 KPIs are lagging -- they tell you what happened, not whether the AI is getting better or worse. Metrics #1-#4 above fill this gap.

**2. The `ai_used=0` defect is a metrics catastrophe, not just a tracking gap.**
V11_PLAN treats the ai_used fix as a client-side wiring task (UAT_MODMAIL E1). That's correct but understates the impact: every AI quality metric in this document is blind until this is fixed. The history filter, the confidence calibration, the tone preference profiles, the funnel instrumentation -- all require truthful ai_used data to function. This is the critical path item for the entire AI quality measurement layer.

**3. No drift detection / canary framework.**
V11_PLAN has no mechanism for detecting that AI quality has degraded. The prompt is set once and assumed stable. In practice, LLM outputs shift as models update and attack patterns evolve. Metric #11 (Prompt Drift Detection) is the structural answer. Without it, quality regression is detected only via mod complaints, weeks after the fact.

**4. No mod fatigue / burnout signal.**
Cat 3's workload features (F4 Personal Stats, F5 Lead Heatmap) surface activity counts but not trajectory. A mod going from 80 actions/shift to 10 over 3 weeks is the signal that matters. Metric #13 closes this gap.

**5. Analytics Engine is wired but structurally underused.**
`handleMetricsWrite` exists and accepts arbitrary events. The client calls it zero times in any hot path today. The binding declaration promises an observability layer that doesn't exist. Metric #26 (Analytics Engine adoption audit) forces the accounting before v11 ships.

---

## C. INSTRUMENTATION BETS (5 structural calls)

**1. Make ai_used=1 the first thing that ships in v11.**
Before any other AI quality metric can function, the acceptance signal must be truthful. UAT_MODMAIL E1 (send-direct button) is the fix. It's S-effort. It unblocks #1-#6, #9, #11, #17, #20, #22, #28. Every day this ships late, the training signal backlog grows. This is the critical path item.

**2. Analytics Engine as the primary AI observability layer, D1 only for forensics.**
The current pattern is: important things go to D1 (forensic, queryable, expensive to aggregate), and the Analytics Engine binding sits idle. Invert for high-volume metrics: per-request latency, per-call AI events, acceptance events, cache hits -- all go to Analytics Engine (aggregation-native, cheap, time-series-first). D1 stays for audit rows and join-able relational data. This is the architectural line to draw in v11.

**3. Confidence scoring as a first-class primitive, not a one-off modmail feature.**
V11_PLAN architecture bet #3 proposes `ai_hold_queue.confidence` as a D1 column. Cat 5 extends this: confidence scoring should be emitted to Analytics Engine for every AI feature (modmail, ban-suggest, sticky-detect, triage), with calibration tracked continuously (#9). A confidence score that's never calibrated is theater.

**4. A/B testing harness as infrastructure, not a one-time experiment.**
The prompt A/B test (#17) should be the first use of a generalized variant-assignment system stored in KV. Once built, every future prompt change runs through a variant experiment before full rollout. This prevents the "ship it and hope" pattern that currently governs prompt updates.

**5. Privacy boundary: mod identity yes, content identity no.**
The hard line: mod usernames and mod action patterns are staff-level data (included in metrics). GAW user PII (IP addresses, email addresses, private message content beyond what's already in D1 for moderation purposes) does not enter the Analytics Engine. Subject lines and thread IDs are acceptable (already in D1). Message body content is not stored beyond the modmail response body already tracked. The Analytics Engine schema must be audited against this boundary before any event types go live.

---

## D. RISKS (top 5)

**1. Goodhart's Law on AI acceptance rate.**
If "AI acceptance rate" becomes a performance metric for mods (visible in personal stats, mentioned by lead), mods will rubber-stamp AI suggestions to hit a number. The fix: acceptance rate is a tool for the system to learn, not a metric for evaluating mods. It must never appear in the mod-facing personal stats card. Only lead sees the aggregate, and only as a system health signal.

**2. Gaming the confidence score.**
If mods discover that lower-confidence items fall off the auto-send queue, they could manipulate the send path to avoid AI-reviewed items. Mitigation: the confidence score is computed server-side from the AI self-evaluation, not from mod behavior. Mods don't see the raw score -- they see ranked cards. The score itself is internal.

**3. Privacy creep in Analytics Engine.**
The Analytics Engine is structurally attractive for logging "everything." The risk is accumulating PII by accident -- a blob field that stores a GAW username when it should store a hash, or a subject line that contains a real name. Mitigation: code review gate specifically on Analytics Engine write calls before merge. Every `writeDataPoint` call must be justified against the privacy boundary defined in C5.

**4. Dashboard rot.**
A lead dashboard with 12 tiles and 3 drill-downs that nobody looks at is worse than no dashboard -- it's cognitive debt. Mitigation: at v11 launch, ship 4 tiles (SLA, active mods, ai acceptance rate, queue pressure). Add tiles only when a mod or lead explicitly requests a specific signal. Measure tile open rate after 30 days; remove anything below 10% weekly open.

**5. Alert fatigue.**
Six new alert types (token expiry, over-banning, idle mod, queue pressure, fatigue signal, drift detection) arriving in ModChat simultaneously will be ignored within a week. Mitigation: all alerts route to a single `#mod-alerts` sub-channel with severity tags. Lead sets a personal filter for which severities to be pinged on. Alerts that fire more than 3x per day without action are automatically escalated to lead for threshold review.

---

## E. CTO SYNTHESIS NOTES

The core finding: the system has measurement infrastructure (Merkle audit chain, Analytics Engine binding, D1 tables with ai_used/ai_tone columns, KV rate-limit buckets) that is structurally correct but functionally dormant. `ai_used` has never been true. The Analytics Engine has one route writing to it. The circuit breaker state is tracked but never surfaced. The ban-preflight rate limits are enforced against an empty table.

v11's metrics work is not "add observability" -- it is "activate the observability that was designed 3 versions ago." The critical path, in order:

1. **Ship UAT_MODMAIL E1** (send-direct button, ai_used=1 flag). Everything else in this document flows from truthful acceptance data. This is week 1.
2. **Adopt Analytics Engine systematically.** Define the 10 event types, review against privacy boundary, instrument them in the same wave as the features they measure. Metrics ship WITH features, not after.
3. **Confidence scoring** on modmail candidates (M effort, week 2). Gates auto-send and calibration.
4. **Lead dashboard with 4 tiles** (SLA, active mods, AI acceptance rate, queue pressure). No more than 4 at launch. Grow from there.
5. **Drift canary** (M effort, week 3). The only metric that cannot be derived from existing data -- it requires new infrastructure. Worth it because it's the only way to detect AI quality regression before it hurts mods.

Everything else in the top 28 is S-effort and can be layered in across waves without blocking the critical path.

The 80% modmail automation ceiling is a metrics problem as much as it is a UX problem. We cannot tune auto-send thresholds, confidence scores, or tone preference profiles without truthful feedback data. Fix the data collection first. The automation follows.
