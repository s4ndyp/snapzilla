#!/usr/bin/env bash
# Voer PocketBase-migraties uit (o.a. snapzilla_settings voor OCR-knop).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "PocketBase migraties uitvoeren…"
docker compose exec pocketbase pocketbase migrate up \
  --dir=/pb_data \
  --migrationsDir=/pb_migrations

echo "Klaar. Herlaad de web-UI (Ctrl+F5). Controle:"
echo "  curl -s http://127.0.0.1:\${SNAPZILLA_PORT:-3000}/api/collections/snapzilla_settings/records?perPage=1"
