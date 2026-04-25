# Production runbook

Краткий чеклист перед выкатом Java backend и связанных сервисов.

## 1. Профиль Spring

```bash
export SPRING_PROFILES_ACTIVE=prod
```

Файл **`src/main/resources/application-prod.yml`**: `logging` INFO, `allow-insecure-dev-secrets: false`, секреты только из env (`${JWT_SECRET}` и т.д., без дефолтов в этом файле).

## 2. Обязательные переменные окружения

| Переменная | Назначение |
|------------|------------|
| **`JWT_SECRET`** | Подпись access/refresh JWT. Минимум **32 символа**; в prod/stage без placeholder (см. `EarlySecuritySecretsEnvironmentPostProcessor`). |
| **`QR_SIGNING_SECRET`** | Подпись QR-токенов публичного меню. Минимум **32 символа**. |
| **`FORECAST_INTERNAL_JWT_SECRET_B64`** | Base64 ключа для внутренних JWT к forecasting. После decode ≥ **32 байта**. |
| **`TELEGRAM_WEBHOOK_SECRET`** | **Только если** `TELEGRAM_WEBHOOK_ENABLED=true` — обязателен при старте, минимум **16 символов**. Если webhook не используется — оставьте `TELEGRAM_WEBHOOK_ENABLED=false` (по умолчанию). |

Дополнительно (типичный prod):

- **`DB_URL`**, **`DB_USERNAME`**, **`DB_PASSWORD`** — JDBC основной (и tenant/platform, если не переопределены).
- **`APP_TENANT_DB_USERNAME` / `APP_TENANT_DB_PASSWORD`** — **не** суперпользователь PostgreSQL и **без** `BYPASSRLS`, иначе RLS не действует (см. Flyway V66 и комментарии в `application.yml`).
- **`FORECAST_SERVICE_URL`**, **`TELEGRAM_PAYMENT_SERVICE_URL`** — URL сервисов для бизнес-вызовов и для actuator health.

См. также корневой **`.env.example`**.

## 3. База данных и RLS

- Роль приложения для JPA (**tenant**) должна быть обычным пользователем с `ROW SECURITY` на сессию, **не** `postgres` / superuser в production.
- Миграции: **`spring.flyway.validate-on-migrate=true`** (включено в `application.yml`). При легитимном исправлении checksum одной миграции один раз: `flyway repair`.

## 4. Резервное копирование

- Регулярный дамп: **`./scripts/db-backup.sh`** (gzip, retention по `BACKUP_RETENTION_DAYS`).
- Восстановление: **`docs/BACKUP_RECOVERY.md`**.
- Каталог **`backups/`** в `.gitignore` — не коммитить дампы.

## 5. Health checks

### Actuator (backend)

- **`GET /actuator/health`** (permitAll в Security).
- Включает стандартные индикаторы (в т.ч. **БД** при наличии `DataSource`).
- Кастомные:
  - **`forecast`** — HTTP GET `{FORECAST_SERVICE_URL}/health` (FastAPI).
  - **`telegramPayment`** — HTTP GET `{TELEGRAM_PAYMENT_SERVICE_URL}/health` (Nest; endpoint добавлен в `telegram-payment-service`).

Отключение проверок (например, если сервис временно выключен, но приложение должно подниматься):

```bash
export FORECAST_HEALTH_CHECK=false
export TELEGRAM_PAYMENT_HEALTH_CHECK=false
```

Поведение при недоступности сервиса (по умолчанию **optional**): индикатор в статусе **UNKNOWN**, а не **DOWN** (см. `FORECAST_HEALTH_OPTIONAL`, `TELEGRAM_PAYMENT_HEALTH_OPTIONAL`). Чтобы падать в **DOWN** при недоступности — выставьте соответствующий `*_HEALTH_OPTIONAL=false`.

### Быстрая проверка

```bash
curl -sS http://localhost:8080/actuator/health | jq .
```

## 6. Связанные сервисы

- **forecasting** (Python): тот же `FORECAST_INTERNAL_JWT_SECRET_B64`, что у Java.
- **telegram-payment-service**: свой `.env`, см. `telegram-payment-service/env.example`; для health нужен запущенный процесс на `TELEGRAM_PAYMENT_SERVICE_URL`.

## 7. Логи и аудит

- Доменные логи: уровень **INFO** в prod (`application-prod.yml`).
- Аудит HTTP API: **`ApiAuditLogFilter`**; чувствительные пути исключены из тела запроса в логах.
- Ошибки API: единый **`ApiErrorResponse`**, без stack trace в JSON.

## 8. Итоговый чеклист перед деплоем

- [ ] `SPRING_PROFILES_ACTIVE=prod`
- [ ] Заданы JWT / QR / forecast B64; при webhook — `TELEGRAM_WEBHOOK_ENABLED` + секрет
- [ ] Tenant DB user ≠ superuser, RLS проверен на стенде
- [ ] Flyway прошёл на стенде с `validate-on-migrate`
- [ ] Настроен cron/scheduler для **`db-backup.sh`**
- [ ] `/actuator/health` зелёный или осознанно UNKNOWN для optional deps
- [ ] CORS / `CORS_ALLOWED_ORIGINS` для реальных фронтов

После выполнения чеклиста выкат считается **SAFE TO DEPLOY** в рамках текущей архитектуры репозитория.
