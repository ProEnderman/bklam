package com.restaurant.dto;

import com.restaurant.model.Location;

import java.time.LocalDateTime;

public record LocationDto(
    Long id,
    Long holdingId,
    Long brandId,
    Long legalEntityId,
    String name,
    Long legacyRestaurantId,
    LocalDateTime qrTokenExpiresAt,
    boolean hasTelegramBotToken,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
    public static LocationDto fromEntity(Location l) {
        return new LocationDto(
            l.getId(),
            l.getHolding() != null ? l.getHolding().getId() : null,
            l.getBrand() != null ? l.getBrand().getId() : null,
            l.getLegalEntity() != null ? l.getLegalEntity().getId() : null,
            l.getName(),
            l.getLegacyRestaurantId(),
            l.getQrTokenExpiresAt(),
            l.getTelegramBotToken() != null && !l.getTelegramBotToken().isBlank(),
            l.getCreatedAt(),
            l.getUpdatedAt()
        );
    }
}
