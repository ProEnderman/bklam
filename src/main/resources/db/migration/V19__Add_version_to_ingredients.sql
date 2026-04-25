-- Добавляем поле version для Optimistic Locking
-- Это защитит от race condition при параллельных обновлениях остатков
ALTER TABLE ingredients ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

-- Создаем индекс для оптимизации (хотя обычно не нужен для version)
-- Но может быть полезен для отладки
CREATE INDEX idx_ingredients_version ON ingredients(version);

