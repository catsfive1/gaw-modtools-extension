# V11 -- Universal Undo Middleware (client + server contract)

**Source refs:** CAT4 #9 + Bet 2, CAT2 #3 (pending_undo schema), CAT1 #6 (idempotency keys) + #20 (bulk-action undo)
**Wave:** 1 (middleware + ban wrap) -> 1.5 (cascade to all call sites)
**Author:** CTO synthesis, 2026-05-09

---

## A. POLICY

The premise of Cat 4 Bet 2 is that undo cannot be a per-feature decision. The moment it becomes one, the team ships ban-undo but not sticky-undo, bulk-undo but not DR-add-undo, and mods learn not to trust the pattern. It must be an infrastructure primitive: every state-mutating call site wraps `withUndo(fn, opts)` and undo comes along for free.

### Tier definitions

| Tier | TTL | Who gets it | Rationale |
|---|---|---|---|
| **A -- Destructive** | 20 seconds | ban, remove, bulk-remove, DR-rule-add | High-stakes; wrong target is a real incident. 20s matches the Death Row queue precedent already shipped. |
| **B -- Reversible preference** | 5 seconds | sticky/unsticky, dock position, note-save | Lower stakes; undo window is a safety net, not a workflow feature. |

No other tiers. If a new action doesn't fit A or B, it defaults to Tier A and we argue down from there.

### What "undo" means per action type

| Action | Inverse |
|---|---|
| `ban` | `unban` (existing endpoint) |
| `remove` (post/comment) | Worker marks `approved_by_mod = true` in our DB; **cannot restore on GAW backend** -- toast copy must say "Marked for review" not "Restored" |
| `bulk-remove` | Replay the inverse array from `pending_undo.inverse_json` row by row via the same endpoint, with the same `client_op_id` for idempotency |
| `DR-rule-add` | Soft-delete the new rule (`dr_rules.deleted_at = now()`) |
| `sticky` | `unsticky` (already exists, was broken in B13 -- must be fixed before sticky undo ships) |
| `note-save` | Restore prior note value from `diff_json.before.note` in the pending_undo row |

Actions that have no safe inverse -- modmail send, token rotation -- are explicitly excluded from undo. The toast still fires for modmail ("Message sent"), but the undo button is absent. Do not improvise an inverse that isn't correct.

### Screen reader contract

Every toast that carries an Undo button MUST:

1. Mount with `role="alert"` so NVDA/JAWS announces it immediately without focus move.
2. Move focus to the Undo button on mount (WCAG 2.4.3 focus order).
3. Announce: `"[Action] complete. Press U or activate Undo button within [N] seconds to reverse."` via `aria-live="assertive"` on the toast container.
4. On undo: announce `"[Action] reversed."` before toast dismisses.
5. On expiry: announce `"Undo window closed."` -- mods using screen readers need to know the window has passed.

---

## B. CLIENT MIDDLEWARE

### `withUndo(actionFn, opts)` -- the single call-site contract

```js
/**
 * Wraps a state-mutating async call with undo infrastructure.
 *
 * @param {() => Promise<{ok: boolean, [key: string]: any}>} actionFn
 *   The actual RPC call. Must return {ok: true, ...} on success.
 *   Must NOT be called again for retries -- withUndo handles idempotency.
 *
 * @param {object} opts
 * @param {'A'|'B'} opts.tier       -- Tier A=20s, Tier B=5s
 * @param {string}  opts.label      -- Toast copy, e.g. "Banned catsfive_jr"
 * @param {string}  opts.undoLabel  -- Button copy, e.g. "Undo ban" (defaults to "Undo")
 * @param {() => Promise<void>} opts.inverse
 *   Local inverse function. Called when mod presses Undo.
 *   For server-backed undo, this calls POST /mod/op/undo with the client_op_id.
 *   For preference-tier (B) actions with no server state, this may be purely local.
 * @param {boolean} [opts.serverBacked=true]
 *   If true, actionFn is expected to return {client_op_id: string} and the
 *   undo endpoint is invoked server-side. If false, inverse() is called locally
 *   only (Tier B preference actions).
 *
 * @returns {Promise<{ok: boolean, undone?: boolean}>}
 */
async function withUndo(actionFn, opts) {
  const { tier, label, undoLabel = 'Undo', inverse, serverBacked = true } = opts;
  const ttlMs = tier === 'A' ? 20_000 : 5_000;

  // 1. Generate idempotency key BEFORE the call.
  //    Same key is reused on retry; server deduplicates via pending_undo PK.
  const clientOpId = crypto.randomUUID();

  // 2. Execute the action, injecting client_op_id so the server can store
  //    the inverse in pending_undo keyed to this UUID.
  let result;
  try {
    result = await actionFn({ client_op_id: clientOpId });
  } catch (err) {
    showToast({ label: `Failed: ${label}`, type: 'error' });
    throw err;
  }

  if (!result.ok) {
    showToast({ label: `Failed: ${label}`, type: 'error' });
    return result;
  }

  // 3. Register the global U-key handler for this op.
  //    At most one pending undo lives in the slot at a time.
  //    A new Tier-A action overwrites the previous slot -- mods work serially.
  _setUndoSlot({ clientOpId, inverse, ttlMs, label });

  // 4. Mount toast with Undo button.
  showToast({
    label,
    type: 'success',
    undoLabel,
    ttlMs,
    onUndo: () => _executeUndo(clientOpId, inverse, serverBacked, label),
    ariaAnnounce: `${label}. Press U or activate Undo button within ${ttlMs / 1000} seconds to reverse.`,
  });

  return result;
}
```

