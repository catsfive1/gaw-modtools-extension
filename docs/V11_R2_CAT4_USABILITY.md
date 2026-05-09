# V11 R2 Cat 4 — USABILITY / INTERACTION / ACCESSIBILITY
**Generated:** 2026-05-08 by Cat 4
**Lens:** Interaction flow, friction elimination, learnability, error recovery, discoverability, accessibility (WCAG 2.1 AA target), keyboard-first navigation, screen-reader support, cognitive load, undo/safety, focus management, modal abuse, decision fatigue, recognition over recall, time-to-first-value. This lens is distinct from Cat 3 (visual design) and Cat 2 (workflow compression): it asks "can a mod with no mouse and 30 seconds accomplish this task without calling anyone?" every time.

---

## A. THE TOP 25-30 (ranked by usability leverage)

---

### 1. Unauthed-First-Screen Fix: Force Popup to Tokens Tab on First Load

- **Why through usability lens:** UAT_ONBOARDING §C-5 is precise: fresh mod opens popup, lands on Stats tab showing six dashes, assumes the extension is broken and closes it. The Tokens-tab hint at `popup.js:L497` exists but sits on the wrong default tab. Recognition-over-recall (Rule 49) fails immediately. The mod must _recall_ that they need to navigate away from a blank screen.
- **Test case:** Screen-reader user opens popup for the first time. Popup announces "Stats tab — no data." They hear nothing actionable. They have no keyboard path to "what do I do next" without Tab-walking all four tabs.
- **Implementation sketch:** In `wireTabNav` (popup.js L1864) and `loadToken` (popup.js L457): when `__validateModAuth` returns a fail state, call `wireTabNav('tokens')` to force-select the Tokens tab and inject a top-of-panel `role="alert"` banner reading "Step 1: claim your invite or paste your token here." The aria-live assertive region already mounted (`modtools.js:L3755`) mirrors this to screen readers. ~15 lines total.
- **150-rules cross-ref:** Rule 49 (recognition over recall), Rule 66 (empty states must educate), Rule 50 (one clear primary action per screen).
- **Effort:** S
- **Risk:** Lo — no UI structure change; one tab-select + one banner injection.
- **Dependency:** None.
- **Success metric:** Fresh-mod time-to-seeing-"Claim invite" CTA drops from "unknown, maybe never" to under 3 seconds.
- **Stretch ambition:** Auto-focus the Team Token input field on tab activation so keyboard users can paste immediately without a Tab keystroke.

---

### 2. Token Field Label/Scaffold: Make Paste-Into-Wrong-Field Physically Impossible

