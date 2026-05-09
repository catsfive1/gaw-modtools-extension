# Multi-Lead Delegation 2 — Popup UI

> Coordinates with `01_SCHEMA_API.md` (schema agent).
> Assumes `mod_tokens.tier IN ('mod', 'senior_lead', 'lead')` and
> `/mod/whoami` response includes `tier` field alongside the existing
> `is_lead` boolean.

---

## A. `__applyLeadGate` REFACTOR → `__applyTierGate(tier)`

### Current shape (popup.js ~L666)

```js
async function __applyLeadGate() {
  const tools = $('leadOnlyTools');
  if (!tools) return;
  tools.style.display = 'none';
  const r = await chrome.runtime.sendMessage({ type:'rpc', name:'modWhoami' });
  if (r && r.ok && r.data && r.data.is_lead === true) {
    tools.style.display = '';
    // ...optional-hint injection...
  }
}
```

### Replacement

```js
// Call once after whoami resolves. Stores tier globally so other
// sections can query it without a second RPC.
let _gamTier = 'mod';  // fail-closed default

async function __applyTierGate() {
  const r = await chrome.runtime.sendMessage({ type: 'rpc', name: 'modWhoami' });
  if (!r || !r.ok || !r.data) return;          // fail-closed: stay at 'mod'

  // Backward-compat: workers that haven't shipped tier yet still send is_lead.
  _gamTier = r.data.tier
    || (r.data.is_lead ? 'lead' : 'mod');

  __renderTierBadge(_gamTier);
  __applyTierVisibility(_gamTier);
}

function __applyTierVisibility(tier) {
  // Lead tab in nav: only full leads
  const leadTab = document.querySelector('[data-tab="lead"]');
  if (leadTab) leadTab.style.display = (tier === 'lead') ? '' : 'none';

  // #leadOnlyTools (roster, invites, team settings, maintenance, autonomous)
  // — visible for senior_lead AND lead, but with inner nodes selectively
  // hidden for senior_lead (see matrix below).
  const tools = $('leadOnlyTools');
  if (tools) tools.style.display = (tier !== 'mod') ? '' : 'none';

  // Senior-lead exclusions (lead-only inner nodes)
  const leadExclusive = [
    'maintAuditVerify',
    'maintFullReport',
    'maintAutoToggle',
    'maintAutoSave',
    'maintAutoStatus',
    'maintRunNow',
    // tier-dropdown column in roster — injected dynamically, class-gated
  ];
  const isFullLead = (tier === 'lead');
  leadExclusive.forEach(id => {
    const el = $(id);
    if (el) el.style.display = isFullLead ? '' : 'none';
    // Also hide the parent .pop-maint-row for cleaner whitespace
    if (el && el.closest('.pop-maint-row')) {
      el.closest('.pop-maint-row').style.display = isFullLead ? '' : 'none';
    }
  });

  // Bug reports: senior_lead gets read-only (no bugVisSave)
  const bugVisSave = $('bugVisSave');
  const bugVisInput = $('bugVisInput');
  if (bugVisSave) bugVisSave.style.display = isFullLead ? '' : 'none';
  if (bugVisInput) bugVisInput.readOnly = !isFullLead;

  // v9.6.2 optional-hint for lead token input
  if (tier !== 'mod') __injectLeadOptionalHint(r);
}
```

**Call sites** (2 places in popup.js, currently call `__applyLeadGate()`):
- `L641`: replace `await __applyLeadGate()` with `await __applyTierGate()`
- `L659`: same replacement

---

## B. TIER-VISIBILITY MATRIX

| Section / node | `mod` | `senior_lead` | `lead` |
|---|---|---|---|
| Stats tab | visible | visible | visible |
| Tools tab | visible (subset — see below) | visible | visible |
| Tokens tab | visible | visible | visible |
| Lead tab (nav button) | **hidden** | **hidden** | visible |
| `#leadSection` token input row | visible (always — v9.6.1) | visible | visible |
| `#leadOnlyTools` wrapper | hidden | **visible** | visible |
| Invite gen (`#inviteBtn`) | — | visible | visible |
| Rotation roster (`#rotateRosterBtn`) | — | visible | visible |
| DM-all-unrotated button (bulk `#rotateAll`) | — | visible | visible |
| Team settings (`#flagTtlInput`) | — | read-only | read-write |
| Bug reports list (`#bugListBtn`) | hidden | **read-only** | read-write |
| Bug report visibility config (`#bugVisSave`) | hidden | **hidden** | visible |
| Audit chain verify (`#maintAuditVerify`) | — | **hidden** | visible |
| Full health report (`#maintFullReport`) | — | **hidden** | visible |
| Roster staleness audit (`#maintRosterStaleness`) | — | visible | visible |
| Migration debt scanner (`#maintMigrationDebt`) | — | visible | visible |
| Autonomous maintenance toggle (`#maintAutoToggle`) | — | **hidden** | visible |
| Maintenance reports list (`#maintReportsList`) | — | visible | visible |
| Tier dropdown per roster row | — | **hidden** | visible |
| Promote/demote confirm modal | — | **hidden** | visible |

