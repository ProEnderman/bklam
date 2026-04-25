import { useState, useEffect } from 'react'
import { pricingService, activityService } from '../../api/services'
import type { PricingRequest, PricingResult, Activity } from '../../api/types'
import './PricingCalculator.css'

function toLocalDatetimeInput(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

export default function PricingCalculator() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [selectedActivityId, setSelectedActivityId] = useState<number | undefined>(undefined)
  const [discountPercent, setDiscountPercent] = useState<string>('')
  const [discountReason, setDiscountReason] = useState<string>('')
  const [request, setRequest] = useState<Partial<PricingRequest>>({
    serviceStart: toLocalDatetimeInput(new Date()),
    serviceEnd: toLocalDatetimeInput(new Date(Date.now() + 60 * 60 * 1000)),
  })
  const [result, setResult] = useState<PricingResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadActivities()
  }, [])

  const loadActivities = async () => {
    try {
      const data = await activityService.getActivities(undefined, 'ACTIVE')
      setActivities(data)
    } catch (error) {
      console.error('Failed to load activities:', error)
    }
  }

  const handleCalculate = async () => {
    if (!request.serviceStart || !request.serviceEnd) {
      alert('Пожалуйста, укажите время начала и окончания услуги')
      return
    }

    if (!selectedActivityId) {
      alert('Пожалуйста, выберите активность')
      return
    }

    // Если указана скидка, обязательно нужно обоснование
    if (discountPercent && !discountReason.trim()) {
      alert('Если указана скидка, обязательно нужно заполнить поле "Обоснование"')
      return
    }

    // Проверяем, что скидка - это число
    if (discountPercent) {
      const discountValue = parseFloat(discountPercent)
      if (isNaN(discountValue) || discountValue < 0 || discountValue > 100) {
        alert('Скидка должна быть числом от 0 до 100')
        return
      }
    }

    setLoading(true)
    try {
      // Форматируем даты в локальном времени без конвертации в UTC
      const formatLocalDateTime = (dateStr: string) => {
        const date = new Date(dateStr)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day}T${hours}:${minutes}:00`
      }

      const pricingRequest: PricingRequest = {
        serviceStart: formatLocalDateTime(request.serviceStart!),
        serviceEnd: formatLocalDateTime(request.serviceEnd!),
        serviceId: selectedActivityId,
        discountPercent: discountPercent ? parseFloat(discountPercent) : undefined,
        discountReason: discountReason || undefined,
      }
      const previewResult = await pricingService.preview(pricingRequest)
      setResult(previewResult)
    } catch (error: any) {
      console.error('Failed to calculate price:', error)
      alert(error.response?.data?.message || 'Не удалось рассчитать цену')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pricing-calculator-page">
      <h1>Калькулятор цен</h1>
      <div className="calculator-layout">
        <div className="calculator-input">
          <h2>Параметры расчета</h2>
          <div className="form-group">
            <label>
              Активность: *
              <select
                value={selectedActivityId || ''}
                onChange={(e) => setSelectedActivityId(e.target.value ? parseInt(e.target.value) : undefined)}
                required
              >
                <option value="">-- Выберите активность --</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-group">
            <label>
              Время начала: *
              <input
                type="datetime-local"
                value={request.serviceStart || ''}
                onChange={(e) => setRequest({ ...request, serviceStart: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-group">
            <label>
              Время окончания: *
              <input
                type="datetime-local"
                value={request.serviceEnd || ''}
                onChange={(e) => setRequest({ ...request, serviceEnd: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-group">
            <label>
              Скидка (%) (опционально):
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                placeholder="Например: 10"
              />
            </label>
          </div>
          <div className="form-group">
            <label>
              Обоснование {discountPercent ? '*' : '(опционально)'}:
              <textarea
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="Укажите обоснование скидки"
                required={!!discountPercent}
                rows={3}
              />
            </label>
            {discountPercent && !discountReason.trim() && (
              <small style={{ color: '#dc3545' }}>Обоснование обязательно, если указана скидка</small>
            )}
          </div>
          <button className="btn-primary" onClick={handleCalculate} disabled={loading}>
            {loading ? 'Расчет...' : 'Рассчитать цену'}
          </button>
        </div>

        <div className="calculator-result">
          <h2>Результат расчета</h2>
          {result ? (
            <div className="result-content">
              <div className={`status-badge ${result.status.toLowerCase()}`}>
                Статус: {result.status}
              </div>
              {result.status === 'STOP' && result.stopReason && (
                <div className="stop-reason">
                  <strong>Причина остановки:</strong> {result.stopReason}
                </div>
              )}
              {result.status === 'OK' && (
                <>
                  <div className="result-summary">
                    <div className="summary-item">
                      <span>Базовая сумма:</span>
                      <span>₽{result.baseAmount?.toFixed(2) || '0.00'}</span>
                    </div>
                  {/* Вычисляем наценку за особые даты из breakdown */}
                  {(() => {
                    // Ищем все элементы с типом COEFFICIENT (модификаторы особых дат)
                    const modifierItems = result.breakdowns?.filter(item => 
                      item.lineType === 'COEFFICIENT' || 
                      item.lineType === 'Coefficient' ||
                      item.description?.toLowerCase().includes('special date modifier') ||
                      item.description?.toLowerCase().includes('модификатор особой даты')
                    ) || []
                    const modifierAmount = modifierItems.reduce((sum, item) => sum + (item.amount || 0), 0)
                    
                    // Если не нашли в breakdown, вычисляем как разницу
                    let finalModifierAmount = modifierAmount
                    if (modifierAmount === 0 && result.baseAmount !== undefined) {
                      // Вычисляем как разницу между итогом и базой минус скидка
                      const calculatedModifier = result.totalAmount - result.baseAmount - (result.discountAmount || 0)
                      if (Math.abs(calculatedModifier) > 0.01) {
                        finalModifierAmount = calculatedModifier
                      }
                    }
                    
                    if (Math.abs(finalModifierAmount) > 0.01) {
                      return (
                        <div className="summary-item modifier">
                          <span>Наценка за особые даты:</span>
                          <span className={finalModifierAmount >= 0 ? 'positive' : 'negative'}>
                            {finalModifierAmount >= 0 ? '+' : ''}₽{finalModifierAmount.toFixed(2)}
                          </span>
                        </div>
                      )
                    }
                    return null
                  })()}
                  {(() => {
                    // Проверяем наличие скидки - используем discountPercent если есть, иначе проверяем discountAmount
                    if (result.discountPercent !== undefined && result.discountPercent > 0) {
                      return (
                        <div className="summary-item discount">
                          <span>Скидка {result.discountPercent.toFixed(2)}%{result.discountReason ? ` (${result.discountReason})` : ''}</span>
                        </div>
                      )
                    }
                    // Если discountPercent нет, но есть discountAmount, вычисляем процент
                    if (result.discountAmount !== undefined && result.discountAmount > 0 && result.baseAmount && result.baseAmount > 0) {
                      const calculatedPercent = (result.discountAmount / result.baseAmount) * 100
                      return (
                        <div className="summary-item discount">
                          <span>Скидка {calculatedPercent.toFixed(2)}%{result.discountReason ? ` (${result.discountReason})` : ''}</span>
                        </div>
                      )
                    }
                    return null
                  })()}
                    <div className="summary-item total">
                      <span>Итого:</span>
                      <span>₽{result.totalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="breakdown">
                    <h3>Детализация</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Тип</th>
                          <th>Описание</th>
                          <th>Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.breakdowns?.map((item, idx) => (
                          <tr key={idx}>
                            <td>{item.lineType}</td>
                            <td>{item.description}</td>
                            <td>₽{item.amount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {result.appliedRuleIds && result.appliedRuleIds.length > 0 && (
                      <div className="applied-rules">
                        <strong>Примененные правила (ID):</strong> {result.appliedRuleIds.join(', ')}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="empty-state">Введите параметры и нажмите "Рассчитать цену"</p>
          )}
        </div>
      </div>
    </div>
  )
}



