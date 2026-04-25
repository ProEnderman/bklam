import type { Dispatch, SetStateAction } from 'react'
import SplitBill from '../../components/SplitBill'
import '../../components/SplitBill.css'
import type { Order } from '../../api/types'
import type { Dish } from '../../api/types'
import type { LoyaltyGuest } from '../../api/loyaltyTypes'
import type { SplitDraftShare } from './newOrderSplitDraft'

type PendingLine = {
  dish: Dish
  qty: number
  comment?: string
  unitPrice?: number
}

type SplitDraft = { shares: SplitDraftShare[] }

type Props = {
  variant: 'stacked' | 'splitColumn'
  currentOrder: Order | null
  pendingItems: PendingLine[]
  splitDraft: SplitDraft | null
  setSplitDraft: Dispatch<SetStateAction<SplitDraft | null>>
  showSplitDraftForm: boolean
  setShowSplitDraftForm: Dispatch<SetStateAction<boolean>>
  shareGuestPickIndex: number | null
  setShareGuestPickIndex: Dispatch<SetStateAction<number | null>>
  shareGuestSearchQuery: string
  setShareGuestSearchQuery: Dispatch<SetStateAction<string>>
  shareGuestSearchResults: LoyaltyGuest[]
  shareGuestSearching: boolean
  setShareGuestSearchResults: Dispatch<SetStateAction<LoyaltyGuest[]>>
  onInitSplitDraft: () => void
}

