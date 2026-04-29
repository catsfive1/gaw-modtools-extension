# Firehose — Vision, Implementation, and 10 Features to Build

**Last updated:** 2026-04-29
**Status:** Ingest live (v8.2.7+). Search endpoint live. **Client UI not yet built.**

---

## What it is

Firehose is a consent-gated, opt-in client-side crawler that turns every running mod's browser into a contributor to a shared, searchable archive of public greatawakening.win content.

When `features.firehose === true`, the extension polls `/new` (and configurable other listing pages), parses each post + comment, and pushes batches to the Cloudflare Worker. The worker stores them in D1 with full-text-search indexes on both posts and comments.

**The crucial design intent:** *capture content BEFORE removal happens.* When a user gets banned and their posts disappear from GAW's UI, the firehose-captured copies are still in D1 (with `is_removed` flipped to 1). Mods retain forensic visibility into what was actually removed and why.

---

## Data model

### `gaw_posts`
```
id, slug, title, author, community, post_type, url, body_md, body_html,
score, comment_count, flair, is_sticky, is_locked, is_removed, is_deleted,
created_at, captured_at, last_updated, version, captured_by
```

### `gaw_comments`
```
id, post_id, parent_id, author, body_md, body_html,
score, is_removed, is_deleted,
created_at, captured_at, last_updated, version, captured_by
```

### `gaw_users` (aggregates)
```
username, account_created, last_seen, post_count, comment_count, ...
```

### Full-text search
- `gaw_posts_fts` — FTS5 virtual table over (title, body_md, author, community), auto-synced via triggers
- `gaw_comments_fts` — same pattern over (body_md, author)
- Triggers on INSERT/UPDATE/DELETE keep the FTS index in lockstep

---

## Live endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/gaw/posts/ingest` | POST | mod-token | Client pushes batched post records (1MB cap) |
| `/gaw/comments/ingest` | POST | mod-token | Client pushes batched comment records (1MB cap) |
| `/gaw/search?q=&scope=&limit=` | GET | mod-token | FTS5 search, scope = `posts \| comments \| both` |
| `/gaw/user/<username>/timeline` | GET | mod-token | Last 100 posts + 200 comments + user record for one user |

### Searching from the URL bar (today, no UI yet)

```
https://gaw-mod-proxy.gaw-mods-a2f2d0e4.workers.dev/gaw/search?q=foo&scope=both
```

(With `x-mod-token` header. Use a curl wrapper or DevTools fetch.)

---

## Top 10 features to build on top of firehose

**Ranked by leverage × build cost.** These all have the data already; the work is wiring UI + a small amount of new worker logic.

### 1. **User Activity Timeline in Intel Drawer** ★★★★★ (highest ROI)

When a mod opens a user's Intel Drawer, immediately show their last 50 posts + 100 comments inline. Endpoint already exists (`/gaw/user/<u>/timeline`). One drawer panel addition. This single feature makes every other moderation decision faster — *what has this person been doing this week?*

### 2. **Mod Console search panel** ★★★★★

A new tab in the Mod Console (or a status-bar 🔍 icon) that opens a panel with: query input, scope toggle (Posts / Comments / Both), date range, optional `author:` filter. Hits `/gaw/search`. Renders results with click-through to the GAW URL. Use cases: "all comments matching racial-slur regex", "everything by user X about topic Y", "removed content from community Z".

### 3. **Removal time-machine** ★★★★★

On GAW, when a mod views a `[removed]` post or comment, ModTools enhances the placeholder with a "Show captured content" button. Clicking fetches `gaw_posts.body_md` (where `is_removed=1`) and renders it inline. **This solves "did the right thing get removed?" forever.** Five lines of new endpoint logic + one DOM enhancer.

### 4. **Auto-DR on post CONTENT, not just usernames** ★★★★

Today's auto-DR rules match against usernames. Extend the rule schema to support a `match_target: 'username' | 'post_body' | 'comment_body'` field. Background worker scans new ingests against rule patterns; on match, enqueues to AI suspect queue (NOT direct ban — same safety contract as v8.0). Catches the scripted attacks where the username is innocuous but the body is malicious.

### 5. **AI "summarize this user" button** ★★★★

In the drawer, an "AI Summary" button. Pipes the user's last 100 posts/comments through Claude with a structured prompt:
> "Summarize this user's recent activity in 3 bullets: (1) what topics they engage with, (2) tone & quality, (3) any red flags. Do not recommend an action."

