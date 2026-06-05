# Bot Raid Shield — Locked Requirements (v1)

**Date:** 2026-06-05
**Owner:** Claude (CTO, C5 Operations) — for Commander Cats
**Status:** LOCKED for build. Source of truth for the red-team storm + implementation.
**Feature name:** Bot Raid Shield

> Productize and harden the bot-detection engine the project **already owns**
> (`/ai/score`, `mod_user_sus`, Discord `#ai-tools`, mod-chat broadcast, Death
> Row, the on-site Triage Console). We are NOT building a detector from scratch.

---

## Ground truth — existing primitives we BUILD ON (do not reinvent)

| Capability | Primitive | Location |
|---|---|---|
| Username → bot risk | `POST /ai/score` — batches ≤50 usernames, returns `{scores:[{u,risk:0-100,reason}],provider,model}`. Free Workers AI **Llama 3.3 70B** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`), Grok/Claude fallback. Prompt already flags `WordWord1234` + "coordinated naming". | `gaw-mod-proxy-v2.js:2827` |
| AI cost caps (the scarce resource under attack) | `aiPreflight()` — 20/min/mod, 200/day/mod, 5000/day global, 2000-char prompt. KV-backed. | Worker:284 |
| SUS LIST backend | D1 **`mod_user_sus`** (`username, marked_by, reason, marked_at, expires_at, cleared_at, cleared_by`; `UNIQUE(username)`) | migration 022 |
| DR auto-rule patterns | D1 `dr_rules` (`pattern TEXT` = JS regex) | migration 023 |
| Death Row | `addToDeathRow(user, delayMs, reason)` / `processDeathRow()` → `modBan`; 72h default; bulk loop + `triageSelected` checkbox set exist | `modtools.js:5177, 8669, 15771` |
| Notify all mods | Mod-chat broadcast `to_mod='ALL'` (poll-based, unread badges) | `modtools.js:17546` |
| Discord | `POST /discord/post` (mod-token, `{content,embeds,username}`) + `discordWebhookSend()` w/ D1 retry queue; `AI_TOOLS_CHANNEL_ID=1495787282106552400` bound; `bot_mods` maps gaw-username→discord_id; mentions = `<@ID>` | Worker |
| USERS page | On-site **Triage Console** `buildTriageConsole()`/`refreshTriageConsole()`, container `#gam-triage`, toolbar + hidden batch bar + collapsible sidebar | `modtools.js:16202, 15066` |
| Client→Worker | `rpcCall(name,args)`, base `gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev`, `X-Mod-Token` auth | `modtools.js:26648` |
| Current ext version | **v10.18.9** | `manifest.json` |

---

## Locked requirements

- **R1 — HARD INVARIANT: AI auto-populates the SUS LIST ONLY.** A SUS user
  **NEVER** moves to Death Row until a **human mod** intervenes. There is **no
  auto-ban path. Ever.** (Aggressive auto-DR mode is explicitly KILLED.)
- **R2 — SUS LIST card:** always pinned to the **top** of the `/users` Triage
  Console; **auto-hides when empty**; **collapsible**.
- **R3 — Disposition flow:** all SUS rows arrive **pre-selected**; mod
  **REMOVES** false positives (removal = "this username was OK", drops from the
  list); **one "FLUSH TO DR" button** queues the remaining selected users to
  Death Row (existing 72h delay + `processDeathRow`).
- **R4 — Raid alarm:** when **≥5** users land in SUS within a rolling window →
  (a) mod-chat **broadcast to ALL**, (b) Discord **#ai-tools** post mentioning
  **@dropgun + @lonewulf**, (c) a proactive **incident** notice banner.
  **De-duped: one alert per raid**, not one per 60s refresh.
- **R5 — Robot status-bar icon:** **hidden** in normal operation; **appears
  ONLY when AI detects a possible raid**; click → opens the SUS/raid panel.
- **R6 — "Report Bot Raid" intake:** a box where a mod pastes **example bot
  names** or a **loose pattern**. Llama **infers the family** (a generalized
  matcher + a plain-English description). Roster candidates are scored;
  high-risk → SUS LIST. **The pattern is a SEED, not a hardcoded rule.**
- **R7 — Fuzzy + cheap-first:** a **free heuristic prefilter** (trailing-digit
  run, dictionary-word segmentation, name-shape entropy, zero-karma /
  zero-comment, registration-time clustering) gates which candidates are worth
  an AI call. **Llama adjudicates the ambiguous middle** — this is what makes
  detection fuzzy at the edges and protects the AI cost caps from exhaustion.
- **R8 — Self-improving (build from v1):** every mod disposition is a labeled
  signal. **FLUSH-TO-DR = confirmed bot** (deliberate → **high weight**).
  **REMOVE = false positive** (can be a lazy skim → **lower weight**). Feed
  back as few-shot context to sharpen scoring + tune heuristic thresholds as
  the enemy mutates. **A lazy unmark must never teach systemic blindness** —
  weighting + full auditability enforce this.
- **R9 — Adversary assumption:** enemies use **abliterated / jailbroken AI** and
  **will mutate** usernames the instant a rule becomes visible (4-digit,
  leetspeak, separators, homoglyphs, real-name camouflage). They will also
  **weaponize false positives** — salting a raid with real-looking or genuinely
  real usernames to bait mistaken bans and crater mod credibility. The design
  must survive **active mutation** and **false-positive weaponization**.

---

## Safety invariants (non-negotiable)

1. No user is ever penalized by AI alone (R1).
2. Every AI score + every mod disposition is auditable (who/what/when/why).
3. The 72h Death Row delay + mod-chat post during the delay = team veto window.
4. Cheap heuristics gate AI spend so an attacker can't blind us by exhausting caps.
5. Confirmed-bot signal outweighs unmark signal in the learning loop (R8).

---

## Build-time inputs needed from Commander (non-blocking)

- **@dropgun + @lonewulf numeric Discord IDs** (for `<@ID>` mentions). The
  `#ai-tools` channel is already bound (`1495787282106552400`); confirm it's the
  right target. Build proceeds config-driven with placeholders until provided.

## Explicitly out of scope for v1

- Aggressive / hands-off auto-DR (killed per R1).
- Replacing the existing similarity/lookalike graph (we may *consume* it later).
