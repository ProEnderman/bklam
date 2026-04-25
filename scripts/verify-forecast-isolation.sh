#!/usr/bin/env bash
# Verify forecast container cannot reach postgres and internal JWT auth for /api/internal/forecast-data/
# Usage: from project root, after 'docker compose up' (backend + forecast): ./scripts/verify-forecast-isolation.sh
# Requires: curl; for (3) set ISSUED_INTERNAL_JWT env var if you have a token, or skip that check.

set -e
BACKEND_URL="${BACKEND_URL:-http://localhost:8080}"
ORDERS_URL="${BACKEND_URL}/api/internal/forecast-data/orders?from=2024-01-01&to=2024-01-31"

echo "=== 1) Forecast container cannot reach Postgres ==="
docker compose exec -T forecast sh -c 'python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(2)
try:
    s.connect((\"postgres\", 5432))
    print(\"FAIL: postgres reachable\")
    exit(1)
except (socket.gaierror, OSError) as e:
    print(\"OK: postgres not reachable (\", type(e).__name__, \")\")
"'
echo ""

echo "=== 2) GET internal forecast orders without Authorization -> 401 ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$ORDERS_URL")
if [ "$CODE" = "401" ]; then
  echo "OK: got 401"
else
  echo "FAIL: expected 401, got $CODE"
  exit 1
fi
echo ""

echo "=== 3) GET internal forecast orders with valid internal JWT -> 200 ==="
if [ -n "${ISSUED_INTERNAL_JWT}" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${ISSUED_INTERNAL_JWT}" "$ORDERS_URL")
  if [ "$CODE" = "200" ]; then
    echo "OK: got 200"
  else
    echo "FAIL: expected 200, got $CODE"
    exit 1
  fi
else
  echo "SKIP: set ISSUED_INTERNAL_JWT to a token from your backend to run this check"
fi
echo ""
echo "Done."
