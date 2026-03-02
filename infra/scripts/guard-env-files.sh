#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-staged}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[env-guard] not inside a git repository, skip"
  exit 0
fi

case "$MODE" in
  staged)
    CANDIDATES="$(git diff --cached --name-only --diff-filter=ACMR || true)"
    ;;
  tracked)
    CANDIDATES="$(git ls-files || true)"
    ;;
  *)
    echo "[env-guard] invalid mode: $MODE (expected: staged|tracked)"
    exit 2
    ;;
esac

FORBIDDEN="$(
  printf "%s\n" "$CANDIDATES" \
    | awk '
      NF == 0 { next }
      {
        basename = $0
        sub(/^.*\//, "", basename)
        if (basename ~ /^\.env(\..+)?$/ && basename != ".env.example") {
          print $0
        }
      }
    ' \
    | sort -u
)"

if [ -n "$FORBIDDEN" ]; then
  echo "[env-guard] blocked: .env files cannot be committed"
  echo "[env-guard] remove these files from git index:"
  echo "$FORBIDDEN" | sed 's/^/  - /'
  echo "[env-guard] allowed template: .env.example"
  echo "[env-guard] fix with: git rm --cached <file>"
  exit 1
fi

echo "[env-guard] OK ($MODE)"
