import { useState, useEffect, useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { qrMenuConfigService, type QrMenuConfig } from '../api/services'
import './QrMenuConfig.css'

function formatDateTimeLocal(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

function toISOForBackend(localStr: string): string {
  if (!localStr) return ''
  return new Date(localStr).toISOString().slice(0, 19)
}

export default function QrMenuConfig() {
  const [config, setConfig] = useState<QrMenuConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [expiresAtInput, setExpiresAtInput] = useState('')
  const qrContainerRef = useRef<HTMLDivElement>(null)

  const loadConfig = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await qrMenuConfigService.getConfig()
      setConfig(data)
      setExpiresAtInput(formatDateTimeLocal(data.expiresAt))
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Не удалось загрузить настройки')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  const handleSaveExpiry = async () => {
    if (!expiresAtInput) return
    setSaving(true)
    setError('')
    try {
      const data = await qrMenuConfigService.updateExpiry(toISOForBackend(expiresAtInput))
      setConfig(data)
      setExpiresAtInput(formatDateTimeLocal(data.expiresAt))
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setError(err?.response?.data?.message || err?.message || 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  const extendByDays = (days: number) => {
    const now = new Date()
    let base = new Date(expiresAtInput || 0)
    if (isNaN(base.getTime()) || base.getTime() < now.getTime()) {
      base = now
    }
    base.setDate(base.getDate() + days)
    setExpiresAtInput(formatDateTimeLocal(base.toISOString()))
  }

  const downloadQr = () => {
    const canvas = qrContainerRef.current?.querySelector('canvas')
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = 'qr-menu.png'
    a.click()
  }

  if (loading) {
    return (
      <div className="qr-config-page">
        <p className="qr-config-loading">Загрузка…</p>
      </div>
    )
  }

  if (error && !config) {
    return (
      <div className="qr-config-page">
        <p className="qr-config-error">{error}</p>
      </div>
    )
  }

  return (
    <div className="qr-config-page">
      <h1>QR-меню для столиков</h1>
      <p className="qr-config-desc">
        По этой ссылке гости открывают меню и могут делать заказ. Распечатайте QR-код и положите на столики.
        Срок действия ссылки можно менять вручную.
      </p>

      {error && <p className="qr-config-error">{error}</p>}

      {config && (
        <>
          <section className="qr-config-section">
            <h2>Ссылка</h2>
            <div className="qr-config-url-wrap">
              <input
                type="text"
                readOnly
                className="qr-config-url"
                value={config.menuQrUrl}
              />
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => navigator.clipboard.writeText(config.menuQrUrl)}
              >
                Копировать
              </button>
            </div>
          </section>

          <section className="qr-config-section qr-config-qr-wrap" ref={qrContainerRef}>
            <h2>QR-код</h2>
            <QRCodeCanvas value={config.menuQrUrl} size={280} level="M" />
            <button type="button" className="btn-primary qr-config-download" onClick={downloadQr}>
              Скачать PNG
            </button>
          </section>

          <section className="qr-config-section">
            <h2>Срок действия токена</h2>
            {(() => {
              const expiresAt = config.expiresAt ? new Date(config.expiresAt) : null
              const now = new Date()
              const daysLeft = expiresAt && !config.expired
                ? Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
                : null
              const withinFiveDays = daysLeft != null && daysLeft <= 5 && daysLeft > 0
              return (
                <>
                  <p className="qr-config-extend-tip">
                    QR-код истекает — продлевайте его каждый день за 5 дней до истечения.
                  </p>
                  {withinFiveDays && (
                    <p className="qr-config-expiry-soon">
                      До истечения осталось {daysLeft} {daysLeft === 1 ? 'день' : daysLeft >= 2 && daysLeft <= 4 ? 'дня' : 'дней'}. Рекомендуем продлить срок действия.
                    </p>
                  )}
                </>
              )
            })()}
            {config.expired && (
              <p className="qr-config-expired">Токен истёк. Установите новую дату и сохраните.</p>
            )}
            <div className="qr-config-expiry-row">
              <input
                type="datetime-local"
                className="qr-config-datetime"
                value={expiresAtInput}
                onChange={(e) => setExpiresAtInput(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveExpiry}
                disabled={saving}
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
            <div className="qr-config-quick-extend">
              <span>Продлить на:</span>
              <button type="button" className="btn-secondary btn-small" onClick={() => extendByDays(30)}>
                30 дней
              </button>
              <button type="button" className="btn-secondary btn-small" onClick={() => extendByDays(365)}>
                1 год
              </button>
            </div>
            <p className="qr-config-expiry-hint">
              Текущая дата истечения: {config.expiresAt ? new Date(config.expiresAt).toLocaleString('ru-RU') : '—'}
            </p>
          </section>
        </>
      )}
    </div>
  )
}
