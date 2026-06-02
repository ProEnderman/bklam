# Restaurant Management System

**Restaurant Management System (RMS)** — backend for multi-tenant restaurant operations: orders, stock, menu, platform admin APIs, and integrations. **Spring Boot 3** monolith, **PostgreSQL**, **Flyway**, **JPA**; outbox for durable side effects and **RLS** for tenant isolation.

Система управления рестораном на Java + Spring Boot + PostgreSQL (основной язык README — русский; разделы ниже с терминами на English для ссылок на доку).

> **Архитектура:** [docs/ARCHITECTURE_PORTFOLIO.md](docs/ARCHITECTURE_PORTFOLIO.md) — *English* one-pager: components, trust boundaries, failure modes, **outbox → loyalty** flow, Mermaid diagram.  
> Детальная внутренняя дока: [docs/TECHNICAL_DOCUMENTATION.md](docs/TECHNICAL_DOCUMENTATION.md).

### Flagship slice: loyalty accrual via outbox

Закрытие заказа публикует работу в **`outbox_events`**; диспетчер обрабатывает **at-least-once** на уровне события, а **loyalty** остаётся **идемпотентным** на ключе `(restaurant_id, order_id)` (guard-таблица + short-circuit до `CampaignEngine`). Подробно: [docs/OUTBOX_LOYALTY_SEMANTICS.md](docs/OUTBOX_LOYALTY_SEMANTICS.md) · интеграционные тесты: `com.restaurant.outbox.OutboxExactlyOnceIT` · быстрый прогон: `./scripts/demo-outbox-loyalty.sh`.

- **~2 min demo recording (shot list):** [docs/PORTFOLIO_DEMO_RECORDING.md](docs/PORTFOLIO_DEMO_RECORDING.md)  
- **Релиз и git tag:** [docs/PORTFOLIO_GIT_TAG.md](docs/PORTFOLIO_GIT_TAG.md)

**Документация (API, perf, security, tests):** [docs/PORTFOLIO_API.md](docs/PORTFOLIO_API.md) · [docs/PERFORMANCE_NOTES.md](docs/PERFORMANCE_NOTES.md) · [docs/SECURITY_NOTES.md](docs/SECURITY_NOTES.md) · [docs/TESTING_PYRAMID.md](docs/TESTING_PYRAMID.md).

### Observability (demo)

- **Корреляция:** заголовок `X-Request-Id`, MDC `reqId` в логах, optional `requestId` в JSON-ошибках (см. [docs/PORTFOLIO_API.md](docs/PORTFOLIO_API.md)).  
- **Метрики:** Micrometer, `GET /actuator/metrics` (пример: `http.server.requests`) — шаг 8 в Quick start ниже.  
- **OpenAPI / Swagger** (только dev / не `prod`): Swagger UI, группа **portfolio** — см. [docs/PORTFOLIO_API.md](docs/PORTFOLIO_API.md).

### Ограничения (честно)

- **Не весь API** сведён в единый `/api/v1` — см. [docs/PORTFOLIO_API.md](docs/PORTFOLIO_API.md).  
- **Монолит:** один JAR, много bounded contexts в одном процессе; микросервисы не демонстрируются как отдельные деплои.  
- **Rate limiting** — in-process (см. [docs/SECURITY_NOTES.md](docs/SECURITY_NOTES.md)), не кластерный shared limiter.  
- **Полный продукт** (все UI, Telegram, forecast, payment sidecars) опционален; «быстрый старт» ниже = **API + PostgreSQL** на хосте.

## Quick start (clean machine)

Один путь: **только инфра в Docker, backend на хосте** (без `docker compose` для самого JAR — меньше секретов и проще дебаг).

1. **JDK 17** и **Docker** (для PostgreSQL). Склонируй репо, в корне:
2. `cp .env.example .env` — заполни обязательные секреты: `JWT_SECRET` (≥32 символа), `QR_SIGNING_SECRET`, `FORECAST_INTERNAL_JWT_SECRET_B64` (см. комментарии в `.env.example`).
3. Подними БД: `docker compose up -d postgres redis`  
   - Порт Postgres **5433** → в `.env` укажи: `DEV_DB_URL=jdbc:postgresql://localhost:5433/restaurant_db_dev` (и `POSTGRES_DB=restaurant_db_dev` для compose).
4. Создай БД при необходимости: `./gradlew ensureDevDatabase` (или `createdb` вручную).
5. Запуск API: `make run` **или** `./scripts/run.sh` **или** `./gradlew devBootRun`  
   - При первом старте **Flyway** накатит схему и сиды; тестовый ресторан, админ и **демо-меню** (категория `Demo`, блюда `Demo Burger`, `Demo Soup`) — миграция `V90`.
