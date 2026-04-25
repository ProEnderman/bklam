import { useCallback, useEffect, useMemo, useState } from 'react'
import { restaurantService } from '../../api/services'
import '../tariffs/BookingAnalytics.css'

type Tab = 'overview' | 'products' | 'employees' | 'time' | 'tariffs'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Обзор', icon: '🎯' },
  { key: 'products', label: 'Товары', icon: '📦' },
  { key: 'employees', label: 'Сотрудники', icon: '👤' },
  { key: 'time', label: 'Динамика', icon: '📅' },
  { key: 'tariffs', label: 'Тарифы (брони)', icon: '🎫' },
]

const RULE_TYPE_RU: Record<string, string> = {
  STANDARD: 'Стандарт',
  WEEKEND: 'Выходной',
  HOLIDAY: 'Праздник',
  SPECIAL: 'Спецтариф',
}

function asNestedMap(obj: unknown): Record<string, Record<string, number>> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const out: Record<string, Record<string, number>> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner: Record<string, number> = {}
      for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) {
        const n = typeof iv === 'number' ? iv : Number(iv)
        inner[ik] = Number.isFinite(n) ? n : 0
      }
      out[k] = inner
    }
  }
  return out
}

const DOW_RU: Record<string, string> = {
  MONDAY: 'Пн', TUESDAY: 'Вт', WEDNESDAY: 'Ср', THURSDAY: 'Чт',
  FRIDAY: 'Пт', SATURDAY: 'Сб', SUNDAY: 'Вс',
}

