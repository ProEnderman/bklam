package com.restaurant.repository;

import com.restaurant.model.StockMovement;
import com.restaurant.model.StockMovementReason;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface StockMovementRepository extends JpaRepository<StockMovement, Long> {
    
    Page<StockMovement> findByIngredientId(Long ingredientId, Pageable pageable);
    
    @Query("SELECT DISTINCT sm FROM StockMovement sm JOIN FETCH sm.ingredient i WHERE " +
           "(:restaurantId IS NULL OR i.restaurant.id = :restaurantId) AND " +
           "(:ingredientId IS NULL OR sm.ingredient.id = :ingredientId) AND " +
           "(:type IS NULL OR sm.type = :type) AND " +
           "(:reason IS NULL OR sm.reason = :reason) AND " +
           "sm.createdAt >= :fromDate AND " +
           "sm.createdAt <= :toDate " +
           "ORDER BY sm.createdAt DESC")
    List<StockMovement> findMovementsWithIngredient(
        @Param("restaurantId") Long restaurantId,
        @Param("ingredientId") Long ingredientId,
        @Param("type") String type,
        @Param("reason") String reason,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate
    );
    
    @Query("SELECT COUNT(sm) FROM StockMovement sm JOIN sm.ingredient i WHERE " +
           "(:restaurantId IS NULL OR i.restaurant.id = :restaurantId) AND " +
           "(:ingredientId IS NULL OR sm.ingredient.id = :ingredientId) AND " +
           "(:type IS NULL OR sm.type = :type) AND " +
           "(:reason IS NULL OR sm.reason = :reason) AND " +
           "sm.createdAt >= :fromDate AND " +
           "sm.createdAt <= :toDate")
    long countMovements(
        @Param("restaurantId") Long restaurantId,
        @Param("ingredientId") Long ingredientId,
        @Param("type") String type,
        @Param("reason") String reason,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate
    );
    
    @Query("SELECT sm.ingredient.id, SUM(sm.qty) FROM StockMovement sm WHERE " +
           "(:restaurantId IS NULL OR sm.ingredient.restaurant.id = :restaurantId) AND " +
           "sm.type = 'OUT' AND sm.reason = :reason AND " +
           "sm.createdAt >= :fromDate AND sm.createdAt <= :toDate " +
           "GROUP BY sm.ingredient.id")
    List<Object[]> getIngredientUsageByReason(
        @Param("restaurantId") Long restaurantId,
        @Param("reason") StockMovementReason reason,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate
    );
    
    @Query("SELECT sm.ingredient.id, SUM(sm.qty) FROM StockMovement sm WHERE " +
           "(:restaurantId IS NULL OR sm.ingredient.restaurant.id = :restaurantId) AND " +
           "sm.type = 'OUT' AND sm.reason = 'SALE' AND " +
           "sm.createdAt >= :fromDate AND sm.createdAt <= :toDate " +
           "GROUP BY sm.ingredient.id")
    List<Object[]> getIngredientUsageForSales(
        @Param("restaurantId") Long restaurantId,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate
    );

    /** Clear order_id for all stock movements linked to the given order (so the order can be deleted). */
    @Modifying
    @Query("UPDATE StockMovement sm SET sm.orderId = null WHERE sm.orderId = :orderId")
    void clearOrderIdByOrderId(@Param("orderId") Long orderId);
}

