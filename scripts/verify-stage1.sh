#!/usr/bin/env bash
# Run Stage 1 schema verification SQL; save output. Exits 1 if any SQL fails (e.g. missing tables).
set -e
cd "$(dirname "$0")/.."
OUT_DIR="scripts/verify_stage1_outputs"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/schema_checks.sql.out"
echo "Running verify_stage1_schema.sql -> $OUT_FILE"
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGPORT="${PGPORT:-5433}"
export PGDATABASE="${PGDATABASE:-restaurant_db_dev}"
psql -h localhost -p "$PGPORT" -U postgres -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f scripts/verify_stage1_schema.sql > "$OUT_FILE" 2>&1
echo "Done. Schema OK (exit 0)."
