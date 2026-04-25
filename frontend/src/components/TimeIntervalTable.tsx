import './TimeIntervalTable.css'

export interface TimeInterval {
  id: string
  timeFrom: string // HH:mm
  timeTo: string // HH:mm
  rate: number
}

interface TimeIntervalTableProps {
  intervals: TimeInterval[]
  onChange: (intervals: TimeInterval[]) => void
  label: string
}

export default function TimeIntervalTable({ intervals, onChange, label }: TimeIntervalTableProps) {
  const addInterval = (event?: React.MouseEvent) => {
    // Явно проверяем, что это клик на кнопке "+"
    if (event) {
      const target = event.target as HTMLElement
      const button = target.closest('button')
      if (!button || button.textContent?.trim() !== '+' || button.id !== 'add-interval-button') {
        // Если клик был не на кнопке "+", не создаем новый интервал
        console.log('addInterval called but not from + button', { target: target.tagName, button: button?.textContent, buttonId: button?.id })
        return
      }
    } else {
      // Если событие не передано, не создаем интервал
      console.log('addInterval called without event')
      return
    }
    
    const newInterval: TimeInterval = {
      id: Date.now().toString(),
      timeFrom: '10:00',
      timeTo: '18:00',
      rate: 0,
    }
    onChange([...intervals, newInterval])
  }

  const removeInterval = (id: string) => {
    if (intervals.length <= 1) {
      // Не позволяем удалить последний интервал
      return
    }
    const newIntervals = intervals.filter((i) => i.id !== id)
    onChange(newIntervals)
  }

  const updateInterval = (id: string, field: keyof TimeInterval, value: string | number) => {
    onChange(
      intervals.map((i) =>
        i.id === id
          ? {
              ...i,
              [field]: value,
            }
          : i
      )
    )
  }

  return (
    <div 
      className="time-interval-table-container"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        // Предотвращаем создание новой строки при клике на контейнер
        const target = e.target as HTMLElement
        const button = target.closest('button')
        // Разрешаем только клики на кнопку "+"
        if (!button || button.id !== 'add-interval-button') {
          e.stopPropagation()
          e.preventDefault()
        }
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        {label && <label style={{ fontWeight: 'bold' }}>{label}</label>}
        <button 
          type="button" 
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            addInterval(e)
          }} 
          className="btn-small btn-primary" 
          style={{ padding: '4px 8px' }}
          id="add-interval-button"
        >
          +
        </button>
      </div>
      {intervals.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#666', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
          Нет временных интервалов. Нажмите "+" чтобы добавить.
        </div>
      ) : (
        <table 
          className="time-interval-table"
          onClick={(e) => {
            // Предотвращаем создание новой строки при клике на таблицу
            e.stopPropagation()
            const target = e.target as HTMLElement
            // Если клик не на кнопке "+", не делаем ничего
            if (!target.closest('button') || target.closest('button')?.id !== 'add-interval-button') {
              e.preventDefault()
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          <thead>
            <tr>
              <th>Время</th>
              <th>Цена (₽/час)</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {intervals.map((interval) => (
              <tr 
                key={interval.id}
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                }}
              >
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <input
                      type="time"
                      value={interval.timeFrom}
                      onChange={(e) => updateInterval(interval.id, 'timeFrom', e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: '100px', padding: '4px' }}
                    />
                    <span>-</span>
                    <input
                      type="time"
                      value={interval.timeTo}
                      onChange={(e) => updateInterval(interval.id, 'timeTo', e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: '100px', padding: '4px' }}
                    />
                  </div>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={interval.rate === 0 ? '' : Math.round(interval.rate * 100) / 100}
                    onChange={(e) => {
                      const value = e.target.value === '' ? 0 : parseFloat(e.target.value)
                      // Округляем введенное значение до 2 знаков после запятой
                      const roundedValue = !isNaN(value) ? Math.round(value * 100) / 100 : 0
                      updateInterval(interval.id, 'rate', roundedValue)
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="1000"
                    style={{ width: '120px', padding: '4px' }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      removeInterval(interval.id)
                    }}
                    className="btn-small btn-danger"
                    style={{ padding: '4px 8px' }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

