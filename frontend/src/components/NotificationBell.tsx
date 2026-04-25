import { useState, useEffect, useRef, useCallback } from 'react'
import { bookingNotificationService, activityService } from '../api/services'
import type { BookingNotification, Activity } from '../api/types'
import './NotificationBell.css'

function toLocalDatetimeInput(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}`
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<BookingNotification[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resolving, setResolving] = useState<number | null>(null)
  const [extendTime, setExtendTime] = useState<string>('')
  const [extendActivityId, setExtendActivityId] = useState<number | undefined>(undefined)
  const [showExtendFor, setShowExtendFor] = useState<number | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)

  const loadCount = useCallback(async () => {
    try {
      const count = await bookingNotificationService.countPending()
      setPendingCount(count)
    } catch (err) {
      // Silently fail — user may not have permissions
    }
  }, [])

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const data = await bookingNotificationService.getPending()
      setNotifications(data)
      setPendingCount(data.length)
    } catch (err) {
      console.error('Failed to load notifications:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load activities for the extend form selector
  useEffect(() => {
    activityService.getActivities(undefined, 'ACTIVE')
      .then(setActivities)
      .catch(() => {})
  }, [])

  // Poll count every 30 seconds
  useEffect(() => {
    loadCount()
    const interval = setInterval(loadCount, 30_000)
    return () => clearInterval(interval)
  }, [loadCount])

  // Reload notifications immediately when virtual time changes
  useEffect(() => {
    const handler = () => {
      // Задержка, чтобы бэкенд успел создать уведомления (check-now вызывается в syncBackend)
      setTimeout(() => {
        loadCount()
        if (open) loadNotifications()
      }, 1500)
    }
    window.addEventListener('time-override-changed', handler)
    return () => window.removeEventListener('time-override-changed', handler)
  }, [loadCount, loadNotifications, open])

  // Load full list when dropdown opens
  useEffect(() => {
    if (open) loadNotifications()
  }, [open, loadNotifications])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleResolve = async (id: number, response: string, newEndAt?: string, activityId?: number) => {
    setResolving(id)
    try {
      await bookingNotificationService.resolve(id, response, newEndAt, activityId)
      // Remove from list
      setNotifications(prev => prev.filter(n => n.id !== id))
      setPendingCount(prev => Math.max(0, prev - 1))
      setShowExtendFor(null)
      setExtendTime('')
      setExtendActivityId(undefined)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Ошибка при обработке уведомления')
    } finally {
      setResolving(null)
    }
  }

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="notification-bell-container" ref={dropdownRef}>
      <button
        className={`notification-bell-btn ${pendingCount > 0 ? 'has-notifications' : ''}`}
        onClick={() => setOpen(!open)}
        title="Уведомления"
      >
        🔔
        {pendingCount > 0 && (
          <span className="notification-badge">{pendingCount > 9 ? '9+' : pendingCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <span>Уведомления</span>
            {pendingCount > 0 && <span className="nd-count">{pendingCount}</span>}
          </div>

          {loading ? (
            <div className="nd-loading">Загрузка...</div>
          ) : notifications.length === 0 ? (
            <div className="nd-empty">Нет новых уведомлений</div>
          ) : (
            <div className="notification-list">
              {notifications.map(n => (
                <div key={n.id} className={`notification-item type-${n.notificationType.toLowerCase()}`}>
                  <div className="ni-header">
                    <span className={`ni-type-badge ${n.notificationType.toLowerCase()}`}>
                      {n.notificationType === 'REMINDER' ? '📅 Напоминание'
                        : '⏰ Просрочена'}
                    </span>
                    <span className="ni-time">{formatTime(n.createdAt)}</span>
                  </div>

                  <div className="ni-body">
                    <div className="ni-client">
                      <strong>{n.customerName || '—'}</strong>
                      {n.customerPhone && <span className="ni-phone">{n.customerPhone}</span>}
                    </div>
                    <div className="ni-detail">
                      {n.activityName && <span className="ni-activity">{n.activityName}</span>}
                      <span className="ni-booking-time">
                        {formatTime(n.bookingStartAt)} — {formatTime(n.bookingEndAt)}
                      </span>
                    </div>
                    {n.message && <p className="ni-message">{n.message}</p>}
                  </div>

                  <div className="ni-actions">
                    {n.notificationType === 'REMINDER' && (
                      <>
                        <button
                          className="ni-btn ni-btn-confirm"
                          onClick={() => handleResolve(n.id, 'CONFIRMED')}
                          disabled={resolving === n.id}
                        >
                          ✅ Подтверждена
                        </button>
                        <button
                          className="ni-btn ni-btn-cancel"
                          onClick={() => handleResolve(n.id, 'CANCELLED')}
                          disabled={resolving === n.id}
                        >
                          ❌ Отменена
                        </button>
                      </>
                    )}


                    {n.notificationType === 'OVERDUE' && (
                      <>
                        {showExtendFor === n.id ? (
                          <div className="ni-extend-form">
                            <label>Какой услугой продолжает пользоваться:</label>
                            <select
                              className="ni-activity-select"
                              value={extendActivityId ?? ''}
                              onChange={e => setExtendActivityId(e.target.value ? Number(e.target.value) : undefined)}
                            >
                              <option value="">— Та же ({n.activityName || '?'}) —</option>
                              {activities.map(a => (
                                <option key={a.id} value={a.id}>
                                  {a.name}{a.gapFiller ? ' (посещение)' : ''}
                                </option>
                              ))}
                            </select>

                            {(() => {
                              const selected = extendActivityId
                                ? activities.find(a => a.id === extendActivityId)
                                : null
                              if (selected?.gapFiller && selected.stopCheckHours) {
                                return (
                                  <div className="ni-stop-check-hint">
                                    ⏱ Стоп-чек: после {selected.stopCheckHours} ч пребывания — посещение бесплатно
                                  </div>
                                )
                              }
                              return null
                            })()}

                            <label>Новое время окончания:</label>
                            <input
                              type="datetime-local"
                              value={extendTime}
                              onChange={e => setExtendTime(e.target.value)}
                              min={toLocalDatetimeInput(new Date())}
                            />
                            <div className="ni-extend-actions">
                              <button
                                className="ni-btn ni-btn-confirm"
                                onClick={() => handleResolve(n.id, 'CONTINUES', extendTime, extendActivityId)}
                                disabled={resolving === n.id || !extendTime}
                              >
                                Продлить
                              </button>
                              <button
                                className="ni-btn ni-btn-secondary"
                                onClick={() => { setShowExtendFor(null); setExtendTime(''); setExtendActivityId(undefined) }}
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              className="ni-btn ni-btn-extend"
                              onClick={() => {
                                setShowExtendFor(n.id)
                                setExtendActivityId(undefined)
                                // Default to +1 hour from now
                                setExtendTime(toLocalDatetimeInput(new Date(Date.now() + 60 * 60 * 1000)))
                              }}
                              disabled={resolving === n.id}
                            >
                              🔄 Продолжает пользоваться
                            </button>
                            <button
                              className="ni-btn ni-btn-cancel"
                              onClick={() => handleResolve(n.id, 'PAID_OR_CANCELLED')}
                              disabled={resolving === n.id}
                            >
                              💰 Оплачена / отменена
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