6. Проверка: `curl -fsS http://localhost:8080/actuator/health` → `{"status":"UP",...}`  
7. Swagger (not enabled with `prod` profile): http://localhost:8080/swagger-ui.html — группа **portfolio** (подмножество API; см. [docs/PORTFOLIO_API.md](docs/PORTFOLIO_API.md)).  
8. **Metrics (demo):** `curl -sS 'http://localhost:8080/actuator/metrics/http.server.requests' | head` — Micrometer `http.server.requests` (or filter by `tag:uri` in a full JSON viewer). Tag `application` is set to `spring.application.name`.

**Демо-логины**: HEAD_ADMIN — см. `V15` / `TEST_ACCOUNTS.md`. Админ ресторана из V13 (`admin@gmail.com`) по умолчанию **неактивен** (V93); создайте ADMIN через платформу или активируйте пользователя в БД для `admin123`.

**Postman-коллекция:** [docs/collections/rms-portfolio.postman_collection.json](docs/collections/rms-portfolio.postman_collection.json) — импорт в Postman или аналог.  

**OpenAPI снимок:** `make openapi` → `openapi-export.json` (полный); `make openapi-portfolio` → `docs/openapi-portfolio-snapshot.json` (группа *portfolio*). Политика committed YAML: [docs/OPENAPI.md](docs/OPENAPI.md).  

**Скрипты:** `make test` | `make run` | `make migrate` (поднимает postgres/redis и подсказка запустить приложение) | `make openapi` | `make openapi-portfolio` (нужен запущенный API, не `prod` профиль).

Полный стек (frontend, forecast, telegram-payment) и альтернативные профили: [docs/DEV_DOCKER.md](docs/DEV_DOCKER.md), [docs/PORTFOLIO_QUICK_START.md](docs/PORTFOLIO_QUICK_START.md) (сокращённая шпаргалка).

## Стек

- **Runtime:** Java 17 · Spring Boot 3.2.x · Gradle  
- **Data:** PostgreSQL · Spring Data JPA · Flyway  
- **API docs (dev):** springdoc / OpenAPI; группа `portfolio` (подмножество эндпоинтов)  
- **Security:** Spring Security, JWT, cookie CSRF на отдельных путях (см. [docs/SECURITY_NOTES.md](docs/SECURITY_NOTES.md))  
- **Observability:** Actuator (health, metrics), request correlation in logs  
- **Утилиты:** Lombok, Bean Validation

## Структура проекта

```
src/main/java/com/restaurant/
├── config/          # Конфигурация (CORS, rate limiting)
├── controller/      # REST контроллеры
├── dto/             # Data Transfer Objects
├── exception/       # Обработка ошибок
├── model/           # JPA сущности
├── repository/      # JPA репозитории
└── service/         # Бизнес-логика
```

## Docker dev quickstart (Postgres + Redis)

Стандартная **dev** база: **`restaurant_db_dev`** (и локальный `./gradlew bootRun` с профилем `dev`, и Docker Compose).

Если хотите поднять БД и Redis в Docker и сразу запустить backend:

```bash
./scripts/dev-up.sh
# DEV_DB_URL для Postgres на хосте 5433 см. .env.example
SPRING_PROFILES_ACTIVE=local-docker ./gradlew bootRun
./scripts/verify-stage1.sh   # проверка схемы после миграций
./scripts/it.sh              # или: ./gradlew dockerIT
```

Подробнее: [docs/DEV_DOCKER.md](docs/DEV_DOCKER.md).

---

## Настройка

### Рекомендуемый локальный dev (без Docker Postgres)

1. Создайте БД **`restaurant_db_dev`** (или используйте `./gradlew ensureDevDatabase` / `devBootRun`).
2. Скопируйте `.env.example` → `.env`, задайте секреты и **`DEV_DB_URL`** (см. пример в `.env.example`).
3. Запуск: `./gradlew devBootRun` или `SPRING_PROFILES_ACTIVE=dev ./gradlew bootRun`.

### Legacy / без профиля `dev`

Не основной dev-поток. Используйте только если нужен старый сценарий: **`DB_URL`** → БД **`restaurant_db`** (как в `application.yml` по умолчанию).

1. Создайте базу PostgreSQL:
```sql
CREATE DATABASE restaurant_db;
```

2. Настройте переменные окружения:

**Для macOS (Homebrew):**
```bash
export DB_URL=jdbc:postgresql://localhost:5432/restaurant_db
export DB_USERNAME=$(whoami)  # обычно ваше имя пользователя, не postgres
export DB_PASSWORD=""         # обычно пустой пароль
export PORT=8080
```

