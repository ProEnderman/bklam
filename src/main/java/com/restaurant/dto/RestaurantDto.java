package com.restaurant.dto;

import com.restaurant.model.Restaurant;

import java.time.LocalDateTime;

public record RestaurantDto(
    Long id,
    String name,
    boolean hasTelegramBotToken,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
    public static RestaurantDto fromEntity(Restaurant restaurant) {
        return new RestaurantDto(
            restaurant.getId(),
            restaurant.getName(),
            restaurant.getTelegramBotToken() != null && !restaurant.getTelegramBotToken().isBlank(),
            restaurant.getCreatedAt(),
            restaurant.getUpdatedAt()
        );
    }
}

