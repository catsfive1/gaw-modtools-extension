#!/bin/bash
# v10.14.1 TK5: CI guard against new raw-hex leaks in token-controlled files.
#
# Greps NEW lines (added in current diff) of popup.css/popup.js/modtools.js
# for #ff9933 / #f0a040 / #E8A317 / #4A9EFF outside :root tokens / fallbacks.
#
# Usage:
#   bash scripts/check-no-raw-hex.sh           # check staged diff
#   bash scripts/check-no-raw-hex.sh --commit  # check HEAD vs HEAD~1
#
# Exit 0 = clean, exit 1 = found violations.

set -u

if [ "${1-}" = "--commit" ]; then
  DIFF_RANGE="HEAD~1..HEAD"
else
  DIFF_RANGE="--cached"
fi

# Watched files
FILES=("popup.css" "popup.js" "modtools.js")

# Banned hex patterns (case-insensitive). Excludes:
#   - lines defining --bb-* CSS tokens (legitimate :root declarations)
#   - lines using var(--bb-*, #FALLBACK) syntax (legitimate fallback)
#   - PALETTE doc comment block at popup.css:7
#   - C const declarations / colors map at modtools.js (top-of-file tokens)
BANNED='(#ff9933|#f0a040|#E8A317|#4A9EFF)'
SKIP_PATTERN='(--bb-|var\(--bb-|PALETTE|AMBER:|AMBER_COOL:|WARN:|BLUE:|ACCENT:|escalate:[ \t]+|GAM_TONE_COLOR|gam-debug-dump)'

violations=0

for f in "${FILES[@]}"; do
  # Get added lines (lines starting with + but not +++) for this file
  added=$(git diff "$DIFF_RANGE" -- "$f" 2>/dev/null | grep -E '^\+[^+]' | sed 's/^+//')
  if [ -z "$added" ]; then
    continue
  fi

  # Filter: keep lines that match BANNED but NOT the skip pattern
  matches=$(echo "$added" | grep -iE "$BANNED" | grep -ivE "$SKIP_PATTERN" || true)
  if [ -n "$matches" ]; then
    echo "[no-raw-hex] $f -- new lines contain raw banned hex:"
    echo "$matches" | head -10 | sed 's/^/  /'
    cnt=$(echo "$matches" | wc -l)
    violations=$((violations + cnt))
  fi
done

if [ $violations -gt 0 ]; then
  echo ""
  echo "[no-raw-hex] FAIL -- $violations new raw-hex line(s) detected."
  echo "  Use var(--bb-*) tokens (CSS) or const C aliases (JS): C.AMBER, C.WARN, C.AMBER_COOL, C.BLUE."
  echo "  See docs/V10_13_RALPH_AUDIT/RALPH-TOKEN-CALLSITES.md for migration guidance."
  exit 1
fi

echo "[no-raw-hex] OK -- no new raw-hex leaks."
exit 0
