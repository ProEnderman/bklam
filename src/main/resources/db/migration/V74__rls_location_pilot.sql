-- RLS pilot: add location_id to orders and dual policy (location_id OR restaurant_id).
-- Does not remove restaurant_id; both session variables can be set for transition.
-- Runs only when table "orders" exists (skips if DB was baselined at 73 without full schema).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
    -- 1) Add location_id to orders (nullable)
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES locations(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_orders_location_id ON orders(location_id);

    -- 2) Backfill location_id from restaurant_id via locations.legacy_restaurant_id
    UPDATE orders o
    SET location_id = l.id
    FROM locations l
    WHERE l.legacy_restaurant_id = o.restaurant_id
      AND o.restaurant_id IS NOT NULL
      AND o.location_id IS NULL;

    -- 3) Replace orders RLS policy: allow row if EITHER location_id OR restaurant_id matches session
    DROP POLICY IF EXISTS tenant_isolation_orders ON orders;
    CREATE POLICY tenant_isolation_orders ON orders
      USING (
        (NULLIF(current_setting('app.location_id', true), '')::bigint IS NOT NULL AND location_id = NULLIF(current_setting('app.location_id', true), '')::bigint)
        OR
        (NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint IS NOT NULL AND restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
      )
      WITH CHECK (
        (NULLIF(current_setting('app.location_id', true), '')::bigint IS NOT NULL AND location_id = NULLIF(current_setting('app.location_id', true), '')::bigint)
        OR
        (NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint IS NOT NULL AND restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
      );

    COMMENT ON COLUMN orders.location_id IS 'Tenant location (new hierarchy); RLS uses this or restaurant_id during transition';
  END IF;
END $$;
