import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { restaurantService } from '../../api/services'
import { retryOnRateLimit } from '../../utils/apiRetry'
import type { Order, Dish } from '../../api/types'
import DataTable from '../../components/DataTable'
import { useOutletContext } from 'react-router-dom'
import type { User } from '../../api/types'
import './OrdersHistory.css'

export default function OrdersHistory() {
  const { user } = useOutletContext<{ user?: User }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [onlyMyOrders, setOnlyMyOrders] = useState(
    user?.role === 'REGULAR_WORKER' ? true : false
  )
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dishFilter, setDishFilter] = useState('')
  const [dishes, setDishes] = useState<Dish[]>([])
  const isAdmin = user?.role === 'ADMIN'
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize] = useState(50)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)
  const [pageInputValue, setPageInputValue] = useState('1')
  const [filterTable, setFilterTable] = useState('')
  const [filterHall, setFilterHall] = useState('')
  const [filterClient, setFilterClient] = useState('')

  const [unpaidModal, setUnpaidModal] = useState<{ orderId: number } | null>(null)
  const [unpaidReasonType, setUnpaidReasonType] = useState<'default' | 'custom'>('default')
  const [unpaidCustomReason, setUnpaidCustomReason] = useState('')

  useEffect(() => {
    loadDishes()
  }, [])

  useEffect(() => {
    loadOrders(0, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, onlyMyOrders, dateFrom, dateTo, dishFilter])

  const loadDishes = async () => {
    try {
      const data = await restaurantService.getDishes(undefined, true)
      setDishes(data)
    } catch (error) {
      console.error('Failed to load dishes:', error)
    }
  }

  const loadOrders = async (pageToLoad: number, isBackground = false) => {
    if (!isBackground) {
      setLoading(true)
    }
    try {
      const filters: any = {
        page: pageToLoad,
        size: pageSize,
      }
      if (statusFilter) filters.status = statusFilter
      if (dateFrom) filters.from = dateFrom
      if (dateTo) filters.to = dateTo
      if (onlyMyOrders && user?.role === 'REGULAR_WORKER') filters.onlyMyOrders = true
      if (dishFilter) filters.dishId = parseInt(dishFilter)

      const data = await retryOnRateLimit(
        () => restaurantService.getOrders(filters),
        1,
        200
      )
      const pageData = data && typeof data === 'object' && 'content' in data
        ? (data as { content: Order[]; totalElements: number; totalPages: number; number: number; size: number })
        : null
      let ordersArray = pageData ? pageData.content : []
      // Порядок задаётся сервером (SQL ORDER BY + LIMIT/OFFSET); клиентская пересортировка ломает пагинацию
      setOrders(ordersArray)
      if (pageData) {
        setTotalPages(pageData.totalPages)
        setTotalElements(pageData.totalElements)
        setPage(pageData.number)
        setPageInputValue(String(pageData.number + 1))
      }
      console.log(`[OrdersHistory] page ${pageToLoad} loaded, ${ordersArray.length} items, total ${pageData?.totalElements ?? 0}`)
    } catch (error) {
      console.error('Failed to load orders:', error)
      if (!isBackground) {
        setOrders([])
        setTotalPages(0)
        setTotalElements(0)
      }
    } finally {
      if (!isBackground) {
        setLoading(false)
      }
    }
  }

  const uniqueTables = useMemo(() => {
    const set = new Set<string>()
    orders.forEach(o => { if (o.tableLabel) set.add(o.tableLabel) })
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [orders])

  const uniqueHalls = useMemo(() => {
    const set = new Set<string>()
    orders.forEach(o => { if (o.hallName) set.add(o.hallName) })
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [orders])

  const uniqueClients = useMemo(() => {
    const set = new Set<string>()
    orders.forEach(o => { if (o.guestLabel) set.add(o.guestLabel) })
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [orders])

  const displayOrders = useMemo(() => {
    const hasFilter = filterTable || filterHall || filterClient
    if (!hasFilter) return orders
    return orders.filter(o => {
      if (filterTable && (o.tableLabel ?? '') !== filterTable) return false
      if (filterHall && (o.hallName ?? '') !== filterHall) return false
      if (filterClient && (o.guestLabel ?? '') !== filterClient) return false
      return true
    })
  }, [orders, filterTable, filterHall, filterClient])

  const getStatusBadge = (status: string) => {
    const classes = {
      OPEN: 'status-open',
      CLOSED: 'status-closed',
      CANCELED: 'status-canceled',
    }
    return <span className={`status-badge ${classes[status as keyof typeof classes] || ''}`}>{status}</span>
  }

  const handleDelete = async (order: Order) => {
    if (order.status === 'CLOSED') {
      alert('Cannot delete closed order')
      return
    }
    
    if (!confirm(`Are you sure you want to delete order #${order.id}? This action cannot be undone.`)) {
      return
    }

    try {
      await restaurantService.deleteOrder(order.id)
      setTimeout(() => {
        loadOrders(page, false)
      }, 100)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete order')
    }
  }

  const handleMarkPaid = async (orderId: number) => {
    try {
      await restaurantService.markOrderPaid(orderId)
      loadOrders(page, true)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось отметить оплату')
    }
  }

  const handleOpenUnpaidModal = (orderId: number) => {
    setUnpaidReasonType('default')
    setUnpaidCustomReason('')
    setUnpaidModal({ orderId })
  }

  const handleConfirmUnpaid = async () => {
    if (!unpaidModal) return
    const reason = unpaidReasonType === 'custom' ? unpaidCustomReason.trim() : 'Не прошла оплата'
    if (!reason) {
      alert('Укажите причину')
      return
    }
    try {
      await restaurantService.markOrderUnpaid(unpaidModal.orderId, reason)
      setUnpaidModal(null)
      loadOrders(page, true)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось снять оплату')
    }
  }

  const columns = [
    {
      key: 'id',
      header: 'ID',
      render: (item: Order) => `#${item.id}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Order) => getStatusBadge(item.status),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (item: Order) => new Date(item.createdAt).toLocaleString(),
    },
    {
      key: 'closedAt',
      header: 'Closed',
      render: (item: Order) =>
        item.closedAt ? new Date(item.closedAt).toLocaleString() : '-',
    },
    {
      key: 'totalAmount',
      header: 'Total',
      render: (item: Order) => `$${item.totalAmount.toFixed(2)}`,
    },
    {
      key: 'name',
      header: 'Name',
      render: (item: Order) => item.name || '-',
    },
    {
      key: 'hall',
      header: 'Зал / стол',
      render: (item: Order) => {
        const hall = item.hallName?.trim()
        const table = item.tableLabel?.trim()
        if (!hall && !table) return '—'
        if (hall && table) return `${hall} · стол ${table}`
        if (table) return `Стол ${table}`
        return hall
      },
    },
    {
      key: 'client',
      header: 'Клиент',
      render: (item: Order) => item.guestLabel || '—',
    },
    {
      key: 'paid',
      header: 'Оплата',
      render: (item: Order) => {
        const isPaid = !!item.paidAt || (!!item.hasSplit && !!item.allPaymentSlotsPaid)
        return isPaid ? (
          <span className="paid-badge">✅ Оплачено</span>
        ) : (
          <span className="unpaid-badge">Не оплачено</span>
        )
      },
    },
    {
      key: 'createdBy',
      header: 'Created By',
      render: (item: Order) => item.createdBy || '-',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: Order) => (
        <div className="action-buttons">
          <button
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/orders/${item.id}`)
            }}
            className="btn-small btn-primary"
          >
            Open
          </button>
          {item.status !== 'CANCELED' && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              const isPaid = !!item.paidAt || (!!item.hasSplit && !!item.allPaymentSlotsPaid)
              if (isPaid) {
                handleOpenUnpaidModal(item.id)
              } else {
                handleMarkPaid(item.id)
              }
            }}
            className={`btn-small ${!!item.paidAt || (!!item.hasSplit && !!item.allPaymentSlotsPaid) ? 'btn-warning' : 'btn-success'}`}
          >
            {!!item.paidAt || (!!item.hasSplit && !!item.allPaymentSlotsPaid) ? 'Снять оплату' : 'Оплачено'}
          </button>
          )}
          {isAdmin && item.status !== 'CLOSED' && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleDelete(item)
              }}
              className="btn-small btn-danger"
            >
              Delete
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="orders-history-page">
      <div className="page-header">
        <h1>Orders History</h1>
        <button className="btn-primary" onClick={() => navigate('/orders/new')}>
          New Order
        </button>
      </div>

      <div className="filters">
        <div className="filter-group">
          <label>Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              if (e.target.value) {
                setSearchParams({ status: e.target.value })
              } else {
                setSearchParams({})
              }
            }}
            className="filter-select"
          >
            <option value="">All</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="CANCELED">Canceled</option>
          </select>
        </div>

        <div className="filter-group">
          <label>From:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label>To:</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label>Dish:</label>
          <select
            value={dishFilter}
            onChange={(e) => setDishFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All dishes</option>
            {dishes.map((dish) => (
              <option key={dish.id} value={dish.id.toString()}>
                {dish.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Столик:</label>
          <select
            value={filterTable}
            onChange={(e) => setFilterTable(e.target.value)}
            className="filter-select"
          >
            <option value="">Все столики</option>
            {uniqueTables.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Зал:</label>
          <select
            value={filterHall}
            onChange={(e) => setFilterHall(e.target.value)}
            className="filter-select"
          >
            <option value="">Все залы</option>
            {uniqueHalls.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Клиент:</label>
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            className="filter-select"
          >
            <option value="">Все клиенты</option>
            {uniqueClients.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {user?.role === 'REGULAR_WORKER' && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={onlyMyOrders}
              onChange={(e) => setOnlyMyOrders(e.target.checked)}
            />
            Only my orders
          </label>
        )}
      </div>

      <DataTable
        data={displayOrders}
        columns={columns}
        loading={loading}
        emptyMessage="No orders found"
        onRowClick={(order) => navigate(`/orders/${order.id}`)}
      />
      {totalPages > 1 && (
        <div className="pagination" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={page <= 0 || loading}
            onClick={() => loadOrders(page - 1, false)}
            className="btn-small"
          >
            ← Пред.
          </button>
          <span style={{ fontSize: '13px', color: '#6b7280' }}>Страница</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={pageInputValue}
            onChange={(e) => setPageInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = parseInt(pageInputValue, 10)
                if (!Number.isNaN(v) && v >= 1 && v <= totalPages) loadOrders(v - 1, false)
                else setPageInputValue(String(page + 1))
              }
            }}
            onBlur={() => {
              const v = parseInt(pageInputValue, 10)
              if (!Number.isNaN(v) && v >= 1 && v <= totalPages) loadOrders(v - 1, false)
              setPageInputValue(String(page + 1))
            }}
            style={{ width: 52, padding: '4px 6px', fontSize: '13px' }}
            disabled={loading}
          />
          <span style={{ fontSize: '13px', color: '#6b7280' }}>
            из {totalPages}
            {totalElements > 0 && ` · всего ${totalElements} заказов`}
          </span>
          <button
            type="button"
            className="btn-small"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => loadOrders(page + 1, false)}
          >
            След. →
          </button>
        </div>
      )}

      {unpaidModal && (
        <div className="modal-overlay" onClick={() => setUnpaidModal(null)}>
          <div className="modal-content unpaid-reason-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Причина снятия оплаты</h3>
            <div className="unpaid-reason-options">
              <label className="radio-label">
                <input
                  type="radio"
                  name="unpaidReason"
                  checked={unpaidReasonType === 'default'}
                  onChange={() => setUnpaidReasonType('default')}
                />
                Не прошла оплата
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="unpaidReason"
                  checked={unpaidReasonType === 'custom'}
                  onChange={() => setUnpaidReasonType('custom')}
                />
                Свой вариант
              </label>
              {unpaidReasonType === 'custom' && (
                <input
                  type="text"
                  className="filter-input"
                  value={unpaidCustomReason}
                  onChange={(e) => setUnpaidCustomReason(e.target.value)}
                  placeholder="Введите причину..."
                  autoFocus
                />
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-small btn-danger" onClick={handleConfirmUnpaid}>
                Снять оплату
              </button>
              <button className="btn-small" onClick={() => setUnpaidModal(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
