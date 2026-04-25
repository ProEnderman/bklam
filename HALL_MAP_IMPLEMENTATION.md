# Полное описание реализации карты зала (Hall Map)

## 1. Backend архитектура

### 1.1. База данных (PostgreSQL)

**Миграция:** `V35__Create_hall_map_and_tables.sql`

#### Таблицы:

1. **`hall_maps`** - основная карта зала
   - `id` (BIGSERIAL PRIMARY KEY)
   - `restaurant_id` (FK → restaurants)
   - `name` (VARCHAR, default: "Main map")
   - `grid_width` (INT) - ширина сетки в клетках
   - `grid_height` (INT) - высота сетки в клетках
   - `created_at`, `updated_at` (TIMESTAMP)
   - **Индекс:** `idx_hall_maps_restaurant` на `restaurant_id`

2. **`hall_assets`** - спрайты/изображения объектов
   - `id` (BIGSERIAL PRIMARY KEY)
   - `restaurant_id` (FK → restaurants)
   - `name` (VARCHAR, UNIQUE per restaurant)
   - `type` (VARCHAR: 'TABLE' | 'DECOR')
   - `image_url` (VARCHAR) - путь к PNG/JPEG файлу
   - `width_cells` (INT, default: 1) - ширина в клетках
   - `height_cells` (INT, default: 1) - высота в клетках
   - `default_capacity` (INT, nullable) - для столов
   - **Индексы:** `idx_hall_assets_restaurant`, `uq_hall_assets_restaurant_name`

3. **`hall_tables`** - справочник столов
   - `id` (BIGSERIAL PRIMARY KEY)
   - `restaurant_id` (FK → restaurants)
   - `label` (VARCHAR, UNIQUE per restaurant) - "Столик 1"
   - `capacity` (INT, default: 2)
   - `is_active` (BOOLEAN, default: TRUE)
   - **Индексы:** `idx_hall_tables_restaurant`, `uq_hall_tables_restaurant_label`

4. **`hall_zones`** - зоны зала (залы/помещения)
   - `id` (BIGSERIAL PRIMARY KEY)
   - `hall_map_id` (FK → hall_maps)
   - `name` (VARCHAR)
   - `x, y, w, h` (INT) - bounding box в клетках
   - `cells` (JSONB, nullable) - массив `{x, y}` для не-прямоугольных зон
   - `color` (VARCHAR, default: '#4f46e5')
   - `active_for_waiter` (BOOLEAN, default: TRUE)
   - **Индекс:** `idx_hall_zones_map` на `hall_map_id`

5. **`hall_placed_items`** - размещённые объекты на карте
   - `id` (BIGSERIAL PRIMARY KEY)
   - `hall_map_id` (FK → hall_maps)
   - `asset_id` (FK → hall_assets, nullable)
   - `type` (VARCHAR: 'TABLE' | 'DECOR')
   - `x, y, w, h` (INT) - позиция и размер в клетках
   - `rotation` (INT, default: 0) - 0/90/180/270 градусов
   - `layer` (INT, default: 0) - z-index для наложения
   - `table_id` (FK → hall_tables, nullable) - связь со столом
   - `locked` (BOOLEAN, default: FALSE)
   - **Индексы:** `idx_hall_items_map`, `idx_hall_items_table`

6. **`orders.table_id`** - связь заказа со столом (добавлено в миграции)

### 1.2. JPA Entity модели

**Файлы:**
- `src/main/java/com/restaurant/model/HallMap.java`
- `src/main/java/com/restaurant/model/HallAsset.java`
- `src/main/java/com/restaurant/model/HallTable.java`
- `src/main/java/com/restaurant/model/HallZone.java`
- `src/main/java/com/restaurant/model/HallPlacedItem.java`

**Особенности:**
- Все связи `@ManyToOne(fetch = FetchType.LAZY)` для оптимизации
- `HallZone.cells` хранится как JSONB (PostgreSQL), парсится через `ObjectMapper`
- `@PrePersist` / `@PreUpdate` для автоматического `updated_at`

### 1.3. Репозитории (Spring Data JPA)

**Файлы:**
- `HallMapRepository.java`
- `HallZoneRepository.java`
- `HallAssetRepository.java`
- `HallTableRepository.java`
- `HallPlacedItemRepository.java`

**Важно:** Все методы используют явные `@Query` с JPQL, т.к. Spring Data не может автоматически создать запросы для `findByHallMapId` (нужен путь `hallMap.id`).

