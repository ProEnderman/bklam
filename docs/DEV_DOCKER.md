# Docker dev workflow (Postgres + Redis, опционально весь стек)

Локальная разработка с инфраструктурой в Docker: Postgres 16 и Redis 7 на localhost. **Postgres в Docker слушает порт 5433** (не 5432), чтобы не конфликтовать с локально установленным PostgreSQL.

## Требования

- **Docker** и **Docker Compose** (v2)
- Для SQL-проверки и скриптов: **psql** (клиент PostgreSQL). Если psql не установлен — см. Troubleshooting.
- Для запуска только инфраструктуры и backend/frontend на хосте: Java 17, Gradle, Node.js.

## Вариант 1: Весь проект в Docker (одной командой)

Запуск postgres, redis, backend, frontend, forecast и **telegram-payment-service**:

```bash
./scripts/docker-up-full.sh
```

Или: `docker compose up --build`. После старта:

- **Фронт:** http://localhost:3000  
- **API:** http://localhost:8080  
- **Swagger:** http://localhost:8080/swagger-ui.html  
- **Telegram Payment Service:** http://localhost:3001 (вызывается с бэкенда по внутреннему URL)  

Если нужна **ваша реальная БД** в контейнере, сначала выполните перенос, затем поднимайте стек:

```bash
./scripts/migrate-db-to-docker.sh
./scripts/docker-up-full.sh
```

## Вариант 2: Только инфраструктура в Docker

1. **Поднять Postgres и Redis**
   ```bash
   ./scripts/dev-up.sh
   ```
   Или вручную: `docker compose up -d postgres redis`. Скрипт ждёт готовности сервисов.

2. **Запустить backend** (применит Flyway; БД в контейнере — **`restaurant_db_dev`**)
   ```bash
   SPRING_PROFILES_ACTIVE=local-docker ./gradlew bootRun
   ```
   При необходимости задайте `DEV_DB_URL=jdbc:postgresql://localhost:5433/restaurant_db_dev` (см. `.env.example`).
   В логах должно быть сообщение об успешном применении миграций Flyway.

3. **Проверить схему (Stage 1)**
   ```bash
   ./scripts/verify-stage1.sh
   ```
   Результат сохраняется в `scripts/verify_stage1_outputs/schema_checks.sql.out`.

4. **Убедиться, что всё работает** (backend должен быть запущен)
   ```bash
   ./scripts/smoke-check.sh
   ```
   Скрипт проверит: health endpoint, CSRF, наличие тестовых данных в БД. Все проверки должны пройти (exit 0).

5. **Прогнать docker-dependent IT** (Testcontainers поднимет свой Postgres; нужен запущенный Docker)
   ```bash
   ./scripts/it.sh
   ```
   Или: `./gradlew dockerIT`

## Как ещё проверить вручную

- **Вывод verify-stage1** — полный отчёт в `scripts/verify_stage1_outputs/schema_checks.sql.out`: список таблиц, наличие ресторана/локации, число пользователей.
- **Health:** `curl -s http://localhost:8080/actuator/health` — должен вернуть `{"status":"UP",...}`.
- **БД напрямую:** `echo "SELECT id, name FROM restaurants;" | ./scripts/db-psql.sh` — должен показать тестовый ресторан (из миграции V13).
- **Вход в приложение:** откройте фронтенд или HEAD_ADMIN (`TEST_ACCOUNTS.md`). Ресторанный `ADMIN` из V13 по умолчанию неактивен (V93) — создайте админа через платформу или активируйте `admin@gmail.com` в БД для логина `admin123` (при включённой почте — запрос кода, затем верификация).

## Остановка

```bash
./scripts/dev-down.sh
```
Или: `docker compose down`

## Использование своей реальной БД в Docker (не тестовые данные)

**Если вам нужны ваши настоящие данные**, а не тестовые из Flyway (V13), не делайте только `dev-reset` + `bootRun`. Сначала перенесите свою БД в Docker.

