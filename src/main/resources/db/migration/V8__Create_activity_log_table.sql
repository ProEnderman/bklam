CREATE TABLE activity_log (
    id BIGSERIAL PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id BIGINT,
    user_name VARCHAR(255),
    description TEXT,
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_log_action_type ON activity_log(action_type);
CREATE INDEX idx_activity_log_entity_type ON activity_log(entity_type);
CREATE INDEX idx_activity_log_entity_id ON activity_log(entity_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at);
CREATE INDEX idx_activity_log_user_name ON activity_log(user_name);

