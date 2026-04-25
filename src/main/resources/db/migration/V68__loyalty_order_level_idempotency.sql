-- Exactly-once at order level: one accrual per (restaurant_id, order_id).
CREATE TABLE IF NOT EXISTS loyalty_order_accruals (
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id),
    order_id      BIGINT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (restaurant_id, order_id)
);

CREATE INDEX idx_loyalty_order_accruals_created ON loyalty_order_accruals(created_at);
