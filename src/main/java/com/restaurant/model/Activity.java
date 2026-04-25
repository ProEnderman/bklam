package com.restaurant.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "activities")
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class Activity {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "organization_id")
    private Long organizationId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Restaurant branch; // Филиал/ресторан
    
    // Метод для получения ID филиала без загрузки объекта
    public Long getBranchId() {
        return branch != null ? branch.getId() : null;
    }
    
    @NotNull
    @Column(nullable = false)
    private String name; // "Бильярд", "Кинозал", "Караоке"
    
    @Column(columnDefinition = "TEXT")
    private String description;
    
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ActivityStatus status = ActivityStatus.ACTIVE;
    
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "booking_mode", nullable = false)
    private BookingMode bookingMode = BookingMode.CAPACITY;
    
    @NotNull
    @Column(name = "concurrent_limit", nullable = false)
    private Integer concurrentLimit = 1; // Лимит параллельных записей
    
    @NotNull
    @Column(name = "requires_resource", nullable = false)
    private Boolean requiresResource = false; // Нужно ли бронировать конкретный ресурс
    
    @NotNull
    @Column(name = "gap_filler", nullable = false)
    private Boolean gapFiller = false; // Поминутная/почасовая оплата для заполнения пробелов

    /**
     * Полная бронь площадки: пока действует такая бронь, параллельно нельзя бронировать ни это мероприятие (кроме одной записи),
     * ни любое другое мероприятие филиала. Взаимоисключающе с другими полными бронями по времени.
     */
    @NotNull
    @Column(name = "full_venue_lock", nullable = false)
    private Boolean fullVenueLock = false;

    @Column(name = "stop_check_hours")
    private Double stopCheckHours; // Стоп-чек: после N часов пребывания дальнейшее посещение бесплатно
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tariff_plan_id")
    private TariffPlan tariffPlan; // Связь с тарифным планом
    
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
    
    public enum ActivityStatus {
        ACTIVE,
        INACTIVE
    }
    
    public enum BookingMode {
        CAPACITY,    // Разрешены параллельные записи до лимита
        EXCLUSIVE    // Всегда только одна запись в слот
    }
}



