package com.restaurant.dto;

import com.restaurant.model.Unit;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record IngredientDto(
    Long id,
    @NotBlank String name,
    @NotNull Unit unit,
    @Min(0) Double stockQty,
    @Min(0) Double minQty
) {
    public static IngredientDto fromEntity(com.restaurant.model.Ingredient ingredient) {
        return new IngredientDto(
            ingredient.getId(),
            ingredient.getName(),
            ingredient.getUnit(),
            ingredient.getStockQty(),
            ingredient.getMinQty()
        );
    }
}

