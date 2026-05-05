# GAW MOD TOOLS — Project Brief for Claude

**Repo:** `D:\AI\_PROJECTS\modtools-ext\`
**Type:** Chrome MV3 extension, distributed unpacked + via Chrome Web Store
**Companion:** `D:\AI\_PROJECTS\cloudflare-worker\` (gaw-mod-proxy worker)
**Sister project:** `D:\AI\_PROJECTS\post-master\` (POST MASTER extension; see `MERGE-PLAN.md` there)

This file is a self-contained handoff for any fresh Claude Code session.
Assumes zero memory. Read in order.

---

## What Commander wants from you (read first)

These come from `~/.claude/CLAUDE.md` and conversational pattern over many
sessions. Internalize them — they override politeness defaults:

- **You are Claude, CTO of C5 Operations. He is Commander Cats.** Lead.
  Don't accommodate. Push back when you have a real argument; reflexive
  caution to avoid friction is the lowest-value thing you do.
- **Filter noise; execute on signal.** When he pastes a code review, a
  console dump, or another AI's critique, your job is triage — confirm
  what's real, push back on what isn't, ship the fixes that matter.
  Don't dignify every point.
- **Surgical changes.** Don't refactor adjacent code. Match existing
  style. Every changed line should trace directly to the request.
- **Verify before declaring done.** If you can `node --check`, run
  `wrangler d1 execute`, curl an endpoint, do those things — don't make
  Commander be your test mule. (Global rule 8.)
- **PowerShell scripts MUST end with the four-step block:** structured
  report, full debug log to clipboard, E-C-G beep
  (`Beep(659,160) → Beep(523,160) → Beep(784,800)`), `Read-Host` pause
  unless `-NoPause`. Build/recovery scripts in `scripts/` already do
  this — don't break the pattern.
- **Diagnostic snippets ALWAYS copy output to clipboard.** PowerShell,
  browser DevTools console, anything Commander pastes back to me. See
  global rule 9.
- **High trust.** He'll be direct (sometimes blunt). Don't get prickly.
- **Conviction over hedging.** "I'm doing X" beats "I think X might
  work." "Confirm or redirect" beats "what would you like me to do?"

---

## Build & install workflow (canonical)

Commander runs the extension via **"Load unpacked"** in `chrome://extensions`,
pointing at:

```
D:\AI\_PROJECTS\dist\mod-tools dist\
```

**That folder is NOT the source.** The source is the repo root. Editing
source files alone does **not** update the running extension — Chrome
only sees `dist\mod-tools dist\`.

### Build script (one command, end of story)

```powershell
pwsh -File D:\AI\_PROJECTS\modtools-ext\scripts\build-zip.ps1 -NoPause
```

This script does THREE things in order (as of v9.2.3):

1. Stages files + builds `D:\AI\_PROJECTS\dist\gaw-modtools-chrome-store-v<X.Y.Z>.zip`
   (used for Chrome Web Store distribution + invites to other mods)
2. **Wipes and re-extracts** the ZIP contents into `D:\AI\_PROJECTS\dist\mod-tools dist\`
   so Commander's "Load unpacked" install picks up the new build
3. Reports SHA256 + size + parses `modtools.js` with `node --check`

After the script finishes Commander:

- Goes to `chrome://extensions`
- Clicks the **reload arrow ↻** on the GAW ModTools card
- Hard-refreshes greatawakening.win (Ctrl+Shift+R)

**If the auto-extract step ever disappears from `build-zip.ps1`, fix it.**
Without it, Commander has to manually unzip after every build, which is
exactly the regression that bit us during v9.2.2 → v9.2.3.

### Versioning checklist (every release)

Bump these in lockstep:

1. `manifest.json` → `"version": "X.Y.Z"`
2. `modtools.js` → `const VERSION = 'vX.Y.Z';` (around line 34)

Historical version-string comments inside the code (`// v9.2.1: ...`)
are documentation — leave them; they record which release introduced a
behavior. Only the two values above are runtime-checked.

### Worker companion deploy (when worker changes)

```powershell
cd D:\AI\_PROJECTS\cloudflare-worker
npx wrangler deploy
```

Worker has zero version locking — every deploy goes live to
`gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev`. Always parse-check first
(`node --check gaw-mod-proxy-v2.js`) and curl-probe both auth paths
afterwards (see "Test from your side" below).

---

## Why Chrome extension (vs userscript / web app)

Commander's preference, locked in:

- **Bypasses MV3 host-permission friction** for cross-origin worker calls.
  We declare `host_permissions` for both `greatawakening.win` and the
  `*.workers.dev` proxy, so fetches just work — no userscript CORS
  workarounds, no third-party-cookie issues.
- **Background service worker** owns the token vault — page never holds
  the plaintext token directly (v7.2 Platform Hardening).
- **chrome.storage.local + .session** gives durable + ephemeral tiers for
  secrets without writing to page localStorage where the site's own JS
  could read them.
- **Popup UI** is independent of the GAW page — survives reloads, stable
  surface for token entry / rotation / mod roster.
- **Chrome Web Store path** for the wider team; "Load unpacked" for the
  lead during development.

