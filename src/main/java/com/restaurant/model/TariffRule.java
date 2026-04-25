package com.restaurant.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "tariff_rules")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TariffRule {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tariff_plan_id", nullable = false)
    @JsonIgnore // Игнорируем при десериализации, так как tariffPlan устанавливается в сервисе на основе planId
    private TariffPlan tariffPlan;
    
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "rule_type", nullable = false)
    private RuleType ruleType;
    
    @Column(name = "rule_order", nullable = false)
    private Integer ruleOrder = 0; // Порядок применения правил
    
    // Условия (JSON)
    @Column(columnDefinition = "TEXT")
    private String conditions; // JSON с условиями: день недели, время, услуга, клиент и т.д.
    
    // Формула/ставки (JSON)
    @Column(name = "pricing_formula", columnDefinition = "TEXT")
    private String pricingFormula; // JSON с формулой расчёта
    
    // Округления
    @Enumerated(EnumType.STRING)
    @Column(name = "rounding_type")
    private RoundingType roundingType = RoundingType.STANDARD;
    
    @Column(name = "rounding_precision", precision = 10, scale = 2)
    private BigDecimal roundingPrecision = BigDecimal.valueOf(0.01);
    
    // Минималки/максималки
    @Column(name = "min_amount", precision = 10, scale = 2)
    private BigDecimal minAmount;
    
    @Column(name = "max_amount", precision = 10, scale = 2)
    private BigDecimal maxAmount;
    
    @Column(name = "min_duration_minutes")
    private Integer minDurationMinutes;
    
    @Column(name = "max_duration_minutes")
    private Integer maxDurationMinutes;
    
    // Бесплатные первые N минут/единиц
    @Column(name = "free_minutes")
    private Integer freeMinutes;
    
    @Column(name = "free_units")
    private Integer freeUnits;
    
    @Column(nullable = false)
    private Boolean isActive = true;
    
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
    
    public enum RuleType {
        STANDARD,           // Стандартный тариф (будни)
        WEEKEND,            // Тариф выходного дня
        HOLIDAY,            // Тариф праздничного дня
        SPECIAL             // Спец тариф по условиям
    }
    
    public enum RoundingType {
        STANDARD,           // Округление до 0.01
        UP,                 // Округление вверх
        DOWN,               // Округление вниз
        BANKERS,            // Банковское округление
        TO_ONE              // Округление до 1
    }
}



