package com.restaurant.repository;

import com.restaurant.model.Location;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface LocationRepository extends JpaRepository<Location, Long> {
    List<Location> findByHoldingId(Long holdingId);

    Optional<Location> findByLegacyRestaurant_Id(Long legacyRestaurantId);

    @Query("SELECT l FROM Location l LEFT JOIN FETCH l.holding WHERE l.legacyRestaurant.id = :restaurantId")
    Optional<Location> findByLegacyRestaurantIdJoinHolding(Long restaurantId);
}
