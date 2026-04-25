package com.restaurant.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record StockInRequest(
    @NotNull Long ingredientId,
    @Positive Double qty,
    String note
) {}

