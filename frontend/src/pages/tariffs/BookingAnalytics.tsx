import { useState } from 'react'
import { AnalyticsProvider, useAnalytics } from './analytics/AnalyticsContext'
import ExecutiveLayer from './analytics/ExecutiveLayer'
import PerformanceLayer from './analytics/PerformanceLayer'
import DeepAnalysisLayer from './analytics/DeepAnalysisLayer'
import {
  createWorkbook, saveWorkbook, addBarChartSheet,
  addPieChartSheet, addTableSheet, addGroupedKpiSheet,
  addCohortSheet, addTextListSheet,
} from '../../utils/excelCharts'
import { forecastService, type MonthlyForecastResponse, type MonthProgressResponse } from '../../api/services'
import { fmt, fmtRubFull, pct } from './analytics/utils/analytics'
import './BookingAnalytics.css'

// ═══════════════════════════════════════════════════
// Enterprise Decision Dashboard — Main Shell
// 3-Layer Architecture: Executive → Performance → Deep Analysis
// ═══════════════════════════════════════════════════

const LAYERS = [
  { key: 'executive' as const, label: 'Executive', icon: '🎯', desc: 'Здоровье бизнеса' },
  { key: 'performance' as const, label: 'Performance', icon: '📊', desc: 'Детальная аналитика' },
  { key: 'analysis' as const, label: 'Deep Analysis', icon: '🔬', desc: 'Глубокий анализ' },
]

const MONTH_NAMES_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']
const DOW_RU_MAP: Record<string, string> = { MONDAY: 'Пн', TUESDAY: 'Вт', WEDNESDAY: 'Ср', THURSDAY: 'Чт', FRIDAY: 'Пт', SATURDAY: 'Сб', SUNDAY: 'Вс' }

function formatModelName(family: string): string {
  if (family?.includes('ensemble')) return 'Ансамбль'
  if (family === 'sarima') return 'SARIMA'
  if (family === 'prophet') return 'Prophet'
  return family || '—'
}

async function loadForecastDataForExport() {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth() + 1
  const safe = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null)
  try {
    const [rev, bk, revProgress, bkProgress, revDaily, bkDaily, revVsActual, bkVsActual, revAccuracy, bkAccuracy] = await Promise.all([
      safe(forecastService.getMonthlyForecast('revenue', y, m)),
      safe(forecastService.getMonthlyForecast('bookings', y, m, { breakdown: 'activity' })),
      safe(forecastService.getMonthProgress('revenue', y, m)),
      safe(forecastService.getMonthProgress('bookings', y, m)),
      safe(forecastService.getForecast('revenue', 31)),
      safe(forecastService.getForecast('bookings', 31)),
      safe(forecastService.getVsActual('revenue')),
      safe(forecastService.getVsActual('bookings')),
      safe(forecastService.getAccuracy('revenue')),
      safe(forecastService.getAccuracy('bookings')),
    ])
    return {
      revenue: (rev as any)?.error ? null : rev as MonthlyForecastResponse | null,
      bookings: (bk as any)?.error ? null : bk as MonthlyForecastResponse | null,
      revProgress: (revProgress as any)?.error ? null : revProgress as MonthProgressResponse | null,
      bkProgress: (bkProgress as any)?.error ? null : bkProgress as MonthProgressResponse | null,
      revDaily: revDaily as any, bkDaily: bkDaily as any,
      revVsActual: revVsActual as any, bkVsActual: bkVsActual as any,
      revAccuracy: revAccuracy as any, bkAccuracy: bkAccuracy as any,
    }
  } catch {
    return { revenue: null, bookings: null, revProgress: null, bkProgress: null,
             revDaily: null, bkDaily: null, revVsActual: null, bkVsActual: null,
             revAccuracy: null, bkAccuracy: null }
  }
}

