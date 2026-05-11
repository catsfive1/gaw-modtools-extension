# UIUX2-02 -- Tokens Tab Redesign
**Agent:** UIUX2-02-TOKENS-TAB
**Surface:** Popup Tokens tab + Lead section (as visible from Tokens)
**Files audited:** `popup.html` L452-801, `popup.css` L264-314 + L815-911 + L1150-1290, `popup.js` `loadToken` (L1373), `saveToken` (L1422), `loadLead` (L1544), `saveTokensSecurely` (L1303), `__claimInviteClick` (L2867), `__applyTierGate` (L1600)
**Prior v1 reference:** `docs/V10_DESIGN/UIUX-07_tokens_card.md`
**Constraint:** Bloomberg amber canonical, 380px popup width, read-only audit

---

## A. Critique -- Current State v10.12.3

### A.1 Structural chaos: three concerns, zero hierarchy

The Tokens tab contains three distinct interaction concerns flattened into one undifferentiated vertical stack with no visual boundary between them:

1. **Team Mod Token raw field** -- `<input type="password">` + Save + Rotate + "I have a rotation invite" (`popup.html` L462-476)
2. **First-run onboarding wizard** -- `#firstRunWizard`, `display:none`, injected below the raw field (`popup.html` L482-514)
3. **Claim invite button** -- `#claimInviteWrap`, structurally OUTSIDE `#card-tokens`, rendered between Lead card close tag and the card-body close tag (`popup.html` L789-792)

The claim button is the primary first-run action for every new mod. It lives outside the token card. That is the worst possible structural placement for the most important first-run affordance.

### A.2 Lead section is wrong for non-leads

`#leadSection` (`popup.html` L528-775) renders a `<input type="password" placeholder="lead-mod token">` input INSIDE the Lead tab panel. The Lead tab itself is hidden for non-leads via `__applyTierVisibility` (`popup.js` L1652-1658: `leadTab.style.display = (tier === 'lead') ? '' : 'none'`). So the field itself is not exposed to non-leads post-auth. BUT:

- The Lead tab tab-button is hidden only AFTER `__applyTierGate()` fires (async, on popup open)
- During the ~200ms before whoami resolves, every mod sees the Lead tab
- The `leadStatus` element shows "lead-mod only feature" -- visible to every non-lead who opens the popup before async resolves

This is a flash-of-wrong-content defect compounded by confusing copy. The fix must be structural (hidden by default, shown only on whoami confirm), not just async-gated.

### A.3 Click-cost audit: first-run mod (hardening ON, current v10.12.3)

| Goal | Current path | Clicks |
|---|---|---|
| Claim invite from GAW URL | Tab -> "Tokens" -> scroll past Team Mod Token -> find "Claim invite" (outside card) -> click | 3+ |
| Choose manual path (code) | Wizard shown if no token -> pick "I have invite CODE" -> step 2 -> paste code -> enter username -> "Save & verify" | 5 |
| Know which field to use | Read two password fields of equal visual weight; copy says "lead-mod only feature" | Confusion, not clicks |
| Know they are authenticated | Wizard success screen -> "Done -- collapse this card" (small button, inline) | 1 after success |
| See where they stand post-auth | Scroll to `#tokenStatus` (10px, grey, reads "stored") | 1 scroll |

**First-run total: 5-7 actions, 1+ confusion events.**

### A.4 Error/success affordances fail at 380px

`pop-token-status` is `font-size: 10px` (`popup.css` L293-299). `.ok { color: var(--bb-green) }` and `.err { color: var(--bb-red) }` (`popup.css` L907-910) change color only. No border, no icon, no height change. At 380px popup width these status lines are:

- Below the fold of the input row
- 10px monospace -- hard to scan in peripheral vision
- No visual boundary distinguishing "error I must act on" from "status I can ignore"

The v10.11.0 encryption change (REDTEAM-1, `popup.js` L1322-1332) means tokens are now stored encrypted by the SW. This is invisible to the mod. There is no "encrypted" indicator anywhere in the Tokens UI. Mods with token age warnings see a proactive notice (`popup.js` L643-670: 75d notice, 90d hard cutoff), but the token age is not surfaced in the verified state banner -- only in the Maintenance tab probe.

### A.5 Encryption + expiration metadata: currently invisible

- v10.11.0: tokens encrypted in SW, popup never writes plaintext (`popup.js` L1322-1327)
- Token age tracked via `gam_settings.tokenIssuedAt` / `gam_settings.rotated_at` (`popup.js` L649, L4593)
- Age thresholds: <60d = ok (green), 60-90d = warn (yellow), >90d = err (red) (`popup.js` L4600-4601)
- These thresholds exist in `maintTokenProbe()` (`popup.js` L4577) but are ONLY surfaced in the Maintenance/Probes card -- never in the Tokens tab itself
- Inactivity lock: no evidence of inactivity lock UI anywhere in popup.html or popup.js (the v10.11.0 feature may be backend-only; no frontend surface detected in the dist build)

**Assessment:** The encryption status and token age are load-bearing health signals that the mod should see at-a-glance in the Tokens tab. Currently they are hidden behind a Maintenance probe that most mods never run.

### A.6 State machine is implicit

