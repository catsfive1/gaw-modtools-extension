# AF-10 Anti-Fragile Audit: Rules 28-30

**Generated:** 2026-05-09
**Scope:** modtools.js (v10.5.1) — optimistic UI, safe defaults, storage failure logging
**Rules:** 28 (optimistic UI + rollback), 29 (safe defaults), 30 (storage failure logging)

---

## Rule 28 — Optimistic UI Updates with Rollback on Storage Failure

**Verdict: PARTIAL. The primitives exist and cover the ban critical path. Several high-frequency mutations bypass them entirely.**

### What Exists

Two rollback primitives are live:

**`optimisticAction(params)`** (line ~4034): v8.1 UX layer. Applies an immediate UI change, fires the async work, rolls back on rejection. Gate-flagged behind `__uxOn()`. When the flag is off it falls through as a synchronous passthrough so callers are not broken. Contract: `apply`, `doWork`, `applySuccess`, `revert`, `onErrorSnack`.

**`withUndo(actionFn, opts)`** (line ~6445): v10.5 universal undo middleware. Fires the action, and if `result.ok` is true, arms an undo slot + toast with a configurable TTL (20s for Tier A, 5s for Tier B). Caller supplies an `inverse` function that runs on undo. Does NOT do optimistic local-state mutation — it operates at the network-action level, not the DOM/state level.

**Mod Chat** (line ~14841): the only call site with a full optimistic + rollback pattern. Appends a temp message with `__sending: true` before the RPC, replaces it with the real row on success, and deletes the temp entry plus re-renders on failure. Textbook implementation.

### Coverage Gaps

