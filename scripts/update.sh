#!/usr/bin/env bash
# Eén server-update na merge naar main: git pull + build + PocketBase-migraties.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Snapzilla update =="

echo "→ Git synchroniseren met main…"
git fetch origin main
if ! git diff --quiet -- docker-compose.yml 2>/dev/null; then
  echo "  docker-compose.yml lokaal gewijzigd → hersteld van origin/main."
  echo "  (Poort/tweaks: docker-compose.override.yml, zie docker-compose.override.example.yml)"
  git restore --source=origin/main --staged --worktree docker-compose.yml 2>/dev/null \
    || git checkout origin/main -- docker-compose.yml
fi
git pull --ff-only origin main

echo "→ Containers bouwen en starten…"
docker compose up -d --build

echo "→ PocketBase-migraties…"
ready=0
for _ in $(seq 1 30); do
  if docker compose exec -T pocketbase wget -q -O /dev/null http://127.0.0.1:8090/api/health 2>/dev/null; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "PocketBase reageert niet op /api/health — migratie overgeslagen." >&2
  exit 1
fi

if ! docker compose exec -T pocketbase pocketbase migrate up \
  --dir=/pb_data \
  --migrationsDir=/pb_migrations; then
  echo "PocketBase migrate up mislukt — output hierboven." >&2
  echo "Handmatig: cd $ROOT && docker compose exec pocketbase pocketbase migrate up --dir=/pb_data --migrationsDir=/pb_migrations" >&2
  exit 1
fi

echo "→ Klaar."
docker compose ps
echo ""
echo "Web-UI: hard refresh in de browser (Ctrl+F5)."