### Поэтапная инструкция (реальная БД + весь стек в Docker)

1. **Убедиться, что на локальном Postgres (порт 5432) есть схема.**  
   Если backend к 5432 ещё ни разу не подключался, таблиц не будет — дамп получится пустой.  
   Проверка:
   ```bash
   psql -h localhost -p 5432 -U postgres -d restaurant_db -c "SELECT count(*) FROM restaurants;"
   (на источнике может быть и `restaurant_db_dev` — подставьте имя своей БД.)
   ```
   На macOS часто пользователь = ваш логин: замените `-U postgres` на `-U $(whoami)`.  
   Если ошибка «relation "restaurants" does not exist» — один раз запустите backend против 5432 (без Docker), чтобы Flyway создал таблицы, затем переходите к шагу 2.

2. **Перенести БД в Docker.**  
   В корне проекта:
   ```bash
   PGUSER_SOURCE=$(whoami) ./scripts/migrate-db-to-docker.sh
   ```
   (На Linux, если БД под пользователем `postgres`, можно просто `./scripts/migrate-db-to-docker.sh`.)  
   Скрипт: создаст дамп с 5432 → спросит про сброс Docker → выполнит `dev-reset` (postgres + redis) → восстановит дамп в контейнер (порт 5433) → проверит наличие таблицы `restaurants`. При ошибке на шаге 5/5 — см. подсказки в выводе.

3. **Запустить весь стек.**  
   Не вызывайте `docker compose down -v` между шагами 2 и 3. Затем:
   ```bash
   ./scripts/docker-up-full.sh
   ```
   Или: `docker compose up --build`.  
   Фронт: http://localhost:3000, API: http://localhost:8080.

4. **Проверить работу.**  
   После старта backend:
   ```bash
   ./scripts/smoke-check.sh
   ```
   Все проверки должны пройти (exit 0).

**Переменные (при необходимости):** `PGPORT_SOURCE=5432`, `PGPORT_TARGET=5433`, `PGUSER_SOURCE=postgres`, `PGPASSWORD=postgres`. Дампы сохраняются в `scripts/backups/`.

## Сброс окружения (удаление данных)

**Внимание:** удаляет все данные Postgres и Redis в volume.

```bash
./scripts/dev-reset.sh
```
Скрипт запросит подтверждение, затем выполнит `docker compose down -v` и снова `up -d postgres redis`. После этого нужно заново запустить backend для применения Flyway.

## Полезные скрипты

| Скрипт | Назначение |
|--------|------------|
| `scripts/dev-up.sh` | Поднять postgres + redis, дождаться готовности |
| `scripts/dev-down.sh` | Остановить контейнеры |
| `scripts/dev-reset.sh` | Удалить volumes и поднять заново |
| `scripts/db-psql.sh [file.sql]` | Подключиться к БД (файл или интерактивно). По умолчанию пароль `postgres` (см. ниже) |
| `scripts/verify-stage1.sh` | Выполнить проверку схемы Stage 1, сохранить вывод |
| `scripts/it.sh` | Запустить RlsIsolationIT и NetworkHierarchyMigrationIT |

**Порты:** Postgres в Docker — **5433** (профиль `local-docker` и скрипты `db-psql.sh` / `verify-stage1.sh` используют его по умолчанию). Redis — 6379.

**Пароль БД:** скрипты `db-psql.sh` и `verify-stage1.sh` по умолчанию используют `PGPASSWORD=postgres` и `PGPORT=5433`. Переопределить: `export PGPASSWORD=yourpass` или `export PGPORT=5434` перед вызовом.

## Telegram: вебхуки и магазин

**Вебхуки** — это способ доставки обновлений от серверов Telegram к вашему приложению: когда пользователь пишет боту, нажимает кнопку в меню или в Telegram-магазине, Telegram отправляет на ваш сервер HTTP POST (на указанный URL вебхука). **Telegram-магазин** (меню, заказы через бота) как раз и работает через этот вебхук: все действия пользователя в боте приходят на один endpoint (например `/api/telegram/webhook`).

