CREATE TABLE telegram_sessions (
    id                  BIGSERIAL       PRIMARY KEY,
    telegram_user_id    BIGINT          NOT NULL UNIQUE,
    restaurant_id       BIGINT          NOT NULL REFERENCES restaurants(id),
    last_order_id       BIGINT          REFERENCES orders(id) ON DELETE SET NULL,
    created_at          TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_telegram_sessions_restaurant ON telegram_sessions(restaurant_id);
