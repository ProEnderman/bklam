-- Уведомления о бронированиях
CREATE TABLE booking_notifications (
    id              BIGSERIAL PRIMARY KEY,
    restaurant_id   BIGINT NOT NULL REFERENCES restaurants(id),
    booking_id      BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,

    -- Тип уведомления
    -- REMINDER     : за день до брони — «уточните у клиента»
    -- OVERDUE      : 20 мин после окончания — «клиент не оплатил»
    notification_type VARCHAR(20) NOT NULL,

    -- Краткое описание
    title           VARCHAR(255) NOT NULL,
    message         TEXT,

    -- Статус обработки
    -- PENDING      — ожидает реакции
    -- RESOLVED     — обработано
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',

    -- Ответ пользователя
    -- Для REMINDER : CONFIRMED / CANCELLED
    -- Для OVERDUE  : CONTINUES / PAID_OR_CANCELLED
    response        VARCHAR(30),

    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMP,
    resolved_by     VARCHAR(100)
);

CREATE INDEX idx_bn_restaurant_status ON booking_notifications(restaurant_id, status);
CREATE INDEX idx_bn_booking ON booking_notifications(booking_id);
CREATE INDEX idx_bn_created ON booking_notifications(created_at DESC);
