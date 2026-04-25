package com.restaurant.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "loyalty_order_accruals")
@IdClass(LoyaltyOrderAccrualId.class)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class LoyaltyOrderAccrual {

    @Id
    @Column(name = "restaurant_id", nullable = false)
    private Long restaurantId;

    @Id
    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Column(name = "status", nullable = false)
    private String status = "IN_PROGRESS";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (updatedAt == null) {
            updatedAt = Instant.now();
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }

    public static final String STATUS_IN_PROGRESS = "IN_PROGRESS";
    public static final String STATUS_PROCESSED = "PROCESSED";
}
