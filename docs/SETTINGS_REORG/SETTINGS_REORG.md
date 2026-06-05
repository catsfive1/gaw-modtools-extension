# Settings Panel Reorg — SHIPMASTER (build-ready)

**Date:** 2026-06-05
**Owner:** Claude (CTO, C5 Operations) — for Commander Cats
**Source:** 8-agent / Ralph-5x storm (`wht8s7456`, 635K tokens, 43 critiques resolved).
**Status:** LOCKED for build. Every load-bearing claim validated against `modtools.js` line numbers.

---

## Version reconciliation (IMPORTANT — read first)

The storm agent numbered its plan `v10.18.x → v10.20.x` without knowing the
Bot Raid Shield worker version line. Reconciled reality:

- **Extension manifest** (`manifest.json`) is a single linear line. Currently
  **v10.18.9**. The settings-reorg ships increment it: pre-conditions = next
  bump, then Discord card, then card refactor, then automation UI.
- **Worker** (`gaw-mod-proxy-v2.js`) has its own internal version line. Bot
  Raid Shield detection is staged locally at worker-internal "v10.19.2-fix".
  The **Discord integrations routes** are *worker* code that folds into the
  same staged worker bundle deploying at the Commander-gated rollout.
- The `v10.19.3` the storm names for "Discord card" is **not** the same artifact
  as the Bot Raid Shield worker "v10.19.3 notifications" — different files.
  Where they meet is the **D1 `team_settings` `discord_*` keys**: the card
  writes them, Bot Raid Shield reads them. That shared key surface is the only
  coupling; the version *numbers* are independent.

**Coupling map (the bridge between the two pipelines):**

```
Settings Discord card  --writes-->  D1 team_settings.discord_*  <--reads--  Bot Raid Shield raid-alert dispatch
        (extension UI)              (worker /admin/integrations-config)            (worker notification)
```

---

## TL;DR triage (what Commander needs to know)

**The storm found 5 REAL bugs, not just cosmetics** — these ship first as a
no-UI-change data-integrity pass (blocking gate; nothing visual lands until the
model is consistent):

| # | Bug | Source | Truth |
|---|---|---|---|
| 1 | `autoUnstickyEnabled` render says "Off by default" | L12756 | DEFAULT = `true` (L1638) |
| 2 | personal upvote threshold fallback `110` | L12763, L12781 | DEFAULT = `100` (L1640) |
| 3 | `statusBarCompact` default `true` but L13709 hardcodes `false` | L1669 vs L13709 | fresh-install silent disagreement |
| 4 | `aiStickyDetectorEnabled`, `autoRemoveSusDr` rendered but **absent** from DEFAULT_SETTINGS + REQUIRED_SHAPE | L12787, L12959 vs L1634-1748, L4971 | **Repair button can't fix them** |
| 5 | Promote/Demote does `closeAllPanels()+openSettings()` | L12632-33 | **destroys textarea edits + scroll every promote** |

**The reorg:** 11 cards, deterministic `(tier, order)` sort, no runtime
reordering. 3 daily-driver cards (open) sit on top; 8 set-and-forget cards
(collapsed) sink to the bottom — exactly Commander's "set-and-forget sinks down".
Collapse state persists per-user in `chrome.storage.local`.

**The Discord card (card 8, lead-only):** the section Commander asked for
("I have keys/webhooks galore"). Webhook URL is a **server-side secret** (D1,
never chrome.storage, never echoed back). Full worker contract specified below.
This is the surface Bot Raid Shield v10.19.3 notifications consume.

---

## Build order (reconciled)

1. **Pre-conditions** (extension, no UI change) — the 5 bug fixes + schema v4 +
   migrations 3/4. **← building first.**
2. **Worker integrations routes** — GET/POST/test `/admin/integrations-config`
   (folds into the staged worker bundle; deploys at the gated rollout).
3. **Discord card + background RPC** (extension) — lead-only card writing the
   D1 keys.
4. **Card refactor + in-place promote/demote** (extension) — `openCard`/
   `closeCard`/`addNumberInput`/`addTextarea`; wrap all rows into cards.
5. **Automation Rules net-new UI** (extension).

