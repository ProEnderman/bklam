#!/usr/bin/env bash
# Connect to Docker Postgres (port 5433 to avoid conflict with local 5432). Password: postgres (see docs/DEV_DOCKER.md).
# Usage: ./scripts/db-psql.sh [file.sql]   — run file or interactive psql
# Default database: restaurant_db_dev (dev standard; override with PGDATABASE).
set -e
cd "$(dirname "$0")/.."
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGPORT="${PGPORT:-5433}"
export PGDATABASE="${PGDATABASE:-restaurant_db_dev}"
if [[ -n "$1" ]]; then
  exec psql -h localhost -p "$PGPORT" -U postgres -d "$PGDATABASE" -f "$1"
else
  exec psql -h localhost -p "$PGPORT" -U postgres -d "$PGDATABASE"
fi