One worker endpoint, one drawer button. Shifts mod cognitive load from "read 50 comments" to "read 3 bullets, then verify 2-3 cited examples."

### 6. **Coordinated-attack cluster detection** ★★★★

Periodically (cron tick) embed the last 1000 posts using Workers AI sentence-embedding model. Cluster by cosine distance. Surface clusters that look like brigade content (5+ recent posts within 0.95 cosine of each other, multiple distinct authors). Push to a new "Brigade Watch" panel in the lead-mod HUD. **Stops a coordinated raid in minutes instead of hours.**

### 7. **Modmail context auto-fill** ★★★

When a banned user replies to a modmail thread, the existing modmail enhancer hits `/gaw/user/<u>/timeline` and shows the user's last 5 posts + 5 comments inline above the reply box. Gives the responding mod context without leaving the page. *"Oh, they're appealing the rule-2 ban — let me see what they actually said."*

### 8. **Personal-mention alerts (mod self-defense)** ★★★

A poller that runs `/gaw/search?q="catsfive"&scope=comments&since=<last_check>` once a minute per logged-in mod. If a recent comment mentions you (especially in hostile terms — sentiment-classified by Claude), snack notification: *"User X mentioned you in a comment 4 min ago."* One-click jump to the comment. Lets mods address impersonation / harassment the moment it appears.

### 9. **Removed-content transparency log** ★★★

A page (or report) listing every removal in the last 7 days with the captured `body_md`, the removing mod, and the timestamp. Mod team reviews internally. Surfaces patterns: "Did mod X remove a lot of content from community Y?" — informs training without finger-pointing. Also creates a defensible audit trail if a mod is later accused of bias.

### 10. **Ban-reason auto-suggest from content context** ★★★

When the ban modal opens, AI reads the user's last 20 comments via firehose and suggests a ban reason ranked by likely-rule-violation:
> "Most likely: Rule 2 — personal attacks. 8 recent comments contain ad-hominem language toward other users. Sample: '...' Confidence: 0.91. Cite precedent: 14 prior bans for rule-2 violations on similar comment patterns."

Mod still confirms with two keystrokes (Space → Enter) per the v8.0 AI safety contract. AI never auto-bans, but it removes the *"what's the right reason here?"* friction.

---

## Bonus ideas (lower priority, still cheap)

- **"What were they posting before THIS post?"** quick action — opens an inline timeline scoped to user X with a 24h window centered on a specific post.
- **Daily moderation digest** — at 9 AM UTC, cron pushes a Discord embed: "Yesterday: N bans, M removals, top-3 active mods, most-removed user, most-flagged community."
- **Cross-community hopper detection** — flag users who post identical content across 3+ communities in 24h. Easy SQL given the existing `community` column.
- **Auto-snapshot the "killshot" comment** — when a mod issues a ban, capture the specific post/comment that triggered it (already in evidence R2, but tie it to the audit-log row explicitly).
- **Rule-violation heatmap by community** — surface which communities generate the most rule-2 violations, etc. Helps senior mods focus where the heat is.

---

## Build order recommendation

If you ship features in this order, each new one builds on the prior:

```
Phase 1: Activity Timeline in drawer (#1)
   └─> unlocks Modmail context auto-fill (#7)
   └─> unlocks AI "summarize this user" (#5)
   └─> unlocks Ban-reason auto-suggest (#10)

Phase 2: Search panel (#2) + Removal time-machine (#3)
   └─> unlocks Removed-content transparency log (#9)

Phase 3: Auto-DR on content (#4) + Coordinated cluster detection (#6)
   └─> the heavy intelligence layer — only worth it when phases 1+2 prove the pattern

Phase 4: Mention alerts (#8) — separate axis, anytime
```

Total scope: probably 3-4 weeks of focused work for all 10 features. Phase 1 alone is 1-2 days and delivers the largest single mod-productivity win the project has shipped since the Mod Chat.

---

## Status of firehose itself (today)

- ✅ Ingest endpoints live and working (v8.2.7 fixed the `getSetting('modToken')` → `getModToken()` bug)
- ✅ Schema deployed (migration 004 in prod D1)
- ✅ FTS5 indexes live with auto-sync triggers
- ✅ Search + timeline endpoints deployed
- ❌ No client UI for any of the 10 features above
- ⚠️ Firehose runs only when individual mods opt in (`features.firehose === true`). Some mods aren't running it. Coverage gaps are real — single-source data has visibility holes.

**The infrastructure is 90% built. The product on top of it is 10% built. Closing that gap is where the wins live.**
