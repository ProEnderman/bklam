-- Force RLS on critical tables so table owner cannot bypass policies.
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE ingredients FORCE ROW LEVEL SECURITY;
ALTER TABLE dishes FORCE ROW LEVEL SECURITY;
ALTER TABLE loyalty_guests FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;

-- loyalty_order_accruals: enable RLS + policy then force
ALTER TABLE loyalty_order_accruals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_loyalty_order_accruals ON loyalty_order_accruals;
CREATE POLICY tenant_isolation_loyalty_order_accruals ON loyalty_order_accruals
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);
ALTER TABLE loyalty_order_accruals FORCE ROW LEVEL SECURITY;
