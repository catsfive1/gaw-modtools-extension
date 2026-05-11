# RALPH-LEADDAILY -- Lead Daily Routine Re-Audit Post-v10.13.4

**Agent:** RALPH-LEADDAILY
**Date:** 2026-05-10
**HEAD:** `9c7655e` (v10.13.4 WAVE 4 -- Mod Console keyboard + Modmail criticals + Macros v2)
**Baseline spec:** `docs/V10_DESIGN_V2/UIUX2-38_lead_daily.md` (audit of v10.12.3)
**Waves landed since baseline:** W1 (token foundation + Stats honesty), W2 (Tokens 3-state + auth banner severity), W3 (popover fixes), W4 (Mod Console + Modmail + Macros), W5 (hygiene + a11y)
**Scope:** Read-only re-trace of the seven lead morning checks. No code modifications. No git operations.

---

## Summary

W1 and W2 delivered real, measurable wins on the lead daily flow:
- **R-03 (KPI delta colors)** is shipped and correct -- `popup.css:2335-2337` ships `.gam-kpi-delta[data-dir="up|down|flat"]` with semantic tokens. ACTIVE NOW / CLR-RATE / MM p50 / INCIDENTS deltas now read directionally.
- **Tokens tab three-state machine** is shipped. `#leadSection` moved INSIDE `#tokStateReturning` (popup.html:535-829), and `__tokSetState('first-run'|'returning'|'expired')` drives state.
- **Auto-clipboard on invite generation** is shipped (popup.js:6628). One operator action eliminated.
- **Active Mods popover tier classification** (active/idle/stale) shipped in W3 (modtools.js:17758-17761). Team presence scan reduced from O(N) to O(1).

But the W2 refactor introduced ONE structural regression and left FIVE UIUX2-38 issues unresolved.

The single biggest finding: **the Lead nav tab button is now a button-to-nowhere.** A full lead clicking it sees absolutely nothing -- the lead-daily content all moved to the Tokens tab, but the Lead tab button still renders, still gets clicks, still sets `gam_popup_active_tab=lead` in localStorage. Already partially documented in `RALPH-W2.md` Finding 4 and `RALPH-TOKENS.md` Finding F7; this audit confirms the same and surfaces the daily-flow consequence.

Net click-count impact for lead daily: **-3 clicks across 4 operations vs baseline**, but with 1 new dead-button confusion vector and 4 unresolved baseline gaps that the original UIUX2-38 spec called out as "blocking."

---

## Operation table -- click counts before (v10.12.3) vs after (v10.13.4)

