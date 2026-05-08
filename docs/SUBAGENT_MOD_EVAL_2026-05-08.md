# SUBAGENT_MOD_EVAL — Mod-POV Friction Audit
**Date:** 2026-05-08 · **Build:** v9.6.6 · **POV:** experienced mod (Reddit ModToolbox / Discord)

---

## A. Status bar (`modtools.js:13639` `buildStatusBar`)

**Current order** (`modtools.js:13805-13834`):
`shield · gear · | · log · help · debug · bug · 💬 · broom · (lock) · | · sessDot · fbBtn · | · filter · DR · siren · sirenClear · mm · c5 · (page-flag)`

**Missing context the bar should anticipate:**

1. **No mod-online presence in the bar itself.** `c5Btn` (line 13776) is gated to `catsfive && isLeadMod()`. Every mod should see "3 mods online" with a hover popover. Add a non-lead presence chip that reads `/presence/online`.
2. **No "new posts since last seen" ticker.** Firehose is running; the bar shows zero firehose state. Add `🌊 12` (new comments matching DR rules in last 5min) next to the filter dropdown.
3. **No new-modmail badge anywhere unless you're already on a thread page** — `mmBtn` only renders when `IS_MODMAIL_READ` is true (line 13762). A globally visible `📬 N` envelope is missing. Build a poll against the modmail unread endpoint and badge the existing `💬` ModChat icon's pattern (red dot, `modtools.js:13483`).
4. **`fbBtn` (interception lock, line 13667) is dead weight 99% of the time.** Move it into Settings; reclaim 22px of bar real estate.
5. **`sessDot`** is colored but stateless on hover — should show last whoami timestamp ("OK · checked 14s ago"). Currently just "Session OK".
6. **Inline ticker proposal:** rotate a single `📊` cell every 8s through: `↑ 12 bans/24h` · `📬 3 new mm` · `🚨 5 SUS hot` · `💀 8 DR pending`. One slot, four signals.

---

## B. Modmail flow

- **No globally visible inbox icon.** `mmBtn` (line 13764) only mounts on `/modmail/thread/<id>` — meaning a mod browsing `/users` has zero indication that 4 modmails are waiting. Critical gap.
- **No new-mail arrival indicator.** No poll, no toast, no badge. Compare ModChat's pattern at `modtools.js:13483` (`#gam-mc-badge-count` red pill) — that's the exact pattern needed for modmail. Wire `unreadCount` from the existing inbox-intel polling at `modtools.js:1292` (`inboxIntelPollMs`) into a global envelope.
- **Opening a modmail does NOT contextually suggest replies.** `renderMessageTab` (line 7683) hard-codes `REPLY_TEMPLATES` (static array) and exposes ZERO macro picker — the macros dropdown is wired only to the BAN tab (`mc-ban-macro-pick`, line 7016). **HANDOFF gap A2 confirmed unfixed.** Mirror the ban-tab macro `<select id="mc-ban-macro-pick">` block into renderMessageTab as `#mc-msg-macro-pick` filtered by `kind='mm_reply'`.
- **No per-thread AI suggestion.** `/macros/ai-suggest` exists but is generic. Need a new `mm_reply_suggest({threadId})` that consults the thread body + this user's prior modmail history and returns the top 4. Wire as buttons above the body textarea at `renderMessageTab:7698`.
- **The hints panel (`gam-mm-hints`, line 13620) is stale tips, not actionable.** Replace tips with the AI-suggested replies for the open thread.

---

## C. Mod Console (`modtools.js:6395` `openModConsole`)

Tabs: Intel · Ban · Note · Message · Quick. Anticipation gaps:

- **Intel tab** loads correctly (line 6651) but does not auto-recommend a tab. If `bans>=2 && score>=60` from `intelCacheGet`, default tab should be `ban`, not `intel`. Currently `TAB_MEMORY[user]` (line 6397) wins — a mod re-opening for a clean user gets the ban tab from last session.
- **Ban tab:** macros dropdown exists (line 7016) but is NOT auto-filtered by `selected violation`. Add a `data-violation` attribute on each macro at storage time so picking "spam" filters macros tagged spam.
- **Note tab:** no auto-template by violation. Should pre-fill "User reported for X. Action: Y." when `item` (the queue context) is present.
- **Message tab:** see B above. No macro dropdown. Subject field is empty and not auto-filled from thread subject when opened from modmail context.
- **Quick tab** (line 7743): "Death Row 72h/96h/7d" are three buttons — collapse to one button + a duration picker. Saves vertical space and a click.
- **No "next user" button** when working a queue. After ban-and-close, the modal should offer "→ next pending user" using the pending stat from `popup.html:34`.

---

## D. Vertical scrollbars

Currently scroll-locked surfaces:

1. **Popup body** — entire `popup.html` (392 lines of stacked sections) scrolls. The Maintenance section alone (`popup.html:127-184`) is 8 rows. **Eliminate** by collapsing Maintenance into a single "Run health check" button + drawer.
2. **Macros list** — `popup.html:195` `max-height:240px;overflow:auto`. Fine, but the popup container ALSO scrolls — double scroll. Lock popup height to `max-content` and let only this list scroll.
3. **Mod Console panels** — `gam-mc-panels` overflow on Intel tab when history > 20 rows (`modtools.js:6630` `hist.slice(-20)`). Fine.
4. **ModChat thread** — `.gam-mc-thread{flex:1;overflow-y:auto}` (line 12725). Fine.
5. **Bug list panel** — `popup.html:283` `max-height:400px;overflow:auto`. Fine.
6. **Drill-down drawer** — `pop-drill-body` already overlays the popup; OK.

**Eliminate the popup outer scroll.** Tabbed nav (Tokens · Stats · Macros · Maint · Lead) collapses 380 lines into 4 zero-scroll panels.

---

## E. Top 5 frictions in a 60-second mod session

1. **No global modmail badge.** Mod opens popup, doesn't see 3 unread. Loses minutes per shift. Fix: `popup.html` add `📬 N` row near stats; `modtools.js` add envelope to bar always-on.
2. **Token field ambiguity** (`popup.html:215` Team vs `:236` Lead). Identical visual. Mod pastes lead token into team field, bar never authenticates. Fix: red border + hint "this is the field your bar needs" on team-token field when worker auth fails.
3. **Macros buried inside popup, not in Mod Console message tab** (`modtools.js:7683`). Mod typing same modmail reply 12x/day. **Fix: A2 dropdown wiring — 30 lines, mirror ban-tab pattern.**
4. **Tooltips overlap the bar** (HANDOFF D1). Native `title=` (line 13648, 13710, 13764, etc.) renders BELOW the cursor by OS default — overlaps adjacent icons. Replace native `title` with a custom `.gam-tip` rendered with `position:fixed; bottom:32px` (above the 28px bar at `modtools.js:14394`). One CSS rule, one event delegation handler.
5. **GEAR opens settings modal but most-used settings (filter threshold, AI engine, autoUnstickyMaxHours) require scrolling).** Pin the top 4 settings as quick-toggles in the gear popover, then "Advanced..." link to full modal. Also: fix shield-orange mystery (HANDOFF D4) — `gam-bar-icon-brand` has explicit `color:${C.ACCENT} !important` (line 14401), so orange means GAW's site-CSS `--gam-accent` is leaking through `data-gam-harmonized` despite the override. Diagnose: open DevTools, inspect computed color on the brand button when orange appears, find which selector wins.

---
*end · 587 words*
