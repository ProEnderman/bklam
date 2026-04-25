-- Add paid_via: 'ONLINE' = paid via link, 'CASH' = paid in cash (table created in V63)
ALTER TABLE order_payment_marks ADD COLUMN IF NOT EXISTS paid_via VARCHAR(20) DEFAULT 'ONLINE';
