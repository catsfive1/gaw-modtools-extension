# UIUX2-36 — First-Run Mod Onboarding Journey
## v10.13 Design Ralph V2

**Scope:** New mod, zero prior knowledge, Chrome on Windows. Walk: install → invite link → claim token → load GAW → see in-page UI → first ban action.

**Method:** Full code walk of `popup.html`, `popup.js` (`initFirstRunWizard`, `__claimInviteClick`, `detectInitialTab`), `modtools.js` (`init`, `showTokenOnboardingModal`, `buildStatusBar`, Easter Egg EE5), and `docs/INSTALL.md`. UI/UX evaluated against the `ui-ux-pro-max` skill rule set (priority 1→10).

---

## A. Journey Walk-Through (numbered steps with screenshots-in-words)

### Phase 0 — Before First Click

The mod receives a Discord/DM message from the lead with:
- a Google Drive link to the extension folder (Path A), OR
- a ZIP attachment (Path B), PLUS
- an invite link (`https://greatawakening.win/?mt_invite=...`) OR a raw 48-char invite code OR a minted team token

Three separate artifacts delivered through a side channel. The mod must juggle them without any in-product guidance yet.

---

### Phase 1 — Install (Steps 1–6, ~20 clicks, ~5–15 minutes)

**Step 1.** Open Chrome. Navigate to `chrome://extensions/`. _[Mod must know this URL exists or be told it verbally.]_

**Step 2.** Toggle "Developer mode" ON (small switch, top-right of the extensions page). _[Unlabeled icon before hover. No indication this is needed unless you read INSTALL.md first.]_

**Step 3.** Click "Load unpacked". Chrome opens a system file-picker dialog.

**Step 4.** Navigate to the Drive-synced folder (Path A) or unzipped folder (Path B). Must land on the folder containing `manifest.json` at its top level — not a parent folder, not a subfolder. _[Silent failure if wrong level: "Manifest file is missing or unreadable" with no breadcrumb.]_

**Step 5.** Click "Select Folder". The GAW ModTools card appears in the extension list.

