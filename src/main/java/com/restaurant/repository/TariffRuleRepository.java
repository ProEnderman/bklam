package com.restaurant.repository;

import com.restaurant.model.TariffRule;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TariffRuleRepository extends JpaRepository<TariffRule, Long> {
    
    List<TariffRule> findByTariffPlanIdAndIsActiveTrueOrderByRuleOrderAsc(Long tariffPlanId);
    
    List<TariffRule> findByTariffPlanIdOrderByRuleOrderAsc(Long tariffPlanId);
}