| Call Site | Location | Optimistic? | withUndo? | Gap |
|---|---|---|---|---|
| `apiBan` (Mod Console ban engine) | line ~8452 | No | YES (V11 #5) | rosterSetStatus('banned') fires POST-confirm only, no rollback |
| `apiUnban` (Mod Console) | line ~8366 | No | No | Fire-and-pray; roster only updated on r.ok |
| `apiUnban` (undo toast callback) | line ~6288 | No | No | Correct post-confirm only; acceptable here |
| `apiUnban` (modmail page) | line ~10824 | No | No | Acceptable — low-frequency |
| `apiRemove` (Mod Console quick actions) | line ~9028 | No | No | Opacity set post-confirm only |
| `apiRemove` (strip menu) | line ~9307 | No | No | Same — post-confirm only |
| `apiApprove` / `apiIgnoreReports` (queue intercept) | line ~9261 | No | No | Item fades post-confirm |
| `apiApprove` (v7-NBA) | line ~5488 | No | No | Inside bare `try{}catch(e){}` with no feedback on failure |
| `apiRemove` (v7-NBA) | line ~5489 | No | No | Same |
| `apiSendModMessage` (ban + warning) | line ~8422, 8543, 8908 | No | No | No local-state mutation to roll back; not applicable |
| `apiBan` (Sniper) | line ~20443 | No | No | High-consequence; no undo |
| `apiBan` (Proposals auto-execute) | line ~22339, 22545 | No | No | Backend-triggered; undo not wired |
| `optimisticAction` (proposals Punt/Veto) | line ~22303, 22319 | YES | No | Only call site using `optimisticAction` besides chat |

### What Rollback Means Here

The codebase uses `rosterSetStatus(username, status)` as the local state mutation for ban/unban/deathrow. A true optimistic pattern for ban would be:

1. Call `rosterSetStatus(username, 'banned')` immediately (optimistic apply).
2. Await `apiBan(...)`.
3. On failure, call `rosterSetStatus(username, prevStatus)` (revert).

Currently, every `rosterSetStatus` call in the ban engine fires only after `r.ok` is confirmed. That means there is no UI latency hiding — the UI is not optimistic, it is just correct. This is safe but does not satisfy Rule 28's spirit of hiding network latency from the user.

The `withUndo` wrapper on `apiBan` (Mod Console, line 8452) is the closest — it arms undo after the API confirms success. But the roster flip still happens post-confirm. No rollback is possible if the undo inverse itself fails, which is a separate concern.

### Recommendation

The highest-impact addition is optimistic roster status on the Mod Console ban path:
- Pre-flip `rosterSetStatus(username, 'banned')` before `withUndo` fires.
- If `withUndo` throws or returns `!r.ok`, revert to previous status.
- The `withUndo` inverse already handles the undo-by-user path.

The `apiRemove` paths (quick actions, strip menu) should optimistically apply DOM opacity before the await. These are idempotent-safe: if the call fails, restoring opacity is a trivial revert.

The v7-NBA `APPROVE`/`REMOVE` handlers (line ~5488) are the worst offenders — they swallow errors silently inside `catch(e){}` with no user-visible feedback at all.

---

## Rule 29 — Safe Defaults for All `getSetting` Calls

**Verdict: MOSTLY COMPLIANT. 47 call sites audited. 3 violations found. DEFAULT_SETTINGS safety net catches most cases, but not all.**

### The Safety Architecture

`getSetting(key, fallback)` has a three-layer lookup (line ~1576):
1. If key is in `_secretsCache` (secrets path), return cached value.
2. If key is in `DEFAULT_SETTINGS`, return the registered default.
3. Return the caller-supplied `fallback` argument.

`DEFAULT_SETTINGS` (line ~1255) covers 40+ keys with sane values. This means even a call like `getSetting('autoDeathRowRules')` with no second argument is safe — it returns `[]` from `DEFAULT_SETTINGS`. The fallback argument is therefore a belt-and-suspenders layer for keys not in `DEFAULT_SETTINGS`.

### All Call Sites With Explicit Fallbacks

Every `getSetting` call was reviewed. Representative sample of correctly-specified fallbacks:

| Key | Fallback | Safe? |
|---|---|---|
| `banMessageTemplate` | `''` | Yes — caller guards with `&&` trim check |
| `sniffEnabled` | `false` | Yes |
| `sniffAcknowledgeLimitations` | `false` | Yes |
| `includeSniffInDebug` | `false` | Yes |
| `autoDeathRowRules` | `[]` | Yes, also `|| []` at every call site |
| `autoTardRules` | `[]` | Yes |
| `aiEngine` | `'llama3'` | Yes — valid engine name |
| `aiProvider` | `'grok-3-mini'` | Yes — valid model |
| `workerModToken` | `''` | Yes — empty string is safe; callers gate on non-empty |
| `modConsoleDock` | `'modal'` | Yes — valid dock value |
| `inboxIntelPollMs` | `INBOX_INTEL_POLL_MS_DEFAULT` | Yes — constant, not magic number |
| `deepAnalysisEnabled` | `false` | Yes — safe off default |
| `features.modChat` | `true` | Yes — chat defaults on |
| `chat.dock` | `'right'` | Yes |
| `chat.width` | `'md'` | Yes |
| `tardsThreshold` | `2` | Yes |
| `defaultDeathRowHours` | `72` | Yes |
| `upvoteAgeFilter` | `'off'` | Yes — filter off is safe |
| `mailHoverHighlight` | `false` | Yes |
| `statusBarCompact` | `true` | Yes |
| `triageSectionCollapsed_*` | `false` | Yes — expanded by default |
| `sbCollapsed_*` | `false` | Yes |
| `autoUnstickyMaxHours` | `12` | Yes |
| `autoUnstickyUpvoteThreshold` | `110` | Yes |
| `lastAiScanDate` | `''` | Yes — empty triggers scan |

### Violations

**Violation 1 — `getSetting('features.shadowQueue', false)` (line ~3125)**
Fallback is `false` (safe) but this key IS in `DEFAULT_SETTINGS` via `getFeatureEffective`. The call bypasses `getFeatureEffective` and goes direct to `getSetting`. If the team overrides this feature server-side, this call site ignores it. Should be `getFeatureEffective('features.shadowQueue', false)`. The fallback value is correct; the routing is wrong.

**Violation 2 — `getSetting('features.park', false)` (line ~3258)**
Same pattern — bypasses `getFeatureEffective`. Functionally safe (false is the right default) but team-override blind.

**Violation 3 — `getSetting('features.precedentCiting', false)` (line ~8209)**
Same. Three feature-flag call sites that should route through `getFeatureEffective` still call `getSetting` directly. These were presumably written before `getFeatureEffective` was added in v7.1.2 and never migrated.

**Non-Violation (noted for clarity) — `getSetting('activeModsWindow', ...)` (line ~15868)**
No fallback argument, but this key is not in `DEFAULT_SETTINGS`. Return value is immediately passed to `setSetting` for persistence only; result is not used for logic in the same call. Effectively harmless but should have a fallback of `24` (hours) for defensive completeness.

### No Missing Fallbacks on Destructive Paths

All call sites that gate destructive actions (ban, deathrow, remove) use either a registered `DEFAULT_SETTINGS` entry or an explicit safe fallback. No path was found where a missing fallback could result in undefined behavior on a write action.

---

## Rule 30 — Storage Failures Logged, Never Crashing

**Verdict: MOSTLY COMPLIANT, with 6 bare-catch violations. Extension will not crash on any storage failure. Logging coverage is inconsistent.**

### Baseline: Extension Cannot Crash on Storage Failure

Every `chrome.storage.local.set` call is wrapped in either `try/catch` or `.catch()`. The extension has never been observed crashing on a storage write. Rule 30's "never crash" half is fully satisfied.

### The `gam_diag_log` Ring Buffer

Exists and works. `_diagLog(category, message, extra)` (line ~53) appends to `_diagBuffer` in-memory and mirrors to `chrome.storage.local['gam_diag_log']` (ring-capped at 500 entries). The `downloadDebugSnapshot()` function surfaces the buffer. The `_DIAG_KEY` constant is `'gam_diag_log'`.

The write for the diagnostic log itself uses a bare `.catch(function(){})` at line 76 — which is correct here. A diagnostic logger that crashes on its own write failure would be pathological. The bare catch on the diag write is intentional.

### Bare-Catch Violations (Rule 30)

Storage writes that swallow errors silently are violations. The following are confirmed bare `.catch(function(){})` or `.catch(()=>{})` on `chrome.storage.local.set` calls:

**Line ~76** — `_diagLog` internal write.
`chrome.storage.local.set({ [_DIAG_KEY]: log }).catch(function(){});`
EXEMPT: as noted above, diagnostic logger must not recurse on its own failure.

**Line ~1636** — `setSetting` non-token secret branch.
`.catch(() => {});` after the storage write for non-token secret keys.
VIOLATION: If `consentShown`, `isModBrowser`, or similar flags fail to write, the extension silently proceeds as if they were saved. Next session re-prompts consent or miscalibrates behavior. Should be: `.catch(e => console.warn('[gam] setSetting secret write failed', key, e));`

**Line ~1899** — `CachedStore.flush()`.
`chrome.storage.local.set({ [this.ns]: snap }).catch(function(){});`
VIOLATION: `CachedStore` backs `gam_mod_log`, `gam_users_roster`, `gam_deathrow`, etc. Silent flush failure means in-memory data is up to date but persistence is silently lost. If the page reloads, roster data may be stale. Should log with `console.warn('[gam] CachedStore flush failed', this.ns, e)`.

**Line ~2232** — `__syncMemSet` fire-and-forget.
`chrome.storage.local.set({ [key]: value }).catch(function(){});`
VIOLATION: This is the hot-path write for all non-sensitive keys when the flag is on. Silent failures here drop user-facing setting changes. Should log.

**Line ~4209, 4213, 4216** — Background script storage message handler.
Three bare `.catch(function(){})` calls in the `chrome.runtime.onMessage` handler when proxying storage writes from content scripts. Silent failure means a setting change from content-script context (e.g. DR rule add from triage console) is dropped without any record.
VIOLATION (3 sites, same root): Should at minimum `console.warn('[gam] bg storage write failed', key, e)`.

**Line ~8060-8074** — `chrome.storage.session.set` for macro drafts.
Multiple bare `.catch(function(){})` on session storage writes for draft state.
NON-VIOLATION: Session storage draft loss is low-stakes (drafts are ephemeral; loss is not data corruption). Acceptable bare catch.

### Non-Violations Confirmed

The following bare catches are acceptable by category:

- **Line 543** — `modmailTrackResponse` RPC fire-and-forget. Not storage; acceptable.
- **Line 4382** — DR audit log RPC. Not storage; acceptable.
- **Undo stack** (lines 4463, 4476) — Undo stack read/write failure is swallowed inside `try/catch`. The catch at 4476 correctly returns `null` so the caller sees "nothing to undo" rather than crashing. Acceptable.
- **IDB backup write** (line 1616) — Intentionally fire-and-forget since IDB is no longer the source of truth.
- **Session storage macro drafts** — Ephemeral; loss is acceptable.
- **RPC calls** (rpcCall, pushProfileToCloud, etc.) — Not storage; separate concern.

### Rule 30 Fix Surface

| Location | Key | Fix |
|---|---|---|
| line ~1636 | Non-token secret setSetting | `.catch(e => console.warn('[gam] setSetting failed', key, e))` |
| line ~1899 | CachedStore.flush | `.catch(e => console.warn('[gam] CachedStore flush failed', this.ns, e))` |
| line ~2232 | `__syncMemSet` | `.catch(e => console.warn('[gam] syncMemSet failed', key, e))` |
| lines ~4209, 4213, 4216 | BG script handler | Add `console.warn('[gam] bg storage write failed', key, e)` in each catch |

Minimum change: add a `console.warn` to each. Upgrade path: route into `_diagLog('storage', 'write-failed', { key, error: e.message })` so failures appear in the debug snapshot Commander pastes back for support.

---

## Summary

| Rule | Status | Critical Gaps |
|---|---|---|
| 28 — Optimistic UI | PARTIAL | Ban/unban/remove all post-confirm only; v7-NBA swallows errors silently |
| 29 — Safe Defaults | MOSTLY COMPLIANT | 3 feature flags bypass `getFeatureEffective`; 1 missing fallback on non-destructive path |
| 30 — Storage Failure Logging | MOSTLY COMPLIANT | 4 violation sites (non-token setSetting, CachedStore.flush, syncMemSet, BG handler) |

None of these gaps represent a crash risk. The violations are data-integrity and observability gaps: under storage pressure, setting changes and roster mutations can be silently dropped, and the debug log will not capture the failure for post-mortem analysis.

**Highest priority fix:** CachedStore.flush bare catch (line ~1899) — this backs the roster, mod log, and deathrow. Silent flush failure is the most likely to cause a support complaint ("my DR queue reset"). One line of `console.warn` makes it diagnosable.
