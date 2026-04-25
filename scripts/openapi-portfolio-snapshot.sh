#!/usr/bin/env bash
# Export Springdoc "portfolio" group only → docs/openapi-portfolio-snapshot.json
# Usage: ./scripts/openapi-portfolio-snapshot.sh [base_url] [out_file]
# Requires: backend up (not prod: springdoc disabled there).
set -euo pipefail
BASE="${1:-http://localhost:8080}"
OUT="${2:-${PWD}/docs/openapi-portfolio-snapshot.json}"
mkdir -p "$(dirname "$OUT")"
curl -fsS "$BASE/v3/api-docs/portfolio" -o "$OUT"
echo "Wrote $OUT. See docs/OPENAPI.md"