`loadToken()` + `__applyTierGate()` together determine auth state, but the UI renders everything and hides/shows via JS after async resolution. The result is flicker: password inputs appear, then vanish; status lines flip; the card auto-collapses (`_cardAutoCollapseTokens` at `popup.js` L155). There is no explicit state machine -- state is implied by which elements happen to be visible after all the async callbacks complete.

### A.7 First-run wizard vs. raw token field: structural conflict

The first-run wizard (`#firstRunWizard`) is shown when `!hasTeamToken` (via `popup.js` L3041-3050). The raw token input (`#tokenInput`) is ALWAYS rendered, below the wizard. A fresh mod sees:

1. Team Mod Token label + empty input + Save button
2. First-run wizard (amber border, "Welcome" headline)
3. Rotate button + "I have a rotation invite" button
4. Claim invite button (OUTSIDE the card)

The wizard and the raw field are parallel paths to the same outcome rendered simultaneously. They do not replace each other -- they stack. A confused mod might try the raw field AND the wizard AND the claim button in sequence before getting through.

---

## B. Redesign -- Three-State Architecture

The Tokens tab renders exactly one of three exclusive states. State is determined by the result of `__applyTierGate()` (whoami RPC). All three states are pre-rendered in HTML with `display:none`; JS swaps visibility via a single `__tokSetState(state)` call after whoami resolves. No more flicker, no more implicit stacking.

```
STATE A -- FIRST-RUN
  Trigger: !hasTeamToken OR whoami fails
  Primary: full-width amber CTA "Claim my invite"
  Secondary: three path buttons (link / code / raw token)
  Wizard step 2: inline replace (no separate element)
  Hidden: raw tokenInput field, Lead section entirely

STATE B -- RETURNING MOD
  Trigger: hasTeamToken + whoami ok + tier === 'mod'
  Primary: verified-status banner (green, username, age, encryption badge)
  Secondary: "Token management" disclosure (rotate / re-enter, collapsed)
  Hidden: first-run content, Lead section entirely

STATE C -- RETURNING LEAD
  Trigger: hasTeamToken + whoami ok + tier === 'lead' or 'senior_lead'
  Same as State B PLUS:
  Lead block: amber dashed separator + lead input + lead tools
  (Lead tab nav remains hidden for non-leads; Lead block appears in Tokens tab only for leads)
```

State transitions:
- A -> B: on successful `authClaimInvite` RPC or `saveToken` + whoami ok
- B -> A: on whoami 401 / token age >90d / explicit "Re-enter" click
- B -> C: on whoami returning tier === 'lead' or 'senior_lead'
- C -> B: on lead token cleared (no whoami change for team token)

---

## C. Lead vs. Mod Surface Separation

**Rule (hardens v9.3.16 fix):** The Lead token input is never rendered in State A or State B. It appears only in State C, structurally separated from the mod token block.

Current failure: `#leadSection` is inside `#tab-panel-lead` which is hidden for non-leads -- but only after `__applyTierVisibility` fires. The Lead tab button is visible for ~200ms on every popup open for every mod. The new design moves lead token input into Tokens tab State C (not a separate tab section), eliminating the flash.

Visual separation signals (extending existing CSS convention):
- Mod block: blue accent `#4A9EFF` (existing `--bb-cyan`/brand)
- Lead block: amber `#f0a040` (`--bb-amber`), dashed top border, `[LEAD]` tag
- Encryption badge: inline `ENC` chip in the verified banner (State B/C), grey when present, not surfaced if unknown

Token age in verified banner:
- <60d: no age display (green default)
- 60-89d: amber "age 72d -- rotate soon" inline in secondary line
- >=90d: red "EXPIRED -- rotate now" with rotate button injected inline

This surfaces the `maintTokenProbe` thresholds (`popup.js` L4596-4601) at the primary auth-confirmed surface, not only in a buried maintenance probe.

---

## D. Visual Mockups (ASCII, 380px / ~50 char width)

### State A -- First-Run (no token stored)

```
+--[ TOKENS ]------------------------------------------+
|                                                      |
|  +==================================================+  |
|  | NEW MOD SETUP                              v     |  |
|  |                                                  |  |
|  | Your lead sent you an invite to get started.     |  |
|  |                                                  |  |
|  | [========= CLAIM MY INVITE ==================]  |  |
|  |   (detects invite staged from GAW link)          |  |
|  |                                                  |  |
|  | ---- or pick a path -------------------------    |  |
|  | [ Invite link ]  [ Invite code ]  [ Raw token ]  |  |
|  +==================================================+  |
|                                                      |
|  Re-enter credentials                   [micro-link] |
+------------------------------------------------------+
```

Step 2 replaces the path buttons inline:

```
|  +==================================================+  |
|  | [<- Back]                                        |  |
|  | Paste your invite code:                          |  |
|  | [_______________________________________________]|  |
|  | Your GAW username:                               |  |
|  | [_______________________________________________]|  |
|  | [========= SAVE & VERIFY ====================]  |  |
|  | status line...                                   |  |
|  +==================================================+  |
```

Success screen replaces everything:

```
|  +==================================================+  |
|  | [OK] AUTHENTICATED                               |  |
|  |   u/catsfive  --  MOD tier                      |  |
|  |   Token stored encrypted.                        |  |
|  |   Refresh greatawakening.win to activate.        |  |
|  |                                                  |  |
|  | [============ DONE -- start moderating ========] |  |
|  +==================================================+  |
```

