ALTER TABLE restaurants
    ADD COLUMN IF NOT EXISTS telegram_bot_token VARCHAR(255);

