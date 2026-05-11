# GAW ModTools — CHANGELOG

Versioned summary of recent work. Detailed commit history: `git log --oneline` in this repo.

## v10.14.x — Polish + Migration Cycle (2026-05-10)

**v10.14.2 Wave C** (`61a035e`) — Mod Console Tier 1 keyboard ergonomics (NOTE char counter + sort label; BAN duration shortcuts `p/7/3/w/0`; MESSAGE subject collapse; repeat-offender red modifier; Ctrl+Enter armSeconds=0 bypass; dead `.gam-mc-tab-danger` purge). Modmail panel scroll-triggered pagination via IntersectionObserver (capped at worker `limit:50`); first-cycle ambient prefetch warms 10 threads; popover draft cache race fixed + "Drafts restored" chip; Mark SUS state-aware; UNBAN ghost link conditional on banned status. Recovery: orphan banner sync textarea flush; undo expiry visible snack. First-run: wizard username live validation hint. Lead daily: 3 deep-dive sub-status spans wired (rotation/maint/diag); `inviteBtn`+`qaInviteBtn` unified `_handleInviteClick`; 3 qa* handlers prepend `setTab('tokens')`. 16/16 ACs PASS, +362 net diff.

**v10.14.1 Wave B** (`1c935a9`) — Token system migration: 3 orphan CSS tokens + 4 const-C amber aliases purged; `#ff9933` modtools.js **71→7** (-64 sites, -90%); `#f0a040` 12→3; `#E8A317` 9→3; `#4A9EFF` popup.css 15→3. 6 brand-site `C.ACCENT→C.AMBER` migrations. CI guard `scripts/check-no-raw-hex.sh` installed. Focus traps + ARIA: `showModal()` traps Help/Settings/ModLog/BugReport; 6 popover roots `role=dialog + aria-modal`; status-bar triggers `aria-haspopup + aria-expanded`; SUS popover unified `_installPopoverTrap`. Click-targets: `.gam-crawl-pill` + `.pop-maint-action-row` + `.gam-mc-tab` + `.gam-modal-tab` + Safe-Mode toggle + `.gam-modal-close` all bumped to 32px; 3 inline `min-height:0` strips. PRM motion gates: `gam-sh2-blink`, `gam-ee-fade` (class-based `.gam-ee-flash`), `gam-pulse` (newly defined), inline modmail panel transitions migrated to PRM-gated CSS, ticker `setInterval` checks PRM. Copy: 3 popup.js callsites + `maintDiagExport` migrated to `copyWithPulse`; finally cleanup; Layer 2 await. 24/24 ACs PASS, +110 net diff.

**v10.14.0 Wave A** (`af882cf`) — Stats v2 polish: Auto-UNS 8th tile wired to `modAutoActionRecent` (no more dogfood transplant); threshold-driven `data-state`; DR tile color (purple/info via `--bb-cyan`); CSS dedup; KPI loading-pulse; dr-alert reset. Macros HTML scaffold rewrite (no emoji/dup labels/inline styles); max-height slide; 3-button sort + persistence; AI panel purple chrome; KIND radio toggle; LABEL/BODY char counters; SVG icons; AI/edit mutex. Tokens/Auth: dead `removeAttribute('open')` purge; `restartSetupWrap` un-gated for mods; auth banner setup color shifted to blue (no longer amber-vs-amber collision); whoami late-resolve recovers; storage.onChanged auto-dismiss; SW-restart text differentiated. 21/21 ACs PASS, +399 net diff.

**Parallel polish:**
- (`54ad3ae`) `invite-mod.ps1` V14-FR1+FR2 — Drive-share blocking gate (forces operator confirmation before script exits) + Path B (manual ZIP) flipped to default-recommended in DM text. Closes RALPH-FIRSTRUN FP-NEW-1 (silent-failure mode introduced by the original v10.13 invite-mod.ps1 ship).