### State B -- Returning Mod (tier = mod)

```
+--[ TOKENS ] catsfive MOD [OK]-----------------------+
|                                                      |
|  +--------------------------------------------------+|
|  | [OK]  Token active                               ||
|  |       u/catsfive  *  mod tier                    ||
|  |       verified 2s ago  *  ENC                    ||
|  +--------------------------------------------------+|
|                                                      |
|  v Token management (rotate, re-enter)  [collapsed] |
+------------------------------------------------------+
```

State B with age warning (>60d):

```
|  +--[amber border]----------------------------------+|
|  | [!]  Token active -- age 72d, rotate soon        ||
|  |       u/catsfive  *  mod tier                    ||
|  |       verified 2s ago  *  ENC  *  [Rotate now]   ||
|  +--[amber border]----------------------------------+|
```

State B with expired token (>90d):

```
|  +--[red border]------------------------------------+|
|  | [X]  TOKEN EXPIRED -- rotate required            ||
|  |       u/catsfive  *  mod tier  *  age 94d        ||
|  |       [====== ROTATE MY TOKEN NOW ============]  ||
|  +--[red border]------------------------------------+|
```

### State C -- Returning Lead (tier = lead)

```
+--[ TOKENS ] catsfive LEAD [OK]----------------------+
|                                                      |
|  [same verified banner as State B]                  |
|                                                      |
|  v Token management                   [collapsed]  |
|                                                      |
|  .....................................................|
|  [F] LEAD  [LEAD]                                   |
|  Lead token enables roster, invites, HUD            |
|  [_________________________________] [Save]         |
|  status: stored  [OK]                               |
|                                                      |
|  v Lead tools (invites, roster, deep-dive)          |
+------------------------------------------------------+
```

---

## E. CSS Specification

Add all new classes to `popup.css` after the existing `/* ── Token section ──` block (after L314). Use existing CSS variable names; introduce only the minimum new ones.

### E.1 New CSS variables (add to `:root` or Bloomberg token block)

```css
/* Tokens card state palette */
--tok-banner-ok-bg:      rgba(61, 214, 140, 0.07);
--tok-banner-ok-border:  rgba(61, 214, 140, 0.30);
--tok-banner-ok-rail:    #3dd68c;
--tok-banner-warn-bg:    rgba(240, 163, 64, 0.08);
--tok-banner-warn-border:rgba(240, 163, 64, 0.35);
--tok-banner-warn-rail:  #f0a040;
--tok-banner-err-bg:     rgba(240, 64, 64, 0.08);
--tok-banner-err-border: rgba(240, 64, 64, 0.35);
--tok-banner-err-rail:   #f04040;
--tok-onboard-bg:        rgba(255, 153, 51, 0.05);
--tok-onboard-border:    #ff9933;
--tok-enc-chip-bg:       rgba(100, 116, 139, 0.15);
--tok-enc-chip-border:   rgba(100, 116, 139, 0.35);
--tok-enc-chip-text:     #64748b;
```

### E.2 Onboarding frame (State A)

```css
/* State A: onboarding container */
.tok-onboard {
  background: var(--tok-onboard-bg);
  border: 2px solid var(--tok-onboard-border);
  border-radius: 5px;
  padding: 14px 14px 12px;
  margin: 8px 10px;
  font-family: ui-monospace, 'JetBrains Mono', Consolas, monospace;
}

.tok-onboard-headline {
  font-size: 11px;
  font-weight: 700;
  color: #ff9933;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 6px;
}

.tok-onboard-body {
  font-size: 11px;
  color: #c8c4be;
  line-height: 1.5;
  margin-bottom: 12px;
}

/* Primary CTA: full-width, tall, filled amber -- the one obvious button */
.tok-cta-primary {
  display: block;
  width: 100%;
  padding: 11px 14px;
  background: #ff9933;
  border: 2px solid #ff9933;
  border-radius: 4px;
  color: #0a0a0b;
  font: 700 12px/1 ui-monospace, 'JetBrains Mono', monospace;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: center;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s, transform 0.08s;
  margin-bottom: 10px;
}
.tok-cta-primary:hover   { background: #ffa844; border-color: #ffa844; }
.tok-cta-primary:active  { transform: translateY(1px); }
.tok-cta-primary:disabled {
  background: #3d3a35;
  border-color: #3d3a35;
  color: #5a5752;
  cursor: not-allowed;
}

/* Path divider */
.tok-path-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  font-size: 10px;
  color: #5a5752;
  letter-spacing: 0.04em;
}
.tok-path-divider::before,
.tok-path-divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid #2a2726;
}

/* Secondary path buttons: equal weight, ghost, 3-up row */
.tok-path-row {
  display: flex;
  gap: 5px;
}
.tok-path-btn {
  flex: 1 1 0;
  padding: 7px 6px;
  background: transparent;
  border: 1px solid #3d3a35;
  border-radius: 4px;
  color: #8b8580;
  font: 600 10px/1 ui-monospace, 'JetBrains Mono', monospace;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.1s, color 0.1s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tok-path-btn:hover {
  border-color: #ff9933;
  color: #e8e6e1;
}
```

### E.3 Verified-status banner (States B and C)

