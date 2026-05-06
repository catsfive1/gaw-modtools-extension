# MAINTENANCE BACKLOG — v9.5.0

This document captures the 138 maintenance/self-heal ideas from the
cat-choir brainstorm that did NOT ship in v9.5.0. Each entry is one
of three statuses:

- **(s) shipped-elsewhere** — already covered by a prior release.
- **(d) deferred** — sound idea, queued for v9.6+ unless deprioritized.
- **(n) inapplicable** — POST MASTER-specific, unsuited to GAW ModTools,
  or a duplicate of something already shipped.

## Summary stats

- **Shipped in v9.5.0 (this release):** 12 routines + 4 alarms + warning chip
- **Backlog total:** 138 items
  - shipped-elsewhere: 38
  - deferred to v9.6+: 64
  - inapplicable: 36

---

## (s) Already shipped via prior fixes (38)

These ideas were already addressed in earlier versions; included here so
nobody re-files them.

1. (s) "Detect missing token at popup open and show clear message" — v9.3.6 first-run guidance.
2. (s) "Auto-clear pre-filled token input to prevent paste concatenation" — v9.2.3.
3. (s) "Verify token after rotation/claim with one-click button" — v9.2.1 verifyTokenRoundTrip.
4. (s) "Show CRITICAL banner when rotation save fails" — v9.2.1 rotation_save_failed path.
5. (s) "Lead-only sections gated by worker whoami, not stored flag" — v9.3.16 __applyLeadGate.
6. (s) "Update banner reload button instead of auto-reload" — v9.3.14 Vanguard C-3.
7. (s) "SW vault re-sync on storage.onChanged" — v9.2.2.
8. (s) "Force re-hydrate button replaces window.__GAM_REHYDRATE() console snippet" — v9.3.14 L-2.
9. (s) "Origin guard for content-script RPCs (URL.origin exact-equal)" — v9.3.15 ER2-C-1.
10. (s) "Token shape regex tightening — reject leading dashes, require letter+digit" — v9.3.15 ER2-H-4.
11. (s) "Rate-limit clearTokens RPC" — v9.3.15 ER2-H-3.
12. (s) "Snapshot consent nonce held in SW RAM, not chrome.storage.session" — v9.3.15 ER2-C-3.
13. (s) "verifyUpdateFlag — content script asks SW to attest banner is genuine" — v9.3.15 ER2-C-4.
14. (s) "RPC arg payload size cap (256KB)" — v8.6.9.
15. (s) "Bug-report toolbar badge auto-poll" — v9.4.4 BUG_POLL_ALARM.
16. (s) "Bug-report visibility config (leads/all/userlist)" — v9.4.4.
17. (s) "Drill-down stat cards with CSV export" — v9.4.5.
18. (s) "Siren chip layout cleanup" — v9.4.6.
19. (s) "Stat-card padding tightening to 4/4 grid" — v9.4.4.
20. (s) "Section-label rhythm 4/2 instead of 8/0" — v9.4.4.
21. (s) "Per-mod token sovereignty — rotate generates token only mod knows" — v8.5.0.
22. (s) "Mod rotation roster with bulk issue button" — v8.5.2.
23. (s) "Lead invite full URL preferred over bare code" — v9.2.6.
24. (s) "Hardening flag default-on for new installs" — v9.3.6.
25. (s) "Claim invite button always visible (was conditional)" — v9.3.6.
26. (s) "Active mod token validation against /version before storing" — v5.0-Phase-1.
27. (s) "scrubExport drops sniff log + token fields" — v5.2.0 H2.
28. (s) "Debug snapshot fallback when no GAW tab present" — v5.1.2 / v9.3.14 H-4.
29. (s) "Username flag TTL writable by lead, server-enforced" — v9.3.1 P0-4.
30. (s) "Cross-mod SUS marker with comment_count_24h velocity" — v9.3.4 P1-3.
31. (s) "Shared death-row rules (lead-write, all-mod read)" — v9.3.5 P1-6.
32. (s) "Mod chat edit/delete with 5-min window" — v9.3.8 P1-7.
33. (s) "Drafts list with handoff support" — Iter 8.
34. (s) "Selectors fallback registry with auto-promote" — v7.1.2 _SEL_FB.
35. (s) "Session-area access level for content-script invite staging" — v7.2 CHUNK 14.
36. (s) "Default ban-message template editable in Settings" — v5.1.9 banMessageTemplate.
37. (s) "Compact ZIP build + load-unpacked extraction" — v9.2.3 build script.
38. (s) "schema_version migration scaffold" — v8.2.2 SCHEMA_VERSION (we extended this in v9.5.0).

