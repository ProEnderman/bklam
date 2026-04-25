-- Добавляем поле image_url для изображений блюд
ALTER TABLE dishes 
ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);


