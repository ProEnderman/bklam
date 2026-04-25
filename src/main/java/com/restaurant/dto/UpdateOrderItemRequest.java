package com.restaurant.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record UpdateOrderItemRequest(
    @NotNull @Positive Integer qty,
    String comment
) {}

