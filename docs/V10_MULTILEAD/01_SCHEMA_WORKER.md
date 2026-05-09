# Multi-Lead Delegation 1 -- Schema + Worker

---

## A. THREE-TIER MODEL DEFENSE

### Why "senior_lead" and not "co-lead"

"Co-lead" implies symmetric power. That is not the ask -- catsfive wants to
delegate a specific subset of admin capability (rotation invite issuance) to
trusted senior mods without giving them the ability to promote/demote others
or rotate existing leads. A symmetric "co-lead" would also require every
existing `is_lead` gate to become a two-way check, inviting bugs where a
co-lead does something only catsfive should do.

`senior_lead` is a named capability band. It has a discrete permission set
that is documented, testable, and audited. Promoting someone to `senior_lead`
is reversible by catsfive alone. This is the minimal viable delegation.

### Capability matrix

| Action | mod | senior_lead | lead |
|---|---|---|---|
| Submit bans, flags, DR | Yes | Yes | Yes |
| View own audit history | Yes | Yes | Yes |
| View team audit log | No | Yes | Yes |
| View bug reports | No | Yes | Yes |
| View mod roster (`/admin/mod/list`) | No | Yes | Yes |
| Issue rotation invite for a **non-lead mod** | No | Yes | Yes |
| Issue rotation invite for a **lead** | No | No | Yes |
| Bulk rotation invite (`/admin/mod/rotation-invite-bulk`) | No | No (see E) | Yes |
| Promote/demote mod tiers | No | No | Yes |
| Write team settings / features | No | No | Yes |
| Access `/admin/health/extended` (dual-factor) | No | No | Yes |
| Bot mod management (`/bot/mods/*`) | No | No | Yes |

**Immutable constraint:** the `lead` tier row(s) cannot be demoted by anyone
except another `lead`. A `senior_lead` has no promote/demote capability at all.

---

## B. SCHEMA MIGRATION (DDL)

Next migration number: **032** (last confirmed: 031 at
`migrations/031_team_macros.sql` and `031_mod_modmail_responses.sql`).

```sql
-- ============================================================================
-- Migration 032: Multi-lead tier -- adds tier column to mod_tokens
-- ----------------------------------------------------------------------------
-- Replaces the binary is_lead INTEGER with a three-value TEXT column.
-- is_lead is KEPT (not dropped -- SQLite has no DROP COLUMN) and frozen at
-- its backfilled value for any legacy code path still reading it directly.
-- All new auth logic reads `tier`; `is_lead` becomes a derived read-only
-- alias frozen at migration time.
-- ============================================================================

-- Step 1: add the tier column (SQLite has no ADD COLUMN IF NOT EXISTS;
-- runner must tolerate "duplicate column name" on re-run, same as 012).
ALTER TABLE mod_tokens ADD COLUMN tier TEXT NOT NULL DEFAULT 'mod'
  CHECK(tier IN ('mod', 'senior_lead', 'lead'));

-- Step 2: backfill from is_lead.
-- Rows with is_lead = 1 become 'lead'; everything else stays 'mod'.
-- senior_lead rows are created only through the new promote endpoint.
UPDATE mod_tokens
   SET tier = CASE WHEN is_lead = 1 THEN 'lead' ELSE 'mod' END;

-- Step 3: index for tier-range scans (roster, bulk-invite filter).
CREATE INDEX IF NOT EXISTS idx_mod_tokens_tier ON mod_tokens(tier);
```

**Backward compatibility:** `lookupModFromToken` (line 982-1034) currently
returns `{ mod_username, is_lead }`. After migration 032 it will return
`{ mod_username, is_lead, tier }`. The `is_lead` field remains boolean-true
for `tier = 'lead'` so every call site that only checks `!!verified.is_lead`
continues to work without modification for the majority of truly lead-only
gates. Only the gates that need to open for `senior_lead` are changed.

No migration needed for the `actions` (audit) table -- existing `action`
string values are open-ended and `'tier.promote'` / `'tier.demote'` are just
new string constants.

---

## C. requireTier HELPER (worker code sketch)

Replace the single `requireLeadAuth` helper (currently lines 597-607) with a
tier-aware version. `requireLeadAuth` stays as a thin alias for zero
call-site churn on the ~30 endpoints that must remain lead-only.

