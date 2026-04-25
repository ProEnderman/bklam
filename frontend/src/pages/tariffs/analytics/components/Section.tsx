import { useState, type ReactNode } from 'react'

// ═══════════════════════════════════════════════════
// Collapsible Section Container
// ═══════════════════════════════════════════════════

interface Props {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  badge?: string | number
  noPad?: boolean
}

export default function Section({ title, children, defaultOpen = true, badge, noPad }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '12px', overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
        borderBottom: open ? '1px solid #f3f4f6' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{title}</span>
          {badge != null && (
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#4f46e5', background: '#eef2ff', padding: '1px 6px', borderRadius: '10px' }}>
              {badge}
            </span>
          )}
        </div>
        <span style={{ fontSize: '14px', color: '#9ca3af', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>▾</span>
      </button>
      {open && <div style={{ padding: noPad ? 0 : '16px' }}>{children}</div>}
    </div>
  )
}
