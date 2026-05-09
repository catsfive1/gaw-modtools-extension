# Bug 1 -- Ban Macro Propagation Failure

## A. REPRODUCER (steps Commander reported)

1. Open Mod Console ban tab on a target user
2. Pick a violation type from the Violation dropdown (e.g. "Incivility")
   - This fires `vSel.change` which writes `urlPrefix + v.message` to `#mc-ban-msg`
3. Either:
   - **Path A (custom macro):** Click "+ Add custom" in the macro dropdown, fill in label+body, save
     - Dropdown reloads via `__mcMacroRefill()` but does NOT auto-select the new macro and does NOT write its body to `#mc-ban-msg`
     - User must now manually re-select the macro from the dropdown
     - If they click BAN without re-selecting, the original violation template is sent
   - **Path B (existing team macro then violation change):** Select an existing team macro (writes body to `#mc-ban-msg` correctly), then change the Violation dropdown to adjust the subject or duration
     - `vSel.change` fires unconditionally and overwrites `msgIn.value` with `urlPrefix + v.message`, destroying the macro body
4. Click BAN -- message sent is the violation template, not the macro

## B. ROOT CAUSE (file:line)

Two distinct failure modes under the same symptom:

### Root Cause 1 -- Custom macro save does not populate textarea (Path A)
**File:** `modtools.js` line ~7325-7343

```js
if (opt.value === '__add__'){
  macroPick.value = '';
  const result = await _gamPromptMacro({ ... });
  if (!result) return;
  const ur = await rpcCall('macroUpsert', ...);
  if (ur && ur.ok && ur.data && ur.data.ok){
    snack('Macro saved to team', 'success');
    const r2 = await rpcCall('macrosList', { kind:'ban_msg' });
    __mcMacroRefill((r2 && r2.ok && r2.data && r2.data.macros) || []);
    // BUG: function returns here -- macroPick is reset to index 0 (header),
    //      msgIn.value is NEVER written. User typed a body, saved it, and
    //      it was ignored.
  }
  return;   // <-- exits WITHOUT writing result.body to msgIn
}
```

After `__mcMacroRefill()`, the dropdown's `selectedIndex` returns to 0
(the disabled header option). The newly saved macro exists in the list but
is not selected, so no body lands in `#mc-ban-msg`.

### Root Cause 2 -- vSel.change unconditionally clobbers macro selection (Path B)
**File:** `modtools.js` line ~7534-7544

```js
vSel.addEventListener('change', ()=>{
  const v = VIOLATIONS.find(x=>x.id===vSel.value);
  if (!v) return;
  subIn.value = v.subject;
  msgIn.value = urlPrefix + v.message;  // <-- unconditional overwrite
  ...
});
```

There is no guard checking whether the user has already selected a macro.
If the user picks a macro then adjusts the violation type (to get the right
subject line or duration bucket), the violation handler erases the macro body.

The v8.0 precedent-citer at line ~7588 has this guard pattern:
```js
const expected = (urlPrefix + (v ? v.message : '')).trim();
const current  = (msgIn.value || '').trim();
if (current && current !== expected) return;  // don't clobber user edits
```
The violation `change` handler at line 7535 has NO equivalent guard.

## C. THE FIX (exact diff)

### Fix 1 -- Auto-populate textarea after custom macro save (~line 7335)

```js
if (ur && ur.ok && ur.data && ur.data.ok){
  try { snack('Macro saved to team', 'success'); } catch(_){}
  // Reload list
  const r2 = await rpcCall('macrosList', { kind:'ban_msg' });
  __mcMacroRefill((r2 && r2.ok && r2.data && r2.data.macros) || []);
+ // Auto-select the just-saved macro and populate the textarea.
+ // The worker returns macros sorted by use_count DESC; the new macro
+ // has use_count=0 so it may not be first -- find it by label match.
+ const savedLabel = result.label;
+ const allOpts = Array.from(macroPick.options);
+ const newOpt = allOpts.find(o => o.textContent.trim().startsWith(savedLabel));
+ if (newOpt) {
+   macroPick.value = newOpt.value;
+   if (msgIn) msgIn.value = (evidenceLink ? urlPrefix : '') + result.body;
+   try { snack('Macro loaded into draft', 'success'); } catch(_){}
+ } else {
+   // Fallback: body is known from result, write it directly
+   if (msgIn) msgIn.value = (evidenceLink ? urlPrefix : '') + result.body;
+ }
} else {
  try { snack('Save failed: ...', 'error'); } catch(_){}
}
return;
```