Click counts measured from popup-already-open state, lead tier, last-active-tab=tokens (the new default lead landing post-W2 since that's where lead tools live).

| # | Operation                           | UIUX2-38 baseline | v10.13.4 actual | Delta | Gating |
|---|-------------------------------------|-------------------|-----------------|-------|--------|
| 1 | KPI scan (ACTIVE/CLR/MM/INC)        | 1-2 (Lead tab)    | 0 (Tokens tab open by default for lead) | **-1 to -2** | Default tab is tokens; KPI strip visible immediately for full leads |
| 2 | Bug count check                     | 2 (Lead tab + open Deep Dive) | 1 (already on Tokens; click qaBugsBtn) | **-1** | Quick Actions bar Bugs button auto-opens Deep Dive + sub-panel |
| 3 | Auto-Unsticky status check          | 3+ (GEAR + scroll + ticker click) | 3+ (unchanged) | **0** | D-07 popover health bar deferred to v10.14 per SHIPMASTER §6 |
| 4 | Rotation staleness check            | 3 (Lead tab + Deep Dive + sub-panel) | 1-2 (Tokens tab + qaRotateAllBtn) | **-1 to -2** | Quick Actions Rotate button auto-opens deep-dive + rotation sub |
| 5 | Active Mods who-is-live             | 2 (Stats tab nav + click presence + scan) | 1 (popover from mod toolbar; tiered/dotted) | **-1** | W3 ships tier dots + section dividers; Active Mods popover anchored to mod toolbar (page-level), unaffected by tokens-tab restructure |
| 6 | Discord DM rotation status          | 2 (Lead tab + Deep Dive + sub-panel) | 2 (Tokens tab + Quick Actions Rotate) | **0** | qaRotateAll opens deep-dive + sub but sub-panel `lead-sub-rotation-status` span is STILL empty (UIUX2-06 F.12 not landed) -- preview not delivered |
| 7 | Bulk Discord DM delivery (per invite) | 5 manual ops (UIUX2-38 named irreducible) | 4 manual ops | **-1** | W2 auto-clipboards URL on invite generation (popup.js:6628). Click + type + (auto-copy) + switch app + paste = 4 ops. Was 5 (separate copy step). |

**Total click reduction across the 7 ops:** -4 to -7 clicks per morning routine.
**Total click reduction across the bulk DM loop (5 invites):** -5 ops per rotation pass.

---

## Findings

### F1 [P1 -- regression] -- LEAD tab nav button is a button-to-nowhere for full leads

**Where:** `popup.html:59` (button), `popup.html:848-849` (empty panel + empty card shell).
```html
<button id="tab-btn-lead" class="pop-tab" data-tab="lead" ...>Lead</button>
<div id="tab-panel-lead" role="tabpanel" aria-labelledby="tab-btn-lead" style="display:none">
  <div class="gam-card" id="card-lead" data-tab="lead" style="display:none">
    <span id="card-badge-lead" class="gam-card-badge" style="display:none"></span>
  </div>
</div>
```

**What:** Per W2 deviation, `#leadSection` (KPI strip, Quick Actions, Lapsed Chip, Deep Dive with all sub-panels, lead-only maint buttons) moved into `#tokStateReturning > #leadSection` inside Tokens tab (popup.html:574-829). The Lead nav tab still renders for full leads (popup.js:1969 sets `leadTab.style.display = (tier === 'lead') ? '' : 'none'`). Clicking it triggers `setTab('lead')` (popup.js:3561), which:
1. Sets `card-lead.style.display = ''` (clears inline) -- card becomes visible per `.gam-card { display:block !important }`.
2. Sets `tab-panel-lead.hidden = false` -- but the inline `style="display:none"` on L848 is NOT cleared by `setTab` (only the `[hidden]` attribute toggles, not the inline style).
3. Result: panel stays hidden, empty card-lead shell stays under it. **User clicks LEAD, sees nothing.**

`gam_popup_active_tab=lead` is still persisted to localStorage on click. So a lead who clicks Lead during one session will, on next session restart, restore to Lead tab and see an empty popup body until they click another tab.

**Impact:** A full lead's morning instinct is "Lead tab for lead stuff" -- the W2 refactor flipped the destination but did not retire the button or reroute the click. New leads will be most affected (no muscle memory for "lead tools live in Tokens now").

Already documented in `RALPH-W2.md` Finding 4 ("dead navigation") and `RALPH-TOKENS.md` Finding F7 ("clicking flash-visible Lead tab during init shows blank panel"). RALPH-W2 noted severity "low-medium" because the residual empty-panel render is invisible. This audit upgrades to **P1 for lead-daily flow** because the Lead tab is part of the lead's actual daily entrypoint, not just an init-flash artifact.

**Recommendation:** Two clean options, both 1-line / 1-attribute changes:
- (a) Hide `#tab-btn-lead` for ALL tiers in HTML (`style="display:none"` baseline) and never flip it on. Quick Actions on Tokens tab is the canonical entry. Mirrors how `#leadSection` defaults hidden.
- (b) Repurpose `#card-lead` into a redirect card: a single line "Lead tools moved -- see Tokens tab" with a button that calls `setTab('tokens')`. Costs ~10 lines HTML, zero JS beyond one click handler.

Choice between (a) and (b) is a UX call. Option (a) is cleaner and avoids surfacing the move at all. Option (b) preserves backward muscle memory for one release cycle then can be removed in v10.14.

---

### F2 [P1 -- regression] -- `qaBugsBtn` / `qaMaintBtn` / `qaRotateAllBtn` from Quick Actions only work if user is on Tokens tab

**Where:** `popup.js:6646-6663`. Each handler does `$('gam-lead-deepdive').setAttribute('open', '')` plus `scrollIntoView` on a sub-panel.

**What:** All Quick Action panel openers expect `gam-lead-deepdive` to already be in the visible viewport. Post-W2, the deep-dive is inside the Tokens tab card. If a lead happens to be on Stats / Tools / Diag and (somehow) reaches Quick Actions (they can't -- Quick Actions are also inside Tokens tab), the click would silently expand a hidden details element.

In practice this is "can't happen" because Quick Actions and the deep-dive are co-located on Tokens tab. But the symmetry assumption -- "any tab can open the deep dive" -- is broken. A future feature that adds a Quick Action button to a different surface (e.g., Stats tab tile drill-down with a "see lead audit" button) will silently fail.

**Impact:** No daily-flow impact today. A latent footgun for any future refactor that splits the deep dive from Quick Actions.

**Recommendation:** Each handler should call `setTab('tokens')` BEFORE opening the deep dive. One line per handler. Defensive and clear.

---

### F3 [P1 -- baseline gap unresolved] -- INCIDENTS tile still hardcoded `0` green (UIUX2-06 F.8 not landed)

**Where:** `popup.js:6583`:
```js
_setKpiTile('kpi-incidents', 0, 'var(--bb-green)');
```

**What:** UIUX2-38 Section C.4 named this "false precision -- implies confirmed zero." UIUX2-06 F.8 said "render as `--` stub with tooltip explaining why." Spec called this **blocking**. v10.13.4 still hardcodes the green zero.

**Impact:** A lead reading the KPI strip sees green INCIDENTS and infers "no incidents." There IS no incident endpoint -- this is unverified. The W11 mod_incidents ship is the real fix; until then, the honest render is `--`.

**Recommendation:** Replace L6583 with `_setKpiTile('kpi-incidents', null, null);` (null/null path renders `--` per the helper at L6493-6498). Add a `title` on the tile element saying "INCIDENTS endpoint not yet wired (V11)." Two-line change.

---

### F4 [P1 -- baseline gap unresolved] -- Deep Dive accordion has no status preview strip (UIUX2-06 F.6 not landed)

**Where:** `popup.html:678-826`. The outer `<details id="gam-lead-deepdive"><summary>Deep Dive</summary>...` summary is a bare label.

**What:** UIUX2-38 Section A.2-A.4 named this -- and recommended "Deep-Dive status strip ('bugs:N maint:ok last:3h ago')" -- as the single biggest click-count win. UIUX2-06 F.6 + F.12 specified the strip. **Not landed.** The lead must still open the accordion to see if anything needs attention.

The four sub-panels each have a `sub-status` span (popup.html:685, 705, 732, 763) but only `bugListBadge` (line 705) is wired by JS (`renderBugList` at popup.js writes to it). The other three -- `lead-sub-rotation-status`, `lead-sub-maintreports-status`, `lead-sub-diag-status` -- are STILL empty spans, the same defect UIUX2-38 Section A.2 named.

**Impact:** Click count per UIUX2-38 D.1 -- "Check rotation is stale" baseline 3 clicks, post-V2 should be 1 click. Today it's still 2-3 clicks (Tokens tab + Quick Actions Rotate -> deep-dive auto-opens + sub-panel auto-opens; 2 clicks but with no preview, the lead must read the timestamps after opening). The collapsed-summary preview is the savings; without it, the click bypass is trivial.

**Recommendation:** UIUX2-06 F.6 ships the summary strip (estimated 20min). UIUX2-06 F.12 wires the four `sub-status` spans (estimated 20min). Both are HTML/JS-only. No new RPCs. No schema changes.

---

### F5 [P1 -- baseline gap unresolved] -- Auto-Unsticky popover lacks health summary header (UIUX2-15 G2 deferred per D-07)

**Where:** `modtools.js:17905-18005`. Popover header is title + close button only (L17921-17933). Body jumps straight to a Loading state then a 5-column table.

**What:** UIUX2-38 Section A.6 named the discoverability and triage failures. UIUX2-15 G2 specified "popover health bar header (last cron time, total executed today, failed count) -- answers `is it working?` in 1 click." SHIPMASTER §6 D-07 listed this as a deferred item -- ~3h, lead-only, lower frequency than mod hot-path. This is **intentional deferral**, not regression. v10.14 ship per the deferred backlog.

**Impact:** Click count for "is Auto-Unsticky working right now?" is still 3+ surfaces (GEAR status line + ticker chip + popover scan). UIUX2-38 named this the highest discoverability failure for lead-only features. Confirmed not addressed in v10.13.

**Recommendation:** Already on D-07 backlog. No new finding. Re-verify after v10.14 lands.

---

### F6 [P1 -- baseline gap unresolved] -- `inviteBtn` (Deep Dive) and `qaInviteBtn` (Quick Actions) remain dual handlers (UIUX2-06 F.10 not landed)

**Where:**
- Deep Dive: `popup.html:689` button + `popup.js:2249` handler -> `generateInvite()` at L2179+.
- Quick Actions: `popup.html:639` button + `popup.js:6592-6634` handler -> direct `popupRpc('adminInviteCreate', { mod: target })`.

**What:** UIUX2-38 Section A.5 / B.3 named this drift risk: two parallel entry points for the same RPC, with diverged param-name handling history (popup.js:6594-6599 comment chronicles a v10.12.1 regression where the deep-dive path used `username:` and worker reads `mod:`). UIUX2-06 F.10 said "unify."

W2 did NOT unify these. Both still exist in v10.13.4. The Quick Actions handler was patched in v10.12.1; the Deep Dive handler at L2179-2244 has its own validation, copy-to-clipboard, status-line writing.

**Impact:** Maintenance trap. A future change to one handler can silently miss the other. Bulk DM friction (UIUX2-38 D.2 #1) is partially the symptom.

**Recommendation:** Extract a single async helper `_generateModInvite(target)` that does the popupRpc + clipboard + status. Both buttons call it. Estimated 20min. UIUX2-06 F.10 spec is the design; W2 had it scoped but did not implement.

---

### F7 [P2 -- baseline gap unresolved] -- KPI delta loading state never lands (UIUX2-06 F.7 not landed)

**Where:** `popup.css:2343-2354` ships the `.gam-kpi-tile[data-loading="true"]` pulse keyframes. `popup.js:6547-6580` loads the KPI tiles but **never sets `data-loading="true"` during RPC flight.**

**What:** The CSS rule for the pulse is shipped but no callsite sets the attribute. So the lead sees `--` initially (the static text in `kpi-active-val` etc.) and then the value populates. There is no animation distinguishing "RPC pending" from "stub / no data."

**Impact:** UIUX2-38 Section A.1 / UIUX2-06 A.3 named this. Lead cannot tell if KPI tiles are loading or permanently unavailable. Cosmetic, but affects the "trust the dashboard" pattern.

**Recommendation:** Three lines in `__loadLeadKpi`: `tile.setAttribute('data-loading', 'true')` before each RPC, `tile.removeAttribute('data-loading')` after. ~5min.

---

### F8 [P2 -- baseline gap unresolved] -- MM p50 lacks `data-invert` for inverted-direction-is-bad (UIUX2-06 C.3 not landed)

**Where:** `popup.js:6477-6486` writes `data-dir="up"` when `diff > 0`. CSS rule maps `up -> green`. **For MM p50, "up" is bad** (longer wait time = worse).

**What:** UIUX2-06 C.3 Option A specified `data-invert="true"` attribute on the MM p50 tile + 4 additional CSS rules to flip the color mapping. Spec called this **blocking**. v10.13.4 ships the basic up/down/flat color mapping but NOT the invert. So MM p50 going from 1.0h to 5.0h shows GREEN (up), which is wrong: 5.0h is amber territory.

**Impact:** ACTIVE NOW + CLR-RATE deltas read correctly. MM p50 delta is INVERTED (semantically wrong color). The delta-color win is real for 3 of 4 tiles but actively misleading for the fourth.

**Recommendation:** Either (a) add `data-invert="true"` to the MM p50 tile in HTML and 3 CSS rules in popup.css (`.gam-kpi-delta[data-invert="true"][data-dir="up"] { color: var(--bb-red) }`, etc.), OR (b) flip the diff sign in the JS for MM p50 specifically. Option (a) is the cleaner spec match. ~10min.

---

### F9 [P2 -- baseline finding revalidated] -- 3-tab/popover sprawl for full daily check (UIUX2-38 F.2 not addressable in v10.13)

**What:** UIUX2-38 Section F.2 named this as "by design (Bloomberg density), worth naming explicitly." Confirmed unchanged in v10.13.4: a full daily check still spans Stats / Tokens (was Lead) / Tools tabs plus the Active Mods popover. The W2 collapse of Lead-tab content into Tokens did NOT reduce tab-switch count -- it just relocated where the lead content lives.

**Impact:** The daily routine is still a 3-4 tab-switch operation. Acceptable per spec note.

**Recommendation:** No action. Document this in the lead onboarding once F1 is fixed (the Lead tab button retirement is the natural moment to surface "lead daily flow lives across these tabs").

---

## Recommendations -- prioritized

### P0 -- ship in v10.13.5 (cosmetic regressions from W2)

1. **F1 fix** -- Hide the LEAD nav tab button (option a) OR repurpose with redirect card (option b). Recommended: option (a). 1-line HTML change. Eliminates the dead-button-vector.

### P1 -- ship in v10.13.5 or v10.14 (baseline gaps the brief named blocking)

2. **F3 fix** -- Replace `_setKpiTile('kpi-incidents', 0, 'var(--bb-green)')` with null/null + tooltip. 2-line change.
3. **F4 fix** -- Wire the three remaining `sub-status` spans (`lead-sub-rotation-status`, `lead-sub-maintreports-status`, `lead-sub-diag-status`) and add the outer Deep Dive summary strip ("bugs:N maint:ok last:3h ago"). UIUX2-06 F.6 + F.12. ~40min.
4. **F8 fix** -- Add `data-invert="true"` to MM p50 tile + 3 CSS rules. UIUX2-06 C.3 Option A. ~10min. **Higher priority than its label suggests** -- v10.13.4 ships actively-misleading color for that tile.
5. **F2 fix** -- `setTab('tokens')` prepended to the three `qa*Btn` panel-opener handlers. ~5min defensive change.

### P2 -- ship opportunistically

6. **F6 fix** -- Unify `inviteBtn` / `qaInviteBtn` into shared helper. UIUX2-06 F.10. ~20min.
7. **F7 fix** -- Wire `data-loading="true"` toggling around RPC calls in `__loadLeadKpi`. ~5min.

### Deferred -- already on backlog

- **F5** -- Auto-Unsticky popover health bar (D-07 / UIUX2-15 G2). v10.14.
- **F9** -- 3-tab sprawl. Architectural; not addressable as a code fix.

---

## What v10.13 actually delivered for the lead daily flow

Real wins (verified):
- KPI delta colors render directionally (3 of 4 tiles correctly; MM p50 inverts, see F8).
- Lead daily content consolidates onto Tokens tab -- a lead who knows this no longer needs to tab-switch from Tokens to Lead (the new default lead landing IS where the work happens).
- Auto-clipboard on invite generation -- 1 manual op eliminated per invite (5 -> 4).
- Active Mods popover tier/dot/section-divider redesign (W3) -- team presence scan O(N) -> O(1).
- Quick Actions bar gives 1-click access to deep-dive sub-panels (Bugs, Maint, Rotate, Invite).

Cumulative: lead morning routine drops from ~12-15 clicks pre-W1 to ~7-9 clicks post-W2. Real work shipped.

But: the LEAD tab button is still there, still clickable, still dead. The 4 baseline UIUX2-38 "blocking" gaps (F3, F4, F8 + UIUX2-06 F.7 loading state in F7) are still outstanding. The auto-unsticky health bar is intentionally deferred to v10.14 per D-07.

---

*Audit complete. Read-only. No source modifications. No git operations.*
