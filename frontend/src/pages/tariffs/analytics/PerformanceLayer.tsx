import { useState } from 'react'
import { useAnalytics } from './AnalyticsContext'
import { formatCohortCellValue } from './cohortFormat'
import KPICard from './components/KPICard'
import Section from './components/Section'
import { BarChart, LineChart, Heatmap, DonutChart } from './components/ChartSystem'
import DataTable from './components/DataTable'
import { fmt, fmtRub, fmtRubFull, pct, sorted, DOW_RU, sparklineData } from './utils/analytics'

// ═══════════════════════════════════════════════════
// LAYER 2 — Performance Analytics
// 4 unified modules: Demand, Monetization, Customer, Capacity
// ═══════════════════════════════════════════════════

function DemandModule({ data }: { data: any }) {
  const { volume, trends, heatmap, forecast } = data
  const byActivity = volume?.byActivity || {}
  const byMonth = volume?.byMonth || {}
  const growthMom = volume?.growth?.mom || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
        <KPICard compact title="Всего бронирований" value={fmt(volume?.total)} delta={trends?.totalDelta} sparkline={sparklineData(trends?.dailyCounts)} severity="neutral" />
        <KPICard compact title="Оплачено" value={fmt(volume?.byStatus?.PAID)} delta={trends?.paidDelta} severity="healthy" />
        <KPICard compact title="Отменено" value={fmt(volume?.byStatus?.CANCELLED)} severity={volume?.byStatus?.CANCELLED > volume?.total * 0.2 ? 'warning' : 'neutral'} />
        <KPICard compact title="Прогноз (14д)" value={forecast?.forecastBookings ? fmt(Object.values(forecast.forecastBookings as Record<string, number>).reduce((a: number, b: number) => a + b, 0)) : '—'} severity="neutral" subtitle="ожидается" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Section title="Тренд бронирований" defaultOpen>
          <LineChart series={[
            { label: 'Бронирования/день', data: trends?.dailyCounts || {}, color: '#4f46e5' },
            ...(forecast?.forecastBookings ? [{ label: 'Прогноз', data: forecast.forecastBookings, color: '#a5b4fc' }] : []),
          ]} height={150} />
        </Section>
        <Section title="По активностям">
          <DonutChart data={byActivity} />
        </Section>
      </div>

      <Section title="Динамика по месяцам">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>Объём</div>
            <BarChart data={sorted(byMonth, 0, true)} label="" formatValue={fmt} maxBars={12} showExpand={false} />
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>MoM рост</div>
            <BarChart data={Object.entries(growthMom).map(([k, v]) => [k, v as number])} formatValue={v => (v > 0 ? '+' : '') + v.toFixed(1) + '%'} maxBars={12} showExpand={false} />
          </div>
        </div>
      </Section>

      <Section title="Тепловая карта (день × час)" defaultOpen={false}>
        <Heatmap data={heatmap?.bookings} />
      </Section>
    </div>
  )
}

function MonetizationModule({ data }: { data: any }) {
  const { revenue, trends, tariffs, unitEconomics } = data
  const byActivity = revenue?.byActivity || {}
  const byHour = revenue?.byHour || {}
  const revByDayType = tariffs?.revenueByDayType || {}
  const hasUE = unitEconomics && typeof unitEconomics === 'object' && Object.keys(unitEconomics).length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
        <KPICard compact title="Выручка" value={fmtRub(revenue?.total)} delta={trends?.revenueDelta} sparkline={sparklineData(trends?.dailyRevenue)} severity={revenue?.total > 0 ? 'healthy' : 'neutral'} />
        <KPICard compact title="Средний чек" value={fmtRub(revenue?.average)} delta={trends?.avgCheckDelta} severity="neutral" />
        <KPICard compact title="Медиана чека" value={fmtRub(revenue?.median)} severity="neutral" />
        <KPICard compact title="RevPAH" value={hasUE ? fmtRub(unitEconomics.revenuePerHour) : '—'} severity={hasUE && unitEconomics.revenuePerHour > 0 ? 'healthy' : 'neutral'} subtitle="₽/час ресурса" />
        <KPICard compact title="₽/мин тариф" value={tariffs?.avgRatePerMinute ? fmtRub(tariffs.avgRatePerMinute) : '—'} severity="neutral" />
        <KPICard compact title="Скидки" value={tariffs?.totalDiscounts > 0 ? pct(tariffs.discountPercentOfRevenue) : 'Нет скидок'} severity={tariffs?.discountPercentOfRevenue > 20 ? 'warning' : 'neutral'} subtitle={tariffs?.totalDiscounts > 0 ? fmtRub(tariffs.totalDiscounts) + ' итого' : ''} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Section title="Выручка по активностям">
          <BarChart data={sorted(byActivity)} formatValue={fmtRub} />
        </Section>
        <Section title="Выручка по типу дня">
          <BarChart data={Object.entries(revByDayType).map(([k, v]) => [k === 'WEEKDAY' ? 'Будни' : k === 'WEEKEND' ? 'Выходные' : 'Праздники', v as number])} formatValue={fmtRub} showExpand={false} />
        </Section>
      </div>

      <Section title="Выручка по часам" defaultOpen={false}>
        <BarChart data={Object.entries(byHour).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => [`${k}:00`, v as number])} formatValue={fmtRub} maxBars={24} showExpand={false} />
      </Section>

      <Section title="Unit Economics по активностям" badge={hasUE ? Object.keys(unitEconomics.byActivity || {}).length : undefined}>
        {hasUE && Object.keys(unitEconomics.byActivity || {}).length > 0 ? (
          <DataTable compact columns={[
            { key: 'name', label: 'Активность' },
            { key: 'revenue', label: 'Выручка', format: fmtRubFull, align: 'right' },
            { key: 'hours', label: 'Часы', format: (v: number) => v?.toFixed(0), align: 'right' },
            { key: 'revpah', label: 'RevPAH', format: fmtRubFull, align: 'right' },
            { key: 'bookings', label: 'Брони', format: fmt, align: 'right' },
          ]} data={Object.entries(unitEconomics.byActivity).map(([name, v]: [string, any]) => ({ name, ...v }))} pageSize={10} searchable={false} />
        ) : (
          <div style={{ fontSize: '12px', color: '#9ca3af', padding: '16px 0', textAlign: 'center' }}>
            Перезапустите сервер для загрузки enterprise-аналитики
          </div>
        )}
      </Section>
    </div>
  )
}

