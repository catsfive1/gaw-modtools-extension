# UIUX2-40 -- Modmail Power-User Deep Audit
**Surface:** Modmail 3-col panel, popover, AI reply card flow, draft system, macros, sender intel, thread-list virtualization
**Agent:** UIUX2-40-MODMAIL-DEEP
**Version audited:** v10.13 (design ralph V2 baseline)
**Sources:** `UIUX-04_modmail.md`, `03_MODMAIL_3COL.md`, `UAT_MODMAIL_2026-05-08.md`, `modtools.js` (24,081 lines), skill: ui-ux-pro-max
**Date:** 2026-05-10

---

## A. 100-Thread Day Trace

The canonical power-user day. A mod arrives at 9am with 47 unread modmail threads. By noon another 53 arrive. The system must not degrade across this load. We walk every meaningful interaction node.

### A.1 Morning Open -- Cold Session (0 threads cached)

**State:** Extension just loaded. Session storage empty. AI draft cache empty.

1. Mod clicks `[📥]` status bar button.
2. `_showModmailPopover` fires. `rpcCall('modmailRecent', { limit: 15 })` starts (~200-500ms network).
3. Popover renders placeholder "loading recent modmail..." while RPC is in flight.
4. RPC returns 15 threads. Thread list renders as a scrollable 60px-row list. **47 threads are queued on the server -- only 15 load.** The popover `limit:15` cap means 32 threads are invisible until either scroll-triggered pagination or explicit Refresh.
   - **Gap: no scroll-triggered next-page in the popover.** The mod sees 15 rows. 32 threads are silently absent. On a 100-thread day this means the mod cannot triage from the popover -- they must expand to the full panel.

5. `_ambientModmailPrefetch` starts 500ms after first click. First cycle fetches 3 threads' AI drafts into session storage. Subsequent cycles fire every 10 minutes, 3 threads/cycle. **At 3 threads per 10 minutes, pre-warming 100 threads requires 330 minutes (5.5 hours). The ambient pre-fetch cannot scale to 100-thread days.**

6. Mod clicks `[↗ EXPAND]` to promote to full panel.

### A.2 Entering the 3-Col Panel

7. `_showModmailPanel()` fires. `window.innerWidth` check: at 1920px = 3-col (920px wide). At 1366px (laptop) = also 3-col but occupies 67.4% viewport -- confirmed curtaining issue from UIUX-04 §B.1.

8. Panel structure:
   - Col 1 (240px): Thread list, `limit:30`. **Panel fetches 30; 70 threads remain invisible at day-start.**
   - Col 2 (flex:1, ~360px at 920px wide): Sender intel strip + message thread.
   - Col 3 (320px): AI draft zone.

9. Thread list renders 30 rows at ~60px each = 1800px total list height. At 768px viewport, ~12 rows are visible without scroll. No virtual scrolling. **All 30 DOM nodes are present simultaneously.** At 100 threads (if limit raised), 6,000px of list content, 100 DOM nodes, potentially 100 `_renderIntelStrip` async fetches queued simultaneously.

10. Mod clicks thread #1. `renderDetail` fires:
    - Intel strip populates async from session cache or RPC.
    - AI column checks session cache -- cold session, no cache. Shows `[Generate 4 AI replies]` button.
    - Message thread renders in col 2.

### A.3 AI Reply Card Flow -- Cold Path

11. Mod clicks `[Generate 4 AI replies]`.
12. Current: `aiHost.innerHTML = '⌛ AI drafting (4 calls in parallel, ~3-5s)...'`
    Single gray text line. No skeleton. **3-5 second dead zone with no visual progress.**
    - The `ui-ux-pro-max` guideline `progressive-loading`: "Use skeleton screens / shimmer instead of long blocking spinners for >1s operations." **Violated.**
    - `loading-states`: "Show skeleton or progress indicator when loading exceeds 300ms." **Violated.**

