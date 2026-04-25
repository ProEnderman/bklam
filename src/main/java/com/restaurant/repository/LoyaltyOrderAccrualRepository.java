package com.restaurant.repository;

import com.restaurant.model.LoyaltyOrderAccrual;
import com.restaurant.model.LoyaltyOrderAccrualId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface LoyaltyOrderAccrualRepository extends JpaRepository<LoyaltyOrderAccrual, LoyaltyOrderAccrualId> {

    boolean existsByRestaurantIdAndOrderId(Long restaurantId, Long orderId);

    boolean existsByRestaurantIdAndOrderIdAndStatus(Long restaurantId, Long orderId, String status);

    @Modifying
    @Query(value = """
        INSERT INTO loyalty_order_accruals (restaurant_id, order_id, status, created_at, updated_at)
        VALUES (:restaurantId, :orderId, 'PROCESSED', now(), now())
        ON CONFLICT (restaurant_id, order_id)
        DO UPDATE SET status = 'PROCESSED', updated_at = now()
        """, nativeQuery = true)
    void upsertProcessed(@Param("restaurantId") Long restaurantId, @Param("orderId") Long orderId);
}