### Global U-key handler (one registration at content-script init)

```js
// In content script init -- runs once per page load.
document.addEventListener('keydown', (e) => {
  // U key, no modifier, not inside an input/textarea.
  if (e.key !== 'u' && e.key !== 'U') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

  const slot = _getUndoSlot();
  if (!slot) return; // no pending undo

  e.preventDefault();
  _executeUndo(slot.clientOpId, slot.inverse, slot.serverBacked, slot.label);
}, { capture: true });
```

### Undo slot management

```js
let _undoSlot = null;
let _undoTimer = null;

function _setUndoSlot({ clientOpId, inverse, ttlMs, label }) {
  // Cancel any existing slot timer -- new action wins.
  if (_undoTimer) clearTimeout(_undoTimer);

  _undoSlot = { clientOpId, inverse, ttlMs, label };
  _undoTimer = setTimeout(() => {
    _undoSlot = null;
    _undoTimer = null;
    srAnnounce('Undo window closed.');
  }, ttlMs);
}

function _getUndoSlot() { return _undoSlot; }

async function _executeUndo(clientOpId, inverse, serverBacked, label) {
  if (!_undoSlot || _undoSlot.clientOpId !== clientOpId) return; // already consumed or expired
  _undoSlot = null;
  if (_undoTimer) { clearTimeout(_undoTimer); _undoTimer = null; }

  try {
    await inverse();
    srAnnounce(`${label} reversed.`);
    showToast({ label: `Undone: ${label}`, type: 'info', ttlMs: 3000 });
  } catch (err) {
    srAnnounce('Undo failed. Check mod log.');
    showToast({ label: `Undo failed: ${err.message}`, type: 'error' });
  }
}
```

---

## C. SERVER CONTRACT

### pending_undo table (migration 034, CAT2 #3)

```sql
CREATE TABLE IF NOT EXISTS pending_undo (
  client_op_id  TEXT PRIMARY KEY,       -- UUID from client
  mod           TEXT NOT NULL,
  actions_json  TEXT NOT NULL,          -- [{action, target_user, extra}]
  inverse_json  TEXT NOT NULL,          -- [{action, target_user, extra}] to replay on undo
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,       -- created_at + TTL ms (20000 or 5000)
  consumed_at   INTEGER                 -- set on undo fire; prevents double-undo
);
CREATE INDEX IF NOT EXISTS idx_pundo_expires ON pending_undo(expires_at)
  WHERE consumed_at IS NULL;
```

TTL stored at creation time -- the server enforces its own expiry independent of the client's countdown. Clock skew between client and worker is irrelevant because the worker's `unixepoch()*1000` is the authoritative clock.

### How mutating endpoints accept and store the inverse

Every Tier-A endpoint that opts into undo:

1. Reads `client_op_id` from request body (optional field; if absent, skip undo storage -- backward-compat).
2. After the action succeeds, inserts one row into `pending_undo` via `ctx.waitUntil` (non-blocking, does not delay the response).
3. The `inverse_json` is computed server-side from the pre-action state (from the same SELECT used for token validation -- no extra round-trip needed).

```js
// Example: handleModBanConfirm (after ban succeeds)
if (clientOpId) {
  const inversePayload = JSON.stringify([{
    action: 'unban',
    target_user: targetUser,
    extra: { ban_id: banRow.id }
  }]);
  ctx.waitUntil(
    env.AUDIT_DB.prepare(
      `INSERT OR IGNORE INTO pending_undo
       (client_op_id, mod, actions_json, inverse_json, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      clientOpId,
      modUsername,
      JSON.stringify([{ action: 'ban', target_user: targetUser }]),
      inversePayload,
      Date.now(),
      Date.now() + 20_000  // Tier A TTL
    ).run()
  );
}
```

### POST /mod/op/undo

```
POST /mod/op/undo
Headers: x-mod-token: <token>
Body:    { "client_op_id": "<uuid>" }
```

**Atomic claim pattern (CAT2 #3):**

```sql
UPDATE pending_undo
   SET consumed_at = unixepoch()*1000
 WHERE client_op_id = ?
   AND consumed_at IS NULL
   AND expires_at > unixepoch()*1000