13. AI RPC returns 4 drafts: `firm / empathetic / brief / escalate`. Cards render in 2-column grid inside 320px col 3.
    - 2-column grid in 320px = two ~148px card halves. Body text at 10px truncates at ~18 chars/line. Cards are readable but cramped for longer drafts.
    - `03_MODMAIL_3COL.md §G` already flags: "2-up grid may be too wide for 320px col; set to `1fr` for v0." **The 2-up grid has not been collapsed to 1-col in 320px.** Cards need to stack vertically.

14. Mod reads cards. Selects best tone. Clicks `[Copy + open]`.
    - Clipboard receives reply body.
    - New tab opens GAW thread.
    - `modmailTrackResponse` fires with `ai_used:0` (the `ai_used` flag is never set to 1 per UAT §B.3).
    - **Mod must switch to the new tab, locate the reply field, paste, and send. This is a 4-step manual process for every thread.**

15. Mod returns to the panel tab. Panel is still open on the same thread. **No "sent" confirmation inside the panel.** The mod has no visual signal that this thread is resolved from within the modmail surface.

### A.4 Draft Preservation Under Tab Navigation

16. Mod opens a thread, clicks `[Generate 4 AI replies]`, reads them, but doesn't act yet. They click thread #2 in the list.

17. `renderDetail` fires for thread #2. **Thread #1's AI cards are discarded -- col 3 now shows thread #2's AI zone.** If thread #1's drafts were pre-fetched (session cache), re-clicking thread #1 will restore them without a new RPC call. If not cached, they'll regenerate on demand.

18. Mod has been editing a reply in the Mod Console `mm_reply` tab (separate surface). They switch browser tabs. The `mm_reply` tab debounces saves every 350ms -- draft is silently persisted to session storage. No visual indicator (P1-B.4 from UIUX-04). Mod has no confidence their edit survived the tab switch.

### A.5 Macro Selection Flow

19. Mod opens Mod Console for a user from within a thread (via header link or separate sus-popover). Navigates to the `mm_reply` tab. Clicks `[+ Macro]` dropdown.

20. Macro list renders all stored macros in a dropdown. Mod clicks a macro. Body populates the textarea. The `_showDraftChip` call fires on restore only (confirmed UIUX-04 §B.4). No "Draft restored" indicator beyond the chip.

21. Mod edits the macro body. Edit autosaves every 350ms. **No "Saving..." / "Saved" indicator.** On a 100-thread day where the mod is customizing macros for every thread, the absence of save confirmation creates anxiety: "Did my edit persist before I clicked to the next thread?"

22. Mod wants to inject a macro directly into a thread from within the full modmail panel. **There is no macro injection path inside the panel itself.** The mod must open Mod Console separately. On a 100-thread day this adds an additional surface-switch for every macro-use. **Power-user gap: no inline macro picker in the panel's col 2 compose area (which doesn't exist yet -- see A.4 / A.14).**

### A.6 Sender Intel Inline Drilldown

23. Thread #1 intel strip populates: `u/username | 2y | BAN 3 | SUS | WATCH`. Mod sees a high-risk user: 3 prior bans, sus flag, watching.

24. Mod wants more detail: account creation date, last post, recent comment score. **Current intel strip shows 4 chips. No hover card. No expand.** The mod must open the full Mod Console separately and navigate to the user lookup.

25. On a 100-thread day, if 20% of threads have high-risk senders, that's 20 Mod Console opens just for sender research -- each breaking the modmail flow.

26. The data exists: `getUserSummary` returns post_count, comment_score, recent_activity, last_active_at. **None of it is surfaced beyond the 4 chips.** The `03_MODMAIL_3COL.md §C` spec intentionally deferred hover card to v.next.

### A.7 Afternoon Load -- 50 New Threads Arrive

27. Panel has been open for 3 hours. Mod clicks `[Refresh]`. Fires `window.__GAM_BACKFILL_MODMAIL` -- 3-5 page crawl. Panel thread list re-renders with updated data.

