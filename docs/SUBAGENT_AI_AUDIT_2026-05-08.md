# AI Macro-Suggest Audit — 2026-05-08

## 1. Diagnosis: why the AI repeats itself

`gaw-mod-proxy-v2.js:4536` `handleMacrosAiSuggest` — root cause is **deterministic prompt + low-entropy sampling + no novelty signal**:

- **Static system prompt** (`:4561-4563`): the prompt enumerates the SAME scenarios every call ("inappropriate username, spam, trolling, doxing, vote manipulation, hate speech, repeat offender"). Llama lock-anchors to that list.
- **Static user prompt** (`:4564`): `Generate ${count} macros. ${ctx ?...}`. No seed, no nonce, no "avoid these existing labels" anti-list, no diversity instruction.
- **Sampling params** (`:4573-4574`): `temperature: 0.55`, no `top_p`, no `presence_penalty`, no `frequency_penalty`, no `seed`. 0.55 is too low for diversity AND no presence penalty means repeated tokens are not penalised across calls.
- **No state awareness**: existing macros are NOT fetched and passed in, so the model regenerates "Inappropriate Username", "Spam Account", "Trolling", etc. every time the team already has them.
- **Single-call architecture conflated with per-thread**: `popup.js:2136` (`__macroAiSeed`) and `modtools.js:7141` (`__ai__` option in ban-modal dropdown) BOTH hit the SAME endpoint with the SAME generic prompt. The ban-modal call has rich context (sender, violation, evidence URL) which is **discarded** — only `kind` and `count` are sent (`modtools.js:7144`).

## 2. Proposed two-endpoint split

| Endpoint | Purpose | Trigger | Inputs | Output |
|---|---|---|---|---|
| `POST /macros/ai-suggest` (existing, fix) | Library seed: novel team macros not yet in catalog | Popup "Generate" button (`popup.js:2191`) | `{ kind, count, existing_labels[] }` | 5 macros, none duplicating `existing_labels` |
| `POST /modmail/ai-reply-for-thread` (NEW) | Per-thread reply drafting: 2 distinct candidate replies | Inline chip in modmail thread + ambient on ban-modal (`modtools.js:7141` replaces dropdown `__ai__`) | `{ thread_id, sender, subject, last_messages[], violation?, evidence_url? }` | `{ replies: [{label, body, tone}, {label, body, tone}] }` |

## 3. Per-thread prompt structure (`/modmail/ai-reply-for-thread`)

```
SYSTEM: You draft modmail replies for GAW moderators. Output JSON:
  {"replies":[{"label":"...","body":"...","tone":"firm|empathetic|brief"}]}
  Body <=280 chars, ends "WWG1WGA." No placeholders. Reply addresses
  THIS specific user's THIS specific message — never generic.

USER:
  Thread: {subject}
  From:   u/{sender}
  Last 3 messages (most recent last):
    [{author}] {body}
    ...
  {if violation}: Mod context: {violation}, evidence: {evidence_url}
  Generate exactly 2 replies that differ in TONE (firm vs empathetic)
  AND ANGLE. Do not propose identical reasoning twice.
```

## 4. Model parameter deltas

| Param | Library (`/macros/ai-suggest`) | Per-thread (`/modmail/ai-reply-for-thread`) |
|---|---|---|
| `temperature` | **0.85** (was 0.55) | 0.7 |
| `top_p` | 0.9 | 0.95 |
| `presence_penalty` | 0.6 | 0.4 |
| `frequency_penalty` | 0.3 | 0.2 |
| `seed` | `Date.now() & 0xffff` | `hash(thread_id + msg_count)` |
| `max_tokens` | 1500 | 600 |

**Anti-repeat guard for library**: pass `existing_labels` from caller (fetched via `macrosList` first), inject into system prompt as `Avoid duplicating these existing labels: [...]`. Reject any returned `label` whose Levenshtein distance < 4 from any existing label, retry once with stronger anti-list.

## 5. Front-end integration points

**Library flow (existing, patch):**
- `popup.js:2142-2144` — fetch current macros first, pass `existing_labels: macros.map(m=>m.label)` in args.
- `modtools-ext/background.js` `macroAiSuggest` RPC handler — forward `existing_labels`.
- Server `gaw-mod-proxy-v2.js:4546-4549` — accept `existing_labels[]`, inject into prompt.

**Per-thread flow (NEW):**
- New RPC `modmailAiReplyForThread` in background.js, posts to `/modmail/ai-reply-for-thread`.
- **Inline chip**: in modmail thread renderer (search `modtools.js` for the modmail thread DOM root — likely near the existing reply textarea), inject a `[✨ Suggest 2 replies]` chip above the reply box. On click → call RPC → render side-by-side preview cards (NOT `window.confirm` — it's modal-blocking and ugly). Each card has `[Use this]` button → populates reply textarea.
- **Ban-modal replacement**: `modtools.js:7141-7164` — the `__ai__` branch currently calls library endpoint. Replace with per-thread call passing `{ violation: vSel.value, sender: targetUser, evidence_url: evidenceLink, last_messages: [] }`. Render 2 cards in a div appended after `msgIn`, each `[Use]` button writes to `msgIn.value`.

**Render shape (2-option preview):**
```
+----------------------------+  +----------------------------+
| Firm:  "Final warning..."  |  | Empathetic: "We hear..."   |
| [Use this]    [Edit]       |  | [Use this]    [Edit]       |
+----------------------------+  +----------------------------+
[Regenerate both] [Cancel]
```

**Files to touch**: `gaw-mod-proxy-v2.js` (new handler + route at `:11105`), `background.js` (new RPC), `modtools.js:7141` (ban-modal swap) + new modmail-thread chip insertion, `popup.js:2143` (existing_labels passthrough). No schema migration required — per-thread results are ephemeral, not stored.