```js
// Tier constants -- matches CHECK constraint in migration 032.
const TIER = { mod: 0, senior_lead: 1, lead: 2 };

/**
 * requireTier(request, env, minTier)
 *
 * Returns null on success (caller may proceed).
 * Returns a 403 Response on failure.
 *
 * minTier: 'mod' | 'senior_lead' | 'lead'
 *
 * Path A (legacy env-secret): x-lead-token == env.LEAD_MOD_TOKEN
 *   -> always passes; treated as tier='lead'.
 * Path B: x-mod-token row lookup -> compare row.tier to minTier.
 */
async function requireTier(request, env, minTier) {
  const minVal = TIER[minTier] ?? TIER.lead; // default: fail-safe to lead

  // Path A: legacy x-lead-token (unchanged from requireLeadAuth line 599-600).
  const t = request.headers.get('x-lead-token');
  if (t && env.LEAD_MOD_TOKEN && t === env.LEAD_MOD_TOKEN) return null;

  // Path B: per-mod token lookup.
  try {
    const verified = await lookupModFromToken(env, request);
    if (verified && verified.mod_username) {
      const rowVal = TIER[verified.tier] ?? TIER.mod;
      if (rowVal >= minVal) return null;
    }
  } catch (_e) {}

  return jsonResponse(
    { error: `requires ${minTier} tier or above`,
      detail: 'send x-lead-token OR x-mod-token for a mod at the required tier' },
    403
  );
}

// Backward-compatible alias -- all existing call sites stay untouched.
async function requireLeadAuth(request, env) {
  return requireTier(request, env, 'lead');
}
```

**lookupModFromToken change** (line 992 and 1027): add `tier` to the SELECT
and return it.

```js
// Line 992 -- extend SELECT to include tier
'SELECT mod_username, is_lead, tier, token, token_hash FROM mod_tokens WHERE token_hash = ? LIMIT 1'

// Line 1027 -- extend return value
return { mod_username: row.mod_username, is_lead: !!row.is_lead, tier: row.tier || 'mod' };
```

---

## D. PROMOTE/DEMOTE ENDPOINTS

### POST /admin/mod/promote  (lead-only)

```
Body: { username: string, target_tier: 'mod' | 'senior_lead' | 'lead' }
```

Rules enforced server-side:
1. Caller must be `tier = 'lead'` (requireTier lead).
2. `target_tier` must be one of the three valid values.
3. Cannot demote a `lead` to anything below `lead` -- or rather, only catsfive
   can promote another row to `lead`, and demoting the last `lead` is blocked
   (guard: count leads remaining after change).
4. Cannot promote to `lead` if that would create more than N leads (start with
   N=5; configurable via team_features later).

```js
async function handleAdminModPromote(request, env) {
  const gate = await requireTier(request, env, 'lead'); if (gate) return gate;
  if (!env.AUDIT_DB) return jsonResponse({ ok: false, error: 'D1 not bound' }, 503);

  const verified = await lookupModFromToken(env, request);
  const callerMod = verified ? verified.mod_username : 'lead-token';

  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const targetTier = String(body.target_tier || '');

  if (!username) return jsonResponse({ ok: false, error: 'username required' }, 400);
  if (!['mod', 'senior_lead', 'lead'].includes(targetTier)) {
    return jsonResponse({ ok: false, error: 'target_tier must be mod|senior_lead|lead' }, 400);
  }

  const existing = await env.AUDIT_DB.prepare(
    'SELECT mod_username, tier FROM mod_tokens WHERE mod_username = ? LIMIT 1'
  ).bind(username).first();
  if (!existing) return jsonResponse({ ok: false, error: 'unknown mod' }, 404);

  const fromTier = existing.tier || 'mod';

  // Safety: block demoting the last lead.
  if (fromTier === 'lead' && targetTier !== 'lead') {
    const leadCount = await env.AUDIT_DB.prepare(
      "SELECT COUNT(*) AS n FROM mod_tokens WHERE tier = 'lead'"
    ).first();
    if ((leadCount && leadCount.n) <= 1) {
      return jsonResponse({ ok: false, error: 'cannot demote: last remaining lead' }, 409);
    }
  }

  await env.AUDIT_DB.prepare(
    'UPDATE mod_tokens SET tier = ?, is_lead = ? WHERE mod_username = ?'
  ).bind(targetTier, targetTier === 'lead' ? 1 : 0, username).run();

  await appendAuditAction(env, {
    ts: new Date().toISOString(),
    mod: callerMod,
    action: targetTier === 'mod' ? 'tier.demote' : 'tier.promote',
    target_user: username,
    details: JSON.stringify({ from_tier: fromTier, to_tier: targetTier }),
    page_url: '',
    is_test: 0
  });

  return jsonResponse({ ok: true, username, from_tier: fromTier, to_tier: targetTier });
}
```

