import { useEffect, useState, useCallback, useMemo } from 'react'
import { restaurantService } from '../api/services'
import type { ActivityLog } from '../api/types'
import DataTable from '../components/DataTable'
import './ActivityLog.css'

const PAGE_SIZE = 100

// Фиксированный список действий
const ACTION_TYPES: { key: string; label: string }[] = [
  { key: 'CREATE', label: 'Создание' },
  { key: 'UPDATE', label: 'Обновление' },
  { key: 'DELETE', label: 'Удаление' },
  { key: 'LOGIN', label: 'Вход' },
  { key: 'LOGOUT', label: 'Выход' },
  { key: 'CANCEL', label: 'Отмена' },
  { key: 'COMPLETE', label: 'Завершение' },
  { key: 'PUBLISH', label: 'Публикация' },
  { key: 'LOCK', label: 'Блокировка' },
  { key: 'ACTIVATE', label: 'Активация' },
  { key: 'DEACTIVATE', label: 'Деактивация' },
  { key: 'ADD_ITEM', label: 'Добавление позиции' },
  { key: 'UPDATE_ITEM', label: 'Обновление позиции' },
  { key: 'REMOVE_ITEM', label: 'Удаление позиции' },
  { key: 'CLOSE_ORDER', label: 'Закрытие заказа' },
  { key: 'CANCEL_ORDER', label: 'Отмена заказа' },
  { key: 'UPDATE_RECIPE', label: 'Обновление рецепта' },
  { key: 'UPDATE_ROLE', label: 'Изменение роли' },
  { key: 'STOCK_IN', label: 'Приход на склад' },
  { key: 'STOCK_OUT', label: 'Расход со склада' },
  { key: 'ACCEPT_SWAP', label: 'Принятие обмена' },
  { key: 'REJECT_SWAP', label: 'Отклонение обмена' },
  { key: 'EXCEL_UPLOAD', label: 'Загрузка Excel' },
  { key: 'MARK_PAID', label: 'Оплата заказа' },
  { key: 'MARK_UNPAID', label: 'Отмена оплаты' },
  { key: 'CHANGE_STATUS', label: 'Смена статуса' },
  { key: 'API_GET', label: 'API GET' },
  { key: 'API_POST', label: 'API POST' },
  { key: 'API_PUT', label: 'API PUT' },
  { key: 'API_PATCH', label: 'API PATCH' },
  { key: 'API_DELETE', label: 'API DELETE' },
]

// Фиксированный список сущностей
const ENTITY_TYPES: { key: string; label: string }[] = [
  { key: 'INGREDIENT', label: 'Ингредиент' },
  { key: 'DISH', label: 'Блюдо' },
  { key: 'DISH_CATEGORY', label: 'Категория блюд' },
  { key: 'ORDER', label: 'Заказ' },
  { key: 'STOCK_MOVEMENT', label: 'Движение склада' },
  { key: 'HALL_MAP', label: 'Карта зала' },
  { key: 'HALL_ZONE', label: 'Зона зала' },
  { key: 'HALL_TABLE', label: 'Столик' },
  { key: 'HALL_ASSET', label: 'Объект зала' },
  { key: 'TABLE_RESERVATION', label: 'Бронь столика' },
  { key: 'BOOKING', label: 'Бронирование активности' },
  { key: 'ACTIVITY', label: 'Мероприятие' },
  { key: 'CALENDAR', label: 'Календарь' },
  { key: 'TARIFF_PLAN', label: 'Тарифный план' },
  { key: 'TARIFF_RULE', label: 'Правило тарифа' },
  { key: 'TARIFF_MODIFIER', label: 'Модификатор тарифа' },
  { key: 'SHIFT', label: 'Смена' },
  { key: 'SHIFT_TEMPLATE', label: 'Шаблон смены' },
  { key: 'SHIFT_SWAP_REQUEST', label: 'Запрос обмена сменами' },
  { key: 'AUTH', label: 'Авторизация' },
  { key: 'USER', label: 'Пользователь' },
  { key: 'RESTAURANT', label: 'Ресторан' },
  { key: 'CAMPAIGN', label: 'Акция' },
  { key: 'PERMISSION_TEMPLATE', label: 'Шаблон прав' },
  { key: 'API_REQUEST', label: 'API-запрос' },
]

