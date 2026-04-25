import { useState } from 'react'
import { fmt, DOW_RU } from '../utils/analytics'

// ═══════════════════════════════════════════════════
// Configurable Chart System
// ═══════════════════════════════════════════════════

const PALETTE = ['#4f46e5', '#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#6366f1']

// ── Horizontal Bar Chart ──
interface BarProps {
  data: [string, number][]
  formatValue?: (v: number) => string
  color?: string
  maxBars?: number
  showExpand?: boolean
  label?: string
}

export function BarChart({ data, formatValue = fmt, color = '#4f46e5', maxBars = 8, showExpand = true, label }: BarProps) {
  const [expanded, setExpanded] = useState(false)
  const display = expanded ? data : data.slice(0, maxBars)
  const max = Math.max(...data.map(d => d[1]), 1)

  return (
    <div>
      {label && <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>{label}</div>}
      {display.map(([k, v], i) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '11px', color: '#6b7280', width: '120px', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k}>{k}</span>
          <div style={{ flex: 1, height: '18px', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(v / max) * 100}%`, background: PALETTE[i % PALETTE.length] || color, borderRadius: '4px', transition: 'width .3s' }} />
          </div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#374151', minWidth: '60px', textAlign: 'right' }}>{formatValue(v)}</span>
        </div>
      ))}
      {showExpand && data.length > maxBars && (
        <button onClick={() => setExpanded(!expanded)} style={{
          background: 'none', border: 'none', color: '#4f46e5', fontSize: '11px',
          cursor: 'pointer', padding: '4px 0', fontWeight: 500, marginTop: '4px',
        }}>
          {expanded ? 'Свернуть' : `Показать все (${data.length})`}
        </button>
      )}
    </div>
  )
}

// ── Line Chart (SVG) with optional confidence bands ──
interface LineSeries {
  label: string
  data: Record<string, number>
  color?: string
  upper?: Record<string, number>
  lower?: Record<string, number>
  dashed?: boolean
}
interface LineProps {
  series: LineSeries[]
  height?: number
  formatY?: (v: number) => string
  showDots?: boolean
}

export function LineChart({ series, height = 160, formatY = fmt, showDots = false }: LineProps) {
  if (!series.length || !Object.keys(series[0].data).length) return null
  const allKeys = Array.from(new Set(series.flatMap(s => Object.keys(s.data)))).sort()
  const allVals = series.flatMap(s => [
    ...Object.values(s.data),
    ...(s.upper ? Object.values(s.upper) : []),
    ...(s.lower ? Object.values(s.lower) : []),
  ])
  const max = Math.max(...allVals, 1)
  const min = Math.min(...allVals, 0)
  const range = max - min || 1
  const w = 600
  const pad = { top: 10, bottom: 24, left: 10, right: 10 }
  const plotW = w - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const toX = (i: number) => pad.left + (i / Math.max(allKeys.length - 1, 1)) * plotW
  const toY = (v: number) => pad.top + plotH - (v - min) / range * plotH

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', maxHeight: height }}>
        {[0, 0.25, 0.5, 0.75, 1].map(p => {
          const y = pad.top + plotH * (1 - p)
          const val = min + range * p
          return (
            <g key={p}>
              <line x1={pad.left} y1={y} x2={w - pad.right} y2={y} stroke="#e5e7eb" strokeWidth="0.5" />
              <text x={w - pad.right + 4} y={y + 3} fontSize="8" fill="#9ca3af">{formatY(val)}</text>
            </g>
          )
        })}
        {allKeys.filter((_, i) => i % Math.max(1, Math.floor(allKeys.length / 8)) === 0).map(k => {
          const i = allKeys.indexOf(k)
          return <text key={k} x={toX(i)} y={height - 4} fontSize="8" fill="#9ca3af" textAnchor="middle">{k.slice(5)}</text>
        })}
        {series.map((s, si) => {
          const color = s.color || PALETTE[si % PALETTE.length]
          const points = allKeys.map((k, i) => `${toX(i)},${toY(s.data[k] || 0)}`)

          // Confidence band
          let bandPath = ''
          if (s.upper && s.lower) {
            const upperPts = allKeys.map((k, i) => `${toX(i)},${toY(s.upper![k] ?? s.data[k] ?? 0)}`)
            const lowerPts = allKeys.map((k, i) => `${toX(i)},${toY(s.lower![k] ?? s.data[k] ?? 0)}`).reverse()
            bandPath = `M ${upperPts.join(' L ')} L ${lowerPts.join(' L ')} Z`
          }

          return (
            <g key={si}>
              {bandPath && <path d={bandPath} fill={color + '18'} stroke="none" />}
              <polyline fill="none" stroke={color} strokeWidth={s.dashed ? 1.5 : 2}
                strokeDasharray={s.dashed ? '6,3' : 'none'}
                strokeLinejoin="round" points={points.join(' ')} />
              {!s.upper && <polyline fill={color + '10'} stroke="none"
                points={`${pad.left},${pad.top + plotH} ${points.join(' ')} ${toX(allKeys.length - 1)},${pad.top + plotH}`} />}
              {showDots && points.map((p, i) => {
                const [x, y] = p.split(',').map(Number)
                return <circle key={i} cx={x} cy={y} r={2} fill={color} />
              })}
            </g>
          )
        })}
      </svg>
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '4px' }}>
          {series.map((s, i) => (
            <span key={i} style={{ fontSize: '10px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '10px', height: '3px', background: s.color || PALETTE[i % PALETTE.length], borderRadius: '2px', display: 'inline-block',
                ...(s.dashed ? { borderTop: `2px dashed ${s.color || PALETTE[i % PALETTE.length]}`, background: 'none', height: 0 } : {}) }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Heatmap ──
interface HeatmapProps {
  data: Record<string, Record<string, number>>
  formatValue?: (v: number) => string
  colorScale?: string
}

export function Heatmap({ data, formatValue = fmt, colorScale = '#4f46e5' }: HeatmapProps) {
  if (!data || !Object.keys(data).length) return null
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
  const hours = Array.from({ length: 24 }, (_, i) => String(i))
  let max = 1
  for (const d of Object.values(data)) for (const v of Object.values(d)) if (v > max) max = v

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '10px', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ padding: '2px 4px' }}></th>
            {hours.map(h => <th key={h} style={{ padding: '2px', fontWeight: 500, color: '#9ca3af', minWidth: '22px' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {days.map(d => (
            <tr key={d}>
              <td style={{ padding: '2px 6px', fontWeight: 500, color: '#6b7280', whiteSpace: 'nowrap' }}>{DOW_RU[d]}</td>
              {hours.map(h => {
                const v = data[d]?.[h] || 0
                const intensity = v / max
                return (
                  <td key={h} title={`${DOW_RU[d]} ${h}:00 — ${formatValue(v)}`} style={{
                    padding: '2px', textAlign: 'center',
                    background: v > 0 ? `${colorScale}${Math.round(intensity * 200 + 20).toString(16).padStart(2, '0')}` : '#f9fafb',
                    color: intensity > 0.6 ? '#fff' : '#374151', borderRadius: '2px', fontWeight: v > 0 ? 500 : 400,
                  }}>
                    {v > 0 ? formatValue(v) : ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Stacked Bar Chart ──
interface StackedBarProps {
  categories: string[]
  series: { label: string; data: Record<string, number>; color?: string }[]
  height?: number
}

export function StackedBarChart({ categories, series, height = 200 }: StackedBarProps) {
  const maxTotal = Math.max(...categories.map(c => series.reduce((sum, s) => sum + (s.data[c] || 0), 0)), 1)
  const barW = Math.min(40, 500 / Math.max(categories.length, 1))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height, padding: '0 4px' }}>
        {categories.map(cat => {
          let y = 0
          return (
            <div key={cat} style={{ display: 'flex', flexDirection: 'column-reverse', flex: 1, maxWidth: barW + 'px', height: '100%', position: 'relative' }}>
              {series.map((s, i) => {
                const val = s.data[cat] || 0
                const h = (val / maxTotal) * 100
                y += h
                return <div key={i} title={`${s.label}: ${fmt(val)}`} style={{ width: '100%', height: h + '%', background: s.color || PALETTE[i], borderRadius: i === series.length - 1 ? '3px 3px 0 0' : '0', minHeight: val > 0 ? '2px' : '0' }} />
              })}
              <div style={{ position: 'absolute', bottom: -16, left: 0, right: 0, textAlign: 'center', fontSize: '8px', color: '#9ca3af' }}>{cat}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '20px' }}>
        {series.map((s, i) => (
          <span key={i} style={{ fontSize: '10px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', background: s.color || PALETTE[i], borderRadius: '2px', display: 'inline-block' }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Donut Chart ──
interface DonutProps {
  data: Record<string, number>
  size?: number
}

export function DonutChart({ data, size = 120 }: DonutProps) {
  const entries = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1
  const r = size / 2 - 8
  const cx = size / 2
  const cy = size / 2
  let angle = -90

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <svg width={size} height={size}>
        {entries.map(([k, v], i) => {
          const sweep = (v / total) * 360
          const startAngle = angle
          angle += sweep
          const startRad = (startAngle * Math.PI) / 180
          const endRad = ((startAngle + sweep) * Math.PI) / 180
          const largeArc = sweep > 180 ? 1 : 0
          const x1 = cx + r * Math.cos(startRad)
          const y1 = cy + r * Math.sin(startRad)
          const x2 = cx + r * Math.cos(endRad)
          const y2 = cy + r * Math.sin(endRad)
          return (
            <path key={k} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={PALETTE[i % PALETTE.length]} stroke="#fff" strokeWidth="1.5" />
          )
        })}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="#fff" />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="14" fontWeight="700" fill="#111827">{fmt(total)}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {entries.slice(0, 6).map(([k, v], i) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
            <span style={{ color: '#374151' }}>{k}</span>
            <span style={{ color: '#9ca3af', marginLeft: 'auto' }}>{((v / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
