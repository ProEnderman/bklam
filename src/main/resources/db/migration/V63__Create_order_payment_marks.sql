-- Отметки оплаты по каждому слоту (QR/ссылка): заказ может быть частично оплачен
CREATE TABLE IF NOT EXISTS order_payment_marks (
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_request_id VARCHAR(255) NOT NULL,
    marked_at TIMESTAMP,
    PRIMARY KEY (order_id, payment_request_id)
);

CREATE INDEX IF NOT EXISTS idx_order_payment_marks_order_id ON order_payment_marks(order_id);
