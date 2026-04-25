import './Table.css'

interface Column<T> {
  key: keyof T | string
  header: string
  render?: (item: T) => React.ReactNode
}

interface TableProps<T> {
  data: T[]
  columns: Column<T>[]
  onRowClick?: (item: T) => void
}

export default function Table<T extends { id?: number }>({
  data,
  columns,
  onRowClick,
}: TableProps<T>) {
  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={String(col.key)}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty">
                Нет данных
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr
                key={item.id || Math.random()}
                onClick={() => onRowClick?.(item)}
                className={onRowClick ? 'clickable' : ''}
              >
                {columns.map((col) => (
                  <td key={String(col.key)}>
                    {col.render
                      ? col.render(item)
                      : String(item[col.key as keyof T] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

