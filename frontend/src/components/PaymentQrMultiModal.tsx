import { useEffect, useState, useRef } from 'react'
import Modal from './Modal'
import { telegramPaymentService } from '../api/telegramPaymentService'
import {
  TELEGRAM_ONLINE_PAYMENT_DISABLED_MESSAGE,
} from '../config/paymentConfig'
import './PaymentQrModal.css'

export interface PaymentRequestSlot {
  /** null = черновой слот: запрос в банк ещё не создан, сообщение в ТГ не отправлялось */
  id: string | null
  label: string
  amount: number
  /** invoiceId для создания запроса (обязателен при id === null) */
  invoiceId?: string
}

export type PaymentMarkState = { paid: boolean; paidVia: 'ONLINE' | 'CASH' }

/** Стабильный ключ слота (invoiceId), затем id Telegram, затем старый ключ наличных. */
export function resolveMultiSlotMark(
  r: PaymentRequestSlot,
  slotIndex: number,
  orderId: number,
  paymentMarks: Record<string, PaymentMarkState>,
): PaymentMarkState | undefined {
  if (r.invoiceId && paymentMarks[r.invoiceId]) return paymentMarks[r.invoiceId]
  if (r.id && paymentMarks[r.id]) return paymentMarks[r.id]
  const legacyCash = `cash_order_${orderId}_pay_${slotIndex}`
  if (paymentMarks[legacyCash]) return paymentMarks[legacyCash]
  return undefined
}

interface PaymentQrMultiModalProps {
  isOpen: boolean
  onClose: () => void
  orderId: number
  requests: PaymentRequestSlot[]
  /** Отметки оплаты по слотам: id запроса -> { paid, paidVia } (для слотов с id) */
  paymentMarks?: Record<string, PaymentMarkState>
  /** Создать запрос в бот и ждать QR (без отметки «оплачено» в заказе). */
  onPayOnline?: (slotIndex: number) => void | Promise<void>
  /** Блокировка кнопки «Оплатить онлайн» (например глобальная отправка). */
  payOnlineBusy?: boolean
  /** false — только наличные, онлайн-кнопка с подсказкой. */
  telegramOnlineEnabled?: boolean
  /** Не оплачено / оплачено наличными / оплачено онлайн (только после появления QR). */
  onMarkPaid?: (slotIndex: number, paymentRequestId: string | null, paid: boolean, paidVia?: 'ONLINE' | 'CASH') => void
}

