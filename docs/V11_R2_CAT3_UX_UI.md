# V11 R2 Cat 3 — UX / UI / VISUAL DESIGN

**Generated:** 2026-05-08 by Cat 3
**Lens:** Every pixel decision is interrogated against a single question: does this surface communicate operational status at a glance under cognitive load? The tool is a Bloomberg Terminal for moderation — dense, trustworthy, signal-not-noise. This document extends that aesthetic into v11's four new surface categories (right-click context menu, AI hold queue, presence bar, incident mode) while surgically repairing the seven visual failures documented by the advocate. No aesthetic pivots; targeted extensions.

---

## A. THE TOP 25-30 (ranked by visual leverage)

---

### 1. Semantic color token expansion — five-tier status grammar

**Why through visual lens:** The existing `const C` palette has 9 named colors but only amber functions as "accent." Blue (`#4A9EFF`) is the brand accent for non-status UI (titles, links), amber is the operational accent, and red/green are binary success/failure. But v11 ships AI hold queue, incident mode, and presence — three new surfaces with distinct semantic weight. Squeezing them all into amber creates color fatigue. The chip system already has 5 background colors defined in CSS vars (`chip-bg-*`). This proposal formalizes them as a semantic grammar and propagates it consistently.

**Visual sketch:**
```
STATUS TIER     HEX FG         HEX BG          USE
-----------     -----------    ------------    -----------------------------------
CALM / OK       #3dd68c green  #276749 dark    resolved, approved, verified
NOTICE          #ffd60a yellow #4d3b00 dark    watchlist, claimed, ambient alerts
WARN / HOLD     #f5a623 amber  #744210 dark    AI hold, waiting, unreviewed
ALERT / DANGER  #f04040 red    #9b2c2c dark    ban, DR ready, critical chip pulse
INCIDENT        #e060e0 fuchsia #4a1a4a dark   incident mode ONLY — new color
AI / MACHINE    #7cb8ff blue   #2c5282 dark    AI-source badge, AI-flagged chips
LEAD-ONLY       #a78bfa purple #553c9a dark    lead-gated surfaces, authority
```
Key addition: `--gam-incident: #e060e0` — fuchsia, not red. Incident is not the same as danger. Incident is ACTIVE COORDINATION, which reads visually different from CRITICAL RISK. Fuchsia is used by Linear for "blocking" status and by PagerDuty for "acknowledged incident." It is not playful; it reads as "operational emergency in human hands."

The amber-dim `#ff9933` (status bar ticker) stays. The amber is sacred — it IS the Bloomberg personality. Every other color is subordinate to amber.

