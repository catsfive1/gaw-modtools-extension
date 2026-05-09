# UIUX-06 — Onboarding + Auth + Install Audit
**Auditor:** UIUX-06-ONBOARDING
**Generated:** 2026-05-09
**Scope:** popup.html, popup.js, modtools.js (auth-fail banner only), docs/INSTALL.md, scripts/install-gaw-modtools.ps1

---

## A. P0 (Broken or Close to Broken)

### A.1 — First-run user lands on Tokens tab: CONFIRMED WORKING

`detectInitialTab()` (popup.js:2869) reads `gam_settings.workerModToken` via `chrome.storage.local`. If token is absent or shorter than 32 chars, it returns `'tokens'` and sets a pulsing red dot on the Tokens tab button. `setTab('tokens')` then fires and activates the correct tab. The dot is injected once and CSS-animated at 1.5s ease-in-out.

**No defect.** One observation: if the SW is cold and `__tokensStatus()` takes >1s to respond, the popup renders Stats tab briefly before jumping to Tokens. The race is cosmetic but visible on cold starts.

### A.2 — Welcome toast on first claim (ASK-069): CONFIRMED, ONE SUBTLE BUG

The welcome banner fires from `__claimInviteClick` (popup.js:2550) only when `gam_welcomed` is falsy in `chrome.storage.local`, then sets it to `true`. Logic is correct.

**Bug:** `gam_welcomed` is NOT in `OWNED_KEYS` (popup.js:19 — `OWNED_KEYS = Object.values(K)`, and `K` lists only `gam_mod_log`, `gam_users_roster`, `gam_deathrow`, etc.). Both the Factory Reset (`chrome.storage.local.remove(OWNED_KEYS)`) and the Maintenance reset (`maintResetDefaults`) leave `gam_welcomed` intact. After a Factory Reset followed by re-onboarding, the welcome toast never fires again, even though the mod is going through first-run setup a second time. This is a low-stakes correctness bug — the toast is polish-only — but it means the reset path silently breaks ASK-069.

**Patch needed:** Add `'gam_welcomed'` to the `remove` call inside both Factory Reset and `maintResetDefaults`.

### A.3 — Auth-fail banner reasonSteps wizard (D.2.17): CONFIRMED WORKING, ONE DEAD REFERENCE

`__showAuthFailBanner` (modtools.js:22213) builds an `<ol>` programmatically. Each `reason` code maps to 4 `<li>` nodes using `textContent` only (no innerHTML). Verified:

- `no_token` / `short_token` → step 1 says "Click 'Open ModTools popup'" — button exists, wired.
- `whoami_status` → same popup button.
- `fetch_failed` / `no_response` → step 1 says **"Click 'Force re-hydrate' (button below)."**

**Dead reference:** The `fetch_failed` step 1 tells the mod to "Click 'Force re-hydrate' (button below)." There is no such button in the auth-fail banner's own DOM. The `Force re-hydrate` button (`rehydrateBtn`) was removed from `popup.html` (the popup comment at line 129-137 documents its removal in v10.3). The banner's `btnRetry` button IS labeled "Force re-hydrate" in the DOM (modtools.js:22282-22283). So the button exists but step 1 of the wizard says "button below" — which implies the button is below the list. It IS: `row` appended after `msg`. This is fine, but the wording is ambiguous on small viewports where the button may be cut off.

**Genuine dead reference in `whoami_status` step 2:** "go to Settings > Token and delete the current token." There is no "Settings > Token" menu path in the popup. The correct instruction is "go to the Tokens card and paste a new token, or click Re-enter credentials." Minor but confusing for a non-tech mod.

### A.4 — Invite-link pre-fill into claim code field: PARTIALLY WORKING, USERNAME NOT PRE-FILLED

The content script detects `?mt_invite=CODE` in `location.search` on page load (modtools.js:20606), stages the code into `chrome.storage.session.gam_pending_invite` and mirrors it to `chrome.storage.local.gam_pending_invite_backup`. The popup's `__claimInviteClick` reads both stores with a 5-min TTL fallback. The code field IS pre-filled from the staged invite.

