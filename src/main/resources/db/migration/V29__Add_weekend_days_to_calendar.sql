-- Добавляем поле для хранения выбранных выходных дней (JSON массив)
ALTER TABLE calendars ADD COLUMN IF NOT EXISTS weekend_days TEXT;


