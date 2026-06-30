# GAW ModTools — Features Matrix v10.31 (requested vs delivered)

**Generated:** 2026-06-26 · **Branch:** `inpage-ui-storm` @ ef47804 (v10.31.0) · `master` frozen @ 633dcbb (v10.29.0, tag `safety/v10.29.0-pre-ui-storm`)
**Source:** 6-agent grounded analysis of git/CHANGELOG/handoffs/docs (run `wf_1326c24d-9b1`). Supersedes `FEATURES_MATRIX_v10.5.md` for current status.

> **The week in one line:** a design-led redesign that went *forward and backward at once* — 06-19 shipped all 13 `inpage-ui` work-packages (a real token system + a11y) but skipped two named asks and left a family of silent-success no-ops; 06-22 a 21-agent UI-STORM caught and fixed them on an isolated fork. `master` is frozen as the rollback baseline.

---

## 1 · The week's work

### 1a. `inpage-ui` redesign — 06-19 (WP-01..WP-13, all shipped)
A 20-token `GAM_TOK` system replacing ~193 hardcoded hex literals + z-ladder + elevation contract + Mod Console a11y. Each WP had a same-day review-fix pass.

| WP | Component | Status | Evidence |
|---|---|---|---|
| 01 | GAM_TOK tokens + :root mirror + z-ladder + PRM/focus/elevation foundation | ✅ | `ec0e81a`,`2ea08db` · modtools.js:4424, :24090-24410 |
| 02 | Mod Console shell/tabs/backdrop (+ dead active-tab fix, role=tablist) | ✅ | `5e08867`,`76b9fc3` · :8267, :8834 |
| 03 | Toasts / snacks / undo (severity keyline + aria-live ×7) | ✅ | `178f253`(+`74a0109`) · :4796, :8085, :7714 |
| 04 | Modals (text/bug/park/precedent) | ✅ | `63b848b`(+`c4b179f`) · :2900, :3775 |
| 05 | Ban tab + custom history (segmented duration) | ✅ | `5aac21a`(+`173ad30`) · :9851, :10334 |
| 06 | Intel tab (two-column token cards) | ✅ | `4060b22`(+`1975f8f`) · :9190 |
| 07 | Note tab + mod note + history | ✅ | `83195e7`(+`c363e4c`) · :10870, :9382 |
| 08 | Badges (shadow/repeat/senior/new/park) | ✅ | `61c2c13` · :3384, :6801 |
| 09 | Skeleton loaders + empty states | ✅ | `7c81bfe`(+`d65d2a2`) · :4452, :4525 |
| 10 | Content sections (user/post/thread/queue) | ✅ | `dea841b` · :6767 |
| 11 | Command palette + action-picker HUD | ✅ | `ac29c1b`(+`e3e7c14`) · :5462, :5804 |
| 12 | Triage console (alerts/stats/toolbar/batch) | ✅ | `88c5a36` · :15321, :24664 |
| 13 | Top banners (auth-fail, ext-orphaned) | ✅ | `4e65bcc`(+`c7b3b09`) · :29965, :7964 |

### 1b. UI-STORM — 06-22 (ranked top-15 across 3 waves; `docs/UI-STORM-2026-06-22.md`)

