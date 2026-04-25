-- Enable RLS on all tenant tables (restaurant_id or branch_id).
-- NULLIF(..., '') handles unset session variable (no rows visible).

-- orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_orders ON orders;
CREATE POLICY tenant_isolation_orders ON orders
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- order_items (via parent order)
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_order_items ON order_items;
CREATE POLICY tenant_isolation_order_items ON order_items
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint))
  WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint));

-- ingredients
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_ingredients ON ingredients;
CREATE POLICY tenant_isolation_ingredients ON ingredients
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- dishes
ALTER TABLE dishes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_dishes ON dishes;
CREATE POLICY tenant_isolation_dishes ON dishes
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- loyalty_guests
ALTER TABLE loyalty_guests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_loyalty_guests ON loyalty_guests;
CREATE POLICY tenant_isolation_loyalty_guests ON loyalty_guests
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- dish_categories
ALTER TABLE dish_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_dish_categories ON dish_categories;
CREATE POLICY tenant_isolation_dish_categories ON dish_categories
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- guest_sessions
ALTER TABLE guest_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_guest_sessions ON guest_sessions;
CREATE POLICY tenant_isolation_guest_sessions ON guest_sessions
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- telegram_sessions
ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_telegram_sessions ON telegram_sessions;
CREATE POLICY tenant_isolation_telegram_sessions ON telegram_sessions
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- table_reservations
ALTER TABLE table_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_table_reservations ON table_reservations;
CREATE POLICY tenant_isolation_table_reservations ON table_reservations
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- booking_notifications
ALTER TABLE booking_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_booking_notifications ON booking_notifications;
CREATE POLICY tenant_isolation_booking_notifications ON booking_notifications
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- hall_maps
ALTER TABLE hall_maps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_hall_maps ON hall_maps;
CREATE POLICY tenant_isolation_hall_maps ON hall_maps
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- hall_assets
ALTER TABLE hall_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_hall_assets ON hall_assets;
CREATE POLICY tenant_isolation_hall_assets ON hall_assets
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- hall_tables
ALTER TABLE hall_tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_hall_tables ON hall_tables;
CREATE POLICY tenant_isolation_hall_tables ON hall_tables
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- shift_templates
ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_shift_templates ON shift_templates;
CREATE POLICY tenant_isolation_shift_templates ON shift_templates
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- shifts
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_shifts ON shifts;
CREATE POLICY tenant_isolation_shifts ON shifts
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- tariff_plans
ALTER TABLE tariff_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tariff_plans ON tariff_plans;
CREATE POLICY tenant_isolation_tariff_plans ON tariff_plans
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- tariff_calendars
ALTER TABLE tariff_calendars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tariff_calendars ON tariff_calendars;
CREATE POLICY tenant_isolation_tariff_calendars ON tariff_calendars
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- pricing_runs
ALTER TABLE pricing_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_pricing_runs ON pricing_runs;
CREATE POLICY tenant_isolation_pricing_runs ON pricing_runs
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- loyalty_tiers
ALTER TABLE loyalty_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_loyalty_tiers ON loyalty_tiers;
CREATE POLICY tenant_isolation_loyalty_tiers ON loyalty_tiers
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- loyalty_campaigns
ALTER TABLE loyalty_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_loyalty_campaigns ON loyalty_campaigns;
CREATE POLICY tenant_isolation_loyalty_campaigns ON loyalty_campaigns
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- loyalty_segments
ALTER TABLE loyalty_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_loyalty_segments ON loyalty_segments;
CREATE POLICY tenant_isolation_loyalty_segments ON loyalty_segments
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- loyalty_missions
ALTER TABLE loyalty_missions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_loyalty_missions ON loyalty_missions;
CREATE POLICY tenant_isolation_loyalty_missions ON loyalty_missions
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- loyalty_achievements
ALTER TABLE loyalty_achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_loyalty_achievements ON loyalty_achievements;
CREATE POLICY tenant_isolation_loyalty_achievements ON loyalty_achievements
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- daily_branch_revenue
ALTER TABLE daily_branch_revenue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_daily_branch_revenue ON daily_branch_revenue;
CREATE POLICY tenant_isolation_daily_branch_revenue ON daily_branch_revenue
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- service_performance
ALTER TABLE service_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_service_performance ON service_performance;
CREATE POLICY tenant_isolation_service_performance ON service_performance
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- employee_utilization
ALTER TABLE employee_utilization ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_employee_utilization ON employee_utilization;
CREATE POLICY tenant_isolation_employee_utilization ON employee_utilization
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- pricing_rule_impact
ALTER TABLE pricing_rule_impact ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_pricing_rule_impact ON pricing_rule_impact;
CREATE POLICY tenant_isolation_pricing_rule_impact ON pricing_rule_impact
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- stop_check_analytics
ALTER TABLE stop_check_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_stop_check_analytics ON stop_check_analytics;
CREATE POLICY tenant_isolation_stop_check_analytics ON stop_check_analytics
  USING (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (restaurant_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- activities (branch_id)
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_activities ON activities;
CREATE POLICY tenant_isolation_activities ON activities
  USING (branch_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (branch_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- resources (branch_id)
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_resources ON resources;
CREATE POLICY tenant_isolation_resources ON resources
  USING (branch_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (branch_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);

-- bookings (branch_id)
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_bookings ON bookings;
CREATE POLICY tenant_isolation_bookings ON bookings
  USING (branch_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (branch_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);
