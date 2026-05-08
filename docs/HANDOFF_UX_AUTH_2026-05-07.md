# HANDOFF — UI/UX, AUTH, USABILITY

**Audience:** the next Opus session.
**Date written:** 2026-05-07.
**Written by:** the previous Sonnet/Opus session, after Commander declared
"I am very very very much NOT impressed with the current state of everything."

This is not a victory lap. This is a punch list. Read it cold.

---

## 0. Mission (read this twice before doing anything)

The current ModTools install is **functionally working** for catsfive (the
lead) but **the UX/auth onboarding flow is broken in ways that matter
when rolling out to other mods**. Commander is mid-rollout and the
quality bar has been visibly missed.

**Your job, in priority order:**

1. **Make the auth/token UX bulletproof.** A fresh mod must be able to
   click an invite link, paste a token, or claim by code and *succeed
   on the first try* on Chrome AND Brave AND Linux. Currently the path
   is full of land mines.

2. **Make the popup and status bar make sense.** Right now the layout
   is the result of seven versions of corrections, half of which
   contradict each other. There is no coherent design — just whatever
   Commander pointed at last.

3. **Make rotation actually usable.** Lead can generate invites, see
   the roster, rotate per-mod. Whether that flow is *good* is open.

4. **Make modmail/modchat actually solve a problem.** Mod chat just
   got un-broken (v9.6.5) after being broken since v9.3.11. Modmail
   is barely instrumented.

**Do not invent new features. Do not "improve" things outside this
mandate. Fix the path the user walks. Then stop.**

---

## 1. Project layout (memorize)

```
D:\AI\_PROJECTS\modtools-ext\           ← git repo, master branch
  manifest.json                         ← MV3 manifest, version + key
  modtools.js          ~17.5k lines     ← content script (the universe)
  background.js        ~2k lines        ← service worker (token vault, RPC dispatcher, alarms)
  popup.html .js .css                   ← popup UI (the second universe)
  scripts/                              ← PowerShell: build, install, recover, backfill
  docs/
    AGENT_BRIEF.md                      ← READ THIS FIRST
    BACKLOG.md                          ← Tier 1/2/3 work queue
    FEATURES_INDEX.md                   ← feature → file:line map
    HANDOFF_UX_AUTH_2026-05-07.md       ← this file

D:\AI\_PROJECTS\cloudflare-worker\      ← NOT in git (Commander deferred init)
  gaw-mod-proxy-v2.js  ~9k lines        ← the worker
  migrations/*.sql                      ← 001-030 applied to gaw-audit D1
  wrangler.jsonc                        ← bindings (vars only; secrets in dashboard)

D:\AI\_PROJECTS\dist\
  mod-tools dist\                       ← auto-extracted unpacked install
  gaw-modtools-chrome-store-v*.zip      ← built ZIPs
```

## 2. Version state (verify before changing anything)

```
extension     v9.6.5    D:\AI\_PROJECTS\dist\mod-tools dist\
worker        v9.6.2    Current Version ID: ac185a20-2b59-46d9-8b50-06c40009f28b
extension ID  pfkfimhoefhodeoklmlacdehgmlngmgc  (deterministic via manifest.key)
catsfive token  Ts2wPWowho27L2AlaMAYWncIlEzFQzZDWyZbQAyw6whUUl7k
worker URL    https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev
```

Verify: `curl -sS "$WORKER/mod/whoami" -H "x-mod-token: $TOKEN" -H 'origin: https://greatawakening.win'`
Should return: `{"username":"catsfive","is_lead":true}`.

---

## 3. The auth disaster (full picture)

There are THREE token concepts. They get conflated. They are not
interchangeable.