function fmt(n: number | undefined | null, decimals = 2): string {
  if (n == null) return '0'
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: decimals })
}
function fmtRub(n: number | undefined | null): string {
  if (n == null) return '₽0'
  return '₽' + n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** ISO week key (YYYY-Wnn) for a date string YYYY-MM-DD */
function getWeekKey(dayStr: string): string {
  const [y, m, d] = dayStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const start = new Date(date)
  start.setDate(start.getDate() + 4 - (start.getDay() || 7))
  const year = start.getFullYear()
  const startYear = new Date(year, 0, 1)
  const week = Math.ceil((((start.getTime() - startYear.getTime()) / 86400000) + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** Month key YYYY-MM-01 for a date string YYYY-MM-DD */
function getMonthKey(dayStr: string): string {
  const [y, m] = dayStr.split('-')
  return `${y}-${m}-01`
}

function aggregateOrdersByWeek(ordersByDay: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [dayStr, count] of Object.entries(ordersByDay)) {
    const key = getWeekKey(dayStr)
    out[key] = (out[key] || 0) + count
  }
  return out
}

function aggregateOrdersByMonth(ordersByDay: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [dayStr, count] of Object.entries(ordersByDay)) {
    const key = getMonthKey(dayStr)
    out[key] = (out[key] || 0) + count
  }
  return out
}

// ─── Reusable components (mirroring BookingAnalytics) ───

function KPI({ label, value, color, sub }: {
  label: string; value: string; color?: string; sub?: string
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value-row">
        <span className={`kpi-value ${color || ''}`}>{value}</span>
      </div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

function Section({ title, children, defaultOpen = true }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="collapsible-section">
      <button className="section-header" onClick={() => setOpen(!open)}>
        <span className="section-toggle">{open ? '▼' : '▶'}</span>
        <span className="section-title">{title}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}

function BarChart({ data, color = 'blue', valueFormatter = (n: number) => fmt(n, 0) }: {
  data: Record<string, number>; color?: string; valueFormatter?: (n: number) => string
}) {
  const entries = Object.entries(data)
  if (entries.length === 0) return <div className="analytics-empty">Нет данных</div>
  const max = Math.max(...entries.map(([, v]) => v), 1)
  return (
    <div className="bar-chart">
      {entries.map(([label, value]) => (
        <div className="bar-row" key={label}>
          <span className="bar-label" title={label}>{label}</span>
          <div className="bar-track">
            <div className={`bar-fill ${color}`} style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <span className="bar-value">{valueFormatter(value)}</span>
        </div>
      ))}
    </div>
  )
}

/** Вложенная карта: выбор ключа верхнего уровня → столбчатая диаграмма по внутренним ключам */
function SliceByOuter({
  title,
  hint,
  data,
  valueFormatter,
}: {
  title: string
  hint?: string
  data: Record<string, Record<string, number>>
  valueFormatter: (n: number) => string
}) {
  const keys = useMemo(() => Object.keys(data).sort(), [data])
  const keySig = keys.join('|')
  const [selected, setSelected] = useState('')
  useEffect(() => {
    if (!keys.length) return
    setSelected((prev) => (prev && keys.includes(prev) ? prev : keys[0]))
  }, [keySig])
  const inner = (selected && data[selected]) || {}
  if (keys.length === 0) {
    return (
      <div className="chart-card">
        <h3>{title}</h3>
        <div className="analytics-empty">Нет данных</div>
      </div>
    )
  }
  return (
    <div className="chart-card">
      <h3>{title}</h3>
      {hint && <p className="dynamics-hint">{hint}</p>}
      <label className="date-label" style={{ display: 'block', marginBottom: 8 }}>Разрез</label>
      <select
        className="date-input"
        style={{ width: '100%', maxWidth: 360, marginBottom: 12 }}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        {keys.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>
      <BarChart data={inner} color="green" valueFormatter={valueFormatter} />
    </div>
  )
}

function VisitPivotTable({
  data,
  formatCol,
}: {
  data: Record<string, Record<string, number>>
  formatCol?: (col: string) => string
}) {
  const days = Object.keys(data).sort()
  const colSet = new Set<string>()
  days.forEach((d) => Object.keys(data[d] || {}).forEach((c) => colSet.add(c)))
  const cols = [...colSet].sort()
  if (days.length === 0) {
    return <div className="analytics-empty">Нет данных</div>
  }
  return (
    <div className="analytics-table-wrapper" style={{ overflowX: 'auto' }}>
      <table className="analytics-table">
        <thead>
          <tr>
            <th>Дата</th>
            {cols.map((c) => (
              <th key={c} className="num" title={c}>{formatCol ? formatCol(c) : c}</th>
            ))}
            <th className="num">Итого</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const row = data[d] || {}
            let sum = 0
            return (
              <tr key={d}>
                <td>{d}</td>
                {cols.map((c) => {
                  const v = row[c] || 0
                  sum += v
                  return <td key={c} className="num">{fmt(v, 0)}</td>
                })}
                <td className="num">{fmt(sum, 0)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function Analytics() {
  const [tab, setTab] = useState<Tab>('overview')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [lastLoaded, setLastLoaded] = useState('')

  const [productData, setProductData] = useState<any>(null)
  const [employeeData, setEmployeeData] = useState<any>(null)
  const [bookingTariffData, setBookingTariffData] = useState<any>(null)

  const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const handleDateChange = (which: 'from' | 'to', raw: string) => {
    if (which === 'from') setDateFrom(raw)
    else setDateTo(raw)

    if (!raw) {
      setWarning(`Некорректная дата «${which === 'from' ? 'С' : 'По'}». Возможно, введена несуществующая дата (например, 31 сентября)`)
    } else {
      setWarning(null)
    }
  }

  const validateDates = (from: string, to: string): string | null => {
    if (!from || !to) return null
    const dFrom = new Date(from)
    const dTo = new Date(to)
    if (dFrom > dTo) return `Дата начала (${from}) позже даты конца (${to})`
    const diffDays = (dTo.getTime() - dFrom.getTime()) / 86400000
    if (diffDays > 366) return `Слишком большой период: ${Math.round(diffDays)} дней. Максимум — 1 год`
    return null
  }

  // Default dates: last 30 days
  useEffect(() => {
    const now = new Date()
    const from = new Date(now)
    from.setDate(from.getDate() - 30)
    setDateFrom(fmtDate(from))
    setDateTo(fmtDate(now))
  }, [])

  const loadData = useCallback(async () => {
    if (!dateFrom || !dateTo) return
    const validationError = validateDates(dateFrom, dateTo)
    if (validationError) {
      setWarning(validationError)
      return
    }
    setWarning(null)
    setLoading(true)
    setError(null)
    try {
      const [prodRes, empRes, bookRes] = await Promise.allSettled([
        restaurantService.getProductSalesAnalytics(dateFrom, dateTo),
        restaurantService.getEmployeeAnalytics(dateFrom, dateTo),
        restaurantService.getBookingTariffVisitAnalytics(dateFrom, dateTo),
      ])

      const failed: string[] = []
      if (prodRes.status === 'fulfilled') setProductData(prodRes.value)
      else {
        setProductData(null)
        failed.push('товары')
      }
      if (empRes.status === 'fulfilled') setEmployeeData(empRes.value)
      else {
        setEmployeeData(null)
        failed.push('сотрудники')
      }
      if (bookRes.status === 'fulfilled') setBookingTariffData(bookRes.value)
      else {
        setBookingTariffData(null)
        failed.push('тарифы/брони')
      }

      if (failed.length === 3) {
        throw new Error('Все блоки аналитики недоступны')
      }
      if (failed.length > 0) {
        setWarning(`Частично недоступна аналитика: ${failed.join(', ')}`)
      }
      setLastLoaded(new Date().toLocaleTimeString('ru-RU'))
    } catch (e: any) {
      console.error('Failed to load analytics:', e)
      const status = e?.response?.status
      if (status === 401) setError('Сессия истекла. Перезайдите в систему')
      else if (status === 403) setError('Нет доступа к аналитике')
      else if (status >= 500) setError('Ошибка сервера. Попробуйте позже')
      else if (e?.code === 'ERR_NETWORK') setError('Нет связи с сервером')
      else setError(e?.message || 'Ошибка загрузки аналитики')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => { loadData() }, [loadData])

  // ──── OVERVIEW ──────────────────────────────────
  const renderOverview = () => {
    const p = productData
    const e = employeeData
    if (!p) return null

    return (
      <>
        <div className="kpi-grid kpi-hero-grid">
          <KPI label="Общая выручка" value={fmtRub(p.totalRevenue)} color="green" />
          <KPI label="Заказов" value={fmt(p.totalOrders, 0)} color="blue" />
          <KPI label="Средний чек" value={fmtRub(p.avgCheck)} color="blue" />
          <KPI label="Товаров продано" value={fmt(p.totalItems, 0)} />
          <KPI label="Уникальных товаров" value={fmt(p.uniqueProducts, 0)} />
          {e && <KPI label="Смен за период" value={fmt(e.totalShifts, 0)} />}
          {e && <KPI label="Всего часов" value={fmt(e.totalHours, 1)} />}
          {e && e.totalAdministratorHours != null && (
            <KPI label="Часы администраторов" value={fmt(e.totalAdministratorHours, 1)} color="purple" />
          )}
          {e && e.administratorShiftCount != null && (
            <KPI label="Смен администраторов" value={fmt(e.administratorShiftCount, 0)} />
          )}
          {e && <KPI label="Ср. часов за смену" value={fmt(e.avgHoursPerShift, 1)} />}
        </div>
        <Section title="📊 Выручка по категориям и товарам">
          <div className="chart-grid">
            <div className="chart-card">
              <h3>Выручка по категориям</h3>
              <BarChart data={p.revenueByCategory || {}} color="green" valueFormatter={fmtRub} />
            </div>
            <div className="chart-card">
              <h3>Кол-во по категориям</h3>
              <BarChart data={p.qtyByCategory || {}} color="blue" valueFormatter={n => fmt(n, 0) + ' шт.'} />
            </div>
          </div>
        </Section>
        <Section title="👤 Выручка по сотрудникам" defaultOpen={false}>
          <div className="chart-grid">
            <div className="chart-card">
              <h3>Выручка по администраторам</h3>
              <BarChart data={p.revenueByAdmin || {}} color="purple" valueFormatter={fmtRub} />
            </div>
            <div className="chart-card">
              <h3>Заказов по администраторам</h3>
              <BarChart data={p.ordersByAdmin || {}} color="blue" valueFormatter={n => fmt(n, 0)} />
            </div>
          </div>
        </Section>
        <Section title="📅 Динамика за период" defaultOpen={false}>
          {(() => {
            const byDay = p.revenueByDay || {}
            const dayCount = Object.keys(byDay).length
            const ordersByDay = (p.ordersByDay || {}) as Record<string, number>
            if (dayCount <= 31) {
              return (
                <div className="chart-grid">
                  <div className="chart-card">
                    <h3>Выручка по дням</h3>
                    <BarChart data={byDay} color="green" valueFormatter={fmtRub} />
                  </div>
                  <div className="chart-card">
                    <h3>Заказов по дням</h3>
                    <BarChart data={ordersByDay} color="blue" valueFormatter={n => fmt(n, 0)} />
                  </div>
                </div>
              )
            }
            if (dayCount <= 90) {
              const revByWeek = (p.revenueByWeek || {}) as Record<string, number>
              const ordByWeek = aggregateOrdersByWeek(ordersByDay)
              return (
                <div className="chart-grid">
                  <div className="chart-card">
                    <h3>Выручка по неделям</h3>
                    <BarChart data={revByWeek} color="green" valueFormatter={fmtRub} />
                  </div>
                  <div className="chart-card">
                    <h3>Заказов по неделям</h3>
                    <BarChart data={ordByWeek} color="blue" valueFormatter={n => fmt(n, 0)} />
                  </div>
                </div>
              )
            }
            const revByMonth = (p.revenueByMonth || {}) as Record<string, number>
            const ordByMonth = aggregateOrdersByMonth(ordersByDay)
            return (
              <div className="chart-grid">
                <div className="chart-card">
                  <h3>Выручка по месяцам</h3>
                  <BarChart data={revByMonth} color="green" valueFormatter={fmtRub} />
                </div>
                <div className="chart-card">
                  <h3>Заказов по месяцам</h3>
                  <BarChart data={ordByMonth} color="blue" valueFormatter={n => fmt(n, 0)} />
                </div>
              </div>
            )
          })()}
        </Section>
      </>
    )
  }

  // ──── PRODUCTS ──────────────────────────────────
  const renderProducts = () => {
    const p = productData
    if (!p) return null

    // Top-15 products by revenue
    const topProducts = Object.entries(p.revenueByProduct || {} as Record<string, number>).slice(0, 15)
    const topProductsMap: Record<string, number> = {}
    topProducts.forEach(([k, v]) => { topProductsMap[k] = v as number })

    // Top-15 by qty
    const topByQty = Object.entries(p.qtyByProduct || {} as Record<string, number>).slice(0, 15)
    const topByQtyMap: Record<string, number> = {}
    topByQty.forEach(([k, v]) => { topByQtyMap[k] = v as number })

    return (
      <>
        <div className="kpi-grid">
          <KPI label="Общая выручка" value={fmtRub(p.totalRevenue)} color="green" />
          <KPI label="Товаров продано" value={fmt(p.totalItems, 0)} />
          <KPI label="Уникальных товаров" value={fmt(p.uniqueProducts, 0)} color="blue" />
          <KPI label="Средний чек" value={fmtRub(p.avgCheck)} />
        </div>
        <Section title="📦 По категориям">
          <div className="chart-grid">
            <div className="chart-card">
              <h3>Выручка по категориям</h3>
              <BarChart data={p.revenueByCategory || {}} color="green" valueFormatter={fmtRub} />
            </div>
            <div className="chart-card">
              <h3>Кол-во по категориям</h3>
              <BarChart data={p.qtyByCategory || {}} color="teal" valueFormatter={n => fmt(n, 0) + ' шт.'} />
            </div>
          </div>
        </Section>
        <Section title="🏆 Топ товаров по выручке">
          <div className="chart-grid">
            <div className="chart-card">
              <h3>Топ-15 по выручке</h3>
              <BarChart data={topProductsMap} color="green" valueFormatter={fmtRub} />
            </div>
            <div className="chart-card">
              <h3>Топ-15 по кол-ву</h3>
              <BarChart data={topByQtyMap} color="indigo" valueFormatter={n => fmt(n, 0) + ' шт.'} />
            </div>
          </div>
        </Section>
        <Section title="🔀 Срезы продаж (администратор / дата / категория / товар)">
          <p className="dynamics-hint">
            Выберите строку верхнего уровня (администратор или дату) — ниже показано распределение по второму измерению.
          </p>
          <div className="chart-grid">
            <SliceByOuter
              title="Администратор → день (выручка заказов)"
              data={asNestedMap(p.revenueByAdminAndDay)}
              valueFormatter={fmtRub}
            />
            <SliceByOuter
              title="Администратор → категория"
              data={asNestedMap(p.revenueByAdminAndCategory)}
              valueFormatter={fmtRub}
            />
            <SliceByOuter
              title="Администратор → товар"
              data={asNestedMap(p.revenueByAdminAndProduct)}
              valueFormatter={fmtRub}
            />
            <SliceByOuter
              title="Дата → категория"
              data={asNestedMap(p.revenueByDateAndCategory)}
              valueFormatter={fmtRub}
            />
            <SliceByOuter
              title="Дата → товар"
              hint="По каждому дню — все позиции; при большом меню список длинный."
              data={asNestedMap(p.revenueByDateAndProduct)}
              valueFormatter={fmtRub}
            />
          </div>
        </Section>
        <Section title="📋 Все товары" defaultOpen={false}>
          <div className="analytics-table-wrapper">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th className="num">Кол-во</th>
                  <th className="num">Выручка</th>
                  <th className="num">Ср. цена</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(p.revenueByProduct || {} as Record<string, number>).map(([name, rev]) => {
                  const qty = (p.qtyByProduct || {} as Record<string, number>)[name] || 0
                  const avgPrice = qty > 0 ? (rev as number) / (qty as number) : 0
                  return (
                    <tr key={name}>
                      <td>{name}</td>
                      <td className="num">{fmt(qty as number, 0)}</td>
                      <td className="num">{fmtRub(rev as number)}</td>
                      <td className="num">{fmtRub(avgPrice)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>
      </>
    )
  }

  // ──── EMPLOYEES ──────────────────────────────────
  const renderEmployees = () => {
    const e = employeeData
    const p = productData
    if (!e) return null

    return (
      <>
        <div className="kpi-grid">
          <KPI label="Сотрудников" value={fmt(e.totalEmployees, 0)} color="blue" />
          <KPI label="Всего смен" value={fmt(e.totalShifts, 0)} />
          <KPI label="Всего часов" value={fmt(e.totalHours, 1)} color="green" />
          {e.totalAdministratorHours != null && (
            <KPI label="Часы администраторов" value={fmt(e.totalAdministratorHours, 1)} color="purple" />
          )}
          <KPI label="Ср. часов за смену" value={fmt(e.avgHoursPerShift, 1)} />
        </div>
        {(e.hoursByAdministrator && Object.keys(e.hoursByAdministrator).length > 0) && (
          <Section title="👔 Часы работы администраторов">
            <div className="chart-grid">
              <div className="chart-card wide">
                <h3>Отработанные часы (роли ADMIN / HEAD_ADMIN)</h3>
                <BarChart data={e.hoursByAdministrator} color="purple" valueFormatter={n => fmt(n, 1) + ' ч.'} />
              </div>
            </div>
          </Section>
        )}
        <Section title="⏰ Часы работы">
          <div className="chart-grid">
            <div className="chart-card">
              <h3>Часы по сотрудникам</h3>
              <BarChart data={e.hoursByEmployee || {}} color="blue" valueFormatter={n => fmt(n, 1) + ' ч.'} />
            </div>
            <div className="chart-card">
              <h3>Кол-во смен по сотрудникам</h3>
              <BarChart data={e.shiftCountByEmployee || {}} color="teal" valueFormatter={n => fmt(n, 0)} />
            </div>
          </div>
        </Section>
        <Section title="💰 Продажи по администраторам">
          <div className="chart-grid">
            <div className="chart-card">
              <h3>Выручка по администраторам</h3>
              <BarChart data={e.revenueByEmployee || (p?.revenueByAdmin || {})} color="green" valueFormatter={fmtRub} />
            </div>
            <div className="chart-card">
              <h3>Заказов по администраторам</h3>
              <BarChart data={e.orderCountByEmployee || (p?.ordersByAdmin || {})} color="purple" valueFormatter={n => fmt(n, 0)} />
            </div>
          </div>
        </Section>
        {e.revenuePerHour && Object.keys(e.revenuePerHour).length > 0 && (
          <Section title="📊 Выручка на час работы" defaultOpen={false}>
            <div className="chart-grid">
              <div className="chart-card">
                <h3>₽ / час по сотрудникам</h3>
                <BarChart data={e.revenuePerHour} color="orange" valueFormatter={fmtRub} />
              </div>
            </div>
          </Section>
        )}
        <Section title="📅 Часы по дням" defaultOpen={false}>
          <div className="chart-grid">
            <div className="chart-card wide">
              <h3>Часы работы по дням</h3>
              <BarChart data={e.hoursByDay || {}} color="indigo" valueFormatter={n => fmt(n, 1) + ' ч.'} />
            </div>
          </div>
        </Section>
        {p && (
          <Section title="📦 Товаров продано по администраторам" defaultOpen={false}>
            <div className="chart-grid">
              <div className="chart-card">
                <h3>Товаров по администраторам</h3>
                <BarChart data={p.itemsByAdmin || {}} color="teal" valueFormatter={n => fmt(n, 0) + ' шт.'} />
              </div>
            </div>
          </Section>
        )}
      </>
    )
  }

  // ──── TIME (dynamic) ──────────────────────────────────
  const renderTime = () => {
    const p = productData
    if (!p) return null

    // Day of week labels
    const dowLabels: Record<string, number> = {}
    for (const [d, v] of Object.entries(p.revenueByDow || {} as Record<string, number>)) {
      dowLabels[DOW_RU[d] || d] = v as number
    }
    const ordersDowLabels: Record<string, number> = {}
    for (const [d, v] of Object.entries(p.ordersByDow || {} as Record<string, number>)) {
      ordersDowLabels[DOW_RU[d] || d] = v as number
    }

    // Hour labels
    const hourLabels: Record<string, number> = {}
    for (const [h, v] of Object.entries(p.revenueByHour || {} as Record<string, number>)) {
      hourLabels[`${h}:00`] = v as number
    }

    return (
      <>
        <div className="kpi-grid">
          <KPI label="Общая выручка" value={fmtRub(p.totalRevenue)} color="green" />
          <KPI label="Заказов" value={fmt(p.totalOrders, 0)} color="blue" />
          <KPI label="Дней в периоде" value={fmt(Object.keys(p.revenueByDay || {}).length, 0)} />
        </div>
        <Section title="📅 По дням">
          <div className="chart-grid">
            <div className="chart-card wide">
              {(() => {
                const byDay = (p.revenueByDay || {}) as Record<string, number>
                const entries = Object.entries(byDay)
                const maxBars = 31
                const limited = entries.length > maxBars
                  ? Object.fromEntries(entries.slice(-maxBars))
                  : byDay
                return (
                  <>
                    <h3>Выручка по дням{entries.length > maxBars ? ` (последние ${maxBars} дней)` : ''}</h3>
                    {entries.length > maxBars && (
                      <p className="dynamics-hint">Период большой — показаны последние 31 день. Итоги по неделям и месяцам ниже.</p>
                    )}
                    <BarChart data={limited} color="green" valueFormatter={fmtRub} />
                  </>
                )
              })()}
            </div>
          </div>
        </Section>
        <Section title="📆 По неделям">
          <div className="chart-grid">
            <div className="chart-card wide">
              <h3>Выручка по неделям</h3>
              <BarChart data={p.revenueByWeek || {}} color="indigo" valueFormatter={fmtRub} />
            </div>
          </div>
        </Section>
        <Section title="🗓 По месяцам">
          <div className="chart-grid">
            <div className="chart-card wide">
              <h3>Выручка по месяцам</h3>
              <BarChart data={p.revenueByMonth || {}} color="purple" valueFormatter={fmtRub} />
            </div>
          </div>
        </Section>
        <Section title="📆 По годам">
          <div className="chart-grid">
            <div className="chart-card">
              <h3>Выручка по годам</h3>
              <BarChart data={p.revenueByYear || {}} color="green" valueFormatter={fmtRub} />
            </div>
            <div className="chart-card">
              <h3>Заказов по годам</h3>
              <BarChart data={p.ordersByYear || {}} color="blue" valueFormatter={n => fmt(n, 0)} />
            </div>
          </div>
        </Section>
        <Section title="📊 По дню недели и часу" defaultOpen={false}>
          <div className="chart-grid">
            <div className="chart-card">
              <h3>Выручка по дню недели</h3>
              <BarChart data={dowLabels} color="blue" valueFormatter={fmtRub} />
            </div>
            <div className="chart-card">
              <h3>Заказов по дню недели</h3>
              <BarChart data={ordersDowLabels} color="teal" valueFormatter={n => fmt(n, 0)} />
            </div>
            <div className="chart-card wide">
              <h3>Выручка по часу дня</h3>
              <BarChart data={hourLabels} color="orange" valueFormatter={fmtRub} />
            </div>
          </div>
        </Section>
      </>
    )
  }

  const renderTariffs = () => {
    const b = bookingTariffData
    if (!b) return null
    const byPlan = asNestedMap(b.visitsByDayAndTariffPlan)
    const byRuleType = asNestedMap(b.visitsByDayAndRuleType)
    return (
      <>
        <div className="kpi-grid">
          <KPI label="Оплаченных бронирований" value={fmt(b.totalPaidBookings ?? 0, 0)} color="blue" />
        </div>
        {b.note && (
          <p className="dynamics-hint">{String(b.note)}</p>
        )}
        <Section title="Тарифный план: посещения по дням">
          <VisitPivotTable data={byPlan} />
        </Section>
        <Section title="Тип применённого правила (STANDARD / WEEKEND / HOLIDAY / SPECIAL) по дням" defaultOpen={false}>
          <p className="dynamics-hint">
            Если в расчёте участвовало несколько правил, одно бронирование может учитываться в нескольких колонках.
          </p>
          <VisitPivotTable
            data={byRuleType}
            formatCol={(c) => RULE_TYPE_RU[c] || c}
          />
        </Section>
        <Section title="Конкретные правила (id + тип) по дням" defaultOpen={false}>
          <VisitPivotTable data={asNestedMap(b.visitsByDayAndRuleId)} />
        </Section>
      </>
    )
  }

  const renderTab = () => {
    switch (tab) {
      case 'overview': return renderOverview()
      case 'products': return renderProducts()
      case 'employees': return renderEmployees()
      case 'time': return renderTime()
      case 'tariffs': return renderTariffs()
    }
  }

  return (
    <div className="booking-analytics-page">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Аналитика ресторана</h1>
          <p className="dashboard-subtitle">Выручка, товары, сотрудники, динамика</p>
        </div>
        <div className="dashboard-controls">
          <div className="date-controls">
            <label className="date-label">С</label>
            <input
              type="date"
              className="date-input"
              value={dateFrom}
              onChange={(e) => handleDateChange('from', e.target.value)}
            />
            <label className="date-label">По</label>
            <input
              type="date"
              className="date-input"
              value={dateTo}
              onChange={(e) => handleDateChange('to', e.target.value)}
            />
            <button type="button" className="refresh-btn" onClick={() => loadData()} disabled={loading} title="Обновить">
              {loading ? '⏳' : '↻'}
            </button>
          </div>
          {lastLoaded && <span className="last-loaded">Обновлено: {lastLoaded}</span>}
        </div>
      </div>

      {warning && (
        <div className="alert alert-warning">
          <span>⚠️</span> {warning}
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <span>❌</span> {error}
          <button type="button" onClick={() => loadData()} className="alert-retry">Повторить</button>
        </div>
      )}

      <div className="analytics-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`analytics-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span className="tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="analytics-loading">
          <div className="loading-spinner" />
          Загрузка аналитики...
        </div>
      ) : (
        renderTab()
      )}
    </div>
  )
}
