# UAT ADVOCATE REPORT — User's Voice on v9.17.0

**Author:** the user advocate (a volunteer mod, not a developer)
**Date:** 2026-05-08
**Frame:** I'm a volunteer. I have 5 minutes before I want to be moderating, not configuring.

---

## A) THE USER'S BILL OF RIGHTS

| # | Right | Status |
|---|---|---|
| 1 | I have the right to install once and never think about extension plumbing again. | ⚠ — `manifest.key` makes IDs stable, but the "pick `unpacked/` not parent folder" foot-gun is still in INSTALL.md as a literal warning. |
| 2 | I have the right to know which token field gets which token, without reading docs. | ⚠ — 🔑 Team and 👑 Lead now live on a Tokens tab, but the visual difference is two emojis. New mods still paste in the wrong slot. |
| 3 | I have the right to one obvious primary action per screen. | ✅ — Tabbed popup + amber primary CTAs deliver this. |
| 4 | I have the right to recover from any mistake within 30 seconds. | ✅ — Auth-fail banner, Force re-hydrate, INVITE-CODE-vs-TOKEN auto-detect, 401→Claim routing. Strong. |
| 5 | I have the right to know what the AI did and why, before I act on it. | ✅ — Confidence pills, severity tags, "AI drafting…" status, mod log records `source:'ai-suggested'`. |
| 6 | I have the right to use this on Brave/Linux without being a beta tester. | ❌ — HANDOFF doc admits "untested on Brave/Linux as of v9.6.6." That's the platform half my forum is on. |
| 7 | I have the right to never see the word "rehydrate" or "schema migration." | ❌ — Both are surfaced as buttons in Maintenance. That's developer-speak in a mod tool. |

**Score: 3 ✅ / 2 ⚠ / 2 ❌**

---

## B) THE USER'S DAY (30 minutes, my voice)

**0:00** Open Chrome, click GAW. Bar appears at the bottom — good, didn't have to think.
**0:08** SIREN icon is amber. Why? I hover. Tooltip says "alerts." Helpful but I still don't know what's alerting. *5 sec lost.*
**0:30** Click inbox icon. Modmail popover shows 3 threads with AI replies already drafted. **This is the magic moment.** I pick a draft, edit two words, send. That was fast.
**2:00** Second thread — user asking "why was I banned." I want to use a macro. Macros dropdown is in Mod Console > Modmail tab… wait, is that wired? *5 sec uncertainty.* Right, it's there now (v9.17.0). Pick "ban appeal — RTFM" macro, send.
**5:00** Bar shows red SIREN. Click. Triage Console. AI tard suggester has 3 patterns flagged. I approve one as a Death Row rule. **Felt powerful.**
**8:00** A mod pings me in ModChat. Click the chat icon. Panel slides in on the right. Type, send. Latency feels invisible. **Good.**
**12:00** I want to sticky a community post. Click the gear → no sticky thresholds anywhere visible. Email the lead. *2 min lost.* (E2: configurable thresholds via GEAR — still ❌ in audit.)
**15:00** Bug reports button, lead-only. Click. "HTTP 403 — origin not allowed." *The bug-report viewer is broken (F3, still ❌).* I file it as a bug… but the bug-report viewer is what's broken. **Loop.**
**18:00** Open the popup to claim 3 new modmails. Stats card "Pending" shows 47. Click. Drill-down opens. Looks good.
**22:00** Auth-fail banner appears: "your session timed out." Click Force re-hydrate. Works. Banner gone. **Banner is the unsung hero of this tool.**
**26:00** Want to look up an old modmail thread. No search in the popup. Worker has `/gaw/search` but it's not surfaced (Rule 20 ⚠). *3 min lost scrolling.*
**30:00** Done. Closed Chrome. **Did real work for 22 of 30 minutes. 8 minutes spent fighting the tool.** Acceptable, not great.

---

## C) GROAN MOMENTS