function DashboardContent() {
  const {
    dateFrom, dateTo, data, loading, error, warning, lastLoaded, layer,
    setLayer, handleDateChange, loadData,
  } = useAnalytics()
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    if (!data) return
    setExporting(true)
    try {
      const wb = createWorkbook()
      const { volume, revenue, conversion, capacity, trends, riskIndex,
              unitEconomics, rfm, tariffs, heatmap, cohort, stopCheck, notifications,
              prescriptive, anomalies } = data

      const fc = await loadForecastDataForExport()
      const mRev = fc.revenue
      const mBk = fc.bookings
      const hasUE = unitEconomics && typeof unitEconomics === 'object' && Object.keys(unitEconomics).length > 0
      const risk = riskIndex && typeof riskIndex === 'object' && Object.keys(riskIndex).length > 0
        ? riskIndex : { score: 0, level: 'healthy', risks: [], opportunities: [] }

      // ═══ Sheet 1: Executive KPIs ═══
      addGroupedKpiSheet(wb, 'Executive KPIs', [
        { title: 'Ключевые показатели', kpis: [
          { label: 'Выручка за период', value: fmtRubFull(revenue?.total) },
          { label: 'Бронирований всего', value: fmt(volume?.total) },
          { label: 'Оплачено', value: fmt(volume?.byStatus?.PAID) },
          { label: 'Отменено', value: fmt(volume?.byStatus?.CANCELLED) },
          { label: 'Средний чек', value: fmtRubFull(revenue?.average) },
          { label: 'Медиана чека', value: fmtRubFull(revenue?.median) },
          { label: 'Индекс риска', value: `${risk.score}/100 (${risk.level})` },
        ]},
        { title: 'Операционные метрики', kpis: [
          { label: 'Отмены %', value: pct(conversion?.cancelRate), color: conversion?.cancelRate > 20 ? 'red' : undefined },
          { label: 'Удержание %', value: pct(conversion?.retentionRate), color: 'green' },
          { label: 'Простой %', value: pct(capacity?.idleCoefficient), color: capacity?.idleCoefficient > 50 ? 'orange' : undefined },
          { label: 'RevPAH (₽/час ресурса)', value: hasUE ? fmtRubFull(unitEconomics.revenuePerHour) : '—' },
          { label: 'LTV (₽/клиент)', value: hasUE ? fmtRubFull(unitEconomics.revenuePerClient) : '—' },
          { label: '₽/мин тариф', value: tariffs?.avgRatePerMinute ? fmtRubFull(tariffs.avgRatePerMinute) : '—' },
          { label: 'Скидки (% от выручки)', value: tariffs?.totalDiscounts > 0 ? `${pct(tariffs.discountPercentOfRevenue)} (${fmtRubFull(tariffs.totalDiscounts)})` : 'Нет скидок' },
        ]},
        { title: 'Клиентская база', kpis: [
          { label: 'Уникальных клиентов', value: fmt(conversion?.uniqueClients) },
          { label: 'Повторных клиентов', value: fmt(conversion?.repeatClients) },
          { label: 'Конверсия → оплата', value: pct(conversion?.paymentConversionPct) },
          { label: 'Воронка: всего', value: fmt(conversion?.funnel?.total ?? volume?.total) },
          { label: 'Воронка: подтверждённые', value: fmt(conversion?.funnel?.confirmed) },
          { label: 'Воронка: оплаченные', value: fmt(conversion?.funnel?.paid) },
        ]},
      ])

      // ═══ Sheet 2: Monthly Forecast ═══
      if (mRev || mBk) {
        const forecastKpis: { title: string; kpis: { label: string; value: string | number }[] }[] = []
        if (mRev) {
          const mn = MONTH_NAMES_SHORT[mRev.month - 1]
          forecastKpis.push({ title: `Прогноз выручки — ${mn} ${mRev.year}`, kpis: [
            { label: 'Прогноз', value: fmtRubFull(mRev.predicted_total) },
            { label: 'Нижняя граница (CI)', value: mRev.lower_total != null ? fmtRubFull(mRev.lower_total) : '—' },
            { label: 'Верхняя граница (CI)', value: mRev.upper_total != null ? fmtRubFull(mRev.upper_total) : '—' },
            { label: 'Покрытие', value: `${mRev.covered_days}/${mRev.total_days} дн. (${(mRev.coverage_ratio * 100).toFixed(0)}%)` },
            { label: 'Статус', value: mRev.status === 'full' ? 'Полный месяц' : mRev.status === 'partial' ? 'Частичные данные' : 'Нет данных' },
            { label: 'Модель', value: formatModelName(mRev.model_family_used) },
            { label: 'Обновлено', value: new Date(mRev.last_updated_timestamp).toLocaleString('ru-RU') },
          ]})
        }
        if (mBk) {
          const mn = MONTH_NAMES_SHORT[mBk.month - 1]
          const bkKpis: { label: string; value: string | number }[] = [
            { label: 'Прогноз', value: fmt(Math.round(mBk.predicted_total)) },
            { label: 'Нижняя граница (CI)', value: mBk.lower_total != null ? fmt(Math.round(mBk.lower_total)) : '—' },
            { label: 'Верхняя граница (CI)', value: mBk.upper_total != null ? fmt(Math.round(mBk.upper_total)) : '—' },
            { label: 'Покрытие', value: `${mBk.covered_days}/${mBk.total_days} дн. (${(mBk.coverage_ratio * 100).toFixed(0)}%)` },
            { label: 'Модель', value: formatModelName(mBk.model_family_used) },
          ]
          if (mBk.by_activity?.length) {
            mBk.by_activity.forEach(a => {
              bkKpis.push({ label: `  — ${a.segment_name}`, value: fmt(Math.round(a.predicted_total)) })
            })
          }
          forecastKpis.push({ title: `Прогноз бронирований — ${mn} ${mBk.year}`, kpis: bkKpis })
        }
        addGroupedKpiSheet(wb, 'Месячный прогноз', forecastKpis)
      }

      // ═══ Sheet 3: Month Tracker ═══
      if (fc.revProgress || fc.bkProgress) {
        const trackerKpis: { title: string; kpis: { label: string; value: string | number }[] }[] = []
        if (fc.revProgress) {
          const rp = fc.revProgress
          trackerKpis.push({ title: 'Трекер выручки', kpis: [
            { label: 'Прошло дней', value: `${rp.days_elapsed} из ${rp.total_days}` },
            { label: 'Факт на сегодня', value: fmtRubFull(rp.actual_so_far) },
            { label: 'Ожидалось к этому дню', value: fmtRubFull(rp.predicted_for_elapsed_days) },
            { label: 'Отклонение', value: `${rp.variance >= 0 ? '+' : ''}${fmtRubFull(rp.variance)} (${rp.variance_pct >= 0 ? '+' : ''}${rp.variance_pct.toFixed(1)}%)` },
            { label: 'Прогноз модели на месяц', value: fmtRubFull(rp.snapshot_total) },
            { label: 'Темп', value: rp.pace === 'ahead' ? 'Опережает' : rp.pace === 'behind' ? 'Отстаёт' : 'По плану' },
          ]})
        }
        if (fc.bkProgress) {
          const bp = fc.bkProgress
          trackerKpis.push({ title: 'Трекер бронирований', kpis: [
            { label: 'Прошло дней', value: `${bp.days_elapsed} из ${bp.total_days}` },
            { label: 'Факт на сегодня', value: fmt(Math.round(bp.actual_so_far)) },
            { label: 'Ожидалось к этому дню', value: fmt(Math.round(bp.predicted_for_elapsed_days)) },
            { label: 'Отклонение', value: `${bp.variance >= 0 ? '+' : ''}${fmt(Math.round(bp.variance))} (${bp.variance_pct >= 0 ? '+' : ''}${bp.variance_pct.toFixed(1)}%)` },
            { label: 'Прогноз модели на месяц', value: fmt(Math.round(bp.snapshot_total)) },
            { label: 'Темп', value: bp.pace === 'ahead' ? 'Опережает' : bp.pace === 'behind' ? 'Отстаёт' : 'По плану' },
          ]})
        }
        addGroupedKpiSheet(wb, 'Трекер месяца', trackerKpis)
      }

      // ═══ Sheet 4: Risks, Opportunities, Recommendations ═══
      const textSections: { title: string; items: string[] }[] = []
      if (risk.risks?.length) {
        textSections.push({ title: 'Ключевые риски', items: risk.risks.map((r: any) =>
          `[${r.severity || 'warning'}] ${r.title || r.message || JSON.stringify(r)}`)
        })
      }
      if (risk.opportunities?.length) {
        textSections.push({ title: 'Точки роста', items: risk.opportunities.map((o: any) =>
          o.title || o.message || JSON.stringify(o))
        })
      }
      if (prescriptive?.length) {
        textSections.push({ title: 'Рекомендации', items: prescriptive.map((p: any) =>
          `${p.title || ''}: ${p.description || p.action || JSON.stringify(p)}`.trim())
        })
      }
      if (anomalies?.length) {
        textSections.push({ title: 'Аномалии', items: anomalies.map((a: any) =>
          `${a.date} | ${a.metric === 'revenue' ? 'выручка' : a.metric === 'bookings' ? 'брони' : 'отмены'} ${a.direction === 'spike' ? '↑' : '↓'} ${a.value}`)
        })
      }
      if (textSections.length) {
        addTextListSheet(wb, 'Риски и рекомендации', textSections)
      }

      // ═══ Sheet 4: Volume by Activity ═══
      if (volume?.byActivity && Object.keys(volume.byActivity).length) {
        await addBarChartSheet(wb, 'Спрос — по активностям', volume.byActivity as Record<string, number>, {
          title: 'Бронирования по активностям', headerLabel: 'Активность', headerValue: 'Бронирований',
        })
      }

      // ═══ Sheet 5: Volume by Month + MoM ═══
      if (volume?.byMonth && Object.keys(volume.byMonth).length) {
        const byMonth = volume.byMonth as Record<string, number>
        const mom = volume?.growth?.mom || {}
        const headers = ['Месяц', 'Бронирований', 'MoM рост %']
        const rows = Object.keys(byMonth).sort().map(k => [
          k, byMonth[k], mom[k] != null ? `${(mom[k] as number) > 0 ? '+' : ''}${(mom[k] as number).toFixed(1)}%` : '—'
        ])
        addTableSheet(wb, 'Спрос — по месяцам', headers, rows, { columnWidths: [16, 16, 14] })
      }

      // ═══ Sheet 6: Revenue by Activity ═══
      if (revenue?.byActivity && Object.keys(revenue.byActivity).length) {
        await addBarChartSheet(wb, 'Выручка по активностям', revenue.byActivity as Record<string, number>, {
          title: 'Выручка по активностям', headerLabel: 'Активность', headerValue: 'Выручка ₽',
          valueFormatter: (n: number) => fmtRubFull(n),
        })
      }

      // ═══ Sheet 7: Revenue by Day Type + Hour ═══
      {
        const revByDayType = tariffs?.revenueByDayType || {}
        const booksByDayType = tariffs?.bookingsByDayType || {}
        const avgCheckByDayType = tariffs?.avgCheckByDayType || {}
        const byHour = revenue?.byHour || {}
        const rows1 = [
          ['Будни', revByDayType.WEEKDAY, booksByDayType.WEEKDAY, avgCheckByDayType.WEEKDAY],
          ['Выходные', revByDayType.WEEKEND, booksByDayType.WEEKEND, avgCheckByDayType.WEEKEND],
          ['Праздники', revByDayType.HOLIDAY, booksByDayType.HOLIDAY, avgCheckByDayType.HOLIDAY],
        ].filter(r => r[1] != null)
        if (rows1.length) {
          addTableSheet(wb, 'Выручка по типу дня', ['Тип дня', 'Выручка', 'Бронирований', 'Ср. чек'], rows1,
            { columnWidths: [16, 16, 16, 14] })
        }
        if (Object.keys(byHour).length) {
          const hourData: Record<string, number> = {}
          Object.entries(byHour).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([h, v]) => {
            hourData[`${h}:00`] = v as number
          })
          await addBarChartSheet(wb, 'Выручка по часам', hourData, {
            title: 'Выручка по часам', headerLabel: 'Час', headerValue: 'Выручка ₽',
            valueFormatter: (n: number) => fmtRubFull(n),
          })
        }
      }

      // ═══ Sheet 8: Unit Economics by Activity ═══
      if (hasUE && unitEconomics.byActivity && Object.keys(unitEconomics.byActivity).length) {
        const headers = ['Активность', 'Выручка', 'Часы', 'RevPAH', 'Брони']
        const rows = Object.entries(unitEconomics.byActivity).map(([name, v]: [string, any]) =>
          [name, v.revenue, v.hours?.toFixed(0), v.revpah, v.bookings]
        )
        addTableSheet(wb, 'Unit Economics', headers, rows, { columnWidths: [24, 16, 10, 16, 10] })
      }

      // ═══ Sheet 9: Tariffs ═══
      {
        const avgByTariff = tariffs?.avgCheckByTariffPlan || {}
        if (Object.keys(avgByTariff).length) {
          await addBarChartSheet(wb, 'Ср чек по тарифам', avgByTariff as Record<string, number>, {
            title: 'Средний чек по тарифному плану', headerLabel: 'Тариф', headerValue: 'Ср. чек ₽',
            valueFormatter: (n: number) => fmtRubFull(n),
          })
        }
        const amtDist = tariffs?.amountDistribution || {}
        if (Object.keys(amtDist).length) {
          const order = ['0', '1-500', '501-1000', '1001-2000', '2001-5000', '5001+']
          const distData: Record<string, number> = {}
          order.filter(k => amtDist[k] != null).forEach(k => { distData[k] = amtDist[k] })
          await addBarChartSheet(wb, 'Распределение сумм', distData, {
            title: 'Распределение сумм бронирований', headerLabel: 'Диапазон ₽', headerValue: 'Кол-во',
          })
        }
      }

      // ═══ Sheet 10: Conversion by Activity ═══
      if (conversion?.conversionByActivity && Object.keys(conversion.conversionByActivity).length) {
        const headers = ['Активность', 'Всего', 'Оплачено', 'Конверсия %', 'Отмены %']
        const rows = Object.entries(conversion.conversionByActivity).map(([name, v]: [string, any]) =>
          [name, v.total, v.paid, v.conversionPct?.toFixed(1), v.cancelPct?.toFixed(1)]
        )
        addTableSheet(wb, 'Конверсия по активностям', headers, rows, { columnWidths: [24, 10, 12, 14, 12] })
      }

      // ═══ Sheet 11: RFM Segments ═══
      if (rfm?.segments && Object.keys(rfm.segments).length) {
        await addPieChartSheet(wb, 'RFM сегменты', rfm.segments as Record<string, number>, {
          title: 'RFM-сегментация клиентов', headerLabel: 'Сегмент', headerValue: 'Клиентов',
        })
      }

      // ═══ Sheet 12: RFM Client Table ═══
      if (rfm?.clients?.length) {
        addTableSheet(wb, 'RFM клиенты', ['Клиент', 'Сегмент', 'R (дни)', 'F (визиты)', 'M (₽)', 'R⭐', 'F⭐', 'M⭐'],
          rfm.clients.map((c: any) => [c.client, c.segment, c.recency, c.frequency, c.monetary, c.rScore, c.fScore, c.mScore]),
          { columnWidths: [22, 16, 10, 12, 14, 6, 6, 6] })
      }

      // ═══ Sheet 13: Cohort Retention (weekly) ═══
      {
        const wm = cohort?.weeklyMatrix || {}
        const ws = cohort?.weeklySizes || {}
        if (Object.keys(wm).length) {
          addCohortSheet(wb, 'Когорты (недели)', wm, ws, 'W')
        }
        const mm = cohort?.matrix || {}
        const ms = cohort?.cohortSizes || {}
        if (Object.keys(mm).length) {
          addCohortSheet(wb, 'Когорты (месяцы)', mm, ms, 'M')
        }
      }

      // ═══ Sheet 14: Clients LTV ═══
      if (conversion?.clientLtv && Object.keys(conversion.clientLtv).length) {
        const cancelsByClient = conversion?.cancelsByClient || {}
        const visitFreq = conversion?.visitFrequency || {}
        const headers = ['Клиент', 'Выручка', 'Визиты', 'Ср. чек', 'Отмены', 'Дн. между визитами']
        const rows = Object.entries(conversion.clientLtv)
          .map(([name, v]: [string, any]) => [
            name, v.totalRevenue, v.visits, v.avgCheck,
            cancelsByClient[name] || 0,
            visitFreq[name] != null ? (visitFreq[name] as number).toFixed(0) : '—',
          ])
          .sort((a, b) => (b[1] as number) - (a[1] as number))
        addTableSheet(wb, 'Клиенты LTV', headers, rows, { columnWidths: [24, 14, 10, 14, 10, 16] })
      }

      // ═══ Sheet 15: Daily Breakdown ═══
      {
        const byDay = volume?.byDay || {}
        const dailyRevenue = trends?.dailyRevenue || {}
        const dates = [...new Set([...Object.keys(byDay), ...Object.keys(dailyRevenue)])].sort()
        if (dates.length) {
          addTableSheet(wb, 'По дням', ['Дата', 'Бронирований', 'Выручка ₽'],
            dates.map(d => [d, byDay[d] || 0, dailyRevenue[d] || 0]),
            { columnWidths: [14, 16, 16] })
        }
      }

      // ═══ Sheet 16: Capacity & Utilization ═══
      {
        const util = capacity?.activityUtilization || {}
        if (Object.keys(util).length) {
          addTableSheet(wb, 'Загрузка по активностям',
            ['Активность', 'Занято (ч)', 'Возможно (ч)', 'Загрузка %', 'Бронирований'],
            Object.entries(util).map(([name, v]: [string, any]) => [
              name, v.bookedHours?.toFixed(1), v.possibleHours?.toFixed(1), v.utilization?.toFixed(1), v.bookingCount,
            ]),
            { columnWidths: [24, 14, 14, 12, 14] })
        }
        const peakHours = capacity?.peakHours || {}
        if (Object.keys(peakHours).length) {
          const phData: Record<string, number> = {}
          Object.entries(peakHours).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([h, v]) => {
            phData[`${h}:00`] = v as number
          })
          await addBarChartSheet(wb, 'Пиковые часы', phData, { title: 'Пиковые часы загрузки' })
        }
        const peakDays = capacity?.peakDays || {}
        if (Object.keys(peakDays).length) {
          const pdData: Record<string, number> = {}
          Object.entries(peakDays).forEach(([k, v]) => { pdData[DOW_RU_MAP[k] || k] = v as number })
          await addBarChartSheet(wb, 'Пиковые дни', pdData, { title: 'Пиковые дни загрузки' })
        }
      }

      // ═══ Sheet 17: Stop-Check ═══
      if (stopCheck?.triggerCount > 0) {
        addGroupedKpiSheet(wb, 'Стоп-чек', [
          { title: 'Стоп-чек аналитика', kpis: [
            { label: 'Всего срабатываний', value: fmt(stopCheck.triggerCount) },
            { label: 'Полных (бесплатно)', value: fmt(stopCheck.fullyFreeCount) },
            { label: 'Частичных', value: fmt(stopCheck.partiallyFreeCount) },
            { label: 'Ср. сумма до стопа', value: fmtRubFull(stopCheck.avgAmountBeforeStopCheck) },
            { label: 'Потери от стоп-чека', value: fmtRubFull(stopCheck.lostRevenueDueToStopCheck) },
          ]},
        ])
      }

      // ═══ Sheet 18: Notifications ═══
      if (notifications?.total > 0) {
        const byType = notifications.byType || {}
        const kpiGroup: { label: string; value: string | number }[] = [
          { label: 'Всего уведомлений', value: fmt(notifications.total) },
          { label: 'Ожидают', value: fmt(notifications.pending) },
          { label: 'Решено', value: fmt(notifications.resolved) },
          { label: 'Ср. реакция (мин)', value: fmt(notifications.avgReactionMinutes) },
        ]
        Object.entries(byType).forEach(([type, cnt]) => {
          kpiGroup.push({ label: `  Тип: ${type}`, value: fmt(cnt as number) })
        })
        kpiGroup.push(
          { label: 'REMINDER → Подтверждено', value: `${fmt(notifications.reminderConfirmed)}/${fmt(notifications.reminderTotal)} (${pct(notifications.reminderConfirmedPct)})` },
          { label: 'OVERDUE → Оплачено', value: `${fmt(notifications.overduePaid)}/${fmt(notifications.overdueTotal)} (${pct(notifications.overduePaidPct)})` },
        )
        addGroupedKpiSheet(wb, 'Уведомления', [{ title: 'Уведомления', kpis: kpiGroup }])

        const overdueByClient = notifications.overdueByClient || {}
        if (Object.keys(overdueByClient).length) {
          await addBarChartSheet(wb, 'Просрочки по клиентам', overdueByClient as Record<string, number>, {
            title: 'Просрочки по клиентам',
          })
        }
      }

      // ═══ Sheet 19: Heatmap data as table ═══
      if (heatmap?.bookings) {
        const hm = heatmap.bookings as Record<string, Record<string, number>>
        const hours = [...new Set(Object.values(hm).flatMap((v: any) => Object.keys(v)))].sort((a, b) => Number(a) - Number(b))
        const days = Object.keys(hm)
        if (hours.length && days.length) {
          const headers = ['День / Час', ...hours.map(h => `${h}:00`)]
          const rows = days.map(day => [DOW_RU_MAP[day] || day, ...hours.map(h => (hm[day] as any)?.[h] ?? 0)])
          addTableSheet(wb, 'Тепловая карта', headers, rows, { columnWidths: [12, ...hours.map(() => 8)] })
        }
      }

      // ═══ Sheet 20: Daily Forecast Overlay ═══
      if (fc.revDaily?.forecast?.length) {
        const rd = fc.revDaily
        const headers = ['Дата', 'Прогноз ₽', 'Нижняя граница', 'Верхняя граница']
        const rows = rd.forecast.map((d: string, i: number) => [
          d, rd.values?.[i]?.toFixed(0), rd.lower_bound?.[i]?.toFixed(0), rd.upper_bound?.[i]?.toFixed(0),
        ])
        addTableSheet(wb, 'Прогноз выручки (дни)', headers, rows, { columnWidths: [14, 16, 16, 16] })
      }
      if (fc.bkDaily?.forecast?.length) {
        const bd = fc.bkDaily
        const headers = ['Дата', 'Прогноз', 'Нижняя граница', 'Верхняя граница']
        const rows = bd.forecast.map((d: string, i: number) => [
          d, bd.values?.[i]?.toFixed(0), bd.lower_bound?.[i]?.toFixed(0), bd.upper_bound?.[i]?.toFixed(0),
        ])
        addTableSheet(wb, 'Прогноз брони (дни)', headers, rows, { columnWidths: [14, 12, 14, 14] })
      }

      // ═══ Sheet 21: Forecast vs Actual ═══
      if (fc.revVsActual?.dates?.length) {
        const va = fc.revVsActual
        const headers = ['Дата', 'Факт ₽', 'Прогноз ₽', 'Нижняя граница', 'Верхняя граница', 'Отклонение ₽', 'Отклонение %']
        const rows = va.dates.map((d: string, i: number) => {
          const actual = va.actual[i], pred = va.forecast[i]
          const dev = actual - pred
          const devPct = pred !== 0 ? ((dev / pred) * 100).toFixed(1) : '—'
          return [d, actual?.toFixed(0), pred?.toFixed(0), va.lower?.[i]?.toFixed(0), va.upper?.[i]?.toFixed(0), dev?.toFixed(0), devPct]
        })
        addTableSheet(wb, 'Факт vs Прогноз (выручка)', headers, rows, { columnWidths: [14, 14, 14, 14, 14, 14, 12] })
      }
      if (fc.bkVsActual?.dates?.length) {
        const va = fc.bkVsActual
        const headers = ['Дата', 'Факт', 'Прогноз', 'Отклонение', 'Отклонение %']
        const rows = va.dates.map((d: string, i: number) => {
          const actual = va.actual[i], pred = va.forecast[i]
          const dev = actual - pred
          const devPct = pred !== 0 ? ((dev / pred) * 100).toFixed(1) : '—'
          return [d, actual?.toFixed(0), pred?.toFixed(0), dev?.toFixed(0), devPct]
        })
        addTableSheet(wb, 'Факт vs Прогноз (брони)', headers, rows, { columnWidths: [14, 10, 10, 12, 12] })
      }

      // ═══ Sheet 22: Model Diagnostics ═══
      {
        const diagKpis: { title: string; kpis: { label: string; value: string | number }[] }[] = []
        if (fc.revAccuracy) {
          const a = fc.revAccuracy
          diagKpis.push({ title: 'Точность модели — Выручка', kpis: [
            { label: 'MAPE', value: a.mape != null ? `${a.mape.toFixed(2)}%` : '—' },
            { label: 'MAE', value: a.mae != null ? fmtRubFull(a.mae) : '—' },
            { label: 'RMSE', value: a.rmse != null ? fmtRubFull(a.rmse) : '—' },
            { label: 'Статус', value: a.status || '—' },
            { label: 'Сравнено дней', value: a.n_compared || '—' },
          ]})
        }
        if (fc.bkAccuracy) {
          const a = fc.bkAccuracy
          diagKpis.push({ title: 'Точность модели — Бронирования', kpis: [
            { label: 'MAPE', value: a.mape != null ? `${a.mape.toFixed(2)}%` : '—' },
            { label: 'MAE', value: a.mae != null ? a.mae.toFixed(2) : '—' },
            { label: 'RMSE', value: a.rmse != null ? a.rmse.toFixed(2) : '—' },
            { label: 'Статус', value: a.status || '—' },
            { label: 'Сравнено дней', value: a.n_compared || '—' },
          ]})
        }
        if (fc.revDaily) {
          diagKpis.push({ title: 'Модель — Выручка', kpis: [
            { label: 'Семейство', value: formatModelName(fc.revDaily.model_family || fc.revDaily.model) },
            { label: 'Модель', value: fc.revDaily.model || '—' },
            { label: 'Трансформация', value: fc.revDaily.transform || '—' },
            { label: 'MAPE (backtest)', value: fc.revDaily.mape != null ? `${fc.revDaily.mape.toFixed(2)}%` : '—' },
            { label: 'Горизонт', value: `${fc.revDaily.horizon || '—'} дн.` },
            { label: 'Параметры', value: fc.revDaily.params ? JSON.stringify(fc.revDaily.params) : '—' },
          ]})
        }
        if (fc.bkDaily) {
          diagKpis.push({ title: 'Модель — Бронирования', kpis: [
            { label: 'Семейство', value: formatModelName(fc.bkDaily.model_family || fc.bkDaily.model) },
            { label: 'Модель', value: fc.bkDaily.model || '—' },
            { label: 'Трансформация', value: fc.bkDaily.transform || '—' },
            { label: 'MAPE (backtest)', value: fc.bkDaily.mape != null ? `${fc.bkDaily.mape.toFixed(2)}%` : '—' },
            { label: 'Горизонт', value: `${fc.bkDaily.horizon || '—'} дн.` },
            { label: 'Параметры', value: fc.bkDaily.params ? JSON.stringify(fc.bkDaily.params) : '—' },
          ]})
        }
        if (diagKpis.length) addGroupedKpiSheet(wb, 'Диагностика модели', diagKpis)
      }

      // ═══ Sheet 23: Weekly Aggregation ═══
      {
        const byDay = volume?.byDay || {}
        const dailyRevenue = trends?.dailyRevenue || {}
        const allDates = [...new Set([...Object.keys(byDay), ...Object.keys(dailyRevenue)])].sort()
        if (allDates.length > 7) {
          const weeks: Record<string, { bookings: number; revenue: number; days: number }> = {}
          allDates.forEach(d => {
            const dt = new Date(d)
            const weekStart = new Date(dt)
            weekStart.setDate(dt.getDate() - dt.getDay() + 1)
            const wk = weekStart.toISOString().slice(0, 10)
            if (!weeks[wk]) weeks[wk] = { bookings: 0, revenue: 0, days: 0 }
            weeks[wk].bookings += (byDay[d] || 0)
            weeks[wk].revenue += (dailyRevenue[d] || 0)
            weeks[wk].days++
          })
          addTableSheet(wb, 'По неделям',
            ['Неделя с', 'Бронирований', 'Выручка ₽', 'Ср. выручка/день', 'Дней'],
            Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b)).map(([wk, v]) => [
              wk, v.bookings, v.revenue.toFixed(0), (v.revenue / v.days).toFixed(0), v.days,
            ]),
            { columnWidths: [14, 14, 16, 16, 8] })
        }
      }

      // ═══ Sheet 24: Revenue Concentration & Strategic ═══
      {
        const stratKpis: { label: string; value: string | number }[] = []
        if (conversion?.clientLtv && Object.keys(conversion.clientLtv).length) {
          const clients = Object.entries(conversion.clientLtv)
            .map(([, v]: [string, any]) => v.totalRevenue as number)
            .sort((a, b) => b - a)
          const totalRev = clients.reduce((s, v) => s + v, 0)
          const top10pct = Math.max(1, Math.ceil(clients.length * 0.1))
          const top10rev = clients.slice(0, top10pct).reduce((s, v) => s + v, 0)
          stratKpis.push({ label: 'Всего клиентов', value: clients.length })
          stratKpis.push({ label: 'Топ-10% клиентов', value: top10pct })
          stratKpis.push({ label: 'Доля выручки топ-10%', value: totalRev > 0 ? `${((top10rev / totalRev) * 100).toFixed(1)}%` : '—' })
          stratKpis.push({ label: 'Выручка топ-10%', value: fmtRubFull(top10rev) })
        }
        if (risk.score != null) {
          stratKpis.push({ label: 'Индекс риска', value: `${risk.score}/100` })
          stratKpis.push({ label: 'Уровень', value: risk.level })
        }
        if (risk.risks?.length) {
          risk.risks.forEach((r: any, i: number) => {
            stratKpis.push({ label: `Риск ${i + 1}`, value: r.title || r.message || JSON.stringify(r) })
          })
        }
        if (risk.opportunities?.length) {
          risk.opportunities.forEach((o: any, i: number) => {
            stratKpis.push({ label: `Возможность ${i + 1}`, value: o.title || o.message || JSON.stringify(o) })
          })
        }
        if (capacity?.avgGap != null) stratKpis.push({ label: 'Ср. промежуток между бронями (мин)', value: capacity.avgGap.toFixed(0) })
        if (capacity?.lostRevenue != null) stratKpis.push({ label: 'Потерянная выручка (простой)', value: fmtRubFull(capacity.lostRevenue) })

        if (stratKpis.length) addGroupedKpiSheet(wb, 'Стратегия', [{ title: 'Стратегические показатели', kpis: stratKpis }])
      }

      await saveWorkbook(wb, `analytics_${dateFrom}_${dateTo}.xlsx`)
    } catch (e) {
      console.error('Export failed', e)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="analytics-dashboard">
      {/* ── Header ── */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Decision Dashboard</h1>
          <p className="dashboard-subtitle">Аналитика бронирований</p>
        </div>
        <div className="dashboard-controls">
          <div className="date-controls">
            <label className="date-label">С</label>
            <input type="date" className="date-input" value={dateFrom} onChange={e => handleDateChange('from', e.target.value)} />
            <label className="date-label">По</label>
            <input type="date" className="date-input" value={dateTo} onChange={e => handleDateChange('to', e.target.value)} />
            <button className="refresh-btn" onClick={() => loadData()} disabled={loading}>
              {loading ? '⏳' : '↻'}
            </button>
          </div>
          {lastLoaded && <span className="last-loaded">Обновлено: {lastLoaded}</span>}
          {data && <button className="export-btn" onClick={handleExport} disabled={exporting}>
            {exporting ? '⏳ Экспорт...' : '📥 Excel'}
          </button>}
        </div>
      </div>

      {/* ── Alerts ── */}
      {warning && <div className="alert alert-warning">{warning}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* ── Layer Selector ── */}
      <div className="layer-selector">
        {LAYERS.map(l => (
          <button key={l.key} className={`layer-btn ${layer === l.key ? 'active' : ''}`} onClick={() => setLayer(l.key)}>
            <span className="layer-icon">{l.icon}</span>
            <span className="layer-label">{l.label}</span>
            <span className="layer-desc">{l.desc}</span>
          </button>
        ))}
      </div>

      {/* ── Loading ── */}
      {loading && !data && (
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>Загрузка аналитики...</p>
        </div>
      )}

      {/* ── Layers ── */}
      {data && (
        <div className={`layer-content ${loading ? 'layer-loading' : ''}`}>
          {layer === 'executive' && <ExecutiveLayer />}
          {layer === 'performance' && <PerformanceLayer />}
          {layer === 'analysis' && <DeepAnalysisLayer />}
        </div>
      )}
    </div>
  )
}

export default function BookingAnalytics() {
  return (
    <AnalyticsProvider>
      <DashboardContent />
    </AnalyticsProvider>
  )
}
