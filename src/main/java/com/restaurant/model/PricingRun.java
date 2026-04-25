package com.restaurant.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "pricing_runs")
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class PricingRun {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id")
    @JsonIgnore // Предотвращаем сериализацию lazy-loaded связи
    private Order order; // Связь с заказом (если есть)
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "restaurant_id")
    @JsonIgnore // Предотвращаем сериализацию lazy-loaded связи
    private Restaurant restaurant;
    
    // Входные параметры (JSON)
    @Column(name = "input_params", columnDefinition = "TEXT")
    private String inputParams; // JSON с входными параметрами
    
    // Время начала и окончания услуги
    @Column(name = "service_start")
    private LocalDateTime serviceStart;
    
    @Column(name = "service_end")
    private LocalDateTime serviceEnd;
    
    // Применённые правила (JSON массив ID правил)
    @Column(name = "applied_rules", columnDefinition = "TEXT")
    private String appliedRules; // JSON массив ID правил в порядке применения
    
    // Версии тарифов на момент расчёта (JSON)
    @Column(name = "tariff_versions", columnDefinition = "TEXT")
    private String tariffVersions; // JSON с версиями тарифов
    
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private PricingStatus status = PricingStatus.OK;
    
    @Column(name = "stop_reason")
    private String stopReason; // Причина остановки (если status = STOP)
    
    @NotNull
    @Column(name = "total_amount", precision = 10, scale = 2, nullable = false)
    private BigDecimal totalAmount = BigDecimal.ZERO;
    
    @Column(name = "base_amount", precision = 10, scale = 2)
    private BigDecimal baseAmount;
    
    @Column(name = "discount_amount", precision = 10, scale = 2)
    private BigDecimal discountAmount = BigDecimal.ZERO;
    
    @Column(name = "tax_amount", precision = 10, scale = 2)
    private BigDecimal taxAmount = BigDecimal.ZERO;
    
    @OneToMany(mappedBy = "pricingRun", cascade = CascadeType.ALL, orphanRemoval = true)
    @JsonIgnore // Предотвращаем сериализацию lazy-loaded коллекции
    private List<PricingBreakdown> breakdowns = new ArrayList<>();
    
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
    
    public enum PricingStatus {
        OK,         // Расчёт успешен
        STOP,       // Остановлен стоп-чеком
        ERROR       // Ошибка расчёта
    }
}



