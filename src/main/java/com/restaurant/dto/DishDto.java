package com.restaurant.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public record DishDto(
    Long id,
    @NotBlank String name,
    @DecimalMin("0") BigDecimal price,
    Boolean isActive,
    Long categoryId,
    String categoryName,
    String imageUrl
) {
    public static DishDto fromEntity(com.restaurant.model.Dish dish) {
        return new DishDto(
            dish.getId(),
            dish.getName(),
            dish.getPrice(),
            dish.getIsActive(),
            dish.getCategoryId(),
            dish.getCategory() != null ? dish.getCategory().getName() : null,
            dish.getImageUrl()
        );
    }
}
