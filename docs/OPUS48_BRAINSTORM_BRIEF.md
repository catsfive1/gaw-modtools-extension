# Opus 4.8 Brainstorm Brief — GAW ModTools v11 Strategy

**Context for Opus:** You are consulting on GAW ModTools, a Chrome MV3 extension
moderating greatawakening.win (a political forum). The main file is `modtools.js`
(~1.7MB). The current production version is v10.36.0. The lead moderator is
Commander Cats. Design decisions go through him. You are here to brainstorm
architecture and strategy — NOT to write code. Propose, defend, identify tradeoffs.

**Hard constraints you must never violate:**
- HI-1: Real bans are browser-side via Cloudflare Bot Fight Mode. All ban paths
  MUST route through `addToDeathRow(username, delayMs, reason)` — 72h delayed,
  idempotent, 20s undo. Never immediate-ban outside that function.
- The worker (`gaw-mod-proxy-v2.js`) is a separate gated deploy. Don't design
  features that assume you can deploy it on demand.
- The extension is unpacked-loaded in Brave (MV3). CWS submission blocked on
  screenshots. No auto-update for now — Commander reloads manually.

---

## Topic 1 — Wave 2 Bar Taxonomy

**The problem.** The in-page action bar currently has buttons that emerged
organically (no taxonomy). STORM items #3/#4/#5/#9/#10/#13 are all blocked
waiting for Commander to approve a bar grouping before we build them.

**The proposed taxonomy (Sonnet's recommendation):**
```
SHIELD  |  MOD  |  QUEUE  |  FILTERS  |  CHAT
```
- **SHIELD**: protect-the-mod ops — undo, redo, your own DR cancel, watchlist add
- **MOD**: actions on the post/comment author — ban, DR, flag, clear, watch
- **QUEUE**: work queue ops — skip, approve, reject, escalate
- **FILTERS**: view/scope controls — filter by risk, IP cluster, flag type
- **CHAT**: mod-to-mod comms — quick note, ping, thread discussion

**Brainstorm questions:**
1. Does SHIELD/MOD/QUEUE/FILTERS/CHAT make sense for a 1-15-mod operation, or
   is it over-engineered for the actual workflow?
2. Should FILTERS be a bar section or a drawer/panel that slides out?
3. QUEUE and MOD have heavy overlap when reviewing queue items. Should they
   collapse into one section on the queue page?
4. What grouping would a brand-new mod "just get" without training?
5. Is there a simpler 3-section taxonomy that serves 90% of the use cases?

---

## Topic 2 — HI-1: Ban + Remove + Watch Wiring

**The problem.** The current in-page bar has Ban, Remove, Watch buttons that
visually exist but functionally:
- Ban: routes to `executeBan()` which does an immediate ban. HI-1 requires
  this become `addToDeathRow()` instead.
- Remove: currently calls the GAW remove endpoint directly — but there's no
  "remove + queue" abstraction. Removed content is gone.
- Watch: the watchlist is local-only (localStorage) — there's no server-side
  watch signal, so Watch currently just sets a local flag and snacks "watching"
  with no network action.

**Brainstorm questions:**
1. Should "Ban" on the in-page bar become "→ Death Row (72h)" with a different
   label/color so the lead knows it's queued, not immediate? What label?
2. "Remove" — is the right behavior (a) remove + auto-add to DR, or (b) remove
   only (content gone, user not queued), or (c) ask with a preflight dialog?
3. Watch: currently honest (snacks "watching" even though nothing hits the server).
   Should we (a) keep it honest-but-local until a server endpoint exists, or
   (b) build a worker KV watch-list endpoint now, or (c) remove the button until
   it works?
4. The 20s undo snack for Death Row — is 20s the right window for a mod who just
   clicked the wrong user, or should we lengthen it to 60s?
5. Is there a case for a "Probation" tier between Watch and Death Row — visible
   badge on the user, no ban queued, just a signal to all mods "this one is hot"?

---

## Topic 3 — V11 Roadmap Prioritization

**Context.** The `FEATURES_MATRIX_v10.5.md` has ~30 requested features not yet
built. Sonnet has been working through STORM items (hardening, not new features).
Commander wants to plan the v11 generation before we build it.

**Candidate themes (Sonnet's read of the backlog):**
| # | Theme | What it is | Estimated scope |
|---|---|---|---|
| A | AI mod assist | Auto-flag high-risk users via pattern matching; surface AI recommendations on new registrations | Large — classifier, worker endpoint, new bar button |
| B | Brigade detector | Detect coordinated posting (same IP block + same time window + similar content) | Medium — needs D1 migration 043/044 |
| C | Mod-to-mod chat overhaul | Persistent thread-based chat (vs current ephemeral snack pings) | Medium — new panel, new KV schema |
| D | Probation tier | Mid-tier between Watch and DR — visible badge, no ban queued | Small — roster state + UI badge |
| E | Bulk actions on all pages | DR/Ban/Watch from any page (post, profile, search) — currently only /users and the queue | Medium — need global action bar abstraction |
| F | Audit log viewer | In-extension view of the D1 audit log — search by mod, date, action type | Medium — worker query endpoint + panel |
| G | On-call rotation | Round-robin assignment of incoming flags to available mods | Large — requires presence signal |
| H | CWS submission unblock | Get screenshots done, submit to CWS, enable auto-update | Small/ops — not code, just execution |

**Brainstorm questions:**
1. Which 3 themes unlock the most mod capacity per hour of build time?
2. Is H (CWS submission) a prerequisite for anything — i.e., does Commander
   need auto-update before he trusts larger features landing silently?
3. AI mod assist (A) — what's the minimum viable version? A local-rule engine
   that pattern-matches usernames/join-timing without a classifier, or does it
   need the full ML pipeline?
4. Brigade detector (B) — how real is the problem today? Is it happening in
   the forum and we're not catching it, or is it hypothetical?
5. What's the one thing that would make Commander's daily mod session 50%
   faster if it existed?

---

## Deliverable from Opus 4.8

For each topic, Opus should produce:
- A 1-paragraph recommendation (what to build and why)
- 2-3 concrete tradeoffs or risks
- A "smallest shippable slice" — what can ship in one session vs what needs planning

Opus does NOT need to write code. Sonnet will implement from the recommendation.
Keep the output tight — Commander is time-constrained. Bullet answers > essays.
