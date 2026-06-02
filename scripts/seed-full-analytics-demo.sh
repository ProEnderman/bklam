#!/usr/bin/env bash
# Booking analytics + optional menu orders (ML revenue) in one call.
#
# Usage:
#   DEMO_BOOKING_SEED_ENABLED=true DEMO_ORDER_SEED_ENABLED=true ./scripts/seed-full-analytics-demo.sh
#   BOOKING_COUNT=5000 ORDER_COUNT=5000 DAYS=180 RESTAURANT_ID=2 EMAIL=... PASS=... ./scripts/seed-full-analytics-demo.sh
#
set -euo pipefail

BASE="${API_BASE:-http://localhost:8080}"
BOOKING_COUNT="${BOOKING_COUNT:-5000}"
ORDER_COUNT="${ORDER_COUNT:-5000}"
DAYS="${DAYS:-180}"
RESET="${RESET:-false}"
SEED_MENU_ORDERS="${SEED_MENU_ORDERS:-true}"
RESTAURANT_ID="${RESTAURANT_ID:-}"
EMAIL="${EMAIL:-worker@gmail.com}"
PASS="${PASS:-worker123}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/seed_full_analytics_demo.txt}"
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
  [ "$rc" = "200" ] || { echo "Login request-code failed: $rb" >&2; exit 1; }
  cid=$(echo "$rb" | python3 -c "import sys,json; print(json.load(sys.stdin).get('challengeId',''))")
  psql -h "$DBH" -p "$DBP" -U "$DBU" -d "$DB" -q -c \
    "UPDATE verification_codes SET code_hash='$KNOWN_CODE_HASH', attempts_left=5 WHERE challenge_id='$cid';" 2>/dev/null || true
  r=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -d "{\"challengeId\":\"$cid\",\"code\":\"$KNOWN_CODE\"}" \
    "${BASE}/api/auth/login/verify")
  rc=$(code "$r")
  rb=$(body "$r")
  [ "$rc" = "200" ] || { echo "Login verify failed: $rb" >&2; exit 1; }
  refresh_csrf_cookie
}

qs="bookingCount=${BOOKING_COUNT}&orderCount=${ORDER_COUNT}&daysBack=${DAYS}&reset=${RESET}&seedMenuOrders=${SEED_MENU_ORDERS}"
if [ -n "$RESTAURANT_ID" ]; then
  qs="${qs}&restaurantId=${RESTAURANT_ID}"
fi

echo "Full analytics demo: bookings=$BOOKING_COUNT orders=$ORDER_COUNT days=$DAYS menuOrders=$SEED_MENU_ORDERS"
login

xsrf=$(xsrf_token) || true
if [ -n "${xsrf:-}" ]; then
  resp=$(curl -s -w "\n%{http_code}" -X POST \
    -H "X-XSRF-TOKEN: $xsrf" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    "${BASE}/api/demo/seed-full-analytics-demo?${qs}")
else
  resp=$(curl -s -w "\n%{http_code}" -X POST \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    "${BASE}/api/demo/seed-full-analytics-demo?${qs}")
fi

rc=$(code "$resp")
rb=$(body "$resp")
if [ "$rc" != "200" ]; then
  echo "Failed HTTP $rc: $rb" >&2
  exit 1
fi
echo "$rb" | python3 -m json.tool 2>/dev/null || echo "$rb"
