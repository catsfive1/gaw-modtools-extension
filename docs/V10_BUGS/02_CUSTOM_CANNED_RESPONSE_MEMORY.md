# Bug 2 — Custom-Modified Canned Response Memory

---

## A. CURRENT BEHAVIOR (what's lost)

When a mod selects a team macro from the ban-tab dropdown (`#mc-ban-macro-pick`) or
the modmail-message-tab dropdown (`#mc-msg-macro-pick`), the macro body fills the
textarea. The mod may then edit that text before clicking BAN or Send. That edited
body is not persisted anywhere specific to "was a macro, then modified." On send,
the dropdown resets to the placeholder option, and the edited body is gone — session
and cross-session.

The existing `attachDraftPersistence` system (SuperMod, `gam_draft_<action>_<user>`,
~line 20460) does save textarea content on `input` events, but it does NOT track
which macro the content was derived from. That means:

- There is no "draft restored" indicator when the panel reopens.
- Auto-promote logic ("you wrote this same thing 3 times — save it?") is impossible
  because the base macro ID is unknown.
- The draft-restore path is generic; the mod has no signal that this is a macro
  they edited vs. free-form text.

---

## B. STORAGE SHAPE

Use `chrome.storage.session` (tab-local, cleared on browser close — correct TTL for
this use case; no cross-device bleed of in-progress moderation).

Key: `gam_macro_drafts`

```
gam_macro_drafts: {
  "<kind>:<target_user>": {
    body:          string,       // the current edited text
    base_macro_id: number|null,  // ID of the last macro that seeded it (null = freehand)
    base_body:     string,       // snapshot of macro body at select time (for dirty-check)
    modified_at:   number,       // Date.now() when last edited
    promote_count: number        // how many times this same body has been saved (cross-session tally)
  }
}
```

`kind` values mirror the existing RPC kinds: `ban_msg`, `mm_reply`.
`target_user` is the lowercase username currently open in the Mod Console.

The `base_body` field is critical: it lets us diff `textarea.value !== entry.base_body`
on reopen to display the "draft restored" chip without re-fetching the macro from
the worker.

Promote-count persistence for the auto-promote feature lives in
`chrome.storage.local` (survives browser close):

```
gam_macro_promote_counts: {
  "<sha256 of trimmed body>": number   // increment on each save
}
```

Using a content hash rather than the verbatim body keeps the storage O(1) per unique
draft regardless of body length.

---

## C. INSERT POINT (textarea input listener)

Both macro dropdown handlers (`macroPick.addEventListener('change', ...)` at ~line
7321 and `msgMacroPick.addEventListener('change', ...)` at ~line 8108) share the
same terminal block that fires on real macro selection:

```js
// ban tab (~line 7451-7454):
const body = opt.dataset.body || '';
if (msgIn) msgIn.value = (evidenceLink ? urlPrefix : '') + body;
rpcCall('macroUse', { id: parseInt(opt.value, 10) }).catch(function(){});

// modmail message tab (~line 8180-8182):
if (body) body.value = opt.dataset.body || '';
rpcCall('macroUse', { id: parseInt(opt.value, 10) }).catch(() => {});
```

**Insert after each of these two blocks** — record the base snapshot:

```js
// Immediately after the textarea is filled and macroUse fires:
(async function _recordMacroDraftBase() {
  const kind   = 'ban_msg';                          // or 'mm_reply' in msg tab
  const user   = (username || '').toLowerCase();
  if (!user) return;
  const macroId   = parseInt(opt.value, 10);
  const macroBody = opt.dataset.body || '';
  const stored    = (await chrome.storage.session.get('gam_macro_drafts').catch(() => ({}))).gam_macro_drafts || {};
  stored[kind + ':' + user] = {
    body:          msgIn.value,  // includes urlPrefix for ban tab
    base_macro_id: macroId,
    base_body:     msgIn.value,  // same as body at t=0; diverges on edit
    modified_at:   Date.now(),
    promote_count: stored[kind + ':' + user]?.promote_count || 0
  };
  chrome.storage.session.set({ gam_macro_drafts: stored }).catch(() => {});
})();
```

