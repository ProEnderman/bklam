package com.restaurant.event;

public record OrderCancelledEvent(
    Long orderId,
    Long restaurantId
) {}
