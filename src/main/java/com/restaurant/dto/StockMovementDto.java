package com.restaurant.dto;

import com.restaurant.model.StockMovementReason;
import com.restaurant.model.StockMovementType;

import java.time.LocalDateTime;

public record StockMovementDto(
    Long id,
    Long ingredientId,
    String ingredientName,
    StockMovementType type,
    Double qty,
    StockMovementReason reason,
    Long orderId,
    String createdBy,
    LocalDateTime createdAt,
    String note
) {
    public static StockMovementDto fromEntity(com.restaurant.model.StockMovement movement) {
        return new StockMovementDto(
            movement.getId(),
            movement.getIngredient().getId(),
            movement.getIngredient().getName(),
            movement.getType(),
            movement.getQty(),
            movement.getReason(),
            movement.getOrderId(),
            movement.getCreatedBy(),
            movement.getCreatedAt(),
            movement.getNote()
        );
    }
}

