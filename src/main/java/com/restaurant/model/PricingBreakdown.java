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
@Table(name = "pricing_breakdowns")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PricingBreakdown {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotNull
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pricing_run_id", nullable = false)
    @JsonIgnore // Предотвращаем циклическую ссылку при сериализации JSON
    private PricingRun pricingRun;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tariff_rule_id")
    private TariffRule tariffRule; // Правило, которое применилось
    
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "line_type", nullable = false)
    private LineType lineType;
    
    @Column(nullable = false)
    private String description; // Описание строки
    
    @Column(name = "rule_reason", columnDefinition = "TEXT")
    private String ruleReason; // Объяснение, почему выбрано это правило
    
    @NotNull
    @Column(name = "amount", precision = 10, scale = 2, nullable = false)
    private BigDecimal amount;
    
    @Column(name = "quantity", precision = 10, scale = 2)
    private BigDecimal quantity; // Количество единиц (минуты, часы и т.д.)
    
    @Column(name = "rate", precision = 10, scale = 2)
    private BigDecimal rate; // Ставка за единицу
    
    @Column(name = "coefficient", precision = 10, scale = 2)
    private BigDecimal coefficient; // Коэффициент (если применялся)
    
    @Column(name = "line_order", nullable = false)
    private Integer lineOrder = 0; // Порядок строки в расчёте
    
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
    
    public enum LineType {
        BASE_RATE,          // Базовая ставка
        TIME_BASED,         // Надбавка за время
        DISCOUNT,           // Скидка
        COEFFICIENT,        // Коэффициент
        TAX,                // Налог/сбор
        MINIMUM,            // Минимальная сумма
        FREE_MINUTES,       // Бесплатные минуты
        OTHER               // Прочее
    }
}



