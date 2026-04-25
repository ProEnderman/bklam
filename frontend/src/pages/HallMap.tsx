import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { hallService, restaurantService } from '../api/services'
import type { HallAsset, HallPlacedItem, HallView, HallTable, User, Order, Dish } from '../api/types'
import './HallMap.css'

const CELL_SIZE = 16

export default function HallMapPage() {
  const { user } = useOutletContext<{ user?: User }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<HallView | null>(null)
  const [selectedZoneId, setSelectedZoneId] = useState<number | 'ALL'>('ALL')
  const [hoveredZoneId, setHoveredZoneId] = useState<number | null>(null)
  
  // Открытые заказы и блюда для tooltip
  const [openOrders, setOpenOrders] = useState<Order[]>([])
  const [dishes, setDishes] = useState<Dish[]>([])
  const [hoveredTableId, setHoveredTableId] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  
  // Pan & Zoom state
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const panOffsetRef = useRef({ x: 0, y: 0 })
  const [, setIsPanning] = useState(false)
  const isPanningRef = useRef(false)
  const panStartRef = useRef<{ x: number; y: number } | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const hasCenteredRef = useRef(false)
  const zoomAccumulatorRef = useRef(0)

  const load = async () => {
    setLoading(true)
    try {
      const hallData = await hallService.getView()
      setView(hallData)
    } catch (e) {
      console.error('Failed to load hall', e)
      alert('Не удалось загрузить карту зала')
    } finally {
      setLoading(false)
    }
    
    // Загружаем заказы и блюда отдельно (не блокируют карту)
    try {
      const [ordersData, dishesData] = await Promise.all([
        restaurantService.getOrders({ status: 'OPEN' }),
        restaurantService.getDishes(),
      ])
      setOpenOrders(Array.isArray(ordersData) ? ordersData : ordersData.content)
      setDishes(Array.isArray(dishesData) ? dishesData : dishesData)
    } catch (e) {
      console.error('Failed to load orders/dishes for tooltips', e)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(async () => {
      try {
        const ordersData = await restaurantService.getOrders({ status: 'OPEN' })
        setOpenOrders(Array.isArray(ordersData) ? ordersData : ordersData.content)
      } catch (e) {
        console.error('Failed to refresh orders', e)
      }
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const map = view?.map
  const zones = (view?.zones || []).filter((z) => z.activeForWaiter)
  const tables = view?.tables || []
  const items = view?.items || [] // Отображаем все элементы, не только столы
  
  // Ассеты для отображения текстур
  const assets = useMemo(() => {
    return view?.assets || []
  }, [view?.assets])
  
  // Быстрый поиск по ID
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
  
  // Заказы по tableId (только с блюдами внутри)
  const ordersByTableId = useMemo(() => {
    const map = new Map<number, Order>()
    openOrders.forEach((o) => {
      // Только заказы с блюдами подсвечиваются
      if (o.tableId && o.items && o.items.length > 0) {
        map.set(o.tableId, o)
      }
    })
    return map
  }, [openOrders])
  
  // Блюда по id
  const dishesById = useMemo(() => {
    const map = new Map<number, Dish>()
    dishes.forEach((d) => map.set(d.id, d))
    return map
  }, [dishes])

  // Получаем выбранную зону
  const selectedZone = useMemo(() => {
    if (selectedZoneId === 'ALL') return null
    return zones.find((x) => x.id === selectedZoneId) || null
  }, [selectedZoneId, zones])

  // Set клеток выбранной зоны для быстрой проверки
  const selectedZoneCellsSet = useMemo(() => {
    if (!selectedZone || !selectedZone.cells || selectedZone.cells.length === 0) return null
    const set = new Set<string>()
    selectedZone.cells.forEach((c) => set.add(`${c.x},${c.y}`))
    return set
  }, [selectedZone])

  // Проверяет, находится ли элемент внутри выбранной зоны
  const isItemInSelectedZone = useCallback((it: HallPlacedItem) => {
    if (!selectedZone) return true // Показываем все если зона не выбрана
    
    // Проверяем все клетки элемента
    for (let dy = 0; dy < it.h; dy++) {
      for (let dx = 0; dx < it.w; dx++) {
        const cellX = it.x + dx
        const cellY = it.y + dy
        
        if (selectedZoneCellsSet) {
          if (selectedZoneCellsSet.has(`${cellX},${cellY}`)) return true
        } else {
          // Fallback на bounding box
          if (cellX >= selectedZone.x && cellX < selectedZone.x + selectedZone.w &&
              cellY >= selectedZone.y && cellY < selectedZone.y + selectedZone.h) {
            return true
          }
        }
      }
    }
    return false
  }, [selectedZone, selectedZoneCellsSet])

  const filteredItems = useMemo(() => {
    if (selectedZoneId === 'ALL') {
      return items // Показываем все элементы
    }
    
    // Фильтруем ВСЕ элементы (и столы, и декор) по зоне
    return items.filter(isItemInSelectedZone)
  }, [items, selectedZoneId, isItemInSelectedZone])

  // Центрируем карту при первой загрузке
  useEffect(() => {
    if (!map || !canvasWrapRef.current || hasCenteredRef.current) return
    
    try {
      const container = canvasWrapRef.current
      if (container.clientWidth === 0 || container.clientHeight === 0) {
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
      
      const centerX = mapWidth < containerWidth ? (containerWidth - mapWidth) / 2 : 0
      const centerY = mapHeight < containerHeight ? (containerHeight - mapHeight) / 2 : 0
      
      setPanOffset({ x: centerX, y: centerY })
      panOffsetRef.current = { x: centerX, y: centerY }
      hasCenteredRef.current = true
    } catch (e) {
      console.error('Failed to center map', e)
    }
  }, [map])
  
  // Применяем pan и zoom через requestAnimationFrame для плавности
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const updateTransform = () => {
      if (!canvas) return
      const { x, y } = panOffsetRef.current
      canvas.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${zoom})`
      rafIdRef.current = requestAnimationFrame(updateTransform)
    }
    
    rafIdRef.current = requestAnimationFrame(updateTransform)
    
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
      rafIdRef.current = null
    }
  }, [zoom, panOffset])
  
  // Вычисляем bounding box выбранной зоны
  const zoneBounds = useMemo(() => {
    if (!selectedZone) return null
    
    if (selectedZone.cells && selectedZone.cells.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      selectedZone.cells.forEach((c) => {
        minX = Math.min(minX, c.x)
        maxX = Math.max(maxX, c.x)
        minY = Math.min(minY, c.y)
        maxY = Math.max(maxY, c.y)
      })
      return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
    }
    
    return { x: selectedZone.x, y: selectedZone.y, w: selectedZone.w, h: selectedZone.h }
  }, [selectedZone])
  
  // Функция для ограничения panOffset границами карты/зоны
  const clampPanOffset = useCallback((pan: { x: number, y: number }): { x: number, y: number } => {
    if (!map || !canvasWrapRef.current) return pan
    
    // Используем размер зоны если она выбрана, иначе размер всей карты
    const contentWidth = zoneBounds ? zoneBounds.w * CELL_SIZE : map.gridWidth * CELL_SIZE
    const contentHeight = zoneBounds ? zoneBounds.h * CELL_SIZE : map.gridHeight * CELL_SIZE
    const viewportWidth = canvasWrapRef.current.clientWidth
    const viewportHeight = canvasWrapRef.current.clientHeight
    
    const minX = viewportWidth - contentWidth * zoom
    const minY = viewportHeight - contentHeight * zoom
    const maxX = 0
    const maxY = 0
    
    let clampedX = pan.x
    let clampedY = pan.y
    
    if (contentWidth * zoom < viewportWidth) {
      clampedX = (viewportWidth - contentWidth * zoom) / 2
    } else {
      clampedX = Math.max(minX, Math.min(maxX, pan.x))
    }
    
    if (contentHeight * zoom < viewportHeight) {
      clampedY = (viewportHeight - contentHeight * zoom) / 2
    } else {
      clampedY = Math.max(minY, Math.min(maxY, pan.y))
    }
    
    return { x: clampedX, y: clampedY }
  }, [map, zoom, zoneBounds])
  
  // Ограничиваем panOffset при изменении zoom
  useEffect(() => {
    const clamped = clampPanOffset(panOffsetRef.current)
    if (clamped.x !== panOffsetRef.current.x || clamped.y !== panOffsetRef.current.y) {
      panOffsetRef.current = clamped
      setPanOffset(clamped)
    }
  }, [zoom, clampPanOffset])
  
  // Центрируем при смене зоны
  useEffect(() => {
    if (!canvasWrapRef.current) return
    
    // Сбрасываем pan offset и центрируем
    const contentWidth = zoneBounds ? zoneBounds.w * CELL_SIZE : (map?.gridWidth || 200) * CELL_SIZE
    const contentHeight = zoneBounds ? zoneBounds.h * CELL_SIZE : (map?.gridHeight || 200) * CELL_SIZE
    const viewportWidth = canvasWrapRef.current.clientWidth
    const viewportHeight = canvasWrapRef.current.clientHeight
    
    const centerX = contentWidth < viewportWidth ? (viewportWidth - contentWidth) / 2 : 0
    const centerY = contentHeight < viewportHeight ? (viewportHeight - contentHeight) / 2 : 0
    
    panOffsetRef.current = { x: centerX, y: centerY }
    setPanOffset({ x: centerX, y: centerY })
  }, [selectedZoneId, zoneBounds, map])
  
  // Обработчик панорамирования мышью
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return // Только левая кнопка мыши
    if (e.target !== e.currentTarget && (e.target as HTMLElement).closest('.hall-item')) return // Не панорамируем при клике на элемент
    
    e.preventDefault()
    setIsPanning(true)
    isPanningRef.current = true
    panStartRef.current = {
      x: e.clientX - panOffsetRef.current.x,
      y: e.clientY - panOffsetRef.current.y,
    }
  }
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanningRef.current || !panStartRef.current) return
    
    const newPan = {
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    }
    
    const clamped = clampPanOffset(newPan)
    panOffsetRef.current = clamped
    setPanOffset(clamped)
  }
  
  const handleMouseUp = () => {
    setIsPanning(false)
    isPanningRef.current = false
    panStartRef.current = null
  }
  
  // Обработчик зума колесиком мыши
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      
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
  }, [zoom, clampPanOffset])

  const containerStyle = useMemo(() => {
    if (!map) return {}
    
    // Если выбрана зона — показываем только её область
    if (zoneBounds) {
      return {
        width: zoneBounds.w * CELL_SIZE,
        height: zoneBounds.h * CELL_SIZE,
        background: '#fff',
        overflow: 'hidden',
      } as React.CSSProperties
    }
    
    return {
      width: map.gridWidth * CELL_SIZE,
      height: map.gridHeight * CELL_SIZE,
    } as React.CSSProperties
  }, [map, zoneBounds])

  const handleTableClick = async (it: HallPlacedItem) => {
    if (!it.tableId) {
      alert('Этот объект не привязан к столу (tableId отсутствует)')
      return
    }
    
    // Ищем открытый заказ с блюдами для этого стола
    const existingOrder = ordersByTableId.get(it.tableId)
    
    if (existingOrder) {
      // Есть заказ с блюдами — переходим к редактированию
      navigate(`/orders/new?orderId=${existingOrder.id}`)
    } else {
      // Нет заказа — переходим к созданию нового с указанием стола
      navigate(`/orders/new?tableId=${it.tableId}`)
    }
  }

  const handleClearMap = async () => {
    if (!window.confirm('Очистить все объекты на карте? Это действие нельзя отменить.')) {
      return
    }
    try {
      await hallService.replaceItems([])
      await load()
      alert('Карта очищена')
    } catch (e: any) {
      console.error('Failed to clear map', e)
      alert(e.response?.data?.message || 'Не удалось очистить карту')
    }
  }

  const renderItem = (it: HallPlacedItem) => {
    const table = it.tableId ? tablesById.get(it.tableId) : null
    const asset = it.assetId ? assetsById.get(it.assetId) : null
    const rotation = it.rotation || 0
    
    // Если выбрана зона — смещаем позицию относительно начала зоны
    const offsetX = zoneBounds ? zoneBounds.x : 0
    const offsetY = zoneBounds ? zoneBounds.y : 0
    
    // Контейнер с размерами item.w x item.h (hitbox для collision detection)
    const style: React.CSSProperties = {
      position: 'absolute',
      left: (it.x - offsetX) * CELL_SIZE,
      top: (it.y - offsetY) * CELL_SIZE,
      width: it.w * CELL_SIZE,
      height: it.h * CELL_SIZE,
      zIndex: it.layer || 0,
      transform: 'translate3d(0, 0, 0)',
    }

    const baseClass = it.type === 'TABLE' ? 'hall-item hall-item-table' : 'hall-item hall-item-decor'
    const isClickable = it.type === 'TABLE' && it.tableId
    
    // Для 90/270 градусов: изображение должно быть h×w перед поворотом,
    // чтобы после поворота стать w×h и идеально заполнить контейнер
    const needsSwap = rotation === 90 || rotation === 270
    const imgWidth = needsSwap ? it.h * CELL_SIZE : it.w * CELL_SIZE
    const imgHeight = needsSwap ? it.w * CELL_SIZE : it.h * CELL_SIZE
    
    const content = asset?.imageUrl ? (
      <img
        src={asset.imageUrl}
        alt=""
        className="hall-item-img"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: imgWidth,
          height: imgHeight,
          objectFit: 'fill' as const, // Заполняет всю область (уже правильные пропорции)
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        }}
        draggable={false}
      />
    ) : it.type === 'TABLE' ? (
      <div className="hall-item-fallback">
        <div className="hall-item-title">{table ? table.label : 'Стол'}</div>
      </div>
    ) : null

    // Проверяем есть ли открытый заказ на этом столе
    const hasOrder = it.tableId ? ordersByTableId.has(it.tableId) : false

    if (isClickable) {
      return (
        <button
          key={it.id}
          className={`${baseClass} hall-table-btn ${hasOrder ? 'hall-table-has-order' : ''}`}
          style={style}
          onClick={() => handleTableClick(it)}
          onMouseEnter={(e) => {
            if (hasOrder && it.tableId) {
              setHoveredTableId(it.tableId)
              const rect = e.currentTarget.getBoundingClientRect()
              setTooltipPos({ x: rect.right + 10, y: rect.top })
            }
          }}
          onMouseLeave={() => {
            setHoveredTableId(null)
            setTooltipPos(null)
          }}
          title={table ? `Стол ${table.label} (мест: ${table.capacity})` : 'Стол'}
        >
          {content}
          {hasOrder && <div className="hall-table-order-indicator" />}
        </button>
      )
    }

    return (
      <div
        key={it.id}
        className={baseClass}
        style={style}
        title={table ? `Стол ${table.label}` : asset?.name}
      >
        {content}
      </div>
    )
  }

  if (loading || !map) {
    return <div style={{ padding: 20 }}>Загрузка карты…</div>
  }

  const isAdmin = user?.role === 'ADMIN'

  return (
    <div className="hall-page">
      <div className="hall-topbar">
        <div className="hall-topbar-left">
          <h1 style={{ margin: 0 }}>Карта зала</h1>
          <div className="hall-hint">Клик по столу откроет или создаст заказ для этого стола.</div>
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
          {isAdmin && (
            <>
              <button className="btn-danger" onClick={handleClearMap}>
                Очистить карту
              </button>
              <button className="btn-primary" onClick={() => navigate('/hall/editor')}>
                Редактор
              </button>
            </>
          )}
        </div>
      </div>

      {/* Zoom controls - зафиксированы относительно viewport, не двигаются с картой */}
      <div style={{ position: 'fixed', top: 80, right: 20, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, background: 'white', padding: '8px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', pointerEvents: 'auto' }}>
        <button
          className="btn-small"
          onClick={() => {
            const step = 0.1
            const currentStep = Math.round(zoom / step)
            const newStep = Math.min(40, currentStep + 1)
            const newZoom = newStep * step
            setZoom(newZoom)
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
        <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 'bold', minWidth: '40px' }}>
          {Math.round(zoom * 100)}%
        </div>
        <button
          className="btn-small"
          onClick={() => {
            const step = 0.1
            const currentStep = Math.round(zoom / step)
            const newStep = Math.max(1, currentStep - 1)
            const newZoom = newStep * step
            setZoom(newZoom)
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
            panOffsetRef.current = { x: 0, y: 0 }
            setTimeout(() => {
              const clamped = clampPanOffset(panOffsetRef.current)
              panOffsetRef.current = clamped
              setPanOffset(clamped)
            }, 0)
          }}
          title="Сбросить"
        >
          ⟲
        </button>
      </div>
      
      <div 
        ref={canvasWrapRef}
        className="hall-canvas-wrap" 
        style={{ height: '600px', minHeight: '400px', maxHeight: 'calc(100vh - 250px)' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          ref={canvasRef}
          className="hall-canvas"
          style={containerStyle}
          onMouseMove={(e) => {
            if (isPanningRef.current) return
            // Не показываем hover других зон когда выбрана конкретная зона
            if (selectedZoneId !== 'ALL') return
            const rect = canvasWrapRef.current?.getBoundingClientRect()
            if (!rect) return
            const x = Math.floor((e.clientX - rect.left - panOffsetRef.current.x) / (CELL_SIZE * zoom))
            const y = Math.floor((e.clientY - rect.top - panOffsetRef.current.y) / (CELL_SIZE * zoom))
            const z = zones.find((zone) => {
              if (zone.cells && zone.cells.length > 0) return zone.cells.some((c) => c.x === x && c.y === y)
              return x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h
            })
            setHoveredZoneId(z?.id ?? null)
          }}
          onMouseLeave={() => {
            if (selectedZoneId === 'ALL') setHoveredZoneId(null)
            handleMouseUp()
          }}
        >
          <div
            className="hall-grid"
            style={{
              backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
            }}
          />
          
          {/* Название выбранной зоны */}
          {selectedZone && (
            <div className="hall-selected-zone-label">
              {selectedZone.name}
            </div>
          )}
          
          {/* zones overlay — показываем только если не выбрана конкретная зона */}
          {selectedZoneId === 'ALL' && zones.map((z) => (
            <div
              key={z.id}
              className={`hall-zone-rect ${hoveredZoneId === z.id ? 'hall-zone-hover' : ''}`}
              style={{
                left: z.x * CELL_SIZE,
                top: z.y * CELL_SIZE,
                width: z.w * CELL_SIZE,
                height: z.h * CELL_SIZE,
                borderColor: z.color || '#dc2626',
                backgroundColor: `${z.color || '#dc2626'}14`,
              }}
            >
              {hoveredZoneId === z.id && <span className="hall-zone-label">{z.name}</span>}
            </div>
          ))}

          {filteredItems.map(renderItem)}
        </div>
      </div>
      
      {/* Tooltip с заказом при наведении на стол */}
      {hoveredTableId && tooltipPos && ordersByTableId.get(hoveredTableId) && (
        <div 
          className="hall-order-tooltip"
          style={{
            position: 'fixed',
            left: tooltipPos.x,
            top: tooltipPos.y,
            zIndex: 9999,
          }}
        >
          <div className="hall-order-tooltip-header">
            Заказ #{ordersByTableId.get(hoveredTableId)!.id}
          </div>
          <div className="hall-order-tooltip-items">
            {ordersByTableId.get(hoveredTableId)!.items.map((item) => {
              const dish = dishesById.get(item.dishId)
              return (
                <div key={item.id} className="hall-order-tooltip-item">
                  {dish?.imageUrl ? (
                    <img src={dish.imageUrl} alt={item.dishName} className="hall-order-tooltip-img" />
                  ) : (
                    <div className="hall-order-tooltip-img-placeholder">🍽️</div>
                  )}
                  <div className="hall-order-tooltip-info">
                    <div className="hall-order-tooltip-name">{item.dishName}</div>
                    <div className="hall-order-tooltip-qty">×{item.qty}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="hall-order-tooltip-total">
            Итого: {ordersByTableId.get(hoveredTableId)!.totalAmount.toLocaleString()} ₽
          </div>
        </div>
      )}
    </div>
  )
}



