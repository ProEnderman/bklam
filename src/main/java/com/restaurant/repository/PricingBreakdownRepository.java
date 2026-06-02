package com.restaurant.repository;

import com.restaurant.model.PricingBreakdown;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;

@Repository
public interface PricingBreakdownRepository extends JpaRepository<PricingBreakdown, Long> {

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM PricingBreakdown pb WHERE pb.tariffRule.id IN :ruleIds")
    int deleteByTariffRuleIdIn(@Param("ruleIds") Collection<Long> ruleIds);
}
