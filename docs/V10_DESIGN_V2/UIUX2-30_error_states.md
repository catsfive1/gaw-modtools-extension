# UIUX2-30 — Error States & Recovery
**v10.13 Design Ralph V2 | Cross-cutting**

---

## Context

v10.12.0 shipped `gamMakeError(opts)` — a DOM factory producing:
- Severity chip (`.gam-error-chip.hard` red | `.gam-error-chip.soft` amber)
- Message line (`.gam-error-msg`)
- Remediation hint (`.gam-error-hint`)
- Optional retry button (`.gam-error-retry`, calls `opts.retryFn`)

The factory exists in two places: `modtools.js` (content-script popovers) and `popup.js` (extension popup). Both are functionally identical. CSS lives in `popup.css` lines 2108–2160.

The snack toast (`gam-snack`) remains the ephemeral channel for transient errors; `gamMakeError` is for inline/persistent errors in panels and popovers.

This audit covers both channels.

---

## A. Error-Message Quality Scan — 20 sampled sites

### Snack errors (`snack(..., 'error')`)

| # | Call site (modtools.js line) | Message text | Actionable? | Root cause exposed? |
|---|---|---|---|---|
| 1 | 6133 | `'Action failed'` | NO | NO — NBA action threw; no info |
| 2 | 6166 | `'Remove failed'` | NO | NO — network vs API vs permission unknown |
| 3 | 6167 | `'Remove failed'` | NO | NO — duplicate of above (spam path) |
| 4 | 6170 | `'Sticky failed'` | NO | NO |
| 5 | 6487 | `'Note save failed'` | NO | NO |
| 6 | 7257 | `'Failed: ' + label` | PARTIAL | Label names the action but no cause or next step |
| 7 | 7220 | `'Undo failed: ' + err.message` | PARTIAL | Error message is surfaced; no remediation hint |
| 8 | 9339 | `'Unban failed'` | NO | NO |
| 9 | 9466 | `'Ban failed' + (loginRedirect ? ' — session expired' : '')` | PARTIAL | Session-expired variant is good; generic variant has nothing |
| 10 | 9808 | `'Save failed'` | NO | NO |
| 11 | 10084 | `'Remove failed'` | NO | NO |
| 12 | 10424 | `'Remove failed'` | NO | NO |
| 13 | 10376 | `` `${action} failed (${r.status}${hint})` `` | GOOD | HTTP status + optional hint appended |
| 14 | 14356 | `` `FAILED: ${username}` `` | NO | No cause, no action |
| 15 | 14358 | `` `FAILED: ${username}` `` | NO | Same |
| 16 | 1288 | `'Debug export failed: ' + e.message` | PARTIAL | e.message surfaced but no hint to user |
| 17 | 1533 | `'Bug report failed: ' + msg` | PARTIAL | msg is the worker error; no retry |
| 18 | 5999 | `'Mark failed: network'` | PARTIAL | Cause named; no retry affordance |
| 19 | 9425 | `'Ban blocked by preflight' + retryMsg` | GOOD | retryMsg appended if non-empty |
| 20 | 7986 | `'Mod Console: could not detect target user. Click on a username or use Ctrl+Shift+M on a post.'` | GOOD | Full remediation in message |

### Snack warns (`snack(..., 'warn')`)

| # | Call site | Message text | Quality |
|---|---|---|---|
| W1 | 5025 | `'Audit log flush failed'` | Bare — no hint, no retry |
| W2 | 5162 | `'Cannot undo action type: ' + last.type` | GOOD — names the type |
| W3 | 7719 | `'Auto-DR rule sync failed -- other mods may not see your change yet'` | GOOD — consequence stated |
| W4 | 12608 | `` `${username} unbanned — archive failed, archive manually` `` | GOOD — explicit user instruction |
| W5 | 12613 | `` `Failed to unban ${username} — may not be banned` `` | GOOD — hypothesis offered |
| W6 | 7131 | `fb` (fallback string var) | Unknown quality — depends on caller |

### `gamMakeError` usages (inline chips)

| # | Call site | severity | msg | hint | retryFn |
|---|---|---|---|---|---|
| P1 | popup.js 795 | hard | dynamic `r.error` | — | `loadStats` |
| P2 | popup.js 3741 | hard | `(r.error) \|\| 'no response'` | — | `loadMacros` |
| P3 | modtools.js 6218 | soft | `_nbaErrorMsg` | `'AI quota exhausted or model offline.'` | — |
| P4 | modtools.js 18535 | hard | `'Snapshot unavailable' + res.error` | `'Worker may be unreachable.'` | `_fetchAndRenderQueue` |
| P5 | modtools.js 18567 | hard | `e.message` | `'Check worker status.'` | `_fetchAndRenderQueue` |

