# UAT — GAW ModTools v9.17.0 Onboarding (Fresh-Mod, Day 1)

Auditor view. Walks every artifact a brand-new mod touches and flags every place a non-technical user gets stuck. Findings are grounded in `INSTALL.md`, `manifest.json` (v9.17.0), `popup.html`, `popup.js` (saveToken @ L502, __claimInviteClick @ L1583, __applyLeadGate @ L665), `modtools.js` (mt_invite parser @ L17905, header link selector chain @ L17960-18003, __validateModAuth @ L19304, __showAuthFailBanner @ L19336).

## A) Happy Path

1. Lead DMs invite link `https://greatawakening.win/?mt_invite=CODE48`.
2. Mod has Drive Desktop sync; opens `E:\My Drive\GAW\mod-tools\unpacked\` in Explorer.
3. Mod opens `chrome://extensions`, enables Developer mode, clicks Load unpacked, picks `unpacked/`.
4. Mod pins ModTools via the Chrome puzzle icon.
5. Mod logs into greatawakening.win on the same Chrome profile.
6. Mod clicks the lead's invite link in the GAW tab; content script parses `mt_invite`, finds the header user link, shows native `confirm()` naming the recipient.
7. Mod clicks OK; `gam_pending_invite` is staged in `chrome.storage.session`; URL param is stripped; snack instructs them to open the popup.
8. Mod opens popup, clicks `Claim invite`; popup prompts for GAW username.
9. RPC `authClaimInvite` -> `/mod/token/claim-rotation` mints + auto-stores team token.
10. Mod hard-refreshes GAW; `__validateModAuth` returns ok and the status bar paints.

## B) Broken Paths

- **No Drive Desktop sync (Path A in INSTALL):** INSTALL line 1 ASSUMES sync is running. Failure: Path B (offline ZIP) is buried under "EASY PATH"; mod never sees `gaw-modtools-LATEST.zip` referenced in step 1. Remediation: lead the install with "Do you have Drive Desktop? [yes -> Path A] / [no -> Path B]" decision tree at the top of INSTALL.

- **Drive Desktop installed but folder not "Available offline":** Drive shows the folder but `unpacked/manifest.json` is a placeholder `.gdoc`-style stub. Chrome reports `Manifest file is missing or unreadable`. INSTALL line 73 calls this gotcha #1 but only mentions the wrong-folder case. Remediation: add gotcha "Right-click the folder in Drive -> Available offline -> ON before Load unpacked."

- **Pastes invite URL into Team Mod Token:** popup.js L514 catches this with regex `^https?:\/\/.*?mt_invite=(...)`; extracts code, falls into the L523 invite-shape branch, stages, scrolls to Claim button with orange outline. **Works.** But: status text "looks like an INVITE CODE (not a token). Staging for Claim flow..." reads as an error to a non-tech user. Remediation: greenify the status, change copy to "Got it — that was an invite link. Click Claim invite below."

- **Pastes invite CODE into Team Mod Token:** Same L523 branch handles 16-128 char codes. If 32+ chars and shape-valid as token, L564 post-save whoami probe catches the 401, rolls back, re-stages. Two-tier fallback works. Remaining friction: the rollback UX shows "Worker says that is NOT a token..." which is correct but jarring after the input said "validating...". Remediation: collapse the two paths into one status line that doesn't flip from "validating" -> "warn" -> "warn".

- **Brave with Shields enabled:** Brave Shields strip query params on cross-site navigation. The lead's invite link contains `?mt_invite=CODE`; Shields' "Block tracking parameters" allowlist does NOT include `mt_invite`. The param is gone before modtools.js L17915 ever runs. Failure mode is silent: no snack, no alert, no URL bar evidence. Remediation: ship a small Brave-detection (`navigator.brave?.isBrave()`) on greatawakening.win that warns "Brave Shields may strip your invite — paste the URL into the popup's Claim flow instead." Document in INSTALL.

- **Clicks invite link while logged out of GAW:** modtools.js L17960-18003 selector chain finds nothing; L18004 path fires alert() with clear instructions. **Good.** But the alert blocks the page; new users have closed it without reading. Remediation: replace with a persistent in-page red banner (same style as `__showAuthFailBanner` at L19336) so the message survives.