**Verdict:** RALPH AUDIT corpus (`e69f72b`, 1/12 agents survived rate-limit + Sonnet self-conducted synthesis) → ZERO P0/HIGH findings. v10.14 cycle SHIP-QUALITY. Token drift trajectory reversed (combined raw amber sites 92→13, **-86%**). PRM coverage 88%→~96%. Click-target compliance 61%→~95%. TTFS 22-23min → ~21-22min median; 45-90min → 40-80min solo-from-docs tail.

---

## v10.13.x — DESIGN V2 SHIPMASTER Cycle (2026-05-10)

**v10.13.5 RALPH HOTFIX** (`c06c5a6` + worker version `24f9447c`) — 5 P0s + 16 P1s closed in one focused commit driven by the 20-agent ralph audit + Opus synthesis. P0s: `rotated_at` age dogfood (3-agent corroboration) → fallback to `workerModToken_issued_at`; Stats ghost-box deltas → `.pop-stat-delta:empty {display:none}`; click-target hit-stealing → `::after` vertical-only inset + horizontal padding bump; snack action UNDO keyboard reachable → focus moves to action button + scoped ESC; `copyWithPulse` double-click race → timer guard + sticky origLabel mirrored in both popup.js+modtools.js. P1s: Lead tab dead nav killed; Firehose ARMED state wired (**worker patched** to emit `firehose_d1_count`); TTL contract split fixed (24h read AND purge); 5 popover focus traps installed; 16 content-script button classes 32px; hover-to-touch gate; macros PRM countdown text fallback; 4 macro-draft local-mirror reads (W4 modmail pattern mirrored); SUS Unmark `withUndo` Tier B; MM p50 invert color; INCIDENTS placeholder honesty; `.pop-stat-val` typographic base restored + wired to `--bb-t-stat-md` orphan token; OP DELETES filter persistence. 21/21 ACs PASS.

**v10.13.4 Wave 4** (`9c7655e`) — Mod Console keyboard ergonomics (1-6 tab keys + Ctrl+Enter submit per tab + BAN tab danger class + UNBAN ghost link demotion + OP DELETES time filter + per-row Open post/Open console buttons). Modmail criticals: `gam-mm-bar` `[Mark SUS]` + `[DR 72h]` buttons (eliminating Mod Console detour for cross-surface chain); panel cold AI shimmer; draft local-mirror reads on session miss; prefetched track-response wiring; intel strip race guard; send button emoji preserve. Macros v2: inline 4s delconfirm replaces `window.confirm` x2; AI suggestion review panel; duplicate `.gam-macro-tab-active` removed; filter bar; hover-revealed action trio. 28/28 ACs PASS.

**v10.13.3 Wave 2** (`60bf175` + cleanup `6925ca2`) — Tokens tab three-state machine (First Run / Returning Mod / Returning Lead) eliminating flash-of-wrong-content; `#claimInviteWrap` absorbed into State A; `#leadSection` moved inside State C; 5 new tok-* CSS blocks. Auth banner: 4 severity tiers + auto-attempt-before-show + `whoami_empty` + `short_token` reasonSteps branches. First-run wizard success: `Open greatawakening.win` button. 15/15 ACs PASS.

**v10.13.2 Wave 5** (`722bcf7`) — Hygiene + a11y: click-target compliance (32px AA-tight tap zones via `::after` overlays); `copyWithPulse` utility (3-layer fallback + 1200ms COPIED + green flash); PRM motion gates on 4 keyframes (`gam-arm-fill`, `gam-dr-cd-pulse`, `gam-ai-skeleton::after`, `.gam-sh2-feed-shimmer`); error message remediation w/ `hint:` fields; empty-state factory API alignment (`ctaFn || ctaAction`); 6 `renderEmptyState` callsites migrated. 26/26 ACs PASS.

