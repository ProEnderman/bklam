package com.restaurant.repository.loyalty;

import com.restaurant.model.loyalty.Guest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GuestRepository extends JpaRepository<Guest, Long> {

    @Query("SELECT g FROM Guest g WHERE g.restaurant.id = :restaurantId AND g.phoneNormalized = :phoneNormalized")
    Optional<Guest> findByRestaurantIdAndPhoneNormalized(@Param("restaurantId") Long restaurantId, @Param("phoneNormalized") String phoneNormalized);

    @Query("SELECT g FROM Guest g WHERE g.restaurant.id = :restaurantId AND " +
           "(g.phoneNormalized LIKE CONCAT('%',:query,'%') OR LOWER(g.name) LIKE LOWER(CONCAT('%',:query,'%')) OR LOWER(g.email) LIKE LOWER(CONCAT('%',:query,'%')))")
    Page<Guest> searchGuests(@Param("restaurantId") Long restaurantId, @Param("query") String query, Pageable pageable);

    @Query("SELECT g FROM Guest g WHERE g.restaurant.id = :restaurantId")
    Page<Guest> findByRestaurantId(@Param("restaurantId") Long restaurantId, Pageable pageable);

    @Query("SELECT g FROM Guest g WHERE g.restaurant.id = :restaurantId")
    List<Guest> findAllByRestaurantId(@Param("restaurantId") Long restaurantId);

    @Query("SELECT COUNT(g) FROM Guest g WHERE g.restaurant.id = :restaurantId")
    long countByRestaurantId(@Param("restaurantId") Long restaurantId);
}
