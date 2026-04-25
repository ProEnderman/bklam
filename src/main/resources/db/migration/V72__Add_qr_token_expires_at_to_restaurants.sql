-- Срок действия QR-токена меню для ресторана (управляется вручную)
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS qr_token_expires_at TIMESTAMP;

COMMENT ON COLUMN restaurants.qr_token_expires_at IS 'Дата и время истечения токена для QR-меню; NULL = использовать значение по умолчанию при генерации';