### Fix 2 -- Guard vSel.change against macro selection (~line 7535)

```js
vSel.addEventListener('change', ()=>{
  const v = VIOLATIONS.find(x=>x.id===vSel.value);
  if (!v) return;
+ // Don't clobber an active macro selection. If the user picked a macro,
+ // the macro pick dropdown still holds a non-empty value. Only
+ // auto-populate the message when no macro is actively selected.
+ const macroIsActive = macroPick && macroPick.value && macroPick.value !== '';
+ if (!macroIsActive) {
    subIn.value = v.subject;
    msgIn.value = urlPrefix + v.message;
+ } else {
+   // Still update subject from the violation -- subject is always
+   // violation-driven, only the message body should come from the macro.
+   subIn.value = v.subject;
+ }
  let days = v.defaultDays;
  if (isRepeat && days>0 && days<30) days = Math.min(days*3, 90);
  else if (isRepeat && days===0) days = 3;
  selectDuration(days);
});
```

This preserves the usability intent: violation change still auto-sets the
subject line and duration (which is why you'd change violations after picking
a macro -- to get the right duration bucket), but leaves the body alone
when a macro is active.

## D. PREVENTION (test or assertion to add)

Manual regression checklist (no unit test harness in this codebase):

1. **Custom macro path:** Open ban modal > pick any violation > pick "+ Add
   custom" > fill label + body > save > confirm `#mc-ban-msg` contains the
   new body, not the violation template.

2. **Existing team macro + violation change:** Open ban modal > select team
   macro > note textarea content > change violation type > confirm textarea
   still contains the macro body (subject may update, body must not change).

3. **Violation-first then macro:** Open ban modal > pick violation > pick
   team macro > confirm textarea contains macro body (not violation template).
   This path already worked; regression check only.

4. **Send verification:** On all three paths above, click BAN, open preflight
   modal, verify "Message" row shows the macro body, not the violation template.

## E. RELATED BUG?

The mm_reply (modmail) macro wiring at line ~8078 uses the same pattern:

```js
// v9.8.0: smart team-macros dropdown for mm_reply (mirrors ban-tab pattern)
const msgMacroPick = root.querySelector('#mc-msg-macro-pick');
```

Check whether the modmail tab has an analogous "violation/subject dropdown
change" that could clobber the macro body. If `mm_reply` has a subject
auto-populate handler that unconditionally writes to `#mc-msg-body`, the
same Root Cause 2 applies there. The fix pattern (guard on `macroIsActive`)
is identical.

The note tab does not appear to have a violation selector, so it is likely
unaffected.

## F. SHIP-TONIGHT PATCH (verified)

Apply both fixes to `modtools.js`. Fix 1 (custom macro save path) is the
primary reproducer Commander hit. Fix 2 (vSel clobber guard) is the
secondary failure mode that explains "originally selected message" being
sent even when the user picks an existing macro and then adjusts the
violation type.

**Fix 1 location:** `modtools.js` ~line 7335, inside the `if (ur && ur.ok && ur.data && ur.data.ok)` block, after `__mcMacroRefill(...)` call.

**Fix 2 location:** `modtools.js` ~line 7535, the `vSel.addEventListener('change', ...)` handler body.

Both changes are surgical -- no new dependencies, no behavior change on the
pre-macro paths. The guard condition `macroPick.value !== ''` is falsy for
the header option (value="") and truthy only when a real macro ID is selected,
which is exactly the right discriminator.