**P1 and P2 are missing `hint`.** They have `retryFn` which is good, but zero remediation text — the user sees `ERR` chip + error string + RETRY button with no explanation of what went wrong or what to do if retry fails.

---

## B. Retry / Remediation Availability

### Summary

| Channel | # sites audited | Has retry | Has remediation hint | Both | Neither |
|---|---|---|---|---|---|
| `snack()` error | 20 | 0 | 7 (~35%) | 0 | 13 (~65%) |
| `snack()` warn | 6 | 0 | 4 (~67%) | 0 | 2 (~33%) |
| `gamMakeError` | 5 | 4 (80%) | 3 (60%) | 3 (60%) | 0 |

**Structural finding:** Snacks have no retry affordance by design (toast is ephemeral, pointer-events: none). This is acceptable IF the snack message contains enough information for the user to retry manually. Currently ~65% of error snacks give the user nothing to act on.

**`gamMakeError` usage is sparse** — only 5 call sites across the entire codebase. The factory shipped in v10.12.0 but adoption is essentially zero outside the queue popover and the stats/macros popup.

---

## C. Snack vs Banner vs Inline-Chip Decision per Surface

### Current state

| Surface | Channel in use | Appropriate? |
|---|---|---|
| NBA card actions (remove, spam, sticky) | `snack()` error | Acceptable for transient failures; message quality is the problem |
| Mod Console action errors | `snack()` error | Acceptable; action context is clear from context |
| Ban flow errors | `snack()` error | Mixed — some good (session-expired), some opaque |
| Undo errors | `snack()` error | Acceptable but message quality low |
| Queue popover load failure | `gamMakeError` hard + retry | CORRECT |
| Popup stats load failure | `gamMakeError` hard + retry | CORRECT |
| Popup macros load failure | `gamMakeError` hard + retry | CORRECT |
| AI panel error | `gamMakeError` soft + hint | CORRECT |
| Audit log flush | `snack()` warn | Should be `gamMakeError` soft — the audit panel is a persistent surface |
| Note save | `snack()` error | Should be inline error on the note form, not global snack |
| Death Row batch errors | `snack()` error | Acceptable — fires per-user, transient by nature |
| Auto-DR rule sync | `snack()` warn | Acceptable; message quality is good |

### Decision matrix (normative for v10.13)

```
ERROR TYPE                    SURFACE              CORRECT CHANNEL
─────────────────────────────────────────────────────────────────
Async fetch/load failure      Panel / popover      gamMakeError (hard, retryFn)
Async fetch/load failure      Modal body           gamMakeError (hard, retryFn)
User action rejection         Any                  snack('error') — ephemeral is fine
                                                   BUT message must name cause + hint
Form validation failure       Form                 Inline field error OR snack('warn')
  (empty field, bad format)                        NOT snack('error')
Background/service failure    Content-script only  snack('warn') — never blocking
  (audit flush, sync)
Recoverable fetch in panel    Panel inline         gamMakeError (soft, retryFn)
Fatal fetch in panel          Panel inline         gamMakeError (hard, retryFn)
Session expired               Any                  snack('error') + 'Session expired —
                                                   refresh the page' in message
```

---

## D. Generic-Error Patterns to Fix

### D1 — Opaque bare `'Remove failed'` (HIGH priority)

**Sites:** lines 6166, 6167, 10084, 10424

All fire from NBA / quick-action handlers. The `catch(e)` block discards the error. Fix: surface `e.message` and append a remediation hint.

```js
// BEFORE
} catch(e){ snack('Remove failed', 'error'); }

// AFTER
} catch(e){ snack('Remove failed: ' + (e && e.message || 'network error') + ' — try again or reload', 'error'); }
```

### D2 — `'Action failed'` with no context (HIGH priority)

**Site:** line 6133 — NBA generic wrapper.

The catch wraps an unknown `onClick()` call and loses all context. The action name is available in the calling closure. Fix: pass action name into the catch.

```js
// BEFORE
try { onClick(); } catch(err) { snack('Action failed', 'error'); }

// AFTER  
try { onClick(); } catch(err) { snack((actionLabel || 'Action') + ' failed: ' + (err && err.message || 'unknown'), 'error'); }
```

### D3 — `'FAILED: ${username}'` with no cause (MEDIUM priority)

**Sites:** lines 14356, 14358 — batch operation loop.

The batch context (what operation, what status code) is lost. At minimum the HTTP status should survive into the message.

### D4 — `'Note save failed'` with no inline error (MEDIUM priority)

