#!/usr/bin/env bash
# Alleen PocketBase-migraties (meestal niet nodig — gebruik scripts/update.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec -T pocketbase pocketbase migrate up \
  --dir=/pb_data \
  --migrationsDir=/pb_migrations
echo "Migraties uitgevoerd."
