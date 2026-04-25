-- Добавляем restaurant_id ко всем существующим таблицам для multi-tenancy
ALTER TABLE ingredients ADD COLUMN restaurant_id BIGINT REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE dishes ADD COLUMN restaurant_id BIGINT REFERENCES restaurants(id) ON DELETE CASCADE;
ALTER TABLE orders ADD COLUMN restaurant_id BIGINT REFERENCES restaurants(id) ON DELETE CASCADE;

-- Создаем индексы
CREATE INDEX idx_ingredients_restaurant_id ON ingredients(restaurant_id);
CREATE INDEX idx_dishes_restaurant_id ON dishes(restaurant_id);
CREATE INDEX idx_orders_restaurant_id ON orders(restaurant_id);

-- Удаляем старые уникальные индексы на name
DROP INDEX IF EXISTS idx_ingredients_name_unique;
DROP INDEX IF EXISTS idx_dishes_name_unique;

-- Создаем составные уникальные индексы (name, restaurant_id)
CREATE UNIQUE INDEX idx_ingredients_name_restaurant ON ingredients(name, restaurant_id);
CREATE UNIQUE INDEX idx_dishes_name_restaurant ON dishes(name, restaurant_id);

-- Для существующих данных (если есть) - можно будет установить restaurant_id вручную
-- Пока оставляем NULL для совместимости, но в будущем все должно быть NOT NULL

