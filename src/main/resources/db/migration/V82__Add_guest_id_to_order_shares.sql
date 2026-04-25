-- Add optional loyalty guest id to split-bill shares (nullable FK to loyalty_guests).
-- Historical migration: keep this file stable — drift repair lives in V88.

ALTER TABLE order_shares ADD COLUMN guest_id BIGINT NULL;

ALTER TABLE order_shares
    ADD CONSTRAINT order_shares_guest_id_fkey
    FOREIGN KEY (guest_id) REFERENCES loyalty_guests (id);

CREATE INDEX idx_order_shares_guest_id ON order_shares (guest_id);
