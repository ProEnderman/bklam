package com.restaurant.repository;

import com.restaurant.model.Dish;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DishRepository extends JpaRepository<Dish, Long> {
    
    Page<Dish> findByNameContainingIgnoreCaseAndIsActiveTrue(String name, Pageable pageable);
    
    @Query(value = "SELECT * FROM dishes WHERE " +
           "(:restaurantId IS NULL OR restaurant_id = :restaurantId) AND " +
           "(:searchLikePattern IS NULL OR " +
           "CAST(name_search_key AS TEXT) LIKE CAST(:searchLikePattern AS TEXT) ESCAPE '!') AND " +
           "(:isActive IS NULL OR is_active = :isActive)",
           nativeQuery = true,
           countQuery = "SELECT COUNT(*) FROM dishes WHERE " +
           "(:restaurantId IS NULL OR restaurant_id = :restaurantId) AND " +
           "(:searchLikePattern IS NULL OR " +
           "CAST(name_search_key AS TEXT) LIKE CAST(:searchLikePattern AS TEXT) ESCAPE '!') AND " +
           "(:isActive IS NULL OR is_active = :isActive)")
    Page<Dish> searchDishes(
        @Param("restaurantId") Long restaurantId,
        @Param("searchLikePattern") String searchLikePattern,
        @Param("isActive") Boolean isActive,
        Pageable pageable
    );
    
    @Query(value = "SELECT CASE WHEN COUNT(*) > 0 THEN TRUE ELSE FALSE END FROM dishes WHERE " +
           "(:restaurantId IS NULL OR restaurant_id = :restaurantId) AND " +
           "name_search_key = CAST(:normalizedKey AS TEXT) AND " +
           "is_active = TRUE",
           nativeQuery = true)
    boolean existsByNameIgnoreCase(@Param("restaurantId") Long restaurantId, @Param("normalizedKey") String normalizedKey);
    
    @Query("SELECT COUNT(d) FROM Dish d WHERE d.category.id = :categoryId")
    long countByCategoryId(@Param("categoryId") Long categoryId);
    
    @Query("SELECT d FROM Dish d WHERE " +
           "(:restaurantId IS NULL OR d.restaurant.id = :restaurantId) AND " +
           "(:categoryId IS NULL OR d.category.id = :categoryId) AND " +
           "(:isActive IS NULL OR d.isActive = :isActive) " +
           "ORDER BY d.name ASC")
    java.util.List<Dish> findByRestaurantIdAndCategoryId(
        @Param("restaurantId") Long restaurantId,
        @Param("categoryId") Long categoryId,
        @Param("isActive") Boolean isActive
    );
    
    @Query("SELECT d FROM Dish d LEFT JOIN FETCH d.category WHERE d.id = :id")
    java.util.Optional<Dish> findByIdWithCategory(@Param("id") Long id);

    @Query("SELECT MAX(d.updatedAt) FROM Dish d WHERE d.restaurant.id = :restaurantId")
    java.time.LocalDateTime findMaxUpdatedAtByRestaurantId(@Param("restaurantId") Long restaurantId);
}

