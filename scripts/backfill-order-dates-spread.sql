-- Spread CLOSED order timestamps over the last 180 days (demo fix after seed bug).
-- RLS: bklam_app sees/updates orders only when tenant session is set (same as the app).
-- Edit restaurant_id below if needed, then:
--   export PGPASSWORD='...'
--   psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
--     -f ~/COURSE_PROJECT/scripts/backfill-order-dates-spread.sql

\set restaurant_id 2
SET app.current_restaurant_id = :'restaurant_id';

SELECT count(*) AS closed_orders_visible
FROM orders
WHERE restaurant_id = :restaurant_id
  AND status = 'CLOSED';

-- Service hours: 12:00–00:00 (created_at only in this window; close/pay may spill slightly past midnight).
UPDATE orders o
SET
  created_at = ts.created_at,
  closed_at = LEAST(
    ts.created_at + (INTERVAL '15 minutes' + (random() * INTERVAL '150 minutes')),
    date_trunc('day', ts.created_at) + INTERVAL '1 day' + INTERVAL '30 minutes'
  ),
  paid_at = LEAST(
    ts.created_at + (INTERVAL '30 minutes' + (random() * INTERVAL '180 minutes')),
    date_trunc('day', ts.created_at) + INTERVAL '1 day' + INTERVAL '45 minutes'
  )
FROM (
  SELECT
    id,
    (CURRENT_DATE - (floor(random() * 180))::int)::timestamp
      + INTERVAL '12 hours'
      + (random() * INTERVAL '12 hours') AS created_at
  FROM orders
  WHERE restaurant_id = :restaurant_id
    AND status = 'CLOSED'
) ts
WHERE o.id = ts.id;
