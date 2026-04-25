-- Portfolio demo: one category and two dishes for "Test Restaurant" (seeded in V13).
-- Idempotent; safe to re-apply. Used for GET /api/dishes smoke tests on a clean dev DB.

INSERT INTO dish_categories (name, restaurant_id, created_at, updated_at)
SELECT 'Demo', r.id, now(), now()
FROM restaurants r
WHERE r.name = 'Test Restaurant'
  AND NOT EXISTS (
      SELECT 1 FROM dish_categories dc
      WHERE dc.restaurant_id = r.id AND dc.name = 'Demo'
  );

INSERT INTO dishes (name, price, is_active, restaurant_id, category_id, created_at, updated_at)
SELECT 'Demo Burger', 9.90, true, r.id, dc.id, now(), now()
FROM restaurants r
JOIN dish_categories dc ON dc.restaurant_id = r.id AND dc.name = 'Demo'
WHERE r.name = 'Test Restaurant'
  AND NOT EXISTS (
      SELECT 1 FROM dishes d
      WHERE d.restaurant_id = r.id AND d.name = 'Demo Burger' AND d.is_active = true
  );

INSERT INTO dishes (name, price, is_active, restaurant_id, category_id, created_at, updated_at)
SELECT 'Demo Soup', 4.50, true, r.id, dc.id, now(), now()
FROM restaurants r
JOIN dish_categories dc ON dc.restaurant_id = r.id AND dc.name = 'Demo'
WHERE r.name = 'Test Restaurant'
  AND NOT EXISTS (
      SELECT 1 FROM dishes d
      WHERE d.restaurant_id = r.id AND d.name = 'Demo Soup' AND d.is_active = true
  );
