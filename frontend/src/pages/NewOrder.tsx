import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { restaurantService, categoryService } from '../api/services'
import { retryOnRateLimit } from '../utils/apiRetry'
import { getCache, setCache } from '../utils/cache'
import type { Dish, DishCategory, Order, OrderItem, Ingredient, RecipeItem } from '../api/types'
import SearchBar from '../components/SearchBar'
import Modal from '../components/Modal'
import './restaurant/NewOrder.css'

const NEW_ORDER_DISHES_CACHE_KEY = 'new_order_dishes_cache'
const NEW_ORDER_CATEGORIES_CACHE_KEY = 'new_order_categories_cache'

export default function NewOrder() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const orderIdParam = searchParams.get('orderId')
  const tableIdParam = searchParams.get('tableId')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [orderName, setOrderName] = useState('')
  const [pendingItems, setPendingItems] = useState<Array<{ dish: Dish; qty: number; comment?: string }>>([])
  const [showCommentModal, setShowCommentModal] = useState(false)
  const [selectedDish, setSelectedDish] = useState<Dish | null>(null)
  const [commentText, setCommentText] = useState('')
  
  // Categories and dishes
  const cachedCategories = getCache<DishCategory[]>(NEW_ORDER_CATEGORIES_CACHE_KEY)
  const [categories, setCategories] = useState<DishCategory[]>(cachedCategories || [])
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [categoryDishes, setCategoryDishes] = useState<Dish[]>([])
  const [loadingDishes, setLoadingDishes] = useState(false)
  
  // Initialize with cached data if available
  const cachedDishes = getCache<Dish[]>(NEW_ORDER_DISHES_CACHE_KEY)
  const [, setDishes] = useState<Dish[]>(cachedDishes?.filter((d) => d.isActive) || [])
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null)
  
  // Stock availability tracking
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [recipesCache, setRecipesCache] = useState<Map<number, RecipeItem[]>>(new Map())
  const [availablePortions, setAvailablePortions] = useState<Map<number, number>>(new Map())

  const [recipeModal, setRecipeModal] = useState<{ dishId: number; dishName: string } | null>(null)
  const [recipeLines, setRecipeLines] = useState<RecipeItem[]>([])
  const [recipeLoading, setRecipeLoading] = useState(false)
  const [recipeError, setRecipeError] = useState<string | null>(null)

  const openDishRecipe = async (dishId: number, dishName: string) => {
    setRecipeModal({ dishId, dishName })
    setRecipeLoading(true)
    setRecipeError(null)
    setRecipeLines([])
    try {
      const lines = await restaurantService.getRecipe(dishId)
      setRecipeLines(Array.isArray(lines) ? lines : [])
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      setRecipeError(err.response?.data?.message || 'Не удалось загрузить состав блюда')
    } finally {
      setRecipeLoading(false)
    }
  }

  const recipeUnitLabel = (u: string) => (u === 'G' ? 'г' : u === 'ML' ? 'мл' : u === 'PCS' ? 'шт.' : u)

  useEffect(() => {
    let isMounted = true
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    
    const cached = getCache<Dish[]>(NEW_ORDER_DISHES_CACHE_KEY)
    if (cached) {
      timeoutId = setTimeout(() => {
        if (isMounted) {
          loadDishes(true)
        }
      }, 200)
    } else {
      loadDishes(false)
    }
    
    // Загружаем категории
    loadCategories()
    
    // Загружаем ингредиенты для проверки доступности
    loadIngredients()
    
    // Если есть orderId в query string, загружаем существующий заказ для редактирования
    if (orderIdParam) {
      const orderId = parseInt(orderIdParam)
      if (!isNaN(orderId)) {
        loadOrder(orderId)
      }
    }
    
    return () => {
      isMounted = false
      if (timeoutId) clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIdParam])

  const loadCategories = async () => {
    try {
      const data = await retryOnRateLimit(
        () => categoryService.getCategories(),
        1,
        200
      )
      setCategories(data)
      setCache(NEW_ORDER_CATEGORIES_CACHE_KEY, data)
    } catch (error) {
      console.error('Failed to load categories:', error)
      setCategories([])
    }
  }

  const loadIngredients = async () => {
    try {
      const data = await retryOnRateLimit(
        () => restaurantService.getIngredients(),
        1,
        200
      )
      setIngredients(data)
    } catch (error) {
      console.error('Failed to load ingredients:', error)
      setIngredients([])
    }
  }

  const loadDishesForCategory = async (categoryId: number) => {
    setLoadingDishes(true)
    try {
      const data = await retryOnRateLimit(
        () => restaurantService.getDishesByCategory(categoryId),
        1,
        200
      )
      setCategoryDishes(data.filter((d) => d.isActive))
    } catch (error) {
      console.error('Failed to load dishes for category:', error)
      setCategoryDishes([])
    } finally {
      setLoadingDishes(false)
    }
  }

  const loadDishes = async (isBackground = false) => {
    try {
      const data = await retryOnRateLimit(
        () => restaurantService.getDishes(undefined, true),
        1,
        200
      )
      const activeDishes = data.filter((d) => d.isActive)
      setDishes(activeDishes)
      setCache(NEW_ORDER_DISHES_CACHE_KEY, data)
    } catch (error) {
      console.error('Failed to load dishes:', error)
      if (!isBackground) {
        setDishes([])
      }
    }
  }

  const handleCategoryClick = (categoryId: number) => {
    setSelectedCategoryId(categoryId)
    loadDishesForCategory(categoryId)
  }

  const handleBackToCategories = () => {
    setSelectedCategoryId(null)
    setCategoryDishes([])
  }


  const loadOrder = async (orderId: number) => {
    try {
      const order = await restaurantService.getOrder(orderId)
      console.log('[loadOrder] Received order:', order)
      // Гарантируем, что items всегда массив
      const safeOrder = {
        ...order,
        items: Array.isArray(order.items) ? order.items : []
      }
      console.log('[loadOrder] Safe order:', safeOrder)
      setCurrentOrder(safeOrder)
      if (order.name) {
        setOrderName(order.name)
      }
    } catch (error: any) {
      console.error('Failed to load order:', error)
      console.error('Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status
      })
      // Если заказ не найден, показываем ошибку
      if (error?.response?.status === 404) {
        alert('Order not found')
        navigate('/orders')
      }
    }
  }

  const handleAddItem = async (dish: Dish) => {
    // Открываем модальное окно для ввода комментария
    // Визуальная индикация (красный/оранжевый) уже показывает статус доступности
    setSelectedDish(dish)
    setCommentText('')
    setShowCommentModal(true)
  }

  const handleConfirmAddItem = async () => {
    if (!selectedDish) return

    const comment = commentText.trim() || undefined

    // Если редактируем существующий заказ, добавляем товар сразу
    if (currentOrder) {
      try {
        await restaurantService.addOrderItem(currentOrder.id, selectedDish.id, 1, comment)
        await loadOrder(currentOrder.id)
        setShowCommentModal(false)
        setSelectedDish(null)
        setCommentText('')
      } catch (error: any) {
        console.error('Failed to add item:', error)
        alert(error.response?.data?.message || 'Failed to add item')
      }
    } else {
      // Если заказа еще нет, добавляем товар в pendingItems
      // Проверяем, есть ли уже такое блюдо с таким же комментарием
      const existingPending = pendingItems.find(
        (item) => item.dish.id === selectedDish.id && 
        ((item.comment || '') === (comment || ''))
      )
      if (existingPending) {
        // Проверяем доступность перед увеличением количества
        const portions = availablePortions.get(selectedDish.id) ?? Infinity
        const totalUsed = pendingItems
          .filter((pi) => pi.dish.id === selectedDish.id)
          .reduce((sum, pi) => sum + pi.qty, 0)
        const portionsAfter = portions - totalUsed - 1
        
        // Блокируем только если превышаем доступное количество
        if (portionsAfter < 0 && portions !== Infinity) {
          alert(`Недостаточно ингредиентов. Максимальное количество: ${portions} порций.`)
          setShowCommentModal(false)
          setSelectedDish(null)
          setCommentText('')
          return
        }
        
        setPendingItems(
          pendingItems.map((item) =>
            item.dish.id === selectedDish.id && ((item.comment || '') === (comment || ''))
              ? { ...item, qty: item.qty + 1 }
              : item
          )
        )
      } else {
        // Проверяем доступность перед добавлением нового блюда
        const portions = availablePortions.get(selectedDish.id) ?? Infinity
        const totalUsed = pendingItems
          .filter((pi) => pi.dish.id === selectedDish.id)
          .reduce((sum, pi) => sum + pi.qty, 0)
        const portionsAfter = portions - totalUsed - 1
        
        // Блокируем только если превышаем доступное количество
        if (portionsAfter < 0 && portions !== Infinity) {
          alert(`Недостаточно ингредиентов. Максимальное количество: ${portions} порций.`)
          setShowCommentModal(false)
          setSelectedDish(null)
          setCommentText('')
          return
        }
        
        setPendingItems([...pendingItems, { dish: selectedDish, qty: 1, comment }])
      }
      setShowCommentModal(false)
      setSelectedDish(null)
      setCommentText('')
    }
  }

  const handleUpdateQty = async (item: OrderItem, newQty: number) => {
    if (!currentOrder || newQty < 1) return
    try {
      await restaurantService.updateOrderItem(currentOrder.id, item.id, newQty)
      await loadOrder(currentOrder.id)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to update quantity')
    }
  }

  const handleRemoveItem = async (itemId: number) => {
    if (!currentOrder) return
    try {
      await restaurantService.removeOrderItem(currentOrder.id, itemId)
      await loadOrder(currentOrder.id)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to remove item')
    }
  }

  const handleCreateOrder = async () => {
    // Если редактируем существующий заказ, просто возвращаемся
    if (currentOrder) {
      navigate('/orders')
      return
    }

    // Если нет товаров, не создаем заказ
    if (pendingItems.length === 0) {
      alert('Please add at least one item to the order')
      return
    }

    setSaving(true)
    try {
      // Создаем заказ с названием и привязкой к столу (если указан)
      const tableId = tableIdParam ? parseInt(tableIdParam, 10) : undefined
      const order = await restaurantService.createOrder({ name: orderName || undefined, tableId })
      
      // Добавляем все товары из pendingItems
      for (const pendingItem of pendingItems) {
        await restaurantService.addOrderItem(
          order.id, 
          pendingItem.dish.id, 
          pendingItem.qty,
          pendingItem.comment
        )
      }
      
      // Навигируем обратно в Orders
      navigate('/orders')
    } catch (error: any) {
      console.error('Failed to create order:', error)
      alert(error.response?.data?.message || 'Failed to create order')
    } finally {
      setSaving(false)
    }
  }

  // Функция для загрузки рецепта блюда (с кэшированием)
  const loadRecipe = async (dishId: number): Promise<RecipeItem[]> => {
    if (recipesCache.has(dishId)) {
      return recipesCache.get(dishId)!
    }
    try {
      const recipe = await restaurantService.getRecipe(dishId)
      setRecipesCache((prev) => new Map(prev).set(dishId, recipe))
      return recipe
    } catch (error) {
      console.error(`Failed to load recipe for dish ${dishId}:`, error)
      return []
    }
  }

  // Расчет доступных порций для блюда с учетом текущего заказа
  const calculateAvailablePortions = async (dish: Dish): Promise<number> => {
    if (ingredients.length === 0) return Infinity // Если ингредиенты не загружены, считаем что все доступно
    
    const recipe = await loadRecipe(dish.id)
    if (recipe.length === 0) return Infinity // Если рецепта нет, считаем что доступно
    
    // Рассчитываем использованные ингредиенты в текущем заказе
    const usedIngredients = new Map<number, number>() // ingredientId -> total qty used
    
    // Для pendingItems (новый заказ)
    if (!currentOrder && pendingItems.length > 0) {
      for (const pendingItem of pendingItems) {
        const itemRecipe = await loadRecipe(pendingItem.dish.id)
        for (const recipeItem of itemRecipe) {
          const totalQty = recipeItem.qtyPerDish * pendingItem.qty
          usedIngredients.set(
            recipeItem.ingredientId,
            (usedIngredients.get(recipeItem.ingredientId) || 0) + totalQty
          )
        }
      }
    }
    
    // Для текущего заказа (редактирование)
    if (currentOrder && currentOrder.items) {
      for (const item of currentOrder.items) {
        const itemRecipe = await loadRecipe(item.dishId)
        for (const recipeItem of itemRecipe) {
          const totalQty = recipeItem.qtyPerDish * (item.qty || 1)
          usedIngredients.set(
            recipeItem.ingredientId,
            (usedIngredients.get(recipeItem.ingredientId) || 0) + totalQty
          )
        }
      }
    }
    
    // Рассчитываем доступные порции для данного блюда
    let minPortions = Infinity
    for (const recipeItem of recipe) {
      const ingredient = ingredients.find((ing) => ing.id === recipeItem.ingredientId)
      if (!ingredient) {
        minPortions = 0 // Если ингредиент не найден, порций нет
        break
      }
      
      const availableQty = ingredient.stockQty - (usedIngredients.get(recipeItem.ingredientId) || 0)
      const portions = Math.floor(availableQty / recipeItem.qtyPerDish)
      minPortions = Math.min(minPortions, portions)
    }
    
    return minPortions < 0 ? 0 : minPortions
  }

  // Обновляем доступные порции при изменении заказа
  useEffect(() => {
    if (ingredients.length === 0) return
    
    const updatePortions = async () => {
      const newPortions = new Map<number, number>()
      const dishesToCheck = selectedCategoryId ? categoryDishes : []
      
      for (const dish of dishesToCheck) {
        const portions = await calculateAvailablePortions(dish)
        newPortions.set(dish.id, portions)
      }
      
      setAvailablePortions(newPortions)
    }
    
    updatePortions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingItems, currentOrder, ingredients, categoryDishes, selectedCategoryId])

  // Функция для определения статуса доступности блюда
  const getDishAvailabilityStatus = (dish: Dish): 'available' | 'low' | 'unavailable' => {
    const portions = availablePortions.get(dish.id) ?? Infinity
    if (portions === 0) return 'unavailable'
    if (portions < 10) return 'low'
    return 'available'
  }

  const filteredDishes = selectedCategoryId
    ? categoryDishes.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
    : []

  // Вычисляем общую сумму: либо из текущего заказа, либо из pendingItems
  const totalAmount = currentOrder
    ? currentOrder.items?.reduce((sum, item) => sum + (item.lineTotal || 0), 0) || 0
    : pendingItems.reduce((sum, item) => sum + item.dish.price * item.qty, 0)

  // Получаем список товаров для отображения
  const displayItems = currentOrder
    ? currentOrder.items || []
    : pendingItems.map((item, index) => ({
        id: index,
        dishId: item.dish.id,
        dishName: item.dish.name,
        qty: item.qty,
        price: item.dish.price,
        lineTotal: item.dish.price * item.qty,
        comment: item.comment,
      }))

  return (
    <div className="new-order-page">
      <h1>{orderIdParam ? 'Edit Order' : 'New Order'}</h1>
      <div className="order-layout">
        <div className="dishes-panel">
          {selectedCategoryId ? (
            <>
              <div className="category-header">
                <button className="btn-back" onClick={handleBackToCategories}>
                  ← Назад к категориям
                </button>
                <SearchBar value={search} onChange={setSearch} placeholder="Поиск блюд..." />
              </div>
              {loadingDishes ? (
                <p className="empty-state">Загрузка...</p>
              ) : filteredDishes.length === 0 ? (
                <p className="empty-state">Блюда не найдены</p>
              ) : (
                <div className="dishes-list">
                  {filteredDishes.map((dish) => {
                    const availabilityStatus = getDishAvailabilityStatus(dish)
                    const portions = availablePortions.get(dish.id) ?? Infinity
                    const statusClass = availabilityStatus === 'unavailable' 
                      ? 'dish-unavailable' 
                      : availabilityStatus === 'low' 
                        ? 'dish-low-stock' 
                        : ''
                    
                    return (
                      <div 
                        key={dish.id} 
                        className={`dish-card ${statusClass}`}
                        onClick={() => handleAddItem(dish)}
                        title={
                          availabilityStatus === 'unavailable'
                            ? `Недостаточно ингредиентов (0 порций) - можно добавить с предупреждением`
                            : availabilityStatus === 'low'
                              ? `Осталось порций: ${portions}`
                              : undefined
                        }
                      >
                        {dish.imageUrl ? (
                          <img
                            src={dish.imageUrl}
                            alt={dish.name}
                            className="dish-card-image"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        ) : null}
                        <div className="dish-card-main">
                          <h3 className="dish-card-title">{dish.name}</h3>
                          <p className="dish-price">₽{dish.price.toFixed(2)}</p>
                          {availabilityStatus === 'low' && (
                            <p className="dish-stock-warning">Осталось: {portions} порций</p>
                          )}
                          {availabilityStatus === 'unavailable' && (
                            <p className="dish-stock-error">Недостаточно ингредиентов</p>
                          )}
                        </div>
                        <div className="dish-card-actions">
                          <button
                            type="button"
                            className="dish-recipe-btn"
                            title="Состав блюда (аллергены, ингредиенты)"
                            onClick={(e) => {
                              e.stopPropagation()
                              void openDishRecipe(dish.id, dish.name)
                            }}
                          >
                            Состав
                          </button>
                          <button type="button" className="btn-add" aria-label="Добавить в заказ">
                            +
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <h2 style={{ marginBottom: '20px' }}>Выберите категорию</h2>
              <div className="categories-grid">
                {categories.length === 0 ? (
                  <p className="empty-state">Категории не найдены</p>
                ) : (
                  categories.map((category) => (
                    <div
                      key={category.id}
                      className="category-card"
                      onClick={() => handleCategoryClick(category.id)}
                    >
                      {category.imageUrl ? (
                        <img
                          src={category.imageUrl}
                          alt={category.name}
                          className="category-image"
                          onError={(e) => {
                            console.error('Failed to load category image:', category.imageUrl)
                            // Если изображение не загрузилось, скрываем его и показываем placeholder
                            e.currentTarget.style.display = 'none'
                            const placeholder = e.currentTarget.nextElementSibling as HTMLElement
                            if (placeholder && placeholder.classList.contains('category-image-placeholder')) {
                              placeholder.style.display = 'flex'
                            }
                          }}
                        />
                      ) : (
                        <div className="category-image-placeholder">
                          <span>{category.name.charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                      <h3 className="category-name">{category.name}</h3>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <div className="order-panel">
          <div className="order-header">
            <h2>{orderIdParam ? 'Edit Order' : 'New Order'}</h2>
            {currentOrder && <span className="order-id">#{currentOrder.id}</span>}
          </div>
          {!orderIdParam && (
            <div className="order-name-input">
              <label htmlFor="order-name">Order Name (optional):</label>
              <input
                id="order-name"
                type="text"
                value={orderName}
                onChange={(e) => setOrderName(e.target.value)}
                placeholder="Enter order name..."
                className="order-name-field"
              />
            </div>
          )}
          <div className="order-items">
            {displayItems.length === 0 ? (
              <p className="empty-state">No items in order</p>
            ) : (
              displayItems
                .filter((item) => item && item.dishName) // Фильтруем некорректные элементы
                .map((item) => (
                <div key={item.id} className="order-item">
                  <div className="item-info">
                    <div className="item-name-row">
                      <span className="item-name">{item.dishName || 'Unknown'}</span>
                      <button
                        type="button"
                        className="btn-recipe-inline"
                        title="Состав блюда"
                        onClick={(e) => {
                          e.stopPropagation()
                          void openDishRecipe(item.dishId, item.dishName || 'Блюдо')
                        }}
                      >
                        Состав
                      </button>
                      <span className="item-price">${(item.price || 0).toFixed(2)}</span>
                    </div>
                    {item.comment && (
                      <div className="item-comment">
                        <span className="comment-label">Комментарий:</span>
                        <span className="comment-text">{item.comment}</span>
                      </div>
                    )}
                  </div>
                  <div className="item-controls">
                    {currentOrder ? (
                      <>
                        <button
                          onClick={() => handleUpdateQty(item, (item.qty || 1) - 1)}
                          className="qty-btn"
                        >
                          -
                        </button>
                        <span className="item-qty">{item.qty || 0}</span>
                        <button
                          onClick={() => handleUpdateQty(item, (item.qty || 0) + 1)}
                          className="qty-btn"
                        >
                          +
                        </button>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="btn-remove"
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            if (item.qty > 1) {
                              setPendingItems(
                                pendingItems.map((pi) =>
                                  pi.dish.id === item.dishId
                                    ? { ...pi, qty: pi.qty - 1 }
                                    : pi
                                )
                              )
                            }
                          }}
                          className="qty-btn"
                        >
                          -
                        </button>
                        <span className="item-qty">{item.qty || 0}</span>
                        <button
                          onClick={() => {
                            const dish = pendingItems.find((pi) => pi.dish.id === item.dishId)?.dish
                            if (!dish) return
                            
                            const portions = availablePortions.get(dish.id) ?? Infinity
                            
                            // Проверяем, не превышаем ли доступное количество
                            const totalUsed = pendingItems
                              .filter((pi) => pi.dish.id === dish.id)
                              .reduce((sum, pi) => sum + pi.qty, 0)
                            const portionsAfter = portions - totalUsed - 1
                            
                            // Блокируем только если превышаем доступное количество
                            if (portionsAfter < 0 && portions !== Infinity) {
                              alert(`Недостаточно ингредиентов. Максимальное количество: ${portions} порций.`)
                              return
                            }
                            
                            setPendingItems(
                              pendingItems.map((pi) =>
                                pi.dish.id === item.dishId
                                  ? { ...pi, qty: pi.qty + 1 }
                                  : pi
                              )
                            )
                          }}
                          className="qty-btn"
                        >
                          +
                        </button>
                        <button
                          onClick={() => {
                            setPendingItems(pendingItems.filter((pi) => pi.dish.id !== item.dishId))
                          }}
                          className="btn-remove"
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                  <div className="item-total">${(item.lineTotal || 0).toFixed(2)}</div>
                </div>
              ))
            )}
          </div>
          <div className="order-footer">
            <div className="order-total">
              <span>Total:</span>
              <span className="total-amount">${totalAmount.toFixed(2)}</span>
            </div>
            <div className="order-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  if (confirm('Cancel this order?')) {
                    navigate('/orders')
                  }
                }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateOrder}
                disabled={(!currentOrder && pendingItems.length === 0) || saving}
              >
                {saving ? 'Creating...' : currentOrder ? 'Done' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Модальное окно для ввода комментария */}
      {showCommentModal && selectedDish && (
        <div className="modal-overlay" onClick={() => {
          setShowCommentModal(false)
          setSelectedDish(null)
          setCommentText('')
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Добавить блюдо: {selectedDish.name}</h3>
            <div className="modal-body">
              <label htmlFor="comment-input">Комментарий (необязательно):</label>
              <textarea
                id="comment-input"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Например: Без лука, Острое, Без соли..."
                rows={3}
                className="comment-textarea"
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowCommentModal(false)
                  setSelectedDish(null)
                  setCommentText('')
                }}
              >
                Отмена
              </button>
              <button className="btn-primary" onClick={handleConfirmAddItem}>
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={recipeModal != null}
        onClose={() => {
          setRecipeModal(null)
          setRecipeLines([])
          setRecipeError(null)
        }}
        title={recipeModal ? `Состав: ${recipeModal.dishName}` : 'Состав блюда'}
      >
        <p className="recipe-modal-hint">
          Ингредиенты на одну порцию. При аллергии уточните у гостя переносимость компонентов.
        </p>
        {recipeLoading && <p className="recipe-modal-status">Загрузка…</p>}
        {recipeError && <p className="recipe-modal-error">{recipeError}</p>}
        {!recipeLoading && !recipeError && recipeLines.length === 0 && (
          <p className="recipe-modal-status">Для этого блюда рецепт не указан в системе.</p>
        )}
        {!recipeLoading && recipeLines.length > 0 && (
          <ul className="recipe-modal-list">
            {recipeLines.map((line) => (
              <li key={line.ingredientId}>
                <span className="recipe-modal-name">{line.ingredientName}</span>
                <span className="recipe-modal-qty">
                  {line.qtyPerDish} {recipeUnitLabel(line.unit)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  )
}