28. `limit:30` remains. If 53 new threads arrive, the mod sees the 30 most recent. 23 threads are invisible unless they scroll to a "load more" trigger -- **which does not exist.** No infinite scroll, no load-more button in the panel thread list. On a 100-thread day the panel is structurally capped at 30 visible threads.

29. Session storage AI draft cache may have stale entries from the morning. TTL is 30 minutes. By afternoon, all morning's cached drafts have expired. On click, every thread regenerates from scratch (3-5s each).

---

## B. Scalability Bottlenecks

### B.1 DOM Bloat -- Thread List

**Current:** Panel fetches `limit:30`. Each thread row is a DOM node with ~6 child elements (status span, subject, from, timestamp, unread badge, border). At 30 threads: 180 DOM nodes for the list. At 100 threads (no limit change): 600 DOM nodes, all live in the DOM simultaneously, none virtualized.

**Threshold:** The `ui-ux-pro-max` guideline `virtualize-lists` states: "Virtualize lists with 50+ items to improve memory efficiency and scroll performance." At 30 we're just under this threshold. The moment `limit` is raised above 50 (a legitimate need for 100-thread days), DOM bloat becomes measurable.

**Memory impact:** Each thread row also holds event listeners (`click`, hover state). At 100 threads with 2 listeners each = 200 live event listeners for the list alone. Not catastrophic, but non-trivial when combined with 100 simultaneous `getUserSummary` RPC calls if the mod rapidly scrolls.

**Risk:** HIGH at current limits, CRITICAL if `limit` is raised without virtualization.

**Mitigation path:** A windowed renderer that keeps only the 15 rows in the current viewport + 5 above/below in the DOM. Standard `IntersectionObserver` pattern. Estimated effort: Medium (2-3 days). Required before `limit` can safely exceed 50.

### B.2 Ambient Pre-Fetch Rate vs. Thread Volume

**Current:** 3 threads per 10-minute cycle. Full warm-up at 100 threads = 330 minutes.

**Problem:** This is not a pre-fetch -- it's a slow background trickle. On a 100-thread day the mod will spend 80% of their day hitting cold-cache states (the 3-5s "Generate" wait). The prefetch was designed for light modmail volumes (10-20 threads/day). It doesn't scale.

**Root cause:** The 3-thread-per-cycle limit is a rate-limit defense (avoid hammering the Llama API). At 4 parallel calls per thread × 3 threads = 12 Llama calls per cycle. Reasonable for light loads; inadequate for heavy days.

**Mitigation options:**
- Increase cycle batch size to 10 threads on first warmup (one-time), then throttle to 3/cycle for maintenance. This would warm 100 threads in ~33 minutes after first open.
- Alternative: on panel open, immediately kick off a "batch warm" of the 30 visible threads in parallel (120 Llama calls -- needs rate limiting). Aggressive but 30-second warm vs. 5.5-hour warm.
- The `chrome.storage.local` mirror (`gam_modmail_drafts_local`) already provides persistence across sessions. The cold-session problem (P0-A.2 from UIUX-04) is a separate fix: read local mirror on cold start. This alone would eliminate the morning cold-cache problem if the previous session's drafts are still fresh.

### B.3 Draft Sync -- Session vs. Local Mirror Gap

**Current:** Drafts write to `chrome.storage.session` (volatile, per-browser-session). A `_mirrorDraftToLocal` function writes to `chrome.storage.local` as a TTL fallback. However:

- The panel and popover `renderDetail` never read from local mirror on session cache miss (P0-A.2).
- On browser restart or extension update, the mod returns to a completely cold cache.
- A 100-thread day interrupted by a Chromium update mid-day = all cached drafts lost, all 100 threads return to cold state.

**Consequence:** The `gam_modmail_drafts_local` key exists in `chrome.storage.local`, the write path is wired, and `popup.js` reads it for purge logic. This is a read-path omission, not an architectural flaw. One 6-line fix (per UIUX-04 §D.2) eliminates the cold-restart problem entirely.

