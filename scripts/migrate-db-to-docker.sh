#!/usr/bin/env bash
# Copy your REAL database from local Postgres (e.g. 5432) into Docker Postgres (5433).
# Use this when you want to work with your actual data in Docker, NOT Flyway test data.
#
# Usage:
#   1. Have your real DB running on source (e.g. localhost:5432).
#   2. Run: ./scripts/migrate-db-to-docker.sh
#   3. Start backend: SPRING_PROFILES_ACTIVE=local-docker ./gradlew bootRun
#
# Optional: PGUSER_SOURCE=your_local_user PGPASSWORD=your_pass ./scripts/migrate-db-to-docker.sh
#   (On macOS Homebrew Postgres often uses your OS user, not 'postgres'.)
set -e
cd "$(dirname "$0")/.."

SOURCE_PORT="${PGPORT_SOURCE:-5432}"
SOURCE_USER="${PGUSER_SOURCE:-postgres}"
TARGET_PORT="${PGPORT_TARGET:-5433}"
# Source: your existing DB (set SOURCE_DATABASE; legacy default restaurant_db). Target: dev standard restaurant_db_dev.
SOURCE_DB="${SOURCE_DATABASE:-restaurant_db}"
TARGET_DB="${TARGET_DATABASE:-restaurant_db_dev}"
BACKUP_DIR="scripts/backups"
BACKUP_FILE="$BACKUP_DIR/${TARGET_DB}_before_docker_$(date +%Y%m%d_%H%M%S).dump"

export PGPASSWORD="${PGPASSWORD:-postgres}"

echo "=== Transfer REAL DB into Docker (no test data) ==="
echo "Source:  localhost:$SOURCE_PORT/$SOURCE_DB (user: $SOURCE_USER)"
echo "Target:  localhost:$TARGET_PORT/$TARGET_DB (Docker)"
echo ""

# 1) Dump from source (your actual database)
echo "1/5 Creating dump from source (port $SOURCE_PORT)..."
mkdir -p "$BACKUP_DIR"
if ! pg_dump -h localhost -p "$SOURCE_PORT" -U "$SOURCE_USER" -d "$SOURCE_DB" -F c -f "$BACKUP_FILE"; then
  echo "Error: dump failed. Is Postgres on port $SOURCE_PORT running? Does DB $SOURCE_DB exist?"
  echo "On macOS, try: PGUSER_SOURCE=$(whoami) ./scripts/migrate-db-to-docker.sh"
  exit 1
fi
echo "   Дамп сохранён: $BACKUP_FILE"
echo ""

# 2) Reset Docker and start empty Postgres
echo "2/5 Docker Postgres will be recreated (current data there will be wiped)."
echo "   Run ./scripts/dev-reset.sh now? (y/n)"
read -r confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "   Skipped. Run manually: ./scripts/dev-reset.sh"
  echo "   Then restore: pg_restore -h localhost -p $TARGET_PORT -U postgres -d $TARGET_DB --no-owner --no-privileges $BACKUP_FILE"
  exit 0
fi
./scripts/dev-reset.sh
echo ""

# 3) Wait for Docker Postgres
echo "3/5 Waiting for Docker Postgres..."
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if PGPORT=$TARGET_PORT psql -h localhost -U postgres -d "$TARGET_DB" -c "SELECT 1" >/dev/null 2>&1; then
    echo "   Postgres ready."
    break
  fi
  if [[ $i -eq 12 ]]; then
    echo "   Timeout. Check: docker compose ps"
    exit 1
  fi
  sleep 2
done
echo ""

# 4) Restore your dump into Docker
echo "4/5 Restoring your DB into Docker (port $TARGET_PORT)..."
RESTORE_LOG=$(mktemp)
pg_restore -h localhost -p "$TARGET_PORT" -U postgres -d "$TARGET_DB" --no-owner --no-privileges "$BACKUP_FILE" 2>"$RESTORE_LOG" || true
if [[ -s "$RESTORE_LOG" ]]; then
  echo "   pg_restore output (warnings about roles/owners are often OK):"
  tail -15 "$RESTORE_LOG"
fi
rm -f "$RESTORE_LOG"
echo "   Restore step finished."
echo ""

# 5) Verify that key tables exist (catch empty source or failed restore)
echo "5/5 Verifying restore..."
if ! PGPORT=$TARGET_PORT psql -h localhost -U postgres -d "$TARGET_DB" -t -A -c "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='restaurants' LIMIT 1;" 2>/dev/null | grep -q 1; then
  echo "   ERROR: Table 'restaurants' not found after restore."
  echo "   Your source DB (port $SOURCE_PORT) may have no schema. Run backend once against it so Flyway creates tables, then re-run this script."
  echo "   Or list dump contents: pg_restore -l $BACKUP_FILE | head -50"
  exit 1
fi
echo "   OK: tables present."
echo ""
echo "Done. Your real DB is now in Docker. Start backend:"
echo "  SPRING_PROFILES_ACTIVE=local-docker ./gradlew bootRun"
echo "  Or full stack: ./scripts/docker-up-full.sh"
echo "Then: ./scripts/smoke-check.sh"
