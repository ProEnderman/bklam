# Быстрый старт для тестирования

## Рекомендуемый dev (единая БД `restaurant_db_dev`)

1. Скопируйте `.env.example` → `.env`, задайте `DEV_DB_URL`, `JWT_SECRET`, и т.д. (см. `.env.example`).
2. `createdb restaurant_db_dev` или `./gradlew ensureDevDatabase`
3. `./gradlew devBootRun` или `SPRING_PROFILES_ACTIVE=dev ./gradlew bootRun`

### Legacy (без профиля `dev`): `restaurant_db` и `DB_URL`

Ниже — сценарий как раньше: БД **`restaurant_db`**, **`DB_URL`**, без **`DEV_DB_URL`**. Не использовать как основной dev-поток.

## Шаг 0: Создание файла .env (legacy, опционально)

Создайте файл `.env` в корне проекта для настройки подключения к БД:

```bash
cat > .env << 'EOF'
DB_URL=jdbc:postgresql://localhost:5432/restaurant_db
DB_USERNAME=postgres
DB_PASSWORD=
PORT=8080
EOF
```

Или создайте файл вручную с содержимым:
```
DB_URL=jdbc:postgresql://localhost:5432/restaurant_db
DB_USERNAME=postgres
DB_PASSWORD=
PORT=8080
```

**Примечание:** На macOS с Homebrew часто удобнее `DB_USERNAME=$(whoami)` вместо `postgres`; подставьте свою роль PostgreSQL.

## Шаг 1: Подготовка БД

### Для macOS (Homebrew):

```bash
# 1. Убедитесь, что PostgreSQL запущен
brew services start postgresql@14
# или просто: brew services start postgresql

# 2. Создайте БД (используется ваше имя пользователя)
createdb restaurant_db

# 3. Установите переменные окружения
export DB_USERNAME=$(whoami)  # или ваше имя пользователя
export DB_PASSWORD=""         # обычно пустой пароль для локального PostgreSQL
```

### Для Linux/других систем:

```bash
# Создайте БД PostgreSQL
createdb restaurant_db

# Или через psql:
psql -U postgres -c "CREATE DATABASE restaurant_db;"

# Установите переменные окружения
export DB_USERNAME=postgres
export DB_PASSWORD=postgres
```

**Примечание:** Если получаете ошибку "role postgres does not exist", см. файл `POSTGRES_SETUP.md` для подробных инструкций.

## Шаг 2: Запуск бэкенда

```bash
# Из корня проекта
./gradlew bootRun
```

Дождитесь сообщения: `Started RestaurantManagementApplication`

## Шаг 3: Проверка API

Тестовые данные автоматически создаются через миграции Flyway при первом запуске приложения.

Откройте в браузере: http://localhost:8080/swagger-ui.html

Или используйте скрипт:

```bash
./test-api.sh
```

(Требуется установленный `jq` для форматирования JSON)

## Шаг 5: Запуск фронтенда

В новом терминале:

```bash
cd frontend
npm install
npm run dev
```

Откройте: http://localhost:3000

## Проверка основных функций

1. **Swagger UI**: http://localhost:8080/swagger-ui.html
   - Протестируйте несколько эндпоинтов

2. **Frontend Dashboard**: http://localhost:3000/dashboard
   - Должна отображаться выручка и критичные позиции

3. **Создание заказа**:
   - Перейдите в "Новый заказ"
   - Добавьте блюда
   - Закройте заказ
   - Проверьте, что ингредиенты списались

4. **Проверка остатков**:
   - Перейдите в "Ингредиенты"
   - Проверьте остатки
   - Сделайте приход/списание

## Типичные проблемы

### БД не подключается
- Проверьте, что PostgreSQL запущен
- Для **dev**: `DEV_DB_URL`, профиль **`dev`**, БД **`restaurant_db_dev`**. Для **legacy**: `DB_URL`, **`restaurant_db`**

### Порт занят
- Измените PORT в application.yml или переменных окружения

### Миграции не применяются
- Проверьте логи приложения
- Убедитесь, что БД создана и доступна

### Frontend не подключается к API
- Проверьте, что бэкенд запущен на порту 8080
- Проверьте proxy настройки в vite.config.ts

