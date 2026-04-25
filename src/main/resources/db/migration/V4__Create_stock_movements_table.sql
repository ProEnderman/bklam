CREATE TABLE stock_movements (
    id BIGSERIAL PRIMARY KEY,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL CHECK (type IN ('IN', 'OUT')),
    qty NUMERIC(12,3) NOT NULL CHECK (qty > 0),
    reason VARCHAR(20) NOT NULL CHECK (reason IN ('PURCHASE', 'SALE', 'SPOILAGE', 'EXPIRED', 'INVENTORY', 'OTHER')),
    order_id BIGINT,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    note VARCHAR(255) NULL
);

CREATE INDEX idx_stock_movements_ingredient_id ON stock_movements(ingredient_id);
CREATE INDEX idx_stock_movements_type ON stock_movements(type);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at);
CREATE INDEX idx_stock_movements_order_id ON stock_movements(order_id);

