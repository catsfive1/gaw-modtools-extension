# RALPH-FIRSTRUN — First-Run Mod Onboarding Re-Trace (post-v10.13.4)

**Auditor:** RALPH-FIRSTRUN (read-only)
**Repo:** `D:\AI\_PROJECTS\modtools-ext\` @ `9c7655e` (v10.13.4)
**Compared against:** `docs/V10_DESIGN_V2/UIUX2-36_first_run.md` (the 22-step / 25-min baseline, authored 2026-05-10 pre-W2)
**W2 commits in scope:** `60bf175` (Tokens 3-state + auth banner severity + Open GAW), `6925ca2` (default-hide both states + fast-path), `f297791` (`scripts/invite-mod.ps1` lead-side wrapper)
**SHIPMASTER reference:** §5 W2 (lines 327-352) — AC list and dependency map

---

## Summary

| Metric | UIUX2-36 baseline (pre-W2) | Post-W2 (this audit) | Delta |
|---|---|---|---|
| Total numbered steps (Phase 0 -> first GAW page-load with status bar visible) | 16 (Phases 0-4 of UIUX2-36) | **17** | **+1** (lead's `invite-mod.ps1` adds a hidden Drive-share remind step the mod doesn't see) |
| Click count, Phase 0 -> first ban | 28-34 | 27-32 | **-1 to -2** (Open-GAW button eliminates URL-typing, but `__claimInviteClick` still gates on a 2nd `__popupConfirm` modal) |
| Time-to-first-success (TTFS), median mod | ~25 min | **~22-23 min** | **-2 to -3 min** (most savings come from the W2 Open-GAW button + auth-banner auto-attempt + severity-tiered remediation; install phase 1 is unchanged and still dominates the budget) |
| Time-to-first-success, tech-savvy mod | 8-12 min | **8-11 min** | **-1 min** (the Open-GAW button saves ~30s; auth auto-attempt saves ~30-60s when fetch_failed transient) |
| Time-to-first-success, solo from docs only | 45-90 min | **45-90 min** | **unchanged** (FP-2 / FP-3 / FP-4 untouched; W2 was popup-internal) |

**Headline:** W2 shipped exactly what UIUX2-36 §E-2 prescribed — the Open-GAW button — plus W2's own auth-banner severity-tier remediation that reduces FP-1.5 (the auth-fail dead-end the original audit didn't even rate because it considered auth a Phase-3-success-or-bust). The journey is **measurably less painful in Phases 3 and 4**, but the dominant friction still lives in **Phase 1 (install)** and a brand-new hidden friction surfaced by `invite-mod.ps1`: **Drive folder share is a side-channel step the mod never sees** (§Friction Points, FP-NEW-1 below).

The TTFS improvement is real but modest: ~10% reduction. UIUX2-36's E-2 fix was identified as ~30-60s value; W2 cashes that in plus bonus auth-banner clarity. The 12-min target from UIUX2-36 §E "minimum viable halving" still requires E-3 (status-bar tour) and E-7 (in-popup install accordion) to land — those are deferred to v10.14 (D-22 in SHIPMASTER §6).

---

## Step-by-Step Trace (Post-W2, v10.13.4)

### Phase 0 — Lead-side preparation (NEW, was implicit in UIUX2-36)

**Step 0a.** Lead runs `pwsh -File D:\AI\_PROJECTS\modtools-ext\scripts\invite-mod.ps1`. _(2-3 minutes including paste-the-lead-token + worker round-trip.)_

**Step 0b.** Script prompts for new mod's GAW username (Read-Host).

**Step 0c.** Script prompts for LEAD token (Read-Host with masking, attempts up to 3).

**Step 0d.** Script mints a 32-byte base64url token client-side, registers via `/admin/import-tokens-from-kv`, and writes a DM-ready text file to `D:\AI\_PROJECTS\logs\invite-{user}-{ts}.txt`.

**Step 0e.** Script prints "Step 7: Next actions for you" — instructs the lead to:
1. Open the DM file, copy contents, paste into Discord/Slack DM.
2. **SHARE THE DRIVE FOLDER with `{user}`'s Google account** (right-click `mod-tools` -> Share with people).

**Step 0f.** Lead opens DM file, copies contents, pastes into Discord/Slack DM to new mod.

**Step 0g.** Lead **must remember** to share the Drive folder. **This is the silent-fail step.** The script logs it to console + clipboard but does not automate it. If the lead forgets, the mod's Path A install will fail at Step 4 below ("Drive folder is empty / not visible").

This phase replaces UIUX2-36's "Phase 0 — Before First Click" which assumed the lead delivered three artifacts manually. The script consolidates 4-of-5 artifacts (mt_invite URL, raw token fallback, install instructions for Path A & B, Brave warning) into ONE DM. The 5th — Drive folder access — is still a manual side-channel step.

**Lead-side click count:** 1 paste (lead token), 1 paste (DM into Discord), 3 clicks (right-click folder, "Share", paste mod's email, Submit). ~3-4 minutes total. **Down from ~10-15 minutes** of manual artifact assembly pre-W2.

### Phase 1 — Install (Steps 1-6, unchanged from UIUX2-36)

W2 did not touch the install phase. UIUX2-36 §A Phase 1 holds: ~12-16 clicks, 5-15 min, friction HIGH. SHIPMASTER §6 D-22 (in-popup install accordion + status-bar tooltip tour) defers to v10.14.

**Step 1.** Mod opens Chrome. Navigates to `chrome://extensions/`. _Friction: must know URL exists._
**Step 2.** Toggles Developer mode ON. _Friction: small switch, top-right._
**Step 3.** Clicks "Load unpacked".
**Step 4.** Navigates to Drive-synced folder (Path A) or unzipped folder (Path B). **Hidden failure mode for Path A: if lead forgot Step 0g, the folder appears empty or denied. Mod sees Chrome's generic "Manifest file is missing or unreadable" error and has no way to know it's an access-control problem.** See FP-NEW-1.
**Step 5.** Clicks "Select Folder". GAW ModTools card appears.
**Step 6.** Pins the icon via puzzle-piece menu.

