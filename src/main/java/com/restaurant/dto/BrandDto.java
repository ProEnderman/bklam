package com.restaurant.dto;

import com.restaurant.model.Brand;

import java.time.LocalDateTime;

public record BrandDto(Long id, Long holdingId, String name, LocalDateTime createdAt, LocalDateTime updatedAt) {
    public static BrandDto fromEntity(Brand b) {
        return new BrandDto(
            b.getId(),
            b.getHolding() != null ? b.getHolding().getId() : null,
            b.getName(),
            b.getCreatedAt(),
            b.getUpdatedAt()
        );
    }
}