| Name | Where stored | What it proves | Used for |
|---|---|---|---|
| `workerModToken` | `chrome.storage.local.gam_settings` | per-mod identity | every authed `/mod/*` and `/admin/*` endpoint |
| `leadModToken` | `chrome.storage.local.gam_settings` | extra defense-in-depth factor | only 3 endpoints (audit backfill, health/extended, key rotation) |
| `LEAD_MOD_TOKEN` | CF Dashboard secrets | env-side comparison value | what `leadModToken` is checked against |

**As of v9.6.2** the worker accepts EITHER `x-lead-token` OR
`x-mod-token + is_lead=true` for almost all admin endpoints
(`requireLeadAuth` helper). So lead-tier work no longer NEEDS the
separate lead token. But the popup still shows the field, which is
correct (kept for the 3 dual-factor ops) but creates UX confusion.

### 3.1 Why Commander got locked out twice this session

1. He installed a new build, the chrome.storage tied to the OLD
   extension ID was orphaned, the Team Mod Token field was empty, the
   auth gate at `__validateModAuth()` (modtools.js:16644) returned
   false, init() aborted at line 16686, status bar never built.
   **Fixed in v9.5.3** with a visible auth-fail banner that says
   exactly why and offers Force re-hydrate.

2. Then he pasted the LEAD token into the LEAD field, expected things
   to work, and asked why nothing was happening. Wrong field —
   he needed the **Team Mod Token** field. Made worse because the
   `#leadSection` was hidden behind `display:none` until lead status
   was confirmed, and lead status requires team token first
   (chicken-and-egg). **Fixed in v9.6.1** by splitting the section so
   the lead-token input is always visible; only the lead-only TOOLS
   (rotation, invite gen, etc.) gate.

3. The `manifest.key` field was missing for many versions, so each
   "Load unpacked" rotated the extension ID and wiped storage.
   **Fixed earlier this session**; ID is now stable.

### 3.2 What's still broken / fragile

- **The URL invite path.** v9.3.15 over-tightened the GAW header
  user-link selector (Vanguard ER2-C-2). On Brave/Linux, theme
  variants, and during SPA hydration, the strict matchers miss and
  the invite gets silently dropped. **v9.6.3 added 5 broader
  fallbacks plus a screen-anchored sweep plus an `alert()` if all
  miss.** Whether this actually works on Brave for a fresh mod is
  unverified — Commander's mod tested via manual code entry instead.
- **Brave Shields.** May strip `?mt_invite=` query params as
  trackers. We have not confirmed nor disproven this on Brave 1.89.
  If you can spin up Brave and reproduce, do it.
- **Token rotation flow** for non-leads. The 14 mods listed in
  `/admin/mod/list` mostly have `last_used_at: null` and
  `rotation_count: 0` — they have never been onboarded. Whether the
  invite link approach actually works for them is the test.
- **chrome.storage.session** has had MV3 bugs in Brave historically.
  Staged invite codes (`gam_pending_invite`) might not persist
  between IIFE stage and popup claim on some browsers.

### 3.3 First-time mod onboarding flow (what SHOULD happen)

1. Lead opens popup → 👥 Mod rotation roster → click Generate Invite for a specific mod
2. Lead sends new mod the resulting URL: `https://greatawakening.win/?mt_invite=<code>`
3. New mod loads unpacked extension (ID stays stable now)
4. New mod logs into greatawakening.win
5. New mod clicks the invite link
6. modtools.js IIFE detects `?mt_invite=`, validates header user link, asks `window.confirm()`
7. On confirm: stages `gam_pending_invite` into chrome.storage.session, strips URL
8. New mod opens popup → sees "📥 Claim invite" button
9. Clicks Claim → enters their GAW username → confirms
10. Worker validates invite, mints token, stores in mod_tokens, returns
11. Popup saves to chrome.storage.local, refreshes lead-gate
12. Refresh greatawakening.win → bar appears → fully authenticated

**Number of places this can fail silently: at least four.** Step 5
header link miss. Step 7 storage permission. Step 8 popup not
detecting staged invite. Step 9 username case-mismatch. Each of
these has bitten Commander or his mods at least once.

