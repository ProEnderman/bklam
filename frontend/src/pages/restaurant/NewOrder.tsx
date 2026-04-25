import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { restaurantService, categoryService, optionTemplateService } from '../../api/services'
import { splitService } from '../../api/splitService'
import { loyaltyGuestApi } from '../../api/loyaltyService'
import { retryOnRateLimit } from '../../utils/apiRetry'
import { getCache, setCache } from '../../utils/cache'
import type { Dish, DishCategory, Order, OrderItem, Ingredient, RecipeItem } from '../../api/types'
import type { LoyaltyGuest } from '../../api/loyaltyTypes'
import type { OptionGroupDto, OptionSelection, QrMenuItem } from '../../api/qrTypes'
import SearchBar from '../../components/SearchBar'
import Modal from '../../components/Modal'
import DishOptionsModal from '../../components/DishOptionsModal'
import NewOrderItemsColumn from './NewOrderItemsColumn'
import NewOrderGuestSplitColumn from './NewOrderGuestSplitColumn'
import type { SplitDraftShare } from './newOrderSplitDraft'
import './NewOrder.css'

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
  const [pendingItems, setPendingItems] = useState<Array<{
    dish: Dish
    qty: number
    comment?: string
    selections?: OptionSelection[]
    modifiers?: Array<{ groupTitle: string; optionTitle: string; priceDelta: number; qty: number; valueInt?: number }>
    unitPrice?: number
  }>>([])
  const [selectedDishWithOptions, setSelectedDishWithOptions] = useState<(Dish & { optionGroups?: OptionGroupDto[] }) | null>(null)
  /** Редактирование комментария: для какой позиции открыт ввод */
  const [editingCommentFor, setEditingCommentFor] = useState<{ type: 'pending'; index: number } | { type: 'order'; itemId: number } | null>(null)
  const [editingCommentValue, setEditingCommentValue] = useState('')
  const [editingTarget, setEditingTarget] = useState<{
    mode: 'current' | 'pending'
    itemId?: number
    pendingIndex?: number
    qty: number
    comment?: string
    dish: Dish
  } | null>(null)
  
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

  // Unpaid reason modal
  const [showUnpaidModal, setShowUnpaidModal] = useState(false)
  const [unpaidReasonType, setUnpaidReasonType] = useState<'default' | 'custom'>('default')
  const [unpaidCustomReason, setUnpaidCustomReason] = useState('')

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

  // Client (guest) for order: none / select existing / create new
  type ClientMode = 'none' | 'select' | 'new'
  const [clientMode, setClientMode] = useState<ClientMode>('none')
  const [selectedGuest, setSelectedGuest] = useState<LoyaltyGuest | null>(null)
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [guestSearchQuery, setGuestSearchQuery] = useState('')
  const [guestSearchResults, setGuestSearchResults] = useState<LoyaltyGuest[]>([])
  const [guestSearching, setGuestSearching] = useState(false)

  /** Черновик разделения счёта по гостям до создания заказа. По каждой позиции (индекс) задаём qty на гостя. */
  const [splitDraft, setSplitDraft] = useState<{ shares: SplitDraftShare[] } | null>(null)
  const [showSplitDraftForm, setShowSplitDraftForm] = useState(false)
  const [shareGuestPickIndex, setShareGuestPickIndex] = useState<number | null>(null)
  const [shareGuestSearchQuery, setShareGuestSearchQuery] = useState('')
  const [shareGuestSearchResults, setShareGuestSearchResults] = useState<LoyaltyGuest[]>([])
  const [shareGuestSearching, setShareGuestSearching] = useState(false)

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

  const searchGuests = async () => {
    if (!guestSearchQuery.trim()) {
      setGuestSearchResults([])
      return
    }
    setGuestSearching(true)
    try {
      const data = await loyaltyGuestApi.search(guestSearchQuery.trim(), 0, 20)
      setGuestSearchResults(data.content || [])
    } catch (e) {
      console.error('Guest search failed:', e)
      setGuestSearchResults([])
    } finally {
      setGuestSearching(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => { searchGuests() }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestSearchQuery])

  useEffect(() => {
    if (shareGuestPickIndex == null) return
    const q = shareGuestSearchQuery.trim()
    if (!q) {
      setShareGuestSearchResults([])
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      setShareGuestSearching(true)
      try {
        const data = await loyaltyGuestApi.search(q, 0, 20)
        if (!cancelled) setShareGuestSearchResults(data.content || [])
      } catch {
        if (!cancelled) setShareGuestSearchResults([])
      } finally {
        if (!cancelled) setShareGuestSearching(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [shareGuestSearchQuery, shareGuestPickIndex])

  const handleSelectGuest = (g: LoyaltyGuest) => {
    setSelectedGuest(g)
  }

  const handleClearGuest = async () => {
    if (currentOrder) {
      try {
        await restaurantService.updateOrder(currentOrder.id, { clearGuest: true })
        setCurrentOrder(prev => prev ? { ...prev, guestId: undefined, guestLabel: undefined } : null)
      } catch (e: any) {
        alert(e.response?.data?.message || 'Не удалось убрать клиента')
      }
    }
    setSelectedGuest(null)
    setClientMode('none')
  }

  const handleApplyGuestToOrder = async (guestId: number) => {
    if (!currentOrder) return
    try {
      const updated = await restaurantService.updateOrder(currentOrder.id, { guestId })
      setCurrentOrder(updated)
      setSelectedGuest(null)
    } catch (e: any) {
      alert(e.response?.data?.message || 'Не удалось привязать клиента')
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
      if (order.guestId) {
        setClientMode('select')
        setSelectedGuest(null)
      } else {
        setClientMode('none')
        setSelectedGuest(null)
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

  const buildModifierPreview = (
    dish: Dish & { optionGroups?: OptionGroupDto[] },
    selections: OptionSelection[]
  ): Array<{ groupTitle: string; optionTitle: string; priceDelta: number; qty: number; valueInt?: number }> => {
    const groups = dish.optionGroups ?? []
    const out: Array<{ groupTitle: string; optionTitle: string; priceDelta: number; qty: number; valueInt?: number }> = []
    for (const s of selections) {
      const g = groups.find(x => x.groupInstanceId === s.groupInstanceId)
      if (!g) continue
      if (g.type === 'RANGE_STEPPER' && s.valueInt != null) {
        if (g.rules.pricingMode === 'LOOKUP') {
          const found = g.items.find(i => i.valueInt === s.valueInt)
          out.push({
            groupTitle: g.title,
            optionTitle: found?.title || `${g.title}: ${s.valueInt}`,
            priceDelta: found?.priceDelta || 0,
            qty: 1,
            valueInt: s.valueInt,
          })
        } else {
          out.push({
            groupTitle: g.title,
            optionTitle: `${g.title}: ${s.valueInt}`,
            priceDelta: (g.rules.pricePerUnit || 0) * s.valueInt,
            qty: 1,
            valueInt: s.valueInt,
          })
        }
        continue
      }
      const oi = g.items.find(i => i.optionItemId === s.optionItemId)
      if (!oi) continue
      out.push({
        groupTitle: g.title,
        optionTitle: oi.title,
        priceDelta: oi.priceDelta,
        qty: s.optionQty && s.optionQty > 0 ? s.optionQty : 1,
      })
    }
    return out
  }

  const getUnitPriceWithModifiers = (
    dish: Dish,
    modifiers: Array<{ priceDelta: number; qty: number }>
  ): number => {
    const modTotal = modifiers.reduce((sum, m) => sum + m.priceDelta * (m.qty || 1), 0)
    return dish.price + modTotal
  }

  /** Добавить блюдо сразу (без модалки комментария). Для блюд с модификаторами вызывается после выбора опций. qty — количество. */
  const addItemImmediate = async (
    dish: Dish,
    comment?: string,
    selections?: OptionSelection[],
    modifiers?: Array<{ groupTitle: string; optionTitle: string; priceDelta: number; qty: number; valueInt?: number }>,
    qty: number = 1
  ) => {
    const safeQty = Math.max(1, Math.floor(qty))
    if (currentOrder) {
      try {
        await restaurantService.addOrderItem(currentOrder.id, dish.id, safeQty, comment, selections)
        await loadOrder(currentOrder.id)
      } catch (error: any) {
        console.error('Failed to add item:', error)
        alert(error.response?.data?.message || 'Не удалось добавить блюдо')
      }
      return
    }
    const existingPending = pendingItems.find(
      (item) => item.dish.id === dish.id &&
        ((item.comment || '') === (comment || '')) &&
        (!selections || selections.length === 0) &&
        (!item.selections || item.selections.length === 0)
    )
    if (existingPending) {
      const portions = availablePortions.get(dish.id) ?? Infinity
      const totalUsed = pendingItems.filter((pi) => pi.dish.id === dish.id).reduce((sum, pi) => sum + pi.qty, 0)
      if (portions !== Infinity && totalUsed + safeQty > portions) {
        alert(`Недостаточно ингредиентов. Максимум: ${portions} порций.`)
        return
      }
      setPendingItems((prev) =>
        prev.map((p) =>
          p.dish.id === dish.id && (p.comment || '') === (comment || '') && !p.selections?.length
            ? { ...p, qty: p.qty + safeQty }
            : p
        )
      )
      return
    }

    // Если выбирались модификаторы, нельзя проверять склад только по количеству порций блюда:
    // модификаторы меняют расход конкретных ингредиентов.
    const hasModifierSelections = !!(selections && selections.length > 0)
    const eps = 1e-9

    const estimateIngredientUsage = async (
      dishToUse: Dish & { optionGroups?: OptionGroupDto[] },
      qtyToUse: number,
      sels?: OptionSelection[]
    ): Promise<Map<number, number>> => {
      const recipe = await loadRecipe(dishToUse.id)
      const recipeByIngredient = new Map(recipe.map((r) => [r.ingredientId, r.qtyPerDish]))
      const usage = new Map<number, number>()

      // Базовый расход по рецепту.
      for (const r of recipe) {
        usage.set(r.ingredientId, (usage.get(r.ingredientId) ?? 0) + r.qtyPerDish * qtyToUse)
      }

      if (!sels || sels.length === 0) return usage
      const groups = dishToUse.optionGroups ?? []
      if (groups.length === 0) return usage

      const groupByInstance = new Map(groups.map((g) => [g.groupInstanceId, g]))

      // 1) Групповой масштаб (только для RANGE_STEPPER/SINGLE_REQUIRED/SINGLE_OPTIONAL).
      const selsByGroup = new Map<number, OptionSelection[]>()
      for (const s of sels) {
        const arr = selsByGroup.get(s.groupInstanceId) ?? []
        arr.push(s)
        selsByGroup.set(s.groupInstanceId, arr)
      }

      for (const [groupInstanceId, groupSels] of selsByGroup.entries()) {
        const g = groupByInstance.get(groupInstanceId)
        if (!g) continue

        const groupType = g.type
        let v = 0 // "выбор гостя" в терминах computeScaledPortions
        if (groupType === 'RANGE_STEPPER') {
          v = Math.max(0, groupSels[0]?.valueInt ?? 0)
        } else if (groupType === 'SINGLE_REQUIRED' || groupType === 'SINGLE_OPTIONAL') {
          const s0 = groupSels[0]
          if (!s0?.optionItemId) continue
          const opt = g.items.find((it) => it.optionItemId === s0.optionItemId)
          const unit = opt?.valueInt != null ? opt.valueInt : 1
          const oq = s0.optionQty != null && s0.optionQty > 0 ? s0.optionQty : 1
          v = unit * oq
        } else {
          continue
        }

        if (v <= 0) continue

        // Independent scaling: add usage based on scaleIngredients.
        if (g.scaleIngredients && g.scaleIngredients.length > 0) {
          for (const si of g.scaleIngredients) {
            const anchorValue = si.anchorValue != null && si.anchorValue > 0 ? si.anchorValue : 1
            const qtyPerDish = recipeByIngredient.get(si.ingredientId) ?? 0
            if (qtyPerDish <= 0) continue
            const targetQty = si.targetQty != null && si.targetQty > 0 ? si.targetQty : qtyPerDish
            const usageAdd = targetQty * (v / anchorValue) * qtyToUse
            usage.set(si.ingredientId, (usage.get(si.ingredientId) ?? 0) + usageAdd)
          }
          continue
        }

        // Legacy scaling: one ingredient multiplied by (v / stockScaleBase).
        if (g.stockIngredientId != null) {
          const base = g.stockScaleBase != null && g.stockScaleBase > 0 ? g.stockScaleBase : 1
          const ratio = v / base
          const qtyPerDish = recipeByIngredient.get(g.stockIngredientId) ?? 0
          if (qtyPerDish <= 0) continue
          const usageAdd = qtyPerDish * ratio * qtyToUse
          usage.set(g.stockIngredientId, (usage.get(g.stockIngredientId) ?? 0) + usageAdd)
        }
      }

      // 2) Опции: доп. списание (stockQtyPerUnit + extraIngredients) по каждой выбранной опции.
      for (const s of sels) {
        if (!s.optionItemId) continue
        const g = groupByInstance.get(s.groupInstanceId)
        if (!g) continue
        const opt = g.items.find((it) => it.optionItemId === s.optionItemId)
        if (!opt) continue
        const oq = s.optionQty != null && s.optionQty > 0 ? s.optionQty : 1

        if (opt.stockIngredientId != null && opt.stockQtyPerUnit != null && opt.stockQtyPerUnit > 0) {
          const usageAdd = opt.stockQtyPerUnit * oq * qtyToUse
          usage.set(opt.stockIngredientId, (usage.get(opt.stockIngredientId) ?? 0) + usageAdd)
        }

        if (opt.extraIngredients && opt.extraIngredients.length > 0) {
          for (const ex of opt.extraIngredients) {
            if (ex.ingredientId == null || ex.qtyPerUnit == null || ex.qtyPerUnit <= 0) continue
            const usageAdd = ex.qtyPerUnit * oq * qtyToUse
            usage.set(ex.ingredientId, (usage.get(ex.ingredientId) ?? 0) + usageAdd)
          }
        }
      }

      return usage
    }

    if (hasModifierSelections) {
      if (ingredients.length > 0) {
        const usedMap = new Map<number, number>()

        for (const pi of pendingItems) {
          const piDish = pi.dish as Dish & { optionGroups?: OptionGroupDto[] }
          const piUsage = await estimateIngredientUsage(
            piDish,
            pi.qty,
            pi.selections && pi.selections.length > 0 ? pi.selections : undefined
          )
          for (const [ingId, q] of piUsage.entries()) {
            usedMap.set(ingId, (usedMap.get(ingId) ?? 0) + q)
          }
        }

        const newUsage = await estimateIngredientUsage(
          dish as Dish & { optionGroups?: OptionGroupDto[] },
          safeQty,
          selections
        )

        for (const [ingId, q] of newUsage.entries()) {
          const ing = ingredients.find((x) => x.id === ingId)
          if (!ing) continue
          const required = (usedMap.get(ingId) ?? 0) + q
          if (ing.stockQty + eps < required) {
            alert(`Недостаточно «${ing.name}» на складе. Доступно: ${ing.stockQty.toFixed(2)}, требуется: ${required.toFixed(2)}`)
            return
          }
        }
      }
    } else {
      const portions = availablePortions.get(dish.id) ?? Infinity
      const totalUsed = pendingItems.filter((pi) => pi.dish.id === dish.id).reduce((sum, pi) => sum + pi.qty, 0)
      if (portions !== Infinity && totalUsed + safeQty > portions) {
        alert(`Недостаточно ингредиентов. Максимум: ${portions} порций.`)
        return
      }
    }

    const unitPrice = modifiers && modifiers.length > 0 ? getUnitPriceWithModifiers(dish, modifiers) : undefined
    setPendingItems((prev) => [
      ...prev,
      {
        dish,
        qty: safeQty,
        comment,
        selections: selections?.length ? selections : undefined,
        modifiers: modifiers?.length ? modifiers : undefined,
        unitPrice,
      },
    ])
  }

  const handleAddItem = async (dish: Dish) => {
    try {
      const groups = await optionTemplateService.getDishOptionGroups(dish.id)
      if (groups && groups.length > 0) {
        setSelectedDishWithOptions({ ...dish, optionGroups: groups as unknown as OptionGroupDto[] })
        return
      }
    } catch (e) {
      console.error('Failed to load dish option groups:', e)
    }
    addItemImmediate(dish)
  }

  const handleEditItemModifiers = async (item: any, pendingIndex?: number) => {
    try {
      const dish = await restaurantService.getDish(item.dishId)
      const groups = await optionTemplateService.getDishOptionGroups(item.dishId)
      if (!groups || groups.length === 0) {
        alert('У блюда нет модификаторов для редактирования')
        return
      }
      setEditingTarget({
        mode: currentOrder ? 'current' : 'pending',
        itemId: currentOrder ? item.id : undefined,
        pendingIndex: currentOrder ? undefined : pendingIndex,
        qty: item.qty || 1,
        comment: item.comment,
        dish,
      })
      setSelectedDishWithOptions({ ...dish, optionGroups: groups as unknown as OptionGroupDto[] })
    } catch (e: any) {
      console.error('Failed to open modifier editor:', e)
      alert(e?.response?.data?.message || 'Не удалось открыть редактор модификаторов')
    }
  }

  const handleOptionsPicked = (dishId: number, qty: number, selections: OptionSelection[]) => {
    const dish = selectedDishWithOptions
    if (!dish || dish.id !== dishId) return
    const modifiers = buildModifierPreview(dish, selections)
    if (editingTarget) {
      if (editingTarget.mode === 'pending' && editingTarget.pendingIndex != null) {
        const unitPrice = getUnitPriceWithModifiers(dish, modifiers)
        setPendingItems(prev => prev.map((p, i) => i === editingTarget.pendingIndex
          ? {
              ...p,
              qty: Math.max(1, Math.floor(qty)),
              selections: selections.length > 0 ? selections : undefined,
              modifiers: modifiers.length > 0 ? modifiers : undefined,
              unitPrice: modifiers.length > 0 ? unitPrice : undefined,
            }
          : p
        ))
        setSelectedDishWithOptions(null)
        setEditingTarget(null)
        return
      }
      if (editingTarget.mode === 'current' && currentOrder && editingTarget.itemId) {
        ;(async () => {
          try {
            await restaurantService.addOrderItem(
              currentOrder.id,
              dish.id,
              Math.max(1, Math.floor(qty)),
              editingTarget.comment,
              selections.length > 0 ? selections : undefined
            )
            await restaurantService.removeOrderItem(currentOrder.id, editingTarget.itemId!)
            await loadOrder(currentOrder.id)
          } catch (e: any) {
            console.error('Failed to replace order item modifiers:', e)
            alert(e?.response?.data?.message || 'Не удалось изменить модификаторы')
          } finally {
            setSelectedDishWithOptions(null)
            setEditingTarget(null)
          }
        })()
        return
      }
    }
    setSelectedDishWithOptions(null)
    addItemImmediate(dish, undefined, selections, modifiers, qty)
  }

  const saveComment = (value: string) => {
    if (editingCommentFor == null) return
    if (editingCommentFor.type === 'pending') {
      setPendingItems((prev) =>
        prev.map((p, i) => (i === editingCommentFor.index ? { ...p, comment: value.trim() || undefined } : p))
      )
    } else if (currentOrder) {
      const item = currentOrder.items?.find((i) => i.id === editingCommentFor.itemId)
      if (item) {
        restaurantService
          .updateOrderItem(currentOrder.id, item.id, item.qty || 1, value.trim() || undefined)
          .then(() => loadOrder(currentOrder!.id))
          .catch((e: any) => alert(e?.response?.data?.message || 'Не удалось сохранить комментарий'))
      }
    }
    setEditingCommentFor(null)
    setEditingCommentValue('')
  }

  const handleUpdateQty = async (item: OrderItem, newQty: number) => {
    if (!currentOrder || newQty < 1) return
    try {
      await restaurantService.updateOrderItem(currentOrder.id, item.id, newQty, item.comment)
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
      const tableId = tableIdParam ? parseInt(tableIdParam, 10) : undefined
      let guestId: number | undefined
      if (!hasSplitDraft && clientMode === 'new' && newClientPhone.trim()) {
        const guest = await loyaltyGuestApi.createOrReuseByPhone({
          phone: newClientPhone.trim(),
          name: newClientName.trim() || undefined
        })
        guestId = guest.id
      } else if (!hasSplitDraft && clientMode === 'select' && selectedGuest) {
        guestId = selectedGuest.id
      }
      const order = await restaurantService.createOrder({
        name: orderName || undefined,
        tableId,
        guestId
      })

      for (const pendingItem of pendingItems) {
        await restaurantService.addOrderItem(
          order.id,
          pendingItem.dish.id,
          pendingItem.qty,
          pendingItem.comment,
          pendingItem.selections
        )
      }

if (splitDraft && splitDraft.shares.length > 0) {
          const everyItemFullyAssigned = pendingItems.every((item, idx) =>
            splitDraft.shares.reduce((sum, s) => sum + (s.pendingQtys[idx] ?? 0), 0) === item.qty
          )
          const everyShareNonEmpty = splitDraft.shares.every(s =>
            s.name.trim() && Object.values(s.pendingQtys).some(q => q > 0)
          )
          if (everyItemFullyAssigned && everyShareNonEmpty) {
            const fullOrder = await restaurantService.getOrder(order.id)
            const orderItems = fullOrder.items || []
            const sharesBody: { name: string; itemQtys: { itemId: number; qty: number }[]; guestId?: number }[] = []
            for (const s of splitDraft.shares) {
              let shareGuestId: number | undefined = s.guestId
              if (!shareGuestId && s.newGuestPhone?.trim()) {
                const guest = await loyaltyGuestApi.createOrReuseByPhone({
                  phone: s.newGuestPhone.trim(),
                  name: s.newGuestName?.trim() || undefined,
                })
                shareGuestId = guest.id
              }
              sharesBody.push({
                name: s.name.trim(),
                itemQtys: pendingItems
                  .map((_, idx) => ({ itemId: orderItems[idx]?.id, qty: s.pendingQtys[idx] ?? 0 }))
                  .filter((x): x is { itemId: number; qty: number } => x.itemId != null && x.qty > 0),
                guestId: shareGuestId,
              })
            }
            if (sharesBody.every(sh => sh.itemQtys.length > 0)) {
              await splitService.createSplit(order.id, { shares: sharesBody })
            }
          }
        }

      setSplitDraft(null)
      setShowSplitDraftForm(false)
      setPendingItems([])
      navigate('/orders', { replace: true })
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
    : pendingItems.reduce((sum, item) => sum + (item.unitPrice ?? item.dish.price) * item.qty, 0)

  // Получаем список товаров для отображения
  const displayItems = currentOrder
    ? currentOrder.items || []
    : pendingItems.map((item, index) => ({
        id: index,
        dishId: item.dish.id,
        dishName: item.dish.name,
        qty: item.qty,
        price: item.unitPrice ?? item.dish.price,
        lineTotal: (item.unitPrice ?? item.dish.price) * item.qty,
        comment: item.comment,
        modifiers: item.modifiers,
      }))

  const hasSplitPanel =
    (!currentOrder && pendingItems.length > 0) ||
    (currentOrder != null &&
      currentOrder.status === 'OPEN' &&
      Array.isArray(currentOrder.items) &&
      currentOrder.items.length > 0)
  const hasSplitDraft = !currentOrder && splitDraft != null
  /** Новый заказ + активен черновик разделения: две отдельные колонки (позиции | гости) */
  const splitModeNewOrder = !currentOrder && splitDraft != null

  return (
    <div className="new-order-page">
      <h1>{orderIdParam ? 'Edit Order' : 'New Order'}</h1>
      <div className={`order-layout${splitModeNewOrder ? ' split-order-layout' : ''}`}>
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

        <div className={splitModeNewOrder ? 'order-side-split-root' : 'order-panel'}>
          <div className="order-panel-top">
          <div className="order-header">
            <h2>{orderIdParam ? 'Edit Order' : 'New Order'}</h2>
            {currentOrder && <span className="order-id">#{currentOrder.id}</span>}
            {currentOrder && currentOrder.status !== 'CANCELED' && (
              <button
                type="button"
                className={`btn-small ${currentOrder.paidAt ? 'btn-paid-active' : 'btn-paid-inactive'}`}
                onClick={async () => {
                  if (currentOrder.paidAt) {
                    setUnpaidReasonType('default')
                    setUnpaidCustomReason('')
                    setShowUnpaidModal(true)
                  } else {
                    try {
                      const updated = await restaurantService.markOrderPaid(currentOrder.id)
                      setCurrentOrder(prev => prev ? { ...prev, paidAt: updated.paidAt, unpaidReason: undefined } : null)
                    } catch (e: any) {
                      alert(e.response?.data?.message || 'Ошибка')
                    }
                  }
                }}
              >
                {currentOrder.paidAt ? '✅ Оплачено' : '💳 Отметить оплату'}
              </button>
            )}
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

          {!hasSplitDraft && (
          <div className="order-client-block">
            <label>Клиент:</label>
            {currentOrder && (currentOrder.guestId || currentOrder.guestLabel) && (
              <div className="current-guest">
                Сейчас: {currentOrder.guestLabel || `#${currentOrder.guestId}`}
              </div>
            )}
            <div className="client-mode-tabs">
              <button
                type="button"
                className={clientMode === 'none' ? 'active' : ''}
                onClick={() => {
                  setClientMode('none')
                  setSelectedGuest(null)
                  if (currentOrder?.guestId) void handleClearGuest()
                }}
              >
                Без клиента
              </button>
              <button
                type="button"
                className={clientMode === 'select' ? 'active' : ''}
                onClick={() => setClientMode('select')}
              >
                Выбрать из списка
              </button>
              <button
                type="button"
                className={clientMode === 'new' ? 'active' : ''}
                onClick={() => setClientMode('new')}
              >
                Новый клиент
              </button>
            </div>
            {clientMode === 'select' && (
              <div className="client-select">
                <input
                  type="text"
                  value={guestSearchQuery}
                  onChange={(e) => setGuestSearchQuery(e.target.value)}
                  placeholder="Поиск по имени или телефону..."
                  className="order-name-field"
                />
                {guestSearching && <span className="searching">Поиск...</span>}
                <ul className="guest-search-results">
                  {guestSearchResults.map((g) => (
                    <li key={g.id}>
                      <span>{[g.name, g.phoneNormalized].filter(Boolean).join(' — ') || g.phoneNormalized}</span>
                      {currentOrder ? (
                        <button type="button" className="btn-small btn-primary" onClick={() => handleApplyGuestToOrder(g.id)}>
                          Привязать
                        </button>
                      ) : (
                        <button type="button" className="btn-small btn-primary" onClick={() => handleSelectGuest(g)}>
                          Выбрать
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {!currentOrder && selectedGuest && (
                  <p className="selected-guest">Выбран: {selectedGuest.name || selectedGuest.phoneNormalized}</p>
                )}
              </div>
            )}
            {clientMode === 'new' && (
              <div className="client-new">
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Имя"
                  className="order-name-field"
                />
                <input
                  type="tel"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  placeholder="Телефон"
                  className="order-name-field"
                />
              </div>
            )}
          </div>
          )}
          </div>

          <div className={`order-panel-body${splitModeNewOrder ? ' split-mode-layout' : ''}`}>
            {splitModeNewOrder ? (
              <>
                <NewOrderItemsColumn
                  variant="splitColumn"
                  displayItems={displayItems}
                  currentOrder={currentOrder}
                  pendingItems={pendingItems}
                  availablePortions={availablePortions}
                  editingCommentFor={editingCommentFor}
                  editingCommentValue={editingCommentValue}
                  onEditingCommentValueChange={setEditingCommentValue}
                  onStartEditComment={setEditingCommentFor}
                  onCancelCommentEdit={() => {
                    setEditingCommentFor(null)
                    setEditingCommentValue('')
                  }}
                  onSaveComment={saveComment}
                  onUpdateQtyOrder={handleUpdateQty}
                  onRemoveOrderItem={handleRemoveItem}
                  onEditModifiers={handleEditItemModifiers}
                  onPendingQtyDec={(itemIndex) =>
                    setPendingItems((prev) =>
                      prev.map((pi, i) => (i === itemIndex && pi.qty > 1 ? { ...pi, qty: pi.qty - 1 } : pi))
                    )
                  }
                  onPendingQtyInc={(itemIndex) =>
                    setPendingItems((prev) => prev.map((pi, i) => (i === itemIndex ? { ...pi, qty: pi.qty + 1 } : pi)))
                  }
                  onPendingRemove={(itemIndex) => setPendingItems((prev) => prev.filter((_, i) => i !== itemIndex))}
                  onShowRecipe={(dishId, dishName) => void openDishRecipe(dishId, dishName)}
                />
                <NewOrderGuestSplitColumn
                  variant="splitColumn"
                  currentOrder={currentOrder}
                  pendingItems={pendingItems}
                  splitDraft={splitDraft}
                  setSplitDraft={setSplitDraft}
                  showSplitDraftForm={showSplitDraftForm}
                  setShowSplitDraftForm={setShowSplitDraftForm}
                  shareGuestPickIndex={shareGuestPickIndex}
                  setShareGuestPickIndex={setShareGuestPickIndex}
                  shareGuestSearchQuery={shareGuestSearchQuery}
                  setShareGuestSearchQuery={setShareGuestSearchQuery}
                  shareGuestSearchResults={shareGuestSearchResults}
                  shareGuestSearching={shareGuestSearching}
                  setShareGuestSearchResults={setShareGuestSearchResults}
                  onInitSplitDraft={() => {
                    setClientMode('none')
                    setSelectedGuest(null)
                    setNewClientName('')
                    setNewClientPhone('')
                    setShareGuestPickIndex(null)
                    setSplitDraft({ shares: [{ name: 'Гость 1', pendingQtys: {} }] })
                    setShowSplitDraftForm(true)
                  }}
                />
              </>
            ) : (
              <>
                {hasSplitPanel && (
                  <NewOrderGuestSplitColumn
                    variant="stacked"
                    currentOrder={currentOrder}
                    pendingItems={pendingItems}
                    splitDraft={splitDraft}
                    setSplitDraft={setSplitDraft}
                    showSplitDraftForm={showSplitDraftForm}
                    setShowSplitDraftForm={setShowSplitDraftForm}
                    shareGuestPickIndex={shareGuestPickIndex}
                    setShareGuestPickIndex={setShareGuestPickIndex}
                    shareGuestSearchQuery={shareGuestSearchQuery}
                    setShareGuestSearchQuery={setShareGuestSearchQuery}
                    shareGuestSearchResults={shareGuestSearchResults}
                    shareGuestSearching={shareGuestSearching}
                    setShareGuestSearchResults={setShareGuestSearchResults}
                    onInitSplitDraft={() => {
                      setClientMode('none')
                      setSelectedGuest(null)
                      setNewClientName('')
                      setNewClientPhone('')
                      setShareGuestPickIndex(null)
                      setSplitDraft({ shares: [{ name: 'Гость 1', pendingQtys: {} }] })
                      setShowSplitDraftForm(true)
                    }}
                  />
                )}
                <NewOrderItemsColumn
                  variant="scroll"
                  displayItems={displayItems}
                  currentOrder={currentOrder}
                  pendingItems={pendingItems}
                  availablePortions={availablePortions}
                  editingCommentFor={editingCommentFor}
                  editingCommentValue={editingCommentValue}
                  onEditingCommentValueChange={setEditingCommentValue}
                  onStartEditComment={setEditingCommentFor}
                  onCancelCommentEdit={() => {
                    setEditingCommentFor(null)
                    setEditingCommentValue('')
                  }}
                  onSaveComment={saveComment}
                  onUpdateQtyOrder={handleUpdateQty}
                  onRemoveOrderItem={handleRemoveItem}
                  onEditModifiers={handleEditItemModifiers}
                  onPendingQtyDec={(itemIndex) =>
                    setPendingItems((prev) =>
                      prev.map((pi, i) => (i === itemIndex && pi.qty > 1 ? { ...pi, qty: pi.qty - 1 } : pi))
                    )
                  }
                  onPendingQtyInc={(itemIndex) =>
                    setPendingItems((prev) => prev.map((pi, i) => (i === itemIndex ? { ...pi, qty: pi.qty + 1 } : pi)))
                  }
                  onPendingRemove={(itemIndex) => setPendingItems((prev) => prev.filter((_, i) => i !== itemIndex))}
                  onShowRecipe={(dishId, dishName) => void openDishRecipe(dishId, dishName)}
                />
              </>
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
                disabled={
                  (!currentOrder && pendingItems.length === 0) ||
                  saving ||
                  (splitDraft != null &&
                    !pendingItems.every((item, idx) =>
                      splitDraft.shares.reduce((sum, s) => sum + (s.pendingQtys[idx] ?? 0), 0) === item.qty
                    ))
                }
              >
                {saving ? 'Creating...' : currentOrder ? 'Done' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedDishWithOptions && (
        <DishOptionsModal
          dish={{
            id: selectedDishWithOptions.id,
            name: selectedDishWithOptions.name,
            price: selectedDishWithOptions.price,
            imageUrl: selectedDishWithOptions.imageUrl,
            optionGroups: selectedDishWithOptions.optionGroups,
          } as QrMenuItem}
          onAdd={handleOptionsPicked}
          onShowRecipe={() => void openDishRecipe(selectedDishWithOptions.id, selectedDishWithOptions.name)}
          onClose={() => {
            setSelectedDishWithOptions(null)
            setEditingTarget(null)
          }}
        />
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

      {showUnpaidModal && currentOrder && (
        <div className="modal-overlay" onClick={() => setShowUnpaidModal(false)}>
          <div className="modal-content unpaid-reason-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Причина снятия оплаты</h3>
            <div className="unpaid-reason-options">
              <label className="radio-label">
                <input
                  type="radio"
                  name="unpaidReasonNewOrder"
                  checked={unpaidReasonType === 'default'}
                  onChange={() => setUnpaidReasonType('default')}
                />
                Не прошла оплата
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="unpaidReasonNewOrder"
                  checked={unpaidReasonType === 'custom'}
                  onChange={() => setUnpaidReasonType('custom')}
                />
                Свой вариант
              </label>
              {unpaidReasonType === 'custom' && (
                <input
                  type="text"
                  className="order-name-field"
                  value={unpaidCustomReason}
                  onChange={(e) => setUnpaidCustomReason(e.target.value)}
                  placeholder="Введите причину..."
                  autoFocus
                />
              )}
            </div>
            <div className="modal-actions">
              <button
                className="btn-small btn-danger"
                onClick={async () => {
                  const reason = unpaidReasonType === 'custom' ? unpaidCustomReason.trim() : 'Не прошла оплата'
                  if (!reason) { alert('Укажите причину'); return }
                  try {
                    const updated = await restaurantService.markOrderUnpaid(currentOrder.id, reason)
                    setCurrentOrder(prev => prev ? { ...prev, paidAt: updated.paidAt, unpaidReason: updated.unpaidReason } : null)
                    setShowUnpaidModal(false)
                  } catch (e: any) {
                    alert(e.response?.data?.message || 'Не удалось снять оплату')
                  }
                }}
              >
                Снять оплату
              </button>
              <button className="btn-small" onClick={() => setShowUnpaidModal(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