Each version: ZIP → `dist\` + load-unpacked dir → Drive mirror (last-2) →
per-version commit.

---

## FULL SPEC (verbatim storm output)

All load-bearing facts confirmed against source:

- `statusBarCompact: true` in DEFAULT_SETTINGS (L1669) vs hardcoded `getSetting('statusBarCompact', false)` override at L13709 — the contradiction is real.
- `SCHEMA_VERSION = 2` (L4965), `K_SCHEMA = 'gam_schema_version'`, `SETTINGS_REQUIRED_SHAPE` at L4971 (10 keys, `isLeadMod` already present as boolean). `aiStickyDetectorEnabled`/`autoRemoveSusDr` are NOT in shape.
- `autoUnstickyEnabled` description literally says "Off by default" (L12756) while DEFAULT is `true` (L1638) — mismatch confirmed.
- `getSetting('autoUnstickyUpvoteThreshold', 110)` at L12763 vs DEFAULT `100` (L1640) — mismatch confirmed.
- The two-section split (L12754 "Auto-sticky management" + L12810 "Auto-Unsticky Monitoring") and `_syncAutoUnstickyToWorker` (L12825) confirmed.
- `isLeadMod` is already in SETTINGS_REQUIRED_SHAPE (L4975), so the "add isLeadMod to shape" pre-condition is already satisfied.

### 1. Problem + goals

The on-site GEAR settings panel (`openSettings()`, `modtools.js` L12531) renders one **flat list** of `addSection()` headers + `gam-settings-row` rows. 26+ visible settings sit as equal-weight siblings with no hierarchy, no danger signal, and the same auto-unsticky feature split across **two** unrelated-looking sections (L12754 + L12810) with **contradictory defaults** baked into the render strings. The non-programmer operator has asked for this reorg repeatedly because the 3–4 knobs they touch every shift are buried among set-once-and-forget policy flags.

**Goals (S-R1…S-R6):** collapsible **cards** grouped by operator mental model; a **deterministic** tier+order sink (no "smart" runtime reordering); a new lead-only **Discord / Integrations** card that saves to the worker (server-side secret), not `chrome.storage`; reuse of every `gam-settings-*` class and the promote/demote team mechanic; **zero settings dropped** (every key maps to exactly one card); minimal churn into the existing render fn. `SCHEMA_VERSION` (L4965), `validateSettingsShape()` (L4987), `runMigrations()` (L5008), and the popup Repair/Reset relay keep working unchanged.

### 2. Final card list

Tier ranks: `daily-driver`=0, `set-and-forget`=1. Render order = sort by `(tierRank ASC, order ASC)`.

| Card | order | tier | collapsed? | Settings it holds |
|---|---|---|---|---|
| **Daily Moderation** | 1 | daily-driver | open | `modConsoleDock` (select), `defaultDeathRowHours` (select), `tardsThreshold` (select), `mailHoverHighlight` (toggle), `features.modChat` (featureToggle), Status-bar **tour replay** (action row, no key) |
| **AI & Analysis** | 2 | daily-driver | open | `aiEngine` (select), `deepAnalysisEnabled` (toggle) |
| **Core Features** | 3 | daily-driver | open | `features.drawer` (featureToggle), `features.superMod` (featureToggle), `features.audibleAlerts` (featureToggle) |
| **Auto-Unsticky** | 4 | set-and-forget | collapsed | `autoUnstickyEnabled` (toggle), `autoUnstickyMaxHours`+`autoUnstickyUpvoteThreshold` (personal threshold row), **`aiStickyDetectorEnabled`** (toggle), then `[LEAD]` block: `auto_unsticky_lead_personal_only`, `auto_unsticky_enabled` (team), `auto_unsticky_max_hours`+`auto_unsticky_min_upvotes` (team row, worker-synced), `auto_unsticky_title_exceptions` (textarea + Save), status line |
| **Appearance** | 5 | set-and-forget | collapsed | `hideSidebar` (toggle), `gam_status_bar_orientation` (**addSelect**, replaces bespoke block), `susMarkerEnabled` (toggle), `harmonizeTheme` (toggle), `statusBarCompact` (toggle), `easterEggsEnabled` (toggle) |
| **Automation Rules** | 6 | set-and-forget | collapsed | **net-new UI:** `autoRefreshEnabled` (toggle), `autoRefreshIntervalMin` (numberInput), `quickStickyKeysEnabled` (toggle), `upvoteAgeFilter` (select), `banMessageTemplate` (textarea + Save + Reset), `autoDeathRowRules` (read-only table + Add-rule modal), `autoTardRules` (read-only table + Add-rule modal) |
| **Advanced Features** | 7 | set-and-forget | collapsed | `features.teamBoost` (featureToggle), `features.shadowQueue` / `features.park` / `features.precedentCiting` (featureToggle, conditional on teamBoost=true), `features.uxPolish` (featureToggle), `features.platformHardening` (**read-only status line, no toggle**) |
| **Discord / Integrations** | 8 | set-and-forget | collapsed | **LEAD ONLY** — `discord_raid_webhook_url`, `discord_ai_tools_channel_id`, `discord_dropgun_id`, `discord_lonewulf_id`, SAVE, SEND TEST |
| **Inbox Intel** | 9 | set-and-forget | collapsed | `inboxIntelPollMs` (numberInput min), `inboxIntelCacheRetentionDays`, `inboxIntelGrokBudgetPerDay`, `inboxIntelEnableLlamaEnrichment` (toggle), `inboxIntelEnableGrokDrafts` (toggle), `thresholds.shadowQueue.autoBadge` (numberInput float, conditional) |
| **Cloud & Consent** | 10 | set-and-forget | collapsed | **consent-status rows (NOT checkboxes):** `features.ai`, `features.crawler`, `features.presence`, `features.evidence`, `features.bugReport`, `features.modmail` |
| **Danger Zone & Developer Tools** | 11 | set-and-forget | collapsed | `autoRemoveSusDr` (toggle + inline confirm), `sniffEnabled` (toggle), `autoDetectHideUi` (toggle) |

**Critique resolutions baked in:** `features.modChat`→Daily Moderation; `features.audibleAlerts`→Core Features with extended description; `aiStickyDetectorEnabled`→Auto-Unsticky card; `easterEggsEnabled`→Appearance; `features.platformHardening`→read-only (toggling it breaks `/invite/claim` per L1721); consent features→read-only status rows; `sniffEnabled`+`autoDetectHideUi`→Danger Zone.

### 3. Set-and-forget sink-to-bottom mechanic (exact + deterministic)

**No runtime reordering. Ever.** Each card definition is a static object literal with two immutable integers; the render loop sorts once.

```js
CARDS = [
  { id:'daily-moderation', label:'Daily Moderation',  tier:0, order:1, collapsedDefault:false },
  { id:'ai-analysis',      label:'AI & Analysis',      tier:0, order:2, collapsedDefault:false },
  { id:'core-features',    label:'Core Features',      tier:0, order:3, collapsedDefault:false },
  { id:'auto-unsticky',    label:'Auto-Unsticky',      tier:1, order:4, collapsedDefault:true  },
  { id:'appearance',       label:'Appearance',         tier:1, order:5, collapsedDefault:true  },
  { id:'automation-rules', label:'Automation Rules',   tier:1, order:6, collapsedDefault:true  },
  { id:'advanced-features',label:'Advanced Features',  tier:1, order:7, collapsedDefault:true  },
  { id:'discord',          label:'Discord / Integrations', tier:1, order:8, collapsedDefault:true, leadOnly:true },
  { id:'inbox-intel',      label:'Inbox Intel',        tier:1, order:9, collapsedDefault:true  },
  { id:'cloud-consent',    label:'Cloud & Consent',    tier:1, order:10, collapsedDefault:true },
  { id:'danger-zone',      label:'Danger Zone & Developer Tools', tier:1, order:11, collapsedDefault:true, danger:true },
];
// render: CARDS.slice().sort((a,b)=> a.tier-b.tier || a.order-b.order)
```

**Rules:**

1. **Tier enum** = two immutable values. `daily-driver`(0) → cards 1-3, always open. `set-and-forget`(1) → cards 4-11, always collapsed by default. Auto-Unsticky is set-and-forget order=4 (top of the sink).
2. **Within a tier:** hardcoded `order` integer. No dynamic sort key, no recency, no access-count.
3. **Collapse persistence (per user):** `openCard()` reads `chrome.storage.local['gam_settings_card_collapse']` (a `{ cardId: boolean }` map, preloaded async via the existing `preloadSecrets` pattern **before** panel render) to override `collapsedDefault`. Header click writes back the new state.
4. **POSITION is fixed** by `(tier,order)` and never varies. Only **expanded state** is user-configurable and persisted.
5. **Lead-only cards** (Discord, order=8) render only inside `if (isLeadMod())`. Non-leads: the card object is **skipped at render** — no DOM node, no gap.
6. **Danger visual treatment** (card 11): header class `gam-settings-card-header--danger`, **exact CSS** `color:#B71C1C` (7.2:1 on white, WCAG AA pass) + `border-left:4px solid #C62828`. Amber reserved for the shield icon glyph only.
7. **Lead-only rows inside cards** (Auto-Unsticky team block): `border-left:4px solid #E65100`; "LEAD ONLY" / "TEAM" badge text `color:#4A148C` (9.3:1).
8. **ARIA + keyboard (mandatory):** every header is `<button class="gam-settings-card-header" aria-expanded="false" aria-controls="<id>-body">`. Toggle `aria-expanded` on click; on expand move focus to first focusable child of `#<id>-body`; on collapse return focus to the header. Danger header has **no confirm gate on expand** — friction lives on the `autoRemoveSusDr` toggle itself.

