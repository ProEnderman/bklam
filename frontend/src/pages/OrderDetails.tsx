import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { restaurantService } from '../api/services'
import type { Order } from '../api/types'
import DataTable from '../components/DataTable'
import { useOutletContext } from 'react-router-dom'
import type { User } from '../api/types'
import PaymentQrModal from '../components/PaymentQrModal'
import TelegramLinkModal from '../components/TelegramLinkModal'
import { telegramPaymentService } from '../api/telegramPaymentService'
import './OrderDetails.css'

export default function OrderDetails() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useOutletContext<{ user?: User }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showTelegramLinkModal, setShowTelegramLinkModal] = useState(false)
  const [paymentRequestId, setPaymentRequestId] = useState<string | null>(null)
  const [creatingPayment, setCreatingPayment] = useState(false)
  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null)
  const [bankBotUsername, setBankBotUsername] = useState('')
  const [savingBot, setSavingBot] = useState(false)

  const isAdmin = user?.role === 'ADMIN'
  const canEdit = isAdmin || (order?.createdBy === user?.username && order?.status === 'OPEN')

  useEffect(() => {
    if (id) {
      loadOrder()
      checkTelegramStatus()
    }
  }, [id])

  const checkTelegramStatus = async () => {
    try {
      const status = await telegramPaymentService.getTelegramStatus()
      console.log('📱 Telegram status:', status)
      setTelegramLinked(status.hasActiveSession)
      if (status.bankBotUsername) {
        setBankBotUsername(status.bankBotUsername)
      }
    } catch (error) {
      console.error('Failed to check Telegram status:', error)
    }
  }

  const loadOrder = async () => {
    try {
      const data = await restaurantService.getOrder(parseInt(id!))
      console.log('Loaded order:', data)
      console.log('Order items:', data.items)
      if (data.items) {
        data.items.forEach((item, index) => {
          console.log(`Item ${index}:`, item, 'comment:', item.comment)
        })
      }
      setOrder(data)
    } catch (error) {
      console.error('Failed to load order:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCloseOrder = async () => {
    if (!order) return
    
    if (!order.items || order.items.length === 0) {
      alert('Order is empty')
      return
    }
    
    if (!confirm('Close this order? This will deduct ingredients from stock.')) {
      return
    }

    try {
      await restaurantService.closeOrder(order.id)
      // Перезагружаем заказ, чтобы увидеть обновленный статус
      await loadOrder()
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to close order'
      if (message.includes('Insufficient stock')) {
        alert('Insufficient stock for some ingredients. Check the error details.')
      } else if (message.includes('no recipe')) {
        alert('Some dishes have no recipe. Please add recipes first.')
      } else {
        alert(message)
      }
    }
  }

  const handleDelete = async () => {
    if (!order) return
    
    if (order.status === 'CLOSED') {
      alert('Cannot delete closed order')
      return
    }
    
    if (!confirm(`Are you sure you want to delete order #${order.id}? This action cannot be undone.`)) {
      return
    }

    try {
      await restaurantService.deleteOrder(order.id)
      // Navigate after a short delay to ensure backend processed the deletion
      setTimeout(() => {
        navigate('/orders')
      }, 100)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete order')
    }
  }

  const handleSaveBotUsername = async () => {
    if (!bankBotUsername.trim()) {
      alert('Введите username бота')
      return
    }
    setSavingBot(true)
    try {
      await telegramPaymentService.updateSettings(bankBotUsername.trim())
    } catch (error: any) {
      alert(error.response?.data?.message || 'Ошибка сохранения')
    } finally {
      setSavingBot(false)
    }
  }

  const handleCreatePaymentLink = async () => {
    if (!order) return

    // Проверяем, привязан ли Telegram
    if (!telegramLinked) {
      setShowTelegramLinkModal(true)
      return
    }

    // Проверяем, указан ли bank bot username
    if (!bankBotUsername.trim()) {
      alert('Укажите username получателя (бот или пользователь Telegram)')
      return
    }

    // Сохраняем bank bot username перед отправкой
    try {
      await telegramPaymentService.updateSettings(bankBotUsername.trim())
    } catch {
      // Не критично, продолжаем
    }

    setCreatingPayment(true)
    try {
      const invoiceId = `order_${order.id}`
      
      const paymentRequest = await telegramPaymentService.createPaymentRequest(invoiceId)
      setPaymentRequestId(paymentRequest.id)
      setShowPaymentModal(true)
    } catch (error: any) {
      let message = error.response?.data?.message || 'Не удалось создать запрос на оплату'
      
      // Улучшенные сообщения для известных ошибок
      if (error.response?.status === 429 || message.includes('FLOOD') || message.includes('rate limit')) {
        const waitMatch = message.match(/(\d+)/)?.[1] || '60'
        message = `⏳ Telegram временно ограничил запросы.\nПодождите ${waitMatch} секунд и попробуйте снова.`
      } else if (error.response?.status === 401 || message.includes('expired')) {
        message = '🔑 Сессия Telegram истекла. Переподключите аккаунт.'
        setShowTelegramLinkModal(true)
        console.error('Failed to create payment request:', error)
        return
      }
      
      // Если ошибка связана с отсутствием Telegram сессии, показываем модалку
      if (message.includes('Telegram session') || message.includes('link your Telegram')) {
        setShowTelegramLinkModal(true)
      } else {
        alert(message)
      }
      console.error('Failed to create payment request:', error)
    } finally {
      setCreatingPayment(false)
    }
  }

  const handleTelegramLinkSuccess = async () => {
    setTelegramLinked(true)
    // Перепроверяем статус для уверенности
    await checkTelegramStatus()
    // Не вызываем createPaymentRequest автоматически - пользователь нажмёт кнопку сам
  }

  const getStatusBadge = (status: string) => {
    const classes = {
      OPEN: 'status-open',
      CLOSED: 'status-closed',
      CANCELED: 'status-canceled',
    }
    return <span className={`status-badge ${classes[status as keyof typeof classes] || ''}`}>{status}</span>
  }

  if (loading) return <div>Loading...</div>
  if (!order) return <div>Order not found</div>

  const columns = [
    {
      key: 'dishName',
      header: 'Dish',
      render: (item: any) => (
        <div>
          <div>{item.dishName}</div>
          {item.comment && (
            <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic', marginTop: '4px' }}>
              Комментарий: {item.comment}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Quantity',
    },
    {
      key: 'price',
      header: 'Price',
      render: (item: any) => item.price ? `$${item.price.toFixed(2)}` : '-',
    },
    {
      key: 'lineTotal',
      header: 'Total',
      render: (item: any) => `$${item.lineTotal.toFixed(2)}`,
    },
  ]

  return (
    <div className="order-details-page">
      <div className="page-header">
        <button className="btn-secondary" onClick={() => navigate('/orders')}>
          ← Back to Orders
        </button>
        <h1>Order #{order.id}</h1>
      </div>

      <div className="order-info">
        <div className="info-card">
          <h3>Order Information</h3>
          <div className="info-row">
            <span className="info-label">Status:</span>
            {getStatusBadge(order.status)}
          </div>
          <div className="info-row">
            <span className="info-label">Created:</span>
            <span>{new Date(order.createdAt).toLocaleString()}</span>
          </div>
          {order.closedAt && (
            <div className="info-row">
              <span className="info-label">Closed:</span>
              <span>{new Date(order.closedAt).toLocaleString()}</span>
            </div>
          )}
          <div className="info-row">
            <span className="info-label">Created By:</span>
            <span>{order.createdBy || '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Total Amount:</span>
            <span className="total-amount">${order.totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="order-items-section">
        <h2>Order Items</h2>
        <DataTable data={order.items} columns={columns} />
      </div>

      <div className="order-actions">
        {order.status === 'OPEN' && canEdit && (
          <>
            <button className="btn-primary" onClick={() => navigate(`/orders/new?orderId=${order.id}`)}>
              Edit Order
            </button>
            <button 
              className="btn-success" 
              onClick={handleCloseOrder}
              disabled={!order.items || order.items.length === 0}
            >
              Close Order
            </button>
          </>
        )}
        {order.status === 'CLOSED' && (
          <div className="payment-actions">
            <div className="bot-username-row">
              <label htmlFor="bankBotUsername">Получатель в Telegram:</label>
              <div className="bot-username-input-group">
                <span className="at-sign">@</span>
                <input
                  id="bankBotUsername"
                  type="text"
                  value={bankBotUsername}
                  onChange={(e) => setBankBotUsername(e.target.value.replace(/^@/, ''))}
                  placeholder="username бота или пользователя"
                  className="bot-username-input"
                />
                <button
                  className="btn-small"
                  onClick={handleSaveBotUsername}
                  disabled={savingBot || !bankBotUsername.trim()}
                  title="Сохранить"
                >
                  {savingBot ? '...' : '💾'}
                </button>
              </div>
            </div>
            <div className="payment-buttons-row">
              <button 
                className="btn-primary" 
                onClick={handleCreatePaymentLink}
                disabled={creatingPayment || !bankBotUsername.trim()}
              >
                {creatingPayment ? 'Создание...' : 'Сформировать ссылку оплаты'}
              </button>
              {telegramLinked !== null && (
                <span className={`telegram-status ${telegramLinked ? 'connected' : 'disconnected'}`}>
                  {telegramLinked ? '✅ Telegram подключён' : '⚠️ Telegram не подключён'}
                </span>
              )}
              {telegramLinked && (
                <button 
                  className="btn-link" 
                  onClick={() => setShowTelegramLinkModal(true)}
                >
                  Переподключить
                </button>
              )}
            </div>
          </div>
        )}
        {isAdmin && order.status !== 'CLOSED' && (
          <button className="btn-danger" onClick={handleDelete}>
            Delete Order
          </button>
        )}
      </div>

      {showPaymentModal && paymentRequestId && (
        <PaymentQrModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false)
            setPaymentRequestId(null)
          }}
          paymentRequestId={paymentRequestId}
          orderId={order.id}
        />
      )}

      <TelegramLinkModal
        isOpen={showTelegramLinkModal}
        onClose={() => setShowTelegramLinkModal(false)}
        onSuccess={handleTelegramLinkSuccess}
      />
    </div>
  )
}