**Tools tab subset for `mod`** — standard mods see everything in Tools
except items that call lead-only worker endpoints (those buttons are already
inside `#leadOnlyTools` so no additional gating needed).

---

## C. TIER BADGE IN HEADER

### HTML — add after `#ver`, before `#maintWarningChip`

```html
<!-- popup.html L24, after <span class="pop-ver" id="ver"> -->
<span id="tierBadge" class="pop-tier-badge" style="display:none"></span>
```

### CSS — add to `popup.css`

```css
/* --- tier badge --------------------------------------------------------- */
.pop-tier-badge {
  display: inline-flex;
  align-items: center;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: 6px;
  line-height: 16px;
  vertical-align: middle;
}

.pop-tier-badge.tier-lead {
  background: rgba(167, 139, 250, 0.15);
  color: #a78bfa;
  border: 1px solid #553c9a;
}

.pop-tier-badge.tier-senior-lead {
  background: rgba(6, 182, 212, 0.12);
  color: #06b6d4;
  border: 1px solid #0e7490;
}
/* mod tier: no badge rendered — badge stays display:none */
```

### JS — `__renderTierBadge(tier)` (add near `__applyTierGate`)

```js
function __renderTierBadge(tier) {
  const badge = $('tierBadge');
  if (!badge) return;
  if (tier === 'lead') {
    badge.textContent = 'LEAD';
    badge.className = 'pop-tier-badge tier-lead';
    badge.style.display = '';
  } else if (tier === 'senior_lead') {
    badge.textContent = 'SR-LEAD';
    badge.className = 'pop-tier-badge tier-senior-lead';
    badge.style.display = '';
  } else {
    badge.style.display = 'none';  // mods: no badge
  }
}
```

Result: header reads `[shield] ModTools  v9.x.x  [LEAD]` in purple or
`[SR-LEAD]` in cyan. Nothing extra for standard mods.

---

## D. PROMOTE/DEMOTE UI IN ROSTER

### Per-row tier dropdown

The roster render loop is in `popup.js` around L1036. Each row currently
renders mod_username + crown emoji for leads. Add a tier `<select>` that
is only injected when `_gamTier === 'lead'`.

```js
// Inside the roster row render function, after name/status cells:
if (_gamTier === 'lead') {
  const tierSel = document.createElement('select');
  tierSel.className = 'roster-tier-sel';
  tierSel.dataset.mod = m.mod_username;
  ['mod', 'senior_lead', 'lead'].forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t === 'senior_lead' ? 'sr-lead' : t;
    opt.selected = (m.tier || (m.is_lead ? 'lead' : 'mod')) === t;
    tierSel.appendChild(opt);
  });
  tierSel.addEventListener('change', () => __confirmTierChange(m.mod_username, tierSel));
  row.appendChild(tierSel);
}
```

```css
/* popup.css */
.roster-tier-sel {
  padding: 2px 4px;
  background: #11131a;
  color: #e5e9f0;
  border: 1px solid #3b414d;
  border-radius: 3px;
  font-size: 10px;
  font-family: inherit;
  cursor: pointer;
}

/* Purple accent when selected value is 'lead' — JS sets data-tier attr */
.roster-tier-sel[data-curtier="lead"] {
  border-color: #553c9a;
  color: #a78bfa;
}
.roster-tier-sel[data-curtier="senior_lead"] {
  border-color: #0e7490;
  color: #06b6d4;
}
```

After render, set `data-curtier` for CSS:

```js
tierSel.dataset.curtier = m.tier || (m.is_lead ? 'lead' : 'mod');
```

### Confirm modal — `__confirmTierChange(username, selectEl)`

```js
async function __confirmTierChange(username, selectEl) {
  const newTier = selectEl.value;
  const prevTier = selectEl.dataset.curtier || 'mod';
  if (newTier === prevTier) return;

  // Revert select while modal is open
  selectEl.value = prevTier;

  const confirmed = await __showConfirmModal({
    title: 'Change tier for u/' + username,
    body:  prevTier + ' -> ' + (newTier === 'senior_lead' ? 'sr-lead' : newTier),
    confirmLabel: 'Confirm',
    confirmClass: 'pop-btn-danger',
  });
  if (!confirmed) return;

  try {
    const r = await chrome.runtime.sendMessage({
      type: 'rpc',
      name: 'adminModPromote',
      payload: { mod_username: username, tier: newTier },
    });
    if (r && r.ok) {
      selectEl.value = newTier;
      selectEl.dataset.curtier = newTier;
      // Update CSS accent
      selectEl.setAttribute('data-curtier', newTier);
      __showToast('u/' + username + ' is now ' + newTier, 'ok');
    } else {
      __showToast('Promote failed: ' + (r && r.error || 'unknown'), 'err');
    }
  } catch (e) {
    __showToast('RPC error: ' + e.message, 'err');
  }
}
```

