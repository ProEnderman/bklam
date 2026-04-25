# Резервное копирование и восстановление БД

## Какая БД и где она работает

| Среда | СУБД | Как подключаются |
|--------|------|------------------|
| **По умолчанию** (`application.yml`) | PostgreSQL | `localhost:5432`, БД `restaurant_db` (legacy) |
| **Dev / Docker Compose** | PostgreSQL 16 в контейнере `postgres` | С хоста: **`localhost:5433`** → внутри контейнера `5432`. Основная БД: `restaurant_db_dev` (переименуется через `POSTGRES_DB` в `.env`). Дополнительно создаётся **`telegram_payments`** (см. `docker/postgres-ensure/ensure.sh`). |
| **Облако / prod** | Обычно управляемый PostgreSQL | Задаётся `DB_URL` / переменные окружения — те же скрипты работают, если доступны **`pg_dump`**, **`gzip`** и **`psql`** с вашей машины или bastion. |

Скрипты в `scripts/` ориентированы на **доступ с хоста** к Postgres (как `./scripts/db-psql.sh`): порт **5433** по умолчанию для текущего `docker-compose.yml`.

---

## Стратегия (baseline)

1. **Полный логический бэкап** раз в сутки: `pg_dump` (plain SQL) **в поток `gzip`** → файл **`.sql.gz`** (меньше размер, быстрее копирование).
2. **Хранение**: локальный каталог `./backups/`, по умолчанию удаляются файлы старше **14** суток (`*.sql.gz` и устаревшие `*.sql`).
3. **Имя файла**: `имя_бд_UTC.sql.gz` (например `restaurant_db_dev_20260417_120000.sql.gz`).
4. В дампе включены **`--clean --if-exists`**, чтобы при восстановлении на ту же БД корректно пересоздавались объекты (приложение на время restore **нужно остановить**).

**Скрипт `db-backup.sh`:** `set -euo pipefail` (ошибка `pg_dump` или `gzip` прерывает пайплайн), запись через временный файл, проверка **непустого** результата, лог строками **`[BACKUP] ...`** (удобно в cron).

**Скрипт `db-restore.sh`:** проверка наличия **`psql`** и **`gzip`**, для `.sql.gz` — `gzip -dc file.sql.gz | psql ...` (эквивалентно `gunzip -c`), для старых дампов — `psql -f file.sql`.

**Окно потери данных (RPO):** до ~24 часов, если бэкап только ежедневный. Транзакции после последнего успешного дампа не попадут в файл.

**RTO:** зависит от размера БД и диска; ориентир — время распаковки + `psql` + остановка/запуск приложения.

---

## Backup одной командой

Из корня репозитория (поднят `docker compose up -d postgres` или доступен Postgres на `PGPORT`):

```bash
./scripts/db-backup.sh
```

Переменные (опционально, как в `db-psql.sh` / `.env`):

| Переменная | По умолчанию |
|------------|----------------|
| `PGHOST` | `localhost` |
| `PGPORT` | `5433` |
| `PGUSER` / из `.env` `DB_USERNAME` | `postgres` |
| `PGPASSWORD` / `DB_PASSWORD` | `postgres` |
| `PGDATABASE` / `POSTGRES_DB` | `restaurant_db_dev` |
| `BACKUP_DIR` | `./backups` |
| `BACKUP_RETENTION_DAYS` | `14` (0 = не удалять старые) |

Примеры:

```bash
# Локальный Postgres на 5432, другая БД
PGPORT=5432 PGDATABASE=restaurant_db ./scripts/db-backup.sh

# Хранить 7 дней
BACKUP_RETENTION_DAYS=7 ./scripts/db-backup.sh

# Вторая БД из compose (платежи)
PGDATABASE=telegram_payments ./scripts/db-backup.sh
```

### Без скрипта (вручную, с gzip)

```bash
export PGPASSWORD=postgres
mkdir -p backups
pg_dump -h localhost -p 5433 -U postgres -d restaurant_db_dev \
  --clean --if-exists --no-owner --no-acl \
  | gzip > "./backups/manual_$(date -u +%Y%m%d_%H%M%S).sql.gz"
```

### Из контейнера Docker (пример)

С хоста, пока контейнер `postgres` запущен:

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U postgres -d restaurant_db_dev \
  --clean --if-exists --no-owner --no-acl \
  | gzip > "./backups/restaurant_db_dev_$(date -u +%Y%m%d_%H%M%S).sql.gz"
```

Том данных Postgres в compose: **`postgres_data`** (`docker-compose.yml`) — это **живой кластер**; для «снимка диска» нужны средства хоста/облака; для baseline достаточно **логического `pg_dump`**.

### Cron на хосте (пример)

```cron
15 2 * * * cd /path/to/COURSE_PROJECT && ./scripts/db-backup.sh >>./backups/backup.log 2>&1
```

В логе будут строки `[BACKUP] Started at ...` / `[BACKUP] Saved to ...` / `[BACKUP] Finished at ...`.

---

## Восстановление

1. Остановить **backend** и всё, что держит пулы к целевой БД.
2. Убедиться, что `PGHOST`/`PGPORT`/`PGDATABASE` указывают на **ту БД**, которую хотите перезаписать.

Интерактивно (после подтверждения Enter):

```bash
CONFIRM=YES ./scripts/db-restore.sh ./backups/restaurant_db_dev_20260417_120000.sql.gz
```

Без паузы (например, из Ansible):

```bash
CONFIRM=YES RESTORE_NONINTERACTIVE=YES ./scripts/db-restore.sh ./backups/restaurant_db_dev_20260417_120000.sql.gz
```

Старый несжатый дамп:

```bash
CONFIRM=YES ./scripts/db-restore.sh ./backups/legacy.sql
```

Вручную (из `.sql.gz`):

```bash
export PGPASSWORD=postgres
gzip -dc ./backups/restaurant_db_dev_20260417_120000.sql.gz \
  | psql -h localhost -p 5433 -U postgres -d restaurant_db_dev -v ON_ERROR_STOP=1
# или: gunzip -c ./backups/....sql.gz | psql ...
```

### Риски

- **Потеря данных после точки бэкапа** — всё, что накопилось после дампа, не восстановится из этого файла.
- **`--clean` в дампе** удаляет объекты перед созданием; при ошибке на середине потока БД может оказаться в несогласованном состоянии — держите **несколько поколений** бэкапов и проверяйте restore на копии.
- **Роли и права**: дамп с `--no-owner --no-acl` проще переносить между окружениями; кастомные роли/GRANT в prod могут потребовать донастройки вручную.
- **Секреты**: архивы **`.sql.gz`** содержат те же данные, что и plain SQL — **не коммитьте** каталог `backups/` (он в `.gitignore`).

---

## Ограничения (что сознательно не делаем в этом runbook)

- Нет PITR / WAL archiving, нет облачного **автоматического** lifecycle (S3 versioning) в репозитории.
- Нет Kubernetes VolumeSnapshot.
- Нет шифрования дампов на диске — при необходимости оберните: `gpg -c backup.sql.gz` или храните на зашифрованном томе.

Для production в облаке обычно включают **автоматические снимки диска** у провайдера БД **плюс** периодический `pg_dump` в объектное хранилище — это следующий шаг поверх этого baseline.