### 4. Discord / Integrations card

**Scope:** LEAD ONLY (`isLeadMod()`), order=8, collapsed by default. Entered once during server setup; feeds **Bot Raid Shield v10.19.3** raid alerts. The webhook URL is a **server-side secret** (`worker env.DISCORD_WEBHOOK` legacy + D1-stored override) and is **never** written to `chrome.storage` or page localStorage.

#### Fields + UI masking

| Field | Validation | On panel open | Masked after save? |
|---|---|---|---|
| `discord_raid_webhook_url` | must start `https://discord.com/api/webhooks/` | if `discord_raid_webhook_configured===true`: render `••••••••••••••••`, `webhookFieldDirty=false`, `[Clear]` button | **YES** — the only credential; never echoed back |
| `discord_ai_tools_channel_id` | 18-19 digit numeric | populate plaintext from GET | NO |
| `discord_dropgun_id` | 18-19 digit numeric | populate plaintext from GET | NO |
| `discord_lonewulf_id` | 18-19 digit numeric | populate plaintext from GET | NO |

**Dirty-flag, not sentinel:** the webhook field carries a boolean `webhookFieldDirty` on its wrapper (set `true` on any `input` event; reset `false` when GET repopulates the masked placeholder). Save includes the webhook key **only if `webhookFieldDirty===true`**. The three IDs are always included. No `'__SAVED__'` magic-string anywhere.