Route entry (near line 11853 in the existing routing block):

```js
case '/admin/mod/promote': return await handleAdminModPromote(request, env);
```

---

## E. ROTATION ENDPOINT GUARD

### handleAdminRotationInvite (currently lines 3505-3558)

Current line 3506: `const lead = await requireLeadAuth(request, env); if (lead) return lead;`

Replace that single gate line with tier-aware logic that also checks whether
the **target** mod is a lead -- because a `senior_lead` should NOT be able to
force-rotate another lead's token.

```js
async function handleAdminRotationInvite(request, env) {
  // Minimum tier: senior_lead. But if target is a lead, escalate to lead.
  const callerGate = await requireTier(request, env, 'senior_lead');
  if (callerGate) return callerGate;
  if (!env.AUDIT_DB) return jsonResponse({ ok: false, error: 'D1 not bound' }, 503);

  const verified = await lookupModFromToken(env, request);
  const callerTier = verified ? (verified.tier || 'mod') : 'lead'; // legacy path = lead
  const callerMod  = verified ? verified.mod_username : 'lead';

  const body = await request.json();
  const username = String(body && body.username || '').trim();
  if (!username) return jsonResponse({ ok: false, error: 'missing username' }, 400);
  if (!/^[A-Za-z0-9_-]{2,32}$/.test(username)) {
    return jsonResponse({ ok: false, error: 'invalid username shape' }, 400);
  }

  // Fetch target to check their tier.
  const existing = await env.AUDIT_DB.prepare(
    'SELECT mod_username, tier FROM mod_tokens WHERE mod_username = ? LIMIT 1'
  ).bind(username).first();
  if (!existing) return jsonResponse({ ok: false, error: 'unknown mod -- provision a token first' }, 404);

  const targetTier = existing.tier || 'mod';

  // senior_lead cannot issue a rotation invite for another lead or senior_lead.
  // They may only target plain 'mod' rows.
  if (callerTier === 'senior_lead' && targetTier !== 'mod') {
    return jsonResponse({
      ok: false,
      error: 'senior_lead cannot rotate a lead or senior_lead token',
      detail: 'only a lead can issue rotation invites for elevated accounts'
    }, 403);
  }

  // ... rest of existing invite generation logic unchanged (lines 3520-3555) ...
}
```

### handleAdminRotationInviteBulk (lines 3591-3650)

This remains **lead-only** -- bulk operations across the whole team are too
broad for `senior_lead` delegation. Line 3592 stays:
`const lead = await requireLeadAuth(request, env); if (lead) return lead;`

The existing `includeLeads` flag (line 3598-3602) already gates whether lead
rows are included; that remains a lead-only decision.

---

## F. WHOAMI EXTENSION

`handleModWhoami` (lines 1062-1071) currently returns:

```json
{ "username": "catsfive", "is_lead": true }
```

Extend to include `tier` so the extension popup can gate UI elements (show
"Promote mod" button only for leads; show "Issue rotation invite" for
senior_lead+):

```js
async function handleModWhoami(request, env) {
  const verified = await lookupModFromToken(env, request);
  if (!verified || !verified.mod_username) {
    return jsonResponse({ error: 'token_invalid' }, 401);
  }
  return jsonResponse({
    username: String(verified.mod_username),
    is_lead: !!verified.is_lead,     // backward-compat; keep forever
    tier: verified.tier || 'mod'     // new field; drives UI gating
  });
}
```

**Backward compatibility:** `is_lead` is not removed. Any extension version
that only checks `is_lead` continues to work correctly for the lead tier.
The `tier` field is additive. Old extension + new worker = no breakage.

---

## G. AUDIT TRAIL

Every tier change writes a Merkle-chained audit row via `appendAuditAction`
(line 917). Two new `action` values:

| action | when written |
|---|---|
| `tier.promote` | mod -> senior_lead, mod -> lead, senior_lead -> lead |
| `tier.demote` | lead -> senior_lead, lead -> mod, senior_lead -> mod |

`details` JSON carries `{ from_tier, to_tier }` so the audit log is
self-explanatory without joining mod_tokens.

