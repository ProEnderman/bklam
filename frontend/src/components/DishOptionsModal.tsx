import { useState, useCallback, useMemo } from 'react'
import type { QrMenuItem, OptionGroupDto, OptionItemDto, OptionSelection, OptionGroupType } from '../api/qrTypes'
import './DishOptionsModal.css'

interface Props {
  dish: QrMenuItem
  onAdd: (dishId: number, qty: number, selections: OptionSelection[]) => void
  onClose: () => void
  /** Показать состав блюда (аллергены) — кнопка в шапке модалки */
  onShowRecipe?: () => void
}

type GroupState = Record<number, { opts: Record<number, number>; valueInt?: number }>

function dedupeOptionItems(items: OptionItemDto[]): OptionItemDto[] {
  const seen = new Set<number>()
  return items.filter((i) => {
    if (seen.has(i.optionItemId)) return false
    seen.add(i.optionItemId)
    return true
  })
}

/** Одна группа на templateId; уникальные optionItemId (защита от дубликатов API/БД). */
function normalizeOptionGroups(raw: OptionGroupDto[]): OptionGroupDto[] {
  const byTemplate = new Map<number, OptionGroupDto>()
  for (const g of raw) {
    if (!byTemplate.has(g.templateId)) {
      byTemplate.set(g.templateId, { ...g, items: dedupeOptionItems(g.items) })
    }
  }
  return [...byTemplate.values()]
}