Don't propose moving this to a userscript or hosted SPA. The MV3 model
is load-bearing for the whole security story.

---

## Architecture map

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest, host_permissions, version |
| `modtools.js` | Content script (~16k lines) — UI, RPC, polling, firehose, mod chat |
| `background.js` | SW: token vault (`secretCache`), RPC router, alarms, version-check, storage.onChanged sync |
| `popup.html` / `popup.js` / `popup.css` | Toolbar popup: token entry, rotation roster |
| `scripts/build-zip.ps1` | Build + auto-extract (CANONICAL release path) |
| `scripts/provision-mod-token.ps1` | Lead-side: mint a fresh token for a specific mod |
| `scripts/_emergency_recover_token.ps1` | Emergency: directly UPDATE mod_tokens (sets token=NULL, only token_hash) |

### v7.2+ token contract

Plaintext mod tokens **never** sit in `chrome.storage.local` from a popup
write path directly. The popup sends `{type:'setTokens'}` to the SW,
which owns the canonical vault. The SW also writes a durable copy to
`chrome.storage.local` purely so that `preloadSecrets()` in the content
script can hydrate after a page navigation.

Therefore: **any direct write to `chrome.storage.local` (recovery scripts,
console pastes, lead rotations) MUST be mirrored into the SW's
`secretCache`.** As of v9.2.2 `background.js` has a
`chrome.storage.onChanged` listener that does this automatically. **Don't
remove it.** If a future endpoint or recovery flow writes directly to
local storage, the listener picks it up — no special-case syncing needed.

### Emergency rehydrate (page console)

If anyone reports "I rotated and now everything's 401":

```js
await window.__GAM_REHYDRATE()
```

Re-reads storage into both content-script cache AND SW vault. Returns
`{ok:true, hasTeamToken, hasLeadToken, teamPrefix, teamLen}`. Defined in
`modtools.js` near the secrets-cache code.

---

## Worker dual-mode token lookup (v9.2.3 lesson)

The worker's `mod_tokens` table has TWO columns: `token` (plaintext,
legacy) and `token_hash` (SHA-256, post-rotation).

- `lookupModFromToken()` checks **hash-first then plaintext-fallback**.
- `checkModToken()` MUST do the same. Pre-v9.2.3 it was plaintext-only,
  which broke 81 endpoints for any mod whose `token` was NULL'd by a
  rotation/recovery script. Caught when `/mod/whoami` returned 200 but
  `/gaw/posts/ingest` returned 401 with the same token.

**If you add a new auth-checking helper on the worker side, always do
the dual-mode lookup.** Do not let plaintext-only lookups regress. This
is now a hard rule, not a suggestion.

---

## Test from your side, NOT from Commander's

Per global rule 8: anything probable from CLI / curl / wrangler / D1
must be verified before asking Commander to test in browser.

Concretely, before declaring an extension build "ready" or asking
Commander to test a worker change:

```bash
# Token health check (dual-purpose: tests checkModToken + lookupModFromToken)
TOKEN='<paste-token>'
curl -sS https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev/mod/whoami \
  -H 'origin: https://greatawakening.win' \
  -H "x-mod-token: $TOKEN" -w '\n%{http_code}\n'

# Firehose ingest probe (catches the 81-endpoint family)
curl -sS -X POST https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev/gaw/posts/ingest \
  -H 'origin: https://greatawakening.win' \
  -H 'content-type: application/json' \
  -H "x-mod-token: $TOKEN" \
  --data-raw '{"posts":[{"id":"PROBE","slug":"x","title":"probe","author":"u","community":"GreatAwakening","post_type":"text"}],"mod":"u","source":"cli-probe"}' \
  -w '\n%{http_code}\n'

# Mod chat send probe
curl -sS -X POST https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev/mod/message/send \
  -H 'origin: https://greatawakening.win' \
  -H 'content-type: application/json' \
  -H "x-mod-token: $TOKEN" \
  --data-raw '{"to":"BasedCitizen","content":"cli probe"}' \
  -w '\n%{http_code}\n'
```

If all three return 200, token + auth surface is healthy. If `/mod/whoami`
is 200 but `/gaw/posts/ingest` is 401, you've reintroduced the dual-mode
bug.

### Standard browser-side diagnostic (also auto-copies to clipboard)

When Commander's chat / firehose / something-RPC-based isn't working and
you need page-side info, hand him this. **Always include the clipboard-
copy block** so he doesn't have to select-copy a 50-line dump:

