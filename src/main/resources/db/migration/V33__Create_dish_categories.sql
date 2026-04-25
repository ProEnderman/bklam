-- Создаем таблицу категорий блюд
CREATE TABLE IF NOT EXISTS dish_categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    image_url VARCHAR(500),
    restaurant_id BIGINT REFERENCES restaurants(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_dish_categories_restaurant_id ON dish_categories(restaurant_id);
CREATE INDEX idx_dish_categories_name ON dish_categories(name);

-- Добавляем поле category_id в таблицу dishes
ALTER TABLE dishes 
ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES dish_categories(id) ON DELETE SET NULL;

CREATE INDEX idx_dishes_category_id ON dishes(category_id);


