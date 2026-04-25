package com.restaurant.repository;

import com.restaurant.model.TariffPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface TariffPlanRepository extends JpaRepository<TariffPlan, Long> {
    
    List<TariffPlan> findByRestaurantIdAndIsActiveTrue(Long restaurantId);
    
    List<TariffPlan> findByRestaurantId(Long restaurantId);
    
    @Query("SELECT tp FROM TariffPlan tp WHERE " +
           "(:restaurantId IS NULL OR tp.restaurant.id = :restaurantId) AND " +
           "tp.isActive = true AND " +
           "(tp.validFrom IS NULL OR tp.validFrom <= :date) AND " +
           "(tp.validTo IS NULL OR tp.validTo >= :date)")
    List<TariffPlan> findActivePlansForDate(
        @Param("restaurantId") Long restaurantId,
        @Param("date") LocalDate date
    );
    
    List<TariffPlan> findByCalendarId(Long calendarId);
}

