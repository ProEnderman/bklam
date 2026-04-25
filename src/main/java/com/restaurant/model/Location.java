package com.restaurant.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Location (point of sale / branch). Replaces restaurant in the new hierarchy.
 * legacy_restaurant_id links to restaurants.id for backward compatibility.
 */
@Entity
@Table(name = "locations")
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class Location {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "holding_id", nullable = false)
    private Holding holding;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "brand_id")
    private Brand brand;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "legal_entity_id")
    private LegalEntity legalEntity;

    @Column(nullable = false, length = 255)
    private String name;

    /** Backward compatibility: maps to restaurants.id. */
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "legacy_restaurant_id", unique = true)
    private Restaurant legacyRestaurant;

    @Column(name = "qr_token_expires_at")
    private LocalDateTime qrTokenExpiresAt;

    @Column(name = "telegram_bot_token", length = 255)
    private String telegramBotToken;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
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

    /** Legacy restaurant id for backward compatibility. */
    public Long getLegacyRestaurantId() {
        return legacyRestaurant != null ? legacyRestaurant.getId() : null;
    }
}
