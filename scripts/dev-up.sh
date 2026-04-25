#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "Starting Postgres and Redis..."
docker compose up -d postgres redis

echo "Waiting for Postgres and Redis to be ready..."
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  pg_ok=0
  redis_ok=0
  docker compose exec -T postgres pg_isready -U postgres -d restaurant_db_dev >/dev/null 2>&1 && pg_ok=1
  docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG && redis_ok=1
  if [[ $pg_ok -eq 1 && $redis_ok -eq 1 ]]; then
    echo "Postgres and Redis are ready."
    break
  fi
  if [[ $i -eq 12 ]]; then
    echo "Timeout. Check: docker compose ps"
    exit 1
  fi
  sleep 2
done

docker compose ps postgres redis
echo ""
echo "Next: run backend with"
echo "  SPRING_PROFILES_ACTIVE=local-docker ./gradlew bootRun"
echo "Then run SQL verify: ./scripts/verify-stage1.sh"
