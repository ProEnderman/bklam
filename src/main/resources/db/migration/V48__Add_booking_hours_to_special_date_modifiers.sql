-- Добавляем возможность переопределять время работы для конкретных особых дат
-- NULL означает "использовать стандартное время из тарифного плана"
ALTER TABLE tariff_special_date_modifiers
    ADD COLUMN IF NOT EXISTS booking_time_from TIME DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS booking_time_to TIME DEFAULT NULL;
