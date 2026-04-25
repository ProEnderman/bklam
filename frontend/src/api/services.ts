import client from './client'
import type {
  User,
  AuthResponse,
  RequestCodeResponse,
  LoginRequest,
  VerifyCodeRequest,
  Restaurant,
  CreateRestaurantRequest,
  CreateAdminRequest,
  UpdateWorkerRequest,
  Ingredient,
  Dish,
  DishCategory,
  Order,
  StockMovement,
  RevenueDto,
  TopDishDto,
  IngredientUsageDto,
  ProblemIngredientDto,
  RecipeItem,
  ExcelUploadResponse,
  ResolveUnitMismatchRequest,
  TariffPlan,
  TariffRule,
  Calendar,
  TariffSpecialDateModifier,
  PricingRequest,
  PricingResult,
  Shift,
  CreateShiftRequest,
  UpdateShiftRequest,
  ShiftTemplate,
  CreateShiftTemplateRequest,
  ShiftSwapRequest,
  Activity,
  Booking,
  AvailabilityResponse,
  PermissionTemplate,
  UpsertPermissionTemplateRequest,
  HallView,
  HallZone,
  HallPlacedItem,
  HallAsset,
  HallTable,
  HallItemsPatchRequest,
  HallItemsPatchResponse,
  TableReservation,
  BookingNotification,
  CalendarUpdateResponse,
  Unit,
} from './types'

