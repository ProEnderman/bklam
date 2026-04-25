package com.restaurant.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.List;

public record AddOrderItemRequest(
    @NotNull Long dishId,
    @Positive Integer qty,
    String comment,
    List<AddPublicItemRequest.OptionSelection> selections
) {}
