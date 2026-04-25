package com.restaurant.repository;

import com.restaurant.model.DishIngredient;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DishIngredientRepository extends JpaRepository<DishIngredient, Long> {
    
    List<DishIngredient> findByDishId(Long dishId);
    
    @Query("SELECT di FROM DishIngredient di JOIN FETCH di.ingredient WHERE di.dish.id = :dishId")
    List<DishIngredient> findByDishIdWithIngredient(@Param("dishId") Long dishId);
    
    @Modifying
    @Query("DELETE FROM DishIngredient di WHERE di.dish.id = :dishId")
    void deleteByDishId(@Param("dishId") Long dishId);
    
    boolean existsByDishIdAndIngredientId(Long dishId, Long ingredientId);
}

