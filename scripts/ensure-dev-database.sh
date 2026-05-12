#!/usr/bin/env bash
# Creates the local Postgres database used by the Spring "dev" profile if it does not exist.
# DB name: extracted from DEV_DB_URL (if set), else DEV_POSTGRES_DB_NAME, else restaurant_db_dev.
# Usage: ./scripts/ensure-dev-database.sh
# Requires: psql, Postgres listening on localhost (default user/pass from env or below).

set -euo pipefail

# jdbc:postgresql://host:port/dbname?params → dbname
db_name_from_dev_url() {
  local url="${1:-}"
  [[ -z "$url" ]] && return 1
  url="${url%%\?*}"
  url="${url%%#*}"
  local name="${url##*/}"
  [[ -n "$name" && "$name" != "$url" ]] && echo "$name" && return 0
  return 1
}

DB_NAME="${DEV_POSTGRES_DB_NAME:-restaurant_db_dev}"
if [[ -n "${DEV_DB_URL:-}" ]]; then
  if parsed=$(db_name_from_dev_url "$DEV_DB_URL"); then
    DB_NAME="$parsed"
  fi
fi

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
if [[ -n "${DEV_DB_URL:-}" ]]; then
  # jdbc:postgresql://host:port/db — best-effort parse (default port 5432 if omitted)
  rest="${DEV_DB_URL#jdbc:postgresql://}"
  rest="${rest%%\?*}"
  rest="${rest%%#*}"
  if [[ "$rest" == *"/"* ]]; then
    hostport="${rest%%/*}"
    if [[ "$hostport" == *:* ]]; then
      PGHOST="${hostport%%:*}"
      PGPORT="${hostport#*:}"
    else
      PGHOST="$hostport"
    fi
  fi
fi
PGUSER="${PGUSER:-${DB_USERNAME:-postgres}}"
PGPASSWORD="${PGPASSWORD:-${DB_PASSWORD:-postgres}}"
export PGHOST PGPORT PGUSER PGPASSWORD

if ! command -v psql >/dev/null 2>&1; then
  echo "ensure-dev-database: psql not found. Install PostgreSQL client or create DB manually:" >&2
  echo "  psql -U postgres -h localhost -c \"CREATE DATABASE ${DB_NAME};\"" >&2
  exit 1
fi

exists=$(psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" 2>/dev/null || true)
if [[ "$exists" == "1" ]]; then
  echo "ensure-dev-database: database '${DB_NAME}' already exists."
  exit 0
fi

echo "ensure-dev-database: creating database '${DB_NAME}'..."
psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${DB_NAME}\";"
echo "ensure-dev-database: done."
