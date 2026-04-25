import { useEffect, useState, useRef } from 'react'
import Modal from './Modal'
import { telegramPaymentService, type PaymentRequest } from '../api/telegramPaymentService'
import './PaymentQrModal.css'

interface PaymentQrModalProps {
  isOpen: boolean
  onClose: () => void
  paymentRequestId: string
  orderId: number
  customTitle?: string
  /** Отмечено ли как оплачено вручную */
  markedPaid?: boolean
  /** При нажатии «Оплачено»/«Не оплачено» */
  onMarkPaid?: (paid: boolean) => void
}

type ProgressStep = 'created' | 'sent' | 'link_received' | 'qr_generating' | 'done'

export default function PaymentQrModal({
  isOpen,
  onClose,
  paymentRequestId,
  orderId,
  customTitle,
  markedPaid,
  onMarkPaid,
}: PaymentQrModalProps) {
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null)
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, setPolling] = useState(true)
  const [step, setStep] = useState<ProgressStep>('created')
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const qrUrlRef = useRef<string | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (qrUrlRef.current) URL.revokeObjectURL(qrUrlRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isOpen || !paymentRequestId) return

    const loadQr = async () => {
      setStep('qr_generating')
      try {
        const qrBlob = await telegramPaymentService.getQrCode(paymentRequestId)
        const url = URL.createObjectURL(qrBlob)
        qrUrlRef.current = url
        setQrImageUrl(url)
        setStep('done')
      } catch (err: any) {
        console.error('QR load error:', err)
        setError('Не удалось загрузить QR-код')
      }
    }

    const pollPaymentRequest = async () => {
      try {
        const pr = await telegramPaymentService.getPaymentRequest(paymentRequestId)
        setPaymentRequest(pr)
        setError(null)

        if (pr.status === 'CREATED') {
          setStep('created')
        } else if (pr.status === 'SENT') {
          setStep('sent')
        } else if (pr.status === 'LINK_RECEIVED' && pr.paymentLink) {
          // Stop polling immediately, load QR
          setPolling(false)
          if (pollRef.current) clearInterval(pollRef.current)
          loadQr()
        } else if (['TIMEOUT', 'UNPARSABLE', 'SESSION_INVALID', 'RATE_LIMITED'].includes(pr.status)) {
          setPolling(false)
          if (pollRef.current) clearInterval(pollRef.current)
          setError(pr.errorMessage || `Ошибка: ${pr.status}`)
        } else if (pr.status === 'CANCELLED') {
          setPolling(false)
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch (err: any) {
        if (err.response?.status === 429) return // Skip, continue polling
        const errorMsg = err.response?.data?.message || err.message || 'Ошибка'
        setError(errorMsg)
        setPolling(false)
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }

    // First request immediately
    pollPaymentRequest()

    // Fast polling: every 2 seconds
    pollRef.current = setInterval(pollPaymentRequest, 2000)

    // Global timeout: 90 seconds
    timeoutRef.current = setTimeout(() => {
      setPolling(false)
      if (pollRef.current) clearInterval(pollRef.current)
      if (step !== 'done' && step !== 'qr_generating') {
        setError('Превышено время ожидания ответа')
      }
    }, 90000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [isOpen, paymentRequestId])

  const handleRefresh = async () => {
    if (!paymentRequestId) return
    setError(null)
    setStep('created')
    setQrImageUrl(null)
    setPolling(true)
    try {
      await telegramPaymentService.refreshPaymentRequest(paymentRequestId)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка при обновлении')
    }
  }

  const handleCancel = async () => {
    if (!paymentRequestId) return
    try {
      await telegramPaymentService.cancelPaymentRequest(paymentRequestId)
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Ошибка при отмене')
    }
  }

  const stepIndex = { created: 0, sent: 1, link_received: 2, qr_generating: 2, done: 3 }
  const currentStepIdx = stepIndex[step]

  const steps = [
    { label: 'Запрос создан', icon: '📝' },
    { label: 'Отправлено в Telegram', icon: '📤' },
    { label: 'Ссылка получена', icon: '🔗' },
    { label: 'QR-код готов', icon: '✅' },
  ]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={customTitle || `Оплата заказа #${orderId}`} size="large">
      <div className="payment-qr-modal">
        {/* Progress Steps */}
        {step !== 'done' && !error && (
          <div className="qr-progress">
            <div className="progress-steps">
              {steps.map((s, i) => (
                <div
                  key={i}
                  className={`progress-step ${i < currentStepIdx ? 'completed' : ''} ${i === currentStepIdx ? 'active' : ''}`}
                >
                  <div className="step-icon">
                    {i < currentStepIdx ? '✓' : s.icon}
                  </div>
                  <div className="step-label">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Status text */}
            <div className="status-text">
              {step === 'created' && (
                <p><span className="pulse-dot"></span> Запрос создан, ожидание отправки...</p>
              )}
              {step === 'sent' && (
                <p><span className="pulse-dot"></span> Сообщение отправлено, ожидание ответа...</p>
              )}
              {step === 'link_received' && (
                <p><span className="pulse-dot green"></span> Ссылка на оплату получена!</p>
              )}
              {step === 'qr_generating' && (
                <p><span className="pulse-dot green"></span> Ссылка на оплату получена, генерируется QR-код...</p>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="qr-error">
            <p>{error}</p>
            {(paymentRequest?.status === 'TIMEOUT' || paymentRequest?.status === 'UNPARSABLE') && (
              <button className="btn-primary" onClick={handleRefresh}>
                Попробовать снова
              </button>
            )}
          </div>
        )}

        {/* QR Code */}
        {qrImageUrl && step === 'done' && (
          <div className="qr-success">
            <div className="qr-check-icon">✅</div>
            <p className="qr-ready-text">QR-код готов к сканированию</p>
            <div className="qr-image-container">
              <img src={qrImageUrl} alt="QR код для оплаты" className="qr-image" />
            </div>
            {onMarkPaid && (
              <div className="payment-qr-slot-mark">
                <button
                  type="button"
                  className={markedPaid ? 'btn-success btn-small' : 'btn-secondary btn-small'}
                  onClick={() => onMarkPaid(!markedPaid)}
                >
                  {markedPaid ? 'Оплачено' : 'Не оплачено'}
                </button>
              </div>
            )}
            <p className="qr-instruction">
              Покажите QR-код покупателю для оплаты
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="qr-actions">
          {step !== 'done' && paymentRequest?.status !== 'CANCELLED' && (
            <button className="btn-secondary" onClick={handleCancel}>
              Отменить
            </button>
          )}
          {(paymentRequest?.status === 'TIMEOUT' || paymentRequest?.status === 'UNPARSABLE') && (
            <button className="btn-primary" onClick={handleRefresh}>
              Обновить ссылку
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </Modal>
  )
}
