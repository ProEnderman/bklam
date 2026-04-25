-- Карта зала (grid) + зоны + размещённые объекты + справочник столов
-- MVP: зоны как прямоугольники (x,y,w,h в клетках)

-- Hall map (одна карта на ресторан, но поддерживаем несколько на будущее)
CREATE TABLE IF NOT EXISTS hall_maps (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL DEFAULT 'Main map',
    grid_width INT NOT NULL,
    grid_height INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hall_maps_restaurant ON hall_maps(restaurant_id);

-- Assets (спрайты, которые админ загружает)
CREATE TABLE IF NOT EXISTS hall_assets (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL, -- TABLE | DECOR
    image_url VARCHAR(500),
    width_cells INT NOT NULL DEFAULT 1,
    height_cells INT NOT NULL DEFAULT 1,
    default_capacity INT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hall_assets_restaurant ON hall_assets(restaurant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hall_assets_restaurant_name ON hall_assets(restaurant_id, name);

-- Tables (централизованно: вместимость, номер/лейбл)
CREATE TABLE IF NOT EXISTS hall_tables (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL,
    capacity INT NOT NULL DEFAULT 2,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hall_tables_restaurant ON hall_tables(restaurant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hall_tables_restaurant_label ON hall_tables(restaurant_id, label);

-- Zones (залы)
CREATE TABLE IF NOT EXISTS hall_zones (
    id BIGSERIAL PRIMARY KEY,
    hall_map_id BIGINT NOT NULL REFERENCES hall_maps(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    x INT NOT NULL,
    y INT NOT NULL,
    w INT NOT NULL,
    h INT NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#4f46e5',
    active_for_waiter BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hall_zones_map ON hall_zones(hall_map_id);

-- Placed items (объекты на карте)
CREATE TABLE IF NOT EXISTS hall_placed_items (
    id BIGSERIAL PRIMARY KEY,
    hall_map_id BIGINT NOT NULL REFERENCES hall_maps(id) ON DELETE CASCADE,
    asset_id BIGINT REFERENCES hall_assets(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL, -- TABLE | DECOR
    x INT NOT NULL,
    y INT NOT NULL,
    w INT NOT NULL DEFAULT 1,
    h INT NOT NULL DEFAULT 1,
    rotation INT NOT NULL DEFAULT 0, -- 0/90/180/270
    layer INT NOT NULL DEFAULT 0,
    table_id BIGINT REFERENCES hall_tables(id) ON DELETE SET NULL,
    locked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hall_items_map ON hall_placed_items(hall_map_id);
CREATE INDEX IF NOT EXISTS idx_hall_items_table ON hall_placed_items(table_id);

-- Связь заказа со столом (опционально)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS table_id BIGINT REFERENCES hall_tables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);



