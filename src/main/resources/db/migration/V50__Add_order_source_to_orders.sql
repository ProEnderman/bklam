ALTER TABLE orders
    ADD COLUMN order_source VARCHAR(20) DEFAULT 'POS';

CREATE INDEX idx_orders_source ON orders (order_source);
