#!/usr/bin/env bash
# Creates local Postgres database restaurant_db_dev if it does not exist.
# Usage: ./scripts/ensure-dev-database.sh
# Requires: psql, Postgres listening on localhost (default user/pass from env or below).

set -euo pipefail

DB_NAME="${DEV_POSTGRES_DB_NAME:-restaurant_db_dev}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
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
