package com.restaurant.repository.loyalty;

import com.restaurant.model.loyalty.Mission;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface MissionRepository extends JpaRepository<Mission, Long> {

    @Query("SELECT m FROM Mission m WHERE m.restaurant.id = :restaurantId")
    List<Mission> findByRestaurantId(@Param("restaurantId") Long restaurantId);

    @Query("SELECT m FROM Mission m WHERE m.restaurant.id = :restaurantId AND m.status = 'ACTIVE' " +
           "AND (m.validFrom IS NULL OR m.validFrom <= :now) " +
           "AND (m.validTo IS NULL OR m.validTo >= :now)")
    List<Mission> findActiveMissions(@Param("restaurantId") Long restaurantId, @Param("now") LocalDateTime now);
}