**Draft collision risk:** If two mods are logged into the same account (shared modmail account scenario) and both have the panel open, session storage is per-tab. Local storage is shared. `_mirrorDraftToLocal` writes with a last-write-wins strategy. No locking. On a coordinated modmail team (multiple mods hitting the same inbox), draft caching could serve stale or wrong-session drafts. Not a current use case, but worth noting.

### B.4 AI Rate-Limit Exposure

**Current:** Each `[Generate 4 AI replies]` click fires 4 parallel Llama 3.3-70b calls. 100 threads × 4 calls = 400 API calls if the mod generates for every thread.

**No client-side rate-limit guard** exists in the "Generate" button path. No debounce, no queue, no backpressure. If a mod clicks 5 threads in rapid succession before any complete, 20 parallel Llama calls fire simultaneously.

**Worker-side:** The proxy (`gaw-mod-proxy-v2.js`) handles `modmailAiReplyForThread`. No rate-limit middleware visible in the audited endpoint. Protection depends entirely on Llama API quotas and any upstream gateway throttle.

**Risk:** On a 100-thread day where the mod doesn't wait for pre-fetch and clicks "Generate" on every thread: potential API rate-limit errors, 429 responses, or cascading failures. No retry UI exists -- on failure the AI host shows an error message with no retry button.

**Mitigation:** A client-side request queue with a max-concurrency of 3-4 AI calls at once. The queue drains sequentially, preventing burst. Estimated effort: Low (1 day). The pre-fetch already uses a sequential pattern; the on-demand path needs the same discipline.

---

## C. Power-User Flow Gaps

### C.1 No Send-Direct Path (Architectural)

Every AI-assisted reply requires: read card -> click `[Copy + open]` -> switch tab -> paste -> click send -> switch back. That's 5 manual steps per thread.

On 100 threads where the mod uses AI drafts for 60% = 60 threads × 5 steps = 300 manual actions. This is the top friction item on a heavy day.

**UAT §E.1 flagged a `data-send-direct` button path.** Not implemented. The architectural blocker is that the extension cannot programmatically submit GAW's native reply form (cross-origin form submission is blocked). Solutions exist but require more than a CSS patch:
- Service worker intercept of the GAW modmail POST endpoint with the extension's auth token.
- A dedicated `/modmail/send` proxy endpoint on the worker that takes `thread_id + body` and submits on behalf of the mod.

This is v.next scope, not v10.13. But it must be scoped and designed before v11.

### C.2 No Thread Status Update in Panel

After a mod sends a reply (via the copy+open flow), the panel thread list doesn't update. The thread still shows as "pending." The mod must manually Refresh the panel to see updated status. On a 100-thread day, stale status in the list creates confusion: "Did I already reply to this one?"

**Gap:** No optimistic update when `[Copy + open]` fires. The `modmailTrackResponse` call could simultaneously fire a local status update in the thread list row.

### C.3 No Keyboard Navigation Between Threads

The thread list is clickable only. No arrow-key navigation. On a 100-thread day, a power-user's hands stay on the keyboard for speed. Without `ArrowUp/Down` to select threads and `Enter` to open, every thread switch requires a mouse click.

`ui-ux-pro-max` rule `keyboard-nav`: "Tab order matches visual order; full keyboard support." **Violated for thread list navigation.**

### C.4 No Bulk Action Surface

After 100 threads arrive, a common power-user task is: mark all as read, bulk-assign tone responses, or bulk-dismiss low-priority threads. No bulk selection UI exists. Each thread requires individual action.

This is explicitly out of v10 scope -- no design for it exists. But it's the defining difference between "modmail tool" and "modmail power tool." Should enter V11 scope.

### C.5 Macro Injection Unavailable in Panel

The full modmail panel (the primary surface for heavy modmail days) has no compose area and therefore no macro picker. The macro system exists only in the Mod Console `mm_reply` tab -- a separate surface. On a 100-thread day, every macro-assisted reply requires opening a second panel.

This is a gap in the 3-col panel's feature set, not a bug. The 3-col panel was designed as read + AI-assist only. But the power-user mental model is: "I'm in the modmail panel, I want to send a reply with a macro." The current architecture forces a context switch.