### 3.4 What you must verify works (live, not from logs)

For both Chrome AND Brave on Linux:

- [ ] Fresh install → click invite link → see confirm dialog → click OK → snack/alert says "Invite STAGED"
- [ ] Open popup → see "📥 Claim invite" button (NOT greyed out)
- [ ] Click Claim → enter username → click Claim → token saved
- [ ] Refresh GAW → bar appears, no auth-fail banner

If any of these fail, that's where you start.

---

## 4. The UX nightmare (Commander's verbatim complaints)

Quote, this session: *"This workflow is a mess. The modtools panel is a confusing nightmare."*

### 4.1 Status bar

The bar at the bottom of GAW pages has accumulated icons over many
versions. Current layout (modtools.js ~13725):

```
[shield] [gear] | [modlog] [siren] [snipe] [bug] [chat] [presence] [auth-lock] [maint] | [USERS-only] [BAN-only]
```

Issues Commander has flagged this week:
- **GEAR placement.** I shipped it on the right (v9.6.0), Commander
  said "no, I want it on the LEFT after shield" (v9.6.1). It's now on
  the left. Don't move it again unless asked.
- **Tooltips overlap status bar.** Tooltips appear too low and obscure
  adjacent icons. Commander wants them HIGHER. Not yet fixed.
- **Shield turned orange unexpectedly.** Commander asked why. Not yet
  diagnosed. Probably a state indicator we have for crawler/firehose
  health that isn't documented.
- **SIREN chip emoji-LEFT count-RIGHT.** Already fixed
  (modtools.js:13130). Don't break it.
- **Shield-on-click is dumb.** Commander wants a "site health
  snapshot" — past 24h actions count, queue depth, etc. Not built.

### 4.2 Popup

The popup is 380+ lines of HTML in `popup.html`. It is a vertical
scroll of sections that grew organically. Top to bottom:

- 🔑 Team Mod Token (input + save) — first-run path
- 👑 Lead Mod Token (input + save + always-visible since v9.6.1)
- ✓ Hint banner ("your team token authenticates you as lead")
- 📥 Claim invite button (gated to staged invites only)
- Stats grid (6 cards with click drill-down)
- Force re-hydrate button
- Mod log link
- Macros panel (ban_msg / mm_reply tabs, "+ Add custom" + "✨ Generate with AI")
- Bug report viewer (lead-only)
- Maintenance routines (12 user + 4 lead)
- Lead-only tools section (rotation roster, team settings, etc.)

Issues:
- **It's too long.** No way to find anything. There is no tab/nav
  navigation, no search, no collapsible sections.
- **The Team/Lead token field UX confuses people.** They look
  identical. Commander pasted the lead value into the lead field
  and was surprised when it didn't unlock the bar — because the bar
  needs the TEAM token, not the lead token.
- **The macros panel is buried.** "Generate with AI" is a great
  feature but you'd never find it.
- **Drill-down stats** open inline and consume vertical space —
  the popup gets tall fast.

### 4.3 Mod Console (the modal that opens from the bar)

`openModConsole()` in modtools.js. Tabs: Intel / Ban / Note / Message
/ Quick. Each tab is a different surface inside one modal. Generally
working but:
- Macros dropdown got upgraded in v9.6.1 with "+ Add custom" at top
  and "✨ Generate with AI" inline. Live-tested, works.
- Modal backdrop / blur layer has had recurring bugs with z-index
  collisions (the chat-panel ID-collision bug was found this way).
- The modal is the highest-quality piece of UX in the project.

### 4.4 Mod Chat panel

Just un-broken in **v9.6.5** (was broken since v9.3.11 — six months —
because of a backtick inside a CSS comment that closed a JS template
literal early). Symptoms: clicking the chat icon threw "data is not
defined", the panel either didn't open at all or rendered as an
inline block at the bottom of the page (no positioning CSS).

