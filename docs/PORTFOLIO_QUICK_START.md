# Portfolio quick start (шпаргалка)

Сокращённый путь к **работающему API** без полного `docker compose up --build` (без обязательного фронта/forecast-контейнеров в первом заходе).

## Шаги

1. **Java 17**, **Docker** (для PostgreSQL/Redis).
2. `cp .env.example .env` — задать `JWT_SECRET`, `QR_SIGNING_SECRET`, `FORECAST_INTERNAL_JWT_SECRET_B64` (см. комментарии в `.env.example`).
3. `docker compose up -d postgres redis`
4. В `.env`: `DEV_DB_URL=jdbc:postgresql://localhost:5433/restaurant_db_dev`, `POSTGRES_DB=restaurant_db_dev` (согласовано с compose).
5. При необходимости: `./gradlew ensureDevDatabase`
6. `make run` или `./scripts/run.sh` или `./gradlew devBootRun`
7. `curl -fsS http://localhost:8080/actuator/health`

## Сиды

После Flyway: ресторан *Test Restaurant*, пользователи из `V13` (в т.ч. `admin@gmail.com` / `admin123`), демо-меню из `V90` (категория `Demo`, блюда `Demo Burger`, `Demo Soup`).

## Скрипты

| Команда | Назначение |
|--------|------------|
| `make test` | `./gradlew test` |
| `make run` | `./gradlew devBootRun` |
| `make migrate` | Поднять postgres/redis, напомнить старт приложения (Flyway встроен в Spring) |
| `make openapi` | `curl` → `openapi-export.json` (нужен запущенный API на :8080) |

Подробности: [README.md](../README.md) раздел **Quick start (portfolio / clean machine)**.
