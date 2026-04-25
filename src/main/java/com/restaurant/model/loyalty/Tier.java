package com.restaurant.model.loyalty;

import com.restaurant.model.Restaurant;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "loyalty_tiers")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Tier {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "restaurant_id", nullable = false)
    private Restaurant restaurant;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    private Integer level = 0;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal threshold = BigDecimal.ZERO;

    @Column(name = "cashback_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal cashbackPercent = BigDecimal.ZERO;

    @Column(columnDefinition = "jsonb")
    @JdbcTypeCode(SqlTypes.JSON)
    private String benefits = "{}";

    @Column(name = "valid_from")
    private LocalDateTime validFrom;

    @Column(name = "valid_to")
    private LocalDateTime validTo;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }

    public Long getRestaurantId() {
        return restaurant != null ? restaurant.getId() : null;
    }
}
