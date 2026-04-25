import './DataTable.css'

interface Column<T> {
  key: string
  header: string
  render?: (item: T) => React.ReactNode
  sortable?: boolean
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  onRowClick?: (item: T) => void
  emptyMessage?: string
  loading?: boolean
}

export default function DataTable<T extends { id?: number | string }>({
  data,
  columns,
  onRowClick,
  emptyMessage = 'No data available',
  loading = false,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="data-table-loading">
        <div>Loading...</div>
      </div>
    )
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return <div className="data-table-empty">{emptyMessage}</div>
  }

  return (
    <div className="data-table-container">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr
              key={item.id || Math.random()}
              onClick={() => onRowClick?.(item)}
              className={onRowClick ? 'clickable-row' : ''}
            >
              {columns.map((col) => {
                try {
                  const value = col.render ? col.render(item) : (item as any)[col.key]
                  return <td key={col.key}>{value ?? ''}</td>
                } catch (error) {
                  console.error(`Error rendering column ${col.key}:`, error)
                  return <td key={col.key}></td>
                }
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

