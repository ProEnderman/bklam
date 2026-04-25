import { useState } from 'react'
import { useAnalytics } from './AnalyticsContext'
import Section from './components/Section'
import DataTable from './components/DataTable'
import { BarChart, LineChart } from './components/ChartSystem'
import KPICard from './components/KPICard'
import { fmt, fmtRub, fmtRubFull, pct, sorted } from './utils/analytics'

// ═══════════════════════════════════════════════════
// LAYER 3 — Deep Analysis
// Collapsible detailed views with search, sort, pagination
// ═══════════════════════════════════════════════════

type DeepTab = 'clients' | 'daily' | 'tariffs' | 'rfm' | 'notifications'

const TABS: { key: DeepTab; label: string; icon: string }[] = [
  { key: 'clients', label: 'Клиенты', icon: '👥' },
  { key: 'daily', label: 'По дням', icon: '📅' },
  { key: 'tariffs', label: 'Тарифы', icon: '🏷' },
  { key: 'rfm', label: 'RFM', icon: '🎯' },
  { key: 'notifications', label: 'Уведомления', icon: '🔔' },
]

function ClientsDeep({ data }: { data: any }) {
  const { conversion } = data
  const clientLtv = conversion?.clientLtv || {}
  const cancelsByClient = conversion?.cancelsByClient || {}
  const visitFreq = conversion?.visitFrequency || {}

  const clients = Object.entries(clientLtv).map(([name, v]: [string, any]) => ({
    name,
    revenue: v.totalRevenue,
    visits: v.visits,
    avgCheck: v.avgCheck,
    cancels: cancelsByClient[name] || 0,
    avgDaysBetween: visitFreq[name] || null,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
        <KPICard compact title="Уникальных" value={fmt(conversion?.uniqueClients)} severity="neutral" />
        <KPICard compact title="Повторных" value={fmt(conversion?.repeatClients)} severity="neutral" />
        <KPICard compact title="Удержание" value={pct(conversion?.retentionRate)} severity="neutral" />
      </div>

      <Section title="Все клиенты" badge={clients.length}>
        <DataTable columns={[
          { key: 'name', label: 'Клиент', width: '200px' },
          { key: 'revenue', label: 'Выручка', format: fmtRubFull, align: 'right' },
          { key: 'visits', label: 'Визиты', format: fmt, align: 'right' },
          { key: 'avgCheck', label: 'Ср. чек', format: fmtRubFull, align: 'right' },
          { key: 'cancels', label: 'Отмены', format: fmt, align: 'right' },
          { key: 'avgDaysBetween', label: 'Дн. между', format: (v: number) => v ? v.toFixed(0) : '—', align: 'right' },
        ]} data={clients} searchKey="name" />
      </Section>

      <Section title="Топ отменяющие" defaultOpen={false}>
        <BarChart data={sorted(cancelsByClient)} formatValue={fmt} />
      </Section>
    </div>
  )
}

function DailyDeep({ data }: { data: any }) {
  const { trends, volume } = data
  const byDay = volume?.byDay || {}
  const dailyRevenue = trends?.dailyRevenue || {}

  const dailyData = Object.keys(byDay).sort().map(date => ({
    date,
    bookings: byDay[date] || 0,
    revenue: dailyRevenue[date] || 0,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Section title="Тренд по дням">
        <LineChart series={[
          { label: 'Выручка', data: dailyRevenue, color: '#4f46e5' },
        ]} formatY={fmtRub} height={160} />
      </Section>

      <Section title="Все дни" badge={dailyData.length}>
        <DataTable columns={[
          { key: 'date', label: 'Дата' },
          { key: 'bookings', label: 'Бронирования', format: fmt, align: 'right' },
          { key: 'revenue', label: 'Выручка', format: fmtRubFull, align: 'right' },
        ]} data={dailyData} pageSize={20} searchKey="date" />
      </Section>

      <Section title="По неделям" defaultOpen={false}>
        <BarChart data={Object.entries(volume?.byWeek || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, Number(v)] as [string, number])} formatValue={fmt} maxBars={20} showExpand={false} />
      </Section>
    </div>
  )
}

function TariffsDeep({ data }: { data: any }) {
  const { tariffs } = data
  const avgByTariff = tariffs?.avgCheckByTariffPlan || {}
  const revByDayType = tariffs?.revenueByDayType || {}
  const booksByDayType = tariffs?.bookingsByDayType || {}
  const avgByDayType = tariffs?.avgCheckByDayType || {}
  const amtDist = tariffs?.amountDistribution || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
        <KPICard compact title="₽/мин" value={fmtRub(tariffs?.avgRatePerMinute)} severity="neutral" />
        <KPICard compact title="₽/час" value={fmtRub(tariffs?.avgRatePerHour)} severity="neutral" />
        <KPICard compact title="Скидки" value={fmtRub(tariffs?.totalDiscounts)} severity="neutral" subtitle={pct(tariffs?.discountPercentOfRevenue) + ' от выручки'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Section title="Средний чек по тарифу">
          <BarChart data={sorted(avgByTariff)} formatValue={fmtRub} />
        </Section>
        <Section title="Распределение сумм">
          <BarChart data={(() => {
            const order = ['0', '1-500', '501-1000', '1001-2000', '2001-5000', '5001+']
            return order.filter(k => amtDist[k] != null).map(k => [k, amtDist[k] as number] as [string, number])
          })()} formatValue={fmt} showExpand={false} />
        </Section>
      </div>

      <Section title="Метрики по типу дня">
        <DataTable compact searchable={false} columns={[
          { key: 'type', label: 'Тип дня' },
          { key: 'revenue', label: 'Выручка', format: fmtRubFull, align: 'right' },
          { key: 'bookings', label: 'Бронирований', format: fmt, align: 'right' },
          { key: 'avgCheck', label: 'Ср. чек', format: fmtRubFull, align: 'right' },
        ]} data={[
          { type: 'Будни', revenue: revByDayType.WEEKDAY, bookings: booksByDayType.WEEKDAY, avgCheck: avgByDayType.WEEKDAY },
          { type: 'Выходные', revenue: revByDayType.WEEKEND, bookings: booksByDayType.WEEKEND, avgCheck: avgByDayType.WEEKEND },
          { type: 'Праздники', revenue: revByDayType.HOLIDAY, bookings: booksByDayType.HOLIDAY, avgCheck: avgByDayType.HOLIDAY },
        ]} pageSize={5} />
      </Section>
    </div>
  )
}

function RfmDeep({ data }: { data: any }) {
  const { rfm } = data
  const hasRfm = rfm && typeof rfm === 'object' && Object.keys(rfm).length > 0
  const clients = hasRfm ? (rfm.clients || []) : []
  const segments = hasRfm ? (rfm.segments || {}) : {}
  const hasSegments = Object.keys(segments).length > 0

  const RFM_COLORS: Record<string, string> = {
    Champions: '#10b981', Loyal: '#06b6d4', 'Big Spenders': '#8b5cf6',
    Potential: '#f59e0b', 'New Customers': '#3b82f6', 'At Risk': '#ef4444',
    Hibernating: '#9ca3af', Lost: '#6b7280',
  }

  if (!hasRfm) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎯</div>
        <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>RFM-аналитика недоступна</div>
        <div style={{ fontSize: '12px' }}>Перезапустите сервер для загрузки enterprise-метрик</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {hasSegments && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
          {Object.entries(segments).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([seg, cnt]) => (
            <div key={seg} style={{
              padding: '10px 14px', borderRadius: '8px', background: '#f9fafb',
              borderLeft: `4px solid ${RFM_COLORS[seg] || '#6b7280'}`,
            }}>
              <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>{seg}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827' }}>{fmt(cnt as number)}</div>
            </div>
          ))}
        </div>
      )}

      <Section title="RFM-таблица клиентов" badge={rfm?.totalClients}>
        <DataTable columns={[
          { key: 'client', label: 'Клиент', width: '180px' },
          { key: 'segment', label: 'Сегмент' },
          { key: 'recency', label: 'R (дни)', format: fmt, align: 'right' },
          { key: 'frequency', label: 'F (визиты)', format: fmt, align: 'right' },
          { key: 'monetary', label: 'M (₽)', format: fmtRubFull, align: 'right' },
          { key: 'rScore', label: 'R⭐', align: 'center' },
          { key: 'fScore', label: 'F⭐', align: 'center' },
          { key: 'mScore', label: 'M⭐', align: 'center' },
        ]} data={clients} searchKey="client" />
      </Section>
    </div>
  )
}

