package com.restaurant.repository;

import com.restaurant.model.HallAsset;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface HallAssetRepository extends JpaRepository<HallAsset, Long> {
    @Query("SELECT a FROM HallAsset a WHERE a.restaurant.id = :restaurantId ORDER BY a.id ASC")
    List<HallAsset> findByRestaurantIdOrderByIdAsc(@Param("restaurantId") Long restaurantId);

    @Query("SELECT a FROM HallAsset a WHERE a.restaurant.id = :restaurantId AND a.name = :name")
    Optional<HallAsset> findByRestaurantIdAndName(@Param("restaurantId") Long restaurantId, @Param("name") String name);
}