```css
/* Verified banner container */
.tok-banner {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  border-left: 3px solid transparent;
  border-radius: 4px;
  padding: 8px 10px;
  margin: 8px 10px;
  transition: border-color 0.2s, background 0.2s;
}
.tok-banner.ok {
  background: var(--tok-banner-ok-bg);
  border-color: var(--tok-banner-ok-rail);
  outline: 1px solid var(--tok-banner-ok-border);
}
.tok-banner.warn {
  background: var(--tok-banner-warn-bg);
  border-color: var(--tok-banner-warn-rail);
  outline: 1px solid var(--tok-banner-warn-border);
}
.tok-banner.err {
  background: var(--tok-banner-err-bg);
  border-color: var(--tok-banner-err-rail);
  outline: 1px solid var(--tok-banner-err-border);
}

.tok-banner-icon {
  font-size: 15px;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 1px;
}
.tok-banner.ok   .tok-banner-icon { color: var(--tok-banner-ok-rail); }
.tok-banner.warn .tok-banner-icon { color: var(--tok-banner-warn-rail); }
.tok-banner.err  .tok-banner-icon { color: var(--tok-banner-err-rail); }

.tok-banner-body { flex: 1; min-width: 0; }

.tok-banner-primary {
  font: 600 12px/1.3 ui-monospace, 'JetBrains Mono', monospace;
  letter-spacing: 0.02em;
}
.tok-banner.ok   .tok-banner-primary { color: var(--tok-banner-ok-rail); }
.tok-banner.warn .tok-banner-primary { color: var(--tok-banner-warn-rail); }
.tok-banner.err  .tok-banner-primary { color: var(--tok-banner-err-rail); }

.tok-banner-secondary {
  font-size: 10px;
  color: #7a8290;
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* ENC chip: encryption status indicator */
.tok-enc-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: var(--tok-enc-chip-bg);
  border: 1px solid var(--tok-enc-chip-border);
  border-radius: 3px;
  padding: 1px 5px;
  font: 600 9px/1 ui-monospace, 'JetBrains Mono', monospace;
  color: var(--tok-enc-chip-text);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* Age warning inline in banner secondary line */
.tok-age-warn {
  color: var(--tok-banner-warn-rail);
  font-weight: 600;
}
.tok-age-err {
  color: var(--tok-banner-err-rail);
  font-weight: 700;
  text-transform: uppercase;
}

/* Inline rotate CTA inside banner (err state only) */
.tok-banner-rotate-btn {
  display: inline-block;
  padding: 2px 8px;
  background: transparent;
  border: 1px solid var(--tok-banner-err-rail);
  border-radius: 3px;
  color: var(--tok-banner-err-rail);
  font: 700 10px/1 ui-monospace, monospace;
  letter-spacing: 0.06em;
  cursor: pointer;
  text-transform: uppercase;
}
.tok-banner-rotate-btn:hover { background: rgba(240,64,64,0.1); }
```

### E.4 Token management accordion (State B/C -- collapsed by default)

```css
/* Token management disclosure (inside State B/C) */
.tok-mgmt-details {
  margin: 0 10px 8px;
}
.tok-mgmt-details summary {
  font-size: 10px;
  color: #5c6370;
  cursor: pointer;
  padding: 4px 0;
  letter-spacing: 0.04em;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 5px;
}
.tok-mgmt-details summary::before {
  content: 'v';
  display: inline-block;
  font-size: 9px;
  transition: transform 0.15s;
}
.tok-mgmt-details[open] summary::before { transform: rotate(180deg); }
.tok-mgmt-details summary::-webkit-details-marker { display: none; }
.tok-mgmt-details .tok-mgmt-body {
  padding: 8px 0 0;
  border-top: 1px solid #1e2228;
  margin-top: 4px;
}
```

### E.5 Lead section separator (State C)

```css
/* Lead separator: dashed amber rule, visible only in State C */
.tok-lead-sep {
  border: none;
  border-top: 1px dashed rgba(240, 160, 64, 0.35);
  margin: 10px 10px 8px;
}
.tok-lead-header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px 4px;
}
.tok-lead-header-label {
  font: 700 11px/1 ui-monospace, 'JetBrains Mono', monospace;
  color: #f0a040;
  letter-spacing: 0.06em;
}
.tok-lead-tag {
  font: 700 9px/1 ui-monospace, monospace;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  background: rgba(240, 160, 64, 0.10);
  border: 1px solid rgba(240, 160, 64, 0.30);
  border-radius: 3px;
  padding: 1px 5px;
  color: #f0a040;
}
```

### E.6 Enhanced error block (replaces `.pop-token-status.err` for action-required errors)

```css
/* Promoted error block: border + icon + action copy.
   Use for errors that require user action (claim failed, whoami 401, etc.)
   vs. .pop-token-status.err for transient status lines */
.tok-error-block {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: var(--tok-banner-err-bg);
  border: 1px solid var(--tok-banner-err-border);
  border-left: 3px solid var(--tok-banner-err-rail);
  border-radius: 4px;
  padding: 8px 10px;
  margin: 4px 10px;
  font-size: 11px;
  color: #e86060;
  line-height: 1.4;
}
.tok-error-block-icon {
  flex-shrink: 0;
  font-size: 13px;
  margin-top: 1px;
}
.tok-error-block-body {
  flex: 1;
  min-width: 0;
}
.tok-error-hint {
  font-size: 10px;
  color: #8b929e;
  margin-top: 3px;
}
```