Then attach a single `input` listener to the textarea (guarded by a `dataset` flag to
prevent double-attachment) that updates `body` and `modified_at` on every keystroke:

```js
if (!msgIn.dataset.gamMacroDraftAttached) {
  msgIn.dataset.gamMacroDraftAttached = '1';
  msgIn.addEventListener('input', function _macroDraftUpdate() {
    const kind = 'ban_msg'; // or 'mm_reply'
    const user = (username || '').toLowerCase();
    if (!user) return;
    chrome.storage.session.get('gam_macro_drafts').then(out => {
      const stored = (out && out.gam_macro_drafts) || {};
      const key    = kind + ':' + user;
      if (!stored[key]) return;  // only track if a macro seeded it
      stored[key].body        = msgIn.value;
      stored[key].modified_at = Date.now();
      chrome.storage.session.set({ gam_macro_drafts: stored }).catch(() => {});
    }).catch(() => {});
  });
}
```

This is additive to `attachDraftPersistence` — the two systems coexist. The macro
draft is a narrower, lighter record; the SuperMod draft handles general free-form
content and cross-mod sync. On send, clear both (see Section H).

---

## D. RESTORE POINT (Mod Console open for user)

Both `renderBanTab` (~line 7172) and `renderMsgTab` (~line 8043, approx) build their
HTML then wire up event handlers. The restore runs **after** the `root.innerHTML`
assignment and **before** the existing macro dropdown fetch, so the textarea is already
in the DOM.

```js
// After: const msgIn = root.querySelector('#mc-ban-msg');
// Before: if (macroPick) { rpcCall('macrosList', ...) }

(async function _restoreMacroDraft() {
  const kind = 'ban_msg'; // or 'mm_reply'
  const user = (username || '').toLowerCase();
  if (!user || !msgIn) return;
  const out = await chrome.storage.session.get('gam_macro_drafts').catch(() => ({}));
  const stored = (out && out.gam_macro_drafts) || {};
  const entry  = stored[kind + ':' + user];
  if (!entry || !entry.body) return;
  // Only restore if the mod actually edited the macro (body differs from base)
  const isDirty = entry.body !== entry.base_body;
  if (!isDirty) return;
  // Don't clobber a textarea that already has content (e.g., urlPrefix pre-fill)
  const currentContent = (msgIn.value || '').trim();
  const urlOnlyContent = evidenceLink ? urlPrefix.trim() : '';
  if (currentContent && currentContent !== urlOnlyContent) return;
  msgIn.value = entry.body;
  _showDraftChip(msgIn, entry, kind, user);  // Section E
})();
```

---

## E. UI CHIP ("draft restored — clear")

A thin chip sits in the top-right corner of the textarea's parent `.gam-mc-field`
div. Absolute-positioned, dismissable, auto-fades.

```js
function _showDraftChip(ta, entry, kind, user) {
  const field = ta.closest('.gam-mc-field');
  if (!field) return;
  field.style.position = 'relative';
  const age = Math.max(1, Math.round((Date.now() - (entry.modified_at || Date.now())) / 60000));
  const chip = document.createElement('div');
  chip.style.cssText = [
    'position:absolute;top:0;right:0;background:#1a1a2e;border:1px solid #ff9933',
    'color:#ff9933;font:600 9px ui-monospace,monospace;letter-spacing:.07em',
    'text-transform:uppercase;padding:2px 7px;display:flex;gap:6px;align-items:center',
    'z-index:10;opacity:1;transition:opacity 0.3s'
  ].join(';');
  const label = document.createElement('span');
  label.textContent = 'draft restored ' + age + 'm ago';
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'clear';
  clearBtn.style.cssText = 'background:none;border:none;color:#9b9892;cursor:pointer;font:600 9px ui-monospace,monospace;padding:0';
  clearBtn.addEventListener('click', function() {
    chip.remove();
    ta.value = evidenceLink ? urlPrefix : '';
    // Wipe the stored draft
    chrome.storage.session.get('gam_macro_drafts').then(out => {
      const stored = (out && out.gam_macro_drafts) || {};
      delete stored[kind + ':' + user];
      chrome.storage.session.set({ gam_macro_drafts: stored }).catch(() => {});
    }).catch(() => {});
  });
  chip.appendChild(label);
  chip.appendChild(clearBtn);
  field.appendChild(chip);
  // Auto-fade after 8s (chip stays in DOM — just low-opacity, still dismissable)
  setTimeout(() => { chip.style.opacity = '0.35'; }, 8000);
}
```

