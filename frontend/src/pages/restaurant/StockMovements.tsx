import { useEffect, useState, useRef } from 'react'
import { stockService } from '../../api/services'
import { retryOnRateLimit } from '../../utils/apiRetry'
import { getCache, setCache } from '../../utils/cache'
import type { StockMovement, ExcelUploadResponse, ExcelUploadError, ResolveUnitMismatchRequest, Unit } from '../../api/types'
import DataTable from '../../components/DataTable'
import './StockMovements.css'

const STOCK_MOVEMENTS_CACHE_KEY = 'stock_movements_cache'

export default function StockMovements() {
  // Initialize with cached data if available
  const cachedData = getCache<StockMovement[]>(STOCK_MOVEMENTS_CACHE_KEY)
  const pageSize = 50
  // Initialize pagination state based on cached data
  const cachedLength = cachedData?.length || 0
  const [movements, setMovements] = useState<StockMovement[]>(cachedData || [])
  const [loading, setLoading] = useState(!cachedData)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<ExcelUploadResponse | null>(null)
  const [errorDialog, setErrorDialog] = useState<ExcelUploadError | null>(null)
  const [, setUnitMismatchResolutions] = useState<Record<string, ResolveUnitMismatchRequest>>({})
  const [, setMissingUnitResolutions] = useState<Record<string, Unit>>({})
  const [pendingErrors, setPendingErrors] = useState<ExcelUploadError[]>([])
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(cachedLength > 0 ? Math.ceil(cachedLength / pageSize) : 0)
  const [totalElements, setTotalElements] = useState(cachedLength)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Важно: input.files очищается, если выставить input.value = ''.
  // Для повторной загрузки (retryUpload) храним выбранный файл отдельно.
  const selectedFileRef = useRef<File | null>(null)
  // Также держим refs для resolutions, чтобы retryUpload не получил "старое" состояние.
  const unitMismatchResolutionsRef = useRef<Record<string, ResolveUnitMismatchRequest>>({})
  const missingUnitResolutionsRef = useRef<Record<string, Unit>>({})
  const isInitialMount = useRef(true)

  useEffect(() => {
    // Initial load - always load fresh data
    loadMovements(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Reload when page changes (skip initial mount to avoid double load)
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    loadMovements(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage])

  const loadMovements = async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true)
    }
    try {
      const data = await retryOnRateLimit(
        () => stockService.getStockMovements({ page: currentPage, size: pageSize }),
        1,
        200
      )
      console.log('[StockMovements] API response:', data)
      console.log('[StockMovements] Request params:', { page: currentPage, size: pageSize })
      
      if (!data) {
        console.warn('[StockMovements] Empty response from API')
        if (!isBackground) {
          setMovements([])
          setTotalPages(0)
          setTotalElements(0)
        }
        return
      }
      
      // Handle both paginated response and direct array (for backward compatibility)
      const movements = Array.isArray(data) ? data : (data.content || [])
      
      // Spring Data Page returns: { content: [], totalElements: number, totalPages: number, number: number, size: number }
      // We should trust the backend's totalElements value
      let totalElements: number
      let totalPages: number
      
      if (Array.isArray(data)) {
        // Fallback for non-paginated response
        totalElements = data.length
        totalPages = Math.ceil(totalElements / pageSize)
      } else {
        // Use backend values - they are correct
        totalElements = data.totalElements ?? 0
        // Use backend's totalPages if available, otherwise calculate from totalElements
        totalPages = data.totalPages ?? Math.ceil(totalElements / pageSize)
      }
      
      const backendSize = Array.isArray(data) ? 'N/A' : (data as any).size ?? 'N/A'
      const backendNumber = Array.isArray(data) ? 'N/A' : (data as any).number ?? 'N/A'
      
      console.log('[StockMovements] Parsed data:', { 
        movementsReceived: movements.length, 
        expectedPageSize: pageSize,
        backendPageSize: backendSize,
        backendPageNumber: backendNumber,
        totalElements, 
        totalPages,
        calculatedTotalPages: Math.ceil(totalElements / pageSize),
        backendTotalPages: Array.isArray(data) ? 'N/A' : (data.totalPages ?? 'N/A'),
        backendTotalElements: Array.isArray(data) ? 'N/A' : (data.totalElements ?? 'N/A'),
      })
      
      // Check if we're getting the right number of items per page
      if (movements.length > pageSize) {
        console.error(`[StockMovements] ERROR: Received ${movements.length} items but pageSize is ${pageSize}!`)
      }
      
      // If backend's totalPages seems wrong, recalculate it
      // This ensures correctness: 324 / 50 = 6.48 -> 7 pages
      if (!Array.isArray(data) && data.totalPages !== undefined) {
        const calculatedPages = Math.ceil(totalElements / pageSize)
        if (data.totalPages !== calculatedPages) {
          console.warn(`[StockMovements] Backend totalPages (${data.totalPages}) doesn't match calculated (${calculatedPages}). Using calculated value.`)
          totalPages = calculatedPages
        }
      }
      
      // Always update state, even in background, to show fresh data
      setMovements(movements)
      setTotalPages(totalPages)
      setTotalElements(totalElements)
      
      // Cache only first page for quick initial load
      if (currentPage === 0) {
        setCache(STOCK_MOVEMENTS_CACHE_KEY, movements)
      }
      console.log(`[StockMovements] ${isBackground ? 'Background' : 'Initial'} refresh completed, page ${currentPage + 1}/${totalPages}, ${movements.length} items`)
    } catch (error: any) {
      console.error('Failed to load movements:', error)
      console.error('Error details:', error.response?.data || error.message)
      if (!isBackground) {
        setMovements([])
        setTotalPages(0)
        setTotalElements(0)
      }
      // On background error, keep existing data
    } finally {
      if (!isBackground) {
        setLoading(false)
      }
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('Пожалуйста, выберите Excel файл (.xlsx или .xls)')
      return
    }

    selectedFileRef.current = file
    setUploading(true)
    setUploadResult(null)
    setPendingErrors([])
    setUnitMismatchResolutions({})
    setMissingUnitResolutions({})
    unitMismatchResolutionsRef.current = {}
    missingUnitResolutionsRef.current = {}

    try {
      const result = await stockService.uploadExcel(file, {}, {})
      setUploadResult(result)

      if (result.hasErrors && result.errors.length > 0) {
        setPendingErrors(result.errors)
        setErrorDialog(result.errors[0])
      } else {
        // Успешно загружено
        setCurrentPage(0) // Reset to first page after upload
        await loadMovements()
        // Можно очищать файл только при успехе
        selectedFileRef.current = null
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    } catch (error: any) {
      console.error('Failed to upload Excel:', error)
      alert('Ошибка при загрузке файла: ' + (error.response?.data?.message || error.message))
      // При ошибке тоже очищаем файл, чтобы избежать "повторить со сломанным файлом"
      selectedFileRef.current = null
      if (fileInputRef.current) fileInputRef.current.value = ''
    } finally {
      setUploading(false)
    }
  }

  const handleResolveUnitMismatch = (updateExisting: boolean, chosenUnit: Unit) => {
    if (!errorDialog) return

    const resolution: ResolveUnitMismatchRequest = {
      item: errorDialog.item,
      chosenUnit,
      updateExisting,
    }

    // Обновляем состояние синхронно
    const nextResolutions = { ...unitMismatchResolutionsRef.current, [errorDialog.item]: resolution }
    unitMismatchResolutionsRef.current = nextResolutions
    setUnitMismatchResolutions(nextResolutions)

    // Убираем текущую ошибку из очереди
    const nextErrors = pendingErrors.filter((e) => e.item !== errorDialog.item)
    setPendingErrors(nextErrors)

    // Закрываем текущий диалог перед следующим действием
    setErrorDialog(null)

    if (nextErrors.length > 0) {
      // Небольшая задержка перед показом следующего диалога, чтобы избежать двойного показа
      setTimeout(() => {
        setErrorDialog(nextErrors[0])
      }, 100)
    } else {
      // Повторяем загрузку с разрешениями
      retryUpload()
    }
  }

  const handleResolveMissingUnit = (chosenUnit: Unit) => {
    if (!errorDialog) return

    // Обновляем состояние синхронно
    const nextResolutions = { ...missingUnitResolutionsRef.current, [errorDialog.item]: chosenUnit }
    missingUnitResolutionsRef.current = nextResolutions
    setMissingUnitResolutions(nextResolutions)

    // Убираем текущую ошибку из очереди
    const nextErrors = pendingErrors.filter((e) => e.item !== errorDialog.item)
    setPendingErrors(nextErrors)

    // Закрываем текущий диалог перед следующим действием
    setErrorDialog(null)

    if (nextErrors.length > 0) {
      // Небольшая задержка перед показом следующего диалога, чтобы избежать двойного показа
      setTimeout(() => {
        setErrorDialog(nextErrors[0])
      }, 100)
    } else {
      // Повторяем загрузку с разрешениями
      retryUpload()
    }
  }

  const retryUpload = async () => {
    const file = selectedFileRef.current
    if (!file) {
      console.warn('[ExcelUpload] retryUpload called but no file is selected (input was probably cleared).')
      alert('Файл для повторной загрузки не найден. Пожалуйста, выберите Excel файл заново.')
      return
    }

    setUploading(true)
    try {
      const result = await stockService.uploadExcel(
        file,
        unitMismatchResolutionsRef.current,
        missingUnitResolutionsRef.current
      )
      setUploadResult(result)

      if (result.hasErrors && result.errors.length > 0) {
        setPendingErrors(result.errors)
        setErrorDialog(result.errors[0])
      } else {
        // Успешно загружено
        setCurrentPage(0) // Reset to first page after upload
        await loadMovements()
        setUnitMismatchResolutions({})
        setMissingUnitResolutions({})
        unitMismatchResolutionsRef.current = {}
        missingUnitResolutionsRef.current = {}
        selectedFileRef.current = null
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    } catch (error: any) {
      console.error('Failed to retry upload:', error)
      alert('Ошибка при загрузке файла: ' + (error.response?.data?.message || error.message))
    } finally {
      setUploading(false)
    }
  }

  const columns = [
    {
      key: 'createdAt',
      header: 'Timestamp',
      render: (item: StockMovement) => new Date(item.createdAt).toLocaleString(),
    },
    { key: 'ingredientName', header: 'Ingredient' },
    {
      key: 'type',
      header: 'Type',
      render: (item: StockMovement) => (
        <span className={item.type === 'IN' ? 'type-in' : 'type-out'}>{item.type}</span>
      ),
    },
    { key: 'qty', header: 'Quantity' },
    { key: 'reason', header: 'Reason' },
    { key: 'createdBy', header: 'Created By' },
  ]

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
      <h1>Stock Movements</h1>
        <div style={{ display: 'flex', gap: '10px', position: 'relative', zIndex: 1000 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn btn-primary excel-upload-btn"
          >
            {uploading ? 'Загрузка...' : 'Загрузить Excel'}
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                const blob = await stockService.downloadStockExcel()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'ingredients-stock.xlsx'
                a.click()
                URL.revokeObjectURL(url)
              } catch (e) {
                console.error(e)
                alert('Не удалось скачать Excel')
              }
            }}
            className="btn btn-secondary"
          >
            Скачать Excel (остатки)
          </button>
        </div>
      </div>

      {uploadResult && !uploadResult.hasErrors && (
        <div className="upload-success">
          <p>Успешно обработано: {uploadResult.processedCount} строк</p>
          <p>Создано товаров: {uploadResult.createdCount}</p>
          <p>Обновлено товаров: {uploadResult.updatedCount}</p>
        </div>
      )}

      {errorDialog && (
        <div className="error-dialog-overlay">
          <div className="error-dialog">
            <h2>Ошибка обработки товара</h2>
            {errorDialog.type === 'UNIT_MISMATCH' ? (
              <>
                <p>
                  Unit товара "{errorDialog.item}" отличается от указанного.
                  <br />
                  Существующий unit: <strong>{errorDialog.existingUnit}</strong>
                  <br />
                  Указанный unit: <strong>{errorDialog.providedUnit}</strong>
                  <br />
                  Может быть, вы ошиблись?
                </p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleResolveUnitMismatch(true, errorDialog.existingUnit!)}
                  >
                    Да, автоматически исправить unit товара
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleResolveUnitMismatch(false, errorDialog.providedUnit!)}
                  >
                    Нет, создать новый товар такого типа
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Unit товара "{errorDialog.item}" не указан, пожалуйста, укажите его:
                </p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button className="btn btn-primary" onClick={() => handleResolveMissingUnit('G')}>
                    G (Grams)
                  </button>
                  <button className="btn btn-primary" onClick={() => handleResolveMissingUnit('ML')}>
                    ML (Milliliters)
                  </button>
                  <button className="btn btn-primary" onClick={() => handleResolveMissingUnit('PCS')}>
                    PCS (Pieces)
                  </button>
                </div>
              </>
            )}
            {pendingErrors.length > 1 && (
              <p style={{ marginTop: '20px', color: '#666' }}>
                Осталось ошибок: {pendingErrors.length - 1}
              </p>
            )}
          </div>
        </div>
      )}

      <DataTable
        data={movements}
        columns={columns}
        loading={loading}
        emptyMessage="No stock movements"
      />

      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage(0)}
            disabled={currentPage === 0 || loading}
            className="btn btn-secondary"
          >
            First
          </button>
          <button
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 0 || loading}
            className="btn btn-secondary"
          >
            Previous
          </button>
          <span>
            Page {currentPage + 1} of {totalPages} ({totalElements} total)
          </span>
          <button
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage >= totalPages - 1 || loading}
            className="btn btn-secondary"
          >
            Next
          </button>
          <button
            onClick={() => setCurrentPage(totalPages - 1)}
            disabled={currentPage >= totalPages - 1 || loading}
            className="btn btn-secondary"
          >
            Last
          </button>
        </div>
      )}
    </div>
  )
}
