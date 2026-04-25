# Настройка паролей в системе

## Проблема

BCrypt хеши генерируются с солью; в миграциях должны лежать хеши, совместимые с `BCryptPasswordEncoder` приложения.

## Способ 1: Gradle task

```bash
./gradlew generatePasswordHashes
```

Или `PasswordHashGenerator` с аргументом в `main` для произвольного пароля.

## Способ 2: тестовый API

1. Запустите приложение: `SPRING_PROFILES_ACTIVE=dev ./gradlew bootRun` (или `./gradlew devBootRun`)
2. Примеры:
   ```
   GET http://localhost:8080/api/test/hash?password=admin123
   GET http://localhost:8080/api/test/hash?password=worker123
   ```

## Обновление миграций

После получения хешей при необходимости обновите:

### 1. V13__Create_test_data.sql
Пользователи `headadmin@gmail.com`, `admin@gmail.com`, `worker@gmail.com`.

### 2. V15__Create_head_admin.sql
Пользователь `headadmin-primary@local.test` (пароль по умолчанию для seed — см. `TEST_ACCOUNTS.md`).

### 3. V16__Fix_password_hashes.sql
Опционально для уже существующих баз.

## Личный HEAD_ADMIN без правок миграций

Реальный email и пароль задайте только в **`.env`** (файл не коммитится):

- `SEED_PERSONAL_HEAD_ADMIN_ENABLED=true`
- `SEED_PERSONAL_HEAD_ADMIN_EMAIL=...`
- `SEED_PERSONAL_HEAD_ADMIN_PASSWORD=...`

Обработка при старте: `PersonalHeadAdminSeeder` (не активен в профиле `prod`).

## После обновления (dev)

При смене хешей в миграциях часто проще пересоздать dev-БД и дать Flyway накатить заново (см. `TEST_ACCOUNTS.md`).

Тестовые входы по умолчанию — в `TEST_ACCOUNTS.md`.
