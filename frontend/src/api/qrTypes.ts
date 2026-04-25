// ── Modifier template types (8 group types) ──

export type OptionGroupType =
  | 'SINGLE_REQUIRED' | 'SINGLE_OPTIONAL'
  | 'MULTI' | 'MULTI_REQUIRED'
  | 'MULTI_QTY_TOTAL_LIMIT'
  | 'RANGE_STEPPER'
  | 'EXCLUSIONS'
  | 'HALF_AND_HALF'

export type PresentationType = 'CHIPS' | 'RADIO' | 'CHECKBOX' | 'CARDS' | 'STEPPER'

export interface OptionGroupRules {
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

export interface OptionItemDto {
  optionItemId: number
  title: string
  priceDelta: number
  perOptionMaxQty?: number
  valueInt?: number
  isDefault?: boolean
  // Складские поля (для расчёта расхода при добавлении модификаторов).
  stockIngredientId?: number
  stockQtyPerUnit?: number
  extraIngredients?: Array<{ ingredientId: number; qtyPerUnit: number }>
}

export interface OptionGroupDto {
  groupInstanceId: number
  templateId: number
  title: string
  type: OptionGroupType
  presentation: PresentationType
  rules: OptionGroupRules
  items: OptionItemDto[]
  // Складские поля для группового масштабирования (scaleIngredients или legacy stockIngredientId/stockScaleBase).
  stockIngredientId?: number
  stockScaleBase?: number
  scaleIngredients?: Array<{ ingredientId: number; anchorValue: number; targetQty: number }>
}

export interface QrMenuItem {
  id: number
  name: string
  price: number
  imageUrl?: string
  optionGroups?: OptionGroupDto[]
}

export interface QrMenuCategory {
  id: number | null
  name: string
  imageUrl?: string
  dishes: QrMenuItem[]
}

// ── Selection payload sent to backend ──

export interface OptionSelection {
  groupInstanceId: number
  optionItemId?: number
  optionQty?: number
  valueInt?: number
}

// ── Order item modifier (from snapshot) ──

export interface OrderItemModifier {
  groupTitle: string
  optionTitle: string
  priceDelta: number
  qty: number
  valueInt?: number
}

// ── Session ──

export interface CreateSessionRequest {
  token: string
  tableId: number
}

export interface CreateSessionResponse {
  sessionToken: string
  expiresAt: string
}

// ── Order ──

export interface QrOrderItem {
  id: number
  dishId: number
  dishName: string
  qty: number
  priceAtTime: number
  lineTotal: number
  comment?: string
  modifiers?: OrderItemModifier[]
}

export interface QrOrder {
  id: number
  status: string
  totalAmount: number
  createdAt: string
  createdBy: string
  name?: string
  orderSource?: string
  items: QrOrderItem[]
}

export interface AddItemRequest {
  dishId: number
  qty: number
  comment?: string
  selections?: OptionSelection[]
}

// ── Split Bill ──

export interface SplitShareItemQty {
  itemId: number
  qty: number
}

export interface SplitShareRequest {
  name: string
  itemQtys: SplitShareItemQty[]
  /** Привязка к гостю программы лояльности для этой доли счёта */
  guestId?: number
}

export interface CreateSplitRequest {
  shares: SplitShareRequest[]
}

export interface SplitItemDto {
  itemId: number
  dishId: number
  dishName: string
  qty: number
  lineTotal: number
}

export interface SplitShareDto {
  shareId: number
  name: string
  shareTotal: number
  items: SplitItemDto[]
  guestId?: number | null
  guestLabel?: string | null
}

export interface OrderSplitDto {
  orderId: number
  orderTotal: number
  shares: SplitShareDto[]
}
