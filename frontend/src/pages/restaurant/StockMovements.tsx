import { useEffect, useState, useRef, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { restaurantService, stockService } from '../../api/services'
import { retryOnRateLimit } from '../../utils/apiRetry'
import { getCache, setCache, clearCache } from '../../utils/cache'
import type {
  StockMovement,
  ExcelUploadResponse,
  ExcelUploadError,
  ResolveIngredientMissingRequest,
  ResolveUnitMismatchRequest,
  Unit,
  Ingredient,
  User,
} from '../../api/types'
import DataTable from '../../components/DataTable'
import ExcelHoverHint from '../../components/ExcelHoverHint'
import Modal from '../../components/Modal'
import FormInput from '../../components/FormInput'
import './StockMovements.css'

function canStockIn(user?: User): boolean {
  if (!user) return false
  if (user.role === 'HEAD_ADMIN' || user.role === 'ADMIN') return true
  return user.permissions?.includes('STOCK_IN') ?? false
}

function canStockOut(user?: User): boolean {
  if (!user) return false
  if (user.role === 'HEAD_ADMIN' || user.role === 'ADMIN') return true
  return user.permissions?.includes('STOCK_OUT') ?? false
}

const STOCK_MOVEMENTS_EXCEL_HINT = `Формат .xlsx (один лист):
• Первая строка — заголовок, в импорт не входит.
• Столбец 1: наименование
• Столбцы 2–3: количество и Unit (G / ML / PCS) — допускаются оба порядка
• 4-й столбец не мешает: основное количество берётся из 2-го столбца

Количество в файле — объём прихода: к текущему остатку прибавляется ровно это число (движение IN). Повторная загрузка снова прибавит те же объёмы.
Выгрузка «Скачать Excel» показывает текущие остатки для справки; в файле для импорта указывайте объёмы поступления, а не «желаемый итог на полке».
Если unit не совпадёт или не указан — покажется диалог выбора.
Если ингредиента нет в справочнике — можно пропустить строку или создать новый с минимальным остатком.`

const STOCK_MOVEMENTS_CACHE_KEY = 'stock_movements_cache'

export default function StockMovements() {
  const { user } = useOutletContext<{ user?: User }>()
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
  const [, setMissingIngredientResolutions] = useState<Record<string, ResolveIngredientMissingRequest>>({})
  const [ingredientMissingMinQtyDraft, setIngredientMissingMinQtyDraft] = useState('0')
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
  const missingIngredientResolutionsRef = useRef<Record<string, ResolveIngredientMissingRequest>>({})
  const isInitialMount = useRef(true)

  const [showManualInModal, setShowManualInModal] = useState(false)
  const [showManualOutModal, setShowManualOutModal] = useState(false)
  const [ingredientOptions, setIngredientOptions] = useState<Ingredient[]>([])
  const [loadingIngredients, setLoadingIngredients] = useState(false)
  const [manualIngredientId, setManualIngredientId] = useState('')
  const [manualInQty, setManualInQty] = useState('')
  const [manualInNote, setManualInNote] = useState('')
  const [manualOutQty, setManualOutQty] = useState('')
  const [manualOutReason, setManualOutReason] = useState('SPOILAGE')
  const [manualOutNote, setManualOutNote] = useState('')
  const [manualSubmitting, setManualSubmitting] = useState(false)
  /** Поиск по названию в модалках прихода/списания (не только выпадающий список без ввода). */
  const [ingredientSearch, setIngredientSearch] = useState('')

  useEffect(() => {
    if (!showManualInModal && !showManualOutModal) return
    let cancelled = false
    setLoadingIngredients(true)
    restaurantService
      .getIngredients()
      .then((list) => {
        if (!cancelled) {
          setIngredientOptions(list)
        }
      })
      .catch((e) => {
        console.error('Failed to load ingredients for stock modal:', e)
        if (!cancelled) {
          alert('Не удалось загрузить список ингредиентов')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingIngredients(false)
      })
    return () => {
      cancelled = true
    }
  }, [showManualInModal, showManualOutModal])

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

  useEffect(() => {
    if (errorDialog?.type === 'INGREDIENT_MISSING') {
      setIngredientMissingMinQtyDraft('0')
    }
  }, [errorDialog])

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
    setMissingIngredientResolutions({})
    unitMismatchResolutionsRef.current = {}
    missingUnitResolutionsRef.current = {}
    missingIngredientResolutionsRef.current = {}

    try {
      const result = await stockService.uploadExcel(file, {}, {}, {})
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

  const handleResolveIngredientMissing = (createNew: boolean) => {
    if (!errorDialog) return

    let resolution: ResolveIngredientMissingRequest = { createNew: false }
    if (createNew) {
      const raw = ingredientMissingMinQtyDraft.replace(',', '.')
      const n = parseFloat(raw)
      const minQty = Number.isFinite(n) && n >= 0 ? n : 0
      resolution = { createNew: true, minQty }
    }

    const nextResolutions = { ...missingIngredientResolutionsRef.current, [errorDialog.item]: resolution }
    missingIngredientResolutionsRef.current = nextResolutions
    setMissingIngredientResolutions(nextResolutions)

    const nextErrors = pendingErrors.filter((e) => e.item !== errorDialog.item)
    setPendingErrors(nextErrors)
    setErrorDialog(null)

    if (nextErrors.length > 0) {
      setTimeout(() => {
        setErrorDialog(nextErrors[0])
      }, 100)
    } else {
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
        missingUnitResolutionsRef.current,
        missingIngredientResolutionsRef.current
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
        setMissingIngredientResolutions({})
        unitMismatchResolutionsRef.current = {}
        missingUnitResolutionsRef.current = {}
        missingIngredientResolutionsRef.current = {}
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

  const resetManualInForm = () => {
    setManualIngredientId('')
    setManualInQty('')
    setManualInNote('')
    setIngredientSearch('')
  }

  const resetManualOutForm = () => {
    setManualIngredientId('')
    setManualOutQty('')
    setManualOutReason('SPOILAGE')
    setManualOutNote('')
    setIngredientSearch('')
  }

  const filteredIngredientsForManual = useMemo(() => {
    const q = ingredientSearch.trim().toLowerCase()
    if (!q) return []
    return ingredientOptions
      .filter((ing) => ing.name.toLowerCase().includes(q))
      .slice(0, 80)
  }, [ingredientOptions, ingredientSearch])

  const resolveManualIngredientId = (): number | null => {
    if (manualIngredientId) {
      const id = parseInt(manualIngredientId, 10)
      return Number.isFinite(id) ? id : null
    }
    let raw = ingredientSearch.trim()
    if (!raw) return null
    const paren = raw.lastIndexOf(' (')
    if (paren > 0 && raw.endsWith(')')) {
      raw = raw.slice(0, paren).trim()
    }
    const lower = raw.toLowerCase()
    const exact = ingredientOptions.filter((ing) => ing.name.trim().toLowerCase() === lower)
    if (exact.length === 1) return exact[0].id
    return null
  }

  const pickIngredientForManual = (ing: Ingredient) => {
    setManualIngredientId(String(ing.id))
    setIngredientSearch(`${ing.name} (${ing.unit})`)
  }

  const ingredientComboboxField = (
    <div className="form-input ingredient-combobox-wrap" style={{ marginBottom: 12 }}>
      <label>
        Ингредиент <span className="required">*</span>
      </label>
      <p className="ingredient-combobox-hint">
        Введите часть названия — ниже появятся подсказки; либо полное имя как в справочнике (можно кликнуть строку).
      </p>
      <div className="ingredient-combobox">
        <input
          type="text"
          autoComplete="off"
          value={ingredientSearch}
          onChange={(e) => {
            setIngredientSearch(e.target.value)
            setManualIngredientId('')
          }}
          placeholder="Начните вводить, например: Авокадо"
        />
        {filteredIngredientsForManual.length > 0 && (
          <ul className="ingredient-combobox-list" role="listbox" aria-label="Совпадения по ингредиентам">
            {filteredIngredientsForManual.map((ing) => (
              <li key={ing.id}>
                <button type="button" className="ingredient-combobox-item" onClick={() => pickIngredientForManual(ing)}>
                  {ing.name} <span className="ingredient-combobox-unit">({ing.unit})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )

  const handleManualStockIn = async () => {
    const id = resolveManualIngredientId()
    if (id == null || !manualInQty) {
      alert('Выберите ингредиент из подсказок или введите название полностью, как в справочнике')
      return
    }
    const qty = parseFloat(manualInQty.replace(',', '.'))
    if (!Number.isFinite(qty) || qty <= 0) {
      alert('Укажите количество больше нуля')
      return
    }
    setManualSubmitting(true)
    try {
      await restaurantService.stockIn(id, qty, manualInNote.trim() || undefined)
      setShowManualInModal(false)
      resetManualInForm()
      clearCache(STOCK_MOVEMENTS_CACHE_KEY)
      setCurrentPage(0)
      await loadMovements(false)
    } catch (error: any) {
      alert(error.response?.data?.message || error.message || 'Не удалось оформить приход')
    } finally {
      setManualSubmitting(false)
    }
  }

  const handleManualStockOut = async () => {
    const id = resolveManualIngredientId()
    if (id == null || !manualOutQty) {
      alert('Выберите ингредиент из подсказок или введите название полностью, как в справочнике')
      return
    }
    const qty = parseFloat(manualOutQty.replace(',', '.'))
    if (!Number.isFinite(qty) || qty <= 0) {
      alert('Укажите количество больше нуля')
      return
    }
    setManualSubmitting(true)
    try {
      await restaurantService.stockOut(id, qty, manualOutReason, manualOutNote.trim() || undefined)
      setShowManualOutModal(false)
      resetManualOutForm()
      clearCache(STOCK_MOVEMENTS_CACHE_KEY)
      setCurrentPage(0)
      await loadMovements(false)
    } catch (error: any) {
      alert(error.response?.data?.message || error.message || 'Не удалось оформить списание')
    } finally {
      setManualSubmitting(false)
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
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {canStockIn(user) && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={uploading || manualSubmitting}
              onClick={() => {
                resetManualInForm()
                setShowManualInModal(true)
              }}
            >
              Приход вручную
            </button>
          )}
          {canStockOut(user) && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={uploading || manualSubmitting}
              onClick={() => {
                resetManualOutForm()
                setShowManualOutModal(true)
              }}
            >
              Списание вручную
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <ExcelHoverHint hint={STOCK_MOVEMENTS_EXCEL_HINT}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn btn-primary"
            >
              {uploading ? 'Загрузка...' : 'Загрузить Excel'}
            </button>
          </ExcelHoverHint>
          <button
            type="button"
            onClick={async () => {
              try {
                await stockService.downloadStockExcelAsFile('ingredients-stock.xlsx')
              } catch (e: unknown) {
                console.error(e)
                const msg = e instanceof Error ? e.message : 'Не удалось скачать Excel'
                alert(msg)
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

      <Modal
        isOpen={showManualInModal}
        onClose={() => {
          setShowManualInModal(false)
          resetManualInForm()
        }}
        title="Приход на склад"
      >
        {loadingIngredients ? (
          <p>Загрузка ингредиентов…</p>
        ) : (
          <>
            {ingredientComboboxField}
            <FormInput
              label="Количество"
              type="number"
              value={manualInQty}
              onChange={setManualInQty}
              min={0.0001}
              step={0.0001}
              required
            />
            <FormInput label="Комментарий (необязательно)" value={manualInNote} onChange={setManualInNote} />
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={manualSubmitting}
                onClick={() => {
                  setShowManualInModal(false)
                  resetManualInForm()
                }}
              >
                Отмена
              </button>
              <button type="button" className="btn-primary" disabled={manualSubmitting} onClick={handleManualStockIn}>
                {manualSubmitting ? 'Сохранение…' : 'Оформить приход'}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        isOpen={showManualOutModal}
        onClose={() => {
          setShowManualOutModal(false)
          resetManualOutForm()
        }}
        title="Списание со склада"
      >
        {loadingIngredients ? (
          <p>Загрузка ингредиентов…</p>
        ) : (
          <>
            {ingredientComboboxField}
            <FormInput
              label="Количество"
              type="number"
              value={manualOutQty}
              onChange={setManualOutQty}
              min={0.0001}
              step={0.0001}
              required
            />
            <div className="form-input">
              <label>
                Причина <span className="required">*</span>
              </label>
              <select
                value={manualOutReason}
                onChange={(e) => setManualOutReason(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="SPOILAGE">Порча</option>
                <option value="EXPIRED">Просрочка</option>
                <option value="INVENTORY">Инвентаризация</option>
                <option value="OTHER">Прочее</option>
              </select>
            </div>
            <FormInput label="Комментарий (необязательно)" value={manualOutNote} onChange={setManualOutNote} />
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={manualSubmitting}
                onClick={() => {
                  setShowManualOutModal(false)
                  resetManualOutForm()
                }}
              >
                Отмена
              </button>
              <button type="button" className="btn-primary" disabled={manualSubmitting} onClick={handleManualStockOut}>
                {manualSubmitting ? 'Сохранение…' : 'Оформить списание'}
              </button>
            </div>
          </>
        )}
      </Modal>

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
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
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
            ) : errorDialog.type === 'INGREDIENT_MISSING' ? (
              <>
                <p>
                  Ингредиента «{errorDialog.item}» нет в справочнике (стр. данных в файле: {errorDialog.rowNumber}
                  ).
                  <br />
                  Unit из файла: <strong>{errorDialog.providedUnit ?? '—'}</strong>
                  <br />
                  Пропустить строку или создать новый ингредиент?
                </p>
                <label style={{ display: 'block', marginTop: '16px', fontWeight: 500 }}>
                  Минимальный остаток (мин. количество)
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={ingredientMissingMinQtyDraft}
                    onChange={(e) => setIngredientMissingMinQtyDraft(e.target.value)}
                    style={{ display: 'block', marginTop: '6px', width: '100%', maxWidth: 220, padding: '8px' }}
                  />
                </label>
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" type="button" onClick={() => handleResolveIngredientMissing(false)}>
                    Пропустить строку
                  </button>
                  <button className="btn btn-primary" type="button" onClick={() => handleResolveIngredientMissing(true)}>
                    Создать новый ингредиент
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Unit товара "{errorDialog.item}" не указан, пожалуйста, укажите его:
                </p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
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
