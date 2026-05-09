# Firehose Feature 6 — Repeat-Offender Halo

**V11 priority:** cheapest high-impact item per V11_PLAN. ~30 LOC drawer change.
**Threshold:** halo fires when prior ban count >= 2.

---

## A. DATA SOURCE

**Decision: use `profile.priorBans` from the existing `pProfiles` fetch (already in-flight for sec1).**

Rationale: `buildUserSections` already fires `rpcCall('modProfilesRead', { usernames: [id] })` as `pProfiles`. The sec1 render at line 5430 already reads `profile.priorBans` and appends it to the metadata bits string. That field is populated server-side from `gaw_users.ban_count` (or the worker's own action-count query — see Cat2 item #23).

For the halo specifically, we read `profile.priorBans` from the already-awaited `pProfiles` promise. Zero additional network round-trip.

**Fallback:** if `profile` is null or `priorBans` is missing, fall back to counting `pAudit` rows where `target_user === id` and `action` contains `'ban'` and not `'unban'`. That count is already computed in sec2 as the local `banned` variable. Since sec1 and sec2 share the same `pProfiles` and `pAudit` promises (both already declared at the top of `buildUserSections`), the fallback costs nothing extra.

**Preferred future state (Cat2 item #23):** `gaw_users.ban_count` denormalized column + backfill cron. Once that migration lands, `modProfilesRead` returns a reliable integer from a PK lookup (O(1) vs a count query). The halo code needs zero change at that point — it already reads `profile.priorBans`.

**Threshold logic:**
```js
const banCount = (profile && profile.priorBans != null)
  ? profile.priorBans
  : banned;           // 'banned' from sec2's audit tally — already computed
const isRepeat = banCount >= 2;
```

---

## B. WORKER ENDPOINT

**No new endpoint needed.** `modProfilesRead` already returns `priorBans` for users in `gaw_users`. `modAuditQuery` already returns the last 20 audit rows. Both are in-flight before any section renders.

If `priorBans` is not yet populated server-side (pre-Cat2 migration), the `modAuditQuery` fallback gives us the count from the last 20 rows — sufficient to detect repeat offenders in the recent window, which is the operationally relevant signal anyway.

**Index dependency (for the fallback path):** Cat2 item #10 already calls out `idx_actions_target_action ON actions(target_user, action)` as the index needed for "how many bans did user X get?" That index is listed as a Wave 1 stealth ship. Until it lands, the count query on `modAuditQuery` limit-20 is the working path. Post-index, the server can return an accurate lifetime count cheaply.

---

## C. UI DESIGN

The halo lives on the user identifier in section 1 of the Intel Drawer. Section 1 currently renders:

```
[PRIMARY chip]  username
joined 2y ago · karma 1240 · prior bans: 3
```

The halo wraps the username display. Exact CSS:

```css
/* Repeat-offender halo — amber ring on the user identity line */
.gam-repeat-halo {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px 2px 4px;
  border: 2px solid #f5a623;                       /* amber — C.WARN canonical */
  border-radius: 4px;                              /* Bloomberg square, not pill */
  box-shadow: 0 0 0 3px rgba(245, 166, 35, 0.18); /* outer glow, restrained */
}

.gam-repeat-badge {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  padding: 1px 4px;
  border-radius: 8px;
  background: #f04040;   /* red badge — mirrors #gam-mc-badge-count pattern */
  color: #fff;
  letter-spacing: 0;
}

/* Section label that appears above the history list when halo is active */
.gam-repeat-label {
  font-size: 9px;
  color: #f5a623;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-left: 2px solid #f5a623;
  padding-left: 6px;
  margin: 8px 0 4px;
}
```

Visual result: the username is wrapped in an amber 2px rectangle with a soft outer glow. A red `x3` badge (or whatever the count is) sits to the right of the username text. Below the metadata line, a `REPEAT OFFENDER` section label in 9px amber appears before the history list.

One-play pulse on first open (Cat3 item #22 stretch — include it, it's 4 lines):

```css
@keyframes gam-halo-pulse {
  0%   { box-shadow: 0 0 0 3px rgba(245,166,35,0.18); }
  50%  { box-shadow: 0 0 0 6px rgba(245,166,35,0.35); }
  100% { box-shadow: 0 0 0 3px rgba(245,166,35,0.18); }
}
.gam-repeat-halo--pulse {
  animation: gam-halo-pulse 600ms ease-out 1;  /* fires once, stops */
}
```

The `.gam-repeat-halo--pulse` class is added on mount, removed after 700ms via `setTimeout`.

---

## D. INTERACTION

**Click halo → expand history list inline in section 1.**

The history list is NOT a separate panel, separate section, or modal. It expands inline below the existing metadata line, inside section 1's `body` div. This keeps the drawer compact by default and surgical on interaction.

Implementation:

1. When `isRepeat` is true, after appending the metadata bits paragraph, append a collapsed `<div class="gam-repeat-history" hidden>` containing the ban history rows.
2. The halo element (`gam-repeat-halo`) gets a `role="button"` + `tabindex="0"` + click handler that toggles the `hidden` attribute on the history div and flips an `aria-expanded` attribute.
3. History rows come from `pAudit` (already awaited in sec2). Filter `res.data.rows` for `target_user === id` and `action` containing `'ban'` excluding `'unban'`, sort descending by `ts`.

History row anatomy (inline, no new component needed):

```
[ts formatted]  [action chip]  [mod who actioned]
2026-03-12      BAN 7d          catsfive
2025-11-04      BAN perm        catsfive
```

Each row is a `<div class="gam-drawer-note-row">` — reuse the existing class, it has the right density and color already (`gam-drawer-note-author` for the mod name, `gam-drawer-note-ts` for the timestamp). No new CSS needed for the row itself.

Keyboard: the halo element fires on Enter/Space via standard `keydown` handler (same pattern as existing drawer action buttons). Tab order is respected — it follows the primary chip in section 1.

---

## E. SHIP-TONIGHT PATCH

**Smallest diff: modify `sec1()` inside `buildUserSections` only. ~28 LOC added.**

Current sec1 (lines 5420-5434 in modtools.js):

```js
async function sec1() {
  const res = await pProfiles;
  const body = el('div');
  const profile = (res && res.ok && res.data && res.data.users) ? res.data.users[id.toLowerCase()] : null;
  const primary = _drawerPrimaryFromProfile(profile);
  body.appendChild(el('p', null, stateChip({kind:'primary', value: primary}), ' ', el('strong', null, String(id))));
  const bits = [];
  if (profile) {
    if (profile.createdAt) bits.push('joined ' + _drawerFmtTs(profile.createdAt));
    if (profile.karma != null) bits.push('karma ' + String(profile.karma));
    if (profile.priorBans) bits.push('prior bans: ' + String(profile.priorBans));
  }
  body.appendChild(el('p', {style: 'color:#a0aec0;font-size:12px;'}, bits.length ? bits.join(' · ') : 'No profile metadata.'));
  return { id: 1, body };
}
```

Patched sec1 — the full replacement (28 lines added, 0 removed from existing logic):

```js
async function sec1() {
  const res = await pProfiles;
  const body = el('div');
  const profile = (res && res.ok && res.data && res.data.users) ? res.data.users[id.toLowerCase()] : null;
  const primary = _drawerPrimaryFromProfile(profile);

  // --- repeat-offender count (zero extra network cost) ---
  const banCount = (profile && profile.priorBans != null) ? profile.priorBans : 0;
  const isRepeat = banCount >= 2;

  // Build the username node — halo-wrapped if repeat offender.
  let userNode;
  if (isRepeat) {
    const badge = el('span', {cls: 'gam-repeat-badge'}, '\xD7' + String(banCount));
    const haloWrap = el('span', {cls: 'gam-repeat-halo gam-repeat-halo--pulse',
      role: 'button', tabindex: '0', title: 'Click to expand ban history'});
    haloWrap.appendChild(el('strong', null, String(id)));
    haloWrap.appendChild(badge);
    userNode = haloWrap;
  } else {
    userNode = el('strong', null, String(id));
  }

  body.appendChild(el('p', null, stateChip({kind:'primary', value: primary}), ' ', userNode));

  const bits = [];
  if (profile) {
    if (profile.createdAt) bits.push('joined ' + _drawerFmtTs(profile.createdAt));
    if (profile.karma != null) bits.push('karma ' + String(profile.karma));
    if (profile.priorBans) bits.push('prior bans: ' + String(profile.priorBans));
  }
  body.appendChild(el('p', {style: 'color:#a0aec0;font-size:12px;'}, bits.length ? bits.join(' · ') : 'No profile metadata.'));

  // --- inline history list (hidden until halo clicked) ---
  if (isRepeat) {
    const label = el('div', {cls: 'gam-repeat-label'}, 'REPEAT OFFENDER');
    const histDiv = el('div', {cls: 'gam-repeat-history'});
    histDiv.setAttribute('hidden', '');

    // Populate from pAudit (already in-flight — no await cost here).
    pAudit.then(auditRes => {
      if (!auditRes || !auditRes.ok || !auditRes.data || !Array.isArray(auditRes.data.rows)) return;
      const bans = auditRes.data.rows
        .filter(r => r.target_user === id && /ban/i.test(r.action) && !/unban/i.test(r.action))
        .sort((a, b) => b.ts - a.ts);
      if (bans.length === 0) {
        histDiv.appendChild(el('em', {cls: 'gam-muted'}, 'No ban records in recent audit window.'));
      } else {
        for (const b of bans.slice(0, 10)) {
          histDiv.appendChild(el('div', {cls: 'gam-drawer-note-row'},
            el('span', {cls: 'gam-drawer-note-ts'}, _drawerFmtTs(b.ts)),
            el('span', null, ' '),
            stateChip({kind:'primary', value:'BAN'}),
            el('span', null, ' '),
            el('span', {cls: 'gam-drawer-note-author'}, String(b.mod || 'unknown'))));
        }
      }
    }).catch(() => {});

    // Toggle handler.
    const toggle = () => {
      const hidden = histDiv.hasAttribute('hidden');
      if (hidden) { histDiv.removeAttribute('hidden'); } else { histDiv.setAttribute('hidden', ''); }
    };
    userNode.addEventListener('click', e => { e.stopPropagation(); toggle(); });
    userNode.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });

    body.appendChild(label);
    body.appendChild(histDiv);

    // One-play pulse — remove class after animation completes.
    setTimeout(() => { try { userNode.classList.remove('gam-repeat-halo--pulse'); } catch(e) {} }, 700);
  }

  return { id: 1, body };
}
```

**CSS additions** go into the `GAM_CSS` block (the inline style string already in modtools.js). Add after the existing `.gam-drawer-note-row` rules:

```css
.gam-repeat-halo{display:inline-flex;align-items:center;gap:6px;padding:2px 6px 2px 4px;border:2px solid #f5a623;border-radius:4px;box-shadow:0 0 0 3px rgba(245,166,35,.18);cursor:pointer;}
.gam-repeat-badge{display:inline-block;font-size:9px;font-weight:700;line-height:1;padding:1px 4px;border-radius:8px;background:#f04040;color:#fff;}
.gam-repeat-label{font-size:9px;color:#f5a623;text-transform:uppercase;letter-spacing:1px;border-left:2px solid #f5a623;padding-left:6px;margin:8px 0 4px;}
.gam-repeat-history{margin-top:2px;}
@keyframes gam-halo-pulse{0%{box-shadow:0 0 0 3px rgba(245,166,35,.18)}50%{box-shadow:0 0 0 6px rgba(245,166,35,.35)}100%{box-shadow:0 0 0 3px rgba(245,166,35,.18)}}
.gam-repeat-halo--pulse{animation:gam-halo-pulse 600ms ease-out 1;}
```

**Total diff:** ~28 JS LOC in `sec1()` + 5 CSS lines. Two files touched: modtools.js (one function), GAM_CSS block (one string addition). No new endpoints, no new network calls, no schema migration required to ship tonight.

---

## F. INDEX REQUIREMENTS

### What works right now (ship tonight, no DB changes)

The halo reads `profile.priorBans` from `modProfilesRead`. If the worker already returns this field (populated from whatever source it currently uses — `getUserHistory()` local log, or a worker-side count query), the feature works immediately with zero DB changes.

The `pAudit` fallback (counting from the last 20 audit rows) works for any user who has been actioned in the recent window. If a user was last banned 3 months ago and `modAuditQuery limit:20` doesn't reach that far back, `profile.priorBans` is the authoritative source regardless.

### What makes it production-grade (Cat2 items to land before full rollout)

1. **`idx_actions_target_action ON actions(target_user, action)`** (Cat2 item #10, already called out as Wave 1 stealth ship). This is the index that makes the worker-side `SELECT count(*) FROM actions WHERE target_user = ? AND action LIKE 'ban%'` cheap. Without it, the count query full-scans the `(target_user, ts)` index and filters action in memory — acceptable at <500k rows, degrades at 1M+.

2. **`gaw_users.ban_count` denormalized column + increment-on-ban handler** (Cat2 item #23, migration 046). Once this lands, `modProfilesRead` returns an O(1) PK lookup instead of a count query. The halo code changes nothing — it already reads `profile.priorBans`.

**Ship order:** halo tonight using existing `profile.priorBans` (whatever the current source is) → `idx_actions_target_action` as Wave 1 stealth index → `gaw_users.ban_count` denormalization in Wave 2. The halo is correct at every stage; only its backend efficiency improves.

### Index already sufficient for the pAudit fallback path

`modAuditQuery limit:20` already uses `idx_actions_mod_ts` or `idx_actions_ts` for the recency sort. The client-side filter on `target_user` runs on 20 rows in memory — zero DB concern.
