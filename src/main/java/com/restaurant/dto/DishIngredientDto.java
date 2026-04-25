package com.restaurant.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record DishIngredientDto(
    Long id,
    @NotNull Long dishId,
    @NotNull Long ingredientId,
    String ingredientName,
    @Positive Double qtyPerDish
) {
    public static DishIngredientDto fromEntity(com.restaurant.model.DishIngredient di) {
        return new DishIngredientDto(
            di.getId(),
            di.getDish().getId(),
            di.getIngredient().getId(),
            di.getIngredient().getName(),
            di.getQtyPerDish()
        );
    }
}

