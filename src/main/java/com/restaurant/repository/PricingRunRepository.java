package com.restaurant.repository;

import com.restaurant.model.PricingRun;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface PricingRunRepository extends JpaRepository<PricingRun, Long> {
    
    List<PricingRun> findByOrderId(Long orderId);
    
    List<PricingRun> findByRestaurantId(Long restaurantId);
    
    @Query("SELECT pr FROM PricingRun pr WHERE " +
           "(:restaurantId IS NULL OR pr.restaurant.id = :restaurantId) AND " +
           "pr.createdAt >= :fromDate AND pr.createdAt <= :toDate")
    List<PricingRun> findByRestaurantAndDateRange(
        @Param("restaurantId") Long restaurantId,
        @Param("fromDate") LocalDateTime fromDate,
        @Param("toDate") LocalDateTime toDate
    );
}