**Ключевые методы:**
```java
// HallPlacedItemRepository
@Query("SELECT i FROM HallPlacedItem i LEFT JOIN FETCH i.asset LEFT JOIN FETCH i.table WHERE i.hallMap.id = :hallMapId ORDER BY i.layer ASC, i.id ASC")
List<HallPlacedItem> findViewByHallMapId(@Param("hallMapId") Long hallMapId);

@Modifying
@Query("DELETE FROM HallPlacedItem i WHERE i.hallMap.id = :hallMapId")
void deleteByHallMapId(@Param("hallMapId") Long hallMapId);
```

### 1.4. Сервис (`HallService.java`)

**Основные методы:**

1. **`getOrCreateMap(Integer defaultW, Integer defaultH)`**
   - Создаёт карту при первом обращении (80×50 по умолчанию)
   - Использует `TransactionTemplate` с `PROPAGATION_REQUIRES_NEW` для обхода read-only транзакций
   - Double-check locking для предотвращения дубликатов

2. **`getHallView()`** - `@Transactional(readOnly = true)`
   - Загружает все данные одним запросом:
     - `HallMap`
     - `List<HallZone>` (с парсингом JSONB `cells`)
     - `List<HallAsset>`
     - `List<HallTable>`
     - `List<HallPlacedItem>` (с `LEFT JOIN FETCH` для asset/table)
   - Возвращает `HallViewDto` (DTO со всеми данными)

3. **`replaceItems(List<HallPlacedItemDto> items)`** - `@Transactional`
   - **КРИТИЧНО:** Полностью удаляет все items и вставляет новые
   - Использует `deleteByHallMapId()` (один DELETE запрос)
   - Затем цикл `save()` для каждого нового item
   - **Проблема производительности:** При большом количестве items (1000+) это очень медленно

4. **`createZone()` / `updateZone()`**
   - Вычисляет bounding box из массива `cells`
   - Сохраняет `cells` как JSON строку

5. **`uploadAssetImage()`**
   - Сохраняет PNG/JPEG в `uploads/hall-assets/`
   - Генерирует уникальное имя через UUID

### 1.5. Контроллер (`HallController.java`)

**Endpoints:**
- `GET /api/hall/view` → `getHallView()` - загрузка всей карты
- `PUT /api/hall/map` → `updateMap()` - обновление размера/названия
- `POST /api/hall/zones` → `createZone()`
- `PUT /api/hall/zones/{id}` → `updateZone()`
- `DELETE /api/hall/zones/{id}` → `deleteZone()`
- `GET /api/hall/items` → `getItems()`
- `PUT /api/hall/items` → `replaceItems()` - **основной метод для сохранения**
- `POST /api/hall/assets` → `uploadAsset()`
- `POST /api/hall/assets/{id}/image` → `uploadAssetImage()`
- `POST /api/hall/tables` → `createTable()`
- `GET /api/hall/tables` → `getTables()`

## 2. Frontend архитектура

### 2.1. Компонент `HallEditor.tsx`

**Размер:** ~1550 строк кода

#### 2.1.1. State Management

**Основной state:**
```typescript
const [view, setView] = useState<HallView | null>(null) // Все данные карты
const [mode, setMode] = useState<Mode>('OBJECTS' | 'ZONES' | 'WAITER_VIEW')
const [toolMode, setToolMode] = useState<ToolMode>('DRAW' | 'ERASE' | 'MOVE')
```

**Pan & Zoom:**
```typescript
const [zoom, setZoom] = useState(1) // 0.25 - 4.0
const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
const [isPanning, setIsPanning] = useState(false)
const [isSpacePressed, setIsSpacePressed] = useState(false)
```

**Рисование:**
```typescript
const [isPaintingObjects, setIsPaintingObjects] = useState(false)
const [paintedObjectCells, setPaintedObjectCells] = useState<Set<string>>(new Set())
const lastPaintCoordRef = useRef<{ x: number; y: number } | null>(null)
```

**История (undo):**
```typescript
const [history, setHistory] = useState<HallPlacedItem[][]>([])
```

#### 2.1.2. Вычисляемые значения (useMemo)

```typescript
// Объединение builtin assets + загруженные
const assets = useMemo(() => {
  const apiAssets = view?.assets || []
  return [...defaultBuiltinAssets, ...apiAssets] as HallAsset[]
}, [view?.assets])

// Фильтрация items по выбранной зоне
const filteredItems = useMemo(() => {
  if (selectedZoneId === 'ALL') return items
  const z = zones.find((x) => x.id === selectedZoneId)
  // ... фильтрация по cells или bounding box
}, [items, selectedZoneId, zones])

// Стиль контейнера с transform для zoom/pan
const containerStyle = useMemo(() => {
  return {
    width: map.gridWidth * CELL_SIZE,
    height: map.gridHeight * CELL_SIZE,
    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
    transformOrigin: '0 0',
  }
}, [map, zoom, panOffset])
```

