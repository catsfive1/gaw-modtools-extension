# UIUX2-32 — Copy & Voice Audit

**Scope:** User-facing strings across ban modal, status snacks, error messages, button labels, confirm dialogs, tooltips, placeholder text, and first-run wizard. Based on a 30-string sample drawn from `popup.html`, `popup.js`, and `modtools.js` (v10.13 dist).

**Voice target:** Operator console. Bloomberg-terminal register. Terse imperatives. No marketing fluff. No exclamation points outside Welcome. Acronyms (DR, SUS, AI) established and held consistently.

---

## A. Voice Consistency Scan — 30 Sampled Strings

| # | Surface | Current string | Voice rating | Notes |
|---|---------|----------------|--------------|-------|
| 1 | Button (ban modal) | `BAN (reason sent as message)` | PASS | Imperative, explanatory parenthetical acceptable |
| 2 | Button (ban modal) | `UNBAN` | PASS | Terse imperative |
| 3 | Button (ban modal) | `Cancel` | PASS | Standard |
| 4 | Snack (ban success) | `Banned ${username}` | PASS | Terse, named subject |
| 5 | Snack (unban) | `✓ ${username} unbanned` | PASS | Confirmed action, correct register |
| 6 | Snack (DR success) | `↩ Restored ${last.target} from Death Row` | PASS | Undo confirm, correct |
| 7 | Snack (DR queue) | `${username} on Death Row - ${label}` | FLAG | Uses `-` not `—`. Minor but inconsistent with em-dash used elsewhere |
| 8 | Snack (warning sent) | `Warning sent to ${username}` | PASS | Terse |
| 9 | Snack (note saved) | `Note saved for ${username}` | PASS | Correct |
| 10 | Snack (undo nothing) | `Nothing to undo` | PASS | Precise |
| 11 | Snack (sticky failed) | `Sticky failed` | PASS | Names what failed. No fix hint. Acceptable for one-shot action |
| 12 | Snack (remove failed) | `Remove failed` | FAIL — no fix path | Same pattern repeated: names failure, no recovery hint |
| 13 | Snack (action failed) | `Action failed` | FAIL — vague | Does not name what action. Catch-all string leaks through to UI |
| 14 | Snack (bug report) | `Bug report submitted -- Commander will see it shortly. ID: ${id}` | FAIL — marketing voice | "Commander will see it shortly" is informal, future-promise phrasing. Not operator register. |
| 15 | Confirm dialog | `Add ${username} to Death Row (72h)?\n\nThis will queue a ban. You can undo within 20s via the status bar.` | PASS | Accurate, states consequence + undo path |
| 16 | Confirm dialog | `Ban ${triageSelected.size} user(s) NOW? This is irreversible.` | PASS | Terse, danger signal present |
| 17 | Confirm dialog | `Clear all?` | FAIL — underspecified | No subject ("Clear all notes?" / "Clear all macros?"). Ambiguous. |
| 18 | Confirm dialog | `Are you ABSOLUTELY sure? This deletes all team chat messages permanently.` | FAIL — redundant double-confirm + caps shout | Duplication of the first confirm. `ABSOLUTELY sure?` is melodramatic, not operator-toned. Collapse to one confirm with clear consequence. |
| 19 | Button (status bar) | `Retry` | PASS | Correct imperative |
| 20 | Button (first-run wizard) | `Save & verify` | PASS | Action-chained, clear |
| 21 | Tooltip (mod action btn) | `MANAGE /USERS — Triage flagged accounts. Batch-ban, Death Row queue, suspicious filter, cluster alerts. Click any row to drill into Mod Console.` | PASS | Dense, operator-appropriate |
| 22 | Tooltip (queue) | `MOD QUEUE — Posts + comments awaiting decision. Death Row count appears in the Stats tab. Act here to prevent items expiring unreviewed.` | PASS | Correct register |
| 23 | Snack (macro save) | `✓ Macro saved to team` | PASS | Terse confirm |
| 24 | Inline status | `validating...` | PASS | Present progressive, expected for async ops |
| 25 | Inline status | `no active GAW tab -- open greatawakening.win in this window` | FAIL — missing fix path specificity | Tells what to do but uses `--` not `—`. More critically: says "open…" which is correct but lowercase run-on format is inconsistent with the rest. |
| 26 | First-run step 2 | `Paste the FULL invite URL your lead sent you (https://greatawakening.win/?mt_invite=...)` | FAIL — mixed case + marketing-adjacent phrasing | "your lead sent you" is conversational. Caps on FULL is inconsistent with console register. |
| 27 | Welcome toast | `Welcome, ${user}! Your token is stored and ModChat is live. You're ready to moderate.` | CONDITIONAL PASS | Exclamation point is acceptable (first-run welcome only). "You're ready to moderate" is slightly consumer-app but forgivable at this single moment. |
| 28 | Error snack | `Bug report failed: ${msg}` | PASS | Names failure + delegates detail to msg |
| 29 | Placeholder | `Leave a short note for other mods about this user...` | FAIL — descriptive not imperative | Placeholder text should be a terse noun: `Mod note (visible to team only)` |
| 30 | Placeholder | `AI analysis will appear here...` | FAIL — passive, redundant | This field is read-only; placeholder is noise. Remove entirely or use `(waiting for analysis)` |

