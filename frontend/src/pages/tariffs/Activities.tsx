import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { activityService, tariffService } from '../../api/services'
import type { Activity, TariffPlan } from '../../api/types'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import FormInput from '../../components/FormInput'
import './Activities.css'

export default function Activities() {
  const navigate = useNavigate()
  const [activities, setActivities] = useState<Activity[]>([])
  const [tariffPlans, setTariffPlans] = useState<TariffPlan[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [formData, setFormData] = useState<Partial<Activity>>({
    name: '',
    description: '',
    status: 'ACTIVE',
    bookingMode: 'CAPACITY',
    concurrentLimit: undefined,
    fullVenueLock: false,
    requiresResource: false,
    gapFiller: false,
    stopCheckHours: null,
  })

  useEffect(() => {
    loadActivities()
    loadTariffPlans()
  }, [])

  const loadActivities = async () => {
    setLoading(true)
    try {
      const data = await activityService.getActivities()
      setActivities(data)
    } catch (error) {
      console.error('Failed to load activities:', error)
      setActivities([])
    } finally {
      setLoading(false)
    }
  }

  const loadTariffPlans = async () => {
    try {
      const response = await tariffService.getTariffPlans(undefined, true, 0, 100)
      setTariffPlans(Array.isArray(response.content) ? response.content : [])
    } catch (error) {
      console.error('Failed to load tariff plans:', error)
    }
  }

  const handleCreate = () => {
    setEditingActivity(null)
    setFormData({
      name: '',
      description: '',
      status: 'ACTIVE',
      bookingMode: 'CAPACITY',
      concurrentLimit: undefined,
      fullVenueLock: false,
      requiresResource: false,
      gapFiller: false,
      stopCheckHours: null,
    })
    setShowModal(true)
  }

  const handleEdit = (activity: Activity) => {
    setEditingActivity(activity)
    // Преобразуем tariffPlan в tariffPlanId для формы
    const formDataForEdit: Partial<Activity> = {
      ...activity,
      tariffPlanId: activity.tariffPlan?.id || activity.tariffPlanId,
    }
    setFormData(formDataForEdit)
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      // Преобразуем tariffPlanId в объект tariffPlan для отправки на сервер
      const dataToSave: any = { ...formData }
      if (formData.tariffPlanId) {
        dataToSave.tariffPlan = { id: formData.tariffPlanId }
        delete dataToSave.tariffPlanId
      } else {
        dataToSave.tariffPlan = null
        delete dataToSave.tariffPlanId
      }
      
      // Убеждаемся, что concurrentLimit установлен (минимум 1)
      if (!dataToSave.concurrentLimit || dataToSave.concurrentLimit < 1) {
        dataToSave.concurrentLimit = 1
      }
      // gapFiller + stopCheckHours
      dataToSave.gapFiller = formData.gapFiller ?? false
      dataToSave.stopCheckHours = (formData.gapFiller && formData.stopCheckHours != null && formData.stopCheckHours > 0)
        ? Number(formData.stopCheckHours)
        : null
      dataToSave.fullVenueLock = formData.fullVenueLock ?? false
      if (dataToSave.fullVenueLock) {
        dataToSave.bookingMode = 'EXCLUSIVE'
        dataToSave.concurrentLimit = 1
      }

      if (editingActivity) {
        await activityService.updateActivity(editingActivity.id, dataToSave)
      } else {
        await activityService.createActivity(dataToSave)
      }
      setShowModal(false)
      loadActivities()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to save activity')
    }
  }

  const handleDelete = async (activity: Activity) => {
    if (!confirm(`Delete activity "${activity.name}"?`)) return
    try {
      await activityService.deleteActivity(activity.id)
      loadActivities()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete activity')
    }
  }

  const columns = [
    { key: 'name', header: 'Название' },
    {
      key: 'bookingMode',
      header: 'Режим',
      render: (item: Activity) => {
        const modes: Record<string, string> = {
          CAPACITY: 'Параллельные записи',
          EXCLUSIVE: 'Только одна запись',
        }
        return modes[item.bookingMode] || item.bookingMode
      },
    },
    {
      key: 'concurrentLimit',
      header: 'Лимит',
      render: (item: Activity) => item.concurrentLimit,
    },
    {
      key: 'fullVenueLock',
      header: 'Полная бронь',
      render: (item: Activity) => (item.fullVenueLock ? 'Да (весь объект)' : '—'),
    },
    {
      key: 'requiresResource',
      header: 'Требует ресурс',
      render: (item: Activity) => (item.requiresResource ? 'Да' : 'Нет'),
    },
    {
      key: 'gapFiller',
      header: 'Заполнение пробелов',
      render: (item: Activity) => (item.gapFiller ? '✅ Да' : '—'),
    },
    {
      key: 'stopCheckHours',
      header: 'Стоп-чек',
      render: (item: Activity) => item.gapFiller && item.stopCheckHours ? `${item.stopCheckHours} ч` : '—',
    },
    {
      key: 'tariffPlan',
      header: 'Тарифный план',
      render: (item: Activity) => {
        if (item.tariffPlan) return item.tariffPlan.name
        if (item.tariffPlanId) {
          const plan = tariffPlans.find((p) => p.id === item.tariffPlanId)
          return plan ? plan.name : 'Не указан'
        }
        return 'Не указан'
      },
    },
    {
      key: 'status',
      header: 'Статус',
      render: (item: Activity) => (item.status === 'ACTIVE' ? 'Активна' : 'Неактивна'),
    },
    {
      key: 'actions',
      header: 'Действия',
      render: (item: Activity) => (
        <div className="action-buttons">
          <button onClick={() => handleEdit(item)} className="btn-small btn-primary">
            Edit
          </button>
          <button onClick={() => navigate(`/bookings?activityId=${item.id}`)} className="btn-small btn-secondary">
            Bookings
          </button>
          <button onClick={() => handleDelete(item)} className="btn-small btn-danger">
            Delete
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="activities-page">
      <div className="page-header">
        <h1>Мероприятия/Активности</h1>
        <button className="btn-primary" onClick={handleCreate}>
          Новое мероприятие
        </button>
      </div>

      <DataTable
        data={activities}
        columns={columns}
        loading={loading}
        emptyMessage="No activities found"
      />

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingActivity ? 'Редактировать мероприятие' : 'Новое мероприятие'}
      >
        <div className="activity-form">
          <FormInput
            label="Название (например: Бильярд, Кинозал)"
            value={formData.name || ''}
            onChange={(value) => setFormData({ ...formData, name: value })}
            required
            placeholder="Бильярд 6 столов"
          />
          <FormInput
            label="Описание"
            value={formData.description || ''}
            onChange={(value) => setFormData({ ...formData, description: value })}
            type="textarea"
          />
          <div className="form-row">
            <label>
              <span>Режим бронирования:</span>
              <select
                value={formData.bookingMode || 'CAPACITY'}
                onChange={(e) => {
                  const newMode = e.target.value as any
                  const updates: Partial<Activity> = { bookingMode: newMode }
                  // Если выбран EXCLUSIVE, автоматически устанавливаем лимит в 1
                  if (newMode === 'EXCLUSIVE') {
                    updates.concurrentLimit = 1
                  }
                  setFormData({ ...formData, ...updates })
                }}
              >
                <option value="CAPACITY">Параллельные записи (до лимита)</option>
                <option value="EXCLUSIVE">Только одна запись</option>
              </select>
            </label>
            <FormInput
              label="Лимит параллельных записей"
              type="number"
              value={formData.concurrentLimit?.toString() || ''}
              onChange={(value) => {
                // Обрабатываем ввод: если пусто, устанавливаем undefined, иначе парсим число
                if (value === '') {
                  setFormData({ ...formData, concurrentLimit: undefined as any })
                } else {
                  const numValue = parseInt(value, 10)
                  if (!isNaN(numValue) && numValue >= 1) {
                    setFormData({ ...formData, concurrentLimit: numValue })
                  }
                }
              }}
              min={1}
              disabled={formData.bookingMode === 'EXCLUSIVE' || formData.fullVenueLock}
            />
          </div>
          <label className="activity-full-venue-row">
            <input
              type="checkbox"
              checked={formData.fullVenueLock ?? false}
              onChange={(e) => {
                const on = e.target.checked
                setFormData({
                  ...formData,
                  fullVenueLock: on,
                  ...(on
                    ? { bookingMode: 'EXCLUSIVE' as const, concurrentLimit: 1 }
                    : {}),
                })
              }}
            />
            <span>
              <strong>Полная бронь площадки</strong> — пока действует такая бронь, параллельно нельзя бронировать ни это
              мероприятие (кроме одной записи), ни любое другое. В календаре других мероприятий отображается занятость с
              названием этой услуги.
            </span>
          </label>
          <div className="form-row">
            <label>
              <span>Тарифный план:</span>
              <select
                value={formData.tariffPlanId || ''}
                onChange={(e) =>
                  setFormData({ ...formData, tariffPlanId: e.target.value ? parseInt(e.target.value) : undefined })
                }
              >
                <option value="">-- Выберите тарифный план --</option>
                {tariffPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={formData.requiresResource ?? false}
                onChange={(e) => setFormData({ ...formData, requiresResource: e.target.checked })}
              />
              Требует выбор ресурса (стол/зал)
            </label>
            <label>
              <input
                type="checkbox"
                checked={formData.gapFiller ?? false}
                onChange={(e) => setFormData({ ...formData, gapFiller: e.target.checked, stopCheckHours: e.target.checked ? formData.stopCheckHours : null })}
              />
              Поминутная/почасовая оплата (заполнение пробелов)
            </label>
          </div>
          {formData.gapFiller && (
            <div className="form-row">
              <FormInput
                label="Стоп-чек (часов). После этого кол-ва часов пребывание бесплатно"
                type="number"
                value={formData.stopCheckHours != null ? String(formData.stopCheckHours) : ''}
                onChange={(value) => setFormData({ ...formData, stopCheckHours: value !== '' ? parseFloat(value) : null })}
                placeholder="Например: 4"
                min={0.5}
                step={0.5}
              />
            </div>
          )}
          <label>
            <input
              type="checkbox"
              checked={formData.status === 'ACTIVE'}
              onChange={(e) => setFormData({ ...formData, status: e.target.checked ? 'ACTIVE' : 'INACTIVE' })}
            />
            Активна
          </label>
          <div className="form-actions">
            <button className="btn-secondary" onClick={() => setShowModal(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