---

## (d) Deferred to v9.6+ (64)

Sound ideas that didn't make this ship for context-budget or scope reasons.

### Cookie / session diagnostics (not shipped — would require host_permissions expansion)

39. (d) "Cookie inspector — show all GAW cookies with TTL/secure flags before clear."
40. (d) "Service worker registration health check — show GAW SW state, allow click-to-unregister."
41. (d) "indexedDB quota probe per database (not just total)."
42. (d) "Cache-storage purge for chrome's HTTP disk cache."
43. (d) "DNS prefetch reset — flush stale resolution that pins worker to old IP."

### Token / auth diagnostics

44. (d) "Token expiry forecast — based on rotation cadence, show 'will rotate in X days'."
45. (d) "Auto-warn 14d before token suggested rotation."
46. (d) "Background pre-rotate — silent rotate-and-store when token near expiry."
47. (d) "Lead-token age probe (separate timestamp from team token)."
48. (d) "Show whoami latency trend line (last 10 calls)."
49. (d) "Detect clock skew between client and worker."

### Diag log enhancements

50. (d) "Diag log filter UI by category (sticky/auth-modal/maint/etc.)."
51. (d) "Diag log search box with regex support."
52. (d) "Diag log severity tagging (info/warn/err) with color in export."
53. (d) "Auto-attach diag log to bug reports."
54. (d) "Diag log retention configurable (current cap=500)."
55. (d) "Per-routine performance histogram (median latency)."

### Selector / DOM drift

56. (d) "Selector drift visual diff — show current selector vs primary side-by-side."
57. (d) "Selector validation suite — synthetic DOM probe runs every X hours."
58. (d) "Auto-PR generation when selector drifts >N times — text snippet for the maintainer."
59. (d) "DOM mutation observer for unexpected layout changes during a mod session."
60. (d) "Settings-driven selector overrides (advanced users)."

### Storage management

61. (d) "Per-key compression for large entries (intel cache especially)."
62. (d) "Storage quota warning at 60% (currently 80%)."
63. (d) "Auto-trim on storage write rather than alarm-driven."
64. (d) "Storage-key namespace migration tool."
65. (d) "Storage size graph over time (sparkline in popup)."

### Schema / migration

66. (d) "Schema rollback support (currently additive-only)."
67. (d) "Migration replay log — see what each migration actually changed."
68. (d) "Pre-flight schema check on every popup open (currently only on routine click)."
69. (d) "Dry-run mode for schema migration."

### Roster staleness audit (lead)

70. (d) "Email/Discord nag template per stale mod (currently URL only)."
71. (d) "Bulk rotate for all red-tier mods at once."
72. (d) "Roster export to CSV with ages."
73. (d) "Lead-leaderboard for who rotates most consistently."
74. (d) "Visualize rotation history per mod (last N rotations)."

### Migration debt scanner (lead)

75. (d) "Scan worker for deprecated endpoints still being called."
76. (d) "D1 schema drift check — compare local migrations/ vs deployed."
77. (d) "KV namespace audit — flag unused namespaces."
78. (d) "Cron job audit — confirm worker cron triggers match expected cadence."
79. (d) "Wrangler.toml diff against deployed config."

### Audit chain verify enhancements

80. (d) "Continuous verify mode — alarm-driven, not just click-driven."
81. (d) "Verify result drill-down — show the boundary, not just pass/fail."
82. (d) "Auto-quarantine pre-boundary rows in a separate D1 view."
83. (d) "Lead alert when chain breaks (push notification or red badge)."

### Health report (lead)

84. (d) "Health report scheduling — daily/weekly auto-run."
85. (d) "Report comparison — diff against last week's report."
86. (d) "Report sharing — encrypted upload to a shared lead-only KV."
87. (d) "Health-report metric targets (SLO-style)."
88. (d) "Embed health report in CWS submission package."

### UX / polish