Чтобы бот реально получал события, ваш backend должен быть доступен по **публичному HTTPS-URL** (обычно — деплой на VPS/облако с доменом и TLS). При запуске только на localhost в Docker Telegram до вас не подключится; для отладки webhook можно временно выставить публичный URL любым удобным вам способом (см. документацию хостинга), в проде — только свой домен.

**telegram-payment-service** (оплата, MTProto, привязка аккаунта) поднимается вместе со стеком (`docker compose up --build`) и доступен для бэкенда по внутреннему URL. Опциональные переменные (токены Telegram, Bank Bot и т.д.) можно задать в `.env` или в `environment` в `docker-compose.yml`.

## Troubleshooting

### Flyway пишет "Current version 74", миграции не применяются

Так бывает, если приложение подключается к **другой** БД (например, локальный PostgreSQL на 5432). Убедитесь, что профиль `local-docker` и скрипты используют порт **5433** (Docker Postgres). После `./scripts/dev-reset.sh` сразу запустите backend — тогда приложение подключится к пустой БД в контейнере и Flyway выполнит все миграции с V1 по V74.

### Порты 5433 или 6379 заняты

Изменить порты в `docker-compose.yml` и в `application-local-docker.yml` (и при необходимости `PGPORT` для скриптов):

```yaml
services:
  postgres:
    ports:
      - "15433:5432"   # хост:контейнер
  redis:
    ports:
      - "16379:6379"
```

Затем в профиле `local-docker` или в переменных окружения задать:
- `DEV_DB_URL=jdbc:postgresql://localhost:15433/restaurant_db_dev`
- `spring.data.redis.port=16379` (или `REDIS_PORT=16379`)

И для psql: `PGPORT=15433 PGDATABASE=restaurant_db_dev psql -h localhost -p 15433 -U postgres`

### psql не установлен

Выполнить SQL через контейнер Postgres:

```bash
docker compose exec postgres psql -U postgres -d restaurant_db_dev -f - < scripts/verify_stage1_schema.sql
```

Или интерактивно:

```bash
docker compose exec -it postgres psql -U postgres -d restaurant_db_dev
```

### telegram-payment: database "telegram_payments" does not exist

Скрипт в `docker/postgres-init/` создаёт БД только при **первом** запуске Postgres (пустой volume). Если контейнер Postgres уже был с данными, создайте БД вручную:

```bash
docker compose exec postgres psql -U postgres -c 'CREATE DATABASE telegram_payments;'
```

Затем перезапустите сервис: `docker compose up -d telegram-payment`.

### Контейнеры не становятся healthy

Проверить логи: `docker compose logs postgres redis`. Убедиться, что порты не заняты и Docker имеет достаточно ресурсов.

### Backend не подключается к БД

- Убедиться, что профиль активен: `SPRING_PROFILES_ACTIVE=local-docker`
- Проверить, что контейнеры запущены: `docker compose ps`
- Проверить подключение: `./scripts/db-psql.sh` (интерактивно) или `docker compose exec postgres psql -U postgres -d restaurant_db_dev -c "SELECT 1"`

### Flyway: "relation \"orders\" does not exist" при миграции V74

Такое бывает, если в БД была применена только часть миграций (например, baseline на V73 без полной истории). Таблица `orders` создаётся в V5, поэтому при «текущей версии 73» без таблиц V1–V72 состояние БД противоречивое.

**Решение:** сбросить данные и применить все миграции с нуля:

```bash
./scripts/dev-reset.sh
# после подтверждения и поднятия контейнеров:
SPRING_PROFILES_ACTIVE=local-docker ./gradlew bootRun
```

Flyway выполнит V1…V74 по порядку на пустой БД, после чего ошибка исчезнет.
