package com.restaurant.repository;

import com.restaurant.model.DishCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DishCategoryRepository extends JpaRepository<DishCategory, Long> {
    
    @Query("SELECT c FROM DishCategory c WHERE " +
           "(:restaurantId IS NULL OR c.restaurant.id = :restaurantId) " +
           "ORDER BY c.name ASC")
    List<DishCategory> findByRestaurantId(@Param("restaurantId") Long restaurantId);
    
    @Query("SELECT CASE WHEN COUNT(c) > 0 THEN TRUE ELSE FALSE END FROM DishCategory c WHERE " +
           "c.name = :name AND c.restaurant.id = :restaurantId")
    boolean existsByNameAndRestaurantId(@Param("name") String name, @Param("restaurantId") Long restaurantId);

    @Query("SELECT MAX(c.updatedAt) FROM DishCategory c WHERE c.restaurant.id = :restaurantId")
    java.time.LocalDateTime findMaxUpdatedAtByRestaurantId(@Param("restaurantId") Long restaurantId);
}

