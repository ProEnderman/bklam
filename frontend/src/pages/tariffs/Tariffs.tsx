import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { tariffService, calendarService, tariffModifierService } from '../../api/services'
import type { TariffPlan, Calendar, TariffSpecialDateModifier, TariffRule } from '../../api/types'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import FormInput from '../../components/FormInput'
import TimeIntervalTable, { TimeInterval } from '../../components/TimeIntervalTable'
import './Tariffs.css'

export default function Tariffs() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<TariffPlan[]>([])
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showModifiersModal, setShowModifiersModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<TariffPlan | null>(null)
  const [formData, setFormData] = useState<Partial<TariffPlan>>({
    name: '',
    description: '',
    isActive: true,
  })
  const [weekdayIntervals, setWeekdayIntervals] = useState<TimeInterval[]>([])
  const [weekendIntervals, setWeekendIntervals] = useState<TimeInterval[]>([])
  const [specialDateIntervals, setSpecialDateIntervals] = useState<Record<string, TimeInterval[]>>({})
  const [templateIntervals, setTemplateIntervals] = useState<TimeInterval[]>([{ id: 'template-1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
  const [selectedCalendarId, setSelectedCalendarId] = useState<number | undefined>(undefined)
  const [selectedCalendar, setSelectedCalendar] = useState<Calendar | null>(null)
  const [modifiers, setModifiers] = useState<Record<string, TariffSpecialDateModifier>>({})
  const [loadingModifiers, setLoadingModifiers] = useState(false)
  const [applyToAllValue, setApplyToAllValue] = useState<string>('')
  const [templateTimeOverride, setTemplateTimeOverride] = useState(false)
  const [templateTimeFrom, setTemplateTimeFrom] = useState('10:00')
  const [templateTimeTo, setTemplateTimeTo] = useState('22:00')

  useEffect(() => {
    loadPlans()
    loadCalendars()
  }, [])

  const loadPlans = async () => {
    setLoading(true)
    try {
      const response = await tariffService.getTariffPlans(undefined, undefined, 0, 100)
      setPlans(Array.isArray(response.content) ? response.content : [])
    } catch (error) {
      console.error('Failed to load tariff plans:', error)
      setPlans([])
    } finally {
      setLoading(false)
    }
  }

  const loadCalendars = async () => {
    try {
      const data = await calendarService.getCalendars()
      setCalendars(data)
    } catch (error) {
      console.error('Failed to load calendars:', error)
    }
  }

  const handleCreate = () => {
    setEditingPlan(null)
    setFormData({
      name: '',
      description: '',
      isActive: true,
      bookingTimeFrom: '00:00',
      bookingTimeTo: '23:59',
    })
    setWeekdayIntervals([{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
    setWeekendIntervals([{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
    setSpecialDateIntervals({})
    setSelectedCalendarId(undefined)
    setShowModal(true)
  }

  const parseIntervalsFromFormula = (formula: any): TimeInterval[] => {
    if (formula.model === 'TIME_BASED' && Array.isArray(formula.intervals)) {
      return formula.intervals.map((interval: any, index: number) => ({
        id: (index + 1).toString(),
        timeFrom: interval.timeFrom || '10:00',
        timeTo: interval.timeTo || '18:00',
        rate: interval.rate || 0,
      }))
    } else if (formula.rate) {
      // Старый формат: простая ставка, преобразуем в один интервал
      return [
        {
          id: '1',
          timeFrom: '00:00',
          timeTo: '23:59',
          rate: formula.rate,
        },
      ]
    }
    return [{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }]
  }

  // Нормализует LocalTime из формата массива [h, m] или строки "HH:mm:ss" в "HH:mm"
  const normalizeTime = (value: any, fallback: string): string => {
    if (!value) return fallback
    if (Array.isArray(value)) {
      const h = String(value[0]).padStart(2, '0')
      const m = String(value[1] || 0).padStart(2, '0')
      return `${h}:${m}`
    }
    if (typeof value === 'string') return value.slice(0, 5)
    return fallback
  }

  const handleEdit = async (plan: TariffPlan) => {
    setEditingPlan(plan)
    // Нормализуем bookingTimeFrom/To перед установкой formData
    const normalizedPlan = {
      ...plan,
      bookingTimeFrom: normalizeTime(plan.bookingTimeFrom, '00:00'),
      bookingTimeTo: normalizeTime(plan.bookingTimeTo, '23:59'),
    }
    setFormData(normalizedPlan)
    const calendarId = (plan as any).calendarId || (plan as any).calendar?.id
    setSelectedCalendarId(calendarId || undefined)
    
    // Загружаем существующие правила для получения цен
    try {
      const rules = await tariffService.getTariffRules(plan.id)
      const weekdayRule = rules.find((r) => r.ruleType === 'STANDARD')
      const weekendRule = rules.find((r) => r.ruleType === 'WEEKEND')
      
      if (weekdayRule?.pricingFormula) {
        try {
          const formula = JSON.parse(weekdayRule.pricingFormula)
          setWeekdayIntervals(parseIntervalsFromFormula(formula))
        } catch (e) {
          console.error('Failed to parse weekday pricing formula', e)
          setWeekdayIntervals([{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
        }
      } else {
        setWeekdayIntervals([{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
      }
      
      if (weekendRule?.pricingFormula) {
        try {
          const formula = JSON.parse(weekendRule.pricingFormula)
          setWeekendIntervals(parseIntervalsFromFormula(formula))
        } catch (e) {
          console.error('Failed to parse weekend pricing formula', e)
          setWeekendIntervals([{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
        }
      } else {
        setWeekendIntervals([{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
      }
    } catch (error) {
      console.error('Failed to load tariff rules', error)
      setWeekdayIntervals([{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
      setWeekendIntervals([{ id: '1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
    }
    
    setSpecialDateIntervals({})
    setShowModal(true)
  }

  const loadSpecialDateIntervals = async (planId: number, calendar: Calendar): Promise<Record<string, TimeInterval[]>> => {
    // Загружаем правила типа HOLIDAY для особых дат
    try {
      const rules = await tariffService.getTariffRules(planId)
      const holidayRules = rules.filter((r) => r.ruleType === 'HOLIDAY')
      const intervalsMap: Record<string, TimeInterval[]> = {}
      
      for (const rule of holidayRules) {
        if (rule.conditions && rule.pricingFormula) {
          try {
            const conditions = JSON.parse(rule.conditions)
            const formula = JSON.parse(rule.pricingFormula)
            if (conditions.date && formula.model === 'TIME_BASED' && formula.intervals) {
              intervalsMap[conditions.date] = formula.intervals.map((interval: any, index: number) => ({
                id: `${conditions.date}-${index}`,
                timeFrom: interval.timeFrom || '10:00',
                timeTo: interval.timeTo || '18:00',
                rate: interval.rate || 0,
              }))
            }
          } catch (e) {
            console.error('Error parsing holiday rule', e)
          }
        }
      }
      
      // Инициализируем пустые интервалы для дат без правил
      if (calendar.specialDates) {
        for (const date of calendar.specialDates) {
          if (!intervalsMap[date]) {
            intervalsMap[date] = [{ id: `${date}-1`, timeFrom: '10:00', timeTo: '18:00', rate: 0 }]
          }
        }
      }
      
      setSpecialDateIntervals(intervalsMap)
      return intervalsMap
    } catch (error) {
      console.error('Failed to load special date intervals', error)
      return {}
    }
  }

  const handleOpenModifiers = async (plan: TariffPlan) => {
    setEditingPlan(plan)
    const calendarId = (plan as any).calendarId || (plan as any).calendar?.id
    if (!calendarId) {
      alert('Сначала выберите календарь для тарифа')
      return
    }

    try {
      setLoadingModifiers(true)
      const calendar = await calendarService.getCalendar(calendarId)
      setSelectedCalendar(calendar)

      // Загружаем существующие модификаторы
      const existingModifiers = await tariffModifierService.getModifiers(plan.id)
      const modifiersMap: Record<string, TariffSpecialDateModifier> = {}
      existingModifiers.forEach((m) => {
        modifiersMap[m.date] = m
      })

      // Инициализируем модификаторы для всех особых дат календаря
      if (calendar.specialDates) {
        for (const date of calendar.specialDates) {
          if (!modifiersMap[date]) {
            modifiersMap[date] = {
              id: 0,
              tariffPlanId: plan.id,
              date,
              modifierType: 'PERCENT_INCREASE',
              modifierValue: 0,
              createdAt: '',
              updatedAt: '',
            }
          }
        }
      }

      setModifiers(modifiersMap)
      
      // Загружаем интервалы для особых дат
      const loadedIntervals = await loadSpecialDateIntervals(plan.id, calendar)
      
      // Инициализируем шаблон интервалов из первой даты, если есть интервалы
      if (calendar.specialDates && calendar.specialDates.length > 0) {
        const sortedDates = [...calendar.specialDates].sort()
        const firstDate = sortedDates[0]
        const firstDateIntervals = loadedIntervals[firstDate]
        if (firstDateIntervals && firstDateIntervals.length > 0) {
          // Копируем интервалы с новыми ID для шаблона
          setTemplateIntervals(firstDateIntervals.map((interval, index) => ({
            ...interval,
            id: `template-${index}-${Date.now()}`,
          })))
        } else {
          // Инициализируем пустым шаблоном
          setTemplateIntervals([{ id: 'template-1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
        }

        // Инициализируем шаблон времени работы из первой даты
        const firstModifier = modifiersMap[firstDate]
        if (firstModifier?.bookingTimeFrom && firstModifier?.bookingTimeTo) {
          setTemplateTimeOverride(true)
          setTemplateTimeFrom(normalizeTime(firstModifier.bookingTimeFrom, '10:00'))
          setTemplateTimeTo(normalizeTime(firstModifier.bookingTimeTo, '22:00'))
        } else {
          setTemplateTimeOverride(false)
          setTemplateTimeFrom('10:00')
          setTemplateTimeTo('22:00')
        }
      } else {
        setTemplateIntervals([{ id: 'template-1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
        setTemplateTimeOverride(false)
        setTemplateTimeFrom('10:00')
        setTemplateTimeTo('22:00')
      }
      
      setShowModifiersModal(true)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось загрузить модификаторы')
    } finally {
      setLoadingModifiers(false)
    }
  }

  const handleSave = async () => {
    try {
      if (!formData.name) {
        alert('Пожалуйста, укажите название мероприятия')
        return
      }
      
      // Проверяем, что есть хотя бы один интервал для будней и выходных
      if (weekdayIntervals.length === 0 || weekendIntervals.length === 0) {
        alert('Пожалуйста, добавьте хотя бы один временной интервал для будней и выходных')
        return
      }
      
      // Проверяем, что все интервалы заполнены
      const allWeekdayValid = weekdayIntervals.every((i) => i.timeFrom && i.timeTo && i.rate > 0)
      const allWeekendValid = weekendIntervals.every((i) => i.timeFrom && i.timeTo && i.rate > 0)
      
      if (!allWeekdayValid || !allWeekendValid) {
        alert('Пожалуйста, заполните все поля временных интервалов (время и цена)')
        return
      }

      // Проверяем, что интервалы цен не выходят за рамки допустимого времени брони
      const bookingFrom = (formData.bookingTimeFrom || '00:00').slice(0, 5)
      const bookingTo = (formData.bookingTimeTo || '23:59').slice(0, 5)
      const is24_7 = bookingFrom === '00:00' && bookingTo === '23:59'

      if (!is24_7) {
        const crossesMidnight = bookingFrom > bookingTo // например 18:00 - 02:00

        const isTimeInRange = (time: string): boolean => {
          const t = time.slice(0, 5)
          if (crossesMidnight) {
            return t >= bookingFrom || t <= bookingTo
          }
          return t >= bookingFrom && t <= bookingTo
        }

        const checkIntervals = (intervals: TimeInterval[], label: string): string | null => {
          for (const interval of intervals) {
            const from = interval.timeFrom.slice(0, 5)
            const to = interval.timeTo.slice(0, 5)
            if (!isTimeInRange(from) || !isTimeInRange(to)) {
              return `${label}: интервал ${from}–${to} выходит за рамки допустимого времени брони (${bookingFrom}–${bookingTo})`
            }
          }
          return null
        }

        const weekdayError = checkIntervals(weekdayIntervals, 'Будни')
        if (weekdayError) {
          alert(weekdayError)
          return
        }

        const weekendError = checkIntervals(weekendIntervals, 'Выходные')
        if (weekendError) {
          alert(weekendError)
          return
        }
      }

      const dataToSave: any = {
        ...formData,
      }
      if (selectedCalendarId) {
        dataToSave.calendar = { id: selectedCalendarId }
      } else {
        dataToSave.calendar = null
      }
      
      let savedPlan: TariffPlan
      if (editingPlan) {
        savedPlan = await tariffService.updateTariffPlan(editingPlan.id, dataToSave)
      } else {
        savedPlan = await tariffService.createTariffPlan(dataToSave)
      }

      // Создаем/обновляем правила для будней и выходных с временными интервалами
      const weekdayFormula = JSON.stringify({
        model: 'TIME_BASED',
        intervals: weekdayIntervals.map((i) => ({
          timeFrom: i.timeFrom,
          timeTo: i.timeTo,
          rate: i.rate,
        })),
      })
      const weekendFormula = JSON.stringify({
        model: 'TIME_BASED',
        intervals: weekendIntervals.map((i) => ({
          timeFrom: i.timeFrom,
          timeTo: i.timeTo,
          rate: i.rate,
        })),
      })

      // Получаем существующие правила
      const existingRules = await tariffService.getTariffRules(savedPlan.id)
      const weekdayRule = existingRules.find((r) => r.ruleType === 'STANDARD')
      const weekendRule = existingRules.find((r) => r.ruleType === 'WEEKEND')

      // Создаем или обновляем правило для будней
      try {
        if (weekdayRule) {
          await tariffService.updateTariffRule(weekdayRule.id, {
            ruleType: 'STANDARD',
            pricingFormula: weekdayFormula,
            ruleOrder: weekdayRule.ruleOrder ?? 0,
            isActive: weekdayRule.isActive ?? true,
            conditions: weekdayRule.conditions,
            roundingType: weekdayRule.roundingType,
            roundingPrecision: weekdayRule.roundingPrecision,
            minAmount: weekdayRule.minAmount,
            maxAmount: weekdayRule.maxAmount,
            minDurationMinutes: weekdayRule.minDurationMinutes,
            maxDurationMinutes: weekdayRule.maxDurationMinutes,
            freeMinutes: weekdayRule.freeMinutes,
            freeUnits: weekdayRule.freeUnits,
          } as Partial<TariffRule>)
        } else {
          await tariffService.createTariffRule(savedPlan.id, {
            ruleType: 'STANDARD',
            pricingFormula: weekdayFormula,
            ruleOrder: 0,
            isActive: true,
          } as Partial<TariffRule>)
        }
      } catch (ruleError: any) {
        console.error('Failed to save weekday rule:', ruleError)
        throw new Error('Не удалось сохранить правило для будней: ' + (ruleError.response?.data?.message || ruleError.message))
      }

      // Создаем или обновляем правило для выходных
      try {
        if (weekendRule) {
          await tariffService.updateTariffRule(weekendRule.id, {
            ruleType: 'WEEKEND',
            pricingFormula: weekendFormula,
            ruleOrder: weekendRule.ruleOrder ?? 1,
            isActive: weekendRule.isActive ?? true,
            conditions: weekendRule.conditions,
            roundingType: weekendRule.roundingType,
            roundingPrecision: weekendRule.roundingPrecision,
            minAmount: weekendRule.minAmount,
            maxAmount: weekendRule.maxAmount,
            minDurationMinutes: weekendRule.minDurationMinutes,
            maxDurationMinutes: weekendRule.maxDurationMinutes,
            freeMinutes: weekendRule.freeMinutes,
            freeUnits: weekendRule.freeUnits,
          } as Partial<TariffRule>)
        } else {
          await tariffService.createTariffRule(savedPlan.id, {
            ruleType: 'WEEKEND',
            pricingFormula: weekendFormula,
            ruleOrder: 1,
            isActive: true,
          } as Partial<TariffRule>)
        }
      } catch (ruleError: any) {
        console.error('Failed to save weekend rule:', ruleError)
        throw new Error('Не удалось сохранить правило для выходных: ' + (ruleError.response?.data?.message || ruleError.message))
      }

      // Инициализируем модификаторы, если выбран календарь
      if (selectedCalendarId) {
        await tariffModifierService.initializeModifiers(savedPlan.id, selectedCalendarId)
      }

      setShowModal(false)
      loadPlans()

      // Если выбран календарь с особыми датами, открываем модальное окно для настройки модификаторов
      if (selectedCalendarId) {
        const calendar = await calendarService.getCalendar(selectedCalendarId)
        if (calendar.specialDates && calendar.specialDates.length > 0) {
          setEditingPlan(savedPlan)
          setSelectedCalendar(calendar)
          
          // Загружаем существующие модификаторы
          const existingModifiers = await tariffModifierService.getModifiers(savedPlan.id)
          const modifiersMap: Record<string, TariffSpecialDateModifier> = {}
          existingModifiers.forEach((m) => {
            modifiersMap[m.date] = m
          })

      // Инициализируем модификаторы для всех особых дат календаря
      for (const date of calendar.specialDates) {
        if (!modifiersMap[date]) {
          modifiersMap[date] = {
            id: 0,
            tariffPlanId: savedPlan.id,
            date,
            modifierType: 'PERCENT_INCREASE',
            modifierValue: 0,
            createdAt: '',
            updatedAt: '',
          }
        }
      }

          setModifiers(modifiersMap)
          setShowModifiersModal(true)
        }
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось сохранить тарифный план')
    }
  }

  const handleSaveModifiers = async () => {
    if (!editingPlan) return

    try {
      // Преобразуем modifiers в формат для bulk upsert
      const modifiersToSave: Record<string, Record<string, any>> = {}
      Object.values(modifiers).forEach((modifier) => {
        modifiersToSave[modifier.date] = {
          modifierType: modifier.modifierType,
          modifierValue: modifier.modifierValue,
          bookingTimeFrom: modifier.bookingTimeFrom || null,
          bookingTimeTo: modifier.bookingTimeTo || null,
        }
      })

      await tariffModifierService.upsertModifiers(editingPlan.id, modifiersToSave)
      
      // Сохраняем интервалы для особых дат как правила типа HOLIDAY
      if (selectedCalendar && selectedCalendar.specialDates) {
        const existingRules = await tariffService.getTariffRules(editingPlan.id)
        const holidayRules = existingRules.filter((r) => r.ruleType === 'HOLIDAY')
        
        // Удаляем старые правила HOLIDAY для особых дат
        for (const rule of holidayRules) {
          if (rule.conditions) {
            try {
              const conditions = JSON.parse(rule.conditions)
              if (conditions.date && selectedCalendar.specialDates.includes(conditions.date)) {
                await tariffService.deleteTariffRule(rule.id)
              }
            } catch (e) {
              // Игнорируем ошибки парсинга
            }
          }
        }
        
        // Создаем новые правила HOLIDAY для дат с интервалами
        for (const date of selectedCalendar.specialDates) {
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
            
            await tariffService.createTariffRule(editingPlan.id, {
              ruleType: 'HOLIDAY',
              conditions,
              pricingFormula,
              ruleOrder: 2,
              isActive: true,
            } as Partial<TariffRule>)
          }
        }
      }
      
      setShowModifiersModal(false)
      setEditingPlan(null)
      setSelectedCalendar(null)
      setModifiers({})
      setSpecialDateIntervals({})
      setTemplateIntervals([{ id: 'template-1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
      setTemplateTimeOverride(false)
      setTemplateTimeFrom('10:00')
      setTemplateTimeTo('22:00')
      loadPlans()
      alert('Модификаторы и интервалы сохранены')
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось сохранить модификаторы')
    }
  }

  const handleModifierChange = (date: string, field: string, value: any) => {
    setModifiers((prev) => {
      const current = prev[date] || {
        id: 0,
        tariffPlanId: editingPlan!.id,
        date,
        modifierType: 'PERCENT_INCREASE' as const,
        modifierValue: 0,
        createdAt: '',
        updatedAt: '',
      }
      return {
        ...prev,
        [date]: {
          ...current,
          [field]: value,
        },
      }
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

  const handleDelete = async (plan: TariffPlan) => {
    if (!confirm(`Delete tariff plan "${plan.name}"?`)) return
    try {
      await tariffService.deleteTariffPlan(plan.id)
      loadPlans()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete tariff plan')
    }
  }

  const columns = [
    { key: 'name', header: 'Название мероприятия' },
    {
      key: 'calendar',
      header: 'Календарь',
      render: (item: TariffPlan) => {
        const calendarId = (item as any).calendarId || (item as any).calendar?.id
        if (calendarId) {
          const cal = calendars.find((c) => c.id === calendarId)
          return cal ? cal.name : 'Не указан'
        }
        return 'Не указан'
      },
    },
    {
      key: 'bookingTime',
      header: 'Время брони',
      render: (item: TariffPlan) => {
        const from = normalizeTime(item.bookingTimeFrom, '00:00')
        const to = normalizeTime(item.bookingTimeTo, '23:59')
        if (from === '00:00' && to === '23:59') return <span style={{ color: '#16a34a', fontWeight: 500 }}>24/7</span>
        return `${from}–${to}`
      },
    },
    {
      key: 'isActive',
      header: 'Активен',
      render: (item: TariffPlan) => (item.isActive ? 'Да' : 'Нет'),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: TariffPlan) => (
        <div className="action-buttons">
          <button
            onClick={() => navigate(`/tariffs/${item.id}/rules`)}
            className="btn-small btn-primary"
          >
            Rules
          </button>
          <button onClick={() => handleOpenModifiers(item)} className="btn-small btn-secondary">
            Modifiers
          </button>
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
    <div className="tariffs-page">
      <div className="page-header">
        <h1>Тарифные планы (Мероприятия)</h1>
        <button className="btn-primary" onClick={handleCreate}>
          Новое мероприятие
        </button>
      </div>

      <DataTable
        data={plans}
        columns={columns}
        loading={loading}
        emptyMessage="No tariff plans found"
      />

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingPlan ? 'Редактировать мероприятие' : 'Новое мероприятие'}
      >
        <div className="tariff-form">
          <FormInput
            label="Название мероприятия (например: Бильярд 6 столов, Кинозал)"
            value={formData.name || ''}
            onChange={(value) => setFormData({ ...formData, name: value })}
            required
            placeholder="Бильярд 6 столов"
          />
          <FormInput
            label="Описание"
            value={formData.description || ''}
            onChange={(value) => setFormData({ ...formData, description: value })}
            type="textarea"
            placeholder="Описание мероприятия и тарификации"
          />
          <div className="form-row" style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={
                  (formData.bookingTimeFrom || '00:00').slice(0, 5) === '00:00' &&
                  ((formData.bookingTimeTo || '23:59').slice(0, 5) === '23:59')
                }
                onChange={(e) => {
                  if (e.target.checked) {
                    setFormData({ ...formData, bookingTimeFrom: '00:00', bookingTimeTo: '23:59' })
                  } else {
                    setFormData({ ...formData, bookingTimeFrom: '10:00', bookingTimeTo: '22:00' })
                  }
                }}
              />
              <span style={{ fontWeight: 500, fontSize: '14px' }}>Круглосуточно (24/7)</span>
            </label>
            {!(
              (formData.bookingTimeFrom || '00:00').slice(0, 5) === '00:00' &&
              (formData.bookingTimeTo || '23:59').slice(0, 5) === '23:59'
            ) && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>с</span>
                  <input
                    type="time"
                    value={(formData.bookingTimeFrom || '10:00').slice(0, 5)}
                    onChange={(e) => setFormData({ ...formData, bookingTimeFrom: e.target.value })}
                    style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>до</span>
                  <input
                    type="time"
                    value={(formData.bookingTimeTo || '22:00').slice(0, 5)}
                    onChange={(e) => setFormData({ ...formData, bookingTimeTo: e.target.value })}
                    style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                  />
                </label>
                <small style={{ color: '#666', fontSize: '12px' }}>
                  Например: 18:00–02:00 для вечерних мероприятий
                </small>
              </>
            )}
          </div>

          <TimeIntervalTable
            intervals={weekdayIntervals}
            onChange={setWeekdayIntervals}
            label="Цены в будни по времени"
          />
          
          <TimeIntervalTable
            intervals={weekendIntervals}
            onChange={setWeekendIntervals}
            label="Цены в выходные по времени"
          />
          <div className="form-row">
            <label>
              <span>Календарь (для особых дат):</span>
              <select
                value={selectedCalendarId || ''}
                onChange={(e) => setSelectedCalendarId(e.target.value ? parseInt(e.target.value) : undefined)}
              >
                <option value="">-- Выберите календарь --</option>
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.name} ({cal.specialDates?.length || 0} особых дат)
                  </option>
                ))}
              </select>
              <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                Календарь определяет выходные дни и особые даты. После выбора календаря настройте модификаторы цен для особых дат.
              </small>
            </label>
            <label>
              <input
                type="checkbox"
                checked={formData.isActive ?? true}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              />
              Активен
            </label>
          </div>
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

      {/* Modal для настройки модификаторов особых дат */}
      <Modal
        isOpen={showModifiersModal}
        onClose={() => {
          setShowModifiersModal(false)
          setTemplateIntervals([{ id: 'template-1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
          setTemplateTimeOverride(false)
          setTemplateTimeFrom('10:00')
          setTemplateTimeTo('22:00')
        }}
        title={`Настройки цен для особых дат: ${editingPlan?.name || ''}`}
        size="large"
      >
        {loadingModifiers ? (
          <p>Загрузка...</p>
        ) : selectedCalendar && selectedCalendar.specialDates && selectedCalendar.specialDates.length > 0 ? (
          <div className="modifiers-form">
            <div className="modifiers-info">
              <p>
                Календарь <strong>{selectedCalendar.name}</strong> содержит{' '}
                <strong>{selectedCalendar.specialDates.length}</strong> особых дат.
              </p>
            </div>

            {/* Интервалы времени для особых дат - перемещены наверх */}
            <div style={{ marginTop: '20px', marginBottom: '30px' }}>
              <h4 style={{ marginBottom: '10px' }}>Интервалы времени для особых дат</h4>
              
              {/* Блок для применения интервалов ко всем датам */}
              <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f9f9f9', border: '2px solid #2563eb', borderRadius: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h5 style={{ margin: 0, color: '#2563eb' }}>Шаблон (применить ко всем датам)</h5>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedCalendar || !selectedCalendar.specialDates) return
                      
                      // Создаем копии интервалов для каждой даты с уникальными ID
                      const newIntervalsMap: Record<string, TimeInterval[]> = {}
                      selectedCalendar.specialDates.forEach((date) => {
                        newIntervalsMap[date] = templateIntervals.map((interval, index) => ({
                          ...interval,
                          id: `${date}-${index}-${Date.now()}`,
                        }))
                      })
                      
                      setSpecialDateIntervals({
                        ...specialDateIntervals,
                        ...newIntervalsMap,
                      })

                      // Применяем время работы ко всем датам
                      setModifiers((prev) => {
                        const updated = { ...prev }
                        selectedCalendar.specialDates.forEach((date) => {
                          const current = updated[date] || {
                            id: 0,
                            tariffPlanId: editingPlan!.id,
                            date,
                            modifierType: 'PERCENT_INCREASE' as const,
                            modifierValue: 0,
                            createdAt: '',
                            updatedAt: '',
                          }
                          updated[date] = {
                            ...current,
                            bookingTimeFrom: templateTimeOverride ? templateTimeFrom : null,
                            bookingTimeTo: templateTimeOverride ? templateTimeTo : null,
                          }
                        })
                        return updated
                      })

                      alert(`Шаблон применён ко всем ${selectedCalendar.specialDates.length} особым датам`)
                    }}
                    className="btn-primary"
                    style={{ padding: '8px 16px' }}
                  >
                    Применить ко всем датам
                  </button>
                </div>

                {/* Время работы в шаблоне */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', flexWrap: 'wrap', padding: '10px', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px' }}>
                    <input
                      type="checkbox"
                      checked={templateTimeOverride}
                      onChange={(e) => setTemplateTimeOverride(e.target.checked)}
                    />
                    <span style={{ fontWeight: 500 }}>Изменить время работы</span>
                  </label>
                  {templateTimeOverride && (
                    <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={templateTimeFrom === '00:00' && templateTimeTo === '23:59'}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTemplateTimeFrom('00:00')
                              setTemplateTimeTo('23:59')
                            } else {
                              setTemplateTimeFrom('10:00')
                              setTemplateTimeTo('22:00')
                            }
                          }}
                        />
                        <span style={{ color: '#16a34a', fontWeight: 500 }}>24/7</span>
                      </label>
                      {!(templateTimeFrom === '00:00' && templateTimeTo === '23:59') && (
                        <>
                          <span style={{ fontSize: '13px' }}>с</span>
                          <input
                            type="time"
                            value={templateTimeFrom}
                            onChange={(e) => setTemplateTimeFrom(e.target.value)}
                            style={{ padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
                          />
                          <span style={{ fontSize: '13px' }}>до</span>
                          <input
                            type="time"
                            value={templateTimeTo}
                            onChange={(e) => setTemplateTimeTo(e.target.value)}
                            style={{ padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
                          />
                        </>
                      )}
                    </>
                  )}
                  {!templateTimeOverride && (
                    <span style={{ fontSize: '12px', color: '#888' }}>
                      (без изменения — будет стандартное время из тарифного плана)
                    </span>
                  )}
                </div>

                <TimeIntervalTable
                  intervals={templateIntervals}
                  onChange={setTemplateIntervals}
                  label="Интервалы цен"
                />
                <small style={{ display: 'block', marginTop: '10px', color: '#666', fontSize: '12px' }}>
                  Настройте время работы и интервалы цен, затем нажмите "Применить ко всем датам". 
                  После этого вы сможете отредактировать каждую дату индивидуально ниже.
                </small>
              </div>
              
              {/* Список интервалов для каждой даты */}
              <div style={{ marginTop: '20px' }}>
                <h5 style={{ marginBottom: '15px' }}>Интервалы по датам (можно редактировать индивидуально):</h5>
                <div style={{ maxHeight: '500px', overflowY: 'auto', paddingRight: '10px' }}>
                  {selectedCalendar.specialDates
                    .sort()
                    .map((date) => {
                      const intervals = specialDateIntervals[date] || [{ id: `${date}-1`, timeFrom: '10:00', timeTo: '18:00', rate: 0 }]
                      const modifier = modifiers[date]
                      const hasTimeOverride = !!(modifier?.bookingTimeFrom || modifier?.bookingTimeTo)
                      const defaultFrom = editingPlan?.bookingTimeFrom ? normalizeTime(editingPlan.bookingTimeFrom, '00:00') : '00:00'
                      const defaultTo = editingPlan?.bookingTimeTo ? normalizeTime(editingPlan.bookingTimeTo, '23:59') : '23:59'
                      const dateFrom = modifier?.bookingTimeFrom ? normalizeTime(modifier.bookingTimeFrom, defaultFrom) : defaultFrom
                      const dateTo = modifier?.bookingTimeTo ? normalizeTime(modifier.bookingTimeTo, defaultTo) : defaultTo
                      const dateIs24_7 = dateFrom === '00:00' && dateTo === '23:59'

                      return (
                        <div key={date} style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                            <span style={{ fontWeight: 'bold' }}>
                              {new Date(date).toLocaleDateString('ru-RU')}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={hasTimeOverride}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      handleModifierChange(date, 'bookingTimeFrom', defaultFrom)
                                      handleModifierChange(date, 'bookingTimeTo', defaultTo)
                                    } else {
                                      handleModifierChange(date, 'bookingTimeFrom', null)
                                      handleModifierChange(date, 'bookingTimeTo', null)
                                    }
                                  }}
                                />
                                Изменить время работы
                              </label>
                              {hasTimeOverride && (
                                <>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={dateIs24_7}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          handleModifierChange(date, 'bookingTimeFrom', '00:00')
                                          handleModifierChange(date, 'bookingTimeTo', '23:59')
                                        } else {
                                          handleModifierChange(date, 'bookingTimeFrom', '10:00')
                                          handleModifierChange(date, 'bookingTimeTo', '22:00')
                                        }
                                      }}
                                    />
                                    <span style={{ color: '#16a34a', fontWeight: 500 }}>24/7</span>
                                  </label>
                                  {!dateIs24_7 && (
                                    <>
                                      <span style={{ fontSize: '13px' }}>с</span>
                                      <input
                                        type="time"
                                        value={dateFrom}
                                        onChange={(e) => handleModifierChange(date, 'bookingTimeFrom', e.target.value)}
                                        style={{ padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                      />
                                      <span style={{ fontSize: '13px' }}>до</span>
                                      <input
                                        type="time"
                                        value={dateTo}
                                        onChange={(e) => handleModifierChange(date, 'bookingTimeTo', e.target.value)}
                                        style={{ padding: '4px 6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '13px' }}
                                      />
                                    </>
                                  )}
                                </>
                              )}
                              {!hasTimeOverride && (
                                <span style={{ fontSize: '12px', color: '#888' }}>
                                  (стандартное: {defaultFrom === '00:00' && defaultTo === '23:59' ? '24/7' : `${defaultFrom}–${defaultTo}`})
                                </span>
                              )}
                            </div>
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

            <div style={{ marginTop: '30px', marginBottom: '20px' }}>
              <h4 style={{ marginBottom: '10px' }}>Модификаторы цен (процент/фиксированная сумма)</h4>
              <p style={{ marginBottom: '10px', color: '#666' }}>Настройте модификаторы цен для каждой даты:</p>
            </div>

            <div className="modifiers-actions" style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
                      <th>Время работы</th>
                      <th>Тип изменения</th>
                      <th>Тип</th>
                      <th>Значение</th>
                      <th>Пример расчета</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCalendar.specialDates
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

                      const mFrom = modifier.bookingTimeFrom ? normalizeTime(modifier.bookingTimeFrom, '') : ''
                      const mTo = modifier.bookingTimeTo ? normalizeTime(modifier.bookingTimeTo, '') : ''
                      const hasOverride = !!(mFrom && mTo)
                      const overrideIs24_7 = mFrom === '00:00' && mTo === '23:59'

                      return (
                        <tr key={date}>
                          <td>{new Date(date).toLocaleDateString('ru-RU')}</td>
                          <td>
                            {hasOverride 
                              ? (overrideIs24_7 
                                  ? <span style={{ color: '#16a34a', fontWeight: 500 }}>24/7</span>
                                  : <span style={{ fontWeight: 500 }}>{mFrom}–{mTo}</span>)
                              : <span style={{ color: '#888', fontSize: '12px' }}>стандартное</span>
                            }
                          </td>
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
                                const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                                handleModifierChange(date, 'modifierValue', value)
                              }}
                              placeholder={modifier.modifierType.includes('PERCENT') ? '20' : '500'}
                              style={{ width: '120px', padding: '4px' }}
                            />
                            <small style={{ display: 'block', marginTop: '2px', color: '#666', fontSize: '11px' }}>
                              {modifier.modifierType.includes('PERCENT') 
                                ? 'Введите процент (например: 20 для +20%)' 
                                : 'Введите сумму в рублях (например: 500 для +500₽)'}
                            </small>
                          </td>
                          <td>
                            <div style={{ fontSize: '13px' }}>
                              <div>{exampleBase}₽ {exampleDescription && `(${exampleDescription})`}</div>
                              <div style={{ fontWeight: 'bold', color: '#2563eb' }}>
                                → {exampleResult.toFixed(2)}₽
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
            </div>

            <div className="form-actions">
              <button className="btn-secondary" onClick={() => {
                setShowModifiersModal(false)
                setTemplateIntervals([{ id: 'template-1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
                setTemplateTimeOverride(false)
                setTemplateTimeFrom('10:00')
                setTemplateTimeTo('22:00')
              }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveModifiers}>
                Save Modifiers
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p>У выбранного календаря нет особых дат.</p>
            <p>Добавьте особые даты в календаре, затем вернитесь сюда для настройки модификаторов.</p>
            <button className="btn-secondary" onClick={() => {
              setShowModifiersModal(false)
              setTemplateIntervals([{ id: 'template-1', timeFrom: '10:00', timeTo: '18:00', rate: 0 }])
              setTemplateTimeOverride(false)
              setTemplateTimeFrom('10:00')
              setTemplateTimeTo('22:00')
            }}>
              Close
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}

