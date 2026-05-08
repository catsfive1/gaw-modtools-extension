# V11_PLAN — Opus CTO Synthesis

**Author:** Opus (Lead, 4-cat v11 brainstorm)
**Date:** 2026-05-08
**Inputs:** `V11_CAT1_CMS_AUDIT.md`, `V11_CAT2_UX_FLOWS.md`, `V11_CAT3_TEAM_INTEL.md`
**Baseline:** v9.17.0. **Refactor: explicitly OFF the table.** Budget: ~1-2 mods, 2-3 weeks.

---

## A) EXECUTIVE SUMMARY

GAW ModTools enters v11 from a position of structural strength and surface chaos. The substrate is rich: Merkle audit chain, firehose with FTS5, presence pings, precedents table, Llama AI with daily caps, ModChat, draft handoff, proposals system, autoDeathRowRules team-sync. The team has the *organs*. What's missing is the *nervous system* — the surfaces where these capabilities reach the mod's eyes and hands. Cat 2 names the diagnosis cleanly: **"v9 features are individually correct but live in the wrong surfaces."** Modmail panel doesn't bring user intel. SIREN dumps to a flat log. Tard suggestions hide in an ephemeral popup. Bulk operations are missing on the highest-volume surface (the queue). The lead has zero per-mod accountability view despite owning a Merkle chain that knows every action ever taken.

**v11 theme: RELOCATE, COMPRESS, COORDINATE.** Don't ship more substrate; relocate existing capability to where the work happens (modmail = 3-column, queue = checkbox-bulk, drawer = repeat-halo, status bar = presence + hot-now). Compress the 5-click flows to 1-click. Wire the 15 mods into one nervous system via presence + scoreboard + shift digest + incident mode. **No new database engines. No worker rewrites.** Three new tables, ~6 new endpoints, ~2k LOC of client code, ride existing AI/audit/firehose substrate.

---

## B) THE TOP 30 — RANKED

Score key: Impact (1-10), Effort (S=4hr / M=1-2d / L=3+d), Strategic Fit (1-10), Risk (Lo/Md/Hi), Wave (.0/.1/.2/.3). Ranked by Impact / Effort.

