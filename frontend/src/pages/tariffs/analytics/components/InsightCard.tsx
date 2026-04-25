// ═══════════════════════════════════════════════════
// Risk / Opportunity / Prescriptive Insight Cards
// ═══════════════════════════════════════════════════

interface RiskItem {
  title: string
  value?: string
  action?: string
  severity?: string
  metric?: string
}

interface InsightItem {
  type?: string
  priority?: string
  title: string
  insight?: string
  text?: string
  action?: string
  level?: string
  icon?: string
}

export function RiskCard({ item, type }: { item: RiskItem; type: 'risk' | 'opportunity' }) {
  const isRisk = type === 'risk'
  const borderColor = isRisk
    ? item.severity === 'critical' ? '#ef4444' : '#f59e0b'
    : '#10b981'

  return (
    <div style={{
      padding: '12px 16px', borderRadius: '8px', borderLeft: `4px solid ${borderColor}`,
      background: isRisk ? '#fef2f210' : '#ecfdf510', marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
          {isRisk ? '⚠' : '💡'} {item.title}
        </span>
        {item.value && <span style={{ fontSize: '12px', fontWeight: 700, color: borderColor }}>{item.value}</span>}
      </div>
      {item.action && <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: 1.4 }}>{item.action}</div>}
    </div>
  )
}

export function PrescriptiveCard({ item }: { item: InsightItem }) {
  const priorityColors: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#6b7280' }
  const color = priorityColors[item.priority || 'low'] || '#6b7280'

  return (
    <div style={{
      padding: '14px 16px', borderRadius: '10px', background: '#f8fafc',
      border: '1px solid #e2e8f0', marginBottom: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{
          fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
          color: '#fff', background: color, padding: '2px 6px', borderRadius: '4px',
        }}>
          {item.priority === 'high' ? 'Важно' : item.priority === 'medium' ? 'Средний' : 'Инфо'}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{item.title}</span>
      </div>
      {item.insight && <div style={{ fontSize: '12px', color: '#374151', marginBottom: '4px' }}>{item.insight}</div>}
      {item.text && <div style={{ fontSize: '12px', color: '#374151', marginBottom: '4px' }}>{item.text}</div>}
      {item.action && (
        <div style={{ fontSize: '11px', color: '#4f46e5', fontWeight: 500, marginTop: '4px' }}>
          → {item.action}
        </div>
      )}
    </div>
  )
}
