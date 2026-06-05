# Bot Raid Shield — Build Status & Decisions Log

Running log of shipped versions + architecture decisions.
Specs: `SHIELD_SHIPMASTER.md` (storm design), `00_REQUIREMENTS_LOCKED.md` (locked
reqs + implementation constants). All worker work is **local-only until the
Commander-gated production rollout** (the `cloudflare-worker/` dir is gitignored,
so no per-version git commits — rollback is via Cloudflare deploy history).

## Versions shipped (worker)

| Ver | Scope | Status | Verification |
|---|---|---|---|
| v10.19.0 | T0 heuristic engine + `POST /raid/score-candidates` (AI stubbed) | ✅ | 17/17 smoke |
| v10.19.1 | SUS placement + global AI cap + T1 Llama adjudication | ✅ | 53/53; no-clobber verified on live local D1 |
| v10.19.2 | `GET /raid/detect` raid alarms + dedup | ✅ | 44/44; 2 live-D1 bugs caught + fixed |
| v10.19.2-fix | coarse `braidFamilyClass` grouping (fixes missed-raid bug) | ✅ | 75/75; operator's 7 names → 1 family → fires at 7 |

## Key architecture decisions

1. **Flush to Death Row reuses the EXISTING client-side path** (`addToDeathRow` +
   72h delay + `processDeathRow`), NOT a new worker `/raid/flush` ban-route.
   *Rationale:* reuse battle-tested ban code (safest possible), honor the rejection
   of the DR-execution re-architecture (HI-2 over-reach), avoid a parallel ban path.
   The flush button (v10.19.7 UI) calls existing `addToDeathRow` for mod-reviewed
   users, then reports the disposition to the worker for learning (v10.19.6).
   **Net effect: no new ban code is written anywhere in this feature.**
2. **Family grouping = coarse `braidFamilyClass`**, not the exact shape mask.
   Robust to word-length / separator / leet / case mutation. Verified against the
   operator's literal `<descriptor><animal><3-digit>` attack.
3. **HI-1 holds across every version:** AI writes only to `mod_user_sus`; only a
   human flush queues Death Row; there is no auto-ban path anywhere.

## Revised remaining plan

- **v10.19.3 — Notifications (worker):** mod-chat `ALL` broadcast + Discord
  `#ai-tools`. **Depends on** the Discord config storage = the settings-reorg
  "Discord / Integrations" card + its authed worker save-route. Build after the
  settings storm lands (it defines that contract).
- **v10.19.5 — R6 "Report Bot Raid" intake** (worker route + family inference from
  pasted examples / loose pattern → seed the scorer).
- **v10.19.6 — Disposition feedback + self-improvement loop** (worker route the UI
  calls on flush / remove; flush > remove weighting).
- **v10.19.7 — Extension UI:** SUS LIST card (pinned/auto-hide/collapsible), robot
  status-bar icon (shows only on active raid), FLUSH TO DR (client DR + disposition
  report), pre-selected rows + remove-to-clear, Report Bot Raid box, the Discord
  card. Ties everything together.
- **PROD rollout** — remote D1 migrate (`047`) + `wrangler deploy`. Commander-gated.

## Deferred hardening (add when the adversary earns it)

- Cross-cohort aggregator, viral-post shield, organic-surge mode, scale-adaptive
  `mean+3σ` thresholds (storm "v2" items).
- Server-side `/raid/flush` caps + lookalike re-check (flush currently reuses the
  client DR path; server-side cap enforcement is defense-in-depth for later).
- **Interior-digit family-split seam:** `black2mouse860` → `A.Da.A.Db` ≠
  `blackmouse860` (`A.Db`). An attacker injecting a digit *between* word tokens
  splits the family. Separators are already safe (stripped); leet digits
  (1,3,4,5,0) already fold. Fix when seen: fold/merge interior single-digit runs
  before tokenizing.
- **S8 device/UA fingerprint:** permanently dark — no capture source at registration.
