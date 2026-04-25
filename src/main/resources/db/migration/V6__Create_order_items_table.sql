CREATE TABLE order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    dish_id BIGINT NOT NULL REFERENCES dishes(id),
    qty INTEGER NOT NULL CHECK (qty >= 1),
    price_at_time NUMERIC(12,2) NOT NULL CHECK (price_at_time >= 0),
    line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_dish_id ON order_items(dish_id);