#### 2.1.3. Обработчики событий

**`handleGridMouseDown`** - начало рисования/перетаскивания:
- Проверяет режим (OBJECTS/ZONES)
- Для ERASE: сразу удаляет item под курсором
- Для DRAW: начинает накапливать `paintedObjectCells`
- Для MOVE: начинает перетаскивание объекта

**`handleGridMouseMove`** - движение мыши:
- **Интерполяция:** При быстром движении заполняет промежуточные клетки (max 8 шагов)
- Обновляет `paintedObjectCells` (Set<string> с ключами "x,y")
- Для ERASE: сразу удаляет items через `eraseAtCell()`
- Для drag: обновляет `dragPreview`

**`handleGridMouseUp`** - завершение действия:
- Если рисовали: отправляет **один** `replaceItems()` со всеми накопленными клетками
- Если перетаскивали: отправляет `replaceItems()` с обновлённой позицией
- Если ластик: отправляет `replaceItems()` с удалёнными items

**`handleGridClick`** - клик по сетке:
- Проверяет коллизии (`rectTooCloseToAnyTable`)
- Для TABLE: открывает модалку создания стола
- Для DECOR: сразу создаёт item и отправляет `replaceItems()`

**`getGridCoords`** - преобразование координат:
```typescript
const getGridCoords = (e: React.MouseEvent, element: HTMLElement) => {
  const rect = element.getBoundingClientRect()
  const x = (e.clientX - rect.left - panOffset.x) / zoom
  const y = (e.clientY - rect.top - panOffset.y) / zoom
  return {
    x: Math.floor(x / CELL_SIZE),
    y: Math.floor(y / CELL_SIZE),
  }
}
```

#### 2.1.4. Рендеринг

**`renderItem(it: HallPlacedItem)`** - рендер одного объекта:
- Вычисляет позицию: `left: x * CELL_SIZE, top: y * CELL_SIZE`
- Размер: `width: w * CELL_SIZE, height: h * CELL_SIZE`
- Для спрайтов: использует `background-image` с `object-fit: fill`
- Поворот: применяется через CSS `transform: rotate(${rotation}deg)` к wrapper div
- Выделение: зелёная рамка для столов, жёлтая для выбранных

**Рендер всех items:**
```typescript
{filteredItems.map(renderItem)}
```

**Проблема:** При большом количестве items (1000+) React перерисовывает все элементы при каждом изменении state.

#### 2.1.5. API вызовы

**Загрузка:**
```typescript
const load = async () => {
  const data = await hallService.getView() // GET /api/hall/view
  setView(data)
}
```

**Сохранение:**
```typescript
const saved = await hallService.replaceItems(updated) // PUT /api/hall/items
setView((prev) => (prev ? { ...prev, items: saved } : prev))
```

**Проблема:** `replaceItems` вызывается **очень часто**:
- При каждом клике (для DECOR)
- При каждом mouseup (после рисования)
- При каждом перемещении объекта
- При каждом повороте
- При каждом удалении

### 2.2. CSS (`HallMap.css`)

**Ключевые стили:**
```css
.hall-canvas-wrap {
  overflow: auto; /* Скролл для больших карт */
  overscroll-behavior: contain; /* Предотвращает навигацию браузера */
}

.hall-canvas {
  position: relative;
  touch-action: none; /* Отключает стандартные жесты */
  transform: translate(...) scale(...); /* Применяется через inline style */
}

.hall-item {
  position: absolute;
  /* Размеры вычисляются: w * CELL_SIZE, h * CELL_SIZE */
}

.hall-item-img {
  width: 100%;
  height: 100%;
  object-fit: fill; /* Растягивает спрайт на весь хитбокс */
}
```

## 3. Проблемы производительности

### 3.1. Backend проблемы

1. **`replaceItems()` - полное удаление и вставка**
   - При 1000 items: DELETE всех + 1000 INSERT
   - Нет batch insert, каждый `save()` - отдельный запрос
   - Нет оптимистичной блокировки для конкурентных обновлений

2. **N+1 проблема при загрузке**
   - `findViewByHallMapId` использует `LEFT JOIN FETCH`, но при большом количестве items может быть медленно
   - Нет пагинации

3. **JSONB парсинг зон**
   - Каждый раз парсится `cells` через `ObjectMapper.readValue()`
   - Можно кэшировать в памяти

### 3.2. Frontend проблемы

