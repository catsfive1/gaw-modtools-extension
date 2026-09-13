# Security Policy

GAW ModTools is internal moderation tooling for the greatawakening.win mod
team, published here for distribution to the team. Reports and questions:
**catsfive@yahoo.com** (same contact as [PRIVACY.md](PRIVACY.md)).

## Token model

- Mod/lead credentials are random 32-byte tokens issued via rotation invites
  and stored **hashed** server-side (D1 `mod_tokens`).
- Client-side, tokens live only in the extension's service-worker vault and
  are persisted as an **encrypted** `chrome.storage.local` blob — mandatory
  since v10.49.6; the plaintext path was deleted and rotation hard-fails
  rather than fall back.
- Content scripts and the popup never receive token material; they call named
  RPCs and the service worker attaches `x-mod-token` / `x-lead-token` headers.
- Tokens, `.env` files, keys, and logs are `.gitignore`d and must never be
  committed. Worker secrets (`DISCORD_BOT_TOKEN`, `XAI_API_KEY`,
  `ANTHROPIC_API_KEY`, ...) are Cloudflare-dashboard-managed.

## Extension hardening (shipped)

- CSP pinned to `connect-src 'self' <worker> <gaw>` only — v10.11 REDTEAM-3 (`docs/CSP_TIGHTENING.md`).
- Auto-reload supply-chain primitive removed (v9.3.14): update checks are notification-only, no GitHub URLs in the binary (`background.js` header).
- Audit log appends hard-fail on privileged writes; worker 500s sanitized via `safeError`.
- Deterministic extension key; `EXTENSION_ID_ALLOWLIST` planned for CWS publication.

## Historical audits

- `docs/SECURITY_REAUDIT_v9.22.md` — Vanguard red-team reaudit
- `docs/CRYPTO_DESIGN.md` — token encryption design
- `docs/150_RULES_AUDIT.md`, `docs/STALE_FEATURES_AUDIT.md`

## Privacy

See [PRIVACY.md](PRIVACY.md) — no raw personal data is collected; moderator
identifiers + moderation actions only.
