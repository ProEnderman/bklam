CREATE TABLE ingredients (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(10) NOT NULL CHECK (unit IN ('G', 'ML', 'PCS')),
    stock_qty NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    min_qty NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (min_qty >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_ingredients_name ON ingredients(name);
CREATE INDEX idx_ingredients_stock_qty ON ingredients(stock_qty);

