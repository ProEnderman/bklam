-- Заказы по бронированиям (группа бронирований одного клиента).
-- При удалении заказа бронирования не отменяются — у них обнуляется ссылка на заказ.
CREATE TABLE booking_orders (
    id BIGSERIAL PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    customer_name VARCHAR(255),
    customer_phone VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    created_by VARCHAR(255)
);

CREATE INDEX idx_booking_orders_branch ON booking_orders(branch_id);

-- Ссылка с бронирования на заказ. ON DELETE SET NULL — при удалении заказа бронирования остаются.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_order_id BIGINT REFERENCES booking_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_booking_order ON bookings(booking_order_id);

-- RLS для booking_orders (как у bookings по branch_id)
ALTER TABLE booking_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_booking_orders ON booking_orders;
CREATE POLICY tenant_isolation_booking_orders ON booking_orders
  USING (branch_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint)
  WITH CHECK (branch_id = NULLIF(current_setting('app.current_restaurant_id', true), '')::bigint);
ALTER TABLE booking_orders FORCE ROW LEVEL SECURITY;