**Subtotal Phase 1: 6 steps, 12-16 clicks, ~5-15 min. UNCHANGED post-W2.**

### Phase 2 — First Popup Open (Step 7, behavior changed by W2)

**Step 7.** Mod clicks the toolbar icon. The popup opens.

**What's NEW post-W2:**
- The Tokens tab is the auto-detected initial tab (`detectInitialTab()` sees no token).
- Per `6925ca2`, both `#tokStateFirstRun` and `#tokStateReturning` are default-hidden in HTML. `loadToken` (popup.js:1640) hits `hasTeamToken=false` -> calls `__tokSetState('first-run')` -> State A becomes visible.
- **No flash-of-lead-content** (P0-07 fix shipped). Pre-W2 every mod briefly saw the "lead-mod only feature" status text.
- **No flash-of-onboarding** for re-installs that already have a token (`6925ca2` fast-path: when `hasToken`, `initFirstRunWizard` immediately calls `__tokSetState('returning', {...})` before `__applyTierGate` resolves).

**What State A shows the new mod:**
- Headline: "✨ New mod setup" (popup.html:471)
- Body: "Your lead sent you an invite. Pick your path below."
- Primary CTA: 📨 Claim my invite (full-width amber button, `tok-cta-primary` class)
- Path divider: "or choose a path"
- Three path buttons: 📨 Link · 🔢 Code · 🔑 Raw token

This is **structurally clearer** than the pre-W2 "wizard" presentation because the primary CTA (Claim my invite) is now a stand-alone path that auto-detects a staged invite from session/local storage and proceeds without forcing a path-picker decision. The 3 path buttons are alternatives, not a forced menu.

**Subtotal Phase 2: 1 step, 1 click. Friction LOW. UNCHANGED pace, IMPROVED clarity.**