**Async load state:** on open, all four inputs render **disabled** with placeholder "Loading…" + header spinner; SAVE disabled until GET resolves. On GET success: populate, enable, drop spinner. On GET failure: inline "Failed to load config — click to retry" + retry button.

**SEND TEST button** (`id="gam-discord-test-btn"`): enabled only when `discord_raid_webhook_configured===true`. Calls `rpcCall('adminIntegrationsTest', {target:'discord_raid'})`. Worker reads the webhook from D1 server-side and fires a synthetic message. Snack green "Test delivered to Discord" / red "Test failed: <error>".
**Cooldown that survives reopen:** GET returns `discord_test_last_ts` (unix s). On render compute `remaining = 300 - (now - discord_test_last_ts)`; if `>0` render the button disabled with `(available in Xs)` + `setInterval` countdown. Source of truth is the GET response — nothing stored client-side. Server enforces 300s + returns 429 + `Retry-After`.

#### Worker save-route contract

**CSRF mitigation (all three routes):** worker requires header `X-Requested-By: modtools-extension`. Browsers don't send custom headers cross-origin without a CORS preflight. Static `Bearer leadModToken` + `X-Requested-By` is acceptable for these routes.

```
GET /admin/integrations-config
  Auth:    Bearer leadModToken  +  X-Requested-By: modtools-extension
  Worker:  enforce is_lead=1 via D1 lookup (same path as adminSettingsWrite)
  Reads D1 team_settings keys: discord_raid_webhook_url, discord_ai_tools_channel_id,
                               discord_dropgun_id, discord_lonewulf_id, discord_test_last_ts_<modId>
  Response 200: {
    discord_raid_webhook_configured: bool,   // = (row exists AND value != '')
    discord_ai_tools_channel_id: string|null,// plaintext (NOT a secret)
    discord_dropgun_id: string|null,         // plaintext
    discord_lonewulf_id: string|null,        // plaintext
    discord_test_last_ts: number|null        // unix seconds, for client cooldown render
  }
  No rows yet → all-null/false. The webhook URL is NEVER in any GET response.

POST /admin/integrations-config           (PATCH semantics — absent keys untouched)
  Auth:    Bearer leadModToken  +  X-Requested-By: modtools-extension   (is_lead=1)
  Body:    { discord_raid_webhook_url?, discord_ai_tools_channel_id?, discord_dropgun_id?, discord_lonewulf_id? }
  Worker:  upsert each provided key into D1 team_settings (same table as auto_unsticky_*).
           webhook stored but never returned by GET.
  Response: { ok:true } | { ok:false, error:string }

POST /admin/integrations-config/test
  Auth:    Bearer leadModToken  +  X-Requested-By: modtools-extension   (is_lead=1)
  Body:    { target:'discord_raid' }
  Worker:  read discord_raid_webhook_url from D1 (server-side only).
           if missing/empty → { ok:false, error:'No webhook configured' } (no Discord POST).
           RATE LIMIT: read discord_test_last_ts_<modId>; if (now-last)<300s →
             429 { ok:false, error:'Rate limited', retryAfter:<s> } + Retry-After header.
           else fire Discord POST { content:'[ModTools test] Raid alert integration verified — sent by <modName> at <ts>' },
             then write discord_test_last_ts_<modId>=now.
  Response: { ok:bool, status:number, error?:string }
```