/** Скачивание бинарного ответа API (Excel, CSV, ZIP) с cookie/JWT */
export async function downloadApiBlob(path: string, filename: string): Promise<void> {
  const res = await client.get(path, { responseType: 'blob' })
  const blob = new Blob([res.data], { type: (res.headers['content-type'] as string) || 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Request deduplication + short TTL cache for getMe() to prevent storms on app start / route changes
let getMePromise: Promise<User> | null = null
let lastMeUser: User | null = null
let lastMeAt = 0
const GET_ME_TTL_MS = 3000

// Auth services
export const authService = {
  async requestCode(data: LoginRequest): Promise<RequestCodeResponse> {
    // withCredentials must be true when the API is on another origin (e.g. Docker: UI :3000, API :8080);
    // otherwise the browser may ignore Set-Cookie from the login flow. Stale cookies are harmless here.
    const response = await client.post<RequestCodeResponse>('/auth/login/request-code', data, {
      timeout: 90_000, // backend calls SMTP; 25s was too short → axios timeout while server still sends mail
    })
    return response.data
  },

  async verifyCode(data: VerifyCodeRequest): Promise<AuthResponse> {
    // Same as requestCode: credentialed CORS is required to store HttpOnly cookies from verify response.
    const response = await client.post<AuthResponse>('/auth/login/verify', data)
    return response.data
  },

  async getMe(): Promise<User> {
    // Short TTL cache to avoid hammering /auth/me due to React StrictMode / redirects / retries
    if (lastMeUser && Date.now() - lastMeAt < GET_ME_TTL_MS) {
      return lastMeUser
    }

    // If a request is already in flight, return the same promise
    if (getMePromise) {
      return getMePromise
    }
    
    // Helpful debug (dev only): see who is calling getMe() repeatedly
    if (import.meta.env.DEV) {
      console.debug('[authService.getMe] calling /auth/me')
      // eslint-disable-next-line no-console
      console.trace?.('[authService.getMe] call stack')
    }

    getMePromise = client.get<AuthResponse>('/auth/me')
      .then(response => {
        getMePromise = null // Clear promise on success
        lastMeUser = response.data.user
        lastMeAt = Date.now()
        return lastMeUser
      })
      .catch(error => {
        getMePromise = null // Clear promise on error so we can retry
        // Do not cache failures
        throw error
      })
    
    return getMePromise
  },

  async refresh(): Promise<void> {
    await client.post('/auth/refresh')
  },

  async logout(): Promise<void> {
    await client.post('/auth/logout')
  },
}

// Platform services (HEAD_ADMIN)
export const platformService = {
  async getRestaurants(search?: string, page = 0, size = 20) {
    const params = new URLSearchParams({ page: page.toString(), size: size.toString() })
    if (search) params.append('search', search)
    const response = await client.get<{ content: Restaurant[]; totalElements: number }>(
      `/platform/restaurants?${params}`
    )
    return response.data
  },

  async getRestaurant(id: number): Promise<Restaurant> {
    const response = await client.get<Restaurant>(`/platform/restaurants/${id}`)
    return response.data
  },

  async createRestaurant(data: CreateRestaurantRequest): Promise<Restaurant> {
    const response = await client.post<Restaurant>('/platform/restaurants', data)
    return response.data
  },

  async updateRestaurant(id: number, data: CreateRestaurantRequest): Promise<Restaurant> {
    const response = await client.put<Restaurant>(`/platform/restaurants/${id}`, data)
    return response.data
  },

  async deleteRestaurant(id: number): Promise<void> {
    await client.delete(`/platform/restaurants/${id}`)
  },

  async createRestaurantAdmin(restaurantId: number, data: CreateAdminRequest) {
    const response = await client.post(`/platform/restaurants/${restaurantId}/admins`, data)
    return response.data
  },

  async getUsers(page = 0, size = 20, restaurantId?: number) {
    const params = new URLSearchParams({ page: page.toString(), size: size.toString() })
    if (restaurantId !== undefined) {
      params.append('restaurantId', restaurantId.toString())
    }
    const response = await client.get<{ content: User[]; totalElements: number }>(
      `/platform/users?${params}`
    )
    return response.data
  },

  async updateUserRole(userId: number, role: string) {
    const response = await client.patch(`/platform/users/${userId}/role`, null, {
      params: { role },
    })
    return response.data
  },

  async getPlatformActivityLog(page = 0, size = 100, filters?: {
    from?: string
    to?: string
    actionType?: string
    entityType?: string
    userName?: string
  }) {
    const params = new URLSearchParams()
    params.append('page', page.toString())
    params.append('size', size.toString())
    params.append('sort', 'createdAt,desc')
    if (filters?.from) params.append('fromDate', filters.from)
    if (filters?.to) params.append('toDate', filters.to)
    if (filters?.actionType) params.append('actionType', filters.actionType)
    if (filters?.entityType) params.append('entityType', filters.entityType)
    if (filters?.userName) params.append('userName', filters.userName)
    const response = await client.get<any>(`/activity-log?${params}`)
    const data = response.data
    return {
      content: data?.content || [],
      totalPages: data?.totalPages || 0,
      totalElements: data?.totalElements || 0,
      page: data?.number ?? page,
      size: data?.size ?? size,
    }
  },
}

// Restaurant services (ADMIN/WORKER)
export const restaurantService = {
  // Ingredients
  async getIngredients(search?: string, belowMin?: boolean) {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (belowMin) params.append('belowMin', 'true')
    // Добавляем параметры пагинации
    params.append('page', '0')
    params.append('size', '100') // Запрашиваем достаточно много для отображения
    const response = await client.get<{ content: Ingredient[] }>(`/ingredients?${params}`)
    console.log('Ingredients API response:', response.data)
    return response.data.content || []
  },

  async createIngredient(data: Partial<Ingredient>): Promise<Ingredient> {
    const response = await client.post<Ingredient>('/ingredients', data)
    return response.data
  },

  async updateIngredient(id: number, data: Partial<Ingredient>): Promise<Ingredient> {
    const response = await client.put<Ingredient>(`/ingredients/${id}`, data)
    return response.data
  },

  async deleteIngredient(id: number): Promise<void> {
    await client.delete(`/ingredients/${id}`)
  },

  async uploadIngredientsExcel(file: File): Promise<any> {
    const form = new FormData()
    form.append('file', file)
    const response = await client.post('/ingredients/upload-excel', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  // Stock Movements
  async getStockMovements(filters?: {
    from?: string
    to?: string
    ingredientId?: number
    type?: string
    reason?: string
    page?: number
    size?: number
  }) {
    const params = new URLSearchParams()
    if (filters?.from) params.append('from', filters.from)
    if (filters?.to) params.append('to', filters.to)
    if (filters?.ingredientId) params.append('ingredientId', filters.ingredientId.toString())
    if (filters?.type) params.append('type', filters.type)
    if (filters?.reason) params.append('reason', filters.reason)
    const page = filters?.page ?? 0
    const size = filters?.size ?? 50
    params.append('page', page.toString())
    params.append('size', size.toString())
    const url = `/stock/movements?${params}`
    console.log('[StockMovements API] Request URL:', url)
    console.log('[StockMovements API] Request params:', { page, size, allParams: Object.fromEntries(params) })
    const response = await client.get<{ content: StockMovement[]; totalElements: number; totalPages?: number } | StockMovement[]>(url)
    console.log('[StockMovements API] Response:', { 
      isArray: Array.isArray(response.data),
      contentLength: Array.isArray(response.data) ? response.data.length : response.data?.content?.length,
      totalElements: Array.isArray(response.data) ? undefined : response.data?.totalElements,
      totalPages: Array.isArray(response.data) ? undefined : response.data?.totalPages,
      size: Array.isArray(response.data) ? undefined : (response.data as any)?.size
    })
    return response.data
  },

  async stockIn(ingredientId: number, qty: number, note?: string) {
    const response = await client.post<StockMovement>('/stock/in', {
      ingredientId,
      qty,
      note,
    })
    return response.data
  },

  async stockOut(ingredientId: number, qty: number, reason: string, note?: string) {
    const response = await client.post<StockMovement>('/stock/out', {
      ingredientId,
      qty,
      reason,
      note,
    })
    return response.data
  },

  // Dishes
  async getDishes(search?: string, activeOnly?: boolean) {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (activeOnly) params.append('activeOnly', 'true')
    // Бэкенд возвращает Page, извлекаем content
    const response = await client.get<{ content: Dish[]; totalElements: number }>(`/dishes?${params}`)
    return response.data.content || []
  },

  async getDishesByCategory(categoryId: number): Promise<Dish[]> {
    const response = await client.get<Dish[]>(`/dishes/category/${categoryId}`)
    return response.data
  },

  async getDish(id: number): Promise<Dish> {
    const response = await client.get(`/dishes/${id}`)
    return response.data
  },

  async getRecipe(dishId: number): Promise<RecipeItem[]> {
    const response = await client.get(`/dishes/${dishId}/recipe`)
    console.log('[getRecipe] Response:', response.data)
    // Бэкенд возвращает DishIngredientDto[], нужно преобразовать в RecipeItem[]
    // DishIngredientDto не содержит unit, нужно получить его из ингредиентов
    const dishIngredients = response.data
    if (!Array.isArray(dishIngredients)) {
      console.error('[getRecipe] Expected array but got:', dishIngredients)
      return []
    }
    if (dishIngredients.length === 0) {
      console.log('[getRecipe] Recipe is empty')
      return []
    }
    // Загружаем ингредиенты для получения unit
    const ingredients = await restaurantService.getIngredients()
    console.log('[getRecipe] Ingredients loaded:', ingredients.length)
    const recipe = dishIngredients.map((di: any) => {
      const ingredient = ingredients.find((ing: Ingredient) => ing.id === di.ingredientId)
      console.log('[getRecipe] Mapping:', { di, ingredient: ingredient?.name })
      return {
        ingredientId: di.ingredientId,
        ingredientName: di.ingredientName,
        qtyPerDish: di.qtyPerDish,
        unit: ingredient?.unit || 'G',
      }
    })
    console.log('[getRecipe] Final recipe:', recipe)
    return recipe
  },

  async createDish(data: Partial<Dish>): Promise<Dish> {
    const response = await client.post<Dish>('/dishes', data)
    return response.data
  },

  async updateDish(id: number, data: Partial<Dish>): Promise<Dish> {
    const response = await client.put<Dish>(`/dishes/${id}`, data)
    return response.data
  },

  async deleteDish(id: number): Promise<void> {
    await client.delete(`/dishes/${id}`)
  },

  async updateRecipe(dishId: number, recipe: RecipeItem[]): Promise<void> {
    // Бэкенд ожидает только ingredientId и qtyPerDish, без ingredientName и unit
    const ingredients = recipe.map(item => ({
      ingredientId: item.ingredientId,
      qtyPerDish: item.qtyPerDish,
    }))
    await client.put(`/dishes/${dishId}/recipe`, { ingredients })
  },

  async uploadDishImage(id: number, file: File): Promise<Dish> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await client.post<Dish>(`/dishes/${id}/image`, formData)
    return response.data
  },

  // Orders
  async createOrder(params?: { name?: string; tableId?: number; guestId?: number; idempotencyKey?: string; orderSource?: string }): Promise<Order> {
    const body: { name?: string; tableId?: number; guestId?: number; idempotencyKey?: string; orderSource?: string } = {}
    if (params?.name != null) body.name = params.name
    if (params?.tableId != null) body.tableId = params.tableId
    if (params?.guestId != null) body.guestId = params.guestId
    if (params?.idempotencyKey) body.idempotencyKey = params.idempotencyKey
    if (params?.orderSource) body.orderSource = params.orderSource
    const response = await client.post<Order>('/orders', body)
    return response.data
  },

  async updateOrder(id: number, body: { name?: string; tableId?: number; guestId?: number; clearGuest?: boolean }): Promise<Order> {
    const response = await client.patch<Order>(`/orders/${id}`, body)
    return response.data
  },

  async getOrders(filters?: {
    from?: string
    to?: string
    status?: string
    onlyMyOrders?: boolean
    dishId?: number
    page?: number
    size?: number
    sort?: string
    cacheBust?: boolean
  }): Promise<Order[] | { content: Order[]; totalElements: number; totalPages: number; number: number; size: number }> {
    const params = new URLSearchParams()
    if (filters?.from) params.append('from', filters.from)
    if (filters?.to) params.append('to', filters.to)
    if (filters?.status) params.append('status', filters.status)
    if (filters?.onlyMyOrders) params.append('onlyMyOrders', 'true')
    if (filters?.dishId != null) params.append('dishId', String(filters.dishId))
    if (filters?.sort) params.append('sort', filters.sort)
    if (filters?.cacheBust) params.append('_t', String(Date.now()))
    const wantPage = filters?.page != null && filters?.size != null
    params.append('page', String(filters?.page ?? 0))
    params.append('size', String(filters?.size ?? 100))
    const response = await client.get<{ content: Order[]; totalElements: number; totalPages: number; number: number; size: number }>(`/orders?${params}`)
    const data = response.data
    return wantPage ? data : (data.content || [])
  },

  async getOrder(id: number): Promise<Order> {
    const response = await client.get<Order>(`/orders/${id}`)
    const order = response.data
    // Гарантируем, что items всегда массив
    return {
      ...order,
      items: order.items || []
    }
  },

  async addOrderItem(
    orderId: number,
    dishId: number,
    qty: number,
    comment?: string,
    selections?: Array<{ groupInstanceId: number; optionItemId?: number; optionQty?: number; valueInt?: number }>
  ) {
    const response = await client.post(`/orders/${orderId}/items`, { dishId, qty, comment, selections })
    return response.data
  },

  async updateOrderItem(orderId: number, itemId: number, qty: number, comment?: string) {
    const response = await client.put(`/orders/${orderId}/items/${itemId}`, { qty, comment })
    return response.data
  },

  async removeOrderItem(orderId: number, itemId: number) {
    await client.delete(`/orders/${orderId}/items/${itemId}`)
  },

  async closeOrder(orderId: number) {
    const response = await client.post(`/orders/${orderId}/close`)
    return response.data
  },

  async markOrderPaid(orderId: number): Promise<Order> {
    const response = await client.post<Order>(`/orders/${orderId}/mark-paid`)
    return response.data
  },

  async markOrderUnpaid(orderId: number, reason?: string): Promise<Order> {
    const response = await client.post<Order>(`/orders/${orderId}/mark-unpaid`, { reason })
    return response.data
  },

  async getOrderPaymentMarks(
    orderId: number,
  ): Promise<
    Record<
      string,
      { paid: boolean; paidVia: 'ONLINE' | 'CASH'; telegramPaymentRequestId?: string }
    >
  > {
    const response = await client.get<
      Record<string, { paid?: boolean; paidVia?: string; telegramPaymentRequestId?: string }>
    >(`/orders/${orderId}/payment-marks`)
    const data = response.data ?? {}
    const normalized: Record<
      string,
      { paid: boolean; paidVia: 'ONLINE' | 'CASH'; telegramPaymentRequestId?: string }
    > = {}
    for (const [id, v] of Object.entries(data)) {
      const tg = v?.telegramPaymentRequestId
      normalized[id] = {
        paid: !!v?.paid,
        paidVia: (v?.paidVia === 'CASH' ? 'CASH' : 'ONLINE') as 'ONLINE' | 'CASH',
        ...(typeof tg === 'string' && tg ? { telegramPaymentRequestId: tg } : {}),
      }
    }
    return normalized
  },

  async setOrderPaymentMark(
    orderId: number,
    paymentRequestId: string,
    markedPaid: boolean,
    paidVia?: 'ONLINE' | 'CASH',
    telegramPaymentRequestId?: string | null,
  ): Promise<void> {
    await client.post(`/orders/${orderId}/payment-marks`, {
      paymentRequestId,
      markedPaid,
      paidVia: paidVia ?? 'ONLINE',
      ...(telegramPaymentRequestId
        ? { telegramPaymentRequestId: String(telegramPaymentRequestId) }
        : {}),
    })
  },

  async updateOrderPaymentAccountPayer(orderId: number, accountPayer: number[]): Promise<Order> {
    const response = await client.patch<Order>(`/orders/${orderId}/payment-account-payer`, {
      accountPayer,
    })
    return response.data
  },

  async deleteOrder(orderId: number): Promise<void> {
    await client.delete(`/orders/${orderId}`)
  },

  async getOpenOrderByTable(tableId: number): Promise<Order | null> {
    const response = await client.get<Order | null>(`/orders/open-by-table/${tableId}`)
    return response.data
  },

  async getOrCreateOrderByTable(tableId: number): Promise<Order> {
    const response = await client.post<Order>(`/orders/by-table/${tableId}`)
    return response.data
  },

  // Analytics
  async getRevenue(from?: string, to?: string): Promise<RevenueDto> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<RevenueDto>(`/analytics/revenue?${params}`)
    return response.data
  },

  async getTopDishes(from?: string, to?: string, limit = 10): Promise<TopDishDto[]> {
    const params = new URLSearchParams({ limit: limit.toString() })
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<TopDishDto[]>(`/analytics/top-dishes?${params}`)
    return response.data
  },

  async getIngredientUsage(from?: string, to?: string): Promise<IngredientUsageDto[]> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<IngredientUsageDto[]>(`/analytics/ingredient-usage?${params}`)
    return response.data
  },

  async getProblemIngredients(): Promise<ProblemIngredientDto[]> {
    const response = await client.get<ProblemIngredientDto[]>('/analytics/problem-ingredients')
    return response.data
  },

  async getEmployeeAnalytics(from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<any>(`/analytics/employees?${params}`)
    return response.data
  },

  async getProductSalesAnalytics(from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<any>(`/analytics/product-sales?${params}`)
    return response.data
  },

  async getBookingTariffVisitAnalytics(from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<any>(`/analytics/booking-tariff-visits?${params}`)
    return response.data
  },

  async getOverview(from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<any>(`/analytics/overview?${params}`)
    return response.data
  },

  async getPricingRulesImpact(from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<any>(`/analytics/pricing-rules?${params}`)
    return response.data
  },

  /** Полный сводный XLSX: аналитика, смены, склад, журнал, меню и др. */
  async exportRestaurantDataXlsx(from: string, to: string): Promise<void> {
    const params = new URLSearchParams({ format: 'xlsx', from, to })
    return downloadApiBlob(`/analytics/export?${params}`, `restaurant_data_${from}_${to}.xlsx`)
  },

  /** ZIP: full_report.xlsx + отдельные CSV (заказы, брони, склад, журнал, смены) */
  async exportRestaurantDataZip(from: string, to: string): Promise<void> {
    const params = new URLSearchParams({ format: 'zip', from, to })
    return downloadApiBlob(`/analytics/export?${params}`, `restaurant_data_${from}_${to}.zip`)
  },

  async exportOrdersCsvDownload(from: string, to: string): Promise<void> {
    const params = new URLSearchParams({ from, to })
    return downloadApiBlob(`/orders/export?${params}`, `orders_${from}_${to}.csv`)
  },

  async exportBookingsCsvDownload(from: string, to: string): Promise<void> {
    const params = new URLSearchParams({
      from: `${from}T00:00:00`,
      to: `${to}T23:59:59`,
    })
    return downloadApiBlob(`/bookings/export?${params}`, `bookings_${from}_${to}.csv`)
  },

  async exportActivityLogCsvDownload(from: string, to: string): Promise<void> {
    const params = new URLSearchParams({ from, to })
    return downloadApiBlob(`/activity-log/export-csv?${params}`, `activity_log_${from}_${to}.csv`)
  },


  // Activity Log
  async getActivityLog(page = 0, size = 100, filters?: {
    from?: string
    to?: string
    actionType?: string
    entityType?: string
    userName?: string
  }) {
    const params = new URLSearchParams()
    params.append('page', page.toString())
    params.append('size', size.toString())
    params.append('sort', 'createdAt,desc')
    if (filters?.from) params.append('fromDate', filters.from)
    if (filters?.to) params.append('toDate', filters.to)
    if (filters?.actionType) params.append('actionType', filters.actionType)
    if (filters?.entityType) params.append('entityType', filters.entityType)
    if (filters?.userName) params.append('userName', filters.userName)
    const response = await client.get<any>(`/activity-log?${params}`)
    const data = response.data
    return {
      content: data?.content || [],
      totalPages: data?.totalPages || 0,
      totalElements: data?.totalElements || 0,
      page: data?.number ?? page,
      size: data?.size ?? size,
    }
  },

  async getActivityLogActionTypes(): Promise<string[]> {
    const response = await client.get<string[]>('/activity-log/action-types')
    return response.data
  },

  async getActivityLogEntityTypes(actionType?: string): Promise<string[]> {
    const params = new URLSearchParams()
    if (actionType) params.append('actionType', actionType)
    const response = await client.get<string[]>(`/activity-log/entity-types?${params}`)
    return response.data
  },

  async getActivityLogUserNames(actionType?: string, entityType?: string): Promise<string[]> {
    const params = new URLSearchParams()
    if (actionType) params.append('actionType', actionType)
    if (entityType) params.append('entityType', entityType)
    const response = await client.get<string[]>(`/activity-log/user-names?${params}`)
    return response.data
  },

  // Users (ADMIN only)
  async getUsers(page = 0, size = 20) {
    const params = new URLSearchParams({ page: page.toString(), size: size.toString() })
    const response = await client.get<{ content: User[]; totalElements: number }>(
      `/users?${params}`
    )
    return response.data
  },

  async createWorker(data: CreateAdminRequest) {
    const response = await client.post('/users', data)
    return response.data
  },

  async getUser(id: number): Promise<User> {
    const response = await client.get<User>(`/users/${id}`)
    return response.data
  },

  async updateUser(id: number, data: UpdateWorkerRequest) {
    const response = await client.patch<User>(`/users/${id}`, data)
    return response.data
  },

  async activateUser(id: number) {
    const response = await client.patch(`/users/${id}/activate`)
    return response.data
  },

  async deactivateUser(id: number) {
    const response = await client.patch(`/users/${id}/deactivate`)
    return response.data
  },
}

export const permissionTemplateService = {
  async list(): Promise<PermissionTemplate[]> {
    const response = await client.get<PermissionTemplate[]>('/permission-templates')
    return response.data
  },

  async create(body: UpsertPermissionTemplateRequest): Promise<PermissionTemplate> {
    const response = await client.post<PermissionTemplate>('/permission-templates', body)
    return response.data
  },

  async update(id: number, body: UpsertPermissionTemplateRequest): Promise<PermissionTemplate> {
    const response = await client.patch<PermissionTemplate>(`/permission-templates/${id}`, body)
    return response.data
  },

  async remove(id: number): Promise<void> {
    await client.delete(`/permission-templates/${id}`)
  },
}

// QR-меню: ссылка и срок действия токена (для печати QR на столики)
export interface QrMenuConfig {
  menuQrUrl: string
  expiresAt: string
  expired?: boolean
}
export const qrMenuConfigService = {
  async getConfig(): Promise<QrMenuConfig> {
    const response = await client.get<QrMenuConfig>('/qr-menu/config')
    return response.data
  },
  async updateExpiry(expiresAt: string): Promise<QrMenuConfig> {
    const response = await client.patch<QrMenuConfig>('/qr-menu/config/expiry', { expiresAt })
    return response.data
  },
}

// Tariff services
export const tariffService = {
  async getTariffPlans(restaurantId?: number, isActive?: boolean, page = 0, size = 20) {
    const params = new URLSearchParams({ page: page.toString(), size: size.toString() })
    if (restaurantId) params.append('restaurantId', restaurantId.toString())
    if (isActive !== undefined) params.append('isActive', isActive.toString())
    const response = await client.get<{ content: TariffPlan[]; totalElements: number }>(`/tariffs/plans?${params}`)
    return response.data
  },

  async getTariffPlan(id: number): Promise<TariffPlan> {
    const response = await client.get<TariffPlan>(`/tariffs/plans/${id}`)
    return response.data
  },

  async createTariffPlan(plan: Partial<TariffPlan>): Promise<TariffPlan> {
    const response = await client.post<TariffPlan>('/tariffs/plans', plan)
    return response.data
  },

  async updateTariffPlan(id: number, plan: Partial<TariffPlan>): Promise<TariffPlan> {
    const response = await client.put<TariffPlan>(`/tariffs/plans/${id}`, plan)
    return response.data
  },

  async deleteTariffPlan(id: number): Promise<void> {
    await client.delete(`/tariffs/plans/${id}`)
  },

  async getTariffRules(planId: number): Promise<TariffRule[]> {
    const response = await client.get<TariffRule[]>(`/tariffs/plans/${planId}/rules`)
    return response.data
  },

  async createTariffRule(planId: number, rule: Partial<TariffRule>): Promise<TariffRule> {
    const response = await client.post<TariffRule>(`/tariffs/plans/${planId}/rules`, rule)
    return response.data
  },

  async updateTariffRule(id: number, rule: Partial<TariffRule>): Promise<TariffRule> {
    const response = await client.put<TariffRule>(`/tariffs/rules/${id}`, rule)
    return response.data
  },

  async deleteTariffRule(id: number): Promise<void> {
    await client.delete(`/tariffs/rules/${id}`)
  },

}

// Pricing services
export const pricingService = {
  async preview(request: PricingRequest): Promise<PricingResult> {
    const response = await client.post<PricingResult>('/pricing/preview', request)
    return response.data
  },

  async run(request: PricingRequest): Promise<PricingResult> {
    const response = await client.post<PricingResult>('/pricing/run', request)
    return response.data
  },
}

// Shift services
export const shiftService = {
  async getShifts(employeeId?: number, restaurantId?: number, from?: string, to?: string): Promise<Shift[]> {
    const params = new URLSearchParams()
    if (employeeId) params.append('employeeId', employeeId.toString())
    if (restaurantId) params.append('restaurantId', restaurantId.toString())
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<Shift[]>(`/shifts?${params}`)
    return response.data
  },

  async exportShiftsCsvDownload(from: string, to: string): Promise<void> {
    const params = new URLSearchParams({ from, to })
    return downloadApiBlob(`/shifts/export-csv?${params}`, `shifts_${from}_${to}.csv`)
  },

  async getShift(id: number): Promise<Shift> {
    const response = await client.get<Shift>(`/shifts/${id}`)
    return response.data
  },

  async createShift(request: CreateShiftRequest): Promise<Shift> {
    const response = await client.post<Shift>('/shifts', request)
    return response.data
  },

  async createShiftsBulk(shifts: CreateShiftRequest[]): Promise<Shift[]> {
    const response = await client.post<Shift[]>('/shifts/bulk', { shifts })
    return response.data
  },

  async updateShift(id: number, request: UpdateShiftRequest): Promise<Shift> {
    const response = await client.put<Shift>(`/shifts/${id}`, request)
    return response.data
  },

  async deleteShift(id: number): Promise<void> {
    await client.delete(`/shifts/${id}`)
  },

  async publishShift(id: number): Promise<Shift> {
    const response = await client.post<Shift>(`/shifts/${id}/publish`)
    return response.data
  },

  async publishWeek(weekStart: string): Promise<void> {
    await client.post('/shifts/publish-week', { weekStart })
  },

  async lockShift(id: number): Promise<Shift> {
    const response = await client.post<Shift>(`/shifts/${id}/lock`)
    return response.data
  },

  async getConflicts(restaurantId: number, startTime: string, endTime: string): Promise<Shift[]> {
    const params = new URLSearchParams({
      restaurantId: restaurantId.toString(),
      startTime,
      endTime,
    })
    const response = await client.get<Shift[]>(`/shifts/conflicts?${params}`)
    return response.data
  },

  async getShiftTemplates(restaurantId?: number): Promise<ShiftTemplate[]> {
    const params = new URLSearchParams()
    if (restaurantId) params.append('restaurantId', restaurantId.toString())
    const response = await client.get<ShiftTemplate[]>(`/shifts/templates?${params}`)
    return response.data
  },

  async createShiftTemplate(request: CreateShiftTemplateRequest): Promise<ShiftTemplate> {
    const response = await client.post<ShiftTemplate>('/shifts/templates', request)
    return response.data
  },

  async deleteShiftTemplate(id: number): Promise<void> {
    await client.delete(`/shifts/templates/${id}`)
  },

  async generateFromTemplate(templateId: number, startDate: string, endDate: string, employeeIds: number[]): Promise<Shift[]> {
    const params = new URLSearchParams({
      startDate,
      endDate,
    })
    employeeIds.forEach(id => params.append('employeeIds', id.toString()))
    const response = await client.post<Shift[]>(`/shifts/templates/${templateId}/generate?${params}`)
    return response.data
  },

  async createSwapRequest(request: Partial<ShiftSwapRequest>): Promise<ShiftSwapRequest> {
    const response = await client.post<ShiftSwapRequest>('/shifts/swap', request)
    return response.data
  },

  async acceptSwapRequest(id: number): Promise<ShiftSwapRequest> {
    const response = await client.post<ShiftSwapRequest>(`/shifts/swap/${id}/accept`)
    return response.data
  },

  async rejectSwapRequest(id: number): Promise<ShiftSwapRequest> {
    const response = await client.post<ShiftSwapRequest>(`/shifts/swap/${id}/reject`)
    return response.data
  },
}

// Activity services
export const activityService = {
  async getActivities(branchId?: number, status?: string): Promise<Activity[]> {
    const params = new URLSearchParams()
    if (branchId) params.append('branchId', branchId.toString())
    if (status) params.append('status', status)
    const response = await client.get<Activity[]>(`/activities?${params}`)
    return response.data
  },

  async getActivity(id: number): Promise<Activity> {
    const response = await client.get<Activity>(`/activities/${id}`)
    return response.data
  },

  async createActivity(activity: Partial<Activity>): Promise<Activity> {
    const response = await client.post<Activity>('/activities', activity)
    return response.data
  },

  async updateActivity(id: number, activity: Partial<Activity>): Promise<Activity> {
    const response = await client.put<Activity>(`/activities/${id}`, activity)
    return response.data
  },

  async deleteActivity(id: number): Promise<void> {
    await client.delete(`/activities/${id}`)
  },
}

// Booking services
export const bookingService = {
  async getBookings(filters?: {
    branchId?: number
    activityId?: number
    from?: string
    to?: string
    status?: string | string[]
    page?: number
    size?: number
    sort?: string
    customerSearch?: string
  }): Promise<Booking[] | { content: Booking[]; totalElements: number; totalPages: number; number: number; size: number }> {
    const params = new URLSearchParams()
    if (filters?.branchId) params.append('branchId', filters.branchId.toString())
    if (filters?.activityId) params.append('activityId', filters.activityId.toString())
    if (filters?.from) params.append('from', filters.from)
    if (filters?.to) params.append('to', filters.to)
    if (filters?.status != null) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
      statuses.forEach(s => params.append('status', s))
    }
    if (filters?.page != null) params.append('page', String(filters.page))
    if (filters?.size != null) params.append('size', String(filters.size))
    if (filters?.sort) params.append('sort', filters.sort)
    if (filters?.customerSearch != null && filters.customerSearch.trim() !== '') params.append('customerSearch', filters.customerSearch.trim())
    const response = await client.get<Booking[] | { content: Booking[]; totalElements: number; totalPages: number; number: number; size: number }>(`/bookings?${params}`)
    return response.data
  },

  async getBooking(id: number): Promise<Booking> {
    const response = await client.get<Booking>(`/bookings/${id}`)
    return response.data
  },

  async createBooking(booking: Partial<Booking>): Promise<Booking> {
    const response = await client.post<Booking>('/bookings', booking)
    return response.data
  },

  async updateBooking(id: number, booking: Partial<Booking>): Promise<Booking> {
    const response = await client.put<Booking>(`/bookings/${id}`, booking)
    return response.data
  },

  async cancelBooking(id: number): Promise<Booking> {
    const response = await client.post<Booking>(`/bookings/${id}/cancel`)
    return response.data
  },

  /** Cancel multiple bookings in one request (e.g. "delete order" = cancel all bookings in group). */
  async cancelBookingsBulk(bookingIds: number[]): Promise<{ cancelled: number; bookings: Booking[] }> {
    if (!bookingIds.length) return { cancelled: 0, bookings: [] }
    const response = await client.post<{ cancelled: number; bookings: Booking[] }>('/bookings/cancel-bulk', { bookingIds })
    return response.data
  },

  async markAsPaid(id: number): Promise<Booking> {
    const response = await client.post<Booking>(`/bookings/${id}/mark-paid`)
    return response.data
  },

  async getAvailability(
    branchId: number,
    activityId: number,
    from: string,
    to: string
  ): Promise<AvailabilityResponse> {
    const params = new URLSearchParams({
      branchId: branchId.toString(),
      activityId: activityId.toString(),
      from,
      to,
    })
    const response = await client.get<AvailabilityResponse>(`/availability?${params}`)
    return response.data
  },
}

// Заказы по бронированиям.
export const bookingOrderService = {
  async create(branchId: number, customerName: string, customerPhone: string): Promise<{ id: number }> {
    const res = await client.post<{ id: number }>('/booking-orders', { branchId, customerName, customerPhone })
    return res.data
  },
  /** cancelBookings: true — отменить все брони и удалить заказ; false — только удалить заказ (брони остаются). */
  async delete(bookingOrderId: number, cancelBookings = false): Promise<void> {
    const params = cancelBookings ? '?cancelBookings=true' : ''
    await client.delete(`/booking-orders/${bookingOrderId}${params}`)
  },
  /** cancelBookings: true — отменить все брони группы; false — только отвязать от заказа. */
  async dissolve(branchId: number, customerName: string, customerPhone: string, cancelBookings = false): Promise<void> {
    await client.post('/booking-orders/dissolve', { branchId, customerName, customerPhone, cancelBookings })
  },
}

// Availability service (alias for convenience)
export const availabilityService = bookingService

// Booking Analytics service
export const bookingAnalyticsService = {
  async getFullDashboard(from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<any>(`/booking-analytics/dashboard?${params}`)
    return response.data
  },

  async getVolume(from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<any>(`/booking-analytics/volume?${params}`)
    return response.data
  },

  async getRevenue(from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<any>(`/booking-analytics/revenue?${params}`)
    return response.data
  },

  async getConversion(from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<any>(`/booking-analytics/conversion?${params}`)
    return response.data
  },

  async getCapacity(from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<any>(`/booking-analytics/capacity?${params}`)
    return response.data
  },

  async getStopCheck(from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<any>(`/booking-analytics/stop-check?${params}`)
    return response.data
  },

  async getTariffs(from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<any>(`/booking-analytics/tariffs?${params}`)
    return response.data
  },

  async getNotifications(from?: string, to?: string): Promise<any> {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const response = await client.get<any>(`/booking-analytics/notifications?${params}`)
    return response.data
  },
}

// ML Forecast service (Prophet / SARIMA)
export interface ForecastResponse {
  metric: string
  model: string
  horizon: number
  trend: 'up' | 'down' | 'stable'
  mape: number | null
  forecast: string[]
  values: number[]
  lower_bound: number[]
  upper_bound: number[]
}

export interface ActivityBreakdownEntry {
  segment_id: string
  segment_name: string
  predicted_total: number
  lower_total: number | null
  upper_total: number | null
  covered_days: number
}

export interface MonthlyForecastResponse {
  metric: string
  year: number
  month: number
  period_start: string
  period_end: string
  status: 'full' | 'partial' | 'no_data'
  covered_days: number
  total_days: number
  coverage_ratio: number
  predicted_total: number
  lower_total: number | null
  upper_total: number | null
  model_family_used: string
  last_updated_timestamp: string
  notes: Record<string, any>
  error?: string
  /** Сообщение для пользователя при недостатке данных (no_data, no_forecast_available) */
  message?: string
  by_activity?: ActivityBreakdownEntry[]
}

export interface MonthlyAccuracyEntry {
  metric: string
  year: number
  month: number
  predicted_total: number
  actual_total: number
  smape: number
  mae: number
  evaluated_at: string
}

export interface MonthProgressResponse {
  metric: string
  year: number
  month: number
  total_days: number
  days_elapsed: number
  days_remaining: number
  actual_so_far: number
  predicted_for_elapsed_days: number
  variance: number
  variance_pct: number
  pace: 'on_track' | 'ahead' | 'behind'
  snapshot_total: number
  revised_total: number
  remaining_forecast: number
  snapshot_actual_days: number
  snapshot_forecast_days: number
  error?: string
}

export interface ForecastAccuracy {
  mape: number | null
  mae: number | null
  rmse: number | null
  status: string
  action?: string
  n_compared?: number
}

export interface ForecastVsActual {
  metric: string
  dates: string[]
  actual: number[]
  forecast: number[]
  lower: number[]
  upper: number[]
}

export const forecastService = {
  async getForecast(metric: string, horizon = 31, restaurantId?: number): Promise<ForecastResponse> {
    const params = new URLSearchParams({ horizon: String(horizon) })
    if (restaurantId) params.append('restaurantId', String(restaurantId))
    const response = await client.get<ForecastResponse>(`/forecast/${metric}?${params}`)
    return response.data
  },

  async getMonthlyForecast(metric: string, year: number, month: number, opts?: { forceRefresh?: boolean; breakdown?: 'activity' }): Promise<MonthlyForecastResponse> {
    const params = new URLSearchParams({ period: 'month', year: String(year), month: String(month) })
    if (opts?.forceRefresh) params.append('force_refresh', '1')
    if (opts?.breakdown) params.append('breakdown', opts.breakdown)
    const response = await client.get<MonthlyForecastResponse>(`/forecast/${metric}?${params}`)
    return response.data
  },

  async getMonthProgress(metric: string, year: number, month: number): Promise<MonthProgressResponse> {
    const params = new URLSearchParams({ year: String(year), month: String(month) })
    const response = await client.get<MonthProgressResponse>(`/forecast/${metric}/month-progress?${params}`)
    return response.data
  },

  async getMonthlyAccuracy(metric: string, limit = 12): Promise<MonthlyAccuracyEntry[]> {
    const params = new URLSearchParams({ limit: String(limit) })
    const response = await client.get<MonthlyAccuracyEntry[]>(`/forecast/${metric}/monthly-accuracy?${params}`)
    return response.data
  },

  async getAccuracy(metric: string, restaurantId?: number): Promise<ForecastAccuracy> {
    const params = new URLSearchParams()
    if (restaurantId) params.append('restaurantId', String(restaurantId))
    const response = await client.get<ForecastAccuracy>(`/forecast/${metric}/accuracy?${params}`)
    return response.data
  },

  async getVsActual(metric: string, restaurantId?: number): Promise<ForecastVsActual> {
    const params = new URLSearchParams()
    if (restaurantId) params.append('restaurantId', String(restaurantId))
    const response = await client.get<ForecastVsActual>(`/forecast/${metric}/vs-actual?${params}`)
    return response.data
  },

  async getUpdating(restaurantId?: number): Promise<{ updating: boolean }> {
    const params = new URLSearchParams()
    if (restaurantId) params.append('restaurantId', String(restaurantId))
    const url = params.toString() ? `/forecast/updating?${params}` : '/forecast/updating'
    const response = await client.get<{ updating: boolean }>(url)
    return response.data
  },

  async getSummary(horizon = 31, restaurantId?: number): Promise<Record<string, ForecastResponse>> {
    const params = new URLSearchParams({ horizon: String(horizon) })
    if (restaurantId) params.append('restaurantId', String(restaurantId))
    const response = await client.get<Record<string, ForecastResponse>>(`/forecast/summary?${params}`)
    return response.data
  },

  async train(metric: string, force = false, restaurantId?: number): Promise<any> {
    const params = new URLSearchParams({ force: String(force) })
    if (restaurantId) params.append('restaurantId', String(restaurantId))
    const response = await client.post(`/forecast/train/${metric}?${params}`)
    return response.data
  },

  async health(): Promise<{ status: string }> {
    const response = await client.get<{ status: string }>('/forecast/health')
    return response.data
  },
}

// Calendar services
export const calendarService = {
  async getCalendars(organizationId?: number, branchId?: number): Promise<Calendar[]> {
    const params = new URLSearchParams()
    if (organizationId) params.append('organizationId', organizationId.toString())
    if (branchId) params.append('branchId', branchId.toString())
    const response = await client.get<Calendar[]>(`/calendars?${params}`)
    return response.data
  },

  async getCalendar(id: number): Promise<Calendar> {
    const response = await client.get<Calendar>(`/calendars/${id}`)
    return response.data
  },

  async createCalendar(calendar: Partial<Calendar>): Promise<Calendar> {
    const response = await client.post<Calendar>('/calendars', calendar)
    return response.data
  },

  async updateCalendar(id: number, calendar: Partial<Calendar>): Promise<CalendarUpdateResponse> {
    const response = await client.put<CalendarUpdateResponse>(`/calendars/${id}`, calendar)
    return response.data
  },

  async deleteCalendar(id: number): Promise<void> {
    await client.delete(`/calendars/${id}`)
  },

  async addSpecialDate(calendarId: number, date: string): Promise<Calendar> {
    const response = await client.post<Calendar>(`/calendars/${calendarId}/special-dates?date=${date}`)
    return response.data
  },

  async removeSpecialDate(calendarId: number, date: string): Promise<Calendar> {
    const response = await client.delete<Calendar>(`/calendars/${calendarId}/special-dates?date=${date}`)
    return response.data
  },
}

// Tariff Special Date Modifier services
export const tariffModifierService = {
  async getModifiers(tariffPlanId: number): Promise<TariffSpecialDateModifier[]> {
    const response = await client.get<TariffSpecialDateModifier[]>(`/tariffs/${tariffPlanId}/special-date-modifiers`)
    return response.data
  },

  async getModifierForDate(tariffPlanId: number, date: string): Promise<TariffSpecialDateModifier | null> {
    try {
      const response = await client.get<TariffSpecialDateModifier>(`/tariffs/${tariffPlanId}/special-date-modifiers/date?date=${date}`)
      return response.data
    } catch {
      return null
    }
  },

  async initializeModifiers(tariffPlanId: number, calendarId: number): Promise<void> {
    await client.post(`/tariffs/${tariffPlanId}/special-date-modifiers/initialize?calendarId=${calendarId}`)
  },

  async upsertModifiers(tariffPlanId: number, modifiers: Record<string, Record<string, any>>): Promise<void> {
    await client.put(`/tariffs/${tariffPlanId}/special-date-modifiers`, modifiers)
  },

  async updateModifier(tariffPlanId: number, id: number, modifier: Partial<TariffSpecialDateModifier>): Promise<TariffSpecialDateModifier> {
    const response = await client.put<TariffSpecialDateModifier>(`/tariffs/${tariffPlanId}/special-date-modifiers/${id}`, modifier)
    return response.data
  },

  async deleteModifier(tariffPlanId: number, id: number): Promise<void> {
    await client.delete(`/tariffs/${tariffPlanId}/special-date-modifiers/${id}`)
  },
}

// Stock services
export const stockService = {
  async getStockMovements(filters?: {
    from?: string
    to?: string
    ingredientId?: number
    type?: string
    reason?: string
    page?: number
    size?: number
  }) {
    const params = new URLSearchParams()
    if (filters?.from) params.append('from', filters.from)
    if (filters?.to) params.append('to', filters.to)
    if (filters?.ingredientId) params.append('ingredientId', filters.ingredientId.toString())
    if (filters?.type) params.append('type', filters.type)
    if (filters?.reason) params.append('reason', filters.reason)
    const page = filters?.page ?? 0
    const size = filters?.size ?? 50
    params.append('page', page.toString())
    params.append('size', size.toString())
    const url = `/stock/movements?${params}`
    console.log('[StockMovements API] Request URL:', url)
    console.log('[StockMovements API] Request params:', { page, size, allParams: Object.fromEntries(params) })
    const response = await client.get<{ content: StockMovement[]; totalElements: number; totalPages?: number } | StockMovement[]>(url)
    console.log('[StockMovements API] Response:', { 
      isArray: Array.isArray(response.data),
      contentLength: Array.isArray(response.data) ? response.data.length : response.data?.content?.length,
      totalElements: Array.isArray(response.data) ? undefined : response.data?.totalElements,
      totalPages: Array.isArray(response.data) ? undefined : response.data?.totalPages,
      size: Array.isArray(response.data) ? undefined : (response.data as any)?.size
    })
    return response.data
  },

  async uploadExcel(
    file: File,
    unitMismatchResolutions?: Record<string, ResolveUnitMismatchRequest>,
    missingUnitResolutions?: Record<string, Unit>
  ): Promise<ExcelUploadResponse> {
    const formData = new FormData()
    formData.append('file', file)
    
    if (unitMismatchResolutions && Object.keys(unitMismatchResolutions).length > 0) {
      formData.append('unitMismatchResolutions', JSON.stringify(unitMismatchResolutions))
    }
    
    if (missingUnitResolutions && Object.keys(missingUnitResolutions).length > 0) {
      formData.append('missingUnitResolutions', JSON.stringify(missingUnitResolutions))
    }
    
    const response = await client.post<ExcelUploadResponse>('/stock/upload-excel', formData)
    return response.data
  },

  async downloadStockExcel(): Promise<Blob> {
    const response = await client.get('/stock/export-excel', { responseType: 'blob' })
    return response.data
  },

  async exportMovementsCsvDownload(from: string, to: string): Promise<void> {
    const params = new URLSearchParams({ from, to })
    return downloadApiBlob(`/stock/export-movements-csv?${params}`, `stock_movements_${from}_${to}.csv`)
  },

  async downloadStockExcelAsFile(filename = 'ingredients-stock.xlsx'): Promise<void> {
    const blob = await stockService.downloadStockExcel()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
}

// Dish Category Service
export const categoryService = {
  async getCategories(): Promise<DishCategory[]> {
    const response = await client.get<DishCategory[]>('/categories')
    return response.data
  },

  async getCategoryById(id: number): Promise<DishCategory> {
    const response = await client.get<DishCategory>(`/categories/${id}`)
    return response.data
  },

  async createCategory(name: string): Promise<DishCategory> {
    const response = await client.post<DishCategory>('/categories', { name })
    return response.data
  },

  async updateCategory(id: number, name: string): Promise<DishCategory> {
    const response = await client.put<DishCategory>(`/categories/${id}`, { name })
    return response.data
  },

  async uploadCategoryImage(id: number, file: File): Promise<DishCategory> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await client.post<DishCategory>(`/categories/${id}/image`, formData)
    return response.data
  },

  async deleteCategory(id: number): Promise<void> {
    await client.delete(`/categories/${id}`)
  },
}

// Hall map service
export const hallService = {
  async getView(): Promise<HallView> {
    const response = await client.get<HallView>('/hall/view')
    return response.data
  },

  async updateMap(data: Partial<HallView['map']>): Promise<HallView['map']> {
    const response = await client.put<HallView['map']>('/hall/map', data)
    return response.data
  },

  async getZones(): Promise<HallZone[]> {
    const response = await client.get<HallZone[]>('/hall/zones')
    return response.data
  },

  async createZone(data: Omit<HallZone, 'id' | 'hallMapId'>): Promise<HallZone> {
    const response = await client.post<HallZone>('/hall/zones', data)
    return response.data
  },

  async updateZone(id: number, data: Partial<HallZone>): Promise<HallZone> {
    const response = await client.patch<HallZone>(`/hall/zones/${id}`, data)
    return response.data
  },

  async deleteZone(id: number): Promise<void> {
    await client.delete(`/hall/zones/${id}`)
  },

  async getItems(): Promise<HallPlacedItem[]> {
    const response = await client.get<HallPlacedItem[]>('/hall/items')
    return response.data
  },

  async replaceItems(items: HallPlacedItem[]): Promise<HallPlacedItem[]> {
    const response = await client.put<HallPlacedItem[]>('/hall/items', items)
    return response.data
  },

  async patchItems(patch: HallItemsPatchRequest): Promise<HallItemsPatchResponse> {
    const response = await client.patch<HallItemsPatchResponse>('/hall/items', patch)
    return response.data
  },

  async getAssets(): Promise<HallAsset[]> {
    const response = await client.get<HallAsset[]>('/hall/assets')
    return response.data
  },

  async createAsset(data: Omit<HallAsset, 'id'>): Promise<HallAsset> {
    const response = await client.post<HallAsset>('/hall/assets', data)
    return response.data
  },

  async uploadAssetImage(id: number, file: File): Promise<HallAsset> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await client.post<HallAsset>(`/hall/assets/${id}/image`, formData)
    return response.data
  },

  async getTables(): Promise<HallTable[]> {
    const response = await client.get<HallTable[]>('/hall/tables')
    return response.data
  },

  async getActiveTablesOnMap(): Promise<HallTable[]> {
    const response = await client.get<HallTable[]>('/hall/tables/active')
    return response.data
  },

  async createTable(data: Omit<HallTable, 'id'>): Promise<HallTable> {
    const response = await client.post<HallTable>('/hall/tables', data)
    return response.data
  },
}

