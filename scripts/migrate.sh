#!/usr/bin/env bash
# Flyway runs embedded when Spring Boot starts; there is no separate Flyway CLI in this repo.
# This script brings up local Postgres (Docker) if available, then reminds you to start the app once.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if command -v docker >/dev/null 2>&1 && [ -f docker-compose.yml ]; then
  if docker info >/dev/null 2>&1; then
    echo "Starting Postgres (and Redis) via docker compose..."
    docker compose up -d postgres redis
    for i in 1 2 3 4 5 6 7 8 9 10; do
      docker compose exec -T postgres pg_isready -U postgres -d "${POSTGRES_DB:-restaurant_db_dev}" >/dev/null 2>&1 && break
      sleep 1
    done
  fi
fi

echo ""
echo "Migrations apply on first Spring Boot startup (see spring.flyway in application.yml / application-dev.yml)."
echo "Next, ensure .env is configured from .env.example, then run:"
echo "  ./scripts/run.sh"
echo "  (or: make run)"
echo ""
