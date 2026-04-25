-- Добавляем связь между тарифным планом и календарём
ALTER TABLE tariff_plans ADD COLUMN tariff_calendar_id BIGINT REFERENCES tariff_calendars(id);

CREATE INDEX idx_tariff_plans_calendar ON tariff_plans(tariff_calendar_id);




