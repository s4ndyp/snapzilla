#!/usr/bin/env bash
# Vervang oude environment-install regels (git pull) door: bash .cursor/sync-main.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git fetch origin main 2>/dev/null || git fetch origin

git restore --source=origin/main --staged --worktree docker-compose.yml 2>/dev/null \
  || git checkout origin/main -- docker-compose.yml 2>/dev/null \
  || git checkout -- docker-compose.yml 2>/dev/null \
  || true

git pull --ff-only origin main
