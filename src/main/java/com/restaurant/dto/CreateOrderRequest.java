package com.restaurant.dto;

public record CreateOrderRequest(
    String name,
    Long tableId,
    Long guestId,
    String idempotencyKey,
    String orderSource
) {}