---

## B. Marketing-Voice Violations

Five strings cross into consumer-app or editorial register. In priority order:

**B.1 — `Bug report submitted -- Commander will see it shortly. ID: ${id}`**
- "Commander will see it shortly" is a promise / reassurance, not a state report.
- Fix: `Bug report submitted · ID: ${id}`

**B.2 — `Are you ABSOLUTELY sure? This deletes all team chat messages permanently.`**
- Second consecutive confirm, melodramatic caps.
- Fix: collapse into single confirm: `Wipe all team chat? This cannot be undone.`

**B.3 — `Leave a short note for other mods about this user...`**
- Instructional filler in placeholder. User knows what the field is for.
- Fix: `Mod note (team-visible)` or remove placeholder if label is sufficient.

**B.4 — `You're ready to moderate.` (welcome toast)**
- Mild consumer-app tone but this is the one acceptable softness (first-run moment).
- Leave if Commander is satisfied; otherwise: `Token stored. You're live.`

**B.5 — `Paste the FULL invite URL your lead sent you`**
- Conversational phrasing in a flow that otherwise uses structured labels.
- Fix: `Paste the invite URL (https://greatawakening.win/?mt_invite=...)`

---

## C. Verb-Tense Drift

The codebase is mostly consistent on past-tense confirms ("Banned", "Saved", "Stored") and present-progressive for in-flight ("validating...", "Sending ban...", "Unbanning..."). Three deviations found:

**C.1 — Mixed past / present on undo snacks**
- `↩ Restored ${user} from Death Row` — past tense ✓
- `↩ Re-queued ${user} on Death Row` — past tense ✓
- `↩ Undo: removed ${last.target} from Death Row` (tooltip) — present tense ("Undo: removed") — mixed. Normalize to past: `Removed ${target} from DR — click to undo`

**C.2 — `Arm DR Sniper on ${username}?` (confirm)**
- Imperative question, acceptable for confirm. But the snack that follows uses past tense (`${username} sniper armed`) — consistent. No fix needed.

**C.3 — In-flight labels inconsistent casing**
- `validating...` (lowercase)
- `Sending ban...` (title case)
- `Preflight check...` (title case)
- `requesting...` (lowercase, invite)
- `Sending warning message...` (title case)
- Pattern: async status labels should be uniformly sentence-case (first word cap, rest lower): `Validating...`, `Sending ban...`, `Preflight check...`. The lowercase outliers (`validating...`, `requesting...`) should be uppercased.

---

## D. Acronym vs Spell-Out Rules

Current state extracted from sampled strings. Recommendation follows each.

