package com.restaurant.dto;

import java.math.BigDecimal;
import java.util.List;

public record OrderItemDto(
    Long id,
    Long dishId,
    String dishName,
    Integer qty,
    BigDecimal priceAtTime,
    BigDecimal lineTotal,
    String comment,
    List<ModifierDto> modifiers
) {
    public record ModifierDto(
        String groupTitle,
        String optionTitle,
        BigDecimal priceDelta,
        Integer qty,
        Integer valueInt
    ) {}

    public static OrderItemDto fromEntity(com.restaurant.model.OrderItem item) {
        List<ModifierDto> mods = List.of();
        if (item.getOptions() != null && !item.getOptions().isEmpty()) {
            mods = item.getOptions().stream()
                .map(o -> new ModifierDto(
                    o.getGroupTitleSnapshot(),
                    o.getOptionTitleSnapshot(),
                    o.getPriceDeltaSnapshot(),
                    o.getOptionQty(),
                    o.getValueIntSnapshot()
                ))
                .toList();
        }
        return new OrderItemDto(
            item.getId(),
            item.getDish().getId(),
            item.getDish().getName(),
            item.getQty(),
            item.getPriceAtTime(),
            item.getLineTotal() != null ? item.getLineTotal() : item.getPriceAtTime().multiply(BigDecimal.valueOf(item.getQty())),
            item.getComment(),
            mods
        );
    }
}
