package com.restaurant.repository;

import com.restaurant.model.OrderStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Пагинация одним SQL с явными LIMIT/OFFSET после ORDER BY,
 * чтобы порядок на всех страницах был одинаковым (нет «возврата» август → март → август).
 */
@Component
public class OrderRepositoryCustomImpl implements OrderRepositoryCustom {

    private static final String SQL_ORDER_IDS_PAGE =
        "SELECT o.id FROM orders o "
        + "WHERE (?::bigint IS NULL OR o.restaurant_id = ?) "
        + "  AND (?::text IS NULL OR o.status = ?) "
        + "  AND o.created_at >= ? AND o.created_at <= ? "
        + "  AND (?::bigint IS NULL OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.dish_id = ?)) "
        + "ORDER BY CASE "
        + "  WHEN o.status = 'OPEN' THEN 0 "
        + "  WHEN o.status = 'CLOSED' AND ("
        + "       o.paid_at IS NOT NULL "
        + "       OR (EXISTS (SELECT 1 FROM order_shares os WHERE os.order_id = o.id) "
        + "           AND NOT EXISTS (SELECT 1 FROM order_payment_marks pm WHERE pm.order_id = o.id AND pm.marked_at IS NULL) "
        + "           AND EXISTS (SELECT 1 FROM order_payment_marks pm2 WHERE pm2.order_id = o.id))"
        + "  ) THEN 2 "
        + "  WHEN o.status = 'CLOSED' THEN 1 "
        + "  WHEN o.status = 'CANCELED' THEN 3 ELSE 4 END ASC, o.created_at DESC, o.id DESC "
        + "LIMIT ? OFFSET ?";

    private final JdbcTemplate jdbcTemplate;

    public OrderRepositoryCustomImpl(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public List<Long> findOrderIdsPageOrdered(
        Long restaurantId,
        OrderStatus status,
        LocalDateTime fromDate,
        LocalDateTime toDate,
        Long dishId,
        int limit,
        int offset
    ) {
        Timestamp fromTs = fromDate != null ? Timestamp.valueOf(fromDate) : Timestamp.valueOf(LocalDateTime.of(1970, 1, 1, 0, 0));
        Timestamp toTs = toDate != null ? Timestamp.valueOf(toDate) : Timestamp.valueOf(LocalDateTime.of(2099, 12, 31, 23, 59, 59));
        String statusStr = status != null ? status.name() : null;

        return jdbcTemplate.query(
            SQL_ORDER_IDS_PAGE,
            (rs, rowNum) -> rs.getLong("id"),
            restaurantId, restaurantId,
            statusStr, statusStr,
            fromTs, toTs,
            dishId, dishId,
            limit, offset
        );
    }
}
