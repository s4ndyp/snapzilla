#!/usr/bin/env bash
# Cloud Agent environment install — altijd via: bash .cursor/install.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/.cursor/sync-main.sh"

if [ -f "$ROOT/analyzer/package-lock.json" ]; then
  npm ci --prefix "$ROOT/analyzer" --omit=dev
elif [ -f "$ROOT/analyzer/package.json" ]; then
  npm install --prefix "$ROOT/analyzer" --omit=dev
fi
