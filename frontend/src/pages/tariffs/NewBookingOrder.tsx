import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { pricingService, activityService, bookingService, bookingOrderService } from '../../api/services'
import type { PricingResult, Activity, Booking, User } from '../../api/types'
import {
  getImportedClients, addImportedClients, removeImportedClient,
  parseClientExcel, clearImportedClients,
  getHiddenClients, hideClient, clearHiddenClients,
  getDeletedClients, deleteClient,
} from '../../utils/clientStore'
import type { StoredClient } from '../../utils/clientStore'
import './NewBookingOrder.css'

/* ========== helpers ========== */

interface ActivityLine {
  id: string
  activityId: number | undefined
  startAt: string
  endAt: string
  discountPercent: string
  discountReason: string
  pricingResult: PricingResult | null
  calculating: boolean
  /** Если это строка из существующего бронирования */
  isExisting?: boolean
  existingBookingId?: number
  existingStatus?: string
  /** Были ли изменены данные существующего бронирования */
  modified?: boolean
  /** Исходные значения для сравнения */
  originalStartAt?: string
  originalEndAt?: string
}

interface ExistingClient {
  name: string
  phone: string
  bookings: Booking[]
}

function uid() { return Math.random().toString(36).substring(2, 9) }

const RESTAURANT_TIMEZONE = 'Europe/Moscow'

/** Календарная дата «сегодня» ресторана (Europe/Moscow), YYYY-MM-DD */
function getMoscowCalendarDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: RESTAURANT_TIMEZONE }).format(now)
}

/** Границы суток для API: naive LocalDateTime без UTC (как в БД). */
function getMoscowTodayBounds(): { from: string; to: string } {
  const day = getMoscowCalendarDate()
  return { from: `${day}T00:00:00`, to: `${day}T23:59:59` }
}

function normalizeNaiveDateTime(value: string): string {
  return value.slice(0, 19).replace(' ', 'T')
}

/** Бронь пересекается с «сегодня» по Europe/Moscow (сравнение наивных дат). */
function bookingOverlapsMoscowToday(b: Booking): boolean {
  const { from, to } = getMoscowTodayBounds()
  const start = normalizeNaiveDateTime(b.startAt)
  const end = normalizeNaiveDateTime(b.endAt)
  return start <= to && end >= from
}

