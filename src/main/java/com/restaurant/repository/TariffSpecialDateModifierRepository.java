package com.restaurant.repository;

import com.restaurant.model.TariffSpecialDateModifier;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface TariffSpecialDateModifierRepository extends JpaRepository<TariffSpecialDateModifier, Long> {
    
    @Query("SELECT m FROM TariffSpecialDateModifier m WHERE m.tariffPlan.id = :tariffPlanId")
    List<TariffSpecialDateModifier> findByTariffPlanId(@Param("tariffPlanId") Long tariffPlanId);
    
    @Query("SELECT m FROM TariffSpecialDateModifier m WHERE m.tariffPlan.id = :tariffPlanId AND m.date = :date")
    Optional<TariffSpecialDateModifier> findByTariffPlanIdAndDate(@Param("tariffPlanId") Long tariffPlanId, 
                                                                   @Param("date") LocalDate date);
    
    @Query("SELECT m FROM TariffSpecialDateModifier m WHERE m.tariffPlan.id = :tariffPlanId AND m.date = :date")
    Optional<TariffSpecialDateModifier> findModifierForDate(@Param("tariffPlanId") Long tariffPlanId, 
                                                             @Param("date") LocalDate date);
    
    @Modifying
    @Query("DELETE FROM TariffSpecialDateModifier m WHERE m.tariffPlan.id = :tariffPlanId")
    void deleteByTariffPlanId(@Param("tariffPlanId") Long tariffPlanId);
}



