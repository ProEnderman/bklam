// User and Auth types
export type Role = 'HEAD_ADMIN' | 'ADMIN' | 'REGULAR_WORKER'

export type UserPermission = 
  // Заказы
  | 'VIEW_ORDERS'
  | 'VIEW_ALL_ORDERS'
  | 'CREATE_ORDERS'
  | 'EDIT_OWN_ORDERS'
  | 'EDIT_ALL_ORDERS'
  | 'CLOSE_OWN_ORDERS'
  | 'CLOSE_ALL_ORDERS'
  | 'CANCEL_OWN_ORDERS'
  | 'CANCEL_ALL_ORDERS'
  | 'DELETE_ORDERS'
  // Склад
  | 'VIEW_INGREDIENTS'
  | 'CREATE_INGREDIENTS'
  | 'UPDATE_INGREDIENTS'
  | 'DELETE_INGREDIENTS'
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'UPLOAD_EXCEL'
  | 'VIEW_STOCK_MOVEMENTS'
  // Блюда
  | 'VIEW_DISHES'
  | 'CREATE_DISHES'
  | 'UPDATE_DISHES'
  | 'DELETE_DISHES'
  | 'MANAGE_RECIPES'
  | 'MANAGE_CATEGORIES'
  // Бронирования
  | 'VIEW_BOOKINGS'
  | 'CREATE_BOOKINGS'
  | 'EDIT_BOOKINGS'
  | 'CANCEL_BOOKINGS'
  | 'DELETE_BOOKINGS'
  | 'VIEW_BOOKING_CALENDAR'
  // Тарифы и календари
  | 'MANAGE_ACTIVITIES'
  | 'MANAGE_TARIFFS'
  | 'MANAGE_TARIFF_RULES'
  | 'MANAGE_CALENDARS'
  | 'USE_PRICING_CALCULATOR'
  // Смены
  | 'VIEW_SHIFTS'
  | 'MANAGE_SHIFTS'
  // Пользователи
  | 'VIEW_USERS'
  | 'CREATE_WORKERS'
  | 'UPDATE_USERS'
  | 'ACTIVATE_DEACTIVATE_USERS'
  | 'DELETE_USERS'
  // Аналитика
  | 'VIEW_ANALYTICS'
  | 'VIEW_BI_DASHBOARD'
  | 'VIEW_ACTIVITY_LOG'
  | 'EXPORT_REPORTS'
  // Карта зала
  | 'VIEW_HALL_MAP'
  | 'MANAGE_HALL_MAP'
  | 'MANAGE_HALL_ZONES'
  | 'MANAGE_HALL_TABLES'

export interface User {
  id: number
  username: string
  firstName?: string
  lastName?: string
  role: Role
  restaurantId?: number
  restaurantName?: string
  isActive: boolean
  permissions?: UserPermission[]
}

export interface AuthResponse {
  user: User
  message: string
}