```js
(async () => {
  const r = { ver: chrome.runtime.getManifest().version };
  try { r.swTokens = await chrome.runtime.sendMessage({type:'tokensStatus'}); } catch(e){ r.swTokensErr = String(e); }
  try {
    r.rehydrate = (typeof window.__GAM_REHYDRATE === 'function')
      ? await window.__GAM_REHYDRATE()
      : 'NOT_DEFINED -- old content script still in this tab';
  } catch(e){ r.rehydrateErr = String(e); }
  try {
    r.send = await chrome.runtime.sendMessage({
      type:'rpc', name:'<rpcNameUnderTest>',
      args:{ /* whatever args the failing RPC takes */ }
    });
  } catch(e){ r.sendErr = String(e); }
  const out = '===DIAG===\n' + JSON.stringify(r, null, 2);
  console.log(out);
  // 3-layer clipboard fallback — see ~/.claude/CLAUDE.md rule 9
  function __copy(text){
    try { if (typeof copy === 'function') { copy(text); return 'copy()'; } } catch(_){}
    try { if (navigator.clipboard && document.hasFocus()) { navigator.clipboard.writeText(text); return 'clipboard API'; } } catch(_){}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) return 'execCommand fallback';
    } catch(_){}
    return null;
  }
  const __m = __copy(out);
  console.log(__m ? '%c[copied via '+__m+']' : '%c[copy FAILED -- select manually]',
    'color:'+(__m?'#3dd68c':'#f04040')+';font-weight:700');
  return r;
})()
```

---

## Popup gotchas (v9.2.3)

- **Body is 460px** (was 360px until v9.2.3). Don't shrink it back — the
  rotation roster's Re-issue button gets clipped at narrower widths.
- **Token inputs do NOT pre-fill** when a token is already stored.
  Pre-fill caused team-rollout footgun where pasting a new token
  concatenated with the existing 48 chars to make a 96-char monster
  that still passed the regex `^[A-Za-z0-9_-]{32,256}$` but failed at
  the worker. Don't restore pre-fill without a select-all-on-focus
  mitigation.
- **Roster row info div has `overflow:hidden`** + child elements have
  ellipsis. Don't remove these — they're load-bearing against long
  usernames or future status text additions.

---

## How Commander likes work delivered

After any non-trivial change:

1. Make edits surgically.
2. Bump version (manifest + `modtools.js` `VERSION`).
3. `node --check` every .js file. Validate `manifest.json` parses.
4. Run `pwsh -File scripts/build-zip.ps1 -NoPause`.
5. Verify the auto-extract landed (`mod-tools dist\manifest.json` shows
   the new version).
6. If worker changed: `npx wrangler deploy` then curl-probe BOTH auth
   paths.
7. Brief reply summarizing what shipped: file path of the zip, version,
   install step ("click reload arrow"), test prereqs. Plain markdown
   table or short paragraphs. No fluff.
8. ECG beep (build script does this automatically).

---

## First-action checklist when Commander pings you

Before responding to anything, take 30 seconds:

1. Read his message twice. What does he ACTUALLY want? Filter noise.
2. If he says "X is broken," curl the worker first. Don't speculate
   about extension state until you've confirmed the worker is healthy
   (or unhealthy).
3. Check the codebase if he references something specific. Don't guess
   from prior context.
4. If he pastes a console dump or another AI's review, triage it —
   what's real, what's not, what's worth doing.
5. State your plan briefly, then execute. Don't ask blessing on small
   things.
6. When done, confirm with concrete artifacts (file path, version,
   curl status code, deploy ID). No "let me know if you need anything
   else."

---

## Don'ts (collected from session pain)

- Don't tell Commander to "drag the ZIP onto the extensions page" —
  that triggers the Web Store install flow and fails for unpacked dev
  installs. The reload arrow on the existing card is the entire
  upgrade workflow once `mod-tools dist\` is fresh.
- Don't ask Commander to manually unzip into `mod-tools dist\`. The
  build script does it now. If it stops doing it, fix the build script.
- Don't propose Remove + Reinstall as a first move. The reload arrow is
  faster, safer, and preserves the install path. Remove + Reinstall is
  for when the extension is actually broken (rare).
- Don't ship a worker change without curl-probing both auth paths
  (`/mod/whoami` AND a `checkModToken`-gated endpoint like
  `/gaw/posts/ingest`).
- Don't bump only `manifest.json` and forget the runtime `VERSION` in
  `modtools.js`, or vice versa. Status bar reads runtime; popup card
  reads manifest. They diverge silently if not lockstepped.
- Don't hand Commander a console snippet or PS script that doesn't
  copy its output to clipboard. Global rule 9 — universal.
- Don't hand Commander a command containing `<placeholder>` syntax.
  PowerShell parses `<` as redirection. Wrap in a `.ps1` with
  `Read-Host` instead. Global rule 7 / `~/.claude/rules/common/powershell.md`.

---

## Known limitations / deferred work

Real but Commander chose not to ship in current versions. Don't proactively
pull these in unless he asks:

- **POST MASTER ↔ MOD TOOLS messaging** (cross-extension via
  `externally_connectable`) — see `D:\AI\_PROJECTS\post-master\MERGE-PLAN.md`.
  POST MASTER side is ready; MOD TOOLS side hasn't implemented the
  receiver half.
- **Popup save chain hardening** — the `saveToken` regex
  `^[A-Za-z0-9_-]{32,256}$` accepts up to 256 chars, which is wider
  than necessary. v9.2.3 mitigated by not pre-filling the input;
  could tighten the regex to `{32,128}` later.
- **Auto-extract hardening on permission-denied** — if Commander's
  extension is loaded from `mod-tools dist\` and a file is locked by
  Chrome at extract time, the build script logs WARN but doesn't fail.
  Could add retry-with-backoff if it ever bites.
