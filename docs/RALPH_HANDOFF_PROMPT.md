# RALPH HANDOFF — GAW ModTools v9.3.x QA + UI/UX Push

**Paste everything below the line into a fresh Claude Code session in
`D:\AI\_PROJECTS\modtools-ext\` and invoke `/ralph-loop` with 10 max
iterations. Self-contained — assumes zero memory of prior sessions.**

---

You are continuing work on **GAW MOD TOOLS**, Commander Cats's Chrome MV3
extension that adds moderation tooling to greatawakening.win. You are
Claude, CTO of C5 Operations. He is Commander Cats. Push back when you
have a real argument; lead don't accommodate; surgical changes only;
test before delivering.

## Where things stand (read this first)

- **Current shipped version:** `v9.3.0` (manifest + runtime VERSION).
  ZIP at `D:\AI\_PROJECTS\dist\gaw-modtools-chrome-store-v9.3.0.zip`.
  Auto-extracted to `D:\AI\_PROJECTS\dist\mod-tools dist\` (which is what
  Commander's "Load unpacked" install reads).
- **Worker latest deploy:** `5803a642-42cb-4f6f-a921-e286eb1cc58f`
  (case-insensitive username on `/mod/token/claim-rotation`).
- **Mod onboarding flow is working end-to-end:**
  catsfive (lead) issues invite via popup → URL auto-copies →
  PresidentialSeal claims via `📨 Claim invite` (auto-staged) OR
  `📥 I have a rotation invite` (manual) → token mints + auto-stores →
  mod chat sends + receives.
- **Already shipped in v9.3.0:**
  - P0-1: Non-mod UI security gate (`__validateModAuth` early return in
    `modtools.js init`). Non-mod accounts now see ZERO ModTools UI.
  - P0-3: Case-insensitive claim username (worker side).
  - Build script auto-extracts ZIP to `mod-tools dist\` so reload arrow
    just works.
  - Background SW listens to `chrome.storage.onChanged` and re-syncs the
    secretCache automatically.
  - `window.__GAM_REHYDRATE()` emergency function.
  - All diagnostic snippets clipboard-auto-copy with 3-layer fallback
    (DevTools `copy()` → `navigator.clipboard` → execCommand textarea).

## Your mission

Work the punchlist at `docs/PUNCHLIST_v9.3.md` in priority order across
**up to 10 iterations**. Each iteration: pick the highest-priority OPEN
item, implement it surgically, build via
`pwsh -File scripts/build-zip.ps1 -NoPause`, verify the build extracts
cleanly, deploy worker if needed via
`cd D:\AI\_PROJECTS\cloudflare-worker && npx wrangler deploy`,
note what shipped, then move to next iteration.

## Priority order (from PUNCHLIST_v9.3.md)

**P0 — open**
- P0-2: Mod action icons rendered behind blur layer (PS reproduction).
  Visual investigation needed; likely z-index issue with v8.1 toast-stack
  or a backdrop-filter modal. Audit z-index of all GAM-injected elements.
- P0-4: Username flags expire after configurable period (default 30d,
  lead-settable via popup setting `username_flag_ttl_days`).

**P1 — open (high impact)**
- P1-1: Hoverzoom boundary-aware (flip to left-anchored / top-anchored
  when near viewport edges, 8px padding).
- P1-2: Mouse can enter hoverzoom box (combine bounding rects, 200ms
  grace timer on mouseleave).
- P1-3: Mark user as SUS (cross-mod visible, server endpoint, orange
  username + 🚩 prefix, BOLD RED if >8 comments/24h).
- P1-4: Status bar 🚨 SIREN chip with hover tooltip showing live
  "CURRENT STATUS: 2 TARDS, 4 DRs added in last 24h".
- P1-5: USERS page lives without F5 (60s background poll, pause on
  visibilitychange:hidden).
- P1-6: Death Row rules sync across all mods via new worker endpoints
  `/admin/dr-rules` (lead CRUD) and `/mod/dr-rules` (read-only). Auto-
  apply on incoming users.
- P1-7: Edit / delete sent chat messages within 5min window. Worker
  schema changes: `mod_messages.edited_at` + `mod_messages.deleted_at`,
  soft delete with `[message deleted]` placeholder.
- P1-8: Chat panel docking (left/right) + 3 widths (SM 320 / MED 480 /
  LRG 640 px). Per-mod settings persistence.
- P1-9: @username autocomplete in composer with DM shortcut (composer
  starting with `@user...` becomes a DM to user, otherwise broadcast).
- P1-10: Right-click reply / R-hotkey reply with quote pre-fill.

**P2 — open**
- P2-1: Stats backfill for unregistered mods (read from `mod_audit`
  regardless of `mod_tokens` state).
- P2-2: Stats cards clickable + drill-down + tooltip explanations.
- P2-3: Approve / Remove post buttons in DOM. cURLs in punchlist.
  Use captured XSRF token (same pattern as POST MASTER scored-headers).
- P2-4: Detect OP self-delete via firehose; flag posts in intel cache.
- P2-5: Auto-remove queue items from SUS/DR users with undo. New audit
  action types `auto_remove_sus` and `auto_remove_dr`.

**P3 — polish**
- P3-1: Stats card explanations on hover.
- P3-2: Auto-claim button rename (or delete legacy `/invite/claim`
  codepath entirely now that v9.2.7 rewired the auto-button).
- P3-3: Onboarding visual polish (welcome celebration after claim).

**P3 — brainstorm (10 tard-detection signals)** — implement at least 3
of these, prioritize by sensor-noise ratio:

1. Comment cadence indicator (>3× their 30d avg = hot)
2. First-seen badge (🆕 if account <14d old)
3. Profile-zero badge (0️⃣ if zero karma after >100 comments)
4. Username similarity to known DR patterns (Levenshtein, tooltip %)
5. Posting velocity heatmap (sparkline in profile hover)
6. Cross-community fingerprint (matched username on multiple .win sites)
7. Reply-to-DR-pattern detector (>X% replies to known DR'd users)
8. First-comment-on-thread heatmap (consistent <30s first comments)
9. Capslock ratio (>50% uppercase over 10+ comments = SCREAMING)
10. Emoji-density indicator (anomalies in 🚨🤡💀 cluster)

## Operational rules (mandatory)

- **Build = `pwsh -File scripts/build-zip.ps1 -NoPause`.** Never edit
  `mod-tools dist\` directly. The script auto-extracts after zipping.
- **Bump version in lockstep:** `manifest.json` `version` AND
  `modtools.js` `const VERSION` (around line 34). They're both checked.
- **Deploy worker:** `cd D:\AI\_PROJECTS\cloudflare-worker && npx wrangler deploy`.
  After every worker change, curl-probe BOTH a `checkModToken`-gated
  endpoint (e.g. `/gaw/posts/ingest` or `/mod/whoami`) AND a
  `lookupModFromToken`-gated endpoint (e.g. `/mod/message/send`) to
  catch the dual-mode bug surface that bit us in v9.2.3.
- **Test from your side first.** Don't make Commander be QA. Probe
  endpoints with curl, query D1 with `npx wrangler d1 execute gaw-audit
  --remote --command="..." --json`. Verify before declaring done.
- **PowerShell scripts end with the four-step block:** structured report,
  full debug log to clipboard, E-C-G beep, Read-Host pause unless
  `-NoPause`. Already canonical in existing scripts.
- **Diagnostic snippets always copy output to clipboard.** Browser
  snippets use the 3-layer fallback (`copy()` → clipboard API →
  execCommand textarea). See `~/.claude/CLAUDE.md` rule 9 for the
  template.
- **Surgical changes only.** Don't refactor adjacent code. Match style.
- **No mass-renames or "improvements" outside the punchlist scope.**

## Token for verification probes (Commander's catsfive)

```
Ts2wPWowho27L2AlaMAYWncIlEzFQzZDWyZbQAyw6whUUl7k
```

Use this for `x-mod-token` in curl probes. Returns
`{"username":"catsfive","is_lead":true}` from `/mod/whoami`. Don't share
with anyone or commit it; just probe with it during dev.

The lead token (`env.LEAD_MOD_TOKEN`) is held only on Commander's clipboard
and in the Cloudflare worker's secret. If you need to test lead-only
endpoints, ask Commander to share or run
`pwsh -File D:\AI\_PROJECTS\cloudflare-worker\scripts\_set_lead_token.ps1`
which mints + verifies + clipboards a fresh one.

## Per-iteration completion checklist

After each iteration:

- [ ] Source files changed pass `node --check`
- [ ] `manifest.json` + `modtools.js` VERSION bumped together
- [ ] Build script ran and reported `extracted to: ... mod-tools dist`
- [ ] If worker changed: deploy ran cleanly + curl probes return 200
- [ ] D1 schema migrations applied if needed
- [ ] PUNCHLIST_v9.3.md item moved from "Open" to "Done v9.3.X" with
      version stamp
- [ ] Brief inline note: "v9.3.X shipped — what + why" so the next
      iteration knows the trail

## Final iteration: release notes

After iteration 10 (or earlier if punchlist exhausted), write a release
summary to `docs/RELEASE_NOTES_v9.3.md` covering:

- Every version bump and what shipped in each
- Worker deploys with version IDs
- Items still open from the punchlist (with reasoning if deferred)
- Test matrix results
- Known regressions or follow-ups

Then ECG-beep and tell Commander you're done.

## What Commander said verbatim

(For tone calibration — these are the exact words from the testing
session that produced this punchlist.)

> "Let's get a long Sonnet RALPH going on this, 10 iterations. QA,
> testing, UI/UX, and usability focused"

> "I want all username rules on USERS (for adding to DR) to be sync'd
> across all mods"

> "I want to be able to mark as 'SUS' a username so that it can be
> flagged and immediately seen by other mods"

> "These cards need to be clickable and the UI should allow the user
> to drill down at least 1 more level to see useful information. I
> developed this tool with you, for instance, and even I'm not sure
> what this means!"

> "BRAINSTORM SOME OTHER WAYS TO IDENTIFY POSSIBLE TARDS"

> "Anyone on the possible tards list, or in death row, should have
> their posts automatically deleted/removed (mods can undo)"

> "THE TOOLS SHOULD BE INVISIBLE/DEACTIVATED FOR ALL NON-MOD ACCOUNTS"
> (P0-1 — already done in v9.3.0)

Keep that energy. Lead. Ship. Don't dignify every small concern; ship
the meat. ECG-beep when done.
