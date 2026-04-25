# Настройка PostgreSQL

## Стандартный dev (рекомендуется)

- База: **`restaurant_db_dev`**, JDBC: **`DEV_DB_URL`**, профиль **`dev`**. Подробнее: `.env.example`, `README.md`.
- Создание БД: `createdb restaurant_db_dev` или `./gradlew ensureDevDatabase`
- Запуск: `./gradlew devBootRun` или `SPRING_PROFILES_ACTIVE=dev ./gradlew bootRun`

---

## Проблемы доступа и legacy-сценарий

Ниже — устранение типичных проблем (роль `postgres`, пользователь ОС) и примеры с **`DB_URL`** и именем **`restaurant_db`** для **legacy**-запуска без профиля `dev` (как дефолт в `application.yml`).

## Проблема: "role postgres does not exist"

На macOS при установке PostgreSQL через Homebrew обычно используется имя текущего пользователя системы, а не "postgres".

## Решение 1: Использовать текущего пользователя (рекомендуется)

1. Узнайте ваше имя пользователя:
```bash
whoami
```

2. Установите переменные окружения (**legacy:** `DB_URL` → `restaurant_db`; для dev предпочтительны `DEV_DB_URL` → `restaurant_db_dev` и профиль `dev`):
```bash
export DB_USERNAME=$(whoami)
export DB_PASSWORD=""
export DB_URL="jdbc:postgresql://localhost:5432/restaurant_db"
```

3. Или создайте файл `.env` в корне проекта:
```
DB_USERNAME=leonkul
DB_PASSWORD=
DB_URL=jdbc:postgresql://localhost:5432/restaurant_db
```

## Решение 2: Создать роль postgres

Если вы хотите использовать роль "postgres":

```bash
# Подключитесь к PostgreSQL (используя ваше имя пользователя)
psql postgres

# Создайте роль postgres
CREATE ROLE postgres WITH LOGIN PASSWORD 'postgres' SUPERUSER;

# Выйдите
\q
```

## Решение 3: Создать базу данных и пользователя (legacy-имя `restaurant_db`)

```bash
# Подключитесь к PostgreSQL
psql postgres

# Создайте базу данных (legacy; для dev используйте restaurant_db_dev)
CREATE DATABASE restaurant_db;

# Создайте пользователя (если нужно)
CREATE USER restaurant_user WITH PASSWORD 'restaurant_pass';

# Дайте права пользователю
GRANT ALL PRIVILEGES ON DATABASE restaurant_db TO restaurant_user;

# Выйдите
\q
```

Затем обновите application.yml или переменные окружения:
```bash
export DB_USERNAME=restaurant_user
export DB_PASSWORD=restaurant_pass
```

## Проверка подключения

```bash
# Проверьте, что база данных создана
psql -l | grep restaurant_db

# Попробуйте подключиться
psql -d restaurant_db
```

## Быстрая настройка для macOS (Homebrew)

**Dev (рекомендуется):** `createdb restaurant_db_dev`, `.env` с `DEV_DB_URL`, затем `./gradlew devBootRun`.

**Legacy** (без профиля `dev`):

```bash
# 1. Убедитесь, что PostgreSQL запущен
brew services start postgresql@14
# или
brew services start postgresql

# 2. Создайте базу данных (legacy имя)
createdb restaurant_db

# 3. Установите переменные окружения
export DB_USERNAME=$(whoami)
export DB_PASSWORD=""

# 4. Запустите приложение
./gradlew bootRun
```

## Если PostgreSQL не установлен

```bash
# Установите через Homebrew
brew install postgresql@14

# Или последнюю версию
brew install postgresql

# Запустите сервис
brew services start postgresql@14
```