If a future change touches the CSS template in `injectStyles()`
(modtools.js ~12660): NEVER use backticks inside the template, even in
comments. Use single quotes or no quotes.

### 4.5 What an actual UX overhaul would look like

This is YOUR call to make and ship. But here's a sketch:

- **Popup tabbed nav** (Tokens | Stats | Tools | Lead). Reduces
  scroll. Each tab is one screen.
- **Onboarding wizard.** First-run users see ONE screen with three
  buttons: "I have an invite link" / "I have an invite code" /
  "I have a token from my lead". Each path is a guided flow.
- **Status bar with logical grouping**, separators, and consistent
  icon order. Document why every icon exists.
- **Tooltip stacking.** Move tooltips higher (top of bar). Don't
  overlap adjacent icons.
- **Auth-fail banner is good** — keep. But add: "What is each token?"
  inline help so users don't paste the wrong one.

---

## 5. What THIS session shipped (in order, with caveats)

| Ver | What | Caveat |
|---|---|---|
| v9.5.1 | SPA watcher fix for profile-page hidden posts | Took 12 sessions to find. Shipped. |
| v9.5.2 | rpcCall hardening for Extension Context Invalidated | Good. |
| v9.5.3 | Visible auth-fail banner with "Force re-hydrate" | Good. Banner is the safety net. |
| v9.6.0 | Mega-ralph (hidden comments, mod bar restructure, team macros, modmail hints, health report renderer) | Multi-feature commit; not all reviewed in detail. |
| v9.6.0 | Wrapped openPanel in try/catch | This is what unmasked the data-is-not-defined error |
| v9.6.1 | GEAR moved to LEFT after Commander correction. Lead-token always visible. Smart macros (+ Add custom + AI). | UX correction. |
| v9.6.2 | requireLeadAuth helper. Worker accepts team token + is_lead for 95% of admin ops. | Big UX win — Commander was right about the chicken-and-egg. |
| v9.6.3 | URL invite header-link broader fallback + alert() if all miss. ModChat openPanel labeled errors. | URL invite fix UNVERIFIED on Brave. |
| v9.6.4 | Aggressive console instrumentation in openPanel. No-throw degraded mode. | Diagnostic only — used to find the bug. |
| v9.6.5 | THE backtick-closes-template-literal bug in injectStyles. Six versions to find. | Chat now actually opens. |

---

## 6. What this session FAILED at (post-mortem — Commander deserves this)

1. **Misread Commander's GEAR position direction.** He said "move
   the GEAR" — I shipped it right. He clarified "left after shield."
   §11 violation: I should have asked or examined the path.

2. **Custom macros first cut was too primitive.** I shipped a basic
   list. Commander said "WAY more smart than this" — wanted "+ Add
   custom" at TOP of the dropdown plus AI-generated starter macros.
   Caught and shipped in v9.6.1. Should have been the first cut.

3. **Six versions to find the backtick bug.** The bug was in source
   code I had read multiple times. My greps for "data" missed it
   because the bare identifier is parser-induced (the inner backticks
   in a CSS comment closed the outer template literal early). I
   shipped instrumentation iteratively (v9.6.0, 9.6.1, 9.6.3, 9.6.4)
   until the console finally pointed at line 12671. Then I made the
   SAME bug again in my own commit-explanation comment. This is a
   class of bug that needs a lint rule.

4. **Did not test on Brave Linux from my side.** Commander's mod is
   on Linux Brave. I have Chrome MCP. I did not spin up a test fixture
   or even check whether Brave's content-script timing differs. §8
   violation.

5. **Did not eliminate enough meatbag steps.** Commander still had
   to: paste tokens into the wrong field, retry installs, reload the
   extension multiple times, switch tabs to read DevTools console,
   paste console output back. Some of this is unavoidable; some
   wasn't.

