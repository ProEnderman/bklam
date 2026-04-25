package com.restaurant.dto;

import java.math.BigDecimal;
import java.util.List;

public record OrderSplitDto(
    Long orderId,
    BigDecimal orderTotal,
    List<ShareDto> shares
) {
    public record ShareDto(
        Long shareId,
        String name,
        BigDecimal shareTotal,
        List<SplitItemDto> items,
        Long guestId,
        String guestLabel
    ) {}

    public record SplitItemDto(
        Long itemId,
        Long dishId,
        String dishName,
        Integer qty,
        BigDecimal lineTotal
    ) {}
}
