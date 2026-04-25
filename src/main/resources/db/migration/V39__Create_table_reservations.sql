-- Бронирования столиков ресторана
CREATE TABLE IF NOT EXISTS table_reservations (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id BIGINT NOT NULL REFERENCES hall_tables(id) ON DELETE CASCADE,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),
    guests_count INTEGER NOT NULL DEFAULT 1,
    start_at TIMESTAMP NOT NULL,
    end_at TIMESTAMP NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED', -- CONFIRMED | CANCELLED | COMPLETED | NO_SHOW
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_table_reservations_restaurant ON table_reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_table_reservations_table ON table_reservations(table_id);
CREATE INDEX IF NOT EXISTS idx_table_reservations_status ON table_reservations(status);
CREATE INDEX IF NOT EXISTS idx_table_reservations_start_at ON table_reservations(start_at);
CREATE INDEX IF NOT EXISTS idx_table_reservations_end_at ON table_reservations(end_at);

-- Составной индекс для быстрой проверки пересечений
CREATE INDEX IF NOT EXISTS idx_table_reservations_overlap_check
    ON table_reservations(restaurant_id, table_id, status, start_at, end_at)
    WHERE status IN ('CONFIRMED');
