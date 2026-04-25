package com.restaurant.model.loyalty;

import com.restaurant.model.Restaurant;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "loyalty_guests",
       uniqueConstraints = @UniqueConstraint(columnNames = {"restaurant_id", "phone_normalized"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Guest {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "restaurant_id", nullable = false)
    private Restaurant restaurant;

    @Column(name = "phone_normalized", nullable = false, length = 20)
    private String phoneNormalized;

    @Column(length = 255)
    private String name;

    @Column(length = 255)
    private String email;

    @Column
    private LocalDate birthday;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "consent_flags", columnDefinition = "jsonb")
    private String consentFlags = "{}";

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

    public Long getRestaurantId() {
        return restaurant != null ? restaurant.getId() : null;
    }
}