export interface RequestCodeResponse {
  challengeId: string
  message: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface VerifyCodeRequest {
  challengeId: string
  code: string
}

// Restaurant types
export interface Restaurant {
  id: number
  name: string
  hasTelegramBotToken?: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateRestaurantRequest {
  name: string
  telegramBotToken?: string
}

export interface CreateAdminRequest {
  email: string
  password: string
  firstName?: string
  lastName?: string
  permissions?: UserPermission[]
}

/** PATCH /users/:id — только переданные поля; newPassword опционально (≥8 символов). */
export interface UpdateWorkerRequest {
  firstName?: string | null
  lastName?: string | null
  permissions?: UserPermission[] | null
  newPassword?: string | null
}

/** Именованный набор прав для быстрого создания сотрудников (REGULAR_WORKER) */
export interface PermissionTemplate {
  id: number
  restaurantId: number
  name: string
  description?: string | null
  permissions: UserPermission[]
  createdAt: string
  updatedAt: string
}

export interface UpsertPermissionTemplateRequest {
  name: string
  description?: string | null
  permissions?: UserPermission[]
}

// Ingredient types
export type Unit = 'G' | 'ML' | 'PCS'

export interface Ingredient {
  id: number
  name: string
  unit: Unit
  stockQty: number
  minQty: number
  restaurantId: number
  createdAt: string
}

export interface StockMovement {
  id: number
  ingredientId: number
  ingredientName: string
  type: 'IN' | 'OUT'
  qty: number
  reason: string
  orderId?: number
  createdBy: string
  createdAt: string
  note?: string
}

// Dish types
export interface DishCategory {
  id: number
  name: string
  imageUrl?: string
  restaurantId: number
  createdAt: string
  updatedAt: string
}

export interface Dish {
  id: number
  name: string
  price: number
  isActive: boolean
  categoryId?: number
  categoryName?: string
  imageUrl?: string
  restaurantId: number
  createdAt: string
}

export interface RecipeItem {
  ingredientId: number
  ingredientName: string
  qtyPerDish: number
  unit: Unit
}

// Order types
export type OrderStatus = 'OPEN' | 'CLOSED' | 'CANCELED'
export type OrderSource = 'POS' | 'QR' | 'TELEGRAM' | 'WEB' | 'MOBILE' | 'API'

export interface OrderItemModifier {
  groupTitle: string
  optionTitle: string
  priceDelta: number
  qty: number
  valueInt?: number
}

export interface OrderItem {
  id: number
  dishId: number
  dishName: string
  qty: number
  price: number
  lineTotal: number
  comment?: string
  modifiers?: OrderItemModifier[]
}

export interface Order {
  id: number
  status: OrderStatus
  totalAmount: number
  createdAt: string
  closedAt?: string
  createdBy: string
  name?: string
  tableId?: number
  tableLabel?: string
  hallName?: string
  orderSource?: OrderSource
  guestId?: number
  guestLabel?: string
  paidAt?: string
  unpaidReason?: string
  /** Есть ли разделение счёта (split bill) */
  hasSplit?: boolean
  /** Все части счёта отмечены оплаченными (онлайн или наличными). Для заказов без split — true. */
  allPaymentSlotsPaid?: boolean
  /** Кастомный split: для каждого счёта — индекс гостя-плательщика (с сервера). */
  paymentAccountPayer?: number[] | null
  items: OrderItem[]
}

// Hall map (карта зала)
export type HallItemType = 'TABLE' | 'DECOR'
export type HallAssetType = 'TABLE' | 'DECOR'

export interface HallMap {
  id: number
  name: string
  gridWidth: number
  gridHeight: number
  version: number
}

export interface HallZone {
  id: number
  hallMapId: number
  name: string
  x: number
  y: number
  w: number
  h: number
  // Optional painted zone (non-rectangular): list of cells
  cells?: Array<{ x: number; y: number }>
  // Polygon vertices for editing
  vertices?: Array<{ x: number; y: number }>
  color: string
  activeForWaiter: boolean
}

export interface HallAsset {
  id: number
  name: string
  type: HallAssetType
  imageUrl?: string
  widthCells: number
  heightCells: number
  defaultCapacity?: number
}

export interface HallTable {
  id: number
  label: string
  capacity: number
  isActive: boolean
}

export interface HallPlacedItem {
  id: number
  hallMapId: number
  assetId?: number
  type: HallItemType
  x: number
  y: number
  w: number
  h: number
  rotation: number
  layer: number
  tableId?: number
  locked: boolean
}

export interface HallView {
  map: HallMap
  zones: HallZone[]
  assets: HallAsset[]
  tables: HallTable[]
  items: HallPlacedItem[]
}

export interface HallItemsPatchRequest {
  baseVersion: number | null
  added: HallPlacedItem[]
  updated: HallPlacedItem[]
  removedIds: number[]
}

export interface HallItemsPatchResponse {
  newVersion: number
  upserted: HallPlacedItem[]
  removedIds: number[]
}

// Analytics types
export interface RevenueDto {
  total: number
  period: string
  byDay?: Record<string, number>
  byWeek?: Record<string, number>
  byMonth?: Record<string, number>
  byYear?: Record<string, number>
}

export interface TopDishDto {
  dishId: number
  dishName: string
  totalSold: number
  revenue: number
}

export interface IngredientUsageDto {
  ingredientId: number
  ingredientName: string
  totalUsed: number
  unit: Unit
}

export interface ProblemIngredientDto {
  ingredientId: number
  ingredientName: string
  currentStock: number
  minQty: number
  unit: Unit
  reason?: string // LOW_STOCK, HIGH_SPOILAGE, HIGH_EXPIRED
}

// Activity Log types
export interface ActivityLog {
  id: number
  actionType: string
  entityType: string
  entityId: number
  userName: string
  description: string
  oldValues?: Record<string, any>
  newValues?: Record<string, any>
  createdAt: string
}

// Excel Upload types
export interface ExcelUploadError {
  item: string
  type: 'UNIT_MISMATCH' | 'UNIT_MISSING' | 'INGREDIENT_MISSING'
  existingUnit?: Unit
  providedUnit?: Unit
  rowNumber: number
}

export interface ExcelUploadResponse {
  processedCount: number
  createdCount: number
  updatedCount: number
  errors: ExcelUploadError[]
  hasErrors: boolean
}

export interface ResolveUnitMismatchRequest {
  item: string
  chosenUnit: Unit
  updateExisting: boolean
}

export interface ResolveIngredientMissingRequest {
  createNew: boolean
  minQty?: number
}
export type RuleType = 'STANDARD' | 'WEEKEND' | 'HOLIDAY' | 'SPECIAL'
export type RoundingType = 'STANDARD' | 'UP' | 'DOWN' | 'BANKERS' | 'TO_ONE'

export interface TariffPlan {
  id: number
  name: string
  description?: string
  isActive: boolean
  validFrom?: string
  validTo?: string
  bookingTimeFrom?: string  // HH:mm — начало допустимого времени бронирования
  bookingTimeTo?: string    // HH:mm — конец допустимого времени бронирования
  restaurantId?: number
  calendarId?: number
  calendar?: Calendar
  createdAt: string
  updatedAt: string
}

export interface TariffRule {
  id: number
  tariffPlanId: number
  ruleType: RuleType
  ruleOrder: number
  conditions?: string // JSON
  pricingFormula?: string // JSON
  roundingType?: RoundingType
  roundingPrecision?: number
  minAmount?: number
  maxAmount?: number
  minDurationMinutes?: number
  maxDurationMinutes?: number
  freeMinutes?: number
  freeUnits?: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// Calendar model
export type WeekendRule = 'MON_FRI' | 'SAT_SUN' | 'CUSTOM'

export interface Calendar {
  id: number
  organizationId?: number
  branchId?: number
  name: string
  weekendRule: WeekendRule
  weekendDays?: number[] | string // Массив номеров дней недели (1=Пн, 7=Вс) для CUSTOM режима, может быть JSON строкой
  specialDates: string[] // YYYY-MM-DD dates
  createdAt: string
  updatedAt: string
}

export interface CalendarUpdateResponse {
  calendar: Calendar
  affectedTariffPlans: TariffPlan[]
  addedDates: string[]
  removedDates: string[]
}

// Tariff Special Date Modifier
export type ModifierType = 'PERCENT_INCREASE' | 'PERCENT_DECREASE' | 'FIXED_INCREASE' | 'FIXED_DECREASE'

export interface TariffSpecialDateModifier {
  id: number
  tariffPlanId: number
  date: string // YYYY-MM-DD
  modifierType: ModifierType
  modifierValue: number
  bookingTimeFrom?: string | null  // HH:mm — переопределение времени работы (null = стандартное)
  bookingTimeTo?: string | null    // HH:mm — переопределение времени работы (null = стандартное)
  createdAt: string
  updatedAt: string
}

export interface PricingRequest {
  restaurantId?: number
  orderId?: number
  serviceId?: number
  employeeId?: number
  clientId?: number
  discountPercent?: number
  discountReason?: string
  channel?: string
  serviceStart: string
  serviceEnd: string
  additionalParams?: Record<string, any>
}

export interface PricingBreakdownItem {
  lineType: string
  description: string
  amount: number
  quantity?: number
  ruleId?: number
  ruleReason?: string
}

export interface PricingResult {
  status: 'OK' | 'STOP' | 'ERROR'
  stopReason?: string
  totalAmount: number
  baseAmount?: number
  discountAmount?: number
  discountPercent?: number
  discountReason?: string
  appliedRuleIds: number[]
  breakdowns: PricingBreakdownItem[]
}

// Shift types
export type ShiftType = 'REGULAR' | 'OVERTIME' | 'HOLIDAY' | 'NIGHT'
export type ShiftStatus = 'DRAFT' | 'PUBLISHED' | 'LOCKED'
export type SwapStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED'

export interface Shift {
  id: number
  employeeId: number | null
  employeeName: string | null
  restaurantId: number | null
  startTime: string
  endTime: string
  shiftType?: ShiftType
  comment?: string
  status: ShiftStatus
  templateId?: number
  swapRequestId?: number
  createdAt: string
  updatedAt: string
  publishedAt?: string
  lockedAt?: string
}

export interface CreateShiftRequest {
  employeeId: number
  startTime: string
  endTime: string
  shiftType?: ShiftType
  comment?: string
}

export interface UpdateShiftRequest {
  employeeId?: number
  startTime?: string
  endTime?: string
  shiftType?: ShiftType
  comment?: string
}

export interface ShiftTemplateDaySchedule {
  day: number
  startTime: string
  endTime: string
}

export interface ShiftTemplate {
  id: number
  name: string
  restaurantId?: number
  startTime: string
  endTime: string
  dayOfWeek?: string
  /** ISO 1=Пн … 7=Вс; если задан — шаблон только на эти дни */
  daysOfWeek?: number[] | null
  /** Разное время по дням (ISO 1–7) */
  daySchedules?: ShiftTemplateDaySchedule[] | null
  shiftType?: ShiftType
  recurrenceRule?: string
  validFrom?: string
  validTo?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateShiftTemplateRequest {
  name: string
  startTime: string
  endTime: string
  dayOfWeek?: number
  /** Несколько дней (1–7); если задано — приоритетнее одного dayOfWeek */
  daysOfWeek?: number[]
  daySchedules?: ShiftTemplateDaySchedule[]
  shiftType?: ShiftType
  recurrenceRule?: string
}

export interface ShiftSwapRequest {
  id: number
  fromShiftId: number
  toShiftId?: number
  requestedById: number
  requestedByName?: string
  requestedToId?: number
  requestedToName?: string
  status: SwapStatus
  comment?: string
  createdAt: string
  updatedAt: string
  respondedAt?: string
}

// Activity types
export type ActivityStatus = 'ACTIVE' | 'INACTIVE'
export type BookingMode = 'CAPACITY' | 'EXCLUSIVE'

export interface Activity {
  id: number
  organizationId?: number
  branchId?: number
  name: string
  description?: string
  status: ActivityStatus
  bookingMode: BookingMode
  concurrentLimit: number
  /** Полная бронь площадки: в интервал нельзя ставить другие мероприятия; только одна такая бронь. */
  fullVenueLock?: boolean
  requiresResource: boolean
  gapFiller?: boolean
  stopCheckHours?: number | null
  tariffPlanId?: number
  tariffPlan?: TariffPlan
  createdAt: string
  updatedAt: string
}

export interface Resource {
  id: number
  branchId?: number
  activityId: number
  name: string
  description?: string
  status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE'
  createdAt: string
  updatedAt: string
}

export type BookingStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'PAID'

export interface Booking {
  id: number
  organizationId?: number
  branchId: number
  activityId: number
  resourceId?: number
  customerId?: number
  customerName?: string
  customerPhone?: string
  startAt: string
  endAt: string
  status: BookingStatus
  pricingRunId?: number
  totalAmount?: number
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
  cancelledAt?: string
  completedAt?: string
  paidAt?: string
  /** Заказ бронирований (группа). При удалении заказа бронирования остаются. */
  bookingOrderId?: number | null
}

export interface FullVenueBlockInfo {
  bookingId: number
  activityId: number | null
  activityName: string
  startAt: string
  endAt: string
  message: string
}

export interface AvailabilityResponse {
  occupancy: Record<string, number>
  freeSlots: Array<{
    start: string
    end: string
  }>
  totalBookings: number
  /** Полные брони филиала, блокирующие выбранное мероприятие в интервале */
  fullVenueBlocks?: FullVenueBlockInfo[]
}

// Table Reservation types
export type ReservationStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW'

export interface TableReservation {
  id: number
  restaurantId: number
  hallTables: HallTable[]    // Full table objects
  tableIds: number[]         // Convenience: sorted list of IDs
  tableLabels: string        // Convenience: comma-separated labels
  totalCapacity: number      // Convenience: sum of all table capacities
  customerName?: string
  customerPhone?: string
  guestsCount: number
  startAt: string
  endAt: string
  status: ReservationStatus
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
  cancelledAt?: string
  completedAt?: string
}

// Booking Notification types
export type NotificationType = 'REMINDER' | 'OVERDUE' | 'GAP' // GAP deprecated, kept for backwards compat
export type BNotificationStatus = 'PENDING' | 'RESOLVED'
export type NotificationResponseType = 'CONFIRMED' | 'CANCELLED' | 'CONTINUES' | 'PAID_OR_CANCELLED'

export interface BookingNotification {
  id: number
  restaurantId: number
  bookingId: number
  notificationType: NotificationType
  title: string
  message: string
  status: BNotificationStatus
  response?: NotificationResponseType
  createdAt: string
  resolvedAt?: string
  resolvedBy?: string
  customerName?: string
  customerPhone?: string
  activityName?: string
  bookingStartAt?: string
  bookingEndAt?: string
  bookingStatus?: string
}
