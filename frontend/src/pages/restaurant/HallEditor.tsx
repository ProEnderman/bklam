/**
 * HallEditor - Optimized React component for editing hall maps
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * 1. Spatial Index: Grid-based occupancy map for O(1) hit-testing and collision checks
 *    - Replaces O(n) scans over all items in mousemove handlers
 *    - Used for: hit-test, collision detection, "too close to table" checks
 * 
 * 2. Fast Lookup Maps: Memoized Maps for assets, tables, zones (O(1) access)
 *    - assetsById, tablesById, zonesById, zoneCellSets
 *    - Avoids repeated array.find() calls in renderItem
 * 
 * 3. Transient State in Refs: dragPreview, panOffset, currentMouseCell stored in refs
 *    - Avoids React re-renders during mouse movement
 *    - State only updated on interaction end (mouseup)
 * 
 * 4. requestAnimationFrame: Pan/zoom transforms applied directly to DOM
 *    - Bypasses React render cycle for smooth 60fps interactions
 * 
 * 5. Virtualization: Only render items visible in viewport
 *    - Calculates visible bounds from container size, pan, zoom
 *    - Filters items before rendering (reduces DOM nodes from 1k-5k to ~50-200)
 * 
 * 6. React.memo: HallItem component with custom comparison
 *    - Only re-renders when props actually change (position, rotation, selection)
 *    - Uses transform3d for GPU acceleration
 * 
 * 7. Performance Instrumentation: console.time for index rebuild, rendered items count
 *    - Warns if mousemove handler exceeds 2ms target
 */
import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react'
import { hallService } from '../../api/services'
import type { HallAsset, HallPlacedItem, HallView, HallZone, HallTable, HallItemsPatchRequest } from '../../api/types'
import Modal from '../../components/Modal'
import FormInput from '../../components/FormInput'
import SearchableSingleSelect from '../../components/SearchableSingleSelect'
import { SpatialIndex } from '../../utils/spatialIndex'
import './HallMap.css'

type Mode = 'OBJECTS' | 'ZONES' | 'WAITER_VIEW'
type ToolMode = 'DRAW' | 'ERASE' | 'MOVE'

const CELL_SIZE = 16

const defaultBuiltinAssets: Array<Pick<HallAsset, 'id' | 'name' | 'type' | 'widthCells' | 'heightCells' | 'imageUrl'>> =
  [
    { id: -1, name: 'Стол (дефолт)', type: 'TABLE', widthCells: 3, heightCells: 2, imageUrl: undefined },
    // Для стены и стула размер 1×1, чтобы то, что показано в палитре, совпадало с тем, что реально рисуется
    { id: -2, name: 'Стена', type: 'DECOR', widthCells: 1, heightCells: 1, imageUrl: undefined },
    { id: -3, name: 'Стул', type: 'DECOR', widthCells: 1, heightCells: 1, imageUrl: undefined },
  ]

// Memoized HallItem component for performance
// Only re-renders when props actually change
interface HallItemProps {
  item: HallPlacedItem
  asset: HallAsset | null
  table: HallTable | null
  isDragging: boolean
  dragX: number | null
  dragY: number | null
  isSelected: boolean
  isInPolygonZone: boolean
  pointerEventsNone?: boolean // Отключает клики на элементе (например, при рисовании полигона)
  onContextMenu: (e: React.MouseEvent) => void
  onMouseDown: (e: React.MouseEvent) => void
  onClick: (e: React.MouseEvent) => void
}

const HallItem = memo(({ item, asset, table, isDragging, dragX, dragY, isSelected, isInPolygonZone, pointerEventsNone, onContextMenu, onMouseDown, onClick }: HallItemProps) => {
  const rotation = item.rotation || 0

  // DEBUG: выводим для элементов с поворотом
  if (item.rotation && item.rotation !== 0) {
    console.log(`[HallItem] ROTATED: id=${item.id}, rotation=${item.rotation}, size=${item.w}x${item.h}`)
  }

  // Контейнер с размерами item.w x item.h (hitbox для collision detection)
  const style: React.CSSProperties = {
    position: 'absolute',
    left: item.x * CELL_SIZE,
    top: item.y * CELL_SIZE,
    width: item.w * CELL_SIZE,
    height: item.h * CELL_SIZE,
    zIndex: item.layer || 0,
    transform: 'translate3d(0, 0, 0)',
    opacity: isDragging ? 0.4 : 1,
    pointerEvents: pointerEventsNone ? 'none' : 'auto', // Отключаем клики при рисовании полигона
  }

  const baseClass = item.type === 'TABLE' ? 'hall-item hall-item-table' : 'hall-item hall-item-decor'
  let cls = isSelected ? `${baseClass} hall-item-selected` : baseClass
  if (isInPolygonZone && item.type === 'TABLE') {
    cls += ' hall-item-in-polygon'
  }

  // Превью
  const previewStyle: React.CSSProperties | null = isDragging && dragX !== null && dragY !== null ? {
    position: 'absolute',
    left: dragX * CELL_SIZE,
    top: dragY * CELL_SIZE,
    width: item.w * CELL_SIZE,
    height: item.h * CELL_SIZE,
    zIndex: (item.layer || 0) + 100,
    transform: 'translate3d(0, 0, 0)',
    pointerEvents: 'none',
  } : null

  const renderContent = (forPreview = false) => {
    if (asset?.imageUrl) {
      // Для 90/270 градусов: изображение должно быть h×w перед поворотом,
      // чтобы после поворота стать w×h и идеально заполнить контейнер
      const needsSwap = rotation === 90 || rotation === 270
      const imgWidth = needsSwap ? item.h * CELL_SIZE : item.w * CELL_SIZE
      const imgHeight = needsSwap ? item.w * CELL_SIZE : item.h * CELL_SIZE
      
      return (
        <img
          src={asset.imageUrl}
          alt=""
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: imgWidth,
            height: imgHeight,
            objectFit: 'fill', // Заполняет всю область (уже правильные пропорции)
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            opacity: forPreview ? 0.7 : 1,
          }}
          draggable={false}
        />
      )
    } else if (item.type === 'TABLE') {
      return (
        <div className="hall-item-fallback" style={{ opacity: forPreview ? 0.7 : 1 }}>
          <div className="hall-item-title">{table?.label || 'Стол'}</div>
        </div>
      )
    }
    return null
  }

  return (
    <>
      {/* Оригинальный элемент */}
      <div
        className={cls}
        style={style}
        title={table ? `Стол ${table.label}` : asset?.name}
        onContextMenu={onContextMenu}
        onMouseDown={onMouseDown}
        onClick={onClick}
      >
        {renderContent(false)}
      </div>
      {/* Превью при перетаскивании */}
      {previewStyle && (
        <div
          className={`${baseClass} hall-item-drag-preview`}
          style={previewStyle}
        >
          {renderContent(true)}
        </div>
      )}
    </>
  )
}, (prev, next) => {
  // Custom comparison for React.memo
  return (
    prev.item.id === next.item.id &&
    prev.item.x === next.item.x &&
    prev.item.y === next.item.y &&
    prev.item.w === next.item.w &&
    prev.item.h === next.item.h &&
    prev.item.rotation === next.item.rotation &&
    prev.item.layer === next.item.layer &&
    prev.isDragging === next.isDragging &&
    prev.dragX === next.dragX &&
    prev.dragY === next.dragY &&
    prev.isSelected === next.isSelected &&
    prev.asset?.id === next.asset?.id &&
    prev.table?.id === next.table?.id
  )
})

HallItem.displayName = 'HallItem'

