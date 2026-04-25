import { useEffect, useState, useMemo, useCallback } from 'react'
import { shiftService, restaurantService } from '../../api/services'
import type {
  Shift,
  ShiftTemplate,
  User,
  CreateShiftRequest,
  CreateShiftTemplateRequest,
  ShiftType,
} from '../../api/types'
import Modal from '../../components/Modal'
import './Shifts.css'

// Color palette for employees
const EMPLOYEE_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e11d48', '#a855f7', '#0ea5e9', '#eab308',
]

/** ISO DayOfWeek 1–7 → короткая подпись */
const ISO_DAY_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const JAVA_DAY_TO_ISO: Record<string, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7,
}

function formatTemplateDaysLabel(t: ShiftTemplate): string {
  if (t.daysOfWeek && t.daysOfWeek.length > 0) {
    return t.daysOfWeek
      .slice()
      .sort((a, b) => a - b)
      .map((d) => ISO_DAY_SHORT[d] || String(d))
      .join(', ')
  }
  if (t.dayOfWeek) {
    const iso = JAVA_DAY_TO_ISO[t.dayOfWeek]
    return iso ? ISO_DAY_SHORT[iso] : t.dayOfWeek
  }
  return 'Все дни'
}

interface ShiftFormData {
  employeeId: number | null
  startTime: string
  endTime: string
  shiftType: string
  comment: string
}

