-- Добавляем поле comment для комментариев к блюдам в заказе
ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS comment TEXT;

-- Комментарий к полю
COMMENT ON COLUMN order_items.comment IS 'Комментарий к блюду в заказе (например, "Без лука", "Острое")';


