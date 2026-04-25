package com.restaurant.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "booking_notifications")
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class BookingNotification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "booking_id", nullable = false)
    private Booking booking;

    @Enumerated(EnumType.STRING)
    @Column(name = "notification_type", nullable = false, length = 20)
    private NotificationType notificationType;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private NotificationStatus status = NotificationStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private NotificationResponse response;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    @Column(name = "resolved_by", length = 100)
    private String resolvedBy;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    // Convenience getter
    public Long getBookingId() {
        return booking != null ? booking.getId() : null;
    }

    public enum NotificationType {
        REMINDER,   // За день до — «уточните у клиента»
        OVERDUE,    // 20 мин после окончания последней брони — «клиент не оплатил»
        GAP         // Пробел >15 мин между бронями при отсутствии поминутного тарифа
    }

    public enum NotificationStatus {
        PENDING,    // Ожидает реакции
        RESOLVED    // Обработано
    }

    public enum NotificationResponse {
        // Ответы на REMINDER
        CONFIRMED,          // Бронь подтверждена
        CANCELLED,          // Бронь отменена

        // Ответы на OVERDUE
        CONTINUES,          // Клиент продолжает пользоваться
        PAID_OR_CANCELLED   // Оплачена или отменена
    }
}
