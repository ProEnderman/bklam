import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAnalytics } from './AnalyticsContext'
import KPICard from './components/KPICard'
import { RiskCard, PrescriptiveCard } from './components/InsightCard'
import { LineChart } from './components/ChartSystem'
import { fmt, fmtRub, pct, severity, sparklineData, type Severity } from './utils/analytics'
import { forecastService, type ForecastResponse, type MonthlyForecastResponse, type MonthProgressResponse } from '../../../api/services'

// ═══════════════════════════════════════════════════
// LAYER 1 — Executive Dashboard
// Monthly executive view by default, daily behind toggle
// ═══════════════════════════════════════════════════

const hasData = (obj: any): boolean => obj != null && typeof obj === 'object' && Object.keys(obj).length > 0

type ChartView = 'overlay' | 'actual' | 'forecast'

const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const STATUS_LABEL: Record<string, string> = { full: 'Полный месяц', partial: 'Частичные данные', no_data: 'Недостаточно данных' }
const STATUS_COLOR: Record<string, string> = { full: '#10b981', partial: '#f59e0b', no_data: '#f59e0b' }

/** Сообщение при отсутствии или недостатке данных для аналитики (вместо no_data) */
const INSUFFICIENT_DATA_MESSAGE =
  'Сейчас недостаточно данных для аналитики и прогноза. Загрузите данные по заказам или подождите — после накопления истории прогноз появится автоматически.'

function formatModel(family: string): string {
  if (family.includes('ensemble')) return 'Ансамбль'
  if (family === 'sarima') return 'SARIMA'
  if (family === 'prophet') return 'Prophet'
  if (family === 'sarimax_exog') return 'SARIMAX'
  return family
}

function effectiveMonthlyTotal(
  monthly: MonthlyForecastResponse | null,
  progress: MonthProgressResponse | null,
): number {
  if (monthly && monthly.predicted_total > 0) return monthly.predicted_total
  if (progress?.snapshot_total && progress.snapshot_total > 0) return progress.snapshot_total
  if (progress?.revised_total && progress.revised_total > 0) return progress.revised_total
  return monthly?.predicted_total ?? 0
}

/** Month rollup has real forecast bounds (not empty snapshot with lo=hi=0). */
function hasMeaningfulMonthlyCi(monthly: MonthlyForecastResponse | null): boolean {
  if (!monthly || monthly.coverage_ratio <= 0) return false
  const lo = monthly.lower_total
  const hi = monthly.upper_total
  if (lo == null || hi == null) return false
  if (lo === 0 && hi === 0 && monthly.predicted_total > 0) return false
  return hi > lo || (lo > 0 && hi > 0)
}

