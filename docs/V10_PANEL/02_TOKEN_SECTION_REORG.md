# Panel Reorg 2 -- Token Section Context Reorganization

## A. ROOT CAUSE: Why wizard shows for catsfive

**File:** `popup.js` lines 1776-1792 (`initFirstRunWizard`) vs. lines 1763-1766 (startup call order).

The wizard gates on:
```js
const out = await chrome.storage.local.get('gam_settings');
const s = (out && out.gam_settings) || {};
hasToken = !!(s.workerModToken && String(s.workerModToken).length >= 32);
```
(popup.js:1782-1784)

This reads `chrome.storage.local` directly. Under the v7.2 platform-hardening architecture, the popup never writes tokens to `chrome.storage.local` from itself -- it routes writes through the background service worker via `saveTokensSecurely` which writes to `chrome.storage.session` first (background.js:1040-1042 confirms the SW DOES mirror back to `chrome.storage.local`, so the value IS there).

**The actual bug is a race condition + logic gap, not a missing value:**

1. `loadToken()` and `loadLead()` fire at lines 1765-1766. Both are `async` but neither is `await`-ed at the call site. They run concurrently.
2. `initFirstRunWizard()` fires immediately after at line 1776, also unawaited. At the time it executes, `gam_settings` IS readable from `chrome.storage.local` -- so catsfive's token SHOULD be found.
3. **The real bug:** `initFirstRunWizard` only checks `workerModToken` (popup.js:1784). It does NOT check `leadModToken`. But the wizard is showing for catsfive who has BOTH tokens. This means `workerModToken` IS present in `gam_settings` at read time, and yet the wizard shows.

**Conclusion after tracing the code:** The wizard check at line 1784 will correctly return `hasToken = true` for catsfive IF `gam_settings.workerModToken` is populated in `chrome.storage.local`. The bug occurs when the token lives only in `chrome.storage.session` (the SW vault) but has NOT been mirrored back to `chrome.storage.local`. This happens on a fresh SW restart before the storage-change listener at background.js:257 has had a chance to fire. In that state:
- `tokensStatus` message (used by `loadToken`) asks the SW, which calls `loadSecrets()` from session storage first, finds it there -- reports `hasTeamToken: true`
- `initFirstRunWizard` reads `chrome.storage.local` directly, finds `workerModToken: ''` or absent -- reports `hasToken = false` -- **SHOWS WIZARD**

This is the split-read bug: two code paths reading from two different stores (SW session vault vs. local), disagreeing on whether a token exists.

**File:line summary:**
- `initFirstRunWizard` direct local read: `popup.js:1782`
- `loadToken` via SW vault: `popup.js:435` (`__tokensStatus` -> background `tokensStatus` message)
- SW `loadSecrets` reads session-first, local-fallback: `background.js:102-116`
- Storage-change listener mirrors local->secretCache: `background.js:257-264` (async, can lag)

---

## B. CONTEXT-DRIVEN ORDER

**When no tokens saved (genuine fresh install):**
1. First-run wizard takes the full token section -- full-width, bright orange border, guides the new mod through 3 paths (invite link / invite code / pre-minted token)
2. Team Mod Token raw input dimmed to 40% opacity (current behavior, correct)
3. Lead Mod Token section: hidden entirely -- a new mod is never lead on first install

**When team token saved, lead status unknown (while whoami probe is in flight):**
1. Team Mod Token: collapsed to single line "stored" status + rotate/claim-rotate buttons
2. Lead Mod Token: field visible but NOT expanded -- waiting for whoami
3. First-run wizard: HIDDEN

**When team token saved, whoami confirms regular mod (not lead):**
1. Team Mod Token: collapsed card -- "Team token (verified -- u/USERNAME)" + discreet "Restart setup" link below
2. Lead section: entirely hidden (`#leadSection` display:none) -- regular mods never see it
3. First-run wizard: hidden

**When team token saved, whoami confirms lead (`is_lead = true`, catsfive case):**
1. Lead Mod Token: TOP of section -- prominent purple rail, labeled "Lead Mod Token (OPTIONAL for most ops)"
2. Team Mod Token: below it, collapsed to status line
3. `#leadOnlyTools` expanded (current behavior correct)
4. First-run wizard: hidden
5. Entire section collapses to "Tokens (verified -- u/catsfive lead)" card with expand toggle + "Restart setup" link

**When lead token saved (both stored, both verified):**
- Same as above but Lead status shows "stored" instead of "OPTIONAL"
- Auto-collapse fires after both whoami probes succeed (see section E)

---

## C. WIZARD GATING FIX

**Root fix:** replace the direct `chrome.storage.local` read in `initFirstRunWizard` with the SW-vault-aware `__tokensStatus()` call that `loadToken` already uses. This eliminates the split-read race.

