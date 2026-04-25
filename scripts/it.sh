#!/usr/bin/env bash
# Run docker-dependent integration tests (Testcontainers: Postgres).
# Testcontainers will start its own Postgres; no need to run dev-up.sh for these.
# Usage: ./scripts/it.sh
set -e
cd "$(dirname "$0")/.."
echo "Running RlsIsolationIT and NetworkHierarchyMigrationIT (Testcontainers)..."
./gradlew test --no-daemon \
  --tests "com.restaurant.tenant.RlsIsolationIT" \
  --tests "com.restaurant.tenant.NetworkHierarchyMigrationIT" \
  "$@"
echo "IT passed."