**Not pre-filled: username.** The staging step also writes `gam_pending_invite_for` (the mod's current GAW username from `_me`). However, `__claimInviteClick` calls `__popupAskText` to ask for the username (popup.js:2500) without reading `gam_pending_invite_for`. The `__popupAskText` function has no `prefill`/`initialValue` parameter. So despite the system knowing the intended recipient, the mod must type their username manually.

**Impact:** One extra manual step on the most common onboarding path (invite link → Claim button). Eliminable.

The wizard path (firstRunPathLink) avoids this problem because `firstRunUsername` is a visible input field the mod fills as part of the step flow. The issue is specific to the `Claim invite` button outside the wizard.

### A.5 — Token field security (cleartext vs hidden): MIXED

All token input fields use `type="password"` by default:
- `tokenInput` — `type="password"` in HTML.
- `leadInput` — `type="password"` in HTML.
- `firstRunInput` — starts as `type="password"` in HTML. The wizard overrides to `type="text"` for the `link` path (popup.js:2667) so the URL is readable. **This is correct behavior** — pasting a URL into a password field would obscure it and make it impossible to verify.

The old `Claim invite` button path (`__claimInviteClick`) does NOT display the code — it reads from session storage, never from a visible field.

**No defect on token visibility.** One observation: when the wizard is on the `link` path, the full invite URL including the code is visible in cleartext. This is intentional and appropriate for usability, but it means the code is screen-readable. Acceptable tradeoff for a non-technical user.

---

## B. P1 (High-Friction for Non-Programmer Mods)

### B.1 — Where a first-time user GETS STUCK

Ordered by likelihood:

1. **Drive Desktop / Available Offline** (highest probability). The extension fails to load silently — Chrome shows "Manifest file is missing or unreadable" — if the user skips "Available offline." INSTALL.md calls this out in Step 2 with **"CRITICAL, DO NOT SKIP"** in the heading and requires the green checkmark before proceeding. Well placed. The PS1 installer cannot help here because it deals with ZIP installs, not Drive Desktop.

2. **Username field in claim flow** (common). After clicking the invite link and seeing it auto-detect, the mod clicks "Claim invite" in the popup and is immediately presented with a text modal asking for their GAW username. The system already stored the username in `gam_pending_invite_for` at staging time. This is an eliminable friction step (see A.4).

3. **Wizard visible for already-authed users**: NOT an issue. `initFirstRunWizard` reads via `__tokensStatus()` (the SW RPC) and only shows the wizard if `hasTeamToken` is false. The v10.3 fix for the Drive Desktop reload-loop is in place.

4. **"no invite staged" dead end.** If a mod opens the popup WITHOUT having first visited a GAW page with `?mt_invite=CODE` in the URL, then clicks "Claim invite," they see: "no invite staged — visit an invite link in a GAW tab." This is accurate but gives no recovery path for the common mistake of opening the popup first. INSTALL.md Path 5A step 2 says "Make sure you are signed into greatawakening.win in the same Chrome profile" and "Click the invite link" BEFORE opening the popup — but a mod who reverses the order hits this dead end with no in-popup guidance about what to do next. The error message should add: "Open the invite link your lead sent you in a GAW tab, then come back here."

5. **Brave + invite link invisible failure.** The Brave gotcha section in INSTALL.md is present and accurate. The in-extension amber rescue banner (modtools.js:20555-20580) fires if Shields strips the query parameter. If the amber banner also does NOT appear (e.g. because the mod has no team token yet and the pre-token guard blocks the banner), the mod is stranded. The banner guard at line 20555 says `if (st && st[K_SETTINGS] && st[K_SETTINGS].workerModToken) return;` — this means the Brave banner is suppressed when no token is saved. A fresh Brave user gets neither the invite nor the rescue banner. The fallback is INSTALL.md's manual paste instruction, but it requires the user to have read INSTALL.md.

6. **"claim rejected" error with no recovery action.** When `authClaimInvite` RPC returns a non-ok response, the status reads `"claim rejected (HTTP 404) -- invalid code"` (or similar). No link to INSTALL.md, no "ask your lead" prompt. Add a recovery hint sentence.

7. **Restart notice bar (E.2.1) timing.** `__showPopupRestartNotice()` only fires when a popup RPC call catches `context invalidated`. If the user opens the popup, the extension context invalidates WHILE the popup is open but BEFORE the user interacts, the notice will not appear until the user tries to click something. There is no proactive check on popup open. This is a narrow window but real on extension reload (e.g. during update). Low priority within P1 but worth noting.

### B.2 — INSTALL.md Decision Tree Discoverability

The "Do you have Google Drive Desktop?" binary decision at the top of INSTALL.md is discoverable before the user starts — it is the first content after the title. The TL;DR section occupies lines 3-12 and forces the branch decision immediately.

**One gap:** The `chrome://extensions` > Developer Mode step is repeated in both Path A and Path B but the instructions say "Toggle Developer mode ON (switch is in the top-right corner of the page)" — this is correct for Chrome. For Edge it is in the same location. No issue.

**One gap:** Path B Step 3 says "Same as Path A Step 3 above" with no inline repeat. For a non-programmer reading on a phone while following instructions on a PC, cross-references within a document are friction. Minor.

### B.3 — "Available offline" gotcha placement

The gotcha is in Step 2 of Path A, with a heading containing "CRITICAL, DO NOT SKIP" and six numbered sub-steps plus a verification gate ("Do not proceed to Step 3 until the green checkmark is solid"). This is the correct placement and the loudest possible formatting in Markdown. PASS.

The gotcha also appears correctly in Common Errors: "Drive Desktop folder not set to Available Offline." PASS.

### B.4 — PS1 installer: does it work end-to-end with a Discord ZIP?

Static analysis:

- No `<placeholder>` syntax anywhere in the script.
- The `$DEFAULT_ZIP_URL` placeholder (`https://github.com/YourOrg/gaw-modtools/releases/latest/download/gaw-modtools.zip`) contains `YourOrg` — this is a dead URL that will fail at runtime for any mod who runs without supplying `-ZipUrl`. **This is a real failure for most mods.** The script logs a warning ("No -ZipUrl provided; using default") and then attempts the download, which will fail with a download error. The error handler fires, the failure report is clean, the debug log copies to clipboard, and the mandatory 4-step ending runs. The failure mode is handled gracefully but the default URL must be updated before shipping to mods.

- `-InviteCode` parameter is present and logged loudly in Magenta. However, the invite code is only printed to console — it is NOT copied to clipboard. The clipboard at end of script contains the full debug log (correct per CLAUDE.md rule 2.3), not the invite code. But per the CLAUDE.md rule, secondary artifacts go to a file. Here, the invite code IS a primary artifact for the mod's next step — they need to paste it into the popup. The script says to do it manually but doesn't write it to a file at a labeled path. Minor: the code is visible on screen and the mod can copy it from the console output.

- `NEXT STEPS` block (lines 348-361) is informational console output, not executable commands. No `<placeholder>` syntax. Clean.

### B.5 — Error message clarity when claim fails

`__claimInviteClick` on failure: `"claim rejected (HTTP 404) -- invalid code"`. No recovery hint. A non-programmer mod reads this and has no next step. Minimal fix: append `" — ask your lead for a fresh invite link."` to any non-2xx failure.

### B.6 — "Token expired — click here to rotate" inline link

This link is injected by `maintTokenProbe` (popup.js:4067-4080) into `maintTokenStatus` when token age > 90 days. On click it calls `_cardAuthFailed()` (expands and highlights the Tokens card) and scrolls to `rotateBtn`. `rotateBtn` is gated by `gateRotateBtn()` to be hidden when no token is stored — but at this point a token IS stored (the probe confirmed it by getting a whoami response), so `rotateBtn` is visible. The scroll-to-rotate flow works correctly.

**One friction point:** This link is in the Maintenance card, under "Token health probe" → status div. The mod must first click "Token health probe" to surface it. It is not surfaced proactively. A better pattern would be to show it on popup open if `rotated_at` is > 90 days old. The current design requires the user to know to run the probe.

### B.7 — Onboarding wizard shown for already-authed users

Tested logic at popup.js:2616-2643. The wizard reads via `__tokensStatus()` (SW RPC). If SW is cold, falls back to `chrome.storage.local`. In both cases, if a token of >= 32 chars exists, `hasToken = true` and `wiz.style.display = 'none'` fires. The wizard does NOT show for already-authed users. PASS (v10.3 fix confirmed present).

### B.8 — Force re-hydrate button removed from popup: confirmed

Comment at popup.html:129-137 confirms removal. The auth-fail banner version in modtools.js:22282-22283 (`btnRetry = "Force re-hydrate"`) is intact and calls `preloadSecrets()` + `syncSecretsToBackgroundVault()` + `__validateModAuth()` with UI feedback. This path works correctly. PASS.

---

## C. P2 (Polish)

### C.1 — Tier badge in popup

`__renderTierBadge()` (popup.js:1235) sets `tierBadge` text to `"LEAD"` or `"SR-LEAD"` with CSS classes `tier-lead` / `tier-senior-lead`. For plain `mod` tier, badge is hidden. Badge is in the popup header (`pop-header`), visible at top of popup. PASS.

**Gap:** The badge is only in the popup header. There is NO tier label on the in-page status bar (`buildStatusBar` in modtools.js). A mod cannot see their tier tier from the page status bar without opening the popup. The C5 button is Commander-only and hardcoded by username, not tier. Lead mods running without opening the popup get no in-page tier signal.

### C.2 — Claim success animation

The welcome toast (`showPopupBanner`) uses the `success` severity color (`bb-green` border, auto-dismisses after 5s). The wizard's success state (`firstRunWizardSuccess`) shows a green checkmark header, a personalized "Welcome, u/catsfive (lead)" line, a brief instruction, and a "Done — collapse this card" button. The card then auto-collapses via `_cardWizardComplete()` after 5s with a "Re-run setup" badge added to the card header. This is a good UX exit ramp.

**Gap:** The wizard success step has a hardcoded string about "Refresh greatawakening.win to see the status bar at the bottom" (popup.html:392-393). If the user has already visited GAW (which they must have to receive the invite), this instruction suggests they need to refresh, but doesn't make clear whether the status bar will appear immediately or requires a full extension reload. For a non-technical mod, this ambiguity may cause them to reload the extension unnecessarily. Minor.

### C.3 — Lead-only section visual distinction

`#leadSection` (the Lead card) is a collapsible `<details>` card with the `crown emoji` title and the `#leadOnlyTools` gated by tier. The Lead tab in the nav is hidden for `mod` tier (`leadTab.style.display = 'none'` for non-leads). Senior leads see `leadOnlyTools` but not the full-lead-exclusive tools. The tier-change dropdown is shown only for full leads. The visual hierarchy is correct.

**One gap:** The `#card-lead` card is always present in the DOM and rendered visible by default (`open`). For `mod` tier, `leadTab` is hidden in the nav, but the Lead card BODY may still be visible if the mod scrolls — `#leadOnlyTools` is hidden but the lead token input (`#leadSection`) is always visible because of the v9.6.1 chicken-and-egg fix. A plain mod sees the Lead Mod Token paste field. INSTALL.md does not explain when to use this field. Potentially confusing but not harmful (pasting the wrong token into the lead field just fails quietly).

### C.4 — "Welcome, {username}" personalization

Both wizard success paths (`firstRunWizardSuccess`) and the welcome toast use `who.data.username` from `/mod/whoami` response (popup.js:2733, 2771, 2557). The `firstRunSuccessName` element reads "Welcome, u/catsfive (lead)" for leads and "Welcome, u/catsfive" for regular mods. PASS.

### C.5 — Help surface from within popup

The popup has no direct "Get help" link or button. INSTALL.md's final section lists Discord/Slack/lead email/in-extension bug report, but that page is not linked from the popup. The bug report surface referenced in INSTALL.md ("go to the Tools tab, click Bug Report") does not exist — there is no "Bug Report" button in the Tools tab. Bug reports exist in the Lead section under Settings > Bug reports (`bugListBtn`) which is **lead-only**. A non-lead mod has no in-extension path to file a bug report. This is a gap.

### C.6 — Maintenance Repair button (AF-07): discoverable?

`maintRepair` button is inside `<details class="pop-maint-advanced">` under "System diagnostics (advanced)" — collapsed by default. A first-time user will never find it without instructions. The button's title attribute explains its purpose clearly ("Non-destructive. Checks gam_settings for missing or wrong-type keys and fills them with safe defaults. Tokens + UX prefs are never touched."). Given it's a recovery tool, the discoverability is appropriate: mods who need it will be guided there by a lead or the diag log.

---

## D. Proposed v10.7 Patches

**1. Add `gam_welcomed` to Factory Reset wipe scope**
- File: `popup.js`
- Location: `$('clearBtn').addEventListener` block, the `chrome.storage.local.remove(OWNED_KEYS)` call (~line 656)
- Before: `await chrome.storage.local.remove(OWNED_KEYS);`
- After: `await chrome.storage.local.remove([...OWNED_KEYS, 'gam_welcomed', 'gam_pending_invite_backup']);`
- Also update `maintResetDefaults` in popup.js (~line 4393) to remove `gam_welcomed` from the settings-only reset list.
- Rationale: Factory reset re-enters the wizard but welcome toast never fires again.

**2. Pre-fill username in `__claimInviteClick` from `gam_pending_invite_for`**
- File: `popup.js`
- Location: `__claimInviteClick`, ~line 2500
- Before: `const username = await __popupAskText({ title: 'Claim rotation invite', label: '...', placeholder: 'e.g. PresidentialSeal', ... });`
- After: Read `gam_pending_invite_for` from session (already retrieved in the `out` object earlier in the function), pass as `initialValue` to `__popupAskText`. Add `initialValue` support to `__popupAskText` (~line 785): set `input.value = o.initialValue || ''` after creating the input element.
- Rationale: Eliminates one manual-entry step on the most common onboarding path.

**3. Fix `whoami_status` step 2 dead reference**
- File: `modtools.js`
- Location: `reasonSteps` for `whoami_status`, ~line 22241
- Before: `'Step 2 of 3: In the popup, go to Settings > Token and delete the current token.'`
- After: `'Step 2 of 3: Open the popup, expand the Tokens card, and click "Re-enter credentials" (bottom of card) or paste the new token directly into the Team Mod Token field.'`
- Rationale: "Settings > Token" path does not exist.

**4. Add recovery hint to `__claimInviteClick` failure**
- File: `popup.js`
- Location: ~line 2536-2538 in `__claimInviteClick`
- Before: `statusEl.textContent = msg;`
- After: `statusEl.textContent = msg + ' — if the code is expired, ask your lead for a fresh invite link.';`
- Rationale: Non-programmer mods have no recovery path from the bare error string.

**5. Fix "no invite staged" message**
- File: `popup.js`
- Location: ~line 2483
- Before: `statusEl.textContent = 'no invite staged — visit an invite link in a GAW tab';`
- After: `statusEl.textContent = 'no invite staged — click the invite link your lead sent you in a GAW tab first, then return here and click Claim invite.';`
- Rationale: Adds the missing action without a link, directly recoverable by a non-programmer.

**6. Update PS1 installer default ZIP URL before shipping**
- File: `scripts/install-gaw-modtools.ps1`
- Location: line 67
- Before: `$DEFAULT_ZIP_URL = 'https://github.com/YourOrg/gaw-modtools/releases/latest/download/gaw-modtools.zip'`
- After: Set to the actual release URL, or change to a `Read-Host` prompt with instructions if the URL rotates per release.
- Rationale: The placeholder URL causes a download failure for every mod who runs without `-ZipUrl`.

**7. In-page tier badge on status bar**
- File: `modtools.js`
- Location: `buildStatusBar()`, ~line 16649, after the brand button construction
- Proposal: Append a small `LEAD` / `SR` chip to the brand button or to the right of it when `isLeadMod()` returns true.
- Rationale: Lead mods have no in-page tier signal without opening the popup.

**8. Add bug report link for non-lead mods**
- File: `popup.html` + `popup.js`
- Proposal: Add a "Report a bug" link in the popup footer (next to Export/Import/Factory reset) that opens a minimal bug-report form available to all tiers. Currently bug reports are lead-only.
- Rationale: INSTALL.md documents this feature but it doesn't exist for the target audience (non-lead mods).

---

## E. First-Run User Journey Map

**Persona:** Non-programmer mod, Windows, Chrome, receives invite link via Discord DM. No prior extension installs.

| Step | Action | Surface | Friction | Notes |
|---|---|---|---|---|
| 1 | Reads Discord DM with invite link + INSTALL.md link | Discord | 0 | Lead should send both |
| 2 | Opens INSTALL.md | Browser | 0 | TL;DR decision tree is first content |
| 3 | Decides Path (Drive Desktop Y/N) | INSTALL.md | 0 | Decision is binary and immediate |
| 4 | Drive Desktop: Right-clicks mod-tools folder, clicks "Available offline" | File Explorer | **+1** | Non-obvious that stubs don't load; INSTALL.md warns loudly |
| 5 | Waits for green checkmark | File Explorer | **+1** | Could be 30s-3min depending on file count |
| 6 | Opens chrome://extensions, enables Developer Mode | Chrome | 0 | Step is clear |
| 7 | Clicks "Load unpacked," selects folder | Chrome | **+1** | Inner vs outer folder confusion; documented in Common Errors |
| 8 | Pins extension | Chrome | 0 | Step is clear |
| 9 | Clicks invite link in Discord | Discord | 0 | Auto-navigates to GAW |
| 10 | GAW page loads; content script detects `?mt_invite=CODE`, stages it, strips URL | GAW (silent) | 0 | Snack notification fires |
| 11 | Clicks ModTools icon in toolbar | Chrome toolbar | 0 | Red dot on Tokens tab guides attention |
| 12 | Popup opens on Tokens tab | Popup | 0 | Wizard appears (first-run) |
| 13 | Wizard step 1: selects "I have an invite LINK" | Popup wizard | 0 | Clear 3-option choice |
| 14 | Wizard step 2: pastes FULL invite URL | Popup wizard | **+1** | URL must be re-copied from Discord; invite was already staged from step 10 — redundant ask |
| 15 | Types GAW username | Popup wizard | 0 | Required, clearly labeled |
| 16 | Clicks "Save & verify" | Popup wizard | 0 | Single CTA |
| 17 | Wizard shows "Authenticated" + "Welcome, u/username" | Popup wizard | 0 | Clear success state |
| 18 | Clicks "Done — collapse this card" | Popup wizard | 0 | Exit affordance present (added v10.5.1) |
| 19 | Navigates to greatawakening.win, hard-refreshes | GAW | **+1** | Instruction is in wizard success text but easy to miss |
| 20 | Sees status bar at bottom of page | GAW | 0 | Success |

**Total friction points:** 5  
**Time-to-first-success-ban estimate:** 8-15 minutes (dominated by Drive Desktop sync wait)

**Biggest eliminable friction:** Step 14 (re-pasting invite URL when it was already auto-detected and staged in step 10). The wizard could read `gam_pending_invite` from session storage and skip to the username step when a staged invite is already present.

**Second biggest:** Step 7 (inner vs outer folder confusion). This is a Chrome behavior gap, not fixable in the extension. INSTALL.md covers it in Common Errors.

---

## F. INSTALL.md Verdict

**Overall:** High quality. Significantly better than the pre-v10.6 state. The Drive Desktop gotcha is placed exactly where it belongs (Step 2, top of the action sequence for Path A), not buried in Common Errors. The binary TL;DR decision tree is the first content the user reads.

**Strengths:**
- TL;DR decision fork is immediate and unambiguous.
- Brave gotcha has both a "what the extension does automatically" and a "what to do if the auto-fix doesn't work" section.
- Verification Checklist at the end is actionable and specific (8 checks, all binary pass/fail).
- Common Errors covers the top 5 actual failure modes with specific remediation.
- Linux notes exist and are honest about limitations.

**Gaps:**
1. Path B Step 3 cross-references Path A Step 3 without repeating the content. Non-programmers on a second screen benefit from inline duplication.
2. "Where to Get Help" references an in-extension bug report path ("go to the Tools tab, click Bug Report") that does not exist for non-lead mods. The Tools tab has "Debug snapshot" and "Dashboard" — no Bug Report. Should reference the Diag tab instead, or acknowledge that bug reports require the lead.
3. Path A Step 5A step 3 says "A confirmation dialog will appear naming you — click OK." This is the `window.confirm()` dialog from the content script's legacy flow. Under the current platform-hardening flag (default true), this confirm dialog does NOT appear — the invite is staged silently and the mod is shown a snack. The step is inaccurate.
4. No mention of extension version number and how to verify it (visible in the popup header as "v10.6.0").

---

## G. PS1 Installer Verdict

**Parse clean:** CONFIRMED. `[Parser]::ParseFile` returns 0 errors under Windows PowerShell 5.1 parser.

**BOM:** CONFIRMED PRESENT (`0xEF 0xBB 0xBF` prefix verified).

**Non-ASCII characters:** NONE. ASCII-only content confirmed.

**No `<placeholder>` syntax:** CONFIRMED. No angle-bracket substitution markers anywhere.

**Mandatory 4-step ending block:** CONFIRMED PRESENT AND CORRECT.
- Step 1: All output goes through `Log()` into `$log` ArrayList throughout execution. PASS.
- Step 2: `($log -join "\`r\`n") | Set-Clipboard` followed by `'[FULL DEBUG LOG COPIED TO CLIPBOARD]'`. PASS. Log also persisted to `D:\AI\_PROJECTS\logs\install-gaw-modtools-YYYYMMDD-HHMMSS.log`. PASS.
- Step 3: E-C-G beep sequence (659ms, 100ms sleep, 523ms, 100ms sleep, 784ms). PASS.
- Step 4: `Read-Host 'Press Enter to exit'` gated on `-NoPause`. PASS.

**Real defect — dead default URL:**
- Line 67: `$DEFAULT_ZIP_URL = 'https://github.com/YourOrg/gaw-modtools/releases/latest/download/gaw-modtools.zip'`
- `YourOrg` is a placeholder org name. Any mod running without `-ZipUrl` gets a download failure. The error path handles it gracefully (logs error, copies debug log to clipboard, beeps, pauses) — but the install fails. This must be resolved before shipping to mods.

**Secondary issue — InviteCode not written to artifact file:**
- When `-InviteCode` is supplied, it is printed in Magenta to console but not written to a labeled file at `D:\AI\_PROJECTS\logs\`. After the script exits and the PowerShell window closes, the mod loses the printed output if they didn't read it in time. The debug log on clipboard does contain the invite code (it went through `Log()`). Low risk since the code is also in Discord. Minor.

**PS 7-only syntax check:** Script uses no PS 7-only syntax. All conditionals use `-eq`, `-ne`, `-lt`. No ternary, no null-coalescing, no `&&`/`||` chaining. PASS.

**Summary:** Installer is production-quality minus the dead default URL. Fix line 67 before shipping.
