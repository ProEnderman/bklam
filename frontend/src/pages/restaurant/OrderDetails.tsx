import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { restaurantService } from '../../api/services'
import { splitService } from '../../api/splitService'
import type { Order } from '../../api/types'
import type { OrderSplitDto } from '../../api/qrTypes'
import DataTable from '../../components/DataTable'
import { useOutletContext } from 'react-router-dom'
import type { User } from '../../api/types'
import PaymentQrModal from '../../components/PaymentQrModal'
import PaymentQrMultiModal from '../../components/PaymentQrMultiModal'
import TelegramLinkModal from '../../components/TelegramLinkModal'
import { telegramPaymentService } from '../../api/telegramPaymentService'
import SplitBill from '../../components/SplitBill'
import Modal from '../../components/Modal'
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
  const [paymentRequests, setPaymentRequests] = useState<Array<{ id: string | null; label: string; amount: number; invoiceId?: string }>>([])
  const [creatingPayment, setCreatingPayment] = useState(false)
  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null)
  const [bankBotUsername, setBankBotUsername] = useState('')
  const [savingBot, setSavingBot] = useState(false)
  const [orderSplit, setOrderSplit] = useState<OrderSplitDto | null>(null)
  const [showPaymentModeModal, setShowPaymentModeModal] = useState(false)
  const [showPaymentCustomGroups, setShowPaymentCustomGroups] = useState(false)
  /** Для "объединить доли": accountPayer[accountIdx] = shareIdx — кто оплачивает этот счёт. Один гость может оплатить несколько счетов. */
  const [accountPayer, setAccountPayer] = useState<number[]>([])
  /** Модалка состава счёта: индекс счёта (0..N-1) или null */
  const [viewAccountIndex, setViewAccountIndex] = useState<number | null>(null)
  /** Отметки оплаты по слотам (QR): id запроса -> { paid, paidVia: 'ONLINE' | 'CASH' }. */
  const [paymentMarks, setPaymentMarks] = useState<Record<string, { paid: boolean; paidVia: 'ONLINE' | 'CASH' }>>({})

  const isAdmin = user?.role === 'ADMIN'
  const canEdit = isAdmin || (order?.createdBy === user?.username && order?.status === 'OPEN')

  useEffect(() => {
    if (id) {
      loadOrder()
      checkTelegramStatus()
    }
  }, [id])

  useEffect(() => {
    if (showPaymentModal && order?.id) {
      restaurantService.getOrderPaymentMarks(order.id).then(setPaymentMarks).catch(() => setPaymentMarks({}))
    }
  }, [showPaymentModal, order?.id])

  const handleMarkPaid = async (
    paymentRequestId: string,
    paid: boolean,
    paidVia?: 'ONLINE' | 'CASH',
  ) => {
    if (!order?.id) return
    try {
      await restaurantService.setOrderPaymentMark(order.id, paymentRequestId, paid, paidVia)
      setPaymentMarks(prev => ({
        ...prev,
        [paymentRequestId]: { paid, paidVia: paid ? (paidVia ?? 'ONLINE') : 'ONLINE' },
      }))
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Не удалось обновить отметку')
    }
  }

  /** Только создание запроса в бот / ожидание QR; отметка «оплачено» — отдельной кнопкой после QR. */
  const handlePayOnlineStart = async (slotIndex: number) => {
    if (!order?.id) return
    const slot = paymentRequests[slotIndex]
    if (!slot) return
    const stableKey = slot.invoiceId ?? `order_${order.id}_pay_${slotIndex}`
    setCreatingPayment(true)
    try {
      const pr = await telegramPaymentService.createPaymentRequest(stableKey, slot.amount, slot.label)
      setPaymentRequests(prev => {
        const next = [...prev]
        if (next[slotIndex]) {
          next[slotIndex] = { ...next[slotIndex], id: pr.id, invoiceId: stableKey }
        }
        return next
      })
    } catch (e: any) {
      let msg = e?.response?.data?.message || 'Не удалось создать запрос оплаты'
      if (e?.response?.status === 429 || msg.includes('FLOOD') || msg.includes('rate limit')) {
        const waitMatch = msg.match(/(\d+)/)?.[1] || '60'
        msg = `⏳ Telegram ограничил запросы. Подождите ${waitMatch} сек.`
      } else if (e?.response?.status === 401 || msg.includes('expired')) {
        msg = '🔑 Сессия Telegram истекла.'
        setShowTelegramLinkModal(true)
      }
      if (msg.includes('Telegram session') || msg.includes('link your Telegram')) setShowTelegramLinkModal(true)
      else alert(msg)
    } finally {
      setCreatingPayment(false)
    }
  }

  /** Мульти-счета: отметка в БД; онлайн — только если уже есть payment request id (после QR). */
  const handleMultiMarkPaid = async (
    slotIndex: number,
    paymentRequestId: string | null,
    paid: boolean,
    paidVia?: 'ONLINE' | 'CASH',
  ) => {
    if (!order?.id) return
    const slot = paymentRequests[slotIndex]
    if (!slot) return

    const stableKey = slot.invoiceId ?? `order_${order.id}_pay_${slotIndex}`
    const via = paidVia ?? 'ONLINE'

    const telegramId: string | null = paymentRequestId
    if (paid && via !== 'CASH' && telegramId == null) {
      alert('Сначала нажмите «Оплатить онлайн» и дождитесь QR, затем «Оплачено (онлайн)».')
      return
    }

    setCreatingPayment(true)
    try {
      await restaurantService.setOrderPaymentMark(
        order.id,
        stableKey,
        paid,
        paid ? via : 'ONLINE',
        paid && via !== 'CASH' && telegramId ? telegramId : undefined,
      )
      setPaymentMarks(prev => ({
        ...prev,
        [stableKey]: {
          paid,
          paidVia: paid ? via : 'ONLINE',
          ...(paid && via !== 'CASH' && telegramId ? { telegramPaymentRequestId: telegramId } : {}),
        },
      }))
    } catch (e: any) {
      let msg = e?.response?.data?.message || 'Не удалось обновить'
      if (e?.response?.status === 429 || msg.includes('FLOOD') || msg.includes('rate limit')) {
        const waitMatch = msg.match(/(\d+)/)?.[1] || '60'
        msg = `⏳ Telegram ограничил запросы. Подождите ${waitMatch} сек.`
      }
      alert(msg)
    } finally {
      setCreatingPayment(false)
    }
  }

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
      if (data.items) {
        data.items.forEach((item, index) => {
          console.log(`Item ${index}:`, item, 'comment:', item.comment)
        })
      }
      setOrder(data)
      if (data.status === 'CLOSED') {
        try {
          const split = await splitService.getSplit(data.id)
          setOrderSplit(split)
          if (split) {
            const saved = data.paymentAccountPayer
            if (saved && saved.length === split.shares.length) {
              setAccountPayer(saved)
            } else {
              setAccountPayer(split.shares.map((_, i) => i))
            }
          }
        } catch {
          setOrderSplit(null)
        }
      } else {
        setOrderSplit(null)
      }
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

  const runCreatePaymentRequests = async (requests: Array<{ amount: number; label: string }>) => {
    if (!order) return
    setCreatingPayment(true)
    try {
      if (requests.length === 1 && requests[0].amount <= 0) {
        const pr = await telegramPaymentService.createPaymentRequest(`order_${order.id}`)
        setPaymentRequestId(pr.id)
        setPaymentRequests([])
        setShowPaymentModal(true)
      } else {
        const list: Array<{ id: string; label: string; amount: number; invoiceId: string }> = []
        for (const r of requests) {
          const invoiceId = requests.length === 1 ? `order_${order.id}` : `order_${order.id}_pay_${list.length}`
          const pr = await telegramPaymentService.createPaymentRequest(invoiceId, r.amount, r.label)
          list.push({ id: pr.id, label: r.label, amount: r.amount, invoiceId })
        }
        setPaymentRequestId(null)
        setPaymentRequests(list)
        setShowPaymentModal(true)
      }
    } catch (error: any) {
      let message = error.response?.data?.message || 'Не удалось создать запрос на оплату'
      if (error.response?.status === 429 || message.includes('FLOOD') || message.includes('rate limit')) {
        const waitMatch = message.match(/(\d+)/)?.[1] || '60'
        message = `⏳ Telegram временно ограничил запросы. Подождите ${waitMatch} сек.`
      } else if (error.response?.status === 401 || message.includes('expired')) {
        message = '🔑 Сессия Telegram истекла.'
        setShowTelegramLinkModal(true)
      }
      if (message.includes('Telegram session') || message.includes('link your Telegram')) setShowTelegramLinkModal(true)
      else alert(message)
    } finally {
      setCreatingPayment(false)
    }
  }

  const handleCreatePaymentLink = async () => {
    if (!order) return
    if (!telegramLinked) {
      setShowTelegramLinkModal(true)
      return
    }
    if (!bankBotUsername.trim()) {
      alert('Укажите username получателя (бот или пользователь Telegram)')
      return
    }
    try {
      await telegramPaymentService.updateSettings(bankBotUsername.trim())
    } catch {
      // ignore
    }

    if (orderSplit && orderSplit.shares.length > 0) {
      setShowPaymentModeModal(true)
      return
    }
    await runCreatePaymentRequests([{ amount: -1, label: '' }])
  }

  const handlePaymentModeFull = async () => {
    setShowPaymentModeModal(false)
    setShowPaymentCustomGroups(false)
    await runCreatePaymentRequests([{ amount: -1, label: '' }])
  }

  const handlePaymentModeByShare = async () => {
    if (!order || !orderSplit) return
    setShowPaymentModeModal(false)
    setShowPaymentCustomGroups(false)
    const identity = orderSplit.shares.map((_, i) => i)
    try {
      await restaurantService.updateOrderPaymentAccountPayer(order.id, identity)
      setAccountPayer(identity)
      setOrder(prev => (prev ? { ...prev, paymentAccountPayer: identity } : prev))
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Не удалось сохранить раскладку оплаты')
      return
    }
    let marks: Awaited<ReturnType<typeof restaurantService.getOrderPaymentMarks>> = {}
    try {
      marks = await restaurantService.getOrderPaymentMarks(order.id)
    } catch {
      marks = {}
    }
    const draftSlots = orderSplit.shares.map((sh, i) => {
      const invoiceId = `order_${order.id}_pay_${i}`
      const m = marks[invoiceId]
      return {
        id: m?.telegramPaymentRequestId ?? null,
        label: `Заказ ${order.id} - ${sh.name}`,
        amount: Number(sh.shareTotal),
        invoiceId,
      }
    })
    setPaymentRequests(draftSlots)
    setShowPaymentModal(true)
  }

  const handlePaymentModeCustom = () => {
    setShowPaymentCustomGroups(true)
  }

  const handlePaymentCustomConfirm = async () => {
    if (!order || !orderSplit) return
    const layout = accountPayer.length ? accountPayer : orderSplit.shares.map((_, i) => i)
    try {
      await restaurantService.updateOrderPaymentAccountPayer(order.id, layout)
      setOrder(prev => (prev ? { ...prev, paymentAccountPayer: layout } : prev))
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Не удалось сохранить раскладку оплаты')
      return
    }
    let marks: Awaited<ReturnType<typeof restaurantService.getOrderPaymentMarks>> = {}
    try {
      marks = await restaurantService.getOrderPaymentMarks(order.id)
    } catch {
      marks = {}
    }
    const payers = [...new Set(layout)]
    const draftSlots = payers.map((shareIdx, i) => {
      const accountsPaidByThisGuest = orderSplit.shares
        .map((_, accIdx) => accIdx)
        .filter(accIdx => (layout[accIdx] ?? accIdx) === shareIdx)
      const amount = accountsPaidByThisGuest.reduce((sum, accIdx) => sum + Number(orderSplit.shares[accIdx].shareTotal), 0)
      const guestName = orderSplit.shares[shareIdx].name
      const billLabels = accountsPaidByThisGuest.map(a => `Счёт ${a + 1}`).join(', ')
      const invoiceId = `order_${order.id}_pay_${i}`
      const m = marks[invoiceId]
      return {
        id: m?.telegramPaymentRequestId ?? null,
        label: `Заказ ${order.id} - ${guestName} (${billLabels})`,
        amount,
        invoiceId,
      }
    })
    setShowPaymentModeModal(false)
    setShowPaymentCustomGroups(false)
    setPaymentRequests(draftSlots)
    setShowPaymentModal(true)
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
          {item.modifiers && item.modifiers.length > 0 && (
            <div style={{ fontSize: '12px', color: '#667eea', marginTop: '3px' }}>
              {item.modifiers.map((m: any, i: number) => (
                <span key={i} style={{ display: 'inline-block', background: '#f0f0ff', padding: '1px 5px', borderRadius: 3, marginRight: 4, marginBottom: 2 }}>
                  {m.groupTitle}: {m.optionTitle}{m.priceDelta > 0 ? ` +${m.priceDelta.toFixed(2)}` : ''}{m.qty > 1 ? ` x${m.qty}` : ''}
                </span>
              ))}
            </div>
          )}
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
          {order.hallName && (
            <div className="info-row">
              <span className="info-label">Зал:</span>
              <span>{order.hallName}</span>
            </div>
          )}
        </div>
      </div>

      <div className="order-items-section">
        <h2>Order Items</h2>
        <DataTable data={order.items} columns={columns} />
      </div>

      <div className="order-split-section">
        <SplitBill orderId={order.id} orderStatus={order.status} items={order.items} />
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
          markedPaid={paymentMarks[paymentRequestId]?.paid}
          onMarkPaid={(paid) => handleMarkPaid(paymentRequestId, paid)}
        />
      )}

      {showPaymentModal && paymentRequests.length > 0 && (
        <PaymentQrMultiModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false)
            setPaymentRequests([])
          }}
          orderId={order.id}
          requests={paymentRequests}
          paymentMarks={paymentMarks}
          onPayOnline={handlePayOnlineStart}
          payOnlineBusy={creatingPayment}
          onMarkPaid={handleMultiMarkPaid}
        />
      )}

      {showPaymentModeModal && order && orderSplit && (
        <Modal
          isOpen={showPaymentModeModal}
          onClose={() => { setShowPaymentModeModal(false); setShowPaymentCustomGroups(false); setViewAccountIndex(null) }}
          title="Способ оплаты"
        >
          <div className="payment-mode-modal">
            {!showPaymentCustomGroups ? (
              <>
                <p className="payment-mode-hint">Выберите, как сформировать ссылки на оплату:</p>
                <div className="payment-mode-buttons">
                  <button type="button" className="btn-primary payment-mode-btn" onClick={handlePaymentModeFull}>
                    Один счёт (вся сумма)
                  </button>
                  <button type="button" className="btn-primary payment-mode-btn" onClick={handlePaymentModeByShare}>
                    По долям (отдельный QR на каждого гостя)
                  </button>
                  <button type="button" className="btn-secondary payment-mode-btn" onClick={handlePaymentModeCustom}>
                    Объединить доли (несколько счетов по выбору)
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="payment-mode-hint">Для каждого счёта выберите, кто его оплачивает. Один человек может оплатить несколько счетов. Нажмите на счёт, чтобы посмотреть состав.</p>
                {orderSplit.shares.map((_, accountIdx) => {
                  const payerIdx = accountPayer[accountIdx] ?? accountIdx
                  const accountTotal = Number(orderSplit.shares[accountIdx].shareTotal)
                  const payerName = orderSplit.shares[payerIdx].name
                  return (
                    <div key={accountIdx} className="payment-custom-row payment-account-row">
                      <button
                        type="button"
                        className="payment-account-label"
                        onClick={() => setViewAccountIndex(accountIdx)}
                        title="Посмотреть состав счёта"
                      >
                        Счёт {accountIdx + 1}
                        <span className="payment-account-meta">
                          {' '}
                          — {accountTotal.toFixed(2)} ₽, оплачивает: {payerName}
                        </span>
                      </button>
                      <div className="payment-account-guests">
                        <label className="payment-account-who">Кто оплачивает:</label>
                        <select
                          value={payerIdx}
                          onChange={e => {
                            const next = [...(accountPayer.length ? accountPayer : orderSplit.shares.map((_, i) => i))]
                            next[accountIdx] = parseInt(e.target.value, 10)
                            setAccountPayer(next)
                          }}
                          className="payment-account-select"
                        >
                          {orderSplit.shares.map((share, shareIdx) => (
                            <option key={share.shareId} value={shareIdx}>{share.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )
                })}
                <div className="payment-mode-buttons">
                  <button type="button" className="btn-primary" onClick={handlePaymentCustomConfirm}>
                    Сформировать ссылки
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setShowPaymentCustomGroups(false)}>
                    Назад
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {viewAccountIndex !== null && orderSplit && orderSplit.shares[viewAccountIndex] && (
        <Modal
          isOpen={true}
          onClose={() => setViewAccountIndex(null)}
          title={`Состав счёта ${viewAccountIndex + 1} (${orderSplit.shares[viewAccountIndex].name})`}
        >
          <div className="payment-account-items-modal">
            {orderSplit.shares[viewAccountIndex].items.map((item, i) => (
              <div key={i} className="payment-account-item-line">
                <span>{item.dishName} x{item.qty}</span>
                <span>{Number(item.lineTotal).toFixed(2)} ₽</span>
              </div>
            ))}
            <div className="payment-account-items-total">
              Итого: {Number(orderSplit.shares[viewAccountIndex].shareTotal).toFixed(2)} ₽
            </div>
          </div>
        </Modal>
      )}

      <TelegramLinkModal
        isOpen={showTelegramLinkModal}
        onClose={() => setShowTelegramLinkModal(false)}
        onSuccess={handleTelegramLinkSuccess}
      />
    </div>
  )
}
