CREATE TABLE outbox_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type   TEXT NOT NULL,
    aggregate_id     BIGINT NOT NULL,
    event_type       TEXT NOT NULL,
    payload          JSONB NOT NULL,
    status           TEXT NOT NULL DEFAULT 'NEW',
    attempts         INT NOT NULL DEFAULT 0,
    next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error       TEXT
);

CREATE INDEX idx_outbox_next_attempt ON outbox_events (status, next_attempt_at)
    WHERE status IN ('NEW', 'RETRY');

COMMENT ON TABLE outbox_events IS 'Domain events for reliable async processing (e.g. loyalty bonus accrual)';
