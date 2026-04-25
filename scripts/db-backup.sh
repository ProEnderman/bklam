#!/usr/bin/env bash
# Full logical backup of PostgreSQL (pg_dump plain SQL, gzip-compressed).
#
# Defaults match dev Docker Compose: host localhost, port 5433, DB restaurant_db_dev, user postgres.
# Override with PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE (same as ./scripts/db-psql.sh).
#
# Usage:
#   ./scripts/db-backup.sh
#   BACKUP_RETENTION_DAYS=7 ./scripts/db-backup.sh
#   PGDATABASE=restaurant_db PGPORT=5432 ./scripts/db-backup.sh
#
# One-liner from host (no script): see docs/BACKUP_RECOVERY.md
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "[BACKUP] ERROR: pg_dump not found. Install PostgreSQL client tools." >&2
  exit 1
fi
if ! command -v gzip >/dev/null 2>&1; then
  echo "[BACKUP] ERROR: gzip not found." >&2
  exit 1
fi

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

BACKUP_ROOT="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
OUT_FILE="${BACKUP_ROOT}/${PGDATABASE}_${STAMP}.sql.gz"
OUT_TMP="${OUT_FILE}.tmp.$$"

mkdir -p "$BACKUP_ROOT"

echo "[BACKUP] Started at $(date -Iseconds 2>/dev/null || date)"
echo "[BACKUP] Target: ${PGHOST}:${PGPORT}/${PGDATABASE} (user: ${PGUSER})"
echo "[BACKUP] Writing to: ${OUT_FILE} (via temp ${OUT_TMP})"

rm -f "$OUT_TMP"
# --clean --if-exists: restore can replace objects in same DB (see docs for risks).
# pipefail: pipeline fails if pg_dump fails (no silent empty .gz).
if ! pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --format=plain \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  | gzip >"$OUT_TMP"
then
  rm -f "$OUT_TMP"
  echo "[BACKUP] ERROR: pg_dump | gzip failed" >&2
  exit 1
fi

if [[ ! -s "$OUT_TMP" ]]; then
  rm -f "$OUT_TMP"
  echo "[BACKUP] ERROR: output is empty; aborting." >&2
  exit 1
fi

mv "$OUT_TMP" "$OUT_FILE"
BYTES="$(wc -c <"$OUT_FILE" | tr -d ' ')"
echo "[BACKUP] Saved to $OUT_FILE (${BYTES} bytes compressed)"
echo "[BACKUP] Absolute path: $(cd "$(dirname "$OUT_FILE")" && pwd)/$(basename "$OUT_FILE")"
echo "[BACKUP] Finished at $(date -Iseconds 2>/dev/null || date)"

if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [[ "$RETENTION_DAYS" -gt 0 ]]; then
  echo "[BACKUP] Pruning under $BACKUP_ROOT older than ${RETENTION_DAYS} days (*.sql.gz, legacy *.sql)..."
  find "$BACKUP_ROOT" -maxdepth 1 -type f \( -name '*.sql.gz' -o -name '*.sql' \) -mtime "+${RETENTION_DAYS}" -print -delete || true
fi
