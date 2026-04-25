import { useCallback, useEffect, useState } from 'react'
import { restaurantService, shiftService, stockService } from '../../api/services'
import '../tariffs/BookingAnalytics.css'
import './DataExport.css'

export default function DataExport() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  useEffect(() => {
    const now = new Date()
    const from = new Date(now)
    from.setDate(from.getDate() - 30)
    setDateFrom(fmtDate(from))
    setDateTo(fmtDate(now))
  }, [])

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    if (!dateFrom || !dateTo) return
    setError(null)
    setBusy(label)
    try {
      await fn()
    } catch (e: any) {
      const status = e?.response?.status
      let msg = e?.message || 'Ошибка скачивания'
      if (status === 401) msg = 'Сессия истекла. Войдите снова'
      else if (status === 403) msg = 'Нет доступа'
      setError(msg)
    } finally {
      setBusy(null)
    }
  }, [dateFrom, dateTo])

  return (
    <div className="booking-analytics-page">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Экспорт данных</h1>
          <p className="dashboard-subtitle">
            Скачивание отчётов в Excel (.xlsx) и CSV для Google Таблиц. Полный архив включает сырые выгрузки заказов,
            броней, склада, журнала и смен.
          </p>
        </div>
        <div className="date-controls">
          <label className="date-label">С</label>
          <input type="date" className="date-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <label className="date-label">По</label>
          <input type="date" className="date-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>❌</span> {error}
        </div>
      )}

      <div className="collapsible-section" style={{ marginTop: 16 }}>
        <div className="section-body" style={{ display: 'block', paddingTop: 8 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Главное</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              className="export-action-btn"
              disabled={!!busy}
              onClick={() =>
                run('xlsx', () => restaurantService.exportRestaurantDataXlsx(dateFrom, dateTo))
              }
            >
              {busy === 'xlsx' ? '…' : 'Сводный Excel (.xlsx)'}
            </button>
            <button
              type="button"
              className="export-action-btn"
              disabled={!!busy}
              onClick={() =>
                run('zip', () => restaurantService.exportRestaurantDataZip(dateFrom, dateTo))
              }
            >
              {busy === 'zip' ? '…' : 'Архив ZIP (Excel + CSV)'}
            </button>
          </div>
          <p className="dynamics-hint" style={{ marginTop: 12 }}>
            В одном XLSX — много листов (выручка, товары, сотрудники, тарифы/брони, движения склада, журнал,
            смены, позиции меню). В ZIP дополнительно отдельные файлы для удобного импорта в Google Sheets по одной
            таблице.
          </p>

          <h2 style={{ fontSize: 16, margin: '24px 0 12px' }}>По отдельности (CSV / Excel)</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button
              type="button"
              className="export-action-btn"
              disabled={!!busy}
              onClick={() => run('orders', () => restaurantService.exportOrdersCsvDownload(dateFrom, dateTo))}
            >
              {busy === 'orders' ? '…' : 'Заказы (позиции) CSV'}
            </button>
            <button
              type="button"
              className="export-action-btn"
              disabled={!!busy}
              onClick={() => run('bookings', () => restaurantService.exportBookingsCsvDownload(dateFrom, dateTo))}
            >
              {busy === 'bookings' ? '…' : 'Бронирования CSV'}
            </button>
            <button
              type="button"
              className="export-action-btn"
              disabled={!!busy}
              onClick={() =>
                run('movements', () => stockService.exportMovementsCsvDownload(dateFrom, dateTo))
              }
            >
              {busy === 'movements' ? '…' : 'Движения склада CSV'}
            </button>
            <button
              type="button"
              className="export-action-btn"
              disabled={!!busy}
              onClick={() =>
                run('activity', () => restaurantService.exportActivityLogCsvDownload(dateFrom, dateTo))
              }
            >
              {busy === 'activity' ? '…' : 'Журнал действий CSV'}
            </button>
            <button
              type="button"
              className="export-action-btn"
              disabled={!!busy}
              onClick={() =>
                run('shifts', () => shiftService.exportShiftsCsvDownload(dateFrom, dateTo))
              }
            >
              {busy === 'shifts' ? '…' : 'Смены CSV'}
            </button>
            <button
              type="button"
              className="export-action-btn"
              disabled={!!busy}
              onClick={() =>
                run('stockx', () => stockService.downloadStockExcelAsFile(`ingredients-stock_${dateFrom}.xlsx`))
              }
            >
              {busy === 'stockx' ? '…' : 'Текущие остатки Excel'}
            </button>
          </div>
          <p className="dynamics-hint" style={{ marginTop: 12 }}>
            Остатки — снимок на сейчас (без фильтра по датам). Прогнозы в отдельном модуле: раздел «Аналитика
            бронирований» → экспорт, либо сервис forecasting /export.
          </p>
        </div>
      </div>
    </div>
  )
}
