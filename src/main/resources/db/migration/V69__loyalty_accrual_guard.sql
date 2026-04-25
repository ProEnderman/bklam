-- Add status and updated_at for exactly-once guard (process first, then mark PROCESSED).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loyalty_order_accruals' AND column_name = 'status') THEN
    ALTER TABLE loyalty_order_accruals ADD COLUMN status TEXT NOT NULL DEFAULT 'IN_PROGRESS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'loyalty_order_accruals' AND column_name = 'updated_at') THEN
    ALTER TABLE loyalty_order_accruals ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END$$;

-- Backfill existing rows as PROCESSED
UPDATE loyalty_order_accruals SET status = 'PROCESSED', updated_at = now() WHERE status = 'IN_PROGRESS' OR status IS NULL;
