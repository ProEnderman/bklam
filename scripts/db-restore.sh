#!/usr/bin/env bash
# Restore PostgreSQL from plain SQL (.sql) or gzip-compressed (.sql.gz) pg_dump.
#
# Same connection env as db-backup.sh / db-psql.sh: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE.
#
# Usage:
#   CONFIRM=YES ./scripts/db-restore.sh ./backups/restaurant_db_dev_20260101_120000.sql.gz
#   CONFIRM=YES ./scripts/db-restore.sh ./backups/legacy.sql
#
# WARNING: with dumps created by db-backup.sh (--clean --if-exists), this will DROP and recreate
# objects in the target database. Stop the application first to avoid open connections errors.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v psql >/dev/null 2>&1; then
  echo "[RESTORE] ERROR: psql not found. Install PostgreSQL client tools." >&2
  exit 1
fi

if [[ "${CONFIRM:-}" != "YES" ]]; then
  echo "Refusing to run: set CONFIRM=YES to acknowledge destructive restore."
  echo "Example: CONFIRM=YES $0 path/to/backup.sql.gz"
  exit 1
fi

if [[ $# -lt 1 ]] || [[ ! -f "$1" ]]; then
  echo "Usage: CONFIRM=YES $0 /path/to/backup.sql.gz  (or .sql)"
  exit 1
fi

BACKUP_FILE="$1"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5433}"
export PGUSER="${PGUSER:-${DB_USERNAME:-postgres}}"
export PGPASSWORD="${PGPASSWORD:-${DB_PASSWORD:-postgres}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-restaurant_db_dev}}"

echo "[RESTORE] Started at $(date -Iseconds 2>/dev/null || date)"
echo "[RESTORE] Source file: $BACKUP_FILE"
echo "[RESTORE] Target DB: ${PGHOST}:${PGPORT}/${PGDATABASE} (user: ${PGUSER})"

if [[ "${RESTORE_NONINTERACTIVE:-}" != "YES" ]]; then
  echo "Stop the backend (and any psql sessions) before continuing. Press Ctrl+C to abort, or Enter to proceed."
  read -r _
fi

echo "[RESTORE] Restoring..."
case "$BACKUP_FILE" in
  *.gz)
    if ! command -v gzip >/dev/null 2>&1; then
      echo "[RESTORE] ERROR: gzip not found (needed for .sql.gz)." >&2
      exit 1
    fi
    gzip -dc -- "$BACKUP_FILE" | psql \
      --host="$PGHOST" \
      --port="$PGPORT" \
      --username="$PGUSER" \
      --dbname="$PGDATABASE" \
      --variable=ON_ERROR_STOP=1
    ;;
  *)
    psql \
      --host="$PGHOST" \
      --port="$PGPORT" \
      --username="$PGUSER" \
      --dbname="$PGDATABASE" \
      --variable=ON_ERROR_STOP=1 \
      --file="$BACKUP_FILE"
    ;;
esac

echo "[RESTORE] Finished at $(date -Iseconds 2>/dev/null || date)"
