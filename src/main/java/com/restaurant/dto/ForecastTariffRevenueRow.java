package com.restaurant.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Daily PAID tariff booking revenue for forecast training (by {@code start_at} date). */
public record ForecastTariffRevenueRow(
    LocalDate day,
    BigDecimal revenue
) {}