export default function NewOrderGuestSplitColumn({
  variant,
  currentOrder,
  pendingItems,
  splitDraft,
  setSplitDraft,
  showSplitDraftForm,
  setShowSplitDraftForm,
  shareGuestPickIndex,
  setShareGuestPickIndex,
  shareGuestSearchQuery,
  setShareGuestSearchQuery,
  shareGuestSearchResults,
  shareGuestSearching,
  setShareGuestSearchResults,
  onInitSplitDraft,
}: Props) {
  const isSplitColumn = variant === 'splitColumn'
  const Tag = isSplitColumn ? 'section' : 'div'
  const wrapperClass = isSplitColumn ? 'split-mode-right new-order-guest-split-column' : 'order-panel-split-fixed'
  const sectionProps = isSplitColumn
    ? ({ 'aria-labelledby': 'new-order-guest-split-column-title' } as const)
    : {}

  const draftAndSplit = (
    <>
      {!currentOrder && pendingItems.length > 0 && (
        <div className="order-split-section split-draft-section">
          <p className="order-split-hint">Разделение счёта по гостям (до создания заказа)</p>
          {!showSplitDraftForm && !splitDraft && (
            <button type="button" className="btn-secondary btn-small" onClick={onInitSplitDraft}>
              Настроить разделение по гостям
            </button>
          )}
          {showSplitDraftForm && splitDraft && (
            <div className="split-draft-form">
              <div className="split-qty-table-wrap">
                <table className="split-qty-table">
                  <thead>
                    <tr>
                      <th>Блюдо</th>
                      <th>В заказе</th>
                      {splitDraft.shares.map((sh, si) => (
                        <th key={si}>
                          <div className="split-th-input">
                            <input
                              value={sh.name}
                              onChange={(e) =>
                                setSplitDraft((prev) =>
                                  prev ? { ...prev, shares: prev.shares.map((s, i) => (i === si ? { ...s, name: e.target.value } : s)) } : null
                                )
                              }
                              placeholder="Имя гостя"
                            />
                            {splitDraft.shares.length > 1 && (
                              <button
                                type="button"
                                className="split-remove-guest"
                                onClick={() =>
                                  setSplitDraft((prev) => (prev ? { ...prev, shares: prev.shares.filter((_, i) => i !== si) } : null))
                                }
                                aria-label="Удалить гостя"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingItems.map((item, idx) => {
                      const totalQty = item.qty
                      const assigned = splitDraft.shares.reduce((sum, s) => sum + (s.pendingQtys[idx] ?? 0), 0)
                      const valid = assigned === totalQty
                      return (
                        <tr key={idx} className={valid ? '' : 'split-row-invalid'}>
                          <td className="split-item-name">{item.dish.name}</td>
                          <td className="split-total-qty">{totalQty}</td>
                          {splitDraft.shares.map((sh, si) => (
                            <td key={si}>
                              <input
                                type="number"
                                min={0}
                                max={totalQty}
                                className="split-qty-input"
                                value={sh.pendingQtys[idx] === 0 || sh.pendingQtys[idx] == null ? '' : sh.pendingQtys[idx]}
                                onChange={(e) => {
                                  const raw = e.target.value
                                  const v = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0)
                                  setSplitDraft((prev) => {
                                    if (!prev) return null
                                    return {
                                      ...prev,
                                      shares: prev.shares.map((s, i) =>
                                        i === si ? { ...s, pendingQtys: { ...s.pendingQtys, [idx]: Math.min(totalQty, v) } } : s
                                      ),
                                    }
                                  })
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {!pendingItems.every((item, idx) => splitDraft.shares.reduce((sum, s) => sum + (s.pendingQtys[idx] ?? 0), 0) === item.qty) && (
                <p className="split-unassigned-warn">
                  Укажите количество порций по каждому гостю так, чтобы сумма по строке равнялась «В заказе».
                </p>
              )}
              <div className="split-draft-actions">
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  onClick={() =>
                    setSplitDraft((prev) =>
                      prev ? { ...prev, shares: [...prev.shares, { name: `Гость ${prev.shares.length + 1}`, pendingQtys: {} }] } : null
                    )
                  }
                >
                  + Добавить гостя
                </button>
                <button
                  type="button"
                  className="btn-small"
                  onClick={() => {
                    setShareGuestPickIndex(null)
                    setShareGuestSearchQuery('')
                    setSplitDraft(null)
                    setShowSplitDraftForm(false)
                  }}
                >
                  Убрать разделение
                </button>
              </div>
              <div className="split-share-guests">
                <p className="order-split-hint" style={{ marginBottom: 0 }}>
                  Клиент для каждой доли (необязательно): привязка из базы или новый по телефону — при «Создать заказ».
                </p>
                {splitDraft.shares.map((sh, si) => (
                  <div key={si} className="split-share-guest-row">
                    <div className="split-share-guest-title">Доля: {sh.name.trim() || `Гость ${si + 1}`}</div>
                    {(() => {
                      const assignedItems = pendingItems
                        .map((item, idx) => ({
                          name: item.dish.name,
                          qty: sh.pendingQtys[idx] ?? 0,
                          unitPrice: item.unitPrice ?? item.dish.price,
                        }))
                        .filter((x) => x.qty > 0)
                      const shareTotal = assignedItems.reduce((sum, x) => sum + x.qty * x.unitPrice, 0)
                      return (
                        <div className="split-share-assigned">
                          {assignedItems.length === 0 ? (
                            <p className="split-share-assigned-empty">Позиции не назначены</p>
                          ) : (
                            <>
                              {assignedItems.map((x, aidx) => (
                                <div key={`${x.name}_${aidx}`} className="split-share-assigned-item">
                                  <span>
                                    {x.name} x{x.qty}
                                  </span>
                                  <span>${(x.qty * x.unitPrice).toFixed(2)}</span>
                                </div>
                              ))}
                              <div className="split-share-assigned-total">
                                <span>Сумма по гостю</span>
                                <span>${shareTotal.toFixed(2)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })()}
                    {(sh.guestId != null || sh.guestLabel) && (
                      <div className="split-share-guest-label">
                        <span>{sh.guestLabel || `Клиент #${sh.guestId}`}</span>
                        <button
                          type="button"
                          className="btn-small btn-secondary"
                          onClick={() => {
                            setSplitDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    shares: prev.shares.map((s, i) =>
                                      i === si
                                        ? { ...s, guestId: undefined, guestLabel: undefined, newGuestName: '', newGuestPhone: '' }
                                        : s
                                    ),
                                  }
                                : null
                            )
                          }}
                        >
                          Сбросить клиента
                        </button>
                      </div>
                    )}
                    {sh.guestId == null && !sh.guestLabel && (
                      <>
                        <div className="split-share-guest-actions">
                          <button
                            type="button"
                            className={`btn-small ${shareGuestPickIndex === si ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => {
                              if (shareGuestPickIndex === si) {
                                setShareGuestPickIndex(null)
                                setShareGuestSearchQuery('')
                                setShareGuestSearchResults([])
                              } else {
                                setShareGuestPickIndex(si)
                                setShareGuestSearchQuery('')
                                setShareGuestSearchResults([])
                              }
                            }}
                          >
                            {shareGuestPickIndex === si ? 'Закрыть поиск' : 'Выбрать из базы'}
                          </button>
                        </div>
                        {shareGuestPickIndex === si && (
                          <div className="client-select">
                            <input
                              type="text"
                              value={shareGuestSearchQuery}
                              onChange={(e) => setShareGuestSearchQuery(e.target.value)}
                              placeholder="Поиск по имени или телефону..."
                              className="order-name-field"
                            />
                            {shareGuestSearching && <span className="searching">Поиск...</span>}
                            <ul className="guest-search-results">
                              {shareGuestSearchResults.map((g) => (
                                <li key={g.id}>
                                  <span>{[g.name, g.phoneNormalized].filter(Boolean).join(' — ') || g.phoneNormalized}</span>
                                  <button
                                    type="button"
                                    className="btn-small btn-primary"
                                    onClick={() => {
                                      setSplitDraft((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              shares: prev.shares.map((s, i) =>
                                                i === si
                                                  ? {
                                                      ...s,
                                                      guestId: g.id,
                                                      guestLabel:
                                                        [g.name, g.phoneNormalized].filter(Boolean).join(' — ') || g.phoneNormalized,
                                                      newGuestName: '',
                                                      newGuestPhone: '',
                                                    }
                                                  : s
                                              ),
                                            }
                                          : null
                                      )
                                      setShareGuestPickIndex(null)
                                      setShareGuestSearchQuery('')
                                      setShareGuestSearchResults([])
                                    }}
                                  >
                                    Привязать
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="split-share-guest-new">
                          <label>Новый клиент (телефон / имя — ниже; запись при «Создать заказ»)</label>
                          <input
                            type="tel"
                            value={sh.newGuestPhone ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setSplitDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      shares: prev.shares.map((s, i) =>
                                        i === si
                                          ? {
                                              ...s,
                                              newGuestPhone: v,
                                              ...(v.trim() ? { guestId: undefined, guestLabel: undefined } : {}),
                                            }
                                          : s
                                      ),
                                    }
                                  : null
                              )
                            }}
                            placeholder="Телефон"
                            className="order-name-field"
                          />
                          <input
                            type="text"
                            value={sh.newGuestName ?? ''}
                            onChange={(e) =>
                              setSplitDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      shares: prev.shares.map((s, i) => (i === si ? { ...s, newGuestName: e.target.value } : s)),
                                    }
                                  : null
                              )
                            }
                            placeholder="Имя (необязательно)"
                            className="order-name-field"
                          />
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {currentOrder && currentOrder.status === 'OPEN' && currentOrder.items && currentOrder.items.length > 0 && (
        <div className="order-split-section">
          <p className="order-split-hint">Разделение счёта по гостям (список блюд прокручивается отдельно ниже).</p>
          <SplitBill orderId={currentOrder.id} orderStatus={currentOrder.status} items={currentOrder.items} />
        </div>
      )}
    </>
  )

  return (
    <Tag className={wrapperClass} {...sectionProps}>
      {isSplitColumn && (
        <h3 id="new-order-guest-split-column-title" className="order-column-heading">
          Распределение по гостям
        </h3>
      )}
      {draftAndSplit}
    </Tag>
  )
}
