package com.restaurant.dto;

import java.math.BigDecimal;
import java.util.Map;

public record RevenueDto(
    BigDecimal total,
    String period,
    Map<String, BigDecimal> byDay,
    Map<String, BigDecimal> byWeek,
    Map<String, BigDecimal> byMonth,
    Map<String, BigDecimal> byYear
) {
    public RevenueDto(BigDecimal total, String period) {
        this(total, period, Map.of(), Map.of(), Map.of(), Map.of());
    }
}
