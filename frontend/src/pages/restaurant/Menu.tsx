import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { categoryService, restaurantService, optionTemplateService } from '../../api/services'
import type { OptionTemplate } from '../../api/services'
import { retryOnRateLimit } from '../../utils/apiRetry'
import { fillTransparentWithWhite } from '../../utils/imageBackground'
import { useOutletContext } from 'react-router-dom'
import type { DishCategory, Dish, Ingredient, RecipeItem, User } from '../../api/types'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import FormInput from '../../components/FormInput'
import SearchableSingleSelect from '../../components/SearchableSingleSelect'
import SearchBar from '../../components/SearchBar'
import './Menu.css'

const DISHES_PAGE_SIZE = 10

export default function Menu() {
  const { user } = useOutletContext<{ user?: User }>()
  const isAdmin = user?.role === 'ADMIN'
  
  const [categories, setCategories] = useState<DishCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<DishCategory | null>(null)
  const [dishes, setDishes] = useState<Dish[]>([])
  const [loadingDishes, setLoadingDishes] = useState(false)
  const [search, setSearch] = useState('')
  const [dishListPage, setDishListPage] = useState(1)
  
  // Category modals
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false)
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false)
  const [showImageModal, setShowImageModal] = useState(false)
  const [categoryForImageModal, setCategoryForImageModal] = useState<DishCategory | null>(null)
  const [categoryFormData, setCategoryFormData] = useState({ name: '' })
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Dish modals
  const [showCreateDishModal, setShowCreateDishModal] = useState(false)
  const [createDishBackdropConfirm, setCreateDishBackdropConfirm] = useState(false)
  const [showEditDishModal, setShowEditDishModal] = useState(false)
  const [showDishImageModal, setShowDishImageModal] = useState(false)
  const [dishForImageModal, setDishForImageModal] = useState<Dish | null>(null)
  const dishFileInputRef = useRef<HTMLInputElement>(null)
  const [dishFormData, setDishFormData] = useState({
    name: '',
    price: '',
    isActive: true,
    categoryId: undefined as number | undefined,
  })
  const [recipe, setRecipe] = useState<RecipeItem[]>([])
  const recipeRef = useRef<RecipeItem[]>([])
  const [newRecipeItem, setNewRecipeItem] = useState({ ingredientId: 0, qtyPerDish: '' })
  const [recipeQtyDrafts, setRecipeQtyDrafts] = useState<Record<number, string>>({})
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const ingredientSelectOptions = useMemo(
    () => ingredients.map((ing) => ({ value: ing.id, label: `${ing.name} (${ing.unit})` })),
    [ingredients]
  )
  const scaleIngredientOptions = useMemo(
    () => [{ value: null, label: '— ингредиент —' }, ...ingredientSelectOptions],
    [ingredientSelectOptions]
  )

  // ── Option templates state ──
  const [allTemplates, setAllTemplates] = useState<OptionTemplate[]>([])
  const [dishLinkedTemplateIds, setDishLinkedTemplateIds] = useState<number[]>([])
  const [showTemplatesModal, setShowTemplatesModal] = useState(false)
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false)
  const [newTemplate, setNewTemplate] = useState({
    key: '', title: '', type: 'SINGLE_REQUIRED', presentation: 'CHIPS',
    minSelect: '' as string, maxSelect: '' as string,
    minTotalQty: '' as string, maxTotalQty: '' as string,
    rangeMin: '' as string, rangeMax: '' as string,
    pricingMode: '' as string, pricePerUnit: '' as string,
    allowSameOptionTwice: false,
    scaleIngredientIds: [] as string[],
    scaleIngredientUnits: [] as string[],
    scaleIngredientTargets: [] as string[],
    stockScaleBase: '1' as string,
  })
  const [newTemplateItems, setNewTemplateItems] = useState<{
    title: string; priceDelta: string; valueInt?: string; isDefault?: boolean
    stockIngredientId?: string; stockQtyPerUnit?: string
  }[]>([])
  const [editingTemplate, setEditingTemplate] = useState<OptionTemplate | null>(null)
  const [showEditTemplateModal, setShowEditTemplateModal] = useState(false)
  const [editTemplate, setEditTemplate] = useState({
    key: '', title: '', type: 'SINGLE_REQUIRED', presentation: 'CHIPS',
    minSelect: '' as string, maxSelect: '' as string,
    minTotalQty: '' as string, maxTotalQty: '' as string,
    rangeMin: '' as string, rangeMax: '' as string,
    pricingMode: '' as string, pricePerUnit: '' as string,
    allowSameOptionTwice: false,
    scaleIngredientIds: [] as string[],
    scaleIngredientUnits: [] as string[],
    scaleIngredientTargets: [] as string[],
    stockScaleBase: '1' as string,
  })
  const [editTemplateItems, setEditTemplateItems] = useState<{
    id?: number
    title: string
    priceDelta: string
    valueInt?: string
    isDefault?: boolean
    stockIngredientId?: string
    stockQtyPerUnit?: string
    extraIngredients?: Array<{ ingredientId: string; qtyPerUnit: string }>
  }[]>([])

  // ── Inline (per-dish) modifiers ──
  interface InlineModifier {
    tempId: string
    title: string
    type: string
    presentation: string
    pricingMode: string
    pricePerUnit: string
    minSelect: string; maxSelect: string
    minTotalQty: string; maxTotalQty: string
    rangeMin: string; rangeMax: string
    allowSameOptionTwice: boolean
    /** Независимый масштаб: расход = targetQty * (v / anchorValue) для каждого ингредиента. */
    scaleIngredientIds?: string[]
    /** Для каждого ингредиента: "сколько единиц" (якорь v). */
    scaleIngredientUnits?: string[]
    /** Для каждого ингредиента: "количество изменения" (targetQty при выборе v=anchorValue). */
    scaleIngredientTargets?: string[]
    stockScaleBase?: string
    items: {
      title: string
      priceDelta: string
      valueInt?: string
      isDefault?: boolean
      /** Доп. списание на 1 ед. optionQty (как в рецепте, кг/шт) */
      stockIngredientId?: string
      stockQtyPerUnit?: string
      extraIngredients?: Array<{ ingredientId: string; qtyPerUnit: string }>
    }[]
  }
  const [inlineModifiers, setInlineModifiers] = useState<InlineModifier[]>([])
  const [showInlineForm, setShowInlineForm] = useState(false)
  const [editingInlineIndex, setEditingInlineIndex] = useState<number | null>(null)

  const resetCreateDishModalState = useCallback(() => {
    setCreateDishBackdropConfirm(false)
    setShowCreateDishModal(false)
    setDishFormData({ name: '', price: '', isActive: true, categoryId: undefined })
    setRecipe([])
    setRecipeQtyDrafts({})
    recipeRef.current = []
    setNewRecipeItem({ ingredientId: 0, qtyPerDish: '' })
    setRecipeQtyDrafts({})
    setDishLinkedTemplateIds([])
    setInlineModifiers([])
    setShowInlineForm(false)
    setEditingInlineIndex(null)
  }, [])

  useEffect(() => {
    if (!createDishBackdropConfirm) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setCreateDishBackdropConfirm(false)
        return
      }
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        e.stopPropagation()
        resetCreateDishModalState()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [createDishBackdropConfirm, resetCreateDishModalState])
  const presets: Record<string, string> = {
    SINGLE_REQUIRED: 'CHIPS', SINGLE_OPTIONAL: 'RADIO',
    MULTI: 'CHECKBOX', MULTI_REQUIRED: 'CHECKBOX',
    MULTI_QTY_TOTAL_LIMIT: 'CARDS', RANGE_STEPPER: 'STEPPER',
    EXCLUSIONS: 'CHECKBOX', HALF_AND_HALF: 'CARDS',
  }
  const emptyInline = (): InlineModifier => ({
    tempId: `_inline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: '', type: 'SINGLE_REQUIRED', presentation: 'CHIPS',
    pricingMode: '', pricePerUnit: '',
    minSelect: '', maxSelect: '', minTotalQty: '', maxTotalQty: '',
    rangeMin: '', rangeMax: '', allowSameOptionTwice: false,
    scaleIngredientIds: [], stockScaleBase: '1',
    scaleIngredientUnits: [],
    scaleIngredientTargets: [],
    items: [],
  })
  const [currentInline, setCurrentInline] = useState<InlineModifier>(emptyInline())

  const loadTemplates = useCallback(async () => {
    try {
      const data = await optionTemplateService.list()
      setAllTemplates(data)
    } catch (e) { console.error('Failed to load templates', e) }
  }, [])

  const loadDishTemplates = useCallback(async (dishId: number) => {
    try {
      const ids = await optionTemplateService.getDishTemplates(dishId)
      setDishLinkedTemplateIds(ids)
    } catch (e) { console.error('Failed to load dish templates', e); setDishLinkedTemplateIds([]) }
  }, [])

  useEffect(() => {
    loadCategories()
    loadTemplates()
  }, [])

  useEffect(() => {
    if (selectedCategory) {
      loadDishesForCategory()
      loadIngredients()
    }
  }, [selectedCategory])

  useEffect(() => {
    setDishListPage(1)
  }, [selectedCategory?.id, search])

  const loadCategories = async () => {
    setLoading(true)
    try {
      const data = await retryOnRateLimit(() => categoryService.getCategories(), 1, 200)
      setCategories(data)
    } catch (error) {
      console.error('Failed to load categories:', error)
      setCategories([])
    } finally {
      setLoading(false)
    }
  }

  const loadDishesForCategory = async () => {
    if (!selectedCategory) return
    setLoadingDishes(true)
    try {
      const data = await retryOnRateLimit(
        () => restaurantService.getDishesByCategory(selectedCategory.id),
        1,
        200
      )
      setDishes(data.filter((d) => d.isActive))
    } catch (error) {
      console.error('Failed to load dishes for category:', error)
      setDishes([])
    } finally {
      setLoadingDishes(false)
    }
  }

  const loadIngredients = async () => {
    try {
      const data = await retryOnRateLimit(() => restaurantService.getIngredients(), 1, 200)
      setIngredients(data)
    } catch (error) {
      console.error('Failed to load ingredients:', error)
      setIngredients([])
    }
  }

  const handleCategoryClick = (category: DishCategory) => {
    setSelectedCategory(category)
    setSearch('')
    // Закрываем все модальные окна при переходе к блюдам
    setShowImageModal(false)
    setShowEditCategoryModal(false)
    setShowCreateCategoryModal(false)
  }

  const handleBackToCategories = () => {
    setSelectedCategory(null)
    setDishes([])
    setSearch('')
    // Закрываем все модальные окна при возврате к категориям
    setShowImageModal(false)
    setShowEditCategoryModal(false)
    setShowCreateCategoryModal(false)
    setShowCreateDishModal(false)
    setShowEditDishModal(false)
  }

  // Category handlers
  const handleCreateCategory = async () => {
    try {
      await categoryService.createCategory(categoryFormData.name)
      setShowCreateCategoryModal(false)
      setCategoryFormData({ name: '' })
      loadCategories()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to create category')
    }
  }

  const handleEditCategory = (category: DishCategory) => {
    setSelectedCategory(category)
    setCategoryFormData({ name: category.name })
    setShowEditCategoryModal(true)
  }

  const handleUpdateCategory = async () => {
    if (!selectedCategory) return
    try {
      await categoryService.updateCategory(selectedCategory.id, categoryFormData.name)
      setShowEditCategoryModal(false)
      setCategoryFormData({ name: '' })
      loadCategories()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to update category')
    }
  }

  const handleDeleteCategory = async (category: DishCategory) => {
    if (!confirm(`Удалить категорию "${category.name}"?`)) return
    try {
      await categoryService.deleteCategory(category.id)
      loadCategories()
      if (selectedCategory?.id === category.id) {
        handleBackToCategories()
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete category')
    }
  }

  const handleImageClick = (e: React.MouseEvent, category: DishCategory) => {
    e.stopPropagation() // Предотвращаем всплытие события
    // Сохраняем категорию для модального окна отдельно, чтобы не переключаться на просмотр блюд
    setCategoryForImageModal(category)
    setShowImageModal(true)
  }

  const handleImageUpload = async () => {
    if (!categoryForImageModal || !fileInputRef.current?.files?.[0]) {
      setShowImageModal(false)
      setCategoryForImageModal(null)
      return
    }
    
    const file = fileInputRef.current.files[0]
    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, выберите изображение')
      return
    }

    try {
      let fileToUpload = file
      try {
        fileToUpload = await fillTransparentWithWhite(file)
      } catch (_) {
        // при ошибке (например, не изображение) загружаем как есть
      }
      await categoryService.uploadCategoryImage(categoryForImageModal.id, fileToUpload)
      setShowImageModal(false)
      setCategoryForImageModal(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      loadCategories()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to upload image')
    }
  }

  // Dish handlers
  const handleCreateDish = async () => {
    if (!selectedCategory) return
    const price = parseFloat(dishFormData.price as string)
    if (!dishFormData.name || dishFormData.price === '' || isNaN(price) || price <= 0) {
      alert('Пожалуйста, заполните все обязательные поля с корректными значениями')
      return
    }

    try {
      const newDish = await restaurantService.createDish({
        ...dishFormData,
        price: price,
        categoryId: selectedCategory.id,
      })
      
      const currentRecipe = recipeRef.current.length > recipe.length ? recipeRef.current : recipe
      
      if (currentRecipe.length > 0) {
        await restaurantService.updateRecipe(newDish.id, currentRecipe)
      }

      const allIds = [...dishLinkedTemplateIds]
      for (const im of inlineModifiers) {
        const created = await createInlineTemplate(im)
        if (created) allIds.push(created.id)
      }
      if (allIds.length > 0) {
        await optionTemplateService.setDishTemplates(newDish.id, allIds)
      }

      setCreateDishBackdropConfirm(false)
      setShowCreateDishModal(false)
      setDishFormData({ name: '', price: '', isActive: true, categoryId: undefined })
      setRecipe([])
      setRecipeQtyDrafts({})
      recipeRef.current = []
      setNewRecipeItem({ ingredientId: 0, qtyPerDish: '' })
      setDishLinkedTemplateIds([])
      setInlineModifiers([])
      setShowInlineForm(false)
      setEditingInlineIndex(null)
      loadDishesForCategory()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to create dish')
    }
  }

  const handleEditDish = (dish: Dish) => {
    setEditingDish(dish)
    setDishFormData({
      name: dish.name,
      price: dish.price.toString(),
      isActive: dish.isActive,
      categoryId: dish.categoryId,
    })
    setShowEditDishModal(true)
    setInlineModifiers([])
    setShowInlineForm(false)
    setEditingInlineIndex(null)
    restaurantService.getRecipe(dish.id).then((recipeData) => {
      setRecipe(recipeData)
      setRecipeQtyDrafts({})
      recipeRef.current = recipeData
    })
    loadDishTemplates(dish.id)
    loadTemplates()
  }

  const [editingDish, setEditingDish] = useState<Dish | null>(null)

  const handleUpdateDish = async () => {
    if (!editingDish) return
    
    try {
      await restaurantService.updateDish(editingDish.id, {
        name: dishFormData.name,
        price: parseFloat(dishFormData.price),
        isActive: dishFormData.isActive,
        categoryId: dishFormData.categoryId,
      })
      
      if (recipeRef.current.length > 0 || recipe.length > 0) {
        await restaurantService.updateRecipe(editingDish.id, recipe)
      }

      const allIds = [...dishLinkedTemplateIds]
      for (const im of inlineModifiers) {
        const created = await createInlineTemplate(im)
        if (created) allIds.push(created.id)
      }
      await optionTemplateService.setDishTemplates(editingDish.id, allIds)
      
      await loadDishesForCategory()
      setShowEditDishModal(false)
      setEditingDish(null)
      setDishFormData({ name: '', price: '', isActive: true, categoryId: undefined })
      setRecipe([])
      setRecipeQtyDrafts({})
      recipeRef.current = []
      setDishLinkedTemplateIds([])
      setInlineModifiers([])
      setEditingInlineIndex(null)
    } catch (error: any) {
      console.error('Failed to update dish:', error)
      alert(error.response?.data?.message || 'Не удалось обновить блюдо')
    }
  }

  const handleToggleActive = async (dish: Dish) => {
    try {
      await restaurantService.updateDish(dish.id, {
        name: dish.name,
        price: dish.price,
        isActive: !dish.isActive,
        categoryId: dish.categoryId,
      })
      loadDishesForCategory()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to update dish')
    }
  }

  const handleDeleteDish = async (dish: Dish) => {
    if (!confirm(`Удалить блюдо "${dish.name}"?`)) return
    try {
      await restaurantService.deleteDish(dish.id)
      loadDishesForCategory()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete dish')
    }
  }

  const handleAddRecipeItem = () => {
    if (newRecipeItem.ingredientId === 0 || !newRecipeItem.qtyPerDish) {
      alert('Пожалуйста, выберите ингредиент и укажите количество')
      return
    }

    const ingredient = ingredients.find((i) => i.id === newRecipeItem.ingredientId)
    if (!ingredient) return

    const newItem: RecipeItem = {
      ingredientId: newRecipeItem.ingredientId,
      ingredientName: ingredient.name,
      qtyPerDish: parseFloat(newRecipeItem.qtyPerDish),
      unit: ingredient.unit,
    }

    const updatedRecipe = [...recipe, newItem]
    setRecipe(updatedRecipe)
    recipeRef.current = updatedRecipe
    setNewRecipeItem({ ingredientId: 0, qtyPerDish: '' })
  }

  const handleRemoveRecipeItem = (ingredientId: number) => {
    const updatedRecipe = recipe.filter((item) => item.ingredientId !== ingredientId)
    setRecipe(updatedRecipe)
    recipeRef.current = updatedRecipe
    setRecipeQtyDrafts((prev) => {
      const next = { ...prev }
      delete next[ingredientId]
      return next
    })
  }

  const handleUpdateRecipeItemQty = (ingredientId: number, rawQty: string) => {
    setRecipeQtyDrafts((prev) => ({ ...prev, [ingredientId]: rawQty }))
    if (rawQty.trim() === '') return
    const nextQty = parseFloat(rawQty)
    if (!Number.isFinite(nextQty) || nextQty < 0) return
    const updatedRecipe = recipe.map((item) =>
      item.ingredientId === ingredientId ? { ...item, qtyPerDish: nextQty } : item
    )
    setRecipe(updatedRecipe)
    recipeRef.current = updatedRecipe
  }

  const handleRecipeQtyBlur = (ingredientId: number) => {
    setRecipeQtyDrafts((prev) => {
      if (!(ingredientId in prev)) return prev
      const next = { ...prev }
      const draft = (next[ingredientId] ?? '').trim()
      if (draft === '') {
        // Если пользователь очистил и ушел из поля — вернем текущее значение рецепта.
        const item = recipe.find((r) => r.ingredientId === ingredientId)
        next[ingredientId] = item ? String(item.qtyPerDish) : ''
      } else {
        // Валидное/невалидное число уже обработано на onChange; оставляем как есть.
      }
      return next
    })
  }

  const createInlineTemplate = async (im: InlineModifier) => {
    const payload: any = {
      key: im.tempId,
      title: im.title,
      type: im.type,
      presentation: im.presentation,
      isActive: true, sortOrder: 0,
      items: im.items
        .filter((i) => ((i.valueInt ?? i.title ?? '').toString().trim()))
        .map((i, idx) => {
          const titleVal = (i.valueInt != null && i.valueInt !== '' ? String(i.valueInt) : (i.title || '').trim()).trim()
          return {
            title: titleVal,
            priceDelta: parseFloat(i.priceDelta) || 0,
            sortOrder: idx,
            ...(i.valueInt ? { valueInt: parseInt(i.valueInt) } : {}),
            ...(i.isDefault ? { isDefault: true } : {}),
            ...(i.stockIngredientId ? { stockIngredientId: parseInt(i.stockIngredientId, 10) } : {}),
            ...(i.stockIngredientId && i.stockQtyPerUnit?.trim()
              ? { stockQtyPerUnit: parseFloat(i.stockQtyPerUnit) } : {}),
            ...(i.extraIngredients && i.extraIngredients.length > 0
              ? {
                  extraIngredients: i.extraIngredients
                    .filter((x) => x.ingredientId && x.qtyPerUnit && parseFloat(x.qtyPerUnit) > 0)
                    .map((x) => ({
                      ingredientId: parseInt(x.ingredientId, 10),
                      qtyPerUnit: parseFloat(x.qtyPerUnit),
                    })),
                }
              : {}),
          }
        }),
    }
    if (im.minSelect) payload.minSelect = parseInt(im.minSelect)
    if (im.maxSelect) payload.maxSelect = parseInt(im.maxSelect)
    if (im.minTotalQty) payload.minTotalQty = parseInt(im.minTotalQty)
    if (im.maxTotalQty) payload.maxTotalQty = parseInt(im.maxTotalQty)
    if (im.rangeMin) payload.rangeMin = parseInt(im.rangeMin)
    if (im.rangeMax) payload.rangeMax = parseInt(im.rangeMax)
    if (im.pricingMode) payload.pricingMode = im.pricingMode
    if (im.pricePerUnit) payload.pricePerUnit = parseFloat(im.pricePerUnit)
    if (im.allowSameOptionTwice) payload.allowSameOptionTwice = true
    const scaleIngredients = (im.scaleIngredientIds ?? []).map((idStr, idx) => {
      const ingredientId = idStr ? parseInt(idStr, 10) : NaN
      const anchorValue = (im.scaleIngredientUnits?.[idx] ?? '1') ? parseFloat(im.scaleIngredientUnits?.[idx] ?? '1') : 1
      const targetQty = (im.scaleIngredientTargets?.[idx] ?? '') !== '' ? parseFloat(im.scaleIngredientTargets?.[idx] ?? '0') : NaN
      const ok = Number.isFinite(ingredientId) && ingredientId > 0 && Number.isFinite(anchorValue) && anchorValue > 0 && Number.isFinite(targetQty) && targetQty >= 0
      if (!ok) return null
      return { ingredientId, anchorValue, targetQty }
    }).filter(Boolean) as any[]
    if (scaleIngredients.length > 0) {
      payload.scaleIngredients = scaleIngredients
      payload.stockIngredientId = null
      payload.stockScaleBase = 1
    }
    return optionTemplateService.create(payload)
  }

  const toggleTemplate = (tid: number) => {
    setDishLinkedTemplateIds(prev =>
      prev.includes(tid) ? prev.filter(x => x !== tid) : [...prev, tid]
    )
  }

  const handleCreateTemplate = async () => {
    const payload: any = {
      key: 'TPL_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      title: newTemplate.title,
      type: newTemplate.type,
      presentation: newTemplate.presentation,
      isActive: true,
      sortOrder: 0,
      items: newTemplateItems
        .filter((i) => ((i.valueInt ?? i.title ?? '').toString().trim()))
        .map((i, idx) => {
          const titleVal = (i.valueInt != null && i.valueInt !== '' ? String(i.valueInt) : (i.title || '').trim()).trim()
          return {
            title: titleVal,
            priceDelta: parseFloat(i.priceDelta) || 0,
            sortOrder: idx,
            ...(i.valueInt ? { valueInt: parseInt(i.valueInt) } : {}),
            ...(i.isDefault ? { isDefault: true } : {}),
            ...(i.stockIngredientId ? { stockIngredientId: parseInt(i.stockIngredientId, 10) } : {}),
            ...(i.stockIngredientId && i.stockQtyPerUnit?.trim()
              ? { stockQtyPerUnit: parseFloat(i.stockQtyPerUnit) } : {}),
          }
        }),
    }
    if (newTemplate.minSelect) payload.minSelect = parseInt(newTemplate.minSelect)
    if (newTemplate.maxSelect) payload.maxSelect = parseInt(newTemplate.maxSelect)
    if (newTemplate.minTotalQty) payload.minTotalQty = parseInt(newTemplate.minTotalQty)
    if (newTemplate.maxTotalQty) payload.maxTotalQty = parseInt(newTemplate.maxTotalQty)
    if (newTemplate.rangeMin) payload.rangeMin = parseInt(newTemplate.rangeMin)
    if (newTemplate.rangeMax) payload.rangeMax = parseInt(newTemplate.rangeMax)
    if (newTemplate.pricingMode) payload.pricingMode = newTemplate.pricingMode
    if (newTemplate.pricePerUnit) payload.pricePerUnit = parseFloat(newTemplate.pricePerUnit)
    if (newTemplate.allowSameOptionTwice) payload.allowSameOptionTwice = true
    const scaleIngredients = (newTemplate.scaleIngredientIds ?? []).map((idStr, idx) => {
      const ingredientId = idStr ? parseInt(idStr, 10) : NaN
      const anchorValue = (newTemplate.scaleIngredientUnits?.[idx] ?? '1') ? parseFloat(newTemplate.scaleIngredientUnits?.[idx] ?? '1') : 1
      const targetQty = (newTemplate.scaleIngredientTargets?.[idx] ?? '') !== '' ? parseFloat(newTemplate.scaleIngredientTargets?.[idx] ?? '0') : NaN
      const ok = Number.isFinite(ingredientId) && ingredientId > 0 && Number.isFinite(anchorValue) && anchorValue > 0 && Number.isFinite(targetQty) && targetQty >= 0
      if (!ok) return null
      return { ingredientId, anchorValue, targetQty }
    }).filter(Boolean) as any[]
    if (scaleIngredients.length > 0) {
      payload.scaleIngredients = scaleIngredients
      payload.stockIngredientId = null
      payload.stockScaleBase = 1
    }

    try {
      await optionTemplateService.create(payload)
      setShowCreateTemplateModal(false)
      setNewTemplate({
        key: '', title: '', type: 'SINGLE_REQUIRED', presentation: 'CHIPS',
        minSelect: '', maxSelect: '', minTotalQty: '', maxTotalQty: '',
        rangeMin: '', rangeMax: '', pricingMode: '', pricePerUnit: '',
        allowSameOptionTwice: false,
        scaleIngredientIds: [], scaleIngredientUnits: [], scaleIngredientTargets: [], stockScaleBase: '1',
      })
      setNewTemplateItems([])
      loadTemplates()
    } catch (error: any) {
      alert(error.response?.data?.message || error.response?.data?.error || 'Не удалось создать шаблон')
    }
  }

  const handleDeleteTemplate = async (id: number) => {
    if (!confirm('Удалить шаблон модификатора?')) return
    try {
      await optionTemplateService.remove(id)
      loadTemplates()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Не удалось удалить шаблон')
    }
  }

  const openEditTemplate = (t: OptionTemplate) => {
    setEditingTemplate(t)
    const scaleIngredientIds = (t.scaleIngredients ?? []).map((s) => String(s.ingredientId))
    const scaleUnits = (t.scaleIngredients ?? []).map((s) => (s.anchorValue != null ? String(s.anchorValue) : '1'))
    const scaleTargets = (t.scaleIngredients ?? []).map((s) => {
      const targetQty = s.targetQty != null ? s.targetQty : 0
      if (targetQty > 0) return String(targetQty)
      const rec = recipe.find((r) => r.ingredientId === s.ingredientId)
      return rec ? String(rec.qtyPerDish) : ''
    })
    setEditTemplate({
      key: t.key, title: t.title, type: t.type, presentation: t.presentation,
      minSelect: t.minSelect != null ? String(t.minSelect) : '',
      maxSelect: t.maxSelect != null ? String(t.maxSelect) : '',
      minTotalQty: t.minTotalQty != null ? String(t.minTotalQty) : '',
      maxTotalQty: t.maxTotalQty != null ? String(t.maxTotalQty) : '',
      rangeMin: t.rangeMin != null ? String(t.rangeMin) : '',
      rangeMax: t.rangeMax != null ? String(t.rangeMax) : '',
      pricingMode: t.pricingMode || '',
      pricePerUnit: t.pricePerUnit != null ? String(t.pricePerUnit) : '',
      allowSameOptionTwice: !!t.allowSameOptionTwice,
      scaleIngredientIds: scaleIngredientIds,
      scaleIngredientUnits: scaleUnits,
      scaleIngredientTargets: scaleTargets,
      stockScaleBase: t.stockScaleBase != null ? String(t.stockScaleBase) : '1',
    })
    setEditTemplateItems(t.items.map(i => ({
      id: i.id,
      title: i.title,
      priceDelta: String(i.priceDelta),
      valueInt: i.valueInt != null ? String(i.valueInt) : undefined,
      isDefault: !!i.isDefault,
      stockIngredientId: i.stockIngredientId != null ? String(i.stockIngredientId) : '',
      stockQtyPerUnit: i.stockQtyPerUnit != null ? String(i.stockQtyPerUnit) : '',
      extraIngredients: i.extraIngredients && i.extraIngredients.length > 0
        ? i.extraIngredients.map((x) => ({ ingredientId: String(x.ingredientId), qtyPerUnit: String(x.qtyPerUnit) }))
        : [{ ingredientId: i.stockIngredientId != null ? String(i.stockIngredientId) : '', qtyPerUnit: i.stockQtyPerUnit != null ? String(i.stockQtyPerUnit) : '' }],
    })))
    setShowEditTemplateModal(true)
  }

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return
    try {
      const payload: any = {
        key: editTemplate.key, title: editTemplate.title,
        type: editTemplate.type, presentation: editTemplate.presentation,
        isActive: true, sortOrder: 0,
      }
      if (editTemplate.minSelect) payload.minSelect = parseInt(editTemplate.minSelect)
      if (editTemplate.maxSelect) payload.maxSelect = parseInt(editTemplate.maxSelect)
      if (editTemplate.minTotalQty) payload.minTotalQty = parseInt(editTemplate.minTotalQty)
      if (editTemplate.maxTotalQty) payload.maxTotalQty = parseInt(editTemplate.maxTotalQty)
      if (editTemplate.rangeMin) payload.rangeMin = parseInt(editTemplate.rangeMin)
      if (editTemplate.rangeMax) payload.rangeMax = parseInt(editTemplate.rangeMax)
      if (editTemplate.pricingMode) payload.pricingMode = editTemplate.pricingMode
      if (editTemplate.pricePerUnit) payload.pricePerUnit = parseFloat(editTemplate.pricePerUnit)
      if (editTemplate.allowSameOptionTwice) payload.allowSameOptionTwice = true
      const scaleIngredients = (editTemplate.scaleIngredientIds ?? []).map((idStr, idx) => {
        const ingredientId = idStr ? parseInt(idStr, 10) : NaN
        const anchorValue = (editTemplate.scaleIngredientUnits?.[idx] ?? '1') ? parseFloat(editTemplate.scaleIngredientUnits?.[idx] ?? '1') : 1
        const targetQty = (editTemplate.scaleIngredientTargets?.[idx] ?? '') !== '' ? parseFloat(editTemplate.scaleIngredientTargets?.[idx] ?? '0') : NaN
        const ok = Number.isFinite(ingredientId) && ingredientId > 0 && Number.isFinite(anchorValue) && anchorValue > 0 && Number.isFinite(targetQty) && targetQty >= 0
        if (!ok) return null
        return { ingredientId, anchorValue, targetQty }
      }).filter(Boolean) as any[]
      if (scaleIngredients.length > 0) {
        payload.scaleIngredients = scaleIngredients
        payload.stockIngredientId = null
        payload.stockScaleBase = 1
      }
      await optionTemplateService.update(editingTemplate.id, payload)

      // Пересобираем набор опций целиком, чтобы изменения существующих опций тоже сохранялись.
      for (const orig of editingTemplate.items) {
        if (orig.id != null) {
          await optionTemplateService.removeItem(editingTemplate.id, orig.id)
        }
      }
      for (const item of editTemplateItems) {
        const titleVal = (item.valueInt != null && item.valueInt !== '' ? String(item.valueInt) : (item.title || '').trim()).trim()
        if (!titleVal) continue
        await optionTemplateService.addItem(editingTemplate.id, {
          title: titleVal, priceDelta: parseFloat(item.priceDelta) || 0, sortOrder: 0,
          ...(item.valueInt ? { valueInt: parseInt(item.valueInt) } : {}),
          ...(item.isDefault ? { isDefault: true } : {}),
          ...(item.stockIngredientId ? { stockIngredientId: parseInt(item.stockIngredientId, 10) } : {}),
          ...(item.stockIngredientId && item.stockQtyPerUnit ? { stockQtyPerUnit: parseFloat(item.stockQtyPerUnit) } : {}),
          ...(item.extraIngredients && item.extraIngredients.length > 0
            ? {
                extraIngredients: item.extraIngredients
                  .filter((x) => x.ingredientId && x.qtyPerUnit && parseFloat(x.qtyPerUnit) > 0)
                  .map((x) => ({
                    ingredientId: parseInt(x.ingredientId, 10),
                    qtyPerUnit: parseFloat(x.qtyPerUnit),
                  })),
              }
            : {}),
        })
      }

      setShowEditTemplateModal(false)
      setEditingTemplate(null)
      loadTemplates()
    } catch (error: any) {
      alert(error.response?.data?.message || error.response?.data?.error || 'Не удалось сохранить шаблон')
    }
  }

  const renderTemplateLinker = () => {
    const typeLabels: Record<string, string> = {
      SINGLE_REQUIRED: 'один обязательный',
      SINGLE_OPTIONAL: 'один необязательный', // только для отображения старых шаблонов
      MULTI: 'несколько', MULTI_REQUIRED: 'неск. обязат.',
      MULTI_QTY_TOTAL_LIMIT: 'с количеством', RANGE_STEPPER: 'диапазон',
      EXCLUSIONS: 'исключения', HALF_AND_HALF: '50/50',
    }
    const globalTemplates = allTemplates.filter(t => t.isActive && !t.key.startsWith('_inline_'))
    const dishInlineTemplates = allTemplates.filter(t => t.key.startsWith('_inline_') && dishLinkedTemplateIds.includes(t.id))

    return (
      <div style={{ marginTop: '20px', borderTop: '1px solid #ddd', paddingTop: '20px' }}>
        <h3 style={{ marginBottom: '6px' }}>Модификаторы</h3>

        {/* Section 1: Global (shared) templates */}
        {globalTemplates.length > 0 && (<>
          <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
            <strong>Общие шаблоны</strong> — одинаковые для всех блюд, которые их используют.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {globalTemplates.map(t => (
              <label key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '14px', cursor: 'pointer',
                padding: '8px 10px', borderRadius: '6px', border: dishLinkedTemplateIds.includes(t.id) ? '1.5px solid #4f46e5' : '1px solid #e0e0e0',
                background: dishLinkedTemplateIds.includes(t.id) ? '#f0f0ff' : '#fff', transition: '.15s' }}>
                <input type="checkbox" checked={dishLinkedTemplateIds.includes(t.id)} onChange={() => toggleTemplate(t.id)}
                  style={{ width: '16px', height: '16px', marginTop: '2px', accentColor: '#4f46e5' }} />
                <div>
                  <strong>{t.title}</strong>
                  <span style={{ color: '#888', fontSize: '12px', marginLeft: '6px' }}>({typeLabels[t.type] || t.type})</span>
                  <br />
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    {t.items.length > 0 ? t.items.map(i => `${i.title}${i.priceDelta > 0 ? ` +${i.priceDelta}₽` : ''}`).join(', ') : 'нет опций'}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </>)}

        {/* Section 2: Existing inline (per-dish) modifiers */}
        {dishInlineTemplates.length > 0 && (<>
          <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
            <strong>Уникальные для этого блюда</strong> — цены и при необходимости расход ингредиентов (в «Ред.» шаблона).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {dishInlineTemplates.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                borderRadius: '6px', border: '1.5px solid #059669', background: '#ecfdf5', fontSize: '14px' }}>
                <div style={{ flex: 1 }}>
                  <strong>{t.title}</strong>
                  <span style={{ color: '#888', fontSize: '12px', marginLeft: '6px' }}>({typeLabels[t.type] || t.type})</span>
                  <br />
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    {t.items.map(i => `${i.title}${i.priceDelta > 0 ? ` +${i.priceDelta}₽` : ''}`).join(', ')}
                  </span>
                </div>
                <button className="btn-small btn-secondary" onClick={() => openEditTemplate(t)} title="Редактировать">
                  Ред.
                </button>
                <button className="btn-small btn-danger" onClick={() => {
                  setDishLinkedTemplateIds(prev => prev.filter(id => id !== t.id))
                }} title="Отвязать от блюда">×</button>
              </div>
            ))}
          </div>
        </>)}

        {/* Section 3: Pending inline modifiers (not yet saved) */}
        {inlineModifiers.length > 0 && (<>
          <p style={{ fontSize: '12px', color: '#065f46', marginBottom: '8px', fontWeight: 500 }}>
            Новые модификаторы (будут созданы при сохранении):
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            {inlineModifiers.map((im, idx) => (
              <div key={im.tempId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                borderRadius: '6px', border: '1.5px dashed #059669', background: '#f0fdf4', fontSize: '14px' }}>
                <div style={{ flex: 1 }}>
                  <strong>{im.title || '(без названия)'}</strong>
                  <span style={{ color: '#888', fontSize: '12px', marginLeft: '6px' }}>({typeLabels[im.type] || im.type})</span>
                  {im.items.length > 0 && <>
                    <br />
                    <span style={{ fontSize: '12px', color: '#666' }}>
                      {im.items.map(i => `${(i.valueInt ?? i.title ?? '')}${parseFloat(i.priceDelta) > 0 ? ` +${i.priceDelta}₽` : ''}`).join(', ')}
                      {(() => {
                        const bits: string[] = []
                        const scaleIds = im.scaleIngredientIds ?? []
                        scaleIds.forEach((id) => {
                          const ing = ingredients.find((x) => x.id === parseInt(id, 10))
                          if (ing) bits.push(`расход×выбор: ${ing.name}`)
                        })
                        im.items.forEach((it) => {
                          if (it.stockIngredientId && it.stockQtyPerUnit) {
                            const ing = ingredients.find((x) => x.id === parseInt(it.stockIngredientId!, 10))
                            if (ing) bits.push(`+${it.stockQtyPerUnit} ${ing.name} («${it.title}»)`)
                          }
                        })
                        return bits.length ? (
                          <><br /><span style={{ color: '#059669' }}>{bits.join('; ')}</span></>
                        ) : null
                      })()}
                    </span>
                  </>}
                </div>
                <button className="btn-small btn-secondary" onClick={() => {
                  setCurrentInline({
                    ...im,
                    scaleIngredientIds: im.scaleIngredientIds ?? [],
                    scaleIngredientUnits: (im as any).scaleIngredientUnits ?? [],
                    scaleIngredientTargets: (im as any).scaleIngredientTargets ?? [],
                    stockScaleBase: im.stockScaleBase ?? '1',
                    items: im.items.map((it) => ({
                      ...it,
                      stockIngredientId: it.stockIngredientId ?? '',
                      stockQtyPerUnit: it.stockQtyPerUnit ?? '',
                      extraIngredients: (it as any).extraIngredients?.map((x: any) => ({
                        ingredientId: String(x.ingredientId),
                        qtyPerUnit: String(x.qtyPerUnit),
                      })) ?? [],
                    })),
                  })
                  setEditingInlineIndex(idx)
                  setShowInlineForm(true)
                }} title="Редактировать">Ред.</button>
                <button className="btn-small btn-danger" onClick={() => setInlineModifiers(prev => prev.filter((_, i) => i !== idx))}>×</button>
              </div>
            ))}
          </div>
        </>)}

        {/* Section 4: Inline modifier creation form */}
        {showInlineForm ? renderInlineModifierForm() : (
          <button className="btn-small btn-secondary" style={{ marginTop: '4px' }}
            onClick={() => { setCurrentInline(emptyInline()); setEditingInlineIndex(null); setShowInlineForm(true) }}>
            + Добавить модификатор к этому блюду
          </button>
        )}
      </div>
    )
  }

  const renderInlineModifierForm = () => {
    const ci = currentInline
    const isLookup = ci.type === 'RANGE_STEPPER' && (ci.pricingMode || 'PER_UNIT') === 'LOOKUP'
    const hideOptions = ci.type === 'RANGE_STEPPER' && !isLookup
    const allowDefaultInline = ci.type === 'SINGLE_REQUIRED' || ci.type === 'MULTI'
    const typeLabelsInline: Record<string, string> = {
      SINGLE_REQUIRED: 'Один обязательный',
      MULTI: 'Несколько (галочки)',
      MULTI_REQUIRED: 'Несколько обязательных',
      MULTI_QTY_TOTAL_LIMIT: 'С количеством (+/−)',
      RANGE_STEPPER: 'Число в диапазоне',
      EXCLUSIONS: 'Исключения',
      HALF_AND_HALF: 'Половина + половина',
    }
    return (
      <div style={{ border: '2px solid #059669', borderRadius: '8px', padding: '14px', background: '#f0fdf4', marginTop: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <strong style={{ color: '#065f46' }}>
            {editingInlineIndex === null ? 'Новый модификатор для этого блюда' : 'Редактирование модификатора'}
          </strong>
          <button className="btn-small" style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#666' }}
            onClick={() => { setShowInlineForm(false); setEditingInlineIndex(null); }}>×</button>
        </div>

        <FormInput label="Название *" value={ci.title} placeholder="напр. Ярусы торта"
          onChange={v => setCurrentInline(p => ({ ...p, title: v }))} />

        <div style={{ marginTop: '8px', marginBottom: '8px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500 }}>Тип</label>
          <select value={ci.type} onChange={e => {
            const v = e.target.value
            setCurrentInline(p => ({ ...p, type: v, presentation: presets[v] || p.presentation }))
          }} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }}>
            {Object.entries(typeLabelsInline).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <p style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>
            Гость всегда выбирает одну опцию. Можно отметить одну опцию как выбранную по умолчанию (например «1 котлета»).
          </p>
        </div>

        {/* Type-specific fields */}
        {(ci.type === 'MULTI' || ci.type === 'MULTI_REQUIRED' || ci.type === 'EXCLUSIONS') && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            {ci.type === 'MULTI_REQUIRED' && <div style={{ width: '140px' }}>
              <FormInput label="Мин. выборов" type="number" value={ci.minSelect} onChange={v => setCurrentInline(p => ({ ...p, minSelect: v }))} />
            </div>}
            <div style={{ width: '140px' }}>
              <FormInput label="Макс. выборов" type="number" value={ci.maxSelect} onChange={v => setCurrentInline(p => ({ ...p, maxSelect: v }))} />
            </div>
          </div>
        )}
        {(ci.type === 'MULTI_QTY_TOTAL_LIMIT' || ci.type === 'HALF_AND_HALF') && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <div style={{ width: '160px' }}>
              <FormInput label="Макс. штук всего" type="number" value={ci.maxTotalQty} onChange={v => setCurrentInline(p => ({ ...p, maxTotalQty: v }))} />
            </div>
            <div style={{ width: '160px' }}>
              <FormInput label="Мин. штук" type="number" value={ci.minTotalQty} onChange={v => setCurrentInline(p => ({ ...p, minTotalQty: v }))} />
            </div>
          </div>
        )}
        {ci.type === 'HALF_AND_HALF' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px', cursor: 'pointer' }}>
            <input type="checkbox" checked={ci.allowSameOptionTwice}
              onChange={e => setCurrentInline(p => ({ ...p, allowSameOptionTwice: e.target.checked }))} />
            Можно одну опцию дважды
          </label>
        )}
        {(ci.type === 'RANGE_STEPPER' || ci.type === 'SINGLE_REQUIRED' || ci.type === 'SINGLE_OPTIONAL') && (
          <div style={{ marginBottom: '12px', padding: '12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
            <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '13px', color: '#1e3a8a' }}>
              Масштаб ингредиентов по выбранному числу (1 / 2 / 3…)
            </div>
            <p style={{ fontSize: '12px', color: '#334155', margin: '0 0 10px', lineHeight: 1.45 }}>
              Ингредиенты из рецепта: их норма <strong>умножается</strong> на число, которое гость выбрал. Можно добавить несколько. Ниже у каждой опции — <strong>доп. расход</strong> других ингредиентов.
            </p>
            {(ci.scaleIngredientIds ?? []).map((ingId, siIdx) => (
              <div key={siIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px', minWidth: 140 }}>
                  <SearchableSingleSelect<number>
                    value={ingId ? parseInt(ingId, 10) : null}
                    options={scaleIngredientOptions}
                    maxVisibleItems={4}
                    searchPlaceholder="Поиск ингредиента..."
                    nothingFoundText="Ничего не найдено"
                    onChange={(selected) => {
                      const selectedStr = selected != null ? String(selected) : ''
                      setCurrentInline((p) => {
                        const list = [...(p.scaleIngredientIds ?? [])]
                        list[siIdx] = selectedStr
                        const rec = selected != null ? recipe.find((r) => r.ingredientId === selected) : undefined
                        const newUnits = [...(p.scaleIngredientUnits ?? [])]
                        const newTargets = [...(p.scaleIngredientTargets ?? [])]
                        newUnits[siIdx] = '1'
                        newTargets[siIdx] = rec ? String(rec.qtyPerDish) : ''
                        return { ...p, scaleIngredientIds: list, scaleIngredientUnits: newUnits, scaleIngredientTargets: newTargets }
                      })
                    }}
                  />
                </div>
                {(() => {
                  if (!ingId) return null
                  const selectedId = parseInt(ingId, 10)
                  if (!Number.isFinite(selectedId)) return null
                  const rec = recipe.find((r) => r.ingredientId === selectedId)
                  const unitsStr = ci.scaleIngredientUnits?.[siIdx] ?? '1'
                  const targetStr = ci.scaleIngredientTargets?.[siIdx] ?? ''
                  return (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div style={{ width: '130px' }}>
                        <FormInput
                          label="кол-во"
                          type="number"
                          value={targetStr}
                          placeholder="например 200"
                          onChange={(next) => {
                            setCurrentInline((p) => {
                              const arr = [...(p.scaleIngredientTargets ?? [])]
                              arr[siIdx] = next
                              return { ...p, scaleIngredientTargets: arr }
                            })
                          }}
                        />
                      </div>
                      <div style={{ width: '90px' }}>
                        <FormInput
                          label="ед."
                          type="number"
                          value={unitsStr}
                          placeholder="например 3"
                          onChange={(v) => {
                            setCurrentInline((p) => {
                              const arr = [...(p.scaleIngredientUnits ?? [])]
                              arr[siIdx] = v
                              return { ...p, scaleIngredientUnits: arr }
                            })
                          }}
                        />
                      </div>
                      {rec?.unit && <span style={{ fontSize: '11px', color: '#64748b', paddingBottom: '8px' }}>{rec.unit}</span>}
                    </div>
                  )
                })()}
                <button type="button" className="btn-small btn-danger" style={{ padding: '4px 8px' }}
                  onClick={() => setCurrentInline((p) => ({
                    ...p,
                    scaleIngredientIds: (p.scaleIngredientIds ?? []).filter((_, i) => i !== siIdx),
                    scaleIngredientUnits: (p.scaleIngredientUnits ?? []).filter((_, i) => i !== siIdx),
                    scaleIngredientTargets: (p.scaleIngredientTargets ?? []).filter((_, i) => i !== siIdx),
                  }))}>×</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
              <button type="button" className="btn-small btn-secondary"
                onClick={() => setCurrentInline((p) => ({
                  ...p,
                  scaleIngredientIds: [...(p.scaleIngredientIds ?? []), ''],
                  scaleIngredientUnits: [...(p.scaleIngredientUnits ?? []), '1'],
                  scaleIngredientTargets: [...(p.scaleIngredientTargets ?? []), ''],
                }))}>
                + ингредиент
              </button>
            </div>
          </div>
        )}
        {ci.type === 'RANGE_STEPPER' && (<>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <div style={{ width: '120px' }}>
              <FormInput label="От" type="number" value={ci.rangeMin} onChange={v => setCurrentInline(p => ({ ...p, rangeMin: v }))} />
            </div>
            <div style={{ width: '120px' }}>
              <FormInput label="До" type="number" value={ci.rangeMax} onChange={v => setCurrentInline(p => ({ ...p, rangeMax: v }))} />
            </div>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500 }}>Расчёт цены</label>
            <select value={ci.pricingMode || 'PER_UNIT'} onChange={e => setCurrentInline(p => ({ ...p, pricingMode: e.target.value }))}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }}>
              <option value="PER_UNIT">Одинаковая цена за единицу</option>
              <option value="LOOKUP">Своя цена за каждый шаг</option>
            </select>
          </div>
          {(ci.pricingMode || 'PER_UNIT') === 'PER_UNIT' && (
            <div style={{ width: '180px', marginBottom: '8px' }}>
              <FormInput label="Цена за единицу (₽)" type="number" value={ci.pricePerUnit}
                onChange={v => setCurrentInline(p => ({ ...p, pricePerUnit: v }))} />
            </div>
          )}
        </>)}

        {/* Options */}
        {!hideOptions && (<>
          <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', marginTop: '6px' }}>Опции</div>
          <p style={{ fontSize: '11px', color: '#64748b', margin: '0 0 8px' }}>
            Число (1/2/3), дельта цены. Ниже — <strong>доп. расход</strong>: что ещё списывается при выборе этой опции (можно несколько ингредиентов; количество — на 1 шт. опции).
          </p>
          {ci.items.map((item, idx) => (
            <div key={idx} style={{ marginBottom: '12px', padding: '10px', border: '1px solid #dbe4ee', borderRadius: '8px', background: '#ffffff' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {(ci.type !== 'RANGE_STEPPER' && ci.type !== 'SINGLE_REQUIRED') && (
                  <div style={{ flex: '1 1 140px' }}>
                    <FormInput label="" value={item.title} placeholder="Название"
                      onChange={v => setCurrentInline(p => {
                        const items = [...p.items]; items[idx] = { ...items[idx], title: v }; return { ...p, items }
                      })} />
                  </div>
                )}
              {(ci.type === 'RANGE_STEPPER' || ci.type === 'SINGLE_REQUIRED' || ci.type === 'SINGLE_OPTIONAL') && (
                  <div style={{ width: '90px' }}>
                    <FormInput label={idx === 0 ? 'Число' : ''} type="number" value={item.valueInt ?? ''} placeholder="1/2/3"
                      onChange={v => setCurrentInline(p => {
                        const items = [...p.items]; items[idx] = { ...items[idx], valueInt: v }; return { ...p, items }
                      })} />
                  </div>
                )}
                <div style={{ width: '110px' }}>
                  <FormInput label={idx === 0 ? 'Цена, ₽' : ''} type="number" value={item.priceDelta} placeholder="0"
                    onChange={v => setCurrentInline(p => {
                      const items = [...p.items]; items[idx] = { ...items[idx], priceDelta: v }; return { ...p, items }
                    })} />
                </div>
                {allowDefaultInline && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '116px', fontSize: '12px', color: '#444' }}>
                    <input
                      type="checkbox"
                      checked={!!item.isDefault}
                      onChange={e => setCurrentInline(p => {
                        const items = [...p.items]
                        items[idx] = { ...items[idx], isDefault: e.target.checked }
                        if (p.type === 'SINGLE_REQUIRED' && e.target.checked) {
                          for (let j = 0; j < items.length; j++) if (j !== idx) items[j] = { ...items[j], isDefault: false }
                        }
                        return { ...p, items }
                      })}
                    />
                    По умолч.
                  </label>
                )}
                <button className="btn-small btn-danger" style={{ height: '34px', padding: '0 10px', marginLeft: 'auto' }}
                  onClick={() => setCurrentInline(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}>×</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Доп. расход ингредиентов для этой опции</span>
                {(item.extraIngredients && item.extraIngredients.length > 0
                  ? item.extraIngredients
                  : [{ ingredientId: item.stockIngredientId ?? '', qtyPerUnit: item.stockQtyPerUnit ?? '' }]
                ).map((ex, exIdx) => (
                  <div key={exIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px', minWidth: 180, maxWidth: 320 }}>
                      <SearchableSingleSelect<number>
                        value={ex.ingredientId ? parseInt(ex.ingredientId, 10) : null}
                        options={scaleIngredientOptions}
                        maxVisibleItems={4}
                        searchPlaceholder="Поиск ингредиента..."
                        nothingFoundText="Ничего не найдено"
                        onChange={(selected) => setCurrentInline((p) => {
                          const items = [...p.items]
                          const list = (items[idx].extraIngredients && items[idx].extraIngredients!.length > 0
                            ? [...items[idx].extraIngredients!]
                            : [{ ingredientId: items[idx].stockIngredientId ?? '', qtyPerUnit: items[idx].stockQtyPerUnit ?? '' }])
                          list[exIdx] = { ...list[exIdx], ingredientId: selected != null ? String(selected) : '' }
                          items[idx] = { ...items[idx], extraIngredients: list, stockIngredientId: '', stockQtyPerUnit: '' }
                          return { ...p, items }
                        })}
                      />
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={0.001}
                      placeholder="кол-во на 1 шт"
                      value={ex.qtyPerUnit}
                      onChange={(e) => setCurrentInline((p) => {
                        const items = [...p.items]
                        const list = (items[idx].extraIngredients && items[idx].extraIngredients!.length > 0
                          ? [...items[idx].extraIngredients!]
                          : [{ ingredientId: items[idx].stockIngredientId ?? '', qtyPerUnit: items[idx].stockQtyPerUnit ?? '' }])
                        list[exIdx] = { ...list[exIdx], qtyPerUnit: e.target.value }
                        items[idx] = { ...items[idx], extraIngredients: list, stockIngredientId: '', stockQtyPerUnit: '' }
                        return { ...p, items }
                      })}
                      style={{ width: '130px', padding: '8px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '6px' }}
                    />
                    <button
                      className="btn-small btn-danger"
                      style={{ height: '30px', padding: '0 8px' }}
                      onClick={() => setCurrentInline((p) => {
                        const items = [...p.items]
                        const list = (items[idx].extraIngredients && items[idx].extraIngredients!.length > 0
                          ? [...items[idx].extraIngredients!]
                          : [{ ingredientId: items[idx].stockIngredientId ?? '', qtyPerUnit: items[idx].stockQtyPerUnit ?? '' }])
                        const next = list.filter((_, i) => i !== exIdx)
                        items[idx] = { ...items[idx], extraIngredients: next.length > 0 ? next : [{ ingredientId: '', qtyPerUnit: '' }], stockIngredientId: '', stockQtyPerUnit: '' }
                        return { ...p, items }
                      })}
                    >×</button>
                  </div>
                ))}
                <button
                  className="btn-small btn-secondary"
                  style={{ width: 'fit-content', fontSize: '12px' }}
                  onClick={() => setCurrentInline((p) => {
                    const items = [...p.items]
                    const list = (items[idx].extraIngredients && items[idx].extraIngredients!.length > 0
                      ? [...items[idx].extraIngredients!]
                      : [{ ingredientId: items[idx].stockIngredientId ?? '', qtyPerUnit: items[idx].stockQtyPerUnit ?? '' }])
                    list.push({ ingredientId: '', qtyPerUnit: '' })
                    items[idx] = { ...items[idx], extraIngredients: list, stockIngredientId: '', stockQtyPerUnit: '' }
                    return { ...p, items }
                  })}
                >+ ингредиент</button>
              </div>
            </div>
          ))}
          <button className="btn-small btn-secondary" style={{ fontSize: '12px', marginTop: '4px' }}
            onClick={() => setCurrentInline(p => ({
              ...p,
              items: [...p.items, { title: '', priceDelta: '0', isDefault: false, stockIngredientId: '', stockQtyPerUnit: '', extraIngredients: [{ ingredientId: '', qtyPerUnit: '' }] }],
            }))}>
            + опция
          </button>
        </>)}

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
          <button className="btn-small btn-secondary" onClick={() => { setShowInlineForm(false); setEditingInlineIndex(null); }}>Отмена</button>
          <button className="btn-small btn-primary" disabled={!ci.title.trim()}
            onClick={() => {
              if (editingInlineIndex === null) {
                setInlineModifiers(prev => [...prev, currentInline])
              } else {
                setInlineModifiers(prev => prev.map((item, i) => i === editingInlineIndex ? currentInline : item))
              }
              setShowInlineForm(false)
              setEditingInlineIndex(null)
            }}>{editingInlineIndex === null ? 'Добавить' : 'Сохранить'}</button>
        </div>
      </div>
    )
  }

  const filteredDishes = dishes.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  )

  const dishTotalPages = Math.max(1, Math.ceil(filteredDishes.length / DISHES_PAGE_SIZE))
  const dishPageSafe = Math.min(dishListPage, dishTotalPages)
  const dishPageStart = (dishPageSafe - 1) * DISHES_PAGE_SIZE
  const paginatedDishes = filteredDishes.slice(dishPageStart, dishPageStart + DISHES_PAGE_SIZE)

  const categoryColumns = [
    {
      key: 'image',
      header: 'Изображение',
      render: (item: DishCategory) => (
        <div className="category-image-cell">
          {item.imageUrl ? (
            <>
              <div className="img-wrap">
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="category-thumbnail"
                  onError={(e) => {
                    console.error('Failed to load image:', item.imageUrl)
                    e.currentTarget.style.display = 'none'
                    const cell = e.currentTarget.closest('.category-image-cell')
                    const placeholder = cell?.querySelector('.category-thumbnail-placeholder') as HTMLElement
                    if (placeholder) {
                      placeholder.style.display = 'flex'
                    }
                  }}
                />
              </div>
              <div className="category-thumbnail-placeholder" style={{ display: 'none' }}>
                <span>{item.name.charAt(0).toUpperCase()}</span>
              </div>
            </>
          ) : (
            <div className="category-thumbnail-placeholder">
              <span>{item.name.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <button
            className="btn-image-upload"
            onClick={(e) => handleImageClick(e, item)}
            title="Загрузить изображение"
          >
            📷
          </button>
        </div>
      ),
    },
    { 
      key: 'name', 
      header: 'Название',
      render: (item: DishCategory) => (
        <span 
          style={{ cursor: 'pointer', color: '#667eea', textDecoration: 'underline' }}
          onClick={() => handleCategoryClick(item)}
        >
          {item.name}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Действия',
      render: (item: DishCategory) => (
        <div className="action-buttons">
          <button className="btn-small btn-secondary" onClick={() => handleEditCategory(item)}>
            Редактировать
          </button>
          <button className="btn-small btn-danger" onClick={() => handleDeleteCategory(item)}>
            Удалить
          </button>
        </div>
      ),
    },
  ]

  const handleDishImageClick = (e: React.MouseEvent, dish: Dish) => {
    e.stopPropagation()
    setDishForImageModal(dish)
    setShowDishImageModal(true)
  }

  const handleDishImageUpload = async () => {
    if (!dishForImageModal || !dishFileInputRef.current?.files?.[0]) {
      setShowDishImageModal(false)
      setDishForImageModal(null)
      return
    }
    
    const file = dishFileInputRef.current.files[0]
    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, выберите изображение')
      return
    }

    try {
      let fileToUpload = file
      try {
        fileToUpload = await fillTransparentWithWhite(file)
      } catch (_) {
        // при ошибке загружаем исходный файл
      }
      await restaurantService.uploadDishImage(dishForImageModal.id, fileToUpload)
      setShowDishImageModal(false)
      setDishForImageModal(null)
      if (dishFileInputRef.current) {
        dishFileInputRef.current.value = ''
      }
      loadDishesForCategory()
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to upload image')
    }
  }

  const dishColumns = [
    {
      key: 'image',
      header: 'Изображение',
      render: (item: Dish) => (
        <div className="dish-image-cell">
          {item.imageUrl ? (
            <>
              <div className="img-wrap">
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="dish-thumbnail"
                  onError={(e) => {
                    console.error('Failed to load dish image:', item.imageUrl)
                    e.currentTarget.style.display = 'none'
                    const cell = e.currentTarget.closest('.dish-image-cell')
                    const placeholder = cell?.querySelector('.dish-thumbnail-placeholder') as HTMLElement
                    if (placeholder) {
                      placeholder.style.display = 'flex'
                    }
                  }}
                />
              </div>
              <div className="dish-thumbnail-placeholder" style={{ display: 'none' }}>
                <span>{item.name.charAt(0).toUpperCase()}</span>
              </div>
            </>
          ) : (
            <div className="dish-thumbnail-placeholder">
              <span>{item.name.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <button
            className="btn-image-upload"
            onClick={(e) => handleDishImageClick(e, item)}
            title="Загрузить изображение"
          >
            📷
          </button>
        </div>
      ),
    },
    { key: 'name', header: 'Название' },
    {
      key: 'price',
      header: 'Цена',
      render: (item: Dish) => `₽${item.price.toFixed(2)}`,
    },
    {
      key: 'isActive',
      header: 'Статус',
      render: (item: Dish) => (
        <span className={item.isActive ? 'status-active' : 'status-inactive'}>
          {item.isActive ? 'Активно' : 'Неактивно'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Действия',
      render: (item: Dish) => (
        <div className="action-buttons">
          <button className="btn-small btn-secondary" onClick={() => handleEditDish(item)}>
            Редактировать
          </button>
          <button className="btn-small btn-secondary" onClick={() => handleToggleActive(item)}>
            {item.isActive ? 'Деактивировать' : 'Активировать'}
          </button>
          <button className="btn-small btn-danger" onClick={() => handleDeleteDish(item)}>
            Удалить
          </button>
        </div>
      ),
    },
  ]

  if (selectedCategory) {
    // Show dishes for selected category
    return (
      <div style={{ padding: '20px' }}>
        <div className="page-header">
          <button className="btn-back" onClick={handleBackToCategories}>
            ← Назад к категориям
          </button>
          <h1>Блюда категории: {selectedCategory.name}</h1>
          {isAdmin && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-primary" onClick={() => { setShowCreateDishModal(true); loadTemplates(); setDishLinkedTemplateIds([]); setInlineModifiers([]); setShowInlineForm(false); setEditingInlineIndex(null) }}>
                Создать блюдо
              </button>
              <button className="btn-secondary" onClick={() => { loadTemplates(); setShowTemplatesModal(true) }}>
                Шаблоны модификаторов
              </button>
            </div>
          )}
        </div>

        <SearchBar value={search} onChange={setSearch} placeholder="Поиск блюд..." />

        <DataTable
          data={paginatedDishes}
          columns={dishColumns}
          loading={loadingDishes}
          emptyMessage="Блюда не найдены"
        />

        {!loadingDishes && filteredDishes.length > 0 && dishTotalPages > 1 && (
          <div className="dish-pagination">
            <button
              type="button"
              className="btn-secondary"
              disabled={dishPageSafe <= 1}
              onClick={() => setDishListPage(Math.max(1, dishPageSafe - 1))}
            >
              Назад
            </button>
            <span className="dish-pagination-info">
              Страница {dishPageSafe} из {dishTotalPages} ({filteredDishes.length} блюд)
            </span>
            <button
              type="button"
              className="btn-secondary"
              disabled={dishPageSafe >= dishTotalPages}
              onClick={() => setDishListPage(Math.min(dishTotalPages, dishPageSafe + 1))}
            >
              Вперёд
            </button>
          </div>
        )}

        {/* Create Dish Modal */}
        {isAdmin && showCreateDishModal && (
          <Modal
            isOpen={showCreateDishModal}
            onClose={resetCreateDishModalState}
            onBackdropClick={() => setCreateDishBackdropConfirm(true)}
            title="Создать блюдо"
            size="large"
          >
            <FormInput
              label="Название"
              value={dishFormData.name}
              onChange={(v) => setDishFormData({ ...dishFormData, name: v })}
              required
            />
            <FormInput
              label="Цена"
              type="number"
              value={dishFormData.price}
              onChange={(v) => setDishFormData({ ...dishFormData, price: v })}
              min={0}
              step={0.01}
              required
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={dishFormData.isActive}
                onChange={(e) => setDishFormData({ ...dishFormData, isActive: e.target.checked })}
              />
              Активно
            </label>

            {/* Recipe section */}
            <div style={{ marginTop: '20px', borderTop: '1px solid #ddd', paddingTop: '20px' }}>
              <h3 style={{ marginBottom: '15px' }}>Рецепт (необязательно)</h3>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 500, color: '#333' }}>
                    Ингредиент
                  </label>
                  <SearchableSingleSelect<number>
                    value={newRecipeItem.ingredientId === 0 ? null : newRecipeItem.ingredientId}
                    options={ingredientSelectOptions}
                    onChange={(v) => setNewRecipeItem({ ...newRecipeItem, ingredientId: v ?? 0 })}
                    placeholder="Выберите ингредиент..."
                    searchPlaceholder="Поиск по названию..."
                    maxVisibleItems={4}
                    nothingFoundText="Ничего не найдено"
                  />
                </div>
                <div style={{ width: '120px' }}>
                  <FormInput
                    label="Количество"
                    type="number"
                    value={newRecipeItem.qtyPerDish}
                    onChange={(v) => setNewRecipeItem({ ...newRecipeItem, qtyPerDish: v })}
                    min={0}
                    step={1}
                  />
                </div>
                <button
                  type="button"
                  className="btn-small btn-primary"
                  onClick={handleAddRecipeItem}
                  style={{ height: '42px', alignSelf: 'flex-end' }}
                >
                  Добавить
                </button>
              </div>

              {recipe.length > 0 && (
                <div style={{ marginTop: '15px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>
                    Добавленные ингредиенты:
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
                    {recipe.map((item) => (
                        <div
                          key={item.ingredientId}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px',
                            borderBottom: '1px solid #eee',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <strong>{item.ingredientName}</strong>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input
                                type="number"
                                min={0}
                                step={0.001}
                                value={recipeQtyDrafts[item.ingredientId] ?? String(item.qtyPerDish)}
                                onChange={(e) => handleUpdateRecipeItemQty(item.ingredientId, e.target.value)}
                                onBlur={() => handleRecipeQtyBlur(item.ingredientId)}
                                style={{ width: '90px', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}
                              />
                              <span style={{ color: '#666', fontSize: '14px' }}>{item.unit}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-small btn-secondary"
                            onClick={() => handleRemoveRecipeItem(item.ingredientId)}
                          >
                            Удалить
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>

            {renderTemplateLinker()}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={resetCreateDishModalState}>
                Отмена
              </button>
              <button className="btn-primary" onClick={handleCreateDish}>
                Создать
              </button>
            </div>
          </Modal>
        )}

        {isAdmin && createDishBackdropConfirm && showCreateDishModal && (
          <div
            className="modal-overlay"
            style={{ zIndex: 1100 }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="create-dish-discard-title"
            onClick={() => setCreateDishBackdropConfirm(false)}
          >
            <div
              className="modal modal-small"
              style={{ padding: '24px', maxWidth: '420px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <p id="create-dish-discard-title" style={{ margin: '0 0 20px', fontSize: '16px', lineHeight: 1.5 }}>
                Вы уверены, что хотите сбросить процесс создания блюда?
              </p>
              <div className="modal-actions" style={{ marginBottom: 0, display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-primary" autoFocus onClick={resetCreateDishModalState}>
                  Да
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCreateDishBackdropConfirm(false)}
                >
                  Нет
                </button>
              </div>
              <p style={{ margin: '14px 0 0', fontSize: '12px', color: '#666' }}>
                Esc — остаться в форме · Пробел — сбросить и закрыть
              </p>
            </div>
          </div>
        )}

        {/* Edit Dish Modal */}
        {isAdmin && showEditDishModal && editingDish && (
          <Modal
            isOpen={showEditDishModal}
            onClose={() => {
              setShowEditDishModal(false)
              setEditingDish(null)
              setDishFormData({ name: '', price: '', isActive: true, categoryId: undefined })
              setRecipe([])
              setRecipeQtyDrafts({})
              recipeRef.current = []
              setNewRecipeItem({ ingredientId: 0, qtyPerDish: '' })
            }}
            title="Редактировать блюдо"
            size="large"
          >
            <FormInput
              label="Название"
              value={dishFormData.name}
              onChange={(v) => setDishFormData({ ...dishFormData, name: v })}
              required
            />
            <FormInput
              label="Цена"
              type="number"
              value={dishFormData.price}
              onChange={(v) => setDishFormData({ ...dishFormData, price: v })}
              min={0}
              step={0.01}
              required
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={dishFormData.isActive}
                onChange={(e) => setDishFormData({ ...dishFormData, isActive: e.target.checked })}
              />
              Активно
            </label>

            {/* Recipe section */}
            <div style={{ marginTop: '20px', borderTop: '1px solid #ddd', paddingTop: '20px' }}>
              <h3 style={{ marginBottom: '15px' }}>Рецепт (необязательно)</h3>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 500, color: '#333' }}>
                    Ингредиент
                  </label>
                  <SearchableSingleSelect<number>
                    value={newRecipeItem.ingredientId === 0 ? null : newRecipeItem.ingredientId}
                    options={ingredientSelectOptions}
                    onChange={(v) => setNewRecipeItem({ ...newRecipeItem, ingredientId: v ?? 0 })}
                    placeholder="Выберите ингредиент..."
                    searchPlaceholder="Поиск по названию..."
                    maxVisibleItems={4}
                    nothingFoundText="Ничего не найдено"
                  />
                </div>
                <div style={{ width: '120px' }}>
                  <FormInput
                    label="Количество"
                    type="number"
                    value={newRecipeItem.qtyPerDish}
                    onChange={(v) => setNewRecipeItem({ ...newRecipeItem, qtyPerDish: v })}
                    min={0}
                    step={1}
                  />
                </div>
                <button
                  type="button"
                  className="btn-small btn-primary"
                  onClick={handleAddRecipeItem}
                  style={{ height: '42px', alignSelf: 'flex-end' }}
                >
                  Добавить
                </button>
              </div>

              {recipe.length > 0 && (
                <div style={{ marginTop: '15px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px' }}>
                    Добавленные ингредиенты:
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
                    {recipe.map((item) => (
                        <div
                          key={item.ingredientId}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px',
                            borderBottom: '1px solid #eee',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <strong>{item.ingredientName}</strong>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input
                                type="number"
                                min={0}
                                step={0.001}
                                value={recipeQtyDrafts[item.ingredientId] ?? String(item.qtyPerDish)}
                                onChange={(e) => handleUpdateRecipeItemQty(item.ingredientId, e.target.value)}
                                onBlur={() => handleRecipeQtyBlur(item.ingredientId)}
                                style={{ width: '90px', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}
                              />
                              <span style={{ color: '#666', fontSize: '14px' }}>{item.unit}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-small btn-secondary"
                            onClick={() => handleRemoveRecipeItem(item.ingredientId)}
                          >
                            Удалить
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>

            {renderTemplateLinker()}

            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowEditDishModal(false)
                  setEditingDish(null)
                  setDishFormData({ name: '', price: '', isActive: true, categoryId: undefined })
                  setRecipe([])
                  setRecipeQtyDrafts({})
                  recipeRef.current = []
                  setNewRecipeItem({ ingredientId: 0, qtyPerDish: '' })
                  setDishLinkedTemplateIds([])
                }}
              >
                Отмена
              </button>
              <button className="btn-primary" onClick={handleUpdateDish}>
                Сохранить
              </button>
            </div>
          </Modal>
        )}

        {/* Dish Image Upload Modal */}
        {isAdmin && (
          <Modal
            isOpen={showDishImageModal && dishForImageModal !== null}
            onClose={() => {
              setShowDishImageModal(false)
              setDishForImageModal(null)
              if (dishFileInputRef.current) {
                dishFileInputRef.current.value = ''
              }
            }}
            title={`Загрузить изображение для "${dishForImageModal?.name || ''}"`}
          >
            <div className="image-upload-section">
              <input
                ref={dishFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                style={{ marginBottom: '15px' }}
              />
              <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
                Выберите PNG/JPEG изображение для блюда
              </p>
              {dishForImageModal?.imageUrl && (
                <div className="current-image-preview">
                  <p>Текущее изображение:</p>
                  <div className="preview-image-wrap">
                    <img
                      src={dishForImageModal.imageUrl}
                      alt={dishForImageModal.name}
                      className="preview-image"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowDishImageModal(false)
                  setDishForImageModal(null)
                  if (dishFileInputRef.current) {
                    dishFileInputRef.current.value = ''
                  }
                }}
              >
                Отмена
              </button>
              <button className="btn-primary" onClick={handleDishImageUpload}>
                Загрузить
              </button>
            </div>
          </Modal>
        )}

        {/* Templates management modal */}
        <Modal isOpen={showTemplatesModal} onClose={() => setShowTemplatesModal(false)} title="Шаблоны модификаторов" size="large">
          <div style={{ background: '#f0f4ff', borderRadius: '8px', padding: '12px 16px', marginBottom: '14px', fontSize: '13px', color: '#444', lineHeight: 1.6 }}>
            Здесь вы создаёте <strong>шаблоны</strong> — наборы опций (молоко, сиропы, объём и т.д.).
            Затем при создании или редактировании блюда привяжите нужные шаблоны в секции «Модификаторы».
            Гости увидят их в QR-меню при заказе.
          </div>
          <div style={{ marginBottom: '15px' }}>
            <button className="btn-primary" onClick={() => setShowCreateTemplateModal(true)}>+ Создать новый шаблон</button>
          </div>
          {allTemplates.filter(t => !t.key.startsWith('_inline_')).length === 0 ? (
            <p style={{ color: '#888' }}>Шаблонов пока нет. Нажмите кнопку выше, чтобы создать первый.</p>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {allTemplates.filter(t => !t.key.startsWith('_inline_')).map(t => {
                const typeLabels: Record<string, string> = {
                  SINGLE_REQUIRED: 'Один обязательный',
                  SINGLE_OPTIONAL: 'Один необязательный',
                  MULTI: 'Несколько', MULTI_REQUIRED: 'Неск. обязат.',
                  MULTI_QTY_TOTAL_LIMIT: 'С количеством', RANGE_STEPPER: 'Диапазон',
                  EXCLUSIONS: 'Исключения', HALF_AND_HALF: '50/50',
                }
                return (
                  <div key={t.id} style={{ padding: '12px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: '15px' }}>{t.title}</strong>
                      <span style={{ background: '#e8eaff', color: '#4f46e5', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', marginLeft: '8px' }}>
                        {typeLabels[t.type] || t.type}
                      </span>
                      <br />
                      <span style={{ fontSize: '13px', color: '#666' }}>
                        {t.items.length > 0
                          ? t.items.map(i => `${i.title}${i.priceDelta > 0 ? ` (+${i.priceDelta}₽)` : ''}`).join(', ')
                          : <em>нет опций</em>}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button className="btn-small btn-secondary" onClick={() => openEditTemplate(t)}>Редактировать</button>
                      <button className="btn-small btn-danger" onClick={() => handleDeleteTemplate(t.id)}>Удалить</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="modal-actions">
            <button className="btn-secondary" onClick={() => setShowTemplatesModal(false)}>Закрыть</button>
          </div>
        </Modal>

        {/* Create template modal */}
        <Modal isOpen={showCreateTemplateModal} onClose={() => setShowCreateTemplateModal(false)} title="Новый шаблон модификатора" size="large">
          <div style={{ background: '#f0f4ff', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#444', lineHeight: 1.6 }}>
            <strong>Что такое шаблон модификатора?</strong><br />
            Шаблон — это группа опций, которую можно привязать к любому блюду.
            Например: выбор молока (коровье / овсяное / кокосовое) или добавка сиропов.
            После создания шаблона зайдите в редактирование блюда и отметьте нужные шаблоны в секции «Модификаторы».
          </div>

          <div style={{ marginBottom: '12px' }}>
            <FormInput label="Название (видно гостю, напр. «Молоко»)" value={newTemplate.title}
              onChange={v => setNewTemplate(p => ({ ...p, title: v }))} required />
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>Тип выбора</label>
            <select value={newTemplate.type} onChange={e => {
              const v = e.target.value
              const presets: Record<string, string> = {
                SINGLE_REQUIRED: 'CHIPS', SINGLE_OPTIONAL: 'RADIO',
                MULTI: 'CHECKBOX', MULTI_REQUIRED: 'CHECKBOX',
                MULTI_QTY_TOTAL_LIMIT: 'CARDS', RANGE_STEPPER: 'STEPPER',
                EXCLUSIONS: 'CHECKBOX', HALF_AND_HALF: 'CARDS',
              }
              setNewTemplate(p => ({ ...p, type: v, presentation: presets[v] || p.presentation }))
            }} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }}>
              <option value="SINGLE_REQUIRED">Один обязательный — гость выбирает ровно 1 (напр. объём: 250 / 300 / 400)</option>
              <option value="MULTI">Несколько (галочки) — от 0 до N (напр. посыпка, до 2 видов)</option>
              <option value="MULTI_REQUIRED">Несколько обязательных — от N до M (напр. топпинги: выберите 2–3)</option>
              <option value="MULTI_QTY_TOTAL_LIMIT">С количеством (+/−) — общий лимит штук (напр. сиропы до 3 шт.)</option>
              <option value="RANGE_STEPPER">Число в диапазоне — степпер от..до (напр. ложки 1–6, цена за шт.)</option>
              <option value="EXCLUSIONS">Исключения — убрать из блюда, цена 0 (напр. без лука, без соуса)</option>
              <option value="HALF_AND_HALF">Половина + половина — ровно 2 выбора (напр. пицца 50/50)</option>
            </select>
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#888' }}>
              Отображение: {{ CHIPS: 'Фишки', RADIO: 'Радио', CHECKBOX: 'Чекбоксы', CARDS: 'Карточки +/−', STEPPER: 'Степпер' }[newTemplate.presentation] || newTemplate.presentation}
            </div>
          </div>

          {/* Per-type: hint + fields */}
          {newTemplate.type === 'SINGLE_REQUIRED' && (
            <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '12px 16px', marginBottom: '14px', fontSize: '13px', color: '#166534', lineHeight: 1.6 }}>
              Гость <strong>обязан</strong> выбрать ровно 1 вариант. Просто добавьте опции ниже.
              <br /><em>Пример: «Объём» → 250мл (0₽), 300мл (0₽), 400мл (+30₽)</em>
            </div>
          )}
          {newTemplate.type === 'MULTI' && (<>
            <div style={{ background: '#eff6ff', borderRadius: '8px', padding: '12px 16px', marginBottom: '10px', fontSize: '13px', color: '#1e40af', lineHeight: 1.6 }}>
              Гость выбирает <strong>от 0 до N</strong> опций галочками. Укажите максимум ниже и добавьте опции.
              <br /><em>Пример: «Посыпка» (макс. 2) → Корица (0₽), Малина (+30₽), Шоколад (+20₽)</em>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '180px' }}>
                <FormInput label="Макс. выборов" value={newTemplate.maxSelect} onChange={v => setNewTemplate(p => ({ ...p, maxSelect: v }))} type="number" />
              </div>
            </div>
          </>)}
          {newTemplate.type === 'MULTI_REQUIRED' && (<>
            <div style={{ background: '#eff6ff', borderRadius: '8px', padding: '12px 16px', marginBottom: '10px', fontSize: '13px', color: '#1e40af', lineHeight: 1.6 }}>
              Гость <strong>обязан</strong> выбрать от <em>мин.</em> до <em>макс.</em> опций. Укажите оба значения и добавьте опции.
              <br /><em>Пример: «Топпинги» (2–3) → Шоколад, Карамель, Орехи, Ягоды</em>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '180px' }}>
                <FormInput label="Мин. выборов (обязательно)" value={newTemplate.minSelect} onChange={v => setNewTemplate(p => ({ ...p, minSelect: v }))} type="number" />
              </div>
              <div style={{ width: '180px' }}>
                <FormInput label="Макс. выборов" value={newTemplate.maxSelect} onChange={v => setNewTemplate(p => ({ ...p, maxSelect: v }))} type="number" />
              </div>
            </div>
          </>)}
          {newTemplate.type === 'MULTI_QTY_TOTAL_LIMIT' && (<>
            <div style={{ background: '#fdf4ff', borderRadius: '8px', padding: '12px 16px', marginBottom: '10px', fontSize: '13px', color: '#86198f', lineHeight: 1.6 }}>
              У каждой опции кнопки <strong>+/−</strong>. Общее кол-во штук не больше лимита.
              <br /><em>Пример: «Сиропы» (до 3 шт.) → Ваниль ×2 (0₽), Миндаль ×1 (+30₽)</em>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '200px' }}>
                <FormInput label="Макс. штук всего (обязательно)" value={newTemplate.maxTotalQty} onChange={v => setNewTemplate(p => ({ ...p, maxTotalQty: v }))} type="number" />
              </div>
              <div style={{ width: '200px' }}>
                <FormInput label="Мин. штук (необязательно)" value={newTemplate.minTotalQty} onChange={v => setNewTemplate(p => ({ ...p, minTotalQty: v }))} type="number" />
              </div>
            </div>
          </>)}
          {newTemplate.type === 'RANGE_STEPPER' && (<>
            <div style={{ background: '#fff7ed', borderRadius: '8px', padding: '12px 16px', marginBottom: '10px', fontSize: '13px', color: '#9a3412', lineHeight: 1.6 }}>
              Гость выбирает <strong>число</strong> степпером (−/+).
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <div style={{ width: '160px' }}>
                <FormInput label="От (минимум)" value={newTemplate.rangeMin} onChange={v => setNewTemplate(p => ({ ...p, rangeMin: v }))} type="number" />
              </div>
              <div style={{ width: '160px' }}>
                <FormInput label="До (максимум)" value={newTemplate.rangeMax} onChange={v => setNewTemplate(p => ({ ...p, rangeMax: v }))} type="number" />
              </div>
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>Расчёт цены</label>
              <select value={newTemplate.pricingMode || 'PER_UNIT'} onChange={e => setNewTemplate(p => ({ ...p, pricingMode: e.target.value }))}
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }}>
                <option value="PER_UNIT">Одинаковая цена за единицу (напр. ложки: 10₽ × кол-во)</option>
                <option value="LOOKUP">Своя цена за каждый шаг (напр. ярусы: 1=0₽, 2=+1000₽, 3=+2500₽)</option>
              </select>
            </div>
            {(newTemplate.pricingMode || 'PER_UNIT') === 'PER_UNIT' && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                <div style={{ width: '200px' }}>
                  <FormInput label="Цена за единицу (₽)" value={newTemplate.pricePerUnit} onChange={v => setNewTemplate(p => ({ ...p, pricePerUnit: v }))} type="number" />
                </div>
              </div>
            )}
            {(newTemplate.pricingMode || 'PER_UNIT') === 'LOOKUP' && (
              <div style={{ background: '#fefce8', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#854d0e' }}>
                Добавьте опции ниже. Для каждого шага укажите <strong>valueInt</strong> (число шага, напр. 1, 2, 3) и <strong>дельту цены</strong>.
                <br /><em>Пример: «1 ярус» (valueInt=1, 0₽), «2 яруса» (valueInt=2, +1000₽), «3 яруса» (valueInt=3, +2500₽)</em>
              </div>
            )}
          </>)}
          {newTemplate.type === 'EXCLUSIONS' && (<>
            <div style={{ background: '#fef2f2', borderRadius: '8px', padding: '12px 16px', marginBottom: '10px', fontSize: '13px', color: '#991b1b', lineHeight: 1.6 }}>
              Гость убирает ингредиенты из блюда. Цена <strong>всегда 0</strong> (ставьте дельту 0).
              <br /><em>Пример: «Убрать» (до 3) → Лук, Помидоры, Соус, Сыр</em>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <div style={{ width: '200px' }}>
                <FormInput label="Макс. исключений (необязательно)" value={newTemplate.maxSelect} onChange={v => setNewTemplate(p => ({ ...p, maxSelect: v }))} type="number" />
              </div>
            </div>
          </>)}
          {newTemplate.type === 'HALF_AND_HALF' && (<>
            <div style={{ background: '#fdf4ff', borderRadius: '8px', padding: '12px 16px', marginBottom: '10px', fontSize: '13px', color: '#86198f', lineHeight: 1.6 }}>
              Гость выбирает <strong>ровно 2</strong> варианта (половина + половина). Добавьте опции ниже.
              <br /><em>Пример: «Пицца 50/50» → Маргарита, Пепперони, 4 сыра</em>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', fontSize: '14px', cursor: 'pointer' }}>
              <input type="checkbox" checked={newTemplate.allowSameOptionTwice}
                onChange={e => setNewTemplate(p => ({ ...p, allowSameOptionTwice: e.target.checked }))}
                style={{ width: '16px', height: '16px' }} />
              Можно выбрать одну и ту же опцию дважды
            </label>
          </>)}

          {(newTemplate.type === 'RANGE_STEPPER' || newTemplate.type === 'SINGLE_REQUIRED' || newTemplate.type === 'SINGLE_OPTIONAL') && (
            <div style={{ marginBottom: '14px', padding: '12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
              <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '14px', color: '#1e3a8a' }}>Масштаб ингредиентов по выбранному числу</div>
              <p style={{ fontSize: '12px', color: '#334155', margin: '0 0 10px', lineHeight: 1.45 }}>
                Ингредиенты из рецепта: норма умножается на выбранное число. Можно добавить несколько.
              </p>
              {(newTemplate.scaleIngredientIds ?? []).map((ingId, siIdx) => (
                <div key={siIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px', minWidth: 140 }}>
                    <SearchableSingleSelect<number>
                      value={ingId ? parseInt(ingId, 10) : null}
                      options={scaleIngredientOptions}
                      maxVisibleItems={4}
                      searchPlaceholder="Поиск ингредиента..."
                      nothingFoundText="Ничего не найдено"
                      onChange={(selected) => {
                        const selectedStr = selected != null ? String(selected) : ''
                        setNewTemplate((p) => {
                          const list = [...(p.scaleIngredientIds ?? [])]
                          list[siIdx] = selectedStr
                          const rec = selected != null ? recipe.find((r) => r.ingredientId === selected) : undefined
                          const units = [...(p.scaleIngredientUnits ?? [])]
                          const targets = [...(p.scaleIngredientTargets ?? [])]
                          units[siIdx] = '1'
                          targets[siIdx] = rec ? String(rec.qtyPerDish) : ''
                          return { ...p, scaleIngredientIds: list, scaleIngredientUnits: units, scaleIngredientTargets: targets }
                        })
                      }}
                    />
                  </div>
                    {(() => {
                      if (!ingId) return null
                      const selectedId = parseInt(ingId, 10)
                      if (!Number.isFinite(selectedId)) return null
                      const rec = recipe.find((r) => r.ingredientId === selectedId)
                      const unitsStr = newTemplate.scaleIngredientUnits?.[siIdx] ?? '1'
                      const targetStr = newTemplate.scaleIngredientTargets?.[siIdx] ?? ''
                      return (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div style={{ width: '130px' }}>
                            <FormInput
                              label="кол-во"
                              type="number"
                              value={targetStr}
                              placeholder="например 200"
                              onChange={(next) => {
                                setNewTemplate((p) => {
                                  const arr = [...(p.scaleIngredientTargets ?? [])]
                                  arr[siIdx] = next
                                  return { ...p, scaleIngredientTargets: arr }
                                })
                              }}
                            />
                          </div>
                          <div style={{ width: '90px' }}>
                            <FormInput
                              label="ед."
                              type="number"
                              value={unitsStr}
                              placeholder="например 3"
                              onChange={(v) => {
                                setNewTemplate((p) => {
                                  const arr = [...(p.scaleIngredientUnits ?? [])]
                                  arr[siIdx] = v
                                  return { ...p, scaleIngredientUnits: arr }
                                })
                              }}
                            />
                          </div>
                          {rec?.unit && <span style={{ fontSize: '11px', color: '#64748b', paddingBottom: '8px' }}>{rec.unit}</span>}
                        </div>
                      )
                    })()}
                  <button type="button" className="btn-small btn-danger" style={{ padding: '4px 8px' }}
                    onClick={() => setNewTemplate((p) => ({
                      ...p,
                      scaleIngredientIds: (p.scaleIngredientIds ?? []).filter((_, i) => i !== siIdx),
                      scaleIngredientUnits: (p.scaleIngredientUnits ?? []).filter((_, i) => i !== siIdx),
                      scaleIngredientTargets: (p.scaleIngredientTargets ?? []).filter((_, i) => i !== siIdx),
                    }))}>×</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
                <button type="button" className="btn-small btn-secondary"
                  onClick={() => setNewTemplate((p) => ({
                    ...p,
                    scaleIngredientIds: [...(p.scaleIngredientIds ?? []), ''],
                    scaleIngredientUnits: [...(p.scaleIngredientUnits ?? []), '1'],
                    scaleIngredientTargets: [...(p.scaleIngredientTargets ?? []), ''],
                  }))}>
                  + ингредиент
                </button>
              </div>
            </div>
          )}

          {!(newTemplate.type === 'RANGE_STEPPER' && (newTemplate.pricingMode || 'PER_UNIT') === 'PER_UNIT') && (<>
          {(() => {
            const allowDefault = newTemplate.type === 'SINGLE_REQUIRED' || newTemplate.type === 'MULTI'
            return (
              <>
          <div style={{ borderTop: '1px solid #eee', paddingTop: '14px' }}>
            <h4 style={{ marginBottom: '4px' }}>Опции (варианты выбора)</h4>
            <p style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
              {newTemplate.type === 'RANGE_STEPPER'
                ? <>Для каждого шага укажите название, <strong>значение (число)</strong> и дельту цены.</>
                : <>Добавьте варианты. «Дельта цены» — изменение цены блюда. Ниже у опции можно задать <strong>доп. расход</strong> со склада (кг/шт на 1 шт. опции).</>
              }
              {allowDefault && <><br /><strong>Можно отметить опции «по умолчанию»</strong> — они будут заранее выбраны у гостя.</>}
            </p>
          </div>
          {newTemplateItems.map((item, idx) => (
            <div key={idx} style={{ marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid #eee' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {(newTemplate.type !== 'RANGE_STEPPER' && newTemplate.type !== 'SINGLE_REQUIRED') && (
                  <div style={{ flex: 1 }}>
                    <FormInput label={idx === 0 ? 'Название опции' : ''} value={item.title} placeholder="напр. Кокосовое"
                      onChange={v => { const c = [...newTemplateItems]; c[idx] = { ...c[idx], title: v }; setNewTemplateItems(c) }} />
                  </div>
                )}
          {(newTemplate.type === 'RANGE_STEPPER' || newTemplate.type === 'SINGLE_REQUIRED' || newTemplate.type === 'SINGLE_OPTIONAL') && (
                  <div style={{ width: '100px' }}>
                    <FormInput label={idx === 0 ? 'Значение' : ''} type="number" value={item.valueInt ?? ''} placeholder="напр. 2"
                      onChange={v => { const c = [...newTemplateItems]; c[idx] = { ...c[idx], valueInt: v }; setNewTemplateItems(c) }} />
                  </div>
                )}
                <div style={{ width: '120px' }}>
                  <FormInput label={idx === 0 ? 'Дельта цены (₽)' : ''} type="number" value={item.priceDelta} placeholder="0"
                    onChange={v => { const c = [...newTemplateItems]; c[idx] = { ...c[idx], priceDelta: v }; setNewTemplateItems(c) }} />
                </div>
                {allowDefault && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '150px', marginBottom: '8px', fontSize: '12px', color: '#444' }}>
                    <input
                      type="checkbox"
                      checked={!!item.isDefault}
                      onChange={e => {
                        const c = [...newTemplateItems]
                        c[idx] = { ...c[idx], isDefault: e.target.checked }
                        if (newTemplate.type === 'SINGLE_REQUIRED' && e.target.checked) {
                          for (let j = 0; j < c.length; j++) if (j !== idx) c[j] = { ...c[j], isDefault: false }
                        }
                        setNewTemplateItems(c)
                      }}
                    />
                    По умолчанию
                  </label>
                )}
                <button className="btn-small btn-danger" style={{ height: '36px' }}
                  onClick={() => setNewTemplateItems(p => p.filter((_, i) => i !== idx))}>×</button>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Доп. со склада</span>
                <select
                  value={item.stockIngredientId ?? ''}
                  onChange={(e) => {
                    const c = [...newTemplateItems]
                    c[idx] = { ...c[idx], stockIngredientId: e.target.value }
                    setNewTemplateItems(c)
                  }}
                  style={{ flex: '1 1 180px', maxWidth: 260, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #ccc' }}
                >
                  <option value="">— нет —</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={String(ing.id)}>{ing.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  step={0.001}
                  placeholder="кг/шт за 1 шт"
                  value={item.stockQtyPerUnit ?? ''}
                  onChange={(e) => {
                    const c = [...newTemplateItems]
                    c[idx] = { ...c[idx], stockQtyPerUnit: e.target.value }
                    setNewTemplateItems(c)
                  }}
                  style={{ width: '130px', padding: '10px', fontSize: '13px', border: '1px solid #ddd', borderRadius: '6px' }}
                />
              </div>
            </div>
          ))}
          <button className="btn-small btn-secondary" onClick={() => setNewTemplateItems(p => [...p, { title: '', priceDelta: '0', isDefault: false, stockIngredientId: '', stockQtyPerUnit: '' }])}>
            + Добавить опцию
          </button>
              </>
            )
          })()}
          </>)}

          <div className="modal-actions" style={{ marginTop: '20px' }}>
            <button className="btn-secondary" onClick={() => setShowCreateTemplateModal(false)}>Отмена</button>
            <button className="btn-primary" onClick={handleCreateTemplate}
              disabled={!newTemplate.title.trim()}>Создать шаблон</button>
          </div>
        </Modal>

        {/* Edit template modal */}
        {editingTemplate && (
          <Modal isOpen={showEditTemplateModal} onClose={() => { setShowEditTemplateModal(false); setEditingTemplate(null) }}
            title={`Редактировать: ${editingTemplate.title}`} size="large">

            <div style={{ marginBottom: '12px' }}>
              <FormInput label="Название" value={editTemplate.title} onChange={v => setEditTemplate(p => ({ ...p, title: v }))} required />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>Тип выбора</label>
              <select value={editTemplate.type} onChange={e => {
                const v = e.target.value
                const presets: Record<string, string> = {
                  SINGLE_REQUIRED: 'CHIPS', SINGLE_OPTIONAL: 'RADIO',
                  MULTI: 'CHECKBOX', MULTI_REQUIRED: 'CHECKBOX',
                  MULTI_QTY_TOTAL_LIMIT: 'CARDS', RANGE_STEPPER: 'STEPPER',
                  EXCLUSIONS: 'CHECKBOX', HALF_AND_HALF: 'CARDS',
                }
                setEditTemplate(p => ({ ...p, type: v, presentation: presets[v] || p.presentation }))
              }} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }}>
                <option value="SINGLE_REQUIRED">Один обязательный</option>
                <option value="MULTI">Несколько (галочки)</option>
                <option value="MULTI_REQUIRED">Несколько обязательных</option>
                <option value="MULTI_QTY_TOTAL_LIMIT">С количеством (+/−)</option>
                <option value="RANGE_STEPPER">Число в диапазоне</option>
                <option value="EXCLUSIONS">Исключения</option>
                <option value="HALF_AND_HALF">Половина + половина</option>
              </select>
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#888' }}>
                Отображение: {{ CHIPS: 'Фишки', RADIO: 'Радио', CHECKBOX: 'Чекбоксы', CARDS: 'Карточки +/−', STEPPER: 'Степпер' }[editTemplate.presentation] || editTemplate.presentation}
              </div>
            </div>

            {(editTemplate.type === 'MULTI' || editTemplate.type === 'MULTI_REQUIRED' || editTemplate.type === 'EXCLUSIONS') && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                {editTemplate.type === 'MULTI_REQUIRED' && (
                  <div style={{ width: '180px' }}>
                    <FormInput label="Мин. выборов" value={editTemplate.minSelect} onChange={v => setEditTemplate(p => ({ ...p, minSelect: v }))} type="number" />
                  </div>
                )}
                <div style={{ width: '180px' }}>
                  <FormInput label="Макс. выборов" value={editTemplate.maxSelect} onChange={v => setEditTemplate(p => ({ ...p, maxSelect: v }))} type="number" />
                </div>
              </div>
            )}
            {(editTemplate.type === 'MULTI_QTY_TOTAL_LIMIT' || editTemplate.type === 'HALF_AND_HALF') && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                <div style={{ width: '180px' }}>
                  <FormInput label="Макс. штук всего" value={editTemplate.maxTotalQty} onChange={v => setEditTemplate(p => ({ ...p, maxTotalQty: v }))} type="number" />
                </div>
                <div style={{ width: '180px' }}>
                  <FormInput label="Мин. штук (необязат.)" value={editTemplate.minTotalQty} onChange={v => setEditTemplate(p => ({ ...p, minTotalQty: v }))} type="number" />
                </div>
              </div>
            )}
            {editTemplate.type === 'HALF_AND_HALF' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', fontSize: '14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={editTemplate.allowSameOptionTwice}
                  onChange={e => setEditTemplate(p => ({ ...p, allowSameOptionTwice: e.target.checked }))}
                  style={{ width: '16px', height: '16px' }} />
                Можно выбрать одну и ту же опцию дважды
              </label>
            )}
            {editTemplate.type === 'RANGE_STEPPER' && (<>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '160px' }}>
                  <FormInput label="От (минимум)" value={editTemplate.rangeMin} onChange={v => setEditTemplate(p => ({ ...p, rangeMin: v }))} type="number" />
                </div>
                <div style={{ width: '160px' }}>
                  <FormInput label="До (максимум)" value={editTemplate.rangeMax} onChange={v => setEditTemplate(p => ({ ...p, rangeMax: v }))} type="number" />
                </div>
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>Расчёт цены</label>
                <select value={editTemplate.pricingMode || 'PER_UNIT'} onChange={e => setEditTemplate(p => ({ ...p, pricingMode: e.target.value }))}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }}>
                  <option value="PER_UNIT">Одинаковая цена за единицу</option>
                  <option value="LOOKUP">Своя цена за каждый шаг</option>
                </select>
              </div>
              {(editTemplate.pricingMode || 'PER_UNIT') === 'PER_UNIT' && (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ width: '200px' }}>
                    <FormInput label="Цена за единицу (₽)" value={editTemplate.pricePerUnit} onChange={v => setEditTemplate(p => ({ ...p, pricePerUnit: v }))} type="number" />
                  </div>
                </div>
              )}
            </>)}

            {(editTemplate.type === 'RANGE_STEPPER' || editTemplate.type === 'SINGLE_REQUIRED' || editTemplate.type === 'SINGLE_OPTIONAL') && (
              <div style={{ marginBottom: '14px', padding: '12px', background: '#f0f7ff', borderRadius: '8px', fontSize: '13px' }}>
                <strong>Масштаб ингредиентов по выбранному числу</strong>
                <p style={{ margin: '6px 0 10px', color: '#555', lineHeight: 1.45 }}>
                  Ингредиенты из рецепта: норма умножится на выбранное значение. Можно добавить несколько.
                </p>
                {(editTemplate.scaleIngredientIds ?? []).map((ingId, siIdx) => (
                  <div key={siIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px', minWidth: 140 }}>
                      <SearchableSingleSelect<number>
                        value={ingId ? parseInt(ingId, 10) : null}
                        options={scaleIngredientOptions}
                        maxVisibleItems={4}
                        searchPlaceholder="Поиск ингредиента..."
                        nothingFoundText="Ничего не найдено"
                        onChange={(selected) => {
                          const selectedStr = selected != null ? String(selected) : ''
                          setEditTemplate((p) => {
                            const list = [...(p.scaleIngredientIds ?? [])]
                            list[siIdx] = selectedStr
                            const rec = selected != null ? recipe.find((r) => r.ingredientId === selected) : undefined
                            const units = [...(p.scaleIngredientUnits ?? [])]
                            const targets = [...(p.scaleIngredientTargets ?? [])]
                            units[siIdx] = '1'
                            targets[siIdx] = rec ? String(rec.qtyPerDish) : ''
                            return { ...p, scaleIngredientIds: list, scaleIngredientUnits: units, scaleIngredientTargets: targets }
                          })
                        }}
                      />
                    </div>
                    {(() => {
                      if (!ingId) return null
                      const selectedId = parseInt(ingId, 10)
                      if (!Number.isFinite(selectedId)) return null
                      const rec = recipe.find((r) => r.ingredientId === selectedId)
                      const unitsStr = editTemplate.scaleIngredientUnits?.[siIdx] ?? '1'
                      const targetStr = editTemplate.scaleIngredientTargets?.[siIdx] ?? ''
                      return (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div style={{ width: '130px' }}>
                            <FormInput
                              label="кол-во"
                              type="number"
                              value={targetStr}
                              placeholder="например 200"
                              onChange={(next) => {
                                setEditTemplate((p) => {
                                  const arr = [...(p.scaleIngredientTargets ?? [])]
                                  arr[siIdx] = next
                                  return { ...p, scaleIngredientTargets: arr }
                                })
                              }}
                            />
                          </div>
                          <div style={{ width: '90px' }}>
                            <FormInput
                              label="ед."
                              type="number"
                              value={unitsStr}
                              placeholder="например 3"
                              onChange={(v) => {
                                setEditTemplate((p) => {
                                  const arr = [...(p.scaleIngredientUnits ?? [])]
                                  arr[siIdx] = v
                                  return { ...p, scaleIngredientUnits: arr }
                                })
                              }}
                            />
                          </div>
                          {rec?.unit && <span style={{ fontSize: '11px', color: '#64748b', paddingBottom: '8px' }}>{rec.unit}</span>}
                        </div>
                      )
                    })()}
                    <button type="button" className="btn-small btn-danger" style={{ padding: '4px 8px' }}
                      onClick={() => setEditTemplate((p) => ({
                        ...p,
                        scaleIngredientIds: (p.scaleIngredientIds ?? []).filter((_, i) => i !== siIdx),
                        scaleIngredientUnits: (p.scaleIngredientUnits ?? []).filter((_, i) => i !== siIdx),
                      scaleIngredientTargets: (p.scaleIngredientTargets ?? []).filter((_, i) => i !== siIdx),
                      }))}>×</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
                  <button type="button" className="btn-small btn-secondary"
                    onClick={() => setEditTemplate((p) => ({
                      ...p,
                      scaleIngredientIds: [...(p.scaleIngredientIds ?? []), ''],
                      scaleIngredientUnits: [...(p.scaleIngredientUnits ?? []), '1'],
                      scaleIngredientTargets: [...(p.scaleIngredientTargets ?? []), ''],
                    }))}>
                    + ингредиент
                  </button>
                </div>
              </div>
            )}

            {!(editTemplate.type === 'RANGE_STEPPER' && (editTemplate.pricingMode || 'PER_UNIT') === 'PER_UNIT') && (<>
            {(() => {
              const allowDefault = editTemplate.type === 'SINGLE_REQUIRED' || editTemplate.type === 'MULTI'
              return (
                <>
            <div style={{ borderTop: '1px solid #eee', paddingTop: '14px' }}>
              <h4 style={{ marginBottom: '4px' }}>Опции</h4>
              <p style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
                {editTemplate.type === 'RANGE_STEPPER'
                  ? <>Для каждого шага укажите название, <strong>значение (число)</strong> и дельту цены.</>
                  : <>Существующие опции можно удалить (×). Новые — добавьте внизу.</>
                }
                {allowDefault && <><br /><strong>Можно отметить опции «по умолчанию»</strong>.</>}
              </p>
            </div>

            {editTemplateItems.map((item, idx) => (
              <div key={item.id ?? `new-${idx}`} style={{ marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  {(editTemplate.type !== 'RANGE_STEPPER' && editTemplate.type !== 'SINGLE_REQUIRED') && (
                    <div style={{ flex: 1 }}>
                      <FormInput label="" value={item.title} placeholder="Название опции"
                        onChange={v => { const c = [...editTemplateItems]; c[idx] = { ...c[idx], title: v }; setEditTemplateItems(c) }} />
                    </div>
                  )}
                  {(editTemplate.type === 'RANGE_STEPPER' || editTemplate.type === 'SINGLE_REQUIRED' || editTemplate.type === 'SINGLE_OPTIONAL') && (
                    <div style={{ width: '100px' }}>
                      <FormInput label="" type="number" value={item.valueInt ?? ''} placeholder="число"
                        onChange={v => { const c = [...editTemplateItems]; c[idx] = { ...c[idx], valueInt: v }; setEditTemplateItems(c) }} />
                    </div>
                  )}
                  <div style={{ width: '120px' }}>
                    <FormInput label="" type="number" value={item.priceDelta} placeholder="0"
                      onChange={v => { const c = [...editTemplateItems]; c[idx] = { ...c[idx], priceDelta: v }; setEditTemplateItems(c) }} />
                  </div>
                  {allowDefault && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '140px', marginBottom: '8px', fontSize: '12px', color: '#444' }}>
                      <input
                        type="checkbox"
                        checked={!!item.isDefault}
                        onChange={e => {
                          const c = [...editTemplateItems]
                          c[idx] = { ...c[idx], isDefault: e.target.checked }
                          if (editTemplate.type === 'SINGLE_REQUIRED' && e.target.checked) {
                            for (let j = 0; j < c.length; j++) if (j !== idx) c[j] = { ...c[j], isDefault: false }
                          }
                          setEditTemplateItems(c)
                        }}
                      />
                      По умолчанию
                    </label>
                  )}
                  <button className="btn-small btn-danger" style={{ height: '36px' }}
                    onClick={() => setEditTemplateItems(p => p.filter((_, i) => i !== idx))}>×</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Доп. расход ингредиентов для этой опции</span>
                  {(item.extraIngredients && item.extraIngredients.length > 0
                    ? item.extraIngredients
                    : [{ ingredientId: item.stockIngredientId ?? '', qtyPerUnit: item.stockQtyPerUnit ?? '' }]
                  ).map((ex, exIdx) => (
                    <div key={exIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 200px', minWidth: 180, maxWidth: 320 }}>
                        <SearchableSingleSelect<number>
                          value={ex.ingredientId ? parseInt(ex.ingredientId, 10) : null}
                          options={scaleIngredientOptions}
                          maxVisibleItems={4}
                          searchPlaceholder="Поиск ингредиента..."
                          nothingFoundText="Ничего не найдено"
                          onChange={(selected) => {
                            const c = [...editTemplateItems]
                            const list = (c[idx].extraIngredients && c[idx].extraIngredients!.length > 0
                              ? [...c[idx].extraIngredients!]
                              : [{ ingredientId: c[idx].stockIngredientId ?? '', qtyPerUnit: c[idx].stockQtyPerUnit ?? '' }])
                            list[exIdx] = { ...list[exIdx], ingredientId: selected != null ? String(selected) : '' }
                            c[idx] = { ...c[idx], extraIngredients: list, stockIngredientId: '', stockQtyPerUnit: '' }
                            setEditTemplateItems(c)
                          }}
                        />
                      </div>
                      <input
                        type="number"
                        min={0}
                        step={0.001}
                        placeholder="кол-во на 1 шт"
                        value={ex.qtyPerUnit}
                        onChange={(e) => {
                          const c = [...editTemplateItems]
                          const list = (c[idx].extraIngredients && c[idx].extraIngredients!.length > 0
                            ? [...c[idx].extraIngredients!]
                            : [{ ingredientId: c[idx].stockIngredientId ?? '', qtyPerUnit: c[idx].stockQtyPerUnit ?? '' }])
                          list[exIdx] = { ...list[exIdx], qtyPerUnit: e.target.value }
                          c[idx] = { ...c[idx], extraIngredients: list, stockIngredientId: '', stockQtyPerUnit: '' }
                          setEditTemplateItems(c)
                        }}
                        style={{ width: '130px', padding: '8px', fontSize: '12px', border: '1px solid #ddd', borderRadius: '6px' }}
                      />
                      <button
                        className="btn-small btn-danger"
                        style={{ height: '30px', padding: '0 8px' }}
                        onClick={() => {
                          const c = [...editTemplateItems]
                          const list = (c[idx].extraIngredients && c[idx].extraIngredients!.length > 0
                            ? [...c[idx].extraIngredients!]
                            : [{ ingredientId: c[idx].stockIngredientId ?? '', qtyPerUnit: c[idx].stockQtyPerUnit ?? '' }])
                          const next = list.filter((_, i) => i !== exIdx)
                          c[idx] = { ...c[idx], extraIngredients: next.length > 0 ? next : [{ ingredientId: '', qtyPerUnit: '' }], stockIngredientId: '', stockQtyPerUnit: '' }
                          setEditTemplateItems(c)
                        }}
                      >×</button>
                    </div>
                  ))}
                  <button
                    className="btn-small btn-secondary"
                    style={{ width: 'fit-content', fontSize: '12px' }}
                    onClick={() => {
                      const c = [...editTemplateItems]
                      const list = (c[idx].extraIngredients && c[idx].extraIngredients!.length > 0
                        ? [...c[idx].extraIngredients!]
                        : [{ ingredientId: c[idx].stockIngredientId ?? '', qtyPerUnit: c[idx].stockQtyPerUnit ?? '' }])
                      list.push({ ingredientId: '', qtyPerUnit: '' })
                      c[idx] = { ...c[idx], extraIngredients: list, stockIngredientId: '', stockQtyPerUnit: '' }
                      setEditTemplateItems(c)
                    }}
                  >+ ингредиент</button>
                </div>
              </div>
            ))}
            <button className="btn-small btn-secondary" onClick={() => setEditTemplateItems(p => [...p, { title: '', priceDelta: '0', isDefault: false, stockIngredientId: '', stockQtyPerUnit: '', extraIngredients: [{ ingredientId: '', qtyPerUnit: '' }] }])}>
              + Добавить опцию
            </button>
                </>
              )
            })()}
            </>)}

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => { setShowEditTemplateModal(false); setEditingTemplate(null) }}>Отмена</button>
              <button className="btn-primary" onClick={handleSaveTemplate}
                disabled={!editTemplate.title.trim()}>Сохранить</button>
            </div>
          </Modal>
        )}
      </div>
    )
  }

  // Show categories
  return (
    <div style={{ padding: '20px' }}>
      <div className="page-header">
        <h1>Меню (Категории блюд)</h1>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setShowCreateCategoryModal(true)}>
            Создать категорию
          </button>
        )}
      </div>

      <DataTable
        data={categories}
        columns={categoryColumns}
        loading={loading}
        emptyMessage="Категории не найдены"
      />

      {/* Create Category Modal */}
      {isAdmin && (
        <>
          <Modal
            isOpen={showCreateCategoryModal}
            onClose={() => {
              setShowCreateCategoryModal(false)
              setCategoryFormData({ name: '' })
            }}
            title="Создать категорию"
          >
            <FormInput
              label="Название категории"
              value={categoryFormData.name}
              onChange={(v) => setCategoryFormData({ ...categoryFormData, name: v })}
              required
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCreateCategoryModal(false)}>
                Отмена
              </button>
              <button className="btn-primary" onClick={handleCreateCategory}>
                Создать
              </button>
            </div>
          </Modal>

          {/* Edit Category Modal */}
          <Modal
            isOpen={showEditCategoryModal}
            onClose={() => {
              setShowEditCategoryModal(false)
              setCategoryFormData({ name: '' })
            }}
            title="Редактировать категорию"
          >
            <FormInput
              label="Название категории"
              value={categoryFormData.name}
              onChange={(v) => setCategoryFormData({ ...categoryFormData, name: v })}
              required
            />
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowEditCategoryModal(false)
                  setCategoryFormData({ name: '' })
                }}
              >
                Отмена
              </button>
              <button className="btn-primary" onClick={handleUpdateCategory}>
                Сохранить
              </button>
            </div>
          </Modal>

          {/* Image Upload Modal */}
          <Modal
            isOpen={showImageModal && categoryForImageModal !== null}
            onClose={() => {
              setShowImageModal(false)
              setCategoryForImageModal(null)
              if (fileInputRef.current) {
                fileInputRef.current.value = ''
              }
            }}
            title={`Загрузить изображение для "${categoryForImageModal?.name || ''}"`}
          >
            <div className="image-upload-section">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                style={{ marginBottom: '15px' }}
              />
              <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
                Выберите PNG изображение для категории
              </p>
              {categoryForImageModal?.imageUrl && (
                <div className="current-image-preview">
                  <p>Текущее изображение:</p>
                  <div className="preview-image-wrap">
                    <img
                      src={categoryForImageModal.imageUrl}
                      alt={categoryForImageModal.name}
                      className="preview-image"
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowImageModal(false)
                  setCategoryForImageModal(null)
                  if (fileInputRef.current) {
                    fileInputRef.current.value = ''
                  }
                }}
              >
                Отмена
              </button>
              <button className="btn-primary" onClick={handleImageUpload}>
                Загрузить
              </button>
            </div>
          </Modal>
        </>
      )}
    </div>
  )
}
