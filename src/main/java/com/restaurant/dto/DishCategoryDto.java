package com.restaurant.dto;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDateTime;

public record DishCategoryDto(
    Long id,
    @NotBlank String name,
    String imageUrl,
    Long restaurantId,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
    public static DishCategoryDto fromEntity(com.restaurant.model.DishCategory category) {
        return new DishCategoryDto(
            category.getId(),
            category.getName(),
            category.getImageUrl(),
            category.getRestaurantId(),
            category.getCreatedAt(),
            category.getUpdatedAt()
        );
    }

    public static DishCategoryDto fromEntityWithImageUrl(com.restaurant.model.DishCategory category, String imageUrlForResponse) {
        return new DishCategoryDto(
            category.getId(),
            category.getName(),
            imageUrlForResponse != null ? imageUrlForResponse : category.getImageUrl(),
            category.getRestaurantId(),
            category.getCreatedAt(),
            category.getUpdatedAt()
        );
    }
}


