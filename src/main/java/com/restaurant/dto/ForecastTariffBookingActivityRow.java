package com.restaurant.dto;

import java.time.LocalDate;

/** Daily PAID booking counts per activity for segment forecasts. */
public record ForecastTariffBookingActivityRow(
    Long activityId,
    String activityName,
    LocalDate day,
    long count
) {}
