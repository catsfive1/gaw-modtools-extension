# UX/UI Usability Audit — v10.37.1 (2026-07-07)

Four-specialist re-audit (UX workflow / UI design / keyboard-a11y / IA-settings)
run against the CANONICAL tree `D:\AI\_PROJECTS\gaw-modtools-extension` at
v10.37.1. An earlier same-day pass accidentally audited the STALE
`modtools-ext` v8.0.0 copy; every finding below was re-verified against the
live code. Line numbers are v10.37.1 (commit 89a0fbd).

## Confirmed FIXED since v8 (do not re-litigate)

- All three token data-loss classes: settings-write token clobber (per-key
  merge-write + read-back, modtools.js:2085), session-only tokens
  (AES-GCM durable local + IDB backup + boot self-heal), lead-save wiping
  team token (partial-update setTokens).
- Snack system: tiered durations, stack-of-4, dismiss, aria-live.
- Quick perma-ban: preflight + audit chain + Tier-A 20s undo.
- DOM-drift: self-healing selector fallback.
- Focus architecture: installFocusTrap (init focus, Tab cycle, focus
  return), role=dialog everywhere, global :focus-visible amber ring,
  popup :focus-visible coverage.
- Popup literal `—` bug, missing :disabled/.loading states, inline
  stat colors.

## P0 — trust & targeting (BUILD BRIEF, see spec below)

| WS | Finding | Location |
|----|---------|----------|
| 1 | NBA APPROVE shows success without checking `r.ok` (api helpers resolve `{ok:false}`, never throw); `withUndo` returns SILENTLY on `!result.ok` so NBA REMOVE/SPAM/STICKY give zero feedback on HTTP failure | modtools.js:6820 (approve), 8026-8028 (withUndo) |
| 2 | Consent modal header says "Everything below is OFF until you opt in" while all 5 cloud-upload checkboxes render pre-checked — one click opts into presence/evidence/crawl | modtools.js:29288 (header) vs 29301 (checked) |
| 3 | Ctrl+Shift+B/R/X/P/W/C act on invisible `hoveredItem` (no outline anywhere); bare-key A/R modmail acts on `hoveredMail` whose highlight is opt-in default-OFF (`mailHoverHighlight:false` :1705) | modtools.js:14424-14438, 14462, 13732, 13737 |
| 4 | Popup Safe Mode toggle input is `display:none` — removed from tab order; the panic control is keyboard-unreachable | popup.html:310 |
| 5 | Intel Drawer cannot be opened by keyboard from triage rows — username is a click-only span (header hint says "Click username") | modtools.js:17190-17204 |

## P1 — regular friction (v.next after P0 cut)

1. ~20 native `confirm()`/`prompt()` on live action paths despite the code's
   own note that Brave can silently block them in content scripts (blocked
   dialog = silently dead button): 12043, 12693, 12746, 12995, 14079, 16763,
   16917, 18369, 18751, 21015, 25043, 28241, 30491-30499 (immune-posts
   type-a-number prompt menu), popup.js:2459 (invite prompt in MV3 popup).
   Sweep-replace with existing `preflight()` / `_gamAuxConfirm` / inline fields.
2. Preflight modal fires on EVERY ban incl. undoable timed bans, PLUS a
   blocking "Preflight check..." RPC before send (11073-11087, 11130-11139).
   Skip client modal for duration>0 (undo toast is the net); run the RPC
   concurrently with evidence capture.
3. Batch ban: no progress counter, snack stack caps at 4 so a 29-user batch
   scrolls failures away, no end summary naming failed users (16781,
   9040-9096; also GOD MODE aux:2315). One persistent progress toast +
   named-failures list.
4. Title-grant = 3 chained type-a-word modals; flag-user = 2 (11971-12025,
   12062-12095). One modal, preset buttons, inline expiry.
5. `features.modmail` has NO surface anywhere (absent from consent modal
   list :29278-29284 AND panel) → Inbox Intel modmail upload permanently
   dead for every install (:1782, :31753).
6. Re-consent impossible: `consentShown` one-shot (:29273), popup Reset
   PRESERVES it (popup.js:6317); presence/evidence/bugReport have no panel
   rows; error copy points at rows that don't exist (:29758). Add the
   missing addFeatureToggle rows + "Review cloud permissions" button.
7. Split-brain settings store: hydrate only fills NULL localStorage keys
   (:5113), so on hardening-OFF installs popup Repair/Reset/Import silently
   no-op forever. Overwrite on schema/repair marker mismatch.
8. `autoRefreshEnabled:true` 60-min auto page reload with zero UI (:1706,
   :30886). Add Display-card toggle.
9. Undo is single-slot (`_setUndoSlot` :8030) — rapid actions orphan earlier
   undos. Stack of 3.
