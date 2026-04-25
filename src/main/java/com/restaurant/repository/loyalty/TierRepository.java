package com.restaurant.repository.loyalty;

import com.restaurant.model.loyalty.Tier;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TierRepository extends JpaRepository<Tier, Long> {

    @Query("SELECT t FROM Tier t WHERE t.restaurant.id = :restaurantId ORDER BY t.level ASC")
    List<Tier> findByRestaurantIdOrderByLevelAsc(@Param("restaurantId") Long restaurantId);
}
