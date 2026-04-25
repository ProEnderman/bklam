package com.restaurant.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreateOrderSplitRequest(
    @NotEmpty @Valid List<ShareRequest> shares
) {
    /** Assignment of a quantity of an order item to this share */
    public record ItemQty(
        @NotNull Long itemId,
        @NotNull @Positive Integer qty
    ) {}

    public record ShareRequest(
        @NotBlank @Size(max = 64) String name,
        @NotEmpty @Valid List<ItemQty> itemQtys,
        Long guestId
    ) {}
}