10. Popup CSS = two stacked design systems: legacy cool-gray layer (L1-990)
    never deleted under the Bloomberg `--bb-*` layer; 505 `!important`;
    5 :root blocks; warm/cool gray seam + sans/mono font seam mid-popup.
    One demolition pass: delete legacy layer, port survivors to `--bb-*`.
11. Contrast: #5c6370 at 9-10px fails AA in popup (section labels, token
    status/hints, version chip) AND injected TEXT3 (modtools.js:401, Sentinel
    dashboard, chat timestamps). Bump to ~#7a8290 / `--bb-ink-dim`.
12. z-index inversion: chat context menu z:10000005 (:18715) renders UNDER
    the 99999996 popover band; range spans 9999980→2147483647 with no scale.
    5-band token scale in GAM_TOK.
13. Triage collapsible section headers click-only divs (16852-16861) — copy
    the shipped settings-card-header pattern (13270). Strip dropdowns don't
    close on Escape / don't focus first item (12526-12530; add to the 14374
    global handler). SUS popover row expand click-only (22067).

## P2 — polish backlog

- Six cssText popover shells drift from GAM_TOK (21221, 21522, 21711, 21833,
  22656, 23180, 23524) → one `_gamPopShell()` builder.
- popup.js third styling channel: 60+ hex writes incl. off-token #E8A317 ×4.
- 176 inline style= attrs in popup.html incl. fully-inline first-run wizard
  (548-601) and inline backgrounds that kill .pop-btn states (667-674).
- No :active pressed state on .pop-btn; .loading is opacity-only.
- Programmer language in operator UI: "Super-Mod Foundation", "Default DR
  Hours", "Possible Tards Threshold", version-prefixed descs (13456...).
- Session expiry surfaced as a 6px dot — deserves a status-bar banner with
  a Log-in link on expiry (23958).
- `sniffEnabled` dead control path (toggleSniff message nothing sends, :1678).
- v8.0 flag cluster (teamBoost/shadowQueue/park/precedentCiting/uxPolish/
  thresholds.*) live consumers, no UI — lead-gated rows or delete.
- `autoUnstickyEnabled` default still true (UI now exists; consider default
  false for fresh installs).
- Theme Harmony toggle: needsReload affordance instead of silent no-op.
- Popup→in-page-panel bridge: one "Behavior settings" button messaging
  openSettings to the active GAW tab (gear + `s` hotkey undiscoverable).
- Extension-reload recovery: route through chrome.runtime.reload() in SW.
- Right-click context menu roving focus; cluster-clear ✖ → button.
- Popup hosts a 5-tab settings app in 380px — consider moving wizard +
  Lead/Diag to an options page long-term.

## P0 BUILD SPEC (v10.37.2)

House conventions apply: node --check after every edit; one smoke test per
WS in scripts/ following the existing `_*_smoke_test.mjs` slice-the-real-
function pattern (no jsdom, hand-rolled DOM stubs); full suite must stay
green; single version bump 10.37.1→10.37.2; one commit; build-zip.ps1 after.

- **WS-1 (truthful quick actions):** in the NBA APPROVE handler (:6820)
  capture the api result and branch: `r&&r.ok` → success snack, else
  `snack('Approve FAILED: '+(r&&r.error||'network'), 'error')` and do NOT
  close the panel. In `withUndo` (:8026-8028) replace the silent return on
  `!result.ok` with an error snack naming the action + reason. Do NOT touch
  the Death Row pipeline or preflight paths.
- **WS-2 (honest consent):** remove `checked` from the consent checkbox
  template (:29301) so defaults match the stated contract. No other modal
  changes.
- **WS-3 (visible keyboard targets):** (a) whenever `hoveredItem` is set
  (:13732) add class `gam-kb-target` to it and remove from the previous;
  inject CSS `.gam-kb-target{outline:1px solid rgba(240,160,64,.55);
  outline-offset:2px}` via the existing stylesheet injector. (b) modmail:
  add `.gam-mail-hover` on hover ALWAYS while bare-key shortcuts are armed —
  decouple from the `mailHoverHighlight` setting (that setting keeps
  controlling only the stronger cosmetic highlight). Zero behavior change
  to what the keys DO.
- **WS-4 (Safe Mode reachable):** popup.html:310 change the input from
  `display:none` to visually-hidden-but-focusable (opacity:0;position:
  absolute;width:1px;height:1px) and add
  `#safeModeToggle:focus-visible + <track selector>{outline:2px solid
  var(--bb-amber);outline-offset:2px}` in popup.css. Verify the label
  still toggles on click.
- **WS-5 (keyboard drawer):** `.gam-t-user-name-text` (:17190-17204) gets
  `role="button" tabindex="0"` + keydown Enter/Space calling the same
  handler as click. Update the header hint text (:17500) from "Click
  username" to "Click or Enter on username".

HI-1 guard: none of these touch ban execution paths; WS-1 only ADDS error
reporting. No new RPCs, no deploy needed.
