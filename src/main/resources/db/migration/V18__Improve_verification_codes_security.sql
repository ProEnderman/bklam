-- Улучшение безопасности verification_codes: хеширование кодов и добавление challenge_id
-- Удаляем старые индексы
DROP INDEX IF EXISTS idx_verification_codes_code;
DROP INDEX IF EXISTS idx_verification_codes_user_code_active;

-- Добавляем новые поля (сначала как nullable для существующих данных)
ALTER TABLE verification_codes 
    ADD COLUMN challenge_id VARCHAR(255),
    ADD COLUMN code_hash VARCHAR(255),
    ADD COLUMN attempts_left INTEGER DEFAULT 5,
    ADD COLUMN last_sent_at TIMESTAMP,
    ADD COLUMN send_count INTEGER DEFAULT 1;

-- Удаляем старые записи без кодов (они уже истекли или использованы)
-- Это безопасно, так как коды одноразовые и имеют короткое время жизни
DELETE FROM verification_codes WHERE code IS NULL OR used = TRUE OR expires_at < now();

-- Удаляем старое поле code (после очистки данных)
ALTER TABLE verification_codes DROP COLUMN code;

-- Теперь делаем code_hash NOT NULL (после удаления старых данных)
ALTER TABLE verification_codes 
    ALTER COLUMN code_hash SET NOT NULL,
    ALTER COLUMN attempts_left SET NOT NULL,
    ALTER COLUMN attempts_left SET DEFAULT 5,
    ALTER COLUMN send_count SET NOT NULL,
    ALTER COLUMN send_count SET DEFAULT 1;

-- Создаем UNIQUE constraint на challenge_id (NULL значения не учитываются в UNIQUE)
CREATE UNIQUE INDEX idx_verification_codes_challenge_id_unique 
ON verification_codes(challenge_id) 
WHERE challenge_id IS NOT NULL;

-- Переименовываем code_hash в code_hash (если нужно, но уже добавили)
-- Теперь code_hash будет использоваться вместо code

-- Создаем новые индексы
CREATE INDEX idx_verification_codes_challenge_id ON verification_codes(challenge_id);
CREATE INDEX idx_verification_codes_code_hash ON verification_codes(code_hash);
CREATE INDEX idx_verification_codes_last_sent_at ON verification_codes(last_sent_at);

-- Уникальный индекс для активных challenge одного пользователя
-- Примечание: expires_at > now() нельзя использовать в индексе (now() не IMMUTABLE)
-- Поэтому проверяем только used = FALSE, а проверку expires_at делаем в коде
CREATE UNIQUE INDEX idx_verification_codes_user_challenge_active 
ON verification_codes(user_id, challenge_id) 
WHERE used = FALSE;

