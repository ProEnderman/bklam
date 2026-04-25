package com.restaurant.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.List;

public record AddPublicItemRequest(
    @NotNull Long dishId,
    @Positive @NotNull Integer qty,
    String comment,
    List<OptionSelection> selections
) {
    public record OptionSelection(
        @NotNull Long groupInstanceId,
        Long optionItemId,
        Integer optionQty,
        Integer valueInt
    ) {}
}
