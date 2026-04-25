package com.restaurant.repository;

import com.restaurant.model.OrderShare;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface OrderShareRepository extends JpaRepository<OrderShare, Long> {

    @Query("SELECT DISTINCT s FROM OrderShare s LEFT JOIN FETCH s.guest LEFT JOIN FETCH s.shareItems si LEFT JOIN FETCH si.orderItem oi LEFT JOIN FETCH oi.dish WHERE s.order.id = :orderId")
    List<OrderShare> findByOrderIdWithItems(@Param("orderId") Long orderId);

    @Modifying
    @Query("DELETE FROM OrderShare s WHERE s.order.id = :orderId")
    void deleteByOrderId(@Param("orderId") Long orderId);

    @Query("SELECT COUNT(s) > 0 FROM OrderShare s WHERE s.order.id = :orderId")
    boolean existsByOrderId(@Param("orderId") Long orderId);

    @Query("SELECT DISTINCT s.order.id FROM OrderShare s WHERE s.order.id IN :orderIds")
    List<Long> findOrderIdsWithSplit(@Param("orderIds") List<Long> orderIds);

    long countByOrder_Id(Long orderId);

    @Query("SELECT s.order.id, COUNT(s) FROM OrderShare s WHERE s.order.id IN :orderIds GROUP BY s.order.id")
    List<Object[]> countSharesByOrderIdIn(@Param("orderIds") Collection<Long> orderIds);
}
