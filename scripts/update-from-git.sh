#!/usr/bin/env bash
# Op de Snapzilla-server in de clone-map uitvoeren (niet docker-compose.yml handmatig laten staan).
set -euo pipefail
cd "$(dirname "$0")/.."

git fetch origin main

if ! git diff --quiet -- docker-compose.yml; then
  echo "docker-compose.yml had lokale wijzigingen — hersteld van origin/main."
  echo "Gebruik docker-compose.override.yml voor poorten/tweaks (zie docker-compose.override.example.yml)."
  git restore --source=origin/main --staged --worktree docker-compose.yml 2>/dev/null \
    || git checkout origin/main -- docker-compose.yml
fi

git pull --ff-only origin main
echo "Git sync OK. Herstart stack met: docker compose up -d --build"
