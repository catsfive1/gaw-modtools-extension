# GAW ModTools — Progression Roadmap (2026-06-06)

Source: a 9-agent "agent cloud" (`wf_a04e5e5f-ac0`, 1.18M tokens) dispatched to
finish Bot Raid Shield, make lead-lockout impossible, and design the next-wave
progression *past* what was asked. Full agent output (recon + 4 designs +
synthesis) raw-extracted to [`_cloud_designs_raw.md`](_cloud_designs_raw.md).
This file is the ranked, actionable queue distilled from the synthesis.

---

## DONE (this session — shipped + verified)

- **v10.20.0** — Bot Raid Shield operator UI (robot icon `#gam-raid-icon` + bot-raid bulk-flush in `_showSusPopover` + 30-min autonomous `/raid/score-candidates` wiring). Reviewed (code + a11y), all contrast PASS.
- **v10.21.0** — R6/R8 extension hooks: RPCs `modRaidReport`/`modRaidDisposition`, Report-raid box in the popover footer, flush→'flush', bot-raid Unmark→'remove'.
- **v10.22.0** — R8 signal completion: unchecked bot-raid rows → batched 'remove' in the flush call.
- **Worker R6** (`POST /raid/intake` = `handleRaidIntake`) + **R8** (`POST /raid/disposition-feedback`) + `braidLoadFewShot` — WRITTEN + **38/38 smoke** (`_braid_r6r8_smoke_test.mjs`). **HI-1 holds** (mock throws on any ban-table write; never tripped).
- **Worker bug fixes from the cloud's adversarial review:** R8 `meta.changes` guard (duplicate dispositions no longer inflate `recorded`/`flush_count`); `braidEnsureFamily` is now flush-only (removes no longer manufacture bot-families).
- **Lead-lockout recovery tool** (`scripts/recover-lead-access.ps1` + `.bat`) — used live to restore catsfive's lead access.

## DEPLOY-GATED (built + smoke-green; need Commander "deploy")

- **Worker R6/R8 routes** — live the instant `wrangler deploy` runs; the extension Report box + disposition reporting flip from "deploy pending" to live automatically.
- **Crawler v3** — `_cronVideoSummaryScan` + migration 049 (separate workstream).

---

## NEXT — ranked build queue (from the cloud synthesis)

### TIER 1 — Lockout-proof auth (CRITICAL · all extension-side · un-gated)
> Build FIRST in a fresh session that loads the WHOLE auth path. This is the most
> trust-critical code in the project (the `loadSecrets` path has a documented
> v10.11.1 history of breaking auth on every load) — do not rush it. Full
> file:line design in `_cloud_designs_raw.md`. The root cause of the ~20-step
> lockout was FOUR converging gaps, all fixable extension-side:

1. **L1 — 401-storm self-detector** in `_rpcWorkerCall` (background.js:2378-2420): currently NO 401 handling → a rotated token fails silently forever. Add cache-bust + single retry, then set `gam_auth_failed` (gated behind `_initReady`).
2. **L2 — route whoami-failure to a RECOVERY state, never NEW-MOD onboarding** (`__applyTierGate`). The operator must never be told to "claim an invite" when they're a returning lead.
3. **L3 — decouple lead-token recovery from whoami AND the team-token precondition** — break the catch-22 that forced the wrangler-d1 path.
4. **L4 — encrypted LOCAL token backup** (`gam_token_backup_v1`, separate key so no `/mod/settings` read echoes it) + `storage.sync` mirror, written on every save/rotation (hook near `_persistRotatedToken` ~background.js:2328; team token is already plaintext at :2559 so a backup is no new exposure; keep lead encrypted-with-fallback).
5. **L5 — AUTO-RESTORE from backup when `loadSecrets` (background.js:388) finds the vault empty** — self-heals the exact wiped-vault lockout (would have made this session's recovery a no-op).
6. **L6 — popup PANIC RE-AUTH panel** — always-reachable "Restore from backup / import recovery file" escape hatch.
7. **L7 — lead token is encrypted-ONLY → dies on SW eviction while the team token survives.** Make symmetric (keep a plaintext fallback like the team token).
8. **L8 — unify the 4 divergent token-shape predicates** so a valid worker-minted token can never be saved-but-rejected (phantom lockout).
9. **L9 — harden saveToken invite-vs-token auto-detect** — only re-route to invite-claim on an explicit 401; preserve the pasted value.
10. **L10 — passive backup-health line** in `tokensStatus` (timestamp only).
- **Infra (deploy-gated):** self-service `POST /admin/mod/reset-token` — kills the wrangler-d1 recovery path for every non-lead mod; + a one-shot `recover-modtools-access.ps1` that classifies which token is dead.

### TIER 2 — Next-wave features (the progression past the ask)
Through the broken-windows-curator lens; **★ = ships with NO worker deploy**:
- **★ In-feed slop badge** — client-side content-quality flag on the existing per-post action strip.
- **★ First-post screening in the FIREHOSE crawler** — catch new-account slop/bots at the door.
- **Curator scorecard + FP/reversal-rate KPI** — surface the disposition signal R8 already writes (deploy-gated).
- **Ban-evasion / re-registration sentinel** — activate the flag-OFF lookalikes self-join into a SUS-writing behavioral watcher.
- **Self-improving Auto-DR rules** — per-rule hit/accuracy fed by the disposition signal; AI suggests rules from missed hand-flushes.
- **★ Brigade-cluster bulk triage** — operationalize the soak-mode brigade detector on the existing SUS popover.
- **Ban-appeal intake queue** — turn the appeal promise the ban templates make into a ground-truth signal.

### TIER 3 — Deferred worker hardening (when the adversary earns it)
- S9 regex matcher (currently `canonical_pattern` holds the class token, not a regex — latent; document).
- Per-family few-shot scoping (currently global-newest → cross-raid contamination at multi-raid scale).
- R8 bulk path batching (serial-await → D1 `batch()` for 100-item flushes).
- R6 adversarial hardening: constant-time responses, 3/mod/day quota, probe detection, `plain_desc` withholding.
- R8: distinct-/24+UA Slot-A quorum, threshold drift, appeal-correctness gate.

---

*The cloud independently re-confirmed HI-1 HOLDS across all of R6/R8. Every Tier-1
item is extension-side and un-gated — none waits on a deploy.*
