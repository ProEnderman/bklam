package com.restaurant.dto;

import java.math.BigDecimal;
import java.util.List;

public record PublicMenuCategoryDto(
    Long id,
    String name,
    String imageUrl,
    List<MenuItem> dishes
) {
    public record MenuItem(
        Long id,
        String name,
        BigDecimal price,
        String imageUrl,
        List<OptionGroupDto> optionGroups
    ) {}

    public record OptionGroupDto(
        Long groupInstanceId,
        Long templateId,
        String title,
        String type,
        String presentation,
        RulesDto rules,
        List<OptionItemDto> items
    ) {}

    public record RulesDto(
        Integer minSelect,
        Integer maxSelect,
        Integer minTotalQty,
        Integer maxTotalQty,
        Integer rangeMin,
        Integer rangeMax,
        String pricingMode,
        BigDecimal pricePerUnit,
        Boolean allowSameOptionTwice
    ) {}

    public record OptionItemDto(
        Long optionItemId,
        String title,
        BigDecimal priceDelta,
        Integer perOptionMaxQty,
        Integer valueInt,
        Boolean isDefault
    ) {}
}
