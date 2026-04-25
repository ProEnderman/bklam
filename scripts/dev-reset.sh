#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "WARNING: This will remove all Postgres and Redis data (volumes)."
echo "Press Ctrl+C to cancel, or Enter to continue."
read -r

docker compose down -v
echo "Volumes removed. Starting fresh postgres and redis..."
docker compose up -d postgres redis
echo "Done. Run backend to apply Flyway, then ./scripts/verify-stage1.sh"