The rotation invite audit row (line 3534-3542) already writes
`action: 'token.rotation_invite_issued'`. After the change, `mod` in that
row will reflect the actual `senior_lead` username (from `lookupModFromToken`
via `callerMod`) instead of the hardcoded string `'lead'`. This is a strict
improvement -- the audit now identifies WHICH senior lead issued the invite.

---

## H. SHIP-TONIGHT PATCH (staged)

Minimum viable ship that lights up `senior_lead` without regressions:

**Stage 1 -- schema only (no worker change yet):**
1. Run migration 032 against the live D1.
2. Verify: `SELECT mod_username, tier FROM mod_tokens ORDER BY tier;` --
   catsfive should show `lead`, everyone else `mod`.
3. Worker still reads only `is_lead`; new `tier` column exists but is ignored.
   Zero user-facing change.

**Stage 2 -- worker update:**
1. Add `tier` to the `SELECT` in `lookupModFromToken` (line 992 and 997) and
   return it (line 1027).
2. Add `TIER` constant map and `requireTier` helper directly after `requireLeadAuth`
   (after line 607). Rewrite `requireLeadAuth` as the alias (2 lines).
3. Patch `handleAdminRotationInvite` (line 3506) with the new guard block.
4. Add `handleAdminModPromote` function and its route entry.
5. Patch `handleModWhoami` (line 1067-1070) to include `tier`.
6. Deploy. Smoke test:
   - catsfive's token: `/mod/whoami` returns `tier: 'lead'`.
   - Any other mod: `/mod/whoami` returns `tier: 'mod'`.
   - Promote a test mod to `senior_lead` via `/admin/mod/promote`.
   - That mod can issue a rotation invite for a plain mod.
   - That mod gets 403 if they try to issue a rotation invite for catsfive.
   - That mod gets 403 if they try `/admin/mod/promote`.

**Stage 3 -- extension UI (Agent 2 scope):**
Extension popup reads `tier` from `/mod/whoami` and shows the Promote/Invite
controls conditionally. This is decoupled from the worker ship -- extension
change can follow next session.

---

## I. SECURITY CONCERNS

### Endpoints that MUST stay lead-gated (no senior_lead access)

These are the highest-risk surfaces. Each currently calls `requireLeadAuth`
(or equivalent `is_lead` check) and that must not be relaxed:

| Endpoint / function | Why lead-only |
|---|---|
| `handleAdminHealthExtended` (line 1914) | Exposes secret-presence; dual-factor gated |
| `handleFeaturesTeamWrite/Delete` (lines 4125, 4158) | Can flip feature flags for entire team |
| `handleAdminModPromote` (new) | Tier escalation -- obviously lead-only |
| `handleAdminRotationInviteBulk` (line 3591) | Rotates the whole team at once |
| `handleBotModsAdd/Remove/List` (lines 8175, 8198, 8207) | Discord bot allowlist |
| `handleBotRegisterCommands` (line 8221) | Registers global Discord commands |
| `/admin/audit/*` verify endpoints (lines 9502, 9652, 9806) | Audit chain integrity |
| `/admin/import-tokens-from-kv` (line 5465) | Bulk credential import |
| `/admin/health/extended` dual-factor (line 1919) | Dual-factor gate must not weaken |

### senior_lead escalation path risk

If a `senior_lead` can issue rotation invites for any `mod`, they can
effectively take over a mod's account the moment that mod claims the invite.
This is the intended delegation -- but it means a compromised `senior_lead`
account is worth more than a plain `mod` account. Mitigations:

1. The audit trail records every invite issuance with the `senior_lead`'s
   actual username (`callerMod` from `lookupModFromToken`), not the generic
   string `'lead'`. Forensic attribution is clear.
2. The `senior_lead -> lead rotation` block in `handleAdminRotationInvite`
   ensures a compromised `senior_lead` cannot take over catsfive's token.
3. Promotion to `senior_lead` itself is audited with `tier.promote`.

### is_lead frozen-column risk

After migration 032, `is_lead` is kept in sync manually by the promote
handler (`UPDATE ... SET tier = ?, is_lead = ?`). If a future code path
writes `is_lead` directly without touching `tier`, the two columns diverge.
Mitigation: `lookupModFromToken` after the patch returns `tier` and
`is_lead` is derived ONLY from `tier` in any new code. Consider a D1 trigger
or application-level invariant test in the next health-check endpoint to
assert `is_lead = (tier = 'lead')` for all rows.