The chip is non-blocking — it does not disable the textarea, add a confirmation
prompt, or intercept the send button. It's purely informational.

---

## F. AUTO-PROMOTE-TO-MACRO LOGIC

**Trigger condition:** when the draft is cleared on successful send (`_clearMacroDraft`
in Section H), check if the same body has been sent 3 or more times:

```js
async function _maybeSuggestPromote(kind, body) {
  if (!body || !body.trim()) return;
  // Compute a simple djb2 hash (no SubtleCrypto to avoid async complexity)
  let h = 5381;
  for (let i = 0; i < body.length && i < 2000; i++) h = ((h << 5) + h) ^ body.charCodeAt(i);
  const hashKey = 'k' + (h >>> 0).toString(36);
  const out  = await chrome.storage.local.get('gam_macro_promote_counts').catch(() => ({}));
  const cnts = (out && out.gam_macro_promote_counts) || {};
  cnts[hashKey] = (cnts[hashKey] || 0) + 1;
  await chrome.storage.local.set({ gam_macro_promote_counts: cnts }).catch(() => {});
  if (cnts[hashKey] >= 3) {
    _promptPromote(kind, body, hashKey, cnts);
  }
}

function _promptPromote(kind, body, hashKey, cnts) {
  // Reuse _gamPromptMacro (already exists, ~line 7328) with the body pre-filled.
  _gamPromptMacro({
    title:       'Save this as a team macro?',
    subtitle:    "You've sent this same text " + cnts[hashKey] + ' times. Add it to the shared library?',
    defaultBody: body
  }).then(result => {
    if (!result) return;
    rpcCall('macroUpsert', { kind: kind, label: result.label, body: result.body })
      .then(r => {
        if (r && r.ok && r.data && r.data.ok) {
          snack('Macro saved to team', 'success');
          // Reset counter so it doesn't re-prompt immediately
          cnts[hashKey] = 0;
          chrome.storage.local.set({ gam_macro_promote_counts: cnts }).catch(() => {});
        }
      });
  }).catch(() => {});
}
```

This runs only on clean sends, never on cancel or Esc-close.

---

## G. SHIP-TONIGHT PATCH (file:line + diff)

**File:** `D:\AI\_PROJECTS\modtools-ext\modtools.js`

### Patch 1 — ban tab macro selection (~line 7451)

After the existing line:
```js
rpcCall('macroUse', { id: parseInt(opt.value, 10) }).catch(function(){});
```
Insert the `_recordMacroDraftBase` IIFE (Section C, using `kind = 'ban_msg'`,
textarea ref = `msgIn`, `username` already in scope via `renderBanTab` param).

Also attach the `input` listener block immediately after (Section C, second block).

### Patch 2 — modmail msg tab macro selection (~line 8181)

After the existing line:
```js
rpcCall('macroUse', { id: parseInt(opt.value, 10) }).catch(() => {});
```
Insert the same IIFE with `kind = 'mm_reply'`, textarea ref = `body` (the local
`const body = root.querySelector('#mc-msg-body')` already declared at line 8076).
`username` is in scope via `renderMsgTab` param.

### Patch 3 — ban tab restore (~line 7262, after msgIn assignment)

After:
```js
const msgIn = root.querySelector('#mc-ban-msg');
```
Insert the `_restoreMacroDraft` IIFE (Section D, `kind = 'ban_msg'`).

