// ═══════════════════════════════════════════════════
// Enterprise Analytics Utilities
// ═══════════════════════════════════════════════════

export const fmt = (n: number | null | undefined): string => {
  if (n == null) return '—'
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}

export const fmtRub = (n: number | null | undefined): string => {
  if (n == null) return '—'
  if (n >= 1_000_000) return `₽${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `₽${(n / 1_000).toFixed(0)}K`
  return `₽${n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}`
}

export const fmtRubFull = (n: number | null | undefined): string => {
  if (n == null) return '—'
  return `₽${n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}`
}

export const pct = (n: number | null | undefined): string => {
  if (n == null) return '—'
  return `${n.toFixed(1)}%`
}

export const delta = (n: number | null | undefined): string => {
  if (n == null) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

export const fmtDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export type Severity = 'critical' | 'warning' | 'healthy' | 'neutral'

export const severity = (value: number, thresholds: { critical: number; warning: number }, inverse = false): Severity => {
  if (inverse) {
    if (value <= thresholds.critical) return 'critical'
    if (value <= thresholds.warning) return 'warning'
    return 'healthy'
  }
  if (value >= thresholds.critical) return 'critical'
  if (value >= thresholds.warning) return 'warning'
  return 'healthy'
}

export const severityColor = (s: Severity): string => {
  switch (s) {
    case 'critical': return '#ef4444'
    case 'warning': return '#f59e0b'
    case 'healthy': return '#10b981'
    default: return '#6b7280'
  }
}

export const severityBg = (s: Severity): string => {
  switch (s) {
    case 'critical': return '#fef2f2'
    case 'warning': return '#fffbeb'
    case 'healthy': return '#ecfdf5'
    default: return '#f9fafb'
  }
}

export const sorted = (obj: Record<string, number> | undefined, limit = 10, ascending = false): [string, number][] => {
  if (!obj) return []
  const entries = Object.entries(obj)
  entries.sort((a, b) => ascending ? a[1] - b[1] : b[1] - a[1])
  return limit > 0 ? entries.slice(0, limit) : entries
}

export const sortedObj = (obj: Record<string, any> | undefined, key: string, limit = 10): [string, any][] => {
  if (!obj) return []
  const entries = Object.entries(obj)
  entries.sort((a, b) => {
    const av = typeof a[1] === 'object' ? a[1][key] : a[1]
    const bv = typeof b[1] === 'object' ? b[1][key] : b[1]
    return (bv || 0) - (av || 0)
  })
  return limit > 0 ? entries.slice(0, limit) : entries
}

export const DOW_RU: Record<string, string> = {
  MONDAY: 'Пн', TUESDAY: 'Вт', WEDNESDAY: 'Ср', THURSDAY: 'Чт',
  FRIDAY: 'Пт', SATURDAY: 'Сб', SUNDAY: 'Вс'
}

// Sparkline data from a sorted map
export const sparklineData = (obj: Record<string, number> | undefined): number[] => {
  if (!obj) return []
  return Object.values(obj)
}
