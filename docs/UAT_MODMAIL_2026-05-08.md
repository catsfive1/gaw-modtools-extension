# UAT MODMAIL — v9.17.0 Pipeline Verification (2026-05-08)

## A) PIPELINE SOUNDNESS — file:line evidence

| Link | File:line | Status |
|---|---|---|
| **Ingest (live)** — inbox-intel poller parses `/modmail` rows, IDB-stores threads/messages, syncs to worker | `modtools.js:10164-10169` (`startInboxIntelPoller`) + `parseModmailListRow` + `syncCapturedToWorker` | OK |
| **Ingest (backfill)** — manual deep crawl pages 1..N | `modtools.js:10108-10159` (`crawlModmailHistory`) → exposed as `window.__GAM_BACKFILL_MODMAIL` | OK |
| **Backfill UI** — popup button #6 messages active GAW tab | `popup.js:3686-3709` (`maintModmailBackfill`) → `chrome.tabs.sendMessage('crawlModmailHistory')` | OK |
| **Backfill receiver** — content-script handles RPC | `modtools.js:19581-19583` | OK |
| **Store (D1)** — `mod_modmail_responses` table, indexed on thread/sender/mod/sent_at | `migrations/031_mod_modmail_responses.sql:9-25` | OK |
| **Track-on-send** — `apiSendModMessage` fires `modmailTrackResponse` post-success, fire-and-forget | `modtools.js:528-547` | OK |
| **Track endpoint** — inserts row into D1 with ai_used/ai_tone | `gaw-mod-proxy-v2.js:5035-5065` (`handleModmailTrackResponse`) | OK |
| **Consult past replies** — pulls last 3 same-sender rows, injects into prompt as examples | `gaw-mod-proxy-v2.js:4702-4717` (history-aware augmentation) | OK |
| **Suggest** — 4 parallel Llama 3.3-70b calls, distinct system prompts per tone | `gaw-mod-proxy-v2.js:4736-4825` | OK |
| **List recent** — `/modmail/recent` joins threads + last message | `gaw-mod-proxy-v2.js:4993-5031` | OK |
| **Ambient pre-fetch** — 15s settle + 10-min interval, 3 threads/cycle, 30-min freshness, `chrome.storage.session` | `modtools.js:14073-14115` | OK |
| **Render cached** — popover/panel pull cache before AI call | `modtools.js:14344-14350, 14444-14447` (popover); `14238-14246` (panel) | OK |
| **4-tone cards** — color-coded firm/empathetic/brief/escalate | `modtools.js:14271-14272` (panel), `14421-14422` (popover) | OK |
| **Sticky-detect** — GLOB scan modmail_messages + Llama JSON filter | `gaw-mod-proxy-v2.js:5072-5162` | OK |
| **Sticky UI** — popup button #5 calls `aiStickyDetect` | `popup.js:3624-3683` (`maintStickyScan`) | OK |

All 15 links execute in sequence. Pipeline is **structurally sound**.

## B) "80% AUTOMATED" FEASIBILITY — verdict: **NO, not from current architecture**

Current architecture suggests *drafts*, the mod still **manually copies + pastes** (`modtools.js:14430-14435, 14482-14487`). There is **zero auto-send path**. The pipeline is a draft-assist tool, not an auto-replier.

Specific gaps blocking 80%:
1. **No confidence scoring on AI replies.** All 4 candidates returned equally; no signal to skip/auto-send the high-confidence cases.
2. **No auto-send for low-risk categories.** No classifier (e.g., "this is a simple ban-appeal we always firm-deny" → fire firm tone automatically with audit log).
3. **`ai_used` flag never set true.** All 3 callers at `modtools.js:7618, 7710, 8025` pass NO opts → `ai_used: 0`, `ai_tone: null` always. The "did the mod actually use the AI draft" signal is **never recorded**, so the system cannot learn which tones land.
4. **Past-replies prompt doesn't filter by ai_used acceptance** — it pulls the last 3 same-sender replies regardless of whether they were AI-accepted. Noisy training signal.
5. **Sender-only history match.** No subject/topic similarity matching across senders. A first-time sender gets zero examples.

Realistic ceiling at v9.17.0: ~40-50% draft-acceptance with copy-paste friction. **80% requires a closed-loop accept-button + auto-send tier** (see §E).

## C) DEAD ZONES