**Для Linux/других систем:**
```bash
export DB_URL=jdbc:postgresql://localhost:5432/restaurant_db
export DB_USERNAME=postgres
export DB_PASSWORD=postgres
export PORT=8080
```

Или создайте файл `.env` (не коммитится в git).

**QR-меню (подпись токенов):** для работы страницы «QR-меню» и ссылок на меню по QR в production задайте секрет подписи:
```bash
export QR_SIGNING_SECRET="ваш-секрет-минимум-32-символа"
```
Сгенерировать случайный секрет: `openssl rand -base64 32` или `openssl rand -hex 32`. В dev, если переменная не задана, используется встроенный ключ по умолчанию (только для разработки).

**Примечание:** Если получаете ошибку "role postgres does not exist", см. файл `POSTGRES_SETUP.md` для подробных инструкций.

3. Запустите приложение:
```bash
./gradlew bootRun
```

Тестовые данные автоматически создаются через миграции Flyway (V13, V15).

## Тестирование

- **Пирамида и инварианты:** [docs/TESTING_PYRAMID.md](docs/TESTING_PYRAMID.md) (RLS + outbox / loyalty as flagship tests).  
- **Локально:** `make test` / `./gradlew test`.  
- Подробнее: **[QUICK_START.md](QUICK_START.md)**, **[TESTING.md](TESTING.md)**.

### Быстрый тест:

1. Запустите бэкенд: `./gradlew bootRun` (тестовые данные создаются автоматически)
2. Откройте Swagger UI: http://localhost:8080/swagger-ui.html
3. Или используйте скрипт: `./test-api.sh` (требуется `jq`)
4. Или импортируйте `postman_collection.json` в Postman

## API Документация

После запуска приложения:
- Swagger UI: http://localhost:8080/swagger-ui.html
- API Docs: http://localhost:8080/api-docs

## Основные эндпоинты

### Ингредиенты
- `GET /api/ingredients` - список ингредиентов (с пагинацией и поиском)
- `POST /api/ingredients` - создать ингредиент
- `GET /api/ingredients/{id}` - получить ингредиент
- `PUT /api/ingredients/{id}` - обновить ингредиент
- `DELETE /api/ingredients/{id}` - удалить ингредиент
- `GET /api/ingredients/below-minimum` - ингредиенты ниже минимума

### Блюда
- `GET /api/dishes` - список блюд
- `POST /api/dishes` - создать блюдо
- `GET /api/dishes/{id}` - получить блюдо
- `PUT /api/dishes/{id}` - обновить блюдо
- `DELETE /api/dishes/{id}` - удалить блюдо (soft delete)
- `GET /api/dishes/{id}/recipe` - получить рецепт блюда
- `PUT /api/dishes/{id}/recipe` - обновить рецепт блюда

### Склад
- `POST /api/stock/in` - поступление товара
- `POST /api/stock/out` - списание товара
- `GET /api/stock/movements` - история движений
- `GET /api/stock/inventory` - остатки (с фильтрами)

### Заказы
- `GET /api/orders` - список заказов
- `POST /api/orders` - создать заказ
- `GET /api/orders/{id}` - получить заказ
- `POST /api/orders/{id}/items` - добавить позицию в заказ
- `PUT /api/orders/{id}/items/{itemId}` - обновить количество
- `DELETE /api/orders/{id}/items/{itemId}` - удалить позицию
- `POST /api/orders/{id}/close` - закрыть заказ (продажа + списание ингредиентов)

### Аналитика
- `GET /api/analytics/revenue` - выручка за период
- `GET /api/analytics/revenue/by-day` - выручка по дням
- `GET /api/analytics/top-dishes` - топ блюд по продажам
- `GET /api/analytics/ingredient-usage` - расход ингредиентов
- `GET /api/analytics/problem-ingredients` - проблемные ингредиенты

## Особенности реализации

1. **Транзакции**: Все операции со складом выполняются в транзакциях
2. **Валидация**: Используется Bean Validation (Jakarta Validation)
3. **Обработка ошибок**: Глобальный обработчик исключений
4. **Логирование**: Настроено логирование с уровнями
5. **CORS**: Настроен для работы с фронтендом
6. **Rate limiting**: in-process лимиты по группам путей; см. [docs/SECURITY_NOTES.md](docs/SECURITY_NOTES.md) и `rate_limit.*` в `application.yml`
7. **Миграции БД**: Flyway автоматически применяет миграции при старте

## Бизнес-правила

- Нельзя закрыть заказ без рецепта у блюда
- При закрытии заказа автоматически списываются ингредиенты
- Нельзя списать больше, чем есть на складе
- Остатки не могут быть отрицательными
- Цены и количества должны быть >= 0

