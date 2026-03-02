#!/usr/bin/env bash

set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[hooks] not inside a git repository, skip"
  exit 0
fi

CURRENT_HOOKS_PATH="$(git config --local --get core.hooksPath || true)"
TARGET_HOOKS_PATH=".githooks"

if [ -n "$CURRENT_HOOKS_PATH" ] && [ "$CURRENT_HOOKS_PATH" != "$TARGET_HOOKS_PATH" ]; then
  echo "[hooks] keep existing core.hooksPath=$CURRENT_HOOKS_PATH"
  exit 0
fi

git config --local core.hooksPath "$TARGET_HOOKS_PATH"
echo "[hooks] core.hooksPath set to $TARGET_HOOKS_PATH"
