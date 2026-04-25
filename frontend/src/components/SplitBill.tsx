import { useState, useEffect, useCallback } from 'react'
import type { OrderItem } from '../api/types'
import type { OrderSplitDto, SplitShareRequest } from '../api/qrTypes'
import type { LoyaltyGuest } from '../api/loyaltyTypes'
import { loyaltyGuestApi } from '../api/loyaltyService'
import { splitService } from '../api/splitService'
import './SplitBill.css'

interface Props {
  orderId: number
  orderStatus: string
  items: OrderItem[]
}

interface ShareDraft {
  name: string
  itemQtys: Record<number, number>
  guestId?: number
  guestLabel?: string
  newGuestName?: string
  newGuestPhone?: string
}

export default function SplitBill({ orderId, orderStatus, items }: Props) {
  const [split, setSplit] = useState<OrderSplitDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [shares, setShares] = useState<ShareDraft[]>([{ name: 'Гость 1', itemQtys: {} }])
  const [saving, setSaving] = useState(false)
  const [shareGuestPickIndex, setShareGuestPickIndex] = useState<number | null>(null)
  const [shareGuestSearchQuery, setShareGuestSearchQuery] = useState('')
  const [shareGuestSearchResults, setShareGuestSearchResults] = useState<LoyaltyGuest[]>([])
  const [shareGuestSearching, setShareGuestSearching] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await splitService.getSplit(orderId)
      setSplit(data)
    } catch {
      setError('Не удалось загрузить разделение счёта')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => { load() }, [load])

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

  /** Редактировать split можно для OPEN и для CLOSED (до подтверждения оплаты) */
  const canEditSplit = orderStatus === 'OPEN' || orderStatus === 'CLOSED'
  if (loading) return <div className="split-bill"><p>Загрузка разделения счёта...</p></div>

  const getQty = (shareIdx: number, itemId: number) => shares[shareIdx]?.itemQtys[itemId] ?? 0
  const setQty = (shareIdx: number, itemId: number, qty: number) => {
    setShares(prev => {
      const next = prev.map((s) => ({
        ...s,
        itemQtys: { ...s.itemQtys }
      }))
      if (qty <= 0) delete next[shareIdx].itemQtys[itemId]
      else next[shareIdx].itemQtys[itemId] = qty
      return next
    })
  }

  const totalAssignedForItem = (itemId: number) => shares.reduce((sum, s) => sum + (s.itemQtys[itemId] ?? 0), 0)
  const itemTotalQty = (item: OrderItem) => item.qty ?? 1
  const isItemFullyAssigned = (item: OrderItem) => totalAssignedForItem(item.id) === itemTotalQty(item)
  const allItemsFullyAssigned = items.length > 0 && items.every(isItemFullyAssigned)
  const everyShareHasNameAndQty = shares.every(s => s.name.trim() && Object.values(s.itemQtys).some(q => q > 0))
  const canSave = allItemsFullyAssigned && everyShareHasNameAndQty

  const addShare = () => setShares(prev => [...prev, { name: `Гость ${prev.length + 1}`, itemQtys: {} }])
  const removeShare = (idx: number) => {
    if (shares.length <= 1) return
    setShares(prev => prev.filter((_, i) => i !== idx))
  }
  const renameShare = (idx: number, name: string) => {
    setShares(prev => prev.map((s, i) => i === idx ? { ...s, name } : s))
  }

  const handleCreate = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      if (split) await splitService.deleteSplit(orderId)
      const body: SplitShareRequest[] = []
      for (const s of shares) {
        let guestId = s.guestId
        if (!guestId && s.newGuestPhone?.trim()) {
          const guest = await loyaltyGuestApi.createOrReuseByPhone({
            phone: s.newGuestPhone.trim(),
            name: s.newGuestName?.trim() || undefined,
          })
          guestId = guest.id
        }
        const req: SplitShareRequest = {
          name: s.name.trim(),
          itemQtys: items
            .filter(i => (s.itemQtys[i.id] ?? 0) > 0)
            .map(i => ({ itemId: i.id, qty: s.itemQtys[i.id]! })),
        }
        if (guestId != null) req.guestId = guestId
        body.push(req)
      }
      const result = await splitService.createSplit(orderId, { shares: body })
      setSplit(result)
      setShowForm(false)
    } catch (err: any) {
      if (err.response?.status === 409) setError('Разделение для этого заказа уже создано')
      else if (err.response?.status === 400) setError(err.response?.data?.error || 'Некорректная конфигурация разделения')
      else setError('Не удалось сохранить разделение')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Удалить разделение счёта?')) return
    try {
      await splitService.deleteSplit(orderId)
      setSplit(null)
    } catch {
      setError('Не удалось удалить разделение')
    }
  }

  return (
    <div className="split-bill">
      <h3>Разделение счёта (Split Bill)</h3>
      {error && <div className="split-bill-error">{error}</div>}

      {split && !showForm && (
        <>
          <div className="split-display">
            {split.shares.map(sh => (
              <div key={sh.shareId} className="split-share-card">
                <h4>{sh.name}</h4>
                {(sh.guestLabel || sh.guestId) && (
                  <p className="split-share-guest-line">Клиент: {sh.guestLabel || `#${sh.guestId}`}</p>
                )}
                {sh.items.map(item => (
                  <div key={item.itemId} className="share-item">
                    <span>{item.dishName} x{item.qty}</span>
                    <span>{item.lineTotal.toFixed(2)} ₽</span>
                  </div>
                ))}
                <div className="split-share-total">
                  <span>Итого</span>
                  <span>{sh.shareTotal.toFixed(2)} ₽</span>
                </div>
              </div>
            ))}
          </div>
          {canEditSplit && (
            <div className="split-bill-actions" style={{ marginTop: 12 }}>
              <button
                className="btn-secondary btn-small"
                onClick={() => {
                  setShareGuestPickIndex(null)
                  setShareGuestSearchQuery('')
                  setShares(split.shares.map(sh => ({
                    name: sh.name,
                    itemQtys: Object.fromEntries(sh.items.map(it => [it.itemId, it.qty])),
                    guestId: sh.guestId ?? undefined,
                    guestLabel: sh.guestLabel ?? undefined,
                    newGuestName: '',
                    newGuestPhone: '',
                  })))
                  setShowForm(true)
                }}
              >
                Изменить разделение
              </button>
              <button className="btn-danger btn-small" onClick={handleDelete}>Удалить разделение</button>
            </div>
          )}
        </>
      )}

      {!split && !showForm && canEditSplit && (
        <div className="split-bill-actions">
          <button
            className="btn-primary btn-small"
            onClick={() => {
              setShareGuestPickIndex(null)
              setShareGuestSearchQuery('')
              setShowForm(true)
            }}
            disabled={items.length === 0}
          >
            Разделить счёт
          </button>
        </div>
      )}

      {!split && !showForm && !canEditSplit && (
        <p className="split-bill-hint">
          Разделение счёта недоступно для отменённых заказов.
        </p>
      )}

      {showForm && (
        <div className="split-form">
          <p className="split-qty-hint">Укажите, сколько порций каждого блюда относим к каждому гостю. Сумма по строке должна равняться количеству в заказе.</p>
          <div className="split-table-wrap">
            <table className="split-qty-table">
              <thead>
                <tr>
                  <th>Блюдо</th>
                  <th>В заказе</th>
                  {shares.map((sh, si) => (
                    <th key={si}>
                      <input
                        type="text"
                        value={sh.name}
                        onChange={e => renameShare(si, e.target.value)}
                        placeholder="Имя гостя"
                        className="split-th-input"
                        onClick={e => e.stopPropagation()}
                      />
                      {shares.length > 1 && <button type="button" className="split-th-remove" onClick={() => removeShare(si)}>×</button>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const total = itemTotalQty(item)
                  const assigned = totalAssignedForItem(item.id)
                  const ok = assigned === total
                  return (
                    <tr key={item.id} className={!ok ? 'split-row-invalid' : ''}>
                      <td>{item.dishName}</td>
                      <td className="split-td-total">{total}</td>
                      {shares.map((_, si) => (
                        <td key={si}>
                          <input
                            type="number"
                            min={0}
                            max={total}
                            value={getQty(si, item.id) === 0 ? '' : getQty(si, item.id)}
                            onChange={e => {
                              const raw = e.target.value
                              setQty(si, item.id, raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0))
                            }}
                            className="split-qty-input"
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!allItemsFullyAssigned && (
            <div className="split-unassigned-warn">
              Сумма по каждой строке должна равняться количеству в заказе
            </div>
          )}

          <button className="btn-secondary btn-small split-add-share" onClick={addShare}>+ Добавить гостя</button>

          <div className="split-share-guests-block">
            <p className="split-share-guests-title">Клиент для каждой доли (необязательно): сначала «Выбрать из базы», ниже — телефон для нового клиента</p>
            {shares.map((sh, si) => (
              <div key={si} className="split-share-guest-row">
                <div className="split-share-guest-row-title">Доля: {sh.name.trim() || `Гость ${si + 1}`}</div>
                {(sh.guestId != null || sh.guestLabel) && (
                  <div className="split-share-guest-label">
                    <span>{sh.guestLabel || `Клиент #${sh.guestId}`}</span>
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={() =>
                        setShares(prev =>
                          prev.map((s, i) =>
                            i === si
                              ? { ...s, guestId: undefined, guestLabel: undefined, newGuestName: '', newGuestPhone: '' }
                              : s
                          )
                        )
                      }
                    >
                      Сбросить
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
                      <div className="split-guest-search">
                        <input
                          type="text"
                          value={shareGuestSearchQuery}
                          onChange={e => setShareGuestSearchQuery(e.target.value)}
                          placeholder="Поиск по имени или телефону..."
                          className="split-guest-search-input"
                        />
                        {shareGuestSearching && <span className="split-guest-searching">Поиск...</span>}
                        <ul className="split-guest-results">
                          {shareGuestSearchResults.map(g => (
                            <li key={g.id}>
                              <span>{[g.name, g.phoneNormalized].filter(Boolean).join(' — ') || g.phoneNormalized}</span>
                              <button
                                type="button"
                                className="btn-primary btn-small"
                                onClick={() => {
                                  const label =
                                    [g.name, g.phoneNormalized].filter(Boolean).join(' — ') || g.phoneNormalized
                                  setShares(prev =>
                                    prev.map((s, i) =>
                                      i === si
                                        ? {
                                            ...s,
                                            guestId: g.id,
                                            guestLabel: label,
                                            newGuestName: '',
                                            newGuestPhone: '',
                                          }
                                        : s
                                    )
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
                      <label>Или новый клиент (поля ниже; создаётся при сохранении разделения)</label>
                      <input
                        type="tel"
                        value={sh.newGuestPhone ?? ''}
                        onChange={e => {
                          const v = e.target.value
                          setShares(prev =>
                            prev.map((s, i) =>
                              i === si
                                ? {
                                    ...s,
                                    newGuestPhone: v,
                                    ...(v.trim() ? { guestId: undefined, guestLabel: undefined } : {}),
                                  }
                                : s
                            )
                          )
                        }}
                        placeholder="Телефон"
                        className="split-guest-search-input"
                      />
                      <input
                        type="text"
                        value={sh.newGuestName ?? ''}
                        onChange={e =>
                          setShares(prev =>
                            prev.map((s, i) => (i === si ? { ...s, newGuestName: e.target.value } : s))
                          )
                        }
                        placeholder="Имя (необязательно)"
                        className="split-guest-search-input"
                      />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="split-form-actions">
            <button className="btn-primary btn-small" onClick={handleCreate} disabled={saving || !canSave}>
              {saving ? 'Сохранение...' : 'Сохранить разделение'}
            </button>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => {
                setShareGuestPickIndex(null)
                setShareGuestSearchQuery('')
                setShowForm(false)
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