function NotificationsDeep({ data }: { data: any }) {
  const { notifications } = data
  const byType = notifications?.byType || {}
  const overdueByClient = notifications?.overdueByClient || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
        <KPICard compact title="Всего" value={fmt(notifications?.total)} severity="neutral" />
        <KPICard compact title="Ожидают" value={fmt(notifications?.pending)} severity={notifications?.pending > 10 ? 'warning' : 'neutral'} />
        <KPICard compact title="Решено" value={fmt(notifications?.resolved)} severity="healthy" />
        <KPICard compact title="Ср. реакция" value={`${fmt(notifications?.avgReactionMinutes)} мин`} severity="neutral" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Section title="По типу">
          <BarChart data={Object.entries(byType)} formatValue={fmt} showExpand={false} />
        </Section>
        <Section title="Конверсия уведомлений">
          <DataTable compact searchable={false} columns={[
            { key: 'type', label: 'Тип' },
            { key: 'total', label: 'Всего', align: 'right' },
            { key: 'converted', label: 'Конвертировано', align: 'right' },
            { key: 'rate', label: '%', align: 'right' },
          ]} data={[
            { type: 'REMINDER → Подтверждено', total: notifications?.reminderTotal, converted: notifications?.reminderConfirmed, rate: pct(notifications?.reminderConfirmedPct) },
            { type: 'OVERDUE → Оплачено', total: notifications?.overdueTotal, converted: notifications?.overduePaid, rate: pct(notifications?.overduePaidPct) },
          ]} pageSize={5} />
        </Section>
      </div>

      <Section title="Просрочки по клиентам" defaultOpen={false}>
        <BarChart data={sorted(overdueByClient)} formatValue={fmt} />
      </Section>
    </div>
  )
}

export default function DeepAnalysisLayer() {
  const { data } = useAnalytics()
  const [tab, setTab] = useState<DeepTab>('clients')
  if (!data) return null

  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: '#f3f4f6', borderRadius: '10px', padding: '4px' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              background: tab === t.key ? '#fff' : 'transparent',
              boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              fontWeight: tab === t.key ? 600 : 400,
              fontSize: '13px', color: tab === t.key ? '#111827' : '#6b7280',
              transition: 'all .15s',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'clients' && <ClientsDeep data={data} />}
      {tab === 'daily' && <DailyDeep data={data} />}
      {tab === 'tariffs' && <TariffsDeep data={data} />}
      {tab === 'rfm' && <RfmDeep data={data} />}
      {tab === 'notifications' && <NotificationsDeep data={data} />}
    </div>
  )
}