// Маппинг: для каждой сущности — какие действия к ней применимы
const ENTITY_ACTION_MAP: Record<string, string[]> = {
  INGREDIENT: ['CREATE', 'UPDATE', 'DELETE', 'EXCEL_UPLOAD'],
  DISH: ['CREATE', 'UPDATE', 'DELETE', 'UPDATE_RECIPE'],
  DISH_CATEGORY: ['CREATE', 'UPDATE', 'DELETE'],
  ORDER: ['CREATE', 'ADD_ITEM', 'UPDATE_ITEM', 'REMOVE_ITEM', 'CLOSE_ORDER', 'CANCEL_ORDER', 'DELETE', 'MARK_PAID', 'MARK_UNPAID'],
  STOCK_MOVEMENT: ['STOCK_IN', 'STOCK_OUT'],
  HALL_MAP: ['UPDATE'],
  HALL_ZONE: ['CREATE', 'UPDATE', 'DELETE'],
  HALL_TABLE: ['CREATE'],
  HALL_ASSET: ['CREATE'],
  TABLE_RESERVATION: ['CREATE', 'UPDATE', 'CANCEL', 'COMPLETE'],
  BOOKING: ['CREATE', 'UPDATE', 'CANCEL'],
  ACTIVITY: ['CREATE', 'UPDATE', 'DELETE'],
  CALENDAR: ['CREATE', 'UPDATE', 'DELETE'],
  TARIFF_PLAN: ['CREATE', 'UPDATE', 'DELETE'],
  TARIFF_RULE: ['CREATE', 'UPDATE', 'DELETE'],
  TARIFF_MODIFIER: ['UPDATE', 'DELETE'],
  SHIFT: ['CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'LOCK'],
  SHIFT_TEMPLATE: ['CREATE', 'DELETE'],
  SHIFT_SWAP_REQUEST: ['CREATE', 'ACCEPT_SWAP', 'REJECT_SWAP'],
  AUTH: ['LOGIN', 'LOGOUT'],
  USER: ['CREATE', 'UPDATE', 'ACTIVATE', 'DEACTIVATE', 'UPDATE_ROLE'],
  RESTAURANT: ['CREATE', 'UPDATE', 'DELETE'],
  CAMPAIGN: ['CREATE', 'UPDATE', 'DELETE', 'CHANGE_STATUS'],
  PERMISSION_TEMPLATE: ['CREATE', 'UPDATE', 'DELETE'],
  API_REQUEST: ['API_GET', 'API_POST', 'API_PUT', 'API_PATCH', 'API_DELETE'],
}

// Быстрый поиск label по key
const ACTION_LABEL_MAP = Object.fromEntries(ACTION_TYPES.map(a => [a.key, a.label]))
const ENTITY_LABEL_MAP = Object.fromEntries(ENTITY_TYPES.map(e => [e.key, e.label]))

const PRESETS: { key: string; label: string; entities: string[]; changesOnly?: boolean }[] = [
  { key: 'menu', label: 'Меню и цены', entities: ['DISH', 'DISH_CATEGORY'] },
  { key: 'stock', label: 'Остатки и склад', entities: ['INGREDIENT', 'STOCK_MOVEMENT'] },
  { key: 'rights', label: 'Права и пользователи', entities: ['USER', 'PERMISSION_TEMPLATE'] },
  { key: 'promo', label: 'Акции', entities: ['CAMPAIGN'] },
  { key: 'audit', label: 'Только изменения', entities: [], changesOnly: true },
]

export default function ActivityLogPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)

  // Фильтры
  const [selectedActionType, setSelectedActionType] = useState<string>('')
  const [selectedEntityType, setSelectedEntityType] = useState<string>('')
  const [userName, setUserName] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [changesOnly, setChangesOnly] = useState(false)
  const [activePreset, setActivePreset] = useState('')

  useEffect(() => {
    const now = new Date()
    const from = new Date(now)
    from.setDate(from.getDate() - 7)
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    setDateFrom(fmt(from))
    setDateTo(fmt(now))
  }, [])

  // Каскадная логика: при выбранной сущности показываем только применимые действия
  const availableActionTypes = useMemo(() => {
    if (!selectedEntityType) return ACTION_TYPES
    const allowed = ENTITY_ACTION_MAP[selectedEntityType] || []
    return ACTION_TYPES.filter(a => allowed.includes(a.key))
  }, [selectedEntityType])

  // Сброс действия при смене сущности, если выбранное действие больше не в списке
  useEffect(() => {
    if (selectedActionType && !availableActionTypes.find(a => a.key === selectedActionType)) {
      setSelectedActionType('')
    }
  }, [availableActionTypes, selectedActionType])

  const loadLogs = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const filters: Record<string, string> = {}
      if (selectedActionType) filters.actionType = selectedActionType
      if (selectedEntityType) filters.entityType = selectedEntityType
      if (userName.trim()) filters.userName = userName.trim()
      if (dateFrom) filters.from = `${dateFrom}T00:00:00`
      if (dateTo) filters.to = `${dateTo}T23:59:59`

      const result = await restaurantService.getActivityLog(p, PAGE_SIZE, filters)
      setLogs(result.content)
      setTotalPages(result.totalPages)
      setTotalElements(result.totalElements)
      setPage(result.page)
    } catch (error) {
      console.error('Failed to load logs:', error)
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [selectedActionType, selectedEntityType, userName, dateFrom, dateTo])

  // Перезагрузка при смене фильтров
  useEffect(() => {
    loadLogs(0)
  }, [loadLogs])

  const handlePrev = () => {
    if (page > 0) loadLogs(page - 1)
  }

  const handleNext = () => {
    if (page < totalPages - 1) loadLogs(page + 1)
  }

  const handleResetFilters = () => {
    setSelectedActionType('')
    setSelectedEntityType('')
    setUserName('')
    setChangesOnly(false)
    setActivePreset('')
  }

  const hasActiveFilters = selectedActionType || selectedEntityType || userName || changesOnly || dateFrom || dateTo

  const filteredLogs = useMemo(() => {
    if (!changesOnly) return logs
    return logs.filter(l => l.actionType !== 'API_GET')
  }, [logs, changesOnly])

  const pageStats = useMemo(() => {
    const byUser: Record<string, number> = {}
    const byAction: Record<string, number> = {}
    const byEntity: Record<string, number> = {}
    for (const l of filteredLogs) {
      byUser[l.userName || '—'] = (byUser[l.userName || '—'] || 0) + 1
      byAction[l.actionType] = (byAction[l.actionType] || 0) + 1
      byEntity[l.entityType] = (byEntity[l.entityType] || 0) + 1
    }
    const top = (obj: Record<string, number>) =>
      Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 5)
    return {
      total: filteredLogs.length,
      topUsers: top(byUser),
      topActions: top(byAction),
      topEntities: top(byEntity),
    }
  }, [filteredLogs])

  const applyPreset = (presetKey: string) => {
    const p = PRESETS.find(x => x.key === presetKey)
    if (!p) return
    setActivePreset(presetKey)
    setChangesOnly(!!p.changesOnly)
    if (p.entities.length === 1) {
      setSelectedEntityType(p.entities[0])
    } else if (p.entities.length > 1) {
      setSelectedEntityType('')
    }
    setSelectedActionType('')
  }

  const handleExportCsv = async () => {
    const from = dateFrom || new Date().toISOString().slice(0, 10)
    const to = dateTo || new Date().toISOString().slice(0, 10)
    await restaurantService.exportActivityLogCsvDownload(from, to)
  }

  const columns = [
    {
      key: 'createdAt',
      header: 'Время',
      render: (item: ActivityLog) => new Date(item.createdAt).toLocaleString(),
    },
    {
      key: 'actionType',
      header: 'Действие',
      render: (item: ActivityLog) => {
        const cls = `action-type action-${item.actionType.toLowerCase()}`
        const label = ACTION_LABEL_MAP[item.actionType] || item.actionType
        return <span className={cls}>{label}</span>
      },
    },
    {
      key: 'entityType',
      header: 'Сущность',
      render: (item: ActivityLog) => {
        return ENTITY_LABEL_MAP[item.entityType] || item.entityType
      },
    },
    { key: 'userName', header: 'Пользователь' },
    {
      key: 'description',
      header: 'Описание',
      render: (item: ActivityLog) => (
        <span className="description" title={item.description}>
          {item.description}
        </span>
      ),
    },
  ]

  const from = page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, totalElements)

  return (
    <div className="activity-log-page">
      <div className="page-header">
        <h1>Журнал действий</h1>
        {totalElements > 0 && (
          <p>Всего записей: {totalElements}</p>
        )}
      </div>

      <div className="filters-panel">
        <div className="preset-row">
          {PRESETS.map(p => (
            <button
              key={p.key}
              className={`preset-chip ${activePreset === p.key ? 'active' : ''}`}
              onClick={() => applyPreset(p.key)}
              type="button"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="filter-row">
          <div className="filter-group">
            <label>Период: с</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="filter-group">
            <label>Период: по</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="filter-group">
            <label>Сущность</label>
            <select
              value={selectedEntityType}
              onChange={(e) => setSelectedEntityType(e.target.value)}
            >
              <option value="">Все сущности</option>
              {ENTITY_TYPES.map(et => (
                <option key={et.key} value={et.key}>{et.label}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Действие</label>
            <select
              value={selectedActionType}
              onChange={(e) => setSelectedActionType(e.target.value)}
            >
              <option value="">Все действия</option>
              {availableActionTypes.map(at => (
                <option key={at.key} value={at.key}>{at.label}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Пользователь</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="username"
            />
          </div>
          <div className="filter-group checkbox-group">
            <label>&nbsp;</label>
            <label className="inline-check">
              <input type="checkbox" checked={changesOnly} onChange={(e) => setChangesOnly(e.target.checked)} />
              Только изменения (без API GET)
            </label>
          </div>

          {hasActiveFilters && (
            <div className="filter-group filter-actions">
              <label>&nbsp;</label>
              <div className="action-row">
                <button className="reset-filters-btn" onClick={handleResetFilters}>
                  Сбросить
                </button>
                <button className="reset-filters-btn secondary" onClick={handleExportCsv}>
                  CSV
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card"><b>Записей на странице</b><div>{pageStats.total}</div></div>
        <div className="summary-card"><b>Топ действий</b><div>{pageStats.topActions.map(([k, v]) => `${ACTION_LABEL_MAP[k] || k}: ${v}`).join(' | ') || '—'}</div></div>
        <div className="summary-card"><b>Топ сущностей</b><div>{pageStats.topEntities.map(([k, v]) => `${ENTITY_LABEL_MAP[k] || k}: ${v}`).join(' | ') || '—'}</div></div>
        <div className="summary-card"><b>Топ пользователей</b><div>{pageStats.topUsers.map(([k, v]) => `${k}: ${v}`).join(' | ') || '—'}</div></div>
      </div>

      <DataTable data={filteredLogs} columns={columns} loading={loading} emptyMessage="Нет записей в журнале" />

      {totalPages > 1 && (
        <div className="pagination">
          <button onClick={handlePrev} disabled={page === 0 || loading}>
            ← Назад
          </button>
          <span>
            {from}–{to} из {totalElements} (стр. {page + 1} / {totalPages})
          </span>
          <button onClick={handleNext} disabled={page >= totalPages - 1 || loading}>
            Вперёд →
          </button>
        </div>
      )}
    </div>
  )
}
