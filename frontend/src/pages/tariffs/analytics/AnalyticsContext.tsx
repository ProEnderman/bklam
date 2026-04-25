import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { bookingAnalyticsService } from '../../../api/services'
import { fmtDate } from './utils/analytics'

// ═══════════════════════════════════════════════════
// Global Analytics Context — shared filter + data state
// ═══════════════════════════════════════════════════

interface AnalyticsState {
  dateFrom: string
  dateTo: string
  data: any | null
  loading: boolean
  error: string | null
  warning: string | null
  lastLoaded: string
  activityFilter: string | null
  clientFilter: string | null
  comparisonMode: 'none' | 'previous' | 'target'
  layer: 'executive' | 'performance' | 'analysis'
  performanceModule: 'demand' | 'monetization' | 'customer' | 'capacity'
}

interface AnalyticsActions {
  setDateFrom: (v: string) => void
  setDateTo: (v: string) => void
  setActivityFilter: (v: string | null) => void
  setClientFilter: (v: string | null) => void
  setComparisonMode: (v: 'none' | 'previous' | 'target') => void
  setLayer: (v: 'executive' | 'performance' | 'analysis') => void
  setPerformanceModule: (v: 'demand' | 'monetization' | 'customer' | 'capacity') => void
  loadData: () => Promise<void>
  handleDateChange: (which: 'from' | 'to', raw: string) => void
}

type Ctx = AnalyticsState & AnalyticsActions

const AnalyticsContext = createContext<Ctx | null>(null)

export function useAnalytics(): Ctx {
  const ctx = useContext(AnalyticsContext)
  if (!ctx) throw new Error('useAnalytics must be inside AnalyticsProvider')
  return ctx
}

const STORAGE_KEY = 'analytics_filters'

function loadSaved(): { dateFrom?: string; dateTo?: string; layer?: string } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveFilters(patch: Record<string, string>) {
  try {
    const prev = loadSaved()
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...patch }))
  } catch { /* quota / SSR */ }
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const saved = loadSaved()

  const [dateFrom, _setDateFrom] = useState(saved.dateFrom || '')
  const [dateTo, _setDateTo] = useState(saved.dateTo || '')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [lastLoaded, setLastLoaded] = useState('')
  const [activityFilter, setActivityFilter] = useState<string | null>(null)
  const [clientFilter, setClientFilter] = useState<string | null>(null)
  const [comparisonMode, setComparisonMode] = useState<'none' | 'previous' | 'target'>('none')
  const [layer, _setLayer] = useState<'executive' | 'performance' | 'analysis'>(
    (saved.layer as any) || 'executive'
  )
  const [performanceModule, setPerformanceModule] = useState<'demand' | 'monetization' | 'customer' | 'capacity'>('demand')

  const setDateFrom = useCallback((v: string) => { _setDateFrom(v); saveFilters({ dateFrom: v }) }, [])
  const setDateTo = useCallback((v: string) => { _setDateTo(v); saveFilters({ dateTo: v }) }, [])
  const setLayer = useCallback((v: 'executive' | 'performance' | 'analysis') => { _setLayer(v); saveFilters({ layer: v }) }, [])

  const handleDateChange = useCallback((which: 'from' | 'to', raw: string) => {
    if (which === 'from') setDateFrom(raw)
    else setDateTo(raw)
    if (!raw) setWarning(`Некорректная дата «${which === 'from' ? 'С' : 'По'}»`)
    else setWarning(null)
  }, [setDateFrom, setDateTo])

  const loadData = useCallback(async () => {
    if (!dateFrom || !dateTo) return
    const dFrom = new Date(dateFrom)
    const dTo = new Date(dateTo)
    if (dFrom > dTo) { setWarning('Дата начала позже даты конца'); return }
    const diffDays = (dTo.getTime() - dFrom.getTime()) / 86400000
    if (diffDays > 3650) { setWarning(`Слишком большой период: ${Math.round(diffDays)} дней`); return }
    setWarning(null)
    setLoading(true)
    setError(null)
    try {
      const result = await bookingAnalyticsService.getFullDashboard(dateFrom, dateTo)
      setData(result)
      setLastLoaded(new Date().toLocaleTimeString('ru-RU'))
    } catch (e: any) {
      const status = e?.response?.status
      if (status === 401) setError('Сессия истекла')
      else if (status >= 500) setError('Ошибка сервера')
      else if (e?.code === 'ERR_NETWORK') setError('Нет связи с сервером')
      else setError(e?.message || 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  // Set default dates only if nothing was saved
  useEffect(() => {
    if (!saved.dateFrom || !saved.dateTo) {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      setDateFrom(fmtDate(start))
      setDateTo(fmtDate(now))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-load on date change
  useEffect(() => { loadData() }, [loadData])

  const value: Ctx = {
    dateFrom, dateTo, data, loading, error, warning, lastLoaded,
    activityFilter, clientFilter, comparisonMode, layer, performanceModule,
    setDateFrom, setDateTo, setActivityFilter, setClientFilter,
    setComparisonMode, setLayer, setPerformanceModule,
    loadData, handleDateChange,
  }

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>
}
