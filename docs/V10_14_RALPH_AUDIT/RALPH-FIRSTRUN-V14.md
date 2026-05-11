# RALPH-FIRSTRUN-V14 — First-Run Mod Onboarding Re-Trace (post-v10.14.2)

**Auditor:** RALPH-FIRSTRUN-V14 (read-only)
**Repo:** `D:\AI\_PROJECTS\modtools-ext\` @ `61a035e` (v10.14.2)
**Compared against:** `docs/V10_13_RALPH_AUDIT/RALPH-FIRSTRUN.md` (post-W2 baseline, 17 mod-facing steps / 22-23 min TTFS)
**v10.14 commits in scope:**
- `54ad3ae` — `scripts/invite-mod.ps1` V14-FR1 (blocking gate) + V14-FR2 (Path B default)
- `af882cf` — Wave A V14-T6 (storage.onChanged auto-dismiss) + V14-T7 (SW-restart text differentiation) + V14-T4 (banner color disambiguation: setup blue vs credential amber)
- `61a035e` — Wave C V14-FR3 (live username validation hint)

---

## Summary

| Metric | UIUX2-36 (pre-W2) | RALPH-FIRSTRUN (post-W2 v10.13.4) | RALPH-FIRSTRUN-V14 (this audit, v10.14.2) | Delta vs post-W2 |
|---|---|---|---|---|
| Mod-facing numbered steps | 22 | 17 | **17** | **0** (same nominal count) |
| Lead-side steps (Phase 0) | implicit | 5 | **6** | **+1** (Step 7b SENT/SKIP gate) |
| Mod-facing clicks Phase 0→first ban | 28-34 | 27-32 | **27-32** | **0** |
| Time-to-first-success, median mod | ~25 min | ~22-23 min | **~21-22 min** | **-1 to -2 min** |
| Time-to-first-success, tech-savvy mod | 8-12 min | 8-11 min | **8-10 min** | **-1 min** |
| Time-to-first-success, solo from docs only | 45-90 min | 45-90 min | **40-80 min** | **-5 to -10 min** (FR1 closes the silent Drive-share failure mode) |
| TTFS variance (failure-recovery range) | wide (transient auth fail = +5-10 min) | narrower (auth auto-attempt + severity tiers) | **narrower still** (storage.onChanged auto-dismiss eliminates 1 manual reload on raw-token re-paste) | improved |

**Headline:** v10.14 did not move the **median nominal step count** but it **collapsed the failure-recovery tail** that previously bloated TTFS for the unlucky mod. The four largest wins are (1) FP-NEW-1 (silent Drive-share failure) is **closed at the lead side** by the V14-FR1 blocking gate — affected ~1-in-5 onboarding from RALPH-FIRSTRUN's count, now ~0; (2) V14-FR2 makes Path B (ZIP) the recommended default which **eliminates Google-account coupling** for first-install — net step delta is zero, but Path B's failure mode is recoverable (re-attach the ZIP) where Path A's was diagnosable-only-by-the-lead; (3) V14-T6 storage.onChanged auto-dismiss removes one manual reload from the Path-B raw-token-paste recovery path; (4) V14-T7 differentiated text means a mod whose SW restarts mid-onboard sees "Connection re-established" (transient, just retry) instead of "Extension was reloaded" (full Ctrl+R + lose unsaved input).

The lead-side step count went **up by 1** (Step 7b). The mod-side count is unchanged. **The point of v10.14 was not to compress steps further — it was to harden the steps that already existed against silent failure.** That is exactly what shipped.

---

## Step-by-Step Trace (Post-v10.14.2)

### Phase 0 — Lead-side preparation (now 6 sub-steps, was 5)

**Step 0a.** Lead runs `pwsh -File D:\AI\_PROJECTS\modtools-ext\scripts\invite-mod.ps1`. _(2-3 min including paste-the-lead-token + worker round-trip.)_

**Step 0b.** Script prompts for new mod's GAW username (Read-Host).

**Step 0c.** Script prompts for LEAD token (Read-Host with masking, attempts up to 3).

**Step 0d.** Script mints token + writes DM-ready text file. **NEW (V14-FR2):** the DM text now recommends **Path A = manual ZIP** as default; Path B = Drive auto-update is the alt.

**Step 0e.** Script prints "Step 7: Next actions for you":
1. Open the DM file, paste contents into Discord/Slack DM.
2. **Attach the ZIP** at `$DrivePath\gaw-modtools-LATEST.zip` to the DM (drag-drop into Discord/Slack).
3. Alternative: share the Drive folder with `{user}`'s Gmail (legacy Path B path).

**Step 0f. NEW — V14-FR1 blocking gate ("Step 7b").** Script presents:

> "Have you EITHER attached the ZIP to the DM OR shared the Drive folder with `{user}`'s Gmail?
> Type SENT to confirm (or SKIP to bypass at your risk)"

Three Read-Host attempts. SENT proceeds; SKIP records bypass in `result.errors`; three unrecognized inputs record timeout. Lead literally cannot exit the script with a clean `result` if they forgot the delivery step.

**Step 0g.** Script prints structured final report (counts, elapsed, errors), copies log to clipboard, plays E-C-G beep, Read-Host pause.

**Lead-side click count:** 1 paste (lead token), 1 paste (DM into Discord), 1 drag (ZIP into Discord) — OR for Path B, 3 clicks (right-click folder, Share, paste mod's Gmail). Plus 1 keystroke (`SENT`). **~3-5 minutes total. Same as RALPH-FIRSTRUN baseline; the Path B → Path A flip exchanges 3 Drive-UI clicks for 1 ZIP-drag click but adds the SENT keystroke. Net wash on time, big win on robustness.**

---

### Phase 1 — Install (Steps 1-6, unchanged from post-W2)

W2 didn't touch this phase. Wave A/B/C didn't touch this phase. SHIPMASTER §6 D-22 (in-popup install accordion + status-bar tooltip tour) is still deferred to v10.14+ and remains undelivered in v10.14.2. **Phase 1 still owns the bulk of TTFS.**

**Steps 1-6:** Open Chrome → `chrome://extensions/` → toggle Developer mode → Load unpacked → navigate to folder → Select Folder → puzzle-piece pin. Same 12-16 clicks, same 5-15 min, same HIGH friction.

