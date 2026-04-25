-- Шаблоны смен
CREATE TABLE shift_templates (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    restaurant_id BIGINT REFERENCES restaurants(id),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    day_of_week VARCHAR(20),
    shift_type VARCHAR(50),
    recurrence_rule TEXT, -- RRULE в формате iCalendar
    valid_from DATE,
    valid_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_shift_templates_restaurant ON shift_templates(restaurant_id);
CREATE INDEX idx_shift_templates_active ON shift_templates(is_active);

-- Запросы на обмен сменами
CREATE TABLE shift_swap_requests (
    id BIGSERIAL PRIMARY KEY,
    from_shift_id BIGINT NOT NULL,
    to_shift_id BIGINT,
    requested_by_id BIGINT NOT NULL REFERENCES users(id),
    requested_to_id BIGINT REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    responded_at TIMESTAMP
);

-- Смены
CREATE TABLE shifts (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES users(id),
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    shift_type VARCHAR(50),
    comment TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    template_id BIGINT REFERENCES shift_templates(id),
    swap_request_id BIGINT REFERENCES shift_swap_requests(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    published_at TIMESTAMP,
    locked_at TIMESTAMP
);

CREATE INDEX idx_shifts_employee ON shifts(employee_id);
CREATE INDEX idx_shifts_restaurant ON shifts(restaurant_id);
CREATE INDEX idx_shifts_status ON shifts(status);
CREATE INDEX idx_shifts_time ON shifts(start_time, end_time);
CREATE INDEX idx_shifts_template ON shifts(template_id);

-- Добавляем внешние ключи для shift_swap_requests после создания таблицы shifts
ALTER TABLE shift_swap_requests 
    ADD CONSTRAINT fk_swap_from_shift FOREIGN KEY (from_shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_swap_to_shift FOREIGN KEY (to_shift_id) REFERENCES shifts(id) ON DELETE SET NULL;




