# Scripts

## DX (Makefile: `test`, `run`, `migrate`, `openapi`, `openapi-portfolio`)

| Script | Role |
|--------|------|
| `test.sh` | `./gradlew test --no-daemon` |
| `run.sh` | `./gradlew devBootRun` |
| `migrate.sh` | `docker compose up` postgres/redis (if Docker available) + note that Flyway runs on app start |
| `openapi-export.sh` | `GET /v3/api-docs` → `openapi-export.json` (full API, backend on :8080) |
| `openapi-portfolio-snapshot.sh` | `GET /v3/api-docs/portfolio` → `docs/openapi-portfolio-snapshot.json` (see [docs/OPENAPI.md](../docs/OPENAPI.md)) |
| [Postman: RMS demo](../docs/collections/rms-portfolio.postman_collection.json) | Import in Postman / compatible clients: health, metrics, OpenAPI, Swagger, orders/dishes, outbox, loyalty accrual, `X-Request-Id` example |
| `demo-outbox-loyalty.sh` | Runs `OutboxExactlyOnceIT` + points to `docs/OUTBOX_LOYALTY_SEMANTICS.md` |  
| — | For a **2 min screen recording shot list** (separate from this script), see [docs/PORTFOLIO_DEMO_RECORDING.md](../docs/PORTFOLIO_DEMO_RECORDING.md) |

## Database backup & restore

See **[../docs/BACKUP_RECOVERY.md](../docs/BACKUP_RECOVERY.md)** and production checklist **[../docs/PRODUCTION_RUNBOOK.md](../docs/PRODUCTION_RUNBOOK.md)**.

```bash
./scripts/db-backup.sh
CONFIRM=YES ./scripts/db-restore.sh ./backups/restaurant_db_dev_YYYYMMDD_HHMMSS.sql.gz
```

## Forecast isolation verification

After `docker compose up` (with `backend` and `forecast`), run:

```bash
./scripts/verify-forecast-isolation.sh
```

See **[verify-forecast-isolation.md](./verify-forecast-isolation.md)** for the 3 manual commands and expected results (forecast cannot reach postgres; no auth → 401; valid internal JWT → 200).
