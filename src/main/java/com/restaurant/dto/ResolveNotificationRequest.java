package com.restaurant.dto;

import jakarta.validation.constraints.NotNull;

public record ResolveNotificationRequest(
    @NotNull String response,       // CONFIRMED, CANCELLED, CONTINUES, PAID_OR_CANCELLED
    String newEndAt,                // Если CONTINUES — новое время окончания (ISO format)
    Long activityId                 // Если CONTINUES — ID активности, которой клиент продолжает пользоваться (null = та же)
) {}
