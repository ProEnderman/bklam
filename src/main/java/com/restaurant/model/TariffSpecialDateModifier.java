package com.restaurant.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
@Table(name = "tariff_special_date_modifiers", 
       uniqueConstraints = @UniqueConstraint(columnNames = {"tariff_plan_id", "date"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class TariffSpecialDateModifier {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tariff_plan_id", nullable = false)
    @JsonIgnore // Игнорируем при сериализации, так как у нас уже есть tariffPlanId в интерфейсе
    private TariffPlan tariffPlan;
    
    @Column(nullable = false)
    private LocalDate date; // YYYY-MM-DD
    
    @Enumerated(EnumType.STRING)
    @Column(name = "modifier_type", nullable = false)
    private ModifierType modifierType = ModifierType.PERCENT_INCREASE;
    
    @Column(name = "modifier_value", nullable = false, precision = 10, scale = 4)
    private BigDecimal modifierValue = BigDecimal.ZERO; // Значение всегда положительное (процент или сумма)
    
    // Переопределение времени работы для конкретной даты (null = использовать стандартное из тарифного плана)
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "HH:mm")
    @Column(name = "booking_time_from")
    private LocalTime bookingTimeFrom;
    
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "HH:mm")
    @Column(name = "booking_time_to")
    private LocalTime bookingTimeTo;
    
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
    
    // Геттер для получения tariffPlanId для JSON сериализации
    public Long getTariffPlanId() {
        return tariffPlan != null ? tariffPlan.getId() : null;
    }
    
    public enum ModifierType {
        PERCENT_INCREASE,   // Увеличение на процент: +20% (значение = 20)
        PERCENT_DECREASE,   // Уменьшение на процент: -10% (значение = 10)
        FIXED_INCREASE,     // Увеличение на фиксированную сумму: +500₽ (значение = 500)
        FIXED_DECREASE      // Уменьшение на фиксированную сумму: -200₽ (значение = 200)
    }
}



