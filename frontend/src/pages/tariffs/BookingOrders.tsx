import { useEffect, useState, useMemo } from 'react'
import { bookingService, activityService, pricingService, bookingOrderService } from '../../api/services'
import type { Booking, Activity, PricingResult } from '../../api/types'
import { useOutletContext } from 'react-router-dom'
import type { User } from '../../api/types'
import Modal from '../../components/Modal'
import FormInput from '../../components/FormInput'
import PaymentQrModal from '../../components/PaymentQrModal'
import TelegramLinkModal from '../../components/TelegramLinkModal'
import { telegramPaymentService } from '../../api/telegramPaymentService'
import './BookingOrders.css'

interface BookingGroup {
  key: string
  customerName: string
  customerPhone: string
  bookings: Booking[]
  totalAmount: number
  /** Есть у группы с заказом; при удалении заказа бронирования не отменяются */
  bookingOrderId?: number | null
}

interface AddLine {
  activityId: number | undefined
  startAt: string
  endAt: string
  discountPercent: string
  discountReason: string
  pricingResult: PricingResult | null
  calculating: boolean
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

function formatForInput(dateStr: string) {
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function emptyAddLine(): AddLine {
  return {
    activityId: undefined, startAt: nowLocal(), endAt: plusHour(),
    discountPercent: '', discountReason: '', pricingResult: null, calculating: false,
  }
}

export default function BookingOrders() {
  useOutletContext<{ user?: User }>()
  const [, setBookings] = useState<Booking[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<BookingGroup[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  /** По умолчанию показываем только группы с привязанным заказом — после «Удалить заказ (брони остаются)» карточка исчезнет */
  const [page, setPage] = useState(0)
  const [pageSize] = useState(50)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [pageInputValue, setPageInputValue] = useState('1')

  // Edit modal
  const [editBooking, setEditBooking] = useState<Booking | null>(null)
  const [editForm, setEditForm] = useState<Partial<Booking>>({})
  const [editPricing, setEditPricing] = useState<PricingResult | null>(null)
  const [editCalcLoading, setEditCalcLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  // Add activity to group modal
  const [addToGroup, setAddToGroup] = useState<BookingGroup | null>(null)
  const [addLine, setAddLine] = useState<AddLine>(emptyAddLine())
  const [addSaving, setAddSaving] = useState(false)

  // Payment
  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null)
  const [bankBotUsername, setBankBotUsername] = useState('')
  const [showTelegramLink, setShowTelegramLink] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentRequestId, setPaymentRequestId] = useState<string | null>(null)
  const [paymentOrderId, setPaymentOrderId] = useState<number>(0)
  const [paymentTitle, setPaymentTitle] = useState('')
  const [creatingPayment, setCreatingPayment] = useState(false)
  const [savingBot, setSavingBot] = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)

  useEffect(() => {
    loadData(0)
    checkTelegramStatus()
  }, [])

  // Обновить список при возврате на вкладку (например, после создания заказа в «Новый заказ»)
  useEffect(() => {
    let wasHidden = document.visibilityState === 'hidden'
    const onVisible = () => {
      const visible = document.visibilityState === 'visible'
      if (wasHidden && visible) loadData(page)
      wasHidden = !visible
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [page])

  const loadData = async (pageToLoad: number) => {
    setLoading(true)
    try {
      const [bkRes, act] = await Promise.all([
        bookingService.getBookings({
          page: pageToLoad,
          size: pageSize,
          sort: 'createdAt,desc',
          status: ['DRAFT', 'CONFIRMED', 'PAID'],
        }),
        activityService.getActivities(undefined, 'ACTIVE'),
      ])
      setActivities(act)
      const isPaginated = bkRes && typeof bkRes === 'object' && 'content' in bkRes
      let list: Booking[]
      let totalEl: number
      let totalPg: number
      let currentPage: number

      if (isPaginated) {
        const p = bkRes as { content: Booking[]; totalElements: number; totalPages: number; number: number }
        const raw = p.content
        totalEl = p.totalElements
        totalPg = p.totalPages
        currentPage = p.number
        list = raw.length > pageSize ? raw.slice(currentPage * pageSize, (currentPage + 1) * pageSize) : raw
      } else {
        const arr = Array.isArray(bkRes) ? bkRes : []
        totalEl = arr.length
        totalPg = Math.max(1, Math.ceil(arr.length / pageSize))
        currentPage = Math.min(pageToLoad, totalPg - 1)
        list = arr.length <= pageSize ? arr : arr.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
      }

      const active = list.filter((b: Booking) => b.status === 'DRAFT' || b.status === 'CONFIRMED' || b.status === 'PAID')
      setBookings(active)
      setTotalPages(totalPg)
      setTotalElements(totalEl)
      setPage(currentPage)
      setPageInputValue(String(currentPage + 1))
      groupBookings(active)
    } catch (err) {
      console.error('Failed to load bookings:', err)
    } finally {
      setLoading(false)
    }
  }

  const groupBookings = (bkList: Booking[]) => {
    const grps: BookingGroup[] = []

    // 1) Группы по заказу (bookingOrderId): все бронирования с одним заказом — одна группа
    const byOrderId = new Map<number, Booking[]>()
    const withoutOrderId: Booking[] = []
    for (const b of bkList) {
      const oid = b.bookingOrderId ?? null
      if (oid != null) {
        if (!byOrderId.has(oid)) byOrderId.set(oid, [])
        byOrderId.get(oid)!.push(b)
      } else {
        withoutOrderId.push(b)
      }
    }
    for (const [orderId, bookings] of byOrderId) {
      bookings.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      grps.push({
        key: `order_${orderId}`,
        customerName: bookings[0].customerName || 'Без имени',
        customerPhone: bookings[0].customerPhone || '',
        bookings,
        totalAmount: bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
        bookingOrderId: orderId,
      })
    }

    // 2) Без заказа: группируем по клиенту и дате — один заказ = одна карточка, не сваливаем все брони клиента в одну
    const clientMap = new Map<string, Booking[]>()
    for (const b of withoutOrderId) {
      const clientKey = `${(b.customerName || 'Без имени').toLowerCase()}_${(b.customerPhone || '').toLowerCase()}`
      if (!clientMap.has(clientKey)) clientMap.set(clientKey, [])
      clientMap.get(clientKey)!.push(b)
    }
    for (const [clientKey, clientBookings] of clientMap) {
      clientBookings.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
      const paidBookings = clientBookings.filter(b => b.status === 'PAID')
      const activeBookings = clientBookings.filter(b => b.status !== 'PAID')
      if (paidBookings.length > 0) {
        const paidByDate = new Map<string, Booking[]>()
        for (const b of paidBookings) {
          const dateKey = new Date(b.startAt).toISOString().slice(0, 10)
          if (!paidByDate.has(dateKey)) paidByDate.set(dateKey, [])
          paidByDate.get(dateKey)!.push(b)
        }
        for (const [dateKey, dateBks] of paidByDate) {
          dateBks.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
          grps.push({
            key: `${clientKey}_paid_${dateKey}`,
            customerName: dateBks[0].customerName || 'Без имени',
            customerPhone: dateBks[0].customerPhone || '',
            bookings: dateBks,
            totalAmount: dateBks.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
          })
        }
      }
      // Активные без заказа — по дате: одна карточка на клиента на день
      if (activeBookings.length > 0) {
        const activeByDate = new Map<string, Booking[]>()
        for (const b of activeBookings) {
          const dateKey = new Date(b.startAt).toISOString().slice(0, 10)
          if (!activeByDate.has(dateKey)) activeByDate.set(dateKey, [])
          activeByDate.get(dateKey)!.push(b)
        }
        for (const [dateKey, dateBks] of activeByDate) {
          dateBks.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
          grps.push({
            key: `${clientKey}_active_${dateKey}`,
            customerName: dateBks[0].customerName || 'Без имени',
            customerPhone: dateBks[0].customerPhone || '',
            bookings: dateBks,
            totalAmount: dateBks.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
          })
        }
      }
    }

    grps.sort((a, b) => {
      const aFullyPaid = a.bookings.every(bk => bk.status === 'PAID')
      const bFullyPaid = b.bookings.every(bk => bk.status === 'PAID')
      if (!aFullyPaid && bFullyPaid) return -1
      if (aFullyPaid && !bFullyPaid) return 1
      const aStart = a.bookings[0]?.startAt || ''
      const bStart = b.bookings[0]?.startAt || ''
      return new Date(bStart).getTime() - new Date(aStart).getTime()
    })
    setGroups(grps)
  }

  const checkTelegramStatus = async () => {
    try {
      const status = await telegramPaymentService.getTelegramStatus()
      setTelegramLinked(status.hasActiveSession)
      if (status.bankBotUsername) setBankBotUsername(status.bankBotUsername)
    } catch { /* ignore */ }
  }

  const getActivityName = (id?: number) => {
    if (!id) return '—'
    return activities.find(a => a.id === id)?.name || `#${id}`
  }

  // ===== Edit =====
  const openEdit = (b: Booking) => {
    setEditBooking(b)
    setEditForm({
      ...b,
      startAt: formatForInput(b.startAt),
      endAt: formatForInput(b.endAt),
    })
    setEditPricing(null)
  }

  const handleEditCalc = async () => {
    if (!editForm.activityId || !editForm.startAt || !editForm.endAt) return
    setEditCalcLoading(true)
    try {
      const result = await pricingService.preview({
        serviceId: editForm.activityId,
        serviceStart: formatLocalDateTime(editForm.startAt!),
        serviceEnd: formatLocalDateTime(editForm.endAt!),
      })
      setEditPricing(result)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Ошибка расчёта')
    } finally {
      setEditCalcLoading(false)
    }
  }

  const handleEditSave = async () => {
    if (!editBooking) return
    setEditSaving(true)
    try {
      await bookingService.updateBooking(editBooking.id, {
        activityId: editForm.activityId,
        startAt: formatLocalDateTime(editForm.startAt!),
        endAt: formatLocalDateTime(editForm.endAt!),
        customerName: editForm.customerName,
        customerPhone: editForm.customerPhone,
        notes: editForm.notes,
        totalAmount: editPricing?.totalAmount ?? editForm.totalAmount,
      })
      setEditBooking(null)
      loadData(page)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Ошибка сохранения')
    } finally {
      setEditSaving(false)
    }
  }

  const handleCancel = async (b: Booking) => {
    if (!confirm(`Отменить бронирование ${getActivityName(b.activityId)}?`)) return
    try {
      await bookingService.cancelBooking(b.id)
      loadData(page)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Ошибка отмены')
    }
  }

  // ===== Add activity to group =====
  const openAddToGroup = (group: BookingGroup) => {
    setAddToGroup(group)
    setAddLine(emptyAddLine())
  }

  const handleAddCalc = async () => {
    if (!addLine.activityId || !addLine.startAt || !addLine.endAt) {
      alert('Выберите мероприятие и укажите время')
      return
    }
    if (new Date(addLine.endAt).getTime() <= new Date(addLine.startAt).getTime()) {
      alert('Время окончания должно быть позже времени начала')
      return
    }
    if (addLine.discountPercent && !addLine.discountReason.trim()) {
      alert('Укажите обоснование скидки')
      return
    }
    setAddLine(prev => ({ ...prev, calculating: true }))
    try {
      const result = await pricingService.preview({
        serviceId: addLine.activityId!,
        serviceStart: formatLocalDateTime(addLine.startAt),
        serviceEnd: formatLocalDateTime(addLine.endAt),
        discountPercent: addLine.discountPercent ? parseFloat(addLine.discountPercent) : undefined,
        discountReason: addLine.discountReason || undefined,
      })
      setAddLine(prev => ({ ...prev, pricingResult: result, calculating: false }))
    } catch (err: any) {
      alert(err.response?.data?.message || 'Ошибка расчёта')
      setAddLine(prev => ({ ...prev, calculating: false }))
    }
  }

  const handleAddSave = async () => {
    if (!addToGroup || !addLine.activityId) return
    if (!addLine.startAt || !addLine.endAt) {
      alert('Укажите время начала и окончания')
      return
    }
    if (new Date(addLine.endAt).getTime() <= new Date(addLine.startAt).getTime()) {
      alert('Время окончания должно быть позже времени начала')
      return
    }

    // Авто-расчёт, если ещё не рассчитано
    let pricingResult = addLine.pricingResult
    if (!pricingResult || pricingResult.status !== 'OK') {
      setAddLine(prev => ({ ...prev, calculating: true }))
      try {
        pricingResult = await pricingService.preview({
          serviceId: addLine.activityId!,
          serviceStart: formatLocalDateTime(addLine.startAt),
          serviceEnd: formatLocalDateTime(addLine.endAt),
          discountPercent: addLine.discountPercent ? parseFloat(addLine.discountPercent) : undefined,
          discountReason: addLine.discountReason || undefined,
        })
        setAddLine(prev => ({ ...prev, pricingResult, calculating: false }))
      } catch (err: any) {
        alert(err.response?.data?.message || 'Ошибка расчёта цены')
        setAddLine(prev => ({ ...prev, calculating: false }))
        return
      }
      if (!pricingResult || pricingResult.status !== 'OK') {
        alert(pricingResult?.stopReason || 'Расчёт невозможен')
        return
      }
    }

    setAddSaving(true)
    try {
      await bookingService.createBooking({
        activityId: addLine.activityId,
        startAt: formatLocalDateTime(addLine.startAt),
        endAt: formatLocalDateTime(addLine.endAt),
        customerName: addToGroup.customerName,
        customerPhone: addToGroup.customerPhone || undefined,
        notes: addLine.discountReason ? `Скидка ${addLine.discountPercent}%: ${addLine.discountReason}` : undefined,
        status: 'CONFIRMED',
        totalAmount: pricingResult.totalAmount,
      })
      setAddToGroup(null)
      loadData(page)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Ошибка при добавлении бронирования')
    } finally {
      setAddSaving(false)
    }
  }

  // ===== Payment =====
  const handleSaveBotUsername = async () => {
    if (!bankBotUsername.trim()) return
    setSavingBot(true)
    try {
      await telegramPaymentService.updateSettings(bankBotUsername.trim())
    } catch { /* ignore */ } finally {
      setSavingBot(false)
    }
  }

  const handlePayment = async (group: BookingGroup) => {
    if (!telegramLinked) {
      setShowTelegramLink(true)
      return
    }
    if (!bankBotUsername.trim()) {
      alert('Укажите получателя в Telegram')
      return
    }
    try {
      await telegramPaymentService.updateSettings(bankBotUsername.trim())
    } catch { /* ignore */ }

    setCreatingPayment(true)
    try {
      // Send all booking IDs: "bookings_15,16,17"
      const ids = group.bookings.map(b => b.id).join(',')
      const invoiceId = `bookings_${ids}`
      const pr = await telegramPaymentService.createPaymentRequest(invoiceId)
      setPaymentRequestId(pr.id)
      setPaymentOrderId(group.bookings[0].id)
      setPaymentTitle(`Оплата: ${group.customerName} — ₽${group.totalAmount.toFixed(2)}`)
      setShowPaymentModal(true)
    } catch (err: any) {
      let msg = err.response?.data?.message || 'Ошибка создания оплаты'
      if (msg.includes('Telegram session') || msg.includes('link your Telegram')) {
        setShowTelegramLink(true)
      } else {
        alert(msg)
      }
    } finally {
      setCreatingPayment(false)
    }
  }

  // ===== Mark as Paid =====
  const handleMarkGroupPaid = async (group: BookingGroup) => {
    const unpaidBookings = group.bookings.filter(b => b.status !== 'PAID')
    if (unpaidBookings.length === 0) {
      alert('Все бронирования уже оплачены')
      return
    }
    if (!confirm(`Отметить ${unpaidBookings.length} бронирований как оплаченные для ${group.customerName}?`)) return
    
    setMarkingPaid(true)
    try {
      // Загружаем СВЕЖИЕ данные активностей, чтобы гарантировать актуальность stopCheckHours
      const freshActivities = await activityService.getActivities(undefined, 'ACTIVE')
      setActivities(freshActivities) // обновляем state тоже
      const gapFiller = freshActivities.find((a: Activity) => a.gapFiller)

      if (gapFiller && group.bookings.length > 0) {
        const stopCheckMin = gapFiller.stopCheckHours ? gapFiller.stopCheckHours * 60 : null
        console.info('[handleMarkGroupPaid] gapFiller:', gapFiller.name,
          'stopCheckHours:', gapFiller.stopCheckHours, '→ stopCheckMin:', stopCheckMin)

        const sortedBookings = [...group.bookings].sort((a, b) =>
          new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
        )
        const firstStart = new Date(sortedBookings[0].startAt).getTime()

        // 1) Создаём бронирования для промежуточных пробелов
        // (используем свежий gapFiller для расчёта)
        const interGaps = getIntermediateGapsWithActivity(group, gapFiller, stopCheckMin)
        for (const gap of interGaps) {
          try {
            let totalAmount = 0
            if (!gap.isFree) {
              const pricing = await pricingService.preview({
                serviceId: gapFiller.id,
                serviceStart: formatLocalDateTime(toLocalDatetimeInput(gap.startAt)),
                serviceEnd: formatLocalDateTime(toLocalDatetimeInput(gap.endAt)),
              })
              totalAmount = pricing.totalAmount
            }
            const gapBooking = await bookingService.createBooking({
              activityId: gapFiller.id,
              startAt: formatLocalDateTime(toLocalDatetimeInput(gap.startAt)),
              endAt: formatLocalDateTime(toLocalDatetimeInput(gap.endAt)),
              customerName: group.customerName,
              customerPhone: group.customerPhone || undefined,
              notes: `Автозаполнение пробела (${gapFiller.name})${gap.isFree ? ' [стоп-чек]' : ''}`,
              status: 'CONFIRMED',
              totalAmount,
            })
            await bookingService.markAsPaid(gapBooking.id)
          } catch (err) {
            console.error('Ошибка при создании промежуточного пробела:', err)
          }
        }

        // 2) Хвостовой пробел (пребывание)
        const lastBooking = sortedBookings[sortedBookings.length - 1]
        const lastEnd = new Date(lastBooking.endAt).getTime()
        const now = Date.now()

        if (now > lastEnd + 60_000) { // >1 min trailing gap
          try {
            const minutesSinceArrival = (lastEnd - firstStart) / 60_000
            const minutesAtNow = (now - firstStart) / 60_000
            let totalAmount = 0
            let isFree = false
            let stopCheckApplied = false

            console.info('[handleMarkGroupPaid] trailing gap:',
              'minutesSinceArrival:', Math.round(minutesSinceArrival),
              'minutesAtNow:', Math.round(minutesAtNow),
              'stopCheckMin:', stopCheckMin)

            if (stopCheckMin && minutesSinceArrival >= stopCheckMin) {
              isFree = true
              stopCheckApplied = true
            } else {
              let effectiveEnd = now
              if (stopCheckMin) {
                if (minutesAtNow > stopCheckMin) {
                  effectiveEnd = firstStart + stopCheckMin * 60_000
                  stopCheckApplied = true
                  console.info('[handleMarkGroupPaid] стоп-чек: обрезаем конец с',
                    new Date(now).toISOString(), 'до', new Date(effectiveEnd).toISOString())
                }
              }
              const trailingPricing = await pricingService.preview({
                serviceId: gapFiller.id,
                serviceStart: formatLocalDateTime(toLocalDatetimeInput(new Date(lastEnd))),
                serviceEnd: formatLocalDateTime(toLocalDatetimeInput(new Date(effectiveEnd))),
              })
              totalAmount = trailingPricing.totalAmount
              console.info('[handleMarkGroupPaid] trailing price:', totalAmount,
                'for period', new Date(lastEnd).toLocaleTimeString(), '→', new Date(effectiveEnd).toLocaleTimeString())
            }

            const noteStopCheck = isFree
              ? ' [стоп-чек — бесплатно]'
              : stopCheckApplied
                ? ` [стоп-чек ${gapFiller.stopCheckHours} ч — частично]`
                : ''
            const trailingBooking = await bookingService.createBooking({
              activityId: gapFiller.id,
              startAt: formatLocalDateTime(toLocalDatetimeInput(new Date(lastEnd))),
              endAt: formatLocalDateTime(toLocalDatetimeInput(new Date(now))),
              customerName: group.customerName,
              customerPhone: group.customerPhone || undefined,
              notes: `Пребывание до оплаты (${gapFiller.name})${noteStopCheck}`,
              status: 'CONFIRMED',
              totalAmount,
            })
            await bookingService.markAsPaid(trailingBooking.id)
          } catch (err) {
            console.error('Ошибка при создании пребывания:', err)
          }
        }
      }

      for (const b of unpaidBookings) {
        await bookingService.markAsPaid(b.id)
      }
      // Обновляем колокольчик уведомлений (уведомления авто-закрылись на бэкенде)
      window.dispatchEvent(new Event('time-override-changed'))
      loadData(page)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Ошибка при отметке оплаты')
    } finally {
      setMarkingPaid(false)
    }
  }

  // ===== Delete order: выбор — с отменой броней или без =====
  const SESSION_KEY_DELETED_ORDER_IDS = 'bookingOrders_deletedOrderIdLists'
  const loadDeletedOrderIdLists = (): number[][] => {
    try {
      const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_KEY_DELETED_ORDER_IDS) : null
      if (raw) {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.filter((a: unknown) => Array.isArray(a)) : []
      }
    } catch { /* ignore */ }
    return []
  }
  const saveDeletedOrderIdLists = (lists: number[][]) => {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SESSION_KEY_DELETED_ORDER_IDS, JSON.stringify(lists))
    } catch { /* ignore */ }
  }
  const [groupToDelete, setGroupToDelete] = useState<BookingGroup | null>(null)
  /** После «Удалить заказ (брони остаются)» — помечаем группу плашкой; список id-групп храним в sessionStorage, чтобы плашка сохранялась после перезагрузки. */
  const [deletedOrderIdLists, setDeletedOrderIdLists] = useState<number[][]>(loadDeletedOrderIdLists)

  const doDeleteOrder = async (group: BookingGroup, cancelBookings: boolean) => {
    const count = group.bookings.length
    if (count === 0) return
    setGroupToDelete(null)
    try {
      if (cancelBookings) {
        const ids = group.bookings.map(b => b.id).filter(Boolean)
        if (ids.length > 0) {
          await bookingService.cancelBookingsBulk(ids)
        }
      }
      if (group.bookingOrderId != null) {
        await bookingOrderService.delete(group.bookingOrderId, false)
        const ids = group.bookings.map(b => b.id).filter((id): id is number => id != null)
        setDeletedOrderIdLists(prev => {
          const next = [...prev, ids]
          saveDeletedOrderIdLists(next)
          return next
        })
      } else if (!cancelBookings) {
        const branchId = group.bookings[0]?.branchId
        if (branchId != null) {
          await bookingOrderService.dissolve(branchId, group.customerName, group.customerPhone, false)
          const ids = group.bookings.map(b => b.id).filter((id): id is number => id != null)
          setDeletedOrderIdLists(prev => {
            const next = [...prev, ids]
            saveDeletedOrderIdLists(next)
            return next
          })
        } else {
          console.warn('[BookingOrders] No bookingOrderId and no branchId — ничего не отправлено')
        }
      }
      await loadData(0)
      if (!cancelBookings) {
        alert('Заказ удалён. Бронирования сохранены.')
      }
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.message ?? 'Ошибка при удалении заказа'
      console.error('[BookingOrders] doDeleteOrder failed:', err.response?.status, msg, err)
      alert(msg)
    }
  }

  const handleDeleteGroupClick = (group: BookingGroup) => {
    if (group.bookings.length === 0) return
    setGroupToDelete(group)
  }

  const isGroupFullyPaid = (group: BookingGroup) => group.bookings.every(b => b.status === 'PAID')

  // ===== Trailing gap (пребывание) =====
  const gapFillerActivity = useMemo(() => activities.find(a => a.gapFiller), [activities])
  const [nowTick, setNowTick] = useState(Date.now())
  // Цены пробелов: ключ = `${groupKey}__${startMs}_${endMs}` для промежуточных, `${groupKey}__trailing` для хвоста
  const [gapPriceDetails, setGapPriceDetails] = useState<Record<string, number | null>>({})
  // Итоговая сумма пробелов по группе (для total и кнопок)
  const [trailingPrices, setTrailingPrices] = useState<Record<string, number>>({})

  // Обновляем «сейчас» каждые 30 секунд для пересчёта хвостового пробела
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  /** Ключ для промежуточного пробела */
  const gapPriceKey = (groupKey: string, gap: { startAt: Date; endAt: Date }) =>
    `${groupKey}__${gap.startAt.getTime()}_${gap.endAt.getTime()}`
  /** Ключ для хвостового пробела */
  const trailingPriceKey = (groupKey: string) => `${groupKey}__trailing`

  // Рассчитываем цену пробелов только для первых N групп, чтобы не лагало при сотнях заказов
  const MAX_GROUPS_FOR_GAP_CALC = 20
  useEffect(() => {
    if (!gapFillerActivity || groups.length === 0) return
    let cancelled = false

    const calcAll = async () => {
      const totals: Record<string, number> = {}
      const details: Record<string, number | null> = {}
      const groupsToCalc = groups.slice(0, MAX_GROUPS_FOR_GAP_CALC)

      for (const group of groupsToCalc) {
        if (isGroupFullyPaid(group)) continue
        let groupGapTotal = 0

        // 1) Промежуточные пробелы
        const interGaps = getIntermediateGaps(group)
        for (const gap of interGaps) {
          const key = gapPriceKey(group.key, gap)
          if (gap.isFree) {
            details[key] = 0
            continue
          }
          try {
            const res = await pricingService.preview({
              serviceId: gapFillerActivity.id,
              serviceStart: formatLocalDateTime(toLocalDatetimeInput(gap.startAt)),
              serviceEnd: formatLocalDateTime(toLocalDatetimeInput(gap.endAt)),
            })
            if (!cancelled) {
              details[key] = res.totalAmount
              groupGapTotal += res.totalAmount
            }
          } catch {
            if (!cancelled) details[key] = null
          }
        }

        // 2) Хвостовой пробел
        const sortedBookings = [...group.bookings].sort((a, b) =>
          new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
        )
        if (sortedBookings.length > 0) {
          const firstStart = new Date(sortedBookings[0].startAt).getTime()
          const lastEnd = new Date(sortedBookings[sortedBookings.length - 1].endAt).getTime()
          const tKey = trailingPriceKey(group.key)
          if (nowTick > lastEnd + 60_000) {
            const stopCheckMin = gapFillerActivity.stopCheckHours ? gapFillerActivity.stopCheckHours * 60 : null
            const minutesSinceArrival = (lastEnd - firstStart) / 60_000

            if (stopCheckMin && minutesSinceArrival >= stopCheckMin) {
              details[tKey] = 0 // trailing gap бесплатный
            } else {
              let effectiveEnd = nowTick
              if (stopCheckMin) {
                const minutesAtNow = (nowTick - firstStart) / 60_000
                if (minutesAtNow > stopCheckMin) {
                  effectiveEnd = firstStart + stopCheckMin * 60_000
                }
              }
              try {
                const res = await pricingService.preview({
                  serviceId: gapFillerActivity.id,
                  serviceStart: formatLocalDateTime(toLocalDatetimeInput(new Date(lastEnd))),
                  serviceEnd: formatLocalDateTime(toLocalDatetimeInput(new Date(effectiveEnd))),
                })
                if (!cancelled) {
                  details[tKey] = res.totalAmount
                  groupGapTotal += res.totalAmount
                }
              } catch {
                if (!cancelled) details[tKey] = null
              }
            }
          }
        }
        totals[group.key] = groupGapTotal
      }
      if (!cancelled) {
        setTrailingPrices(totals)
        setGapPriceDetails(details)
      }
    }
    calcAll()
    return () => { cancelled = true }
  }, [nowTick, groups, gapFillerActivity])

  /** Обнаружить пробелы МЕЖДУ бронированиями группы (не хвостовой!) — для отображения */
  const getIntermediateGaps = (group: BookingGroup): Array<{
    startAt: Date; endAt: Date; minutes: number;
    isFree: boolean;
  }> => {
    if (!gapFillerActivity) return []
    return getIntermediateGapsWithActivity(group, gapFillerActivity,
      gapFillerActivity.stopCheckHours ? gapFillerActivity.stopCheckHours * 60 : null)
  }

  /** Обнаружить пробелы МЕЖДУ бронированиями, используя переданную активность и stopCheckMin */
  const getIntermediateGapsWithActivity = (
    group: BookingGroup,
    gapAct: Activity,
    scMin: number | null,
  ): Array<{
    startAt: Date; endAt: Date; minutes: number;
    isFree: boolean;
  }> => {
    if (isGroupFullyPaid(group)) return []
    const unpaid = group.bookings.filter(b => b.status !== 'PAID')
    if (unpaid.length < 2) return []

    // Исключаем бронирования, которые УЖЕ являются автозаполнением пробелов
    const nonGapBookings = unpaid.filter(b => b.activityId !== gapAct.id)
    if (nonGapBookings.length < 2) return []

    const sorted = [...nonGapBookings].sort((a, b) =>
      new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    )
    const firstStart = new Date(sorted[0].startAt).getTime()

    const gaps: Array<{ startAt: Date; endAt: Date; minutes: number; isFree: boolean }> = []

    for (let i = 0; i < sorted.length - 1; i++) {
      const endCurrent = new Date(sorted[i].endAt).getTime()
      const startNext = new Date(sorted[i + 1].startAt).getTime()
      if (startNext > endCurrent + 60_000) { // >1 min
        // Проверяем, нет ли УЖЕ заполнения для этого пробела
        const alreadyFilled = unpaid.some(b =>
          b.activityId === gapAct.id &&
          Math.abs(new Date(b.startAt).getTime() - endCurrent) < 120_000 &&
          Math.abs(new Date(b.endAt).getTime() - startNext) < 120_000
        )
        if (alreadyFilled) continue

        const minutes = Math.round((startNext - endCurrent) / 60_000)
        let isFree = false
        if (scMin) {
          const minutesSinceArrival = (endCurrent - firstStart) / 60_000
          if (minutesSinceArrival >= scMin) isFree = true
        }
        gaps.push({ startAt: new Date(endCurrent), endAt: new Date(startNext), minutes, isFree })
      }
    }
    return gaps
  }

  /** Вычислить хвостовой пробел для группы: от конца последней брони до сейчас.
   *  Учитывает стоп-чек: если клиент был в заведении дольше stopCheckHours, хвост бесплатный.
   */
  const getTrailingGap = (group: BookingGroup): {
    startAt: Date; endAt: Date; minutes: number;
    stopCheckReached: boolean; freeMinutes: number;
  } | null => {
    if (!gapFillerActivity) return null
    if (isGroupFullyPaid(group)) return null
    if (group.bookings.length === 0) return null

    const sortedBookings = [...group.bookings].sort((a, b) =>
      new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    )
    const firstStart = new Date(sortedBookings[0].startAt).getTime()
    const lastBooking = sortedBookings[sortedBookings.length - 1]
    const lastEnd = new Date(lastBooking.endAt).getTime()
    if (nowTick <= lastEnd + 60_000) return null // <1 min — ignore

    const totalMinutes = Math.round((nowTick - lastEnd) / 60_000)
    const stopCheckMin = gapFillerActivity.stopCheckHours ? gapFillerActivity.stopCheckHours * 60 : null

    let stopCheckReached = false
    let freeMinutes = 0

    if (stopCheckMin) {
      const minutesSinceArrival = (lastEnd - firstStart) / 60_000
      if (minutesSinceArrival >= stopCheckMin) {
        // Весь хвост бесплатный
        stopCheckReached = true
        freeMinutes = totalMinutes
      } else {
        const minutesAtNow = (nowTick - firstStart) / 60_000
        if (minutesAtNow > stopCheckMin) {
          // Частично бесплатный
          freeMinutes = Math.round(minutesAtNow - stopCheckMin)
          stopCheckReached = true
        }
      }
    }

    return {
      startAt: new Date(lastEnd),
      endAt: new Date(nowTick),
      minutes: totalMinutes,
      stopCheckReached,
      freeMinutes,
    }
  }

  const searchFiltered = searchQuery.trim()
    ? groups.filter(g => {
        const q = searchQuery.toLowerCase()
        return g.customerName.toLowerCase().includes(q) || g.customerPhone.toLowerCase().includes(q)
      })
    : groups

  const isGroupMarkedAsDeletedOrder = (g: BookingGroup) => {
    if ((g.bookingOrderId ?? null) != null) return false
    const ids = new Set(g.bookings.map(b => b.id).filter((id): id is number => id != null))
    return deletedOrderIdLists.some(list => {
      if (list.length !== ids.size) return false
      return list.every(id => ids.has(id))
    })
  }

  const orderGroups = searchFiltered.filter(g => (g.bookingOrderId ?? null) != null)
  const deletedOrderGroups = searchFiltered.filter(g => isGroupMarkedAsDeletedOrder(g))
  const MAX_DISPLAY_GROUPS = 100

  if (loading) {
    return <div className="active-bookings-page"><p>Загрузка...</p></div>
  }

  return (
    <div className="active-bookings-page">
      <h1>Заказы</h1>
      <p className="page-subtitle">Управление заказами клиентов, расчёт финальной цены и генерация ссылки на оплату</p>

      {/* Telegram settings */}
      <div className="tg-settings-bar">
        <div className="tg-bot-group">
          <label>Получатель в Telegram:</label>
          <div className="tg-input-group">
            <span className="at-sign">@</span>
            <input
              type="text"
              value={bankBotUsername}
              onChange={e => setBankBotUsername(e.target.value.replace(/^@/, ''))}
              placeholder="username"
              className="tg-input"
            />
            <button
              className="btn-save-tg"
              onClick={handleSaveBotUsername}
              disabled={savingBot || !bankBotUsername.trim()}
            >
              {savingBot ? '...' : '💾'}
            </button>
          </div>
          {telegramLinked !== null && (
            <span className={`tg-status ${telegramLinked ? 'ok' : 'warn'}`}>
              {telegramLinked ? '✅ Telegram подключён' : '⚠️ Не подключён'}
            </span>
          )}
          {!telegramLinked && (
            <button className="btn-link-tg" onClick={() => setShowTelegramLink(true)}>
              Подключить Telegram
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      {groups.length > 0 && (
        <div className="ab-search-bar">
          <input
            type="text"
            className="ab-search-input"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени или телефону клиента..."
          />
          {searchQuery && (
            <button className="ab-search-clear" onClick={() => setSearchQuery('')}>✕</button>
          )}
          <span className="ab-search-count">
            Заказов: {orderGroups.length} · Отменённых: {deletedOrderGroups.length}
          </span>
        </div>
      )}

      {orderGroups.length === 0 && deletedOrderGroups.length === 0 && !searchQuery ? (
        <div className="empty-state">
          <p>Нет активных заказов</p>
          <a href="/booking-orders/new" className="btn-primary-link">Создать новый заказ</a>
        </div>
      ) : orderGroups.length === 0 && deletedOrderGroups.length === 0 && searchQuery ? (
        <div className="empty-state">
          <p>По запросу «{searchQuery}» ничего не найдено</p>
          <button className="btn-primary" onClick={() => setSearchQuery('')}>Сбросить поиск</button>
        </div>
      ) : (
        <>
        {/* Заказы */}
        <section className="booking-orders-section">
          <h2 className="booking-orders-section-title">Заказы</h2>
          {orderGroups.length === 0 ? (
            <p className="section-empty">Нет заказов{searchQuery ? ' по запросу' : ''}.</p>
          ) : (
            <>
              {orderGroups.length > MAX_DISPLAY_GROUPS && (
                <p className="ab-search-count" style={{ marginBottom: 8 }}>
                  Показаны первые {MAX_DISPLAY_GROUPS} из {orderGroups.length}.
                </p>
              )}
              {orderGroups.slice(0, MAX_DISPLAY_GROUPS).map(group => (
          <div key={group.key} className="booking-group-card">
            {isGroupMarkedAsDeletedOrder(group) && (
              <div className="group-deleted-badge" role="status">
                Заказ удалён. Бронирования сохранены.
              </div>
            )}
            <div className="group-header">
              <div className="group-client">
                <span className="client-name">{group.customerName}</span>
                {group.customerPhone && (
                  <span className="client-phone">{group.customerPhone}</span>
                )}
              </div>
              <div className="group-header-right">
                <div className="group-total">
                  <span className="total-label">Итого:</span>
                  <span className="total-amount">₽{(group.totalAmount + (trailingPrices[group.key] || 0)).toFixed(2)}</span>
                </div>
                <button
                  className="btn-sm btn-delete-group"
                  onClick={() => handleDeleteGroupClick(group)}
                  title="Удалить заказ"
                >
                  🗑
                </button>
              </div>
            </div>

            <div className="group-bookings">
              {/* Единая хронологическая шкала: бронирования + пробелы + хвост */}
              {(() => {
                type TimelineRow =
                  | { type: 'booking'; startMs: number; booking: Booking }
                  | { type: 'gap'; startMs: number; gap: { startAt: Date; endAt: Date; minutes: number; isFree: boolean } }
                  | { type: 'trailing'; startMs: number; trailing: { startAt: Date; endAt: Date; minutes: number; stopCheckReached: boolean; freeMinutes: number } }

                const rows: TimelineRow[] = []

                // Добавляем бронирования
                for (const b of group.bookings) {
                  rows.push({ type: 'booking', startMs: new Date(b.startAt).getTime(), booking: b })
                }

                // Добавляем промежуточные пробелы
                if (gapFillerActivity) {
                  const interGaps = getIntermediateGaps(group)
                  for (const gap of interGaps) {
                    rows.push({ type: 'gap', startMs: gap.startAt.getTime(), gap })
                  }
                  // Добавляем хвостовой пробел
                  const trailing = getTrailingGap(group)
                  if (trailing) {
                    rows.push({ type: 'trailing', startMs: trailing.startAt.getTime(), trailing })
                  }
                }

                // Сортируем по времени начала
                rows.sort((a, b) => a.startMs - b.startMs)

                return rows.map((row, idx) => {
                  if (row.type === 'booking') {
                    const b = row.booking
                    return (
                      <div key={`bk-${b.id}`} className="booking-row">
                        <div className="booking-info">
                          <span className="booking-activity">{getActivityName(b.activityId)}</span>
                          <span className="booking-time">
                            {new Date(b.startAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            {' — '}
                            {new Date(b.endAt).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className={`booking-status ${b.status.toLowerCase()}`}>
                            {b.status === 'CONFIRMED' ? 'Подтверждено' : b.status === 'DRAFT' ? 'Черновик' : b.status === 'PAID' ? 'Оплачено' : b.status}
                          </span>
                        </div>
                        <div className="booking-amount">
                          {b.totalAmount ? `₽${b.totalAmount.toFixed(2)}` : '—'}
                        </div>
                        <div className="booking-actions">
                          {b.status !== 'PAID' && (
                            <>
                              <button className="btn-sm btn-edit" onClick={() => openEdit(b)}>Изменить</button>
                              <button className="btn-sm btn-cancel" onClick={() => handleCancel(b)}>Отменить</button>
                            </>
                          )}
                          {b.status === 'PAID' && (
                            <span className="paid-badge">✅ Оплачено</span>
                          )}
                        </div>
                      </div>
                    )
                  }

                  if (row.type === 'gap') {
                    const gap = row.gap
                    const hours = Math.floor(gap.minutes / 60)
                    const mins = gap.minutes % 60
                    const durText = hours > 0 ? `${hours} ч ${mins} мин` : `${mins} мин`
                    const priceK = gapPriceKey(group.key, gap)
                    const price = gapPriceDetails[priceK]
                    return (
                      <div key={`intgap-${idx}`} className="booking-row trailing-gap-row">
                        <div className="booking-info">
                          <span className="booking-activity trailing-activity">
                            ⏱ {gapFillerActivity!.name}
                          </span>
                          <span className="booking-time">
                            {gap.startAt.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                            {' — '}
                            {gap.endAt.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="booking-status trailing-status">
                            пробел · {durText}
                          </span>
                          {gap.isFree && (
                            <span className="stop-check-badge">стоп-чек — бесплатно</span>
                          )}
                        </div>
                        <div className="booking-amount trailing-amount">
                          {gap.isFree
                            ? <span className="stop-check-free">₽0</span>
                            : price != null
                              ? `₽${price.toFixed(2)}`
                              : 'расчёт...'}
                        </div>
                        <div className="booking-actions">
                          <span className="trailing-hint">заполнится при оплате</span>
                        </div>
                      </div>
                    )
                  }

                  if (row.type === 'trailing') {
                    const trailing = row.trailing
                    const hours = Math.floor(trailing.minutes / 60)
                    const mins = trailing.minutes % 60
                    const durText = hours > 0 ? `${hours} ч ${mins} мин` : `${mins} мин`
                    const tKey = trailingPriceKey(group.key)
                    const price = gapPriceDetails[tKey]
                    return (
                      <div key={`trailing-${idx}`} className="booking-row trailing-gap-row">
                        <div className="booking-info">
                          <span className="booking-activity trailing-activity">
                            ⏱ {gapFillerActivity!.name}
                          </span>
                          <span className="booking-time">
                            {trailing.startAt.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                            {' — '}
                            {trailing.endAt.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="booking-status trailing-status">
                            пребывание · {durText}
                          </span>
                          {trailing.stopCheckReached && (
                            <span className="stop-check-badge">
                              стоп-чек {gapFillerActivity!.stopCheckHours} ч
                              {trailing.freeMinutes >= trailing.minutes
                                ? ' — полностью бесплатно'
                                : ` — ${trailing.freeMinutes} мин бесплатно`}
                            </span>
                          )}
                        </div>
                        <div className="booking-amount trailing-amount">
                          {trailing.stopCheckReached && trailing.freeMinutes >= trailing.minutes
                            ? <span className="stop-check-free">₽0</span>
                            : price != null
                              ? `₽${price.toFixed(2)}`
                              : 'расчёт...'}
                        </div>
                        <div className="booking-actions">
                          <span className="trailing-hint">обновляется автоматически</span>
                        </div>
                      </div>
                    )
                  }

                  return null
                })
              })()}
            </div>

            <div className="group-footer">
              {!isGroupFullyPaid(group) && (
                <button className="btn-sm btn-add-activity" onClick={() => openAddToGroup(group)}>
                  + Добавить активность
                </button>
              )}
              {isGroupFullyPaid(group) ? (
                <div className="group-paid-badge">✅ Заказ оплачен</div>
              ) : (
                <div className="group-footer-actions">
                  <button
                    className="btn-success btn-mark-paid"
                    onClick={() => handleMarkGroupPaid(group)}
                    disabled={markingPaid || (group.totalAmount + (trailingPrices[group.key] || 0)) <= 0}
                  >
                    {markingPaid ? 'Сохранение...' : '✓ Заказ оплачен'}
                  </button>
                  <button
                    className="btn-primary btn-pay"
                    onClick={() => handlePayment(group)}
                    disabled={creatingPayment || !bankBotUsername.trim() || (group.totalAmount + (trailingPrices[group.key] || 0)) <= 0}
                  >
                    {creatingPayment ? 'Создание...' : 'Сформировать ссылку оплаты'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
            </>
          )}
        </section>

        {/* Отменённые заказы */}
        <section className="booking-orders-section">
          <h2 className="booking-orders-section-title">Отменённые заказы</h2>
          {deletedOrderGroups.length === 0 ? (
            <p className="section-empty">Нет отменённых заказов{searchQuery ? ' по запросу' : ''}.</p>
          ) : (
            <>
              {deletedOrderGroups.length > MAX_DISPLAY_GROUPS && (
                <p className="ab-search-count" style={{ marginBottom: 8 }}>
                  Показаны первые {MAX_DISPLAY_GROUPS} из {deletedOrderGroups.length}.
                </p>
              )}
              {deletedOrderGroups.slice(0, MAX_DISPLAY_GROUPS).map(group => (
          <div key={group.key} className="booking-group-card">
            <div className="group-deleted-badge" role="status">
              Заказ удалён. Бронирования сохранены.
            </div>
            <div className="group-header">
              <div className="group-client">
                <span className="client-name">{group.customerName}</span>
                {group.customerPhone && (
                  <span className="client-phone">{group.customerPhone}</span>
                )}
              </div>
              <div className="group-header-right">
                <div className="group-total">
                  <span className="total-label">Итого:</span>
                  <span className="total-amount">₽{(group.totalAmount + (trailingPrices[group.key] || 0)).toFixed(2)}</span>
                </div>
                <button
                  className="btn-sm btn-delete-group"
                  onClick={() => handleDeleteGroupClick(group)}
                  title="Удалить заказ"
                >
                  🗑
                </button>
              </div>
            </div>

            <div className="group-bookings">
              {(() => {
                type TimelineRow =
                  | { type: 'booking'; startMs: number; booking: Booking }
                  | { type: 'gap'; startMs: number; gap: { startAt: Date; endAt: Date; minutes: number; isFree: boolean } }
                  | { type: 'trailing'; startMs: number; trailing: { startAt: Date; endAt: Date; minutes: number; stopCheckReached: boolean; freeMinutes: number } }
                const rows: TimelineRow[] = []
                for (const b of group.bookings) {
                  rows.push({ type: 'booking', startMs: new Date(b.startAt).getTime(), booking: b })
                }
                if (gapFillerActivity) {
                  const interGaps = getIntermediateGaps(group)
                  for (const gap of interGaps) {
                    rows.push({ type: 'gap', startMs: gap.startAt.getTime(), gap })
                  }
                  const trailing = getTrailingGap(group)
                  if (trailing) {
                    rows.push({ type: 'trailing', startMs: trailing.startAt.getTime(), trailing })
                  }
                }
                rows.sort((a, b) => a.startMs - b.startMs)
                return rows.map((row, idx) => {
                  if (row.type === 'booking') {
                    const b = row.booking
                    return (
                      <div key={`bk-${b.id}`} className="booking-row">
                        <div className="booking-info">
                          <span className="booking-activity">{getActivityName(b.activityId)}</span>
                          <span className="booking-time">
                            {new Date(b.startAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            {' — '}
                            {new Date(b.endAt).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className={`booking-status ${b.status.toLowerCase()}`}>
                            {b.status === 'CONFIRMED' ? 'Подтверждено' : b.status === 'DRAFT' ? 'Черновик' : b.status === 'PAID' ? 'Оплачено' : b.status}
                          </span>
                        </div>
                        <div className="booking-amount">
                          {b.totalAmount ? `₽${b.totalAmount.toFixed(2)}` : '—'}
                        </div>
                        <div className="booking-actions">
                          {b.status !== 'PAID' && (
                            <>
                              <button className="btn-sm btn-edit" onClick={() => openEdit(b)}>Изменить</button>
                              <button className="btn-sm btn-cancel" onClick={() => handleCancel(b)}>Отменить</button>
                            </>
                          )}
                          {b.status === 'PAID' && (
                            <span className="paid-badge">✅ Оплачено</span>
                          )}
                        </div>
                      </div>
                    )
                  }
                  if (row.type === 'gap') {
                    const gap = row.gap
                    const hours = Math.floor(gap.minutes / 60)
                    const mins = gap.minutes % 60
                    const durText = hours > 0 ? `${hours} ч ${mins} мин` : `${mins} мин`
                    const priceK = gapPriceKey(group.key, gap)
                    const price = gapPriceDetails[priceK]
                    return (
                      <div key={`intgap-${idx}`} className="booking-row trailing-gap-row">
                        <div className="booking-info">
                          <span className="booking-activity trailing-activity">⏱ {gapFillerActivity!.name}</span>
                          <span className="booking-time">
                            {gap.startAt.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                            {' — '}
                            {gap.endAt.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="booking-status trailing-status">пробел · {durText}</span>
                          {gap.isFree && <span className="stop-check-badge">стоп-чек — бесплатно</span>}
                        </div>
                        <div className="booking-amount trailing-amount">
                          {gap.isFree ? <span className="stop-check-free">₽0</span> : price != null ? `₽${price.toFixed(2)}` : 'расчёт...'}
                        </div>
                        <div className="booking-actions"><span className="trailing-hint">заполнится при оплате</span></div>
                      </div>
                    )
                  }
                  if (row.type === 'trailing') {
                    const trailing = row.trailing
                    const hours = Math.floor(trailing.minutes / 60)
                    const mins = trailing.minutes % 60
                    const durText = hours > 0 ? `${hours} ч ${mins} мин` : `${mins} мин`
                    const tKey = trailingPriceKey(group.key)
                    const price = gapPriceDetails[tKey]
                    return (
                      <div key={`trailing-${idx}`} className="booking-row trailing-gap-row">
                        <div className="booking-info">
                          <span className="booking-activity trailing-activity">⏱ {gapFillerActivity!.name}</span>
                          <span className="booking-time">
                            {trailing.startAt.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                            {' — '}
                            {trailing.endAt.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="booking-status trailing-status">пребывание · {durText}</span>
                          {trailing.stopCheckReached && (
                            <span className="stop-check-badge">
                              стоп-чек {gapFillerActivity!.stopCheckHours} ч
                              {trailing.freeMinutes >= trailing.minutes ? ' — полностью бесплатно' : ` — ${trailing.freeMinutes} мин бесплатно`}
                            </span>
                          )}
                        </div>
                        <div className="booking-amount trailing-amount">
                          {trailing.stopCheckReached && trailing.freeMinutes >= trailing.minutes
                            ? <span className="stop-check-free">₽0</span>
                            : price != null ? `₽${price.toFixed(2)}` : 'расчёт...'}
                        </div>
                        <div className="booking-actions"><span className="trailing-hint">обновляется автоматически</span></div>
                      </div>
                    )
                  }
                  return null
                })
              })()}
            </div>

            <div className="group-footer">
              {!isGroupFullyPaid(group) && (
                <button className="btn-sm btn-add-activity" onClick={() => openAddToGroup(group)}>
                  + Добавить активность
                </button>
              )}
              {isGroupFullyPaid(group) ? (
                <div className="group-paid-badge">✅ Заказ оплачен</div>
              ) : (
                <div className="group-footer-actions">
                  <button
                    className="btn-success btn-mark-paid"
                    onClick={() => handleMarkGroupPaid(group)}
                    disabled={markingPaid || (group.totalAmount + (trailingPrices[group.key] || 0)) <= 0}
                  >
                    {markingPaid ? 'Сохранение...' : '✓ Заказ оплачен'}
                  </button>
                  <button
                    className="btn-primary btn-pay"
                    onClick={() => handlePayment(group)}
                    disabled={creatingPayment || !bankBotUsername.trim() || (group.totalAmount + (trailingPrices[group.key] || 0)) <= 0}
                  >
                    {creatingPayment ? 'Создание...' : 'Сформировать ссылку оплаты'}
                  </button>
                </div>
              )}
            </div>
          </div>
              ))}
            </>
          )}
        </section>

        {totalPages > 1 && (
          <div className="pagination" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={page <= 0 || loading}
              onClick={() => loadData(page - 1)}
              className="btn-small"
            >
              ← Пред.
            </button>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>Страница</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={pageInputValue}
              onChange={(e) => setPageInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = parseInt(pageInputValue, 10)
                  if (!Number.isNaN(v) && v >= 1 && v <= totalPages) loadData(v - 1)
                  else setPageInputValue(String(page + 1))
                }
              }}
              onBlur={() => {
                const v = parseInt(pageInputValue, 10)
                if (!Number.isNaN(v) && v >= 1 && v <= totalPages) loadData(v - 1)
                setPageInputValue(String(page + 1))
              }}
              style={{ width: 52, padding: '4px 6px', fontSize: '13px' }}
              disabled={loading}
            />
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              из {totalPages}
              {totalElements > 0 && ` · всего ${totalElements} бронирований`}
            </span>
            <button
              type="button"
              className="btn-small"
              disabled={page >= totalPages - 1 || loading}
              onClick={() => loadData(page + 1)}
            >
              След. →
            </button>
          </div>
        )}
        </>
      )}

      {/* Edit Modal */}
      {editBooking && (
        <Modal isOpen={true} onClose={() => setEditBooking(null)} title="Редактировать бронирование">
          <div className="edit-booking-form">
            <label>
              <span>Мероприятие:</span>
              <select
                value={editForm.activityId || ''}
                onChange={e => setEditForm({ ...editForm, activityId: e.target.value ? parseInt(e.target.value) : undefined })}
              >
                <option value="">-- Выберите --</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <div className="form-row">
              <FormInput label="Начало" type="datetime-local" value={editForm.startAt || ''}
                onChange={v => setEditForm({ ...editForm, startAt: v })} required />
              <FormInput label="Окончание" type="datetime-local" value={editForm.endAt || ''}
                onChange={v => setEditForm({ ...editForm, endAt: v })} required />
            </div>
            <div className="form-row">
              <FormInput label="Имя клиента" value={editForm.customerName || ''}
                onChange={v => setEditForm({ ...editForm, customerName: v })} />
              <FormInput label="Телефон" value={editForm.customerPhone || ''}
                onChange={v => setEditForm({ ...editForm, customerPhone: v })} />
            </div>
            <FormInput label="Заметки" value={editForm.notes || ''}
              onChange={v => setEditForm({ ...editForm, notes: v })} type="textarea" />

            {editPricing && editPricing.status === 'OK' && (
              <div className="edit-pricing-result">
                <span>Расчёт: </span>
                <strong>₽{editPricing.totalAmount.toFixed(2)}</strong>
              </div>
            )}

            <div className="form-actions">
              <button className="btn-secondary" onClick={handleEditCalc} disabled={editCalcLoading}>
                {editCalcLoading ? 'Расчёт...' : 'Пересчитать цену'}
              </button>
              <button className="btn-secondary" onClick={() => setEditBooking(null)}>Отмена</button>
              <button className="btn-primary" onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete order: с отменой броней или без */}
      {groupToDelete && (
        <Modal isOpen={true} onClose={() => setGroupToDelete(null)} title="Удалить заказ">
          <p>
            Заказ <strong>{groupToDelete.customerName}</strong> ({groupToDelete.bookings.length} брон.). Как удалить?
          </p>
          <div className="form-actions" style={{ marginTop: 16, gap: 8 }}>
            <button
              className="btn-primary"
              onClick={() => doDeleteOrder(groupToDelete, false)}
            >
              Удалить заказ (брони остаются)
            </button>
            <button
              className="btn-sm btn-cancel"
              onClick={() => doDeleteOrder(groupToDelete, true)}
            >
              Удалить и отменить все брони
            </button>
            <button className="btn-secondary" onClick={() => setGroupToDelete(null)}>
              Отмена
            </button>
          </div>
        </Modal>
      )}

      {/* Add activity to group modal */}
      {addToGroup && (
        <Modal isOpen={true} onClose={() => setAddToGroup(null)}
          title={`Добавить активность — ${addToGroup.customerName}`}>
          <div className="edit-booking-form">
            <label>
              <span>Мероприятие *</span>
              <select value={addLine.activityId || ''}
                onChange={e => setAddLine({ ...addLine, activityId: e.target.value ? parseInt(e.target.value) : undefined, pricingResult: null })}>
                <option value="">-- Выберите --</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <div className="form-row">
              <FormInput label="Начало" type="datetime-local" value={addLine.startAt}
                onChange={v => setAddLine({ ...addLine, startAt: v, pricingResult: null })} required />
              <FormInput label="Окончание" type="datetime-local" value={addLine.endAt}
                onChange={v => setAddLine({ ...addLine, endAt: v, pricingResult: null })} required />
            </div>
            <div className="form-row">
              <div className="field field-small-inline">
                <label>Скидка %</label>
                <input type="number" min="0" max="100" step="0.01" value={addLine.discountPercent}
                  onChange={e => setAddLine({ ...addLine, discountPercent: e.target.value, pricingResult: null })}
                  placeholder="0" />
              </div>
              <div className="field">
                <label>Обоснование</label>
                <input type="text" value={addLine.discountReason}
                  onChange={e => setAddLine({ ...addLine, discountReason: e.target.value })}
                  placeholder="Причина скидки" />
              </div>
            </div>

            {addLine.pricingResult?.status === 'OK' && (
              <div className="edit-pricing-result">
                <span>Расчёт: </span><strong>₽{addLine.pricingResult.totalAmount.toFixed(2)}</strong>
              </div>
            )}
            {addLine.pricingResult?.status === 'STOP' && (
              <div className="edit-pricing-result" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626' }}>
                ⚠️ {addLine.pricingResult.stopReason || 'Расчёт невозможен'}
              </div>
            )}

            <div className="form-actions">
              <button className="btn-secondary" onClick={handleAddCalc}
                disabled={addLine.calculating || !addLine.activityId}>
                {addLine.calculating ? 'Расчёт...' : 'Рассчитать'}
              </button>
              <button className="btn-secondary" onClick={() => setAddToGroup(null)}>Отмена</button>
              <button className="btn-primary" onClick={handleAddSave}
                disabled={addSaving || addLine.calculating || !addLine.activityId}>
                {addSaving ? 'Сохранение...' : addLine.calculating ? 'Расчёт...' : 'Добавить'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Payment QR Modal */}
      {showPaymentModal && paymentRequestId && (
        <PaymentQrModal
          isOpen={showPaymentModal}
          onClose={() => { setShowPaymentModal(false); setPaymentRequestId(null) }}
          paymentRequestId={paymentRequestId}
          orderId={paymentOrderId}
          customTitle={paymentTitle}
        />
      )}

      {/* Telegram Link Modal */}
      <TelegramLinkModal
        isOpen={showTelegramLink}
        onClose={() => setShowTelegramLink(false)}
        onSuccess={() => { setTelegramLinked(true); checkTelegramStatus() }}
      />
    </div>
  )
}
