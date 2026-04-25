import { useState, useEffect, useCallback } from 'react'
import { telegramShopService } from '../api/telegramShopService'
import type { QrMenuCategory, QrOrder, QrMenuItem, OptionSelection } from '../api/qrTypes'
import DishOptionsModal from '../components/DishOptionsModal'
import './TelegramShop.css'

type Tab = 'menu' | 'cart'

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string
        initDataUnsafe?: {
          user?: { id?: number; first_name?: string; last_name?: string; username?: string }
          start_param?: string
        }
        ready: () => void
        expand: () => void
      }
    }
  }
}

export default function TelegramShop() {
  const [tab, setTab] = useState<Tab>('menu')
  const [menu, setMenu] = useState<QrMenuCategory[]>([])
  const [order, setOrder] = useState<QrOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [initData, setInitData] = useState('')
  const [telegramUserId, setTelegramUserId] = useState<number>(0)
  const [restaurantId, setRestaurantId] = useState<number | undefined>(undefined)
  const [displayName, setDisplayName] = useState('')
  const [restaurantName, setRestaurantName] = useState('Telegram Shop')
  const [selectedDish, setSelectedDish] = useState<QrMenuItem | null>(null)
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null)

  const parseRestaurantIdFromStartParam = (startParam?: string): number | undefined => {
    if (!startParam) return undefined
    const plain = Number(startParam)
    if (Number.isFinite(plain) && plain > 0) return plain
    const m1 = startParam.match(/(?:restaurantId=|r_)(\d+)/i)
    if (m1?.[1]) {
      const id = Number(m1[1])
      return Number.isFinite(id) && id > 0 ? id : undefined
    }
    return undefined
  }

  useEffect(() => {
    const wa = window.Telegram?.WebApp
    if (!wa) {
      setError(
        'Откройте магазин из приложения Telegram: через меню бота ресторана или по ссылке из бота. ' +
        'В обычном браузере магазин недоступен.'
      )
      setLoading(false)
      return
    }
    wa.ready()
    wa.expand()

    const userId = Number(wa.initDataUnsafe?.user?.id || 0)
    const name = [wa.initDataUnsafe?.user?.first_name, wa.initDataUnsafe?.user?.last_name].filter(Boolean).join(' ')
      || wa.initDataUnsafe?.user?.username
      || ''
    const rid = parseRestaurantIdFromStartParam(wa.initDataUnsafe?.start_param)

    if (!wa.initData || !userId) {
      setError(
        'Telegram не передал данные пользователя. Откройте магазин заново из приложения Telegram (меню бота или ссылка от бота). ' +
        'Не открывайте ссылку вручную в браузере.'
      )
      setLoading(false)
      return
    }

    setInitData(wa.initData)
    setTelegramUserId(userId)
    setRestaurantId(rid)
    setDisplayName(name)
  }, [])

  const loadMenu = useCallback(async () => {
    if (!initData || !telegramUserId) return
    try {
      const { categories, restaurantName } = await telegramShopService.getMenu(restaurantId, initData)
      setMenu(categories)
      // Если категория ещё не выбрана, по умолчанию открываем первую
      if (!selectedCategoryKey && categories.length > 0) {
        const firstKey = String(categories[0].id ?? 'other')
        setSelectedCategoryKey(firstKey)
      }
      if (restaurantName) setRestaurantName(restaurantName)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to load menu'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [restaurantId, initData, telegramUserId, selectedCategoryKey])

  const loadOrder = useCallback(async () => {
    if (!initData || !telegramUserId) return
    try {
      const o = await telegramShopService.createOrGetCurrentOrder(telegramUserId, restaurantId, initData)
      setOrder(o)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to load order'
      setError(msg)
    }
  }, [telegramUserId, restaurantId, initData])

  useEffect(() => { loadMenu() }, [loadMenu])
  useEffect(() => { loadOrder() }, [loadOrder])

  const ensureOrder = async (): Promise<QrOrder | null> => {
    if (!initData || !telegramUserId) return null
    if (order) return order
    try {
      const o = await telegramShopService.createOrGetCurrentOrder(telegramUserId, restaurantId, initData)
      setOrder(o)
      return o
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to create order'
      setError(msg)
      return null
    }
  }

  const handleDishClick = (dish: QrMenuItem) => {
    if (dish.optionGroups && dish.optionGroups.length > 0) {
      setSelectedDish(dish)
    } else {
      handleAddSimple(dish.id)
    }
  }

  const handleAddSimple = async (dishId: number) => {
    setError('')
    const o = await ensureOrder()
    if (!o) return
    try {
      const updated = await telegramShopService.addItem(o.id, { dishId, qty: 1 }, telegramUserId, initData)
      setOrder(updated)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to add item'
      setError(msg)
    }
  }

  const handleAddWithOptions = async (dishId: number, qty: number, selections: OptionSelection[]) => {
    setSelectedDish(null)
    setError('')
    const o = await ensureOrder()
    if (!o) return
    try {
      const updated = await telegramShopService.addItem(o.id, {
        dishId,
        qty,
        selections: selections.length > 0 ? selections : undefined,
      }, telegramUserId, initData)
      setOrder(updated)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to add item'
      setError(msg)
    }
  }

  const handleRemove = async (itemId: number) => {
    if (!order) return
    try {
      const updated = await telegramShopService.removeItem(order.id, itemId, telegramUserId, initData)
      setOrder(updated)
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to remove item'
      setError(msg)
    }
  }

  const cartCount = order?.items.reduce((s, i) => s + i.qty, 0) || 0

  const selectedCategory = selectedCategoryKey
    ? menu.find(cat => String(cat.id ?? 'other') === selectedCategoryKey)
    : null

  if (!telegramUserId || !initData) {
    return (
      <div className="tg-page">
        <div className="tg-error">{error || 'Откройте Telegram Shop внутри Telegram'}</div>
      </div>
    )
  }

  return (
    <div className="tg-page">
      <div className="tg-header">
        <h1>{restaurantName}</h1>
        <p>{displayName ? `${displayName} · ` : ''}User {telegramUserId} · Restaurant {restaurantId || 'default'}</p>
      </div>

      {error && <div className="tg-error">{error}</div>}

      {tab === 'menu' && menu.length > 0 && (
        <div className="tg-category-strip">
          {menu.map(cat => {
            const key = String(cat.id ?? 'other')
            const isActive = selectedCategoryKey === key
            return (
              <button
                key={key}
                className={`tg-category-pill ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedCategoryKey(key)}
              >
                {cat.imageUrl
                  ? <img src={cat.imageUrl} alt={cat.name} className="tg-category-icon" />
                  : <div className="tg-category-icon placeholder">{cat.name.charAt(0)}</div>}
                <span className="tg-category-label">{cat.name}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="tg-tabs">
        <button className={`tg-tab ${tab === 'menu' ? 'active' : ''}`} onClick={() => setTab('menu')}>
          Menu
        </button>
        <button className={`tg-tab ${tab === 'cart' ? 'active' : ''}`} onClick={() => setTab('cart')}>
          Cart {cartCount > 0 && <span className="tg-cart-badge">{cartCount}</span>}
        </button>
      </div>

      {tab === 'menu' && (
        loading ? (
          <div className="tg-loading">Loading menu...</div>
        ) : selectedCategory ? (
          <div className="tg-category">
            <h2>{selectedCategory.name}</h2>
            {selectedCategory.dishes.map(dish => (
              <div key={dish.id} className="tg-dish">
                {dish.imageUrl
                  ? <img className="tg-dish-img" src={dish.imageUrl} alt={dish.name} />
                  : <div className="tg-dish-img" />}
                <div className="tg-dish-info">
                  <div className="tg-dish-name">{dish.name}</div>
                  <div className="tg-dish-price">{dish.price.toFixed(2)}</div>
                </div>
                <button className="tg-add-btn" onClick={() => handleDishClick(dish)}>+</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="tg-category-placeholder">
            Выберите категорию, чтобы увидеть блюда
          </div>
        )
      )}

      {tab === 'cart' && (
        !order || order.items.length === 0 ? (
          <div className="tg-cart-empty">Cart is empty. Add items from the menu.</div>
        ) : (
          <>
            {order.items.map(item => (
              <div key={item.id} className="tg-cart-item">
                <div className="tg-cart-item-info">
                  <div className="tg-cart-item-name">{item.dishName}</div>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="tg-cart-item-mods">
                      {item.modifiers.map((m, i) => (
                        <span key={i} className="tg-cart-mod">
                          {m.groupTitle}: {m.optionTitle}{m.priceDelta > 0 ? ` (+${m.priceDelta.toFixed(2)})` : ''}{m.qty > 1 ? ` x${m.qty}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="tg-cart-item-meta">
                    {item.qty} x {item.priceAtTime.toFixed(2)} = {item.lineTotal.toFixed(2)}
                  </div>
                </div>
                <button className="tg-cart-item-remove" onClick={() => handleRemove(item.id)}>×</button>
              </div>
            ))}
            <div className="tg-cart-total">
              <span>Total</span>
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