export default function HallEditor() {
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<HallView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('OBJECTS')
  const [selectedZoneId, setSelectedZoneId] = useState<number | 'ALL'>('ALL')

  // Objects mode state
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null)
  const [placingTypeOverride, setPlacingTypeOverride] = useState<'ASSET' | 'TABLE' | 'DECOR'>('ASSET')
  const [rotation, setRotation] = useState(0)
  const [layer, setLayer] = useState(0)
  const [toolMode, setToolMode] = useState<ToolMode>('DRAW')
  const [eraseRadius, setEraseRadius] = useState(0)

  // Zones mode state
  const [isPaintingZone, setIsPaintingZone] = useState(false)
  const [paintedZoneCells, setPaintedZoneCells] = useState<Set<string>>(new Set())
  const [paintMode, setPaintMode] = useState<'ADD' | 'REMOVE'>('ADD')
  const [showZoneModal, setShowZoneModal] = useState(false)
  const [zoneForm, setZoneForm] = useState<{ name: string; color: string; activeForWaiter: boolean }>({
    name: '',
    color: '#dc2626', // Красный по умолчанию
    activeForWaiter: true,
  })
  const [hoveredZoneId, setHoveredZoneId] = useState<number | null>(null)
  
  // Zone editing state
  const [editingZone, setEditingZone] = useState<HallZone | null>(null)
  const [editZoneForm, setEditZoneForm] = useState<{ name: string; color: string }>({ name: '', color: '#dc2626' })
  const [editingZoneId, setEditingZoneId] = useState<number | null>(null) // ID зоны при редактировании границ
  
  // Polygon zone creation state
  const [polygonVertices, setPolygonVertices] = useState<Array<{ x: number; y: number }>>([])
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false)
  const [polygonPreviewCells, setPolygonPreviewCells] = useState<Set<string>>(new Set())
  const [isPolygonClosed, setIsPolygonClosed] = useState(false)
  const [mouseGridPos, setMouseGridPos] = useState<{ x: number; y: number } | null>(null)
  const [isShiftPressed, setIsShiftPressed] = useState(false)
  const [draggingVertexIndex, setDraggingVertexIndex] = useState<number | null>(null) // Индекс перетаскиваемой вершины
  const polygonHistoryRef = useRef<Array<Array<{ x: number; y: number }>>>([]) // История для Ctrl+Z

  // Table management (MVP: create table label/capacity when placing table)
  const [showTableModal, setShowTableModal] = useState(false)
  const [tableForm, setTableForm] = useState<{ label: string; capacity: string }>({ label: '', capacity: '2' })
  const pendingTablePlacementRef = useRef<{ x: number; y: number; baseW: number; baseH: number; assetId?: number } | null>(
    null
  )

  // Asset upload/creation
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [assetForm, setAssetForm] = useState<{
    name: string
    type: 'TABLE' | 'DECOR'
    widthCells: string
    heightCells: string
    defaultCapacity: string
  }>({
    name: '',
    type: 'DECOR',
    widthCells: '1',
    heightCells: '1',
    defaultCapacity: '2',
  })
  const [assetImageFile, setAssetImageFile] = useState<File | null>(null)

  // Object painting (decor/walls)
  const [isPaintingObjects, setIsPaintingObjects] = useState(false)
  const [paintedObjectCells, setPaintedObjectCells] = useState<Set<string>>(new Set())
  const paintedObjectCellsRef = useRef<Set<string>>(new Set()) // Синхронная копия для mouseUp
  const lastPaintCoordRef = useRef<{ x: number; y: number } | null>(null)
  const paintStartCoordRef = useRef<{ x: number; y: number } | null>(null) // Для Shift-привязки
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null)
  // selectedItemId нужен синхронно в keydown (state обновляется асинхронно)
  const selectedItemIdRef = useRef<number | null>(null)
  const [draggingItemId, setDraggingItemIdState] = useState<number | null>(null)
  const draggingItemIdRef = useRef<number | null>(null) // Ref для синхронного доступа
  // Обёртка для синхронного обновления ref и state
  const setDraggingItemId = useCallback((id: number | null | ((prev: number | null) => number | null)) => {
    if (typeof id === 'function') {
      setDraggingItemIdState((prev) => {
        const newId = id(prev)
        draggingItemIdRef.current = newId
        return newId
      })
    } else {
      draggingItemIdRef.current = id
      setDraggingItemIdState(id)
    }
  }, [])
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null)
  const [dragPreviewPos, setDragPreviewPos] = useState<{ x: number; y: number } | null>(null) // Для визуального превью
  const [history, setHistory] = useState<HallPlacedItem[][]>([]) // Undo stack
  const [redoHistory, setRedoHistory] = useState<HallPlacedItem[][]>([]) // Redo stack
  const itemsRef = useRef<HallPlacedItem[]>([]) // Ref для актуального состояния items
  const historyRef = useRef<HallPlacedItem[][]>([]) // Ref для актуальной истории
  const redoHistoryRef = useRef<HallPlacedItem[][]>([]) // Ref для актуальной redo истории
  const isUndoingRef = useRef(false) // Защита от множественных вызовов undo
  const isRedoingRef = useRef(false) // Защита от множественных вызовов redo
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null)
  const eraserStartedRef = useRef(false)
  const justMovedRef = useRef(false)
  
  // Маппинг временных ID на серверные (для перетаскивания новых элементов)
  const tempToServerIdMapRef = useRef<Map<number, number>>(new Map())

  // PATCH operations state (differential updates)
  const [dirtyAdds, setDirtyAdds] = useState<Map<number, HallPlacedItem>>(new Map()) // clientId -> Item
  const [dirtyUpdates, setDirtyUpdates] = useState<Map<number, Partial<HallPlacedItem>>>(new Map()) // id -> Partial<Item>
  const [dirtyRemoves, setDirtyRemoves] = useState<Set<number>>(new Set()) // ids
  const pendingPatchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextClientIdRef = useRef(1) // Для временных ID новых items
  
  // Refs для хранения актуальных значений (чтобы избежать проблем с зависимостями)
  const dirtyAddsRef = useRef<Map<number, HallPlacedItem>>(new Map())
  const dirtyUpdatesRef = useRef<Map<number, Partial<HallPlacedItem>>>(new Map())
  const dirtyRemovesRef = useRef<Set<number>>(new Set())
  
  // Синхронизируем refs с state
  useEffect(() => {
    selectedItemIdRef.current = selectedItemId
  }, [selectedItemId])

  useEffect(() => {
    dirtyAddsRef.current = dirtyAdds
  }, [dirtyAdds])
  
  useEffect(() => {
    dirtyUpdatesRef.current = dirtyUpdates
  }, [dirtyUpdates])
  
  useEffect(() => {
    dirtyRemovesRef.current = dirtyRemoves
  }, [dirtyRemoves])

  // Pan & Zoom state - moved transient state to refs for performance
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const panOffsetRef = useRef({ x: 0, y: 0 }) // For requestAnimationFrame updates
  const [isPanning, setIsPanning] = useState(false)
  const isPanningRef = useRef(false)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const panStartRef = useRef<{ x: number; y: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const rafIdRef = useRef<number | null>(null)
  
  // Transient interaction state in refs (to avoid re-renders)
  const currentMouseCellRef = useRef<{ x: number; y: number } | null>(null)
  const dragPreviewRef = useRef<{ id: number; x: number; y: number } | null>(null)
  
  // Spatial index for fast O(1) lookups
  const spatialIndexRef = useRef(new SpatialIndex())
  
  // Performance instrumentation
  const renderCountRef = useRef(0)
  
  // Zoom accumulator для менее чувствительного зума (нужно больше движения)
  const zoomAccumulatorRef = useRef(0)
  
  // Canvas refs (must be declared before use in useEffect)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  const hasCenteredRef = useRef(false)

  const loadRef = useRef<() => Promise<void>>()
  
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await hallService.getView()
      setView(data)
      
      // Сохраняем начальное состояние в историю при загрузке карты
      // Это позволяет отменить первое действие
      // Начальный снимок никогда не удаляется из истории
      if (data?.items) {
        const initialSnapshot = data.items.map((it) => ({ ...it }))
        console.log('[HallEditor] Saving initial state to history:', { itemsCount: initialSnapshot.length })
        setHistory([initialSnapshot])
        historyRef.current = [initialSnapshot]
        setRedoHistory([])
        redoHistoryRef.current = []
      }
    } catch (e: any) {
      console.error('Failed to load hall view', e)
      const errorMsg = e?.response?.data?.message || e?.message || 'Не удалось загрузить карту зала'
      setError(errorMsg)
      alert(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [])
  
  loadRef.current = load

  useEffect(() => {
    load()
  }, [load])

  // Блокируем зум страницы глобально
  useEffect(() => {
    const preventZoom = (e: WheelEvent) => {
      // Блокируем только Ctrl/Cmd + колесо вне карты, чтобы страница не зумилась.
      // Обычный вертикальный скролл везде оставляем включённым.
      if (!e.ctrlKey && !e.metaKey) {
        return
      }
      const target = e.target as HTMLElement
      if (!target.closest('.hall-canvas-wrap') && !target.closest('.hall-canvas')) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const preventTouchZoom = (e: TouchEvent) => {
      // Блокируем pinch-to-zoom на странице
      if (e.touches.length > 1) {
        const target = e.target as HTMLElement
        if (!target.closest('.hall-canvas-wrap') && !target.closest('.hall-canvas')) {
          e.preventDefault()
        }
      }
    }

    // Блокируем зум через клавиатуру (Ctrl/Cmd + +/-)
    const preventKeyboardZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        const target = e.target as HTMLElement
        if (!target.closest('.hall-canvas-wrap') && !target.closest('.hall-canvas')) {
          e.preventDefault()
        }
      }
    }

    document.addEventListener('wheel', preventZoom, { passive: false, capture: true })
    document.addEventListener('touchstart', preventTouchZoom, { passive: false, capture: true })
    document.addEventListener('touchmove', preventTouchZoom, { passive: false, capture: true })
    document.addEventListener('keydown', preventKeyboardZoom, { capture: true })

    return () => {
      document.removeEventListener('wheel', preventZoom, { capture: true } as any)
      document.removeEventListener('touchstart', preventTouchZoom, { capture: true } as any)
      document.removeEventListener('touchmove', preventTouchZoom, { capture: true } as any)
      document.removeEventListener('keydown', preventKeyboardZoom, { capture: true } as any)
    }
  }, [])

  const map = view?.map
  const zones = view?.zones || []
  const assets = useMemo(() => {
    const apiAssets = view?.assets || []
    // Builtins go first, then uploaded
    return [...defaultBuiltinAssets, ...apiAssets] as HallAsset[]
  }, [view?.assets])
  const tables = view?.tables || []

  // Центрируем карту при первой загрузке (только один раз)
  useEffect(() => {
    if (!map || !canvasWrapRef.current || hasCenteredRef.current) return
    
    try {
      const container = canvasWrapRef.current
      // Ждем, пока контейнер получит размеры
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        // Повторяем попытку через небольшую задержку
        setTimeout(() => {
          if (!canvasWrapRef.current || hasCenteredRef.current) return
          const retryContainer = canvasWrapRef.current
          const mapWidth = map.gridWidth * CELL_SIZE
          const mapHeight = map.gridHeight * CELL_SIZE
          const containerWidth = retryContainer.clientWidth || 800
          const containerHeight = retryContainer.clientHeight || 600
          
          const centerX = mapWidth < containerWidth ? (containerWidth - mapWidth) / 2 : 0
          const centerY = mapHeight < containerHeight ? (containerHeight - mapHeight) / 2 : 0
          
          setPanOffset({ x: centerX, y: centerY })
          panOffsetRef.current = { x: centerX, y: centerY }
          hasCenteredRef.current = true
        }, 100)
        return
      }
      
      const mapWidth = map.gridWidth * CELL_SIZE
      const mapHeight = map.gridHeight * CELL_SIZE
      const containerWidth = container.clientWidth || 800
      const containerHeight = container.clientHeight || 600
      
      // Центрируем карту в viewport (если карта меньше viewport) или показываем начало (если больше)
      const centerX = mapWidth < containerWidth ? (containerWidth - mapWidth) / 2 : 0
      const centerY = mapHeight < containerHeight ? (containerHeight - mapHeight) / 2 : 0
      
      setPanOffset({ x: centerX, y: centerY })
      panOffsetRef.current = { x: centerX, y: centerY }
      hasCenteredRef.current = true
    } catch (e) {
      console.error('Error centering map:', e)
    }
  }, [map])

  // Fast lookup maps (memoized to avoid rebuilding on every render)
  const assetsById = useMemo(() => {
    const map = new Map<number, HallAsset>()
    assets.forEach((a) => map.set(a.id, a))
    return map
  }, [assets])

  const tablesById = useMemo(() => {
    const map = new Map<number, HallTable>()
    tables.forEach((t) => map.set(t.id, t))
    return map
  }, [tables])

  const zonesById = useMemo(() => {
    const map = new Map<number, HallZone>()
    zones.forEach((z) => map.set(z.id, z))
    return map
  }, [zones])

  // Zone cell sets for fast lookup (for non-rectangular zones)
  const zoneCellSets = useMemo(() => {
    const map = new Map<number, Set<string>>()
    zones.forEach((z) => {
      if (z.cells && z.cells.length > 0) {
        const cellSet = new Set<string>()
        z.cells.forEach((c) => cellSet.add(`${c.x},${c.y}`))
        map.set(z.id, cellSet)
      }
    })
    return map
  }, [zones])

  // Persisted items (from server)
  const persistedItems = view?.items || []

  // Merged items (persisted + editing state)
  const items = useMemo(() => {
    const result = new Map<number, HallPlacedItem>()
    
    // Start with persisted items (excluding removed)
    persistedItems.forEach((item) => {
      if (!dirtyRemoves.has(item.id)) {
        result.set(item.id, item)
      }
    })
    
    // Apply updates
    dirtyUpdates.forEach((update, id) => {
      const existing = result.get(id)
      if (existing) {
        result.set(id, { ...existing, ...update })
      }
    })
    
    // Add new items
    dirtyAdds.forEach((item) => {
      result.set(item.id, item)
    })
    
    const itemsArray = Array.from(result.values())
    // Синхронно обновляем ref для использования в undo/redo
    // Это гарантирует, что itemsRef.current всегда содержит актуальное состояние
    itemsRef.current = itemsArray
    return itemsArray
  }, [persistedItems, dirtyAdds, dirtyUpdates, dirtyRemoves])

  // Обновляем ref при изменении истории
  useEffect(() => {
    historyRef.current = history
  }, [history])

  // Обновляем ref при изменении redo истории
  useEffect(() => {
    redoHistoryRef.current = redoHistory
  }, [redoHistory])

  // Rebuild spatial index when items change (separate effect to avoid blocking render)
  useEffect(() => {
    if (items.length === 0) return // Skip if no items
    try {
      const start = performance.now()
      spatialIndexRef.current.build(items)
      const elapsed = performance.now() - start
      if (elapsed > 1) {
        console.warn(`[SpatialIndex] build took ${elapsed.toFixed(2)}ms for ${items.length} items`)
      }
    } catch (e) {
      console.error('Error building spatial index:', e)
    }
  }, [items])

  // Функция отправки патча с debounce
  const flushPatch = useCallback(async (immediate = false) => {
    if (pendingPatchRef.current) {
      clearTimeout(pendingPatchRef.current)
      pendingPatchRef.current = null
    }

    const doFlush = async () => {
      // Используем актуальные значения из refs
      const currentAdds = dirtyAddsRef.current
      const currentUpdates = dirtyUpdatesRef.current
      const currentRemoves = dirtyRemovesRef.current
      
      if (!map) {
        console.warn('[HallEditor] Cannot flush patch: map is not loaded')
        return
      }
      
      if (currentAdds.size === 0 && currentUpdates.size === 0 && currentRemoves.size === 0) {
        return
      }

      // Сохраняем snapshot dirty state перед отправкой, чтобы не потерять изменения, сделанные во время сохранения
      const snapshotAdds = new Map(currentAdds)
      const snapshotUpdates = new Map(currentUpdates)
      const snapshotRemoves = new Set(currentRemoves)

      // Получаем persistedItems из текущего view
      const currentPersistedItems = view?.items || []

      const patch: HallItemsPatchRequest = {
        baseVersion: map.version || null,
        added: Array.from(snapshotAdds.values()).map((item) => ({
          ...item,
          id: item.id < 0 ? 0 : item.id, // Временные ID становятся 0 для backend
        })),
        updated: Array.from(snapshotUpdates.entries()).map(([id, update]) => {
          const existing = currentPersistedItems.find((it) => it.id === id)
          if (!existing) {
            console.warn(`[HallEditor] Cannot update item ${id}: not found in persisted items`)
            return null
          }
          return { ...existing, ...update } as HallPlacedItem
        }).filter((item): item is HallPlacedItem => item !== null),
        removedIds: Array.from(snapshotRemoves),
      }

      // Валидация патча перед отправкой
      if (patch.added.length === 0 && patch.updated.length === 0 && patch.removedIds.length === 0) {
        console.warn('[HallEditor] Patch is empty, skipping')
        return
      }

      console.log(`[HallEditor] Flushing: added=${patch.added.length}, updated=${patch.updated.length}, removed=${patch.removedIds.length}`)
      if (patch.added.length > 0) {
        patch.added.forEach(a => {
          console.log(`  -> ADD: id=${a.id}, rotation=${a.rotation}, size=${a.w}x${a.h}, type=${a.type}`)
        })
      }

      try {
        const response = await hallService.patchItems(patch)
        
        // ПЕРВЫМ ДЕЛОМ создаём маппинг temp ID -> server ID (до обновления view!)
        // ВАЖНО: нельзя сопоставлять "по индексу", т.к. сервер может вернуть upserted в другом порядке
        // (особенно заметно, когда добавили 2 одинаковых спрайта).
        const tempIds = Array.from(snapshotAdds.keys())
        const newServerItems = response.upserted.filter(
          (it) => !currentPersistedItems.some((p) => p.id === it.id)
        )

        if (tempIds.length > 0 && newServerItems.length > 0) {
          const usedServerIds = new Set<number>()

          for (const tempId of tempIds) {
            const tempItem = snapshotAdds.get(tempId)
            if (!tempItem) continue

            // Приоритет: для TABLE сопоставляем по tableId (уникальный для сущности стола)
            let match: HallPlacedItem | undefined
            if (tempItem.type === 'TABLE' && tempItem.tableId) {
              match = newServerItems.find(
                (s) =>
                  !usedServerIds.has(s.id) &&
                  s.type === 'TABLE' &&
                  s.tableId === tempItem.tableId &&
                  s.rotation === (tempItem.rotation ?? 0) &&
                  s.w === (tempItem.w ?? 1) &&
                  s.h === (tempItem.h ?? 1) &&
                  s.x === (tempItem.x ?? 0) &&
                  s.y === (tempItem.y ?? 0)
              )
            }

            // Fallback: по координатам + параметрам/ассету
            if (!match) {
              match = newServerItems.find(
                (s) =>
                  !usedServerIds.has(s.id) &&
                  s.type === tempItem.type &&
                  s.assetId === (tempItem.assetId ?? s.assetId) &&
                  s.rotation === (tempItem.rotation ?? 0) &&
                  s.w === (tempItem.w ?? 1) &&
                  s.h === (tempItem.h ?? 1) &&
                  s.x === (tempItem.x ?? 0) &&
                  s.y === (tempItem.y ?? 0)
              )
            }

            if (match) {
              tempToServerIdMapRef.current.set(tempId, match.id)
              usedServerIds.add(match.id)
              console.log(`[HallEditor] Pre-mapped temp ID ${tempId} -> server ID ${match.id}`)
            } else {
              console.warn(`[HallEditor] Could not map temp ID -> server ID`, {
                tempId,
                tempItem: {
                  type: tempItem.type,
                  tableId: tempItem.tableId,
                  assetId: tempItem.assetId,
                  x: tempItem.x,
                  y: tempItem.y,
                  w: tempItem.w,
                  h: tempItem.h,
                  rotation: tempItem.rotation,
                },
              })
            }
          }

          // СИНХРОННО обновляем draggingItemIdRef если нужно (до того как items обновятся)
          const currentDragId = draggingItemIdRef.current
          if (currentDragId !== null && currentDragId < 0 && tempToServerIdMapRef.current.has(currentDragId)) {
            const newId = tempToServerIdMapRef.current.get(currentDragId)!
            console.log(`[HallEditor] Sync updating draggingItemIdRef from temp ${currentDragId} to server ${newId} (before setView)`)
            draggingItemIdRef.current = newId
            if (dragPreviewRef.current && dragPreviewRef.current.id === currentDragId) {
              dragPreviewRef.current = { ...dragPreviewRef.current, id: newId }
            }
            setDraggingItemIdState(newId)
          }
        }
        
        // Обновляем persisted state и мержим с новыми изменениями, сделанными во время сохранения
        setView((prev) => {
          if (!prev) return prev
          
          // Получаем актуальные dirty updates, которые могли появиться во время сохранения
          const currentDirtyUpdates = dirtyUpdatesRef.current
          const currentDirtyAdds = dirtyAddsRef.current
          
          // Удаляем удалённые
          const remainingItems = prev.items.filter((it) => !response.removedIds.includes(it.id))
          
          // Обновляем/добавляем upserted из ответа сервера
          const upsertedMap = new Map(response.upserted.map((it) => [it.id, it]))
          
          // Применяем обновления от сервера, но сохраняем локальные изменения, которые еще не отправлены
          const updatedItems = remainingItems.map((it) => {
            const serverItem = upsertedMap.get(it.id)
            if (serverItem) {
              // Если есть локальные изменения, которые еще не отправлены, мержим их поверх ответа сервера
              const localUpdate = currentDirtyUpdates.get(it.id)
              if (localUpdate) {
                return { ...serverItem, ...localUpdate } as HallPlacedItem
              }
              return serverItem
            }
            // Если есть локальные изменения для этого item, применяем их
            const localUpdate = currentDirtyUpdates.get(it.id)
            if (localUpdate) {
              return { ...it, ...localUpdate } as HallPlacedItem
            }
            return it
          })
          
          // Добавляем новые из ответа сервера
          // Для новых элементов проверяем, есть ли обновлённые данные в dirtyAdds
          response.upserted.forEach((serverItem) => {
            if (!updatedItems.some((existing) => existing.id === serverItem.id)) {
              // Ищем соответствующий временный ID в маппинге
              let itemToAdd = serverItem
              for (const [tempId, serverId] of tempToServerIdMapRef.current.entries()) {
                if (serverId === serverItem.id) {
                  // Нашли соответствие, проверяем есть ли обновлённый элемент в dirtyAdds
                  const updatedInDirtyAdds = currentDirtyAdds.get(tempId)
                  if (updatedInDirtyAdds) {
                    // Мержим данные от сервера с локальными изменениями
                    console.log(`[HallEditor] Merging server item ${serverItem.id} with local updates from temp ID ${tempId}`)
                    itemToAdd = { ...serverItem, x: updatedInDirtyAdds.x, y: updatedInDirtyAdds.y }
                  }
                  break
                }
              }
              updatedItems.push(itemToAdd)
            }
          })
          
          return {
            ...prev,
            map: { ...prev.map, version: response.newVersion },
            items: updatedItems,
          }
        })
        
        // Также обновляем selectedItemId если он ссылается на временный ID
        setSelectedItemId((currentSelectedId) => {
          if (currentSelectedId !== null && currentSelectedId < 0 && tempToServerIdMapRef.current.has(currentSelectedId)) {
            return tempToServerIdMapRef.current.get(currentSelectedId)!
          }
          return currentSelectedId
        })
        
        // Очищаем только те изменения, которые были отправлены
        // Новые изменения, сделанные во время сохранения, остаются в dirty state
        setDirtyAdds((prev) => {
          const next = new Map(prev)
          // Удаляем только те items, которые были в snapshot (отправлены на сервер)
          snapshotAdds.forEach((_, clientId) => {
            next.delete(clientId)
          })
          return next
        })
        
        setDirtyUpdates((prev) => {
          const next = new Map(prev)
          // Удаляем только те обновления, которые были в snapshot
          snapshotUpdates.forEach((_, id) => {
            next.delete(id)
          })
          return next
        })
        
        setDirtyRemoves((prev) => {
          const next = new Set(prev)
          // Удаляем только те удаления, которые были в snapshot
          snapshotRemoves.forEach((id) => {
            next.delete(id)
          })
          return next
        })
      } catch (e: any) {
        console.error('[HallEditor] Failed to patch items:', e)
        console.error('[HallEditor] Error details:', {
          message: e.message,
          response: e.response?.data,
          status: e.response?.status,
          patch: {
            added: patch.added.length,
            updated: patch.updated.length,
            removed: patch.removedIds.length,
          },
        })
        
        if (e.response?.status === 403) {
          // Access denied - недостаточно прав
          const errorMsg = e.response?.data?.message || 'Недостаточно прав для сохранения изменений'
          alert(`Ошибка доступа: ${errorMsg}\n\nДля редактирования карты зала требуется роль администратора или разрешение MANAGE_HALL_MAP.`)
        } else if (e.response?.status === 409 || e.response?.status === 412) {
          // Version conflict - reload
          alert('Карта была изменена другим пользователем. Перезагружаем...')
          if (loadRef.current) {
            loadRef.current()
          }
        } else if (e.response?.data?.message) {
          alert(`Не удалось сохранить изменения: ${e.response.data.message}`)
        } else if (e.message) {
          alert(`Не удалось сохранить изменения: ${e.message}`)
        } else {
          alert('Не удалось сохранить изменения. Проверьте консоль для деталей.')
        }
      }
    }

    if (immediate) {
      await doFlush()
    } else {
      pendingPatchRef.current = setTimeout(doFlush, 500) // 500ms debounce
    }
  }, [map, view])

  // Helper функции для работы с dirty state
  const addItem = useCallback((item: HallPlacedItem) => {
    const clientId = -nextClientIdRef.current++
    const itemWithClientId = { ...item, id: clientId }
    setDirtyAdds((prev) => new Map(prev).set(clientId, itemWithClientId))
    flushPatch(false)
    return clientId
  }, [flushPatch])

  const updateItem = useCallback((id: number, update: Partial<HallPlacedItem>) => {
    // Резолвим актуальный ID: если это временный ID, проверяем маппинг
    let actualId = id
    console.log(`[HallEditor] updateItem: id=${id}, isNegative=${id < 0}, mapHas=${tempToServerIdMapRef.current.has(id)}, mapSize=${tempToServerIdMapRef.current.size}`)
    
    // Если элемент ещё в dirtyAdds (не сохранён на сервер), обновляем его там напрямую
    if (id < 0) {
      setDirtyAdds((prev) => {
        const item = prev.get(id)
        if (item) {
          console.log(`[HallEditor] updateItem: updating item in dirtyAdds (temp ID ${id})`)
          const next = new Map(prev)
          next.set(id, { ...item, ...update })
          return next
        }
        return prev
      })
      
      // Проверяем маппинг на серверный ID
      if (tempToServerIdMapRef.current.has(id)) {
        actualId = tempToServerIdMapRef.current.get(id)!
        console.log(`[HallEditor] updateItem: resolved temp ID ${id} to server ID ${actualId}`)
        // Также добавляем обновление в dirtyUpdates с серверным ID
        setDirtyUpdates((prev) => {
          const next = new Map(prev)
          const existing = next.get(actualId) || {}
          next.set(actualId, { ...existing, ...update })
          return next
        })
      }
      // Если элемент ещё в dirtyAdds и маппинга нет - не добавляем в dirtyUpdates,
      // так как элемент будет отправлен с обновлёнными данными при следующем flush
      flushPatch(false)
      return
    }
    
    setDirtyUpdates((prev) => {
      const next = new Map(prev)
      const existing = next.get(actualId) || {}
      next.set(actualId, { ...existing, ...update })
      return next
    })
    flushPatch(false)
  }, [flushPatch])

  const removeItem = useCallback((id: number) => {
    // Если это новый item (clientId < 0), удаляем из dirtyAdds
    if (id < 0) {
      setDirtyAdds((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    } else {
      // Иначе добавляем в dirtyRemoves
      setDirtyRemoves((prev) => new Set(prev).add(id))
    }
    flushPatch(false)
  }, [flushPatch])

  // Запрещённая зона стола: стол + «ореол» 1 клетка (вплотную ставить нельзя)
  // OPTIMIZED: Uses spatial index instead of O(n) scan
  const isCellTooCloseToAnyTable = useCallback((x: number, y: number) => {
    return spatialIndexRef.current.isCellTooCloseToAnyTable(x, y)
  }, [])

  const _rectTooCloseToAnyTable = useCallback((x: number, y: number, w: number, h: number) => {
    return spatialIndexRef.current.hasAnyItemInHalo(x, y, w, h)
  }, [])
  void _rectTooCloseToAnyTable

  // Функция для поиска подходящего поворота при размещении
  // Возвращает { rotation, w, h } или null если ни один поворот не подходит
  const findValidRotation = useCallback((
    x: number, 
    y: number, 
    baseW: number, 
    baseH: number, 
    type: HallPlacedItem['type'],
    preferredRotation: number = 0,
    excludeId?: number
  ): { rotation: number; w: number; h: number } | null => {
    if (!map) return null
    
    // Порядок проверки: сначала предпочитаемый, потом остальные
    const rotations = [preferredRotation, 0, 90, 180, 270].filter((r, i, arr) => arr.indexOf(r) === i)
    
    for (const rot of rotations) {
      // При повороте на 90° или 270° размеры меняются местами
      const needsSwap = rot % 180 === 90
      const w = needsSwap ? baseH : baseW
      const h = needsSwap ? baseW : baseH
      
      // Проверка границ карты
      if (x + w > map.gridWidth || y + h > map.gridHeight || x < 0 || y < 0) {
        continue
      }
      
      // Проверка коллизии с другими элементами
      if (spatialIndexRef.current.hasCollisionWithAnyItem(x, y, w, h, excludeId)) {
        continue
      }
      
      // Для столов: проверка минимального расстояния от всех элементов
      if (type === 'TABLE') {
        if (spatialIndexRef.current.isTooCloseToAnyItem(x, y, w, h, excludeId)) {
          continue
        }
      }
      
      // Нашли подходящий поворот
      console.log(`[findValidRotation] Found: rotation=${rot}, w=${w}, h=${h} (base: ${baseW}x${baseH}, preferred: ${preferredRotation})`)
      return { rotation: rot, w, h }
    }
    
    console.log(`[findValidRotation] No valid rotation at (${x},${y}) for ${baseW}x${baseH}`)
    return null
  }, [map])

  // Point-in-polygon algorithm (ray casting)
  const isPointInPolygon = useCallback((px: number, py: number, vertices: Array<{ x: number; y: number }>) => {
    if (vertices.length < 3) return false
    
    let inside = false
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y
      const xj = vertices[j].x, yj = vertices[j].y
      
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside
      }
    }
    return inside
  }, [])

  // Get all grid cells inside a polygon
  // Проверка пересечения линии с клеткой (AABB)
  const lineIntersectsCell = useCallback((x1: number, y1: number, x2: number, y2: number, cellX: number, cellY: number) => {
    // Клетка от (cellX, cellY) до (cellX+1, cellY+1)
    const left = cellX
    const right = cellX + 1
    const top = cellY
    const bottom = cellY + 1
    
    // Проверка пересечения линии с прямоугольником (алгоритм Cohen-Sutherland упрощённый)
    // Проверяем пересечение линии с каждой стороной клетки
    
    // Функция проверки пересечения двух отрезков
    const lineSegmentIntersects = (ax1: number, ay1: number, ax2: number, ay2: number,
                                    bx1: number, by1: number, bx2: number, by2: number) => {
      const d1 = (bx2 - bx1) * (ay1 - by1) - (by2 - by1) * (ax1 - bx1)
      const d2 = (bx2 - bx1) * (ay2 - by1) - (by2 - by1) * (ax2 - bx1)
      const d3 = (ax2 - ax1) * (by1 - ay1) - (ay2 - ay1) * (bx1 - ax1)
      const d4 = (ax2 - ax1) * (by2 - ay1) - (ay2 - ay1) * (bx2 - ax1)
      
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
          ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        return true
      }
      
      // Проверка колинеарности
      if (d1 === 0 && isOnSegment(bx1, by1, bx2, by2, ax1, ay1)) return true
      if (d2 === 0 && isOnSegment(bx1, by1, bx2, by2, ax2, ay2)) return true
      if (d3 === 0 && isOnSegment(ax1, ay1, ax2, ay2, bx1, by1)) return true
      if (d4 === 0 && isOnSegment(ax1, ay1, ax2, ay2, bx2, by2)) return true
      
      return false
    }
    
    const isOnSegment = (px1: number, py1: number, px2: number, py2: number, qx: number, qy: number) => {
      return qx <= Math.max(px1, px2) && qx >= Math.min(px1, px2) &&
             qy <= Math.max(py1, py2) && qy >= Math.min(py1, py2)
    }
    
    // Проверяем пересечение с каждой стороной клетки
    // Верхняя сторона
    if (lineSegmentIntersects(x1, y1, x2, y2, left, top, right, top)) return true
    // Нижняя сторона
    if (lineSegmentIntersects(x1, y1, x2, y2, left, bottom, right, bottom)) return true
    // Левая сторона
    if (lineSegmentIntersects(x1, y1, x2, y2, left, top, left, bottom)) return true
    // Правая сторона
    if (lineSegmentIntersects(x1, y1, x2, y2, right, top, right, bottom)) return true
    
    // Проверяем, не находится ли какой-либо конец линии внутри клетки
    if (x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) return true
    if (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom) return true
    
    return false
  }, [])

  const getCellsInPolygon = useCallback((vertices: Array<{ x: number; y: number }>, mapWidth: number, mapHeight: number) => {
    if (vertices.length < 3) return new Set<string>()
    
    // Find bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    vertices.forEach(v => {
      minX = Math.min(minX, v.x)
      maxX = Math.max(maxX, v.x)
      minY = Math.min(minY, v.y)
      maxY = Math.max(maxY, v.y)
    })
    
    // Clamp to map bounds
    minX = Math.max(0, Math.floor(minX))
    maxX = Math.min(mapWidth - 1, Math.ceil(maxX))
    minY = Math.max(0, Math.floor(minY))
    maxY = Math.min(mapHeight - 1, Math.ceil(maxY))
    
    const cells = new Set<string>()
    
    // Check each cell in bounding box
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        // Check center of cell (point inside polygon)
        const cx = x + 0.5
        const cy = y + 0.5
        if (isPointInPolygon(cx, cy, vertices)) {
          cells.add(`${x},${y}`)
          continue
        }
        
        // Check if any edge of polygon intersects this cell
        for (let i = 0; i < vertices.length; i++) {
          const v1 = vertices[i]
          const v2 = vertices[(i + 1) % vertices.length]
          if (lineIntersectsCell(v1.x, v1.y, v2.x, v2.y, x, y)) {
            cells.add(`${x},${y}`)
            break
          }
        }
      }
    }
    
    return cells
  }, [isPointInPolygon, lineIntersectsCell])

  // Check if click is near first vertex (for closing polygon)
  const isNearFirstVertex = useCallback((x: number, y: number, vertices: Array<{ x: number; y: number }>, threshold = 1.5) => {
    if (vertices.length < 3) return false
    const first = vertices[0]
    const dx = x - first.x
    const dy = y - first.y
    return Math.sqrt(dx * dx + dy * dy) <= threshold
  }, [])

  // Snap coordinates to straight line (0, 90, 180, 270 degrees) relative to last vertex
  const snapToStraightLine = useCallback((x: number, y: number, vertices: Array<{ x: number; y: number }>) => {
    if (vertices.length === 0) return { x, y }
    
    const last = vertices[vertices.length - 1]
    const dx = Math.abs(x - last.x)
    const dy = Math.abs(y - last.y)
    
    // Snap to the axis with smaller delta (makes horizontal/vertical lines)
    if (dx < dy) {
      // Snap to vertical line (same X as last vertex)
      return { x: last.x, y }
    } else {
      // Snap to horizontal line (same Y as last vertex)
      return { x, y: last.y }
    }
  }, [])

  // Add vertex to polygon
  const addPolygonVertex = useCallback((x: number, y: number, shiftKey: boolean = false) => {
    if (!map) return
    
    // Snap to straight line if Shift is pressed
    let finalX = x
    let finalY = y
    if (shiftKey && polygonVertices.length > 0) {
      const snapped = snapToStraightLine(x, y, polygonVertices)
      finalX = snapped.x
      finalY = snapped.y
    }
    
    // Save current state to history for undo
    polygonHistoryRef.current.push([...polygonVertices])
    
    // Check if closing polygon
    if (isNearFirstVertex(finalX, finalY, polygonVertices)) {
      // Close polygon
      setIsPolygonClosed(true)
      // Calculate cells inside
      const cells = getCellsInPolygon(polygonVertices, map.gridWidth, map.gridHeight)
      setPolygonPreviewCells(cells)
      setPaintedZoneCells(cells)
      return
    }
    
    // Add new vertex
    const newVertices = [...polygonVertices, { x: finalX, y: finalY }]
    setPolygonVertices(newVertices)
    
    // Update preview cells if we have at least 3 vertices
    if (newVertices.length >= 3) {
      const cells = getCellsInPolygon(newVertices, map.gridWidth, map.gridHeight)
      setPolygonPreviewCells(cells)
    }
  }, [map, polygonVertices, isNearFirstVertex, getCellsInPolygon, snapToStraightLine])

  // Undo last polygon vertex
  const undoPolygonVertex = useCallback(() => {
    if (polygonHistoryRef.current.length === 0) return
    
    const previousState = polygonHistoryRef.current.pop()!
    setPolygonVertices(previousState)
    setIsPolygonClosed(false)
    
    // Update preview cells
    if (previousState.length >= 3 && map) {
      const cells = getCellsInPolygon(previousState, map.gridWidth, map.gridHeight)
      setPolygonPreviewCells(cells)
    } else {
      setPolygonPreviewCells(new Set())
    }
  }, [map, getCellsInPolygon])

  // Start drawing polygon
  const startPolygonDrawing = useCallback(() => {
    setIsDrawingPolygon(true)
    setPolygonVertices([])
    setPolygonPreviewCells(new Set())
    setIsPolygonClosed(false)
    setPaintedZoneCells(new Set())
    polygonHistoryRef.current = []
  }, [])

  // Cancel polygon drawing
  const cancelPolygonDrawing = useCallback(() => {
    setIsDrawingPolygon(false)
    setPolygonVertices([])
    setPolygonPreviewCells(new Set())
    setIsPolygonClosed(false)
    setPaintedZoneCells(new Set())
    polygonHistoryRef.current = []
    setEditingZoneId(null)
  }, [])

  // Confirm polygon zone
  const confirmPolygonZone = useCallback(() => {
    if (paintedZoneCells.size === 0) {
      alert('Полигон пуст или не замкнут')
      return
    }
    setShowZoneModal(true)
  }, [paintedZoneCells])

  // Tables inside current polygon zone (for preview and closed state)
  const tablesInPolygon = useMemo(() => {
    // Use polygonPreviewCells while drawing, paintedZoneCells when closed
    const cellsToCheck = isPolygonClosed ? paintedZoneCells : polygonPreviewCells
    if (cellsToCheck.size === 0) return []
    
    // Find all TABLE items that have their center inside the zone cells
    return items.filter((it) => {
      if (it.type !== 'TABLE') return false
      // Check if any cell of the table is inside the zone
      for (let dy = 0; dy < it.h; dy++) {
        for (let dx = 0; dx < it.w; dx++) {
          const cellKey = `${it.x + dx},${it.y + dy}`
          if (cellsToCheck.has(cellKey)) {
            return true
          }
        }
      }
      return false
    }).map((it) => {
      const table = tablesById.get(it.tableId!)
      return {
        itemId: it.id,
        tableId: it.tableId!,
        label: table?.label || `Стол ${it.tableId}`,
        capacity: table?.capacity || 0,
      }
    })
  }, [items, polygonPreviewCells, paintedZoneCells, isPolygonClosed, tablesById])

  // Set of table item IDs in polygon (for highlighting)
  const tableItemIdsInPolygon = useMemo(() => {
    return new Set(tablesInPolygon.map(t => t.itemId))
  }, [tablesInPolygon])

  // Filter by zone
  const zoneFilteredItems = useMemo(() => {
    if (selectedZoneId === 'ALL') return items
    const z = zonesById.get(typeof selectedZoneId === 'number' ? selectedZoneId : -1)
    if (!z) return items
    const cellSet = zoneCellSets.get(z.id)
    return items.filter((it) => {
      const cx = it.x + it.w / 2
      const cy = it.y + it.h / 2
      const ix = Math.floor(cx)
      const iy = Math.floor(cy)
      if (cellSet) {
        return cellSet.has(`${ix},${iy}`)
      }
      return cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h
    })
  }, [items, selectedZoneId, zonesById, zoneCellSets])

  // Virtualization: Only render items visible in viewport
  const visibleItems = useMemo(() => {
    if (!canvasWrapRef.current || !map) return zoneFilteredItems
    
    const container = canvasWrapRef.current
    const rect = container.getBoundingClientRect()
    
    // Calculate visible world bounds (accounting for pan/zoom)
    // Use panOffset state (not ref) to trigger recalculation on pan
    const worldLeft = (-panOffset.x) / zoom
    const worldTop = (-panOffset.y) / zoom
    const worldRight = worldLeft + rect.width / zoom
    const worldBottom = worldTop + rect.height / zoom
    
    // Convert to cell coordinates with padding
    const padding = 2 // Render items slightly outside viewport for smooth scrolling
    const minX = Math.floor(worldLeft / CELL_SIZE) - padding
    const minY = Math.floor(worldTop / CELL_SIZE) - padding
    const maxX = Math.ceil(worldRight / CELL_SIZE) + padding
    const maxY = Math.ceil(worldBottom / CELL_SIZE) + padding
    
    // Filter items intersecting visible bounds
    return zoneFilteredItems.filter((it) => {
      const itemRight = it.x + it.w
      const itemBottom = it.y + it.h
      return !(
        itemRight < minX ||
        it.x > maxX ||
        itemBottom < minY ||
        it.y > maxY
      )
    })
  }, [zoneFilteredItems, map, zoom, panOffset])

  // Performance: Track rendered items count
  useEffect(() => {
    renderCountRef.current = visibleItems.length
    if (visibleItems.length > 0) {
      console.log(`[HallEditor] Rendering ${visibleItems.length} of ${zoneFilteredItems.length} items (${Math.round((visibleItems.length / zoneFilteredItems.length) * 100)}%)`)
    }
  }, [visibleItems.length, zoneFilteredItems.length])

  // Container style - base size only, transform applied via requestAnimationFrame
  const containerStyle = useMemo(() => {
    if (!map) return {}
    return {
      width: map.gridWidth * CELL_SIZE,
      height: map.gridHeight * CELL_SIZE,
      transformOrigin: '0 0',
    } as React.CSSProperties
  }, [map])

  // Apply pan/zoom transform via requestAnimationFrame (avoids React re-renders)
  useEffect(() => {
    if (!canvasRef.current) return
    
    let rafId: number | null = null
    
    const updateTransform = () => {
      if (canvasRef.current) {
        canvasRef.current.style.transform = `translate(${panOffsetRef.current.x}px, ${panOffsetRef.current.y}px) scale(${zoom})`
      }
      rafId = requestAnimationFrame(updateTransform)
      rafIdRef.current = rafId
    }
    
    // Sync ref with state
    panOffsetRef.current = panOffset
    
    // Start animation loop
    rafId = requestAnimationFrame(updateTransform)
    rafIdRef.current = rafId
    
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      rafIdRef.current = null
    }
  }, [zoom, panOffset])

  // Функция для ограничения panOffset границами карты
  const clampPanOffset = useCallback((pan: { x: number, y: number }): { x: number, y: number } => {
    if (!map || !canvasWrapRef.current) return pan
    
    const mapWidth = map.gridWidth * CELL_SIZE
    const mapHeight = map.gridHeight * CELL_SIZE
    const viewportWidth = canvasWrapRef.current.clientWidth
    const viewportHeight = canvasWrapRef.current.clientHeight
    
    // Вычисляем границы панорамирования
    const minX = viewportWidth - mapWidth * zoom
    const minY = viewportHeight - mapHeight * zoom
    const maxX = 0
    const maxY = 0
    
    let clampedX = pan.x
    let clampedY = pan.y
    
    // Если карта меньше viewport, центрируем её
    if (mapWidth * zoom < viewportWidth) {
      clampedX = (viewportWidth - mapWidth * zoom) / 2
    } else {
      clampedX = Math.max(minX, Math.min(maxX, pan.x))
    }
    
    if (mapHeight * zoom < viewportHeight) {
      clampedY = (viewportHeight - mapHeight * zoom) / 2
    } else {
      clampedY = Math.max(minY, Math.min(maxY, pan.y))
    }
    
    return { x: clampedX, y: clampedY }
  }, [map, zoom])

  // Ограничиваем panOffset при изменении zoom, чтобы карта не выходила за границы
  useEffect(() => {
    const clamped = clampPanOffset(panOffsetRef.current)
    if (clamped.x !== panOffsetRef.current.x || clamped.y !== panOffsetRef.current.y) {
      panOffsetRef.current = clamped
      setPanOffset(clamped)
    }
  }, [zoom, clampPanOffset])

  // Добавляем нативный обработчик wheel с passive: false для предотвращения ошибки
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      // ВСЕГДА предотвращаем зум страницы
      e.preventDefault()
      e.stopPropagation()
      
      // Используем текущее значение zoom из state через замыкание
      const currentZoom = zoom
      
      // Zoom колесиком мыши только с Ctrl/Cmd
      if (e.ctrlKey || e.metaKey) {
        const threshold = 100
        zoomAccumulatorRef.current += e.deltaY
        
        if (Math.abs(zoomAccumulatorRef.current) >= threshold) {
          const step = 0.1
          const steps = Math.floor(Math.abs(zoomAccumulatorRef.current) / threshold)
          const direction = zoomAccumulatorRef.current > 0 ? -1 : 1
          
          const currentStep = Math.round(currentZoom / step)
          const newStep = direction > 0
            ? Math.min(40, currentStep + steps)
            : Math.max(1, currentStep - steps)
          
          const newZoom = newStep * step
          setZoom(newZoom)
          
          setTimeout(() => {
            const clamped = clampPanOffset(panOffsetRef.current)
            panOffsetRef.current = clamped
            setPanOffset(clamped)
          }, 0)
          
          zoomAccumulatorRef.current = zoomAccumulatorRef.current % threshold
        }
      } else {
        // Обычный скролл - панорамирование
        const scrollX = e.deltaX || 0
        const scrollY = e.deltaY || 0
        
        let newPan = {
          x: panOffsetRef.current.x - scrollX,
          y: panOffsetRef.current.y - scrollY,
        }
        
        newPan = clampPanOffset(newPan)
        
        panOffsetRef.current = newPan
        setPanOffset(newPan)
      }
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    
    return () => {
      canvas.removeEventListener('wheel', handleWheel)
    }
  }, [zoom, clampPanOffset, setZoom, setPanOffset])

  const getGridCoords = useCallback((e: React.MouseEvent | MouseEvent, element: HTMLElement) => {
    // Используем контейнер (canvasWrapRef) для получения координат, так как он не имеет transform
    // Это позволяет правильно учесть panOffset и zoom
    if (!canvasWrapRef.current) {
      // Fallback на element, если контейнер еще не готов
    const rect = element.getBoundingClientRect()
      const x = (e.clientX - rect.left) / zoom
      const y = (e.clientY - rect.top) / zoom
      const coords = {
      x: Math.floor(x / CELL_SIZE),
      y: Math.floor(y / CELL_SIZE),
    }
      currentMouseCellRef.current = coords
      return coords
    }
    
    const containerRect = canvasWrapRef.current.getBoundingClientRect()
    // Координаты относительно контейнера (без transform)
    const containerX = e.clientX - containerRect.left
    const containerY = e.clientY - containerRect.top
    
    // Преобразуем в координаты карты: вычитаем panOffset и делим на zoom
    const worldX = (containerX - panOffsetRef.current.x) / zoom
    const worldY = (containerY - panOffsetRef.current.y) / zoom
    
    const coords = {
      x: Math.floor(worldX / CELL_SIZE),
      y: Math.floor(worldY / CELL_SIZE),
    }
    currentMouseCellRef.current = coords
    return coords
  }, [zoom])

  const eraseAtCell = useCallback((cx: number, cy: number) => {
    if (!map || !view) return
    const r = Math.max(0, eraseRadius)

    // push history only once per erase stroke
    if (!eraserStartedRef.current) {
      const snapshot = createHistorySnapshot()
      const currentHistory = historyRef.current
      console.log('[HallEditor] Adding to history (erase):', { itemsCount: snapshot.length, currentHistoryLength: currentHistory.length })
      const newHistory = [...currentHistory, snapshot]
      console.log('[HallEditor] History after add (erase):', { historyLength: newHistory.length, prevLength: currentHistory.length })
      historyRef.current = newHistory
      setHistory(newHistory)
      setRedoHistory([]) // Очищаем redo при новом действии
      redoHistoryRef.current = []
      eraserStartedRef.current = true
    }

    // Радиус 0 = 1 клетка, радиус 1 = 3x3, радиус 2 = 5x5, и т.д.
    // Область поиска: квадрат (2*r+1) x (2*r+1) с центром в (cx, cy)
    const searchX = Math.max(0, cx - r)
    const searchY = Math.max(0, cy - r)
    const searchW = r * 2 + 1
    const searchH = r * 2 + 1
    const candidates = spatialIndexRef.current.getItemsInRect(searchX, searchY, searchW, searchH)

    // Стираем элементы, которые пересекаются с областью ластика
    candidates.forEach((it) => {
      // Проверяем, пересекается ли элемент с квадратом ластика
      const eraserLeft = cx - r
      const eraserTop = cy - r
      const eraserRight = cx + r
      const eraserBottom = cy + r
      
      const itemLeft = it.x
      const itemTop = it.y
      const itemRight = it.x + it.w - 1
      const itemBottom = it.y + it.h - 1
      
      // AABB collision check
      const overlaps = !(
        itemRight < eraserLeft ||
        itemLeft > eraserRight ||
        itemBottom < eraserTop ||
        itemTop > eraserBottom
      )
      
      if (overlaps) {
        removeItem(it.id)
      }
    })
  }, [map, view, eraseRadius, items, removeItem])

  // Применяет снимок состояния к карте
  // Функция для создания снимка истории из текущего состояния
  // КРИТИЧЕСКИ ВАЖНО: Снимок должен содержать актуальное состояние на момент создания
  // Используем itemsRef.current (который включает persistedItems + dirtyUpdates + dirtyAdds - dirtyRemoves),
  // но исключаем только те элементы из dirtyAdds, которые были добавлены ПОСЛЕ создания снимка
  // Для этого принимаем параметр dirtyAddsAtSnapshotTime - снимок dirtyAdds на момент создания снимка
  // Исключаем только те элементы, которые есть в текущем dirtyAdds, но НЕ в dirtyAddsAtSnapshotTime
  const createHistorySnapshot = useCallback((excludeNewDirtyAdds?: Map<number, HallPlacedItem>): HallPlacedItem[] => {
    // Используем актуальное состояние из ref - включая ВСЕ элементы (persisted + dirtyAdds + dirtyUpdates - dirtyRemoves)
    const currentItems = itemsRef.current
    
    // Если передан снимок dirtyAdds на момент вызова, исключаем только НОВЫЕ элементы
    // (добавленные ПОСЛЕ момента вызова). Это нужно для draw, чтобы исключить элементы,
    // которые мы сейчас рисуем, но включить все остальные.
    if (excludeNewDirtyAdds) {
      const currentDirtyAdds = dirtyAddsRef.current
      const existingDirtyAddsIds = new Set(Array.from(excludeNewDirtyAdds.values()).map(it => it.id))
      const newDirtyAddsIds = new Set(
        Array.from(currentDirtyAdds.values())
          .filter(it => !existingDirtyAddsIds.has(it.id))
          .map(it => it.id)
      )
      
      // Создаем снимок, исключая только новые элементы из dirtyAdds
      const snapshot = currentItems
        .filter((it) => !newDirtyAddsIds.has(it.id))
        .map((it) => ({ ...it }))
      
      return snapshot
    } else {
      // БЕЗ аргумента: включаем ВСЕ элементы (для erase, move, rotate и т.д.)
      // Это правильное поведение - при стирании мы хотим сохранить состояние ДО стирания,
      // включая все нарисованные элементы (даже с отрицательными ID)
      const snapshot = currentItems.map((it) => ({ ...it }))
      
      return snapshot
    }
  }, [])

  const applySnapshot = useCallback((snapshot: HallPlacedItem[]) => {
    if (!map) return
    
    // Используем актуальное состояние из ref
    const currentItemsArray = itemsRef.current.map((it) => ({ ...it }))
    
    // Ключ для сопоставления:
    // - Для TABLE: используем tableId (уникальный идентификатор стола)
    // - Для остальных: координаты и атрибуты
    const makeKey = (it: HallPlacedItem) => {
      if (it.type === 'TABLE' && it.tableId) {
        return `TABLE_${it.tableId}`
      }
      return `${it.x},${it.y},${it.w},${it.h},${it.type},${it.assetId || ''}`
    }
    
    // Map snapshot элементов по ключу
    const snapshotByKey = new Map<string, HallPlacedItem>()
    snapshot.forEach((it) => snapshotByKey.set(makeKey(it), it))
    
    // Map текущих элементов по ключу
    const currentByKey = new Map<string, HallPlacedItem>()
    currentItemsArray.forEach((it) => currentByKey.set(makeKey(it), it))
    
    // Элементы для удаления: есть в текущем, но НЕТ в snapshot
    const toRemove: number[] = []
    // Элементы для обновления: есть в обоих, но атрибуты отличаются (для столов - rotation/w/h)
    const toUpdate: Array<{ id: number; updates: Partial<HallPlacedItem> }> = []
    // Элементы для добавления: есть в snapshot, но НЕТ в текущем
    const toAdd: HallPlacedItem[] = []
    
    currentItemsArray.forEach((current) => {
      const key = makeKey(current)
      const fromSnapshot = snapshotByKey.get(key)
      
      if (!fromSnapshot) {
        // Элемент есть в текущем, но нет в snapshot - удаляем
        toRemove.push(current.id)
      } else if (current.type === 'TABLE' && current.id > 0) {
        // Для столов проверяем, нужно ли обновление (rotation, x, y, w, h)
        const needsUpdate = 
          current.x !== fromSnapshot.x ||
          current.y !== fromSnapshot.y ||
          current.w !== fromSnapshot.w ||
          current.h !== fromSnapshot.h ||
          (current.rotation ?? 0) !== (fromSnapshot.rotation ?? 0)
        
        if (needsUpdate) {
          toUpdate.push({
            id: current.id,
            updates: {
              x: fromSnapshot.x,
              y: fromSnapshot.y,
              w: fromSnapshot.w,
              h: fromSnapshot.h,
              rotation: fromSnapshot.rotation ?? 0,
            }
          })
        }
      }
    })
    
    snapshot.forEach((fromSnapshot) => {
      const key = makeKey(fromSnapshot)
      if (!currentByKey.has(key)) {
        // Элемент есть в snapshot, но нет в текущем - добавляем
        toAdd.push(fromSnapshot)
      }
    })
    
    console.log('[HallEditor] applySnapshot:', {
      currentItemsCount: currentItemsArray.length,
      snapshotCount: snapshot.length,
      toRemoveCount: toRemove.length,
      toUpdateCount: toUpdate.length,
      toAddCount: toAdd.length
    })
    
    // Сначала обновляем существующие элементы (важно для отмены вращения)
    toUpdate.forEach(({ id, updates }) => {
      console.log('[HallEditor] applySnapshot: updating item', id, updates)
      updateItem(id, updates)
    })
    
    // Добавляем новые элементы
    toAdd.forEach((it) => {
      console.log('[HallEditor] applySnapshot: adding item at', { x: it.x, y: it.y })
      addItem({
        ...it,
        hallMapId: map.id,
        rotation: it.rotation ?? 0,
        layer: it.layer ?? 0,
        locked: it.locked ?? false,
      })
    })
    
    // Потом удаляем лишние элементы
    toRemove.forEach((id) => {
      console.log('[HallEditor] applySnapshot: removing item', id)
      removeItem(id)
    })
      
    // НЕ вызываем flushPatch здесь, так как это может вызвать бесконечный цикл
    // flushPatch будет вызван из handleUndo/handleRedo после применения снимка
  }, [map, removeItem, addItem, updateItem])

  // Undo last object operation (draw/erase/move/place/clear) with Ctrl+Z / Cmd+Z
  const handleUndo = useCallback(async () => {
    if (!map || !view) {
      console.log('[HallEditor] Undo: map or view is null')
      return
    }
    
    // Защита от множественных вызовов
    if (isUndoingRef.current) {
      console.log('[HallEditor] Undo: already in progress, skipping')
      return
    }
    
    isUndoingRef.current = true
    
    try {
      // Получаем актуальное состояние из ref
      const currentItemsArray = itemsRef.current.map((it) => ({ ...it }))
      const currentHistory = historyRef.current
      
      if (currentHistory.length === 0) {
        console.log('[HallEditor] Undo: history is empty', { historyLength: currentHistory.length })
        isUndoingRef.current = false
        return
      }
      
      const snapshot = currentHistory[currentHistory.length - 1]
      // Не удаляем последний снимок, если это начальное состояние (первый снимок)
      // Это гарантирует, что история никогда не станет пустой
      const isInitialState = currentHistory.length === 1
      const remaining = isInitialState ? currentHistory : currentHistory.slice(0, currentHistory.length - 1)
      
      console.log('[HallEditor] Undo: applying snapshot', { 
        currentItemsCount: currentItemsArray.length, 
        snapshotCount: snapshot.length,
        historyLength: currentHistory.length,
        remainingLength: remaining.length,
        isInitialState,
        historyState: history.length,
        historyRefLength: historyRef.current.length,
        historySnapshots: currentHistory.map(s => s.length)
      })
      
      // Сохраняем текущее состояние в redo stack ПЕРЕД обновлением истории
      setRedoHistory((prevRedo) => {
        const newRedo = [...prevRedo, currentItemsArray]
        console.log('[HallEditor] Undo: saved to redo', { redoLength: newRedo.length })
        return newRedo
      })
      
      // Обновляем историю (но не удаляем начальное состояние)
      if (!isInitialState) {
        setHistory(remaining)
        // Синхронно обновляем ref для следующего использования
        historyRef.current = remaining
      } else {
        // Если это начальное состояние, не обновляем историю, но обновляем ref
        console.log('[HallEditor] Undo: reached initial state, keeping it in history')
        // Убеждаемся, что ref синхронизирован
        historyRef.current = currentHistory
        // Также обновляем state, чтобы React знал о текущем состоянии истории
        // Это гарантирует, что при следующем действии setHistory((prev) => ...) получит правильное значение
        setHistory(currentHistory)
      }
      
      // Применяем снимок синхронно
      // НЕ вызываем flushPatch(true) сразу - это может привести к конфликту с ответами
      // от предыдущих flushPatch. Изменения будут отправлены через debounce.
      applySnapshot(snapshot)
      
      // Сбрасываем флаг
      isUndoingRef.current = false
    } catch (e) {
      console.error('[HallEditor] Undo error:', e)
      isUndoingRef.current = false
    }
  }, [map, view, applySnapshot])

  // Redo last undone operation with Shift+Ctrl+Z / Shift+Cmd+Z
  const handleRedo = useCallback(async () => {
    if (!map || !view) {
      console.log('[HallEditor] Redo: map or view is null')
      return
    }
    
    // Защита от множественных вызовов
    if (isRedoingRef.current) {
      console.log('[HallEditor] Redo: already in progress, skipping')
      return
    }
    
    isRedoingRef.current = true
    
    try {
      // Получаем актуальное состояние из ref
      const currentItemsArray = itemsRef.current.map((it) => ({ ...it }))
      const currentRedoHistory = redoHistoryRef.current
      
      if (currentRedoHistory.length === 0) {
        console.log('[HallEditor] Redo: redo history is empty', { redoHistoryLength: currentRedoHistory.length })
        isRedoingRef.current = false
        return
      }
      
      const snapshot = currentRedoHistory[currentRedoHistory.length - 1]
      const remaining = currentRedoHistory.slice(0, currentRedoHistory.length - 1)
      
      console.log('[HallEditor] Redo: applying snapshot', { 
        currentItemsCount: currentItemsArray.length, 
        snapshotCount: snapshot.length,
        redoHistoryLength: currentRedoHistory.length,
        remainingLength: remaining.length
      })
      
      // Сохраняем текущее состояние в undo stack ПЕРЕД обновлением redo истории
      setHistory((prevHistory) => {
        const newHistory = [...prevHistory, currentItemsArray]
        console.log('[HallEditor] Redo: saved to undo', { historyLength: newHistory.length })
        // Синхронно обновляем ref
        historyRef.current = newHistory
        return newHistory
      })
      
      // Обновляем redo историю
      setRedoHistory(remaining)
      // Синхронно обновляем ref
      redoHistoryRef.current = remaining
      
      // Применяем снимок синхронно
      // НЕ вызываем flushPatch(true) сразу - изменения будут отправлены через debounce
      applySnapshot(snapshot)
      isRedoingRef.current = false
    } catch (e) {
      console.error('[HallEditor] Redo error:', e)
      isRedoingRef.current = false
    }
  }, [map, view, applySnapshot])

  // Global key handler:
  // - Ctrl+Z / Cmd+Z: undo
  // - A/D: поворот выбранного стола (±90°)
  // - Space: pan mode (при зажатии)
  // - Shift: straight line mode for polygon
  // - Escape: cancel polygon drawing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key
      
      // Track Shift key for polygon straight line mode
      if (key === 'Shift') {
        setIsShiftPressed(true)
      }
      
      // поддержка русской раскладки для WASD: цфыв и Z: я
      const lowerRaw = key.toLowerCase()
      const lower =
        lowerRaw === 'ц' ? 'w'
        : lowerRaw === 'ф' ? 'a'
        : lowerRaw === 'ы' ? 's'
        : lowerRaw === 'в' ? 'd'
        : lowerRaw === 'я' ? 'z'  // Z в русской раскладке
        : lowerRaw === 'к' ? 'r'  // R в русской раскладке
        : lowerRaw

      // Handle ZONES mode polygon undo
      if (mode === 'ZONES' && isDrawingPolygon && !isPolygonClosed) {
        // Undo last vertex with Ctrl+Z
        const isUndoKey = (e.ctrlKey || e.metaKey) && (lower === 'z') && !e.shiftKey
        if (isUndoKey) {
          e.preventDefault()
          e.stopPropagation()
          undoPolygonVertex()
          return
        }
        // Cancel with Escape
        if (key === 'Escape') {
          e.preventDefault()
          cancelPolygonDrawing()
          return
        }
      }
      
      // Only process OBJECTS mode below
      if (mode !== 'OBJECTS') return

      // Pan mode при зажатии пробела (обрабатывается в onMouseDown)
      if (key === ' ') {
        setIsSpacePressed(true)
        // Устанавливаем курсор для pan
        if (canvasRef.current) {
          canvasRef.current.style.cursor = 'grab'
        }
        return
      }

      // Undo (Ctrl+Z / Cmd+Z)
      const isUndoKey = (e.ctrlKey || e.metaKey) && (lower === 'z') && !e.shiftKey
      if (isUndoKey) {
        e.preventDefault()
        e.stopPropagation()
        console.log('[HallEditor] Undo triggered', { toolMode, historyLength: history.length })
        handleUndo()
        return
      }

      // Redo (Shift+Ctrl+Z / Shift+Cmd+Z)
      const isRedoKey = (e.ctrlKey || e.metaKey) && (lower === 'z') && e.shiftKey
      if (isRedoKey) {
        e.preventDefault()
        e.stopPropagation()
        console.log('[HallEditor] Redo triggered', { toolMode, redoHistoryLength: redoHistory.length })
        handleRedo()
        return
      }

      // Rotation for selected table with A/D or R (no modifiers)
      // Поддерживаем как A/D, так и R для поворота
      // Сначала проверяем, что это клавиша поворота
      const isRotationKey = lower === 'a' || lower === 'd' || lower === 'r'
      
      const selectedIdNow = selectedItemIdRef.current
      console.log('[HallEditor] Key pressed:', { key, lower, isRotationKey, selectedTableId, selectedItemId: selectedIdNow, mode, toolMode })
      
      if (isRotationKey) {
        // Проверяем модификаторы только для клавиш поворота
        if (e.ctrlKey || e.metaKey || e.altKey) {
          console.log('[HallEditor] Rotation blocked: modifier keys pressed')
          return
        }
        
        // Проверяем, что есть выделенный размещённый объект
        if (!selectedIdNow) {
          console.log('[HallEditor] Rotation: no selectedItemId', { selectedItemId: selectedIdNow, mode, toolMode, key: e.key })
          return
        }
        
        if (!view) {
          console.log('[HallEditor] Rotation: no view')
          return
        }

        // Используем актуальные данные из items (merged), чтобы учесть локальные изменения
        const currentItems = items
        const target = currentItems.find((it) => it.id === selectedIdNow)
        if (!target || target.type !== 'TABLE') {
          console.log('[HallEditor] Rotation: table item not found', { selectedItemId: selectedIdNow, currentItems: currentItems.length, tables: currentItems.filter(it => it.type === 'TABLE').length })
          return
        }

      let newRotation: number | null = null
      const current = target.rotation ?? 0
        if (lower === 'd' || lower === 'r') {
          // D или R - поворот по часовой стрелке (+90)
          newRotation = (current + 90) % 360
        } else if (lower === 'a') {
          // A - поворот против часовой стрелки (-90)
          newRotation = (current + 270) % 360
        }

      if (newRotation === null) return

      e.preventDefault()
        e.stopPropagation()

        console.log('[HallEditor] Rotating table item', { selectedItemId: selectedIdNow, tableId: target.tableId, current, newRotation, key: e.key })

      // history snapshot before rotation
      const snapshot = createHistorySnapshot()
      const currentHistory = historyRef.current
      console.log('[HallEditor] Adding to history (rotate):', { itemsCount: snapshot.length, currentHistoryLength: currentHistory.length })
      const newHistory = [...currentHistory, snapshot]
      console.log('[HallEditor] History after add (rotate):', { historyLength: newHistory.length, prevLength: currentHistory.length })
      historyRef.current = newHistory
      setHistory(newHistory)
      setRedoHistory([]) // Очищаем redo при новом действии
      redoHistoryRef.current = []

      // Находим item для поворота
      const targetItem = currentItems.find((it) => it.id === selectedIdNow)
        if (!targetItem) {
          console.log('[HallEditor] Rotation: targetItem not found')
          return
        }

      const w0 = targetItem.w ?? 1
      const h0 = targetItem.h ?? 1
      const needsSwap = (current % 180) !== (newRotation! % 180)
      const w1 = needsSwap ? h0 : w0
      const h1 = needsSwap ? w0 : h0
      const nextX = targetItem.x ?? 0
      const nextY = targetItem.y ?? 0

      // Запрещаем поворот, если после него стол пересечется/коснется (в радиусе 1 клетки) любого стола
      // или пересечется с любым другим предметом
        // OPTIMIZED: Use spatial index for collision checks
        // Исключаем текущий стол из проверки, чтобы он не блокировал свой собственный поворот
        const touchesAnyItem = spatialIndexRef.current.hasAnyItemInHalo(nextX, nextY, w1, h1, targetItem.id)
        
        // For collision check, we need to exclude the current item
        const collides = spatialIndexRef.current.hasCollision(nextX, nextY, w1, h1, targetItem.id)
      
      if (touchesAnyItem || collides) {
          console.log('[HallEditor] Rotation blocked: collision detected', { touchesAnyItem, collides })
        return // не поворачиваем
      }

      // Обновляем через helper
      updateItem(targetItem.id, {
        rotation: newRotation!,
        w: w1,
        h: h1,
        x: nextX,
        y: nextY,
      })
      // Немедленная отправка при повороте
      flushPatch(true)
        return // Важно: выходим после обработки поворота
    }
    }
    
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false)
      }
      if (e.key === ' ') {
        setIsSpacePressed(false)
        if (canvasRef.current && !isPanning) {
          canvasRef.current.style.cursor = ''
        }
      }
    }

    // Используем document с capture: false, чтобы не конфликтовать с preventKeyboardZoom
    // но срабатывать после него, если нужно
    document.addEventListener('keydown', onKeyDown, { capture: false })
    document.addEventListener('keyup', onKeyUp, { capture: false })
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: false } as any)
      document.removeEventListener('keyup', onKeyUp, { capture: false } as any)
    }
    }, [mode, toolMode, map, view, selectedTableId, handleUndo, handleRedo, isPanning, isSpacePressed, items, updateItem, flushPatch, isDrawingPolygon, isPolygonClosed, undoPolygonVertex, cancelPolygonDrawing])

  const applyPaint = (x: number, y: number) => {
    if (!map) return
    // Валидация: не позволяем рисовать за пределами карты
    if (x < 0 || y < 0 || x >= map.gridWidth || y >= map.gridHeight) return
    const key = `${x},${y}`
    setPaintedZoneCells((prev) => {
      const next = new Set(prev)
      if (paintMode === 'ADD') next.add(key)
      else next.delete(key)
      return next
    })
  }

  const handleGridMouseDown = (e: React.MouseEvent) => {
    if (!map || !view) return
    // если тащим существующий объект, не запускаем рисование/ластик
    if (draggingItemIdRef.current) return
    const coords = getGridCoords(e, e.currentTarget as HTMLDivElement)

    // hover detection for zones (works even when zone overlay has pointer-events: none)
    const zoneUnderCursor = zones.find((z) => {
      const cx = coords.x
      const cy = coords.y
      if (z.cells && z.cells.length > 0) return z.cells.some((c) => c.x === cx && c.y === cy)
      return cx >= z.x && cx < z.x + z.w && cy >= z.y && cy < z.y + z.h
    })
    setHoveredZoneId(zoneUnderCursor?.id ?? null)

    if (mode === 'OBJECTS') {
      if (e.button !== 0) return
      // клик по пустому месту в режиме объектов снимает выделение
      // OPTIMIZED: Use spatial index for O(1) hit-test
      const clickedItem = spatialIndexRef.current.getItemAt(coords.x, coords.y)
      if (!clickedItem) {
        setSelectedItemId(null)
        setSelectedTableId(null)
      }

      const selectedAsset = selectedAssetId ? assets.find((a) => a.id === selectedAssetId) : null
      const type: HallPlacedItem['type'] | null =
        placingTypeOverride === 'ASSET'
          ? selectedAsset?.type ?? null // без ассета ничего не рисуем
          : placingTypeOverride === 'TABLE'
            ? 'TABLE'
            : 'DECOR'

      if (toolMode === 'ERASE') {
        // стартуем путь ластика: сразу стираем и показываем одну ячейку-позицию
        setIsPaintingObjects(true)
        eraserStartedRef.current = false
        setPaintedObjectCells(new Set()) // ластик не использует клетки для рисования
        setEraserPos({ x: coords.x, y: coords.y })
        eraseAtCell(coords.x, coords.y)
        lastPaintCoordRef.current = coords
        paintStartCoordRef.current = coords // Для Shift-привязки
        return
      }

      // DRAW: стартуем заливку только для декора, для TABLE остаётся клик + модалка
      // но не даём рисовать в запретной зоне вокруг столов
      if (type === 'DECOR' && toolMode === 'DRAW') {
        if (isCellTooCloseToAnyTable(coords.x, coords.y)) return
        setIsPaintingObjects(true)
        const initialCells = new Set([`${coords.x},${coords.y}`])
        paintedObjectCellsRef.current = initialCells
        setPaintedObjectCells(initialCells)
        lastPaintCoordRef.current = coords
        paintStartCoordRef.current = coords // Для Shift-привязки
      }
      return
    }

    if (mode !== 'ZONES') return
    
    // Skip old paint mode when drawing polygon
    if (isDrawingPolygon) return

    // Paint zones: left mouse adds, Shift+left removes
    if (e.button !== 0) return
    e.preventDefault()
    setPaintMode(e.shiftKey ? 'REMOVE' : 'ADD')
    setIsPaintingZone(true)
    applyPaint(coords.x, coords.y)
  }

  const handleGridMouseMove = (e: React.MouseEvent) => {
    if (!map || !view) return
    const perfStart = performance.now()
    const coords = getGridCoords(e, e.currentTarget as HTMLDivElement)

    // hover detection - OPTIMIZED: Use zoneCellSets for fast lookup
    let zoneUnderCursor: HallZone | null = null
    for (const z of zones) {
      const cx = coords.x
      const cy = coords.y
      const cellSet = zoneCellSets.get(z.id)
      if (cellSet) {
        if (cellSet.has(`${cx},${cy}`)) {
          zoneUnderCursor = z
          break
        }
      } else {
        if (cx >= z.x && cx < z.x + z.w && cy >= z.y && cy < z.y + z.h) {
          zoneUnderCursor = z
          break
        }
      }
    }
    setHoveredZoneId(zoneUnderCursor?.id ?? null)

    if (mode === 'OBJECTS') {
      // перетаскивание выбранного предмета
      // Используем ref для синхронного доступа (state может быть ещё не обновлён)
      const currentDraggingId = draggingItemIdRef.current
      if (currentDraggingId && dragOffsetRef.current && map) {
        const { dx, dy } = dragOffsetRef.current
        let newX = coords.x - dx
        let newY = coords.y - dy
        
        // Резолвим актуальный ID: если это временный ID, проверяем маппинг
        let actualId = currentDraggingId
        if (currentDraggingId < 0 && tempToServerIdMapRef.current.has(currentDraggingId)) {
          actualId = tempToServerIdMapRef.current.get(currentDraggingId)!
          // Синхронно обновляем refs
          draggingItemIdRef.current = actualId
          if (dragPreviewRef.current && dragPreviewRef.current.id === currentDraggingId) {
            dragPreviewRef.current = { ...dragPreviewRef.current, id: actualId }
          }
          console.log(`[HallEditor] handleGridMouseMove: resolved temp ID ${currentDraggingId} to server ID ${actualId}`)
        }
        
        // Используем itemsRef.current для актуальных данных
        const draggedItem = itemsRef.current.find((it) => it.id === actualId) 
                         || items.find((it) => it.id === actualId)
                         // Fallback: ищем по позиции в dragPreviewRef
                         || (dragPreviewRef.current && itemsRef.current.find((it) => 
                              it.x === dragPreviewRef.current!.x && 
                              it.y === dragPreviewRef.current!.y &&
                              it.type === 'TABLE'))
        if (!draggedItem) {
          console.warn(`[HallEditor] Dragged item not found: id=${actualId} (original=${currentDraggingId}), itemsRef count=${itemsRef.current.length}, items count=${items.length}`)
          console.warn(`[HallEditor] tempToServerIdMapRef:`, Array.from(tempToServerIdMapRef.current.entries()))
          console.warn(`[HallEditor] itemsRef IDs:`, itemsRef.current.map(it => it.id))
          return
        }
        
        // Если мы нашли элемент через fallback, обновляем ID
        if (draggedItem.id !== actualId) {
          console.log(`[HallEditor] Found item via fallback, updating actualId from ${actualId} to ${draggedItem.id}`)
          actualId = draggedItem.id
          draggingItemIdRef.current = actualId
        }
        
        newX = Math.max(0, Math.min(newX, map.gridWidth - draggedItem.w))
        newY = Math.max(0, Math.min(newY, map.gridHeight - draggedItem.h))
        
        // Проверка коллизии: стол не должен пересекаться с ЛЮБЫМИ элементами
        if (spatialIndexRef.current.hasCollisionWithAnyItem(newX, newY, draggedItem.w, draggedItem.h, actualId)) {
          return
        }
        // Дополнительно для столов: минимальное расстояние 1 клетка от ВСЕХ элементов
        if (draggedItem.type === 'TABLE') {
          if (spatialIndexRef.current.isTooCloseToAnyItem(newX, newY, draggedItem.w, draggedItem.h, actualId)) {
            return
          }
        }
        
        // Update ref and state for visual preview
        dragPreviewRef.current = { id: actualId, x: newX, y: newY }
        setDragPreviewPos({ x: newX, y: newY })
        return
      }

      // ластик: сразу удаляем по мере движения, показывая только позицию курсора
      if (toolMode === 'ERASE') {
        if (isPaintingObjects) {
          const start = paintStartCoordRef.current || coords
          const last = lastPaintCoordRef.current || coords
          
          // При зажатом Shift стираем по прямой линии от НАЧАЛЬНОЙ точки
          let fromX = last.x
          let fromY = last.y
          let toX = coords.x
          let toY = coords.y
          
          if (e.shiftKey) {
            const absDx = Math.abs(coords.x - start.x)
            const absDy = Math.abs(coords.y - start.y)
            if (absDx <= absDy) {
              toX = start.x
            } else {
              toY = start.y
            }
            // При Shift стираем от начальной точки
            fromX = start.x
            fromY = start.y
          }
          
          const dx = toX - fromX
          const dy = toY - fromY
          const steps = Math.max(Math.abs(dx), Math.abs(dy), 1)

          for (let i = 0; i <= steps; i++) {
            const x = fromX + Math.round((dx * i) / steps)
            const y = fromY + Math.round((dy * i) / steps)
            eraseAtCell(x, y)
            setEraserPos({ x, y })
          }
          
          // Всегда обновляем lastPaintCoordRef
          lastPaintCoordRef.current = { x: toX, y: toY }
        }
        return
      }

      if (isPaintingObjects) {
        const start = paintStartCoordRef.current || coords
        const last = lastPaintCoordRef.current || coords
        
        // При зажатом Shift рисуем прямую линию от НАЧАЛЬНОЙ точки
        let fromX = last.x
        let fromY = last.y
        let toX = coords.x
        let toY = coords.y
        
        if (e.shiftKey) {
          // Привязываем к горизонтали или вертикали от начальной точки
          const absDx = Math.abs(coords.x - start.x)
          const absDy = Math.abs(coords.y - start.y)
          if (absDx <= absDy) {
            // Вертикальная линия
            toX = start.x
          } else {
            // Горизонтальная линия
            toY = start.y
          }
          fromX = start.x
          fromY = start.y
          
          // При Shift перерисовываем всю линию заново (не накапливаем)
          const dx = toX - fromX
          const dy = toY - fromY
          const steps = Math.max(Math.abs(dx), Math.abs(dy), 1)
          
          const lineCells = new Set<string>()
          for (let i = 0; i <= steps; i++) {
            const x = fromX + Math.round((dx * i) / steps)
            const y = fromY + Math.round((dy * i) / steps)
            if (!map || x < 0 || y < 0 || x >= map.gridWidth || y >= map.gridHeight) continue
            const existing = spatialIndexRef.current.getItemAt(x, y)
            if (!existing) {
              lineCells.add(`${x},${y}`)
            }
          }
          paintedObjectCellsRef.current = lineCells // Синхронное обновление
          setPaintedObjectCells(lineCells)
          lastPaintCoordRef.current = { x: toX, y: toY }
          return
        }
        
        // Без Shift - накапливаем клетки как раньше
        const dx = toX - fromX
        const dy = toY - fromY
        const steps = Math.max(Math.abs(dx), Math.abs(dy), 1)

        const newCells: string[] = []
        for (let i = 0; i <= steps; i++) {
          const x = fromX + Math.round((dx * i) / steps)
          const y = fromY + Math.round((dy * i) / steps)
          if (!map || x < 0 || y < 0 || x >= map.gridWidth || y >= map.gridHeight) continue
          const key = `${x},${y}`
          const existing = spatialIndexRef.current.getItemAt(x, y)
          if (!existing) {
            newCells.push(key)
          }
        }

        if (newCells.length > 0) {
          // Синхронное обновление ref
          newCells.forEach((k) => paintedObjectCellsRef.current.add(k))
          setPaintedObjectCells((prev) => {
            const next = new Set(prev)
            newCells.forEach((k) => next.add(k))
            return next
          })
        }
        
        lastPaintCoordRef.current = { x: toX, y: toY }
      }
      return
    }

    // Перетаскивание вершины полигона
    if (mode === 'ZONES' && draggingVertexIndex !== null && isPolygonClosed) {
      const newX = Math.max(0, Math.min(coords.x, map.gridWidth - 1))
      const newY = Math.max(0, Math.min(coords.y, map.gridHeight - 1))
      
      const newVertices = [...polygonVertices]
      newVertices[draggingVertexIndex] = { x: newX, y: newY }
      setPolygonVertices(newVertices)
      
      // Пересчитываем клетки
      const cells = getCellsInPolygon(newVertices, map.gridWidth, map.gridHeight)
      setPaintedZoneCells(cells)
      setPolygonPreviewCells(cells)
      return
    }
    
    // Track mouse position for polygon preview
    if (mode === 'ZONES' && isDrawingPolygon && !isPolygonClosed) {
      setMouseGridPos({ x: coords.x, y: coords.y })
      return // Don't process old paint mode when in polygon mode
    }
    
    if (mode !== 'ZONES' || !isPaintingZone) return
    applyPaint(coords.x, coords.y)
    
    // Performance check: ensure handler stays under ~2ms
    const perfElapsed = performance.now() - perfStart
    if (perfElapsed > 2) {
      console.warn(`[HallEditor] handleGridMouseMove took ${perfElapsed.toFixed(2)}ms (target: <2ms)`)
    }
  }

  const handleGridMouseUp = () => {
    // Завершение перетаскивания вершины полигона
    if (draggingVertexIndex !== null) {
      setDraggingVertexIndex(null)
      return
    }
    
    if (mode === 'OBJECTS') {
      // завершение перетаскивания объекта
      // Используем ref для синхронного доступа
      const currentDraggingId = draggingItemIdRef.current
      if (currentDraggingId && dragPreviewRef.current && map && view) {
        let { id, x, y } = dragPreviewRef.current
        
        // Резолвим актуальный ID если это временный
        if (id < 0 && tempToServerIdMapRef.current.has(id)) {
          id = tempToServerIdMapRef.current.get(id)!
          console.log(`[HallEditor] handleGridMouseUp: resolved temp ID to server ID ${id}`)
        }
        
        // Используем актуальные данные из items (merged)
        const targetItem = items.find((it) => it.id === id)
        if (targetItem) {
          // Валидация: проверяем, что объект помещается в границы карты
          if (x < 0 || y < 0 || x + targetItem.w > map.gridWidth || y + targetItem.h > map.gridHeight) {
            alert(`Объект не может быть размещён за пределами карты. Текущий размер: ${map.gridWidth} × ${map.gridHeight} клеток.`)
            // Возвращаем объект на исходную позицию
            dragPreviewRef.current = { id, x: targetItem.x, y: targetItem.y }
            setDraggingItemId(null)
            setDragPreviewPos(null)
            dragOffsetRef.current = null
            dragPreviewRef.current = null
            return
          }
          
          // Проверка коллизии: предмет не должен пересекаться с ЛЮБЫМИ элементами
          if (spatialIndexRef.current.hasCollisionWithAnyItem(x, y, targetItem.w, targetItem.h, id)) {
            alert('Объект не может быть размещён поверх другого предмета.')
            dragPreviewRef.current = { id, x: targetItem.x, y: targetItem.y }
            setDraggingItemId(null)
            setDragPreviewPos(null)
            dragOffsetRef.current = null
            dragPreviewRef.current = null
            return
          }
          // Дополнительно для столов: минимальное расстояние 1 клетка от ВСЕХ элементов
          if (targetItem.type === 'TABLE') {
            if (spatialIndexRef.current.isTooCloseToAnyItem(x, y, targetItem.w, targetItem.h, id)) {
              alert('Стол не может быть размещён так близко к другим предметам. Минимальное расстояние - 1 клетка.')
              dragPreviewRef.current = { id, x: targetItem.x, y: targetItem.y }
              setDraggingItemId(null)
              setDragPreviewPos(null)
              dragOffsetRef.current = null
              dragPreviewRef.current = null
              return
            }
          }
          
          if (targetItem.x !== x || targetItem.y !== y) {
          // history before move
          const snapshot = createHistorySnapshot()
          const currentHistory = historyRef.current
          console.log('[HallEditor] Adding to history (move):', { itemsCount: snapshot.length, currentHistoryLength: currentHistory.length })
          const newHistory = [...currentHistory, snapshot]
          console.log('[HallEditor] History after add (move):', { historyLength: newHistory.length, prevLength: currentHistory.length })
          historyRef.current = newHistory
          setHistory(newHistory)
          setRedoHistory([]) // Очищаем redo при новом действии
          redoHistoryRef.current = []
          updateItem(id, { x, y })
          // Устанавливаем флаг, что мы только что переместили объект
          justMovedRef.current = true
          // Сбрасываем флаг через небольшую задержку
          setTimeout(() => {
            justMovedRef.current = false
          }, 100)
          // Немедленная отправка при завершении перетаскивания
          flushPatch(true)
          }
        }
        setDraggingItemId(null)
        setDragPreviewPos(null)
        dragOffsetRef.current = null
        dragPreviewRef.current = null
        return
      }
      // Завершение работы ластика: отправляем все удаления
      if (toolMode === 'ERASE' && isPaintingObjects && map && view) {
        // Все удаления уже в dirtyRemoves через eraseAtCell
        setIsPaintingObjects(false)
        setPaintedObjectCells(new Set())
        setEraserPos(null)
        // Немедленная отправка при завершении стирания
        flushPatch(true)
        return
      }
      
      if (isPaintingObjects && paintedObjectCells.size > 0 && map && view) {
        if (toolMode !== 'ERASE') {
          // Рисование декора
          const selectedAsset = selectedAssetId ? assets.find((a) => a.id === selectedAssetId) : null
          const type: HallPlacedItem['type'] | null =
            placingTypeOverride === 'ASSET'
              ? selectedAsset?.type ?? null
              : placingTypeOverride === 'TABLE'
                ? 'TABLE'
                : 'DECOR'
          if (type !== 'DECOR') {
            // в этом блоке рисуем только декор
            return
          }
          const baseW = 1
          const baseH = 1

          const newItems: HallPlacedItem[] = []
          paintedObjectCellsRef.current.forEach((key) => {
            const [x, y] = key.split(',').map((n) => parseInt(n, 10))
            // OPTIMIZED: Use spatial index for O(1) lookup
            const existing = spatialIndexRef.current.getItemAt(x, y)
            if (existing) return // Уже занято
            
            // Пробуем найти подходящий поворот (особенно важно для столов)
            const validPlacement = findValidRotation(x, y, baseW, baseH, type, rotation)
            
            if (validPlacement) {
              newItems.push({
                id: Date.now() + Math.random(),
                hallMapId: map.id,
                assetId: selectedAsset?.id && selectedAsset.id > 0 ? selectedAsset.id : undefined,
                type,
                x,
                y,
                w: validPlacement.w,
                h: validPlacement.h,
                rotation: validPlacement.rotation,
                layer,
                locked: false,
              })
            }
          })

          if (newItems.length > 0) {
            // history before draw - сохраняем состояние ДО действия
            // ВАЖНО: Сохраняем снимок dirtyAdds ДО создания снимка истории,
            // чтобы знать, какие элементы были добавлены до этого момента
            const dirtyAddsBeforeAction = new Map(dirtyAddsRef.current)
            
            // Используем функцию createHistorySnapshot для создания снимка с учетом dirtyAdds на момент создания
            const snapshotBefore = createHistorySnapshot(dirtyAddsBeforeAction)
            const currentHistory = historyRef.current
            
            console.log('[HallEditor] Adding to history (draw) - BEFORE:', { 
              itemsCount: snapshotBefore.length,
              currentHistoryLength: currentHistory.length,
              lastSnapshotCount: currentHistory.length > 0 ? currentHistory[currentHistory.length - 1].length : 0,
              newItemsCount: newItems.length,
              snapshotIds: snapshotBefore.map(it => it.id).slice(0, 10), // Первые 10 ID для отладки
              newItemIds: newItems.map(it => it.id || 'temp').slice(0, 10),
              persistedItemsCount: persistedItems.length,
              dirtyAddsCount: dirtyAddsRef.current.size,
              dirtyAddsBeforeCount: dirtyAddsBeforeAction.size,
              dirtyUpdatesCount: dirtyUpdatesRef.current.size,
              dirtyRemovesCount: dirtyRemovesRef.current.size,
              snapshotPositiveIds: snapshotBefore.filter(it => it.id > 0).length,
              snapshotNegativeIds: snapshotBefore.filter(it => it.id < 0).length
            })
            
            // ВСЕГДА добавляем снимок ДО действия в историю, даже если он равен последнему
            // Это нужно для того, чтобы можно было отменить действие, даже если состояние ДО действия
            // совпадает с начальным состоянием (после undo до начального состояния)
            // Используем historyRef.current вместо prev, чтобы гарантировать актуальность
            const newHistory = [...currentHistory, snapshotBefore]
            console.log('[HallEditor] History after add (draw):', { 
              historyLength: newHistory.length, 
              prevLength: currentHistory.length, 
              snapshotBeforeCount: snapshotBefore.length,
              prevState: currentHistory.map(s => s.length),
              newState: newHistory.map(s => s.length)
            })
            // Синхронно обновляем ref
            historyRef.current = newHistory
            // Обновляем state
            setHistory(newHistory)
            setRedoHistory([]) // Очищаем redo при новом действии
            redoHistoryRef.current = []
            
            // Добавляем все новые items через helper ПОСЛЕ сохранения в историю
            // Важно: добавляем элементы один за другим, чтобы каждый вызов addItem
            // обновлял dirtyAdds, что триггерит useMemo и обновляет itemsRef.current
            newItems.forEach((item) => {
              addItem({
                ...item,
                hallMapId: map.id,
                rotation: rotation ?? 0,
                layer: layer ?? 0,
                locked: false,
              })
            })
            
            // Немедленная отправка при завершении рисования
            flushPatch(true)
          }
        }
      }
      setIsPaintingObjects(false)
      paintedObjectCellsRef.current = new Set()
      setPaintedObjectCells(new Set())
      lastPaintCoordRef.current = null
      paintStartCoordRef.current = null
      setEraserPos(null)
      eraserStartedRef.current = false
      // Flush на mouseup для немедленной отправки накопленных изменений
      if (dirtyAdds.size > 0 || dirtyUpdates.size > 0 || dirtyRemoves.size > 0) {
        flushPatch(true)
      }
      return
    }
    if (mode !== 'ZONES') return
    
    // Skip old paint mode when drawing polygon
    if (isDrawingPolygon) return
    
    if (!isPaintingZone) return
    setIsPaintingZone(false)
    if (paintedZoneCells.size > 0) {
      setZoneForm({ name: '', color: '#dc2626', activeForWaiter: true })
      setShowZoneModal(true)
    }
  }

  const handleGridClick = async (e: React.MouseEvent) => {
    if (!map || !view) return
    
    // Handle ZONES mode with polygon drawing
    if (mode === 'ZONES' && isDrawingPolygon && !isPolygonClosed) {
      const { x, y } = getGridCoords(e, e.currentTarget as HTMLDivElement)
      // Validate bounds
      if (x < 0 || y < 0 || x >= map.gridWidth || y >= map.gridHeight) return
      
      // Double-click closes the polygon (if we have at least 3 vertices)
      if (e.detail === 2 && polygonVertices.length >= 3) {
        // Close polygon
        setIsPolygonClosed(true)
        const cells = getCellsInPolygon(polygonVertices, map.gridWidth, map.gridHeight)
        setPolygonPreviewCells(cells)
        setPaintedZoneCells(cells)
        return
      }
      
      // Pass shiftKey to snap to straight line
      addPolygonVertex(x, y, e.shiftKey)
      return
    }
    
    // Handle cell removal in closed polygon mode
    if (mode === 'ZONES' && isPolygonClosed) {
      const { x, y } = getGridCoords(e, e.currentTarget as HTMLDivElement)
      const key = `${x},${y}`
      if (e.shiftKey) {
        // Shift+click to remove cell
        setPaintedZoneCells((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      } else {
        // Click to add cell back
        setPaintedZoneCells((prev) => {
          const next = new Set(prev)
          next.add(key)
          return next
        })
      }
      return
    }
    
    if (mode !== 'OBJECTS') return
    // Клик не должен ничего строить в режимах ластика/перемещения
    if (toolMode !== 'DRAW') {
      // В режимах ERASE/MOVE при клике в пустое место снимаем выделение
      setSelectedItemId(null)
      return
    }

    // Если мы только что перемещали объект, не обрабатываем клик
    if (draggingItemIdRef.current || justMovedRef.current) {
      return
    }

    const { x, y } = getGridCoords(e, e.currentTarget as HTMLDivElement)

    // Валидация: не позволяем размещать объекты за пределами карты
    if (!map || x < 0 || y < 0) return

    // Проверяем, не кликнули ли мы по уже существующему объекту
    // OPTIMIZED: Use spatial index for O(1) hit-test
    const clickedItem = spatialIndexRef.current.getItemAt(x, y)
    if (clickedItem) {
      // Клик по существующему объекту — не создаем новый, но выделение уже обработано в handleItemMouseDown
      return
    }

    // Клик в пустое место — снимаем выделение
    setSelectedItemId(null)
    setSelectedTableId(null)

    const selectedAsset = selectedAssetId ? assets.find((a) => a.id === selectedAssetId) : null
    const type: HallPlacedItem['type'] | null =
      placingTypeOverride === 'ASSET'
        ? selectedAsset?.type ?? null
        : placingTypeOverride === 'TABLE'
          ? 'TABLE'
          : 'DECOR'
    if (!type) {
      // Нет выбранного ассета и тип не задан явно — ничего не ставим
      return
    }
    const baseW =
      type === 'TABLE'
        ? selectedAsset?.widthCells ?? 3
        : 1
    const baseH =
      type === 'TABLE'
        ? selectedAsset?.heightCells ?? 2
        : 1

    // Пробуем найти подходящий поворот (0°, 90°, 180°, 270°)
    const validPlacement = findValidRotation(x, y, baseW, baseH, type, rotation)
    
    if (!validPlacement) {
      if (type === 'TABLE') {
        alert('Невозможно разместить стол в этой позиции. Попробуйте другое место (минимальное расстояние от других предметов - 1 клетка).')
      } else {
        alert('Невозможно разместить объект в этой позиции.')
      }
      return
    }

    const finalW = validPlacement.w
    const finalH = validPlacement.h
    const finalRotation = validPlacement.rotation

    // Table placement requires table entity (label/capacity)
    // Сохраняем БАЗОВЫЕ размеры (до поворота), чтобы recheck мог правильно определить rotation
    if (type === 'TABLE') {
      pendingTablePlacementRef.current = { x, y, baseW, baseH, assetId: selectedAsset?.id && selectedAsset.id > 0 ? selectedAsset.id : undefined }
      setTableForm({ label: '', capacity: selectedAsset?.defaultCapacity?.toString() || '2' })
      setShowTableModal(true)
      return
    }

    const next: HallPlacedItem = {
      id: Date.now(),
      hallMapId: map.id,
      assetId: selectedAsset?.id && selectedAsset.id > 0 ? selectedAsset.id : undefined,
      type,
      x,
      y,
      w: finalW,
      h: finalH,
      rotation: finalRotation,
      layer,
      locked: false,
    }

    // history before placing a single decor block
    const snapshot = createHistorySnapshot()
    const currentHistory = historyRef.current
    console.log('[HallEditor] Adding to history (place decor):', { itemsCount: snapshot.length, currentHistoryLength: currentHistory.length })
    const newHistory = [...currentHistory, snapshot]
    console.log('[HallEditor] History after add (place decor):', { historyLength: newHistory.length, prevLength: currentHistory.length })
    historyRef.current = newHistory
    setHistory(newHistory)
    setRedoHistory([]) // Очищаем redo при новом действии
    redoHistoryRef.current = []

    addItem(next)
    // Немедленная отправка при клике (одиночное размещение)
    flushPatch(true)
  }

  const handleSaveZone = async () => {
    try {
      const cells = Array.from(paintedZoneCells).map((key) => {
        const [x, y] = key.split(',').map((n) => parseInt(n, 10))
        return { x, y }
      })
      if (cells.length === 0) {
        alert('Сначала закрасьте клетки зоны')
        return
      }
      
      // Сохраняем вершины полигона
      const vertices = polygonVertices.length >= 3 ? polygonVertices : undefined
      
      if (editingZoneId) {
        // Обновляем существующую зону
        await hallService.updateZone(editingZoneId, {
          name: zoneForm.name,
          color: zoneForm.color,
          activeForWaiter: zoneForm.activeForWaiter,
          cells,
          vertices,
        })
      } else {
        // Создаём новую зону
        await hallService.createZone({
          name: zoneForm.name || 'Зона',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          cells,
          vertices,
          color: zoneForm.color,
          activeForWaiter: zoneForm.activeForWaiter,
        })
      }
      
      setShowZoneModal(false)
      setIsPaintingZone(false)
      setPaintedZoneCells(new Set())
      // Reset polygon state
      setIsDrawingPolygon(false)
      setPolygonVertices([])
      setPolygonPreviewCells(new Set())
      setIsPolygonClosed(false)
      polygonHistoryRef.current = []
      setEditingZoneId(null)
      await load()
    } catch (e: any) {
      alert(e.response?.data?.message || (editingZoneId ? 'Не удалось обновить зону' : 'Не удалось создать зону'))
    }
  }

  const handleCancelZone = () => {
    setShowZoneModal(false)
    setEditingZoneId(null)
    // Reset polygon state
    setIsDrawingPolygon(false)
    setPolygonVertices([])
    setPolygonPreviewCells(new Set())
    setIsPolygonClosed(false)
    polygonHistoryRef.current = []
    setIsPaintingZone(false)
    setPaintedZoneCells(new Set())
  }

  const handleCreateTableAndPlace = async () => {
    if (!pendingTablePlacementRef.current || !map || !view) return
    const placement = pendingTablePlacementRef.current
    const capacity = parseInt(tableForm.capacity || '2')
    if (!tableForm.label) {
      alert('Укажите номер/лейбл стола')
      return
    }
    try {
      // Пытаемся создать стол; если уже есть с таким лейблом — переиспользуем его
      let table = null as HallTable | null
      try {
        const createdTable = await hallService.createTable({
          label: tableForm.label,
          capacity: isNaN(capacity) ? 2 : capacity,
          isActive: true,
        })
        table = createdTable
      } catch (e: any) {
        const msg: string | undefined = e?.response?.data?.message
        if (msg && msg.toLowerCase().includes('table with this label already exists')) {
          const all = await hallService.getTables()
          table = all.find((t) => t.label === tableForm.label) || null
          if (!table) {
            throw e
          }
        } else {
          throw e
        }
      }
      if (!table) {
        throw new Error('Не удалось получить стол')
      }

      // Проверки коллизии уже выполнены в findValidRotation перед открытием модального окна
      // Повторная проверка на случай если что-то изменилось (используем БАЗОВЫЕ размеры)
      const recheck = findValidRotation(placement.x, placement.y, placement.baseW, placement.baseH, 'TABLE', 0)
      if (!recheck) {
        alert('Невозможно разместить стол в этой позиции. Попробуйте другое место.')
        setShowTableModal(false)
        pendingTablePlacementRef.current = null
        return
      }
      
      console.log(`[HallEditor] recheck result: rotation=${recheck.rotation}, w=${recheck.w}, h=${recheck.h} (base: ${placement.baseW}x${placement.baseH})`)

      const next: HallPlacedItem = {
        id: Date.now(),
        hallMapId: map.id,
        assetId: placement.assetId,
        type: 'TABLE',
        x: placement.x,
        y: placement.y,
        w: recheck.w,
        h: recheck.h,
        rotation: recheck.rotation,
        layer,
        tableId: table.id,
        locked: false,
      }
      
      console.log(`[HallEditor] Creating TABLE: rotation=${next.rotation}, size=${next.w}x${next.h}, pos=(${next.x},${next.y})`)

      // history before placing table
      const snapshot = createHistorySnapshot()
      const currentHistory = historyRef.current
      console.log('[HallEditor] Adding to history (place table):', { itemsCount: snapshot.length, currentHistoryLength: currentHistory.length })
      const newHistory = [...currentHistory, snapshot]
      console.log('[HallEditor] History after add (place table):', { historyLength: newHistory.length, prevLength: currentHistory.length })
      historyRef.current = newHistory
      setHistory(newHistory)
      setRedoHistory([]) // Очищаем redo при новом действии
      redoHistoryRef.current = []
      
      addItem(next)
      // Немедленная отправка при размещении стола
      flushPatch(true)
      setShowTableModal(false)
      pendingTablePlacementRef.current = null
    } catch (e: any) {
      if (e?.response?.data?.message) {
        alert(e.response.data.message)
      } else {
        alert('Не удалось создать/разместить стол')
      }
    }
  }

  // Render item using memoized component (OPTIMIZED)
  const renderItem = useCallback((it: HallPlacedItem) => {
    const asset = it.assetId ? (assetsById.get(it.assetId) ?? null) : null
    const table = it.tableId ? (tablesById.get(it.tableId) ?? null) : null

    // Используем state для перерисовки при изменении позиции превью
    const isDragging = draggingItemId === it.id
    const dragX = isDragging && dragPreviewPos ? dragPreviewPos.x : null
    const dragY = isDragging && dragPreviewPos ? dragPreviewPos.y : null

    const isSelected = selectedItemId === it.id

    const handleItemContextMenu = async (e: React.MouseEvent) => {
      if (!map || !view) return
      e.preventDefault()
      if (mode !== 'OBJECTS') return
      const snapshot = createHistorySnapshot()
      const currentHistory = historyRef.current
      console.log('[HallEditor] Adding to history (remove):', { itemsCount: snapshot.length, currentHistoryLength: currentHistory.length })
      const newHistory = [...currentHistory, snapshot]
      console.log('[HallEditor] History after add (remove):', { historyLength: newHistory.length, prevLength: currentHistory.length })
      historyRef.current = newHistory
      setHistory(newHistory)
      setRedoHistory([]) // Очищаем redo при новом действии
      redoHistoryRef.current = []
      removeItem(it.id)
      flushPatch(true)
    }

    const handleItemMouseDown = (e: React.MouseEvent) => {
      if (!map || !view) return
      if (mode !== 'OBJECTS') return
      if (e.button !== 0) return
      
      // В режиме рисования не выделяем декор (чтобы не мешать рисованию)
      // Столы остаются выделяемыми
      if (toolMode === 'DRAW' && it.type !== 'TABLE') {
        // Не останавливаем событие, чтобы оно дошло до canvas и началось рисование
        return
      }
      
      e.stopPropagation()

      if (toolMode === 'ERASE') {
        const coords = getGridCoords(e, e.currentTarget.parentElement as HTMLDivElement)
        setIsPaintingObjects(true)
        eraserStartedRef.current = false
        setPaintedObjectCells(new Set())
        setEraserPos({ x: coords.x, y: coords.y })
        eraseAtCell(coords.x, coords.y)
        lastPaintCoordRef.current = coords
        return
      }

      // Резолвим актуальный ID: если это временный ID, проверяем маппинг
      let actualItemId = it.id
      console.log(`[HallEditor] handleItemMouseDown check: it.id=${it.id}, isNegative=${it.id < 0}, mapHas=${tempToServerIdMapRef.current.has(it.id)}, mapSize=${tempToServerIdMapRef.current.size}, mapKeys=[${Array.from(tempToServerIdMapRef.current.keys()).join(',')}]`)
      if (it.id < 0 && tempToServerIdMapRef.current.has(it.id)) {
        actualItemId = tempToServerIdMapRef.current.get(it.id)!
        console.log(`[HallEditor] handleItemMouseDown: resolved temp ID ${it.id} to server ID ${actualItemId}`)
      }
      
      // Находим актуальный элемент по резолвленному ID
      const actualItem = itemsRef.current.find(i => i.id === actualItemId) || it
      
      if (it.type === 'TABLE') {
        const tableId = actualItem.tableId ?? null
        console.log('[HallEditor] Table item selected:', { tableId, itemId: actualItemId, originalId: it.id })
        setSelectedTableId(tableId) // справочно (например, для UI)
        selectedItemIdRef.current = actualItemId
        setSelectedItemId(actualItemId) // важно: выбор именно размещённого item
      } else {
        selectedItemIdRef.current = actualItemId
        setSelectedItemId(actualItemId)
        setSelectedTableId(null)
      }

      if (it.type === 'TABLE' && (toolMode === 'DRAW' || toolMode === 'MOVE')) {
        const coords = getGridCoords(e, e.currentTarget.parentElement as HTMLDivElement)
        const dx = coords.x - actualItem.x
        const dy = coords.y - actualItem.y
        dragOffsetRef.current = { dx, dy }
        console.log('[HallEditor] Starting drag:', { 
          itemId: actualItemId,
          originalId: it.id,
          itemPos: { x: actualItem.x, y: actualItem.y },
          coords,
          offset: { dx, dy },
          itemsCount: items.length,
          itemsRefCount: itemsRef.current.length,
          itemInItems: items.some(i => i.id === actualItemId),
          itemInItemsRef: itemsRef.current.some(i => i.id === actualItemId)
        })
        setDraggingItemId(actualItemId)
        dragPreviewRef.current = { id: actualItemId, x: actualItem.x, y: actualItem.y }
        console.log('[HallEditor] After setDraggingItemId:', { 
          refValue: draggingItemIdRef.current 
        })
      }
    }

    return (
      <HallItem
        key={`${it.id}-${it.x}-${it.y}-${isDragging ? dragX : ''}-${isDragging ? dragY : ''}`}
        item={it}
        asset={asset}
        table={table}
        isDragging={isDragging}
        dragX={dragX}
        dragY={dragY}
        isSelected={isSelected}
        isInPolygonZone={tableItemIdsInPolygon.has(it.id)}
        pointerEventsNone={isDrawingPolygon} // Отключаем клики при рисовании полигона
        onContextMenu={handleItemContextMenu}
        onMouseDown={handleItemMouseDown}
        onClick={(e) => e.stopPropagation()}
      />
    )
  }, [assetsById, tablesById, selectedTableId, selectedItemId, map, view, mode, toolMode, getGridCoords, eraseAtCell, items, removeItem, flushPatch, tableItemIdsInPolygon, draggingItemId, dragPreviewPos, isDrawingPolygon])

  if (loading) {
    return <div style={{ padding: 20 }}>Загрузка карты зала…</div>
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ color: 'red', marginBottom: 16 }}>Ошибка: {error}</div>
        <button className="btn-primary" onClick={() => load()}>
          Попробовать снова
        </button>
      </div>
    )
  }

  if (!map) {
    return <div style={{ padding: 20 }}>Карта не найдена</div>
  }

  return (
    <div className="hall-page">
      <div className="hall-topbar">
        <div className="hall-topbar-left">
          <h1 style={{ margin: 0 }}>Редактор зала</h1>
          <div className="hall-mode-tabs">
            <button className={mode === 'OBJECTS' ? 'active' : ''} onClick={() => setMode('OBJECTS')}>
              Объекты
            </button>
            <button className={mode === 'ZONES' ? 'active' : ''} onClick={() => setMode('ZONES')}>
              Зоны
            </button>
            <button className={mode === 'WAITER_VIEW' ? 'active' : ''} onClick={() => setMode('WAITER_VIEW')}>
              Просмотр официанта
            </button>
          </div>
        </div>

        <div className="hall-topbar-right">
          <div className="hall-filter">
            <label>Зона:</label>
            <select value={selectedZoneId} onChange={(e) => setSelectedZoneId(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value))}>
              <option value="ALL">Все зоны</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-secondary" onClick={() => load()}>
            Обновить
          </button>
          {mode === 'OBJECTS' && (
            <>
              <button
                className="btn-primary"
                disabled={!(dirtyAdds.size > 0 || dirtyUpdates.size > 0 || dirtyRemoves.size > 0)}
                style={{
                  opacity: dirtyAdds.size > 0 || dirtyUpdates.size > 0 || dirtyRemoves.size > 0 ? 1 : 0.6,
                }}
                onClick={async () => {
                  try {
                    await flushPatch(true)
                  } catch (e) {
                    // flushPatch уже делает alert/console внутри при ошибках
                  }
                }}
              >
                Подтвердить изменения
              </button>
              <button
                className="btn-danger"
                onClick={async () => {
                  if (!map || !view) return
                  if (!window.confirm('Очистить все объекты на карте?')) return
                  try {
                    // Удаляем все items
                    items.forEach((it) => removeItem(it.id))
                    // Немедленная отправка при очистке
                    await flushPatch(true)
                    // Очищаем историю undo/redo после очистки карты
                    setHistory([])
                    setRedoHistory([])
                  } catch (e: any) {
                    alert(e.response?.data?.message || 'Не удалось очистить карту')
                  }
                }}
              >
                Очистить карту
              </button>
            </>
          )}
        </div>
      </div>

      <div className="hall-content">
        <div className="hall-sidebar">
          {mode === 'OBJECTS' && (
            <>
              <div className="hall-sidebar-block">
                <div className="hall-sidebar-title">Палитра</div>
                <SearchableSingleSelect<number>
                  value={selectedAssetId}
                  onChange={(v) => setSelectedAssetId(v)}
                  maxVisibleItems={4}
                  options={[
                    { value: null, label: '(Без ассета)' },
                    ...assets.map((a) => ({
                      value: a.id,
                      label: `${a.type} — ${a.name}`,
                    })),
                  ]}
                  placeholder="(Без ассета)"
                  nothingFoundText="Ничего не найдено"
                  searchPlaceholder="Поиск по ассетам..."
                />
                <div className="hall-row">
                  <label>Режим:</label>
                  <select value={toolMode} onChange={(e) => setToolMode(e.target.value as ToolMode)}>
                    <option value="DRAW">Рисование</option>
                    <option value="ERASE">Ластик</option>
                  </select>
                </div>
                <div style={{ fontSize: 11, color: '#666', marginTop: -4, marginBottom: 4 }}>
                  <strong>Shift</strong> — рисовать прямые линии
                </div>
                {toolMode === 'ERASE' && (
                  <div className="hall-row">
                    <label>Радиус ластика:</label>
                    <input
                      type="number"
                      min={0}
                      max={5}
                      value={eraseRadius}
                      onChange={(e) => setEraseRadius(Math.max(0, Math.min(5, parseInt(e.target.value || '0'))))}
                    />
                  </div>
                )}
                <div className="hall-row">
                  <label>Тип:</label>
                  <select value={placingTypeOverride} onChange={(e) => setPlacingTypeOverride(e.target.value as any)}>
                    <option value="ASSET">Как у ассета</option>
                    <option value="TABLE">TABLE</option>
                    <option value="DECOR">DECOR</option>
                  </select>
                </div>
                <div className="hall-row">
                  <label>Поворот:</label>
                  <select value={rotation} onChange={(e) => setRotation(parseInt(e.target.value))}>
                    <option value={0}>0°</option>
                    <option value={90}>90°</option>
                    <option value={180}>180°</option>
                    <option value={270}>270°</option>
                  </select>
                </div>
                <div className="hall-row">
                  <label>Слой:</label>
                  <input type="number" value={layer} onChange={(e) => setLayer(parseInt(e.target.value || '0'))} />
                </div>
                {/* Размер клеток теперь задаётся только в момент создания спрайта */}
                <div className="hall-hint">Клик по сетке размещает объект. TABLE попросит номер/вместимость.</div>
              </div>
              <div className="hall-sidebar-block">
                <div className="hall-sidebar-title">Размер карты</div>
                <div className="hall-hint" style={{ marginBottom: 8 }}>
                  Текущий размер: {map?.gridWidth} × {map?.gridHeight} клеток
                </div>
                <button
                  className="btn-primary btn-small"
                  style={{ width: '100%' }}
                  onClick={async () => {
                    if (!map || !view) return
                    const addWidth = 5
                    const addHeight = 4
                    const newWidth = map.gridWidth + addWidth
                    const newHeight = map.gridHeight + addHeight
                    try {
                      await hallService.updateMap({
                        ...map,
                        gridWidth: newWidth,
                        gridHeight: newHeight,
                      })
                      await load()
                      alert(`Карта увеличена до ${newWidth} × ${newHeight} клеток`)
                    } catch (e: any) {
                      alert(e.response?.data?.message || 'Не удалось увеличить карту')
                    }
                  }}
                >
                  + Добавить клеток (+{5}×{4})
                </button>
                <div className="hall-hint" style={{ fontSize: 11, marginTop: 4 }}>
                  Добавляет 5 клеток по ширине и 4 по высоте
                </div>
              </div>
            </>
          )}

          {mode === 'ZONES' && (
            <div className="hall-sidebar-block">
              <div className="hall-sidebar-title">Создание зон</div>
              
              {/* Polygon drawing mode */}
              {!isDrawingPolygon && !isPolygonClosed && (
                <div style={{ marginBottom: 12 }}>
                  <button className="btn-primary" onClick={startPolygonDrawing} style={{ width: '100%' }}>
                    🔷 Начать рисовать полигон
                  </button>
                </div>
              )}
              
              {isDrawingPolygon && !isPolygonClosed && (
                <div style={{ marginBottom: 12 }}>
                  <div className="hall-hint" style={{ marginBottom: 8 }}>
                    Кликайте по карте чтобы добавить вершины полигона. 
                    Кликните рядом с первой точкой или дважды, чтобы замкнуть.
                    <br />
                    <strong>Shift</strong> — рисовать прямые линии (0°/90°)
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                    Вершин: {polygonVertices.length} | Клеток: {polygonPreviewCells.size}
                  </div>
                  {tablesInPolygon.length > 0 && (
                    <div style={{ fontSize: 12, marginBottom: 8, padding: '8px', background: '#f0f9ff', borderRadius: 4, border: '1px solid #bae6fd' }}>
                      <div style={{ fontWeight: 500, marginBottom: 4, color: '#0369a1' }}>
                        Столы в зоне ({tablesInPolygon.length}):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {tablesInPolygon.map((t) => (
                          <span key={t.itemId} style={{ background: '#0ea5e9', color: 'white', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                            {t.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
                    Ctrl+Z — отмена вершины | Esc — отменить всё
                  </div>
                  <button className="btn-danger" onClick={cancelPolygonDrawing} style={{ width: '100%' }}>
                    Отменить рисование
                  </button>
                </div>
              )}
              
              {isPolygonClosed && (
                <div style={{ marginBottom: 12 }}>
                  <div className="hall-hint" style={{ marginBottom: 8 }}>
                    Полигон замкнут! Редактируйте вершины:
                  </div>
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 8, lineHeight: 1.5 }}>
                    • Перетащите <span style={{ color: '#dc2626', fontWeight: 600 }}>●</span> для перемещения вершины<br/>
                    • Перетащите <span style={{ color: '#6366f1', fontWeight: 600 }}>●</span> на ребре для добавления вершины<br/>
                    • Shift+клик по вершине — удалить<br/>
                    • Shift+клик по клетке — убрать/добавить клетку
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                    Вершин: {polygonVertices.length} | Клеток: {paintedZoneCells.size} | Столов: {tablesInPolygon.length}
                  </div>
                  {tablesInPolygon.length > 0 && (
                    <div style={{ fontSize: 12, marginBottom: 8, padding: '8px', background: '#f0fdf4', borderRadius: 4, border: '1px solid #bbf7d0' }}>
                      <div style={{ fontWeight: 500, marginBottom: 4, color: '#166534' }}>
                        Столы в зоне:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {tablesInPolygon.map((t) => (
                          <span key={t.itemId} style={{ background: '#22c55e', color: 'white', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                            {t.label} ({t.capacity} мест)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-primary" onClick={confirmPolygonZone} style={{ flex: 1 }}>
                      ✓ {editingZoneId ? 'Сохранить зону' : 'Создать зону'}
                    </button>
                    <button className="btn-danger" onClick={cancelPolygonDrawing} style={{ flex: 1 }}>
                      ✕ Отмена
                    </button>
                  </div>
                </div>
              )}
              
              <div style={{ borderTop: '1px solid #ddd', paddingTop: 12, marginTop: 12 }}>
                <div className="hall-sidebar-title">Существующие зоны</div>
                <div className="hall-zone-list">
                  {zones.length === 0 && <div style={{ color: '#888', fontSize: 13 }}>Зон пока нет</div>}
                  {zones.map((z) => (
                    <div key={z.id} className="hall-zone-row">
                      <span className="hall-zone-dot" style={{ background: z.color || '#dc2626' }} />
                      <span style={{ flex: 1 }}>{z.name}</span>
                      <button 
                        className="btn-small" 
                        style={{ marginRight: 4, padding: '2px 6px' }}
                        onClick={() => {
                          setEditingZone(z)
                          setEditZoneForm({ name: z.name, color: z.color || '#dc2626' })
                        }}
                        title="Редактировать"
                      >
                        ✎
                      </button>
                      <button className="btn-small btn-danger" onClick={() => hallService.deleteZone(z.id).then(load)}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {mode === 'WAITER_VIEW' && (
            <div className="hall-sidebar-block">
              <div className="hall-sidebar-title">Просмотр официанта</div>
              <div className="hall-hint">В этом режиме мы визуально как у официанта (клики по столам будут в отдельной странице карты).</div>
            </div>
          )}
        </div>

        {/* Zoom controls - зафиксированы относительно viewport, не двигаются с картой */}
        <div style={{ position: 'fixed', top: 80, right: 20, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, background: 'white', padding: '8px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', pointerEvents: 'auto' }}>
            <button
              className="btn-small"
              onClick={() => {
                // Дискретные шаги по 10% (0.1, 0.2, 0.3, ... до 4.0)
                const step = 0.1
                const currentStep = Math.round(zoom / step)
                const newStep = Math.min(40, currentStep + 1)  // Увеличение: до 4.0 (40 * 0.1)
                const newZoom = newStep * step
                setZoom(newZoom)
                // Ограничиваем panOffset после изменения zoom
                setTimeout(() => {
                  const clamped = clampPanOffset(panOffsetRef.current)
                  panOffsetRef.current = clamped
                  setPanOffset(clamped)
                }, 0)
              }}
              title="Увеличить (Ctrl/Cmd + колесо мыши вверх)"
            >
              +
            </button>
            <div style={{ textAlign: 'center', fontSize: '12px', minWidth: '40px' }}>
              {Math.round(zoom * 100)}%
            </div>
            <button
              className="btn-small"
              onClick={() => {
                // Дискретные шаги по 10% (0.1, 0.2, 0.3, ... до 4.0)
                const step = 0.1
                const currentStep = Math.round(zoom / step)
                const newStep = Math.max(1, currentStep - 1)  // Уменьшение: от 0.1
                const newZoom = newStep * step
                setZoom(newZoom)
                // Ограничиваем panOffset после изменения zoom
                setTimeout(() => {
                  const clamped = clampPanOffset(panOffsetRef.current)
                  panOffsetRef.current = clamped
                  setPanOffset(clamped)
                }, 0)
              }}
              title="Уменьшить (Ctrl/Cmd + колесо мыши вниз)"
            >
              −
            </button>
            <button
              className="btn-small"
              onClick={() => {
                setZoom(1)
                setPanOffset({ x: 0, y: 0 })
              }}
              title="Сбросить"
            >
              ⟲
            </button>
          </div>
        <div ref={canvasWrapRef} className="hall-canvas-wrap">
          <div
            ref={canvasRef}
            className={`hall-canvas ${isDrawingPolygon ? 'drawing-polygon' : ''}`}
            style={containerStyle}
            onClick={handleGridClick}
            onMouseDown={(e) => {
              // Pan при зажатии средней кнопки мыши, правой кнопки или пробела + ЛКМ
              if (e.button === 1 || e.button === 2 || (e.button === 0 && isSpacePressed)) {
                e.preventDefault()
                setIsPanning(true)
                isPanningRef.current = true
                panStartRef.current = { x: e.clientX - panOffsetRef.current.x, y: e.clientY - panOffsetRef.current.y }
                if (canvasRef.current) {
                  canvasRef.current.style.cursor = 'grabbing'
                }
                return
              }
              handleGridMouseDown(e)
            }}
            onMouseMove={(e) => {
              // Pan - OPTIMIZED: Update ref directly, state updated on mouseup
              if (isPanningRef.current && panStartRef.current) {
                e.preventDefault()
                let newPan = {
                  x: e.clientX - panStartRef.current.x,
                  y: e.clientY - panStartRef.current.y,
                }
                
                // Ограничиваем панорамирование границами карты
                newPan = clampPanOffset(newPan)
                
                panOffsetRef.current = newPan
                // Update state for virtualization recalculation (throttled via RAF)
                setPanOffset(newPan)
                return
              }
              handleGridMouseMove(e)
            }}
            onMouseUp={() => {
              if (isPanningRef.current) {
                setIsPanning(false)
                isPanningRef.current = false
                panStartRef.current = null
                if (canvasRef.current) {
                  canvasRef.current.style.cursor = isSpacePressed ? 'grab' : ''
                }
                return
              }
              handleGridMouseUp()
            }}
            onMouseLeave={() => {
              // Если курсор вышел за пределы карты, считаем это отпусканием мыши:
              // дорисовываем и сохраняем всё, что было нарисовано.
              if (isPaintingZone || isPaintingObjects) {
                handleGridMouseUp()
              }
              if (isPanningRef.current) {
                setIsPanning(false)
                isPanningRef.current = false
                panStartRef.current = null
              }
              setHoveredZoneId(null)
            }}
            onContextMenu={(e) => {
              // Отключаем контекстное меню при pan
              if (isPanningRef.current) {
                e.preventDefault()
              }
            }}
          >
            {/* grid */}
            <div
              className="hall-grid"
              style={{
                backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
              }}
            />

            {/* zones overlay */}
            {zones.map((z) => (
              <div
                key={z.id}
                className={`hall-zone-rect ${hoveredZoneId === z.id ? 'hall-zone-hover' : ''}`}
                style={{
                  left: z.x * CELL_SIZE,
                  top: z.y * CELL_SIZE,
                  width: z.w * CELL_SIZE,
                  height: z.h * CELL_SIZE,
                  borderColor: '#dc2626', // Красные границы
                  backgroundColor: `${z.color}22`,
                }}
              >
                {hoveredZoneId === z.id && <span className="hall-zone-label">{z.name}</span>}
              </div>
            ))}

            {/* Preview cells while drawing polygon (before closing) */}
            {mode === 'ZONES' && isDrawingPolygon && !isPolygonClosed && polygonPreviewCells.size > 0 &&
              Array.from(polygonPreviewCells).map((key) => {
                const [x, y] = key.split(',').map((n) => parseInt(n, 10))
                return (
                  <div
                    key={`preview-${key}`}
                    className="hall-zone-cell"
                    style={{
                      left: x * CELL_SIZE,
                      top: y * CELL_SIZE,
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      background: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      pointerEvents: 'none',
                    }}
                  />
                )
              })}

            {/* painted draft zone (cells) - shown after polygon is closed */}
            {mode === 'ZONES' && isPolygonClosed &&
              Array.from(paintedZoneCells).map((key) => {
                const [x, y] = key.split(',').map((n) => parseInt(n, 10))
                return (
                  <div
                    key={`draft-${key}`}
                    className="hall-zone-cell"
                    style={{
                      left: x * CELL_SIZE,
                      top: y * CELL_SIZE,
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      background: 'rgba(34, 197, 94, 0.3)',
                      border: '1px solid rgba(34, 197, 94, 0.5)',
                      pointerEvents: 'auto',
                      cursor: 'pointer',
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (e.shiftKey) {
                        // Shift+click to remove cell
                        setPaintedZoneCells((prev) => {
                          const next = new Set(prev)
                          next.delete(key)
                          return next
                        })
                      }
                    }}
                  />
                )
              })}
            
            {/* Polygon vertices and lines */}
            {mode === 'ZONES' && isDrawingPolygon && polygonVertices.length > 0 && (
              <svg
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 1000,
                }}
              >
                {/* Lines between vertices */}
                {polygonVertices.map((v, i) => {
                  if (i === 0) return null
                  const prev = polygonVertices[i - 1]
                  return (
                    <line
                      key={`line-${i}`}
                      x1={(prev.x + 0.5) * CELL_SIZE}
                      y1={(prev.y + 0.5) * CELL_SIZE}
                      x2={(v.x + 0.5) * CELL_SIZE}
                      y2={(v.y + 0.5) * CELL_SIZE}
                      stroke="#dc2626"
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                  )
                })}
                
                {/* Closing line (if closed) */}
                {isPolygonClosed && polygonVertices.length >= 3 && (
                  <line
                    x1={(polygonVertices[polygonVertices.length - 1].x + 0.5) * CELL_SIZE}
                    y1={(polygonVertices[polygonVertices.length - 1].y + 0.5) * CELL_SIZE}
                    x2={(polygonVertices[0].x + 0.5) * CELL_SIZE}
                    y2={(polygonVertices[0].y + 0.5) * CELL_SIZE}
                    stroke="#22c55e"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                )}
                
                {/* Preview line to mouse cursor (if not closed) */}
                {!isPolygonClosed && mouseGridPos && polygonVertices.length > 0 && (() => {
                  // Snap preview to straight line if Shift is pressed
                  const previewPos = isShiftPressed 
                    ? snapToStraightLine(mouseGridPos.x, mouseGridPos.y, polygonVertices)
                    : mouseGridPos
                  return (
                    <line
                      x1={(polygonVertices[polygonVertices.length - 1].x + 0.5) * CELL_SIZE}
                      y1={(polygonVertices[polygonVertices.length - 1].y + 0.5) * CELL_SIZE}
                      x2={(previewPos.x + 0.5) * CELL_SIZE}
                      y2={(previewPos.y + 0.5) * CELL_SIZE}
                      stroke={isShiftPressed ? '#0ea5e9' : '#dc2626'}
                      strokeWidth={2}
                      strokeDasharray="5,5"
                      strokeLinecap="round"
                    />
                  )
                })()}
                
                {/* Vertices (интерактивные — можно перетаскивать и удалять) */}
                {polygonVertices.map((v, i) => (
                  <circle
                    key={`vertex-${i}`}
                    cx={(v.x + 0.5) * CELL_SIZE}
                    cy={(v.y + 0.5) * CELL_SIZE}
                    r={draggingVertexIndex === i ? 10 : (i === 0 ? 8 : 6)}
                    fill={draggingVertexIndex === i ? '#fbbf24' : (i === 0 ? '#22c55e' : '#dc2626')}
                    stroke="white"
                    strokeWidth={2}
                    style={{ cursor: isPolygonClosed ? 'grab' : 'default', pointerEvents: 'auto' }}
                    onMouseDown={(e) => {
                      if (!isPolygonClosed) return
                      e.stopPropagation()
                      if (e.shiftKey) {
                        // Shift+клик — удалить вершину (минимум 3 вершины должно остаться)
                        if (polygonVertices.length > 3) {
                          const newVertices = polygonVertices.filter((_, idx) => idx !== i)
                          setPolygonVertices(newVertices)
                          // Пересчитываем клетки
                          if (map) {
                            const cells = getCellsInPolygon(newVertices, map.gridWidth, map.gridHeight)
                            setPaintedZoneCells(cells)
                            setPolygonPreviewCells(cells)
                          }
                        } else {
                          alert('Минимум 3 вершины должно остаться')
                        }
                      } else {
                        // Начинаем перетаскивание
                        setDraggingVertexIndex(i)
                      }
                    }}
                  />
                ))}
                
                {/* Точки на рёбрах для добавления вершин (только когда полигон закрыт) */}
                {isPolygonClosed && polygonVertices.length >= 3 && polygonVertices.map((v, i) => {
                  const next = polygonVertices[(i + 1) % polygonVertices.length]
                  const midX = (v.x + next.x) / 2
                  const midY = (v.y + next.y) / 2
                  return (
                    <circle
                      key={`edge-midpoint-${i}`}
                      cx={(midX + 0.5) * CELL_SIZE}
                      cy={(midY + 0.5) * CELL_SIZE}
                      r={5}
                      fill="#6366f1"
                      stroke="white"
                      strokeWidth={1.5}
                      opacity={0.7}
                      style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        // Добавляем новую вершину между i и i+1
                        const newVertices = [
                          ...polygonVertices.slice(0, i + 1),
                          { x: Math.round(midX), y: Math.round(midY) },
                          ...polygonVertices.slice(i + 1),
                        ]
                        setPolygonVertices(newVertices)
                        // Пересчитываем клетки
                        if (map) {
                          const cells = getCellsInPolygon(newVertices, map.gridWidth, map.gridHeight)
                          setPaintedZoneCells(cells)
                          setPolygonPreviewCells(cells)
                        }
                        // Начинаем перетаскивание новой вершины
                        setDraggingVertexIndex(i + 1)
                      }}
                    />
                  )
                })}
                
                {/* First vertex highlight (click zone indicator) */}
                {!isPolygonClosed && polygonVertices.length >= 3 && (
                  <circle
                    cx={(polygonVertices[0].x + 0.5) * CELL_SIZE}
                    cy={(polygonVertices[0].y + 0.5) * CELL_SIZE}
                    r={CELL_SIZE * 1.5}
                    fill="transparent"
                    stroke="#22c55e"
                    strokeWidth={2}
                    strokeDasharray="4,4"
                    opacity={0.5}
                  />
                )}
              </svg>
            )}

            {/* preview painted decor/walls while dragging (только в режиме рисования) */}
            {mode === 'OBJECTS' &&
              toolMode === 'DRAW' &&
              (() => {
                const selectedAsset = selectedAssetId ? assets.find((a) => a.id === selectedAssetId) : null
                return Array.from(paintedObjectCells).map((key) => {
                  const [x, y] = key.split(',').map((n) => parseInt(n, 10))
                  const wCells =
                    rotation % 180 === 90 ? (selectedAsset?.heightCells ?? 1) : (selectedAsset?.widthCells ?? 1)
                  const hCells =
                    rotation % 180 === 90 ? (selectedAsset?.widthCells ?? 1) : (selectedAsset?.heightCells ?? 1)
                  const style: React.CSSProperties = {
                    left: x * CELL_SIZE,
                    top: y * CELL_SIZE,
                    width: wCells * CELL_SIZE,
                    height: hCells * CELL_SIZE,
                    zIndex: layer || 0,
                  }
                  return (
                    <div
                      key={`obj-draft-${key}`}
                      className="hall-item hall-item-decor"
                      style={style}
                    >
                      {selectedAsset?.imageUrl && (
                        <div
                          className="hall-item-sprite"
                          style={{
                            backgroundImage: `url(${selectedAsset.imageUrl})`,
                            ...(rotation % 180 === 90
                              ? {
                                  width: `${((selectedAsset?.widthCells ?? 1) / (selectedAsset?.heightCells ?? 1)) * 100}%`,
                                  height: `${((selectedAsset?.heightCells ?? 1) / (selectedAsset?.widthCells ?? 1)) * 100}%`,
                                  left: '50%',
                                  top: '50%',
                                  transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                                }
                              : {
                                  inset: 0,
                                  transform: rotation ? `rotate(${rotation}deg)` : undefined,
                                }),
                          }}
                        />
                      )}
                    </div>
                  )
                })
              })()}

            {/* preview eraser position – квадрат с размером (2*r+1) x (2*r+1) */}
            {mode === 'OBJECTS' && toolMode === 'ERASE' && eraserPos && (() => {
              const r = Math.max(0, eraseRadius)
              const size = (2 * r + 1) * CELL_SIZE
              const offset = r * CELL_SIZE
              return (
                <div
                  className="hall-eraser"
                  style={{
                    left: eraserPos.x * CELL_SIZE - offset,
                    top: eraserPos.y * CELL_SIZE - offset,
                    width: size,
                    height: size,
                  }}
                />
              )
            })()}

            {/* items - virtualized: only render visible items */}
            {visibleItems.map(renderItem)}
          </div>
        </div>

        {/* Bottom sprite palette - сохраняется при загрузке */}
        {mode === 'OBJECTS' && (
          <div className="hall-sprite-palette">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="hall-sprite-palette-title">Спрайты (клик для выбора)</div>
              <button className="btn-primary btn-small" onClick={() => {
                setAssetForm({ name: '', type: 'DECOR', widthCells: '1', heightCells: '1', defaultCapacity: '2' })
                setAssetImageFile(null)
                setShowAssetModal(true)
              }}>
                + Загрузить спрайт
              </button>
            </div>
            <div className="hall-sprite-palette-grid">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className={`hall-sprite-item ${selectedAssetId === asset.id ? 'selected' : ''}`}
                  onClick={() => setSelectedAssetId(asset.id)}
                  title={`${asset.type} — ${asset.name} (${asset.widthCells}×${asset.heightCells})${asset.type === 'TABLE' && asset.defaultCapacity ? `, вместимость: ${asset.defaultCapacity}` : ''}`}
                >
                  {asset.imageUrl ? (
                    <img src={asset.imageUrl} alt={asset.name} className="hall-sprite-preview" />
                  ) : (
                    <div className="hall-sprite-fallback">
                      <div className="hall-sprite-fallback-text">{asset.name}</div>
                      <div className="hall-sprite-fallback-size">{asset.widthCells}×{asset.heightCells}</div>
                    </div>
                  )}
                  <div className="hall-sprite-label">{asset.name}</div>
                  {asset.type === 'TABLE' && asset.defaultCapacity && (
                    <div style={{ fontSize: 9, color: '#666', marginTop: -4 }}>👥 {asset.defaultCapacity}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={showZoneModal} onClose={handleCancelZone} title={editingZoneId ? "Редактировать зону" : "Создать зону"}>
        <FormInput label="Название" value={zoneForm.name} onChange={(v) => setZoneForm((p) => ({ ...p, name: v }))} />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#555' }}>Цвет:</label>
          <input type="color" value={zoneForm.color} onChange={(e) => setZoneForm((p) => ({ ...p, color: e.target.value }))} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <input
              type="checkbox"
              checked={zoneForm.activeForWaiter}
              onChange={(e) => setZoneForm((p) => ({ ...p, activeForWaiter: e.target.checked }))}
            />
            Активна для официанта
          </label>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={handleCancelZone}>
            Отмена
          </button>
          <button className="btn-primary" onClick={handleSaveZone}>
            {editingZoneId ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </Modal>

      {/* Модальное окно редактирования зоны */}
      <Modal isOpen={editingZone !== null} onClose={() => setEditingZone(null)} title="Редактировать зону">
        <FormInput 
          label="Название" 
          value={editZoneForm.name} 
          onChange={(v) => setEditZoneForm((p) => ({ ...p, name: v }))} 
        />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#555' }}>Цвет заливки:</label>
          <input 
            type="color" 
            value={editZoneForm.color} 
            onChange={(e) => setEditZoneForm((p) => ({ ...p, color: e.target.value }))} 
            style={{ width: 50, height: 30, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 12, color: '#888' }}>{editZoneForm.color}</span>
        </div>
        
        {/* Кнопка редактирования границ */}
        <button
          className="btn-secondary"
          style={{ width: '100%', marginBottom: 12 }}
          onClick={() => {
            if (!editingZone) return
            
            // Переключаемся в режим ZONES
            setMode('ZONES')
            
            // Загружаем вершины полигона, если они есть
            if (editingZone.vertices && editingZone.vertices.length >= 3) {
              console.log('[HallEditor] Loading zone vertices:', editingZone.vertices)
              setPolygonVertices(editingZone.vertices)
              setIsPolygonClosed(true)
              setIsDrawingPolygon(true)
              // Пересчитываем клетки из вершин
              if (map) {
                const cells = getCellsInPolygon(editingZone.vertices, map.gridWidth, map.gridHeight)
                setPaintedZoneCells(cells)
                setPolygonPreviewCells(cells)
              }
            } else if (editingZone.cells && editingZone.cells.length > 0) {
              // Fallback: загружаем только клетки (без вершин)
              // Попробуем восстановить вершины из границ зоны (прямоугольник)
              console.log('[HallEditor] Zone has no vertices, creating rectangle from bounding box')
              const cellsSet = new Set<string>()
              editingZone.cells.forEach((c) => cellsSet.add(`${c.x},${c.y}`))
              
              // Вычисляем bounding box из клеток
              let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
              editingZone.cells.forEach((c) => {
                minX = Math.min(minX, c.x)
                maxX = Math.max(maxX, c.x)
                minY = Math.min(minY, c.y)
                maxY = Math.max(maxY, c.y)
              })
              
              // Создаём прямоугольный полигон из bounding box
              const rectangleVertices = [
                { x: minX, y: minY },
                { x: maxX + 1, y: minY },
                { x: maxX + 1, y: maxY + 1 },
                { x: minX, y: maxY + 1 },
              ]
              
              setPolygonVertices(rectangleVertices)
              setPaintedZoneCells(cellsSet)
              setPolygonPreviewCells(cellsSet)
              setIsPolygonClosed(true)
              setIsDrawingPolygon(true)
            } else {
              // Если клеток нет, создаём пустой полигон для рисования
              startPolygonDrawing()
            }
            
            setEditingZoneId(editingZone.id)
            setZoneForm({
              name: editingZone.name,
              color: editingZone.color || '#dc2626',
              activeForWaiter: editingZone.activeForWaiter ?? true,
            })
            setEditingZone(null)
          }}
        >
          ✏️ Редактировать границы
        </button>
        
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setEditingZone(null)}>
            Отмена
          </button>
          <button 
            className="btn-primary" 
            onClick={async () => {
              if (!editingZone) return
              try {
                await hallService.updateZone(editingZone.id, {
                  name: editZoneForm.name,
                  color: editZoneForm.color,
                })
                setEditingZone(null)
                await load()
              } catch (e: any) {
                alert(e.response?.data?.message || 'Не удалось обновить зону')
              }
            }}
          >
            Сохранить
          </button>
        </div>
      </Modal>

      <Modal isOpen={showTableModal} onClose={() => setShowTableModal(false)} title="Создать стол">
        <FormInput label="Номер/лейбл" value={tableForm.label} onChange={(v) => setTableForm((p) => ({ ...p, label: v }))} required />
        <FormInput
          label="Вместимость"
          type="number"
          value={tableForm.capacity}
          onChange={(v) => setTableForm((p) => ({ ...p, capacity: v }))}
          required
        />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setShowTableModal(false)}>
            Отмена
          </button>
          <button className="btn-primary" onClick={handleCreateTableAndPlace}>
            Создать и разместить
          </button>
        </div>
      </Modal>

      <Modal isOpen={showAssetModal} onClose={() => setShowAssetModal(false)} title="Загрузить спрайт">
        <FormInput
          label="Название"
          value={assetForm.name}
          onChange={(v) => setAssetForm((p) => ({ ...p, name: v }))}
          required
        />
        <div className="hall-row" style={{ marginBottom: 12 }}>
          <label>Тип:</label>
          <select
            value={assetForm.type}
            onChange={(e) => setAssetForm((p) => ({ ...p, type: e.target.value as 'TABLE' | 'DECOR' }))}
          >
            <option value="DECOR">Декор</option>
            <option value="TABLE">Стол</option>
          </select>
        </div>
        <div className="hall-row" style={{ marginBottom: 12 }}>
          <label>Ширина (клетки):</label>
          <input
            type="number"
            min="1"
            value={assetForm.widthCells}
            onChange={(e) => setAssetForm((p) => ({ ...p, widthCells: e.target.value }))}
            style={{ width: 100 }}
          />
        </div>
        <div className="hall-row" style={{ marginBottom: 12 }}>
          <label>Высота (клетки):</label>
          <input
            type="number"
            min="1"
            value={assetForm.heightCells}
            onChange={(e) => setAssetForm((p) => ({ ...p, heightCells: e.target.value }))}
            style={{ width: 100 }}
          />
        </div>
        {assetForm.type === 'TABLE' && (
          <div className="hall-row" style={{ marginBottom: 12 }}>
            <label>Вместимость (по умолчанию):</label>
            <input
              type="number"
              min="1"
              value={assetForm.defaultCapacity}
              onChange={(e) => setAssetForm((p) => ({ ...p, defaultCapacity: e.target.value }))}
              style={{ width: 100 }}
            />
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#555' }}>Изображение (PNG / JPEG):</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            onChange={(e) => setAssetImageFile(e.target.files?.[0] || null)}
            style={{ width: '100%' }}
          />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => setShowAssetModal(false)}>
            Отмена
          </button>
          <button
            className="btn-primary"
            onClick={async () => {
              if (!assetForm.name) {
                alert('Укажите название спрайта')
                return
              }
              try {
                const created = await hallService.createAsset({
                  name: assetForm.name,
                  type: assetForm.type,
                  widthCells: parseInt(assetForm.widthCells) || 1,
                  heightCells: parseInt(assetForm.heightCells) || 1,
                  defaultCapacity: assetForm.type === 'TABLE' ? (parseInt(assetForm.defaultCapacity) || 2) : undefined,
                  imageUrl: undefined,
                })
                if (assetImageFile) {
                  await hallService.uploadAssetImage(created.id, assetImageFile)
                }
                setShowAssetModal(false)
                setAssetForm({ name: '', type: 'DECOR', widthCells: '1', heightCells: '1', defaultCapacity: '2' })
                setAssetImageFile(null)
                await load()
              } catch (e: any) {
                alert(e.response?.data?.message || 'Не удалось создать спрайт')
              }
            }}
          >
            Создать
          </button>
        </div>
      </Modal>
    </div>
  )
}


