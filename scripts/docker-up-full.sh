#!/usr/bin/env bash
# Запуск всего стека в Docker: postgres, redis, backend, frontend (и при наличии — forecast).
# После запуска: http://localhost:3000 — фронт, http://localhost:8080 — API, http://localhost:8080/swagger-ui.html
#
# Если в логах postgres "relation ... does not exist" — БД в контейнере пустая или битая.
# Ваша реальная БД:  docker compose down && PGUSER_SOURCE=$(whoami) ./scripts/migrate-db-to-docker.sh && ./scripts/docker-up-full.sh
# Чистая БД (тест):   docker compose down && ./scripts/dev-reset.sh && ./scripts/docker-up-full.sh
set -e
cd "$(dirname "$0")/.."
docker compose up --build "$@"
