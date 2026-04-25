# Переменные окружения (application.yml)

В `application.yml` все чувствительные настройки задаются через **переменные окружения**. В файл подставлять значения не нужно — только в окружение (или в `.env`).

## Где задавать значения

| Способ | Когда использовать |
|--------|--------------------|
| **Файл `.env` в корне проекта** | Локальная разработка. Создайте из `.env.example`, заполните. Для Spring Boot: запускайте с `--spring.config.additional-location=file:.env` или экспортируйте переменные из `.env` перед `./gradlew bootRun`. |
| **Export в терминале** | `export JWT_SECRET=...` перед запуском. Или в начале `start-all.sh`: `set -a; source .env; set +a` |
| **IDE (Run Configuration)** | IntelliJ / VS Code: в настройках запуска приложения добавьте Environment variables. |
| **Docker / docker-compose** | В `docker-compose.yml` в секции `environment:` или через файл `.env` рядом с docker-compose (подхватывается автоматически). |

Spring Boot читает переменные окружения автоматически: подставьте значение в `VAR` — в yml будет использоваться оно вместо `default`.

---

## Переменная → что подставить, откуда взять

### Сервер и БД (обязательно для запуска)

| Переменная | Пример значения | Откуда взять |
|------------|------------------|--------------|
| `PORT` | `8080` | Любой свободный порт. По умолчанию 8080. |
| `DB_URL` | `jdbc:postgresql://localhost:5432/restaurant_db` | Основной URL (см. `application.yml`). Для **обычного dev** используйте профиль `dev` и **`DEV_DB_URL`** → `restaurant_db_dev`. |
| `DEV_DB_URL` | `jdbc:postgresql://localhost:5432/restaurant_db_dev` | Единый JDBC URL для профилей `dev` и `local-docker` (см. `application-dev.yml`, `application-local-docker.yml`). На Docker Postgres с хоста часто порт **5433**. |
| `POSTGRES_DB` | `restaurant_db_dev` | Только для **docker-compose**: имя БД в контейнере (должно совпадать с именем в `DEV_DB_URL`). |
| `DB_USERNAME` | `postgres` | Пользователь БД. |
| `DB_PASSWORD` | `postgres` | Пароль БД. Локально часто `postgres`. |

### Роли БД и RLS

Основное приложение использует два пула: **tenant** (`app.datasource.tenant`) и опционально **platform** (`app.datasource.platform`), см. `application.yml` и `MultiDataSourceConfig`.

| Переменная | Назначение |
|------------|------------|
| `APP_TENANT_DB_USERNAME` / `APP_TENANT_DB_PASSWORD` | Учётка для обычных запросов (JPA). В **production** не должна быть суперпользователем PostgreSQL и не должна иметь атрибут **BYPASSRLS**, иначе политики RLS не ограничивают строки. Рекомендуется выделенная роль (например `app_tenant` из миграции V66). |
| `APP_PLATFORM_DB_USERNAME` / `APP_PLATFORM_DB_PASSWORD` | Учётка для осознанного обхода RLS только в коде, использующем `platformJdbcTemplate` (очереди, фоновые задачи). По умолчанию совпадает с `DB_USERNAME` / `DB_PASSWORD`. |

Локально часто оставляют `postgres` для удобства; для staging/production задайте отдельные роли и пароли.

Для `DB_URL` в **не-dev** режиме дефолты уже в `application.yml`. Для профиля **`dev`** задайте **`DEV_DB_URL`** и секреты (см. `.env.example`).

---

### Redis (если используете rate limit / кэш)

| Переменная | Пример | Откуда |
|------------|--------|--------|
| `REDIS_HOST` | `localhost` | Хост Redis. |
| `REDIS_PORT` | `6379` | Порт Redis. |
| `REDIS_PASSWORD` | *(пусто)* | Пароль Redis, если включён. |

Если Redis не запущен — приложение может падать при старте. Либо запустите Redis, либо отключите использование Redis в коде (зависит от проекта).

---

