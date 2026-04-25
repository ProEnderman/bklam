package com.restaurant.dto;

import com.restaurant.model.Unit;

public record IngredientUsageDto(
    Long ingredientId,
    String ingredientName,
    Double totalUsed,
    Unit unit
) {}

