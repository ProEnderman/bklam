import { type Severity, severityColor, severityBg } from '../utils/analytics'

// ═══════════════════════════════════════════════════
// Enterprise KPI Card with sparkline + severity
// ═══════════════════════════════════════════════════

interface Props {
  title: string
  value: string
  subtitle?: string
  delta?: number | null
  severity?: Severity
  sparkline?: number[]
  compact?: boolean
  onClick?: () => void
}

function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const w = 100
  const points = data.map((v, i) =>
    `${(i / Math.max(data.length - 1, 1)) * w},${height - ((v - min) / range) * (height - 4) - 2}`
  ).join(' ')
  return (
    <svg width={w} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" points={points} />
      <polyline fill={color + '18'} stroke="none" points={`0,${height} ${points} ${w},${height}`} />
    </svg>
  )
}

export default function KPICard({ title, value, subtitle, delta, severity: sev = 'neutral', sparkline, compact, onClick }: Props) {
  const color = severityColor(sev)
  const bg = severityBg(sev)
  const isClickable = !!onClick

  return (
    <div onClick={onClick} style={{
      background: bg, borderRadius: '12px', padding: compact ? '12px 16px' : '16px 20px',
      border: `1px solid ${color}22`, cursor: isClickable ? 'pointer' : 'default',
      transition: 'all .15s', position: 'relative', overflow: 'hidden',
      minWidth: compact ? 'auto' : '180px',
      ...(isClickable ? {} : {}),
    }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
        {title}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: sparkline ? '6px' : '0' }}>
        <span style={{ fontSize: compact ? '20px' : '28px', fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{value}</span>
        {delta != null && (
          <span style={{
            fontSize: '12px', fontWeight: 600,
            color: delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : '#6b7280',
          }}>
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      {subtitle && <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: sparkline ? '4px' : '0' }}>{subtitle}</div>}
      {sparkline && sparkline.length > 2 && <Sparkline data={sparkline} color={color} height={compact ? 24 : 32} />}
      <div style={{
        position: 'absolute', top: '12px', right: '12px', width: '8px', height: '8px',
        borderRadius: '50%', background: color, opacity: sev === 'neutral' ? 0 : 0.6,
      }} />
    </div>
  )
}