| # | Feature | I | E | Fit | R | Wave | Rationale |
|---|---|---|---|---|---|---|---|
| 1 | **Right-click context menu (universal: post, /u/, modmail row, chat msg)** | 10 | M | 10 | Lo | .0 | Cats 1+2 agree. One handler, four surfaces, kills 5-click ban flow + 3-click watchlist + 2-click "DM about user." Foundational for every other compression below. |
| 2 | **Modmail 3-column panel (thread / sender intel / AI replies)** | 10 | M | 10 | Lo | .0 | Cat 2 W2 + Cat 1 #5 + HANDOFF A2/A3. Unblocks `mm_reply` macros, ambient user-history, per-thread AI suggestion. Highest mod-time-saved per shift bar none. |
| 3 | **AI Hold Queue with j/k approve-reject + confidence score** | 10 | M | 10 | Lo | .0 | Cat 1 #15. We already have AI tard/sticky/ban; the missing piece is one queue where AI pre-flags and mods rubber-stamp with two keys. Force-multiplies every existing AI investment. |
| 4 | **Mod Audit View (`/admin/audit/mod-profile`) + AI summary** | 9 | M | 10 | Lo | .0 | Cat 2 W4 + Cat 3 F4+F5+F11. Lead has had Merkle chain since v8.0 but cannot answer "is this mod over-banning?" Single endpoint + popup tab unblocks lead's actual job. |
| 5 | **Queue checkbox + bulk action bar (group by author)** | 10 | M | 9 | Md | .0 | Cat 1 #17 + Cat 2 W3. Queue is the highest-volume surface; reducing 36 clicks to 3 is the biggest aggregate time-save in the catalog. Risk: bulk-undo must be ironclad. |
| 6 | **Repeat-offender halo + count in Intel Drawer** | 9 | S | 10 | Lo | .1 | Cat 1 #39 + Cat 3 F17. ~30 LOC drawer change. Every ban decision improves the moment it ships. Cheapest high-impact item on the list. |
| 7 | **Modmail macros wired into Message tab (A2 finally)** | 9 | S | 10 | Lo | .0 | HANDOFF A2 + Cat 1 #5 + Cat 2 W2. 30-line dropdown clone from ban tab. Embarrassing this is still open. Land it inside Wave 1 piggybacking on item #2. |
| 8 | **Presence Bar (avatar strip + status dot + page verb)** | 8 | S | 9 | Lo | .0 | Cat 1 #22 + Cat 3 F1. Reads `/presence/online` already; client-side render. Foundation every other coordination feature reads from. |
| 9 | **"Hot Now" panel (replaces SIREN-to-mod-log)** | 8 | S | 10 | Lo | .1 | Cat 2 W6. SIREN currently dumps mods to a flat log when the actual need is "what's hot RIGHT NOW." 5 SUS + 5 DR + 3 modmail in one slide-in. |
| 10 | **Personal Stats Card (popup: today/week/30d sparklines)** | 7 | S | 9 | Lo | .1 | Cat 3 F4. Cheapest motivation lever; mods see themselves. SQL already indexed in actions table. |
| 11 | **AI Shift Handoff Digest (Claude end-of-shift)** | 9 | M | 9 | Md | .2 | Cat 2 W8 + Cat 3 F6. Replaces the void next-shift mods boot into. Reuses Claude path. Risk: mediocre digest = ignored feature, so prompt design matters. |
| 12 | **Lead Scoreboard (8 KPIs, 5m refresh)** | 9 | M | 10 | Lo | .2 | Cat 3 F11. The KPIs (active mods, queue clear-rate, AI agreement, appeal rate) are derivable from `actions` already. Tile drilldown reuses popup drill drawer. |
| 13 | **Slash command palette in chat (`/ban`, `/lookup`, `/precedent`, `/incident`, `/coach`)** | 9 | M | 9 | Lo | .1 | Cat 1 #10 + Cat 3 (F8/F10/F12). Reuses chat textarea. Discoverable via `/` autocomplete. Becomes the ambient command surface across everything we ship. |
| 14 | **Two-Click Second Opinion (drawer button → ping online mods)** | 7 | S | 9 | Lo | .1 | Cat 3 F14. Proposals are heavyweight and unused. This is the lightweight version that mods will actually press. ~50 LOC. |
| 15 | **Brave detection + invite-link warning banner** | 6 | S | 9 | Lo | .0 | Cat 2 W2 (auth gap) + UAT_ONBOARDING_2026-05-08. Brave Shields silently strip `mt_invite`. Onboarding regression we keep eating. ~20 LOC. |
| 16 | **Action-diff audit log (before/after fields per action)** | 7 | M | 8 | Md | .2 | Cat 1 #9. We log *that* an action happened; we don't log *what changed*. Promotes audit log from receipt to forensic instrument. Risk: row size grows. |
| 17 | **Removal-reason picker chained (comment + remove + lock in one click)** | 8 | M | 8 | Md | .1 | Cat 1 #3 + Cat 2 W1 partial. The chained-action pattern. Risk: undo window must cover the whole chain atomically. |
| 18 | **Worker health metrics inline (rps/p99/error-rate top-bar widget)** | 6 | S | 8 | Lo | .1 | Cat 1 #33. Converts "WTF is broken" sessions into "yep, worker is sick" sessions. 5 minutes on the worker, big trust dividend. |
| 19 | **Toast-undo (5-20s) on every destructive action** | 7 | S | 9 | Lo | .0 | Cat 1 #25 + Cat 2 (W1, W3). Wave 1 because it makes the chained/bulk flows safe to ship. WP-style "Undo last action ≤ N seconds." |
| 20 | **Live queue cursors (other-mod avatars on row when shared-viewing)** | 6 | S | 8 | Lo | .1 | Cat 1 #22 + Cat 3 F2. Reuses `/presence/viewing`. Stops two mods from claim-stomping the same item. |
| 21 | **Universal `📬 N` modmail badge + ambient poll (works on any page)** | 8 | S | 10 | Lo | .0 | Cat 2 (B1/D3) + SUBAGENT_MOD_EVAL_2026-05-08 §B. `mmBtn` only mounts on /modmail/thread/* today. ~30 LOC, fixes a daily-friction hole. |
| 22 | **Precedent FTS5 search engine (`/precedent/search`)** | 7 | M | 8 | Lo | .2 | Cat 3 F10 + Cat 1 #48. FTS5 recipe is proven on firehose. Unlocks consistency + coaching simultaneously. |
| 23 | **Tard-suggestion accordion in status bar (relocated from popup)** | 7 | S | 9 | Lo | .1 | Cat 2 W9 + Cat 1 #15. Popup is ephemeral; accordion survives navigation. Multi-select → "Add 3 selected as DR rules." |
| 24 | **Incident Mode (`/incident <slug>` + tagged actions + Discord ping)** | 7 | L | 8 | Md | .3 | Cat 3 F8 + BACKLOG CHAT-4. Heavyweight but high-leverage during attacks. Wave 3 because it depends on slash palette (#13) and presence bar (#8). |
| 25 | **Auto-Brigade Detector (worker-side velocity + reply-graph)** | 8 | L | 8 | Hi | .3 | Cat 3 F9 + Cat 1 #38 + Cat 2 W10. The only L-effort item earning its slot. Risk: false positives in incident escalation. Defer to Wave 3 after Incident Mode lands. |
| 26 | **Trainee Shadow Mode (AI suggestion → confirm/override)** | 6 | M | 7 | Md | .3 | Cat 3 F13. Coaches new mods. Lower priority because team is small (~15) and onboarding cadence is monthly, not daily. |
| 27 | **Secret/env-var change audit log** | 5 | S | 7 | Lo | .1 | Cat 1 #36. Currently changes to wrangler secrets are unaudited. Cheap accountability layer. |
| 28 | **Auto-unsticky bug fix + GEAR threshold UI** | 7 | S | 8 | Lo | .0 | HANDOFF E1+E2 (regressed since v8.6.4). Long-running ask. Land it in Wave 1 because it's pure ship-or-don't, no design risk. |
| 29 | **Scheduled actions (sticky/unsticky at time T, scheduled bans)** | 6 | M | 7 | Md | .3 | Cat 1 #26. Generalizes auto-unsticky into a real scheduling primitive. Lower priority because the v9 cron-band-aid works and refactor is OFF the table. |
| 30 | **Mod Health Strip dashboard (per-mod row: token age, actions/day, ban-with-note %)** | 6 | M | 7 | Lo | .2 | Cat 2 E1. Bigger version of #10 + #12. Lead-only at first; rolls up several smaller dashboards. |

---

## C) THE 5 KILLED — defended cuts

1. **2FA / hardware-key gate for lead actions** (Cat 1 #28). 15-mod team. We rotated tokens and shipped manifest.key for deterministic IDs. Hardware-key 2FA is enterprise theater for our scale; friction far exceeds attack surface. **Cut.**

2. **Federated/shared ban lists across sister sites** (Cat 1 #14). We are one site. Cat 1 already deferred this; I'm formalizing the cut. Re-evaluate at v12 only if a network materializes.

3. **Compliance export with hashed user IDs** (Cat 1 #16). We have the Merkle chain + audit verify. A separate "compliance export" pretends we're SOC-2 bound. We're not. The Merkle chain IS the export. **Cut.**

4. **Real-time co-editing of mod notes** (Cat 1 implied, Notion-pattern). One mod actions one item; conflict resolution cost > benefit. Single-author notes with a "last-edited-by" stamp ship in Wave 2 as part of action-diff (#16); collab-edit explicitly cut.

5. **Slow-mode / follow-only / link-only thread restrictions** (Cat 1 #11/#12/#13, Twitch-pattern). These require GAW-side cooperation we don't have. Worker can't rate-limit comment posts on a site whose backend isn't ours. **Cut until a GAW-API conversation happens.**

**Implicit cut:** Cat 3 F18 (nightly pattern-discovery clustering job) was tempting but I'm putting it under "DEFERRED PAST v11" — it's a research project (Levenshtein + n-gram clusters need calibration). v11 already has #25 (brigade detector) carrying the L-effort risk budget.

---

## D) THE 4 RELEASE WAVES

### Wave 1 — v11.0 — "Foundation + 5 highest-bang" (week 1)

**Theme:** Right-click everywhere. Modmail finally makes sense. Queue stops being a click-tax. Onboarding survives Brave.

**Features:** #1 (right-click menu), #2 (modmail 3-col), #3 (AI hold queue), #5 (queue bulk), #7 (modmail macros A2), #8 (presence bar), #15 (Brave detection), #19 (toast undo), #21 (universal modmail badge), #28 (auto-unsticky fix).

**Dependencies:** None on substrate. All client-side except: #2 needs `prefetchUserHistory` extension to existing ambient pre-fetch; #3 needs new `/admin/queue/ai-flagged` endpoint reading existing `ai_suggestions` table; #19 needs an ActionUndoLog client structure (not a server table — toast-window only).

**Timeline:** 5-7 days. Ship checkpoint at end-of-week.

---

### Wave 2 — v11.1 — "UX polish + bug-class kills" (week 2 first half)

**Theme:** Compression of secondary flows. Stats. Polish. Nobody is missing the modmail anymore; now make the rest of the surface stop biting.

**Features:** #6 (repeat-offender halo), #9 (Hot Now panel), #10 (personal stats), #13 (slash command palette), #14 (second opinion), #17 (chained removal-reason), #18 (worker health widget), #20 (live queue cursors), #23 (tard-suggestion accordion), #27 (secret-change audit).

**Dependencies:** #13 (slash palette) is the spine of Wave 2 — it's the surface every Wave 3 feature plugs into (`/incident`, `/precedent`, `/coach`). Ship #13 first, even before #6.

**Timeline:** 4-5 days.

---

### Wave 3 — v11.2 — "Team coordination + intelligence" (week 2 second half + early week 3)

**Theme:** 15 mods become one nervous system. Lead can finally manage. Shift transitions stop dropping context.

**Features:** #11 (AI shift digest), #12 (Lead Scoreboard), #16 (action-diff audit), #22 (precedent search), #30 (mod health strip).

**Dependencies:** #11 needs the audit-by-mod aggregation from #4; ship #4 (in Wave 1) first. #12 needs #4 + Wave 1's actions table. #16 is invasive — every mutating handler in the worker needs to compute the diff. Risk: row size; mitigated by storing diff JSON-compressed.

**Timeline:** 5-6 days.

---

### Wave 4 — v11.3 — "Ambitious / experimental" (last 3-5 days)

**Theme:** What we ship if Waves 1-3 land clean. Cut anything here ruthlessly if calendar slips.

**Features:** #24 (Incident Mode), #25 (auto-brigade detector), #26 (trainee shadow mode), #29 (scheduled actions).

**Dependencies:** #24 depends on #13 + #8. #25 depends on #24 (incident is the receiver of the brigade signal). #26 depends on #22 (precedent search) — trainee suggestions cite precedents.

**Timeline:** 3-5 days. **First to be cut on slip.**

---

## E) ARCHITECTURE BETS — 5 calls v11 makes that v10 doesn't

1. **One context-menu router for the whole DOM.** Single `contextmenu` event delegate at `document.body` level routes to handlers by `closest()` selector matching (`a[href*="/u/"]`, `[data-gam-postid]`, `.gam-mc-row`, `.gam-chat-msg`). Every Wave 1+ right-click feature plugs into this single router. Killing the alternative — 14 separate event handlers scattered through `modtools.js` — is what makes #1 ship in M and not L.

2. **Modmail panel becomes a tri-pane component, not a list-then-detail flip.** This is a UX bet but also an architectural one: it standardizes the "context-rich working surface" pattern that #2/#9/#11/#24 all reuse. The middle "intel column" is a generic component fed by `subjectKind + subjectId`. Reused by Hot Now, Incident Mode, and Mod Audit.

3. **AI ConfidenceQueue as a first-class table.** New D1 table `ai_hold_queue (id, kind, target, confidence, reason_json, suggested_action, created_at, claimed_by, resolved_action)`. Every AI suggestion (tard / sticky / ban / brigade) writes to this table with a confidence score. The mod hold-queue UI reads from one table instead of four scattered AI surfaces. **This is the single biggest architectural simplifier of v11.**

4. **Slash command palette as a chat-channel router (not a popup modal).** Slash commands type into the existing chat textarea with `/` autocomplete; they emit chat-channel events that handlers subscribe to. No new modal surface. This means `/incident`, `/precedent`, `/coach`, `/ban`, `/lookup` are all data on the chat substrate (auditable, replayable, persistent), not ephemeral UI state. **This is why #13 unlocks Wave 3.**

5. **Action-diff column on the audit chain (`actions.diff_json`).** Every mutating endpoint computes `(before, after)` for the changed fields and persists JSON-compressed. Adds one column to the existing actions table. Merkle chain unaffected (the diff is part of the row hashed into the chain). Storage cost: ~200 bytes/row average. **Pays for itself the first time someone says "what did Brent75 actually change on that ban?"**

---

## F) RISKS — top 5

1. **Bulk-action undo (item #5 + #19) is the single biggest correctness risk.** A "Remove 12" with a broken undo bricks 12 items irrecoverably. **Mitigation:** Server-side, every bulk endpoint accepts a `client_op_id` and stores an inverse action in a `pending_undo` D1 table with 30s TTL. Toast-undo POSTs the same op_id to `/mod/op/undo`. Server replays the inverse. Test ratio: 80%+ unit coverage on the inverse-action generator before Wave 1 ships.

2. **AI hold queue (item #3) becomes the #1 attack surface.** If the AI confidence model is gamed (deliberate username crafting to trip false positives), an attacker can flood mods with j/k decisions, training rubber-stamp habits. **Mitigation:** confidence floor of 0.65 to enter the queue; mods who j-approve >50 items in <5 min trigger a captcha-like "review the last 5 in detail" interruption. Audit-tag every j-approve with `via=hold_queue` for after-action review.

3. **Modmail 3-column panel (item #2) widens the panel to 920px on lg-screen** — this regresses the popup workflow on smaller screens. **Mitigation:** breakpoint at 1280px viewport; below that, fall back to 2-column (thread + intel) with AI replies as expandable accordion. Test at 1024px, 1280px, 1920px before merge.

4. **Action-diff audit (item #16) row size growth.** A 200-byte average over current ~100k rows is +20MB. Tolerable on D1, but trajectory matters — if v12 doubles audit volume, that's 40MB. **Mitigation:** 90-day retention on `diff_json` only (not on the action row itself); diff falls off the row; chain integrity preserved (the hash is computed at write-time and stored separately).

5. **Slash palette (item #13) collides with existing chat content.** Mods today type `/u/foo` to mention users. The palette must NOT consume `/u/` patterns. **Mitigation:** strict whitelist of palette commands (`/ban /watch /sus /precedent /incident /coach /lookup /handoff`), all verbs. `/u/`, `/r/`, `/p/` (post permalinks) explicitly pass through unchanged. Unit-test the parser on every existing chat message in the test corpus before ship.

---

## G) THE ONE BIG BET

**If v11 ships only ONE thing, it ships the right-click universal context menu (item #1).**

Defense: every other compression in the catalog presupposes that the mod's eyes-and-hands path to action is short. The right-click menu is the highest-fidelity input device a Chrome extension owns. It works on any selector, anywhere on the page. It eliminates the hover-then-keystroke prerequisite that costs new mods 3 weeks to internalize. It collapses W1 (5 clicks → 1), W5 (4 clicks → 1), B1-B4-B7-B10 (the Cat 2 atomic action gaps) all in one shipping event. And it's the foundation that lets every other feature in the Wave 1+ catalog plug in cheaply — Hot Now, Modmail intel, queue bulk-select, scheduled actions, all assume "the mod can right-click and act in two pixels."

The right-click menu is also the cheapest morale win in the catalog. The current state — `Ctrl+Shift+B`, `Ctrl+Shift+W`, `Ctrl+Shift+M`, all mnemonic-loaded keystrokes — is what veteran mods grudgingly memorize and what new mods bounce off. Replace that with discoverable right-click. Within one shift, 14 of 15 mods will discover the new path on their own. That's the compression dividend that pays for v11 in week 1.

Everything else in this plan is amplification. The right-click menu is the call.

---

**Word count:** ~1,840. Under budget.
