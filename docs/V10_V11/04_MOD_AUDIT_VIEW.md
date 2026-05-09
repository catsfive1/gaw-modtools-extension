# V11 #4 -- Mod Audit View

**Source:** V11_CAT2_UX_FLOWS W4, V11_R2_CAT2_DATABASE item #10
**Wave:** 1
**Effort:** M (new worker endpoint + new Lead-tab card + Llama call)
**Index prerequisite:** `idx_actions_mod_action_ts` (DB item #10, migration 039) -- ship this index in the same PR or the endpoint query will full-scan.

---

## A. WORKER ENDPOINT: GET /admin/audit/mod-profile

### Route signature

```
GET /admin/audit/mod-profile?mod=<username>&days=<N>
Authorization: Bearer <lead-token>
```

`days` defaults to 30, capped at 90. Lead-only route -- same auth guard as `/admin/audit/verify`.

### SQL aggregation

Two queries. Both served by `idx_actions_mod_action_ts ON actions(mod, action, ts DESC)`.

**Query 1 -- action histogram + ratio stats**

```sql
SELECT
  action,
  COUNT(*) AS cnt,
  -- Hour-of-day bucket (0-23) for histogram
  (CAST(ts / 3600000 AS INTEGER) % 24) AS hour_bucket
FROM actions
WHERE mod = :mod
  AND ts > :since_ts
GROUP BY action, hour_bucket
ORDER BY action, hour_bucket;
```

Post-process in Worker JS: pivot into `{ action: { hour: count } }` map.
Derive ratios from the flat action totals:
- `ban_total`, `note_total`, `remove_total`, `warn_total`, `msg_total`
- `ban_note_ratio = ban_total / MAX(note_total, 1)` -- anything above 3 is a flag
- `ban_per_day = ban_total / days`

**Query 2 -- top 3 aggressive bans (first-offense check)**

"Aggressive" = banned user whose `gaw_users.ban_count` was 1 at the time of the ban (i.e., this ban IS their first offense). Approximated from `gaw_users.ban_count` current value; exact forensic replay is out of scope for v11.

```sql
SELECT a.id, a.ts, a.target_user, a.details,
       COALESCE(u.ban_count, 1) AS target_ban_count,
       COALESCE(u.account_age_days, 0) AS account_age_days
FROM actions a
LEFT JOIN gaw_users u ON u.username = a.target_user
WHERE a.mod = :mod
  AND a.ts > :since_ts
  AND a.action LIKE 'ban%'
ORDER BY a.ts DESC
LIMIT 30;
```

Filter in Worker: keep rows where `target_ban_count <= 1` OR `account_age_days < 7`. Sort by `account_age_days ASC`, take top 3. These become the "most aggressive bans" list.

**Query 3 -- bans with prior modmail context (precedent coverage)**

```sql
SELECT COUNT(*) AS bans_with_context
FROM actions a
WHERE a.mod = :mod
  AND a.ts > :since_ts
  AND a.action LIKE 'ban%'
  AND EXISTS (
    SELECT 1 FROM mod_modmail_responses r
    WHERE r.sender = a.target_user
      AND r.sent_at < a.ts
  );
```

`pct_bans_with_precedent = bans_with_context / MAX(ban_total, 1) * 100`

### Index requirements

The critical gap DB item #10 names: the current `actions` indexes cover `(mod, ts)` and `(action, ts)` separately but NOT `(mod, action, ts)` as a composite. Without `idx_actions_mod_action_ts`, Query 1 scans every action row for the mod and then sorts. With 500k+ rows this is 30-50ms. With the composite index it's a narrow range scan terminating when `ts < since_ts` -- sub-5ms.

**Ship migration 039 with this endpoint. They are one atomic unit.**

```sql
-- migration 039 (add in Wave 1, same PR as endpoint)
CREATE INDEX IF NOT EXISTS idx_actions_mod_action_ts
  ON actions(mod, action, ts DESC);
```

### Response shape

```json
{
  "mod": "catsfive",
  "period_days": 30,
  "totals": {
    "ban": 42,
    "note": 18,
    "remove": 61,
    "warn": 7,
    "msg": 5
  },
  "ratios": {
    "ban_note_ratio": 2.33,
    "ban_per_day": 1.4,
    "pct_bans_with_precedent": 71
  },
  "histogram": {
    "ban":    { "0": 0, "1": 0, ..., "22": 4, "23": 6 },
    "remove": { "0": 1, ..., "23": 3 }
  },
  "aggressive_bans": [
    {
      "action_id": 18842,
      "ts": 1746700000000,
      "target_user": "anon_xyz",
      "target_ban_count": 1,
      "account_age_days": 2,
      "details": { "duration": "permanent", "reason": "ban evasion" }
    }
  ],
  "ai_summary": { ... }  // Section B
}
```

---

## B. AI SUMMARY PROMPT (Llama, structured JSON)

Runs after the three queries resolve. Calls Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` via the existing `aiCallerKey` binding. The same pattern already used in background.js line ~468 for SUS analysis.

### System prompt

```
You are a moderation audit assistant. You review a mod's action statistics
and return a structured behavior summary for a lead moderator to review.
Be terse, factual, and flag anomalies without editorializing.
Output valid JSON only, no markdown wrapper.
```

### User prompt (constructed in Worker)

```
Mod: {{mod}}
Period: {{days}} days
Action totals: bans={{ban}}, notes={{note}}, removes={{remove}}, warns={{warn}}
Ban/note ratio: {{ban_note_ratio}} (team avg: 1.8)
Bans per day: {{ban_per_day}} (team avg: 1.1)
Bans with prior modmail context: {{pct_bans_with_precedent}}%
Top aggressive bans (first-offense or new accounts):
{{aggressive_bans_summary}}

Return JSON:
{
  "overall_rating": "green" | "yellow" | "red",
  "summary": "<2 sentence plain-English summary>",
  "flags": ["<flag 1>", "<flag 2>"],
  "positive_notes": ["<note 1>"],
  "recommended_action": "none" | "review_with_mod" | "escalate_to_admin"
}
```

`aggressive_bans_summary` is a bullet list of `target_user (age: Nd, ban #N, reason: X)` -- max 3 rows.

### Rating thresholds

| Signal | green | yellow | red |
|---|---|---|---|
| ban_note_ratio | < 2.5 | 2.5-4 | > 4 |
| ban_per_day | < 2 | 2-3.5 | > 3.5 |
| pct_bans_with_precedent | > 60% | 40-60% | < 40% |
| aggressive_bans count | 0 | 1 | >= 2 |

Llama sees the raw numbers; the thresholds are for the client-side color ring. Do not encode them in the prompt -- they shift over time and are a UI concern.

### Latency budget

Llama fp8-fast at Workers AI: ~800ms p50 for this prompt size. The three SQL queries take ~15ms total with the composite index. Total endpoint latency: ~850ms. Acceptable for a Lead-tab card that triggers on explicit "Audit" click, not on hover.

---

## C. CLIENT PANEL (Lead tab card -- expandable)

### Entry point

Lead tab in popup. Below the mod roster table. New row per mod: `[MOD NAME]   [last action: 2h ago]   [Audit]` button.

"Audit" click fires `chrome.runtime.sendMessage({ type: 'modGetAuditProfile', mod: username, days: 30 })`. Background RPC handler calls the worker, returns the full response. Panel renders inline (no new tab, no popup close).

### Panel layout (single-column, ~360px popup width)

```
+--------------------------------------------------+
| Audit: catsfive  (last 30 days)          [x close]|
+--------------------------------------------------+
| [GREEN]  "Active and measured. Ban/note ratio     |
|           within normal range."                   |
| Flags: none                                       |
+--------------------------------------------------+
| Actions           Histogram (24h bar chart)       |
| Bans:     42      [mini sparkline bars 0-23]      |
| Notes:    18      Peak: 10pm-11pm UTC             |
| Removes:  61                                      |
| Warns:     7                                      |
+--------------------------------------------------+
| Ratios                                            |
| Ban/note:           2.33  (team avg 1.8)  [OK]   |
| Bans/day:           1.4   (team avg 1.1)  [OK]   |
| Bans w/ context:    71%                   [OK]    |
+--------------------------------------------------+
| Top 3 aggressive bans                             |
| anon_xyz   age:2d  ban#1  permanent  "ban evasion"|
| (none)                                            |
| (none)                                            |
+--------------------------------------------------+
| [Review with mod]   [Escalate]   [Dismiss]        |
+--------------------------------------------------+
```

**Color ring on "Audit" button:** green/yellow/red, populated from `ai_summary.overall_rating`. Default grey until first audit run. Cached in `chrome.storage.local` keyed `auditCache_${mod}` with a 1h TTL -- so the lead sees the last rating without re-querying on every popup open.

**Histogram rendering:** inline SVG, 24 bars, `ban` action only (the riskiest signal). Two lines of 4px-wide rects, max height 32px, normalized to local max. No charting library -- pure SVG template string, ~15 lines. Removes and bans on separate rows, color-coded.

**"Review with mod" button:** opens a prefilled modmail compose to the mod (internal mod-to-mod DM if the chat bridge exists, else a `mailto:` fallback). Pre-fills subject "Audit review -- [date]" and body with the two-sentence AI summary + the aggressive bans list.

**"Escalate" button:** calls `POST /admin/audit/flag-mod` with `{ mod, reason: ai_summary.summary, aggressive_bans }`. Creates a parked item on the server for admin review. Returns a toast: "Escalation filed -- admin notified."

**"Dismiss" button:** writes `{ auditDismissed_${mod}: { ts, rating } }` to `chrome.storage.local`. Clears the color ring until next cache TTL.

### Data contract to renderer

The panel renderer is a pure function: `renderAuditPanel(data) -> HTMLElement`. No global state mutation. Called once on response receipt. Destroyed on `[x close]`.

---

## D. SHIP-TONIGHT PATCH

Ordered by dependency. All four must ship together -- they are one atomic feature.

**Step 1 -- migration 039 (index)**

```sql
CREATE INDEX IF NOT EXISTS idx_actions_mod_action_ts
  ON actions(mod, action, ts DESC);
```

Run via `wrangler d1 execute AUDIT_DB --remote --command "CREATE INDEX IF NOT EXISTS idx_actions_mod_action_ts ON actions(mod, action, ts DESC);"`. Instant on current table size. Verify: `EXPLAIN QUERY PLAN SELECT action, COUNT(*) FROM actions WHERE mod='catsfive' AND ts>0 GROUP BY action` -- should show `USING INDEX idx_actions_mod_action_ts`.

**Step 2 -- worker route: GET /admin/audit/mod-profile**

In `gaw-mod-proxy-v2.js`: add route after the existing `/admin/audit/verify` handler. Lead-auth guard is a one-liner reuse. Three queries as above. Llama call via existing `env.AI.run()` binding. Assemble response, return `jsonResponse(payload, 200)`.

New handler is ~120 lines. No new bindings, no new KV keys, no new secrets.

**Step 3 -- background.js RPC handler**

```js
modGetAuditProfile: {
  allowed_callers: [RPC_CALLER_POPUP],
  async handler(args) {
    return await _rpcWorkerCall('GET',
      `/admin/audit/mod-profile?mod=${encodeURIComponent(args.mod)}&days=${args.days || 30}`,
      undefined,
      { asLead: true }
    );
  }
}
```

~8 lines. Add alongside `modAuditQuery`.

**Step 4 -- popup.js Lead tab**

- Add "Audit" button column to the mod roster table builder (the function that renders each mod row in the Lead tab).
- Add `renderAuditPanel(data)` function (~80 lines, inline SVG histogram + layout above).
- Wire button click to `chrome.runtime.sendMessage` + panel insert/replace.
- Add 1h cache read/write around the RPC call.

Total new popup.js lines: ~120.

**Deploy sequence:**

1. `wrangler d1 execute` (index -- instant, no downtime)
2. `wrangler deploy` (worker -- instant swap)
3. Chrome extension reload (popup.js + background.js change)

**Smoke test (Lead-side):**
- Click "Audit" on any mod with >5 actions in the last 30 days.
- Expect: panel renders in <2s, histogram has bars, AI summary shows rating color, aggressive bans list populates (or shows "none").
- Verify endpoint directly: `curl -H "Authorization: Bearer <lead-token>" "https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev/admin/audit/mod-profile?mod=catsfive&days=30"` -- should return JSON in <1500ms.

**Out of scope for tonight (v11.1):**
- Per-shift trend (audit over time, not just last N days) -- needs a `mod_audit_snapshots` table.
- Team-average comparison computed live -- hardcode team-avg constants for now (ban_note_avg=1.8, ban_per_day_avg=1.1), update quarterly.
- "Escalate" button's `/admin/audit/flag-mod` endpoint -- ship stub that returns 501 until `parked_items` integration is confirmed; button shows "coming soon" tooltip until then.