**Reference:** Bloomberg (amber primary, red/green binary); Linear (yellow warn, fuchsia blocking); PagerDuty (red alert, fuchsia ack'd)
**Effort:** S — CSS variable expansion + chip rule additions, no JS render changes
**Risk:** Lo — new color tokens don't touch existing rules, only add
**Dependency:** All visual items below reference this token set
**Success metric:** On incident surfaces, mods correctly identify incident-vs-danger without reading text in <500ms (A/B test with and without fuchsia)
**Stretch:** per-severity gradient — incident chip shifts from amber to fuchsia as escalation level rises (3-step: `warn` → `alert` → `incident`)

---

### 2. Context menu visual primitive — the design language for right-click

**Why through visual lens:** V11 #1 is THE big bet and it's a new visual primitive. The context menu must look like the tool, not like Chrome's native menu. It needs: instant recognition, scannable in <300ms, action items visually weighted by frequency.

**Visual sketch:**
```
WIDTH: 220px fixed
BORDER: 1px solid #3a3f48 (C.BORDER2)
BACKGROUND: #181b20 (C.BG2)
BORDER-RADIUS: 4px (square — Bloomberg)
BOX-SHADOW: 0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)
FONT: 11px JetBrains Mono (monospace matches status bar)

Item anatomy:
[16px icon] [label 11px #e8eaed] [kbd hint 10px #5c6370 right-align]
Height: 28px per item. Padding: 0 12px.
Hover: background rgba(255,255,255,0.06) — no color shift, just reveal

DIVIDER: 1px solid #2a2f38 (C.BORDER), 4px vert margin

DANGEROUS ITEMS (Ban, Remove):
  color: #f04040 (C.RED), icon tinted red
  hover: background rgba(240,64,64,0.12)

LEAD-ONLY ITEMS:
  color: #a78bfa (C.PURPLE)
  prefix: small purple diamond glyph ◆

SUBMENU INDICATOR: › #5c6370 right-margin 4px

KEYBOARD HINTS right-aligned:
  "Ctrl+Shift+B" → render as two pill spans
  [Ctrl] [Shift] [B] — each 18px tall, 1px border #3a3f48, 9px font
```

**Reference:** Linear context menus (square, dark, monospace hints); Vercel dashboard dropdowns (BG #111, tight density)
**Effort:** M — new component in modtools.js, CSS in GAM_CSS block
**Risk:** Lo — purely additive, no existing patterns destroyed
**Dependency:** Item 1 (color tokens), Item 11 (icon unification)
**Success metric:** Time to first right-click action in usability test: target <3s for new mod (today: requires memorizing Ctrl+Shift+B)
**Stretch:** Command palette mode — `Ctrl+K` opens same menu as a typeahead floating over the page

---

### 3. Status bar escalation visual grammar — OK → notice → warn → alert → incident

**Why through visual lens:** The SIREN icon pulses orange. That's the only escalation signal. There is no visual grammar for "things are fine," "one thing is happening," "it's busy," "something is wrong," "we are in an incident." Five distinct states need five distinct visual identities on the bar.

**Visual sketch:**
```
CALM (no alerts):
  Bar border: 1px solid #2a2f38 (C.BORDER) — invisible, neutral
  Brand "GAM": color #4A9EFF (ACCENT) — normal blue

NOTICE (1-3 SUS, >0 unread modmail):
  Bar border: 1px solid rgba(255,153,51,0.35) — amber glow hint
  SIREN: color #ff9933, no pulse

WARN (5+ SUS or DR-ready count > 0):
  Bar border: 1px solid #ff9933 — amber solid border
  Bar glow: box-shadow adds outer 0 0 8px rgba(255,153,51,0.25)
  SIREN: pulse 2s ease (existing animation)

ALERT (critical chip active OR >10 SUS):
  Bar border: 1px solid #f04040 (RED)
  Bar glow: 0 0 12px rgba(240,64,64,0.3)
  SIREN: faster pulse 1s, color RED

INCIDENT (incident mode active):
  Bar border: 1px solid #e060e0 (FUCHSIA — new token)
  Bar glow: 0 0 16px rgba(224,96,224,0.35)
  Brand "GAM" text: color #e060e0
  Bar background: rgba(224,96,224,0.06) — faint fuchsia wash
  All icons: fuchsia hover tint
```
This makes the status bar itself the primary signal. Mod opens a tab, peripheral vision reads the bar color before conscious attention arrives. Zero time cost.

**Reference:** Bloomberg terminal color-codes the entire header rail when a price alert fires. Datadog incident banners invert the nav bar color. PagerDuty fuchsia border on acknowledged incidents.
**Effort:** S — CSS variable states toggled via JS class on `#gam-status-bar`
**Risk:** Lo — additive CSS, existing amber is preserved as-is
**Dependency:** Item 1 (fuchsia token), Item 24 (incident mode)
**Success metric:** Mods can identify "something is happening" from bar color alone at >90% accuracy in 5-question A/B test
**Stretch:** Status bar opacity increases in incident mode — from `rgba(12,14,18,.95)` to `rgba(12,14,18,1.0)` + slight height increase from 28px to 32px, non-disruptive but physically larger

---

### 4. Icon system unification — retire emoji, adopt Phosphor icons

**Why through visual lens:** The status bar currently mixes: `🔥` (SIREN), `🛡️` (Shield), `⚙️` (Gear), `📬` (Modmail), `💬` (Chat), `🐛` (Bug), `👁️` (Snipe), `⬅️ ➡️` (Dock). Emoji render at different pixel sizes, have OS-dependent glyph shapes (🔥 on Windows 11 vs Mac looks completely different), and cannot be styled with CSS color. The advocate explicitly noted `⬅️/➡️` as a groan moment. The `🔑 vs 👑` distinction is also called out as too subtle — both are emoji, both render similarly at 12px.

**Visual sketch:**
```
ADOPT: Phosphor Icons — 256 icon set, SVG sprites, available as
  CSS-injected data URIs or inline SVG. Weight: "Regular" (1.5px stroke)
  at 16px render size. Color: inherits from parent (CSS currentColor magic).

ICON MAPPING:
  🛡️  → ph-shield-check     #4A9EFF (calm) / #f04040 (alert state)
  ⚙️  → ph-gear             #8b929e TEXT2
  🔥  → ph-fire             changes with escalation tier (item 3)
  📬  → ph-envelope         #8b929e / #ff9933 (unread)
  💬  → ph-chat-circle      #8b929e / #4A9EFF (new message)
  🐛  → ph-bug              #8b929e
  👁️  → ph-eye              #8b929e
  🔑  → ph-key (outline)    #8b929e — team token
  👑  → ph-crown (filled)   #ffd60a YELLOW — lead token (filled vs outline = instant)
  ⬅️  → ph-arrow-left       #5c6370 TEXT3
  ➡️  → ph-arrow-right      #5c6370 TEXT3
  ⚡  → ph-lightning         #e060e0 — incident mode icon (new)

RENDER:
  All icons: 16×16px SVG, injected into GAM_CSS as CSS masks or
  background-image data URIs using `mask-image: url("data:image/svg+xml...")`.
  Color applied via `background-color: currentColor; mask-image: ...`.
  This gives: CSS-tintable, consistent pixel size, no OS glyph variance.
```

The `🔑 vs 👑` fix specifically: key (outline) vs crown (filled, gold) are visually distinct even at 12px. Zero ambiguity.

**Reference:** Linear (Lucide icons, same sprite approach); Vercel dashboard; Stripe dashboard (all SVG icon sets, CSS color-inherited)
**Effort:** L — sprite generation + replacing every emoji call site in modtools.js and popup.html. One-time cost, high ongoing value.
**Risk:** Md — Phosphor must be bundled as data URIs (no CDN in MV3). Sprite size ~15KB for 20 icons used. Parse cost negligible.
**Dependency:** Item 3 (escalation colors), Item 1 (token colors)
**Success metric:** `🔑 vs 👑` confusion drops to 0 reports in next UAT round. Dock-toggle UX confusion drops (⬅️/➡️ → arrow icons).
**Stretch:** Animated icon variants — fire icon has a subtle 2-frame flicker animation in ALERT state. Crown has a subtle gold shimmer on lead-token hover.

---

### 5. Token field visual treatment — filled vs outline, not emoji vs emoji

**Why through visual lens:** Groan moment #2 from advocate: `🔑 vs 👑` at 12px are indistinguishable. This is purely a visual problem. The fix is not label changes — it's visual form differentiation.

**Visual sketch:**
```
TEAM TOKEN FIELD:
  Label: "TEAM TOKEN" in 10px #8b929e, letter-spacing 1px, uppercase
  Icon: ph-key outline, 14px, #8b929e
  Border: 1px solid #2a2f38 (BORDER)
  Focus border: 1px solid #ff9933 (amber — standard)

LEAD TOKEN FIELD:
  Label: "LEAD TOKEN" in 10px #a78bfa, letter-spacing 1px, uppercase
  Icon: ph-crown filled, 14px, #a78bfa (purple — authority color)
  Border: 1px solid #553c9a (purple dim)
  Focus border: 1px solid #a78bfa
  Background: rgba(167,139,250,0.05) — faint purple tint on the field

  Left accent bar: 2px solid #a78bfa on the left edge of the field container
  (like Linear's "pro feature" indicator)
```

Now you can't confuse them even with color-blindness — filled crown icon + purple border + purple text vs outline key icon + neutral border. Three visual dimensions of differentiation.

**Reference:** Stripe's "Restricted key" vs "Secret key" visual treatment (different border colors, icon filled state); Linear's "Team plan" vs "Pro plan" field treatments.
**Effort:** S — popup.css changes only, ~30 lines
**Risk:** Lo — purely visual, no logic changes
**Dependency:** Item 4 (icon unification), Item 1 (purple token)
**Success metric:** Zero "pasted wrong field" reports post-v11 UAT
**Stretch:** Animated hint on wrong-paste — field flashes red then auto-swaps value to the correct field if format matches

---

### 6. AI hold queue visual identity — the "inbox for machine suggestions"

**Why through visual lens:** The AI hold queue (V11 #3) is a new surface with a novel interaction contract: mods review machine suggestions, not human events. It needs a distinct visual treatment that signals "you are in AI review mode" without being alarming.

**Visual sketch:**
```
CONTAINER: panel same as modmail (slide-in right, 480px)
HEADER BAR: background #111318, border-bottom 1px solid #2c5282
  Title: "AI REVIEW QUEUE" — 11px, letter-spacing 1.5px, #7cb8ff (AI blue)
  Live count: "[17]" — same blue, tabular nums, JetBrains Mono
  Icon: ph-robot 14px #7cb8ff

ITEM ROW (per suggestion):
  Height: 56px (compact; dense)
  Left gutter: 3px solid colored by confidence tier:
    HIGH (≥0.85): #3dd68c green
    MED (0.65-0.85): #f5a623 amber  
    LOW (0.50-0.65): #5c6370 gray (shouldn't appear per floor rule but defensive)
  Subject: 13px #e8eaed, JetBrains Mono
  AI confidence score: "87%" in 11px tabular nums, colored per gutter
  Kind badge: "TARD" / "STICKY" / "BAN" / "BRIGADE" chips (item 1 colors)
  Suggested action: 11px #8b929e

  [j] APPROVE     → green glow flash + row slides left (75ms ease-out)
  [k] REJECT      → row fades to #5c6370 + slides right (75ms ease-out)

EMPTY STATE (queue empty):
  Center of panel: ph-check-circle 32px #276749
  "Queue clear — 0 items awaiting review" — 12px #8b929e
  No secondary CTA (not "broken," just complete)

LOADING STATE:
  3 skeleton rows: gradient shimmer using existing gam-skeleton-shimmer
  animation (already defined in GAM_CSS line 3928)
```

The blue header bar makes "AI mode" visually distinct from the amber-tinted modmail panel and the neutral triage console. A mod who opens the wrong panel knows immediately.

**Reference:** Linear's triage view (high-density rows, left colored gutter by priority); GitHub's pull request review queue (approve/reject motion)
**Effort:** M — new panel component, CSS additions
**Risk:** Lo — new surface, no regression risk to existing components
**Dependency:** Item 1 (color tokens), Item 7 (motion grammar)
**Success metric:** j/k actions per session as primary engagement metric; zero "what is this?" confusion in first-use test
**Stretch:** Confidence trend sparkline (7-day) in header — "AI has been 83% accurate this week" — rendered as a 60×12px SVG sparkline

---

### 7. Motion grammar — durations, easing, and when to move

**Why through visual lens:** Currently the tool has ad-hoc transitions: `transition:transform .2s ease-out` on chat panel, `.1s` on hover states, `2s` on chip pulse, `.12s` on buttons. No grammar. v11 ships 3 new animated surfaces (presence bar, context menu, hold queue approve/reject). Without a grammar, the tool will feel inconsistent.

**Visual sketch — five motion classes:**
```
MICROINTERACTION (hover, focus):
  Duration: 80ms
  Easing: linear
  Properties: background-color, border-color, color, opacity
  Examples: button hover, chip highlight, icon hover scale

APPEAR (panel slide-in, modal open):
  Duration: 160ms
  Easing: cubic-bezier(0.0, 0.0, 0.2, 1.0)  — "material decelerate"
  Properties: transform (translateX/Y), opacity
  Examples: modmail panel, chat panel, context menu, hot-now panel

DISAPPEAR (panel close, toast fade):
  Duration: 120ms
  Easing: cubic-bezier(0.4, 0.0, 1.0, 1.0)  — "material accelerate"
  Properties: transform, opacity
  Examples: panel close, toast dismiss, context menu close

DECISION (j/k approve/reject in hold queue):
  Duration: 200ms
  Easing: cubic-bezier(0.34, 1.56, 0.64, 1.0)  — slight overshoot (spring)
  Properties: transform (translateX ±40px) + opacity (0)
  Visual: green flash rgba(61,214,140,0.2) on approve; red flash rgba(240,64,64,0.2) on reject
  Purpose: tactile confirmation the decision landed

PULSE / ALERT (status escalation, SIREN):
  Duration: 2000ms (calm) / 1000ms (alert) / 500ms (incident)
  Easing: ease-in-out, infinite
  Properties: opacity 1 → 0.45 → 1
  Add: box-shadow intensity oscillation during incident pulse
```
No motion for: data updates (tabular data updates instantly — Bloomberg never fades data in), skeleton → content transitions (content snaps in — no fade), or navigational state (tab switches are instant).

**Reference:** Material Design motion spec (exact easing curves); Bloomberg Terminal (zero decorative motion — data appears, never fades or slides); Linear (150ms panel transitions, spring on drag-release)
**Effort:** S — CSS variable definitions + update existing transition properties
**Risk:** Lo — no behavioral changes, purely cosmetic timing
**Dependency:** Items 2, 6, 8, 24 (all new panels use this grammar)
**Success metric:** No "jarring" motion complaints in UAT; motion feels "crisp" not "slow"
**Stretch:** `prefers-reduced-motion` media query — all animations collapse to instant except pulse (which becomes a static border color change)

---

### 8. Presence bar visual design — avatars, status dots, page verbs

**Why through visual lens:** V11 #8 is new. The presence bar (avatar strip + status + page verb) needs a visual identity that's ambient (doesn't demand attention) but informationally rich (tells you who is doing what).

**Visual sketch:**
```
POSITION: Rightmost section of status bar, before auth-lock icon
SEPARATOR: 1px solid #2a2f38, 4px horizontal margin

AVATAR PILL:
  Each mod: 20px circle with 2-letter initials
  Background: derived from username hash → one of 8 preset hues
    (not arbitrary — fixed palette: #4a9eff, #3dd68c, #f5a623, #a78bfa,
     #f04040, #7cb8ff, #ffd60a, #e060e0)
  Font: 7px bold, color #fff, no font family (inherits monospace)
  Max displayed: 5 avatars; "+3" overflow chip in #5c6370 at same size

STATUS DOT:
  Position: absolute, bottom-right of avatar circle, 6px diameter
  Colors:
    Active (page action in <2min): #3dd68c green, solid
    Idle (2-10min no action): #ffd60a yellow, solid
    Away (>10min): #5c6370 gray, solid
    Incident: #e060e0 fuchsia, pulsing (uses ALERT pulse from item 7)

PAGE VERB (tooltip on hover):
  "Jill — viewing /modmail/thread/abc" → 11px #e8eaed
  "Tom — banning @username" → 11px, action verb in #f5a623 amber
  "Ray — idle (5m)" → 11px #8b929e

OVERLAP HANDLING:
  Avatars: -4px horizontal overlap (stacked like AvatarGroup in Tailwind UI)
  Z-index: left-most avatar on top (most-recent active)
```

The 8 preset hues are important: no random colors, so each mod gets a stable color that becomes their identity across sessions. Tom is always blue. Jill is always green.

**Reference:** Linear (avatar group, overlap, status dots); Figma (presence indicators); Notion (presence colors)
**Effort:** S — status bar addition, avatar color from hash is ~10 LOC
**Risk:** Lo — status bar additions have precedent (existing icons)
**Dependency:** Item 1 (hue palette), Item 7 (motion for pulse), existing `/presence/online` endpoint
**Success metric:** Mods stop claim-stomping the same modmail thread (measurable via audit log duplicate-claim rate)
**Stretch:** Click avatar → open DM with that mod in chat panel (routes to `/gam-mc-dm?to=username`)

---

### 9. Empty states — skeleton-first, then content, never silent void

**Why through visual lens:** UAT Modmail §C.1: new mod sees empty popover, assumes broken. The silence of an empty state reads as malfunction. Every panel needs a designed empty state.

**Visual sketch — four empty state categories:**
```
CATEGORY A — "Nothing yet, normal":
  Icon: category-appropriate Phosphor outline icon, 24px, #5c6370
  Headline: 12px #8b929e, sentence case
  Subtext: 10px #5c6370, one line only
  No CTA (would be noise)
  Example (AI hold queue, empty): ph-check-circle + "Queue clear" + "AI has no pending reviews"

CATEGORY B — "Nothing yet, you should act":
  Icon: 24px, #f5a623 amber
  Headline: 12px #e8eaed
  Subtext: 10px #8b929e
  CTA button: amber ghost button "Run backfill" / "Enable firehose"
  Example (modmail thread list, no threads): ph-envelope + "No threads ingested" + "Start the poller to pull modmail"

CATEGORY C — "First time, onboarding":
  Illustration: 48px icon with subtle amber glow (box-shadow: 0 0 24px rgba(255,153,51,0.15))
  Headline: 13px #e8eaed, weight 600
  Numbered steps: 1. 2. 3. (10px #8b929e)
  Primary CTA: amber filled button
  Example (popup, no token): ph-key with glow + "Welcome to ModTools" + step list

CATEGORY D — "Error / broken":
  Icon: ph-warning-octagon 24px #f04040
  Headline: 12px #f04040, weight 700
  Error detail: 10px #8b929e, verbatim error message
  Recovery CTA: "Force re-hydrate" or "Report bug" in red ghost button
```

Skeleton loading (existing `gam-skeleton-shimmer`) runs BEFORE content arrives. Order: skeleton → content. Never: nothing → content.

**Reference:** Linear (empty states have icon + 1-line explanation + optional CTA, never illustrations); Vercel (skeleton loading before data); Stripe (error states have verbatim error message surfaced, not hidden)
**Effort:** S per surface, M total (8-10 surfaces need empty states)
**Risk:** Lo
**Dependency:** Item 4 (icons), Item 1 (colors)
**Success metric:** "Assumed broken" complaints drop to zero in next UAT cohort
**Stretch:** Animated empty state for hold queue — the check icon does a subtle scale-bounce when queue empties (single-play, not loop)

---

### 10. Maintenance section visual rehabilitation — CTO dashboard vs mod tool

**Why through visual lens:** Advocate groan #1 and #7: 11 buttons with developer jargon, "Autonomous maintenance (Llama)" buried in the popup. This is a visual hierarchy failure — equal visual weight on ALL buttons makes everything equally important, which means nothing is.

**Visual sketch:**
```
THREE-TIER VISUAL HIERARCHY:

TIER 1 — MODS CAN USE (visible to all mods):
  Background: #181b20 (BG2), standard density
  Labels: plain English, 11px #e8eaed
  Examples: "Check for stuck queue items", "Clear cached data"
  Button: ghost, neutral border

TIER 2 — LEAD TOOLS (visible to lead only):
  Background: rgba(167,139,250,0.05) — faint purple tint section
  Section label: "LEAD TOOLS" — 9px #a78bfa, letter-spacing 1.5px, uppercase
  Purple left rail: 2px solid #a78bfa on section container left edge
  Labels: 11px #e8eaed, lead items
  Button: purple ghost border

TIER 3 — DEVELOPER DIAGNOSTICS (hidden by default):
  Collapsed accordion: "System Diagnostics ▸" in 10px #5c6370
  Items behind it: "Schema migration check", "Migration debt scanner", etc.
  When expanded: items render in red-tinted section bg rgba(240,64,64,0.05)
  Section label: "SYSTEM DIAGNOSTICS" — 9px #f04040, uppercase
  These are the 11 offending buttons. Hidden by default. Power users expand.

The mod sees: 2-3 standard buttons + "Lead Tools" accordion (if lead).
Developer diagnostics: behind an expand with a clear "advanced" visual signal.
```

**Reference:** Stripe's API keys page (Secret vs Restricted vs Publishable — three visual tiers, each distinct); Railway.app settings (dangerous zone at bottom, red background)
**Effort:** S — popup.html + popup.css restructuring
**Risk:** Lo — no logic changes, visual reclassification only
**Dependency:** Item 1 (purple token for lead tier)
**Success metric:** Freshman mod no longer sees "schema migration check"; advocate's groan #1 and #7 eliminated
**Stretch:** Tier 3 items require a "Yes, I know what I'm doing" unlock that lasts the session

---

### 11. Typography — the case for one sans-serif surface

**Why through visual lens:** JetBrains Mono throughout is the brand. But there is one surface where it fights the user: long-form modmail body content. A 400-character modmail message in 12px JetBrains Mono with tabular numbers has poor reading flow for paragraph text. Monospace is optimal for data, tabular numbers, code, status labels. It is suboptimal for flowing prose at reading length.

**Visual sketch:**
```
KEEP MONOSPACE (JetBrains Mono or fallback stack):
  - Status bar, all icons, all labels
  - Any numeric display (counts, timestamps, IDs)
  - Code/token display, pattern rules
  - Chip text, status pills
  - All structural UI labels
  - Modmail thread subject lines and sender names

INTRODUCE SYSTEM SANS-SERIF (-apple-system / BlinkMacSystemFont / Segoe UI):
  - Modmail MESSAGE BODY text only (the user's actual message content)
  - AI-generated reply body text (for readability scan)
  - Long-form notes in Intel Drawer (>3 lines of text)

IMPLEMENTATION:
  .gam-mm-body-text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
  font-size: 13px; line-height: 1.55 (up from 1.45 — prose needs more air)
  color: #e8eaed (TEXT, unchanged)

The distinction is clear: structure is monospace, content is sans-serif. This
mirrors what Bloomberg does — interface chrome is mono, news content is sans.
```

One rule: monospace for everything the SYSTEM produces; sans-serif for content the USER typed or the AI generated for human reading.

**Reference:** Bloomberg (mono UI, sans news body); VS Code (mono code editor, sans prose markdown preview); Obsidian (mono code blocks, sans body)
**Effort:** S — 2 CSS rules
**Risk:** Lo — only affects body content within modmail; brand unaffected
**Dependency:** None
**Success metric:** Modmail reply drafting speed improvement (less re-reading); "hard to read" complaints on modmail body
**Stretch:** User preference toggle in GEAR: "Monospace everywhere (classic)" vs "Sans-serif for content (readable)"

---

### 12. Modmail 3-column panel visual architecture — 920px at lg-screen

**Why through visual lens:** The V11 #2 modmail 3-column expansion (thread / sender intel / AI replies) is the highest-impact new surface. Its visual architecture determines how well mods can process context → action in one panel without context-switching.

**Visual sketch:**
```
TOTAL WIDTH: 920px at viewport ≥1280px; 680px (2-col) at <1280px
BORDER-LEFT: 1px solid #2a2f38

COL 1 — THREAD LIST: 240px
  Background: #0f1114 (BG, darkest)
  Thread rows: 48px height, status chip on right
  Active thread: left rail 3px solid #ff9933 (amber) + #181b20 BG

COL 2 — MESSAGES + INTEL: 360px
  Background: #181b20 (BG2, mid)
  Messages in sans-serif (item 11)
  Sender intel strip at top: 40px height
    - Account age: tabular mono
    - Ban count: red chip if >0
    - SUS status: amber chip if active
    - Watchlist: purple chip if watching

COL 3 — AI REPLIES: 320px
  Background: #111318 (darker than BG2, colder) — signals "machine zone"
  Header: "AI DRAFTS" — 9px #7cb8ff, letter-spacing 1.5px
  Each draft: tone chip + body (sans-serif, 12px) + [Use] button (amber)
  Active draft border: 1px solid rgba(124,184,255,0.35) blue

COLUMN DIVIDERS:
  1px solid #2a2f38 between columns — no decorative elements

RESIZE HANDLE (optional):
  Between col2 and col3: 4px drag zone, color transparent, cursor:col-resize
  On hover: 1px solid #3a3f48 appears
```

The three-zone color coding (darkest/mid/coldest) makes column identity visually immediate. Mods who work in the panel for 30 shifts will orient instantly.

**Reference:** Outlook (3-pane, darkening left-to-right); Superhuman (thread list → message → composer zones, distinct backgrounds); Linear (sidebar → content → detail, each shade darker)
**Effort:** M — panel restructure
**Risk:** Lo for visual; Md for viewport breakpoints (item 7 responsiveness)
**Dependency:** Item 7 (motion for panel slide-in), Item 11 (sans-serif body text), Item 1 (color tokens)
**Success metric:** Modmail handling time <30s per thread (today ~45s per CAT2 W2 analysis)
**Stretch:** Col widths persist to `chrome.storage.local` per user

---

### 13. The right-click menu trigger — visual signal of availability

**Why through visual lens:** If mods don't know right-click is available, the context menu doesn't exist for them. We need a passive visual signal that hints "this is right-clickable."

**Visual sketch:**
```
ON HOVER of a right-clickable target (post, /u/ link, modmail row):
  Add: 1px solid rgba(255,153,51,0.25) border — barely visible amber hint
  Add: right-click indicator glyph in bottom-right corner of the hovered element
    Glyph: "⋮" (U+22EE vertical ellipsis) in 9px #5c6370, opacity 0.7
    Appears 150ms after hover begins (delay prevents flicker on pass-through)
    Disappears when hover ends

CONTEXT MENU OPEN:
  The hovered element gets: border 1px solid #ff9933, opacity 1 (from 0.25)
  Menu appears at cursor position + 4px offset

ON KEYBOARD SHORTCUT OVERLAY (Ctrl+Shift+/):
  A full-page dim (rgba(0,0,0,0.4)) with floating panel showing:
    "Right-click any post: Quick-ban, Watch, Remove, Copy link"
    "Right-click any /u/ link: Open Console, Watch, Mark SUS, Copy"
    Each item shows its keyboard equivalent
    Panel style: same as context menu (BG2, BORDER2, JetBrains Mono)
```

**Reference:** Figma (⋮ indicator on hover for element actions); Arc browser (hover-reveal controls); Notion (drag handle appears on block hover)
**Effort:** S — CSS + 150ms timeout on mouseover
**Risk:** Lo — hover-only, no layout changes
**Dependency:** Item 2 (context menu)
**Success metric:** Right-click discovery rate in first 5 minutes of use (measure via context menu open events in first session)
**Stretch:** Onboarding tooltip: first time bar loads, a 3-second amber tooltip appears on the first post: "Right-click anything to act instantly"

---

### 14. Status chips — visual upgrade for the chip system

**Why through visual lens:** Chips are already the best-designed element in the system. But 3 improvements are visible: (a) chip text is 11px which gets tight at smaller sizes; (b) risk chips (`risk-low/medium/high/critical`) are TEXT-ONLY color changes — no background for low/medium; (c) ai_conf chips look identical to risk chips at a glance.

**Visual sketch:**
```
CURRENT CHIP STRUCTURE: padding:2px 8px; border-radius:10px; font-size:11px

PROPOSED CHANGES:
(a) Add left-gutter icon to distinguish chip kinds:
    risk chips: left dot (4px circle) matching fg color — adds visual kind signal
    ai_conf chips: left robot-face glyph (2-char, 8px) — ◈ or [AI] prefix
    verification chips: left checkmark or X glyph

(b) risk-low/medium get faint background (currently text-only):
    risk-low: bg rgba(61,214,140,0.12), color chip-fg-green
    risk-medium: bg rgba(245,166,35,0.15), color chip-fg-amber
    (risk-high/critical already have full backgrounds — keep as-is)

(c) chip-pulse (risk-critical) stays at 2s; add: box-shadow pulse
    0 0 0 3px rgba(240,64,64,0) → 0 0 0 3px rgba(240,64,64,0.3) → 0 0 0 3px rgba(240,64,64,0)
    — the "ring" pulse pattern used by Discord for urgent notifications

(d) AI confidence chip gets BORDER treatment when high:
    ai_conf-high: border: 1px solid rgba(124,184,255,0.4) — blue border
    Signals "machine is confident" at a glance
```

**Reference:** GitHub Labels (dot + text in rounded pill); Linear Status chips (consistent dot prefix); Stripe (badge ring pulse for webhook alerts)
**Effort:** S — CSS additions only (~30 lines)
**Risk:** Lo
**Dependency:** Item 1 (color tokens), Item 4 (icon for AI prefix)
**Success metric:** Mods correctly distinguish ai_conf vs risk chip in 300ms identification test
**Stretch:** Chip size tiers — `.gam-chip--sm` at 9px / `.gam-chip--lg` at 13px for different density contexts

---

### 15. Tooltip redesign — higher, richer, no overlap

**Why through visual lens:** HANDOFF §D1: `.gam-tip` CSS `bottom` value too low, tooltips overlap bar elements. Beyond the Y-offset fix, tooltips can carry more visual information cheaply.

**Visual sketch:**
```
FIX Y-OFFSET:
  Current: positioned bottom:calc(100% + 4px) — likely too low
  Fix: bottom: calc(100% + 10px) on .gam-tip anchored to bar icons
  
TOOLTIP ANATOMY (enhanced):
  Width: max-content, min 120px, max 280px
  Background: #252a31 (BG3 — slightly lighter than BG)
  Border: 1px solid #3a3f48 (BORDER2)
  Box-shadow: 0 4px 16px rgba(0,0,0,0.5)
  Border-radius: 4px (square — Bloomberg)
  Padding: 6px 10px
  Font: 11px JetBrains Mono, color #e8eaed
  
  OPTIONAL SUBTITLE row (for status-bar icons):
    First line: label, 11px #e8eaed, weight 600
    Second line: current state, 10px #8b929e
    Example: "SHIELD" / "Site is healthy — last check 4m ago"
    Example: "SIREN" / "3 SUS users active · 1 DR ready"
  
  ARROW: 6px triangle at bottom, same background color, positioned center
  
  Kbd hint (if action available):
    Right-aligned in tooltip: [Ctrl][Shift][B] rendered as pill spans
    Separated from label by flex spacer
```

**Reference:** Linear tooltips (rich, 2-line with kbd hints); Stripe tooltip (white/dark with arrow, consistent offset); Vercel (keyboard hint right-aligned in tooltip)
**Effort:** S — CSS on .gam-tip + 2-line data structure for status bar icons
**Risk:** Lo
**Dependency:** None
**Success metric:** Zero tooltip overlap reports post-v11
**Stretch:** Tooltips for chips — hover any chip shows full meaning: "RISK-CRITICAL: 3 bans in 24h on prior-DR account"

---

### 16. Loading states — surfaces that AI touches need AI-specific skeletons

**Why through visual lens:** "AI drafting..." text is the only loading state for AI surfaces. Four surfaces need designed loading states: (a) AI hold queue initial load, (b) modmail AI reply generation, (c) shift handoff digest generation, (d) mod audit view AI summary.

**Visual sketch:**
```
STANDARD SKELETON (existing gam-skeleton-shimmer — keep as-is):
  Use for: panel initial loads, data grid loading

AI-SPECIFIC LOADING STATE (new):
  Replaces: "AI drafting..." plain text
  Visual: animated blue typewriter cursor
    [AI] ▌  — "[AI]" in #7cb8ff 10px + blinking 2px×12px bar #7cb8ff
    Blink: 700ms on/off, step-start easing (hard blink, not fade)
  
  Below cursor: 1-2 skeleton text lines at 60-80% width
    Gradient: linear-gradient(90deg, #2a2f38 0%, #3a3f48 50%, #2a2f38 100%)
    Background-size: 200% 100%; animation: gam-shimmer 1.5s ease infinite
  
  Duration visible: min 800ms even if response is instant (prevents flicker)
  Transition to content: crossfade 120ms (opacity 0→1, skeleton opacity 1→0)

STALE/CACHED indicator:
  When cached draft used: small "cached" chip before content
  chip-bg-neutral, 9px "CACHED 8m ago" — fades after 3s
```

**Reference:** GitHub Copilot typing cursor (blue blinking bar); Vercel AI SDK streaming (token-by-token appearance); ChatGPT (cursor-then-text streaming)
**Effort:** S — CSS additions + minor JS tweaks to AI loading paths
**Risk:** Lo
**Dependency:** Item 7 (motion grammar for fade-in)
**Success metric:** No "is this broken?" helpdesk questions about AI loading
**Stretch:** Stream tokens as they arrive from Llama — show partial reply growing character-by-character. Requires streaming response handling but dramatically improves perceived responsiveness.

---

### 17. Incident mode visual identity — fuchsia as the crisis brand

**Why through visual lens:** V11 #24 incident mode (`/incident <slug>`) is a heavy-weight coordination surface. It must be visually unmistakable. When incident mode is active, every mod on the team should visually know they are in an incident without reading any text.

**Visual sketch:**
```
GLOBAL INCIDENT SIGNAL (all mods see this when incident is active):
  Status bar: fuchsia border + glow (item 3 INCIDENT tier)
  Status bar: new leftmost icon ph-lightning in #e060e0
  Bar background: rgba(224,96,224,0.06) faint fuchsia wash

INCIDENT PANEL (slide-in, 480px, triggered by /incident):
  Header background: linear-gradient(135deg, #1a0a1a 0%, #2a0a2a 100%)
  — deep fuchsia-tinted dark, not harsh
  Title: "INCIDENT: [slug]" in 14px #e060e0, JetBrains Mono, weight 700
  Elapsed timer: "00:04:23" in 16px tabular nums, #e8eaed, counting up
  Mods joined: avatar strip (item 8 design) with fuchsia status dots

INCIDENT CHAT THREAD:
  Thread background: #111318 (cold dark)
  Message prefix for incident-tagged messages: left border 3px solid #e060e0
  "INCIDENT ACTIONS" section at bottom — any ban/remove tagged to this incident
  gets a fuchsia "INC" chip prepended

INCIDENT CLOSE:
  "Resolve incident" button: fuchsia filled → white text
  On resolve: bar transitions back to CALM tier (item 3) over 500ms
  Toast: "Incident [slug] resolved — 4:23 duration, 3 actions taken"
```

The fuchsia is ONLY used in incident context. It appears nowhere else in the system. That visual isolation makes it unmistakable. The first time a mod sees fuchsia, they know something serious is happening. The tenth time, they orient within 100ms.

**Reference:** PagerDuty (purple/fuchsia incident acknowledgment color, explicitly not red which = unack'd alert); Datadog (incident page has full-page header color change); Slack (channel header turns red during @channel incidents)
**Effort:** L — depends on incident mode backend (V11 #24 Wave 3)
**Risk:** Md — new color in the system; ensure it doesn't collide with any existing use of purple
**Dependency:** Item 1 (fuchsia token), Item 3 (status bar escalation), Item 8 (presence bar)
**Success metric:** All mods recognize "incident is active" within 2s of opening any tab, without reading text
**Stretch:** Incident severity levels — P1/P2/P3 each have different fuchsia intensity (saturated / medium / desaturated) so severity reads at a glance even within fuchsia tier

---

### 18. Presence bar mod-hue system — stable color identities

**Why through visual lens:** Each mod gets a color derived from username hash. This needs a curated palette, not random colors. Random HSL hashes produce colors that look bad on dark backgrounds or that are indistinguishable from each other.

**Visual sketch:**
```
CURATED PALETTE (8 hues, all WCAG 3.0+ on #181b20 background):
  Slot 0: #4A9EFF  — "Bloomberg blue"
  Slot 1: #3dd68c  — green
  Slot 2: #f5a623  — amber
  Slot 3: #a78bfa  — purple
  Slot 4: #f04040  — red (dramatic but visible; assigned by hash, not by role)
  Slot 5: #7cb8ff  — ice blue
  Slot 6: #ffd60a  — yellow
  Slot 7: #60c0e0  — teal (new slot — distinct from blue/green)

ALGORITHM: hash = username.split('').reduce(acc+char, 0) % 8
Avatar BG: hue at 20% opacity → rgba(R,G,B,0.2)
Avatar text: hue at full opacity
Status dot: hue for active, desaturated for idle (#5c6370), #ffd60a for away

LEAD MOD: avatar always gets purple ring
  border: 2px solid #a78bfa
  Status dot: crown glyph (ph-crown 8px) instead of solid circle
```

Each mod is permanently their color. After one week, team members identify each other by avatar color faster than by initials.

**Reference:** Figma (deterministic avatar colors from user ID); Linear (stable team member colors); GitHub (static avatar colors per user)
**Effort:** S — hash function + CSS variable per avatar
**Risk:** Lo
**Dependency:** Item 8 (presence bar structure)
**Success metric:** Mods reference each other by color ("the blue mod" / "the amber mod") within 2 weeks of deployment — qualitative observation
**Stretch:** In modmail panel, any action by a mod shows their color-coded avatar dot in the thread list — visual indication of who claimed what

---

### 19. Popup header — brand identity vs functional header

**Why through visual lens:** `popup.css:34` shows the popup header has `linear-gradient(180deg, #181b20 0%, #0c0e12 100%)` — the only gradient in the system. The CLAUDE.md design spec says "no gradients." This violates the aesthetic. Beyond that, the popup header is not brand-declaring enough.

**Visual sketch:**
```
CURRENT:
  linear-gradient header, "GAW ModTools" in blue, version chip

PROPOSED:
  Remove gradient — flat #181b20 background
  Add: bottom border becomes 2px solid #ff9933 (amber) instead of 1px neutral
  This single amber line is the brand signal. No gradient needed.
  
  Brand text: "GAM" in amber (not blue) — matches status bar gam-bar-brand
  "ModTools" in #e8eaed, weight 400 — secondary
  Together: [GAM] ModTools — amber+neutral, reads as unit with clear hierarchy

  Version chip: keep as-is (blue pill, monospace, good design already)
  
  Tab nav: redesign active indicator
    Current: implicit
    Proposed: active tab gets amber bottom border 2px, inactive gets none
    Tab text: active #e8eaed weight 700, inactive #8b929e weight 400
    Hover: inactive tab bg → rgba(255,255,255,0.04)
    No rounded corners on tabs — sharp Bloomberg style
```

**Reference:** Bloomberg (amber bottom border on active section); Linear (no gradients, flat nav); Stripe (flat header, bottom-border active tab indicator)
**Effort:** S — popup.css only, ~20 line diff
**Risk:** Lo
**Dependency:** None
**Success metric:** Advocate's "Bloomberg Terminal" compliment extends to popup; popup and status bar feel like same design language
**Stretch:** Tab icons — each tab gets a Phosphor icon to its left (ph-chart-bar, ph-key, ph-wrench, ph-crown)

---

### 20. Hot Now panel — visual design for the triage surface

**Why through visual lens:** V11 #9 Hot Now panel replaces the SIREN → mod log click. It's a new slide-in surface with mixed content (SUS users + DR adds + modmail threads).

**Visual sketch:**
```
PANEL: 400px wide, slide from right (same as modmail)
HEADER: "HOT NOW" in 11px #f04040, letter-spacing 2px, uppercase
  — red because this surface is always showing elevated state

THREE SECTIONS (visual separator between each):
  SUS USERS (up to 5):
    Row: [user chip] [risk chip] [comment count "147 comments/24h" in red tabular] [action button]
    Risk chips sorted HIGH → MEDIUM → LOW
    
  DEATH ROW READY (DR count > 0):
    Row: [user chip] [reason excerpt 11px #8b929e] ["BAN NOW" amber ghost button]
    DR rows get: left gutter 2px solid #a78bfa (purple — death row color)
    
  MODMAIL (up to 3 unread with status=new):
    Row: [sender chip] [subject 11px truncated] [age "3m ago" tabular] [amber "Open" button]
    Prior-ban senders get red left gutter instead of neutral

SECTION HEADERS:
  "5 SUS USERS" — 9px #f04040, uppercase, letter-spacing 1px
  "2 DEATH ROW READY" — 9px #a78bfa, uppercase
  "3 MODMAILS" — 9px #ff9933, uppercase

FOOTER:
  "View mod log →" in 10px #5c6370, right-aligned
  Opens mod log in new panel (does not replace Hot Now)
```

**Reference:** PagerDuty incident list (severity-sorted rows, color-coded left gutters); Datadog monitors (section-by-type, each type has a color identity); Linear triage
**Effort:** M — new panel, 3 data sources
**Risk:** Lo — additive
**Dependency:** Item 1 (colors), Item 7 (slide-in motion), Item 9 (empty states)
**Success metric:** SIREN click → meaningful action (not mod log confusion) in <10s; measure click-to-action time pre/post
**Stretch:** Hot Now auto-opens when SIREN escalates from WARN to ALERT (slide-in triggered without click)

---

### 21. Dock toggle redesign — no more emoji arrows

**Why through visual lens:** Advocate groan #4: `⬅️/➡️` emoji as dock toggle, no undo, jumps panel. This is fixable with a small visual redesign.

**Visual sketch:**
```
CURRENT: "⬅️" or "➡️" button text
PROPOSED:
  Replace with ph-arrows-left-right (toggle icon) in a dedicated button:
  Width: 24px, height: 24px
  Background: transparent
  Border: 1px solid #2a2f38
  Border-radius: 4px
  Color: #5c6370 (TEXT3 — de-emphasized)
  Hover: border-color #3a3f48, color #8b929e
  Active state (just clicked): brief scale(0.9) then return (40ms) — tactile
  Tooltip: "Switch dock side [Ctrl+Shift+D]" with 2-second delay (prevents accidental hover)

ADDED: 3-second undo toast on dock switch
  "Chat panel moved to right. Undo?" — amber ghost button "Undo" for 3s
  Uses existing toast/undo infrastructure (V11 #19)
```

**Reference:** VSCode (editor panel move has undo); Linear (panel toggle with hover delay tooltip); Figma sidebar toggle (icon-only, no text)
**Effort:** S — icon replacement + toast hookup
**Risk:** Lo
**Dependency:** Item 4 (icon system), Item 7 (motion)
**Success metric:** Zero "hit dock toggle accidentally" reports
**Stretch:** Dock position persists to storage and respects per-user preference

---

### 22. Repeat-offender halo — visual treatment in Intel Drawer

**Why through visual lens:** V11 #6 (cheapest high-impact item per Opus). The halo needs a designed visual — "repeat offender" should read instantly.

**Visual sketch:**
```
HALO INDICATOR on Intel Drawer:
  User avatar/initials area: add amber ring when ban_count >= 3
    border: 2px solid #f5a623
    box-shadow: 0 0 0 3px rgba(245,166,35,0.2) — outer glow
  
  Ban count badge: absolute positioned top-right of avatar
    "×7" in 9px bold, background #f04040, color #fff, border-radius 8px, padding 0 3px
    (mirrors existing badge pattern from `#gam-mc-badge-count`)

  Repeat-offender section label in Drawer:
    "REPEAT OFFENDER" — 9px #f5a623, uppercase, letter-spacing 1px
    With left border 2px solid #f5a623
    Ban history entries: left gutter colored by recency (recent=red, old=gray)
```

**Reference:** GitHub's "⚠ This user is blocked" banner treatment; Discord Trust & Safety repeat-violation indicators
**Effort:** S — CSS + 10 LOC in drawer render
**Risk:** Lo
**Dependency:** Item 1 (amber token), Item 14 (chip upgrade)
**Success metric:** Lead's "is this a repeat offender?" check drops from 3 clicks to instant visual recognition
**Stretch:** Animation — halo pulses once (single-play, 600ms) when drawer first opens for a repeat offender

---

### 23. Personal stats sparkline — density-first chart design

**Why through visual lens:** V11 #10 personal stats card needs sparklines. The chart design matters — a poor chart in a Bloomberg-aesthetic tool breaks brand trust.

**Visual sketch:**
```
SPARKLINE SPEC (rendered as inline SVG, 60×16px each):
  Background: none (transparent)
  Line: 1.5px stroke, color matches stat category:
    bans: #f04040
    notes: #a78bfa  
    messages: #4A9EFF
    AI-used: #7cb8ff
  
  Area fill: 30% opacity of line color, gradient from line to transparent
  
  Data points: 7 or 30, evenly spaced
  Y-axis: auto-scaled per stat (no explicit axis — Bloomberg-style implicit scale)
  Hover: crosshair dot appears at cursor X position; tooltip shows value+date
  
  TODAY indicator: rightmost data point gets a 3px filled circle in line color
  
  Layout in popup:
    [STAT LABEL]  [value today]  [sparkline 60×16]  [Δ% vs 7d avg]
    All in one row, 12px font, tabular nums for values and deltas
    Δ positive: #3dd68c, Δ negative: #f04040, Δ neutral: #8b929e

CARD ARRANGEMENT:
  2-column grid, 4 cards (bans/notes/messages/AI-used)
  Each card: 4px top border in stat color (visual identity without wasted space)
```

**Reference:** Bloomberg terminal sparklines (no axis, normalized, area fill); Stripe dashboard (inline sparklines in stat cards); Linear analytics (small multiples)
**Effort:** S — pure SVG generation function (~60 LOC), no lib needed
**Risk:** Lo
**Dependency:** Item 1 (colors), existing actions table aggregation
**Success metric:** Mods check personal stats daily (engagement metric via popup open events)
**Stretch:** Team comparison mode — mod's sparkline shown with faint team-average line overlaid in #8b929e

---

### 24. Intelligence Framework — "Law Enforcement" vs "Intelligence" aesthetic bet

**Why through visual lens:** The prompt raises it explicitly. Both are Bloomberg-adjacent. The call has downstream visual implications across all new surfaces.

**Call: INTELLIGENCE (signals, dossiers, analysis) over LAW ENFORCEMENT (badges, callsigns).**

Rationale: Law enforcement aesthetic (badges, case numbers, cop-report formatting) risks looking like a LARP on a political forum. It would alienate mods who don't identify as "law enforcement." Intelligence aesthetic (signals, analysis, dossiers, mission briefings) maps better to what mods actually do: analyze patterns, assess intent, coordinate responses. The mod IS an intelligence analyst, not a cop.

**Visual implications:**
```
INTEL DRAWER → rename visible header to "INTEL" not "Info" (already named correctly per gam-intel-drawer CSS)
MODMAIL PANEL → section headers: "SENDER HISTORY" not "Past Bans" → suggests analysis
AI HOLD QUEUE → header: "SIGNAL QUEUE" or "FLAGGED SIGNALS" — intelligence framing
HOT NOW → "ACTIVE SIGNALS" rather than just counts
SHIFT HANDOFF → "SHIFT BRIEF" — mission briefing terminology

TYPOGRAPHY additions (intelligence aesthetic):
  Section headers: ALL-CAPS, 9px, 1.5px letter-spacing — briefing style
  Timestamps: always ISO-adjacent "2026-05-08 14:23 UTC" not "3 hours ago" — precision
  Confidence scores: "87% CONFIDENCE" not just "87%" — analyst language

AVOID: badge graphics, star/shield imagery beyond the existing shield icon,
  "Officer" terminology, "Report" as button label (use "Flag" instead),
  "Case number" (use "Incident ID" or "Signal ID")
```

**Reference:** Palantir Gotham (intelligence analysis aesthetic, dossier-style layouts); Bloomberg (data signals, not enforcement); Recorded Future threat intelligence UI
**Effort:** S — label changes, section header typography rules
**Risk:** Lo — aesthetic framing only, no code changes beyond labels
**Dependency:** All new surfaces (items 6, 17, 20)
**Success metric:** UAT verbal feedback shifts from "cop tool" to "analyst workstation" framing — qualitative
**Stretch:** "MISSION BRIEF" popup state for shift start — shows digest of overnight signals before any mods begin

---

### 25. Slash command palette visual design

**Why through visual lens:** V11 #13 slash command palette in chat. This is a new interactive primitive and needs a design that feels like the rest of the tool.

**Visual sketch:**
```
TRIGGER: "/" typed in chat textarea
APPEARANCE: floating above textarea, anchored to left edge

DIMENSIONS: 260px wide, max 240px tall (scrollable)
POSITION: bottom: textarea-top + 4px; left: textarea-left
BORDER-RADIUS: 4px (Bloomberg — square)
BACKGROUND: #181b20 (BG2)
BORDER: 1px solid #3a3f48
BOX-SHADOW: 0 -8px 24px rgba(0,0,0,0.6)  ← upward shadow (above textarea)

ITEM ANATOMY:
  [16px icon in status color] [/command] [description 10px #8b929e] 
  Height: 32px, padding: 0 12px
  
ITEMS:
  /ban     ph-gavel       #f04040    "Quick-ban hovered user"
  /watch   ph-eye         #ffd60a    "Add to watchlist with reason"
  /sus     ph-warning     #f5a623    "Mark user as SUS"
  /incident ph-lightning  #e060e0    "Open incident thread"
  /lookup  ph-magnifying-glass #4A9EFF "Lookup user in Intel Drawer"
  /handoff ph-arrow-square-out #3dd68c "Trigger AI shift digest"
  /coach   ph-graduation-cap #a78bfa  "Request precedent-based coaching"

SELECTED STATE: background rgba(255,255,255,0.06), left rail 2px solid item-color
AUTOCOMPLETE: typed text highlights matching portion of command in amber

MOTION: appears with APPEAR grammar (item 7), 160ms decelerate
```

**Reference:** Linear slash command (same palette style, item color left rail); Notion (/ menu, icon + label + description); Slack slash commands (monospace, dark)
**Effort:** M — new component in modtools.js chat section
**Risk:** Lo for visual; Md per V11 plan for the parser
**Dependency:** Item 4 (icons), Item 7 (motion), Item 1 (colors)
**Success metric:** Slash palette discovery rate >80% in first shift (compared to Ctrl+Shift+B discovery rate today)
**Stretch:** Recently used commands float to top; "most used" badge (call count in amber)

---

## B. WHAT V11_PLAN MISSED (in visual lens)

1. **The popup has a gradient header.** `popup.css:34` shows `linear-gradient(180deg, #181b20 0%, #0c0e12 100%)`. The design spec says no gradients. This is an existing violation that V11_PLAN didn't flag. Fix it in Wave 1 alongside popup work.

2. **popup.css uses `font: 12px/1.45 -apple-system ...`** — the POPUP is already in system sans-serif, not JetBrains Mono. The IN-PAGE content script uses mono. This design inconsistency between popup and in-page UI has never been addressed. Either unify (mono in popup too) or make the split intentional and document it (item 11 applies).

3. **The color system is split across two sources.** `const C` in modtools.js and the palette comment at popup.css top are NOT the same palette. `C.ACCENT = #4A9EFF` but popup.css comment says `ACCENT #4A9EFF` — same. But `C.WARN = #f0a040` while popup.css says `WARN #f0a040`. And the BB-amber used in the status bar is `#ff9933` — a THIRD amber value. Three ambers: `#f5a623` (main), `#f0a040` (WARN alias), `#ff9933` (Bloomberg amber for status bar). This needs canonical deduplication into CSS variables before v11 chips reference them.

4. **No designed error state for the context menu.** If a right-click action fails (network error), what does the mod see? V11_PLAN didn't specify. The context menu disappears and a toast fires — but what does the toast look like? Item 9 (empty states) covers panels; error states on ephemeral elements (context menu actions, j/k decisions in hold queue) need a dedicated pattern.

5. **The 920px modmail panel at lg-screen will have a z-index conflict with the chat panel.** Both are `position:fixed`. The HANDOFF noted the existing z-index hierarchy; 920px modmail + chat panel simultaneously visible needs a dedicated layout resolution. Visually: when both are open, the chat panel must visually subordinate (smaller, lower opacity) rather than compete. V11_PLAN addressed the 1280px breakpoint but not the z-index visual layering when both panels coexist.

---

## C. AESTHETIC BETS (5 structural calls)

**Bet 1: EXTEND Bloomberg, do NOT break from it on new surfaces.** The advocate's trust signal is explicit — "I trust this tool because it looks like a Bloomberg, not a Discord bot." Incident mode could tempt a "war room" visual redesign. Resist. Incident mode is still Bloomberg terminal; it just has fuchsia accents. Same density. Same monospace. Same tight spacing. The emergency is signaled by color, not by a completely different visual register.

**Bet 2: Five semantic colors, not seven.** Red, green, amber, purple, blue are established. Adding only fuchsia (for incident) keeps the palette tight. No mod-specific "team colors" in the main interface — too playful for this context. Mod hues ONLY on avatar chips in presence bar, not on any data or status element.

**Bet 3: Unify icons — Phosphor Regular at 16px.** The emoji-to-SVG migration is high-effort (L total) but the ROI is visual consistency + CSS colorability + zero OS-rendering variance. Ship it as a v11.0 prerequisite, not a nice-to-have. The `🔑 vs 👑` bug alone justifies it.

**Bet 4: Intelligence framing over law enforcement.** Dossiers, signals, briefs — not badges, callsigns, reports. This frames the tool as analyst-grade without making mods feel they're playing cop.

**Bet 5: Monospace for structure, sans-serif for content.** The only departure from full-mono is modmail body text and AI reply body text. Everything structural stays mono. The distinction is semantic and defensible.

---

## D. RISKS (top 5 from visual lens)

1. **Three-amber problem.** `#f5a623`, `#f0a040`, `#ff9933` are all in production, each called "amber" in comments. If any v11 chip, border, or gradient picks the wrong amber, the tool visually vibrates. Dedup to one canonical amber (`--gam-amber: #f5a623`) before shipping item 1.

2. **Fuchsia incident color leaks.** If `#e060e0` appears anywhere outside incident context (wrong CSS selector, inherited rule), it will falsely signal incident. The fuchsia token must be scoped strictly: `--gam-incident` used only in `.gam-bar--incident`, `.gam-incident-panel`, `.gam-inc-chip` classes.

3. **Icon migration breaks existing visual tests or screenshots.** The emoji-to-SVG change is a FULL visual replacement of all status bar icons. Any CWS store screenshots or internal documentation screenshots will show the old emoji. Schedule screenshots after icon migration.

4. **Presence bar at 5+ mods overflows status bar.** If all 15 mods are simultaneously online and the bar shows 5 avatars + "+10" chip, the bar at 28px height may overflow or crush other icons. The overflow design (`+N` chip) must be designed and tested at 15 simultaneous users before Wave 1 ships.

5. **920px modmail panel on a 1280px screen leaves 360px for the page.** At 1024px viewport (which some mods may use on laptops), the 2-column fallback triggers. The visual breakpoint logic must be tested at 1024px, 1280px, 1440px, 1920px explicitly. The 2-column fallback must look intentional, not broken.

---

## E. CTO SYNTHESIS NOTES

The highest-leverage visual items in priority order for implementation sequencing:

**Wave 1 prerequisites (ship with code changes):**
- Item 3 (amber dedup — canonical token) — 30-minute fix, blocks everything else
- Item 5 (token field visual) — unblocks the #2 UAT groan, pure CSS
- Item 19 (popup header, gradient removal) — 20-minute fix, existing violation
- Item 15 (tooltip Y-offset + richer tooltip) — existing bug, 15-minute fix
- Item 9 (empty states) — prevent "assumed broken" from new mods

**Wave 1 new visual components:**
- Item 2 (context menu design) — required for V11 #1
- Item 8 (presence bar visual) — required for V11 #8
- Item 7 (motion grammar) — CSS variables only, sets the contract for all panels

**Wave 2 visual work:**
- Item 4 (icon unification) — L effort but highest qualitative impact
- Item 14 (chip system upgrade) — easy, high density of improvement
- Item 6 (AI hold queue visual) — required for V11 #3
- Item 20 (Hot Now panel design) — required for V11 #9

**Wave 3+:**
- Item 17 (incident mode visual) — depends on V11 #24
- Item 23 (sparklines) — depends on stats endpoint
- Item 12 (3-column modmail) — depends on V11 #2 panel restructure

The single visual bet that pays for everything else: **canonical color token deduplication** (amber × 3 → amber × 1, via CSS vars in GAM_CSS block). It is the foundation every other visual item builds on. Do it first.
