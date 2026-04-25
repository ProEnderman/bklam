package com.restaurant.dto;

/**
 * Partial update for order. Only non-null fields are applied.
 * Use clearGuest=true to unset the guest.
 */
public record UpdateOrderRequest(
    String name,
    Long tableId,
    Long guestId,
    Boolean clearGuest
) {}