**background.js RPC dispatch:** add three entries mirroring `adminSettingsWrite` fetch+error handling exactly: `adminIntegrationsRead → GET`, `adminIntegrationsWrite → POST`, `adminIntegrationsTest → POST /test` — each attaching `Bearer leadModToken` + `X-Requested-By`.

**How Bot Raid Shield v10.19.3 reads the stored config:** the raid-alert dispatcher in the worker reads `discord_raid_webhook_url` (D1 override) at alert time, falling back to `env.DISCORD_WEBHOOK` if the D1 row is absent/empty; composes the raid embed and POSTs directly to Discord, prefixing mentions with the stored `discord_dropgun_id` / `discord_lonewulf_id` (`<@id>`) and routing context to `discord_ai_tools_channel_id`. **The same D1 keys are the contract surface between this card (writer) and v10.19.3 (reader).**

### 5. DOM / render approach

**Minimal-churn principle:** existing helper **signatures are unchanged** (`addToggle`, `addFeatureToggle`, `addSelect`). Only their internal append target flips from `c` to a module-scoped pointer `_currentCardBody`.

**Three new wrapper fns inside `openSettings()`**, replacing `addSection(label)`:

```js
let _currentCardBody = c;                 // default target = panel root (back-compat)
const _collapse = await preloadCardCollapse();  // {cardId:bool}, async before render

function openCard(id, label, tier, collapsedDefault, opts={}){
  const collapsed = (id in _collapse) ? _collapse[id] : collapsedDefault;
  const card = el('div', { cls:'gam-settings-card' + (opts.danger?' gam-settings-card--danger':'') });
  const hdr = el('button', { cls:'gam-settings-card-header'+(opts.danger?' gam-settings-card-header--danger':''),
                             attrs:{ 'aria-expanded':String(!collapsed), 'aria-controls':id+'-body' } }, label);
  const body = el('div', { cls:'gam-settings-card-body', attrs:{ id:id+'-body' } });
  if (collapsed) body.hidden = true;
  hdr.addEventListener('click', ()=>{
    const open = body.hidden;          // toggling to open
    body.hidden = !open;
    hdr.setAttribute('aria-expanded', String(open));
    _collapse[id] = !open; persistCardCollapse(_collapse);   // chrome.storage write-back
    if (open){ const f=body.querySelector('input,button,select,textarea'); if(f) f.focus(); }
    else hdr.focus();
  });
  card.appendChild(hdr); card.appendChild(body); c.appendChild(card);
  _currentCardBody = body;
}
function closeCard(){ _currentCardBody = c; }
```

**One-line change inside each existing helper:** the final `c.appendChild(row)` becomes `_currentCardBody.appendChild(row)` in `addToggle` (L12554), `addFeatureToggle` (L12638), and the inline custom rows. Bodies are built by bracketing helper calls between `openCard(...)` / `closeCard()`.