**File:** `popup.js` lines 1780-1789

**Diff:**
```diff
-  // Check if a team token is already saved -- if so, no wizard
-  let hasToken = false;
-  try {
-    const out = await chrome.storage.local.get('gam_settings');
-    const s = (out && out.gam_settings) || {};
-    hasToken = !!(s.workerModToken && String(s.workerModToken).length >= 32);
-  } catch (_) {}
-  if (hasToken) {
-    wiz.style.display = 'none';
-    return;
-  }
+  // Check via SW vault (same source as loadToken uses) -- avoids split-read
+  // race where session vault has the token but chrome.storage.local hasn't
+  // been mirrored yet (e.g. fresh SW restart).
+  let tokenState = { hasTeamToken: false };
+  try { tokenState = await __tokensStatus(); } catch (_) {}
+  if (tokenState.hasTeamToken) {
+    wiz.style.display = 'none';
+    return;
+  }
```

**Additionally:** move `initFirstRunWizard` invocation to AFTER `loadToken` and `loadLead` have settled. Currently all three fire concurrently unawaited (lines 1763-1776). The wizard must wait for `__tokensStatus` anyway (async), but making the dependency explicit is cleaner.

**Revised call-site (popup.js ~line 1763):**
```diff
-loadStats();
-refreshSniffLabel();
-loadToken();
-loadLead();
-
-(async function initFirstRunWizard() {
+(async function __bootstrap() {
+  loadStats();
+  refreshSniffLabel();
+  await Promise.all([loadToken(), loadLead()]);
+  initFirstRunWizard();  // runs after token state is fully resolved
+})();
```