**What changed under the hood:** the **default install path** flipped (V14-FR2). Pre-v10.14 the lead's DM said "Path A (Drive auto-update, recommended)". Post-v10.14 the lead's DM says "Path A (manual ZIP, recommended for first install) / Path B (auto-update, for long-term use)". The path letters are reused inside the DM text but the tier-default is inverted from a UX-flow standpoint:
- **Recommended (now): manual ZIP** — mod downloads the ZIP attachment from the DM, unzips, "Load unpacked" against the unzipped folder. Zero Google-account coupling, zero side-channel-share dependency. **No silent-fail mode.** If the ZIP didn't attach, the mod immediately sees "no attachment in this DM" and asks the lead — fast, diagnosable, recoverable.
- **Alt (now): Drive auto-update** — same as old Path A, requires lead to share folder with mod's Gmail. Still has the Drive-share failure mode if lead skips. **But:** the V14-FR1 blocking gate at Step 7b makes this much less likely to occur.

**Subtotal Phase 1:** 6 steps, 12-16 clicks, 5-15 min. **UNCHANGED in step count.** Reliability improved meaningfully on the unlucky-mod path (Drive-share failure now caught by Step 7b lead-side, plus Path B is the new default).

---

### Phase 2 — First Popup Open (Step 7, unchanged from post-W2)

Same as post-W2: Tokens tab auto-detected, State A renders cleanly (no flash, no orphan claim button). 1 click. Friction LOW.

**Subtotal Phase 2:** 1 step, 1 click. Unchanged.

---

### Phase 3 — Claim Flow (Steps 8-13, IMPROVED with V14-FR3)

**Common path (8a — link from DM):** unchanged from post-W2. Mod clicks `mt_invite` URL → `window.confirm()` → OK → opens popup → State A → clicks "📨 Claim my invite" → second confirm → claim succeeds → State B/C banner.

**Brave fallback / manual path (8b — paste URL/code/token in popup):** **NEW — V14-FR3 username live validation.**

