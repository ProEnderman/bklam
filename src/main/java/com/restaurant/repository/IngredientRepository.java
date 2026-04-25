package com.restaurant.repository;

import com.restaurant.model.Ingredient;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface IngredientRepository extends JpaRepository<Ingredient, Long> {
    
    Page<Ingredient> findByNameContainingIgnoreCase(String name, Pageable pageable);
    
    @Query("SELECT i FROM Ingredient i WHERE i.stockQty < i.minQty")
    List<Ingredient> findIngredientsBelowMinimum();
    
    @Query(value = "SELECT * FROM ingredients WHERE " +
           "(:restaurantId IS NULL OR restaurant_id = CAST(:restaurantId AS BIGINT)) AND " +
           "(:name IS NULL OR :name = '' OR CAST(name AS TEXT) ILIKE '%' || CAST(:name AS TEXT) || '%') AND " +
           "((:belowMinStr IS NULL OR :belowMinStr = 'false') OR stock_qty < min_qty)",
           nativeQuery = true,
           countQuery = "SELECT COUNT(*) FROM ingredients WHERE " +
           "(:restaurantId IS NULL OR restaurant_id = CAST(:restaurantId AS BIGINT)) AND " +
           "(:name IS NULL OR :name = '' OR CAST(name AS TEXT) ILIKE '%' || CAST(:name AS TEXT) || '%') AND " +
           "((:belowMinStr IS NULL OR :belowMinStr = 'false') OR stock_qty < min_qty)")
    Page<Ingredient> searchIngredients(
        @Param("restaurantId") Long restaurantId,
        @Param("name") String name,
        @Param("belowMinStr") String belowMinStr,
        Pageable pageable
    );
    
    @Query("SELECT i FROM Ingredient i WHERE " +
           "(:restaurantId IS NULL OR i.restaurant.id = :restaurantId) AND " +
           "i.stockQty IS NOT NULL AND i.minQty IS NOT NULL AND " +
           "i.stockQty < i.minQty")
    List<Ingredient> findIngredientsBelowMinimum(@Param("restaurantId") Long restaurantId);
    
    @Query("SELECT CASE WHEN COUNT(i) > 0 THEN TRUE ELSE FALSE END FROM Ingredient i WHERE " +
           "(:restaurantId IS NULL OR i.restaurant.id = :restaurantId) AND " +
           "LOWER(i.name) = LOWER(:name)")
    boolean existsByNameIgnoreCase(@Param("restaurantId") Long restaurantId, @Param("name") String name);
    
    @Query("SELECT i FROM Ingredient i WHERE " +
           "i.restaurant.id = :restaurantId AND " +
           "LOWER(i.name) = LOWER(:name)")
    java.util.Optional<Ingredient> findByNameAndRestaurantId(
        @Param("name") String name,
        @Param("restaurantId") Long restaurantId
    );
}