- **Reloads extension mid-claim:** `gam_pending_invite` lives in `chrome.storage.session` which is wiped on extension reload. Mod clicks Claim invite in popup -> "no invite staged — visit an invite link in a GAW tab" (popup.js L1597). Mod has no idea why. Remediation: when staging at L18036, ALSO write a 5-min TTL copy to `chrome.storage.local.gam_pending_invite_backup`; on reload, popup checks backup and restores into session.

- **Two mods on same machine (Drive sync conflict):** Both load the same `unpacked/` folder -> same Chrome extension ID (manifest.json L6 pinned key). Both write to the same `chrome.storage.local`. Second mod's `claim-rotation` overwrites first mod's `workerModToken`. Silent identity collision. Remediation: detect on save by comparing `whoami.username` to the previous one and throw a hard modal "This Chrome profile already holds a token for X. Use a separate Chrome profile per mod." Currently NO guard exists.

## C) The 5 Most Painful Frictions

1. **`INSTALL.md` step 9 conflates two flows.** "Click the invite link OR paste your token in Team Mod Token" — but INSTALL never explains that 99% of fresh mods only get the invite link, never the token. The OR turns into AND in the user's head. **Fix:** Split into a clear "If your lead sent you a link..." vs "If your lead sent you a 48-char code..." block. (`INSTALL.md` L16-17.)

2. **Brave Shields silently strip `mt_invite`.** No detection, no docs. **Fix:** Add Brave detect on first GAW page load and a sticky banner; document in `INSTALL.md` Common Gotchas. (`modtools.js` L17915 — add detection upstream of the parser.)

3. **`__showAuthFailBanner` + popup do not cross-talk.** Banner says "claim a rotation invite"; popup is closed; mod reopens popup and lands on Stats tab with no claim CTA. **Fix:** Banner's "Force re-hydrate" should ALSO open the popup with the Tokens tab pre-selected. (`modtools.js` L19372-19392 + `popup.js` tab-nav at the top of file.)

4. **Drive Desktop "Available offline" gotcha not in INSTALL.** Cause #1 of "manifest is missing or unreadable" reports per Commander's history, not just wrong-folder. **Fix:** `INSTALL.md` L73-75 — add the `Available offline` toggle as gotcha #1. (`INSTALL.md` L71-79.)

5. **First-time popup shows the Stats tab with `—` everywhere.** Fresh mod has no roster, no token; sees six dashes and no instruction. The `loadToken` first-run hint at `popup.js` L497 is in the Tokens tab, not the default Stats tab. **Fix:** When `__validateModAuth` fails, force `wireTabNav` to land on the Tokens tab and surface a top banner "Step 1 of 1: claim your invite". (`popup.html` L34-39, `popup.js` saveToken context.)

## D) Score (fresh-mod perspective)

- Discoverability of next step: **5/10** (token-tab hint is good once you find it; default tab is Stats which is empty)
- Error clarity: **7/10** (post-9.9.1 token/invite auto-routing is genuinely good; banner copy is clear)
- Time-to-authenticated: **~6-8 minutes** happy path on Chrome / **15-25 minutes** with one mistake (sync, Brave, wrong folder)
- Brave/non-Chrome compatibility: **3/10** (Shields strip the param, no detection, no docs)
- Recovery from wrong inputs: **8/10** (saveToken auto-routes URL paste AND invite-code paste; whoami probe rollback is solid)

Composite: **5.8/10**. Strong recovery story; weak first-step framing and platform-edge cases.

## E) Priority Fix List (impact / effort)

1. **`INSTALL.md` rewrite — decision-tree top, Brave gotcha, Available-offline gotcha.** Pure docs. ~30 min. Removes the two highest-volume failure modes immediately.
2. **Brave detection + warning banner on greatawakening.win.** ~20 lines in `modtools.js` near L17915. Eliminates the silent param-strip dead-end.
3. **Force popup to Tokens tab + show "Step 1 of 1" banner when unauthenticated.** ~15 lines in `popup.js` `wireTabNav` + `loadToken`. Solves discoverability for every fresh open.
4. **`gam_pending_invite` backup to `chrome.storage.local` with TTL.** ~10 lines in `modtools.js` L18033 staging block + `popup.js` L1594. Survives reload-mid-claim.
5. **Two-mods-same-machine guard at `claim-rotation` success.** ~20 lines in `popup.js` L1660 area; compare new `mod_username` to prior; hard-modal on mismatch. Prevents silent identity collision.

Total effort: **~3 hours of focused work** removes the top 5 fresh-mod failure modes and lifts composite score to ~8/10.
