-- Удаляем поля application_level, currency и priority из tariff_plans
-- Эти поля больше не используются в модели

-- Сначала делаем поля nullable (если они еще NOT NULL)
ALTER TABLE tariff_plans ALTER COLUMN application_level DROP NOT NULL;
ALTER TABLE tariff_plans ALTER COLUMN currency DROP NOT NULL;
ALTER TABLE tariff_plans ALTER COLUMN priority DROP NOT NULL;

-- Удаляем индексы, связанные с этими полями
DROP INDEX IF EXISTS idx_tariff_plans_priority;

-- Удаляем сами колонки
ALTER TABLE tariff_plans DROP COLUMN IF EXISTS application_level;
ALTER TABLE tariff_plans DROP COLUMN IF EXISTS currency;
ALTER TABLE tariff_plans DROP COLUMN IF EXISTS priority;



