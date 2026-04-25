import type { Dish, Order, OrderItem } from '../../api/types'

type PendingLine = {
  dish: Dish
  qty: number
  comment?: string
  selections?: unknown[]
  modifiers?: Array<{ groupTitle: string; optionTitle: string; priceDelta: number; qty: number; valueInt?: number }>
  unitPrice?: number
}

export type NewOrderDisplayLine = {
  id: number
  dishId: number
  dishName: string
  qty: number
  price: number
  lineTotal: number
  comment?: string
  modifiers?: Array<{ groupTitle: string; optionTitle: string; priceDelta: number; qty: number; valueInt?: number }>
}

type EditingComment =
  | { type: 'pending'; index: number }
  | { type: 'order'; itemId: number }
  | null

type Props = {
  variant: 'scroll' | 'splitColumn'
  displayItems: NewOrderDisplayLine[]
  currentOrder: Order | null
  pendingItems: PendingLine[]
  availablePortions: Map<number, number>
  editingCommentFor: EditingComment
  editingCommentValue: string
  onEditingCommentValueChange: (v: string) => void
  onStartEditComment: (payload: { type: 'pending'; index: number } | { type: 'order'; itemId: number }) => void
  onCancelCommentEdit: () => void
  onSaveComment: (value: string) => void
  onUpdateQtyOrder: (item: OrderItem, newQty: number) => void
  onRemoveOrderItem: (itemId: number) => void
  onEditModifiers: (item: NewOrderDisplayLine, pendingIndex?: number) => void
  onPendingQtyDec: (itemIndex: number) => void
  onPendingQtyInc: (itemIndex: number) => void
  onPendingRemove: (itemIndex: number) => void
  /** Состав блюда (аллергены) */
  onShowRecipe?: (dishId: number, dishName: string) => void
}

