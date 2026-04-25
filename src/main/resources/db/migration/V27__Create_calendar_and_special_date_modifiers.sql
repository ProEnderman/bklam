-- Календари для определения будней/выходных и особых дат
CREATE TABLE IF NOT EXISTS calendars (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT,
    branch_id BIGINT REFERENCES restaurants(id),
    name VARCHAR(255) NOT NULL,
    weekend_rule VARCHAR(50) NOT NULL DEFAULT 'SAT_SUN', -- MON_FRI, SAT_SUN, CUSTOM
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Особые даты календаря (YYYY-MM-DD)
CREATE TABLE IF NOT EXISTS calendar_special_dates (
    calendar_id BIGINT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    PRIMARY KEY (calendar_id, date)
);

-- Модификаторы цен для особых дат в тарифах
CREATE TABLE IF NOT EXISTS tariff_special_date_modifiers (
    id BIGSERIAL PRIMARY KEY,
    tariff_plan_id BIGINT NOT NULL REFERENCES tariff_plans(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    modifier_type VARCHAR(50) NOT NULL DEFAULT 'MULTIPLIER', -- PERCENT, FIXED, MULTIPLIER
    modifier_value NUMERIC(10,4) NOT NULL DEFAULT 1.0,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE(tariff_plan_id, date)
);

-- Добавляем calendar_id в tariff_plans (заменяем tariff_calendar_id)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'tariff_plans' AND column_name = 'calendar_id') THEN
        ALTER TABLE tariff_plans ADD COLUMN calendar_id BIGINT REFERENCES calendars(id);
    END IF;
END $$;

-- Удаляем старый индекс если он существует и создаём новый
DROP INDEX IF EXISTS idx_tariff_plans_calendar;
CREATE INDEX idx_tariff_plans_calendar ON tariff_plans(calendar_id);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_calendars_branch ON calendars(branch_id);
CREATE INDEX IF NOT EXISTS idx_calendars_organization ON calendars(organization_id);
CREATE INDEX IF NOT EXISTS idx_calendar_special_dates_calendar ON calendar_special_dates(calendar_id);
CREATE INDEX IF NOT EXISTS idx_tariff_modifiers_tariff ON tariff_special_date_modifiers(tariff_plan_id);
CREATE INDEX IF NOT EXISTS idx_tariff_modifiers_date ON tariff_special_date_modifiers(date);

