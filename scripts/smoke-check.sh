#!/usr/bin/env bash
# Quick smoke check: backend health, auth/csrf, DB has test data. Backend must be running (bootRun).
# Usage: ./scripts/smoke-check.sh
set -e
cd "$(dirname "$0")/.."
# Prefer 127.0.0.1 so curl uses IPv4 (Docker on Mac often only exposes ports on IPv4)
BASE="${BASE_URL:-http://127.0.0.1:8080}"
FAILED=0

check() {
  local name="$1"
  local cmd="$2"
  local expect="${3:-0}"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  OK   $name"
    return 0
  else
    echo "  FAIL $name"
    FAILED=1
    return 1
  fi
}

echo "Smoke check (BASE_URL=$BASE)"
echo "---"

# Wait for backend to be up (e.g. after docker compose up --build). Use timeouts so curl doesn't hang.
# -4: force IPv4 (Docker Desktop on Mac often exposes ports only on IPv4; otherwise curl may try ::1 and fail)
CURL_OPTS="-4 --connect-timeout 3 --max-time 5 -sf -o /dev/null"
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl $CURL_OPTS "$BASE/actuator/health" 2>/dev/null; then
    break
  fi
  if [[ $i -eq 15 ]]; then
    echo "  FAIL Backend not reachable at $BASE after ~45s"
    echo "           Tip: Start the stack first: docker compose up --build (wait for 'Started RestaurantManagementApplication')."
    echo "           On Mac with Docker Desktop, try: curl -4 -s http://127.0.0.1:8080/actuator/health"
    FAILED=1
  fi
  sleep 2
done

# 1) Actuator health (backend must be running)
if ! check "Actuator health returns 200" "curl -4 --connect-timeout 3 --max-time 5 -sf -o /dev/null -w '%{http_code}' '$BASE/actuator/health' | grep -q 200"; then
  echo "           Tip: If using Docker: ensure backend container is up (docker compose ps). If local: SPRING_PROFILES_ACTIVE=local-docker ./gradlew bootRun"
fi

# 2) Auth CSRF (200 or 204 = success)
CODE=$(curl -4 --connect-timeout 3 --max-time 5 -s -o /dev/null -w '%{http_code}' "$BASE/api/auth/csrf" 2>/dev/null || echo "000")
if [[ "$CODE" == "200" || "$CODE" == "204" ]]; then
  echo "  OK   GET /api/auth/csrf returns $CODE"
else
  echo "  FAIL GET /api/auth/csrf (got HTTP $CODE)"
  [[ "$CODE" == "000" ]] && echo "           Tip: HTTP 000 usually means the backend is not running on $BASE"
  FAILED=1
fi

# 3) DB: at least one restaurant (uses PGPORT=5433 = Docker Postgres)
export PGPASSWORD="${PGPASSWORD:-postgres}"
export PGPORT="${PGPORT:-5433}"
PSQL_ERR=$(mktemp)
export PGDATABASE="${PGDATABASE:-restaurant_db_dev}"
COUNT=$(psql -h localhost -p "$PGPORT" -U postgres -d "$PGDATABASE" -t -A -c "SELECT count(*) FROM restaurants;" 2>"$PSQL_ERR" || echo "")
if [[ -n "$COUNT" && "$COUNT" =~ ^[0-9]+$ && "$COUNT" -ge 1 ]]; then
  echo "  OK   DB has data (restaurants=$COUNT)"
  rm -f "$PSQL_ERR"
else
  echo "  FAIL DB: no restaurants or cannot connect (count=${COUNT:-error})"
  if [[ -s "$PSQL_ERR" ]]; then
    echo "           psql: $(head -1 "$PSQL_ERR")"
    if grep -q "does not exist" "$PSQL_ERR" 2>/dev/null; then
      echo "           Tip: Schema on port $PGPORT is missing. To use your REAL DB: ./scripts/migrate-db-to-docker.sh then SPRING_PROFILES_ACTIVE=local-docker ./gradlew bootRun. For Flyway test data: same command on empty restaurant_db_dev."
    fi
  fi
  if [[ ! -s "$PSQL_ERR" ]] || ! grep -q "does not exist" "$PSQL_ERR" 2>/dev/null; then
    echo "           Tip: Start Docker (docker compose up -d postgres). To load your real DB: ./scripts/migrate-db-to-docker.sh"
  fi
  rm -f "$PSQL_ERR"
  FAILED=1
fi

echo "---"
if [[ $FAILED -eq 0 ]]; then
  echo "All checks passed."
  exit 0
else
  echo "Some checks failed."
  exit 1
fi
