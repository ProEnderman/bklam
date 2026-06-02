package com.restaurant.dto;

import java.time.LocalDate;

/**
 * Daily PAID tariff booking counts for forecast training (by {@code start_at} date).
 */
public record ForecastTariffBookingRow(
    LocalDate day,
    long count
) {}
