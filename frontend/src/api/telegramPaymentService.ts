import telegramPaymentClient from './telegramPaymentClient'

// Все запросы проксируются через Java backend на /api/telegram-payment
// Java backend добавляет JWT токен и проксирует запросы к NestJS

export interface PaymentRequest {
  id: string
  invoiceId: string
  status: 'CREATED' | 'SENT' | 'LINK_RECEIVED' | 'TIMEOUT' | 'UNPARSABLE' | 'SESSION_INVALID' | 'RATE_LIMITED' | 'CANCELLED'
  createdAt: string
  errorCode?: string | null
  errorMessage?: string | null
  paymentLink?: {
    urlHash: string
    expiresAt?: string | null
    createdAt: string
  } | null
}

export interface CreatePaymentRequestDto {
  invoiceId: string
  /** Сумма к оплате; если не указана — берётся полная сумма заказа/бронирований */
  amount?: number
  /** Подпись для счёта (например "Заказ 123 - Гость 1") */
  orderNumber?: string
}

export const telegramPaymentService = {
  /**
   * Создать запрос на платежную ссылку.
   * amount и orderNumber опциональны: для доли счёта передайте amount и подпись.
   */
  async createPaymentRequest(invoiceId: string, amount?: number, orderNumber?: string): Promise<PaymentRequest> {
    const body: CreatePaymentRequestDto = { invoiceId }
    if (amount != null && amount >= 0) body.amount = amount
    if (orderNumber != null && orderNumber !== '') body.orderNumber = orderNumber
    const response = await telegramPaymentClient.post<PaymentRequest>('/telegram-payment/payment_requests', body)
    return response.data
  },

  /**
   * Получить статус payment request
   */
  async getPaymentRequest(id: string): Promise<PaymentRequest> {
    const response = await telegramPaymentClient.get<PaymentRequest>(`/telegram-payment/payment_requests/${id}`)
    return response.data
  },

  /**
   * Получить QR-код (возвращает blob для изображения)
   */
  async getQrCode(id: string): Promise<Blob> {
    const response = await telegramPaymentClient.get(`/telegram-payment/payment_requests/${id}/qr`, {
      responseType: 'blob',
    })
    return response.data
  },

  /**
   * Отменить payment request
   */
  async cancelPaymentRequest(id: string): Promise<PaymentRequest> {
    const response = await telegramPaymentClient.post<PaymentRequest>(`/telegram-payment/payment_requests/${id}/cancel`)
    return response.data
  },

  /**
   * Обновить payment request (повторить запрос)
   */
  async refreshPaymentRequest(id: string): Promise<PaymentRequest> {
    const response = await telegramPaymentClient.post<PaymentRequest>(`/telegram-payment/payment_requests/${id}/refresh`)
    return response.data
  },

  /**
   * Получить fallback URL для ручного ввода
   */
  async getFallbackUrl(id: string): Promise<{
    fallbackUrl: string
    message: string
    instructions: string
  }> {
    const response = await telegramPaymentClient.get(`/telegram-payment/payment_requests/${id}/fallback`)
    return response.data
  },

  /**
   * Ввести URL вручную (fallback)
   */
  async submitManualUrl(id: string, url: string): Promise<PaymentRequest> {
    const response = await telegramPaymentClient.post<PaymentRequest>(`/telegram-payment/payment_requests/${id}/manual-url`, {
      url,
    })
    return response.data
  },

  // ============================================
  // MTProto - Привязка Telegram аккаунта
  // ============================================

  /**
   * Отправить код на номер телефона
   */
  async sendCode(phone: string): Promise<{
    phoneCodeHash: string
    codeType: string
    timeout: number
  }> {
    const response = await telegramPaymentClient.post('/telegram-payment/telegram/mtproto/sendCode', {
      phone,
    })
    return response.data
  },

  /**
   * Подтвердить код
   */
  async confirmCode(phone: string, phoneCodeHash: string, code: string): Promise<{
    success: boolean
    requires2FA: boolean
  }> {
    const response = await telegramPaymentClient.post('/telegram-payment/telegram/mtproto/confirmCode', {
      phone,
      phoneCodeHash,
      code,
    })
    return response.data
  },

  /**
   * Подтвердить 2FA пароль
   */
  async confirmPassword(phone: string, password: string): Promise<{
    success: boolean
    sessionLinked: boolean
  }> {
    const response = await telegramPaymentClient.post('/telegram-payment/telegram/mtproto/confirmPassword', {
      phone,
      password,
    })
    return response.data
  },

  /**
   * Проверить статус привязки Telegram
   */
  async getTelegramStatus(): Promise<{
    linked: boolean
    hasActiveSession: boolean
    telegramUsername?: string
    bankBotUsername?: string | null
  }> {
    const response = await telegramPaymentClient.get('/telegram-payment/telegram/status')
    return response.data
  },

  /**
   * Получить настройки Telegram (bankBotUsername)
   */
  async getSettings(): Promise<{
    bankBotUsername: string | null
  }> {
    const response = await telegramPaymentClient.get('/telegram-payment/telegram/settings')
    return response.data
  },

  /**
   * Сохранить bank bot username
   */
  async updateSettings(bankBotUsername: string): Promise<{
    bankBotUsername: string
  }> {
    const response = await telegramPaymentClient.post('/telegram-payment/telegram/settings', {
      bankBotUsername,
    })
    return response.data
  },
}
