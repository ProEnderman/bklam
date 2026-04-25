package com.restaurant.service;

import com.restaurant.dto.HallDtos;
import com.restaurant.exception.BusinessException;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.HallAsset;
import com.restaurant.model.HallMap;
import com.restaurant.model.HallPlacedItem;
import com.restaurant.model.HallTable;
import com.restaurant.model.HallZone;
import com.restaurant.repository.*;
import com.restaurant.security.SecurityUtils;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class HallService {

    private final HallMapRepository hallMapRepository;
    private final HallZoneRepository hallZoneRepository;
    private final HallAssetRepository hallAssetRepository;
    private final HallPlacedItemRepository hallPlacedItemRepository;
    private final HallTableRepository hallTableRepository;
    private final RestaurantRepository restaurantRepository;
    private final PlatformTransactionManager transactionManager;
    private final ObjectMapper objectMapper;
    private final ActivityLogService activityLogService;

    @Value("${app.upload.dir:uploads}")
    private String uploadDir;

    /** Если в БД imageUrl указывает на утерянный после rebuild файл (UUID мог поменяться),
     *  пробуем найти актуальный файл по префиксу `asset_{id}_*` в директории uploads. */
    private String resolveAssetImageUrl(HallAsset asset) {
        if (asset == null) return null;
        String imageUrl = asset.getImageUrl();
        if (imageUrl == null || imageUrl.isBlank()) return imageUrl;

        // Директория где лежат картинки ассетов зала
        Path dir = Paths.get(uploadDir, "hall", "assets");
        if (!Files.isDirectory(dir)) return imageUrl;

        // 1) Если файл из imageUrl существует — возвращаем как есть
        if (imageUrl.startsWith("/uploads/hall/assets/")) {
            String filename = imageUrl.substring(imageUrl.lastIndexOf('/') + 1);
            if (filename != null && !filename.isBlank()) {
                Path filePath = dir.resolve(filename);
                if (Files.exists(filePath) && Files.isReadable(filePath)) {
                    return imageUrl;
                }
            }
        }

        // 2) Ищем файл по префиксу asset_{assetId}_*
        String prefix = "asset_" + asset.getId() + "_";
        try {
            try (var stream = Files.list(dir)) {
                var found = stream
                    .filter(Files::isRegularFile)
                    .filter(p -> {
                        String name = p.getFileName().toString();
                        return name.startsWith(prefix);
                    })
                    // Берём самый свежий файл, чтобы после повторной загрузки спрайта показывался он
                    .max((a, b) -> {
                        try {
                            return Files.getLastModifiedTime(a).compareTo(Files.getLastModifiedTime(b));
                        } catch (IOException e) {
                            // Если не удалось прочитать время — считаем такие файлы "старее"
                            return -1;
                        }
                    })
                    .map(p -> p.getFileName().toString());
                if (found.isPresent()) return "/uploads/hall/assets/" + found.get();
            }
        } catch (IOException e) {
            log.warn("Could not resolve hall asset image url for assetId={}: {}", asset.getId(), e.getMessage());
        }
        return imageUrl;
    }

    private void requireAdmin() {
        com.restaurant.security.UserPrincipal user = SecurityUtils.getCurrentUser();
        com.restaurant.model.Role role = SecurityUtils.getCurrentUserRole();
        boolean isAdmin = SecurityUtils.isAdmin();
        boolean isHeadAdmin = SecurityUtils.isHeadAdmin();
        boolean hasPermission = SecurityUtils.hasPermission(com.restaurant.model.UserPermission.MANAGE_HALL_MAP);
        
        log.info("requireAdmin check: user={}, role={}, isAdmin={}, isHeadAdmin={}, hasPermission={}", 
            user != null ? user.getUsername() : "null", role, isAdmin, isHeadAdmin, hasPermission);
        
        if (isHeadAdmin) {
            log.warn("HEAD_ADMIN attempted to access hall map editor");
            throw new BusinessException("HEAD_ADMIN cannot manage hall map");
        }
        
        // ADMIN всегда имеет доступ (прямая проверка)
        if (isAdmin) {
            log.info("Access granted to hall map editor (ADMIN)");
            return;
        }
        
        // REGULAR_WORKER требует права MANAGE_HALL_MAP
        if (SecurityUtils.isRegularWorker() && hasPermission) {
            log.info("Access granted to hall map editor (REGULAR_WORKER with permission)");
            return;
        }
        
        // Если нет права - выбрасываем ошибку
        log.warn("Access denied to hall map editor. User role: {}, isAdmin: {}, hasPermission: {}", 
            role, isAdmin, hasPermission);
        throw new BusinessException("You don't have permission to manage hall map");
    }

    private void requireWaiterView() {
        if (SecurityUtils.isHeadAdmin()) {
            throw new BusinessException("HEAD_ADMIN cannot view hall map");
        }
        if (!SecurityUtils.isAdmin() && SecurityUtils.isRegularWorker() && !SecurityUtils.hasPermission(com.restaurant.model.UserPermission.VIEW_HALL_MAP)) {
            throw new BusinessException("You don't have permission to view hall map");
        }
    }

    private Long currentRestaurantIdRequired() {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId == null) throw new BusinessException("Restaurant ID is required");
        return restaurantId;
    }

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
                            map.setGridWidth(defaultW != null ? defaultW : 200);
                            map.setGridHeight(defaultH != null ? defaultH : 200);
                            return hallMapRepository.save(map);
                        });
                });
            });
    }

    @Transactional(readOnly = true)
    public HallDtos.HallViewDto getHallView() {
        requireWaiterView();
        HallMap map = getOrCreateMap(200, 200);
        List<HallZone> zones = hallZoneRepository.findByHallMapIdOrderByIdAsc(map.getId());
        List<HallAsset> assets = hallAssetRepository.findByRestaurantIdOrderByIdAsc(map.getRestaurantId());
        List<HallTable> tables = hallTableRepository.findByRestaurantIdOrderByLabelAsc(map.getRestaurantId());
        List<HallPlacedItem> items = hallPlacedItemRepository.findViewByHallMapId(map.getId());

        return new HallDtos.HallViewDto(
            HallDtos.HallMapDto.fromEntity(map),
            zones.stream().map(this::zoneToDto).toList(),
            assets.stream().map(a -> {
                String resolved = resolveAssetImageUrl(a);
                return new HallDtos.HallAssetDto(
                    a.getId(),
                    a.getName(),
                    a.getType(),
                    resolved,
                    a.getWidthCells(),
                    a.getHeightCells(),
                    a.getDefaultCapacity()
                );
            }).toList(),
            tables.stream().map(HallDtos.HallTableDto::fromEntity).toList(),
            items.stream().map(HallDtos.HallPlacedItemDto::fromEntity).toList()
        );
    }

    @Transactional
    public HallDtos.HallMapDto updateMap(HallDtos.HallMapDto req) {
        requireAdmin();
        HallMap map = getOrCreateMap(200, 200);
        if (req.name() != null && !req.name().isBlank()) map.setName(req.name());
        if (req.gridWidth() != null && req.gridWidth() > 0) map.setGridWidth(req.gridWidth());
        if (req.gridHeight() != null && req.gridHeight() > 0) map.setGridHeight(req.gridHeight());
        HallMap saved = hallMapRepository.save(map);
        
        try {
            activityLogService.logActivity(
                "UPDATE", "HALL_MAP", saved.getId(), null,
                String.format("Обновлена карта зала: %s (%dx%d)", saved.getName(), saved.getGridWidth(), saved.getGridHeight()),
                null,
                Map.of("name", saved.getName(), "gridWidth", saved.getGridWidth(), "gridHeight", saved.getGridHeight())
            );
        } catch (Exception e) {
            log.error("Failed to log hall map update: {}", e.getMessage());
        }
        
        return HallDtos.HallMapDto.fromEntity(saved);
    }

    @Transactional(readOnly = true)
    public List<HallDtos.HallZoneDto> getZones() {
        requireWaiterView();
        HallMap map = getOrCreateMap(200, 200);
        return hallZoneRepository.findByHallMapIdOrderByIdAsc(map.getId()).stream()
            .map(this::zoneToDto)
            .toList();
    }

    private HallDtos.HallZoneDto zoneToDto(HallZone z) {
        try {
            List<HallDtos.HallCellDto> cells = null;
            List<HallDtos.HallCellDto> vertices = null;
            
            if (z.getCells() != null && !z.getCells().isBlank()) {
                cells = objectMapper.readValue(
                    z.getCells(),
                    new TypeReference<List<HallDtos.HallCellDto>>() {}
                );
            }
            
            if (z.getVertices() != null && !z.getVertices().isBlank()) {
                vertices = objectMapper.readValue(
                    z.getVertices(),
                    new TypeReference<List<HallDtos.HallCellDto>>() {}
                );
            }
            
            if (cells == null && vertices == null) {
                return HallDtos.HallZoneDto.fromEntity(z);
            }
            return HallDtos.HallZoneDto.fromEntity(z, cells, vertices);
        } catch (Exception e) {
            log.warn("Failed to parse zone cells/vertices for zoneId={}: {}", z.getId(), e.getMessage());
            return HallDtos.HallZoneDto.fromEntity(z);
        }
    }

    @Transactional
    public HallDtos.HallZoneDto createZone(HallDtos.HallZoneDto req) {
        requireAdmin();
        HallMap map = getOrCreateMap(200, 200);
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
        // Save vertices if provided
        if (req.vertices() != null && !req.vertices().isEmpty()) {
            try {
                z.setVertices(objectMapper.writeValueAsString(req.vertices()));
            } catch (Exception e) {
                throw new BusinessException("Invalid zone vertices");
            }
        }
        z.setColor(req.color() != null ? req.color() : "#4f46e5");
        z.setActiveForWaiter(req.activeForWaiter() != null ? req.activeForWaiter() : true);
        HallZone savedZone = hallZoneRepository.save(z);
        
        try {
            activityLogService.logActivity(
                "CREATE", "HALL_ZONE", savedZone.getId(), null,
                String.format("Создана зона зала: %s", savedZone.getName()),
                null,
                Map.of("name", savedZone.getName(), "color", savedZone.getColor())
            );
        } catch (Exception e) {
            log.error("Failed to log zone create: {}", e.getMessage());
        }
        
        return zoneToDto(savedZone);
    }

    @Transactional
    public HallDtos.HallZoneDto updateZone(Long id, HallDtos.HallZoneDto req) {
        requireAdmin();
        HallZone z = hallZoneRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Zone not found"));
        // restaurant check via map
        Long restaurantId = currentRestaurantIdRequired();
        if (!restaurantId.equals(z.getHallMap().getRestaurantId())) throw new BusinessException("Access denied");
        if (req.name() != null) z.setName(req.name());
        if (req.cells() != null) {
            if (req.cells().isEmpty()) {
                z.setCells(null);
            } else {
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
            }
        } else {
            if (req.x() != null) z.setX(req.x());
            if (req.y() != null) z.setY(req.y());
            if (req.w() != null) z.setW(req.w());
            if (req.h() != null) z.setH(req.h());
        }
        // Update vertices if provided
        if (req.vertices() != null) {
            if (req.vertices().isEmpty()) {
                z.setVertices(null);
            } else {
                try {
                    z.setVertices(objectMapper.writeValueAsString(req.vertices()));
                } catch (Exception e) {
                    throw new BusinessException("Invalid zone vertices");
                }
            }
        }
        if (req.color() != null) z.setColor(req.color());
        if (req.activeForWaiter() != null) z.setActiveForWaiter(req.activeForWaiter());
        HallZone savedZ = hallZoneRepository.save(z);
        
        try {
            activityLogService.logActivity(
                "UPDATE", "HALL_ZONE", savedZ.getId(), null,
                String.format("Обновлена зона зала: %s", savedZ.getName()),
                null,
                Map.of("name", savedZ.getName())
            );
        } catch (Exception e) {
            log.error("Failed to log zone update: {}", e.getMessage());
        }
        
        return zoneToDto(savedZ);
    }

    @Transactional
    public void deleteZone(Long id) {
        requireAdmin();
        HallZone z = hallZoneRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Zone not found"));
        Long restaurantId = currentRestaurantIdRequired();
        if (!restaurantId.equals(z.getHallMap().getRestaurantId())) throw new BusinessException("Access denied");
        
        try {
            activityLogService.logActivity(
                "DELETE", "HALL_ZONE", id, null,
                String.format("Удалена зона зала: %s", z.getName()),
                Map.of("name", z.getName()), null
            );
        } catch (Exception e) {
            log.error("Failed to log zone delete: {}", e.getMessage());
        }
        
        hallZoneRepository.delete(z);
    }

    @Transactional(readOnly = true)
    public List<HallDtos.HallPlacedItemDto> getItems() {
        requireWaiterView();
        HallMap map = getOrCreateMap(200, 200);
        return hallPlacedItemRepository.findViewByHallMapId(map.getId()).stream()
            .map(HallDtos.HallPlacedItemDto::fromEntity)
            .toList();
    }

    @Transactional
    public List<HallDtos.HallPlacedItemDto> replaceItems(List<HallDtos.HallPlacedItemDto> items) {
        requireAdmin();
        HallMap map = getOrCreateMap(200, 200);
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

    @Transactional
    public HallDtos.HallItemsPatchResponse patchItems(HallDtos.HallItemsPatchRequest req) {
        requireAdmin();
        HallMap map = getOrCreateMap(200, 200);

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
                    HallAsset a = assetsMap.get(dto.assetId());
                    if (a == null) throw new ResourceNotFoundException("Asset not found or access denied");
                    i.setAsset(a);
                }
                if (dto.tableId() != null) {
                    HallTable t = tablesMap.get(dto.tableId());
                    if (t == null) throw new ResourceNotFoundException("Table not found or access denied");
                    i.setTable(t);
                }
                itemsToAdd.add(i);
            }
            
            // Batch insert через saveAll
            upserted.addAll(hallPlacedItemRepository.saveAll(itemsToAdd));
        }

        // Обновление
        if (req.updated() != null && !req.updated().isEmpty()) {
            List<Long> updateIds = req.updated().stream().map(HallDtos.HallPlacedItemDto::id).filter(id -> id != null && id > 0).toList();
            if (!updateIds.isEmpty()) {
                List<HallPlacedItem> existing = hallPlacedItemRepository.findByIds(updateIds);
                java.util.Map<Long, HallPlacedItem> existingMap = existing.stream()
                    .filter(i -> i.getHallMap().getId().equals(map.getId()))
                    .collect(java.util.stream.Collectors.toMap(HallPlacedItem::getId, i -> i));

                // Предзагружаем все нужные assets и tables одним запросом
                List<Long> assetIds = req.updated().stream()
                    .map(HallDtos.HallPlacedItemDto::assetId)
                    .filter(id -> id != null && id > 0)
                    .distinct()
                    .toList();
                List<Long> tableIds = req.updated().stream()
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

                for (HallDtos.HallPlacedItemDto dto : req.updated()) {
                    if (dto.id() == null || dto.id() <= 0) continue;
                    HallPlacedItem i = existingMap.get(dto.id());
                    if (i == null) continue;

                    // Обновляем только переданные поля
                    if (dto.type() != null) i.setType(dto.type());
                    if (dto.x() != null) i.setX(dto.x());
                    if (dto.y() != null) i.setY(dto.y());
                    if (dto.w() != null) i.setW(dto.w());
                    if (dto.h() != null) i.setH(dto.h());
                    if (dto.rotation() != null) i.setRotation(dto.rotation());
                    if (dto.layer() != null) i.setLayer(dto.layer());
                    if (dto.locked() != null) i.setLocked(dto.locked());

                    if (dto.assetId() != null) {
                        HallAsset a = assetsMap.get(dto.assetId());
                        if (a == null) throw new ResourceNotFoundException("Asset not found or access denied");
                        i.setAsset(a);
                    }

                    if (dto.tableId() != null) {
                        HallTable t = tablesMap.get(dto.tableId());
                        if (t == null) throw new ResourceNotFoundException("Table not found or access denied");
                        i.setTable(t);
                    }
                }
                
                // Batch update через saveAll
                upserted.addAll(hallPlacedItemRepository.saveAll(existing));
            }
        }

        // Обновляем версию карты (автоматически через @PreUpdate)
        hallMapRepository.save(map);

        // Возвращаем обновлённые items
        List<HallDtos.HallPlacedItemDto> upsertedDtos = upserted.stream()
            .map(HallDtos.HallPlacedItemDto::fromEntity)
            .toList();

        return new HallDtos.HallItemsPatchResponse(
            map.getVersion(),
            upsertedDtos,
            req.removedIds() != null ? req.removedIds() : List.of()
        );
    }

    @Transactional(readOnly = true)
    public List<HallDtos.HallAssetDto> getAssets() {
        requireWaiterView();
        Long restaurantId = currentRestaurantIdRequired();
        return hallAssetRepository.findByRestaurantIdOrderByIdAsc(restaurantId).stream()
            .map(a -> {
                String resolved = resolveAssetImageUrl(a);
                return new HallDtos.HallAssetDto(
                    a.getId(),
                    a.getName(),
                    a.getType(),
                    resolved,
                    a.getWidthCells(),
                    a.getHeightCells(),
                    a.getDefaultCapacity()
                );
            })
            .toList();
    }

    @Transactional
    public HallDtos.HallAssetDto createAsset(HallDtos.HallAssetDto req) {
        requireAdmin();
        Long restaurantId = currentRestaurantIdRequired();
        if (hallAssetRepository.findByRestaurantIdAndName(restaurantId, req.name()).isPresent()) {
            throw new BusinessException("Asset with this name already exists");
        }
        HallAsset a = new HallAsset();
        a.setRestaurant(restaurantRepository.findById(restaurantId)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));
        a.setName(req.name());
        a.setType(req.type());
        a.setImageUrl(req.imageUrl());
        a.setWidthCells(req.widthCells() != null ? req.widthCells() : 1);
        a.setHeightCells(req.heightCells() != null ? req.heightCells() : 1);
        a.setDefaultCapacity(req.defaultCapacity());
        HallAsset savedAsset = hallAssetRepository.save(a);
        
        try {
            activityLogService.logActivity(
                "CREATE", "HALL_ASSET", savedAsset.getId(), null,
                String.format("Создан ассет зала: %s", savedAsset.getName()),
                null,
                Map.of("name", savedAsset.getName(), "type", savedAsset.getType() != null ? savedAsset.getType() : "")
            );
        } catch (Exception e) {
            log.error("Failed to log asset create: {}", e.getMessage());
        }
        
        return HallDtos.HallAssetDto.fromEntity(savedAsset);
    }

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
            throw new BusinessException("Не удалось сохранить изображение. Проверьте права на запись в директорию загрузок.");
        }
    }

    @Transactional(readOnly = true)
    public List<HallDtos.HallTableDto> getTables() {
        requireWaiterView();
        Long restaurantId = currentRestaurantIdRequired();
        return hallTableRepository.findByRestaurantIdOrderByLabelAsc(restaurantId).stream()
            .map(HallDtos.HallTableDto::fromEntity)
            .toList();
    }

    /**
     * Возвращает только активные столики, размещённые на карте зала.
     * Используется для бронирования столиков.
     */
    @Transactional(readOnly = true)
    public List<HallDtos.HallTableDto> getActiveTablesOnMap() {
        requireWaiterView();
        Long restaurantId = currentRestaurantIdRequired();
        return hallTableRepository.findActiveTablesOnMap(restaurantId).stream()
            .map(HallDtos.HallTableDto::fromEntity)
            .toList();
    }

    @Transactional
    public HallDtos.HallTableDto createTable(HallDtos.HallTableDto req) {
        requireAdmin();
        Long restaurantId = currentRestaurantIdRequired();
        if (hallTableRepository.findByRestaurantIdAndLabel(restaurantId, req.label()).isPresent()) {
            throw new BusinessException("Table with this label already exists");
        }
        HallTable t = new HallTable();
        t.setRestaurant(restaurantRepository.findById(restaurantId)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));
        t.setLabel(req.label());
        t.setCapacity(req.capacity() != null ? req.capacity() : 2);
        t.setIsActive(req.isActive() != null ? req.isActive() : true);
        HallTable savedTable = hallTableRepository.save(t);
        
        try {
            activityLogService.logActivity(
                "CREATE", "HALL_TABLE", savedTable.getId(), null,
                String.format("Создан столик: %s (вместимость: %d)", savedTable.getLabel(), savedTable.getCapacity()),
                null,
                Map.of("label", savedTable.getLabel(), "capacity", savedTable.getCapacity())
            );
        } catch (Exception e) {
            log.error("Failed to log table create: {}", e.getMessage());
        }
        
        return HallDtos.HallTableDto.fromEntity(savedTable);
    }
}


