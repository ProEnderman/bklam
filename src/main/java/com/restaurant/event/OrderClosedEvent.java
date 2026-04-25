package com.restaurant.event;

import java.math.BigDecimal;

public record OrderClosedEvent(
    Long orderId,
    Long restaurantId,
    BigDecimal totalAmount,
    Long guestId
) {}
