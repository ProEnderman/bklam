import { useEffect, useState } from 'react'
import { tableReservationService, hallService } from '../../api/services'
import type { TableReservation, HallTable } from '../../api/types'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import FormInput from '../../components/FormInput'
import './TableReservations.css'

/** Форматирует Date в строку "YYYY-MM-DDTHH:mm" в локальном времени */
function toLocalDatetimeInput(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

export default function TableReservations() {
  const [reservations, setReservations] = useState<TableReservation[]>([])
  const [tables, setTables] = useState<HallTable[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingReservation, setEditingReservation] = useState<TableReservation | null>(null)
  const [filterTableId, setFilterTableId] = useState<number | undefined>(undefined)

  // Form state
  const [guestsInput, setGuestsInput] = useState('2')
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([])
  const [formData, setFormData] = useState({
    startAt: toLocalDatetimeInput(new Date()),
    endAt: toLocalDatetimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)),
    guestsCount: 2,
    status: 'CONFIRMED' as string,
    customerName: '',
    customerPhone: '',
    notes: '',
  })

  useEffect(() => {
    loadTables()
    loadReservations()
  }, [filterTableId])

  const loadTables = async () => {
    try {
      const data = await hallService.getActiveTablesOnMap()
      setTables(data)
    } catch (error) {
      console.error('Failed to load tables:', error)
    }
  }

  const loadReservations = async () => {
    setLoading(true)
    try {
      const filters: any = {}
      if (filterTableId) filters.tableId = filterTableId
      const data = await tableReservationService.getReservations(filters)
      const filteredData = data.filter((r: TableReservation) => r.status !== 'CANCELLED')
      setReservations(filteredData)
    } catch (error) {
      console.error('Failed to load reservations:', error)
      setReservations([])
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setGuestsInput('')
    setSelectedTableIds([])
    setFormData({
      startAt: toLocalDatetimeInput(new Date()),
      endAt: toLocalDatetimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)),
      guestsCount: 0,
      status: 'CONFIRMED',
      customerName: '',
      customerPhone: '',
      notes: '',
    })
  }

  const handleCreate = () => {
    setEditingReservation(null)
    resetForm()
    if (filterTableId) {
      setSelectedTableIds([filterTableId])
    }
    setShowModal(true)
  }

  const handleEdit = (reservation: TableReservation) => {
    setEditingReservation(reservation)
    const formatLocalDateTimeForInput = (dateStr: string) => {
      const date = new Date(dateStr)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${year}-${month}-${day}T${hours}:${minutes}`
    }
    setGuestsInput(String(reservation.guestsCount || 1))
    setSelectedTableIds(reservation.tableIds || [])
    setFormData({
      startAt: formatLocalDateTimeForInput(reservation.startAt),
      endAt: formatLocalDateTimeForInput(reservation.endAt),
      guestsCount: reservation.guestsCount || 1,
      status: reservation.status || 'CONFIRMED',
      customerName: reservation.customerName || '',
      customerPhone: reservation.customerPhone || '',
      notes: reservation.notes || '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (selectedTableIds.length === 0) {
      alert('Выберите хотя бы один столик')
      return
    }

    try {
      const formatLocalDateTime = (dateStr: string) => {
        const date = new Date(dateStr)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hours = String(date.getHours()).padStart(2, '0')
        const minutes = String(date.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day}T${hours}:${minutes}:00`
      }

      const reservationData: any = {
        startAt: formatLocalDateTime(formData.startAt),
        endAt: formatLocalDateTime(formData.endAt),
        customerName: formData.customerName || null,
        customerPhone: formData.customerPhone || null,
        guestsCount: formData.guestsCount || 1,
        notes: formData.notes || null,
        status: formData.status || 'CONFIRMED',
        hallTables: selectedTableIds.map(id => ({ id })),
      }

      if (editingReservation) {
        await tableReservationService.updateReservation(editingReservation.id, reservationData)
      } else {
        await tableReservationService.createReservation(reservationData)
      }
      setShowModal(false)
      loadReservations()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось сохранить бронирование')
    }
  }

  const handleCancel = async (reservation: TableReservation) => {
    if (!confirm('Отменить бронирование?')) return
    try {
      await tableReservationService.cancelReservation(reservation.id)
      loadReservations()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось отменить бронирование')
    }
  }

  const handleComplete = async (reservation: TableReservation) => {
    try {
      await tableReservationService.completeReservation(reservation.id)
      loadReservations()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось завершить бронирование')
    }
  }

  const toggleTableSelection = (tableId: number) => {
    setSelectedTableIds(prev =>
      prev.includes(tableId)
        ? prev.filter(id => id !== tableId)
        : [...prev, tableId]
    )
  }

  const selectedCapacity = tables
    .filter(t => selectedTableIds.includes(t.id))
    .reduce((sum, t) => sum + t.capacity, 0)

  const columns = [
    {
      key: 'table',
      header: 'Столики',
      render: (item: TableReservation) => item.tableLabels || '—',
    },
    {
      key: 'customerName',
      header: 'Клиент',
      render: (item: TableReservation) => item.customerName || item.customerPhone || '—',
    },
    {
      key: 'guestsCount',
      header: 'Гостей',
      render: (item: TableReservation) => `${item.guestsCount} / ${item.totalCapacity || '?'}`,
    },
    {
      key: 'startAt',
      header: 'Начало',
      render: (item: TableReservation) => new Date(item.startAt).toLocaleString('ru-RU'),
    },
    {
      key: 'endAt',
      header: 'Окончание',
      render: (item: TableReservation) => new Date(item.endAt).toLocaleString('ru-RU'),
    },
    {
      key: 'status',
      header: 'Статус',
      render: (item: TableReservation) => {
        const statuses: Record<string, { label: string; className: string }> = {
          CONFIRMED: { label: 'Подтверждено', className: 'status-confirmed' },
          CANCELLED: { label: 'Отменено', className: 'status-cancelled' },
          COMPLETED: { label: 'Завершено', className: 'status-completed' },
          NO_SHOW: { label: 'Не пришёл', className: 'status-noshow' },
        }
        const s = statuses[item.status] || { label: item.status, className: '' }
        return <span className={`reservation-status ${s.className}`}>{s.label}</span>
      },
    },
    {
      key: 'actions',
      header: 'Действия',
      render: (item: TableReservation) => (
        <div className="action-buttons">
          <button onClick={() => handleEdit(item)} className="btn-small btn-primary">
            Изменить
          </button>
          {item.status === 'CONFIRMED' && (
            <>
              <button onClick={() => handleComplete(item)} className="btn-small btn-success">
                Завершить
              </button>
              <button onClick={() => handleCancel(item)} className="btn-small btn-danger">
                Отменить
              </button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="table-reservations-page">
      <div className="page-header">
        <h1>Бронирование столиков</h1>
        <div className="header-actions">
          <label>
            Фильтр по столику:
            <select
              value={filterTableId || ''}
              onChange={(e) => setFilterTableId(e.target.value ? parseInt(e.target.value) : undefined)}
            >
              <option value="">Все столики</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.label} (до {table.capacity} чел.)
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" onClick={handleCreate}>
            Новое бронирование
          </button>
        </div>
      </div>

      <DataTable data={reservations} columns={columns} loading={loading} emptyMessage="Нет бронирований" />

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingReservation ? 'Редактировать бронирование' : 'Новое бронирование столика'}
      >
        <div className="reservation-form">
          {/* Table multi-select */}
          <div className="table-selector">
            <div className="table-selector-header">
              <span className="table-selector-label">Столики:</span>
              <span className={`capacity-badge ${selectedCapacity >= formData.guestsCount ? 'ok' : 'warn'}`}>
                Вместимость: {selectedCapacity} / {formData.guestsCount} гостей
                {selectedCapacity < formData.guestsCount && ' ⚠️ Недостаточно!'}
              </span>
            </div>
            <div className="table-chips">
              {tables.map((table) => {
                const isSelected = selectedTableIds.includes(table.id)
                return (
                  <button
                    key={table.id}
                    type="button"
                    className={`table-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleTableSelection(table.id)}
                  >
                    <span className="chip-label">{table.label}</span>
                    <span className="chip-capacity">{table.capacity} чел.</span>
                    {isSelected && <span className="chip-check">✓</span>}
                  </button>
                )
              })}
            </div>
            {selectedTableIds.length === 0 && (
              <p className="table-selector-hint">Выберите один или несколько столиков</p>
            )}
          </div>

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
          <div className="form-row">
            <FormInput
              label="Количество гостей"
              type="number"
              value={guestsInput}
              onChange={(value) => {
                setGuestsInput(value)
                const num = parseInt(value)
                if (!isNaN(num) && num > 0) {
                  setFormData({ ...formData, guestsCount: num })
                }
              }}
              min={1}
              required
              onFocus={(e) => e.target.select()}
              onBlur={() => {
                if (!guestsInput || parseInt(guestsInput) < 1) {
                  setGuestsInput('1')
                  setFormData({ ...formData, guestsCount: 1 })
                }
              }}
            />
            {editingReservation && (
              <label>
                <span>Статус:</span>
                <select
                  value={formData.status || 'CONFIRMED'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="CONFIRMED">Подтверждено</option>
                  <option value="COMPLETED">Завершено</option>
                  <option value="NO_SHOW">Не пришёл</option>
                  <option value="CANCELLED">Отменено</option>
                </select>
              </label>
            )}
          </div>
          <FormInput
            label="Заметки"
            value={formData.notes || ''}
            onChange={(value) => setFormData({ ...formData, notes: value })}
            type="textarea"
          />
          <div className="form-actions">
            <button className="btn-secondary" onClick={() => setShowModal(false)}>
              Отмена
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={selectedTableIds.length === 0}>
              Сохранить
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