### Patch 4 — modmail msg tab restore (~line 8076, after body assignment)

After:
```js
const body = root.querySelector('#mc-msg-body');
```
Insert `_restoreMacroDraft` with `kind = 'mm_reply'`, textarea ref = `body`.

### Patch 5 — clear on send (ban tab ~line 7878, msg tab ~line 8212)

Both send handlers already call `SuperMod.clearDraft`. Add the macro draft clear
alongside:

```js
// After SuperMod.clearDraft call on successful send:
(function _clearMacroDraft() {
  const kind = 'ban_msg'; // or 'mm_reply'
  const user = (username || '').toLowerCase();
  const sentBody = msgIn.value;  // capture before clear
  chrome.storage.session.get('gam_macro_drafts').then(out => {
    const stored = (out && out.gam_macro_drafts) || {};
    delete stored[kind + ':' + user];
    chrome.storage.session.set({ gam_macro_drafts: stored }).catch(() => {});
  }).catch(() => {});
  // Kick promote-check asynchronously (non-blocking)
  _maybeSuggestPromote(kind, sentBody).catch(() => {});
})();
```

### Helper functions

Add `_showDraftChip`, `_maybeSuggestPromote`, `_promptPromote` as module-level
functions in the SuperMod IIFE block (around line 20419, near `clearDraft` and
`attachDraftPersistence`). They use no globals beyond `chrome.storage`, `rpcCall`,
`_gamPromptMacro`, and `snack` — all already in scope.

Total new LOC: ~120. No new RPC endpoints required. No manifest changes.

---

## H. EDGE CASES

**Mod switches users mid-session.**
Each draft key includes the username. Switching Mod Console to a different user
reads a different key — no bleed. Old keys remain in `gam_macro_drafts` until the
browser session closes (chrome.storage.session TTL). No cleanup needed.

**Mod opens the same user in two tabs.**
`chrome.storage.session` is per-tab in Manifest V3. Each tab has its own session
store. The two tabs will not see each other's macro drafts. This is acceptable —
cross-tab macro draft sync is out of scope. (Cross-mod free-form drafts are already
handled by the SuperMod D1 layer.)

**Draft clear on send — partial send failure.**
The send handlers already guard: if the API call fails, the button re-enables and
no `clearDraft` is called. The macro draft clear (Patch 5) sits inside the success
branch (`if (r.ok)`), so a failed send does not wipe the draft.

**Mod edits the macro, then clicks "Add custom (save to team)" with that same text.**
The `__add__` branch pre-fills `_gamPromptMacro` from `msgIn.value` (already
implemented at line 7331). After saving to team, the dropdown resets to the
placeholder. The input listener will continue tracking further edits normally.

**urlPrefix entanglement (ban tab).**
The ban-tab textarea is pre-filled with `urlPrefix` (the offending post URL + two
newlines). Macros are stored body-only; at selection time the code prepends
`urlPrefix` (line 7453). The `base_body` snapshot captures the post-prefix value.
Dirty-check `body !== base_body` therefore correctly fires only if the mod typed
beyond the prefix, not on first open.

**`base_macro_id` is null (freehand text).**
The input listener only writes to a draft entry if `stored[key]` already exists
(i.e., a macro was selected first). Freehand typing never creates a macro-draft
entry. The SuperMod general draft handles freehand. The two paths do not overlap.

**Auto-promote fires on a body that was already saved as a macro.**
The mod saves via `__add__`, then sends the same text. `_maybeSuggestPromote`
fires. The content hash will reach 3 again if they keep using it. Acceptable
UX — the promote prompt is a snooze-able suggestion via `_gamPromptMacro`, and
on dismissal the counter is not reset (by design: if they keep declining, they
keep getting reminded). If this proves annoying in practice, add a
`gam_macro_promote_suppressed: { [hash]: true }` suppression store.

**Mod Console Mod Chat textarea (`gam-mc-textarea`, line 14107).**
This textarea is for team chat (not user-facing), has no macro dropdown, and is
excluded from this feature.
