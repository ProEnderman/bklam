package com.restaurant.repository.loyalty;

import com.restaurant.model.loyalty.Achievement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AchievementRepository extends JpaRepository<Achievement, Long> {

    @Query("SELECT a FROM Achievement a WHERE a.restaurant.id = :restaurantId")
    List<Achievement> findByRestaurantId(@Param("restaurantId") Long restaurantId);
}
