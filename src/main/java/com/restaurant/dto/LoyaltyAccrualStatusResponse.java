package com.restaurant.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

/**
 * HEAD_ADMIN read: idempotency guard row for order-level loyalty accrual.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LoyaltyAccrualStatusResponse(
        long restaurantId,
        long orderId,
        String status,
        Instant createdAt,
        Instant updatedAt
) {}