---

## F. HTML Structure

The HTML below is the complete replacement for `popup.html` L453-801 (the `#tab-panel-tokens` section plus the orphaned `#claimInviteWrap`). All existing element IDs that JS wires are preserved. New wrapper IDs are added. `#claimInviteWrap` is absorbed into `#tokStateFirstRun`.

```html
<!-- M4.3 REDTEAM-3: tokens tab panel wrapper -->
<div id="tab-panel-tokens" role="tabpanel" aria-labelledby="tab-btn-tokens">
<div class="gam-card" id="card-tokens" data-tab="tokens">
  <div class="gam-card-header">
    <span class="gam-card-title">&#x1F511; Tokens</span>
    <!-- Auth pill injected by __tokSetState() after whoami -->
    <span id="tokAuthPill" class="gam-card-badge" style="display:none"></span>
  </div>
  <div class="gam-card-body" style="padding:0">

    <!-- =====================================================
         STATE A: first-run (no token, or whoami failed)
         Shown by default until __tokSetState() fires.
         ===================================================== -->
    <div id="tokStateFirstRun" class="tok-onboard">
      <div class="tok-onboard-headline">New mod setup</div>
      <div class="tok-onboard-body">
        Your lead sent you an invite. Pick your path below.
      </div>

      <!-- PRIMARY CTA: claim from staged URL (most common path) -->
      <button id="claimInviteBtn" class="tok-cta-primary">
        &#x1F4E8; Claim my invite
      </button>
      <div id="claimInviteStatus" class="pop-token-status" style="margin:0 0 8px"></div>

      <!-- SECONDARY: manual path selection -->
      <div class="tok-path-divider">or choose a path</div>
      <div class="tok-path-row">
        <button id="firstRunPathLink"  class="tok-path-btn">&#x1F4E8; Link</button>
        <button id="firstRunPathCode"  class="tok-path-btn">&#x1F522; Code</button>
        <button id="firstRunPathToken" class="tok-path-btn">&#x1F511; Raw token</button>
      </div>

      <!-- WIZARD STEP 2: replaces path row on path selection -->
      <div id="firstRunWizardStep2" style="display:none; margin-top:12px">
        <div style="color:#ff9933;font-weight:700;font-size:11px;text-transform:uppercase;
                    letter-spacing:0.08em;margin-bottom:6px">
          Step 2 of 2
        </div>
        <div id="firstRunStep2Prompt" style="color:#c8c4be;font-size:11px;
                                             margin-bottom:8px;line-height:1.5"></div>
        <input id="firstRunInput" type="password" placeholder="paste here"
          style="width:100%;background:#060709;border:1px solid #3d3a35;color:#e8e6e1;
                 padding:8px 10px;font:11px ui-monospace,'JetBrains Mono',monospace;
                 border-radius:4px;margin-bottom:8px;box-sizing:border-box">
        <div id="firstRunUsernameWrap" style="display:none;margin-bottom:8px">
          <label for="firstRunUsername"
            style="font-size:10px;color:#9b9892;text-transform:uppercase;
                   letter-spacing:0.06em;display:block;margin-bottom:4px">
            Your GAW username
          </label>
          <input id="firstRunUsername" type="text" placeholder="e.g. catsfive"
            style="width:100%;background:#060709;border:1px solid #3d3a35;color:#e8e6e1;
                   padding:8px 10px;font:11px ui-monospace,'JetBrains Mono',monospace;
                   border-radius:4px;box-sizing:border-box">
        </div>
        <div style="display:flex;gap:6px">
          <button id="firstRunBack" class="pop-btn pop-btn-ghost"
                  style="flex:0 0 auto">&#x2190; Back</button>
          <button id="firstRunGo"   class="tok-cta-primary"
                  style="flex:1;margin-bottom:0">Save &amp; verify</button>
        </div>
        <div id="firstRunStatus"
             style="margin-top:8px;font-size:10px;color:#9b9892;line-height:1.4"></div>
      </div>

      <!-- SUCCESS STATE: replaces everything on successful auth -->
      <div id="firstRunWizardSuccess" style="display:none">
        <div class="tok-banner ok" style="margin:0 0 10px">
          <span class="tok-banner-icon">&#x2713;</span>
          <div class="tok-banner-body">
            <div class="tok-banner-primary" id="firstRunSuccessName">Authenticated</div>
            <div class="tok-banner-secondary">
              Token stored encrypted.
              Refresh greatawakening.win to activate the status bar.
            </div>
          </div>
        </div>
        <button id="firstRunDone" class="tok-cta-primary" style="margin-bottom:0">
          Done &#x2014; start moderating
        </button>
      </div>
    </div><!-- /#tokStateFirstRun / .tok-onboard -->

    <!-- =====================================================
         STATE B/C: returning mod (authenticated)
         Hidden until __tokSetState('returning') fires.
         ===================================================== -->
    <div id="tokStateReturning" style="display:none">

      <!-- Verified-status banner (green/amber/red based on token age) -->
      <div class="tok-banner ok" id="tokVerifiedBanner">
        <span class="tok-banner-icon" id="tokBannerIcon">&#x2713;</span>
        <div class="tok-banner-body">
          <div class="tok-banner-primary" id="tokBannerPrimary">Token active</div>
          <div class="tok-banner-secondary" id="tokBannerSecondary">
            <!-- JS injects: username * tier * verified Xs ago * ENC chip * age warning -->
          </div>
        </div>
      </div>

      <!-- Token management accordion (collapsed post-auth) -->
      <details class="tok-mgmt-details" id="tokManagementDetails">
        <summary>Token management (rotate, re-enter)</summary>
        <div class="tok-mgmt-body">
          <!-- Raw token re-entry -->
          <div class="pop-token" style="border-top:none;padding:0 2px">
            <label for="tokenInput">Team Mod Token</label>
            <div class="pop-token-hint">Paste to replace stored token.</div>
            <input id="tokenInput" type="password"
                   placeholder="paste replacement token">
            <button id="tokenSave" class="pop-btn pop-btn-ghost">Save</button>
            <div id="tokenStatus" class="pop-token-status"></div>
          </div>
          <!-- Rotate / claim rotation invite -->
          <div class="pop-tools" style="margin-top:6px">
            <button id="rotateBtn"      class="pop-btn pop-btn-ghost">
              &#x1F504; Rotate my token (lead loses access)
            </button>
            <button id="claimRotateBtn" class="pop-btn pop-btn-ghost">
              &#x1F4E5; I have a rotation invite
            </button>
          </div>
          <div id="rotateStatus" class="pop-token-status"></div>
        </div>
      </details>

      <!-- =====================================================
           STATE C ADDITION: Lead section (tier = lead/sr-lead)
           Inserted below token management, hidden for non-leads.
           ===================================================== -->
      <div id="leadSection" style="display:none">
        <hr class="tok-lead-sep">
        <div class="tok-lead-header">
          <span class="tok-lead-header-label">&#x1F451; Lead token</span>
          <span class="tok-lead-tag">LEAD</span>
        </div>
        <div class="pop-token" style="border-top:none;padding:4px 10px 8px">
          <div class="pop-token-hint" style="grid-column:1/-1;color:#f0a040">
            Enables rotation roster, invite generation, and HUD.
          </div>
          <input id="leadInput" type="password"
                 placeholder="lead-mod token">
          <button id="leadSave" class="pop-btn pop-btn-ghost">Save</button>
          <div id="leadStatus" class="pop-token-status"></div>
        </div>

        <!-- Lead-only tools (gated by __applyLeadGate, unchanged) -->
        <div id="leadOnlyTools" style="display:none">
          <div id="srLeadEmptyHint"
               style="display:none;color:var(--bb-ink-faint);font-size:10.5px;
                      padding:6px 10px;border-bottom:1px solid var(--bb-line);
                      margin-bottom:6px">
            Loading elevated tools&hellip;
          </div>
          <!-- KPI row, quick actions, lapsed chip, deep-dive accordion:
               all preserved unchanged from current #leadOnlyTools -->
          <!-- [LEAD KPI / QA / LAPSED / DEEPDIVE CONTENT -- UNCHANGED] -->
        </div><!-- /#leadOnlyTools -->
      </div><!-- /#leadSection -->

    </div><!-- /#tokStateReturning -->

    <!-- Re-enter credentials: always rendered, low prominence -->
    <div style="padding:2px 10px 8px;text-align:right">
      <button id="restartSetupBtn" class="pop-link"
              style="font-size:10px;color:#5a5752">
        Re-enter credentials
      </button>
    </div>

  </div><!-- /.gam-card-body -->
</div><!-- /#card-tokens -->
</div><!-- /#tab-panel-tokens -->
```