1. **Частые вызовы `replaceItems()`**
   - При рисовании: каждый mouseup → API запрос
   - При быстром рисовании: может быть 10-20 запросов в секунду
   - Нет debouncing/throttling

2. **Перерисовка всех items**
   - `filteredItems.map(renderItem)` перерисовывает все элементы при любом изменении state
   - Нет виртуализации (только видимые items)
   - Нет `React.memo` для `renderItem`

3. **Большой JSON ответ**
   - `getHallView()` возвращает все items сразу
   - При 1000 items: ~500KB JSON
   - Нет lazy loading

4. **Интерполяция при рисовании**
   - При быстром движении мыши создаётся много промежуточных клеток
   - `paintedObjectCells` может содержать тысячи ключей
   - Set операций (add/delete) на больших Set'ах медленные

5. **Pan/Zoom перерисовки**
   - `containerStyle` пересчитывается при каждом изменении `panOffset` или `zoom`
   - Это вызывает полную перерисовку всего canvas

6. **Коллизии**
   - `isCellTooCloseToAnyTable` и `rectTooCloseToAnyTable` проверяют все items
   - O(n) для каждого клика/движения

## 4. Потенциальные оптимизации

### 4.1. Backend оптимизации

1. **Batch insert для `replaceItems()`**
   ```java
   // Вместо цикла save():
   hallPlacedItemRepository.saveAll(items) // Один запрос
   ```

2. **Differential updates вместо полной замены**
   - Отслеживать изменения на frontend
   - Отправлять только добавленные/удалённые/изменённые items
   - Backend применяет патч

3. **Кэширование**
   - Redis кэш для `getHallView()` (TTL 1-5 минут)
   - Инвалидация при `replaceItems()`

4. **Пагинация/ленивая загрузка**
   - Загружать items по частям (viewport-based)
   - Или загружать только видимые items (с учётом zoom/pan)

5. **Оптимистичная блокировка**
   - Добавить `@Version` в `HallPlacedItem`
   - Обрабатывать `OptimisticLockingFailureException`

### 4.2. Frontend оптимизации

1. **Debouncing для `replaceItems()`**
   ```typescript
   const debouncedReplaceItems = useMemo(
     () => debounce((items: HallPlacedItem[]) => {
       hallService.replaceItems(items).then(setView)
     }, 500),
     []
   )
   ```

2. **Виртуализация рендеринга**
   - Использовать `react-window` или `react-virtualized`
   - Рендерить только items в viewport (с учётом zoom/pan)

3. **React.memo для items**
   ```typescript
   const ItemComponent = React.memo(({ item }) => {
     // renderItem logic
   }, (prev, next) => {
     return prev.item.id === next.item.id &&
            prev.item.x === next.item.x &&
            prev.item.y === next.item.y &&
            prev.item.rotation === next.item.rotation
   })
   ```

4. **Web Workers для тяжёлых вычислений**
   - Интерполяция при рисовании
   - Проверка коллизий
   - Фильтрация items

5. **Canvas вместо DOM**
   - Использовать `<canvas>` для рендеринга items
   - Перерисовка только при изменении, не при каждом state update

6. **Оптимизация Set операций**
   - Использовать `Map` вместо `Set<string>` для painted cells
   - Или использовать битовую карту для больших карт

7. **Локальный state для рисования**
   - Не отправлять `replaceItems()` на каждый mouseup
   - Накопить изменения и отправить батчем
   - Или использовать WebSocket для real-time синхронизации

8. **CSS transforms вместо перерисовки**
   - Использовать `will-change: transform` для items
   - GPU acceleration

9. **Разделение state**
   - Разделить "редактируемое" состояние (локальное) и "сохранённое" (с сервера)
   - Отправлять на сервер только финальное состояние

10. **Lazy loading изображений**
    - Загружать спрайты только когда они видны
    - Использовать `IntersectionObserver`

## 5. Текущие ограничения

- **Размер карты:** 300×300 клеток (4800×4800 пикселей при CELL_SIZE=16)
- **Максимальное количество items:** Нет ограничения, но при 1000+ начинаются проблемы
- **Zoom:** 0.25x - 4.0x
- **Поддержка браузеров:** Все современные (Chrome, Firefox, Safari, Edge)

## 6. Рекомендации для оптимизации

**Приоритет 1 (критично):**
1. Debouncing для `replaceItems()`
2. Batch insert на backend
3. Виртуализация рендеринга

**Приоритет 2 (важно):**
4. React.memo для items
5. Differential updates вместо полной замены
6. Кэширование на backend

**Приоритет 3 (желательно):**
7. Canvas вместо DOM
8. Web Workers для вычислений
9. WebSocket для real-time синхронизации

