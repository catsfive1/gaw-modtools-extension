# BUILD BRIEF — Durable cross-mod Death Row execution (deploy-gated)

Closes the EXECUTION half of the DR reliability gap: a manually-queued 72h ban
must fire ON TIME regardless of which mod is online, without double-banning.
The VISIBILITY half already shipped (v10.46.0). This half needs a worker deploy,
so it is staged, not shipped — one Commander "deploy" makes it live.

## The bug (verified)
`saveDeathRow` is pure local `lsSet` (modtools.js ~5660). The reaper
(`processDeathRow` ~9420) executes only in the queuing mod's own browser. If
that mod isn't on GAW around `executeAt`, the ban fires late (next time they
open GAW) — and no teammate can execute it. localStorage survives reboot, so
it's "late," not "never" — but for a team it's unreliable.

## Why NOT a client-side fix
Cross-mod execution needs an ATOMIC claim so two mods can't both fire the same
ban (the code's own history records a real 5×-duplicate-ban race from a
non-atomic path). Browser localStorage locks are same-browser only. The atomic
primitive must be server-side.

## The right architecture — extend the EXISTING durable queue
`auto_action_queue` (migration 043, DEPLOYED, live) already implements exactly
this pattern for `unsticky`: worker enqueues → any mod's SW atomically claims
(`UPDATE ... RETURNING`, worker gaw-mod-proxy-v2.js ~14550) → executes → reports
complete. `action` is a free TEXT column; the schema comment says "more types
in future." Add a `death_row` action type. NO new table.

### 1. Migration (new file migrations/050_auto_action_deathrow.sql)
`auto_action_queue` already has the columns needed EXCEPT a scheduled-fire time.
Add one nullable column (backwards-compatible, no default needed for unsticky):
```
ALTER TABLE auto_action_queue ADD COLUMN execute_at INTEGER;  -- ms epoch; NULL = fire asap (unsticky)
CREATE INDEX IF NOT EXISTS idx_aaq_scheduled ON auto_action_queue(status, action, execute_at);
```

### 2. Worker — enqueue route (new): POST /mod/deathrow/enqueue
Auth: any valid mod token (same checkModToken + lookupModFromToken as the sniper
routes). Body `{username, execute_at, reason}`. INSERT a row:
`action='death_row', target_thing_id=username, target_meta=JSON{by:modName},
reason, queued_at=now, execute_at, status='scheduled'`. Dedup: if a
status IN ('scheduled','pending','claimed') row already exists for this
username+action, return `{ok:true, already:true}` (idempotent — matches
addToDeathRow's existing dup-guard).

### 3. Worker — cron promote (in the existing scheduled handler)
Each cron tick: `UPDATE auto_action_queue SET status='pending' WHERE
action='death_row' AND status='scheduled' AND execute_at <= <now>`. This makes
ready DR items claimable exactly like unsticky items — the delay is honored
server-side, so no client holds a claim it can't yet execute.

### 4. Worker — extend claim handler
`handleAutoActionsClaim` already claims by `action`. It works as-is for
`death_row` once the client passes `action:'death_row'` in the claim body. No
change needed beyond confirming the RETURNING columns include what the client
needs (target_thing_id=username, reason).

### 5. Client SW — execute death_row claims (background.js ~1812 _autoActionPoll)
Currently only handles unsticky. Add: poll a second time with
`action:'death_row'`; for each claimed row, message an open GAW content-script
tab to run the ban via the SAME executeBan path the reaper uses (do NOT invent a
new ban path — HI-1). Report /complete with the GAW HTTP status, exactly like
unsticky. The atomic claim guarantees exactly one mod executes each row.

### 6. Client — enqueue on manual DR placement (modtools.js addToDeathRow)
When `opts.fromUserAction`, ALSO fire-and-forget `rpcCall('modDrEnqueue',
{username, execute_at: Date.now()+delayMs, reason})`. Keep the local queue too
(belt-and-suspenders: whichever fires first, the server dedup + the existing
markDeathRowExecuted + cross-tab lock prevent a double-ban; the ban itself is
idempotent-on-already-banned). Add the RPC name to background.js's rpc map.

## HI-1 GUARDS (must hold)
- No new ban primitive: execution routes through the EXISTING executeBan.
- Exactly-once: the atomic `UPDATE...RETURNING` claim is the guard; server-side
  dedup on enqueue; client keeps markDeathRowExecuted + cross-tab lock.
- Delay honored server-side (status scheduled→pending on execute_at), so no mod
  fires a ban before its time.

## TEST
- Worker: unit-test enqueue dedup + cron promote (execute_at gate) + claim
  atomicity (two concurrent claims → one winner). Reuse the sniper/auto-action
  test harness.
- Client: smoke that addToDeathRow(fromUserAction) also calls modDrEnqueue; that
  _autoActionPoll handles action='death_row' via executeBan (not a new path);
  HI-1 static scan.
- Live (post-deploy, §8): enqueue a short-delay DR from browser A, close A,
  confirm browser B's SW claims + executes at execute_at, and the row goes
  'done' with no duplicate.

## DEPLOY (Commander-gated)
`cd cloudflare-worker; wrangler d1 execute ... --file=migrations/050...` then
`wrangler deploy`. Prod deploys are classifier-gated — needs Commander's explicit
"deploy". Migration is additive/backwards-compatible (safe with the running
worker). Rollback = Cloudflare deploy history.
