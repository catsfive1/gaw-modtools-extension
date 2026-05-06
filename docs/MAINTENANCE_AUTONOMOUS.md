# Autonomous Maintenance + Llama Analysis (v9.5.0)

This document covers the weekly autonomous maintenance run and the
constrained Llama 3 analysis layer that classifies findings into a fixed
recommendation enum.

It complements `docs/MAINTENANCE_BACKLOG_v9.5.md` (the manual Maintenance
Mode shipped by the sibling agent) and is owned by the autonomous half.

## Schedule

- Alarm name: `gam_maint_weekly_run`
- Period: `60 * 24 * 7 = 10080` minutes (every 7 days)
- Created on `chrome.runtime.onInstalled` AND `chrome.runtime.onStartup`
  (mirrors the existing alarm pattern in `background.js`).
- Runs unattended in the service worker; no popup needs to be open.

## What runs autonomously

Only the **non-destructive** subset of the popup's 12 maintenance routines.
Each is a read-only probe.

| Routine                  | Source helper                | Notes                                |
|--------------------------|------------------------------|--------------------------------------|
| `storage_health`         | `_autoStorageProbe`          | bytes-in-use, top-5 keys             |
| `token_health`           | `_autoTokenProbe`            | `/mod/whoami` round-trip + age       |
| `selector_drift`         | `_autoSelectorDrift`         | reads `gam_learned_selectors` only   |
| `diag_log_status`        | `_autoDiagStatus`            | counts only — does NOT auto-purge    |
| `schema_migration_check` | `_autoSchemaCheck`           | compares versions — does NOT migrate |
| `audit_chain_verify`     | `_autoAuditVerify`           | lead-only; non-lead skips silently   |
| `roster_staleness_audit` | `_autoRosterStaleness`       | lead-only; non-lead skips silently   |

Click-only routines never fire from the alarm:

- Cookie clear
- Reset to defaults
- Schema migrate (the *check* runs; the migrate does NOT)
- Diag log purge

## Worker endpoint: `POST /maintenance/report`

Auth: `lookupModFromToken` (any authed mod, hash-first dual-mode lookup).

Body (allow-listed shape):

```json
{
  "extension_version": "9.5.0",
  "ts": 1714857600000,
  "results": {
    "storage_health": { "ok": true, "total_bytes": 12345, "pct": 0.24, "top_keys": [] },
    "token_health":   { "ok": true, "mod_username": "alice", "is_lead": false, "latency_ms": 220, "token_age_days": 14 },
    "selector_drift": { "ok": true, "drift_count": 0, "keys": [] },
    "diag_log_status": { "ok": true, "log_count": 142, "log_cap": 500, "pct_of_cap": 28.4, "recent_errors_7d": 0 },
    "schema_migration_check": { "ok": true, "stored_version": 3, "code_version": 3, "drift": false },
    "audit_chain_verify":     { "skipped": true, "reason": "non_lead" },
    "roster_staleness_audit": { "skipped": true, "reason": "non_lead" }
  }
}
```

Validation (server-side, in this order):