`__showConfirmModal` is a lightweight inline modal (no dependency on any
existing modal lib). Implementation:

```js
function __showConfirmModal({ title, body, confirmLabel, confirmClass }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;' +
      'display:flex;align-items:center;justify-content:center';

    overlay.innerHTML = `
      <div style="background:#1a1d24;border:1px solid #3b414d;border-radius:6px;
                  padding:16px;max-width:260px;width:90%;font-size:12px;color:#e5e9f0">
        <div style="font-weight:700;margin-bottom:8px">${title}</div>
        <div style="color:#9b9892;margin-bottom:14px">${body}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="pop-btn pop-btn-ghost" id="__cmCancel">Cancel</button>
          <button class="pop-btn ${confirmClass}" id="__cmConfirm">${confirmLabel}</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector('#__cmCancel').onclick  = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#__cmConfirm').onclick = () => { overlay.remove(); resolve(true);  };
    overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); resolve(false); } };
  });
}
```

---

## E. EMPTY STATE FOR SENIOR_LEADS

When `#leadOnlyTools` first becomes visible for a `senior_lead` and the
roster panel (`#rotateRosterPanel`) hasn't loaded yet, show a minimal
skeleton rather than a blank block.

Add immediately inside `#leadOnlyTools`, before `#inviteBtn` row:

```html
<!-- popup.html — inside #leadOnlyTools, first child -->
<div id="srLeadEmptyHint" style="display:none;color:#9b9892;font-size:10.5px;
     padding:6px 0;border-bottom:1px solid #1e2128;margin-bottom:6px">
  Loading elevated tools&hellip;
</div>
```

Show/hide in JS:

```js
function __setSrLeadLoadingHint(visible) {
  const el = $('srLeadEmptyHint');
  if (el) el.style.display = visible ? '' : 'none';
}
```

Call `__setSrLeadLoadingHint(true)` at the start of `__applyTierVisibility`
when `tier === 'senior_lead'`, then `__setSrLeadLoadingHint(false)` once
the roster or invite section renders. The hint auto-hides as soon as any
content loads — it is a loading shimmy, not a permanent empty state.

---

## F. SHIP-TONIGHT PATCH (smallest diff)

All changes are additive or safe replacements. No existing behavior removed.

| File | Line(s) | Change |
|---|---|---|
| `popup.html` | L24 (after `#ver` span) | Add `<span id="tierBadge" class="pop-tier-badge" style="display:none"></span>` |
| `popup.html` | L38 (Lead tab button) | No change — tab stays; `__applyTierVisibility` hides it for non-leads |
| `popup.html` | Inside `#leadOnlyTools`, first child | Add `#srLeadEmptyHint` div |
| `popup.css` | EOF | Add `.pop-tier-badge`, `.tier-lead`, `.tier-senior-lead`, `.roster-tier-sel` blocks |
| `popup.js` | L666 — replace `__applyLeadGate` body | New `__applyTierGate` + `__applyTierVisibility` + `__renderTierBadge` |
| `popup.js` | L641, L659 | Replace `await __applyLeadGate()` with `await __applyTierGate()` |
| `popup.js` | L1036 roster row render | Inject tier `<select>` when `_gamTier === 'lead'` |
| `popup.js` | After roster render loop | Add `__confirmTierChange`, `__showConfirmModal`, `__setSrLeadLoadingHint` |
| `popup.js` | Background RPC dispatch | Register `adminModPromote` → calls `/admin/mod/promote` (schema agent's endpoint) |

**No popup.html section restructuring required.** The existing `#leadOnlyTools`
wrapper handles both `senior_lead` and `lead` — inner nodes are toggled by
`__applyTierVisibility`, not by restructuring the DOM.

Backward-compat: workers that don't yet return `tier` in `/mod/whoami` fall
back to `is_lead` boolean via the `r.data.tier || (r.data.is_lead ? 'lead' : 'mod')`
expression. Zero regression for in-flight deployments.

---

## G. STRETCH — Audit log per tier change

When `__confirmTierChange` completes successfully, append a timestamped
entry to a local ring buffer (`gam_tier_change_log`, max 50 entries) in
`chrome.storage.local`:

```js
async function __logTierChange(actor, target, fromTier, toTier) {
  const key = 'gam_tier_change_log';
  const { gam_tier_change_log: log = [] } =
    await chrome.storage.local.get(key);
  log.push({
    ts:       Date.now(),
    actor,              // _gamWhoamiUsername (resolved at gate time)
    target,
    from:     fromTier,
    to:       toTier,
  });
  if (log.length > 50) log.splice(0, log.length - 50);
  await chrome.storage.local.set({ [key]: log });
}
```

Surface in Maintenance section (lead-only): "Tier change log" button that
renders the ring buffer as a table inside a collapsible panel — same pattern
as `#maintReportsPanel`. No worker round-trip needed; the log is local-only
and serves as the lead's own audit trail until the worker ships a server-side
tier audit endpoint.