// Table Reservation service
export const tableReservationService = {
  async getReservations(filters?: {
    restaurantId?: number
    tableId?: number
    from?: string
    to?: string
    status?: string
  }): Promise<TableReservation[]> {
    const params = new URLSearchParams()
    if (filters?.restaurantId) params.append('restaurantId', filters.restaurantId.toString())
    if (filters?.tableId) params.append('tableId', filters.tableId.toString())
    if (filters?.from) params.append('from', filters.from)
    if (filters?.to) params.append('to', filters.to)
    if (filters?.status) params.append('status', filters.status)
    const response = await client.get<TableReservation[]>(`/table-reservations?${params}`)
    return response.data
  },

  async getReservation(id: number): Promise<TableReservation> {
    const response = await client.get<TableReservation>(`/table-reservations/${id}`)
    return response.data
  },

  async createReservation(reservation: any): Promise<TableReservation> {
    const response = await client.post<TableReservation>('/table-reservations', reservation)
    return response.data
  },

  async updateReservation(id: number, reservation: any): Promise<TableReservation> {
    const response = await client.put<TableReservation>(`/table-reservations/${id}`, reservation)
    return response.data
  },

  async cancelReservation(id: number): Promise<TableReservation> {
    const response = await client.post<TableReservation>(`/table-reservations/${id}/cancel`)
    return response.data
  },

  async completeReservation(id: number): Promise<TableReservation> {
    const response = await client.post<TableReservation>(`/table-reservations/${id}/complete`)
    return response.data
  },
}