export default function NewOrderItemsColumn({
  variant,
  displayItems,
  currentOrder,
  pendingItems,
  availablePortions,
  editingCommentFor,
  editingCommentValue,
  onEditingCommentValueChange,
  onStartEditComment,
  onCancelCommentEdit,
  onSaveComment,
  onUpdateQtyOrder,
  onRemoveOrderItem,
  onEditModifiers,
  onPendingQtyDec,
  onPendingQtyInc,
  onPendingRemove,
  onShowRecipe,
}: Props) {
  const isSplitColumn = variant === 'splitColumn'
  const Tag = isSplitColumn ? 'section' : 'div'
  const sectionProps = isSplitColumn
    ? ({
        'aria-labelledby': 'new-order-items-column-title',
      } as const)
    : {}

  return (
    <Tag
      className={isSplitColumn ? 'split-mode-left new-order-items-column' : 'order-panel-scroll'}
      {...sectionProps}
    >
      {isSplitColumn && (
        <h3 id="new-order-items-column-title" className="order-column-heading">
          Позиции в заказе
        </h3>
      )}
      <div className="order-items">
        {displayItems.length === 0 ? (
          <p className="empty-state">No items in order</p>
        ) : (
          displayItems
            .filter((item) => item && item.dishName)
            .map((item, itemIndex) => (
              <div key={item.id} className="order-item">
                <div className="item-info">
                  <div className="item-name-row">
                    <span className="item-name">{item.dishName || 'Unknown'}</span>
                    {onShowRecipe && (
                      <button
                        type="button"
                        className="btn-recipe-inline"
                        title="Состав блюда"
                        onClick={(e) => {
                          e.stopPropagation()
                          onShowRecipe(item.dishId, item.dishName || 'Блюдо')
                        }}
                      >
                        Состав
                      </button>
                    )}
                    <span className="item-price">${(item.price || 0).toFixed(2)}</span>
                    <button
                      type="button"
                      className="btn-comment-inline"
                      onClick={(e) => {
                        e.stopPropagation()
                        const isPending = !currentOrder
                        onStartEditComment(
                          isPending ? { type: 'pending', index: itemIndex } : { type: 'order', itemId: item.id }
                        )
                        onEditingCommentValueChange(item.comment || '')
                      }}
                      title="Добавить или изменить комментарий"
                    >
                      📝
                    </button>
                  </div>
                  {editingCommentFor &&
                    (editingCommentFor.type === 'pending'
                      ? editingCommentFor.index === itemIndex
                      : editingCommentFor.itemId === item.id) && (
                      <div className="item-comment-edit">
                        <input
                          type="text"
                          value={editingCommentValue}
                          onChange={(e) => onEditingCommentValueChange(e.target.value)}
                          placeholder="Комментарий к позиции..."
                          className="order-name-field"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onSaveComment(editingCommentValue)
                            if (e.key === 'Escape') {
                              onCancelCommentEdit()
                            }
                          }}
                        />
                        <button type="button" className="btn-small btn-primary" onClick={() => onSaveComment(editingCommentValue)}>
                          OK
                        </button>
                        <button type="button" className="btn-small" onClick={onCancelCommentEdit}>
                          Отмена
                        </button>
                      </div>
                    )}
                  {item.comment &&
                    !(
                      editingCommentFor &&
                      (editingCommentFor.type === 'pending'
                        ? editingCommentFor.index === itemIndex
                        : editingCommentFor.itemId === item.id)
                    ) && (
                      <div className="item-comment">
                        <span className="comment-label">Комментарий:</span>
                        <span className="comment-text">{item.comment}</span>
                      </div>
                    )}
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div style={{ marginTop: '4px', fontSize: '12px', color: '#5b67b8' }}>
                      {item.modifiers.map((m, idx) => (
                        <span
                          key={idx}
                          style={{
                            display: 'inline-block',
                            marginRight: 6,
                            marginBottom: 3,
                            background: '#eef0ff',
                            borderRadius: 4,
                            padding: '1px 5px',
                          }}
                        >
                          {m.groupTitle}: {m.optionTitle}
                          {m.priceDelta > 0 ? ` +${Number(m.priceDelta).toFixed(2)}` : ''}
                          {m.qty > 1 ? ` x${m.qty}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="item-controls">
                  {currentOrder ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onEditModifiers(item)}
                        className="btn-small"
                        title="Изменить модификаторы"
                      >
                        ⚙
                      </button>
                      <button type="button" onClick={() => onUpdateQtyOrder(item as OrderItem, (item.qty || 1) - 1)} className="qty-btn">
                        -
                      </button>
                      <span className="item-qty">{item.qty || 0}</span>
                      <button type="button" onClick={() => onUpdateQtyOrder(item as OrderItem, (item.qty || 0) + 1)} className="qty-btn">
                        +
                      </button>
                      <button type="button" onClick={() => onRemoveOrderItem(item.id)} className="btn-remove">
                        ×
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (item.qty > 1) onPendingQtyDec(itemIndex)
                        }}
                        className="qty-btn"
                      >
                        -
                      </button>
                      <span className="item-qty">{item.qty || 0}</span>
                      <button type="button" onClick={() => onEditModifiers(item, itemIndex)} className="btn-small" title="Изменить модификаторы">
                        ⚙
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const dish = pendingItems.find((pi) => pi.dish.id === item.dishId)?.dish
                          if (!dish) return
                          const portions = availablePortions.get(dish.id) ?? Infinity
                          const totalUsed = pendingItems.filter((pi) => pi.dish.id === dish.id).reduce((sum, pi) => sum + pi.qty, 0)
                          const portionsAfter = portions - totalUsed - 1
                          if (portionsAfter < 0 && portions !== Infinity) {
                            alert(`Недостаточно ингредиентов. Максимальное количество: ${portions} порций.`)
                            return
                          }
                          onPendingQtyInc(itemIndex)
                        }}
                        className="qty-btn"
                      >
                        +
                      </button>
                      <button type="button" onClick={() => onPendingRemove(itemIndex)} className="btn-remove">
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
    </Tag>
  )
}
