package com.restaurant.service;

import com.restaurant.model.TariffPlan;
import com.restaurant.model.TariffRule;
import com.restaurant.model.Calendar;
import com.restaurant.repository.*;
import com.restaurant.security.SecurityUtils;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class TariffService {
    
    private final TariffPlanRepository tariffPlanRepository;
    private final TariffRuleRepository tariffRuleRepository;
    private final CalendarRepository calendarRepository;
    private final RestaurantRepository restaurantRepository;
    private final Validator validator;
    private final ActivityLogService activityLogService;
    
    // Tariff Plans
    @Transactional(readOnly = true)
    public Page<TariffPlan> getTariffPlans(Long restaurantId, Boolean isActive, Pageable pageable) {
        Long currentRestaurantId = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        List<TariffPlan> plans;
        if (isActive != null && isActive) {
            plans = tariffPlanRepository.findByRestaurantIdAndIsActiveTrue(currentRestaurantId);
        } else {
            plans = tariffPlanRepository.findByRestaurantId(currentRestaurantId);
        }
        // Инициализируем ленивые связи и коллекции в рамках транзакции
        plans.forEach(plan -> {
            if (plan.getRestaurant() != null) {
                plan.getRestaurant().getName(); // Инициализируем прокси Restaurant
            }
            if (plan.getCalendar() != null) {
                Calendar calendar = plan.getCalendar();
                if (calendar.getSpecialDates() != null) {
                    calendar.getSpecialDates().size(); // Инициализируем коллекцию
                }
            }
        });
        // Простая пагинация вручную
        int start = (int) pageable.getOffset();
        int end = Math.min(start + pageable.getPageSize(), plans.size());
        List<TariffPlan> pagedPlans = start < plans.size() ? plans.subList(start, end) : new java.util.ArrayList<>();
        return new org.springframework.data.domain.PageImpl<>(pagedPlans, pageable, plans.size());
    }
    
    @Transactional(readOnly = true)
    public TariffPlan getTariffPlanById(Long id) {
        TariffPlan plan = tariffPlanRepository.findById(id)
            .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Tariff plan not found"));
        // Инициализируем ленивые связи и коллекции в рамках транзакции
        if (plan.getRestaurant() != null) {
            plan.getRestaurant().getName(); // Инициализируем прокси Restaurant
        }
        if (plan.getCalendar() != null) {
            Calendar calendar = plan.getCalendar();
            if (calendar.getSpecialDates() != null) {
                calendar.getSpecialDates().size(); // Инициализируем коллекцию
            }
        }
        return plan;
    }
    
    @Transactional
    public TariffPlan createTariffPlan(TariffPlan plan) {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        if (restaurantId != null) {
            plan.setRestaurant(restaurantRepository.findById(restaurantId).orElse(null));
        }
        // Устанавливаем календарь, если указан
        if (plan.getCalendar() != null && plan.getCalendar().getId() != null) {
            Calendar calendar = calendarRepository.findById(plan.getCalendar().getId())
                .orElse(null);
            plan.setCalendar(calendar);
        }
        TariffPlan saved = tariffPlanRepository.save(plan);
        // Инициализируем коллекцию после сохранения
        if (saved.getCalendar() != null && saved.getCalendar().getSpecialDates() != null) {
            saved.getCalendar().getSpecialDates().size();
        }
        
        try {
            activityLogService.logActivity(
                "CREATE", "TARIFF_PLAN", saved.getId(), null,
                String.format("Создан тарифный план: %s", saved.getName()),
                null,
                Map.of("name", saved.getName(),
                       "isActive", saved.getIsActive() != null ? saved.getIsActive() : true)
            );
        } catch (Exception e) {
            log.error("Failed to log tariff plan create: {}", e.getMessage());
        }
        
        return saved;
    }
    
    @Transactional
    public TariffPlan updateTariffPlan(Long id, TariffPlan plan) {
        TariffPlan existing = getTariffPlanById(id);
        existing.setName(plan.getName());
        existing.setDescription(plan.getDescription());
        existing.setIsActive(plan.getIsActive() != null ? plan.getIsActive() : existing.getIsActive());
        existing.setValidFrom(plan.getValidFrom());
        existing.setValidTo(plan.getValidTo());
        existing.setBookingTimeFrom(plan.getBookingTimeFrom());
        existing.setBookingTimeTo(plan.getBookingTimeTo());
        // Обновляем календарь, если указан
        if (plan.getCalendar() != null && plan.getCalendar().getId() != null) {
            Calendar calendar = calendarRepository.findById(plan.getCalendar().getId())
                .orElse(null);
            existing.setCalendar(calendar);
        } else if (plan.getCalendar() == null) {
            existing.setCalendar(null);
        }
        TariffPlan saved = tariffPlanRepository.save(existing);
        // Инициализируем коллекцию после сохранения
        if (saved.getRestaurant() != null) {
            saved.getRestaurant().getName(); // Инициализируем прокси Restaurant
        }
        if (saved.getCalendar() != null && saved.getCalendar().getSpecialDates() != null) {
            saved.getCalendar().getSpecialDates().size();
        }
        
        try {
            activityLogService.logActivity(
                "UPDATE", "TARIFF_PLAN", saved.getId(), null,
                String.format("Обновлён тарифный план: %s", saved.getName()),
                null,
                Map.of("name", saved.getName(),
                       "isActive", saved.getIsActive() != null ? saved.getIsActive() : true)
            );
        } catch (Exception e) {
            log.error("Failed to log tariff plan update: {}", e.getMessage());
        }
        
        return saved;
    }
    
    @Transactional
    public void deleteTariffPlan(Long id) {
        try {
            activityLogService.logActivity(
                "DELETE", "TARIFF_PLAN", id, null,
                String.format("Удалён тарифный план #%d", id),
                null, null
            );
        } catch (Exception e) {
            log.error("Failed to log tariff plan delete: {}", e.getMessage());
        }
        tariffPlanRepository.deleteById(id);
    }
    
    // Tariff Rules
    @Transactional(readOnly = true)
    public List<TariffRule> getTariffRules(Long planId) {
        return tariffRuleRepository.findByTariffPlanIdOrderByRuleOrderAsc(planId);
    }
    
    @Transactional
    public TariffRule createTariffRule(Long planId, TariffRule rule) {
        TariffPlan plan = getTariffPlanById(planId);
        rule.setTariffPlan(plan);
        
        // Валидируем после установки tariffPlan
        Set<ConstraintViolation<TariffRule>> violations = validator.validate(rule);
        if (!violations.isEmpty()) {
            StringBuilder sb = new StringBuilder("Validation failed: ");
            violations.forEach(v -> sb.append(v.getPropertyPath()).append(": ").append(v.getMessage()).append("; "));
            throw new IllegalArgumentException(sb.toString());
        }
        
        TariffRule savedRule = tariffRuleRepository.save(rule);
        
        try {
            activityLogService.logActivity(
                "CREATE", "TARIFF_RULE", savedRule.getId(), null,
                String.format("Создано правило тарифа для плана #%d, тип=%s", planId,
                    savedRule.getRuleType() != null ? savedRule.getRuleType().toString() : ""),
                null,
                Map.of("ruleType", savedRule.getRuleType() != null ? savedRule.getRuleType().toString() : "",
                       "tariffPlanId", planId)
            );
        } catch (Exception e) {
            log.error("Failed to log tariff rule create: {}", e.getMessage());
        }
        
        return savedRule;
    }
    
    @Transactional
    public TariffRule updateTariffRule(Long id, TariffRule rule) {
        TariffRule existing = tariffRuleRepository.findById(id)
            .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Tariff rule not found"));
        if (rule.getRuleType() != null) existing.setRuleType(rule.getRuleType());
        if (rule.getRuleOrder() != null) existing.setRuleOrder(rule.getRuleOrder());
        if (rule.getConditions() != null) existing.setConditions(rule.getConditions());
        if (rule.getPricingFormula() != null) existing.setPricingFormula(rule.getPricingFormula());
        if (rule.getRoundingType() != null) existing.setRoundingType(rule.getRoundingType());
        if (rule.getRoundingPrecision() != null) existing.setRoundingPrecision(rule.getRoundingPrecision());
        if (rule.getMinAmount() != null) existing.setMinAmount(rule.getMinAmount());
        if (rule.getMaxAmount() != null) existing.setMaxAmount(rule.getMaxAmount());
        if (rule.getMinDurationMinutes() != null) existing.setMinDurationMinutes(rule.getMinDurationMinutes());
        if (rule.getMaxDurationMinutes() != null) existing.setMaxDurationMinutes(rule.getMaxDurationMinutes());
        if (rule.getFreeMinutes() != null) existing.setFreeMinutes(rule.getFreeMinutes());
        if (rule.getFreeUnits() != null) existing.setFreeUnits(rule.getFreeUnits());
        if (rule.getIsActive() != null) existing.setIsActive(rule.getIsActive());
        TariffRule savedExisting = tariffRuleRepository.save(existing);
        
        try {
            activityLogService.logActivity(
                "UPDATE", "TARIFF_RULE", savedExisting.getId(), null,
                String.format("Обновлено правило тарифа #%d", savedExisting.getId()),
                null,
                Map.of("ruleType", savedExisting.getRuleType() != null ? savedExisting.getRuleType().toString() : "",
                       "isActive", savedExisting.getIsActive() != null ? savedExisting.getIsActive() : true)
            );
        } catch (Exception e) {
            log.error("Failed to log tariff rule update: {}", e.getMessage());
        }
        
        return savedExisting;
    }
    
    @Transactional
    public void deleteTariffRule(Long id) {
        try {
            activityLogService.logActivity(
                "DELETE", "TARIFF_RULE", id, null,
                String.format("Удалено правило тарифа #%d", id),
                null, null
            );
        } catch (Exception e) {
            log.error("Failed to log tariff rule delete: {}", e.getMessage());
        }
        tariffRuleRepository.deleteById(id);
    }
    
}

