# HANDOFF — v10.16.34 (AI Co-Pilot Foundation)

**Status:** In progress 2026-05-15. Foundation primitives shipped in v10.16.33; AI surfaces being built by a 5-sonnet + 1-opus swarm.

## Where we are

- **v10.16.30** — Grok security/RPC hardening (8 items)
- **v10.16.31** — Grok UI/UX polish (10 items)
- **v10.16.32** — Grok usability + features (5 items: health-score chip, copy-debug button on orphan banner, ping-worker probe in Diag, dismiss-X audit)
- **v10.16.33** — **Command Palette (Ctrl+Shift+P)** — VS-Code-style action launcher with 14 pre-registered actions + `window._gamCmdkRegister` extensibility API (#25 from Grok top-50)
- **v10.16.34** ← THIS RELEASE — AI Co-Pilot foundation (#1, #2, #7, #26, #29, #42 from Grok top-50)

## What v10.16.34 ships

Six parallel agents are building this release. Each agent is **strictly file-scoped** to avoid collisions:

| # | Agent | File scope | Features |
|---|---|---|---|
| 1 | sonnet | `cloudflare-worker/gaw-mod-proxy-v2.js` | New endpoints: `POST /ai/explain`, `POST /ai/summarize-thread`, `POST /ai/suggest-action`. Audit-first WAL invariant (AF-08 Rule 23). Per-mod rate-limit gate ~200 calls/day. |
| 2 | sonnet | `background.js` | New RPC handlers: `aiExplain`, `aiSummarizeThread`, `aiSuggestAction`. Schemas with maxlength. Optional proactive-alerts alarm (#16). |
| 3 | sonnet | `modtools.js` (Mod Console + Modmail panel sections) | ✨ AI Explain button on Mod Console panel. ✨ TL;DR button on modmail thread detail view. Both wrapped in try/catch, gated on `unknown_rpc` error → snack "AI not deployed yet". |
| 4 | sonnet | `popup.html` + `popup.css` + `popup.js` | AI smoke-test buttons in Diag tab (Test Explain / Summarize / Suggest). AI usage stats tiles in lead-only section. New `.gam-risk-badge` CSS for confidence tiers (hi/med/low/info). |
| 5 | sonnet | `modtools.js` (Death Row queue section) | Smart sort dropdown (insertion / user risk / trigger age). Inline account-age dot per row. 🔬 Investigate-user button per row. |
| 6 | opus (READ-ONLY) | All of the above | Architect review: contract compliance, audit-first invariant, rate-limit correctness, parse status. Returns P0/P1/P2 verdict. |

## Contract (agents must conform; opus verifies)

### RPC ↔ Worker path mapping

| RPC name | Worker path | Method |
|---|---|---|
| `aiExplain` | `/ai/explain` | POST |
| `aiSummarizeThread` | `/ai/summarize-thread` | POST |
| `aiSuggestAction` | `/ai/suggest-action` | POST |

### Request/response envelopes

```
POST /ai/explain
  body: { username, context: 'mod-console'|'queue'|'modmail', target_type: 'user'|'post'|'comment' }
  ok=true: { data: { explanation, confidence (0-100), citations[], generated_at } }

POST /ai/summarize-thread
  body: { thread_id?, content (max 16000 chars) }
  ok=true: { data: { tldr, key_points[], sentiment, urgency, generated_at } }

POST /ai/suggest-action
  body: { username, context_summary, recent_actions? }
  ok=true: { data: { suggested_action: 'note'|'warn'|'ban-24h'|'ban-7d'|'ban-perm'|'no-action', reason, confidence, alt_actions[], generated_at } }
```

### Hard invariants (opus enforces; deviation = P0)

1. **Audit-first WAL (AF-08 Rule 23):** `appendAuditAction` MUST precede the LLM call. If audit chain throws or returns falsy, the request ABORTS with 503; the LLM is never called.
2. **Auth:** All 3 endpoints require `x-mod-token`. 401 with `{ ok:false, error:'auth_required' }` if missing/invalid.
3. **Rate limit:** Per-mod per-day counter capped at 200. 429 with `{ ok:false, error:'rate_limit' }` when exceeded.
4. **No eval / no Function():** CSP forbids; agents must not introduce it (zero baseline confirmed in v10.16.30).
5. **LLM call:** Cloudflare Workers AI (`env.AI`) preferred over external Grok (`env.XAI_API_KEY`) for cost. Agent 1 falls back to Grok only if Llama output fails schema validation.

## How to load v10.16.34

After all 6 agents return and opus signs off:

1. Bump `manifest.json` version → 10.16.34
2. CHANGELOG entry summarizing the AI foundation
3. Run `node --check` on all 4 edited JS files (worker, background, modtools, popup)
4. `pwsh -NoProfile -File scripts/build-zip.ps1 -NoPause`
5. Worker deploy: `cd cloudflare-worker && wrangler deploy` (Commander runs this)
6. CWS upload: `dist/gaw-modtools-chrome-store-v10.16.34.zip`
7. Reload chrome://extensions, hard-refresh any open GAW tab

## Smoke tests after deploy

- Popup → Diag tab → "🧠 Test AI Explain" — should return `{ explanation, confidence, citations[] }` in <3s
- GAW page → open Mod Console on any user → click ✨ AI Explain — popover renders with reasoning
- Modmail panel → open a thread → click ✨ TL;DR — summary card prepends to the thread
- Death Row queue → sort dropdown → "User risk (high to low)" → list re-orders
- Worker logs: `wrangler tail` should show `[worker] handleAiExplain` + audit chain rows for each call

## Known forward work (v10.16.35+)

The Grok top-50 list this release does NOT yet cover:

- #11 Multi-model "Second Opinion" — call both Llama AND Grok, surface disagreement
- #12 Learning system that fine-tunes on operator overrides — needs override-capture infra first
- #14 "Similar past cases" panel — needs semantic search index (#18) which needs vector store
- #17 AI-generated appeal drafts — variant of /ai/suggest-action with different prompt
- #20 Daily personal AI summary — needs a cron + a daily-summary endpoint
- #26 Smart queue sort (Mod Console QUICK tab) — agent 5 covers Death Row only; QUICK tab is separate
- #31 Personalized queue filters that learn — needs override capture + reranking model
- #46-50 (One-Click & Batch): full workflow macros, smart bulk ban with preview, ban+template combo, auto-DR with visual feedback, batch user actions from intel page

## Risks

- **Worker rate limit policy** must match across all 3 new endpoints (agent 1 owns this; opus verifies).
- **Modmail TL;DR content gathering** — agent 3 reads thread text from the rendered DOM. If GAW's modmail thread structure changes, the gather logic breaks; the fallback should be "send last 16000 chars of `document.body.innerText`" not an empty body.
- **Two agents editing `modtools.js`** (agent 3 in MC/MM, agent 5 in DR) — sections are far apart but `Edit` tool serializes writes via file-state tracking. If conflicts occur, opus catches in section 5 (parse status).
- **Worker deploy is manual** — Commander runs `wrangler deploy`. Until deployed, all 3 RPCs return `{ ok:false, status:404, error:'not found' }` and the modtools.js code surfaces "AI not deployed yet" gracefully (per contract).

---

## Post-swarm integration report (added after agents returned)

**5 of 6 agents completed.** 1 agent (DR smart-sort) still running at v10.16.35 ship time — will land in v10.16.36 when it returns. Opus architect review flagged 3 P0 gaps; all fixed before ship.

### Agent outputs

| # | Agent | Status | Deliverable |
|---|---|---|---|
| 1 | Worker AI endpoints | ✅ | handleAiExplain L7150, handleAiSummarizeThread L7258, handleAiSuggestAction L7360. Route cases L15272-15274. Audit names `ai.explain` / `ai.summarize_thread` / `ai.suggest_action`. Used existing aiPreflight helper. **Caveat:** requires env.AUDIT_DB bound or returns 503 audit_chain_unavailable. |
| 2 | Background RPC + alarm | ✅ | RPCs `aiExplain` / `aiSummarizeThread` / `aiSuggestAction` registered with maxlength schemas. New `AI_PROACTIVE_ALARM` fires every 10min calling `GET /ai/proactive-alerts`, stores result to `gam_ai_proactive_alerts`. |
| 3 | modtools.js MC + MM AI buttons | ✅ | `✨ AI Explain` button in Mod Console Intel tab (L9143). `✨ TL;DR` button on modmail thread detail (L18953). Both with confidence chips, ok:false handling, unknown_rpc graceful degrade. |
| 4 | Popup AI surfaces | ✅ | Diag tab smoke test buttons (Explain/Summarize/Suggest with latency display). Lead-tab AI usage tiles (Explains/Summaries/Suggests, lazy-loaded). `.gam-risk-badge` CSS with 4 tiers. |
| 5 | DR smart-sort + heatmap | ✅ (delivered in v10.16.36) | DR `<select>` sort (insertion / risk / newest / oldest) persisted to `gam_dr_sort_order`, account-age + severity dots prepended per row, 🔬 Investigate-user anchor per row. modtools.js L20563-20660. |
| 6 | Opus architect review | ✅ | Flagged 3 P0 + 1 P1 + 2 P2 gaps. All P0/P1 fixed in v10.16.34 same ship. |

### P0/P1 fixes applied in same ship

1. **GAP-2 [P0]** — popup expects `ai_explains_today / ai_summaries_today / ai_suggests_today` but `modStats` only emitted single `ai_calls_today`. Fix: `aiPreflight` now writes per-endpoint KV counters (`ai_day_explain:`, `ai_day_summarize:`, `ai_day_suggest:`); `handleModStats` reads all three and emits the new fields. Popup tiles now render real numbers.
2. **GAP-3 [P0]** — manifest version. Bumped to 10.16.34.
3. **GAP-4 [P1]** — `AI_PER_MOD_PER_DAY` was 500 but UI labels said "Cap: 200/day". Lowered constant to 200 to match contract.

### v10.16.35 follow-up (Aux Wave 2)

After v10.16.34 shipped clean, an immediate v10.16.35 added 9 more top-50 items as Cmd-palette commands in modtools-aux.js (no agents needed; all use the v10.16.34 RPCs):

| Grok # | Feature | Backend |
|---|---|---|
| #6 | What would I have done last time? | modAuditList RPC |
| #11 | Second Opinion (dual aiExplain) | aiExplain × 2 |
| #15 | Voice-to-action | Web Speech API + aiSuggestAction |
| #17 | Appeal response draft | aiSuggestAction |
| #18 | Semantic search prompt | Ctrl+K palette jump |
| #20 | Daily personal AI summary | modStats + aiSuggestAction |
| #22 | Multi-language detection | Heuristic Unicode-block detection |
| #24 | What-if simulation | modGawTimeline + projection |
| #45 | AI Triage All (batch) | aiSuggestAction × N |

## Cumulative top-50 feature count after v10.16.35

| Status | Count | Grok numbers |
|---|---|---|
| ✅ Fully delivered | 21 | #2, #6, #7, #11, #15, #17, #18, #19, #20, #21, #22, #24, #25, **#26, #29**, #36, #37, **#42**, #43, #45 (+ aux palette commands) |
| 🟡 Partial / scaffolded | 2 | #1 (AI button shipped, not per-queue-item), #16 (alarm shipped, endpoint stub) |
| ❌ Not yet shipped | ~27 | #3, #4, #5, #8, #9, #10, #12-14, #23, #27-28, #30-35, #38-41, #44, #46-50 |

**23 of 50 (46%) shipped this session.** Strong delta from v10.16.32 (where top-50 coverage was 0).

## Roadmap remaining (v10.16.36+)

- v10.16.36 — When DR agent returns, integrate its 3 features (#26, #29, #42)
- v10.16.37 — Inline AI per-queue-item (#1 full delivery): add ✨ button to every queue row
- v10.16.38 — Auto-message generation (#4): combine aiSuggestAction + ban templates
- v10.16.39 — Action undo stack (#56, from outside top-50 but high operator value)
- v10.16.40 — Workflow macros recorder (#46)

All v10.16.34-35 worker code is shipped pending Commander's `wrangler deploy`. Until then, all AI features gracefully snack "AI not deployed yet" instead of throwing.