// Booking Notification service
export const bookingNotificationService = {
  async getPending(): Promise<BookingNotification[]> {
    const response = await client.get<BookingNotification[]>('/booking-notifications/pending')
    return response.data
  },

  async getAll(): Promise<BookingNotification[]> {
    const response = await client.get<BookingNotification[]>('/booking-notifications')
    return response.data
  },

  async countPending(): Promise<number> {
    const response = await client.get<{ count: number }>('/booking-notifications/count')
    return response.data.count
  },

  async resolve(id: number, responseType: string, newEndAt?: string, activityId?: number): Promise<BookingNotification> {
    const response = await client.post<BookingNotification>(`/booking-notifications/${id}/resolve`, {
      response: responseType,
      newEndAt: newEndAt || null,
      activityId: activityId || null,
    })
    return response.data
  },
}

// Option Group Template service (modifier templates admin)
export interface OptionTemplateItem {
  id?: number
  title: string
  priceDelta: number
  sortOrder?: number
  perOptionMaxQty?: number
  valueInt?: number
  isDefault?: boolean
  /** Доп. списание на 1 optionQty (MULTI_QTY и т.д.) */
  stockIngredientId?: number | null
  stockQtyPerUnit?: number | null
  /** Несколько дополнительных ингредиентов на 1 optionQty */
  extraIngredients?: Array<{ ingredientId: number; qtyPerUnit: number }>
}

