package com.restaurant.repository;

import com.restaurant.model.PermissionTemplate;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PermissionTemplateRepository extends JpaRepository<PermissionTemplate, Long> {

    @EntityGraph(attributePaths = {"restaurant"})
    List<PermissionTemplate> findByRestaurant_IdOrderByNameAsc(Long restaurantId);

    Optional<PermissionTemplate> findByIdAndRestaurant_Id(Long id, Long restaurantId);

    boolean existsByRestaurant_IdAndNameIgnoreCase(Long restaurantId, String name);

    boolean existsByRestaurant_IdAndNameIgnoreCaseAndIdNot(Long restaurantId, String name, Long id);
}
