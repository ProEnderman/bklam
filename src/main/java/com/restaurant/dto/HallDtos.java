package com.restaurant.dto;

import com.restaurant.model.HallAsset;
import com.restaurant.model.HallMap;
import com.restaurant.model.HallPlacedItem;
import com.restaurant.model.HallTable;
import com.restaurant.model.HallZone;

import java.util.List;

public class HallDtos {

    public record HallCellDto(
        Integer x,
        Integer y
    ) {}

    public record HallMapDto(
        Long id,
        String name,
        Integer gridWidth,
        Integer gridHeight,
        Long version
    ) {
        public static HallMapDto fromEntity(HallMap map) {
            return new HallMapDto(map.getId(), map.getName(), map.getGridWidth(), map.getGridHeight(), map.getVersion());
        }
    }

    public record HallZoneDto(
        Long id,
        Long hallMapId,
        String name,
        Integer x,
        Integer y,
        Integer w,
        Integer h,
        List<HallCellDto> cells,
        List<HallCellDto> vertices,
        String color,
        Boolean activeForWaiter
    ) {
        public static HallZoneDto fromEntity(HallZone z) {
            return new HallZoneDto(
                z.getId(),
                z.getHallMapId(),
                z.getName(),
                z.getX(),
                z.getY(),
                z.getW(),
                z.getH(),
                null,
                null,
                z.getColor(),
                z.getActiveForWaiter()
            );
        }

        public static HallZoneDto fromEntity(HallZone z, List<HallCellDto> cells, List<HallCellDto> vertices) {
            return new HallZoneDto(
                z.getId(),
                z.getHallMapId(),
                z.getName(),
                z.getX(),
                z.getY(),
                z.getW(),
                z.getH(),
                cells,
                vertices,
                z.getColor(),
                z.getActiveForWaiter()
            );
        }
    }

    public record HallAssetDto(
        Long id,
        String name,
        HallAsset.AssetType type,
        String imageUrl,
        Integer widthCells,
        Integer heightCells,
        Integer defaultCapacity
    ) {
        public static HallAssetDto fromEntity(HallAsset a) {
            return new HallAssetDto(
                a.getId(),
                a.getName(),
                a.getType(),
                a.getImageUrl(),
                a.getWidthCells(),
                a.getHeightCells(),
                a.getDefaultCapacity()
            );
        }
    }

    public record HallTableDto(
        Long id,
        String label,
        Integer capacity,
        Boolean isActive
    ) {
        public static HallTableDto fromEntity(HallTable t) {
            return new HallTableDto(t.getId(), t.getLabel(), t.getCapacity(), t.getIsActive());
        }
    }

    public record HallPlacedItemDto(
        Long id,
        Long hallMapId,
        Long assetId,
        HallPlacedItem.ItemType type,
        Integer x,
        Integer y,
        Integer w,
        Integer h,
        Integer rotation,
        Integer layer,
        Long tableId,
        Boolean locked
    ) {
        public static HallPlacedItemDto fromEntity(HallPlacedItem i) {
            return new HallPlacedItemDto(
                i.getId(),
                i.getHallMapId(),
                i.getAssetId(),
                i.getType(),
                i.getX(),
                i.getY(),
                i.getW(),
                i.getH(),
                i.getRotation(),
                i.getLayer(),
                i.getTableId(),
                i.getLocked()
            );
        }
    }

    public record HallViewDto(
        HallMapDto map,
        List<HallZoneDto> zones,
        List<HallAssetDto> assets,
        List<HallTableDto> tables,
        List<HallPlacedItemDto> items
    ) {}

    // PATCH request для дифференциальных обновлений
    public record HallItemsPatchRequest(
        Long baseVersion,
        List<HallPlacedItemDto> added,
        List<HallPlacedItemDto> updated,
        List<Long> removedIds
    ) {}

    // PATCH response
    public record HallItemsPatchResponse(
        Long newVersion,
        List<HallPlacedItemDto> upserted,
        List<Long> removedIds
    ) {}
}



