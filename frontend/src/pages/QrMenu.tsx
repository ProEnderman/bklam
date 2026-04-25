import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { qrService, type MenuResult } from '../api/qrService'
import { categoryService, restaurantService } from '../api/services'
import type { QrMenuCategory, QrOrder, QrMenuItem, OptionSelection } from '../api/qrTypes'
import { getGuestSession, setGuestSession } from '../utils/qrSession'
import DishOptionsModal from '../components/DishOptionsModal'
import './QrMenu.css'

type Tab = 'menu' | 'cart'

export default function QrMenu() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const isPreview = !token

  const [tab, setTab] = useState<Tab>('menu')
  const [menu, setMenu] = useState<QrMenuCategory[]>([])
  const [order, setOrder] = useState<QrOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rateLimited, setRateLimited] = useState(false)
  const [sessionReady, setSessionReady] = useState(!!getGuestSession())
  const [tableIdInput, setTableIdInput] = useState('')
  const [creatingSession, setCreatingSession] = useState(false)
  const [cartQty, setCartQty] = useState<Record<number, number>>({})
  const [selectedDish, setSelectedDish] = useState<QrMenuItem | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval>>()

  // ── Load menu (public via token OR staff preview via auth API) ──
  const loadMenu = useCallback(async () => {
    try {
      if (isPreview) {
        const cats = await categoryService.getCategories()
        const result: QrMenuCategory[] = []
        for (const cat of cats) {
          const dishes = await restaurantService.getDishesByCategory(cat.id)
          result.push({
            id: cat.id,
            name: cat.name,
            imageUrl: cat.imageUrl,
            dishes: dishes.filter(d => d.isActive).map(d => ({
              id: d.id,
              name: d.name,
              price: d.price,
              imageUrl: d.imageUrl,
            })),
          })
        }
        setMenu(result.filter(c => c.dishes.length > 0))
      } else {
        const result: MenuResult = await qrService.getMenu(token)
        if (!result.notModified && result.data) {
          setMenu(result.data)
        }
      }
      setError('')
      setRateLimited(false)
    } catch (err: any) {
      if (err.response?.status === 401) setError('Неверный или просроченный QR-токен')
      else if (err.response?.status === 429) setRateLimited(true)
      else setError('Не удалось загрузить меню')
    } finally {
      setLoading(false)
    }
  }, [token, isPreview])

  // ── Load current order (only in real QR mode) ──
  const loadOrder = useCallback(async () => {
    if (isPreview || !getGuestSession()) return
    try {
      const o = await qrService.getCurrentOrder()
      setOrder(o)
    } catch (err: any) {
      if (err.response?.status === 429) setRateLimited(true)
    }
  }, [isPreview])

  useEffect(() => { loadMenu() }, [loadMenu])
  useEffect(() => { if (sessionReady) loadOrder() }, [sessionReady, loadOrder])

  useEffect(() => {
    if (!order) { setCartQty({}); return }
    const map: Record<number, number> = {}
    order.items.forEach(i => { map[i.dishId] = (map[i.dishId] || 0) + i.qty })
    setCartQty(map)
  }, [order])

  // ── Poll menu ETag every 45s (real mode only) ──
  useEffect(() => {
    if (isPreview) return
    pollRef.current = setInterval(() => {
      if (document.visibilityState === 'visible' && !rateLimited) loadMenu()
    }, 45_000)
    return () => clearInterval(pollRef.current)
  }, [loadMenu, rateLimited, isPreview])

  // ── Session creation ──
  const handleCreateSession = async () => {
    const tid = parseInt(tableIdInput)
    if (!tid || tid <= 0) return
    setCreatingSession(true)
    setError('')
    try {
      const resp = await qrService.createSession({ token, tableId: tid })
      setGuestSession(resp.sessionToken)
      setSessionReady(true)
    } catch (err: any) {
      if (err.response?.status === 401) setError('Неверный или просроченный QR-токен')
      else if (err.response?.status === 403) setError('Стол не принадлежит этому ресторану')
      else setError('Не удалось начать сессию')
    } finally {
      setCreatingSession(false)
    }
  }

  // ── Order actions (real mode only) ──
  const ensureOrder = useCallback(async (): Promise<QrOrder | null> => {
    if (order) return order
    try {
      const o = await qrService.createOrder()
      setOrder(o)
      return o
    } catch (err: any) {
      if (err.response?.status === 429) setRateLimited(true)
      else setError('Не удалось создать заказ')
      return null
    }
  }, [order])

  const handleDishClick = (dish: QrMenuItem) => {
    if (isPreview) return
    if (!sessionReady) { setTab('cart'); return }
    if (dish.optionGroups && dish.optionGroups.length > 0) {
      setSelectedDish(dish)
    } else {
      handleAddSimple(dish.id)
    }
  }

  const handleAddSimple = async (dishId: number) => {
    setError('')
    try {
      const o = await ensureOrder()
      if (!o) return
      const updated = await qrService.addItem(o.id, { dishId, qty: 1 })
      setOrder(updated)
    } catch (err: any) {
      if (err.response?.status === 429) setRateLimited(true)
      else if (err.response?.status === 400) setError(err.response?.data?.error || 'Ошибка валидации')
      else if (err.response?.status === 404) setError('Блюдо недоступно')
      else setError('Не удалось добавить')
    }
  }

  const handleAddWithOptions = async (dishId: number, qty: number, selections: OptionSelection[]) => {
    setSelectedDish(null)
    setError('')
    try {
      const o = await ensureOrder()
      if (!o) return
      const updated = await qrService.addItem(o.id, { dishId, qty, selections: selections.length > 0 ? selections : undefined })
      setOrder(updated)
    } catch (err: any) {
      if (err.response?.status === 429) setRateLimited(true)
      else if (err.response?.status === 400) setError(err.response?.data?.error || 'Ошибка валидации')
      else setError('Не удалось добавить')
    }
  }

  const handleRemove = async (itemId: number) => {
    if (!order) return
    try {
      const updated = await qrService.removeItem(order.id, itemId)
      setOrder(updated)
    } catch (err: any) {
      if (err.response?.status === 429) setRateLimited(true)
      else setError('Не удалось удалить')
    }
  }

  const cartCount = order?.items.reduce((s, i) => s + i.qty, 0) || 0

  return (
    <div className="qr-page">
      {isPreview && (
        <div className="qr-preview-banner">Превью QR-меню — так гости видят ваше меню</div>
      )}
      <div className="qr-header"><h1>Меню</h1></div>

      {error && <div className="qr-error">{error}</div>}
      {rateLimited && <div className="qr-rate-limit">Слишком много запросов. Подождите.</div>}

      {!isPreview && (
        <div className="qr-tabs">
          <button className={`qr-tab ${tab === 'menu' ? 'active' : ''}`} onClick={() => setTab('menu')}>
            Меню
          </button>
          <button className={`qr-tab ${tab === 'cart' ? 'active' : ''}`} onClick={() => setTab('cart')}>
            Корзина {cartCount > 0 && <span className="qr-cart-badge">{cartCount}</span>}
          </button>
        </div>
      )}

      {/* ── Session gate (real mode) ── */}
      {!isPreview && !sessionReady && tab === 'cart' && (
        <div className="qr-session-setup">
          <p>Введите номер стола, чтобы начать заказ</p>
          <input
            type="number"
            placeholder="Номер стола"
            value={tableIdInput}
            onChange={e => setTableIdInput(e.target.value)}
            min={1}
          />
          <button onClick={handleCreateSession} disabled={creatingSession || !tableIdInput}>
            {creatingSession ? 'Подключение...' : 'Начать сессию'}
          </button>
        </div>
      )}

      {/* ── Menu tab ── */}
      {(tab === 'menu' || isPreview) && (
        loading ? <div className="qr-loading">Загрузка меню...</div> : (
          menu.length === 0 ? (
            <div className="qr-loading">Меню пока пустое</div>
          ) : (
            menu.map(cat => (
              <div key={cat.id ?? 'other'} className="qr-category">
                <h2>{cat.name}</h2>
                {cat.dishes.map(dish => (
                  <div key={dish.id} className="qr-dish">
                    {dish.imageUrl
                      ? <img className="qr-dish-img" src={dish.imageUrl} alt={dish.name} />
                      : <div className="qr-dish-img" />}
                    <div className="qr-dish-info">
                      <div className="qr-dish-name">{dish.name}</div>
                      <div className="qr-dish-price">{dish.price.toFixed(2)}</div>
                    </div>
                    {!isPreview && (
                      <div className="qr-dish-add">
                        {cartQty[dish.id] > 0 && (
                          <span className="qr-qty-display">{cartQty[dish.id]}</span>
                        )}
                        <button className="add-btn" onClick={() => handleDishClick(dish)}>+</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )
        )
      )}

      {/* ── Cart tab (real mode only) ── */}
      {!isPreview && tab === 'cart' && sessionReady && (
        !order || order.items.length === 0 ? (
          <div className="qr-cart-empty">Корзина пуста. Добавьте блюда из меню.</div>
        ) : (
          <>
            {order.items.map(item => (
              <div key={item.id} className="qr-cart-item">
                <div className="qr-cart-item-info">
                  <div className="qr-cart-item-name">{item.dishName}</div>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="qr-cart-item-mods">
                      {item.modifiers.map((m, i) => (
                        <span key={i} className="qr-cart-mod">
                          {m.groupTitle}: {m.optionTitle}{m.priceDelta > 0 ? ` +${m.priceDelta.toFixed(2)}` : ''}{m.qty > 1 ? ` x${m.qty}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="qr-cart-item-meta">{item.qty} x {item.priceAtTime.toFixed(2)} = {item.lineTotal.toFixed(2)}</div>
                </div>
                <button className="qr-cart-item-remove" onClick={() => handleRemove(item.id)}>×</button>
              </div>
            ))}
            <div className="qr-cart-total">
              <span>Итого</span>
              <span>{order.totalAmount.toFixed(2)}</span>
            </div>
          </>
        )
      )}

      {selectedDish && (
        <DishOptionsModal
          dish={selectedDish}
          onAdd={handleAddWithOptions}
          onClose={() => setSelectedDish(null)}
        />
      )}
    </div>
  )
}
