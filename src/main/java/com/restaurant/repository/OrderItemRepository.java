package com.restaurant.repository;

import com.restaurant.model.OrderItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface OrderItemRepository extends JpaRepository<OrderItem, Long> {
    
    List<OrderItem> findByOrderId(Long orderId);
    
    @Query("SELECT oi.dish.id, oi.dish.name, SUM(oi.qty), SUM(oi.lineTotal) FROM OrderItem oi " +
           "JOIN oi.order o WHERE " +
           "(:restaurantId IS NULL OR o.restaurant.id = :restaurantId) AND " +
           "o.status = 'CLOSED' AND o.paidAt IS NOT NULL AND " +
           "o.createdAt >= :fromDate AND o.createdAt <= :toDate " +
           "GROUP BY oi.dish.id, oi.dish.name ORDER BY SUM(oi.qty) DESC")
    List<Object[]> getTopDishesBySales(
        @Param("restaurantId") Long restaurantId,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate,
        org.springframework.data.domain.Pageable pageable
    );
}

