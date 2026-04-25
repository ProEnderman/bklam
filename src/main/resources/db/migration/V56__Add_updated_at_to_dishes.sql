-- Add updated_at to dishes for menu ETag computation.
ALTER TABLE dishes ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- Backfill: set updated_at = created_at for existing rows.
UPDATE dishes SET updated_at = created_at;

-- Index for efficient MAX(updated_at) per restaurant.
CREATE INDEX idx_dishes_restaurant_updated ON dishes(restaurant_id, updated_at DESC);
CREATE INDEX idx_dish_categories_restaurant_updated ON dish_categories(restaurant_id, updated_at DESC);
