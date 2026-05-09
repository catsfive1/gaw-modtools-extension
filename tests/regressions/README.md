# Regression Test Convention

Every closed bug report gets exactly one file in this directory.

## Naming

`<bug-id>.test.js`

Bug IDs come from the worker's `/bug-reports` table (`id` column, numeric).
Example: bug report #17 -> `17.test.js`.

## File structure (minimum viable)

```js
// tests/regressions/17.test.js
// Bug #17: [one-line description of what failed]
// Closed: YYYY-MM-DD | Version fixed: vX.Y.Z
// Regression risk: LOW | MEDIUM | HIGH
// Refs: [link to bug-report row or internal ticket]

describe('Bug #17 — <one-line description>', () => {
  // Reproduce the exact condition that triggered the original bug.
  // The test must FAIL on the version before the fix, PASS after.
  it('should <expected behaviour>', () => {
    // arrange
    // act
    // assert
  });
});
```

## Rules

1. **One file per bug.** Do not group multiple bugs in one file.
2. **The test must name the bug ID in the `describe` string.** This lets
   CI output be grepped for regression failures by ID.
3. **The test must be runnable in isolation** — no shared mutable state
   with other regression tests. Mock `chrome.*` APIs using the project's
   standard chrome-mock stub (once one exists; see Rule 120 in AF-40).
4. **Do not delete regression tests.** A closed bug can reopen. Mark
   flaky or superseded tests with a `// SUPERSEDED by #<newer-id>` comment
   but leave the file.
5. **Severity comment is mandatory.** LOW = cosmetic / UX polish.
   MEDIUM = data incorrect / feature broken for some users.
   HIGH = data loss / security / all users impacted.

## Relationship to AF-40 (Rule 120)

This directory is the physical manifestation of Rule 120:
"Treat every bug report as a gift — add a regression test and make the
system stronger." The rule is enforced at the workflow level: no bug
report row should be marked `closed` in the worker DB without a
corresponding file here being committed in the same PR.
