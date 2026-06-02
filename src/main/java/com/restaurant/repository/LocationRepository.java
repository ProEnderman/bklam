package com.restaurant.repository;

import com.restaurant.model.Location;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface LocationRepository extends JpaRepository<Location, Long> {
    List<Location> findByHoldingId(Long holdingId);

    Optional<Location> findByLegacyRestaurant_Id(Long legacyRestaurantId);

    /** Single query; avoids LazyInitializationException when resolving tenant outside an open persistence context. */
    @Query("SELECT lr.id FROM Location l JOIN l.legacyRestaurant lr WHERE l.id = :locationId")
    Optional<Long> findLegacyRestaurantIdByLocationId(@Param("locationId") Long locationId);

    String LOCATION_FETCH = "SELECT DISTINCT l FROM Location l "
            + "LEFT JOIN FETCH l.holding LEFT JOIN FETCH l.brand LEFT JOIN FETCH l.legalEntity LEFT JOIN FETCH l.legacyRestaurant ";

    @Query(LOCATION_FETCH + "WHERE l.id = :id")
    Optional<Location> findByIdWithAssociations(@Param("id") Long id);

    @Query(LOCATION_FETCH + "WHERE l.holding.id = :holdingId")
    List<Location> findByHoldingIdWithAssociations(@Param("holdingId") Long holdingId);

    @Query(LOCATION_FETCH)
    List<Location> findAllWithAssociations();

    @Query(LOCATION_FETCH + "WHERE l.legacyRestaurant.id = :restaurantId")
    Optional<Location> findByLegacyRestaurantIdWithAssociations(@Param("restaurantId") Long restaurantId);
}