**v10.13.1 Wave 3** (`4927aea`) — Popover fixes pack across 5 surfaces (SUS chevron reset + dead `[DR Rule]` btn wired + Unmark on collapsed strip + DR 72h label + focus trap; DR Cancel All snapshot bug + 2-step confirm + band re-eval + 90min countdown + undo toast via extended snack; Queue `/mod/queue` route; Health firehose flicker + WebKit scrollbar + 999+ cap + ARMED state; Active Mods tier classification + sort + segmented control). Snack utility extended with `actionLabel`/`onAction`/`actionDurationMs`. 39/39 ACs PASS.

**v10.13.0 Wave 1** (`93e96fc`) — Token foundation (5 CSS tokens + `C.TEAL` declared schema-only); Stats honesty (ghost sparkline + ghost delta DOM cleared, delta chips wired via sessionStorage diff, AI tile honest empty state, Death Row SVG warning replaces skull emoji); status bar severity weight `!important` removal (5 of 7 weight tiers were inert); 4 Loading... strings stripped; 3 off-grid 5px → 4px. Repairs 5 of 19 v1-spec regressions. 11/11 ACs PASS.

**Foundation:**
- (`f297791`) `invite-mod.ps1` — one-command invite flow for new testers (wraps provision-mod-token logic + builds DM-ready text + writes to dedicated file)
- (`c6512e8`) `loadSecrets()` singleton-promise wrapper recovered from orphaned v10.12.3 Vanguard audit-2 #4

**v10.13 cycle metrics:** 6 waves shipped (W1+W3+W5+W2+W4+RALPH HOTFIX), ~+2983 cumulative net lines diff, 140/140 acceptance criteria PASS, 15 of 19 v1-spec regressions repaired (R-01..R-17 less the 4 deferred to v10.14: R-11 Maintenance, R-18 token migration, R-19 motion tokens, R-16 DR batch ops).

---

## v10.12.x — Performance Pass + Diag IDB Hotfix (2026-05-10)

- **v10.12.4** (`cff7e94`) — Diag tab IDB read regression hotfix (popup `renderDiagTab` was reading stale `chrome.storage.local.get('gam_diag_log')` after v10.12.3 PA.3 IDB migration; rewired to `diagReadRecent` RPC with legacy fallback)
- **v10.12.3 PERFORMANCE PASS** (`6f1b150`) — 12 red-team wins across SW/modtools/popup (PA.1 alarm jitter, PA.2 InitPromise gating, PA.3 diag IDB migration, PA.4 settings coalescer, PB.1 crypto.randomUUID, PB.2 LRU seen-set, PB.3 MutationObserver consolidator, PB.4 SUS decoration scoping, PB.5 Intl.RelativeTimeFormat, PC.1 recursive secret masker, PC.3 4 export call sites wrapped)
- **v10.12.0..v10.12.2** (`f3d6ff3`..) — Design redesign 11-integrator fan-out from 20-agent UIUX ralph

## Earlier (v9.x + v10.0-v10.11)

See `git log --oneline` for the full pre-v10.12 history including v10.11 anti-fragile V2 (token encryption + structured logging + CSP hardening), v10.10 persistent auto-unsticky, v10.6-v10.9 SHIP-IT-ALL waves + GALAXY DELIVERY, v10.3-v10.5 mass ralph wave, v10.0-v10.2 V10 architecture, and the v9.x Bloomberg Terminal aesthetic foundation work.

Worker history: `cloudflare-worker/CHANGELOG.md` if maintained separately, else `git log` in the worker subdirectory.

---

## Version + Drive distribution

- **Auto-update banner** fires on any installed extension when `gaw-mod-shared-flags/version.json` (main branch) updates. Latest: `10.14.2`.
- **Manual ZIP:** `E:\My Drive\GAW\mod-tools\gaw-modtools-LATEST.zip` (refreshed on every wave ship).
- **Worker side:** `gaw-mod-proxy` on Cloudflare. Last deploy `24f9447c` (v10.13.5 P1-03 `firehose_d1_count`).
- **GitHub:** `gaw-modtools-extension` (modtools-ext code) + `gaw-mod-shared-flags` (auto-update banner trigger).