**Site:** line 6487 — note panel save handler.

Notes have a persistent panel. A transient snack is wrong UX — the user writes something, it silently fails, the snack is gone before they read it. Fix: place a `gamMakeError` inline in the note panel body with `severity: 'soft'` and optional retryFn.

### D5 — `'Save failed'` (bare) (MEDIUM priority)

**Site:** line 9808

No context, no cause. Used in a settings-save path. Should include the subsystem name and the error message from the caught exception.

### D6 — `'Sticky failed'` (LOW priority)

**Site:** line 6170

Minor action; snack is appropriate surface. Upgrade message to: `'Sticky toggle failed: ' + (e && e.message || 'network error')`.

### D7 — `gamMakeError` calls missing `hint` (MEDIUM priority)

**Sites:** popup.js 795 (`loadStats`), popup.js 3741 (`loadMacros`)

Both have `retryFn` which is good. Both are missing `hint`. The user sees `ERR STATS` + error string + RETRY and has no idea what to do if retry fails repeatedly. Add `hint: 'Worker may be offline. Check your token in Settings.'` or equivalent.

### D8 — Audit log flush snack should be inline chip (LOW priority)

**Site:** line 5025

The audit panel is a persistent surface. A `warn` snack disappears in ~2s. If the flush fails silently, the mod won't know their log was lost. Replace with a `gamMakeError` soft chip inside the audit panel, or at minimum extend the snack timeout to 5s for this path.

---

## E. Effort Estimates

| Item | Change required | Files touched | Effort |
|---|---|---|---|
| D1 — Fix opaque 'Remove failed' x4 | Add `e.message` + hint to 4 catch blocks | `modtools.js` | XS (30 min) |
| D2 — NBA generic 'Action failed' | Thread action name through NBA catch | `modtools.js` | XS (30 min) |
| D3 — Batch FAILED:username | Capture HTTP status in batch loop | `modtools.js` | XS (15 min) |
| D4 — Note save inline error | Replace snack with `gamMakeError` soft in note panel | `modtools.js` | S (1h) |
| D5 — Bare 'Save failed' | Add subsystem + e.message | `modtools.js` | XS (15 min) |
| D6 — Sticky failed | Add e.message | `modtools.js` | XS (10 min) |
| D7 — gamMakeError missing hints | Add `hint:` to 2 popup call sites | `popup.js` | XS (20 min) |
| D8 — Audit flush inline chip | Replace snack with inline gamMakeError soft | `modtools.js` | S (1h) |
| Sweep remaining 'X failed' snacks | Add cause+hint across ~8 remaining sites | `modtools.js` | S (2h) |

**Total: ~6h across all items.**

Priority order: D1 → D2 → D7 → D4 → sweep → D3/D5/D6/D8.

---

## Design Spec — Error State Anatomy (for v10.13 implementation)

### Chip severity mapping

```
HARD (red)   — operation failed, data may be lost or inconsistent, retry needed
              bg: rgba(240,64,64,0.12)  border: rgba(240,64,64,0.4)  text: var(--bb-red)

SOFT (amber) — operation degraded, non-critical, user can continue
              bg: rgba(240,160,64,0.12) border: rgba(240,160,64,0.4) text: var(--bb-warn)
```

### Snack message formula (when gamMakeError is NOT the right surface)

```
[What failed]: [why it failed] — [what to do next]

GOOD: "Remove failed: HTTP 403 — you may not have mod permissions for this post"
GOOD: "Ban failed — session expired, refresh the page and try again"
GOOD: "Mark failed: network — check your connection and retry"
BAD:  "Remove failed"
BAD:  "Action failed"
BAD:  "FAILED: username"
```

### `gamMakeError` required fields

| Field | Required | Notes |
|---|---|---|
| `severity` | YES | `'hard'` or `'soft'` — default to `'hard'` if uncertain |
| `label` | YES | Subsystem name in caps: `'QUEUE'`, `'STATS'`, `'AI'`, `'MACROS'` |
| `msg` | YES | The actual error — include HTTP status or `e.message` where possible |
| `hint` | STRONGLY RECOMMENDED | What the user should do if the problem persists |
| `retryFn` | YES for async loads | Any panel that fetches data should offer retry |

### Surface routing (normative)

```
Panel/popover async load error  ->  gamMakeError (hard, retryFn, hint)
Form/modal async action error   ->  snack('error') with full message formula
Form validation (empty/invalid) ->  snack('warn') with field name + what to fix
Background service error        ->  snack('warn') if user-visible consequence exists
                                    _logError(ERR_SEV.MED) always in addition
```
