package com.restaurant.dto;

import com.restaurant.model.StockMovementReason;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record StockOutRequest(
    @NotNull Long ingredientId,
    @Positive Double qty,
    @NotNull StockMovementReason reason,
    String note
) {}