**Design recommendation:** Add a minimal compose row to the bottom of col 2 in the panel: `[textarea] [Macro ▾] [Send via GAW]`. The `[Send via GAW]` button does what `[Copy + open]` does today. The `[Macro ▾]` dropdown injects macro body into the textarea. This keeps the mod in one surface for the full reply flow.

### C.6 No Thread Aging or Priority Signals in List

Thread list shows: subject line, sender username, timestamp. No visual priority signal. A thread with a BAN-flagged sender looks identical to a thread with a new account sender. A mod reviewing 30+ threads cannot visually triage by risk before clicking each one.

**Design recommendation:** Thread list rows should show intel chips inline (right-aligned): a BAN chip if `ban_count > 0`, a SUS chip if sus_flag. The intel data is fetched per-thread via `_renderIntelStrip` anyway -- cache the result and back-populate the list row chip at the same time.

---

## D. Virtualization Need

### D.1 Verdict: Required Before `limit > 50`

At current `limit:30` the panel is tolerable without virtualization. The 30 DOM nodes are lightweight and the scroll distance is manageable.

**However:** The design goal of handling a 100-thread day requires either:
1. Virtualized thread list supporting 100+ rows, OR
2. Keeping `limit:30` with robust scroll-triggered pagination (load next 30 on scroll-to-bottom).

Option 2 is simpler and sufficient. A `IntersectionObserver` sentinel at the bottom of the thread list triggers the next `modmailRecent` page fetch. This avoids full virtualization complexity while handling 100+ threads gracefully.

### D.2 Virtual Scroll Design (if chosen)

If true virtualization is selected (for future 500+ thread scenarios):

**Row height:** Fixed at 60px (required for virtualization -- variable-height rows add complexity).
**Visible window:** 15 rows rendered at a time (~900px, comfortably fits any viewport height for the panel).
**Buffer:** 5 rows above + 5 rows below the visible window = 25 total DOM nodes at any time (vs. 100+ without virtualization).
**Implementation:** `IntersectionObserver` on sentinel rows at top and bottom of the rendered window, shifting the window up/down on intersection. No library needed -- this is 50-80 lines of JS.

**State preservation on scroll:** The selected thread (highlighted row) must remain visible when the window shifts. `scrollIntoView` on selection is already the correct behavior.

### D.3 Memory Budget

At 100 threads, full DOM: ~600 nodes × ~300 bytes/node estimated = ~180KB DOM overhead for the list. Acceptable on desktop. With virtualization: ~150 nodes × 300 bytes = ~45KB. The saving is meaningful on lower-RAM machines (8GB with 20 Chrome tabs).

The bigger memory concern is the AI draft cache: 100 threads × 4 drafts × ~500 chars each = ~200KB in session storage. Well within `chrome.storage.session` limits (10MB). Not a bottleneck.

---

## E. Effort Estimates