Key structural changes vs. current HTML:
- `#claimInviteWrap` eliminated as standalone orphan; `#claimInviteBtn` now lives inside `#tokStateFirstRun` as primary CTA (preserves ID, JS wire unchanged)
- `#firstRunWizardStep1` (the "step 1 of 2" wrapper) eliminated; path selection buttons are always visible in State A (no step 1 / step 2 toggle needed)
- `#firstRunWizard` becomes `#tokStateFirstRun`; all child IDs (`firstRunPathLink`, `firstRunPathCode`, `firstRunPathToken`, `firstRunBack`, `firstRunGo`, `firstRunDone`, `firstRunStatus`, `firstRunWizardSuccess`, `firstRunWizardStep2`) preserved
- `#tokenInput` / `#tokenSave` / `#tokenStatus` / `#rotateBtn` / `#claimRotateBtn` / `#rotateStatus` all preserved inside `#tokManagementDetails`
- `#leadSection` structure preserved; moved inside `#tokStateReturning` so it renders in the Tokens tab (not separately in the Lead tab, which is removed for non-leads)

---

## G. JavaScript Changes

### G.1 `__tokSetState(state)` -- new state switcher

Add below `_cardWizardComplete` (~`popup.js` L175). This is the single point of truth for tab render state.

```js
// Explicit state machine for the Tokens tab.
// state: 'first-run' | 'returning' | 'expired'
// All states are pre-rendered in HTML; this just swaps visibility.
function __tokSetState(state, opts) {
  const firstRun  = $('tokStateFirstRun');
  const returning = $('tokStateReturning');
  if (firstRun)  firstRun.style.display  = (state === 'first-run')  ? '' : 'none';
  if (returning) returning.style.display = (state !== 'first-run')  ? '' : 'none';
  if (state === 'returning' || state === 'expired') {
    __tokUpdateBanner(opts || {});
  }
}

// Populate the verified-status banner with live data.
// opts: { username, tier, verifiedAgo, ageDays, encrypted }
function __tokUpdateBanner(opts) {
  const banner   = $('tokVerifiedBanner');
  const icon     = $('tokBannerIcon');
  const primary  = $('tokBannerPrimary');
  const secondary = $('tokBannerSecondary');
  if (!banner) return;

  const ageDays = opts.ageDays != null ? Number(opts.ageDays) : -1;
  let severity = 'ok';
  if (ageDays >= 90)      severity = 'err';
  else if (ageDays >= 60) severity = 'warn';

  // Apply severity class
  banner.className = 'tok-banner ' + severity;
  icon.textContent = severity === 'ok' ? '✓' : severity === 'warn' ? '⚠' : '✗';

  // Primary line
  if (severity === 'err') {
    primary.textContent = 'TOKEN EXPIRED -- rotate required';
  } else {
    primary.textContent = 'Token active';
  }

  // Secondary line: username * tier * verified Xs ago * ENC chip * age
  const parts = [];
  if (opts.username) parts.push('u/' + opts.username);
  if (opts.tier)     parts.push(opts.tier.replace('_', '-') + ' tier');
  if (opts.verifiedAgo != null) parts.push('verified ' + opts.verifiedAgo + 's ago');
  secondary.innerHTML = '';
  parts.forEach(function(p, i) {
    if (i > 0) secondary.appendChild(document.createTextNode(' · '));
    secondary.appendChild(document.createTextNode(p));
  });

  // ENC chip (always shown -- encryption is always-on since v10.11)
  const encChip = document.createElement('span');
  encChip.className = 'tok-enc-chip';
  encChip.title = 'Token stored encrypted (v10.11+)';
  encChip.textContent = 'ENC';
  secondary.appendChild(document.createTextNode(' · '));
  secondary.appendChild(encChip);

  // Age indicator
  if (ageDays >= 90) {
    const ageEl = document.createElement('span');
    ageEl.className = 'tok-age-err';
    ageEl.textContent = 'age ' + ageDays + 'd';
    secondary.appendChild(document.createTextNode(' · '));
    secondary.appendChild(ageEl);
    // Inline rotate button
    const rotateEl = document.createElement('button');
    rotateEl.className = 'tok-banner-rotate-btn';
    rotateEl.textContent = 'Rotate now';
    rotateEl.addEventListener('click', function() {
      const mgmt = $('tokManagementDetails');
      if (mgmt) mgmt.setAttribute('open', '');
      const rotBtn = $('rotateBtn');
      if (rotBtn) rotBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    secondary.appendChild(document.createTextNode(' '));
    secondary.appendChild(rotateEl);
  } else if (ageDays >= 60) {
    const ageEl = document.createElement('span');
    ageEl.className = 'tok-age-warn';
    ageEl.textContent = 'age ' + ageDays + 'd -- rotate soon';
    secondary.appendChild(document.createTextNode(' · '));
    secondary.appendChild(ageEl);
  }
}
```

