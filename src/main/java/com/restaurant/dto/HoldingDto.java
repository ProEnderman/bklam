package com.restaurant.dto;

import com.restaurant.model.Holding;

import java.time.LocalDateTime;

public record HoldingDto(Long id, String name, LocalDateTime createdAt, LocalDateTime updatedAt) {
    public static HoldingDto fromEntity(Holding h) {
        return new HoldingDto(h.getId(), h.getName(), h.getCreatedAt(), h.getUpdatedAt());
    }
}