1. **Empty modmail_threads on first install** — `_ambientModmailPrefetch` calls `modmailRecent` which returns `threads:[]` with a `note` field (`gaw-mod-proxy-v2.js:5029`). Pre-fetch silently no-ops until backfill runs. New mod sees empty popover → assumes broken.
2. **Token-absent fast-exit** — `_ambientModmailPrefetch:14074` returns silently if `getModToken()` falsy. No telemetry, no UI hint. A mod whose token expired sees stale cache for hours.
3. **`document.visibilityState === 'hidden'` skip** (`14075`) — mod with GAW tab backgrounded for >10 min gets zero pre-fetches; pre-fetch only catches up when tab refocused.
4. **`ai_used=0` always** — see §B.3. The `mod_modmail_responses.ai_used` column exists, the worker accepts it, the DB indexes it — but no caller passes the flag. **Wired but inert.**
5. **`crawlModmailHistory` unauthenticated path** throws; popup button shows generic "no GAW tab" rather than "log into GAW first" (`popup.js:3691`).
6. **Sticky-detect GLOB requires literal "sticky" substring** (`gaw-mod-proxy-v2.js:5093`). Misses "pin this", "make this a banner", "feature this post."

## D) DATA FLOW DIAGRAM

```
GAW /modmail page (HTML)
        |
        v
[parseModmailListRow] ──► IDB (threads, messages)
        |                       |
        |                       v
        |               syncCapturedToWorker
        |                       |
        |                       v
        |               D1: modmail_threads + modmail_messages
        |                       |
        |   ┌───────────────────┘
        |   |
        v   v
  /modmail/recent ◄─────────── handleModmailRecent (joins last message)
        |
        v
_ambientModmailPrefetch (10-min interval, token+visible)
        |
        v
  /modmail/ai-reply-for-thread ──► history augment ──► D1 mod_modmail_responses (last 3 same-sender)
        |                                                       ^
        v                                                       |
  Llama 3.3-70b × 4 parallel (firm/empathetic/brief/escalate)   |
        |                                                       |
        v                                                       |
  chrome.storage.session.gam_modmail_drafts (30-min TTL)        |
        |                                                       |
        v                                                       |
_showModmailPopover / _showModmailPanel ── render cards ──┐     |
                                                          v     |
                                          mod clicks "Copy + open"
                                                          |
                                                          v
                                          GAW thread tab opens, mod pastes
                                                          |
                                                          v
                                          mod clicks GAW [Send] (NOT instrumented)
                                                          |
                                                          v
                                          *Native GAW form* — extension's apiSendModMessage
                                          fires ONLY when mod uses Mod Console / warn UI
                                                          |
                                                          v
                                          rpcCall('modmailTrackResponse')
                                                          |
                                                          v ──────────────────┘ feeds next prompt
                                          handleModmailTrackResponse → INSERT
```

**Critical break in the loop**: the popover/panel "Copy + open" path (`14430-14435, 14482-14487`) bypasses `apiSendModMessage` entirely — the mod paste-and-sends on the native GAW form. **Tracking row is never written for AI-drafted replies that get pasted manually.** This is the single biggest pipeline defect.

## E) TOP 5 IMPROVEMENTS to reach 80%

| # | Improvement | Effort | Why |
|---|---|---|---|
| 1 | **Add a `data-send-direct` button on each AI card** that calls `apiSendModMessage(t.first_user, t.subject, rp.body, { thread_id: t.thread_id, ai_used: 1, ai_tone: rp.tone })` instead of copy-and-open. Closes the tracking loop, eliminates 2 manual steps per reply. | **S** | Eliminates the §D break. Single function call, opts already supported. |
| 2 | **Auto-send the highest-confidence tone for whitelisted simple categories** (e.g., subject contains "ban appeal" + sender has prior ban → fire firm reply automatically with 5-second undo toast). Audit-logged, ai_used=1. | **L** | The only path to true 80%. Requires category classifier + safety thresholds + undo. |
| 3 | **Confidence score per candidate.** Add second pass: ask Llama "rate 1-5 likelihood this reply resolves the thread" given the history. Sort cards by score, render top one with "Send" pre-selected. | **M** | Drives the #2 auto-send threshold. Same model, second prompt, ~500ms. |
| 4 | **Subject-similarity match in `handleModmailAiReplyForThread`** — when same-sender returns 0 rows, fall back to `LIKE %subject_keyword%` across all senders. Currently first-time senders get zero few-shot examples. | **S** | Improves draft quality on ~30% of threads (new senders). One extra D1 query. |
| 5 | **Persistent tracking key in IDB for `ai_used` reconciliation** — when a mod "Copy + opens" a draft, store `(thread_id, tone, body_hash)` locally. On next inbox-intel pass, when the outgoing message appears in modmail_messages with matching hash, retro-fire `modmailTrackResponse({ai_used:1, ai_tone})`. Recovers the §D loop without forcing a UI change. | **M** | Lower-disruption alternative to #1. Catches all paste paths (incl. mod editing the draft). |

**Recommended sequence**: ship #1 + #4 in v9.18 (S+S, immediate quality lift), then #3 in v9.19 (M, confidence signal), then #2 in v9.20 (L, the actual 80% unlock). #5 is a defensive backup if #1's UX is rejected.
