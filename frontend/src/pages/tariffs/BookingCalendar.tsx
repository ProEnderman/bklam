import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { bookingService, activityService, availabilityService } from '../../api/services'
import type { Booking, Activity, FullVenueBlockInfo, User } from '../../api/types'
import Modal from '../../components/Modal'
import './BookingCalendar.css'

export default function BookingCalendar() {
  const { user } = useOutletContext<{ user?: User }>()
  const branchId = user?.restaurantId

  const [activities, setActivities] = useState<Activity[]>([])
  const [selectedActivityId, setSelectedActivityId] = useState<number | undefined>(undefined)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [fullVenueBlocks, setFullVenueBlocks] = useState<FullVenueBlockInfo[]>([])
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week')
  const [loading, setLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showGanttModal, setShowGanttModal] = useState(false)

  useEffect(() => {
    loadActivities()
  }, [])

  useEffect(() => {
    if (selectedActivityId && branchId) {
      loadBookings()
      loadAvailability()
    } else if (!branchId) {
      setFullVenueBlocks([])
    }
  }, [selectedActivityId, currentDate, viewMode, branchId])

  const loadActivities = async () => {
    try {
      const data = await activityService.getActivities(undefined, 'ACTIVE')
      setActivities(data)
      if (data.length > 0 && !selectedActivityId) {
        setSelectedActivityId(data[0].id)
      }
    } catch (error) {
      console.error('Failed to load activities:', error)
    }
  }

  const loadBookings = async () => {
    if (!selectedActivityId) return
    setLoading(true)
    try {
      // Определяем диапазон дат на основе отображаемых дней
      const daysInView = getDaysInView()
      if (daysInView.length === 0) {
        setBookings([])
        setLoading(false)
        return
      }
      
      // Находим минимальную и максимальную даты из отображаемых дней
      const dates = daysInView.map(d => new Date(d).setHours(0, 0, 0, 0))
      const minDate = new Date(Math.min(...dates))
      const maxDate = new Date(Math.max(...dates))
      
      // Загружаем данные с небольшим запасом (1 день назад и 1 день вперед) для бронирований, которые могут перекрывать границы
      const from = new Date(minDate)
      from.setDate(from.getDate() - 1)
      from.setHours(0, 0, 0, 0)
      
      const to = new Date(maxDate)
      to.setDate(to.getDate() + 1)
      to.setHours(23, 59, 59, 999)

      const res = await bookingService.getBookings({
        activityId: selectedActivityId,
        from: from.toISOString(),
        to: to.toISOString(),
      })
      const data = Array.isArray(res) ? res : (res && 'content' in res ? (res as { content: Booking[] }).content : [])
      setBookings(data)
    } catch (error) {
      console.error('Failed to load bookings:', error)
      setBookings([])
    } finally {
      setLoading(false)
    }
  }

  const loadAvailability = async () => {
    if (!selectedActivityId || !branchId) {
      setFullVenueBlocks([])
      return
    }
    try {
      // Определяем диапазон дат на основе отображаемых дней
      const daysInView = getDaysInView()
      if (daysInView.length === 0) {
        setFullVenueBlocks([])
        return
      }
      
      // Находим минимальную и максимальную даты из отображаемых дней
      const dates = daysInView.map(d => new Date(d).setHours(0, 0, 0, 0))
      const minDate = new Date(Math.min(...dates))
      const maxDate = new Date(Math.max(...dates))
      
      // Загружаем данные с небольшим запасом (1 день назад и 1 день вперед)
      const from = new Date(minDate)
      from.setDate(from.getDate() - 1)
      from.setHours(0, 0, 0, 0)
      
      const to = new Date(maxDate)
      to.setDate(to.getDate() + 1)
      to.setHours(23, 59, 59, 999)

      const data = await availabilityService.getAvailability(
        branchId,
        selectedActivityId,
        from.toISOString(),
        to.toISOString()
      )
      setFullVenueBlocks(Array.isArray(data.fullVenueBlocks) ? data.fullVenueBlocks : [])
    } catch (error) {
      console.error('Failed to load availability:', error)
      setFullVenueBlocks([])
    }
  }

  const getDaysInView = () => {
    const days: Date[] = []
    const start = new Date(currentDate)
    start.setHours(0, 0, 0, 0)
    
    if (viewMode === 'day') {
      days.push(new Date(start))
    } else if (viewMode === 'week') {
      // Показываем 7 дней начиная с currentDate
      for (let i = 0; i < 7; i++) {
        const date = new Date(start)
        date.setDate(start.getDate() + i)
        days.push(date)
      }
    } else {
      // Месяц - показываем 30 дней начиная с currentDate
      for (let i = 0; i < 30; i++) {
        const date = new Date(start)
        date.setDate(start.getDate() + i)
        days.push(date)
      }
    }
    
    return days
  }

  const blockOverlapsDate = (block: FullVenueBlockInfo, date: Date) => {
    const bookingStart = new Date(block.startAt)
    const bookingEnd = new Date(block.endAt)
    const dateStart = new Date(date)
    dateStart.setHours(0, 0, 0, 0)
    const dateEnd = new Date(date)
    dateEnd.setHours(23, 59, 59, 999)
    return bookingStart <= dateEnd && bookingEnd >= dateStart
  }

  const getFullVenueBlocksForDate = (date: Date) =>
    fullVenueBlocks.filter((b) => blockOverlapsDate(b, date))

  const getBookingsForDate = (date: Date) => {
    return bookings.filter((booking) => {
      // Исключаем отмененные бронирования
      if (booking.status === 'CANCELLED') return false
      
      // Проверяем пересечение бронирования с выбранной датой
      const bookingStart = new Date(booking.startAt)
      const bookingEnd = new Date(booking.endAt)
      const dateStart = new Date(date)
      dateStart.setHours(0, 0, 0, 0)
      const dateEnd = new Date(date)
      dateEnd.setHours(23, 59, 59, 999)
      
      // Бронирование пересекается с датой, если оно начинается до конца дня и заканчивается после начала дня
      return bookingStart <= dateEnd && bookingEnd >= dateStart
    })
  }

  const getMaxConcurrentInfo = (date: Date) => {
    const dayBookings = getBookingsForDate(date)
    if (dayBookings.length === 0) return null

    // Создаем массив событий (начало и конец бронирований)
    const events: Array<{ time: number; type: 'start' | 'end'; bookingId?: number }> = []
    
    dayBookings.forEach((booking) => {
      const start = new Date(booking.startAt).getTime()
      const end = new Date(booking.endAt).getTime()
      events.push({ time: start, type: 'start', bookingId: booking.id })
      events.push({ time: end, type: 'end', bookingId: booking.id })
    })

    // Сортируем события по времени
    events.sort((a, b) => a.time - b.time)

    // Находим максимальное количество одновременных бронирований и время
    let maxConcurrent = 0
    let currentCount = 0
    let maxTimeStart: number | null = null
    let maxTimeEnd: number | null = null
    let inMaxPeriod = false

    events.forEach((event) => {
      if (event.type === 'start') {
        currentCount++
        if (currentCount > maxConcurrent) {
          maxConcurrent = currentCount
          maxTimeStart = event.time
          maxTimeEnd = null
          inMaxPeriod = true
        } else if (currentCount === maxConcurrent && inMaxPeriod) {
          // Продолжаем период максимальной загрузки
          if (maxTimeEnd === null) {
            maxTimeEnd = event.time
          }
        }
      } else {
        if (currentCount === maxConcurrent && inMaxPeriod && maxTimeEnd === null) {
          maxTimeEnd = event.time
        }
        currentCount--
        if (currentCount < maxConcurrent) {
          inMaxPeriod = false
        }
      }
    })

    if (maxConcurrent === 0 || maxTimeStart === null) return null

    const startTime = new Date(maxTimeStart)
    const endTime = maxTimeEnd ? new Date(maxTimeEnd) : startTime

    return {
      count: maxConcurrent,
      startTime: formatTime(startTime),
      endTime: formatTime(endTime),
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }

  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    setShowGanttModal(true)
  }

  const getBookingsForGantt = (date: Date) => {
    return bookings.filter((booking) => {
      // Исключаем отмененные бронирования
      if (booking.status === 'CANCELLED') return false
      
      const bookingStart = new Date(booking.startAt)
      const bookingEnd = new Date(booking.endAt)
      const dateStart = new Date(date)
      dateStart.setHours(0, 0, 0, 0)
      const dateEnd = new Date(date)
      dateEnd.setHours(23, 59, 59, 999)
      
      // Проверяем, пересекается ли бронирование с выбранной датой
      return bookingStart <= dateEnd && bookingEnd >= dateStart
    }).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
  }

  const getTimePosition = (time: Date, _dayStart: Date) => {
    const hours = time.getHours()
    const minutes = time.getMinutes()
    const totalMinutes = hours * 60 + minutes
    return (totalMinutes / (24 * 60)) * 100 // Процент от дня
  }

  const getTimeWidth = (start: Date, end: Date) => {
    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const endMinutes = end.getHours() * 60 + end.getMinutes()
    const duration = endMinutes - startMinutes
    return (duration / (24 * 60)) * 100 // Процент от дня
  }

  // Убрали функцию getOverlappingLevel - теперь каждая бронь на отдельной строке

  return (
    <div className="booking-calendar-page">
      <div className="page-header">
        <h1>Календарь занятости</h1>
        <div className="calendar-controls">
          <label>
            Мероприятие:
            <select
              value={selectedActivityId || ''}
              onChange={(e) => setSelectedActivityId(e.target.value ? parseInt(e.target.value) : undefined)}
            >
              <option value="">-- Выберите мероприятие --</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
          </label>
          <div className="view-mode">
            <button
              className={viewMode === 'day' ? 'active' : ''}
              onClick={() => setViewMode('day')}
            >
              День
            </button>
            <button
              className={viewMode === 'week' ? 'active' : ''}
              onClick={() => setViewMode('week')}
            >
              Неделя
            </button>
            <button
              className={viewMode === 'month' ? 'active' : ''}
              onClick={() => {
                setViewMode('month')
              }}
            >
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
        <p>Loading...</p>
      ) : !branchId ? (
        <p className="calendar-branch-warning">Не удалось определить филиал. Войдите в аккаунт ресторана.</p>
      ) : selectedActivityId ? (
        <div className={`calendar-view ${viewMode === 'day' ? 'day-view' : ''}`}>
          {getDaysInView().map((date, idx) => {
            const fvForDay = getFullVenueBlocksForDate(date)
            const maxConcurrentInfo = getMaxConcurrentInfo(date)
            const activity = activities.find((a) => a.id === selectedActivityId)
            const maxConcurrent = activity?.concurrentLimit || 1

            const isAtLimit = maxConcurrentInfo !== null && maxConcurrentInfo.count >= maxConcurrent
            const hasFv = fvForDay.length > 0

            return (
              <div 
                key={idx} 
                className="calendar-day clickable"
                onClick={() => handleDateClick(date)}
              >
                <div className="day-header">
                  <h3>{date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}</h3>
                </div>
                <div className="day-bookings">
                  {fvForDay.map((block) => (
                    <p key={`fv-${block.bookingId}`} className="full-venue-day-notice">
                      {block.message}
                    </p>
                  ))}
                  {maxConcurrentInfo === null && !hasFv ? (
                    <p className="no-bookings">Нет бронирований</p>
                  ) : maxConcurrentInfo === null && hasFv ? null : isAtLimit ? (
                    <p className="max-concurrent-info">
                      Максимальная бронь в {maxConcurrentInfo!.startTime === maxConcurrentInfo!.endTime 
                        ? maxConcurrentInfo!.startTime 
                        : `${maxConcurrentInfo!.startTime} - ${maxConcurrentInfo!.endTime}`}
                    </p>
                  ) : (
                    <p className="no-bookings">Есть свободные места</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p>Выберите мероприятие для просмотра календаря</p>
      )}

      {/* Модальное окно с диаграммой Ганта */}
      <Modal 
        isOpen={showGanttModal} 
        onClose={() => setShowGanttModal(false)}
        title={selectedDate ? `Диаграмма Ганта - ${selectedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Диаграмма Ганта'}
        size="xlarge"
      >
        {selectedDate && (
          <div className="gantt-chart">
            {(() => {
              const ganttBookings = getBookingsForGantt(selectedDate)
              const fvForGantt = getFullVenueBlocksForDate(selectedDate).filter(
                (b) => b.activityId == null || b.activityId !== selectedActivityId
              )
              const dayStart = new Date(selectedDate)
              dayStart.setHours(0, 0, 0, 0)
              const dayEnd = new Date(selectedDate)
              dayEnd.setHours(23, 59, 59, 999)

              const hours = Array.from({ length: 24 }, (_, i) => i)
              const rowHeight = 50
              const totalRows = fvForGantt.length + ganttBookings.length

              return (
                <>
                  <div className="gantt-timeline">
                    {hours.map((hour) => (
                      <div key={hour} className="gantt-hour-marker">
                        <span className="gantt-hour-label">{hour.toString().padStart(2, '0')}:00</span>
                      </div>
                    ))}
                  </div>
                  <div
                    className="gantt-bars-container"
                    style={{ minHeight: Math.max(300, totalRows * rowHeight + 40) }}
                  >
                    {fvForGantt.map((block, index) => {
                      const bookingStart = new Date(block.startAt)
                      const bookingEnd = new Date(block.endAt)
                      const startTime = bookingStart < dayStart ? dayStart : bookingStart
                      const endTime = bookingEnd > dayEnd ? dayEnd : bookingEnd
                      const left = getTimePosition(startTime, dayStart)
                      const width = getTimeWidth(startTime, endTime)
                      const top = index * rowHeight
                      return (
                        <div
                          key={`fv-gantt-${block.bookingId}`}
                          className="gantt-bar gantt-bar-full-venue"
                          style={{
                            left: `${left}%`,
                            width: `${Math.max(width, 0.5)}%`,
                            top: `${top}px`,
                          }}
                          title={block.message}
                        >
                          <div className="gantt-bar-content">
                            <div className="gantt-bar-time">
                              {bookingStart.toDateString() === bookingEnd.toDateString()
                                ? `${formatTime(bookingStart)} - ${formatTime(bookingEnd)}`
                                : `${bookingStart.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${formatTime(bookingStart)} — ${bookingEnd.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${formatTime(bookingEnd)}`}
                            </div>
                            <div className="gantt-bar-customer">{block.activityName || 'Полная бронь'}</div>
                          </div>
                        </div>
                      )
                    })}
                    {ganttBookings.map((booking, index) => {
                      const bookingStart = new Date(booking.startAt)
                      const bookingEnd = new Date(booking.endAt)

                      const startTime = bookingStart < dayStart ? dayStart : bookingStart
                      const endTime = bookingEnd > dayEnd ? dayEnd : bookingEnd

                      const left = getTimePosition(startTime, dayStart)
                      const width = getTimeWidth(startTime, endTime)
                      const top = (fvForGantt.length + index) * rowHeight

                      return (
                        <div
                          key={booking.id}
                          className={`gantt-bar ${booking.status.toLowerCase()}`}
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            top: `${top}px`,
                          }}
                          title={`${bookingStart.toLocaleDateString('ru-RU')} ${formatTime(bookingStart)} - ${bookingEnd.toLocaleDateString('ru-RU')} ${formatTime(bookingEnd)}: ${booking.customerName || booking.customerPhone || 'Без имени'}`}
                        >
                          <div className="gantt-bar-content">
                            <div className="gantt-bar-time">
                              {bookingStart.toDateString() === bookingEnd.toDateString()
                                ? `${formatTime(bookingStart)} - ${formatTime(bookingEnd)}`
                                : `${bookingStart.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${formatTime(bookingStart)} - ${bookingEnd.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${formatTime(bookingEnd)}`}
                            </div>
                            <div className="gantt-bar-customer">
                              {booking.customerName || booking.customerPhone || 'Без имени'}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {ganttBookings.length === 0 && fvForGantt.length === 0 && (
                    <p className="no-bookings-gantt">Нет бронирований на этот день</p>
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