export default function DishOptionsModal({ dish, onAdd, onClose, onShowRecipe }: Props) {
  const groups = useMemo(
    () => normalizeOptionGroups(dish.optionGroups ?? []),
    [dish.optionGroups]
  )
  const [qty, setQty] = useState(1)
  const [state, setState] = useState<GroupState>(() => {
    const init: GroupState = {}
    for (const g of groups) {
      const base: GroupState[number] = { opts: {} }
      if (g.type === 'SINGLE_REQUIRED' || g.type === 'SINGLE_OPTIONAL') {
        const def = g.items.find(i => i.isDefault)
        if (def) base.opts[def.optionItemId] = 1
        // Для SINGLE_REQUIRED по умолчанию ставим isDefault, иначе пользователь должен выбрать вручную.
      } else if (g.type === 'MULTI') {
        const defaults = g.items.filter(i => i.isDefault)
        const max = g.rules.maxSelect ?? defaults.length
        defaults.slice(0, Math.max(0, max)).forEach(i => { base.opts[i.optionItemId] = 1 })
      }
      init[g.groupInstanceId] = base
    }
    return init
  })

  const setGroupOpts = useCallback((gid: number, fn: (prev: Record<number, number>) => Record<number, number>) => {
    setState(prev => ({ ...prev, [gid]: { ...prev[gid], opts: fn(prev[gid]?.opts ?? {}) } }))
  }, [])

  const setGroupValueInt = useCallback((gid: number, val: number) => {
    setState(prev => ({ ...prev, [gid]: { ...prev[gid], opts: prev[gid]?.opts ?? {}, valueInt: val } }))
  }, [])

  // ── price computation ──
  const modifiersTotal = useMemo(() => {
    let total = 0
    for (const g of groups) {
      const gs = state[g.groupInstanceId]
      if (!gs) continue
      if (g.type === 'RANGE_STEPPER') {
        const val = gs.valueInt ?? 0
        if (g.rules.pricingMode === 'LOOKUP') {
          const match = g.items.find(i => i.valueInt === val)
          if (match) total += match.priceDelta
        } else if (g.rules.pricePerUnit) {
          total += g.rules.pricePerUnit * val
        }
      } else if (g.type !== 'EXCLUSIONS') {
        for (const [oid, oq] of Object.entries(gs.opts) as unknown as [string, number][]) {
          const item = g.items.find(i => i.optionItemId === Number(oid))
          if (item) total += item.priceDelta * oq
        }
      }
    }
    return total
  }, [groups, state])

  const unitPrice = dish.price + modifiersTotal
  const totalPrice = unitPrice * qty

  // ── validation ──
  const errors = useMemo(() => {
    const errs: string[] = []
    for (const g of groups) {
      const gs = state[g.groupInstanceId]
      const cnt = gs ? Object.keys(gs.opts).length : 0
      const tq = gs ? Object.values(gs.opts).reduce((s, q) => s + q, 0) : 0
      const t = g.type as OptionGroupType
      if (t === 'SINGLE_REQUIRED' && cnt !== 1) errs.push(`Выберите «${g.title}»`)
      if (t === 'MULTI_REQUIRED' && (g.rules.minSelect ?? 1) > cnt) errs.push(`Мин. ${g.rules.minSelect ?? 1} в «${g.title}»`)
      if ((t === 'MULTI_QTY_TOTAL_LIMIT' || t === 'HALF_AND_HALF') && (g.rules.minTotalQty ?? 0) > tq)
        errs.push(`Нужно мин. ${g.rules.minTotalQty} шт. в «${g.title}»`)
      if (t === 'RANGE_STEPPER') {
        const val = gs?.valueInt
        if (val == null || val < (g.rules.rangeMin ?? 0) || val > (g.rules.rangeMax ?? 99))
          errs.push(`Выберите значение ${g.rules.rangeMin}–${g.rules.rangeMax} в «${g.title}»`)
      }
    }
    return errs
  }, [groups, state])

  const canAdd = errors.length === 0

  const handleAdd = () => {
    if (!canAdd) return
    const selections: OptionSelection[] = []
    for (const g of groups) {
      const gs = state[g.groupInstanceId]
      if (!gs) continue
      if (g.type === 'RANGE_STEPPER') {
        if (gs.valueInt != null) selections.push({ groupInstanceId: g.groupInstanceId, valueInt: gs.valueInt })
      } else {
        for (const [oid, oq] of Object.entries(gs.opts) as unknown as [string, number][]) {
          if (oq > 0) selections.push({ groupInstanceId: g.groupInstanceId, optionItemId: Number(oid), optionQty: oq })
        }
      }
    }
    onAdd(dish.id, qty, selections)
  }

  return (
    <div className="dom-overlay" onClick={onClose}>
      <div className="dom-modal" onClick={e => e.stopPropagation()}>
        <div className="dom-header">
          <h3>{dish.name}</h3>
          <div className="dom-header-right">
            {onShowRecipe ? (
              <button type="button" className="dom-recipe-btn" onClick={() => onShowRecipe()}>
                Состав
              </button>
            ) : null}
            <button type="button" className="dom-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        <div className="dom-body">
          {groups.map(g => (
            <GroupSection key={g.groupInstanceId} group={g} gs={state[g.groupInstanceId]}
              setOpts={fn => setGroupOpts(g.groupInstanceId, fn)}
              setValueInt={v => setGroupValueInt(g.groupInstanceId, v)} />
          ))}
        </div>

        <div className="dom-footer">
          <div className="dom-qty-row">
            <button className="dom-qty-btn" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
            <span className="dom-qty-val">{qty}</span>
            <button className="dom-qty-btn" onClick={() => setQty(q => q + 1)}>+</button>
          </div>
          <div className="dom-price">{totalPrice.toFixed(2)} ₽</div>
          {errors.length > 0 && <div className="dom-errors">{errors.join('; ')}</div>}
          <button className="dom-add-btn" disabled={!canAdd} onClick={handleAdd}>Добавить</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════
//  Per-group section renderer
// ═══════════════════════════════

function GroupSection({ group: g, gs, setOpts, setValueInt }: {
  group: OptionGroupDto
  gs: { opts: Record<number, number>; valueInt?: number } | undefined
  setOpts: (fn: (prev: Record<number, number>) => Record<number, number>) => void
  setValueInt: (v: number) => void
}) {
  const opts = gs?.opts ?? {}
  const type = g.type as OptionGroupType

  const toggleSingle = (id: number) => setOpts(() => ({ [id]: 1 }))
  const clearSingle = () => setOpts(() => ({}))

  const toggleMulti = (id: number) => {
    setOpts(prev => {
      const next = { ...prev }
      if (next[id]) delete next[id]; else next[id] = 1
      return next
    })
  }

  const setItemQty = (id: number, q: number) => {
    setOpts(prev => {
      const next = { ...prev }
      if (q <= 0) delete next[id]; else next[id] = q
      return next
    })
  }

  const totalQty = Object.values(opts).reduce((s, v) => s + v, 0)
  const withDelta = (title: string, delta?: number) => {
    const d = Number(delta ?? 0)
    if (!Number.isFinite(d) || d === 0) return title
    return `${title} (${d > 0 ? '+' : ''}${d}₽)`
  }

  const renderHint = () => {
    const r = g.rules
    switch (type) {
      case 'SINGLE_REQUIRED': return <span className="dom-hint">обязательно</span>
      case 'SINGLE_OPTIONAL': return <span className="dom-hint">не обязательно</span>
      case 'MULTI': return <span className="dom-hint">до {r.maxSelect ?? '∞'}</span>
      case 'MULTI_REQUIRED': return <span className="dom-hint">{r.minSelect}–{r.maxSelect ?? '∞'}</span>
      case 'MULTI_QTY_TOTAL_LIMIT': return <span className="dom-hint">всего до {r.maxTotalQty} шт.{r.minTotalQty ? `, мин. ${r.minTotalQty}` : ''}</span>
      case 'HALF_AND_HALF': return <span className="dom-hint">выберите ровно 2{r.allowSameOptionTwice ? ' (можно одинаковые)' : ''}</span>
      case 'RANGE_STEPPER': return <span className="dom-hint">{r.rangeMin}–{r.rangeMax}</span>
      case 'EXCLUSIONS': return <span className="dom-hint">убрать{r.maxSelect ? ` (до ${r.maxSelect})` : ''}</span>
      default: return null
    }
  }

  return (
    <div className="dom-group">
      <div className="dom-group-header">
        <span className="dom-group-title">{g.title}</span>
        {renderHint()}
      </div>

      {/* SINGLE_REQUIRED / SINGLE_OPTIONAL → chips / radio */}
      {(type === 'SINGLE_REQUIRED' || type === 'SINGLE_OPTIONAL') && (
        <div className="dom-chips">
          {type === 'SINGLE_OPTIONAL' && (
            <button className={`dom-chip ${Object.keys(opts).length === 0 ? 'active' : ''}`} onClick={clearSingle}>
              Без выбора
            </button>
          )}
          {g.items.map(item => (
            <button key={item.optionItemId}
              className={`dom-chip ${opts[item.optionItemId] ? 'active' : ''}`}
              onClick={() => toggleSingle(item.optionItemId)}>
              {withDelta(item.title, item.priceDelta)}
            </button>
          ))}
        </div>
      )}

      {/* MULTI / MULTI_REQUIRED / EXCLUSIONS → checkboxes */}
      {(type === 'MULTI' || type === 'MULTI_REQUIRED' || type === 'EXCLUSIONS') && (
        <div className="dom-check-list">
          {g.items.map(item => {
            const checked = !!opts[item.optionItemId]
            const maxReached = type !== 'EXCLUSIONS'
              ? (g.rules.maxSelect != null && Object.keys(opts).length >= g.rules.maxSelect && !checked)
              : (g.rules.maxSelect != null && Object.keys(opts).length >= g.rules.maxSelect && !checked)
            return (
              <label key={item.optionItemId} className={`dom-check-item ${maxReached ? 'disabled' : ''}`}>
                <input type="checkbox" checked={checked} disabled={maxReached}
                  onChange={() => toggleMulti(item.optionItemId)} />
                <span>{type === 'EXCLUSIONS' ? item.title : withDelta(item.title, item.priceDelta)}</span>
              </label>
            )
          })}
        </div>
      )}

      {/* MULTI_QTY_TOTAL_LIMIT / HALF_AND_HALF → cards with qty steppers */}
      {(type === 'MULTI_QTY_TOTAL_LIMIT' || type === 'HALF_AND_HALF') && (
        <div className="dom-cards">
          <div className="dom-cards-counter">
            {totalQty} / {g.rules.maxTotalQty ?? '∞'}
          </div>
          {g.items.map(item => {
            const curQty = opts[item.optionItemId] ?? 0
            const maxPerOpt = item.perOptionMaxQty ?? (g.rules.maxTotalQty ?? 99)
            const canInc = totalQty < (g.rules.maxTotalQty ?? 99) && curQty < maxPerOpt
            return (
              <div key={item.optionItemId} className="dom-card">
                <div className="dom-card-info">
                  <span className="dom-card-title">{withDelta(item.title, item.priceDelta)}</span>
                </div>
                <div className="dom-card-stepper">
                  <button disabled={curQty <= 0} onClick={() => setItemQty(item.optionItemId, curQty - 1)}>−</button>
                  <span>{curQty}</span>
                  <button disabled={!canInc} onClick={() => setItemQty(item.optionItemId, curQty + 1)}>+</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* RANGE_STEPPER → stepper (PER_UNIT) or option list (LOOKUP) */}
      {type === 'RANGE_STEPPER' && (() => {
        const isLookup = g.rules.pricingMode === 'LOOKUP'
        const val = gs?.valueInt ?? (g.rules.rangeMin ?? 1)
        if (isLookup && g.items.length > 0) {
          return (
            <div className="dom-options-list">
              {g.items.map(item => {
                const selected = val === item.valueInt
                return (
                  <label key={item.optionItemId} className={`dom-option-chip${selected ? ' dom-option-chip--active' : ''}`}
                    style={{ cursor: 'pointer' }}>
                    <input type="radio" name={`range-${g.groupInstanceId}`} checked={selected}
                      onChange={() => setValueInt(item.valueInt!)} style={{ display: 'none' }} />
                    <span>{withDelta(item.title, item.priceDelta)}</span>
                  </label>
                )
              })}
            </div>
          )
        }
        const min = g.rules.rangeMin ?? 0
        const max = g.rules.rangeMax ?? 99
        const ppu = g.rules.pricePerUnit ?? 0
        return (
          <div className="dom-stepper-row">
            <button disabled={val <= min} onClick={() => setValueInt(Math.max(min, val - 1))}>−</button>
            <span className="dom-stepper-val">{val}</span>
            <button disabled={val >= max} onClick={() => setValueInt(Math.min(max, val + 1))}>+</button>
            {ppu > 0 && <span className="dom-stepper-price">= {(ppu * val).toFixed(2)} ₽</span>}
          </div>
        )
      })()}
    </div>
  )
}
