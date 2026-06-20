# STAGED FIX — orphaned `#mc-esc-confirm` on Mod Console teardown

**Status:** AUDITED + STAGED. **Apply post-build** (the in-page UI build workflow
`wf_ad007652-aee` currently owns `modtools.js`; WP-02 is actively editing this exact
region — do NOT race it). Apply against the FINAL post-build file, re-capturing the
exact `oldString`.

**Type:** JS-behavioral (DOM cleanup on teardown). NOT a styling change.

---

## The leak (confirmed by audit)

- `#mc-esc-confirm` is built in the Mod Console ESC handler (`modtools.js` ~9228) and
  inserted as a child of the `mc` panel: `head.parentNode.insertBefore(confirmRow, head.nextSibling)` (~9241).
- Its ONLY self-cleanup is its own **Discard** / **Keep typing** buttons (~9243–9254).
- `closeAllPanels()` (defn **7952**) is the master teardown. It sweeps a defensive `SEL`
  list (`.gam-modal`, `#gam-backdrop`, `.gam-modal-backdrop`, `#gam-intel-backdrop`,
  `#gam-token-onboard-backdrop`, `.gam-preflight-wrap`, `[data-gam-orphan-backdrop]`).
  **`#mc-esc-confirm` is NOT in that list.** So when the console is torn down by any route
  other than the confirm row's own buttons — global ESC (14055), backdrop click, programmatic
  close (8450/8487/8513), or a panel body re-render that leaves the head-sibling row attached —
  the confirm row is orphaned.
- WP-02's restyle added a comment claiming "never orphans DOM," but that refers to its
  reserved fixed-height **footer-slot layout**, not the `closeAllPanels` teardown gap. The
  behavioral leak is untouched by the redesign.

## The fix (matches the codebase's own defensive-sweep idiom)

In `closeAllPanels()` `SEL` array (~7974–7982), add `'#mc-esc-confirm'`:

```js
const SEL = [
  '.gam-modal',
  '#gam-backdrop',
  '.gam-modal-backdrop',
  '#gam-intel-backdrop',
  '#gam-token-onboard-backdrop',
  '.gam-preflight-wrap',
  '#mc-esc-confirm',               // ESC-confirm row: orphaned if mc torn down while visible
  '[data-gam-orphan-backdrop]'
].join(', ');
```

**Why this layer:** identical pattern to v8.6.1 (modals), v9.3.1 (backdrops), v9.3.16
(`.gam-preflight-wrap`). The confirm row's listeners live on its child buttons and die with
`.remove()`, so it needs NO extra handler cleanup — the existing per-element cleanup loop
(7984–7999: `_gamFocusCleanup` / `_gamEscHandler` / intel-backdrop esc) is a safe no-op for it.
Covers both possible close mechanisms (DOM-remove via `.gam-modal`, OR class-hide of `#gam-mc-panel`,
in which case the explicit removal is load-bearing, not merely defensive).

## Apply-time verification checklist (post-build)

1. Confirm the build's FINAL `closeAllPanels` `SEL` does not already include `#mc-esc-confirm`
   (avoid double-add).
2. Determine `#gam-mc-panel` close mechanism (DOM-remove vs class-hide). If class-hide, this
   removal is load-bearing.
3. Re-capture exact `oldString` (build shifts line numbers/content).
4. `node --check modtools.js` → PARSE OK.
5. Sibling-leak parity (per Commander's ask): `closeAllPanels` already sweeps all backdrop
   variants + `.gam-preflight-wrap`. **No other inline transient row leaks found.** The
   Modmail full panel's direct `panel.remove()` (19348/19462) self-cleans via its own ESC/click
   handlers + focus-trap disposer — unrelated to `#mc-esc-confirm`. The periodic
   `_gamOrphanBackdropSweep` (8010) is backdrop-scoped; the `closeAllPanels` fix above fully
   closes the confirm-row gap (stale row removed on close → clean on reopen).
