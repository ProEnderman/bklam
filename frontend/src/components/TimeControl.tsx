import { useState, useEffect, useRef } from 'react'
import {
  isTimeOverridden,
  setOverrideTime,
  resetOverrideTime,
  getOffsetMs,
  realNow,
  OriginalDate,
} from '../utils/timeOverride'
import client from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import './TimeControl.css'

function toDatetimeLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${dd}T${h}:${min}`
}

function formatShort(d: Date): string {
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

/** Синхронизируем offset на бэкенде и запускаем проверку уведомлений */
async function syncBackend(offsetMs: number) {
  try {
    if (offsetMs === 0) {
      await client.delete('/time-override')
    } else {
      await client.post('/time-override', { offsetMs })
    }
    // После смены времени — немедленно проверить уведомления
    try {
      const res = await client.post('/booking-notifications/check-now')
      const data = res.data as { remindersCreated?: number; overdueCreated?: number }
      if ((data.remindersCreated || 0) + (data.overdueCreated || 0) > 0) {
        console.log(`⏰ Notifications created: ${data.remindersCreated} reminders, ${data.overdueCreated} overdue`)
      }
    } catch (notifErr) {
      // Не критично — уведомления создадутся по расписанию
      console.warn('Failed to trigger notification check:', notifErr)
    }
  } catch (err) {
    // Если бэкенд недоступен — не критично, фронтенд всё равно работает
    console.warn('Failed to sync time override to backend:', err)
  }
}

export default function TimeControl() {
  const { authReady } = useAuth()
  const [open, setOpen] = useState(false)
  const [overridden, setOverridden] = useState(isTimeOverridden())
  const [inputValue, setInputValue] = useState(toDatetimeLocal(new Date()))
  const [displayTime, setDisplayTime] = useState(formatShort(new Date()))
  const dropdownRef = useRef<HTMLDivElement>(null)
  const hasSyncedOnMount = useRef(false)

  // Tick the displayed time every second
  useEffect(() => {
    const tick = () => setDisplayTime(formatShort(new Date()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [overridden])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Sync existing override to backend only after auth is ready (avoids 401 on load)
  useEffect(() => {
    if (!authReady || hasSyncedOnMount.current) return
    if (isTimeOverridden()) {
      hasSyncedOnMount.current = true
      syncBackend(getOffsetMs())
    }
  }, [authReady])

  const handleApply = async () => {
    if (!inputValue) return
    const target = new OriginalDate(inputValue)
    if (isNaN(target.getTime())) return
    setOverrideTime(target)
    setOverridden(true)
    setOpen(false)
    await syncBackend(getOffsetMs())
    window.dispatchEvent(new Event('time-override-changed'))
  }

  const handleReset = async () => {
    resetOverrideTime()
    setOverridden(false)
    setInputValue(toDatetimeLocal(realNow()))
    setOpen(false)
    await syncBackend(0)
    window.dispatchEvent(new Event('time-override-changed'))
  }

  const handleQuickShift = async (hours: number) => {
    const current = new Date()
    const shifted = new OriginalDate(current.getTime() + hours * 60 * 60 * 1000)
    setOverrideTime(shifted)
    setOverridden(true)
    setInputValue(toDatetimeLocal(shifted))
    await syncBackend(getOffsetMs())
    window.dispatchEvent(new Event('time-override-changed'))
  }

  return (
    <div className="time-control-container" ref={dropdownRef}>
      <button
        className={`time-control-btn ${overridden ? 'overridden' : ''}`}
        onClick={() => {
          setInputValue(toDatetimeLocal(new Date()))
          setOpen(!open)
        }}
        title={overridden ? 'Время подменено (нажмите для настроек)' : 'Текущее время (нажмите для подмены)'}
      >
        <span className="tc-icon">{overridden ? '⏱️' : '🕐'}</span>
        <span className="tc-time">{displayTime}</span>
        {overridden && <span className="tc-badge">ТЕСТ</span>}
      </button>

      {open && (
        <div className="time-control-dropdown">
          <div className="tc-header">
            <span>⏰ Управление временем</span>
            {overridden && <span className="tc-warn">Время подменено!</span>}
          </div>

          <div className="tc-body">
            <div className="tc-real-time">
              <span className="tc-label">Реальное время:</span>
              <span className="tc-value">{formatShort(realNow())}</span>
            </div>

            <div className="tc-input-group">
              <label>Установить время:</label>
              <input
                type="datetime-local"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                step="60"
              />
              <button className="tc-btn tc-btn-apply" onClick={handleApply}>
                Применить
              </button>
            </div>

            <div className="tc-quick-shifts">
              <span className="tc-label">Быстро сдвинуть:</span>
              <div className="tc-shift-buttons">
                <button onClick={() => handleQuickShift(-24)}>−24ч</button>
                <button onClick={() => handleQuickShift(-1)}>−1ч</button>
                <button onClick={() => handleQuickShift(-0.5)}>−30м</button>
                <button onClick={() => handleQuickShift(0.5)}>+30м</button>
                <button onClick={() => handleQuickShift(1)}>+1ч</button>
                <button onClick={() => handleQuickShift(24)}>+24ч</button>
              </div>
            </div>

            {overridden && (
              <button className="tc-btn tc-btn-reset" onClick={handleReset}>
                🔄 Синхронизировать с реальным временем
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
