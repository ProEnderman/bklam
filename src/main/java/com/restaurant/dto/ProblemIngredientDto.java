package com.restaurant.dto;

import com.restaurant.model.Unit;

public record ProblemIngredientDto(
    Long ingredientId,
    String ingredientName,
    Double currentStock,
    Double minQty,
    Unit unit,
    String reason
) {}