1. Body shape — known routine names only (allow-list of 7).
2. `extension_version` is a string ≤ 32 chars.
3. `results` JSON-serialized ≤ 16 KB.
4. Llama 3 (Workers AI, model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`)
   runs with the constrained prompt (see below).
5. LLM response is parsed and validated; any deviation collapses to the
   safe `lead_review_required` fallback.
6. Audit row appended via `appendAuditAction({action: 'maintenance.report_received'})`
   — hard-fails the request on audit-write error (W-H-5 policy).

Storage: D1 table `maintenance_reports` (migration 030).

Response:

```json
{
  "ok": true,
  "report_id": 12,
  "severity": "info",
  "summary": "Storage and token health within thresholds.",
  "recommendations": [
    { "action_id": "no_action_needed", "reason": "all probes returned ok" }
  ],
  "prompt_version": "v1"
}
```

## Lead-only listing: `GET /admin/maintenance/reports`

Query string:

- `days` — window in days (1..90, default 14)
- `limit` — max rows (1..500, default 100)
- `severity` — optional filter, one of `ok|info|warning|critical`

Response:

```json
{
  "ok": true,
  "days": 14,
  "severity": "warning",
  "count": 3,
  "reports": [{
    "id": 12,
    "mod_username": "alice",
    "ts": 1714857600000,
    "extension_version": "9.5.0",
    "severity": "warning",
    "results_json": "...",
    "llm_analysis_json": "...",
    "prompt_version": "v1"
  }]
}
```

## Llama 3 prompt (verbatim, locked)

```
SYSTEM: You are a conservative health-check analyzer for a Chrome extension's
weekly maintenance report. Your ONLY job is to classify findings and
suggest at most 3 NON-DESTRUCTIVE recommendations from a fixed enum.

You MUST respond with valid JSON matching this exact schema:
{
  "severity": "ok" | "info" | "warning" | "critical",
  "summary": "<1-sentence plain-English summary, max 120 chars>",
  "recommendations": [
    {
      "action_id": "<one of the enum values below>",
      "reason": "<1-sentence justification, max 80 chars>"
    }
  ]
}

ALLOWED action_id values (no others):
- "rotate_token_soon"        - mod's token is >60d old
- "trim_intel_cache"         - intel cache exceeds threshold
- "review_diag_errors"       - diag log shows recurring errors
- "update_extension"         - version mismatch with team baseline
- "review_pending_queue"     - pending users count is high
- "investigate_audit_gap"    - audit chain has unexpected NULL hmac
- "no_action_needed"         - everything healthy
- "lead_review_required"     - report is unusual; flag for lead

NEVER suggest actions outside this enum. NEVER suggest deleting data.
NEVER suggest modifying tokens directly. NEVER suggest credentials operations.

If you are unsure, return "lead_review_required".

USER: INPUT (the report):
<results JSON>

OUTPUT (your JSON response):
```

## action_id enum reference

| `action_id`              | Meaning                                                     |
|--------------------------|-------------------------------------------------------------|
| `rotate_token_soon`      | Token age in `token_health.token_age_days` exceeds 60 days  |
| `trim_intel_cache`       | `storage_health.pct` is high; intel cache likely the cause  |
| `review_diag_errors`     | `diag_log_status.recent_errors_7d > 0`                      |
| `update_extension`       | `extension_version` < team baseline (lead-judgment call)    |
| `review_pending_queue`   | High count surfaced by future routines (placeholder)        |
| `investigate_audit_gap`  | `audit_chain_verify.null_hmac_post_boundary === true`       |
| `no_action_needed`       | All probes returned `ok` and within thresholds              |
| `lead_review_required`   | Anything unusual; default fallback when LLM output invalid  |

The validator on the worker side rejects any `action_id` outside this enum
and substitutes `lead_review_required`.

## Constraints

- Llama 3 is small (8B at the prompt-design budget; the live model used is
  `@cf/meta/llama-3.3-70b-instruct-fp8-fast` for higher reliability). It WILL
  attempt destructive suggestions if the prompt is loose. The prompt locks
  it to the enum AND the server validates again on the way back.
- JSON parse failures from the LLM collapse to a `warning` severity with a
  single `lead_review_required` recommendation.
- `summary` and `reason` strings are capped server-side (120 / 80 chars)
  and have non-printable characters stripped before persistence.
- `results_json` capped at 16 KB; `llm_analysis_json` capped at 4 KB.
- No tokens, no credentials, and no PII beyond `mod_username` are ever
  written to the report payload.

## Disable / kill switch

Lead-only: flip `team_settings.maintenance_autonomous_enabled` to `'0'`
via the popup's lead-tier "Autonomous maintenance" section, OR directly:

```
PUT /admin/settings
{ "key": "maintenance_autonomous_enabled", "value": "0" }
```

When `'0'`, the weekly alarm still fires and the local routines still run
(so the `gam_maint_warning` chip stays accurate), but the worker upload +
LLM call is skipped. No reports land in D1.

Default value is `'1'` (autonomous enabled).

## Prompt versioning + retraining

`team_settings.maintenance_prompt_version` controls the version label
attached to every stored report. Default is `'v1'`. To roll out a new
prompt:

1. Edit `_llamaMaintPrompt` in `cloudflare-worker/gaw-mod-proxy-v2.js` and
   commit/deploy.
2. Bump `team_settings.maintenance_prompt_version` to `'v2'`:
   ```
   PUT /admin/settings
   { "key": "maintenance_prompt_version", "value": "v2" }
   ```
3. New reports record `prompt_version: 'v2'` so older analyses can be
   re-played against the prompt that originally produced them.

## Mod-side notification

When the autonomous run completes, the content script renders a one-line
snack on any open `https://greatawakening.win/*` tab:

| Severity     | Snack                                                     |
|--------------|-----------------------------------------------------------|
| `ok`         | (silent — no snack)                                       |
| `info`       | blue snack "Maintenance: <summary>"                       |
| `warning`    | orange snack                                              |
| `critical`   | red snack with "open ModTools" hint                       |

The "open ModTools" hint is appended when severity is `critical` OR when
the LLM recommended `rotate_token_soon` / `investigate_audit_gap`. The
content-script cannot directly open the extension popup, but the hint
guides the mod to click the toolbar icon.

## Architecture summary

```
[chrome.alarms gam_maint_weekly_run] (every 10080 min)
        |
        v
[background.js _maintWeeklyRun]
        |
        |-- read-only probes (parallel)
        |-- token_health, storage_health, selector_drift,
        |   diag_log_status, schema_migration_check,
        |   audit_chain_verify (lead), roster_staleness_audit (lead)
        |
        v
[POST /maintenance/report]   (gated by team_settings.maintenance_autonomous_enabled)
        |
        v
[worker handleMaintenanceReport]
   |-- shape validation (allow-list of routines, size caps)
   |-- env.AI.run(BOT_LLAMA, _llamaMaintPrompt(results))
   |-- _validateLlmAnalysis(rawText)  -> enum + length checks
   |-- INSERT INTO maintenance_reports
   |-- appendAuditAction('maintenance.report_received')
   |-- return {report_id, severity, summary, recommendations}
        |
        v
[background.js stores result in chrome.storage.local "gam_maint_last_report"]
        |
        v
[chrome.tabs.sendMessage  type:'maintenanceSnack']
        |
        v
[modtools.js content-script onMessage handler]
        |
        v
[snack(...)]   (silent on severity=ok)
```