RETURNING inverse_json;
```

- 0 rows returned: already consumed OR expired. Return `409 { error_code: "UNDO_EXPIRED_OR_CONSUMED" }`.
- 1 row returned: replay `inverse_json` actions in order. Each inverse action is audited via `appendAuditAction` with `correlated_action = original_action_id` so the audit chain shows the undo relationship. Return `200 { ok: true, reversed: N }`.

The atomic `UPDATE ... RETURNING` pattern prevents double-undo races. Two simultaneous undo attempts produce exactly one winner and one 409 -- same discipline as token rotation.

### Cron cleanup

Added to `retentionPurgeTick`:

```sql
DELETE FROM pending_undo
 WHERE expires_at < unixepoch()*1000
   AND consumed_at IS NULL;
-- Unconsumed expired rows are dead; consumed rows already have consumed_at set
-- and are cleared by the same sweep after 24h.
```

---

## D. EXISTING CALL-SITE MIGRATION

### Priority order (ship-tonight ban first, cascade in v10.5)

| Call site | Tier | Inverse | Notes |
|---|---|---|---|
| `handleModBanConfirm` | A | `unban` | Ship tonight as the pilot. |
| `handleModRemovePost` / `handleModRemoveComment` | A | Worker-side `approved_by_mod = true`; toast copy = "Marked for review -- Undo" | Cannot truly restore on GAW backend. |
| `handleBulkAction` (remove 12, ban queue) | A | Replay `inverse_json` array via `/mod/op/undo` | bulk endpoint already accepts `client_op_id` per CAT1 #6 design. |
| `handleDrRuleAdd` | A | `dr_rules` soft-delete | `deleted_at = now(), deleted_by = mod` |
| `handleStickySet` / `handleStickyUnset` | B | Toggle the other direction | Requires B13 auto-unsticky fix before ship (CAT1 #20 dependency note). |

### Wrapping the ban call site (concrete example)

Before:
```js
async function doBan(targetUser, duration, reason) {
  const result = await rpc('/mod/ban/confirm', { target_user: targetUser, duration, reason });
  if (result.ok) showToast({ label: `Banned ${targetUser}`, type: 'success' });
  return result;
}
```

After:
```js
async function doBan(targetUser, duration, reason) {
  return withUndo(
    ({ client_op_id }) =>
      rpc('/mod/ban/confirm', { target_user: targetUser, duration, reason, client_op_id }),
    {
      tier: 'A',
      label: `Banned ${targetUser}`,
      undoLabel: 'Undo ban',
      inverse: () => rpc('/mod/op/undo', { client_op_id: /* captured in closure */ }),
      serverBacked: true,
    }
  );
}
```

The `client_op_id` captured in the closure is generated inside `withUndo` before the RPC call. The inverse closure closes over the same UUID -- the server endpoint looks it up atomically.

### What does NOT get undo

- Modmail send: no correct inverse exists (message is delivered externally).
- Token rotation: security operation; undo would reopen a revoked token.
- Note view / read operations: no state mutation.
- Lead-gated destructive actions (mass-unban, team reset): require confirmation modal instead; the modal IS the undo mechanism.

---

## E. SHIP-TONIGHT PATCH

Ship this tonight:

1. **`withUndo` + U-key handler** -- new utility module `content/undo-middleware.js`. Zero changes to existing call sites except ban.
2. **`pending_undo` migration 034** -- deploy migration, verify table exists.
3. **`POST /mod/op/undo` worker endpoint** -- atomic claim + inverse replay for ban only.
4. **Wrap `doBan`** -- one call site, exactly as shown in section D.
5. **Toast SR announcements** -- `role="alert"` + focus-on-mount + `ariaAnnounce` wired to the existing `srAnnounce` helper.

That is the complete pilot. Everything in section D beyond ban is v10.5 work. The middleware is written once; cascading it to the remaining call sites is mechanical wrapping, not architecture.

**Success gate for tonight:**

- Mod bans a user, sees "Banned [user] -- Undo ban" toast with 20s countdown.
- Pressing U within 20s fires the undo RPC, which returns 200, toast updates to "Undone: Banned [user]".
- Pressing U again (or after 20s) returns 409; toast shows "Undo window closed."
- NVDA user hears the full announce sequence without touching the mouse.
- Second mod simultaneously pressing U on the same op gets 409 -- no double-unban.

**v10.5 cascade:** remove, bulk-remove, DR-add, sticky. Each is a 10-line wrap using the same middleware. Estimated 2h total for all four once the pilot is confirmed green.
