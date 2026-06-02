-- Расписание по дням: [{ "day": 1, "startTime": "09:00", "endTime": "15:00" }, ...]
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS day_schedules JSONB;
COMMENT ON COLUMN shift_templates.day_schedules IS 'Время смены по ISO-дням 1–7; приоритетнее единого start_time/end_time.';
