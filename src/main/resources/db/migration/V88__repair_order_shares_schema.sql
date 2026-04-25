-- Idempotent repair for split-bill / order_shares schema drift (partial migrations, restored DBs).
-- Safe to re-run: uses IF EXISTS / IF NOT EXISTS guards only; no DROP of user data.
--
-- Why a separate migration instead of editing V82:
-- - Flyway stores a checksum per migration version; changing an already-applied file causes
--   validate-on-migrate failures unless every database runs `flyway repair`.
-- - Adding V88 preserves checksum stability for V82 while giving drifted databases a forward path.
--
-- If V82 failed earlier because prerequisite tables were missing, fix prerequisites out-of-band
-- or rely on this script once orders + order_items exist.

-- V55-equivalent bootstrap + V62-equivalent qty/index adjustments (idempotent)
DO $$
BEGIN
    IF to_regclass('public.order_shares') IS NULL THEN
        IF to_regclass('public.orders') IS NOT NULL AND to_regclass('public.order_items') IS NOT NULL THEN
            CREATE TABLE IF NOT EXISTS order_shares (
                id          BIGSERIAL       PRIMARY KEY,
                order_id    BIGINT          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                name        VARCHAR(64)     NOT NULL,
                created_at  TIMESTAMP       NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_order_shares_order_id ON order_shares(order_id);

            CREATE TABLE IF NOT EXISTS order_share_items (
                share_id        BIGINT NOT NULL REFERENCES order_shares(id) ON DELETE CASCADE,
                order_item_id   BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
                PRIMARY KEY (share_id, order_item_id)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_order_share_items_order_item_id ON order_share_items(order_item_id);

            ALTER TABLE order_share_items
                ADD COLUMN IF NOT EXISTS qty INT NOT NULL DEFAULT 1;
            UPDATE order_share_items osi
            SET qty = oi.qty
            FROM order_items oi
            WHERE oi.id = osi.order_item_id;
            DROP INDEX IF EXISTS uq_order_share_items_order_item_id;
        END IF;
    ELSE
        IF to_regclass('public.order_share_items') IS NOT NULL THEN
            ALTER TABLE order_share_items
                ADD COLUMN IF NOT EXISTS qty INT NOT NULL DEFAULT 1;
            UPDATE order_share_items osi
            SET qty = oi.qty
            FROM order_items oi
            WHERE oi.id = osi.order_item_id;
            DROP INDEX IF EXISTS uq_order_share_items_order_item_id;
        END IF;
    END IF;
END $$;

-- guest_id column + FK + index (idempotent)
DO $$
BEGIN
    IF to_regclass('public.order_shares') IS NOT NULL THEN
        ALTER TABLE order_shares
            ADD COLUMN IF NOT EXISTS guest_id BIGINT NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.order_shares') IS NOT NULL
       AND to_regclass('public.loyalty_guests') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_constraint
           WHERE conname = 'order_shares_guest_id_fkey'
             AND conrelid = 'public.order_shares'::regclass
       ) THEN
        ALTER TABLE order_shares
            ADD CONSTRAINT order_shares_guest_id_fkey
            FOREIGN KEY (guest_id) REFERENCES loyalty_guests (id);
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.order_shares') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS idx_order_shares_guest_id ON order_shares (guest_id);
    END IF;
END $$;
