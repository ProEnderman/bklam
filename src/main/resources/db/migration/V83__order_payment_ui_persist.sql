-- Раскладка «кто какой счёт оплачивает» при кастомном split + привязка Telegram PR к стабильному ключу слота
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_account_payer_json VARCHAR(2000);

ALTER TABLE order_payment_marks ADD COLUMN IF NOT EXISTS telegram_payment_request_id VARCHAR(255);
