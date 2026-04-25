import { useState, useMemo } from 'react'

// ═══════════════════════════════════════════════════
// Sortable, Searchable, Paginated Data Table
// ═══════════════════════════════════════════════════

interface Column {
  key: string
  label: string
  format?: (v: any) => string
  align?: 'left' | 'right' | 'center'
  width?: string
}

interface Props {
  columns: Column[]
  data: Record<string, any>[]
  pageSize?: number
  searchable?: boolean
  searchKey?: string
  title?: string
  compact?: boolean
}

export default function DataTable({ columns, data, pageSize = 15, searchable = true, searchKey, title, compact }: Props) {
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return data
    const q = search.toLowerCase()
    return data.filter(row =>
      (searchKey ? String(row[searchKey] || '').toLowerCase().includes(q) :
        columns.some(c => String(row[c.key] || '').toLowerCase().includes(q)))
    )
  }, [data, search, searchKey, columns])

  const sorted = useMemo(() => {
    if (!sortCol) return filtered
    return [...filtered].sort((a, b) => {
      const av = a[sortCol!] ?? ''
      const bv = b[sortCol!] ?? ''
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortCol, sortDir])

  const totalPages = Math.ceil(sorted.length / pageSize)
  const pageData = sorted.slice(page * pageSize, (page + 1) * pageSize)

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
    setPage(0)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        {title && <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>{title}</div>}
        {searchable && (
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
            placeholder="Поиск..." style={{
              padding: '4px 10px', fontSize: '12px', border: '1px solid #e5e7eb',
              borderRadius: '6px', outline: 'none', width: '180px',
            }} />
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? '11px' : '12px' }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)} style={{
                  padding: compact ? '4px 6px' : '6px 10px', textAlign: col.align || 'left',
                  cursor: 'pointer', userSelect: 'none', borderBottom: '2px solid #e5e7eb',
                  fontWeight: 600, color: '#6b7280', fontSize: compact ? '10px' : '11px',
                  textTransform: 'uppercase', letterSpacing: '0.05em', width: col.width,
                  whiteSpace: 'nowrap',
                }}>
                  {col.label} {sortCol === col.key && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                {columns.map(col => (
                  <td key={col.key} style={{
                    padding: compact ? '3px 6px' : '5px 10px', textAlign: col.align || 'left',
                    borderBottom: '1px solid #f3f4f6', color: '#374151', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px',
                  }}>
                    {col.format ? col.format(row[col.key]) : String(row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
            {pageData.length === 0 && (
              <tr><td colSpan={columns.length} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>Нет данных</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11px', color: '#6b7280' }}>
          <span>{sorted.length} записей</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ padding: '2px 8px', border: '1px solid #e5e7eb', borderRadius: '4px', cursor: page === 0 ? 'default' : 'pointer', background: '#fff', fontSize: '11px' }}>←</button>
            <span style={{ padding: '2px 8px' }}>{page + 1} / {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ padding: '2px 8px', border: '1px solid #e5e7eb', borderRadius: '4px', cursor: page >= totalPages - 1 ? 'default' : 'pointer', background: '#fff', fontSize: '11px' }}>→</button>
          </div>
        </div>
      )}
    </div>
  )
}
