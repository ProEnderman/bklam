package com.restaurant.repository;

import com.restaurant.model.DishOptionGroup;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DishOptionGroupRepository extends JpaRepository<DishOptionGroup, Long> {
    List<DishOptionGroup> findByDishIdAndIsActiveTrueOrderBySortOrderAsc(Long dishId);
    List<DishOptionGroup> findByDishIdInAndIsActiveTrueOrderBySortOrderAsc(List<Long> dishIds);
}
