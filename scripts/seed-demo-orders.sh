#!/usr/bin/env bash
# Generate realistic demo orders via POST /api/demo/seed-orders
# Requires: backend running, DEMO_ORDER_SEED_ENABLED=true, restaurant admin (or HEAD_ADMIN + restaurantId)
#
# Usage:
#   DEMO_ORDER_SEED_ENABLED=true ./scripts/seed-demo-orders.sh
#   COUNT=5000 DAYS=180 EMAIL=worker@gmail.com PASS=worker123 ./scripts/seed-demo-orders.sh
#
set -euo pipefail

BASE="${API_BASE:-http://localhost:8080}"
COUNT="${COUNT:-5000}"
DAYS="${DAYS:-180}"
BATCH="${BATCH:-250}"
EMAIL="${EMAIL:-worker@gmail.com}"
PASS="${PASS:-worker123}"
RESTAURANT_ID="${RESTAURANT_ID:-}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/seed_demo_orders.txt}"
KNOWN_CODE="${KNOWN_CODE:-123456}"
KNOWN_CODE_HASH="${KNOWN_CODE_HASH:-\$2b\$12\$qrvzpD9qeEfUubFIjXo74.06DgsTIpX235a078m9hgW060HXqFUYW}"
DB="${PGDATABASE:-restaurant_db_dev}"
DBU="${PGUSER:-postgres}"
DBH="${PGHOST:-localhost}"
DBP="${PGPORT:-5432}"

code() { echo "$1" | tail -1; }
body() { echo "$1" | sed '$d'; }

warmup_csrf() {
  curl -s -o /dev/null "${BASE}/api/auth/csrf" -b "$COOKIE_JAR" -c "$COOKIE_JAR" 2>/dev/null || true
  curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" -d '{}' "${BASE}/api/platform/restaurants" 2>/dev/null || true
}

refresh_csrf_cookie() {
  curl -s -o /dev/null "${BASE}/api/auth/csrf" -b "$COOKIE_JAR" -c "$COOKIE_JAR" 2>/dev/null || true
}

xsrf_token() {
  refresh_csrf_cookie
  local raw
  raw=$(grep XSRF-TOKEN "$COOKIE_JAR" 2>/dev/null | awk '{print $NF}' | tail -1)
  if [ -z "$raw" ]; then
    return 1
  fi
  python3 -c "import urllib.parse,sys; print(urllib.parse.unquote(sys.argv[1]))" "$raw"
}

xsrf_header() {
  local xsrf
  xsrf=$(xsrf_token) || return 0
  if [ -n "$xsrf" ]; then
    echo "-H" "X-XSRF-TOKEN: $xsrf"
  fi
}

login() {
  rm -f "$COOKIE_JAR"
  warmup_csrf

  psql -h "$DBH" -p "$DBP" -U "$DBU" -d "$DB" -q -c \
    "DELETE FROM verification_codes WHERE email='$EMAIL';" 2>/dev/null || true

  local r rc rb cid
  r=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
    "${BASE}/api/auth/login/request-code")
  rc=$(code "$r")
  rb=$(body "$r")
  if [ "$rc" != "200" ]; then
    echo "Login request-code failed: HTTP $rc — $rb" >&2
    exit 1
  fi
  cid=$(echo "$rb" | python3 -c "import sys,json; print(json.load(sys.stdin).get('challengeId',''))" 2>/dev/null || true)
  if [ -z "$cid" ]; then
    echo "No challengeId in login response" >&2
    exit 1
  fi

  psql -h "$DBH" -p "$DBP" -U "$DBU" -d "$DB" -q -c \
    "UPDATE verification_codes SET code_hash='$KNOWN_CODE_HASH', attempts_left=5 WHERE challenge_id='$cid';" 2>/dev/null || true

  r=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" \
    $(xsrf_header) \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -d "{\"challengeId\":\"$cid\",\"code\":\"$KNOWN_CODE\"}" \
    "${BASE}/api/auth/login/verify")
  rc=$(code "$r")
  rb=$(body "$r")
  if [ "$rc" != "200" ]; then
    echo "Login verify failed: HTTP $rc — $rb" >&2
    exit 1
  fi
  refresh_csrf_cookie
  echo "Logged in as $EMAIL"
}

seed_batch() {
  local n=$1
  local qs="count=${n}&daysBack=${DAYS}"
  if [ -n "$RESTAURANT_ID" ]; then
    qs="${qs}&restaurantId=${RESTAURANT_ID}"
  fi
  local xsrf
  xsrf=$(xsrf_token) || true
  if [ -n "${xsrf:-}" ]; then
    curl -s -w "\n%{http_code}" -X POST \
      -H "X-XSRF-TOKEN: $xsrf" \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      "${BASE}/api/demo/seed-orders?${qs}"
  else
    curl -s -w "\n%{http_code}" -X POST \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      "${BASE}/api/demo/seed-orders?${qs}"
  fi
}

echo "Demo order seed: total=$COUNT batch=$BATCH days=$DAYS base=$BASE"
login

created=0
while [ "$created" -lt "$COUNT" ]; do
  left=$((COUNT - created))
  n=$BATCH
  if [ "$n" -gt "$left" ]; then
    n=$left
  fi
  echo "Seeding batch of $n (${created}/${COUNT})..."
  resp=$(seed_batch "$n")
  rc=$(code "$resp")
  rb=$(body "$resp")
  if [ "$rc" != "200" ]; then
    echo "Seed failed HTTP $rc: $rb" >&2
    if [ "$rc" = "403" ]; then
      echo "Hint: CSRF (re-login), role ADMIN/HEAD_ADMIN, or DEMO_ORDER_SEED_ENABLED=true on server." >&2
    fi
    if [ "$rc" = "400" ]; then
      echo "Hint: enable DEMO_ORDER_SEED_ENABLED=true in /etc/bklam.env and restart bklam." >&2
    fi
    exit 1
  fi
  echo "$rb" | python3 -m json.tool 2>/dev/null || echo "$rb"
  batch_created=$(echo "$rb" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ordersCreated',0))" 2>/dev/null || echo "0")
  if [ "${batch_created:-0}" -eq 0 ]; then
    echo "No orders created in batch — stopping." >&2
    exit 1
  fi
  created=$((created + batch_created))
done

echo "Done. Reported total created (approx): $created"