This is a two-line structural change but eliminates the race permanently. `loadToken` and `loadLead` can remain async (they don't block the UI); the wizard simply waits for both to settle before deciding to show.

---

## D. "Restart setup" BUTTON

**What it does:** opens the wizard again WITHOUT clearing tokens. This lets catsfive or any returning mod re-run the flow if they need to re-enter credentials -- without the destructive side-effect of a full token wipe.

**Where it lives:** bottom of the Tokens section, below the collapsed card (section E). Always visible once the wizard has been successfully completed at least once (detect via `chrome.storage.local` flag `gam_wizard_completed: true` set on wizard success at popup.js:1879).

**HTML to add** (goes inside `#tokensSection` after `#leadSection`, before `#claimInviteWrap`):
```html
<div id="restartSetupWrap" style="display:none;margin:6px 8px 0;text-align:right">
  <button id="restartSetupBtn" class="pop-link" style="font-size:10.5px;color:#5a5752">
    Re-enter credentials
  </button>
</div>
```

**JS handler:**
```js
(function wireRestartSetup() {
  const btn = $('restartSetupBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    // Expand wizard WITHOUT clearing tokens (non-destructive)
    const wiz = $('firstRunWizard');
    if (wiz) { wiz.style.display = 'block'; }
    // Re-expand the token section if it was auto-collapsed
    const card = $('tokensCollapsedCard');
    if (card) card.style.display = 'none';
    const inner = $('tokensInnerContent');
    if (inner) inner.style.display = '';
    // Show wizard step 1
    $('firstRunWizardStep1').style.display = 'block';
    $('firstRunWizardStep2').style.display = 'none';
    $('firstRunWizardSuccess').style.display = 'none';
  });
})();
```

No confirm dialog -- re-entering is non-destructive (wizard saves only on "Save & verify" click). Tokens are not cleared until the user successfully completes step 2, at which point the existing flow overwrites them.

**Show condition:** set `gam_wizard_completed` flag in the success branch of `initFirstRunWizard` (popup.js:1871-1879 block), then in `loadToken`/`loadLead` check for it and show `#restartSetupWrap`.

---

## E. AUTO-COLLAPSE-ON-AUTH

**Trigger:** both whoami probes succeed (team whoami confirms username, lead gate confirms `is_lead`).

**Collapsed state:** entire `#tokensInnerContent` div replaced by a single summary card:

```html
<div id="tokensCollapsedCard" style="display:none;background:#050507;border:1px solid #2a2a30;border-radius:4px;padding:8px 12px;margin:4px 8px;display:flex;align-items:center;gap:8px">
  <span style="color:#44dd66;font-size:11px">&#x2713;</span>
  <span id="tokensCollapsedLabel" style="font-size:11px;color:#9b9892;flex:1">Tokens verified</span>
  <button id="tokensExpandBtn" class="pop-link" style="font-size:10px;color:#5a5752">expand</button>
</div>
```

**Label text:**
- Lead path: `"Tokens (verified -- u/catsfive lead)"`
- Regular mod: `"Tokens (verified -- u/USERNAME)"`
- Team only, lead unknown: `"Team token verified -- u/USERNAME"`

**Collapse trigger** (add to `__applyLeadGate` after tools are shown, popup.js:685):
```js
// After confirming is_lead, auto-collapse if both tokens verified
try {
  const ts = await __tokensStatus();
  if (ts.hasTeamToken) {
    const label = 'Tokens (verified -- u/' + (r.data.username || '?') + ' lead)';
    __collapseTokenSection(label);
  }
} catch (_) {}
```

**`__collapseTokenSection(label)` helper** (new function, add near line 704):
```js
function __collapseTokenSection(label) {
  const card = $('tokensCollapsedCard');
  const inner = $('tokensInnerContent');
  const lbl   = $('tokensCollapsedLabel');
  if (!card || !inner) return;
  if (lbl) lbl.textContent = label;
  inner.style.display = 'none';
  card.style.display  = 'flex';
  const expandBtn = $('tokensExpandBtn');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      inner.style.display = '';
      card.style.display  = 'none';
    }, { once: true });
  }
  // Show the restart-setup link at bottom
  const rw = $('restartSetupWrap');
  if (rw) rw.style.display = '';
}
```

**HTML change required:** wrap the existing token section content (popup.html lines 259-462) in `<div id="tokensInnerContent">...</div>` and add the collapsed card above it. The tab container/header remains outside so the tab itself is still visible.

---

## F. SHIP-TONIGHT PATCH

Ordered by risk, lowest-risk first:

**1. Wizard gating fix (popup.js ~line 1782) -- CRITICAL, fixes the catsfive bug**
Replace the 6-line `chrome.storage.local` read block with the 3-line `__tokensStatus()` call (section C diff above). Zero HTML changes. Zero structural risk.

**2. Bootstrap sequencing (popup.js ~line 1763) -- LOW RISK**
Wrap `loadToken`/`loadLead`/`initFirstRunWizard` in the `__bootstrap` async IIFE (section C). This is purely additive -- same functions, same behavior, just sequenced.

**3. "Re-enter credentials" button (popup.html + popup.js) -- LOW RISK**
Add the `#restartSetupWrap` div and its handler. Non-interactive until the wizard has completed; does not touch the token save/load flow.

**4. Auto-collapse (popup.html wrapper div + popup.js `__collapseTokenSection`) -- MEDIUM RISK**
Requires one HTML structural change (wrapper div). Test that the expand/collapse toggle doesn't break any button wiring inside `#tokensInnerContent`. The inner DOM is not modified -- only the container visibility is toggled.

**5. Context-driven ordering (lead token above team token) -- HTML REORDER**
Move `#leadSection` (popup.html:315-449) ABOVE the team `div.pop-token` (lines 259-273). This is purely DOM reorder; no JS changes needed. The existing IDs and event listeners are already wired correctly -- they don't depend on DOM position.

---

## G. EDGE CASES

**Tokens partially valid (team stored, whoami 401):**
- Wizard stays hidden (token IS stored, just stale/invalid)
- `#tokenStatus` shows "stored" but `__applyLeadGate` fails silently (fail-closed)
- Auto-collapse does NOT trigger (lead gate never fires)
- User sees Team Mod Token row with "stored" + rotate/claim-rotate; Lead row visible but no tools expanded
- Recommendation: add a `tokenStatus` error state when `loadToken` finds `hasTeamToken: true` but a subsequent whoami probe returns non-200. Show "stored (verify failed -- paste new token to replace)" in amber.

**Lead-only (lead token saved, no team token):**
- Wizard shows -- `hasToken` check is team-token-only (correct; without team token, the mod cannot act)
- Lead input should NOT be hidden in this state; the wizard "I have a TEAM TOKEN" path covers the fix
- After team token saved via wizard, `loadLead()` fires and restores lead status

**Both tokens present, browser just restarted (session store cleared):**
- SW `loadSecrets()` at background.js:108-115 falls back to `chrome.storage.local`
- Both `secretCache.workerModToken` and `secretCache.leadModToken` rehydrate from local
- Fixed wizard check via `__tokensStatus()` will then read the rehydrated cache correctly
- Previously, this state could cause a brief flash of the wizard (old bug); the section-C fix eliminates it permanently

**catsfive opens popup before background SW has finished initializing:**
- `__tokensStatus()` message may fail (SW not ready) -- `try/catch` returns `{hasTeamToken:false, hasLeadToken:false}`
- Wizard would incorrectly show for one load cycle
- Mitigation: add a 300ms retry in `initFirstRunWizard` if `__tokensStatus()` throws:
  ```js
  try { tokenState = await __tokensStatus(); }
  catch (_) {
    await new Promise(r => setTimeout(r, 300));
    try { tokenState = await __tokensStatus(); } catch (_) {}
  }
  ```
  This is belt-and-suspenders; the bootstrap sequencing change in section C already reduces the window significantly.