- **Why through usability lens:** The 🔑 vs 👑 distinction (HANDOFF §6.2, UAT_ADVOCATE §C-2) is Cat 3's visual problem but the _label, help text, and tab order_ are Cat 4's. "Both look like passwords" (UAT_ADVOCATE §E). The cognitive failure is that both fields have the same label structure, same input type, same size — they are perceptually identical to a non-technical mod. Visual differentiation alone (Cat 3) does not solve paste-into-wrong-field; label copy and inline description do.
- **Test case:** Keyboard-only user tabs from field to field. Screen reader announces "Team Mod Token, edit text" then "Lead Mod Token, edit text." No semantic difference. They paste into the wrong one. The 401 fires. Recovery requires reading the banner, understanding "Force re-hydrate," and re-entering. That is a 30-second minimum tax on every mistake.
- **Implementation sketch:** Add `aria-describedby` on each field pointing to a visually-hidden but SR-audible description: Team Token: "Your personal identity token — this is the one your lead emailed you. Required for basic mod access." Lead Token: "Only for lead moderators — if you are not the lead, leave this blank." In `popup.html` lines 259-273: wrap each field group in a `<fieldset>` with a `<legend>` that disambiguates (not just emoji — actual sentence). Place Team Token above Lead Token with a visible `<hr>` separator labeled "Lead access only below this line." Tab order: Team Token → Claim invite → Lead Token (not Team → Lead as currently structured, which invites parallel-paste mistakes).
- **150-rules cross-ref:** Rule 49 (recognition over recall), Rule 58 (warnings must be specific), Rule 89 (microcopy must be human and precise).
- **Effort:** S
- **Risk:** Lo — copy + aria changes only. Does not touch storage or auth logic.
- **Dependency:** None (but compound benefit with item #1 — both land on Tokens tab together).
- **Success metric:** Wrong-field paste rate drops toward zero. Auth-fail banner invocations for "token shape mismatch" decline measurably.
- **Stretch ambition:** On focus of Lead Token field, show inline dismissible hint: "Most mods never need this. Your team token is above."

---

### 3. Auth-Fail Banner → Cross-Talk With Popup (Open Tokens Tab Directly)

- **Why through usability lens:** UAT_ONBOARDING §C-3 names this as friction #3: the banner says "claim a rotation invite," the popup is closed, the mod reopens popup, lands on Stats (blank) with no Claim CTA visible. Two screens, zero cross-talk, mod loses the thread. Error recovery (Rule 17) exists for the banner; it does NOT exist for the popup-open path that follows.
- **Test case:** Keyboard user dismisses Tokens tab, receives a 401 in-page. Banner appears (good). They press Tab to reach "Force re-hydrate." They activate it. Nothing opens. Screen reader announces "Session refreshed" toast. No Claim invite is announced. Mod does not know what to do next.
- **Implementation sketch:** In `modtools.js:L19372-19392` (`__showAuthFailBanner`): the "Force re-hydrate" click handler should additionally fire `chrome.runtime.sendMessage({cmd:'openPopup', tab:'tokens'})`. Background.js receives this and calls `chrome.action.openPopup()` (Chrome 127+ API — already on MV3). On popup open, `wireTabNav` reads `chrome.storage.session.openPopupTab = 'tokens'` and activates that tab with the "Step 1" banner. Full keyboard-continuable recovery path from banner to Tokens tab in two activations.
- **150-rules cross-ref:** Rule 17 (error messages must be actionable), Rule 16 (focus must never be lost), Rule 99 (system recovery must be fast and automatic).
- **Effort:** S (popup-side) + S (background.js message handler) = M total but two small patches.
- **Risk:** Lo — `chrome.action.openPopup()` is supported Chrome 127+; needs feature-detection fallback (open popup instructions in snack if API unavailable).
- **Dependency:** Item #1 (tokens-tab default on unauth). Ship together.
- **Success metric:** "Claim invite" CTA visible within 2 activations of the auth-fail banner on keyboard-only path. No mouse required for full recovery.
- **Stretch ambition:** Banner's keyboard focus lands on "Force re-hydrate" button automatically (via `__showAuthFailBanner` calling `rehydrateBtn.focus()` after mount).

---

### 4. "Force Re-Hydrate" Appears TWICE — Merge to One With Contextual Copy

- **Why through usability lens:** `popup.html` surfaces "Force re-hydrate" at line 117 (main panel) AND at line 168-169 (inside Maintenance section as "Force re-hydrate (token vault)"). A freshman mod who hits auth problems sees two identical buttons in different sections. UAT_ADVOCATE §E: "Am I going to break something?" The duplication communicates that there are TWO problems instead of one fix. This is a direct violation of Rule 8 (one intent = one action) and a cognitive-load amplifier.
- **Test case:** First-time user, tabbing through popup. Tab-walking hits "Force re-hydrate" at position N. Then hits "Force re-hydrate (token vault)" at position N+X. Screen reader announces both. Mod pauses to understand the difference. There is no difference. Decision fatigue costs 10-15 seconds.
- **Implementation sketch:** Remove the Maintenance-section duplicate (popup.html L168-169). Keep only the top-level button. Update its label from "Force re-hydrate" to "Reconnect to worker" — plain language, no developer jargon. Add `aria-describedby` pointing to a one-sentence description: "Use this if the status bar disappeared or shows an auth error." The Maintenance section gets a text reference: "Auth issues? Use 'Reconnect to worker' at the top of the Tokens tab."
- **150-rules cross-ref:** Rule 7 (visual stability — two identical buttons implies two states), Rule 8 (one intent = one action), Rule 21 (minimize decision fatigue).
- **Effort:** S
- **Risk:** Lo — one button removed, one copy change.
- **Dependency:** Item #1 (must be on Tokens tab to find the single button).
- **Success metric:** Freshman mod interaction test: no pause on "why are there two re-hydrate buttons?" 

---

### 5. Right-Click Context Menu: Keyboard Equivalent and Screen-Reader Triggering

- **Why through usability lens:** V11 Plan item #1 (the Big Bet) and Cat 2 W1/W5 all rest on the right-click context menu. Cat 2 addressed the flow compression. Cat 4 addresses the accessibility hole: the browser `contextmenu` event is mouse-triggered. A keyboard-only user has no path to it. A screen-reader user operating in "browse mode" cannot right-click. This is a WCAG 2.1 SC 2.1.1 (Keyboard) violation waiting to happen.
- **Test case:** Keyboard user navigates to a post row (Tab/arrow keys). They want to quick-ban. Without a keyboard path to the context menu, they must use `Ctrl+Shift+B` — the existing mnemonic shortcut that new mods don't know exists. Rule 3 (keyboard-first) is ⚠ exactly because of this gap.
- **Implementation sketch:** Two-track solution. Track A (keyboard trigger): when a post/user element has keyboard focus, register `Shift+F10` (standard keyboard contextmenu trigger) AND `Enter` on a dedicated "Actions" button injected adjacent to each row (visible on focus, hidden otherwise — the "focus-reveals-actions" pattern). Track B (screen reader): each focusable post/user chip gets `aria-haspopup="menu"` and `aria-controls="gam-ctx-menu"`. The context menu panel gets `role="menu"` with `role="menuitem"` children. Arrow-key navigation within menu, Escape closes and returns focus to trigger element. In `modtools.js` context-menu router: listen for `keydown` Shift+F10 on `[data-gam-postid]` and `[data-username]` — same handler as the mouse `contextmenu` event, same menu population.
- **150-rules cross-ref:** Rule 3 (keyboard-first ⚠ advance), Rule 15 (accessibility ⚠ advance), Rule 16 (focus must never be lost), Rule 82 (no traps).
- **Effort:** M (keyboard trigger + ARIA role=menu + focus management + Shift+F10 binding)
- **Risk:** Md — `role="menu"` imposes strict ARIA keyboard contract (arrows must work; Tab must close menu). If arrow-key nav is incomplete, SR users get trapped. Must ship with full keyboard contract or not at all.
- **Dependency:** V11 Plan #1 (right-click router must exist before keyboard-equivalent wraps it).
- **Success metric:** NVDA/JAWS test: user can navigate to a post, open the action menu, select "Quick-ban," complete the flow, and have focus return to the post row. Zero mouse required.
- **Stretch ambition:** `?` shortcut overlay (from Cat 2 C-10) reveals context-menu actions in a cheat-sheet format for discoverability.

---

### 6. Popup Default Tab Context-Awareness: Progressive Disclosure Based on Auth State

- **Why through usability lens:** The popup has four tabs (Stats / Tokens / Tools / Lead). For an authenticated mod, Stats is the right default. For an unauthenticated mod (item #1 above), Tokens is right. For a lead, Lead tab should be highlighted. Today the tab is always Stats — a single static default ignores three meaningful auth states. This is the definition of cognitive drift (Rule 1 violation pending).
- **Test case:** A lapsed mod (token expired) opens popup. Stats shows dashes. They Tab through to find the fix. A lead opens popup to run a rotation invite. They land on Stats and must click Lead. A fresh mod lands on Stats and gives up (UAT_ONBOARDING finding).
- **Implementation sketch:** In `loadToken()` (popup.js L457) resolution handler: evaluate auth state and call `wireTabNav(computeDefaultTab(authState))`. Logic: `no_token → 'tokens'`, `token_but_unauthed → 'tokens'`, `authed_non_lead → 'stats'`, `authed_lead AND last_action_was_lead_action → 'lead'` (stored in `chrome.storage.session.lastActiveTab`). On popup close, write `lastActiveTab` for restore. Three lines of state evaluation + one tab-select call.
- **150-rules cross-ref:** Rule 11 (progressive disclosure), Rule 1 (zero cognitive drift), Rule 50 (one clear primary action per screen).
- **Effort:** S
- **Risk:** Lo — tab-select only. No UI structure change.
- **Dependency:** Item #1. Ship in same commit.
- **Success metric:** Auth-state → correct-default-tab in 100% of observed test sessions across all three user types.

---

### 7. Maintenance Section: Pareto Cut (Show 3, Hide 8)

- **Why through usability lens:** UAT_ADVOCATE §C-1: 11 maintenance buttons with developer jargon ("Schema migration check," "Migration debt scanner," "Selector drift report"). A non-lead mod sees all 11. Decision fatigue (Rule 21), jargon overload, "scared of the button" UAT_ADVOCATE §E. The pareto reality: ~80% of mod-tier maintenance needs are covered by three actions — Reconnect to worker (item #4 above), Clear local cache, and Check for updates. The other 8 are lead-tier diagnostics.
- **Test case:** New mod's first week. They see "Migration debt scanner" and "Schema migration check." They wonder if something is wrong with the database. They ask the lead. The lead spends 5 minutes explaining. This is cognitive overhead with zero moderation value.
- **Implementation sketch:** Restructure `popup.html` Maintenance section: display only 3 buttons for non-lead mods: "Reconnect to worker" (item #4), "Clear local cache" (with friendly copy "Resets any stuck state"), and "Check for extension updates." Gate the remaining 8 behind `__applyLeadGate` in a collapsible `<details>` element labeled "Developer diagnostics (lead only)" defaulting to `open=false`. The `<details>` element is natively accessible (keyboard-openable, announces to SR). Non-leads never see "Schema migration check" unless they expand the details block.
- **150-rules cross-ref:** Rule 11 (progressive disclosure), Rule 21 (minimize decision fatigue), Rule 63 (no hidden critical controls — non-lead-critical controls remain visible; lead-diagnostic controls progressively disclosed).
- **Effort:** S
- **Risk:** Lo — HTML restructure + lead-gate. No functional change to buttons.
- **Dependency:** Item #4 (rename re-hydrate button first for consistency).
- **Success metric:** Freshman mod test: no mention of "schema migration" or confusion about maintenance buttons.
- **Stretch ambition:** Each visible maintenance button has a one-sentence plain-English description beneath it (e.g., "Clear local cache — use this if the status bar is stuck or showing wrong data").

---

### 8. Brave Shields: Detection, Banner, and In-Product Invite-Code Fallback

- **Why through usability lens:** UAT_ONBOARDING §B and §C-2: Brave Shields silently strip `mt_invite` from query params. The failure is invisible — no snack, no banner, no URL evidence. This is WCAG 2.1 SC 4.1.3 (Status Messages) applied to an onboarding error: the user receives no status message when a critical parameter is silently discarded. Result: invite link appears to do nothing. Mod closes tab, emails lead, onboarding stalls.
- **Test case:** Screen-reader user on Brave clicks invite link. Nothing happens. No announcement. They navigate back to the popup, land on Stats (blank). No audible indication of what went wrong or what to do.
- **Implementation sketch:** In `modtools.js` near L17915 (the `mt_invite` parser entry point): before attempting to parse, check `navigator.brave?.isBrave()` (async — use a timed probe). If Brave detected: inject a persistent `role="alert"` amber banner at the top of the GAW page: "Brave Shields may have blocked your invite. Paste the invite code directly below:" with an inline text input + "Claim" button that routes to the same `gam_pending_invite` staging flow as the URL path. This is the ONLY Brave-compatible path (no query param required). Banner persists until dismissed or invite claimed. SR announces immediately on inject (assertive live region).
- **150-rules cross-ref:** Rule 17 (error messages must be actionable), Rule 53 (graceful offline/Brave degradation ⚠ advance), Rule 58 (warnings must be specific).
- **Effort:** S (~20 lines modtools.js + the inline input + 10 lines of staging wiring)
- **Risk:** Lo — additive only. Does not change existing Chrome flow.
- **Dependency:** None. Ship in Wave 1 regardless of other items.
- **Success metric:** Brave onboarding composite score rises from 3/10 (UAT_ONBOARDING §D) toward 8/10. Zero "invite link did nothing on Brave" reports post-launch.
- **Stretch ambition:** Auto-detect Brave on any GAW page load and inject a persistent (dismissible, never re-shows after dismiss) one-time hint: "Using Brave? See the setup guide for one extra step." Link to `INSTALL_BRAVE.md` or inline instructions.

---

### 9. Universal Undo Policy: Extend 20s Toast-Undo to All Destructive Actions

- **Why through usability lens:** Rule 13 (instant undo ⚠): undo exists on Death Row queue (20s) and chat (5min edit / 24h delete). Bans, modmail sends, and note saves have no undo. V11 Plan item #19 proposes toast-undo; Cat 4 defines the _policy_: what triggers it, what the toast says, what "undo" does, and how the keyboard user activates it. Without the policy, the implementation is inconsistent — some toasts have undo, some don't, and Rule 13 stays ⚠.
- **Test case:** Keyboard user bans a user. Realizes immediately it was the wrong account. No undo key. Must navigate to mod log, find the ban, click unban — 6 clicks and 30+ seconds under time pressure. A screen-reader user has no chance in 20 seconds.
- **Implementation sketch:** Define undo policy tiers: Tier A (20s, always shown) — ban, remove post, remove comment, add-to-death-row, add-to-SUS. Tier B (5s, shown) — modmail send, note save. Tier C (no undo, but double-confirm required) — bulk actions (handled by bulk-undo as a separate flow per V11 Plan). Toast structure: "[Action] on [target] — Undo" with `role="alert"` on inject and an "Undo" `<button>` that is the first Tab target after the toast mounts. ESC closes toast _without_ undo (consistent with "ESC = cancel selection, not cancel action"). `U` key global hotkey fires undo on last Tier A action while toast is live (announce to SR: "Undo available — press U"). On undo activate, POST `/mod/op/undo` with `client_op_id`; SR announces "Ban on [user] reversed."
- **150-rules cross-ref:** Rule 13 (instant undo ⚠ — advance to ✅), Rule 30 (UI must forgive mistakes), Rule 83 (fast actions need safe recovery), Rule 16 (focus must never be lost — focus on Undo button after toast mount).
- **Effort:** M (policy document + implementation across all Tier-A action handlers + keyboard `U` binding + SR announcements)
- **Risk:** Lo (toasts are non-blocking; undo path already sketched in V11 Plan item #19's `pending_undo` D1 table approach).
- **Dependency:** V11 Plan #19 (server-side `client_op_id` + inverse action store).
- **Success metric:** "Undo last action" invocable within 3 keystrokes (Tab to toast + Enter OR global `U`) within 20 seconds for all Tier A actions. Undo invocation rate tracks at >0 (confirms mods are discovering it).
- **Stretch ambition:** Multi-step undo: `U` pressed again after first undo undoes the _previous_ Tier A action (simple stack, max depth 3). Parity with modern text editors.

---

### 10. Focus Management: Return Focus After Panel Close

- **Why through usability lens:** Rule 16 (focus must never be lost) is marked ✅ in the 150-rules audit, but the audit definition is loose — "modal focus trap; chat textarea auto-focus." The specific failure: when a Mod Console modal or modmail panel closes, where does keyboard focus go? If it returns to `document.body` (the browser default), a screen-reader user must re-navigate from scratch to their prior position. In a high-speed moderation session, losing position in a post list costs 10-30 seconds per action.
- **Test case:** Keyboard user navigates to post row 7 in a 20-item thread. Opens Mod Console (keyboard shortcut). Completes ban. Closes modal. Focus jumps to document.body. They must Tab 40+ times to return to post 8. NVDA announces nothing useful at body focus.
- **Implementation sketch:** In `closeAllPanels()` (modtools.js L5914): before closing any panel, record `document.activeElement` as `__focusReturnTarget` on the trigger that opened the panel (store on the trigger element itself: `triggerEl.dataset.gamFocusReturn = true`). On close, after panel detach: `if (__focusReturnTarget) { __focusReturnTarget.focus(); __focusReturnTarget = null; }`. For keyboard-shortcut-opened panels (no explicit trigger element): store the `document.activeElement` at shortcut-press time in a module-scoped `__kbdFocusStack` array. Pop on close. This is the standard "focus trap + restore" pattern; the trap is already implemented; only the restore is missing.
- **150-rules cross-ref:** Rule 16 (focus must never be lost — close the gap between the audit claim and the actual behavior), Rule 15 (accessibility ⚠ advance).
- **Effort:** S (one variable + one restore call in `closeAllPanels` + shortcut-press capture)
- **Risk:** Lo — additive. Does not change panel open/close mechanics.
- **Dependency:** None.
- **Success metric:** After any modal/panel close, `document.activeElement` is the element that triggered it OR the next logical element in the DOM flow (never `document.body`). Screen-reader user maintains position through a full ban-close cycle.

---

### 11. Keyboard Focus Ring: Upgrade from 1px to 3px for WCAG "Enhanced" Target

- **Why through usability lens:** Rule 80 (keyboard focus visibility must be extreme) is ⚠: "1px amber ring; could go 2-3px — deferred." WCAG 2.1 SC 2.4.7 requires visible focus (met). WCAG 2.2 SC 2.4.11 (Focus Appearance — Minimum) requires a focus indicator with minimum area and contrast. The current 1px amber ring on a dark background passes 2.1 AA but is marginal. Rule 112 (focus states on steroids) is also ⚠. These two open rules can be closed with one CSS change.
- **Test case:** Low-vision keyboard user (not full screen reader, just reduced acuity) tabs through popup. The 1px amber ring on a dark button is nearly invisible without zooming. They cannot reliably see which element is focused. Tab-walking becomes a guess.
- **Implementation sketch:** In `modtools.js` CSS near line 17300 (`:focus-visible` rule): upgrade to `outline: 3px solid var(--gam-amber); outline-offset: 2px; box-shadow: 0 0 0 5px rgba(255,176,0,0.25);`. The `outline-offset:2px` prevents the ring from being clipped by parent overflow. The secondary `box-shadow` glow gives a soft halo that is visible even against the amber accent color. No color change (amber is correct); only thickness and glow.
- **150-rules cross-ref:** Rule 80 (⚠ → ✅), Rule 112 (⚠ → ✅), Rule 15 (WCAG 2.2 SC 2.4.11 advance).
- **Effort:** S (one CSS rule change)
- **Risk:** Lo — pure CSS. No behavior change.
- **Dependency:** None.
- **Success metric:** WCAG 2.2 SC 2.4.11 manual test passes. Low-vision user test: focus indicator clearly visible at 200% zoom.

---

### 12. Search Surface: Cmd+K / Ctrl+K Command Palette With SR-Accessible Results

- **Why through usability lens:** Rule 20 (search is a primary feature ⚠): worker `/gaw/search` exists but is not surfaced. UAT_ADVOCATE §F "pro mod" and §B (26 min mark): 3 minutes lost scrolling for a thread from last Tuesday. A search surface is not just a convenience — it is the escape hatch for experienced users who know what they want but cannot locate it through navigation alone (recognition over recall failure). The Cat 2 proposal (`Ctrl+Shift+/`) is for shortcut help; Cat 4 proposes `Ctrl+K` for the search palette specifically, consistent with modern power-user tooling (VS Code, Linear, Notion all use Ctrl+K for command search).
- **Test case:** Keyboard-only mod needs to find modmail thread from a specific username. Without search: open modmail panel, scroll list, no filter. With `Ctrl+K` palette: type 3 characters, arrow-key to result, Enter opens thread. Screen-reader user: `Ctrl+K` opens `role="combobox"` with `aria-autocomplete="list"` and `aria-controls="gam-search-results"`. Results list has `role="listbox"` with `role="option"` children. Screen reader announces "3 results" on each keystroke via polite live region.
- **Implementation sketch:** New `buildSearchPalette()` function in modtools.js. Mounts as a `role="dialog"` overlay (not a modal — backdrop but dismissible on any keystroke). Input: `role="combobox"`, `aria-autocomplete="list"`, `autocomplete="off"`. On input (debounced 150ms): POST to `/gaw/search?q=X&limit=8`. Results: `role="listbox"`, each item `role="option"` with user/thread/action type prefixed. Arrow keys navigate (standard combobox keyboard contract). Enter activates. Escape closes and returns focus (item #10 pattern). `Ctrl+K` binding added to existing keyboard shortcut block (modtools.js ~L9559). Status bar gets a 🔍 icon that opens the same palette on click.
- **150-rules cross-ref:** Rule 20 (search ⚠ → ✅), Rule 49 (recognition over recall), Rule 3 (keyboard-first), Rule 133 (search syntax hints ⚠ — placeholder copy can hint at supported syntax: "Search users, threads, or actions...").
- **Effort:** M (combobox ARIA contract is non-trivial; worker endpoint exists; routing + results rendering needed)
- **Risk:** Lo (worker endpoint already exists; additive client feature)
- **Dependency:** Worker `/gaw/search` endpoint (confirmed existing per Rule 20 audit note).
- **Success metric:** Search-time-to-result under 1s for common queries. SR user can complete search-to-open-thread without mouse. Rule 20 closes to ✅.
- **Stretch ambition:** Search palette accepts `/ban @username`, `/sus @username`, `/watch @username` as inline commands (pre-loading the slash palette from Cat 2 item #13). One surface, two modes.

---

### 13. Modmail Panel Width: Collapsible to 280px Rail Without Closing

- **Why through usability lens:** UAT_ADVOCATE §C-6 and §F: "Covers half the GAW thread. No way to peek at the post the user is complaining about. Want side-by-side, got curtain." A mod processing a modmail about a specific post cannot simultaneously see that post. This is a context-switching cost on every modmail that references a thread. The 680px panel is also inaccessible to lower-resolution screens (Rule 38 ✅ is claimed, but 680px on a 1024px viewport IS a problem).
- **Test case:** Keyboard mod opens modmail panel (envelope click or keyboard shortcut). They want to read the original post the modmail references. They cannot see the post behind the 680px panel. They must close the panel, navigate to the post, memorize context, reopen the panel. For a screen-reader user, the modmail panel is a focus trap — they cannot reach behind it without closing.
- **Implementation sketch:** Add a collapse toggle button to the modmail panel header: chevron-left icon, `aria-label="Collapse to rail"`, keyboard-activatable. On click: panel animates to 280px showing only the unread-count badge and thread-title column (no message body). Collapsed state: the GAW thread behind it is now readable. Expand: click the panel or press the same toggle (now chevron-right). Store collapsed/expanded preference in `chrome.storage.local`. In collapsed rail state: SR announces "Modmail panel collapsed — X unread threads visible." The panel still traps focus only when expanded; in collapsed rail mode, Tab passes through to page content.
- **150-rules cross-ref:** Rule 38 (scale up elegantly), Rule 31 (context must stay visible), Rule 51 (nested scroll ⚠ partially addressed), Rule 2 (no vertical scrollbars unless necessary).
- **Effort:** M (width animation + focus-trap toggle + state persistence)
- **Risk:** Lo on function; Md on implementation if the existing panel structure has hard-coded width dependencies.
- **Dependency:** V11 Plan #2 (modmail 3-column panel). If 3-column panel ships first, the collapse toggle snaps to that layout.
- **Success metric:** Mods can read the post a modmail references without closing the modmail panel. "Panel covers my thread" complaint rate → 0.

---

### 14. aria-live Regions for AI Status Updates (Budget, Draft Status, Queue)

- **Why through usability lens:** Screen-reader users receive no announcement when the AI drafts a modmail reply, when AI budget crosses 80%, or when a new item arrives in the AI hold queue. Rule 15 (accessibility ⚠) and Rule 140 (AI thinking transparency ✅ for sighted users) are inconsistent: visual "AI drafting..." spinner exists, but the equivalent SR announcement does not.
- **Test case:** Screen-reader mod opens modmail panel. AI begins drafting. Spinner spins. SR announces nothing. After 2 seconds, draft appears. SR announces the new draft text only if the user navigates to it. The timing is invisible — the mod must poll manually.
- **Implementation sketch:** Two changes. (1) In `modtools.js:L6041` area (AI draft completion handler): call `__announce('AI reply drafted — 4 candidates ready', 'polite')`. The `__announce` function (already wired to the aria-live regions at L3735-3756) handles delivery. (2) In AI budget warning logic: when budget crosses 80%, call `__announce('AI budget at 80% — approaching daily limit', 'assertive')`. (3) In AI hold queue updates (new item added): call `__announce('New item in AI review queue', 'polite')`. Total: 3 one-line additions to existing announcement infrastructure.
- **150-rules cross-ref:** Rule 15 (accessibility ⚠ advance), Rule 25 (feedback loops must be immediate — for SR users too), Rule 140 (AI thinking transparency — extend to SR).
- **Effort:** S (3 `__announce` calls; infrastructure already exists)
- **Risk:** Lo — additive. Existing SR infrastructure handles delivery.
- **Dependency:** None.
- **Success metric:** NVDA test: navigating modmail panel while AI drafts → SR announces draft completion without user polling. AI budget warning announced before user hits the cap.

---

### 15. Dock Toggle: Add Undo and Replace Emoji Buttons With Labeled Controls

- **Why through usability lens:** UAT_ADVOCATE §C-4: dock toggle uses ⬅️/➡️ emoji as button text, no tooltip on the toggle itself, and hitting it accidentally jumps the chat panel with no undo. This is three violations in one button: Rule 64 (icons require text labels ⚠), Rule 13 (instant undo ⚠ — no undo on dock change), and a discoverability failure (the button is cosmetically identical to navigation arrows).
- **Test case:** Screen reader user tabs to the dock toggle. SR announces "left arrow button" (emoji label). They activate it expecting navigation. Chat panel jumps. No "undo" announcement. They must find the button again and toggle back — a 10-second interruption in a high-speed session.
- **Implementation sketch:** Replace `⬅️/➡️` text with `aria-label="Dock to left"` / `aria-label="Dock to right"` (direction reflects the target, not the current state). Add visible micro-label beneath the icon: "Dock left" / "Dock right" (3-4 chars, JetBrains Mono, 9px). After dock toggle: inject a 5-second toast "Chat panel moved — Undo" with `U` key or click to restore previous dock position. Toast SR announcement: "Chat panel docked left. Press U to undo."
- **150-rules cross-ref:** Rule 64 (icons require text labels ⚠ — partial advance), Rule 13 (undo ⚠ advance), Rule 44 (animations must serve meaning — dock slide is meaningful; undo confirms intent).
- **Effort:** S
- **Risk:** Lo — label changes + undo toast. No layout change.
- **Dependency:** Item #9 (universal undo toast pattern). Dock undo is Tier B (5-second window).
- **Success metric:** SR user can identify dock-toggle purpose before activation. No accidental dock-flip complaints post-launch.

---

### 16. Empty-State Education: New Mod Sees Empty Popover → Action, Not Confusion

- **Why through usability lens:** Rule 66 (empty states must educate ✅) is marked complete but the UAT evidence contradicts it: UAT_ADVOCATE §E "Status bar appears the moment I refresh after pasting a token" (delight) implies that BEFORE pasting, the empty state is confusing. The specific failure: a new mod opens the popup before claiming their invite, sees six dashes in the Stats grid, and no banner explains what to do. The `loadToken` hint is on the Tokens tab (which they haven't navigated to). Empty state copy exists for other surfaces ("No threads — backfill via...") but NOT for the Stats grid in unauth state.
- **Test case:** New mod, no token yet, opens popup. SR announces the Stats tab grid: six cells with "—" each. No actionable text. No link to Tokens tab. No "Step 1" language. SR user concludes the extension is non-functional.
- **Implementation sketch:** In the Stats grid render function: when `authState === 'unauthenticated'`, replace the six stat cards with a single full-width placeholder card: `role="status"`, copy: "Set up your token to see live stats — go to the Tokens tab." Include a `<button>` within the card that activates the Tokens tab (`wireTabNav('tokens')`). This is the "empty state as onboarding guide" pattern. SR announces the status region on render.
- **150-rules cross-ref:** Rule 66 (empty states ✅ but gap exists in Stats-unauth case), Rule 49 (recognition over recall), Rule 50 (primary action per screen).
- **Effort:** S
- **Risk:** Lo — conditional render in Stats grid only.
- **Dependency:** Item #1 and item #6.
- **Success metric:** New mod does not close popup confused after seeing dashes. Click-through from Stats empty state to Tokens tab measurable (if telemetry added).

---

### 17. Slash Command Palette: Keyboard Discoverability via Trie Autocomplete

- **Why through usability lens:** V11 Plan #13 (slash palette) is a Cat 1/Cat 2 feature. Cat 4's job is to define the _interaction contract_ that makes it discoverable and accessible: trie-based autocomplete so typing `/b` shows "ban," not a blank dropdown; `role="combobox"` ARIA contract; announcement of suggestion count; keyboard navigation. Without these, the palette exists but is not learnable by a first-time mod.
- **Test case:** New mod types `/` in chat. SR announces "Slash command palette open — 8 commands available." They type `b`. SR announces "3 matches: ban, block, broadcast." Arrow down: "ban selected." Enter: palette closes and ban flow opens. Escape: palette closes, typed `/b` remains in textarea, focus stays on textarea.
- **Implementation sketch:** Trie structure (`Map<string, string[]>`) pre-built at init from command list. On `/` keypress in chat textarea: mount palette `role="combobox"`, `aria-expanded="true"`, `aria-autocomplete="list"`, `aria-controls="gam-slash-results"`. Results list: `role="listbox"`. On each key: walk trie, update results (SR announcement of count via polite live region). Arrow up/down: standard listbox keyboard contract. Tab: completes selection. Escape: dismisses palette WITHOUT clearing the typed text (this is the POSIX readline convention mods expect). Include a "?" hint at bottom of palette: "Type to filter — Esc to dismiss." 
- **150-rules cross-ref:** Rule 3 (keyboard-first), Rule 49 (recognition over recall), Rule 54 (shortcuts must be discoverable), Rule 15 (accessibility).
- **Effort:** M (trie + ARIA combobox contract)
- **Risk:** Lo on UX; Md on implementation (ARIA combobox spec has edge cases for partial input + selection state that must be tested with actual SR software).
- **Dependency:** V11 Plan #13 (slash palette exists as a chat feature). This item adds the accessibility layer.
- **Success metric:** NVDA/JAWS test: mod can type `/`, navigate to a command, activate it, and complete the action without mouse. Slash palette discover rate in first session >50% (proxy: `/` typed in chat).

---

### 18. Bug-Report Viewer 403: Keyboard-Accessible Recovery Flow

- **Why through usability lens:** UAT_ADVOCATE §B (15 min mark) and §F: the bug report viewer throws HTTP 403, and the lead cannot file bug reports through the primary mechanism. This is a blocked workflow (HANDOFF F3 ❌). From a usability lens: what is the _recovery path_ for a keyboard user who hits the 403? Today there is none — the panel shows an error and stops. The mod must email the lead, which is out-of-app and inaccessible through the extension at all.
- **Test case:** Lead mod navigates to bug reports panel via keyboard. 403 fires. Panel shows "HTTP 403 — origin not allowed." SR announces the error (if it's in an aria-live region — currently unknown). There is no "report this error" button, no alternative path, no contact information. Lead is completely blocked.
- **Implementation sketch:** In the bug-report 403 error handler: (1) display a keyboard-reachable fallback: a `<button>` labeled "Report via modmail instead" that opens the modmail composition panel pre-filled with a bug report template (subject: "Bug report: [extension version] [date]", body pre-filled with current extension state dump). (2) Add `role="alert"` to the 403 error display so SR announces it immediately. (3) In the longer term: fix the underlying HANDOFF F3 worker origin gate (this is Cat 1/Cat 5 territory, but the recovery path is Cat 4's). The in-app fallback ships in Wave 1; the fix ships when Cat 1 addresses the worker issue.
- **150-rules cross-ref:** Rule 17 (error messages must be actionable), Rule 68 (every workflow must have escape routes), Rule 15 (accessibility — SR announcement of 403).
- **Effort:** S (fallback button + aria-live on error display)
- **Risk:** Lo — additive recovery path. Does not affect the broken endpoint.
- **Dependency:** None for the recovery path. HANDOFF F3 fix is a separate dependency for the full resolution.
- **Success metric:** Lead hitting the 403 has a keyboard-reachable alternative path within 2 activations. SR user is informed of the error without navigating to it.

---

### 19. Tab Order Audit: Mod Console 5-Tab Progressive Disclosure

- **Why through usability lens:** The Mod Console opens with 5 tabs (Intel / Ban / Note / Message / Quick). A keyboard user Tab-walking into the console must traverse all tabs to discover their options. More critically: for a non-lead mod, the Quick tab and potentially the Note tab are rarely used — surfacing 5 tabs always creates a fixed cognitive inventory regardless of task. Progressive disclosure (Rule 11 ✅) is marked complete for the popup; the Mod Console has not been evaluated on this dimension.
- **Test case:** Keyboard user opens Mod Console on a post they want to remove (not ban). They Tab to the console. SR announces "Intel tab, Ban tab, Note tab, Message tab, Quick tab." They are looking for "Remove" which is in the Quick tab. They must Tab through 4 tabs to find it unless they know the tab order. For a new mod, "Quick" tab name does not predict "Remove" action.
- **Implementation sketch:** (1) Reorder tabs: most-used-first based on action frequency. Proposed order: Ban / Message / Intel / Note / Quick (ban and message are highest-frequency per modmail/ban-flow analysis). (2) For keyboard users: add `Ctrl+1` through `Ctrl+5` shortcuts to jump directly to each Mod Console tab (scoped to when Mod Console is open). Announce the shortcut on first open: SR says "Mod Console open — Ctrl+1 through Ctrl+5 switch tabs." (3) Long-term: track per-mod tab usage via `chrome.storage.local` and reorder tabs to match each mod's personal frequency. (This is the "adaptive UI" pattern — surfaces the right tool first for each user's workflow.)
- **150-rules cross-ref:** Rule 3 (keyboard-first), Rule 11 (progressive disclosure), Rule 21 (decision fatigue — 5 tabs on open is 5 choices before first action).
- **Effort:** S (tab reorder + Ctrl+N shortcuts) / M (adaptive reorder)
- **Risk:** Lo — reordering tabs is a CSS order change + shortcut binding.
- **Dependency:** None.
- **Success metric:** Keyboard time from "Mod Console opens" to "correct action tab focused" reduces from N tabs traversed to 1 Ctrl+N shortcut.

---

### 20. SIREN Icon: Clear Semantic Label and Keyboard-Reachable "Why is it orange?"

- **Why through usability lens:** UAT_ADVOCATE §B (0:08 mark): "SIREN icon is amber. Why? I hover. Tooltip says 'alerts.' I still don't know what's alerting." The tooltip is supplemental-only (Rule 26 ✅) but the semantic content is insufficient. An SR user who tabs to the SIREN icon hears its `aria-label` (currently unknown — needs audit) and cannot understand what specific event triggered the amber state.
- **Test case:** SR mod tabs to SIREN chip. Hears "SIREN, 3, button" (or whatever the current aria-label is). Activates it. Goes to mod log (the wrong surface — Cat 2 W6 finding). Cannot determine what the 3 alerts are without navigating a flat log. No keyboard shortcut to "Hot Now" panel (V11 Plan #9).
- **Implementation sketch:** (1) Upgrade SIREN chip `aria-label` to be dynamic: `aria-label="SIREN alert — 2 SUS users, 1 new modmail flagged. Click for triage panel."` Updated on each poll cycle. (2) On chip keyboard activation (Enter): open "Hot Now" panel (V11 Plan #9) — NOT the mod log. (3) Add `Ctrl+Shift+T` (Cat 2 proposed shortcut) for Hot Now panel, announced in the shortcut overlay. (4) SIREN chip state description: when SR user focuses the chip, the expanded description (via `aria-describedby`) reads the current alert content without requiring activation.
- **150-rules cross-ref:** Rule 41 (system status always visible — extend to SR), Rule 20 (if Hot Now panel replaces mod-log for SIREN, search becomes less critical as a discovery path), Rule 3 (keyboard-first).
- **Effort:** S (aria-label update + dynamic content) + M for Hot Now panel (V11 Plan #9 dependency)
- **Risk:** Lo — aria-label change is immediate, safe improvement independent of Hot Now panel.
- **Dependency:** V11 Plan #9 (Hot Now panel) for the click-target change.
- **Success metric:** SR user understands SIREN state without activating the chip. After Hot Now panel lands, SIREN → panel navigation is keyboard-completable in 2 keystrokes.

---

### 21. gam_pending_invite Backup: Survive Extension Reload Mid-Claim

- **Why through usability lens:** UAT_ONBOARDING §B (reload-mid-claim path): `gam_pending_invite` lives in `chrome.storage.session` which is wiped on extension reload. Mod clicks "Claim invite" after reload → "no invite staged." They have no idea why. This is an invisible data loss event (Rule 48 ✅ is marked complete but this case is not covered). The recovery path requires returning to the invite link (which they may have closed) — a dead end for most users.
- **Test case:** Keyboard mod clicks invite link. Confirm dialog fires. They accept. Popup says "Invite staged." They get distracted, the extension reloads (Chrome update, for example). They return to popup. "No invite staged." SR announces nothing helpful. They are blocked.
- **Implementation sketch:** In `modtools.js` L18033 (invite staging block): ALSO write `chrome.storage.local.gam_pending_invite_backup = {code: X, staged_at: Date.now(), ttl: 300000}` (5-minute TTL). In `popup.js` L1594 (claim-invite check on popup open): if `session.gam_pending_invite` is empty, check `local.gam_pending_invite_backup`; if TTL not expired, restore into session and show "Invite found (restored from backup) — click Claim." SR announces the restoration via polite live region. This is ~10 lines total.
- **150-rules cross-ref:** Rule 48 (data loss is unacceptable — close this gap), Rule 19 (state persistence is mandatory), Rule 17 (error messages must be actionable — replace "no invite staged" with "invite restored").
- **Effort:** S
- **Risk:** Lo — additive backup path. Does not change primary flow.
- **Dependency:** None.
- **Success metric:** Reload-mid-claim success rate: mod can complete claim after extension reload within the 5-minute TTL. "No invite staged" error rate → 0 for reloads within TTL.

---

### 22. Skip-Link for Status Bar (Screen-Reader Navigation Shortcut)

- **Why through usability lens:** WCAG 2.1 SC 2.4.1 (Bypass Blocks) requires a mechanism to skip repetitive navigation content. The modtools status bar appears on every GAW page and contains ~12 icon-buttons before reaching page content. An SR user navigating in "Tab" mode must traverse all 12 buttons on every page load to reach the post content they want to moderate. A skip-link ("Skip to page content") placed as the first focusable element in the injected bar satisfies this SC.
- **Test case:** SR mod loads a GAW thread. They Tab into the modtools bar. They must Tab through 12 buttons (shield, gear, modlog, siren, snipe, bug, chat, presence, auth-lock, maint, and any page-specific buttons) before reaching the first post. At 2 seconds per button announcement: 24 seconds of navigation overhead per page load.
- **Implementation sketch:** In `modtools.js` bar construction: inject a visually-hidden but focusable `<a href="#gam-page-content-anchor">Skip to page content</a>` as the FIRST child of the bar. This link is visible-on-focus (appears as a small amber chip when focused via Tab, disappears on blur). On activate: focus jumps to `#gam-page-content-anchor`, a `tabindex="-1"` `<div>` injected adjacent to the first post on the page. Total: ~15 lines of injection code + 10 lines CSS for the skip link visible-on-focus state.
- **150-rules cross-ref:** Rule 15 (WCAG 2.1 SC 2.4.1 — bypass blocks), Rule 3 (keyboard-first), Rule 56 (high-frequency actions require minimal travel distance — skip-link reduces SR navigation distance from 12 tabs to 1).
- **Effort:** S
- **Risk:** Lo — skip link is additive; existing bar structure unchanged.
- **Dependency:** None.
- **Success metric:** WCAG 2.1 SC 2.4.1 audit passes. SR user navigates from bar-open to first post in 1 Tab activation (skip link) + 1 activation (anchor).

---

### 23. Loading Skeleton Matching: Upgrade "loading..." Text to Layout-Matching Placeholders

- **Why through usability lens:** Rule 60 (loading skeletons must match final layouts) is ⚠: "modmail panel uses 'loading...' text; skeleton match deferred." And Rule 147 (uniform loading skeletons) is ⚠. When a panel shows "loading..." text, SR users hear "loading" without knowing what structure to expect. A layout-matching skeleton communicates the shape of incoming content — critical for cognitive preparation and for avoiding the "why did the layout shift?" confusion (Rule 7 — visual stability).
- **Test case:** SR mod opens modmail panel. SR announces "loading." After 800ms, 12 thread rows appear. SR sequentially announces all 12 titles. The mod had no indication of how many items to expect, so they cannot decide whether to wait or act. Sighted users see a skeleton that matches the row count and height — SR users get only the single "loading" word.
- **Implementation sketch:** For modmail panel: replace "loading..." text node with `aria-busy="true"` + `aria-label="Loading modmail threads"` on the container (the `aria-busy` attribute tells SR to suppress intermediate announcements and wait for `aria-busy="false"`). On data load: set `aria-busy="false"` — SR then announces the now-populated list count. This is the correct ARIA pattern for "bulk load in progress." Visually: the existing modtools.js `aria-busy` attribute is already set at L3897 in one place — normalize this pattern across all async load surfaces. ~5-line change per async panel (modmail, mod log, stats drill-down).
- **150-rules cross-ref:** Rule 60 (⚠ → ✅ for SR dimension), Rule 147 (⚠ partial advance), Rule 7 (visual stability), Rule 78 (every delay requires explanation — extend to SR).
- **Effort:** S (aria-busy pattern is one attribute per container; already partially implemented)
- **Risk:** Lo — attribute change only.
- **Dependency:** None.
- **Success metric:** SR test: no intermediate "loading" announcements during async loads. SR announces final item count on completion.

---

### 24. Two-Mods-Same-Machine Guard: Hard-Modal With Keyboard Recovery

- **Why through usability lens:** UAT_ONBOARDING §B: two mods on the same machine, same Chrome profile — second mod's `claim-rotation` silently overwrites first mod's token. The current behavior is silent identity collision. There is no user-facing detection, no error, no recovery path. From a usability standpoint this is the worst possible failure: the user does not know it happened, there is no recovery CTA, and data loss has occurred (Rule 48 violation).
- **Test case:** Two keyboard users sharing a machine. Mod 2 claims invite. Mod 1 now has Mod 2's token silently. Mod 1's next action is audited as Mod 2. No SR announcement, no error, no recovery. Mod 1 discovers the problem when the lead asks "why did you ban that user?" 
- **Implementation sketch:** In `popup.js` L1660 area (post-claim success handler): compare new `whoami.username` to `chrome.storage.local.gam_settings.lastClaimedUsername`. If mismatch: show a keyboard-focusable hard modal `role="alertdialog"` `aria-label="Token conflict detected"`: "This Chrome profile already holds a token for [username]. Use a separate Chrome profile. [Switch Profile instructions] [OK — overwrite]." The "OK — overwrite" is the escape, not the primary. Primary CTA: "Open Chrome profile switcher" (which opens `chrome://profile-chooser` in a new tab). SR announces the alertdialog immediately on mount.
- **150-rules cross-ref:** Rule 48 (data loss is unacceptable), Rule 17 (error messages must be actionable), Rule 30 (UI must forgive mistakes), Rule 39 (high-risk actions require friction — overwrite IS high-risk).
- **Effort:** S
- **Risk:** Lo — additive guard. Does not affect the normal single-mod claim path.
- **Dependency:** None.
- **Success metric:** Two-mods-same-machine scenario produces a visible, keyboard-reachable warning instead of silent identity collision.

---

### 25. Mod Console Quick Tab: Rename "Quick" to "Actions" and Surface Keyboard Shortcut

- **Why through usability lens:** The "Quick" tab in Mod Console (UAT_ONBOARDING references Mod Console tabs) is a label that does not predict its content to a new user. "Quick" is a meta-description of speed, not a description of what actions live there. New mods tab through Intel → Ban → Note → Message → Quick without understanding that "Quick" contains remove/approve/DM options. This is a recognition-over-recall failure (Rule 49).
- **Test case:** New mod opens Mod Console. SR announces tab names: "Intel, Ban, Note, Message, Quick." They are looking for "Remove comment." They try Ban first (wrong). Then Note (wrong). Then Message (wrong). Then Quick (correct). 4 failed tab navigations.
- **Implementation sketch:** Rename tab label from "Quick" to "Actions" — 1-char HTML change. Update `aria-label` accordingly. Add a tooltip/title to the tab: "Quick one-click actions: Remove, Approve, DM, Watch." Tab label change + tooltip.
- **150-rules cross-ref:** Rule 49 (recognition over recall), Rule 117 (no mystery-meat navigation ✅ — this closes the Mod Console gap), Rule 89 (microcopy must be human and precise).
- **Effort:** S (label + tooltip)
- **Risk:** Lo — label only. No functional change.
- **Dependency:** None.
- **Success metric:** New-mod tab navigation test: correct tab found in 1st or 2nd attempt instead of 4th.

---

### 26. AI Budget: Surface Current Usage in Popup and Status Bar Tooltip

- **Why through usability lens:** UAT_ADVOCATE §C-5: "AI: suggest tard / sus patterns — counts against your daily AI budget. What budget? Where do I see it? How close am I to the cap? Mystery meat." A user cannot make informed decisions about when to invoke AI features if they cannot see their consumption state. This is a transparency gap (Rule 24 ✅ is about confidence explainability, but budget visibility is Rule 41 — system status must always be visible).
- **Test case:** Power mod uses AI-suggest tard patterns at 9 AM, then tries to use AI modmail drafting at 2 PM. The cap has been hit. They get a silent failure or an error they weren't expecting. If they had seen the budget gauge, they would have prioritized.
- **Implementation sketch:** (1) Status bar: add a small budget indicator to the existing AI-related status elements. Text: "AI: 34/100" (small, tabular-numeric, amber). Updated on each AI call response. SR-accessible via the status bar's existing aria-live cycle. (2) Popup → Tools tab: add a budget progress bar with numeric label. `role="progressbar"` `aria-valuenow="34"` `aria-valuemax="100"` `aria-label="AI budget used today"`. When budget >80%: bar turns amber, SR announces via polite region "AI budget at 80%." When 100%: red, assertive announcement "AI budget exhausted — resets at midnight UTC."
- **150-rules cross-ref:** Rule 41 (system status always visible), Rule 24 (AI confidence explainable — extend to budget transparency), Rule 14 (never punish speed — budget surprise is a punishment).
- **Effort:** S
- **Risk:** Lo — display-only. No change to AI call logic.
- **Dependency:** AI budget tracking must already be computed server-side and returned in API responses. If not, this is M effort (add to `whoami` or stats endpoint).
- **Success metric:** Mod can state their current AI budget at any time without opening a settings page. Zero "unexpected AI cap hit" complaints.

---

### 27. Color-Alone Meaning: Complete Severity Icon+Color Audit

- **Why through usability lens:** Rule 67 (color alone must never convey meaning) is ⚠: "severity icons + colors used; some color-only badges. Iterating." This is a partial WCAG 2.1 SC 1.4.1 violation. The specific surface at risk: SIREN states (amber vs red), SUS user dots (pulsing vs static), modmail thread priority badges. If these communicate state via color only, a color-blind mod (or a mod in bright sunlight on a low-contrast monitor) cannot distinguish them.
- **Test case:** Color-blind (deuteranopia) mod opens modmail panel. Thread priority badges are green (normal) vs red (flagged from prior-banned user). Without icon differentiation, they cannot distinguish. They reply to a flagged thread without escalating.
- **Implementation sketch:** Audit every color-conveying status in the codebase. For each: ensure an icon, pattern, or text label co-conveys the meaning. Specific fixes: (1) SIREN amber vs red: add text label "WARN" / "ALERT" beneath the chip (2-char, fits in the bar). (2) SUS dot pulsing: add a small "!" icon overlay. (3) Modmail priority badge: add icon (⚑ for flagged, nothing for normal). (4) AI confidence pills (high/med/low): already have text labels (Rule 24 ✅) — confirm these are the canonical reference, not color. Full audit pass: ~15-20 elements to check.
- **150-rules cross-ref:** Rule 67 (⚠ → toward ✅), Rule 15 (WCAG 2.1 SC 1.4.1 advance), Rule 23 (readable at a glance — icon + text is more glance-readable than color + color).
- **Effort:** M (audit + fixes across multiple surfaces)
- **Risk:** Lo on individual fixes; Md on the audit scope (must not miss an element).
- **Dependency:** None.
- **Success metric:** WCAG 2.1 SC 1.4.1 manual audit passes. Deuteranopia simulation test (browser devtools) shows all status states distinguishable without color.

---

### 28. Inline Help Text: "What is [feature]?" — Plain Language Tooltips for Maintenance Items

- **Why through usability lens:** UAT_ADVOCATE §E: "Maintenance routines — should I run these? Are they automatic? Is something wrong if I don't?" This is a learnability failure. The buttons exist but their operational semantics are opaque. A keyboard-accessible help system does not require opening documentation — it surfaces just-in-time context at the point of decision.
- **Test case:** New mod sees "Schema migration check" button. They hover (tooltip: maybe a brief description). They press Tab to focus it — the `title` attribute tooltip may not fire on focus in all screen readers. They need to know: "Is this automated or manual? Does running this break anything? Who should run this?"
- **Implementation sketch:** For each Maintenance button, add an `aria-describedby` pointing to a visually-present (not hidden) one-sentence description beneath the button. Example: "Schema migration check — Confirms your local database schema is current. Safe to run anytime; has no side effects." The descriptions are always visible (not tooltip-only) so keyboard users see them without hover. Progressive disclosure (item #7) hides the lead-tier buttons; the descriptions help mods understand even the 3 visible buttons.
- **150-rules cross-ref:** Rule 86 (user should never need to guess what happens next), Rule 89 (microcopy must be human and precise), Rule 49 (recognition over recall — description makes button purpose recognizable without reading docs).
- **Effort:** S (copy writing + aria-describedby addition)
- **Risk:** Lo — additive copy. No functional change.
- **Dependency:** Item #7 (Maintenance pareto cut — write descriptions for the 3 visible buttons; lead-tier descriptions written separately).
- **Success metric:** Freshman mod test: no "should I run this?" question for any of the 3 visible maintenance buttons.

---

### 29. Cross-Tab State Conflict Resolution: Announce and Recover Gracefully

- **Why through usability lens:** Rule 135 (multi-tab conflict resolution) is ⚠: "chrome.storage shared; cross-tab events not all wired." Specific failure: a mod has two GAW tabs open. They ban a user in Tab A. Tab B still shows the user as active. If the mod then tries to action the user in Tab B, they get a confusing error (the action may succeed as a duplicate, or fail silently). This is neither visible (Rule 41) nor recoverable (Rule 99) in the current ⚠ state.
- **Test case:** Mod has two threads open. Bans user in Tab A. Tab B's Mod Console for the same user is still open. They click ban in Tab B. What happens? Does the second ban fire? Does an error appear? SR user in Tab B has no indication that Tab A already acted.
- **Implementation sketch:** In `modtools.js`, whenever a state-mutating action completes (ban, note, remove), broadcast a `chrome.storage.local` update event via `chrome.storage.onChanged`. All active tabs' modtools.js instances listen for this event. If a Mod Console is open for the same username that was just actioned in another tab: inject an `aria-live="assertive"` announcement: "This user was actioned in another tab — [action taken]. This panel now reflects updated state." Refresh the Mod Console Intel tab data. This brings Tab B into sync without requiring a page reload.
- **150-rules cross-ref:** Rule 135 (⚠ → partial advance), Rule 6 (single source of truth — D1 is canonical, but cross-tab client sync needs to reflect it), Rule 41 (system status always visible).
- **Effort:** M (cross-tab event broadcast + Mod Console refresh on external mutation)
- **Risk:** Md — cross-tab messaging can cause race conditions if not carefully sequenced. Use a message debounce (100ms) to prevent cascade updates.
- **Dependency:** None.
- **Success metric:** Two-tab scenario test: action in Tab A reflected in Tab B's Mod Console within 200ms. SR announcement fires in Tab B.

---

### 30. Cognitive Load Audit: Role-Based Feature Gating as Progressive Disclosure

- **Why through usability lens:** The popup today shows all features to all mods, with lead-only sections gated but still visible (showing "you don't have access" rather than hiding). A non-lead mod sees the Maintenance (lead) section with its locked buttons, the Lead-only tools section, and the rotation roster — all of which communicate "things you cannot do." This increases cognitive inventory without increasing capability. True progressive disclosure (Rule 11 ✅ — but this specific surface is not covered) shows only what the current user can act on.
- **Test case:** Non-lead mod opens popup. SR reads through the full tab content on the Lead tab: "Maintenance (lead) section — access denied. Rotation roster — access denied. Team settings — access denied." 30 seconds of navigation through inaccessible content. Sighted user sees grayed-out sections and skips them — SR user cannot skip as efficiently.
- **Implementation sketch:** In `__applyLeadGate()` (popup.js L666): for non-lead users, do not just disable or visually gray the Lead tab — `aria-hidden="true"` the entire Lead tab panel from SR traversal, and remove the Lead tab from the `tablist` entirely (remove the tab button from the DOM for non-leads). The tab does not exist for non-leads: no navigation waste, no "access denied" overhead. The Lead tab appears in the tablist only after `__applyLeadGate` confirms lead status. `<details>` pattern (item #7) handles the Maintenance lead-section separately within the visible tabs.
- **150-rules cross-ref:** Rule 11 (progressive disclosure — extend to role-gated content), Rule 21 (minimize decision fatigue — remove inaccessible choices), Rule 63 (no hidden critical controls — non-critical inaccessible controls appropriately hidden).
- **Effort:** S (DOM remove vs gray-out in `__applyLeadGate`)
- **Risk:** Lo — removes DOM nodes for non-leads; no functional change. Must ensure the Lead tab re-appears when a non-lead upgrades to lead within the same session (unlikely but possible during rotation).
- **Success metric:** Non-lead mod SR navigation test: Lead tab not announced in tablist. SR traversal time for popup reduced by ~30% (no inaccessible-section overhead).

---

## B. WHAT V11_PLAN + V11_CAT2 MISSED (in usability lens)

**Cat 2 was flow-focused (click compression, workflow routing, missing atomic actions). Cat 2 did not address:**

1. **The auth-fail recovery keyboard path is broken end-to-end.** Cat 2 noted the banner exists and praised it. Cat 4 finds that the keyboard path from banner → popup → Tokens tab → Claim is a 4-step flow where step 2 requires mouse (popup does not open from banner via keyboard on most Chrome versions). Item #3 above closes this. Cat 2 didn't trace the keyboard path; it traced the click path. These are not the same.

2. **The ARIA combobox contract for the slash palette is unspecified.** Cat 2 proposed the slash palette (#13 in V11 Plan). Neither Cat 2 nor V11 Plan specifies the keyboard contract for the autocomplete (trie traversal, arrow-key navigation, SR announcement of suggestion count). Without this spec, the implementation is likely to be Tab-complete-only (not ARIA-compliant), which fails screen-reader users. Item #17 above closes this.

3. **Screen-reader users are not represented in any V11 workflow test case.** Every test case in Cat 2 and V11 Plan assumes a sighted user with a mouse. No test case starts with "NVDA user navigates to post row 7." The gap: some V11 features (right-click menu, slash palette, modmail 3-column) may be visually excellent and keyboard-navigable but fail on the ARIA contract that makes them SR-usable. Items #5, #17, #20 above address the three highest-risk surfaces.

4. **The cognitive load tax on the Lead tab for non-lead mods.** V11 Plan makes no mention of role-based DOM pruning — only visual gating. SR users who are non-leads traverse the Lead tab's locked sections on every popup open. Item #30 above closes this with a one-line change in `__applyLeadGate`.

5. **Empty-state education is inconsistently applied.** Rule 66 is ✅ in the audit, but the Stats tab unauth empty state is not covered (it shows dashes, not guidance). Cat 2 recommended new surfaces (Hot Now panel, mod audit view) but didn't audit the empty state of _existing_ surfaces for the unauth case. Items #1 and #16 above close this.

---

## C. INTERACTION BETS (3-5 structural calls)

**Bet 1: Commit to WCAG 2.1 AA as a release gate, not a backlog item.**
Rules 3, 15, 80, 112 are all ⚠. These are not independent issues — they are symptoms of a single architectural gap: accessibility was designed in piecemeal (the `__uxOn()` flag-gate pattern, the scattered aria-label additions) rather than as a first-class constraint. v11 should declare "WCAG 2.1 AA passes before Wave 1 ships" and run a 2-hour NVDA/JAWS test session against every Wave 1 surface. If it fails, the failure blocks the wave. This is not an accessibility-for-its-own-sake bet — it is a robustness bet: the keyboard paths that WCAG requires are the same paths that make the extension usable during high-pressure moderation when a mod's hand is off the mouse.

**Bet 2: Universal Undo as an infrastructure primitive, not a per-feature add-on.**
Items #9 and #15 above treat undo as feature-specific. The structural call is to implement undo as a middleware layer: every state-mutating call in modtools.js passes through a `withUndo(actionFn, opts)` wrapper that automatically stages the undo record, fires the toast, and registers the keyboard shortcut. This means new features get undo for free. V11 Plan item #19 sketches the server side; Cat 4's call is to define the client-side middleware contract so undo is not re-implemented per feature (and therefore inconsistently).

**Bet 3: The focus-management library is worth writing once.**
Items #5, #10, #13, #17 all require standard ARIA keyboard contracts (focus trap, focus restore, combobox navigation, menu navigation). These are currently implemented ad-hoc per panel. The structural call: extract a 200-line `gamA11y` module with four functions — `trapFocus(el)`, `restoreFocus()`, `buildCombobox(opts)`, `buildMenu(opts)` — that all panels use. This prevents the "forgot to restore focus on close" class of bugs permanently and makes the WCAG 2.1 AA gate achievable without per-feature auditing.

**Bet 4: Popup tab defaults must be auth-state-driven, permanently.**
Items #1, #3, #6 above all follow from the same structural decision: the popup tab default is currently static (always Stats). The bet is to make it a computed property from auth state, with memory of last-used tab for authenticated users. This is a 5-line change that eliminates the entire "fresh mod sees dashes and gives up" failure class and the "lead must click to Lead tab" friction class simultaneously. The cost is near-zero; the payoff is the highest-volume onboarding failure mode closed.

---

## D. RISKS (top 5)

1. **ARIA combobox contract regression.** Items #12 and #17 implement `role="combobox"` with autocomplete. This ARIA pattern has 14 keyboard interaction requirements per ARIA 1.1 spec. If any are missed (e.g., Home/End key behavior within the listbox, `aria-activedescendant` updates), major screen readers (JAWS, NVDA) will misannounce or trap focus. **Mitigation:** Test with actual NVDA before merge; use the established `combobox` pattern from ARIA Authoring Practices Guide directly, not a custom implementation.

2. **`chrome.action.openPopup()` API availability.** Item #3 (auth-fail banner → popup open) relies on `chrome.action.openPopup()` which requires Chrome 127+ and a user gesture. If the banner's button click doesn't count as a qualifying gesture in some Chrome versions, the popup silently fails to open. **Mitigation:** Feature-detect `chrome.action.openPopup` at runtime; if unavailable, fall back to snack: "Open the extension popup and go to the Tokens tab." Test on Chrome 126 and 127.

3. **Focus restoration breaks during fast user interactions.** Item #10 (focus restore after panel close) stores the pre-panel `activeElement`. If the user clicks elsewhere before the panel closes (e.g., clicks a backdrop), the `__focusReturnTarget` may be stale (the element scrolled out of view, or was removed by a DOM update). **Mitigation:** Verify the target element is still in the document before calling `.focus()`; if not, fall back to `document.body`.

4. **Progressive disclosure (item #30) breaks lead-upgrade flow within a session.** If a non-lead mod receives lead privileges during a session (edge case but documented in token rotation), the Lead tab's DOM nodes have been removed and must be re-inserted. The current `__applyLeadGate()` pattern assumes a one-time gate evaluation. **Mitigation:** Add a `chrome.storage.onChanged` listener that re-evaluates lead gate when `gam_settings.isLead` changes; re-insert Lead tab DOM if newly elevated. ~10 lines.

5. **Cognitive load trade-off on SIREN dynamic aria-label.** Item #20 proposes updating the SIREN chip's `aria-label` on each poll cycle ("2 SUS users, 1 new modmail flagged"). If the poll fires every 30s and the mod has keyboard focus on the SIREN chip when the update fires, the SR will re-announce the label mid-task. This is a "false aria-live" situation. **Mitigation:** Only update `aria-label` if the SIREN state _changes_ (not on every poll). Use a diff-check before updating: `if (newLabel !== chip.getAttribute('aria-label')) chip.setAttribute('aria-label', newLabel)`.

---

## E. CTO SYNTHESIS NOTES

**The signal from Cat 4's 30-iteration pass:**

The 150-rules audit reports 120 ✅, but the UAT evidence reveals the audit's blind spot: it tested sighted-mouse flows. The six ⚠ rules in the accessibility cluster (Rules 3, 15, 60, 67, 80, 112) are not independent defects — they are symptoms of a single architectural gap: accessibility was layered on top of a mouse-first design rather than embedded as a constraint. The `__uxOn()` flag-gate pattern (visible in the grep: `if (__uxOn()) { tabindex: '0', role: ... }`) means accessibility attributes are conditionally applied, not structurally guaranteed.

**Top 5 items for Wave 1 that Cat 4 wants to defend:**

1. Item #1 (Tokens tab default on unauth) — 15 lines, closes the #1 onboarding failure mode.
2. Item #3 (auth-fail banner → popup cross-talk) — closes the keyboard recovery dead-end that produces "fresh mod gives up after one mistake."
3. Item #8 (Brave detection + in-product invite fallback) — closes the Brave onboarding gap that the HANDOFF explicitly flagged as the biggest adoption blocker.
4. Item #9 (universal undo policy) — the policy definition must precede Wave 1's toast-undo implementation (V11 Plan #19) or implementations will be inconsistent.
5. Item #4 (merge two "Force re-hydrate" buttons) — the duplicate is causing genuine decision confusion that costs modmail reply time. It is a 20-minute fix that closes a documented UAT_ADVOCATE groan.

**The one thing Cat 4 would kill if scope requires a cut:** Item #29 (cross-tab conflict resolution). It is the only M-effort item where the failure mode is rare (two tabs actioning the same user simultaneously) and the existing behavior (stale Tab B state) is survivable. Cut it for v11.3 if Wave 3 slips.

**The one thing Cat 4 would not cut under any circumstances:** The WCAG 2.1 AA release gate (Bet 1). The right-click menu (V11 Plan #1) — the biggest bet in the entire plan — is the highest accessibility risk in the catalog. If it ships without a keyboard equivalent and ARIA `role="menu"` contract (item #5 above), it creates a net-negative accessibility event: the primary moderation flow (ban, watch, remove) becomes mouse-only for the first time. That is a regression, not a feature.

**Word count:** ~3,970 words.