- Mod clicks 📨 Link path button (or 🔢 Code, or 🔑 Raw token).
- Step 2 form appears with `firstRunInput` (URL/code/token) and `firstRunUsername` (GAW username) fields.
- **NEW: as the mod types their username, a hint chip below the input updates live:**
  - Empty: gray "Allowed: A-Z a-z 0-9 _ -, 2-64 chars" (`#5a5752`)
  - Valid (matches `/^[A-Za-z0-9_-]{2,64}$/`): green "✓ valid format" (`#44dd66`), input border green
  - Invalid: red "✗ invalid -- A-Z a-z 0-9 _ - only, 2-64 chars" (`#ff6b3d`), input border red
- Mod clicks "Save & verify". `firstRunGo` (popup.js:3641) checks **only `if (!username)`** then calls the worker.
- Worker validates server-side. If username is malformed (failed regex) but the mod somehow forced submission (script-disabled or fast-typer), the worker's reject path fires the existing `claim failed: ...` error.

**Critical answer to hunt-Q3:** **V14-FR3 is hint-only. It does NOT block submission.** The visual feedback steers the mod toward a valid format BEFORE they hit Save & verify, eliminating one round-trip-to-worker for typo cases. But it does not gate the Save button. This is the right call for two reasons: (1) the regex `/^[A-Za-z0-9_-]{2,64}$/` is the **shape** validator, not the **identity** validator — only the worker can confirm "this username exists in the mod_tokens table"; (2) gating client-side on shape would create a false-floor where the mod sees "valid format" but the worker still rejects (case-sensitivity, account doesn't exist, etc.) — that's a worse UX than letting the worker be the single source of truth.

**Reduction estimate:** ~5-15 seconds saved per onboard for the median mod (no shape error, hint reads "✓ valid format" → confidence). Up to ~30 seconds for the unlucky mod who would have submitted with `@catsfive` or `cat sfive` (space) and gotten a generic worker reject — they now self-correct before submission.

**Subtotal Phase 3:** 6 steps, 3-4 clicks + 2 paste/types. **Same step count.** Path 8b friction marginally LOWER (instant feedback during typing).

---

### Phase 4 — First GAW Page Load (Steps 14-16, IMPROVED on transient-fail recovery)

**Step 14.** Mod clicks "↗ Open greatawakening.win" button (W2 ship). Native anchor opens GAW in a new tab in the same Chrome profile. Unchanged.

**Step 15.** GAW page loads. modtools.js `init()` fires. `__validateModAuth` succeeds → status bar builds. **Same as post-W2 happy path.**

**What if auth fails on Step 15?** Mostly same as post-W2: auto-attempt → severity-tiered banner. **NEW behaviors in v10.14:**

- **V14-T4** — banner severity colors disambiguated: `setup` mode is now **blue** (`rgba(74,158,255)`) instead of amber. `credential` mode stays warm-amber. Pre-fix the two amber tones were ~5% RGB-distance apart and were visually indistinguishable; spec promised 4 tiers, effective count was 3. Post-fix, 4 visually distinct tiers. **The first-run mod sees blue/info "Setup needed" instead of an amber banner that looked identical to the credential-broken one.** This matters during the first-run onboard because the most common reason for auth-fail on Step 15 is `no_token` / `short_token` — exactly the blue-tier setup mode.

- **V14-T6** — `chrome.storage.onChanged` listener now **auto-dismisses the auth-fail banner** when a fresh token lands via the storage event. Pre-fix, after the mod re-pasted a raw token in the popup (Path 8b fallback), the auth banner stayed visible until manual page reload; now it dismisses automatically once the listener re-validates. **Eliminates one manual reload on the raw-token re-paste recovery path.** Modtools.js:1782-1796 wires the dismiss; revalidation gates the dismiss so a still-broken token doesn't trigger a false-clear.

- **V14-T7** — SW-restart snack text differentiated: `'Connection re-established -- click Retry to resume.'` for SW-restart events, `'Extension was reloaded -- please refresh this page (Ctrl+R) and try again.'` for actual extension reloads. Pre-fix both events showed the same text and the mod didn't know which one they were dealing with. Post-fix, the SW-restart case (transient, no user action needed beyond clicking the in-banner Retry) is visually distinct from the harder extension-reload case (full page reload required). Modtools.js:7569 + 24382 + 24391 + 24438 split the strings cleanly.

- **V14-T5** (also Wave A) — whoami 5s timeout no longer discards late resolve. Status bar shows "Reconnecting..." instead of failing hard, then auto-reapplies State B if whoami eventually returns. **First-run impact:** the unlucky mod whose first whoami times out (slow Cloudflare round-trip) no longer sees a hard fail; the bar self-heals. Saves up to 30-60s of manual-retry confusion.

**Step 16.** Mod looks at status bar. Per UIUX2-36 FP-7 + post-W2 carry-over, status bar still has zero "what is this" tooltip tour. SHIPMASTER §6 D-22 still defers fix to v10.14+ (NOT shipped in v10.14.0/.1/.2). **This is the largest unfixed first-run friction point.**

**Subtotal Phase 4:** 3 steps, 1 click. **Friction MEDIUM** (status bar still mute on first sight). Recovery path measurably more robust.

---

### Phase 5 — First Ban (Steps 17-22, unchanged from post-W2)

V14 didn't touch ban flow. Same 6 steps, 5-7 clicks. Unchanged.

---

## Total step / click / time count

| Phase | Steps | Clicks | Time | vs post-W2 |
|---|---|---|---|---|
| 0 — Lead-side prep | 6 (lead-side) | 3-5 (lead) | 3-5 min | +1 step (SENT gate); same time |
| 1 — Install | 6 | 12-16 | 5-15 min | unchanged step count; Path B default reduces silent-fail rate |
| 2 — First popup open | 1 | 1 | <1 min | unchanged |
| 3 — Claim flow | 6 | 3-4 + 2 paste/type | 1-2 min | unchanged step count; FR3 hint saves 5-15s on Path 8b |
| 4 — First GAW load | 3 | 1 | <1 min | unchanged step count; T6/T7/T5 collapse failure-recovery tail |
| 5 — First ban | 6 | 5-7 | 2-4 min | unchanged |
| **Total (mod-facing)** | **17** | **22-29** | **9-22 min (typical happy + unlucky)** | -1 to -2 min median |

**Mod-facing step count: 17. Unchanged from post-W2.** This is the deliberate design choice in v10.14 — the focus was hardening, not further compression. The next step-count compression is **D-22 (in-popup install accordion + status-bar tooltip tour)** which is still deferred.

---

## Hunt list answers

### Q1: Did V14-FR2 (Path B default) actually compress steps?

**No, and that wasn't the goal.** Path A (was: Drive) and Path B (was: ZIP) were swapped in label-priority, not eliminated. Both paths still exist; both still require a single lead-side artifact-delivery action.

**The exchange:**
- **Old default (Drive):** lead clicks 3-4 times in the Drive Share UI to add the mod's Gmail with Viewer permission. Side-channel handoff. Failure mode = silent (mod sees empty Drive, Chrome shows generic "Manifest file is missing" error, no diagnostic path).
- **New default (ZIP):** lead drags 1 file into Discord. In-channel handoff. Failure mode = visible (mod sees "no attachment in this DM" and asks the lead, ~30s recovery).

**Net step count: zero delta.** The win is **failure-mode visibility**, not raw step compression. RALPH-FIRSTRUN's FP-NEW-1 was specifically about the silent-fail of the Drive-share path. V14-FR2 doesn't eliminate that path; it just demotes it from default. V14-FR1 closes the residual gap by forcing the lead to confirm delivery before the script exits.

**The right framing:** V14-FR2 + V14-FR1 are a paired ship. FR2 picks the lower-failure-rate default; FR1 hardens whichever path the lead took. Together they close FP-NEW-1.

### Q2: V14-FR1 blocking gate adds 1 operator step (type SENT). Net friction reduction or increase?

**Net reduction.** The math:

- **Cost:** ~5 seconds of operator attention + 1 keystroke per onboard (`SENT`). Imposed on 100% of onboardings.
- **Benefit:** Prevents the silent-Drive-share failure from FP-NEW-1, which RALPH-FIRSTRUN estimated at ~5-10 min recovery time per affected onboard, affecting ~1-in-5 onboardings. Expected value of recovery time avoided per onboard: 0.2 × 7.5 min = ~1.5 min = ~90 seconds.

**Net: ~85 seconds of expected recovery time saved per onboard, at a cost of 5 seconds of certain operator attention.** ~17:1 ratio.

The gate is also strictly opt-out friendly: if the operator genuinely meant to skip (e.g., DM is going via a separate channel), they type `SKIP` and the script records the bypass in `result.errors` for auditability. This avoids the failure mode where a paranoid gate becomes its own friction point.

**Verdict: clean win.** The 5-second cost is barely perceptible; the recovery time saved on the 1-in-5 affected case is non-trivial. Plus: lead-side time is cheaper to spend than mod-side time (lead is in-context, mod is doing first-time setup with cognitive load saturated).

### Q3: V14-FR3 username live validation — does it block claim submission on invalid usernames, or just shows hint?

**Hint only. Does NOT block submission.** Verified by code-walk:

- popup.html:524 — `firstRunUsername` input has `pattern="[A-Za-z0-9_-]{2,64}"` and `maxlength="64"` (HTML-level constraints; `pattern` only fires on native form submission, which the wizard doesn't use — it's wired to a button click).
- popup.js:3606-3637 — `_wireFirstRunUsernameValidation` IIFE wires `input` + `blur` listeners. On each event, regex-tests the value, updates the hint chip text/color and the input border. **Pure visual feedback.**
- popup.js:3641-3656 — `firstRunGo` click handler reads `firstRunUsername.value.trim()` and only checks `if (!username) { status.textContent = 'enter your GAW username'; return; }`. **No regex check before worker call.** The worker gets the malformed username and the worker rejects it with the existing `claim failed: ...` error path.

**Why this is the right call:** The regex validates *shape*, not *identity*. A username that passes the regex can still fail server-side (case mismatch, account doesn't exist in the mod_tokens table, etc.). If the client gated on regex-pass, the mod would see "✓ valid format" → click Save → still get a worker reject. That's a worse UX than letting the worker be the single source of truth. The hint steers but doesn't lie.

**Functional impact:** Saves one worker round-trip on the **typo case** (mod typed `@catsfive` or `cat sfive` (space)). Mod self-corrects before clicking Save. ~5-15 seconds typical, up to ~30 seconds on the slowest worker round-trips. **Doesn't help the case-mismatch case** (e.g., mod types `Catsfive` when account is `catsfive`) — that's still a worker reject, and SHIPMASTER R-7 / V14-FR3 follow-up suggests adding "Username not found — check capitalization" specificity to the worker error string. That follow-up isn't in v10.14.2.

### Q4: Storage.onChanged auto-dismiss (V14-T6) — when new mod pastes raw token (Path B fallback path), does the auth banner now auto-dismiss?

**Yes, with a revalidation gate.** Verified at modtools.js:1782-1796 + 1759-1796:

```javascript
chrome.storage.onChanged.addListener(function(changes, area) {
  if (area !== 'local') return;
  if (!changes.gam_settings) return;
  // ... rehydrate _secretsCache ...
  // v10.14.0 V14-T6 (RALPH-RECOVERY R-03): auto-dismiss the auth-fail
  // banner when a fresh token lands via storage.onChanged. Pre-fix the
  // banner stayed visible after a successful re-paste until manual reload.
  // Re-validate first so we don't dismiss while still broken.
  __validateModAuth().then(function(valid) {
    if (valid) {
      var banner = document.getElementById('gam-auth-fail-banner');
      if (banner) {
        try { banner.remove(); } catch(_){}
        // ... console log ...
      }
    }
  }).catch(function(){});
});
```

**The flow:**
1. Mod sees auth-fail banner (e.g., they hit the GAW page before claiming a token, or their first claim failed transiently).
2. Mod opens popup → 🔑 Raw token path → pastes raw token → clicks Save & verify.
3. Save & verify writes to `chrome.storage.local` → fires `chrome.storage.onChanged`.
4. Content script's listener re-hydrates the `_secretsCache` → re-runs `__validateModAuth()`.
5. If valid: banner auto-dismisses. **Mod no longer needs to manually reload the GAW page.**

**Pre-v10.14 behavior:** banner stayed visible until manual `Ctrl+R`. The mod often did the reload anyway out of habit, but the banner's persistence after a successful re-paste was a credibility gap ("I thought I fixed it, why is the warning still here?").

**Eliminates: 1 manual reload + the credibility gap.** Saves ~10-15 seconds per affected case. Affects only the Path 8b raw-token-paste recovery flow, not the common Path 8a link-claim flow. ~5-10% of onboardings hit this path (Brave users, or mods who clicked the path button manually instead of the DM link).

### Q5: Wave A SW-restart text differentiation (V14-T7) — if mod's SW restarts mid-onboard, does the banner now correctly say "Connection re-established" not "Extension was reloaded"?

**Yes.** Verified at modtools.js:7566-7572:

```javascript
\ v10.14.0 V14-T7 (RALPH-RECOVERY R-04): differentiate from ext-reload banner.
// Pre-fix both said "Extension was reloaded." This is SW restart (different
// event) -- connection between page and SW transparently re-established.
msgEl.textContent = 'Connection re-established -- click Retry to resume.';
```

vs. modtools.js:24382/24391/24438 for the actual extension-reload case which still says:
```javascript
error: 'Extension was reloaded -- please refresh this page (Ctrl+R) and try again.'
```

**The two events are now distinguishable to the mod:**
- **SW restart (transient):** "Connection re-established -- click Retry to resume." → mod clicks the in-banner Retry button, work resumes, no page reload, no input loss.
- **Extension reload (harder):** "Extension was reloaded -- please refresh this page (Ctrl+R) and try again." → mod hits Ctrl+R, page reloads, anything in unsaved input fields is lost.

**First-run impact:** During Phase 4 (Step 15-16) the mod is right at the edge of where SW restart can fire — they just claimed a token and the SW is doing the secrets sync for the first time. Pre-v10.14 a transient SW restart looked like an extension reload and the mod might have done a full Ctrl+R, which is fine on Phase 4 (no unsaved state) but trains the wrong reflex for later (e.g., losing a half-written modmail draft to a reflex Ctrl+R triggered by the same banner). Post-v10.14 the mod learns to distinguish the two cases.

**Marginal direct impact on first-run TTFS:** ~5-15 seconds on the unlucky mod whose SW restarts mid-onboard. **Larger indirect impact on later-day mod retention** (correct mental model from the start).

### Q6: Re-rate TTFS post-v10.14.

**Median mod TTFS: ~21-22 minutes.** Down from RALPH-FIRSTRUN's 22-23 min. ~1-2 min reduction is the median picture.

**Tech-savvy mod TTFS: 8-10 minutes.** Down from 8-11 min. Marginal — most of v10.14's wins are on failure paths the tech-savvy mod doesn't hit.

**Solo from docs only TTFS: 40-80 minutes.** Down from 45-90 min. ~5-10 min reduction comes entirely from V14-FR1 closing the silent Drive-share failure mode. The solo-from-docs mod was the case most exposed to FP-NEW-1 because they had no voice-channel back to the lead to diagnose "why is my Drive empty" in real time.

**TTFS variance is the bigger story.** The post-W2 distribution had a long unhappy tail (auth-fail + Drive-share-skipped + Brave + multi-Chrome-profile = up to 90 min for the unluckiest mod). Post-v10.14 that tail is meaningfully shorter:
- Drive-share-skipped: ~closed by FR1 gate (lead can't proceed without delivery confirmation).
- Auth-fail recovery: faster (storage.onChanged auto-dismiss + SW-restart vs ext-reload differentiation + setup-blue color tier).
- Username typo: caught client-side by FR3 hint instead of round-tripping the worker.

**The Phase 1 install ceiling is still unbroken.** UIUX2-36's 12-min target ("minimum viable halving") still requires D-22 (in-popup install accordion + status-bar tooltip tour). v10.14 deliberately did not ship D-22 — Wave A/B/C were tactical hardening, not architectural compression. **The next big TTFS win lives in D-22 (estimated 5-10 min reduction once shipped).**

---

## Friction points — current state

### v10.14-RESOLVED friction

| ID | Source | Status |
|---|---|---|
| FP-NEW-1 (HIGH — Drive-share silent failure) | RALPH-FIRSTRUN | **CLOSED** by V14-FR1 (Step 7b blocking gate) + V14-FR2 (Path B default reduces dependency on Drive share) |
| Auth-banner color collision (P2 cosmetic) | W2 + TOKENS + RECOVERY + FIRSTRUN | **CLOSED** by V14-T4 (setup → blue, credential stays amber, 4 visually distinct tiers) |
| Auth-banner persistence after raw-token re-paste | RECOVERY R-03 | **CLOSED** by V14-T6 (storage.onChanged auto-dismiss with revalidation gate) |
| SW-restart vs ext-reload text confusion | RECOVERY R-04 | **CLOSED** by V14-T7 (differentiated banner text) |
| Username typo round-trip to worker | RALPH-FIRSTRUN R-7 | **PARTIALLY CLOSED** by V14-FR3 (live shape hint; identity errors still round-trip) |
| Whoami 5s timeout false-fail | TOKENS F4 + RECOVERY R-07 | **CLOSED** by V14-T5 ("Reconnecting..." status + auto-reapply on late resolve) |

### Carried-over friction (still live in v10.14.2)

| ID | Friction | Severity | SHIPMASTER deferral |
|---|---|---|---|
| FP-1 | Zero pre-install guidance in-product | HIGH | D-22 (still v10.14+; **not shipped in v10.14.0/.1/.2**) |
| FP-2 | Drive Desktop "Available Offline" CRITICAL step | HIGH | D-22 (only relevant if mod takes Path B for auto-update; with V14-FR2 default, fewer mods hit this) |
| FP-3 | Chrome `chrome://extensions/` + Dev Mode discovery | HIGH | D-22 |
| FP-4 | Folder selection level ambiguity | MEDIUM | D-22 |
| FP-5 | Puzzle-piece → pin sequence is invisible | MEDIUM | D-22 |
| FP-7 | Status bar has no "what is this" tour | MEDIUM | D-22 (P1-70) |
| FP-8 | Ban button icon-only | LOW | UIUX2-34 carry-over |
| FP-9 | Username field no validation hint (claim wizard) | **PARTIALLY ADDRESSED** by V14-FR3 (shape only; identity errors still generic) | E-5 follow-up — needs worker-error specificity branch |
| FP-10 | Brave shields invite-strip silent failure | LOW | partially mitigated by Brave rescue banner |
| FP-NEW-2 | Two confirmation modals on Path 8a (link-flow) | LOW (designed-for-security per phishing IR) | accepted-cost; not a fix candidate |
| FP-NEW-3 | `rotated_at` age dead-code (P0 from RALPH-W2) | P0 | **CLOSED in v10.13.5 hotfix** (per `c06c5a6`); confirm in v10.14 follow-up |
| FP-NEW-4 | Open-GAW button: same Chrome profile, no logged-in check | LOW | document in INSTALL.md; v10.14+ |

### NEW friction surfaced by v10.14 (none P0 or HIGH)

#### FP-V14-1 (LOW) — V14-FR3 hint chip uses inline styles, not class-based theming

**Where:** popup.js:3617-3635 — `__validate` mutates `hint.style.color` and `inp.style.borderColor` directly with hex literals (`#5a5752`, `#44dd66`, `#ff6b3d`).

**Symptom:** the green/red feedback colors are hardcoded inline, not tokenized via the v10.14 design-system color variables. If the design pass ships a state-color update (e.g., to align with V14-T4's blue/amber tier), the hint chip won't pick it up automatically.

**Severity:** LOW. Cosmetic, only affects future-me when iterating on color tokens. Not blocking, not affecting first-run friction.

**Fix path:** v10.14+ hygiene pass — replace inline styles with class toggles (`pop-token-hint--ok`, `pop-token-hint--err`). Out of scope for read-only audit.

#### FP-V14-2 (LOW) — V14-FR1 SENT/SKIP gate has no audit log on the worker side

**Where:** scripts/invite-mod.ps1:392-419 — gate state recorded in `$result.errors` array (script-local, written to clipboard log).

**Symptom:** if the lead types SKIP and the mod onboards successfully anyway, there's no central record that delivery was bypassed. If the lead types SKIP and the mod fails to install, the lead's recovery loop is "open the clipboard log, scroll, find the bypass marker, recall context."

**Severity:** LOW. Lead's clipboard log is the canonical artifact and SKIP is rare by design. If a worker-side audit endpoint becomes available later, this becomes a one-line `Invoke-RestMethod` call.

**Fix path:** v10.14+ — add `/admin/invite-delivery-log` endpoint, post `{ user, gate_status, timestamp }` from the script. Out of scope for read-only audit.

#### FP-V14-3 (LOW) — V14-T6 auto-dismiss console log is dev-style, not user-facing

**Where:** modtools.js:1793 — `console.log('%c[modtools v10.14.0 V14-T6] auth banner auto-dismissed (storage.onChanged + revalidated ok)', 'color:#3dd68c;font-weight:700');`

**Symptom:** the auto-dismiss is silent to the mod. Banner just disappears. No "✓ token verified, you're good to go" snack. A more attentive UX would surface the dismissal as a momentary positive-reinforcement signal.

**Severity:** LOW. Silent success is fine and matches the "less talk, more action" UX principle. But for a fresh mod, a 2-second positive snack ("✓ Authenticated") on auto-dismiss would close the credibility loop more cleanly than the banner just vanishing.

**Fix path:** v10.14+ — wire a `snack('Authenticated', 'ok', { ttl: 2000 })` call in the dismiss branch. Out of scope.

---

## Recommendations (priority-ordered)

### P0 — None outstanding

V14-FR1 + V14-FR2 closed FP-NEW-1, which was the only HIGH/P0 carry-over from RALPH-FIRSTRUN. No new P0 friction surfaced.

### P1 — Land in next wave (v10.14+ or v10.15)

**R-V14-1.** SHIPMASTER §6 D-22 (in-popup install accordion + status-bar tooltip tour). **Still the largest unfixed first-run friction surface.** Without D-22, FP-1/FP-2/FP-3/FP-4/FP-5/FP-7 stay live and Phase 1 continues to dominate TTFS at 5-15 min. Estimated 5-10 min reduction once shipped per UIUX2-36 §E. **This is the next big TTFS win.**

**R-V14-2.** Worker-error specificity for username-not-found in claim wizard. V14-FR3 closed the shape-error path but identity errors (`Catsfive` vs `catsfive` case mismatch, account doesn't exist) still hit the generic `claim failed: ...` text. Add a worker error code like `username_not_found` that the popup translates to "Username not found — check capitalization. Your GAW username appears in your profile URL: greatawakening.win/u/[yourname]." This was UIUX2-36 §E-5 + FIRSTRUN R-7 follow-up; V14-FR3 was the client-side half. Worker-side half is undelivered.

### P2 — Backlog

**R-V14-3.** V14-FR1 worker-side audit endpoint (FP-V14-2). LOW value, ~30 min effort. Defer until there's another reason to add an admin audit endpoint.

**R-V14-4.** V14-T6 positive-reinforcement snack on auto-dismiss (FP-V14-3). LOW value. Cosmetic.

**R-V14-5.** V14-FR3 hint-chip class-based theming (FP-V14-1). LOW value, hygiene-only.

**R-V14-6.** UIUX2-36 §E-3 (status-bar tooltip tour) — covered by D-22.

---

## Closing observation

**v10.14 was a hardening wave, not a compression wave. That was the right call.**

The post-W2 baseline (RALPH-FIRSTRUN, 17 mod-facing steps / 22-23 min TTFS) had the right step count for the current architecture. Further compression requires architectural moves (D-22 install accordion, D-22 status-bar tooltip tour) that are deferred. What v10.14 did instead was surgical:

- **FP-NEW-1 closed** (silent Drive-share failure → blocking gate + Path B default).
- **Failure-recovery tail collapsed** (storage.onChanged auto-dismiss + SW-restart text differentiation + whoami late-resolve handling + setup-blue color tier).
- **Worker-round-trip-on-typo eliminated** (V14-FR3 client-side shape validation hint).

**TTFS: 22-23 min → ~21-22 min.** ~5% improvement on the median, but the unhappy-tail compression (40-80 min instead of 45-90 min for solo-from-docs) is where v10.14 actually delivered.

**The Phase 1 install ceiling is still unbroken.** D-22 remains the highest-leverage unfixed item. When it lands, expect a meaningful step compression (estimated 17 → 13-14 mod-facing steps, TTFS 22 min → 12-15 min) because the in-popup install accordion eliminates the "go find the docs" moment for FP-2/FP-3/FP-4 and the status-bar tooltip tour eliminates the "what is this" moment for FP-7.

**Lead-side ergonomics improved by 1 step (Step 7b) at a cost of ~5 seconds and a benefit of ~85 seconds expected recovery saved.** Clean trade.

**Mod-side step count is unchanged at 17.** This is intentional. v10.14 was about quality, not quantity. The next compression lives in v10.14+ / v10.15 with D-22.

---

*RALPH-FIRSTRUN-V14 audit complete. Read-only. No code or git operations performed.*