// ── Cohort Retention: null = future (—), 0 = 0%, global heatmap scale ──
function CohortRetentionSection({ cohort }: { cohort: any }) {
  const [mode, setMode] = useState<'monthly' | 'weekly'>('weekly')

  const monthlyMatrix = cohort?.matrix || {}
  const monthlySizes = cohort?.cohortSizes || {}
  const weeklyMatrix = cohort?.weeklyMatrix || {}
  const weeklySizes = cohort?.weeklySizes || {}

  const matrix = mode === 'monthly' ? monthlyMatrix : weeklyMatrix
  const sizes = mode === 'monthly' ? monthlySizes : weeklySizes
  const periodPrefix = mode === 'monthly' ? 'M' : 'W'
  const hasData = Object.keys(matrix).length > 0

  // Global max for heatmap (exclude null); min 1 to avoid div by zero
  const allNumericValues = Object.values(matrix).flatMap((v: any) =>
    (Array.isArray(v) ? v : []).filter((x: number | null) => x != null && typeof x === 'number')
  ) as number[]
  const heatmapMax = Math.max(1, ...allNumericValues)

  if (!hasData && Object.keys(monthlyMatrix).length === 0 && Object.keys(weeklyMatrix).length === 0) return null

  const numCols = Math.max(...Object.values(matrix).map((v: any) => (Array.isArray(v) ? v.length : 0)), 0)

  return (
    <Section title="Когортный анализ удержания" defaultOpen>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
        {(['weekly', 'monthly'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 500, cursor: 'pointer',
            background: mode === m ? '#4f46e5' : '#f3f4f6', color: mode === m ? '#fff' : '#6b7280', border: 'none',
          }}>
            {m === 'weekly' ? 'По неделям' : 'По месяцам'}
          </button>
        ))}
      </div>
      {hasData ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '11px', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600, color: '#6b7280' }}>Когорта</th>
                <th style={{ padding: '4px', textAlign: 'center', fontWeight: 600, color: '#6b7280' }}>Размер</th>
                {Array.from({ length: numCols }, (_, i) => (
                  <th key={i} style={{ padding: '4px', textAlign: 'center', fontWeight: 600, color: '#6b7280' }}>{periodPrefix}{i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(matrix).map(([period, vals]: [string, any]) => {
                const size = sizes[period] ?? 0
                const arr = Array.isArray(vals) ? vals : []
                return (
                  <tr key={period}>
                    <td style={{ padding: '3px 8px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {mode === 'weekly' ? `Нед. ${String(period).slice(5)}` : period}
                    </td>
                    <td style={{ padding: '3px', textAlign: 'center', color: '#6b7280' }}>{size}</td>
                    {Array.from({ length: numCols }, (_, i) => {
                      const v = arr[i] as number | null | undefined
                      const isFuture = v === null || v === undefined
                      const num = typeof v === 'number' ? v : 0
                      const isW0 = i === 0
                      // W0: neutral style (no saturated purple) so it doesn't dominate the heatmap
                      const ratio = heatmapMax > 0 ? num / heatmapMax : 0
                      const opacity = isFuture ? 0 : Math.min(ratio * 0.8, 0.8)
                      const tooltip = isFuture
                        ? 'Неделя ещё не наступила'
                        : `${Math.round((size * num) / 100)} / ${size} (${num.toFixed(1)}%)`
                      const bg = isFuture
                        ? '#e2e8f0'
                        : isW0
                          ? '#e0e7ff'
                          : `rgba(79,70,229,${opacity})`
                      const fg = isFuture ? '#64748b' : isW0 ? '#3730a3' : opacity > 0.4 ? '#fff' : '#374151'
                      return (
                        <td
                          key={i}
                          title={tooltip}
                          style={{
                            padding: '3px',
                            textAlign: 'center',
                            background: bg,
                            color: fg,
                            fontWeight: 500,
                            borderRadius: '2px',
                          }}
                        >
                          {formatCohortCellValue(v ?? null)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: '#9ca3af', padding: '16px 0', textAlign: 'center' }}>
          Нет данных для {mode === 'weekly' ? 'недельных' : 'месячных'} когорт в выбранном периоде
        </div>
      )}
    </Section>
  )
}

function CustomerModule({ data }: { data: any }) {
  const { conversion, rfm, cohort } = data
  const funnel = conversion?.funnel || {}
  const clientLtv = conversion?.clientLtv || {}
  const rfmSegments = rfm && typeof rfm === 'object' && rfm.segments ? rfm.segments : {}
  const hasRfm = Object.keys(rfmSegments).length > 0

  const ltvData = Object.entries(clientLtv)
    .map(([name, v]: [string, any]) => ({ name, revenue: v.totalRevenue, visits: v.visits, avgCheck: v.avgCheck }))
    .sort((a, b) => b.revenue - a.revenue)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
        <KPICard compact title="Уникальных клиентов" value={fmt(conversion?.uniqueClients)} severity="neutral" />
        <KPICard compact title="Повторных" value={fmt(conversion?.repeatClients)} severity="neutral" subtitle={pct(conversion?.retentionRate) + ' удержание'} />
        <KPICard compact title="Конверсия в оплату" value={pct(funnel?.confirmedToPaidPct)} severity="neutral" />
        <KPICard compact title="Отмены" value={pct(conversion?.cancelRate)} severity={conversion?.cancelRate > 20 ? 'warning' : 'neutral'} />
      </div>

      {/* Funnel */}
      <Section title="Воронка конверсии">
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
          {[
            { label: 'Черновики', value: funnel.draft, color: '#9ca3af' },
            { label: 'Подтв.', value: funnel.confirmed, color: '#f59e0b' },
            { label: 'Оплачено', value: funnel.paid, color: '#10b981' },
          ].map((step, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ width: `${60 + (2 - i) * 20}px`, height: '40px', background: step.color, borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px', margin: '0 auto' }}>
                {fmt(step.value)}
              </div>
              <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>{step.label}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* RFM Segmentation + Conversion */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Section title="RFM-сегменты" badge={hasRfm ? rfm.totalClients : undefined}>
          {hasRfm ? (
            <DonutChart data={rfmSegments} />
          ) : (
            <div style={{ fontSize: '12px', color: '#9ca3af', padding: '16px 0', textAlign: 'center' }}>
              Перезапустите сервер для загрузки RFM-аналитики
            </div>
          )}
        </Section>
        <Section title="Конверсия по активностям">
          <DataTable compact searchable={false} columns={[
            { key: 'name', label: 'Активность' },
            { key: 'total', label: 'Всего', align: 'right' },
            { key: 'paid', label: 'Оплач.', align: 'right' },
            { key: 'conversionPct', label: 'Конв.%', format: (v: number) => pct(v), align: 'right' },
            { key: 'cancelPct', label: 'Отмены%', format: (v: number) => pct(v), align: 'right' },
          ]} data={Object.entries(conversion?.conversionByActivity || {}).map(([name, v]: [string, any]) => ({ name, ...v }))} pageSize={10} />
        </Section>
      </div>

      {/* Cohort Retention — monthly + weekly toggle */}
      <CohortRetentionSection cohort={cohort} />

      {/* Top Clients LTV */}
      <Section title="Топ клиенты по LTV" defaultOpen={false} badge={ltvData.length}>
        <DataTable columns={[
          { key: 'name', label: 'Клиент', width: '200px' },
          { key: 'revenue', label: 'Выручка', format: fmtRubFull, align: 'right' },
          { key: 'visits', label: 'Визиты', format: fmt, align: 'right' },
          { key: 'avgCheck', label: 'Ср. чек', format: fmtRubFull, align: 'right' },
        ]} data={ltvData} searchKey="name" />
      </Section>
    </div>
  )
}

function CapacityModule({ data }: { data: any }) {
  const { capacity, stopCheck, heatmap, notifications } = data
  const utilization = capacity?.activityUtilization || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
        <KPICard compact title="Простой" value={pct(capacity?.idleCoefficient)} severity={capacity?.idleCoefficient > 50 ? 'warning' : 'healthy'} />
        <KPICard compact title="Ср. пробел" value={`${fmt(capacity?.avgGapMinutes)} мин`} severity="neutral" />
        <KPICard compact title="Потери от простоя" value={fmtRub(capacity?.lostRevenueEstimate)} severity={capacity?.lostRevenueEstimate > 10000 ? 'warning' : 'neutral'} />
        <KPICard compact title="Стоп-чеки" value={fmt(stopCheck?.triggerCount)} severity={stopCheck?.triggerCount > 20 ? 'warning' : 'neutral'} />
        <KPICard compact title="Уведомления" value={fmt(notifications?.total)} severity="neutral" subtitle={`${fmt(notifications?.pending)} ожидают`} />
        <KPICard compact title="Реакция" value={`${fmt(notifications?.avgReactionMinutes)} мин`} severity="neutral" />
      </div>

      <Section title="Загрузка по активностям">
        <DataTable compact searchable={false} columns={[
          { key: 'name', label: 'Активность' },
          { key: 'bookedHours', label: 'Занято (ч)', format: (v: number) => v?.toFixed(1), align: 'right' },
          { key: 'possibleHours', label: 'Возможно (ч)', format: (v: number) => v?.toFixed(1), align: 'right' },
          { key: 'utilization', label: 'Загрузка %', format: (v: number) => pct(v), align: 'right' },
          { key: 'bookingCount', label: 'Бронирований', format: fmt, align: 'right' },
        ]} data={Object.entries(utilization).map(([name, v]: [string, any]) => ({ name, ...v }))} pageSize={10} />
      </Section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Section title="Пиковые часы">
          <BarChart data={Object.entries(capacity?.peakHours || {}).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => [`${k}:00`, v as number])} formatValue={fmt} maxBars={24} showExpand={false} />
        </Section>
        <Section title="Пиковые дни">
          <BarChart data={Object.entries(capacity?.peakDays || {}).map(([k, v]) => [DOW_RU[k] || k, v as number])} formatValue={fmt} maxBars={7} showExpand={false} />
        </Section>
      </div>

      {/* Stop-check */}
      {stopCheck && stopCheck.triggerCount > 0 && (
        <Section title="Стоп-чек аналитика" defaultOpen={false}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '12px' }}>
            <KPICard compact title="Полных (бесплатно)" value={fmt(stopCheck.fullyFreeCount)} severity="neutral" />
            <KPICard compact title="Частичных" value={fmt(stopCheck.partiallyFreeCount)} severity="neutral" />
            <KPICard compact title="Ср. сумма до стопа" value={fmtRub(stopCheck.avgAmountBeforeStopCheck)} severity="neutral" />
            <KPICard compact title="Потери от стоп-чека" value={fmtRub(stopCheck.lostRevenueDueToStopCheck)} severity="neutral" />
          </div>
        </Section>
      )}

      <Section title="Тепловая карта загрузки" defaultOpen={false}>
        <Heatmap data={heatmap?.bookings} />
      </Section>
    </div>
  )
}

// ── Module Selector ──
const MODULES = [
  { key: 'demand', label: 'Спрос', icon: '📊' },
  { key: 'monetization', label: 'Монетизация', icon: '💰' },
  { key: 'customer', label: 'Клиенты', icon: '👥' },
  { key: 'capacity', label: 'Мощности', icon: '⏱' },
] as const

export default function PerformanceLayer() {
  const { data, performanceModule, setPerformanceModule } = useAnalytics()
  if (!data) return null

  return (
    <div>
      {/* Module tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#f3f4f6', borderRadius: '10px', padding: '4px' }}>
        {MODULES.map(m => (
          <button key={m.key} onClick={() => setPerformanceModule(m.key)}
            style={{
              flex: 1, padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              background: performanceModule === m.key ? '#fff' : 'transparent',
              boxShadow: performanceModule === m.key ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              fontWeight: performanceModule === m.key ? 600 : 400,
              fontSize: '13px', color: performanceModule === m.key ? '#111827' : '#6b7280',
              transition: 'all .15s',
            }}>
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {performanceModule === 'demand' && <DemandModule data={data} />}
      {performanceModule === 'monetization' && <MonetizationModule data={data} />}
      {performanceModule === 'customer' && <CustomerModule data={data} />}
      {performanceModule === 'capacity' && <CapacityModule data={data} />}
    </div>
  )
}
