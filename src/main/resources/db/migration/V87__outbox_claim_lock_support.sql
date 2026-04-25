-- Adds columns to support safe multi-consumer claim-lock semantics for outbox_events.
-- Introduces PROCESSING status between NEW/RETRY and DONE/DEAD.

ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claimed_by  VARCHAR(128);
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claimed_at  TIMESTAMPTZ;

-- Partial index for fast recovery of events stuck in PROCESSING
CREATE INDEX IF NOT EXISTS idx_outbox_processing_claimed
    ON outbox_events (claimed_at)
    WHERE status = 'PROCESSING';
