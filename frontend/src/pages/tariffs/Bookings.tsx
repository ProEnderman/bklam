import { useEffect, useState, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { bookingService, activityService, pricingService } from '../../api/services'
import type { Booking, Activity, PricingResult } from '../../api/types'
import {
  getImportedClients, addImportedClients, removeImportedClient,
  parseClientExcel, clearImportedClients,
  getHiddenClients, hideClient, clearHiddenClients,
  getDeletedClients, deleteClient,
} from '../../utils/clientStore'
import type { StoredClient } from '../../utils/clientStore'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import FormInput from '../../components/FormInput'
import './Bookings.css'

interface KnownClient {
  name: string
  phone: string
  /** сколько раз встречалось бронирование */
  bookingCount: number
}

/** Форматирует Date в строку "YYYY-MM-DDTHH:mm" в ЛОКАЛЬНОМ времени пользователя */
function toLocalDatetimeInput(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

export default function Bookings() {
  const [searchParams] = useSearchParams()
  const activityIdParam = searchParams.get('activityId')

  const [bookings, setBookings] = useState<Booking[]>([])
  const [allBookings, setAllBookings] = useState<Booking[]>([]) // для списка клиентов в выборе
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [pageSize] = useState(100)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [showPricingModal, setShowPricingModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [pricingResult, setPricingResult] = useState<PricingResult | null>(null)
  const [formData, setFormData] = useState<Partial<Booking>>({
    startAt: toLocalDatetimeInput(new Date()),
    endAt: toLocalDatetimeInput(new Date(Date.now() + 60 * 60 * 1000)),
    status: 'DRAFT',
  })
  const [selectedActivityId, setSelectedActivityId] = useState<number | undefined>(
    activityIdParam ? parseInt(activityIdParam) : undefined
  )

  // --- Client picker ---
  const [clientSearch, setClientSearch] = useState('')
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const clientDropdownRef = useRef<HTMLDivElement>(null)
  const [importedClients, setImportedClients] = useState<StoredClient[]>(getImportedClients())
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(getHiddenClients())
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(getDeletedClients())
  const excelFileRef = useRef<HTMLInputElement>(null)

  /** Уникальные клиенты из бронирований + импортированные. В счётчике «X бр.» — только активные (не отменённые). */
  const knownClients = useMemo<KnownClient[]>(() => {
    const map = new Map<string, KnownClient>()
    for (const b of allBookings) {
      if (!b.customerName && !b.customerPhone) continue
      const key = `${(b.customerName || '').toLowerCase()}|${(b.customerPhone || '').toLowerCase()}`
      const isActive = b.status !== 'CANCELLED'
      const existing = map.get(key)
      if (existing) {
        if (isActive) existing.bookingCount++
      } else {
        map.set(key, {
          name: b.customerName || '',
          phone: b.customerPhone || '',
          bookingCount: isActive ? 1 : 0,
        })
      }
    }
    // Добавляем импортированных клиентов (у них bookingCount = 0)
    for (const ic of importedClients) {
      if (!ic.name && !ic.phone) continue
      const key = `${ic.name.toLowerCase()}|${ic.phone.toLowerCase()}`
      if (!map.has(key)) {
        map.set(key, { name: ic.name, phone: ic.phone, bookingCount: 0 })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [allBookings, importedClients])

  /** Фильтрованные клиенты по поисковой строке (без скрытых и удалённых) */
  const filteredClients = useMemo(() => {
    const visible = knownClients.filter(c => {
      const key = `${(c.name || '').trim().toLowerCase()}|${(c.phone || '').trim().toLowerCase()}`
      if (deletedKeys.has(key)) return false
      return !hiddenKeys.has(key)
    })
    if (!clientSearch.trim()) return visible
    const q = clientSearch.toLowerCase()
    return visible.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
    )
  }, [knownClients, clientSearch, hiddenKeys, deletedKeys])

  /** Обработчик выбора клиента из дропдауна */
  const handleSelectClient = (client: KnownClient) => {
    setFormData((prev) => ({ ...prev, customerName: client.name, customerPhone: client.phone }))
    setClientSearch('')
    setShowClientDropdown(false)
  }

  // Закрытие дропдауна при клике вне
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    if (excelFileRef.current) excelFileRef.current.value = ''
  }

  const handleClearImported = () => {
    if (!confirm(`Удалить всех импортированных клиентов (${importedClients.length})?`)) return
    clearImportedClients()
    setImportedClients([])
  }

  /** Скрыть клиента (без удаления бронирований) */
  const handleHideClient = (c: KnownClient, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (c.bookingCount === 0) {
      const updated = removeImportedClient(c.name, c.phone)
      setImportedClients(updated)
    } else {
      const updated = hideClient(c.name, c.phone)
      setHiddenKeys(new Set(updated))
    }
  }

  /** Полностью удалить клиента — отменить все его бронирования */
  const handleFullDeleteClient = async (c: KnownClient, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (c.bookingCount === 0) {
      const updated = removeImportedClient(c.name, c.phone)
      setImportedClients(updated)
      return
    }
    const clientBookings = allBookings.filter(b =>
      (b.customerName || '').toLowerCase() === c.name.toLowerCase() &&
      (b.customerPhone || '').toLowerCase() === c.phone.toLowerCase() &&
      b.status !== 'CANCELLED' && b.status !== 'PAID'
    )
    const msg = clientBookings.length > 0
      ? `Удалить клиента «${c.name}» и отменить ${clientBookings.length} активных бронирований?\n⚠️ Это действие необратимо!`
      : `Удалить клиента «${c.name}»?\n⚠️ Это действие необратимо!`
    if (!confirm(msg)) return
    try {
      for (const b of clientBookings) {
        await bookingService.cancelBooking(b.id)
      }
      // Помечаем как удалённого навсегда
      const updated = deleteClient(c.name, c.phone)
      setDeletedKeys(new Set(updated))
      await loadBookings(page)
      await loadAllForDropdown()
    } catch (err: any) {
      alert(err.response?.data?.message || 'Ошибка при удалении клиента')
    }
  }

  const handleRestoreHidden = () => {
    clearHiddenClients()
    setHiddenKeys(new Set())
  }

  useEffect(() => {
    loadActivities()
    setPage(0)
    loadBookings(0)
    loadAllForDropdown()
  }, [selectedActivityId])

  const loadActivities = async () => {
    try {
      const data = await activityService.getActivities(undefined, 'ACTIVE')
      setActivities(data)
    } catch (error) {
      console.error('Failed to load activities:', error)
    }
  }

  const filterBookings = (data: Booking[]) =>
    data.filter((booking: Booking) => {
      if (booking.status === 'CANCELLED' || booking.status === 'PAID') return false
      const notes = (booking.notes || '').toLowerCase()
      if (notes.includes('автозаполнение пробела') || notes.includes('пребывание до оплаты')) return false
      return true
    })

  const loadBookings = async (pageToLoad: number = 0) => {
    setLoading(true)
    try {
      const filters: any = { page: pageToLoad, size: pageSize, status: ['DRAFT', 'CONFIRMED'] }
      if (selectedActivityId) filters.activityId = selectedActivityId
      const data = await bookingService.getBookings(filters)
      // Бэкенд всегда возвращает страницу: { content, totalElements, totalPages, number, size }
      const isPaginated = data && typeof data === 'object' && 'content' in data
      const list: Booking[] = isPaginated
        ? (Array.isArray((data as any).content) ? (data as any).content : [])
        : Array.isArray(data) ? data : []
      const p = isPaginated ? (data as { totalElements: number; totalPages: number; number: number }) : null
      setBookings(filterBookings(list))
      setTotalElements(p != null ? p.totalElements : list.length)
      setTotalPages(p != null ? p.totalPages : Math.max(1, Math.ceil(list.length / pageSize)))
      setPage(p != null ? p.number : 0)
    } catch (error) {
      console.error('Failed to load bookings:', error)
      setBookings([])
      setTotalPages(0)
      setTotalElements(0)
    } finally {
      setLoading(false)
    }
  }

  const loadAllForDropdown = async () => {
    try {
      const filters: any = { size: 200 }
      if (selectedActivityId) filters.activityId = selectedActivityId
      const data = await bookingService.getBookings(filters)
      const list = data && typeof data === 'object' && 'content' in data
        ? (Array.isArray((data as any).content) ? (data as any).content : [])
        : Array.isArray(data) ? data : []
      setAllBookings(list)
    } catch {
      setAllBookings([])
    }
  }

  const handleCreate = () => {
    setEditingBooking(null)
    setFormData({
      startAt: toLocalDatetimeInput(new Date()),
      endAt: toLocalDatetimeInput(new Date(Date.now() + 60 * 60 * 1000)),
      status: 'DRAFT',
      activityId: selectedActivityId,
    })
    setShowModal(true)
  }

  const handleEdit = (booking: Booking) => {
    setEditingBooking(booking)
    setFormData({
      ...booking,
      startAt: toLocalDatetimeInput(new Date(booking.startAt)),
      endAt: toLocalDatetimeInput(new Date(booking.endAt)),
    })
    setShowModal(true)
  }

  const handlePreviewPricing = async () => {
    if (!formData.activityId || !formData.startAt || !formData.endAt) {
      alert('Выберите мероприятие, время начала и окончания')
      return
    }

    try {
      // Преобразуем локальное время в формат ISO без конвертации в UTC
      // formData.startAt и formData.endAt уже в формате "YYYY-MM-DDTHH:mm"
      // Создаем Date объект и форматируем его в локальном времени
      const startDate = new Date(formData.startAt)
      const endDate = new Date(formData.endAt)
      
      // Форматируем в формате "YYYY-MM-DDTHH:mm:ss" в локальном времени
      const formatLocalDateTime = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day}T${hours}:${minutes}:00`
      }
      
      const request = {
        serviceId: formData.activityId,
        serviceStart: formatLocalDateTime(startDate),
        serviceEnd: formatLocalDateTime(endDate),
      }
      const result = await pricingService.preview(request)
      setPricingResult(result)
      setShowPricingModal(true)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось рассчитать цену')
    }
  }

  const handleSave = async () => {
    if (saving) return
    if (!formData.activityId) {
      alert('Выберите мероприятие')
      return
    }
    if (!formData.startAt || !formData.endAt) {
      alert('Укажите время начала и окончания')
      return
    }
    if (new Date(formData.endAt).getTime() <= new Date(formData.startAt).getTime()) {
      alert('Время окончания должно быть позже времени начала')
      return
    }
    setSaving(true)
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
      
      const bookingData: any = {
        activityId: formData.activityId,
        startAt: formatLocalDateTime(formData.startAt!),
        endAt: formatLocalDateTime(formData.endAt!),
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        notes: formData.notes,
        status: formData.status || 'DRAFT',
      }
      if (formData.activityId) {
        bookingData.activity = { id: formData.activityId }
      }
      // branchId будет установлен автоматически на бэкенде
      if (editingBooking) {
        await bookingService.updateBooking(editingBooking.id, bookingData)
      } else {
        await bookingService.createBooking(bookingData)
      }
      setShowModal(false)
      loadBookings(page)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось сохранить бронирование')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async (booking: Booking) => {
    if (!confirm('Отменить бронирование?')) return
    try {
      await bookingService.cancelBooking(booking.id)
      loadBookings(page)
      loadAllForDropdown()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось отменить бронирование')
    }
  }

  const columns = [
    {
      key: 'activity',
      header: 'Мероприятие',
      render: (item: Booking) => {
        const activity = activities.find((a) => a.id === item.activityId)
        return activity ? activity.name : `Мероприятие #${item.activityId}`
      },
    },
    {
      key: 'customerName',
      header: 'Клиент',
      render: (item: Booking) => item.customerName || item.customerPhone || '-',
    },
    {
      key: 'startAt',
      header: 'Начало',
      render: (item: Booking) => new Date(item.startAt).toLocaleString(),
    },
    {
      key: 'endAt',
      header: 'Окончание',
      render: (item: Booking) => new Date(item.endAt).toLocaleString(),
    },
    {
      key: 'totalAmount',
      header: 'Сумма',
      render: (item: Booking) => (item.totalAmount ? `₽${item.totalAmount.toFixed(2)}` : '-'),
    },
    {
      key: 'status',
      header: 'Статус',
      render: (item: Booking) => {
        const statuses: Record<string, string> = {
          DRAFT: 'Черновик',
          CONFIRMED: 'Подтверждено',
          CANCELLED: 'Отменено',
          COMPLETED: 'Завершено',
          PAID: 'Оплачено',
        }
        return statuses[item.status] || item.status
      },
    },
    {
      key: 'actions',
      header: 'Действия',
      render: (item: Booking) => (
        <div className="action-buttons">
          <button onClick={() => handleEdit(item)} className="btn-small btn-primary">
            Изменить
          </button>
          {item.status !== 'CANCELLED' && (
            <button onClick={() => handleCancel(item)} className="btn-small btn-danger">
              Отменить
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="bookings-page">
      <div className="page-header">
        <h1>Бронирования</h1>
        <div className="header-actions">
          <label>
            Фильтр по мероприятию:
            <select
              value={selectedActivityId || ''}
              onChange={(e) => setSelectedActivityId(e.target.value ? parseInt(e.target.value) : undefined)}
            >
              <option value="">Все мероприятия</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" onClick={handleCreate}>
            Новое бронирование
          </button>
        </div>
      </div>

      <DataTable data={bookings} columns={columns} loading={loading} emptyMessage="Бронирования не найдены" />

      {totalPages > 1 && (
        <div className="pagination" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-small"
            disabled={page <= 0 || loading}
            onClick={() => loadBookings(page - 1)}
          >
            ← Пред.
          </button>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>
            Страница {page + 1} из {totalPages}
            {totalElements > 0 && ` · всего ${totalElements} бронирований`}
          </span>
          <button
            type="button"
            className="btn-small"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => loadBookings(page + 1)}
          >
            След. →
          </button>
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingBooking ? 'Редактировать бронирование' : 'Новое бронирование'}
      >
        <div className="booking-form">
          <label>
            <span>Мероприятие:</span>
            <select
              value={formData.activityId || ''}
              onChange={(e) => setFormData({ ...formData, activityId: e.target.value ? parseInt(e.target.value) : undefined })}
              required
            >
              <option value="">-- Выберите мероприятие --</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <FormInput
              label="Начало"
              type="datetime-local"
              value={formData.startAt || ''}
              onChange={(value) => setFormData({ ...formData, startAt: value })}
              required
            />
            <FormInput
              label="Окончание"
              type="datetime-local"
              value={formData.endAt || ''}
              onChange={(value) => setFormData({ ...formData, endAt: value })}
              required
            />
          </div>
          {/* --- Быстрый выбор клиента --- */}
          <div className="client-picker-section" ref={clientDropdownRef}>
            <div className="client-picker-header">
              <label>
                <span>Быстрый выбор клиента:</span>
                <input
                  type="text"
                  className="client-search-input"
                  placeholder="Начните вводить имя или телефон…"
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value)
                    setShowClientDropdown(true)
                  }}
                  onFocus={() => setShowClientDropdown(true)}
                />
              </label>
              <div className="client-picker-actions">
                <button
                  type="button"
                  className="btn-import-excel-small"
                  onClick={() => excelFileRef.current?.click()}
                  title="Загрузить клиентов из Excel (столбец 1 — имя, столбец 2 — телефон)"
                >
                  📥 Excel
                </button>
                <input
                  ref={excelFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={handleExcelUpload}
                />
                {importedClients.length > 0 && (
                  <button
                    type="button"
                    className="btn-clear-imported-small"
                    onClick={handleClearImported}
                    title={`Удалить ${importedClients.length} импортированных клиентов`}
                  >
                    🗑 ({importedClients.length})
                  </button>
                )}
              </div>
            </div>
            {showClientDropdown && filteredClients.length > 0 && (
              <ul className="client-dropdown">
                {filteredClients.slice(0, 100).map((c, idx) => (
                  <li key={idx} className="client-dropdown-item" onMouseDown={() => handleSelectClient(c)}>
                    <span className="client-dropdown-name">{c.name || '—'}</span>
                    <span className="client-dropdown-phone">{c.phone || '—'}</span>
                    <span className="client-dropdown-count">
                      {c.bookingCount > 0 ? `${c.bookingCount} бр.` : '📥'}
                    </span>
                    <span className="client-dropdown-actions">
                      {c.bookingCount > 0 && (
                        <span
                          className="client-dropdown-hide"
                          onMouseDown={(e) => handleHideClient(c, e)}
                          title="Скрыть из списка"
                        >👁‍🗨</span>
                      )}
                      <span
                        className="client-dropdown-delete"
                        onMouseDown={(e) => handleFullDeleteClient(c, e)}
                        title="Удалить клиента"
                      >🗑</span>
                    </span>
                  </li>
                ))}
                {filteredClients.length > 100 && (
                  <li className="client-dropdown-more" style={{ fontSize: '11px', color: '#6b7280', padding: '4px 8px' }}>
                    Показано 100 из {filteredClients.length}. Уточните поиск по имени/телефону.
                  </li>
                )}
                {hiddenKeys.size > 0 && (
                  <li className="client-dropdown-restore" onMouseDown={handleRestoreHidden}>
                    Показать скрытых ({hiddenKeys.size})
                  </li>
                )}
              </ul>
            )}
            {showClientDropdown && filteredClients.length === 0 && (
              <div className="client-dropdown client-dropdown-empty">
                Клиент не найден
                {hiddenKeys.size > 0 && (
                  <>
                    .{' '}
                    <button className="btn-link" type="button" onMouseDown={handleRestoreHidden}>
                      Показать скрытых ({hiddenKeys.size})
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="form-row">
            <FormInput
              label="Имя клиента"
              value={formData.customerName || ''}
              onChange={(value) => setFormData({ ...formData, customerName: value })}
            />
            <FormInput
              label="Телефон клиента"
              value={formData.customerPhone || ''}
              onChange={(value) => setFormData({ ...formData, customerPhone: value })}
            />
          </div>
          <FormInput
            label="Заметки"
            value={formData.notes || ''}
            onChange={(value) => setFormData({ ...formData, notes: value })}
            type="textarea"
          />
          <div className="form-actions">
            <button className="btn-secondary" onClick={handlePreviewPricing}>
              Предпросмотр цены
            </button>
            <button className="btn-secondary" onClick={() => setShowModal(false)}>
              Отмена
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showPricingModal} onClose={() => setShowPricingModal(false)} title="Расчёт стоимости">
        {pricingResult ? (
          <div className="pricing-result">
            <div className={`status-badge ${pricingResult.status.toLowerCase()}`}>
              Статус: {pricingResult.status}
            </div>
            {pricingResult.status === 'STOP' && pricingResult.stopReason && (
              <div className="stop-reason">
                <strong>Причина остановки:</strong> {pricingResult.stopReason}
              </div>
            )}
            {pricingResult.status === 'OK' && (
              <>
                {/* Информация о бронировании */}
                {formData.startAt && formData.endAt && (
                  <div className="booking-info">
                    <div className="info-row">
                      <span className="info-label">Период бронирования:</span>
                      <span className="info-value">
                        {new Date(formData.startAt).toLocaleString('ru-RU')} - {new Date(formData.endAt).toLocaleString('ru-RU')}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Длительность:</span>
                      <span className="info-value">
                        {(() => {
                          const start = new Date(formData.startAt)
                          const end = new Date(formData.endAt)
                          const diffMs = end.getTime() - start.getTime()
                          const hours = Math.floor(diffMs / (1000 * 60 * 60))
                          const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
                          return `${hours} ч ${minutes} мин (${Math.round(diffMs / (1000 * 60))} минут)`
                        })()}
                      </span>
                    </div>
                  </div>
                )}

                {/* Пошаговый расчет */}
                {pricingResult.breakdowns && pricingResult.breakdowns.length > 0 && (
                  <div className="breakdown">
                    <h3>Пошаговый расчёт:</h3>
                    <div className="calculation-steps">
                      {pricingResult.breakdowns.map((item, idx) => {
                        const getLineTypeLabel = (type: string) => {
                          const labels: Record<string, string> = {
                            'BASE_RATE': 'Базовая ставка',
                            'COEFFICIENT': 'Модификатор особой даты',
                            'DISCOUNT': 'Скидка',
                            'OTHER': 'Дополнительная плата',
                          }
                          return labels[type] || type
                        }

                        // Вычисляем промежуточную сумму
                        let runningTotal = 0
                        for (let i = 0; i <= idx; i++) {
                          runningTotal += pricingResult.breakdowns[i].amount
                        }

                        return (
                          <div key={idx} className={`calculation-step ${item.lineType.toLowerCase().replace('_', '-')}`}>
                            <div className="step-header">
                              <span className="step-number">{idx + 1}.</span>
                              <span className="step-type">{getLineTypeLabel(item.lineType)}</span>
                            </div>
                            <div className="step-details">
                              <div className="step-description">{item.description}</div>
                              {item.quantity && (
                                <div className="step-quantity">
                                  Количество: {item.quantity} {item.quantity === 1 ? 'минута' : item.quantity < 5 ? 'минуты' : 'минут'}
                                  {item.quantity >= 60 && ` (${(item.quantity / 60).toFixed(2)} ${(item.quantity / 60) === 1 ? 'час' : (item.quantity / 60) < 5 ? 'часа' : 'часов'})`}
                                </div>
                              )}
                              {item.ruleReason && (
                                <div className="step-reason">
                                  <small>{item.ruleReason}</small>
                                </div>
                              )}
                            </div>
                            <div className="step-amount">
                              <span className="amount-label">Сумма:</span>
                              <span className={`amount-value ${item.amount < 0 ? 'negative' : ''}`}>
                                {item.amount >= 0 ? '+' : ''}₽{item.amount.toFixed(2)}
                              </span>
                            </div>
                            {idx < pricingResult.breakdowns.length - 1 && (
                              <div className="step-total">
                                Промежуточная сумма: ₽{runningTotal.toFixed(2)}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Итоговая сумма */}
                <div className="pricing-summary">
                  {pricingResult.baseAmount !== undefined && (
                    <div className="summary-item">
                      <span>Базовая сумма:</span>
                      <span>₽{pricingResult.baseAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {/* Вычисляем наценку за особые даты из breakdown */}
                  {(() => {
                    // Ищем все элементы с типом COEFFICIENT (модификаторы особых дат)
                    const modifierItems = pricingResult.breakdowns?.filter(item => 
                      item.lineType === 'COEFFICIENT' || 
                      item.lineType === 'Coefficient' ||
                      item.description?.toLowerCase().includes('special date modifier') ||
                      item.description?.toLowerCase().includes('модификатор особой даты')
                    ) || []
                    const modifierAmount = modifierItems.reduce((sum, item) => sum + (item.amount || 0), 0)
                    
                    // Если не нашли в breakdown, вычисляем как разницу
                    let finalModifierAmount = modifierAmount
                    if (modifierAmount === 0 && pricingResult.baseAmount !== undefined) {
                      // Вычисляем как разницу между итогом и базой минус скидка
                      const calculatedModifier = pricingResult.totalAmount - pricingResult.baseAmount - (pricingResult.discountAmount || 0)
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
                  {(pricingResult.discountAmount !== undefined && pricingResult.discountAmount > 0) ? (
                    <div className="summary-item discount">
                      <span>Скидка:</span>
                      <span>-₽{pricingResult.discountAmount.toFixed(2)}</span>
                    </div>
                  ) : null}
                  <div className="summary-item total">
                    <span>Итого к оплате:</span>
                    <span>₽{pricingResult.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <p>Loading...</p>
        )}
      </Modal>
    </div>
  )
}

