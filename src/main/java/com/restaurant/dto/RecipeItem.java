package com.restaurant.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record RecipeItem(
    @NotNull Long ingredientId,
    @Positive Double qtyPerDish
) {}