### G.2 Modify `__applyTierGate()` -- call `__tokSetState` on whoami result

In `__applyTierGate` (`popup.js` L1600), after the whoami RPC resolves successfully, replace `await _cardAutoCollapseTokens(true)` with:

```js
// Compute token age from gam_settings.rotated_at
let _ageDays = -1;
try {
  const _st = await chrome.storage.local.get('gam_settings');
  const _ra = _st && _st.gam_settings && _st.gam_settings.rotated_at;
  if (_ra) _ageDays = Math.floor((Date.now() - new Date(_ra).getTime()) / 86400000);
} catch(_) {}

const _verifiedAt = Date.now(); // epoch ms of this whoami call

__tokSetState('returning', {
  username:    _gamWhoamiUsername,
  tier:        _gamTier,
  verifiedAgo: 0,
  ageDays:     _ageDays,
  encrypted:   true   // always true since v10.11
});

// Show lead section only for lead / senior_lead
const _leadSec = $('leadSection');
if (_leadSec) _leadSec.style.display = (_gamTier === 'lead' || _gamTier === 'senior_lead') ? '' : 'none';

// Remove _cardAutoCollapseTokens call -- State B does its own layout
// await _cardAutoCollapseTokens(true);   <-- DELETE THIS LINE
```

On whoami failure, replace `_cardAuthFailed()` with:

```js
__tokSetState('first-run');
_cardAuthFailed();  // keep card-urgent styling
```

### G.3 Modify `loadToken()` -- call `__tokSetState` on no-token branch

In `loadToken()` (`popup.js` L1373), in the `!status.hasTeamToken` branch (L1386-1391), replace:

```js
statusEl.textContent = '...';
_cardAuthFailed();
```

with:

```js
__tokSetState('first-run');
_cardAuthFailed();
```

### G.4 `__claimInviteClick` -- no logic change needed

The click handler (`popup.js` L2867) is wired to `#claimInviteBtn` by ID. Since we preserve that ID in the new HTML (just moved into `#tokStateFirstRun`), the wire at L2992-2995 continues to work without modification.

Post-claim success: `loadToken()` + `loadLead()` are already called (`popup.js` L2970-2971), which will trigger `__applyTierGate()` -> `__tokSetState('returning')` transition. No additional JS needed.

