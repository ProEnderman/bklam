package com.restaurant.repository;

import com.restaurant.model.OrderStatus;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Кастомные методы для гарантированного порядка при пагинации:
 * один SQL с ORDER BY и явными LIMIT/OFFSET, чтобы страницы шли подряд без «возврата» дат.
 */
public interface OrderRepositoryCustom {

    List<Long> findOrderIdsPageOrdered(
        Long restaurantId,
        OrderStatus status,
        LocalDateTime fromDate,
        LocalDateTime toDate,
        Long dishId,
        int limit,
        int offset
    );
}
