-- Order list: WHERE restaurant_id = ? AND created_at between ... ORDER BY created_at DESC, id DESC
-- (see OrderRepositoryCustomImpl findOrderIdsPageOrdered). Complements single-column idx from V5/V12.
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_created_at ON orders (restaurant_id, created_at DESC);
