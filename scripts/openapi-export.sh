#!/usr/bin/env bash
# Export OpenAPI JSON from a running app (default http://localhost:8080). Requires: backend up.
# For a subset OpenAPI group only, use: ./scripts/openapi-portfolio-snapshot.sh (see docs/OPENAPI.md).
# Usage: ./scripts/openapi-export.sh [base_url]
set -euo pipefail
BASE="${1:-http://localhost:8080}"
OUT="${2:-${PWD}/openapi-export.json}"
curl -fsS "$BASE/v3/api-docs" -o "$OUT"
echo "Wrote $OUT"
