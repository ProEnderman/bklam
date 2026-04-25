CREATE TABLE guest_sessions (
    id             BIGSERIAL PRIMARY KEY,
    session_token  VARCHAR(64)  NOT NULL,
    restaurant_id  BIGINT       NOT NULL REFERENCES restaurants(id),
    table_id       BIGINT       REFERENCES hall_tables(id),
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMP    NOT NULL,
    CONSTRAINT uq_guest_session_token UNIQUE (session_token)
);

CREATE INDEX idx_guest_sessions_expires ON guest_sessions (expires_at);
CREATE INDEX idx_guest_sessions_restaurant ON guest_sessions (restaurant_id);
