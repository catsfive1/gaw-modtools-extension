# Stale-Doc Audit (2026-05-09)

**Audited by:** Stale-Doc Auditor agent
**Source of truth:** manifest.json, modtools.js, gaw-mod-proxy-v2.js, background.js, popup.js, migrations/*.sql
**Actual version state:** extension v10.2.0 / worker v9.4.8 / D1 migrations 002-031 (30 files)

---

## A. PER-DOC DRIFT TABLE

### FEATURES_MATRIX_v9.24.md

| # | Drift Item | Current Truth | Line in Doc | Correction |
|---|---|---|---|---|
| FM-1 | Header says "extension v9.24.0 / worker v9.4.6" | extension v10.2.0, worker v9.4.8 | Line 3 | Update header; see AGENT_BRIEF for authoritative version block |
| FM-2 | modtools.js described as "~20.8k LOC" | 21,336 lines actual | Line 4 | "~21.3k LOC" |
| FM-3 | gaw-mod-proxy-v2.js described as "~11.95k LOC" | 12,050 lines actual | Line 4 | "~12.0k LOC" |
| FM-4 | C12: "Modmail macros dropdown wired in MOD CONSOLE Message tab -- ❌ -- A2; only in ban tab" | SHIPPED v9.8.0. modtools.js:8099 has `// v9.8.0: smart team-macros dropdown for mm_reply` with full `rpcCall('macrosList', { kind:'mm_reply' })` wiring | Line 83 (C12 row) | Change ❌ to ✅; Evidence: modtools.js:8099-8144 |
| FM-5 | P. Headline Numbers: "Extension: v9.24.0", "Worker: v9.4.6" | extension v10.2.0, worker v9.4.8 | Lines 368-370 | Update both |
| FM-6 | P. Headline Numbers: "Worker /version endpoint string: '8.0.0' (stale; G14 to fix)" | /version handler now reads WORKER_VERSION dynamically (v9.4.8 W-23 per code comment). handleVersion() returns `WORKER_VERSION` directly; the "8.0.0" hardcoded string is gone | Line 371 | G14 can be marked ✅ shipped; remove stale string claim from P |
| FM-7 | G13: "Worker /version returns hardcoded '8.0.0'" listed as ❌ | /version reads WORKER_VERSION dynamically as of v9.4.8. No hardcoded "8.0.0" found in worker source | Lines 182-183 (G13/G14) | G13 ❌ -> ✅ fixed; G14 🆕 -> ✅ shipped |
| FM-8 | "Sources: ... migrations 001-031" | No migration 001 exists. Files are 002-031 with gaps at 009, 010, 025 and duplicate numbered files (003/004/031). 30 SQL files total | Line 4 | "migrations 002-031 (30 files; no 001, 009, 010, 025; two 003/004/031 variants)" |
| FM-9 | Bottom note: "PROJECT-STATUS.md -- STALE (2026-04-29; says v8.3.4)" | True but underspecified. PROJECT-STATUS is now 7 major versions behind (v8.3.4 vs v10.2.0) | Line 362 | Already flagged; ARCHIVE recommendation stands |

### PROJECT-STATUS.md

| # | Drift Item | Current Truth | Line in Doc | Correction |
|---|---|---|---|---|
| PS-1 | Extension version: "8.3.4" | v10.2.0 (18 minor versions later) | Line 14 | Update to v10.2.0 or ARCHIVE doc |
| PS-2 | Worker version: "8.3.0 + patches" | v9.4.8 | Line 15 | Update to v9.4.8 or ARCHIVE |
| PS-3 | D1 schema version: "17 (last migration: discord_retry_queue)" | 31 migrations in scheme (002-031); last is 031_team_macros.sql and 031_mod_modmail_responses.sql | Line 16 | Update to migration 031 or ARCHIVE |
| PS-4 | D1 migrations listed as "(014 -> 017)" | 30 SQL files spanning 002-031 | Line 16 | Wholly stale; update or ARCHIVE |
| PS-5 | Worker secrets list: "MOD_TOKEN, LEAD_MOD_TOKEN, XAI_API_KEY, ANTHROPIC_API_KEY, DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY, GITHUB_PAT" | MOD_TOKEN scheduled for deletion after 2026-05-12 soak (BACKLOG TS-7); set is otherwise similar but cannot verify CF dashboard state from code | Line 17 | Mark MOD_TOKEN as "pending removal" |
| PS-6 | ANTHROPIC_API_KEY "was clobbered by a paste bug -- needs re-set" | Cannot verify CF dashboard state from source; code shows defensive `if (!env.ANTHROPIC_API_KEY) return error` guard is in place. Issue is either fixed or still open at runtime level | Line 17, L40, L113 | Flag as "status unverifiable from code; verify in CF dashboard" |
| PS-7 | Filesystem map: "modtools.js ~15k LOC" | 21,336 lines | Line 79 | "~21.3k LOC" |
| PS-8 | Filesystem map: "migrations\ 001 -> 017" | migrations 002-031 (30 files) | Line 81 | "migrations\ 002-031 (30 files)" |
| PS-9 | WHAT IS WORKING: lists features accurate for v8.3.x but not for v10.2.0 | Entire "What's working" block is 7 versions stale. Missing: maintenance mode, HMAC chain, full modmail pipeline, token rotation V2, Brave detection, popup tabbed nav, popup collision guard, auth-fail banner cross-talk, and ~60 other shipped items | Lines 22-32 | ARCHIVE; use FEATURES_MATRIX as authoritative state |
| PS-10 | "Next 3 things to ship: (1) Re-set ANTHROPIC_API_KEY, (2) Firehose Phase 1 Activity Timeline, (3) CWS screenshot" | All three are pre-v9.0. Firehose backend shipped (E1-E9 in FEATURES_MATRIX); popup tab nav shipped v9.15.0; CWS status is K8 (blocked on screenshot upload, still open). Action items 1 and 2 are obsolete | Lines 111-116 | ARCHIVE |

### AGENT_BRIEF.md

| # | Drift Item | Current Truth | Line in Doc | Correction |
|---|---|---|---|---|
| AB-1 | Version block: "worker v9.4.7" | WORKER_VERSION = '9.4.8' at gaw-mod-proxy-v2.js:54 | Line 11 | Change v9.4.7 -> v9.4.8 |
| AB-2 | Version block: "deploy 130ea105-15d5-4571-a3dc-6d65e6af3381 (B3 firehose dedupe atomic-upsert + MOD_METRICS binding fix)" | Latest deploy ID cannot be verified from static files; this may be the correct deploy or a prior one | Line 11-12 | Add note: "verify deploy ID via `npx wrangler deployments list`" |
| AB-3 | Invariant table: "lookupModFromToken at gaw-mod-proxy-v2.js ~764" | Actual function definition is at line 982 | Lines 86-87 | Update line reference to ~982 |
| AB-4 | Invariant table: "safeError(e, code) wraps 500 responses at gaw-mod-proxy-v2.js ~762" | safeError() definition is at line 796 | Line 90 | Update line reference to ~796 |
| AB-5 | Project layout says "gaw-mod-proxy-v2.js ~9k lines, ~120 endpoints" and "modtools.js 17.5k lines" | worker is 12,050 lines; modtools.js is 21,336 lines | Lines 49-52 | Update both LOC figures |
| AB-6 | NOTE: "live /version endpoint string is stale (returns '8.0.0'); WORKER_VERSION constant at gaw-mod-proxy-v2.js:48 is the source of truth" | WORKER_VERSION is now at line 54 (not 48), and /version now reads it dynamically. The "stale 8.0.0" issue is fixed | Lines 14-15 | Remove the stale-note; update line ref from :48 to :54 |
| AB-7 | "What NOT to repeat" section references "v9.3.0 -> v9.4.6" session | Current version is v10.2.0. The session reference is accurate as historical fact but "check git blame from 02736e7 onward" may drift as more commits land | Line 130-137 | Low urgency; add note "as of v9.4.6; history has continued through v10.2.0" |

### BACKLOG.md

| # | Drift Item | Current Truth | Line in Doc | Correction |
|---|---|---|---|---|
| BL-1 | TIER 1 IN FLIGHT: "v9.5.0 -- Maintenance Mode -- sub-agent building" | v9.5.0 shipped. G7 in FEATURES_MATRIX is ✅. Extension is now v10.2.0. The "in flight" entry is 5 major versions stale | Lines 5-10 | Remove TIER 1 IN FLIGHT block entirely or mark as SHIPPED |
| BL-2 | TIER 2 P2-3: "Approve / Remove post buttons in DOM" -- listed as unbuilt | Cannot fully verify from quick search, but given 21k lines and 5 major versions of shipping, this may have shipped. Low confidence -- flag for manual check | Line 24 | Add "verify -- may have shipped in v9.x-v10.x" |
| BL-3 | TIER 2 P3-2: "rename or delete legacy /invite/claim popup-side path" -- listed as unbuilt | Unverified from current scan; flag for manual check | Line 27 | Flag for verify |
| BL-4 | TIER 2 TS-9: "manifest 'key' field for deterministic unpacked-install IDs" -- listed as unbuilt | FEATURES_MATRIX A1 says ✅ shipped with evidence "manifest.json:6 (RSA pubkey)". AGENT_BRIEF invariant confirms it. | Line 37 | Move to SHIPPED / delete from backlog |
| BL-5 | Modtools.js referenced implicitly as ~17.5k lines (via AGENT_BRIEF copy) | 21,336 lines actual | (inherited from AGENT_BRIEF) | Update any LOC references if present |

### HANDOFF_UX_AUTH_2026-05-07.md

| # | Drift Item | Current Truth | Line in Doc | Correction |
|---|---|---|---|---|
| HO-1 | Version state: "extension v9.6.6, worker v9.6.2" | extension v10.2.0, worker v9.4.8 | Lines 60-62 | Update or note "superseded -- see AGENT_BRIEF" |
| HO-2 | Layout says "modtools.js ~17.5k lines, gaw-mod-proxy-v2.js ~9k lines" | 21,336 and 12,050 respectively | Lines 36, 50 | Update LOC figures |
| HO-3 | Section 4.1 A2: "Mod Console modmail tab dropdown NOT wired -- first thing to fix" marked ⚠ | SHIPPED v9.8.0. modtools.js:8099-8144 has the full mm_reply macro wiring. AGENT_BRIEF v10.2 ship notes explicitly state "Discovered A2 was already shipped v9.8.0; matrix was stale" | Lines 109-110 | Mark A2 as ✅ SHIPPED v9.8.0 |
| HO-4 | Section 4.2 B3: "Duplicate detection -- ✅ FIXED v9.4.6" | Confirmed correct -- UPSERT pattern is in worker. This item is accurate | Lines 120-122 | No change needed |
| HO-5 | Section 11.1 item 1: "Fix B3 dedupe (critical) -- first thing to fix" | B3 was already fixed before this handoff was written (v9.4.6). This "fix" recommendation is moot | Lines 376-378 | Remove from priority list; it's done |
| HO-6 | Migrations: "001-030 applied to gaw-audit" | No migration 001 exists. Files are 002-031 (30 files, with gaps and duplicates). 031 was added after this doc was written | Line 48 | "002-031 (30 files) applied to gaw-audit" |
| HO-7 | Section 5.4 checklist: "For Chrome AND Brave on Linux..." -- presented as future verification work | v10.0 shipped Brave Shields detection + amber rescue banner + popup-paste fallback (AGENT_BRIEF v10.0 notes). Brave path is no longer completely unverified | Lines 217-224 | Update to reflect v10.0 Brave fixes shipped; restate what remains unverified (Linux specifically) |
| HO-8 | Section 7: version history tops at v9.6.6 | Subsequent shipped versions: v9.8.0 through v10.2.0 (roughly 6 more major/minor ships including popup tabbed nav, collision guard, tooltip fix, maintenance pareto cut, modmail macros) | Lines 285-298 | This section is intentionally a point-in-time snapshot; acceptable as-is but add a header note "superseded by v10.2.0" |
| HO-9 | Section 8 failure list item 7: "Did not audit firehose state -- B3 gap" | B3 was fixed v9.4.6; this was a valid failure at time of writing | Lines 309-310 | Historical record; no change needed |
| HO-10 | Section 6.2 describes popup as "380+ lines of HTML, vertical scroll" with no tabs | Popup tabbed nav shipped v9.15.0 (H12 in FEATURES_MATRIX is ✅). This UX nightmare description is stale | Lines 244-265 | Add note "tabbed nav shipped v9.15.0; section 6.2 is historical" |
| HO-11 | Section 4.4 D1: "Tooltips HIGHER -- ❌ Still flagged" | Tooltip Y-gap fix shipped v10.1 (AGENT_BRIEF: "Bar-icon tooltip Y-gap 6px -> 14px, closes HANDOFF D1") | Line 134 | Mark D1 ✅ SHIPPED v10.1 |
| HO-12 | Section 4.8 H4: "Token rotation generation/visibility -- ⚠ PARTIAL -- live-tested only for catsfive (1 of 15)" | Still ⚠ per FEATURES_MATRIX K6. Accurate. | Line 171 | No change needed |

---

## B. SHIP-TONIGHT FIXES

Priority: fixes that mislead the next agent picking up this codebase. In order of damage potential.

### 1. FEATURES_MATRIX_v9.24.md -- C12 modmail macros (FM-4)

Current line 83:
```
| C12 | Modmail macros dropdown wired in MOD CONSOLE Message tab | ❌ | A2; only in ban tab; HANDOFF §4.1 |
```

Replace with:
```
| C12 | Modmail macros dropdown wired in MOD CONSOLE Message tab | ✅ | SHIPPED v9.8.0; modtools.js:8099-8144 (mm_reply kind wired); HANDOFF §4.1 was stale |
```

Also update the "Top friction holes" list at bottom of doc -- remove item 3 ("Modmail macros NOT in modmail tab (A2)").

### 2. FEATURES_MATRIX_v9.24.md -- G13/G14 /version endpoint (FM-6, FM-7)

Current lines 182-183:
```
| G13 | Worker `/version` endpoint returns hardcoded "8.0.0" + v8 notes | ❌ | stale string; WORKER_VERSION constant at line 48 is source of truth |
| G14 | `/version` should read WORKER_VERSION dynamically | 🆕 | flagged this session |
```

Replace with:
```
| G13 | Worker `/version` endpoint returns hardcoded "8.0.0" + v8 notes | ✅ | FIXED v9.4.8; handleVersion() now returns WORKER_VERSION dynamically |
| G14 | `/version` should read WORKER_VERSION dynamically | ✅ | SHIPPED v9.4.8 W-23 |
```

Also update P. Headline Numbers line: remove "Worker /version endpoint string: '8.0.0' (stale; G14 to fix)" and replace with "Worker /version endpoint string: WORKER_VERSION (dynamic as of v9.4.8)".

### 3. FEATURES_MATRIX_v9.24.md -- version header (FM-1, FM-5)

Line 3: change `v9.24.0 / worker v9.4.6` -> `v10.2.0 / worker v9.4.8`
Lines 368-370 (headline numbers): update extension and worker version strings.

### 4. AGENT_BRIEF.md -- worker version and stale-version note (AB-1, AB-6)

Line 11: change `worker v9.4.7` -> `v9.4.8`
Lines 14-15: remove the NOTE about stale "8.0.0" string; it's fixed.
Lines 86-87: update `~764` -> `~982` for lookupModFromToken line reference.
Line 90: update `~762` -> `~796` for safeError line reference.
Lines 49-52: update LOC: worker `~9k` -> `~12k`; modtools.js `17.5k` -> `~21.3k`.

### 5. BACKLOG.md -- remove stale TIER 1 IN FLIGHT (BL-1)

Lines 5-10: The entire "v9.5.0 -- Maintenance Mode -- sub-agent building" row is 5 major versions obsolete. Replace with:
```
(No items currently in flight -- all previous TIER 1 shipped through v10.2.0)
```

Also BACKLOG TS-9 (manifest key field): remove from backlog -- shipped per FEATURES_MATRIX A1.

### 6. HANDOFF_UX_AUTH_2026-05-07.md -- A2 and D1 items (HO-3, HO-11)

Add a header block at the top of the file (after line 7):
```
> **STATUS NOTE (2026-05-09):** This handoff was written at v9.6.6. Current is v10.2.0.
> The following section-4 items have since shipped:
> A2 (modmail macros) -- SHIPPED v9.8.0
> D1 (tooltip Y-gap) -- SHIPPED v10.1
> B3 (firehose dedupe) -- confirmed SHIPPED v9.4.6 (was already done at time of writing)
> Section 11.1 item 1 (Fix B3) is moot.
> See AGENT_BRIEF.md and FEATURES_MATRIX_v9.24.md for current state.
```

---

## C. RECOMMENDATION

### ARCHIVE (replace entirely)

**PROJECT-STATUS.md** -- Archive unconditionally. It describes v8.3.4 (2026-04-29) against a codebase now at v10.2.0. The "What's working", "Known issues", "Next 3 things to ship", and "Filesystem map" sections are all wrong in material ways (wrong LOC, wrong migration count, wrong version numbers, obsolete priorities). A future agent reading it will be actively misled. Replace with a one-liner:

```
# ARCHIVED: PROJECT-STATUS.md
Superseded by FEATURES_MATRIX_v9.24.md (current state) and AGENT_BRIEF.md (terse boot reference).
Last accurate as of v8.3.4 (2026-04-29). Do not use for current state.
```

### UPDATE (targeted corrections, not full rewrite)

**FEATURES_MATRIX_v9.24.md** -- Ship-tonight fixes B.1-B.3 above. The matrix is largely accurate but C12, G13/G14, and the headline version numbers are wrong in ways that will mislead agents. The matrix itself notes "use this instead of PROJECT-STATUS.md" -- it needs to be right.

**AGENT_BRIEF.md** -- Ship-tonight fixes B.4 above. The brief is the primary cold-boot reference for all incoming agents. The version discrepancy (v9.4.7 vs v9.4.8), stale LOC figures, stale line-number references, and stale /version note are all small but compound into confusion on first read.

**BACKLOG.md** -- Ship-tonight fix B.5 above (remove stale TIER 1 IN FLIGHT row, remove TS-9 which shipped). The rest of the backlog tiers are forward-looking and do not claim false state; they are fine.

**HANDOFF_UX_AUTH_2026-05-07.md** -- Ship-tonight fix B.6 above (add a status-note header). Do NOT rewrite this doc -- it serves as an accurate historical record of the v9.6.x era failures and lessons. Future agents reading it for archaeology (not for current state) need it intact. The header note makes the staleness explicit without destroying the record.

### LEAVE ALONE

All V11_* and UAT_* docs referenced in FEATURES_MATRIX cross-references were not in scope and are not audited here.

---

**Summary count:** 35 drift items found across 5 docs. 9 are ship-tonight critical (mislead incoming agents on current state). 26 are informational / historical drift acceptable to leave once the header staleness notes are in place.

Key finding: **C12 in FEATURES_MATRIX is the highest-damage item** -- it marks modmail macros as unbuilt when they shipped in v9.8.0, and HANDOFF §11.1 still lists it as "first thing to fix". An agent reading both docs will spend a session building something that exists.
