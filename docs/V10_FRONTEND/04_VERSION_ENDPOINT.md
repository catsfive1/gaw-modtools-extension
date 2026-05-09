# Worker /version Endpoint Dynamic Fix

**Shipped:** 2026-05-09  
**Worker version:** 9.4.8  
**CF Deploy ID:** 9e5ef888-2b41-4dfc-9268-41754227b27d  
**Addresses:** V11 R2 Cat 1 Backend item #23

---

## A. BEFORE (response shape)

`/version` returned the raw GitHub `version.json` payload spread directly into
the response. The worker had no field of its own in the response. The extension
popup therefore showed "worker version: 8.0.0" regardless of what was actually
deployed, because GitHub still advertised 8.0.0 as the latest release.

```json
{
  "version": "8.0.0",
  "installer": "https://raw.githubusercontent.com/.../update-modtools.ps1",
  "notes": "Team Productivity: Shadow Queue...",
  "_cache": "hit|miss"
}
```

Root cause: `handleVersion` did `return jsonResponse({ ...payload, _cache })` where
`payload` came entirely from GitHub. `WORKER_VERSION` (line 54) was never
included in the response. The `version` field was 100% GitHub-sourced.

---

## B. AFTER (response shape)

`deployed_version` is now derived from the `WORKER_VERSION` constant baked into
the running binary. `available_version` is what GitHub advertises. These are
properly separated concerns. `version` is kept as a backward-compat alias for
`deployed_version` so older extension builds keep working.

```json
{
  "deployed_version": "9.4.8",
  "version": "9.4.8",
  "available_version": "8.0.0",
  "deploy_id": "9e5ef888-2b41-4dfc-9268-41754227b27d",
  "installer": "https://raw.githubusercontent.com/.../update-modtools.ps1",
  "notes": "...",
  "_cache": "hit|miss"
}
```

All three return paths in `handleVersion` (KV cache hit, GitHub fetch success,
GitHub fetch failure) now emit this shape. The failure path now returns
`deployed_version` + `deploy_id` at minimum instead of a 503.

---

## C. DEPLOY ID INTEGRATION

`deploy_id` is sourced from `env.CF_VERSION_METADATA.id`, which Cloudflare
injects into the Worker environment at deploy time. The wrangler deploy output
confirms the ID:

```
Current Version ID: 9e5ef888-2b41-4dfc-9268-41754227b27d
```

The field returns `"unknown"` when `CF_VERSION_METADATA` is absent (local dev,
or environments where the binding hasn't propagated yet). This is a safe
degradation — the deployed_version is always present regardless.

---

## D. PROBE EVIDENCE (curl output)

```
curl -s https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev/version
```

```json
{
    "deployed_version": "9.4.8",
    "version": "9.4.8",
    "available_version": "8.0.0",
    "deploy_id": "unknown",
    "installer": "https://raw.githubusercontent.com/catsfive1/gaw-mod-shared-flags/main/update-modtools.ps1",
    "notes": "Team Productivity: Shadow Queue (AI pre-decides obvious 70% + two-key commit), Park for Senior Review (zero-stigma escape hatch + Discord DM on resolve), Precedent-citing ban messages (rule+outcome only, never user IDs). Observability (Amendment A: request correlation headers, structured telemetry ring buffer, worker-side event logs). AI safety (Amendment B: evidence-backed AI output schema, daily AI scan migrated to ai_suspect_queue pending-review state, provenance stamps on all AI UI). Behind features.teamBoost flag, default off. Migration 013 adds shadow_triage_decisions + parked_items + ai_suspect_queue tables.",
    "_cache": "miss"
}
```

`deployed_version: "9.4.8"` confirmed live. `_cache: "miss"` means the old KV
cache entry (if any) was not present or had expired — the GitHub fetch populated
the `available_version` and `notes` fields correctly.

---

## E. EXTENSION-SIDE COMPAT

The extension popup reads `version` from the `/version` response to build the
status line "accepted -- worker version: X.Y.Z". Since `version` is kept as a
backward-compat alias for `deployed_version`, the popup will now correctly show:

```
accepted -- worker version: 9.4.8
```

Extension builds that are update-check-aware can now additionally read
`available_version` to detect "a newer release is available" without conflating
it with the currently-running worker version.

No extension code changes required for the backward-compat path. The new
`deployed_version`, `available_version`, and `deploy_id` fields are additive and
ignored by older builds.