function QrSlot({
  id,
  label,
  amount,
  slotIndex,
  mark,
  onPayOnline,
  payOnlineBusy,
  telegramOnlineEnabled = true,
  onMarkPaid,
}: PaymentRequestSlot & {
  slotIndex: number
  mark?: PaymentMarkState
  onPayOnline?: (slotIndex: number) => void | Promise<void>
  payOnlineBusy?: boolean
  telegramOnlineEnabled?: boolean
  onMarkPaid?: (slotIndex: number, paymentRequestId: string | null, paid: boolean, paidVia?: 'ONLINE' | 'CASH') => void
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const paid = mark?.paid ?? false
  const paidVia = mark?.paidVia ?? 'ONLINE'
  const isDraft = id == null

  useEffect(() => {
    if (!id) return
    const loadQr = async () => {
      try {
        const blob = await telegramPaymentService.getQrCode(id)
        const url = URL.createObjectURL(blob)
        urlRef.current = url
        setQrUrl(url)
      } catch {
        setError('Не удалось загрузить QR')
      }
    }
    const poll = async () => {
      try {
        const pr = await telegramPaymentService.getPaymentRequest(id)
        if (pr.status === 'LINK_RECEIVED' && pr.paymentLink) {
          if (pollRef.current) clearInterval(pollRef.current)
          loadQr()
        } else if (['TIMEOUT', 'UNPARSABLE', 'SESSION_INVALID', 'RATE_LIMITED'].includes(pr.status)) {
          if (pollRef.current) clearInterval(pollRef.current)
          setError(pr.errorMessage || pr.status)
        }
      } catch {
        // continue polling
      }
    }
    poll()
    pollRef.current = setInterval(poll, 2000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [id])

  const handleMark = (paid: boolean, paidVia?: 'ONLINE' | 'CASH') => {
    onMarkPaid?.(slotIndex, id ?? null, paid, paidVia)
  }

  return (
    <div className="payment-qr-multi-slot">
      <div className="payment-qr-multi-slot-header">
        <span className="payment-qr-multi-slot-label">{label}</span>
        <span className="payment-qr-multi-slot-amount">{amount.toFixed(2)} ₽</span>
      </div>
      {isDraft && (
        <p className="payment-qr-multi-draft-hint">
          {telegramOnlineEnabled
            ? 'Сообщение в Telegram ещё не отправлено. Нажмите «Оплатить онлайн» — запрос в бот и появление QR. «Оплачено (онлайн)» — после QR. «Оплачено наличными» — без Telegram.'
            : 'Отметьте «Оплачено наличными», когда гость расплатился. Онлайн-оплата через Telegram сейчас недоступна.'}
        </p>
      )}
      {error && <p className="qr-error">{error}</p>}
      {id && qrUrl && !paid && <img src={qrUrl} alt="QR" className="qr-image qr-image-multi" />}
      {paid && (
        <p className="payment-qr-slot-paid-badge">
          {paidVia === 'CASH' ? '💵 Оплачено наличными' : '✅ Оплачено (онлайн)'}
        </p>
      )}
      {(onMarkPaid || onPayOnline) && (
        <div className="payment-qr-slot-mark payment-qr-slot-mark-three">
          <button
            type="button"
            className={!paid ? 'btn-primary btn-small' : 'btn-secondary btn-small'}
            onClick={() => handleMark(false)}
            disabled={!onMarkPaid}
          >
            Не оплачено
          </button>
          {!paid && (
            <>
              {isDraft && onPayOnline && (
                <span
                  className="payment-online-btn-wrap"
                  title={!telegramOnlineEnabled ? TELEGRAM_ONLINE_PAYMENT_DISABLED_MESSAGE : undefined}
                >
                  <button
                    type="button"
                    className="btn-primary btn-small"
                    disabled={payOnlineBusy || !telegramOnlineEnabled}
                    onClick={() => void onPayOnline(slotIndex)}
                  >
                    Оплатить онлайн
                  </button>
                </span>
              )}
              {!isDraft && id && qrUrl && onMarkPaid && (
                <button
                  type="button"
                  className="btn-primary btn-small"
                  onClick={() => handleMark(true, 'ONLINE')}
                >
                  Оплачено (онлайн)
                </button>
              )}
              {!isDraft && id && !qrUrl && !error && (
                <span className="payment-qr-multi-middle-wait">Формируется QR…</span>
              )}
              {!isDraft && id && error && !qrUrl && (
                <span className="payment-qr-multi-middle-muted" title={error}>
                  QR не готов
                </span>
              )}
            </>
          )}
          {paid && onMarkPaid && (
            <>
              <button
                type="button"
                className={paidVia === 'ONLINE' ? 'btn-success btn-small' : 'btn-secondary btn-small'}
                onClick={() => handleMark(true, 'ONLINE')}
              >
                Оплачено (онлайн)
              </button>
              <button
                type="button"
                className={paidVia === 'CASH' ? 'btn-success btn-small' : 'btn-secondary btn-small'}
                onClick={() => handleMark(true, 'CASH')}
              >
                Оплачено наличными
              </button>
            </>
          )}
          {!paid && onMarkPaid && (
            <button type="button" className="btn-secondary btn-small" onClick={() => handleMark(true, 'CASH')}>
              Оплачено наличными
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function PaymentQrMultiModal({
  isOpen,
  onClose,
  orderId,
  requests,
  paymentMarks = {},
  onPayOnline,
  payOnlineBusy,
  telegramOnlineEnabled = true,
  onMarkPaid,
}: PaymentQrMultiModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Оплата заказа #${orderId} (несколько счетов)`} size="large">
      <div className="payment-qr-multi-modal">
        <div className="payment-qr-multi-grid">
          {requests.map((r, idx) => (
            <QrSlot
              key={r.invoiceId ?? r.id ?? `draft_${idx}`}
              id={r.id}
              label={r.label}
              amount={r.amount}
              invoiceId={r.invoiceId}
              slotIndex={idx}
              mark={resolveMultiSlotMark(r, idx, orderId, paymentMarks)}
              onPayOnline={onPayOnline}
              payOnlineBusy={payOnlineBusy}
              telegramOnlineEnabled={telegramOnlineEnabled}
              onMarkPaid={onMarkPaid}
            />
          ))}
        </div>
        <div className="qr-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </Modal>
  )
}
