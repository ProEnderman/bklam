import { useState } from 'react'
import { telegramPaymentService } from '../api/telegramPaymentService'
import './TelegramLinkModal.css'

interface TelegramLinkModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

type Step = 'phone' | 'code' | 'password' | 'success'

export default function TelegramLinkModal({ isOpen, onClose, onSuccess }: TelegramLinkModalProps) {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [phoneCodeHash, setPhoneCodeHash] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codeType, setCodeType] = useState<string>('')

  const handleSendCode = async () => {
    if (!phone.trim()) {
      setError('Введите номер телефона')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await telegramPaymentService.sendCode(phone)
      setPhoneCodeHash(result.phoneCodeHash)
      setCodeType(result.codeType || 'app')
      setStep('code')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ошибка отправки кода')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmCode = async () => {
    if (!code.trim()) {
      setError('Введите код')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await telegramPaymentService.confirmCode(phone, phoneCodeHash, code)
      
      if (result.requires2FA) {
        setStep('password')
      } else {
        setStep('success')
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 1500)
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Неверный код')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmPassword = async () => {
    if (!password.trim()) {
      setError('Введите пароль')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await telegramPaymentService.confirmPassword(phone, password)
      setStep('success')
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1500)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Неверный пароль')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setStep('phone')
    setPhone('')
    setCode('')
    setPassword('')
    setPhoneCodeHash('')
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="tg-modal-overlay" onClick={handleClose}>
      <div className="tg-modal-content" onClick={e => e.stopPropagation()}>
        <button className="tg-modal-close" onClick={handleClose}>×</button>
        
        <div className="tg-modal-header">
          <div className="tg-icon">📱</div>
          <h2>Привязка Telegram</h2>
          <p className="tg-subtitle">
            Для генерации ссылок оплаты необходимо привязать Telegram аккаунт
          </p>
        </div>

        {error && <div className="tg-error">{error}</div>}

        {step === 'phone' && (
          <div className="tg-step">
            <label>Номер телефона</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+7 999 123 45 67"
              disabled={loading}
            />
            <p className="tg-hint">
              Введите номер, привязанный к вашему Telegram аккаунту
            </p>
            <button 
              className="tg-btn-primary" 
              onClick={handleSendCode}
              disabled={loading}
            >
              {loading ? 'Отправка...' : 'Получить код'}
            </button>
          </div>
        )}

        {step === 'code' && (
          <div className="tg-step">
            <label>Код подтверждения</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="12345"
              maxLength={6}
              disabled={loading}
              autoFocus
            />
            <p className="tg-hint">
              {codeType === 'app' 
                ? 'Код отправлен в приложение Telegram'
                : 'Код отправлен в SMS'}
            </p>
            <button 
              className="tg-btn-primary" 
              onClick={handleConfirmCode}
              disabled={loading}
            >
              {loading ? 'Проверка...' : 'Подтвердить'}
            </button>
            <button 
              className="tg-btn-secondary" 
              onClick={() => setStep('phone')}
              disabled={loading}
            >
              Изменить номер
            </button>
          </div>
        )}

        {step === 'password' && (
          <div className="tg-step">
            <label>Пароль двухфакторной аутентификации</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Ваш 2FA пароль"
              disabled={loading}
              autoFocus
            />
            <p className="tg-hint">
              У вас включена двухфакторная аутентификация. Введите пароль.
            </p>
            <button 
              className="tg-btn-primary" 
              onClick={handleConfirmPassword}
              disabled={loading}
            >
              {loading ? 'Проверка...' : 'Войти'}
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="tg-step tg-success">
            <div className="tg-success-icon">✅</div>
            <h3>Telegram привязан!</h3>
            <p>Теперь вы можете генерировать ссылки оплаты</p>
          </div>
        )}

        <div className="tg-footer">
          <p className="tg-security-note">
            🔒 Ваши данные защищены. Мы не храним пароли и коды.
          </p>
        </div>
      </div>
    </div>
  )
}