export interface OptionTemplate {
  id: number
  key: string
  title: string
  type: string
  presentation: string
  minSelect?: number
  maxSelect?: number
  minTotalQty?: number
  maxTotalQty?: number
  rangeMin?: number
  rangeMax?: number
  pricingMode?: string
  pricePerUnit?: number
  allowSameOptionTwice?: boolean
  sortOrder: number
  isActive: boolean
  /** Пересчёт нормы этого ингредиента по выбору (степпер / valueInt) */
  stockIngredientId?: number | null
  stockScaleBase?: number
  /** Независимый масштаб: для каждого ингредиента хранится (anchorValue -> targetQty). */
  scaleIngredients?: Array<{ ingredientId: number; anchorValue: number; targetQty: number }>
  /** Несколько ингредиентов рецепта, чей расход масштабируется по выбранному числу */
  // legacy: остался для старых фронтов/шаблонов, если вдруг
  scaleIngredientIds?: number[]
  items: OptionTemplateItem[]
}

export const optionTemplateService = {
  async list(): Promise<OptionTemplate[]> {
    const res = await client.get<OptionTemplate[]>('/option-templates')
    return res.data
  },

  async create(data: Partial<OptionTemplate> & { items?: OptionTemplateItem[] }): Promise<OptionTemplate> {
    const res = await client.post<OptionTemplate>('/option-templates', data)
    return res.data
  },

  async update(id: number, data: Partial<OptionTemplate>): Promise<OptionTemplate> {
    const res = await client.put<OptionTemplate>(`/option-templates/${id}`, data)
    return res.data
  },

  async remove(id: number): Promise<void> {
    await client.delete(`/option-templates/${id}`)
  },

  async addItem(templateId: number, item: OptionTemplateItem): Promise<OptionTemplate> {
    const res = await client.post<OptionTemplate>(`/option-templates/${templateId}/items`, item)
    return res.data
  },

  async removeItem(templateId: number, itemId: number): Promise<OptionTemplate> {
    const res = await client.delete<OptionTemplate>(`/option-templates/${templateId}/items/${itemId}`)
    return res.data
  },

  async getDishTemplates(dishId: number): Promise<number[]> {
    const res = await client.get<number[]>(`/option-templates/dish/${dishId}`)
    return res.data
  },

  async getDishOptionGroups(dishId: number): Promise<Array<{
    groupInstanceId: number
    templateId: number
    title: string
    type: string
    presentation: string
    rules: {
      minSelect?: number
      maxSelect?: number
      minTotalQty?: number
      maxTotalQty?: number
      rangeMin?: number
      rangeMax?: number
      pricingMode?: 'PER_UNIT' | 'LOOKUP'
      pricePerUnit?: number
      allowSameOptionTwice?: boolean
    }
    items: Array<{
      optionItemId: number
      title: string
      priceDelta: number
      perOptionMaxQty?: number
      valueInt?: number
      isDefault?: boolean
    }>
  }>> {
    const res = await client.get(`/option-templates/dish/${dishId}/groups`)
    return res.data
  },

  async setDishTemplates(dishId: number, templateIds: number[]): Promise<void> {
    await client.put(`/option-templates/dish/${dishId}`, templateIds)
  },
}