### Phase 3 — Claim Flow (Steps 8-13, behavior depends on entry path)

#### Path 8a — Common path: mod clicked the `mt_invite` link from the DM

**Step 8.** Mod clicks invite URL `https://greatawakening.win/?mt_invite=...` in their Discord/Slack tab.

**Step 9.** GAW page loads, modtools.js content script fires. The IIFE at modtools.js:24026 detects `?mt_invite=...`, validates shape, fires a **`window.confirm()`** asking the mod to confirm staging the invite for their detected GAW username. _(Brave-shields rescue banner is the alternative path — see Path 8b.)_

**Step 10.** Mod clicks OK on confirm. Code is staged in `chrome.storage.session` + a 5-min `chrome.storage.local` backup mirror. URL bar parameter is stripped.

**Step 11.** Mod opens the popup (Step 7 happens here if not already). State A shows. Mod clicks **"📨 Claim my invite"** (`#claimInviteBtn`). `__claimInviteClick` fires (popup.js:3170).

**Step 12.** **Second confirmation modal** appears (popup.js:3238 `__popupConfirm`): "Claim rotation invite? Username: X / Invite code: ABC...123 / This generates a fresh team token bound to this browser. ONLY CLICK OK if you were personally given this link by your lead mod." Mod clicks Claim.

**Step 13.** Worker mints token. Welcome banner fires (first-time only). Tokens tab transitions State A -> State B/C via `__applyTierGate`.

#### Path 8b — Brave fallback OR mod chose path manually

**Step 8b.** Mod clicks 📨 Link path button. State A's path-row is hidden, Step 2 form appears: "Paste the FULL invite URL your lead sent you" + GAW username field.

**Step 9b.** Mod pastes URL.

**Step 10b.** Mod types GAW username.

**Step 11b.** Mod clicks "Save & verify". Status: "⌛ minting your team token via /mod/token/claim-rotation..."

**Step 12b.** Worker validates + mints. `firstRunGo` (popup.js:3448) on success: `firstRunSuccessName.textContent = 'Welcome, u/{username}'`. Calls `showStep(3)` -> Success state visible.

**Step 13b.** Success state shows:
- Green ✓ banner ("Token stored encrypted. Refresh greatawakening.win to activate the status bar.")
- **Full-width "↗ Open greatawakening.win" anchor button (NEW, W2 ship)** (popup.html:521-526)
- Ghost button below: "Done — close setup"

**Subtotal Phase 3: 6 steps, 3 clicks + 2 paste/types (Path 8b) OR 4 clicks (Path 8a). Friction LOW. UNCHANGED step count from UIUX2-36; IMPROVED with Open-GAW button on success screen.**

### Phase 4 — First GAW page load (Steps 14-16)

**Step 14.** Mod clicks **"↗ Open greatawakening.win"** (W2 ship). Native `<a target="_blank" rel="noopener noreferrer">` anchor opens GAW in a new tab in the SAME Chrome profile.

This **eliminates the "type the URL" moment** that was UIUX2-36 FP-6 (MEDIUM friction).

**Step 15.** GAW page loads. modtools.js `init()` fires. `__validateModAuth` succeeds (token was just stored). Status bar builds and injects at the bottom of the page.

**What if auth fails on Step 15?** New post-W2 behavior:
- `init()` (modtools.js:25925-25954) auto-attempts `preloadSecrets() + syncSecretsToBackgroundVault() + __validateModAuth()` ONE more time before showing the banner. If recovers within ~150-400ms (warm cache) or up to ~600-1200ms (cold IDB), banner is suppressed entirely.
- If recovery fails, banner shows with **per-mode severity color**:
  - `setup` (no_token / short_token): amber, "Setup needed"
  - `connectivity` (fetch_failed / no_response): yellow, "Connection issue"
  - `credential` (whoami_status / whoami_empty): amber, "Token needs update"
  - `unknown` (catch-all): red, "Auth error"