### G.5 Preserve first-run wizard wiring

All `$('firstRunPathLink')`, `$('firstRunPathCode')`, `$('firstRunPathToken')`, `$('firstRunBack')`, `$('firstRunGo')`, `$('firstRunDone')` event listeners already exist in the popup.js wizard block (~L3031-3220). Verify IDs match new HTML -- they do. The only change: `#firstRunWizardStep1` no longer exists; the path button row in `#tokStateFirstRun` replaces it. Any JS that hides/shows `#firstRunWizardStep1` by ID must be replaced with equivalent no-op or show of the path row.

Search popup.js for `firstRunWizardStep1` to enumerate all references before shipping.

---

## H. Effort Estimate and Conflicts

### H.1 Effort

| Task | Owner | Est |
|---|---|---|
| Add CSS variables + new classes to `popup.css` | CSS | 0.5h |
| Replace `#tab-panel-tokens` HTML (F section) | HTML | 1.5h |
| Implement `__tokSetState` + `__tokUpdateBanner` in `popup.js` | JS | 1.0h |
| Patch `__applyTierGate` to call `__tokSetState` | JS | 0.5h |
| Patch `loadToken` first-run branch | JS | 0.25h |
| Audit + remove/replace `firstRunWizardStep1` references | JS | 0.5h |
| Verify `#claimInviteWrap` orphan is fully gone (search popup.js for all references) | JS | 0.25h |
| QA: State A (claim link, claim code, raw token paste, wizard step 2) | QA | 0.75h |
| QA: State B (returning mod, age ok, age warn, age err, management accordion) | QA | 0.5h |
| QA: State C (returning lead, lead token save, lead tools gate) | QA | 0.5h |
| QA: transition A->B, B->A regression (whoami 401), C->B (lead token cleared) | QA | 0.5h |
| **Total** | | **~6.75h** |

### H.2 Conflict flags

**CONFLICT 1 -- `_cardAutoCollapseTokens` call site removal**
`_cardAutoCollapseTokens(true)` at `popup.js` L1622 auto-collapses the `<details id="card-tokens">` element on auth success. In the new design the card is always open in Tokens tab (it is not a `<details>` collapsible in the new design spec -- the card body shows State A or State B, both visible). If `card-tokens` retains its `<details>` wrapper, the collapse will hide the verified banner. Decision: either remove the `<details>` wrapper from `#card-tokens` (aligning with the UIUX-01 `<details> -> <div>` migration that already happened for other cards), OR preserve `<details>` but do NOT call `_cardAutoCollapseTokens` on auth success. Recommend the latter (safer, smaller diff).

**CONFLICT 2 -- `#firstRunWizardStep1` references**
The current wizard JS shows `#firstRunWizardStep1` and hides it on path selection. The new HTML does not have a `#firstRunWizardStep1` element -- the path buttons are always visible inside `#tokStateFirstRun`. Any `$('firstRunWizardStep1').style.display` call will silently no-op (null reference) but should be removed for cleanliness. Grep popup.js for this ID before shipping.

**CONFLICT 3 -- `#leadSection` location change**
`#leadSection` currently lives inside `#tab-panel-lead`. The new design moves it inside `#tokStateReturning` (inside `#tab-panel-tokens`). The Lead tab then becomes either:
- (a) An empty tab containing only the lead-only tools deep-dive (KPI, roster, etc.) -- the lead token input is now in Tokens tab
- (b) The Lead tab is eliminated entirely and its content merged into the Tokens tab State C

Option (a) is the conservative pick -- it keeps the Lead tab for the deep-dive tools, removes only the token input from it. The UIUX-08 Lead tab design spec should be consulted before making this call. This document recommends option (a) and flags it as a dependency on UIUX2-08 (Lead tab v2 design).

**CONFLICT 4 -- `__applyLeadGate` / `__applyTierVisibility` Lead tab hiding**
`__applyTierVisibility` hides the Lead tab nav button for non-leads (`popup.js` L1657-1658). If the Lead tab is retained for lead-only deep-dive (option (a) above), this behavior is unchanged. If the Lead tab is removed, the tab button hide logic is a no-op and can be removed. No change required for this document's scope.

**CONFLICT 5 -- welcome celebration toast timing**
The `showPopupBanner` welcome toast (`popup.js` L2979-2984) fires after `loadToken()` + `loadLead()` post-claim. In the new flow, `loadToken()` -> `__applyTierGate()` -> `__tokSetState('returning')` is the transition. The toast must fire AFTER the state transition, not before, to avoid the banner appearing over State A content. Current implementation fires at the correct point (after RPC success, before state updates) -- verify timing after patching.

**CONFLICT 6 -- encryption display: `encrypted: true` assumption**
`__tokUpdateBanner` shows `ENC` chip with `encrypted: true` hardcoded (always-on since v10.11.0). If there is any scenario where a legacy unencrypted token exists in storage (pre-migration run), the chip would be incorrect. To be accurate, the SW's `tokensStatus` RPC should return an `encrypted` boolean. If it does not currently return that field, the `ENC` chip should be labeled "ENC (v10.11+)" with a tooltip explaining it is always-on, not status-read. This is a low-risk display issue, not a functional one.

---

*Read-only audit. No files modified. All source line references are against the dist build at `D:\AI\_PROJECTS\dist\mod-tools dist\`.*
