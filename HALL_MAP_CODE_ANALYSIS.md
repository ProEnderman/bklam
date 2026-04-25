# Полный анализ кодовой реализации Hall Map

## Оглавление
1. [Архитектура базы данных](#1-архитектура-базы-данных)
2. [Backend реализация](#2-backend-реализация)
3. [Frontend реализация](#3-frontend-реализация)
4. [Механизмы синхронизации и оптимизации](#4-механизмы-синхронизации-и-оптимизации)
5. [Детали реализации компонентов](#5-детали-реализации-компонентов)

---

## 1. Архитектура базы данных

### 1.1. Структура таблиц

#### Таблица `hall_maps` (основная карта зала)
**Файл:** `V35__Create_hall_map_and_tables.sql`

```sql
CREATE TABLE hall_maps (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL DEFAULT 'Main map',
    grid_width INT NOT NULL,
    grid_height INT NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,  -- Добавлено в V37
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

**Особенности:**
- Одна карта на ресторан (но структура поддерживает несколько)
- Размер сетки задаётся в клетках (`grid_width` × `grid_height`)
- Версионирование через поле `version` для оптимистичной блокировки
- Индекс на `restaurant_id` для быстрого поиска

**JPA Entity:** `HallMap.java`
- `@PrePersist` и `@PreUpdate` автоматически обновляют `created_at`, `updated_at` и инкрементируют `version`
- Метод `getRestaurantId()` для безопасного доступа к ID ресторана через lazy-связь

#### Таблица `hall_assets` (спрайты/изображения объектов)
```sql
CREATE TABLE hall_assets (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL,  -- 'TABLE' | 'DECOR'
    image_url VARCHAR(500),
    width_cells INT NOT NULL DEFAULT 1,
    height_cells INT NOT NULL DEFAULT 1,
    default_capacity INT,  -- Для столов
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

**Особенности:**
- Уникальный индекс `uq_hall_assets_restaurant_name` на `(restaurant_id, name)`
- Размеры задаются в клетках сетки
- `default_capacity` используется при создании столов из этого ассета

**JPA Entity:** `HallAsset.java`
- Enum `AssetType` для типизации (`TABLE`, `DECOR`)
- Lazy-связь с `Restaurant`

#### Таблица `hall_tables` (справочник столов)
```sql
CREATE TABLE hall_tables (
    id BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL,  -- "Столик 1"
    capacity INT NOT NULL DEFAULT 2,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

**Особенности:**
- Уникальный индекс `uq_hall_tables_restaurant_label` на `(restaurant_id, label)`
- Связь с заказами через `orders.table_id`

**JPA Entity:** `HallTable.java`
- Простая модель без сложной логики

#### Таблица `hall_zones` (зоны зала)
```sql
CREATE TABLE hall_zones (
    id BIGSERIAL PRIMARY KEY,
    hall_map_id BIGINT NOT NULL REFERENCES hall_maps(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    x INT NOT NULL,
    y INT NOT NULL,
    w INT NOT NULL,
    h INT NOT NULL,
    cells JSONB,  -- Добавлено в V36 для не-прямоугольных зон
    color VARCHAR(20) NOT NULL DEFAULT '#4f46e5',
    active_for_waiter BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

**Особенности:**
- Прямоугольные зоны: `x, y, w, h` определяют bounding box
- Не-прямоугольные зоны: `cells` (JSONB) содержит массив `{x, y}` клеток
- `cells` и `x/y/w/h` могут использоваться вместе: `cells` для точной формы, `x/y/w/h` для быстрой проверки bounding box

**JPA Entity:** `HallZone.java`
- Поле `cells` хранится как `String` (JSON), парсится через `ObjectMapper` в сервисе
- Метод `getHallMapId()` для безопасного доступа

#### Таблица `hall_placed_items` (размещённые объекты)
```sql
CREATE TABLE hall_placed_items (
    id BIGSERIAL PRIMARY KEY,
    hall_map_id BIGINT NOT NULL REFERENCES hall_maps(id) ON DELETE CASCADE,
    asset_id BIGINT REFERENCES hall_assets(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL,  -- 'TABLE' | 'DECOR'
    x INT NOT NULL,
    y INT NOT NULL,
    w INT NOT NULL DEFAULT 1,
    h INT NOT NULL DEFAULT 1,
    rotation INT NOT NULL DEFAULT 0,  -- 0/90/180/270
    layer INT NOT NULL DEFAULT 0,  -- z-index
    table_id BIGINT REFERENCES hall_tables(id) ON DELETE SET NULL,
    locked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

**Особенности:**
- Позиция и размер в клетках сетки
- Поворот в градусах (0, 90, 180, 270)
- Слой (`layer`) для управления порядком отрисовки
- Связь с `HallTable` для столов
- Связь с `HallAsset` для спрайтов (опционально)

**JPA Entity:** `HallPlacedItem.java`
- Enum `ItemType` (`TABLE`, `DECOR`)
- Lazy-связи с `HallMap`, `HallAsset`, `HallTable`

---

## 2. Backend реализация

### 2.1. Репозитории (Spring Data JPA)

#### HallMapRepository
**Файл:** `HallMapRepository.java`

```java
@Query("SELECT m FROM HallMap m WHERE m.restaurant.id = :restaurantId ORDER BY m.id ASC")
Optional<HallMap> findFirstByRestaurantIdOrderByIdAsc(@Param("restaurantId") Long restaurantId);
```

**Особенность:** Используется явный `@Query`, т.к. Spring Data не может автоматически создать запрос для `findByRestaurantId` (нужен путь `restaurant.id`).

#### HallPlacedItemRepository
**Файл:** `HallPlacedItemRepository.java`

**Ключевые методы:**

1. **`findViewByHallMapId`** - загрузка с JOIN FETCH:
```java
@Query("SELECT i FROM HallPlacedItem i LEFT JOIN FETCH i.asset LEFT JOIN FETCH i.table WHERE i.hallMap.id = :hallMapId ORDER BY i.layer ASC, i.id ASC")
List<HallPlacedItem> findViewByHallMapId(@Param("hallMapId") Long hallMapId);
```
- Использует `LEFT JOIN FETCH` для загрузки связанных `asset` и `table` одним запросом
- Сортировка по `layer` (z-index) и `id` для консистентного порядка

2. **`deleteByHallMapId`** - массовое удаление:
```java
@Modifying
@Query("DELETE FROM HallPlacedItem i WHERE i.hallMap.id = :hallMapId")
void deleteByHallMapId(@Param("hallMapId") Long hallMapId);
```
- Один DELETE запрос вместо цикла удалений

3. **`deleteByIds`** и **`findByIds`** - для дифференциальных обновлений:
```java
@Modifying
@Query("DELETE FROM HallPlacedItem i WHERE i.id IN :ids")
void deleteByIds(@Param("ids") List<Long> ids);

@Query("SELECT i FROM HallPlacedItem i WHERE i.id IN :ids")
List<HallPlacedItem> findByIds(@Param("ids") List<Long> ids);
```

#### HallZoneRepository
```java
@Query("SELECT z FROM HallZone z WHERE z.hallMap.id = :hallMapId ORDER BY z.id ASC")
List<HallZone> findByHallMapIdOrderByIdAsc(@Param("hallMapId") Long hallMapId);
```

### 2.2. Сервис (HallService)

**Файл:** `HallService.java`

#### 2.2.1. Проверка прав доступа

```java
private void requireAdmin() {
    if (SecurityUtils.isHeadAdmin()) {
        throw new BusinessException("HEAD_ADMIN cannot manage hall map");
    }
    if (!SecurityUtils.isAdmin() && !(SecurityUtils.isRegularWorker() && SecurityUtils.hasPermission(UserPermission.MANAGE_HALL_MAP))) {
        throw new BusinessException("You don't have permission to manage hall map");
    }
}

private void requireWaiterView() {
    if (SecurityUtils.isHeadAdmin()) {
        throw new BusinessException("HEAD_ADMIN cannot view hall map");
    }
    if (!SecurityUtils.isAdmin() && SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(UserPermission.VIEW_HALL_MAP)) {
        throw new BusinessException("You don't have permission to view hall map");
    }
}
```

**Особенности:**
- `HEAD_ADMIN` не может работать с картой зала
- Обычные работники требуют специальных прав (`MANAGE_HALL_MAP` или `VIEW_HALL_MAP`)

#### 2.2.2. Создание карты при первом обращении

```java
public HallMap getOrCreateMap(Integer defaultW, Integer defaultH) {
    Long restaurantId = currentRestaurantIdRequired();
    return hallMapRepository.findFirstByRestaurantIdOrderByIdAsc(restaurantId)
        .orElseGet(() -> {
            // IMPORTANT: getHallView() is readOnly, but we still want "create on first open".
            // We must create the map in a NEW, writable transaction.
            TransactionTemplate tt = new TransactionTemplate(transactionManager);
            tt.setReadOnly(false);
            tt.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            return tt.execute(status -> {
                // double-check inside the write TX to avoid duplicates under concurrency
                return hallMapRepository.findFirstByRestaurantIdOrderByIdAsc(restaurantId)
                    .orElseGet(() -> {
                        HallMap map = new HallMap();
                        map.setRestaurant(restaurantRepository.findById(restaurantId)
                            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));
                        map.setName("Main map");
                        map.setGridWidth(defaultW != null ? defaultW : 80);
                        map.setGridHeight(defaultH != null ? defaultH : 50);
                        return hallMapRepository.save(map);
                    });
            });
        });
}
```

**Ключевые моменты:**
- Использует `TransactionTemplate` с `PROPAGATION_REQUIRES_NEW` для создания карты внутри read-only транзакции
- Double-check locking для предотвращения дубликатов при конкурентном доступе
- Дефолтный размер: 80×50 клеток

#### 2.2.3. Загрузка полного представления карты

```java
@Transactional(readOnly = true)
public HallDtos.HallViewDto getHallView() {
    requireWaiterView();
    HallMap map = getOrCreateMap(80, 50);
    List<HallZone> zones = hallZoneRepository.findByHallMapIdOrderByIdAsc(map.getId());
    List<HallAsset> assets = hallAssetRepository.findByRestaurantIdOrderByIdAsc(map.getRestaurantId());
    List<HallTable> tables = hallTableRepository.findByRestaurantIdOrderByLabelAsc(map.getRestaurantId());
    List<HallPlacedItem> items = hallPlacedItemRepository.findViewByHallMapId(map.getId());

    return new HallDtos.HallViewDto(
        HallDtos.HallMapDto.fromEntity(map),
        zones.stream().map(this::zoneToDto).toList(),
        assets.stream().map(HallDtos.HallAssetDto::fromEntity).toList(),
        tables.stream().map(HallDtos.HallTableDto::fromEntity).toList(),
        items.stream().map(HallDtos.HallPlacedItemDto::fromEntity).toList()
    );
}
```

**Особенности:**
- Все данные загружаются одним запросом (5 SELECT запросов)
- `zoneToDto()` парсит JSON `cells` через `ObjectMapper`
- Возвращает DTO со всеми данными для frontend

#### 2.2.4. Парсинг зон с JSON cells

```java
private HallDtos.HallZoneDto zoneToDto(HallZone z) {
    try {
        if (z.getCells() == null || z.getCells().isBlank()) {
            return HallDtos.HallZoneDto.fromEntity(z);
        }
        List<HallDtos.HallCellDto> cells = objectMapper.readValue(
            z.getCells(),
            new TypeReference<List<HallDtos.HallCellDto>>() {}
        );
        return HallDtos.HallZoneDto.fromEntity(z, cells);
    } catch (Exception e) {
        log.warn("Failed to parse zone cells for zoneId={}: {}", z.getId(), e.getMessage());
        return HallDtos.HallZoneDto.fromEntity(z);
    }
}
```

**Особенности:**
- Парсинг JSON при каждом обращении (можно оптимизировать кэшированием)
- Fallback на прямоугольную зону при ошибке парсинга

#### 2.2.5. Создание зоны с вычислением bounding box

```java
@Transactional
public HallDtos.HallZoneDto createZone(HallDtos.HallZoneDto req) {
    requireAdmin();
    HallMap map = getOrCreateMap(80, 50);
    HallZone z = new HallZone();
    z.setHallMap(map);
    z.setName(req.name());
    
    // If cells provided - compute bounding box and store cells json
    if (req.cells() != null && !req.cells().isEmpty()) {
        int minX = req.cells().stream().map(HallDtos.HallCellDto::x).min(Integer::compareTo).orElse(0);
        int minY = req.cells().stream().map(HallDtos.HallCellDto::y).min(Integer::compareTo).orElse(0);
        int maxX = req.cells().stream().map(HallDtos.HallCellDto::x).max(Integer::compareTo).orElse(minX);
        int maxY = req.cells().stream().map(HallDtos.HallCellDto::y).max(Integer::compareTo).orElse(minY);
        z.setX(minX);
        z.setY(minY);
        z.setW(Math.max(1, maxX - minX + 1));
        z.setH(Math.max(1, maxY - minY + 1));
        try {
            z.setCells(objectMapper.writeValueAsString(req.cells()));
        } catch (Exception e) {
            throw new BusinessException("Invalid zone cells");
        }
    } else {
        z.setX(req.x());
        z.setY(req.y());
        z.setW(req.w());
        z.setH(req.h());
        z.setCells(null);
    }
    z.setColor(req.color() != null ? req.color() : "#4f46e5");
    z.setActiveForWaiter(req.activeForWaiter() != null ? req.activeForWaiter() : true);
    return zoneToDto(hallZoneRepository.save(z));
}
```

**Особенности:**
- Автоматически вычисляет bounding box из массива `cells`
- Сохраняет `cells` как JSON строку
- Поддерживает как прямоугольные, так и не-прямоугольные зоны

#### 2.2.6. Полная замена items (legacy метод)

```java
@Transactional
public List<HallDtos.HallPlacedItemDto> replaceItems(List<HallDtos.HallPlacedItemDto> items) {
    requireAdmin();
    HallMap map = getOrCreateMap(80, 50);
    // удаляем старые и вставляем новые (MVP)
    hallPlacedItemRepository.deleteByHallMapId(map.getId());

    for (HallDtos.HallPlacedItemDto dto : items) {
        HallPlacedItem i = new HallPlacedItem();
        i.setHallMap(map);
        i.setType(dto.type());
        i.setX(dto.x());
        i.setY(dto.y());
        i.setW(dto.w() != null ? dto.w() : 1);
        i.setH(dto.h() != null ? dto.h() : 1);
        i.setRotation(dto.rotation() != null ? dto.rotation() : 0);
        i.setLayer(dto.layer() != null ? dto.layer() : 0);
        i.setLocked(dto.locked() != null ? dto.locked() : false);

        if (dto.assetId() != null) {
            HallAsset a = hallAssetRepository.findById(dto.assetId())
                .orElseThrow(() -> new ResourceNotFoundException("Asset not found"));
            if (!map.getRestaurantId().equals(a.getRestaurantId())) throw new BusinessException("Asset access denied");
            i.setAsset(a);
        }
        if (dto.tableId() != null) {
            HallTable t = hallTableRepository.findById(dto.tableId())
                .orElseThrow(() -> new ResourceNotFoundException("Table not found"));
            if (!map.getRestaurantId().equals(t.getRestaurantId())) throw new BusinessException("Table access denied");
            i.setTable(t);
        }
        hallPlacedItemRepository.save(i);
    }

    return hallPlacedItemRepository.findViewByHallMapId(map.getId()).stream()
        .map(HallDtos.HallPlacedItemDto::fromEntity)
        .toList();
}
```

**Проблемы производительности:**
- Удаляет ВСЕ items одним запросом (хорошо)
- Вставляет каждый item отдельным `save()` (плохо - N запросов)
- При 1000 items: 1 DELETE + 1000 INSERT = очень медленно

#### 2.2.7. Дифференциальные обновления (оптимизированный метод)

```java
@Transactional
public HallDtos.HallItemsPatchResponse patchItems(HallDtos.HallItemsPatchRequest req) {
    requireAdmin();
    HallMap map = getOrCreateMap(80, 50);

    // Проверка версии (оптимистичная блокировка)
    if (req.baseVersion() != null && !req.baseVersion().equals(map.getVersion())) {
        throw new BusinessException("Map version mismatch. Please refresh and try again.");
    }

    List<HallPlacedItem> upserted = new java.util.ArrayList<>();

    // Удаление
    if (req.removedIds() != null && !req.removedIds().isEmpty()) {
        hallPlacedItemRepository.deleteByIds(req.removedIds());
    }

    // Добавление
    if (req.added() != null && !req.added().isEmpty()) {
        // Предзагружаем все нужные assets и tables одним запросом
        List<Long> assetIds = req.added().stream()
            .map(HallDtos.HallPlacedItemDto::assetId)
            .filter(id -> id != null && id > 0)
            .distinct()
            .toList();
        List<Long> tableIds = req.added().stream()
            .map(HallDtos.HallPlacedItemDto::tableId)
            .filter(id -> id != null && id > 0)
            .distinct()
            .toList();
        
        java.util.Map<Long, HallAsset> assetsMap = new java.util.HashMap<>();
        if (!assetIds.isEmpty()) {
            List<HallAsset> assets = hallAssetRepository.findAllById(assetIds);
            assetsMap = assets.stream()
                .filter(a -> map.getRestaurantId().equals(a.getRestaurantId()))
                .collect(java.util.stream.Collectors.toMap(HallAsset::getId, a -> a));
        }
        
        java.util.Map<Long, HallTable> tablesMap = new java.util.HashMap<>();
        if (!tableIds.isEmpty()) {
            List<HallTable> tables = hallTableRepository.findAllById(tableIds);
            tablesMap = tables.stream()
                .filter(t -> map.getRestaurantId().equals(t.getRestaurantId()))
                .collect(java.util.stream.Collectors.toMap(HallTable::getId, t -> t));
        }
        
        List<HallPlacedItem> itemsToAdd = new java.util.ArrayList<>();
        for (HallDtos.HallPlacedItemDto dto : req.added()) {
            HallPlacedItem i = new HallPlacedItem();
            // ... установка полей ...
            itemsToAdd.add(i);
        }
        
        // Batch insert через saveAll
        upserted.addAll(hallPlacedItemRepository.saveAll(itemsToAdd));
    }

    // Обновление
    if (req.updated() != null && !req.updated().isEmpty()) {
        // Аналогично: предзагрузка, batch update через saveAll
        // ...
    }

    // Обновляем версию карты (автоматически через @PreUpdate)
    hallMapRepository.save(map);

    return new HallDtos.HallItemsPatchResponse(
        map.getVersion(),
        upsertedDtos,
        req.removedIds() != null ? req.removedIds() : List.of()
    );
}
```

**Преимущества:**
- Оптимистичная блокировка через `version`
- Batch операции: `saveAll()` вместо цикла `save()`
- Предзагрузка связанных сущностей одним запросом
- Дифференциальные обновления: только изменённые items

#### 2.2.8. Загрузка изображений ассетов

```java
@Transactional
public HallDtos.HallAssetDto uploadAssetImage(Long assetId, MultipartFile file) {
    requireAdmin();
    HallAsset asset = hallAssetRepository.findById(assetId)
        .orElseThrow(() -> new ResourceNotFoundException("Asset not found"));
    Long restaurantId = currentRestaurantIdRequired();
    if (!restaurantId.equals(asset.getRestaurantId())) throw new BusinessException("Access denied");

    try {
        Path uploadPath = Paths.get(uploadDir, "hall", "assets");
        Files.createDirectories(uploadPath);
        String originalFilename = file.getOriginalFilename();
        String extension = originalFilename != null && originalFilename.contains(".")
            ? originalFilename.substring(originalFilename.lastIndexOf("."))
            : ".png";
        String filename = "asset_" + assetId + "_" + UUID.randomUUID() + extension;
        Path filePath = uploadPath.resolve(filename);
        Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);

        String imageUrl = "/uploads/hall/assets/" + filename;
        asset.setImageUrl(imageUrl);
        HallAsset saved = hallAssetRepository.save(asset);
        return HallDtos.HallAssetDto.fromEntity(saved);
    } catch (IOException e) {
        log.error("Failed to upload asset image: {}", e.getMessage(), e);
        throw new BusinessException("Failed to save image: " + e.getMessage());
    }
}
```

**Особенности:**
- Сохранение в `uploads/hall/assets/`
- Уникальное имя через UUID
- Поддержка PNG/JPEG

### 2.3. Контроллер (HallController)

**Файл:** `HallController.java`

**Endpoints:**

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/hall/view` | Полное представление карты |
| PUT | `/api/hall/map` | Обновление настроек карты |
| GET | `/api/hall/zones` | Список зон |
| POST | `/api/hall/zones` | Создание зоны |
| PATCH | `/api/hall/zones/{id}` | Обновление зоны |
| DELETE | `/api/hall/zones/{id}` | Удаление зоны |
| GET | `/api/hall/items` | Список размещённых объектов |
| PUT | `/api/hall/items` | Полная замена items (legacy) |
| PATCH | `/api/hall/items` | Дифференциальное обновление |
| GET | `/api/hall/assets` | Список ассетов |
| POST | `/api/hall/assets` | Создание ассета |
| POST | `/api/hall/assets/{id}/image` | Загрузка изображения |
| GET | `/api/hall/tables` | Список столов |
| POST | `/api/hall/tables` | Создание стола |

### 2.4. DTOs (Data Transfer Objects)

**Файл:** `HallDtos.java`

**Структура DTOs:**

1. **`HallMapDto`** - карта зала
   - `id`, `name`, `gridWidth`, `gridHeight`, `version`

2. **`HallZoneDto`** - зона
   - `id`, `hallMapId`, `name`, `x`, `y`, `w`, `h`, `cells` (List<HallCellDto>), `color`, `activeForWaiter`

3. **`HallAssetDto`** - ассет
   - `id`, `name`, `type`, `imageUrl`, `widthCells`, `heightCells`, `defaultCapacity`

4. **`HallTableDto`** - стол
   - `id`, `label`, `capacity`, `isActive`

5. **`HallPlacedItemDto`** - размещённый объект
   - `id`, `hallMapId`, `assetId`, `type`, `x`, `y`, `w`, `h`, `rotation`, `layer`, `tableId`, `locked`

6. **`HallViewDto`** - полное представление
   - `map`, `zones`, `assets`, `tables`, `items`

7. **`HallItemsPatchRequest`** - запрос на дифференциальное обновление
   - `baseVersion`, `added`, `updated`, `removedIds`

8. **`HallItemsPatchResponse`** - ответ на обновление
   - `newVersion`, `upserted`, `removedIds`

---

## 3. Frontend реализация

### 3.1. Типы (TypeScript)

**Файл:** `frontend/src/api/types.ts`

```typescript
export interface HallMap {
  id: number
  name: string
  gridWidth: number
  gridHeight: number
  version: number
}

export interface HallZone {
  id: number
  hallMapId: number
  name: string
  x: number
  y: number
  w: number
  h: number
  cells?: Array<{ x: number; y: number }>  // Опционально для не-прямоугольных зон
  color: string
  activeForWaiter: boolean
}

export interface HallPlacedItem {
  id: number
  hallMapId: number
  assetId?: number
  type: 'TABLE' | 'DECOR'
  x: number
  y: number
  w: number
  h: number
  rotation: number
  layer: number
  tableId?: number
  locked: boolean
}
```

### 3.2. API сервис

**Файл:** `frontend/src/api/services.ts`

```typescript
export const hallService = {
  async getView(): Promise<HallView> {
    const response = await client.get<HallView>('/hall/view')
    return response.data
  },

  async replaceItems(items: HallPlacedItem[]): Promise<HallPlacedItem[]> {
    const response = await client.put<HallPlacedItem[]>('/hall/items', items)
    return response.data
  },

  async patchItems(patch: HallItemsPatchRequest): Promise<HallItemsPatchResponse> {
    const response = await client.patch<HallItemsPatchResponse>('/hall/items', patch)
    return response.data
  },
  // ... другие методы
}
```

### 3.3. Компонент просмотра (HallMap.tsx)

**Файл:** `frontend/src/pages/HallMap.tsx`

**Назначение:** Просмотр карты зала для официантов (read-only с возможностью клика по столам)

**Ключевые особенности:**

1. **Фильтрация по зонам:**
```typescript
const filteredItems = useMemo(() => {
  if (selectedZoneId === 'ALL') return items
  const z = zones.find((x) => x.id === selectedZoneId)
  if (!z) return items
  return items.filter((it) => {
    const cx = it.x + it.w / 2
    const cy = it.y + it.h / 2
    const ix = Math.floor(cx)
    const iy = Math.floor(cy)
    if (z.cells && z.cells.length > 0) return z.cells.some((c) => c.x === ix && c.y === iy)
    return cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h
  })
}, [items, selectedZoneId, zones])
```

2. **Клик по столу для создания/открытия заказа:**
```typescript
const handleTableClick = async (it: HallPlacedItem) => {
  if (!it.tableId) {
    alert('Этот объект не привязан к столу')
    return
  }
  try {
    const order = await restaurantService.getOrCreateOrderByTable(it.tableId)
    navigate(`/orders/new?orderId=${order.id}`)
  } catch (e: any) {
    alert(e.response?.data?.message || 'Не удалось открыть заказ по столу')
  }
}
```

3. **Рендеринг столов:**
```typescript
const renderTable = (it: HallPlacedItem) => {
  const table = it.tableId ? tables.find((t) => t.id === it.tableId) : null
  const style: React.CSSProperties = {
    left: it.x * CELL_SIZE,
    top: it.y * CELL_SIZE,
    width: it.w * CELL_SIZE,
    height: it.h * CELL_SIZE,
    transform: `rotate(${it.rotation || 0}deg)`,
    zIndex: it.layer || 0,
  }
  return (
    <button
      className="hall-item hall-item-table hall-table-btn"
      style={style}
      onClick={() => handleTableClick(it)}
      title={table ? `Стол ${table.label} (мест: ${table.capacity})` : 'Стол'}
    >
      <div className="hall-item-fallback">
        <div className="hall-item-title">{table ? table.label : 'TABLE'}</div>
      </div>
    </button>
  )
}
```

### 3.4. Редактор карты (HallEditor.tsx)

**Файл:** `frontend/src/pages/HallEditor.tsx` (~1700 строк)

**Назначение:** Полнофункциональный редактор карты зала для админов

#### 3.4.1. State Management

**Основной state:**
```typescript
const [view, setView] = useState<HallView | null>(null)  // Все данные карты
const [mode, setMode] = useState<Mode>('OBJECTS' | 'ZONES' | 'WAITER_VIEW')
const [toolMode, setToolMode] = useState<ToolMode>('DRAW' | 'ERASE' | 'MOVE')
```

**Pan & Zoom:**
```typescript
const [zoom, setZoom] = useState(1)  // 0.25 - 4.0
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

**Dirty state для дифференциальных обновлений:**
```typescript
const [dirtyAdds, setDirtyAdds] = useState<Map<number, HallPlacedItem>>(new Map())
const [dirtyUpdates, setDirtyUpdates] = useState<Map<number, Partial<HallPlacedItem>>>(new Map())
const [dirtyRemoves, setDirtyRemoves] = useState<Set<number>>(new Set())
const pendingPatchRef = useRef<NodeJS.Timeout | null>(null)
```

**История (undo):**
```typescript
const [history, setHistory] = useState<HallPlacedItem[][]>([])
```

#### 3.4.2. Merged Items (объединение persisted + editing state)

```typescript
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
  
  return Array.from(result.values())
}, [persistedItems, dirtyAdds, dirtyUpdates, dirtyRemoves])
```

**Особенности:**
- Локальные изменения не отправляются на сервер сразу
- Объединение persisted (с сервера) и dirty (локальные) состояний
- Позволяет откатывать изменения до сохранения

#### 3.4.3. Debounced Patch отправка

```typescript
const flushPatch = useCallback(async (immediate = false) => {
  if (pendingPatchRef.current) {
    clearTimeout(pendingPatchRef.current)
    pendingPatchRef.current = null
  }

  const doFlush = async () => {
    const currentAdds = dirtyAddsRef.current
    const currentUpdates = dirtyUpdatesRef.current
    const currentRemoves = dirtyRemovesRef.current
    
    if (!map || currentAdds.size === 0 && currentUpdates.size === 0 && currentRemoves.size === 0) {
      return
    }

    const patch: HallItemsPatchRequest = {
      baseVersion: map.version || null,
      added: Array.from(currentAdds.values()).map((item) => ({
        ...item,
        id: item.id < 0 ? 0 : item.id,  // Временные ID становятся 0 для backend
      })),
      updated: Array.from(currentUpdates.entries()).map(([id, update]) => {
        const existing = currentPersistedItems.find((it) => it.id === id)
        if (!existing) return null
        return { ...existing, ...update } as HallPlacedItem
      }).filter((item): item is HallPlacedItem => item !== null),
      removedIds: Array.from(currentRemoves),
    }

    try {
      const response = await hallService.patchItems(patch)
      
      // Обновляем persisted state
      setView((prev) => {
        if (!prev) return prev
        
        // Удаляем удалённые
        const remainingItems = prev.items.filter((it) => !response.removedIds.includes(it.id))
        
        // Обновляем/добавляем upserted
        const upsertedMap = new Map(response.upserted.map((it) => [it.id, it]))
        const updatedItems = remainingItems.map((it) => upsertedMap.get(it.id) || it)
        
        // Добавляем новые
        response.upserted.forEach((it) => {
          if (!updatedItems.some((existing) => existing.id === it.id)) {
            updatedItems.push(it)
          }
        })
        
        return {
          ...prev,
          map: { ...prev.map, version: response.newVersion },
          items: updatedItems,
        }
      })
      
      // Очищаем dirty state
      setDirtyAdds(new Map())
      setDirtyUpdates(new Map())
      setDirtyRemoves(new Set())
    } catch (e: any) {
      if (e.response?.status === 409 || e.response?.status === 412) {
        // Version conflict - reload
        alert('Карта была изменена другим пользователем. Перезагружаем...')
        if (loadRef.current) {
          loadRef.current()
        }
      } else {
        alert(e.response?.data?.message || 'Не удалось сохранить изменения')
      }
    }
  }

  if (immediate) {
    await doFlush()
  } else {
    pendingPatchRef.current = setTimeout(doFlush, 500)  // 500ms debounce
  }
}, [map, view])
```

**Особенности:**
- Debounce 500ms для накопления изменений
- Оптимистичная блокировка через `baseVersion`
- Обработка конфликтов версий (409/412)
- Использование refs для актуальных значений в замыканиях

#### 3.4.4. Helper функции для работы с dirty state

```typescript
const addItem = useCallback((item: HallPlacedItem) => {
  const clientId = -nextClientIdRef.current++
  const itemWithClientId = { ...item, id: clientId }
  setDirtyAdds((prev) => new Map(prev).set(clientId, itemWithClientId))
  flushPatch(false)
  return clientId
}, [flushPatch])

const updateItem = useCallback((id: number, update: Partial<HallPlacedItem>) => {
  setDirtyUpdates((prev) => {
    const next = new Map(prev)
    const existing = next.get(id) || {}
    next.set(id, { ...existing, ...update })
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
```

#### 3.4.5. Обработка событий мыши

**`handleGridMouseDown`** - начало действия:
- Для ERASE: сразу удаляет item под курсором
- Для DRAW: начинает накапливать `paintedObjectCells`
- Для MOVE: начинает перетаскивание объекта

**`handleGridMouseMove`** - движение мыши:
```typescript
if (isPaintingObjects) {
  const last = lastPaintCoordRef.current || coords
  const dx = coords.x - last.x
  const dy = coords.y - last.y
  // ограничиваем количество промежуточных шагов
  const maxStep = 8
  const steps = Math.min(Math.max(Math.abs(dx), Math.abs(dy), 1), maxStep)

  const newCells: string[] = []
  for (let i = 0; i <= steps; i++) {
    const x = last.x + Math.round((dx * i) / steps)
    const y = last.y + Math.round((dy * i) / steps)
    const key = `${x},${y}`
    const existing = items.find(
      (it) => x >= it.x && x < it.x + it.w && y >= it.y && y < it.y + it.h
    )
    if (!existing) {
      newCells.push(key)
    }
  }
  // ...
}
```

**Особенности:**
- Интерполяция при быстром движении (max 8 шагов)
- Проверка коллизий перед добавлением клетки

**`handleGridMouseUp`** - завершение действия:
- Если рисовали: отправляет `flushPatch(true)` со всеми накопленными клетками
- Если перетаскивали: отправляет `flushPatch(true)` с обновлённой позицией
- Если ластик: отправляет `flushPatch(true)` с удалёнными items

#### 3.4.6. Проверка коллизий

```typescript
// Запрещённая зона стола: стол + «ореол» 1 клетка
const isCellTooCloseToAnyTable = (x: number, y: number) =>
  items.some((it) => {
    if (it.type !== 'TABLE') return false
    const left = it.x - 1
    const top = it.y - 1
    const right = it.x + it.w + 1
    const bottom = it.y + it.h + 1
    return x >= left && x < right && y >= top && y < bottom
  })

const rectTooCloseToAnyTable = (x: number, y: number, w: number, h: number) =>
  items.some((it) => {
    if (it.type !== 'TABLE') return false
    const left = it.x - 1
    const top = it.y - 1
    const right = it.x + it.w + 1
    const bottom = it.y + it.h + 1
    const noOverlap =
      x + w <= left || right <= x || y + h <= top || bottom <= y
    return !noOverlap
  })
```

**Особенности:**
- Столы имеют "ореол" в 1 клетку (нельзя ставить вплотную)
- O(n) проверка для каждого клика/движения

#### 3.4.7. Рендеринг объектов

```typescript
const renderItem = (it: HallPlacedItem) => {
  const asset = it.assetId ? assets.find((a) => a.id === it.assetId) : null
  const table = it.tableId ? tables.find((t) => t.id === it.tableId) : null

  const isDragging = dragPreview && dragPreview.id === it.id
  const x = isDragging ? dragPreview.x : it.x
  const y = isDragging ? dragPreview.y : it.y

  const style: React.CSSProperties = {
    left: x * CELL_SIZE,
    top: y * CELL_SIZE,
    width: it.w * CELL_SIZE,
    height: it.h * CELL_SIZE,
    zIndex: it.layer || 0,
  }

  return (
    <div
      className={cls}
      style={style}
      onContextMenu={handleItemContextMenu}  // Удаление по ПКМ
      onMouseDown={handleItemMouseDown}      // Выделение/перетаскивание
    >
      {asset?.imageUrl ? (
        <div
          className="hall-item-sprite"
          style={{
            backgroundImage: `url(${asset.imageUrl})`,
            ...(rotation % 180 === 90
              ? {
                  // Специальная обработка для поворота на 90/270
                  width: `${((it.h ?? 1) / (it.w ?? 1)) * 100}%`,
                  height: `${((it.w ?? 1) / (it.h ?? 1)) * 100}%`,
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
      ) : it.type === 'TABLE' ? (
        <div className="hall-item-fallback">
          <div className="hall-item-title">{table?.label || 'Стол'}</div>
        </div>
      ) : null}
    </div>
  )
}
```

**Особенности:**
- Контейнер НЕ вращается (чтобы избежать дробных клеток)
- Вращается только спрайт внутри
- Специальная обработка для поворота на 90/270 (swap размеров)

#### 3.4.8. Undo (Ctrl+Z / Cmd+Z)

```typescript
const handleUndo = async () => {
  if (!map || !view) return
  setHistory((prev) => {
    if (prev.length === 0) return prev
    const snapshot = prev[prev.length - 1]
    const remaining = prev.slice(0, prev.length - 1)
    
    // Для undo используем полную замену через патч:
    // Удаляем все текущие items и добавляем все из snapshot
    const currentIds = items.map((it) => it.id).filter((id) => id > 0)
    const snapshotIds = snapshot.map((it) => it.id).filter((id) => id > 0)
    
    // Удаляем все текущие
    currentIds.forEach((id) => removeItem(id))
    
    // Добавляем все из snapshot
    snapshot.forEach((it) => {
      if (!currentIds.includes(it.id)) {
        addItem({ ...it, hallMapId: map.id })
      } else {
        updateItem(it.id, { ...it })
      }
    })
    
    // Немедленная отправка при undo
    flushPatch(true)
    
    return remaining
  })
}
```

**Особенности:**
- История хранится как массив снимков состояния
- Undo отправляет патч на сервер немедленно

#### 3.4.9. Поворот столов (A/D клавиши)

```typescript
// Rotation for selected table with A/D
if (lower === 'd') newRotation = (current + 90) % 360
else if (lower === 'a') newRotation = (current + 270) % 360  // -90

// Проверка коллизий после поворота
const touchesAnyTable = currentItems.some((other) => {
  // ... проверка пересечения с расширенной зоной других столов
})

const collides = currentItems.some((other) => {
  // ... проверка пересечения с другими объектами
})

if (touchesAnyTable || collides) {
  return  // не поворачиваем
}

// Обновляем через helper
updateItem(targetItem.id, {
  rotation: newRotation!,
  w: w1,  // swap при повороте на 90/270
  h: h1,
  x: nextX,
  y: nextY,
})
flushPatch(true)
```

#### 3.4.10. Pan & Zoom

```typescript
const containerStyle = useMemo(() => {
  if (!map) return {}
  return {
    width: map.gridWidth * CELL_SIZE,
    height: map.gridHeight * CELL_SIZE,
    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
    transformOrigin: '0 0',
  } as React.CSSProperties
}, [map, zoom, panOffset])
```

**Обработка pan:**
- Средняя кнопка мыши или ПКМ или Space + ЛКМ
- Обновление `panOffset` при движении мыши

**Обработка zoom:**
- Колесо мыши (не реализовано в коде, но есть кнопки +/-)
- Ограничение: 0.25x - 4.0x

---

## 4. Механизмы синхронизации и оптимизации

### 4.1. Оптимистичная блокировка

**Backend:**
- Поле `version` в `HallMap` инкрементируется при каждом обновлении
- `patchItems()` проверяет `baseVersion` и выбрасывает исключение при несовпадении

**Frontend:**
- Отправляет `baseVersion` в запросе
- При ошибке 409/412 перезагружает карту

### 4.2. Debouncing

**Frontend:**
- `flushPatch()` использует `setTimeout` с задержкой 500ms
- Накопление изменений в `dirtyAdds`, `dirtyUpdates`, `dirtyRemoves`
- Немедленная отправка при критичных действиях (undo, завершение перетаскивания)

### 4.3. Batch операции

**Backend:**
- `saveAll()` вместо цикла `save()`
- Предзагрузка связанных сущностей одним запросом (`findAllById`)

### 4.4. Дифференциальные обновления

**Вместо полной замены:**
- Отправляются только добавленные/изменённые/удалённые items
- Снижает нагрузку на сеть и БД

---

## 5. Детали реализации компонентов

### 5.1. Константы

```typescript
const CELL_SIZE = 16  // Размер одной клетки в пикселях
```

### 5.2. Builtin Assets

```typescript
const defaultBuiltinAssets = [
  { id: -1, name: 'Стол (дефолт)', type: 'TABLE', widthCells: 3, heightCells: 2 },
  { id: -2, name: 'Стена', type: 'DECOR', widthCells: 1, heightCells: 1 },
  { id: -3, name: 'Стул', type: 'DECOR', widthCells: 1, heightCells: 1 },
]
```

### 5.3. Преобразование координат

```typescript
const getGridCoords = (e: React.MouseEvent | MouseEvent, element: HTMLElement) => {
  const rect = element.getBoundingClientRect()
  // Учитываем zoom и pan
  const x = (e.clientX - rect.left - panOffset.x) / zoom
  const y = (e.clientY - rect.top - panOffset.y) / zoom
  return {
    x: Math.floor(x / CELL_SIZE),
    y: Math.floor(y / CELL_SIZE),
  }
}
```

### 5.4. CSS стили

**Файл:** `frontend/src/pages/HallMap.css`

**Ключевые классы:**
- `.hall-canvas-wrap` - контейнер с overflow для скролла
- `.hall-canvas` - основной canvas с transform для zoom/pan
- `.hall-grid` - фоновая сетка
- `.hall-item` - размещённый объект
- `.hall-item-table` - стол
- `.hall-item-decor` - декор
- `.hall-item-selected` - выделенный объект
- `.hall-zone-rect` - прямоугольная зона
- `.hall-zone-cell` - отдельная клетка зоны (для не-прямоугольных)

---

## Заключение

Реализация Hall Map представляет собой комплексную систему с:

1. **Гибкой архитектурой БД:**
   - Поддержка прямоугольных и не-прямоугольных зон
   - Версионирование для оптимистичной блокировки
   - Связи между картой, зонами, ассетами, столами и размещёнными объектами

2. **Оптимизированным backend:**
   - Batch операции
   - Дифференциальные обновления
   - Предзагрузка связанных сущностей

3. **Интерактивным frontend:**
   - Редактор с поддержкой рисования, перетаскивания, поворота
   - Debouncing для снижения нагрузки
   - Локальное состояние с последующей синхронизацией
   - Undo/redo функциональность

4. **Механизмами синхронизации:**
   - Оптимистичная блокировка
   - Обработка конфликтов версий
   - Автоматическая перезагрузка при конфликтах

Система готова к использованию в продакшене, но имеет потенциал для дальнейшей оптимизации (виртуализация рендеринга, Web Workers для вычислений, Canvas вместо DOM).

