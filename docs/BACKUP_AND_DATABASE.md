# Бэкапы и проверка БД

## Бэкапы всей системы

### 1. PostgreSQL (основные данные)

В проекте две базы в одном инстансе Postgres (типичный docker-compose):
- **restaurant_db_dev** — основной бэкенд в **dev** (рестораны, заказы, пользователи и т.д.); имя задаётся `POSTGRES_DB` (по умолчанию `restaurant_db_dev`).
- **telegram_payments** — сервис telegram-payment (Prisma)

Старое имя **`restaurant_db`** встречается только при запуске без профиля `dev` и с `DB_URL` по умолчанию из `application.yml`.

**Дамп обеих баз (Docker):**

```bash
# Создать папку для бэкапов
mkdir -p backups

# Дамп основной БД приложения (должно быть много таблиц, ~70+)
docker compose exec -T postgres pg_dump -U postgres -d restaurant_db_dev --no-owner --no-acl -F c -f - > backups/restaurant_db_dev_$(date +%Y%m%d_%H%M%S).dump

# Дамп БД telegram-payment (отдельная БД, меньше таблиц)
docker compose exec -T postgres pg_dump -U postgres -d telegram_payments --no-owner --no-acl -F c -f - > backups/telegram_payments_$(date +%Y%m%d_%H%M%S).dump
```

**Восстановление из дампа:**

```bash
# Остановить backend/telegram-payment, чтобы не было подключений
docker compose stop backend telegram-payment

# Восстановить restaurant_db_dev (создаёт данные поверх текущих!)
docker compose exec -T postgres pg_restore -U postgres -d restaurant_db_dev --no-owner --no-acl --clean --if-exists < backups/restaurant_db_dev_YYYYMMDD_HHMMSS.dump

# Восстановить telegram_payments
docker compose exec -T postgres pg_restore -U postgres -d telegram_payments --no-owner --no-acl --clean --if-exists < backups/telegram_payments_YYYYMMDD_HHMMSS.dump

docker compose start backend telegram-payment
```

**Только SQL (удобно смотреть и хранить в git не стоит):**

```bash
docker compose exec -T postgres pg_dump -U postgres -d restaurant_db_dev --no-owner --no-acl > backups/restaurant_db_dev_$(date +%Y%m%d).sql
```

### 2. Redis (кеш, rate limit, сессии)

Обычно не критично для «полного» бэкапа — после перезапуска данные восстанавливаются по мере работы. Если нужно сохранить:

```bash
docker compose exec redis redis-cli SAVE
docker compose cp redis:/data/dump.rdb backups/redis_dump_$(date +%Y%m%d).rdb
```

### 3. Конфигурация и секреты

- Скопировать **.env** в безопасное место (не в git).
- При необходимости — **docker-compose.yml** и кастомные **volumes** (если что-то монтируется с хоста).

### 4. Volume Postgres

Полный бэкап тома (сырые файлы БД) возможен, но для переноса проще и надёжнее использовать **pg_dump** (команды выше).

---

## Сколько таблиц в базе (должно быть много таблиц в restaurant_db_dev)

Если видишь **11 таблиц** — скорее всего смотришь базу **telegram_payments** (у неё мало таблиц от Prisma). Основное приложение в dev использует **restaurant_db_dev** — там десятки таблиц после миграций Flyway.

**Проверка количества таблиц по базам:**

```bash
# Подключиться к Postgres в контейнере
docker compose exec postgres psql -U postgres -d restaurant_db_dev -c "
SELECT count(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
"
```

Ожидаемо для **restaurant_db_dev**: около **71 таблицы** (число может немного меняться от версии миграций).

**Список таблиц в restaurant_db_dev:**

```bash
docker compose exec postgres psql -U postgres -d restaurant_db_dev -c "
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
"
```

**Проверка базы telegram_payments (там мало таблиц):**

```bash
docker compose exec postgres psql -U postgres -d telegram_payments -c "
SELECT count(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
"
```

**Убедиться, что подключение идёт к нужной БД:**

- Backend в docker-compose использует имя БД из `POSTGRES_DB` (по умолчанию **restaurant_db_dev**), см. `DB_URL` / `DEV_DB_URL` в документации.
- Если в клиенте (DBeaver, psql и т.п.) выбрана **telegram_payments** или другая БД — будет видно меньше таблиц.

---

## Краткий чеклист бэкапа

1. **pg_dump** для **restaurant_db_dev** (или вашей основной БД) и **telegram_payments** в `backups/`.
2. Сохранить **.env** (и при необходимости другие конфиги).
3. При желании — **redis** (SAVE + копия dump.rdb).
4. Регулярно проверять восстановление из дампа на тестовом окружении.
