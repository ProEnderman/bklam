-- =============================================================================
-- Stage 1: Multi-tenant hierarchy — new tables and data (backward compatible)
-- holding → brand → legal_entity → location (ex restaurant) → warehouse
-- Does NOT drop or rename restaurants / users.restaurant_id.
-- =============================================================================

-- 1) Holdings
CREATE TABLE holdings (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_holdings_name ON holdings(name);

-- 2) Brands (belong to holding)
CREATE TABLE brands (
    id BIGSERIAL PRIMARY KEY,
    holding_id BIGINT NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_brands_holding_id ON brands(holding_id);

-- 3) Legal entities (belong to holding)
CREATE TABLE legal_entities (
    id BIGSERIAL PRIMARY KEY,
    holding_id BIGINT NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    inn VARCHAR(32),
    kpp VARCHAR(32),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_legal_entities_holding_id ON legal_entities(holding_id);

-- 4) Locations (points; former restaurant concept)
CREATE TABLE locations (
    id BIGSERIAL PRIMARY KEY,
    holding_id BIGINT NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
    brand_id BIGINT REFERENCES brands(id) ON DELETE SET NULL,
    legal_entity_id BIGINT REFERENCES legal_entities(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    legacy_restaurant_id BIGINT UNIQUE REFERENCES restaurants(id) ON DELETE SET NULL,
    qr_token_expires_at TIMESTAMP,
    telegram_bot_token VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_locations_legacy_restaurant_id ON locations(legacy_restaurant_id) WHERE legacy_restaurant_id IS NOT NULL;
CREATE INDEX idx_locations_holding_id ON locations(holding_id);
CREATE INDEX idx_locations_brand_id ON locations(brand_id);
CREATE INDEX idx_locations_legal_entity_id ON locations(legal_entity_id);

COMMENT ON COLUMN locations.legacy_restaurant_id IS 'Mapping to restaurants.id for backward compatibility during migration';

-- 5) Warehouses / production units (per location)
CREATE TABLE warehouses (
    id BIGSERIAL PRIMARY KEY,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'WAREHOUSE' CHECK (type IN ('WAREHOUSE', 'KITCHEN', 'SHOPFLOOR')),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_warehouses_location_id ON warehouses(location_id);

-- 6) Default holding (single tenant / legacy mode)
INSERT INTO holdings (id, name, created_at, updated_at)
VALUES (1, 'Default Holding', now(), now())
ON CONFLICT (id) DO NOTHING;

-- Ensure sequence does not clash with explicit id (if we ever insert more holdings)
SELECT setval('holdings_id_seq', (SELECT coalesce(max(id), 1) FROM holdings));

-- 7) Create one location per existing restaurant
INSERT INTO locations (holding_id, name, legacy_restaurant_id, qr_token_expires_at, telegram_bot_token, created_at, updated_at)
SELECT
    1,
    r.name,
    r.id,
    r.qr_token_expires_at,
    r.telegram_bot_token,
    coalesce(r.created_at, now()),
    coalesce(r.updated_at, now())
FROM restaurants r
WHERE NOT EXISTS (SELECT 1 FROM locations l WHERE l.legacy_restaurant_id = r.id);

-- 8) Add location_id to users (nullable: HEAD_ADMIN has no location)
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES locations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_location_id ON users(location_id);

-- 9) Backfill users.location_id from restaurant_id via locations.legacy_restaurant_id
UPDATE users u
SET location_id = l.id
FROM locations l
WHERE l.legacy_restaurant_id = u.restaurant_id
  AND u.restaurant_id IS NOT NULL
  AND u.location_id IS NULL;

-- Do NOT add NOT NULL on users.location_id: HEAD_ADMIN has no location/restaurant.
-- Do NOT drop restaurants or users.restaurant_id in this migration.

-- Verification (run manually after migration): restaurant_count should equal location_count
-- SELECT (SELECT count(*) FROM restaurants) AS restaurant_count, (SELECT count(*) FROM locations) AS location_count;
-- SELECT (SELECT count(*) FROM users WHERE restaurant_id IS NOT NULL) AS users_with_restaurant, (SELECT count(*) FROM users WHERE location_id IS NOT NULL) AS users_with_location;