| Term | Current usage | Rule |
|------|---------------|------|
| **DR** | Mixed: "Death Row" (full) in labels/tiles, "death row" (lowercase, inconsistent) in snacks, "DR" in code comments | **Establish:** Tiles and headers: `Death Row`. Snacks and tooltips after first mention: `DR`. Never `death row` (lowercase). |
| **SUS** | `SUS` in all-caps in code/labels (`Mark SUS`, `Clear SUS`, `SUS users`, `SUS USER`). One snack uses lowercase `sus` in a data attribute. | **Establish:** Displayed text always `SUS` (all-caps, no period). Data attributes can use lowercase internally. |
| **AI** | `AI today`, `AI: suggest...`, `[AI] Detection`, `AI summary`, `Custom AI Reply`. Consistently capitalized. | **Confirmed established.** No drift found. |
| **DR Sniper** | Used once in confirm dialog (`Arm DR Sniper on...`). | Acceptable compound; use consistently if feature is named. |
| **PERMA** / **PERMANENT** | `PERMA-BANNED` (snack) vs `PERMANENT BAN — Preflight` (modal title). | Both are correct in context (snack = terse, modal title = formal). Keep. |
| **Tards / TARD** | Used in UI labels (`Possible Tards Threshold`), settings toggle text, and section headers. Internal operational term, not exposed to end-users. Acceptable for operator console if intentional. | No change needed; confirm this surface is operator-only and never leaks to banning notifications sent to users. |
| **SUS/DR** | Compound used in settings label (`Auto-Remove SUS/DR Queue Items`). | Acceptable. Use slash notation consistently: `SUS/DR` not `SUS + DR`. |

---

## E. Error Messages — Cause + Fix Audit

Operator-grade error messages must state (1) what failed and (2) how to fix it. Failures found:

**E.1 — Vague catch-all: `Action failed`**
- Location: `modtools.js` general action handler
- Fix: Log the specific action type in the catch and surface it: `${actionType} failed` at minimum. If the error object has `.message`, append it.

**E.2 — No-fix messages: `Remove failed`, `Sticky failed`**
- These name the failure but give no remediation path. At minimum, add: `Remove failed — check session and retry` or link to the relevant retry path.
- Given these are transient snacks (3–5s), full fix text is appropriate: `Remove failed — session may have expired`.

**E.3 — Over-general: `⚠ Unban failed -- check session, try again`**
- Location: ban modal inline status
- This is actually good — it names two actionable steps. PASS. Minor: replace `--` with `—`.

**E.4 — `Worker says that is NOT a token -- it looks like an INVITE CODE. Click "Claim invite" + enter your GAW username.`**
- Good pattern: states cause + fix path. PASS.
- Minor: replace `+` with `and`, match sentence style.

**E.5 — `rejected (HTTP ${r.status}) — check token matches what the lead gave you`**
- Correct operator pattern. PASS.

**E.6 — `malformed token (expected 32-256 chars alphanumeric + _-)`**
- Correct. PASS. The spec is in the message.

**E.7 — `network error: ${e.message}`**
- Surfaces raw JS exception. Acceptable at this surface (operator console). PASS.

**E.8 — `Ban blocked by preflight — will retry next visit`** (Death Row executor snack)
- Passive, ambiguous retry condition. Fix: `Death Row exec blocked for ${username} — preflight rejected. Retry on next /ban visit.`

---

## F. Effort Assessment

| Category | Issues found | Severity | Estimated fix effort |
|----------|-------------|----------|---------------------|
| Marketing-voice violations | 5 strings | Low–Medium | 30 min (string replacements) |
| Verb-tense drift | 3 patterns | Low | 20 min (async label casing normalization) |
| Acronym discipline | 1 gap (DR case inconsistency in snacks) | Low | 15 min |
| Error messages missing fix path | 3 strings (`Action failed`, `Remove failed`, `Sticky failed`) | Medium | 30 min (need catch-context plumbing) |
| Placeholder text voice | 2 strings | Low | 5 min |
| Double-confirm consolidation | 1 dialog pair | Medium | 15 min (UX flow change, not just text) |
| Dash normalization (`--` → `—`) | ~8 occurrences across snacks + status lines | Low | 10 min |
| **Total** | **23 issues** | | **~2h** |

### Priority order for fixes

1. `Action failed` (E.1) — vague error leaks to users, fix is architectural (pass action name into catch)
2. Double-confirm chat wipe (B.2) — double confirm anti-pattern, consolidate
3. `Remove failed` / `Sticky failed` session hint (E.2) — common user confusion path
4. DR snack casing — `death row` lowercase in snacks (D.1)
5. Async label casing normalization (C.3) — `validating...` → `Validating...`
6. Remaining marketing-voice strings (B.1, B.3, B.5) — text replacements

No structural changes required for items 4–6. Items 1–3 touch JS logic.
