-- Таблица для хранения кодов подтверждения по email
CREATE TABLE verification_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(6) NOT NULL,
    email VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_verification_codes_user_id ON verification_codes(user_id);
CREATE INDEX idx_verification_codes_code ON verification_codes(code);
CREATE INDEX idx_verification_codes_expires_at ON verification_codes(expires_at);

-- Уникальный индекс для неиспользованных кодов одного пользователя
CREATE UNIQUE INDEX idx_verification_codes_user_code_active 
ON verification_codes(user_id, code) 
WHERE used = FALSE;

