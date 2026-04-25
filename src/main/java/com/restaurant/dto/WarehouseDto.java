package com.restaurant.dto;

import com.restaurant.model.Warehouse;
import com.restaurant.model.WarehouseType;

import java.time.LocalDateTime;

public record WarehouseDto(
    Long id,
    Long locationId,
    String name,
    String type,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
    public static WarehouseDto fromEntity(Warehouse w) {
        return new WarehouseDto(
            w.getId(),
            w.getLocation() != null ? w.getLocation().getId() : null,
            w.getName(),
            w.getType() != null ? w.getType().name() : null,
            w.getCreatedAt(),
            w.getUpdatedAt()
        );
    }
}
