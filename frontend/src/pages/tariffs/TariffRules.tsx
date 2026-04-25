import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { tariffService, tariffModifierService } from '../../api/services'
import type { TariffRule, TariffSpecialDateModifier } from '../../api/types'
import Modal from '../../components/Modal'
import FormInput from '../../components/FormInput'
import TimeIntervalTable, { TimeInterval } from '../../components/TimeIntervalTable'
import './TariffRules.css'

export default function TariffRules() {
  const { planId } = useParams<{ planId: string }>()
  const navigate = useNavigate()
  const [rules, setRules] = useState<TariffRule[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState<TariffRule | null>(null)
  const [formData, setFormData] = useState<Partial<TariffRule>>({
    ruleType: 'STANDARD',
    ruleOrder: 0,
    isActive: true,
  })
  const [holidayDate, setHolidayDate] = useState<string>('')
  const [pricingIntervals, setPricingIntervals] = useState<TimeInterval[]>([])
  const [baseIntervals, setBaseIntervals] = useState<TimeInterval[]>([]) // Базовые интервалы без модификатора
  const [specialDateModifier, setSpecialDateModifier] = useState<TariffSpecialDateModifier | null>(null)

  useEffect(() => {
    if (planId) {
      loadRules()
    } else {
      navigate('/tariffs')
    }
  }, [planId, navigate])

  const loadRules = async () => {
    if (!planId) return
    setLoading(true)
    try {
      const data = await tariffService.getTariffRules(parseInt(planId))
      
      // Сортируем правила: HOLIDAY по дате, остальные по ruleOrder
      const sortedData = [...data].sort((a, b) => {
        // Если оба правила HOLIDAY, сортируем по дате
        if (a.ruleType === 'HOLIDAY' && b.ruleType === 'HOLIDAY') {
          try {
            const aConditions = a.conditions ? JSON.parse(a.conditions) : {}
            const bConditions = b.conditions ? JSON.parse(b.conditions) : {}
            const aDate = aConditions.date || ''
            const bDate = bConditions.date || ''
            return aDate.localeCompare(bDate)
          } catch (e) {
            return 0
          }
        }
        // Если только одно правило HOLIDAY, оно идет после остальных
        if (a.ruleType === 'HOLIDAY' && b.ruleType !== 'HOLIDAY') {
          return 1
        }
        if (a.ruleType !== 'HOLIDAY' && b.ruleType === 'HOLIDAY') {
          return -1
        }
        // Для остальных правил сортируем по ruleOrder
        return (a.ruleOrder || 0) - (b.ruleOrder || 0)
      })
      
      setRules(sortedData)
    } catch (error) {
      console.error('Failed to load rules:', error)
      setRules([])
    } finally {
      setLoading(false)
    }
  }

  const parseIntervalsFromFormula = (formula: string | null | undefined): TimeInterval[] => {
    if (!formula) {
      return [{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }]
    }
    
    try {
      const parsed = JSON.parse(formula)
      if (parsed.model === 'TIME_BASED' && Array.isArray(parsed.intervals)) {
        return parsed.intervals.map((interval: any, index: number) => ({
          id: (index + 1).toString(),
          timeFrom: interval.timeFrom || '10:00',
          timeTo: interval.timeTo || '18:00',
          rate: interval.rate ? Math.round(interval.rate * 100) / 100 : 0, // Округляем до 2 знаков после запятой
        }))
      } else if (parsed.rate) {
        // Старый формат: PER_HOUR или PER_MINUTE - преобразуем в один интервал
        return [{
          id: '1',
          timeFrom: '00:00',
          timeTo: '23:59',
          rate: parsed.rate,
        }]
      } else if (parsed.price) {
        // FIXED формат - преобразуем в один интервал
        return [{
          id: '1',
          timeFrom: '00:00',
          timeTo: '23:59',
          rate: parsed.price,
        }]
      }
    } catch (e) {
      console.error('Error parsing pricing formula', e)
    }
    
    return [{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }]
  }

  const handleCreate = () => {
    setEditingRule(null)
    setFormData({
      ruleType: 'STANDARD',
      ruleOrder: undefined, // Не устанавливаем значение по умолчанию, чтобы поле было пустым
      isActive: true,
    })
    setHolidayDate('')
    setPricingIntervals([{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
    setBaseIntervals([{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
    setSpecialDateModifier(null)
    setShowModal(true)
  }

  const applyModifierToIntervals = (intervals: TimeInterval[], modifier: TariffSpecialDateModifier | null): TimeInterval[] => {
    if (!modifier || modifier.modifierValue === 0) {
      return intervals
    }

    return intervals.map(interval => {
      let modifiedRate = interval.rate

      switch (modifier.modifierType) {
        case 'PERCENT_INCREASE':
          // Увеличение на процент: +20% (значение = 20)
          modifiedRate = interval.rate * (1 + modifier.modifierValue / 100)
          break
        case 'PERCENT_DECREASE':
          // Уменьшение на процент: -10% (значение = 10)
          modifiedRate = interval.rate * (1 - modifier.modifierValue / 100)
          break
        case 'FIXED_INCREASE':
          // Увеличение на фиксированную сумму: +500₽ (значение = 500)
          modifiedRate = interval.rate + modifier.modifierValue
          break
        case 'FIXED_DECREASE':
          // Уменьшение на фиксированную сумму: -200₽ (значение = 200)
          modifiedRate = Math.max(0, interval.rate - modifier.modifierValue)
          break
      }

      // Округляем до 2 знаков после запятой
      modifiedRate = Math.round(modifiedRate * 100) / 100

      return {
        ...interval,
        rate: modifiedRate
      }
    })
  }

  const handleEdit = async (rule: TariffRule) => {
    setEditingRule(rule)
    setFormData(rule)
    
    // Извлекаем дату для HOLIDAY правил
    let dateForModifier = ''
    if (rule.ruleType === 'HOLIDAY' && rule.conditions) {
      try {
        const conditions = JSON.parse(rule.conditions)
        if (conditions.date) {
          setHolidayDate(conditions.date)
          dateForModifier = conditions.date
        } else {
          setHolidayDate('')
        }
      } catch (e) {
        setHolidayDate('')
      }
    } else {
      setHolidayDate('')
    }
    
    // Парсим pricingFormula для интервалов (базовые цены)
    const baseIntervals = parseIntervalsFromFormula(rule.pricingFormula)
    setBaseIntervals(baseIntervals)
    
    // Для HOLIDAY правил загружаем модификатор особой даты и применяем его к ценам
    if (rule.ruleType === 'HOLIDAY' && dateForModifier && planId) {
      try {
        const modifier = await tariffModifierService.getModifierForDate(parseInt(planId), dateForModifier)
        setSpecialDateModifier(modifier)
        
        if (modifier) {
          // Применяем модификатор к интервалам для отображения
          const modifiedIntervals = applyModifierToIntervals(baseIntervals, modifier)
          setPricingIntervals(modifiedIntervals)
        } else {
          setPricingIntervals(baseIntervals)
        }
      } catch (error) {
        console.error('Failed to load modifier:', error)
        setSpecialDateModifier(null)
        setPricingIntervals(baseIntervals)
      }
    } else {
      setSpecialDateModifier(null)
      setPricingIntervals(baseIntervals)
    }
    
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!planId) return
    try {
      const dataToSave = { ...formData }
      
      // Убеждаемся, что ruleOrder установлен (минимум 0)
      if (dataToSave.ruleOrder === undefined || dataToSave.ruleOrder === null) {
        dataToSave.ruleOrder = rules.length
      }
      
      // Для HOLIDAY правил преобразуем дату в JSON формат
      if (formData.ruleType === 'HOLIDAY') {
        if (holidayDate) {
          dataToSave.conditions = JSON.stringify({ date: holidayDate })
        } else {
          dataToSave.conditions = undefined
        }
      } else {
        // Для других типов правил очищаем conditions, если они не нужны
        // (можно оставить как есть, если пользователь вручную вводил JSON)
      }
      
      // Преобразуем интервалы в pricingFormula
      // Для HOLIDAY правил сохраняем базовые цены (без модификатора), так как модификатор применяется отдельно
      const intervalsToSave = (formData.ruleType === 'HOLIDAY' && specialDateModifier && baseIntervals.length > 0) 
        ? baseIntervals 
        : pricingIntervals
      
      if (intervalsToSave.length > 0 && intervalsToSave.some(i => i.rate > 0)) {
        dataToSave.pricingFormula = JSON.stringify({
          model: 'TIME_BASED',
          intervals: intervalsToSave.map((i) => ({
            timeFrom: i.timeFrom,
            timeTo: i.timeTo,
            rate: Math.round(i.rate * 100) / 100, // Округляем до 2 знаков после запятой
          })),
        })
      } else if (intervalsToSave.length > 0) {
        // Если есть интервалы, но все с нулевой ценой, все равно сохраняем
        dataToSave.pricingFormula = JSON.stringify({
          model: 'TIME_BASED',
          intervals: intervalsToSave.map((i) => ({
            timeFrom: i.timeFrom,
            timeTo: i.timeTo,
            rate: Math.round(i.rate * 100) / 100, // Округляем до 2 знаков после запятой
          })),
        })
      }
      
      if (editingRule) {
        await tariffService.updateTariffRule(editingRule.id, dataToSave)
      } else {
        await tariffService.createTariffRule(parseInt(planId), dataToSave)
      }
      setShowModal(false)
      // Очищаем состояние
      setBaseIntervals([])
      setSpecialDateModifier(null)
      loadRules()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to save rule')
    }
  }

  const handleDelete = async (rule: TariffRule) => {
    if (!confirm(`Delete rule?`)) return
    try {
      await tariffService.deleteTariffRule(rule.id)
      loadRules()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete rule')
    }
  }

  return (
    <div className="tariff-rules-page">
      <div className="page-header">
        <button className="btn-secondary" onClick={() => navigate('/tariffs')}>
          ← Back
        </button>
        <h1>Tariff Rules</h1>
        <button className="btn-primary" onClick={handleCreate}>
          New Rule
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="rules-list">
          {rules.length === 0 ? (
            <p className="empty-state">No rules found</p>
          ) : (
            rules.map((rule) => {
              // Извлекаем дату для правил типа HOLIDAY
              let holidayDate: string | null = null
              if (rule.ruleType === 'HOLIDAY' && rule.conditions) {
                try {
                  const conditions = JSON.parse(rule.conditions)
                  if (conditions.date) {
                    holidayDate = conditions.date
                  }
                } catch (e) {
                  // Игнорируем ошибки парсинга
                }
              }
              
              return (
              <div key={rule.id} className="rule-card">
                <div className="rule-header">
                  <h3>
                    {rule.ruleType}
                    {holidayDate && (
                      <span style={{ marginLeft: '10px', fontSize: '14px', fontWeight: 'normal', color: '#666' }}>
                        ({new Date(holidayDate).toLocaleDateString('ru-RU')})
                      </span>
                    )}
                  </h3>
                  <span className="rule-order">Order: {rule.ruleOrder}</span>
                </div>
                <div className="rule-details">
                  {rule.isActive ? (
                    <span className="badge active">Active</span>
                  ) : (
                    <span className="badge inactive">Inactive</span>
                  )}
                </div>
                <div className="rule-actions">
                  <button onClick={() => handleEdit(rule)} className="btn-small btn-primary">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(rule)} className="btn-small btn-danger">
                    Delete
                  </button>
                </div>
              </div>
              )
            })
          )}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          setPricingIntervals([{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
        }}
        title={editingRule ? 'Edit Rule' : 'New Rule'}
      >
        <div className="rule-form">
          <label>
            <span>Rule Type:</span>
            <select
              value={formData.ruleType || 'STANDARD'}
              onChange={(e) => {
                const newType = e.target.value as any
                setFormData({ 
                  ...formData, 
                  ruleType: newType,
                  // Очищаем conditions при смене типа (кроме SPECIAL)
                  conditions: newType === 'SPECIAL' ? formData.conditions : undefined
                })
                // Очищаем holidayDate если меняем тип с HOLIDAY
                if (newType !== 'HOLIDAY') {
                  setHolidayDate('')
                }
              }}
            >
              <option value="STANDARD">Standard</option>
              <option value="WEEKEND">Weekend</option>
              <option value="HOLIDAY">Holiday</option>
              <option value="SPECIAL">Special</option>
            </select>
          </label>
          <FormInput
            label="Rule Order"
            type="number"
            value={formData.ruleOrder?.toString() || ''}
            onChange={(v) => {
              const value = v === '' ? undefined : parseInt(v, 10)
              setFormData({ ...formData, ruleOrder: value !== undefined && !isNaN(value) ? value : 0 })
            }}
          />
          
          {/* Показываем date picker только для HOLIDAY правил (только для чтения) */}
          {formData.ruleType === 'HOLIDAY' && (
            <label>
              <span>Дата:</span>
              <input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                readOnly
                disabled
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  marginTop: '5px',
                  backgroundColor: '#f5f5f5',
                  cursor: 'not-allowed',
                  opacity: 0.7
                }}
              />
              <small style={{ display: 'block', marginTop: '5px', color: '#666', fontSize: '12px' }}>
                Дата задается автоматически при создании правила через настройку модификаторов особых дат в тарифе
              </small>
            </label>
          )}
          
          {/* Показываем Conditions (JSON) только для SPECIAL правил */}
          {formData.ruleType === 'SPECIAL' && (
            <FormInput
              label="Conditions (JSON)"
              value={formData.conditions || ''}
              onChange={(v) => setFormData({ ...formData, conditions: v })}
              type="textarea"
              placeholder='{"dayOfWeek": 6, "timeFrom": "18:00", "timeTo": "23:00"}'
            />
          )}
          <div style={{ marginTop: '20px', marginBottom: '20px' }}>
            <label>
              <span style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>
                Интервалы времени и цены:
              </span>
              {formData.ruleType === 'HOLIDAY' && specialDateModifier && (
                <div style={{ 
                  marginBottom: '10px', 
                  padding: '10px', 
                  background: '#e7f3ff', 
                  border: '1px solid #2196F3',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}>
                  <strong>ℹ️ Информация:</strong> Для этой особой даты настроен модификатор цены: <strong>
                    {specialDateModifier.modifierType === 'PERCENT_INCREASE' ? `+${specialDateModifier.modifierValue}%` : 
                    specialDateModifier.modifierType === 'PERCENT_DECREASE' ? `-${specialDateModifier.modifierValue}%` :
                    specialDateModifier.modifierType === 'FIXED_INCREASE' ? `+₽${specialDateModifier.modifierValue}` :
                    `-₽${specialDateModifier.modifierValue}`}
                  </strong>
                  <br />
                  В таблице ниже показаны <strong>финальные цены с учетом модификатора</strong>. 
                  При сохранении система автоматически вычислит базовые цены (без модификатора) и сохранит их. 
                  Модификатор будет применяться автоматически при расчете стоимости бронирования.
                </div>
              )}
              <TimeIntervalTable
                intervals={pricingIntervals}
                onChange={(newIntervals) => {
                  // При изменении интервалов обновляем базовые интервалы
                  if (formData.ruleType === 'HOLIDAY' && specialDateModifier) {
                    // Вычисляем базовые цены из модифицированных
                    const base = newIntervals.map(interval => {
                      let baseRate = interval.rate
                      
                      switch (specialDateModifier.modifierType) {
                        case 'PERCENT_INCREASE':
                          baseRate = interval.rate / (1 + specialDateModifier.modifierValue / 100)
                          break
                        case 'PERCENT_DECREASE':
                          baseRate = interval.rate / (1 - specialDateModifier.modifierValue / 100)
                          break
                        case 'FIXED_INCREASE':
                          baseRate = interval.rate - specialDateModifier.modifierValue
                          break
                        case 'FIXED_DECREASE':
                          baseRate = interval.rate + specialDateModifier.modifierValue
                          break
                      }
                      
                      // Округляем до 2 знаков после запятой
                      baseRate = Math.round(Math.max(0, baseRate) * 100) / 100
                      
                      return {
                        ...interval,
                        rate: baseRate
                      }
                    })
                    setBaseIntervals(base)
                  } else {
                    setBaseIntervals(newIntervals)
                  }
                  setPricingIntervals(newIntervals)
                }}
                label=""
              />
              <small style={{ display: 'block', marginTop: '10px', color: '#666', fontSize: '12px' }}>
                Настройте временные интервалы и цены для этого правила. Цена указывается в рублях за час.
              </small>
            </label>
          </div>
          <div className="form-row">
            <FormInput
              label="Min Amount"
              type="number"
              step={0.01}
              value={formData.minAmount?.toString() || ''}
              onChange={(v) =>
                setFormData({ ...formData, minAmount: v ? parseFloat(v) : undefined })
              }
            />
            <FormInput
              label="Max Amount"
              type="number"
              step={0.01}
              value={formData.maxAmount?.toString() || ''}
              onChange={(v) =>
                setFormData({ ...formData, maxAmount: v ? parseFloat(v) : undefined })
              }
            />
          </div>
          <label>
            <input
              type="checkbox"
              checked={formData.isActive ?? true}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
            />
            Active
          </label>
          <div className="form-actions">
            <button className="btn-secondary" onClick={() => setShowModal(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

