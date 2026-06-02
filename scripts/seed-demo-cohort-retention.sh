#!/usr/bin/env bash
# Repeat-client PAID bookings for cohort retention (same phone in W0, W1, W2…).
# Batched to avoid nginx 504 Gateway Timeout on large single requests.
#
# Usage:
#   COUNT=2000 DAYS=180 BATCH=350 ./scripts/seed-demo-cohort-retention.sh
#
set -euo pipefail

BASE="${API_BASE:-http://localhost:8080}"
COUNT="${COUNT:-2000}"
DAYS="${DAYS:-180}"
BATCH="${BATCH:-350}"
EMAIL="${EMAIL:-worker@gmail.com}"
PASS="${PASS:-worker123}"
RESTAURANT_ID="${RESTAURANT_ID:-}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/seed_demo_cohort_retention.txt}"
KNOWN_CODE="${KNOWN_CODE:-123456}"
KNOWN_CODE_HASH="${KNOWN_CODE_HASH:-\$2b\$12\$qrvzpD9qeEfUubFIjXo74.06DgsTIpX235a078m9hgW060HXqFUYW}"
DB="${PGDATABASE:-restaurant_db_dev}"
DBU="${PGUSER:-postgres}"
DBH="${PGHOST:-localhost}"
DBP="${PGPORT:-5432}"
CURL_MAX_TIME="${CURL_MAX_TIME:-300}"

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
  local offset=$2
  local qs="targetBookings=${n}&daysBack=${DAYS}&startClientSeq=${offset}"
  if [ -n "$RESTAURANT_ID" ]; then
    qs="${qs}&restaurantId=${RESTAURANT_ID}"
  fi
  local xsrf
  xsrf=$(xsrf_token) || true
  if [ -n "${xsrf:-}" ]; then
    curl -s --max-time "$CURL_MAX_TIME" -w "\n%{http_code}" -X POST \
      -H "X-XSRF-TOKEN: $xsrf" \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      "${BASE}/api/demo/seed-cohort-retention?${qs}"
  else
    curl -s --max-time "$CURL_MAX_TIME" -w "\n%{http_code}" -X POST \
      -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
      "${BASE}/api/demo/seed-cohort-retention?${qs}"
  fi
}

echo "Cohort retention seed: total=$COUNT batch=$BATCH days=$DAYS base=$BASE"
login

created=0
client_offset=0
while [ "$created" -lt "$COUNT" ]; do
  left=$((COUNT - created))
  n=$BATCH
  if [ "$n" -gt "$left" ]; then
    n=$left
  fi
  echo "Seeding cohort batch target=$n (${created}/${COUNT}) startClientSeq=$client_offset..."
  resp=$(seed_batch "$n" "$client_offset")
  rc=$(code "$resp")
  rb=$(body "$resp")
  if [ "$rc" != "200" ]; then
    echo "Seed failed HTTP $rc: $rb" >&2
    if [ "$rc" = "502" ] || [ "$rc" = "504" ]; then
      echo "Hint: redeploy latest JAR (batched cohort endpoint) or lower BATCH (e.g. 200)." >&2
    fi
    exit 1
  fi
  echo "$rb" | python3 -m json.tool 2>/dev/null || echo "$rb"
  batch_created=$(echo "$rb" | python3 -c "import sys,json; print(json.load(sys.stdin).get('bookingsCreated',0))" 2>/dev/null || echo "0")
  next_seq=$(echo "$rb" | python3 -c "import sys,json; print(json.load(sys.stdin).get('nextClientSeq',0))" 2>/dev/null || echo "0")
  if [ "${batch_created:-0}" -eq 0 ]; then
    echo "No bookings created in batch — stopping." >&2
    exit 1
  fi
  created=$((created + batch_created))
  client_offset="${next_seq:-$client_offset}"
done

echo "Done. Cohort retention bookings created (approx): $created"
