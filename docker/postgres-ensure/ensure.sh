#!/usr/bin/env bash
# Runs on every `docker compose up`: creates app + telegram DBs if missing (survives old volumes).
set -euo pipefail

wait_for_postgres() {
  local i
  for i in $(seq 1 60); do
    if psql -h postgres -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Postgres did not become ready in time" >&2
  exit 1
}

ensure_db() {
  local name="$1"
  if ! [[ "$name" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    echo "Invalid database name (allowed: letters, digits, underscore): $name" >&2
    exit 1
  fi
  local exists
  exists=$(psql -h postgres -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$name'" || echo "")
  if [ "$exists" = "1" ]; then
    echo "Database '$name' already exists."
  else
    echo "Creating database '$name'..."
    psql -h postgres -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $name;"
  fi
}

wait_for_postgres
ensure_db "${APP_DB_NAME:-restaurant_db_dev}"
ensure_db "telegram_payments"
echo "Database ensure completed."