6. **Token confusion never got a UX fix at the field-label level.**
   The Team Mod Token vs Lead Mod Token labels look identical. The
   icons (🔑 vs 👑) are too subtle. A new mod's brain treats them as
   "two slots, one token" and fails. The v9.6.1 hint helps once
   authenticated. It doesn't help on the failure path.

---

## 7. Boot commands (memorize)

```bash
# Build extension (auto-extracts to dist/mod-tools dist/)
pwsh -File D:\AI\_PROJECTS\modtools-ext\scripts\build-zip.ps1 -NoPause

# Parse-check before any commit
node --check D:\AI\_PROJECTS\modtools-ext\modtools.js
node --check D:\AI\_PROJECTS\modtools-ext\background.js
node --check D:\AI\_PROJECTS\modtools-ext\popup.js

# Worker deploy (ALWAYS parse-check first)
cd D:\AI\_PROJECTS\cloudflare-worker
node --check gaw-mod-proxy-v2.js
npx wrangler deploy

# D1 migration apply
npx wrangler d1 execute gaw-audit --remote --file=migrations/NNN_xxx.sql

# Probe tokens (catsfive lead)
TOKEN='Ts2wPWowho27L2AlaMAYWncIlEzFQzZDWyZbQAyw6whUUl7k'
W='https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev'
curl -sS "$W/mod/whoami" -H "x-mod-token: $TOKEN" -H 'origin: https://greatawakening.win'

# Check live worker version
curl -sS "$W/version" 2>&1 | head -3

# Check live mod roster
curl -sS "$W/admin/mod/list" -H "x-mod-token: $TOKEN" -H 'origin: https://greatawakening.win' | jq .
```

## 8. Invariants (break these and Commander loses time)

From AGENT_BRIEF.md, plus what this session learned:

| Invariant | Why |
|---|---|
| `manifest.json.version` AND `modtools.js:34 const VERSION` bump in lockstep | Drift is silent |
| `manifest.key` field stays — extension ID stays | Removing `key` rotates the ID, wiping all chrome.storage |
| Worker `lookupModFromToken` is dual-mode (hash-first → plaintext fallback) | v9.2.3 lesson |
| `lookupModFromToken` reads ONLY `x-mod-token` (NOT `x-lead-token`) | W-C-3 |
| `appendAuditAction` MUST hard-fail on state-mutating writes | Never `try/catch{}` around audit append |
| `__applyLeadGate()` is the canonical lead-only popup gate | Don't add other gates |
| `safeError(e, code)` wraps 500 responses | Sanitizes D1 exceptions |
| `closeAllPanels` selector list includes ALL backdrop variants | Orphan-blur bug |
| Z-index hierarchy: popovers > modals > backdrop; chat-panel rule scoped to `[data-dock]` | ID-collision bug |
| `scripts/build-zip.ps1` auto-extracts ZIP to `dist/mod-tools dist/` | Commander's load-unpacked path |
| Audit chain `action` column is IMMUTABLE post-write | Use `correlated_action` instead |
| `MOD_TOKEN` plaintext fallback REMOVED from `checkModToken` | W-C-1; never reintroduce |
| Token shape regex: `^[A-Za-z0-9_-]{32,256}$` + ≥1 letter ≥1 digit, no leading/trailing dash | Defense in depth |
| Migration 026 boundary id check on `entry_hmac IS NULL` | Reject NULL hmac when id ≥ boundary |
| **NEW (v9.6.5):** never use backticks inside JS template literals — including in CSS comments inside `s.textContent = \`...\`;` | Closes the template, throws ReferenceError |

---

## 9. Commander's working style (read carefully — this is HOW you work with him)

From `~\.claude\CLAUDE.md`:

- **§0 lead with conviction.** Don't hand him a menu — pick and ship.
  "Confirm or redirect" beats "what would you like me to do?"
- **§10 eliminate the meatbag.** Before recommending he do anything,
  ask: can I do this myself? If yes, do it. CLI commands, file edits,
  worker deploys, D1 inserts, smoke tests — all yours.
