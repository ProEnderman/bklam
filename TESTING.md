# Инструкция по тестированию проекта

### Рекомендуемый dev

- БД: **`restaurant_db_dev`**, **`DEV_DB_URL`**, профиль **`dev`**. См. README, `.env.example`, `./gradlew devBootRun`.

### Legacy (без профиля `dev`)

Ниже — вариант с **`restaurant_db`** и **`DB_URL`** (как дефолт в `application.yml`).

## 1. Подготовка окружения

### 1.1 База данных PostgreSQL (legacy)

```bash
createdb restaurant_db
# или: CREATE DATABASE restaurant_db;
```

### 1.2 Переменные окружения (legacy)

```bash
DB_URL=jdbc:postgresql://localhost:5432/restaurant_db
DB_USERNAME=postgres
DB_PASSWORD=postgres
PORT=8080
```

## 2. Запуск бэкенда

```bash
./gradlew bootRun
```

Проверьте, что сервер запустился:
- http://localhost:8080/swagger-ui.html - Swagger UI
- http://localhost:8080/api-docs - OpenAPI документация

## 3. Тестовые данные

Тестовые данные автоматически создаются через миграции Flyway:
- V13__Create_test_data.sql - создает тестовых пользователей и ресторан
- V15__Create_head_admin.sql - создает HEAD_ADMIN аккаунт

Дополнительные данные можно добавить через API или Swagger UI.

## 4. Запуск фронтенда

```bash
cd frontend
npm install
npm run dev
```

Фронтенд будет доступен на http://localhost:3000

## 5. Тестирование через Swagger UI

1. Откройте http://localhost:8080/swagger-ui.html
2. Протестируйте каждый эндпоинт через UI

## 6. Тестирование через Postman/cURL

Используйте файл `postman_collection.json` для импорта в Postman.

Или используйте curl команды из `test-api.sh`

## 7. Чеклист функциональности

### ✅ Ingredients (Ингредиенты)
- [ ] GET /api/ingredients - список ингредиентов
- [ ] POST /api/ingredients - создать ингредиент
- [ ] GET /api/ingredients/{id} - получить ингредиент
- [ ] PUT /api/ingredients/{id} - обновить ингредиент
- [ ] DELETE /api/ingredients/{id} - удалить ингредиент
- [ ] GET /api/ingredients?belowMin=true - ингредиенты ниже минимума

### ✅ Dishes (Блюда)
- [ ] GET /api/dishes - список блюд
- [ ] POST /api/dishes - создать блюдо
- [ ] GET /api/dishes/{id} - получить блюдо
- [ ] PUT /api/dishes/{id} - обновить блюдо
- [ ] DELETE /api/dishes/{id} - удалить блюдо (soft delete)

### ✅ Recipes (Рецепты)
- [ ] GET /api/dishes/{dishId}/recipe - получить рецепт
- [ ] PUT /api/dishes/{dishId}/recipe - обновить рецепт

### ✅ Stock (Склад)
- [ ] POST /api/stock/in - поступление товара
- [ ] POST /api/stock/out - списание товара
- [ ] GET /api/stock/movements - история движений
- [ ] GET /api/stock/inventory - остатки

### ✅ Orders (Заказы)
- [ ] POST /api/orders - создать заказ
- [ ] GET /api/orders - список заказов
- [ ] GET /api/orders/{id} - получить заказ
- [ ] POST /api/orders/{id}/items - добавить позицию
- [ ] PUT /api/orders/{id}/items/{itemId} - изменить количество
- [ ] DELETE /api/orders/{id}/items/{itemId} - удалить позицию
- [ ] POST /api/orders/{id}/close - закрыть заказ (проверить списание ингредиентов)
- [ ] POST /api/orders/{id}/cancel - отменить заказ

### ✅ Analytics (Аналитика)
- [ ] GET /api/analytics/revenue - выручка
- [ ] GET /api/analytics/top-dishes - топ блюд
- [ ] GET /api/analytics/ingredient-usage - расход ингредиентов
- [ ] GET /api/analytics/problem-ingredients - проблемные ингредиенты

## 8. Тестирование UI

### Dashboard
- [ ] Отображается выручка
- [ ] Показываются критичные позиции
- [ ] Отображается топ-5 блюд

### Ingredients
- [ ] Таблица ингредиентов с поиском
- [ ] Фильтр "ниже минимума"
- [ ] Модалка прихода товара
- [ ] Модалка списания товара

### Dishes
- [ ] Список блюд
- [ ] Создание блюда
- [ ] Редактор рецепта

### New Order
- [ ] Создание заказа
- [ ] Добавление блюд в заказ
- [ ] Изменение количества
- [ ] Закрытие заказа

### Orders History
- [ ] Список заказов
- [ ] Фильтр по статусу
- [ ] Детали заказа

## 9. Проверка бизнес-логики

### Важные сценарии:
1. **Создание заказа и закрытие:**
   - Создать заказ
   - Добавить блюда с рецептом
   - Закрыть заказ
   - Проверить, что ингредиенты списались со склада

2. **Недостаток ингредиентов:**
   - Создать заказ
   - Добавить блюдо
   - Уменьшить остатки ингредиентов до минимума
   - Попытаться закрыть заказ - должна быть ошибка

3. **Рецепт без ингредиентов:**
   - Создать блюдо без рецепта
   - Попытаться закрыть заказ с этим блюдом - должна быть ошибка

4. **Критичные позиции:**
   - Уменьшить остатки ниже минимума
   - Проверить, что они отображаются в Dashboard и Ingredients

## 10. Автоматические тесты

```bash
# Запуск unit тестов
./gradlew test

# Запуск всех тестов
./gradlew check
```

