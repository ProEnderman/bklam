-- Несколько дней недели в одном шаблоне смен (ISO: 1=Пн … 7=Вс)
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS days_of_week JSONB;
COMMENT ON COLUMN shift_templates.days_of_week IS 'Массив ISO-дней 1–7; если задан — только эти дни. Иначе используется day_of_week или все дни.';