| Item | Description | Effort | Priority |
|---|---|---|---|
| **E1** | Local draft mirror fallback on cold session (P0-A.2 fix) | XS -- 6 lines in renderDetail + popover init | P0 -- ship now |
| **E2** | Send button re-enable on success (P0-A.1 fix) | XS -- 3 lines | P0 -- ship now |
| **E3** | 3-col breakpoint fix to 1400px (P1-B.1 fix) | XS -- 1 line | P0 -- ship now |
| **E4** | AI draft loading skeleton (4 ghost cards + shimmer) | S -- ~15 lines JS + 1 CSS keyframe | P1 -- next sprint |
| **E5** | Draft save "Saved" chip on mm_reply textarea | S -- ~10 lines + 1 DOM element | P1 -- next sprint |
| **E6** | Unified toneColor const across all 5 AI card surfaces | S -- 1 const + 5 reference sites | P1 -- next sprint |
| **E7** | AI card 1-col stack in 320px col 3 (fix 2-up grid) | XS -- 1 CSS change in renderAICards | P1 -- next sprint |
| **E8** | Thread status optimistic update after Copy+open | S -- 5 lines in the copy handler | P1 -- next sprint |
| **E9** | Scroll-triggered pagination in panel thread list | M -- ~40 lines, IntersectionObserver sentinel | P1 -- v10.13 |
| **E10** | Keyboard nav (ArrowUp/Down/Enter) on thread list | M -- ~30 lines, keydown handler + focus management | P2 -- v10.14 |
| **E11** | Intel chips inline in thread list rows | M -- feed intel strip results back to row DOM | P2 -- v10.14 |
| **E12** | Sender intel hover card (expanded data on hover) | M -- 30-line tooltip, reads getUserSummary | P2 -- v10.14 |
| **E13** | AI request client-side queue (max 3 concurrent) | M -- ~50 lines, Promise queue | P2 -- v10.14 |
| **E14** | Batch warm on panel open (10-thread first cycle) | S -- change prefetch cycle-1 batch size | P2 -- v10.14 |
| **E15** | Compose row in panel col 2 (textarea + Macro dropdown) | L -- new UI surface, requires macro data load in panel context | P2 -- V11 scope |
| **E16** | Send-direct proxy endpoint (`/modmail/send`) | XL -- new worker endpoint + auth, cross-origin send | P2 -- V11 scope |
| **E17** | Virtual thread list (IntersectionObserver window) | L -- 80 lines, requires fixed row height audit | P2 -- V11 scope |
| **E18** | Bulk action surface (select-all, bulk reply) | XL -- new UX paradigm, selection state model | P3 -- V11 research |

---

## F. Design Recommendations Summary

### F.1 Immediate (ship with v10.13 -- all XS/S, no risk)

1. **Fix cold-session draft read path** (E1). The local mirror exists; just read it. Eliminates the #1 first-load frustration.
2. **Fix send button stuck-disabled** (E2). A mod who can't send a second message without closing the panel is a broken mod.
3. **Fix 3-col breakpoint to 1400px** (E3). 1366px laptops are common. Curtaining 67% of viewport is unacceptable.
4. **Fix AI card 1-col stack in 320px** (E7). 2-up cards in 320px are readable only if card bodies are < 3 lines. Longer drafts truncate without visual indication.

### F.2 v10.13 Sprint (ship before 100-thread day is a reality)

5. **AI loading skeleton** (E4). 3-5s dead zones on cold-cache thread opens are the highest daily friction point. Ghost cards with shimmer cost 15 lines and visually cut perceived latency in half.
6. **Draft save indicator** (E5). The silent save is anxiety-inducing for a mod editing 50 macros in a day. A 1.5s "Saved" chip is 10 lines.
7. **Unified tone colors** (E6). Three surfaces showing the same tones in different colors breaks the visual language. One const fixes all five locations.
8. **Scroll-triggered pagination** (E9). Without this, the panel is structurally capped at 30 threads. A 100-thread day is impossible on the current architecture.
9. **Optimistic status update after Copy+open** (E8). Zero-cost signal to the mod that the thread has been handled.

### F.3 Design Principle: The Panel Must Own the Full Reply Loop

The 3-col panel is the right primary surface for a heavy modmail day. But it currently owns read + AI draft selection only. Write (compose) lives in the Mod Console. Intel drilldown lives in the Mod Console. Bulk actions don't exist anywhere.

The V11 direction must be: **the panel is the complete modmail workstation.** Col 1 = thread queue. Col 2 = read + compose. Col 3 = AI + intel. No surface switches for any step in the reply flow. The UAT §E.1 `data-send-direct` button and the compose row (E15) are the architecture pivots that unlock this.

Until V11, the current panel is a competent draft-review tool. It is not a 100-thread-day workstation. The mods who will stress it hardest are exactly those who need the frictionless compose path most.

---

*UIUX2-40 complete. 5 P0/P1 patches ready for immediate ship (E1-E3, E7, E4). V10.13 sprint defined (E5, E6, E8, E9). V11 architectural scope identified (E15-E18).*
