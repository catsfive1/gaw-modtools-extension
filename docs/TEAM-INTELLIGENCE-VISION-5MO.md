# MODTOOLS as a Team Brain — the 5-month vision (2026-07-07)

Framing: the mod team is ONE distributed organism. Each mod is an antenna;
the D1 database is shared memory. The tool's prime directive: **no piece of
intelligence dies in one mod's head.** Everything one mod learns, every other
mod benefits from — near-instantly, without asking.

## Where we are (PROVEN this session — the sync surface is already strong)

Every team INPUT that is intelligence (not private workflow state) already
syncs to all mods via the worker → D1:

| Input | RPC / path | Sync |
|---|---|---|
| SUS markings | modSusMark/List/Clear | push + 60s poll + on-focus + post-action |
| Auto-DR regex/pattern rules | /mod/dr-rules + pattern-push | push-on-change + 60s poll |
| Auto-Tard rules | pattern-sync | push + 60s poll |
| Watchlist | modWatchUser | server-side |
| Per-user mod notes | modProfilesWrite (concurrent-edit guarded) | server-side |
| Ban templates / macros | modMacroSave/Load | server-side |
| Mod-to-mod chat | /mod/message/* | poll |
| Audit log | /audit/log + /audit/query | server-side |
| Team settings/flags | /mod/settings | 5min poll |
| Raid intelligence | /raid/* | on raid events |

Correctly PRIVATE (not a gap — personal workflow, not shared intelligence):
- `gam_reviewed_seen` review-progress bookmark (which /users rows *I* cleared).
  Sharing it would corrupt every other mod's review queue. Stays local by design.

The architecture pattern is sound: **optimistic local write → worker → D1 →
other mods pull (push-on-change where it matters, 60s poll everywhere, instant
on tab-focus).** The acting mod sees their action instantly; teammates within
60s or the moment they focus their tab.

## The gap between "syncs" and "team brain" — what an elite researcher still wants

Sync ≠ intelligence. The data flows; the INSIGHT isn't always surfaced. The
5-month arc is about turning synced rows into surfaced intelligence.

### Tier 1 — client-only, reuses existing RPCs, NO deploy (ship these first)
1. **Repeat-offender / institutional-memory badge.** On any user row or hover,
   surface "we've dealt with this actor before" — prior SUS flags, prior notes,
   prior watch, prior ban — pulled from modSusList + cloud profiles the team
   already shares. Removes the "same actor, fresh account, nobody remembers"
   blindness. (Brief: BUILD-BRIEF, size M, intel-only.)
2. **Team activity pulse.** A compact, always-current "what the team has done
   recently" glance (last N team actions across all mods) over /audit/query —
   so any mod has situational awareness without asking in chat. Turns the
   audit log from a personal record into team awareness.
3. **Audit-Log Viewer.** The queryable self-audit panel already briefed
   (docs/BUILD-BRIEF-AUDIT-LOG-VIEWER.md) — the read surface the pulse builds on.
4. **Sync-health indicator.** A small, honest "team sync: live · last pull 12s
   ago" signal so the operator can TRUST the hive mind is connected, and
   instantly see if the worker link drops. Trust is a feature.

### Tier 2 — needs a NEW worker endpoint + D1 (deploy-gated; next worker session)
5. **Alt-account / ban-evasion graph — the crown jewel.** When a user is
   flagged or banned and a new account shows the same signal (IP-hash overlap,
   posting cadence, target overlap, writing fingerprint), the team is told:
   "likely alt of <banned user>." Partial infra already exists
   (/mod/user/lookalike-confirmed, /mod/user/cadence, raid clustering). This is
   the single highest-value capability for an elite researcher and the biggest
   reason bad actors currently slip back in. Needs modGetAltsForUser +
   link-scoring in the worker + a D1 junction. Deploy-gated → schedule with a
   worker-deploy session (Commander must authorize the deploy).
6. **Near-real-time propagation.** Replace the 60s SUS/DR poll with a
   lightweight change-feed (SSE or a cheap /mod/changes?since= cursor) so a
   teammate's flag lights up on other screens in ~1-2s, not up to 60s. Nice,
   not urgent for a small team — 60s + on-focus is already fine. Low 80/20
   priority; do it only if the team grows or the operator asks.

## The 80/20 call
The sync foundation is DONE and proven — that was the load-bearing worry and it
holds. The remaining value is surfacing (Tier 1, client-only) and the alt-graph
(Tier 2, deploy-gated). Tier 1 items 1-2 are the 20% that delivers 80% of the
"team brain" feeling tonight. The alt-graph is the marquee 5-month item and
correctly waits for a worker-deploy session. Real-time push is a unicorn for a
small team — deliberately NOT chased.
