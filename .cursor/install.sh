#!/usr/bin/env bash
# Cloud Agent / environment build: idempotent repo bootstrap.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git fetch origin main 2>/dev/null || git fetch origin 2>/dev/null || true

  # Older env scripts sometimes patched docker-compose.yml; restore before pull.
  if ! git diff --quiet -- docker-compose.yml 2>/dev/null; then
    git restore --source=origin/main --staged --worktree docker-compose.yml 2>/dev/null \
      || git checkout origin/main -- docker-compose.yml 2>/dev/null \
      || git checkout -- docker-compose.yml 2>/dev/null \
      || true
  fi

  git pull --ff-only origin main 2>/dev/null || true
fi

if [ -f "$ROOT/analyzer/package-lock.json" ]; then
  npm ci --prefix "$ROOT/analyzer" --omit=dev
elif [ -f "$ROOT/analyzer/package.json" ]; then
  npm install --prefix "$ROOT/analyzer" --omit=dev
fi
