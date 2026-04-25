-- Удаляем поля is_stop_check и stop_reason из таблицы tariff_rules
-- Эти поля больше не используются, так как функциональность stop-check удалена

DO $$ 
BEGIN
    -- Удаляем колонку stop_reason, если она существует
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'tariff_rules' AND column_name = 'stop_reason') THEN
        ALTER TABLE tariff_rules DROP COLUMN stop_reason;
    END IF;
    
    -- Удаляем колонку is_stop_check, если она существует
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'tariff_rules' AND column_name = 'is_stop_check') THEN
        ALTER TABLE tariff_rules DROP COLUMN is_stop_check;
    END IF;
END $$;