1. **`popup.html:170-227` — Maintenance section has 11 buttons.** "Schema migration check," "Selector drift report," "Migration debt scanner." I'm a mod, not a DBA. *Ugh.*
2. **`popup.html:259-273` — Token fields are 🔑 vs 👑.** I paste wrong, get 401, banner saves me — but I just lost 30 sec. The HANDOFF doc explicitly flags this (§6.2). Still unfixed.
3. **`INSTALL.md:20-22` — "Do NOT pick the parent `mod-tools` folder."** A literal foot-gun warning in install docs. The fix is renaming the folder so there's only one option. *Really?*
4. **`modtools.js:13776` — Dock toggle uses ⬅️/➡️ emojis as button text.** I hit it by accident, my chat panel jumps to the other side. No undo, no tooltip explaining the jump. *Ugh.*
5. **`popup.html:194-203` — "AI: suggest tard / sus patterns" — counts against your daily AI budget.** What budget? Where do I see it? How close am I to the cap? *Mystery meat.*
6. **`modtools.js:14117 (modmail panel)` — full-screen modmail is 680px wide on the right.** Covers half the GAW thread I'm reading. No way to peek at the post the user is complaining about. *Want side-by-side, got curtain.*
7. **`popup.html:374-411` — "Autonomous maintenance (Llama)" section, Lead-only.** Three buttons, a severity dropdown, "Run now," "Maintenance reports (14d)." This is a CTO dashboard buried in a mod popup. *Ugh.*

---

## D) DELIGHT MOMENTS

1. **Ambient AI pre-fetch** (`modtools.js:14073`) — modmail draft is *already there* when I open the popover. Feels like the tool read my mind.
2. **Auth-fail banner with "Force re-hydrate"** — saves me at minute 22 of every session. Names the cause, offers the fix in one click.
3. **INVITE-CODE-vs-TOKEN routing** — I paste the wrong string, popup detects, glows the Claim button, says "looks like an invite code." Empathetic.
4. **Bloomberg Terminal aesthetic** — JetBrains Mono, tabular nums, amber accent. I trust this tool more because it looks like a Bloomberg, not a Discord bot.
5. **Tab nav in popup (v9.15.0)** — Stats / Tokens / Tools / Lead. Eliminated the scroll-of-shame. **Big win.**

---

## E) FRESHMAN MOD'S PERSPECTIVE (30 min into my first day)

**Don't understand:**
- What's the difference between Team Token and Lead Token? *Both look like passwords.*
- "Force re-hydrate" — am I going to break something? Why is it in TWO places in the popup?
- Maintenance routines — should I run these? Are they automatic? Is something wrong if I don't?
- "Schema migration check" / "Migration debt scanner" — what is this and am I qualified?

**Scared of:**
- The red "Clear all" button at the bottom of the popup. No `confirm()` description visible. Will it nuke my token?
- The 🔥 SIREN icon — does clicking it DO something or just SHOW something?
- Death Row queue — the name is funny, but adding someone feels permanent. The 20s undo helps.

**Feels good:**
- Status bar appears the moment I refresh after pasting a token. Instant feedback.
- Inbox icon shows a count. I know there's work waiting.
- Macros dropdown in the ban modal — I don't have to type the same warning 50 times.

---

## F) PRO MOD'S PERSPECTIVE (2 years, daily user)

**Repetitive:**
- Pasting the same 5 macros across modmails. *I want a keyboard shortcut: Ctrl+1..5 picks macro 1..5.*
- Re-clicking the inbox icon every 5 minutes. *Auto-poll exists, but I want a desktop notification I can opt into.*
- The popup still requires opening to see Stats. Bar should ticker through the 6 stat counts.

**Missing:**
- **Search.** Worker `/gaw/search` exists (Rule 20 ⚠). I want Cmd+K from anywhere → "username, subject, content."
- **Keyboard shortcuts surfaced.** Modmail hints panel has them; the rest of the tool doesn't.
- **Bulk reply to modmail** — when 30 users complain about the same banned community, I want to reply once.
- **Per-mod preferences** — my dock side, my width, my favorite macros pinned to top.

**Painful at scale:**
- Modmail panel is 680px wide and CURTAINS the page. *Fix: collapsible to a 280px rail.*
- Bug report viewer 403 (F3). *I cannot triage bugs. I am the lead. This is the second-most-important screen.*
- Auto-unsticky disabled since v8.6.4. *I un-sticky 6 posts a day manually. That is 30 min/week of grunt work.*
- No search means I open Chrome history to find a thread from last Tuesday. *Embarrassing.*

---

## G) ONE-SENTENCE VERDICT

**Not yet ready for broad rollout — the single biggest blocker is that "auth + install" is still untested on Brave/Linux (where ~half of the GAW mod team lives), and shipping v10 to those mods without an in-the-wild Brave/Linux smoke test will recreate the v9.6 frustration in production.**

Fix that one thing — a 2-hour live test on a Brave/Linux box, document the gotchas, ship a `INSTALL_BRAVE_LINUX.md` — and v10 is ready. Everything else (D3 shield-click, F3 bug-403, E1 auto-unsticky, search surface) is iteration, not blocker.
