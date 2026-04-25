-- Split by quantity: one order line (e.g. Caesar x2) can be split across guests (1 to guest 1, 1 to guest 2)
ALTER TABLE order_share_items
    ADD COLUMN IF NOT EXISTS qty INT NOT NULL DEFAULT 1;

-- Backfill: each existing row meant "whole item" so set qty = order_items.qty for that item
UPDATE order_share_items osi
SET qty = oi.qty
FROM order_items oi
WHERE oi.id = osi.order_item_id;

-- Allow same order_item_id in multiple shares (drop unique on order_item_id)
DROP INDEX IF EXISTS uq_order_share_items_order_item_id;