89. (d) "Maintenance section collapse-by-default with expand toggle."
90. (d) "Per-routine 'last run X ago' timestamp under each button."
91. (d) "Routine result history (last 10 runs visible inline)."
92. (d) "Keyboard shortcut for full health report (lead only)."
93. (d) "Dark-mode contrast pass on the warning chip."
94. (d) "Tooltip rewrite — shorter, action-oriented for non-tech mods."

### Background alarms

95. (d) "Configurable alarm cadence (currently hard-coded 6h/24h/30min)."
96. (d) "Alarm health dashboard — show last-fired ts per alarm."
97. (d) "Skip alarms when laptop on battery saver."
98. (d) "Adaptive alarm cadence — fire more often when warnings active."

### Documentation / guidance

99. (d) "In-popup help text per routine — 'when to use this'."
100. (d) "Linked runbook entries from popup tooltips."
101. (d) "Onboarding tour first time Maintenance section is opened."
102. (d) "Video walkthrough link from the Reset to Defaults dialog."

---

## (n) Inapplicable (36)

Items that don't fit GAW ModTools' architecture. Many came from
POST MASTER (the sister extension); kept here so we don't reconsider.

### POST MASTER-specific

103. (n) "Schedule post template manager."
104. (n) "Multi-account post composer."
105. (n) "Reddit cross-post bridge."
106. (n) "Twitter/X embed preview."
107. (n) "Markdown editor with live preview."
108. (n) "Image upload pipeline with auto-rehost."
109. (n) "Post throttle queue."
110. (n) "Voice-to-text post composer."

### Out-of-scope for a Chrome extension

111. (n) "Native desktop notification daemon (we use chrome.action.setBadge)."
112. (n) "Windows Service Wrapper for the worker."
113. (n) "macOS menu bar app (CWS is Chrome-only)."
114. (n) "Mobile companion app."
115. (n) "Email digest backend (worker side, not extension)."
116. (n) "SMTP server config UI."
117. (n) "Slack webhook integration."

### Server-side concerns (worker, not extension)

118. (n) "D1 vacuum scheduler — runs in worker cron, not extension."
119. (n) "KV TTL cleanup — server-side."
120. (n) "Audit-chain HMAC rotation — worker-internal."
121. (n) "Secret rotation for env-var MOD_TOKEN — handled by Cloudflare dashboard."
122. (n) "Worker version pinning — wrangler.toml concern."

### Anti-patterns / explicitly rejected

123. (n) "Auto-fix selector drift by editing modtools.js at runtime — eval-ish, rejected."
124. (n) "Send anonymized telemetry — privacy posture rules this out."
125. (n) "Auto-reload extension on update — Vanguard C-3 explicitly removed this."
126. (n) "Background fetch of GAW pages without an active tab — would break CSP/auth."
127. (n) "Cross-extension messaging — chrome.runtime.id guard prevents this by design."

### Duplicates / variations of shipped items

128. (n) "Force re-hydrate button" — already in v9.4.6 + aliased into Maintenance in v9.5.0.
129. (n) "Clear all storage button" — already in pop-footer (#clearBtn).
130. (n) "Export log button" — already in pop-footer (#exportBtn).
131. (n) "Debug snapshot button" — already in Diagnostics (#debugBtn).
132. (n) "Open Triage Console button" — already in pop-actions.
133. (n) "Stat cards with drill-down" — shipped v9.4.5.
134. (n) "Token rotation button" — shipped v8.5.0.
135. (n) "Bug-report list button" — shipped v9.4.4.

### Stretch ideas without clear ROI

136. (n) "AI-driven anomaly detection on diag log."
137. (n) "Federated diag-log sharing across mod fleet."
138. (n) "Self-test mode that runs all routines on a synthetic page."

---

## Notes

- Items marked **(d) deferred** should be re-triaged before the v9.6
  scope freeze. If a single mod hits an issue that one of these would
  solve, prioritize it.
- Items marked **(n) inapplicable** should NOT be re-filed as bugs or
  feature requests. If you genuinely think one belongs in ModTools,
  open a discussion with rationale before adding to scope.
- The 12 routines + 4 alarms in v9.5.0 cover the highest-leverage
  ground from the brainstorm. Adding more without observing real-world
  usage data first would be premature.
