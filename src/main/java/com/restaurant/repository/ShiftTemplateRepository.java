package com.restaurant.repository;

import com.restaurant.model.ShiftTemplate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ShiftTemplateRepository extends JpaRepository<ShiftTemplate, Long> {
    
    List<ShiftTemplate> findByRestaurantIdAndIsActiveTrue(Long restaurantId);
    
    List<ShiftTemplate> findByRestaurantId(Long restaurantId);
}




