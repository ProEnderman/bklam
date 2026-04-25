package com.restaurant.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Read-only DTO for forecast training data: daily order aggregates per tenant.
 */
public record ForecastOrderRow(
    LocalDate day,
    BigDecimal revenue,
    int itemsCount
) {}
