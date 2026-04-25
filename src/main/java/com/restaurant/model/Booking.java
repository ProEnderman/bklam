package com.restaurant.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "bookings")
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "branch"})
public class Booking {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "organization_id")
    private Long organizationId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "branch_id", nullable = false)
    private Restaurant branch; // Филиал/ресторан
    
    // Геттер для ID филиала (для JSON сериализации)
    public Long getBranchId() {
        return branch != null ? branch.getId() : null;
    }
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "activity_id", nullable = false)
    private Activity activity; // Мероприятие
    
    // Геттер для ID мероприятия (для JSON сериализации)
    public Long getActivityId() {
        return activity != null ? activity.getId() : null;
    }
    
    // Сеттер для activityId (для JSON десериализации из фронтенда)
    public void setActivityId(Long activityId) {
        if (activityId != null) {
            if (this.activity == null) {
                this.activity = new Activity();
            }
            this.activity.setId(activityId);
        }
    }
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resource_id")
    private Resource resource; // Опционально, если requires_resource = true
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    private User customer; // Опционально, если клиент зарегистрирован
    
    @Column(name = "customer_name")
    private String customerName; // Имя клиента
    
    @Column(name = "customer_phone")
    private String customerPhone; // Телефон клиента
    
    @NotNull
    @Column(name = "start_at", nullable = false)
    private LocalDateTime startAt; // Время начала
    
    @NotNull
    @Column(name = "end_at", nullable = false)
    private LocalDateTime endAt; // Время окончания
    
    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BookingStatus status = BookingStatus.DRAFT;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pricing_run_id")
    private PricingRun pricingRun; // Ссылка на рассчитанную цену
    
    @Column(name = "total_amount", precision = 10, scale = 2)
    private BigDecimal totalAmount; // Итоговая сумма (кэш из pricing_run)
    
    @Column(columnDefinition = "TEXT")
    private String notes; // Дополнительные заметки
    
    @Column(name = "created_by")
    private String createdBy; // Кто создал
    
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    
    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;
    
    @Column(name = "completed_at")
    private LocalDateTime completedAt;
    
    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    /** Заказ бронирований (группа). При удалении заказа связь обнуляется, бронирования остаются. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "booking_order_id")
    private BookingOrder bookingOrder;

    public Long getBookingOrderId() {
        if (bookingOrder != null) return bookingOrder.getId();
        return bookingOrderId;
    }

    /** Для приёма bookingOrderId из JSON при создании; в БД хранится связь bookingOrder. */
    @Transient
    private Long bookingOrderId;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
    
    public enum BookingStatus {
        DRAFT,      // Черновик
        CONFIRMED,  // Подтверждено
        CANCELLED,  // Отменено
        COMPLETED,  // Завершено
        PAID        // Оплачено
    }
}



