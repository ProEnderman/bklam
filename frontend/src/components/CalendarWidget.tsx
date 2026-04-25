import { useState } from 'react'
import type { WeekendRule } from '../api/types'
import './CalendarWidget.css'

interface CalendarWidgetProps {
  specialDates: string[] // YYYY-MM-DD
  weekendRule: WeekendRule
  weekendDays?: number[] // Массив номеров дней недели (1=Пн, 7=Вс) для CUSTOM режима
  onDateToggle: (date: string) => void
}

export default function CalendarWidget({ specialDates, weekendRule, weekendDays = [], onDateToggle }: CalendarWidgetProps) {
  const [currentDate, setCurrentDate] = useState(new Date())

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // Первый день месяца
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDayOfWeek = firstDay.getDay() // 0 = Sunday, 1 = Monday, etc.

  // Корректируем для отображения с понедельника
  const adjustedStartDay = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1

  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  const isWeekend = (day: number) => {
    const date = new Date(year, month, day)
    const dayOfWeek = date.getDay() // 0 = Sunday, 6 = Saturday
    // Преобразуем в формат 1=Пн, 7=Вс
    const dayNumber = dayOfWeek === 0 ? 7 : dayOfWeek
    
    if (weekendRule === 'SAT_SUN') {
      // Сб/Вс - выходные
      return dayOfWeek === 0 || dayOfWeek === 6
    } else if (weekendRule === 'MON_FRI') {
      // Пн-Пт - выходные (будни), Сб/Вс - рабочие дни
      return dayOfWeek >= 1 && dayOfWeek <= 5
    } else if (weekendRule === 'CUSTOM') {
      // Для CUSTOM используем переданный массив weekendDays
      return weekendDays.includes(dayNumber)
    }
    // По умолчанию Сб/Вс выходные
    return dayOfWeek === 0 || dayOfWeek === 6
  }

  const isSpecialDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return specialDates.includes(dateStr)
  }

  const handleDateClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    onDateToggle(dateStr)
  }

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const monthNames = [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ]

  return (
    <div className="calendar-widget">
      <div className="calendar-header">
        <button onClick={goToPreviousMonth} className="nav-btn">
          ←
        </button>
        <h3>
          {monthNames[month]} {year}
        </h3>
        <button onClick={goToNextMonth} className="nav-btn">
          →
        </button>
        <button onClick={goToToday} className="today-btn">
          Сегодня
        </button>
      </div>

      <div className="calendar-grid">
        {/* Заголовки дней недели */}
        {weekDays.map((day) => (
          <div key={day} className="calendar-day-header">
            {day}
          </div>
        ))}

        {/* Пустые ячейки до первого дня месяца */}
        {Array.from({ length: adjustedStartDay }).map((_, idx) => (
          <div key={`empty-${idx}`} className="calendar-day empty"></div>
        ))}

        {/* Дни месяца */}
        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const day = idx + 1
          const isWeekendDay = isWeekend(day)
          const isSpecial = isSpecialDate(day)
          const isToday =
            day === new Date().getDate() &&
            month === new Date().getMonth() &&
            year === new Date().getFullYear()

          return (
            <div
              key={day}
              className={`calendar-day ${isWeekendDay ? 'weekend' : 'weekday'} ${isSpecial ? 'special' : ''} ${isToday ? 'today' : ''}`}
              onClick={() => handleDateClick(day)}
              title={isSpecial ? 'Особая дата (нажмите, чтобы убрать)' : 'Нажмите, чтобы добавить как особую дату'}
            >
              {day}
              {isSpecial && <span className="special-indicator">★</span>}
            </div>
          )
        })}
      </div>

      <div className="calendar-legend">
        <div className="legend-item">
          <div className="legend-color weekday"></div>
          <span>Будни</span>
        </div>
        <div className="legend-item">
          <div className="legend-color weekend"></div>
          <span>Выходные</span>
        </div>
        <div className="legend-item">
          <div className="legend-color special"></div>
          <span>Особые даты</span>
        </div>
      </div>
    </div>
  )
}


