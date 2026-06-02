import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { restaurantService } from '../../api/services'
import { retryOnRateLimit } from '../../utils/apiRetry'
import { getCache, setCache, clearCache, clearCacheByPrefix } from '../../utils/cache'
import type { Ingredient } from '../../api/types'
import DataTable from '../../components/DataTable'
import Modal from '../../components/Modal'
import FormInput from '../../components/FormInput'
import SearchBar from '../../components/SearchBar'
import { useOutletContext } from 'react-router-dom'
import type { User } from '../../api/types'
import ExcelHoverHint from '../../components/ExcelHoverHint'
import './Ingredients.css'

const INGREDIENTS_CACHE_KEY = 'ingredients_cache'
const PAGE_SIZE = 20

const INGREDIENTS_EXCEL_HINT = `Формат .xlsx (один лист):
• Столбец 1: Name
• Столбец 2: Unit (G, ML или PCS)
• Столбец 3: Min Quantity

Первая строка — заголовок, в импорт не входит (данные со 2-й строки). Остаток на складе не меняется.`

export default function Ingredients() {
  const { user } = useOutletContext<{ user?: User }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [belowMin, setBelowMin] = useState(searchParams.get('belowMin') === '1')
  const [currentPage, setCurrentPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)

  const cacheKey = `${INGREDIENTS_CACHE_KEY}_${search}_${belowMin}_${currentPage}_${PAGE_SIZE}`
  const cachedData = getCache<Ingredient[]>(cacheKey)
  const [ingredients, setIngredients] = useState<Ingredient[]>(cachedData || [])
  const [loading, setLoading] = useState(!cachedData)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showStockInModal, setShowStockInModal] = useState(false)
  const [showStockOutModal, setShowStockOutModal] = useState(false)
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null)

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    unit: 'G' as 'G' | 'ML' | 'PCS',
    stockQty: '',
    minQty: '',
  })
  const [stockInQty, setStockInQty] = useState('')
  const [stockInNote, setStockInNote] = useState('')
  const [stockOutQty, setStockOutQty] = useState('')
  const [stockOutReason, setStockOutReason] = useState('SPOILAGE')
  const [stockOutNote, setStockOutNote] = useState('')
  const [minQtyDisplay, setMinQtyDisplay] = useState('')
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => {
    setCurrentPage(0)
  }, [search, belowMin])

  useEffect(() => {
    const cached = getCache<Ingredient[]>(cacheKey)

    if (cached) {
      setIngredients(cached)
      setLoading(false)
      const timeoutId = setTimeout(() => {
        loadIngredients(true)
      }, 200)
      return () => clearTimeout(timeoutId)
    } else {
      loadIngredients(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, belowMin, currentPage])

  const loadIngredients = async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true)
    }
    try {
      const page = await retryOnRateLimit(
        () =>
          restaurantService.getIngredientsPage({
            page: currentPage,
            size: PAGE_SIZE,
            search: search || undefined,
            belowMin,
          }),
        1,
        200
      )
      const list = page.content
      setIngredients(list)
      setTotalPages(page.totalPages)
      setTotalElements(page.totalElements)
      setCache(cacheKey, list)
      console.log(
        `[Ingredients] ${isBackground ? 'Background' : 'Initial'} page ${currentPage + 1}/${Math.max(1, page.totalPages)}, ${list.length} rows, total ${page.totalElements}`
      )
    } catch (error) {
      console.error('Failed to load ingredients:', error)
      clearCache(cacheKey)
      // Do not force an empty list on failure (avoids "no rows" after a transient API error while create still sees DB state).
      // On background error, keep existing data.
    } finally {
      if (!isBackground) {
        setLoading(false)
      }
    }
  }

  const handleExcelSelect = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const resp = await restaurantService.uploadIngredientsExcel(file)
      if (resp?.hasErrors) {
        const msg = [
          `Imported with errors.`,
          `Processed: ${resp.processedCount}, created: ${resp.createdCount}, updated: ${resp.updatedCount}.`,
          `First errors:\n${(resp.errors || []).slice(0, 10).map((e: any) => `- row ${e.rowNumber}: ${e.item} (${e.type})`).join('\n')}`,
        ].join('\n')
        alert(msg)
      } else {
        alert(`Imported successfully.\nProcessed: ${resp.processedCount}, created: ${resp.createdCount}, updated: ${resp.updatedCount}.`)
      }
      clearCacheByPrefix(INGREDIENTS_CACHE_KEY)
      loadIngredients(false)
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Failed to import Excel')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleCreate = async () => {
    if (!formData.name) {
      alert('Please enter ingredient name')
      return
    }
    
    const stockQtyNum = formData.stockQty === '' ? 0 : parseFloat(formData.stockQty)
    if (formData.stockQty !== '' && (isNaN(stockQtyNum) || stockQtyNum < 0)) {
      alert('Please enter a valid stock quantity')
      return
    }
    
    const minQtyNum = formData.minQty === '' ? 0 : parseFloat(formData.minQty)
    if (formData.minQty !== '' && (isNaN(minQtyNum) || minQtyNum < 0)) {
      alert('Please enter a valid minimum quantity')
      return
    }
    
    try {
      await restaurantService.createIngredient({
        name: formData.name,
        unit: formData.unit,
        stockQty: stockQtyNum,
        minQty: minQtyNum,
      })
      setShowCreateModal(false)
      setFormData({ name: '', unit: 'G', stockQty: '', minQty: '' })
      setMinQtyDisplay('')
      // Clear cache and reload
      clearCacheByPrefix(INGREDIENTS_CACHE_KEY)
      loadIngredients(false)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to create ingredient')
    }
  }

  const handleStockIn = async () => {
    if (!selectedIngredient || !stockInQty) return
    const qty = parseFloat(stockInQty)
    if (isNaN(qty) || qty < 1) {
      alert('Please enter a valid quantity (minimum 1)')
      return
    }
    try {
      await restaurantService.stockIn(
        selectedIngredient.id,
        qty,
        stockInNote || undefined
      )
      setShowStockInModal(false)
      setStockInQty('')
      setStockInNote('')
      setSelectedIngredient(null)
      // Clear cache and reload
      clearCacheByPrefix(INGREDIENTS_CACHE_KEY)
      loadIngredients(false)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to process stock in')
    }
  }

  const handleStockOut = async () => {
    if (!selectedIngredient || !stockOutQty) return
    const qty = parseFloat(stockOutQty)
    if (isNaN(qty) || qty < 1) {
      alert('Please enter a valid quantity (minimum 1)')
      return
    }
    try {
      await restaurantService.stockOut(
        selectedIngredient.id,
        qty,
        stockOutReason,
        stockOutNote || undefined
      )
      setShowStockOutModal(false)
      setStockOutQty('')
      setStockOutReason('SPOILAGE')
      setStockOutNote('')
      setSelectedIngredient(null)
      // Clear cache and reload
      clearCacheByPrefix(INGREDIENTS_CACHE_KEY)
      loadIngredients(false)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to process stock out')
    }
  }

  const handleDelete = async (ingredient: Ingredient) => {
    if (!confirm(`Are you sure you want to delete "${ingredient.name}"? This action cannot be undone.`)) {
      return
    }
    
    try {
      await restaurantService.deleteIngredient(ingredient.id)
      // Clear cache and reload
      clearCacheByPrefix(INGREDIENTS_CACHE_KEY)
      loadIngredients(false)
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete ingredient')
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
    },
    {
      key: 'unit',
      header: 'Unit',
    },
    {
      key: 'stockQty',
      header: 'Stock Qty',
      render: (item: Ingredient) => item.stockQty.toFixed(2),
    },
    {
      key: 'minQty',
      header: 'Min Qty',
      render: (item: Ingredient) => item.minQty.toFixed(2),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Ingredient) => (
        <span className={item.stockQty < item.minQty ? 'status-low' : 'status-ok'}>
          {item.stockQty < item.minQty ? 'LOW' : 'OK'}
        </span>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: 'actions',
            header: 'Actions',
            render: (item: Ingredient) => (
              <div className="action-buttons">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedIngredient(item)
                    setShowStockInModal(true)
                  }}
                  className="btn-small btn-primary"
                >
                  Stock In
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedIngredient(item)
                    setShowStockOutModal(true)
                  }}
                  className="btn-small btn-secondary"
                >
                  Stock Out
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(item)
                  }}
                  className="btn-small btn-danger"
                >
                  Delete
                </button>
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="ingredients-page">
      <div className="page-header">
        <h1>Ingredients</h1>
        {isAdmin && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              style={{ display: 'none' }}
              onChange={(e) => handleExcelSelect(e.target.files?.[0] || null)}
            />
            <ExcelHoverHint hint={INGREDIENTS_EXCEL_HINT}>
              <button
                className="btn-secondary"
                disabled={uploading || exporting}
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Importing…' : 'Import Excel'}
              </button>
            </ExcelHoverHint>
            <button
              className="btn-secondary"
              disabled={uploading || exporting}
              type="button"
              onClick={async () => {
                setExporting(true)
                try {
                  const date = new Date().toISOString().slice(0, 10)
                  await restaurantService.downloadIngredientsExcel(`ingredients_${date}.xlsx`)
                } catch (e: unknown) {
                  console.error(e)
                  const msg = e instanceof Error ? e.message : 'Не удалось скачать Excel'
                  alert(msg)
                } finally {
                  setExporting(false)
                }
              }}
            >
              {exporting ? 'Exporting…' : 'Download Excel'}
            </button>
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
              Add Ingredient
            </button>
          </div>
        )}
      </div>

      <div className="filters">
        <SearchBar value={search} onChange={setSearch} placeholder="Search ingredients..." />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={belowMin}
            onChange={(e) => {
              setBelowMin(e.target.checked)
              if (e.target.checked) {
                setSearchParams({ belowMin: '1' })
              } else {
                setSearchParams({})
              }
            }}
          />
          Show only below minimum
        </label>
      </div>

      <DataTable
        data={ingredients}
        columns={columns}
        loading={loading}
        emptyMessage="No ingredients found"
      />

      {totalPages > 1 && (
        <div className="ingredients-pagination">
          <button
            type="button"
            onClick={() => setCurrentPage(0)}
            disabled={currentPage === 0 || loading}
            className="btn-secondary"
          >
            First
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0 || loading}
            className="btn-secondary"
          >
            Previous
          </button>
          <span>
            Page {currentPage + 1} of {totalPages} ({totalElements} total)
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => p + 1)}
            disabled={currentPage >= totalPages - 1 || loading}
            className="btn-secondary"
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage(Math.max(0, totalPages - 1))}
            disabled={currentPage >= totalPages - 1 || loading}
            className="btn-secondary"
          >
            Last
          </button>
        </div>
      )}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setFormData({ name: '', unit: 'G', stockQty: '', minQty: '' })
          setMinQtyDisplay('')
        }}
        title="Create Ingredient"
      >
        <FormInput
          label="Name"
          value={formData.name}
          onChange={(v) => setFormData({ ...formData, name: v })}
          required
        />
        <div className="form-input">
          <label>
            Unit <span className="required">*</span>
          </label>
          <select
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value as any })}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
          >
            <option value="G">Grams (G)</option>
            <option value="ML">Milliliters (ML)</option>
            <option value="PCS">Pieces (PCS)</option>
          </select>
        </div>
        <FormInput
          label="Minimum Quantity"
          type="number"
          value={minQtyDisplay}
          onChange={(v) => {
            // Убираем ведущие нули при вводе
            let cleanedValue = v
            if (v.length > 1 && v.startsWith('0') && v[1] !== '.') {
              cleanedValue = v.replace(/^0+/, '') || '0'
            }
            setMinQtyDisplay(cleanedValue)
            // Обновляем значение как строку
            setFormData({ ...formData, minQty: cleanedValue })
          }}
          onFocus={() => {
            if (minQtyDisplay === '' || minQtyDisplay === '0') {
              setMinQtyDisplay('')
              setFormData({ ...formData, minQty: '' })
            }
          }}
          min={0}
          step={1}
          required
        />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleCreate}>
            Create
          </button>
        </div>
      </Modal>

      {/* Stock In Modal */}
      <Modal
        isOpen={showStockInModal}
        onClose={() => {
          setShowStockInModal(false)
          setSelectedIngredient(null)
          setStockInQty('')
          setStockInNote('')
        }}
        title={`Stock In - ${selectedIngredient?.name}`}
      >
        <FormInput
          label="Quantity"
          type="number"
          value={stockInQty}
          onChange={setStockInQty}
          min={1}
          step={1}
          required
        />
        <FormInput
          label="Note (optional)"
          value={stockInNote}
          onChange={setStockInNote}
        />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setShowStockInModal(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleStockIn}>
            Stock In
          </button>
        </div>
      </Modal>

      {/* Stock Out Modal */}
      <Modal
        isOpen={showStockOutModal}
        onClose={() => {
          setShowStockOutModal(false)
          setSelectedIngredient(null)
          setStockOutQty('')
          setStockOutReason('SPOILAGE')
          setStockOutNote('')
        }}
        title={`Stock Out - ${selectedIngredient?.name}`}
      >
        <FormInput
          label="Quantity"
          type="number"
          value={stockOutQty}
          onChange={setStockOutQty}
          min={1}
          step={1}
          required
        />
        <div className="form-input">
          <label>
            Reason <span className="required">*</span>
          </label>
          <select
            value={stockOutReason}
            onChange={(e) => setStockOutReason(e.target.value)}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
          >
            <option value="SPOILAGE">Spoilage</option>
            <option value="EXPIRED">Expired</option>
            <option value="INVENTORY">Inventory Adjustment</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <FormInput
          label="Note (optional)"
          value={stockOutNote}
          onChange={setStockOutNote}
        />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setShowStockOutModal(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleStockOut}>
            Stock Out
          </button>
        </div>
      </Modal>
    </div>
  )
}