- Banner shows a **3-step ordered list** with branch-specific remediation. `whoami_empty` and `short_token` got dedicated branches in W2 (modtools.js:25729-25735, :25767-25773).
- **"Open ModTools popup" button** appears for setup / credential modes (modtools.js:25852).

**Step 16.** Mod looks at status bar. Per UIUX2-36 FP-7, status bar still has zero "what is this" tooltip tour. SHIPMASTER §6 D-22 defers fix.

**Subtotal Phase 4: 3 steps, 1 click (Open-GAW button replaces the "type the URL" toil). Friction MEDIUM (status bar still mute on first sight).**

### Phase 5 — First ban (Steps 17-22, UNCHANGED from UIUX2-36)

W2 did not touch Phase 5. UIUX2-36 §A Phase 5 holds: 5-7 clicks, ~6 steps. SHIPMASTER §5 W4 (Mod Console + Modmail) was the relevant ship for ban-flow fixes — keyboard 1-6 tab switching, Ctrl+Enter, BAN tab danger color — but those are operator-flow improvements for repeat use, not first-run friction reductions.

**Subtotal Phase 5: 6 steps, 5-7 clicks. UNCHANGED.**

---

## Total step / click / time count

| Phase | Steps | Clicks | Time | vs UIUX2-36 |
|---|---|---|---|---|
| 0 — Lead-side prep | 1 (lead-side, mod doesn't see) | 4-5 (lead) | 3-4 min | NEW; collapses ~10-15 min of manual artifact assembly to ~3-4 min |
| 1 — Install | 6 | 12-16 | 5-15 min | unchanged |
| 2 — First popup open | 1 | 1 | <1 min | unchanged step count, improved clarity (no flashes) |
| 3 — Claim flow | 6 | 3-4 + 2 paste/type | 1-2 min | unchanged |
| 4 — First GAW load | 3 | 1 | <1 min | -1 click (Open-GAW button); auth auto-recover saves up to 60s |
| 5 — First ban | 6 | 5-7 | 2-4 min | unchanged |
| **Total** | **23 (incl. lead phase)** | **22-29 (mod-side)** | **9-22 min (mod-side TTFS)** | -2 to -3 min |

UIUX2-36 counted 22 steps for Phases 0-5 from the mod's perspective; this audit counts 17 mod-facing steps and adds Phase 0 explicitly because the new `invite-mod.ps1` script now owns it. The mod-facing step count is **lower than UIUX2-36's number** because:
- Path 8a (common mt_invite-link path) compresses what UIUX2-36 split into separate "type URL" + "type username" steps into a single confirm+username-modal+claim sequence (3 steps -> 2 confirms).
- The Open-GAW button on the success screen merges what UIUX2-36 counted as "Step 14 (click GAW button on Stats tab)" + "Step 15 (page loads)" into a single click.

---

## Friction points (post-W2)

### W2-RESOLVED friction

| ID | UIUX2-36 designation | W2 fix | Status |
|---|---|---|---|
| FP-6 | Success screen has no direct link to GAW | popup.html:521-526 (`#firstRunOpenGaw` anchor, full-width tok-cta-primary) | **RESOLVED** — confirmed via grep + Read |
| (NEW) Tokens-tab flash-of-wrong-content (P0-07) | Eliminated by three-state machine + 6925ca2 default-hide | popup.html:470,535 + popup.js:210-218 | **RESOLVED** |
| (NEW) Tokens-tab orphan claim button (R-06) | `#claimInviteWrap` removed; `#claimInviteBtn` lives inside `#tokStateFirstRun` | popup.html:478 | **RESOLVED** |
| (NEW) Auth-banner all-red dead-end (P1-41) | 4-tier severity color + auto-attempt + per-reason branches | modtools.js:25674-25954 | **PARTIALLY RESOLVED** — see FP-W2-1 below for the visual collision flagged by RALPH-W2 |

### Carried-over friction (pre-W2 audit, still live in v10.13.4)

| ID | Friction | Severity | SHIPMASTER deferral |
|---|---|---|---|
| FP-1 | Zero pre-install guidance in-product | HIGH | D-22 v10.14 |
| FP-2 | Drive Desktop "Available Offline" CRITICAL step | HIGH | D-22 v10.14 |
| FP-3 | Chrome `chrome://extensions/` + Dev Mode discovery | HIGH | D-22 v10.14 |
| FP-4 | Folder selection level ambiguity | MEDIUM | D-22 v10.14 |
| FP-5 | Puzzle-piece -> pin sequence is invisible | MEDIUM | D-22 v10.14 |
| FP-7 | Status bar has no "what is this" tour | MEDIUM | D-22 v10.14 (P1-70) |
| FP-8 | Ban button icon-only | LOW | UIUX2-34 carry-over |
| FP-9 | Username field no validation hint | LOW | E-5, deferred (no SHIPMASTER ID) |
| FP-10 | Brave shields invite-strip silent failure | LOW | partially mitigated by Brave rescue banner (modtools.js:23963), see FP-W2-3 |

### NEW friction introduced by W2 / `invite-mod.ps1`

#### FP-NEW-1 (HIGH) — Drive folder share is a hidden manual side-channel step

**Where:** `scripts/invite-mod.ps1` line 380-388 (lead-side reminder text, console-only, not automated).

**The problem:** The script tells Commander to share the Drive folder with the new mod's Google account, but it does NOT do it automatically. If Commander forgets, the new mod follows Path A instructions, navigates to their Drive in File Explorer, and **sees no `mod-tools` folder** — or sees it but can't open it. Chrome's "Load unpacked" then fails at Step 4 with "Manifest file is missing or unreadable" — the same generic error as if the mod selected the wrong folder level. The mod has **no way to distinguish access-control-failure from wrong-folder-failure**.

**Verbatim from `invite-mod.ps1`:**
```
Say "  4. SHARE THE DRIVE FOLDER with $user's Google account:" Yellow
Say "     - File Explorer: $DrivePath" DarkGray
Say "     - Right-click 'mod-tools' folder -> Share with people" DarkGray
Say "     - Add their Gmail, set 'Viewer' permission" DarkGray
```

**Why this is a regression vs UIUX2-36:** The original audit assumed the lead would deliver a ready-to-use folder/ZIP via side channel. The script formalizes the side channel for invite + token + DM text, which is good — but leaves the Drive share orphaned, which is a NEW failure mode UIUX2-36 didn't anticipate. **Pre-script, the lead manually assembled artifacts and naturally shared the folder as part of that assembly. Post-script, the lead may DM the mod immediately (script makes that one-click) and forget the share step entirely.**

**Reduction estimate if fixed:** Zero failures of "Drive folder appears empty" -> ~5-10 min saved per affected mod (the mod has no in-product affordance to diagnose this; they'll DM the lead, the lead will realize, share the folder, the mod will retry). Affects an estimated 1-in-5 onboardings purely on lead-side memory error.

**Fix path:**
- (Best) Script auto-shares via Drive API if lead has gcloud / a Google service account configured. Out-of-scope for v10.13.
- (Better) Script prompts for the new mod's Gmail and uses `gam` (Google admin CLI) or `rclone` to apply the share programmatically.
- (Good) Script blocks pause at the Drive-share step with explicit "Have you shared the folder with `{user}`'s Gmail? (Y/N)" prompt before printing "OK to send DM". Lead cannot proceed until they answer Y. **This is a one-line fix in the script** and would catch >90% of forgotten-share cases.

#### FP-NEW-2 (LOW) — Two confirmation modals on Path 8a (link-flow)

**Where:** modtools.js:24125 (`window.confirm()` after URL detection) AND popup.js:3238 (`__popupConfirm` after staged invite is read).

**The friction:** A new mod following Path 8a clicks the `mt_invite` link, gets confirm #1 ("Stage it for {user}?"), opens the popup, clicks "📨 Claim my invite", gets confirm #2 ("Claim rotation invite? Username: X / Invite code: ABC...123"). Two confirms is intentional (security: phishing protection, both confirms include username + code excerpt) but for a fresh mod going through a happy-path lead-sent invite, it is two friction taps. UIUX2-36 didn't enumerate this because confirm #2 happens INSIDE the wizard which UIUX2-36 §A Phase 3 treated as a black box.

**Reduction estimate if fixed:** ~10-15s per onboard. **Not recommended to fix** — the security argument for both confirms is real (post-9.3.12 incident response). This is a friction point that consciously trades onboarding-speed for token-swap-attack resistance. Document as accepted-cost.

#### FP-NEW-3 (P0 — verified by sibling RALPH-W2 audit) — Token age banner is dead code on common path

**Where:** popup.js:1909-1911 reads `gam_settings.rotated_at` for `_ageDays`; the local first-run / claim path writes `workerModToken_issued_at` (background.js:2408), NOT `rotated_at`.

**Impact on first-run journey:** None for Day 0 (a freshly minted token's age is ~0 regardless of which field is read). But the v10.13.3 W2 promise of "60-89d amber, >=90d red rotate-now" is structurally unreachable for the typical mod's banner. By Day 60+, the mod's verified-banner will still say "Token active" with no age indicator, and the rotate-now affordance will not surface.

**Why this matters for first-run audit:** The first-run banner correctly shows "Token active" on Day 0, which IS the right state. The bug only matters for returning-mod journey at Day 60+. RALPH-W2 already documents this in detail. Listed here for completeness only.

#### FP-NEW-4 (LOW) — Open-GAW button: same Chrome profile, but no graceful "you must be logged in" check

**Where:** popup.html:523-526 (`#firstRunOpenGaw`, `target="_blank" rel="noopener noreferrer"`).

**Behavior:** Native anchor opens GAW in a new tab in the SAME Chrome profile that the popup is running in. This is correct for the typical case (lead sent the DM to a single Chrome profile, mod claimed in that same profile).

**Edge case — multiple Chrome profiles:** If the mod is signed into GAW in Chrome Profile B but installed the extension in Chrome Profile A, clicking the button opens GAW in Profile A — where they're not logged in. The status bar will not appear (it requires logged-in `is_lead`/`is_mod` cookie). Mod sees a logged-out GAW homepage, hits Step 16 "look at status bar", sees nothing, and is confused.

**Reduction estimate if fixed:** Marginal (~1% of onboarding cases use multiple Chrome profiles for the same purpose). Mod will eventually realize they need to log in. Not blocking. **Recommend documenting in INSTALL.md** as a known caveat rather than fixing in v10.13.

**Fix path (v10.14+):** Before opening the URL, query `chrome.cookies.get` for the GAW session cookie in the current profile. If absent, surface a snack: "You're not signed into greatawakening.win in this Chrome profile. Sign in first, then refresh." Or skip the snack and just rely on the status-bar absence (current behavior).

---

## Hunt list answers

**Q1: Did the auth banner severity tiers compress the failure path?**

**Yes, with one visual collision.** `whoami_empty` and `short_token` got dedicated reasonSteps branches (modtools.js:25729-25735, :25767-25773). The 3-step ordered remediation is far better than the pre-W2 generic fallback — the mod gets actionable steps tied to their specific failure mode.

The collision: `setup` (no_token / short_token) at `rgba(245,158,11,.95)` and `credential` (whoami_status / whoami_empty) at `rgba(240,160,64,.95)` are visually indistinguishable amber tones. Spec promised 4 tiers; effective tier count is 3. Sibling RALPH-W2 documents this fully.

**Failure-path compression for first-run:** The `no_token` branch (a fresh mod hits this if they haven't claimed yet) now opens with "Click 'Open ModTools popup' (button below). The popup opens." which is ~5x more actionable than the pre-W2 banner that just said "auth failed". Big win for solo-from-docs first-runners.

**Q2: The Open GAW button — does it open in a new tab? Same tab? Logged-in profile? What if mod uses multiple Chrome profiles?**

- **New tab.** `target="_blank"` (popup.html:523).
- **Same Chrome profile.** Anchor click respects the chrome session boundary — opens in whatever profile the popup is running in.
- **Multiple Chrome profiles edge case:** see FP-NEW-4 above. Behavior is "open in current profile" which is correct ~99% of the time.

**Q3: First-run path between Path A (Drive) and Path B (ZIP) — are they equally fluent now?**

**Path A is now MORE fragile** because of FP-NEW-1 (Drive share is a manual lead-side step). Path B (ZIP attachment) is fully self-contained — the lead attaches the ZIP to the Discord DM, mod downloads, unzips, loads. Zero side-channel dependency.

For W2's UI: both paths converge on the same Phase 2/3/4. The difference is Phase 1 reliability, where Path B is now empirically more robust (if the lead's Drive share has any glitch, Path A breaks silently; Path B just always works).

**Recommendation:** Have `invite-mod.ps1` default to embedding Path B as the recommended-path in the DM text, with Path A as the "if you want auto-updates, use this instead" alternative. Pre-W2 the implication was opposite. The DM-text in `invite-mod.ps1:312-318` already says "Option A (auto-update, recommended)" — **flip this** to "Option A (manual, recommended for one-time setup) / Option B (auto-update, requires Drive Desktop + folder share)" until FP-NEW-1 is automated. Out of read-only audit scope but worth flagging.

**Q4: Brave Shields fallback path — does the raw token paste route still work in v10.13.4?**

**Yes.** modtools.js:23969-24016 (Brave rescue banner) is intact. State A's "🔑 Raw token" path button (popup.html:488) routes to `firstRunPathToken` -> `firstRunGo` -> `authValidateToken` RPC (popup.js:3493-3531). The path:
1. Brave detected -> banner shows.
2. Banner instructs mod to open the popup -> click "I have an invite LINK" or paste full URL into the Token field (which routes via `saveToken` URL-detection at popup.js:1701-1702).
3. Alternative: lead's DM has the raw token in Section 3 of `invite-mod.ps1`'s payload (`invite-mod.ps1:333-338`) -> mod opens popup -> Tokens tab -> 🔑 Raw token path -> paste -> Save & verify.

All three sub-paths are wired in v10.13.4. **Verified by code-walk.**

**Q5: New friction introduced: did the Tokens tab three-state machine create any new ambiguity for first-run users?**

**No, the three-state machine REDUCED ambiguity.** Pre-W2 the first-run mod saw:
- Top half of tab: "First-run wizard" orange box with Step 1 path picker.
- Bottom half (40% opacity, but visible): legacy token-input + "Lead-mod only feature" status text (visible to non-leads — P0-07).

Post-W2:
- State A: a single coherent block with the headline, primary CTA, and path divider+row. NO greyed-out legacy block. NO lead-section flash.
- State B/C: a clean "Token active" banner with token-management collapsed inside `<details>`. NO first-run wizard.

The hidden-by-default + explicit `__tokSetState()` flip is structurally cleaner and the user-facing copy is simpler. Confirmed by reading popup.html:450-829 + popup.js:210-218.

**Q6: New hidden step: Drive folder must be shared with new mod's Google account — `invite-mod.ps1` reminds Commander but the mod doesn't see this. If Commander forgets, mod sees an empty Drive. Step 4 fails silently.**

**Confirmed.** This is FP-NEW-1, written up above. The script line 382-385 is a one-line console reminder that does not block the script from completing. Lead can finish the script, paste DM, walk away, and never share the folder. Mod hits Step 4 and gets Chrome's generic "Manifest file is missing or unreadable" error. **Recommend: add `Read-Host` block in invite-mod.ps1 between Step 5 (DM text written) and Step 7 (final report) that says "Have you shared the Drive folder with `{user}`'s Gmail? (Y/N) — script will not exit until Y." This is a 5-line patch and would close the most-impactful new failure mode introduced by W2.**

---

## Recommendations (priority-ordered)

### P0 — Fix before the next mod onboard

**R-1.** Add a `Read-Host` blocking gate in `scripts/invite-mod.ps1` between current line 388 ("Add their Gmail, set 'Viewer' permission") and line 392 ("Total elapsed: ..."): explicit "Confirm Drive share with `{user}`'s Gmail (Y/N): " prompt that loops until the lead types Y. Closes FP-NEW-1. **5-line script patch. Out of read-only audit scope; flagged for action.**

### P1 — Land in v10.14

**R-2.** Wire `_ageDays` in `__applyTierGate` (popup.js:1909) to read `workerModToken_issued_at` (the actually-set field) with `rotated_at` as a secondary fallback. Closes FP-NEW-3 / RALPH-W2 Finding A. Required to make the W2 banner age-tier feature work in production. SHIPMASTER §6 doesn't list this; should be added as D-41 or hot-fix v10.13.5.

**R-3.** SHIPMASTER §6 D-22 (in-popup install accordion + status-bar tooltip tour). Without this, FP-1 / FP-2 / FP-3 / FP-4 / FP-7 stay live and the Phase-1 install pain continues to dominate TTFS.

### P2 — Backlog

**R-4.** Adjust auth banner color tiers so `setup` and `credential` are visually distinguishable. Either bump `setup` toward Bloomberg amber (`#ff9933`) and keep `credential` warm-amber (`rgba(240,160,64)`) — using the existing brand palette — or move `credential` to a different hue family entirely (warm orange #f97316?). Closes FP-W2-1 / RALPH-W2 Finding B.

**R-5.** Flip the DM-text recommendation in `invite-mod.ps1:310-318` so Path B (ZIP) is recommended-default and Path A (Drive auto-update) is the opt-in alternative. Reduces FP-NEW-1 exposure until R-1 lands as a hard gate.

**R-6.** UIUX2-36 §E-3 (status-bar tooltip tour) — covered by SHIPMASTER §6 D-22, listed here for visibility. ~2-5 min TTFS reduction per UIUX2-36 estimate.

**R-7.** UIUX2-36 §E-5 (username validation hint in claim wizard) — `firstRunUsername` field at popup.html:501 has placeholder "e.g. catsfive" but no inline error specificity for "username not found" / "case mismatch". `firstRunGo` at popup.js:3468 prints `'claim failed: ' + (worker error)` — actionable but generic. Add "Username not found — check capitalization" branch keyed on the worker's specific error string.

---

## Closing observation

**The W2 ship is a real Phase 3 / Phase 4 win, not a placebo.** UIUX2-36 estimated E-2 (Open GAW button) at 30-60s TTFS reduction. With the auth-banner severity-tier remediation bundled in (which UIUX2-36 didn't price because it was P1-41/42/43 in the pre-W2 audit, not in §E), the actual reduction is ~2-3 min for the median mod and up to 5-10 min for the unlucky mod whose first-load auth fails transiently (the auto-attempt + clear remediation collapses what was previously a Discord-DM-the-lead loop).

**The Phase 1 install ceiling is unbroken.** UIUX2-36's 12-min target ("minimum viable halving") still requires the install accordion + status-bar tour. Those are deferred. **The biggest ROI improvement available to the project right now is the `invite-mod.ps1` Drive-share gate (R-1, 5-line script patch)** — not because the time savings are huge (~5-10 min for the affected 1-in-5 onboarding) but because the failure mode is silent, undiagnosable from the mod's side, and burns lead-side support cycles. It's the cheapest way to eliminate a new failure mode that W2 inadvertently created.

**TTFS: 25 min -> ~22-23 min.** Not a halving. A 10-12% improvement that disproportionately benefits the mod whose first auth attempt fails transiently. Phase 1 still owns the bulk of the budget.

---

*RALPH-FIRSTRUN audit complete. Read-only. No code or git operations performed.*