**Step 6.** Click the puzzle-piece icon in Chrome toolbar → find GAW ModTools in dropdown → click the pin icon. _[The icon is not in the toolbar yet — first-time Chrome users don't know to look in the puzzle-piece menu.]_

After Step 6: the GAW ModTools shield icon appears in the Chrome toolbar. No badge, no "what next" prompt. The extension is installed but completely silent.

---

### Phase 2 — First Popup Open (Step 7)

**Step 7.** Click the toolbar icon. The popup opens.

What the mod sees: a `Stats` tab is active (auto-detected as first-time via `detectInitialTab()`). Wait — actually the opposite: `detectInitialTab()` checks for a saved token. No token found → it appends a pulsing red dot to the **Tokens** tab and auto-switches to **Tokens**. So the mod lands on:

- Header: "ModTools v10.6.0" (no version matters to a new mod)
- Tabs: **Stats · Tokens [red dot] · Tools · Lead · Diag**
- Active tab: Tokens
- Visible: The `firstRunWizard` block (orange-bordered box labeled "✨ First-run setup · Step 1 of 2")
- Below wizard: greyed-out (40% opacity) legacy token input row + "Claim invite" button

The wizard presents three buttons:
1. "📨 I have an invite LINK (https://greatawakening.win/?mt_invite=...)"
2. "🔢 I have an invite CODE (48-char alphanumeric)"
3. "🔑 I have a TEAM TOKEN (already minted)"

This is the clearest moment in the whole journey.

---

### Phase 3 — Claim Flow (Steps 8–13, Link path)

**Step 8.** Mod clicks "📨 I have an invite LINK". Wizard advances to Step 2 of 2:
- Prompt text: "Paste the FULL invite URL your lead sent you (https://greatawakening.win/?mt_invite=...)"
- Input field (type=text, auto-focused)
- Username field (labeled "Your GAW username")
- Buttons: "← Back" and orange "Save & verify"

**Step 9.** Mod pastes the invite URL.

**Step 10.** Mod types their GAW username. _[Username must match their GAW account exactly. No autocomplete, no validation hint, no example text beyond "e.g. catsfive".]_

**Step 11.** Mod clicks "Save & verify" (orange button, full-width).

Status text appears: "⌛ minting your team token via /mod/token/claim-rotation..."

**Step 12.** Worker validates code + mints token. On success: wizard advances to success state:
- Large green "✓ Authenticated" header
- "Welcome, u/[username]" text
- Instructional text: "Refresh greatawakening.win to see the status bar at the bottom. Your token is stored in IndexedDB backup..."
- Orange button: "Done — collapse this card"
- Separately, the `__claimInviteClick` path in the old flow fires a welcome toast: "Welcome, [name]! Your token is stored and ModChat is live. You're ready to moderate." (only on first claim)

**Step 13.** Mod clicks "Done — collapse this card". Wizard collapses. Stats and other data begin loading automatically (5s timer fires `loadToken() + loadLead() + loadStats()`).

**Subtotal Phase 3: 6 steps, 3 clicks + 2 pastes/types.**

---

### Phase 4 — First GAW Page Load (Steps 14–16)

**Step 14.** Mod either clicks the "GAW" button in the popup Stats tab action grid, or navigates to `greatawakening.win` manually. The instruction from the success screen says "Refresh greatawakening.win" — so the mod needs an already-open tab, or must know the URL. _[No direct link to GAW on the success screen itself.]_

**Step 15.** Page loads. `modtools.js` `init()` fires within the content script. If token is present: status bar builds and injects at the bottom of the page. The bar contains: brand button, gear (settings), separator, inbox (modmail), + various feature icons.

What the mod sees at the bottom: a thin dark horizontal bar with emoji icons and labels. No "welcome" overlay. No "here is what this bar does" guide.

**Step 16.** Mod looks at the status bar. Meaning is non-obvious:
- The brand button (shield icon) — opens... something? (the Triage Console on /users, or a settings panel)
- The gear icon — settings
- The inbox icon — modmail
- ModChat bubble — opens chat panel

No tooltip tour. Tooltips exist on hover (`title=`) but hover requires mouse discovery.

**Subtotal Phase 4: 3 steps, 1 navigation.**

---

### Phase 5 — First Ban Action (Steps 17–22)

**Step 17.** Mod navigates to `greatawakening.win/users`. The Triage Console (`buildTriageConsole()`) builds and injects. A snack appears: "🛡 Triage Console loaded — N users tracked".

**Step 18.** Mod sees the users list with injected mod controls per row (flags, ban button, Intel Drawer trigger). The ban hammer icon (🔨) is present on each row but without a label — icon-only.

**Step 19.** Mod hovers the ban icon. A `title` tooltip appears. Mod clicks the icon.

**Step 20.** The ban modal opens. It contains: username pre-filled, ban reason selector, optional duration, optional note, confirm button. Canned messages can be selected from Team Macros if any have been configured.

**Step 21.** Mod fills in the reason and clicks "Ban". A confirmation preflight appears ("Are you sure? This will ban [user]...").

**Step 22.** Mod confirms. Ban executes. If this is the first ban of the calendar day, Easter Egg EE5 fires:

> A `MutationObserver` watches the snack container. When a "banned" snack fires, it disconnects and after 400ms shows: "🦅 First blood! Patriots were patient — patience is up."

Snack appears and auto-dismisses. The mod has completed their first ban.

**Subtotal Phase 5: 6 steps, ~4 clicks.**

---

## B. Friction Points + Click Count

**Total clicks from zero to first ban: ~28–34 clicks** (varies by path, browser state, and how fast the mod finds each control).

Broken down:

| Phase | Steps | Clicks / Actions | Friction Level |
|---|---|---|---|
| 0 — Side-channel setup | 0 | 0 clicks, but cognitive overhead of receiving 3 artifacts | HIGH |
| 1 — Install | 6 | 12–16 clicks (Drive sync wait, file picker nav) | HIGH |
| 2 — First popup open | 1 | 1 click | LOW — wizard auto-shows |
| 3 — Claim flow | 6 | 3 clicks + 2 text inputs | LOW — wizard is clear |
| 4 — First GAW load | 3 | 1 navigation | MEDIUM — success screen has no direct link |
| 5 — First ban | 6 | 5–7 clicks | MEDIUM — icon-only ban button |

### Named Friction Points

**FP-1 (HIGH): Zero pre-install guidance in-product.**
The mod receives the folder/ZIP via a side channel (Discord, email). There is no "go here first" landing page, no QR code, no in-browser onboarding URL. The journey starts cold, outside the product.

**FP-2 (HIGH): Drive Desktop "Available Offline" step.**
INSTALL.md calls this "CRITICAL, DO NOT SKIP" and it is. The mod must right-click a folder in File Explorer and toggle a setting most people have never touched. The extension gives no feedback if this step is missed — Chrome surfaces a cryptic "Manifest file is missing or unreadable" error.

**FP-3 (HIGH): Chrome `chrome://extensions/` + Developer Mode discovery.**
Non-programmer mods do not know this URL exists. The install guide documents it, but the guide lives in the repo — the mod only has it if they were given a link to it. No reminder appears in the extension itself.

**FP-4 (MEDIUM): Folder selection level ambiguity.**
The file picker fails silently if the mod selects the parent folder (common mistake when the ZIP was extracted to a folder-inside-folder). Error message is Chrome's generic "Manifest file is missing or unreadable" — not actionable without INSTALL.md open.

**FP-5 (MEDIUM): Puzzle-piece → pin sequence is invisible.**
New Chrome users don't know extensions go into the puzzle-piece overflow menu by default. The icon is not visible until pinned.

**FP-6 (MEDIUM): Success screen has no direct link to GAW.**
After claiming the token, the success screen says "Refresh greatawakening.win" but does not provide a clickable link. The mod must either already have a GAW tab open or type the URL. The popup Stats tab has a "GAW" action button but it's not called out on the success screen.

**FP-7 (MEDIUM): Status bar has no "what is this" affordance on first load.**
The thin bar appears at the bottom with no introduction. All icons are emoji-based (`🛡`, `⚙️`, `📥`, `💬`) with no visible labels. Discovery is hover-only.

**FP-8 (LOW): Ban button is icon-only on the users list.**
The 🔨 icon on each user row has a `title` tooltip but no visible label. A new mod must hover to discover the action. Per ui-ux-pro-max rule `nav-label-icon`: "Navigation items must have both icon and text label; icon-only nav harms discoverability."

**FP-9 (LOW): Username field in claim flow has no validation hint.**
The mod must type their exact GAW username (case-sensitive match against the worker's mod_tokens table). If they get it wrong, the error is "claim failed: [worker error string]" — not "username not found, check capitalization."

**FP-10 (LOW): Brave shields strip invite parameter silently.**
The extension has mitigation (amber rescue banner), but only works if Brave's query-stripping is detected. If the banner doesn't appear, the mod gets no feedback at all that the click failed.

---

## C. Time-to-First-Ban Estimate

| Mod profile | Estimate |
|---|---|
| Tech-savvy mod (knows chrome://extensions, has Drive Desktop) | 8–12 minutes |
| Average mod (non-programmer, gets verbal hand-holding) | 20–35 minutes |
| Solo first-run from docs only, no voice guidance | 45–90 minutes (FP-2, FP-3, FP-4 compound) |

The wizard (Phase 3) is fast: ~60–90 seconds once the popup is open. The majority of TTFSuccess time is burned in Phase 1 (install friction) and, to a lesser extent, in Phase 4 (discovering GAW + status bar).

**Current TTFS for the median mod: ~25 minutes.**

The claim wizard itself (Phase 3) is the best-designed part of the journey. The install phase is the worst.

---

## D. First-Run Anti-Patterns (Assumes Prior Knowledge)

The following patterns in the current flow assume knowledge that a new mod does not have:

**D-1: Assumes mod knows what `chrome://extensions/` is.**
The install guide documents it, but it's not discoverable from within Chrome without explicit instruction. No in-product link opens it.

**D-2: Assumes mod knows "Developer mode" must be ON for sideloaded extensions.**
Chrome shows no hint about Developer mode on the extensions page unless the user is already there. The toggle is visually subtle (top-right, small, no visual weight).

**D-3: Assumes mod understands the manifest/folder relationship.**
"Select the folder where `manifest.json` lives" is not intuitive for non-programmers. They don't know what `manifest.json` is or why it matters. The folder structure inside a Drive sync or a ZIP can be nested — the correct level is invisible from the file picker.

**D-4: Assumes the mod has GAW open (or knows the URL) when the success screen tells them to "Refresh greatawakening.win".**
The success screen provides no clickable link and no "open GAW" button. The mod must act on a text instruction.

**D-5: Assumes the status bar is self-explanatory.**
The bar appears with no introduction, no tooltip tour, and no "first run" callout. A new mod looking at six emoji icons in a thin strip has no map.

**D-6: Assumes the Tokens tab red dot is the correct first stop.**
`detectInitialTab()` routes to Tokens and adds a pulsing red dot, which is correct. But if a mod clicks a different tab first (Stats, Tools) and sees all dashes or empty cards, they may not know why. The red dot is the only signal and it's subtle (6px diameter).

**D-7: Assumes the mod received all three artifacts (folder/ZIP + invite/token + INSTALL.md link) from the lead.**
There is no fallback if the lead only sends one of these. For example: folder without INSTALL.md = stuck at FP-3. Invite link without token path = stuck if the link expires or Brave strips it.

---

## E. Effort to Halve Time-to-First-Success

Current median TTFS: ~25 minutes. Target: ~12 minutes. These are ordered by leverage-per-effort:

### E-1 (HIGH LEVERAGE, MEDIUM EFFORT): One-click onboarding landing page
Ship a static HTML page at `gaw-mod-proxy.workers.dev/onboard` (or a pinned Discord message with a tinyurl). The page:
- Links directly to the invite URL (pre-filled from the lead's generate flow)
- Embeds a 60-second video or animated GIF of the 4-step install
- Has a "Load the extension" button that opens `chrome://extensions/` in a new tab

Eliminates FP-1, FP-3 partial. Estimated time saved: 5–10 minutes for the average mod.

### E-2 (HIGH LEVERAGE, LOW EFFORT): Add a "Go to GAW" button on the wizard success screen
After "✓ Authenticated", add a single full-width secondary button: "Open greatawakening.win →". Opens the URL in a new tab. One line of HTML, one line of JS.
Eliminates FP-6. Time saved: 30–60 seconds, plus removes the confusion moment.

### E-3 (HIGH LEVERAGE, LOW EFFORT): First-load status bar tooltip tour
On first authenticated page load (flag `gam_status_bar_tour_shown` not set), display a sequential tooltip popover:
1. Pointing at the bar: "This is your ModTools status bar."
2. Pointing at the inbox icon: "Tap to open modmail."
3. Pointing at the users icon: "Tap to go to the triage queue."
4. Auto-dismiss after 3 steps or Esc.

Uses `snack()` or a custom tooltip chain. 1–2 hours of engineering. Eliminates FP-7.

### E-4 (MEDIUM LEVERAGE, MEDIUM EFFORT): Add label to ban button on users list
Change the 🔨 icon-only button on each user row to include a text label "Ban" visible at all times, or at minimum below the icon in the hover state. Per ui-ux-pro-max `nav-label-icon` rule. CSS change + minor DOM tweak.
Eliminates FP-8. Time saved: ~30s per new mod but removes a confusion/hesitation moment before the first action.

### E-5 (MEDIUM LEVERAGE, LOW EFFORT): Username validation hint in claim wizard
Add a `<div class="pop-token-hint">` below the username field in Step 2 of the wizard: "Enter your exact GAW username (case-sensitive, no @)." If the claim fails with a username-not-found error, show: "Username not found — check spelling and capitalization. Your GAW username appears in your profile URL: greatawakening.win/u/[yourname]."
Eliminates FP-9.

### E-6 (HIGH LEVERAGE, HIGH EFFORT): Automated install verification link
When a lead generates an invite link, the invite URL can carry a `?verify=1` parameter that, when visited, auto-checks: is the extension installed? Token claimed? If not, shows a step-by-step inline guide. Requires worker-side invite metadata + content script detection.
Eliminates FP-1 through FP-5 in one shot. Estimated effort: 1–2 sprints.

### E-7 (LOW LEVERAGE, MEDIUM EFFORT): In-popup Drive Desktop setup guide
Add a collapsible "How to install" accordion to the wizard Step 1 screen. Content mirrors INSTALL.md Path A/B but condensed to 5 bullets with inline screenshots. No external docs required.
Partially addresses FP-2, FP-3, FP-4. Time saved: variable — eliminates the "I have to go find the docs" moment.

### Summary Table

| ID | Friction eliminated | Effort | Est. TTFS reduction |
|---|---|---|---|
| E-2 | FP-6 | Low (1 line HTML/JS) | 30–60s |
| E-5 | FP-9 | Low (~10 lines) | 30s + error recovery |
| E-3 | FP-7 | Low–Medium (1–2h) | 2–5 min |
| E-4 | FP-8 | Low (CSS + DOM) | 30s |
| E-7 | FP-2, FP-3, FP-4 (partial) | Medium (1–2h copy/markup) | 5–10 min |
| E-1 | FP-1, FP-3 (partial) | Medium (landing page) | 5–10 min |
| E-6 | FP-1 through FP-5 | High (2 sprints) | 10–15 min |

**Minimum viable halving (target 12 min TTFS):** Ship E-2 + E-3 + E-5 in one pass. Combined effort: ~4–6 hours. Eliminates the three friction points that compound most for a non-programmer: no post-auth next step, no status bar guidance, no username validation.

---

*Authored by UIUX2-36-FIRST-RUN for v10.13 Design Ralph V2. 2026-05-10.*
