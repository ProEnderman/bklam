# Тестовые аккаунты

## Список тестовых пользователей (из миграций)

### HEAD_ADMIN (основной seed, V15)
- **Email:** `headadmin-primary@local.test`
- **Пароль (только dev):** `12345678` — пароль **тестового** сида, не personal mailbox.
- **Роль:** `HEAD_ADMIN`
- **Ресторан:** не привязан (NULL)

### HEAD_ADMIN (V13, деактивирован в V75)
- **Email:** `headadmin@gmail.com` — в БД `is_active = false` для этой роли (см. V75).

### ADMIN (администратор ресторана)
- **Email:** `admin@gmail.com`
- **Пароль:** `admin123`
- **Роль:** `ADMIN`
- **Ресторан:** Test Restaurant

### REGULAR_WORKER (обычный работник)
- **Email:** `worker@gmail.com`
- **Пароль:** `worker123`
- **Роль:** `REGULAR_WORKER`
- **Ресторан:** Test Restaurant

## Дополнительный HEAD_ADMIN из `.env` (не в git)

Реальный почтовый ящик и пароль можно подставить только локально, через переменные:

- `SEED_PERSONAL_HEAD_ADMIN_ENABLED=true`
- `SEED_PERSONAL_HEAD_ADMIN_EMAIL=...`
- `SEED_PERSONAL_HEAD_ADMIN_PASSWORD=...`

См. `PersonalHeadAdminSeeder` и `.env.example`.

## Генерация хешей паролей

После запуска приложения:

```bash
curl "http://localhost:8080/api/test/hash?password=admin123"
```

См. также `PasswordHashGenerator` (второй вариант — передать пароль аргументом в `main`).
