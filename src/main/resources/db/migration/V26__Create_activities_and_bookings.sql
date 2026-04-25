-- Мероприятия/Активности
CREATE TABLE activities (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT,
    branch_id BIGINT REFERENCES restaurants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE/INACTIVE
    booking_mode VARCHAR(50) NOT NULL DEFAULT 'CAPACITY', -- CAPACITY/EXCLUSIVE
    concurrent_limit INTEGER NOT NULL DEFAULT 1, -- Лимит параллельных записей
    requires_resource BOOLEAN NOT NULL DEFAULT false, -- Нужно ли бронировать конкретный ресурс
    tariff_plan_id BIGINT REFERENCES tariff_plans(id), -- Связь с тарифным планом
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_activities_branch ON activities(branch_id);
CREATE INDEX idx_activities_status ON activities(status);
CREATE INDEX idx_activities_tariff_plan ON activities(tariff_plan_id);

-- Ресурсы (столы, залы, комнаты)
CREATE TABLE resources (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT REFERENCES restaurants(id),
    activity_id BIGINT REFERENCES activities(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- "Стол №1", "Зал №1"
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE/INACTIVE/MAINTENANCE
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_resources_branch ON resources(branch_id);
CREATE INDEX idx_resources_activity ON resources(activity_id);
CREATE INDEX idx_resources_status ON resources(status);

-- Бронирования
CREATE TABLE bookings (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT,
    branch_id BIGINT NOT NULL REFERENCES restaurants(id),
    activity_id BIGINT NOT NULL REFERENCES activities(id),
    resource_id BIGINT REFERENCES resources(id), -- Опционально, если requires_resource = true
    customer_id BIGINT REFERENCES users(id), -- Опционально, если клиент зарегистрирован
    customer_name VARCHAR(255), -- Имя клиента
    customer_phone VARCHAR(50), -- Телефон клиента
    start_at TIMESTAMP NOT NULL,
    end_at TIMESTAMP NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- DRAFT | CONFIRMED | CANCELLED | COMPLETED
    pricing_run_id BIGINT REFERENCES pricing_runs(id), -- Ссылка на рассчитанную цену
    total_amount NUMERIC(10,2), -- Итоговая сумма (кэш из pricing_run)
    notes TEXT, -- Дополнительные заметки
    created_by VARCHAR(255), -- Кто создал
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX idx_bookings_branch ON bookings(branch_id);
CREATE INDEX idx_bookings_activity ON bookings(activity_id);
CREATE INDEX idx_bookings_resource ON bookings(resource_id);
CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_start_at ON bookings(start_at);
CREATE INDEX idx_bookings_end_at ON bookings(end_at);

-- Составной индекс для быстрой проверки пересечений
CREATE INDEX idx_bookings_overlap_check ON bookings(branch_id, activity_id, resource_id, status, start_at, end_at)
WHERE status IN ('DRAFT', 'CONFIRMED');

