#!/usr/bin/env bash
# Generate demo tariff activities + bookings via POST /api/demo/seed-tariff-bookings
# Requires: backend running, DEMO_BOOKING_SEED_ENABLED=true, ADMIN (or HEAD_ADMIN + ?restaurantId=)
#
# Usage:
#   DEMO_BOOKING_SEED_ENABLED=true ./scripts/seed-demo-tariff-bookings.sh
#   COUNT=5000 DAYS=180 EMAIL=worker@gmail.com PASS=worker123 RESTAURANT_ID=2 ./scripts/seed-demo-tariff-bookings.sh
#   RESET=true ./scripts/seed-demo-tariff-bookings.sh
#
set -euo pipefail

BASE="${API_BASE:-http://localhost:8080}"
COUNT="${COUNT:-5000}"
DAYS="${DAYS:-180}"
BATCH="${BATCH:-300}"
EMAIL="${EMAIL:-worker@gmail.com}"
PASS="${PASS:-worker123}"
RESTAURANT_ID="${RESTAURANT_ID:-}"
RESET="${RESET:-false}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/seed_demo_tariff_bookings.txt}"
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

  if ! psql -h "$DBH" -p "$DBP" -U "$DBU" -d "$DB" -q -c "SELECT 1;" >/dev/null 2>&1; then
    echo "psql failed: check SSH tunnel (5433), PGHOST/PGPORT/PGUSER/PGPASSWORD" >&2
    exit 1
  fi

  psql -h "$DBH" -p "$DBP" -U "$DBU" -d "$DB" -q -c \
    "UPDATE verification_codes SET used=true WHERE email='$EMAIL' AND used=false;" 2>/dev/null || true

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

  local upd
  upd=$(psql -h "$DBH" -p "$DBP" -U "$DBU" -d "$DB" -t -A -c \
    "UPDATE verification_codes SET code_hash='$KNOWN_CODE_HASH', attempts_left=5, used=false WHERE challenge_id='$cid' RETURNING id;" 2>&1) || true
  if [ -z "$(echo "$upd" | tr -d '[:space:]')" ] || echo "$upd" | grep -qi 'error'; then
    echo "psql could not set test code for challenge_id=$cid" >&2
    echo "Check SSH tunnel and PGPASSWORD. DB said: $upd" >&2
    echo "Alternative: open https://mailnesia.com/ for $EMAIL and use the real 6-digit code." >&2
    exit 1
  fi

  r=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" \
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
  local do_reset="${2:-false}"
  local qs="count=${n}&daysBack=${DAYS}&reset=${do_reset}"
  if [ -n "$RESTAURANT_ID" ]; then
    qs="${qs}&restaurantId=${RESTAURANT_ID}"
  fi
  local xsrf
  xsrf=$(xsrf_token) || true
  if [ -n "${xsrf:-}" ]; then
    curl -s -w "\n%{http_code}" -X POST \
      -H "X-XSRF-TOKEN: $xsrf" \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      "${BASE}/api/demo/seed-tariff-bookings?${qs}"
  else
    curl -s -w "\n%{http_code}" -X POST \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      "${BASE}/api/demo/seed-tariff-bookings?${qs}"
  fi
}

echo "Demo tariff booking seed: total=$COUNT batch=$BATCH days=$DAYS reset=$RESET base=$BASE"
login

created=0
reset_sent=false
while [ "$created" -lt "$COUNT" ]; do
  left=$((COUNT - created))
  n=$BATCH
  if [ "$n" -gt "$left" ]; then
    n=$left
  fi
  do_reset="false"
  if [ "$RESET" = "true" ] && [ "$reset_sent" = "false" ]; then
    do_reset="true"
    reset_sent=true
  fi
  echo "Seeding batch of $n (${created}/${COUNT}) reset=${do_reset}..."
  resp=$(seed_batch "$n" "$do_reset")
  rc=$(code "$resp")
  rb=$(body "$resp")
  if [ "$rc" != "200" ]; then
    echo "Seed failed HTTP $rc: $rb" >&2
    if [ "$rc" = "400" ]; then
      echo "Hint: DEMO_BOOKING_SEED_ENABLED=true in env and restart backend." >&2
    fi
    exit 1
  fi
  echo "$rb" | python3 -m json.tool 2>/dev/null || echo "$rb"
  batch_created=$(echo "$rb" | python3 -c "import sys,json; print(json.load(sys.stdin).get('bookingsCreated',0))" 2>/dev/null || echo "0")
  if [ "${batch_created:-0}" -eq 0 ]; then
    echo "No bookings created in batch — stopping." >&2
    exit 1
  fi
  created=$((created + batch_created))
done

echo "Done. Reported bookings created (approx): $created"