export default function ExecutiveLayer() {
  const { data, dateFrom, dateTo } = useAnalytics()

  // Monthly forecast state (primary)
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyForecastResponse | null>(null)
  const [monthlyBookings, setMonthlyBookings] = useState<MonthlyForecastResponse | null>(null)
  const [monthlyLoading, setMonthlyLoading] = useState(false)
  const [monthlyError, setMonthlyError] = useState<string | null>(null)

  // Прогноз обновляется на сервере (плановое обновление в понедельник 03:00 или ручной запуск)
  const [updatingFromServer, setUpdatingFromServer] = useState(false)

  // Month progress tracker
  const [revProgress, setRevProgress] = useState<MonthProgressResponse | null>(null)
  const [bkProgress, setBkProgress] = useState<MonthProgressResponse | null>(null)

  // Daily chart state (secondary, behind toggle)
  const [showDaily, setShowDaily] = useState(true)
  const [mlForecast, setMlForecast] = useState<ForecastResponse | null>(null)
  const [mlLoading, setMlLoading] = useState(false)
  const [mlAvailable, setMlAvailable] = useState<boolean | null>(null)
  const [chartView, setChartView] = useState<ChartView>('actual')

  // Month for ML forecast: end of analytics filter, else current calendar month
  const { forecastYear: curYear, forecastMonth: curMonth } = useMemo(() => {
    const ref = dateTo || dateFrom
    if (ref) {
      const d = new Date(`${ref}T12:00:00`)
      if (!Number.isNaN(d.getTime())) {
        return { forecastYear: d.getFullYear(), forecastMonth: d.getMonth() + 1 }
      }
    }
    const now = new Date()
    return { forecastYear: now.getFullYear(), forecastMonth: now.getMonth() + 1 }
  }, [dateFrom, dateTo])

  // Load monthly forecasts when filter month changes
  const loadMonthly = useCallback(async () => {
    setMonthlyLoading(true)
    setMonthlyError(null)
    try {
      const [updatingResp, rev, bk] = await Promise.all([
        forecastService.getUpdating().catch(() => ({ updating: false })),
        forecastService.getMonthlyForecast('revenue', curYear, curMonth, { forceRefresh: true }),
        forecastService.getMonthlyForecast('bookings', curYear, curMonth, { forceRefresh: true, breakdown: 'activity' }),
      ])
      setUpdatingFromServer(updatingResp?.updating ?? false)

      try {
        // Dev-only assertion: monthly endpoint is used by default
        if (import.meta.env?.DEV) {
          console.assert(rev && !rev.error, '[Monthly] Revenue monthly endpoint should return valid data', rev)
          console.log('[Monthly] Revenue rollup loaded:', rev?.status, rev?.coverage_ratio)
        }
      } catch { /* import.meta.env unavailable outside Vite */ }

      if (rev && !rev.error) setMonthlyRevenue(rev)
      else {
        const err = rev?.error || 'no_data'
        const isInsufficient = ['no_data', 'no_forecast_available', 'training_failed'].includes(err)
        setMonthlyError(rev?.message || (isInsufficient ? INSUFFICIENT_DATA_MESSAGE : err))
      }

      if (bk && !bk.error) setMonthlyBookings(bk)

      // Load progress trackers
      try {
        const [rp, bp] = await Promise.all([
          forecastService.getMonthProgress('revenue', curYear, curMonth),
          forecastService.getMonthProgress('bookings', curYear, curMonth),
        ])
        if (rp && !rp.error) setRevProgress(rp)
        if (bp && !bp.error) setBkProgress(bp)
      } catch { /* progress is optional */ }
    } catch (e: any) {
      const status = e?.response?.status
      if (status === 500 || status === 502 || status === 503 || !status) {
        setMonthlyError('Сервис прогнозирования недоступен (ML-сервис не запущен)')
      } else if (status === 404) {
        setMonthlyError('Прогноз ещё не сгенерирован. Запустите обучение модели.')
      } else {
        setMonthlyError(e?.message || 'Ошибка загрузки')
      }
    } finally {
      setMonthlyLoading(false)
    }
  }, [curYear, curMonth])

  useEffect(() => { loadMonthly() }, [loadMonthly])

  // Пока сервер обновляет прогноз (понедельник 03:00) — опрашиваем статус и по окончании перезагружаем данные
  useEffect(() => {
    if (!updatingFromServer) return
    const t = setInterval(async () => {
      try {
        const { updating } = await forecastService.getUpdating()
        if (!updating) {
          setUpdatingFromServer(false)
          loadMonthly()
        }
      } catch {
        setUpdatingFromServer(false)
      }
    }, 5000)
    return () => clearInterval(t)
  }, [updatingFromServer, loadMonthly])

  // Lazy-load daily ML forecast only when toggle is on
  const loadMlForecast = useCallback(async () => {
    if (mlAvailable !== null) return
    setMlLoading(true)
    try {
      const resp = await forecastService.getForecast('revenue', 14)
      if (resp && resp.forecast && resp.values) {
        setMlForecast(resp)
        setMlAvailable(true)
      }
    } catch {
      setMlAvailable(false)
    } finally {
      setMlLoading(false)
    }
  }, [mlAvailable])

  useEffect(() => {
    if (showDaily) loadMlForecast()
  }, [showDaily, loadMlForecast])

  if (!data) return null

  const { volume, revenue, conversion, capacity, trends, forecast, riskIndex, unitEconomics, prescriptive, anomalies } = data
  const paid = volume?.byStatus?.PAID || 0
  const cancelled = volume?.byStatus?.CANCELLED || 0
  const total = volume?.total || 0
  const totalRevenue = revenue?.total || 0

  // Риски, точки роста, рекомендации и аномалии — по всей истории ресторана, показываются через месяц после первой брони (флаг с бэкенда)
  const hasEnoughHistory = Boolean(data?.hasSufficientHistoryForInsights)
  const historyDays = Number(data?.historyDays) || 0
  const historyFirstDate = data?.historyFirstDate ?? null
  const avgCheck = revenue?.average || 0
  const cancelRate = conversion?.cancelRate || 0
  const retention = conversion?.retentionRate || 0
  const idle = capacity?.idleCoefficient || 0
  const revpah = hasData(unitEconomics) ? (unitEconomics.revenuePerHour || 0) : null
  const revenuePerClient = hasData(unitEconomics) ? (unitEconomics.revenuePerClient || 0) : null
  const risk = hasData(riskIndex)
    ? riskIndex
    : { score: 0, level: 'healthy', risks: [], opportunities: [] }

  const dailyRev = sparklineData(trends?.dailyRevenue)
  const dailyCnt = sparklineData(trends?.dailyCounts)

  const cancelSev = severity(cancelRate, { critical: 30, warning: 15 })
  const idleSev = severity(idle, { critical: 60, warning: 40 })
  const retentionSev = severity(retention, { critical: 15, warning: 25 }, true)
  const riskSev: Severity = risk.level === 'critical' ? 'critical' : risk.level === 'warning' ? 'warning' : 'healthy'

  // Monthly forecast KPI
  const mRev = monthlyRevenue
  const monthForecastSev: Severity = mRev
    ? mRev.status === 'no_data' ? 'warning' : 'healthy'
    : (monthlyLoading || updatingFromServer) ? 'neutral' : 'warning'

  // Daily chart (only used when showDaily is true)
  const hasMl = mlAvailable && mlForecast != null
  const hasBuiltIn = hasData(forecast)
  const builtinForecast = hasBuiltIn ? forecast : null

  const buildChartSeries = () => {
    const series: any[] = []
    if (chartView !== 'forecast') {
      series.push({ label: 'Выручка', data: trends?.dailyRevenue || {}, color: '#4f46e5' })
    }
    if (hasMl && chartView !== 'actual') {
      const mlData: Record<string, number> = {}
      const mlUpper: Record<string, number> = {}
      const mlLower: Record<string, number> = {}
      mlForecast!.forecast.forEach((d, i) => {
        mlData[d] = mlForecast!.values[i]
        mlUpper[d] = mlForecast!.upper_bound[i]
        mlLower[d] = mlForecast!.lower_bound[i]
      })
      series.push({
        label: `Прогноз ML (${mlForecast!.model})`,
        data: mlData, color: '#8b5cf6',
        upper: mlUpper, lower: mlLower, dashed: true,
      })
    } else if (hasBuiltIn && chartView !== 'actual') {
      if (builtinForecast.forecastRevenue && Object.keys(builtinForecast.forecastRevenue).length) {
        series.push({
          label: 'Прогноз (EWMA)',
          data: builtinForecast.forecastRevenue, color: '#a5b4fc',
          upper: builtinForecast.forecastUpper, lower: builtinForecast.forecastLower, dashed: true,
        })
      }
    }
    return series
  }

  const modelLabel = hasMl
    ? `${mlForecast!.model === 'prophet' ? 'Facebook Prophet' : mlForecast!.model === 'sarima' ? 'SARIMA' : mlForecast!.model}`
    : hasBuiltIn ? 'EWMA + сезонность' : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ── Row 1: Tier-1 KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <KPICard title="Выручка" value={fmtRub(totalRevenue)} delta={trends?.revenueDelta} severity={totalRevenue > 0 ? 'healthy' : 'neutral'} sparkline={dailyRev} subtitle={`${fmt(paid)} оплачено`} />
        <KPICard title="Бронирования" value={fmt(total)} delta={trends?.totalDelta} severity="neutral" sparkline={dailyCnt} subtitle={`${fmt(paid)} оплачено / ${fmt(cancelled)} отмен`} />
        <KPICard title="Средний чек" value={fmtRub(avgCheck)} delta={trends?.avgCheckDelta} severity="neutral" />
        <KPICard title="Индекс риска" value={`${risk.score}/100`} severity={riskSev} subtitle={riskSev === 'critical' ? 'Требуется внимание' : riskSev === 'warning' ? 'Есть проблемы' : 'Стабильно'} />
      </div>

      {/* ── Row 2: Tier-2 KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
        <KPICard compact title="Отмены" value={pct(cancelRate)} severity={cancelSev} delta={trends?.cancelRateDelta} />
        <KPICard compact title="Удержание" value={pct(retention)} severity={retentionSev} />
        <KPICard compact title="Простой" value={pct(idle)} severity={idleSev} />
        <KPICard compact title="RevPAH" value={revpah != null ? fmtRub(revpah) : '—'} severity={revpah != null && revpah > 0 ? 'healthy' : 'neutral'} subtitle="Выручка/час ресурса" />
        <KPICard compact title="LTV" value={revenuePerClient != null ? fmtRub(revenuePerClient) : '—'} severity={revenuePerClient != null && revenuePerClient > 0 ? 'healthy' : 'neutral'} subtitle="Выручка/клиент" />
        <KPICard compact title="Месячный прогноз"
          value={mRev ? fmtRub(mRev.predicted_total) : (monthlyLoading || updatingFromServer) ? '...' : '—'}
          severity={monthForecastSev}
          subtitle={mRev ? `${MONTH_NAMES[mRev.month - 1]} · ${formatModel(mRev.model_family_used)}` : (monthlyLoading || updatingFromServer) ? 'Обновление…' : monthlyError ? 'ML-сервис недоступен' : ''} />
      </div>

      {/* ── Row 3: Monthly Forecast Card (DEFAULT VIEW) ── */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>
            Прогноз на {MONTH_NAMES[curMonth - 1]} {curYear}
          </span>
          {mRev && (
            <span style={{
              padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
              background: STATUS_COLOR[mRev.status] + '18',
              color: STATUS_COLOR[mRev.status],
            }}>
              {STATUS_LABEL[mRev.status]}
            </span>
          )}
        </div>

        {(monthlyLoading || updatingFromServer) && (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
            Прогноз в процессе обновления
          </div>
        )}

        {!monthlyLoading && !updatingFromServer && monthlyError && (
          <div
            style={{
              padding: '20px 24px',
              textAlign: 'center',
              background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
              borderRadius: '12px',
              border: '1px solid #fcd34d',
              marginBottom: '8px',
            }}
          >
            <div style={{ fontSize: '14px', color: '#92400e', lineHeight: 1.5, maxWidth: '480px', margin: '0 auto' }}>
              {monthlyError}
            </div>
          </div>
        )}

        {!monthlyLoading && !updatingFromServer && mRev && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

            {/* Revenue monthly card */}
            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '16px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Выручка за месяц
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
                {fmtRub(mRev.predicted_total)}
              </div>

              {/* Confidence interval */}
              {mRev.lower_total != null && mRev.upper_total != null && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280' }}>
                    <span>{fmtRub(mRev.lower_total)}</span>
                    <span>{fmtRub(mRev.upper_total)}</span>
                  </div>
                  <div style={{ position: 'relative', height: '6px', background: '#e5e7eb', borderRadius: '3px' }}>
                    <div style={{
                      position: 'absolute', height: '100%', borderRadius: '3px',
                      background: 'linear-gradient(90deg, #818cf8, #4f46e5)',
                      left: '10%', right: '10%',
                    }} />
                    <div style={{
                      position: 'absolute', top: '-3px', width: '12px', height: '12px', borderRadius: '50%',
                      background: '#4f46e5', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      left: '50%', transform: 'translateX(-50%)',
                    }} />
                  </div>
                  <div style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'center' }}>
                    Доверительный интервал
                  </div>
                </div>
              )}

              {/* Coverage + Meta */}
              <div style={{ marginTop: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  Покрытие: <span style={{ fontWeight: 600 }}>{mRev.covered_days}/{mRev.total_days} дн.</span>
                  {' '}({(mRev.coverage_ratio * 100).toFixed(0)}%)
                  {mRev.notes?.actual_days != null && (
                    <span style={{ marginLeft: '4px', color: '#9ca3af' }}>
                      ({mRev.notes.actual_days} факт + {mRev.notes.forecast_days} прогноз)
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  Модель: <span style={{ fontWeight: 600 }}>{formatModel(mRev.model_family_used)}</span>
                </div>
              </div>

              {/* Last updated */}
              <div style={{ marginTop: '8px', fontSize: '10px', color: '#9ca3af' }}>
                Обновлено: {new Date(mRev.last_updated_timestamp).toLocaleString('ru-RU')}
              </div>
            </div>

            {/* Bookings monthly card */}
            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '16px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Бронирования за месяц
              </div>
              {monthlyBookings ? (
                <>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
                    {fmt(Math.round(effectiveMonthlyTotal(monthlyBookings, bkProgress)))}
                  </div>

                  {hasMeaningfulMonthlyCi(monthlyBookings) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280' }}>
                        <span>{fmt(Math.round(monthlyBookings.lower_total!))}</span>
                        <span>{fmt(Math.round(monthlyBookings.upper_total!))}</span>
                      </div>
                      <div style={{ position: 'relative', height: '6px', background: '#e5e7eb', borderRadius: '3px' }}>
                        <div style={{
                          position: 'absolute', height: '100%', borderRadius: '3px',
                          background: 'linear-gradient(90deg, #6ee7b7, #10b981)',
                          left: '10%', right: '10%',
                        }} />
                      </div>
                      <div style={{ fontSize: '10px', color: '#9ca3af', textAlign: 'center' }}>
                        Доверительный интервал
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: '12px', fontSize: '11px', color: '#6b7280' }}>
                    Покрытие: <span style={{ fontWeight: 600 }}>{monthlyBookings.covered_days}/{monthlyBookings.total_days} дн.</span>
                    {' '}({(monthlyBookings.coverage_ratio * 100).toFixed(0)}%)
                    {monthlyBookings.coverage_ratio <= 0 && effectiveMonthlyTotal(monthlyBookings, bkProgress) > 0 && (
                      <span style={{ display: 'block', marginTop: '4px', color: '#9ca3af', fontSize: '10px' }}>
                        Итог из дневного трекера; для ДИ переобучите прогноз (train bookings)
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '10px', color: '#9ca3af' }}>
                    Модель: {formatModel(monthlyBookings.model_family_used)}
                  </div>
                </>
              ) : (
                <div style={{ color: '#9ca3af', fontSize: '13px', padding: '12px 0' }}>—</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Row 3b: Month Progress Tracker ── */}
      {(revProgress || bkProgress) && (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>
            Трекер месяца — {MONTH_NAMES[curMonth - 1]}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Revenue progress */}
            {revProgress && (
              <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '16px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                  Выручка
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9ca3af', marginBottom: '4px' }}>
                    <span>{revProgress.days_elapsed} из {revProgress.total_days} дней</span>
                    <span>{((revProgress.days_elapsed / revProgress.total_days) * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '3px',
                      background: revProgress.pace === 'ahead' ? '#10b981' : revProgress.pace === 'behind' ? '#ef4444' : '#4f46e5',
                      width: `${(revProgress.days_elapsed / revProgress.total_days) * 100}%`,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>

                {/* Actual vs predicted */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#6b7280' }}>Факт на сегодня</span>
                    <span style={{ fontWeight: 600, color: '#111827' }}>{fmtRub(revProgress.actual_so_far)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#6b7280' }}>Ожидалось к этому дню</span>
                    <span style={{ fontWeight: 600, color: '#6b7280' }}>{fmtRub(revProgress.predicted_for_elapsed_days)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#6b7280' }}>Отклонение</span>
                    <span style={{
                      fontWeight: 600,
                      color: revProgress.variance >= 0 ? '#10b981' : '#ef4444',
                    }}>
                      {revProgress.variance >= 0 ? '+' : ''}{fmtRub(revProgress.variance)}
                      {revProgress.predicted_for_elapsed_days > 0 && (
                        <span style={{ fontSize: '10px', marginLeft: '4px' }}>
                          ({revProgress.variance_pct >= 0 ? '+' : ''}{revProgress.variance_pct.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ borderTop: '1px solid #e5e7eb', margin: '12px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: '#6b7280' }}>Прогноз модели на месяц</span>
                  <span style={{ fontWeight: 600, color: '#111827' }}>{fmtRub(revProgress.snapshot_total)}</span>
                </div>

                {/* Pace badge */}
                <div style={{ marginTop: '12px' }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: '10px', fontSize: '10px', fontWeight: 600,
                    background: revProgress.pace === 'ahead' ? '#dcfce7' : revProgress.pace === 'behind' ? '#fef2f2' : '#eff6ff',
                    color: revProgress.pace === 'ahead' ? '#166534' : revProgress.pace === 'behind' ? '#991b1b' : '#1d4ed8',
                  }}>
                    {revProgress.pace === 'ahead' ? 'Опережает план' : revProgress.pace === 'behind' ? 'Отстаёт от плана' : 'По плану'}
                  </span>
                </div>
              </div>
            )}

            {/* Bookings progress */}
            {bkProgress && (
              <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '16px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                  Бронирования
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9ca3af', marginBottom: '4px' }}>
                    <span>{bkProgress.days_elapsed} из {bkProgress.total_days} дней</span>
                    <span>{((bkProgress.days_elapsed / bkProgress.total_days) * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '3px',
                      background: bkProgress.pace === 'ahead' ? '#10b981' : bkProgress.pace === 'behind' ? '#ef4444' : '#4f46e5',
                      width: `${(bkProgress.days_elapsed / bkProgress.total_days) * 100}%`,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>

                {/* Actual vs predicted */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#6b7280' }}>Факт на сегодня</span>
                    <span style={{ fontWeight: 600, color: '#111827' }}>{fmt(Math.round(bkProgress.actual_so_far))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#6b7280' }}>Ожидалось к этому дню</span>
                    <span style={{ fontWeight: 600, color: '#6b7280' }}>{fmt(Math.round(bkProgress.predicted_for_elapsed_days))}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#6b7280' }}>Отклонение</span>
                    <span style={{
                      fontWeight: 600,
                      color: bkProgress.variance >= 0 ? '#10b981' : '#ef4444',
                    }}>
                      {bkProgress.variance >= 0 ? '+' : ''}{fmt(Math.round(bkProgress.variance))}
                      {bkProgress.predicted_for_elapsed_days > 0 && (
                        <span style={{ fontSize: '10px', marginLeft: '4px' }}>
                          ({bkProgress.variance_pct >= 0 ? '+' : ''}{bkProgress.variance_pct.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ borderTop: '1px solid #e5e7eb', margin: '12px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: '#6b7280' }}>Прогноз модели на месяц</span>
                  <span style={{ fontWeight: 600, color: '#111827' }}>{fmt(Math.round(effectiveMonthlyTotal(monthlyBookings, bkProgress)))}</span>
                </div>

                {/* Pace badge */}
                <div style={{ marginTop: '12px' }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: '10px', fontSize: '10px', fontWeight: 600,
                    background: bkProgress.pace === 'ahead' ? '#dcfce7' : bkProgress.pace === 'behind' ? '#fef2f2' : '#eff6ff',
                    color: bkProgress.pace === 'ahead' ? '#166534' : bkProgress.pace === 'behind' ? '#991b1b' : '#1d4ed8',
                  }}>
                    {bkProgress.pace === 'ahead' ? 'Опережает план' : bkProgress.pace === 'behind' ? 'Отстаёт от плана' : 'По плану'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Row 3c: Daily breakdown toggle ── */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>Дневная динамика выручки</span>
          <button onClick={() => setShowDaily(v => !v)} style={{
            padding: '5px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: 500,
            cursor: 'pointer', border: '1px solid #e5e7eb',
            background: showDaily ? '#4f46e5' : '#f9fafb',
            color: showDaily ? '#fff' : '#6b7280',
            transition: 'all .15s',
          }}>
            {showDaily ? 'Скрыть' : 'Показать'}
          </button>
        </div>

        {showDaily && (
          <div style={{ marginTop: '12px' }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Динамика выручки + прогноз</span>
                {hasMl && mlForecast!.mape != null && (
                  <span style={{
                    padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600,
                    background: mlForecast!.mape < 10 ? '#dcfce7' : mlForecast!.mape < 20 ? '#fef9c3' : '#fef2f2',
                    color: mlForecast!.mape < 10 ? '#166534' : mlForecast!.mape < 20 ? '#854d0e' : '#991b1b',
                  }}>
                    MAPE {mlForecast!.mape.toFixed(1)}%
                  </span>
                )}
                {mlLoading && <span style={{ fontSize: '10px', color: '#9ca3af' }}>загрузка ML...</span>}
              </div>

              {/* View toggle */}
              <div style={{ display: 'flex', gap: '2px', background: '#f3f4f6', borderRadius: '6px', padding: '2px' }}>
                {([
                  { key: 'overlay' as ChartView, label: 'Совмещ.' },
                  { key: 'actual' as ChartView, label: 'Факт' },
                  { key: 'forecast' as ChartView, label: 'Прогноз' },
                ]).map(({ key, label }) => (
                  <button key={key} onClick={() => setChartView(key)} style={{
                    padding: '3px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 500,
                    cursor: 'pointer', border: 'none',
                    background: chartView === key ? '#fff' : 'transparent',
                    color: chartView === key ? '#111827' : '#9ca3af',
                    boxShadow: chartView === key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '10px' }}>
              {modelLabel && <>Модель: {modelLabel}</>}
              {hasMl && <> · Доверительный интервал 80%</>}
              {!hasMl && hasBuiltIn && <> · Доверительный интервал 95%</>}
              {!hasMl && !hasBuiltIn && 'Запустите сервис прогнозирования для ML-прогнозов'}
            </div>

            <LineChart series={buildChartSeries()} formatY={fmtRub} height={200} />
          </div>
        )}
      </div>

      {/* ── Row 4: Risks + Opportunities (только при достаточной истории) ── */}
      {hasEnoughHistory ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444', marginBottom: '10px' }}>Ключевые риски</div>
              {risk.risks?.length ? risk.risks.map((r: any, i: number) => <RiskCard key={i} item={r} type="risk" />) : (
                <div style={{ fontSize: '12px', color: '#10b981', padding: '12px 0' }}>
                  ✓ Критических рисков не обнаружено
                </div>
              )}
            </div>
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#10b981', marginBottom: '10px' }}>Точки роста</div>
              {risk.opportunities?.length ? risk.opportunities.map((o: any, i: number) => <RiskCard key={i} item={o} type="opportunity" />) : (
                <div style={{ fontSize: '12px', color: '#9ca3af', padding: '12px 0' }}>
                  Точки роста определяются по сравнению с предыдущим периодом
                </div>
              )}
            </div>
          </div>

          {/* ── Row 5: Prescriptive Insights ── */}
          {prescriptive?.length > 0 && (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#4f46e5', marginBottom: '10px' }}>Рекомендации</div>
              {prescriptive.map((p: any, i: number) => <PrescriptiveCard key={i} item={p} />)}
            </div>
          )}
        </>
      ) : (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            Ключевые риски, точки роста, рекомендации и аномалии считаются по всей истории ресторана (макс. год) и показываются
            через месяц после первой брони или заказа (не менее 30 дней и не менее 10 заказов).
            {historyFirstDate ? ` Первая бронь: ${historyFirstDate}. Прошло дней: ${historyDays}.` : ' Пока нет ни одной брони.'}
          </div>
        </div>
      )}

      {/* ── Row 6: Anomalies Summary (только при достаточной истории) ── */}
      {hasEnoughHistory && anomalies?.length > 0 && (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', marginBottom: '10px' }}>Аномалии ({anomalies.length})</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxHeight: '200px', overflowY: 'auto' }}>
            {anomalies.map((a: any, i: number) => (
              <div key={i} style={{
                padding: '6px 10px', borderRadius: '6px', fontSize: '11px',
                background: a.severity === 'critical' ? '#fef2f2' : '#fffbeb',
                border: `1px solid ${a.severity === 'critical' ? '#fecaca' : '#fde68a'}`,
              }}>
                <span style={{ fontWeight: 600 }}>{a.date}</span>
                {' '}{a.metric === 'revenue' ? 'выручка' : a.metric === 'bookings' ? 'брони' : 'отмены'}
                {' '}{a.direction === 'spike' ? '↑' : '↓'} {a.metric === 'cancelRate' ? pct(a.value) : fmtRub(a.value)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
