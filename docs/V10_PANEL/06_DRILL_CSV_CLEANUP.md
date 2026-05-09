# DRILL/CSV Cleanup Audit

## A. WHAT "DRILL //" CURRENTLY MEANS (code trace)

`popup.css` line 910-917 — Bloomberg-terminal theme block (Iter 10), scoped to `#pop-drill::before`:

```css
#pop-drill::before, .pop-drill::before {
  content: "DRILL // ";
  color: var(--bb-amber);
  font-weight: 600;
  letter-spacing: 0.08em;
  font-size: var(--bb-t-xs);
  text-transform: uppercase;
}
```

This is a **CSS pseudo-element prefix** that prepends the literal string `DRILL // ` in amber before the entire `#pop-drill` div — before the title span, before the close button, before any content. It is injected by the stylesheet, not by JS, not configurable, not accessible. It visually floats above the panel header at all times.

The panel header (`pop-drill-head`) already contains `pop-drill-title`, which is set by JS via `__DRILL_TITLES[key]` — a proper, descriptive map:

- `pending` -> "Pending users (awaiting triage)"
- `dr` -> "Death Row queue"
- `banned` -> "Banned users (roster)"
- `bans24` -> "Bans (last 24h)"
- `msgs24` -> "Messages / replies (last 24h)"
- `notes24` -> "Notes (last 24h)"

So the panel already has a clear, stat-specific title. `DRILL // ` is decorative noise stacked on top of that. It adds nothing to wayfinding — it predates the title system and was never removed.

Commander's read is correct: noise. Remove it.

---

## B. PROPOSED HEADER (replace prefix)

Remove the `::before` block entirely. The `pop-drill-title` already does the job with real language. If a section label is still wanted above the title for visual anchoring, set it in HTML as a static label (e.g. `<span class="pop-drill-section-label">DETAIL VIEW</span>`) so it's accessible and suppressible — not a CSS content ghost.

Recommended: just delete the `::before` block. The amber title in `pop-drill-title` renders at 12px/700 weight in `#4A9EFF` — already visually prominent enough to anchor the panel. No replacement text needed.

---

## C. WHAT EXPORT CSV DOES (trace)

`__exportDrillCsv()` (popup.js line 2923-2942):

1. Reads `__lastDrill` — a module-level cache updated by every `__render*` function before it builds rows.
2. `__lastDrill.cols` = column names for the current stat (e.g. `['ts', 'user', 'status', 'reason']` for pending).
3. `__lastDrill.rows` = plain-object array, one entry per rendered drill row.
4. Serialises to CSV: header row from `cols`, data rows via `cols.map(c => esc(r[c]))`. Values are quote-escaped.
5. Creates a Blob, synthesises a download link, fires `.click()`, revokes the URL.
6. Output filename: `modtools-drill-<key>-YYYY-MM-DD.csv`.

It exports **exactly what is currently visible in the drill panel** — the same rows rendered to the DOM, in the same column shape, as a downloadable file. It fires only when rows exist (`cur.rows.length === 0` early-returns silently).

All six stat keys populate `__lastDrill` correctly before returning control to `renderDrillDown`. The CSV function is wired to `pop-drill-csv` click via `addEventListener` in the init block (line 2957-2958). The button text "Export CSV" is the only label the user sees — no tooltip, no count, no column preview.

This feature is **functional and non-trivial** — it's the one escape hatch for getting mod data out of the extension without screenshotting. It should stay. The button label is just weak.

---

## D. RECOMMENDATION

| Item | Decision | Reason |
|---|---|---|
| `DRILL //` `::before` CSS block | **REMOVE** | Pure decorative noise. Real title already exists via `__DRILL_TITLES`. Duplicate, inaccessible. |
| Export CSV button | **KEEP, rename** | Functional, non-trivial data export. Rename label from "Export CSV" to "Export rows as CSV" for self-evidence. |

---

## E. SHIP-TONIGHT PATCH

### 1. popup.css — remove the `DRILL //` pseudo-element

Lines 901-917 in the Bloomberg Iter 10 block. Delete this rule entirely:

```css
/* REMOVE THIS BLOCK (lines 910-917) */
#pop-drill::before, .pop-drill::before {
  content: "DRILL // ";
  color: var(--bb-amber);
  font-weight: 600;
  letter-spacing: 0.08em;
  font-size: var(--bb-t-xs);
  text-transform: uppercase;
}
```

### 2. popup.html — rename the Export CSV button (line 84)

```diff
- <button class="pop-link" id="pop-drill-csv">Export CSV</button>
+ <button class="pop-link" id="pop-drill-csv" title="Download visible rows as a CSV file">Export rows</button>
```

Shorter label (`Export rows`), `title` tooltip carries the full description for hover. The `id` is unchanged so JS wiring is unaffected.

No JS changes needed.

---

## F. BLOOMBERG-AESTHETIC ALTERNATIVES

If `DRILL //` was meant to evoke terminal-grade data density, the actual Bloomberg signifier isn't a CSS prefix — it's **amber monospace table headers**, **tabular-nums**, and **row striping**. Those already exist in the drill panel via `.pop-drill th` styling. The `//` pattern reads more as a comment-marker (C, CSS, JS) than a Bloomberg glyph.

If a section-label feel is still wanted, one option: add a static `data-panel="DETAIL"` attribute to `#pop-drill` and drive a CSS `attr()` label — but only if Commander explicitly wants a visual tier marker above the title. Current `__DRILL_TITLES` strings are already information-dense enough that the panel identifies itself immediately. No replacement is the clean call.
