package com.restaurant.repository;

import com.restaurant.model.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface OrderRepository extends JpaRepository<Order, Long>, OrderRepositoryCustom {
    
    Optional<Order> findByIdempotencyKey(String idempotencyKey);

    @Query("SELECT DISTINCT o FROM Order o LEFT JOIN FETCH o.items i LEFT JOIN FETCH i.dish WHERE o.id = :id")
    java.util.Optional<Order> findByIdWithItemsOptions(@Param("id") Long id);
    
    @Query("SELECT DISTINCT o FROM Order o LEFT JOIN FETCH o.items LEFT JOIN FETCH o.table WHERE " +
           "(:restaurantId IS NULL OR o.restaurant.id = :restaurantId) AND " +
           "(:status IS NULL OR o.status = :status) AND " +
           "o.createdAt >= :fromDate AND " +
           "o.createdAt <= :toDate AND " +
           "(:dishId IS NULL OR EXISTS (SELECT 1 FROM OrderItem oi WHERE oi.order.id = o.id AND oi.dish.id = :dishId)) " +
           "ORDER BY o.createdAt DESC")
    List<Order> findOrdersWithItems(
        @Param("restaurantId") Long restaurantId,
        @Param("status") com.restaurant.model.OrderStatus status,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate,
        @Param("dishId") Long dishId
    );

    @Query("SELECT DISTINCT o FROM Order o LEFT JOIN FETCH o.items i LEFT JOIN FETCH i.dish LEFT JOIN FETCH o.table WHERE o.id IN :ids")
    List<Order> findOrdersWithItemsByIdIn(@Param("ids") List<Long> ids);

    @Query("SELECT COUNT(DISTINCT o) FROM Order o WHERE " +
           "(:restaurantId IS NULL OR o.restaurant.id = :restaurantId) AND " +
           "(:status IS NULL OR o.status = :status) AND " +
           "o.createdAt >= :fromDate AND " +
           "o.createdAt <= :toDate AND " +
           "(:dishId IS NULL OR EXISTS (SELECT 1 FROM OrderItem oi WHERE oi.order.id = o.id AND oi.dish.id = :dishId))")
    long countOrders(
        @Param("restaurantId") Long restaurantId,
        @Param("status") com.restaurant.model.OrderStatus status,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate,
        @Param("dishId") Long dishId
    );
    
    @Query("SELECT SUM(oi.priceAtTime * oi.qty) FROM Order o " +
           "JOIN o.items oi WHERE " +
           "(:restaurantId IS NULL OR o.restaurant.id = :restaurantId) AND " +
           "o.status = 'CLOSED' AND o.paidAt IS NOT NULL AND " +
           "o.createdAt >= :fromDate AND o.createdAt <= :toDate")
    java.math.BigDecimal getTotalRevenue(
        @Param("restaurantId") Long restaurantId,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate
    );

    @Query("SELECT o FROM Order o WHERE o.restaurant.id = :restaurantId AND o.table.id = :tableId AND o.status = 'OPEN' ORDER BY o.createdAt DESC")
    List<Order> findOpenOrdersByTable(@Param("restaurantId") Long restaurantId, @Param("tableId") Long tableId);

    @Query(value = """
        SELECT CAST(o.closed_at AS date) AS day,
               COALESCE(SUM(o.total_amount), 0) AS revenue,
               COALESCE(SUM(item_counts.qty_sum), 0) AS items_count
        FROM orders o
        LEFT JOIN (
            SELECT oi.order_id, SUM(oi.qty) AS qty_sum
            FROM order_items oi
            GROUP BY oi.order_id
        ) item_counts ON item_counts.order_id = o.id
        WHERE o.restaurant_id = :restaurantId AND o.status = 'CLOSED' AND o.closed_at IS NOT NULL
          AND o.closed_at >= CAST(:fromDate AS timestamp) AND o.closed_at < CAST(:toDate AS timestamp) + INTERVAL '1 day'
        GROUP BY CAST(o.closed_at AS date)
        ORDER BY 1
        """, nativeQuery = true)
    List<Object[]> findDailyOrderAggregates(
        @Param("restaurantId") Long restaurantId,
        @Param("fromDate") LocalDate fromDate,
        @Param("toDate") LocalDate toDate
    );
}