export default function Shifts() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [employees, setEmployees] = useState<User[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now.setDate(diff))
    monday.setHours(0, 0, 0, 0)
    return monday
  })

  // Modals
  const [showShiftModal, setShowShiftModal] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [showQuickAddModal, setShowQuickAddModal] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [, setSelectedCell] = useState<{ date: Date; employeeId: number } | null>(null)

  const [formData, setFormData] = useState<ShiftFormData>({
    employeeId: null,
    startTime: '',
    endTime: '',
    shiftType: 'REGULAR',
    comment: '',
  })

  const [templateForm, setTemplateForm] = useState({
    name: '',
    startTime: '09:00',
    endTime: '17:00',
    /** ISO 1–7; пусто = шаблон на любой день недели */
    selectedDays: [] as number[],
    shiftType: 'REGULAR',
  })

  // Week days array
  const weekDays = useMemo(() => {
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeekStart)
      day.setDate(day.getDate() + i)
      days.push(day)
    }
    return days
  }, [currentWeekStart])

  // Employee color map
  const employeeColors = useMemo(() => {
    const map = new Map<number, string>()
    employees.forEach((emp, idx) => {
      map.set(emp.id, EMPLOYEE_COLORS[idx % EMPLOYEE_COLORS.length])
    })
    return map
  }, [employees])

  // Group shifts by day and employee
  const shiftsByDayAndEmployee = useMemo(() => {
    const map = new Map<string, Shift[]>()
    shifts.forEach(shift => {
      const startDate = new Date(shift.startTime)
      const dateKey = startDate.toISOString().split('T')[0]
      const key = `${dateKey}_${shift.employeeId}`
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)!.push(shift)
    })
    return map
  }, [shifts])

  useEffect(() => {
    loadData()
  }, [currentWeekStart])

  const loadData = async () => {
    setLoading(true)
    try {
      const weekEnd = new Date(currentWeekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)

      const [shiftsData, usersData, templatesData] = await Promise.all([
        shiftService.getShifts(
          undefined,
          undefined,
          currentWeekStart.toISOString(),
          weekEnd.toISOString()
        ),
        restaurantService.getUsers(0, 100),
        shiftService.getShiftTemplates(),
      ])

      setShifts(shiftsData)
      setEmployees(usersData.content.filter(u => u.role !== 'HEAD_ADMIN'))
      setTemplates(templatesData)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const goToPreviousWeek = () => {
    const newStart = new Date(currentWeekStart)
    newStart.setDate(newStart.getDate() - 7)
    setCurrentWeekStart(newStart)
  }

  const goToNextWeek = () => {
    const newStart = new Date(currentWeekStart)
    newStart.setDate(newStart.getDate() + 7)
    setCurrentWeekStart(newStart)
  }

  const goToCurrentWeek = () => {
    const now = new Date()
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now.setDate(diff))
    monday.setHours(0, 0, 0, 0)
    setCurrentWeekStart(monday)
  }

  const handleCellClick = (date: Date, employeeId: number) => {
    setSelectedCell({ date, employeeId })
    const dateStr = date.toISOString().split('T')[0]
    setFormData({
      employeeId,
      startTime: `${dateStr}T09:00`,
      endTime: `${dateStr}T17:00`,
      shiftType: 'REGULAR',
      comment: '',
    })
    setEditingShift(null)
    setShowQuickAddModal(true)
  }

  const handleShiftClick = (shift: Shift, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingShift(shift)
    setFormData({
      employeeId: shift.employeeId,
      startTime: shift.startTime.slice(0, 16),
      endTime: shift.endTime.slice(0, 16),
      shiftType: shift.shiftType || 'REGULAR',
      comment: shift.comment || '',
    })
    setShowShiftModal(true)
  }

  const handleSaveShift = async () => {
    if (!formData.employeeId || !formData.startTime || !formData.endTime) {
      alert('Заполните все обязательные поля')
      return
    }

    try {
      if (editingShift) {
        await shiftService.updateShift(editingShift.id, {
          employeeId: formData.employeeId,
          startTime: formData.startTime,
          endTime: formData.endTime,
          shiftType: formData.shiftType as any,
          comment: formData.comment || undefined,
        })
      } else {
        const request: CreateShiftRequest = {
          employeeId: formData.employeeId,
          startTime: formData.startTime,
          endTime: formData.endTime,
          shiftType: formData.shiftType as any,
          comment: formData.comment || undefined,
        }
        await shiftService.createShift(request)
      }
      setShowShiftModal(false)
      setShowQuickAddModal(false)
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось сохранить смену')
    }
  }

  const handleDeleteShift = async (shiftId: number) => {
    if (!confirm('Удалить эту смену?')) return
    try {
      await shiftService.deleteShift(shiftId)
      setShowShiftModal(false)
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось удалить смену')
    }
  }

  const handlePublishShift = async (shift: Shift) => {
    try {
      await shiftService.publishShift(shift.id)
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось опубликовать смену')
    }
  }

  const handlePublishWeek = async () => {
    if (!confirm('Опубликовать все черновики за эту неделю?')) return
    try {
      await shiftService.publishWeek(currentWeekStart.toISOString())
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось опубликовать смены')
    }
  }

  const handleCreateTemplate = async () => {
    if (!templateForm.name || !templateForm.startTime || !templateForm.endTime) {
      alert('Заполните название и время')
      return
    }
    try {
      const body: CreateShiftTemplateRequest = {
        name: templateForm.name,
        startTime: templateForm.startTime,
        endTime: templateForm.endTime,
        shiftType: templateForm.shiftType as ShiftType,
      }
      if (templateForm.selectedDays.length > 0) {
        body.daysOfWeek = [...templateForm.selectedDays].sort((a, b) => a - b)
      }
      await shiftService.createShiftTemplate(body)
      setShowTemplateModal(false)
      setTemplateForm({
        name: '',
        startTime: '09:00',
        endTime: '17:00',
        selectedDays: [],
        shiftType: 'REGULAR',
      })
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось создать шаблон')
    }
  }

  const handleDeleteTemplate = async (id: number) => {
    if (!confirm('Удалить этот шаблон?')) return
    try {
      await shiftService.deleteShiftTemplate(id)
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось удалить шаблон')
    }
  }

  const applyTemplate = async (template: ShiftTemplate) => {
    if (employees.length === 0) {
      alert('Нет сотрудников для назначения')
      return
    }
    const employeeId = prompt(
      'Введите ID сотрудника:\n' +
        employees.map(e => `${e.id}: ${e.firstName || ''} ${e.lastName || ''} (${e.username})`).join('\n')
    )
    if (!employeeId) return

    const empId = parseInt(employeeId)
    if (!employees.find(e => e.id === empId)) {
      alert('Сотрудник не найден')
      return
    }

    const weekEnd = new Date(currentWeekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    try {
      await shiftService.generateFromTemplate(
        template.id,
        currentWeekStart.toISOString().split('T')[0],
        weekEnd.toISOString().split('T')[0],
        [empId]
      )
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось применить шаблон')
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDateHeader = (date: Date) => {
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
    const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
    return {
      day: dayNames[date.getDay()],
      date: date.getDate(),
      month: monthNames[date.getMonth()],
    }
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    )
  }

  const getEmployeeName = useCallback((emp: User) => {
    if (emp.firstName || emp.lastName) {
      return `${emp.firstName || ''} ${emp.lastName || ''}`.trim()
    }
    return emp.username.split('@')[0]
  }, [])

  const getShiftDuration = (shift: Shift) => {
    const start = new Date(shift.startTime)
    const end = new Date(shift.endTime)
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
    return hours.toFixed(1)
  }

  const getWeekStats = useMemo(() => {
    const stats = new Map<number, number>()
    shifts.forEach(shift => {
      if (!shift.employeeId) return
      const hours = parseFloat(getShiftDuration(shift))
      stats.set(shift.employeeId, (stats.get(shift.employeeId) || 0) + hours)
    })
    return stats
  }, [shifts])

  const weekRangeText = useMemo(() => {
    const weekEnd = new Date(currentWeekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const formatDate = (d: Date) =>
      d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    return `${formatDate(currentWeekStart)} — ${formatDate(weekEnd)}`
  }, [currentWeekStart])

  return (
    <div className="shifts-page">
      <div className="shifts-header">
        <div className="shifts-title">
          <h1>📅 Расписание смен</h1>
          <span className="week-range">{weekRangeText}</span>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setShowTemplateModal(true)}>
            🗂️ Шаблоны
          </button>
          <button className="btn-secondary" onClick={handlePublishWeek}>
            📤 Опубликовать неделю
          </button>
          <button className="btn-primary" onClick={() => {
            setEditingShift(null)
            setFormData({
              employeeId: employees[0]?.id || null,
              startTime: `${weekDays[0].toISOString().split('T')[0]}T09:00`,
              endTime: `${weekDays[0].toISOString().split('T')[0]}T17:00`,
              shiftType: 'REGULAR',
              comment: '',
            })
            setShowShiftModal(true)
          }}>
            ➕ Новая смена
          </button>
        </div>
      </div>

      <div className="week-navigation">
        <button className="nav-btn" onClick={goToPreviousWeek}>← Предыдущая неделя</button>
        <button className="today-btn" onClick={goToCurrentWeek}>Сегодня</button>
        <button className="nav-btn" onClick={goToNextWeek}>Следующая неделя →</button>
      </div>

      {loading ? (
        <div className="loading-spinner">Загрузка...</div>
      ) : employees.length === 0 ? (
        <div className="no-employees">
          <p>Нет сотрудников для отображения</p>
        </div>
      ) : (
        <div className="schedule-container">
          <div className="schedule-grid">
            {/* Header row */}
            <div className="grid-header">
              <div className="employee-header">Сотрудник</div>
              {weekDays.map(day => {
                const { day: dayName, date, month } = formatDateHeader(day)
                return (
                  <div
                    key={day.toISOString()}
                    className={`day-header ${isToday(day) ? 'today' : ''}`}
                  >
                    <span className="day-name">{dayName}</span>
                    <span className="day-date">{date}</span>
                    <span className="day-month">{month}</span>
                  </div>
                )
              })}
              <div className="stats-header">Часы</div>
            </div>

            {/* Employee rows */}
            {employees.map(employee => (
              <div key={employee.id} className="employee-row">
                <div
                  className="employee-cell"
                  style={{ borderLeftColor: employeeColors.get(employee.id) }}
                >
                  <div className="employee-avatar" style={{ backgroundColor: employeeColors.get(employee.id) }}>
                    {getEmployeeName(employee).charAt(0).toUpperCase()}
                  </div>
                  <div className="employee-info">
                    <span className="employee-name">{getEmployeeName(employee)}</span>
                    <span className="employee-role">{employee.role}</span>
                  </div>
                </div>

                {weekDays.map(day => {
                  const dateKey = day.toISOString().split('T')[0]
                  const key = `${dateKey}_${employee.id}`
                  const dayShifts = shiftsByDayAndEmployee.get(key) || []

                  return (
                    <div
                      key={day.toISOString()}
                      className={`shift-cell ${isToday(day) ? 'today' : ''}`}
                      onClick={() => handleCellClick(day, employee.id)}
                    >
                      {dayShifts.map(shift => (
                        <div
                          key={shift.id}
                          className={`shift-block ${shift.status.toLowerCase()}`}
                          style={{
                            backgroundColor: employeeColors.get(employee.id),
                            opacity: shift.status === 'DRAFT' ? 0.7 : 1,
                          }}
                          onClick={(e) => handleShiftClick(shift, e)}
                          title={`${formatTime(shift.startTime)} - ${formatTime(shift.endTime)}\n${shift.shiftType || 'REGULAR'}\n${shift.status}`}
                        >
                          <span className="shift-time">
                            {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                          </span>
                          {shift.status === 'DRAFT' && <span className="draft-badge">черновик</span>}
                          {shift.shiftType === 'OVERTIME' && <span className="type-badge overtime">OT</span>}
                          {shift.shiftType === 'NIGHT' && <span className="type-badge night">🌙</span>}
                          {shift.shiftType === 'HOLIDAY' && <span className="type-badge holiday">🎄</span>}
                        </div>
                      ))}
                      {dayShifts.length === 0 && (
                        <div className="empty-cell-hint">+</div>
                      )}
                    </div>
                  )
                })}

                <div className="stats-cell">
                  <span className="hours-count">
                    {(getWeekStats.get(employee.id) || 0).toFixed(1)}ч
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Add Modal */}
      <Modal
        isOpen={showQuickAddModal}
        onClose={() => setShowQuickAddModal(false)}
        title="Добавить смену"
      >
        <div className="shift-form">
          <div className="form-row">
            <label>
              <span>Сотрудник:</span>
              <select
                value={formData.employeeId || ''}
                onChange={(e) => setFormData({ ...formData, employeeId: parseInt(e.target.value) })}
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {getEmployeeName(emp)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row time-row">
            <label>
              <span>Начало:</span>
              <input
                type="datetime-local"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                required
              />
            </label>
            <label>
              <span>Конец:</span>
              <input
                type="datetime-local"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>Тип смены:</span>
              <select
                value={formData.shiftType}
                onChange={(e) => setFormData({ ...formData, shiftType: e.target.value })}
              >
                <option value="REGULAR">Обычная</option>
                <option value="OVERTIME">Сверхурочная</option>
                <option value="NIGHT">Ночная</option>
                <option value="HOLIDAY">Праздничная</option>
              </select>
            </label>
          </div>
          <label>
            <span>Комментарий:</span>
            <input
              type="text"
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
            />
          </label>
          <div className="form-actions">
            <button className="btn-secondary" onClick={() => setShowQuickAddModal(false)}>
              Отмена
            </button>
            <button className="btn-primary" onClick={handleSaveShift}>
              Создать
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Shift Modal */}
      <Modal
        isOpen={showShiftModal}
        onClose={() => setShowShiftModal(false)}
        title={editingShift ? 'Редактировать смену' : 'Новая смена'}
      >
        <div className="shift-form">
          <div className="form-row">
            <label>
              <span>Сотрудник:</span>
              <select
                value={formData.employeeId || ''}
                onChange={(e) => setFormData({ ...formData, employeeId: parseInt(e.target.value) })}
              >
                <option value="">Выберите сотрудника</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {getEmployeeName(emp)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row time-row">
            <label>
              <span>Начало:</span>
              <input
                type="datetime-local"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                required
              />
            </label>
            <label>
              <span>Конец:</span>
              <input
                type="datetime-local"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              <span>Тип смены:</span>
              <select
                value={formData.shiftType}
                onChange={(e) => setFormData({ ...formData, shiftType: e.target.value })}
              >
                <option value="REGULAR">Обычная</option>
                <option value="OVERTIME">Сверхурочная</option>
                <option value="NIGHT">Ночная</option>
                <option value="HOLIDAY">Праздничная</option>
              </select>
            </label>
          </div>
          <label>
            <span>Комментарий:</span>
            <input
              type="text"
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
            />
          </label>
          {editingShift && (
            <div className="shift-status-info">
              <span className={`status-badge ${editingShift.status.toLowerCase()}`}>
                {editingShift.status === 'DRAFT' && 'Черновик'}
                {editingShift.status === 'PUBLISHED' && 'Опубликовано'}
                {editingShift.status === 'LOCKED' && 'Заблокировано'}
              </span>
              {editingShift.status === 'DRAFT' && (
                <button
                  className="btn-small btn-success"
                  onClick={() => handlePublishShift(editingShift)}
                >
                  Опубликовать
                </button>
              )}
            </div>
          )}
          <div className="form-actions">
            {editingShift && (
              <button
                className="btn-danger"
                onClick={() => handleDeleteShift(editingShift.id)}
              >
                Удалить
              </button>
            )}
            <button className="btn-secondary" onClick={() => setShowShiftModal(false)}>
              Отмена
            </button>
            <button className="btn-primary" onClick={handleSaveShift}>
              Сохранить
            </button>
          </div>
        </div>
      </Modal>

      {/* Templates Modal */}
      <Modal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        title="Шаблоны смен"
      >
        <div className="templates-container">
          <div className="templates-list">
            <h4>Существующие шаблоны</h4>
            {templates.length === 0 ? (
              <p className="no-templates">Нет шаблонов</p>
            ) : (
              templates.map(template => (
                <div key={template.id} className="template-item">
                  <div className="template-info">
                    <span className="template-name">{template.name}</span>
                    <span className="template-time">
                      {template.startTime} - {template.endTime}
                    </span>
                    <span className="template-day">{formatTemplateDaysLabel(template)}</span>
                  </div>
                  <div className="template-actions">
                    <button
                      className="btn-small btn-primary"
                      onClick={() => applyTemplate(template)}
                    >
                      Применить
                    </button>
                    <button
                      className="btn-small btn-danger"
                      onClick={() => handleDeleteTemplate(template.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="template-form">
            <h4>Создать новый шаблон</h4>
            <label>
              <span>Название:</span>
              <input
                type="text"
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder="Утренняя смена"
                required
              />
            </label>
            <div className="form-row time-row">
              <label>
                <span>Начало:</span>
                <input
                  type="time"
                  value={templateForm.startTime}
                  onChange={(e) => setTemplateForm({ ...templateForm, startTime: e.target.value })}
                  required
                />
              </label>
              <label>
                <span>Конец:</span>
                <input
                  type="time"
                  value={templateForm.endTime}
                  onChange={(e) => setTemplateForm({ ...templateForm, endTime: e.target.value })}
                  required
                />
              </label>
            </div>
            <div className="template-days-block">
              <span className="template-days-label">Дни недели (можно несколько):</span>
              <p className="template-days-hint">
                Не отмечайте ни одного дня — шаблон подойдёт на любой день. Иначе смены создаются только в выбранные дни
                (удобно разделить будни и выходные).
              </p>
              <div className="template-day-presets">
                <button
                  type="button"
                  className="btn-small"
                  onClick={() => setTemplateForm({ ...templateForm, selectedDays: [1, 2, 3, 4, 5] })}
                >
                  Будни
                </button>
                <button
                  type="button"
                  className="btn-small"
                  onClick={() => setTemplateForm({ ...templateForm, selectedDays: [6, 7] })}
                >
                  Выходные
                </button>
                <button
                  type="button"
                  className="btn-small"
                  onClick={() => setTemplateForm({ ...templateForm, selectedDays: [1, 2, 3, 4, 5, 6, 7] })}
                >
                  Вся неделя
                </button>
                <button
                  type="button"
                  className="btn-small"
                  onClick={() => setTemplateForm({ ...templateForm, selectedDays: [] })}
                >
                  Любой день
                </button>
              </div>
              <div className="template-day-checkboxes">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <label key={d} className="template-day-chip">
                    <input
                      type="checkbox"
                      checked={templateForm.selectedDays.includes(d)}
                      onChange={() => {
                        const has = templateForm.selectedDays.includes(d)
                        setTemplateForm({
                          ...templateForm,
                          selectedDays: has
                            ? templateForm.selectedDays.filter((x) => x !== d)
                            : [...templateForm.selectedDays, d].sort((a, b) => a - b),
                        })
                      }}
                    />
                    {ISO_DAY_SHORT[d]}
                  </label>
                ))}
              </div>
            </div>
            <label>
              <span>Тип смены:</span>
              <select
                value={templateForm.shiftType}
                onChange={(e) => setTemplateForm({ ...templateForm, shiftType: e.target.value })}
              >
                <option value="REGULAR">Обычная</option>
                <option value="OVERTIME">Сверхурочная</option>
                <option value="NIGHT">Ночная</option>
                <option value="HOLIDAY">Праздничная</option>
              </select>
            </label>
            <button className="btn-primary" onClick={handleCreateTemplate}>
              Создать шаблон
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