**Two new helpers, appending to `_currentCardBody`:**
- `addNumberInput(label, key, min, max, defaultVal, desc)` → `gam-settings-row` + `<input type=number min max step>` + desc; `onInput`: clamp then `setSetting(key, Number(v))`. Used by `autoRefreshIntervalMin`, `inboxIntelPollMs` (**display minutes, store ms** — `*60000`/`/60000`), `inboxIntelCacheRetentionDays`, `inboxIntelGrokBudgetPerDay`, `thresholds.shadowQueue.autoBadge` (`step=0.01`, 0.0-1.0).
- `addTextarea(label, key, maxLength, rows, placeholder, desc, onSaveFn)` → row + textarea + char-count + `[Save]` button + desc. **Save click** (not blur): `setSetting(key, val)` → `onSaveFn(val)` → "Saved ✓" 2s. Used by `banMessageTemplate` (+ `[Reset to default]`) and `auto_unsticky_title_exceptions` (`onSaveFn = _syncAutoUnstickyToWorker`).

**Promote/Demote in-place re-render (BLOCKING, same version):** replace `closeAllPanels(); openSettings();` at **L12632-12633** with a ~15-line targeted update. After the RPC resolves: update team badge div, update button label+class, re-enable. Eliminates panel-destroy → no scroll loss, no textarea-edit loss, no flash.

**Schema / repair / reset preserved:** `runMigrations()` (L5008) gains migrations 3 & 4; `SCHEMA_VERSION` → 4. `validateSettingsShape()` + `SETTINGS_REQUIRED_SHAPE` gain the two missing boolean keys. **Reset to Defaults** keeps writing the full `DEFAULT_SETTINGS` object. `SECRET_SETTING_KEYS` (L1752) untouched — Discord secrets live in D1, not chrome.storage.

**`statusBarCompact` render guard dropped:** by the time `openSettings()` runs, `runMigrations()` has forced `statusBarCompact=false` (migration 4). Fix = align DEFAULT to `false`, remove the L13709 fallback override, ship migration 4.

**Status-bar orientation:** the bespoke inline-style block (L12669-12698 region) is replaced with `addSelect('Status Bar Orientation','gam_status_bar_orientation',[horizontal-bottom|vertical-left|vertical-right], desc, liveEffectFn)`.

**Consent rows (CRITICAL):** `features.ai|crawler|presence|evidence|bugReport|modmail` are seeded `null` in DEFAULT_SETTINGS. They must **NOT** use `addFeatureToggle` — a checkbox coerces `null→false` on first render, permanently recording "declined". They render as **read-only consent-status rows** in Cloud & Consent: `null` → "Not yet opted in"; `true` → "Enabled" (green); `false` → "Declined" + `[Re-prompt on next visit]` button calling `setSetting(key, null)`.

### 6. Migration map (every existing setting → its new card; nothing lost)

See card table in §2. Non-rendered DEFAULT_SETTINGS keys deliberately NOT surfaced (state/bookkeeping): `lastTokenPromptAt`, `lastAiScanDate`, `consentShown`, `customBanHistory`, `autoUnstickyUpvoteHours`, `workerModToken`, `leadModToken`, `isLeadMod`.

### 7. Build order (per-version ship plan)

**Pre-conditions (no UI change, ship first, separately):**
- DEFAULT_SETTINGS: add `aiStickyDetectorEnabled:false`, `autoRemoveSusDr:false`; set `statusBarCompact:false`.
- SETTINGS_REQUIRED_SHAPE: add both new keys as `'boolean'` (`isLeadMod` already present).
- `SCHEMA_VERSION → 4`. Migration 3: inject `aiStickyDetectorEnabled`/`autoRemoveSusDr` if absent. Migration 4: force `statusBarCompact=false` on all installs.
- Remove the `getSetting('statusBarCompact', false)` fallback override at L13709.
- Fix the two render mismatches: `autoUnstickyEnabled` description → "On by default…"; L12763/L12781 fallback `110 → 100`.
- **Verify:** load unpacked, open Settings, confirm Repair injects the two keys on a stale blob; confirm fresh-install status bar shows (no compact).

**Worker — Integrations routes (deploy BEFORE the card):** add the three routes (§4) with `X-Requested-By` gate + D1 reads/writes + 300s test cooldown. Verify via `curl`.

**Discord card + background RPC:** background.js dispatch; render lead-only card with dirty-flag masking, async load state, cooldown-on-reopen. Lead-flag-recovery warning row.

**Card refactor + in-place promote/demote:** `openCard/closeCard/_currentCardBody`, `addNumberInput`, `addTextarea`; flip helper targets; wrap rows into cards; merge the two auto-unsticky sections; orientation→`addSelect`; consent→read-only; replace L12632-33 with in-place re-render; ARIA + collapse persistence.

**Automation Rules net-new UI.** Stub guard: if helpers undefined at render, render a single "available in next release" row (never a silent empty card).
