import { useEffect, useState } from 'react'
import { calendarService, tariffService, tariffModifierService } from '../../api/services'
import type { Calendar, CalendarUpdateResponse, TariffPlan, TariffSpecialDateModifier } from '../../api/types'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import FormInput from '../../components/FormInput'
import CalendarWidget from '../../components/CalendarWidget'
import TimeIntervalTable, { type TimeInterval } from '../../components/TimeIntervalTable'
import './Calendar.css'

export default function CalendarPage() {
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null)
  const [formData, setFormData] = useState<Partial<Calendar>>({
    name: '',
    weekendRule: 'SAT_SUN',
    weekendDays: [],
    specialDates: [],
  })
  
  // Состояния для обработки обновления календаря и тарифных планов
  const [showAffectedTariffsModal, setShowAffectedTariffsModal] = useState(false)
  const [affectedTariffPlans, setAffectedTariffPlans] = useState<TariffPlan[]>([])
  const [currentTariffIndex, setCurrentTariffIndex] = useState(0)
  const [showTariffModifiersModal, setShowTariffModifiersModal] = useState(false)
  const [currentTariffPlan, setCurrentTariffPlan] = useState<TariffPlan | null>(null)
  const [modifiers, setModifiers] = useState<Record<string, TariffSpecialDateModifier>>({})
  const [specialDateIntervals, setSpecialDateIntervals] = useState<Record<string, TimeInterval[]>>({})
  const [templateIntervals, setTemplateIntervals] = useState<TimeInterval[]>([{ id: 'template-1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
  const [addedDates, setAddedDates] = useState<string[]>([])
  const [removedDates, setRemovedDates] = useState<string[]>([])
  const [applyToAllValue, setApplyToAllValue] = useState<string>('')
  
  const weekDays = [
    { value: 1, label: 'Понедельник' },
    { value: 2, label: 'Вторник' },
    { value: 3, label: 'Среда' },
    { value: 4, label: 'Четверг' },
    { value: 5, label: 'Пятница' },
    { value: 6, label: 'Суббота' },
    { value: 7, label: 'Воскресенье' },
  ]
  
  const handleWeekendDayToggle = (day: number) => {
    // Убеждаемся, что weekendDays - это массив
    let currentDays: number[] = []
    if (Array.isArray(formData.weekendDays)) {
      currentDays = formData.weekendDays
    } else if (typeof formData.weekendDays === 'string') {
      try {
        currentDays = JSON.parse(formData.weekendDays)
      } catch (e) {
        currentDays = []
      }
    }
    
    if (currentDays.includes(day)) {
      setFormData({
        ...formData,
        weekendDays: currentDays.filter((d: number) => d !== day),
      })
    } else {
      setFormData({
        ...formData,
        weekendDays: [...currentDays, day].sort((a, b) => a - b),
      })
    }
  }

  useEffect(() => {
    loadCalendars()
  }, [])

  const loadCalendars = async () => {
    setLoading(true)
    try {
      const data = await calendarService.getCalendars()
      setCalendars(data)
    } catch (error) {
      console.error('Failed to load calendars:', error)
      setCalendars([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    setEditingCalendar(null)
    setFormData({
      name: '',
      weekendRule: 'SAT_SUN',
      weekendDays: [],
      specialDates: [],
    })
    setShowModal(true)
  }
  
  const handleWeekendRuleChange = (rule: string) => {
    if (rule === 'CUSTOM') {
      // При выборе CUSTOM инициализируем пустым массивом, если его нет
      setFormData({
        ...formData,
        weekendRule: rule as any,
        weekendDays: formData.weekendDays || [],
      })
    } else {
      // Для других правил очищаем weekendDays
      setFormData({
        ...formData,
        weekendRule: rule as any,
        weekendDays: [],
      })
    }
  }

  const handleEdit = (calendar: Calendar) => {
    setEditingCalendar(calendar)
    // Преобразуем weekendDays из JSON строки в массив, если это CUSTOM режим
    let weekendDays: number[] = []
    if (calendar.weekendRule === 'CUSTOM' && calendar.weekendDays) {
      try {
        if (typeof calendar.weekendDays === 'string') {
          weekendDays = JSON.parse(calendar.weekendDays)
        } else if (Array.isArray(calendar.weekendDays)) {
          weekendDays = calendar.weekendDays
        }
      } catch (e) {
        console.error('Error parsing weekendDays', e)
      }
    }
    setFormData({
      ...calendar,
      weekendDays,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      // Преобразуем weekendDays в JSON строку для отправки на сервер, если это CUSTOM режим
      const dataToSave: any = {
        ...formData,
      }
      
      if (formData.weekendRule === 'CUSTOM' && formData.weekendDays && formData.weekendDays.length > 0) {
        dataToSave.weekendDays = JSON.stringify(formData.weekendDays)
      } else {
        dataToSave.weekendDays = null
      }
      
      if (editingCalendar) {
        const response: CalendarUpdateResponse = await calendarService.updateCalendar(editingCalendar.id, dataToSave)
        
        // Если есть затронутые тарифные планы и были добавлены даты (для удаленных дат не нужно настраивать модификаторы)
        if (response.affectedTariffPlans && response.affectedTariffPlans.length > 0 && 
            response.addedDates.length > 0) {
          setAffectedTariffPlans(response.affectedTariffPlans)
          setAddedDates(response.addedDates)
          setRemovedDates(response.removedDates)
          setShowAffectedTariffsModal(true)
          setShowModal(false)
          
          // Если также есть удаленные даты, удаляем их модификаторы и правила в фоне
          if (response.removedDates && response.removedDates.length > 0) {
            cleanupRemovedDates(response.affectedTariffPlans, response.removedDates).catch(console.error)
          }
        } else {
          // Если только удалены даты или нет изменений, удаляем модификаторы и правила для удаленных дат
          if (response.removedDates && response.removedDates.length > 0 && 
              response.affectedTariffPlans && response.affectedTariffPlans.length > 0) {
            // Удаляем модификаторы и правила для удаленных дат
            await cleanupRemovedDates(response.affectedTariffPlans, response.removedDates)
          }
          setShowModal(false)
          loadCalendars()
          if (response.removedDates && response.removedDates.length > 0) {
            alert(`Календарь обновлен. Удалено ${response.removedDates.length} особых дат. Модификаторы и правила для этих дат удалены из тарифных планов.`)
          }
        }
      } else {
        await calendarService.createCalendar(dataToSave)
        setShowModal(false)
        loadCalendars()
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось сохранить календарь')
    }
  }
  
  const cleanupRemovedDates = async (plans: TariffPlan[], removedDates: string[]) => {
    try {
      for (const plan of plans) {
        // Удаляем модификаторы для удаленных дат
        for (const date of removedDates) {
          try {
            const modifier = await tariffModifierService.getModifierForDate(plan.id, date)
            if (modifier && modifier.id) {
              await tariffModifierService.deleteModifier(plan.id, modifier.id)
            }
          } catch (e) {
            // Модификатор может не существовать, игнорируем ошибку
          }
        }
        
        // Удаляем правила HOLIDAY для удаленных дат
        const existingRules = await tariffService.getTariffRules(plan.id)
        const holidayRules = existingRules.filter((r) => r.ruleType === 'HOLIDAY')
        
        for (const rule of holidayRules) {
          if (rule.conditions) {
            try {
              const conditions = JSON.parse(rule.conditions)
              if (conditions.date && removedDates.includes(conditions.date)) {
                await tariffService.deleteTariffRule(rule.id)
              }
            } catch (e) {
              // Игнорируем ошибки парсинга
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Error cleaning up removed dates:', error)
      // Не показываем ошибку пользователю, так как это фоновый процесс
    }
  }
  
  const handleConfirmTariffUpdate = () => {
    setShowAffectedTariffsModal(false)
    if (affectedTariffPlans.length > 0) {
      setCurrentTariffIndex(0)
      loadTariffModifiers(affectedTariffPlans[0], addedDates)
    }
  }
  
  const loadTariffModifiers = async (tariffPlan: TariffPlan, datesToConfigure: string[]) => {
    try {
      // Работаем только с добавленными датами
      if (!datesToConfigure || datesToConfigure.length === 0) {
        // Если нет добавленных дат, просто переходим к следующему тарифному плану
        const nextIndex = currentTariffIndex + 1
        if (nextIndex < affectedTariffPlans.length) {
          setCurrentTariffIndex(nextIndex)
          loadTariffModifiers(affectedTariffPlans[nextIndex], addedDates)
        } else {
          setShowTariffModifiersModal(false)
          setCurrentTariffPlan(null)
          setModifiers({})
          setSpecialDateIntervals({})
          setTemplateIntervals([{ id: 'template-1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
          setAffectedTariffPlans([])
          setAddedDates([])
          setRemovedDates([])
          loadCalendars()
          alert('Все тарифные планы обработаны')
        }
        return
      }
      
      setCurrentTariffPlan(tariffPlan)
      
      // Загружаем существующие модификаторы
      const existingModifiers = await tariffModifierService.getModifiers(tariffPlan.id)
      const modifiersMap: Record<string, TariffSpecialDateModifier> = {}
      
      // Инициализируем модификаторы только для добавленных дат
      datesToConfigure.forEach((date) => {
        const existing = existingModifiers.find((m) => m.date === date)
        if (existing) {
          modifiersMap[date] = existing
        } else {
          modifiersMap[date] = {
            id: 0,
            tariffPlanId: tariffPlan.id,
            date,
            modifierType: 'PERCENT_INCREASE',
            modifierValue: 0,
            createdAt: '',
            updatedAt: '',
          }
        }
      })
      
      setModifiers(modifiersMap)
      
      // Загружаем интервалы для добавленных дат из правил HOLIDAY
      const existingRules = await tariffService.getTariffRules(tariffPlan.id)
      const holidayRules = existingRules.filter((r) => r.ruleType === 'HOLIDAY')
      const intervalsMap: Record<string, TimeInterval[]> = {}
      
      holidayRules.forEach((rule) => {
        if (rule.conditions) {
          try {
            const conditions = JSON.parse(rule.conditions)
            if (conditions.date && datesToConfigure.includes(conditions.date)) {
              if (rule.pricingFormula) {
                try {
                  const formula = JSON.parse(rule.pricingFormula)
                  if (formula.model === 'TIME_BASED' && Array.isArray(formula.intervals)) {
                    intervalsMap[conditions.date] = formula.intervals.map((interval: any, index: number) => ({
                      id: (index + 1).toString(),
                      timeFrom: interval.timeFrom || '10:00',
                      timeTo: interval.timeTo || '18:00',
                      rate: interval.rate || 0,
                    }))
                  }
                } catch (e) {
                  console.error('Error parsing pricing formula', e)
                }
              }
            }
          } catch (e) {
            console.error('Error parsing conditions', e)
          }
        }
      })
      
      // Инициализируем пустые интервалы для добавленных дат без правил
      datesToConfigure.forEach((date) => {
        if (!intervalsMap[date]) {
          intervalsMap[date] = [{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }]
        }
      })
      
      setSpecialDateIntervals(intervalsMap)
      setShowTariffModifiersModal(true)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось загрузить данные тарифного плана')
    }
  }
  
  const handleSaveTariffModifiers = async () => {
    if (!currentTariffPlan) return

    try {
      // Преобразуем modifiers в формат для bulk upsert
      const modifiersToSave: Record<string, Record<string, any>> = {}
      Object.values(modifiers).forEach((modifier) => {
        modifiersToSave[modifier.date] = {
          modifierType: modifier.modifierType,
          modifierValue: modifier.modifierValue,
        }
      })

      await tariffModifierService.upsertModifiers(currentTariffPlan.id, modifiersToSave)
      
      // Сохраняем интервалы для добавленных дат как правила типа HOLIDAY
      const existingRules = await tariffService.getTariffRules(currentTariffPlan.id)
      const holidayRules = existingRules.filter((r) => r.ruleType === 'HOLIDAY')
      
      // Удаляем старые правила HOLIDAY для добавленных дат (если они уже существуют)
      for (const rule of holidayRules) {
        if (rule.conditions) {
          try {
            const conditions = JSON.parse(rule.conditions)
            if (conditions.date && addedDates.includes(conditions.date)) {
              await tariffService.deleteTariffRule(rule.id)
            }
          } catch (e) {
            // Игнорируем ошибки парсинга
          }
        }
      }
      
      // Создаем новые правила HOLIDAY только для добавленных дат с интервалами
      for (const date of addedDates) {
        const intervals = specialDateIntervals[date]
        if (intervals && intervals.length > 0 && intervals.some((i) => i.rate > 0)) {
          const conditions = JSON.stringify({ date })
          const pricingFormula = JSON.stringify({
            model: 'TIME_BASED',
            intervals: intervals.map((i) => ({
              timeFrom: i.timeFrom,
              timeTo: i.timeTo,
              rate: i.rate,
            })),
          })
          
          await tariffService.createTariffRule(currentTariffPlan.id, {
            ruleType: 'HOLIDAY',
            conditions,
            pricingFormula,
            ruleOrder: 2,
            isActive: true,
          } as any)
        }
      }
      
      // Переходим к следующему тарифному плану или закрываем модальное окно
      const nextIndex = currentTariffIndex + 1
      if (nextIndex < affectedTariffPlans.length) {
        setCurrentTariffIndex(nextIndex)
        loadTariffModifiers(affectedTariffPlans[nextIndex], addedDates)
      } else {
        setShowTariffModifiersModal(false)
        setCurrentTariffPlan(null)
        setModifiers({})
        setSpecialDateIntervals({})
        setTemplateIntervals([{ id: 'template-1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
        setAffectedTariffPlans([])
        setAddedDates([])
        setRemovedDates([])
        loadCalendars()
        alert('Все тарифные планы обновлены')
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось сохранить модификаторы')
    }
  }
  
  const handleModifierChange = (date: string, field: string, value: any) => {
    if (!currentTariffPlan) return
    
    const current = modifiers[date] || {
      id: 0,
      tariffPlanId: currentTariffPlan.id,
      date,
      modifierType: 'PERCENT_INCREASE',
      modifierValue: 0,
      createdAt: '',
      updatedAt: '',
    }

    setModifiers({
      ...modifiers,
      [date]: {
        ...current,
        [field]: value,
      },
    })
  }
  
  const handleApplyToAll = (field: string, value: any) => {
    const updated: Record<string, TariffSpecialDateModifier> = {}
    Object.keys(modifiers).forEach((date) => {
      updated[date] = {
        ...modifiers[date],
        [field]: value,
      }
    })
    setModifiers(updated)
  }
  
  const handleApplyTemplateIntervals = async () => {
    if (!currentTariffPlan || addedDates.length === 0) return
    
    try {
      const updated: Record<string, TimeInterval[]> = {}
      
      // Применяем шаблон только к добавленным датам
      addedDates.forEach((date) => {
        updated[date] = templateIntervals.map((interval, index) => ({
          ...interval,
          id: `${date}-${index + 1}`,
        }))
      })
      
      setSpecialDateIntervals(updated)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось применить шаблон интервалов')
    }
  }

  const handleDelete = async (calendar: Calendar) => {
    if (!confirm(`Удалить календарь "${calendar.name}"?`)) return
    try {
      await calendarService.deleteCalendar(calendar.id)
      loadCalendars()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось удалить календарь')
    }
  }

  const handleDateToggle = (date: string) => {
    const dateStr = date // YYYY-MM-DD
    const currentDates = formData.specialDates || []
    if (currentDates.includes(dateStr)) {
      setFormData({
        ...formData,
        specialDates: currentDates.filter((d) => d !== dateStr),
      })
    } else {
      setFormData({
        ...formData,
        specialDates: [...currentDates, dateStr],
      })
    }
  }

  const handleRemoveSpecialDate = (date: string) => {
    const currentDates = formData.specialDates || []
    setFormData({
      ...formData,
      specialDates: currentDates.filter((d) => d !== date),
    })
  }

  const columns = [
    { key: 'name', header: 'Название' },
    {
      key: 'weekendRule',
      header: 'Выходные',
      render: (item: Calendar) => {
        const rules: Record<string, string> = {
          SAT_SUN: 'Сб/Вс',
          MON_FRI: 'Пн-Пт (будни)',
          CUSTOM: 'Кастомное',
        }
        return rules[item.weekendRule] || item.weekendRule
      },
    },
    {
      key: 'specialDates',
      header: 'Особых дат',
      render: (item: Calendar) => item.specialDates?.length || 0,
    },
    {
      key: 'actions',
      header: 'Действия',
      render: (item: Calendar) => (
        <div className="action-buttons">
          <button onClick={() => handleEdit(item)} className="btn-small btn-primary">
            Edit
          </button>
          <button onClick={() => handleDelete(item)} className="btn-small btn-danger">
            Delete
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="calendar-page">
      <div className="page-header">
        <h1>Календари</h1>
        <button className="btn-primary" onClick={handleCreate}>
          Создать календарь
        </button>
      </div>

      <DataTable
        data={calendars}
        columns={columns}
        loading={loading}
        emptyMessage="No calendars found"
      />

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingCalendar ? 'Редактировать календарь' : 'Новый календарь'}
        size="large"
      >
        <div className="calendar-form">
          <FormInput
            label="Название календаря"
            value={formData.name || ''}
            onChange={(value) => setFormData({ ...formData, name: value })}
            required
            placeholder="Календарь 2026"
          />
          <label>
            <span>Правило выходных дней:</span>
            <select
              value={formData.weekendRule || 'SAT_SUN'}
              onChange={(e) => handleWeekendRuleChange(e.target.value)}
            >
              <option value="SAT_SUN">Сб/Вс - выходные (стандартное)</option>
              <option value="MON_FRI">Пн-Пт - выходные (обратный режим)</option>
              <option value="CUSTOM">Выбрать дни вручную</option>
            </select>
            <small style={{ display: 'block', marginTop: '4px', color: '#666' }}>
              Определяет, какие дни считаются выходными для применения тарифов типа "Выходной день".
              Это влияет на расчет цен при бронировании.
            </small>
          </label>
          
          {formData.weekendRule === 'CUSTOM' && (
            <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
                Выберите выходные дни:
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {weekDays.map((day) => {
                  // Убеждаемся, что weekendDays - это массив
                  let weekendDaysArray: number[] = []
                  if (Array.isArray(formData.weekendDays)) {
                    weekendDaysArray = formData.weekendDays
                  } else if (typeof formData.weekendDays === 'string') {
                    try {
                      weekendDaysArray = JSON.parse(formData.weekendDays)
                    } catch (e) {
                      weekendDaysArray = []
                    }
                  }
                  const isSelected = weekendDaysArray.includes(day.value)
                  return (
                    <label
                      key={day.value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 12px',
                        backgroundColor: isSelected ? '#2563eb' : '#fff',
                        color: isSelected ? '#fff' : '#333',
                        border: '1px solid #ddd',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleWeekendDayToggle(day.value)}
                        style={{ marginRight: '8px', cursor: 'pointer' }}
                      />
                      {day.label}
                    </label>
                  )
                })}
              </div>
              {(() => {
                let weekendDaysArray: number[] = []
                if (Array.isArray(formData.weekendDays)) {
                  weekendDaysArray = formData.weekendDays
                } else if (typeof formData.weekendDays === 'string') {
                  try {
                    weekendDaysArray = JSON.parse(formData.weekendDays)
                  } catch (e) {
                    weekendDaysArray = []
                  }
                }
                return weekendDaysArray.length > 0 ? (
                  <div style={{ marginTop: '10px', fontSize: '13px', color: '#666' }}>
                    Выбрано выходных дней: {weekendDaysArray.length}
                  </div>
                ) : null
              })()}
            </div>
          )}

          <div className="calendar-widget-section">
            <h3>Выбор особых дат</h3>
            <p className="instruction">
              Нажмите на дату, чтобы добавить/убрать её из списка особых дней
            </p>
            <CalendarWidget
              specialDates={formData.specialDates || []}
              weekendRule={formData.weekendRule || 'SAT_SUN'}
              weekendDays={(() => {
                if (Array.isArray(formData.weekendDays)) {
                  return formData.weekendDays
                } else if (typeof formData.weekendDays === 'string') {
                  try {
                    return JSON.parse(formData.weekendDays)
                  } catch (e) {
                    return []
                  }
                }
                return []
              })()}
              onDateToggle={handleDateToggle}
            />
          </div>

          {formData.specialDates && formData.specialDates.length > 0 && (
            <div className="special-dates-list">
              <h3>Особые дни ({formData.specialDates.length}):</h3>
              <div className="dates-grid">
                {formData.specialDates
                  .sort()
                  .map((date) => (
                    <div key={date} className="special-date-badge">
                      <span>{new Date(date).toLocaleDateString('ru-RU')}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSpecialDate(date)}
                        className="remove-date-btn"
                      >
                        ×
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

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

      {/* Modal для предупреждения о затронутых тарифных планах */}
      <Modal
        isOpen={showAffectedTariffsModal}
        onClose={() => {
          setShowAffectedTariffsModal(false)
          setAffectedTariffPlans([])
          setAddedDates([])
          setRemovedDates([])
          loadCalendars()
        }}
        title="Внимание: Тарифные планы будут изменены"
      >
        <div style={{ padding: '20px' }}>
          <p style={{ marginBottom: '15px' }}>
            При изменении календаря были добавлены или удалены особые даты. 
            Следующие тарифные планы используют этот календарь и будут затронуты:
          </p>
          
          {addedDates.length > 0 && (
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#d4edda', borderRadius: '5px' }}>
              <strong>Добавленные даты:</strong>
              <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                {addedDates.map((date) => (
                  <li key={date}>{new Date(date).toLocaleDateString('ru-RU')}</li>
                ))}
              </ul>
            </div>
          )}
          
          {removedDates.length > 0 && (
            <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f8d7da', borderRadius: '5px' }}>
              <strong>Удаленные даты:</strong>
              <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                {removedDates.map((date) => (
                  <li key={date}>{new Date(date).toLocaleDateString('ru-RU')}</li>
                ))}
              </ul>
            </div>
          )}
          
          <div style={{ marginBottom: '20px' }}>
            <strong>Затронутые тарифные планы ({affectedTariffPlans.length}):</strong>
            <ul style={{ margin: '10px 0', paddingLeft: '20px' }}>
              {affectedTariffPlans.map((plan) => (
                <li key={plan.id}>{plan.name}</li>
              ))}
            </ul>
          </div>
          
          <p style={{ marginBottom: '20px', color: '#666' }}>
            Для каждого тарифного плана необходимо настроить модификаторы цен и интервалы времени для новых особых дат.
          </p>
          
          <div className="form-actions">
            <button 
              className="btn-secondary" 
              onClick={() => {
                setShowAffectedTariffsModal(false)
                setAffectedTariffPlans([])
                setAddedDates([])
                setRemovedDates([])
                loadCalendars()
              }}
            >
              Отмена
            </button>
            <button className="btn-primary" onClick={handleConfirmTariffUpdate}>
              Продолжить
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal для настройки модификаторов тарифного плана */}
      <Modal
        isOpen={showTariffModifiersModal}
        onClose={() => {
          setShowTariffModifiersModal(false)
          setCurrentTariffPlan(null)
          setModifiers({})
          setSpecialDateIntervals({})
          setTemplateIntervals([{ id: 'template-1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
        }}
        title={`Настройки цен для особых дат: ${currentTariffPlan?.name || ''} (${currentTariffIndex + 1} из ${affectedTariffPlans.length})`}
        size="large"
      >
        {currentTariffPlan && (
          <div className="modifiers-form">
            <div className="modifiers-info">
              <p>
                Настройте модификаторы цен и интервалы времени для <strong>новых особых дат</strong>, которые были добавлены в календарь.
              </p>
              {addedDates.length > 0 && (
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#e3f2fd', borderRadius: '5px' }}>
                  <strong>Новые даты ({addedDates.length}):</strong>
                  <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                    {addedDates.map((date) => (
                      <li key={date}>{new Date(date).toLocaleDateString('ru-RU')}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Интервалы времени для особых дат */}
            <div style={{ marginTop: '20px', marginBottom: '30px' }}>
              <h4 style={{ marginBottom: '10px' }}>Интервалы времени для особых дат</h4>
              
              {/* Блок для применения интервалов ко всем датам */}
              <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f9f9f9', border: '2px solid #2563eb', borderRadius: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h5 style={{ margin: 0, color: '#2563eb' }}>Шаблон интервалов (применить ко всем датам)</h5>
                  <button
                    type="button"
                    onClick={handleApplyTemplateIntervals}
                    className="btn-primary"
                    style={{ padding: '8px 16px' }}
                  >
                    Применить ко всем датам
                  </button>
                </div>
                <TimeIntervalTable
                  intervals={templateIntervals}
                  onChange={setTemplateIntervals}
                  label=""
                />
              </div>
              
              {/* Список интервалов для каждой даты */}
              <div style={{ marginTop: '20px' }}>
                <h5 style={{ marginBottom: '15px' }}>Интервалы по датам (только новые даты):</h5>
                <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
                  {addedDates
                    .filter((date) => specialDateIntervals[date])
                    .sort()
                    .map((date) => {
                      const intervals = specialDateIntervals[date] || [{ id: `${date}-1`, timeFrom: '10:00', timeTo: '18:00', rate: 0 }]
                      return (
                        <div key={date} style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
                            {new Date(date).toLocaleDateString('ru-RU')}
                          </div>
                          <TimeIntervalTable
                            intervals={intervals}
                            onChange={(newIntervals) => {
                              setSpecialDateIntervals({
                                ...specialDateIntervals,
                                [date]: newIntervals,
                              })
                            }}
                            label=""
                          />
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>

            {/* Модификаторы цен */}
            <div style={{ marginTop: '30px', marginBottom: '20px' }}>
              <h4 style={{ marginBottom: '10px' }}>Модификаторы цен</h4>
            </div>

            <div className="modifiers-actions" style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '20px' }}>
              <label style={{ flex: '1', minWidth: '200px' }}>
                Применить тип ко всем датам:
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleApplyToAll('modifierType', e.target.value)
                      e.target.value = ''
                    }
                  }}
                >
                  <option value="">-- Выберите тип --</option>
                  <option value="PERCENT_INCREASE">Увеличение на процент</option>
                  <option value="PERCENT_DECREASE">Уменьшение на процент</option>
                  <option value="FIXED_INCREASE">Увеличение на фиксированную сумму</option>
                  <option value="FIXED_DECREASE">Уменьшение на фиксированную сумму</option>
                </select>
              </label>
              <label style={{ flex: '1', minWidth: '200px' }}>
                Применить значение ко всем датам:
                <div style={{ display: 'flex', gap: '5px' }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={applyToAllValue}
                    onChange={(e) => setApplyToAllValue(e.target.value)}
                    placeholder="Введите значение"
                    style={{ flex: '1', padding: '4px' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const value = parseFloat(applyToAllValue)
                      if (!isNaN(value) && value >= 0) {
                        handleApplyToAll('modifierValue', value)
                        setApplyToAllValue('')
                      } else {
                        alert('Пожалуйста, введите корректное положительное число')
                      }
                    }}
                    className="btn-small btn-primary"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    Применить
                  </button>
                </div>
              </label>
            </div>

            <div className="modifiers-list">
              <table className="modifiers-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Тип изменения</th>
                    <th>Тип</th>
                    <th>Значение</th>
                    <th>Пример расчета</th>
                  </tr>
                </thead>
                <tbody>
                  {addedDates
                    .filter((date) => modifiers[date])
                    .sort()
                    .map((date) => {
                      const modifier = modifiers[date] || {
                        modifierType: 'PERCENT_INCREASE',
                        modifierValue: 0,
                      }
                      const exampleBase = 1000
                      const modifierValue = modifier.modifierValue || 0
                      let exampleResult = exampleBase
                      let exampleDescription = ''
                      if (modifierValue === 0) {
                        exampleDescription = '(без изменений)'
                      } else if (modifier.modifierType === 'PERCENT_INCREASE') {
                        exampleResult = exampleBase * (1 + modifierValue / 100)
                        exampleDescription = `+${modifierValue}%`
                      } else if (modifier.modifierType === 'PERCENT_DECREASE') {
                        exampleResult = exampleBase * (1 - modifierValue / 100)
                        exampleDescription = `-${modifierValue}%`
                      } else if (modifier.modifierType === 'FIXED_INCREASE') {
                        exampleResult = exampleBase + modifierValue
                        exampleDescription = `+${modifierValue}₽`
                      } else if (modifier.modifierType === 'FIXED_DECREASE') {
                        exampleResult = Math.max(0, exampleBase - modifierValue)
                        exampleDescription = `-${modifierValue}₽`
                      }

                      return (
                        <tr key={date}>
                          <td>{new Date(date).toLocaleDateString('ru-RU')}</td>
                          <td>
                            <select
                              value={modifier.modifierType}
                              onChange={(e) => handleModifierChange(date, 'modifierType', e.target.value)}
                            >
                              <option value="PERCENT_INCREASE">Увеличение</option>
                              <option value="PERCENT_DECREASE">Уменьшение</option>
                            </select>
                          </td>
                          <td>
                            <select
                              value={modifier.modifierType.includes('PERCENT') ? 'PERCENT' : 'FIXED'}
                              onChange={(e) => {
                                const changeType = modifier.modifierType.includes('INCREASE') ? 'INCREASE' : 'DECREASE'
                                const newType = e.target.value === 'PERCENT' 
                                  ? `PERCENT_${changeType}` 
                                  : `FIXED_${changeType}`
                                handleModifierChange(date, 'modifierType', newType)
                              }}
                            >
                              <option value="PERCENT">Процент (%)</option>
                              <option value="FIXED">Фиксированная сумма (₽)</option>
                            </select>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={modifier.modifierValue === 0 ? '' : modifier.modifierValue}
                              onChange={(e) => {
                                const value = e.target.value === '' ? 0 : parseFloat(e.target.value)
                                handleModifierChange(date, 'modifierValue', !isNaN(value) ? value : 0)
                              }}
                              placeholder="0"
                              style={{ width: '100px', padding: '4px' }}
                            />
                          </td>
                          <td>
                            {exampleBase}₽ {exampleDescription && `→ ${exampleResult.toFixed(2)}₽ ${exampleDescription}`}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>

            <div className="form-actions" style={{ marginTop: '20px' }}>
              <button 
                className="btn-secondary" 
                onClick={() => {
                  setShowTariffModifiersModal(false)
                  setCurrentTariffPlan(null)
                  setModifiers({})
                  setSpecialDateIntervals({})
                  setTemplateIntervals([{ id: 'template-1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
                  setAffectedTariffPlans([])
                  setAddedDates([])
                  setRemovedDates([])
                  loadCalendars()
                }}
              >
                Пропустить
              </button>
              <button className="btn-primary" onClick={handleSaveTariffModifiers}>
                {currentTariffIndex + 1 < affectedTariffPlans.length ? 'Сохранить и продолжить' : 'Сохранить'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}


