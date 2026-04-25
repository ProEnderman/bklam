ALTER TABLE orders
    ADD COLUMN guest_id BIGINT REFERENCES loyalty_guests(id);

CREATE INDEX idx_orders_guest_id ON orders (guest_id);
