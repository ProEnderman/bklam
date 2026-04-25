package com.restaurant.repository;

import com.restaurant.model.HallMap;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface HallMapRepository extends JpaRepository<HallMap, Long> {
    @Query("SELECT m FROM HallMap m WHERE m.restaurant.id = :restaurantId ORDER BY m.id ASC")
    Optional<HallMap> findFirstByRestaurantIdOrderByIdAsc(@Param("restaurantId") Long restaurantId);
}