| # | Item | Wave | Status | Evidence |
|---|---|---|---|---|
| 2 | Kill "web page in toolbar" artifact (`_gamLinkPreviewEl` orphan) | 1 | ✅ shipped | `317300b` · :18078, closeAllPanels :8017 |
| 1 | Gate thread-watch snacks on `r.ok` + SUS live rewire | 1 | ⚠️ **pt1 shipped**, Ban/Watch wiring deferred (HI-1) | `b6dd92c` · `modSusMark` bg:3087 · smoke 11/11 |
| 11 | Modmail wrong-user on thread-switch | 1 | ✅ shipped | `97321f5` · `enhanceModmailRead` :14246 |
| 7/8 | Scope feed-strip injection + debounce 5 observers | 3 | ✅ shipped (v10.30.0) | `84a97e4` · smoke 5/5 |
| — | Profile content-eating root-cause (/u/me, /u/catsfive) | hotfix | ✅ shipped (v10.31.0) | `ef47804` · `_isProfileViewNow` :17837 · smoke 16/16 |
| 6 | SM-Watcher overlay dismissable + z-drop | 1 | ❌ deferred (P2) | UI-STORM doc |
| 3 | Group ~32 bar children → ~5-6 labeled category buttons | 2 | ❌ **GATED** (taxonomy) | UI-STORM doc L27-32 |
| 4 | Live-count chips as visible pills (out of menus) | 2 | ❌ gated behind #3 | UI-STORM doc |
| 5 | Horizontal viewport clamp on shared upward-menu helper | 2 | ❌ prereq for #3 | UI-STORM doc |
| 9 | Accessible name on every bar control | 2 | ❌ gated with #3 | UI-STORM doc |
| 10 | Category buttons as real ARIA menu-button widget | 2 | ❌ gated with #3 | UI-STORM doc |
| 13 | Drop bar to `bottom:8px` (re-anchor snacks/accordions) | 2 | ❌ gated with #3 | snacks :8383, accordions :23818 |
| 12 | Passive "last 3 actions" strip on bar | 3 | ❌ deferred (P2) | UI-STORM doc |
| 14 | Close `innerHTML` title XSS gap | 3 | ❌ deferred (P1 sec) | :8488 |
| 15 | Collapse two racing `--bb-*` :root blocks | 3 | ❌ deferred (P2) | GAM_CSS :25705 vs :27074 |

**Storm scorecard:** 5 shipped (incl. content-eating hotfix) · 1 partial · 9 deferred/gated. 7 candidates rejected as fluff.

---

## 2 · Standing feature inventory (areas A–L)
Counts carried from `FEATURES_MATRIX_v10.5.md`, status reconciled to current.

| Area | Shipped | Status / notable open |
|---|---|---|
| **A. Auth & token pipeline** | 20/26 | multi-lead migration 032 live; deferred: PH-2/3, allowlist, 2FA (cut) |
| **B. Mod actions** (ban/remove/warn/note/DR/macros/undo) | 18/27 | `ai_used`/`ai_tone` flags inert; ban-preflight orphaned; **auto-unsticky regressed since v8.6.4** |
| **C. Modmail** (ingest/backfill/AI replies/3-col) | 15/23 | open: confidence scoring, auto-send, subject similarity |
| **D. Mod chat** (panel/rate-limit/edit-delete) | 2/13 | 11 open — CHAT-1..10 power features (Live Cards, slash cmds, incidents, huddles) |
| **E. Triage / Death Row / SUS / Firehose** | 18/25 | brigade blocked on migrations 043/044; firehose still opt-in |
| **F. Audit / Merkle / Precedent** | 10/15 | **HMAC backfill of 459 NULL-hmac rows pending (TIER-1)** |
| **G. AI integrations / observability** | 13/20 | `/version` fixed v9.4.8; bug-report viewer 403 (origin gate) |
| **H. UI surfaces** (status bar / popup / console / chat dock) | 27/50 | 23 open — SHIELD health stub; legacy 6px tooltip CSS path |
| **I. Discord bridge** (/gm + scope/propose/vote + webhook) | 6/7 | 1 deferred (rotation DM + R2 ZIP) |
| **K. Rollout / provisioning** | 4/8 | only `catsfive` of 15 mods live-tested; **CWS `kbhpioj...` blocked on screenshots** |
| **L. Database state** | 002–031 + 032 live (~11MB) | 6 in-flight Wave 3; 13 legacy unrotated rows (TS-6); 043/044 blocked |

---

## 3 · Gap rollup (the "major gaps")
- **Two named redesign asks** the 06-19 work skipped: the labeled-category bar (= Wave 2 #3, **gated**) and killing the toolbar artifact (= STORM #2, **now fixed**).
- **Wave 2 entirely gated** on the bar-taxonomy decision (6 items ship together).
- **STORM #1 pt2** (Ban+Remove+Watch wiring) gated on the HI-1 policy decision.
- **TIER-1 standing:** HMAC backfill (459 rows), CWS screenshot upload (14 mods can't onboard until live).
- **Security:** `innerHTML` title XSS gap (#14), CSP `unsafe-inline` (TS-2).

See `docs/HANDOFF_2026-06-26.md` for the timeline, regressions, the 3 pending decisions, and the resume sequence.
