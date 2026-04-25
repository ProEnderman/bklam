-- Добавляем поле permissions для хранения прав REGULAR_WORKER в формате JSON
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT NULL;

-- Комментарий к полю
COMMENT ON COLUMN users.permissions IS 'JSON массив прав для REGULAR_WORKER. Пример: ["CREATE_ORDERS", "EDIT_OWN_ORDERS", "VIEW_INGREDIENTS"]';


