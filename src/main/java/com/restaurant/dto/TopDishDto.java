package com.restaurant.dto;

import java.math.BigDecimal;

public record TopDishDto(
    Long dishId,
    String dishName,
    Long totalSold,
    BigDecimal revenue
) {}