function toLocalDatetimeInput(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

function nowLocal() { return toLocalDatetimeInput(new Date()) }
function plusHour() { return toLocalDatetimeInput(new Date(Date.now() + 60 * 60 * 1000)) }

function formatLocalDateTime(dateStr: string) {
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

/** Превращает существующее бронирование в строку-линию */
function bookingToLine(b: Booking): ActivityLine {
  const start = toLocalDatetimeInput(new Date(b.startAt))
  const end = toLocalDatetimeInput(new Date(b.endAt))
  return {
    id: `existing_${b.id}`,
    activityId: b.activityId,
    startAt: start,
    endAt: end,
    discountPercent: '',
    discountReason: '',
    pricingResult: b.totalAmount != null
      ? { status: 'OK', totalAmount: b.totalAmount, appliedRuleIds: [], breakdowns: [] }
      : null,
    calculating: false,
    isExisting: true,
    existingBookingId: b.id,
    existingStatus: b.status,
    modified: false,
    originalStartAt: start,
    originalEndAt: end,
  }
}

function emptyLine(): ActivityLine {
  return {
    id: uid(),
    activityId: undefined,
    startAt: nowLocal(),
    endAt: plusHour(),
    discountPercent: '',
    discountReason: '',
    pricingResult: null,
    calculating: false,
  }
}

function bookingMatchesClient(b: Booking, client: Pick<ExistingClient, 'name' | 'phone'>): boolean {
  const sameName = (b.customerName || '').trim().toLowerCase() === (client.name || '').trim().toLowerCase()
  const samePhone = Boolean(client.phone)
    && (b.customerPhone || '').trim().toLowerCase() === client.phone.trim().toLowerCase()
  return sameName || samePhone
}

function isUnlinkedActiveBooking(b: Booking): boolean {
  return b.status !== 'CANCELLED' && (b.bookingOrderId ?? null) == null
}

function isSelectableTodayBooking(b: Booking): boolean {
  return isUnlinkedActiveBooking(b)
    && b.status !== 'PAID'
    && bookingOverlapsMoscowToday(b)
}

/* ========== component ========== */

export default function NewBookingOrder() {
  const navigate = useNavigate()
  const { user } = useOutletContext<{ user?: User }>()

  // shared
  const [activities, setActivities] = useState<Activity[]>([])

  // existing clients from bookings (for picker): только последние 200
  const [existingClients, setExistingClients] = useState<ExistingClient[]>([])
  // результаты поиска по всей базе (при вводе в поле поиска)
  const [searchResults, setSearchResults] = useState<ExistingClient[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showClientPicker, setShowClientPicker] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<ExistingClient | null>(null)
  const [importedClients, setImportedClients] = useState<StoredClient[]>(getImportedClients())
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(getHiddenClients())
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(getDeletedClients())
  const fileInputRef = useRef<HTMLInputElement>(null)

  // create form
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [lines, setLines] = useState<ActivityLine[]>([emptyLine()])
  const linesRef = useRef<ActivityLine[]>([emptyLine()])
  const [saving, setSaving] = useState(false)

  /* ===== load data ===== */

  useEffect(() => {
    activityService.getActivities(undefined, 'ACTIVE').then(setActivities).catch(console.error)
    loadExistingClients()
  }, [importedClients])

  useEffect(() => {
    linesRef.current = lines
  }, [lines])

  // Поиск по всей базе клиентов (debounced)
  useEffect(() => {
    const q = clientSearch.trim()
    if (!q) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }
    const t = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await bookingService.getBookings({
          status: ['DRAFT', 'CONFIRMED', 'PAID', 'COMPLETED'],
          size: 200,
          sort: 'startAt,desc',
          page: 0,
          customerSearch: q,
        })
        const content = Array.isArray(res) ? res : (res && 'content' in res ? (res as { content: Booking[] }).content : [])
        const map = new Map<string, { name: string; phone: string; bookings: Booking[] }>()
        for (const b of content) {
          if (!b.customerName && !b.customerPhone) continue
          const key = `${(b.customerName || '').toLowerCase()}_${(b.customerPhone || '').toLowerCase()}`
          if (!key || key === '_') continue
          if (!map.has(key)) map.set(key, { name: b.customerName || '', phone: b.customerPhone || '', bookings: [] })
          if (b.status === 'CONFIRMED' || b.status === 'DRAFT' || b.status === 'PAID') {
            if (isUnlinkedActiveBooking(b)) map.get(key)!.bookings.push(b)
          }
        }
        const list: ExistingClient[] = []
        for (const [, v] of map) {
          if (v.name) {
            v.bookings.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
            list.push({ name: v.name, phone: v.phone, bookings: v.bookings })
          }
        }
        list.sort((a, b) => a.name.localeCompare(b.name))
        setSearchResults(list)
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [clientSearch])

  const loadExistingClients = async () => {
    try {
      // Только последние 200 клиентов (одна страница, сначала новые)
      const res = await bookingService.getBookings({
        status: ['DRAFT', 'CONFIRMED', 'PAID', 'COMPLETED'],
        size: 200,
        sort: 'startAt,desc',
        page: 0,
      })
      const content = Array.isArray(res) ? res : (res && 'content' in res ? (res as { content: Booking[] }).content : [])
      const map = new Map<string, { name: string; phone: string; bookings: Booking[] }>()
      for (const b of content) {
        if (!b.customerName && !b.customerPhone) continue
        const key = `${(b.customerName || '').toLowerCase()}_${(b.customerPhone || '').toLowerCase()}`
        if (!key || key === '_') continue
        if (!map.has(key)) {
          map.set(key, { name: b.customerName || '', phone: b.customerPhone || '', bookings: [] })
        }
        // Только непривязанные к заказу брони (доступны для включения в новый заказ)
        if (b.status !== 'CANCELLED' && isUnlinkedActiveBooking(b)) {
          map.get(key)!.bookings.push(b)
        }
      }

      // Добавляем импортированных из Excel клиентов (у них нет бронирований)
      for (const ic of importedClients) {
        const key = `${ic.name.toLowerCase()}_${ic.phone.toLowerCase()}`
        if (!key || key === '_') continue
        if (!map.has(key)) {
          map.set(key, { name: ic.name, phone: ic.phone, bookings: [] })
        }
      }

      const clients: ExistingClient[] = []
      for (const [, v] of map) {
        if (v.name) {
          v.bookings.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
          clients.push({ name: v.name, phone: v.phone, bookings: v.bookings })
        }
      }
      clients.sort((a, b) => a.name.localeCompare(b.name))
      setExistingClients(clients)
    } catch (err) {
      console.error('Failed to load existing clients:', err)
    }
  }

  const getActivityName = (id?: number) => {
    if (!id) return '—'
    return activities.find(a => a.id === id)?.name || `#${id}`
  }

  /* ===== client picker ===== */

  const selectExistingClient = (client: ExistingClient) => {
    setCustomerName(client.name)
    setCustomerPhone(client.phone)
    setSelectedClient(client)
    setShowClientPicker(false)
    setClientSearch('')

    void loadClientBookingsForToday(client)
  }

  /** Свободные брони клиента за сегодня (Europe/Moscow), ещё не в заказе. */
  const loadClientBookingsForToday = async (client: ExistingClient) => {
    const { from, to } = getMoscowTodayBounds()
    const searchTerm = (client.phone || client.name || '').trim()
    try {
      const res = await bookingService.getBookings({
        status: ['DRAFT', 'CONFIRMED'],
        from,
        to,
        customerSearch: searchTerm,
        linkedToOrder: false,
        size: 500,
        sort: 'startAt,asc',
        page: 0,
      })
      const content = Array.isArray(res) ? res : (res && 'content' in res ? (res as { content: Booking[] }).content : [])
      const byId = new Map<string, Booking>()
      for (const b of [...client.bookings, ...content]) {
        const key = b.id != null ? String(b.id) : `${b.activityId}_${b.startAt}_${b.endAt}`
        byId.set(key, b)
      }
      const existingLinesNew = [...byId.values()]
        .filter((b) =>
          isSelectableTodayBooking(b)
          && bookingMatchesClient(b, client)
        )
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
        .map(bookingToLine)
      const filledNewLines = linesRef.current.filter(l => !l.isExisting && l.activityId)
      const newLns = filledNewLines.length > 0 ? filledNewLines : [emptyLine()]
      setLines(existingLinesNew.length > 0 ? [...existingLinesNew, ...newLns] : newLns)
    } catch (err) {
      console.error('Failed to auto-load client bookings for today:', err)
      const existingLinesNew = client.bookings
        .filter((b) => isUnlinkedActiveBooking(b) && bookingOverlapsMoscowToday(b))
        .map(bookingToLine)
      const filledNewLines = linesRef.current.filter(l => !l.isExisting && l.activityId)
      const newLns = filledNewLines.length > 0 ? filledNewLines : [emptyLine()]
      setLines(existingLinesNew.length > 0 ? [...existingLinesNew, ...newLns] : newLns)
    }
  }

  const clearSelectedClient = () => {
    setSelectedClient(null)
    setCustomerName('')
    setCustomerPhone('')
    // Убираем существующие строки
    setLines(prev => {
      const newOnly = prev.filter(l => !l.isExisting)
      return newOnly.length > 0 ? newOnly : [emptyLine()]
    })
  }

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const parsed = await parseClientExcel(file)
      const updated = addImportedClients(parsed)
      setImportedClients(updated)
      alert(`Импортировано клиентов: ${parsed.length}`)
    } catch (err: any) {
      alert(err.message || 'Ошибка при импорте файла')
    }
    // Сбрасываем input, чтобы можно было загрузить тот же файл повторно
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClearImported = () => {
    if (!confirm(`Удалить всех импортированных клиентов (${importedClients.length})?`)) return
    clearImportedClients()
    setImportedClients([])
  }

  /** Скрыть клиента (не удаляя бронирования) */
  const handleHideClient = (c: ExistingClient, e: React.MouseEvent) => {
    e.stopPropagation()
    if (c.bookings.length === 0) {
      // Импортированный — просто удаляем
      const updated = removeImportedClient(c.name, c.phone)
      setImportedClients(updated)
    } else {
      const updated = hideClient(c.name, c.phone)
      setHiddenKeys(new Set(updated))
    }
  }

  /** Полностью удалить клиента — отменить все его бронирования */
  const handleFullDeleteClient = async (c: ExistingClient, e: React.MouseEvent) => {
    e.stopPropagation()
    if (c.bookings.length === 0) {
      const updated = removeImportedClient(c.name, c.phone)
      setImportedClients(updated)
      return
    }
    const activeBookings = c.bookings.filter(b => b.status !== 'CANCELLED' && b.status !== 'PAID')
    const msg = activeBookings.length > 0
      ? `Удалить клиента «${c.name}» и отменить ${activeBookings.length} активных бронирований?\n⚠️ Это действие необратимо!`
      : `Удалить клиента «${c.name}»?\n⚠️ Это действие необратимо!`
    if (!confirm(msg)) return
    try {
      for (const b of activeBookings) {
        await bookingService.cancelBooking(b.id)
      }
      // Помечаем как удалённого навсегда (не восстанавливается)
      const updated = deleteClient(c.name, c.phone)
      setDeletedKeys(new Set(updated))
      await loadExistingClients()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Ошибка при удалении клиента')
    }
  }

  const handleRestoreHidden = () => {
    clearHiddenClients()
    setHiddenKeys(new Set())
  }

  // Без поиска — последние 200 клиентов; при вводе — результаты поиска по всей базе
  const baseClients = clientSearch.trim() ? searchResults : existingClients
  const filteredClients = baseClients.filter(c => {
    const key = `${(c.name || '').trim().toLowerCase()}|${(c.phone || '').trim().toLowerCase()}`
    if (deletedKeys.has(key)) return false
    if (hiddenKeys.has(key)) return false
    return true
  })

  /* ===== line management ===== */

  const updateLine = useCallback((id: string, patch: Partial<ActivityLine>) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l
      const updated = { ...l, ...patch }
      // Помечаем existing-линию как изменённую, если время или скидка поменялись
      if (l.isExisting && (patch.startAt !== undefined || patch.endAt !== undefined || patch.discountPercent !== undefined)) {
        updated.modified = (
          updated.startAt !== l.originalStartAt ||
          updated.endAt !== l.originalEndAt ||
          (updated.discountPercent || '') !== ''
        )
      }
      return updated
    }))
  }, [])

  const handleAddLine = () => {
    setLines(prev => [...prev, emptyLine()])
  }

  const removeLine = (id: string) => {
    setLines(prev => {
      const remaining = prev.filter(l => l.id !== id)
      // Всегда оставляем хотя бы одну новую строку
      const hasNew = remaining.some(l => !l.isExisting)
      return hasNew ? remaining : [...remaining, emptyLine()]
    })
  }

  /** Убрать существующую бронь из текущего чека (БЕЗ отмены на сервере) */
  const excludeExistingBooking = (line: ActivityLine) => {
    setLines(prev => {
      const remaining = prev.filter(l => l.id !== line.id)
      const hasNew = remaining.some(l => !l.isExisting)
      return hasNew ? remaining : [...remaining, emptyLine()]
    })
  }

  /** Отменить существующую бронь на бэкенде (полное удаление) */
  const cancelExistingBooking = async (line: ActivityLine) => {
    if (!line.existingBookingId) return
    const confirmed = window.confirm(
      `Отменить бронь #${line.existingBookingId} (${getActivityName(line.activityId)})?\n` +
      `⚠️ Бронирование будет ОТМЕНЕНО на сервере!`
    )
    if (!confirmed) return

    try {
      await bookingService.cancelBooking(line.existingBookingId)
      // Убираем из списка
      setLines(prev => {
        const remaining = prev.filter(l => l.id !== line.id)
        const hasNew = remaining.some(l => !l.isExisting)
        return hasNew ? remaining : [...remaining, emptyLine()]
      })
      // Обновляем данные клиента
      if (selectedClient) {
        setSelectedClient({
          ...selectedClient,
          bookings: selectedClient.bookings.filter(b => b.id !== line.existingBookingId),
        })
      }
      loadExistingClients()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Ошибка при отмене бронирования')
    }
  }

  /** Рассчитать стоимость для любой линии (существующей или новой) */
  const calculateLine = useCallback(async (line: ActivityLine) => {
    if (!line.activityId || !line.startAt || !line.endAt) {
      alert('Выберите мероприятие и укажите время')
      return
    }
    if (new Date(line.endAt).getTime() <= new Date(line.startAt).getTime()) {
      alert('Время окончания должно быть позже времени начала')
      return
    }
    if (line.discountPercent && !line.discountReason.trim()) {
      alert('Укажите обоснование скидки')
      return
    }

    updateLine(line.id, { calculating: true })
    try {
      const result = await pricingService.preview({
        serviceId: line.activityId,
        serviceStart: formatLocalDateTime(line.startAt),
        serviceEnd: formatLocalDateTime(line.endAt),
        discountPercent: line.discountPercent ? parseFloat(line.discountPercent) : undefined,
        discountReason: line.discountReason || undefined,
      })
      updateLine(line.id, { pricingResult: result, calculating: false })
    } catch (err: any) {
      alert(err.response?.data?.message || 'Ошибка расчёта')
      updateLine(line.id, { calculating: false })
    }
  }, [updateLine])

  const calculateAll = async () => {
    for (const line of lines) {
      if (line.activityId && line.startAt && line.endAt) {
        // Рассчитываем новые линии и изменённые существующие
        if (!line.isExisting || line.modified) {
          await calculateLine(line)
        }
      }
    }
  }

  // Автопересчёт линий после изменений (без кнопки "Пересчитать")
  const autoCalcTimersRef = useRef<Record<string, number>>({})

  useEffect(() => {
    const lineIds = new Set(lines.map((l) => l.id))
    // Удаляем таймеры для удалённых линий
    for (const [id, timerId] of Object.entries(autoCalcTimersRef.current)) {
      if (!lineIds.has(id)) {
        window.clearTimeout(timerId)
        delete autoCalcTimersRef.current[id]
      }
    }

    for (const line of lines) {
      const hasRequiredFields = Boolean(line.activityId && line.startAt && line.endAt)
      const hasValidRange = new Date(line.endAt).getTime() > new Date(line.startAt).getTime()
      const hasDiscountReason = !line.discountPercent || Boolean(line.discountReason.trim())
      const needsCalc = !line.pricingResult && !line.calculating

      const canAutoCalc = hasRequiredFields && hasValidRange && hasDiscountReason && needsCalc
      if (!canAutoCalc) {
        if (autoCalcTimersRef.current[line.id]) {
          window.clearTimeout(autoCalcTimersRef.current[line.id])
          delete autoCalcTimersRef.current[line.id]
        }
        continue
      }

      if (autoCalcTimersRef.current[line.id]) continue

      autoCalcTimersRef.current[line.id] = window.setTimeout(async () => {
        delete autoCalcTimersRef.current[line.id]
        const latestLine = linesRef.current.find((l) => l.id === line.id)
        if (!latestLine || latestLine.pricingResult || latestLine.calculating) return
        await calculateLine(latestLine)
      }, 500)
    }

  }, [lines, calculateLine])

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(autoCalcTimersRef.current)) {
        window.clearTimeout(timerId)
      }
      autoCalcTimersRef.current = {}
    }
  }, [])

  /** Найти мероприятие-заполнитель пробелов */
  const getGapFillerActivity = () => activities.find(a => a.gapFiller)

  /**
   * Обнаружить пробелы между отсортированными по времени линиями.
   * Если untilNow=true, добавляет «хвостовой» пробел от конца последней брони до текущего времени
   * (клиент ещё на месте, пока не оплатил).
   */
  const detectGaps = (
    allLines: ActivityLine[],
    untilNow = false,
  ): Array<{ startAt: string; endAt: string; trailing?: boolean }> => {
    if (allLines.length === 0) return []
    const sorted = [...allLines].sort((a, b) =>
      new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    )
    const gaps: Array<{ startAt: string; endAt: string; trailing?: boolean }> = []
    // пробелы между бронями
    for (let i = 0; i < sorted.length - 1; i++) {
      const endCurrent = new Date(sorted[i].endAt).getTime()
      const startNext = new Date(sorted[i + 1].startAt).getTime()
      if (startNext > endCurrent + 60000) { // >1 min gap
        gaps.push({
          startAt: sorted[i].endAt,
          endAt: sorted[i + 1].startAt,
        })
      }
    }
    // хвостовой пробел: от конца последней брони до «сейчас»
    if (untilNow && sorted.length > 0) {
      const lastEnd = new Date(sorted[sorted.length - 1].endAt).getTime()
      const now = Date.now()
      if (now > lastEnd + 60000) { // >1 min
        gaps.push({
          startAt: sorted[sorted.length - 1].endAt,
          endAt: toLocalDatetimeInput(new Date(now)),
          trailing: true,
        })
      }
    }
    return gaps
  }

  const existingLines = lines.filter(l => l.isExisting)
  const newLines = lines.filter(l => !l.isExisting)
  const modifiedExistingLines = existingLines.filter(l => l.modified)
  const gapFillerId = getGapFillerActivity()?.id
  const regularExistingLines = existingLines.filter(l => gapFillerId == null || l.activityId !== gapFillerId)
  const gapFillerExistingLines = existingLines.filter(l => gapFillerId != null && l.activityId === gapFillerId)

  // Обнаружение пробелов — только по основным бронированиям (без учёта уже созданных «Посещение»),
  // чтобы отображались все пробелы (например 2, а не 1)
  const gapFillerActivity = getGapFillerActivity()
  const linesForGapDetection = [...regularExistingLines, ...newLines.filter(l => l.activityId && l.startAt && l.endAt)]
  const detectedGaps = detectGaps(linesForGapDetection, !!gapFillerActivity)

  // --- Автоматический расчёт цены пробелов (с учётом стоп-чека) ---
  const [gapPrices, setGapPrices] = useState<Record<string, number | null>>({})
  const [gapCalcLoading, setGapCalcLoading] = useState(false)
  const lastGapKeyRef = useRef('')

  /**
   * Вычислить общее время пребывания клиента (все брони + пробелы от первой до последней),
   * т.е. время от начала первого мероприятия до конца последнего.
   * Возвращает количество минут.
   */
  // Пересчитываем цены пробелов при изменении пробелов
  useEffect(() => {
    if (!gapFillerActivity || detectedGaps.length === 0) {
      if (Object.keys(gapPrices).length > 0) setGapPrices({})
      return
    }
    // Создаём ключ, чтобы не пересчитывать, если ничего не изменилось
    const gapKey = detectedGaps.map(g => `${g.startAt}_${g.endAt}`).join('|')
    if (gapKey === lastGapKeyRef.current) return
    lastGapKeyRef.current = gapKey

    const calcGaps = async () => {
      setGapCalcLoading(true)
      const prices: Record<string, number | null> = {}

      const stopCheckMin = gapFillerActivity.stopCheckHours
        ? gapFillerActivity.stopCheckHours * 60
        : null

      // Считаем общее время «до каждого пробела» (от первой брони до начала пробела)
      const all = [...existingLines, ...newLines.filter(l => l.activityId && l.startAt && l.endAt)]
      const sorted = all.length > 0
        ? [...all].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
        : []
      const firstStart = sorted.length > 0 ? new Date(sorted[0].startAt).getTime() : 0

      for (const gap of detectedGaps) {
        const key = `${gap.startAt}_${gap.endAt}`

        // Стоп-чек: проверяем, прошло ли уже достаточно времени
        if (stopCheckMin && firstStart > 0) {
          const gapStart = new Date(gap.startAt).getTime()
          const minutesSinceArrival = (gapStart - firstStart) / 60_000
          if (minutesSinceArrival >= stopCheckMin) {
            // Клиент уже превысил стоп-чек — пробел бесплатный
            prices[key] = 0
            continue
          }
          // Проверяем, не выходит ли конец пробела за стоп-чек
          const gapEnd = new Date(gap.endAt).getTime()
          const minutesAtGapEnd = (gapEnd - firstStart) / 60_000
          if (minutesAtGapEnd > stopCheckMin) {
            // Пробел частично пересекает стоп-чек — считаем только платную часть (до границы 4.5 ч)
            const freeStart = new Date(firstStart + stopCheckMin * 60_000)
            const cappedEnd = toLocalDatetimeInput(freeStart)
            // Платная часть: gap.startAt .. cappedEnd (например 14:23–17:53)
            if (new Date(cappedEnd).getTime() <= new Date(gap.startAt).getTime()) {
              prices[key] = 0
              continue
            }
            try {
              const result = await pricingService.preview({
                serviceId: gapFillerActivity.id,
                serviceStart: formatLocalDateTime(gap.startAt),
                serviceEnd: formatLocalDateTime(cappedEnd),
              })
              const amount = (result.status === 'OK' || result.status === 'STOP') && typeof result.totalAmount === 'number' ? result.totalAmount : null
              // Если по частичному интервалу пришло 0 — скорее всего не назначен тариф, показываем «—»
              prices[key] = amount !== null && amount > 0 ? amount : null
            } catch {
              prices[key] = null
            }
            continue
          }
        }

        try {
          const result = await pricingService.preview({
            serviceId: gapFillerActivity.id,
            serviceStart: formatLocalDateTime(gap.startAt),
            serviceEnd: formatLocalDateTime(gap.endAt),
          })
          // OK или STOP с числовой суммой — учитываем в итоге (STOP часто 0 по стоп-чеку)
          prices[key] = (result.status === 'OK' || result.status === 'STOP') && typeof result.totalAmount === 'number' ? result.totalAmount : null
        } catch {
          prices[key] = null
        }
      }
      setGapPrices(prices)
      setGapCalcLoading(false)
    }
    calcGaps()
  }, [detectedGaps, gapFillerActivity])

  // Пробелы, уже заполненные существующими бронями «Посещение», не добавляем в итог (уже в existingTotal)
  const coveredGapKeys = new Set(gapFillerExistingLines.map(l => `${l.startAt}_${l.endAt}`))
  const gapTotal: number = detectedGaps.reduce<number>(
    (s, gap) => {
      const key = `${gap.startAt}_${gap.endAt}`
      if (coveredGapKeys.has(key)) return s
      return s + (gapPrices[key] || 0)
    },
    0
  )

  const existingTotal = existingLines.reduce((s, l) => s + (l.pricingResult?.totalAmount || 0), 0)
  const newTotal = newLines.reduce((s, l) => s + (l.pricingResult?.totalAmount || 0), 0)
  const totalAmount = existingTotal + newTotal + gapTotal

  const allNewCalculated = newLines.every(l => !l.activityId || (l.pricingResult && l.pricingResult.status === 'OK'))
  const hasNewActivities = newLines.some(l => l.activityId)

  // Все изменённые существующие должны быть пересчитаны
  const allModifiedCalculated = modifiedExistingLines.every(l => l.pricingResult && l.pricingResult.status === 'OK')

  // Кнопка активна, если:
  // 1) Есть имя клиента
  // 2) Все новые рассчитаны (или их нет)
  // 3) Все изменённые существующие пересчитаны (или их нет)
  // 4) Есть хотя бы что-то: новая активность ИЛИ существующие бронирования (можно просто завершить)
  const canSave =
    !saving &&
    customerName.trim() !== '' &&
    allNewCalculated &&
    allModifiedCalculated &&
    (hasNewActivities || existingLines.length > 0)

  const handleSave = async () => {
    if (!customerName.trim()) { alert('Укажите имя клиента'); return }

    // Проверяем, что изменённые существующие пересчитаны
    for (const line of modifiedExistingLines) {
      if (!line.pricingResult || line.pricingResult.status !== 'OK') {
        alert(`Пересчитайте стоимость для изменённой брони #${line.existingBookingId}`)
        return
      }
    }

    const linesToCreate = newLines.filter(l => l.activityId && l.pricingResult?.status === 'OK')
    if (linesToCreate.length === 0 && modifiedExistingLines.length === 0 && existingLines.length === 0) {
      alert('Добавьте хотя бы одну активность')
      return
    }

    setSaving(true)
    try {
      const branchId = user?.restaurantId
      let bookingOrderId: number | undefined
      if (branchId) {
        const order = await bookingOrderService.create(branchId, customerName.trim(), customerPhone.trim() || '')
        bookingOrderId = order.id
      }

      // 1) Подтверждаем и обновляем существующие бронирования, привязываем к заказу
      for (const line of existingLines) {
        if (!line.existingBookingId) continue
        const updatePayload: any = {
          status: 'CONFIRMED',
          startAt: formatLocalDateTime(line.startAt),
          endAt: formatLocalDateTime(line.endAt),
        }
        if (bookingOrderId != null) updatePayload.bookingOrderId = bookingOrderId
        if (line.modified && line.pricingResult) {
          updatePayload.totalAmount = line.pricingResult.totalAmount
        }
        if (line.discountPercent || line.discountReason) {
          updatePayload.notes = line.discountReason
            ? `Скидка ${line.discountPercent}%: ${line.discountReason}`
            : undefined
        }
        await bookingService.updateBooking(line.existingBookingId, updatePayload)
      }

      // 2) Создаём новые бронирования с привязкой к заказу
      for (const line of linesToCreate) {
        if (!line.activityId || !line.pricingResult) continue
        await bookingService.createBooking({
          activityId: line.activityId,
          startAt: formatLocalDateTime(line.startAt),
          endAt: formatLocalDateTime(line.endAt),
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || undefined,
          notes: line.discountReason ? `Скидка ${line.discountPercent}%: ${line.discountReason}` : undefined,
          status: 'CONFIRMED',
          totalAmount: line.pricingResult.totalAmount,
          ...(bookingOrderId != null && { bookingOrderId }),
        })
      }

      // 3) Заполняем пробелы во времени тарифом поминутной/почасовой оплаты
      //    Пробелы считаем по основным бронированиям (как в UI), чтобы заполнять все пробелы, а не один
      const freshActs = await activityService.getActivities(undefined, 'ACTIVE')
      setActivities(freshActs)
      const gapFillerActivity = freshActs.find((a: Activity) => a.gapFiller) || null
      let gapCount = 0
      if (gapFillerActivity) {
        const regularExisting = existingLines.filter(l => l.activityId !== gapFillerActivity.id)
        const linesForGapDetection = [
          ...regularExisting,
          ...linesToCreate,
        ].filter(l => l.activityId && l.startAt && l.endAt)
        const gaps = detectGaps(linesForGapDetection, true)
        const existingGapKeys = new Set(
          existingLines
            .filter(l => l.activityId === gapFillerActivity.id)
            .map(l => `${l.startAt}_${l.endAt}`)
        )

        const stopCheckMin = gapFillerActivity.stopCheckHours
          ? gapFillerActivity.stopCheckHours * 60
          : null
        const sortedAll = [...linesForGapDetection].sort((a, b) =>
          new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
        )
        const firstStart = sortedAll.length > 0 ? new Date(sortedAll[0].startAt).getTime() : 0

        for (const gap of gaps) {
          const gapKey = `${gap.startAt}_${gap.endAt}`
          if (existingGapKeys.has(gapKey)) continue

          try {
            let effectiveGapStart = gap.startAt
            let effectiveGapEnd = gap.endAt
            let isFree = false

            if (stopCheckMin && firstStart > 0) {
              const gapStartMs = new Date(gap.startAt).getTime()
              const minutesSinceArrival = (gapStartMs - firstStart) / 60_000
              if (minutesSinceArrival >= stopCheckMin) {
                isFree = true
              } else {
                const gapEndMs = new Date(gap.endAt).getTime()
                const minutesAtGapEnd = (gapEndMs - firstStart) / 60_000
                if (minutesAtGapEnd > stopCheckMin) {
                  effectiveGapEnd = toLocalDatetimeInput(new Date(firstStart + stopCheckMin * 60_000))
                }
              }
            }

            let totalAmount = 0
            if (!isFree) {
              const gapPricing = await pricingService.preview({
                serviceId: gapFillerActivity.id,
                serviceStart: formatLocalDateTime(effectiveGapStart),
                serviceEnd: formatLocalDateTime(effectiveGapEnd),
              })
              totalAmount = gapPricing.totalAmount
            }

            const note = gap.trailing
              ? `Пребывание до оплаты (${gapFillerActivity.name})${isFree ? ' [стоп-чек]' : ''}`
              : `Автозаполнение пробела (${gapFillerActivity.name})${isFree ? ' [стоп-чек]' : ''}`
            await bookingService.createBooking({
              activityId: gapFillerActivity.id,
              startAt: formatLocalDateTime(gap.startAt),
              endAt: formatLocalDateTime(gap.endAt),
              customerName: customerName.trim(),
              customerPhone: customerPhone.trim() || undefined,
              notes: note,
              status: 'CONFIRMED',
              totalAmount,
              ...(bookingOrderId != null && { bookingOrderId }),
            })
            gapCount++
          } catch (err) {
            console.error('Ошибка при создании заполнения пробела:', err)
          }
        }
      }

      const parts: string[] = []
      if (modifiedExistingLines.length > 0) parts.push(`обновлено: ${modifiedExistingLines.length}`)
      if (linesToCreate.length > 0) parts.push(`создано: ${linesToCreate.length}`)
      if (gapCount > 0) parts.push(`пробелов заполнено: ${gapCount}`)
      alert(parts.length > 0
        ? `Бронирования успешно сохранены (${parts.join(', ')})!`
        : 'Бронирования успешно завершены!')

      // Reset form
      setCustomerName('')
      setCustomerPhone('')
      setSelectedClient(null)
      setLines([emptyLine()])
      // Go to BookingOrders
      navigate('/booking-orders')
    } catch (err: any) {
      alert(err.response?.data?.message || 'Ошибка при сохранении бронирований')
    } finally {
      setSaving(false)
    }
  }

  /* ========== render ========== */

  // Определяем текст кнопки
  const getSaveButtonText = () => {
    if (saving) return 'Сохранение...'
    if (existingLines.length > 0 && !hasNewActivities) return 'Завершить бронь'
    if (existingLines.length > 0 && hasNewActivities) return 'Сохранить и создать'
    return 'Создать бронирования'
  }

  return (
    <div className="active-clients-page">
      <h1>Новый заказ</h1>
      <p className="page-subtitle">
        Создайте заказ с несколькими активностями — выберите существующего клиента или создайте нового
      </p>

      {/* Client info */}
      <div className="client-card">
        <div className="client-card-header">
          <h2>Клиент</h2>
          <div className="client-header-actions">
            {selectedClient && (
              <button className="btn-clear-client" onClick={clearSelectedClient} title="Сбросить выбор">
                ✕ Сбросить
              </button>
            )}
            <button
              className="btn-pick-client"
              onClick={() => {
                const next = !showClientPicker
                setShowClientPicker(next)
                if (next) loadExistingClients()
              }}
            >
              {showClientPicker ? 'Скрыть список' : 'Выбрать клиента'}
            </button>
            <button
              className="btn-import-excel"
              onClick={() => fileInputRef.current?.click()}
              title="Загрузить клиентов из Excel (столбец 1 — имя, столбец 2 — телефон)"
            >
              📥 Импорт Excel
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={handleExcelUpload}
            />
            {importedClients.length > 0 && (
              <button
                className="btn-clear-imported"
                onClick={handleClearImported}
                title={`Удалить ${importedClients.length} импортированных клиентов`}
              >
                🗑 Импорт ({importedClients.length})
              </button>
            )}
          </div>
        </div>

        {/* Client picker dropdown */}
        {showClientPicker && (
          <div className="client-picker">
            <input
              type="text"
              className="client-picker-search"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              placeholder="Поиск по имени или телефону (по всей базе)..."
              autoFocus
            />
            {!clientSearch.trim() && (
              <div className="client-picker-hint">Показаны последние 200 клиентов. Введите запрос для поиска по всей базе.</div>
            )}
            <div className="client-picker-list">
              {searchLoading ? (
                <div className="client-picker-empty">Поиск по всей базе...</div>
              ) : filteredClients.length === 0 && hiddenKeys.size === 0 ? (
                <div className="client-picker-empty">Клиенты не найдены</div>
              ) : filteredClients.length === 0 && hiddenKeys.size > 0 ? (
                <div className="client-picker-empty">
                  Клиенты не найдены.{' '}
                  <button className="btn-link" onClick={handleRestoreHidden}>
                    Показать скрытых ({hiddenKeys.size})
                  </button>
                </div>
              ) : (
                filteredClients.map((c, i) => (
                  <button
                    key={i}
                    className={`client-picker-item ${
                      customerName === c.name && customerPhone === c.phone ? 'selected' : ''
                    }`}
                    onClick={() => selectExistingClient(c)}
                  >
                    <span className="picker-name">{c.name}</span>
                    {c.phone && <span className="picker-phone">{c.phone}</span>}
                    <span className="picker-badge">
                      {(() => {
                        const activeBookings = c.bookings.filter(isUnlinkedActiveBooking)
                        if (activeBookings.length === 0) return '📥 импорт'
                        const gapFillerId = getGapFillerActivity()?.id
                        const todayActive = activeBookings.filter(b =>
                          isSelectableTodayBooking(b) &&
                          (gapFillerId == null || b.activityId !== gapFillerId)
                        ).length
                        return todayActive > 0
                          ? `${todayActive} неопл. сегодня`
                          : `${activeBookings.length} всего`
                      })()}
                    </span>
                    <span className="picker-actions">
                      {c.bookings.filter(b => b.status !== 'CANCELLED').length > 0 && (
                        <span
                          className="picker-hide"
                          onClick={(e) => handleHideClient(c, e)}
                          title="Скрыть из списка"
                        >👁‍🗨</span>
                      )}
                      <span
                        className="picker-delete"
                        onClick={(e) => handleFullDeleteClient(c, e)}
                        title="Удалить клиента"
                      >🗑</span>
                    </span>
                  </button>
                ))
              )}
            </div>
            {hiddenKeys.size > 0 && filteredClients.length > 0 && (
              <div className="client-picker-footer">
                <button className="btn-link" onClick={handleRestoreHidden}>
                  Показать скрытых клиентов ({hiddenKeys.size})
                </button>
              </div>
            )}
          </div>
        )}

        <div className="client-fields">
          <div className="field">
            <label>Имя *</label>
            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Имя клиента" />
          </div>
          <div className="field">
            <label>Телефон</label>
            <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+7 (999) 123-45-67" />
          </div>
        </div>
      </div>

      {/* Activity lines — existing + new */}
      <div className="activity-lines-card">
        <div className="card-header">
          <h2>Активности</h2>
          <button className="btn-add-activity-line" onClick={handleAddLine}>+ Добавить активность</button>
        </div>

        {/* Existing booking lines (EDITABLE) — только основные брони */}
        {regularExistingLines.length > 0 && (
          <div className="existing-lines-section">
            <div className="section-label">Текущие бронирования</div>
            {regularExistingLines.map(line => (
              <div key={line.id} className={`activity-line existing-line ${line.modified ? 'modified' : ''}`}>
                <div className="line-header">
                  <span className="line-number existing-badge">
                    {line.modified ? '✏️' : '📋'} Бронь #{line.existingBookingId}
                  </span>
                  <span className={`line-status-badge ${(line.existingStatus || '').toLowerCase()}`}>
                    {line.existingStatus === 'CONFIRMED' ? 'Подтверждено' : line.existingStatus === 'DRAFT' ? 'Черновик' : line.existingStatus === 'PAID' ? 'Оплачено' : line.existingStatus}
                  </span>
                  {line.modified && <span className="line-modified-badge">изменено</span>}
                  <div className="existing-line-actions">
                    <button
                      className="btn-exclude"
                      onClick={() => excludeExistingBooking(line)}
                      title="Убрать из заказа (бронь останется)"
                    >
                      ✕
                    </button>
                    <button
                      className="btn-cancel-booking"
                      onClick={() => cancelExistingBooking(line)}
                      title="Отменить бронирование на сервере"
                    >
                      🗑
                    </button>
                  </div>
                </div>
                <div className="line-fields">
                  <div className="field field-activity">
                    <label>Мероприятие</label>
                    <div className="readonly-value">{getActivityName(line.activityId)}</div>
                  </div>
                  <div className="field">
                    <label>Начало</label>
                    <input
                      type="datetime-local"
                      value={line.startAt}
                      onChange={e => updateLine(line.id, { startAt: e.target.value, pricingResult: null })}
                    />
                  </div>
                  <div className="field">
                    <label>Окончание</label>
                    <input
                      type="datetime-local"
                      value={line.endAt}
                      onChange={e => updateLine(line.id, { endAt: e.target.value, pricingResult: null })}
                    />
                  </div>
                  <div className="field field-small">
                    <label>Скидка %</label>
                    <input type="number" min="0" max="100" step="0.01"
                      value={line.discountPercent}
                      onChange={e => updateLine(line.id, { discountPercent: e.target.value, pricingResult: null })}
                      placeholder="0" />
                  </div>
                  <div className="field field-reason">
                    <label>Обоснование {line.discountPercent ? '*' : ''}</label>
                    <input type="text"
                      value={line.discountReason}
                      onChange={e => updateLine(line.id, { discountReason: e.target.value })}
                      placeholder="Причина скидки" />
                  </div>
                  <div className="field field-amount-ro">
                    <label>Стоимость</label>
                    <div className={`readonly-value amount ${line.modified && !line.pricingResult ? 'needs-recalc' : ''}`}>
                      {line.pricingResult
                        ? `₽${line.pricingResult.totalAmount.toFixed(2)}`
                        : '—'
                      }
                    </div>
                  </div>
                </div>
                <div className="line-footer">
                  <button
                    className="btn-calc"
                    onClick={() => calculateLine(line)}
                    disabled={line.calculating || !line.activityId}
                  >
                    {line.calculating ? 'Расчёт...' : 'Пересчитать'}
                  </button>
                  {line.modified && !line.pricingResult && !line.calculating && (
                    <span className="recalc-hint">⚠️ Данные изменены — идёт пересчёт…</span>
                  )}
                  {line.pricingResult?.status === 'OK' && (
                    <div className="line-result">
                      <span className="result-label">Стоимость:</span>
                      <span className="result-amount">₽{line.pricingResult.totalAmount.toFixed(2)}</span>
                      {line.pricingResult.discountAmount && line.pricingResult.discountAmount > 0 && (
                        <span className="result-discount">(скидка -₽{line.pricingResult.discountAmount.toFixed(2)})</span>
                      )}
                    </div>
                  )}
                  {line.pricingResult?.status === 'STOP' && (
                    <div className="line-result error">
                      <span>⚠️ {line.pricingResult.stopReason || 'Расчёт невозможен'}</span>
                    </div>
                  )}
                </div>

                {line.pricingResult?.status === 'OK' && line.pricingResult.breakdowns?.length > 0 && (
                  <details className="line-breakdown">
                    <summary>Детализация расчёта</summary>
                    <table>
                      <thead><tr><th>Тип</th><th>Описание</th><th>Сумма</th></tr></thead>
                      <tbody>
                        {line.pricingResult.breakdowns.map((b, i) => (
                          <tr key={i}>
                            <td>{b.lineType}</td>
                            <td>{b.description}</td>
                            <td className={b.amount < 0 ? 'negative' : ''}>{b.amount >= 0 ? '+' : ''}₽{b.amount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {/* New activity lines (editable) */}
        {existingLines.length > 0 && newLines.length > 0 && (
          <div className="section-label new-section-label">Новые активности</div>
        )}

        {newLines.map((line, idx) => (
          <div key={line.id} className="activity-line">
            <div className="line-header">
              <span className="line-number">#{existingLines.length + idx + 1}</span>
              {(newLines.length > 1 || existingLines.length > 0) && (
                <button className="btn-remove" onClick={() => removeLine(line.id)} title="Удалить">✕</button>
              )}
            </div>
            <div className="line-fields">
              <div className="field field-activity">
                <label>Мероприятие *</label>
                <select
                  value={line.activityId || ''}
                  onChange={e => updateLine(line.id, { activityId: e.target.value ? parseInt(e.target.value) : undefined, pricingResult: null })}
                >
                  <option value="">-- Выберите --</option>
                  {activities.map(a => (<option key={a.id} value={a.id}>{a.name}</option>))}
                </select>
              </div>
              <div className="field">
                <label>Начало *</label>
                <input type="datetime-local" value={line.startAt}
                  onChange={e => updateLine(line.id, { startAt: e.target.value, pricingResult: null })} />
              </div>
              <div className="field">
                <label>Окончание *</label>
                <input type="datetime-local" value={line.endAt}
                  onChange={e => updateLine(line.id, { endAt: e.target.value, pricingResult: null })} />
              </div>
              <div className="field field-small">
                <label>Скидка %</label>
                <input type="number" min="0" max="100" step="0.01" value={line.discountPercent}
                  onChange={e => updateLine(line.id, { discountPercent: e.target.value, pricingResult: null })}
                  placeholder="0" />
              </div>
              <div className="field field-reason">
                <label>Обоснование {line.discountPercent ? '*' : ''}</label>
                <input type="text" value={line.discountReason}
                  onChange={e => updateLine(line.id, { discountReason: e.target.value })}
                  placeholder="Причина скидки" />
              </div>
            </div>

            <div className="line-footer">
              <button className="btn-calc" onClick={() => calculateLine(line)}
                disabled={line.calculating || !line.activityId}>
                {line.calculating ? 'Расчёт...' : 'Рассчитать'}
              </button>
              {line.pricingResult?.status === 'OK' && (
                <div className="line-result">
                  <span className="result-label">Стоимость:</span>
                  <span className="result-amount">₽{line.pricingResult.totalAmount.toFixed(2)}</span>
                  {line.pricingResult.discountAmount && line.pricingResult.discountAmount > 0 && (
                    <span className="result-discount">(скидка -₽{line.pricingResult.discountAmount.toFixed(2)})</span>
                  )}
                </div>
              )}
              {line.pricingResult?.status === 'STOP' && (
                <div className="line-result error">
                  <span>⚠️ {line.pricingResult.stopReason || 'Расчёт невозможен'}</span>
                </div>
              )}
            </div>

            {line.pricingResult?.status === 'OK' && line.pricingResult.breakdowns?.length > 0 && (
              <details className="line-breakdown">
                <summary>Детализация расчёта</summary>
                <table>
                  <thead><tr><th>Тип</th><th>Описание</th><th>Сумма</th></tr></thead>
                  <tbody>
                    {line.pricingResult.breakdowns.map((b, i) => (
                      <tr key={i}>
                        <td>{b.lineType}</td>
                        <td>{b.description}</td>
                        <td className={b.amount < 0 ? 'negative' : ''}>{b.amount >= 0 ? '+' : ''}₽{b.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="summary-card">
        <div className="summary-header">
          <h2>Итого</h2>
          <button className="btn-secondary" onClick={calculateAll}>Пересчитать всё</button>
        </div>
        <div className="summary-lines">
          {regularExistingLines.length > 0 && (
            <>
              {regularExistingLines.map(l => (
                <div key={l.id} className={`summary-line existing-summary-line ${l.modified ? 'modified-summary' : ''}`}>
                  <span className="summary-activity">
                    {getActivityName(l.activityId)}
                    <span className="summary-existing-tag">{l.modified ? 'изменено' : 'бронь'}</span>
                  </span>
                  <span className="summary-time">
                    {new Date(l.startAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    {' — '}
                    {new Date(l.endAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="summary-amount">
                    {l.pricingResult ? `₽${l.pricingResult.totalAmount.toFixed(2)}` : '—'}
                  </span>
                </div>
              ))}
              {newLines.some(l => l.pricingResult?.status === 'OK') && (
                <div className="summary-divider" />
              )}
            </>
          )}
          {newLines.filter(l => l.pricingResult?.status === 'OK').map(l => (
            <div key={l.id} className="summary-line">
              <span className="summary-activity">{getActivityName(l.activityId)} <span className="summary-new-tag">новая</span></span>
              <span className="summary-time">
                {new Date(l.startAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                {' — '}
                {new Date(l.endAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="summary-amount">₽{l.pricingResult!.totalAmount.toFixed(2)}</span>
            </div>
          ))}
          {/* Gap filler preview */}
          {detectedGaps.length > 0 && gapFillerActivity && (
            <>
              <div className="summary-divider" />
              <div className="gap-filler-notice">
                ⏱ Пробелы ({detectedGaps.length}) между бронированиями заполняются тарифом «{gapFillerActivity.name}» (отображаются только здесь, в Итого).
                {gapFillerActivity.stopCheckHours && (
                  <span className="stop-check-badge"> · стоп-чек: {gapFillerActivity.stopCheckHours} ч</span>
                )}
              </div>
              {detectedGaps.map((gap, i) => {
                const gapKey = `${gap.startAt}_${gap.endAt}`
                const price = gapPrices[gapKey]
                return (
                  <div key={`gap-${i}`} className={`summary-line gap-summary-line ${gap.trailing ? 'trailing-gap' : ''}`}>
                    <span className="summary-activity">
                      {gapFillerActivity.name}
                      <span className="summary-gap-tag">{gap.trailing ? 'пребывание' : 'пробел'}</span>
                    </span>
                    <span className="summary-time">
                      {new Date(gap.startAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      {' — '}
                      {new Date(gap.endAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      {gap.trailing && ' (сейчас)'}
                    </span>
                    <span className="summary-amount gap-amount">
                      {gapCalcLoading ? '…' : price != null
                        ? price === 0
                          ? <span className="stop-check-free">₽0 (стоп-чек)</span>
                          : `₽${price.toFixed(2)}`
                        : <span title="Назначьте тарифный план мероприятию «Посещение» в разделе Мероприятия">—</span>}
                    </span>
                  </div>
                )
              })}
            </>
          )}
          {detectedGaps.length > 0 && !gapFillerActivity && (
            <div className="gap-filler-warning">
              ⚠️ Обнаружены пробелы ({detectedGaps.length}), но тариф заполнения не настроен.
              Создайте мероприятие с флагом «Поминутная/почасовая оплата» в разделе Мероприятия.
            </div>
          )}
        </div>
        <div className="summary-total">
          <span>Общая стоимость:</span>
          <span className="total-value">₽{totalAmount.toFixed(2)}</span>
        </div>
        <button
          className="btn-primary btn-create"
          onClick={handleSave}
          disabled={!canSave}
        >
          {getSaveButtonText()}
        </button>
      </div>
    </div>
  )
}
