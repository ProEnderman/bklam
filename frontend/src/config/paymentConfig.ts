/**
 * Онлайн-оплата через Telegram (QR / банковский бот).
 * По умолчанию выключена (проблемы с MTProto на VPS в РФ).
 * Включить: VITE_TELEGRAM_ONLINE_PAYMENT_ENABLED=true при сборке фронта.
 */
export const TELEGRAM_ONLINE_PAYMENT_ENABLED =
  import.meta.env.VITE_TELEGRAM_ONLINE_PAYMENT_ENABLED === 'true' ||
  import.meta.env.VITE_TELEGRAM_ONLINE_PAYMENT_ENABLED === '1'

/** Сообщение при наведении / попытке онлайн-оплаты, когда TG отключён. */
export const TELEGRAM_ONLINE_PAYMENT_DISABLED_MESSAGE =
  'Оплата через Telegram временно не работает из-за проблем с серверами.'