### JWT (авторизация пользователей)

| Переменная | Пример | Откуда |
|------------|--------|--------|
| `JWT_SECRET` | длинная случайная строка (32+ символа) | Сгенерировать: `openssl rand -base64 32` или придумать длинный пароль. Обязателен в любом окружении. |
| `ALLOW_INSECURE_DEV_SECRETS` | `false` / `true` | Явный dev/test флаг. В non-dev игнорируется (всё равно strict fail-fast). |

---

### CORS и прокси

| Переменная | Пример | Откуда |
|------------|--------|--------|
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:5173` | URL фронтенда через запятую. 3000 — часто Vite dev, 5173 — другой порт Vite. |
| `TRUST_PROXY` | `true` | `true` если за nginx/прокси, иначе можно не трогать. |

---

### QR-меню

| Переменная | Пример | Откуда |
|------------|--------|--------|
| `QR_SIGNING_SECRET` | base64-строка | Сгенерировать: `openssl rand -base64 32`. Должен совпадать с тем, кто проверяет подпись QR. |
| `QR_MENU_BASE_URL` | `http://localhost:3000` | Базовый URL фронта (где открывается QR-меню). |

---

### Прогнозы (Forecast Python-сервис)

| Переменная | Пример | Откуда |
|------------|--------|--------|
| `FORECAST_SERVICE_URL` | `http://localhost:8090` | URL Python-сервиса прогнозов. Локально — 8090. |
| `FORECAST_INTERNAL_JWT_SECRET_B64` | base64 ключа 32+ байт | Сгенерировать: `openssl rand -base64 32`. Один и тот же ключ задать в Java и в Python (см. `.env.example`). Обязателен. |

---

### Telegram

| Переменная | Пример | Откуда |
|------------|--------|--------|
| `TELEGRAM_WEBHOOK_SECRET` | случайная строка | Свой секрет для проверки вебхуков Telegram. |
| `TELEGRAM_BOT_TOKEN` | `123456:ABC-DEF...` | Токен бота от [@BotFather](https://t.me/BotFather). |
| `TELEGRAM_WEBAPP_MAX_AUTH_AGE_SECONDS` | `86400` | Время жизни авторизации WebApp (секунды). |
| `TELEGRAM_DEFAULT_RESTAURANT_ID` | `0` | ID ресторана по умолчанию для Telegram. |
| `TELEGRAM_PAYMENT_SERVICE_URL` | `http://localhost:3001` | URL NestJS Telegram Payment Service. |

---

### Email (SMTP2GO)

| Переменная | Пример | Откуда |
|------------|--------|--------|
| `SMTP2GO_API_KEY` | `api-XXXX...` | Ключ API в личном кабинете [SMTP2GO](https://www.smtp2go.com/). |
| `SMTP2GO_FROM_EMAIL` | `noreply@yourdomain.com` | Адрес отправителя писем. |

---

## Минимум для локального запуска

Чтобы просто запустить бэкенд локально:

1. PostgreSQL запущен; для dev — БД **`restaurant_db_dev`** и **`DEV_DB_URL`**, либо legacy **`restaurant_db`** с `DB_*`.
2. Обязательно задать security secrets: `JWT_SECRET`, `QR_SIGNING_SECRET`, `FORECAST_INTERNAL_JWT_SECRET_B64`.
3. Для docker с telegram-payment дополнительно: `TELEGRAM_PAYMENT_MASTER_KEY`.

## Пример .env в корне проекта

```bash
# Минимум
DB_PASSWORD=postgres

# Обязательно даже для dev
JWT_SECRET=$(openssl rand -base64 32)
QR_SIGNING_SECRET=$(openssl rand -base64 32)

# Один и тот же secret для Java и Python
FORECAST_INTERNAL_JWT_SECRET_B64=$(openssl rand -base64 32)
```

После создания `.env` при запуске через скрипт можно подгружать его: в начале `start-all.sh` добавить `set -a && source .env && set +a` (или экспортировать переменные вручную).
