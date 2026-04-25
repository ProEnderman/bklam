import client from './client'

// Используем основной API клиент, который уже настроен с cookies и авторизацией
// Запросы будут проксироваться через Java backend на /api/telegram-payment
const telegramPaymentClient = client

export default telegramPaymentClient