- **§11 trace the whole path.** When he names ONE friction step
  ("auto-detect the ID"), audit the entire flow. Eliminate everything
  in that flow you can. Don't stop at the named symptom.
- **§7 PowerShell scripts:** UTF-8 BOM, ASCII-only, four-step ending
  (structured report → clipboard → E-C-G beep → Read-Host pause).
- **§8 test before delivering.** If you can verify from your side
  via curl/D1/probe — do it. Don't ship "should work, try it."
- **§9 every diagnostic copies to clipboard.** With visual confirmation.
- **He cannot be offended.** Push back when you have a real argument.
  Don't soften forecasts to avoid being wrong.

What he hates:
- "Should I do A or B?" — pick A, defend it briefly, move on.
- "Recommended pre-rollout steps: 1) wrangler secret put 2) ..." —
  run the commands yourself, report what you did.
- Repeating himself. He has had to say "GEAR on the LEFT" and
  "macros should be SMARTER" multiple times this session. That's a
  sign you didn't read carefully the first time.

---

## 10. Recommended first 30 minutes for the next session

1. **Read AGENT_BRIEF.md, BACKLOG.md, FEATURES_INDEX.md, this file.**
2. **Verify build/worker state** with the boot commands above.
3. **Verify live token** with `curl /mod/whoami`.
4. **Boot up Chrome MCP / Brave** if available. If you have either,
   reproduce the new-mod onboarding flow yourself BEFORE touching
   code. Document where it fails on Brave specifically.
5. **Read the popup.html top-to-bottom.** Then pick ONE structural
   improvement (tabbed nav, onboarding wizard, anything that reduces
   the vertical scroll) and ship it. Don't try to do everything.
6. **Talk to Commander.** Tell him what you see, what you'll do
   first, and ask for one redirect if needed. Then go.

**Do not ship a "huge UX overhaul" commit.** Ship one focused improvement,
get Commander's read, ship the next. The reason this session frustrated
him is that I tried to do too many things at once and missed half of
them.

---

## 11. What you should NOT do

- Don't refactor modtools.js. It's 17.5k lines for reasons. The
  monolith is intentional.
- Don't add new tracking/telemetry features. Ship UX.
- Don't propose splitting the worker into separate workers. Don't.
- Don't init the cloudflare-worker repo without one-word approval.
- Don't bump versions out of lockstep.
- Don't touch the audit chain HMAC logic. There's a 459-row backfill
  that exists; let it stay.
- Don't use backticks inside JS template literals. EVER. Including
  in comments. Including when explaining the bug in a commit message.

---

## 12. Quick wins available

If you need a confidence builder, these are scoped and obvious:

- **Tooltip Y-offset.** Move tooltips up so they don't overlap bar
  icons. modtools.js — find the `gam-tip` CSS rule, adjust `bottom`
  from `-NNpx` to `-MMpx`.
- **Shield orange explanation.** Find why the shield is orange right
  now (probably crawler health indicator). Either explain it in the
  tooltip or fix the trigger.
- **Status bar tooltips don't show on hover** in some cases — verify
  and fix.
- **Macros panel — surface the AI-suggest button more prominently.**
  Currently it's at the bottom of the panel. Could be top.

---

## 13. The bigger architectural questions (don't tackle without consultation)

- The popup-vs-modtools.js split. Two universes share state via
  chrome.storage. Migrating to a single SPA is a multi-day project.
- The worker monolith. 9k lines. Same logic.
- D1 schema evolution. 30 migrations. Schema is somewhat ad-hoc.
- The auth model overhaul. v5.0 Phases 2-5 are deferred (sessions
  broker, mod_devices enrollment, lead step-up, auth_events).

---

**Final note:** Commander is rolling out to real moderators on his
forum NOW. Every UX failure has a real human cost — a mod not getting
authenticated, not being able to ban a violating user, not being able
to message the team. Treat this seriously.

Good luck.
