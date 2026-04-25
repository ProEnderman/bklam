import { useEffect, useState } from 'react'
import { tableReservationService, hallService } from '../../api/services'
import type { TableReservation, HallTable } from '../../api/types'
import Modal from '../../components/Modal'
import './TableReservationCalendar.css'

export default function TableReservationCalendar() {
  const [tables, setTables] = useState<HallTable[]>([])
  const [selectedTableId, setSelectedTableId] = useState<number | undefined>(undefined)
  const [reservations, setReservations] = useState<TableReservation[]>([])
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week')
  const [loading, setLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showGanttModal, setShowGanttModal] = useState(false)

  useEffect(() => {
    loadTables()
  }, [])

  useEffect(() => {
    loadReservations()
  }, [selectedTableId, currentDate, viewMode])

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
      const daysInView = getDaysInView()
      if (daysInView.length === 0) {
        setReservations([])
        setLoading(false)
        return
      }

      const dates = daysInView.map(d => new Date(d).setHours(0, 0, 0, 0))
      const minDate = new Date(Math.min(...dates))
      const maxDate = new Date(Math.max(...dates))

      const from = new Date(minDate)
      from.setDate(from.getDate() - 1)
      from.setHours(0, 0, 0, 0)

      const to = new Date(maxDate)
      to.setDate(to.getDate() + 1)
      to.setHours(23, 59, 59, 999)

      const filters: any = {
        from: from.toISOString(),
        to: to.toISOString(),
      }
      if (selectedTableId) filters.tableId = selectedTableId

      const data = await tableReservationService.getReservations(filters)
      setReservations(data)
    } catch (error) {
      console.error('Failed to load reservations:', error)
      setReservations([])
    } finally {
      setLoading(false)
    }
  }

  const getDaysInView = () => {
    const days: Date[] = []
    const start = new Date(currentDate)
    start.setHours(0, 0, 0, 0)

    if (viewMode === 'day') {
      days.push(new Date(start))
    } else if (viewMode === 'week') {
      for (let i = 0; i < 7; i++) {
        const date = new Date(start)
        date.setDate(start.getDate() + i)
        days.push(date)
      }
    } else {
      for (let i = 0; i < 30; i++) {
        const date = new Date(start)
        date.setDate(start.getDate() + i)
        days.push(date)
      }
    }

    return days
  }

  const getReservationsForDate = (date: Date) => {
    return reservations.filter((r) => {
      if (r.status === 'CANCELLED') return false
      const rStart = new Date(r.startAt)
      const rEnd = new Date(r.endAt)
      const dateStart = new Date(date)
      dateStart.setHours(0, 0, 0, 0)
      const dateEnd = new Date(date)
      dateEnd.setHours(23, 59, 59, 999)
      return rStart <= dateEnd && rEnd >= dateStart
    })
  }

  const getDayStats = (date: Date) => {
    const dayReservations = getReservationsForDate(date)
    const activeTables = selectedTableId ? 1 : tables.length
    // Count unique table IDs across all reservations (multi-table aware)
    const bookedTableIds = new Set<number>()
    dayReservations.forEach(r => {
      (r.tableIds || []).forEach(id => bookedTableIds.add(id))
    })
    return {
      total: dayReservations.length,
      bookedTables: bookedTableIds.size,
      totalTables: activeTables,
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }

  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    setShowGanttModal(true)
  }

  const getReservationsForGantt = (date: Date) => {
    return reservations.filter((r) => {
      if (r.status === 'CANCELLED') return false
      const rStart = new Date(r.startAt)
      const rEnd = new Date(r.endAt)
      const dateStart = new Date(date)
      dateStart.setHours(0, 0, 0, 0)
      const dateEnd = new Date(date)
      dateEnd.setHours(23, 59, 59, 999)
      return rStart <= dateEnd && rEnd >= dateStart
    })
  }

  /** Get reservations that involve a particular table */
  const getReservationsForTable = (allReservations: TableReservation[], tableId: number) => {
    return allReservations.filter(r =>
      (r.tableIds || []).includes(tableId)
    )
  }

  const getTimePosition = (time: Date) => {
    const hours = time.getHours()
    const minutes = time.getMinutes()
    const totalMinutes = hours * 60 + minutes
    return (totalMinutes / (24 * 60)) * 100
  }

  const getTimeWidth = (start: Date, end: Date) => {
    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const endMinutes = end.getHours() * 60 + end.getMinutes()
    const duration = endMinutes - startMinutes
    return Math.max((duration / (24 * 60)) * 100, 3) // min 3%
  }

  return (
    <div className="table-reservation-calendar-page">
      <div className="page-header">
        <h1>Календарь бронирования столиков</h1>
        <div className="calendar-controls">
          <label>
            Столик:
            <select
              value={selectedTableId || ''}
              onChange={(e) => setSelectedTableId(e.target.value ? parseInt(e.target.value) : undefined)}
            >
              <option value="">Все столики</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.label} (до {table.capacity} чел.)
                </option>
              ))}
            </select>
          </label>
          <div className="view-mode">
            <button className={viewMode === 'day' ? 'active' : ''} onClick={() => setViewMode('day')}>
              День
            </button>
            <button className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')}>
              Неделя
            </button>
            <button className={viewMode === 'month' ? 'active' : ''} onClick={() => setViewMode('month')}>
              Месяц
            </button>
          </div>
          <div className="date-navigation">
            <button
              className="day-nav-button"
              onClick={(e) => {
                e.preventDefault()
                const newDate = new Date(currentDate)
                newDate.setDate(newDate.getDate() - 1)
                setCurrentDate(newDate)
              }}
              title="На день назад"
            >
              ←
            </button>
            <input
              type="date"
              value={(() => {
                const date = new Date(currentDate)
                const year = date.getFullYear()
                const month = String(date.getMonth() + 1).padStart(2, '0')
                const day = String(date.getDate()).padStart(2, '0')
                return `${year}-${month}-${day}`
              })()}
              onChange={(e) => {
                if (e.target.value) {
                  setCurrentDate(new Date(e.target.value))
                }
              }}
              title="Выберите дату"
            />
            <button
              className="day-nav-button"
              onClick={(e) => {
                e.preventDefault()
                const newDate = new Date(currentDate)
                newDate.setDate(newDate.getDate() + 1)
                setCurrentDate(newDate)
              }}
              title="На день вперед"
            >
              →
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p>Загрузка...</p>
      ) : (
        <div className={`calendar-view ${viewMode === 'day' ? 'day-view' : ''}`}>
          {getDaysInView().map((date, idx) => {
            const stats = getDayStats(date)
            const dayReservations = getReservationsForDate(date)

            return (
              <div
                key={idx}
                className="calendar-day clickable"
                onClick={() => handleDateClick(date)}
              >
                <div className="day-header">
                  <h3>{date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}</h3>
                  {stats.total > 0 && (
                    <span className={`occupancy ${stats.bookedTables >= stats.totalTables ? 'full' : ''}`}>
                      {stats.bookedTables}/{stats.totalTables}
                    </span>
                  )}
                </div>
                <div className="day-bookings">
                  {dayReservations.length === 0 ? (
                    <p className="no-bookings">Нет бронирований</p>
                  ) : (
                    <>
                      {dayReservations.slice(0, 3).map((r) => (
                        <div key={r.id} className={`booking-item ${r.status.toLowerCase()}`}>
                          <div className="booking-time">
                            {formatTime(new Date(r.startAt))} — {formatTime(new Date(r.endAt))}
                          </div>
                          <div className="booking-customer">
                            {r.tableLabels || '—'} • {r.customerName || r.customerPhone || '—'}
                            {r.guestsCount > 0 && ` (${r.guestsCount} чел.)`}
                          </div>
                        </div>
                      ))}
                      {dayReservations.length > 3 && (
                        <p className="more-bookings">+ ещё {dayReservations.length - 3}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Модальное окно с диаграммой Ганта */}
      <Modal
        isOpen={showGanttModal}
        onClose={() => setShowGanttModal(false)}
        title={selectedDate
          ? `Бронирования на ${selectedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`
          : 'Бронирования'}
        size="xlarge"
      >
        {selectedDate && (
          <div className="gantt-chart">
            {(() => {
              const ganttReservations = getReservationsForGantt(selectedDate)
              const dayStart = new Date(selectedDate)
              dayStart.setHours(0, 0, 0, 0)
              const dayEnd = new Date(selectedDate)
              dayEnd.setHours(23, 59, 59, 999)

              const hours = Array.from({ length: 24 }, (_, i) => i)

              // Display tables
              const displayTables = selectedTableId
                ? tables.filter(t => t.id === selectedTableId)
                : tables

              return (
                <>
                  <div className="gantt-timeline">
                    <div className="gantt-table-label-header">Столик</div>
                    <div className="gantt-hours-row">
                      {hours.map((hour) => (
                        <div key={hour} className="gantt-hour-marker">
                          <span className="gantt-hour-label">{hour.toString().padStart(2, '0')}:00</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="gantt-rows-container">
                    {displayTables.map((table) => {
                      // Multi-table: filter by table appearing in tableIds
                      const tableReservations = getReservationsForTable(ganttReservations, table.id)

                      return (
                        <div key={table.id} className="gantt-row">
                          <div className="gantt-table-label">
                            <strong>{table.label}</strong>
                            <small>{table.capacity} чел.</small>
                          </div>
                          <div className="gantt-row-bars">
                            {tableReservations.map((r) => {
                              const rStart = new Date(r.startAt)
                              const rEnd = new Date(r.endAt)
                              const startTime = rStart < dayStart ? dayStart : rStart
                              const endTime = rEnd > dayEnd ? dayEnd : rEnd
                              const left = getTimePosition(startTime)
                              const width = getTimeWidth(startTime, endTime)
                              const isMultiTable = (r.tableIds || []).length > 1

                              return (
                                <div
                                  key={r.id}
                                  className={`gantt-bar ${r.status.toLowerCase()} ${isMultiTable ? 'multi-table' : ''}`}
                                  style={{ left: `${left}%`, width: `${width}%` }}
                                  title={`${formatTime(rStart)} — ${formatTime(rEnd)}: ${r.customerName || r.customerPhone || 'Без имени'} (${r.guestsCount} чел.)${isMultiTable ? `\nСтолики: ${r.tableLabels}` : ''}`}
                                >
                                  <div className="gantt-bar-content">
                                    <div className="gantt-bar-time">
                                      {formatTime(rStart)} — {formatTime(rEnd)}
                                    </div>
                                    <div className="gantt-bar-customer">
                                      {r.customerName || r.customerPhone || '—'} ({r.guestsCount})
                                      {isMultiTable && <span className="multi-badge" title={`Столики: ${r.tableLabels}`}>🔗</span>}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                            {tableReservations.length === 0 && (
                              <div className="gantt-row-empty">Свободен</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {ganttReservations.length === 0 && displayTables.length === 0 && (
                    <p className="no-bookings-gantt">Нет столиков для отображения</p>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </Modal>
    </div>
  )
}
